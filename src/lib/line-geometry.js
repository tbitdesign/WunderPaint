/**
 * Line-shape endpoint math (v1.299): a line layer is a rect whose stroke
 * runs along the main diagonal (or the anti-diagonal when `lineFlip`),
 * optionally rotated. These helpers convert between that storage model
 * and the two document-space endpoints the canvas handles let you drag.
 *
 * Leaf module (no editor imports) so it stays unit-testable.
 */

const rotate = ( px, py, cx, cy, deg ) => {
	const rad = ( deg * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const dx = px - cx;
	const dy = py - cy;
	return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
};

/**
 * Document-space endpoints of a line layer, honoring lineFlip and rot.
 *
 * @param {Object} layer { x, y, w, h, rot, lineFlip }.
 * @return {Array} [ p1, p2 ] as { x, y }.
 */
export function lineEndpoints( layer ) {
	const { x, y, w, h } = layer;
	const rot = layer.rot || 0;
	const cx = x + w / 2;
	const cy = y + h / 2;
	const p1 = layer.lineFlip ? { x, y: y + h } : { x, y };
	const p2 = layer.lineFlip ? { x: x + w, y } : { x: x + w, y: y + h };
	if ( ! rot ) {
		return [ p1, p2 ];
	}
	return [
		rotate( p1.x, p1.y, cx, cy, rot ),
		rotate( p2.x, p2.y, cx, cy, rot ),
	];
}

/**
 * Layer patch for a line running between two document-space points. Any
 * previous rotation is absorbed into the rect (rot resets to 0), which
 * keeps the stored model canonical no matter how the line was built.
 *
 * @param {Object} a First endpoint { x, y }.
 * @param {Object} b Second endpoint { x, y }.
 * @return {Object} { x, y, w, h, rot, lineFlip }.
 */
export function lineFromEndpoints( a, b ) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	return {
		x: Math.min( a.x, b.x ),
		y: Math.min( a.y, b.y ),
		w: Math.max( 1, Math.abs( dx ) ),
		h: Math.max( 1, Math.abs( dy ) ),
		rot: 0,
		// Anti-diagonal when the endpoints run up-right / down-left.
		lineFlip: dx * dy < 0,
	};
}

/**
 * Shared arrowhead metrics (v1.300): raster and SVG export draw the
 * same heads from these numbers. `len` is the head length along the
 * line, `half` the half-width, `r` the dot radius, `trim` how far the
 * shaft pulls back so it never pokes past a filled tip.
 *
 * @param {string} kind 'arrow' | 'triangle' | 'circle' | 'bar'.
 * @param {number} lw   Stroke width.
 * @return {Object} { len, half, r, trim }.
 */
export function arrowHeadSpec( kind, lw ) {
	const len = Math.max( 8, lw * 3 );
	return {
		len,
		half: len * 0.55,
		r: Math.max( 3.5, lw * 1.4 ),
		trim: 'triangle' === kind ? len * 0.9 : 0,
	};
}

/** The head kinds the line renderer understands. */
export const ARROW_KINDS = [ 'arrow', 'triangle', 'circle', 'bar' ];

/**
 * Snap a dragged endpoint to 45° steps around the fixed one (Shift).
 *
 * @param {Object} fixed The endpoint that stays put.
 * @param {Object} p     The dragged endpoint.
 * @return {Object} Snapped point { x, y }.
 */
export function snapLineEnd( fixed, p ) {
	const dx = p.x - fixed.x;
	const dy = p.y - fixed.y;
	const r = Math.hypot( dx, dy );
	if ( ! r ) {
		return p;
	}
	const step = Math.PI / 4;
	const a = Math.round( Math.atan2( dy, dx ) / step ) * step;
	return {
		x: fixed.x + r * Math.cos( a ),
		y: fixed.y + r * Math.sin( a ),
	};
}
