/**
 * Subject masks at full sharpness (20.10.2026).
 *
 * The local subject model (U2-Netp) answers with a 320 x 320 mask. Scaled
 * up to a photo it is soft: hair, fur and every fine contour came out as a
 * blurry band several pixels wide, which is what made Remove Background
 * look cheap. The mask is now refined against the picture itself with a
 * guided filter (He, Sun and Tang): inside a small window the mask becomes
 * a linear function of the picture's brightness, so where the picture has
 * an edge, the mask gets one exactly there, and where the picture is flat,
 * the mask stays as the model drew it. No model, no download.
 *
 * Every subject look (Remove Background, portrait blur, Color Pop, product
 * shot, neon rim, speed blur) and Select Subject draw their mask from
 * subjectMaskCanvas(). The bounding-box users (Crop to Subject, the
 * thumbnail framing) keep the coarse map, a box needs no sharp edge.
 *
 * A map from the better cutout model (BiRefNet, lib/subject-model.js) says
 * refine: false and is only scaled up: it already has its edges, and the
 * filter made holes in a beard and lost loose hair on it.
 */

import { createCanvas } from './raster';

/**
 * Long side the refinement works at; larger pictures are refined there
 * and scaled up, which keeps it well under a second.
 */
export const REFINE_MAX_SIDE = 2048;
const EPS = 1e-4;

/**
 * Mean over the (2r+1) x (2r+1) window, clamped at the borders (the mean
 * of the pixels that exist). Two passes of running sums: O(w * h).
 *
 * @param {Float32Array} src Values, w * h.
 * @param {number}       w   Width.
 * @param {number}       h   Height.
 * @param {number}       r   Radius.
 * @return {Float32Array} Means.
 */
export function boxFilter( src, w, h, r ) {
	const out = new Float32Array( w * h );
	// Window sizes per position, worked out once (they only differ near
	// the borders).
	const invX = new Float32Array( w );
	for ( let x = 0; x < w; x++ ) {
		invX[ x ] = 1 / ( Math.min( w - 1, x + r ) - Math.max( 0, x - r ) + 1 );
	}
	// Columns first, as running sums over whole rows: every step reads and
	// writes memory in order. Walking down each column instead jumps a row
	// per step and was more than ten times slower on photo-sized masks.
	const colSum = new Float64Array( w );
	const top = Math.min( r, h - 1 );
	for ( let y = 0; y <= top; y++ ) {
		const row = y * w;
		for ( let x = 0; x < w; x++ ) {
			colSum[ x ] += src[ row + x ];
		}
	}
	const line = new Float64Array( w );
	for ( let y = 0; y < h; y++ ) {
		const invY =
			1 / ( Math.min( h - 1, y + r ) - Math.max( 0, y - r ) + 1 );
		for ( let x = 0; x < w; x++ ) {
			line[ x ] = colSum[ x ] * invY;
		}
		// Then the row: a running sum along the averaged line.
		const row = y * w;
		let sum = 0;
		const first = Math.min( r, w - 1 );
		for ( let x = 0; x <= first; x++ ) {
			sum += line[ x ];
		}
		for ( let x = 0; x < w; x++ ) {
			out[ row + x ] = sum * invX[ x ];
			const add = x + r + 1;
			if ( add < w ) {
				sum += line[ add ];
			}
			const drop = x - r;
			if ( drop >= 0 ) {
				sum -= line[ drop ];
			}
		}
		// Slide the column window down one row.
		const addY = y + r + 1;
		if ( addY < h ) {
			const rowAdd = addY * w;
			for ( let x = 0; x < w; x++ ) {
				colSum[ x ] += src[ rowAdd + x ];
			}
		}
		const dropY = y - r;
		if ( dropY >= 0 ) {
			const rowDrop = dropY * w;
			for ( let x = 0; x < w; x++ ) {
				colSum[ x ] -= src[ rowDrop + x ];
			}
		}
	}
	return out;
}

