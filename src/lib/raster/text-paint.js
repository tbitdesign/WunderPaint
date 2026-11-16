import { hexToRgb } from '../color';
import {
	drawTextContours,
	drawNeonLettering,
	drawCutSurface,
	drawWireLettering,
} from './text-boundaries';
import {
	TEXT_SURFACE_KEYS,
	paintTextSurfaces,
	paintTextImage,
	textBodyReach,
} from './text-surfaces';
import { stripSpanColors } from '../rich-text';
import { createCanvas } from './env';
import { DEG, TEXT_WARPS, warpText } from './text-warp';
import { drawText } from './text-draw';
import { blurCanvas } from './styles';
import {
	hasPremiumText,
	paintPremiumText,
	premiumTextReach,
	PREMIUM_TEXT_KEYS,
	textDistanceField,
} from './text-premium';

export { drawLineHighlights } from './text-annotations';

/** Flat solid copy of a text layer for silhouettes (round-3 helpers). */
export function flatTextCopy( layer, color, extra ) {
	const fx = layer.textFX || {};
	return {
		...layer,
		textFX: fx.jitter ? { jitter: fx.jitter } : null,
		fillType: 'solid',
		gradientStops: null,
		color,
		fill: color,
		strokeGradient: null,
		outlineColor: null,
		outlineW: 0,
		shadowOn: false,
		bgColor: null,
		lineStyles: Array.isArray( layer.lineStyles )
			? layer.lineStyles.map( ( ls ) =>
					ls ? { ...ls, color: undefined } : ls
			  )
			: layer.lineStyles,
		spans: layer.spans ? stripSpanColors( layer.spans ) : layer.spans,
		...( extra || {} ),
	};
}

/** Padded silhouette canvas of a text layer (round-3 helpers). */
export function textSilhouette( layer, color, pad = 0, extra ) {
	const w = Math.max( 1, Math.round( layer.w || 1 ) );
	const h = Math.max( 1, Math.round( layer.h || 1 ) );
	const c = createCanvas( w + pad * 2, h + pad * 2 );
	const cctx = c.getContext( '2d' );
	cctx.translate( pad, pad );
	drawText( cctx, flatTextCopy( layer, color, extra ) );
	return c;
}

/**
 * Neon tube (v1.141.0): a REAL neon sign look - hollow glyphs, only the
 * stroked tube glows. Replaces the text body entirely.
 */
export function drawNeonTube( ctx, layer, fx ) {
	drawNeonLettering( ctx, layer, fx.neonTube, ( color, pad = 0, extra ) =>
		textSilhouette( layer, color, pad, extra )
	);
}

/**
 * Paper cut (v1.141.0): the text punches a hole into a colored panel, with
 * a soft shadow inside the hole. Replaces the text body entirely.
 */
export function drawPaperCut( ctx, layer, fx ) {
	drawCutSurface( ctx, layer, fx.paperCut, ( color, pad = 0, extra ) =>
		textSilhouette( layer, color, pad, extra )
	);
}

/**
 * The text body itself, with the in-glyph effects (v1.139.0): image fill
 * (a photo clipped into the glyphs) and bevel/letterpress edge shading.
 * Without those the plain drawText path is used - zero extra buffers.
 */
/** Blend hex `a` toward hex `b` by `t` (0..1); returns an rgb() string. */
export function mixColor( a, b, t ) {
	const ca = hexToRgb( a ) || { r: 200, g: 200, b: 200 };
	const cb = hexToRgb( b ) || { r: 0, g: 0, b: 0 };
	const k = Math.max( 0, Math.min( 1, t ) );
	const m = ( x, y ) => Math.round( x + ( y - x ) * k );
	return `rgb(${ m( ca.r, cb.r ) },${ m( ca.g, cb.g ) },${ m(
		ca.b,
		cb.b
	) })`;
}

