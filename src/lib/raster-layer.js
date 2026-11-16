/**
 * The editable-pixel engine (spec 02.2 raster / 05.4):
 * rasterize-on-first-edit, brush/pencil/eraser strokes with true alpha
 * erase, scanline flood fill, selection-clipped painting.
 *
 * Raster canvases are layer-local: canvas pixel (0,0) = doc point
 * (layer.x, layer.y) at 1:1 scale.
 */

import { createCanvas, tracePathD, effectReach } from './raster';
import { drawImageFitted } from './image-fit';
import { gaussianBlur, sharpen } from './effects';
import { FX_BRUSH_DEFAULTS, fxBrushToneWeight } from './fxbrush-settings';
import { selectionToMaskCanvas } from '../store/selection';
import { colorLuminance } from './color';
import { fillBucketCanvas } from './bucket-fill';
import {
	setDocTransform,
	setLayerToDocTransform,
} from '../screens/canvas/paint-commit';
import { drawCloneDab } from './clone-source';
import { growFxBrushLayer } from './fxbrush-bounds';
import { getTip, isStampTip, pathIsShaped, stampTipStroke } from './brush-tips';
import { drawSoftRoundStroke } from './raster/styles';

/**
 * Create the live canvas for a raster layer (from dataUrl/image if present).
 *
 * @param {Object} layer  Raster layer (canvas may be null).
 * @param {Object} source Optional pre-loaded image/canvas to draw.
 * @param {Object} fit    Optional imageFit to bake (image sources only;
 *                        rehydrated dataUrls are already box-shaped).
 * @return {HTMLCanvasElement} The canvas (also assigned to a COPY caller uses).
 */
export function buildRasterCanvas( layer, source = null, fit = null ) {
	const canvas = createCanvas(
		Math.max( 1, Math.round( layer.w ) ),
		Math.max( 1, Math.round( layer.h ) )
	);
	const ctx = canvas.getContext( '2d' );
	if ( source ) {
		drawImageFitted(
			ctx,
			source,
			source.naturalWidth || source.width,
			source.naturalHeight || source.height,
			canvas.width,
			canvas.height,
			fit
		);
	}
	return canvas;
}

/**
 * Rasterize-on-first-edit: return a raster twin of an image layer
 * (spec 02.2). The caller dispatches the layer replacement.
 *
 * @param {Object} layer Image layer.
 * @param {Object} img   Loaded HTMLImageElement (from the ImageCache).
 * @return {Object} New raster layer object (same id/geometry).
 */
export function imageToRaster( layer, img ) {
	// Bake the fit (cover/contain crop) so pixels match what was shown.
	const canvas = buildRasterCanvas( layer, img, layer.imageFit );
	const raster = {
		...layer,
		type: 'raster',
		canvas,
		dataUrl: null,
	};
	delete raster.src;
	delete raster.naturalW;
	delete raster.naturalH;
	return raster;
}

/**
 * Opaque bounding box of a canvas (alpha > 0), or null when fully empty.
 *
 * @param {HTMLCanvasElement} canvas Canvas to scan.
 * @return {Object|null} { x, y, w, h } in canvas pixels.
 */
