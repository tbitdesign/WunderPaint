/** Original procedural pixel finishes. No DOM, external assets or global random state. */
const clamp = ( v, lo = 0, hi = 1 ) => Math.max( lo, Math.min( hi, v ) );
const fract = ( v ) => v - Math.floor( v );
const mix = ( a, b, t ) => a.map( ( n, k ) => n + ( b[ k ] - n ) * clamp( t ) );
const rgb = ( value, fallback ) => {
	const hex = /^#([0-9a-f]{6})/i.exec( value || fallback );
	return hex
		? [ 0, 2, 4 ].map( ( i ) => parseInt( hex[ 1 ].slice( i, i + 2 ), 16 ) )
		: [ 240, 230, 215 ];
};
const hash = ( x, y, seed ) =>
	fract( Math.sin( x * 127.1 + y * 311.7 + seed * 74.7 ) * 43758.5453 );
const smooth = ( v ) => v * v * ( 3 - 2 * v );
const noise = ( x, y, seed ) => {
	const ix = Math.floor( x ),
		iy = Math.floor( y ),
		tx = smooth( fract( x ) ),
		ty = smooth( fract( y ) );
	return (
		( hash( ix, iy, seed ) * ( 1 - tx ) + hash( ix + 1, iy, seed ) * tx ) *
			( 1 - ty ) +
		( hash( ix, iy + 1, seed ) * ( 1 - tx ) +
			hash( ix + 1, iy + 1, seed ) * tx ) *
			ty
	);
};
const shade = ( a, light ) => a.map( ( n ) => n * light );
const luma = ( p ) =>
	( p[ 0 ] * 0.2126 + p[ 1 ] * 0.7152 + p[ 2 ] * 0.0722 ) / 255;
const WARM = [ 255, 239, 207 ],
	COOL = [ 83, 204, 224 ];
const EDGE_MODES = new Set( [
	'engraved-lines',
	'crosshatch',
	'woodcut',
	'linocut',
	'relief-carving',
	'chrome-relief',
	'ceramic-glaze',
	'neon-edges',
	'luminous-contours',
	'contour-echo',
	'melted-ink',
] );
const BLUR_MODES = new Set( [
	'soft-bloom',
	'highlight-halation',
	'diffusion-veil',
	'chroma-aura',
] );

