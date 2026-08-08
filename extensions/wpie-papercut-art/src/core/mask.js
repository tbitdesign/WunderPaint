/**
 * The cuttability engine - the honest-craft heart of Papercut Art.
 *
 * A layer is a binary paper mask on a pixel grid. Everything here is
 * pure typed-array work (no canvas, no DOM) so the guarantees can be
 * PROVEN in node tests:
 *
 *   1. morphological open/close enforce a minimum feature and hole
 *      width (the "min bridge" in real millimeters),
 *   2. connected components + automatic stencil bridges make every
 *      sheet ONE connected piece of paper,
 *   3. marching squares traces the final mask into clean rings for
 *      rendering and SVG cutting files.
 */

/** An empty grid: `{ w, h, data }` with data[y*w+x] in {0,1}. */
export function makeGrid( w, h ) {
	return { w, h, data: new Uint8Array( w * h ) };
}

export function cloneGrid( g ) {
	return { w: g.w, h: g.h, data: g.data.slice() };
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

/** Paint a thick bar between two points (used for stencil bridges). */
export function fillBar( g, x0, y0, x1, y1, width ) {
	const dx = x1 - x0;
	const dy = y1 - y0;
	const len = Math.hypot( dx, dy ) || 1;
	const nx = ( -dy / len ) * ( width / 2 );
	const ny = ( dx / len ) * ( width / 2 );
	// Slight overshoot along the axis so the bar really lands inside
	// both pieces instead of kissing their boundary pixels.
	const ox = ( dx / len ) * ( width / 2 );
	const oy = ( dy / len ) * ( width / 2 );
	fillPolys( g, [
		[
			[ x0 - ox + nx, y0 - oy + ny ],
			[ x1 + ox + nx, y1 + oy + ny ],
			[ x1 + ox - nx, y1 + oy - ny ],
			[ x0 - ox - nx, y0 - oy - ny ],
		],
	] );
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

/* ------------------------------ components ------------------------------ */

/**
 * Label 4-connected paper components.
 *
 * @param {Object} g Grid.
 * @return {Object} `{ labels: Int32Array, sizes: number[] }` - labels
 *                  are 1-based, 0 = background; sizes[k] = area of
 *                  component k+1.
 */
export function components( g ) {
	const { w, h, data } = g;
	const labels = new Int32Array( w * h );
	const sizes = [];
	const queue = new Int32Array( w * h );
	let next = 0;
	for ( let i = 0; i < data.length; i++ ) {
		if ( ! data[ i ] || labels[ i ] ) {
			continue;
		}
		next++;
		let size = 0;
		let head = 0;
		let tail = 0;
		queue[ tail++ ] = i;
		labels[ i ] = next;
		while ( head < tail ) {
			const p = queue[ head++ ];
			size++;
			const x = p % w;
			if ( x > 0 && data[ p - 1 ] && ! labels[ p - 1 ] ) {
				labels[ p - 1 ] = next;
				queue[ tail++ ] = p - 1;
			}
			if ( x < w - 1 && data[ p + 1 ] && ! labels[ p + 1 ] ) {
				labels[ p + 1 ] = next;
				queue[ tail++ ] = p + 1;
			}
			if ( p >= w && data[ p - w ] && ! labels[ p - w ] ) {
				labels[ p - w ] = next;
				queue[ tail++ ] = p - w;
			}
			if ( p < w * ( h - 1 ) && data[ p + w ] && ! labels[ p + w ] ) {
				labels[ p + w ] = next;
				queue[ tail++ ] = p + w;
			}
		}
		sizes.push( size );
	}
	return { labels, sizes };
}

/**
 * Make the sheet ONE connected piece: drop dust, bridge real islands.
 *
 * Components smaller than `minArea` are erased (paper dust nobody can
 * cut). Every remaining secondary component is connected to the main
 * component with a straight stencil bar of `bridgeWidth` px, nearest
 * boundary pixels first - deterministic, no randomness.
 *
 * @param {Object} g           Grid (mutated).
 * @param {number} bridgeWidth Bar width in px.
 * @param {number} minArea     Components below this are erased.
 * @return {Object} `{ bridges: [ [x0,y0,x1,y1], ... ], dropped }`.
 */
export function unify( g, bridgeWidth, minArea ) {
	const bridges = [];
	let dropped = 0;
	// Bounded loop: every pass either finishes or adds one bridge that
	// merges two components, so it terminates.
	for ( let guard = 0; guard < 64; guard++ ) {
		const { labels, sizes } = components( g );
		if ( ! sizes.length ) {
			return { bridges, dropped };
		}
		// Erase dust first so it never attracts a bridge.
		let erased = false;
		for ( let k = 0; k < sizes.length; k++ ) {
			if ( sizes[ k ] < minArea ) {
				for ( let i = 0; i < labels.length; i++ ) {
					if ( labels[ i ] === k + 1 ) {
						g.data[ i ] = 0;
					}
				}
				dropped++;
				erased = true;
			}
		}
		if ( erased ) {
			continue;
		}
		if ( sizes.length === 1 ) {
			return { bridges, dropped };
		}
		// Largest component is home; bridge the nearest other one.
		let main = 0;
		for ( let k = 1; k < sizes.length; k++ ) {
			if ( sizes[ k ] > sizes[ main ] ) {
				main = k;
			}
		}
		const mainLabel = main + 1;
		// Boundary samples per component. Walk EVERY pixel: a coarse
		// stride can miss a small island entirely, and a component
		// without a single sample gets no bridge and silently leaves
		// the sheet in two pieces (found in a flaky preset test).
		// Thinning happens afterwards, per component, so every one of
		// them keeps at least one candidate.
		const { w, h } = g;
		const all = new Map();
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				const i = y * w + x;
				const l = labels[ i ];
				if ( ! l ) {
					continue;
				}
				const edge =
					x === 0 ||
					y === 0 ||
					x === w - 1 ||
					y === h - 1 ||
					! g.data[ i - 1 ] ||
					! g.data[ i + 1 ] ||
					! g.data[ i - w ] ||
					! g.data[ i + w ];
				if ( ! edge ) {
					continue;
				}
				if ( ! all.has( l ) ) {
					all.set( l, [] );
				}
				all.get( l ).push( [ x, y ] );
			}
		}
		const samples = new Map();
		for ( const [ l, pts ] of all ) {
			const cap = l === main + 1 ? 400 : 120;
			const step = Math.max( 1, Math.ceil( pts.length / cap ) );
			const thin = [];
			for ( let i = 0; i < pts.length; i += step ) {
				thin.push( pts[ i ] );
			}
			samples.set( l, thin );
		}
		let best = null;
		for ( const [ l, pts ] of samples ) {
			if ( l === mainLabel ) {
				continue;
			}
			for ( const [ x, y ] of pts ) {
				for ( const [ mx, my ] of samples.get( mainLabel ) || [] ) {
					const d = ( x - mx ) * ( x - mx ) + ( y - my ) * ( y - my );
					if ( ! best || d < best.d ) {
						best = { d, x0: x, y0: y, x1: mx, y1: my };
					}
				}
			}
		}
		if ( ! best ) {
			return { bridges, dropped };
		}
		fillBar( g, best.x0, best.y0, best.x1, best.y1, bridgeWidth );
		bridges.push( [ best.x0, best.y0, best.x1, best.y1 ] );
	}
	return { bridges, dropped };
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
 * Run a painted mask through the full cuttability pipeline.
 *
 * @param {Object} g    Grid (mutated).
 * @param {Object} opts `{ bridgePx, minAreaPx }`.
 * @return {Object} `{ grid, rings, bridges, dropped, pieces }` where
 *                  pieces is the PROVEN component count (1 or 0).
 */
export function cuttable( g, { bridgePx = 4, minAreaPx = 64 } = {} ) {
	// Asymmetric on purpose: a slit or hole thinner than the bridge is
	// truly uncuttable, so holes get the full radius. Paper that TAPERS
	// (a muzzle, an antler tip) is supported at its base and cuts fine -
	// the paper side gets a gentler pass that only removes real hairs,
	// or every animal would melt into a blob.
	const rPaper = Math.max( 1, Math.round( bridgePx / 4 ) );
	const rHole = Math.max( 1, Math.round( bridgePx / 2 ) );
	open( g, rPaper );
	close( g, rHole );
	const { bridges, dropped } = unify( g, Math.max( bridgePx, 2 ), minAreaPx );
	const { sizes } = components( g );
	const rings = trace( g );
	return { grid: g, rings, bridges, dropped, pieces: sizes.length };
}
