/**
 * WPIE extension: Map Posters.
 *
 * A real map-poster tool on OpenStreetMap data: search any place, pan
 * and zoom a live vector preview, pick one of ten poster themes (or
 * override the colors), toggle water/parks/rail/buildings, add geocoded
 * pins with routes and distances, choose a shape mask, and insert the
 * baked map together with a classic title/coordinates text block as
 * real, editable text layers. The map layer stores
 * `layer.generator = { id, params }`, so "Edit Map Posters" reopens the
 * studio on the exact same spot.
 *
 * All OSM traffic goes through the editor's server-side geo proxy
 * (Extension API 2.4): the browser never talks to OpenStreetMap.
 *
 * Built with esbuild (`npm run build` in this folder) into extension.js.
 */

import {
	THEMES,
	GRADIENTS,
	viewportBBox,
	detailForRadius,
	buildingsAvailable,
	buildScene,
	drawScene,
	makeProjector,
	makeUnprojector,
	paletteFor,
	formatCoords,
} from './map-engine.js';

const GEN_ID = 'wpie-map-studio/map';
const OUT_SIZE = 2048;
const ATTRIBUTION = '© OpenStreetMap contributors';

const RADII = [
	400, 600, 900, 1300, 2000, 3000, 4500, 7000, 10000, 15000, 22000, 33000,
	50000, 75000, 110000,
];

const DEFAULTS = {
	lat: null,
	lon: null,
	radius: 3000,
	themeId: 'midnight',
	overrides: {},
	// Kept apart from `overrides`, which feeds paletteFor() and describes
	// the MAP. These two describe the text block, and an unset key means
	// "follow the theme's ink" rather than any stored colour.
	textColors: {},
	show: {
		water: true,
		green: true,
		rail: true,
		paths: true,
		buildings: false,
	},
	lineScale: 1,
	// v2.0 - foil / gradient roads and the neon glow.
	roadGradientId: '',
	roadMap: 'class',
	glow: 0,
	mask: 'none',
	pins: [],
	route: 'none',
	showDistance: false,
	place: null,
	textLayout: 'classic',
	textAnchor: 'bl', // 'On the map' placement: <v><h>, v=t|m|b h=l|c|r
	textScale: 1,
	font: '',
	useBrand: false,
	brandKitId: '',
};

// Opening onto an empty search field made every first impression depend
// on a live Overpass round trip. Instead the studio opens on the last
// place the user mapped (localStorage) or this default - its data is
// almost always warm in the server cache, so a map appears immediately.
const LAST_KEY = 'wpie-map:last';
const FALLBACK_PLACE = {
	lat: 53.1435,
	lon: 8.2146,
	radius: 4500,
	place: { name: 'Oldenburg', region: 'Lower Saxony, Germany' },
};

// Where this pack is served from (uploads/wpie-extensions/<slug>/), to
// load the bundled Oldenburg excerpt next to the script. Empty in dev
// setups that serve the file from elsewhere - the seed is then skipped
// and the studio simply fetches as before.
const SCRIPT_BASE = ( () => {
	const tag = document.querySelector(
		'script[src*="/wpie-extensions/wpie-map-studio/"]'
	);
	return tag ? tag.src.replace( /[^/]*(\?.*)?$/, '' ) : '';
} )();

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

const svgIc = ( d ) =>
	`<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ d }</svg>`;
const SEC_ICONS = {
	location: svgIc( '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>' ),
	theme: svgIc( '<path d="M12 3a9 9 0 1 0 0 18 2 2 0 0 0 2-2c0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.2a2 2 0 0 1 2-2h1.5A3.5 3.5 0 0 0 21 8c0-2.8-4-5-9-5z"/><circle cx="7.5" cy="10.5" r="1"/><circle cx="12" cy="7.5" r="1"/><circle cx="16.5" cy="10.5" r="1"/>' ),
	colors: svgIc( '<path d="M12 3v18M5 8l7-5 7 5v8l-7 5-7-5z"/>' ),
	brand: svgIc( '<path d="M12 3l7 4v5c0 4-3 7-7 9-4-2-7-5-7-9V7z"/>' ),
	map: svgIc( '<path d="M9 4l6 2 6-2v14l-6 2-6-2-6 2V6z"/><path d="M9 4v14M15 6v14"/>' ),
	pins: svgIc( '<path d="M12 21s-6-5-6-10a6 6 0 0 1 12 0c0 5-6 10-6 10z"/>' ),
	text: svgIc( '<path d="M4 7V5h16v2M9 19h6M12 5v14"/>' ),
	font: svgIc( '<path d="M4 20l5-14 5 14M6 15h6M15 20l4-11 4 11M16.5 16h5"/>' ),
	dot: svgIc( '<circle cx="12" cy="12" r="7"/>' ),
};
function section( parent, label, iconKey ) {
	const card = el( 'div', 'wpiemap-card', parent );
	if ( label ) {
		const head = el( 'div', 'wpiemap-card-head', card );
		head.innerHTML = ( SEC_ICONS[ iconKey ] || SEC_ICONS.dot ) + '<span>' + label + '</span>';
	}
	return el( 'div', 'wpiemap-card-body', card );
}

function debounced( fn, ms ) {
	let timer = 0;
	return ( ...args ) => {
		window.clearTimeout( timer );
		timer = window.setTimeout( () => fn( ...args ), ms );
	};
}

const radiusLabel = ( m ) =>
	m < 1000 ? `${ m } m` : `${ ( m / 1000 ).toFixed( m < 10000 ? 1 : 0 ) } km`;

const nearestRadiusIndex = ( m ) => {
	let best = 0;
	RADII.forEach( ( r, i ) => {
		if ( Math.abs( r - m ) < Math.abs( RADII[ best ] - m ) ) {
			best = i;
		}
	} );
	return best;
};

