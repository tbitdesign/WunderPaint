/**
 * Mystic Studio: computed birth charts, moon phases and zodiac posters
 * as editable layers. Everything is calculated locally (astro.js), the
 * only network touch is the editor's own geo proxy for the one-time
 * place search. Captions, data block and keywords land as editable text
 * layers; the chart art is the generator layer and re-opens via Edit.
 */

import { t, content, INTL_LOCALE } from './i18n.js';
import {
	computeChart,
	signOf,
	formatDegree,
	BODIES,
	geoLongitude,
	moonPhase,
	julianDate,
	crossAspects,
} from './astro.js';
import { resolveLocal } from './tz.js';
import { THEMES, themeByKey } from './themes.js';
import { drawWheel, drawSynastry } from './wheel.js';
import { drawMoonCard } from './mooncard.js';
import { drawZodiacCard } from './zodiaccard.js';
import {
	lifePath,
	cascade,
	nameNumbers,
	coupleNumber,
	meaningIndex,
	ANGEL_NUMBERS,
} from './numerology.js';
import { drawLifePathCard, drawNameCard, drawAngelCard } from './numbercard.js';
import { drawCoupleCard, drawCoupleNumbersCard } from './couplecard.js';
import { chineseSign } from './chinese.js';
import { drawChineseCard } from './chinesecard.js';
import {
	SIGN_ELEMENT,
	SIGN_MODALITY,
	SIGN_RULER,
	SIGN_DATES,
} from './content.js';

const SLUG = 'wpie-mystic-studio';
const GEN_ID = 'wpie-mystic-studio/card';
const OUT = 1600;

// Display names per theme key; grows with THEMES.
const THEME_LABELS = {
	celestial: 'Celestial',
	vintage: 'Vintage',
	foil: 'Gold Foil',
	lineart: 'Line Art',
	rose: 'Rose Gold',
	silver: 'Silver Night',
	emerald: 'Emerald',
	amethyst: 'Amethyst',
};

const DEFAULTS = {
	// birthchart | moonphase | zodiac | lifepath | namechart |
	// angelnumber | couple | couplenumbers
	card: 'birthchart',
	name: '',
	dateStr: '',
	name2: '',
	dateStr2: '',
	timeStr2: '12:00',
	angelNum: '444',
	timeStr: '12:00',
	timeKnown: true,
	place: null, // { name, region }
	lat: null,
	lon: null,
	offsetMode: 'auto', // auto | manual
	offsetMin: 0,
	theme: 'celestial',
	font: 'Playfair Display',
	// Birth chart
	showHouses: true,
	showAspects: true,
	strictOrbs: false,
	showDegrees: true,
	// Moon
	southern: false,
	// Zodiac
	signMode: 'auto', // auto | 0..11 as string
	layout: 'constellation', // constellation | glyph | split
	// Captions
	withCaption: true,
	withData: true,
	withKeywords: true,
	withMeaning: true,
};

const ICONS = {
	cards: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
	person: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
	location:
		'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
	options:
		'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
	look: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="13.5" cy="6.5" r="2.5"/><path d="M12 22a10 10 0 1 1 10-10c0 2-1.5 3-3 3h-3a3 3 0 0 0-2 5.2c.6.5.3 1.8-2 1.8z"/></svg>',
	caption:
		'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>',
	eye: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>',
	birthchart:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M7.5 9.5l7 4M9 15l5-6.5"/></svg>',
	moonphase:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z"/><path d="M12 3a9 9 0 0 1 0 18c3-2 4.5-5 4.5-9S15 5 12 3z" fill="currentColor" fill-opacity=".25"/></svg>',
	zodiac: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18l4-11 4 7 4-9 4 13"/><circle cx="4" cy="18" r="1.4" fill="currentColor"/><circle cx="8" cy="7" r="1.4" fill="currentColor"/><circle cx="12" cy="14" r="1.4" fill="currentColor"/><circle cx="16" cy="5" r="1.4" fill="currentColor"/><circle cx="20" cy="18" r="1.4" fill="currentColor"/></svg>',
	lifepath:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="14" r="7"/><path d="M10.5 12.5l2-1.5v6"/><path d="M6 4h3M11 4h3M16 4h3M7.5 4v3M12.5 4v3M17.5 4v2"/></svg>',
	namechart:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 16l3.5-9L12 16M6.2 13h4.6"/><path d="M15 7h5M15 11h5M15 15h3"/><circle cx="8.5" cy="20" r="1.2" fill="currentColor"/><circle cx="17" cy="20" r="1.2" fill="currentColor"/></svg>',
	angelnumber:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2"/><circle cx="12" cy="12" r="3.4"/></svg>',
	couple: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="9" cy="12" r="5.5"/><circle cx="15" cy="12" r="5.5"/></svg>',
	couplenumbers:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><circle cx="12" cy="16" r="4.5"/><path d="M7.5 8.5l3 4M16.5 8.5l-3 4"/></svg>',
	synastry:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.7"/><circle cx="12" cy="12" r="2.6"/><path d="M9.8 10l4.4 4M14.2 10l-4.4 4"/></svg>',
	chinesezodiac:
		'<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18 4.5 4.5 0 0 1 0-9 4.5 4.5 0 0 0 0-9z" fill="currentColor" fill-opacity=".28" stroke="none"/><circle cx="12" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="16.5" r="1.3"/></svg>',
};

