/**
 * Readings drawn from a computed chart: the Big Three (sun, moon and
 * rising sign) and the balance of elements and modalities. Pure maths
 * over astro.js positions, fully unit-testable.
 */

import { signOf } from './astro.js';
import { SIGN_ELEMENT, SIGN_MODALITY } from './content.js';

/**
 * How much each point counts in the balance. The lights and the ascendant
 * weigh double, the personal planets one and a half, the social planets
 * once, and the slow outer planets half: they stay in one sign for years,
 * so they describe a generation more than a person.
 */
export const BALANCE_WEIGHTS = {
	sun: 2,
	moon: 2,
	asc: 2,
	mercury: 1.5,
	venus: 1.5,
	mars: 1.5,
	jupiter: 1,
	saturn: 1,
	uranus: 0.5,
	neptune: 0.5,
	pluto: 0.5,
};

/**
 * Sun, moon and rising sign of a chart.
 *
 * @param {Object} chart From computeChart().
 * @return {{ sun: number, moon: number, rising: number|null,
 *   degrees: { sun: number, moon: number, rising: number|null } }}
 *   Sign indices 0..11; rising is null without houses.
 */
export function bigThree( chart ) {
	const lon = ( body ) =>
		chart.positions.find( ( p ) => p.body === body ).lon;
	const sun = signOf( lon( 'sun' ) );
	const moon = signOf( lon( 'moon' ) );
	const asc = chart.houses ? signOf( chart.houses.asc ) : null;
	return {
		sun: sun.index,
		moon: moon.index,
		rising: asc ? asc.index : null,
		degrees: {
			sun: sun.degree,
			moon: moon.degree,
			rising: asc ? asc.degree : null,
		},
	};
}

/**
 * Element and modality balance of a chart.
 *
 * @param {Object} chart From computeChart().
 * @return {{ elements: number[], modalities: number[], dominant: number,
 *   mode: number, weights: number[] }} Shares sum to 1: elements are
 *   [ fire, earth, air, water ], modalities [ cardinal, fixed, mutable ];
 *   dominant / mode are their largest indices.
 */
export function elementBalance( chart ) {
	const el = [ 0, 0, 0, 0 ];
	const mo = [ 0, 0, 0 ];
	const add = ( lonDeg, w ) => {
		const s = signOf( lonDeg ).index;
		el[ SIGN_ELEMENT[ s ] ] += w;
		mo[ SIGN_MODALITY[ s ] ] += w;
	};
	for ( const p of chart.positions ) {
		add( p.lon, BALANCE_WEIGHTS[ p.body ] || 1 );
	}
	if ( chart.houses ) {
		add( chart.houses.asc, BALANCE_WEIGHTS.asc );
	}
	const total = el.reduce( ( a, b ) => a + b, 0 ) || 1;
	const elements = el.map( ( v ) => v / total );
	const modalities = mo.map( ( v ) => v / total );
	const argmax = ( arr ) =>
		arr.reduce( ( best, v, i ) => ( v > arr[ best ] ? i : best ), 0 );
	return {
		elements,
		modalities,
		dominant: argmax( elements ),
		mode: argmax( modalities ),
		weights: el,
	};
}

/**
 * Round shares to whole percentages that still add up to 100 (largest
 * remainder), so the poster never reads 99 % or 101 %.
 *
 * @param {number[]} shares Fractions summing to 1.
 * @return {number[]} Whole percentages summing to 100.
 */
export function percentages( shares ) {
	const raw = shares.map( ( s ) => s * 100 );
	const out = raw.map( Math.floor );
	let rest = 100 - out.reduce( ( a, b ) => a + b, 0 );
	const order = raw
		.map( ( v, i ) => ( { i, r: v - Math.floor( v ) } ) )
		.sort( ( a, b ) => b.r - a.r );
	for ( let k = 0; rest > 0 && k < order.length; k++, rest-- ) {
		out[ order[ k ].i ]++;
	}
	return out;
}
