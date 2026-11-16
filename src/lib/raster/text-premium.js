/**
 * Five live text treatments. Original WunderPaint implementation: glyph-distance
 * lighting, translucent dispersion, curved ribbons, faceted slices and a
 * perspective contour tunnel. All dimensions follow the font, with bounded
 * scratch-buffer reach. No external textures, shaders or assets.
 */
import { createCanvas } from './env';
import { maxTextSize } from './text-metrics';
import { COLLECTION_TEXT_KEYS } from '../text-effects-collection';
import { collectionTextReach, paintTextCollection } from './text-collection';

export const PREMIUM_TEXT_KEYS = [
	'liquidMetal',
	'dichroicGlass',
	'ribbonFlow',
	'prismCut',
	'contourTunnel',
	...COLLECTION_TEXT_KEYS,
];
export const hasPremiumText = ( fx ) =>
	PREMIUM_TEXT_KEYS.some( ( key ) => fx?.[ key ] );
const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const number = ( n, fallback, lo, hi ) =>
	clamp( Number.isFinite( +n ) ? +n : fallback, lo, hi );
const unit = ( layer ) => Math.max( 8, maxTextSize( layer ) );
const radians = ( degrees ) => ( degrees * Math.PI ) / 180;
const blend = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );
const css = ( color, alpha = 1 ) =>
	`rgba(${ color.map( Math.round ).join( ',' ) },${ alpha })`;
const colorCache = new Map();
function rgb( value, fallback = '#bdd5ff' ) {
	const key = String( value || fallback );
	if ( colorCache.has( key ) ) {
		return colorCache.get( key );
	}
	const c = createCanvas( 1, 1 ),
		g = c.getContext( '2d' );
	g.fillStyle = fallback;
	g.fillStyle = key;
	g.fillRect( 0, 0, 1, 1 );
	const data = g.getImageData( 0, 0, 1, 1 ).data;
	const result = [ data[ 0 ], data[ 1 ], data[ 2 ] ];
	if ( colorCache.size > 64 ) {
		colorCache.clear();
	}
	colorCache.set( key, result );
	return result;
}
function geometrySettings( layer ) {
	const fx = layer.textFX || {},
		size = unit( layer );
	return {
		ribbon: fx.ribbonFlow
			? {
					length: Math.min(
						240,
						( size * number( fx.ribbonFlow.length, 75, 0, 150 ) ) /
							100
					),
					bend: clamp(
						( size * number( fx.ribbonFlow.bend, 32, -60, 60 ) ) /
							100,
						-48,
						48
					),
			  }
			: null,
		prism: fx.prismCut
			? {
					shift: Math.min(
						80,
						( size * number( fx.prismCut.shift, 15, 0, 45 ) ) / 100
					),
					depth: Math.min(
						40,
						( size * number( fx.prismCut.depth, 9, 0, 24 ) ) / 100
					),
			  }
			: null,
	};
}
function postReach( fx ) {
	return (
		( fx?.ripple ? number( fx.ripple.amp, 5, 0, 30 ) : 0 ) +
		( fx?.glitch ? number( fx.glitch.strength, 10, 0, 60 ) : 0 ) +
		( fx?.softBlur ? number( fx.softBlur.amount, 4, 0, 30 ) * 2 : 0 ) +
		2
	);
}
export function premiumTextReach( layer ) {
	if ( ! hasPremiumText( layer.textFX ) ) {
		return 0;
	}
	const { ribbon, prism } = geometrySettings( layer );
	const geometry =
		( ribbon ? ribbon.length + Math.abs( ribbon.bend ) : 0 ) +
		( prism ? prism.shift + prism.depth : 0 );
	const after = postReach( layer.textFX );
	const collection = collectionTextReach(
		layer,
		unit( layer ),
		Math.max( 0, Math.min( 530, 590 - after ) - geometry )
	);
	return Math.ceil( after + 4 + geometry + collection );
}

