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
 * - Stamps accumulate on the CPU as FLOATS and upload as one RG32F
 *   subrect: batching dabs through a canvas saturates alpha at one and
 *   starves the film to a quarter of the calibration (measured).
 * - The ink pass Y-FLIPS: WebGL's origin is bottom-left, the 2D pipeline
 *   reads top-left. Only this pass - the sim passes are texture-to-texture
 *   and internally consistent. Probes need ASYMMETRIC shapes to catch
 *   orientation bugs; all symmetric scenes were blind to it.
 * - "Still wet?" is a two-stage max reduction and a 4-byte readback every
 *   few ticks, never a field readback.
 *
 * No imports, on purpose: the standalone harness on the dev docroot loads
 * this very file as an ES module, so engine and editor cannot drift apart.
 */

const SC = 2; // cell size in document pixels (the tuned calibration)
// Generous on purpose: every grow resizes (= clears) the island canvas,
// and even with the atomic handover a grow costs texture copies. At 48
// cells a fast stroke grew every few frames - the flicker Thomas saw.
const MARGIN = 128; // grid cells of slack around a stroke
const MAX_CELLS = 4194304; // 2048x2048 cells; the GPU can afford it

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

/** Full-res tile: R = paper tooth, G/B = warp x/y (quantized). */
function buildPaperFTile( paperQ, pap ) {
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
			const gq =
				paperQ[
					( ( y >> 1 ) % TILEG ) * TILEG + ( ( x >> 1 ) % TILEG )
				];
			let pf = 0.42 * gq + 0.3 * pnoise( x, y, TILE, 44, 71 ) + 0.28 * f;
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
#define EVAP 0.000275
#define EDGEK 0.35
#define DEP 0.002
#define LIFT 0.06
#define REWET 0.35
#define FLUT 0.12
#define SKRIECH 0.02
#define PDIFF 0.007
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

uniform ivec2 uSize;    // region size in cells
uniform ivec2 uOrigin;  // region origin in ABSOLUTE cells
uniform sampler2D uPQ;  // paper tile, grid cells, wrapped lookup

float pq( ivec2 cell ) {
	ivec2 a = cell + uOrigin;
	return texelFetch(
		uPQ,
		ivec2( a.x & ${ TILEG - 1 }, a.y & ${ TILEG - 1 } ),
		0
	).r;
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
	float avg = ( pk.r + pk.g + pk.b ) / 3.0;
	if ( avg > 1e-6 ) {
		float granF = min( 1.0, gran / avg );
		float wgt = ( 1.0 - granF ) * 0.55 +
			granF * ( 0.18 + 1.25 * ( 1.0 - pqc ) );
		float dry = 1.0 - min( 1.0, w );
		float dep = min( 0.5, DEP * uDepK * dry * dry * wgt );
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
// Frame stamp accumulator, RG32F: R = summed meniscus water, G = summed
// alpha. Accumulated per dab on the CPU - canvas compositing saturates
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
	} else if ( s > 0.003 ) {
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

	float pqc = pq( xy );
	float ds = 0.0;
	for ( int k = 0; k < 4; k++ ) {
		ivec2 n = xy + DIRS[ k >= 2 ? k + 2 : k ];
		if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
			continue;
		}
		vec2 nn = drink( texelFetch( uW, n, 0 ) );
		float sn = nn.y;
		if ( sn > 0.3 && sn > s ) {
			ds += ( sn - s ) * SKRIECH * uViscK *
				( 0.4 + 0.6 * ( 1.0 - pqc ) );
		}
		if ( s > 0.3 && s > sn ) {
			ds -= ( s - sn ) * SKRIECH * uViscK *
				( 0.4 + 0.6 * ( 1.0 - pq( n ) ) );
		}
	}
	s = clamp( s + ds, 0.0, 1.0 );

	if ( uStampSize.x > 0 &&
		xy.x >= uStampRect.x && xy.y >= uStampRect.y &&
		xy.x <= uStampRect.z && xy.y <= uStampRect.w ) {
		vec2 st = texelFetch( uStamp, xy, 0 ).rg;
		if ( st.x > 0.0 ) {
			w = min( 3.0, w + uStampAmt.x * st.x );
			s = min( 1.0, s + 0.14 * min( 1.0, st.y ) );
			m = 1.0;
			float kSum = ( uStampPig.r + uStampPig.g + uStampPig.b ) / 3.0;
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
	return ( 0.55 + 0.4 * dryn ) * 1.4;
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
	float pqc = pq( xy );

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
		vec4 Wn = texelFetch( uW, n, 0 );
		float wn = Wn.r;
		bool mn = Wn.b > 0.5;
		if ( ! mc && ! mn ) {
			continue;
		}
		// Diagonals carry less (longer path) and every cap shrinks: with
		// eight pairs any per-pair cap whose sum passes 100 % lets the
		// post-apply clamp CREATE mass (measured 1.6e19 in the prototype).
		// 4 x 0.125 + 4 x 0.085 = 84 %.
		float lw = d == 0 || d == 1 || d == 4 || d == 5 ? 1.0 : 0.7071;
		float capk = lw == 1.0 ? 0.125 : 0.085;
		float cond = 0.75 + 0.5 * ( 1.0 - ( pqc + pq( n ) ) * 0.5 );
		float jit = pairJitter( xy, d );
		float f = 0.0; // positive = out of this cell
		if ( mc && mn ) {
			float diff = wc - wn;
			float eb = Wn.a - efc;
			f = ( diff * FLOW * lw * cond * jit +
				SOG * uSogK * eb * lw * min( wc, wn ) ) * uViscK;
			f = clamp( f, -capk * wn, capk * wc );
			// Diffusion in standing water: a dab in a LEVEL puddle still
			// spreads; scaled by depth so it stops while drying.
			float dsc = PDIFF * uViscK * lw * min( 1.0, ( wc + wn ) * 0.5 );
			diffK += dsc * ( texelFetch( uPK, n, 0 ) - PK );
			diffS += dsc * ( texelFetch( uPS, n, 0 ).rgb - PS.rgb );
		} else if ( mc ) {
			if ( Wn.g >= REWET && wc > FLUT ) {
				f = min( wc * FLOW * uViscK * lw * cond * jit, capk * wc );
			} else {
				continue;
			}
		} else {
			if ( sc >= REWET && wn > FLUT ) {
				f = -min( wn * FLOW * uViscK * lw * cond * jit, capk * wn );
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
			amt = min( capk, amt * mobility( wc ) );
			outFrac += amt;
		} else {
			float amt = min( capk, -f / ( wn + 1e-4 ) );
			amt = min( capk, amt * mobility( wn ) );
			pigInK += amt * texelFetch( uPK, n, 0 );
			pigInS += amt * texelFetch( uPS, n, 0 ).rgb;
		}
	}
	float m = mc || flooded ? 1.0 : 0.0;
	float ef = flooded ? 3.0 : efc;
	oW = vec4( max( 0.0, wc + wsum ), sc, m, ef );
	oPK = max( vec4( 0.0 ), PK * ( 1.0 - outFrac ) + pigInK + diffK );
	oPS = vec4(
		max( vec3( 0.0 ), PS.rgb * ( 1.0 - outFrac ) + pigInS + diffS ),
		0.0
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

void fate( ivec2 xy, out vec4 pk, out vec3 ps, out float wAfter ) {
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
	pkv += seedLift( W.r, sd );
	pk = vec4( pkv, gran );
	ps = psv;
	float dryN = dryNOf( xy );
	wAfter = W.r - EVAP * uEvapK * ( 1.0 + EDGEK * dryN ) *
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
	fate( xy, pk, ps, wAfter );

	if ( wAfter <= 0.004 ) {
		oW = vec4( 0.0, W.g, 0.0, 0.0 );
		oPK = vec4( 0.0 );
		oPS = vec4( 0.0 );
		return;
	}

	// Survivor: gather the retreat shares of dying 4-neighbours. Each
	// dying neighbour's fate is recomputed deterministically - a share
	// without a receiver would be lost mass (the pair-cap bug class).
	vec4 gainK = vec4( 0.0 );
	vec3 gainS = vec3( 0.0 );
	for ( int k = 0; k < 4; k++ ) {
		ivec2 n = xy +
			( k == 0
				? ivec2( 1, 0 )
				: k == 1
				? ivec2( -1, 0 )
				: k == 2
				? ivec2( 0, 1 )
				: ivec2( 0, -1 ) );
		if ( ! wet( n ) ) {
			continue;
		}
		vec4 pkn;
		vec3 psn;
		float wn;
		fate( n, pkn, psn, wn );
		if ( wn <= 0.004 ) {
			int nb = wetN4( n );
			if ( nb > 0 ) {
				gainK += pkn * ( RUECK / float( nb ) );
				gainS += psn * ( RUECK / float( nb ) );
			}
		}
	}
	float dryN = dryNOf( xy );
	oW = vec4( wAfter, W.g, 1.0, min( 6.0, floor( dryN + 0.5 ) ) );
	oPK = pk + gainK;
	oPS = vec4( ps + gainS, 0.0 );
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
	vec3 psv = texelFetch( uPS, xy, 0 ).rgb;
	float pqc = pq( xy );
	vec3 pkv = PKv.rgb;
	float gran = PKv.a;
	vec3 dkv = DKv.rgb;
	float dgran = DKv.a;
	vec3 dsv = DSv.rgb;
	transferFate( W.r, pqc, pkv, gran, psv, dkv, dgran, dsv );
	float dryN = dryNOf( xy );
	float wAfter = W.r - EVAP * uEvapK * ( 1.0 + EDGEK * dryN ) *
		( 0.7 + 0.4 * pqc + 0.2 * cellHash( xy ) );
	if ( wAfter <= 0.004 ) {
		float bleib = wetN4( xy ) > 0 ? 1.0 - float( RUECK ) : 1.0;
		dkv += pkv * bleib;
		dgran += gran * bleib;
		dsv += psv * bleib;
	}
	oDK = vec4( dkv, dgran );
	oDS = vec4( dsv, 0.0 );
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

uniform sampler2D uPKt;
uniform sampler2D uPSt;
uniform sampler2D uDKt;
uniform sampler2D uDSt;
uniform sampler2D uWtex;
uniform sampler2D uPF;
uniform float uKorn;
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
	vec2 warp = ( pf.gb * 255.0 - 128.0 ) / 40.0;

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
	float wl = 0.0;
	float fsum = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			float k = wx[ i + 1 ] * wy[ j + 1 ];
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			sumK += k * ( texelFetch( uDKt, c, 0 ) + texelFetch( uPKt, c, 0 ) );
			sumS += k *
				( texelFetch( uDSt, c, 0 ).rgb + texelFetch( uPSt, c, 0 ).rgb );
			wl += k * texelFetch( uWtex, c, 0 ).r;
			float sda = texelFetch( uSDt, c, 0 ).a;
			// Virgin cells (a < 1) keep their ground untouched.
			fsum += k * ( sda >= 1.0 ? clamp( sda - 1.0, 0.0, 1.0 ) : 1.0 );
		}
	}
	vec3 K = sumK.rgb;
	vec3 S = sumS;
	float cov = ( K.r + K.g + K.b ) / 3.0 + ( S.r + S.g + S.b ) / 3.0;
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
		sumK.a / max( ( K.r + K.g + K.b ) / 3.0, 1e-5 )
	);
	float delta = 0.5 - g;
	float amp = uKorn * 1.6 * ( 0.35 + 0.85 * granLoc );
	float mod2 = max(
		0.35,
		1.0 + delta * amp * ( delta > 0.0 ? 1.0 : 0.45 )
	);
	K *= mod2;
	S *= mod2;

	vec3 t = exp( -K );
	vec3 r = K / ( S + 1e-4 );
	vec3 Rinf = 1.0 + r - sqrt( r * r + 2.0 * r );
	vec3 h = 1.0 - exp( -1.5 * S );
	vec3 Rw = ( 1.0 - h ) * t + h * Rinf;
	vec3 Rb = h * Rinf;
	// The wet sheen: damp paint reads darker and a touch cooler.
	if ( wl > 0.01 ) {
		float k = min( 1.0, wl );
		vec3 sheen = vec3(
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
				Rg = pow( max( Rg, vec3( 1e-4 ) ), vec3( fRest ) );
			}
			vec3 T2 = ( Rw - Rb ) * ( 1.0 - Rb );
			vec3 Rc = clamp(
				Rb + T2 * Rg / max( vec3( 0.02 ), 1.0 - Rb * Rg ),
				0.0,
				1.0
			);
			oC = gpx.a * vec4( Rc, 1.0 ) + ( 1.0 - gpx.a ) * film;
			return;
		}
	}
	oC = film;
}
`;

/* Copy pass (region grow) and the two-stage wet-max reduction. */
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

const FRAG_MAXCOL = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform ivec2 uSize;
out vec4 oC;
void main() {
	int x = int( gl_FragCoord.x );
	float m = 0.0;
	for ( int y = 0; y < uSize.y; y++ ) {
		m = max( m, texelFetch( uT, ivec2( x, y ), 0 ).b );
	}
	oC = vec4( m );
}
`;

const FRAG_MAXROW = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform ivec2 uSize;
out vec4 oC;
void main() {
	float m = 0.0;
	for ( int x = 0; x < uSize.x; x++ ) {
		m = max( m, texelFetch( uT, ivec2( x, 0 ), 0 ).r );
	}
	oC = vec4( m );
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
	oDS = texelFetch( uDS, xy, 0 ) + texelFetch( uPS, xy, 0 );
}
`;

/* ------------------------------- the engine ------------------------------ */

export const WET_GL_SC = SC;

/** Whether this browser can run the island at all. */
export function wetGlAvailable() {
	try {
		const c = document.createElement( 'canvas' );
		const gl = c.getContext( 'webgl2' );
		return !! ( gl && gl.getExtension( 'EXT_color_buffer_float' ) );
	} catch ( e ) {
		return false;
	}
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
			compile( gl.FRAGMENT_SHADER, fragSrc.replace( '__CHUNK__', CHUNK ) )
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
	const progInk = program( FRAG_INK );
	const progCopy = program( FRAG_COPY );
	const progMaxCol = program( FRAG_MAXCOL );
	const progMaxRow = program( FRAG_MAXROW );
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
	gl.texStorage2D( gl.TEXTURE_2D, 1, gl.R32F, TILEG, TILEG );
	gl.texSubImage2D(
		gl.TEXTURE_2D,
		0,
		0,
		0,
		TILEG,
		TILEG,
		gl.RED,
		gl.FLOAT,
		paperQ
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

	let texStamp = null; // RG32F, region-sized, re-made with the region
	// The GROUND: the target layer's pixels under the island (RGBA8 at
	// canvas resolution), fed by the controller. Dropped on grow/reset -
	// the controller re-feeds when the geometry changes; without a fresh
	// feed the render falls back to the floating film, never to a stale
	// or misplaced ground.
	let texGround = null;

	const fbo = gl.createFramebuffer();
	const fboRead = gl.createFramebuffer();

	const S = {
		canvas,
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0, // 1 = maybe wet, 0 = certainly dry (from the reduction)
		lost: false,
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
		},
	};

	S.setParams = ( p ) => {
		S.params = { ...S.params, ...p };
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
			gl.RED,
			gl.FLOAT,
			q
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
	let maxCol = null;
	let maxOne = null;
	// The frame's stamp batch: CPU float accumulators plus the dirty rect.
	let stampQueue = null; // { accW, accA, x0, y0, x1, y1, pig, pigS, amt }

	const allPairs = () => [ W, PK, PS, DK, DS, SD ];

	function bindQuad( prog ) {
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, quad );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		const uSize = gl.getUniformLocation( prog, 'uSize' );
		if ( uSize ) {
			gl.uniform2i( uSize, S.rw, S.rh );
		}
		const uOrigin = gl.getUniformLocation( prog, 'uOrigin' );
		if ( uOrigin ) {
			gl.uniform2i( uOrigin, S.rx, S.ry );
		}
		const uPQ = gl.getUniformLocation( prog, 'uPQ' );
		if ( uPQ ) {
			gl.activeTexture( gl.TEXTURE7 );
			gl.bindTexture( gl.TEXTURE_2D, texPQ );
			gl.uniform1i( uPQ, 7 );
		}
		const dial = ( name, val ) => {
			const loc = gl.getUniformLocation( prog, name );
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
	}

	function bindTex( prog, name, unit, tex ) {
		const loc = gl.getUniformLocation( prog, name );
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
		if ( maxCol ) {
			gl.deleteTexture( maxCol );
			gl.deleteTexture( maxOne );
			maxCol = null;
			maxOne = null;
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
		canvas.width = 1;
		canvas.height = 1;
	};

	S.hasRegion = () => S.rw > 0;

	/**
	 * Feed (or clear) the ground under the island. `src` must be a canvas
	 * of exactly the island canvas' size, in document orientation, holding
	 * the target layer's straight RGBA pixels. Null clears.
	 *
	 * @param {HTMLCanvasElement|null} src The ground slice, or null.
	 */
	S.setGround = ( src ) => {
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
		// Only the SEED pair flips: the merged side becomes current.
		SD = [ SD[ 1 ], SD[ 0 ] ];
	};

	function makeStampTex() {
		if ( texStamp ) {
			gl.deleteTexture( texStamp );
		}
		texStamp = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RG32F, S.rw, S.rh );
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
		targets( [ W[ 0 ], PK[ 0 ], PS[ 0 ] ] );
		gl.clear( gl.COLOR_BUFFER_BIT );
		targets( [ DK[ 0 ], DS[ 0 ], SD[ 0 ] ] );
		gl.clear( gl.COLOR_BUFFER_BIT );
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
		if ( nw * nh > MAX_CELLS || nw > maxTex || nh > maxTex ) {
			return false;
		}
		const shift = [ S.rx - ox0, S.ry - oy0 ];
		// A queued stamp batch was positioned against the OLD origin.
		if ( stampQueue ) {
			const nW = new Float32Array( nw * nh );
			const nA = new Float32Array( nw * nh );
			for ( let y = 0; y < S.rh; y++ ) {
				nW.set(
					stampQueue.accW.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
				nA.set(
					stampQueue.accA.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
			}
			stampQueue.accW = nW;
			stampQueue.accA = nA;
			stampQueue.x0 += shift[ 0 ];
			stampQueue.x1 += shift[ 0 ];
			stampQueue.y0 += shift[ 1 ];
			stampQueue.y1 += shift[ 1 ];
		}
		const old = allPairs().map( ( pair ) => pair.slice() );
		const oldSize = [ S.rw, S.rh ];
		const oldCur = cur;
		S.rx = ox0;
		S.ry = oy0;
		S.rw = nw;
		S.rh = nh;
		if ( maxCol ) {
			gl.deleteTexture( maxCol );
			gl.deleteTexture( maxOne );
			maxCol = null;
			maxOne = null;
		}
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
			targets( [ news[ i ][ 0 ] ] );
			bindQuad( progCopy );
			bindTex( progCopy, 'uT', 0, old[ i ][ oldCur ] );
			gl.uniform2i(
				gl.getUniformLocation( progCopy, 'uShift' ),
				shift[ 0 ],
				shift[ 1 ]
			);
			gl.uniform2i(
				gl.getUniformLocation( progCopy, 'uOldSize' ),
				oldSize[ 0 ],
				oldSize[ 1 ]
			);
			gl.drawArrays( gl.TRIANGLES, 0, 3 );
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
	 * the next water pass as one RG32F subrect.
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
				accW: new Float32Array( S.rw * S.rh ),
				accA: new Float32Array( S.rw * S.rh ),
				x0: S.rw,
				y0: S.rh,
				x1: -1,
				y1: -1,
				pig: [ p.kr, p.kg, p.kb, p.gran || 0 ],
				pigS: [ p.sr || 0, p.sg || 0, p.sb || 0 ],
				amt: [ 0.42 * p.water, 0.3 * p.pigment ],
			};
		}
		const q = stampQueue;
		const bytes =
			map.data instanceof Uint8ClampedArray ||
			map.data instanceof Uint8Array;
		const dx = map.gx - S.rx;
		const dy = map.gy - S.ry;
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
				q.accW[ i ] += 0.3 + 0.7 * Math.sqrt( a );
				q.accA[ i ] += a;
			}
		}
		q.x0 = Math.max( 0, Math.min( q.x0, dx ) );
		q.y0 = Math.max( 0, Math.min( q.y0, dy ) );
		q.x1 = Math.min( S.rw - 1, Math.max( q.x1, dx + map.w ) );
		q.y1 = Math.min( S.rh - 1, Math.max( q.y1, dy + map.h ) );
		S.wet = 1;
	};

	function runPass( prog, targetList, binds, extra ) {
		targets( targetList );
		bindQuad( prog );
		binds();
		if ( extra ) {
			extra( prog );
		}
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	}

	S.steps = ( n ) => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		for ( let k = 0; k < n; k++ ) {
			const a = cur;
			const b = 1 - cur;
			const q = k === 0 ? stampQueue : null;
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
					if ( q && q.x1 >= q.x0 ) {
						const qw = q.x1 - q.x0 + 1;
						const qh = q.y1 - q.y0 + 1;
						const sub = new Float32Array( qw * qh * 2 );
						for ( let y = 0; y < qh; y++ ) {
							for ( let x = 0; x < qw; x++ ) {
								const si = ( q.y0 + y ) * S.rw + q.x0 + x;
								sub[ ( y * qw + x ) * 2 ] = q.accW[ si ];
								sub[ ( y * qw + x ) * 2 + 1 ] = q.accA[ si ];
							}
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
							gl.RG,
							gl.FLOAT,
							sub
						);
						gl.uniform1i(
							gl.getUniformLocation( prog, 'uStamp' ),
							3
						);
						gl.uniform2i(
							gl.getUniformLocation( prog, 'uStampSize' ),
							S.rw,
							S.rh
						);
						gl.uniform4i(
							gl.getUniformLocation( prog, 'uStampRect' ),
							q.x0,
							q.y0,
							q.x1,
							q.y1
						);
						gl.uniform4f(
							gl.getUniformLocation( prog, 'uStampPig' ),
							...q.pig
						);
						gl.uniform3f(
							gl.getUniformLocation( prog, 'uStampPigS' ),
							...q.pigS
						);
						gl.uniform2f(
							gl.getUniformLocation( prog, 'uStampAmt' ),
							...q.amt
						);
					} else {
						gl.uniform2i(
							gl.getUniformLocation( prog, 'uStampSize' ),
							0,
							0
						);
					}
				}
			);
			if ( q ) {
				stampQueue = null;
			}
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
		}
	};

	/** Cheap wet check: two-stage max over the mask, 4-byte readback. */
	S.checkWet = () => {
		if ( ! S.rw || S.lost ) {
			S.wet = 0;
			return 0;
		}
		if ( ! maxCol ) {
			maxCol = texFloat( S.rw, 1 );
			maxOne = texFloat( 1, 1 );
		}
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, 1 );
		runPass( progMaxCol, [ maxCol ], () =>
			bindTex( progMaxCol, 'uT', 0, W[ cur ] )
		);
		gl.viewport( 0, 0, 1, 1 );
		runPass( progMaxRow, [ maxOne ], () =>
			bindTex( progMaxRow, 'uT', 0, maxCol )
		);
		const px = new Float32Array( 4 );
		gl.bindFramebuffer( gl.FRAMEBUFFER, fboRead );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			maxOne,
			0
		);
		gl.readPixels( 0, 0, 1, 1, gl.RGBA, gl.FLOAT, px );
		S.wet = px[ 0 ] > 0.5 ? 1 : 0;
		return S.wet;
	};

	/** Instant dry: everything settles, the water goes. */
	S.dryAll = () => {
		if ( ! S.rw || S.lost ) {
			return;
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
		gl.uniform2i( gl.getUniformLocation( progCopy, 'uShift' ), 0, 0 );
		gl.uniform2i(
			gl.getUniformLocation( progCopy, 'uOldSize' ),
			S.rw,
			S.rh
		);
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		cur = b;
		S.wet = 0;
	};

	/** Render the ink into the island's own canvas (premultiplied). */
	S.render = () => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, canvas.width, canvas.height );
		gl.disable( gl.BLEND );
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
		gl.uniform1i(
			gl.getUniformLocation( progInk, 'uHasGround' ),
			texGround ? 1 : 0
		);
		gl.uniform1f(
			gl.getUniformLocation( progInk, 'uKorn' ),
			S.params.korn
		);
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	};

	/* Test hooks: field readbacks, slow, for the harness probes only. */
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
