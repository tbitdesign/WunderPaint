/**
 * WPIE extension: Star Map Posters.
 *
 * The night sky over any place at any date, as a poster: search a
 * location (editor geo proxy), pick the moment, a theme and a shape,
 * toggle constellation lines, grid and cardinal directions, and insert
 * the chart together with the classic title/date/coordinates text block
 * as real, editable layers. The sky is computed locally from the
 * bundled Yale Bright Star Catalogue (public domain) and d3-celestial
 * constellation lines (BSD-3) - no external service is involved beyond
 * the one-time place search.
 *
 * The chart layer stores `layer.generator = { id, params }`, so "Edit
 * Star Map Posters" reopens the studio on the exact same sky.
 *
 * Built with esbuild (`npm run build` in this folder) into extension.js.
 */

import { jdForLocal } from './astro.js';
import { THEMES, GRADIENTS, drawSky, skyPalette } from './sky-engine.js';
import STARS from './stars.json';
import LINES from './lines.json';
import CONST_NAMES from './constellation-names.json';

const GEN_ID = 'wpie-star-map/sky';
const OUT_SIZE = 2048;

const DEFAULTS = {
	lat: null,
	lon: null,
	place: null,
	dateStr: '',
	timeStr: '22:00',
	themeId: 'midnight',
	overrides: {},
	show: { lines: true, grid: false, cardinals: false },
	colorStars: false,
	starScale: 1,
	// v2.0 - foil lines, glow, star spikes, the galactic band.
	lineGradientId: '',
	glow: 0,
	glints: false,
	milkyway: false,
	highlight: '',
	mask: 'circle',
	textLayout: 'classic',
	textAnchor: 'bc', // 'On the chart' placement: <v><h>, v=t|m|b h=l|c|r
	textScale: 1,
	font: '',
	useBrand: false,
	brandKitId: '',
};

// Opening onto an empty sky made every first impression depend on the
// place search. Instead the studio opens on the last charted place
// (localStorage) or this default - the sky is computed locally, so it
// appears instantly (v1.2.0).
const LAST_KEY = 'wpie-star:last';
const FALLBACK_PLACE = {
	lat: 53.1435,
	lon: 8.2146,
	place: { name: 'Oldenburg', region: 'Lower Saxony, Germany' },
};

import { t, LOCALE, INTL_LOCALE } from './i18n.js';


const CARD_MAP = {
	de: [ 'N', 'O', 'S', 'W' ],
	es: [ 'N', 'E', 'S', 'O' ],
	fr: [ 'N', 'E', 'S', 'O' ],
	it: [ 'N', 'E', 'S', 'O' ],
	pt: [ 'N', 'L', 'S', 'O' ],
	// Dutch shifts south, not east: noord, oost, zuid, west.
	nl: [ 'N', 'O', 'Z', 'W' ],
};
const CARDINALS = CARD_MAP[ LOCALE.slice( 0, 2 ) ] || [ 'N', 'E', 'S', 'W' ];

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

