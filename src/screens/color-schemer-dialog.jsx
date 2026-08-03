/**
 * Color Schemer (v1.103.0): five lockable swatch slots driven by classic
 * color-theory harmonies (base color + harmony + spread/saturation/
 * lightness sliders), tasteful randomize, extraction from the current
 * document or a media-library image, a live design preview, and named
 * swatch sets saved site-wide (they appear in every color picker and in
 * backups). Optionally overwrites a brand kit's colors.
 */

import { useReducer, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import {
	ColorPopover,
	SwatchButton,
	anchoredPopoverStyle,
} from '../components/color-popover';
import { listMediaPage, request } from '../lib/api';
import {
	HARMONIES,
	buildScheme,
	labelColorFor,
	randomSchemeInput,
	schemeRoles,
} from '../lib/color-scheme';
import { extractPalette } from '../lib/palette';
import { loadImage } from '../store/document';
import { renderToCanvas, sharedImageCache, createCanvas } from '../lib/raster';

const SLOT_COUNT = 5;

const harmonyLabel = ( h ) =>
	( {
		analogous: __( 'Analogous', 'wunderpaint' ),
		complementary: __( 'Complementary', 'wunderpaint' ),
		split: __( 'Split complementary', 'wunderpaint' ),
		triadic: __( 'Triadic', 'wunderpaint' ),
		tetradic: __( 'Tetradic', 'wunderpaint' ),
		mono: __( 'Monochromatic', 'wunderpaint' ),
		shades: __( 'Shades & tints', 'wunderpaint' ),
	} )[ h ] || h;

export function ColorSchemerDialog( { onClose, extras } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state } = editor;

	const [ params, setParams ] = useState( () => ( {
		base: state.fgColor || '#3b66ff',
		harmony: 'analogous',
		spread: 50,
		saturation: 0,
		lightness: 0,
	} ) );
	const [ slots, setSlots ] = useState( () =>
		buildScheme( {
			base: state.fgColor || '#3b66ff',
			harmony: 'analogous',
		} ).map( ( color ) => ( { color, locked: false } ) )
	);
	const [ name, setName ] = useState( '' );
	const [ busy, setBusy ] = useState( false );
	const [ pickerOpen, setPickerOpen ] = useState( false );
	// Editor color popover per swatch slot: { i, style } | null.
	const [ pickSlot, setPickSlot ] = useState( null );
	const [ media, setMedia ] = useState( {
		items: [],
		page: 0,
		hasMore: true,
		loading: false,
	} );
	const [ confirmDelete, setConfirmDelete ] = useState( null ); // set id
	const [ kitId, setKitId ] = useState( '' );
	const [ confirmKit, setConfirmKit ] = useState( false );

	const [ , bump ] = useReducer( ( x ) => x + 1, 0 );
	const sets = window.WPIE?.palettes || [];
	const kits = ( window.WPIE?.brandKits || [] ).filter( ( k ) => k?.name );
	const canKits = !! window.WPIE?.canManageKits && kits.length > 0;

	/* -------------------------- scheme updates ------------------------- */

	// Controls rebuild the unlocked slots explicitly (no effect): manual
	// slot edits and image extractions must never be clobbered by renders.
	const applyParams = ( patch ) => {
		const next = { ...params, ...patch };
		setParams( next );
		const scheme = buildScheme( next );
		setSlots( ( prev ) =>
			prev.map( ( s, i ) =>
				s.locked ? s : { ...s, color: scheme[ i ] }
			)
		);
	};

	const randomize = () => applyParams( randomSchemeInput() );

	const setSlotColor = ( i, color ) =>
		// A manual pick is a decision: lock it against slider rebuilds.
		setSlots( ( prev ) =>
			prev.map( ( s, j ) => ( j === i ? { color, locked: true } : s ) )
		);

	const toggleLock = ( i ) =>
		setSlots( ( prev ) =>
			prev.map( ( s, j ) =>
				j === i ? { ...s, locked: ! s.locked } : s
			)
		);

	const fillFromColors = ( colors ) => {
		if ( ! colors.length ) {
			return;
		}
		setParams( ( p ) => ( { ...p, base: colors[ 0 ] } ) );
		setSlots( ( prev ) =>
			prev.map( ( s, i ) =>
				s.locked ? s : { ...s, color: colors[ i % colors.length ] }
			)
		);
	};

	const fromDocument = async () => {
		try {
			const canvas = await renderToCanvas( state.doc, state.layers, {
				scale: Math.min(
					1,
					128 / Math.max( state.doc.w, state.doc.h )
				),
				cache: sharedImageCache,
			} );
			fillFromColors( extractPalette( canvas, SLOT_COUNT ) );
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'Could not read colors from the document.', 'wunderpaint' )
			);
		}
	};

	const fromMediaItem = async ( item ) => {
		try {
			const img = await loadImage( item.url, 'anonymous' );
			const w = img.naturalWidth || img.width;
			const h = img.naturalHeight || img.height;
			const scale = Math.min( 1, 128 / Math.max( w, h ) );
			const canvas = createCanvas( w * scale, h * scale );
			canvas
				.getContext( '2d' )
				.drawImage( img, 0, 0, canvas.width, canvas.height );
			fillFromColors( extractPalette( canvas, SLOT_COUNT ) );
			setPickerOpen( false );
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'Could not read colors from that image.', 'wunderpaint' )
			);
		}
	};

	const loadMedia = () => {
		if ( media.loading || ! media.hasMore ) {
			return;
		}
		setMedia( ( m ) => ( { ...m, loading: true } ) );
		listMediaPage( media.page + 1 )
			.then( ( res ) =>
				setMedia( ( m ) => ( {
					items: [ ...m.items, ...res.items ],
					page: m.page + 1,
					hasMore: res.hasMore,
					loading: false,
				} ) )
			)
			.catch( () =>
				setMedia( ( m ) => ( {
					...m,
					hasMore: false,
					loading: false,
				} ) )
			);
	};

	const openPicker = () => {
		setPickerOpen( ( open ) => ! open );
		if ( ! media.items.length ) {
			loadMedia();
		}
	};

	/* ------------------------------ sets ------------------------------- */

	const saveSets = async ( nextSets, successMsg ) => {
		setBusy( true );
		try {
			const saved = await request( {
				path: '/palettes',
				method: 'POST',
				data: nextSets,
			} );
			window.WPIE.palettes = Array.isArray( saved ) ? saved : nextSets;
			window.dispatchEvent( new CustomEvent( 'wpie:palettes-updated' ) );
			bump();
			if ( successMsg ) {
				extras?.toasts?.success?.( successMsg );
			}
		} catch ( e ) {
			extras?.toasts?.error?.(
				e?.message ||
					__( 'The swatch set could not be saved.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	const addSet = () => {
		const setName2 =
			name.trim() ||
			sprintf(
				/* translators: %d: palette number. */
				__( 'Palette %d', 'wunderpaint' ),
				sets.length + 1
			);
		const colors = slots.map( ( s ) => s.color );
		// Same name = update in place; anything else appends.
		const existing = sets.findIndex( ( s ) => s.name === setName2 );
		const entry = {
			id: existing >= 0 ? sets[ existing ].id : '',
			name: setName2,
			colors,
		};
		const next =
			existing >= 0
				? sets.map( ( s, i ) => ( i === existing ? entry : s ) )
				: [ ...sets, entry ];
		saveSets(
			next,
			__(
				'Swatch set saved. It now shows up in every color picker.',
				'wunderpaint'
			)
		);
		setName( setName2 );
	};

	const loadSet = ( set ) => {
		setName( set.name );
		setSlots( ( prev ) =>
			prev.map( ( s, i ) => ( {
				color: set.colors[ i % set.colors.length ],
				locked: false,
			} ) )
		);
		setParams( ( p ) => ( { ...p, base: set.colors[ 0 ] } ) );
	};

	const deleteSet = ( set ) => {
		if ( confirmDelete !== set.id ) {
			setConfirmDelete( set.id );
			return;
		}
		setConfirmDelete( null );
		saveSets(
			sets.filter( ( s ) => s.id !== set.id ),
			__( 'Swatch set deleted.', 'wunderpaint' )
		);
	};

	const applyToKit = async () => {
		const kit = kits.find( ( k ) => k.id === kitId ) || kits[ 0 ];
		if ( ! kit ) {
			return;
		}
		if ( ! confirmKit ) {
			setConfirmKit( true );
			return;
		}
		setConfirmKit( false );
		setBusy( true );
		try {
			const nextKits = ( window.WPIE?.brandKits || [] ).map( ( k ) =>
				k.id === kit.id
					? { ...k, colors: slots.map( ( s ) => s.color ) }
					: k
			);
			const res = await request( {
				path: '/brand-kits',
				method: 'POST',
				data: { kits: nextKits },
			} );
			const saved = res?.kits || nextKits;
			window.WPIE.brandKits = saved;
			window.WPIE.brand = saved[ 0 ] || window.WPIE.brand;
			window.dispatchEvent(
				new CustomEvent( 'wpie:brand-kits-updated' )
			);
			extras?.toasts?.success?.(
				sprintf(
					/* translators: %s: brand kit name. */
					__(
						'Colors applied to the Brand Kit "%s".',
						'wunderpaint'
					),
					kit.name
				)
			);
		} catch ( e ) {
			extras?.toasts?.error?.(
				e?.message ||
					__( 'The Brand Kit could not be updated.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	/* ----------------------------- render ------------------------------ */

	const roles = schemeRoles( slots.map( ( s ) => s.color ) );
	const sliderRow = ( label, key, min, max ) => (
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			<span className="dsm-label">
				{ label } { params[ key ] > 0 && 'spread' !== key ? '+' : '' }
				{ params[ key ] }
			</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ params[ key ] }
				onChange={ ( e ) =>
					applyParams( { [ key ]: +e.target.value } )
				}
			/>
		</label>
	);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 'min(720px, 94vw)',
					height: 'auto',
					maxHeight: '90vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Color Schemer', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Color Schemer', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Build a scheme with color theory, from an image, or by chance.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div
					style={ {
						padding: 16,
						display: 'grid',
						gap: 14,
						overflowY: 'auto',
						alignContent: 'start',
					} }
				>
					{ /* Swatch slots */ }
					<div style={ { display: 'flex', gap: 8, height: 112 } }>
						{ slots.map( ( slot, i ) => (
							<div
								key={ i }
								style={ {
									flex: 1,
									position: 'relative',
									borderRadius: 8,
									background: slot.color,
									border: '1px solid var(--ed-border-strong)',
									overflow: 'hidden',
								} }
							>
								<button
									type="button"
									aria-label={ sprintf(
										/* translators: %d: slot number. */
										__( 'Slot %d color', 'wunderpaint' ),
										i + 1
									) }
									onClick={ ( e ) => {
										const rect =
											e.currentTarget.getBoundingClientRect();
										setPickSlot( ( p ) =>
											p?.i === i
												? null
												: {
														i,
														style: anchoredPopoverStyle(
															rect
														),
												  }
										);
									} }
									style={ {
										position: 'absolute',
										inset: 0,
										width: '100%',
										height: '100%',
										opacity: 0,
										cursor: 'pointer',
									} }
								/>
								{ pickSlot?.i === i && (
									<ColorPopover
										color={ slot.color }
										onChange={ ( v ) =>
											setSlotColor( i, v.slice( 0, 7 ) )
										}
										onClose={ () => setPickSlot( null ) }
										style={ pickSlot.style }
									/>
								) }
								<button
									type="button"
									onClick={ () => toggleLock( i ) }
									title={
										slot.locked
											? __( 'Unlock slot', 'wunderpaint' )
											: __(
													'Lock slot (kept on randomize and sliders)',
													'wunderpaint'
											  )
									}
									style={ {
										position: 'absolute',
										top: 6,
										right: 6,
										width: 24,
										height: 24,
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'center',
										border: 'none',
										borderRadius: 5,
										cursor: 'pointer',
										background: slot.locked
											? 'rgba(0,0,0,.35)'
											: 'transparent',
										color: labelColorFor( slot.color ),
										opacity: slot.locked ? 1 : 0.55,
									} }
								>
									{ ( slot.locked ? I.lock : I.unlock )( {
										size: 13,
									} ) }
								</button>
								<span
									style={ {
										position: 'absolute',
										left: 0,
										right: 0,
										bottom: 6,
										textAlign: 'center',
										fontSize: 11,
										fontFamily: 'var(--font-mono)',
										color: labelColorFor( slot.color ),
										pointerEvents: 'none',
										textTransform: 'uppercase',
									} }
								>
									{ slot.color }
								</span>
							</div>
						) ) }
					</div>

					{ /* Harmony controls */ }
					<div
						style={ {
							display: 'flex',
							gap: 10,
							alignItems: 'end',
							flexWrap: 'wrap',
						} }
					>
						<label
							style={ {
								display: 'grid',
								gap: 4,
								fontSize: 12,
								flex: 1,
								minWidth: 160,
							} }
						>
							<span className="dsm-label">
								{ __( 'Harmony', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								style={ { width: '100%' } }
								value={ params.harmony }
								onChange={ ( e ) =>
									applyParams( { harmony: e.target.value } )
								}
							>
								{ HARMONIES.map( ( h ) => (
									<option key={ h } value={ h }>
										{ harmonyLabel( h ) }
									</option>
								) ) }
							</select>
						</label>
						<div
							style={ { display: 'grid', gap: 4, fontSize: 12 } }
						>
							<span className="dsm-label">
								{ __( 'Base color', 'wunderpaint' ) }
							</span>
							<SwatchButton
								color={ params.base }
								size={ 26 }
								title={ __( 'Base color', 'wunderpaint' ) }
								onChange={ ( v ) =>
									applyParams( { base: v.slice( 0, 7 ) } )
								}
							/>
						</div>
						<button
							className="ai-btn secondary"
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
							onClick={ randomize }
						>
							{ I.rotateCw( { size: 13 } ) }
							{ __( 'Randomize', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn secondary"
							disabled={ ! state.layers.length }
							onClick={ fromDocument }
						>
							{ __( 'From document', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn secondary"
							onClick={ openPicker }
						>
							{ __( 'From image…', 'wunderpaint' ) }
						</button>
					</div>

					{ pickerOpen && (
						<div
							style={ {
								maxHeight: 170,
								overflowY: 'auto',
								border: '1px solid var(--ed-border-strong)',
								borderRadius: 6,
								padding: 8,
								display: 'grid',
								gridTemplateColumns:
									'repeat(auto-fill, minmax(72px, 1fr))',
								gap: 6,
							} }
						>
							{ media.items.map( ( m ) => (
								<button
									key={ m.id }
									type="button"
									onClick={ () => fromMediaItem( m ) }
									title={ m.title }
									style={ {
										padding: 0,
										border: '1px solid var(--ed-border-strong)',
										borderRadius: 5,
										overflow: 'hidden',
										cursor: 'pointer',
										aspectRatio: '1',
										background: 'var(--ed-panel-alt)',
									} }
								>
									<img
										src={ m.url }
										alt={ m.alt }
										loading="lazy"
										style={ {
											width: '100%',
											height: '100%',
											objectFit: 'cover',
											display: 'block',
										} }
									/>
								</button>
							) ) }
							{ media.hasMore && (
								<button
									type="button"
									className="ai-btn secondary"
									style={ { aspectRatio: '1' } }
									disabled={ media.loading }
									onClick={ loadMedia }
								>
									{ media.loading
										? __( 'Loading…', 'wunderpaint' )
										: __( 'More…', 'wunderpaint' ) }
								</button>
							) }
						</div>
					) }

					{ /* Sliders */ }
					<div
						style={ {
							display: 'grid',
							gridTemplateColumns: '1fr 1fr 1fr',
							gap: 12,
						} }
					>
						{ sliderRow(
							__( 'Saturation', 'wunderpaint' ),
							'saturation',
							-100,
							100
						) }
						{ sliderRow(
							__( 'Lightness', 'wunderpaint' ),
							'lightness',
							-100,
							100
						) }
						{ sliderRow(
							__( 'Spread', 'wunderpaint' ),
							'spread',
							0,
							100
						) }
					</div>

					{ /* Live preview */ }
					<div
						style={ {
							borderRadius: 8,
							border: '1px solid var(--ed-border-strong)',
							background: roles.bg,
							padding: '18px 20px',
							display: 'flex',
							gap: 16,
							alignItems: 'center',
						} }
					>
						<div
							style={ {
								flex: 1,
								background: roles.surface,
								borderRadius: 8,
								padding: '14px 16px',
								display: 'grid',
								gap: 8,
							} }
						>
							<div
								style={ {
									fontSize: 16,
									fontWeight: 700,
									color: roles.text,
								} }
							>
								{ __( 'Design preview', 'wunderpaint' ) }
							</div>
							<div
								style={ {
									fontSize: 12,
									color: roles.text,
									opacity: 0.75,
								} }
							>
								{ __(
									'How the scheme feels as background, card, text and buttons.',
									'wunderpaint'
								) }
							</div>
							<div
								style={ {
									display: 'flex',
									gap: 8,
									marginTop: 4,
								} }
							>
								<span
									style={ {
										background: roles.primary,
										color: labelColorFor( roles.primary ),
										borderRadius: 5,
										padding: '5px 12px',
										fontSize: 12,
										fontWeight: 600,
									} }
								>
									{ __( 'Primary', 'wunderpaint' ) }
								</span>
								<span
									style={ {
										background: roles.secondary,
										color: labelColorFor( roles.secondary ),
										borderRadius: 5,
										padding: '5px 12px',
										fontSize: 12,
									} }
								>
									{ __( 'Secondary', 'wunderpaint' ) }
								</span>
							</div>
						</div>
					</div>

					{ /* Save + kit */ }
					<div
						style={ {
							display: 'flex',
							gap: 8,
							alignItems: 'center',
							flexWrap: 'wrap',
						} }
					>
						<input
							type="text"
							placeholder={ __(
								'Swatch set name',
								'wunderpaint'
							) }
							value={ name }
							onChange={ ( e ) => setName( e.target.value ) }
							style={ {
								flex: 1,
								minWidth: 160,
								padding: '6px 8px',
								border: '1px solid var(--ed-border-strong)',
								borderRadius: 4,
								background: 'var(--ed-panel-alt)',
								color: 'var(--ed-text)',
								fontSize: 12,
							} }
						/>
						<button
							className="ai-btn primary"
							disabled={ busy }
							onClick={ addSet }
						>
							{ sets.some( ( s ) => s.name === name.trim() )
								? __( 'Update swatch set', 'wunderpaint' )
								: __( 'Add swatch set', 'wunderpaint' ) }
						</button>
						{ canKits && (
							<div
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								<select
									className="dsm-select"
									value={ kitId || kits[ 0 ]?.id || '' }
									onChange={ ( e ) => {
										setKitId( e.target.value );
										setConfirmKit( false );
									} }
								>
									{ kits.map( ( k ) => (
										<option key={ k.id } value={ k.id }>
											{ k.name }
										</option>
									) ) }
								</select>
								<button
									className={
										'ai-btn secondary' +
										( confirmKit ? ' danger' : '' )
									}
									disabled={ busy }
									onClick={ applyToKit }
								>
									{ confirmKit
										? __(
												'Really overwrite the kit colors?',
												'wunderpaint'
										  )
										: __(
												'Apply to Brand Kit',
												'wunderpaint'
										  ) }
								</button>
							</div>
						) }
					</div>

					{ /* Saved sets */ }
					{ sets.length > 0 && (
						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Saved swatch sets', 'wunderpaint' ) }
							</span>
							{ sets.map( ( set ) => (
								<div
									key={ set.id }
									style={ {
										display: 'flex',
										gap: 10,
										alignItems: 'center',
										padding: '6px 8px',
										border: '1px solid var(--ed-border-strong)',
										borderRadius: 6,
									} }
								>
									<div style={ { display: 'flex', gap: 3 } }>
										{ set.colors
											.slice( 0, 6 )
											.map( ( c, ci ) => (
												<span
													key={ ci }
													style={ {
														width: 18,
														height: 18,
														borderRadius: 4,
														background: c,
														border: '1px solid var(--ed-border-strong)',
													} }
												/>
											) ) }
									</div>
									<span
										style={ {
											flex: 1,
											fontSize: 12,
											overflow: 'hidden',
											textOverflow: 'ellipsis',
											whiteSpace: 'nowrap',
										} }
									>
										{ set.name }
									</span>
									<button
										className="ai-btn secondary"
										style={ {
											padding: '3px 10px',
											fontSize: 11,
										} }
										onClick={ () => loadSet( set ) }
									>
										{ __( 'Load', 'wunderpaint' ) }
									</button>
									<button
										className="ai-btn secondary"
										style={ {
											padding: '3px 10px',
											fontSize: 11,
											color:
												confirmDelete === set.id
													? '#e5484d'
													: undefined,
										} }
										disabled={ busy }
										onClick={ () => deleteSet( set ) }
									>
										{ confirmDelete === set.id
											? __(
													'Really delete?',
													'wunderpaint'
											  )
											: __( 'Delete', 'wunderpaint' ) }
									</button>
								</div>
							) ) }
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