export function opaqueBounds( canvas ) {
	const { width, height } = canvas;
	const data = canvas
		.getContext( '2d' )
		.getImageData( 0, 0, width, height ).data;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < height; y++ ) {
		const row = y * width;
		for ( let x = 0; x < width; x++ ) {
			if ( data[ ( row + x ) * 4 + 3 ] > 0 ) {
				if ( x < minX ) {
					minX = x;
				}
				if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				}
				maxY = y;
			}
		}
	}
	return maxX < 0
		? null
		: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Patch that shrinks a raster layer to its opaque pixels ("trim
 * transparent pixels", v1.69) so the transform frame matches the visible
 * content after deletes. Accounts for layer scale, rotation and flips so
 * the remaining pixels stay visually in place. Returns {} when there is
 * nothing to trim (no margins, fully transparent, or no live canvas).
 *
 * @param {Object} layer Raster layer.
 * @return {Object} UPDATE_LAYER patch (possibly empty).
 */
export function trimRasterPatch( layer ) {
	if ( ! layer.canvas ) {
		return {};
	}
	const c = layer.canvas;
	const b = opaqueBounds( c );
	if (
		! b ||
		( 0 === b.x && 0 === b.y && b.w === c.width && b.h === c.height )
	) {
		return {};
	}
	const cropped = createCanvas( b.w, b.h );
	cropped
		.getContext( '2d' )
		.drawImage( c, b.x, b.y, b.w, b.h, 0, 0, b.w, b.h );
	const scaleX = layer.w / c.width;
	const scaleY = layer.h / c.height;
	const newW = b.w * scaleX;
	const newH = b.h * scaleY;
	// The box rotates/flips around its center: move the center by the
	// (flipped, then rotated) local offset so the content does not jump.
	let dx = ( b.x + b.w / 2 ) * scaleX - layer.w / 2;
	let dy = ( b.y + b.h / 2 ) * scaleY - layer.h / 2;
	if ( layer.flipX ) {
		dx = -dx;
	}
	if ( layer.flipY ) {
		dy = -dy;
	}
	const rad = ( ( layer.rot || 0 ) * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	const cx = layer.x + layer.w / 2 + dx * cos - dy * sin;
	const cy = layer.y + layer.h / 2 + dx * sin + dy * cos;
	return {
		canvas: cropped,
		dataUrl: null,
		x: cx - newW / 2,
		y: cy - newH / 2,
		w: newW,
		h: newH,
	};
}

/** Doc-space selection → layer-local mask canvas (cached per call site). */
export function layerLocalMask( selection, doc, layer ) {
	if ( ! selection ) {
		return null;
	}
	const docMask = selectionToMaskCanvas( selection, doc.w, doc.h );
	const local = createCanvas(
		Math.max( 1, layer.w ),
		Math.max( 1, layer.h )
	);
	local.getContext( '2d' ).drawImage( docMask, -layer.x, -layer.y );
	return local;
}

/**
 * Paint one stroke path into a raster layer's own canvas.
 *
 * @param {Object} layer Raster layer (live canvas required). `x`/`y`/`w`/`h`
 *                       and, when set, `rot`/`flipX`/`flipY` must describe
 *                       the layer's doc-space box - `setDocTransform` maps
 *                       `path`'s document coordinates through that box into
 *                       this layer's own canvas pixels the same way the
 *                       renderer maps the canvas back onto the document, so
 *                       a stroke lands on the pixels the user actually
 *                       pointed at even when the layer is scaled, flipped
 *                       or rotated. A caller that paints into a canvas which
 *                       is NOT a transformed layer box (e.g. `paintOnMask`'s
 *                       doc-sized mask canvas below) must give `layer` its
 *                       own `w`/`h` equal to that canvas's size and leave
 *                       `rot`/`flipX`/`flipY` unset, which makes this the
 *                       identity map - not skip it.
 * @param {Object} path  { d, color, size, opacity }, doc coordinates.
 * @param {Object} opts  { erase, hardness (0-100), flow (0-100), mask } —
 *                       mask = layer-local alpha canvas (selection clip).
 */
export function paintStroke( layer, path, opts = {} ) {
	if ( ! layer.canvas ) {
		return;
	}
	const { erase = false, hardness = 100, flow = 100, mask = null } = opts;

	// Draw the stroke into a scratch canvas first so selection clipping and
	// erase compositing behave identically (preview == pixels).
	const scratch = createCanvas( layer.canvas.width, layer.canvas.height );
	const sctx = scratch.getContext( '2d' );
	// setDocTransform (screens/canvas/paint-commit.js) is the real inverse
	// of the renderer's box-stretch/flip/rotate, not just a translate - see
	// its own doc comment. A plain `translate(-layer.x, -layer.y)` (the old
	// code here) is only right for a layer that was never resized, rotated
	// or flipped, which used to be fine because painting NEVER wrote
	// straight into an existing layer's canvas. Now that the brush does
	// (Pinsel-Neubau Stufe 1), the eraser - the remaining caller of this
	// function for a real layer - needs the same correct mapping or it
	// erases pixels somewhere other than where the brush just painted them.
	setDocTransform( sctx, layer, {
		cw: layer.canvas.width,
		ch: layer.canvas.height,
	} );
	sctx.lineCap = 'round';
	sctx.lineJoin = 'round';
	sctx.strokeStyle = path.color || '#000';
	sctx.lineWidth = path.size || 1;
	sctx.globalAlpha = ( path.opacity ?? 1 ) * ( flow / 100 );
	if ( hardness < 100 ) {
		// Soft brush: feathered edge via a blurred shadow stamp.
		sctx.shadowColor = path.color || '#000';
		sctx.shadowBlur = ( path.size || 1 ) * ( 1 - hardness / 100 ) * 0.75;
		sctx.lineWidth = Math.max(
			1,
			( path.size || 1 ) * ( 0.6 + 0.4 * ( hardness / 100 ) )
		);
	}
	// The stroke as the mark-laying renderers want it: they resolve the
	// tip's own numbers themselves and read flow off the path.
	const marks = {
		pts: path.pts,
		size: path.size || 1,
		color: path.color || '#000',
		opacity: path.opacity ?? 1,
		flow: flow / 100,
		tip: path.tip,
		seedOffset: path.seedOffset || 0,
		spacing: path.spacing,
		scatter: path.scatter,
		alphaJitter: path.alphaJitter,
		sizeJitter: path.sizeJitter,
	};
	const shaped = pathIsShaped( path );
	if ( path.pts && path.pts.length && isStampTip( path.tip ) ) {
		// A TIP, the same one the brush uses. Erasing with a texture is a
		// real technique and the whole machine was already here; the eraser
		// only ever knew how to drag a round line through the pixels.
		sctx.shadowBlur = 0;
		stampTipStroke( sctx, marks );
	} else if ( path.pts && path.pts.length && shaped ) {
		// A ROUND tip that has been shaped. The line below cannot scatter
		// or thin out - it is one continuous stroke - so a shaped eraser
		// has to lay dabs, through the very same renderer the brush uses
		// or the two would drift apart. Without this branch the panel
		// would offer four sliders that move nothing whenever the eraser
		// holds Hard or Soft Round, which is most of the time.
		sctx.shadowBlur = 0;
		drawSoftRoundStroke(
			sctx,
			marks,
			Math.max( getTip( path.tip ).soft || 0, 1 - hardness / 100 )
		);
	} else {
		sctx.beginPath();
		tracePathD( sctx, path.d );
		sctx.stroke();
	}

	if ( mask ) {
		sctx.setTransform( 1, 0, 0, 1, 0, 0 );
		sctx.shadowBlur = 0;
		sctx.globalAlpha = 1;
		sctx.globalCompositeOperation = 'destination-in';
		sctx.drawImage( mask, 0, 0 );
	}

	const ctx = layer.canvas.getContext( '2d' );
	ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
	ctx.drawImage( scratch, 0, 0 );
	ctx.globalCompositeOperation = 'source-over';
}

/**
 * Paint one stroke onto a layer-mask canvas with Photoshop semantics
 * (v1.11.2): masks composite by ALPHA (destination-in), so the paint
 * color's luminance becomes alpha, white shows, black hides, gray is
 * partial. Two passes: erase the stroke's alpha, then re-add it scaled
 * by luminance, so any gray lands at its exact density.
 *
 * @param {HTMLCanvasElement} canvas Doc-sized mask canvas.
 * @param {Object}            path   Stroke: d, color, size, opacity.
 * @param {Object}            opts   paintStroke opts (hardness, flow).
 */
export function paintOnMask( canvas, path, opts = {} ) {
	// The mask canvas is doc-sized and never itself transformed - `path`'s
	// coordinates are already document coordinates, painted straight onto
	// it (spec 06.1: the RENDERER later maps this doc-sized mask onto the
	// layer's own transformed content, so the mask follows the layer's
	// move/scale/rotate/flip, not the stroke drawn into it here). Giving
	// `target` its own size as `w`/`h` (with `rot`/`flipX`/`flipY` left
	// unset) makes `paintStroke`'s setDocTransform() reduce to the
	// identity map - same net effect as the old bare translate(-0, -0).
	const target = { x: 0, y: 0, w: canvas.width, h: canvas.height, canvas };
	const lum = colorLuminance( path.color || '#000000' );
	paintStroke(
		target,
		{ ...path, color: '#ffffff' },
		{ ...opts, erase: true }
	);
	if ( lum > 0.004 ) {
		paintStroke(
			target,
			{ ...path, color: '#ffffff', opacity: ( path.opacity ?? 1 ) * lum },
			opts
		);
	}
}

/**
 * Clear the pixels of a raster layer inside a doc-space selection
 * ("delete within selection", spec 05.4 Marquee).
 *
 * @param {Object} layer     Raster layer with live canvas.
 * @param {Object} selection Selection.
 * @param {Object} doc       Document.
 */
export function clearSelectedRegion( layer, selection, doc ) {
	if ( ! layer.canvas || ! selection ) {
		return;
	}
	const mask = layerLocalMask( selection, doc, layer );
	const ctx = layer.canvas.getContext( '2d' );
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage( mask, 0, 0 );
	ctx.globalCompositeOperation = 'source-over';
}

/**
 * Scanline flood fill (spec 05.4 Paint Bucket).
 *
 * @param {HTMLCanvasElement} canvas    Target canvas (layer-local).
 * @param {number}            startX    Layer-local x.
 * @param {number}            startY    Layer-local y.
 * @param {string}            fillColor Hex color.
 * @param {Object}            opts      { tolerance 0-255, contiguous, opacity 0-1, mask }.
 * @return {boolean} Whether anything was filled.
 */
export function floodFill( canvas, startX, startY, fillColor, opts = {} ) {
	return fillBucketCanvas( canvas, startX, startY, fillColor, opts );
}

/** Paint from a frozen source at a document-space offset, clipped to selection. */
export function cloneStamp( layer, snapshot, offset, at, opts = {} ) {
	if ( ! layer.canvas ) {
		return;
	}
	const { size = 40, opacity = 1, hardness = 80, mask = null } = opts;
	// Keep the canvas argument supported for existing callers.
	const source = snapshot.layer
		? snapshot
		: { layer: { ...layer, canvas: snapshot } };
	const stamp = drawCloneDab(
		createCanvas( size, size ),
		source,
		{ x: at.x + offset.dx, y: at.y + offset.dy },
		size,
		hardness
	);
	const radius = stamp.width / 2;
	const ctx = layer.canvas.getContext( '2d' );
	ctx.save();
	ctx.globalAlpha = opacity;
	if ( mask ) {
		const scratch = createCanvas( layer.canvas.width, layer.canvas.height );
		const scx = scratch.getContext( '2d' );
		setDocTransform( scx, layer );
		scx.drawImage( stamp, at.x - radius, at.y - radius );
		scx.setTransform( 1, 0, 0, 1, 0, 0 );
		scx.globalCompositeOperation = 'destination-in';
		scx.drawImage( mask, 0, 0 );
		ctx.drawImage( scratch, 0, 0 );
	} else {
		setDocTransform( ctx, layer );
		ctx.drawImage( stamp, at.x - radius, at.y - radius );
	}
	ctx.restore();
}

/**
 * Blur/Sharpen brush stamp (v0.7): applies the effect to a circular
 * region of the layer canvas with a soft edge, one stamp per pointer
 * step, like the clone stamp.
 *
 * @param {Object} layer Raster layer (canvas required).
 * @param {Object} at    Doc-space center point.
 * @param {Object} opts  { mode: blur|sharpen|smudge|dodge|burn|sponge, size,
 *                       strength, hardness, blurRadius, toneRange, preserveAlpha,
 *                       mask (legacy layer-local), docMask, prev (smudge), sponge }.
 * @return {Object} The painted layer, with updated bounds when it grew.
 */
export function effectStamp( layer, at, opts = {} ) {
	if ( ! layer.canvas ) {
		return layer;
	}
	const {
		mode = 'blur',
		size = 40,
		strength = 50,
		hardness = 60,
		mask = null,
	} = opts;
	if ( ! opts.preserveAlpha && [ 'blur', 'smudge' ].includes( mode ) ) {
		layer = growFxBrushLayer( layer, at, size );
	}
	const geometry = {
		...layer,
		w: layer.w ?? layer.canvas.width,
		h: layer.h ?? layer.canvas.height,
	};
	const radius = size / 2;
	const blurRadius = Math.max(
		1,
		Math.min( 50, opts.blurRadius ?? FX_BRUSH_DEFAULTS.blurRadius )
	);
	// Read neighboring pixels beyond the brush circle; the radius must remain
	// independent of the brush size, and the kernel must not clamp at its edge.
	const pad = mode === 'blur' ? effectReach( { radius: blurRadius } ) : 0;
	const center = radius + pad;
	const extent = size + 2 * pad;
	const stamp = createCanvas( extent, extent );
	const sctx = stamp.getContext( '2d' );
	const sourceAt = mode === 'smudge' ? opts.prev || at : at;
	setLayerToDocTransform(
		sctx,
		geometry,
		sourceAt.x - center,
		sourceAt.y - center
	);
	sctx.drawImage( layer.canvas, 0, 0 );
	sctx.setTransform( 1, 0, 0, 1, 0, 0 );
	if ( mode !== 'smudge' ) {
		const img = sctx.getImageData( 0, 0, extent, extent );
		const buffer = { data: img.data, width: extent, height: extent };
		if ( 'sharpen' === mode ) {
			sharpen( buffer, { amount: strength * 2 } );
		} else if ( 'dodge' === mode || 'burn' === mode ) {
			// Lighten or darken (v1.429): a gentle per-stamp factor, the
			// stroke's steps add up the way a real dodge would.
			const k = ( strength / 100 ) * 0.18;
			const d = img.data;
			for ( let i = 0; i < d.length; i += 4 ) {
				const luminance =
					( 0.2126 * d[ i ] +
						0.7152 * d[ i + 1 ] +
						0.0722 * d[ i + 2 ] ) /
					255;
				const weight = fxBrushToneWeight( luminance, opts.toneRange );
				const f = 1 + ( 'dodge' === mode ? k : -k ) * weight;
				d[ i ] = Math.min( 255, d[ i ] * f );
				d[ i + 1 ] = Math.min( 255, d[ i + 1 ] * f );
				d[ i + 2 ] = Math.min( 255, d[ i + 2 ] * f );
			}
		} else if ( 'sponge' === mode ) {
			// Saturate or desaturate around the pixel's own luminance.
			const k =
				( strength / 100 ) *
				0.2 *
				( 'saturate' === opts.sponge ? 1 : -1 );
			const d = img.data;
			for ( let i = 0; i < d.length; i += 4 ) {
				const lum =
					0.2126 * d[ i ] + 0.7152 * d[ i + 1 ] + 0.0722 * d[ i + 2 ];
				d[ i ] = Math.max(
					0,
					Math.min( 255, lum + ( d[ i ] - lum ) * ( 1 + k ) )
				);
				d[ i + 1 ] = Math.max(
					0,
					Math.min( 255, lum + ( d[ i + 1 ] - lum ) * ( 1 + k ) )
				);
				d[ i + 2 ] = Math.max(
					0,
					Math.min( 255, lum + ( d[ i + 2 ] - lum ) * ( 1 + k ) )
				);
			}
		} else {
			gaussianBlur( buffer, { radius: blurRadius } );
		}
		sctx.putImageData( img, 0, 0 );
	}

	// Soft circular edge.
	const inner = Math.min(
		radius - 0.5,
		( radius * Math.min( 100, Math.max( 0, hardness ) ) ) / 100
	);
	const grad = sctx.createRadialGradient(
		center,
		center,
		Math.max( 0, inner ),
		center,
		center,
		radius
	);
	grad.addColorStop( 0, 'rgba(0,0,0,1)' );
	grad.addColorStop( 1, 'rgba(0,0,0,0)' );
	sctx.globalCompositeOperation = 'destination-in';
	sctx.fillStyle = grad;
	sctx.fillRect( 0, 0, extent, extent );
	if ( opts.docMask ) {
		sctx.drawImage( opts.docMask, -( at.x - center ), -( at.y - center ) );
	}

	const ctx = layer.canvas.getContext( '2d' );
	ctx.save();
	if ( 'smudge' === mode || 'blur' === mode ) {
		ctx.globalAlpha = Math.max( 0, Math.min( 1, strength / 100 ) );
	}
	if ( opts.preserveAlpha ) {
		// Source-atop retains every destination alpha, including antialiased edges.
		ctx.globalCompositeOperation = 'source-atop';
	}
	if ( mask ) {
		const scratch = createCanvas( layer.canvas.width, layer.canvas.height );
		const scx = scratch.getContext( '2d' );
		setDocTransform( scx, geometry );
		scx.drawImage( stamp, at.x - center, at.y - center );
		scx.setTransform( 1, 0, 0, 1, 0, 0 );
		scx.globalCompositeOperation = 'destination-in';
		scx.drawImage( mask, 0, 0 );
		ctx.drawImage( scratch, 0, 0 );
	} else {
		setDocTransform( ctx, geometry );
		ctx.drawImage( stamp, at.x - center, at.y - center );
	}
	ctx.restore();
	return layer;
}

/**
 * Mirrored copies of a path string for symmetry painting (v0.7).
 *
 * @param {string} d    Path ('M x y L x y Q …', absolute coords only).
 * @param {number} w    Doc width (x axis mirror line at w/2).
 * @param {number} h    Doc height.
 * @param {string} mode 'x' | 'y' | 'xy'.
 * @return {string[]} Mirrored variants (original not included).
 */
/** Rotational symmetry modes: N copies spinning around the canvas centre. */
export const STAR_SYMMETRY = { r3: 3, r5: 5, r6: 6, r8: 8, r12: 12 };

export function mirrorPathD( d, w, h, mode ) {
	const star = STAR_SYMMETRY[ mode ];
	if ( star ) {
		// Rotation is affine, so transforming every coordinate PAIR keeps
		// the smoothed path's Q control points valid, same as the flips.
		const out = [];
		for ( let k = 1; k < star; k++ ) {
			const ang = ( 2 * Math.PI * k ) / star;
			const cos = Math.cos( ang );
			const sin = Math.sin( ang );
			out.push(
				d.replace(
					/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
					( m, x, y ) => {
						const dx = parseFloat( x ) - w / 2;
						const dy = parseFloat( y ) - h / 2;
						return `${ w / 2 + cos * dx - sin * dy } ${
							h / 2 + sin * dx + cos * dy
						}`;
					}
				)
			);
		}
		return out;
	}
	const flip = ( fx, fy ) =>
		d.replace(
			/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g,
			( m, x, y ) =>
				`${ fx ? w - parseFloat( x ) : parseFloat( x ) } ${
					fy ? h - parseFloat( y ) : parseFloat( y )
				}`
		);
	const out = [];
	if ( 'x' === mode || 'xy' === mode ) {
		out.push( flip( true, false ) );
	}
	if ( 'y' === mode || 'xy' === mode ) {
		out.push( flip( false, true ) );
	}
	if ( 'xy' === mode ) {
		out.push( flip( true, true ) );
	}
	return out;
}
