/**
 * Color Schemer variants (v1.432.0): the palette on the user's own design.
 *
 * Every editable color of the page takes one palette color by rank of
 * brightness - darkest to darkest, lightest to lightest - so text keeps
 * its contrast to the ground it sits on. The variants keep that order,
 * turn the accents between the two ends, or swap light and dark. Every
 * result is a real palette color; smooth blends stay Palette mix's job.
 * Pure: the dialog turns a mapping into patches with mappingPatches().
 */

import { parseColor } from './color';
import { colorKey } from './color-replace';

/** At most this many accent turns per direction (the grid is 3 x 2). */
const TURNS = 3;

const brightness = ( key ) => {
	const c = parseColor( key );
	return c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
};

/**
 * Unique #rrggbb keys of any CSS colors, darkest first.
 *
 * @param {string[]} colors Colors.
 * @return {string[]} Sorted keys.
 */
export function byBrightness( colors ) {
	return [
		...new Set(
			( colors || [] )
				.map( ( c ) => colorKey( c )?.key )
				.filter( Boolean )
		),
	].sort( ( a, b ) => brightness( a ) - brightness( b ) );
}

const turn = ( list, r ) => list.slice( r ).concat( list.slice( 0, r ) );

/**
 * The palette orders the grid shows: as designed, then with the accents
 * turned between the darkest and the lightest color; the same again with
 * light and dark swapped.
 *
 * @param {string[]} palette Palette colors.
 * @return {Array<{inverted: boolean, turn: number, sequence: string[]}>} Orders.
 */
export function schemeOrders( palette ) {
	const sorted = byBrightness( palette );
	if ( ! sorted.length ) {
		return [];
	}
	const turns = Math.max( 1, Math.min( TURNS, sorted.length - 2 ) );
	const out = [];
	for ( const inverted of [ false, true ] ) {
		const line = inverted ? [ ...sorted ].reverse() : sorted;
		for ( let r = 0; r < turns; r++ ) {
			out.push( {
				inverted,
				turn: r,
				sequence:
					line.length > 2
						? [
								line[ 0 ],
								...turn( line.slice( 1, -1 ), r ),
								line[ line.length - 1 ],
						  ]
						: line,
			} );
		}
	}
	return out;
}

/**
 * { pageColor: paletteColor } for one order. The page colors, sorted dark
 * to light, take the palette color at the same relative rank; a page with
 * a single color keeps it where its own brightness puts it.
 *
 * @param {string[]} pageColors Editable colors of the page.
 * @param {string[]} sequence   One palette order.
 * @return {Object} Mapping by colorKey key.
 */
export function rankMapping( pageColors, sequence ) {
	const from = byBrightness( pageColors );
	const n = sequence.length;
	const m = from.length;
	const map = {};
	if ( ! n || ! m ) {
		return map;
	}
	from.forEach( ( key, i ) => {
		const at =
			m === 1
				? Math.round( ( brightness( key ) / 255 ) * ( n - 1 ) )
				: Math.round( ( i * ( n - 1 ) ) / ( m - 1 ) );
		map[ key ] = sequence[ at ];
	} );
	return map;
}

/**
 * Every distinct way the palette lands on the page, as designed first.
 * Orders that would give the same page twice (a two-color page ignores
 * the accents) are shown once.
 *
 * @param {string[]} pageColors Editable colors of the page.
 * @param {string[]} palette    Palette colors.
 * @return {Array<Object>} { inverted, turn, sequence, mapping, recolored }.
 */
export function schemeVariants( pageColors, palette ) {
	const seen = new Set();
	const out = [];
	for ( const order of schemeOrders( palette ) ) {
		const mapping = rankMapping( pageColors, order.sequence );
		const keys = Object.keys( mapping );
		const signature = keys.map( ( k ) => mapping[ k ] ).join( ',' );
		if ( ! keys.length || seen.has( signature ) ) {
			continue;
		}
		seen.add( signature );
		out.push( {
			...order,
			mapping,
			recolored: keys.filter( ( k ) => mapping[ k ] !== k ).length,
		} );
	}
	return out;
}
