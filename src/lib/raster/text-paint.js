import { hexToRgb } from '../color';
import { stripSpanColors } from '../rich-text';
import { createCanvas } from './env';
import { DEG, TEXT_WARPS, warpText } from './text-warp';
import { drawText } from './text-draw';
import { blurCanvas } from './styles';

/**
 * Hand-drawn highlight shapes behind the text lines (v1.141.0): marker
 * swipe, sketched circle and scribble underline. Called from the drawText
 * paths with EXACT per-line geometry (same rects the pill background uses).
 * rects: [{ x, baseline, width, size }].
 */
export function drawLineHighlights( ctx, fx, rects ) {
	const kinds = [
		[ 'marker', fx.marker ],
		[ 'circleMark', fx.circleMark ],
		[ 'scribbleUnder', fx.scribbleUnder ],
		[ 'strikeFx', fx.strikeFx ],
	].filter( ( k ) => k[ 1 ] );
	if ( ! kinds.length ) {
		return;
	}
	for ( const [ kind, conf ] of kinds ) {
		const rough = Math.max( 0, Math.min( 10, conf.rough ?? 4 ) );
		const rnd = seededRnd( ( conf.seed || 1 ) * 4241 );
		const wob = () => ( rnd() - 0.5 ) * rough;
		ctx.save();
		// Style variants (v1.256.0) - 0 keeps each effect's classic look.
		const style = Math.round(
			Math.max( 0, Math.min( 3, conf.style ?? 0 ) )
		);
		for ( const rect of rects ) {
			if ( ! rect.width ) {
				continue;
			}
			const { x, baseline, width, size } = rect;
			if ( 'marker' === kind ) {
				// Real brush bands (v1.256.0): a filled polygon whose top
				// and bottom edges wobble independently, with chisel-cut
				// ends and a taper - not a round-cap capsule.
				const y = baseline - size * 0.32;
				ctx.fillStyle = conf.color || '#ffe066';
				const band = ( x0, x1, yMid, h, tilt, taper, alpha ) => {
					const steps = Math.max(
						4,
						Math.round( ( x1 - x0 ) / Math.max( 18, h * 0.8 ) )
					);
					const yAt = ( t ) => yMid + tilt * ( t - 0.5 );
					const hAt = ( t ) => h * ( 1 - taper * t );
					ctx.globalAlpha = alpha;
					ctx.beginPath();
					for ( let i = 0; i <= steps; i++ ) {
						const t = i / steps;
						const px =
							x0 + ( x1 - x0 ) * t - ( 0 === i ? h * 0.16 : 0 );
						const py = yAt( t ) - hAt( t ) / 2 + wob();
						if ( 0 === i ) {
							ctx.moveTo( px, py );
						} else {
							ctx.lineTo( px, py );
						}
					}
					for ( let i = steps; i >= 0; i-- ) {
						const t = i / steps;
						const px =
							x0 +
							( x1 - x0 ) * t +
							( i === steps ? hAt( 1 ) * 0.22 : 0 );
						ctx.lineTo( px, yAt( t ) + hAt( t ) / 2 + wob() );
					}
					ctx.closePath();
					ctx.fill();
				};
				const over = size * 0.3;
				if ( 1 === style ) {
					// Swipe: one confident angled stroke, strong taper.
					band(
						x - over * 1.6,
						x + width + over * 1.6,
						y + wob(),
						size * 0.92,
						size * 0.14,
						0.38,
						0.7
					);
				} else if ( 2 === style ) {
					// Double swipe: two slim bands with a visible gap.
					band(
						x - over,
						x + width + over * 0.7,
						y - size * 0.22,
						size * 0.44,
						size * 0.06,
						0.14,
						0.62
					);
					band(
						x - over * 0.7,
						x + width + over,
						y + size * 0.26,
						size * 0.44,
						-size * 0.05,
						0.14,
						0.55
					);
				} else if ( 3 === style ) {
					// Scribble fill: quick zigzag strokes over the line.
					ctx.strokeStyle = conf.color || '#ffe066';
					ctx.lineWidth = size * 0.17;
					ctx.lineCap = 'round';
					ctx.lineJoin = 'round';
					ctx.globalAlpha = 0.8;
					const step = Math.max( 6, size * 0.42 );
					ctx.beginPath();
					let up = true;
					ctx.moveTo( x - over * 0.6, y + size * 0.4 + wob() );
					for (
						let px = x - over * 0.4;
						px <= x + width + over * 0.6;
						px += step
					) {
						ctx.lineTo(
							px + wob() * 1.5,
							y +
								( up ? -size * 0.38 : size * 0.42 ) +
								wob() * 1.5
						);
						up = ! up;
					}
					ctx.stroke();
				} else {
					// Classic band, now with brush edges and layered ink.
					band(
						x - over,
						x + width + over,
						y,
						size * 0.95,
						wob() * 0.6,
						0.1,
						0.62
					);
					band(
						x - over * 0.6,
						x + width + over * 0.8,
						y + size * 0.05,
						size * 0.8,
						-wob() * 0.5,
						0.16,
						0.3
					);
				}
			} else if ( 'circleMark' === kind ) {
				const cx = x + width / 2;
				const cy = baseline - size * 0.32;
				const rx = width / 2 + size * 0.5;
				const ry = size * 0.78;
				const k = 0.5523;
				ctx.strokeStyle = conf.color || '#e5484d';
				ctx.lineCap = 'round';
				// Hand tilt per line (v1.256.0).
				const rot = ( rnd() - 0.5 ) * 0.09;
				ctx.save();
				ctx.translate( cx, cy );
				ctx.rotate( rot );
				ctx.translate( -cx, -cy );
				const loop = ( sx, sy, lw, alpha ) => {
					ctx.lineWidth = Math.max( 2, lw );
					ctx.globalAlpha = alpha;
					const rxx = rx * sx;
					const ryy = ry * sy;
					ctx.beginPath();
					ctx.moveTo( cx - rxx + wob(), cy + wob() );
					ctx.bezierCurveTo(
						cx - rxx + wob(),
						cy - ryy * k + wob(),
						cx - rxx * k + wob(),
						cy - ryy + wob(),
						cx + wob(),
						cy - ryy + wob()
					);
					ctx.bezierCurveTo(
						cx + rxx * k + wob(),
						cy - ryy + wob(),
						cx + rxx + wob(),
						cy - ryy * k + wob(),
						cx + rxx + wob(),
						cy + wob()
					);
					ctx.bezierCurveTo(
						cx + rxx + wob(),
						cy + ryy * k + wob(),
						cx + rxx * k + wob(),
						cy + ryy + wob(),
						cx + wob(),
						cy + ryy + wob()
					);
					ctx.bezierCurveTo(
						cx - rxx * k + wob(),
						cy + ryy + wob(),
						cx - rxx + wob(),
						cy + ryy * k + wob(),
						cx - rxx + wob() * 2,
						cy + wob() * 2
					);
					// Hand-drawn circles never close cleanly: overshoot
					// past the start point into the second lap.
					ctx.quadraticCurveTo(
						cx - rxx * 1.04 + wob(),
						cy - ryy * 0.5 + wob(),
						cx - rxx * 0.55 + wob(),
						cy - ryy * 0.92 + wob()
					);
					ctx.stroke();
				};
				if ( 1 === style ) {
					// Double loop: two clearly separate laps.
					loop( 1, 1, size * 0.07, 0.9 );
					loop( 1.14, 1.22, size * 0.06, 0.85 );
				} else if ( 2 === style ) {
					// Sketchy box with crossed corners.
					ctx.restore();
					ctx.save();
					const bx0 = x - size * 0.35;
					const bx1 = x + width + size * 0.35;
					const by0 = baseline - size * 0.86;
					const by1 = baseline + size * 0.28;
					ctx.strokeStyle = conf.color || '#e5484d';
					ctx.lineCap = 'round';
					const edge = ( x1, y1, x2, y2, lw, alpha ) => {
						const ov = size * ( 0.1 + rnd() * 0.12 );
						const dx = x2 - x1;
						const dy = y2 - y1;
						const len = Math.hypot( dx, dy ) || 1;
						const ux = ( dx / len ) * ov;
						const uy = ( dy / len ) * ov;
						ctx.lineWidth = Math.max( 2, lw );
						ctx.globalAlpha = alpha;
						ctx.beginPath();
						ctx.moveTo( x1 - ux + wob(), y1 - uy + wob() );
						ctx.quadraticCurveTo(
							( x1 + x2 ) / 2 + wob() * 1.8,
							( y1 + y2 ) / 2 + wob() * 1.8,
							x2 + ux + wob(),
							y2 + uy + wob()
						);
						ctx.stroke();
					};
					for ( let pass = 0; pass < 2; pass++ ) {
						const lw = size * ( pass ? 0.05 : 0.07 );
						const alpha = pass ? 0.5 : 0.9;
						edge( bx0, by0, bx1, by0, lw, alpha );
						edge( bx1, by0, bx1, by1, lw, alpha );
						edge( bx1, by1, bx0, by1, lw, alpha );
						edge( bx0, by1, bx0, by0, lw, alpha );
					}
				} else {
					// Classic oval with varying stroke weight.
					loop( 1, 1, size * 0.075, 0.9 );
					loop( 0.97, 1.05, size * 0.055, 0.55 );
				}
				ctx.restore();
			} else if ( 'strikeFx' === kind ) {
				// Hand-drawn strike-through (v1.248): rough line, double
				// line or a big X across each line's box.
				const strike = Math.min( 2, style );
				const over = size * 0.18;
				const midY = baseline - size * 0.3;
				ctx.strokeStyle = conf.color || '#e5484d';
				ctx.lineWidth = Math.max( 2, size * 0.09 );
				ctx.lineCap = 'round';
				ctx.globalAlpha = 0.95;
				const strokeLine = ( y1, y2 ) => {
					for ( let pass = 0; pass < 2; pass++ ) {
						ctx.beginPath();
						ctx.moveTo( x - over + wob(), y1 + wob() );
						ctx.quadraticCurveTo(
							x + width / 2 + wob() * 2,
							( y1 + y2 ) / 2 + wob() * 2,
							x + width + over + wob(),
							y2 + wob()
						);
						ctx.stroke();
					}
				};
				if ( 2 === strike ) {
					const top = baseline - size * 0.72;
					const bottom = baseline + size * 0.1;
					strokeLine( top, bottom );
					strokeLine( bottom, top );
				} else if ( 1 === strike ) {
					strokeLine( midY - size * 0.09, midY - size * 0.09 );
					strokeLine( midY + size * 0.12, midY + size * 0.12 );
				} else {
					strokeLine( midY, midY );
				}
			} else {
				// scribbleUnder styles (v1.256.0): 0 wave (classic),
				// 1 double stroke, 2 hand zigzag, 3 cursive loops.
				const y = baseline + size * 0.18;
				ctx.strokeStyle = conf.color || '#3b82f6';
				ctx.lineCap = 'round';
				ctx.lineJoin = 'round';
				const wave = ( yy, lw, alpha ) => {
					ctx.lineWidth = Math.max( 2, lw );
					ctx.globalAlpha = alpha;
					for ( let pass = 0; pass < 2; pass++ ) {
						ctx.beginPath();
						ctx.moveTo( x - size * 0.1 + wob(), yy + wob() );
						ctx.quadraticCurveTo(
							x + width * ( 0.3 + rnd() * 0.4 ),
							yy + size * 0.1 + wob(),
							x + width + size * 0.1 + wob(),
							yy + wob()
						);
						ctx.stroke();
					}
				};
				if ( 1 === style ) {
					wave( y, size * 0.1, 0.95 );
					wave( y + size * 0.17, size * 0.08, 0.9 );
				} else if ( 2 === style ) {
					ctx.lineWidth = Math.max( 2, size * 0.09 );
					ctx.globalAlpha = 0.95;
					const step = Math.max( 5, size * 0.36 );
					ctx.beginPath();
					let up = false;
					ctx.moveTo( x - size * 0.1 + wob(), y + wob() );
					for (
						let px = x + step * 0.5;
						px <= x + width + size * 0.15;
						px += step
					) {
						ctx.lineTo(
							px + wob(),
							y + ( up ? 0 : size * 0.16 ) + wob()
						);
						up = ! up;
					}
					ctx.stroke();
				} else if ( 3 === style ) {
					// Cursive practice loops advancing along the line.
					ctx.lineWidth = Math.max( 2, size * 0.08 );
					ctx.globalAlpha = 0.92;
					const step = Math.max( 6, size * 0.5 );
					const ly = y + size * 0.12;
					ctx.beginPath();
					ctx.moveTo( x - size * 0.05 + wob(), ly + wob() );
					for (
						let px = x;
						px <= x + width + size * 0.05;
						px += step
					) {
						ctx.bezierCurveTo(
							px + step * 0.9 + wob(),
							ly + wob(),
							px + step * 0.15 + wob(),
							ly - size * 0.42 + wob(),
							px + step * 0.55 + wob(),
							ly - size * 0.42 + wob()
						);
						ctx.bezierCurveTo(
							px + step * 0.95 + wob(),
							ly - size * 0.42 + wob(),
							px + step * 0.3 + wob(),
							ly + wob(),
							px + step + wob(),
							ly + wob()
						);
					}
					ctx.stroke();
				} else {
					wave( y, size * 0.11, 0.95 );
				}
			}
		}
		ctx.restore();
		ctx.globalAlpha = 1;
	}
}

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
	const width = Math.max( 1, Math.min( 10, fx.neonTube.width || 3 ) );
	const color = fx.neonTube.color || '#ff36c7';
	const size = Math.max( 4, Math.min( 60, fx.neonTube.glow ?? 16 ) );
	const pad = Math.ceil( size * 1.4 );
	const tube = textSilhouette( layer, 'rgba(0,0,0,0)', pad, {
		outlineColor: color,
		outlineW: width,
	} );
	const halo = blurCanvas( tube, size * 0.6 );
	ctx.drawImage( halo, -pad, -pad );
	ctx.drawImage( halo, -pad, -pad );
	ctx.drawImage( tube, -pad, -pad );
	const core = blurCanvas(
		textSilhouette( layer, 'rgba(0,0,0,0)', pad, {
			outlineColor: '#ffffff',
			outlineW: Math.max( 1, width * 0.45 ),
		} ),
		0.8
	);
	ctx.globalAlpha = 0.95;
	ctx.drawImage( core, -pad, -pad );
	ctx.globalAlpha = 1;
}

