/**
 * Mask morphology (v1.429): grow, shrink, smooth and outline the white
 * area of a mask canvas. Used by the cut-out (Smart Select's grow and
 * shrink) and by Select > Modify for any selection.
 */

import { createCanvas } from './raster';

/**
 * Grow (expand > 0) or shrink (< 0) the white area of a mask canvas.
 *
 * @param {HTMLCanvasElement} canvas Mask (alpha = coverage).
 * @param {number}            expand Pixels, negative shrinks.
 * @return {HTMLCanvasElement} A new mask canvas (or the input when 0).
 */
export function morphMaskCanvas( canvas, expand ) {
	if ( ! expand ) {
		return canvas;
	}
	const w = canvas.width;
	const h = canvas.height;
	const ctx = canvas.getContext( '2d' );
	const img = ctx.getImageData( 0, 0, w, h );
	const a = img.data;
	// Chamfer distance transform (3-4 weights, two passes): dist[i] is
	// ~3x the pixel distance to the nearest pixel OUTSIDE the region we
	// measure from. Exact enough for a px-accurate grow/shrink and O(n).
	// Seeds (distance 0) are the region we measure FROM: the kept area
	// when growing, the outside when shrinking.
	const seed = ( i ) =>
		expand > 0 ? a[ i * 4 + 3 ] > 127 : a[ i * 4 + 3 ] <= 127;
	const INF = 1 << 29;
	const dist = new Int32Array( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		dist[ i ] = seed( i ) ? 0 : INF;
	}
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if ( ! dist[ i ] ) {
				continue;
			}
			let d = dist[ i ];
			if ( x > 0 ) {
				d = Math.min( d, dist[ i - 1 ] + 3 );
			}
			if ( y > 0 ) {
				d = Math.min( d, dist[ i - w ] + 3 );
				if ( x > 0 ) {
					d = Math.min( d, dist[ i - w - 1 ] + 4 );
				}
				if ( x < w - 1 ) {
					d = Math.min( d, dist[ i - w + 1 ] + 4 );
				}
			}
			dist[ i ] = d;
		}
	}
	for ( let y = h - 1; y >= 0; y-- ) {
		for ( let x = w - 1; x >= 0; x-- ) {
			const i = y * w + x;
			if ( ! dist[ i ] ) {
				continue;
			}
			let d = dist[ i ];
			if ( x < w - 1 ) {
				d = Math.min( d, dist[ i + 1 ] + 3 );
			}
			if ( y < h - 1 ) {
				d = Math.min( d, dist[ i + w ] + 3 );
				if ( x < w - 1 ) {
					d = Math.min( d, dist[ i + w + 1 ] + 4 );
				}
				if ( x > 0 ) {
					d = Math.min( d, dist[ i + w - 1 ] + 4 );
				}
			}
			dist[ i ] = d;
		}
	}
	// Grow: everything within `expand` px of the region joins it.
	// Shrink: everything within |expand| px of the OUTSIDE leaves it.
	const limit = Math.abs( expand ) * 3;
	for ( let i = 0; i < w * h; i++ ) {
		const nowInside =
			expand > 0
				? a[ i * 4 + 3 ] > 127 || dist[ i ] <= limit
				: a[ i * 4 + 3 ] > 127 && dist[ i ] > limit;
		a[ i * 4 ] = a[ i * 4 + 1 ] = a[ i * 4 + 2 ] = 255;
		a[ i * 4 + 3 ] = nowInside ? 255 : 0;
	}
	const out = createCanvas( w, h );
	out.getContext( '2d' ).putImageData( img, 0, 0 );
	return out;
}

/**
 * Smooth the outline: blur the mask by the radius and threshold it, which
 * rounds corners and drops specks smaller than the radius.
 *
 * @param {HTMLCanvasElement} canvas Mask.
 * @param {number}            radius Pixels.
 * @return {HTMLCanvasElement} A new mask canvas.
 */
export function smoothMaskCanvas( canvas, radius ) {
	const r = Math.max( 0, Number( radius ) || 0 );
	if ( ! r ) {
		return canvas;
	}
	const w = canvas.width;
	const h = canvas.height;
	const blurred = createCanvas( w, h );
	const bctx = blurred.getContext( '2d' );
	if ( 'filter' in bctx ) {
		bctx.filter = `blur(${ r }px)`;
		bctx.drawImage( canvas, 0, 0 );
		bctx.filter = 'none';
	} else {
		bctx.drawImage( canvas, 0, 0 );
	}
	const img = bctx.getImageData( 0, 0, w, h );
	const a = img.data;
	for ( let i = 0; i < a.length; i += 4 ) {
		const inside = a[ i + 3 ] > 127;
		a[ i ] = a[ i + 1 ] = a[ i + 2 ] = 255;
		a[ i + 3 ] = inside ? 255 : 0;
	}
	const out = createCanvas( w, h );
	out.getContext( '2d' ).putImageData( img, 0, 0 );
	return out;
}

/**
 * A band of the given width along the outline: grown minus shrunk.
 *
 * @param {HTMLCanvasElement} canvas Mask.
 * @param {number}            width  Band width in px.
 * @return {HTMLCanvasElement} A new mask canvas.
 */
export function borderMaskCanvas( canvas, width ) {
	const half = Math.max( 1, Math.round( ( Number( width ) || 0 ) / 2 ) );
	const grown = morphMaskCanvas( canvas, half );
	const shrunk = morphMaskCanvas( canvas, -half );
	const out = createCanvas( canvas.width, canvas.height );
	const ctx = out.getContext( '2d' );
	ctx.drawImage( grown, 0, 0 );
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage( shrunk, 0, 0 );
	return out;
}

/**
 * Bounding box of the white area, or null when the mask is empty.
 *
 * @param {HTMLCanvasElement} canvas Mask.
 * @return {?{x:number,y:number,w:number,h:number}} Bounds.
 */
export function maskBounds( canvas ) {
	const w = canvas.width;
	const h = canvas.height;
	const a = canvas.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( a[ ( y * w + x ) * 4 + 3 ] > 127 ) {
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
	return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