/**
 * Guided filter with a grey guide: the mask p follows the edges of I.
 *
 * @param {Float32Array} I   Guide (brightness 0..1), w * h.
 * @param {Float32Array} p   Mask to refine (0..1), w * h.
 * @param {number}       w   Width.
 * @param {number}       h   Height.
 * @param {number}       r   Window radius.
 * @param {number}       eps Regularisation; smaller follows edges harder.
 * @return {Float32Array} Refined mask, clamped to 0..1.
 */
export function guidedFilter( I, p, w, h, r, eps = EPS ) {
	const n = w * h;
	const Ip = new Float32Array( n );
	const II = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		Ip[ i ] = I[ i ] * p[ i ];
		II[ i ] = I[ i ] * I[ i ];
	}
	const mI = boxFilter( I, w, h, r );
	const mp = boxFilter( p, w, h, r );
	const mIp = boxFilter( Ip, w, h, r );
	const mII = boxFilter( II, w, h, r );
	const a = Ip; // reused buffers
	const b = II;
	for ( let i = 0; i < n; i++ ) {
		const varI = mII[ i ] - mI[ i ] * mI[ i ];
		const cov = mIp[ i ] - mI[ i ] * mp[ i ];
		a[ i ] = cov / ( varI + eps );
		b[ i ] = mp[ i ] - a[ i ] * mI[ i ];
	}
	const ma = boxFilter( a, w, h, r );
	const mb = boxFilter( b, w, h, r );
	const q = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		const v = ma[ i ] * I[ i ] + mb[ i ];
		q[ i ] = v < 0 ? 0 : v > 1 ? 1 : v;
	}
	return q;
}

const GAIN = 1.6;
const tighten = ( q ) => {
	for ( let i = 0; i < q.length; i++ ) {
		const v = ( q[ i ] - 0.5 ) * GAIN + 0.5;
		q[ i ] = v < 0 ? 0 : v > 1 ? 1 : v;
	}
	return q;
};

/**
 * The refinement itself: guided filter, a gentle tightening towards the
 * middle, and once more. Measured on test pictures (20.10.2026) with the
 * model's edge 4 or 6 px beside the real one and a soft model ramp: one
 * pass moved the edge only half-way and left a 7 to 11 px half-transparent
 * band; two passes put it on the picture's edge every time, the band down
 * to 0 to 5 px, and thin hair strands in the picture kept their own alpha.
 *
 * @param {Float32Array} I      Guide (brightness 0..1), w * h.
 * @param {Float32Array} coarse Upsampled model mask, w * h.
 * @param {number}       w      Width.
 * @param {number}       h      Height.
 * @param {number}       r      Window radius (refineRadius()).
 * @return {Float32Array} Refined mask.
 */
export function refineMask( I, coarse, w, h, r ) {
	const first = tighten( guidedFilter( I, coarse, w, h, r ) );
	return tighten( guidedFilter( I, first, w, h, r ) );
}

/**
 * Bilinear upsampling of a small mask (pixel centres aligned).
 *
 * @param {Float32Array} src  Mask, sw * sh.
 * @param {number}       sw   Source width.
 * @param {number}       sh   Source height.
 * @param {number}       w    Target width.
 * @param {number}       h    Target height.
 * @return {Float32Array} w * h.
 */
