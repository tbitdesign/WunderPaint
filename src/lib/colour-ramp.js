/**
 * Reading a colour out of a multi-stop gradient.
 *
 * The editor already has the gradient EDITOR - GradientBar, the same bar
 * the gradient tool and the properties panel use - and it already has the
 * stop format, `{ color, at }` with `at` from 0 to 1. What it did not have
 * is the other half: given a position along a stroke, what colour is that.
 *
 * Alpha travels with the colour rather than being dropped, because the
 * shipped default gradient ends on `rgba(...,0)` and a brush that ignored
 * that would fade to opaque blue instead of to nothing.
 */

/**
 * What a brush gradient looks like before anybody has touched it.
 *
 * IT LIVES HERE, ONCE, AND THE STORE STARTS WITH IT. The brush panel used
 * to invent these three colours for the bar it was drawing while the store
 * still held `null`, so picking "Gradient" showed a ramp and painted a
 * solid line, and only nudging a handle - which finally wrote stops -
 * made the brush do what the panel had been promising all along. A default
 * that only the display knows about is not a default.
 *
 * Three colours, not two, and none of them transparent: this is a stroke,
 * and a stroke has to SHOW that its colour travels. The gradient tool
 * starts on a fade to nothing instead, because a fill wants the opposite.
 */
export const DEFAULT_STOPS = [
	{ color: '#ff3d81', at: 0 },
	{ color: '#ffd166', at: 0.5 },
	{ color: '#3bd6ff', at: 1 },
];

const clamp01 = ( v ) => ( v < 0 ? 0 : v > 1 ? 1 : v );

/**
 * Parse the colour notations the stops are actually written in.
 *
 * @param {string} css A colour: #rgb, #rrggbb, rgb() or rgba().
 * @return {Array} [ r, g, b, a ], channels 0..255 and alpha 0..1.
 */
export function parseColour( css ) {
	const s = String( css || '' ).trim();
	if ( '#' === s[ 0 ] ) {
		const hex = s.slice( 1 );
		if ( 3 === hex.length ) {
			return [
				parseInt( hex[ 0 ] + hex[ 0 ], 16 ),
				parseInt( hex[ 1 ] + hex[ 1 ], 16 ),
				parseInt( hex[ 2 ] + hex[ 2 ], 16 ),
				1,
			];
		}
		if ( 6 === hex.length || 8 === hex.length ) {
			return [
				parseInt( hex.slice( 0, 2 ), 16 ),
				parseInt( hex.slice( 2, 4 ), 16 ),
				parseInt( hex.slice( 4, 6 ), 16 ),
				8 === hex.length ? parseInt( hex.slice( 6, 8 ), 16 ) / 255 : 1,
			];
		}
		return [ 0, 0, 0, 1 ];
	}
	const m = s.match( /rgba?\(([^)]+)\)/i );
	if ( m ) {
		const p = m[ 1 ].split( /[,/\s]+/ ).filter( Boolean );
		return [
			parseInt( p[ 0 ], 10 ) || 0,
			parseInt( p[ 1 ], 10 ) || 0,
			parseInt( p[ 2 ], 10 ) || 0,
			undefined === p[ 3 ] ? 1 : clamp01( parseFloat( p[ 3 ] ) ),
		];
	}
	return [ 0, 0, 0, 1 ];
}

const hex2 = ( v ) =>
	Math.round( clamp01( v / 255 ) * 255 )
		.toString( 16 )
		.padStart( 2, '0' );

/**
 * The colour a gradient shows at one position.
 *
 * @param {Array}  stops [{ color, at }], any order, at 0..1.
 * @param {number} t     Position along the gradient, 0..1.
 * @return {Object} { hex, alpha } - alpha separate, so the caller can fold
 *                  it into whatever opacity it is already applying.
 */
export function sampleStops( stops, t ) {
	const list = ( stops || [] )
		.filter( ( s ) => s && s.color )
		.map( ( s ) => ( { c: parseColour( s.color ), at: clamp01( s.at ) } ) )
		.sort( ( a, b ) => a.at - b.at );
	if ( ! list.length ) {
		return { hex: '#000000', alpha: 1 };
	}
	const u = clamp01( t );
	// Outside the outermost stops a gradient holds its end colour rather
	// than running off into nothing.
	if ( u <= list[ 0 ].at ) {
		const c = list[ 0 ].c;
		return {
			hex: '#' + hex2( c[ 0 ] ) + hex2( c[ 1 ] ) + hex2( c[ 2 ] ),
			alpha: c[ 3 ],
		};
	}
	const last = list[ list.length - 1 ];
	if ( u >= last.at ) {
		const c = last.c;
		return {
			hex: '#' + hex2( c[ 0 ] ) + hex2( c[ 1 ] ) + hex2( c[ 2 ] ),
			alpha: c[ 3 ],
		};
	}
	let i = 1;
	while ( i < list.length && list[ i ].at < u ) {
		i++;
	}
	const a = list[ i - 1 ];
	const b = list[ i ];
	const span = b.at - a.at;
	const k = span > 0 ? ( u - a.at ) / span : 0;
	const mix = ( j ) => a.c[ j ] + ( b.c[ j ] - a.c[ j ] ) * k;
	return {
		hex: '#' + hex2( mix( 0 ) ) + hex2( mix( 1 ) ) + hex2( mix( 2 ) ),
		alpha: clamp01( mix( 3 ) ),
	};
}

/**
 * Where along the gradient a mark sits.
 *
 * @param {number} t      Fraction along the stroke, 0..1.
 * @param {number} cycles How often the gradient repeats over the stroke.
 * @return {number} 0..1.
 */
export function rampAt( t, cycles ) {
	const n = Math.max( 1, cycles || 1 );
	if ( 1 === n ) {
		return clamp01( t );
	}
	// Ping-pong rather than sawtooth: a repeating gradient that jumps back
	// to its first colour puts a hard seam in the stroke at every repeat.
	const u = clamp01( t ) * n;
	const whole = Math.floor( u );
	const frac = u - whole;
	return whole % 2 ? 1 - frac : frac;
}
