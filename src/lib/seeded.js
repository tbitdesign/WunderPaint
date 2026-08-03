/**
 * Seeded randomness + easing curves (v1.273.0): the deterministic helpers
 * every generative extension re-implemented locally, exposed once through
 * the bridge (util.rng / util.EASINGS). Layer engines must replay
 * identically per seed (house rule: no Math.random in engines), so the
 * sequence here is part of the public contract - never change it.
 */

/** Mulberry32: tiny seeded PRNG; identical sequence for identical seeds. */
export function rng( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/** Standard easing curves over t in [0,1]. */
export const EASINGS = {
	linear: ( t ) => t,
	easeIn: ( t ) => t * t,
	easeOut: ( t ) => t * ( 2 - t ),
	easeInOut: ( t ) => ( t < 0.5 ? 2 * t * t : -1 + ( 4 - 2 * t ) * t ),
};
