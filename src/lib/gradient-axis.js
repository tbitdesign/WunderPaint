/**
 * Where a layer's gradient actually runs (v1.369).
 *
 * A gradient fill is stored as an angle plus a list of stops, and the
 * renderer turns that into a line across the layer box. Until now the only
 * way to change it was a slider on the far side of the screen and a colour
 * bar that had nothing to do with the artwork underneath it: you set 40
 * degrees, looked at the canvas, went back, tried 55.
 *
 * This module answers the question the on-canvas handles need - "where does
 * this gradient begin and end, and where does each stop sit" - using the
 * SAME maths as gradientFillFor() in raster/patterns.js. If the two ever
 * disagree, the handles would sit beside the colours they claim to control,
 * which is worse than no handles at all, so the arithmetic is shared by
 * being written down once here and tested against the renderer.
 */

/** Gradient kinds that run along a straight axis. */
const LINEAR_KINDS = [ 'linear', '', undefined, null ];

/**
 * Does this layer paint a gradient we can offer handles for?
 *
 * @param {Object} layer Any layer.
 * @return {boolean} True for a layer filled with a gradient.
 */
export function hasGradientFill( layer ) {
	if ( ! layer || 'shape' !== layer.type ) {
		return false;
	}
	const fillType =
		layer.fillType ||
		( layer.pattern && 'none' !== layer.pattern ? 'pattern' : 'solid' );
	return (
		'gradient' === fillType &&
		Array.isArray( layer.gradientStops ) &&
		layer.gradientStops.length > 0
	);
}

/**
 * The gradient's axis in LAYER coordinates (0..w, 0..h).
 *
 * Linear gradients run through the centre at `gradientAngle`, reaching the
 * box edge - the half-length below is the projection of the box onto the
 * gradient direction, which is exactly what the renderer uses. Radial and
 * conic gradients have no start point of their own, so their axis runs from
 * the centre outward; dragging it still means "which way round", which is
 * what a conic gradient needs and what a radial one ignores.
 *
 * @param {Object} layer Gradient-filled layer.
 * @return {Object} { a, b, centre, radial } in layer coordinates.
 */
export function gradientAxis( layer ) {
	const w = Math.max( 1, layer.w || 1 );
	const h = Math.max( 1, layer.h || 1 );
	const cx = w / 2;
	const cy = h / 2;
	const rad = ( ( layer.gradientAngle || 0 ) * Math.PI ) / 180;
	const dx = Math.cos( rad );
	const dy = Math.sin( rad );
	const radial = ! LINEAR_KINDS.includes( layer.gradientKind );
	if ( radial ) {
		const r = Math.max( w, h ) / 2;
		return {
			a: { x: cx, y: cy },
			b: { x: cx + dx * r, y: cy + dy * r },
			centre: { x: cx, y: cy },
			radial: true,
		};
	}
	const half = ( Math.abs( dx ) * w + Math.abs( dy ) * h ) / 2;
	return {
		a: { x: cx - dx * half, y: cy - dy * half },
		b: { x: cx + dx * half, y: cy + dy * half },
		centre: { x: cx, y: cy },
		radial: false,
	};
}

/**
 * Each stop's point on the axis.
 *
 * @param {Object} layer Gradient-filled layer.
 * @return {Array} [ { index, at, color, x, y } ] in layer coordinates.
 */
export function gradientStopPoints( layer ) {
	const { a, b } = gradientAxis( layer );
	return ( layer.gradientStops || [] ).map( ( stop, index ) => {
		const at = Math.max( 0, Math.min( Number( stop.at ) || 0, 1 ) );
		return {
			index,
			at,
			color: stop.color,
			x: a.x + ( b.x - a.x ) * at,
			y: a.y + ( b.y - a.y ) * at,
		};
	} );
}

/**
 * Turn a pointer position into a stop offset by projecting it onto the axis.
 *
 * @param {Object} layer Gradient-filled layer.
 * @param {Object} p     Pointer in layer coordinates.
 * @return {number} Offset, 0..1.
 */
export function offsetAtPoint( layer, p ) {
	const { a, b } = gradientAxis( layer );
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	if ( ! len2 ) {
		return 0;
	}
	const t = ( ( p.x - a.x ) * vx + ( p.y - a.y ) * vy ) / len2;
	return Math.max( 0, Math.min( t, 1 ) );
}

/**
 * Turn a pointer position into a gradient angle.
 *
 * @param {Object}  layer Gradient-filled layer.
 * @param {Object}  p     Pointer in layer coordinates.
 * @param {boolean} snap  Snap to 15 degree steps.
 * @return {number} Angle in degrees, -180..180.
 */
export function angleAtPoint( layer, p, snap = false ) {
	const { centre } = gradientAxis( layer );
	let deg = ( Math.atan2( p.y - centre.y, p.x - centre.x ) * 180 ) / Math.PI;
	if ( snap ) {
		deg = Math.round( deg / 15 ) * 15;
	}
	return Math.round( ( ( ( ( deg + 180 ) % 360 ) + 360 ) % 360 ) - 180 );
}

/**
 * Move one stop to a new offset, keeping the list sorted by position.
 *
 * Sorting matters: addColorStop does not care about order, but the colour
 * bar in the panel reads the list as drawn, and a stop dragged past its
 * neighbour would swap places there and nowhere else.
 *
 * @param {Array}  stops Current stops.
 * @param {number} index Stop to move.
 * @param {number} at    New offset, 0..1.
 * @return {Array} The new stop list.
 */
export function withStopAt( stops, index, at ) {
	const next = ( stops || [] ).map( ( s, i ) =>
		i === index ? { ...s, at: Math.max( 0, Math.min( at, 1 ) ) } : s
	);
	return next.sort( ( x, y ) => ( x.at || 0 ) - ( y.at || 0 ) );
}
