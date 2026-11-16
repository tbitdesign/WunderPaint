/**
 * Smooth rounds, sharp corners (v1.22).
 *
 * three's ExtrudeGeometry is built without an index, so every triangle
 * keeps its own flat normal: the side wall of an O, an S or a G, and
 * every step of a bevel, shaded as a row of flat facets. On chrome and
 * gold - the looks people pick most - those facets read as stepped
 * stripes of light.
 *
 * Here the side walls and the bevel take creased normals: faces that meet
 * at less than the crease angle share a normal, so a round stays round,
 * while a real corner (the 90 degrees of an E, a T, a cap meeting an
 * unbevelled side) stays sharp. The caps - group 0 of an extrusion, the
 * letter's large flat face - keep their own flat normals: a smoothed cap
 * edge would tilt the normal across the whole face triangle and blotch it.
 */
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Above the 22.5 degrees between the four steps of a classic bevel, well
// below any corner a letter means to have.
export const SMOOTH_ANGLE = ( 30 * Math.PI ) / 180;

/**
 * Creased normals for the side walls and bevels of an extrusion, flat
 * caps kept. Works in place on a non-indexed geometry (an extrusion is
 * one) and returns it.
 *
 * @param {THREE.BufferGeometry} geo
 * @param {number} [angle] crease angle in radians
 * @return {THREE.BufferGeometry} the geometry
 */
export function smoothSides( geo, angle = SMOOTH_ANGLE ) {
	if ( ! geo || ! geo.getAttribute( 'position' ) ) {
		return geo;
	}
	if ( ! geo.getAttribute( 'normal' ) ) {
		geo.computeVertexNormals();
	}
	const flat = geo.getAttribute( 'normal' ).array.slice();
	const out = toCreasedNormals( geo, angle );
	const n = out.getAttribute( 'normal' );
	if ( out === geo ) {
		for ( const g of geo.groups ) {
			if ( 0 === g.materialIndex ) {
				const end = Math.min( g.start + g.count, n.count );
				n.array.set( flat.subarray( g.start * 3, end * 3 ), g.start * 3 );
			}
		}
		n.needsUpdate = true;
	}
	return out;
}

/**
 * Curve and bevel detail: the preview stays light, a bake ("fine") takes
 * enough segments that a letter filling the picture has no visible
 * polygon edge along its silhouette or across its bevel.
 */
export const DETAIL = {
	curves: 10,
	curvesFine: 24,
	bevel: 4,
	bevelFine: 8,
};
