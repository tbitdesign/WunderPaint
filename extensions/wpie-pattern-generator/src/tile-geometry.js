/** Shared wrap bounds prevent Canvas/SVG disagreements at repeat boundaries. */
export function shapeBounds( s, aspect = s.aspect || 1 ) {
	if ( s.kind === 'img' ) {
		const c = Math.abs( Math.cos( s.rot || 0 ) ),
			n = Math.abs( Math.sin( s.rot || 0 ) );
		const rx = ( s.s * ( c + aspect * n ) ) / 2,
			ry = ( s.s * ( n + aspect * c ) ) / 2;
		return {
			minX: s.x - rx,
			maxX: s.x + rx,
			minY: s.y - ry,
			maxY: s.y + ry,
		};
	}
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	for ( const p of s.points ) {
		minX = Math.min( minX, p.x );
		minY = Math.min( minY, p.y );
		maxX = Math.max( maxX, p.x );
		maxY = Math.max( maxY, p.y );
	}
	const pad = ( s.width || 0 ) / 2 + 0.001;
	return {
		minX: minX - pad,
		minY: minY - pad,
		maxX: maxX + pad,
		maxY: maxY + pad,
	};
}
export function* wrapOffsets( b, cols, rows ) {
	for (
		let x = Math.ceil( -b.maxX / cols );
		x <= Math.floor( ( cols - b.minX ) / cols );
		x++
	)
		for (
			let y = Math.ceil( -b.maxY / rows );
			y <= Math.floor( ( rows - b.minY ) / rows );
			y++
		)
			yield [ x * cols, y * rows ];
}
