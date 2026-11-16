/**
 * Color Schemer (v1.432.0, rebuilt from the v1.103.0 dialog): a palette
 * workbench in three columns like the studios.
 *
 * Left, where a palette comes from and where it is kept: an image from
 * the Media Library Manager, the document, the saved palettes (load,
 * rename, duplicate, drag to reorder, delete with Undo) and the Brand
 * Kits. Middle, the palette as one bar and - the
 * reason this is a dialog and not part of the narrow Color panel - the
 * palette on the user's own design, several variants side by side. Right,
 * the harmonies as cards with their colors, the harmony wheel and the
 * dials. Apply recolors the design in one undo step through the Palette
 * mix engine; As gradient hands the palette to the Color panel's gradient
 * row. Opened from the Color panel, it starts with what the panel showed.
 */

import { useMemo, useRef, useState, useId } from '@wordpress/element';
import { __, _n, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { useColorEditor } from '../components/use-color-editor';
import { ColorField } from '../components/color-field';
import { SnapSlider } from '../components/snap-slider';
import { HelpLink } from './help-dialog';
import { request } from '../lib/api';
import {
	HARMONIES,
	buildScheme,
	mostColorful,
	randomSchemeInput,
} from '../lib/color-scheme';
import { extractPalette } from '../lib/palette';
import { loadImage } from '../store/document';
import { renderToCanvas, sharedImageCache, createCanvas } from '../lib/raster';
import { colorKey, scanColors } from '../lib/color-replace';
import { mappingPatches } from '../lib/color-experiments';
import { schemeVariants } from '../lib/scheme-variants';
import {
	PALETTE_MAX,
	addPalette,
	duplicatePalette,
	moveItem,
	paletteColors,
	paletteText,
	removePalette,
	restorePalette,
	updatePalette,
} from '../lib/palette-library';
import { loadColorPanelSettings } from '../lib/color-panel';
import { schemeGradientColors } from '../lib/color-scales';
import { PaletteBar } from './color-schemer/palette-bar';
import { HarmonyWheel } from './color-schemer/harmony-wheel';
import { LibraryColumn, Strip } from './color-schemer/library-column';
import { DesignVariants } from './color-schemer/design-variants';
import { ColorScales } from './color-schemer/color-scales';
import '../styles/editor/color-schemer.css';

/** The studios' dice with four pips (ICONS.dice), the CI sign for Random. */
const Dice = () => (
	<svg
		viewBox="0 0 24 24"
		width="14"
		height="14"
		fill="none"
		stroke="currentColor"
		strokeWidth="1.8"
		aria-hidden="true"
	>
		<rect x="3" y="3" width="18" height="18" rx="3" />
		<circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
		<circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
		<circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" stroke="none" />
		<circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" stroke="none" />
	</svg>
);

/** Same order as the Color panel's harmony list. */
const HARMONY_ORDER = [
	'shades',
	...HARMONIES.filter( ( h ) => h !== 'shades' ),
];

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

const num = ( value, fallback ) =>
	Number.isFinite( +value ) && value !== null && value !== ''
		? +value
		: fallback;

/**
 * Start from the seed the Color panel hands over (its harmony, or the
 * swatches it showed), else from the panel's last harmony settings.
 */
function initialState( seed, fgColor, pageColors ) {
	let panel = {};
	try {
		panel = loadColorPanelSettings();
	} catch ( e ) {}
	// Opened from the menu, a design's own accent is a better start than
	// whatever the foreground color happens to be.
	const base =
		colorKey( seed?.base )?.key ||
		mostColorful( pageColors ) ||
		colorKey( fgColor )?.key ||
		panel.harmonyBase ||
		'#3b66ff';
	let harmony = 'analogous';
	if ( HARMONIES.includes( seed?.harmony ) ) {
		harmony = seed.harmony;
	} else if ( HARMONIES.includes( panel.harmony ) ) {
		harmony = panel.harmony;
	}
	const params = {
		base,
		harmony,
		spread: num( seed?.spread ?? panel.harmonySpread, 50 ),
		saturation: num( seed?.saturation ?? panel.harmonySaturation, 0 ),
		lightness: num( seed?.lightness ?? panel.harmonyLightness, 0 ),
	};
	const loaded = paletteColors( seed?.colors || [] );
	const saved = seed?.paletteId
		? ( window.WPIE?.palettes || [] ).find(
				( p ) => p.id === seed.paletteId
		  )
		: null;
	return {
		params: loaded.length ? { ...params, base: loaded[ 0 ] } : params,
		slots: ( loaded.length
			? loaded
			: buildScheme( { ...params, count: 5 } )
		).map( ( color ) => ( { color, locked: false } ) ),
		source: loaded.length ? 'palette' : 'harmony',
		editingId: saved?.id || '',
		name: saved?.name || seed?.name || '',
	};
}

export function ColorSchemerDialog( { onClose, extras, seed } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const standalone = !! window.WPIE?.standalone;
	const canSave = ! standalone;
	const baseId = useId();

	// The page does not change under a modal dialog: read it once.
	const pageColors = useMemo(
		() =>
			scanColors( state.layers, state.doc ).colors.map( ( c ) => c.key ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);
	const start = useMemo(
		() => initialState( seed, state.fgColor, pageColors ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[]
	);
	const [ params, setParams ] = useState( start.params );
	const [ slots, setSlots ] = useState( start.slots );
	const [ source, setSource ] = useState( start.source );
	const [ editingId, setEditingId ] = useState( start.editingId );
	const [ name, setName ] = useState( start.name );
	const [ baseDraft, setBaseDraft ] = useState( null );
	const [ variant, setVariant ] = useState( 0 );
	const [ workspace, setWorkspace ] = useState( 'design' );
	const [ sets, setSetsState ] = useState(
		() => window.WPIE?.palettes || []
	);
	const [ kits, setKits ] = useState( () =>
		( window.WPIE?.brandKits || [] ).filter( ( k ) => k?.name )
	);
	const [ busy, setBusy ] = useState( false );
	const [ picking, setPicking ] = useState( false );
	// Undo links outlive a render; they read the list as it is then.
	const setsRef = useRef( sets );
	const setSets = ( next ) => {
		setsRef.current = next;
		setSetsState( next );
	};

	useEscape( onClose, ! picking );

	const canManageKits = !! window.WPIE?.canManageKits;
	const colors = slots.map( ( s ) => s.color );
	// Take the palette out of the editor (19.10.2026).
	const copyPalette = async ( format ) => {
		if ( ! format ) {
			return;
		}
		try {
			await window.navigator.clipboard.writeText(
				paletteText( colors, format, name )
			);
			extras?.toasts?.success?.( __( 'Palette copied.', 'wunderpaint' ) );
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The palette could not be copied.', 'wunderpaint' )
			);
		}
	};
	const paletteKey = colors.join();

	/* ---------------------------- the palette ---------------------------- */

	// Controls rebuild the unlocked slots explicitly (no effect): manual
	// edits and loaded palettes are never clobbered by a render.
	const applyParams = ( patch ) => {
		const next = { ...params, ...patch };
		setParams( next );
		setSource( 'harmony' );
		const scheme = buildScheme( { ...next, count: slots.length } );
		setSlots( ( prev ) =>
			prev.map( ( s, i ) =>
				s.locked ? s : { ...s, color: scheme[ i ] }
			)
		);
	};

	const randomize = () => applyParams( randomSchemeInput() );

	// The base field reports every keystroke. While typing only a full
	// six- or eight-digit value counts ("#3b6" is on its way to "#3b66ff",
	// not a color yet); leaving the field accepts short forms and rgb().
	const baseInput = ( value ) => {
		const text = String( value || '' ).trim();
		if ( /^#?([0-9a-f]{6}|[0-9a-f]{8})$/i.test( text ) ) {
			setBaseDraft( null );
			applyParams( {
				base: colorKey( '#' + text.replace( '#', '' ) ).key,
			} );
		} else {
			setBaseDraft( value );
		}
	};
	const baseCommit = () => {
		if ( null === baseDraft ) {
			return;
		}
		const text = String( baseDraft ).trim();
		const key = colorKey(
			/^[0-9a-f]{3,8}$/i.test( text ) ? '#' + text : text
		)?.key;
		setBaseDraft( null );
		if ( key ) {
			applyParams( { base: key } );
		}
	};

	/** A whole palette replaces the bar (saved palettes, kits, website). */
	const load = ( list, meta = {} ) => {
		const clean = paletteColors( list );
		if ( ! clean.length ) {
			return;
		}
		setSlots( clean.map( ( color ) => ( { color, locked: false } ) ) );
		setParams( ( p ) => ( { ...p, base: clean[ 0 ] } ) );
		setSource( meta.source || 'palette' );
		setEditingId( meta.editingId || '' );
		setName( meta.name ?? '' );
		setVariant( 0 );
	};

	/** Extracted colors fill the unlocked slots (image, document). */
	const fillUnlocked = ( list, from ) => {
		if ( ! list.length ) {
			return;
		}
		setSlots( ( prev ) => {
			let n = 0;
			return prev.map( ( s ) =>
				s.locked ? s : { ...s, color: list[ n++ % list.length ] }
			);
		} );
		setParams( ( p ) => ( { ...p, base: list[ 0 ] } ) );
		setSource( from );
		setVariant( 0 );
	};

	const setSlotColor = ( i, value ) => {
		const key = colorKey( value )?.key;
		if ( ! key ) {
			return;
		}
		// A manual pick is a decision: lock it against harmony rebuilds.
		setSlots( ( prev ) =>
			prev.map( ( s, j ) =>
				j === i ? { color: key, locked: true } : s
			)
		);
	};

	const pickIndex = useRef( 0 );
	const slotEditor = useColorEditor( {
		color: slots[ pickIndex.current ]?.color,
		title: __( 'Color', 'wunderpaint' ),
		onChange: ( v ) => setSlotColor( pickIndex.current, v ),
	} );
	const editSlot = ( i, anchor ) => {
		pickIndex.current = i;
		slotEditor.show( anchor, {
			color: slots[ i ].color,
			onChange: ( v ) => setSlotColor( i, v ),
		} );
	};

	const addSlot = () => {
		if ( slots.length >= PALETTE_MAX ) {
			return;
		}
		// The next color of the same harmony, one step longer: harmonious,
		// and the colors already there stay where they are.
		const longer = buildScheme( { ...params, count: slots.length + 1 } );
		const fresh =
			longer.find( ( c ) => ! colors.includes( c ) ) ||
			longer[ longer.length - 1 ];
		setSlots( ( prev ) => [ ...prev, { color: fresh, locked: false } ] );
	};

	const removeSlot = ( i ) =>
		setSlots( ( prev ) =>
			prev.length > 1 ? prev.filter( ( _, j ) => j !== i ) : prev
		);

	const toggleLock = ( i ) =>
		setSlots( ( prev ) =>
			prev.map( ( s, j ) =>
				j === i ? { ...s, locked: ! s.locked } : s
			)
		);

	const addScaleColor = ( color ) => {
		setSlots( ( prev ) =>
			prev.length >= PALETTE_MAX ||
			prev.some( ( s ) => s.color === color )
				? prev
				: [ ...prev, { color, locked: true } ]
		);
		setVariant( 0 );
	};

	/* ------------------------------ sources ------------------------------ */

	const readCanvas = ( canvas ) =>
		extractPalette( canvas, Math.max( 1, slots.length ) );

	const fromDocument = async () => {
		try {
			const canvas = await renderToCanvas( state.doc, state.layers, {
				scale: Math.min(
					1,
					128 / Math.max( state.doc.w, state.doc.h )
				),
				cache: sharedImageCache,
			} );
			fillUnlocked( readCanvas( canvas ), 'document' );
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'Could not read colors from the document.', 'wunderpaint' )
			);
		}
	};

	// The shared image picker (Media Library Manager or classic wp.media),
	// never a small media grid inside this dialog.
	const fromImage = async () => {
		if ( ! window.WPIE?.pickMedia ) {
			return;
		}
		setPicking( true );
		try {
			const items = await window.WPIE.pickMedia( {
				multiple: false,
				types: 'image',
			} );
			const m = items && items[ 0 ];
			if ( ! m ) {
				return;
			}
			const img = await loadImage( m.url || m.fullUrl, 'anonymous' );
			const w = img.naturalWidth || img.width;
			const h = img.naturalHeight || img.height;
			const scale = Math.min( 1, 128 / Math.max( w, h ) );
			const canvas = createCanvas( w * scale, h * scale );
			canvas
				.getContext( '2d' )
				.drawImage( img, 0, 0, canvas.width, canvas.height );
			fillUnlocked( readCanvas( canvas ), 'image' );
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'Could not read colors from that image.', 'wunderpaint' )
			);
		} finally {
			setPicking( false );
		}
	};

	/* ------------------------- saved palettes -------------------------- */

	const persist = async ( next, { success, undo } = {} ) => {
		const before = setsRef.current;
		setSets( next );
		setBusy( true );
		try {
			const saved = await request( {
				path: '/palettes',
				method: 'POST',
				data: next,
			} );
			const list = Array.isArray( saved ) ? saved : next;
			window.WPIE.palettes = list;
			setSets( list );
			window.dispatchEvent( new CustomEvent( 'wpie:palettes-updated' ) );
			if ( success ) {
				extras?.toasts?.success?.(
					success,
					undo
						? {
								linkText: __( 'Undo', 'wunderpaint' ),
								onLink: undo,
								duration: 8000,
						  }
						: undefined
				);
			}
			return list;
		} catch ( e ) {
			setSets( before );
			extras?.toasts?.error?.(
				e?.message ||
					__( 'The swatch set could not be saved.', 'wunderpaint' )
			);
			return null;
		} finally {
			setBusy( false );
		}
	};

	// Same rule as the /palettes route (Helpers::can_manage_owned):
	// administrators manage every palette, everyone else their own.
	const me = +window.WPIE?.userId || 0;
	const canManageSet = ( set ) =>
		!! window.WPIE?.canManage || ( me > 0 && +set?.owner === me );
	const editing =
		sets.find( ( s ) => s.id === editingId && canManageSet( s ) ) || null;

	const saveNew = async () => {
		const { sets: next, entry } = addPalette( setsRef.current, {
			name:
				name.trim() ||
				sprintf(
					/* translators: %d: palette number. */
					__( 'Palette %d', 'wunderpaint' ),
					setsRef.current.length + 1
				),
			colors,
		} );
		const list = await persist( next, {
			success: __(
				'Swatch set saved. It now shows up in every color picker.',
				'wunderpaint'
			),
		} );
		if ( list ) {
			setEditingId( entry.id );
			setName( entry.name );
		}
	};

	const saveUpdate = () =>
		editing
			? persist(
					updatePalette( setsRef.current, editing.id, {
						name: name.trim() || editing.name,
						colors,
					} ),
					{ success: __( 'Palette updated.', 'wunderpaint' ) }
			  )
			: saveNew();

	const renameSet = ( id, next ) => {
		persist( updatePalette( setsRef.current, id, { name: next } ) );
		if ( id === editingId ) {
			setName( next.trim() );
		}
	};

	const duplicateSet = ( id ) => {
		const original = setsRef.current.find( ( s ) => s.id === id );
		if ( ! original ) {
			return;
		}
		persist(
			duplicatePalette(
				setsRef.current,
				id,
				sprintf(
					/* translators: %s: palette name. */
					__( '%s copy', 'wunderpaint' ),
					original.name
				)
			).sets
		);
	};

	const deleteSet = ( id ) => {
		const {
			sets: next,
			removed,
			index,
		} = removePalette( setsRef.current, id );
		if ( ! removed ) {
			return;
		}
		if ( id === editingId ) {
			setEditingId( '' );
		}
		persist( next, {
			success: sprintf(
				/* translators: %s: palette name. */
				__( 'Palette “%s” deleted.', 'wunderpaint' ),
				removed.name
			),
			undo: () =>
				persist( restorePalette( setsRef.current, removed, index ) ),
		} );
	};

	const moveSet = ( from, to ) =>
		persist( moveItem( setsRef.current, from, to ) );

	/* ----------------------------- Brand Kits ---------------------------- */

	const writeKit = async ( kit, list ) => {
		const nextKits = ( window.WPIE?.brandKits || [] ).map( ( k ) =>
			k.id === kit.id ? { ...k, colors: list } : k
		);
		const res = await request( {
			path: '/brand-kits',
			method: 'POST',
			data: { kits: nextKits },
		} );
		const saved = res?.kits || nextKits;
		window.WPIE.brandKits = saved;
		window.WPIE.brand = saved[ 0 ] || window.WPIE.brand;
		setKits( saved.filter( ( k ) => k?.name ) );
		window.dispatchEvent( new CustomEvent( 'wpie:brand-kits-updated' ) );
	};

	const kitColors = async ( kit ) => {
		const before = kit.colors || [];
		setBusy( true );
		try {
			await writeKit( kit, colors );
			extras?.toasts?.success?.(
				sprintf(
					/* translators: %s: brand kit name. */
					__(
						'Colors applied to the Brand Kit "%s".',
						'wunderpaint'
					),
					kit.name
				),
				{
					linkText: __( 'Undo', 'wunderpaint' ),
					onLink: () =>
						writeKit( kit, before ).catch( () =>
							extras?.toasts?.error?.(
								__(
									'The Brand Kit could not be updated.',
									'wunderpaint'
								)
							)
						),
					duration: 8000,
				}
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

	/* ------------------------ the palette on the design ------------------ */

	const variants = useMemo(
		() => schemeVariants( pageColors, colors ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ pageColors, paletteKey ]
	);
	const results = useMemo(
		() =>
			variants.map( ( v ) =>
				mappingPatches( state.layers, state.doc, v.mapping )
			),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ variants ]
	);
	const chosenIndex = Math.min( variant, Math.max( 0, results.length - 1 ) );
	const chosen = results[ chosenIndex ] || null;

	const apply = () => {
		if ( ! chosen?.changed ) {
			return;
		}
		if ( chosen.patches.size ) {
			dispatch( {
				type: 'UPDATE_LAYERS',
				ids: Array.from( chosen.patches.keys() ),
				patchFor: ( l ) => chosen.patches.get( l.id ) || {},
			} );
		}
		if ( chosen.doc ) {
			dispatch( { type: 'SET_DOC', doc: chosen.doc } );
		}
		commit( __( 'Color Schemer', 'wunderpaint' ) );
		extras?.toasts?.success?.(
			__( 'Palette applied to the design.', 'wunderpaint' )
		);
		onClose();
	};

	// Preview cards and the footer share the existing Color panel workflow.
	const asGradient = ( gradientColors, kind ) => {
		const stops = schemeGradientColors( gradientColors );
		if ( stops.length < 2 ) {
			return;
		}
		window.dispatchEvent(
			new CustomEvent( 'wpie:color-panel-gradient', {
				detail: { colors: stops, kind },
			} )
		);
		onClose();
	};

	/* ------------------------------- render ------------------------------ */

	const dial = ( key, label, min, max, def ) => (
		<div key={ key } className="csd-dial">
			<span className="dsm-label">{ label }</span>
			<span className="csd-dial-val" data-number-value="">
				{ params[ key ] > 0 && 'spread' !== key ? '+' : '' }
				{ params[ key ] }
			</span>
			<SnapSlider
				min={ min }
				max={ max }
				value={ params[ key ] }
				def={ def }
				ariaLabel={ label }
				onChange={ ( v ) => applyParams( { [ key ]: v } ) }
			/>
		</div>
	);

	let status = __( 'This design has no editable colors yet.', 'wunderpaint' );
	if ( chosen && ! chosen.changed ) {
		status = __( 'The design already uses these colors.', 'wunderpaint' );
	} else if ( chosen ) {
		const n = chosen.patches.size;
		if ( ! n ) {
			status = __( 'The background gets a new color.', 'wunderpaint' );
		} else if ( chosen.doc ) {
			status = sprintf(
				/* translators: %d: number of layers. */
				_n(
					'%d layer and the background get new colors.',
					'%d layers and the background get new colors.',
					n,
					'wunderpaint'
				),
				n
			);
		} else {
			status = sprintf(
				/* translators: %d: number of layers. */
				_n(
					'%d layer gets new colors.',
					'%d layers get new colors.',
					n,
					'wunderpaint'
				),
				n
			);
		}
	}

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="dsm csd"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-modal="true"
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
								'Build a palette, see it on your design, and keep it for every color picker.',
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

				<div className="csd-body">
					<LibraryColumn
						sets={ sets }
						canSave={ canSave }
						activeId={ editingId }
						onLoadSet={ ( set ) =>
							load( set.colors, {
								source: 'palette',
								editingId: set.id,
								name: set.name,
							} )
						}
						canManageSet={ canManageSet }
						onRenameSet={ renameSet }
						onDuplicateSet={ duplicateSet }
						onDeleteSet={ deleteSet }
						onMoveSet={ moveSet }
						kits={ kits }
						canManageKits={ canManageKits && ! busy }
						onLoadKit={ ( kit ) =>
							load( kit.colors || [], {
								source: 'kit',
								name: kit.name,
							} )
						}
						onKitColors={ kitColors }
						canPickImage={ !! window.WPIE?.pickMedia }
						picking={ picking }
						onFromImage={ fromImage }
						hasDocument={ state.layers.length > 0 }
						onFromDocument={ fromDocument }
					/>

					<div className="csd-main">
						<div className="csd-main-head">
							{ canSave ? (
								<>
									<input
										className="dsm-input csd-name"
										value={ name }
										placeholder={ __(
											'Palette name',
											'wunderpaint'
										) }
										aria-label={ __(
											'Palette name',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											setName( e.target.value )
										}
									/>
									<button
										type="button"
										className="ai-btn secondary"
										disabled={ busy }
										onClick={ saveUpdate }
									>
										{ editing
											? __(
													'Update palette',
													'wunderpaint'
											  )
											: __(
													'Save palette',
													'wunderpaint'
											  ) }
									</button>
									{ editing && (
										<button
											type="button"
											className="ai-btn ghost"
											disabled={ busy }
											onClick={ saveNew }
										>
											{ __(
												'Save as new',
												'wunderpaint'
											) }
										</button>
									) }
								</>
							) : (
								<span className="csd-stage-title">
									{ __( 'Palette', 'wunderpaint' ) }
								</span>
							) }
							<select
								className="dsm-select sm"
								value=""
								aria-label={ __(
									'Copy palette',
									'wunderpaint'
								) }
								onChange={ ( e ) =>
									copyPalette( e.target.value )
								}
							>
								<option value="">
									{ __( 'Copy palette…', 'wunderpaint' ) }
								</option>
								<option value="hex">
									{ __( 'Hex list', 'wunderpaint' ) }
								</option>
								<option value="css">
									{ __( 'CSS variables', 'wunderpaint' ) }
								</option>
								<option value="json">JSON</option>
							</select>
						</div>
						<div className="csd-stage">
							<PaletteBar
								slots={ slots }
								max={ PALETTE_MAX }
								onEdit={ editSlot }
								onToggleLock={ toggleLock }
								onRemove={ removeSlot }
								onAdd={ addSlot }
								onMove={ ( from, to ) =>
									setSlots( ( prev ) =>
										moveItem( prev, from, to )
									)
								}
							/>
							<div
								className="dsm-seg csd-workspace"
								role="group"
								aria-label={ __(
									'Palette workspace',
									'wunderpaint'
								) }
							>
								{ [
									[
										'design',
										__( 'On your design', 'wunderpaint' ),
									],
									[
										'scales',
										__( 'Color scales', 'wunderpaint' ),
									],
								].map( ( [ id, label ] ) => (
									<button
										key={ id }
										type="button"
										className={
											workspace === id ? 'active' : ''
										}
										aria-pressed={ workspace === id }
										onClick={ () => setWorkspace( id ) }
									>
										{ label }
									</button>
								) ) }
							</div>
							<div
								style={ {
									display:
										workspace === 'scales'
											? undefined
											: 'none',
								} }
							>
								<ColorScales
									initialBase={ start.params.base }
									colors={ colors }
									onAdd={ addScaleColor }
									onGradient={ asGradient }
								/>
							</div>
							{ workspace === 'design' &&
								( variants.length ? (
									<DesignVariants
										doc={ state.doc }
										layers={ state.layers }
										variants={ variants }
										results={ results }
										selected={ chosenIndex }
										onSelect={ setVariant }
										paletteKey={ paletteKey }
									/>
								) : (
									<div className="csd-empty">
										<Strip colors={ colors } />
										<p>
											{ __(
												'Add shapes or text to the design and the palette shows up on it here. Photos stay as they are.',
												'wunderpaint'
											) }
										</p>
									</div>
								) ) }
						</div>
					</div>

					<div className="csd-right">
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.palette( { size: 14 } ) }
								<span>{ __( 'Harmony', 'wunderpaint' ) }</span>
								<button
									type="button"
									className="dsm-mini dsm-head-end"
									aria-label={ __( 'Random', 'wunderpaint' ) }
									title={ __(
										'Random: a new base, harmony and spread. Locked colors stay.',
										'wunderpaint'
									) }
									onClick={ randomize }
								>
									<Dice />
								</button>
							</div>
							<div className="csd-wheel-row">
								<HarmonyWheel
									base={ params.base }
									colors={ colors }
									onBase={ ( base ) =>
										applyParams( { base } )
									}
									size={ 184 }
								/>
							</div>
							<label className="csd-base" htmlFor={ baseId }>
								<span className="dsm-label">
									{ __( 'Base color', 'wunderpaint' ) }
								</span>
								<ColorField
									id={ baseId }
									title={ __( 'Base color', 'wunderpaint' ) }
									color={ baseDraft ?? params.base }
									onChange={ baseInput }
									onCommit={ baseCommit }
								/>
							</label>
							<div className="dsm-picklist">
								{ HARMONY_ORDER.map( ( h ) => (
									<button
										key={ h }
										type="button"
										className="dsm-pickrow dsm-pickrow-sm csd-harmony"
										aria-pressed={
											'harmony' === source &&
											params.harmony === h
										}
										onClick={ () =>
											applyParams( { harmony: h } )
										}
									>
										<b>{ harmonyLabel( h ) }</b>
										<Strip
											colors={ buildScheme( {
												...params,
												harmony: h,
												count: 5,
											} ) }
										/>
									</button>
								) ) }
							</div>
						</section>
						<section className="dsm-card">
							<div className="dsm-card-head">
								{ I.sliders( { size: 14 } ) }
								<span>{ __( 'Tune', 'wunderpaint' ) }</span>
							</div>
							{ dial(
								'spread',
								__( 'Spread', 'wunderpaint' ),
								0,
								100,
								50
							) }
							{ dial(
								'saturation',
								__( 'Saturation', 'wunderpaint' ),
								-100,
								100,
								0
							) }
							{ dial(
								'lightness',
								__( 'Lightness', 'wunderpaint' ),
								-100,
								100,
								0
							) }
						</section>
					</div>
				</div>

				<div className="dsm-foot">
					<span className="dsm-mono">{ status }</span>
					<div className="dsm-actions">
						<button
							type="button"
							className="ai-btn secondary"
							disabled={ colors.length < 2 }
							title={ __(
								'Open the palette as a gradient in the Color panel',
								'wunderpaint'
							) }
							onClick={ () => asGradient( colors ) }
						>
							{ __( 'As gradient', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn primary"
							disabled={ ! chosen?.changed }
							onClick={ apply }
						>
							{ __( 'Apply to design', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
