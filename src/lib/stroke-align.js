/**
 * Stroke position (v1.430): where a shape's stroke sits on its outline.
 * `layer.strokeAlign` is `inside`, `outside` or absent (centred, the way
 * every stroke was drawn before). Closed shapes only: a line has no
 * inside, so it keeps a centred stroke whatever the field says.
 */

export const STROKE_ALIGNS = [ 'center', 'inside', 'outside' ];

/**
 * @param {Object} layer Shape layer.
 * @return {string} center | inside | outside.
 */
export function strokeAlignOf( layer ) {
	if ( ! layer || 'line' === layer.shape ) {
		return 'center';
	}
	return 'inside' === layer.strokeAlign || 'outside' === layer.strokeAlign
		? layer.strokeAlign
		: 'center';
}

/** Line caps and joins a stroke may ask for (v1.429). */
export const STROKE_CAPS = [ 'butt', 'round', 'square' ];
export const STROKE_JOINS = [ 'miter', 'round', 'bevel' ];

/**
 * The cap to draw with: the layer's own when set, else the caller's
 * default (round for path shapes, flat for the legacy maths shapes, so
 * old documents paint as they always did).
 *
 * @param {Object} layer    Shape layer.
 * @param {string} fallback Default cap.
 * @return {string} butt | round | square.
 */
export function strokeCapOf( layer, fallback = 'round' ) {
	return STROKE_CAPS.includes( layer?.strokeCap )
		? layer.strokeCap
		: fallback;
}

/**
 * @param {Object} layer    Shape layer.
 * @param {string} fallback Default join.
 * @return {string} miter | round | bevel.
 */
export function strokeJoinOf( layer, fallback = 'round' ) {
	return STROKE_JOINS.includes( layer?.strokeJoin )
		? layer.strokeJoin
		: fallback;
}
