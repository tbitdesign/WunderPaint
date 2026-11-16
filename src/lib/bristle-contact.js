/**
 * BRISTLE CONTACT: what pen pressure does to a paste brush.
 *
 * A light hand does not lay THINNER paint, it touches with FEWER bristles.
 * The islands used to answer pressure with thickness alone, and thin paste
 * rendered see-through - so every stroke began and ended in a soft
 * transparent ramp, like an airbrush (analysis of 09.11.2026). On a real
 * brush the film between the bristles lifts off the ground first, the
 * bristles that stand proud keep painting, and the mark breaks into
 * covering streaks with ground showing between them.
 *
 * The media tips already carry that: their masks are a thin FILM with
 * BRISTLE dots of higher coverage on top (media-tips.js genBorsten). So
 * pressure becomes a threshold on the mask's own coverage - what lies
 * under it does not reach the ground.
 *
 * Pure functions on plain arrays: no DOM, no GL.
 */

const SOFT = 0.07;

/**
 * The coverage a point of the brush head needs before it touches.
 *
 * @param {number} press Pen pressure, 0..1.
 * @return {number} 0 at full pressure (everything touches).
 */
export function contactThreshold( press ) {
	const lift = 1 - Math.min( 1, Math.max( 0, press ) );
	return lift <= 0 ? 0 : 0.62 * Math.pow( lift, 1.3 );
}

/**
 * Apply the contact to a segment's coverage, in place.
 *
 * @param {Float32Array} alpha Coverage 0..1 per grid cell.
 * @param {number}       press Pen pressure, 0..1.
 * @return {Float32Array} The same array.
 */
export function bristleContact( alpha, press ) {
	const th = contactThreshold( press );
	if ( th <= 0 ) {
		return alpha;
	}
	const lo = th - SOFT;
	const span = 2 * SOFT;
	for ( let i = 0; i < alpha.length; i++ ) {
		const a = alpha[ i ];
		if ( a <= 0 ) {
			continue;
		}
		const t = ( a - lo ) / span;
		if ( t <= 0 ) {
			alpha[ i ] = 0;
		} else if ( t < 1 ) {
			alpha[ i ] = a * t * t * ( 3 - 2 * t );
		}
	}
	return alpha;
}
