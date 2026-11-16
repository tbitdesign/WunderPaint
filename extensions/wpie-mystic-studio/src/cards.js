/**
 * The card registry: which inputs a card needs, how its art is drawn and
 * which texts its poster carries. The studio (main.js) only builds the
 * interface around this; the art is always drawn transparent - backdrop,
 * frame and captions belong to the poster.
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
import { drawWheel, drawSynastry } from './wheel.js';
import { drawMoonCard } from './mooncard.js';
import { drawZodiacCard } from './zodiaccard.js';
import {
	lifePath,
	cascade,
	nameNumbers,
	coupleNumber,
	meaningIndex,
	personalYear,
	ANGEL_NUMBERS,
} from './numerology.js';
import {
	drawLifePathCard,
	drawNameCard,
	drawAngelCard,
	drawPersonalYearCard,
} from './numbercard.js';
import { drawCoupleCard, drawCoupleNumbersCard } from './couplecard.js';
import { chineseSign } from './chinese.js';
import { drawChineseCard } from './chinesecard.js';
import {
	drawBigThreeCard,
	drawElementsCard,
	drawProfileCard,
} from './readingcards.js';
import { bigThree, elementBalance, percentages } from './analysis.js';
import {
	SIGN_ELEMENT,
	SIGN_MODALITY,
	SIGN_RULER,
	SIGN_DATES,
} from './content.js';

/** Card groups, in the order of the filter chips. */
export const GROUPS = [ 'all', 'astro', 'moon', 'numbers', 'couples' ];

/**
 * Every card: key, group, label msgid and the inputs it reads.
 * date / time / place = person A; partner, partnerTime = person B.
 */
export const CARDS = [
	{
		key: 'birthchart',
		group: 'astro',
		label: 'Birth Chart',
		time: true,
		date: true,
		place: true,
	},
	{
		key: 'bigthree',
		group: 'astro',
		label: 'Big Three',
		time: true,
		date: true,
		place: true,
	},
	{
		key: 'elements',
		group: 'astro',
		label: 'Element Balance',
		time: true,
		date: true,
		place: true,
	},
	{
		key: 'profile',
		group: 'astro',
		label: 'Cosmic Profile',
		time: true,
		date: true,
		place: true,
	},
	{ key: 'zodiac', group: 'astro', label: 'Zodiac Poster', date: true },
	{
		key: 'chinesezodiac',
		group: 'astro',
		label: 'Chinese Zodiac',
		date: true,
	},
	{
		key: 'moonphase',
		group: 'moon',
		label: 'Moon Phase',
		time: true,
		date: true,
		place: true,
	},
	{ key: 'lifepath', group: 'numbers', label: 'Life Path', date: true },
	{
		key: 'personalyear',
		group: 'numbers',
		label: 'Personal Year',
		date: true,
	},
	{ key: 'namechart', group: 'numbers', label: 'Name Chart' },
	{
		key: 'angelnumber',
		group: 'numbers',
		label: 'Angel Number',
		noPerson: true,
	},
	{
		key: 'couple',
		group: 'couples',
		label: 'Couple Chart',
		date: true,
		partner: true,
	},
	{
		key: 'synastry',
		group: 'couples',
		label: 'Synastry Chart',
		time: true,
		date: true,
		place: true,
		partner: true,
		partnerTime: true,
	},
	{
		key: 'couplenumbers',
		group: 'couples',
		label: 'Couple Numbers',
		date: true,
		partner: true,
	},
];

export const cardByKey = ( key ) =>
	CARDS.find( ( c ) => c.key === key ) || CARDS[ 0 ];

/* -------------------------------- formats -------------------------------- */