export function drawTextBody( ctx, layer, env ) {
	const fx = layer.textFX || {};
	const fillImg =
		fx.imageFill?.src && env?.cache
			? env.cache.get( fx.imageFill.src )
			: null;
	// Body replacements: the glyphs themselves become something else.
	if ( fx.paperCut ) {
		drawPaperCut( ctx, layer, fx );
		return;
	}
	if ( fx.neonTube ) {
		drawNeonTube( ctx, layer, fx );
		return;
	}
	if ( fx.wireframe ) {
		drawWireLettering(
			ctx,
			layer,
			fx.wireframe,
			( color, pad = 0, extra ) =>
				textSilhouette( layer, color, pad, extra )
		);
		return;
	}
	// Knockout: the glyphs are holes in a panel painted by the stamp pass.
	if ( fx.knockout ) {
		return;
	}
	// Misprint / riso offset print: the solid ink layer is shifted while
	// the contour plate stays put. Replaces the text body entirely.
	if ( fx.offsetPrint ) {
		const off = Math.max( 1, Math.min( 40, fx.offsetPrint.offset ?? 8 ) );
		const rad = ( ( fx.offsetPrint.angle ?? 45 ) * Math.PI ) / 180;
		const lineW = Math.max( 1, Math.min( 8, fx.offsetPrint.width || 2 ) );
		const inkFill = fx.offsetPrint.color || '#e5484d';
		const lineColor =
			'string' === typeof layer.color && '#' === layer.color[ 0 ]
				? layer.color
				: '#1a1d21';
		const ink = textSilhouette( layer, inkFill );
		if ( ( fx.offsetPrint.grain ?? 28 ) > 0 ) {
			paintTextSurfaces( ink, {
				...layer,
				textFX: {
					grunge: {
						amount: fx.offsetPrint.grain ?? 28,
						scale: 110,
						seed: 6,
					},
				},
			} );
		}
		ctx.drawImage( ink, Math.cos( rad ) * off, Math.sin( rad ) * off );
		ctx.drawImage(
			textSilhouette( layer, 'rgba(0,0,0,0)', 0, {
				outlineColor: lineColor,
				outlineW: lineW,
			} ),
			0,
			0
		);
		return;
	}
	if (
		! fillImg &&
		! TEXT_SURFACE_KEYS.some( ( key ) => fx[ key ] ) &&
		! fx.pixelate &&
		! fx.glitch &&
		! fx.ripple &&
		! fx.fade &&
		! fx.softBlur &&
		! hasPremiumText( fx )
	) {
		drawText( ctx, layer );
		return;
	}
	const w = Math.max( 1, Math.round( layer.w || 1 ) ),
		h = Math.max( 1, Math.round( layer.h || 1 ) );
	const pad = Math.max( textBodyReach( layer ), premiumTextReach( layer ) );
	const body = createCanvas( w + pad * 2, h + pad * 2 ),
		bctx = body.getContext( '2d' );
	bctx.translate( pad, pad );
	drawText( bctx, layer );
	bctx.translate( -pad, -pad );
	if ( fillImg ) {
		paintTextImage( body, fillImg, fx.imageFill, pad, w, h );
	}
	paintTextSurfaces( body, layer );
	paintPremiumText( body, layer );
	// Distortions compose in one padded body instead of discarding later effects.
	if ( fx.pixelate ) {
		const px = Math.max( 2, Math.min( 24, fx.pixelate.size ?? 5 ) );
		const small = createCanvas(
			Math.max( 1, Math.ceil( body.width / px ) ),
			Math.max( 1, Math.ceil( body.height / px ) )
		);
		small
			.getContext( '2d' )
			.drawImage( body, 0, 0, small.width, small.height );
		bctx.save();
		bctx.globalCompositeOperation = 'copy';
		bctx.imageSmoothingEnabled = false;
		bctx.drawImage( small, 0, 0, body.width, body.height );
		bctx.restore();
	}
	if ( fx.ripple ) {
		const amp = Math.max( 0, Math.min( 30, fx.ripple.amp ?? 5 ) ),
			wl = Math.max( 10, Math.min( 140, fx.ripple.size ?? 54 ) );
		const displaced = createCanvas( body.width, body.height ),
			dctx = displaced.getContext( '2d' );
		for ( let y = 0; y < body.height; y++ ) {
			const dx = Math.sin( ( ( y - pad ) / wl ) * Math.PI * 2 ) * amp;
			dctx.drawImage( body, 0, y, body.width, 1, dx, y, body.width, 1 );
		}
		bctx.save();
		bctx.globalCompositeOperation = 'copy';
		bctx.drawImage( displaced, 0, 0 );
		bctx.restore();
	}
	if ( fx.glitch ) {
		const strength = Math.max(
				0,
				Math.min( 60, fx.glitch.strength ?? 10 )
			),
			count = Math.round(
				Math.max( 2, Math.min( 16, fx.glitch.slices ?? 10 ) )
			),
			rnd = seededRnd( ( fx.glitch.seed || 8 ) * 104729 );
		const displaced = createCanvas( body.width, body.height ),
			dctx = displaced.getContext( '2d' );
		const image = bctx.getImageData( 0, 0, body.width, body.height );
		let top = body.height,
			bottom = 0;
		for ( let y = 0; y < body.height; y++ ) {
			for ( let x = 0; x < body.width; x++ ) {
				if ( image.data[ ( y * body.width + x ) * 4 + 3 ] > 8 ) {
					top = Math.min( top, y );
					bottom = Math.max( bottom, y );
					break;
				}
			}
		}
		if ( top <= bottom ) {
			const cuts = [ 0, top ];
			for ( let n = 1; n < count; n++ ) {
				cuts.push(
					Math.round(
						top +
							( bottom - top ) *
								( n / count +
									( ( rnd() - 0.5 ) * 0.5 ) / count )
					)
				);
			}
			cuts.push( bottom + 1, body.height );
			cuts.sort( ( x, y ) => x - y );
			for ( let n = 0; n < cuts.length - 1; n++ ) {
				const y = cuts[ n ],
					band = cuts[ n + 1 ] - y;
				if ( band <= 0 ) {
					continue;
				}
				const dx = rnd() < 0.35 ? 0 : ( rnd() - 0.5 ) * 2 * strength;
				dctx.drawImage(
					body,
					0,
					y,
					body.width,
					band,
					dx,
					y,
					body.width,
					band
				);
			}
		}
		bctx.save();
		bctx.globalCompositeOperation = 'copy';
		bctx.drawImage( displaced, 0, 0 );
		bctx.restore();
	}
	if ( fx.fade ) {
		const amount =
				Math.max( 0, Math.min( 100, fx.fade.amount ?? 70 ) ) / 100,
			rad = ( ( fx.fade.angle ?? 105 ) * Math.PI ) / 180,
			dx = Math.cos( rad ),
			dy = Math.sin( rad ),
			len = Math.abs( dx ) * w + Math.abs( dy ) * h || 1;
		const grad = bctx.createLinearGradient(
			pad + w / 2 - ( dx * len ) / 2,
			pad + h / 2 - ( dy * len ) / 2,
			pad + w / 2 + ( dx * len ) / 2,
			pad + h / 2 + ( dy * len ) / 2
		);
		grad.addColorStop( 0, 'rgba(0,0,0,0)' );
		grad.addColorStop(
			Math.max(
				0.05,
				Math.min( 0.95, ( fx.fade.midpoint ?? 50 ) / 100 )
			),
			'rgba(0,0,0,0)'
		);
		grad.addColorStop( 1, `rgba(0,0,0,${ amount })` );
		bctx.globalCompositeOperation = 'destination-out';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}
	const blur = Math.max( 0, Math.min( 30, fx.softBlur?.amount ?? 0 ) );
	ctx.drawImage( blur ? blurCanvas( body, blur ) : body, -pad, -pad );
}