const ICON_BRAND =
	'<svg width="24" height="24" viewBox="0 0 18.83 18.83" aria-hidden="true" focusable="false"><path fill="currentColor" d="M13.84,18.83H3.62c-2,0-3.62-1.62-3.62-3.62V3.52h1.72c.7,0,1.28.57,1.28,1.28v10.43c0,.34.28.62.62.62h8.94c.71,0,1.29.58,1.29,1.29v1.71Z"/><path fill="#3b66ff" d="M18.83,14.02h-1.71c-.71,0-1.29-.58-1.29-1.29V3.62c0-.34-.28-.62-.62-.62H4.82c-.7,0-1.28-.57-1.28-1.28V0h11.67c2,0,3.62,1.62,3.62,3.62v10.4Z"/><circle fill="currentColor" cx="17.33" cy="17.33" r="1.5"/><path fill="#3b66ff" d="M9.51,5.71l.91,2.45c.03.08.09.14.17.17l2.45.91c.07.03.07.13,0,.16l-2.45.91c-.08.03-.14.09-.17.17l-.91,2.45c-.03.07-.13.07-.16,0l-.91-2.45c-.03-.08-.09-.14-.17-.17l-2.45-.91c-.07-.03-.07-.13,0-.16l2.45-.91c.08-.03.14-.09.17-.17l.91-2.45c.03-.07.13-.07.16,0Z"/></svg>';