const svgIc = ( d ) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ d }</svg>`;
const SEC_ICONS = {
	location: svgIc( '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>' ),
	moment: svgIc( '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>' ),
	theme: svgIc( '<path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2a2 2 0 0 1 2-2h1.5A3.5 3.5 0 0 0 21 8c0-2.8-4-5-9-5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>' ),
	colors: svgIc( '<path d="M12 3v18M5 8l7-5 7 5v8l-7 5-7-5z"/>' ),
	sky: svgIc( '<path d="M12 3l2 5 5 .5-3.8 3.4L16.5 17 12 14.5 7.5 17l1.3-5.1L5 8.5 10 8z"/>' ),
	text: svgIc( '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>' ),
	font: svgIc( '<path d="M4 20l5-14 5 14M6 15h6M15 20l4-11 4 11M16.5 16h5"/>' ),
	dot: svgIc( '<circle cx="12" cy="12" r="7"/>' ),
};
function section( parent, label, iconKey ) {
	const card = el( 'div', 'wpiestar-card', parent );
	if ( label ) {
		const head = el( 'div', 'wpiestar-card-head', card );
		head.innerHTML = ( SEC_ICONS[ iconKey ] || SEC_ICONS.dot ) + '<span>' + label + '</span>';
	}
	return el( 'div', 'wpiestar-card-body', card );
}

function debounced( fn, ms ) {
	let timer = 0;
	return ( ...args ) => {
		window.clearTimeout( timer );
		timer = window.setTimeout( () => fn( ...args ), ms );
	};
}

/** "53.5511° N / 9.9937° E" */
function coordsText( lat, lon ) {
	const f = ( v, pos, neg ) =>
		`${ Math.abs( v ).toFixed( 4 ) }° ${ v >= 0 ? pos : neg }`;
	return `${ f( lat, 'N', 'S' ) } / ${ f( lon, 'E', 'W' ) }`;
}

/** Localized long date for the poster line. */
function dateText( dateStr ) {
	const [ y, m, d ] = String( dateStr || '' )
		.split( '-' )
		.map( ( v ) => parseInt( v, 10 ) );
	if ( ! y ) {
		return '';
	}
	try {
		return new Intl.DateTimeFormat( INTL_LOCALE, {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		} ).format( new Date( Date.UTC( y, ( m || 1 ) - 1, d || 1, 12 ) ) );
	} catch ( e ) {
		return dateStr;
	}
}

/* --------------------------------- studio -------------------------------- */

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE.bridge;
	// Per-user store (v1.4.0, API 2.10): the last-used place lives
	// server-side now; the old localStorage value migrates once.
	const NS = 'wpie-star-map';
	let store = {};
	try {
		store = ( await bridge.storage.get( NS ) ) || {};
	} catch ( e ) {
		store = {};
	}
	const storeSave = () => {
		try {
			bridge.storage.set( NS, store );
		} catch ( e ) {}
	};
	const geo = bridge && bridge.api && bridge.api.geo;
	if ( ! geo ) {
		if ( extras && extras.toasts ) {
			extras.toasts.error(
				t( 'Star Map Posters needs WunderPaint 1.144 or newer.' )
			);
		}
		return;
	}

	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	params.show = { ...DEFAULTS.show, ...( params.show || {} ) };
	params.overrides = { ...( params.overrides || {} ) };
	if ( ! params.dateStr ) {
		const now = new Date();
		params.dateStr = `${ now.getFullYear() }-${ String(
			now.getMonth() + 1
		).padStart( 2, '0' ) }-${ String( now.getDate() ).padStart( 2, '0' ) }`;
	}
	if ( ! editing && null === params.lat ) {
		let last = store.lastPlace || null;
		if ( ! last ) {
			try {
				last = JSON.parse(
					window.localStorage.getItem( LAST_KEY ) || 'null'
				);
			} catch ( e ) {}
		}
		const seed =
			last && 'number' === typeof last.lat ? last : FALLBACK_PLACE;
		params.lat = seed.lat;
		params.lon = seed.lon;
		params.place = seed.place || FALLBACK_PLACE.place;
	}

	let titleDirty = editing;
	let subtitleDirty = editing;

	/* ------------------------------ overlay ------------------------------ */

	const ICON_BRAND =
		'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
	const ICON_CLOSE =
		'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiestar-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Star Map Posters' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	const headTitleRow = el( 'div', 'dsm-title-row', titles );
	const title = el( 'span', 'dsm-title', headTitleRow );
	title.textContent = 'Star Map Posters';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = editing
		? t( 'Adjust the sky, the layer updates in place.' )
		: t( 'The night sky over any place at any date, as editable layers.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiestar-body', dialog );
	const view = el( 'div', 'wpiestar-view', body );
	const canvas = el( 'canvas', null, view );
	const empty = el( 'div', 'wpiestar-empty', view );
	empty.textContent = t(
		'Search for a place, then pick the date of your moment.'
	);
	const status = el( 'div', 'wpiestar-status', view );
	const setStatus = ( text, isError ) => {
		status.textContent = text || '';
		status.className =
			'wpiestar-status' +
			( text ? ' on' : '' ) +
			( isError ? ' err' : '' );
	};
	const side = el( 'div', 'wpiestar-side', body );

	/* ------------------------------- search ------------------------------ */

	const searchSec = section( side, t( 'Location' ), 'location' );
	const searchWrap = el( 'div', 'wpiestar-search', searchSec );
	const searchInput = el( 'input', null, searchWrap );
	searchInput.type = 'text';
	searchInput.placeholder = t( 'Search a place, e.g. Hamburg' );
	const results = el( 'div', 'wpiestar-results', searchWrap );
	results.style.display = 'none';
	const coordsLine = el( 'div', 'wpiestar-coords', searchSec );

	const dateRow = el( 'label', 'wpiestar-row', searchSec );
	el( 'span', null, dateRow ).textContent = t( 'Date' );
	const dateInput = el( 'input', null, dateRow );
	dateInput.type = 'date';
	dateInput.value = params.dateStr;
	dateInput.onchange = () => {
		params.dateStr = dateInput.value || params.dateStr;
		paint();
	};
	const timeRow = el( 'label', 'wpiestar-row', searchSec );
	el( 'span', null, timeRow ).textContent = t( 'Time' );
	const timeInput = el( 'input', null, timeRow );
	timeInput.type = 'time';
	timeInput.value = params.timeStr;
	timeInput.onchange = () => {
		params.timeStr = timeInput.value || '22:00';
		paint();
	};

	/* ------------------------------- themes ------------------------------ */

	const themeSec = section( side, t( 'Theme' ), 'theme' );
	const themeSel = el( 'select', 'dsm-select', themeSec );
	for ( const theme of THEMES ) {
		const o = el( 'option', null, themeSel );
		o.value = theme.id;
		o.textContent = theme.label;
	}
	themeSel.onchange = () => {
		params.themeId = themeSel.value;
		params.overrides = {};
		applyBrand();
		syncColorInputs();
		paint();
	};
	const syncThemeSel = () => {
		themeSel.value = params.themeId;
	};
	const themeOf = () =>
		THEMES.find( ( th ) => th.id === params.themeId ) || THEMES[ 0 ];

	/* ------------------------------- colors ------------------------------ */

	const colorSec = section( side, t( 'Colors' ), 'colors' );
	const colorControls = {};
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	const colorRow = ( key, label ) => {
		const row = el( 'div', 'wpiestar-row', colorSec );
		el( 'span', null, row ).textContent = label;
		const slot = el( 'span', 'wpiestar-swatch', row );
		const onChange = ( c ) => {
			params.overrides[ key ] = c;
			syncColorInputs();
			paint();
		};
		if ( mountSwatch ) {
			colorControls[ key ] = mountSwatch( slot, {
				color: '#000000',
				title: label,
				onChange,
			} );
		} else {
			const input = el( 'input', null, slot );
			input.type = 'color';
			input.oninput = () => onChange( input.value );
			colorControls[ key ] = {
				set: ( c ) => {
					input.value = c;
				},
			};
		}
		const reset = el( 'button', 'wpiestar-reset', row );
		reset.textContent = t( 'Auto' );
		reset.title = t( 'Back to the theme color' );
		reset.onclick = ( e ) => {
			e.preventDefault();
			delete params.overrides[ key ];
			syncColorInputs();
			paint();
		};
	};
	colorRow( 'bg', t( 'Background' ) );
	colorRow( 'star', t( 'Stars' ) );
	colorRow( 'line', t( 'Lines' ) );

	// v2.0 - foil / gradient constellation lines (gold-on-black classic).
	const gradRow = el( 'div', 'wpiestar-gradrow', colorSec );
	el( 'span', 'wpiestar-gradlbl', gradRow ).textContent = t( 'Line foil' );
	const gradWrap = el( 'div', 'wpiestar-grads', gradRow );
	const gradBtns = new Map();
	const gradTile = ( id, label, background ) => {
		const b = el( 'button', 'wpiestar-grad', gradWrap );
		b.type = 'button';
		b.title = label;
		b.setAttribute( 'aria-label', label );
		if ( background ) {
			b.style.background = background;
		} else {
			b.textContent = t( 'Auto' );
		}
		b.onclick = () => {
			params.lineGradientId = id;
			syncGrads();
			paint();
		};
		gradBtns.set( id, b );
	};
	gradTile( '', t( 'Auto' ), '' );
	for ( const g of GRADIENTS ) {
		gradTile( g.id, g.label, `linear-gradient(90deg, ${ g.stops.join( ', ' ) })` );
	}
	const syncGrads = () =>
		gradBtns.forEach( ( b, id ) =>
			b.classList.toggle( 'sel', id === ( params.lineGradientId || '' ) )
		);
	syncGrads();

	const brandKits = ( bridge.brand
		? bridge.brand.kits()
		: window.WPIE.brandKits || []
	).filter(
		( k ) => k && Array.isArray( k.colors ) && k.colors.length
	);
	const brandColorsFor = () => {
		if ( ! brandKits.length ) {
			return ( window.WPIE.brand && window.WPIE.brand.colors ) || [];
		}
		const chosen = brandKits.find( ( k ) => String( k.id ) === String( params.brandKitId ) ) || brandKits[ 0 ];
		return chosen.colors || [];
	};
	// Brand colors map onto every editable color (constellation lines first,
	// then stars and the sky background), not just the lines. Each brand
	// color is used once; a shorter kit leaves the rest on the theme.
	const BRAND_KEYS = [ 'line', 'star', 'bg' ];
	const applyBrand = () => {
		if ( ! params.useBrand ) {
			return;
		}
		const c = brandColorsFor();
		BRAND_KEYS.forEach( ( key, i ) => {
			if ( c[ i ] ) {
				params.overrides[ key ] = c[ i ];
			}
		} );
	};
	if ( brandKits.length || ( ( window.WPIE.brand && window.WPIE.brand.colors ) || [] ).length ) {
		const brandLbl = el( 'label', 'wpiestar-check', colorSec );
		const brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = params.useBrand;
		el( 'span', null, brandLbl ).textContent = t( 'Use brand colors' );
		brandCb.onchange = () => {
			params.useBrand = brandCb.checked;
			if ( ! params.useBrand ) {
				BRAND_KEYS.forEach( ( key ) => delete params.overrides[ key ] );
			}
			applyBrand();
			syncColorInputs();
			paint();
		};
		if ( brandKits.length > 1 ) {
			// Central kit dropdown (bridge mountKitPicker, API 2.10).
			bridge.components.mountKitPicker( el( 'div', null, colorSec ), {
				value: params.brandKitId || brandKits[ 0 ].id,
				onChange: ( id ) => {
					params.brandKitId = id;
					params.useBrand = true;
					brandCb.checked = true;
					applyBrand();
					syncColorInputs();
					paint();
				},
			} );
		}
	}

	const fontSec = section( side, t( 'Typography' ), 'font' );
	// Central font picker (bridge API 2.9); the plain select stays as
	// the fallback on older editors (default family: Montserrat).
	if ( bridge.components && bridge.components.mountFontPicker ) {
		bridge.components.mountFontPicker( el( 'div', null, fontSec ), {
			value: params.font || 'Montserrat',
			onChange: ( fam ) => {
				params.font = 'Montserrat' === fam ? '' : fam;
				if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
					bridge.fonts.ensureFont( params.font ).then( paint ).catch( paint );
				} else {
					paint();
				}
			},
		} );
	} else {
		const fontSel = el( 'select', 'dsm-select', fontSec );
		const fontFamilies = ( () => {
			if ( bridge.fonts && bridge.fonts.listFamilies ) {
				try {
					const l = bridge.fonts.listFamilies();
					if ( l && l.length ) {
						return l;
					}
				} catch ( e ) {}
			}
			return [ 'Montserrat', 'Inter', 'Playfair Display', 'Georgia' ];
		} )();
		{
			const oDef = el( 'option', null, fontSel );
			oDef.value = '';
			oDef.textContent = t( 'Default (Montserrat)' );
		}
		for ( const fam of fontFamilies ) {
			const o = el( 'option', null, fontSel );
			o.value = fam;
			o.textContent = fam;
		}
		fontSel.value = params.font || '';
		fontSel.onchange = () => {
			params.font = fontSel.value;
			if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
				bridge.fonts.ensureFont( params.font ).then( paint ).catch( paint );
			} else {
				paint();
			}
		};
	}

	const syncColorInputs = () => {
		const pal = skyPalette( themeOf(), params.overrides );
		colorControls.bg.set( pal.bg );
		colorControls.star.set( pal.star );
		colorControls.line.set( pal.line );
	};

	/* --------------------------------- sky -------------------------------- */

	const skySec = section( side, t( 'Sky' ), 'sky' );
	const sizeRow = el( 'label', 'wpiestar-row', skySec );
	el( 'span', null, sizeRow ).textContent = t( 'Star size' );
	const sizeInput = el( 'input', null, sizeRow );
	sizeInput.type = 'range';
	sizeInput.min = '60';
	sizeInput.max = '180';
	sizeInput.value = String( Math.round( params.starScale * 100 ) );
	const sizeOut = el( 'output', null, sizeRow );
	sizeOut.textContent = `${ sizeInput.value }%`;
	sizeInput.oninput = () => {
		params.starScale = parseInt( sizeInput.value, 10 ) / 100;
		sizeOut.textContent = `${ sizeInput.value }%`;
		paint();
	};

	const checkRow = ( get, set, label ) => {
		const row = el( 'label', 'wpiestar-check', skySec );
		const input = el( 'input', null, row );
		input.type = 'checkbox';
		input.checked = get();
		el( 'span', null, row ).textContent = label;
		input.onchange = () => {
			set( input.checked );
			paint();
		};
	};
	checkRow(
		() => params.show.lines,
		( v ) => ( params.show.lines = v ),
		t( 'Constellation lines' )
	);
	checkRow(
		() => params.show.grid,
		( v ) => ( params.show.grid = v ),
		t( 'Coordinate grid' )
	);
	checkRow(
		() => params.show.cardinals,
		( v ) => ( params.show.cardinals = v ),
		t( 'Cardinal directions' )
	);
	checkRow(
		() => params.colorStars,
		( v ) => ( params.colorStars = v ),
		t( 'Star colors' )
	);
	checkRow(
		() => params.glints,
		( v ) => ( params.glints = v ),
		t( 'Star spikes' )
	);
	checkRow(
		() => params.milkyway,
		( v ) => ( params.milkyway = v ),
		t( 'Milky way' )
	);
	const glowRow = el( 'label', 'wpiestar-row', skySec );
	el( 'span', null, glowRow ).textContent = t( 'Glow' );
	const glowInput = el( 'input', null, glowRow );
	glowInput.type = 'range';
	glowInput.min = '0';
	glowInput.max = '100';
	glowInput.value = String( params.glow || 0 );
	const glowOut = el( 'output', null, glowRow );
	glowOut.textContent = String( params.glow || 0 );
	glowInput.oninput = () => {
		params.glow = parseInt( glowInput.value, 10 );
		glowOut.textContent = glowInput.value;
		paint();
	};

	// v1.8 - spotlight one constellation (the birth sign, the favorite).
	const hiRow = el( 'label', 'wpiestar-row', skySec );
	el( 'span', null, hiRow ).textContent = t( 'Highlight' );
	const hiSel = el( 'select', 'dsm-select', hiRow );
	{
		const none = el( 'option', null, hiSel );
		none.value = '';
		none.textContent = t( 'None' );
	}
	Object.entries( CONST_NAMES )
		.sort( ( a, b ) => a[ 1 ].localeCompare( b[ 1 ] ) )
		.forEach( ( [ abbr, name ] ) => {
			const o = el( 'option', null, hiSel );
			o.value = abbr;
			o.textContent = name;
		} );
	hiSel.value = params.highlight || '';
	hiSel.onchange = () => {
		params.highlight = hiSel.value;
		paint();
	};

	const shapeRow = el( 'div', 'wpiestar-shaperow', skySec );
	el( 'span', null, shapeRow ).textContent = t( 'Shape' );
	const shapeGrid = el( 'div', 'wpiestar-shapes', shapeRow );
	const SHAPE_ICONS = {
		circle: '<circle cx="12" cy="12" r="8"/>',
		none: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>',
		squircle: '<rect x="4.5" y="4.5" width="15" height="15" rx="5.5"/>',
		heart: '<path d="M12 19.5C6.6 15 4.4 12.2 4.4 9.1 4.4 6.5 6.3 4.6 8.7 4.6c1.4 0 2.6.7 3.3 1.9.7-1.2 1.9-1.9 3.3-1.9 2.4 0 4.3 1.9 4.3 4.5 0 3.1-2.2 5.9-7.6 10.4z"/>',
		hex: '<path d="M12 3.5l7.4 4.2v8.6L12 20.5l-7.4-4.2V7.7z"/>',
		diamond: '<path d="M12 3.5l8.5 8.5L12 20.5 3.5 12z"/>',
		triangle: '<path d="M12 4l8 15H4z"/>',
		arch: '<path d="M5 20V11a7 7 0 0 1 14 0v9"/>',
		star: '<path d="M12 3.5l2.6 5.6 6 .7-4.4 4 1.2 6-5.4-3-5.4 3 1.2-6-4.4-4 6-.7z"/>',
		pentagon: '<path d="M12 3.5l8 6-3 9.5H7l-3-9.5z"/>',
	};
	const shapeTiles = new Map();
	for ( const [ value, label ] of [
		[ 'circle', t( 'Circle' ) ],
		[ 'none', t( 'Square' ) ],
		[ 'squircle', t( 'Rounded' ) ],
		[ 'pentagon', t( 'Pentagon' ) ],
		[ 'heart', t( 'Heart' ) ],
		[ 'hex', t( 'Hexagon' ) ],
		[ 'diamond', t( 'Diamond' ) ],
		[ 'triangle', t( 'Triangle' ) ],
		[ 'arch', t( 'Arch' ) ],
		[ 'star', t( 'Star' ) ],
	] ) {
		const tile = el( 'button', 'wpiestar-shape', shapeGrid );
		tile.title = label;
		tile.setAttribute( 'aria-label', label );
		tile.innerHTML = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round">${ SHAPE_ICONS[ value ] }</svg>`;
		tile.onclick = () => {
			params.mask = value;
			syncShapeSel();
			paint();
		};
		shapeTiles.set( value, tile );
	}
	const syncShapeSel = () =>
		shapeTiles.forEach( ( tile, id ) =>
			tile.classList.toggle( 'sel', id === params.mask )
		);
	syncShapeSel();

	/* ----------------------------- text block ---------------------------- */

	let titleInput = null;
	let subtitleInput = null;
	let layoutSelect = null;
	let dateCheck = null;
	if ( ! editing ) {
		const textSec = section( side, t( 'Text block' ), 'text' );
		const layoutRow = el( 'label', 'wpiestar-row', textSec );
		el( 'span', null, layoutRow ).textContent = t( 'Layout' );
		layoutRow.style.gridTemplateColumns = '78px 1fr';
		layoutSelect = el( 'select', 'dsm-select', layoutRow );
		for ( const [ value, label ] of [
			[ 'classic', t( 'Classic poster' ) ],
			[ 'corner', t( 'On the chart' ) ],
			[ 'none', t( 'No text' ) ],
		] ) {
			const opt = el( 'option', null, layoutSelect );
			opt.value = value;
			opt.textContent = label;
		}
		layoutSelect.value = params.textLayout;
		layoutSelect.onchange = () => {
			params.textLayout = layoutSelect.value;
			syncTextRows();
			paint();
		};

		// Placement of the on-chart title/date: a 3x3 alignment grid, shown
		// only for the "On the chart" layout. Value is <v><h> (t|m|b, l|c|r).
		const anchorRow = el( 'div', 'wpiestar-anchorrow', textSec );
		el( 'span', null, anchorRow ).textContent = t( 'Alignment' );
		const anchorGrid = el( 'div', 'wpiestar-anchors', anchorRow );
		const anchorTiles = new Map();
		const anchorIcon = ( h, v ) => {
			const bx = 'l' === h ? 6 : 'c' === h ? 8.5 : 11;
			const by = 't' === v ? 7 : 'm' === v ? 11 : 15;
			return (
				'<rect x="4" y="4" width="16" height="16" rx="2" opacity="0.4"/>' +
				`<rect x="${ bx }" y="${ by }" width="7" height="2.2" rx="1.1" fill="currentColor" stroke="none"/>`
			);
		};
		for ( const v of [ 't', 'm', 'b' ] ) {
			for ( const h of [ 'l', 'c', 'r' ] ) {
				const value = v + h;
				const tile = el( 'button', 'wpiestar-anchor', anchorGrid );
				tile.setAttribute( 'aria-label', value );
				tile.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5">${ anchorIcon(
					h,
					v
				) }</svg>`;
				tile.onclick = () => {
					params.textAnchor = value;
					syncAnchorSel();
					paint();
				};
				anchorTiles.set( value, tile );
			}
		}
		const syncAnchorSel = () =>
			anchorTiles.forEach( ( tile, id ) =>
				tile.classList.toggle( 'sel', id === params.textAnchor )
			);
		syncAnchorSel();
		const syncTextRows = () => {
			anchorRow.style.display =
				'corner' === layoutSelect.value ? '' : 'none';
		};
		syncTextRows();

		const titleRow = el( 'label', 'wpiestar-text-row', textSec );
		el( 'span', null, titleRow ).textContent = t( 'Title' );
		titleInput = el( 'input', null, titleRow );
		titleInput.type = 'text';
		titleInput.oninput = () => {
			titleDirty = true;
			paint();
		};

		const subtitleRow = el( 'label', 'wpiestar-text-row', textSec );
		el( 'span', null, subtitleRow ).textContent = t( 'Subtitle' );
		subtitleInput = el( 'input', null, subtitleRow );
		subtitleInput.type = 'text';
		subtitleInput.placeholder = t( 'e.g. The night we met' );
		subtitleInput.oninput = () => {
			subtitleDirty = true;
			paint();
		};

		// Fresh sessions open on the seeded place; the poster text
		// follows it like a search hit would, instead of starting
		// empty (v1.2.0).
		if ( ! editing && params.place ) {
			titleInput.value = params.place.name || '';
			subtitleInput.value = params.place.region || '';
		}

		const sizeRow2 = el( 'label', 'wpiestar-row', textSec );
		el( 'span', null, sizeRow2 ).textContent = t( 'Text size' );
		const sizeInput2 = el( 'input', null, sizeRow2 );
		sizeInput2.type = 'range';
		sizeInput2.min = '60';
		sizeInput2.max = '160';
		sizeInput2.value = String( Math.round( params.textScale * 100 ) );
		const sizeOut2 = el( 'output', null, sizeRow2 );
		sizeOut2.textContent = `${ sizeInput2.value }%`;
		sizeInput2.oninput = () => {
			params.textScale = parseInt( sizeInput2.value, 10 ) / 100;
			sizeOut2.textContent = `${ sizeInput2.value }%`;
			paint();
		};

		const dateRow2 = el( 'label', 'wpiestar-check', textSec );
		dateCheck = el( 'input', null, dateRow2 );
		dateCheck.type = 'checkbox';
		dateCheck.checked = true;
		dateCheck.onchange = () => paint();
		el( 'span', null, dateRow2 ).textContent = t(
			'Date and coordinates line'
		);
	}

	const attrNote = el( 'div', 'wpiestar-attr', side );
	attrNote.textContent = 'Yale Bright Star Catalogue · d3-celestial (BSD)';

	/* ------------------------------- footer ------------------------------ */

	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = t(
		'Computed locally from the bundled star catalog.'
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	cancelBtn.onclick = () => close();
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing
		? t( 'Update Star Map' )
		: t( 'Insert Star Map' );
	apply.disabled = null === params.lat;

	/* ----------------------------- layout + paint ------------------------ */

	function layoutPoster( docW, docH ) {
		const ts = params.textScale || 1;
		const pal = skyPalette( themeOf(), params.overrides );
		const layout = editing ? 'none' : params.textLayout;
		const placeName = ( titleInput && titleInput.value.trim() ) || '';
		const subText = ( subtitleInput && subtitleInput.value.trim() ) || '';
		const withText = 'none' !== layout && !! placeName;
		const wantDate = !! ( dateCheck && dateCheck.checked );
		const skySize = Math.round(
			Math.min(
				docW * 0.86,
				docH * ( withText && 'classic' === layout ? 0.62 : 0.86 )
			)
		);
		const skyX = Math.round( ( docW - skySize ) / 2 );
		const skyY =
			withText && 'classic' === layout
				? Math.round( docH * 0.06 )
				: Math.round( ( docH - skySize ) / 2 );

		const items = [];
		const text = ( spec ) => items.push( { kind: 'text', ...spec } );
		const dateLine = [
			dateText( params.dateStr ),
			null === params.lat ? '' : coordsText( params.lat, params.lon ),
		]
			.filter( Boolean )
			.join( ' · ' );

		if ( withText && 'classic' === layout ) {
			const titleFs = Math.round(
				Math.min( docW * 0.07, docH * 0.08 ) * ts
			);
			let y = skyY + skySize + Math.round( docH * 0.045 );
			text( {
				name: t( 'Title' ),
				text: placeName.toUpperCase(),
				x: 0,
				y,
				w: docW,
				h: Math.round( titleFs * 1.25 ),
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align: 'center',
				letterSpacing: Math.round( titleFs * 0.14 ),
			} );
			y += Math.round( titleFs * 1.5 );
			items.push( {
				kind: 'rect',
				name: t( 'Divider' ),
				x: Math.round( docW / 2 - docW * 0.05 ),
				y,
				w: Math.round( docW * 0.1 ),
				h: Math.max( 2, Math.round( docH * 0.0035 ) ),
				fill: pal.text,
			} );
			y += Math.round( docH * 0.02 );
			const subFs = Math.round( docW * 0.023 * ts );
			if ( subText ) {
				text( {
					name: t( 'Subtitle' ),
					text: subText.toUpperCase(),
					x: 0,
					y,
					w: docW,
					h: Math.round( subFs * 1.4 ),
					fontSize: subFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( subFs * 0.32 ),
				} );
				y += Math.round( subFs * 2 );
			}
			if ( wantDate && dateLine ) {
				const dFs = Math.round( docW * 0.019 * ts );
				text( {
					name: t( 'Date' ),
					text: dateLine.toUpperCase(),
					x: 0,
					y,
					w: docW,
					h: Math.round( dFs * 1.4 ),
					fontSize: dFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( dFs * 0.24 ),
				} );
			}
		} else if ( withText && 'corner' === layout ) {
			const titleFs = Math.round( skySize * 0.05 * ts );
			const pad = Math.round( skySize * 0.03 );
			const dFs = Math.round( skySize * 0.018 * ts );
			const anchor = params.textAnchor || 'bc';
			const vpos = anchor.charAt( 0 ); // t | m | b
			const hpos = anchor.charAt( 1 ); // l | c | r
			const align =
				'l' === hpos ? 'left' : 'r' === hpos ? 'right' : 'center';
			const titleLineH = Math.round( titleFs * 1.3 );
			const dateLineH =
				wantDate && dateLine ? Math.round( dFs * 1.6 ) : 0;
			const blockH = titleLineH + dateLineH;
			const top =
				't' === vpos
					? skyY + pad
					: 'm' === vpos
					? Math.round( skyY + ( skySize - blockH ) / 2 )
					: skyY + skySize - pad - blockH;
			text( {
				name: t( 'Title' ),
				text: placeName.toUpperCase(),
				x: skyX + pad,
				y: top,
				w: skySize - pad * 2,
				h: titleLineH,
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align,
				letterSpacing: Math.round( titleFs * 0.1 ),
			} );
			if ( wantDate && dateLine ) {
				text( {
					name: t( 'Date' ),
					text: dateLine.toUpperCase(),
					x: skyX + pad,
					y: top + titleLineH,
					w: skySize - pad * 2,
					h: dateLineH,
					fontSize: dFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align,
					letterSpacing: Math.round( dFs * 0.24 ),
				} );
			}
		}
		return { skyX, skyY, skySize, items };
	}

	const skyOpts = () => ( {
		stars: STARS,
		lines: LINES,
		lat: params.lat,
		lon: params.lon,
		jd: jdForLocal( params.dateStr, params.timeStr, params.lon || 0 ),
		theme: themeOf(),
		overrides: params.overrides,
		show: params.show,
		colorStars: params.colorStars,
		starScale: params.starScale,
		lineGradientId: params.lineGradientId || '',
		glow: ( params.glow || 0 ) / 100,
		glints: !! params.glints,
		milkyway: !! params.milkyway,
		highlight: params.highlight || '',
		mask: params.mask,
		cardinalLabels: CARDINALS,
	} );

	function paintNow() {
		const doc = editor.state.doc;
		const maxW = Math.max( 160, view.clientWidth - 36 );
		const maxH = Math.max( 160, view.clientHeight - 36 );
		const s = Math.min( maxW / doc.w, maxH / doc.h );
		const cw = Math.max( 60, Math.round( doc.w * s ) );
		const ch = Math.max( 60, Math.round( doc.h * s ) );
		if ( canvas.width !== cw || canvas.height !== ch ) {
			canvas.width = cw;
			canvas.height = ch;
		}
		const ctx = canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, cw, ch );
		if ( null === params.lat ) {
			empty.style.display = '';
			return;
		}
		empty.style.display = 'none';
		const L = layoutPoster( doc.w, doc.h );
		ctx.save();
		ctx.translate( L.skyX * s, L.skyY * s );
		drawSky( ctx, L.skySize * s, L.skySize * s, skyOpts() );
		ctx.restore();
		for ( const item of L.items ) {
			if ( 'rect' === item.kind ) {
				ctx.fillStyle = item.fill;
				ctx.fillRect(
					item.x * s,
					item.y * s,
					Math.max( 1, item.w * s ),
					Math.max( 1, item.h * s )
				);
				continue;
			}
			ctx.save();
			ctx.fillStyle = item.color;
			ctx.font = `${ item.weight } ${ Math.max(
				4,
				item.fontSize * s
			) }px ${ item.fontFamily }, sans-serif`;
			if ( 'letterSpacing' in ctx ) {
				ctx.letterSpacing = `${ ( item.letterSpacing || 0 ) * s }px`;
			}
			ctx.textBaseline = 'top';
			ctx.textAlign = item.align;
			let tx = item.x * s;
			if ( 'center' === item.align ) {
				tx = ( item.x + item.w / 2 ) * s;
			} else if ( 'right' === item.align ) {
				tx = ( item.x + item.w ) * s;
			}
			ctx.fillText( item.text, tx, item.y * s );
			if ( 'letterSpacing' in ctx ) {
				ctx.letterSpacing = '0px';
			}
			ctx.restore();
		}
	}

	let raf = 0;
	function paint() {
		if ( raf ) {
			return;
		}
		raf = window.requestAnimationFrame( () => {
			raf = 0;
			paintNow();
		} );
	}

	/* ---------------------------- place search --------------------------- */

	const runSearch = debounced( async () => {
		const q = searchInput.value.trim();
		if ( q.length < 2 ) {
			results.style.display = 'none';
			return;
		}
		try {
			const { results: hits } = await geo.search( q, 6 );
			results.textContent = '';
			for ( const hit of hits ) {
				const item = el( 'button', 'wpiestar-result', results );
				const strong = el( 'strong', null, item );
				strong.textContent = hit.name;
				const small = el( 'small', null, item );
				small.textContent = hit.region || hit.display;
				item.onclick = () => selectPlace( hit );
			}
			results.style.display = hits.length ? '' : 'none';
		} catch ( e ) {
			setStatus(
				e && e.message ? e.message : t( 'Search failed.' ),
				true
			);
		}
	}, 350 );
	searchInput.oninput = runSearch;
	searchInput.onkeydown = ( e ) => {
		if ( 'Enter' === e.key ) {
			e.preventDefault();
			const first = results.querySelector( '.wpiestar-result' );
			if ( first ) {
				first.click();
			}
		}
	};

	function selectPlace( hit ) {
		params.lat = hit.lat;
		params.lon = hit.lon;
		params.place = { name: hit.name, region: hit.region || '' };
		if ( titleInput && ! titleDirty ) {
			titleInput.value = hit.name;
		}
		if ( subtitleInput && ! subtitleDirty ) {
			subtitleInput.value = hit.region || '';
		}
		store.lastPlace = {
			lat: hit.lat,
			lon: hit.lon,
			place: params.place,
		};
		storeSave();
		results.style.display = 'none';
		searchInput.value = hit.name;
		coordsLine.textContent = coordsText( hit.lat, hit.lon );
		apply.disabled = false;
		setStatus( '' );
		paint();
	}

	/* ------------------------------ lifecycle ---------------------------- */

	const onResize = () => paint();
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	function close() {
		window.removeEventListener( 'resize', onResize );
		document.removeEventListener( 'keydown', onKey );
		Object.values( colorControls ).forEach( ( c ) => {
			if ( c && c.unmount ) {
				c.unmount();
			}
		} );
		backdrop.remove();
	}
	window.addEventListener( 'resize', onResize );
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};

	/* -------------------------------- insert ----------------------------- */

	apply.onclick = async () => {
		if ( null === params.lat ) {
			setStatus( t( 'Search for a place first.' ), true );
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the sky' ) );
		try {
			await insertOrUpdate();
			close();
		} catch ( e ) {
			setStatus(
				e && e.message
					? e.message
					: t( 'Could not insert the star map.' ),
				true
			);
			apply.disabled = false;
		}
	};

	async function insertOrUpdate() {
		const bake = document.createElement( 'canvas' );
		bake.width = OUT_SIZE;
		bake.height = OUT_SIZE;
		drawSky( bake.getContext( '2d' ), OUT_SIZE, OUT_SIZE, skyOpts() );
		const url = bake.toDataURL( 'image/png' );
		const stored = { ...params };

		if ( editing ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					src: url,
					naturalW: OUT_SIZE,
					naturalH: OUT_SIZE,
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.commit( t( 'Update Star Map' ) );
			return;
		}

		const { makeImage, makeText, makeShape, makeGroup } = bridge.documents;
		const doc = editor.state.doc;
		const L = layoutPoster( doc.w, doc.h );

		const children = [];
		const skyLayer = makeImage( {
			name: `${ t( 'Star map' ) } ${
				( params.place && params.place.name ) || ''
			}`.trim(),
			x: L.skyX,
			y: L.skyY,
			w: L.skySize,
			h: L.skySize,
			src: url,
			naturalW: OUT_SIZE,
			naturalH: OUT_SIZE,
		} );
		skyLayer.generator = { id: GEN_ID, params: stored };
		children.push( skyLayer );

		for ( const item of L.items ) {
			if ( 'rect' === item.kind ) {
				children.push(
					makeShape( {
						name: item.name,
						x: item.x,
						y: item.y,
						w: item.w,
						h: item.h,
						shape: 'rect',
						fill: item.fill,
					} )
				);
				continue;
			}
			children.push(
				makeText( {
					name: item.name,
					text: item.text,
					x: item.x,
					y: item.y,
					w: item.w,
					h: item.h,
					fontSize: item.fontSize,
					fontFamily: item.fontFamily,
					weight: item.weight,
					color: item.color,
					align: item.align,
					letterSpacing: item.letterSpacing || 0,
					fixedWidth: true,
				} )
			);
		}

		try {
			await bridge.fonts.ensureFontsForLayers(
				children.filter( ( c ) => 'text' === c.type )
			);
		} catch ( e ) {
			// Fonts fall back gracefully; never block the insert.
		}

		const group = makeGroup( {
			name: `${ t( 'Star map' ) }: ${
				( params.place && params.place.name ) || t( 'Chart' )
			}`,
		} );
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		for ( const child of children ) {
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( t( 'Insert Star Map' ) );
	}

	/* -------------------------------- boot ------------------------------- */

	syncThemeSel();
	applyBrand();
	syncColorInputs();
	if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
		bridge.fonts.ensureFont( params.font ).then( paint ).catch( () => {} );
	}
	if ( editing && params.place ) {
		searchInput.value = params.place.name || '';
		coordsLine.textContent = coordsText( params.lat, params.lon );
	}
	bridge.fonts
		.ensureFontsForLayers( [
			{ type: 'text', fontFamily: params.font || 'Montserrat', weight: 700 },
			{ type: 'text', fontFamily: 'Inter', weight: 400 },
		] )
		.then( () => paint() )
		.catch( () => {} );
	requestAnimationFrame( () => {
		paint();
		if ( null === params.lat ) {
			searchInput.focus();
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Star Map Posters',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-star-map', register );
}