/** A tint/texture finish retains the source silhouette, including its holes and antialiased edges. */
export function applyCreativeEffect( image, mode, params = {}, helpers = {} ) {
	const { width: w, height: h, data: d } = image;
	const amount = clamp( ( params.intensity ?? 75 ) / 100 );
	if ( ! amount || ! w || ! h ) {
		return image;
	}
	const src = new Uint8ClampedArray( d );
	let x0 = w,
		y0 = h,
		x1 = -1,
		y1 = -1;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( src[ ( y * w + x ) * 4 + 3 ] ) {
				x0 = Math.min( x0, x );
				y0 = Math.min( y0, y );
				x1 = Math.max( x1, x );
				y1 = Math.max( y1, y );
			}
		}
	}
	if ( x1 < x0 ) {
		return image;
	}
	const bw = x1 - x0 + 1,
		bh = y1 - y0 + 1,
		short = Math.max( 1, Math.min( bw, bh ) );
	const scale = clamp( params.scale ?? 35, 2, 100 ),
		cell = Math.max( 2, short * ( 0.004 + scale * 0.0008 ) );
	const angle = ( ( params.angle ?? 35 ) * Math.PI ) / 180,
		ca = Math.cos( angle ),
		sa = Math.sin( angle ),
		seed = params.seed ?? 7;
	const ink = rgb( params.ink, '#18384d' ),
		paper = rgb( params.paper, '#f5dfae' );
	// Premultiplied interpolation: hidden colors in transparent pixels never tint an edge.
	const sample = ( x, y, fallback ) => {
		x = clamp( x, x0, x1 );
		y = clamp( y, y0, y1 );
		const xx = Math.floor( x ),
			yy = Math.floor( y ),
			tx = x - xx,
			ty = y - yy;
		const ids = [
			( yy * w + xx ) * 4,
			( yy * w + Math.min( x1, xx + 1 ) ) * 4,
			( Math.min( y1, yy + 1 ) * w + xx ) * 4,
			( Math.min( y1, yy + 1 ) * w + Math.min( x1, xx + 1 ) ) * 4,
		];
		const weights = [
			( 1 - tx ) * ( 1 - ty ),
			tx * ( 1 - ty ),
			( 1 - tx ) * ty,
			tx * ty,
		];
		const result = [ 0, 0, 0 ];
		let total = 0;
		for ( let n = 0; n < 4; n++ ) {
			const a = ( weights[ n ] * src[ ids[ n ] + 3 ] ) / 255;
			total += a;
			for ( let k = 0; k < 3; k++ ) {
				result[ k ] += src[ ids[ n ] + k ] * a;
			}
		}
		return total > 0.0001 ? result.map( ( c ) => c / total ) : fallback;
	};
	let field = null;
	if ( EDGE_MODES.has( mode ) ) {
		field = new Float32Array( w * h );
		for ( let j = 0; j < field.length; j++ ) {
			const i = j * 4;
			field[ j ] =
				( ( ( src[ i ] * 0.2126 +
					src[ i + 1 ] * 0.7152 +
					src[ i + 2 ] * 0.0722 ) /
					255 ) *
					src[ i + 3 ] ) /
				255;
		}
	}
	let blurred = null;
	if ( BLUR_MODES.has( mode ) ) {
		blurred = { width: w, height: h, data: new Uint8ClampedArray( src ) };
		if ( mode !== 'diffusion-veil' ) {
			for ( let i = 0; i < blurred.data.length; i += 4 ) {
				const v = luma( src.subarray( i, i + 3 ) ),
					m = clamp( ( v - 0.45 ) / 0.5 );
				blurred.data[ i + 3 ] *= m;
			}
		}
		helpers.gaussianBlur( blurred, {
			radius: Math.max( 0.5, cell * 0.55 ),
		} );
	}
	let sorted = null;
	if ( mode === 'pixel-sorting' ) {
		sorted = new Uint8ClampedArray( src );
		const run = Math.max( 4, Math.round( cell * 6 ) );
		for ( let y = y0; y <= y1; y++ ) {
			for ( let x = x0; x <= x1; x += run ) {
				const indices = [];
				for ( let xx = x; xx < Math.min( x1 + 1, x + run ); xx++ ) {
					const i = ( y * w + xx ) * 4;
					if ( src[ i + 3 ] ) {
						indices.push( i );
					}
				}
				const ordered = indices
					.slice()
					.sort(
						( a, b ) =>
							src[ a ] +
							src[ a + 1 ] * 2 +
							src[ a + 2 ] -
							( src[ b ] + src[ b + 1 ] * 2 + src[ b + 2 ] )
					);
				indices.forEach( ( i, n ) => {
					for ( let k = 0; k < 3; k++ ) {
						sorted[ i + k ] = src[ ordered[ n ] + k ];
					}
				} );
			}
		}
	}
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const i = ( y * w + x ) * 4;
			if ( ! src[ i + 3 ] ) {
				continue;
			}
			const base = [ src[ i ], src[ i + 1 ], src[ i + 2 ] ],
				l = luma( base );
			const u = ( x - x0 ) / bw,
				v = ( y - y0 ) / bh,
				xx = x - x0,
				yy = y - y0;
			const ax = ( xx * ca + yy * sa ) / cell,
				ay = ( -xx * sa + yy * ca ) / cell;
			const qx = fract( ax ) - 0.5,
				qy = fract( ay ) - 0.5,
				n = noise( xx / cell, yy / cell, seed );
			let gx = 0,
				gy = 0;
			if ( field ) {
				const j = y * w + x;
				gx =
					( x + 1 < w ? field[ j + 1 ] : 0 ) -
					( x > 0 ? field[ j - 1 ] : 0 );
				gy =
					( y + 1 < h ? field[ j + w ] : 0 ) -
					( y > 0 ? field[ j - w ] : 0 );
				if ( ! Number.isFinite( field[ j ] ) ) {
					continue;
				}
			}
			const edge = clamp( Math.hypot( gx, gy ) * ( 1 + scale / 12 ) );
			let out = base;
			switch ( mode ) {
				case 'prism-split': {
					const a = sample( x + ca * cell, y + sa * cell, base ),
						b = sample( x - ca * cell, y - sa * cell, base );
					out = [ a[ 0 ], base[ 1 ], b[ 2 ] ];
					break;
				}
				case 'radial-spectrum': {
					const dx = x - x0 - bw * 0.5,
						dy = y - y0 - bh * 0.5,
						r = Math.hypot( dx / bw, dy / bh );
					const a = sample(
							x + ( dx * r * scale ) / 380,
							y + ( dy * r * scale ) / 380,
							base
						),
						b = sample(
							x - ( dx * r * scale ) / 380,
							y - ( dy * r * scale ) / 380,
							base
						);
					out = [ a[ 0 ], base[ 1 ], b[ 2 ] ];
					break;
				}
				case 'fresnel-glass': {
					const dx = xx - bw / 2,
						dy = yy - bh / 2,
						r = Math.hypot( dx, dy ),
						t = r / cell;
					const bend = Math.sin( t * 6.283 ) * cell * 0.45;
					out = shade(
						sample(
							x + ( dx / ( r || 1 ) ) * bend,
							y + ( dy / ( r || 1 ) ) * bend,
							base
						),
						0.88 + fract( t ) * 0.3
					);
					break;
				}
				case 'frosted-glass': {
					out = mix(
						sample(
							x + ( hash( xx, yy, seed ) - 0.5 ) * cell * 2,
							y + ( hash( yy, xx, seed + 3 ) - 0.5 ) * cell * 2,
							base
						),
						WARM,
						0.1 + n * 0.08
					);
					break;
				}
				case 'ribbed-glass': {
					const bend = Math.sin( ax * 6.283 ) * cell * 0.55;
					out = shade(
						sample( x + ca * bend, y + sa * bend, base ),
						0.72 +
							Math.pow(
								Math.max( 0, Math.cos( ax * 6.283 ) ),
								4
							) *
								0.8
					);
					break;
				}
				case 'lens-mosaic': {
					const cx =
							Math.floor( xx / ( cell * 3 ) ) * cell * 3 +
							cell * 1.5,
						cy =
							Math.floor( yy / ( cell * 3 ) ) * cell * 3 +
							cell * 1.5;
					const dx = ( xx - cx ) / ( cell * 1.5 ),
						dy = ( yy - cy ) / ( cell * 1.5 ),
						r = Math.hypot( dx, dy );
					out = mix(
						shade(
							sample(
								x0 + cx + dx * cell * ( 0.6 + r * 0.55 ),
								y0 + cy + dy * cell * ( 0.6 + r * 0.55 ),
								base
							),
							0.88 + 0.25 * ( 1 - r )
						),
						WARM,
						Math.exp( -Math.pow( ( r - 0.86 ) * 20, 2 ) ) * 0.65
					);
					break;
				}
				case 'crystal-facets':
				case 'mosaic-shards': {
					let best = Infinity,
						second = Infinity,
						bx = 0,
						by = 0,
						key = 0;
					const size = cell * 3,
						ix = Math.floor( xx / size ),
						iy = Math.floor( yy / size );
					for ( let oy = -1; oy <= 1; oy++ ) {
						for ( let ox = -1; ox <= 1; ox++ ) {
							const px =
									( ix +
										ox +
										hash( ix + ox, iy + oy, seed ) ) *
									size,
								py =
									( iy +
										oy +
										hash( ix + ox, iy + oy, seed + 5 ) ) *
									size,
								ds = ( px - xx ) ** 2 + ( py - yy ) ** 2;
							if ( ds < best ) {
								second = best;
								best = ds;
								bx = px;
								by = py;
								key = hash( ix + ox, iy + oy, seed + 9 );
							} else {
								second = Math.min( second, ds );
							}
						}
					}
					const seam = clamp(
						( Math.sqrt( second ) - Math.sqrt( best ) ) /
							Math.max( 1, size * 0.035 )
					);
					out =
						mode === 'crystal-facets'
							? shade(
									sample(
										x + ( bx - xx ) * 0.25,
										y + ( by - yy ) * 0.25,
										base
									),
									0.72 + key * 0.55
							  )
							: shade(
									sample( x0 + bx, y0 + by, base ),
									0.85 + key * 0.3
							  );
					out = mix( [ 32, 42, 58 ], out, seam );
					break;
				}
				case 'liquid-glass':
				case 'flow-distortion': {
					const sx =
						( noise( xx / ( cell * 3 ), yy / ( cell * 3 ), seed ) -
							0.5 ) *
						cell *
						5;
					const sy =
						( noise(
							xx / ( cell * 3 ) + 12,
							yy / ( cell * 3 ) + 4,
							seed
						) -
							0.5 ) *
						cell *
						5;
					out = sample( x + sx, y + sy, base );
					if ( mode === 'liquid-glass' ) {
						out = mix(
							shade( out, 0.88 + n * 0.24 ),
							WARM,
							Math.pow( n, 12 ) * 0.8
						);
					}
					break;
				}
				case 'kaleidoscope': {
					const dx = xx - bw / 2,
						dy = yy - bh / 2,
						r = Math.hypot( dx, dy ),
						segments = 3 + Math.round( scale / 12 ),
						wedge = ( Math.PI * 2 ) / segments;
					const a = Math.abs(
						( ( ( ( Math.atan2( dy, dx ) - angle ) % wedge ) +
							wedge ) %
							wedge ) -
							wedge / 2
					);
					out = sample(
						x0 + bw / 2 + Math.cos( a + angle ) * r,
						y0 + bh / 2 + Math.sin( a + angle ) * r,
						base
					);
					break;
				}
				case 'glass-tiles': {
					out = shade(
						sample(
							x - qx * cell * 0.55 * ca + qy * cell * 0.55 * sa,
							y - qx * cell * 0.55 * sa - qy * cell * 0.55 * ca,
							base
						),
						0.86 + qx * 0.35 + qy * 0.2
					);
					out = mix(
						out,
						WARM,
						clamp(
							( Math.max( Math.abs( qx ), Math.abs( qy ) ) -
								0.41 ) *
								8
						) * 0.7
					);
					break;
				}
				case 'engraved-lines': {
					const line = Math.abs(
						Math.sin( ( ay + l * 0.4 ) * Math.PI )
					);
					out = mix(
						ink,
						paper,
						clamp( ( line - ( 1 - l ) * 0.9 ) * 6 ) *
							( 1 - edge * 0.8 )
					);
					break;
				}
				case 'crosshatch': {
					const a = Math.abs( Math.sin( ax * Math.PI ) ),
						b = Math.abs( Math.sin( ay * Math.PI ) );
					out = mix(
						ink,
						paper,
						clamp( ( a - ( 1 - l ) * 0.8 ) * 8 ) *
							( l < 0.7 ? clamp( ( b - ( 0.7 - l ) ) * 8 ) : 1 ) *
							( 1 - edge * 0.5 )
					);
					break;
				}
				case 'stipple-ink':
					out = mix(
						ink,
						paper,
						hash(
							Math.floor( xx / Math.max( 1, cell * 0.16 ) ),
							Math.floor( yy / Math.max( 1, cell * 0.16 ) ),
							seed
						) < l
							? 1
							: 0
					);
					break;
				case 'newsprint-dots':
					out = mix(
						ink,
						paper,
						clamp(
							( Math.hypot( qx, qy ) -
								Math.sqrt( 1 - l ) * 0.65 ) *
								cell +
								0.5
						)
					);
					break;
				case 'color-halftone': {
					out = [ 0, 1, 2 ].map( ( k ) => {
						const a = angle + k * 0.52,
							px =
								( xx * Math.cos( a ) + yy * Math.sin( a ) ) /
								cell,
							py =
								( -xx * Math.sin( a ) + yy * Math.cos( a ) ) /
								cell;
						return (
							35 +
							clamp(
								( Math.hypot(
									fract( px ) - 0.5,
									fract( py ) - 0.5
								) -
									Math.sqrt( 1 - base[ k ] / 255 ) * 0.63 ) *
									cell +
									0.5
							) *
								220
						);
					} );
					break;
				}
				case 'layered-ink': {
					const shifted = luma(
						sample(
							x + ca * cell * 0.45,
							y + sa * cell * 0.45,
							base
						)
					);
					out = mix(
						ink,
						paper,
						clamp(
							l * 0.65 +
								shifted * 0.45 +
								( hash( xx, yy, seed ) - 0.5 ) * 0.25
						)
					);
					break;
				}
				case 'woodcut': {
					const line = Math.sin(
						ay * 6.28 + noise( ax * 0.3, ay * 0.3, seed ) * 4
					);
					out = mix(
						ink,
						paper,
						line > ( 0.5 - l ) * 1.8 && edge < 0.5 ? 1 : 0
					);
					break;
				}
				case 'linocut':
					out = mix(
						ink,
						paper,
						clamp(
							( l - 0.42 + ( n - 0.5 ) * 0.28 - edge * 0.5 ) * 10
						)
					);
					break;
				case 'screen-mesh': {
					const mesh = clamp(
						( Math.abs(
							Math.sin( ax * Math.PI ) * Math.sin( ay * Math.PI )
						) -
							0.1 ) *
							4
					);
					out = mix(
						ink,
						mix( paper, base, 0.65 ),
						mesh * ( 0.25 + l * 0.75 )
					);
					break;
				}
				case 'offset-registration': {
					const a = sample(
							x + ca * cell * 0.7,
							y + sa * cell * 0.7,
							base
						),
						b = sample(
							x - ca * cell * 0.4,
							y - sa * cell * 0.4,
							base
						);
					out = mix( ink, paper, l * 0.7 );
					out = mix( out, [ a[ 0 ], b[ 1 ], base[ 2 ] ], 0.65 );
					break;
				}
				case 'hammered-metal': {
					const z = Math.sin( n * 18 ) * 0.5 + 0.5;
					out = mix(
						shade( base, 0.4 + z * 1.15 ),
						WARM,
						Math.pow( z, 12 ) * 0.6
					);
					break;
				}
				case 'brushed-metal': {
					const grain = noise( ax * 0.1, ay * 7, seed );
					out = mix(
						shade(
							base,
							0.48 +
								grain * 0.55 +
								Math.sin( ( u * ca + v * sa ) * 9 ) * 0.25
						),
						WARM,
						Math.pow( grain, 4 ) * 0.5 + 0.12
					);
					break;
				}
				case 'chrome-relief': {
					const z =
						0.5 +
						Math.sin(
							( gx * ca + gy * sa ) * 12 +
								( u * ca + v * sa ) * ( 5 + scale * 0.2 )
						) *
							0.48;
					out = mix(
						shade( base, 0.15 + z * 1.15 ),
						[ 240, 245, 255 ],
						Math.pow( z, 8 ) * 0.8
					);
					break;
				}
				case 'foil-laminate': {
					const z = clamp(
						0.4 +
							Math.sin(
								noise( ax * 0.35, ay * 0.35, seed ) * 13 +
									ax * 0.35
							) *
								0.55
					);
					out = mix(
						shade( base, 0.25 + z * 1.3 ),
						WARM,
						Math.pow( z, 9 ) * 0.82
					);
					break;
				}
				case 'satin-weave': {
					const z =
						Math.sin( ax * 6.28 + Math.sin( ay * 0.5 ) * 3 ) * 0.3 +
						Math.cos( ay * 3.14 ) * 0.2;
					out = mix(
						shade( base, 0.74 + z * 0.65 ),
						WARM,
						Math.pow( clamp( z + 0.45 ), 8 ) * 0.65
					);
					break;
				}
				case 'linen': {
					const thread =
						Math.sin( ax * 6.28 ) * Math.sin( ay * 6.28 );
					out = mix(
						shade(
							base,
							0.78 + thread * 0.18 + hash( xx, yy, seed ) * 0.14
						),
						paper,
						0.12
					);
					break;
				}
				case 'paper-grain':
					out = mix(
						shade(
							base,
							0.84 +
								n * 0.25 +
								( hash( xx, yy, seed ) - 0.5 ) * 0.2
						),
						paper,
						0.08
					);
					break;
				case 'ceramic-glaze': {
					const crack = Math.pow(
						clamp(
							1 -
								Math.abs(
									noise( ax * 0.6, ay * 0.6, seed ) - 0.5
								) *
									35
						),
						2
					);
					out = mix( shade( base, 0.85 + edge * 0.5 ), WARM, 0.15 );
					out = shade( out, 1 - crack * 0.55 );
					break;
				}
				case 'relief-carving': {
					const light = clamp(
						0.5 + ( gx * ca + gy * sa ) * ( 4 + scale * 0.2 )
					);
					out = mix( ink, paper, light );
					break;
				}
				case 'pearlescent-finish': {
					const t =
						( u * ca + v * sa ) * ( 2 + scale * 0.15 ) + n * 1.5;
					const pearl = [ 0, 2.1, 4.2 ].map(
						( phase ) => 190 + 60 * Math.sin( t + phase )
					);
					out = mix(
						shade( base, 0.84 ),
						pearl,
						0.4 + Math.pow( Math.max( 0, Math.cos( t ) ), 8 ) * 0.4
					);
					break;
				}
				case 'soft-bloom':
				case 'highlight-halation':
				case 'diffusion-veil':
				case 'chroma-aura': {
					const blur = [
							blurred.data[ i ],
							blurred.data[ i + 1 ],
							blurred.data[ i + 2 ],
						],
						alpha = blurred.data[ i + 3 ] / 255;
					if ( mode === 'diffusion-veil' ) {
						out = mix( base, blur, 0.65 );
						out = mix( out, WARM, 0.1 );
					} else {
						const tint =
							mode === 'highlight-halation'
								? [ 255, 112, 58 ]
								: mode === 'chroma-aura'
								? [ 94, 206, 251 ]
								: [ 255, 246, 225 ];
						out = base.map(
							( b, k ) =>
								255 -
								( 255 - b ) *
									( 1 -
										( ( blur[ k ] / 255 ) *
											alpha *
											0.75 *
											tint[ k ] ) /
											255 )
						);
					}
					break;
				}
				case 'anamorphic-glow': {
					let beam = 0;
					for ( let step = -4; step <= 4; step++ ) {
						const p = sample(
							x + step * ca * cell * 2,
							y + step * sa * cell * 2,
							base
						);
						beam +=
							Math.max( 0, luma( p ) - 0.7 ) *
							( 1 - Math.abs( step ) / 5 );
					}
					out = base.map(
						( b, k ) =>
							b +
							( 255 - b ) * clamp( beam ) * [ 0.45, 0.7, 1 ][ k ]
					);
					break;
				}
				case 'light-leak': {
					const f = Math.pow(
						clamp(
							1 -
								Math.abs( u * ca + v * sa - 0.25 ) *
									( 1 + scale / 15 )
						),
						2
					);
					out = mix( base, [ 255, 158 + n * 80, 91 ], f * 0.85 );
					break;
				}
				case 'solar-flare': {
					const dx = u - ( 0.5 + ca * 0.28 ),
						dy = v - ( 0.5 + sa * 0.28 ),
						r = Math.hypot( dx, dy ),
						a = Math.atan2( dy, dx );
					const core = Math.exp( -r * ( 4 + scale / 8 ) ),
						rays =
							Math.pow( Math.abs( Math.sin( a * 6 ) ), 32 ) *
							core;
					out = mix( base, WARM, clamp( core * 0.8 + rays * 0.6 ) );
					break;
				}
				case 'neon-edges':
					out = mix(
						shade( base, 0.25 ),
						COOL,
						Math.pow( edge, 0.55 )
					);
					break;
				case 'luminous-contours': {
					const bands = Math.pow(
						Math.max( 0, Math.cos( l * ( 3 + scale / 5 ) * 6.28 ) ),
						24
					);
					out = mix(
						shade( base, 0.65 ),
						WARM,
						clamp( bands * 0.8 + edge * 0.3 )
					);
					break;
				}
				case 'aurora-wash': {
					const t =
						( u * ca + v * sa ) * ( 3 + scale / 8 ) +
						Math.sin( v * 7 ) * 2 +
						n;
					out = mix(
						shade( base, 0.7 ),
						[
							125 + Math.sin( t ) * 100,
							140 + Math.sin( t + 1.9 ) * 105,
							185 + Math.sin( t + 4 ) * 70,
						],
						0.38 +
							Math.pow( Math.max( 0, Math.cos( t ) ), 6 ) * 0.35
					);
					break;
				}
				case 'folded-paper': {
					const fold = Math.sin( ax * Math.PI );
					out = shade(
						sample(
							x + ca * fold * cell * 0.28,
							y + sa * fold * cell * 0.28,
							base
						),
						0.6 + Math.abs( fold ) * 0.7
					);
					break;
				}
				case 'pixel-sorting':
					out = [ sorted[ i ], sorted[ i + 1 ], sorted[ i + 2 ] ];
					break;
				case 'woven-pixels': {
					const flip = ( Math.floor( ax ) + Math.floor( ay ) ) % 2;
					out = shade(
						sample(
							x + ( flip ? qy * cell : qx * cell ) * ca,
							y + ( flip ? qy * cell : qx * cell ) * sa,
							base
						),
						0.7 + Math.cos( ( flip ? qx : qy ) * Math.PI ) * 0.38
					);
					break;
				}
				case 'scanline-waves': {
					out = shade(
						sample(
							x + Math.sin( ay * 1.4 + n ) * cell * 1.3 * ca,
							y + Math.sin( ay * 1.4 + n ) * cell * 1.3 * sa,
							base
						),
						Math.floor( ay * 2 ) % 2 ? 0.76 : 1.08
					);
					break;
				}
				case 'color-topography': {
					const bands = 3 + Math.round( scale / 5 ),
						level = Math.floor( l * bands ) / bands,
						line = Math.min(
							fract( l * bands ),
							1 - fract( l * bands )
						);
					out = mix( ink, paper, level );
					out = shade( out, line < 0.1 ? 0.5 : 1 );
					break;
				}
				case 'contour-echo': {
					const line = Math.pow(
						Math.max(
							0,
							Math.cos(
								( l + edge * 0.3 ) * ( 5 + scale / 4 ) * Math.PI
							)
						),
						12
					);
					out = mix( paper, ink, clamp( line + edge * 0.7 ) );
					break;
				}
				case 'dither-matrix': {
					const size = Math.max( 1, cell * 0.25 ),
						ix = Math.floor( xx / size ) % 4,
						iy = Math.floor( yy / size ) % 4;
					const bayer = [
						0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5,
					];
					out = mix(
						ink,
						paper,
						l > ( bayer[ iy * 4 + ix ] + 0.5 ) / 16 ? 1 : 0
					);
					break;
				}
				case 'melted-ink': {
					out = sample(
						x + gx * cell * 4 + ( n - 0.5 ) * cell,
						y +
							gy * cell * 4 +
							Math.sin( xx / cell ) * cell * ( 1 - l ),
						base
					);
					out = shade( out, 0.85 + l * 0.2 );
					break;
				}
			}
			for ( let k = 0; k < 3; k++ ) {
				d[ i + k ] =
					src[ i + k ] + ( out[ k ] - src[ i + k ] ) * amount;
			}
		}
	}
	return image;
}
