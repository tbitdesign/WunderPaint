/**
 * WPIE extension: Photo Mosaic (free).
 *
 * The main image (whole document, any layer or a media pick) is
 * rebuilt from MANY photos - or from crops of itself - the textbook
 * photomosaic pipeline: sub-block matching so the tiles' internal
 * structure forms the contours, color adjustment as a per-channel
 * offset of the tile pixels (never an overlay), and a repeat lock.
 *
 * v2.0: eight cell shapes, a mask over the whole picture with the
 * picture framed (moved and zoomed) inside it, tint and background,
 * presets, and PRINT-SHARP cells: the inserted layer is rendered at the
 * document's resolution from full crops of the photos, not at a fixed
 * 44 px per cell as before. Everything is computed locally.
 */

import {
	MIN_TILES,
	SHAPES,
	MASKS,
	SQUARE_MASKS,
	analyzeTile,
	selfTiles,
	mosaicSteps,
} from './mosaic-engine.js';
import { t } from './i18n.js';

const GEN_ID = 'wpie-photo-mosaic/mosaic';
const PREVIEW_W = 960;
const MAX_PIXELS = 40e6;

const DEFAULTS = {
	image: null, // { id, url, title } for media main-image picks
	source: 'doc', // 'doc' | 'layer:<id>' | 'media'
	tiles: [], // [ { id, url, full } ]
	selfMosaic: false,
	selfCount: 120,
	cols: 48,
	colorAdjust: 60, // 0..100 (%)
	shape: 'square',
	gap: 0, // 0..40 (%)
	radius: 0, // 0..50 (%)
	bg: '#ffffff',
	transparentBg: false,
	mask: 'none',
	frame: { x: 0, y: 0, zoom: 1 },
	tint: '#ffffff',
	tintStrength: 0, // 0..100 (%)
	seed: 7,
};

const tn = ( s, n ) => t( s ).replace( '%d', String( n ) );

/* --------------------------------- icons --------------------------------- */

const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
	d
		.split( ' M' )
		.map( ( p, i ) => '<path d="' + ( i ? 'M' + p : p ) + '"/>' )
		.join( '' ) +
	'</svg>';

const ICONS = {
	source: tabIcon(
		'M3 6a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v12a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3v-12 M3 16l5 -5c.928 -.893 2.072 -.893 3 0l5 5 M14 14l1 -1c.928 -.893 2.072 -.893 3 0l3 3 M15 8h.01'
	),
	tiles: tabIcon( 'M4 4h6v6h-6z M14 4h6v6h-6z M4 14h6v6h-6z M14 14h6v6h-6z' ),
	cells: tabIcon(
		'M12 3l7 4v8l-7 4l-7 -4v-8z M12 11l7 -4 M12 11v8 M12 11l-7 -4'
	),
	mask: tabIcon(
		'M12 20l-7.5 -7.5a4.5 4.5 0 0 1 6.36 -6.36l1.14 1.14l1.14 -1.14a4.5 4.5 0 0 1 6.36 6.36z'
	),
	color: tabIcon(
		'M12 21a9 9 0 1 1 0 -18a9 8 0 0 1 9 8a4.5 4.5 0 0 1 -4.5 4.5h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 1.75 M8.5 10.5l0 .01 M12.5 7.5l0 .01 M16.5 10.5l0 .01'
	),
	presets: tabIcon(
		'M4 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M14 5a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M4 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M14 15a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z'
	),
	eye: tabIcon(
		'M2 12s3.5 -6.5 10 -6.5s10 6.5 10 6.5s-3.5 6.5 -10 6.5s-10 -6.5 -10 -6.5z M12 12m-2.6 0a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0 -5.2 0',
		14
	),
};

// The shapes as tiny lattice drawings for the picker tiles.
const shapeIcon = ( kind ) => {
	const sq =
		'M3 3h5v5h-5z M10 3h5v5h-5z M17 3h5v5h-5z M3 10h5v5h-5z M10 10h5v5h-5z M17 10h5v5h-5z M3 17h5v5h-5z M10 17h5v5h-5z M17 17h5v5h-5z';
	const map = {
		square: sq,
		rounded:
			'M3 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M10 3h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M3 10h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M10 10h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M17 3h4a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3 M17 10h4a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3 M3 17h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M10 17h5a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3a1 1 0 0 1 1 -1 M17 17h4a1 1 0 0 1 1 1v3a1 1 0 0 1 -1 1h-3a1 1 0 0 1 -1 -1v-3',
		circle: 'M5.5 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M12.5 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M19.5 5.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M5.5 12.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M12.5 12.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M19.5 12.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M5.5 19.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M12.5 19.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0 M19.5 19.5m-2.5 0a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0',
		hex: 'M7 3l3.5 2v4l-3.5 2l-3.5 -2v-4z M17 3l3.5 2v4l-3.5 2l-3.5 -2v-4z M12 11l3.5 2v4l-3.5 2l-3.5 -2v-4z M3.5 13l3.5 2v4 M20.5 13l-3.5 2v4',
		diamond:
			'M7 2l5 5l-5 5l-5 -5z M17 2l5 5l-5 5l-5 -5z M12 12l5 5l-5 5l-5 -5z M2 12l5 5l-5 5 M22 12l-5 5l5 5',
		triangle:
			'M2 20l5 -8l5 8z M12 20l5 -8l5 8z M7 12l5 8 M17 12l5 8 M7 12l5 -8l5 8z M2 12l5 -8 M17 4l5 8',
		brick: 'M3 4h8v5h-8z M13 4h8v5h-8z M3 15h8v5h-8z M13 15h8v5h-8z M7 9.5h8v5h-8z M3 9.5h2v5h-2z M17 9.5h4v5h-4z',
		scales: 'M3 9a4 4 0 0 1 8 0a4 4 0 0 1 -8 0 M13 9a4 4 0 0 1 8 0a4 4 0 0 1 -8 0 M8 15a4 4 0 0 1 8 0a4 4 0 0 1 -8 0 M3 21a4 4 0 0 1 8 0 M13 21a4 4 0 0 1 8 0',
	};
	return tabIcon( map[ kind ] || sq, 22 );
};

