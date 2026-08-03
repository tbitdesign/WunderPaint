import { gaussianBlur } from '../effects';
import { getTip, resamplePts, stampTipStroke } from '../brush-tips';
import { blendToComposite, createCanvas, supportsCtxFilter } from './env';
import { tracePathD } from './shapes';
import { patternTile, registerUserTile, userTile } from './patterns';

/**
 * True feathered round stroke (v1.123): radial-gradient stamps along the
 * resampled points, rendered at FULL alpha into a scratch canvas and
 * composited once with the path opacity (uniform coverage, no streaky
 * self-overlaps). The old three-ring approximation left visibly hard,
 * stepped edges (user report).
 *
 * @param {CanvasRenderingContext2D} ctx  Target context (any transform).
 * @param {Object}                   path Stroke path { pts, size, color, opacity }.
 * @param {number}                   soft Feather amount 0..1 (0 = hard).
 */
let softScratch = null;

export function drawSoftRoundStroke( ctx, path, soft ) {
	const size = path.size || 1;
	const pts = path.pts || [];
	if ( ! pts.length ) {
		return;
	}
	// Reused scratch (v1.130.0): allocating a viewport-sized canvas per
	// soft/flow path per FRAME made panning stroke-heavy documents churn.
	// Rendering is synchronous and non-reentrant, one buffer suffices.
	if (
		! softScratch ||
		softScratch.width < ctx.canvas.width ||
		softScratch.height < ctx.canvas.height
	) {
		softScratch = createCanvas( ctx.canvas.width, ctx.canvas.height );
	}
	const scratch = softScratch;
	const sctx = scratch.getContext( '2d' );
	sctx.setTransform( 1, 0, 0, 1, 0, 0 );
	sctx.clearRect( 0, 0, scratch.width, scratch.height );
	if ( 'function' === typeof ctx.getTransform ) {
		sctx.setTransform( ctx.getTransform() );
	}
	const r = size / 2;
	// Hardness core: the fully solid fraction of the radius; the falloff
	// outside follows a smoothstep so the edge never bands.
	const core = Math.max( 0, Math.min( 1, 1 - soft ) );
	// Flow (v1.129.0): each stamp lands at flow alpha INSIDE the scratch,
	// so overlaps along the stroke build up toward solid - the single
	// composite below then caps everything at the stroke opacity,
	// exactly Photoshop's opacity/flow split.
	sctx.globalAlpha = Math.max( 0.01, Math.min( 1, path.flow ?? 1 ) );
	const samples = resamplePts( pts, Math.max( 0.5, size * 0.18 ) );
	for ( const p of samples ) {
		const g = sctx.createRadialGradient( p.x, p.y, 0, p.x, p.y, r );
		g.addColorStop( 0, path.color || '#000' );
		g.addColorStop( Math.max( 0.001, core ), path.color || '#000' );
		if ( core < 1 ) {
			const fall = ( t, a ) =>
				g.addColorStop(
					Math.min( 1, core + ( 1 - core ) * t ),
					toRgba( path.color || '#000', a )
				);
			fall( 0.25, 0.85 );
			fall( 0.5, 0.5 );
			fall( 0.75, 0.16 );
		}
		g.addColorStop( 1, toRgba( path.color || '#000', 0 ) );
		sctx.fillStyle = g;
		sctx.beginPath();
		sctx.arc( p.x, p.y, r, 0, 2 * Math.PI );
		sctx.fill();
	}
	ctx.save();
	if ( 'function' === typeof ctx.setTransform ) {
		ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	}
	ctx.globalAlpha = path.opacity ?? 1;
	ctx.drawImage( scratch, 0, 0 );
	ctx.restore();
}

