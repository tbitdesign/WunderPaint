/**
 * Mystic Studio: computed birth charts, moon phases, zodiac, numerology
 * and couple cards, composed as a full poster in the shape of the
 * document - backdrop, frame, the card art and editable text layers.
 *
 * Everything is calculated locally (astro.js); the only network touch is
 * the editor's own geo proxy for the place search. The preview renders
 * the text layers through the editor's own renderer, so what the preview
 * shows is what lands on the canvas. Edit Mystic Studio on the art layer
 * re-opens the poster; text the user edited by hand survives the update
 * (poster.js).
 */

import { t, content } from './i18n.js';
import { renderAround } from '../../shared/doc-preview.js';
import {
	CARDS,
	GROUPS,
	cardByKey,
	cardData,
	drawArt,
	cardTexts,
	cardStatus,
} from './cards.js';
import { THEMES, resolveTheme, themeByKey } from './themes.js';
import { BACKDROPS, paintBackdrop } from './backdrop.js';
import { FRAMES, frameMetrics, paintFrame } from './frames.js';
import { LAYOUTS, layoutPoster, resolveLayout } from './layout.js';
import {
	LOOKS,
	TITLE_FONTS,
	lookByKey,
	lookParams,
	shuffleLook,
	titleFontOf,
} from './looks.js';
import { WHEEL_STYLES } from './wheel.js';
import {
	TEXT_ROLES,
	ROLE_LABELS,
	buildBlocks,
	keepEdits,
	textLayerProps,
	planUpdate,
} from './poster.js';
import { studioUndo } from '../../shared/studio-undo.js';

const SLUG = 'wpie-mystic-studio';
const GEN_ID = 'wpie-mystic-studio/card';

/* Families that ship with the editor; the preset faces beyond these only
   draw where the site downloaded the font library or enabled the CDN. */
const SHIPPED_FONTS = [
	'Inter',
	'Roboto',
	'Open Sans',
	'Montserrat',
	'Poppins',
	'Oswald',
	'Bebas Neue',
	'Anton',
	'Playfair Display',
	'Lora',
	'Helvetica',
	'Arial',
	'Georgia',
];
const PRESET_FAMILIES = new Set( [
	...TITLE_FONTS.map( ( f ) => f.family ),
	'Inter',
	'Lora',
] );

/** Whether a preset face can be drawn here (a picked face always can). */
function fontUsable( family ) {
	if ( ! PRESET_FAMILIES.has( family ) || SHIPPED_FONTS.includes( family ) ) {
		return true;
	}
	const w = window.WPIE || {};
	return !! w.fontsGoogle || ( w.fontsDownloaded || [] ).includes( family );
}

const THEME_LABELS = {
	celestial: 'Celestial',
	vintage: 'Vintage',
	foil: 'Gold Foil',
	lineart: 'Line Art',
	rose: 'Rose Gold',
	silver: 'Silver Night',
	emerald: 'Emerald',
	amethyst: 'Amethyst',
	midnight: 'Midnight Blue',
	terracotta: 'Terracotta',
	sage: 'Sage',
	noir: 'Noir',
	cosmic: 'Cosmic Pink',
	ocean: 'Ocean',
	sand: 'Desert Sand',
};

const BACKDROP_LABELS = {
	sky: 'Night sky',
	nebula: 'Nebula',
	aurora: 'Aurora',
	dusk: 'Dusk',
	paper: 'Paper',
	plain: 'Plain',
};

const FRAME_LABELS = {
	none: 'None',
	line: 'Line',
	double: 'Double',
	deco: 'Deco',
	stars: 'Stars',
	moons: 'Moons',
	zodiac: 'Zodiac',
	arch: 'Arch',
	celestial: 'Celestial',
};

const LAYOUT_LABELS = {
	auto: 'Auto',
	classic: 'Classic',
	framed: 'Framed',
	minimal: 'Minimal',
	split: 'Side by side',
	art: 'No text',
};

const GROUP_LABELS = {
	all: 'All',
	astro: 'Astrology',
	moon: 'Moon',
	numbers: 'Numbers',
	couples: 'Couples',
};

const ANGEL_PRESETS = [
	'111',
	'222',
	'333',
	'444',
	'555',
	'777',
	'888',
	'999',
	'1111',
	'1212',
];

const DEFAULTS = {
	card: 'birthchart',
	// Person A.
	name: '',
	dateStr: '',
	timeStr: '12:00',
	timeKnown: true,
	place: null, // { name, region }
	lat: null,
	lon: null,
	offsetMode: 'auto', // auto | manual
	offsetMin: 0,
	// Person B.
	name2: '',
	dateStr2: '',
	timeStr2: '12:00',
	// Card options.
	angelNum: '444',
	year: 0, // personal year; 0 = the current year
	signMode: 'sun', // sun | '0'..'11'
	zodiacLayout: 'constellation',
	moonLayout: 'single',
	wheelStyle: 'elegant',
	showHouses: true,
	showAspects: true,
	strictOrbs: false,
	showDegrees: true,
	southern: false,
	// Look.
	look: 'midnight-gold',
	theme: 'celestial',
	custom: null, // { bg, ink, accent }
	backdrop: 'sky',
	stars: 60,
	seed: 7,
	frame: 'double',
	layout: 'auto',
	artScale: 1,
	titleFont: 'Cinzel',
	textFont: 'Inter',
	titleFoil: true,
	titleScale: 1,
	textScale: 1,
	// Text.
	titleText: '',
	message: '',
	withTitle: true,
	withSubtitle: true,
	withKeywords: true,
	withMeaning: true,
	withData: false,
	// poster | art
	output: 'poster',
};

/** Parameters that change the card art (the rest is poster or text). */
const ART_KEYS = [
	'card',
	'dateStr',
	'timeStr',
	'timeKnown',
	'lat',
	'lon',
	'offsetMode',
	'offsetMin',
	'dateStr2',
	'timeStr2',
	'angelNum',
	'year',
	'signMode',
	'zodiacLayout',
	'moonLayout',
	'wheelStyle',
	'showHouses',
	'showAspects',
	'strictOrbs',
	'showDegrees',
	'southern',
	'theme',
	'custom',
	'titleFont',
];

const svg = ( body, size = 16 ) =>
	`<svg width="${ size }" height="${ size }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ body }</svg>`;

const ICONS = {
	cards: svg(
		'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'
	),
	looks: svg(
		'<path d="M12 3l1.8 4.6L18.5 9l-4.7 1.4L12 15l-1.8-4.6L5.5 9l4.7-1.4z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>'
	),
	person: svg(
		'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>'
	),
	partner: svg(
		'<circle cx="9" cy="8" r="3.5"/><circle cx="16.5" cy="9.5" r="2.8"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5M15 14.6c3.4-.4 6.5 1.2 6.5 4.6"/>'
	),
	location: svg(
		'<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>'
	),
	options: svg(
		'<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>'
	),
	colors: svg(
		'<circle cx="13.5" cy="6.5" r="2.5"/><path d="M12 22a10 10 0 1 1 10-10c0 2-1.5 3-3 3h-3a3 3 0 0 0-2 5.2c.6.5.3 1.8-2 1.8z"/>'
	),
	backdrop: svg(
		'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 8h.01M16 7h.01M11 12h.01M8 16h.01M17 15h.01"/>'
	),
	layout: svg(
		'<rect x="4" y="3" width="16" height="18" rx="1.5"/><circle cx="12" cy="10" r="3.5"/><path d="M8 17h8"/>'
	),
	text: svg(
		'<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/>'
	),
	output: svg(
		'<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M5 21h14"/>'
	),
	dice: svg(
		'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.2" fill="currentColor"/><circle cx="16" cy="16" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="16" cy="8" r="1.2" fill="currentColor"/><circle cx="8" cy="16" r="1.2" fill="currentColor"/>'
	),
	sparkle: svg(
		'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
		14
	),
	clock: svg( '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>' ),
	eye: svg(
		'<path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/>',
		14
	),
};