const SHAPE_LABELS = {
	square: 'Squares',
	rounded: 'Rounded',
	circle: 'Dots',
	hex: 'Honeycomb',
	diamond: 'Diamonds',
	triangle: 'Triangles',
	brick: 'Brick bond',
	scales: 'Scales',
};

const MASK_LABELS = {
	none: 'None',
	heart: 'Heart',
	circle: 'Circle',
	oval: 'Oval',
	star: 'Star',
	hexagon: 'Hexagon',
	diamond: 'Diamond',
	rounded: 'Rounded corners',
};

/** Presets: a card each, one line of what it does, the settings it sets. */
const PRESETS = [
	{
		id: 'wall',
		label: 'Photo wall',
		sub: 'Square cells edge to edge, the classic.',
		patch: {
			shape: 'square',
			gap: 0,
			radius: 0,
			mask: 'none',
			tintStrength: 0,
		},
	},
	{
		id: 'gallery',
		label: 'Gallery',
		sub: 'Rounded prints with a thin white gap.',
		patch: {
			shape: 'rounded',
			gap: 8,
			radius: 18,
			mask: 'none',
			bg: '#ffffff',
			transparentBg: false,
			tintStrength: 0,
		},
	},
	{
		id: 'honeycomb',
		label: 'Honeycomb',
		sub: 'Hexagons, a hair of dark between them.',
		patch: {
			shape: 'hex',
			gap: 5,
			mask: 'none',
			bg: '#1c1e24',
			transparentBg: false,
			tintStrength: 0,
		},
	},
	{
		id: 'diamonds',
		label: 'Diamonds',
		sub: 'A rhombus lattice, tight.',
		patch: { shape: 'diamond', gap: 3, mask: 'none', tintStrength: 0 },
	},
	{
		id: 'dots',
		label: 'Dots',
		sub: 'Round photos on a dark ground.',
		patch: {
			shape: 'circle',
			gap: 10,
			mask: 'none',
			bg: '#14161b',
			transparentBg: false,
			tintStrength: 0,
		},
	},
	{
		id: 'scales',
		label: 'Scales',
		sub: 'Fish scales, each row over the last.',
		patch: { shape: 'scales', gap: 0, mask: 'none', tintStrength: 0 },
	},
	{
		id: 'heart',
		label: 'Heart poster',
		sub: 'A heart of photos, transparent around it.',
		patch: {
			shape: 'square',
			gap: 3,
			mask: 'heart',
			transparentBg: true,
			tintStrength: 0,
		},
	},
	{
		id: 'self',
		label: 'Self-portrait',
		sub: 'The picture built from crops of itself.',
		patch: {
			selfMosaic: true,
			shape: 'square',
			gap: 0,
			mask: 'none',
			tintStrength: 0,
		},
	},
	{
		id: 'duotone',
		label: 'Duotone wash',
		sub: 'A warm tint over the whole mosaic.',
		patch: { tint: '#c9553d', tintStrength: 45 },
	},
];

/* --------------------------------- studio -------------------------------- */

