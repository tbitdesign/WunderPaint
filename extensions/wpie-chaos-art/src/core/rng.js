/**
 * Randomness and noise for a piece that must never repeat.
 *
 * There is deliberately NO seed anywhere in the public surface: the pool
 * starts from crypto randomness and the user's own pointer movement keeps
 * stirring it. Tests inject their own generator through makeRng( words ),
 * which is the only door to determinism - the studio never uses it.
 */

/** A pool of 32-bit words the entropy field feeds. */
export function makePool() {
	const words = new Uint32Array( 16 );
	if ( typeof crypto !== 'undefined' && crypto.getRandomValues ) {
		crypto.getRandomValues( words );
	} else {
		for ( let i = 0; i < words.length; i++ ) {
			words[ i ] = ( Math.random() * 0xffffffff ) >>> 0;
		}
	}
	let at = 0;
	let stirred = 0;
	return {
		words,
		/** Mix pointer data (or anything) into the pool. */
		feed( a, b, c ) {
			let h = words[ at ] ^ 0x9e3779b9;
			h = ( h ^ ( ( a * 0x85ebca6b ) >>> 0 ) ) >>> 0;
			h = ( ( h << 13 ) | ( h >>> 19 ) ) >>> 0;
			h = ( h ^ ( ( b * 0xc2b2ae35 ) >>> 0 ) ) >>> 0;
			h = ( ( h << 7 ) | ( h >>> 25 ) ) >>> 0;
			h = ( h ^ ( ( c * 0x27d4eb2f ) >>> 0 ) ) >>> 0;
			words[ at ] = h >>> 0;
			at = ( at + 1 ) % words.length;
			stirred++;
		},
		/** How often feed() ran - the UI shows charge from this. */
		charge() {
			return stirred;
		},
	};
}

/**
 * A small fast generator (mulberry32 over a rotating pool).
 *
 * @param {Uint32Array|number[]} words Pool words to start from.
 * @return {Function} () => float in [0, 1).
 */
export function makeRng( words ) {
	let s = 0x6d2b79f5;
	for ( let i = 0; i < words.length; i++ ) {
		// A real avalanche per word - a weak fold once let two different
		// pools collapse onto the same stream.
		s = ( s ^ words[ i % words.length ] ) >>> 0;
		s = Math.imul( s ^ ( s >>> 16 ), 0x45d9f3b ) >>> 0;
		s = Math.imul( s ^ ( s >>> 16 ), 0x45d9f3b ) >>> 0;
		s = ( ( s ^ ( s >>> 16 ) ) + 0x9e3779b9 ) >>> 0;
	}
	return function () {
		s = ( s + 0x6d2b79f5 ) >>> 0;
		let t = s;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/* ------------------------------- value noise ------------------------------ */

/** Integer lattice hash to [0, 1). */
function hash3( x, y, z ) {
	let h =
		( Math.imul( x, 0x8da6b343 ) ^
			Math.imul( y, 0xd8163841 ) ^
			Math.imul( z, 0xcb1ab31f ) ) >>>
		0;
	h = Math.imul( h ^ ( h >>> 13 ), 0x85ebca6b ) >>> 0;
	h = ( h ^ ( h >>> 16 ) ) >>> 0;
	return h / 4294967296;
}

const smooth = ( t ) => t * t * ( 3 - 2 * t );

/** Trilinear value noise in [0, 1). Continuous, cheap, dependency-free. */
export function vnoise( x, y, z ) {
	const xi = Math.floor( x );
	const yi = Math.floor( y );
	const zi = Math.floor( z );
	const xf = smooth( x - xi );
	const yf = smooth( y - yi );
	const zf = smooth( z - zi );
	const lerp = ( a, b, t ) => a + ( b - a ) * t;
	const c000 = hash3( xi, yi, zi );
	const c100 = hash3( xi + 1, yi, zi );
	const c010 = hash3( xi, yi + 1, zi );
	const c110 = hash3( xi + 1, yi + 1, zi );
	const c001 = hash3( xi, yi, zi + 1 );
	const c101 = hash3( xi + 1, yi, zi + 1 );
	const c011 = hash3( xi, yi + 1, zi + 1 );
	const c111 = hash3( xi + 1, yi + 1, zi + 1 );
	return lerp(
		lerp( lerp( c000, c100, xf ), lerp( c010, c110, xf ), yf ),
		lerp( lerp( c001, c101, xf ), lerp( c011, c111, xf ), yf ),
		zf
	);
}

/**
 * A turbulent flow direction at a point in space and time.
 *
 * Three decorrelated noise channels make a vector field; it is not
 * divergence-free and does not want to be - the wobble IS the drawing.
 *
 * @param {number[]} p     [x, y, z] position.
 * @param {number}   t     World time.
 * @param {number}   scale Spatial frequency (bigger = busier).
 * @return {number[]} A direction, roughly unit length.
 */
export function flow( p, t, scale = 0.02 ) {
	const x = p[ 0 ] * scale;
	const y = p[ 1 ] * scale;
	const z = p[ 2 ] * scale;
	const w = t * 0.07;
	const vx = vnoise( x, y + 31.7, z + w ) - 0.5;
	const vy = vnoise( x + 71.3, y, z - w ) - 0.5;
	const vz = vnoise( x - 19.1, y + w, z ) - 0.5;
	const len = Math.hypot( vx, vy, vz ) || 1;
	return [ vx / len, vy / len, vz / len ];
}
