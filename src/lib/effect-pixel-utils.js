/** Shared, alpha-safe sampling for the analog and experimental layer finishes. */
export const clamp = ( v, lo = 0, hi = 1 ) => Math.max( lo, Math.min( hi, v ) );
export const mix = ( a, b, t ) => a + ( b - a ) * t;
export const fract = ( n ) => n - Math.floor( n );
export const smooth = ( a, b, v ) => {
	const t = clamp( ( v - a ) / Math.max( 0.00001, b - a ) );
	return t * t * ( 3 - 2 * t );
};
export const luma = ( c ) =>
	( c[ 0 ] * 0.2126 + c[ 1 ] * 0.7152 + c[ 2 ] * 0.0722 ) / 255;
export const rgb = ( hex ) => {
	const s = /^#[a-f\d]{6}$/i.test( hex || '' ) ? hex.slice( 1 ) : '000000';
	return [ 0, 2, 4 ].map( ( i ) => parseInt( s.slice( i, i + 2 ), 16 ) );
};
export function hash( x, y, seed = 7 ) {
	let h =
		Math.imul( x | 0, 374761393 ) ^
		Math.imul( y | 0, 668265263 ) ^
		Math.imul( seed | 0, 1442695041 );
	h = Math.imul( h ^ ( h >>> 13 ), 1274126177 );
	return ( ( h ^ ( h >>> 16 ) ) >>> 0 ) / 4294967296;
}
export function noise( x, y, seed = 7 ) {
	const ix = Math.floor( x ),
		iy = Math.floor( y );
	const u = smooth( 0, 1, fract( x ) ),
		v = smooth( 0, 1, fract( y ) );
	return mix(
		mix( hash( ix, iy, seed ), hash( ix + 1, iy, seed ), u ),
		mix( hash( ix, iy + 1, seed ), hash( ix + 1, iy + 1, seed ), u ),
		v
	);
}
export const fbm = ( x, y, seed ) =>
	noise( x, y, seed ) * 0.58 +
	noise( x * 2.13, y * 2.13, seed + 19 ) * 0.28 +
	noise( x * 5.7, y * 5.7, seed + 31 ) * 0.14;

/** Content-relative coordinates keep Smart Filter padding from changing a texture. */
export function pixelFrame( image ) {
	const { width, height } = image;
	const source = new Uint8ClampedArray( image.data );
	let left = width,
		top = height,
		right = -1,
		bottom = -1;
	for ( let y = 0; y < height; y++ ) {
		for ( let x = 0; x < width; x++ ) {
			if ( source[ ( y * width + x ) * 4 + 3 ] ) {
				left = Math.min( left, x );
				top = Math.min( top, y );
				right = Math.max( right, x );
				bottom = Math.max( bottom, y );
			}
		}
	}
	const w = Math.max( 1, right - left + 1 ),
		h = Math.max( 1, bottom - top + 1 );
	const frame = {
		image,
		source,
		width,
		height,
		left,
		top,
		w,
		h,
		short: Math.min( w, h ),
		empty: right < left,
	};
	frame.sample = ( x, y, fallback = [ 0, 0, 0 ] ) => {
		// A bake may crop away transparent padding. Outside-content sampling must
		// behave identically with and without that padding.
		if ( x < left || y < top || x > right || y > bottom ) {
			return fallback;
		}
		x = clamp( x, 0, width - 1 );
		y = clamp( y, 0, height - 1 );
		const x0 = Math.floor( x ),
			y0 = Math.floor( y ),
			fx = x - x0,
			fy = y - y0;
		const color = [ 0, 0, 0 ];
		let total = 0;
		for ( let dy = 0; dy < 2; dy++ ) {
			for ( let dx = 0; dx < 2; dx++ ) {
				const i =
					( Math.min( height - 1, y0 + dy ) * width +
						Math.min( width - 1, x0 + dx ) ) *
					4;
				const weight =
					( dx ? fx : 1 - fx ) *
					( dy ? fy : 1 - fy ) *
					source[ i + 3 ];
				total += weight;
				for ( let c = 0; c < 3; c++ ) {
					color[ c ] += source[ i + c ] * weight;
				}
			}
		}
		return total > 0.001 ? color.map( ( c ) => c / total ) : fallback;
	};
	frame.paint = ( intensity, fn ) => {
		const amount = clamp( intensity / 100 );
		if ( ! amount || frame.empty ) {
			return image;
		}
		for ( let y = top; y <= bottom; y++ ) {
			for ( let x = left; x <= right; x++ ) {
				const i = ( y * width + x ) * 4;
				if ( ! source[ i + 3 ] ) {
					continue;
				}
				const base = [ source[ i ], source[ i + 1 ], source[ i + 2 ] ];
				const color = fn(
					x,
					y,
					base,
					( x - left + 0.5 ) / w,
					( y - top + 0.5 ) / h,
					i
				);
				for ( let c = 0; c < 3; c++ ) {
					image.data[ i + c ] = mix( base[ c ], color[ c ], amount );
				}
			}
		}
		return image;
	};
	return frame;
}

/** Jittered cells reused by cracks and droplet refraction, with stable Voronoi edges. */
export function cellular( frame, size, seed ) {
	const cell = Math.max( 2, frame.short * size ),
		cols = Math.ceil( frame.w / cell ) + 4,
		rows = Math.ceil( frame.h / cell ) + 4;
	const points = Array.from(
		{
			length: cols * rows,
		},
		( _, i ) => {
			const x = ( i % cols ) - 2,
				y = Math.floor( i / cols ) - 2;
			return {
				x: ( x + 0.15 + hash( x, y, seed ) * 0.7 ) * cell + frame.left,
				y:
					( y + 0.15 + hash( x, y, seed + 1 ) * 0.7 ) * cell +
					frame.top,
				value: hash( x, y, seed + 3 ),
			};
		}
	);
	return ( x, y ) => {
		const gx = Math.floor( ( x - frame.left ) / cell ) + 2,
			gy = Math.floor( ( y - frame.top ) / cell ) + 2;
		let nearest = Infinity,
			second = Infinity,
			point = points[ 0 ];
		for ( let dy = -1; dy <= 1; dy++ ) {
			for ( let dx = -1; dx <= 1; dx++ ) {
				const p = points[ ( gy + dy ) * cols + gx + dx ];
				const d = ( p.x - x ) ** 2 + ( p.y - y ) ** 2;
				if ( d < nearest ) {
					second = nearest;
					nearest = d;
					point = p;
				} else {
					second = Math.min( second, d );
				}
			}
		}
		return {
			point,
			distance: Math.sqrt( nearest ) / cell,
			edge: ( Math.sqrt( second ) - Math.sqrt( nearest ) ) / cell,
			cell,
		};
	};
}
