/**
 * The wet layer: a Curtis-style watercolour simulation (Curtis et al. 1997,
 * "Computer-Generated Watercolor"), reduced to a flux grid on the CPU.
 *
 * This is the sibling of paint-engine.js, for the one thing that engine
 * deliberately cannot do: water that keeps moving after the hand stops.
 * Per cell it tracks water, paper saturation, suspended and settled pigment;
 * the visible watercolour signatures fall out of the physics rather than
 * being painted: the dark drying rim (edge water evaporates faster, inflow
 * keeps feeding it pigment), blooms/backruns (fresh water floods damp paper
 * and shoves settled pigment ahead of itself), granulation (settling favours
 * the valleys of the paper tooth).
 *
 * The grid runs at HALF document resolution (SC = 2). A quarter grid was
 * measurably cheaper but visibly a grid: the drying front retreats cell by
 * cell, and no amount of render-side smoothing turns a 4px step into a
 * fibre. Everything here was tuned against the standalone prototype
 * (paint-wasser.html on the dev docroot) and its Playwright measurements;
 * the constants carry the scars, see the comments on each.
 *
 * NO editor knowledge and NO canvas in here: the region is plain typed
 * arrays, stamping takes an alpha map, rendering writes straight-alpha RGBA
 * into a caller-supplied buffer. That keeps the whole core testable under
 * jsdom, which has no 2D context.
 *
 * The region GROWS with the wash (union of stroke rects plus margin) and is
 * capped; noise comes from fixed periodic tiles so a grow is a pure array
 * copy - regenerating unique noise per grow caused a visible hitch on every
 * stroke that left the old box.
 */

const SC = 2; // cell size in document pixels
const MARGIN = 48; // grid cells of slack around a stroke, so grows are rare
const MAX_CELLS = 1200000; // memory guard: beyond this the wash force-dries

/*
 * The balance of these numbers IS the coffee ring: water must level much
 * faster than it evaporates (or the rim dries shut and seals the wash), and
 * pigment must stay suspended until the water is nearly gone (or every cell
 * just settles its own paint and nothing migrates - which also kills
 * granulation, which lives on redistribution into the valleys).
 *
 * Values are the SC = 2 calibration: diffusion-like rates scale with the
 * cell size SQUARED and the time step is refined 2x against the quarter
 * grid the model was first tuned on. DEPTH thresholds (flood pressure,
 * dry-out, lift) never scale - depth is measured in paint, not in cells.
 */
const FLOW = 0.44; // conductance between neighbours (diffusion-like)
const EVAP = 0.000275; // base evaporation per step (a depth)
const EDGEK = 0.35; // extra evaporation per dry neighbour (8-neighbourhood)
const DEP = 0.002; // settling rate, applied quadratically to dryness
const LIFT = 0.06; // resuspension of settled pigment under deep water
const REWET = 0.35; // saturation above which paper floods again
const FLUT = 0.12; // flood pressure threshold (a DEPTH - never scaled)
const SKRIECH = 0.02; // capillary creep of saturation through the fibres
const PDIFF = 0.007; // pigment diffusion in standing water
const TRINK = 0.0025; // paper drinking rate (costs water, stops at s = 1)
const SOG = 0.09; // Curtis' flowOutward: water pulled toward the mask edge
const RUECK = 1 - Math.pow( 0.65, SC / 4 ); // retreat share per cell death
const EVAPK = 0.25 + 3 * 0.35; // fixed "Verdunstung" setting of the editor

/* ------------------------------------------------------------------ *
 * Deterministic noise. The grain belongs to the PAPER: paint the same
 * spot twice and it lands in the same valleys. Served from periodic
 * tiles (power-of-two sizes, masked lookups) so region growth never
 * has to regenerate anything.
 * ------------------------------------------------------------------ */

function hash( x, y ) {
	let h = ( ( x | 0 ) * 374761393 + ( y | 0 ) * 668265263 ) | 0;
	h = ( h ^ ( h >> 13 ) ) * 1274126177;
	return ( ( h ^ ( h >> 16 ) ) >>> 0 ) / 4294967296;
}

/**
 * Periodic value noise on a tile: the lattice wraps at `n`, so a tile
 * sampled with & (size-1) is seamless by construction.
 *
 * @param {number} x    Pixel x inside the tile.
 * @param {number} y    Pixel y inside the tile.
 * @param {number} size Tile size.
 * @param {number} n    Lattice points across the tile (integer!).
 * @param {number} seed Seed offset.
 * @return {number} 0..1.
 */
function pnoise( x, y, size, n, seed ) {
	const u = ( x * n ) / size;
	const v = ( y * n ) / size;
	const x0 = Math.floor( u );
	const y0 = Math.floor( v );
	let tx = u - x0;
	let ty = v - y0;
	tx = tx * tx * ( 3 - 2 * tx );
	ty = ty * ty * ( 3 - 2 * ty );
	const x1 = ( x0 + 1 ) % n;
	const y1 = ( y0 + 1 ) % n;
	const xa = x0 % n;
	const ya = y0 % n;
	const a = hash( xa + seed, ya );
	const b = hash( x1 + seed, ya );
	const c = hash( xa + seed, y1 );
	const d = hash( x1 + seed, y1 );
	return a + ( b - a ) * tx + ( c - a ) * ty + ( a - b - c + d ) * tx * ty;
}

const TILE = 512; // full-resolution noise tile, document pixels
const TILEG = TILE / SC; // the same tile in grid cells

let paperQT = null; // grid-cell paper height, drives flow and settling
let paperFT = null; // full-res paper tooth, drives the visible grain
let warpXT = null; // full-res read-position warp, breaks the grid edge
let warpYT = null;

