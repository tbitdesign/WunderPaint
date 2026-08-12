/**
 * One decision, used by every tip that lays marks.
 *
 * Both the stamped tips and the soft round ones put down a series of
 * dabs; they differ only in what a dab looks like. So "what colour is
 * this dab" belongs in one place rather than being written out twice and
 * drifting - which is exactly what happened the first time round, when
 * only the stamped tips could vary their colour and the default brush
 * quietly showed no colour controls at all.
 *
 * Returns null when the stroke has nothing to vary, so the caller can
 * skip the whole business and pay nothing.
 */

import { jitterColour, jitters } from './colour-jitter';
import { sampleStops, rampAt } from './colour-ramp';

/**
 * @param {Object} path  The stroke: color, colorMode, gradient stops and
 *                       the jitter amounts.
 * @param {number} marks How many dabs the stroke will lay.
 * @return {?Function} ( index ) => { hex, alpha }, or null.
 */
export function markColour( path, marks ) {
	const base = path.color || '#000';
	const mode = path.colorMode || 'solid';
	const ramp =
		'gradient' === mode && path.gradientStops && path.gradientStops.length
			? path.gradientStops
			: null;
	const jitter = 'jitter' === mode && jitters( path );
	if ( ! ramp && ! jitter ) {
		return null;
	}
	const last = Math.max( 1, marks - 1 );
	// The dice are keyed on WHERE a dab sits, never on how many there are:
	// a stroke layer is re-rendered from its path every time it is drawn,
	// and a shade that changed on each redraw would make a saved picture
	// look different every time it was opened.
	const salt = ( path.size || 1 ) * 7 + 1;
	return ( index ) => {
		let hex = base;
		let alpha = 1;
		if ( ramp ) {
			const hit = sampleStops(
				ramp,
				rampAt( index / last, path.gradientCycles )
			);
			hex = hit.hex;
			alpha = hit.alpha;
		}
		if ( jitter ) {
			let rs =
				( Math.imul( index + ( path.seedOffset || 0 ), 2654435761 ) +
					salt ) &
				0x7fffffff;
			const rnd = () => {
				// Math.imul, NOT `*`. `rs` runs to 2^31 and the multiplier
				// is 2^30, so the plain product reaches 2^61 - past the
				// 2^53 a double holds exactly. The bits that fall off the
				// bottom are precisely the ones the mask keeps, so the
				// generator stayed repeatable while quietly scattering
				// worse than it looked. imul multiplies as 32 bits.
				rs = ( Math.imul( rs, 1103515245 ) + 12345 ) & 0x7fffffff;
				return rs / 0x7fffffff;
			};
			hex = jitterColour( hex, path, rnd );
		}
		return { hex, alpha };
	};
}
