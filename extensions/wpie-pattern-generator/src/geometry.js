/** Small vector vocabulary shared by the motif and ornament builders. */
export const TAU = Math.PI * 2;
export const clamp = ( v, lo, hi ) =>
	Math.max( lo, Math.min( hi, Number.isFinite( +v ) ? +v : lo ) );
export const wrap = ( v ) => ( ( v % 1 ) + 1 ) % 1;
export const path = ( fn, n = 40 ) =>
	Array.from( { length: n + 1 }, ( _, i ) => fn( i / n ) );
export const ellipse = ( x, y, rx, ry = rx, start = 0, end = TAU, n = 40 ) =>
	path(
		( t ) => [
			x + rx * Math.cos( start + t * ( end - start ) ),
			y + ry * Math.sin( start + t * ( end - start ) ),
		],
		n
	);
export const line = ( pts, w = 0.022, closed = false ) => ( {
	pts,
	w,
	closed,
	fill: false,
} );
export const fill = ( pts ) => ( { pts, closed: true, fill: true } );
export const transform = (
	pts,
	x = 0,
	y = 0,
	scale = 1,
	rot = 0,
	sy = scale
) =>
	pts.map( ( [ a, b ] ) => [
		x + a * scale * Math.cos( rot ) - b * sy * Math.sin( rot ),
		y + a * scale * Math.sin( rot ) + b * sy * Math.cos( rot ),
	] );
export const moveGlyph = ( glyph, x, y, scale, rot = 0, sy = scale ) =>
	glyph.map( ( p ) => ( {
		...p,
		pts: transform( p.pts, x, y, scale, rot, sy ),
		w: ( p.w || 0.02 ) * Math.abs( scale ),
	} ) );
export const leaf = ( x, y, size, rot = 0, thin = 0.38 ) =>
	transform(
		path( ( t ) => {
			const a = TAU * t;
			return [
				Math.cos( a ) * 0.5,
				Math.sin( a ) * Math.abs( Math.sin( a ) ) * thin,
			];
		} ),
		x,
		y,
		size,
		rot
	);
export const petal = ( n = 8, r = 0.4, depth = 0.2, phase = 0 ) =>
	path( ( t ) => {
		const a = t * TAU;
		const d = r * ( 1 - depth + depth * Math.cos( n * a + phase ) );
		return [ Math.cos( a ) * d, Math.sin( a ) * d ];
	}, 144 );
export const cubic = ( a, b, c, d, n = 32 ) =>
	path( ( t ) => {
		const u = 1 - t;
		return [
			u ** 3 * a[ 0 ] +
				3 * u * u * t * b[ 0 ] +
				3 * u * t * t * c[ 0 ] +
				t ** 3 * d[ 0 ],
			u ** 3 * a[ 1 ] +
				3 * u * u * t * b[ 1 ] +
				3 * u * t * t * c[ 1 ] +
				t ** 3 * d[ 1 ],
		];
	}, n );
