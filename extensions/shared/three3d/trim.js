/**
 * Alpha trim for baked renders: find the opaque bounding box of an RGBA
 * buffer and crop a canvas to it (plus a margin). The scan is pure math,
 * split out so `node --test` covers it without a DOM.
 */

/**
 * Bounding box of all pixels with alpha above the threshold.
 *
 * @param {Uint8ClampedArray} data      RGBA pixels.
 * @param {number}            width     Buffer width.
 * @param {number}            height    Buffer height.
 * @param {number}            threshold Alpha must exceed this (0-255).
 * @return {Object|null} {x0, y0, x1, y1} inclusive, or null when empty.
 */
export function alphaBounds( data, width, height, threshold = 4 ) {
	let x0 = width;
	let y0 = height;
	let x1 = -1;
	let y1 = -1;
	for ( let y = 0; y < height; y++ ) {
		const row = y * width * 4;
		for ( let x = 0; x < width; x++ ) {
			if ( data[ row + x * 4 + 3 ] > threshold ) {
				if ( x < x0 ) {
					x0 = x;
				}
				if ( x > x1 ) {
					x1 = x;
				}
				if ( y < y0 ) {
					y0 = y;
				}
				y1 = y;
			}
		}
	}
	return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/**
 * Crop a canvas to its visible content plus a margin. Returns the input
 * canvas unchanged when it is fully transparent.
 *
 * @param {HTMLCanvasElement} canvas            Source canvas.
 * @param {Object}            [opts]            Options.
 * @param {number}            [opts.threshold]  Alpha threshold (0-255).
 * @param {number}            [opts.margin]     Margin in pixels.
 * @return {HTMLCanvasElement} Trimmed canvas (or the input).
 */
export function trimCanvas( canvas, { threshold = 4, margin = 0 } = {} ) {
	const ctx = canvas.getContext( '2d' );
	const { data } = ctx.getImageData( 0, 0, canvas.width, canvas.height );
	const b = alphaBounds( data, canvas.width, canvas.height, threshold );
	if ( ! b ) {
		return canvas;
	}
	const x0 = Math.max( 0, b.x0 - margin );
	const y0 = Math.max( 0, b.y0 - margin );
	const x1 = Math.min( canvas.width - 1, b.x1 + margin );
	const y1 = Math.min( canvas.height - 1, b.y1 + margin );
	const out = document.createElement( 'canvas' );
	out.width = x1 - x0 + 1;
	out.height = y1 - y0 + 1;
	out.getContext( '2d' ).drawImage(
		canvas,
		x0,
		y0,
		out.width,
		out.height,
		0,
		0,
		out.width,
		out.height
	);
	return out;
}
