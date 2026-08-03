/**
 * Image optimization (v1.297): re-encode a canvas as small as possible
 * without a visible difference. No cloud, no WASM - the browser's own
 * encoders (JPEG/WebP) plus a perceptual SSIM search over the quality
 * axis. The "auto" mode binary-searches for the lowest quality whose
 * SSIM against the source stays above a target, which is the whole
 * trick behind commercial optimizers.
 */

/** SSIM constants for 8-bit luma (standard K1/K2 with L = 255). */
const C1 = 6.5025;
const C2 = 58.5225;

/**
 * Mean SSIM between two equal-size luma buffers over 8x8 blocks.
 * Pure math on typed arrays, unit-tested.
 *
 * @param {Float32Array|number[]} a Luma A.
 * @param {Float32Array|number[]} b Luma B.
 * @param {number}                w Width.
 * @param {number}                h Height.
 * @return {number} Mean SSIM in [0, 1] (1 = identical).
 */
export function ssimLuma( a, b, w, h ) {
	const B = 8;
	let sum = 0;
	let blocks = 0;
	for ( let by = 0; by + B <= h; by += B ) {
		for ( let bx = 0; bx + B <= w; bx += B ) {
			let ma = 0;
			let mb = 0;
			for ( let y = 0; y < B; y++ ) {
				const row = ( by + y ) * w + bx;
				for ( let x = 0; x < B; x++ ) {
					ma += a[ row + x ];
					mb += b[ row + x ];
				}
			}
			const n = B * B;
			ma /= n;
			mb /= n;
			let va = 0;
			let vb = 0;
			let cov = 0;
			for ( let y = 0; y < B; y++ ) {
				const row = ( by + y ) * w + bx;
				for ( let x = 0; x < B; x++ ) {
					const da = a[ row + x ] - ma;
					const db = b[ row + x ] - mb;
					va += da * da;
					vb += db * db;
					cov += da * db;
				}
			}
			va /= n - 1;
			vb /= n - 1;
			cov /= n - 1;
			sum +=
				( ( 2 * ma * mb + C1 ) * ( 2 * cov + C2 ) ) /
				( ( ma * ma + mb * mb + C1 ) * ( va + vb + C2 ) );
			blocks++;
		}
	}
	return blocks ? sum / blocks : 1;
}

/** Luma buffer of a canvas, downscaled so the long side is <= max. */
function lumaOf( canvas, max = 256 ) {
	const scale = Math.min( 1, max / Math.max( canvas.width, canvas.height ) );
	const w = Math.max( 8, Math.round( canvas.width * scale ) );
	const h = Math.max( 8, Math.round( canvas.height * scale ) );
	const c = document.createElement( 'canvas' );
	c.width = w;
	c.height = h;
	const ctx = c.getContext( '2d' );
	// White backdrop: JPEG has no alpha, so transparent sources must
	// compare on the same composite both times.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( 0, 0, w, h );
	ctx.drawImage( canvas, 0, 0, w, h );
	const { data } = ctx.getImageData( 0, 0, w, h );
	const luma = new Float32Array( w * h );
	for ( let i = 0; i < luma.length; i++ ) {
		const o = i * 4;
		luma[ i ] =
			0.2126 * data[ o ] +
			0.7152 * data[ o + 1 ] +
			0.0722 * data[ o + 2 ];
	}
	return { luma, w, h };
}

/** canvas.toBlob as a promise. */
function toBlob( canvas, type, quality ) {
	return new Promise( ( resolve ) =>
		canvas.toBlob( resolve, type, quality )
	);
}

/**
 * Encode the canvas as `type`; null when the browser cannot encode it
 * (Safari answers a WebP request with a PNG blob - the type check
 * catches that).
 *
 * @param {HTMLCanvasElement} canvas  Source.
 * @param {string}            type    'image/jpeg' | 'image/webp' | 'image/png'.
 * @param {number}            quality 0..1.
 * @return {Promise<Blob|null>} Encoded blob or null.
 */
export async function encodeCanvas( canvas, type, quality ) {
	const blob = await toBlob( canvas, type, quality );
	return blob && blob.type === type ? blob : null;
}

