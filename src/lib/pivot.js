/**
 * The point a layer turns around (v1.370).
 *
 * Rotation has always used the middle of the box, which is the right
 * default and the wrong answer for a whole class of work: a hand on a
 * clock face, a petal in a flower, a name around a seal. Those turn around
 * a point somewhere else, and without one you are left duplicating and
 * nudging by hand.
 *
 * The pivot is stored in UNIT space - a fraction of the box, ( 0.5, 0.5 )
 * being the centre - so it survives every move and resize without being
 * touched, and values outside 0..1 are perfectly legal (a pivot beside the
 * layer is what makes an orbit). It rides along with the layer's own
 * rotation, because a pivot that stayed axis-aligned while its layer turned
 * would wander off the feature it was placed on.
 *
 * Nothing here changes how a layer is RENDERED. The renderer still turns
 * every layer about its centre; an off-centre pivot is honoured by the
 * gesture, which spins the layer and orbits its centre at the same time -
 * the same two-part move the group rotation has always made.
 */

/** The centre in unit space, i.e. no pivot at all. */
export const PIVOT_CENTRE = { u: 0.5, v: 0.5 };

/** Rotate ( x, y ) around ( cx, cy ) by `deg`. */
function turn( x, y, cx, cy, deg ) {
	const rad = ( deg * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const dx = x - cx;
	const dy = y - cy;
	return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
}

/**
 * Is this layer turning around something other than its middle?
 *
 * @param {Object} layer Any layer.
 * @return {boolean} True when a pivot has been moved off centre.
 */
export function hasPivot( layer ) {
	const p = layer && layer.pivot;
	return (
		!! p &&
		Number.isFinite( p.u ) &&
		Number.isFinite( p.v ) &&
		( Math.abs( p.u - 0.5 ) > 0.001 || Math.abs( p.v - 0.5 ) > 0.001 )
	);
}

/**
 * The pivot in DOCUMENT coordinates, following the layer's own rotation.
 *
 * @param {Object} layer Any layer.
 * @return {Object} { x, y } - the box centre when no pivot is set.
 */
export function pivotPoint( layer ) {
	const w = layer.w || 0;
	const h = layer.h || 0;
	const cx = ( layer.x || 0 ) + w / 2;
	const cy = ( layer.y || 0 ) + h / 2;
	const p = layer.pivot;
	if ( ! p || ! Number.isFinite( p.u ) || ! Number.isFinite( p.v ) ) {
		return { x: cx, y: cy };
	}
	const flat = {
		x: ( layer.x || 0 ) + p.u * w,
		y: ( layer.y || 0 ) + p.v * h,
	};
	return layer.rot ? turn( flat.x, flat.y, cx, cy, layer.rot ) : flat;
}

/**
 * The pivot in the layer's own unrotated space, for drawing the grip inside
 * the selection frame (which is already rotated by CSS).
 *
 * @param {Object} layer Any layer.
 * @return {Object} { x, y } in layer coordinates, 0..w / 0..h.
 */
export function pivotLocal( layer ) {
	const p = layer && layer.pivot;
	const u = p && Number.isFinite( p.u ) ? p.u : 0.5;
	const v = p && Number.isFinite( p.v ) ? p.v : 0.5;
	return { x: u * ( layer.w || 0 ), y: v * ( layer.h || 0 ) };
}

/**
 * Turn a point in the layer's unrotated space into a stored pivot.
 *
 * A pivot far outside the box is legal - that is how you orbit - but it is
 * kept within a few box widths so a slip of the hand cannot park it in
 * another postcode where the grip is no longer reachable.
 *
 * @param {Object} layer Any layer.
 * @param {Object} p     Point in layer coordinates.
 * @return {Object} { u, v }.
 */
export function pivotFromLocal( layer, p ) {
	const w = layer.w || 1;
	const h = layer.h || 1;
	const clamp = ( v ) => Math.max( -3, Math.min( v, 4 ) );
	return { u: clamp( p.x / w ), v: clamp( p.y / h ) };
}

/**
 * Where a layer ends up after turning `deg` around its pivot: the box
 * orbits the pivot AND the layer spins by the same angle.
 *
 * @param {Object} layer Layer as it was when the gesture started.
 * @param {Object} pivot Pivot in document coordinates.
 * @param {number} deg   Angle to turn by.
 * @return {Object} { x, y, rot } patch.
 */
export function rotateAbout( layer, pivot, deg ) {
	const w = layer.w || 0;
	const h = layer.h || 0;
	const cx = ( layer.x || 0 ) + w / 2;
	const cy = ( layer.y || 0 ) + h / 2;
	const c = turn( cx, cy, pivot.x, pivot.y, deg );
	const rot = ( layer.rot || 0 ) + deg;
	return {
		x: c.x - w / 2,
		y: c.y - h / 2,
		rot: ( ( ( ( rot + 180 ) % 360 ) + 360 ) % 360 ) - 180,
	};
}

/**
 * Copies of a layer arranged around its pivot.
 *
 * `span` is the total angle the copies cover. A full 360 leaves no gap
 * between the last copy and the original, which is what a rosette needs;
 * anything less fans them out and keeps both ends.
 *
 * @param {Object}  layer   The layer to repeat.
 * @param {Object}  pivot   Pivot in document coordinates.
 * @param {number}  count   Total number of copies INCLUDING the original.
 * @param {number}  span    Total angle in degrees.
 * @param {boolean} upright Keep every copy at the original angle.
 * @return {Array} [ { x, y, rot } ] for the copies after the first.
 */
export function radialLayout( layer, pivot, count, span, upright = false ) {
	const n = Math.max( 2, Math.round( count ) || 2 );
	const full = Math.abs( span ) >= 359.9;
	const step = full ? span / n : span / ( n - 1 );
	const out = [];
	for ( let i = 1; i < n; i++ ) {
		const placed = rotateAbout( layer, pivot, step * i );
		out.push( upright ? { ...placed, rot: layer.rot || 0 } : placed );
	}
	return out;
}