/** Directory URL of this extension's bundle for the moon texture. */
function assetUrl( file ) {
	try {
		const root = window.WPIE || {};
		const list =
			root.extensions || ( root.boot && root.boot.extensions ) || [];
		const ext = list.find(
			( e ) =>
				e && ( e.slug === SLUG || ( e.main || '' ).includes( SLUG ) )
		);
		if ( ext && ext.main ) {
			return (
				String( ext.main ).replace( /extension\.js([?#].*)?$/, '' ) +
				file
			);
		}
	} catch ( e ) {}
	return null;
}

const todayStr = () => {
	const now = new Date();
	return `${ now.getFullYear() }-${ String( now.getMonth() + 1 ).padStart(
		2,
		'0'
	) }-${ String( now.getDate() ).padStart( 2, '0' ) }`;
};

/** Parameters from storage or an older layer, made safe for this build. */
function sanitize( p ) {
	const out = { ...DEFAULTS, ...p };
	if ( ! CARDS.some( ( c ) => c.key === out.card ) ) {
		out.card = DEFAULTS.card;
	}
	if ( ! LAYOUTS.includes( out.layout ) ) {
		out.layout = 'auto';
	}
	if ( ! THEMES.some( ( th ) => th.key === out.theme ) ) {
		out.theme = DEFAULTS.theme;
	}
	if ( ! BACKDROPS.includes( out.backdrop ) ) {
		out.backdrop = DEFAULTS.backdrop;
	}
	if ( ! FRAMES.includes( out.frame ) ) {
		out.frame = DEFAULTS.frame;
	}
	if ( ! WHEEL_STYLES.includes( out.wheelStyle ) ) {
		out.wheelStyle = DEFAULTS.wheelStyle;
	}
	if ( ! /^(sun|\d{1,2})$/.test( String( out.signMode ) ) ) {
		out.signMode = 'sun';
	}
	if ( ! out.dateStr ) {
		out.dateStr = todayStr();
	}
	if ( 'art' !== out.output ) {
		out.output = 'poster';
	}
	return out;
}

/* --------------------------------- studio -------------------------------- */

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE.bridge;
	const ui = bridge.ui;
	const geo = bridge && bridge.api && bridge.api.geo;
	if ( ! ui || ! ui.opts || ! geo ) {
		if ( extras && extras.toasts ) {
			extras.toasts.error(
				t( 'Mystic Studio needs WunderPaint 1.430 or newer.' )
			);
		}
		return;
	}
	const { makeImage, makeText, makeGroup } = bridge.documents;

	let store = {};
	try {
		store = ( await bridge.storage.get( SLUG ) ) || {};
	} catch ( e ) {}
	const storeSave = () =>
		bridge.storage.set( SLUG, store ).catch( () => {
			if ( extras && extras.toasts ) {
				extras.toasts.error( t( 'Could not save your settings.' ) );
			}
		} );

	/* ------------------------- what we are editing ------------------------ */

	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const allLayers = ( editor.state && editor.state.layers ) || [];
	const siblings =
		editing && layer.parent
			? allLayers.filter(
					( l ) => l.parent === layer.parent && l.id !== layer.id
			  )
			: [];
	const backdropLayer =
		siblings.find( ( l ) => l.mystic && 'backdrop' === l.mystic.role ) ||
		null;
	const managedTexts = siblings.filter(
		( l ) =>
			'text' === l.type &&
			l.mystic &&
			TEXT_ROLES.includes( l.mystic.role )
	);

	const params = sanitize(
		editing
			? layer.generator.params
			: { ...( store.lastLook || {} ), ...( store.lastPerson || {} ) }
	);
	if ( editing ) {
		params.output = backdropLayer ? 'poster' : 'art';
	}
	if ( ! editing && null === params.lat && store.lastPlace ) {
		const last = store.lastPlace;
		if ( 'number' === typeof last.lat ) {
			params.lat = last.lat;
			params.lon = last.lon;
			params.place = last.place || null;
		}
	}

	const doc = ( editor.state && editor.state.doc ) || { w: 1600, h: 2000 };
	/** The poster sheet: the whole document, or the edited backdrop box. */
	const sheet = backdropLayer
		? {
				x: backdropLayer.x,
				y: backdropLayer.y,
				w: Math.max( 50, backdropLayer.w ),
				h: Math.max( 50, backdropLayer.h ),
		  }
		: { x: 0, y: 0, w: Math.max( 50, doc.w ), h: Math.max( 50, doc.h ) };

	/* ------------------------------- shell -------------------------------- */

	let mounts = [];
	const unmountAll = () => {
		mounts.forEach( ( m ) => m && m.unmount && m.unmount() );
		mounts = [];
	};
	let alive = true;
	let resizeObs = null;
	let history = null;
	const shutdown = () => {
		alive = false;
		history?.dispose();
		unmountAll();
		if ( resizeObs ) {
			resizeObs.disconnect();
		}
	};

	const modal = ui.dialog( {
		title: 'Mystic Studio',
		subtitle: editing
			? t( 'Adjust the poster, the layers update in place.' )
			: t(
					'Birth charts, moon phases, zodiac and numerology posters, computed and set for your document.'
			  ),
		width: 1320,
		onClose: shutdown,
	} );
	ui.badge( modal );
	modal.dialog.classList.add( 'wpiemys-dialog' );

	const body = ui.el( 'div', 'wpiemys-body', modal.body );
	const left = ui.el( 'div', 'wpiemys-left', body );
	const view = ui.el( 'div', 'wpiemys-view', body );
	const stage = ui.el( 'div', 'wpiemys-stage', view );
	const canvas = ui.el( 'canvas', 'wpiemys-canvas', stage );
	canvas.width = 800;
	canvas.height = 1000;
	const side = ui.el( 'div', 'wpiemys-side', body );

	/* Show document: only meaningful for art without a poster behind it. */
	const docBtn = ui.el( 'button', 'dsm-viewbtn wpiemys-doc', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye;
	docBtn.append( ' ' + t( 'Show document' ) );
	ui.pressed( docBtn, false );
	let showDoc = false;
	let docImage = null;
	let docAbove = null;
	const canShowDoc = !! (
		bridge.raster &&
		bridge.raster.renderToCanvas &&
		editor.state &&
		editor.state.doc
	);
	// v1.0.3 (shared doc-preview): the document split at the edited art,
	// what lies above it is painted over the preview.
	const loadDocImage = async () => {
		if ( docImage || ! canShowDoc ) {
			return;
		}
		try {
			const around = await renderAround( bridge.raster, editor.state, {
				editId: editing ? layer.id : null,
				scale: Math.min( 1, 1400 / Math.max( doc.w, doc.h ) ),
			} );
			docImage = around.below;
			docAbove = around.above;
		} catch ( e ) {}
	};
	docBtn.onclick = async () => {
		showDoc = ! showDoc;
		ui.pressed( docBtn, showDoc );
		if ( showDoc ) {
			await loadDocImage();
		}
		paint();
	};

	const statusLine = ui.el( 'div', 'dsm-hint wpiemys-status', modal.foot );

	/* ---------------------------- measuring ------------------------------ */

	const mctx = document.createElement( 'canvas' ).getContext( '2d' );
	/** The editor's own measure: font string and per-glyph tracking. */
	const measure = ( s, b ) => {
		mctx.font = `${ b.italic ? 'italic ' : '' }${ b.weight || 400 } ${
			b.size
		}px "${ b.family }", sans-serif`;
		if ( b.spacing ) {
			let w = 0;
			for ( const ch of s ) {
				w += mctx.measureText( ch ).width;
			}
			return w;
		}
		return mctx.measureText( s ).width;
	};

	const titleFace = () =>
		fontUsable( params.titleFont ) ? params.titleFont : 'Playfair Display';
	const textFace = () =>
		fontUsable( params.textFont ) ? params.textFont : 'Inter';

	const ensureFonts = () => {
		if ( ! bridge.fonts || ! bridge.fonts.ensureFont ) {
			return Promise.resolve();
		}
		const title = titleFontOf( titleFace() );
		const tf = textFace();
		const jobs = [
			bridge.fonts.ensureFont( title.family, title.weight ),
			bridge.fonts.ensureFont( tf, 400 ),
			bridge.fonts.ensureFont( tf, 500 ),
			bridge.fonts.ensureFont( tf, 600 ),
		];
		for ( const l of managedTexts ) {
			jobs.push(
				bridge.fonts.ensureFont( l.fontFamily, l.weight || 400 )
			);
		}
		// Numbers in the art are set in the title face too: once it has
		// loaded, the cached art (drawn with a fallback) is stale.
		return Promise.all( jobs.map( ( j ) => j.catch( () => {} ) ) ).then(
			() => {
				artCache.key = '';
				scheduleThumbs();
			}
		);
	};

	/* ----------------------------- compose ------------------------------- */

	let moonImg = null;
	const moonSrc = assetUrl( 'textures/moon.jpg' );
	if ( moonSrc ) {
		const img = new Image();
		img.onload = () => {
			moonImg = img;
			artCache.key = '';
			paint();
			scheduleThumbs();
		};
		img.src = moonSrc;
	}

	const theme = () => resolveTheme( params.theme, params.custom );
	const lookFor = ( th ) => ( {
		theme: th,
		moonImg,
		titleFont: titleFace(),
	} );

	/**
	 * The full poster for a sheet of w x h: layout, texts and layer props,
	 * with coordinates relative to the sheet.
	 */
	const compose = ( w, h ) => {
		const th = theme();
		const data = cardData( params );
		const texts = cardTexts( params.card, data );
		const mode =
			'art' === params.output
				? 'art'
				: resolveLayout( params.layout, w, h );
		const faces = {
			...params,
			titleFont: titleFace(),
			textFont: textFace(),
		};
		let blocks = buildBlocks( texts, faces, Math.min( w, h ), mode );
		if ( editing && managedTexts.length ) {
			blocks = keepEdits( blocks, managedTexts );
		}
		const frame =
			'art' === params.output
				? { inset: 0, top: 0, bottom: 0, line: 0 }
				: frameMetrics( params.frame, w, h );
		const lay = layoutPoster( {
			w,
			h,
			mode,
			frame,
			artScale: params.artScale,
			blocks,
			measure,
		} );
		if ( 'art' === params.output ) {
			const s = Math.min( w, h ) * 0.8 * params.artScale;
			lay.art = { x: ( w - s ) / 2, y: ( h - s ) / 2, s };
		}
		const props = lay.blocks.map( ( b ) =>
			textLayerProps( b, th, params, t( ROLE_LABELS[ b.role ] ) )
		);
		return { theme: th, data, texts, mode, lay, props };
	};

	const artCache = { key: '', canvas: null };
	const artKey = ( size ) =>
		JSON.stringify( [
			ART_KEYS.map( ( k ) => params[ k ] ),
			'namechart' === params.card ? params.name : '',
			!! moonImg,
			size,
		] );
	/** The art at a pixel size, cached between paints. */
	const artCanvas = ( size, data, th ) => {
		const key = artKey( size );
		if ( artCache.key === key && artCache.canvas ) {
			return artCache.canvas;
		}
		const c = document.createElement( 'canvas' );
		c.width = size;
		c.height = size;
		drawArt( c.getContext( '2d' ), size, params.card, data, lookFor( th ) );
		artCache.key = key;
		artCache.canvas = c;
		return c;
	};

	const backCache = { key: '', canvas: null };
	/** Backdrop and frame at a pixel size, cached between paints. */
	const backCanvas = ( w, h, th ) => {
		const key = JSON.stringify( [
			w,
			h,
			params.theme,
			params.custom,
			params.backdrop,
			params.stars,
			params.seed,
			params.frame,
		] );
		if ( backCache.key === key && backCache.canvas ) {
			return backCache.canvas;
		}
		const c = document.createElement( 'canvas' );
		c.width = w;
		c.height = h;
		const ctx = c.getContext( '2d' );
		paintBackdrop( ctx, w, h, th, {
			style: params.backdrop,
			stars: params.stars,
			seed: params.seed,
		} );
		paintFrame( ctx, w, h, th, params.frame );
		backCache.key = key;
		backCache.canvas = c;
		return c;
	};

	/** Text layers onto a context, through the editor's own renderer. */
	const renderTexts = async ( props, w, h, scale ) => {
		if ( ! props.length ) {
			return null;
		}
		const layers = props.map( ( p ) => makeText( p ) );
		if ( bridge.raster && bridge.raster.renderToCanvas ) {
			try {
				return await bridge.raster.renderToCanvas(
					{ w, h, bg: 'transparent' },
					layers,
					{ scale }
				);
			} catch ( e ) {}
		}
		// Fallback: plain lines, close enough for an old core.
		const c = document.createElement( 'canvas' );
		c.width = Math.max( 1, Math.round( w * scale ) );
		c.height = Math.max( 1, Math.round( h * scale ) );
		const ctx = c.getContext( '2d' );
		ctx.scale( scale, scale );
		for ( const l of layers ) {
			ctx.font = `${ l.weight } ${ l.fontSize }px "${ l.fontFamily }", sans-serif`;
			ctx.fillStyle = l.color || '#fff';
			ctx.textBaseline = 'top';
			ctx.textAlign = 'center';
			String( l.text )
				.split( '\n' )
				.forEach( ( line, i ) =>
					ctx.fillText(
						line,
						l.x + l.w / 2,
						l.y + i * l.fontSize * l.lineHeight,
						l.w
					)
				);
		}
		return c;
	};

	/* ------------------------------ preview ------------------------------ */

	const fitCanvas = () => {
		const r = view.getBoundingClientRect();
		const availW = Math.max( 120, r.width - 40 );
		const availH = Math.max( 120, r.height - 40 );
		const aspect = sheet.w / sheet.h;
		let cssW = Math.min( availW, availH * aspect );
		let cssH = cssW / aspect;
		if ( cssH > availH ) {
			cssH = availH;
			cssW = cssH * aspect;
		}
		const dpr = Math.min( 2, window.devicePixelRatio || 1 );
		const scale = Math.min( dpr, 1500 / Math.max( cssW, cssH ) );
		const pw = Math.max( 60, Math.round( cssW * scale ) );
		const ph = Math.max( 60, Math.round( cssH * scale ) );
		stage.style.width = Math.round( cssW ) + 'px';
		stage.style.height = Math.round( cssH ) + 'px';
		if ( canvas.width !== pw || canvas.height !== ph ) {
			canvas.width = pw;
			canvas.height = ph;
		}
	};

	let paintSeq = 0;
	let lastComp = null;
	const titleInputs = [];

	async function paint() {
		if ( ! alive ) {
			return;
		}
		const seq = ++paintSeq;
		const W = canvas.width;
		const H = canvas.height;
		const k = W / sheet.w;
		let comp;
		try {
			comp = compose( sheet.w, sheet.h );
		} catch ( e ) {
			statusLine.textContent = t( 'Check the date and time.' );
			return;
		}
		lastComp = comp;
		const base = document.createElement( 'canvas' );
		base.width = W;
		base.height = H;
		const ctx = base.getContext( '2d' );
		if ( 'art' === params.output ) {
			if ( showDoc && docImage ) {
				ctx.drawImage( docImage, 0, 0, W, H );
			}
			stage.classList.toggle( 'is-art', ! ( showDoc && docImage ) );
		} else {
			stage.classList.remove( 'is-art' );
			ctx.drawImage( backCanvas( W, H, comp.theme ), 0, 0 );
		}
		const a = comp.lay.art;
		// Over the document an edited art stays where its layer sits.
		const inDoc = 'art' === params.output && showDoc && docImage;
		const at =
			inDoc && editing
				? { x: layer.x, y: layer.y, w: layer.w, h: layer.h }
				: { x: a.x, y: a.y, w: a.s, h: a.s };
		const px = Math.max(
			24,
			Math.min( 1400, Math.round( Math.max( at.w, at.h ) * k ) )
		);
		try {
			const art = artCanvas( px, comp.data, comp.theme );
			ctx.save();
			if ( inDoc && editing ) {
				ctx.translate( ( at.x + at.w / 2 ) * k, ( at.y + at.h / 2 ) * k );
				ctx.rotate( ( ( layer.rot || 0 ) * Math.PI ) / 180 );
				ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
				ctx.translate( ( -at.w / 2 ) * k, ( -at.h / 2 ) * k );
				ctx.drawImage( art, 0, 0, at.w * k, at.h * k );
			} else {
				ctx.drawImage( art, at.x * k, at.y * k, at.w * k, at.h * k );
			}
			ctx.restore();
		} catch ( e ) {
			statusLine.textContent = t( 'Check the date and time.' );
		}
		if ( inDoc && docAbove ) {
			ctx.drawImage( docAbove, 0, 0, W, H );
		}
		const textCanvas = await renderTexts( comp.props, sheet.w, sheet.h, k );
		if ( seq !== paintSeq || ! alive ) {
			return;
		}
		const out = canvas.getContext( '2d' );
		out.clearRect( 0, 0, W, H );
		out.drawImage( base, 0, 0 );
		if ( textCanvas ) {
			out.drawImage( textCanvas, 0, 0, W, H );
		}
		try {
			statusLine.textContent = cardStatus( params.card, comp.data );
		} catch ( e ) {
			statusLine.textContent = '';
		}
		for ( const input of titleInputs ) {
			input.placeholder = comp.texts.title || t( 'Title' );
		}
	}

	let rafId = 0;
	const schedule = () => {
		if ( rafId ) {
			return;
		}
		rafId = window.requestAnimationFrame( () => {
			rafId = 0;
			paint();
		} );
	};

	/* ---------------------------- thumbnails ----------------------------- */

	const cardThumbs = new Map();
	const lookThumbs = new Map();
	let thumbTimer = 0;
	let thumbSeq = 0;

	/** Card thumbs in the current look, look thumbs with the current card. */
	function renderThumbs() {
		const seq = ++thumbSeq;
		let data;
		try {
			data = cardData( params );
		} catch ( e ) {
			return;
		}
		const th = theme();
		const jobs = [];
		for ( const [ key, c ] of cardThumbs ) {
			jobs.push( () => {
				const ctx = c.getContext( '2d' );
				const S = c.width;
				paintBackdrop( ctx, S, S, th, {
					style: 'plain' === params.backdrop ? 'plain' : 'sky',
					stars: Math.min( 45, params.stars ),
					seed: 3,
				} );
				const s = S * 0.86;
				ctx.save();
				ctx.translate( ( S - s ) / 2, ( S - s ) / 2 );
				try {
					drawArt( ctx, s, key, data, lookFor( th ) );
				} catch ( e ) {}
				ctx.restore();
			} );
		}
		for ( const [ key, c ] of lookThumbs ) {
			jobs.push( () => {
				const look = lookByKey( key );
				const lt = resolveTheme( look.theme, null );
				const ctx = c.getContext( '2d' );
				const W = c.width;
				const H = c.height;
				paintBackdrop( ctx, W, H, lt, {
					style: look.backdrop,
					stars: look.stars,
					seed: 5,
				} );
				paintFrame( ctx, W, H, lt, look.frame );
				const s = W * 0.62;
				ctx.save();
				ctx.translate( ( W - s ) / 2, H * 0.2 );
				try {
					drawArt( ctx, s, params.card, data, {
						theme: lt,
						moonImg,
						titleFont: look.titleFont,
					} );
				} catch ( e ) {}
				ctx.restore();
				// Two hairlines where the title and caption will sit.
				ctx.fillStyle = lt.accent;
				ctx.fillRect(
					W * 0.3,
					H * 0.2 + s + H * 0.05,
					W * 0.4,
					H * 0.018
				);
				ctx.fillStyle = lt.muted;
				ctx.fillRect(
					W * 0.36,
					H * 0.2 + s + H * 0.1,
					W * 0.28,
					H * 0.01
				);
			} );
		}
		const step = () => {
			if ( seq !== thumbSeq || ! alive ) {
				return;
			}
			const until = performance.now() + 12;
			while ( jobs.length && performance.now() < until ) {
				jobs.shift()();
			}
			if ( jobs.length ) {
				window.requestAnimationFrame( step );
			}
		};
		window.requestAnimationFrame( step );
	}
	const scheduleThumbs = () => {
		window.clearTimeout( thumbTimer );
		thumbTimer = window.setTimeout( renderThumbs, 260 );
	};

	/* ----------------------------- left rail ----------------------------- */

	const cardsSec = ui.section( left, {
		icon: ICONS.cards,
		title: t( 'Cards' ),
	} );
	let group = cardByKey( params.card ).group;
	const chipRow = ui.pills( cardsSec, 'wpiemys-chips' );
	const chipBtns = {};
	const cardGrid = ui.picks( cardsSec, { cell: 74, cls: 'wpiemys-cards' } );
	const cardBtns = {};
	for ( const g of GROUPS ) {
		chipBtns[ g ] = ui.pill( chipRow, {
			label: t( GROUP_LABELS[ g ] ),
			on: g === group,
			onClick: () => {
				group = g;
				for ( const k in chipBtns ) {
					ui.pressed( chipBtns[ k ], k === g );
				}
				filterCards();
			},
		} );
	}
	for ( const c of CARDS ) {
		const thumb = document.createElement( 'canvas' );
		thumb.width = 148;
		thumb.height = 148;
		thumb.setAttribute( 'aria-hidden', 'true' );
		const { node } = ui.pick( cardGrid, {
			label: t( c.label ),
			thumb,
			cls: 'wpiemys-card',
			on: params.card === c.key,
			onClick: () => selectCard( c.key ),
		} );
		node.dataset.card = c.key;
		cardBtns[ c.key ] = node;
		cardThumbs.set( c.key, thumb );
	}
	function filterCards() {
		for ( const c of CARDS ) {
			cardBtns[ c.key ].style.display =
				'all' === group || c.group === group ? '' : 'none';
		}
	}
	filterCards();

	function selectCard( key ) {
		params.card = key;
		for ( const k in cardBtns ) {
			ui.pressed( cardBtns[ k ], k === key );
		}
		// A new card starts with its own automatic title.
		params.titleText = '';
		rebuildSide();
		schedule();
		scheduleThumbs();
	}

	const looksSec = ui.section( left, {
		icon: ICONS.looks,
		title: t( 'Looks' ),
	} );
	const shuffleBtn = ui.btn( looksSec, {
		label: t( 'Surprise me' ),
		onClick: () => {
			const rolled = shuffleLook( Date.now() & 0xffffff );
			if ( ! fontUsable( rolled.titleFont ) ) {
				const usable = TITLE_FONTS.filter( ( f ) =>
					fontUsable( f.family )
				);
				rolled.titleFont =
					usable[
						Math.floor( Math.random() * usable.length )
					].family;
			}
			Object.assign( params, rolled );
			markLooks();
			ensureFonts().then( schedule );
			rebuildSide();
			schedule();
			scheduleThumbs();
		},
	} );
	shuffleBtn.classList.add( 'wpiemys-shuffle' );
	// Ctrl+Z / Ctrl+Shift+Z (shared/studio-undo.js), no button: card, look,
	// colours, layout and texts, the way a Surprise comes in.
	history = studioUndo( {
		backdrop: modal.backdrop,
		read: () => params,
		write: ( data ) => {
			Object.assign( params, data );
			for ( const k in cardBtns ) {
				ui.pressed( cardBtns[ k ], k === params.card );
			}
			markLooks();
			ensureFonts().then( schedule );
			rebuildSide();
			schedule();
			scheduleThumbs();
		},
	} );
	shuffleBtn.insertAdjacentHTML( 'afterbegin', ICONS.dice );
	const lookGrid = ui.picks( looksSec, { cell: 74, cls: 'wpiemys-looks' } );
	const lookBtns = {};
	for ( const look of LOOKS ) {
		const thumb = document.createElement( 'canvas' );
		thumb.width = 148;
		thumb.height = 185;
		thumb.setAttribute( 'aria-hidden', 'true' );
		const { node } = ui.pick( lookGrid, {
			label: t( look.label ),
			thumb,
			cls: 'wpiemys-look',
			on: params.look === look.key,
			onClick: () => {
				Object.assign( params, lookParams( look ) );
				if ( ! fontUsable( params.titleFont ) ) {
					params.titleFont = 'Playfair Display';
				}
				markLooks();
				ensureFonts().then( schedule );
				rebuildSide();
				schedule();
				scheduleThumbs();
			},
		} );
		lookBtns[ look.key ] = node;
		lookThumbs.set( look.key, thumb );
	}
	function markLooks() {
		for ( const k in lookBtns ) {
			ui.pressed( lookBtns[ k ], k === params.look );
		}
	}
	/** Any manual look change leaves the preset. */
	const touchLook = () => {
		if ( params.look ) {
			params.look = '';
			markLooks();
		}
	};

	/* ----------------------------- side rail ----------------------------- */

	const inputRow = ( parent, label, type, value, onChange, opts = {} ) => {
		const input = ui.el( 'input', 'dsm-input', ui.row( parent, label ) );
		input.type = type;
		input.value = value;
		if ( opts.placeholder ) {
			input.placeholder = opts.placeholder;
		}
		if ( opts.min !== undefined ) {
			input.min = String( opts.min );
			input.max = String( opts.max );
		}
		const fire = () => onChange( input.value, input );
		if ( 'text' === type ) {
			input.oninput = fire;
		} else {
			input.onchange = fire;
		}
		return input;
	};

	/** A two- or three-way segmented control. */
	const seg = ( parent, options, value, onChange ) => {
		const wrap = ui.el( 'div', 'dsm-seg wpiemys-seg', parent );
		const btns = options.map( ( o ) => {
			const b = ui.el( 'button', null, wrap, o.label );
			b.type = 'button';
			ui.pressed( b, o.value === value );
			b.onclick = () => {
				btns.forEach( ( x ) => ui.pressed( x, x === b ) );
				onChange( o.value );
			};
			return b;
		} );
		return wrap;
	};

	/** An option grid for four or more choices. */
	const optGrid = ( parent, options, value, onChange, cols = 3 ) => {
		const grid = ui.opts( parent, { cols } );
		const btns = options.map( ( o ) =>
			ui.opt( grid, {
				label: o.label,
				on: o.value === value,
				onClick: ( b ) => {
					btns.forEach( ( x ) => ui.pressed( x, x === b ) );
					onChange( o.value );
				},
			} )
		);
		return grid;
	};

	const artChanged = () => {
		schedule();
		scheduleThumbs();
	};

	function rebuildSide() {
		unmountAll();
		titleInputs.length = 0;
		const keepScroll = side.scrollTop;
		side.textContent = '';
		const card = cardByKey( params.card );

		/* Person. */
		if ( ! card.noPerson ) {
			const person = ui.section( side, {
				icon: ICONS.person,
				title: card.partner ? t( 'First person' ) : t( 'Person' ),
			} );
			inputRow( person, t( 'Name' ), 'text', params.name || '', ( v ) => {
				params.name = v;
				schedule();
				if ( 'namechart' === params.card ) {
					scheduleThumbs();
				}
			} ).placeholder = t( 'Optional' );
			if ( card.date ) {
				inputRow(
					person,
					t( 'Birthday' ),
					'date',
					params.dateStr,
					( v ) => {
						if ( v ) {
							params.dateStr = v;
						}
						artChanged();
					}
				);
			}
			if ( card.time ) {
				const timeIn = inputRow(
					person,
					t( 'Time' ),
					'time',
					params.timeStr,
					( v ) => {
						if ( v ) {
							params.timeStr = v;
						}
						artChanged();
					}
				);
				timeIn.disabled = ! params.timeKnown;
				// The sky right now: tonight's moon, today's chart.
				ui.mini( timeIn.parentNode, {
					icon: ICONS.clock,
					title: t( 'Now' ),
					cls: 'wpiemys-now',
					onClick: () => {
						const now = new Date();
						params.dateStr = todayStr();
						params.timeStr =
							String( now.getHours() ).padStart( 2, '0' ) +
							':' +
							String( now.getMinutes() ).padStart( 2, '0' );
						params.timeKnown = true;
						rebuildSide();
						artChanged();
					},
				} );
				ui.check( person, {
					label: t( 'Time unknown' ),
					checked: ! params.timeKnown,
					onChange: ( on ) => {
						params.timeKnown = ! on;
						timeIn.disabled = on;
						artChanged();
					},
				} );
			}
		}

		/* Angel number. */
		if ( 'angelnumber' === params.card ) {
			const sec = ui.section( side, {
				icon: ICONS.sparkle,
				title: t( 'Angel Number' ),
			} );
			const numIn = inputRow(
				sec,
				t( 'Number' ),
				'text',
				params.angelNum || '',
				( v ) => {
					params.angelNum = v;
					artChanged();
				}
			);
			const chips = ui.pills( sec, 'wpiemys-angels' );
			const btns = ANGEL_PRESETS.map( ( n ) =>
				ui.pill( chips, {
					label: n,
					on: n === String( params.angelNum ),
					onClick: ( b ) => {
						params.angelNum = n;
						numIn.value = n;
						btns.forEach( ( x ) => ui.pressed( x, x === b ) );
						artChanged();
					},
				} )
			);
		}

		/* Partner. */
		if ( card.partner ) {
			const partner = ui.section( side, {
				icon: ICONS.partner,
				title: t( 'Second person' ),
			} );
			inputRow(
				partner,
				t( 'Name' ),
				'text',
				params.name2 || '',
				( v ) => {
					params.name2 = v;
					schedule();
				}
			).placeholder = t( 'Optional' );
			inputRow(
				partner,
				t( 'Birthday' ),
				'date',
				params.dateStr2 || params.dateStr,
				( v ) => {
					if ( v ) {
						params.dateStr2 = v;
					}
					artChanged();
				}
			);
			if ( card.partnerTime ) {
				inputRow(
					partner,
					t( 'Time' ),
					'time',
					params.timeStr2,
					( v ) => {
						if ( v ) {
							params.timeStr2 = v;
						}
						artChanged();
					}
				);
			}
		}

		/* Place (houses, ascendant, time zone). */
		if ( card.place ) {
			buildPlace();
		}

		/* Card options. */
		buildCardOptions( card );

		/* Look. */
		buildColors();
		if ( 'poster' === params.output ) {
			buildBackdrop();
			buildLayout();
			buildText( card );
		}
		if ( ! editing ) {
			buildOutput();
		}
		side.scrollTop = keepScroll;
	}

	function buildPlace() {
		const loc = ui.section( side, {
			icon: ICONS.location,
			title: t( 'Birthplace' ),
		} );
		const searchWrap = ui.el( 'div', 'wpiemys-search', loc );
		const searchIn = ui.search( searchWrap, {
			placeholder: t( 'Search for a city' ),
		} ).input;
		searchIn.value = ( params.place && params.place.name ) || '';
		const hits = ui.el( 'div', 'wpiemys-hits', searchWrap );
		let searchSeq = 0;
		const runSearch = async () => {
			const q = searchIn.value.trim();
			hits.textContent = '';
			if ( q.length < 2 ) {
				return;
			}
			const seq = ++searchSeq;
			try {
				const { results } = await geo.search( q, 6 );
				if ( seq !== searchSeq ) {
					return;
				}
				hits.textContent = '';
				if ( ! results || ! results.length ) {
					ui.el(
						'div',
						'dsm-listrow wpiemys-hit is-empty',
						hits,
						t( 'No results.' )
					);
					return;
				}
				for ( const r of results ) {
					const item = ui.el(
						'button',
						'dsm-listrow wpiemys-hit',
						hits
					);
					item.type = 'button';
					item.textContent =
						r.name + ( r.region ? ', ' + r.region : '' );
					item.onclick = () => {
						params.lat = r.lat;
						params.lon = r.lon;
						params.place = { name: r.name, region: r.region || '' };
						searchIn.value = r.name;
						hits.textContent = '';
						store.lastPlace = {
							lat: r.lat,
							lon: r.lon,
							place: params.place,
						};
						storeSave();
						artChanged();
					};
				}
			} catch ( e ) {
				if ( seq !== searchSeq ) {
					return;
				}
				hits.textContent = '';
				ui.el(
					'div',
					'dsm-listrow wpiemys-hit is-empty',
					hits,
					t( 'The search failed. Try again.' )
				);
			}
		};
		let debounce = 0;
		searchIn.oninput = () => {
			window.clearTimeout( debounce );
			debounce = window.setTimeout( runSearch, 280 );
		};
		searchIn.onkeydown = ( e ) => {
			if ( 'Enter' === e.key ) {
				e.preventDefault();
				runSearch();
			}
		};

		const offRow = ui.row( loc, t( 'UTC offset' ) );
		const offSel = ui.select( offRow, {
			options: [
				{ value: 'auto', label: t( 'Auto' ) },
				{ value: 'manual', label: t( 'Manual offset' ) },
			],
			value: params.offsetMode,
			onChange: ( v ) => {
				params.offsetMode = v;
				offIn.style.display = 'manual' === v ? '' : 'none';
				artChanged();
			},
		} );
		offSel.classList.add( 'wpiemys-offsel' );
		const offIn = ui.el( 'input', 'dsm-input wpiemys-offin', offRow );
		offIn.type = 'text';
		offIn.placeholder = '+02:00';
		offIn.style.display = 'manual' === params.offsetMode ? '' : 'none';
		const offToStr = ( min ) =>
			( min < 0 ? '-' : '+' ) +
			String( Math.floor( Math.abs( min ) / 60 ) ).padStart( 2, '0' ) +
			':' +
			String( Math.abs( min ) % 60 ).padStart( 2, '0' );
		offIn.value = offToStr( params.offsetMin || 0 );
		offIn.onchange = () => {
			const m = offIn.value
				.trim()
				.match( /^([+-]?)(\d{1,2})(?::(\d{2}))?$/ );
			if ( m ) {
				const sign = '-' === m[ 1 ] ? -1 : 1;
				params.offsetMin =
					sign *
					( parseInt( m[ 2 ], 10 ) * 60 +
						( m[ 3 ] ? parseInt( m[ 3 ], 10 ) : 0 ) );
			}
			offIn.value = offToStr( params.offsetMin || 0 );
			artChanged();
		};
	}

	function buildCardOptions( card ) {
		const key = card.key;
		const wants = [
			'birthchart',
			'synastry',
			'moonphase',
			'zodiac',
			'couple',
			'personalyear',
		];
		if ( ! wants.includes( key ) ) {
			return;
		}
		const opt = ui.section( side, {
			icon: ICONS.options,
			title: t( 'Card options' ),
		} );
		const toggle = ( label, field ) =>
			ui.check( opt, {
				label,
				checked: !! params[ field ],
				onChange: ( on ) => {
					params[ field ] = on;
					artChanged();
				},
			} );
		if ( 'birthchart' === key ) {
			seg(
				opt,
				WHEEL_STYLES.map( ( s ) => ( {
					value: s,
					label: t( s.charAt( 0 ).toUpperCase() + s.slice( 1 ) ),
				} ) ),
				params.wheelStyle,
				( v ) => {
					params.wheelStyle = v;
					artChanged();
				}
			);
			toggle( t( 'Show houses' ), 'showHouses' );
			toggle( t( 'Show aspects' ), 'showAspects' );
			toggle( t( 'Show degrees' ), 'showDegrees' );
			toggle( t( 'Strict orbs' ), 'strictOrbs' );
		} else if ( 'synastry' === key ) {
			toggle( t( 'Show houses' ), 'showHouses' );
			toggle( t( 'Show aspects' ), 'showAspects' );
			toggle( t( 'Strict orbs' ), 'strictOrbs' );
		} else if ( 'moonphase' === key ) {
			seg(
				opt,
				[
					{ value: 'single', label: t( 'Single' ) },
					{ value: 'cycle', label: t( 'Cycle' ) },
					{ value: 'week', label: t( 'Week' ) },
				],
				params.moonLayout,
				( v ) => {
					params.moonLayout = v;
					artChanged();
				}
			);
			toggle( t( 'Southern sky' ), 'southern' );
		} else if ( 'zodiac' === key ) {
			const c = content();
			ui.select( ui.row( opt, t( 'Sign' ) ), {
				options: [
					{ value: 'sun', label: t( 'From the birthday' ) },
					...c.signs.map( ( s, i ) => ( {
						value: String( i ),
						label: s,
					} ) ),
				],
				value: String( params.signMode ),
				onChange: ( v ) => {
					params.signMode = v;
					artChanged();
				},
			} );
			optGrid(
				opt,
				[
					{ value: 'constellation', label: t( 'Constellation' ) },
					{ value: 'medallion', label: t( 'Medallion' ) },
					{ value: 'glyph', label: t( 'Glyph' ) },
					{ value: 'split', label: t( 'Split' ) },
				],
				params.zodiacLayout,
				( v ) => {
					params.zodiacLayout = v;
					artChanged();
				},
				2
			);
		} else if ( 'couple' === key ) {
			toggle( t( 'Southern sky' ), 'southern' );
		} else if ( 'personalyear' === key ) {
			const year = params.year || new Date().getFullYear();
			inputRow(
				opt,
				t( 'Year' ),
				'number',
				String( year ),
				( v ) => {
					const n = parseInt( v, 10 );
					params.year = n >= 1000 && n <= 3000 ? n : 0;
					artChanged();
				},
				{ min: 1900, max: 2200 }
			);
		}
	}

	function buildColors() {
		const sec = ui.section( side, {
			icon: ICONS.colors,
			title: t( 'Colors' ),
		} );
		const grid = ui.el( 'div', 'wpiemys-swatches', sec );
		const swatches = THEMES.map( ( th ) => {
			const b = ui.el( 'button', 'wpiemys-swatch', grid );
			b.type = 'button';
			b.title = t( THEME_LABELS[ th.key ] || th.key );
			b.setAttribute( 'aria-label', b.title );
			b.style.setProperty( '--a', th.bg[ 0 ] );
			b.style.setProperty( '--b', th.bg[ 1 ] );
			b.style.setProperty( '--c', th.accent );
			ui.pressed( b, ! params.custom && th.key === params.theme );
			b.onclick = () => {
				params.theme = th.key;
				params.custom = null;
				touchLook();
				swatches.forEach( ( x ) => ui.pressed( x, x === b ) );
				rebuildSide();
				artChanged();
			};
			return b;
		} );
		ui.check( sec, {
			label: t( 'Own colors' ),
			checked: !! params.custom,
			onChange: ( on ) => {
				const base = themeByKey( params.theme );
				params.custom = on
					? { bg: base.bg[ 0 ], ink: base.ink, accent: base.accent }
					: null;
				touchLook();
				rebuildSide();
				artChanged();
			},
		} );
		if (
			params.custom &&
			bridge.components &&
			bridge.components.mountColorButton
		) {
			const colorRow = ( label, field ) => {
				const holder = ui.el(
					'div',
					'wpiemys-color',
					ui.row( sec, label )
				);
				mounts.push(
					bridge.components.mountColorButton( holder, {
						color: params.custom[ field ],
						title: label,
						onChange: ( c ) => {
							params.custom = { ...params.custom, [ field ]: c };
							artChanged();
						},
					} )
				);
			};
			colorRow( t( 'Background' ), 'bg' );
			colorRow( t( 'Text' ), 'ink' );
			colorRow( t( 'Accent' ), 'accent' );
		}
	}

	function buildBackdrop() {
		const sec = ui.section( side, {
			icon: ICONS.backdrop,
			title: t( 'Background & frame' ),
		} );
		optGrid(
			sec,
			BACKDROPS.map( ( b ) => ( {
				value: b,
				label: t( BACKDROP_LABELS[ b ] ),
			} ) ),
			params.backdrop,
			( v ) => {
				params.backdrop = v;
				touchLook();
				schedule();
			}
		);
		const starRow = ui.el( 'div', 'wpiemys-starrow', sec );
		ui.slider( starRow, {
			label: t( 'Stars' ),
			min: 0,
			max: 100,
			value: params.stars,
			format: ( v ) => v + '%',
			onInput: ( v ) => {
				params.stars = v;
				touchLook();
				schedule();
			},
		} );
		ui.mini( starRow, {
			icon: ICONS.dice,
			title: t( 'New star field' ),
			onClick: () => {
				params.seed = 1 + Math.floor( Math.random() * 9999 );
				schedule();
			},
		} );
		ui.el( 'div', 'wpiemys-sublabel', sec, t( 'Frame' ) );
		optGrid(
			sec,
			FRAMES.map( ( f ) => ( {
				value: f,
				label: t( FRAME_LABELS[ f ] ),
			} ) ),
			params.frame,
			( v ) => {
				params.frame = v;
				touchLook();
				schedule();
			}
		);
	}

	function buildLayout() {
		const sec = ui.section( side, {
			icon: ICONS.layout,
			title: t( 'Layout' ),
		} );
		optGrid(
			sec,
			LAYOUTS.map( ( l ) => ( {
				value: l,
				label: t( LAYOUT_LABELS[ l ] ),
			} ) ),
			params.layout,
			( v ) => {
				params.layout = v;
				schedule();
			}
		);
		ui.slider( sec, {
			label: t( 'Art size' ),
			min: 40,
			max: 100,
			value: Math.round( params.artScale * 100 ),
			format: ( v ) => v + '%',
			onInput: ( v ) => {
				params.artScale = v / 100;
				schedule();
			},
		} );
		ui.slider( sec, {
			label: t( 'Title size' ),
			min: 50,
			max: 180,
			value: Math.round( params.titleScale * 100 ),
			format: ( v ) => v + '%',
			onInput: ( v ) => {
				params.titleScale = v / 100;
				schedule();
			},
		} );
		ui.slider( sec, {
			label: t( 'Text size' ),
			min: 60,
			max: 160,
			value: Math.round( params.textScale * 100 ),
			format: ( v ) => v + '%',
			onInput: ( v ) => {
				params.textScale = v / 100;
				schedule();
			},
		} );
	}

	function buildText( card ) {
		const sec = ui.section( side, {
			icon: ICONS.text,
			title: t( 'Text' ),
		} );
		const titleIn = inputRow(
			sec,
			t( 'Title' ),
			'text',
			params.titleText || '',
			( v ) => {
				params.titleText = v;
				schedule();
			}
		);
		titleIn.placeholder = ( lastComp && lastComp.texts.title ) || '';
		titleInputs.push( titleIn );
		ui.el( 'div', 'wpiemys-sublabel', sec, t( 'Personal message' ) );
		ui.textarea( sec, {
			value: params.message || '',
			rows: 2,
			placeholder: t( 'Welcome to the world, little star.' ),
			onInput: ( v ) => {
				params.message = v;
				schedule();
			},
		} );
		const toggle = ( label, field ) =>
			ui.check( sec, {
				label,
				checked: !! params[ field ],
				onChange: ( on ) => {
					params[ field ] = on;
					schedule();
				},
			} );
		toggle( t( 'Title' ), 'withTitle' );
		toggle( t( 'Date and place' ), 'withSubtitle' );
		toggle( t( 'Keywords' ), 'withKeywords' );
		toggle( t( 'Meaning' ), 'withMeaning' );
		if ( 'birthchart' === card.key ) {
			toggle( t( 'Chart data' ), 'withData' );
		}
		ui.check( sec, {
			label: t( 'Foil title' ),
			checked: !! params.titleFoil,
			onChange: ( on ) => {
				params.titleFoil = on;
				touchLook();
				schedule();
			},
		} );
		if ( bridge.components && bridge.components.mountFontPicker ) {
			const fontRow = ( label, field ) => {
				const holder = ui.el(
					'div',
					'wpiemys-font',
					ui.row( sec, label )
				);
				mounts.push(
					bridge.components.mountFontPicker( holder, {
						value: 'titleFont' === field ? titleFace() : textFace(),
						onChange: ( fam ) => {
							params[ field ] = fam;
							touchLook();
							ensureFonts().then( schedule );
							schedule();
						},
					} )
				);
			};
			fontRow( t( 'Title font' ), 'titleFont' );
			fontRow( t( 'Text font' ), 'textFont' );
		}
	}

	function buildOutput() {
		const sec = ui.section( side, {
			icon: ICONS.output,
			title: t( 'Insert as' ),
		} );
		seg(
			sec,
			[
				{ value: 'poster', label: t( 'Poster' ) },
				{ value: 'art', label: t( 'Art only' ) },
			],
			params.output,
			( v ) => {
				params.output = v;
				docBtn.style.display = 'art' === v && canShowDoc ? '' : 'none';
				rebuildSide();
				schedule();
			}
		);
		ui.note(
			sec,
			'art' === params.output
				? t( 'Only the chart art, transparent, as one layer.' )
				: t(
						'Background, frame, art and editable text layers, grouped and sized to the document.'
				  )
		);
	}

	/* ------------------------------ footer ------------------------------- */

	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => {
			shutdown();
			modal.close();
		},
	} );
	const apply = ui.btn( actions, {
		label: editing ? t( 'Update' ) : t( 'Insert' ),
		primary: true,
		onClick: async () => {
			apply.disabled = true;
			statusLine.textContent = t( 'Rendering' );
			try {
				await insertOrUpdate();
				shutdown();
				modal.close();
			} catch ( e ) {
				statusLine.textContent =
					( e && e.message ) || t( 'Could not insert the layers.' );
				apply.disabled = false;
			}
		},
	} );

	/* ------------------------------ insert ------------------------------- */

	/** Render the final art and backdrop at output size. */
	const renderOutput = ( comp ) => {
		const a = comp.lay.art;
		const size = Math.max( 800, Math.min( 2000, Math.round( a.s ) ) );
		const art = document.createElement( 'canvas' );
		art.width = size;
		art.height = size;
		drawArt(
			art.getContext( '2d' ),
			size,
			params.card,
			comp.data,
			lookFor( comp.theme )
		);
		let back = null;
		if ( 'poster' === params.output ) {
			const f = Math.min( 1, 3000 / Math.max( sheet.w, sheet.h ) );
			const bw = Math.max( 2, Math.round( sheet.w * f ) );
			const bh = Math.max( 2, Math.round( sheet.h * f ) );
			const c = document.createElement( 'canvas' );
			c.width = bw;
			c.height = bh;
			const ctx = c.getContext( '2d' );
			paintBackdrop( ctx, bw, bh, comp.theme, {
				style: params.backdrop,
				stars: params.stars,
				seed: params.seed,
			} );
			paintFrame( ctx, bw, bh, comp.theme, params.frame );
			back = { url: c.toDataURL( 'image/jpeg', 0.92 ), w: bw, h: bh };
		}
		return { art: { url: art.toDataURL( 'image/png' ), size }, back };
	};

	const rememberLook = () => {
		store.lastLook = {
			look: params.look,
			theme: params.theme,
			custom: params.custom,
			backdrop: params.backdrop,
			stars: params.stars,
			frame: params.frame,
			layout: params.layout,
			titleFont: params.titleFont,
			textFont: params.textFont,
			titleFoil: params.titleFoil,
		};
		store.lastPerson = {
			card: params.card,
			name: params.name,
			dateStr: params.dateStr,
			timeStr: params.timeStr,
			timeKnown: params.timeKnown,
		};
		storeSave();
	};

	async function insertOrUpdate() {
		await ensureFonts();
		const comp = compose( sheet.w, sheet.h );
		const out = renderOutput( comp );
		const stored = { ...params };
		const cardLabel = t( cardByKey( params.card ).label );
		const offset = ( p ) => ( {
			...p,
			x: p.x + sheet.x,
			y: p.y + sheet.y,
		} );
		const a = comp.lay.art;
		rememberLook();

		if ( editing ) {
			if ( 'art' === params.output ) {
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						src: out.art.url,
						naturalW: out.art.size,
						naturalH: out.art.size,
						generator: { id: GEN_ID, params: stored },
					},
				} );
				editor.commit( t( 'Update Mystic Studio' ) );
				return;
			}
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					src: out.art.url,
					naturalW: out.art.size,
					naturalH: out.art.size,
					x: sheet.x + a.x,
					y: sheet.y + a.y,
					w: a.s,
					h: a.s,
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: backdropLayer.id,
				patch: {
					src: out.back.url,
					naturalW: out.back.w,
					naturalH: out.back.h,
				},
			} );
			const plan = planUpdate( managedTexts, comp.props.map( offset ) );
			for ( const { id, patch } of plan.patches ) {
				editor.dispatch( { type: 'UPDATE_LAYER', id, patch } );
			}
			for ( const props of plan.adds ) {
				const l = makeText( props );
				l.mystic = props.mystic;
				l.parent = layer.parent;
				editor.dispatch( { type: 'ADD_LAYER', layer: l } );
			}
			if ( plan.removes.length ) {
				editor.dispatch( { type: 'REMOVE_LAYERS', ids: plan.removes } );
			}
			editor.commit( t( 'Update Mystic Studio' ) );
			return;
		}

		const artLayer = makeImage( {
			name: cardLabel,
			x: sheet.x + a.x,
			y: sheet.y + a.y,
			w: a.s,
			h: a.s,
			src: out.art.url,
			naturalW: out.art.size,
			naturalH: out.art.size,
		} );
		artLayer.generator = { id: GEN_ID, params: stored };
		artLayer.mystic = { role: 'art' };

		if ( 'art' === params.output ) {
			editor.dispatch( { type: 'ADD_LAYER', layer: artLayer } );
			editor.dispatch( { type: 'SET_ACTIVE', id: artLayer.id } );
			editor.commit( t( 'Insert Mystic Studio' ) );
			return;
		}

		const children = [];
		const back = makeImage( {
			name: t( 'Background' ),
			x: sheet.x,
			y: sheet.y,
			w: sheet.w,
			h: sheet.h,
			src: out.back.url,
			naturalW: out.back.w,
			naturalH: out.back.h,
		} );
		back.mystic = { role: 'backdrop' };
		children.push( back, artLayer );
		for ( const props of comp.props ) {
			const l = makeText( offset( props ) );
			l.mystic = props.mystic;
			children.push( l );
		}
		try {
			await bridge.fonts.ensureFontsForLayers(
				children.filter( ( ch ) => 'text' === ch.type )
			);
		} catch ( e ) {
			// Fonts fall back; never block the insert.
		}
		const title =
			( comp.props.find( ( p ) => 'title' === p.mystic.role ) || {} )
				.text || cardLabel;
		const grp = makeGroup( { name: 'Mystic Studio: ' + title } );
		editor.dispatch( { type: 'ADD_LAYER', layer: grp } );
		for ( const child of children ) {
			child.parent = grp.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: grp.id } );
		editor.commit( t( 'Insert Mystic Studio' ) );
	}

	/* ------------------------------- boot -------------------------------- */

	docBtn.style.display = 'art' === params.output && canShowDoc ? '' : 'none';
	rebuildSide();
	fitCanvas();
	if ( window.ResizeObserver ) {
		resizeObs = new window.ResizeObserver( () => {
			fitCanvas();
			schedule();
		} );
		resizeObs.observe( view );
	}
	paint();
	ensureFonts().then( schedule );
	scheduleThumbs();
}

/* -------------------------------- register ------------------------------- */

function register( api ) {
	api.registerGenerator( {
		id: GEN_ID,
		label: 'Mystic Studio',
		run: ( ctx ) => openStudio( ctx ),
		edit: ( ctx ) => openStudio( ctx ),
	} );
}

if ( window.WPIE && window.WPIE.api ) {
	register( window.WPIE.api );
} else {
	window.wp.hooks.addAction( 'wpie.ready', SLUG, register );
}
