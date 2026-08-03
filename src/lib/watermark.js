/**
 * Watermark-on-export (v0.3): composites the site-configured watermark
 * image onto an already-rendered export canvas. Pure positioning math so
 * node-canvas can verify corners, scale and opacity.
 */

/**
 * Compute the watermark rect for a given output size.
 *
 * @param {Object} a          Args.
 * @param {number} a.canvasW  Export width.
 * @param {number} a.canvasH  Export height.
 * @param {number} a.imgW     Watermark natural width.
 * @param {number} a.imgH     Watermark natural height.
 * @param {string} a.pos      tl|tr|bl|br|center.
 * @param {number} a.scale    Percent of export width (5–50).
 * @param {number} a.margin   Edge distance in px.
 * @return {{x:number,y:number,w:number,h:number}} Placement.
 */
export function watermarkRect( {
	canvasW,
	canvasH,
	imgW,
	imgH,
	pos,
	scale,
	margin,
} ) {
	const w = Math.max( 1, Math.round( ( canvasW * ( scale || 20 ) ) / 100 ) );
	const h = Math.max( 1, Math.round( ( w * imgH ) / Math.max( 1, imgW ) ) );
	const m = Math.max( 0, margin ?? 16 );
	let x = m;
	let y = m;
	if ( 'tr' === pos || 'br' === pos ) {
		x = canvasW - w - m;
	}
	if ( 'bl' === pos || 'br' === pos ) {
		y = canvasH - h - m;
	}
	if ( 'center' === pos ) {
		x = Math.round( ( canvasW - w ) / 2 );
		y = Math.round( ( canvasH - h ) / 2 );
	}
	return { x, y, w, h };
}

/**
 * Draw the watermark onto a rendered export canvas (mutates the canvas).
 *
 * @param {HTMLCanvasElement}          canvas Rendered export.
 * @param {HTMLImageElement|HTMLCanvasElement} img Watermark image (needs width/height or natural*).
 * @param {Object}                     opts   {pos, scale, opacity, margin} from settings.
 * @return {HTMLCanvasElement} The same canvas.
 */
export function applyWatermark( canvas, img, opts = {} ) {
	const imgW = img.naturalWidth || img.width;
	const imgH = img.naturalHeight || img.height;
	if ( ! imgW || ! imgH ) {
		return canvas;
	}
	const rect = watermarkRect( {
		canvasW: canvas.width,
		canvasH: canvas.height,
		imgW,
		imgH,
		pos: opts.pos || 'br',
		scale: opts.scale,
		margin: opts.margin,
	} );
	const ctx = canvas.getContext( '2d' );
	ctx.save();
	ctx.globalAlpha = Math.min(
		1,
		Math.max( 0, ( opts.opacity ?? 70 ) / 100 )
	);
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( img, rect.x, rect.y, rect.w, rect.h );
	ctx.restore();
	return canvas;
}
