/**
 * Local face anonymisation, the canvas half (v1.241.0): Florence-2
 * grounds "human face" boxes (lib/caption.js), these helpers pad the
 * boxes and mosaic-pixelate the regions beyond recognition. Pure canvas
 * work, no model code here, so the math stays Jest-testable.
 */

import { createCanvas } from './raster';

/**
 * Pad a detection box and clamp it to the image, integer pixels. Faces
 * ground tightly; the padding also catches ears, chin and hairline.
 *
 * @param {Object} box  { x1, y1, x2, y2 } in image pixels.
 * @param {number} imgW Image width.
 * @param {number} imgH Image height.
 * @param {number} pad  Padding as a fraction of the box size.
 * @return {?Object} { x, y, w, h } or null for degenerate boxes.
 */
export function padBox( box, imgW, imgH, pad = 0.18 ) {
	const bw = box.x2 - box.x1;
	const bh = box.y2 - box.y1;
	if ( ! ( bw > 1 ) || ! ( bh > 1 ) ) {
		return null;
	}
	const px = bw * pad;
	const py = bh * pad;
	const x = Math.max( 0, Math.floor( box.x1 - px ) );
	const y = Math.max( 0, Math.floor( box.y1 - py ) );
	const w = Math.min( imgW, Math.ceil( box.x2 + px ) ) - x;
	const h = Math.min( imgH, Math.ceil( box.y2 + py ) ) - y;
	return w > 1 && h > 1 ? { x, y, w, h } : null;
}

/**
 * The mosaic cell size for a region: coarse enough that a face is
 * unrecognizable at any region size, never finer than 8px.
 *
 * @param {number} w Region width.
 * @param {number} h Region height.
 * @return {number} Cell size in pixels.
 */
export function mosaicCell( w, h ) {
	return Math.max( 8, Math.round( Math.max( w, h ) / 10 ) );
}

/**
 * Mosaic-pixelate regions of a canvas in place: scale each region down
 * so one pixel spans a whole cell, then scale back up unsmoothed.
 *
 * @param {HTMLCanvasElement} canvas  Canvas to modify.
 * @param {Array}             regions [{ x, y, w, h }] (already clamped).
 */
export function pixelateRegions( canvas, regions ) {
	const ctx = canvas.getContext( '2d' );
	for ( const r of regions ) {
		if ( ! r ) {
			continue;
		}
		const cell = mosaicCell( r.w, r.h );
		const smallW = Math.max( 1, Math.round( r.w / cell ) );
		const smallH = Math.max( 1, Math.round( r.h / cell ) );
		const small = createCanvas( smallW, smallH );
		const sctx = small.getContext( '2d' );
		sctx.imageSmoothingEnabled = true;
		sctx.drawImage( canvas, r.x, r.y, r.w, r.h, 0, 0, smallW, smallH );
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage( small, 0, 0, smallW, smallH, r.x, r.y, r.w, r.h );
		ctx.imageSmoothingEnabled = true;
	}
}