export const fmtDate = ( dateStr ) => {
	try {
		const [ y, m, d ] = String( dateStr ).split( '-' ).map( Number );
		return new Intl.DateTimeFormat( INTL_LOCALE, {
			day: 'numeric',
			month: 'long',
			year: 'numeric',
		} ).format( new Date( Date.UTC( y, ( m || 1 ) - 1, d || 1, 12 ) ) );
	} catch ( e ) {
		return String( dateStr );
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
	return f( from ) + ' – ' + f( to );
};

export const fmtOffset = ( min ) => {
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

const firstName = ( s ) =>
	String( s || '' )
		.trim()
		.split( /\s+/ )[ 0 ] || '';

const SEP = '  ·  ';

/* ---------------------------------- data --------------------------------- */

/**
 * Everything the cards compute from the parameters, lazily: a chart is
 * only calculated when a card asks for it, then cached for this render.
 *
 * @param {Object} params Studio parameters.
 * @return {Object} Data accessors.
 */
export function cardData( params ) {
	const cache = {};
	const once = ( key, fn ) => {
		if ( ! ( key in cache ) ) {
			cache[ key ] = fn();
		}
		return cache[ key ];
	};
	const lat =
		null === params.lat || undefined === params.lat ? NaN : params.lat;
	const lon =
		null === params.lon || undefined === params.lon ? NaN : params.lon;
	const override = 'manual' === params.offsetMode ? params.offsetMin : null;
	const jdOf = ( utcMs ) => utcMs / 86400000 + 2440587.5;

	const data = {
		params,
		moment: () =>
			once( 'moment', () =>
				resolveLocal( {
					dateStr: params.dateStr,
					timeStr: params.timeKnown ? params.timeStr : '12:00',
					lat,
					lon,
					overrideMinutes: override,
				} )
			),
		chart: () =>
			once( 'chart', () => {
				const moment = data.moment();
				const withHouses =
					params.showHouses !== false &&
					params.timeKnown &&
					Number.isFinite( lat );
				const chart = computeChart( {
					jd: jdOf( moment.utcMs ),
					lat,
					lon,
					withHouses,
				} );
				if ( params.strictOrbs ) {
					chart.aspects = chart.aspects.filter(
						( a ) => a.exact <= 3
					);
				}
				return chart;
			} ),
		/** Person B: same place, own date and time. */
		chartB: () =>
			once( 'chartB', () => {
				const m = resolveLocal( {
					dateStr: params.dateStr2 || params.dateStr,
					timeStr: params.timeStr2 || '12:00',
					lat,
					lon,
					overrideMinutes: override,
				} );
				return computeChart( {
					jd: jdOf( m.utcMs ),
					lat: NaN,
					lon: NaN,
					withHouses: false,
				} );
			} ),
		/** Sun sign and moon phase for a plain date (noon UTC is plenty). */
		personAt: ( dateStr ) => {
			const [ y, m, d ] = String( dateStr || '' )
				.split( '-' )
				.map( ( v ) => parseInt( v, 10 ) );
			const jd = julianDate( y || 2000, m || 1, d || 1, 12, 0 );
			return {
				sign: signOf( geoLongitude( 'sun', jd ) ).index,
				phase: moonPhase( jd ),
			};
		},
		bigThree: () => once( 'b3', () => bigThree( data.chart() ) ),
		balance: () =>
			once( 'bal', () => {
				const bal = elementBalance( data.chart() );
				return { ...bal, pct: percentages( bal.elements ) };
			} ),
		lifePath: () => once( 'lp', () => lifePath( params.dateStr ) ),
		year: () =>
			once( 'py', () =>
				personalYear(
					params.dateStr,
					params.year || new Date().getFullYear()
				)
			),
		chinese: () => once( 'cn', () => chineseSign( params.dateStr ) ),
		/** Seven nights round the date, the date itself in the middle. */
		week: () =>
			once( 'week', () => {
				const base = data.moment().utcMs;
				const out = [];
				for ( let k = -3; k <= 3; k++ ) {
					const ms = base + k * 86400000;
					out.push( {
						phase: moonPhase( jdOf( ms ) ),
						day: new Date(
							ms + ( data.moment().offsetMinutes || 0 ) * 60000
						).getUTCDate(),
					} );
				}
				return out;
			} ),
	};
	return data;
}

/** Which sign the zodiac poster shows. */
export function zodiacSignOf( data ) {
	const mode = data.params.signMode || 'sun';
	if ( 'moon' === mode ) {
		return data.bigThree().moon;
	}
	if ( 'rising' === mode ) {
		const r = data.bigThree().rising;
		return null === r ? data.bigThree().sun : r;
	}
	if ( /^\d+$/.test( String( mode ) ) ) {
		return Math.max( 0, Math.min( 11, parseInt( mode, 10 ) ) );
	}
	return data.bigThree().sun;
}

/* ---------------------------------- art ---------------------------------- */

/**
 * Draw a card's art, transparent, into a square.
 *
 * @param {CanvasRenderingContext2D} ctx  Context.
 * @param {number} size  Square size.
 * @param {string} key   Card key.
 * @param {Object} data  From cardData().
 * @param {Object} look  { theme, moonImg, titleFont }.
 */
export function drawArt( ctx, size, key, data, look ) {
	const p = data.params;
	const c = content();
	const { theme, moonImg = null } = look;
	const font = look.titleFont || 'Playfair Display';
	const base = { theme, transparent: true };
	switch ( key ) {
		case 'birthchart':
			drawWheel( ctx, size, data.chart(), {
				...base,
				showHouses: !! data.chart().houses,
				showAspects: p.showAspects !== false,
				showDegrees: p.showDegrees !== false,
				style: p.wheelStyle || 'classic',
				fontFamily: 'Inter',
			} );
			break;
		case 'synastry': {
			const a = data.chart();
			const b = data.chartB();
			drawSynastry( ctx, size, a, b, {
				...base,
				aspects:
					p.showAspects !== false
						? crossAspects(
								a.positions,
								b.positions,
								p.strictOrbs ? 0.5 : 1
						  )
						: [],
				showHouses: !! a.houses,
				fontFamily: 'Inter',
			} );
			break;
		}
		case 'bigthree':
			drawBigThreeCard( ctx, size, data.bigThree(), {
				theme,
				signNames: c.signs,
				roles: {
					sun: t( 'Sun' ),
					moon: t( 'Moon' ),
					rising: t( 'Rising' ),
				},
				fontFamily: 'Inter',
			} );
			break;
		case 'elements':
			drawElementsCard( ctx, size, data.balance(), {
				theme,
				elementNames: c.elements,
				modalityNames: c.modalities,
				fontFamily: 'Inter',
			} );
			break;
		case 'profile': {
			const b3 = data.bigThree();
			const cs = data.chinese();
			const bal = data.balance();
			drawProfileCard(
				ctx,
				size,
				{
					b3,
					phase: data.chart().phase,
					lifePath: data.lifePath().value,
					animal: cs.animal,
					element: bal.dominant,
				},
				{
					theme,
					moonImg,
					southern: !! p.southern,
					fontFamily: 'Inter',
					labels: {
						sun: t( 'Sun' ),
						moon: t( 'Moon' ),
						rising: t( 'Rising' ),
						lifePath: t( 'Life Path' ),
						animal: c.cnAnimals[ cs.animal ],
						element: c.elements[ bal.dominant ],
					},
				}
			);
			break;
		}
		case 'moonphase':
			drawMoonCard( ctx, size, data.chart().phase, {
				...base,
				southern: !! p.southern,
				moonImg,
				layout: p.moonLayout || 'single',
				week: 'week' === p.moonLayout ? data.week() : null,
				fontFamily: font,
			} );
			break;
		case 'zodiac':
			drawZodiacCard( ctx, size, zodiacSignOf( data ), {
				...base,
				layout: p.zodiacLayout || 'constellation',
			} );
			break;
		case 'chinesezodiac':
			drawChineseCard( ctx, size, data.chinese(), base );
			break;
		case 'lifepath':
			drawLifePathCard( ctx, size, data.lifePath(), {
				...base,
				fontFamily: font,
			} );
			break;
		case 'personalyear':
			drawPersonalYearCard( ctx, size, data.year(), {
				...base,
				fontFamily: font,
			} );
			break;
		case 'namechart': {
			const nn = nameNumbers( p.name );
			drawNameCard( ctx, size, nn, {
				...base,
				fontFamily: font,
				medallions: [
					{ label: t( 'Destiny' ), value: nn.destiny },
					{ label: t( 'Soul Urge' ), value: nn.soulUrge },
					{ label: t( 'Personality' ), value: nn.personality },
				],
			} );
			break;
		}
		case 'angelnumber':
			drawAngelCard( ctx, size, p.angelNum, {
				...base,
				fontFamily: font,
			} );
			break;
		case 'couple':
			drawCoupleCard(
				ctx,
				size,
				{
					a: data.personAt( p.dateStr ),
					b: data.personAt( p.dateStr2 || p.dateStr ),
				},
				{ ...base, fontFamily: font, moonImg, southern: !! p.southern }
			);
			break;
		case 'couplenumbers':
			drawCoupleNumbersCard(
				ctx,
				size,
				coupleNumber( p.dateStr, p.dateStr2 || p.dateStr ),
				{ ...base, fontFamily: font }
			);
			break;
	}
}

/* --------------------------------- texts --------------------------------- */

/** "7 + 6 + 1 = 14 · 1 + 4 = 5" for the life path caption. */
export function cascadeLine( lp ) {
	const bits = [ lp.parts.join( ' + ' ) + ' = ' + lp.sum ];
	const steps = cascade( lp.sum );
	for ( let i = 0; i < steps.length - 1; i++ ) {
		bits.push(
			String( steps[ i ] ).split( '' ).join( ' + ' ) +
				' = ' +
				steps[ i + 1 ]
		);
	}
	return bits.join( SEP );
}

/** Two positions per line: "Sun 24°08′ Gemini    Moon 12°33′ Pisces". */
function dataBlock( chart ) {
	const c = content();
	const cells = chart.positions.map( ( p, i ) => {
		const f = formatDegree( p.lon );
		return (
			c.planets[ i ] +
			' ' +
			f.text +
			' ' +
			c.signs[ f.sign ] +
			( p.retro ? ' R' : '' )
		);
	} );
	const lines = [];
	for ( let i = 0; i < cells.length; i += 2 ) {
		lines.push( cells.slice( i, i + 2 ).join( '     ' ) );
	}
	return lines.join( '\n' );
}

/**
 * The texts of a card's poster. Empty strings are left out by the layout.
 *
 * @param {string} key  Card key.
 * @param {Object} data From cardData().
 * @return {{ title, subtitle, keywords, meaning, data }} Strings.
 */
export function cardTexts( key, data ) {
	const p = data.params;
	const c = content();
	const out = {
		title: '',
		subtitle: '',
		keywords: '',
		meaning: '',
		data: '',
	};
	const couple = () =>
		[ firstName( p.name ), firstName( p.name2 ) ]
			.filter( Boolean )
			.join( ' & ' );
	const dateLine = ( withTime ) => {
		const bits = [ fmtDate( p.dateStr ) ];
		if ( withTime && p.timeKnown ) {
			bits.push( p.timeStr );
		}
		if ( withTime && p.place && p.place.name ) {
			bits.push( p.place.name );
		}
		return bits.join( SEP );
	};
	const twoDates = () =>
		fmtDate( p.dateStr ) + SEP + fmtDate( p.dateStr2 || p.dateStr );
	const signLine = ( role, sign ) =>
		role +
		' · ' +
		c.signs[ sign ] +
		': ' +
		c.keywords[ sign ].join( ', ' ).toLowerCase();

	switch ( key ) {
		case 'birthchart': {
			const b3 = data.bigThree();
			out.title = p.name || c.signs[ b3.sun ];
			out.subtitle = dateLine( true );
			const big = [
				t( 'Sun' ) + ' ' + c.signs[ b3.sun ],
				t( 'Moon' ) + ' ' + c.signs[ b3.moon ],
			];
			if ( null !== b3.rising ) {
				big.push( t( 'Rising' ) + ' ' + c.signs[ b3.rising ] );
			}
			out.keywords = big.join( SEP );
			out.data = dataBlock( data.chart() );
			break;
		}
		case 'bigthree': {
			const b3 = data.bigThree();
			out.title = p.name || t( 'Big Three' );
			out.subtitle = dateLine( true );
			const kw = [
				t( 'Sun' ) + ' ' + c.signs[ b3.sun ],
				t( 'Moon' ) + ' ' + c.signs[ b3.moon ],
			];
			const lines = [
				signLine( t( 'Sun' ), b3.sun ),
				signLine( t( 'Moon' ), b3.moon ),
			];
			if ( null !== b3.rising ) {
				kw.push( t( 'Rising' ) + ' ' + c.signs[ b3.rising ] );
				lines.push( signLine( t( 'Rising' ), b3.rising ) );
			}
			out.keywords = kw.join( SEP );
			out.meaning = lines.join( '\n' );
			break;
		}
		case 'elements': {
			const bal = data.balance();
			out.title = p.name || t( 'Element Balance' );
			out.subtitle = dateLine( true );
			out.keywords = c.elements
				.map( ( e, i ) => e + ' ' + bal.pct[ i ] + '%' )
				.join( SEP );
			out.meaning =
				c.elementMeanings[ bal.dominant ] +
				' ' +
				c.modalityMeanings[ bal.mode ];
			break;
		}
		case 'profile': {
			const b3 = data.bigThree();
			const cs = data.chinese();
			out.title = p.name || t( 'Cosmic Profile' );
			out.subtitle = dateLine( true );
			const kw = [
				t( 'Sun' ) + ' ' + c.signs[ b3.sun ],
				t( 'Moon' ) + ' ' + c.signs[ b3.moon ],
			];
			if ( null !== b3.rising ) {
				kw.push( t( 'Rising' ) + ' ' + c.signs[ b3.rising ] );
			}
			kw.push( t( 'Life Path' ) + ' ' + data.lifePath().value );
			kw.push(
				c.cnElements[ cs.element ] + ' ' + c.cnAnimals[ cs.animal ]
			);
			out.keywords = kw.join( SEP );
			break;
		}
		case 'moonphase': {
			const ph = data.chart().phase;
			const moonSign = data.bigThree().moon;
			out.title = p.name || c.phases[ ph.index ];
			out.subtitle = dateLine( true );
			out.keywords = [
				c.phases[ ph.index ],
				Math.round( ph.illum * 100 ) + '% ' + t( 'illuminated' ),
				t( 'Moon in' ) + ' ' + c.signs[ moonSign ],
			].join( SEP );
			out.meaning = c.phaseMeanings[ ph.index ] || '';
			break;
		}
		case 'zodiac': {
			const s = zodiacSignOf( data );
			out.title = p.name || c.signs[ s ];
			out.subtitle =
				c.signs[ s ] +
				SEP +
				fmtSpan( s ) +
				'\n' +
				c.elements[ SIGN_ELEMENT[ s ] ] +
				SEP +
				c.modalities[ SIGN_MODALITY[ s ] ] +
				SEP +
				c.planets[ BODIES.indexOf( SIGN_RULER[ s ] ) ];
			out.keywords = c.keywords[ s ].join( SEP );
			break;
		}
		case 'chinesezodiac': {
			const cs = data.chinese();
			out.title = p.name || c.cnAnimals[ cs.animal ];
			out.subtitle =
				c.cnElements[ cs.element ] +
				' ' +
				c.cnAnimals[ cs.animal ] +
				SEP +
				cs.year +
				SEP +
				( cs.yang ? 'Yang' : 'Yin' );
			out.keywords =
				c.cnAnimals[ cs.animal ] + SEP + c.cnElements[ cs.element ];
			out.meaning = c.cnMeanings[ cs.animal ] || '';
			break;
		}
		case 'lifepath': {
			const lp = data.lifePath();
			out.title = p.name || t( 'Life Path' );
			out.subtitle = fmtDate( p.dateStr );
			out.keywords =
				t( 'Life Path' ) + ' ' + lp.value + SEP + cascadeLine( lp );
			out.meaning = c.numbers[ meaningIndex( lp.value ) ] || '';
			break;
		}
		case 'personalyear': {
			const py = data.year();
			out.title = p.name || t( 'Personal Year' ) + ' ' + py.value;
			out.subtitle =
				t( 'Personal Year' ) + ' ' + py.value + SEP + py.year;
			out.keywords =
				py.parts.join( ' + ' ) + ' = ' + py.sum + SEP + py.value;
			out.meaning = c.yearMeanings[ py.value - 1 ] || '';
			break;
		}
		case 'namechart': {
			const nn = nameNumbers( p.name );
			out.title = p.name || t( 'Name Chart' );
			if ( nn.destiny ) {
				out.keywords =
					t( 'Destiny' ) +
					' ' +
					nn.destiny +
					SEP +
					t( 'Soul Urge' ) +
					' ' +
					nn.soulUrge +
					SEP +
					t( 'Personality' ) +
					' ' +
					nn.personality;
				out.meaning = c.numbers[ meaningIndex( nn.destiny ) ] || '';
			}
			break;
		}
		case 'angelnumber': {
			const idx = ANGEL_NUMBERS.indexOf(
				String( p.angelNum || '' ).replace( /\D/g, '' )
			);
			// The art already stages the number; the title names it.
			out.title = t( 'Angel Number' );
			out.meaning = idx >= 0 ? c.angels[ idx ] : '';
			break;
		}
		case 'couple': {
			const a = data.personAt( p.dateStr );
			const b = data.personAt( p.dateStr2 || p.dateStr );
			out.title =
				couple() || c.signs[ a.sign ] + ' & ' + c.signs[ b.sign ];
			out.subtitle = twoDates();
			out.keywords =
				c.signs[ a.sign ] +
				' & ' +
				c.signs[ b.sign ] +
				SEP +
				c.elements[ SIGN_ELEMENT[ a.sign ] ] +
				' & ' +
				c.elements[ SIGN_ELEMENT[ b.sign ] ];
			break;
		}
		case 'synastry': {
			const sunA = signOf(
				data.chart().positions.find( ( q ) => 'sun' === q.body ).lon
			).index;
			const sunB = signOf(
				data.chartB().positions.find( ( q ) => 'sun' === q.body ).lon
			).index;
			out.title = couple() || c.signs[ sunA ] + ' & ' + c.signs[ sunB ];
			out.subtitle =
				twoDates() +
				( p.place && p.place.name ? SEP + p.place.name : '' );
			out.keywords = c.signs[ sunA ] + ' & ' + c.signs[ sunB ];
			break;
		}
		case 'couplenumbers': {
			const cn = coupleNumber( p.dateStr, p.dateStr2 || p.dateStr );
			out.title = couple() || t( 'Couple Numbers' );
			out.subtitle = twoDates();
			out.keywords = cn.a.value + ' & ' + cn.b.value + SEP + cn.value;
			out.meaning = c.numbers[ meaningIndex( cn.value ) ] || '';
			break;
		}
	}
	return out;
}

/** The status line under the preview: what was computed, and how. */
export function cardStatus( key, data ) {
	const p = data.params;
	const card = cardByKey( key );
	const bits = [];
	if ( card.time ) {
		const m = data.moment();
		if ( p.place && p.place.name ) {
			bits.push( p.place.name );
		}
		if ( 'override' === m.source ) {
			bits.push(
				t( 'Manual offset' ) + ' ' + fmtOffset( m.offsetMinutes )
			);
		} else if ( 'zone' === m.source ) {
			bits.push( m.zone + ' ' + fmtOffset( m.offsetMinutes ) );
		} else if ( null !== p.lat && undefined !== p.lat ) {
			bits.push( t( 'Mean solar time (no zone found)' ) );
		}
		if ( ! p.timeKnown ) {
			bits.push( t( 'Houses need a birth time.' ) );
		} else if ( null === p.lat || undefined === p.lat ) {
			bits.push( t( 'Choose a place for houses and the ascendant.' ) );
		} else {
			const chart = data.chart();
			if ( chart.houses && 'whole' === chart.houses.system ) {
				bits.push( t( 'Whole Sign houses (polar latitude)' ) );
			}
		}
	} else if ( 'lifepath' === key ) {
		bits.push( t( 'Life Path' ) + ' ' + data.lifePath().value );
	} else if ( 'personalyear' === key ) {
		const py = data.year();
		bits.push( t( 'Personal Year' ) + ' ' + py.value + ' · ' + py.year );
	} else if ( 'namechart' === key ) {
		const nn = nameNumbers( p.name );
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
	} else if ( 'chinesezodiac' === key ) {
		const cs = data.chinese();
		const c = content();
		bits.push(
			c.cnElements[ cs.element ] +
				' ' +
				c.cnAnimals[ cs.animal ] +
				' · ' +
				cs.year
		);
	} else if ( card.partner ) {
		const cn = coupleNumber( p.dateStr, p.dateStr2 || p.dateStr );
		bits.push( cn.a.value + ' & ' + cn.b.value + ' · ' + cn.value );
	}
	return bits.join( ' · ' );
}
