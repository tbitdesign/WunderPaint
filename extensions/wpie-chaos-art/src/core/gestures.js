/**
 * The gesture grammar: what a STROKE is.
 *
 * The core insight that forced this module into being: painters that
 * emit marks continuously and uniformly along smooth trajectories all
 * produce the same fabric, no matter how many parameters are shuffled
 * above them. A painting is made of GESTURES - discrete movements with
 * an attack, a swing and a release, a width that swells and tapers,
 * pauses between them, and a piece repeats its own shapes with
 * variation. This module is that vocabulary, pure math, no actors.
 *
 * A gesture is planar (drawn in a tilted plane in space, the way a hand
 * draws on an imagined surface), parametric over t in [0,1], roughly
 * unit-sized; the performer scales, orients and paces it.
 */

export const GESTURE_KINDS = [
	'arc',
	'slash',
	'zigzag',
	'spiral',
	'loop',
	'scurve',
	'hook',
	'blob',
	'volley',
];

export const WIDTH_PROFILES = [ 'taper', 'flick', 'swell', 'rough' ];

/**
 * Draw a motif: a gesture shape with its own proportions and phases.
 * A piece draws a few of these and repeats them with variation - the
 * repetition is what makes a picture look like it is ABOUT something.
 *
 * @param {Function} rng   Random source.
 * @param {string[]} kinds Allowed kinds (defaults to all).
 * @return {Object} The motif.
 */
export function drawMotif( rng, kinds = GESTURE_KINDS ) {
	const kind = kinds[ Math.floor( rng() * kinds.length ) % kinds.length ];
	return {
		kind,
		curl: 0.3 + rng() * 1.4,
		elong: 0.6 + rng() * 1.8,
		jag: rng(),
		phi: rng() * Math.PI * 2,
		phi2: rng() * Math.PI * 2,
		profile:
			WIDTH_PROFILES[
				Math.floor( rng() * WIDTH_PROFILES.length ) %
					WIDTH_PROFILES.length
			],
	};
}

const tri = ( x ) => 2 * Math.abs( x - Math.floor( x + 0.5 ) );

/**
 * The gesture's local 2D point at parameter t (x is the writing
 * direction, y the sideways swing). Roughly within [-1.2, 1.2].
 *
 * @param {Object} m Motif.
 * @param {number} t Parameter 0..1.
 * @return {number[]} [x, y].
 */
export function gesturePoint( m, t ) {
	const e = m.elong;
	switch ( m.kind ) {
		case 'arc': {
			const span = 0.6 + m.curl * 1.8;
			const a = ( t - 0.5 ) * span;
			return [ Math.sin( a ) * e, ( 1 - Math.cos( a ) ) * 0.9 ];
		}
		case 'slash':
			return [
				( t - 0.5 ) * 2 * e,
				Math.sin( t * Math.PI ) * m.jag * 0.25,
			];
		case 'zigzag': {
			const n = 2 + Math.round( m.jag * 4 );
			return [ ( t - 0.5 ) * 2 * e, ( tri( t * n ) - 0.5 ) * 0.7 ];
		}
		case 'spiral': {
			const turns = 1.2 + m.curl * 2;
			const a = t * turns * Math.PI * 2 + m.phi;
			const r = ( 1 - t * 0.82 ) * 0.9;
			return [ Math.cos( a ) * r * e * 0.7, Math.sin( a ) * r ];
		}
		case 'loop': {
			const a = t * Math.PI * 2.15 + m.phi;
			return [ Math.cos( a ) * 0.85 * e * 0.8, Math.sin( a ) * 0.85 ];
		}
		case 'scurve':
			return [
				( t - 0.5 ) * 2 * e,
				Math.sin( t * Math.PI * 2 ) * 0.5 * m.curl,
			];
		case 'hook': {
			// A long pull, then a short sharp turn-away at the end.
			if ( t < 0.72 ) {
				const u = t / 0.72;
				return [
					( u - 0.5 ) * 2 * e,
					Math.sin( u * Math.PI ) * 0.2 * m.curl,
				];
			}
			const u = ( t - 0.72 ) / 0.28;
			const a = u * ( 1.2 + m.curl );
			return [ e + Math.sin( a ) * 0.4, u * -0.55 - Math.sin( a ) * 0.1 ];
		}
		case 'blob': {
			const a = t * Math.PI * 2;
			const r =
				0.75 +
				0.22 * Math.sin( 3 * a + m.phi ) +
				m.jag * 0.14 * Math.sin( 7 * a + m.phi2 );
			return [ Math.cos( a ) * r * e * 0.8, Math.sin( a ) * r ];
		}
		default:
			// volley has no path; the performer scatters points instead.
			return [ 0, 0 ];
	}
}

/** Rough arc length factor of the unit gesture (for pacing and steps). */
export function gestureSpan( m ) {
	switch ( m.kind ) {
		case 'arc':
			return ( 0.6 + m.curl * 1.8 ) * m.elong;
		case 'slash':
			return 2 * m.elong;
		case 'zigzag':
			return 2.6 * m.elong;
		case 'spiral':
			return ( 1.2 + m.curl * 2 ) * 3.2;
		case 'loop':
			return 5.4;
		case 'scurve':
			return 2.3 * m.elong;
		case 'hook':
			return 2.4 * m.elong;
		case 'blob':
			return 5.2;
		default:
			return 1;
	}
}

/**
 * The width envelope: the attack, body and release of the stroke.
 * Never zero - a mark that vanishes mid-gesture reads as a bug, not a
 * flourish.
 *
 * @param {Object} m Motif (profile + phases).
 * @param {number} t Parameter 0..1.
 * @return {number} Width factor 0.12..1.
 */
export function widthAt( m, t ) {
	const tt = Math.max( 0, Math.min( 1, t ) );
	let v;
	switch ( m.profile ) {
		case 'flick':
			v = Math.min( 1, tt * 5 ) * Math.pow( 1 - tt, 1.4 ) * 2.2;
			break;
		case 'swell':
			v = 0.35 + 0.65 * Math.sin( tt * Math.PI );
			break;
		case 'rough':
			v =
				0.55 +
				0.3 * Math.sin( tt * 21 + m.phi ) +
				0.15 * Math.sin( tt * 47 + m.phi2 );
			break;
		default:
			// taper: soft in, soft out.
			v = Math.pow( Math.sin( tt * Math.PI ), 0.6 );
	}
	return Math.max( 0.12, Math.min( 1, v ) );
}
