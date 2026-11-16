/** Procedural material, print and ink surfaces for the built-in text effects. */
import { createCanvas } from './env';
import { maxTextSize } from './text-metrics';
import { textDistanceField, textMaterialColor } from './text-premium';

export const TEXT_SURFACE_KEYS = [
	'bevel',
	'letterpress',
	'shine',
	'scanlines',
	'grunge',
	'innerGlow',
	'stripesFill',
	'gradient',
	'chrome',
	'comicDots',
	'spray',
	'twoTone',
	'foil',
	'threeD',
	'checker',
	'halftone',
	'static',
	'dotMatrix',
	'fold',
	'inline',
	'waves',
	'motifFill',
	'camo',
	'circuit',
	'plaid',
	'bubbles',
	'cracks',
];
const clamp = ( n, lo = 0, hi = 1 ) => Math.max( lo, Math.min( hi, n ) );
const number = ( n, f, lo = 0, hi = 100 ) =>
	clamp( Number.isFinite( +n ) ? +n : f, lo, hi );
const mix = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * clamp( t ) );
const css = ( c, a = 1 ) =>
	`rgba(${ c
		.map( ( v ) => Math.round( clamp( v, 0, 255 ) ) )
		.join( ',' ) },${ a })`;
const fract = ( n ) => n - Math.floor( n );
const hash = ( x, y, seed = 1 ) =>
	fract( Math.sin( x * 127.1 + y * 311.7 + seed * 74.7 ) * 43758.5453 );
