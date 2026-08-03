/**
 * Image fit (v1.69): how an image source maps into its layer box.
 * `layer.imageFit = { mode, ax, ay, zoom }` — mode 'fill' (stretch, the legacy
 * default), 'cover' (crop to fill) or 'contain' (letterbox); ax/ay anchor
 * the crop/placement (0 = left/top, 0.5 = center, 1 = right/bottom).
 *
 * Leaf module: pure math, no DOM/editor imports (jest-safe).
 */

/**
 * Source and destination rectangles for a fitted draw.
 *
 * @param {number} sw  Source width (natural pixels).
 * @param {number} sh  Source height.
 * @param {number} dw  Destination box width.
 * @param {number} dh  Destination box height.
 * @param {Object} fit Optional { mode, ax, ay }.
 * @return {Object} { sx, sy, sw, sh, dx, dy, dw, dh } for drawImage.
 */
export function fitRects( sw, sh, dw, dh, fit ) {
	const mode = fit?.mode || 'fill';
	if ( 'fill' === mode || ! sw || ! sh || ! dw || ! dh ) {
		return { sx: 0, sy: 0, sw, sh, dx: 0, dy: 0, dw, dh };
	}
	const ax = 'number' === typeof fit.ax ? fit.ax : 0.5;
	const ay = 'number' === typeof fit.ay ? fit.ay : 0.5;
	if ( 'cover' === mode ) {
		// Source window (at box aspect) that fills the whole box; an
		// optional zoom (>= 1, v1.116.1) magnifies inside the frame.
		const zoom = Math.max( 1, Number( fit.zoom ) || 1 );
		const scale = Math.max( dw / sw, dh / sh ) * zoom;
		const cw = dw / scale;
		const ch = dh / scale;
		return {
			sx: ( sw - cw ) * ax,
			sy: ( sh - ch ) * ay,
			sw: cw,
			sh: ch,
			dx: 0,
			dy: 0,
			dw,
			dh,
		};
	}
	// contain: whole source, letterboxed inside the box.
	const scale = Math.min( dw / sw, dh / sh );
	const cw = sw * scale;
	const ch = sh * scale;
	return {
		sx: 0,
		sy: 0,
		sw,
		sh,
		dx: ( dw - cw ) * ax,
		dy: ( dh - ch ) * ay,
		dw: cw,
		dh: ch,
	};
}

/**
 * drawImage honoring a fit spec.
 *
 * @param {CanvasRenderingContext2D}       ctx    Target context.
 * @param {Object}                         source Image or canvas.
 * @param {number}                         sw     Source natural width.
 * @param {number}                         sh     Source natural height.
 * @param {number}                         dw     Box width.
 * @param {number}                         dh     Box height.
 * @param {Object}                         fit    Optional { mode, ax, ay }.
 */
export function drawImageFitted( ctx, source, sw, sh, dw, dh, fit ) {
	const r = fitRects( sw, sh, dw, dh, fit );
	if ( r.sw <= 0 || r.sh <= 0 || r.dw <= 0 || r.dh <= 0 ) {
		return;
	}
	ctx.drawImage( source, r.sx, r.sy, r.sw, r.sh, r.dx, r.dy, r.dw, r.dh );
}
