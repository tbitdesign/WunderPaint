/** Pure polygon helpers. Each stamp is independently unioned, rings inside it use even-odd. */
export const TAU = Math.PI * 2;
export const ellipse = ( x, y, rx, ry = rx, n = 40, rot = 0 ) =>
	Array.from( { length: n }, ( _, i ) => {
		const a = ( i * TAU ) / n,
			dx = Math.cos( a ) * rx,
			dy = Math.sin( a ) * ry;
		return [
			x + dx * Math.cos( rot ) - dy * Math.sin( rot ),
			y + dx * Math.sin( rot ) + dy * Math.cos( rot ),
		];
	} );
export const rect = ( x, y, w, h ) => [
	[ x, y ],
	[ x + w, y ],
	[ x + w, y + h ],
	[ x, y + h ],
];
export const mapStamps = ( stamps, fn ) =>
	stamps.map( ( s ) => s.map( ( r ) => r.map( fn ) ) );
export const star = ( x, y, r, inner = 0.5, n = 5, rot = -Math.PI / 2 ) =>
	Array.from( { length: n * 2 }, ( _, i ) => {
		const a = rot + ( i * Math.PI ) / n,
			d = r * ( i % 2 ? inner : 1 );
		return [ x + Math.cos( a ) * d, y + Math.sin( a ) * d ];
	} );
/** Tapered ribbon along a sampled centerline; widths are half widths. */
export function ribbon( points, width, end = width ) {
	const left = [],
		right = [];
	points.forEach( ( [ x, y ], i ) => {
		const a = points[ Math.max( 0, i - 1 ) ],
			b = points[ Math.min( points.length - 1, i + 1 ) ];
		const dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ],
			len = Math.hypot( dx, dy ) || 1;
		const d = width + ( ( end - width ) * i ) / ( points.length - 1 );
		left.push( [ x - ( dy / len ) * d, y + ( dx / len ) * d ] );
		right.push( [ x + ( dy / len ) * d, y - ( dx / len ) * d ] );
	} );
	return [ ...left, ...right.reverse() ];
}
export function leaf( x, y, tx, ty, width = 0.1, lobes = 0 ) {
	const dx = tx - x,
		dy = ty - y,
		len = Math.hypot( dx, dy ) || 1,
		side = [];
	for ( let i = 0; i <= 24; i++ ) {
		const t = i / 24,
			b =
				Math.pow( Math.sin( t * Math.PI ), 0.8 ) *
				width *
				( 1 + lobes * Math.sin( t * 10 * Math.PI ) );
		side.push( [
			x + dx * t - ( dy / len ) * b,
			y + dy * t + ( dx / len ) * b,
		] );
	}
	for ( let i = 24; i >= 0; i-- ) {
		const t = i / 24,
			b =
				Math.pow( Math.sin( t * Math.PI ), 0.8 ) *
				width *
				( 1 + lobes * Math.sin( t * 10 * Math.PI ) );
		side.push( [
			x + dx * t + ( dy / len ) * b,
			y + dy * t - ( dx / len ) * b,
		] );
	}
	return side;
}
export const stem = ( x, y, tx, ty, width = 0.018 ) =>
	ribbon(
		[
			[ x, y ],
			[ tx, ty ],
		],
		width,
		width * 0.48
	);
export function blossom( x, y, r, petals = 5, inner = 0.62 ) {
	return Array.from( { length: petals * 12 }, ( _, i ) => {
		const a = ( i * TAU ) / ( petals * 12 ),
			d =
				r *
				( inner +
					( 1 - inner ) * ( 0.5 + 0.5 * Math.cos( petals * a ) ) );
		return [ x + Math.cos( a ) * d, y + Math.sin( a ) * d ];
	} );
}
/** Fit a locally authored window into its available rectangle without changing its aspect. */
export function fitWindow( stamps, cx, cy, rx, ry ) {
	const pts = stamps.flat( 2 ),
		xs = pts.map( ( p ) => p[ 0 ] ),
		ys = pts.map( ( p ) => p[ 1 ] );
	const x0 = Math.min( ...xs ),
		x1 = Math.max( ...xs ),
		y0 = Math.min( ...ys ),
		y1 = Math.max( ...ys );
	return mapStamps( stamps, ( [ x, y ] ) => [
		cx + ( ( x - ( x0 + x1 ) / 2 ) * 2 * rx ) / ( x1 - x0 ),
		cy + ( ( y - ( y0 + y1 ) / 2 ) * 2 * ry ) / ( y1 - y0 ),
	] );
}

/** Curved leaf with a broad middle and pointed ends along a quadratic spine. */
export function curvedLeaf( x, y, cx, cy, tx, ty, width ) {
	const left = [],
		right = [];
	for ( let i = 0; i <= 32; i++ ) {
		const t = i / 32,
			u = 1 - t,
			px = u * u * x + 2 * u * t * cx + t * t * tx,
			py = u * u * y + 2 * u * t * cy + t * t * ty;
		const dx = 2 * u * ( cx - x ) + 2 * t * ( tx - cx ),
			dy = 2 * u * ( cy - y ) + 2 * t * ( ty - cy ),
			len = Math.hypot( dx, dy ) || 1,
			d = Math.sin( t * Math.PI ) * width;
		left.push( [ px - ( dy / len ) * d, py + ( dx / len ) * d ] );
		right.push( [ px + ( dy / len ) * d, py - ( dx / len ) * d ] );
	}
	return [ ...left, ...right.reverse() ];
}
