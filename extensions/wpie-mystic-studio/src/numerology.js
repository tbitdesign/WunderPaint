/**
 * The numerology engine: Pythagorean letter values, digit reduction with
 * the master numbers 11/22/33 preserved, the life path from a birth date
 * (month, day and year reduced separately - the method that keeps
 * masters), name numbers (destiny, soul urge, personality) and the couple
 * number. Pure math, fully unit-testable.
 */

export const MASTERS = [ 11, 22, 33 ];

/** Sum the digits of a non-negative integer once. */
const digitSum = ( n ) =>
	String( Math.abs( Math.round( n ) ) )
		.split( '' )
		.reduce( ( a, d ) => a + Number( d ), 0 );

/**
 * Reduce to a single digit, stopping at master numbers.
 *
 * @param {number} n Input number.
 * @return {number} 1..9, 11, 22 or 33.
 */
export function reduceNumber( n ) {
	let v = Math.abs( Math.round( n ) );
	while ( v > 9 && ! MASTERS.includes( v ) ) {
		v = digitSum( v );
	}
	return v;
}

/**
 * The visible reduction cascade, e.g. 1990 -> [ 1990, 19, 10, 1 ].
 *
 * @param {number} n Input number.
 * @return {number[]} Every step down to the final number.
 */
export function cascade( n ) {
	const steps = [ Math.abs( Math.round( n ) ) ];
	while (
		steps[ steps.length - 1 ] > 9 &&
		! MASTERS.includes( steps[ steps.length - 1 ] )
	) {
		steps.push( digitSum( steps[ steps.length - 1 ] ) );
	}
	return steps;
}

/**
 * Life path from a birth date: month, day and year reduce separately,
 * their sum reduces again (masters preserved at every stage).
 *
 * @param {string} dateStr 'YYYY-MM-DD'.
 * @return {{value: number, parts: number[], sum: number}} parts =
 *   [ reduced month, reduced day, reduced year ].
 */
export function lifePath( dateStr ) {
	const [ y, m, d ] = String( dateStr || '' )
		.split( '-' )
		.map( ( v ) => parseInt( v, 10 ) || 0 );
	const parts = [ reduceNumber( m ), reduceNumber( d ), reduceNumber( y ) ];
	const sum = parts[ 0 ] + parts[ 1 ] + parts[ 2 ];
	return { value: reduceNumber( sum ), parts, sum };
}

/* ------------------------------- letters --------------------------------- */

/**
 * Normalize a name to plain A-Z words: accents stripped (NFD), everything
 * else is a separator.
 *
 * @param {string} name Free-form name.
 * @return {string[]} Uppercase words.
 */
export function nameWords( name ) {
	return String( name || '' )
		.normalize( 'NFD' )
		.replace( /[̀-ͯ]/g, '' )
		.toUpperCase()
		.split( /[^A-Z]+/ )
		.filter( Boolean );
}

/** Pythagorean value of an uppercase A-Z letter. */
export function letterValue( ch ) {
	const idx = ch.charCodeAt( 0 ) - 65;
	if ( idx < 0 || idx > 25 ) {
		return 0;
	}
	return ( idx % 9 ) + 1;
}

const VOWELS = 'AEIOU';

/**
 * Is the letter at position i a vowel in this word? Y counts as a vowel
 * only when the word has no A/E/I/O/U at all (the common simplification,
 * pinned in a test).
 *
 * @param {string} word Uppercase word.
 * @param {number} i    Letter index.
 * @return {boolean} Vowel?
 */
export function isVowelAt( word, i ) {
	const ch = word[ i ];
	if ( VOWELS.includes( ch ) ) {
		return true;
	}
	if ( 'Y' === ch ) {
		return ! word.split( '' ).some( ( c ) => VOWELS.includes( c ) );
	}
	return false;
}

/**
 * The three name numbers plus the letter breakdown for the grid.
 *
 * @param {string} name Free-form name.
 * @return {{destiny: number, soulUrge: number, personality: number,
 *   letters: Array<{ch: string, value: number, vowel: boolean,
 *   space: boolean}>, sums: {destiny: number, soulUrge: number,
 *   personality: number}}}
 */
export function nameNumbers( name ) {
	const words = nameWords( name );
	const letters = [];
	let all = 0;
	let vow = 0;
	let cons = 0;
	words.forEach( ( word, w ) => {
		if ( w > 0 ) {
			letters.push( { ch: ' ', value: 0, vowel: false, space: true } );
		}
		word.split( '' ).forEach( ( ch, i ) => {
			const value = letterValue( ch );
			const vowel = isVowelAt( word, i );
			letters.push( { ch, value, vowel, space: false } );
			all += value;
			if ( vowel ) {
				vow += value;
			} else {
				cons += value;
			}
		} );
	} );
	return {
		destiny: all ? reduceNumber( all ) : 0,
		soulUrge: vow ? reduceNumber( vow ) : 0,
		personality: cons ? reduceNumber( cons ) : 0,
		letters,
		sums: { destiny: all, soulUrge: vow, personality: cons },
	};
}

/**
 * The couple number: both life paths joined and reduced once more.
 *
 * @param {string} dateA 'YYYY-MM-DD'.
 * @param {string} dateB 'YYYY-MM-DD'.
 * @return {{value: number, a: Object, b: Object}} a/b = lifePath() results.
 */
export function coupleNumber( dateA, dateB ) {
	const a = lifePath( dateA );
	const b = lifePath( dateB );
	return { value: reduceNumber( a.value + b.value ), a, b };
}

/** Meaning index for a number: 1..9 -> 0..8, 11/22/33 -> 9/10/11. */
export function meaningIndex( value ) {
	if ( MASTERS.includes( value ) ) {
		return 9 + MASTERS.indexOf( value );
	}
	return value >= 1 && value <= 9 ? value - 1 : -1;
}

/** The curated angel numbers, index-stable for the i18n meanings. */
export const ANGEL_NUMBERS = [
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