// Distance to the alpha boundary, including counters. Two chamfer passes give
// smooth bevel normals without font outlines, so curved and mixed-font text work.
const distanceCache = [];
function distances( image ) {
	const { width: w, height: h, data } = image;
	let hash = ( w * 31 + h ) >>> 0;
	for ( let i = 3; i < data.length; i += 4 ) {
		hash = Math.imul( hash ^ data[ i ], 16777619 ) >>> 0;
	}
	for ( const entry of distanceCache ) {
		if ( entry.hash !== hash || entry.w !== w || entry.h !== h ) {
			continue;
		}
		let same = true;
		for ( let i = 0; i < entry.alpha.length; i++ ) {
			if ( entry.alpha[ i ] !== data[ i * 4 + 3 ] ) {
				same = false;
				break;
			}
		}
		if ( same ) {
			return entry;
		}
	}
	const d = new Float32Array( w * h ),
		alpha = new Uint8Array( w * h );
	let x0 = w,
		y0 = h,
		x1 = 0,
		y1 = 0;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x,
				a = data[ i * 4 + 3 ];
			alpha[ i ] = a;
			d[ i ] =
				a < 250 || ! x || ! y || x === w - 1 || y === h - 1
					? a / 255
					: 1e6;
			if ( a > 8 ) {
				x0 = Math.min( x0, x );
				y0 = Math.min( y0, y );
				x1 = Math.max( x1, x );
				y1 = Math.max( y1, y );
			}
		}
	}
	const diag = Math.SQRT2;
	for ( let y = 1; y < h; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = y * w + x;
			d[ i ] = Math.min(
				d[ i ],
				d[ i - 1 ] + 1,
				d[ i - w ] + 1,
				d[ i - w - 1 ] + diag,
				d[ i - w + 1 ] + diag
			);
		}
	}
	for ( let y = h - 2; y >= 0; y-- ) {
		for ( let x = w - 2; x > 0; x-- ) {
			const i = y * w + x;
			d[ i ] = Math.min(
				d[ i ],
				d[ i + 1 ] + 1,
				d[ i + w ] + 1,
				d[ i + w + 1 ] + diag,
				d[ i + w - 1 ] + diag
			);
		}
	}
	const entry = {
		hash,
		w,
		h,
		d,
		alpha,
		x0,
		y0,
		x1,
		y1,
		empty: x0 > x1 || y0 > y1,
	};
	if ( d.length < 1600000 ) {
		while (
			distanceCache.length &&
			( distanceCache.length >= 4 ||
				distanceCache.reduce( ( n, e ) => n + e.d.length, 0 ) +
					d.length >
					2000000 )
		) {
			distanceCache.shift();
		}
		distanceCache.push( entry );
	}
	return entry;
}
function material( body, layer, conf, glass ) {
	const g = body.getContext( '2d' ),
		image = g.getImageData( 0, 0, body.width, body.height );
	const shape = distances( image );
	if ( shape.empty ) {
		return;
	}
	const { d, w, h, x0, y0, x1, y1 } = shape;
	const tint = rgb( conf.color, glass ? '#98e8ea' : '#c7d5eb' );
	const second = rgb( conf.color2, '#bd70ff' );
	const bevel = Math.max(
		1.4,
		( unit( layer ) * number( conf.bevel, glass ? 32 : 36, 5, 75 ) ) / 300
	);
	const angle = radians( number( conf.angle, 125, 0, 360 ) );
	const lx = Math.cos( angle ),
		ly = -Math.sin( angle );
	const strength = number( conf.shine, 80, 0, 100 ) / 100;
	const dispersion = number( conf.dispersion, 65, 0, 100 ) / 100;
	const opacity = number( conf.opacity, 52, 5, 100 ) / 100;
	const surface = ( x, y ) =>
		bevel *
		Math.sin(
			( Math.min(
				1,
				d[ clamp( y, 0, h - 1 ) * w + clamp( x, 0, w - 1 ) ] / bevel
			) *
				Math.PI ) /
				2
		);
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const p = ( y * w + x ) * 4;
			if ( ! image.data[ p + 3 ] ) {
				continue;
			}
			let nx = ( surface( x - 2, y ) - surface( x + 2, y ) ) / 4;
			let ny = ( surface( x, y - 2 ) - surface( x, y + 2 ) ) / 4;
			const len = Math.hypot( nx, ny, 1 );
			nx /= len;
			ny /= len;
			const nz = 1 / len;
			const u = ( x - x0 ) / Math.max( 1, x1 - x0 ),
				v = ( y - y0 ) / Math.max( 1, y1 - y0 );
			const facing = nx * lx + ny * ly;
			const reflection =
				ny * 1.15 + v * 0.65 + 0.14 * Math.sin( u * 6 + nx * 3 );
			const ribbon = Math.exp(
				-Math.pow( ( reflection - 0.34 ) / 0.105, 2 )
			);
			const line = Math.exp(
				-Math.pow( ( reflection + 0.31 ) / 0.032, 2 )
			);
			const spec =
				Math.pow( Math.max( 0, facing * 0.52 + nz * 0.85 ), 24 ) *
				strength;
			const rim = Math.pow( 1 - nz, 0.65 );
			let c;
			if ( glass ) {
				const phase =
					( Math.atan2( ny, nx ) / ( 2 * Math.PI ) +
						u * 0.6 +
						v * 0.45 ) *
					6.283;
				const spectrum = [ 0, 2.094, 4.189 ].map(
					( phaseOffset ) =>
						150 + 105 * Math.cos( phase + phaseOffset )
				);
				c = blend( tint, second, clamp( v * 0.6 + nx * 0.4, 0, 1 ) );
				c = blend( c, spectrum, dispersion * ( 0.16 + rim * 0.55 ) );
				c = c.map(
					( value ) =>
						value *
							( 0.88 +
								nz * 0.2 -
								Math.max( 0, -facing ) * 0.42 ) +
						( spec * 1.4 + line * 0.95 + ribbon * 0.5 ) * 185
				);
				// Narrow transmitted highlight along the inside of the lens rim.
				const caustic =
					Math.exp(
						-Math.pow(
							( d[ y * w + x ] - bevel * 0.35 ) /
								Math.max( 0.8, bevel * 0.12 ),
							2
						)
					) *
					Math.max( 0, facing + 0.25 ) *
					strength;
				c = blend(
					c,
					[ 255, 255, 255 ],
					clamp( caustic * 0.85, 0, 0.85 )
				);
				// A darker hairline and bright rim remain legible on either paper.
				const edge = d[ y * w + x ] < 0.95;
				if ( edge ) {
					c = blend( c, [ 25, 32, 55 ], 0.4 );
				}
				image.data[ p + 3 ] *= clamp(
					opacity * ( 0.58 + rim ) +
						spec * 0.7 +
						caustic * 0.7 +
						line * 0.6 +
						( edge ? 0.35 : 0 ),
					0,
					1
				);
			} else {
				const env = clamp(
					0.18 +
						ribbon * 0.7 +
						line * 0.8 +
						facing * 0.22 +
						Math.sin( reflection * 8 ) * 0.13,
					0.04,
					1.1
				);
				c = tint.map(
					( value ) => value * env + ( spec + rim * 0.15 ) * 190
				);
				// Fine brushed reflection is spatially deterministic, not random noise.
				const grain = Math.sin( y * 2.4 + Math.sin( x * 0.13 ) ) * 1.1;
				c = c.map( ( value ) => value + grain );
			}
			for ( let channel = 0; channel < 3; channel++ ) {
				image.data[ p + channel ] = c[ channel ];
			}
		}
	}
	g.putImageData( image, 0, 0 );
}
function tinted( source, color, target ) {
	const c = target || createCanvas( source.width, source.height ),
		g = c.getContext( '2d' );
	g.clearRect( 0, 0, c.width, c.height );
	g.drawImage( source, 0, 0 );
	g.globalCompositeOperation = 'source-in';
	g.fillStyle = color;
	g.fillRect( 0, 0, c.width, c.height );
	g.globalCompositeOperation = 'source-over';
	return c;
}
function ribbons( body, layer ) {
	const conf = layer.textFX.ribbonFlow,
		geo = geometrySettings( layer ).ribbon;
	const angle = radians( number( conf.angle, 65, 0, 360 ) ),
		dx = Math.cos( angle ),
		dy = Math.sin( angle );
	const count = Math.round( number( conf.count, 18, 6, 30 ) );
	const c1 = rgb( conf.color, '#fc648a' ),
		c2 = rgb( conf.color2, '#6454e9' );
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const plate = createCanvas( body.width, body.height );
	for ( let i = count; i > 0; i-- ) {
		const t = i / count,
			curve = Math.sin( t * Math.PI ) * geo.bend;
		const offsetX = dx * geo.length * t - dy * curve,
			offsetY = dy * geo.length * t + dx * curve;
		const color = blend( c1, c2, t );
		const glint = 0.65 + 0.35 * Math.cos( t * Math.PI * 6 );
		tinted( body, css( color.map( ( v ) => v * glint ) ), plate );
		g.drawImage( plate, offsetX, offsetY );
		// Hairline separations read as individual flowing lamellae, not a flat shadow.
		g.globalAlpha = 0.36;
		tinted( body, css( blend( color, [ 255, 255, 255 ], 0.35 ) ), plate );
		g.drawImage( plate, offsetX - dx * 0.7, offsetY - dy * 0.7 );
		g.globalAlpha = 1;
	}
	g.drawImage( body, 0, 0 );
	return out;
}
function facets( body, layer ) {
	const conf = layer.textFX.prismCut,
		geo = geometrySettings( layer ).prism;
	const source = body
		.getContext( '2d' )
		.getImageData( 0, 0, body.width, body.height );
	const box = distances( source );
	if ( box.empty ) {
		return body;
	}
	const n = Math.round( number( conf.slices, 7, 3, 16 ) ),
		angle = radians( number( conf.angle, 18, -45, 45 ) );
	const slant = Math.tan( angle ),
		band =
			( box.x1 - box.x0 + Math.abs( slant ) * ( box.y1 - box.y0 ) + 4 ) /
			n;
	const left = box.x0 - Math.max( 0, slant * ( box.y1 - box.y0 ) ) - 2;
	const c1 = rgb( conf.color, '#55dcf3' ),
		c2 = rgb( conf.color2, '#aa78ee' );
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const plate = createCanvas( body.width, body.height ),
		pg = plate.getContext( '2d' );
	for ( let i = 0; i < n; i++ ) {
		const x = left + i * band,
			top = box.y0 - 1,
			bottom = box.y1 + 1,
			sl = slant * ( bottom - top );
		const color = blend( c1, c2, i / Math.max( 1, n - 1 ) );
		tinted( body, css( color ), plate );
		pg.globalCompositeOperation = 'destination-in';
		pg.beginPath();
		pg.moveTo( x, top );
		pg.lineTo( x + band + 0.7, top );
		pg.lineTo( x + band + sl + 0.7, bottom );
		pg.lineTo( x + sl, bottom );
		pg.closePath();
		pg.fill();
		pg.globalCompositeOperation = 'source-atop';
		const shine = pg.createLinearGradient( x, top, x + band, bottom );
		shine.addColorStop( 0, 'rgba(255,255,255,.78)' );
		shine.addColorStop( 0.38, 'rgba(255,255,255,.08)' );
		shine.addColorStop( 0.42, 'rgba(0,0,35,.35)' );
		shine.addColorStop( 1, 'rgba(0,0,35,.05)' );
		pg.fillStyle = shine;
		pg.fillRect( 0, 0, body.width, body.height );
		pg.globalCompositeOperation = 'source-over';
		const move =
			( i % 2 ? 1 : -1 ) *
			geo.shift *
			( 0.5 + 0.5 * Math.sin( ( i + 1 ) * 1.23 ) );
		const side = tinted(
			plate,
			css( blend( color, [ 15, 15, 45 ], 0.65 ) )
		);
		for ( let d = Math.ceil( geo.depth ); d > 0; d-- ) {
			g.drawImage( side, d * 0.65, move + d );
		}
		g.drawImage( plate, 0, move );
	}
	return out;
}
function tunnel( body, layer ) {
	const conf = layer.textFX.contourTunnel;
	const image = body
		.getContext( '2d' )
		.getImageData( 0, 0, body.width, body.height );
	const box = distances( image );
	if ( box.empty ) {
		return body;
	}
	const n = Math.round( number( conf.count, 16, 4, 30 ) );
	const width = Math.max(
		0.7,
		( unit( layer ) * number( conf.width, 10, 3, 30 ) ) / 600
	);
	const depth = number( conf.depth, 78, 15, 94 ) / 100;
	const angle = radians( number( conf.angle, 35, 0, 360 ) );
	const vx =
		( box.x0 + box.x1 ) / 2 +
		Math.cos( angle ) * ( box.x1 - box.x0 ) * 0.32;
	const vy =
		( box.y0 + box.y1 ) / 2 +
		Math.sin( angle ) * ( box.y1 - box.y0 ) * 0.32;
	const c1 = rgb( conf.color, '#77f5dd' ),
		c2 = rgb( conf.color2, '#7863d9' );
	const edge = createCanvas( body.width, body.height ),
		eg = edge.getContext( '2d' );
	for ( let i = 0; i < box.d.length; i++ ) {
		image.data[ i * 4 + 3 ] *= clamp( width + 0.65 - box.d[ i ], 0, 1 );
	}
	eg.putImageData( image, 0, 0 );
	const out = createCanvas( body.width, body.height ),
		g = out.getContext( '2d' );
	const plate = createCanvas( body.width, body.height );
	g.globalAlpha = 0.13;
	g.drawImage( tinted( body, css( c2 ) ), 0, 0 );
	g.globalAlpha = 1;
	// A fine keyline keeps the leading contour legible on light paper too.
	tinted( edge, css( blend( c2, [ 10, 15, 28 ], 0.7 ) ), plate );
	g.globalAlpha = 0.8;
	for ( let i = 0; i < 8; i++ ) {
		const a = ( i * Math.PI ) / 4;
		g.drawImage( plate, Math.cos( a ) * 0.85, Math.sin( a ) * 0.85 );
	}
	g.globalAlpha = 1;
	for ( let i = n; i >= 0; i-- ) {
		const t = i / n,
			scale = Math.pow( 1 - depth, t );
		const color = blend( c1, c2, t );
		tinted( edge, css( color ), plate );
		g.save();
		g.translate( vx * ( 1 - scale ), vy * ( 1 - scale ) );
		g.scale( scale, scale );
		g.drawImage( plate, 0, 0 );
		g.restore();
	}
	return out;
}

