/** Smooth glyph contours, physical cut surfaces and luminous outlines. */
import { createCanvas } from './env';
import { blurCanvas } from './styles';
import { textDistanceField, textMaterialColor } from './text-premium';

const limit = ( n, f, lo, hi ) =>
	Math.max( lo, Math.min( hi, Number.isFinite( +n ) ? +n : f ) );
const mix = ( a, b, t ) =>
	a.map( ( v, i ) => v + ( b[ i ] - v ) * Math.max( 0, Math.min( 1, t ) ) );
const color = ( c, f ) => textMaterialColor( c, f );
const css = ( c, a = 1 ) => `rgba(${ c.map( Math.round ).join( ',' ) },${ a })`;
function outside( mask ) {
	const image = mask
			.getContext( '2d' )
			.getImageData( 0, 0, mask.width, mask.height ),
		w = mask.width,
		h = mask.height,
		d = new Float32Array( w * h );
	for ( let i = 0; i < d.length; i++ ) {
		d[ i ] = image.data[ i * 4 + 3 ]
			? 1 - image.data[ i * 4 + 3 ] / 255
			: 1e6;
	}
	const diag = Math.SQRT2;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if ( x ) {
				d[ i ] = Math.min( d[ i ], d[ i - 1 ] + 1 );
			}
			if ( y ) {
				d[ i ] = Math.min( d[ i ], d[ i - w ] + 1 );
				if ( x ) {
					d[ i ] = Math.min( d[ i ], d[ i - w - 1 ] + diag );
				}
				if ( x < w - 1 ) {
					d[ i ] = Math.min( d[ i ], d[ i - w + 1 ] + diag );
				}
			}
		}
	}
	for ( let y = h - 1; y >= 0; y-- ) {
		for ( let x = w - 1; x >= 0; x-- ) {
			const i = y * w + x;
			if ( x < w - 1 ) {
				d[ i ] = Math.min( d[ i ], d[ i + 1 ] + 1 );
			}
			if ( y < h - 1 ) {
				d[ i ] = Math.min( d[ i ], d[ i + w ] + 1 );
				if ( x ) {
					d[ i ] = Math.min( d[ i ], d[ i + w - 1 ] + diag );
				}
				if ( x < w - 1 ) {
					d[ i ] = Math.min( d[ i ], d[ i + w + 1 ] + diag );
				}
			}
		}
	}
	return { d, alpha: image.data };
}

function contourCanvas( mask, field, painter ) {
	const c = createCanvas( mask.width, mask.height ),
		g = c.getContext( '2d' ),
		im = g.createImageData( c.width, c.height );
	const original = field.alpha;
	for ( let y = 0; y < c.height; y++ ) {
		for ( let x = 0; x < c.width; x++ ) {
			const j = y * c.width + x,
				i = j * 4,
				edge = original[ i + 3 ] / 255,
				d = edge > 0.98 ? 0 : field.d[ j ];
			const p = painter( d, x, y, edge );
			if ( ! p ) {
				continue;
			}
			im.data[ i ] = p[ 0 ];
			im.data[ i + 1 ] = p[ 1 ];
			im.data[ i + 2 ] = p[ 2 ];
			im.data[ i + 3 ] = Math.round(
				Math.max( 0, Math.min( 1, p[ 3 ] ) ) * 255
			);
		}
	}
	g.putImageData( im, 0, 0 );
	return c;
}

