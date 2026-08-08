/**
 * Route Studio - WPIE extension entry.
 *
 * GPX files become posters: the run/ride/hike as a clean route line,
 * optionally on a real OpenStreetMap street map (rendered locally via
 * the editor's geo proxy), with an elevation profile, race stats and
 * classic poster typography inserted as REAL text layers (Map Posters
 * pattern). The baked square carries `layer.generator = { id, params }`
 * with the simplified track, so "Edit Route Studio" re-opens the
 * poster without the original file.
 */

import {
	THEMES,
	paletteFor,
	buildScene,
	formatCoords,
} from './map-engine.js';
import { parseGpx, simplifyTrack, MAX_GPX_BYTES } from './gpx.js';
import {
	routeStats,
	fmtDistance,
	fmtGain,
	fmtDuration,
	fmtPace,
	fmtDate,
	valueSeries,
	paceLabel,
} from './route-stats.js';
import { DEMO_ROUTE } from './demo-route.js';
import {
	routeBBox,
	drawRoutePoster,
	elevationSeries,
} from './poster.js';

const GEN_ID = 'wpie-route-visualizer/route';
const OUT_SIZE = 2048;
const ATTRIBUTION = '© OpenStreetMap contributors';

import { t, LOCALE } from './i18n.js';


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
	const r = el( 'div', 'wpiert-row', parent );
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
	const val = el( 'span', 'wpiert-val', r );
	val.textContent = input.value + unit;
	input.oninput = () => {
		val.textContent = input.value + unit;
		oninput( parseInt( input.value, 10 ) );
	};
	return input;
}

function checkRow( parent, label, checked, onchange ) {
	const r = row( parent, label );
	r.classList.add( 'wpiert-wide' );
	const input = el( 'input', 'wpiert-checkbox', r );
	input.type = 'checkbox';
	input.checked = checked;
	input.onchange = () => onchange( input.checked );
	return input;
}