const smooth = ( t ) => t * t * ( 3 - 2 * t );
function noise( x, y, seed = 1 ) {
	const ix = Math.floor( x ),
		iy = Math.floor( y ),
		tx = smooth( fract( x ) ),
		ty = smooth( fract( y ) );
	const a = hash( ix, iy, seed ) * ( 1 - tx ) + hash( ix + 1, iy, seed ) * tx;
	const b =
		hash( ix, iy + 1, seed ) * ( 1 - tx ) +
		hash( ix + 1, iy + 1, seed ) * tx;
	return a * ( 1 - ty ) + b * ty;
}
const rgb = ( v, f = '#c7d8e8' ) => textMaterialColor( v, f );
function samplePattern( id, c, x, y, u, v, base ) {
	const a = c._a,
		b = c._b,
		bg = c._bg,
		s = number( c.size, 18, 2, 200 ),
		seed = c.seed || 1;
	let height = 0,
		color = base;
	switch ( id ) {
		case 'gradient': {
			const mid = number( c.midpoint, 55, 5, 95 ) / 100;
			const t = clamp( 0.5 + ( u - 0.5 ) * c._ca + ( v - 0.5 ) * c._sa );
			color =
				t < mid
					? mix( a, c._third, t / mid )
					: mix( c._third, b, ( t - mid ) / ( 1 - mid ) );
			break;
		}
		case 'threeD':
			color = mix( a, b, v );
			break;
		case 'twoTone': {
			const split = number( c.split, 56, 10, 90 ) / 100,
				soft = number( c.softness, 4, 0, 50 ) / 100;
			const t = 0.5 + ( u - 0.5 ) * c._ca + ( v - 0.5 ) * c._sa;
			color = mix(
				a,
				b,
				soft
					? smooth( clamp( ( t - split + soft / 2 ) / soft ) )
					: t >= split
					? 1
					: 0
			);
			break;
		}
		case 'stripesFill': {
			const width = number( c.width, 10, 2, 60 ),
				t = ( x * c._ca + y * c._sa ) / width,
				cell = Math.floor( t ),
				q = fract( t );
			color = [ a, b, c._third ][ ( ( cell % 3 ) + 3 ) % 3 ];
			height = Math.sin( Math.PI * q ) * 0.55;
			break;
		}
		case 'chrome':
			color = a;
			height = noise( x / 44, y / 28 ) * 0.055;
			break;
		case 'foil': {
			const folds = noise( x / 38, y / 27, seed ),
				grain = noise( x / 7, y / 9, seed + 2 );
			height =
				( folds - 0.5 ) * 2.2 +
				( grain - 0.5 ) * 0.09 +
				Math.sin( x / 24 + y / 39 + folds * 4 ) * 0.25;
			color = a.map( ( channel ) => channel * ( 0.92 + folds * 0.08 ) );
			break;
		}
		case 'comicDots':
		case 'halftone': {
			const xx = ( x * c._ca - y * c._sa ) / s,
				yy = ( x * c._sa + y * c._ca ) / s;
			const r = Math.hypot( fract( xx ) - 0.5, fract( yy ) - 0.5 );
			const coverage =
				id === 'halftone'
					? ( ( 0.11 + 0.34 * v ) *
							number( c.strength, 75, 10, 100 ) ) /
					  100
					: 0.24;
			const dot = clamp( ( coverage - r ) * s + 0.5 );
			color = mix( id === 'comicDots' ? bg : base, a, dot );
			height = dot * 0.08;
			break;
		}
		case 'checker': {
			const nx = Math.floor( x / s ),
				ny = Math.floor( y / s ),
				q = Math.min(
					fract( x / s ),
					fract( y / s ),
					1 - fract( x / s ),
					1 - fract( y / s )
				);
			color = ( nx + ny ) % 2 ? a : b;
			height = clamp( q * 10 ) * 0.3;
			break;
		}
		case 'static': {
			const scale = number( c.scale, 2, 1, 6 ),
				n = hash(
					Math.floor( x / scale ),
					Math.floor( y / scale ),
					seed
				);
			color = mix(
				base,
				mix( b, a, n ),
				number( c.amount, 70, 10, 100 ) / 100
			);
			height = n * 0.1;
			break;
		}
		case 'dotMatrix': {
			const dx = fract( x / s ) - 0.5,
				dy = fract( y / s ) - 0.5,
				r = Math.hypot( dx, dy ),
				glow = number( c.glow, 8, 0, 30 ) / 30;
			const lamp = clamp( ( 0.32 - r ) * s + 0.5 ),
				core = Math.pow(
					clamp( 1 - Math.hypot( dx + 0.1, dy + 0.12 ) / 0.31 ),
					2
				);
			color = mix(
				bg,
				a,
				Math.max( lamp, 0.36 * glow * Math.exp( -r * r * 6 ) )
			);
			color = mix( color, [ 255, 248, 229 ], core * 0.8 * lamp );
			height = lamp * 0.3;
			break;
		}
		case 'fold': {
			const n = number( c.bands, 6, 3, 16 ),
				q = fract( ( u * c._ca + v * c._sa ) * n + seed * 0.11 );
			const t = q < 0.5 ? q * 2 : 2 - q * 2;
			height = ( ( t - 0.5 ) * number( c.strength, 60, 10, 100 ) ) / 55;
			color = base.map( ( z ) => z * ( 0.72 + t * 0.35 ) );
			break;
		}
		case 'waves': {
			const amp = number( c.amp, 6, 2, 24 ),
				t =
					( y +
						Math.sin( ( x / s ) * Math.PI * 2 ) * amp +
						Math.sin( ( x / s ) * 1.7 ) * amp * 0.25 ) /
					( s * 0.28 );
			const q = fract( t ),
				k = ( Math.sin( t * Math.PI * 2 ) + 1 ) / 2;
			color = mix( a, b, smooth( k ) );
			height = Math.sin( q * Math.PI * 2 ) * 0.7;
			break;
		}
		case 'motifFill': {
			const nx = Math.floor( x / s ),
				ny = Math.floor( y / s ),
				px = ( fract( x / s + ( ny % 2 ) * 0.5 ) - 0.5 ) * 2,
				py = ( fract( y / s ) - 0.5 ) * 2;
			const style = number( c.style, 2, 0, 3 ),
				r = Math.hypot( px, py ),
				theta = Math.atan2( py, px );
			let inside = false;
			if ( style === 0 ) {
				const xx = px * 1.6,
					yy = -py * 1.6;
				inside =
					Math.pow( xx * xx + yy * yy - 1, 3 ) -
						xx * xx * yy * yy * yy <
					0;
			} else if ( style === 1 ) {
				inside = r < 0.43 + 0.19 * Math.cos( theta * 5 );
			} else if ( style === 2 ) {
				inside = Math.abs( px ) + Math.abs( py ) < 0.62;
			} else {
				inside =
					Math.hypot( px * 0.85, py * 1.55 ) < 0.59 &&
					px + py > -0.63;
			}
			color = inside ? a : bg;
			height = inside ? 0.34 : 0;
			height += hash( nx, ny ) * 0.025;
			break;
		}
		case 'camo': {
			const n =
				noise( ( x / s ) * 1.3, ( y / s ) * 1.3, seed ) * 0.65 +
				noise( ( x / s ) * 3.1, ( y / s ) * 3.1, seed + 2 ) * 0.35;
			color = n < 0.35 ? c._fourth : n < 0.49 ? a : n < 0.63 ? bg : b;
			height = n * 0.35;
			break;
		}
		case 'circuit': {
			const ix = Math.floor( x / s ),
				iy = Math.floor( y / s ),
				xx = fract( x / s ),
				yy = fract( y / s ),
				r = hash( ix, iy );
			const joint = Math.hypot( xx - 0.5, yy - 0.5 ),
				trace = Math.min(
					Math.abs( xx - 0.5 ),
					r > 0.4 ? Math.abs( yy - 0.5 ) : 1
				);
			const line = clamp( ( 0.035 - trace ) * s + 0.5 ),
				ring = clamp( ( 0.025 - Math.abs( joint - 0.15 ) ) * s + 0.5 );
			const fill = Math.max( line, ring );
			color = mix( bg, a, fill );
			height = fill * 0.55;
			if ( trace < 0.02 ) {
				color = mix( color, [ 236, 252, 220 ], 0.32 );
			}
			break;
		}
		case 'plaid': {
			const xx = fract( x / s ),
				yy = fract( y / s ),
				h = xx > 0.29 && xx < 0.62,
				k = yy > 0.29 && yy < 0.62;
			const thread =
				( Math.floor( x / 1.5 ) + Math.floor( y / 1.5 ) ) % 2;
			color = mix( bg, a, h || k ? 0.52 : 0 );
			if ( h && k ) {
				color = mix( color, a, 0.48 );
			}
			if (
				Math.abs( xx - 0.12 ) < 0.035 ||
				Math.abs( yy - 0.12 ) < 0.035
			) {
				color = mix( color, b, 0.8 );
			}
			color = color.map( ( z ) => z * ( thread ? 0.97 : 0.86 ) );
			height = thread ? 0.09 : -0.09;
			break;
		}
	}
	return { color, height };
}