/* --------------------------------- studio -------------------------------- */

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE.bridge;
	// Per-user store (v1.9.0, API 2.10): the last-mapped place lives
	// server-side now; the old localStorage value migrates once.
	const NS = 'wpie-map-studio';
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
				t(
					'Map Posters needs WunderPaint 1.144 or newer (geo proxy).'
				)
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
	params.textColors = { ...( params.textColors || {} ) };
	params.pins = ( params.pins || [] ).map( ( p ) => ( { ...p } ) );

	let seededDefault = false;
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
		seededDefault = seed === FALLBACK_PLACE;
		params.lat = seed.lat;
		params.lon = seed.lon;
		params.radius = seed.radius || FALLBACK_PLACE.radius;
		params.place = seed.place || FALLBACK_PLACE.place;
	}

	let mapData = null;
	let scene = buildScene( null );
	let lastBBox = null;
	let fetchSeq = 0;
	const cache = new Map();
	let titleDirty = editing;
	let subtitleDirty = editing;

	/* ------------------------------ overlay ------------------------------ */

	// The editor's brand mark (every core modal badges with it) and the
	// Tabler x icon, inline because packs are framework-free.
	const ICON_BRAND =
		'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
	const ICON_CLOSE =
		'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

	// Mount inside the editor root: the modal then follows the editor's
	// modal design (dsm family), theme variables and custom scrollbars.
	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiemap-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Map Posters' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	const headTitleRow = el( 'div', 'dsm-title-row', titles );
	const title = el( 'span', 'dsm-title', headTitleRow );
	title.textContent = 'Map Posters';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = editing
		? t( 'Adjust the map, the layer updates in place.' )
		: t( 'Poster-style maps of any place on earth, as editable layers.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', t( 'Close' ) );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiemap-body', dialog );
	const view = el( 'div', 'wpiemap-view', body );
	const canvas = el( 'canvas', null, view );
	const empty = el( 'div', 'wpiemap-empty', view );
	empty.textContent = t(
		'Search for a city, address or landmark to start the map.'
	);
	const loading = el( 'div', 'wpiemap-loading', view );
	loading.appendChild( document.createTextNode( t( 'Loading map data' ) ) );
	const side = el( 'div', 'wpiemap-side', body );

	/* ------------------------------- search ------------------------------ */

	const searchSec = section( side, t( 'Location' ), 'location' );
	const searchWrap = el( 'div', 'wpiemap-search', searchSec );
	const searchInput = el( 'input', null, searchWrap );
	searchInput.type = 'text';
	searchInput.placeholder = t( 'Search a place, e.g. Hamburg' );
	const results = el( 'div', 'wpiemap-results', searchWrap );
	results.style.display = 'none';
	const coordsLine = el( 'div', 'wpiemap-coords', searchSec );

	// Status/errors float over the preview (not inside the form).
	const status = el( 'div', 'wpiemap-status', view );
	const setStatus = ( text, isError ) => {
		status.textContent = text || '';
		status.className =
			'wpiemap-status' +
			( text ? ' on' : '' ) +
			( isError ? ' err' : '' );
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
	// The editor's own swatch + color popover, mounted into plain DOM
	// (bridge, v1.145); older cores fall back to a native color input.
	const mountSwatch = bridge.components && bridge.components.mountColorButton;
	// `into` is the params object the value lands in and `where` the section
	// the row is built in, so the text block can reuse this instead of
	// growing a second, slightly different colour control. The swatch, the
	// popover and the Auto reset must behave identically wherever they
	// appear; two implementations drift.
	const colorRow = ( key, label, into = params.overrides, where = colorSec ) => {
		const row = el( 'div', 'wpiemap-row', where );
		const span = el( 'span', null, row );
		span.textContent = label;
		const slot = el( 'span', 'wpiemap-swatch', row );
		const onChange = ( c ) => {
			into[ key ] = c;
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
		const reset = el( 'button', 'wpiemap-reset', row );
		reset.textContent = t( 'Auto' );
		reset.title = t( 'Back to the theme color' );
		reset.onclick = ( e ) => {
			e.preventDefault();
			delete into[ key ];
			syncColorInputs();
			paint();
		};
	};
	colorRow( 'bg', t( 'Background' ) );
	colorRow( 'road', t( 'Roads' ) );
	colorRow( 'water', t( 'Water' ) );
	colorRow( 'green', t( 'Parks' ) );

	// v2.0 - foil / gradient roads (gold streets on black) + glow.
	const gradRow = el( 'div', 'wpiemap-gradrow', colorSec );
	el( 'span', 'wpiemap-gradlbl', gradRow ).textContent = t( 'Road foil' );
	const gradWrap = el( 'div', 'wpiemap-grads', gradRow );
	const gradBtns = new Map();
	const gradTile = ( id, label, background ) => {
		const b = el( 'button', 'wpiemap-grad', gradWrap );
		b.type = 'button';
		b.title = label;
		b.setAttribute( 'aria-label', label );
		if ( background ) {
			b.style.background = background;
		} else {
			b.textContent = t( 'Auto' );
		}
		b.onclick = () => {
			params.roadGradientId = id;
			syncGrads();
			paint();
		};
		gradBtns.set( id, b );
	};
	gradTile( '', t( 'Auto' ), '' );
	for ( const g of GRADIENTS ) {
		gradTile( g.id, g.label, `linear-gradient(90deg, ${ g.stops.join( ', ' ) })` );
	}
	const flowRow = el( 'label', 'wpiemap-row', colorSec );
	el( 'span', null, flowRow ).textContent = t( 'Color flow' );
	const flowSel = el( 'select', 'dsm-select', flowRow );
	for ( const [ value, label ] of [
		[ 'class', t( 'By road class' ) ],
		[ 'x', t( 'Across the poster' ) ],
	] ) {
		const o = el( 'option', null, flowSel );
		o.value = value;
		o.textContent = label;
	}
	flowSel.value = params.roadMap || 'class';
	flowSel.onchange = () => {
		params.roadMap = flowSel.value;
		paint();
	};
	const syncGrads = () => {
		gradBtns.forEach( ( b, id ) =>
			b.classList.toggle( 'sel', id === ( params.roadGradientId || '' ) )
		);
		flowRow.style.display = params.roadGradientId ? '' : 'none';
	};
	syncGrads();
	const glowRow = el( 'label', 'wpiemap-row', colorSec );
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
	// Brand colors map onto every editable map color, in order of visual
	// weight (roads first), not just one accent. Each brand color is used
	// once; a kit with fewer colors leaves the remaining slots on the theme.
	const BRAND_KEYS = [ 'road', 'water', 'green', 'bg' ];
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
		const brandLbl = el( 'label', 'wpiemap-check', colorSec );
		const brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = params.useBrand;
		const bs = el( 'span', null, brandLbl );
		bs.textContent = t( 'Use brand colors' );
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

	const syncColorInputs = () => {
		const pal = paletteFor( themeOf(), params.overrides );
		colorControls.bg.set( pal.bg );
		colorControls.road.set( params.overrides.road || pal.road.motorway );
		colorControls.water.set( pal.water );
		colorControls.green.set( pal.green );
		// The text swatches show the theme's ink while they are on Auto, so
		// the button never displays a colour the poster is not using.
		if ( colorControls.title ) {
			colorControls.title.set( params.textColors.title || pal.text );
			colorControls.subtitle.set(
				params.textColors.subtitle || pal.text
			);
		}
	};

	// Typography.
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

	/* ------------------------------ map options -------------------------- */

	const optSec = section( side, t( 'Map' ), 'map' );

	const zoomRow = el( 'label', 'wpiemap-row', optSec );
	el( 'span', null, zoomRow ).textContent = t( 'Zoom' );
	const zoomInput = el( 'input', null, zoomRow );
	zoomInput.type = 'range';
	zoomInput.min = '0';
	zoomInput.max = String( RADII.length - 1 );
	const zoomOut = el( 'output', null, zoomRow );
	const syncZoom = () => {
		zoomInput.value = String( nearestRadiusIndex( params.radius ) );
		zoomOut.textContent = radiusLabel( params.radius );
	};
	zoomInput.oninput = () => {
		params.radius = RADII[ parseInt( zoomInput.value, 10 ) ];
		zoomOut.textContent = radiusLabel( params.radius );
		syncBuildingsState();
		paint();
		scheduleFetch();
	};

	const weightRow = el( 'label', 'wpiemap-row', optSec );
	el( 'span', null, weightRow ).textContent = t( 'Line weight' );
	const weightInput = el( 'input', null, weightRow );
	weightInput.type = 'range';
	weightInput.min = '50';
	weightInput.max = '220';
	weightInput.value = String( Math.round( params.lineScale * 100 ) );
	const weightOut = el( 'output', null, weightRow );
	weightOut.textContent = `${ weightInput.value }%`;
	weightInput.oninput = () => {
		params.lineScale = parseInt( weightInput.value, 10 ) / 100;
		weightOut.textContent = `${ weightInput.value }%`;
		paint();
	};

	const shapeRow = el( 'div', 'wpiemap-shaperow', optSec );
	el( 'span', null, shapeRow ).textContent = t( 'Shape' );
	const shapeGrid = el( 'div', 'wpiemap-shapes', shapeRow );
	const SHAPE_ICONS = {
		none: '<rect x="4.5" y="4.5" width="15" height="15" rx="1"/>',
		squircle: '<rect x="4.5" y="4.5" width="15" height="15" rx="5.5"/>',
		circle: '<circle cx="12" cy="12" r="8"/>',
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
		[ 'none', t( 'Square' ) ],
		[ 'squircle', t( 'Rounded' ) ],
		[ 'circle', t( 'Circle' ) ],
		[ 'pentagon', t( 'Pentagon' ) ],
		[ 'heart', t( 'Heart' ) ],
		[ 'hex', t( 'Hexagon' ) ],
		[ 'diamond', t( 'Diamond' ) ],
		[ 'triangle', t( 'Triangle' ) ],
		[ 'arch', t( 'Arch' ) ],
		[ 'star', t( 'Star' ) ],
	] ) {
		const tile = el( 'button', 'wpiemap-shape', shapeGrid );
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

	const checks = {};
	const checkRow = ( key, label ) => {
		const row = el( 'label', 'wpiemap-check', optSec );
		const input = el( 'input', null, row );
		input.type = 'checkbox';
		input.checked = !! params.show[ key ];
		const span = el( 'span', null, row );
		span.textContent = label;
		input.onchange = () => {
			params.show[ key ] = input.checked;
			paint();
			if ( 'buildings' === key ) {
				scheduleFetch();
			}
		};
		checks[ key ] = { input, span };
	};
	checkRow( 'water', t( 'Water' ) );
	checkRow( 'green', t( 'Parks and woods' ) );
	checkRow( 'rail', t( 'Railways' ) );
	checkRow( 'paths', t( 'Footpaths' ) );
	checkRow( 'buildings', t( 'Buildings' ) );
	const syncBuildingsState = () => {
		const ok = buildingsAvailable( params.radius );
		checks.buildings.input.disabled = ! ok;
		checks.buildings.span.classList.toggle( 'dim', ! ok );
		checks.buildings.span.textContent = ok
			? t( 'Buildings' )
			: t( 'Buildings (zoom in closer)' );
	};

	/* -------------------------------- pins ------------------------------- */

	const pinSec = section( side, t( 'Pins' ), 'pins' );
	const pinBtn = el( 'button', 'wpiemap-btn wpiemap-addpin', pinSec );
	pinBtn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg><span>${ t( 'Add pin' ) }</span>`;
	const pinNote = el( 'div', 'wpiemap-coords', pinSec );
	pinNote.textContent = t(
		'Pins land in the middle of the map, drag them into place.'
	);
	const pinList = el( 'div', null, pinSec );

	const renderPinList = () => {
		pinList.textContent = '';
		params.pins.forEach( ( pin, i ) => {
			const row = el( 'div', 'wpiemap-pin', pinList );
			const label = el( 'input', null, row );
			label.type = 'text';
			label.value = pin.label || '';
			label.placeholder = t( 'Label' );
			label.oninput = () => {
				pin.label = label.value;
				paint();
			};
			const remove = el( 'button', 'wpiemap-reset', row );
			remove.textContent = '✕';
			remove.title = t( 'Remove pin' );
			remove.onclick = () => {
				params.pins.splice( i, 1 );
				renderPinList();
				paint();
			};
		} );
	};
	renderPinList();

	pinBtn.onclick = () => {
		if ( null === params.lat ) {
			setStatus( t( 'Search for a place first.' ), true );
			return;
		}
		params.pins.push( {
			lat: params.lat,
			lon: params.lon,
			label: `${ t( 'Pin' ) } ${ params.pins.length + 1 }`,
		} );
		renderPinList();
		paint();
	};

	const routeRow = el( 'label', 'wpiemap-row', pinSec );
	el( 'span', null, routeRow ).textContent = t( 'Route' );
	routeRow.style.gridTemplateColumns = '78px 1fr';
	const routeSelect = el( 'select', 'dsm-select wpiemap-select', routeRow );
	for ( const [ value, label ] of [
		[ 'none', t( 'None' ) ],
		[ 'line', t( 'Straight line' ) ],
		[ 'arc', t( 'Curved line' ) ],
	] ) {
		const opt = el( 'option', null, routeSelect );
		opt.value = value;
		opt.textContent = label;
	}
	routeSelect.value = params.route;
	routeSelect.onchange = () => {
		params.route = routeSelect.value;
		paint();
	};
	const distRow = el( 'label', 'wpiemap-check', pinSec );
	const distInput = el( 'input', null, distRow );
	distInput.type = 'checkbox';
	distInput.checked = params.showDistance;
	el( 'span', null, distRow ).textContent = t( 'Show total distance' );
	distInput.onchange = () => {
		params.showDistance = distInput.checked;
		paint();
	};

	/* ----------------------------- text block ---------------------------- */

	let titleInput = null;
	let subtitleInput = null;
	let layoutSelect = null;
	let coordsCheck = null;
	if ( ! editing ) {
		const textSec = section( side, t( 'Text block' ), 'text' );
		const layoutRow = el( 'label', 'wpiemap-row', textSec );
		el( 'span', null, layoutRow ).textContent = t( 'Layout' );
		layoutRow.style.gridTemplateColumns = '78px 1fr';
		layoutSelect = el( 'select', 'dsm-select wpiemap-select', layoutRow );
		for ( const [ value, label ] of [
			[ 'classic', t( 'Classic poster' ) ],
			[ 'corner', t( 'On the map' ) ],
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

		// Placement of the on-map title/coords: a 3x3 alignment grid, shown
		// only for the "On the map" layout. Value is <v><h> (t|m|b, l|c|r).
		const anchorRow = el( 'div', 'wpiemap-anchorrow', textSec );
		el( 'span', null, anchorRow ).textContent = t( 'Alignment' );
		const anchorGrid = el( 'div', 'wpiemap-anchors', anchorRow );
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
				const tile = el( 'button', 'wpiemap-anchor', anchorGrid );
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

		// Editor variable picker (Free >= 1.162): the poster texts land as
		// normal text layers, so {{post.title}} etc. resolve per post in
		// dynamic templates - the button just inserts the tokens. Not a
		// label row: a button inside a <label> would re-focus the input.
		const varButton = ( input, onSet ) => {
			const mount = bridge.components && bridge.components.mountVarButton;
			if ( ! mount ) {
				return null;
			}
			const holder = document.createElement( 'span' );
			mount( holder, {
				getValue: () => input.value,
				onChange: ( v ) => {
					input.value = v;
					onSet();
				},
				inputEl: input,
			} );
			return holder;
		};
		const textRow = ( labelText ) => {
			const row = el( 'div', 'wpiemap-text-row', textSec );
			el( 'span', null, row ).textContent = labelText;
			const wrap = el( 'div', 'wpiemap-var-wrap', row );
			const input = el( 'input', null, wrap );
			input.type = 'text';
			return { input, wrap };
		};

		const titleParts = textRow( t( 'Title' ) );
		titleInput = titleParts.input;
		titleInput.oninput = () => {
			titleDirty = true;
			paint();
		};
		const titleVar = varButton( titleInput, () => {
			titleDirty = true;
			paint();
		} );
		if ( titleVar ) {
			titleParts.wrap.appendChild( titleVar );
		}

		const subtitleParts = textRow( t( 'Subtitle' ) );
		subtitleInput = subtitleParts.input;
		subtitleInput.oninput = () => {
			subtitleDirty = true;
			paint();
		};
		const subtitleVar = varButton( subtitleInput, () => {
			subtitleDirty = true;
			paint();
		} );
		if ( subtitleVar ) {
			subtitleParts.wrap.appendChild( subtitleVar );
		}
		// Ink for the text block. On Auto both follow the theme, which is
		// what every poster did before these existed.
		colorRow( 'title', t( 'Title color' ), params.textColors, textSec );
		colorRow(
			'subtitle',
			t( 'Subtitle color' ),
			params.textColors,
			textSec
		);

		if ( titleVar ) {
			const varHint = el( 'div', 'wpiemap-varhint', textSec );
			varHint.textContent = t(
				'Variables like {{post.title}} resolve per post when the poster runs in a dynamic template.'
			);
		}

		// Fresh sessions open on a seeded place (the last mapped one or
		// the default); the poster text follows it like a search hit
		// would, instead of starting empty (v1.5.1).
		if ( ! editing && params.place ) {
			titleInput.value = params.place.name || '';
			subtitleInput.value = params.place.region || '';
		}

		const sizeRow2 = el( 'label', 'wpiemap-row', textSec );
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

		const coordsRow = el( 'label', 'wpiemap-check', textSec );
		coordsCheck = el( 'input', null, coordsRow );
		coordsCheck.type = 'checkbox';
		coordsCheck.checked = true;
		coordsCheck.onchange = () => paint();
		el( 'span', null, coordsRow ).textContent = t( 'Coordinates line' );
	}

	/* ------------------------------- footer ------------------------------ */

	const attrNote = el( 'div', 'wpiemap-attr', side );
	attrNote.textContent = t( 'Map data © OpenStreetMap contributors (ODbL)' );

	// Standard modal footer: hint left, Cancel + primary action right.
	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = t( 'Drag to move · wheel to zoom' );
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.textContent = t( 'Cancel' );
	cancelBtn.onclick = () => close();
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.textContent = editing ? t( 'Update Map' ) : t( 'Insert Map' );
	apply.disabled = true;

	/* ----------------------------- data + paint -------------------------- */

	const currentBBox = () =>
		viewportBBox( { lat: params.lat, lon: params.lon }, params.radius );

	/**
	 * The final composition in DOCUMENT coordinates, shared verbatim by
	 * the live preview and the insert - what you see is what lands.
	 * Returns the map rect plus text/divider items (no backdrop: the map
	 * group sits transparently on whatever the document already has).
	 */
	function layoutPoster( docW, docH ) {
		const ts = params.textScale || 1;
		const pal = paletteFor( themeOf(), params.overrides );
		const layout = editing ? 'none' : params.textLayout;
		const placeName = ( titleInput && titleInput.value.trim() ) || '';
		const regionName =
			( subtitleInput && subtitleInput.value.trim() ) || '';
		const withText = 'none' !== layout && !! placeName;
		const wantCoords = !! ( coordsCheck && coordsCheck.checked );
		const mapSize = Math.round(
			Math.min(
				docW * 0.86,
				docH * ( withText && 'classic' === layout ? 0.6 : 0.86 )
			)
		);
		const mapX = Math.round( ( docW - mapSize ) / 2 );
		const mapY =
			withText && 'classic' === layout
				? Math.round( docH * 0.07 )
				: Math.round( ( docH - mapSize ) / 2 );

		const items = [];
		const text = ( spec ) => items.push( { kind: 'text', ...spec } );

		// Two inks, not four. The divider is the rule under the headline and
		// belongs to the title lockup; the coordinates share the subtitle's
		// font, size register and tracking, so they follow it. Leaving either
		// on the theme colour while its neighbour is gold does not read as a
		// choice, it reads as something that was forgotten. The attribution
		// stays on the theme deliberately: it is a legal line, not styling.
		const titleInk = params.textColors.title || pal.text;
		const subInk = params.textColors.subtitle || pal.text;
		const attrFs = Math.max( 9, Math.round( mapSize * 0.014 ) );
		text( {
			name: t( 'Attribution' ),
			text: ATTRIBUTION,
			x: mapX,
			y: mapY + mapSize - Math.round( attrFs * 1.9 ),
			w: mapSize - Math.round( attrFs * 0.9 ),
			h: Math.round( attrFs * 1.5 ),
			fontSize: attrFs,
			fontFamily: 'Inter',
			weight: 400,
			color: pal.text,
			align: 'right',
			letterSpacing: 0,
			opacity: 0.55,
		} );

		if ( withText && 'classic' === layout ) {
			const titleFs = Math.round(
				Math.min( docW * 0.072, docH * 0.085 ) * ts
			);
			let y = mapY + mapSize + Math.round( docH * 0.05 );
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
				color: titleInk,
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
				fill: titleInk,
			} );
			y += Math.round( docH * 0.022 );
			const subFs = Math.round( docW * 0.023 * ts );
			if ( regionName ) {
				text( {
					name: t( 'Subtitle' ),
					text: regionName.toUpperCase(),
					x: 0,
					y,
					w: docW,
					h: Math.round( subFs * 1.4 ),
					fontSize: subFs,
					fontFamily: 'Inter',
					weight: 400,
					color: subInk,
					align: 'center',
					letterSpacing: Math.round( subFs * 0.32 ),
				} );
				y += Math.round( subFs * 2 );
			}
			if ( wantCoords ) {
				const coordFs = Math.round( docW * 0.019 * ts );
				text( {
					name: t( 'Coordinates' ),
					text: formatCoords( params.lat, params.lon ),
					x: 0,
					y,
					w: docW,
					h: Math.round( coordFs * 1.4 ),
					fontSize: coordFs,
					fontFamily: 'Inter',
					weight: 400,
					color: subInk,
					align: 'center',
					letterSpacing: Math.round( coordFs * 0.24 ),
				} );
			}
		} else if ( withText && 'corner' === layout ) {
			const titleFs = Math.round( mapSize * 0.055 * ts );
			const pad = Math.round( mapSize * 0.045 );
			const coordFs = Math.round( mapSize * 0.02 * ts );
			const anchor = params.textAnchor || 'bl';
			const vpos = anchor.charAt( 0 ); // t | m | b
			const hpos = anchor.charAt( 1 ); // l | c | r
			const align =
				'l' === hpos ? 'left' : 'r' === hpos ? 'right' : 'center';
			const titleLineH = Math.round( titleFs * 1.3 );
			const coordsLineH = wantCoords ? Math.round( coordFs * 1.6 ) : 0;
			const blockH = titleLineH + coordsLineH;
			const top =
				't' === vpos
					? mapY + pad
					: 'm' === vpos
					? Math.round( mapY + ( mapSize - blockH ) / 2 )
					: mapY + mapSize - pad - blockH;
			text( {
				name: t( 'Title' ),
				text: placeName.toUpperCase(),
				x: mapX + pad,
				y: top,
				w: mapSize - pad * 2,
				h: titleLineH,
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: titleInk,
				align,
				letterSpacing: Math.round( titleFs * 0.1 ),
			} );
			if ( wantCoords ) {
				text( {
					name: t( 'Coordinates' ),
					text: formatCoords( params.lat, params.lon ),
					x: mapX + pad,
					y: top + titleLineH,
					w: mapSize - pad * 2,
					h: coordsLineH,
					fontSize: coordFs,
					fontFamily: 'Inter',
					weight: 400,
					color: subInk,
					align,
					letterSpacing: Math.round( coordFs * 0.24 ),
				} );
			}
		}
		return { mapX, mapY, mapSize, items };
	}

	// Where the map sits inside the preview canvas, for pointer mapping.
	let mapRectPx = null;

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
			mapRectPx = null;
			return;
		}
		empty.style.display = 'none';
		const L = layoutPoster( doc.w, doc.h );
		mapRectPx = {
			x: L.mapX * s,
			y: L.mapY * s,
			w: L.mapSize * s,
			h: L.mapSize * s,
		};
		lastBBox = currentBBox();
		ctx.save();
		ctx.translate( mapRectPx.x, mapRectPx.y );
		drawScene( ctx, mapRectPx.w, mapRectPx.h, scene, {
			bbox: lastBBox,
			theme: themeOf(),
			overrides: params.overrides,
			// Both save paths are explicit allowlists, so a new key that is
			// not named here is silently dropped on save and gone on reopen.
			textColors: params.textColors,
			show: params.show,
			lineScale: params.lineScale,
			roadGradientId: params.roadGradientId || '',
			roadMap: params.roadMap || 'class',
			glow: ( params.glow || 0 ) / 100,
			mask: params.mask,
			pins: params.pins,
			route: params.route,
			showDistance: params.showDistance,
		} );
		ctx.restore();
		// The text block exactly as it will be inserted (transparent
		// document background shows the checker pattern through).
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
			ctx.globalAlpha = item.opacity ?? 1;
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
		coordsLine.textContent = formatCoords( params.lat, params.lon );
	}

	// All interactions call paint(): coalesce to one real render per frame
	// (dragging fires dozens of pointermoves per second).
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

	// Latitude-equivalent span caps of the server proxy (class-geo.php):
	// the overfetch margin clamps against them.
	const SPAN_CAPS = { 1: 4.0, 2: 0.55, 3: 0.06 };

	// The area the current data covers: while the viewport stays inside
	// it (same detail), panning and zooming need NO network at all.
	let fetched = null; // { bbox, detail, buildings }

	// After a "too much data" rejection the detail stays degraded until
	// the user zooms in well past the radius that failed.
	let degraded = null; // { radius, detail }

	const containsView = ( outer, vp ) =>
		vp.south >= outer.south - 1e-9 &&
		vp.north <= outer.north + 1e-9 &&
		vp.west >= outer.west - 1e-9 &&
		vp.east <= outer.east + 1e-9;

	/**
	 * Where to fetch next: the viewport enlarged 1.6x (clamped to the
	 * proxy's span cap) and snapped to a grid, so small pans reuse the
	 * data entirely and repeated areas hit the same server cache key.
	 * Returns null while the current data still covers the viewport.
	 */
	function fetchPlan() {
		const vp = currentBBox();
		let detail = detailForRadius( params.radius );
		if ( degraded && params.radius > degraded.radius * 0.6 ) {
			detail = Math.min( detail, degraded.detail );
		} else {
			degraded = null;
		}
		const buildings =
			params.show.buildings && buildingsAvailable( params.radius );
		// Data with more detail or with buildings is a superset: it also
		// covers requests for less (the toggles just skip drawing).
		if (
			fetched &&
			fetched.detail >= detail &&
			( fetched.buildings || ! buildings ) &&
			containsView( fetched.bbox, vp )
		) {
			return null;
		}
		const latSpan = vp.north - vp.south;
		const lonSpan = vp.east - vp.west;
		const midCos = Math.max(
			0.05,
			Math.cos( ( ( ( vp.south + vp.north ) / 2 ) * Math.PI ) / 180 )
		);
		const cap = SPAN_CAPS[ detail ] * 0.98;
		const halfLat = Math.min( latSpan * 1.6, cap ) / 2;
		const halfLon = Math.min( lonSpan * 1.6, cap / midCos ) / 2;
		let cLat = params.lat;
		let cLon = params.lon;
		if ( halfLat > latSpan * 0.62 ) {
			// Enough margin left: snap the center so nearby pans map to
			// the SAME fetch box (client and server cache hits).
			const grid = latSpan / 4;
			cLat = Math.round( cLat / grid ) * grid;
			cLon = Math.round( cLon / ( grid / midCos ) ) * ( grid / midCos );
		}
		const bbox = {
			south: cLat - halfLat,
			north: cLat + halfLat,
			west: cLon - halfLon,
			east: cLon + halfLon,
		};
		if ( ! containsView( bbox, vp ) ) {
			// Snapping pushed the box off the viewport (margin nearly
			// exhausted at the top of a detail band): center exactly.
			bbox.south = params.lat - halfLat;
			bbox.north = params.lat + halfLat;
			bbox.west = params.lon - halfLon;
			bbox.east = params.lon + halfLon;
		}
		return { bbox, detail, buildings };
	}

	/**
	 * The bundled Oldenburg excerpt (oldenburg.json, box computed by
	 * tools/build-seed.mjs): the default place renders without any
	 * network round trip. Any miss falls back to the normal fetch.
	 */
	async function loadBundledSeed() {
		if ( ! SCRIPT_BASE ) {
			return false;
		}
		try {
			const res = await fetch( SCRIPT_BASE + 'oldenburg.json' );
			if ( ! res.ok ) {
				return false;
			}
			const seed = await res.json();
			if ( fetched || mapData || ! seed?.data ) {
				return false; // a real fetch landed meanwhile
			}
			mapData = seed.data;
			scene = buildScene( mapData );
			fetched = {
				bbox: seed.bbox,
				detail: seed.detail,
				buildings: false,
			};
			apply.disabled = false;
			paint();
			return true;
		} catch ( e ) {
			return false;
		}
	}

	let inFlight = false;
	let wanted = false;

	async function fetchData( retryCount = 0 ) {
		if ( null === params.lat ) {
			return;
		}
		const plan = fetchPlan();
		if ( ! plan ) {
			return;
		}
		if ( inFlight ) {
			// Never stack requests (the public Overpass instances
			// rate-limit): remember and re-plan when the current one ends.
			wanted = true;
			return;
		}
		const { bbox, detail, buildings } = plan;
		const key = [
			bbox.south.toFixed( 4 ),
			bbox.west.toFixed( 4 ),
			bbox.north.toFixed( 4 ),
			bbox.east.toFixed( 4 ),
			detail,
			buildings ? 1 : 0,
		].join( '|' );
		if ( cache.has( key ) ) {
			mapData = cache.get( key );
			scene = buildScene( mapData );
			fetched = plan;
			apply.disabled = false;
			paint();
			return;
		}
		const seq = ++fetchSeq;
		inFlight = true;
		loading.classList.add( 'on' );
		try {
			const data = await geo.map( { ...bbox, detail, buildings } );
			if ( seq !== fetchSeq ) {
				return;
			}
			cache.set( key, data );
			mapData = data;
			scene = buildScene( data );
			fetched = plan;
			apply.disabled = false;
			store.lastPlace = {
				lat: params.lat,
				lon: params.lon,
				radius: params.radius,
				place: params.place,
			};
			storeSave();
			setStatus(
				data.truncated
					? t( 'Very dense area: some detail was skipped.' )
					: ''
			);
			paint();
		} catch ( e ) {
			if ( seq === fetchSeq ) {
				const code = ( e && e.code ) || '';
				if ( 'wpie_geo_busy' === code && retryCount < 2 ) {
					// The public instances rate-limit in waves: one quiet
					// retry usually lands instead of bothering the user.
					setStatus( t( 'The map service is busy, retrying' ) );
					window.setTimeout(
						() => fetchData( retryCount + 1 ),
						2500
					);
				} else if ( 'wpie_geo_span' === code && plan.detail > 1 ) {
					degraded = {
						radius: params.radius,
						detail: plan.detail - 1,
					};
					setStatus( t( 'Very large area: showing fewer details.' ) );
					window.setTimeout( () => fetchData(), 50 );
				} else {
					setStatus(
						e && e.message
							? e.message
							: t( 'Could not load map data.' ),
						true
					);
				}
			}
		} finally {
			inFlight = false;
			if ( seq === fetchSeq ) {
				loading.classList.remove( 'on' );
			}
			if ( wanted ) {
				wanted = false;
				scheduleFetch();
			}
		}
	}
	const scheduleFetch = debounced( fetchData, 350 );

	/* ---------------------------- place search --------------------------- */

	const runSearch = debounced( async () => {
		const q = searchInput.value.trim();
		if ( q.length < 2 ) {
			results.style.display = 'none';
			return;
		}
		try {
			// Offline first, and the editor does it for us since API 2.15:
			// geo.search answers from the bundled index of 34,079 cities and
			// only falls through to Nominatim for what the index cannot know
			// - house numbers, lakes, passes, the small places below the cut.
			// This studio carried that index and the search itself until
			// 2026-08-08, when both moved into the core so a second map
			// extension would not need a second copy.
			const { results: hits } = await geo.search( q, 6 );
			results.textContent = '';
			for ( const hit of hits ) {
				const item = el( 'button', 'wpiemap-result', results );
				item.type = 'button';
				const strong = el( 'strong', null, item );
				strong.textContent = hit.name;
				const small = el( 'small', null, item );
				// The offline index already puts the country in `region`;
				// `display` repeats the name in front of it, which reads as
				// a stutter under a heading that says the same thing.
				small.textContent = hit.region || hit.display;
				item.onclick = () => selectPlace( hit );
			}
			results.style.display = hits.length ? '' : 'none';
			// The list lives in the flow now, so on a scrolled panel it can
			// open below the fold. Bring it into view without yanking the
			// panel around when it is already visible.
			if ( hits.length && results.scrollIntoView ) {
				results.scrollIntoView( { block: 'nearest' } );
			}
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
			const first = results.querySelector( '.wpiemap-result' );
			if ( first ) {
				first.click();
			}
		}
	};

	function selectPlace( hit ) {
		const firstPlace = null === params.lat;
		params.lat = hit.lat;
		params.lon = hit.lon;
		params.place = { name: hit.name, region: hit.region || '' };
		if ( firstPlace ) {
			const zoomByType = {
				city: 4500,
				administrative: 4500,
				town: 3000,
				village: 1500,
				suburb: 2000,
			};
			params.radius = zoomByType[ hit.type ] || params.radius;
		}
		if ( titleInput && ! titleDirty ) {
			titleInput.value = hit.name;
		}
		if ( subtitleInput && ! subtitleDirty ) {
			subtitleInput.value = hit.region || '';
		}
		results.style.display = 'none';
		searchInput.value = hit.name;
		syncZoom();
		syncBuildingsState();
		paint();
		fetchData();
	}

	/* --------------------------- pan, zoom, pins -------------------------- */

	let drag = null; // { kind: 'pan', ... } | { kind: 'pin', i, un }

	const mapPos = ( e ) => {
		const rect = canvas.getBoundingClientRect();
		return {
			x: e.clientX - rect.left - ( mapRectPx ? mapRectPx.x : 0 ),
			y: e.clientY - rect.top - ( mapRectPx ? mapRectPx.y : 0 ),
		};
	};

	const pinHitIndex = ( px, py ) => {
		if ( ! lastBBox || ! mapRectPx ) {
			return -1;
		}
		const project = makeProjector( lastBBox, mapRectPx.w, mapRectPx.h );
		const pinPx = Math.max(
			7,
			( Math.min( mapRectPx.w, mapRectPx.h ) / 1000 ) * 16
		);
		for ( let i = params.pins.length - 1; i >= 0; i-- ) {
			const [ x, y ] = project(
				params.pins[ i ].lat,
				params.pins[ i ].lon
			);
			const dx = px - x;
			const dy = py - ( y - pinPx * 1.2 );
			if ( dx * dx + dy * dy < ( pinPx * 2 ) ** 2 ) {
				return i;
			}
		}
		return -1;
	};

	canvas.onpointerdown = ( e ) => {
		if ( null === params.lat || ! mapRectPx ) {
			return;
		}
		const p = mapPos( e );
		const inside =
			p.x >= 0 && p.y >= 0 && p.x <= mapRectPx.w && p.y <= mapRectPx.h;
		if ( ! inside ) {
			return;
		}
		const hit = pinHitIndex( p.x, p.y );
		drag =
			hit >= 0
				? {
						kind: 'pin',
						i: hit,
						un: makeUnprojector(
							lastBBox,
							mapRectPx.w,
							mapRectPx.h
						),
				  }
				: {
						kind: 'pan',
						x: e.clientX,
						y: e.clientY,
						lat: params.lat,
						lon: params.lon,
				  };
		canvas.setPointerCapture( e.pointerId );
	};
	canvas.onpointermove = ( e ) => {
		if ( ! drag || ! lastBBox || ! mapRectPx ) {
			return;
		}
		if ( 'pin' === drag.kind ) {
			const p = mapPos( e );
			const [ la, lo ] = drag.un(
				Math.max( 0, Math.min( mapRectPx.w, p.x ) ),
				Math.max( 0, Math.min( mapRectPx.h, p.y ) )
			);
			params.pins[ drag.i ].lat = la;
			params.pins[ drag.i ].lon = lo;
			paint();
			return;
		}
		const dLat =
			( ( e.clientY - drag.y ) / mapRectPx.h ) *
			( lastBBox.north - lastBBox.south );
		const dLon =
			( ( e.clientX - drag.x ) / mapRectPx.w ) *
			( lastBBox.east - lastBBox.west );
		params.lat = Math.max( -85, Math.min( 85, drag.lat + dLat ) );
		params.lon = Math.max( -180, Math.min( 180, drag.lon - dLon ) );
		paint();
		scheduleFetch();
	};
	canvas.onpointerup = () => {
		drag = null;
	};
	canvas.onwheel = ( e ) => {
		if ( null === params.lat ) {
			return;
		}
		e.preventDefault();
		params.radius = Math.round(
			Math.max(
				350,
				Math.min(
					150000,
					params.radius * ( e.deltaY > 0 ? 1.18 : 0.85 )
				)
			)
		);
		syncZoom();
		syncBuildingsState();
		paint();
		scheduleFetch();
	};

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
		if ( ! mapData ) {
			setStatus( t( 'The map data is still loading.' ), true );
			return;
		}
		apply.disabled = true;
		setStatus( t( 'Rendering the map' ) );
		try {
			await insertOrUpdate();
			close();
		} catch ( e ) {
			setStatus(
				e && e.message ? e.message : t( 'Could not insert the map.' ),
				true
			);
			apply.disabled = false;
		}
	};

	async function insertOrUpdate() {
		const bake = document.createElement( 'canvas' );
		bake.width = OUT_SIZE;
		bake.height = OUT_SIZE;
		drawScene( bake.getContext( '2d' ), OUT_SIZE, OUT_SIZE, scene, {
			bbox: currentBBox(),
			theme: themeOf(),
			overrides: params.overrides,
			// Both save paths are explicit allowlists, so a new key that is
			// not named here is silently dropped on save and gone on reopen.
			textColors: params.textColors,
			show: params.show,
			lineScale: params.lineScale,
			roadGradientId: params.roadGradientId || '',
			roadMap: params.roadMap || 'class',
			glow: ( params.glow || 0 ) / 100,
			mask: params.mask,
			pins: params.pins,
			route: params.route,
			showDistance: params.showDistance,
		} );
		const url = bake.toDataURL( 'image/png' );
		const stored = {
			...params,
			pins: params.pins.map( ( p ) => ( { ...p } ) ),
		};

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
			editor.commit( t( 'Update Map' ) );
			return;
		}

		const { makeImage, makeText, makeShape, makeGroup } = bridge.documents;
		const doc = editor.state.doc;
		const L = layoutPoster( doc.w, doc.h );

		const children = [];
		const mapLayer = makeImage( {
			name: `${ t( 'Map' ) } ${
				( params.place && params.place.name ) || ''
			}`.trim(),
			x: L.mapX,
			y: L.mapY,
			w: L.mapSize,
			h: L.mapSize,
			src: url,
			naturalW: OUT_SIZE,
			naturalH: OUT_SIZE,
		} );
		mapLayer.generator = { id: GEN_ID, params: stored };
		children.push( mapLayer );

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
			const textLayer = makeText( {
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
			} );
			textLayer.opacity = item.opacity ?? 1;
			children.push( textLayer );
		}

		try {
			await bridge.fonts.ensureFontsForLayers(
				children.filter( ( c ) => 'text' === c.type )
			);
		} catch ( e ) {
			// Fonts fall back gracefully; never block the insert.
		}

		const group = makeGroup( {
			name: `${ t( 'Map' ) }: ${
				( params.place && params.place.name ) || t( 'Map' )
			}`,
		} );
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		for ( const child of children ) {
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( t( 'Insert Map' ) );
	}

	/* -------------------------------- boot ------------------------------- */

	syncThemeSel();
	applyBrand();
	syncColorInputs();
	if ( params.font && bridge.fonts && bridge.fonts.ensureFont ) {
		bridge.fonts.ensureFont( params.font ).then( paint ).catch( () => {} );
	}
	syncZoom();
	syncBuildingsState();
	if ( params.place ) {
		searchInput.value = params.place.name || '';
	}
	// Preload the poster fonts so the live preview text renders in the
	// real faces, not the fallback.
	bridge.fonts
		.ensureFontsForLayers( [
			{ type: 'text', fontFamily: params.font || 'Montserrat', weight: 700 },
			{ type: 'text', fontFamily: 'Inter', weight: 400 },
		] )
		.then( () => paint() )
		.catch( () => {} );
	requestAnimationFrame( () => {
		paint();
		if ( null !== params.lat ) {
			if ( seededDefault ) {
				loadBundledSeed().then( ( ok ) => {
					if ( ! ok ) {
						fetchData();
					}
				} );
			} else {
				fetchData();
			}
		} else {
			searchInput.focus();
		}
	} );
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Map Posters',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-map-studio', register );
}