/** Back-of-text effects (echo, shadows, glow, outline …) then the text. */
export function stampTextWithShadow( ctx, layer, env ) {
	const fx = layer.textFX || {};
	const w = Math.max( 1, Math.round( layer.w || 1 ) );
	const h = Math.max( 1, Math.round( layer.h || 1 ) );

	// Layout-affecting fx (letter jitter) must survive in silhouettes and
	// echo/reflection copies, or shadows/outlines drift off the glyphs.
	const layoutFX = fx.jitter ? { jitter: fx.jitter } : null;

	// A copy of the layer re-coloured to a flat solid (for silhouettes).
	// Per-line colour overrides are stripped too (sizes/fonts stay).
	const solidCopy = ( color, extra ) => ( {
		...layer,
		textFX: layoutFX,
		fillType: 'solid',
		color,
		fill: color,
		strokeGradient: null,
		outlineColor: null,
		outlineW: 0,
		// FX outlines (sticker, dashed-outline FX) stay solid; the FX set
		// their own context dash when they want one.
		outlineDash: null,
		shadowOn: false,
		bgColor: null,
		gradientStops: null,
		lineStyles: Array.isArray( layer.lineStyles )
			? layer.lineStyles.map( ( s ) =>
					s ? { ...s, color: undefined } : s
			  )
			: layer.lineStyles,
		spans: layer.spans ? stripSpanColors( layer.spans ) : layer.spans,
		...( extra || {} ),
	} );
	const silhouette = ( color, pad = 0 ) => {
		const c = createCanvas( w + pad * 2, h + pad * 2 );
		const sctx = c.getContext( '2d' );
		sctx.translate( pad, pad );
		drawText( sctx, solidCopy( color ) );
		return c;
	};

	if ( fx.knockout ) {
		drawCutSurface(
			ctx,
			layer,
			fx.knockout,
			( color, pad = 0, extra ) =>
				textSilhouette( layer, color, pad, extra ),
			true
		);
	}
	// Badges and rays follow the ink, so wide paragraph boxes do not make the motif drift.
	const badgeMask = fx.seal || fx.burst ? silhouette( '#ffffff' ) : null;
	const badgeBox = badgeMask
		? textDistanceField(
				badgeMask.getContext( '2d' ).getImageData( 0, 0, w, h )
		  )
		: null;
	// Star seal: a starburst badge panel sitting behind the text.
	if ( fx.seal && ! badgeBox.empty ) {
		const points = Math.max(
			8,
			Math.min( 40, Math.round( fx.seal.points || 16 ) )
		);
		const padP = Math.max( 4, Math.min( 80, fx.seal.pad ?? 26 ) );
		const depth = Math.max( 4, Math.min( 40, fx.seal.depth ?? 16 ) ) / 100;
		const color = fx.seal.color || '#e5484d';
		const rim = fx.seal.color2 || null;
		const cx = ( badgeBox.x0 + badgeBox.x1 ) / 2;
		const cy = ( badgeBox.y0 + badgeBox.y1 ) / 2;
		const rx = ( badgeBox.x1 - badgeBox.x0 ) / 2 + padP;
		const ry = ( badgeBox.y1 - badgeBox.y0 ) / 2 + padP;
		ctx.save();
		ctx.beginPath();
		for ( let i = 0; i < points * 2; i++ ) {
			const f = i % 2 ? 1 - depth * 2 : 1;
			const a = ( i / ( points * 2 ) ) * 2 * Math.PI - Math.PI / 2;
			const px2 = cx + Math.cos( a ) * rx * f;
			const py2 = cy + Math.sin( a ) * ry * f;
			if ( i ) {
				ctx.lineTo( px2, py2 );
			} else {
				ctx.moveTo( px2, py2 );
			}
		}
		ctx.closePath();
		const polish =
				Math.max( 0, Math.min( 100, fx.seal.relief ?? 45 ) ) / 100,
			gradient = ctx.createLinearGradient( 0, cy - ry, 0, cy + ry );
		gradient.addColorStop( 0, mixColor( color, '#fff5de', polish * 0.42 ) );
		gradient.addColorStop( 0.4, color );
		gradient.addColorStop( 1, mixColor( color, '#18243c', polish * 0.48 ) );
		ctx.fillStyle = gradient;
		ctx.fill();
		if ( rim ) {
			ctx.lineWidth = Math.max( 2, padP * 0.12 );
			ctx.strokeStyle = rim;
			ctx.save();
			ctx.translate( cx, cy );
			ctx.scale( 0.88, 0.88 );
			ctx.translate( -cx, -cy );
			ctx.stroke();
			ctx.restore();
		}
		ctx.restore();
	}

	// Speed lines: tapering rays bursting outward from the centre, behind all.
	if ( fx.burst && ! badgeBox.empty ) {
		const count = Math.max(
			6,
			Math.min( 48, Math.round( fx.burst.count || 16 ) )
		);
		const length = Math.max( 10, Math.min( 200, fx.burst.length || 60 ) );
		const gap = Math.max( 10, Math.min( 120, fx.burst.gap || 40 ) );
		const cx = ( badgeBox.x0 + badgeBox.x1 ) / 2;
		const cy = ( badgeBox.y0 + badgeBox.y1 ) / 2;
		ctx.save();
		ctx.fillStyle = fx.burst.color || '#111417';
		for ( let i = 0; i < count; i++ ) {
			const a = ( i / count ) * 2 * Math.PI + 0.015 * i;
			const ux = Math.cos( a );
			const uy = Math.sin( a );
			const wIn = Math.max( 1, length * 0.04 );
			const rx = Math.max( 1, ( badgeBox.x1 - badgeBox.x0 ) / 2 ),
				ry = Math.max( 1, ( badgeBox.y1 - badgeBox.y0 ) / 2 );
			const radius = 1 / Math.hypot( ux / rx, uy / ry );
			const x0 = cx + ux * ( radius + gap );
			const y0 = cy + uy * ( radius + gap );
			const x1 = cx + ux * ( radius + gap + length );
			const y1 = cy + uy * ( radius + gap + length );
			ctx.beginPath();
			ctx.moveTo( x0 - uy * wIn, y0 + ux * wIn );
			ctx.lineTo( x1, y1 );
			ctx.lineTo( x0 + uy * wIn, y0 - ux * wIn );
			ctx.closePath();
			ctx.fill();
		}
		ctx.restore();
	}

	// Sticker: a thick die-cut contour around the whole word plus a soft
	// drop shadow (the outline effect + a shadow).

	if ( fx.stackShadow ) {
		const angle = ( fx.stackShadow.angle ?? 45 ) * DEG;
		const off = Math.max( 2, Math.min( 60, fx.stackShadow.offset || 12 ) );
		const count = Math.max(
			1,
			Math.min( 3, Math.round( fx.stackShadow.count || 2 ) )
		);
		const colors = [
			fx.stackShadow.color || '#e5484d',
			fx.stackShadow.color2 || '#3b82f6',
			fx.stackShadow.color3 || '#f5d90a',
		].slice( 0, count );
		for ( let i = colors.length; i >= 1; i-- ) {
			ctx.drawImage(
				silhouette( colors[ i - 1 ] ),
				Math.cos( angle ) * off * i,
				Math.sin( angle ) * off * i
			);
		}
	}

	// 3D: a shaded extrusion receding along the angle, a dark base outline
	// and a bright bevel ring hugging the front (the glossy gradient face
	// is drawn on top by drawTextBody). Colour + perspective adjustable.
	if ( fx.threeD ) {
		const angle = ( fx.threeD.angle ?? 45 ) * DEG;
		const depth = Math.max( 2, Math.min( 60, fx.threeD.depth || 20 ) );
		const dx = Math.cos( angle );
		const dy = Math.sin( angle );
		const sideLight = fx.threeD.side || '#4b2fa8';
		const sideDark = mixColor( sideLight, '#000000', 0.55 );
		const steps = Math.round( depth );
		for ( let i = steps; i >= 1; i-- ) {
			ctx.drawImage(
				silhouette( mixColor( sideLight, sideDark, i / steps ) ),
				dx * i,
				dy * i
			);
		}
		const dPad = 4;
		const dark = silhouette( mixColor( sideLight, '#000000', 0.7 ), dPad );
		for ( let k = 0; k < 16; k++ ) {
			const a = ( k / 16 ) * 2 * Math.PI;
			ctx.drawImage(
				dark,
				Math.cos( a ) * 2.4 - dPad,
				Math.sin( a ) * 2.4 - dPad
			);
		}
		const bPad = 3;
		const bright = silhouette( fx.threeD.border || '#ffffff', bPad );
		for ( let k = 0; k < 12; k++ ) {
			const a = ( k / 12 ) * 2 * Math.PI;
			ctx.drawImage(
				bright,
				Math.cos( a ) * 1.3 - bPad,
				Math.sin( a ) * 1.3 - bPad
			);
		}
	}

	// Echo: individually colored impressions with a controlled depth fade.
	if ( fx.echo ) {
		const c = fx.echo,
			angle = ( c.angle ?? 22 ) * DEG,
			count = Math.round( Math.max( 1, Math.min( 20, c.count ?? 7 ) ) ),
			gap = Math.max( 1, Math.min( 80, c.gap ?? 10 ) ),
			decay = Math.max( 0, Math.min( 100, c.decay ?? 65 ) ) / 100;
		ctx.save();
		for ( let i = count; i >= 1; i-- ) {
			const t = i / ( count + 1 );
			ctx.globalAlpha = ( 1 - decay * t ) * 0.88;
			const ink = mixColor(
				c.color || '#88d9d5',
				c.color2 || '#6655a2',
				t
			);
			ctx.drawImage(
				silhouette( ink ),
				Math.cos( angle ) * gap * i,
				Math.sin( angle ) * gap * i
			);
		}
		ctx.restore();
	}

	// Halftone shadow: an offset silhouette rendered as a dot screen.
	if ( fx.dotShadow ) {
		const angle = ( fx.dotShadow.angle ?? 45 ) * DEG;
		const offset = Math.max( 1, Math.min( 80, fx.dotShadow.offset || 14 ) );
		const color = fx.dotShadow.color || '#1a1d21';
		const sil = silhouette( color );
		const sctx = sil.getContext( '2d' );
		const t = Math.max( 2, Math.min( 24, fx.dotShadow.size ?? 7 ) );
		const tile = createCanvas( t, t );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = color;
		tctx.beginPath();
		tctx.arc( t / 2, t / 2, t * 0.32, 0, Math.PI * 2 );
		tctx.fill();
		sctx.setTransform( 1, 0, 0, 1, 0, 0 );
		sctx.globalCompositeOperation = 'source-in';
		sctx.fillStyle = sctx.createPattern( tile, 'repeat' );
		sctx.fillRect( 0, 0, sil.width, sil.height );
		ctx.drawImage(
			sil,
			Math.cos( angle ) * offset,
			Math.sin( angle ) * offset
		);
	}

	// A floor shadow starts at the actual ink baseline even when the text box is tall.
	if ( fx.groundShadow ) {
		const c = fx.groundShadow,
			squash = Math.max( 0.1, Math.min( 1, ( c.squash ?? 38 ) / 100 ) ),
			shear = Math.max( -0.6, Math.min( 0.6, ( c.shear ?? 25 ) / 100 ) ),
			blur = Math.max( 0, Math.min( 20, c.blur ?? 7 ) ),
			opacity = Math.max( 0, Math.min( 0.9, ( c.opacity ?? 40 ) / 100 ) );
		const source = silhouette( c.color || '#182637' ),
			box = textDistanceField(
				source.getContext( '2d' ).getImageData( 0, 0, w, h )
			);
		if ( ! box.empty ) {
			const iw = box.x1 - box.x0 + 1,
				ih = box.y1 - box.y0 + 1,
				pad = Math.ceil( blur * 2 + Math.abs( shear ) * ih ) + 3,
				sh = createCanvas(
					iw + pad * 2,
					Math.ceil( ih * squash ) + pad * 2
				),
				g = sh.getContext( '2d' );
			g.translate( pad, pad );
			g.transform( 1, 0, shear, -squash, 0, ih * squash );
			g.drawImage( source, box.x0, box.y0, iw, ih, 0, 0, iw, ih );
			g.setTransform( 1, 0, 0, 1, 0, 0 );
			const fade = g.createLinearGradient( 0, pad, 0, pad + ih * squash );
			fade.addColorStop( 0, 'rgba(0,0,0,1)' );
			fade.addColorStop(
				1,
				`rgba(0,0,0,${
					1 - Math.max( 0, Math.min( 100, c.fade ?? 70 ) ) / 100
				})`
			);
			g.globalCompositeOperation = 'destination-in';
			g.fillStyle = fade;
			g.fillRect( 0, 0, sh.width, sh.height );
			ctx.save();
			ctx.globalAlpha = opacity;
			ctx.drawImage(
				blurCanvas( sh, blur * 0.6 ),
				box.x0 - pad,
				box.y1 - pad
			);
			ctx.restore();
		}
	}

	// Build a union shadow first, then shade it once so overlapping stamps cannot turn the fade opaque.
	for ( const key of [ 'longShadow', 'extrude' ] ) {
		const c = fx[ key ];
		if ( ! c ) {
			continue;
		}
		const length = Math.max(
				0,
				Math.min(
					400,
					( key === 'longShadow' ? c.length : c.depth ) ?? 24
				)
			),
			a = ( c.angle ?? 40 ) * DEG,
			dx = Math.cos( a ),
			dy = Math.sin( a ),
			pad = Math.ceil( length ) + 2;
		const shadow = createCanvas( w + pad * 2, h + pad * 2 ),
			g = shadow.getContext( '2d' ),
			mask = silhouette( '#ffffff' );
		const steps = Math.max( 1, Math.ceil( length ) );
		for ( let i = steps; i >= 0; i-- ) {
			g.drawImage(
				mask,
				pad + ( dx * length * i ) / steps,
				pad + ( dy * length * i ) / steps
			);
		}
		const grad = g.createLinearGradient(
			pad + w * 0.5 - dx * length * 0.15,
			pad + h * 0.5 - dy * length * 0.15,
			pad + w * 0.5 + dx * length,
			pad + h * 0.5 + dy * length
		);
		const c1 = c.color || ( key === 'longShadow' ? '#283953' : '#38455f' ),
			c2 = c.color2 || '#8aa3bb';
		grad.addColorStop( 0, c1 );
		grad.addColorStop( 1, key === 'extrude' ? c2 : c1 );
		g.globalCompositeOperation = 'source-in';
		g.fillStyle = grad;
		g.fillRect( 0, 0, shadow.width, shadow.height );
		if ( key === 'longShadow' ) {
			const amount = Math.max( 0, Math.min( 100, c.fade ?? 70 ) ) / 100;
			const fade = g.createLinearGradient(
				pad + w * 0.5 - dx * length * 0.15,
				pad + h * 0.5 - dy * length * 0.15,
				pad + w * 0.5 + dx * length,
				pad + h * 0.5 + dy * length
			);
			fade.addColorStop( 0, 'rgba(0,0,0,0.65)' );
			fade.addColorStop( 1, `rgba(0,0,0,${ 0.65 * ( 1 - amount ) })` );
			g.globalCompositeOperation = 'destination-in';
			g.fillStyle = fade;
			g.fillRect( 0, 0, shadow.width, shadow.height );
		}
		ctx.drawImage( shadow, -pad, -pad );
	}

	// Splice: a hollow (outline-only) copy of the text, offset behind it.
	if ( fx.splice ) {
		const angle = ( fx.splice.angle ?? 45 ) * DEG;
		const offset = Math.max( 1, Math.min( 80, fx.splice.offset || 10 ) );
		const color = fx.splice.color || '#e5484d';
		const lw = Math.max( 1, Math.min( 8, fx.splice.width ?? 2 ) );
		const off = createCanvas( w, h );
		drawText(
			off.getContext( '2d' ),
			solidCopy( 'rgba(0,0,0,0)', { outlineColor: color, outlineW: lw } )
		);
		ctx.drawImage(
			off,
			Math.cos( angle ) * offset,
			Math.sin( angle ) * offset
		);
	}

	// Light builds from a broad tinted halo, a soft middle and a tight luminous edge.
	for ( const key of [ 'glow', 'neon' ] ) {
		const c = fx[ key ];
		if ( ! c ) {
			continue;
		}
		const size = Math.max( 1, Math.min( 60, c.size ?? 20 ) ),
			pad = Math.ceil( size * 1.6 ) + 2,
			ink = silhouette( c.color || '#5adad1', pad ),
			intensity = Math.max( 0, Math.min( 100, c.intensity ?? 80 ) ) / 100;
		ctx.save();
		for ( const [ radius, alpha ] of [
			[ size * 0.72, 0.48 ],
			[ size * 0.29, 0.72 ],
			[ Math.max( 0.6, size * 0.075 ), 0.55 ],
		] ) {
			ctx.globalAlpha = intensity * alpha;
			ctx.drawImage( blurCanvas( ink, radius ), -pad, -pad );
		}
		ctx.restore();
	}

	// Hatch shadow: an offset silhouette drawn as diagonal line shading.
	if ( fx.hatchShadow ) {
		const off = Math.max( 2, Math.min( 60, fx.hatchShadow.offset || 10 ) );
		const rad = ( fx.hatchShadow.angle ?? 45 ) * DEG;
		const gapH = Math.max( 3, Math.min( 20, fx.hatchShadow.gap || 6 ) );
		const color = fx.hatchShadow.color || '#1a1d21';
		const sil = silhouette( color );
		const hatch = createCanvas( sil.width, sil.height );
		const sctx3 = hatch.getContext( '2d' );
		sctx3.save();
		sctx3.translate( sil.width / 2, sil.height / 2 );
		sctx3.rotate( -Math.PI / 4 );
		const diag = Math.hypot( sil.width, sil.height );
		sctx3.fillStyle = '#000';
		for ( let gy = -diag / 2; gy < diag / 2; gy += gapH ) {
			sctx3.fillRect(
				-diag / 2,
				gy,
				diag,
				Math.max( 1, Math.min( 8, fx.hatchShadow.width ?? 1 ) )
			);
		}
		sctx3.restore();
		const sx = sil.getContext( '2d' );
		sx.globalCompositeOperation = 'destination-in';
		sx.drawImage( hatch, 0, 0 );
		ctx.drawImage( sil, Math.cos( rad ) * off, Math.sin( rad ) * off );
	}

	// Gradient outline: a stroked ring filled with a two-color ramp.
	drawTextContours( ctx, layer, silhouette );

	if ( fx.confetti ) {
		const density = Math.max(
			5,
			Math.min( 100, fx.confetti.density ?? 40 )
		);
		const size = Math.max( 2, Math.min( 14, fx.confetti.size || 5 ) );
		const rnd = seededRnd( ( fx.confetti.seed || 1 ) * 31337 );
		const cPad = size * 2 + 6;
		const count = Math.round( density * 0.7 );
		const palette = [
			fx.confetti.color || '#e89273',
			fx.confetti.color2 || '#80cfc7',
			mixColor(
				fx.confetti.color || '#e89273',
				fx.confetti.color2 || '#80cfc7',
				0.5
			),
			'#fff1d8',
		];
		for ( let i = 0; i < count; i++ ) {
			const cx = rnd() * ( w + cPad * 2 ) - cPad;
			const cy = rnd() * ( h + cPad * 2 ) - cPad;
			const cs = size * ( 0.4 + rnd() * 0.8 );
			ctx.fillStyle = palette[ Math.floor( rnd() * palette.length ) ];
			const kind = rnd();
			ctx.save();
			ctx.translate( cx, cy );
			if ( kind < 0.4 ) {
				ctx.beginPath();
				ctx.arc( 0, 0, cs / 2, 0, 2 * Math.PI );
				ctx.fill();
			} else if ( kind < 0.75 ) {
				ctx.rotate( rnd() * Math.PI );
				ctx.fillRect( -cs / 2, -cs / 4, cs, cs / 2 );
			} else {
				// Four-point sparkle.
				ctx.rotate( rnd() * Math.PI );
				ctx.beginPath();
				for ( let ptI = 0; ptI < 8; ptI++ ) {
					const rr = ptI % 2 ? cs * 0.22 : cs * 0.75;
					const a = ( ptI / 8 ) * 2 * Math.PI;
					ctx[ ptI ? 'lineTo' : 'moveTo' ](
						Math.cos( a ) * rr,
						Math.sin( a ) * rr
					);
				}
				ctx.closePath();
				ctx.fill();
			}
			ctx.restore();
		}
	}

	// Motion blur: a smooth directional smear of the colored text.
	if ( fx.motionBlur ) {
		const length = Math.max(
			4,
			Math.min( 120, fx.motionBlur.length || 40 )
		);
		const rad = ( ( fx.motionBlur.angle ?? 180 ) * Math.PI ) / 180;
		const off = createCanvas( w, h );
		drawText( off.getContext( '2d' ), { ...layer, textFX: layoutFX } );
		const steps = Math.min( 48, length );
		const stepLen = length / steps;
		for ( let i = steps; i >= 1; i-- ) {
			// Quadratic fade: the far end thins out fast, or the trail
			// saturates into a solid slab that swallows the glyphs.
			ctx.globalAlpha = Math.max(
				0.01,
				( ( 0.32 *
					Math.max(
						0,
						Math.min( 100, fx.motionBlur.opacity ?? 65 )
					) ) /
					100 ) *
					Math.pow( 1 - i / steps, 2 )
			);
			ctx.drawImage(
				off,
				Math.cos( rad ) * i * stepLen,
				Math.sin( rad ) * i * stepLen
			);
		}
		ctx.globalAlpha = 1;
	}

	// Chromatic aberration: a red and a cyan ghost right behind the text.
	if ( fx.chromatic ) {
		const offset = Math.max( 1, Math.min( 40, fx.chromatic.offset || 4 ) );
		const rad = ( ( fx.chromatic.angle ?? 0 ) * Math.PI ) / 180;
		const cdx = Math.cos( rad ) * offset;
		const cdy = Math.sin( rad ) * offset;
		ctx.globalAlpha = 0.85;
		ctx.drawImage(
			silhouette( fx.chromatic.color || '#59dae8' ),
			-cdx,
			-cdy
		);
		ctx.drawImage(
			silhouette( fx.chromatic.color2 || '#f66d95' ),
			cdx,
			cdy
		);
		ctx.globalAlpha = 1;
	}

	drawTextBody( ctx, layer, env );

	// Drips: seeded drops running down from the glyph bottom edges.
	if ( fx.drip ) {
		const count = Math.max( 1, Math.min( 12, fx.drip.count || 5 ) );
		const dLen = Math.max( 10, Math.min( 160, fx.drip.length || 50 ) );
		const rnd = seededRnd( ( fx.drip.seed || 1 ) * 52711 );
		const dColor =
			fx.drip.color ||
			( 'string' === typeof layer.color ? layer.color : '#e5484d' );
		const sil = silhouette( dColor );
		const data = sil.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
		const cols = [];
		for ( let x = 2; x < w - 2; x += 2 ) {
			for ( let y = h - 1; y >= 0; y-- ) {
				if ( data[ ( y * w + x ) * 4 + 3 ] > 60 ) {
					cols.push( [ x, y ] );
					break;
				}
			}
		}
		ctx.fillStyle = dColor;
		for ( let i = 0; i < count && cols.length; i++ ) {
			const [ bx, by ] = cols[ Math.floor( rnd() * cols.length ) ];
			const len = dLen * ( 0.4 + rnd() * 0.6 );
			const r = Math.max(
				1.5,
				( layer.fontSize || 48 ) * 0.045 * ( 0.7 + rnd() * 0.6 )
			);
			const polish =
					Math.max( 0, Math.min( 100, fx.drip.shine ?? 55 ) ) / 100,
				grad = ctx.createLinearGradient( bx - r, by, bx + r, by );
			grad.addColorStop( 0, mixColor( dColor, '#142230', 0.28 ) );
			grad.addColorStop(
				0.28,
				mixColor( dColor, '#fff8dc', polish * 0.65 )
			);
			grad.addColorStop( 0.62, dColor );
			grad.addColorStop( 1, mixColor( dColor, '#142230', 0.35 ) );
			ctx.fillStyle = grad;
			ctx.beginPath();
			ctx.moveTo( bx - r, by - 1 );
			ctx.quadraticCurveTo(
				bx - r * 0.25,
				by + len * 0.55,
				bx,
				by + len
			);
			ctx.quadraticCurveTo(
				bx + r * 0.25,
				by + len * 0.55,
				bx + r,
				by - 1
			);
			ctx.closePath();
			ctx.fill();
			ctx.beginPath();
			ctx.arc( bx, by + len, r * 0.95, 0, 2 * Math.PI );
			ctx.fill();
		}
	}

	// Sketch: wobbly hand-drawn stroke passes over the glyph edges.
	if ( fx.sketch ) {
		const passes = Math.max( 1, Math.min( 3, fx.sketch.passes || 2 ) );
		const sWidth = Math.max( 1, Math.min( 6, fx.sketch.width || 2 ) );
		const rough = Math.max( 0, Math.min( 10, fx.sketch.rough ?? 3 ) );
		const rnd = seededRnd( ( fx.sketch.seed || 1 ) * 911 );
		const sColor = fx.sketch.color || '#1a1d21';
		for ( let pass = 0; pass < passes; pass++ ) {
			const off = textSilhouette( layer, 'rgba(0,0,0,0)', 8, {
				outlineColor: sColor,
				outlineW: sWidth,
			} );
			const dx = ( rnd() - 0.5 ) * 2 * rough;
			const dy = ( rnd() - 0.5 ) * 2 * rough;
			const rot = ( ( rnd() - 0.5 ) * rough ) / 240;
			ctx.save();
			ctx.globalAlpha = 0.85;
			ctx.translate( w / 2, h / 2 );
			ctx.rotate( rot );
			ctx.translate( -w / 2, -h / 2 );
			ctx.drawImage( off, dx - 8, dy - 8 );
			ctx.restore();
		}
	}

	// Dashed outline: a stitched stroke along the glyph edges.
	if ( fx.dashedOutline ) {
		const width = Math.max(
			1,
			Math.min( 12, fx.dashedOutline.width || 2 )
		);
		const dash = Math.max( 2, Math.min( 40, fx.dashedOutline.dash || 8 ) );
		const gapLen = Math.max( 2, Math.min( 40, fx.dashedOutline.gap || 6 ) );
		const off = createCanvas( w + 8, h + 8 );
		const octx = off.getContext( '2d' );
		octx.setLineDash( [ dash, gapLen ] );
		octx.translate( 4, 4 );
		drawText(
			octx,
			solidCopy( 'rgba(0,0,0,0)', {
				outlineColor: fx.dashedOutline.color || '#1a1d21',
				outlineW: width,
			} )
		);
		ctx.drawImage( off, -4, -4 );
	}

	// Marquee lights: glowing bulbs marching along the glyph edges.
	if ( fx.marquee ) {
		const bulb = Math.max( 2, Math.min( 14, fx.marquee.size || 5 ) );
		const gapM = Math.max( 4, Math.min( 48, fx.marquee.gap || 14 ) );
		const color = fx.marquee.color || '#ffd166';
		const glowR = Math.max( 0, Math.min( 30, fx.marquee.glow ?? 12 ) );
		const mPad = bulb + glowR + 6;
		const bulbs = createCanvas( w + 2 * mPad, h + 2 * mPad );
		const bx = bulbs.getContext( '2d' );
		bx.setLineDash( [ 0.01, gapM ] );
		bx.lineCap = 'round';
		bx.translate( mPad, mPad );
		drawText(
			bx,
			solidCopy( 'rgba(0,0,0,0)', {
				outlineColor: color,
				outlineW: bulb,
			} )
		);
		if ( glowR ) {
			ctx.globalCompositeOperation = 'lighter';
			ctx.globalAlpha = 0.9;
			ctx.drawImage( blurCanvas( bulbs, glowR * 0.5 ), -mPad, -mPad );
			ctx.globalAlpha = 1;
			ctx.globalCompositeOperation = 'source-over';
		}
		ctx.drawImage( bulbs, -mPad, -mPad );
	}

	// Neon core: a soft white highlight over the glyphs.
	if ( fx.neon ) {
		const pad = 4;
		const core = blurCanvas( silhouette( '#ffffff', pad ), 1.4 );
		ctx.globalAlpha = 0.38;
		ctx.drawImage( core, -pad, -pad );
		ctx.globalAlpha = 1;
	}

	// Sparkle: seeded four-point glints sitting on the glyphs.
	if ( fx.sparkle ) {
		const count = Math.max(
			1,
			Math.min( 24, Math.round( fx.sparkle.count || 8 ) )
		);
		const size = Math.max( 3, Math.min( 30, fx.sparkle.size || 12 ) );
		const color = fx.sparkle.color || '#ffffff';
		const rnd = seededRnd( ( fx.sparkle.seed || 1 ) * 271 );
		const sil = silhouette( '#000000' );
		let data = null;
		try {
			data = sil
				.getContext( '2d' )
				.getImageData( 0, 0, sil.width, sil.height ).data;
		} catch ( e ) {
			data = null;
		}
		ctx.save();
		ctx.fillStyle = color;
		let placed = 0;
		for ( let tries = 0; tries < count * 50 && placed < count; tries++ ) {
			const gx = Math.floor( rnd() * w );
			const gy = Math.floor( rnd() * h );
			if ( data && data[ ( gy * sil.width + gx ) * 4 + 3 ] < 128 ) {
				continue;
			}
			const sSize = size * ( 0.55 + rnd() * 0.65 );
			ctx.save();
			ctx.translate( gx, gy );
			ctx.rotate( ( rnd() - 0.5 ) * 0.5 );
			const glow =
					Math.max( 0, Math.min( 100, fx.sparkle.glow ?? 35 ) ) / 100,
				halo = ctx.createRadialGradient( 0, 0, 0, 0, 0, sSize );
			halo.addColorStop( 0, mixColor( color, '#ffffff', 0.5 ) );
			halo.addColorStop( 0.18, color );
			halo.addColorStop( 1, 'rgba(255,255,255,0)' );
			ctx.globalAlpha = glow * 0.6;
			ctx.fillStyle = halo;
			ctx.fillRect( -sSize, -sSize, sSize * 2, sSize * 2 );
			ctx.globalAlpha = 1;
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo( 0, -sSize );
			ctx.quadraticCurveTo( 0, 0, sSize * 0.45, 0 );
			ctx.quadraticCurveTo( 0, 0, 0, sSize );
			ctx.quadraticCurveTo( 0, 0, -sSize * 0.45, 0 );
			ctx.quadraticCurveTo( 0, 0, 0, -sSize );
			ctx.closePath();
			ctx.fill();
			ctx.restore();
			placed++;
		}
		ctx.restore();
	}

	// Reflection begins directly below the visible letters, independent of paragraph-box whitespace.
	if ( fx.reflection ) {
		const c = fx.reflection,
			gap = Math.max( 0, Math.min( 60, c.gap ?? 3 ) ),
			alpha = Math.max( 0.05, Math.min( 0.95, ( c.alpha ?? 50 ) / 100 ) );
		const source = createCanvas( w, h );
		drawTextBody(
			source.getContext( '2d' ),
			{
				...layer,
				textFX: { ...fx, reflection: null, groundShadow: null },
			},
			env
		);
		const box = textDistanceField(
			source.getContext( '2d' ).getImageData( 0, 0, w, h )
		);
		if ( ! box.empty ) {
			const iw = box.x1 - box.x0 + 1,
				ih = box.y1 - box.y0 + 1,
				refl = createCanvas( iw, ih ),
				g = refl.getContext( '2d' );
			g.translate( 0, ih );
			g.scale( 1, -1 );
			g.drawImage( source, box.x0, box.y0, iw, ih, 0, 0, iw, ih );
			g.setTransform( 1, 0, 0, 1, 0, 0 );
			const fade = g.createLinearGradient( 0, 0, 0, ih ),
				amount = Math.max( 0, Math.min( 100, c.fade ?? 75 ) ) / 100;
			fade.addColorStop( 0, 'rgba(0,0,0,.9)' );
			fade.addColorStop( 1, `rgba(0,0,0,${ 0.9 * ( 1 - amount ) })` );
			g.globalCompositeOperation = 'destination-in';
			g.fillStyle = fade;
			g.fillRect( 0, 0, iw, ih );
			ctx.save();
			ctx.globalAlpha = alpha;
			ctx.drawImage( refl, box.x0, box.y1 + 1 + gap );
			ctx.restore();
		}
	}
}

