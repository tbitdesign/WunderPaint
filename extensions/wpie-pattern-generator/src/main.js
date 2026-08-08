/**
 * Seamless Patterns - WPIE extension entry.
 *
 * Seamless patterns from a seed: ten motif builders fill a design
 * cell, a rapport (straight, half-drop, brick, mirror) turns it into
 * a repeat tile, curated palettes keep every roll harmonic. The
 * preview IS the pattern - drag elements (they wrap around the tile
 * edge live), roll colorways, then insert the pattern as an editable
 * fill layer, register the tile in the editor's pattern library, or
 * download it as PNG/SVG.
 */

import {
	MOTIFS,
	motifById,
	ELEMENT_MOTIFS,
	GLYPH_SETS,
	glyphSetById,
	glyphPool,
	PALETTES,
	palOf,
	bgColor,
	expandPlaces,
	cellElements,
	elementsInTile,
	toSvgTile,
} from './pattern-core.js';
import { renderTile, ensureStamp, stampImage } from './render.js';

const GEN_ID = 'wpie-pattern-generator/pattern';

import { t } from './i18n.js';


/* ------------------------------ DOM helpers ------------------------------ */

function el( tag, cls, parent ) {
	const node = document.createElement( tag );
	if ( cls ) {
		node.className = cls;
	}
	if ( parent ) {
		parent.appendChild( node );
	}
	return node;
}

function row( parent, label ) {
	const r = el( 'div', 'wpiepg-row', parent );
	const s = el( 'span', 'dsm-label', r );
	s.textContent = label;
	return r;
}

function slider( parent, label, min, max, value, oninput, unit = '' ) {
	const r = row( parent, label );
	r.classList.add( 'has-val' );
	const input = el( 'input', 'dsm-range', r );
	input.type = 'range';
	input.min = String( min );
	input.max = String( max );
	input.value = String( value );
	const val = el( 'span', 'wpiepg-val', r );
	val.textContent = input.value + unit;
	input.oninput = () => {
		val.textContent = input.value + unit;
		oninput( parseInt( input.value, 10 ) );
	};
	return input;
}

function select( parent, label, options, value, onchange ) {
	const r = row( parent, label );
	const sel = el( 'select', 'dsm-select', r );
	for ( const [ v, lab ] of options ) {
		const o = el( 'option', null, sel );
		o.value = v;
		o.textContent = lab;
	}
	sel.value = value;
	sel.onchange = () => onchange( sel.value );
	return sel;
}

function section( parent, icon, label ) {
	const card = el( 'div', 'wpiepg-card', parent );
	const head = el( 'div', 'wpiepg-card-head', card );
	head.innerHTML = icon + '<span>' + label + '</span>';
	return el( 'div', 'wpiepg-card-body', card );
}

const tabIcon = ( d, size = 15 ) =>
	'<svg xmlns="http://www.w3.org/2000/svg" width="' +
	size +
	'" height="' +
	size +
	'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="' +
	d +
	'"/></svg>';

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03,.14-.09,.17-.17l.91-2.45c.03-.07,.13-.07,.16,0Z"/></svg>';

const ICONS = {
	presets: tabIcon(
		'M4 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M14 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M4 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M14 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z'
	),
	pattern: tabIcon(
		'M6 21l15 -15l-3 -3l-15 15l3 3 M15 6l3 3 M9 3a2 2 0 0 0 2 2a2 2 0 0 0 -2 2a2 2 0 0 0 -2 -2a2 2 0 0 0 2 -2'
	),
	rapport: tabIcon(
		'M4 4h6v6h-6z M14 4h6v6h-6z M4 14h6v6h-6z M14 14h6v6h-6z'
	),
	colors: tabIcon(
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'
	),
	lib: tabIcon(
		'M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2 -2v-2 M7 11l5 5l5 -5 M12 4l0 12'
	),
};
const ICON_DICE = tabIcon(
	'M3 5a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v14a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-14 M8 8.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0 M15 8.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0 M15 15.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0 M8 15.5a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0 M11.5 12a.5 .5 0 1 0 1 0a.5 .5 0 1 0 -1 0',
	16
);
const ICON_CLOSE =
	'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

/* -------------------------------- defaults ------------------------------- */

const DEFAULTS = {
	motif: 'scatter',
	set: 'geo',
	seed: 7,
	count: 14,
	size: 55,
	jitter: 60,
	rot: 35,
	weight: 50,
	alpha: 100,
	freqI: 3,
	variety: 40,
	dir: 2,
	phase: 30,
	amp: 50,
	palette: 'nordlicht',
	customBase: '#3b66ff',
	colorway: 0,
	reverse: 0,
	bg: 'light',
	bgCustom: '#ffffff',
	repeat: 'halfdrop',
	cellPx: 256,
	shift: { x: 0, y: 0 },
	moved: [],
	added: [],
	removed: [],
	set2: '',
	riso: 0,
	dash: '',
	stampData: '',
	kitColors: [],
	kitName: '',
};

