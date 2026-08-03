/**
 * Corner radii, one reading for every surface that rounds a box.
 *
 * `layer.radius` is either a number (all four corners alike) or an
 * [ tl, tr, br, bl ] array (v1.284 for image layers, v1.367 for shapes, so
 * a card can round only the top). Three renderers had to agree on what that
 * means - the canvas (raster/shapes.js, raster/content.js), the vector export
 * (shape-path.js) and the SVG export (svg-io.js) - and they agreed by being
 * copies of each other. This is the single reading they now share.
 *
 * Clamping is per corner at half the box, which is what the image path has
 * always done. It is deliberately NOT the CSS rule (where two radii sharing
 * an edge shrink proportionally): a corner that is already capped at w/2
 * cannot overrun its neighbour, so the simpler rule produces the same picture
 * and keeps the four values independent while a handle is being dragged.
 */

/** The four corners in the order every consumer expects. */
export const CORNERS = [ 'tl', 'tr', 'br', 'bl' ];

/**
 * Read a layer's radius as four clamped numbers.
 *
 * @param {number|number[]} radius A number, an [ tl, tr, br, bl ] array, or
 *                                 anything falsy for "square corners".
 * @param {number}          w      Box width.
 * @param {number}          h      Box height.
 * @return {number[]} [ tl, tr, br, bl ], each >= 0 and <= min( w, h ) / 2.
 */
export function cornerRadii( radius, w, h ) {
	const cap = Math.max( 0, Math.min( w / 2, h / 2 ) );
	const one = ( v ) => {
		const num = Number( v );
		return Number.isFinite( num ) ? Math.max( 0, Math.min( num, cap ) ) : 0;
	};
	if ( Array.isArray( radius ) ) {
		return [
			one( radius[ 0 ] ),
			one( radius[ 1 ] ),
			one( radius[ 2 ] ),
			one( radius[ 3 ] ),
		];
	}
	const r = one( radius );
	return [ r, r, r, r ];
}

/**
 * Does this radius round anything at all? Callers use it to keep the cheap
 * square path (ctx.rect, <rect>) when there is nothing to round.
 *
 * @param {number|number[]} radius Layer radius value.
 * @param {number}          w      Box width.
 * @param {number}          h      Box height.
 * @return {boolean} True when at least one corner is rounded.
 */
export function isRounded( radius, w, h ) {
	return cornerRadii( radius, w, h ).some( ( v ) => v > 0 );
}

/**
 * Are all four corners the same? The exports fall back to their compact form
 * (an SVG <rect rx>) when they are.
 *
 * @param {number|number[]} radius Layer radius value.
 * @return {boolean} True for a plain number or an array of four equal values.
 */
export function isUniform( radius ) {
	if ( ! Array.isArray( radius ) ) {
		return true;
	}
	const [ a, b, c, d ] = radius;
	return a === b && b === c && c === d;
}

/**
 * Write one corner without disturbing the other three, returning the most
 * compact value that still describes the result: a number while the corners
 * agree, an array once they do not. Keeps documents that never touch a single
 * corner byte-identical to how they were saved before v1.367.
 *
 * @param {number|number[]} radius  Current value.
 * @param {number}          index   Corner index, 0..3 in CORNERS order.
 * @param {number}          value   New radius for that corner.
 * @return {number|number[]} The new radius value.
 */
export function withCorner( radius, index, value ) {
	const base = Array.isArray( radius )
		? radius.slice( 0, 4 )
		: [ radius || 0, radius || 0, radius || 0, radius || 0 ];
	while ( base.length < 4 ) {
		base.push( 0 );
	}
	base[ index ] = Math.max( 0, Number( value ) || 0 );
	return isUniform( base ) ? base[ 0 ] : base;
}

/**
 * Scale a radius with its box (document resize, layer scale).
 *
 * @param {number|number[]} radius Current value.
 * @param {number}          factor Scale factor.
 * @return {number|number[]} The scaled radius, keeping number-or-array shape.
 */
export function scaleRadius( radius, factor ) {
	if ( Array.isArray( radius ) ) {
		return radius.map( ( v ) => ( Number( v ) || 0 ) * factor );
	}
	return ( Number( radius ) || 0 ) * factor;
}