function buildTiles() {
	if ( paperQT ) {
		return;
	}
	paperQT = new Float32Array( TILEG * TILEG );
	for ( let y = 0; y < TILEG; y++ ) {
		for ( let x = 0; x < TILEG; x++ ) {
			// Lattice counts approximate the prototype's frequencies
			// (0.105 / 0.235 / 0.275 per cell) as integers, which is what
			// makes the tile seamless. NO raw per-cell hash in here: the
			// settling weights read this field, and a value that jumps
			// cell to cell paints 4px tiles into every wash.
			paperQT[ y * TILEG + x ] =
				0.5 * pnoise( x, y, TILEG, 27, 11 ) +
				0.3 * pnoise( x, y, TILEG, 60, 211 ) +
				0.2 * pnoise( x, y, TILEG, 70, 311 );
		}
	}
	// Fine tooth: hash blurred twice with wrap-around (a single pass left
	// a checkerboard shimmer in saturated areas), contrast stretched back.
	const fein = new Float32Array( TILE * TILE );
	for ( let i = 0; i < TILE * TILE; i++ ) {
		fein[ i ] = hash( i % TILE, ( i / TILE ) | 0 );
	}
	let from = fein;
	for ( let pass = 0; pass < 2; pass++ ) {
		const to = new Float32Array( TILE * TILE );
		for ( let y = 0; y < TILE; y++ ) {
			const ym = ( ( y - 1 ) & ( TILE - 1 ) ) * TILE;
			const y0 = y * TILE;
			const yp = ( ( y + 1 ) & ( TILE - 1 ) ) * TILE;
			for ( let x = 0; x < TILE; x++ ) {
				const xm = ( x - 1 ) & ( TILE - 1 );
				const xp = ( x + 1 ) & ( TILE - 1 );
				to[ y0 + x ] =
					( from[ ym + xm ] +
						from[ ym + x ] +
						from[ ym + xp ] +
						from[ y0 + xm ] +
						from[ y0 + x ] +
						from[ y0 + xp ] +
						from[ yp + xm ] +
						from[ yp + x ] +
						from[ yp + xp ] ) /
					9;
			}
		}
		from = to;
	}
	paperFT = new Float32Array( TILE * TILE );
	warpXT = new Float32Array( TILE * TILE );
	warpYT = new Float32Array( TILE * TILE );
	for ( let y = 0; y < TILE; y++ ) {
		for ( let x = 0; x < TILE; x++ ) {
			const i = y * TILE + x;
			let f = ( from[ i ] - 0.5 ) * 3 + 0.5;
			f = f < 0 ? 0 : f > 1 ? 1 : f;
			const gq =
				paperQT[
					( ( y >> 1 ) % TILEG ) * TILEG + ( ( x >> 1 ) % TILEG )
				];
			paperFT[ i ] =
				0.42 * gq + 0.3 * pnoise( x, y, TILE, 44, 71 ) + 0.28 * f;
			// Long wave strong, fine octave quiet - the other way round the
			// stroke edge becomes a seam of cell-sized knobs instead of a
			// wavy fibre edge.
			warpXT[ i ] =
				( pnoise( x, y, TILE, 23, 911 ) - 0.5 ) * 4.2 +
				( pnoise( x, y, TILE, 123, 555 ) - 0.5 ) * 0.9;
			warpYT[ i ] =
				( pnoise( x, y, TILE, 23, 137 ) - 0.5 ) * 4.2 +
				( pnoise( x, y, TILE, 123, 353 ) - 0.5 ) * 0.9;
		}
	}
}

const paperQAt = ( gx, gy ) =>
	paperQT[ ( gy & ( TILEG - 1 ) ) * TILEG + ( gx & ( TILEG - 1 ) ) ];

/* ------------------------------------------------------------------ *
 * The surface
 * ------------------------------------------------------------------ */