/** Decode a blob back to a canvas (for the SSIM comparison). */
async function decodeToCanvas( blob ) {
	const bitmap = await createImageBitmap( blob );
	const c = document.createElement( 'canvas' );
	c.width = bitmap.width;
	c.height = bitmap.height;
	c.getContext( '2d' ).drawImage( bitmap, 0, 0 );
	bitmap.close();
	return c;
}

/** Downscale a canvas so its long side is <= maxDim (0 = keep). */
export function fitCanvas( canvas, maxDim ) {
	if ( ! maxDim || Math.max( canvas.width, canvas.height ) <= maxDim ) {
		return canvas;
	}
	const s = maxDim / Math.max( canvas.width, canvas.height );
	const c = document.createElement( 'canvas' );
	c.width = Math.max( 1, Math.round( canvas.width * s ) );
	c.height = Math.max( 1, Math.round( canvas.height * s ) );
	const ctx = c.getContext( '2d' );
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( canvas, 0, 0, c.width, c.height );
	return c;
}

/**
 * Re-encode a canvas as small as possible with no visible difference.
 *
 * @param {HTMLCanvasElement} canvas Source pixels.
 * @param {Object}            opts   Options.
 * @param {string}  opts.format 'auto' (WebP when the browser can encode
 *                              it, else JPEG) | 'webp' | 'jpeg'.
 * @param {string|number} opts.target 'auto' (SSIM search) or a fixed
 *                              quality 1..100.
 * @param {number}  opts.maxDim Downscale so the long side is <= this
 *                              (0 = keep dimensions).
 * @param {number}  opts.ssimTarget Perceptual floor for auto (default
 *                              0.965 - visually lossless territory).
 * @param {Function} opts.encode Optional encoder override with the
 *                              encodeCanvas contract (canvas, type,
 *                              quality) => Blob|null. Lets callers plug
 *                              in better codecs (Pro ships WASM MozJPEG/
 *                              WebP); null must mean "cannot encode".
 * @return {Promise<{blob: Blob, format: string, quality: number,
 *                   ssim: number|null, width: number, height: number}|null>}
 *         Result, or null when nothing could be encoded.
 */
export async function optimizeCanvas( canvas, opts = {} ) {
	const {
		format = 'auto',
		target = 'auto',
		maxDim = 0,
		ssimTarget = 0.965,
		encode = encodeCanvas,
	} = opts;
	const src = fitCanvas( canvas, maxDim );

	// Pick the output codec once: prefer WebP, prove it works.
	let type = 'image/jpeg';
	let name = 'jpeg';
	if ( 'jpeg' !== format ) {
		const probe = await encode( src, 'image/webp', 0.8 );
		if ( probe ) {
			type = 'image/webp';
			name = 'webp';
		} else if ( 'webp' === format ) {
			return null;
		}
	}

	if ( 'auto' !== target ) {
		const q = Math.max( 1, Math.min( 100, Number( target ) || 82 ) ) / 100;
		const blob = await encode( src, type, q );
		return blob
			? {
					blob,
					format: name,
					quality: Math.round( q * 100 ),
					ssim: null,
					width: src.width,
					height: src.height,
			  }
			: null;
	}

	// Auto: binary-search the lowest quality that stays perceptually
	// clean. Six probes pin the quality to ~1 percent.
	const ref = lumaOf( src );
	let lo = 0.45;
	let hi = 0.95;
	let best = null;
	for ( let i = 0; i < 6; i++ ) {
		const q = ( lo + hi ) / 2;
		const blob = await encode( src, type, q );
		if ( ! blob ) {
			return null;
		}
		const decoded = await decodeToCanvas( blob );
		const cand = lumaOf( decoded );
		const ssim = ssimLuma( ref.luma, cand.luma, ref.w, ref.h );
		if ( ssim >= ssimTarget ) {
			best = { blob, quality: Math.round( q * 100 ), ssim };
			hi = q;
		} else {
			lo = q;
		}
	}
	if ( ! best ) {
		// Even 95 was not clean enough (rare, tiny images): take 95.
		const blob = await encode( src, type, 0.95 );
		if ( ! blob ) {
			return null;
		}
		best = { blob, quality: 95, ssim: null };
	}
	return {
		...best,
		format: name,
		width: src.width,
		height: src.height,
	};
}
