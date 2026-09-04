/**
 * An ellipse inside a box as a polygon (v1.429): the selection model
 * holds rectangles and polygons, so the elliptical marquee is a polygon
 * with enough sides to read as a curve.
 *
 * @param {{x:number,y:number,w:number,h:number}} rect Box.
 * @param {number}                                n    Vertices.
 * @return {Array<{x:number,y:number}>} Points, clockwise.
 */
export function ellipsePoints( rect, n = 72 ) {
	const pts = [];
	const cx = rect.x + rect.w / 2;
	const cy = rect.y + rect.h / 2;
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * 2 * Math.PI;
		pts.push( {
			x: cx + ( rect.w / 2 ) * Math.cos( a ),
			y: cy + ( rect.h / 2 ) * Math.sin( a ),
		} );
	}
	return pts;
}