/** Directory URL of this extension's bundle for the moon texture. */
function assetUrl( file ) {
	try {
		// The host exposes the list at WPIE.extensions (the Solar System
		// Studio pattern); older builds nested it under WPIE.boot.
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

const fmtDate = ( dateStr ) => {
	try {
		const [ y, m, d ] = dateStr.split( '-' ).map( Number );
		return new Intl.DateTimeFormat( INTL_LOCALE, {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		} ).format( new Date( Date.UTC( y, ( m || 1 ) - 1, d || 1, 12 ) ) );
	} catch ( e ) {
		return dateStr;
	}
};

const fmtSpan = ( sign ) => {
	const f = ( [ m, d ] ) => {
		try {
			return new Intl.DateTimeFormat( INTL_LOCALE, {
				day: 'numeric',
				month: 'short',
			} ).format( new Date( Date.UTC( 2001, m - 1, d, 12 ) ) );
		} catch ( e ) {
			return m + '/' + d;
		}
	};
	const [ from, to ] = SIGN_DATES[ sign ];
	return f( from ) + ' - ' + f( to );
};

const fmtOffset = ( min ) => {
	const sign = min < 0 ? '-' : '+';
	const abs = Math.abs( min );
	return (
		'UTC' +
		sign +
		String( Math.floor( abs / 60 ) ).padStart( 2, '0' ) +
		':' +
		String( abs % 60 ).padStart( 2, '0' )
	);
};

/* --------------------------------- studio -------------------------------- */

async function openStudio( { editor, extras, layer } ) {
	const bridge = window.WPIE.bridge;
	const ui = bridge.ui;
	const geo = bridge && bridge.api && bridge.api.geo;
	if ( ! ui || ! geo ) {
		if ( extras && extras.toasts ) {
			extras.toasts.error(
				t( 'Mystic Studio needs WunderPaint 1.144 or newer.' )
			);
		}
		return;
	}

	let store = {};
	try {
		store = ( await bridge.storage.get( SLUG ) ) || {};
	} catch ( e ) {}
	const storeSave = () => {
		try {
			bridge.storage.set( SLUG, store );
		} catch ( e ) {}
	};

	const editing = !! (
		layer &&
		layer.generator &&
		layer.generator.id === GEN_ID
	);
	const params = {
		...DEFAULTS,
		...( editing ? layer.generator.params : {} ),
	};
	if ( ! params.dateStr ) {
		const now = new Date();
		params.dateStr = `${ now.getFullYear() }-${ String(
			now.getMonth() + 1
		).padStart( 2, '0' ) }-${ String( now.getDate() ).padStart( 2, '0' ) }`;
	}
	if ( ! editing && null === params.lat && store.lastPlace ) {
		const last = store.lastPlace;
		if ( 'number' === typeof last.lat ) {
			params.lat = last.lat;
			params.lon = last.lon;
			params.place = last.place || null;
		}
	}

	let mounts = [];
	const unmountAll = () => {
		mounts.forEach( ( m ) => m && m.unmount && m.unmount() );
		mounts = [];
	};

	const modal = ui.dialog( {
		title: 'Mystic Studio',
		subtitle: editing
			? t( 'Adjust the chart, the layer updates in place.' )
			: t(
					'Computed birth charts, moon phases and zodiac art, as editable layers.'
			  ),
		width: 1180,
		onClose: unmountAll,
	} );
	const badge = document.createElement( 'span' );
	badge.className = 'dsm-badge';
	badge.innerHTML = ICON_BRAND;
	modal.head.insertBefore( badge, modal.head.firstChild );
	modal.dialog.classList.add( 'wpiemys-dialog' );

	const body = ui.el( 'div', 'wpiemys-body', modal.body );
	const left = ui.el( 'div', 'wpiemys-left', body );
	const view = ui.el( 'div', 'wpiemys-view', body );
	const canvas = ui.el( 'canvas', null, view );
	canvas.width = 1000;
	canvas.height = 1000;
	const side = ui.el( 'div', 'wpiemys-side', body );

	/* Show document (per studio CI). */
	const docBtn = ui.el( 'button', 'wpiemys-doc', view );
	docBtn.type = 'button';
	docBtn.innerHTML = ICONS.eye + ' ' + t( 'Show document' );
	docBtn.setAttribute( 'aria-pressed', 'false' );
	let showDoc = false;
	// Core signature: renderToCanvas( doc, layers, opts ) RETURNS a canvas
	// (async); the document background goes underneath by hand.
	const syncDocBackdrop = async () => {
		if (
			! showDoc ||
			! bridge.raster ||
			! bridge.raster.renderToCanvas ||
			! editor.state ||
			! editor.state.doc
		) {
			view.classList.remove( 'is-doc' );
			view.style.backgroundImage = '';
			return;
		}
		try {
			const doc = editor.state.doc;
			const full = await bridge.raster.renderToCanvas(
				doc,
				( editor.state.layers || [] ).filter(
					( l ) => ! ( editing && layer && l.id === layer.id )
				),
				{
					scale: Math.min(
						1,
						1400 / Math.max( doc.w || 1, doc.h || 1 )
					),
					cache: bridge.raster.sharedImageCache,
				}
			);
			const c = document.createElement( 'canvas' );
			c.width = Math.max( 2, full.width );
			c.height = Math.max( 2, full.height );
			const cctx = c.getContext( '2d' );
			if (
				'string' === typeof doc.bg &&
				doc.bg &&
				'transparent' !== doc.bg
			) {
				cctx.fillStyle = doc.bg;
				cctx.fillRect( 0, 0, c.width, c.height );
			}
			cctx.drawImage( full, 0, 0 );
			if ( showDoc ) {
				view.classList.add( 'is-doc' );
				view.style.backgroundImage = `url(${ c.toDataURL() })`;
			}
		} catch ( e ) {}
	};
	docBtn.onclick = () => {
		showDoc = ! showDoc;
		docBtn.setAttribute( 'aria-pressed', showDoc ? 'true' : 'false' );
		syncDocBackdrop();
	};
	if (
		! (
			bridge.raster &&
			bridge.raster.renderToCanvas &&
			editor.state &&
			editor.state.doc
		)
	) {
		docBtn.style.display = 'none';
	}

	/* ------------------------------ compute ------------------------------ */

	let moonImg = null;
	const moonSrc = assetUrl( 'textures/moon.jpg' );
	if ( moonSrc ) {
		const img = new Image();
		img.onload = () => {
			moonImg = img;
			paint();
		};
		img.src = moonSrc;
	}

	const resolveMoment = () => {
		const timeStr = params.timeKnown ? params.timeStr : '12:00';
		return resolveLocal( {
			dateStr: params.dateStr,
			timeStr,
			lat: null === params.lat ? NaN : params.lat,
			lon: null === params.lon ? NaN : params.lon,
			overrideMinutes:
				'manual' === params.offsetMode ? params.offsetMin : null,
		} );
	};

	const jdOf = ( utcMs ) => utcMs / 86400000 + 2440587.5;

	const chartData = () => {
		const moment = resolveMoment();
		const jd = jdOf( moment.utcMs );
		const withHouses =
			params.showHouses &&
			params.timeKnown &&
			null !== params.lat &&
			( 'birthchart' === params.card || 'synastry' === params.card );
		const chart = computeChart( {
			jd,
			lat: null === params.lat ? NaN : params.lat,
			lon: null === params.lon ? NaN : params.lon,
			withHouses,
		} );
		if ( params.strictOrbs ) {
			chart.aspects = chart.aspects.filter( ( a ) => a.exact <= 3 );
		}
		return { chart, moment, jd };
	};

	/** Person B's chart for the synastry wheel (same place, own moment). */
	const chartB = () => {
		const momentB = resolveLocal( {
			dateStr: params.dateStr2 || params.dateStr,
			timeStr: params.timeStr2,
			lat: null === params.lat ? NaN : params.lat,
			lon: null === params.lon ? NaN : params.lon,
			overrideMinutes:
				'manual' === params.offsetMode ? params.offsetMin : null,
		} );
		return computeChart( {
			jd: jdOf( momentB.utcMs ),
			lat: NaN,
			lon: NaN,
			withHouses: false,
		} );
	};

	const sunSignOf = ( chart ) =>
		signOf( chart.positions.find( ( p ) => 'sun' === p.body ).lon ).index;

	const zodiacSign = ( chart ) =>
		'auto' === params.signMode
			? sunSignOf( chart )
			: parseInt( params.signMode, 10 ) || 0;

	// Which inputs a card needs.
	const HAS_TIME = [ 'birthchart', 'moonphase', 'synastry' ];
	const NO_DATE = [ 'namechart', 'angelnumber' ];
	const PARTNER = [ 'couple', 'couplenumbers', 'synastry' ];
	const HAS_MEANING = [
		'lifepath',
		'namechart',
		'angelnumber',
		'couplenumbers',
		'chinesezodiac',
	];

	const firstName = ( s ) =>
		String( s || '' )
			.trim()
			.split( /\s+/ )[ 0 ] || '';

	/** Sun sign and moon phase for a plain date (noon UTC is plenty). */
	const personAt = ( dateStr ) => {
		const [ y, m, d ] = String( dateStr || '' )
			.split( '-' )
			.map( ( v ) => parseInt( v, 10 ) );
		const jd = julianDate( y || 2000, m || 1, d || 1, 12, 0 );
		return {
			sign: signOf( geoLongitude( 'sun', jd ) ).index,
			phase: moonPhase( jd ),
		};
	};

	/** "7 + 6 + 1 = 14 · 1 + 4 = 5" for the life path art. */
	const cascadeLine = ( lp ) => {
		const bits = [ lp.parts.join( ' + ' ) + ' = ' + lp.sum ];
		const steps = cascade( lp.sum );
		for ( let i = 0; i < steps.length - 1; i++ ) {
			bits.push(
				String( steps[ i ] ).split( '' ).join( ' + ' ) +
					' = ' +
					steps[ i + 1 ]
			);
		}
		return bits.join( '   ·   ' );
	};

	const angelIdx = () =>
		ANGEL_NUMBERS.indexOf(
			String( params.angelNum || '' ).replace( /\D/g, '' )
		);

	/* ------------------------------- paint -------------------------------- */

	const statusLine = ui.el( 'div', 'dsm-hint wpiemys-status', modal.foot );

	const renderStatus = ( moment, chart ) => {
		const bits = [];
		if ( moment && HAS_TIME.includes( params.card ) ) {
			if ( params.place && params.place.name ) {
				bits.push( params.place.name );
			}
			if ( 'override' === moment.source ) {
				bits.push(
					t( 'Manual offset' ) +
						' ' +
						fmtOffset( moment.offsetMinutes )
				);
			} else if ( 'zone' === moment.source ) {
				bits.push(
					moment.zone + ' ' + fmtOffset( moment.offsetMinutes )
				);
			} else if ( null !== params.lat ) {
				bits.push( t( 'Mean solar time (no zone found)' ) );
			}
			if ( 'birthchart' === params.card ) {
				if ( ! params.timeKnown ) {
					bits.push( t( 'Houses need a birth time.' ) );
				} else if (
					chart &&
					chart.houses &&
					'whole' === chart.houses.system
				) {
					bits.push( t( 'Whole Sign houses (polar latitude)' ) );
				}
			}
		} else if ( 'lifepath' === params.card ) {
			bits.push(
				t( 'Life Path' ) + ' ' + lifePath( params.dateStr ).value
			);
		} else if ( 'namechart' === params.card ) {
			const nn = nameNumbers( params.name );
			if ( nn.destiny ) {
				bits.push(
					t( 'Destiny' ) +
						' ' +
						nn.destiny +
						' · ' +
						t( 'Soul Urge' ) +
						' ' +
						nn.soulUrge +
						' · ' +
						t( 'Personality' ) +
						' ' +
						nn.personality
				);
			}
		} else if ( 'chinesezodiac' === params.card ) {
			const cc = content();
			const cs = chineseSign( params.dateStr );
			bits.push(
				cc.cnElements[ cs.element ] +
					' ' +
					cc.cnAnimals[ cs.animal ] +
					' · ' +
					cs.year
			);
		} else if ( PARTNER.includes( params.card ) ) {
			const cn = coupleNumber(
				params.dateStr,
				params.dateStr2 || params.dateStr
			);
			bits.push( cn.a.value + ' & ' + cn.b.value + ' · ' + cn.value );
		}
		statusLine.textContent = bits.join( ' · ' );
	};

	/** Draw the current card at any size; used by preview and bake. */
	const renderCard = ( ctx, size ) => {
		const theme = themeByKey( params.theme );
		const card = params.card;
		if ( 'chinesezodiac' === card ) {
			drawChineseCard( ctx, size, chineseSign( params.dateStr ), {
				theme,
			} );
			return {};
		}
		if (
			'birthchart' === card ||
			'moonphase' === card ||
			'zodiac' === card ||
			'synastry' === card
		) {
			const { chart, moment } = chartData();
			if ( 'synastry' === card ) {
				const other = chartB();
				drawSynastry( ctx, size, chart, other, {
					theme,
					aspects: params.showAspects
						? crossAspects(
								chart.positions,
								other.positions,
								params.strictOrbs ? 0.5 : 1
						  )
						: [],
					showHouses: !! chart.houses,
					fontFamily: 'Inter',
				} );
			} else if ( 'birthchart' === card ) {
				drawWheel( ctx, size, chart, {
					theme,
					showHouses: !! chart.houses,
					showAspects: params.showAspects,
					showDegrees: params.showDegrees,
					fontFamily: 'Inter',
				} );
			} else if ( 'moonphase' === card ) {
				drawMoonCard( ctx, size, chart.phase, {
					theme,
					southern: params.southern,
					moonImg,
				} );
			} else {
				drawZodiacCard( ctx, size, zodiacSign( chart ), {
					theme,
					layout: params.layout,
				} );
			}
			return { chart, moment };
		}
		if ( 'lifepath' === card ) {
			const lp = lifePath( params.dateStr );
			drawLifePathCard( ctx, size, lp, {
				theme,
				fontFamily: params.font,
				cascadeText: cascadeLine( lp ),
				label: t( 'Life Path' ),
			} );
		} else if ( 'namechart' === card ) {
			const nn = nameNumbers( params.name );
			drawNameCard( ctx, size, nn, {
				theme,
				fontFamily: params.font,
				medallions: [
					{ label: t( 'Destiny' ), value: nn.destiny },
					{ label: t( 'Soul Urge' ), value: nn.soulUrge },
					{ label: t( 'Personality' ), value: nn.personality },
				],
			} );
		} else if ( 'angelnumber' === card ) {
			drawAngelCard( ctx, size, params.angelNum, {
				theme,
				fontFamily: params.font,
			} );
		} else if ( 'couple' === card ) {
			const c = content();
			const a = personAt( params.dateStr );
			const b = personAt( params.dateStr2 || params.dateStr );
			drawCoupleCard(
				ctx,
				size,
				{ a, b },
				{
					theme,
					fontFamily: params.font,
					moonImg,
					southern: params.southern,
					elementsText:
						c.elements[ SIGN_ELEMENT[ a.sign ] ] +
						' · ' +
						c.elements[ SIGN_ELEMENT[ b.sign ] ],
				}
			);
		} else {
			const cn = coupleNumber(
				params.dateStr,
				params.dateStr2 || params.dateStr
			);
			drawCoupleNumbersCard( ctx, size, cn, {
				theme,
				fontFamily: params.font,
				leftText: firstName( params.name ),
				rightText: firstName( params.name2 ),
			} );
		}
		return {};
	};

	function paint() {
		const ctx = canvas.getContext( '2d' );
		ctx.clearRect( 0, 0, canvas.width, canvas.height );
		const { chart, moment } = renderCard( ctx, canvas.width );
		renderStatus( moment || null, chart || null );
	}

	/* ------------------------------ left rail ----------------------------- */

	const CARDS = [
		{
			key: 'birthchart',
			label: t( 'Birth Chart' ),
			icon: ICONS.birthchart,
		},
		{ key: 'moonphase', label: t( 'Moon Phase' ), icon: ICONS.moonphase },
		{ key: 'zodiac', label: t( 'Zodiac Poster' ), icon: ICONS.zodiac },
		{
			key: 'chinesezodiac',
			label: t( 'Chinese Zodiac' ),
			icon: ICONS.chinesezodiac,
		},
		{ key: 'lifepath', label: t( 'Life Path' ), icon: ICONS.lifepath },
		{ key: 'namechart', label: t( 'Name Chart' ), icon: ICONS.namechart },
		{
			key: 'angelnumber',
			label: t( 'Angel Number' ),
			icon: ICONS.angelnumber,
		},
		{ key: 'couple', label: t( 'Couple Chart' ), icon: ICONS.couple },
		{
			key: 'synastry',
			label: t( 'Synastry Chart' ),
			icon: ICONS.synastry,
		},
		{
			key: 'couplenumbers',
			label: t( 'Couple Numbers' ),
			icon: ICONS.couplenumbers,
		},
	];
	const cardsSec = ui.section( left, {
		icon: ICONS.cards,
		title: t( 'Cards' ),
	} );
	const cardBtns = {};
	for ( const c of CARDS ) {
		const b = ui.el( 'button', 'wpiemys-card', cardsSec );
		b.type = 'button';
		b.innerHTML = c.icon + '<span></span>';
		b.querySelector( 'span' ).textContent = c.label;
		b.setAttribute(
			'aria-pressed',
			params.card === c.key ? 'true' : 'false'
		);
		b.onclick = () => {
			params.card = c.key;
			for ( const k in cardBtns ) {
				cardBtns[ k ].setAttribute(
					'aria-pressed',
					k === c.key ? 'true' : 'false'
				);
			}
			rebuildSide();
			paint();
		};
		cardBtns[ c.key ] = b;
	}

	/* ------------------------------ side rail ----------------------------- */

	function rebuildSide() {
		unmountAll();
		side.textContent = '';

		/* Person. */
		if ( 'angelnumber' !== params.card ) {
			const person = ui.section( side, {
				icon: ICONS.person,
				title: t( 'Person' ),
			} );
			const nameIn = ui.el(
				'input',
				'dsm-input',
				ui.row( person, t( 'Name' ) )
			);
			nameIn.type = 'text';
			nameIn.value = params.name || '';
			nameIn.oninput = () => {
				params.name = nameIn.value;
				if (
					'namechart' === params.card ||
					'couplenumbers' === params.card
				) {
					paint();
				}
			};
			if ( ! NO_DATE.includes( params.card ) ) {
				const dateIn = ui.el(
					'input',
					'dsm-input',
					ui.row( person, t( 'Date' ) )
				);
				dateIn.type = 'date';
				dateIn.value = params.dateStr;
				dateIn.onchange = () => {
					if ( dateIn.value ) {
						params.dateStr = dateIn.value;
					}
					paint();
				};
			}
			if ( HAS_TIME.includes( params.card ) ) {
				const timeIn = ui.el(
					'input',
					'dsm-input',
					ui.row( person, t( 'Time' ) )
				);
				timeIn.type = 'time';
				timeIn.value = params.timeStr;
				timeIn.disabled = ! params.timeKnown;
				timeIn.onchange = () => {
					if ( timeIn.value ) {
						params.timeStr = timeIn.value;
					}
					paint();
				};
				ui.check( person, {
					label: t( 'Time unknown' ),
					checked: ! params.timeKnown,
					onChange: ( on ) => {
						params.timeKnown = ! on;
						timeIn.disabled = on;
						paint();
					},
				} );
			}
			if ( 'zodiac' === params.card ) {
				const c = content();
				ui.select( ui.row( person, t( 'Sign' ) ), {
					options: [
						{ value: 'auto', label: t( 'From the birthday' ) },
						...c.signs.map( ( s, i ) => ( {
							value: String( i ),
							label: s,
						} ) ),
					],
					value: params.signMode,
					onChange: ( v ) => {
						params.signMode = v;
						paint();
					},
				} );
			}
		}

		/* Partner (couple cards). */
		if ( PARTNER.includes( params.card ) ) {
			const partner = ui.section( side, {
				icon: ICONS.person,
				title: t( 'Partner' ),
			} );
			const name2In = ui.el(
				'input',
				'dsm-input',
				ui.row( partner, t( 'Name' ) )
			);
			name2In.type = 'text';
			name2In.value = params.name2 || '';
			name2In.oninput = () => {
				params.name2 = name2In.value;
				if ( 'couplenumbers' === params.card ) {
					paint();
				}
			};
			const date2In = ui.el(
				'input',
				'dsm-input',
				ui.row( partner, t( 'Date' ) )
			);
			date2In.type = 'date';
			date2In.value = params.dateStr2;
			date2In.onchange = () => {
				if ( date2In.value ) {
					params.dateStr2 = date2In.value;
				}
				paint();
			};
			if ( 'synastry' === params.card ) {
				const time2In = ui.el(
					'input',
					'dsm-input',
					ui.row( partner, t( 'Time' ) )
				);
				time2In.type = 'time';
				time2In.value = params.timeStr2;
				time2In.onchange = () => {
					if ( time2In.value ) {
						params.timeStr2 = time2In.value;
					}
					paint();
				};
			}
		}

		/* Location (drives houses and the time zone). */
		if ( HAS_TIME.includes( params.card ) ) {
			const loc = ui.section( side, {
				icon: ICONS.location,
				title: t( 'Location' ),
			} );
			const searchWrap = ui.el( 'div', 'wpiemys-search', loc );
			const searchIn = ui.el( 'input', 'dsm-input', searchWrap );
			searchIn.type = 'text';
			searchIn.placeholder = t( 'Search for a city' );
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
							'wpiemys-hit is-empty',
							hits,
							t( 'No results.' )
						);
						return;
					}
					for ( const r of results ) {
						const item = ui.el( 'button', 'wpiemys-hit', hits );
						item.type = 'button';
						item.textContent =
							r.name + ( r.region ? ', ' + r.region : '' );
						item.onclick = () => {
							params.lat = r.lat;
							params.lon = r.lon;
							params.place = {
								name: r.name,
								region: r.region || '',
							};
							searchIn.value = r.name;
							hits.textContent = '';
							store.lastPlace = {
								lat: r.lat,
								lon: r.lon,
								place: params.place,
							};
							storeSave();
							paint();
						};
					}
				} catch ( e ) {
					if ( seq === searchSeq ) {
						hits.textContent = '';
					}
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

			const offRow = ui.row( loc, t( 'UTC offset (advanced)' ) );
			const offSel = ui.select( offRow, {
				options: [
					{ value: 'auto', label: t( 'Auto' ) },
					{ value: 'manual', label: t( 'Manual offset' ) },
				],
				value: params.offsetMode,
				onChange: ( v ) => {
					params.offsetMode = v;
					offIn.style.display = 'manual' === v ? '' : 'none';
					paint();
				},
			} );
			offSel.classList.add( 'wpiemys-offsel' );
			const offIn = ui.el( 'input', 'dsm-input wpiemys-offin', offRow );
			offIn.type = 'text';
			offIn.placeholder = '+02:00';
			offIn.style.display = 'manual' === params.offsetMode ? '' : 'none';
			const offToStr = ( min ) =>
				( min < 0 ? '-' : '+' ) +
				String( Math.floor( Math.abs( min ) / 60 ) ).padStart(
					2,
					'0'
				) +
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
				paint();
			};
		}

		/* Options per card. */
		const OPT_CARDS = [
			'birthchart',
			'synastry',
			'moonphase',
			'zodiac',
			'couple',
			'angelnumber',
		];
		const opt = OPT_CARDS.includes( params.card )
			? ui.section( side, {
					icon: ICONS.options,
					title: t( 'Options' ),
			  } )
			: null;
		if ( 'angelnumber' === params.card ) {
			const numIn = ui.el(
				'input',
				'dsm-input',
				ui.row( opt, t( 'Number' ) )
			);
			numIn.type = 'text';
			numIn.value = params.angelNum || '';
			numIn.oninput = () => {
				params.angelNum = numIn.value;
				paint();
			};
		} else if ( 'couple' === params.card ) {
			ui.check( opt, {
				label: t( 'Southern sky' ),
				checked: params.southern,
				onChange: ( on ) => {
					params.southern = on;
					paint();
				},
			} );
		} else if (
			'birthchart' === params.card ||
			'synastry' === params.card
		) {
			ui.check( opt, {
				label: t( 'Show houses' ),
				checked: params.showHouses,
				onChange: ( on ) => {
					params.showHouses = on;
					paint();
				},
			} );
			ui.check( opt, {
				label: t( 'Show aspects' ),
				checked: params.showAspects,
				onChange: ( on ) => {
					params.showAspects = on;
					paint();
				},
			} );
			ui.check( opt, {
				label: t( 'Strict orbs' ),
				checked: params.strictOrbs,
				onChange: ( on ) => {
					params.strictOrbs = on;
					paint();
				},
			} );
			if ( 'birthchart' === params.card ) {
				ui.check( opt, {
					label: t( 'Show degrees' ),
					checked: params.showDegrees,
					onChange: ( on ) => {
						params.showDegrees = on;
						paint();
					},
				} );
			}
		} else if ( 'moonphase' === params.card ) {
			ui.check( opt, {
				label: t( 'Southern sky' ),
				checked: params.southern,
				onChange: ( on ) => {
					params.southern = on;
					paint();
				},
			} );
		} else if ( 'zodiac' === params.card ) {
			ui.select( ui.row( opt, t( 'Layout' ) ), {
				options: [
					{ value: 'constellation', label: t( 'Constellation' ) },
					{ value: 'glyph', label: t( 'Glyph' ) },
					{ value: 'split', label: t( 'Split' ) },
				],
				value: params.layout,
				onChange: ( v ) => {
					params.layout = v;
					paint();
				},
			} );
		}

		/* Look. */
		const look = ui.section( side, {
			icon: ICONS.look,
			title: t( 'Look' ),
		} );
		ui.select( ui.row( look, t( 'Theme' ) ), {
			options: THEMES.map( ( th ) => ( {
				value: th.key,
				label: t( THEME_LABELS[ th.key ] || th.key ),
			} ) ),
			value: params.theme,
			onChange: ( v ) => {
				params.theme = v;
				paint();
			},
		} );

		/* Caption layers. */
		const cap = ui.section( side, {
			icon: ICONS.caption,
			title: t( 'Caption' ),
		} );
		ui.check( cap, {
			label: t( 'Include caption' ),
			checked: params.withCaption,
			onChange: ( on ) => {
				params.withCaption = on;
			},
		} );
		if ( 'birthchart' === params.card ) {
			ui.check( cap, {
				label: t( 'Include data block' ),
				checked: params.withData,
				onChange: ( on ) => {
					params.withData = on;
				},
			} );
		}
		if ( 'angelnumber' !== params.card ) {
			ui.check( cap, {
				label: t( 'Include keywords' ),
				checked: params.withKeywords,
				onChange: ( on ) => {
					params.withKeywords = on;
				},
			} );
		}
		if ( HAS_MEANING.includes( params.card ) ) {
			ui.check( cap, {
				label: t( 'Include meaning' ),
				checked: params.withMeaning,
				onChange: ( on ) => {
					params.withMeaning = on;
				},
			} );
		}
		const fontRow = ui.row( cap, t( 'Title font' ) );
		if ( bridge.components && bridge.components.mountFontPicker ) {
			const holder = ui.el( 'div', 'wpiemys-font', fontRow );
			mounts.push(
				bridge.components.mountFontPicker( holder, {
					value: params.font,
					onChange: ( fam ) => {
						params.font = fam;
						if ( bridge.fonts && bridge.fonts.ensureFont ) {
							bridge.fonts
								.ensureFont( fam )
								.then( paint )
								.catch( () => {} );
						}
						paint();
					},
				} )
			);
		}
	}

	/* ------------------------------- footer ------------------------------- */

	const actions = ui.el( 'div', 'dsm-actions', modal.foot );
	ui.btn( actions, {
		label: t( 'Cancel' ),
		onClick: () => {
			unmountAll();
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
				unmountAll();
				modal.close();
			} catch ( e ) {
				statusLine.textContent =
					( e && e.message ) || t( 'Could not insert the layers.' );
				apply.disabled = false;
			}
		},
	} );

	/* ------------------------------- insert ------------------------------- */

	const bakeArt = () => {
		const bake = document.createElement( 'canvas' );
		bake.width = OUT;
		bake.height = OUT;
		const info = renderCard( bake.getContext( '2d' ), OUT );
		return {
			url: bake.toDataURL( 'image/png' ),
			chart: info.chart || null,
		};
	};

	/** The caption lines per card, ready for text layers. */
	const captionTexts = ( chart ) => {
		const c = content();
		const out = {
			title: '',
			detail: [],
			keywords: '',
			data: '',
			meaning: '',
		};
		const dateLine = () => {
			const bits = [ fmtDate( params.dateStr ) ];
			if ( params.timeKnown && 'zodiac' !== params.card ) {
				bits.push( params.timeStr );
			}
			if (
				params.place &&
				params.place.name &&
				'zodiac' !== params.card
			) {
				bits.push( params.place.name );
			}
			return bits.join( ' · ' );
		};
		if ( 'birthchart' === params.card ) {
			const sun = sunSignOf( chart );
			out.title = params.name || c.signs[ sun ];
			out.detail.push( dateLine() );
			const moonSign = signOf(
				chart.positions.find( ( p ) => 'moon' === p.body ).lon
			).index;
			const big = [
				c.planets[ 0 ] + ' ' + c.signs[ sun ],
				c.planets[ 1 ] + ' ' + c.signs[ moonSign ],
			];
			if ( chart.houses ) {
				big.push(
					t( 'Ascendant' ) +
						' ' +
						c.signs[ signOf( chart.houses.asc ).index ]
				);
			}
			out.keywords = big.join( '  ·  ' );
			out.data = chart.positions
				.map( ( p, i ) => {
					const f = formatDegree( p.lon );
					return (
						c.planets[ i ] +
						'  ' +
						f.text +
						' ' +
						c.signs[ f.sign ] +
						( p.retro ? '  R' : '' )
					);
				} )
				.join( '\n' );
		} else if ( 'moonphase' === params.card ) {
			const ph = chart.phase;
			const moonSign = signOf(
				chart.positions.find( ( p ) => 'moon' === p.body ).lon
			).index;
			out.title = params.name || c.phases[ ph.index ];
			out.detail.push( dateLine() );
			out.keywords = [
				c.phases[ ph.index ],
				Math.round( ph.illum * 100 ) + '% ' + t( 'illuminated' ),
				t( 'Moon in' ) + ' ' + c.signs[ moonSign ],
			].join( '  ·  ' );
		} else if ( 'zodiac' === params.card ) {
			const s = zodiacSign( chart );
			out.title = params.name || c.signs[ s ];
			out.detail.push( c.signs[ s ] + '  ·  ' + fmtSpan( s ) );
			out.detail.push(
				c.elements[ SIGN_ELEMENT[ s ] ] +
					'  ·  ' +
					c.modalities[ SIGN_MODALITY[ s ] ] +
					'  ·  ' +
					c.planets[ BODIES.indexOf( SIGN_RULER[ s ] ) ]
			);
			out.keywords = c.keywords[ s ].join( '  ·  ' ).toUpperCase();
		} else if ( 'lifepath' === params.card ) {
			const lp = lifePath( params.dateStr );
			out.title = params.name || t( 'Life Path' );
			out.detail.push( fmtDate( params.dateStr ) );
			out.keywords = (
				t( 'Life Path' ) +
				'  ·  ' +
				lp.value
			).toUpperCase();
			out.meaning = c.numbers[ meaningIndex( lp.value ) ] || '';
		} else if ( 'namechart' === params.card ) {
			const nn = nameNumbers( params.name );
			out.title = params.name || t( 'Name Chart' );
			if ( nn.destiny ) {
				out.keywords =
					t( 'Destiny' ) +
					' ' +
					nn.destiny +
					'  ·  ' +
					t( 'Soul Urge' ) +
					' ' +
					nn.soulUrge +
					'  ·  ' +
					t( 'Personality' ) +
					' ' +
					nn.personality;
				out.meaning = c.numbers[ meaningIndex( nn.destiny ) ] || '';
			}
		} else if ( 'angelnumber' === params.card ) {
			out.title = String( params.angelNum || '' ).trim();
			out.meaning = angelIdx() >= 0 ? c.angels[ angelIdx() ] : '';
		} else if ( 'couple' === params.card ) {
			const a = personAt( params.dateStr );
			const b = personAt( params.dateStr2 || params.dateStr );
			out.title =
				[ firstName( params.name ), firstName( params.name2 ) ]
					.filter( Boolean )
					.join( ' & ' ) ||
				c.signs[ a.sign ] + ' & ' + c.signs[ b.sign ];
			out.detail.push(
				fmtDate( params.dateStr ) +
					'  ·  ' +
					fmtDate( params.dateStr2 || params.dateStr )
			);
			out.keywords = (
				c.signs[ a.sign ] +
				' & ' +
				c.signs[ b.sign ]
			).toUpperCase();
		} else if ( 'couplenumbers' === params.card ) {
			const cn = coupleNumber(
				params.dateStr,
				params.dateStr2 || params.dateStr
			);
			out.title =
				[ firstName( params.name ), firstName( params.name2 ) ]
					.filter( Boolean )
					.join( ' & ' ) || t( 'Couple Numbers' );
			out.detail.push(
				fmtDate( params.dateStr ) +
					'  ·  ' +
					fmtDate( params.dateStr2 || params.dateStr )
			);
			out.keywords = cn.a.value + ' & ' + cn.b.value + '  ·  ' + cn.value;
			out.meaning = c.numbers[ meaningIndex( cn.value ) ] || '';
		} else if ( 'synastry' === params.card ) {
			const other = chartB();
			const sunA = sunSignOf( chart );
			const sunB = sunSignOf( other );
			out.title =
				[ firstName( params.name ), firstName( params.name2 ) ]
					.filter( Boolean )
					.join( ' & ' ) || c.signs[ sunA ] + ' & ' + c.signs[ sunB ];
			out.detail.push(
				fmtDate( params.dateStr ) +
					'  ·  ' +
					fmtDate( params.dateStr2 || params.dateStr )
			);
			if ( params.place && params.place.name ) {
				out.detail.push( params.place.name );
			}
			out.keywords = (
				c.signs[ sunA ] +
				' & ' +
				c.signs[ sunB ]
			).toUpperCase();
		} else if ( 'chinesezodiac' === params.card ) {
			const cs = chineseSign( params.dateStr );
			out.title = params.name || c.cnAnimals[ cs.animal ];
			out.detail.push(
				c.cnElements[ cs.element ] +
					' ' +
					c.cnAnimals[ cs.animal ] +
					'  ·  ' +
					cs.year +
					'  ·  ' +
					( cs.yang ? 'Yang' : 'Yin' )
			);
			out.detail.push( fmtDate( params.dateStr ) );
			out.keywords = (
				c.cnAnimals[ cs.animal ] +
				'  ·  ' +
				c.cnElements[ cs.element ]
			).toUpperCase();
			out.meaning = c.cnMeanings[ cs.animal ] || '';
		}
		return out;
	};

	async function insertOrUpdate() {
		const { url, chart } = bakeArt();
		const stored = { ...params };

		if ( editing ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					src: url,
					naturalW: OUT,
					naturalH: OUT,
					generator: { id: GEN_ID, params: stored },
				},
			} );
			editor.commit( t( 'Update Mystic Studio' ) );
			return;
		}

		const { makeImage, makeText, makeShape, makeGroup } = bridge.documents;
		const doc = editor.state.doc;
		const theme = themeByKey( params.theme );
		const texts = captionTexts( chart );
		const cardLabel = CARDS.find( ( x ) => x.key === params.card ).label;

		const children = [];
		const wantCaption = params.withCaption;
		const margin = doc.h * 0.05;
		const art = Math.min(
			doc.w * 0.86,
			doc.h * ( wantCaption ? 0.58 : 0.86 )
		);
		const artX = ( doc.w - art ) / 2;
		const artY = wantCaption ? margin : ( doc.h - art ) / 2;

		children.push(
			makeShape( {
				name: cardLabel,
				x: 0,
				y: 0,
				w: doc.w,
				h: doc.h,
				shape: 'rect',
				fill: theme.bg[ 0 ],
			} )
		);
		const artLayer = makeImage( {
			name: cardLabel,
			x: artX,
			y: artY,
			w: art,
			h: art,
			src: url,
			naturalW: OUT,
			naturalH: OUT,
		} );
		artLayer.generator = { id: GEN_ID, params: stored };
		children.push( artLayer );

		if ( wantCaption ) {
			let y = artY + art + doc.h * 0.03;
			const addText = ( name, text, size, opts = {} ) => {
				children.push(
					makeText( {
						name,
						text,
						x: doc.w * 0.07,
						y,
						w: doc.w * 0.86,
						h: size * 1.5 * text.split( '\n' ).length,
						fontSize: size,
						fontFamily: opts.font || 'Inter',
						weight: opts.weight || 400,
						color: opts.color || theme.ink,
						align: 'center',
						letterSpacing: opts.ls || 0,
						fixedWidth: true,
					} )
				);
				y += size * 1.5 * text.split( '\n' ).length + doc.h * 0.012;
			};
			if ( texts.title ) {
				addText( t( 'Title' ), texts.title, doc.h * 0.045, {
					font: params.font,
					weight: 600,
					ls: 1,
				} );
			}
			for ( const line of texts.detail ) {
				addText( t( 'Caption' ), line, doc.h * 0.02, {
					color: theme.dim,
				} );
			}
			if ( params.withKeywords && texts.keywords ) {
				addText( t( 'Keywords' ), texts.keywords, doc.h * 0.018, {
					color: theme.accent,
					ls: 2,
				} );
			}
			if ( params.withMeaning && texts.meaning ) {
				addText( t( 'Caption' ), texts.meaning, doc.h * 0.018, {
					color: theme.dim,
				} );
			}
			if (
				params.withData &&
				texts.data &&
				'birthchart' === params.card
			) {
				addText( t( 'Data block' ), texts.data, doc.h * 0.015, {
					color: theme.dim,
				} );
			}
		}

		try {
			await bridge.fonts.ensureFontsForLayers(
				children.filter( ( ch ) => 'text' === ch.type )
			);
		} catch ( e ) {
			// Fonts fall back; never block the insert.
		}

		const group = makeGroup( {
			name: 'Mystic Studio: ' + ( texts.title || cardLabel ),
		} );
		editor.dispatch( { type: 'ADD_LAYER', layer: group } );
		for ( const child of children ) {
			child.parent = group.id;
			editor.dispatch( { type: 'ADD_LAYER', layer: child } );
		}
		editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
		editor.commit( t( 'Insert Mystic Studio' ) );
	}

	/* -------------------------------- boot -------------------------------- */

	rebuildSide();

	if ( bridge.fonts && bridge.fonts.ensureFont && params.font ) {
		bridge.fonts
			.ensureFont( params.font )
			.then( () => paint() )
			.catch( () => {} );
	}
	paint();
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
