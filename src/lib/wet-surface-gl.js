/**
 * The wet paint simulation on the GPU (WebGL2) - watercolour and, since the
 * Kubelka-Munk extension, every wet style up to opaque paint.
 *
 * lib/wet-surface.js is the tuned, jest-proven physics REFERENCE (water,
 * flux, settling); this is the production engine. The CPU engine failed in
 * the editor (fan verdict), so this module does what the brush-revamp spec
 * reserved for that case: WebGL as an ISLAND. Simulation and ink rendering
 * live in one self-contained context that hands finished pixels to the
 * Canvas-2D pipeline - the document renderer stays 2D-only, like the 3D
 * studios.
 *
 * PIGMENT MODEL (the "Spectral" mixing): every pigment carries absorption
 * K.rgb AND scattering S.rgb, i.e. three-channel Kubelka-Munk - the same
 * physics family Spectral.js implements with 38 bands, reduced to three
 * because these are simulated FIELDS (38 bands would be ten more state
 * textures for a nuance). K and S amounts add linearly in the water, which
 * IS pigment mixing: blue + yellow settles to green, white + red to pink,
 * everything drifts toward mud the way real paint does. A transparent
 * pigment simply has S = 0, and the render formula then reduces EXACTLY to
 * the approved watercolour ink mapping - the extension cannot change the
 * accepted look.
 *
 * GPU specifics, each one paid for:
 * - The CPU pair loop is a GATHER: both sides evaluate the identical
 *   antisymmetric pair flux, so mass conserves without shared deltas. The
 *   per-pair jitter keys to the pair's OWNER cell, or the sides disagree.
 * - Four MRT passes per substep (wasser, fluss, trocknen a/b - the drying
 *   pass splits because five draw buffers are not guaranteed, four are).
 * - Stamps accumulate on the CPU as FLOATS and upload as one RGBA32F
 *   subrect: batching dabs through a canvas saturates alpha at one and
 *   starves the film to a quarter of the calibration (measured).
 * - The ink pass Y-FLIPS: WebGL's origin is bottom-left, the 2D pipeline
 *   reads top-left. Only this pass - the sim passes are texture-to-texture
 *   and internally consistent. Probes need ASYMMETRIC shapes to catch
 *   orientation bugs; all symmetric scenes were blind to it.
 * - Every step only runs where something can still change: the ACTIVE
 *   RECT (wet or damp cells and one neighbour) scissors all five passes,
 *   and the ink render redraws only what moved. "Still wet?" and
 *   "where?" come from one column/row reduction over that rect, read
 *   back asynchronously - never a stall, never a field readback. The
 *   contract that keeps this bit-exact lives in wet-gl-active.js.
 *
 * The only imports are that bookkeeping and the drawing paper's tooth; the
 * standalone harness that once loaded this file directly from the dev
 * docroot is retired.
 *
 * WHAT THE ANALYSIS OF 09.11.2026 CHANGED (each measured: the reference's
 * jest tests "a level film", the brush lab's probes "field" and "aqua"):
 * - A WOVEN PATTERN lay over every wash, four pixels apart. It was not
 *   paper: a level film laid without any brush dried into it. Two rules
 *   made it, each on its own. The levelling per step (FLOW 0.44 over eight
 *   neighbours) is several times what an explicit scheme carries, so the
 *   water rocked between neighbouring cells by 41 % of its depth for as
 *   long as it stood; and the edge sog held for every single cell, so
 *   when the film broke up at the end every hole pulled pigment around
 *   itself like a tiny stroke edge. Now the levelling follows the
 *   SMOOTHED head (the alternating mode gets no drive, a small plain term
 *   damps it), and the sog acts at real edges of a film that still flows.
 * - With the film at rest the water carried its pigment to the rim far
 *   better than the calibration had ever seen (it was tuned while the
 *   water rocked): the middle of a wash emptied by a quarter, a hard edge
 *   drew itself at 2.8 times the wash, every stub ended in a black bead.
 *   A cell fuller than its source now takes less (CROWD), a tip or a
 *   lone cell hardly any (TIP_FROM), no cell evaporates faster than a
 *   straight edge (EDGE_DRY) - and THIN WATER HARDLY FLOWS (THIN): a film
 *   a hair deep ran across half the sheet as freely as a puddle, so the
 *   last of a wash dragged what it carried to the far rim. A charge
 *   dropped wet in wet stays a mark now, and a backrun ends in the dark
 *   line where its water gives out. A stroke keeps the rim it always had.
 * - INK STAINS (uStainK): it takes to the fibres where it lands instead
 *   of floating until the water has gone. A fine line is a staircase on
 *   the grid, all of it rim, its water never level - floating ink was
 *   carried along it and dried in a bead per step. The sog pulls from the
 *   wash to its rim only, never between two rim cells.
 * - The sheet is not evenly SIZED: how readily it takes water on varies
 *   at the scale of a fingertip (the second channel of the Q tile). Thin
 *   water, a front of deep water running into shallow, flooding and the
 *   creep through the fibres follow it. It takes the compass out of a
 *   backrun's outline - no more than that: the lobes of a real bloom it
 *   does not make (measured in the lab's "backrun" probe; the front ends
 *   where the water is level, and level does not ask the paper).
 * - THE CONTOUR is drawn by COVERAGE. Every cell knows WHICH of its four
 *   pixels the wash has wetted (four bits; the editor draws its segments
 *   at twice the grid for it; they ride in the fourth channel of the
 *   scattering fields and settle with them). The render reads pigment
 *   over coverage as the density of the paint where it lies, and the
 *   coverage alone draws the edge. Reading the blurred
 *   pigment itself, a dark stroke showed its edge far out in the tail of
 *   the spline, where the stairs of the grid are all there is: beads
 *   along every ink line, and a fine line broke into dashes wherever it
 *   ran between two rows of cells.
 * - The grain is the PAPER'S again: the fine tile carries the felt and
 *   fibre of the drawing sheet (dry-grain.js); it was all but smooth,
 *   and what read as grain in a wash was that woven pattern.
 * - SIX BANDS (params.bands, pigment-bands.js): a transparent wash has no
 *   scattering, so its three scattering channels carry three more bands
 *   of absorption - blue into yellow is a green, a glaze over the dried
 *   layer mixes band by band. Without the param everything runs in three
 *   channels as before (the extensions' own drivers).
 */

import { toothTile } from './dry-grain';
import { BANDS_GLSL } from './pigment-bands';
import {
	addRect,
	createFrameFence,
	createTileProbe,
	growTo,
	rectGrow,
	rectShift,
	rectTriangles,
	TILE as ACTIVE_TILE,
	tileAny,
	tileBox,
	tileCells,
	tileGrow,
	tileMark,
	tileMask,
	tileRects,
	tileShift,
	tileUnion,
	wetReplay,
} from './wet-gl-active';

const SC = 2; // cell size in document pixels (the tuned calibration)
// Generous on purpose: every grow resizes (= clears) the island canvas,
// and even with the atomic handover a grow costs texture copies. At 48
// cells a fast stroke grew every few frames - the flicker Thomas saw.
// The reservation around a first touch; a grow reserves twice that on
// the side it moves, and only a stamp nearer than REGION_SLACK to an
// edge grows at all (wet-gl-active.js growTo).
const MARGIN = 128; // grid cells of slack around a stroke
const MAX_CELLS = 4194304; // 2048x2048 cells; the GPU can afford it
// The ink render reads a 3x3 B-spline around a position warped up to 3.2
// px along the fibres, so a changed cell shows up to three cells away.
const RENDER_PAD = 4;
// Three numbers of the physics that the ACTIVE RECT leans on, written
// into the shaders from here so the two cannot drift apart: paper damper
// than DAMP still dries out (the cell is active), paper damper than CREEP
// wicks its moisture on through the fibres, at SKRIECH per neighbour.
const DAMP = 0.003;
const CREEP = 0.3;
const SKRIECH = 0.02;

const TILE = 512; // noise tile in document pixels
const TILEG = TILE / SC;

/* ------------------------------ noise tiles ----------------------------- */

function hash( x, y ) {
	let h = ( ( x | 0 ) * 374761393 + ( y | 0 ) * 668265263 ) | 0;
	h = ( h ^ ( h >> 13 ) ) * 1274126177;
	return ( ( h ^ ( h >> 16 ) ) >>> 0 ) / 4294967296;
}

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

/**
 * The SIZING of the sheet, grid cells: how readily the fibres take water
 * on, uneven at the scale of a fingertip the way the size lies in a real
 * sheet. 0 = slow paper, 1 = thirsty.
 */
function buildSizingTile() {
	const t = new Float32Array( TILEG * TILEG );
	const wrap = ( v ) => ( ( v % TILEG ) + TILEG ) % TILEG;
	for ( let y = 0; y < TILEG; y++ ) {
		for ( let x = 0; x < TILEG; x++ ) {
			// The coordinates are warped a little, so no patch is round.
			const u = wrap( x + ( pnoise( x, y, TILEG, 7, 401 ) - 0.5 ) * 22 );
			const v = wrap( y + ( pnoise( x, y, TILEG, 7, 409 ) - 0.5 ) * 22 );
			const n =
				0.5 * pnoise( u, v, TILEG, 9, 433 ) +
				0.32 * pnoise( u, v, TILEG, 21, 439 ) +
				0.18 * pnoise( u, v, TILEG, 47, 443 );
			// The middle stretched: patches, not a haze.
			const c = Math.min( 1, Math.max( 0, 0.5 + ( n - 0.5 ) * 3.2 ) );
			t[ y * TILEG + x ] = c * c * ( 3 - 2 * c );
		}
	}
	return t;
}

/** The Q tile as the island carries it: r = paper, g = sizing. */
function packQTile( paperQ ) {
	const sizing = buildSizingTile();
	const out = new Float32Array( TILEG * TILEG * 2 );
	for ( let i = 0; i < TILEG * TILEG; i++ ) {
		out[ i * 2 ] = paperQ[ i ];
		out[ i * 2 + 1 ] = sizing[ i ];
	}
	return out;
}

/** Grid-cell paper tile (R channel, drives flow and settling). */
function buildPaperQTile( pap ) {
	const t = new Float32Array( TILEG * TILEG );
	// The PAPER dials (document setting): kont scales the tooth contrast
	// (hot press is nearly flat, rough bites), freq the feature size,
	// gewebe adds a canvas weave, rippen laid lines. WITHOUT a paper the
	// original expressions run untouched - the calibration is bit-exact.
	const freq = pap ? Math.max( 1, Math.round( 27 * pap.freq ) ) : 27;
	const f2 = pap ? Math.max( 1, Math.round( 60 * pap.freq ) ) : 60;
	const f3 = pap ? Math.max( 1, Math.round( 70 * pap.freq ) ) : 70;
	for ( let y = 0; y < TILEG; y++ ) {
		for ( let x = 0; x < TILEG; x++ ) {
			// Integer lattice counts keep the tile seamless. NO raw
			// per-cell hash: settling weights read this field, and a value
			// jumping cell to cell paints 4px tiles into every wash.
			let q =
				0.5 * pnoise( x, y, TILEG, freq, 11 ) +
				0.3 * pnoise( x, y, TILEG, f2, 211 ) +
				0.2 * pnoise( x, y, TILEG, f3, 311 );
			if ( pap ) {
				if ( pap.gewebe ) {
					q =
						0.65 * q +
						0.35 *
							( 0.5 +
								0.5 *
									Math.sin(
										( x * 2 * Math.PI * 64 ) / TILEG
									) *
									Math.sin(
										( y * 2 * Math.PI * 64 ) / TILEG + 1.3
									) );
				}
				if ( pap.rippen ) {
					q =
						0.7 * q +
						0.3 *
							( 0.5 +
								0.5 *
									Math.sin(
										( y * 2 * Math.PI * 48 ) / TILEG
									) );
				}
				q = Math.min( 1, Math.max( 0, 0.5 + ( q - 0.5 ) * pap.kont ) );
			}
			t[ y * TILEG + x ] = q;
		}
	}
	return t;
}

/** The Q tile read between its cells (it lies at half resolution). */
function paperQAt( paperQ, x, y ) {
	const u = x / SC - 0.5;
	const v = y / SC - 0.5;
	const x0 = Math.floor( u );
	const y0 = Math.floor( v );
	const fx = u - x0;
	const fy = v - y0;
	const at = ( i, j ) =>
		paperQ[
			( ( ( j % TILEG ) + TILEG ) % TILEG ) * TILEG +
				( ( ( i % TILEG ) + TILEG ) % TILEG )
		];
	return (
		at( x0, y0 ) * ( 1 - fx ) * ( 1 - fy ) +
		at( x0 + 1, y0 ) * fx * ( 1 - fy ) +
		at( x0, y0 + 1 ) * ( 1 - fx ) * fy +
		at( x0 + 1, y0 + 1 ) * fx * fy
	);
}

