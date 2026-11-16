/** Analog signal, film and optical finishes, clipped to the source silhouette. */
import { createCanvas } from './raster/env';
import { renderFilmOverlay } from './film-overlay';
import {
	clamp,
	mix,
	fract,
	smooth,
	luma,
	rgb,
	hash,
	noise,
	cellular,
} from './effect-pixel-utils';
function overlaySize( f ) {
	const factor = Math.min( 768 / f.short, 1536 / Math.max( f.w, f.h ) );
	return [
		Math.max( 1, Math.round( f.w * factor ) ),
		Math.max( 1, Math.round( f.h * factor ) ),
	];
}
function blendOverlay( f, canvas, p, screen = false ) {
	const c = createCanvas( f.w, f.h ),
		ctx = c.getContext( '2d' );
	ctx.drawImage( canvas, 0, 0, f.w, f.h );
	const pixels = ctx.getImageData( 0, 0, f.w, f.h ).data;
	return f.paint( p.intensity, ( x, y, base ) => {
		const i = ( ( y - f.top ) * f.w + x - f.left ) * 4,
			alpha = pixels[ i + 3 ] / 255;
		return base.map( ( value, k ) =>
			mix(
				value,
				screen
					? 255 - ( 255 - value ) * ( 1 - pixels[ i + k ] / 255 )
					: pixels[ i + k ],
				alpha
			)
		);
	} );
}
export function paintFilm( f, mode, p ) {
	const [ w, h ] = overlaySize( f ),
		config = {
			vignette: {
				on: false,
			},
		};
	if ( mode === 'film-dust' ) {
		config.dust = {
			on: true,
			density: p.density,
			size: p.scale,
			light: p.light,
			seed: p.seed,
		};
	}
	if ( mode === 'film-scratches' ) {
		config.scratches = {
			on: true,
			count: p.count,
			strength: p.width,
			light: p.light,
			seed: p.seed,
		};
	}
	if ( mode === 'film-grain' ) {
		config.grain = {
			on: true,
			amount: 100,
			size: p.scale,
			seed: p.seed,
		};
	}
	if ( mode === 'light-leak' ) {
		config.leaks = {
			on: true,
			count: p.count,
			size: p.scale,
			color: p.color,
			strength: 100,
			seed: p.seed,
		};
	}
	let c = renderFilmOverlay( config, w, h );
	if ( mode === 'film-hairs' ) {
		const ctx = c.getContext( '2d' );
		ctx.strokeStyle = p.light
			? 'rgba(255,247,224,0.85)'
			: 'rgba(17,12,8,0.85)';
		for ( let i = 0; i < p.count; i++ ) {
			const x = hash( i, 1, p.seed ) * w,
				y = hash( i, 2, p.seed ) * h;
			const length =
				Math.min( w, h ) *
				( 0.02 + p.scale * 0.002 ) *
				( 0.5 + hash( i, 3, p.seed ) );
			const angle = hash( i, 4, p.seed ) * Math.PI * 2;
			ctx.save();
			ctx.translate( x, y );
			ctx.rotate( angle );
			ctx.lineWidth = 0.55 + p.width * 0.025;
			ctx.beginPath();
			ctx.moveTo( -length / 2, 0 );
			ctx.bezierCurveTo(
				-length * 0.2,
				-length * 0.65,
				length * 0.42,
				length * 0.6,
				length / 2,
				0
			);
			ctx.stroke();
			ctx.restore();
		}
	}
	if ( mode === 'light-leak' && p.angle ) {
		const rotated = createCanvas( w, h ),
			ctx = rotated.getContext( '2d' );
		ctx.translate( w / 2, h / 2 );
		ctx.rotate( ( p.angle * Math.PI ) / 180 );
		ctx.drawImage( c, -w / 2, -h / 2 );
		c = rotated;
	}
	return blendOverlay( f, c, p, mode === 'light-leak' );
}
export function paintSignal( f, mode, p ) {
	const seed = p.seed || 7,
		period = Math.max(
			1.3,
			f.short * ( 0.002 + ( p.scale || 30 ) * 0.00022 )
		);
	const angle = ( ( p.angle || 0 ) * Math.PI ) / 180;
	return f.paint( p.intensity, ( x, y, base, u, v ) => {
		const line = Math.floor( ( y - f.top ) / period ),
			wobble = noise( 0, line * 0.13, seed ) * 2 - 1;
		if ( mode === 'scanlines' ) {
			const wave = fract(
				( ( x - f.left ) * Math.sin( angle ) +
					( y - f.top ) * Math.cos( angle ) ) /
					period
			);
			const width = p.width / 100;
			const stripe =
				smooth( 0, 0.07, wave ) *
				( 1 - smooth( width - 0.07, width, wave ) );
			return base.map( ( c ) => c * ( 1 - stripe * 0.72 ) );
		}
		if ( mode === 'crt-screen' ) {
			const bend = ( p.curvature / 100 ) * 0.24,
				dx = u * 2 - 1,
				dy = v * 2 - 1;
			const c = f.sample(
				x + dx * dy * dy * bend * f.w,
				y + dy * dx * dx * bend * f.h,
				base
			);
			const sx = ( ( x - f.left ) / period ) * 3,
				band = Math.floor( sx ) % 3;
			const seam = 0.78 + 0.22 * Math.sin( fract( sx ) * Math.PI );
			const stripe =
				0.75 +
				0.25 * Math.sin( fract( ( y - f.top ) / period ) * Math.PI );
			return c.map(
				( value, k ) =>
					value *
					( band === k ? 1.2 : 1 - p.mask / 160 ) *
					seam *
					stripe
			);
		}
		if ( mode === 'tracking-slip' ) {
			const center = p.position / 100,
				half = 0.01 + p.band * 0.0018;
			const band =
				1 - smooth( half * 0.45, half, Math.abs( v - center ) );
			const offset =
				( ( band * f.w * p.displacement ) / 500 ) *
				( 0.65 + wobble * 0.35 );
			const c = f.sample( x + offset, y + band * wobble * period, base );
			return c.map(
				( value ) =>
					value +
					band *
						( hash( Math.floor( u * 600 ), line, seed ) - 0.5 ) *
						75
			);
		}
		if ( mode === 'signal-dropout' ) {
			const row = hash( 0, line, seed ),
				gate = row > 1 - p.density / 220;
			const start = hash( 1, line, seed ),
				length = 0.015 + p.length / 120;
			const drop = gate && u > start && u < start + length;
			const fizz = hash( Math.floor( u * 500 ), line, seed + 4 );
			return base.map( ( c ) =>
				drop ? mix( c, 170 + fizz * 85, 0.65 + fizz * 0.35 ) : c
			);
		}
		// Chroma-only smear keeps fine luminance detail, like a bandwidth-limited color signal.
		const bleed = f.short * ( p.bleed || 45 ) * 0.00065;
		const jitter =
			mode === 'analog-tape'
				? ( ( wobble * p.jitter ) / 100 ) * f.short * 0.026
				: 0;
		const c = f.sample( x + jitter, y, base );
		const left = f.sample( x + jitter - bleed, y, c ),
			far = f.sample( x + jitter - bleed * 2.6, y, c );
		const bright = luma( c ) * 255;
		const smeared = left.map( ( value, k ) =>
			mix( value, far[ k ], 0.42 )
		);
		const chroma = luma( smeared ) * 255;
		const saturation = ( p.saturation ?? 100 ) / 100;
		const grain =
			mode === 'analog-tape'
				? ( hash( Math.floor( u * 720 ), line, seed ) - 0.5 ) *
				  p.noise *
				  0.62
				: 0;
		const scan =
			mode === 'analog-tape'
				? 0.89 +
				  0.11 * Math.sin( fract( ( y - f.top ) / period ) * Math.PI )
				: 1;
		return smeared.map(
			( value ) =>
				( bright + ( value - chroma ) * saturation ) * scan + grain
		);
	} );
}
function aperture( ctx, x, y, r, color, shape, softness ) {
	ctx.save();
	ctx.translate( x, y );
	ctx.beginPath();
	if ( shape === 'circle' ) {
		ctx.arc( 0, 0, r, 0, Math.PI * 2 );
	} else {
		const sides = shape === 'hexagon' ? 6 : shape === 'star' ? 10 : 8;
		for ( let i = 0; i <= sides; i++ ) {
			const a = ( i / sides ) * Math.PI * 2 - Math.PI / 2,
				radius = shape === 'star' && i % 2 ? r * 0.48 : r;
			if ( i ) {
				ctx.lineTo( Math.cos( a ) * radius, Math.sin( a ) * radius );
			} else {
				ctx.moveTo( Math.cos( a ) * radius, Math.sin( a ) * radius );
			}
		}
	}
	ctx.closePath();
	ctx.clip();
	const grad = ctx.createRadialGradient( 0, 0, 0, 0, 0, r );
	const rgba = ( a ) =>
		`rgba(${ color.map( Math.round ).join( ',' ) },${ a })`;
	grad.addColorStop( 0, rgba( 0.32 ) );
	grad.addColorStop( 0.55, rgba( 0.36 ) );
	grad.addColorStop(
		Math.max( 0.57, 0.98 - softness / 250 ),
		rgba( 0.68 - softness / 250 )
	);
	grad.addColorStop( 1, rgba( 0 ) );
	ctx.fillStyle = grad;
	ctx.fillRect( -r, -r, 2 * r, 2 * r );
	ctx.restore();
}
export function paintBokeh( f, mode, p ) {
	const [ w, h ] = overlaySize( f ),
		c = createCanvas( w, h ),
		ctx = c.getContext( '2d' ),
		points = [];
	if ( mode === 'highlight-bokeh' ) {
		const step = Math.max( 1, f.short / 36 ),
			threshold = p.threshold / 100;
		for ( let y = f.top; y < f.top + f.h; y += step ) {
			for ( let x = f.left; x < f.left + f.w; x += step ) {
				const color = f.sample( x, y ),
					light = luma( color );
				if ( light > threshold ) {
					points.push( {
						x: ( x - f.left ) / f.w,
						y: ( y - f.top ) / f.h,
						color,
						light,
					} );
				}
			}
		}
		points.sort( ( a, b ) => b.light - a.light );
		const kept = [],
			separation = ( 0.018 + p.scale * 0.00065 ) ** 2;
		for ( const point of points ) {
			if (
				! kept.some(
					( other ) =>
						( point.x - other.x ) ** 2 +
							( point.y - other.y ) ** 2 <
						separation
				)
			) {
				kept.push( point );
			}
			if ( kept.length >= p.count ) {
				break;
			}
		}
		points.splice( 0, points.length, ...kept );
	} else {
		const color = rgb( p.color );
		for ( let i = 0; i < p.count; i++ ) {
			points.push( {
				x: hash( i, 1, p.seed ),
				y: hash( i, 2, p.seed ),
				light: 0.5 + hash( i, 3, p.seed ) * 0.5,
				color: color.map( ( v ) =>
					mix( v, 255, hash( i, 4, p.seed ) * 0.55 )
				),
			} );
		}
	}
	ctx.globalCompositeOperation = 'screen';
	for ( const point of points ) {
		const radius =
			Math.min( w, h ) *
			( 0.008 + p.scale * 0.0015 ) *
			( 0.55 + point.light * 0.65 );
		aperture(
			ctx,
			point.x * w,
			point.y * h,
			radius,
			point.color,
			p.shape,
			p.softness
		);
	}
	return blendOverlay( f, c, p, true );
}
export function paintOptics( f, mode, p, helpers ) {
	const color = rgb( p.color || '#ff6033' ),
		seed = p.seed || 7;
	const cells =
		mode === 'water-droplets'
			? cellular( f, 0.025 + p.scale * 0.0018, seed )
			: null;
	let halo;
	if ( mode === 'highlight-halation' ) {
		halo = {
			width: f.width,
			height: f.height,
			data: new Uint8ClampedArray( f.source.length ),
		};
		for ( let i = 0; i < f.source.length; i += 4 ) {
			const light =
				( f.source[ i ] * 0.2126 +
					f.source[ i + 1 ] * 0.7152 +
					f.source[ i + 2 ] * 0.0722 ) /
				255;
			const hot =
				smooth( p.threshold / 100, 1, light ) * f.source[ i + 3 ];
			halo.data[ i ] = halo.data[ i + 1 ] = halo.data[ i + 2 ] = hot;
			halo.data[ i + 3 ] = 255;
		}
		helpers.gaussianBlur( halo, {
			radius: Math.max( 1, f.short * ( 0.002 + p.scale * 0.00065 ) ),
		} );
	}
	const angle = ( ( p.angle || 0 ) * Math.PI ) / 180,
		ca = Math.cos( angle ),
		sa = Math.sin( angle );
	return f.paint(
		mode === 'vignette' ? Math.abs( p.amount ) : p.intensity,
		( x, y, base, u, v, i ) => {
			if ( mode === 'vignette' ) {
				const dx = u - p.cx / 100,
					dy = v - p.cy / 100;
				const distance =
					p.shape === 'circle'
						? Math.hypot(
								( dx * f.w ) / f.short,
								( dy * f.h ) / f.short
						  )
						: p.shape === 'rectangle'
						? Math.max( Math.abs( dx ), Math.abs( dy ) )
						: Math.hypot( dx, dy );
				const reach = 0.2 + p.size * 0.006,
					inner = reach * ( 1 - p.softness / 100 );
				const shade = smooth( inner, reach, distance );
				return base.map( ( c, k ) =>
					mix( c, p.amount < 0 ? 255 : color[ k ], shade )
				);
			}
			if ( mode === 'highlight-halation' ) {
				const hot = smooth( p.threshold / 100, 1, luma( base ) );
				const glow = clamp( halo.data[ i ] / 255 - hot * 0.6 ) * 2.7;
				return base.map(
					( c, k ) =>
						255 -
						( 255 - c ) *
							( 1 - clamp( ( glow * color[ k ] ) / 255 ) )
				);
			}
			if ( mode === 'water-droplets' ) {
				const cell = cells( x, y ),
					radius = 0.16 + p.coverage * 0.0034;
				const d = cell.distance / radius;
				if ( d >= 1 ) {
					return base;
				}
				const bulge = Math.sqrt( Math.max( 0, 1 - d * d ) ),
					power = p.refraction / 100;
				const c = f.sample(
					x + ( x - cell.point.x ) * bulge * power * 1.5,
					y + ( y - cell.point.y ) * bulge * power * 1.5,
					base
				);
				const rim =
					smooth( 0.7, 0.94, d ) * ( 1 - smooth( 0.94, 1, d ) );
				const light = Math.max(
					0,
					( cell.point.x - x - ( y - cell.point.y ) ) /
						( cell.cell * radius )
				);
				return c.map(
					( value ) =>
						value * ( 1 - rim * 0.45 ) +
						rim * light * 190 +
						bulge ** 14 * 42
				);
			}
			if ( mode === 'prism-window' ) {
				const dx = ( ( u - p.cx / 100 ) * f.w ) / f.short,
					dy = ( ( v - p.cy / 100 ) * f.h ) / f.short;
				const rotated = dx * ca + dy * sa,
					across = -dx * sa + dy * ca;
				const window =
					( 1 -
						smooth(
							0.055 + p.scale * 0.002,
							0.08 + p.scale * 0.002,
							Math.abs( rotated )
						) ) *
					( 1 -
						smooth(
							0.22 + p.scale * 0.003,
							0.25 + p.scale * 0.003,
							Math.abs( across )
						) );
				const reach = ( f.short * p.refraction ) / 1300;
				return base.map( ( value, k ) =>
					mix(
						value,
						f.sample(
							x + ( k - 1.4 ) * ca * reach,
							y + ( k - 1.4 ) * sa * reach,
							base
						)[ k ] + 14,
						window
					)
				);
			}
			if ( mode === 'film-burn' ) {
				const pos = p.position / 100,
					axis = ( u - 0.5 ) * ca + ( v - 0.5 ) * sa + 0.5;
				const waviness = noise( u * 5, v * 5, seed ) * 0.09;
				const d = Math.abs( axis - pos + waviness ),
					reach = 0.015 + p.scale * 0.0028;
				const burn = 1 - smooth( reach * 0.1, reach, d ),
					core = ( 1 - smooth( 0, reach * 0.22, d ) ) ** 2;
				return base.map( ( value, k ) =>
					mix(
						255 -
							( 255 - value ) *
								( 1 - ( color[ k ] / 255 ) * burn ),
						255,
						core
					)
				);
			}
			return base;
		}
	);
}