/** One shared exact alpha-distance field replaces dozens of offset silhouette stamps. */
export function drawTextContours( ctx, layer, silhouette ) {
	const fx = layer.textFX || {},
		keys = [
			'sticker',
			'gradientOutline',
			'contour',
			'outline',
			'rings',
		].filter( ( k ) => fx[ k ] );
	if ( ! keys.length ) {
		return;
	}
	const ring = fx.rings,
		cont = fx.contour;
	const extent = Math.max(
		fx.sticker ? limit( fx.sticker.size, 9, 2, 40 ) + 12 : 0,
		fx.gradientOutline ? limit( fx.gradientOutline.width, 5, 1, 20 ) : 0,
		cont
			? limit( cont.count, 4, 1, 4 ) * limit( cont.gap, 7, 3, 30 ) +
					limit( cont.width, 1, 1, 6 )
			: 0,
		fx.outline ? limit( fx.outline.size, 4, 1, 40 ) : 0,
		ring ? limit( ring.size, 4, 1, 30 ) * limit( ring.count, 3, 2, 5 ) : 0
	);
	const pad = Math.ceil( extent ) + 4,
		mask = silhouette( '#ffffff', pad ),
		field = outside( mask ),
		w = layer.w || 1,
		h = layer.h || 1;
	for ( const key of keys ) {
		const c = fx[ key ];
		let result;
		if ( key === 'outline' || key === 'sticker' ) {
			const size = limit( c.size, key === 'sticker' ? 9 : 4, 1, 40 ),
				ink = color( c.color, '#fff4e3' );
			result = contourCanvas( mask, field, ( d ) => {
				const alpha = Math.min( 1, size + 0.5 - d );
				if ( alpha <= 0 ) {
					return null;
				}
				const edge =
					key === 'sticker'
						? Math.max( 0, 1 - Math.abs( d - size + 1 ) / 2 )
						: 0;
				const shade = mix( ink, [ 255, 255, 250 ], edge * 0.3 );
				return [ ...shade, alpha ];
			} );
			if ( key === 'sticker' && c.shadow ) {
				const shadow = createCanvas( mask.width, mask.height ),
					g = shadow.getContext( '2d' );
				g.drawImage( result, 0, 0 );
				g.globalCompositeOperation = 'source-in';
				g.fillStyle = '#142033';
				g.fillRect( 0, 0, shadow.width, shadow.height );
				ctx.save();
				ctx.globalAlpha = limit( c.shadow, 40, 0, 90 ) / 100;
				ctx.drawImage( blurCanvas( shadow, 3 ), -pad + 1, -pad + 4 );
				ctx.restore();
			}
		} else if ( key === 'rings' ) {
			const size = limit( c.size, 4, 1, 30 ),
				count = Math.round( limit( c.count, 3, 2, 5 ) ),
				inks = [
					color( c.color, '#fff1d8' ),
					color( c.color2, '#a8734a' ),
					color( c.color3, '#352a35' ),
				];
			result = contourCanvas( mask, field, ( d ) => {
				if ( d > count * size + 0.5 ) {
					return null;
				}
				const index = Math.min(
						count - 1,
						Math.max( 0, Math.floor( d / size ) )
					),
					ink = inks[ index % inks.length ];
				return [ ...ink, Math.min( 1, count * size + 0.5 - d ) ];
			} );
		} else if ( key === 'contour' ) {
			const count = Math.round( limit( c.count, 4, 1, 4 ) ),
				gap = limit( c.gap, 7, 3, 30 ),
				width = limit( c.width, 1, 1, 6 ),
				a = color( c.color, '#9fcebe' ),
				b = color( c.color2, '#586f91' );
			result = contourCanvas( mask, field, ( d ) => {
				const n = Math.round( d / gap );
				if ( n < 1 || n > count ) {
					return null;
				}
				const alpha = Math.min(
					1,
					width * 0.5 + 0.5 - Math.abs( d - n * gap )
				);
				return alpha > 0
					? [
							...mix(
								a,
								b,
								( n - 1 ) / Math.max( 1, count - 1 )
							),
							alpha,
					  ]
					: null;
			} );
		} else {
			const width = limit( c.width, 5, 1, 20 ),
				rad = ( ( c.angle ?? 35 ) * Math.PI ) / 180,
				dx = Math.cos( rad ),
				dy = Math.sin( rad ),
				a = color( c.color, '#ead6ae' ),
				b = color( c.color2, '#7aa9b1' );
			result = contourCanvas( mask, field, ( d, x, y ) => {
				const alpha = Math.min( 1, width + 0.5 - d );
				return alpha > 0
					? [
							...mix(
								a,
								b,
								0.5 +
									( ( x - pad ) / w - 0.5 ) * dx +
									( ( y - pad ) / h - 0.5 ) * dy
							),
							alpha,
					  ]
					: null;
			} );
		}
		ctx.drawImage( result, -pad, -pad );
	}
}

