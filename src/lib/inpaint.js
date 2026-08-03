/**
 * Local content-aware fill (v0.6): onion-peel inpainting, the masked
 * region is filled inward from its boundary by averaging known neighbors,
 * then smoothed inside the mask. No network, no models; good for removing
 * objects from reasonably uniform backgrounds.
 */

/**
 * Fill masked pixels in place.
 *
 * @param {Object}     img  { data: Uint8ClampedArray, width, height }.
 * @param {Uint8Array} mask Same size (w*h); >0 = pixel to fill.
 * @param {Object} opts              Options.
 * @param {number} opts.smoothPasses Blur passes inside the mask.
 * @return {Object} The same img.
 */
export function inpaintRegion( img, mask, { smoothPasses = 2 } = {} ) {
	const { data, width: w, height: h } = img;
	const unknown = new Uint8Array( mask ); // 1 = still to fill
	for ( let i = 0; i < unknown.length; i++ ) {
		unknown[ i ] = mask[ i ] ? 1 : 0;
	}

	// Peel: repeatedly fill unknown pixels that touch known ones.
	let remaining = 1;
	let guard = Math.max( w, h ) + 2;
	while ( remaining && guard-- ) {
		remaining = 0;
		const filledThisPass = [];
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				const p = y * w + x;
				if ( ! unknown[ p ] ) {
					continue;
				}
				let r = 0;
				let g = 0;
				let b = 0;
				let a = 0;
				let n = 0;
				for ( let dy = -1; dy <= 1; dy++ ) {
					for ( let dx = -1; dx <= 1; dx++ ) {
						if ( ! dx && ! dy ) {
							continue;
						}
						const nx = x + dx;
						const ny = y + dy;
						if ( nx < 0 || ny < 0 || nx >= w || ny >= h ) {
							continue;
						}
						const q = ny * w + nx;
						if ( unknown[ q ] ) {
							continue;
						}
						const j = q * 4;
						r += data[ j ];
						g += data[ j + 1 ];
						b += data[ j + 2 ];
						a += data[ j + 3 ];
						n++;
					}
				}
				if ( n >= 2 ) {
					const i = p * 4;
					data[ i ] = r / n;
					data[ i + 1 ] = g / n;
					data[ i + 2 ] = b / n;
					data[ i + 3 ] = a / n;
					filledThisPass.push( p );
				} else {
					remaining++;
				}
			}
		}
		for ( const p of filledThisPass ) {
			unknown[ p ] = 0;
		}
		if ( ! filledThisPass.length ) {
			break; // nothing reachable (fully unknown image)
		}
	}

	// Smooth inside the mask so the seams blend.
	for ( let pass = 0; pass < smoothPasses; pass++ ) {
		const src = new Uint8ClampedArray( data );
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const p = y * w + x;
				if ( ! mask[ p ] ) {
					continue;
				}
				const i = p * 4;
				for ( let c = 0; c < 4; c++ ) {
					data[ i + c ] =
						( src[ i + c ] * 4 +
							src[ i - 4 + c ] +
							src[ i + 4 + c ] +
							src[ i - w * 4 + c ] +
							src[ i + w * 4 + c ] ) /
						8;
				}
			}
		}
	}
	return img;
}