/** Which dials each motif exposes (key -> label + range). */
const MOTIF_PARAMS = {
	scatter: [
		[ 'count', 'Count', 4, 30 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'jitter', 'Jitter', 0, 100 ],
		[ 'rot', 'Rotation', 0, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	gitter: [
		[ 'count', 'Columns', 2, 10 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
		[ 'rot', 'Rotation', 0, 100 ],
		[ 'jitter', 'Jitter', 0, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	raute: [
		[ 'count', 'Columns', 2, 10 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
		[ 'rot', 'Rotation', 0, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	punkte: [
		[ 'count', 'Columns', 3, 14 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
	streifen: [
		[ 'count', 'Count', 2, 16 ],
		[ 'weight', 'Weight', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
	wellen: [
		[ 'count', 'Count', 3, 24 ],
		[ 'amp', 'Amplitude', 0, 100 ],
		[ 'freqI', 'Frequency', 1, 6 ],
		[ 'phase', 'Phase', 0, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	chevron: [
		[ 'count', 'Count', 2, 14 ],
		[ 'freqI', 'Teeth', 1, 8 ],
		[ 'amp', 'Amplitude', 0, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	schuppen: [
		[ 'count', 'Columns', 3, 14 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	karo: [
		[ 'count', 'Count', 4, 16 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
	terrazzo: [
		[ 'count', 'Count', 6, 36 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'jitter', 'Jitter', 0, 100 ],
	],
	truchet: [
		[ 'count', 'Count', 2, 12 ],
		[ 'weight', 'Weight', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
	hex: [
		[ 'count', 'Columns', 3, 12 ],
		[ 'size', 'Size', 10, 100 ],
		[ 'weight', 'Weight', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
	ogee: [
		[ 'count', 'Count', 3, 16 ],
		[ 'amp', 'Amplitude', 0, 100 ],
		[ 'freqI', 'Frequency', 1, 4 ],
		[ 'weight', 'Weight', 10, 100 ],
	],
	schraffur: [
		[ 'count', 'Count', 4, 16 ],
		[ 'weight', 'Weight', 10, 100 ],
		[ 'variety', 'Variety', 0, 100 ],
	],
};

const SET_MOTIFS = [ 'scatter', 'gitter', 'raute' ];

/* -------------------------------- presets -------------------------------- */

const PRESETS = [
	{ name: 'Bauhaus grid', p: { motif: 'gitter', set: 'geo', palette: 'bauhaus', count: 5, size: 60, variety: 70, rot: 60, jitter: 0, bg: 'light', repeat: 'straight', seed: 11 } },
	{ name: 'Memphis party', p: { motif: 'scatter', set: 'memphis', palette: 'bauhaus', count: 16, size: 55, jitter: 70, rot: 70, bg: 'light', repeat: 'halfdrop', seed: 23 } },
	{ name: 'Botanical garden', p: { motif: 'scatter', set: 'botanik', palette: 'salbei', count: 12, size: 62, jitter: 60, rot: 45, bg: 'light', repeat: 'halfdrop', seed: 5 } },
	{ name: 'Starry sky', p: { motif: 'scatter', set: 'himmel', palette: 'royal', count: 18, size: 42, jitter: 75, rot: 30, bg: 'dark', repeat: 'halfdrop', seed: 31 } },
	{ name: 'Terrazzo', p: { motif: 'terrazzo', palette: 'terracotta', count: 16, size: 55, jitter: 90, bg: 'light', repeat: 'straight', seed: 8 } },
	{ name: 'Polka', p: { motif: 'punkte', palette: 'rose', count: 6, size: 55, variety: 60, bg: 'light', repeat: 'straight', seed: 3 } },
	{ name: 'Diagonals', p: { motif: 'streifen', dir: 2, palette: 'royal', count: 8, weight: 55, variety: 52, bg: 'dark', repeat: 'straight', seed: 9 } },
	{ name: 'Ocean waves', p: { motif: 'wellen', palette: 'ozean', count: 12, amp: 62, freqI: 2, phase: 45, weight: 60, bg: 'light', repeat: 'straight', seed: 6 } },
	{ name: 'Fish scales', p: { motif: 'schuppen', palette: 'nordlicht', count: 7, size: 70, weight: 45, bg: 'light', repeat: 'straight', seed: 12 } },
	{ name: 'Vichy', p: { motif: 'karo', palette: 'terracotta', count: 8, variety: 30, bg: 'light', repeat: 'straight', seed: 2 } },
	{ name: 'Herringbone', p: { motif: 'chevron', palette: 'zitrus', count: 8, freqI: 4, amp: 55, weight: 62, bg: 'dark', repeat: 'straight', seed: 14 } },
	{ name: 'Heart mirror', p: { motif: 'scatter', set: 'herzen', palette: 'rose', count: 10, size: 58, jitter: 65, rot: 55, bg: 'light', repeat: 'mirror', seed: 19 } },
];

/**
 * Curated random roll: everything from vetted sets and couplings, so
 * even the wildest dice throw looks designed.
 */
function curatedRoll() {
	const rand = ( n ) => Math.floor( Math.random() * n );
	const motif = MOTIFS[ rand( MOTIFS.length ) ].id;
	const structured = ! ELEMENT_MOTIFS.includes( motif );
	const palette = PALETTES[ rand( PALETTES.length ) ].id;
	const bg = [ 'light', 'light', 'dark', '' ][ rand( 4 ) ];
	return {
		...DEFAULTS,
		motif,
		set: GLYPH_SETS[ rand( GLYPH_SETS.length ) ].id,
		seed: 1 + rand( 99999 ),
		count: structured
			? 3 + rand( 10 )
			: 8 + rand( 18 ),
		size: 35 + rand( 55 ),
		jitter: 30 + rand( 65 ),
		rot: rand( 95 ),
		weight: 25 + rand( 60 ),
		freqI: 1 + rand( 5 ),
		variety: rand( 101 ),
		dir: rand( 4 ),
		phase: rand( 101 ),
		amp: 30 + rand( 60 ),
		palette,
		colorway: rand( 5 ),
		reverse: Math.random() < 0.3 ? 1 : 0,
		bg,
		repeat: structured
			? [ 'straight', 'straight', 'halfdrop', 'mirror' ][ rand( 4 ) ]
			: [ 'straight', 'halfdrop', 'halfdrop', 'brick', 'mirror' ][
					rand( 5 )
			  ],
		shift: { x: 0, y: 0 },
		moved: [],
		added: [],
		removed: [],
		set2:
			Math.random() < 0.25
				? GLYPH_SETS[ rand( GLYPH_SETS.length ) ].id
				: '',
		riso: Math.random() < 0.22 ? 20 + rand( 60 ) : 0,
		dash: Math.random() < 0.18 ? ( Math.random() < 0.5 ? 'dash' : 'dot' ) : '',
		stampData: '',
	};
}

/* --------------------------------- dialog -------------------------------- */

async function openStudio( { editor, layer } ) {
	const bridge = window.WPIE && window.WPIE.bridge;
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = editing
		? {
				...DEFAULTS,
				...layer.generator.params,
				shift: { ...( layer.generator.params.shift || { x: 0, y: 0 } ) },
				moved: ( layer.generator.params.moved || [] ).map( ( m ) => ( { ...m } ) ),
				added: ( layer.generator.params.added || [] ).map( ( a ) => ( { ...a } ) ),
				removed: ( layer.generator.params.removed || [] ).slice(),
		  }
		: {
				...DEFAULTS,
				seed: 1 + Math.floor( Math.random() * 99999 ),
				shift: { x: 0, y: 0 },
				moved: [],
				added: [],
				removed: [],
		  };

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiepg-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Seamless Patterns' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	const titleRow = el( 'div', 'dsm-title-row', titles );
	el( 'span', 'dsm-title', titleRow ).textContent = 'Seamless Patterns';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = editing
		? t( 'Adjust the pattern, the layer updates in place.' )
		: t( 'Seamless patterns: set the dials, roll the dice.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', 'Close' );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiepg-body', dialog );
	const view = el( 'div', 'wpiepg-view', body );
	const canvas = el( 'canvas', null, view );
	const side = el( 'div', 'wpiepg-side', body );
	const controls = el( 'div', 'wpiepg-controls', side );

	const doc = editor.state.doc;

	/* ------------------------------- preview ------------------------------ */

	const PRE = 132; // cell edge in preview px at zoom 1
	let zoom = 1;
	let showFrame = false;
	let tileCache = null;
	let tileDirty = true;

	const markDirty = () => {
		tileDirty = true;
	};

	function renderPreview() {
		const w = view.clientWidth;
		const h = view.clientHeight;
		if ( ! w || ! h ) {
			return;
		}
		if ( canvas.width !== w || canvas.height !== h ) {
			canvas.width = w;
			canvas.height = h;
		}
		if ( tileDirty || ! tileCache ) {
			tileCache = renderTile( params, Math.round( PRE * 2 ) );
			tileDirty = false;
		}
		const ctx = canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, w, h );
		const pat = ctx.createPattern( tileCache, 'repeat' );
		ctx.save();
		const s = zoom / 2; // tile rendered at 2x for crispness
		ctx.scale( s, s );
		ctx.fillStyle = pat;
		ctx.fillRect( 0, 0, w / s, h / s );
		ctx.restore();
		if ( showFrame ) {
			const { cols, rows } = expandPlaces( params.repeat );
			ctx.strokeStyle = 'rgba(120, 150, 255, 0.9)';
			ctx.setLineDash( [ 6, 5 ] );
			ctx.lineWidth = 1.4;
			ctx.strokeRect(
				0.5,
				0.5,
				cols * PRE * zoom,
				rows * PRE * zoom
			);
			ctx.setLineDash( [] );
		}
	}

	let rafPending = false;
	const queuePreview = () => {
		if ( rafPending ) {
			return;
		}
		rafPending = true;
		window.requestAnimationFrame( () => {
			rafPending = false;
			renderPreview();
		} );
	};

	/* -------------------------------- presets ------------------------------ */

	const presetBody = section( controls, ICONS.presets, t( 'Presets' ) );
	const presetGrid = el( 'div', 'wpiepg-presets', presetBody );

	// The big, findable randomizer right under the presets - same
	// pattern as Generative/Effects Studio ("Surprise me!").
	const rollBtn = el( 'button', 'ai-btn primary wpiepg-rollbtn', presetBody );
	rollBtn.type = 'button';
	rollBtn.innerHTML = ICON_DICE + ' ' + t( 'Surprise me!' );

	const miniTile = ( P ) => {
		const c = document.createElement( 'canvas' );
		c.width = 76;
		c.height = 76;
		const ctx = c.getContext( '2d' );
		const tile = renderTile( P, 38 );
		if ( ! bgColor( P ) ) {
			ctx.fillStyle = '#20242b';
			ctx.fillRect( 0, 0, 76, 76 );
		}
		ctx.fillStyle = ctx.createPattern( tile, 'repeat' );
		ctx.fillRect( 0, 0, 76, 76 );
		return c;
	};

	const applyParams = ( next ) => {
		Object.assign( params, next );
		syncUi();
		markDirty();
		renderPreview();
	};
	rollBtn.onclick = () => applyParams( curatedRoll() );

	function renderPresets() {
		presetGrid.innerHTML = '';
		for ( const pre of PRESETS ) {
			const btn = el( 'button', 'wpiepg-preset', presetGrid );
			btn.type = 'button';
			btn.appendChild(
				miniTile( { ...DEFAULTS, ...pre.p, shift: { x: 0, y: 0 }, moved: [], added: [], removed: [] } )
			);
			el( 'span', null, btn ).textContent = t( pre.name );
			btn.onclick = () =>
				applyParams( {
					...DEFAULTS,
					...pre.p,
					shift: { x: 0, y: 0 },
					moved: [],
					added: [],
					removed: [],
				} );
		}
		// Four surprises, re-rolled on every open - the gallery of chance.
		for ( let i = 0; i < 4; i++ ) {
			const P = curatedRoll();
			const btn = el( 'button', 'wpiepg-preset', presetGrid );
			btn.type = 'button';
			btn.appendChild( miniTile( P ) );
			el( 'span', null, btn ).textContent = '? ' + ( i + 1 );
			btn.onclick = () => applyParams( { ...P } );
		}
	}

	/* ------------------------------- favorites ------------------------------ */

	// Favorites in the per-user bridge store (v2.2.0, API 2.10); the old
	// localStorage list migrates once.
	const NS = 'wpie-pattern-generator';
	let store = {};
	try {
		store = ( await bridge.storage.get( NS ) ) || {};
	} catch ( e ) {
		store = {};
	}
	if ( undefined === store.favs ) {
		try {
			const legacy = JSON.parse(
				window.localStorage.getItem( 'wpiepg-favs' ) || '[]'
			);
			store.favs = Array.isArray( legacy ) ? legacy : [];
			bridge.storage.set( NS, store );
		} catch ( e ) {
			store.favs = [];
		}
	}
	const readFavs = () =>
		Array.isArray( store.favs ) ? store.favs : [];
	const writeFavs = ( list ) => {
		store.favs = list.slice( -12 );
		try {
			bridge.storage.set( NS, store );
		} catch ( e ) {}
	};
	const favBtn = el( 'button', 'ai-btn secondary wpiepg-favbtn', presetBody );
	favBtn.type = 'button';
	favBtn.textContent = '★ ' + t( 'Save as favorite' );
	const favGrid = el( 'div', 'wpiepg-presets wpiepg-favs', presetBody );

	function renderFavs() {
		const favs = readFavs();
		favGrid.innerHTML = '';
		favGrid.style.display = favs.length ? '' : 'none';
		favs.forEach( ( fav, idx ) => {
			const btn = el( 'button', 'wpiepg-preset', favGrid );
			btn.type = 'button';
			btn.appendChild( miniTile( { ...DEFAULTS, ...fav } ) );
			el( 'span', null, btn ).textContent = '★ ' + ( idx + 1 );
			const x = el( 'span', 'wpiepg-fav-del', btn );
			x.textContent = '×';
			x.onclick = ( e ) => {
				e.stopPropagation();
				const list = readFavs();
				list.splice( idx, 1 );
				writeFavs( list );
				renderFavs();
			};
			btn.onclick = () =>
				applyParams( { ...DEFAULTS, ...fav } );
		} );
	}
	favBtn.onclick = () => {
		const fav = {
			...params,
			shift: { ...params.shift },
			moved: params.moved.map( ( m ) => ( { ...m } ) ),
			added: params.added.map( ( a ) => ( { ...a } ) ),
			removed: params.removed.slice(),
		};
		// Stamps are per-document bitmaps - favorites store the recipe,
		// not the image (localStorage is small).
		delete fav.stampData;
		if ( 'stamp' === fav.set ) {
			fav.set = 'geo';
		}
		writeFavs( readFavs().concat( [ fav ] ) );
		renderFavs();
	};

	/* -------------------------------- pattern ------------------------------ */

	const patternBody = section( controls, ICONS.pattern, t( 'Pattern' ) );
	const motSel = select(
		patternBody,
		t( 'Motif' ),
		MOTIFS.map( ( m ) => [ m.id, t( m.label ) ] ),
		params.motif,
		( v ) => {
			params.motif = v;
			params.shift = { x: 0, y: 0 };
			params.moved = [];
			params.added = [];
			params.removed = [];
			syncUi();
			markDirty();
			renderPreview();
		}
	);
	const setRow = select(
		patternBody,
		t( 'Doodle set' ),
		GLYPH_SETS.map( ( s ) => [ s.id, t( s.label ) ] ).concat( [
			[ 'stamp', t( 'Own layer (stamp)' ) ],
		] ),
		params.set,
		( v ) => {
			params.set = v;
			params.moved = [];
			params.added = [];
			params.removed = [];
			if ( 'stamp' === v && ! params.stampData ) {
				captureStamp();
			}
			syncUi();
			markDirty();
			renderPreview();
		}
	);
	const set2Row = select(
		patternBody,
		t( 'Second set' ),
		[ [ '', t( 'Off' ) ] ].concat(
			GLYPH_SETS.map( ( s ) => [ s.id, t( s.label ) ] )
		),
		params.set2 || '',
		( v ) => {
			params.set2 = v;
			params.moved = [];
			params.added = [];
			params.removed = [];
			markDirty();
			renderPreview();
		}
	);
	// Stamp row: thumbnail + capture button (visible for set 'stamp').
	const stampRow = el( 'div', 'wpiepg-row wpiepg-stamprow', patternBody );
	const stampThumb = el( 'span', 'wpiepg-stampthumb', stampRow );
	const stampBtn = el( 'button', 'ai-btn secondary', stampRow );
	stampBtn.type = 'button';
	stampBtn.textContent = t( 'Use active layer' );
	const stampNote = el( 'div', 'wpiepg-note', patternBody );
	stampNote.style.display = 'none';

	async function captureStamp() {
		const st = editor.state;
		const active = ( st.layers || [] ).find(
			( l ) =>
				l.id === st.activeId &&
				( ! layer || l.id !== layer.id )
		);
		if ( ! active || ! bridge?.raster?.renderToCanvas ) {
			stampNote.style.display = '';
			stampNote.textContent = t(
				'Select a layer in the editor first.'
			);
			return;
		}
		// Group stamps include everything inside the group.
		const members = [ active ];
		if ( 'group' === active.type ) {
			const inGroup = new Set( [ active.id ] );
			for ( const l of st.layers ) {
				if ( l.parent && inGroup.has( l.parent ) ) {
					inGroup.add( l.id );
					members.push( l );
				}
			}
		}
		// Rotation-aware bounding box around the layer.
		const rad = ( ( active.rot || 0 ) * Math.PI ) / 180;
		const bw =
			Math.abs( Math.cos( rad ) * active.w ) +
			Math.abs( Math.sin( rad ) * active.h );
		const bh =
			Math.abs( Math.sin( rad ) * active.w ) +
			Math.abs( Math.cos( rad ) * active.h );
		const viewport = {
			x: active.x + active.w / 2 - bw / 2,
			y: active.y + active.h / 2 - bh / 2,
			w: Math.max( 2, bw ),
			h: Math.max( 2, bh ),
		};
		const scale = Math.min( 4, 384 / Math.max( viewport.w, viewport.h ) );
		try {
			const c = await bridge.raster.renderToCanvas(
				st.doc,
				members,
				{
					viewport,
					scale,
					cache: bridge.raster.sharedImageCache,
				}
			);
			params.stampData = c.toDataURL( 'image/png' );
			await ensureStamp( params.stampData );
			stampNote.style.display = '';
			stampNote.textContent = t( 'Layer captured as stamp.' );
			syncUi();
			markDirty();
			renderPreview();
		} catch ( e ) {
			stampNote.style.display = '';
			stampNote.textContent = t(
				'Select a layer in the editor first.'
			);
		}
	}
	stampBtn.onclick = captureStamp;
	const seedRow = row( patternBody, t( 'Seed' ) );
	const seedVal = el( 'span', 'wpiepg-seed', seedRow );
	seedVal.textContent = String( params.seed );
	const diceBtn = el( 'button', 'wpiepg-dice', seedRow );
	diceBtn.type = 'button';
	diceBtn.title = t( 'New seed' );
	diceBtn.innerHTML = ICON_DICE;
	diceBtn.onclick = () => {
		params.seed = 1 + Math.floor( Math.random() * 99999 );
		params.moved = [];
		params.added = [];
		params.removed = [];
		seedVal.textContent = String( params.seed );
		markDirty();
		renderPreview();
	};
	const dialHost = el( 'div', 'wpiepg-dials', patternBody );

	function renderDials() {
		dialHost.innerHTML = '';
		for ( const [ key, label, min, max ] of MOTIF_PARAMS[ params.motif ] ||
			[] ) {
			slider( dialHost, t( label ), min, max, params[ key ], ( v ) => {
				params[ key ] = v;
				markDirty();
				queuePreview();
			} );
		}
		if ( 'streifen' === params.motif ) {
			select(
				dialHost,
				t( 'Direction' ),
				[
					[ '0', t( 'Horizontal' ) ],
					[ '1', t( 'Vertical' ) ],
					[ '2', t( 'Diagonal down' ) ],
					[ '3', t( 'Diagonal up' ) ],
				],
				String( params.dir ),
				( v ) => {
					params.dir = parseInt( v, 10 );
					markDirty();
					renderPreview();
				}
			);
		}
		slider( dialHost, t( 'Opacity' ), 20, 100, params.alpha, ( v ) => {
			params.alpha = v;
			markDirty();
			queuePreview();
		} );
	}

	/* -------------------------------- rapport ------------------------------ */

	const rapportBody = section( controls, ICONS.rapport, t( 'Rapport' ) );
	const repSel = select(
		rapportBody,
		t( 'Repeat' ),
		[
			[ 'straight', t( 'Straight' ) ],
			[ 'halfdrop', t( 'Half-drop' ) ],
			[ 'brick', t( 'Brick' ) ],
			[ 'mirror', t( 'Mirror' ) ],
		],
		params.repeat,
		( v ) => {
			params.repeat = v;
			markDirty();
			renderPreview();
		}
	);
	select(
		rapportBody,
		t( 'Tile size' ),
		[
			[ '128', '128 px' ],
			[ '256', '256 px' ],
			[ '384', '384 px' ],
			[ '512', '512 px' ],
		],
		String( params.cellPx ),
		( v ) => {
			params.cellPx = parseInt( v, 10 );
		}
	);
	const zoomSlider = slider(
		rapportBody,
		t( 'Zoom' ),
		35,
		320,
		Math.round( zoom * 100 ),
		( v ) => {
			zoom = v / 100;
			queuePreview();
		},
		'%'
	);
	const frameRow = el( 'label', 'wpiepg-check', rapportBody );
	const frameCb = el( 'input', null, frameRow );
	frameCb.type = 'checkbox';
	frameCb.checked = showFrame;
	el( 'span', null, frameRow ).textContent = t( 'Show tile frame' );
	frameCb.onchange = () => {
		showFrame = frameCb.checked;
		renderPreview();
	};

	/* --------------------------------- colors ------------------------------ */

	const colorsBody = section( controls, ICONS.colors, t( 'Colors' ) );
	// Brand kits (Pro, window.WPIE.brandKits) join the palette list.
	// Selecting one copies its colors into the params, so the pattern
	// stays reproducible even if the kit changes later.
	const KITS = ( bridge.brand
		? bridge.brand.kits()
		: ( window.WPIE && window.WPIE.brandKits ) || []
	).filter( ( k ) => k && k.name && ( k.colors || [] ).length > 1 );
	const palSel = select(
		colorsBody,
		t( 'Palette' ),
		PALETTES.map( ( p ) => [ p.id, t( p.label ) ] )
			.concat( [ [ 'custom', t( 'Custom (brand color)' ) ] ] )
			.concat(
				KITS.map( ( k, i ) => [ 'kit:' + i, '★ ' + k.name ] )
			),
		params.palette,
		( v ) => {
			if ( v.startsWith( 'kit:' ) ) {
				const kit = KITS[ parseInt( v.slice( 4 ), 10 ) ];
				params.palette = 'kit';
				params.kitName = kit.name;
				params.kitColors = ( kit.colors || [] )
					.filter( ( c ) => /^#[0-9a-f]{6}$/i.test( c ) )
					.slice( 0, 8 );
			} else {
				params.palette = v;
			}
			syncUi();
			markDirty();
			renderPreview();
		}
	);
	const palSelValue = () => {
		if ( 'kit' !== params.palette ) {
			return params.palette;
		}
		const idx = KITS.findIndex( ( k ) => k.name === params.kitName );
		if ( idx >= 0 ) {
			return 'kit:' + idx;
		}
		// The kit is gone but its colors travel in the params: keep a
		// phantom entry so the select still tells the truth.
		if ( ! palSel.querySelector( 'option[value="kit:saved"]' ) ) {
			const o = el( 'option', null, palSel );
			o.value = 'kit:saved';
			o.textContent = '★ ' + ( params.kitName || 'Brand Kit' );
		}
		return 'kit:saved';
	};
	// Brand color picker in a plain div row (editor rule: never inside
	// a label row) with a bare input fallback without the bridge.
	const baseRow = el( 'div', 'wpiepg-row wpiepg-baserow', colorsBody );
	el( 'span', 'dsm-label', baseRow ).textContent = t( 'Base color' );
	const baseHost = el( 'div', 'wpiepg-colorhost', baseRow );
	let baseHandle = null;
	const mountColor = ( node, value, onChange ) => {
		if ( bridge?.components?.mountColorButton ) {
			return bridge.components.mountColorButton( node, {
				color: value,
				onChange,
				title: t( 'Base color' ),
			} );
		}
		const input = el( 'input', null, node );
		input.type = 'color';
		input.value = value;
		input.oninput = () => onChange( input.value );
		return { set: ( v ) => ( input.value = v ) };
	};
	baseHandle = mountColor( baseHost, params.customBase, ( c ) => {
		params.customBase = c;
		renderChips();
		markDirty();
		queuePreview();
	} );
	const chips = el( 'div', 'wpiepg-chips', colorsBody );
	function renderChips() {
		chips.innerHTML = '';
		for ( const c of palOf( params ).colors ) {
			const d = el( 'span', 'wpiepg-chip', chips );
			d.style.background = c;
		}
	}
	const wayBtnRow = el( 'div', 'wpiepg-row', colorsBody );
	const wayBtn = el( 'button', 'ai-btn secondary', wayBtnRow );
	wayBtn.type = 'button';
	wayBtn.textContent = t( 'New colorway' );
	wayBtn.onclick = () => {
		params.colorway = ( params.colorway + 1 ) % 5;
		markDirty();
		renderPreview();
	};
	const revRow = el( 'label', 'wpiepg-check', colorsBody );
	const revCb = el( 'input', null, revRow );
	revCb.type = 'checkbox';
	revCb.checked = !! params.reverse;
	el( 'span', null, revRow ).textContent = t( 'Reverse order' );
	revCb.onchange = () => {
		params.reverse = revCb.checked ? 1 : 0;
		renderChips();
		markDirty();
		renderPreview();
	};
	const bgSel = select(
		colorsBody,
		t( 'Background' ),
		[
			[ '', t( 'Transparent' ) ],
			[ 'light', t( 'Light (palette)' ) ],
			[ 'dark', t( 'Dark (palette)' ) ],
			[ 'custom', t( 'Custom color' ) ],
		],
		params.bg,
		( v ) => {
			params.bg = v;
			syncUi();
			markDirty();
			renderPreview();
		}
	);
	const bgRow = el( 'div', 'wpiepg-row wpiepg-bgrow', colorsBody );
	el( 'span', 'dsm-label', bgRow ).textContent = t( 'Custom color' );
	const bgHost = el( 'div', 'wpiepg-colorhost', bgRow );
	const bgHandle = mountColor( bgHost, params.bgCustom, ( c ) => {
		params.bgCustom = c;
		markDirty();
		queuePreview();
	} );

	/* -------------------------------- effects ------------------------------ */

	const fxBody = section( controls, ICONS.pattern, t( 'Effects' ) );
	const risoSlider = slider(
		fxBody,
		t( 'Offset print' ),
		0,
		100,
		params.riso,
		( v ) => {
			params.riso = v;
			markDirty();
			queuePreview();
		}
	);
	const dashSel = select(
		fxBody,
		t( 'Line style' ),
		[
			[ '', t( 'Solid' ) ],
			[ 'dash', t( 'Dashed' ) ],
			[ 'dot', t( 'Dotted' ) ],
		],
		params.dash || '',
		( v ) => {
			params.dash = v;
			markDirty();
			renderPreview();
		}
	);

	/* ------------------------------ library card --------------------------- */

	const libBody = section( controls, ICONS.lib, t( 'Pattern library' ) );
	const nameRow = row( libBody, t( 'Name' ) );
	const nameInput = el( 'input', 'dsm-input', nameRow );
	nameInput.type = 'text';
	nameInput.maxLength = 24;
	nameInput.value = ( editing && layer?.name ) || 'Pattern ' + params.seed;
	const saveBtn = el( 'button', 'ai-btn secondary', libBody );
	saveBtn.type = 'button';
	saveBtn.textContent = t( 'Save as fill pattern' );
	const libNote = el( 'div', 'wpiepg-note', libBody );
	libNote.textContent = t(
		'The tile repeats seamlessly in every direction.'
	);
	const tileDataUrl = async () => {
		await ensureStamp( params.stampData );
		return renderTile( params, params.cellPx ).toDataURL( 'image/png' );
	};
	saveBtn.onclick = async () => {
		const boot = window.WPIE || {};
		const url =
			String( boot.restUrl || '' ).replace( /\/$/, '' ) +
			'/library/pattern';
		saveBtn.disabled = true;
		try {
			const res = await window.fetch( url, {
				method: 'POST',
				credentials: 'same-origin',
				headers: {
					'Content-Type': 'application/json',
					'X-WP-Nonce': boot.nonce || '',
				},
				body: JSON.stringify( {
					item: {
						name:
							( nameInput.value || 'Pattern' ).slice( 0, 24 ),
						dataUrl: await tileDataUrl(),
					},
				} ),
			} );
			if ( ! res.ok ) {
				throw new Error( 'save' );
			}
			libNote.textContent = t(
				'Saved. The tile is now available as a pattern fill for shapes and text.'
			);
		} catch ( e ) {
			libNote.textContent = t( 'Could not save the pattern.' );
		}
		saveBtn.disabled = false;
	};
	const dlPng = el( 'button', 'ai-btn secondary', libBody );
	dlPng.type = 'button';
	dlPng.textContent = t( 'Download PNG tile' );
	dlPng.onclick = async () => {
		const a = document.createElement( 'a' );
		a.href = await tileDataUrl();
		a.download = 'pattern-' + params.motif + '-' + params.seed + '.png';
		a.click();
	};
	const dlSvg = el( 'button', 'ai-btn secondary', libBody );
	dlSvg.type = 'button';
	dlSvg.textContent = t( 'Download SVG tile' );
	dlSvg.onclick = async () => {
		await ensureStamp( params.stampData );
		const img = stampImage( params.stampData );
		const stamp = img
			? {
					href: params.stampData,
					aspect: img.height / Math.max( 1, img.width ),
			  }
			: null;
		const blob = new Blob(
			[ toSvgTile( params, params.cellPx, stamp ) ],
			{
				type: 'image/svg+xml',
			}
		);
		const a = document.createElement( 'a' );
		a.href = URL.createObjectURL( blob );
		a.download = 'pattern-' + params.motif + '-' + params.seed + '.svg';
		a.click();
		window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
	};

	/* --------------------------------- foot -------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = t(
		'Inserts the pattern as an editable fill layer in document size.'
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.type = 'button';
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.type = 'button';
	apply.textContent = editing
		? t( 'Update pattern' )
		: t( 'Insert pattern' );

	apply.onclick = async () => {
		const url = await tileDataUrl();
		// Pre-decode the tile so the very first canvas paint after the
		// dispatch shows the pattern (feature-detect: older cores warm
		// the tile on their own since v1.287.1).
		try {
			await bridge.raster?.registerUserTile?.( url );
		} catch ( e ) {}
		const stored = {
			...params,
			shift: { ...params.shift },
			moved: params.moved.map( ( m ) => ( { ...m } ) ),
			added: params.added.map( ( a ) => ( { ...a } ) ),
			removed: params.removed.slice(),
		};
		const name = ( nameInput.value || 'Pattern ' + params.seed ).slice(
			0,
			24
		);
		if ( editing ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					patternData: url,
					pattern: 'custom',
					fillType: 'pattern',
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.commit( t( 'Update pattern' ) );
		} else {
			const newLayer = bridge.documents.makeShape( {
				name,
				shape: 'rect',
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				fill: '#ffffff',
				fillType: 'pattern',
				pattern: 'custom',
				patternData: url,
			} );
			newLayer.generator = { id: GEN_ID, params: stored };
			editor.dispatch( { type: 'ADD_LAYER', layer: newLayer } );
			editor.commit( 'Seamless Patterns' );
		}
		close();
	};

	/* ------------------------------ lifecycle ------------------------------ */

	function close() {
		window.removeEventListener( 'resize', queuePreview );
		document.removeEventListener( 'keydown', onKey );
		document.removeEventListener( 'pointerdown', onDocDown );
		backdrop.remove();
	}
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	document.addEventListener( 'keydown', onKey );
	window.addEventListener( 'resize', queuePreview );
	closeBtn.onclick = close;
	cancelBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* --------------------------- playground input --------------------------- */

	const isElementMotif = () => ELEMENT_MOTIFS.includes( params.motif );

	canvas.style.cursor = 'grab';
	const setHint = () => {
		canvas.title = isElementMotif()
			? t(
					'Drag: move elements (they wrap) · wheel: zoom · double-click: new colorway · right-click: more.'
			  )
			: t(
					'Drag: shift the pattern · wheel: zoom · double-click: new colorway · right-click: more.'
			  );
	};
	setHint();

	// Pointer px -> tile units (the pattern starts at the canvas origin).
	const tilePos = ( e ) => {
		const rect = canvas.getBoundingClientRect();
		return {
			x: ( e.clientX - rect.left ) / ( PRE * zoom ),
			y: ( e.clientY - rect.top ) / ( PRE * zoom ),
		};
	};

	const nearestElement = ( u ) => {
		const { cols, rows } = expandPlaces( params.repeat );
		const tx = ( ( u.x % cols ) + cols ) % cols;
		const ty = ( ( u.y % rows ) + rows ) % rows;
		let best = null;
		let bestD = Infinity;
		for ( const e of elementsInTile( params ) ) {
			for ( let ox = -cols; ox <= cols; ox += cols ) {
				for ( let oy = -rows; oy <= rows; oy += rows ) {
					const d = Math.hypot(
						e.x + ox - tx,
						e.y + oy - ty
					);
					if ( d < bestD ) {
						bestD = d;
						best = e;
					}
				}
			}
		}
		return best && bestD < Math.max( 0.09, ( best.s || 0.1 ) * 0.85 )
			? best
			: null;
	};

	// The element's current CELL position (edits included).
	const cellPosOf = ( i ) => {
		const e = cellElements( params ).find( ( x ) => x.i === i );
		return e ? { x: e.x, y: e.y } : null;
	};

	let drag = null;
	canvas.onpointerdown = ( e ) => {
		if ( 2 === e.button ) {
			return;
		}
		const u = tilePos( e );
		if ( isElementMotif() ) {
			const hit = nearestElement( u );
			if ( ! hit ) {
				return;
			}
			const cell = cellPosOf( hit.i );
			if ( ! cell ) {
				return;
			}
			drag = {
				mode: 'element',
				i: hit.i,
				fx: hit.fx ? -1 : 1,
				fy: hit.fy ? -1 : 1,
				start: u,
				cell,
			};
		} else {
			drag = {
				mode: 'shift',
				start: u,
				shift: { ...params.shift },
			};
		}
		canvas.setPointerCapture( e.pointerId );
		canvas.style.cursor = 'grabbing';
	};
	canvas.onpointermove = ( e ) => {
		if ( ! drag ) {
			return;
		}
		const u = tilePos( e );
		const dx = u.x - drag.start.x;
		const dy = u.y - drag.start.y;
		if ( 'element' === drag.mode ) {
			const nx = drag.cell.x + dx * drag.fx;
			const ny = drag.cell.y + dy * drag.fy;
			params.moved = ( params.moved || [] ).filter(
				( m ) => m.i !== drag.i
			);
			params.moved.push( {
				i: drag.i,
				x: ( ( nx % 1 ) + 1 ) % 1,
				y: ( ( ny % 1 ) + 1 ) % 1,
			} );
		} else {
			const wrap = ( v ) => {
				let w = ( v + 0.5 ) % 1;
				if ( w < 0 ) {
					w += 1;
				}
				return w - 0.5;
			};
			params.shift = {
				x: wrap( drag.shift.x + dx ),
				y: wrap( drag.shift.y + dy ),
			};
		}
		markDirty();
		queuePreview();
	};
	canvas.onpointerup = () => {
		drag = null;
		canvas.style.cursor = 'grab';
	};
	canvas.addEventListener(
		'wheel',
		( e ) => {
			e.preventDefault();
			zoom = Math.max(
				0.35,
				Math.min( 3.2, zoom * ( e.deltaY < 0 ? 1.09 : 1 / 1.09 ) )
			);
			zoomSlider.value = String( Math.round( zoom * 100 ) );
			zoomSlider.dispatchEvent( new Event( 'input' ) );
		},
		{ passive: false }
	);
	canvas.ondblclick = () => {
		params.colorway = ( params.colorway + 1 ) % 5;
		markDirty();
		renderPreview();
	};

	// Right click: a small playground menu (own div - never native).
	const menu = el( 'div', 'wpiepg-menu', view );
	menu.style.display = 'none';
	let menuAt = { x: 0.5, y: 0.5 };
	const menuItem = ( label, fn ) => {
		const b = el( 'button', null, menu );
		b.type = 'button';
		b.textContent = label;
		b.onclick = () => {
			menu.style.display = 'none';
			fn();
		};
		return b;
	};
	const itemAdd = menuItem( '+ ' + t( 'Add element' ), () => {
		const { cols, rows } = expandPlaces( params.repeat );
		const glyphs =
			'terrazzo' === params.motif
				? 6
				: ( glyphPool( params ) || [ 0 ] ).length;
		const tx = ( ( menuAt.x % cols ) + cols ) % cols;
		const ty = ( ( menuAt.y % rows ) + rows ) % rows;
		params.added = ( params.added || [] ).concat( [
			{
				x: ( ( tx % 1 ) + 1 ) % 1,
				y: ( ( ty % 1 ) + 1 ) % 1,
				g: Math.floor( Math.random() * glyphs ),
				s:
					( 0.34 + ( params.size / 100 ) * 0.62 ) /
					Math.max( 2, Math.ceil( Math.sqrt( params.count ) ) ),
				rot:
					( Math.random() - 0.5 ) *
					Math.PI *
					( params.rot / 100 ),
				c: Math.floor( Math.random() * 5 ),
			},
		] );
		markDirty();
		renderPreview();
	} );
	const itemRemove = menuItem( t( 'Remove element' ), () => {
		const hit = nearestElement( menuAt );
		if ( ! hit ) {
			return;
		}
		if ( hit.i >= 100000 ) {
			params.added.splice( hit.i - 100000, 1 );
			// Splicing renumbers later hand-added elements - drop
			// their move overrides instead of misapplying them.
			params.moved = ( params.moved || [] ).filter(
				( m ) => m.i < 100000
			);
		} else {
			params.removed = ( params.removed || [] ).concat( [ hit.i ] );
			params.moved = ( params.moved || [] ).filter(
				( m ) => m.i !== hit.i
			);
		}
		markDirty();
		renderPreview();
	} );
	menuItem( t( 'New colorway' ), () => canvas.ondblclick() );
	menuItem( t( 'Reset edits' ), () => {
		params.shift = { x: 0, y: 0 };
		params.moved = [];
		params.added = [];
		params.removed = [];
		markDirty();
		renderPreview();
	} );
	const itemFrame = menuItem( t( 'Show tile frame' ), () => {
		showFrame = ! showFrame;
		frameCb.checked = showFrame;
		itemFrame.textContent = showFrame
			? t( 'Hide tile frame' )
			: t( 'Show tile frame' );
		renderPreview();
	} );
	view.oncontextmenu = ( e ) => {
		e.preventDefault();
		menuAt = tilePos( e );
		const rect = view.getBoundingClientRect();
		itemAdd.style.display = isElementMotif() ? '' : 'none';
		itemRemove.style.display = isElementMotif() ? '' : 'none';
		menu.style.left =
			Math.min( e.clientX - rect.left, rect.width - 210 ) + 'px';
		menu.style.top =
			Math.min( e.clientY - rect.top, rect.height - 170 ) + 'px';
		menu.style.display = 'flex';
	};
	const onDocDown = ( e ) => {
		if ( ! menu.contains( e.target ) ) {
			menu.style.display = 'none';
		}
	};
	document.addEventListener( 'pointerdown', onDocDown );

	/* --------------------------------- sync -------------------------------- */

	function syncUi() {
		motSel.value = params.motif;
		repSel.value = params.repeat;
		bgSel.value = params.bg;
		palSel.value = palSelValue();
		baseRow.style.display =
			'custom' === params.palette ? '' : 'none';
		bgRow.style.display = 'custom' === params.bg ? '' : 'none';
		const setsVisible = SET_MOTIFS.includes( params.motif );
		setRow.parentElement.style.display = setsVisible ? '' : 'none';
		setRow.value = params.set;
		set2Row.parentElement.style.display =
			setsVisible && 'stamp' !== params.set ? '' : 'none';
		set2Row.value = params.set2 || '';
		stampRow.style.display =
			setsVisible && 'stamp' === params.set ? '' : 'none';
		if ( params.stampData ) {
			stampThumb.style.backgroundImage =
				'url(' + params.stampData + ')';
		} else {
			stampThumb.style.backgroundImage = '';
		}
		seedVal.textContent = String( params.seed );
		if ( String( params.riso ) !== risoSlider.value ) {
			risoSlider.value = String( params.riso );
			risoSlider.dispatchEvent( new Event( 'input' ) );
		}
		dashSel.value = params.dash || '';
		revCb.checked = !! params.reverse;
		if ( baseHandle ) {
			baseHandle.set( params.customBase );
		}
		if ( bgHandle ) {
			bgHandle.set( params.bgCustom );
		}
		renderChips();
		renderDials();
		setHint();
	}

	renderPresets();
	renderFavs();
	syncUi();
	renderPreview();
	// Late layout (fonts/flex): one follow-up paint on the real size.
	window.requestAnimationFrame( renderPreview );
	// Editing a stamped pattern: decode the stored stamp, then repaint.
	if ( params.stampData ) {
		ensureStamp( params.stampData ).then( () => {
			markDirty();
			renderPreview();
		} );
	}

	// QA hooks (headless smoke tests drive these).
	window.__pgParams = params;
	window.__pgApply = applyParams;
	window.__pgPreview = renderPreview;
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Seamless Patterns',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction(
		'wpie.ready',
		'wpie-pattern-generator',
		register
	);
}
