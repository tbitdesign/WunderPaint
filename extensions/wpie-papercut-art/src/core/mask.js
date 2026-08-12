/**
 * Paper masks: rasterize, tidy, trace.
 *
 * A layer is a binary paper mask on a pixel grid, and everything here is
 * pure typed-array work (no canvas, no DOM) so it can be tested in node.
 *
 * This file used to be the CUTTABILITY ENGINE: it enforced a minimum
 * feature width in real millimetres, hunted connected components and
 * welded them together with automatic stencil bridges, so that every
 * sheet was provably one piece of paper you could cut out by hand.
 * That requirement was dropped on 9 August 2026. Nobody is going to cut
 * anything; the pictures only have to look good. The bridges were the
 * reason a letter "d" had a bar across its counter, the reason every
 * placed element needed a full sheet of its own, and - at roughly
 * fifteen full-grid passes per sheet - the reason dragging could not
 * follow the hand.
 *
 * What is left is what actually makes the look: a light denoise so
 * single stray pixels do not become jagged specks, and marching squares
 * for clean rings.
 */

/** An empty grid: `{ w, h, data }` with data[y*w+x] in {0,1}. */
export function makeGrid( w, h ) {
	return { w, h, data: new Uint8Array( w * h ) };
}

/**
 * Scanline-fill polygons into the grid (even-odd rule).
 *
 * @param {Object} g     Grid.
 * @param {Array}  polys `[ [ [x,y], ... ], ... ]` in pixel space.
 * @param {number} value 1 paints paper, 0 cuts it away.
 */
export function fillPolys( g, polys, value = 1 ) {
	const { w, h, data } = g;
	// Only scan the rows the shape actually touches. A grass blade
	// covers twenty rows, not the whole sheet - scanning everything
	// made a meadow cost as much as the mountain behind it.
	let top = Infinity;
	let bottom = -Infinity;
	for ( const poly of polys ) {
		for ( const p of poly ) {
			if ( p[ 1 ] < top ) {
				top = p[ 1 ];
			}
			if ( p[ 1 ] > bottom ) {
				bottom = p[ 1 ];
			}
		}
	}
	if ( ! Number.isFinite( top ) ) {
		return;
	}
	const yFrom = Math.max( 0, Math.floor( top ) );
	const yTo = Math.min( h - 1, Math.ceil( bottom ) );
	for ( let y = yFrom; y <= yTo; y++ ) {
		const yc = y + 0.5;
		const xs = [];
		for ( const poly of polys ) {
			for ( let i = 0; i < poly.length; i++ ) {
				const [ x1, y1 ] = poly[ i ];
				const [ x2, y2 ] = poly[ ( i + 1 ) % poly.length ];
				if ( y1 <= yc === y2 <= yc ) {
					continue;
				}
				xs.push( x1 + ( ( yc - y1 ) / ( y2 - y1 ) ) * ( x2 - x1 ) );
			}
		}
		if ( ! xs.length ) {
			continue;
		}
		xs.sort( ( a, b ) => a - b );
		for ( let k = 0; k + 1 < xs.length; k += 2 ) {
			const a = Math.max( 0, Math.ceil( xs[ k ] - 0.5 ) );
			const b = Math.min( w - 1, Math.floor( xs[ k + 1 ] - 0.5 ) );
			for ( let x = a; x <= b; x++ ) {
				data[ y * w + x ] = value;
			}
		}
	}
}

/* ------------------------------ morphology ------------------------------ */

function erode1( g, diag ) {
	const { w, h, data } = g;
	const out = new Uint8Array( w * h );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if ( ! data[ i ] ) {
				continue;
			}
			// The border counts as empty so paper never silently fuses
			// with the outside world.
			if ( x <= 0 || y <= 0 || x >= w - 1 || y >= h - 1 ) {
				continue;
			}
			if (
				data[ i - 1 ] &&
				data[ i + 1 ] &&
				data[ i - w ] &&
				data[ i + w ] &&
				( ! diag ||
					( data[ i - w - 1 ] &&
						data[ i - w + 1 ] &&
						data[ i + w - 1 ] &&
						data[ i + w + 1 ] ) )
			) {
				out[ i ] = 1;
			}
		}
	}
	g.data = out;
}

function dilate1( g, diag ) {
	const { w, h, data } = g;
	const out = new Uint8Array( w * h );
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if (
				data[ i ] ||
				( x > 0 && data[ i - 1 ] ) ||
				( x < w - 1 && data[ i + 1 ] ) ||
				( y > 0 && data[ i - w ] ) ||
				( y < h - 1 && data[ i + w ] ) ||
				( diag &&
					( ( x > 0 && y > 0 && data[ i - w - 1 ] ) ||
						( x < w - 1 && y > 0 && data[ i - w + 1 ] ) ||
						( x > 0 && y < h - 1 && data[ i + w - 1 ] ) ||
						( x < w - 1 && y < h - 1 && data[ i + w + 1 ] ) ) )
			) {
				out[ i ] = 1;
			}
		}
	}
	g.data = out;
}

