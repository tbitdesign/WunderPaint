/**
 * Original procedural text treatments. Shared lighting is driven by distinct
 * material fields; geometry families work on the actual glyph mask. No assets.
 */
import { createCanvas } from './env';
import { blurCanvas } from './styles';
import { COLLECTION_EFFECT_BY_ID } from '../text-effects-collection';

const PI = Math.PI,
	TAU = PI * 2;
const clamp = ( x, a = 0, b = 1 ) => Math.max( a, Math.min( b, x ) );
const num = ( v, fallback, min, max ) =>
	clamp( Number.isFinite( +v ) ? +v : fallback, min, max );
const mix = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );
const css = ( rgb ) =>
	`rgb(${ rgb
		.map( ( v ) => Math.round( clamp( v, 0, 255 ) ) )
		.join( ',' ) })`;
const hash = ( x, y ) => {
	const n = Math.sin( x * 127.1 + y * 311.7 ) * 43758.5453;
	return n - Math.floor( n );
};
const smooth = ( t ) => t * t * ( 3 - 2 * t );
function noise( x, y ) {
	const ix = Math.floor( x ),
		iy = Math.floor( y ),
		u = smooth( x - ix ),
		v = smooth( y - iy );
	const a = hash( ix, iy ),
		b = hash( ix + 1, iy ),
		c = hash( ix, iy + 1 ),
		d = hash( ix + 1, iy + 1 );
	return ( a + ( b - a ) * u ) * ( 1 - v ) + ( c + ( d - c ) * u ) * v;
}
function cells( x, y ) {
	const ix = Math.floor( x ),
		iy = Math.floor( y );
	let first = 20,
		second = 20,
		seed = 0;
	for ( let j = -1; j <= 1; j++ ) {
		for ( let i = -1; i <= 1; i++ ) {
			const sx = ix + i,
				sy = iy + j,
				h = hash( sx, sy );
			const dx = sx + 0.15 + h * 0.7 - x,
				dy = sy + 0.15 + hash( sx + 21, sy - 7 ) * 0.7 - y;
			const d = dx * dx + dy * dy;
			if ( d < first ) {
				second = first;
				first = d;
				seed = h;
			} else if ( d < second ) {
				second = d;
			}
		}
	}
	return [
		Math.sqrt( first ),
		Math.sqrt( second ) - Math.sqrt( first ),
		seed,
	];
}
function active( fx ) {
	const slots = {};
	for ( const id of Object.keys( fx || {} ) ) {
		const item = COLLECTION_EFFECT_BY_ID[ id ];
		if ( item && fx[ id ] ) {
			slots[ item.slot ] = { item, conf: { ...item.def, ...fx[ id ] } };
		}
	}
	return slots;
}
function layout( layer, size, budget ) {
	const slots = active( layer.textFX );
	const raw = {
		volume: slots.volume
			? Math.min(
					96,
					( size * num( slots.volume.conf.depth, 58, 5, 100 ) ) / 100
			  ) *
					1.5 +
			  3
			: 0,
		fragments: slots.fragments
			? Math.min(
					44,
					size *
						( 0.06 +
							num( slots.fragments.conf.amount, 45, 0, 100 ) /
								700 +
							num( slots.fragments.conf.depth, 35, 0, 100 ) /
								1200 )
			  ) + 3
			: 0,
		light: slots.light
			? Math.min(
					8,
					( size * num( slots.light.conf.glow, 40, 0, 100 ) ) / 800
			  ) *
					3 +
			  3
			: 0,
		contour: slots.contour
			? Math.min(
					32,
					( size * num( slots.contour.conf.depth, 50, 5, 100 ) ) / 300
			  ) + 3
			: 0,
	};
	const total = Object.values( raw ).reduce( ( a, b ) => a + b, 0 );
	const factor = Math.min( 1, Math.max( 0, budget ) / Math.max( 1, total ) );
	return { slots, factor, raw, reach: Math.ceil( total * factor ) };
}
export function collectionTextReach( layer, size, budget = 530 ) {
	return layout( layer, size, budget ).reach;
}