function openStudio( ctx ) {
	const { editor, extras, layer } = ctx;
	const bridge = window.WPIE && window.WPIE.bridge;
	const ui = bridge && bridge.ui;
	if ( ! bridge || ! bridge.documents || ! ui || ! ui.section ) {
		return;
	}
	const editing = !! ( layer && layer.generator );
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	params.tiles = ( params.tiles || [] ).slice( 0, 600 );
	params.frame = { ...DEFAULTS.frame, ...( params.frame || {} ) };
	if ( ! SHAPES.includes( params.shape ) ) {
		params.shape = 'square';
	}
	if ( ! MASKS.includes( params.mask ) ) {
		params.mask = 'none';
	}

	let srcCanvas = null;
	let srcToken = 0;
	let tileData = [];
	let tileToken = 0;
	let selfData = [];

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = ui.el( 'div', 'modal-backdrop', host );
	const dialog = ui.el( 'div', 'dsm wpiemos-dialog', backdrop );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = ui.el( 'div', 'dsm-head', dialog );
	// Die Marke kommt aus dem Kit (bridge.ui), nicht aus dem Paket.
	ui.badge( head );
	const titles = ui.el( 'div', 'dsm-titles', head );
	ui.el( 'span', 'dsm-title', titles, 'Photo Mosaic' );
	ui.el(
		'div',
		'dsm-sub',
		titles,
		t( 'Your image, rebuilt from many photos - as an editable layer.' )
	);
	const closeBtn = ui.el( 'button', 'dsm-x', head );
	closeBtn.innerHTML = '&times;';
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );

	const body = ui.el( 'div', 'wpiemos-body', dialog );
	const left = ui.el( 'div', 'wpiemos-left', body );
	const view = ui.el( 'div', 'wpiemos-view', body );
	const stage = ui.el( 'div', 'wpiemos-stage', view );
	const canvas = ui.el( 'canvas', 'wpiemos-canvas', stage );
	const side = ui.el( 'div', 'wpiemos-side', body );
	const status = ui.el( 'div', 'dsm-viewhint wpiemos-status', view );
	const setStatus = ( msg, isErr ) => {
		status.textContent = msg || '';
		status.classList.toggle( 'on', !! msg );
		status.classList.toggle( 'err', !! isErr );
	};
	const hint = ui.el(
		'div',
		'dsm-viewhint wpiemos-hint',
		view,
		t( 'Wheel to zoom the preview · drag to move the picture in the frame' )
	);
	void hint;

	const card = ( parent, title, icon ) =>
		ui.section( parent, { icon, title } );
	const row = ( parent, label, min, max, step, value, onChange, fmt ) =>
		ui.slider( parent, {
			label,
			min,
			max,
			step,
			value,
			onInput: onChange,
			format: fmt || String,
		} );
	const selectRow = ( parent, label, options, value, onChange ) =>
		ui.select( ui.row( parent, label ), { options, value, onChange } );
	const mounts = [];
	const colorRow = ( parent, label, get, set ) => {
		const r = ui.row( parent, label );
		const node = ui.el( 'div', null, r );
		if ( bridge.components && bridge.components.mountColorButton ) {
			mounts.push(
				bridge.components.mountColorButton( node, {
					color: get(),
					onChange: ( c ) => {
						set(
							'string' === typeof c ? c : ( c && c.hex ) || get()
						);
						schedule();
					},
					title: label,
				} )
			);
		} else {
			const input = ui.el( 'input', null, node );
			input.type = 'color';
			input.value = get();
			input.oninput = () => {
				set( input.value );
				schedule();
			};
		}
		return r;
	};

	/* ------------------------------- presets ------------------------------ */

	const presetBox = card( left, t( 'Presets' ), ICONS.presets );
	const presetList = ui.el( 'div', 'wpiemos-presets', presetBox );
	const presetEls = {};
	for ( const p of PRESETS ) {
		const b = ui.el( 'button', 'dsm-pickrow wpiemos-preset', presetList );
		b.type = 'button';
		b.dataset.preset = p.id;
		const ic = ui.el( 'span', 'dsm-pickrow-icon wpiemos-preset-ic', b );
		ic.innerHTML = shapeIcon( p.patch.shape || params.shape );
		const main = ui.el( 'span', 'dsm-pickrow-text wpiemos-preset-main', b );
		ui.el( 'b', null, main, t( p.label ) );
		ui.el( 'small', null, main, t( p.sub ) );
		b.onclick = () => applyPreset( p.id );
		presetEls[ p.id ] = b;
	}
	let activePreset = '';
	function applyPreset( id ) {
		const p = PRESETS.find( ( x ) => x.id === id );
		if ( ! p ) {
			return;
		}
		Object.assign( params, JSON.parse( JSON.stringify( p.patch ) ) );
		activePreset = id;
		if ( params.selfMosaic && ! selfData.length ) {
			rebuildSelf();
		}
		renderSide();
		syncPresets();
		schedule();
	}
	function syncPresets() {
		for ( const id of Object.keys( presetEls ) ) {
			presetEls[ id ].classList.toggle( 'is-on', id === activePreset );
		}
	}

	/* ----------------------------- main image ----------------------------- */

	const srcSec = card( side, t( 'Main image' ), ICONS.source );
	const srcSel = ui.el( 'select', 'dsm-select wpiemos-wide', srcSec );
	srcSel.setAttribute( 'aria-label', t( 'Main image' ) );
	const srcNote = ui.el( 'div', 'dsm-note wpiemos-info', srcSec );

	function fillSourceOptions() {
		srcSel.innerHTML = '';
		const add = ( v, label ) => {
			const o = ui.el( 'option', null, srcSel );
			o.value = v;
			o.textContent = label;
		};
		add( 'doc', t( 'Whole document' ) );
		// Der Kern haelt EINE FLACHE Ebenenliste, und group.children sind
		// IDs, keine Objekte. Die alte Rekursion lief damit ueber Strings:
		// l.type und l.name waren undefined, jedes Kind wurde als
		// "layer:undefined" mit der Beschriftung "undefined" angeboten - und
		// danach standen dieselben Ebenen noch einmal flach in der Liste,
		// weil sie dort ohnehin schon drin sind. (Codex F15.)
		const walk = ( layers ) => {
			const list = layers || [];
			for ( const l of list ) {
				if ( ! l || ! l.id || 'group' === l.type ) {
					continue;
				}
				add(
					'layer:' + l.id,
					( l.parent ? '  ' : '' ) + ( l.name || l.type )
				);
			}
		};
		walk( editor.state.layers );
		add( 'media', t( 'Media library' ) );
	}
	fillSourceOptions();
	srcSel.value =
		[ 'doc', 'media' ].includes( params.source ) ||
		srcSel.querySelector( `option[value="${ params.source }"]` )
			? params.source
			: 'doc';
	params.source = srcSel.value;

	function mediaFrame( title, button, multiple ) {
		// THE EDITOR'S OWN PICKER FIRST: `wp.media` does not exist in the
		// standalone studio. Same promise either way: an array of items,
		// or null/undefined when the user backed out.
		if ( window.WPIE && window.WPIE.pickMedia ) {
			return window.WPIE.pickMedia( {
				multiple: !! multiple,
				title,
				button,
				types: 'image',
			} ).then( ( picked ) =>
				picked
					? picked.map( ( item ) => ( {
							id: item.id,
							url: item.thumb || item.url,
							full: item.url,
							title: item.title || '',
					  } ) )
					: picked
			);
		}
		return new Promise( ( resolve ) => {
			if ( ! window.wp || ! window.wp.media ) {
				resolve( null );
				return;
			}
			const frame = window.wp.media( {
				title,
				library: { type: 'image' },
				multiple,
				button: { text: button },
			} );
			frame.on( 'select', () => {
				const items = frame
					.state()
					.get( 'selection' )
					.toJSON()
					.map( ( item ) => ( {
						id: item.id,
						url:
							( item.sizes &&
								( ( item.sizes.thumbnail &&
									item.sizes.thumbnail.url ) ||
									( item.sizes.medium &&
										item.sizes.medium.url ) ) ) ||
							item.url,
						full:
							( item.sizes &&
								item.sizes.large &&
								item.sizes.large.url ) ||
							item.url,
						title: item.title || item.filename || '',
					} ) );
				resolve( items );
			} );
			frame.on( 'close', () => resolve( undefined ) );
			frame.open();
		} );
	}

	async function urlToCanvas( url, max ) {
		const img = new window.Image();
		img.crossOrigin = 'anonymous';
		img.decoding = 'async';
		img.src = url;
		// decode() keeps the (potentially huge) JPEG decode off the main
		// thread - drawImage on an undecoded image freezes the tab.
		if ( img.decode ) {
			await img.decode();
		} else {
			await new Promise( ( res, rej ) => {
				img.onload = res;
				img.onerror = rej;
			} );
		}
		const iw = img.naturalWidth || img.width;
		const ih = img.naturalHeight || img.height;
		const scale = Math.min( 1, max / iw );
		const w = Math.max( 1, Math.round( iw * scale ) );
		const h = Math.max( 1, Math.round( ih * scale ) );
		let src = img;
		if ( window.createImageBitmap && scale < 1 ) {
			try {
				src = await window.createImageBitmap( img, {
					resizeWidth: w,
					resizeHeight: h,
					resizeQuality: 'medium',
				} );
			} catch ( e ) {}
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		c.getContext( '2d' ).drawImage( src, 0, 0, w, h );
		if ( src !== img && src.close ) {
			src.close();
		}
		return c;
	}

	// renderToCanvas returns transparency for empty areas - flatten
	// every source onto white before analyzing.
	function flattenWhite( c ) {
		if ( ! c ) {
			return c;
		}
		const w = document.createElement( 'canvas' );
		w.width = c.width;
		w.height = c.height;
		const g2 = w.getContext( '2d' );
		g2.fillStyle = '#ffffff';
		g2.fillRect( 0, 0, w.width, w.height );
		g2.drawImage( c, 0, 0 );
		return w;
	}

	async function loadSource() {
		const token = ++srcToken;
		const desc = params.source;
		srcNote.textContent = '';
		try {
			let c = null;
			if ( 'media' === desc ) {
				if ( params.image && params.image.url ) {
					c = await urlToCanvas( params.image.url, 1400 );
					srcNote.textContent = params.image.title || '';
				}
			} else if ( 'doc' === desc ) {
				// Editing: the document WITHOUT this studio's own layer, or
				// every update bakes the previous result into the next one
				// (EXTZUSTAND-01, 10.09.2026).
				const own = new Set(
					editing && layer
						? [ layer.id, ...( layer.children || [] ) ]
						: []
				);
				c = await bridge.raster.renderToCanvas(
					editor.state.doc,
					( editor.state.layers || [] ).filter(
						( l ) => ! own.has( l.id ) && ! own.has( l.parent )
					),
					{
						scale: Math.min( 1, 1400 / editor.state.doc.w ),
						cache: bridge.raster.sharedImageCache,
					}
				);
			} else if ( desc.startsWith( 'layer:' ) ) {
				const id = desc.slice( 6 );
				const flat = editor.state.layers || [];
				const target = flat.find( ( l ) => String( l.id ) === id );
				if ( target ) {
					// The layer may be the child of a group: the renderer
					// starts at roots without a parent and never reached it,
					// so a grouped photo arrived as an empty canvas (Codex
					// F15, 10.09.2026). Render a parent-less copy and hand the
					// renderer its descendants for a group.
					const byId = new Map(
						flat.map( ( l ) => [ String( l.id ), l ] )
					);
					const members = new Set();
					const collect = ( item ) => {
						if ( ! item || members.has( item.id ) ) {
							return;
						}
						members.add( item.id );
						( item.children || [] ).forEach( ( cid ) =>
							collect( byId.get( String( cid ) ) )
						);
					};
					collect( target );
					const selected = flat.filter( ( l ) =>
						members.has( l.id )
					);
					await bridge.raster.sharedImageCache?.warm?.( selected );
					c = await bridge.raster.renderToCanvas(
						editor.state.doc,
						[ { ...target, parent: null } ],
						{
							scale: Math.min( 1, 1400 / editor.state.doc.w ),
							cache: bridge.raster.sharedImageCache,
							allLayers: selected,
						}
					);
					srcNote.textContent = target.name || '';
				}
			}
			c = flattenWhite( c );
			if ( token === srcToken ) {
				srcCanvas = c;
				selfData = [];
				if ( params.selfMosaic ) {
					rebuildSelf();
				}
				schedule();
			}
		} catch ( e ) {
			if ( token === srcToken ) {
				srcCanvas = null;
				setStatus( t( 'Could not load the image.' ), true );
				schedule();
			}
		}
	}

	srcSel.onchange = async () => {
		if ( 'media' === srcSel.value ) {
			const picked = await mediaFrame(
				t( 'Choose image' ),
				t( 'Use image' ),
				false
			);
			if ( picked && picked.length ) {
				params.image = {
					id: picked[ 0 ].id,
					url: picked[ 0 ].full,
					title: picked[ 0 ].title,
				};
				params.source = 'media';
			} else if ( undefined === picked && params.image ) {
				params.source = 'media';
			} else {
				srcSel.value = params.source;
				return;
			}
		} else {
			params.source = srcSel.value;
		}
		loadSource();
	};

	/* -------------------------------- tiles ------------------------------- */

	const tileSec = card( side, t( 'Tiles' ), ICONS.tiles );
	const tileRow = ui.el( 'div', 'wpiemos-tilebtns', tileSec );
	const pickTilesBtn = ui.btn( tileRow, {
		label: t( 'Pick tile photos' ),
		onClick: () => pickTiles(),
	} );
	const clearBtn = ui.btn( tileRow, {
		label: t( 'Clear' ),
		onClick: () => {
			params.tiles = [];
			tileData = [];
			syncTileInfo();
			schedule();
		},
	} );
	clearBtn.classList.add( 'wpiemos-reset' );
	const tileInfo = ui.el( 'div', 'dsm-note wpiemos-info', tileSec );
	const tileStrip = ui.el( 'div', 'wpiemos-strip', tileSec );
	// The self-mosaic: the picture cut into its own tiles.
	ui.check( tileSec, {
		label: t( 'Build the picture from itself' ),
		checked: params.selfMosaic,
		onChange: ( v ) => {
			params.selfMosaic = v;
			activePreset = '';
			syncPresets();
			if ( v ) {
				rebuildSelf();
			}
			renderSide();
			syncTileInfo();
			schedule();
		},
	} );
	const selfRowHost = ui.el( 'div', 'dsm-rows', tileSec );

	const activeTiles = () => ( params.selfMosaic ? selfData : tileData );

	function rebuildSelf() {
		if ( ! srcCanvas ) {
			selfData = [];
			return;
		}
		selfData = selfTiles(
			srcCanvas,
			srcCanvas,
			params.selfCount,
			params.seed
		);
		syncTileInfo();
	}

	function syncTileInfo() {
		const tiles = activeTiles();
		if ( params.selfMosaic ) {
			tileInfo.textContent = tn(
				'%d crops of the picture',
				tiles.length
			);
		} else {
			tileInfo.textContent =
				tiles.length >= MIN_TILES
					? tn( '%d photos loaded', tiles.length )
					: tn(
							'Add at least %d photos - the more, the better the mosaic.',
							MIN_TILES
					  );
		}
		tileStrip.innerHTML = '';
		for ( const td of tiles.slice( 0, 24 ) ) {
			const th = ui.el( 'canvas', 'wpiemos-thumb', tileStrip );
			th.width = 28;
			th.height = 28;
			th.getContext( '2d' ).drawImage( td.canvas, 0, 0, 28, 28 );
		}
		if ( tiles.length > 24 ) {
			ui.el(
				'span',
				'dsm-note wpiemos-more',
				tileStrip,
				`+${ tiles.length - 24 }`
			);
		}
	}

	async function loadTiles() {
		const token = ++tileToken;
		tileData = [];
		syncTileInfo();
		const list = params.tiles || [];
		for ( let i = 0; i < list.length; i++ ) {
			if ( token !== tileToken ) {
				return;
			}
			setStatus(
				`${ t( 'Loading tiles…' ) } ${ i + 1 }/${ list.length }`
			);
			try {
				// The full picture at 320 px: a print cell of 160 px stays
				// sharp. Older layers only know the thumbnail.
				const c = await urlToCanvas(
					list[ i ].full || list[ i ].url,
					320
				);
				tileData.push( analyzeTile( c, c ) );
			} catch ( e ) {}
			if ( 0 === i % 8 ) {
				syncTileInfo();
			}
		}
		if ( token !== tileToken ) {
			return;
		}
		setStatus( '' );
		syncTileInfo();
		schedule();
	}

	async function pickTiles() {
		const picked = await mediaFrame(
			t( 'Pick tile photos' ),
			t( 'Use photos' ),
			true
		);
		if ( picked && picked.length ) {
			const seen = new Set( params.tiles.map( ( x ) => x.id ) );
			for ( const p of picked ) {
				if ( ! seen.has( p.id ) ) {
					params.tiles.push( { id: p.id, url: p.url, full: p.full } );
					seen.add( p.id );
				}
			}
			params.tiles = params.tiles.slice( 0, 600 );
			if ( params.selfMosaic ) {
				params.selfMosaic = false;
				renderSide();
			}
			loadTiles();
		}
	}
	void pickTilesBtn;

	/* ------------------------------- cells -------------------------------- */

	const cellSec = card( side, t( 'Cells' ), ICONS.cells );
	const shapeGrid = ui.el( 'div', 'wpiemos-shapes', cellSec );
	const shapeEls = {};
	for ( const s of SHAPES ) {
		const b = ui.el( 'button', 'dsm-pick wpiemos-shape', shapeGrid );
		b.type = 'button';
		b.dataset.shape = s;
		b.innerHTML =
			shapeIcon( s ) +
			'<span class="dsm-pick-label">' +
			t( SHAPE_LABELS[ s ] ) +
			'</span>';
		b.onclick = () => {
			params.shape = s;
			activePreset = '';
			syncPresets();
			syncShapes();
			renderSide();
			schedule();
		};
		shapeEls[ s ] = b;
	}
	function syncShapes() {
		for ( const s of SHAPES ) {
			shapeEls[ s ].classList.toggle( 'is-on', s === params.shape );
		}
	}
	const cellRows = ui.el( 'div', 'dsm-rows', cellSec );

	/* ---------------------------- mask + frame ---------------------------- */

	const maskSec = card( side, t( 'Mask and frame' ), ICONS.mask );
	const maskRows = ui.el( 'div', 'dsm-rows', maskSec );

	/* -------------------------------- colour ------------------------------ */

	const colSec = card( side, t( 'Color' ), ICONS.color );
	const colRows = ui.el( 'div', 'dsm-rows', colSec );

	/** The rows that depend on the settings, rebuilt on switch. */
	function renderSide() {
		for ( const m of mounts.splice( 0 ) ) {
			try {
				m.unmount();
			} catch ( e ) {}
		}
		selfRowHost.innerHTML = '';
		if ( params.selfMosaic ) {
			row(
				selfRowHost,
				t( 'Crops' ),
				24,
				400,
				8,
				params.selfCount,
				( v ) => {
					params.selfCount = v;
					rebuildSelf();
				}
			);
		}
		cellRows.innerHTML = '';
		row( cellRows, t( 'Columns' ), 24, 80, 1, params.cols, ( v ) => {
			params.cols = v;
		} );
		if ( 'scales' !== params.shape ) {
			row(
				cellRows,
				t( 'Gap' ),
				0,
				40,
				1,
				params.gap,
				( v ) => {
					params.gap = v;
				},
				( v ) => v + '%'
			);
		}
		if ( 'square' === params.shape || 'rounded' === params.shape ) {
			row(
				cellRows,
				t( 'Corner rounding' ),
				0,
				50,
				1,
				params.radius,
				( v ) => {
					params.radius = v;
				},
				( v ) => v + '%'
			);
		}
		row(
			cellRows,
			t( 'Color match' ),
			0,
			100,
			1,
			params.colorAdjust,
			( v ) => {
				params.colorAdjust = v;
			},
			( v ) => v + '%'
		);
		ui.el(
			'div',
			'dsm-note wpiemos-info',
			cellRows,
			t( '0% = pure tile matching only' )
		);

		maskRows.innerHTML = '';
		selectRow(
			maskRows,
			t( 'Mask' ),
			MASKS.map( ( m ) => ( {
				value: m,
				label: t( MASK_LABELS[ m ] ),
			} ) ),
			params.mask,
			( v ) => {
				params.mask = v;
				activePreset = '';
				syncPresets();
				schedule();
			}
		);
		row(
			maskRows,
			t( 'Picture zoom' ),
			100,
			400,
			5,
			Math.round( params.frame.zoom * 100 ),
			( v ) => {
				params.frame.zoom = v / 100;
			},
			( v ) => v + '%'
		);
		const centerBtn = ui.btn( maskRows, {
			label: t( 'Center the picture' ),
			onClick: () => {
				params.frame = { x: 0, y: 0, zoom: 1 };
				renderSide();
				schedule();
			},
		} );
		centerBtn.classList.add( 'wpiemos-wide' );
		ui.el(
			'div',
			'dsm-note wpiemos-info',
			maskRows,
			t(
				'Drag the picture in the preview to place it; the wheel zooms the preview to check single tiles.'
			)
		);

		colRows.innerHTML = '';
		ui.check( colRows, {
			label: t( 'Transparent background' ),
			checked: params.transparentBg,
			onChange: ( v ) => {
				params.transparentBg = v;
				renderSide();
				schedule();
			},
		} );
		if ( ! params.transparentBg ) {
			colorRow(
				colRows,
				t( 'Background' ),
				() => params.bg,
				( c ) => {
					params.bg = c;
				}
			);
		}
		colorRow(
			colRows,
			t( 'Tint' ),
			() => params.tint,
			( c ) => {
				params.tint = c;
			}
		);
		row(
			colRows,
			t( 'Tint strength' ),
			0,
			100,
			1,
			params.tintStrength,
			( v ) => {
				params.tintStrength = v;
			},
			( v ) => v + '%'
		);
		syncShapes();
	}

	/* ------------------------------- footer ------------------------------- */

	const foot = ui.el( 'div', 'dsm-foot', dialog );
	const footHint = ui.el(
		'div',
		'dsm-hint',
		foot,
		t( 'Everything is computed locally in your browser.' )
	);
	const actions = ui.el( 'div', 'dsm-actions', foot );
	const cancelBtn = ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => close(),
	} );
	const apply = ui.btn( actions, {
		label: editing ? t( 'Update mosaic' ) : t( 'Insert mosaic' ),
		primary: true,
		onClick: () => doInsert(),
	} );
	apply.disabled = true;
	void cancelBtn;

	/* ------------------------------- painting ----------------------------- */

	let timer = 0;
	let bakeToken = 0;

	const engineOpts = ( cell ) => ( {
		cols: params.cols,
		colorAdjust: params.colorAdjust / 100,
		cell,
		shape: params.shape,
		gap: params.gap / 100,
		radius: params.radius / 100,
		bg: params.transparentBg ? null : params.bg,
		mask: params.mask,
		tint: params.tint,
		tintStrength: params.tintStrength / 100,
		frame: params.frame,
	} );

	/** The cell size that makes the layer as sharp as the document. */
	function printCell() {
		const doc = editor.state.doc;
		const want = Math.ceil( ( ( doc.w || 1600 ) * 0.92 ) / params.cols );
		let cell = Math.max( 44, Math.min( 160, want ) );
		const aspect = SQUARE_MASKS.includes( params.mask )
			? 1
			: srcCanvas
			? srcCanvas.width / srcCanvas.height
			: 1;
		while (
			cell > 44 &&
			( params.cols * cell ) ** 2 / aspect > MAX_PIXELS
		) {
			cell -= 4;
		}
		return cell;
	}

	// Chunked build: run the generator in ~24ms slices, yield to the event
	// loop in between (progress stays visible, the tab stays responsive)
	// and abort mid-build the moment a newer bake supersedes this one.
	async function bake( full, tk ) {
		const tiles = activeTiles();
		if ( ! srcCanvas || tiles.length < MIN_TILES ) {
			return null;
		}
		const cell = full
			? printCell()
			: Math.max(
					12,
					Math.min( 40, Math.round( PREVIEW_W / params.cols ) )
			  );
		const it = mosaicSteps(
			srcCanvas,
			srcCanvas,
			tiles,
			engineOpts( cell )
		);
		let sliceEnd = Date.now() + 24;
		for (;;) {
			const step = it.next();
			if ( step.done ) {
				return step.value ? step.value.canvas : null;
			}
			if ( tk !== bakeToken ) {
				return null;
			}
			if ( Date.now() > sliceEnd ) {
				setStatus(
					`${ t( 'Rendering the mosaic' ) } ${ step.value.row }/${
						step.value.rows
					}`
				);
				await new Promise( ( res ) => window.setTimeout( res, 0 ) );
				sliceEnd = Date.now() + 24;
			}
		}
	}
	let bakedPreview = null;
	function drawBaked( baked ) {
		bakedPreview = baked;
		const maxW = Math.max( 200, view.clientWidth - 36 );
		const maxH = Math.max( 200, view.clientHeight - 36 );
		const sc = Math.min( maxW / baked.width, maxH / baked.height, 1 );
		canvas.width = Math.round( baked.width * sc );
		canvas.height = Math.round( baked.height * sc );
		const g = canvas.getContext( '2d' );
		g.imageSmoothingEnabled = true;
		g.drawImage( baked, 0, 0, canvas.width, canvas.height );
		applyViewTransform();
	}
	function paintNow() {
		if ( ! srcCanvas || activeTiles().length < MIN_TILES ) {
			apply.disabled = true;
			canvas.width = 10;
			canvas.height = 10;
			return;
		}
		const tk = ++bakeToken;
		setStatus( t( 'Rendering the mosaic' ) );
		window.setTimeout( async () => {
			if ( tk !== bakeToken ) {
				return;
			}
			const baked = await bake( false, tk );
			if ( tk !== bakeToken ) {
				return;
			}
			apply.disabled = ! baked;
			if ( baked ) {
				drawBaked( baked );
			}
			setStatus( '' );
		}, 40 );
	}
	function schedule() {
		window.clearTimeout( timer );
		timer = window.setTimeout( paintNow, 250 );
	}

	/* --------------------------- view: zoom + drag ------------------------ */

	let viewZoom = 1;
	let panX = 0;
	let panY = 0;
	function applyViewTransform() {
		if ( viewZoom <= 1 ) {
			panX = panY = 0;
		}
		canvas.style.transform =
			1 === viewZoom
				? ''
				: `translate(${ panX }px, ${ panY }px) scale(${ viewZoom })`;
		stage.classList.toggle( 'is-zoomed', viewZoom > 1 );
	}
	view.addEventListener(
		'wheel',
		( e ) => {
			if ( ! bakedPreview ) {
				return;
			}
			e.preventDefault();
			const next = Math.max(
				1,
				Math.min( 4, viewZoom * ( e.deltaY < 0 ? 1.2 : 1 / 1.2 ) )
			);
			if ( next !== viewZoom ) {
				// Zoom around the pointer.
				const r = canvas.getBoundingClientRect();
				const px = ( e.clientX - r.left ) / r.width - 0.5;
				const py = ( e.clientY - r.top ) / r.height - 0.5;
				const k = next / viewZoom;
				panX = panX - px * canvas.width * ( k - 1 );
				panY = panY - py * canvas.height * ( k - 1 );
				viewZoom = next;
				applyViewTransform();
			}
		},
		{ passive: false }
	);
	let drag = null;
	canvas.addEventListener( 'pointerdown', ( e ) => {
		if ( ! bakedPreview ) {
			return;
		}
		drag = {
			x: e.clientX,
			y: e.clientY,
			panX,
			panY,
			fx: params.frame.x,
			fy: params.frame.y,
			mode: viewZoom > 1 ? 'pan' : 'frame',
		};
		try {
			canvas.setPointerCapture( e.pointerId );
		} catch ( err ) {}
	} );
	canvas.addEventListener( 'pointermove', ( e ) => {
		if ( ! drag ) {
			return;
		}
		const dx = e.clientX - drag.x;
		const dy = e.clientY - drag.y;
		if ( 'pan' === drag.mode ) {
			panX = drag.panX + dx;
			panY = drag.panY + dy;
			applyViewTransform();
			return;
		}
		// Moving the picture in the frame: a full drag across the preview
		// walks the frame offset from one edge of the slack to the other.
		const r = canvas.getBoundingClientRect();
		params.frame.x = Math.max(
			-1,
			Math.min( 1, drag.fx - ( dx / r.width ) * 2.2 )
		);
		params.frame.y = Math.max(
			-1,
			Math.min( 1, drag.fy - ( dy / r.height ) * 2.2 )
		);
		activePreset = '';
		syncPresets();
		schedule();
	} );
	const endDrag = () => {
		drag = null;
	};
	canvas.addEventListener( 'pointerup', endDrag );
	canvas.addEventListener( 'pointercancel', endDrag );

	/* ------------------------------ lifecycle ----------------------------- */

	const onResize = () => schedule();
	const viewRO =
		'function' === typeof window.ResizeObserver
			? new window.ResizeObserver( () => schedule() )
			: null;
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		window.clearTimeout( timer );
		bakeToken++;
		tileToken++;
		window.removeEventListener( 'resize', onResize );
		if ( viewRO ) {
			viewRO.disconnect();
		}
		document.removeEventListener( 'keydown', onKey );
		for ( const m of mounts.splice( 0 ) ) {
			try {
				m.unmount();
			} catch ( e ) {}
		}
		backdrop.remove();
	}
	window.addEventListener( 'resize', onResize );
	if ( viewRO ) {
		viewRO.observe( view );
	}
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* -------------------------------- insert ------------------------------ */

	async function doInsert() {
		if ( apply.disabled ) {
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the mosaic' ) );
		try {
			const baked = await bake( true, ++bakeToken );
			if ( ! baked ) {
				throw new Error( t( 'Could not insert the mosaic.' ) );
			}
			const url = baked.toDataURL( 'image/png' );
			const doc = editor.state.doc;
			const fit = Math.min(
				( doc.w * 0.92 ) / baked.width,
				( doc.h * 0.92 ) / baked.height
			);
			const w = Math.round( baked.width * fit );
			const h = Math.round( baked.height * fit );
			const stored = { ...params };
			if ( editing ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: url,
						naturalW: baked.width,
						naturalH: baked.height,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update mosaic' ) );
				setStatus( t( 'Mosaic updated.' ) );
			} else {
				const imgLayer = bridge.documents.makeImage( {
					name: t( 'Photo Mosaic' ),
					x: Math.round( ( doc.w - w ) / 2 ),
					y: Math.round( ( doc.h - h ) / 2 ),
					w,
					h,
					src: url,
					naturalW: baked.width,
					naturalH: baked.height,
				} );
				imgLayer.generator = { id: GEN_ID, params: stored };
				editor.dispatch( { type: 'ADD_LAYER', layer: imgLayer } );
				editor.dispatch( { type: 'SET_ACTIVE', id: imgLayer.id } );
				editor.commit( t( 'Insert mosaic' ) );
				setStatus( t( 'Inserted.' ) );
			}
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the mosaic.' ),
				true
			);
			apply.disabled = false;
		}
	}

	/* --------------------------------- boot ------------------------------- */

	void extras;
	void footHint;
	renderSide();
	syncPresets();
	requestAnimationFrame( () => {
		syncTileInfo();
		loadSource();
		if ( params.tiles.length ) {
			loadTiles();
		}
	} );
	// What the QA harness reads.
	window.__photoMosaic = {
		getState: () => params,
		tiles: () => activeTiles().length,
		set: ( patch ) => {
			Object.assign( params, patch );
			renderSide();
			schedule();
		},
	};
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Photo Mosaic',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-photo-mosaic', register );
}