// Every live text-effect key (besides warp) drawTextWithEffects understands.
export const TEXT_FX_KEYS = [
	...PREMIUM_TEXT_KEYS,
	'longShadow',
	'extrude',
	'skew',
	'glow',
	'echo',
	'outline',
	'neon',
	'splice',
	'dotShadow',
	'reflection',
	'rings',
	'bevel',
	'letterpress',
	'imageFill',
	'jitter',
	'rainbow',
	'chromatic',
	'glitch',
	'shine',
	'scanlines',
	'grunge',
	'dashedOutline',
	'groundShadow',
	'innerGlow',
	'neonTube',
	'motionBlur',
	'paperCut',
	'pixelate',
	'sketch',
	'confetti',
	'stripesFill',
	'drip',
	'marker',
	'circleMark',
	'scribbleUnder',
	'strikeFx',
	'gradient',
	'chrome',
	'comicDots',
	'spray',
	'highlight',
	'underlineFx',
	'sticker',
	'burst',
	'twoTone',
	'foil',
	'stackShadow',
	'offsetPrint',
	'fade',
	'softBlur',
	'threeD',
	'checker',
	'halftone',
	'static',
	'dotMatrix',
	'fold',
	'inline',
	'wireframe',
	'knockout',
	'contour',
	'marquee',
	'sparkle',
	'waves',
	'motifFill',
	'camo',
	'circuit',
	'plaid',
	'bubbles',
	'cracks',
	'ripple',
	'seal',
	'hatchShadow',
	'gradientOutline',
];