/** Full-res tile: R = paper tooth, G/B = warp x/y (quantized). */
function buildPaperFTile( paperQ, pap ) {
	// The felt and fibre of the sheet (dry-grain.js): what granulation
	// settles into. The tooth used to be the coarse relief plus a hash
	// blurred twice - neighbouring pixels alike to 98 %, no grain at all;
	// what read as grain in a wash was the simulation's own woven pattern.
	const tooth = toothTile( pap || null );
	// Fine tooth: hash blurred twice with wrap-around (one pass left a
	// checkerboard shimmer in saturated areas), contrast stretched back.
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
	const out = new Uint8Array( TILE * TILE * 4 );
	for ( let y = 0; y < TILE; y++ ) {
		for ( let x = 0; x < TILE; x++ ) {
			const i = y * TILE + x;
			let f = ( from[ i ] - 0.5 ) * 3 + 0.5;
			f = f < 0 ? 0 : f > 1 ? 1 : f;
			// Read BETWEEN the cells: taken from the nearest one, the coarse
			// relief came in blocks of 2 x 2 pixels.
			const gq = paperQAt( paperQ, x, y );
			let pf =
				0.3 * gq +
				0.2 * pnoise( x, y, TILE, 44, 71 ) +
				0.12 * f +
				0.38 * tooth[ i ];
			if ( pap ) {
				if ( pap.gewebe ) {
					pf =
						0.7 * pf +
						0.3 *
							( 0.5 +
								0.5 *
									Math.sin(
										( x * 2 * Math.PI * 128 ) / TILE
									) *
									Math.sin(
										( y * 2 * Math.PI * 128 ) / TILE + 1.3
									) );
				}
				if ( pap.rippen ) {
					pf =
						0.75 * pf +
						0.25 *
							( 0.5 +
								0.5 *
									Math.sin(
										( y * 2 * Math.PI * 96 ) / TILE
									) );
				}
				pf = Math.min(
					1,
					Math.max( 0, 0.5 + ( pf - 0.5 ) * pap.kont )
				);
			}
			// Long wave strong, fine octave quiet - the other way round
			// the stroke edge becomes a seam of cell-sized knobs.
			const wx =
				( pnoise( x, y, TILE, 23, 911 ) - 0.5 ) * 4.2 +
				( pnoise( x, y, TILE, 123, 555 ) - 0.5 ) * 0.9;
			const wy =
				( pnoise( x, y, TILE, 23, 137 ) - 0.5 ) * 4.2 +
				( pnoise( x, y, TILE, 123, 353 ) - 0.5 ) * 0.9;
			out[ i * 4 ] = Math.max(
				0,
				Math.min( 255, Math.round( pf * 255 ) )
			);
			out[ i * 4 + 1 ] =
				128 + Math.max( -127, Math.min( 127, Math.round( wx * 40 ) ) );
			out[ i * 4 + 2 ] =
				128 + Math.max( -127, Math.min( 127, Math.round( wy * 40 ) ) );
			out[ i * 4 + 3 ] = 255;
		}
	}
	return out;
}

/* -------------------------------- shaders ------------------------------- */

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4( aPos, 0.0, 1.0 ); }
`;

/*
 * Shared chunk: the SC = 2 calibration (see wet-surface.js for why every
 * value is what it is), paper lookup, pair jitter, and the settle/lift
 * transfer as a pure function so the split drying passes cannot drift.
 */
const CHUNK = `
precision highp float;
precision highp int;
precision highp sampler2D;

#define FLOW 0.44
// The share of FLOW that works on the plain difference of two neighbours;
// the rest works on the SMOOTHED head (fluss). Eight neighbours at 0.44
// are several times what an explicit step carries: a cell above its
// neighbours overshot to below them and back. The alternating mode gets
// no drive at all from the smoothed head - this small plain term is what
// damps it. Slopes longer than a few cells level as fast as they always
// did. (wet-surface.js carries the same numbers and the jest proof.)
#define FLOWD 0.03
// The edge sog works on a film that still flows; in the last film it
// would only herd the pigment around every hole that opens.
#define SOG_THIN 0.02
#define SOG_FULL 0.12
// How the pigment rides the water (see wet-surface.js, where each of
// these is told at length and proven in jest): 1.2 instead of 1.4, less
// into a cell that already carries more than its source, hardly any into
// a tip, a tip dries like an edge and not three times as fast - and
// below THIN the levelling falls off with the depth of the shallower
// cell: thin water hardly flows.
#define MOB 1.2
#define THIN 0.3
#define THIN_FLOOR 0.03
#define CROWD 6.0
#define TIP_FROM 3.0
#define EDGE_DRY 2.0
#define EVAP 0.000275
#define EDGEK 0.35
// The most water one step evaporates, in EVAP x uEvapK. It was (1 + EDGEK
// x 6) x (0.7 + 0.4 + 0.2) = 4.03 while every dry neighbour counted; with
// EDGE_DRY it is 2.21, and the old bound simply stays on the safe side.
// Trocknen a leans on it; change the evaporation term and this changes
// with it.
#define DIE_MAX 4.1
#define DEP 0.002
#define LIFT 0.06
#define REWET 0.35
#define FLUT 0.12
#define SKRIECH ${ SKRIECH }
// (0.007 until 09.11.2026: over the life of a deep wash that alone carried
// a charge fifteen cells from where it was dropped.)
#define PDIFF 0.002
#define TRINK 0.0025
#define SOG 0.09
#define RUECK ${ String( 1 - Math.pow( 0.65, SC / 4 ) ) }

// The painterly dials, set per wash: drying speed, edge-sog strength
// (= the dark drying rim), settle and lift multipliers (the styles).
uniform float uEvapK;
uniform float uSogK;
uniform float uDepK;
uniform float uLiftK;
// VISKOSITAET - der Unterschied zwischen den Medien: 1 = freies Wasser
// (Aquarell fliesst, blueht, kriecht), ~0.1 = Paste (Gouache/Acryl
// bleiben stehen), ~0.15 = zaehes Oel, ~0 = trockene Kohle. Skaliert
// JEDEN seitlichen Transport: Fluss, Sog, Fluten, Kriechen, Diffusion.
uniform float uViscK;
// How readily standing water redissolves the LAYER under the wash
// (the seeded ground pigment). 0 = never (dry styles, no ground).
uniform float uSeedK;
// STAINING: the share of the settling that does not wait for the water
// to go (0 = watercolour as calibrated). Ink stains.
uniform float uStainK;
// 1 = SIX BANDS of absorption: K carries bands 1 to 3, the scattering
// side bands 4 to 6 (a transparent wash scatters nothing). 0 = three
// channels of absorption and three of scattering, as ever.
uniform float uBands;

uniform ivec2 uSize;    // region size in cells
uniform ivec2 uOrigin;  // region origin in ABSOLUTE cells
uniform sampler2D uPQ;  // paper (r) and sizing (g), grid cells, wrapped

float pq( ivec2 cell ) {
	ivec2 a = cell + uOrigin;
	return texelFetch(
		uPQ,
		ivec2( a.x & ${ TILEG - 1 }, a.y & ${ TILEG - 1 } ),
		0
	).r;
}

// The four pixels of a cell as bits (see "the contour" in the header),
// joined.
float wetBits( float a, float b ) {
	return float( int( a + 0.5 ) | int( b + 0.5 ) );
}
// Paper (x) and sizing (y) of a cell in ONE fetch - the flux asks for both
// of every neighbour, and on a weak card a pass is its texture reads.
// Sizing is how readily the sheet takes water on, 0.3 .. 1; never more
// than one: the active set's reach counts on the creep of one step.
vec2 sheet( ivec2 cell ) {
	ivec2 a = cell + uOrigin;
	vec2 t = texelFetch(
		uPQ,
		ivec2( a.x & ${ TILEG - 1 }, a.y & ${ TILEG - 1 } ),
		0
	).rg;
	return vec2( t.x, 0.3 + 0.7 * t.y );
}

float hash2( ivec2 p ) {
	uint h = uint( p.x ) * 374761393u + uint( p.y ) * 668265263u;
	h = ( h ^ ( h >> 13u ) ) * 1274126177u;
	return float( h ^ ( h >> 16u ) ) / 4294967296.0;
}

float cellHash( ivec2 cell ) { return hash2( cell + uOrigin ); }

// Eight neighbour directions; the first four pairs are the ones the CPU
// loop "owned" from this cell, the mirrored four belong to the neighbour.
// The per-pair jitter keys to the OWNER, or the two sides of a pair
// disagree and the gather stops conserving mass.
const ivec2 DIRS[8] = ivec2[8](
	ivec2( 1, 0 ), ivec2( 0, 1 ), ivec2( 1, 1 ), ivec2( -1, 1 ),
	ivec2( -1, 0 ), ivec2( 0, -1 ), ivec2( -1, -1 ), ivec2( 1, -1 )
);

float pairJitter( ivec2 cell, int d ) {
	ivec2 a = cell + uOrigin;
	ivec2 dir = DIRS[ d ];
	if ( d >= 4 ) {
		a += dir;
		dir = -dir;
	}
	return 0.7 + 0.6 * hash2( 2 * a + dir );
}

/*
 * Settle + lift on a snapshot, PURE - both drying passes call this with
 * identical inputs, so the suspended side (pass a) and the settled side
 * (pass b) can never disagree. Quadratic in dryness: while water stands
 * the pigment keeps travelling and settles only in the end phase; settle
 * early and neither ring nor granulation exist.
 */
void transferFate(
	float w, float pqc,
	inout vec3 pk, inout float gran, inout vec3 ps,
	inout vec3 dk, inout float dgran, inout vec3 ds
) {
	float avg = uBands > 0.5
		? ( pk.r + pk.g + pk.b + ps.r + ps.g + ps.b ) / 6.0
		: ( pk.r + pk.g + pk.b ) / 3.0;
	if ( avg > 1e-6 ) {
		float granF = min( 1.0, gran / avg );
		float wgt = ( 1.0 - granF ) * 0.55 +
			granF * ( 0.18 + 1.25 * ( 1.0 - pqc ) );
		float dry = 1.0 - min( 1.0, w );
		float dep = min( 0.5, DEP * uDepK * ( dry * dry + uStainK ) * wgt );
		if ( dep > 0.0 ) {
			dk += pk * dep;
			ds += ps * dep;
			dgran += gran * dep;
			pk *= 1.0 - dep;
			ps *= 1.0 - dep;
			gran *= 1.0 - dep;
		}
	}
	if ( w > 0.5 ) {
		float lift = min( 0.5, LIFT * uLiftK * ( w - 0.5 ) );
		pk += dk * lift;
		ps += ds * lift;
		gran += dgran * lift;
		dk *= 1.0 - lift;
		ds *= 1.0 - lift;
		dgran *= 1.0 - lift;
	}
}

/*
 * Rewetting the LAYER under the wash (stage 2 of the layer reaction).
 * The ground's pixels are seeded per cell as absorbing pigment
 * (sd = K.rgb, 1 + remaining fraction; a < 1 = virgin cell). Standing
 * water redissolves it like the deposit lift, scaled by uSeedK - dried
 * paint holds tighter than fresh sediment, ink stains and barely moves.
 * PURE and shared: the suspended side (trocknen a) and the seed side
 * (trocknen c) call it with identical inputs and cannot drift apart.
 */
vec3 seedLift( float w, inout vec4 sd ) {
	if ( sd.a < 1.0 || w <= 0.5 || uSeedK <= 0.0 ) {
		return vec3( 0.0 );
	}
	float lift = min( 0.5, LIFT * uSeedK * ( w - 0.5 ) );
	vec3 up = sd.rgb * lift;
	sd.rgb *= 1.0 - lift;
	sd.a = 1.0 + ( sd.a - 1.0 ) * ( 1.0 - lift );
	return up;
}
`;

/*
 * Pass 1, "wasser": the paper drinks (costs water, saturated paper stops -
 * without the cost a wash crept until the whole canvas stood under water),
 * saturation creeps through the fibres, and the frame's queued stamps fold
 * in. Water lies as a puddle with a MENISCUS: a tapering profile starves
 * the rim below the flood threshold and the coffee ring dies.
 */
const FRAG_WASSER = `#version 300 es
__CHUNK__

uniform sampler2D uW;
uniform sampler2D uPK;
uniform sampler2D uPS;
// Frame stamp accumulator, RGBA32F: R = summed meniscus water, G = summed
// alpha, B = WHICH of the cell's four pixels the dabs wetted (bits).
// Accumulated per dab on the CPU - canvas compositing saturates
// alpha at one, which starved the film to a quarter of the calibration.
uniform sampler2D uStamp;
uniform ivec2 uStampSize;  // 0,0 = no stamps this frame
// The stamp texture is only overwritten inside this frame's batch rect;
// outside it the texture still holds EARLIER batches, so the stamp may
// only be applied inside the rect (x0, y0, x1, y1 inclusive).
uniform ivec4 uStampRect;
uniform vec4 uStampPig;    // K.rgb, gran
uniform vec3 uStampPigS;   // S.rgb (0 for transparent pigments)
uniform vec2 uStampAmt;    // water, pigment rates

layout( location = 0 ) out vec4 oW;
layout( location = 1 ) out vec4 oPK;
layout( location = 2 ) out vec4 oPS;

