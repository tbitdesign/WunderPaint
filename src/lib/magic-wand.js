/**
 * Magic wand selection (v0.6): pick pixels by color similarity, either a
 * contiguous flood from the clicked point or globally ("color range").
 * DOM-free: operates on raw RGBA buffers.
 */

/**
 * Build a selection mask from a composite image.
 *
 * @param {Object}  img        { data: Uint8ClampedArray, width, height }.
 * @param {number}  x          Click x (int, image space).
 * @param {number}  y          Click y (int).
 * @param {number}  tolerance  0–255 color distance.
 * @param {boolean} contiguous Flood from the click vs. whole image.
 * @return {{mask: Uint8Array, bounds: {x:number,y:number,w:number,h:number}|null}}
 *         mask[i]=255 for selected pixels; bounds=null when empty.
 */
export function wandMask( img, x, y, tolerance = 32, contiguous = true ) {
	const { data, width: w, height: h } = img;
	const mask = new Uint8Array( w * h );
	const px = Math.min( w - 1, Math.max( 0, Math.round( x ) ) );
	const py = Math.min( h - 1, Math.max( 0, Math.round( y ) ) );
	const start = ( py * w + px ) * 4;
	const r0 = data[ start ];
	const g0 = data[ start + 1 ];
	const b0 = data[ start + 2 ];
	const a0 = data[ start + 3 ];
	const tolSq = tolerance * tolerance * 3;

	const matches = ( i ) => {
		const dr = data[ i ] - r0;
		const dg = data[ i + 1 ] - g0;
		const db = data[ i + 2 ] - b0;
		const da = data[ i + 3 ] - a0;
		return dr * dr + dg * dg + db * db + da * da <= tolSq;
	};

	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	const include = ( p ) => {
		mask[ p ] = 255;
		const ix = p % w;
		const iy = ( p / w ) | 0;
		if ( ix < minX ) {
			minX = ix;
		}
		if ( ix > maxX ) {
			maxX = ix;
		}
		if ( iy < minY ) {
			minY = iy;
		}
		if ( iy > maxY ) {
			maxY = iy;
		}
	};

	if ( contiguous ) {
		// BFS flood, 4-neighborhood.
		const queue = new Int32Array( w * h );
		let head = 0;
		let tail = 0;
		const seed = py * w + px;
		queue[ tail++ ] = seed;
		mask[ seed ] = 1; // visited marker
		while ( head < tail ) {
			const p = queue[ head++ ];
			if ( ! matches( p * 4 ) ) {
				mask[ p ] = 0;
				continue;
			}
			include( p );
			const cx = p % w;
			if ( cx > 0 && ! mask[ p - 1 ] ) {
				mask[ p - 1 ] = 1;
				queue[ tail++ ] = p - 1;
			}
			if ( cx < w - 1 && ! mask[ p + 1 ] ) {
				mask[ p + 1 ] = 1;
				queue[ tail++ ] = p + 1;
			}
			if ( p >= w && ! mask[ p - w ] ) {
				mask[ p - w ] = 1;
				queue[ tail++ ] = p - w;
			}
			if ( p < w * ( h - 1 ) && ! mask[ p + w ] ) {
				mask[ p + w ] = 1;
				queue[ tail++ ] = p + w;
			}
		}
		// Clear leftover visited-markers that never matched.
		for ( let p = 0; p < mask.length; p++ ) {
			if ( 1 === mask[ p ] ) {
				mask[ p ] = 0;
			}
		}
	} else {
		for ( let p = 0; p < w * h; p++ ) {
			if ( matches( p * 4 ) ) {
				include( p );
			}
		}
	}

	if ( maxX < 0 ) {
		return { mask, bounds: null };
	}
	return {
		mask,
		bounds: {
			x: minX,
			y: minY,
			w: maxX - minX + 1,
			h: maxY - minY + 1,
		},
	};
}
