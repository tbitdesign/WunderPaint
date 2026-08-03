/**
 * Smart Recrop client math (v1.375.0): the crop-window helpers for the
 * per-size thumbnail recrop dialog. fitRectToRatio mirrors the PHP
 * Media_Recrop::fit_rect exactly - the preview must predict what the
 * server will cut, or the saved thumbnail differs from what was shown.
 */

/**
 * Snap a crop box to a target ratio: keep its center, cover as much as
 * possible, stay inside the image. Mirror of PHP fit_rect.
 *
 * @param {Object} rect  { x, y, w, h } in full-image pixels.
 * @param {number} ratio Target width / height.
 * @param {number} imgW  Image width.
 * @param {number} imgH  Image height.
 * @return {Object} { x, y, w, h } integers, ratio-true, in bounds.
 */
export function fitRectToRatio( rect, ratio, imgW, imgH ) {
	const r = ratio > 0 ? ratio : 1;
	let w = Math.max( 1, rect.w || 0 );
	let h = Math.max( 1, rect.h || 0 );
	const cx = ( rect.x || 0 ) + w / 2;
	const cy = ( rect.y || 0 ) + h / 2;
	if ( w / h > r ) {
		h = w / r;
	} else {
		w = h * r;
	}
	const scale = Math.min( 1, imgW / w, imgH / h );
	w *= scale;
	h *= scale;
	let x = Math.max( 0, Math.min( cx - w / 2, imgW - w ) );
	let y = Math.max( 0, Math.min( cy - h / 2, imgH - h ) );
	w = Math.round( w );
	h = Math.round( h );
	x = Math.max( 0, Math.min( Math.round( x ), imgW - w ) );
	y = Math.max( 0, Math.min( Math.round( y ), imgH - h ) );
	return { x, y, w, h };
}

/**
 * Crop window from a detected subject box: pad it a little, then cover
 * it at the target ratio.
 *
 * @param {Object} bbox  Subject bounds { x, y, w, h }.
 * @param {number} ratio Target width / height.
 * @param {number} imgW  Image width.
 * @param {number} imgH  Image height.
 * @param {number} pad   Padding as a fraction of the box size.
 * @return {Object} { x, y, w, h }.
 */
export function autoRect( bbox, ratio, imgW, imgH, pad = 0.12 ) {
	const px = bbox.w * pad;
	const py = bbox.h * pad;
	return fitRectToRatio(
		{
			x: bbox.x - px,
			y: bbox.y - py,
			w: bbox.w + 2 * px,
			h: bbox.h + 2 * py,
		},
		ratio,
		imgW,
		imgH
	);
}

/**
 * Bounding box of the subject in an alpha map (as computeSubjectAlpha
 * returns it: a size x size float array), scaled to image pixels.
 *
 * @param {Object} alphaMap  { alpha: Float32Array|Array, size: number }.
 * @param {number} imgW      Image width.
 * @param {number} imgH      Image height.
 * @param {number} threshold Alpha cutoff.
 * @return {?Object} { x, y, w, h } or null when nothing is detected.
 */
export function alphaBBox( alphaMap, imgW, imgH, threshold = 0.4 ) {
	const { alpha, size } = alphaMap;
	let minX = size;
	let minY = size;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < size; y++ ) {
		for ( let x = 0; x < size; x++ ) {
			if ( alpha[ y * size + x ] >= threshold ) {
				if ( x < minX ) {
					minX = x;
				}
				if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				}
				if ( y > maxY ) {
					maxY = y;
				}
			}
		}
	}
	if ( maxX < 0 ) {
		return null;
	}
	const sx = imgW / size;
	const sy = imgH / size;
	return {
		x: minX * sx,
		y: minY * sy,
		w: ( maxX - minX + 1 ) * sx,
		h: ( maxY - minY + 1 ) * sy,
	};
}
