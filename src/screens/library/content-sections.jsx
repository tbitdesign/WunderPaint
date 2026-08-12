/**
 * The sections over the bundled content: elements, text combinations,
 * backgrounds, icons, emoji, patterns and brand kits.
 *
 * Split out of library-dialog.jsx in v1.344.0, which had grown to 2828 lines
 * over thirteen sections that share no state - the shell keeps two pieces of
 * state and renders one section at a time.
 */

import { useState, useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { makeShape, makeGradient } from '../../store/document';
import { promptDialog } from '../../lib/dialogs';
import {
	createCanvas,
	registerUserTile,
	renderToCanvas,
	sharedImageCache,
} from '../../lib/raster';
import { ensureFontsForLayers } from '../../lib/font-manager';
import {
	useCombos,
	useElements,
	useGradients,
} from '../../content/use-content';
import { scalePathD as scaleElementPath } from '../../lib/path';
import {
	listPatterns,
	savePattern,
	deletePattern,
	ensurePatterns,
	onPatternsChange,
	PATTERN_CAP,
} from '../../lib/user-patterns';
import { comboToLayers } from '../../lib/content-io';
import { insertAsset } from '../../lib/asset-insert';
import { labelTiles } from '../../lib/eu-ai-labels';
import { useUserItems, removeUserItem } from '../../lib/user-content';
import * as Ops from '../../store/ops';

/** Emoji and icon grids page in this many tiles at a time. */
const PAGE = 168;

/* ------------------------------- elements ------------------------------ */

const elementPreviewCache = new Map();

export function ElementTile( { item, onInsert } ) {
	const [ url, setUrl ] = useState(
		() => elementPreviewCache.get( item.name ) || null
	);
	useEffect( () => {
		if ( url ) {
			return;
		}
		let cancelled = false;
		const layer = makeShape( {
			x: 4,
			y: 4,
			w: 56,
			h: 56,
			fill: '#8a93a6',
			shape: item.shape || 'rect',
			sides: item.sides,
			...( item.pathD
				? { pathD: scaleElementPath( item.pathD, 0.56, 0.56 ) }
				: {} ),
		} );
		renderToCanvas(
			{ id: 'el', w: 64, h: 64, bg: 'transparent' },
			[ layer ],
			{ cache: sharedImageCache }
		)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL();
					elementPreviewCache.set( item.name, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ item.name ] );
	return (
		<button title={ item.name } onClick={ onInsert }>
			{ url ? <img src={ url } alt="" /> : <span className="spin" /> }
		</button>
	);
}

export function ElementsSection( { editor, extras, onClose } ) {
	const ELEMENT_SETS = useElements();
	const mine = useUserItems( 'element' );
	const insert = async ( item ) => {
		if (
			false !==
			( await insertAsset( editor, extras, {
				kind: 'element',
				name: item.name,
			} ) )
		) {
			onClose();
		}
	};
	return (
		<div className="library-content">
			{ mine.length > 0 && (
				<div>
					<div className="library-subhead">
						{ __(
							'My shapes (Alt-click to remove)',
							'wunderpaint'
						) }
					</div>
					<div className="icon-grid element-grid">
						{ mine.map( ( d ) => (
							<ElementTile
								key={ d.id }
								item={ d }
								onInsert={ ( e ) =>
									e && e.altKey
										? removeUserItem( 'element', d.id )
										: insert( d )
								}
							/>
						) ) }
					</div>
				</div>
			) }
			{ ELEMENT_SETS.map( ( set ) => (
				<div key={ set.id }>
					<div className="library-subhead">{ set.label }</div>
					<div className="icon-grid element-grid">
						{ set.items.map( ( item ) => (
							<ElementTile
								key={ item.name }
								item={ item }
								onInsert={ () => insert( item ) }
							/>
						) ) }
					</div>
				</div>
			) ) }
		</div>
	);
}

/* ------------------------------ text combos ---------------------------- */

const comboPreviewCache = new Map();

export function TextComboTile( { combo, onInsert } ) {
	const [ url, setUrl ] = useState(
		() => comboPreviewCache.get( combo.id ) || null
	);
	useEffect( () => {
		if ( url ) {
			return;
		}
		let cancelled = false;
		const doc = { id: 'combo', w: 480, h: 360, bg: '#f6f4ef' };
		const layers = combo.build( doc, {} );
		ensureFontsForLayers( layers )
			.then( () =>
				renderToCanvas( doc, layers, {
					scale: 0.5,
					cache: sharedImageCache,
				} )
			)
			.then( ( canvas ) => {
				if ( ! cancelled && canvas.toDataURL ) {
					const dataUrl = canvas.toDataURL();
					comboPreviewCache.set( combo.id, dataUrl );
					setUrl( dataUrl );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ combo.id ] );
	return (
		<button
			className="library-tpl-open combo-tile"
			title={ combo.label }
			onClick={ onInsert }
		>
			{ url ? <img src={ url } alt="" /> : <span className="spin" /> }
			<span className="library-tpl-name">{ combo.label }</span>
		</button>
	);
}

export function TextCombosSection( { editor, category, onClose } ) {
	const all = useCombos();
	const TEXT_COMBOS = all.filter(
		( c ) => ( c.category || 'headlines' ) === category
	);
	const mine = useUserItems( 'combo' ).map( ( d ) => ( {
		id: d.id,
		label: d.label || __( 'Text', 'wunderpaint' ),
		build: ( doc ) => comboToLayers( d, doc ),
	} ) );
	return (
		<div className="library-content">
			{ mine.length > 0 && (
				<>
					<div className="library-subhead">
						{ __( 'My text (Alt-click to remove)', 'wunderpaint' ) }
					</div>
					<div className="library-tpl-grid">
						{ mine.map( ( combo ) => (
							<TextComboTile
								key={ combo.id }
								combo={ combo }
								onInsert={ ( e ) => {
									if ( e && e.altKey ) {
										removeUserItem( 'combo', combo.id );
										return;
									}
									Ops.insertTextComboOp( editor, combo );
									onClose();
								} }
							/>
						) ) }
					</div>
				</>
			) }
			<div className="library-subhead">
				{ __(
					'Styled text groups, insert, then edit each line.',
					'wunderpaint'
				) }
			</div>
			<div className="library-tpl-grid">
				{ TEXT_COMBOS.map( ( combo ) => (
					<TextComboTile
						key={ combo.id }
						combo={ combo }
						onInsert={ () => {
							Ops.insertTextComboOp( editor, combo );
							onClose();
						} }
					/>
				) ) }
			</div>
		</div>
	);
}

/* ------------------------------ backgrounds ---------------------------- */

const bgSwatchStyle = ( d ) => {
	if ( 'solid' === d.kind ) {
		return d.color;
	}
	const stops = ( d.stops || [] )
		.map( ( s ) => `${ s.color } ${ Math.round( s.at * 100 ) }%` )
		.join( ', ' );
	return 'radial' === d.kind
		? `radial-gradient(circle, ${ stops })`
		: `linear-gradient(135deg, ${ stops })`;
};

export function BackgroundsSection( { editor, onClose } ) {
	const GRADIENT_PRESETS = useGradients();
	const mine = useUserItems( 'background' );
	const { state, dispatch, commit } = editor;
	const full = { x: 0, y: 0, w: state.doc.w, h: state.doc.h };
	const insertBottom = ( layer, label ) => {
		layer.name = __( 'Background', 'wunderpaint' );
		dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
		commit( label );
		onClose();
	};
	const brand = editor.WPIE?.brand?.colors || [];
	const solids = [
		...new Set( [
			...brand,
			state.fgColor,
			state.bgColor,
			'#ffffff',
			'#1a1d21',
			'#f6f1e7',
			'#eef2f7',
		] ),
	].filter( Boolean );
	return (
		<div className="library-content">
			{ mine.length > 0 && (
				<>
					<div className="library-subhead">
						{ __(
							'My backgrounds (Alt-click to remove)',
							'wunderpaint'
						) }
					</div>
					<div className="bg-grid">
						{ mine.map( ( d ) => (
							<button
								key={ d.id }
								title={ d.name }
								style={ { background: bgSwatchStyle( d ) } }
								onClick={ ( e ) =>
									e && e.altKey
										? removeUserItem( 'background', d.id )
										: insertBottom(
												'solid' === d.kind
													? makeShape( {
															...full,
															fill: d.color,
													  } )
													: makeGradient( {
															...full,
															kind:
																d.kind ||
																'linear',
															stops: (
																d.stops || []
															).map( ( s ) => ( {
																...s,
															} ) ),
															from: {
																x: 0,
																y: 0,
															},
															to: {
																x: state.doc.w,
																y: state.doc.h,
															},
													  } ),
												__(
													'Background',
													'wunderpaint'
												)
										  )
								}
							/>
						) ) }
					</div>
				</>
			) }
			<div className="library-subhead">
				{ __( 'Gradients', 'wunderpaint' ) }
			</div>
			<div className="bg-grid">
				{ GRADIENT_PRESETS.map( ( preset ) => (
					<button
						key={ preset.name }
						title={ preset.name }
						style={ {
							background: `linear-gradient(135deg, ${ preset.stops
								.map(
									( s ) =>
										`${ s.color } ${ Math.round(
											s.at * 100
										) }%`
								)
								.join( ', ' ) })`,
						} }
						onClick={ () =>
							insertBottom(
								makeGradient( {
									...full,
									kind: preset.kind || 'linear',
									stops: preset.stops.map( ( s ) => ( {
										...s,
									} ) ),
									from: { x: 0, y: 0 },
									to: { x: state.doc.w, y: state.doc.h },
								} ),
								__( 'Background gradient', 'wunderpaint' )
							)
						}
					/>
				) ) }
			</div>
			<div className="library-subhead">
				{ __( 'Patterns', 'wunderpaint' ) }
			</div>
			<div className="bg-grid">
				{ [
					'dots',
					'stripes',
					'checker',
					'grid',
					'diagonal',
					'crosshatch',
					'zigzag',
					'waves',
					'bricks',
					'plus',
					'triangles',
					'scales',
				].map( ( kind ) => (
					<button
						key={ kind }
						title={ kind }
						className="bg-pattern-tile"
						onClick={ () =>
							insertBottom(
								makeShape( {
									...full,
									fill: state.fgColor || '#1a1d21',
									pattern: kind,
								} ),
								__( 'Background pattern', 'wunderpaint' )
							)
						}
					>
						{ kind }
					</button>
				) ) }
			</div>
			<div className="library-subhead">
				{ __( 'Solid colors', 'wunderpaint' ) }
			</div>
			<div className="bg-grid">
				{ solids.map( ( color ) => (
					<button
						key={ color }
						title={ color }
						style={ { background: color } }
						onClick={ () =>
							insertBottom(
								makeShape( { ...full, fill: color } ),
								__( 'Background color', 'wunderpaint' )
							)
						}
					/>
				) ) }
			</div>
		</div>
	);
}

/* -------------------------------- icons -------------------------------- */

export function IconsSection( { editor, extras, onClose } ) {
	const [ icons, setIcons ] = useState( null );
	const [ query, setQuery ] = useState( '' );
	const [ limit, setLimit ] = useState( PAGE );
	const inputRef = useRef( null );

	useEffect( () => {
		import(
			/* webpackChunkName: "icons-lib" */ '../../icons-lib/tabler.json'
		)
			.then( ( mod ) => {
				setIcons( mod.default || mod );
				inputRef.current?.focus();
			} )
			.catch( () => setIcons( {} ) );
	}, [] );

	const names = icons ? Object.keys( icons ) : [];
	const q = query.trim().toLowerCase();
	const matches = q ? names.filter( ( n ) => n.includes( q ) ) : names;

	// Auto-fill (v1.63.1): grow the limit until the grid overflows the
	// panel, otherwise scrolling never starts on tall monitors.
	const contentRef = useRef( null );
	useEffect( () => {
		const el = contentRef.current;
		if (
			el &&
			matches.length > limit &&
			el.scrollHeight <= el.clientHeight + 40
		) {
			setLimit( ( l ) => l + PAGE * 3 );
		}
	}, [ matches.length, limit ] );

	const insert = async ( name ) => {
		if (
			false !==
			( await insertAsset( editor, extras, {
				kind: 'icon',
				name,
			} ) )
		) {
			onClose();
		}
	};

	return (
		<div
			className="library-content"
			ref={ contentRef }
			onScroll={ ( e ) => {
				const el = e.currentTarget;
				if (
					matches.length > limit &&
					el.scrollTop + el.clientHeight > el.scrollHeight - 400
				) {
					setLimit( limit + PAGE * 3 );
				}
			} }
		>
			<div className="library-toolbar">
				<input
					ref={ inputRef }
					type="search"
					placeholder={ __( 'Search icons…', 'wunderpaint' ) }
					value={ query }
					onChange={ ( e ) => {
						setQuery( e.target.value );
						setLimit( PAGE );
					} }
					aria-label={ __( 'Search icons', 'wunderpaint' ) }
				/>
				<span className="stock-count">
					{ icons
						? sprintf(
								/* translators: %d: number of icons. */
								__( '%d icons', 'wunderpaint' ),
								matches.length
						  )
						: __( 'Loading…', 'wunderpaint' ) }
				</span>
			</div>
			<div className="icon-grid">
				{ matches.slice( 0, limit ).map( ( name ) => (
					<button
						key={ name }
						title={ name }
						onClick={ () => insert( name ) }
					>
						<svg
							viewBox="0 0 24 24"
							width="28"
							height="28"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d={ icons[ name ] } />
						</svg>
					</button>
				) ) }
			</div>
			{ matches.length > limit && (
				<div className="stock-more">
					<button
						className="button"
						onClick={ () => setLimit( limit + PAGE * 3 ) }
					>
						{ __( 'Show more', 'wunderpaint' ) }
					</button>
				</div>
			) }
			<div className="library-credit">
				{ __( 'Icons: Tabler Icons (MIT license).', 'wunderpaint' ) }
			</div>
		</div>
	);
}

/* -------------------------------- emoji -------------------------------- */

export function EmojiSection( { editor, extras, onClose } ) {
	const [ emoji, setEmoji ] = useState( null );
	const [ query, setQuery ] = useState( '' );
	const [ group, setGroup ] = useState( '' );
	const [ limit, setLimit ] = useState( PAGE );
	const inputRef = useRef( null );

	useEffect( () => {
		import(
			/* webpackChunkName: "emoji-lib" */ '../../icons-lib/emoji.json'
		)
			.then( ( mod ) => {
				setEmoji( mod.default || mod );
				inputRef.current?.focus();
			} )
			.catch( () =>
				extras.toasts.error(
					__( 'The emoji set could not be loaded.', 'wunderpaint' )
				)
			);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const groups = emoji
		? Array.from( new Set( emoji.map( ( e ) => e.g ) ) )
		: [];
	const q = query.trim().toLowerCase();
	const matches = ( emoji || [] ).filter(
		( e ) => ( ! group || e.g === group ) && ( ! q || e.n.includes( q ) )
	);

	// Auto-fill (v1.63.1): grow the limit until the grid overflows.
	const contentRef = useRef( null );
	useEffect( () => {
		const el = contentRef.current;
		if (
			el &&
			matches.length > limit &&
			el.scrollHeight <= el.clientHeight + 40
		) {
			setLimit( ( l ) => l + PAGE * 3 );
		}
	}, [ matches.length, limit ] );

	const insert = async ( item ) => {
		if (
			false !==
			( await insertAsset( editor, extras, {
				kind: 'emoji',
				n: item.n,
				c: item.c,
			} ) )
		) {
			onClose();
		}
	};

	return (
		<div
			className="library-content"
			ref={ contentRef }
			onScroll={ ( e ) => {
				const el = e.currentTarget;
				if (
					matches.length > limit &&
					el.scrollTop + el.clientHeight > el.scrollHeight - 400
				) {
					setLimit( limit + PAGE * 3 );
				}
			} }
		>
			<div className="library-toolbar">
				<input
					ref={ inputRef }
					type="search"
					placeholder={ __( 'Search emoji…', 'wunderpaint' ) }
					value={ query }
					onChange={ ( e ) => {
						setQuery( e.target.value );
						setLimit( PAGE );
					} }
					aria-label={ __( 'Search emoji', 'wunderpaint' ) }
				/>
				<select
					className="dsm-select"
					value={ group }
					onChange={ ( e ) => {
						setGroup( e.target.value );
						setLimit( PAGE );
					} }
					aria-label={ __( 'Category', 'wunderpaint' ) }
				>
					<option value="">
						{ __( 'All categories', 'wunderpaint' ) }
					</option>
					{ groups.map( ( g ) => (
						<option key={ g } value={ g }>
							{ g }
						</option>
					) ) }
				</select>
				<span className="stock-count">
					{ emoji
						? sprintf(
								/* translators: %d: emoji count. */
								__( '%d emoji', 'wunderpaint' ),
								matches.length
						  )
						: __( 'Loading…', 'wunderpaint' ) }
				</span>
			</div>
			<div className="icon-grid emoji-grid">
				{ matches.slice( 0, limit ).map( ( item ) => (
					<button
						key={ item.c }
						title={ item.n }
						aria-label={ item.n }
						onClick={ () => insert( item ) }
					>
						{ item.c }
					</button>
				) ) }
			</div>
			{ matches.length > limit && (
				<div className="stock-more">
					<button
						className="button"
						onClick={ () => setLimit( limit + PAGE * 3 ) }
					>
						{ __( 'Show more', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}

/* ------------------------------- patterns ------------------------------ */

export function PatternsSection( { extras } ) {
	const [ patterns, setPatterns ] = useState( listPatterns );
	// Server-backed since v1.110.0: load once, follow external saves
	// (e.g. File > Save as Pattern, Background Studio).
	useEffect( () => {
		ensurePatterns().then( () => setPatterns( listPatterns() ) );
		return onPatternsChange( () => setPatterns( listPatterns() ) );
	}, [] );

	const upload = () => {
		const input = document.createElement( 'input' );
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async () => {
			const file = input.files?.[ 0 ];
			if ( ! file ) {
				return;
			}
			const name = await promptDialog( {
				title: __( 'Save Pattern', 'wunderpaint' ),
				label: __( 'Name', 'wunderpaint' ),
				defaultValue: file.name.replace( /\.\w+$/, '' ).slice( 0, 24 ),
			} );
			if ( ! name ) {
				return;
			}
			const url = window.URL.createObjectURL( file );
			try {
				const img = new window.Image();
				await new Promise( ( resolve, reject ) => {
					img.onload = resolve;
					img.onerror = reject;
					img.src = url;
				} );
				const scale = Math.min(
					1,
					256 / Math.max( img.naturalWidth, img.naturalHeight )
				);
				const tile = createCanvas(
					Math.max( 1, Math.round( img.naturalWidth * scale ) ),
					Math.max( 1, Math.round( img.naturalHeight * scale ) )
				);
				tile.getContext( '2d' ).drawImage(
					img,
					0,
					0,
					tile.width,
					tile.height
				);
				const dataUrl = tile.toDataURL( 'image/png' );
				await registerUserTile( dataUrl );
				setPatterns( await savePattern( name, dataUrl ) );
			} catch ( e ) {
				extras.toasts.error(
					__( 'Could not read the image.', 'wunderpaint' )
				);
			} finally {
				window.URL.revokeObjectURL( url );
			}
		};
		input.click();
	};

	return (
		<div className="library-content">
			<div className="library-hint">
				{ __(
					'Upload small seamless images, they tile as fills for shapes and the Pattern Overlay layer style. Patterns embed into saved documents.',
					'wunderpaint'
				) }
			</div>
			<div className="library-pattern-grid">
				{ patterns.map( ( p ) => (
					<div key={ p.name } className="library-pattern">
						<div
							className="library-pattern-tile"
							title={ p.name }
							style={ { backgroundImage: `url(${ p.dataUrl })` } }
						/>
						<div className="library-pattern-meta">
							<span>{ p.name }</span>
							<button
								className="wp-modal-close"
								aria-label={ __( 'Delete', 'wunderpaint' ) }
								onClick={ () =>
									deletePattern( p.name ).then( setPatterns )
								}
							>
								{ I.close( { size: 11 } ) }
							</button>
						</div>
					</div>
				) ) }
				{ 0 === patterns.length && (
					<div className="library-hint">
						{ __( 'No patterns yet.', 'wunderpaint' ) }
					</div>
				) }
			</div>
			<div>
				<button
					className="ai-btn primary"
					onClick={ upload }
					disabled={ patterns.length >= PATTERN_CAP }
				>
					{ __( 'Upload pattern…', 'wunderpaint' ) }
				</button>
			</div>
		</div>
	);
}

/* --------------------------------- brand ------------------------------- */

export function BrandSection( { editor, extras, onClose } ) {
	// Every kit with its logo (v1.98.0): one click inserts it as a layer.
	// Colors and fonts live in the pickers already, no need to repeat them.
	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => !! k.logoUrl
	);

	return (
		<div className="library-content">
			{ ! kits.length && (
				<div className="library-hint">
					{ __( 'No Brand Kit has a logo yet.', 'wunderpaint' ) }{ ' ' }
					{ !! window.WPIE?.openBrandKits && (
						<button
							type="button"
							className="ai-btn ghost sm"
							onClick={ () => {
								onClose();
								window.WPIE.openBrandKits();
							} }
						>
							{ __( 'Manage Brand Kits', 'wunderpaint' ) }
						</button>
					) }
				</div>
			) }
			{ kits.map( ( kit ) => (
				<div key={ kit.id }>
					<div className="library-label">{ kit.name }</div>
					<button
						className="library-logo"
						title={ __( 'Insert logo', 'wunderpaint' ) }
						onClick={ () => {
							Ops.insertLogoOp( editor, extras, kit.logoUrl );
							onClose();
						} }
					>
						<img src={ kit.logoUrl } alt="" />
					</button>
				</div>
			) ) }
			{ /* Same list as the tray's Brand Kits strip, from labelTiles(). */ }
			<div className="library-label">
				{ __( 'EU AI labels', 'wunderpaint' ) }
			</div>
			{ labelTiles().map( ( tile ) => (
				<div key={ tile.id }>
					<button
						className="library-logo"
						title={ tile.name }
						style={
							// A white emblem on a white tile is invisible.
							tile.dark ? { background: '#3c4043' } : undefined
						}
						onClick={ () => {
							Ops.insertLogoOp(
								editor,
								extras,
								tile.url,
								__( 'EU AI label', 'wunderpaint' )
							);
							onClose();
						} }
					>
						<img src={ tile.url } alt="" />
					</button>
				</div>
			) ) }
		</div>
	);
}