/** Apply to the already padded glyph body, preserving transparent holes. */
export function paintPremiumText( body, layer ) {
	const fx = layer.textFX || {};
	if ( ! hasPremiumText( fx ) ) {
		return;
	}
	if ( fx.liquidMetal ) {
		material( body, layer, fx.liquidMetal, false );
	}
	if ( fx.dichroicGlass ) {
		material( body, layer, fx.dichroicGlass, true );
	}
	const { ribbon, prism } = geometrySettings( layer );
	const geometry =
		( ribbon ? ribbon.length + Math.abs( ribbon.bend ) : 0 ) +
		( prism ? prism.shift + prism.depth : 0 );
	let result = paintTextCollection(
		body,
		layer,
		{ distances, unit, rgb },
		Math.max(
			0,
			Math.min( 530, 590 - postReach( layer.textFX ) ) - geometry
		)
	);
	if ( fx.contourTunnel ) {
		result = tunnel( result, layer );
	}
	if ( fx.prismCut ) {
		result = facets( result, layer );
	}
	if ( fx.ribbonFlow ) {
		result = ribbons( result, layer );
	}
	if ( result !== body ) {
		const g = body.getContext( '2d' );
		g.clearRect( 0, 0, body.width, body.height );
		g.drawImage( result, 0, 0 );
	}
}

// Shared bounded glyph-distance cache and Canvas color parsing for all text materials.
export { distances as textDistanceField, rgb as textMaterialColor };