/** Color string to rgba() with the given alpha (hex or rgb inputs). */
export function toRgba( color, alpha ) {
	let m = /^#([0-9a-f]{6})/i.exec( color );
	if ( m ) {
		const n = parseInt( m[ 1 ], 16 );
		return `rgba(${ ( n >> 16 ) & 255 },${ ( n >> 8 ) & 255 },${
			n & 255
		},${ alpha })`;
	}
	m = /^#([0-9a-f]{3})$/i.exec( color );
	if ( m ) {
		const [ rr, gg, bb ] = m[ 1 ]
			.split( '' )
			.map( ( c ) => parseInt( c + c, 16 ) );
		return `rgba(${ rr },${ gg },${ bb },${ alpha })`;
	}
	m = /^rgba?\(([^)]+)\)/.exec( color );
	if ( m ) {
		const [ rr, gg, bb ] = m[ 1 ]
			.split( ',' )
			.map( ( v ) => parseFloat( v ) );
		return `rgba(${ rr },${ gg },${ bb },${ alpha })`;
	}
	return color;
}

export function drawStrokePaths( ctx, layer ) {
	// The Hardness slider (0-100) softens round tips: lower = softer edge.
	// A tip's own `soft` is the minimum softness (Soft Round stays soft).
	const hardness = layer.hardness ?? 100;
	for ( const path of layer.paths || [] ) {
		const tip = getTip( path.tip );
		// Stamped tips render by stamping a shape along the sampled points.
		if ( 'stamp' === tip.render ) {
			stampTipStroke( ctx, path );
			continue;
		}
		const soft = Math.max( tip.soft || 0, 1 - hardness / 100 );
		// Flow < 100% needs the stamped renderer too: build-up only
		// happens stamp by stamp (v1.129.0).
		const flow = path.flow ?? 1;
		if ( ( soft > 0 || flow < 1 ) && path.pts && path.pts.length ) {
			drawSoftRoundStroke( ctx, path, soft );
			continue;
		}
		ctx.beginPath();
		tracePathD( ctx, path.d );
		ctx.strokeStyle = path.color || '#000';
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.lineWidth = path.size || 1;
		ctx.globalAlpha = path.opacity ?? 1;
		ctx.stroke();
	}
	ctx.globalAlpha = 1;
}

export function scaleEffectParams( id, params, scale ) {
	if ( 1 === scale || ! params ) {
		return params || {};
	}
	const scaled = { ...params };
	for ( const key of [ 'radius', 'cell', 'shift' ] ) {
		if ( 'number' === typeof scaled[ key ] ) {
			scaled[ key ] = scaled[ key ] * scale;
		}
	}
	return scaled;
}

/* ------------------------------ layer styles --------------------------- */

/**
 * Tinted silhouette of `source` (white areas = content alpha).
 * @param source
 * @param color
 * @param opacity
 */
export function tintedSilhouette( source, color, opacity ) {
	const out = createCanvas( source.width, source.height );
	const ctx = out.getContext( '2d' );
	ctx.drawImage( source, 0, 0 );
	ctx.globalCompositeOperation = 'source-in';
	ctx.globalAlpha = opacity ?? 1;
	ctx.fillStyle = color;
	ctx.fillRect( 0, 0, out.width, out.height );
	return out;
}

export function blurCanvas( canvas, radius ) {
	if ( ! radius ) {
		return canvas;
	}
	const out = createCanvas( canvas.width, canvas.height );
	const ctx = out.getContext( '2d' );
	if ( supportsCtxFilter() ) {
		ctx.filter = `blur(${ radius }px)`;
		ctx.drawImage( canvas, 0, 0 );
	} else {
		ctx.drawImage( canvas, 0, 0 );
		const data = ctx.getImageData( 0, 0, out.width, out.height );
		gaussianBlur(
			{ data: data.data, width: out.width, height: out.height },
			{ radius }
		);
		ctx.putImageData( data, 0, 0 );
	}
	return out;
}

/**
 * Dilate a silhouette by r device px (approximate morphological dilation).
 * @param source
 * @param r
 */
