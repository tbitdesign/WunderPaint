/**
 * Color Pop pixel blend (v1.375.1): the subject keeps its colors, the
 * background drops to luma gray, soft mask edges blend between the two.
 * Pure array math so Jest can hold the formula; the canvas/model half
 * lives in local-image-ops.js.
 */

/**
 * Blend an image toward gray outside the subject, in place.
 *
 * @param {Uint8ClampedArray} img   RGBA pixels, mutated.
 * @param {Uint8ClampedArray} alpha RGBA pixels of the mask canvas; only
 *                                  the alpha channel is read (255 =
 *                                  subject, 0 = background).
 * @return {Uint8ClampedArray} The same array.
 */
export function popPixels( img, alpha ) {
	for ( let i = 0; i < img.length; i += 4 ) {
		const a = alpha[ i + 3 ] / 255;
		if ( a >= 1 ) {
			continue;
		}
		const r = img[ i ];
		const g = img[ i + 1 ];
		const b = img[ i + 2 ];
		const gray = Math.round( 0.299 * r + 0.587 * g + 0.114 * b );
		img[ i ] = Math.round( gray + ( r - gray ) * a );
		img[ i + 1 ] = Math.round( gray + ( g - gray ) * a );
		img[ i + 2 ] = Math.round( gray + ( b - gray ) * a );
	}
	return img;
}