vec2 drink( vec4 W ) {
	float w = W.r;
	float s = W.g;
	if ( W.b > 0.5 ) {
		float nimm = TRINK * min( 1.0, w ) * ( 1.0 - s );
		w -= nimm;
		s = min( 1.0, s + 1.5 * nimm );
	} else if ( s > ${ DAMP } ) {
		s -= 0.0001;
	}
	return vec2( w, s );
}

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 W = texelFetch( uW, xy, 0 );
	vec4 PK = texelFetch( uPK, xy, 0 );
	vec4 PS = texelFetch( uPS, xy, 0 );
	vec2 ws = drink( W );
	float w = ws.x;
	float s = ws.y;
	float m = W.b;

	vec2 shc = sheet( xy );
	float ds = 0.0;
	for ( int k = 0; k < 4; k++ ) {
		ivec2 n = xy + DIRS[ k >= 2 ? k + 2 : k ];
		if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
			continue;
		}
		vec2 nn = drink( texelFetch( uW, n, 0 ) );
		float sn = nn.y;
		// The fibres of the RECEIVING cell set the pace: where the
		// sheet is densely sized, moisture creeps in slowly.
		if ( sn > ${ CREEP } && sn > s ) {
			ds += ( sn - s ) * SKRIECH * uViscK *
				( 0.4 + 0.6 * ( 1.0 - shc.x ) ) * shc.y;
		}
		if ( s > ${ CREEP } && s > sn ) {
			vec2 shn = sheet( n );
			ds -= ( s - sn ) * SKRIECH * uViscK *
				( 0.4 + 0.6 * ( 1.0 - shn.x ) ) * shn.y;
		}
	}
	s = clamp( s + ds, 0.0, 1.0 );

	if ( uStampSize.x > 0 &&
		xy.x >= uStampRect.x && xy.y >= uStampRect.y &&
		xy.x <= uStampRect.z && xy.y <= uStampRect.w ) {
		vec3 st = texelFetch( uStamp, xy, 0 ).rgb;
		if ( st.x > 0.0 ) {
			// Which of the cell's pixels the wash covers: kept on the
			// suspended side, never carried by the water, settled with
			// the rest.
			PS.a = wetBits( PS.a, st.z );
			w = min( 3.0, w + uStampAmt.x * st.x );
			s = min( 1.0, s + 0.14 * min( 1.0, st.y ) );
			m = 1.0;
			float kSum = uBands > 0.5
				? ( uStampPig.r + uStampPig.g + uStampPig.b +
					uStampPigS.r + uStampPigS.g + uStampPigS.b ) / 6.0
				: ( uStampPig.r + uStampPig.g + uStampPig.b ) / 3.0;
			PK.rgb += uStampPig.rgb * ( uStampAmt.y * st.y );
			PK.a += uStampPig.a * uStampAmt.y * st.y * kSum;
			PS.rgb += uStampPigS * ( uStampAmt.y * st.y );
		}
	}
	oW = vec4( w, s, m, W.a );
	oPK = PK;
	oPS = PS;
}
`;

/*
 * Pass 2, "fluss": water moves between neighbours (gradient + Curtis'
 * edge SOG + flooding into damp paper = the backrun path), pigment rides
 * upwind and diffuses in standing water. WITH the diagonals: pure
 * 4-neighbour transport is anisotropic and drew 45-degree herringbone
 * through every wash on the fine grid.
 */
const FRAG_FLUSS = `#version 300 es
__CHUNK__

uniform sampler2D uW;
uniform sampler2D uPK;
uniform sampler2D uPS;

layout( location = 0 ) out vec4 oW;
layout( location = 1 ) out vec4 oPK;
layout( location = 2 ) out vec4 oPS;

float mobility( float ws ) {
	// Depth-graded, times a MEASURED scale compensation (the quarter grid
	// moved pigment 2.5x faster than theory; without the factor the ring
	// died, with the full factor the interior emptied to 0.41).
	float dryn = 1.0 - min( 1.0, ws );
	return ( 0.55 + 0.4 * dryn ) * MOB;
}

// How much pigment a cell carries in its water, for the crowding below.
float load( vec4 pk, vec4 ps ) {
	return pk.r + pk.g + pk.b +
		( uBands > 0.5 ? ps.r + ps.g + ps.b : 0.0 );
}

// What of the pigment the water brings a cell TAKES: less where it
// already carries more than the cell the water comes from, hardly any
// where one of the two stands out as a tip (the more exposed of them:
// between two cells of a fine line the gate holds both ways alike). The
// same number from either side of a pair - both read the same two cells.
float taken( float give, float have, float efDst ) {
	float g = 1.0;
	if ( have > give ) {
		float more = have / ( give + 1e-6 ) - 1.0;
		g /= 1.0 + CROWD * more * more;
	}
	float tip = efDst - TIP_FROM;
	if ( tip > 0.0 ) {
		g /= 1.0 + tip * tip;
	}
	return g;
}

// The 5 x 5 block around this cell: the water where it stands (nothing on
// dry paper and beyond the region) and the wet mask itself.
float gW[ 25 ];
float gM[ 25 ];
// ... and its inner 3 x 3 in full: the eight neighbours the pairs need,
// read once.
vec4 gN[ 9 ];

// The SMOOTHED head of the nine cells of the inner 3 x 3: the water of
// each averaged with its wet neighbours, 1-2-1 both ways - along the rows
// first (rowW, rowM: five rows, three places), then down. Every cell's
// head is summed in the same order whichever fragment asks for it, so
// the pair flux is the same number seen from either side. (Summed afresh
// for each of the nine, this was most of what a step cost on a card that
// computes in software.)
float gH[ 9 ];
void heads() {
	float rowW[ 15 ];
	float rowM[ 15 ];
	for ( int j = 0; j < 5; j++ ) {
		for ( int i = 0; i < 3; i++ ) {
			int k = j * 5 + i;
			rowW[ j * 3 + i ] = gW[ k ] + 2.0 * gW[ k + 1 ] + gW[ k + 2 ];
			rowM[ j * 3 + i ] = gM[ k ] + 2.0 * gM[ k + 1 ] + gM[ k + 2 ];
		}
	}
	for ( int j = 0; j < 3; j++ ) {
		for ( int i = 0; i < 3; i++ ) {
			int k = j * 3 + i;
			float wt = rowM[ k ] + 2.0 * rowM[ k + 3 ] + rowM[ k + 6 ];
			gH[ k ] = wt > 0.0
				? ( rowW[ k ] + 2.0 * rowW[ k + 3 ] + rowW[ k + 6 ] ) / wt
				: 0.0;
		}
	}
}

// A real edge only: one hole in the film (a single dry neighbour) is no
// edge to pull towards.
float edgeOf( float ef ) {
	return ef >= 1.5 ? ef : 0.0;
}

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 W = texelFetch( uW, xy, 0 );
	vec4 PK = texelFetch( uPK, xy, 0 );
	vec4 PS = texelFetch( uPS, xy, 0 );
	float wc = W.r;
	float sc = W.g;
	bool mc = W.b > 0.5;
	float efc = W.a;
	vec2 shc = sheet( xy );
	float pqc = shc.x;

	float hc = 0.0;
	if ( mc ) {
		for ( int j = 0; j < 5; j++ ) {
			for ( int i = 0; i < 5; i++ ) {
				ivec2 q = xy + ivec2( i - 2, j - 2 );
				vec4 Wq = vec4( 0.0 );
				if ( q.x >= 0 && q.y >= 0 && q.x < uSize.x && q.y < uSize.y ) {
					Wq = texelFetch( uW, q, 0 );
				}
				bool wetq = Wq.b > 0.5;
				gW[ j * 5 + i ] = wetq ? Wq.r : 0.0;
				gM[ j * 5 + i ] = wetq ? 1.0 : 0.0;
				if ( i >= 1 && i <= 3 && j >= 1 && j <= 3 ) {
					gN[ ( j - 1 ) * 3 + i - 1 ] = Wq;
				}
			}
		}
		heads();
		hc = gH[ 4 ];
	}
	// Water on all four sides: the cell lies INSIDE the wash, whatever
	// part of it the brush itself touched. (Two passes that met along a
	// seam left a row of half-covered cells there - drawn at twice their
	// density, a dotted line through the wash.)
	float coverBits = PS.a;
	if ( mc && gM[ 7 ] + gM[ 11 ] + gM[ 13 ] + gM[ 17 ] > 3.5 ) {
		coverBits = 15.0;
	}

	float wsum = 0.0;
	float outFrac = 0.0;
	vec4 pigInK = vec4( 0.0 );
	vec3 pigInS = vec3( 0.0 );
	vec4 diffK = vec4( 0.0 );
	vec3 diffS = vec3( 0.0 );
	bool flooded = false;

	for ( int d = 0; d < 8; d++ ) {
		ivec2 n = xy + DIRS[ d ];
		if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
			continue;
		}
		vec4 Wn;
		if ( mc ) {
			Wn = gN[ ( DIRS[ d ].y + 1 ) * 3 + DIRS[ d ].x + 1 ];
		} else {
			Wn = texelFetch( uW, n, 0 );
		}
		float wn = Wn.r;
		bool mn = Wn.b > 0.5;
		if ( ! mc && ! mn ) {
			continue;
		}
		vec2 shn = sheet( n );
		// A dry cell carries nothing: read its pigment only where there
		// is some.
		vec4 PKn = vec4( 0.0 );
		vec4 PSn = vec4( 0.0 );
		if ( mn ) {
			PKn = texelFetch( uPK, n, 0 );
			PSn = texelFetch( uPS, n, 0 );
		}
		// Diagonals carry less (longer path) and every cap shrinks: with
		// eight pairs any per-pair cap whose sum passes 100 % lets the
		// post-apply clamp CREATE mass (measured 1.6e19 in the prototype).
		// 4 x 0.125 + 4 x 0.085 = 84 %.
		float lw = d == 0 || d == 1 || d == 4 || d == 5 ? 1.0 : 0.7071;
		float capk = lw == 1.0 ? 0.125 : 0.085;
		float cond = 0.75 + 0.5 * ( 1.0 - ( pqc + shn.x ) * 0.5 );
		float jit = pairJitter( xy, d );
		float f = 0.0; // positive = out of this cell
		if ( mc && mn ) {
			float diff = wc - wn;
			// From the wash to its rim only: between two cells that are
			// both rim there is nothing to pull (a fine line is rim from
			// end to end).
			float ec = edgeOf( efc );
			float en = edgeOf( Wn.a );
			float eb = ec == 0.0 || en == 0.0 ? en - ec : 0.0;
			float hn = gH[ ( DIRS[ d ].y + 1 ) * 3 + DIRS[ d ].x + 1 ];
			float thin = min( wc, wn );
			float lev = ( FLOW - FLOWD ) * ( hc - hn ) + FLOWD * diff;
			if ( thin < THIN ) {
				// ... and what little it flows, it flows THROUGH the
				// sheet: the thinner the water, the more the sizing of the
				// two cells decides (the slower of them).
				float t = thin / THIN;
				lev *= max( THIN_FLOOR, t ) *
					mix( min( shc.y, shn.y ), 1.0, t );
			}
			// A FRONT - deep water running into shallow - advances as the
			// sheet lets it: at the pace of the sizing of the cell it runs
			// into. Level water (no step between the two) never feels it.
			float front = clamp( 3.0 * abs( diff ) / max( wc + wn, 1e-4 ), 0.0, 1.0 );
			lev *= mix( 1.0, wc < wn ? shc.y : shn.y, front );
			f = ( lev * lw * cond * jit +
				SOG * uSogK * eb * lw * thin *
					smoothstep( SOG_THIN, SOG_FULL, thin ) ) * uViscK;
			f = clamp( f, -capk * wn, capk * wc );
			// Diffusion in standing water: a dab in a LEVEL puddle still
			// spreads; scaled by depth so it stops while drying.
			float dsc = PDIFF * uViscK * lw * min( 1.0, ( wc + wn ) * 0.5 );
			diffK += dsc * ( PKn - PK );
			diffS += dsc * ( PSn.rgb - PS.rgb );
		} else if ( mc ) {
			if ( Wn.g >= REWET && wc > FLUT ) {
				f = min(
					wc * FLOW * uViscK * lw * cond * jit * shn.y,
					capk * wc
				);
			} else {
				continue;
			}
		} else {
			if ( sc >= REWET && wn > FLUT ) {
				f = -min(
					wn * FLOW * uViscK * lw * cond * jit * shc.y,
					capk * wn
				);
				flooded = true;
			} else {
				continue;
			}
		}
		if ( f == 0.0 ) {
			continue;
		}
		wsum -= f;
		if ( f > 0.0 ) {
			float amt = min( capk, f / ( wc + 1e-4 ) );
			amt = min( capk, amt * mobility( wc ) *
				taken( load( PK, PS ), load( PKn, PSn ), max( efc, Wn.a ) ) );
			outFrac += amt;
		} else {
			float amt = min( capk, -f / ( wn + 1e-4 ) );
			amt = min( capk, amt * mobility( wn ) *
				taken( load( PKn, PSn ), load( PK, PS ), max( efc, Wn.a ) ) );
			pigInK += amt * PKn;
			pigInS += amt * PSn.rgb;
		}
	}
	float m = mc || flooded ? 1.0 : 0.0;
	float ef = flooded ? 3.0 : efc;
	oW = vec4( max( 0.0, wc + wsum ), sc, m, ef );
	oPK = max( vec4( 0.0 ), PK * ( 1.0 - outFrac ) + pigInK + diffK );
	oPS = vec4(
		max( vec3( 0.0 ), PS.rgb * ( 1.0 - outFrac ) + pigInS + diffS ),
		flooded ? 15.0 : coverBits
	);
}
`;

/*
 * Drying, part a: settle/lift via transferFate, evaporate (edge cells
 * faster, per-cell paper jitter against the medial-axis cross), die below
 * the depth threshold with the RETREAT: part of a dying cell's leftovers
 * travels to still-wet neighbours - that turns lone dark rim beads into
 * the continuous drying line. Writes the WATER/SUSPENDED side.
 */
const FRAG_TROCKA = `#version 300 es
__CHUNK__
__BANDS__

uniform sampler2D uW;
uniform sampler2D uPK;
uniform sampler2D uPS;
uniform sampler2D uDK;
uniform sampler2D uDS;
uniform sampler2D uSD;

layout( location = 0 ) out vec4 oW;
layout( location = 1 ) out vec4 oPK;
layout( location = 2 ) out vec4 oPS;

bool wet( ivec2 n ) {
	if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
		return false;
	}
	return texelFetch( uW, n, 0 ).b > 0.5;
}

float dryNOf( ivec2 xy ) {
	// Eight neighbours, diagonals half - four alone grow facetted fronts.
	// The region border counts as dry.
	float dryN = 0.0;
	for ( int d = 0; d < 8; d++ ) {
		if ( ! wet( xy + DIRS[ d ] ) ) {
			dryN += d < 2 || d == 4 || d == 5 ? 1.0 : 0.5;
		}
	}
	return dryN;
}

int wetN4( ivec2 xy ) {
	int n = 0;
	if ( wet( xy + ivec2( 1, 0 ) ) ) n++;
	if ( wet( xy + ivec2( -1, 0 ) ) ) n++;
	if ( wet( xy + ivec2( 0, 1 ) ) ) n++;
	if ( wet( xy + ivec2( 0, -1 ) ) ) n++;
	return n;
}

