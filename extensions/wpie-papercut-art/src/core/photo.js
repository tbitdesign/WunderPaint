/**
 * Photo slicing: brightness bands become paper depth layers.
 *
 * Pure array math - the UI hands in a Float32 luminance map (already
 * downscaled and blurred), this module answers with band masks. In a
 * misty landscape, atmospheric perspective means far = bright, so the
 * slices ARE depth layers almost by themselves.
 */

/** Luminance 0..1 from RGBA bytes. */
export function lumaOf( rgba, w, h ) {
	const out = new Float32Array( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		out[ i ] =
			( rgba[ i * 4 ] * 0.2126 +
				rgba[ i * 4 + 1 ] * 0.7152 +
				rgba[ i * 4 + 2 ] * 0.0722 ) /
			255;
	}
	return out;
}

/** Simple separable box blur, radius in px, run twice for smoothness. */
export function blurLuma( luma, w, h, r ) {
	if ( r < 1 ) {
		return luma;
	}
	let src = luma;
	for ( let pass = 0; pass < 2; pass++ ) {
		const tmp = new Float32Array( w * h );
		for ( let y = 0; y < h; y++ ) {
			let acc = 0;
			for ( let x = -r; x <= r; x++ ) {
				acc += src[ y * w + Math.max( 0, Math.min( w - 1, x ) ) ];
			}
			for ( let x = 0; x < w; x++ ) {
				tmp[ y * w + x ] = acc / ( 2 * r + 1 );
				const add = Math.min( w - 1, x + r + 1 );
				const sub = Math.max( 0, x - r );
				acc += src[ y * w + add ] - src[ y * w + sub ];
			}
		}
		const out = new Float32Array( w * h );
		for ( let x = 0; x < w; x++ ) {
			let acc = 0;
			for ( let y = -r; y <= r; y++ ) {
				acc += tmp[ Math.max( 0, Math.min( h - 1, y ) ) * w + x ];
			}
			for ( let y = 0; y < h; y++ ) {
				out[ y * w + x ] = acc / ( 2 * r + 1 );
				const add = Math.min( h - 1, y + r + 1 );
				const sub = Math.max( 0, y - r );
				acc += tmp[ add * w + x ] - tmp[ sub * w + x ];
			}
		}
		src = out;
	}
	return src;
}

/** 64-bin histogram of a luminance map. */
export function histogram( luma ) {
	const bins = new Float32Array( 64 );
	for ( let i = 0; i < luma.length; i++ ) {
		bins[ Math.max( 0, Math.min( 63, Math.floor( luma[ i ] * 64 ) ) ) ]++;
	}
	const max = Math.max( 1, ...bins );
	for ( let i = 0; i < 64; i++ ) {
		bins[ i ] /= max;
	}
	return bins;
}

/**
 * Default thresholds for n bands: brightness quantiles, so every sheet
 * gets a fair share of the picture no matter how it is exposed.
 *
 * @param {Float32Array} luma  Map.
 * @param {number}       bands Sheet count (2..8).
 * @return {number[]} Ascending thresholds, length bands-1.
 */
export function autoThresholds( luma, bands ) {
	const sorted = Float32Array.from( luma ).sort();
	const out = [];
	for ( let k = 1; k < bands; k++ ) {
		out.push(
			sorted[ Math.floor( ( k / bands ) * ( sorted.length - 1 ) ) ]
		);
	}
	// Strictly ascending, clamped away from the ends.
	for ( let i = 0; i < out.length; i++ ) {
		const lo = 0.02 + i * 0.01;
		const hi = 0.98 - ( out.length - 1 - i ) * 0.01;
		out[ i ] = Math.max( lo, Math.min( hi, out[ i ] ) );
		if ( i && out[ i ] <= out[ i - 1 ] ) {
			out[ i ] = out[ i - 1 ] + 0.01;
		}
	}
	return out;
}

