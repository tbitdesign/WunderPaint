/** Image-driven pigment, reaction, stitch, metallic and print materials. */
import {
	clamp,
	mix,
	fract,
	smooth,
	luma,
	rgb,
	noise,
	fbm,
	cellular,
} from './effect-pixel-utils';

/** A bounded Gray–Scott field: the source luminance continuously feeds the reaction. */
function reactionField( f, p ) {
	const short = Math.round( 130 - p.scale * 0.7 );
	const w = Math.max(
		12,
		Math.min( 220, Math.round( ( short * f.w ) / f.short ) )
	);
	const h = Math.max(
		12,
		Math.min( 220, Math.round( ( short * f.h ) / f.short ) )
	);
	let a = new Float32Array( w * h ).fill( 1 ),
		b = new Float32Array( w * h );
	let na = new Float32Array( w * h ),
		nb = new Float32Array( w * h );
	const tone = new Float32Array( w * h );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			tone[ i ] = luma(
				f.sample( f.left + ( x / w ) * f.w, f.top + ( y / h ) * f.h )
			);
			b[ i ] =
				noise( x * 0.15, y * 0.15, p.seed ) > 0.66 - tone[ i ] * 0.14
					? 0.8
					: 0;
			a[ i ] = 1 - b[ i ] * 0.72;
		}
	}
	const steps = Math.round( 45 + p.growth * 1.6 );
	for ( let step = 0; step < steps; step++ ) {
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				const i = y * w + x,
					left = y * w + Math.max( 0, x - 1 ),
					right = y * w + Math.min( w - 1, x + 1 );
				const up = Math.max( 0, y - 1 ) * w + x,
					down = Math.min( h - 1, y + 1 ) * w + x;
				const feed = 0.03 + tone[ i ] * 0.012,
					kill = 0.047 + p.pattern * 0.00013;
				const react = a[ i ] * b[ i ] ** 2;
				na[ i ] = clamp(
					a[ i ] +
						0.22 *
							( a[ left ] +
								a[ right ] +
								a[ up ] +
								a[ down ] -
								4 * a[ i ] ) -
						react +
						feed * ( 1 - a[ i ] )
				);
				nb[ i ] = clamp(
					b[ i ] +
						0.11 *
							( b[ left ] +
								b[ right ] +
								b[ up ] +
								b[ down ] -
								4 * b[ i ] ) +
						react -
						( kill + feed ) * b[ i ]
				);
			}
		}
		[ a, na ] = [ na, a ];
		[ b, nb ] = [ nb, b ];
	}
	return ( u, v ) => {
		const x = clamp( u * w - 0.5, 0, w - 1 ),
			y = clamp( v * h - 0.5, 0, h - 1 ),
			ix = Math.floor( x ),
			iy = Math.floor( y );
		return mix(
			mix(
				b[ iy * w + ix ],
				b[ iy * w + Math.min( w - 1, ix + 1 ) ],
				fract( x )
			),
			mix(
				b[ Math.min( h - 1, iy + 1 ) * w + ix ],
				b[ Math.min( h - 1, iy + 1 ) * w + Math.min( w - 1, ix + 1 ) ],
				fract( x )
			),
			fract( y )
		);
	};
}
export function paintArt( f, mode, p ) {
	const seed = p.seed || 7,
		size = Math.max( 2, f.short * ( 0.006 + ( p.scale || 35 ) * 0.0012 ) );
	const rad = ( ( p.angle || 0 ) * Math.PI ) / 180,
		ca = Math.cos( rad ),
		sa = Math.sin( rad );
	const ink = rgb( p.ink || '#233146' ),
		paper = rgb( p.paper || '#f4e7cb' );
	const field = mode === 'reaction-print' ? reactionField( f, p ) : null;
	const cells =
		mode === 'metal-cracks'
			? cellular( f, 0.035 + p.scale * 0.0025, seed )
			: null;
	const metal = rgb( p.metal || '#eabf65' ),
		patina = rgb( p.patina || '#3dafa0' );
	const textured = [
		'pigment-bloom',
		'oxidation',
		'ink-wear',
		'grunge',
		'water-stains',
	].includes( mode );
	const inks =
		mode === 'dual-ink-print' || mode === 'triple-ink-print'
			? [
					ink,
					rgb( p.ink2 ),
					...( mode === 'triple-ink-print' ? [ rgb( p.ink3 ) ] : [] ),
			  ]
			: [];
	const plates = inks.map( ( pigment, index ) => ( {
		pigment,
		ca: Math.cos( rad + index * 1.13 ),
		sa: Math.sin( rad + index * 1.13 ),
	} ) );
	return f.paint( p.intensity, ( x, y, base, u, v ) => {
		const px = ( x - f.left ) / size,
			py = ( y - f.top ) / size,
			tone = luma( base );
		const n = textured ? fbm( px, py, seed ) : 0;
		if ( mode === 'pigment-bloom' ) {
			const curl = fbm( px * 0.5 + 7, py * 0.5, seed + 8 ) * Math.PI * 6;
			const wet = p.wetness / 100;
			const washed = f.sample(
				x + Math.cos( curl ) * size * wet * 0.65,
				y + Math.sin( curl ) * size * wet * 0.65,
				base
			);
			const bands = fract( n * ( 2.3 + p.blooms * 0.055 ) + tone * 0.65 );
			const rim = ( ( 1 - smooth( 0.02, 0.17, bands ) ) * p.edge ) / 100;
			const granule =
				( noise( px * 12, py * 12, seed + 23 ) - 0.5 ) * p.grain * 0.42;
			return washed.map(
				( c, k ) =>
					mix( c, paper[ k ], wet * ( 0.1 + n * 0.23 ) ) *
						( 1 - rim * 0.6 ) +
					granule
			);
		}
		if ( mode === 'reaction-print' ) {
			const value = field( u, v );
			// Print concentration contours rather than a solid threshold: a settled
			// reaction still shows organic detail instead of flooding the image in ink.
			const contour =
				( 1 - smooth( 0.06, 0.38, fract( value * 18 ) ) ) *
				smooth( 0.005, 0.04, value );
			return base.map( ( c, k ) =>
				mix( mix( paper[ k ], c, 0.58 ), ink[ k ], contour * 0.92 )
			);
		}
		if ( mode === 'metal-cracks' ) {
			const cell = cells( x, y ),
				thickness = 0.007 + p.width * 0.0016;
			const crack =
				1 - smooth( thickness * 0.5, thickness + 0.025, cell.edge );
			const recess =
				1 - smooth( thickness + 0.025, thickness + 0.075, cell.edge );
			const shine =
				0.68 +
				0.6 *
					Math.max(
						0,
						Math.sin(
							( px * ca + py * sa ) * 2 + cell.point.value * 6
						)
					);
			return base.map( ( c, k ) =>
				mix(
					c * ( 1 - ( recess * 0.55 * p.relief ) / 100 ),
					metal[ k ] * shine + 25 * shine ** 5,
					crack
				)
			);
		}
		if ( mode === 'embroidery' ) {
			const gx =
				luma( f.sample( x + size, y, base ) ) -
				luma( f.sample( x - size, y, base ) );
			const gy =
				luma( f.sample( x, y + size, base ) ) -
				luma( f.sample( x, y - size, base ) );
			// Sub-byte edge quantization must not rotate an entire stitch on a flat fill.
			const confidence = smooth( 0.015, 0.12, Math.hypot( gx, gy ) );
			const follow = Math.atan2( gy, gx ) + Math.PI / 2;
			const theta =
				rad +
				( Math.atan2(
					Math.sin( follow - rad ),
					Math.cos( follow - rad )
				) *
					p.follow *
					confidence ) /
					100;
			const t = Math.cos( theta ),
				s = Math.sin( theta );
			const tx = ( x - f.left ) * t + ( y - f.top ) * s,
				ty = -( x - f.left ) * s + ( y - f.top ) * t;
			const row = Math.floor( ty / size ),
				along = fract( tx / ( size * 2.7 ) + ( row % 2 ) * 0.5 ),
				across = fract( ty / size );
			const shape =
				Math.sin( Math.PI * across ) ** 0.45 *
				smooth( 0.02, 0.11, along ) *
				( 1 - smooth( 0.86, 0.99, along ) );
			const stitchX =
				x +
				( 0.5 - along ) * size * 2.7 * t +
				( across - 0.5 ) * size * s;
			const stitchY =
				y +
				( 0.5 - along ) * size * 2.7 * s +
				( 0.5 - across ) * size * t;
			const c = f.sample( stitchX, stitchY, base );
			const shine =
				( p.sheen / 100 ) *
				( Math.sin( Math.PI * across ) ** 10 * 80 +
					Math.sin( across * 36 + along * 11 ) * 14 );
			return c.map( ( value, k ) =>
				mix(
					paper[ k ] * 0.42,
					value * ( 0.65 + shape * 0.35 ) + shine,
					smooth( 0.05, 0.38, shape )
				)
			);
		}
		if ( mode === 'oxidation' ) {
			const corrosion = smooth(
				0.92 - p.age * 0.008,
				1.08 - p.age * 0.008,
				n + ( 1 - tone ) * 0.12
			);
			const pits = noise( px * 9, py * 9, seed + 6 );
			const relief =
				( noise( px + 0.12, py - 0.12, seed ) -
					noise( px - 0.12, py + 0.12, seed ) ) *
				p.texture;
			return base.map( ( c, k ) =>
				mix(
					mix( c, metal[ k ] * ( 0.45 + tone * 0.75 ), 0.42 ),
					patina[ k ] * ( 0.65 + pits * 0.4 ) + relief,
					corrosion
				)
			);
		}
		if ( mode === 'solarization' ) {
			const threshold = p.threshold / 100,
				feather = 0.015 + p.softness / 200;
			return base.map( ( c ) => {
				const value = p.mono ? tone * 255 : c;
				return mix(
					value,
					255 - value,
					smooth(
						threshold - feather,
						threshold + feather,
						value / 255
					)
				);
			} );
		}
		if ( mode === 'interference-print' ) {
			const a = ( px * ca + py * sa ) * Math.PI * 2;
			const b =
				( px * Math.cos( rad + ( p.crossing * Math.PI ) / 180 ) +
					py * Math.sin( rad + ( p.crossing * Math.PI ) / 180 ) ) *
				Math.PI *
				2;
			const wave =
				Math.sin( a + tone * p.warp * 0.16 ) *
				Math.sin( b - tone * p.warp * 0.1 );
			const density = smooth(
				-0.55 + tone * 0.65,
				0.1 + tone * 0.65,
				wave
			);
			return base.map( ( c, k ) =>
				mix( mix( paper[ k ], c, 0.12 ), ink[ k ], density )
			);
		}
		if ( mode === 'dual-ink-print' || mode === 'triple-ink-print' ) {
			const offset = ( p.registration / 100 ) * f.short * 0.027;
			const other = f.sample( x + offset * ca, y + offset * sa, base );
			const warm = clamp( ( other[ 0 ] - other[ 2 ] ) / 210 + 0.35 );
			const covers =
				mode === 'triple-ink-print'
					? [
							( 1 - tone ) * 0.9,
							warm * ( 1 - tone * 0.65 ),
							clamp(
								( other[ 1 ] - other[ 0 ] ) / 220 + tone * 0.28
							),
					  ]
					: [
							( 1 - tone ) * 0.92,
							clamp( 0.22 + warm * 0.7 - tone * 0.32 ),
					  ];
			const color = [ ...paper ];
			// Coverage belongs to a printing plate, not to an RGB channel. Compute it
			// once, then multiply all three channels with the same pigment coverage.
			plates.forEach( ( plate, index ) => {
				const dx = ( x - f.left + offset * index ) / size,
					dy = ( y - f.top - offset * index ) / size;
				const grid =
					( Math.sin( ( dx * plate.ca + dy * plate.sa ) * 6.28 ) +
						Math.sin(
							( -dx * plate.sa + dy * plate.ca ) * 6.28
						) ) *
						0.2 +
					0.5;
				const coverage =
					smooth( grid - 0.1, grid + 0.1, covers[ index ] ) *
					( 1 -
						( p.grain / 180 ) *
							noise( px * 15, py * 15, seed + index ) );
				for ( let k = 0; k < 3; k++ ) {
					color[ k ] *=
						1 - coverage * ( 1 - plate.pigment[ k ] / 255 );
				}
			} );
			return color;
		}

		if ( mode === 'ink-wear' ) {
			const coarse = fbm( px * 0.7, py * 0.7, seed ),
				fine = noise( px * 11, py * 11, seed + 3 );
			const worn = smooth(
				0.96 - p.wear * 0.008,
				1.11 - p.wear * 0.008,
				coarse * 0.76 + fine * 0.24
			);
			return base.map( ( c, k ) =>
				mix( c * ( 0.85 + n * 0.24 ), paper[ k ], worn )
			);
		}
		if ( mode === 'grunge' ) {
			const dirt = smooth(
				0.7 - p.dirt * 0.0055,
				0.96 - p.dirt * 0.0055,
				n
			);
			const scratch =
				( ( 1 -
					smooth(
						0,
						0.05 + p.scratches / 700,
						fract(
							px * ca +
								py * sa +
								noise( px * 0.1, py * 0.1, seed + 7 ) * 3
						)
					) ) *
					p.scratches ) /
				100;
			return base.map( ( c, k ) =>
				mix(
					mix( c, ink[ k ], dirt * 0.72 ),
					paper[ k ],
					scratch * 0.85
				)
			);
		}
		if ( mode === 'water-stains' ) {
			const landscape = fbm( px * 0.22, py * 0.22, seed ),
				level = 0.78 - p.coverage * 0.0055;
			const wash = smooth( level - 0.07, level + 0.07, landscape ),
				rim =
					( ( 1 -
						smooth( 0.012, 0.06, Math.abs( landscape - level ) ) ) *
						p.edge ) /
					100;
			return base.map(
				( c, k ) =>
					mix( c, ink[ k ], wash * 0.25 + rim * 0.64 ) +
					( n - 0.5 ) * wash * 12
			);
		}
		return base;
	} );
}
