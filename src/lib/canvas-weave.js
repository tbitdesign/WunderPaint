/**
 * CANVAS: a plain weave as a height tile, for the paste media.
 *
 * The first canvas was the product of two sine waves, four pixels apart.
 * Lit from 45 degrees that product is, exactly, ONE family of diagonal
 * stripes (cos x sin y + sin x cos y = sin( x + y )) - a printed screen
 * laid over every oil and acrylic stroke, repeating itself to 95 % at
 * every multiple of its period (measured 09.11.2026). Cloth is threads:
 * the warp runs over one weft and under the next, every thread has its
 * own thickness, wanders a little and carries slubs.
 *
 * 512 x 512, periodic, deterministic, built once per pitch. 1 = the top
 * of a thread where it rides over a crossing, 0 = the gap between threads.
 */

export const WEAVE_TILE = 512;
const N = WEAVE_TILE;

/** Deterministic dice (mulberry32). */
function dice( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = a;
		t = Math.imul( t ^ ( t >>> 15 ), t | 1 );
		t ^= t + Math.imul( t ^ ( t >>> 7 ), t | 61 );
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/**
 * A periodic smooth curve over the tile: `knots` random values, eased
 * between. Returns a lookup of N samples, centred on zero.
 *
 * @param {Function} rnd   Dice.
 * @param {number}   knots Random values across the tile.
 * @return {Float32Array} N samples in -0.5..0.5.
 */
function wave( rnd, knots ) {
	const k = new Float32Array( knots );
	for ( let i = 0; i < knots; i++ ) {
		k[ i ] = rnd() - 0.5;
	}
	const out = new Float32Array( N );
	for ( let x = 0; x < N; x++ ) {
		const u = ( x * knots ) / N;
		const i = Math.floor( u );
		let f = u - i;
		f = f * f * ( 3 - 2 * f );
		out[ x ] =
			k[ i % knots ] + ( k[ ( i + 1 ) % knots ] - k[ i % knots ] ) * f;
	}
	return out;
}

const tiles = new Map();

/**
 * The weave as heights.
 *
 * @param {Object} opts       Options.
 * @param {number} opts.pitch Thread pitch in pixels; a divisor of 512 that
 *                            leaves an even thread count (4 by default).
 * @return {Float32Array} 512 x 512 heights, 0..1.
 */
export function weaveTile( opts = {} ) {
	const pitch = opts.pitch ?? 4;
	const hit = tiles.get( pitch );
	if ( hit ) {
		return hit;
	}
	const count = Math.round( N / pitch );
	const rnd = dice( 0x5eed + count );
	// Per thread: how thick it is, where it lies off its lane, how it
	// wanders along its length and where it swells into slubs.
	const thread = () => ( {
		thick: 0.76 + 0.42 * rnd(),
		off: ( rnd() - 0.5 ) * 0.3 * pitch,
		wander: wave( rnd, 5 + Math.floor( rnd() * 6 ) ),
		slub: wave( rnd, 11 + Math.floor( rnd() * 12 ) ),
	} );
	const warp = Array.from( { length: count }, thread );
	const weft = Array.from( { length: count }, thread );
	const half = pitch / 2;
	// Height of one thread's top surface at a point: `along` is the pixel
	// along its length, `across` the pixel across it, `lane` its index and
	// `sign` +1 where it rides over the crossing under this point.
	const top = ( t, lane, across, along, rise ) => {
		const centre =
			( lane + 0.5 ) * pitch + t.off + t.wander[ along ] * 0.55 * pitch;
		let d = across - centre;
		// The tile wraps: a thread at the seam is near from both sides.
		if ( d > N / 2 ) {
			d -= N;
		} else if ( d < -N / 2 ) {
			d += N;
		}
		const w = half * 0.96 * t.thick * ( 1 + 0.5 * t.slub[ along ] );
		const u = d / w;
		if ( u <= -1 || u >= 1 ) {
			return -1;
		}
		const round = Math.sqrt( 1 - u * u );
		return 0.5 + 0.25 * rise + 0.25 * t.thick * ( 2 * round - 1 );
	};
	const out = new Float32Array( N * N );
	for ( let y = 0; y < N; y++ ) {
		const j0 = Math.floor( y / pitch );
		// Where a thread stands along its length: +1 on top of a crossing,
		// -1 under it, a smooth arch between.
		const archY = Math.cos( Math.PI * ( y / pitch - 0.5 ) );
		for ( let x = 0; x < N; x++ ) {
			const i0 = Math.floor( x / pitch );
			const archX = Math.cos( Math.PI * ( x / pitch - 0.5 ) );
			let h = 0;
			for ( let k = -1; k <= 1; k++ ) {
				const i = ( i0 + k + count ) % count;
				const j = ( j0 + k + count ) % count;
				h = Math.max(
					h,
					top( warp[ i ], i, x, y, ( i & 1 ? -1 : 1 ) * archY ),
					top( weft[ j ], j, y, x, ( j & 1 ? 1 : -1 ) * archX )
				);
			}
			out[ y * N + x ] = h < 0 ? 0 : h > 1 ? 1 : h;
		}
	}
	tiles.set( pitch, out );
	return out;
}