export function dilate( source, r ) {
	const out = createCanvas( source.width, source.height );
	const ctx = out.getContext( '2d' );
	const steps = 16;
	for ( let i = 0; i < steps; i++ ) {
		const a = ( i / steps ) * 2 * Math.PI;
		ctx.drawImage( source, Math.cos( a ) * r, Math.sin( a ) * r );
	}
	ctx.drawImage( source, 0, 0 );
	return out;
}

/**
 * Apply LayerStyles around a rendered content canvas (device space).
 * Order (spec 02.2): glow/shadow behind → content (+colorOverlay →
 * gradientOverlay → innerShadow → stroke) in front.
 *
 * @param  content
 * @param  layer
 * @param  scale
 * @return {HTMLCanvasElement} Styled composite (same size as content).
 */
export function applyLayerStyles( content, layer, scale ) {
	const s = layer.styles;
	if ( ! s ) {
		return content;
	}
	const out = createCanvas( content.width, content.height );
	const ctx = out.getContext( '2d' );

	// Behind: outer glow, drop shadow.
	if ( s.outerGlow ) {
		const glow = blurCanvas(
			dilate(
				tintedSilhouette(
					content,
					s.outerGlow.color || '#fff',
					s.outerGlow.opacity ?? 0.8
				),
				( s.outerGlow.spread || 0 ) * scale
			),
			( s.outerGlow.blur ?? 8 ) * scale
		);
		ctx.drawImage( glow, 0, 0 );
	}
	if ( s.dropShadow ) {
		const rad = ( ( s.dropShadow.angle ?? 120 ) * Math.PI ) / 180;
		const dist = ( s.dropShadow.distance || 0 ) * scale;
		const shadow = blurCanvas(
			dilate(
				tintedSilhouette(
					content,
					s.dropShadow.color || '#000',
					s.dropShadow.opacity ?? 0.5
				),
				( s.dropShadow.spread || 0 ) * scale
			),
			( s.dropShadow.blur ?? 4 ) * scale
		);
		ctx.drawImage( shadow, Math.cos( rad ) * dist, Math.sin( rad ) * dist );
	}

	// Content with front overlays.
	const front = createCanvas( content.width, content.height );
	const fctx = front.getContext( '2d' );
	fctx.drawImage( content, 0, 0 );

	if ( s.colorOverlay ) {
		fctx.globalCompositeOperation = blendToComposite(
			s.colorOverlay.blend
		);
		const tint = tintedSilhouette(
			content,
			s.colorOverlay.color || '#000',
			s.colorOverlay.opacity ?? 1
		);
		fctx.globalCompositeOperation = 'source-atop';
		fctx.drawImage( tint, 0, 0 );
	}
	if ( s.gradientOverlay ) {
		const gcan = createCanvas( content.width, content.height );
		const gctx = gcan.getContext( '2d' );
		const rad = ( ( s.gradientOverlay.angle ?? 90 ) * Math.PI ) / 180;
		const cx = gcan.width / 2;
		const cy = gcan.height / 2;
		const len = Math.max( gcan.width, gcan.height ) / 2;
		let grad;
		if ( 'radial' === s.gradientOverlay.kind ) {
			grad = gctx.createRadialGradient( cx, cy, 0, cx, cy, len );
		} else {
			grad = gctx.createLinearGradient(
				cx - Math.cos( rad ) * len,
				cy - Math.sin( rad ) * len,
				cx + Math.cos( rad ) * len,
				cy + Math.sin( rad ) * len
			);
		}
		for ( const stop of s.gradientOverlay.stops || [] ) {
			grad.addColorStop(
				Math.min( 1, Math.max( 0, stop.at ) ),
				stop.color
			);
		}
		gctx.fillStyle = grad;
		gctx.globalAlpha = s.gradientOverlay.opacity ?? 1;
		gctx.fillRect( 0, 0, gcan.width, gcan.height );
		fctx.globalCompositeOperation = 'source-atop';
		fctx.drawImage( gcan, 0, 0 );
	}
	if ( s.patternOverlay ) {
		// Repeating procedural pattern clipped to the content (v0.9).
		const pcan = createCanvas( content.width, content.height );
		const pctx = pcan.getContext( '2d' );
		const tileScale = ( s.patternOverlay.scale || 1 ) * scale;
		pctx.save();
		pctx.scale( tileScale, tileScale );
		const overlayTile =
			'custom' === s.patternOverlay.pattern
				? userTile( s.patternOverlay.patternData )
				: patternTile(
						s.patternOverlay.pattern || 'dots',
						s.patternOverlay.color || '#000'
				  );
		if ( ! overlayTile ) {
			registerUserTile( s.patternOverlay.patternData );
		}
		pctx.fillStyle = overlayTile
			? pctx.createPattern( overlayTile, 'repeat' )
			: s.patternOverlay.color || '#000';
		pctx.fillRect( 0, 0, pcan.width / tileScale, pcan.height / tileScale );
		pctx.restore();
		fctx.globalCompositeOperation = 'source-atop';
		fctx.globalAlpha = s.patternOverlay.opacity ?? 0.6;
		fctx.drawImage( pcan, 0, 0 );
		fctx.globalAlpha = 1;
	}
	if ( s.innerGlow ) {
		// Like inner shadow but centered: the rim glows inward (v0.9).
		const inv = createCanvas( content.width, content.height );
		const ictx2 = inv.getContext( '2d' );
		ictx2.fillStyle = s.innerGlow.color || '#ffef9e';
		ictx2.fillRect( 0, 0, inv.width, inv.height );
		ictx2.globalCompositeOperation = 'destination-out';
		ictx2.drawImage( content, 0, 0 );
		// Re-tint after blurring, the pixel-fallback blur bleeds the
		// transparent (black) hole into the rim otherwise.
		const blurred = tintedSilhouette(
			blurCanvas( inv, ( s.innerGlow.blur ?? 8 ) * scale ),
			s.innerGlow.color || '#ffef9e',
			1
		);
		fctx.globalCompositeOperation = 'source-atop';
		fctx.globalAlpha = s.innerGlow.opacity ?? 0.8;
		fctx.drawImage( blurred, 0, 0 );
		fctx.globalAlpha = 1;
	}
	if ( s.satin ) {
		// Two offset copies of the inverse silhouette XORed → wavy band (v0.9).
		const rad = ( ( s.satin.angle ?? 45 ) * Math.PI ) / 180;
		const dx = Math.cos( rad ) * ( s.satin.distance || 8 ) * scale;
		const dy = Math.sin( rad ) * ( s.satin.distance || 8 ) * scale;
		const band = createCanvas( content.width, content.height );
		const bctx = band.getContext( '2d' );
		const sil = tintedSilhouette( content, s.satin.color || '#000', 1 );
		bctx.drawImage( sil, dx, dy );
		bctx.globalCompositeOperation = 'xor';
		bctx.drawImage( sil, -dx, -dy );
		const blurredBand = tintedSilhouette(
			blurCanvas( band, ( s.satin.blur ?? 6 ) * scale ),
			s.satin.color || '#000',
			1
		);
		fctx.globalCompositeOperation = 'source-atop';
		fctx.globalAlpha = s.satin.opacity ?? 0.5;
		fctx.drawImage( blurredBand, 0, 0 );
		fctx.globalAlpha = 1;
	}
	if ( s.bevel ) {
		// Highlight along the light edge, shadow opposite (v0.9). The
		// rims come from the content minus an offset copy of itself.
		const size = Math.max( 1, ( s.bevel.size || 4 ) * scale );
		const strength = s.bevel.strength ?? 0.6;
		const up = 'down' !== s.bevel.direction;
		const rim = ( ox, oy, color ) => {
			const edge = createCanvas( content.width, content.height );
			const ectx = edge.getContext( '2d' );
			ectx.drawImage( tintedSilhouette( content, color, 1 ), 0, 0 );
			ectx.globalCompositeOperation = 'destination-out';
			ectx.drawImage( content, ox, oy );
			return blurCanvas( edge, Math.max( 1, size / 3 ) );
		};
		const hi = rim( size, size, '#ffffff' );
		const lo = rim( -size, -size, '#000000' );
		fctx.globalCompositeOperation = 'source-atop';
		fctx.globalAlpha = strength;
		fctx.drawImage( up ? hi : lo, 0, 0 );
		fctx.drawImage( up ? lo : hi, 0, 0 );
		fctx.globalAlpha = 1;
	}
	if ( s.innerShadow ) {
		// Inverse silhouette, blurred, clipped to content, offset.
		const inv = createCanvas( content.width, content.height );
		const ictx = inv.getContext( '2d' );
		ictx.fillStyle = s.innerShadow.color || '#000';
		ictx.fillRect( 0, 0, inv.width, inv.height );
		ictx.globalCompositeOperation = 'destination-out';
		ictx.drawImage( content, 0, 0 );
		const blurred = blurCanvas( inv, ( s.innerShadow.blur ?? 4 ) * scale );
		const rad = ( ( s.innerShadow.angle ?? 120 ) * Math.PI ) / 180;
		const dist = ( s.innerShadow.distance || 0 ) * scale;
		fctx.globalCompositeOperation = 'source-atop';
		fctx.globalAlpha = s.innerShadow.opacity ?? 0.5;
		fctx.drawImage(
			blurred,
			Math.cos( rad ) * dist,
			Math.sin( rad ) * dist
		);
		fctx.globalAlpha = 1;
	}
	if ( s.stroke && s.stroke.size ) {
		const size = s.stroke.size * scale;
		const silhouette = tintedSilhouette(
			content,
			s.stroke.color || '#000',
			s.stroke.opacity ?? 1
		);
		const ring = createCanvas( content.width, content.height );
		const rctx = ring.getContext( '2d' );
		const position = s.stroke.position || 'outside';
		// Erosion = INTERSECTION of translated copies (v1.7 fix, the old
		// code subtracted their UNION, which wiped the whole silhouette:
		// inside/center strokes never showed).
		const erode = ( amount ) => {
			const eroded = createCanvas( content.width, content.height );
			const ectx2 = eroded.getContext( '2d' );
			ectx2.drawImage( content, 0, 0 );
			ectx2.globalCompositeOperation = 'destination-in';
			for ( let i = 0; i < 16; i++ ) {
				const a = ( i / 16 ) * 2 * Math.PI;
				ectx2.drawImage(
					content,
					Math.cos( a ) * amount,
					Math.sin( a ) * amount
				);
			}
			return eroded;
		};
		if ( 'inside' === position ) {
			rctx.drawImage( silhouette, 0, 0 );
			rctx.globalCompositeOperation = 'destination-out';
			rctx.drawImage( erode( size ), 0, 0 );
			fctx.globalCompositeOperation = 'source-atop';
			fctx.drawImage( ring, 0, 0 );
		} else {
			const grow = 'center' === position ? size / 2 : size;
			rctx.drawImage( dilate( silhouette, grow ), 0, 0 );
			rctx.globalCompositeOperation = 'destination-out';
			if ( 'center' === position ) {
				rctx.drawImage( erode( size / 2 ), 0, 0 );
			} else {
				rctx.drawImage( content, 0, 0 );
			}
			fctx.globalCompositeOperation = 'destination-over'; // ring behind content edge
			ctx.drawImage( ring, 0, 0 );
			if ( 'center' === position ) {
				// The inner half of a center stroke sits ON the content.
				fctx.globalCompositeOperation = 'source-atop';
				fctx.drawImage( ring, 0, 0 );
			}
		}
		fctx.globalCompositeOperation = 'source-over';
	}

	ctx.globalCompositeOperation = 'source-over';
	ctx.drawImage( front, 0, 0 );
	return out;
}