export function drawNeonLettering( ctx, layer, conf, silhouette ) {
	const width = limit( conf.width, 3, 1, 10 ),
		size = limit( conf.glow, 24, 4, 60 ),
		intensity = limit( conf.intensity, 90, 0, 100 ) / 100,
		pad = Math.ceil( size * 1.8 + width ) + 3;
	const ink = color( conf.color, '#ef70b8' ),
		tube = silhouette( 'rgba(0,0,0,0)', pad, {
			outlineColor: css( ink ),
			outlineW: width,
			outlineDash: null,
		} );
	ctx.save();
	for ( const [ r, a ] of [
		[ size * 0.75, 0.38 ],
		[ size * 0.28, 0.72 ],
		[ size * 0.08, 0.84 ],
	] ) {
		ctx.globalAlpha = a * intensity;
		ctx.drawImage( blurCanvas( tube, Math.max( 0.4, r ) ), -pad, -pad );
	}
	ctx.globalAlpha = 0.65 + 0.35 * intensity;
	ctx.drawImage( tube, -pad, -pad );
	const core = silhouette( 'rgba(0,0,0,0)', pad, {
		outlineColor: css( mix( ink, [ 255, 255, 250 ], 0.88 ) ),
		outlineW: Math.max( 0.6, width * 0.34 ),
		outlineDash: null,
	} );
	ctx.globalAlpha = intensity;
	ctx.drawImage( core, -pad, -pad );
	ctx.restore();
}

export function drawCutSurface(
	ctx,
	layer,
	conf,
	silhouette,
	knockout = false
) {
	const mask = silhouette( '#ffffff' ),
		box = textDistanceField(
			mask
				.getContext( '2d' )
				.getImageData( 0, 0, mask.width, mask.height )
		);
	if ( box.empty ) {
		return;
	}
	const p = limit( conf.pad, 18, 0, 80 ),
		depth = knockout
			? limit( conf.relief, 30, 0, 100 ) / 12
			: limit( conf.depth, 4, 1, 24 ),
		radius = limit( conf.radius, 8, 0, 90 ),
		ink = color( conf.color, knockout ? '#243547' : '#f4e8d8' );
	const margin = Math.ceil( p + depth * 2 + 12 ),
		w = box.x1 - box.x0 + 1,
		h = box.y1 - box.y0 + 1,
		c = createCanvas( w + margin * 2, h + margin * 2 ),
		g = c.getContext( '2d' );
	const x = margin - p,
		y = margin - p,
		pw = w + p * 2,
		ph = h + p * 2,
		r = Math.min( radius, pw / 2, ph / 2 ),
		grad = g.createLinearGradient( 0, y, 0, y + ph );
	grad.addColorStop(
		0,
		css( mix( ink, [ 255, 251, 235 ], knockout ? 0.18 : 0.1 ) )
	);
	grad.addColorStop( 0.35, css( ink ) );
	grad.addColorStop(
		1,
		css( mix( ink, [ 20, 30, 46 ], knockout ? 0.25 : 0.1 ) )
	);
	g.fillStyle = grad;
	g.beginPath();
	g.moveTo( x + r, y );
	g.arcTo( x + pw, y, x + pw, y + ph, r );
	g.arcTo( x + pw, y + ph, x, y + ph, r );
	g.arcTo( x, y + ph, x, y, r );
	g.arcTo( x, y, x + pw, y, r );
	g.closePath();
	g.fill();
	// A fine raised lip follows the panel edge, before punching the letters through it.
	g.strokeStyle = css( mix( ink, [ 255, 255, 255 ], 0.42 ), 0.8 );
	g.lineWidth = 0.9 + depth * 0.12;
	g.stroke();
	g.globalCompositeOperation = 'destination-out';
	g.drawImage( mask, margin - box.x0, margin - box.y0 );
	g.globalCompositeOperation = 'source-over';
	const px = box.x0 - margin,
		py = box.y0 - margin;
	const opacity =
		limit( knockout ? conf.shadow : conf.opacity, 50, 0, 90 ) / 100;
	const sh = createCanvas( c.width, c.height ),
		sg = sh.getContext( '2d' );
	sg.drawImage( c, 0, 0 );
	sg.globalCompositeOperation = 'source-in';
	sg.fillStyle = '#111b29';
	sg.fillRect( 0, 0, sh.width, sh.height );
	ctx.save();
	ctx.globalAlpha = opacity;
	ctx.drawImage(
		blurCanvas( sh, Math.max( 1, depth * 0.65 ) ),
		px + depth * 0.45,
		py + depth
	);
	ctx.restore();
	ctx.drawImage( c, px, py );
	// Inner shadow is a narrow crescent, leaving the remaining letter interior transparent.
	const inner = createCanvas( mask.width, mask.height ),
		ig = inner.getContext( '2d' );
	ig.drawImage( mask, 0, 0 );
	ig.globalCompositeOperation = 'destination-out';
	ig.drawImage( mask, depth * 0.6, depth );
	ig.globalCompositeOperation = 'source-in';
	ig.fillStyle = '#172133';
	ig.fillRect( 0, 0, inner.width, inner.height );
	ctx.save();
	ctx.globalAlpha = opacity;
	ctx.drawImage( blurCanvas( inner, depth * 0.24 ), 0, 0 );
	ctx.restore();
}

