/**
 * Small helpers for writing figures by hand.
 *
 * Figures are authored on the folded result: you decide where a crease
 * runs on the sheet as it lies in front of you, and these helpers carry
 * that line down through the layers - a layer that was folded across a
 * line carries the mirror image of every later crease that crosses it.
 */

/**
 * Reflection across the line through a and b, as a point function.
 *
 * @param {Array} a Line point [x, y].
 * @param {Array} b Line point [x, y].
 * @return {Function} ( [x, y] ) => [x, y].
 */
export function mirrorAcross( a, b ) {
	const dx = b[ 0 ] - a[ 0 ];
	const dy = b[ 1 ] - a[ 1 ];
	const len2 = dx * dx + dy * dy;
	return ( p ) => {
		const vx = p[ 0 ] - a[ 0 ];
		const vy = p[ 1 ] - a[ 1 ];
		const d = ( 2 * ( vx * dx + vy * dy ) ) / len2;
		return [ a[ 0 ] + d * dx - vx, a[ 1 ] + d * dy - vy ];
	};
}

/** Map a whole polygon (keeps winding by reversing the order). */
export function mirrorPoly( a, b, pts ) {
	const m = mirrorAcross( a, b );
	return pts.map( m ).reverse();
}

/** Shorthand for a straight crease entry. */
export const line = ( x1, y1, x2, y2 ) => [
	[ x1, y1 ],
	[ x2, y2 ],
];

/**
 * Where a compiler piece currently lies: the centroid of its paper
 * polygon pushed through its layout transform. For `layers` predicates
 * that pick pieces by POSITION on the folded sheet ("everything on the
 * wing side of this line"), where the stack height alone cannot say.
 *
 * @param {Object} p A compiler piece ({ paper, m }).
 * @return {Array} [x, y] on the folded layout.
 */
export function foldedCentroid( p ) {
	let x = 0;
	let y = 0;
	for ( const q of p.paper ) {
		x += q[ 0 ];
		y += q[ 1 ];
	}
	x /= p.paper.length;
	y /= p.paper.length;
	return [
		p.m.xx * x + p.m.xy * y + p.m.tx,
		p.m.yx * x + p.m.yy * y + p.m.ty,
	];
}

/** Which side of the line a-b a point lies on: +1 left, -1 right. */
export const sideOf = ( [ a, b ], p ) =>
	Math.sign(
		( b[ 0 ] - a[ 0 ] ) * ( p[ 1 ] - a[ 1 ] ) -
			( b[ 1 ] - a[ 1 ] ) * ( p[ 0 ] - a[ 0 ] )
	);