/**
 * Paper cut (v1.141.0): the text punches a hole into a colored panel, with
 * a soft shadow inside the hole. Replaces the text body entirely.
 */
export function drawPaperCut( ctx, layer, fx ) {
	const w = Math.max( 1, Math.round( layer.w || 1 ) );
	const h = Math.max( 1, Math.round( layer.h || 1 ) );
	const padP = Math.max( 0, Math.min( 60, fx.paperCut.pad ?? 14 ) );
	const radius = Math.max( 0, Math.min( 80, fx.paperCut.radius ?? 12 ) );
	const color = fx.paperCut.color || '#ffffff';
	const shadowA =
		Math.max( 0, Math.min( 90, fx.paperCut.opacity ?? 45 ) ) / 100;

	// Shadow visible only through the hole, hugging its top edge.
	const sil = textSilhouette( layer, '#000000' );
	const sh = createCanvas( w, h );
	const shctx = sh.getContext( '2d' );
	shctx.drawImage( blurCanvas( sil, 3 ), 0, 2.5 );
	shctx.globalCompositeOperation = 'destination-in';
	shctx.drawImage( sil, 0, 0 );
	ctx.globalAlpha = shadowA;
	ctx.drawImage( sh, 0, 0 );
	ctx.globalAlpha = 1;

	const panel = createCanvas( w + padP * 2, h + padP * 2 );
	const pctx = panel.getContext( '2d' );
	pctx.fillStyle = color;
	const rr = Math.min( radius, ( h + padP * 2 ) / 2 );
	pctx.beginPath();
	pctx.moveTo( rr, 0 );
	pctx.arcTo( panel.width, 0, panel.width, panel.height, rr );
	pctx.arcTo( panel.width, panel.height, 0, panel.height, rr );
	pctx.arcTo( 0, panel.height, 0, 0, rr );
	pctx.arcTo( 0, 0, panel.width, 0, rr );
	pctx.closePath();
	pctx.fill();
	pctx.globalCompositeOperation = 'destination-out';
	pctx.drawImage( sil, padP, padP );
	ctx.drawImage( panel, -padP, -padP );
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
	// Blueprint wireframe: hollow glyphs with a technical grid inside.
	if ( fx.wireframe ) {
		const lw = Math.max( 1, Math.min( 5, fx.wireframe.width || 2 ) );
		const grid = Math.max( 5, Math.min( 40, fx.wireframe.grid || 12 ) );
		const color = fx.wireframe.color || '#3b82f6';
		const gw = Math.max( 1, Math.round( layer.w || 1 ) );
		const gh = Math.max( 1, Math.round( layer.h || 1 ) );
		const inner = createCanvas( gw, gh );
		const ictx = inner.getContext( '2d' );
		ictx.strokeStyle = color;
		ictx.lineWidth = 1;
		ictx.globalAlpha = 0.55;
		ictx.beginPath();
		for ( let gx = grid / 2; gx < gw; gx += grid ) {
			ictx.moveTo( gx, 0 );
			ictx.lineTo( gx, gh );
		}
		for ( let gy = grid / 2; gy < gh; gy += grid ) {
			ictx.moveTo( 0, gy );
			ictx.lineTo( gw, gy );
		}
		ictx.stroke();
		ictx.globalAlpha = 1;
		ictx.globalCompositeOperation = 'destination-in';
		drawText( ictx, flatTextCopy( layer, '#000000' ) );
		ctx.drawImage( inner, 0, 0 );
		drawText(
			ctx,
			flatTextCopy( layer, 'rgba(0,0,0,0)', {
				outlineColor: color,
				outlineW: lw,
				outlineDash: null,
			} )
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
		ctx.drawImage(
			textSilhouette( layer, inkFill ),
			Math.cos( rad ) * off,
			Math.sin( rad ) * off
		);
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
	const bevel = fx.bevel || fx.letterpress;
	if (
		! fillImg &&
		! bevel &&
		! fx.shine &&
		! fx.scanlines &&
		! fx.grunge &&
		! fx.glitch &&
		! fx.innerGlow &&
		! fx.stripesFill &&
		! fx.pixelate &&
		! fx.gradient &&
		! fx.chrome &&
		! fx.comicDots &&
		! fx.spray &&
		! fx.twoTone &&
		! fx.foil &&
		! fx.fade &&
		! fx.softBlur &&
		! fx.threeD &&
		! fx.checker &&
		! fx.halftone &&
		! fx.static &&
		! fx.dotMatrix &&
		! fx.fold &&
		! fx.inline &&
		! fx.waves &&
		! fx.motifFill &&
		! fx.camo &&
		! fx.circuit &&
		! fx.plaid &&
		! fx.bubbles &&
		! fx.cracks &&
		! fx.ripple
	) {
		drawText( ctx, layer );
		return;
	}
	const w = Math.max( 1, Math.round( layer.w || 1 ) );
	const h = Math.max( 1, Math.round( layer.h || 1 ) );
	// Glitch slices shift and blur bleeds: pad the buffer so they survive.
	const blurR = fx.softBlur
		? Math.max( 1, Math.min( 30, fx.softBlur.amount || 6 ) )
		: 0;
	const pad = Math.max(
		fx.glitch
			? Math.ceil( Math.min( 60, fx.glitch.strength || 12 ) ) + 2
			: 0,
		blurR ? Math.ceil( blurR * 2 ) + 2 : 0,
		fx.ripple ? Math.ceil( Math.min( 30, fx.ripple.amp || 8 ) ) + 2 : 0
	);
	const body = createCanvas( w + 2 * pad, h + 2 * pad );
	const bctx = body.getContext( '2d' );
	bctx.translate( pad, pad );
	drawText( bctx, layer );
	bctx.translate( -pad, -pad );

	if ( fillImg ) {
		// Cover-fit the image into the glyph alpha.
		const iw = fillImg.naturalWidth || fillImg.width || 1;
		const ih = fillImg.naturalHeight || fillImg.height || 1;
		const sc = Math.max( w / iw, h / ih );
		bctx.globalCompositeOperation = 'source-in';
		bctx.drawImage(
			fillImg,
			pad + ( w - iw * sc ) / 2,
			pad + ( h - ih * sc ) / 2,
			iw * sc,
			ih * sc
		);
		bctx.globalCompositeOperation = 'source-over';
	}

	if ( bevel ) {
		const depth = Math.max( 1, Math.min( 12, bevel.depth || 3 ) );
		const inset = !! fx.letterpress;
		const solid = {
			...layer,
			textFX: fx.jitter ? { jitter: fx.jitter } : null,
			fillType: 'solid',
			gradientStops: null,
			outlineColor: null,
			outlineW: 0,
			shadowOn: false,
			bgColor: null,
		};
		const sil = ( color ) => {
			const c = createCanvas( w, h );
			drawText( c.getContext( '2d' ), {
				...solid,
				color,
				fill: color,
				lineStyles: Array.isArray( layer.lineStyles )
					? layer.lineStyles.map( ( ls ) =>
							ls ? { ...ls, color: undefined } : ls
					  )
					: layer.lineStyles,
				spans: layer.spans
					? stripSpanColors( layer.spans )
					: layer.spans,
			} );
			return c;
		};
		// Inner crescent: glyph silhouette minus an offset copy of itself.
		const crescent = ( color, dx, dy ) => {
			const c = sil( color );
			const cctx = c.getContext( '2d' );
			cctx.globalCompositeOperation = 'destination-out';
			cctx.drawImage( sil( '#000' ), dx, dy );
			return blurCanvas( c, depth * 0.35 );
		};
		const light = crescent(
			'#ffffff',
			inset ? -depth : depth,
			inset ? -depth : depth
		);
		const dark = crescent(
			'#000000',
			inset ? depth : -depth,
			inset ? depth : -depth
		);
		bctx.globalCompositeOperation = 'source-atop';
		bctx.globalAlpha = inset ? 0.5 : 0.55;
		bctx.drawImage( light, pad, pad );
		bctx.globalAlpha = inset ? 0.55 : 0.45;
		bctx.drawImage( dark, pad, pad );
		bctx.globalAlpha = 1;
		bctx.globalCompositeOperation = 'source-over';
		if ( inset ) {
			// The pressed look needs a light rim just below the glyphs.
			const rim = sil( '#ffffff' );
			const rctx = rim.getContext( '2d' );
			rctx.globalCompositeOperation = 'destination-out';
			rctx.drawImage( sil( '#000' ), 0, -1.5 );
			ctx.globalAlpha = 0.4;
			ctx.drawImage( rim, 0, 1.5 );
			ctx.globalAlpha = 1;
		}
	}

	// Shine: a diagonal gloss band clipped into the glyphs.
	if ( fx.shine ) {
		const width = Math.max( 4, Math.min( 90, fx.shine.width || 26 ) );
		const alpha =
			Math.max( 5, Math.min( 100, fx.shine.opacity ?? 65 ) ) / 100;
		const pos = Math.max( 0, Math.min( 100, fx.shine.pos ?? 38 ) ) / 100;
		const rad = ( ( fx.shine.angle ?? 115 ) * Math.PI ) / 180;
		const dxs = Math.cos( rad );
		const dys = Math.sin( rad );
		const len = Math.abs( dxs ) * w + Math.abs( dys ) * h;
		const cx0 = pad + w / 2 - ( dxs * len ) / 2;
		const cy0 = pad + h / 2 - ( dys * len ) / 2;
		const grad = bctx.createLinearGradient(
			cx0,
			cy0,
			cx0 + dxs * len,
			cy0 + dys * len
		);
		const bw = width / len / 2;
		grad.addColorStop( Math.max( 0, pos - bw ), 'rgba(255,255,255,0)' );
		grad.addColorStop( pos, `rgba(255,255,255,${ alpha })` );
		grad.addColorStop( Math.min( 1, pos + bw ), 'rgba(255,255,255,0)' );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Retro stripes: repeating color bands clipped into the glyphs.
	if ( fx.stripesFill ) {
		const sw = Math.max( 2, Math.min( 60, fx.stripesFill.width || 12 ) );
		const rad = ( ( fx.stripesFill.angle ?? 0 ) * Math.PI ) / 180;
		const colors = [
			fx.stripesFill.color || '#e5484d',
			fx.stripesFill.color2 || '#ff8a00',
			fx.stripesFill.color3 || '#f5d90a',
		].filter( Boolean );
		const ext = body.width + body.height;
		bctx.save();
		bctx.globalCompositeOperation = 'source-atop';
		bctx.translate( body.width / 2, body.height / 2 );
		bctx.rotate( rad );
		let idx = 0;
		for ( let y = -ext; y < ext; y += sw ) {
			bctx.fillStyle = colors[ idx++ % colors.length ];
			bctx.fillRect( -ext, y, ext * 2, sw );
		}
		bctx.restore();
		bctx.globalCompositeOperation = 'source-over';
	}

	// Gradient fill: a linear colour ramp clipped into the glyphs.
	if ( fx.gradient ) {
		const rad = ( ( fx.gradient.angle ?? 90 ) * Math.PI ) / 180;
		const dx = Math.cos( rad );
		const dy = Math.sin( rad );
		const len = Math.abs( dx ) * w + Math.abs( dy ) * h || 1;
		const cx0 = pad + w / 2 - ( dx * len ) / 2;
		const cy0 = pad + h / 2 - ( dy * len ) / 2;
		const grad = bctx.createLinearGradient(
			cx0,
			cy0,
			cx0 + dx * len,
			cy0 + dy * len
		);
		grad.addColorStop( 0, fx.gradient.color || '#ff5db1' );
		grad.addColorStop( 1, fx.gradient.color2 || '#7b2ff7' );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Chrome: a vertical metallic ramp (dark → tint → bright band → dark).
	if ( fx.chrome ) {
		const tint = fx.chrome.color || '#cfd6e4';
		const shine =
			Math.max( 0, Math.min( 100, fx.chrome.shine ?? 50 ) ) / 100;
		const contrast =
			Math.max( 10, Math.min( 100, fx.chrome.contrast ?? 60 ) ) / 100;
		const dark = mixColor( tint, '#0a0e16', 0.35 + contrast * 0.45 );
		const grad = bctx.createLinearGradient( 0, pad, 0, pad + h );
		grad.addColorStop( 0, dark );
		grad.addColorStop( Math.max( 0.02, shine - 0.14 ), tint );
		grad.addColorStop( shine, '#ffffff' );
		grad.addColorStop( Math.min( 0.98, shine + 0.14 ), tint );
		grad.addColorStop( 1, dark );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Two tone: a hard two-color split clipped into the glyphs.
	if ( fx.twoTone ) {
		const split =
			Math.max( 10, Math.min( 90, fx.twoTone.split ?? 50 ) ) / 100;
		const rad = ( ( fx.twoTone.angle ?? 0 ) * Math.PI ) / 180;
		// Angle 0 = horizontal split line (the ramp runs top to bottom).
		const dx = Math.sin( rad );
		const dy = Math.cos( rad );
		const len = Math.abs( dx ) * w + Math.abs( dy ) * h || 1;
		const cx0 = pad + w / 2 - ( dx * len ) / 2;
		const cy0 = pad + h / 2 - ( dy * len ) / 2;
		const grad = bctx.createLinearGradient(
			cx0,
			cy0,
			cx0 + dx * len,
			cy0 + dy * len
		);
		const c1 = fx.twoTone.color || '#ffd166';
		const c2 = fx.twoTone.color2 || '#ef476f';
		grad.addColorStop( 0, c1 );
		grad.addColorStop( split, c1 );
		grad.addColorStop( split, c2 );
		grad.addColorStop( 1, c2 );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// 3D front face: a glossy vertical gradient with a light streak near the
	// top, clipped into the glyphs (the extrusion is drawn behind, and the
	// bevel highlight over, in stampTextWithShadow).
	if ( fx.threeD ) {
		const top = fx.threeD.color || '#e4d9ff';
		const bottom = fx.threeD.color2 || '#8b6bff';
		const grad = bctx.createLinearGradient( 0, pad, 0, pad + h );
		grad.addColorStop( 0, mixColor( top, '#ffffff', 0.25 ) );
		grad.addColorStop( 0.5, top );
		grad.addColorStop( 1, bottom );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		// A soft gloss streak across the upper third.
		const gloss = bctx.createLinearGradient(
			0,
			pad + h * 0.08,
			0,
			pad + h * 0.5
		);
		gloss.addColorStop( 0, 'rgba(255,255,255,0)' );
		gloss.addColorStop( 0.5, 'rgba(255,255,255,0.5)' );
		gloss.addColorStop( 1, 'rgba(255,255,255,0)' );
		bctx.fillStyle = gloss;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Gold foil: a warm metallic ramp plus tiny sparkle glints, in-glyph.
	if ( fx.foil ) {
		const tint = fx.foil.color || '#d4af37';
		const dark = mixColor( tint, '#1a1207', 0.55 );
		const light = mixColor( tint, '#fff8e1', 0.7 );
		const grad = bctx.createLinearGradient(
			pad,
			pad,
			pad + w * 0.35,
			pad + h
		);
		grad.addColorStop( 0, dark );
		grad.addColorStop( 0.28, tint );
		grad.addColorStop( 0.5, light );
		grad.addColorStop( 0.72, tint );
		grad.addColorStop( 1, dark );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		const nSpark = Math.max(
			0,
			Math.min( 20, Math.round( fx.foil.sparkles ?? 8 ) )
		);
		const rnd = seededRnd( ( fx.foil.seed || 1 ) * 7331 );
		bctx.fillStyle = '#ffffff';
		for ( let i = 0; i < nSpark; i++ ) {
			const sx = pad + rnd() * w;
			const sy = pad + rnd() * h;
			const s = 2 + rnd() * Math.min( 14, Math.max( 4, h * 0.06 ) );
			bctx.save();
			bctx.translate( sx, sy );
			bctx.rotate( rnd() * Math.PI );
			bctx.beginPath();
			for ( let p = 0; p < 8; p++ ) {
				const rr = p % 2 ? s * 0.18 : s;
				const a = ( p / 8 ) * 2 * Math.PI;
				bctx[ p ? 'lineTo' : 'moveTo' ](
					Math.cos( a ) * rr,
					Math.sin( a ) * rr
				);
			}
			bctx.closePath();
			bctx.fill();
			bctx.restore();
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// Comic dots: a Ben-Day halftone grid inside the glyphs over a flat fill.
	if ( fx.comicDots ) {
		const ds = Math.max( 3, Math.min( 24, fx.comicDots.size || 8 ) );
		const dotColor = fx.comicDots.color || '#1a1d21';
		const bg = fx.comicDots.bg || '#ffd400';
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = bg;
		bctx.fillRect( 0, 0, body.width, body.height );
		const tile = createCanvas( ds, ds );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = dotColor;
		tctx.beginPath();
		tctx.arc( ds / 2, ds / 2, ds * 0.3, 0, 2 * Math.PI );
		tctx.fill();
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Waves: alternating wavy horizontal bands clipped into the glyphs.
	if ( fx.waves ) {
		const wl = Math.max( 20, Math.min( 160, fx.waves.size || 70 ) );
		const amp = Math.max( 2, Math.min( 24, fx.waves.amp || 8 ) );
		const c1 = fx.waves.color || '#38bdf8';
		const c2 = fx.waves.color2 || '#1d4ed8';
		const bh = Math.max( 6, Math.round( wl * 0.32 ) );
		bctx.globalCompositeOperation = 'source-atop';
		let band = 0;
		for ( let by = -bh - amp; by < body.height + amp; by += bh, band++ ) {
			bctx.fillStyle = band % 2 ? c2 : c1;
			bctx.beginPath();
			bctx.moveTo( 0, by + Math.sin( band * 1.7 ) * amp );
			for ( let gx = 0; gx <= body.width; gx += 6 ) {
				bctx.lineTo(
					gx,
					by +
						Math.sin( ( gx / wl ) * 2 * Math.PI + band * 1.7 ) * amp
				);
			}
			bctx.lineTo( body.width, body.height + amp + bh );
			bctx.lineTo( 0, body.height + amp + bh );
			bctx.closePath();
			bctx.fill();
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// Motif fill: a repeating little shape (heart/star/plus/ring) grid.
	if ( fx.motifFill ) {
		const ms = Math.max( 8, Math.min( 48, fx.motifFill.size || 18 ) );
		const style = Math.max(
			0,
			Math.min( 3, Math.round( fx.motifFill.style || 0 ) )
		);
		const mc = fx.motifFill.color || '#ffffff';
		const bg = fx.motifFill.bg || '#ff6ea9';
		const tile = createCanvas( ms * 2, ms * 2 );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = bg;
		tctx.fillRect( 0, 0, ms * 2, ms * 2 );
		const drawMotif = ( mx, my ) => {
			const r = ms * 0.3;
			tctx.save();
			tctx.translate( mx, my );
			tctx.fillStyle = mc;
			tctx.strokeStyle = mc;
			tctx.beginPath();
			if ( 0 === style ) {
				// Heart.
				tctx.moveTo( 0, r * 0.9 );
				tctx.bezierCurveTo(
					-r * 1.4,
					-r * 0.1,
					-r * 0.7,
					-r,
					0,
					-r * 0.35
				);
				tctx.bezierCurveTo(
					r * 0.7,
					-r,
					r * 1.4,
					-r * 0.1,
					0,
					r * 0.9
				);
				tctx.fill();
			} else if ( 1 === style ) {
				// Star (5 points).
				for ( let i = 0; i < 10; i++ ) {
					const rr = i % 2 ? r * 0.45 : r;
					const a = ( i / 10 ) * 2 * Math.PI - Math.PI / 2;
					tctx[ i ? 'lineTo' : 'moveTo' ](
						Math.cos( a ) * rr,
						Math.sin( a ) * rr
					);
				}
				tctx.closePath();
				tctx.fill();
			} else if ( 2 === style ) {
				// Plus.
				const t = r * 0.42;
				tctx.rect( -t / 2, -r, t, 2 * r );
				tctx.rect( -r, -t / 2, 2 * r, t );
				tctx.fill();
			} else {
				// Ring.
				tctx.lineWidth = Math.max( 1.5, r * 0.35 );
				tctx.arc( 0, 0, r * 0.75, 0, 2 * Math.PI );
				tctx.stroke();
			}
			tctx.restore();
		};
		drawMotif( ms / 2, ms / 2 );
		drawMotif( ms * 1.5, ms * 1.5 );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Camo: seeded organic blobs in earthy tones over a base fill.
	if ( fx.camo ) {
		const cs = Math.max( 10, Math.min( 60, fx.camo.size || 26 ) );
		const rnd = seededRnd( ( fx.camo.seed || 1 ) * 613 );
		const cols = [
			fx.camo.bg || '#5a6f43',
			fx.camo.color || '#3e4a2e',
			fx.camo.color2 || '#8a9a6b',
			fx.camo.color3 || '#2c3520',
		];
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = cols[ 0 ];
		bctx.fillRect( 0, 0, body.width, body.height );
		const blobs = Math.round(
			( body.width * body.height ) / ( cs * cs * 1.6 )
		);
		for ( let i = 0; i < blobs; i++ ) {
			const bx2 = rnd() * body.width;
			const by2 = rnd() * body.height;
			const base = cs * ( 0.55 + rnd() * 0.7 );
			bctx.fillStyle = cols[ 1 + Math.floor( rnd() * 3 ) ];
			bctx.beginPath();
			const pts = 7;
			for ( let k = 0; k <= pts; k++ ) {
				const a = ( k / pts ) * 2 * Math.PI;
				const rr = base * ( 0.55 + rnd() * 0.5 );
				const px2 = bx2 + Math.cos( a ) * rr * 1.25;
				const py2 = by2 + Math.sin( a ) * rr * 0.8;
				if ( 0 === k ) {
					bctx.moveTo( px2, py2 );
				} else {
					bctx.quadraticCurveTo(
						bx2 + Math.cos( a - Math.PI / pts ) * rr * 1.5,
						by2 + Math.sin( a - Math.PI / pts ) * rr,
						px2,
						py2
					);
				}
			}
			bctx.closePath();
			bctx.fill();
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// Circuit board: repeating traces with solder pads.
	if ( fx.circuit ) {
		const cs = Math.max( 14, Math.min( 60, fx.circuit.size || 26 ) );
		const trace = fx.circuit.color || '#22c55e';
		const bg = fx.circuit.bg || '#0c1f13';
		const tile = createCanvas( cs, cs );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = bg;
		tctx.fillRect( 0, 0, cs, cs );
		tctx.strokeStyle = trace;
		tctx.fillStyle = trace;
		tctx.lineWidth = Math.max( 1, cs / 16 );
		tctx.beginPath();
		tctx.moveTo( 0, cs * 0.25 );
		tctx.lineTo( cs, cs * 0.25 );
		tctx.moveTo( cs * 0.25, cs * 0.25 );
		tctx.lineTo( cs * 0.25, cs * 0.7 );
		tctx.moveTo( cs * 0.75, cs * 0.75 );
		tctx.lineTo( cs * 0.75, cs );
		tctx.moveTo( cs * 0.5, cs * 0.75 );
		tctx.lineTo( cs, cs * 0.75 );
		tctx.stroke();
		const padR = Math.max( 1.5, cs / 10 );
		tctx.beginPath();
		tctx.arc( cs * 0.25, cs * 0.7, padR, 0, 2 * Math.PI );
		tctx.fill();
		tctx.beginPath();
		tctx.arc( cs * 0.5, cs * 0.75, padR, 0, 2 * Math.PI );
		tctx.fill();
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Plaid: two crossing translucent band sets plus thin accent lines.
	if ( fx.plaid ) {
		const ps = Math.max( 14, Math.min( 80, fx.plaid.size || 34 ) );
		const bg = fx.plaid.bg || '#9f1239';
		const band = fx.plaid.color || '#1e3a5f';
		const accent = fx.plaid.color2 || '#f8e8c8';
		const tile = createCanvas( ps, ps );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = bg;
		tctx.fillRect( 0, 0, ps, ps );
		tctx.globalAlpha = 0.65;
		tctx.fillStyle = band;
		tctx.fillRect( 0, 0, ps * 0.38, ps );
		tctx.fillRect( 0, 0, ps, ps * 0.38 );
		tctx.globalAlpha = 1;
		tctx.fillStyle = accent;
		tctx.fillRect( ps * 0.72, 0, Math.max( 1, ps / 18 ), ps );
		tctx.fillRect( 0, ps * 0.72, ps, Math.max( 1, ps / 18 ) );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Checker: a two-color checkerboard clipped into the glyphs.
	if ( fx.checker ) {
		const cs = Math.max( 4, Math.min( 60, fx.checker.size || 14 ) );
		const c1 = fx.checker.color || '#1a1d21';
		const c2 = fx.checker.color2 || '#ffffff';
		const tile = createCanvas( cs * 2, cs * 2 );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = c1;
		tctx.fillRect( 0, 0, cs * 2, cs * 2 );
		tctx.fillStyle = c2;
		tctx.fillRect( 0, 0, cs, cs );
		tctx.fillRect( cs, cs, cs, cs );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Halftone shade: a dot screen growing toward one side of the glyphs
	// (comic shading - unlike comicDots' uniform grid).
	if ( fx.halftone ) {
		const ds = Math.max( 4, Math.min( 24, fx.halftone.size || 9 ) );
		const strength =
			Math.max( 10, Math.min( 100, fx.halftone.strength ?? 80 ) ) / 100;
		const rad = ( ( fx.halftone.angle ?? 90 ) * Math.PI ) / 180;
		const hdx = Math.cos( rad );
		const hdy = Math.sin( rad );
		const len =
			Math.abs( hdx ) * body.width + Math.abs( hdy ) * body.height || 1;
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = fx.halftone.color || '#1a1d21';
		const maxR = ds * 0.5 * strength;
		let row = 0;
		for ( let gy = ds / 2; gy < body.height; gy += ds, row++ ) {
			const stag = row % 2 ? ds / 2 : 0;
			for ( let gx = ds / 2 + stag; gx < body.width; gx += ds ) {
				const t =
					( gx * hdx +
						gy * hdy +
						( hdx < 0 ? body.width * -hdx : 0 ) +
						( hdy < 0 ? body.height * -hdy : 0 ) ) /
					len;
				const r = maxR * Math.max( 0, Math.min( 1, t ) );
				if ( r < 0.45 ) {
					continue;
				}
				bctx.beginPath();
				bctx.arc( gx, gy, r, 0, 2 * Math.PI );
				bctx.fill();
			}
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// TV static: seeded monochrome noise clipped into the glyphs.
	if ( fx.static ) {
		const scale = Math.max( 1, Math.min( 6, fx.static.scale || 2 ) );
		const amount =
			Math.max( 10, Math.min( 100, fx.static.amount ?? 100 ) ) / 100;
		const rnd = seededRnd( ( fx.static.seed || 1 ) * 7919 );
		const ts = 96;
		const tile = createCanvas( ts, ts );
		const tctx = tile.getContext( '2d' );
		const img = tctx.createImageData( ts, ts );
		for ( let i = 0; i < img.data.length; i += 4 ) {
			const v = Math.round( rnd() * 255 );
			img.data[ i ] = v;
			img.data[ i + 1 ] = v;
			img.data[ i + 2 ] = v;
			img.data[ i + 3 ] = 255;
		}
		tctx.putImageData( img, 0, 0 );
		const scaled = createCanvas( ts * scale, ts * scale );
		const sctx2 = scaled.getContext( '2d' );
		sctx2.imageSmoothingEnabled = false;
		sctx2.drawImage( tile, 0, 0, ts * scale, ts * scale );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.globalAlpha = amount;
		bctx.fillStyle = bctx.createPattern( scaled, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalAlpha = 1;
		bctx.globalCompositeOperation = 'source-over';
	}

	// LED board: glowing round pixels on a dark chip, clipped into glyphs.
	if ( fx.dotMatrix ) {
		const cell = Math.max( 6, Math.min( 26, fx.dotMatrix.size || 12 ) );
		const led = fx.dotMatrix.color || '#ff3b30';
		const chip = fx.dotMatrix.bg || '#181210';
		const glowR = Math.max( 0, Math.min( 30, fx.dotMatrix.glow ?? 10 ) );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = chip;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
		const tile = createCanvas( cell, cell );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = led;
		tctx.beginPath();
		tctx.arc( cell / 2, cell / 2, cell * 0.33, 0, 2 * Math.PI );
		tctx.fill();
		const dots = createCanvas( body.width, body.height );
		const dctx = dots.getContext( '2d' );
		dctx.fillStyle = dctx.createPattern( tile, 'repeat' );
		dctx.fillRect( 0, 0, body.width, body.height );
		dctx.globalCompositeOperation = 'destination-in';
		dctx.drawImage( body, 0, 0 );
		if ( glowR ) {
			bctx.globalCompositeOperation = 'lighter';
			bctx.drawImage( blurCanvas( dots, glowR * 0.6 ), 0, 0 );
		}
		bctx.globalCompositeOperation = 'source-atop';
		bctx.drawImage( dots, 0, 0 );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Origami fold: alternating light/dark facets across the glyphs.
	if ( fx.fold ) {
		const bands = Math.max( 3, Math.min( 16, fx.fold.bands || 7 ) );
		const strength =
			Math.max( 10, Math.min( 100, fx.fold.strength ?? 55 ) ) / 100;
		const rad = ( ( fx.fold.angle ?? 65 ) * Math.PI ) / 180;
		const rnd = seededRnd( ( fx.fold.seed || 3 ) * 131 );
		const diag = Math.hypot( body.width, body.height );
		const bandW = diag / bands;
		bctx.save();
		bctx.globalCompositeOperation = 'source-atop';
		bctx.translate( body.width / 2, body.height / 2 );
		bctx.rotate( rad );
		for ( let i = 0; i < bands; i++ ) {
			const x0 = -diag / 2 + i * bandW;
			const light = i % 2 === 0;
			const a =
				( light ? 0.2 : 0.24 ) * strength * ( 0.75 + rnd() * 0.5 );
			bctx.fillStyle = light
				? `rgba(255,255,255,${ a.toFixed( 3 ) })`
				: `rgba(0,0,0,${ a.toFixed( 3 ) })`;
			bctx.fillRect( x0, -diag / 2, bandW + 0.5, diag );
		}
		bctx.restore();
		bctx.globalCompositeOperation = 'source-over';
	}

	// Spray: a solid fill eroded by fine seeded speckles for a grainy look.
	if ( fx.spray ) {
		const density =
			Math.max( 10, Math.min( 100, fx.spray.density ?? 55 ) ) / 100;
		const grain = Math.max( 1, Math.min( 8, fx.spray.grain || 3 ) );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = fx.spray.color || '#1a1d21';
		bctx.fillRect( 0, 0, body.width, body.height );
		const rnd = seededRnd( 91763 );
		const specks = Math.round(
			( ( body.width * body.height ) / ( grain * grain * 5 ) ) *
				( 1 - density )
		);
		bctx.globalCompositeOperation = 'destination-out';
		bctx.fillStyle = '#000';
		for ( let i = 0; i < specks; i++ ) {
			bctx.beginPath();
			bctx.arc(
				rnd() * body.width,
				rnd() * body.height,
				grain * ( 0.4 + rnd() * 0.8 ),
				0,
				2 * Math.PI
			);
			bctx.fill();
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// Inner glow: light creeping inward from the glyph edges.
	if ( fx.innerGlow ) {
		const gSize = Math.max( 1, Math.min( 40, fx.innerGlow.size || 10 ) );
		const gColor = fx.innerGlow.color || '#ffe08a';
		const inv = createCanvas( body.width, body.height );
		const ictx = inv.getContext( '2d' );
		ictx.fillStyle = gColor;
		ictx.fillRect( 0, 0, inv.width, inv.height );
		ictx.globalCompositeOperation = 'destination-out';
		ictx.drawImage( textSilhouette( layer, '#000000' ), pad, pad );
		const blurred = blurCanvas( inv, gSize * 0.6 );
		bctx.globalCompositeOperation = 'source-atop';
		bctx.drawImage( blurred, 0, 0 );
		bctx.drawImage( blurred, 0, 0 );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Inline: a thin contour inset inside the glyph edges (varsity look).
	if ( fx.inline ) {
		const inset = Math.max( 1, Math.min( 24, fx.inline.inset || 5 ) );
		const lw = Math.max( 1, Math.min( 10, fx.inline.width || 2 ) );
		const color = fx.inline.color || '#ffffff';
		const ring = createCanvas( body.width, body.height );
		const rctx = ring.getContext( '2d' );
		rctx.save();
		rctx.translate( pad, pad );
		drawText(
			rctx,
			flatTextCopy( layer, 'rgba(0,0,0,0)', {
				outlineColor: color,
				outlineW: 2 * inset + lw,
				outlineDash: null,
			} )
		);
		rctx.restore();
		rctx.globalCompositeOperation = 'destination-out';
		if ( 2 * inset - lw > 0.2 ) {
			rctx.save();
			rctx.translate( pad, pad );
			drawText(
				rctx,
				flatTextCopy( layer, 'rgba(0,0,0,0)', {
					outlineColor: color,
					outlineW: Math.max( 0.2, 2 * inset - lw ),
					outlineDash: null,
				} )
			);
			rctx.restore();
		}
		// Keep only the interior half of the annulus.
		rctx.globalCompositeOperation = 'destination-in';
		rctx.drawImage( body, 0, 0 );
		bctx.drawImage( ring, 0, 0 );
	}

	// Bubbles: seeded fizzy circles rising inside the glyphs.
	if ( fx.bubbles ) {
		const count = Math.max(
			4,
			Math.min( 80, Math.round( fx.bubbles.count || 26 ) )
		);
		const bs = Math.max( 2, Math.min( 20, fx.bubbles.size || 7 ) );
		const bc = fx.bubbles.color || '#ffffff';
		const rnd = seededRnd( ( fx.bubbles.seed || 1 ) * 389 );
		const layerC = createCanvas( body.width, body.height );
		const lctx = layerC.getContext( '2d' );
		lctx.strokeStyle = bc;
		lctx.fillStyle = bc;
		for ( let i = 0; i < count; i++ ) {
			const bx2 = rnd() * body.width;
			const by2 = rnd() * body.height;
			const r = bs * ( 0.35 + rnd() * 0.75 );
			lctx.globalAlpha = 0.28 + rnd() * 0.3;
			lctx.beginPath();
			lctx.arc( bx2, by2, r, 0, 2 * Math.PI );
			lctx.fill();
			lctx.globalAlpha = 0.75;
			lctx.beginPath();
			lctx.arc( bx2 - r * 0.3, by2 - r * 0.3, r * 0.25, 0, 2 * Math.PI );
			lctx.fill();
		}
		lctx.globalAlpha = 1;
		lctx.globalCompositeOperation = 'destination-in';
		lctx.drawImage( body, 0, 0 );
		bctx.drawImage( layerC, 0, 0 );
	}

	// Cracks: seeded branching fracture lines over the glyphs.
	if ( fx.cracks ) {
		const count = Math.max(
			1,
			Math.min( 14, Math.round( fx.cracks.count || 6 ) )
		);
		const cc = fx.cracks.color || '#1a1d21';
		const rnd = seededRnd( ( fx.cracks.seed || 1 ) * 547 );
		const layerC = createCanvas( body.width, body.height );
		const lctx = layerC.getContext( '2d' );
		lctx.strokeStyle = cc;
		lctx.lineCap = 'round';
		let data = null;
		try {
			data = bctx.getImageData( 0, 0, body.width, body.height ).data;
		} catch ( e ) {
			data = null;
		}
		const inGlyph = ( gx, gy ) =>
			! data ||
			( gx >= 0 &&
				gy >= 0 &&
				gx < body.width &&
				gy < body.height &&
				data[
					( Math.floor( gy ) * body.width + Math.floor( gx ) ) * 4 + 3
				] > 100 );
		const walk = ( gx, gy, a, segs, lw ) => {
			let px2 = gx;
			let py2 = gy;
			let ang = a;
			for ( let sSeg = 0; sSeg < segs; sSeg++ ) {
				const len = 5 + rnd() * 11;
				const nx = px2 + Math.cos( ang ) * len;
				const ny = py2 + Math.sin( ang ) * len;
				lctx.lineWidth = Math.max( 0.5, lw * ( 1 - sSeg / segs ) );
				lctx.beginPath();
				lctx.moveTo( px2, py2 );
				lctx.lineTo( nx, ny );
				lctx.stroke();
				if ( rnd() < 0.3 && segs - sSeg > 2 ) {
					walk(
						nx,
						ny,
						ang + ( rnd() < 0.5 ? 1 : -1 ) * ( 0.6 + rnd() ),
						Math.floor( ( segs - sSeg ) / 2 ),
						lw * 0.6
					);
				}
				ang += ( rnd() - 0.5 ) * 0.9;
				px2 = nx;
				py2 = ny;
			}
		};
		for ( let i = 0, tries = 0; i < count && tries < count * 40; tries++ ) {
			const gx = rnd() * body.width;
			const gy = rnd() * body.height;
			if ( ! inGlyph( gx, gy ) ) {
				continue;
			}
			walk(
				gx,
				gy,
				rnd() * 2 * Math.PI,
				5 + Math.floor( rnd() * 4 ),
				2.2
			);
			i++;
		}
		lctx.globalAlpha = 1;
		lctx.globalCompositeOperation = 'destination-in';
		lctx.drawImage( body, 0, 0 );
		bctx.globalAlpha = 0.8;
		bctx.drawImage( layerC, 0, 0 );
		bctx.globalAlpha = 1;
	}

	// Scanlines: dark horizontal CRT lines inside the glyphs.
	if ( fx.scanlines ) {
		const gap = Math.max( 2, Math.min( 14, fx.scanlines.gap || 4 ) );
		const alpha =
			Math.max( 5, Math.min( 90, fx.scanlines.opacity ?? 40 ) ) / 100;
		bctx.globalCompositeOperation = 'source-atop';
		bctx.fillStyle = `rgba(0,0,0,${ alpha })`;
		const lh = Math.max( 1, Math.round( gap / 3 ) );
		for ( let y = pad; y < pad + h; y += gap ) {
			bctx.fillRect( 0, y, body.width, lh );
		}
		bctx.globalCompositeOperation = 'source-over';
	}

	// Grunge: seeded speckle erosion for a stamped / distressed look.
	if ( fx.grunge ) {
		const amount =
			Math.max( 5, Math.min( 100, fx.grunge.amount ?? 50 ) ) / 100;
		const scale = Math.max( 20, Math.min( 200, fx.grunge.scale || 70 ) );
		const rnd = seededRnd( ( fx.grunge.seed || 1 ) * 7919 );
		const tile = createCanvas( scale, scale );
		const tctx = tile.getContext( '2d' );
		tctx.fillStyle = '#000';
		const blobs = Math.round( 26 * amount );
		for ( let i = 0; i < blobs; i++ ) {
			const bx = rnd() * scale;
			const by = rnd() * scale;
			if ( rnd() < 0.35 ) {
				// Scratches.
				tctx.save();
				tctx.translate( bx, by );
				tctx.rotate( rnd() * Math.PI );
				tctx.fillRect(
					0,
					0,
					2 + rnd() * scale * 0.4,
					0.6 + rnd() * 1.6
				);
				tctx.restore();
			} else {
				tctx.beginPath();
				tctx.arc( bx, by, 0.6 + rnd() * 2.6 * amount, 0, 2 * Math.PI );
				tctx.fill();
			}
		}
		bctx.globalCompositeOperation = 'destination-out';
		bctx.fillStyle = bctx.createPattern( tile, 'repeat' );
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Ripple: sinusoidal horizontal displacement of the finished body.
	if ( fx.ripple ) {
		const amp = Math.max( 2, Math.min( 30, fx.ripple.amp || 8 ) );
		const wl = Math.max( 10, Math.min( 140, fx.ripple.size || 46 ) );
		for ( let ry = 0; ry < body.height; ry++ ) {
			const off = Math.sin( ( ry / wl ) * 2 * Math.PI ) * amp;
			ctx.drawImage(
				body,
				0,
				ry,
				body.width,
				1,
				-pad + off,
				ry - pad,
				body.width,
				1
			);
		}
		return;
	}

	// Fade: a directional opacity ramp eating into the finished body.
	if ( fx.fade ) {
		const amount =
			Math.max( 10, Math.min( 100, fx.fade.amount ?? 90 ) ) / 100;
		const rad = ( ( fx.fade.angle ?? 90 ) * Math.PI ) / 180;
		const dx = Math.cos( rad );
		const dy = Math.sin( rad );
		const len = Math.abs( dx ) * w + Math.abs( dy ) * h || 1;
		const cx0 = pad + w / 2 - ( dx * len ) / 2;
		const cy0 = pad + h / 2 - ( dy * len ) / 2;
		const grad = bctx.createLinearGradient(
			cx0,
			cy0,
			cx0 + dx * len,
			cy0 + dy * len
		);
		grad.addColorStop( 0, 'rgba(0,0,0,0)' );
		grad.addColorStop( 1, `rgba(0,0,0,${ amount })` );
		bctx.globalCompositeOperation = 'destination-out';
		bctx.fillStyle = grad;
		bctx.fillRect( 0, 0, body.width, body.height );
		bctx.globalCompositeOperation = 'source-over';
	}

	// Pixelate: rasterize the finished body onto a coarse grid (8-bit).
	if ( fx.pixelate ) {
		const px = Math.max( 2, Math.min( 24, fx.pixelate.size || 6 ) );
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
		bctx.setTransform( 1, 0, 0, 1, 0, 0 );
		bctx.drawImage( small, 0, 0, body.width, body.height );
		bctx.restore();
	}

	// Glitch: horizontal slices of the finished body, shifted sideways.
	if ( fx.glitch ) {
		const strength = Math.max(
			2,
			Math.min( 60, fx.glitch.strength || 12 )
		);
		const count = Math.max( 2, Math.min( 16, fx.glitch.slices || 7 ) );
		const rnd = seededRnd( ( fx.glitch.seed || 1 ) * 104729 );
		const bandH = body.height / count;
		for ( let i = 0; i < count; i++ ) {
			const sy = Math.round( i * bandH );
			const sh = Math.ceil( bandH );
			// Every slice gets its own offset; some stay put for contrast.
			const dx =
				rnd() < 0.3 ? 0 : Math.round( ( rnd() - 0.5 ) * 2 * strength );
			ctx.drawImage(
				body,
				0,
				sy,
				body.width,
				sh,
				-pad + dx,
				-pad + sy,
				body.width,
				sh
			);
		}
		return;
	}

	// Soft blur: smear the finished body (the buffer pad holds the bleed).
	if ( blurR ) {
		ctx.drawImage( blurCanvas( body, blurR ), -pad, -pad );
		return;
	}

	ctx.drawImage( body, -pad, -pad );
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

	// Knockout: a rounded panel with the glyphs punched out as holes.
	if ( fx.knockout ) {
		const padP = Math.max( 0, Math.min( 60, fx.knockout.pad ?? 16 ) );
		const radius = Math.max( 0, Math.min( 90, fx.knockout.radius ?? 18 ) );
		const color = fx.knockout.color || '#ffffff';
		const shadowA =
			Math.max( 0, Math.min( 90, fx.knockout.shadow ?? 25 ) ) / 100;
		const M = padP + 12;
		const panel = createCanvas( w + 2 * M, h + 2 * M );
		const pctx = panel.getContext( '2d' );
		const px = M - padP;
		const py = M - padP;
		const pw = w + 2 * padP;
		const ph = h + 2 * padP;
		const r = Math.min( radius, pw / 2, ph / 2 );
		pctx.fillStyle = color;
		pctx.beginPath();
		pctx.moveTo( px + r, py );
		pctx.arcTo( px + pw, py, px + pw, py + ph, r );
		pctx.arcTo( px + pw, py + ph, px, py + ph, r );
		pctx.arcTo( px, py + ph, px, py, r );
		pctx.arcTo( px, py, px + pw, py, r );
		pctx.closePath();
		pctx.fill();
		pctx.globalCompositeOperation = 'destination-out';
		pctx.translate( M, M );
		drawText( pctx, solidCopy( '#000000' ) );
		pctx.translate( -M, -M );
		pctx.globalCompositeOperation = 'source-over';
		if ( shadowA > 0 ) {
			const sh = createCanvas( panel.width, panel.height );
			const shx = sh.getContext( '2d' );
			shx.drawImage( panel, 0, 0 );
			shx.globalCompositeOperation = 'source-in';
			shx.fillStyle = '#000000';
			shx.fillRect( 0, 0, sh.width, sh.height );
			ctx.globalAlpha = shadowA;
			ctx.drawImage( blurCanvas( sh, 8 ), -M, -M + 7 );
			ctx.globalAlpha = 1;
		}
		ctx.drawImage( panel, -M, -M );
	}

	// Star seal: a starburst badge panel sitting behind the text.
	if ( fx.seal ) {
		const points = Math.max(
			8,
			Math.min( 40, Math.round( fx.seal.points || 16 ) )
		);
		const padP = Math.max( 4, Math.min( 80, fx.seal.pad ?? 26 ) );
		const depth = Math.max( 4, Math.min( 40, fx.seal.depth ?? 16 ) ) / 100;
		const color = fx.seal.color || '#e5484d';
		const rim = fx.seal.color2 || null;
		const cx = w / 2;
		const cy = h / 2;
		const rx = w / 2 + padP;
		const ry = h / 2 + padP;
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
		ctx.fillStyle = color;
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
	if ( fx.burst ) {
		const count = Math.max(
			6,
			Math.min( 48, Math.round( fx.burst.count || 16 ) )
		);
		const length = Math.max( 10, Math.min( 200, fx.burst.length || 60 ) );
		const gap = Math.max( 10, Math.min( 120, fx.burst.gap || 40 ) );
		const cx = w / 2;
		const cy = h / 2;
		ctx.save();
		ctx.fillStyle = fx.burst.color || '#111417';
		for ( let i = 0; i < count; i++ ) {
			const a = ( i / count ) * 2 * Math.PI + 0.015 * i;
			const ux = Math.cos( a );
			const uy = Math.sin( a );
			const wIn = Math.max( 1, length * 0.06 );
			const x0 = cx + ux * gap;
			const y0 = cy + uy * gap;
			const x1 = cx + ux * ( gap + length );
			const y1 = cy + uy * ( gap + length );
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
	if ( fx.sticker ) {
		const size = Math.max( 2, Math.min( 40, fx.sticker.size || 12 ) );
		const color = fx.sticker.color || '#ffffff';
		const shadowA =
			Math.max( 0, Math.min( 90, fx.sticker.shadow ?? 35 ) ) / 100;
		const pad = Math.ceil( size ) + 6;
		if ( shadowA > 0 ) {
			const sh = blurCanvas(
				silhouette( '#000000', pad ),
				size * 0.4 + 3
			);
			ctx.globalAlpha = shadowA;
			for ( let i = 0; i < 12; i++ ) {
				const a = ( i / 12 ) * 2 * Math.PI;
				ctx.drawImage(
					sh,
					Math.cos( a ) * size - pad,
					Math.sin( a ) * size - pad + size * 0.55
				);
			}
			ctx.globalAlpha = 1;
		}
		const sil = silhouette( color, pad );
		for ( let i = 0; i < 20; i++ ) {
			const a = ( i / 20 ) * 2 * Math.PI;
			ctx.drawImage(
				sil,
				Math.cos( a ) * size - pad,
				Math.sin( a ) * size - pad
			);
		}
		for ( let i = 0; i < 10; i++ ) {
			const a = ( i / 10 ) * 2 * Math.PI + 0.3;
			ctx.drawImage(
				sil,
				Math.cos( a ) * size * 0.6 - pad,
				Math.sin( a ) * size * 0.6 - pad
			);
		}
	}

	// Retro stack: 2-3 SOLID coloured copies stepping away behind the text
	// (the 70s poster look - unlike echo, which fades one colour out).
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

	// Echo: fading copies of the full (coloured) text, offset along an angle.
	if ( fx.echo ) {
		const angle = ( fx.echo.angle ?? 45 ) * DEG;
		const count = Math.max(
			1,
			Math.min( 20, Math.round( fx.echo.count || 5 ) )
		);
		const gap = Math.max( 1, Math.min( 80, fx.echo.gap || 10 ) );
		const ex = Math.cos( angle ) * gap;
		const ey = Math.sin( angle ) * gap;
		const off = createCanvas( w, h );
		drawText( off.getContext( '2d' ), { ...layer, textFX: layoutFX } );
		for ( let i = count; i >= 1; i-- ) {
			ctx.globalAlpha = Math.max(
				0.06,
				0.55 * ( 1 - i / ( count + 1 ) )
			);
			ctx.drawImage( off, ex * i, ey * i );
		}
		ctx.globalAlpha = 1;
	}

	// Halftone shadow: an offset silhouette rendered as a dot screen.
	if ( fx.dotShadow ) {
		const angle = ( fx.dotShadow.angle ?? 45 ) * DEG;
		const offset = Math.max( 1, Math.min( 80, fx.dotShadow.offset || 14 ) );
		const color = fx.dotShadow.color || '#1a1d21';
		const sil = silhouette( color );
		const sctx = sil.getContext( '2d' );
		const t = Math.max(
			6,
			Math.min( 24, Math.round( ( layer.fontSize || 48 ) * 0.14 ) )
		);
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

	// Ground shadow: the text "stands" on the floor, its shadow falling
	// away in perspective (flipped, squashed, sheared, blurred silhouette).
	if ( fx.groundShadow ) {
		const squash =
			Math.max( 10, Math.min( 100, fx.groundShadow.squash ?? 45 ) ) / 100;
		const shear =
			Math.max( -60, Math.min( 60, fx.groundShadow.shear ?? 25 ) ) / 100;
		const blur = Math.max( 0, Math.min( 20, fx.groundShadow.blur ?? 6 ) );
		const alpha =
			Math.max( 5, Math.min( 90, fx.groundShadow.opacity ?? 35 ) ) / 100;
		const gPad = Math.ceil( blur ) + 2;
		const sil = blurCanvas(
			silhouette( fx.groundShadow.color || '#000000', gPad ),
			blur * 0.6
		);
		ctx.save();
		ctx.globalAlpha = alpha;
		ctx.translate( 0, h );
		ctx.transform( 1, 0, -shear, -squash, shear * h * squash, 0 );
		ctx.drawImage( sil, -gPad, -gPad - h );
		ctx.restore();
	}

	const shadow = fx.longShadow || fx.extrude;
	if ( shadow ) {
		const isLong = !! fx.longShadow;
		const angle = ( shadow.angle ?? 45 ) * DEG;
		const length = Math.max(
			0,
			Math.min( 400, ( isLong ? shadow.length : shadow.depth ) ?? 20 )
		);
		const color = shadow.color || '#000000';
		const dx = Math.cos( angle );
		const dy = Math.sin( angle );
		const off = createCanvas( w, h );
		drawText( off.getContext( '2d' ), solidCopy( color ) );
		const steps = Math.round( length );
		for ( let i = steps; i >= 1; i-- ) {
			ctx.globalAlpha = isLong
				? Math.max( 0.12, 1 - ( i / steps ) * 0.85 )
				: 1;
			ctx.drawImage( off, dx * i, dy * i );
		}
		ctx.globalAlpha = 1;
	}

	// Splice: a hollow (outline-only) copy of the text, offset behind it.
	if ( fx.splice ) {
		const angle = ( fx.splice.angle ?? 45 ) * DEG;
		const offset = Math.max( 1, Math.min( 80, fx.splice.offset || 10 ) );
		const color = fx.splice.color || '#e5484d';
		const lw = Math.max(
			1,
			Math.round( ( layer.fontSize || 48 ) * 0.035 )
		);
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

	// Glow: a blurred coloured silhouette hugging the text edges.
	if ( fx.glow ) {
		const gColor = fx.glow.color || '#3ba7ff';
		const size = Math.max( 1, Math.min( 60, fx.glow.size || 14 ) );
		const pad = Math.ceil( size );
		const blurred = blurCanvas( silhouette( gColor, pad ), size * 0.6 );
		// Draw twice so the glow reads on light and dark backgrounds.
		ctx.drawImage( blurred, -pad, -pad );
		ctx.drawImage( blurred, -pad, -pad );
	}

	// Neon: a wide + tight halo pair; the bright core is added after the text.
	if ( fx.neon ) {
		const nColor = fx.neon.color || '#ff36c7';
		const size = Math.max( 4, Math.min( 60, fx.neon.size || 18 ) );
		const pad = Math.ceil( size * 1.4 );
		const sil = silhouette( nColor, pad );
		const wide = blurCanvas( sil, size );
		const tight = blurCanvas( sil, Math.max( 1, size * 0.35 ) );
		ctx.drawImage( wide, -pad, -pad );
		ctx.drawImage( wide, -pad, -pad );
		ctx.drawImage( tight, -pad, -pad );
	}

	// Hatch shadow: an offset silhouette drawn as diagonal line shading.
	if ( fx.hatchShadow ) {
		const off = Math.max( 2, Math.min( 60, fx.hatchShadow.offset || 10 ) );
		const rad = ( fx.hatchShadow.angle ?? 45 ) * DEG;
		const gapH = Math.max( 3, Math.min( 20, fx.hatchShadow.gap || 6 ) );
		const color = fx.hatchShadow.color || '#1a1d21';
		const sil = silhouette( color );
		const sctx3 = sil.getContext( '2d' );
		sctx3.globalCompositeOperation = 'destination-in';
		sctx3.save();
		sctx3.translate( sil.width / 2, sil.height / 2 );
		sctx3.rotate( -Math.PI / 4 );
		const diag = Math.hypot( sil.width, sil.height );
		sctx3.fillStyle = '#000';
		for ( let gy = -diag / 2; gy < diag / 2; gy += gapH ) {
			sctx3.fillRect( -diag / 2, gy, diag, Math.max( 1, gapH * 0.4 ) );
		}
		sctx3.restore();
		ctx.drawImage( sil, Math.cos( rad ) * off, Math.sin( rad ) * off );
	}

	// Gradient outline: a stroked ring filled with a two-color ramp.
	if ( fx.gradientOutline ) {
		const gow = Math.max(
			1,
			Math.min( 20, fx.gradientOutline.width || 6 )
		);
		const c1 = fx.gradientOutline.color || '#f5c518';
		const c2 = fx.gradientOutline.color2 || '#e5484d';
		const goPad = gow + 3;
		const ring = createCanvas( w + 2 * goPad, h + 2 * goPad );
		const rctx2 = ring.getContext( '2d' );
		rctx2.translate( goPad, goPad );
		drawText(
			rctx2,
			solidCopy( 'rgba(0,0,0,0)', {
				outlineColor: '#000000',
				outlineW: gow * 2,
			} )
		);
		rctx2.setTransform( 1, 0, 0, 1, 0, 0 );
		rctx2.globalCompositeOperation = 'source-in';
		const rad2 = ( fx.gradientOutline.angle ?? 90 ) * DEG;
		const gdx = Math.cos( rad2 );
		const gdy = Math.sin( rad2 );
		const glen =
			Math.abs( gdx ) * ring.width + Math.abs( gdy ) * ring.height || 1;
		const grad = rctx2.createLinearGradient(
			ring.width / 2 - ( gdx * glen ) / 2,
			ring.height / 2 - ( gdy * glen ) / 2,
			ring.width / 2 + ( gdx * glen ) / 2,
			ring.height / 2 + ( gdy * glen ) / 2
		);
		grad.addColorStop( 0, c1 );
		grad.addColorStop( 1, c2 );
		rctx2.fillStyle = grad;
		rctx2.fillRect( 0, 0, ring.width, ring.height );
		ctx.drawImage( ring, -goPad, -goPad );
	}

	// Contour lines: concentric hollow rings marching outward (topo look).
	if ( fx.contour ) {
		const count = Math.max(
			1,
			Math.min( 4, Math.round( fx.contour.count || 3 ) )
		);
		const gap = Math.max( 3, Math.min( 30, fx.contour.gap || 8 ) );
		const lw = Math.max( 1, Math.min( 6, fx.contour.width || 2 ) );
		const cols = [
			fx.contour.color || '#1a1d21',
			fx.contour.color2 || fx.contour.color || '#1a1d21',
		];
		const cPad = count * gap + lw + 4;
		for ( let n = count; n >= 1; n-- ) {
			const d = n * gap;
			const ring = createCanvas( w + 2 * cPad, h + 2 * cPad );
			const rctx = ring.getContext( '2d' );
			rctx.translate( cPad, cPad );
			drawText(
				rctx,
				solidCopy( 'rgba(0,0,0,0)', {
					outlineColor: cols[ ( n - 1 ) % 2 ],
					outlineW: 2 * d + lw,
				} )
			);
			rctx.globalCompositeOperation = 'destination-out';
			drawText(
				rctx,
				solidCopy( 'rgba(0,0,0,0)', {
					outlineColor: '#000000',
					outlineW: Math.max( 0.2, 2 * d - lw ),
				} )
			);
			ctx.drawImage( ring, -cPad, -cPad );
		}
	}

	// Outline (sticker): a dilated silhouette ring right behind the text.
	if ( fx.outline ) {
		const oColor = fx.outline.color || '#ffffff';
		const size = Math.max( 1, Math.min( 40, fx.outline.size || 8 ) );
		const pad = Math.ceil( size ) + 2;
		const sil = silhouette( oColor, pad );
		for ( let i = 0; i < 16; i++ ) {
			const a = ( i / 16 ) * 2 * Math.PI;
			ctx.drawImage(
				sil,
				Math.cos( a ) * size - pad,
				Math.sin( a ) * size - pad
			);
		}
		for ( let i = 0; i < 8; i++ ) {
			const a = ( i / 8 ) * 2 * Math.PI + 0.3;
			ctx.drawImage(
				sil,
				Math.cos( a ) * size * 0.55 - pad,
				Math.sin( a ) * size * 0.55 - pad
			);
		}
	}

	// Multi outline (v1.139.0): stacked rings behind the text, innermost
	// first in fx.rings.colors. Drawn widest ring first so each inner ring
	// sits on top of the previous one.
	if ( fx.rings ) {
		const size = Math.max( 1, Math.min( 30, fx.rings.size || 6 ) );
		// Up to five rings (v1.248); missing colors cycle the given ones.
		const base = [
			fx.rings.color || '#ffffff',
			fx.rings.color2 || '#1a1d21',
			fx.rings.color3 || null,
		].filter( Boolean );
		const wanted = Math.max( 2, Math.min( 5, fx.rings.count || 2 ) );
		const colors = Array.from(
			{ length: wanted },
			( _, i ) => base[ i % base.length ]
		);
		for ( let ring = colors.length; ring >= 1; ring-- ) {
			const reach = size * ring;
			const pad = Math.ceil( reach ) + 2;
			const sil = silhouette( colors[ ring - 1 ], pad );
			const stamps = 8 + ring * 8;
			for ( let i = 0; i < stamps; i++ ) {
				const a = ( i / stamps ) * 2 * Math.PI;
				ctx.drawImage(
					sil,
					Math.cos( a ) * reach - pad,
					Math.sin( a ) * reach - pad
				);
			}
			for ( let i = 0; i < 8; i++ ) {
				const a = ( i / 8 ) * 2 * Math.PI + 0.35;
				ctx.drawImage(
					sil,
					Math.cos( a ) * reach * 0.6 - pad,
					Math.sin( a ) * reach * 0.6 - pad
				);
			}
		}
	}

	// Confetti: seeded particles and sparkles scattered around the text.
	if ( fx.confetti ) {
		const density = Math.max(
			5,
			Math.min( 100, fx.confetti.density ?? 40 )
		);
		const size = Math.max( 2, Math.min( 14, fx.confetti.size || 5 ) );
		const rnd = seededRnd( ( fx.confetti.seed || 1 ) * 31337 );
		const cPad = size * 2 + 6;
		const count = Math.round( density * 0.7 );
		const palette = [ ...RAINBOW_COLORS, '#ffffff', '#ffd700' ];
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
				0.22 * Math.pow( 1 - i / steps, 2 )
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
		ctx.drawImage( silhouette( '#ff2436' ), -cdx, -cdy );
		ctx.drawImage( silhouette( '#00e0ff' ), cdx, cdy );
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

	// Reflection: a flipped, fading copy below the text block.
	if ( fx.reflection ) {
		const gap = Math.max( 0, Math.min( 60, fx.reflection.gap ?? 6 ) );
		const alpha = Math.max(
			0.05,
			Math.min( 0.95, ( fx.reflection.alpha ?? 45 ) / 100 )
		);
		const off = createCanvas( w, h );
		drawText( off.getContext( '2d' ), { ...layer, textFX: layoutFX } );
		const refl = createCanvas( w, h );
		const rctx = refl.getContext( '2d' );
		rctx.translate( 0, h );
		rctx.scale( 1, -1 );
		rctx.drawImage( off, 0, 0 );
		rctx.setTransform( 1, 0, 0, 1, 0, 0 );
		rctx.globalCompositeOperation = 'destination-in';
		const grad = rctx.createLinearGradient( 0, 0, 0, h );
		grad.addColorStop( 0, 'rgba(0,0,0,0.9)' );
		grad.addColorStop( 0.7, 'rgba(0,0,0,0)' );
		rctx.fillStyle = grad;
		rctx.fillRect( 0, 0, w, h );
		ctx.globalAlpha = alpha;
		ctx.drawImage( refl, 0, h + gap );
		ctx.globalAlpha = 1;
	}
}

// Every live text-effect key (besides warp) drawTextWithEffects understands.
export const TEXT_FX_KEYS = [
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
	const palette = fx.rainbow
		? Array.isArray( fx.rainbow.colors ) && fx.rainbow.colors.length
			? fx.rainbow.colors
			: RAINBOW_COLORS
		: null;
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
				rot: fx.jitter ? ( rnd( i, 1 ) - 0.5 ) * amount * 0.42 : 0,
				dx: fx.jitter
					? ( rnd( i, 2 ) - 0.5 ) * amount * size * 0.12
					: 0,
				dy: fx.jitter
					? ( rnd( i, 3 ) - 0.5 ) * amount * size * 0.24
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