// Alternating cross/square passes grow an octagon instead of a diamond
// - a pure 4-neighbourhood run visibly facets every large curve (the
// circle frame looked hand-torn before this).
/** Morphological open: removes paper features thinner than ~2r+1 px. */
export function open( g, r ) {
	for ( let i = 0; i < r; i++ ) {
		erode1( g, i % 2 === 1 );
	}
	for ( let i = 0; i < r; i++ ) {
		dilate1( g, i % 2 === 1 );
	}
}

/** Morphological close: removes holes/slits thinner than ~2r+1 px. */
export function close( g, r ) {
	for ( let i = 0; i < r; i++ ) {
		dilate1( g, i % 2 === 1 );
	}
	for ( let i = 0; i < r; i++ ) {
		erode1( g, i % 2 === 1 );
	}
}

/* -------------------------------- tracing ------------------------------- */

/**
 * Marching squares: trace all contours (outer rings and holes) of the
 * mask as closed polylines on the pixel-corner lattice.
 *
 * @param {Object} g Grid.
 * @return {Array} `[ [ [x,y], ... ], ... ]` closed rings.
 */
export function trace( g ) {
	const { w, h, data } = g;
	const W = w + 1;
	const H = h + 1;
	const at = ( x, y ) =>
		x >= 0 && y >= 0 && x < w && y < h ? data[ y * w + x ] : 0;
	// Edge-visited flags: 2 per lattice cell (horizontal, vertical).
	const seen = new Uint8Array( W * H * 2 );
	const rings = [];
	// A boundary edge sits between a paper cell and an empty cell. We
	// walk with paper on the LEFT, which closes every loop.
	const dirs = [
		[ 1, 0 ],
		[ 0, 1 ],
		[ -1, 0 ],
		[ 0, -1 ],
	];
	for ( let y = 0; y < H; y++ ) {
		for ( let x = 0; x < W; x++ ) {
			// Start on an unvisited horizontal edge with paper below
			// and empty above (a top boundary walked rightwards).
			if ( seen[ ( y * W + x ) * 2 ] ) {
				continue;
			}
			if ( ! ( at( x, y ) && ! at( x, y - 1 ) ) ) {
				continue;
			}
			const ring = [];
			let cx = x;
			let cy = y;
			let dir = 0; // moving +x
			let guard = w * h * 8;
			do {
				if ( dir === 0 ) {
					seen[ ( cy * W + cx ) * 2 ] = 1;
				} else if ( dir === 2 ) {
					seen[ ( cy * W + ( cx - 1 ) ) * 2 ] = 1;
				} else if ( dir === 1 ) {
					seen[ ( cy * W + cx ) * 2 + 1 ] = 1;
				} else {
					seen[ ( ( cy - 1 ) * W + cx ) * 2 + 1 ] = 1;
				}
				ring.push( [ cx, cy ] );
				cx += dirs[ dir ][ 0 ];
				cy += dirs[ dir ][ 1 ];
				// At the new corner, pick the next direction with the
				// paper kept on the left (standard square tracing).
				const ul = at( cx - 1, cy - 1 );
				const ur = at( cx, cy - 1 );
				const ll = at( cx - 1, cy );
				const lr = at( cx, cy );
				if ( dir === 0 ) {
					dir = lr && ! ur ? 0 : ur ? 3 : 1;
				} else if ( dir === 1 ) {
					dir = ll && ! lr ? 1 : lr ? 0 : 2;
				} else if ( dir === 2 ) {
					dir = ul && ! ll ? 2 : ll ? 1 : 3;
				} else {
					dir = ur && ! ul ? 3 : ul ? 2 : 0;
				}
			} while ( ( cx !== x || cy !== y ) && guard-- > 0 );
			if ( ring.length >= 4 ) {
				rings.push( ring );
			}
		}
	}
	return rings;
}

/* ------------------------------ the pipeline ---------------------------- */

/**
 * A painted mask into clean rings.
 *
 * The only tidying left is cosmetic. `denoise` is a radius in PIXELS,
 * not a physical width: it exists so a stray pixel or a one-pixel gap
 * does not survive into the contour as a jagged speck. It is
 * deliberately tiny and symmetric - the old engine used an asymmetric
 * pair (gentle on paper, harsh on holes) because holes narrower than a
 * blade really were uncuttable. Nothing gets cut any more, so a hole
 * may be as fine as it likes.
 *
 * @param {Object} g            Grid (mutated).
 * @param {Object} opts         Tidying settings.
 * @param {number} opts.denoise Radius in px; 0 disables the tidying.
 * @return {Object} `{ grid, rings }`.
 */
export function outline( g, { denoise = 1 } = {} ) {
	const r = Math.max( 0, Math.round( denoise ) );
	if ( r ) {
		open( g, r );
		close( g, r );
	}
	return { grid: g, rings: trace( g ) };
}