/** Settings card with a Tabler icon header (paths verbatim). */
function section( parent, icon, label ) {
	const card = el( 'div', 'wpiert-card', parent );
	const head = el( 'div', 'wpiert-card-head', card );
	head.innerHTML = icon + '<span>' + label + '</span>';
	return el( 'div', 'wpiert-card-body', card );
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
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';
const ICONS = {
	route: tabIcon(
		'M3 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M19 7a2 2 0 1 0 0 -4a2 2 0 0 0 0 4z M11 19h5.5a3.5 3.5 0 0 0 0 -7h-8a3.5 3.5 0 0 1 0 -7h4.5'
	),
	design: tabIcon(
		'M12 21a9 9 0 0 1 0 -18c4.97 0 9 3.582 9 8c0 1.06 -.474 2.078 -1.318 2.828c-.844 .75 -1.989 1.172 -3.182 1.172h-2.5a2 2 0 0 0 -1 3.75a1.3 1.3 0 0 1 -1 2.25 M7.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M11.5 7.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0 M15.5 10.5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0'
	),
	line: tabIcon(
		'M17 3a2.85 2.83 0 1 1 4 4l-14 14l-4 1l1 -4z M16 7l1 1'
	),
	map: tabIcon(
		'M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13 M9 4v13 M15 7v13'
	),
	text: tabIcon(
		'M4 20l3 0 M14 20l7 0 M6.9 15l6.9 0 M10.2 6.3l5.8 13.7 M5 20l6 -16l2 0l7 16'
	),
};
const ICON_CLOSE =
	'<svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

function debounced( fn, ms ) {
	let h = 0;
	return () => {
		window.clearTimeout( h );
		h = window.setTimeout( fn, ms );
	};
}

/* --------------------------------- studio -------------------------------- */

const DEFAULTS = {
	theme: 'minimal',
	layout: 'classic',
	colorMode: 'solid',
	kmMarkers: 'off',
	textScale: 1,
	lineScale: 1,
	routeColor: '',
	useBrand: false,
	brandKitId: '',
	markers: true,
	elevation: true,
	mapBg: false,
	stats: { dist: true, gain: true, dur: true, pace: false, date: true },
	title: '',
	subtitle: '',
	font: '',
	route: null,
};

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE && window.WPIE.bridge;
	const geo = bridge && bridge.api && bridge.api.geo;
	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = editing
		? {
				...DEFAULTS,
				...layer.generator.params,
				stats: {
					...DEFAULTS.stats,
					...( layer.generator.params.stats || {} ),
				},
		  }
		: { ...DEFAULTS, stats: { ...DEFAULTS.stats } };
	if ( 'corner' === params.layout ) {
		params.layout = 'corner-tl';
	}

	/* ------------------------------ overlay ------------------------------ */

	const host = document.getElementById( 'wpie-root' ) || document.body;
	const backdrop = el( 'div', 'modal-backdrop', host );
	const dialog = el( 'div', 'dsm wpiert-dialog', backdrop );
	dialog.setAttribute( 'role', 'dialog' );
	dialog.setAttribute( 'aria-label', 'Route Visualizer' );
	dialog.onclick = ( e ) => e.stopPropagation();
	const head = el( 'div', 'dsm-head', dialog );
	const badge = el( 'span', 'dsm-badge', head );
	badge.innerHTML = ICON_BRAND;
	const titles = el( 'div', 'dsm-titles', head );
	const titleRow = el( 'div', 'dsm-title-row', titles );
	const dlgTitle = el( 'span', 'dsm-title', titleRow );
	dlgTitle.textContent = 'Route Visualizer';
	const sub = el( 'div', 'dsm-sub', titles );
	sub.textContent = editing
		? t( 'Adjust the poster, the layer updates in place.' )
		: t( 'Turn a GPX file into a route poster.' );
	const closeBtn = el( 'button', 'dsm-close', head );
	closeBtn.setAttribute( 'aria-label', 'Close' );
	closeBtn.innerHTML = ICON_CLOSE;
	const body = el( 'div', 'wpiert-body', dialog );
	const view = el( 'div', 'wpiert-view', body );
	const canvas = el( 'canvas', null, view );
	const empty = el( 'div', 'wpiert-empty', view );
	empty.textContent = t( 'Load a GPX file to start your poster.' );
	const side = el( 'div', 'wpiert-side', body );
	const controls = el( 'div', 'wpiert-controls', side );

	const themeOf = () =>
		THEMES.find( ( th ) => th.id === params.theme ) || THEMES[ 0 ];
	const routeColorOf = () =>
		params.routeColor || paletteFor( themeOf(), {} ).pin;

	/* ------------------------------- route ------------------------------- */

	const secRoute = section( controls, ICONS.route, t( 'Route' ) );
	const loadBtn = el( 'button', 'ai-btn secondary', secRoute );
	loadBtn.type = 'button';
	loadBtn.textContent = t( 'Load GPX file…' );
	const fileInput = el( 'input', null, secRoute );
	fileInput.type = 'file';
	fileInput.accept = '.gpx,application/gpx+xml';
	fileInput.style.display = 'none';
	loadBtn.onclick = () => fileInput.click();
	const routeNote = el( 'div', 'wpiert-note', secRoute );

	const setRoute = ( gpx, isDemo = false ) => {
		const segments = simplifyTrack( gpx.segments );
		const stats = routeStats( gpx.segments );
		params.route = { name: gpx.name, segments, stats };
		isDemoRoute = isDemo;
		const cur = titleInput ? titleInput.value.trim() : '';
		if (
			titleInput &&
			gpx.name &&
			( ! cur || cur === DEMO_ROUTE.name )
		) {
			titleInput.value = gpx.name;
		}
		syncRouteNote();
		syncEleState();
		syncModeOptions();
		syncMapState();
		mapData = null;
		scene = null;
		fetched = null;
		if ( params.mapBg && geo ) {
			scheduleFetch();
		}
		apply.disabled = false;
		paint();
	};

	let isDemoRoute = false;
	const syncRouteNote = () => {
		if ( ! params.route ) {
			routeNote.textContent = '';
			return;
		}
		if ( isDemoRoute ) {
			routeNote.textContent = t(
				'Demo route - load your own GPX file to replace it.'
			);
			return;
		}
		const s = params.route.stats;
		const n = params.route.segments.reduce(
			( a, seg ) => a + seg.length,
			0
		);
		routeNote.textContent =
			( params.route.name ? params.route.name + ' · ' : '' ) +
			fmtDistance( s.distM ) +
			' · ' +
			n +
			' ' +
			t( 'points' );
	};

	fileInput.onchange = () => {
		const f = fileInput.files && fileInput.files[ 0 ];
		if ( ! f ) {
			return;
		}
		// `accept` on the input is a dialog filter and nothing more, so
		// the only real bound is here: reading and parsing happen on the
		// main thread and a huge file would freeze the tab with unsaved
		// work in it. (F-L58, 2026-07-25 audit)
		if ( f.size > MAX_GPX_BYTES ) {
			if ( extras && extras.toasts ) {
				extras.toasts.error(
					t( 'That GPX file is too large to open.' )
				);
			}
			fileInput.value = '';
			return;
		}
		const reader = new FileReader();
		reader.onload = () => {
			const gpx = parseGpx( String( reader.result ) );
			if ( ! gpx.segments.length ) {
				if ( extras && extras.toasts ) {
					extras.toasts.error(
						t( 'No track points in that file.' )
					);
				}
				return;
			}
			setRoute( gpx );
		};
		reader.onerror = () => {
			if ( extras && extras.toasts ) {
				extras.toasts.error( t( 'Could not read that file.' ) );
			}
		};
		reader.readAsText( f );
		fileInput.value = '';
	};

	/* ------------------------------- design ------------------------------- */

	const secDesign = section( controls, ICONS.design, t( 'Design' ) );
	const themeRow = row( secDesign, t( 'Theme' ) );
	const themeSel = el( 'select', 'dsm-select', themeRow );
	for ( const th of THEMES ) {
		const opt = el( 'option', null, themeSel );
		opt.value = th.id;
		opt.textContent = th.label;
	}
	themeSel.value = params.theme;
	themeSel.onchange = () => {
		params.theme = themeSel.value;
		paint();
	};
	const layoutRow = row( secDesign, t( 'Layout' ) );
	const layoutSel = el( 'select', 'dsm-select', layoutRow );
	[
		[ 'classic', t( 'Classic' ) ],
		[ 'corner-tl', t( 'Corner top left' ) ],
		[ 'corner-tr', t( 'Corner top right' ) ],
		[ 'none', t( 'No text' ) ],
	].forEach( ( [ v, label ] ) => {
		const opt = el( 'option', null, layoutSel );
		opt.value = v;
		opt.textContent = label;
	} );
	layoutSel.value = params.layout;
	layoutSel.onchange = () => {
		params.layout = layoutSel.value;
		paint();
	};
	slider(
		secDesign,
		t( 'Text size' ),
		60,
		160,
		Math.round( params.textScale * 100 ),
		( v ) => {
			params.textScale = v / 100;
			paint();
		},
		'%'
	);

	/* ---------------------------- route line ------------------------------ */

	const secLine = section( controls, ICONS.line, t( 'Route line' ) );
	slider(
		secLine,
		t( 'Line width' ),
		40,
		220,
		Math.round( params.lineScale * 100 ),
		( v ) => {
			params.lineScale = v / 100;
			paint();
		},
		'%'
	);
	// Route color: editor color button when available (div row, never
	// a <label> - the popover lives inside the row's subtree).
	const colorRow = row( secLine, t( 'Route color' ) );
	colorRow.classList.add( 'has-color' );
	const colorHost = el( 'div', 'wpiert-colorhost', colorRow );
	const autoBtn = el( 'button', 'wpiert-reset', colorRow );
	autoBtn.type = 'button';
	autoBtn.textContent = t( 'Auto' );
	const onClose = [];
	let colorUi = null;
	const mountColorButton =
		bridge && bridge.components && bridge.components.mountColorButton;
	if ( mountColorButton ) {
		const handle = mountColorButton( colorHost, {
			color: routeColorOf(),
			title: t( 'Route color' ),
			onChange: ( c ) => {
				const hex =
					'string' === typeof c ? c : ( c && c.hex ) || '';
				handle.set( hex );
				params.routeColor = hex;
				paint();
			},
		} );
		colorUi = handle;
		onClose.push( () => handle.unmount() );
	} else {
		const input = el( 'input', null, colorHost );
		input.type = 'color';
		input.value = routeColorOf();
		input.oninput = () => {
			params.routeColor = input.value;
			paint();
		};
		colorUi = { set: ( v ) => ( input.value = v ) };
	}
	autoBtn.onclick = () => {
		params.routeColor = '';
		colorUi.set( routeColorOf() );
		paint();
	};

	// Brand kit: the poster's route line takes the first brand colour, so a
	// club or a shop gets its own look without picking a colour by hand.
	// window.WPIE is read live - the Brand Kits dialog REASSIGNS the list,
	// so anything captured at boot goes stale (the core's 1.250.2 lesson).
	const brandKits = () =>
		(
			( bridge.brand && bridge.brand.kits && bridge.brand.kits() ) ||
			( window.WPIE && window.WPIE.brandKits ) ||
			[]
		).filter( ( k ) => k && Array.isArray( k.colors ) && k.colors.length );
	const brandColors = () => {
		const kits = brandKits();
		if ( ! kits.length ) {
			return (
				( window.WPIE && window.WPIE.brand && window.WPIE.brand.colors ) ||
				[]
			);
		}
		const chosen =
			kits.find( ( k ) => String( k.id ) === String( params.brandKitId ) ) ||
			kits[ 0 ];
		return chosen.colors || [];
	};
	const applyBrand = () => {
		if ( ! params.useBrand ) {
			return;
		}
		const c = brandColors();
		if ( c[ 0 ] ) {
			params.routeColor = c[ 0 ];
			colorUi.set( c[ 0 ] );
		}
	};
	if ( brandKits().length || brandColors().length ) {
		const brandRow = row( secLine, t( 'Brand colors' ) );
		// dsm-checkrow is the host's checkbox row (8px gap); wpiert-check
		// was invented here and never had a rule, so box and label touched.
		const brandLbl = el( 'label', 'dsm-checkrow', brandRow );
		const brandCb = el( 'input', null, brandLbl );
		brandCb.type = 'checkbox';
		brandCb.checked = !! params.useBrand;
		el( 'span', null, brandLbl ).textContent = t( 'Use brand colors' );
		brandCb.onchange = () => {
			params.useBrand = brandCb.checked;
			if ( ! params.useBrand ) {
				params.routeColor = '';
				colorUi.set( routeColorOf() );
			}
			applyBrand();
			paint();
		};
		if (
			brandKits().length > 1 &&
			bridge.components &&
			bridge.components.mountKitPicker
		) {
			bridge.components.mountKitPicker( el( 'div', null, brandRow ), {
				value: params.brandKitId || brandKits()[ 0 ].id,
				onChange: ( id ) => {
					params.brandKitId = id;
					params.useBrand = true;
					brandCb.checked = true;
					applyBrand();
					paint();
				},
			} );
		}
		applyBrand();
	}
	// Data color modes: options gray out when the track lacks the data.
	const modeRow = row( secLine, t( 'Color mode' ) );
	const modeSel = el( 'select', 'dsm-select', modeRow );
	[
		[ 'solid', t( 'Solid' ) ],
		[ 'pace', t( 'Pace' ) ],
		[ 'hr', t( 'Heart rate' ) ],
		[ 'ele', t( 'Elevation' ) ],
	].forEach( ( [ v, label ] ) => {
		const opt = el( 'option', null, modeSel );
		opt.value = v;
		opt.textContent = label;
	} );
	modeSel.value = params.colorMode;
	modeSel.onchange = () => {
		params.colorMode = modeSel.value;
		paint();
	};
	const syncModeOptions = () => {
		for ( const opt of modeSel.options ) {
			opt.disabled =
				'solid' !== opt.value &&
				! ( params.route &&
					valueSeries( params.route.segments, opt.value ) );
		}
		if ( modeSel.selectedOptions[ 0 ]?.disabled ) {
			modeSel.value = 'solid';
			params.colorMode = 'solid';
		}
	};
	const kmRow = row( secLine, t( 'Km markers' ) );
	const kmSel = el( 'select', 'dsm-select', kmRow );
	[
		[ 'off', t( 'Off' ) ],
		[ 'auto', 'Auto' ],
		[ '1', '1 km' ],
		[ '5', '5 km' ],
		[ '10', '10 km' ],
		[ '25', '25 km' ],
		[ '50', '50 km' ],
	].forEach( ( [ v, label ] ) => {
		const opt = el( 'option', null, kmSel );
		opt.value = v;
		opt.textContent = label;
	} );
	kmSel.value = String( params.kmMarkers );
	kmSel.onchange = () => {
		params.kmMarkers = kmSel.value;
		paint();
	};
	checkRow( secLine, t( 'Start / finish markers' ), params.markers, ( v ) => {
		params.markers = v;
		paint();
	} );
	const eleCheck = checkRow(
		secLine,
		t( 'Elevation profile' ),
		params.elevation,
		( v ) => {
			params.elevation = v;
			paint();
		}
	);
	const eleNote = el( 'div', 'wpiert-note', secLine );
	const syncEleState = () => {
		const has =
			params.route && null !== elevationSeries( params.route.segments );
		eleCheck.disabled = ! has;
		eleNote.textContent =
			params.route && ! has
				? t( 'No elevation data in this file.' )
				: '';
	};

	/* -------------------------------- map --------------------------------- */

	let mapData = null;
	let scene = null;
	let fetched = null;
	let inFlight = false;
	let fetchSeq = 0;
	let degradedDetail = null;
	const cache = new Map();
	let mapStatus = null;

	let mapCheck = null;
	const routeSpan = () => {
		if ( ! params.route ) {
			return 0;
		}
		const b = routeBBox( params.route.segments );
		return Math.max(
			b.north - b.south,
			( b.east - b.west ) *
				Math.cos( ( ( b.north + b.south ) / 2 ) * Math.PI / 180 )
		);
	};
	// Public Overpass instances return empty results for region-sized
	// queries long before the server-side caps: be honest about it.
	const MAP_SPAN_LIMIT = 0.8;
	const syncMapState = () => {
		if ( ! mapCheck ) {
			return;
		}
		const tooBig = routeSpan() > MAP_SPAN_LIMIT;
		mapCheck.disabled = tooBig;
		if ( tooBig ) {
			if ( params.mapBg ) {
				params.mapBg = false;
				mapCheck.checked = false;
			}
			setStatus( t( 'Route too large for the street map.' ) );
		} else {
			setStatus( '' );
		}
	};
	if ( geo ) {
		const secMap = section( controls, ICONS.map, t( 'Map' ) );
		mapCheck = checkRow(
			secMap,
			t( 'Street map background' ),
			params.mapBg,
			( v ) => {
				params.mapBg = v;
				if ( v && params.route ) {
					scheduleFetch();
				}
				paint();
			}
		);
		const privacyNote = el( 'div', 'wpiert-note', secMap );
		privacyNote.textContent = t(
			'Streets from OpenStreetMap, fetched through your own server and cached there.'
		);
		mapStatus = el( 'div', 'wpiert-note wpiert-status', secMap );
	} else {
		params.mapBg = false;
	}


	const setStatus = ( text, isError ) => {
		if ( mapStatus ) {
			mapStatus.textContent = text || '';
			mapStatus.classList.toggle( 'error', !! isError );
		}
	};

	// Latitude-equivalent span caps of the server proxy (class-geo.php).
	const detailForSpan = ( span ) =>
		span <= 0.06 ? 3 : span <= 0.55 ? 2 : 1;

	async function fetchData( retryCount = 0 ) {
		if ( ! geo || ! params.mapBg || ! params.route ) {
			return;
		}
		if ( inFlight ) {
			return;
		}
		const bbox = routeBBox( params.route.segments );
		const span = Math.max(
			bbox.north - bbox.south,
			( bbox.east - bbox.west ) *
				Math.cos( ( ( bbox.north + bbox.south ) / 2 ) * Math.PI / 180 )
		);
		let detail = detailForSpan( span );
		if ( degradedDetail ) {
			detail = Math.min( detail, degradedDetail );
		}
		const key =
			[ bbox.south, bbox.west, bbox.north, bbox.east ]
				.map( ( n ) => n.toFixed( 4 ) )
				.join( '|' ) +
			'|' +
			detail;
		if ( cache.has( key ) ) {
			mapData = cache.get( key );
			scene = buildScene( mapData );
			paint();
			return;
		}
		const seq = ++fetchSeq;
		inFlight = true;
		setStatus( t( 'Loading map data' ) + '…' );
		try {
			const data = await geo.map( { ...bbox, detail, buildings: false } );
			if ( seq !== fetchSeq ) {
				return;
			}
			cache.set( key, data );
			mapData = data;
			scene = buildScene( data );
			setStatus(
				! data.els.length
					? t( 'No map data returned for this area.' )
					: data.truncated
					? t( 'Very dense area: some detail was skipped.' )
					: ''
			);
			paint();
		} catch ( e ) {
			if ( seq === fetchSeq ) {
				const code = ( e && e.code ) || '';
				if (
					( 'wpie_geo_busy' === code ||
						'wpie_geo_fetch' === code ) &&
					retryCount < 2
				) {
					setStatus( t( 'The map service is busy, retrying' ) + '…' );
					window.setTimeout(
						() => {
							inFlight = false;
							fetchData( retryCount + 1 );
						},
						2500
					);
					return;
				}
				if ( 'wpie_geo_span' === code && detail > 1 ) {
					degradedDetail = detail - 1;
					setStatus( t( 'Very large area: showing fewer details.' ) );
					inFlight = false;
					fetchData();
					return;
				}
				setStatus(
					( e && e.message ) || t( 'Could not load map data.' ),
					true
				);
			}
		} finally {
			inFlight = false;
		}
	}
	const scheduleFetch = debounced( fetchData, 250 );

	/* -------------------------------- text -------------------------------- */

	const secText = section( controls, ICONS.text, t( 'Text' ) );
	// Font: any editor font for the poster type (bridge, API 2.8).
	const fontRowEl = row( secText, t( 'Font' ) );
	// Central font picker (bridge API 2.9); the plain select stays as
	// the fallback on older editors (default family: Montserrat).
	if ( bridge.components && bridge.components.mountFontPicker ) {
		bridge.components.mountFontPicker( el( 'div', null, fontRowEl ), {
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
		const fontSel = el( 'select', 'dsm-select', fontRowEl );
		const fontFamilies = ( () => {
			if ( bridge && bridge.fonts && bridge.fonts.listFamilies ) {
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
			if ( params.font && bridge && bridge.fonts && bridge.fonts.ensureFont ) {
				bridge.fonts.ensureFont( params.font ).then( paint ).catch( paint );
			} else {
				paint();
			}
		};
	}
	const titleRowEl = row( secText, t( 'Title' ) );
	const titleInput = el( 'input', 'dsm-input', titleRowEl );
	titleInput.type = 'text';
	titleInput.value = params.title || '';
	titleInput.oninput = () => {
		params.title = titleInput.value;
		paint();
	};
	const subRow = row( secText, t( 'Subtitle' ) );
	const subtitleInput = el( 'input', 'dsm-input', subRow );
	subtitleInput.type = 'text';
	subtitleInput.value = params.subtitle || '';
	subtitleInput.oninput = () => {
		params.subtitle = subtitleInput.value;
		paint();
	};
	const statsHead = el( 'div', 'wpiert-note', secText );
	statsHead.textContent = t( 'Stats line' ) + ':';
	[
		[ 'dist', t( 'Distance' ) ],
		[ 'gain', t( 'Elevation gain' ) ],
		[ 'dur', t( 'Time' ) ],
		[ 'pace', t( 'Pace' ) ],
		[ 'date', t( 'Date' ) ],
	].forEach( ( [ key, label ] ) => {
		checkRow( secText, label, !! params.stats[ key ], ( v ) => {
			params.stats[ key ] = v;
			paint();
		} );
	} );

	/* ------------------------------- footer ------------------------------- */

	const foot = el( 'div', 'dsm-foot', dialog );
	const footHint = el( 'div', 'dsm-hint', foot );
	footHint.textContent = t(
		'Inserts the route as an image plus real text layers, grouped.'
	);
	const actions = el( 'div', 'dsm-actions', foot );
	const cancelBtn = el( 'button', 'ai-btn secondary', actions );
	cancelBtn.type = 'button';
	cancelBtn.textContent = t( 'Cancel' );
	const apply = el( 'button', 'ai-btn primary', actions );
	apply.type = 'button';
	apply.textContent = editing
		? t( 'Update Route' )
		: t( 'Insert Route' );
	apply.disabled = ! params.route;

	/* ---------------------------- layout + paint --------------------------- */

	const statsLineText = () => {
		if ( ! params.route ) {
			return '';
		}
		const s = params.route.stats;
		const parts = [];
		if ( params.stats.dist ) {
			parts.push( fmtDistance( s.distM ) );
		}
		if ( params.stats.gain && s.gainM > 0 ) {
			parts.push( fmtGain( s.gainM ) );
		}
		if ( params.stats.dur && s.durS ) {
			parts.push( fmtDuration( s.durS ) );
		}
		if ( params.stats.pace ) {
			const p = fmtPace( s.distM, s.durS );
			if ( p ) {
				parts.push( p );
			}
		}
		return parts.join( '   ·   ' ).toUpperCase();
	};
	const dateLineText = () =>
		params.route && params.stats.date
			? fmtDate( params.route.stats.startMs, LOCALE )
			: '';

	function layoutPoster( docW, docH ) {
		const ts = params.textScale || 1;
		const pal = paletteFor( themeOf(), {} );
		const layout = editing ? 'none' : params.layout;
		const titleText = ( titleInput.value || '' ).trim();
		const withText = 'none' !== layout && !! titleText;
		const mapSize = Math.round(
			Math.min(
				docW * 0.86,
				docH * ( withText && 'classic' === layout ? 0.58 : 0.86 )
			)
		);
		const mapX = Math.round( ( docW - mapSize ) / 2 );
		const mapY =
			withText && 'classic' === layout
				? Math.round( docH * 0.06 )
				: Math.round( ( docH - mapSize ) / 2 );
		const items = [];
		const text = ( spec ) => items.push( { kind: 'text', ...spec } );
		if ( params.mapBg && scene ) {
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
		}
		const statsText = statsLineText();
		const dateText = dateLineText();
		if ( withText && 'classic' === layout ) {
			const titleFs = Math.round(
				Math.min( docW * 0.07, docH * 0.08 ) * ts
			);
			let y = mapY + mapSize + Math.round( docH * 0.045 );
			text( {
				name: t( 'Title' ),
				text: titleText.toUpperCase(),
				x: 0,
				y,
				w: docW,
				h: Math.round( titleFs * 1.25 ),
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align: 'center',
				letterSpacing: Math.round( titleFs * 0.12 ),
			} );
			y += Math.round( titleFs * 1.45 );
			items.push( {
				kind: 'rect',
				name: t( 'Divider' ),
				x: Math.round( docW / 2 - docW * 0.05 ),
				y,
				w: Math.round( docW * 0.1 ),
				h: Math.max( 2, Math.round( docH * 0.0035 ) ),
				fill: routeColorOf(),
			} );
			y += Math.round( docH * 0.02 );
			const subFs = Math.round( docW * 0.022 * ts );
			const subText = ( subtitleInput.value || '' ).trim();
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
					letterSpacing: Math.round( subFs * 0.3 ),
				} );
				y += Math.round( subFs * 1.9 );
			}
			if ( statsText ) {
				const stFs = Math.round( docW * 0.026 * ts );
				text( {
					name: t( 'Stats' ),
					text: statsText,
					x: 0,
					y,
					w: docW,
					h: Math.round( stFs * 1.4 ),
					fontSize: stFs,
					fontFamily: params.font || 'Montserrat',
					weight: 600,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( stFs * 0.08 ),
				} );
				y += Math.round( stFs * 1.9 );
			}
			if ( dateText ) {
				const dFs = Math.round( docW * 0.018 * ts );
				text( {
					name: t( 'Date' ),
					text: dateText,
					x: 0,
					y,
					w: docW,
					h: Math.round( dFs * 1.4 ),
					fontSize: dFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: 'center',
					letterSpacing: Math.round( dFs * 0.22 ),
					opacity: 0.8,
				} );
			}
		} else if ( withText && layout.startsWith( 'corner' ) ) {
			// Top corners on purpose: the elevation strip owns the
			// bottom of the square.
			const right = 'corner-tr' === layout;
			const pad = Math.round( mapSize * 0.05 );
			const titleFs = Math.round( mapSize * 0.052 * ts );
			const stFs = Math.round( mapSize * 0.024 * ts );
			const lines = [ statsText, dateText ].filter( Boolean );
			let y = mapY + pad;
			text( {
				name: t( 'Title' ),
				text: titleText.toUpperCase(),
				x: mapX + pad,
				y,
				w: mapSize - pad * 2,
				h: Math.round( titleFs * 1.3 ),
				fontSize: titleFs,
				fontFamily: params.font || 'Montserrat',
				weight: 700,
				color: pal.text,
				align: right ? 'right' : 'left',
				letterSpacing: Math.round( titleFs * 0.08 ),
			} );
			y += Math.round( titleFs * 1.35 );
			for ( const line of lines ) {
				text( {
					name: t( 'Stats' ),
					text: line,
					x: mapX + pad,
					y,
					w: mapSize - pad * 2,
					h: Math.round( stFs * 1.4 ),
					fontSize: stFs,
					fontFamily: 'Inter',
					weight: 400,
					color: pal.text,
					align: right ? 'right' : 'left',
					letterSpacing: Math.round( stFs * 0.16 ),
				} );
				y += Math.round( stFs * 1.6 );
			}
		}
		return { mapX, mapY, mapSize, items };
	}

	const kmStepOf = () => {
		if ( 'off' === String( params.kmMarkers ) ) {
			return 0;
		}
		if ( 'auto' !== String( params.kmMarkers ) ) {
			return parseInt( params.kmMarkers, 10 ) || 0;
		}
		// Auto: the smallest step that keeps it to ~12 markers.
		const km = params.route.stats.distM / 1000;
		for ( const step of [ 1, 2, 5, 10, 25, 50, 100 ] ) {
			if ( km / step <= 12 ) {
				return step;
			}
		}
		return 200;
	};
	const legendOf = ( series ) => {
		if ( ! series ) {
			return null;
		}
		const pos =
			'corner-tr' === params.layout && ! editing ? 'tl' : 'tr';
		if ( 'pace' === params.colorMode ) {
			return {
				pos,
				min: paceLabel( series.min ) + ' /km',
				max: paceLabel( series.max ) + ' /km',
			};
		}
		if ( 'hr' === params.colorMode ) {
			return {
				pos,
				min: Math.round( series.min ) + ' bpm',
				max: Math.round( series.max ) + ' bpm',
			};
		}
		return {
			pos,
			min: Math.round( series.min ) + ' m',
			max: Math.round( series.max ) + ' m',
		};
	};
	const bakeSquare = ( size ) => {
		const c = document.createElement( 'canvas' );
		c.width = size;
		c.height = size;
		const series =
			'solid' !== params.colorMode
				? valueSeries( params.route.segments, params.colorMode )
				: null;
		drawRoutePoster( c.getContext( '2d' ), size, {
			segments: params.route.segments,
			bbox: routeBBox( params.route.segments ),
			theme: themeOf(),
			scene: params.mapBg ? scene : null,
			routeColor: routeColorOf(),
			lineScale: params.lineScale,
			markers: params.markers,
			elevation: params.elevation,
			elePoints: params.elevation
				? elevationSeries( params.route.segments )
				: null,
			colorMode: params.colorMode,
			series,
			kmStep: kmStepOf(),
			legend: legendOf( series ),
		} );
		return c;
	};

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
		if ( ! params.route ) {
			empty.style.display = '';
			return;
		}
		empty.style.display = 'none';
		const L = layoutPoster( doc.w, doc.h );
		const px = Math.max( 64, Math.round( L.mapSize * s ) );
		const square = bakeSquare( px );
		ctx.drawImage(
			square,
			L.mapX * s,
			L.mapY * s,
			L.mapSize * s,
			L.mapSize * s
		);
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

	/* -------------------------------- insert ------------------------------- */

	async function insertOrUpdate() {
		if ( ! params.route ) {
			return;
		}
		const baked = bakeSquare( OUT_SIZE );
		const url = baked.toDataURL( 'image/png' );
		const stored = {
			...params,
			title: ( titleInput.value || '' ).trim(),
			subtitle: ( subtitleInput.value || '' ).trim(),
			stats: { ...params.stats },
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
			editor.commit( t( 'Update Route' ) );
			close();
			return;
		}

		const { makeImage, makeText, makeShape, makeGroup } =
			bridge.documents;
		const doc = editor.state.doc;
		const L = layoutPoster( doc.w, doc.h );
		const children = [];
		const img = makeImage( {
			name: `${ t( 'Route' ) } ${ params.route.name || '' }`.trim(),
			x: L.mapX,
			y: L.mapY,
			w: L.mapSize,
			h: L.mapSize,
			src: url,
			naturalW: OUT_SIZE,
			naturalH: OUT_SIZE,
		} );
		img.generator = { id: GEN_ID, params: stored };
		children.push( img );
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
			if ( item.opacity != null ) {
				textLayer.opacity = item.opacity;
			}
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
			name:
				t( 'Route poster' ) +
				( params.route.name ? ': ' + params.route.name : '' ),
		} );
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		for ( const child of children ) {
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( t( 'Insert Route' ) );
		close();
	}
	apply.onclick = () => {
		apply.disabled = true;
		insertOrUpdate().catch( () => {
			apply.disabled = false;
		} );
	};

	/* ------------------------------ lifecycle ------------------------------ */

	function close() {
		window.removeEventListener( 'resize', paint );
		document.removeEventListener( 'keydown', onKey );
		onClose.forEach( ( fn ) => fn() );
		backdrop.remove();
	}
	const onKey = ( e ) => {
		if ( 'Escape' === e.key ) {
			close();
		}
	};
	document.addEventListener( 'keydown', onKey );
	closeBtn.onclick = close;
	cancelBtn.onclick = close;
	backdrop.onclick = ( e ) => {
		if ( e.target === backdrop ) {
			close();
		}
	};
	window.addEventListener( 'resize', paint );

	/* --------------------------------- boot -------------------------------- */

	syncRouteNote();
	syncEleState();
	syncModeOptions();
	syncMapState();
	if ( params.route ) {
		apply.disabled = false;
		if ( params.mapBg && geo ) {
			scheduleFetch();
		}
	} else if ( window.WPIE_ROUTE_DEMO_GPX ) {
		// QA harness hook: preload a specific track.
		const gpx = parseGpx( window.WPIE_ROUTE_DEMO_GPX );
		if ( gpx.segments.length ) {
			setRoute( gpx );
		}
	} else {
		// Built-in demo so the first open already shows a poster.
		setRoute( DEMO_ROUTE, true );
	}
	window.requestAnimationFrame( paint );
	if ( params.font && bridge && bridge.fonts && bridge.fonts.ensureFont ) {
		bridge.fonts.ensureFont( params.font ).then( paint ).catch( () => {} );
	}
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Route Visualizer',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', 'wpie-route-visualizer', register );
}