/**
 * Non-destructive text effects (v1.38+): skew, long shadow, block/extrude and
 * warp presets (v1.41). The text stays fully editable — effects are applied
 * only at render time, around the core drawText().
 */
export function drawTextWithEffects( ctx, layer, env ) {
	const fx = layer.textFX;
	const warpId =
		fx && fx.warp && TEXT_WARPS[ fx.warp.type ] ? fx.warp.type : null;
	if ( ! fx || ( ! warpId && ! TEXT_FX_KEYS.some( ( k ) => fx[ k ] ) ) ) {
		drawText( ctx, layer );
		return;
	}
	ctx.save();
	const sk = fx.skew;
	if ( sk && ( sk.x || sk.y ) ) {
		const cx = ( layer.w || 0 ) / 2;
		const cy = ( layer.h || 0 ) / 2;
		ctx.translate( cx, cy );
		ctx.transform(
			1,
			Math.tan( ( sk.y || 0 ) * DEG ),
			Math.tan( ( sk.x || 0 ) * DEG ),
			1,
			0,
			0
		);
		ctx.translate( -cx, -cy );
	}

	if ( warpId ) {
		const bend = Math.max(
			-1,
			Math.min( 1, ( fx.warp.bend ?? 50 ) / 100 )
		);
		warpText( ctx, layer, warpId, bend, env );
	} else {
		stampTextWithShadow( ctx, layer, env );
	}
	ctx.restore();
}

