/**
 * The Chinese zodiac, honestly computed: the year boundary is the
 * Chinese New Year, found with the studio's own lunar engine (the new
 * moon falling in the late-January/February window, evaluated in
 * Beijing time). Animal from the 12-year cycle, element from the ten
 * heavenly stems, yang/yin from the stem parity.
 */

import { julianDate, moonPhase, wrap180 } from './astro.js';

/** Animal index 0..11 = Rat..Pig; 1984 was a Rat year. */
export const ANIMAL_COUNT = 12;

/** The animals as Chinese characters, index-aligned with the names. */
export const HANZI = [
	'鼠',
	'牛',
	'虎',
	'兔',
	'龍',
	'蛇',
	'馬',
	'羊',
	'猴',
	'雞',
	'狗',
	'豬',
];

/** Element characters: wood, fire, earth, metal, water. */
export const ELEMENT_HANZI = [ '木', '火', '土', '金', '水' ];

const BEIJING_OFFSET_DAYS = 8 / 24;

/** Signed elongation around the new moon: negative before, positive after. */
const elong = ( jd ) => wrap180( moonPhase( jd ).angle );

/**
 * Julian date (start of the local Beijing day) of the Chinese New Year
 * of a Gregorian year: the new moon falling between Jan 20 and Feb 22.
 *
 * @param {number} year Gregorian year.
 * @return {number} JD of the CNY day at 00:00 Beijing time.
 */
export function chineseNewYearJd( year ) {
	const lo = julianDate( year, 1, 20 );
	const hi = julianDate( year, 2, 22 );
	// Walk to the sign change (moon runs 0..360, wrap180 flips at new moon).
	let prev = elong( lo );
	let found = null;
	for ( let jd = lo + 0.5; jd <= hi; jd += 0.5 ) {
		const cur = elong( jd );
		if ( prev < 0 && cur >= 0 ) {
			found = [ jd - 0.5, jd ];
			break;
		}
		prev = cur;
	}
	if ( ! found ) {
		return julianDate( year, 2, 5 ); // never happens inside 1800-2050
	}
	let [ a, b ] = found;
	for ( let i = 0; i < 40; i++ ) {
		const mid = ( a + b ) / 2;
		if ( elong( mid ) < 0 ) {
			a = mid;
		} else {
			b = mid;
		}
	}
	// The calendar day starts at midnight Beijing time.
	return (
		Math.floor( ( a + b ) / 2 + BEIJING_OFFSET_DAYS + 0.5 ) -
		0.5 -
		BEIJING_OFFSET_DAYS
	);
}

/**
 * Animal, element and polarity for a birth date.
 *
 * @param {string} dateStr 'YYYY-MM-DD'.
 * @return {{animal: number, element: number, yang: boolean,
 *   year: number}} animal 0..11 (Rat..Pig), element 0..4
 *   (wood/fire/earth/metal/water), year = the Chinese year label.
 */
export function chineseSign( dateStr ) {
	const [ y, m, d ] = String( dateStr || '' )
		.split( '-' )
		.map( ( v ) => parseInt( v, 10 ) );
	const year = y || 2000;
	const jd = julianDate( year, m || 1, d || 1, 12 );
	const cny = chineseNewYearJd( year );
	const cnYear = jd >= cny ? year : year - 1;
	const stem = ( ( ( cnYear - 4 ) % 10 ) + 10 ) % 10;
	return {
		animal: ( ( ( cnYear - 4 ) % 12 ) + 12 ) % 12,
		element: Math.floor( stem / 2 ),
		yang: 0 === stem % 2,
		year: cnYear,
	};
}