void fate(
	ivec2 xy, out vec4 pk, out vec3 ps, out float wAfter, out float dryN
) {
	vec4 W = texelFetch( uW, xy, 0 );
	vec4 PKv = texelFetch( uPK, xy, 0 );
	vec3 psv = texelFetch( uPS, xy, 0 ).rgb;
	vec4 DKv = texelFetch( uDK, xy, 0 );
	vec3 dsv = texelFetch( uDS, xy, 0 ).rgb;
	float pqc = pq( xy );
	vec3 pkv = PKv.rgb;
	float gran = PKv.a;
	vec3 dkv = DKv.rgb;
	float dgran = DKv.a;
	transferFate( W.r, pqc, pkv, gran, psv, dkv, dgran, dsv );
	// The layer under the wash redissolves into the suspension - the
	// seed side (trocknen c) applies the SAME pure function to sd.
	vec4 sd = texelFetch( uSD, xy, 0 );
	vec3 up = seedLift( W.r, sd );
	if ( uBands > 0.5 ) {
		// The layer's pigment is kept as three absorptions (it is pixels);
		// what the water lifts of it joins the wash in bands.
		if ( up.r + up.g + up.b > 0.0 ) {
			vec3 lo;
			vec3 hi;
			bandsOf( exp( -up ), lo, hi );
			pkv -= log( lo );
			psv -= log( hi );
		}
	} else {
		pkv += up;
	}
	pk = vec4( pkv, gran );
	ps = psv;
	dryN = dryNOf( xy );
	wAfter = W.r - EVAP * uEvapK * ( 1.0 + EDGEK * min( dryN, EDGE_DRY ) ) *
		( 0.7 + 0.4 * pqc + 0.2 * cellHash( xy ) );
}

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 W = texelFetch( uW, xy, 0 );
	if ( W.b < 0.5 ) {
		oW = W;
		oPK = texelFetch( uPK, xy, 0 );
		oPS = texelFetch( uPS, xy, 0 );
		return;
	}
	vec4 pk;
	vec3 ps;
	float wAfter;
	float dryN;
	fate( xy, pk, ps, wAfter, dryN );
	// The coverage of the cell (see the ink render) is not pigment: it
	// neither settles away nor travels.
	float cover = texelFetch( uPS, xy, 0 ).a;

	if ( wAfter <= 0.004 ) {
		oW = vec4( 0.0, W.g, 0.0, 0.0 );
		oPK = vec4( 0.0 );
		oPS = vec4( 0.0, 0.0, 0.0, cover );
		return;
	}

	// Survivor: gather the retreat shares of dying 4-neighbours. Each
	// dying neighbour's fate is recomputed deterministically - a share
	// without a receiver would be lost mass (the pair-cap bug class).
	// Only a neighbour that CAN die this step is worth that: a step takes
	// at most EVAP * uEvapK * (1 + EDGEK * 6) * (0.7 + 0.4 + 0.2) = 4.03
	// x EVAP x uEvapK of its water, so one with more than that above the
	// threshold survives for certain (DIE_MAX keeps rounding on the safe
	// side). Recomputing every wet neighbour's fate was more than half of
	// a step's texture reads, almost always for a neighbour that lived.
	vec4 gainK = vec4( 0.0 );
	vec3 gainS = vec3( 0.0 );
	float doomed = 0.004 + DIE_MAX * EVAP * uEvapK;
	for ( int k = 0; k < 4; k++ ) {
		ivec2 n = xy +
			( k == 0
				? ivec2( 1, 0 )
				: k == 1
				? ivec2( -1, 0 )
				: k == 2
				? ivec2( 0, 1 )
				: ivec2( 0, -1 ) );
		if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
			continue;
		}
		vec4 Wn = texelFetch( uW, n, 0 );
		if ( Wn.b <= 0.5 || Wn.r > doomed ) {
			continue;
		}
		vec4 pkn;
		vec3 psn;
		float wn;
		float dn;
		fate( n, pkn, psn, wn, dn );
		if ( wn <= 0.004 ) {
			int nb = wetN4( n );
			if ( nb > 0 ) {
				gainK += pkn * ( RUECK / float( nb ) );
				gainS += psn * ( RUECK / float( nb ) );
			}
		}
	}
	oW = vec4( wAfter, W.g, 1.0, min( 6.0, floor( dryN + 0.5 ) ) );
	oPK = pk + gainK;
	oPS = vec4( ps + gainS, cover );
}
`;

/*
 * Drying, part b: the SETTLED side of the same snapshot. transferFate is
 * pure and shared, so parts a and b cannot drift apart. A dying cell
 * keeps (1 - RUECK) of its suspended leftovers (the rest travelled in a).
 */
const FRAG_TROCKB = `#version 300 es
__CHUNK__

uniform sampler2D uW;
uniform sampler2D uPK;
uniform sampler2D uPS;
uniform sampler2D uDK;
uniform sampler2D uDS;

layout( location = 0 ) out vec4 oDK;
layout( location = 1 ) out vec4 oDS;

bool wet( ivec2 n ) {
	if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
		return false;
	}
	return texelFetch( uW, n, 0 ).b > 0.5;
}

float dryNOf( ivec2 xy ) {
	float dryN = 0.0;
	for ( int d = 0; d < 8; d++ ) {
		if ( ! wet( xy + DIRS[ d ] ) ) {
			dryN += d < 2 || d == 4 || d == 5 ? 1.0 : 0.5;
		}
	}
	return dryN;
}

int wetN4( ivec2 xy ) {
	int n = 0;
	if ( wet( xy + ivec2( 1, 0 ) ) ) n++;
	if ( wet( xy + ivec2( -1, 0 ) ) ) n++;
	if ( wet( xy + ivec2( 0, 1 ) ) ) n++;
	if ( wet( xy + ivec2( 0, -1 ) ) ) n++;
	return n;
}

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 W = texelFetch( uW, xy, 0 );
	vec4 DKv = texelFetch( uDK, xy, 0 );
	vec4 DSv = texelFetch( uDS, xy, 0 );
	if ( W.b < 0.5 ) {
		oDK = DKv;
		oDS = DSv;
		return;
	}
	vec4 PKv = texelFetch( uPK, xy, 0 );
	vec4 PSv = texelFetch( uPS, xy, 0 );
	vec3 psv = PSv.rgb;
	float pqc = pq( xy );
	vec3 pkv = PKv.rgb;
	float gran = PKv.a;
	vec3 dkv = DKv.rgb;
	float dgran = DKv.a;
	vec3 dsv = DSv.rgb;
	transferFate( W.r, pqc, pkv, gran, psv, dkv, dgran, dsv );
	float dryN = dryNOf( xy );
	float wAfter = W.r - EVAP * uEvapK * ( 1.0 + EDGEK * min( dryN, EDGE_DRY ) ) *
		( 0.7 + 0.4 * pqc + 0.2 * cellHash( xy ) );
	if ( wAfter <= 0.004 ) {
		float bleib = wetN4( xy ) > 0 ? 1.0 - float( RUECK ) : 1.0;
		dkv += pkv * bleib;
		dgran += gran * bleib;
		dsv += psv * bleib;
	}
	oDK = vec4( dkv, dgran );
	// ... and the coverage of the cell with it (every pixel ever wetted).
	oDS = vec4( dsv, wetBits( DSv.a, PSv.a ) );
}
`;

/*
 * Drying, part c: the SEED side of the same snapshot - what is left of
 * the layer's own pigment under the wash after this step's rewetting.
 * seedLift is pure and shared with part a, so the pigment that appears
 * in the suspension there is exactly the pigment that vanishes here.
 */
const FRAG_TROCKC = `#version 300 es
__CHUNK__

uniform sampler2D uW;
uniform sampler2D uSD;

layout( location = 0 ) out vec4 oSD;

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 sd = texelFetch( uSD, xy, 0 );
	vec4 W = texelFetch( uW, xy, 0 );
	if ( W.b >= 0.5 ) {
		seedLift( W.r, sd );
	}
	oSD = sd;
}
`;

/*
 * Seed merge: fold freshly computed ground pigment into VIRGIN cells
 * only. Re-feeding after a region grow must never resurrect pigment
 * that water already carried away.
 */
const FRAG_SEEDMERGE = `#version 300 es
precision highp float;
uniform sampler2D uOld;
uniform sampler2D uNew;
out vec4 oSD;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 old = texelFetch( uOld, xy, 0 );
	oSD = old.a >= 1.0 ? old : texelFetch( uNew, xy, 0 );
}
`;

/*
 * Seed from the ground, on the GPU: the layer's own pixels under the
 * island (the ground texture, straight RGBA at canvas resolution) become
 * per-cell pigment, merged into VIRGIN cells only. What the pixel SHOWS
 * over paper is (1 - a) + a * c per channel; K is the transparent-glaze
 * inversion of exactly that, so lifting all of it into the suspension
 * renders as the same colour until the water moves it. A cell is the
 * premultiplied mean of the pixels it covers - the half-size copy the
 * controller used to draw, read back and convert in JavaScript at the
 * start of every wash and after every grow (14 to 31 ms measured on the
 * server, a frame and more on a slower processor).
 */
const FRAG_SEEDGROUND = `#version 300 es
precision highp float;
uniform sampler2D uOld;
uniform sampler2D uGround;
out vec4 oSD;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 old = texelFetch( uOld, xy, 0 );
	if ( old.a >= 1.0 ) {
		oSD = old;
		return;
	}
	vec4 sum = vec4( 0.0 );
	for ( int j = 0; j < ${ SC }; j++ ) {
		for ( int i = 0; i < ${ SC }; i++ ) {
			vec4 g = texelFetch( uGround, xy * ${ SC } + ivec2( i, j ), 0 );
			sum += vec4( g.rgb * g.a, g.a );
		}
	}
	sum /= float( ${ SC * SC } );
	if ( sum.a < 0.01 ) {
		oSD = vec4( 0.0 );
		return;
	}
	vec3 k = -log( max( vec3( 1.0 - sum.a ) + sum.rgb, vec3( 1.0 / 255.0 ) ) );
	// White on white: nothing to redissolve, the cell stays virgin.
	oSD = k.r + k.g + k.b < 0.01 ? vec4( 0.0 ) : vec4( k, 2.0 );
}
`;

/*
 * The ink render, full document resolution, three-channel Kubelka-Munk:
 *
 *   t       = exp( -K )            transparent transmittance (the approved
 *                                  watercolour term, grain-modulated)
 *   R_inf   = 1 + r - sqrt(r^2+2r) body colour of a thick layer, r = K/S
 *   h       = 1 - exp( -1.5 S )    hiding power of the scattering
 *   R_white = (1-h) t + h R_inf    what the layer shows over white
 *   R_black = h R_inf              ... and over black
 *
 * Source-over decomposition: alpha = 1 - mean(R_white) + mean(R_black),
 * colour = 1 - (1 - R_white)/alpha. Over white this is EXACT; for S = 0 it
 * reduces to the approved ink mapping (h = 0), for full hiding to plain
 * opaque paint (alpha = 1, colour = R_inf). K and S add linearly while the
 * paint is wet - that addition IS the pigment mixing.
 *
 * B-spline over 3x3 cells (bilinear shows the grid), read position warped
 * along the paper fibres, fibre edge below a small density, asymmetric
 * grain (valleys darken), wet sheen folded into the reflectances. Output
 * PREMULTIPLIED - and Y-FLIPPED, see the header.
 */
const FRAG_INK = `#version 300 es
__CHUNK__
__BANDS__

uniform sampler2D uPKt;
uniform sampler2D uPSt;
uniform sampler2D uDKt;
uniform sampler2D uDSt;
uniform sampler2D uWtex;
uniform sampler2D uPF;
uniform float uKorn;
// How far the read position wanders along the paper's fibres (1 = a wash:
// its edge ends in fibres). An ink line drawn with a pen does not: at 1
// the fine octave of the warp, four pixels long, set a knob on its edge
// every four pixels.
uniform float uWarpK;
// The GROUND: the target layer's own pixels under the island, straight
// (non-premultiplied) RGBA at canvas resolution. With a ground the wash
// GLAZES it (KM layering) instead of floating as an alpha film - that is
// what makes a yellow wash over dried blue turn green. 0 = the old path.
uniform sampler2D uGround;
uniform int uHasGround;
// The seed field (trocknen c): a = 1 + remaining fraction of the layer's
// own pigment per cell. Where water carried it off, the ground fades.
uniform sampler2D uSDt;

out vec4 oC;

// How much of a cell its four bits cover, looked up: nine cells a pixel,
// every pixel of every frame.
const float WET_SHARE[ 16 ] = float[ 16 ](
	0.0, 0.25, 0.25, 0.5, 0.25, 0.5, 0.5, 0.75,
	0.25, 0.5, 0.5, 0.75, 0.5, 0.75, 0.75, 1.0
);