/** Tiny deterministic PRNG for seeded effects (grunge, glitch). */
export function seededRnd( seed ) {
	let t = ( Math.abs( Math.round( seed ) ) % 233280 ) + 1;
	return () => {
		t = ( t * 9301 + 49297 ) % 233280;
		return t / 233280;
	};
}

/** Default palette for the letter color cycle (fx.rainbow). */
export const RAINBOW_COLORS = [
	'#e5484d',
	'#ff8a00',
	'#f5d90a',
	'#30a46c',
	'#3b82f6',
	'#8e4ec6',
];

/**
 * Per-character paint modifiers (v1.139.0): letter jitter (playful random
 * rotation/offset per glyph, deterministic via seed) and the letter color
 * cycle. Returns null when neither effect is active. The running index
 * follows paint order, which is stable across renders, so silhouettes in
 * stampTextWithShadow line up with the visible glyphs.
 */
export function charFxFor( layer ) {
	const fx = layer.textFX || {};
	if ( ! fx.jitter && ! fx.rainbow ) {
		return null;
	}
	const seed = ( fx.jitter?.seed || 1 ) * 74.7;
	const amount =
		Math.min( 100, Math.max( 0, fx.jitter?.amount ?? 50 ) ) / 100;
	const rnd = ( i, salt ) => {
		const x =
			Math.sin( ( i + 1 ) * 127.1 + salt * 311.7 + seed ) * 43758.5453;
		return x - Math.floor( x );
	};
	let palette = fx.rainbow
		? Array.isArray( fx.rainbow.colors ) && fx.rainbow.colors.length
			? fx.rainbow.colors
			: RAINBOW_COLORS
		: null;
	if ( fx.rainbow && ! Array.isArray( fx.rainbow.colors ) ) {
		const hue = Math.max( 0, Math.min( 360, fx.rainbow.offset ?? 20 ) ),
			saturation = Math.max(
				0,
				Math.min( 100, fx.rainbow.saturation ?? 70 )
			);
		palette = Array.from(
			{ length: 7 },
			( _, i ) =>
				`hsl(${ ( hue + ( i * 360 ) / 7 ) % 360 },${ saturation }%,${
					58 + ( i % 3 ) * 4
				}%)`
		);
	}
	const rotate =
			Math.max( 0, Math.min( 100, fx.jitter?.rotation ?? 65 ) ) / 65,
		spread = Math.max( 0, Math.min( 100, fx.jitter?.spread ?? 50 ) ) / 50;
	let idx = 0;
	return {
		next( ch, size ) {
			const isSpace = /\s/.test( ch );
			const i = idx;
			if ( ! isSpace ) {
				idx++;
			}
			return {
				color:
					palette && ! isSpace ? palette[ i % palette.length ] : null,
				rot: fx.jitter
					? ( rnd( i, 1 ) - 0.5 ) * amount * 0.42 * rotate
					: 0,
				dx: fx.jitter
					? ( rnd( i, 2 ) - 0.5 ) * amount * size * 0.12 * spread
					: 0,
				dy: fx.jitter
					? ( rnd( i, 3 ) - 0.5 ) * amount * size * 0.24 * spread
					: 0,
			};
		},
	};
}

/**
 * Paint one glyph through the charFx modifiers: color override plus a small
 * transform around the glyph's optical center. `paint( gx, gy )` does the
 * actual stroke/fill at the given position.
 */
export function paintGlyphFx( ctx, charFx, ch, x, y, st, chW, paint ) {
	if ( ! charFx ) {
		paint( x, y );
		return;
	}
	const m = charFx.next( ch, st.size );
	if ( m.color ) {
		ctx.fillStyle = m.color;
	}
	if ( m.rot ) {
		ctx.save();
		ctx.translate( x + chW / 2 + m.dx, y + m.dy );
		ctx.rotate( m.rot );
		paint( -chW / 2, 0 );
		ctx.restore();
	} else {
		paint( x + m.dx, y + m.dy );
	}
}