export function createWetSurface() {
	buildTiles();

	const S = {
		// Region in grid cells, origin in ABSOLUTE grid coordinates
		// (document px / SC). Empty until the first stamp.
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0, // live wet-cell count (maintained by step())
		stepNr: 0,
	};

	// Field arrays, all region-sized. Allocated in ensure().
	let w, s, M, eF, pR, pG, pB, pGr, dR, dG, dB, dGr;
	let fw, fs, fpR, fpG, fpB, fpGr; // flux deltas (order-independent pairs)
	let cDenR, cDenG, cDenB, cGran; // per-cell render precomputes
	let pq; // regional copy of the paper tile, so the hot loops never mod

	// Active box (where water stands) and dirty boxes, region-relative.
	let bx0, by0, bx1, by1;
	let dx0, dy0, dx1, dy1; // sim changes -> background render cadence
	let hx0, hy0, hx1, hy1; // fresh stamps -> render immediately

	function resetBoxes() {
		bx0 = S.rw;
		by0 = S.rh;
		bx1 = -1;
		by1 = -1;
		dx0 = S.rw;
		dy0 = S.rh;
		dx1 = -1;
		dy1 = -1;
		hx0 = S.rw;
		hy0 = S.rh;
		hx1 = -1;
		hy1 = -1;
	}

	function alloc( n ) {
		w = new Float32Array( n );
		s = new Float32Array( n );
		M = new Uint8Array( n );
		eF = new Uint8Array( n );
		pR = new Float32Array( n );
		pG = new Float32Array( n );
		pB = new Float32Array( n );
		pGr = new Float32Array( n );
		dR = new Float32Array( n );
		dG = new Float32Array( n );
		dB = new Float32Array( n );
		dGr = new Float32Array( n );
		fw = new Float32Array( n );
		fs = new Float32Array( n );
		fpR = new Float32Array( n );
		fpG = new Float32Array( n );
		fpB = new Float32Array( n );
		fpGr = new Float32Array( n );
		cDenR = new Float32Array( n );
		cDenG = new Float32Array( n );
		cDenB = new Float32Array( n );
		cGran = new Float32Array( n );
		pq = new Float32Array( n );
	}

	function fillPaper() {
		for ( let y = 0; y < S.rh; y++ ) {
			const gay = S.ry + y;
			for ( let x = 0; x < S.rw; x++ ) {
				pq[ y * S.rw + x ] = paperQAt( S.rx + x, gay );
			}
		}
	}

	S.reset = () => {
		S.rw = 0;
		S.rh = 0;
		S.wet = 0;
		w = s = M = eF = pR = pG = pB = pGr = dR = dG = dB = dGr = null;
		fw = fs = fpR = fpG = fpB = fpGr = null;
		cDenR = cDenG = cDenB = cGran = null;
	};

	S.hasRegion = () => S.rw > 0;

	/**
	 * Make sure the region covers a document rect. Growing copies the old
	 * fields into the enlarged arrays; the noise needs no work because it
	 * is keyed to absolute coordinates via the tiles.
	 *
	 * @param {Object} rect { x, y, w, h } in document pixels.
	 * @return {boolean} False when the grown region would blow the cap -
	 *                   the caller must flush (commit) and retry.
	 */
	S.ensure = ( rect ) => {
		const nx0 = Math.floor( rect.x / SC ) - MARGIN;
		const ny0 = Math.floor( rect.y / SC ) - MARGIN;
		const nx1 = Math.ceil( ( rect.x + rect.w ) / SC ) + MARGIN;
		const ny1 = Math.ceil( ( rect.y + rect.h ) / SC ) + MARGIN;
		if ( ! S.rw ) {
			S.rx = nx0;
			S.ry = ny0;
			S.rw = nx1 - nx0;
			S.rh = ny1 - ny0;
			if ( S.rw * S.rh > MAX_CELLS ) {
				S.reset();
				return false;
			}
			alloc( S.rw * S.rh );
			fillPaper();
			resetBoxes();
			return true;
		}
		const ox0 = Math.min( S.rx, nx0 );
		const oy0 = Math.min( S.ry, ny0 );
		const ox1 = Math.max( S.rx + S.rw, nx1 );
		const oy1 = Math.max( S.ry + S.rh, ny1 );
		if (
			ox0 === S.rx &&
			oy0 === S.ry &&
			ox1 === S.rx + S.rw &&
			oy1 === S.ry + S.rh
		) {
			return true;
		}
		const nw = ox1 - ox0;
		const nh = oy1 - oy0;
		if ( nw * nh > MAX_CELLS ) {
			return false;
		}
		const old = { w, s, M, eF, pR, pG, pB, pGr, dR, dG, dB, dGr };
		const orw = S.rw;
		const orh = S.rh;
		const shiftX = S.rx - ox0;
		const shiftY = S.ry - oy0;
		alloc( nw * nh );
		const copyF = ( dst, src ) => {
			for ( let y = 0; y < orh; y++ ) {
				dst.set(
					src.subarray( y * orw, y * orw + orw ),
					( y + shiftY ) * nw + shiftX
				);
			}
		};
		copyF( w, old.w );
		copyF( s, old.s );
		copyF( pR, old.pR );
		copyF( pG, old.pG );
		copyF( pB, old.pB );
		copyF( pGr, old.pGr );
		copyF( dR, old.dR );
		copyF( dG, old.dG );
		copyF( dB, old.dB );
		copyF( dGr, old.dGr );
		copyF( M, old.M );
		copyF( eF, old.eF );
		const obx0 = bx0,
			oby0 = by0,
			obx1 = bx1,
			oby1 = by1;
		const odx0 = dx0,
			ody0 = dy0,
			odx1 = dx1,
			ody1 = dy1;
		S.rx = ox0;
		S.ry = oy0;
		S.rw = nw;
		S.rh = nh;
		fillPaper();
		resetBoxes();
		if ( obx1 >= obx0 ) {
			bx0 = obx0 + shiftX;
			bx1 = obx1 + shiftX;
			by0 = oby0 + shiftY;
			by1 = oby1 + shiftY;
		}
		if ( odx1 >= odx0 ) {
			dx0 = odx0 + shiftX;
			dx1 = odx1 + shiftX;
			dy0 = ody0 + shiftY;
			dy1 = ody1 + shiftY;
		}
		// Everything moved in the buffer: the caller's overlay must be
		// rebuilt in full, which the region change itself signals.
		return true;
	};

	/**
	 * Stamp water and pigment from an alpha map (a rendered brush segment
	 * at grid resolution). The caller has already called ensure().
	 *
	 * @param {Object} map  { data: Float32Array|Uint8ClampedArray alpha
	 *                      0..1 or 0..255, w, h, gx, gy } with gx/gy the
	 *                      ABSOLUTE grid position of the map's origin.
	 * @param {Object} p    { water, pigment, kr, kg, kb, gran } - water
	 *                      and pigment 0..1, k* the colour's densities.
	 */
	S.stamp = ( map, p ) => {
		const bytes =
			map.data instanceof Uint8ClampedArray ||
			map.data instanceof Uint8Array;
		const kSum = ( p.kr + p.kg + p.kb ) / 3;
		const wAdd = 0.42 * p.water;
		const aAdd = 0.3 * p.pigment;
		for ( let my = 0; my < map.h; my++ ) {
			const gy = map.gy + my - S.ry;
			if ( gy < 0 || gy >= S.rh ) {
				continue;
			}
			for ( let mx = 0; mx < map.w; mx++ ) {
				let a = map.data[ my * map.w + mx ];
				if ( bytes ) {
					a /= 255;
				}
				if ( a <= 0.02 ) {
					continue;
				}
				const gx = map.gx + mx - S.rx;
				if ( gx < 0 || gx >= S.rw ) {
					continue;
				}
				const i = gy * S.rw + gx;
				// Water lies as a PUDDLE WITH A MENISCUS: near-flat with a
				// finite depth at the edge (surface tension). A profile
				// that tapers to nothing starves the fine edge cells below
				// the flood threshold, the rim seals, and the coffee ring
				// dies - that is precisely how the first half-resolution
				// balance failed.
				w[ i ] = Math.min(
					3,
					w[ i ] + wAdd * ( 0.3 + 0.7 * Math.sqrt( a ) )
				);
				s[ i ] = Math.min( 1, s[ i ] + 0.14 * a );
				M[ i ] = 1;
				pR[ i ] += p.kr * aAdd * a;
				pG[ i ] += p.kg * aAdd * a;
				pB[ i ] += p.kb * aAdd * a;
				pGr[ i ] += p.gran * aAdd * a * kSum;
				if ( gx < bx0 ) {
					bx0 = gx;
				}
				if ( gx > bx1 ) {
					bx1 = gx;
				}
				if ( gy < by0 ) {
					by0 = gy;
				}
				if ( gy > by1 ) {
					by1 = gy;
				}
				if ( gx < hx0 ) {
					hx0 = gx;
				}
				if ( gx > hx1 ) {
					hx1 = gx;
				}
				if ( gy < hy0 ) {
					hy0 = gy;
				}
				if ( gy > hy1 ) {
					hy1 = gy;
				}
			}
		}
		if ( S.wet < 1 ) {
			S.wet = 1; // fresh stamps count as wet BEFORE the first step
		}
	};

	/* ---------------- the simulation step (see prototype) ---------------- */

	function sNach() {
		const d = 0.0032;
		const n = S.rw * S.rh;
		for ( let i = 0; i < n; i++ ) {
			if ( ! M[ i ] && s[ i ] > 0.003 ) {
				s[ i ] -= d;
			}
		}
	}

	function paar( i, j, dg, x, y, dxn, dyn ) {
		const mj = M[ j ];
		if ( ! mj && s[ j ] < REWET ) {
			return;
		}
		// Diagonal pairs carry less (longer path) and every cap shrinks:
		// a cell now has up to EIGHT pairs, and any per-pair cap whose sum
		// can pass 100 % lets the post-apply clamp CREATE mass - pigment
		// and water then explode exponentially (measured 1.6e19 in the
		// prototype). 4 x 0.125 + 4 x 0.085 = 84 %.
		const lw = dg ? 0.7071 : 1;
		const capk = dg ? 0.085 : 0.125;
		const wj = mj ? w[ j ] : 0;
		// Diffusion in standing water: flux only moves along a slope, but
		// a dab in a LEVEL puddle still spreads. Scaled by depth so it
		// stops by itself while drying.
		if ( mj ) {
			const dsc = PDIFF * lw * Math.min( 1, ( w[ i ] + wj ) * 0.5 );
			if ( dsc > 0 ) {
				let t = ( pR[ i ] - pR[ j ] ) * dsc;
				if ( t ) {
					fpR[ i ] -= t;
					fpR[ j ] += t;
				}
				t = ( pG[ i ] - pG[ j ] ) * dsc;
				if ( t ) {
					fpG[ i ] -= t;
					fpG[ j ] += t;
				}
				t = ( pB[ i ] - pB[ j ] ) * dsc;
				if ( t ) {
					fpB[ i ] -= t;
					fpB[ j ] += t;
				}
				t = ( pGr[ i ] - pGr[ j ] ) * dsc;
				if ( t ) {
					fpGr[ i ] -= t;
					fpGr[ j ] += t;
				}
			}
		}
		const diff = w[ i ] - wj;
		if ( ! mj && diff <= FLUT ) {
			return; // flooding needs pressure, and dry paper blocks
		}
		// Curtis' flowOutward: water is actively pulled toward the mask
		// edge while BOTH sides are wet - that carries the pigment into
		// the rim without drying the rim shut.
		const eb = mj ? eF[ j ] - eF[ i ] : 0;
		if ( 0 === diff && 0 === eb ) {
			return;
		}
		// Quiet modulation plus a fixed per-pair jitter, keyed to ABSOLUTE
		// coordinates so a region grow never reshuffles the flow channels
		// mid-wash: with a smooth conductance the levelling flows collide
		// on dead-straight lines and the pigment traces them.
		const gxi = S.rx + x;
		const gyi = S.ry + y;
		const ph = ( pq[ i ] + pq[ j ] ) * 0.5;
		let f =
			diff *
			FLOW *
			lw *
			( 0.75 + 0.5 * ( 1 - ph ) ) *
			( 0.7 + 0.6 * hash( 2 * gxi + dxn, 2 * gyi + dyn ) );
		if ( 0 !== eb ) {
			f += SOG * eb * lw * Math.min( w[ i ], wj );
		}
		const cap = capk * ( f > 0 ? w[ i ] : wj );
		if ( f > cap ) {
			f = cap;
		} else if ( f < -cap ) {
			f = -cap;
		}
		if ( 0 === f ) {
			return;
		}
		if ( f > 0 && ! mj ) {
			M[ j ] = 1; // backrun: damp paper floods
			eF[ j ] = 3;
			const jx = j % S.rw;
			const jy = ( j / S.rw ) | 0;
			if ( jx < bx0 ) {
				bx0 = jx;
			}
			if ( jx > bx1 ) {
				bx1 = jx;
			}
			if ( jy < by0 ) {
				by0 = jy;
			}
			if ( jy > by1 ) {
				by1 = jy;
			}
		}
		fw[ i ] -= f;
		fw[ j ] += f;
		const src = f > 0 ? i : j;
		const dst = f > 0 ? j : i;
		const ws = f > 0 ? w[ i ] : wj;
		let amt = Math.abs( f ) / ( ws + 1e-4 );
		if ( amt > capk ) {
			amt = capk;
		}
		// Mobility by depth (sluggish in a deep puddle, near-full in the
		// thin drying film), times a MEASURED scale compensation: the pure
		// scale maths predicts equal drift per distance, but the quarter
		// grid moved pigment 2.5x faster than theory (cell-scale transport
		// the finer grid genuinely lacks). Without the factor the interior
		// stayed at 1.34 instead of falling to 0.77 and the ring never
		// formed; with the full factor the interior emptied to 0.41.
		const dryn = 1 - Math.min( 1, ws );
		amt *= ( 0.55 + 0.4 * dryn ) * 1.4;
		if ( amt > capk ) {
			amt = capk;
		}
		if ( pR[ src ] > 0 ) {
			const m = pR[ src ] * amt;
			fpR[ src ] -= m;
			fpR[ dst ] += m;
		}
		if ( pG[ src ] > 0 ) {
			const m = pG[ src ] * amt;
			fpG[ src ] -= m;
			fpG[ dst ] += m;
		}
		if ( pB[ src ] > 0 ) {
			const m = pB[ src ] * amt;
			fpB[ src ] -= m;
			fpB[ dst ] += m;
		}
		if ( pGr[ src ] > 0 ) {
			const m = pGr[ src ] * amt;
			fpGr[ src ] -= m;
			fpGr[ dst ] += m;
		}
	}

	function substep() {
		S.stepNr++;
		if ( 0 === S.stepNr % 32 ) {
			sNach();
		}
		if ( bx1 < bx0 ) {
			S.wet = 0;
			return;
		}
		const RW = S.rw;
		const RH = S.rh;
		const ax0 = Math.max( 0, bx0 - 2 );
		const ax1 = Math.min( RW - 1, bx1 + 2 );
		const ay0 = Math.max( 0, by0 - 2 );
		const ay1 = Math.min( RH - 1, by1 + 2 );
		const px0 = Math.max( 0, ax0 - 1 );
		const px1 = Math.min( RW - 1, ax1 + 1 );
		const py0 = Math.max( 0, ay0 - 1 );
		const py1 = Math.min( RH - 1, ay1 + 1 );

		// 1) Capillary layer: wet cells saturate the paper (drinking COSTS
		// water and saturated paper stops - without that cost a wash crept
		// until the whole canvas stood under water), saturation creeps
		// through the fibres, valleys first.
		for ( let y = py0; y <= py1; y++ ) {
			fs.fill( 0, y * RW + px0, y * RW + px1 + 1 );
		}
		for ( let y = ay0; y <= ay1; y++ ) {
			for ( let x = ax0; x <= ax1; x++ ) {
				const i = y * RW + x;
				if ( M[ i ] ) {
					const nimm = TRINK * Math.min( 1, w[ i ] ) * ( 1 - s[ i ] );
					w[ i ] -= nimm;
					s[ i ] = Math.min( 1, s[ i ] + nimm * 1.5 );
				}
				const si = s[ i ];
				if ( si <= 0.3 ) {
					continue;
				}
				if ( x < RW - 1 ) {
					const j = i + 1,
						d = si - s[ j ];
					if ( d > 0 ) {
						const t = d * SKRIECH * ( 0.4 + 0.6 * ( 1 - pq[ j ] ) );
						fs[ i ] -= t;
						fs[ j ] += t;
					}
				}
				if ( x > 0 ) {
					const j = i - 1,
						d = si - s[ j ];
					if ( d > 0 ) {
						const t = d * SKRIECH * ( 0.4 + 0.6 * ( 1 - pq[ j ] ) );
						fs[ i ] -= t;
						fs[ j ] += t;
					}
				}
				if ( y < RH - 1 ) {
					const j = i + RW,
						d = si - s[ j ];
					if ( d > 0 ) {
						const t = d * SKRIECH * ( 0.4 + 0.6 * ( 1 - pq[ j ] ) );
						fs[ i ] -= t;
						fs[ j ] += t;
					}
				}
				if ( y > 0 ) {
					const j = i - RW,
						d = si - s[ j ];
					if ( d > 0 ) {
						const t = d * SKRIECH * ( 0.4 + 0.6 * ( 1 - pq[ j ] ) );
						fs[ i ] -= t;
						fs[ j ] += t;
					}
				}
			}
		}
		for ( let y = py0; y <= py1; y++ ) {
			for ( let x = px0; x <= px1; x++ ) {
				const i = y * RW + x;
				if ( fs[ i ] ) {
					s[ i ] = Math.min( 1, Math.max( 0, s[ i ] + fs[ i ] ) );
				}
			}
		}

		// 2) Water flux between neighbours, pigment taken upwind. WITH the
		// diagonals: pure 4-neighbour transport is anisotropic and drew
		// 45-degree herringbone through every wash on the fine grid.
		for ( let y = py0; y <= py1; y++ ) {
			const a = y * RW + px0;
			const b = y * RW + px1 + 1;
			fw.fill( 0, a, b );
			fpR.fill( 0, a, b );
			fpG.fill( 0, a, b );
			fpB.fill( 0, a, b );
			fpGr.fill( 0, a, b );
		}
		for ( let y = ay0; y <= ay1; y++ ) {
			for ( let x = ax0; x <= ax1; x++ ) {
				const i = y * RW + x;
				if ( ! M[ i ] ) {
					continue;
				}
				if ( x < RW - 1 ) {
					paar( i, i + 1, false, x, y, 1, 0 );
				}
				if ( y < RH - 1 ) {
					paar( i, i + RW, false, x, y, 0, 1 );
				}
				if ( x < RW - 1 && y < RH - 1 ) {
					paar( i, i + RW + 1, true, x, y, 1, 1 );
				}
				if ( x > 0 && y < RH - 1 ) {
					paar( i, i + RW - 1, true, x, y, -1, 1 );
				}
			}
		}
		for ( let y = py0; y <= py1; y++ ) {
			for ( let x = px0; x <= px1; x++ ) {
				const i = y * RW + x;
				if ( fw[ i ] ) {
					w[ i ] = Math.max( 0, w[ i ] + fw[ i ] );
				}
				if ( fpR[ i ] ) {
					pR[ i ] = Math.max( 0, pR[ i ] + fpR[ i ] );
				}
				if ( fpG[ i ] ) {
					pG[ i ] = Math.max( 0, pG[ i ] + fpG[ i ] );
				}
				if ( fpB[ i ] ) {
					pB[ i ] = Math.max( 0, pB[ i ] + fpB[ i ] );
				}
				if ( fpGr[ i ] ) {
					pGr[ i ] = Math.max( 0, pGr[ i ] + fpGr[ i ] );
				}
			}
		}

		// 3) Settle and lift; 4) evaporate, retreat, rebuild the box.
		S.wet = 0;
		let nx0 = RW,
			ny0 = RH,
			nx1 = -1,
			ny1 = -1;
		for ( let y = ay0; y <= ay1; y++ ) {
			for ( let x = ax0; x <= ax1; x++ ) {
				const i = y * RW + x;
				if ( ! M[ i ] ) {
					continue;
				}
				const wi = w[ i ];
				const gax = S.rx + x;
				const gay = S.ry + y;
				const pqi = pq[ i ];
				const avg = ( pR[ i ] + pG[ i ] + pB[ i ] ) / 3;
				if ( avg > 1e-6 ) {
					const granF = Math.min( 1, pGr[ i ] / avg );
					const wgt =
						( 1 - granF ) * 0.55 +
						granF * ( 0.18 + 1.25 * ( 1 - pqi ) );
					// Quadratic in dryness: while water stands the pigment
					// keeps travelling and settles only in the end phase -
					// settle early and neither ring nor granulation exist,
					// because nothing redistributes any more.
					const dry = 1 - Math.min( 1, wi );
					let dep = DEP * dry * dry * wgt;
					if ( dep > 0.5 ) {
						dep = 0.5;
					}
					if ( dep > 0 ) {
						dR[ i ] += pR[ i ] * dep;
						pR[ i ] *= 1 - dep;
						dG[ i ] += pG[ i ] * dep;
						pG[ i ] *= 1 - dep;
						dB[ i ] += pB[ i ] * dep;
						pB[ i ] *= 1 - dep;
						dGr[ i ] += pGr[ i ] * dep;
						pGr[ i ] *= 1 - dep;
					}
				}
				if ( wi > 0.5 ) {
					let lift = LIFT * ( wi - 0.5 );
					if ( lift > 0.5 ) {
						lift = 0.5;
					}
					pR[ i ] += dR[ i ] * lift;
					dR[ i ] *= 1 - lift;
					pG[ i ] += dG[ i ] * lift;
					dG[ i ] *= 1 - lift;
					pB[ i ] += dB[ i ] * lift;
					dB[ i ] *= 1 - lift;
					pGr[ i ] += dGr[ i ] * lift;
					dGr[ i ] *= 1 - lift;
				}
				// Mask edge over EIGHT neighbours (diagonals half), or the
				// drying fronts grow facetted along the axes. The region
				// border counts as dry.
				let dryN = 0;
				const xl = x > 0,
					xr = x < RW - 1,
					yo = y > 0,
					yu = y < RH - 1;
				if ( ! xl || ! M[ i - 1 ] ) {
					dryN++;
				}
				if ( ! xr || ! M[ i + 1 ] ) {
					dryN++;
				}
				if ( ! yo || ! M[ i - RW ] ) {
					dryN++;
				}
				if ( ! yu || ! M[ i + RW ] ) {
					dryN++;
				}
				if ( ! xl || ! yo || ! M[ i - RW - 1 ] ) {
					dryN += 0.5;
				}
				if ( ! xr || ! yo || ! M[ i - RW + 1 ] ) {
					dryN += 0.5;
				}
				if ( ! xl || ! yu || ! M[ i + RW - 1 ] ) {
					dryN += 0.5;
				}
				if ( ! xr || ! yu || ! M[ i + RW + 1 ] ) {
					dryN += 0.5;
				}
				eF[ i ] = Math.round( dryN );
				// Evaporation varies per cell (smooth paper plus fine cell
				// hash): perfectly even drying makes all fronts meet on the
				// medial axis at once, and the retreat stacks a clean dark
				// CROSS into every rectangular wash.
				w[ i ] -=
					EVAP *
					EVAPK *
					( 1 + EDGEK * dryN ) *
					( 0.7 + 0.4 * pqi + 0.2 * hash( gax, gay ) );
				if ( w[ i ] <= 0.004 ) {
					// The water film RETREATS: part of the leftover pigment
					// travels with it to the still-wet neighbours. Without
					// this every cell dumped into itself and lone rim cells
					// stood as dark beads; with it the rim becomes the
					// continuous dark line a real wash leaves. Count the
					// receivers LIVE - a neighbour may have dried earlier in
					// this same pass, and a distributed share without a
					// receiver would be lost mass (same bug class as the
					// pair caps).
					let bleib = 1;
					if ( pR[ i ] > 0 || pG[ i ] > 0 || pB[ i ] > 0 ) {
						const nb = [];
						if ( xl && M[ i - 1 ] ) {
							nb.push( i - 1 );
						}
						if ( xr && M[ i + 1 ] ) {
							nb.push( i + 1 );
						}
						if ( yo && M[ i - RW ] ) {
							nb.push( i - RW );
						}
						if ( yu && M[ i + RW ] ) {
							nb.push( i + RW );
						}
						if ( nb.length ) {
							bleib = 1 - RUECK;
							const teil = RUECK / nb.length;
							for ( const j of nb ) {
								pR[ j ] += pR[ i ] * teil;
								pG[ j ] += pG[ i ] * teil;
								pB[ j ] += pB[ i ] * teil;
								pGr[ j ] += pGr[ i ] * teil;
							}
						}
					}
					dR[ i ] += pR[ i ] * bleib;
					pR[ i ] = 0;
					dG[ i ] += pG[ i ] * bleib;
					pG[ i ] = 0;
					dB[ i ] += pB[ i ] * bleib;
					pB[ i ] = 0;
					dGr[ i ] += pGr[ i ] * bleib;
					pGr[ i ] = 0;
					w[ i ] = 0;
					M[ i ] = 0;
				} else {
					S.wet++;
					if ( x < nx0 ) {
						nx0 = x;
					}
					if ( x > nx1 ) {
						nx1 = x;
					}
					if ( y < ny0 ) {
						ny0 = y;
					}
					if ( y > ny1 ) {
						ny1 = y;
					}
				}
				if ( x < dx0 ) {
					dx0 = x;
				}
				if ( x > dx1 ) {
					dx1 = x;
				}
				if ( y < dy0 ) {
					dy0 = y;
				}
				if ( y > dy1 ) {
					dy1 = y;
				}
			}
		}
		bx0 = nx0;
		by0 = ny0;
		bx1 = nx1;
		by1 = ny1;
	}

	S.steps = ( n ) => {
		for ( let k = 0; k < n; k++ ) {
			substep();
		}
	};

	/** Instant dry: settle everything, clear the water. */
	S.dryAll = () => {
		const n = S.rw * S.rh;
		for ( let i = 0; i < n; i++ ) {
			if ( pR[ i ] || pG[ i ] || pB[ i ] ) {
				dR[ i ] += pR[ i ];
				pR[ i ] = 0;
				dG[ i ] += pG[ i ];
				pG[ i ] = 0;
				dB[ i ] += pB[ i ];
				pB[ i ] = 0;
				dGr[ i ] += pGr[ i ];
				pGr[ i ] = 0;
			}
			w[ i ] = 0;
			M[ i ] = 0;
			if ( s[ i ] > 0.15 ) {
				s[ i ] = 0.15;
			}
		}
		S.wet = 0;
		bx0 = S.rw;
		by0 = S.rh;
		bx1 = -1;
		by1 = -1;
		dx0 = 0;
		dy0 = 0;
		dx1 = S.rw - 1;
		dy1 = S.rh - 1;
	};

	/** Dirty boxes for the caller's overlay, region-relative grid cells. */
	S.takeDirty = () => {
		const out = {
			hot: hx1 >= hx0 ? { x0: hx0, y0: hy0, x1: hx1, y1: hy1 } : null,
			sim: dx1 >= dx0 ? { x0: dx0, y0: dy0, x1: dx1, y1: dy1 } : null,
		};
		hx0 = S.rw;
		hy0 = S.rh;
		hx1 = -1;
		hy1 = -1;
		dx0 = S.rw;
		dy0 = S.rh;
		dx1 = -1;
		dy1 = -1;
		return out;
	};

	/* ------------------------------------------------------------------ *
	 * Rendering: straight-alpha RGBA into a caller buffer that covers the
	 * REGION at full document resolution. Ink approximation: transmittance
	 * t = exp(-density) per channel; a = 1 - mean(t); c = 1 - (1-t)/a.
	 * Exact over white by construction, and used identically for the live
	 * overlay and the final bake, so drying never pops.
	 * ------------------------------------------------------------------ */

	const EXPL = new Float32Array( 8192 );
	for ( let i = 0; i < 8192; i++ ) {
		EXPL[ i ] = Math.exp( -i / 1024 );
	}
	const expl = ( x ) => EXPL[ x * 1024 > 8191 ? 8191 : ( x * 1024 ) | 0 ];

	S.renderInk = ( buf, gx0, gy0, gx1, gy1 ) => {
		const RW = S.rw;
		const RH = S.rh;
		gx0 = Math.max( 0, gx0 - 2 );
		gy0 = Math.max( 0, gy0 - 2 );
		gx1 = Math.min( RW - 1, gx1 + 2 );
		gy1 = Math.min( RH - 1, gy1 + 2 );
		// Per-cell precompute, so each PIXEL only mixes.
		const cx0 = Math.max( 0, gx0 - 2 );
		const cx1 = Math.min( RW - 1, gx1 + 2 );
		const cy0 = Math.max( 0, gy0 - 2 );
		const cy1 = Math.min( RH - 1, gy1 + 2 );
		for ( let gy = cy0; gy <= cy1; gy++ ) {
			for ( let gx = cx0; gx <= cx1; gx++ ) {
				const i = gy * RW + gx;
				const r = dR[ i ] + pR[ i ];
				const g = dG[ i ] + pG[ i ];
				const b = dB[ i ] + pB[ i ];
				cDenR[ i ] = r;
				cDenG[ i ] = g;
				cDenB[ i ] = b;
				const avg = ( r + g + b ) / 3;
				cGran[ i ] =
					avg > 1e-5
						? Math.min( 1, ( dGr[ i ] + pGr[ i ] ) / avg )
						: 0;
			}
		}
		const x0 = gx0 * SC;
		const x1 = Math.min( RW * SC - 1, gx1 * SC + SC - 1 );
		const y0 = gy0 * SC;
		const y1 = Math.min( RH * SC - 1, gy1 * SC + SC - 1 );
		const stride = RW * SC;
		const korn = 0.55;
		const TM = TILE - 1;
		for ( let y = y0; y <= y1; y++ ) {
			const docY = ( S.ry * SC + y ) & TM;
			for ( let x = x0; x <= x1; x++ ) {
				const docX = ( S.rx * SC + x ) & TM;
				const it = docY * TILE + docX;
				// QUADRATIC B-SPLINE over 3x3 cells: bilinear (with or
				// without smoothstep) lets the cell structure show - ramps
				// kink at every cell border, unevenly loaded neighbours
				// read as tiles. Read position shifted by the warp field so
				// edges follow paper fibres instead of the grid.
				let ux = ( x + warpXT[ it ] ) / SC - 0.5;
				let uy = ( y + warpYT[ it ] ) / SC - 0.5;
				if ( ux < 0 ) {
					ux = 0;
				} else if ( ux > RW - 1.001 ) {
					ux = RW - 1.001;
				}
				if ( uy < 0 ) {
					uy = 0;
				} else if ( uy > RH - 1.001 ) {
					uy = RH - 1.001;
				}
				const ixc = ( ux + 0.5 ) | 0;
				const fx = ux + 0.5 - ixc;
				const iyc = ( uy + 0.5 ) | 0;
				const fy = uy + 0.5 - iyc;
				const wxm = 0.5 * ( 1 - fx ) * ( 1 - fx ),
					wxp = 0.5 * fx * fx,
					wx0 = 1 - wxm - wxp;
				const wym = 0.5 * ( 1 - fy ) * ( 1 - fy ),
					wyp = 0.5 * fy * fy,
					wy0 = 1 - wym - wyp;
				const xm = ixc > 0 ? ixc - 1 : 0;
				const xp = ixc + 1 < RW ? ixc + 1 : RW - 1;
				const rm = ( iyc > 0 ? iyc - 1 : 0 ) * RW;
				const r0 = iyc * RW;
				const rp = ( iyc + 1 < RH ? iyc + 1 : RH - 1 ) * RW;
				const j0 = rm + xm,
					j1 = rm + ixc,
					j2 = rm + xp;
				const j3 = r0 + xm,
					j4 = r0 + ixc,
					j5 = r0 + xp;
				const j6 = rp + xm,
					j7 = rp + ixc,
					j8 = rp + xp;
				const k0 = wym * wxm,
					k1 = wym * wx0,
					k2 = wym * wxp;
				const k3 = wy0 * wxm,
					k4 = wy0 * wx0,
					k5 = wy0 * wxp;
				const k6 = wyp * wxm,
					k7 = wyp * wx0,
					k8 = wyp * wxp;
				let denR =
					cDenR[ j0 ] * k0 +
					cDenR[ j1 ] * k1 +
					cDenR[ j2 ] * k2 +
					cDenR[ j3 ] * k3 +
					cDenR[ j4 ] * k4 +
					cDenR[ j5 ] * k5 +
					cDenR[ j6 ] * k6 +
					cDenR[ j7 ] * k7 +
					cDenR[ j8 ] * k8;
				let denG =
					cDenG[ j0 ] * k0 +
					cDenG[ j1 ] * k1 +
					cDenG[ j2 ] * k2 +
					cDenG[ j3 ] * k3 +
					cDenG[ j4 ] * k4 +
					cDenG[ j5 ] * k5 +
					cDenG[ j6 ] * k6 +
					cDenG[ j7 ] * k7 +
					cDenG[ j8 ] * k8;
				let denB =
					cDenB[ j0 ] * k0 +
					cDenB[ j1 ] * k1 +
					cDenB[ j2 ] * k2 +
					cDenB[ j3 ] * k3 +
					cDenB[ j4 ] * k4 +
					cDenB[ j5 ] * k5 +
					cDenB[ j6 ] * k6 +
					cDenB[ j7 ] * k7 +
					cDenB[ j8 ] * k8;
				const o = ( y * stride + x ) * 4;
				const avgDen = ( denR + denG + denB ) / 3;
				let tR = 1,
					tG = 1,
					tB = 1;
				if ( avgDen > 1e-4 ) {
					const g = paperFT[ it ];
					// Fibre edge: below a small density the paper tooth
					// fades the paint out, so a stroke ends in fibres
					// instead of a machine ramp.
					if ( avgDen < 0.07 ) {
						let t = ( avgDen * ( 0.45 + 1.1 * g ) ) / 0.07;
						if ( t < 1 ) {
							t = t * t * ( 3 - 2 * t );
							denR *= t;
							denG *= t;
							denB *= t;
						}
					}
					const granLoc =
						cGran[ j0 ] * k0 +
						cGran[ j1 ] * k1 +
						cGran[ j2 ] * k2 +
						cGran[ j3 ] * k3 +
						cGran[ j4 ] * k4 +
						cGran[ j5 ] * k5 +
						cGran[ j6 ] * k6 +
						cGran[ j7 ] * k7 +
						cGran[ j8 ] * k8;
					// Asymmetric grain: pigment settles into the VALLEYS, so
					// valleys darken; ridges barely lighten, or white pin
					// pricks appear on every wash.
					const delta = 0.5 - g;
					const amp = korn * 1.6 * ( 0.35 + 0.85 * granLoc );
					let mod = 1 + delta * amp * ( delta > 0 ? 1 : 0.45 );
					if ( mod < 0.35 ) {
						mod = 0.35;
					}
					tR = expl( denR * mod );
					tG = expl( denG * mod );
					tB = expl( denB * mod );
				}
				// The wet sheen sits ON TOP: damp paper reads darker and a
				// touch cooler. Folded into the transmittance so overlay
				// and bake stay one formula (once dry it is exactly zero).
				const wl =
					w[ j0 ] * k0 +
					w[ j1 ] * k1 +
					w[ j2 ] * k2 +
					w[ j3 ] * k3 +
					w[ j4 ] * k4 +
					w[ j5 ] * k5 +
					w[ j6 ] * k6 +
					w[ j7 ] * k7 +
					w[ j8 ] * k8;
				if ( wl > 0.01 ) {
					const k = Math.min( 1, wl );
					tR *= 1 - 0.055 * k;
					tG *= 1 - 0.048 * k;
					tB *= 1 - 0.03 * k;
				}
				// Ink mapping. Straight alpha for putImageData.
				const a = 1 - ( tR + tG + tB ) / 3;
				if ( a <= 0.002 ) {
					buf[ o ] = 0;
					buf[ o + 1 ] = 0;
					buf[ o + 2 ] = 0;
					buf[ o + 3 ] = 0;
					continue;
				}
				let cR = 1 - ( 1 - tR ) / a;
				let cG = 1 - ( 1 - tG ) / a;
				let cB = 1 - ( 1 - tB ) / a;
				if ( cR < 0 ) {
					cR = 0;
				}
				if ( cG < 0 ) {
					cG = 0;
				}
				if ( cB < 0 ) {
					cB = 0;
				}
				buf[ o ] = 255 * cR;
				buf[ o + 1 ] = 255 * cG;
				buf[ o + 2 ] = 255 * cB;
				buf[ o + 3 ] = 255 * a;
			}
		}
		return { x0, y0, x1, y1 };
	};

	/* Test hooks: mass totals, so conservation is provable. */
	S.totals = () => {
		let susp = 0;
		let dep = 0;
		let water = 0;
		const n = S.rw * S.rh;
		for ( let i = 0; i < n; i++ ) {
			susp += pR[ i ] + pG[ i ] + pB[ i ];
			dep += dR[ i ] + dG[ i ] + dB[ i ];
			water += w[ i ];
		}
		return { susp, dep, water };
	};
	S.cellAt = ( gx, gy ) => {
		const i = ( gy - S.ry ) * S.rw + ( gx - S.rx );
		return {
			w: w[ i ],
			dep: dR[ i ] + dG[ i ] + dB[ i ],
			susp: pR[ i ] + pG[ i ] + pB[ i ],
		};
	};

	return S;
}

export const WET_SC = SC;