void main() {
	ivec2 px = ivec2(
		int( gl_FragCoord.x ),
		uSize.y * ${ SC } - 1 - int( gl_FragCoord.y )
	);
	ivec2 absPx = px + uOrigin * ${ SC };
	vec4 pf = texelFetch(
		uPF,
		ivec2( absPx.x & ${ TILE - 1 }, absPx.y & ${ TILE - 1 } ),
		0
	);
	float g = pf.r;
	vec2 warp = ( pf.gb * 255.0 - 128.0 ) / 40.0 * uWarpK;

	vec2 u = ( vec2( px ) + 0.5 + warp ) / float( ${ SC } ) - 0.5;
	u = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
	ivec2 ic = ivec2( floor( u + 0.5 ) );
	vec2 fr = u + 0.5 - vec2( ic );
	vec3 wx = vec3(
		0.5 * ( 1.0 - fr.x ) * ( 1.0 - fr.x ),
		0.0,
		0.5 * fr.x * fr.x
	);
	wx.y = 1.0 - wx.x - wx.z;
	vec3 wy = vec3(
		0.5 * ( 1.0 - fr.y ) * ( 1.0 - fr.y ),
		0.0,
		0.5 * fr.y * fr.y
	);
	wy.y = 1.0 - wy.x - wy.z;

	vec4 sumK = vec4( 0.0 );
	vec3 sumS = vec3( 0.0 );
	float cover = 0.0;
	float wl = 0.0;
	float fsum = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			float k = wx[ i + 1 ] * wy[ j + 1 ];
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			sumK += k * ( texelFetch( uDKt, c, 0 ) + texelFetch( uPKt, c, 0 ) );
			vec4 dsC = texelFetch( uDSt, c, 0 );
			vec4 psC = texelFetch( uPSt, c, 0 );
			sumS += k * ( dsC.rgb + psC.rgb );
			// (The settled side alone: trocknen b joins the suspended
			// side's bits into it in the very step that sets them.)
			cover += k * WET_SHARE[ int( dsC.a + 0.5 ) ];
			wl += k * texelFetch( uWtex, c, 0 ).r;
			float sda = texelFetch( uSDt, c, 0 ).a;
			// Virgin cells (a < 1) keep their ground untouched.
			fsum += k * ( sda >= 1.0 ? clamp( sda - 1.0, 0.0, 1.0 ) : 1.0 );
		}
	}
	vec3 K = sumK.rgb;
	vec3 S = sumS;
	// THE CONTOUR (see the header): pigment over coverage is the density
	// of the paint where it lies - level right up to the edge - and the
	// coverage draws the edge, a pixel or so wide. Both come through the
	// same spline, so their ratio does not know the grid.
	float cv = clamp( cover, 0.0, 1.0 );
	float edge = smoothstep( 0.08, 0.42, cv ) / max( cv, 0.25 );
	K *= edge;
	S *= edge;
	bool bands = uBands > 0.5;
	// In bands the six absorptions are counted in linear light, where the
	// same layer weighs about 2.2 times what it does per sRGB channel: the
	// thresholds below stay where they were calibrated.
	float cov = bands
		? ( K.r + K.g + K.b + S.r + S.g + S.b ) / 13.2
		: ( K.r + K.g + K.b ) / 3.0 + ( S.r + S.g + S.b ) / 3.0;
	// Where water DISSOLVED the layer (fRest < 1) the pixel must render
	// even with no wash pigment left on it: the bleached spot is real.
	float fRest = 1 == uHasGround ? fsum : 1.0;
	bool faded = fRest < 0.999;
	if ( cov <= 1e-4 && ! faded ) {
		oC = vec4( 0.0 );
		return;
	}
	// Fibre edge: below a small density the paper tooth fades the paint
	// out, so a stroke ends in fibres instead of a machine ramp.
	if ( cov < 0.07 ) {
		float tt = cov * ( 0.45 + 1.1 * g ) / 0.07;
		if ( tt < 1.0 ) {
			tt = tt * tt * ( 3.0 - 2.0 * tt );
			K *= tt;
			S *= tt;
		}
	}
	// Asymmetric grain: pigment settles into the VALLEYS, so valleys
	// darken; ridges barely lighten, or white pin pricks appear.
	float granLoc = min(
		1.0,
		sumK.a / max(
			bands
				? ( K.r + K.g + K.b + S.r + S.g + S.b ) / 6.0
				: ( K.r + K.g + K.b ) / 3.0,
			1e-5
		)
	);
	float delta = 0.5 - g;
	float amp = uKorn * 1.6 * ( 0.35 + 0.85 * granLoc );
	float mod2 = max(
		0.35,
		1.0 + delta * amp * ( delta > 0.0 ? 1.0 : 0.45 )
	);
	K *= mod2;
	S *= mod2;

	vec3 Rw;
	vec3 Rb;
	if ( bands ) {
		// Six absorptions and no scattering: what the layer lets through
		// band by band, seen as a colour.
		Rw = bandsToRgb( exp( -K ), exp( -S ) );
		Rb = vec3( 0.0 );
	} else {
		vec3 t = exp( -K );
		vec3 r = K / ( S + 1e-4 );
		vec3 Rinf = 1.0 + r - sqrt( r * r + 2.0 * r );
		vec3 h = 1.0 - exp( -1.5 * S );
		Rw = ( 1.0 - h ) * t + h * Rinf;
		Rb = h * Rinf;
	}
	// The wet sheen: damp paint reads darker and a touch cooler.
	vec3 sheen = vec3( 1.0 );
	if ( wl > 0.01 ) {
		float k = min( 1.0, wl );
		sheen = vec3(
			1.0 - 0.055 * k,
			1.0 - 0.048 * k,
			1.0 - 0.03 * k
		);
		Rw *= sheen;
		Rb *= sheen;
	}
	float a = clamp(
		1.0 - ( Rw.r + Rw.g + Rw.b ) / 3.0 + ( Rb.r + Rb.g + Rb.b ) / 3.0,
		0.0,
		1.0
	);
	// The film must be able to CARRY the colour: any channel with
	// 1 - Rw > a would clamp in the decomposition below and silently wash
	// the chroma out (dense yellow rendered pale cream, measured b 172
	// instead of the KM-true 67). Lifting a to the per-channel need keeps
	// the composite over white EXACTLY Rw in every channel.
	a = clamp(
		max(
			a,
			max( 1.0 - Rw.r, max( 1.0 - Rw.g, 1.0 - Rw.b ) )
		),
		0.0,
		1.0
	);
	if ( a <= 0.002 && ! faded ) {
		oC = vec4( 0.0 );
		return;
	}
	// The floating film (guarded: a bleached-only pixel has no film).
	vec4 film = vec4( 0.0 );
	if ( a > 0.002 ) {
		vec3 c = clamp( 1.0 - ( 1.0 - Rw ) / a, 0.0, 1.0 );
		film = vec4( c * a, a ); // premultiplied
	}
	if ( 1 == uHasGround ) {
		vec4 gpx = texelFetch( uGround, px, 0 );
		if ( gpx.a > 0.001 ) {
			// Kubelka-Munk LAYERING over the ground pixel. T^2 comes from
			// the mapping's own Rw/Rb (over white the layering returns
			// exactly Rw, so the approved look on paper does not move),
			// and for S = 0 it degenerates to the calibrated transmittance
			// times the ground - a true glaze. Output is the finished
			// composite, opaque where the ground is, so overlay and bake
			// REPLACE the pixel instead of tinting it a second time.
			// Rewetting fades the ground by the REMAINING fraction of its
			// seeded pigment: transmittance to the power of the rest.
			vec3 Rg = gpx.rgb;
			if ( faded ) {
				// Floored at 2 %, not 1e-4: a near-black ground is 8-bit
				// noise in its straight colour (1/255 red, 0 green), and
				// the power turned that into a 3:1 colour cast - charcoal
				// went wine-red under the smudger. No real pigment layer
				// transmits less than that anyway.
				Rg = pow( max( Rg, vec3( 0.02 ) ), vec3( fRest ) );
			}
			vec3 Rc;
			if ( bands ) {
				// A glaze in bands: the ground seen THROUGH the wash, band
				// by band - yellow over dried blue is a green, not the
				// olive three channels make of it.
				vec3 glo;
				vec3 ghi;
				bandsOf( Rg, glo, ghi );
				Rc = bandsToRgb( exp( -K ) * glo, exp( -S ) * ghi ) * sheen;
			} else {
				vec3 T2 = ( Rw - Rb ) * ( 1.0 - Rb );
				Rc = clamp(
					Rb + T2 * Rg / max( vec3( 0.02 ), 1.0 - Rb * Rg ),
					0.0,
					1.0
				);
			}
			oC = gpx.a * vec4( Rc, 1.0 ) + ( 1.0 - gpx.a ) * film;
			return;
		}
	}
	oC = film;
}
`;

/* Copy pass (region grow; with a zero shift, one side onto the other). */
const FRAG_COPY = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform ivec2 uShift;
uniform ivec2 uOldSize;
out vec4 oC;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy ) - uShift;
	if ( xy.x < 0 || xy.y < 0 || xy.x >= uOldSize.x || xy.y >= uOldSize.y ) {
		oC = vec4( 0.0 );
		return;
	}
	oC = texelFetch( uT, xy, 0 );
}
`;

/* "Sofort trocknen", split like the drying pass (draw-buffer limit). */
const FRAG_DRYA = `#version 300 es
__CHUNK__
uniform sampler2D uW;
layout( location = 0 ) out vec4 oW;
layout( location = 1 ) out vec4 oPK;
layout( location = 2 ) out vec4 oPS;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 W = texelFetch( uW, xy, 0 );
	oW = vec4( 0.0, min( W.g, 0.15 ), 0.0, 0.0 );
	oPK = vec4( 0.0 );
	oPS = vec4( 0.0 );
}
`;

const FRAG_DRYB = `#version 300 es
__CHUNK__
uniform sampler2D uPK;
uniform sampler2D uPS;
uniform sampler2D uDK;
uniform sampler2D uDS;
layout( location = 0 ) out vec4 oDK;
layout( location = 1 ) out vec4 oDS;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	oDK = texelFetch( uDK, xy, 0 ) + texelFetch( uPK, xy, 0 );
	vec4 d = texelFetch( uDS, xy, 0 );
	vec4 p = texelFetch( uPS, xy, 0 );
	oDS = vec4( d.rgb + p.rgb, wetBits( d.a, p.a ) );
}
`;

/* ------------------------------- the engine ------------------------------ */

export const WET_GL_SC = SC;

let glAvailable = null;

/**
 * Whether this browser can run the island at all. Asked once: every
 * answer used to cost a throwaway WebGL context, and a page holds only
 * so many before the browser starts taking the oldest away - possibly a
 * living island.
 */
export function wetGlAvailable() {
	if ( null !== glAvailable ) {
		return glAvailable;
	}
	try {
		const c = document.createElement( 'canvas' );
		const gl = c.getContext( 'webgl2' );
		glAvailable = !! ( gl && gl.getExtension( 'EXT_color_buffer_float' ) );
		gl?.getExtension( 'WEBGL_lose_context' )?.loseContext();
	} catch ( e ) {
		glAvailable = false;
	}
	return glAvailable;
}