/** Paint only inside the true glyph alpha, including holes and antialiasing. */
export function paintTextSurfaces( body, layer ) {
	const fx = layer.textFX || {},
		keys = TEXT_SURFACE_KEYS.filter( ( k ) => fx[ k ] );
	if ( ! keys.length ) {
		return;
	}
	const ctx = body.getContext( '2d' ),
		image = ctx.getImageData( 0, 0, body.width, body.height ),
		data = image.data;
	const box = textDistanceField( image );
	if ( box.empty ) {
		return;
	}
	const { w, h, d, x0, y0, x1, y1 } = box,
		bw = Math.max( 1, x1 - x0 ),
		bh = Math.max( 1, y1 - y0 ),
		size = maxTextSize( layer );
	const surfaces = [
		'gradient',
		'threeD',
		'twoTone',
		'stripesFill',
		'chrome',
		'foil',
		'comicDots',
		'checker',
		'halftone',
		'static',
		'dotMatrix',
		'fold',
		'waves',
		'motifFill',
		'camo',
		'circuit',
		'plaid',
	].filter( ( k ) => fx[ k ] );
	const configs = Object.fromEntries(
		surfaces.map( ( k ) => {
			const c = fx[ k ],
				angle =
					( ( c.angle ?? ( k === 'halftone' ? 35 : 90 ) ) *
						Math.PI ) /
					180;
			return [
				k,
				{
					...c,
					_a: rgb( c.color ),
					_b: rgb( c.color2, '#657498' ),
					_bg: rgb( c.bg, '#182632' ),
					_third: rgb( c.color3, c.color2 || '#78daca' ),
					_fourth: rgb( c.color3, '#435656' ),
					_ca: Math.cos( angle ),
					_sa: Math.sin( angle ),
				},
			];
		} )
	);
	const heights = new Float32Array( w * h );
	const last = surfaces[ surfaces.length - 1 ],
		material = last === 'chrome' || last === 'foil';
	const relief = Math.max(
		0,
		...surfaces.map(
			( k ) =>
				number(
					fx[ k ].relief,
					k === 'chrome' ? 55 : k === 'foil' ? 48 : 0
				) / 100
		)
	);
	const bevel = fx.bevel || fx.letterpress;
	const bevelSize = bevel
		? number( bevel.depth, 6, 1, 12 )
		: Math.max( 1, size * 0.09 ) * relief;
	const light =
			( ( bevel?.lightAngle ?? fx[ last ]?.lightAngle ?? 125 ) *
				Math.PI ) /
			180,
		lc = Math.cos( light ),
		ls = Math.sin( light );
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const j = y * w + x,
				i = j * 4;
			if ( ! data[ i + 3 ] ) {
				continue;
			}
			let color = [ data[ i ], data[ i + 1 ], data[ i + 2 ] ],
				height = 0;
			for ( const id of surfaces ) {
				const p = samplePattern(
					id,
					configs[ id ],
					x - x0,
					y - y0,
					( x - x0 ) / bw,
					( y - y0 ) / bh,
					color
				);
				color = p.color;
				height = p.height;
			}
			data[ i ] = color[ 0 ];
			data[ i + 1 ] = color[ 1 ];
			data[ i + 2 ] = color[ 2 ];
			heights[ j ] = height * relief * 2.8;
		}
	}
	const inner = fx.innerGlow,
		innerColor = inner ? rgb( inner.color, '#c2f5e2' ) : null;
	const inline = fx.inline,
		inlineColor = inline ? rgb( inline.color, '#f4e3ba' ) : null;
	const shine = fx.shine,
		shineAngle = ( ( shine?.angle ?? 118 ) * Math.PI ) / 180;
	const seed = fx.grunge?.seed || 7,
		grunge = number( fx.grunge?.amount, 34 ) / 100,
		grainScale = number( fx.grunge?.scale, 90, 20, 200 ) / 18;
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const j = y * w + x,
				i = j * 4;
			if ( ! data[ i + 3 ] ) {
				continue;
			}
			let color = [ data[ i ], data[ i + 1 ], data[ i + 2 ] ],
				alpha = data[ i + 3 ] / 255;
			const edge = bevelSize ? clamp( 1 - d[ j ] / bevelSize ) : 0,
				sign = fx.letterpress ? -1 : 1;
			const nx =
				( ( d[ j - 1 ] ?? d[ j ] ) - ( d[ j + 1 ] ?? d[ j ] ) ) *
					edge *
					sign *
					0.75 +
				( heights[ j - 1 ] || 0 ) -
				( heights[ j + 1 ] || 0 );
			const ny =
				( ( d[ j - w ] ?? d[ j ] ) - ( d[ j + w ] ?? d[ j ] ) ) *
					edge *
					sign *
					0.75 +
				( heights[ j - w ] || 0 ) -
				( heights[ j + w ] || 0 );
			const norm = Math.hypot( nx, ny, 1 ),
				lightValue = ( nx * lc + ny * ls + 0.85 ) / norm;
			if ( material ) {
				const conf = fx[ last ],
					polish =
						number( conf.shine, last === 'foil' ? 85 : 80 ) / 100;
				const env = clamp(
					0.47 +
						Math.sin(
							( ( ny / norm ) * 0.7 +
								( nx / norm ) * 0.25 +
								( ( y - y0 ) / bh ) * 0.5 ) *
								13
						) *
							0.39 +
						lightValue * 0.15
				);
				const contrast = number( conf.contrast, 75, 10, 100 ) / 100;
				color = color.map(
					( z ) => z * ( 0.25 + env * ( 0.8 + contrast ) )
				);
				const spec =
					Math.pow( clamp( lightValue ), 18 ) *
					( polish * 0.65 + 0.15 );
				color = mix( color, [ 255, 251, 238 ], spec );
				if (
					last === 'foil' &&
					hash( x, y, conf.seed || 7 ) >
						1 - number( conf.sparkles, 10, 0, 20 ) * 0.0002
				) {
					color = mix( color, [ 255, 249, 221 ], 0.85 );
				}
			} else if ( bevelSize || relief ) {
				const illumination =
					0.85 +
					lightValue * 0.25 -
					( fx.letterpress ? edge * 0.22 : 0 );
				color = color.map( ( z ) => z * illumination );
				const polish = number( bevel?.shine, 45 ) / 100;
				color = mix(
					color,
					[ 255, 250, 236 ],
					Math.pow( clamp( lightValue ), 22 ) * polish * edge * 0.6
				);
			}
			if ( inner ) {
				const edgeGlow = Math.exp(
					-d[ j ] /
						Math.max( 0.5, number( inner.size, 7, 1, 40 ) * 0.45 )
				);
				color = mix(
					color,
					innerColor,
					( edgeGlow * number( inner.intensity, 60 ) ) / 100
				);
			}
			if ( inline ) {
				const line = clamp(
					number( inline.width, 1, 1, 10 ) / 2 +
						0.5 -
						Math.abs( d[ j ] - number( inline.inset, 5, 1, 24 ) )
				);
				color = mix( color, inlineColor, line );
			}
			if ( shine ) {
				const pos = number( shine.pos, 34 ) / 100,
					width = number( shine.width, 20, 4, 90 ) / 100;
				const t =
					0.5 +
					( ( x - x0 ) / bw - 0.5 ) * Math.cos( shineAngle ) +
					( ( y - y0 ) / bh - 0.5 ) * Math.sin( shineAngle );
				const band =
					Math.exp( -Math.pow( ( t - pos ) / ( width * 0.42 ), 2 ) ) *
						0.75 +
					Math.exp(
						-Math.pow(
							( t - pos - width * 0.65 ) / ( width * 0.1 ),
							2
						)
					) *
						0.18;
				color = mix(
					color,
					[ 255, 251, 239 ],
					( band * number( shine.opacity, 75 ) ) / 100
				);
			}
			if ( fx.scanlines ) {
				const gap = number( fx.scanlines.gap, 5, 2, 14 ),
					lineWidth = number( fx.scanlines.width, 1, 1, 8 ),
					line = clamp(
						lineWidth - Math.abs( ( ( y - y0 ) % gap ) - gap * 0.5 )
					);
				color = color.map(
					( z ) =>
						z *
						( 1 -
							( line *
								number( fx.scanlines.opacity, 25, 5, 90 ) ) /
								100 )
				);
			}
			if ( fx.spray ) {
				const c = fx.spray,
					n = hash(
						Math.floor( x / number( c.grain, 2, 1, 8 ) ),
						Math.floor( y / number( c.grain, 2, 1, 8 ) ),
						11
					),
					amount = number( c.density, 42, 10, 100 ) / 100;
				const ink = clamp( ( n - ( 1 - amount ) ) * 7 );
				color = mix( color, rgb( c.color, '#5a8b98' ), ink );
				alpha *= 0.3 + 0.7 * ink;
			}
			if ( fx.grunge && grunge > 0 ) {
				const coarse = noise(
						( x - x0 ) / grainScale,
						( y - y0 ) / grainScale,
						seed
					),
					fine = hash( x, y, seed + 2 );
				const erosion = clamp(
					( coarse * 0.7 + fine * 0.3 - ( 0.86 - grunge * 0.63 ) ) * 4
				);
				alpha *= 1 - erosion * 0.94;
			}
			data[ i ] = clamp( color[ 0 ], 0, 255 );
			data[ i + 1 ] = clamp( color[ 1 ], 0, 255 );
			data[ i + 2 ] = clamp( color[ 2 ], 0, 255 );
			data[ i + 3 ] = Math.round( alpha * 255 );
		}
	}
	ctx.putImageData( image, 0, 0 );
	if ( fx.bubbles ) {
		paintBubbles( body, fx.bubbles, box );
	}
	if ( fx.cracks ) {
		paintCracks( body, fx.cracks, box );
	}
}

