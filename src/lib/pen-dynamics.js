/**
 * Pen tilt, as physics rather than as a dial. A stylus reports how far
 * it leans (tiltX/tiltY in degrees); a mouse has no such hardware and
 * reports nothing, so like pen pressure this only ever comes from
 * pointerType 'pen' and everyone else paints upright.
 *
 * What leaning DOES depends on the medium, which is why the response
 * lives here per family and not in one global curve: laying charcoal
 * or pastel on its side is the classic shading grip - a much broader,
 * softer, lighter mark that lets the paper's tooth show. A flatter
 * brush touches with its belly, so the washes get somewhat wider and
 * wetter. A flat knife spreads its load thinner over a wider face.
 */

/**
 * Degrees of lean that count as "flat on the paper". Wacom-class pens
 * report up to ~60 degrees of usable tilt.
 */
const FLAT_DEG = 60;

/**
 * How far the pen leans, 0 (upright) to 1 (flat), from a pointer event.
 *
 * @param {PointerEvent} e The event.
 * @return {number} Lean amount; 0 for anything that is not a pen.
 */
export function penTilt( e ) {
	if ( 'pen' !== e.pointerType ) {
		return 0;
	}
	const deg = Math.hypot( e.tiltX || 0, e.tiltY || 0 );
	return Math.min( 1, deg / FLAT_DEG );
}

/**
 * The medium's answer to a leaning pen.
 *
 * @param {string} family 'liquid' | 'paste' | 'dry'.
 * @param {number} t      Lean amount 0..1.
 * @return {{sizeF:number,wF:number,pF:number,hardF:number}} Multipliers
 *   for stamp size, water/thickness, pigment and edge hardness.
 */
export function tiltFactors( family, t ) {
	if ( ! ( t > 0 ) ) {
		return { sizeF: 1, wF: 1, pF: 1, hardF: 1 };
	}
	if ( 'dry' === family ) {
		// The side of the stick: broad, light and soft-edged, so the
		// tooth of the paper carries the mark.
		return {
			sizeF: 1 + 1.4 * t,
			wF: 1,
			pF: 1 - 0.55 * t,
			hardF: 1 - 0.5 * t,
		};
	}
	if ( 'paste' === family ) {
		// A flat knife face: the same load over more ground.
		return { sizeF: 1 + 0.25 * t, wF: 1 - 0.3 * t, pF: 1, hardF: 1 };
	}
	// The brush belly: wider contact, and it gives up more water.
	return { sizeF: 1 + 0.3 * t, wF: 1 + 0.25 * t, pF: 1, hardF: 1 };
}