export function createWetSurfaceGL() {
	const canvas = document.createElement( 'canvas' );
	canvas.width = 1;
	canvas.height = 1;
	// preserveDrawingBuffer: the 2D pipeline drawImage()s this canvas at
	// its own pace, not ours.
	const gl = canvas.getContext( 'webgl2', {
		alpha: true,
		premultipliedAlpha: true,
		preserveDrawingBuffer: true,
		antialias: false,
		depth: false,
		stencil: false,
	} );
	if ( ! gl || ! gl.getExtension( 'EXT_color_buffer_float' ) ) {
		return null;
	}

	const quad = gl.createBuffer();
	gl.bindBuffer( gl.ARRAY_BUFFER, quad );
	gl.bufferData(
		gl.ARRAY_BUFFER,
		new Float32Array( [ -1, -1, 3, -1, -1, 3 ] ),
		gl.STATIC_DRAW
	);

	function compile( type, src ) {
		const sh = gl.createShader( type );
		gl.shaderSource( sh, src );
		gl.compileShader( sh );
		if ( ! gl.getShaderParameter( sh, gl.COMPILE_STATUS ) ) {
			throw new Error( 'wet-gl shader: ' + gl.getShaderInfoLog( sh ) );
		}
		return sh;
	}
	const vert = compile( gl.VERTEX_SHADER, VERT );
	function program( fragSrc ) {
		const p = gl.createProgram();
		gl.attachShader( p, vert );
		gl.attachShader(
			p,
			compile(
				gl.FRAGMENT_SHADER,
				// The band tables go only into the passes that read them
				// (__BANDS__): compiled into every pass, a card that
				// computes in software paid for them in each.
				fragSrc
					.replace( '__CHUNK__', CHUNK )
					.replace( '__BANDS__', BANDS_GLSL )
			)
		);
		gl.bindAttribLocation( p, 0, 'aPos' );
		gl.linkProgram( p );
		if ( ! gl.getProgramParameter( p, gl.LINK_STATUS ) ) {
			throw new Error( 'wet-gl link: ' + gl.getProgramInfoLog( p ) );
		}
		return p;
	}
	const progWasser = program( FRAG_WASSER );
	const progFluss = program( FRAG_FLUSS );
	const progTrockA = program( FRAG_TROCKA );
	const progTrockB = program( FRAG_TROCKB );
	const progTrockC = program( FRAG_TROCKC );
	const progSeedMerge = program( FRAG_SEEDMERGE );
	const progSeedGround = program( FRAG_SEEDGROUND );
	const progInk = program( FRAG_INK );
	const progCopy = program( FRAG_COPY );
	const progDryA = program( FRAG_DRYA );
	const progDryB = program( FRAG_DRYB );

	function texFloat( w, h ) {
		const t = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, t );
		gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RGBA32F, w, h );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		return t;
	}

	const paperQ = buildPaperQTile();
	const texPQ = gl.createTexture();
	gl.bindTexture( gl.TEXTURE_2D, texPQ );
	gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RG32F, TILEG, TILEG );
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		TILEG,
		TILEG,
		gl.RG,
		gl.FLOAT,
		packQTile( paperQ )
	);
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );

	const texPF = gl.createTexture();
	gl.bindTexture( gl.TEXTURE_2D, texPF );
	gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RGBA8, TILE, TILE );
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		TILE,
		TILE,
		gl.RGBA,
		gl.UNSIGNED_BYTE,
		buildPaperFTile( paperQ )
	);
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );

	let texStamp = null; // RGBA32F, region-sized, re-made with the region
	// The GROUND: the target layer's pixels under the island (RGBA8 at
	// canvas resolution), fed by the controller. Dropped on grow/reset -
	// the controller re-feeds when the geometry changes; without a fresh
	// feed the render falls back to the floating film, never to a stale
	// or misplaced ground.
	let texGround = null;

	const fbo = gl.createFramebuffer();
	// Uniform locations, asked for once per program: every pass asked the
	// driver again, some seventy times a step, every step of every frame.
	const locs = new Map();
	const uloc = ( prog, name ) => {
		let byName = locs.get( prog );
		if ( ! byName ) {
			byName = new Map();
			locs.set( prog, byName );
		}
		let loc = byName.get( name );
		if ( undefined === loc ) {
			loc = gl.getUniformLocation( prog, name );
			byName.set( name, loc );
		}
		return loc;
	};
	const fboRead = gl.createFramebuffer();

	// ACTIVE TILES (wet-gl-active.js). The last probe saw every wet or
	// damp cell inside the tiles of `base` at step `baseT`; `fresh` holds
	// the tiles of the stamps folded since. The set can only have spread
	// from there as far as reach() allows, and a step runs on that plus
	// one ring. `dirty` collects the tiles the steps touched since the
	// last full render.
	let base = null;
	let baseT = 0;
	let fresh = null;
	let viscMax = 1;
	// The widest any style in this region lets its edge wander (uWarpK):
	// a pen line drawn into a wash must not pull the wash's edge straight.
	let warpMax = 0;
	let lastLag = 0;
	let dirty = []; // cell rects
	let dirtyFrom = null; // the run rects last added to `dirty`
	// Where stamps folded in since the last render (cell rects), and the
	// step the first of them did - under the hand only that is rendered
	// every frame (see render).
	let near = [];
	let nearStep = 0;
	let renderAll = true;
	let stepNo = 0;
	let stampSerial = 0;
	let since = null; // stamp tiles folded since the probe in flight
	let ready = null; // a probe result waiting for its step
	let seen = null; // the latest probe result, for the wet check
	// The run set of a step, worked out again only when base, fresh or
	// the reach in tiles changed.
	let maskGen = 0;
	let runKey = '';
	let runCache = null;
	const probe = createTileProbe( gl, `v.b > 0.5 || v.g > ${ DAMP }`, 'v.b' );
	const fence = createFrameFence( gl );
	const whole = () => ( { x0: 0, y0: 0, x1: S.rw - 1, y1: S.rh - 1 } );
	const allTiles = () => tileMark( tileMask( S.rw, S.rh ), whole() );
	// What bindQuad binds and a pass draws: the full-screen triangle, or
	// the rectangles of a tile set (one buffer for the steps, one for the
	// ink render, each uploaded only when its set changed).
	const simBuf = gl.createBuffer();
	const inkBuf = gl.createBuffer();
	let simData = null;
	let inkData = null;
	let simFor = null;
	let simCount = 0;
	let geomBuf = quad;
	let geomCount = 3;
	const drawWhole = () => {
		geomBuf = quad;
		geomCount = 3;
	};

	const S = {
		canvas,
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0, // 1 = maybe wet, 0 = certainly dry (from the reduction)
		lost: false,
		// Canvas pixels the renders redrew since the controller last
		// presented them (y-down); the controller takes and clears it.
		drawn: null,
		// Tests only: false runs every pass and every render over the
		// whole region - the reference the scissored island must match.
		scissor: true,
		// The painterly dials, style/slider-fed per wash. Defaults are the
		// calibration the probes were tuned against.
		params: {
			evapK: 1.3,
			sogK: 1,
			korn: 0.55,
			depK: 1,
			liftK: 1,
			viscK: 1,
			seedK: 0,
			bands: 0,
		},
	};

	S.setParams = ( p ) => {
		if ( undefined !== p.korn && p.korn !== S.params.korn ) {
			renderAll = true; // the grain dial is the render's
		}
		if ( undefined !== p.bands && !! p.bands !== !! S.params.bands ) {
			renderAll = true; // ... and so is the way the fields are read
		}
		// ... and how far the read position wanders: within one region
		// the widest any of its styles asked for.
		const warpNow = Math.max( warpMax, p.warpK ?? S.params.warpK ?? 1 );
		if ( warpNow !== warpMax ) {
			warpMax = warpNow;
			renderAll = true;
		}
		S.params = { ...S.params, ...p };
		// reach() must assume the most fluid paint the region has seen.
		viscMax = Math.max( viscMax, S.params.viscK ?? 1 );
	};

	/**
	 * Swap the paper (document setting). Null restores the calibrated
	 * cold-press default bit-exactly. Physics AND look change: the Q tile
	 * weights settling, flux and the fibre edge.
	 *
	 * @param {Object|null} pap { kont, freq, gewebe, rippen } or null.
	 */
	S.setPaper = ( pap ) => {
		if ( S.lost ) {
			return;
		}
		const q = buildPaperQTile( pap );
		gl.bindTexture( gl.TEXTURE_2D, texPQ );
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			TILEG,
			TILEG,
			gl.RG,
			gl.FLOAT,
			packQTile( q )
		);
		gl.bindTexture( gl.TEXTURE_2D, texPF );
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			TILE,
			TILE,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			buildPaperFTile( q, pap )
		);
		renderAll = true;
	};
	canvas.addEventListener( 'webglcontextlost', () => {
		S.lost = true;
	} );

	// Ping-pong state: W, suspended K, suspended S, settled K, settled S.
	let W = [ null, null ];
	let PK = [ null, null ];
	let PS = [ null, null ];
	let DK = [ null, null ];
	let DS = [ null, null ];
	// The SEED pair: the layer's own pigment under the wash (stage 2 of
	// the layer reaction), rgb = remaining K, a = 1 + remaining fraction
	// (a < 1 = virgin cell, nothing seeded).
	let SD = [ null, null ];
	let cur = 0;
	// The frame's stamp batch: its rect and pigment identity. The float
	// accumulators live as long as the region - a fresh region-sized pair
	// per batch was megabytes of garbage every frame.
	let stampQueue = null; // { x0, y0, x1, y1, pig, pigS, amt }
	let accW = null;
	let accA = null;
	let accC = null; // coverage: which of the cell's four pixels are wet (bits)
	let upload = new Float32Array( 0 );

	const allPairs = () => [ W, PK, PS, DK, DS, SD ];

	function bindQuad( prog ) {
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, geomBuf );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		const uSize = uloc( prog, 'uSize' );
		if ( uSize ) {
			gl.uniform2i( uSize, S.rw, S.rh );
		}
		const uOrigin = uloc( prog, 'uOrigin' );
		if ( uOrigin ) {
			gl.uniform2i( uOrigin, S.rx, S.ry );
		}
		const uPQ = uloc( prog, 'uPQ' );
		if ( uPQ ) {
			gl.activeTexture( gl.TEXTURE7 );
			gl.bindTexture( gl.TEXTURE_2D, texPQ );
			gl.uniform1i( uPQ, 7 );
		}
		const dial = ( name, val ) => {
			const loc = uloc( prog, name );
			if ( loc ) {
				gl.uniform1f( loc, val );
			}
		};
		dial( 'uEvapK', S.params.evapK );
		dial( 'uSogK', S.params.sogK );
		dial( 'uDepK', S.params.depK );
		dial( 'uLiftK', S.params.liftK );
		dial( 'uViscK', S.params.viscK );
		dial( 'uSeedK', S.params.seedK ?? 0 );
		dial( 'uStainK', S.params.stainK ?? 0 );
		dial( 'uBands', S.params.bands ? 1 : 0 );
	}

	function bindTex( prog, name, unit, tex ) {
		const loc = uloc( prog, name );
		if ( loc ) {
			gl.activeTexture( gl.TEXTURE0 + unit );
			gl.bindTexture( gl.TEXTURE_2D, tex );
			gl.uniform1i( loc, unit );
		}
	}

	function targets( list ) {
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		const bufs = [];
		for ( let i = 0; i < 3; i++ ) {
			gl.framebufferTexture2D(
				gl.FRAMEBUFFER,
				gl.COLOR_ATTACHMENT0 + i,
				gl.TEXTURE_2D,
				list[ i ] || null,
				0
			);
			if ( list[ i ] ) {
				bufs.push( gl.COLOR_ATTACHMENT0 + i );
			}
		}
		gl.drawBuffers( bufs );
	}

	S.reset = () => {
		allPairs().forEach( ( pair ) =>
			pair.forEach( ( t ) => t && gl.deleteTexture( t ) )
		);
		if ( texStamp ) {
			gl.deleteTexture( texStamp );
			texStamp = null;
		}
		if ( texGround ) {
			gl.deleteTexture( texGround );
			texGround = null;
		}
		W = [ null, null ];
		PK = [ null, null ];
		PS = [ null, null ];
		DK = [ null, null ];
		DS = [ null, null ];
		SD = [ null, null ];
		S.rw = 0;
		S.rh = 0;
		S.wet = 0;
		stampQueue = null;
		accW = null;
		accA = null;
		accC = null;
		base = null;
		fresh = null;
		dirty = [];
		dirtyFrom = null;
		near = [];
		since = null;
		maskGen++;
		renderAll = true;
		ready = null;
		seen = null;
		probe.cancel();
		S.drawn = null;
		canvas.width = 1;
		canvas.height = 1;
	};

	S.hasRegion = () => S.rw > 0;

	/** Redraw the whole canvas next time (tests, and anything unusual). */
	S.invalidate = () => {
		renderAll = true;
	};

	/** Still busy with the last frame? (The controller's step budget.) */
	S.gpuBusy = () => ! S.lost && fence.busy();

	/**
	 * Steps run so far - including the ones stamp() slips in when a batch
	 * changes its rates mid-frame (pen pressure, a brush running dry):
	 * the controller counts those against the frame's budget.
	 */
	S.stepCount = () => stepNo;

	/**
	 * Cells the next step covers (0: nothing to run). The controller's
	 * frame budget counts work, not steps: a step over a whole wash costs
	 * a hundred steps over a fresh dab.
	 *
	 * @return {number} Cells.
	 */
	S.stepArea = () => {
		if ( ! S.rw || S.lost ) {
			return 0;
		}
		if ( false === S.scissor ) {
			return S.rw * S.rh;
		}
		let n = 0;
		for ( const r of [ ...runRects(), ...( stampQueue?.rects || [] ) ] ) {
			n += ( r.x1 - r.x0 + 1 ) * ( r.y1 - r.y0 + 1 );
		}
		return n;
	};

	/**
	 * One tiny dab through every program, then gone again: the driver
	 * finishes compiling each one for its real targets on its first draw,
	 * and the first stroke of a session must not wait for that (the
	 * controller calls this in idle time, see wetPrewarm).
	 */
	S.warmUp = () => {
		if ( S.lost || S.rw ) {
			return;
		}
		S.ensure( { x: 0, y: 0, w: 2, h: 2 } );
		if ( ! S.rw ) {
			return;
		}
		const ground = document.createElement( 'canvas' );
		ground.width = canvas.width;
		ground.height = canvas.height;
		S.setGround( ground );
		S.seedFromGround();
		S.stamp(
			{ data: new Float32Array( [ 1 ] ), w: 1, h: 1, gx: 0, gy: 0 },
			{ water: 1, pigment: 1, kr: 0.5, kg: 0.5, kb: 0.5, gran: 0 }
		);
		S.steps( 1 );
		S.render();
		S.dryAll();
		S.render();
		S.reset();
	};

	/**
	 * Feed (or clear) the ground under the island. `src` must be a canvas
	 * of exactly the island canvas' size, in document orientation, holding
	 * the target layer's straight RGBA pixels. Null clears.
	 *
	 * @param {HTMLCanvasElement|null} src The ground slice, or null.
	 */
	S.setGround = ( src ) => {
		renderAll = true;
		if ( texGround ) {
			gl.deleteTexture( texGround );
			texGround = null;
		}
		if ( ! src || ! S.rw || S.lost ) {
			return;
		}
		texGround = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, texGround );
		gl.texStorage2D(
			gl.TEXTURE_2D,
			1,
			gl.RGBA8,
			canvas.width,
			canvas.height
		);
		gl.pixelStorei( gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false );
		gl.pixelStorei( gl.UNPACK_FLIP_Y_WEBGL, false );
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			canvas.width,
			canvas.height,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			src
		);
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
	};

	/**
	 * Seed the layer's pigment under the island into VIRGIN cells (rgb =
	 * K, a = 2 for a full cell; 0 skips the cell). Cells that water has
	 * already worked on keep their state - a re-feed after a region grow
	 * must never resurrect pigment that was carried away.
	 *
	 * @param {Float32Array} cells rw*rh*4 floats, region grid order.
	 */
	S.seedGround = ( cells ) => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		const tmp = texFloat( S.rw, S.rh );
		gl.bindTexture( gl.TEXTURE_2D, tmp );
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			0,
			0,
			S.rw,
			S.rh,
			gl.RGBA,
			gl.FLOAT,
			cells
		);
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		const side = 1 - cur;
		targets( [ SD[ side ] ] );
		bindQuad( progSeedMerge );
		bindTex( progSeedMerge, 'uOld', 0, SD[ cur ] );
		bindTex( progSeedMerge, 'uNew', 1, tmp );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.deleteTexture( tmp );
		// ... and onto the current side as well: outside the active rect
		// both sides must agree, or a scissored step would bring the
		// unseeded side back.
		copySide( SD[ side ], SD[ cur ] );
		renderAll = true;
	};

	/**
	 * Seed the VIRGIN cells from the ground set last (setGround): the GPU
	 * twin of seedGround(), without the trip through JavaScript.
	 *
	 * @return {boolean} False without a ground - nothing was seeded.
	 */
	S.seedFromGround = () => {
		if ( ! S.rw || S.lost || ! texGround ) {
			return false;
		}
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		const side = 1 - cur;
		targets( [ SD[ side ] ] );
		bindQuad( progSeedGround );
		bindTex( progSeedGround, 'uOld', 0, SD[ cur ] );
		bindTex( progSeedGround, 'uGround', 1, texGround );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		// ... and onto the current side as well: outside the active rect
		// both sides must agree.
		copySide( SD[ side ], SD[ cur ] );
		renderAll = true;
		return true;
	};

	/** One whole field onto another of the same size, no shift. */
	function copySide( from, to ) {
		targets( [ to ] );
		bindQuad( progCopy );
		bindTex( progCopy, 'uT', 0, from );
		gl.uniform2i( uloc( progCopy, 'uShift' ), 0, 0 );
		gl.uniform2i( uloc( progCopy, 'uOldSize' ), S.rw, S.rh );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	}

	function makeStampTex() {
		if ( texStamp ) {
			gl.deleteTexture( texStamp );
		}
		texStamp = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RGBA32F, S.rw, S.rh );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
	}

	function allocRegion() {
		W = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		PK = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		PS = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		DK = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		DS = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		SD = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		makeStampTex();
		cur = 0;
		gl.viewport( 0, 0, S.rw, S.rh );
		gl.disable( gl.BLEND );
		gl.clearColor( 0, 0, 0, 0 );
		// BOTH sides: a scissored step never writes outside its rect.
		for ( const side of [ 0, 1 ] ) {
			targets( [ W[ side ], PK[ side ], PS[ side ] ] );
			gl.clear( gl.COLOR_BUFFER_BIT );
			targets( [ DK[ side ], DS[ side ], SD[ side ] ] );
			gl.clear( gl.COLOR_BUFFER_BIT );
		}
		accW = new Float32Array( S.rw * S.rh );
		accA = new Float32Array( S.rw * S.rh );
		accC = new Uint8Array( S.rw * S.rh );
		base = null;
		fresh = null;
		since = null;
		maskGen++;
		viscMax = S.params.viscK ?? 1;
		// A fresh region starts with the style that opens it.
		warpMax = S.params.warpK ?? 1;
		dirty = [];
		dirtyFrom = null;
		near = [];
		renderAll = true;
		ready = null;
		seen = null;
		probe.cancel();
		canvas.width = S.rw * SC;
		canvas.height = S.rh * SC;
	}

	S.ensure = ( rect ) => {
		if ( S.lost ) {
			return false;
		}
		const nx0 = Math.floor( rect.x / SC ) - MARGIN;
		const ny0 = Math.floor( rect.y / SC ) - MARGIN;
		const nx1 = Math.ceil( ( rect.x + rect.w ) / SC ) + MARGIN;
		const ny1 = Math.ceil( ( rect.y + rect.h ) / SC ) + MARGIN;
		const maxTex = Math.min(
			2048,
			gl.getParameter( gl.MAX_TEXTURE_SIZE ) || 2048
		);
		if ( ! S.rw ) {
			S.rx = nx0;
			S.ry = ny0;
			S.rw = Math.min( nx1 - nx0, maxTex );
			S.rh = Math.min( ny1 - ny0, maxTex );
			if ( S.rw * S.rh > MAX_CELLS ) {
				S.reset();
				return false;
			}
			allocRegion();
			return true;
		}
		// Rarely and by a lot (wet-gl-active.js growTo): a few cells per
		// pointer move was the crawl on integrated graphics.
		const grown = growTo( S, rect, SC, MARGIN, maxTex, MAX_CELLS );
		if ( null === grown ) {
			return true;
		}
		if ( ! grown ) {
			return false;
		}
		const ox0 = grown.rx;
		const oy0 = grown.ry;
		const nw = grown.rw;
		const nh = grown.rh;
		const shift = [ S.rx - ox0, S.ry - oy0 ];
		// A queued stamp batch was positioned against the OLD origin.
		const nW = new Float32Array( nw * nh );
		const nA = new Float32Array( nw * nh );
		const nC = new Uint8Array( nw * nh );
		if ( stampQueue ) {
			for ( let y = 0; y < S.rh; y++ ) {
				nW.set(
					accW.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
				nA.set(
					accA.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
				nC.set(
					accC.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
			}
			stampQueue.x0 += shift[ 0 ];
			stampQueue.x1 += shift[ 0 ];
			stampQueue.y0 += shift[ 1 ];
			stampQueue.y1 += shift[ 1 ];
			stampQueue.tiles = tileShift(
				stampQueue.tiles,
				shift[ 0 ],
				shift[ 1 ],
				nw,
				nh
			);
			stampQueue.rects = stampQueue.rects.map( ( r ) =>
				rectShift( r, shift[ 0 ], shift[ 1 ] )
			);
		}
		accW = nW;
		accA = nA;
		accC = nC;
		// The bookkeeping moves with the cells (the tiles of the new grid
		// rarely line up with the old ones: coarser, never smaller); a
		// probe in flight saw the old grid and is dropped.
		base = tileShift( base, shift[ 0 ], shift[ 1 ], nw, nh );
		fresh = tileShift( fresh, shift[ 0 ], shift[ 1 ], nw, nh );
		dirty = dirty.map( ( r ) => rectShift( r, shift[ 0 ], shift[ 1 ] ) );
		dirtyFrom = null;
		since = tileShift( since, shift[ 0 ], shift[ 1 ], nw, nh );
		near = near.map( ( r ) => rectShift( r, shift[ 0 ], shift[ 1 ] ) );
		maskGen++;
		ready = null;
		seen = null;
		probe.cancel();
		renderAll = true;
		const old = allPairs().map( ( pair ) => pair.slice() );
		const oldSize = [ S.rw, S.rh ];
		const oldCur = cur;
		S.rx = ox0;
		S.ry = oy0;
		S.rw = nw;
		S.rh = nh;
		W = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		PK = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		PS = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		DK = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		DS = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		SD = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		cur = 0;
		gl.viewport( 0, 0, nw, nh );
		gl.disable( gl.BLEND );
		const news = allPairs();
		for ( let i = 0; i < news.length; i++ ) {
			// Onto BOTH sides: outside the active rect they must agree.
			for ( const side of [ 0, 1 ] ) {
				targets( [ news[ i ][ side ] ] );
				bindQuad( progCopy );
				bindTex( progCopy, 'uT', 0, old[ i ][ oldCur ] );
				gl.uniform2i(
					uloc( progCopy, 'uShift' ),
					shift[ 0 ],
					shift[ 1 ]
				);
				gl.uniform2i(
					uloc( progCopy, 'uOldSize' ),
					oldSize[ 0 ],
					oldSize[ 1 ]
				);
				gl.drawArrays( gl.TRIANGLES, 0, 3 );
			}
		}
		old.forEach( ( pair ) =>
			pair.forEach( ( t ) => t && gl.deleteTexture( t ) )
		);
		makeStampTex();
		// The old ground no longer lines up with the grown region.
		S.setGround( null );
		canvas.width = S.rw * SC;
		canvas.height = S.rh * SC;
		return true;
	};

	/**
	 * Queue a stamp. All stamps of one frame batch into CPU float
	 * accumulators (meniscus water profile summed PER DAB) and fold into
	 * the next water pass as one RGBA32F subrect.
	 *
	 * @param {Object} map { data, w, h, gx, gy } - alpha 0..1 (or bytes),
	 *                     gx/gy the ABSOLUTE grid position.
	 * @param {Object} p   { water, pigment, kr, kg, kb, sr, sg, sb, gran }.
	 */
	S.stamp = ( map, p ) => {
		if ( ! S.rw ) {
			return;
		}
		// Ein Batch traegt EINE Pigmentidentitaet. Wechselt sie mitten im
		// Frame (Probe, spaeter Mehrfarb-Spitzen), wird der alte Batch
		// erst eingefaltet - sonst malt der zweite Stempel mit den Werten
		// des ersten (gemessen: Rot wurde weiss).
		if (
			stampQueue &&
			( stampQueue.pig[ 0 ] !== p.kr ||
				stampQueue.pig[ 1 ] !== p.kg ||
				stampQueue.pig[ 2 ] !== p.kb ||
				stampQueue.pigS[ 0 ] !== ( p.sr || 0 ) ||
				// One batch also carries ONE rate pair: pen pressure
				// changes water/pigment per segment (same bug class as
				// the colour change - the second stamp would use the
				// first stamp's rates). Compared in the queue's own
				// scaling, or this folds on EVERY stamp.
				stampQueue.amt[ 0 ] !== 0.42 * p.water ||
				stampQueue.amt[ 1 ] !== 0.3 * p.pigment )
		) {
			S.steps( 1 );
		}
		if ( ! stampQueue ) {
			stampQueue = {
				x0: S.rw,
				y0: S.rh,
				x1: -1,
				y1: -1,
				pig: [ p.kr, p.kg, p.kb, p.gran || 0 ],
				pigS: [ p.sr || 0, p.sg || 0, p.sb || 0 ],
				amt: [ 0.42 * p.water, 0.3 * p.pigment ],
				// The tiles and rects of the dabs themselves: mirror twins
				// at both ends of the page are two small places, not the
				// box between them.
				tiles: tileMask( S.rw, S.rh ),
				rects: [],
			};
		}
		const q = stampQueue;
		const bytes =
			map.data instanceof Uint8ClampedArray ||
			map.data instanceof Uint8Array;
		const dx = map.gx - S.rx;
		const dy = map.gy - S.ry;
		const cv = map.cover || null;
		for ( let my = 0; my < map.h; my++ ) {
			const gy = dy + my;
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
				const gx = dx + mx;
				if ( gx < 0 || gx >= S.rw ) {
					continue;
				}
				const i = gy * S.rw + gx;
				accW[ i ] += 0.3 + 0.7 * Math.sqrt( a );
				accA[ i ] += a;
				// Coverage: WHICH of the cell's four pixels are wet - the
				// caller's bits where it has them (map.cover, the editor
				// draws its segments at twice the grid for it). A driver
				// without them wets the whole cell. (The alpha itself will
				// not do: under a soft tip it is how MUCH paint lands, and
				// a wash drew a second outline where its tip's falloff
				// began. Nor will a share: two passes that wet a half each
				// have wetted all of it, or two of them have not.)
				accC[ i ] |= cv ? cv[ my * map.w + mx ] : 15;
			}
		}
		q.x0 = Math.max( 0, Math.min( q.x0, dx ) );
		q.y0 = Math.max( 0, Math.min( q.y0, dy ) );
		q.x1 = Math.min( S.rw - 1, Math.max( q.x1, dx + map.w ) );
		q.y1 = Math.min( S.rh - 1, Math.max( q.y1, dy + map.h ) );
		const dab = rectGrow(
			{ x0: dx, y0: dy, x1: dx + map.w, y1: dy + map.h },
			0,
			S.rw,
			S.rh
		);
		tileMark( q.tiles, dab );
		q.rects = addRect( q.rects, dab );
		S.wet = 1;
		stampSerial++;
	};

	function runPass( prog, targetList, binds, extra ) {
		targets( targetList );
		bindQuad( prog );
		binds();
		if ( extra ) {
			extra( prog );
		}
		gl.drawArrays( gl.TRIANGLES, 0, geomCount );
	}

	/** Take a finished probe; it waits in `ready` for its step. */
	function pollProbe() {
		if ( ! ready ) {
			const r = probe.take();
			if ( r ) {
				ready = r;
				seen = r;
			}
		}
	}

	/** Start over from what the probe saw, and the stamps since. */
	function applyProbe() {
		lastLag = stepNo - ready.t0;
		base = ready.tiles;
		baseT = ready.t0;
		fresh = since;
		maskGen++;
		ready = null;
	}

	/**
	 * How many rings the active set can gain in k steps. A cell outside
	 * it is unmarked with paper no damper than DAMP, and it joins when
	 * fibre creep from a neighbour damper than CREEP lifts it past DAMP:
	 * one ring at once. The ring after that waits until one of those
	 * cells climbs past CREEP itself, and creep lifts paper by at most
	 * 4 x SKRIECH x visc per step (four neighbours, a moisture gap of at
	 * most one, a paper factor of at most one). Flooding needs REWET, far
	 * above DAMP - a flooded cell was in the set already - and only
	 * marked cells lose water, carry or settle pigment. Change any of
	 * that in the shaders and this changes with it; the lab's scissor
	 * check (run.mjs <out> scissor) proves it bit for bit.
	 *
	 * @param {number} k Steps since the probe.
	 * @return {number} Rings.
	 */
	function reach( k ) {
		if ( k <= 0 ) {
			return 0;
		}
		const lift = 4 * SKRIECH * Math.max( viscMax, 1e-3 );
		const lag = Math.floor( ( CREEP - DAMP ) / lift ) + 1;
		return 1 + Math.floor( ( k - 1 ) / lag );
	}

	/** The tiles that can hold a wet or damp cell right now (or null). */
	function bound() {
		return tileGrow(
			tileUnion( base, fresh ),
			Math.ceil( reach( stepNo - baseT ) / ACTIVE_TILE )
		);
	}

	/**
	 * The cells a step runs over: the tiles that held active cells at the
	 * probe and the fresh stamps', each grown by how far the activity can
	 * have spread and one cell ring more - in CELLS: a ring of whole tiles
	 * ran a compact stroke over almost three times its cells. Worked out
	 * again only when base, fresh or the reach changed. Grown rects may
	 * overlap; a cell shaded twice gets the same value twice.
	 *
	 * @return {Array} Cell rects.
	 */
	function runRects() {
		const grow = reach( stepNo - baseT ) + 1;
		const key = maskGen + ':' + grow;
		if ( key !== runKey ) {
			runKey = key;
			runCache = tileRects( tileUnion( base, fresh ), S.rw, S.rh ).map(
				( r ) => rectGrow( r, grow, S.rw, S.rh )
			);
		}
		return runCache;
	}

	/**
	 * Point the passes at a set of cell rects: they become the geometry
	 * every pass of the step draws (uploaded once per set).
	 *
	 * @param {Array} rects Cell rects.
	 */
	function drawRects( rects ) {
		if ( rects !== simFor ) {
			simFor = rects;
			const px = rects.map( ( r ) => ( {
				x0: r.x0,
				y0: r.y0,
				x1: r.x1 + 1,
				y1: r.y1 + 1,
			} ) );
			const tri = rectTriangles( px, S.rw, S.rh, simData );
			simData = tri.data;
			simCount = tri.count;
			gl.bindBuffer( gl.ARRAY_BUFFER, simBuf );
			gl.bufferData(
				gl.ARRAY_BUFFER,
				simData.subarray( 0, simCount * 2 ),
				gl.DYNAMIC_DRAW
			);
		}
		geomBuf = simBuf;
		geomCount = simCount;
	}

	/**
	 * Fold the batch's accumulators into the stamp texture (its rect
	 * only) and clear them there for the next batch.
	 *
	 * @param {Object} q The batch.
	 */
	function uploadStamp( q ) {
		const qw = q.x1 - q.x0 + 1;
		const qh = q.y1 - q.y0 + 1;
		if ( upload.length < qw * qh * 4 ) {
			upload = new Float32Array( qw * qh * 4 );
		}
		for ( let y = 0; y < qh; y++ ) {
			const row = ( q.y0 + y ) * S.rw + q.x0;
			for ( let x = 0; x < qw; x++ ) {
				const o = ( y * qw + x ) * 4;
				upload[ o ] = accW[ row + x ];
				upload[ o + 1 ] = accA[ row + x ];
				upload[ o + 2 ] = accC[ row + x ];
				upload[ o + 3 ] = 0;
			}
			accW.fill( 0, row, row + qw );
			accA.fill( 0, row, row + qw );
			accC.fill( 0, row, row + qw );
		}
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			q.x0,
			q.y0,
			qw,
			qh,
			gl.RGBA,
			gl.FLOAT,
			upload.subarray( 0, qw * qh * 4 )
		);
	}

	S.steps = ( n ) => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		pollProbe();
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		for ( let k = 0; k < n; k++, stepNo++ ) {
			if ( ready && stepNo > ready.t0 ) {
				applyProbe();
			}
			const a = cur;
			const b = 1 - cur;
			let q = null;
			if ( k === 0 && stampQueue ) {
				// A batch whose dabs all fell outside the grid is empty.
				const e = stampQueue;
				q = e.x1 >= e.x0 && e.y1 >= e.y0 ? e : null;
				stampQueue = null;
			}
			if ( q ) {
				fresh = tileUnion( fresh, q.tiles );
				since = tileUnion( since, q.tiles );
				maskGen++;
				if ( ! near.length ) {
					nearStep = stepNo;
				}
				for ( const r of q.rects ) {
					near = addRect( near, r );
				}
				uploadStamp( q );
			}
			// Every cell this step can change: the active set and one
			// ring. Nothing active, nothing to do - both sides agree
			// everywhere, so skipping IS the step.
			let run = null;
			if ( false === S.scissor ) {
				drawWhole();
			} else {
				run = runRects();
				if ( ! run.length ) {
					continue;
				}
				drawRects( run );
			}
			// Pass 1: wasser (+ the frame's stamps).
			runPass(
				progWasser,
				[ W[ b ], PK[ b ], PS[ b ] ],
				() => {
					bindTex( progWasser, 'uW', 0, W[ a ] );
					bindTex( progWasser, 'uPK', 1, PK[ a ] );
					bindTex( progWasser, 'uPS', 2, PS[ a ] );
				},
				( prog ) => {
					if ( q ) {
						gl.activeTexture( gl.TEXTURE3 );
						gl.bindTexture( gl.TEXTURE_2D, texStamp );
						gl.uniform1i( uloc( prog, 'uStamp' ), 3 );
						gl.uniform2i( uloc( prog, 'uStampSize' ), S.rw, S.rh );
						gl.uniform4i(
							uloc( prog, 'uStampRect' ),
							q.x0,
							q.y0,
							q.x1,
							q.y1
						);
						gl.uniform4f( uloc( prog, 'uStampPig' ), ...q.pig );
						gl.uniform3f( uloc( prog, 'uStampPigS' ), ...q.pigS );
						gl.uniform2f( uloc( prog, 'uStampAmt' ), ...q.amt );
					} else {
						gl.uniform2i( uloc( prog, 'uStampSize' ), 0, 0 );
					}
				}
			);
			// Pass 2: fluss.
			runPass( progFluss, [ W[ a ], PK[ a ], PS[ a ] ], () => {
				bindTex( progFluss, 'uW', 0, W[ b ] );
				bindTex( progFluss, 'uPK', 1, PK[ b ] );
				bindTex( progFluss, 'uPS', 2, PS[ b ] );
			} );
			// Pass 3a + 3b: trocknen, same snapshot (side a), split targets.
			runPass( progTrockA, [ W[ b ], PK[ b ], PS[ b ] ], () => {
				bindTex( progTrockA, 'uW', 0, W[ a ] );
				bindTex( progTrockA, 'uPK', 1, PK[ a ] );
				bindTex( progTrockA, 'uPS', 2, PS[ a ] );
				bindTex( progTrockA, 'uDK', 4, DK[ a ] );
				bindTex( progTrockA, 'uDS', 5, DS[ a ] );
				bindTex( progTrockA, 'uSD', 6, SD[ a ] );
			} );
			runPass( progTrockB, [ DK[ b ], DS[ b ] ], () => {
				bindTex( progTrockB, 'uW', 0, W[ a ] );
				bindTex( progTrockB, 'uPK', 1, PK[ a ] );
				bindTex( progTrockB, 'uPS', 2, PS[ a ] );
				bindTex( progTrockB, 'uDK', 4, DK[ a ] );
				bindTex( progTrockB, 'uDS', 5, DS[ a ] );
			} );
			// Pass 3c: the seed side of the same snapshot.
			runPass( progTrockC, [ SD[ b ] ], () => {
				bindTex( progTrockC, 'uW', 0, W[ a ] );
				bindTex( progTrockC, 'uSD', 1, SD[ a ] );
			} );
			cur = b;
			if ( run !== dirtyFrom ) {
				dirty = run ? run.reduce( addRect, dirty ) : [ whole() ];
				dirtyFrom = run;
			}
		}
		drawWhole();
		// The frame budget asks whether the GPU is still on this frame's
		// steps too, not only on its renders - a frame that only steps
		// must not look idle.
		fence.mark();
		// The next probe: where is it still wet or damp? It comes back
		// frames later; the set only shrinks when it does.
		const cover = bound();
		if ( tileAny( cover ) && ! ready && ! probe.busy() ) {
			probe.request( W[ cur ], cover, S.rw, S.rh, {
				t0: stepNo,
				serial: stampSerial,
			} );
			since = null;
		}
	};

	/**
	 * Still wet? Never waits for the GPU: the answer comes from the latest
	 * probe, and "dry" only counts when no stamp came after it. Under
	 * replay (the brush lab) it asks the GPU on the spot, as it always did.
	 */
	S.checkWet = () => {
		if ( ! S.rw || S.lost ) {
			S.wet = 0;
			return 0;
		}
		if ( stampQueue ) {
			return S.wet; // paint waiting for its step is wet paint
		}
		const cover = bound();
		if ( ! tileAny( cover ) ) {
			// Nothing wet or damp anywhere: provably dry.
			S.wet = 0;
		} else if ( wetReplay() ) {
			S.wet = probe.now( W[ cur ], cover, S.rw, S.rh ).wet > 0.5 ? 1 : 0;
		} else {
			pollProbe();
			if ( seen && seen.serial === stampSerial && seen.wet <= 0.5 ) {
				S.wet = 0;
			}
		}
		return S.wet;
	};

	/** Instant dry: everything settles, the water goes. */
	S.dryAll = () => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		// Dabs still waiting for their step go down first. A flush in the
		// middle of a stroke (the region cap, undo, save) used to bake
		// without them - the dry island always folded them in.
		if ( stampQueue ) {
			S.steps( 1 );
		}
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		const a = cur;
		const b = 1 - cur;
		runPass( progDryB, [ DK[ b ], DS[ b ] ], () => {
			bindTex( progDryB, 'uPK', 1, PK[ a ] );
			bindTex( progDryB, 'uPS', 2, PS[ a ] );
			bindTex( progDryB, 'uDK', 4, DK[ a ] );
			bindTex( progDryB, 'uDS', 5, DS[ a ] );
		} );
		runPass( progDryA, [ W[ b ], PK[ b ], PS[ b ] ], () => {
			bindTex( progDryA, 'uW', 0, W[ a ] );
		} );
		// SD just moves sides so the ping-pong stays consistent.
		targets( [ SD[ b ] ] );
		bindQuad( progCopy );
		bindTex( progCopy, 'uT', 0, SD[ a ] );
		gl.uniform2i( uloc( progCopy, 'uShift' ), 0, 0 );
		gl.uniform2i( uloc( progCopy, 'uOldSize' ), S.rw, S.rh );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		cur = b;
		S.wet = 0;
		// Only one side took the drying: the whole region is in play again.
		base = allTiles();
		baseT = stepNo;
		fresh = null;
		maskGen++;
		dirty = [];
		dirtyFrom = null;
		near = [];
		renderAll = true;
		ready = null;
		seen = null;
		probe.cancel();
	};

	/**
	 * Render the ink into the island's own canvas (premultiplied).
	 *
	 * @param {boolean} nearOnly Only around the dabs folded in since the
	 *                           last render; the rest of what the steps
	 *                           touched waits for the next full render.
	 *                           Under the hand the controller alternates:
	 *                           the brush's own paint needs every frame,
	 *                           the wash further off moves too slowly to.
	 */
	S.render = ( nearOnly = false ) => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		// Only what the steps touched, plus the render's own reach; the
		// drawing buffer is preserved, so the rest still shows the last
		// frame - which is still the truth there.
		const part = nearOnly && ! renderAll && false !== S.scissor;
		let cells = null; // cell rects to redraw; null redraws all
		if ( ! renderAll && false !== S.scissor ) {
			// Fresh paint travels a cell per step at most (every pass
			// looks one neighbour out).
			cells = part
				? near.map( ( r ) =>
						rectGrow(
							r,
							stepNo - nearStep + RENDER_PAD,
							S.rw,
							S.rh
						)
				  )
				: dirty.map( ( r ) => rectGrow( r, RENDER_PAD, S.rw, S.rh ) );
			cells = cells.filter( Boolean );
			if ( ! cells.length ) {
				return; // nothing moved
			}
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, canvas.width, canvas.height );
		gl.disable( gl.BLEND );
		if ( cells ) {
			// The canvas is y-down, the drawing buffer y-up.
			const H = canvas.height;
			const tri = rectTriangles(
				cells.map( ( r ) => ( {
					x0: r.x0 * SC,
					x1: ( r.x1 + 1 ) * SC,
					y0: H - ( r.y1 + 1 ) * SC,
					y1: H - r.y0 * SC,
				} ) ),
				canvas.width,
				H,
				inkData
			);
			inkData = tri.data;
			gl.bindBuffer( gl.ARRAY_BUFFER, inkBuf );
			gl.bufferData(
				gl.ARRAY_BUFFER,
				inkData.subarray( 0, tri.count * 2 ),
				gl.STREAM_DRAW
			);
			geomBuf = inkBuf;
			geomCount = tri.count;
		}
		bindQuad( progInk );
		bindTex( progInk, 'uPKt', 0, PK[ cur ] );
		bindTex( progInk, 'uPSt', 1, PS[ cur ] );
		bindTex( progInk, 'uDKt', 2, DK[ cur ] );
		bindTex( progInk, 'uDSt', 3, DS[ cur ] );
		bindTex( progInk, 'uWtex', 4, W[ cur ] );
		bindTex( progInk, 'uPF', 5, texPF );
		// A dummy binding keeps the sampler unit complete when no ground
		// is set; the uHasGround gate keeps it unread.
		bindTex( progInk, 'uGround', 6, texGround || texPF );
		bindTex( progInk, 'uSDt', 7, SD[ cur ] );
		gl.uniform1i( uloc( progInk, 'uHasGround' ), texGround ? 1 : 0 );
		gl.uniform1f( uloc( progInk, 'uKorn' ), S.params.korn );
		gl.uniform1f( uloc( progInk, 'uWarpK' ), warpMax || 1 );
		gl.drawArrays( gl.TRIANGLES, 0, geomCount );
		drawWhole();
		// What reached the canvas, as rects (y-down) for the presentation.
		S.drawn = ( S.drawn || [] ).concat(
			cells
				? cells.map( ( r ) => ( {
						x: r.x0 * SC,
						y: r.y0 * SC,
						w: ( r.x1 - r.x0 + 1 ) * SC,
						h: ( r.y1 - r.y0 + 1 ) * SC,
				  } ) )
				: [ { x: 0, y: 0, w: canvas.width, h: canvas.height } ]
		);
		near = [];
		if ( ! part ) {
			dirty = [];
			dirtyFrom = null;
			renderAll = false;
		}
		fence.mark();
	};

	/* Test hooks: field readbacks, slow, for the harness probes only. */
	/** Test hook: the active tiles as they stand, and the last probe's lag. */
	S.debugActive = () => {
		const b = bound();
		return {
			rect: tileBox( b, S.rw, S.rh ),
			cells: tileCells( b, S.rw, S.rh ),
			lag: lastLag,
		};
	};

	S.readField = ( which ) => {
		const map = { W, P: PK, PK, PS, D: DK, DK, DS, SD };
		const tex = ( map[ which ] || W )[ cur ];
		const out = new Float32Array( S.rw * S.rh * 4 );
		gl.bindFramebuffer( gl.FRAMEBUFFER, fboRead );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			tex,
			0
		);
		gl.readPixels( 0, 0, S.rw, S.rh, gl.RGBA, gl.FLOAT, out );
		return out;
	};

	return S;
}