export function upsampleBilinear( src, sw, sh, w, h ) {
	const out = new Float32Array( w * h );
	const fx = sw / w,
		fy = sh / h;
	// Source columns and weights per target column, worked out once.
	const x0s = new Int32Array( w ),
		x1s = new Int32Array( w ),
		txs = new Float32Array( w );
	for ( let x = 0; x < w; x++ ) {
		const sx = Math.min( sw - 1, Math.max( 0, ( x + 0.5 ) * fx - 0.5 ) );
		x0s[ x ] = Math.floor( sx );
		x1s[ x ] = Math.min( sw - 1, x0s[ x ] + 1 );
		txs[ x ] = sx - x0s[ x ];
	}
	for ( let y = 0; y < h; y++ ) {
		const sy = Math.min( sh - 1, Math.max( 0, ( y + 0.5 ) * fy - 0.5 ) );
		const y0 = Math.floor( sy ),
			ty = sy - y0;
		const r0 = y0 * sw,
			r1 = Math.min( sh - 1, y0 + 1 ) * sw;
		const row = y * w;
		for ( let x = 0; x < w; x++ ) {
			const a = x0s[ x ],
				b = x1s[ x ],
				tx = txs[ x ];
			const top = src[ r0 + a ] + ( src[ r0 + b ] - src[ r0 + a ] ) * tx;
			const bot = src[ r1 + a ] + ( src[ r1 + b ] - src[ r1 + a ] ) * tx;
			out[ row + x ] = top + ( bot - top ) * ty;
		}
	}
	return out;
}

/**
 * Window radius for refining: twice the width of one model-mask pixel at
 * the working size, so the window spans the blurry band the upscale left.
 *
 * @param {number} side     Long side of the working picture.
 * @param {number} maskSide Side of the model's mask.
 * @return {number} Radius in pixels, 2 .. 24.
 */
export function refineRadius( side, maskSide ) {
	return Math.max( 2, Math.min( 24, Math.round( ( 2 * side ) / maskSide ) ) );
}

/**
 * The subject mask for a picture as a w x h canvas (white, the mask in the
 * alpha channel), refined against the picture.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} source The picture.
 * @param {number}            w        Its width.
 * @param {number}            h        Its height.
 * @param {Object}            alphaMap { alpha: Float32Array, size,
 *                                     refine } from the model (square);
 *                                     refine: false skips the filter.
 * @return {HTMLCanvasElement} Mask canvas.
 */
export function subjectMaskCanvas( source, w, h, alphaMap ) {
	const k = Math.min( 1, REFINE_MAX_SIDE / Math.max( w, h ) );
	const ww = Math.max( 1, Math.round( w * k ) ),
		hh = Math.max( 1, Math.round( h * k ) );
	const work = createCanvas( ww, hh );
	const wctx = work.getContext( '2d' );
	wctx.drawImage( source, 0, 0, ww, hh );
	const px = wctx.getImageData( 0, 0, ww, hh ).data;
	const guide = new Float32Array( ww * hh );
	for ( let i = 0, j = 0; i < guide.length; i++, j += 4 ) {
		guide[ i ] =
			( 0.299 * px[ j ] + 0.587 * px[ j + 1 ] + 0.114 * px[ j + 2 ] ) /
			255;
	}
	const coarse = upsampleBilinear(
		alphaMap.alpha,
		alphaMap.size,
		alphaMap.size,
		ww,
		hh
	);
	const q =
		false === alphaMap.refine
			? coarse
			: refineMask(
					guide,
					coarse,
					ww,
					hh,
					refineRadius( Math.max( ww, hh ), alphaMap.size )
			  );
	const maskImg = wctx.createImageData( ww, hh );
	for ( let i = 0, j = 0; i < q.length; i++, j += 4 ) {
		maskImg.data[ j ] = 255;
		maskImg.data[ j + 1 ] = 255;
		maskImg.data[ j + 2 ] = 255;
		maskImg.data[ j + 3 ] = Math.round( q[ i ] * 255 );
	}
	wctx.clearRect( 0, 0, ww, hh );
	wctx.putImageData( maskImg, 0, 0 );
	if ( ww === w && hh === h ) {
		return work;
	}
	const full = createCanvas( w, h );
	const fctx = full.getContext( '2d' );
	fctx.imageSmoothingEnabled = true;
	fctx.imageSmoothingQuality = 'high';
	fctx.drawImage( work, 0, 0, w, h );
	return full;
}