export function drawWireLettering( ctx, layer, c, silhouette ) {
	const depth = limit( c.depth, 9, 0, 24 ),
		grid = limit( c.grid, 10, 5, 40 ),
		width = limit( c.width, 1, 1, 5 ),
		ink = color( c.color, '#90c1d6' ),
		pad = Math.ceil( depth + width ) + 3;
	const front = silhouette( 'rgba(0,0,0,0)', pad, {
			outlineColor: css( ink ),
			outlineW: width,
			outlineDash: null,
		} ),
		mask = silhouette( '#ffffff', pad );
	const field = textDistanceField(
			mask
				.getContext( '2d' )
				.getImageData( 0, 0, mask.width, mask.height )
		),
		data = field.alpha;
	ctx.save();
	ctx.globalAlpha = 0.42;
	ctx.drawImage( front, -pad + depth, -pad + depth * 0.65 );
	ctx.globalAlpha = 0.65;
	ctx.strokeStyle = css( ink );
	ctx.lineWidth = width * 0.65;
	for ( let y = field.y0; y <= field.y1; y += grid ) {
		for ( let x = field.x0; x <= field.x1; x++ ) {
			const i = y * mask.width + x;
			if (
				data[ i ] > 128 &&
				( data[ i - 1 ] < 128 || data[ i + 1 ] < 128 )
			) {
				ctx.beginPath();
				ctx.moveTo( x - pad, y - pad );
				ctx.lineTo( x - pad + depth, y - pad + depth * 0.65 );
				ctx.stroke();
			}
		}
	}
	const mesh = createCanvas( mask.width, mask.height ),
		g = mesh.getContext( '2d' );
	g.strokeStyle = css( ink, 0.42 );
	g.lineWidth = Math.max( 0.65, width * 0.5 );
	g.beginPath();
	for ( let x = -mesh.height; x < mesh.width; x += grid ) {
		g.moveTo( x, 0 );
		g.lineTo( x + mesh.height * 0.55, mesh.height );
	}
	for ( let y = 0; y < mesh.height; y += grid ) {
		g.moveTo( 0, y );
		g.lineTo( mesh.width, y );
	}
	g.stroke();
	g.globalCompositeOperation = 'destination-in';
	g.drawImage( mask, 0, 0 );
	ctx.globalAlpha = 1;
	ctx.drawImage( mesh, -pad, -pad );
	ctx.drawImage( front, -pad, -pad );
	ctx.restore();
}