function paintBubbles( body, c, box ) {
	const ctx = body.getContext( '2d' ),
		{ x0, y0, x1, y1, w, alpha } = box,
		count = Math.round( number( c.count, 22, 4, 80 ) ),
		size = number( c.size, 6, 2, 20 ),
		col = rgb( c.color, '#d1edf0' ),
		shine = number( c.shine, 80 ) / 100;
	ctx.save();
	ctx.globalCompositeOperation = 'source-atop';
	for ( let k = 0; k < count; k++ ) {
		let x = x0,
			y = y0;
		for ( let t = 0; t < 16; t++ ) {
			x = x0 + hash( k, t, c.seed || 8 ) * ( x1 - x0 );
			y = y0 + hash( k + 3, t + 7, c.seed || 8 ) * ( y1 - y0 );
			if ( alpha[ Math.round( y ) * w + Math.round( x ) ] > 100 ) {
				break;
			}
		}
		const r = size * ( 0.5 + hash( k, 41, c.seed || 8 ) * 0.6 ),
			grad = ctx.createRadialGradient(
				x - r * 0.3,
				y - r * 0.35,
				0,
				x,
				y,
				r
			);
		grad.addColorStop( 0, css( [ 255, 255, 255 ], shine * 0.9 ) );
		grad.addColorStop( 0.3, css( col, 0.04 ) );
		grad.addColorStop( 0.78, css( col, 0.08 ) );
		grad.addColorStop( 0.94, css( col, 0.65 ) );
		grad.addColorStop( 1, css( [ 15, 32, 54 ], 0.48 ) );
		ctx.fillStyle = grad;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.restore();
}
function paintCracks( body, c, box ) {
	const ctx = body.getContext( '2d' ),
		{ x0, y0, x1, y1 } = box,
		count = Math.round( number( c.count, 7, 1, 14 ) ),
		width = number( c.width, 1, 1, 8 ),
		seed = c.seed || 9,
		col = rgb( c.color, '#365464' );
	ctx.save();
	ctx.globalCompositeOperation = 'source-atop';
	ctx.lineCap = 'round';
	const branch = ( x, y, angle, len, weight, tag ) => {
		ctx.beginPath();
		ctx.moveTo( x, y );
		const steps = Math.max( 3, Math.ceil( len / 7 ) );
		for ( let n = 0; n < steps; n++ ) {
			angle += ( hash( n, tag, seed ) - 0.5 ) * 1.2;
			x += ( Math.cos( angle ) * len ) / steps;
			y += ( Math.sin( angle ) * len ) / steps;
			ctx.lineTo( x, y );
		}
		ctx.lineWidth = weight;
		ctx.strokeStyle = css( col, 0.88 );
		ctx.stroke();
		ctx.save();
		ctx.translate( -0.7, -0.7 );
		ctx.lineWidth = weight * 0.35;
		ctx.strokeStyle = 'rgba(255,248,221,0.62)';
		ctx.stroke();
		ctx.restore();
		return [ x, y ];
	};
	for ( let i = 0; i < count; i++ ) {
		const x = x0 + hash( i, 1, seed ) * ( x1 - x0 ),
			y = y0 + hash( i, 2, seed ) * ( y1 - y0 ),
			a = hash( i, 3, seed ) * Math.PI * 2,
			len = ( y1 - y0 ) * ( 0.35 + hash( i, 4, seed ) * 0.7 );
		const p = branch( x, y, a, len, width, i + 10 );
		branch(
			( x + p[ 0 ] ) / 2,
			( y + p[ 1 ] ) / 2,
			a + 0.8,
			len * 0.48,
			width * 0.6,
			i + 100
		);
		branch( p[ 0 ], p[ 1 ], a - 0.7, len * 0.32, width * 0.45, i + 200 );
	}
	ctx.restore();
}

/** Cover-fit plus explicit crop controls; empty margins remain truly transparent. */
export function paintTextImage( body, image, conf, pad, w, h ) {
	const iw = image.naturalWidth || image.width || 1,
		ih = image.naturalHeight || image.height || 1;
	const scale =
		( Math.max( w / iw, h / ih ) * number( conf.zoom, 100, 50, 300 ) ) /
		100;
	const c = createCanvas( body.width, body.height ),
		g = c.getContext( '2d' );
	g.drawImage(
		image,
		pad +
			( w - iw * scale ) / 2 +
			( number( conf.x, 0, -100, 100 ) / 100 ) * w * 0.5,
		pad +
			( h - ih * scale ) / 2 +
			( number( conf.y, 0, -100, 100 ) / 100 ) * h * 0.5,
		iw * scale,
		ih * scale
	);
	g.globalCompositeOperation = 'destination-in';
	g.drawImage( body, 0, 0 );
	const ctx = body.getContext( '2d' );
	ctx.save();
	ctx.globalCompositeOperation = 'copy';
	ctx.drawImage( c, 0, 0 );
	ctx.restore();
}

/** Conservative combined displacement of post-material filters. */
export function textBodyReach( layer ) {
	const fx = layer.textFX || {};
	const n =
		( fx.glitch ? number( fx.glitch.strength, 10, 0, 60 ) : 0 ) +
		( fx.ripple ? number( fx.ripple.amp, 5, 0, 30 ) : 0 ) +
		( fx.softBlur ? number( fx.softBlur.amount, 4, 0, 30 ) * 2 : 0 );
	return n ? Math.ceil( n ) + 3 : 0;
}