// The field controls both pigment and surface height; finishes are not recolors.
function field( mode, x, y ) {
	const r = Math.hypot( x + 0.32, y - 0.18 );
	switch ( mode ) {
		case 'mercury':
			return (
				Math.sin( x * 2.8 + Math.sin( y * 3.4 ) * 1.2 ) * 0.45 +
				Math.cos( y * 2.3 - x ) * 0.2
			);
		case 'anodized':
			return (
				Math.sin( x * 5 + y * 1.7 ) * 0.5 + Math.sin( y * 70 ) * 0.045
			);
		case 'hammered':
			return Math.cos( cells( x * 3, y * 3 )[ 0 ] * PI ) * 0.6;
		case 'brushed':
			return (
				( noise( x * 0.6, y * 70 ) - 0.5 ) * 0.5 +
				Math.sin( y * 190 ) * 0.05
			);
		case 'engraved':
			return (
				Math.pow(
					Math.abs( Math.sin( x * 17 + Math.sin( y * 6 ) * 2 ) ),
					12
				) * -0.65
			);
		case 'frosted':
			return ( noise( x * 45, y * 45 ) - 0.5 ) * 0.36;
		case 'dichroic':
			return Math.sin( x * 4.5 + y * 3 + Math.sin( y * 5 ) ) * 0.5;
		case 'stained': {
			const c = cells( x * 2.8, y * 2.8 );
			return c[ 1 ] < 0.055 ? -0.85 : c[ 2 ] * 1.25 - 0.4;
		}
		case 'smoked':
			return Math.sin( x * 2 + Math.sin( y * 2 ) ) * 0.1;
		case 'lens':
			return Math.sin( r * 9 + Math.sin( x * 3 ) ) * 0.38;
		case 'porcelain':
			return (
				Math.sin( x * 3 + y ) * 0.07 +
				( noise( x * 28, y * 28 ) - 0.5 ) * 0.015
			);
		case 'velvet':
			return (
				( noise( x * 70, y * 90 ) - 0.5 ) * 0.28 +
				Math.sin( y * 10 + x ) * 0.05
			);
		case 'satin':
			return Math.sin( y * 6 + Math.sin( x * 2.1 ) * 2 ) * 0.6;
		case 'gel':
			return Math.sin( r * 4 ) * 0.1 + Math.sin( x * 5 + y * 3 ) * 0.045;
		case 'rubber':
			return (
				( noise( x * 15, y * 15 ) - 0.5 ) * 0.2 +
				Math.sin( x * 4 + y * 3 ) * 0.06
			);
		case 'carbon': {
			const u = Math.floor( x * 9 ),
				v = Math.floor( y * 9 );
			return (
				( ( u + v ) % 2
					? Math.sin( x * 9 * PI )
					: Math.sin( y * 9 * PI ) ) * 0.42
			);
		}
		case 'silk':
			return (
				Math.sin( x * 70 ) * 0.12 +
				Math.sin( y * 35 + Math.sin( x * 8 ) ) * 0.28
			);
		case 'guilloche':
			return (
				Math.pow(
					Math.abs(
						Math.sin( x * 24 + Math.sin( y * 9 ) * 3 ) *
							Math.sin( y * 20 + Math.sin( x * 8 ) * 3 )
					),
					4
				) *
					0.8 -
				0.25
			);
		case 'circuit': {
			const u = x * 5,
				v = y * 5,
				ix = Math.floor( u ),
				iy = Math.floor( v ),
				fx = u - ix,
				fy = v - iy;
			const rr =
				hash( ix, iy ) > 0.5
					? Math.hypot( fx, fy )
					: Math.hypot( 1 - fx, fy );
			return Math.exp( -Math.pow( ( rr - 0.6 ) * 22, 2 ) ) * 0.8 - 0.3;
		}
		case 'moire':
			return Math.sin( x * 32 + y * 7 ) * Math.sin( r * 33 ) * 0.52;
		case 'marble': {
			const t =
				x * 4 +
				y * 1.2 +
				noise( x * 3, y * 3 ) * 8 +
				noise( x * 9, y * 9 ) * 1.2;
			return Math.pow( Math.abs( Math.sin( t ) ), 16 ) * -0.8 + 0.15;
		}
		case 'agate':
			return Math.sin( ( r + noise( x * 2, y * 2 ) * 0.3 ) * 24 ) * 0.48;
		case 'malachite':
			return (
				Math.sin(
					Math.hypot( x + Math.sin( y * 2 ) * 0.5, y * 1.2 ) * 31 +
						noise( x * 4, y * 4 ) * 2
				) * 0.5
			);
		case 'crystal': {
			const c = cells( x * 2.5, y * 2.5 );
			return c[ 2 ] * 0.8 + c[ 0 ] * 0.7 - 0.5;
		}
		case 'topography': {
			const t = noise( x * 2, y * 2 ) + noise( x * 4, y * 4 ) * 0.35;
			return Math.floor( t * 9 ) / 9 - 0.5;
		}
		default:
			return 0;
	}
}
function finish( body, layer, effect, helper ) {
	const { conf, item } = effect,
		mode = item.mode;
	const ctx = body.getContext( '2d' ),
		image = ctx.getImageData( 0, 0, body.width, body.height );
	const box = helper.distances( image );
	if ( box.empty ) {
		return body;
	}
	const { w, h, d, x0, x1, y0, y1 } = box,
		size = helper.unit( layer );
	const c1 = helper.rgb( conf.color ),
		c2 = helper.rgb( conf.color2 );
	const angle = ( num( conf.angle, 125, 0, 360 ) * PI ) / 180,
		ca = Math.cos( angle ),
		sa = Math.sin( angle );
	const wavelength = Math.max(
		5,
		size * ( 0.12 + num( conf.scale, 45, 5, 100 ) / 150 )
	);
	const depth = num( conf.depth, 48, 0, 100 ) / 100,
		shine = num( conf.shine, 75, 0, 100 ) / 100;
	const bevel = Math.max( 1.5, size * ( 0.025 + depth * 0.11 ) );
	const values = new Float32Array( w * h ),
		heights = new Float32Array( w * h );
	for ( let y = Math.max( 0, y0 - 2 ); y <= Math.min( h - 1, y1 + 2 ); y++ ) {
		for (
			let x = Math.max( 0, x0 - 2 );
			x <= Math.min( w - 1, x1 + 2 );
			x++
		) {
			const i = y * w + x,
				u = ( x - x0 ) / wavelength,
				v = ( y - y0 ) / wavelength;
			const f = field( mode, u * ca - v * sa, u * sa + v * ca );
			values[ i ] = f;
			const profile = Math.sin(
				( Math.min( 1, d[ i ] / bevel ) * PI ) / 2
			);
			heights[ i ] = profile * ( bevel + f * size * 0.035 * depth );
		}
	}
	const metal = item.group === 'metal',
		glass = item.group === 'glass';
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const i = y * w + x,
				p = i * 4;
			if ( ! image.data[ p + 3 ] ) {
				continue;
			}
			let nx =
				( heights[ y * w + Math.max( 0, x - 1 ) ] -
					heights[ y * w + Math.min( w - 1, x + 1 ) ] ) /
				2;
			let ny =
				( heights[ Math.max( 0, y - 1 ) * w + x ] -
					heights[ Math.min( h - 1, y + 1 ) * w + x ] ) /
				2;
			const norm = Math.hypot( nx, ny, 1 );
			nx /= norm;
			ny /= norm;
			const nz = 1 / norm,
				light = nx * ca - ny * sa,
				f = values[ i ];
			const v = ( y - y0 ) / Math.max( 1, y1 - y0 ),
				u = ( x - x0 ) / Math.max( 1, x1 - x0 );
			const spec =
				Math.pow(
					Math.max( 0, nz * 0.9 + light * 0.45 ),
					metal ? 18 : 22
				) * shine;
			let pigment = clamp( 0.28 + f * 0.85 + v * 0.22 );
			if ( mode === 'marble' ) {
				pigment = clamp( -f * 1.1 );
			}
			if ( mode === 'circuit' ) {
				pigment = f > 0 ? 0 : 0.94;
			}
			if ( mode === 'porcelain' || mode === 'rubber' || mode === 'gel' ) {
				pigment *= 0.4;
			}
			let color = mix( c1, c2, pigment );
			let lighting = 0.64 + nz * 0.34 + light * 0.3;
			if ( item.group === 'soft' ) {
				lighting = 0.35 + nz * 0.5 + light * 0.38;
			}
			if ( glass ) {
				lighting = 0.5 + nz * 0.34 + light * 0.35;
			}
			if ( metal ) {
				const reflection = ny * 1.2 + v * 0.7 + f * 0.35;
				const band = Math.exp(
					-Math.pow( ( reflection - 0.35 ) / 0.15, 2 )
				);
				lighting = clamp(
					0.3 +
						band * 0.85 +
						light * 0.25 +
						Math.sin( reflection * 11 ) * 0.13,
					0.1,
					1.3
				);
			}
			if ( mode === 'dichroic' || mode === 'anodized' ) {
				const phase = f * 5 + nx * 2 + u * 3;
				const spectrum = [ 0, 2.094, 4.189 ].map(
					( offset ) => 160 + 95 * Math.cos( phase + offset )
				);
				color = mix(
					color,
					spectrum,
					mode === 'dichroic' ? 0.62 : 0.38
				);
			}
			if ( mode === 'stained' && f < -0.7 ) {
				color = mix( c2, [ 12, 17, 28 ], 0.8 );
				lighting = 0.7;
			}
			if ( mode === 'velvet' ) {
				lighting =
					0.52 + nz * 0.32 + Math.abs( light ) * 0.75 + f * 0.2;
			}
			if ( mode === 'carbon' ) {
				lighting *= 0.72;
			}
			const polish =
				spec * ( mode === 'velvet' || mode === 'rubber' ? 38 : 140 );
			for ( let k = 0; k < 3; k++ ) {
				image.data[ p + k ] = color[ k ] * lighting + polish;
			}
			if ( glass && mode !== 'stained' ) {
				const alpha =
					mode === 'smoked' ? 0.48 : mode === 'frosted' ? 0.82 : 0.66;
				image.data[ p + 3 ] *= clamp(
					alpha + ( 1 - nz ) * 0.5 + spec * 0.3
				);
			}
		}
	}
	ctx.putImageData( image, 0, 0 );
	return body;
}
function maskTint( source, color, target ) {
	const out = target || createCanvas( source.width, source.height ),
		g = out.getContext( '2d' );
	g.clearRect( 0, 0, out.width, out.height );
	g.drawImage( source, 0, 0 );
	g.globalCompositeOperation = 'source-in';
	g.fillStyle = css( color );
	g.fillRect( 0, 0, out.width, out.height );
	g.globalCompositeOperation = 'source-over';
	return out;
}
function bounds( body, helper ) {
	return helper.distances(
		body.getContext( '2d' ).getImageData( 0, 0, body.width, body.height )
	);
}
function volume( body, layer, effect, helper, reach ) {
	const box = bounds( body, helper );
	if ( box.empty ) {
		return body;
	}
	const { conf, item } = effect,
		mode = item.mode;
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' ),
		plate = createCanvas( body.width, body.height );
	const cx = ( box.x0 + box.x1 ) / 2,
		cy = ( box.y0 + box.y1 ) / 2,
		radius = Math.hypot( box.x1 - box.x0, box.y1 - box.y0 ) / 2 + 1;
	const depth = Math.max( 0, reach - 3 ) / 1.5,
		amount = num( conf.amount, 60, 0, 100 ) / 100;
	const count = Math.round( num( conf.count, 20, 6, 30 ) ),
		angle = ( num( conf.angle, 60, 0, 360 ) * PI ) / 180;
	const dx = Math.cos( angle ),
		dy = Math.sin( angle ),
		c1 = helper.rgb( conf.color ),
		c2 = helper.rgb( conf.color2 );
	const turn = Math.min( 0.3, ( depth * 0.3 ) / radius );
	for ( let i = count; i > 0; i-- ) {
		const t = i / count,
			phase = t * TAU,
			branches = mode === 'split' || mode === 'woven' ? 2 : 1;
		for ( let b = 0; b < branches; b++ ) {
			const sign = b ? -1 : 1;
			let x = dx * depth * t,
				y = dy * depth * t,
				rotation = 0,
				scaleX = 1,
				scaleY = 1,
				shear = 0;
			switch ( mode ) {
				case 'twist':
					rotation = turn * amount * Math.sin( t * PI * 1.6 );
					scaleX = scaleY = 1 - t * amount * 0.18;
					break;
				case 'fan':
					rotation = turn * amount * t;
					x += dy * depth * amount * t * 0.2;
					y -= dx * depth * amount * t * 0.2;
					break;
				case 'accordion':
					x += -dy * depth * 0.22 * amount * Math.sin( phase * 2.5 );
					y += dx * depth * 0.22 * amount * Math.sin( phase * 2.5 );
					scaleY = 1 - t * amount * 0.12;
					break;
				case 'orbit':
					x = Math.cos( phase + angle ) * depth * amount;
					y = Math.sin( phase + angle ) * depth * amount * 0.55;
					scaleX = scaleY = 0.92 + 0.08 * Math.cos( phase );
					break;
				case 'radial':
					x =
						Math.cos( phase + angle ) *
						depth *
						( 0.35 + amount * 0.65 );
					y =
						Math.sin( phase + angle ) *
						depth *
						( 0.35 + amount * 0.65 );
					scaleX = scaleY = 1 - amount * 0.12;
					break;
				case 'taper':
					scaleX = scaleY = 1 - t * ( 0.12 + amount * 0.65 );
					break;
				case 'steps': {
					const step =
						Math.ceil( t * ( 3 + amount * 5 ) ) /
						( 3 + amount * 5 );
					x = dx * depth * t;
					y = dy * depth * step;
					scaleX = scaleY = 1 - amount * t * 0.12;
					break;
				}
				case 'split': {
					const bend =
						Math.sin( t * PI ) * depth * 0.38 * amount * sign;
					x -= dy * bend;
					y += dx * bend;
					scaleX = scaleY = 1 - t * 0.2;
					break;
				}
				case 'woven': {
					const bend =
						Math.sin( phase * 1.5 ) * depth * 0.38 * amount * sign;
					x -= dy * bend;
					y += dx * bend;
					scaleX = scaleY = 1 - t * 0.18;
					break;
				}
				case 'isometric':
					shear =
						( depth * 0.3 * t * amount ) /
						Math.max( 1, box.y1 - box.y0 );
					scaleY = 1 - amount * t * 0.2;
					break;
			}
			const color = mix( c1, c2, branches > 1 && b ? 1 - t : t );
			const shade =
				0.68 +
				0.32 * Math.cos( phase * ( mode === 'accordion' ? 4 : 1.5 ) );
			maskTint(
				body,
				color.map( ( v ) => v * shade ),
				plate
			);
			g.save();
			g.translate( cx + x, cy + y );
			g.rotate( rotation );
			g.transform( scaleX, 0, shear, scaleY, 0, 0 );
			g.drawImage( plate, -cx, -cy );
			g.restore();
		}
	}
	g.drawImage( body, 0, 0 );
	return out;
}
function fragments( body, layer, effect, helper, reach ) {
	const box = bounds( body, helper );
	if ( box.empty ) {
		return body;
	}
	const { conf, item } = effect,
		mode = item.mode;
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const c1 = helper.rgb( conf.color ),
		c2 = helper.rgb( conf.color2 );
	const amount = num( conf.amount, 45, 0, 100 ) / 100,
		depth = num( conf.depth, 35, 0, 100 ) / 100;
	const angle = ( num( conf.angle, 20, 0, 360 ) * PI ) / 180,
		dx = Math.cos( angle ),
		dy = Math.sin( angle );
	const w = box.x1 - box.x0 + 1,
		h = box.y1 - box.y0 + 1;
	const step = Math.max(
		9,
		helper.unit( layer ) * ( 0.09 + num( conf.scale, 45, 5, 100 ) / 180 ),
		Math.sqrt( ( w * h ) / 120 )
	);
	const pieces = [];
	if ( mode === 'venetian' ) {
		for ( let y = box.y0; y <= box.y1; y += step * 0.5 ) {
			pieces.push( [
				[ box.x0 - 1, y ],
				[ box.x1 + 1, y ],
				[ box.x1 + 1, y + step * 0.5 + 1 ],
				[ box.x0 - 1, y + step * 0.5 + 1 ],
			] );
		}
	} else if ( mode === 'fold' || mode === 'weave' ) {
		const slant = mode === 'weave' ? 0.4 : -0.15;
		for ( let x = box.x0 - h; x <= box.x1 + h; x += step ) {
			pieces.push( [
				[ x, box.y0 - 1 ],
				[ x + step + 0.7, box.y0 - 1 ],
				[ x + step + slant * h + 0.7, box.y1 + 1 ],
				[ x + slant * h, box.y1 + 1 ],
			] );
		}
	} else {
		for ( let y = box.y0; y <= box.y1; y += step ) {
			for ( let x = box.x0; x <= box.x1; x += step ) {
				if ( mode === 'shards' ) {
					pieces.push(
						[
							[ x, y ],
							[ x + step + 0.6, y ],
							[ x, y + step + 0.6 ],
						],
						[
							[ x + step + 0.6, y ],
							[ x + step + 0.6, y + step + 0.6 ],
							[ x, y + step + 0.6 ],
						]
					);
				} else {
					pieces.push( [
						[ x, y ],
						[ x + step + 0.6, y ],
						[ x + step + 0.6, y + step + 0.6 ],
						[ x, y + step + 0.6 ],
					] );
				}
			}
		}
	}
	const plate = createCanvas( body.width, body.height ),
		pg = plate.getContext( '2d' );
	const maxMove = Math.max( 0, reach - 3 );
	pieces.forEach( ( points, index ) => {
		const cx = points.reduce( ( n, p ) => n + p[ 0 ], 0 ) / points.length,
			cy = points.reduce( ( n, p ) => n + p[ 1 ], 0 ) / points.length;
		pg.clearRect( 0, 0, plate.width, plate.height );
		pg.save();
		pg.beginPath();
		points.forEach( ( p, n ) =>
			n ? pg.lineTo( ...p ) : pg.moveTo( ...p )
		);
		pg.closePath();
		pg.clip();
		pg.drawImage( body, 0, 0 );
		pg.restore();
		pg.globalCompositeOperation = 'source-atop';
		const tint = mix( c1, c2, 0.15 + 0.7 * hash( index, 4 ) );
		const grad = pg.createLinearGradient(
			cx - step / 2,
			cy - step / 2,
			cx + step / 2,
			cy + step / 2
		);
		grad.addColorStop( 0, css( mix( tint, [ 255, 255, 255 ], 0.7 ) ) );
		grad.addColorStop( 0.46, css( tint ) );
		grad.addColorStop(
			0.5,
			css( mix( tint, [ 18, 25, 48 ], depth * 0.65 ) )
		);
		grad.addColorStop( 1, css( mix( tint, [ 255, 255, 255 ], 0.15 ) ) );
		pg.fillStyle = grad;
		pg.globalAlpha = 0.7;
		pg.fillRect( 0, 0, plate.width, plate.height );
		pg.globalAlpha = 1;
		pg.globalCompositeOperation = 'source-over';
		const alternate = index % 2 ? 1 : -1,
			rnd = hash( index, 37 ) * 2 - 1;
		let mx = dx * maxMove * amount * 0.45 * alternate,
			my = dy * maxMove * amount * 0.45 * alternate,
			sx = 1,
			sy = 1;
		if ( mode === 'shards' ) {
			mx = Math.cos( angle + index * 2.4 ) * maxMove * amount * 0.6;
			my = Math.sin( angle + index * 2.4 ) * maxMove * amount * 0.6;
		}
		if ( mode === 'tiles' ) {
			mx =
				( ( cx - box.x0 - w / 2 ) / Math.max( w, 1 ) ) *
					maxMove *
					amount +
				dx * rnd * maxMove * 0.12;
			my =
				( ( cy - box.y0 - h / 2 ) / Math.max( h, 1 ) ) *
					maxMove *
					amount +
				dy * rnd * maxMove * 0.12;
			sx = sy = 1 - amount * 0.18;
		}
		if ( mode === 'venetian' ) {
			sy = 1 - amount * 0.34;
		}
		if ( mode === 'fold' ) {
			sx = 1 - amount * 0.22;
			mx = dx * alternate * maxMove * amount * 0.3;
		}
		const side = maskTint( plate, mix( tint, [ 17, 24, 41 ], 0.64 ) );
		const thick = Math.min( 8, maxMove * 0.22 * depth );
		g.save();
		g.translate( cx + mx, cy + my );
		g.scale( sx, sy );
		for ( let z = Math.ceil( thick ); z > 0; z-- ) {
			g.drawImage( side, -cx + z * 0.5, -cy + z );
		}
		g.drawImage( plate, -cx, -cy );
		g.restore();
	} );
	return out;
}
function lights( body, layer, effect, helper, reach ) {
	const box = bounds( body, helper );
	if ( box.empty ) {
		return body;
	}
	const { conf, item } = effect,
		mode = item.mode;
	const image = body
			.getContext( '2d' )
			.getImageData( 0, 0, body.width, body.height ),
		glowImage = body
			.getContext( '2d' )
			.getImageData( 0, 0, body.width, body.height );
	const c1 = helper.rgb( conf.color ),
		c2 = helper.rgb( conf.color2 ),
		size = helper.unit( layer );
	const angle = ( num( conf.angle, 35, 0, 360 ) * PI ) / 180,
		ca = Math.cos( angle ),
		sa = Math.sin( angle );
	const wavelength = Math.max(
			6,
			size * ( 0.1 + num( conf.scale, 45, 5, 100 ) / 150 )
		),
		strength = num( conf.amount, 80, 5, 100 ) / 100;
	for ( let y = box.y0; y <= box.y1; y++ ) {
		for ( let x = box.x0; x <= box.x1; x++ ) {
			const i = y * body.width + x,
				p = i * 4;
			if ( ! image.data[ p + 3 ] ) {
				continue;
			}
			const u = ( x - box.x0 ) / wavelength,
				v = ( y - box.y0 ) / wavelength,
				a = u * ca - v * sa,
				b = u * sa + v * ca;
			let beam = 0;
			if ( mode === 'plasma' ) {
				beam = Math.pow(
					Math.max(
						0,
						1 -
							Math.abs(
								Math.sin( a * 9 + noise( a * 4, b * 6 ) * 7 )
							)
					),
					7
				);
			}
			if ( mode === 'lattice' ) {
				beam = Math.pow(
					Math.max(
						Math.abs( Math.cos( ( a + b ) * 10 ) ),
						Math.abs( Math.cos( ( a - b ) * 10 ) )
					),
					25
				);
			}
			if ( mode === 'spectral' ) {
				beam = Math.exp(
					-Math.pow(
						( box.d[ i ] - ( 1.5 + Math.sin( a * 6 ) ) ) /
							( 0.8 + size / 90 ),
						2
					)
				);
			}
			if ( mode === 'sweep' ) {
				beam = Math.pow(
					Math.max( 0, Math.cos( a * 5 + Math.sin( b ) * 0.5 ) ),
					18
				);
			}
			if ( mode === 'caustic' ) {
				beam = Math.pow(
					Math.max(
						0,
						Math.sin( a * 8 + Math.cos( b * 5 ) ) *
							Math.sin( b * 8 + Math.cos( a * 5 ) )
					),
					4
				);
			}
			const color = mix( c1, c2, 0.5 + Math.sin( a * 3 + b * 2 ) * 0.5 );
			for ( let k = 0; k < 3; k++ ) {
				image.data[ p + k ] =
					image.data[ p + k ] * 0.08 +
					color[ k ] * ( 0.22 + beam * strength * 1.65 ) +
					Math.pow( beam, 4 ) * strength * 140;
				glowImage.data[ p + k ] = color[ k ];
			}
			glowImage.data[ p + 3 ] *= Math.sqrt( beam ) * strength;
		}
	}
	const face = createCanvas( body.width, body.height ),
		aura = createCanvas( body.width, body.height );
	face.getContext( '2d' ).putImageData( image, 0, 0 );
	aura.getContext( '2d' ).putImageData( glowImage, 0, 0 );
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const radius = Math.max( 0, reach - 3 ) / 3;
	if ( radius > 0 ) {
		g.globalAlpha = 0.85;
		g.drawImage( blurCanvas( aura, radius ), 0, 0 );
		g.globalAlpha = 1;
	}
	g.drawImage( face, 0, 0 );
	return out;
}
function contours( body, layer, effect, helper, reach ) {
	const box = bounds( body, helper );
	if ( box.empty ) {
		return body;
	}
	const { conf, item } = effect,
		mode = item.mode,
		size = helper.unit( layer );
	const c1 = helper.rgb( conf.color ),
		c2 = helper.rgb( conf.color2 );
	const image = body
		.getContext( '2d' )
		.getImageData( 0, 0, body.width, body.height );
	const width = Math.max(
		0.65,
		( size * num( conf.width, 12, 3, 30 ) ) / 700
	);
	const angle = ( num( conf.angle, 35, 0, 360 ) * PI ) / 180,
		ca = Math.cos( angle ),
		sa = Math.sin( angle );
	const n = Math.round( num( conf.count, 12, 4, 24 ) ),
		amount = num( conf.amount, 45, 0, 100 ) / 100;
	const extent = Math.max( 0, reach - 3 ) / ( mode === 'ripple' ? 1.25 : 1 ),
		cx = ( box.x0 + box.x1 ) / 2,
		cy = ( box.y0 + box.y1 ) / 2;
	for ( let y = box.y0; y <= box.y1; y++ ) {
		for ( let x = box.x0; x <= box.x1; x++ ) {
			const i = y * body.width + x,
				p = i * 4;
			let line = clamp( width + 0.75 - box.d[ i ] );
			if ( mode === 'landscape' ) {
				const gap = Math.max( 1.5, size / ( n * 1.4 ) ),
					wave =
						Math.sin(
							( x * ca + y * sa ) / Math.max( 5, size / 8 )
						) * amount;
				const d = box.d[ i ] + wave;
				line = Math.exp(
					-Math.pow(
						( Math.sin( ( d / gap ) * PI ) * gap ) /
							( width * 0.5 + 0.25 ),
						2
					)
				);
			}
			if ( mode === 'segmented' ) {
				line *=
					Math.sin(
						( x * ca + y * sa ) / Math.max( 2, size / ( n * 2 ) )
					) >
					-0.2 + amount * 0.7
						? 1
						: 0.12;
			}
			image.data[ p + 3 ] *= line;
		}
	}
	const edge = createCanvas( body.width, body.height ),
		plate = createCanvas( body.width, body.height );
	edge.getContext( '2d' ).putImageData( image, 0, 0 );
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const keyline = body
		.getContext( '2d' )
		.getImageData( 0, 0, body.width, body.height );
	for ( let i = 0; i < box.d.length; i++ ) {
		keyline.data[ i * 4 + 3 ] *= clamp( 1.8 - box.d[ i ] );
	}
	const keyCanvas = createCanvas( body.width, body.height );
	keyCanvas.getContext( '2d' ).putImageData( keyline, 0, 0 );
	maskTint( keyCanvas, mix( c2, [ 12, 20, 30 ], 0.65 ), plate );
	for ( let i = 0; i < 8; i++ ) {
		g.drawImage(
			plate,
			Math.cos( ( i * PI ) / 4 ) * 0.65,
			Math.sin( ( i * PI ) / 4 ) * 0.65
		);
	}
	g.globalAlpha = 0.16;
	g.drawImage( maskTint( body, mix( c2, [ 10, 15, 25 ], 0.4 ) ), 0, 0 );
	g.globalAlpha = 1;
	const count = mode === 'landscape' ? 1 : n;
	const radius = Math.hypot( box.x1 - box.x0, box.y1 - box.y0 ) / 2 + 1;
	for ( let i = count; i >= 0; i-- ) {
		const t = i / count,
			color = mix( c1, c2, t );
		maskTint( edge, color, plate );
		let tx = ca * extent * t,
			ty = sa * extent * t,
			scale = 1,
			rotate = 0;
		if ( mode === 'landscape' ) {
			tx *= 0.35;
			ty *= 0.35;
		}
		if ( mode === 'portal' ) {
			scale = 1 - t * ( 0.2 + amount * 0.65 );
			rotate = t * amount * Math.min( 0.2, ( extent * 0.2 ) / radius );
			tx *= 0.65;
			ty *= 0.65;
		}
		if ( mode === 'offset' ) {
			scale = 1 - t * amount * 0.25;
			tx += -sa * extent * 0.15 * Math.sin( t * PI ) * amount;
			ty += ca * extent * 0.15 * Math.sin( t * PI ) * amount;
		}
		if ( mode === 'segmented' ) {
			scale = 1 - t * 0.4;
			tx *= 0.5;
			ty *= 0.5;
		}
		g.save();
		g.translate( cx + tx, cy + ty );
		g.rotate( rotate );
		g.scale( scale, scale );
		if ( mode === 'ripple' ) {
			for ( let y = 0; y < plate.height; y++ ) {
				const wave =
					Math.sin( y / Math.max( 6, size / 8 ) + t * TAU ) *
					extent *
					0.24 *
					amount;
				g.drawImage(
					plate,
					0,
					y,
					plate.width,
					1,
					-cx + wave,
					y - cy,
					plate.width,
					1
				);
			}
		} else {
			g.drawImage( plate, -cx, -cy );
		}
		g.restore();
	}
	return out;
}

/** Paint active independent families in a stable order, using one shared budget. */
export function paintTextCollection( body, layer, helper, budget = 530 ) {
	const config = layout( layer, helper.unit( layer ), budget );
	let result = body;
	for ( const [ slot, draw ] of [
		[ 'finish', finish ],
		[ 'light', lights ],
		[ 'contour', contours ],
		[ 'fragments', fragments ],
		[ 'volume', volume ],
	] ) {
		if ( config.slots[ slot ] ) {
			result = draw(
				result,
				layer,
				config.slots[ slot ],
				helper,
				config.raw[ slot ] * config.factor
			);
		}
	}
	return result;
}