/**
 * Cumulative band mask: band k (0 = frontmost sheet) is paper where
 * the picture is DARKER than its threshold. Sheets stack front-dark,
 * and every sheet's profile reveals the brighter one behind it -
 * exactly how a physical lightbox is built.
 *
 * @param {Float32Array} luma       Map.
 * @param {number}       w          Width.
 * @param {number}       h          Height.
 * @param {number[]}     thresholds Ascending, length bands-1.
 * @param {number}       band       0-based from the FRONT.
 * @param {boolean}      invert     Bright-side-front instead.
 * @return {Uint8Array} Binary mask.
 */
export function bandMask( luma, w, h, thresholds, band, invert = false ) {
	const t = thresholds[ band ];
	const out = new Uint8Array( w * h );
	for ( let i = 0; i < luma.length; i++ ) {
		const v = invert ? 1 - luma[ i ] : luma[ i ];
		out[ i ] = v <= t ? 1 : 0;
	}
	return out;
}

/**
 * Depth bands: the picture sliced by DISTANCE instead of brightness.
 *
 * Brightness only stands in for depth in a hazy landscape, where far
 * happens to be pale. In everything else it lies - a dark shirt in the
 * foreground lands at the back. With a real depth map the bands ARE
 * depth layers.
 *
 * Cumulative like the luminance bands: band 0 is the nearest sheet, and
 * every sheet behind it contains the ones in front, so a stack of paper
 * holds together the way a real one does.
 *
 * @param {Uint8Array} depth One channel, 0 far .. 255 near.
 * @param {number}     count How many layers (2..20).
 * @return {Uint8Array[]} `count` masks, front to back.
 */
export function depthBands( depth, count ) {
	const n = Math.max( 2, Math.round( count ) );
	// Quantiles, not even steps: a picture whose depth sits in a narrow
	// band would otherwise put everything on one sheet and leave the
	// rest blank.
	const sorted = Uint8Array.from( depth ).sort();
	const cuts = [];
	for ( let k = 1; k < n; k++ ) {
		cuts.push(
			sorted[ Math.floor( ( 1 - k / n ) * ( sorted.length - 1 ) ) ]
		);
	}
	const out = [];
	for ( let k = 0; k < n; k++ ) {
		const mask = new Uint8Array( depth.length );
		if ( k === n - 1 ) {
			// The backmost sheet is the whole page: something has to
			// carry the picture.
			mask.fill( 1 );
		} else {
			const t = cuts[ k ];
			for ( let i = 0; i < depth.length; i++ ) {
				mask[ i ] = depth[ i ] >= t ? 1 : 0;
			}
		}
		out.push( mask );
	}
	return out;
}

/**
 * Resample a depth map onto another grid, nearest neighbour.
 *
 * @param {Object} map `{ w, h, depth }`.
 * @param {number} w   Target width.
 * @param {number} h   Target height.
 * @return {Uint8Array} The resampled channel.
 */
export function resampleDepth( map, w, h ) {
	const out = new Uint8Array( w * h );
	// Cover-fit, the same way the photo itself is laid onto the sheet.
	const s = Math.max( w / map.w, h / map.h );
	const ox = ( w - map.w * s ) / 2;
	const oy = ( h - map.h * s ) / 2;
	for ( let y = 0; y < h; y++ ) {
		const sy = Math.min(
			map.h - 1,
			Math.max( 0, Math.floor( ( y - oy ) / s ) )
		);
		for ( let x = 0; x < w; x++ ) {
			const sx = Math.min(
				map.w - 1,
				Math.max( 0, Math.floor( ( x - ox ) / s ) )
			);
			out[ y * w + x ] = map.depth[ sy * map.w + sx ];
		}
	}
	return out;
}

/** Binary mask from an alpha channel (the local subject cutout). */
export function alphaMask( rgba, w, h, cutoff = 0.5 ) {
	const out = new Uint8Array( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		out[ i ] = rgba[ i * 4 + 3 ] / 255 >= cutoff ? 1 : 0;
	}
	return out;
}
