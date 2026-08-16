/**
 * Stroke smoothing: the PULLED STRING (Procreate calls it StreamLine,
 * Krita a stabilizer). The brush point hangs behind the cursor on a
 * string of a given length; it only moves once the string is taut, and
 * then straight towards the cursor. Corners round off naturally, hand
 * jitter shorter than the string never reaches the paint, and the
 * string's length is the strength dial.
 *
 * This has to happen at the INPUT, live: the wet media deposit paint
 * physically as the stroke happens, so there is no smoothing a stroke
 * after the fact. One pure step, so the maths is testable; the caller
 * owns the state (module-level, NOT React state - a stale draft point
 * was the sun-ray bug).
 */

/**
 * One string step.
 *
 * @param {{x:number,y:number}} pen The brush point (end of the string).
 * @param {{x:number,y:number}} p   The cursor.
 * @param {number}              len String length in document px.
 * @return {{x:number,y:number}|null} The pen's new position, or null when
 *   the string is still slack and the pen does not move.
 */
export function pulledString( pen, p, len ) {
	if ( ! pen || len <= 0 ) {
		return { x: p.x, y: p.y };
	}
	const dx = p.x - pen.x;
	const dy = p.y - pen.y;
	const d = Math.hypot( dx, dy );
	if ( d <= len ) {
		return null;
	}
	const t = ( d - len ) / d;
	return { x: pen.x + dx * t, y: pen.y + dy * t };
}
