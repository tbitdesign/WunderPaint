/**
 * Building the stroke path while the hand moves.
 *
 * Smoothing runs a quadratic through the MIDPOINT between two pointer
 * samples, with the previous sample as the control point. That is what
 * turns a polyline of jittery samples into a curve - and it is also why the
 * drawn path always ends half a segment behind the hand.
 *
 * The half segment is fine WHILE drawing. It is not fine when the stroke
 * ends: `closeStroke` pulls the path up to the last pointer position, or
 * every stroke stays permanently short. It shipped without that and read as
 * "the brush lags and then sets".
 */

/**
 * Extend a stroke path by one pointer sample.
 *
 * @param {string} d      Path data so far.
 * @param {Object} prev   Previous sample, { x, y }.
 * @param {Object} p      New sample, { x, y }.
 * @param {boolean} smooth Whether to smooth (false for the pencil).
 * @return {string} The extended path data.
 */
export function appendSmoothed( d, prev, p, smooth ) {
	if ( ! smooth ) {
		return d + ` L ${ p.x } ${ p.y }`;
	}
	const mx = ( prev.x + p.x ) / 2;
	const my = ( prev.y + p.y ) / 2;
	return d + ` Q ${ prev.x } ${ prev.y } ${ mx } ${ my }`;
}

/**
 * Finish a stroke on the point the hand actually reached.
 *
 * When smoothing is enabled, the path ends at a midpoint, not the actual hand
 * position. This function appends a line segment to reach the true endpoint.
 *
 * If the path already ends at `last`, it is returned unchanged (idempotent).
 * If smoothing was disabled, the path already ends at the hand position, so it
 * is returned unchanged. If the stroke never moved (start and end are the same),
 * no change is made.
 *
 * @param {string}  d      Path data.
 * @param {Object}  last   Last pointer sample, { x, y }.
 * @param {boolean} smooth Whether the path was smoothed.
 * @return {string} The closed path data.
 */
export function closeStroke( d, last, smooth ) {
	if ( ! smooth ) {
		return d;
	}

	// Extract the final coordinate from the path.
	const parts = d.trim().split( /\s+/ );
	const finalX = parseFloat( parts[ parts.length - 2 ] );
	const finalY = parseFloat( parts[ parts.length - 1 ] );

	// If the path already ends at the last point, it's already closed.
	if ( finalX === last.x && finalY === last.y ) {
		return d;
	}

	// Otherwise, append a line to the final point.
	return d + ` L ${ last.x } ${ last.y }`;
}
