/**
 * The PASTE engine of the wet island family: oil, acrylic, gouache.
 *
 * One of three style-engine modules with the same external interface
 * (ensure/stamp/steps/render/checkWet/dryAll/reset/setParams/canvas):
 *
 *   wet-surface-gl.js  LIQUID - free water, flows, blooms (watercolour, ink)
 *   wet-paste-gl.js    PASTE  - covering paint with THICKNESS (this file)
 *   wet-dry-gl.js      DRY    - pure tooth deposit (charcoal)
 *
 * The first style round parameterized the liquid engine down and Thomas
 * called it immediately: "watercolour variations, not their own media."
 * Paste is genuinely different physics, so it is genuinely different code:
 *
 * - Paint is laid as COVERAGE, not poured as liquid volume. The liquid
 *   engine SUMS dab alpha, so overlapping segment joints became beads
 *   ("ghost circles" along fast strokes); here every stroke keeps a
 *   coverage memory and only the DELTA deposits - a stroke is one
 *   continuous body by construction, and repeating a stroke builds
 *   thickness (impasto) instead of pearls.
 * - Paint has a HEIGHT. The render pass lights the thickness field
 *   (normals from the gradient, one fixed light from the upper left,
 *   Lambert measured against a flat sheet plus a squared specular) - the
 *   recipe the CPU engine's applySurface already paid the lessons for:
 *   height must be SMOOTH (B-spline does that here), roughness needs two
 *   octaves or it reads as emboss, and lighting is weighted by coverage
 *   so it cannot draw a rim of its own.
 * - Paint stays OPEN, then locks. While open, overpainting MIXES via
 *   Kubelka-Munk (K and S amounts add - white into red is pink) and a
 *   gentle lateral blend softens brush marks; the open clock and the
 *   blend are the oil dials, acrylic locks fast, gouache in between.
 * - NO lateral water transport at all. Paste stays where the brush put it -
 *   and since 09.11.2026 that holds for open paint too: softening and the
 *   directional smear act under the brush of the current frame only (the
 *   TOUCH the stamps carry). They used to act on every open cell of the
 *   island at every step: a stroke 390 px away pushed an open field up
 *   against its own edge, and every oil stroke ate its own first 190 px.
 * - Fresh paint lies ON TOP. A stroke hides what it covers and stirs only
 *   part of it in (uCoverK, uMixK); it used to be stirred, entirely, into
 *   one body with everything ever laid in the cell, so white into wet blue
 *   stayed blue. And opacity follows the medium's hiding (uHideK), not a
 *   see-through film law shared by all three.
 * - The relief is the paint's own: bristle grooves run along the stroke at
 *   full resolution (each cell keeps the LANE across its last stroke), the
 *   cloth shows through thin paint only.
 * - SIX BANDS (params.bands, pigment-bands.js): body paint scatters alike
 *   in every band, so ONE number carries the scattering (K.a) and the
 *   three channels it used to fill carry three more bands of absorption.
 *   Blue stirred into yellow is a green, not an olive. Without the param
 *   everything runs in three channels as before (the extensions' drivers).
 * - A tool CARRIES paint (params.carryK, brush-carry.js): the film on the
 *   tool itself, a small texture of spots per mirrored copy of the brush,
 *   in brush coordinates. Under the tool every cell and the spot above it
 *   exchange paint - the film lays down on thinner cells, swaps colour
 *   with cells as thick, takes from thicker ones a share. That is all a
 *   smudger is. It used to live on the drift named above, and with the
 *   drift gone it moved nothing: out of a field into the bare sheet 0 px
 *   (drifting: 65 px for a fast hand, 431 px for a slow one, and the field
 *   bleached white where the stroke began). A driver switches it on by
 *   telling the island where the brush is (map.brush, see stamp).
 * - A step only runs where paint is still OPEN (closed paint never moves
 *   and never moves its neighbours), and the render redraws only what
 *   moved - the active-rect contract of wet-gl-active.js, the only import.
 */

import { weaveTile } from './canvas-weave';
import { BANDS_GLSL } from './pigment-bands';
import { CARRY } from './brush-carry';
import {
	addRect,
	createFrameFence,
	createTileProbe,
	growTo,
	rectGrow,
	rectShift,
	rectTriangles,
	tileAny,
	tileBox,
	tileCells,
	tileMark,
	tileMask,
	tileRects,
	tileShift,
	tileUnion,
	wetReplay,
} from './wet-gl-active';

const SC = 2; // cell size in document pixels (same grid family as liquid)
const MARGIN = 128;
const MAX_CELLS = 4194304;
// The relief render samples the B-spline half a cell either side of a
// position warped up to 3.2 px: a changed cell shows three cells away.
const RENDER_PAD = 4;

const TILE = 512;
// The film on the tool (brush-carry.js): FILM x FILM spots over the brush's
// own square, one such square per mirrored copy of the brush (the star
// symmetry draws twelve at the most), stacked in one texture.
const FILM = 64;
const COPIES = 12;

/* ------------------------- noise tiles (shared) ------------------------- */

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
 * Full-res tile: R = canvas/paper tooth, G/B = warp. Paste media sit on
 * CANVAS rather than cold-pressed paper: the weave is finer and more
 * regular than the watercolour tooth.
 */
function buildCanvasTile( pap ) {
	const out = new Uint8Array( TILE * TILE * 4 );
	// Paper dials (document setting); without one the calibrated canvas
	// weave runs untouched. An explicit PAPER (no gewebe) drops the weave
	// for plain tooth, laid papers add their rib.
	const f1 = pap ? Math.max( 1, Math.round( 44 * pap.freq ) ) : 44;
	const f2 = pap ? Math.max( 1, Math.round( 90 * pap.freq ) ) : 90;
	// The cloth: threads at a 4 px pitch (the first cut, 8 px sampled at
	// half res, read "zoomed in 500%" - Thomas), woven over and under,
	// every thread its own (canvas-weave.js). The two crossed sine waves
	// this replaces lit up as one family of diagonal stripes.
	const cloth = ! pap || pap.gewebe ? weaveTile( { pitch: 4 } ) : null;
	for ( let y = 0; y < TILE; y++ ) {
		for ( let x = 0; x < TILE; x++ ) {
			const i = y * TILE + x;
			const weave = cloth ? cloth[ i ] : 0.5;
			let pf;
			if ( ! pap ) {
				pf =
					0.7 * weave +
					0.2 * pnoise( x, y, TILE, 44, 71 ) +
					0.1 * pnoise( x, y, TILE, 90, 913 );
			} else {
				pf =
					( pap.gewebe ? 0.7 * weave : 0.55 * 0.5 ) +
					( pap.gewebe ? 0.2 : 0.3 ) * pnoise( x, y, TILE, f1, 71 ) +
					( pap.gewebe ? 0.1 : 0.15 ) * pnoise( x, y, TILE, f2, 913 );
				if ( ! pap.gewebe ) {
					pf += 0.25 * ( pnoise( x, y, TILE, f1, 431 ) - 0.5 );
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
			const wx =
				( pnoise( x, y, TILE, 23, 911 ) - 0.5 ) * 2.4 +
				( pnoise( x, y, TILE, 123, 555 ) - 0.5 ) * 0.7;
			const wy =
				( pnoise( x, y, TILE, 23, 137 ) - 0.5 ) * 2.4 +
				( pnoise( x, y, TILE, 123, 353 ) - 0.5 ) * 0.7;
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

const CHUNK = `
precision highp float;
precision highp int;
precision highp sampler2D;

uniform ivec2 uSize;
uniform ivec2 uOrigin;

// The paste dials, per wash:
uniform float uOpenK;   // how fast the paint locks (per step)
uniform float uBlendK;  // lateral softening while open (oil's smearing)
uniform float uPickK;   // how much of the LAYER's paint the brush lifts
// DIRECTIONAL smear: open paint is dragged along the stroke while the
// hand moves (uDir = current segment direction, zero between strokes).
uniform float uAdvK;
uniform float uAdvX;
uniform float uAdvY;
// Fresh paint lies on top: how well it hides what it covers (0 = the old
// rule, everything stirred into one body) and how much of OPEN paint
// underneath stirs in all the same. Closed paint stirs in by uPickK.
uniform float uCoverK;
uniform float uMixK;
// 1 = SIX BANDS: K.rgb carries the absorption of bands 1 to 3, S.rgb that
// of bands 4 to 6, and K.a the ONE scattering all six share. 0 = three
// channels of absorption, three of scattering, as ever.
uniform float uBands;
`;

/*
 * WHAT THE BRUSH CARRIES, shared by the simulation pass (a cell's side of
 * the exchange) and the film pass (the film's side). The rule and its
 * proof are brush-carry.js; the numbers come from there.
 */
const CARRY_GLSL = `
uniform sampler2D uFilmK; // per spot: K.rgb, in bands a = the scattering
uniform sampler2D uFilmS; // per spot: S.rgb, a = the thickness (-1: unused)
uniform int uCopies;      // copies of the brush that carry; 0 = none
// Per copy: where the head's middle stands in this step (xy, cells of the
// region) and the way it goes (zw, a unit vector) ...
uniform vec4 uBrush[ ${ COPIES } ];
// ... half its length along that way and half its width (xy, cells), the
// path of this step in such lengths (z), and half the side of the square
// its film is laid over (w, cells).
uniform vec4 uBrushExt[ ${ COPIES } ];
// 1 = this copy moves in this step.
uniform int uBrushOn[ ${ COPIES } ];
uniform float uCarryCap;  // what the tool holds (the smear dial)
// Where the brush is in this frame (the batch rect, for every step of the
// frame; 0 = the hand is not painting).
uniform sampler2D uStamp;
uniform int uTouchOn;
uniform ivec4 uTouchRect;

// The brush's coverage of a cell in this frame, 0 where it is not.
float touchAt( ivec2 p ) {
	if ( 0 == uTouchOn ||
		p.x < uTouchRect.x || p.y < uTouchRect.y ||
		p.x > uTouchRect.z || p.y > uTouchRect.w ) {
		return 0.0;
	}
	return min( 1.0, texelFetch( uStamp, p, 0 ).g );
}

// How much of the tool of copy c touches a cell in this step: the brush's
// coverage of the frame, where the head itself stands just now. The
// coverage alone will not do - it is the whole way of the frame, and a
// film in touch with all of that way changed its shape with every pointer
// event: ahead of the head at the start of a frame, behind it at the end.
// A fast stroke laid a crescent of paint per event, and reached four
// times as far as a slow one.
float contactAt( int c, ivec2 p ) {
	vec2 off = vec2( p ) + 0.5 - uBrush[ c ].xy;
	vec2 way = uBrush[ c ].zw;
	vec2 q = vec2( dot( off, way ), off.y * way.x - off.x * way.y ) /
		uBrushExt[ c ].xy;
	return dot( q, q ) > 1.0 ? 0.0 : touchAt( p );
}

// brush-carry.js share(): the share of a full exchange a contact reaches
// over a stretch of path - and never more than the film can give.
float carryShare( float tc, float ds ) {
	return min(
		${ CARRY.most.toFixed( 3 ) } * min( 1.0, uCarryCap ),
		1.0 - exp( -tc * ds / ${ CARRY.lay.toFixed( 3 ) } )
	);
}

// brush-carry.js exchange(): what a cell (ts, sk, ss) takes from the film
// above it (tb, bk, bs). The film loses the same, by its capacity.
void carryExchange(
	float f, float ts, vec4 sk, vec3 ss, float tb, vec4 bk, vec3 bs,
	out float dT, out vec4 dK, out vec3 dS
) {
	float swap = f * min( ts, tb );
	float down = tb > ts ? f * ( tb - ts ) : 0.0;
	float up = ts > tb ? ${ CARRY.give.toFixed( 3 ) } * f * ( ts - tb ) : 0.0;
	float ofFilm = tb > 0.0 ? ( swap + down ) / tb : 0.0;
	float ofCell = ts > 0.0 ? ( swap + up ) / ts : 0.0;
	dT = ofFilm * tb - ofCell * ts;
	dK = ofFilm * bk - ofCell * sk;
	dS = ofFilm * bs - ofCell * ss;
}
`;

/*
 * The film pass: every spot of the tool's film against the paint it
 * stands on in this step. A spot that touches paint for the first time
 * takes on what it stands on - so the stroke begins with the film charged
 * with exactly what is there, and an even field stays as it is from the
 * first pixel - and from then on it is its own little reservoir. A spot
 * without contact keeps what it holds. One row of FILM spots per copy.
 */
const FRAG_FILM = `#version 300 es
__CHUNK__
__CARRY__

uniform sampler2D uC;
uniform sampler2D uK;
uniform sampler2D uS;

layout( location = 0 ) out vec4 oFK;
layout( location = 1 ) out vec4 oFS;

void main() {
	ivec2 fx = ivec2( gl_FragCoord.xy );
	int c = fx.y / ${ FILM };
	vec4 fk = texelFetch( uFilmK, fx, 0 );
	vec4 fs = texelFetch( uFilmS, fx, 0 );
	oFK = fk;
	oFS = fs;
	if ( c >= uCopies || 1 != uBrushOn[ c ] ) {
		return;
	}
	vec4 ext = uBrushExt[ c ];
	vec2 off = ( ( vec2( fx.x, fx.y - c * ${ FILM } ) + 0.5 ) /
		float( ${ FILM } ) - 0.5 ) * 2.0 * ext.w;
	// The cells around the point this spot stands on (a cell's middle is
	// at its index plus a half), those the head touches.
	vec2 g = uBrush[ c ].xy + off - 0.5;
	ivec2 i0 = ivec2( floor( g ) );
	vec2 fr = g - vec2( i0 );
	float W = 0.0;
	float tc = 0.0;
	float ts = 0.0;
	vec4 sk = vec4( 0.0 );
	vec3 ss = vec3( 0.0 );
	for ( int j = 0; j < 2; j++ ) {
		for ( int i = 0; i < 2; i++ ) {
			ivec2 p = i0 + ivec2( i, j );
			float w = ( 0 == i ? 1.0 - fr.x : fr.x ) *
				( 0 == j ? 1.0 - fr.y : fr.y );
			float t = contactAt( c, p );
			if ( t <= 0.0 || w <= 0.0 ) {
				continue;
			}
			W += w;
			tc += w * t;
			ts += w * texelFetch( uC, p, 0 ).r;
			sk += w * texelFetch( uK, p, 0 );
			ss += w * texelFetch( uS, p, 0 ).rgb;
		}
	}
	if ( W <= 0.0 ) {
		return;
	}
	ts /= W;
	sk /= W;
	ss /= W;
	if ( fs.a < 0.0 ) {
		// First contact: the spot takes on what it stands on.
		oFK = sk;
		oFS = vec4( ss, max( 0.0, ts ) );
		return;
	}
	float dT;
	vec4 dK;
	vec3 dS;
	carryExchange(
		carryShare( tc, ext.z ), ts, sk, ss, fs.a, fk, fs.rgb, dT, dK, dS
	);
	float inv = 1.0 / max( uCarryCap, 1e-3 );
	oFK = max( vec4( 0.0 ), fk - dK * inv );
	oFS = vec4(
		max( vec3( 0.0 ), fs.rgb - dS * inv ),
		max( 0.0, fs.a - dT * inv )
	);
}
`;

/*
 * The single simulation pass: fold the frame's stamp deltas in (thickness
 * grows, pigment amounts add = KM mixing), decay the open clock, and while
 * open blend gently sideways so brush marks soften the way wet paint does.
 * MRT: C (thickness, open), K, S.
 */
const FRAG_PASTE = `#version 300 es
__CHUNK__
__BANDS__
__CARRY__

uniform sampler2D uC;  // r = thickness, g = open, b = lane, a = lane angle
uniform sampler2D uK;  // K.rgb (in bands: a = the one scattering)
uniform sampler2D uS;  // S.rgb (in bands: absorption of bands 4 to 6)
// The LAYER's paint under the island, seeded per cell (rgb = absorbing K
// of what the pixel shows, a = 1 + remaining fraction; a < 1 = virgin).
uniform sampler2D uSD;
// This frame's dabs (uStamp): r = coverage delta, g = TOUCH (the brush's
// own coverage, whether or not it added any), b = the lane across the
// stroke at the cell's centre (document px), a = 1 + stroke angle / 2 pi
// (0 = no direction known).
uniform ivec2 uStampSize; // 0,0 = none
// The stamp texture is only overwritten inside this frame's batch rect;
// outside it the texture still holds EARLIER batches, so the stamp may
// only be applied inside the rect (x0, y0, x1, y1 inclusive).
uniform ivec4 uStampRect;
uniform vec4 uStampPig;   // K.rgb, thickness rate
uniform vec4 uStampPigS;  // S.rgb, pigment rate
uniform float uStampSc;   // in bands: the pigment's one scattering
// Softening, smear and the film on the tool act under the brush of this
// frame and nowhere else (uTouchOn, uTouchRect, touchAt: the carry chunk).

layout( location = 0 ) out vec4 oC;
layout( location = 1 ) out vec4 oK;
layout( location = 2 ) out vec4 oS;
layout( location = 3 ) out vec4 oSD;

// A cell's view of the film of copy c at uv of its square: between the
// spots around it, of those in use (an unused spot holds -1 for its
// thickness and counts for nothing - at the rim of the tool a cell must
// not see the film thinned by spots that never touched anything).
bool filmAt( int c, vec2 uv, out vec4 bk, out vec3 bs, out float tb ) {
	vec2 t = clamp(
		uv * float( ${ FILM } ) - 0.5,
		vec2( 0.0 ),
		vec2( float( ${ FILM } ) - 1.0 )
	);
	ivec2 i0 = ivec2( floor( t ) );
	vec2 fr = t - vec2( i0 );
	float W = 0.0;
	bk = vec4( 0.0 );
	vec4 s4 = vec4( 0.0 );
	for ( int j = 0; j < 2; j++ ) {
		for ( int i = 0; i < 2; i++ ) {
			ivec2 p = min( i0 + ivec2( i, j ), ivec2( ${ FILM } - 1 ) );
			p.y += c * ${ FILM };
			float w = ( 0 == i ? 1.0 - fr.x : fr.x ) *
				( 0 == j ? 1.0 - fr.y : fr.y );
			vec4 fs = texelFetch( uFilmS, p, 0 );
			if ( fs.a < 0.0 || w <= 0.0 ) {
				continue;
			}
			W += w;
			s4 += w * fs;
			bk += w * texelFetch( uFilmK, p, 0 );
		}
	}
	if ( W <= 0.0 ) {
		bs = vec3( 0.0 );
		tb = 0.0;
		return false;
	}
	bk /= W;
	bs = s4.rgb / W;
	tb = s4.a / W;
	return true;
}

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 C = texelFetch( uC, xy, 0 );
	vec4 K = texelFetch( uK, xy, 0 );
	vec3 S = texelFetch( uS, xy, 0 ).rgb;
	vec4 sd = texelFetch( uSD, xy, 0 );
	float T = C.r;
	float open = C.g;
	vec2 lane = C.ba;

	if ( uStampSize.x > 0 &&
		xy.x >= uStampRect.x && xy.y >= uStampRect.y &&
		xy.x <= uStampRect.z && xy.y <= uStampRect.w ) {
		vec4 st = texelFetch( uStamp, xy, 0 );
		float d = st.r;
		// The last stroke over a cell owns its grooves.
		if ( st.g > 0.0 && st.a >= 1.0 ) {
			lane = st.ba;
		}
		if ( d > 0.0 ) {
			// FRESH PAINT LIES ON TOP. It hides what it covers by its own
			// thickness and stirs in only a part: of open paint what the
			// medium blends (uMixK), of closed paint what the brush lifts
			// (uPickK). Without a cover value (an extension's own driver)
			// keep is exactly one and the amounts simply add, as before.
			float q = d * uStampPig.a;
			float cover = 1.0 - exp( -uCoverK * q );
			float stir = mix( uPickK, uMixK, clamp( open, 0.0, 1.0 ) );
			float keep = 1.0 - cover * ( 1.0 - stir );
			T += q;
			K = K * keep +
				vec4( uStampPig.rgb, uStampSc ) * ( d * uStampPigS.a );
			S = S * keep + uStampPigS.rgb * ( d * uStampPigS.a );
			// PICKUP: where the brush passes it reopens and lifts the
			// LAYER's own paint into the fresh body - oil smears what
			// lies there, gouache redissolves, acrylic stays locked
			// (uPickK per style). The seed stores the pixel's absorbing
			// K; exp(-K) recovers its colour, the opaque KM inversion
			// turns that into body paint.
			if ( sd.a >= 1.0 && uPickK > 0.0 ) {
				float rest = sd.a - 1.0;
				float df = min( rest, uPickK * min( 1.0, d ) );
				if ( df > 0.001 ) {
					vec3 c = clamp( exp( -sd.rgb ), 0.03, 0.97 );
					T += df * 0.45;
					if ( uBands > 0.5 ) {
						// The layer's paint comes up in bands, with the one
						// scattering of body paint.
						vec3 lo;
						vec3 hi;
						bandsOf( c, lo, hi );
						K.rgb += min( vec3( 40.0 ),
							( 1.0 - lo ) * ( 1.0 - lo ) / ( 2.0 * lo ) ) *
							( 1.6 * df * 0.9 );
						S += min( vec3( 40.0 ),
							( 1.0 - hi ) * ( 1.0 - hi ) / ( 2.0 * hi ) ) *
							( 1.6 * df * 0.9 );
						K.a += 1.6 * df * 0.9;
					} else {
						vec3 kk = ( 1.0 - c ) * ( 1.0 - c ) / ( 2.0 * c ) * 1.6;
						K.rgb += kk * ( df * 0.9 );
						S += vec3( 1.6 ) * ( df * 0.9 );
					}
					sd.a = 1.0 + ( rest - df );
				}
			}
			open = 1.0; // fresh paint opens the spot again
		}
	}

	// WHAT THE BRUSH CARRIES: under a tool that moves, a cell and the spot
	// of the tool's film above it exchange paint (brush-carry.js). The
	// film pass does the same sum from the film's side, from the same
	// state - what the cell gains here, the spot loses there.
	float tc = touchAt( xy );
	if ( tc > 0.0 && uCopies > 0 ) {
		for ( int c = 0; c < ${ COPIES }; c++ ) {
			if ( c >= uCopies ) {
				break;
			}
			if ( 1 != uBrushOn[ c ] ) {
				continue;
			}
			float tcc = contactAt( c, xy );
			if ( tcc <= 0.0 ) {
				continue;
			}
			vec4 ext = uBrushExt[ c ];
			vec2 off = vec2( xy ) + 0.5 - uBrush[ c ].xy;
			vec4 bk;
			vec3 bs;
			float tb;
			if ( filmAt( c, off / ( 2.0 * ext.w ) + 0.5, bk, bs, tb ) ) {
				float dT;
				vec4 dK;
				vec3 dS;
				carryExchange(
					carryShare( tcc, ext.z ), T, K, S, tb, bk, bs, dT, dK, dS
				);
				T = max( 0.0, T + dT );
				K = max( vec4( 0.0 ), K + dK );
				S = max( vec3( 0.0 ), S + dS );
				// Paint the tool works stays workable.
				if ( T > 0.003 ) {
					open = 1.0;
				}
			}
			break;
		}
	}

	// UNDER THE BRUSH open paint blends into open neighbours: brush marks
	// soften, colours pull into each other (the oil joy). Conservative
	// gather with per-pair symmetric factors, capped well below mass loss.
	// Only where the brush is: paint the hand does not touch stays as it
	// was laid. Left to every open cell at every step, a gouache stroke
	// blurred by several pixels in its own open time and oil lost every
	// bristle mark.
	if ( open > 0.02 && uBlendK > 0.0 && 1 == uTouchOn ) {
		float wsum = 0.0;
		float Tn = 0.0;
		vec4 Kn = vec4( 0.0 );
		vec3 Sn = vec3( 0.0 );
		for ( int d = 0; d < 4; d++ ) {
			ivec2 n = xy +
				( d == 0
					? ivec2( 1, 0 )
					: d == 1
					? ivec2( -1, 0 )
					: d == 2
					? ivec2( 0, 1 )
					: ivec2( 0, -1 ) );
			if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
				continue;
			}
			vec4 Cn = texelFetch( uC, n, 0 );
			// Both sides must be open, and the exchange weight is the
			// SHARED openness times the pair's touch - identical from both
			// sides, so the gather conserves mass (the pair-cap lesson
			// from the liquid engine).
			float w = min( open, Cn.g );
			float tp = max( tc, touchAt( n ) );
			if ( w <= 0.02 || tp <= 0.0 ) {
				continue;
			}
			w *= uBlendK * 0.06 * tp;
			wsum += w;
			Tn += w * Cn.r;
			Kn += w * texelFetch( uK, n, 0 );
			Sn += w * texelFetch( uS, n, 0 ).rgb;
		}
		if ( wsum > 0.0 ) {
			T = T * ( 1.0 - wsum ) + Tn;
			K = K * ( 1.0 - wsum ) + Kn;
			S = S * ( 1.0 - wsum ) + Sn;
		}
	}

	// DIRECTIONAL smear: open paint under the brush is dragged along the
	// stroke. A conservative PAIR scheme (gather form): what this cell
	// hands its downstream neighbour is exactly what that neighbour
	// computes as its inflow - identical factors on both sides, the
	// liquid engine's pair-cap lesson; the factor is the touch of the
	// cell the paint LEAVES (the brush pushes what it stands on). uAdvK
	// is capped at 0.15 in JS so the total outflow (max 2*(|dx|+|dy|)*
	// uAdvK = 0.42) can never need clamping; a clamp that engages would
	// CREATE mass.
	// The PIGMENT is dragged, the thickness stays where it was laid: a
	// brush that stands still for a frame and jumps on the next pushed the
	// paint's body up against the front of its footprint every frame - a
	// rib across the stroke per pointer event, a corn cob.
	if ( open > 0.02 && uAdvK > 0.0 && 1 == uTouchOn ) {
		float out2 = 0.0;
		float in2 = 0.0;
		vec4 Kn2 = vec4( 0.0 );
		vec3 Sn2 = vec3( 0.0 );
		for ( int d = 0; d < 4; d++ ) {
			ivec2 o =
				d == 0
					? ivec2( 1, 0 )
					: d == 1
					? ivec2( -1, 0 )
					: d == 2
					? ivec2( 0, 1 )
					: ivec2( 0, -1 );
			ivec2 n = xy + o;
			if ( n.x < 0 || n.y < 0 || n.x >= uSize.x || n.y >= uSize.y ) {
				continue;
			}
			float g = float( o.x ) * uAdvX + float( o.y ) * uAdvY;
			if ( 0.0 == g ) {
				continue;
			}
			vec4 Cn = texelFetch( uC, n, 0 );
			float w = min( open, Cn.g );
			if ( w <= 0.02 ) {
				continue;
			}
			float f = uAdvK * w;
			if ( g > 0.0 ) {
				out2 += f * tc * g;
			} else {
				float fg = f * touchAt( n ) * -g;
				in2 += fg;
				Kn2 += fg * texelFetch( uK, n, 0 );
				Sn2 += fg * texelFetch( uS, n, 0 ).rgb;
			}
		}
		if ( out2 > 0.0 || in2 > 0.0 ) {
			K = K * ( 1.0 - out2 ) + Kn2;
			S = S * ( 1.0 - out2 ) + Sn2;
		}
	}

	// The open clock. Paint without substance closes immediately.
	open = T > 0.003 ? max( 0.0, open - uOpenK ) : 0.0;
	oC = vec4( T, open, lane );
	oK = uBands > 0.5 ? K : vec4( K.rgb, 0.0 );
	oS = vec4( S, 0.0 );
	oSD = sd;
}
`;

/*
 * Seed merge: fold freshly computed ground paint into VIRGIN cells only,
 * so a re-feed after a region grow never resurrects lifted paint.
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
 * The paste render: colour is Kubelka-Munk at full body (a thick layer
 * shows R_inf; thin strokes let the ground through via coverage alpha),
 * then the RELIEF, lit from the upper left. Y-flipped like every island
 * render (WebGL origin is bottom-left).
 *
 * The relief has three parts, each at its own scale:
 * - the thickness itself, gently (a stroke is a low mound, not a bevel);
 * - BRISTLE GROOVES along the stroke, at document resolution: every cell
 *   keeps the lane across its last stroke and that stroke's angle, so the
 *   lane of any pixel is the cell's value carried on along the stroke's
 *   normal - grooves a pixel or two wide, finer than the grid;
 * - the CLOTH, through thin paint only. It used to be multiplied INTO the
 *   thickness: the more paint, the stronger the weave.
 */
const FRAG_RENDER = `#version 300 es
__CHUNK__
__BANDS__

uniform sampler2D uC;
uniform sampler2D uK;
uniform sampler2D uS;
uniform sampler2D uPF;   // canvas tooth + warp
// The GROUND (target layer's straight RGBA at canvas resolution) and the
// seed field: where the brush lifted the layer's paint, the ground fades
// by the remaining fraction. 0 = the old floating-film path.
uniform sampler2D uGround;
uniform int uHasGround;
uniform sampler2D uSDt;
uniform float uBody;     // how tall the paint stands (style)
uniform float uGloss;    // specular strength (oil > acrylic > gouache)
uniform float uKorn;     // tooth visibility in the colour
uniform float uHideK;    // how steeply a film of this medium turns opaque

out vec4 oC;

vec3 wgt( float f ) {
	float a = 0.5 * ( 1.0 - f ) * ( 1.0 - f );
	float c = 0.5 * f * f;
	return vec3( a, 1.0 - a - c, c );
}

// B-spline sampled fields at a grid position.
void fields( vec2 u, out float T, out float open, out vec4 K, out vec3 S ) {
	u = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
	ivec2 ic = ivec2( floor( u + 0.5 ) );
	vec2 fr = u + 0.5 - vec2( ic );
	vec3 wx = wgt( fr.x );
	vec3 wy = wgt( fr.y );
	T = 0.0;
	open = 0.0;
	K = vec4( 0.0 );
	S = vec3( 0.0 );
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			float k = wx[ i + 1 ] * wy[ j + 1 ];
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			vec4 C = texelFetch( uC, c, 0 );
			T += k * C.r;
			open += k * C.g;
			K += k * texelFetch( uK, c, 0 );
			S += k * texelFetch( uS, c, 0 ).rgb;
		}
	}
}

float laneHash( int n ) {
	uint h = uint( n ) * 2654435761u;
	h = ( h ^ ( h >> 15u ) ) * 2246822519u;
	h = ( h ^ ( h >> 13u ) ) * 3266489917u;
	return float( h ^ ( h >> 16u ) ) / 4294967296.0;
}

// One octave of grooves: a value per lane, eased into its neighbours.
float laneNoise( float l ) {
	float i = floor( l );
	float f = l - i;
	f = f * f * ( 3.0 - 2.0 * f );
	return mix( laneHash( int( i ) ), laneHash( int( i ) + 1 ), f );
}

// What the brush left across its stroke: bristles a few pixels apart,
// clumped. Material grain, so it never scales with the brush. -0.5..0.5.
float groove( float lane ) {
	return 0.62 * laneNoise( lane / 3.1 ) +
		0.38 * laneNoise( lane / 8.3 + 41.0 ) - 0.5;
}

// The B-spline thickness at a grid position (x), and the bristle grooves
// there (y, -0.5..0.5). The relief needs nothing else, and four samples a
// pixel must not each read the pigment fields as well, whatever a driver's
// compiler leaves out on its own. Every cell carries the lane of the
// stroke that last passed it; carried on to the sample along that stroke's
// normal it is linear across the stroke, so the cells of one stroke agree
// and its grooves run on unbroken, at pixel resolution. Where two strokes
// meet, the four cells around the sample blend - taken from the nearest
// cell alone, the seam between two strokes was a stepped crack.
vec2 paintAt( vec2 u ) {
	u = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
	ivec2 ic = ivec2( floor( u + 0.5 ) );
	vec2 fr = u + 0.5 - vec2( ic );
	vec3 wx = wgt( fr.x );
	vec3 wy = wgt( fr.y );
	float T = 0.0;
	float G = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			float k = wx[ i + 1 ] * wy[ j + 1 ];
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			vec4 C = texelFetch( uC, c, 0 );
			T += k * C.r;
			// Offset of the sample from this cell's centre, in cells.
			vec2 off = u - vec2( c );
			float wb = max( 0.0, 1.0 - abs( off.x ) ) *
				max( 0.0, 1.0 - abs( off.y ) );
			if ( wb > 0.0 && C.a >= 1.0 ) {
				float ang = ( C.a - 1.0 ) * 6.2831853;
				vec2 nrm = vec2( -sin( ang ), cos( ang ) );
				G += wb * groove( C.b + dot( off, nrm ) * float( ${ SC } ) );
			}
		}
	}
	return vec2( T, G );
}

float heightAt( vec2 u, ivec2 absPx ) {
	vec2 p = paintAt( u );
	float T = p.x;
	// The mound of the stroke itself, kept low: at full height its rim
	// lit up like a bevel around every stroke.
	float h = 0.45 * T;
	// The cloth under thin paint; thick paint buries it.
	float cloth = texelFetch(
		uPF,
		ivec2( absPx.x & ${ TILE - 1 }, absPx.y & ${ TILE - 1 } ),
		0
	).r;
	h += ( cloth - 0.5 ) * 0.11 * exp( -3.2 * T ) * min( 1.0, T * 14.0 );
	// The bristle grooves: the paint's own surface, deeper where it
	// stands thicker.
	h += p.y * ( 0.1 + 0.28 * uBody ) * min( T, 1.0 );
	return h;
}

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

	float T;
	float open;
	vec4 K;
	vec3 S;
	fields( u, T, open, K, S );
	// Remaining fraction of the LAYER's paint under this pixel (B-spline
	// over the seed field). Where the brush lifted it, the ground fades -
	// and such a pixel must render even if no paste is left on it.
	float fRest = 1.0;
	if ( 1 == uHasGround ) {
		vec2 uu = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
		ivec2 ic2 = ivec2( floor( uu + 0.5 ) );
		vec2 fr2 = uu + 0.5 - vec2( ic2 );
		vec3 wx2 = wgt( fr2.x );
		vec3 wy2 = wgt( fr2.y );
		fRest = 0.0;
		for ( int j = -1; j <= 1; j++ ) {
			for ( int i = -1; i <= 1; i++ ) {
				ivec2 c2 = clamp( ic2 + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
				float sda = texelFetch( uSDt, c2, 0 ).a;
				fRest += wx2[ i + 1 ] * wy2[ j + 1 ] *
					( sda >= 1.0 ? clamp( sda - 1.0, 0.0, 1.0 ) : 1.0 );
			}
		}
	}
	bool faded = fRest < 0.999;
	if ( T <= 0.004 && ! faded ) {
		oC = vec4( 0.0 );
		return;
	}

	// Colour: KM body colour of the mixed paint; the tooth shows in thin
	// passages (dry-brush over the weave), fades under thick paint.
	vec3 Rinf;
	if ( uBands > 0.5 ) {
		// Six absorptions over the one scattering: the body colour band by
		// band, seen as a colour.
		float sc = K.a + 1e-3;
		vec3 rl = K.rgb / sc;
		vec3 rh = S / sc;
		Rinf = bandsToRgb(
			1.0 + rl - sqrt( rl * rl + 2.0 * rl ),
			1.0 + rh - sqrt( rh * rh + 2.0 * rh )
		);
	} else {
		vec3 r = K.rgb / ( S + 1e-3 );
		Rinf = 1.0 + r - sqrt( r * r + 2.0 * r );
	}
	float toothFade = exp( -2.0 * T );
	float mod2 = 1.0 + ( 0.5 - g ) * uKorn * 1.2 * toothFade;
	vec3 col = clamp( Rinf * mod2, 0.0, 1.0 );

	// Coverage: thin paint is a scraped film, thick paint covers fully -
	// and the tooth gates the THIN end, which is what makes a dry-brushed
	// paste stroke break over the weave instead of ending in a ramp.
	float aBase = 1.0 - exp( -uHideK * T );
	float gate = clamp( ( T * ( 0.45 + 1.1 * g ) ) / 0.06, 0.0, 1.0 );
	gate = gate * gate * ( 3.0 - 2.0 * gate );
	float a = clamp( aBase * gate, 0.0, 1.0 );
	if ( a <= 0.003 && ! faded ) {
		oC = vec4( 0.0 );
		return;
	}

	// RELIEF. Height from the thickness field, normals from its gradient,
	// one fixed light from the upper left; Lambert measured against a
	// FLAT sheet so level paint keeps exactly its pigment colour, plus a
	// squared-up specular. Wet (open) paint glosses harder.
	float hX1 = heightAt( u + vec2( 0.5, 0.0 ), absPx + ivec2( 1, 0 ) );
	float hX0 = heightAt( u - vec2( 0.5, 0.0 ), absPx - ivec2( 1, 0 ) );
	float hY1 = heightAt( u + vec2( 0.0, 0.5 ), absPx + ivec2( 0, 1 ) );
	float hY0 = heightAt( u - vec2( 0.0, 0.5 ), absPx - ivec2( 0, 1 ) );
	float relief = 5.5 * ( 0.35 + uBody );
	vec3 nrm = normalize(
		vec3( -( hX1 - hX0 ) * relief, -( hY1 - hY0 ) * relief, 1.0 )
	);
	// A little off the diagonal: light from exactly 45 degrees turns any
	// surface that is alike along x and y into diagonal stripes.
	vec3 L = vec3( -0.53, -0.35, 0.772 );
	vec3 H = normalize( L + vec3( 0.0, 0.0, 1.0 ) );
	float k = min( 1.0, a * 2.2 );
	float lit = 1.0 + ( dot( nrm, L ) - L.z ) * 1.15 * uBody * k;
	col = clamp( col * lit, 0.0, 1.0 );
	float gloss = uGloss * ( 1.0 + 0.5 * min( 1.0, open ) );
	float nh = max( 0.0, dot( nrm, H ) );
	float nh2 = nh * nh;
	float nh4 = nh2 * nh2;
	float nh8 = nh4 * nh4;
	float spec = nh8 * nh8 * nh8 * gloss * k * 0.85;
	col = col + ( 1.0 - col ) * spec;

	vec4 film = vec4( col * a, a ); // premultiplied
	if ( 1 == uHasGround ) {
		vec4 gpx = texelFetch( uGround, px, 0 );
		if ( gpx.a > 0.001 ) {
			// Body paint OVER the layer pixel; where the brush lifted the
			// layer's paint, the ground pales by the remaining fraction
			// (transmittance to the power of the rest - scraped towards
			// the white of the canvas). Opaque output where the ground
			// is, so overlay and bake REPLACE instead of tinting twice.
			vec3 Rg = gpx.rgb;
			if ( faded ) {
				// Floored at 2 %, not 1e-4: a near-black ground is 8-bit
				// noise in its straight colour (1/255 red, 0 green), and
				// the power turned that into a 3:1 colour cast - charcoal
				// went wine-red under the smudger. No real pigment layer
				// transmits less than that anyway.
				Rg = pow( max( Rg, vec3( 0.02 ) ), vec3( fRest ) );
			}
			vec3 comp = col * a + Rg * ( 1.0 - a );
			oC = gpx.a * vec4( comp, 1.0 ) + ( 1.0 - gpx.a ) * film;
			return;
		}
	}
	oC = film;
}
`;

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

const FRAG_LOCK = `#version 300 es
__CHUNK__
uniform sampler2D uC;
layout( location = 0 ) out vec4 oC;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 C = texelFetch( uC, xy, 0 );
	oC = vec4( C.r, 0.0, C.b, C.a );
}
`;

/* ------------------------------- the engine ------------------------------ */

export const WET_PASTE_SC = SC;

export function createWetPasteGL() {
	const canvas = document.createElement( 'canvas' );
	canvas.width = 1;
	canvas.height = 1;
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
			throw new Error( 'wet-paste shader: ' + gl.getShaderInfoLog( sh ) );
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
				// The band tables only where they are read (see the
				// liquid island).
				fragSrc
					.replace( '__CHUNK__', CHUNK )
					.replace( '__BANDS__', BANDS_GLSL )
					.replace( '__CARRY__', CARRY_GLSL )
			)
		);
		gl.bindAttribLocation( p, 0, 'aPos' );
		gl.linkProgram( p );
		if ( ! gl.getProgramParameter( p, gl.LINK_STATUS ) ) {
			throw new Error( 'wet-paste link: ' + gl.getProgramInfoLog( p ) );
		}
		return p;
	}
	const progPaste = program( FRAG_PASTE );
	const progSeedMerge = program( FRAG_SEEDMERGE );
	const progSeedGround = program( FRAG_SEEDGROUND );
	const progRender = program( FRAG_RENDER );
	const progCopy = program( FRAG_COPY );
	const progLock = program( FRAG_LOCK );
	const progFilm = program( FRAG_FILM );

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
		buildCanvasTile( null )
	);
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );

	let texStamp = null;
	// The film on the tool (brush-carry.js): a ping-pong pair like the
	// fields, but the size of a brush and not of the region - it lives in
	// brush coordinates and outlasts every grow of the region.
	const filmK = [
		texFloat( FILM, FILM * COPIES ),
		texFloat( FILM, FILM * COPIES ),
	];
	const filmS = [
		texFloat( FILM, FILM * COPIES ),
		texFloat( FILM, FILM * COPIES ),
	];
	let fcur = 0;
	// Per copy of the brush that carries: where its film last exchanged
	// (at) and where the brush stands now (to), in absolute cells; half
	// the side of its film's square (r), half the head's length along its
	// way (h) and half its width (w), in cells; the way it last went (ux,
	// uy); and whether it moved since the last plan (live).
	let carry = [];
	const brushData = new Float32Array( COPIES * 4 );
	const brushExt = new Float32Array( COPIES * 4 );
	const brushOn = new Int32Array( COPIES );
	let brushCount = 0;
	// The GROUND (target layer's pixels, RGBA8 at canvas resolution) and
	// the SEED pair (the layer's paint as liftable body colour). Dropped
	// on grow/reset; the controller re-feeds on geometry change.
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

	// ACTIVE TILES (wet-gl-active.js): `act` holds every tile with open
	// paint - paste has no reach, a step only ever changes open paint.
	let act = null;
	let dirty = []; // cell rects
	let dirtyFrom = null; // the run rects last added to `dirty`
	// The rects of the open tiles, worked out once per `act`.
	let runFor = null;
	let runCache = [];
	// Where stamps folded in since the last render (cell rects), and the
	// step the first of them did (see render).
	let near = [];
	let nearStep = 0;
	let renderAll = true;
	let stepNo = 0;
	let stampSerial = 0;
	let since = null; // stamp tiles folded since the probe in flight
	let ready = null;
	let seen = null;
	let lastLag = 0;
	const probe = createTileProbe( gl, 'v.g > 0.0', 'v.g' );
	const fence = createFrameFence( gl );
	const whole = () => ( { x0: 0, y0: 0, x1: S.rw - 1, y1: S.rh - 1 } );
	const allTiles = () => tileMark( tileMask( S.rw, S.rh ), whole() );
	// What bindQuad binds and a pass draws (see the liquid engine).
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
	// Only these dials reach the render; the rest steer open paint alone.
	const LOOK = [ 'body', 'gloss', 'korn', 'hideK', 'bands' ];

	const S = {
		canvas,
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0,
		lost: false,
		// Canvas pixels redrawn since the controller last presented them.
		drawn: null,
		// Tests only: false runs every step and every render over the
		// whole region - the reference the scissored island must match.
		scissor: true,
		// No time-lapse after release: the open clock IS the medium.
		raffer: false,
		// No step budget either (the controller's paceFrame). A paste step
		// is one cheap pass - what costs here is the relief render, which
		// is throttled on its own - and cutting steps would only stretch
		// the open time on a slow machine: oil learnt from a struggling
		// watercolour stayed wet five times as long (measured in the lab).
		paced: false,
		params: {
			openK: 0.003,
			blendK: 1,
			body: 0.6,
			gloss: 0.5,
			korn: 0.3,
			pickK: 0,
			advK: 0,
			advX: 0,
			advY: 0,
			// Fresh paint on top (see the simulation pass). The defaults
			// are the island before 09.11.2026 - everything stirred into
			// one body, the see-through film law - so a driver that does
			// not know the three dials paints what it always painted.
			coverK: 0,
			mixK: 0,
			hideK: 3,
			// What the tool holds (brush-carry.js); 0 = it carries nothing.
			carryK: 0,
		},
	};
	S.setParams = ( p ) => {
		if (
			LOOK.some(
				( k ) => undefined !== p[ k ] && p[ k ] !== S.params[ k ]
			)
		) {
			renderAll = true;
		}
		S.params = { ...S.params, ...p };
	};

	/** Swap the ground sheet (document paper); null = calibrated canvas. */
	S.setPaper = ( pap ) => {
		if ( S.lost ) {
			return;
		}
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
			buildCanvasTile( pap )
		);
		renderAll = true;
	};
	canvas.addEventListener( 'webglcontextlost', () => {
		S.lost = true;
	} );

	let C = [ null, null ];
	let K = [ null, null ];
	let Sx = [ null, null ];
	let SD = [ null, null ];
	let cur = 0;
	// Coverage memory of the CURRENT stroke (delta stamping) plus the
	// frame's delta batch; its accumulator lives as long as the region.
	let strokeCov = null;
	let stampQueue = null; // { x0, y0, x1, y1, pig, pigS }
	let acc = null;
	// ... and beside the delta what the brush TOUCHED in this frame
	// (softening and smear act there), and each touched cell's lane across
	// its stroke with the stroke's angle (the bristle grooves).
	let accTouch = null;
	let accLane = null;
	let accAng = null;
	let upload = new Float32Array( 0 );

	const allPairs = () => [ C, K, Sx, SD ];

	function bindQuad( prog ) {
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, geomBuf );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		const set2i = ( name, a, b ) => {
			const loc = uloc( prog, name );
			if ( loc ) {
				gl.uniform2i( loc, a, b );
			}
		};
		set2i( 'uSize', S.rw, S.rh );
		set2i( 'uOrigin', S.rx, S.ry );
		const dial = ( name, val ) => {
			const loc = uloc( prog, name );
			if ( loc ) {
				gl.uniform1f( loc, val );
			}
		};
		dial( 'uOpenK', S.params.openK );
		dial( 'uBlendK', S.params.blendK );
		dial( 'uPickK', S.params.pickK ?? 0 );
		// A tool that carries does its own dragging (the film pass); the
		// nudge along the stroke is for the drivers that do not say where
		// the brush is.
		dial(
			'uAdvK',
			carry.length ? 0 : Math.min( 0.15, S.params.advK ?? 0 )
		);
		dial( 'uAdvX', S.params.advX ?? 0 );
		dial( 'uAdvY', S.params.advY ?? 0 );
		dial( 'uBody', S.params.body );
		dial( 'uGloss', S.params.gloss );
		dial( 'uKorn', S.params.korn );
		dial( 'uCoverK', S.params.coverK ?? 0 );
		dial( 'uMixK', S.params.mixK ?? 0 );
		dial( 'uHideK', S.params.hideK ?? 3 );
		dial( 'uBands', S.params.bands ? 1 : 0 );
		dial( 'uCarryCap', S.params.carryK ?? 0 );
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
		for ( let i = 0; i < 4; i++ ) {
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

	/** A new stroke, a clean tool: no spot of its film is in use. */
	function clearFilm() {
		for ( const side of [ 0, 1 ] ) {
			targets( [ filmK[ side ], filmS[ side ] ] );
			gl.clearBufferfv( gl.COLOR, 0, [ 0, 0, 0, 0 ] );
			gl.clearBufferfv( gl.COLOR, 1, [ 0, 0, 0, -1 ] );
		}
		carry = [];
	}
	clearFilm();

	/**
	 * The copies of the brush that carry, for the steps that follow a
	 * fold: each film exchanges along the way from where it last did to
	 * where the brush stands now. Without a step to do it in (a batch
	 * folded on its own, see stamp) the way waits for the next call.
	 *
	 * @param {number} m Steps to do it in.
	 * @return {?Object} { m, list } or null.
	 */
	function carryPlan( m ) {
		if ( m < 1 || ! ( ( S.params.carryK ?? 0 ) > 0 ) ) {
			return null;
		}
		const list = [];
		carry.forEach( ( cp, c ) => {
			if ( ! cp || ! cp.live ) {
				return;
			}
			const len = Math.hypot(
				cp.to[ 0 ] - cp.at[ 0 ],
				cp.to[ 1 ] - cp.at[ 1 ]
			);
			if ( len > 0.25 ) {
				cp.ux = ( cp.to[ 0 ] - cp.at[ 0 ] ) / len;
				cp.uy = ( cp.to[ 1 ] - cp.at[ 1 ] ) / len;
			}
			list.push( {
				c,
				from: cp.at,
				to: cp.to,
				r: cp.r,
				h: cp.h,
				w: cp.w,
				ux: cp.ux,
				uy: cp.uy,
				// The path of one step, in lengths of the head.
				ds: len / m / ( 2 * cp.h ),
			} );
			cp.at = cp.to;
			cp.live = false;
		} );
		return list.length ? { m, list } : null;
	}

	/**
	 * The film's uniforms for a pass. Its textures are bound either way
	 * (a sampler without a texture is an error on some drivers); the
	 * copies only count in a step the film moves in.
	 *
	 * @param {WebGLProgram} prog  The pass.
	 * @param {?Object}      touch The batch the brush is in.
	 * @param {boolean}      on    The film moves in this step.
	 */
	function carryUniforms( prog, touch, on ) {
		bindTex( prog, 'uFilmK', 5, filmK[ fcur ] );
		bindTex( prog, 'uFilmS', 6, filmS[ fcur ] );
		gl.uniform1i( uloc( prog, 'uCopies' ), on ? brushCount : 0 );
		if ( on ) {
			gl.uniform4fv( uloc( prog, 'uBrush' ), brushData );
			gl.uniform4fv( uloc( prog, 'uBrushExt' ), brushExt );
			gl.uniform1iv( uloc( prog, 'uBrushOn' ), brushOn );
		}
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.uniform1i( uloc( prog, 'uStamp' ), 3 );
		gl.uniform1i( uloc( prog, 'uTouchOn' ), touch ? 1 : 0 );
		if ( touch ) {
			gl.uniform4i(
				uloc( prog, 'uTouchRect' ),
				touch.x0,
				touch.y0,
				touch.x1,
				touch.y1
			);
		}
	}

	/**
	 * Step k of a plan: put every copy of the brush where it stands in
	 * this step and let its film exchange with the paint under it (the
	 * film's side; the simulation pass that follows does the cells' side
	 * from the same state, and only then the film changes sides).
	 *
	 * @param {Object} plan  From carryPlan.
	 * @param {number} k     1 to plan.m.
	 * @param {number} a     The side of the fields to read.
	 * @param {Object} touch The batch the brush is in.
	 */
	function carryStep( plan, k, a, touch ) {
		brushOn.fill( 0 );
		brushCount = 0;
		const t = k / plan.m;
		for ( const b of plan.list ) {
			const o = b.c * 4;
			brushData[ o ] =
				b.from[ 0 ] + ( b.to[ 0 ] - b.from[ 0 ] ) * t - S.rx;
			brushData[ o + 1 ] =
				b.from[ 1 ] + ( b.to[ 1 ] - b.from[ 1 ] ) * t - S.ry;
			brushData[ o + 2 ] = b.ux;
			brushData[ o + 3 ] = b.uy;
			brushExt[ o ] = b.h;
			brushExt[ o + 1 ] = b.w;
			brushExt[ o + 2 ] = b.ds;
			brushExt[ o + 3 ] = b.r;
			brushOn[ b.c ] = 1;
			brushCount = Math.max( brushCount, b.c + 1 );
		}
		drawWhole();
		gl.viewport( 0, 0, FILM, FILM * COPIES );
		runPass(
			progFilm,
			[ filmK[ 1 - fcur ], filmS[ 1 - fcur ] ],
			() => {
				bindTex( progFilm, 'uC', 0, C[ a ] );
				bindTex( progFilm, 'uK', 1, K[ a ] );
				bindTex( progFilm, 'uS', 2, Sx[ a ] );
			},
			( prog ) => carryUniforms( prog, touch, true )
		);
		gl.viewport( 0, 0, S.rw, S.rh );
	}

	S.reset = () => {
		clearFilm();
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
		C = [ null, null ];
		K = [ null, null ];
		Sx = [ null, null ];
		SD = [ null, null ];
		S.rw = 0;
		S.rh = 0;
		S.wet = 0;
		strokeCov = null;
		stampQueue = null;
		acc = null;
		accTouch = null;
		accLane = null;
		accAng = null;
		act = null;
		dirty = [];
		dirtyFrom = null;
		near = [];
		since = null;
		renderAll = true;
		ready = null;
		seen = null;
		probe.cancel();
		S.drawn = null;
		canvas.width = 1;
		canvas.height = 1;
	};

	S.hasRegion = () => S.rw > 0;

	/** Redraw the whole canvas next time. */
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
	 * Cells the next step covers (0: nothing to run) - the controller's
	 * frame budget counts work, not steps.
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
		return tileCells(
			tileUnion( act, stampQueue?.tiles || null ),
			S.rw,
			S.rh
		);
	};

	/**
	 * One tiny dab through every program, then gone again: the driver
	 * finishes compiling each one for its real targets on its first draw,
	 * and the first stroke must not wait for that (see wetPrewarm).
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
		S.strokeBegin();
		S.stamp(
			{ data: new Float32Array( [ 1 ] ), w: 1, h: 1, gx: 0, gy: 0 },
			{ water: 1, pigment: 1, kr: 0.5, kg: 0.5, kb: 0.5 }
		);
		S.steps( 1 );
		S.render();
		S.dryAll();
		S.render();
		S.reset();
	};

	/**
	 * A new stroke starts: its coverage memory begins empty, so the SAME
	 * spot can take paint again (that is how impasto builds up).
	 */
	S.strokeBegin = () => {
		if ( strokeCov ) {
			strokeCov.fill( 0 );
		}
		clearFilm();
	};

	/**
	 * Feed (or clear) the ground under the island - a canvas of exactly
	 * the island canvas' size holding the target layer's straight RGBA.
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
	 * Seed the layer's paint under the island into VIRGIN cells (rgb = the
	 * shown pixel's absorbing K, a = 2 for a full cell; 0 skips the cell).
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
		// ... and onto the current side too: outside the active rect both
		// sides must agree.
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
		C = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		K = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		Sx = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		SD = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
		makeStampTex();
		cur = 0;
		gl.viewport( 0, 0, S.rw, S.rh );
		gl.disable( gl.BLEND );
		gl.clearColor( 0, 0, 0, 0 );
		// BOTH sides: a scissored step never writes outside its rect.
		for ( const side of [ 0, 1 ] ) {
			targets( [ C[ side ], K[ side ], Sx[ side ], SD[ side ] ] );
			gl.clear( gl.COLOR_BUFFER_BIT );
		}
		strokeCov = new Float32Array( S.rw * S.rh );
		acc = new Float32Array( S.rw * S.rh );
		accTouch = new Float32Array( S.rw * S.rh );
		accLane = new Float32Array( S.rw * S.rh );
		accAng = new Float32Array( S.rw * S.rh );
		act = null;
		dirty = [];
		dirtyFrom = null;
		near = [];
		since = null;
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
		const moveF32 = ( arr ) => {
			const out = new Float32Array( nw * nh );
			for ( let y = 0; y < S.rh; y++ ) {
				out.set(
					arr.subarray( y * S.rw, y * S.rw + S.rw ),
					( y + shift[ 1 ] ) * nw + shift[ 0 ]
				);
			}
			return out;
		};
		strokeCov = moveF32( strokeCov );
		acc = stampQueue ? moveF32( acc ) : new Float32Array( nw * nh );
		accTouch = stampQueue
			? moveF32( accTouch )
			: new Float32Array( nw * nh );
		accLane = stampQueue ? moveF32( accLane ) : new Float32Array( nw * nh );
		accAng = stampQueue ? moveF32( accAng ) : new Float32Array( nw * nh );
		if ( stampQueue ) {
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
		// The bookkeeping moves with the cells (coarser on the new grid,
		// never smaller); a probe in flight saw the old grid and is
		// dropped.
		act = tileShift( act, shift[ 0 ], shift[ 1 ], nw, nh );
		dirty = dirty.map( ( r ) => rectShift( r, shift[ 0 ], shift[ 1 ] ) );
		dirtyFrom = null;
		since = tileShift( since, shift[ 0 ], shift[ 1 ], nw, nh );
		near = near.map( ( r ) => rectShift( r, shift[ 0 ], shift[ 1 ] ) );
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
		C = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		K = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		Sx = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
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
	 * Stamp a dab: only the coverage DELTA against the stroke's own memory
	 * deposits, so a stroke is one continuous body instead of a chain of
	 * circles, and only a NEW stroke thickens the same spot again.
	 *
	 * @param {Object} map { data, w, h, gx, gy } alpha map, absolute grid.
	 *                     Optional map.lane = { nx, ny, c, code }: the
	 *                     stroke's unit normal, the lane offset (lane of a
	 *                     document point p is p.n + c) and 1 + angle / 2 pi
	 *                     - the bristle grooves follow it.
	 *                     Optional map.brush = { ax, ay, bx, by, r, copy }:
	 *                     the way of the brush's middle in this dab and
	 *                     its radius, in document px, and which mirrored
	 *                     copy of the brush it is (0 = the brush itself).
	 *                     With it and params.carryK the tool carries paint
	 *                     (brush-carry.js).
	 * @param {Object} p   { kr, kg, kb, sr, sg, sb, water, pigment } -
	 *                     water doubles as the thickness rate here.
	 */
	S.stamp = ( map, p ) => {
		if ( ! S.rw ) {
			return;
		}
		// One batch, one pigment identity - fold the old batch first when
		// the colour changes mid-frame (see the liquid engine).
		if (
			stampQueue &&
			( stampQueue.pig[ 0 ] !== p.kr ||
				stampQueue.pig[ 1 ] !== p.kg ||
				stampQueue.pig[ 2 ] !== p.kb ||
				stampQueue.pigS[ 0 ] !== ( p.sr || 0 ) ||
				stampQueue.sc !== ( p.sc || 0 ) ||
				// One batch, ONE rate pair - pen pressure varies them.
				stampQueue.pig[ 3 ] !== p.water ||
				stampQueue.pigS[ 3 ] !== p.pigment )
		) {
			S.steps( 1 );
		}
		if ( ! stampQueue ) {
			stampQueue = {
				x0: S.rw,
				y0: S.rh,
				x1: -1,
				y1: -1,
				pig: [ p.kr, p.kg, p.kb, p.water ],
				pigS: [ p.sr || 0, p.sg || 0, p.sb || 0, p.pigment ],
				// In bands: the pigment's one scattering.
				sc: p.sc || 0,
				// The tiles and rects of the dabs themselves (see the
				// liquid engine).
				tiles: tileMask( S.rw, S.rh ),
				rects: [],
			};
		}
		const q = stampQueue;
		const br = map.brush;
		let ext = null;
		if (
			br &&
			( S.params.carryK ?? 0 ) > 0 &&
			br.copy >= 0 &&
			br.copy < COPIES
		) {
			const cp =
				carry[ br.copy ] ||
				( carry[ br.copy ] = {
					at: null,
					to: null,
					r: 1,
					h: 1,
					w: 1,
					ux: 1,
					uy: 0,
					live: false,
				} );
			if ( ! cp.at ) {
				cp.at = [ br.ax / SC, br.ay / SC ];
			}
			cp.to = [ br.bx / SC, br.by / SC ];
			cp.r = Math.max( 1, br.r / SC );
			cp.live = true;
			// What the head covers around its way in this dab is measured
			// below: how far to either side, how far ahead of the end and
			// behind the start (the head's own length and width - a mask
			// fills far less than the square it is drawn in).
			const len = Math.hypot( br.bx - br.ax, br.by - br.ay );
			ext = {
				cp,
				ax: br.ax / SC,
				ay: br.ay / SC,
				ux: len > 0.5 ? ( br.bx - br.ax ) / len : cp.ux,
				uy: len > 0.5 ? ( br.by - br.ay ) / len : cp.uy,
				len: len / SC,
				side: 0,
				ahead: 0,
				behind: 0,
			};
		}
		const lane =
			map.lane && map.lane.code >= 1 && map.lane.code < 2
				? map.lane
				: null;
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
				if ( ext ) {
					const px = map.gx + mx + 0.5 - ext.ax;
					const py = map.gy + my + 0.5 - ext.ay;
					const along = px * ext.ux + py * ext.uy;
					const side = Math.abs( py * ext.ux - px * ext.uy );
					if ( side > ext.side ) {
						ext.side = side;
					}
					if ( along - ext.len > ext.ahead ) {
						ext.ahead = along - ext.len;
					}
					if ( -along > ext.behind ) {
						ext.behind = -along;
					}
				}
				const gx = dx + mx;
				if ( gx < 0 || gx >= S.rw ) {
					continue;
				}
				const i = gy * S.rw + gx;
				// The brush is HERE in this frame, new coverage or not.
				if ( a > accTouch[ i ] ) {
					accTouch[ i ] = a;
				}
				if ( lane ) {
					accLane[ i ] =
						( S.rx + gx + 0.5 ) * SC * lane.nx +
						( S.ry + gy + 0.5 ) * SC * lane.ny +
						lane.c;
					accAng[ i ] = lane.code;
				}
				const delta = a - strokeCov[ i ];
				if ( delta <= 0 ) {
					continue;
				}
				strokeCov[ i ] = a;
				acc[ i ] += delta;
			}
		}
		if ( ext && ext.side > 0 ) {
			// The shorter of the two ends: the head stands within what the
			// frame covers at every step of its way.
			ext.cp.w = Math.max( 1, ext.side );
			ext.cp.h = Math.max( 1, Math.min( ext.ahead, ext.behind ) );
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

	/**
	 * Shrink the active tiles to what the probe saw plus every stamp
	 * folded in since - closed paint never reopens on its own.
	 */
	function applyProbe() {
		lastLag = stepNo - ready.t0;
		act = tileUnion( ready.tiles, since );
		ready = null;
	}

	/**
	 * The cells a step runs over: the open tiles, as rects - paste has no
	 * reach (closed paint never moves). Worked out once per `act`.
	 *
	 * @return {Array} Cell rects.
	 */
	function runRects() {
		if ( act !== runFor ) {
			runFor = act;
			runCache = tileRects( act, S.rw, S.rh );
		}
		return runCache;
	}

	/**
	 * Point the passes at a set of cell rects (see the liquid engine).
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
	 * Fold the batch's accumulator into the stamp texture (its rect only)
	 * and clear it there for the next batch.
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
				upload[ o ] = acc[ row + x ];
				upload[ o + 1 ] = accTouch[ row + x ];
				upload[ o + 2 ] = accLane[ row + x ];
				upload[ o + 3 ] = accAng[ row + x ];
			}
			acc.fill( 0, row, row + qw );
			accTouch.fill( 0, row, row + qw );
			accLane.fill( 0, row, row + qw );
			accAng.fill( 0, row, row + qw );
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
		// The batch this call folds in is where the brush IS for all of
		// the call's steps: softening and smear act inside its rect.
		let touch = null;
		// ... and the film on the tool moves with the brush over the steps
		// that follow the fold.
		let plan = null;
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
				touch = q;
				plan = q ? carryPlan( n - 1 ) : null;
			}
			const film = !! plan && k >= 1 && k <= plan.m;
			if ( film ) {
				carryStep( plan, k, a, touch );
			}
			if ( q ) {
				act = tileUnion( act, q.tiles );
				since = tileUnion( since, q.tiles );
				if ( ! near.length ) {
					nearStep = stepNo;
				}
				for ( const r of q.rects ) {
					near = addRect( near, r );
				}
				uploadStamp( q );
			}
			// Only open paint (and fresh stamps) can change; with nothing
			// open, both sides agree everywhere and the step is a no-op.
			const run = false === S.scissor ? null : runRects();
			if ( false === S.scissor ) {
				drawWhole();
			} else if ( ! run.length ) {
				continue;
			} else {
				drawRects( run );
			}
			runPass(
				progPaste,
				[ C[ b ], K[ b ], Sx[ b ], SD[ b ] ],
				() => {
					bindTex( progPaste, 'uC', 0, C[ a ] );
					bindTex( progPaste, 'uK', 1, K[ a ] );
					bindTex( progPaste, 'uS', 2, Sx[ a ] );
					bindTex( progPaste, 'uSD', 4, SD[ a ] );
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
						gl.uniform4f( uloc( prog, 'uStampPigS' ), ...q.pigS );
						gl.uniform1f( uloc( prog, 'uStampSc' ), q.sc || 0 );
					} else {
						gl.uniform2i( uloc( prog, 'uStampSize' ), 0, 0 );
					}
					carryUniforms( prog, touch, film );
				}
			);
			cur = b;
			if ( film ) {
				// Both sides of the exchange are written: the film changes
				// sides with the fields.
				fcur = 1 - fcur;
			}
			if ( run !== dirtyFrom || ! run ) {
				dirty = run ? run.reduce( addRect, dirty ) : [ whole() ];
				dirtyFrom = run;
			}
		}
		drawWhole();
		// The frame budget asks whether the GPU is still on this frame's
		// steps too, not only on its renders - a frame that only steps
		// must not look idle.
		fence.mark();
		if ( tileAny( act ) && ! ready && ! probe.busy() ) {
			probe.request( C[ cur ], act, S.rw, S.rh, {
				t0: stepNo,
				serial: stampSerial,
			} );
			since = null;
		}
	};

	/** Still open? Never waits for the GPU (see the liquid engine). */
	S.checkWet = () => {
		if ( ! S.rw || S.lost ) {
			S.wet = 0;
			return 0;
		}
		if ( stampQueue ) {
			return S.wet;
		}
		if ( ! tileAny( act ) ) {
			S.wet = 0;
		} else if ( wetReplay() ) {
			S.wet = probe.now( C[ cur ], act, S.rw, S.rh ).wet > 0.02 ? 1 : 0;
		} else {
			pollProbe();
			if ( seen && seen.serial === stampSerial && seen.wet <= 0.02 ) {
				S.wet = 0;
			}
		}
		return S.wet;
	};

	S.dryAll = () => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		// Dabs still waiting for their step go down first (a flush in the
		// middle of a stroke used to bake without them).
		if ( stampQueue ) {
			S.steps( 1 );
		}
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		const a = cur;
		const b = 1 - cur;
		runPass( progLock, [ C[ b ] ], () =>
			bindTex( progLock, 'uC', 0, C[ a ] )
		);
		// K, S and SD just move sides so the ping-pong stays consistent.
		for ( const [ pair ] of [ [ K ], [ Sx ], [ SD ] ] ) {
			targets( [ pair[ b ] ] );
			bindQuad( progCopy );
			bindTex( progCopy, 'uT', 0, pair[ a ] );
			gl.uniform2i( uloc( progCopy, 'uShift' ), 0, 0 );
			gl.uniform2i( uloc( progCopy, 'uOldSize' ), S.rw, S.rh );
			gl.drawArrays( gl.TRIANGLES, 0, 3 );
		}
		cur = b;
		S.wet = 0;
		// Only one side took the lock: the whole region is in play again.
		act = allTiles();
		dirty = [];
		dirtyFrom = null;
		near = [];
		renderAll = true;
		ready = null;
		seen = null;
		probe.cancel();
	};

	/**
	 * Render the paint into the island's own canvas (premultiplied).
	 *
	 * @param {boolean} nearOnly Only around the dabs folded in since the
	 *                           last render (see the liquid engine): all
	 *                           open paint changes every step - its clock
	 *                           runs, its gloss fades - so without this the
	 *                           relief of every open stroke was rendered
	 *                           again every frame, however far from the
	 *                           brush.
	 */
	S.render = ( nearOnly = false ) => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		// Only what the steps touched plus the render's reach; the
		// preserved drawing buffer still holds the truth everywhere else.
		const part = nearOnly && ! renderAll && false !== S.scissor;
		let cells = null; // cell rects to redraw; null redraws all
		if ( ! renderAll && false !== S.scissor ) {
			// Open paint blends and is dragged a cell per step at most.
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
				return;
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
		bindQuad( progRender );
		bindTex( progRender, 'uC', 0, C[ cur ] );
		bindTex( progRender, 'uK', 1, K[ cur ] );
		bindTex( progRender, 'uS', 2, Sx[ cur ] );
		bindTex( progRender, 'uPF', 3, texPF );
		// A dummy binding keeps the sampler unit complete when no ground
		// is set; the uHasGround gate keeps it unread.
		bindTex( progRender, 'uGround', 4, texGround || texPF );
		bindTex( progRender, 'uSDt', 5, SD[ cur ] );
		gl.uniform1i( uloc( progRender, 'uHasGround' ), texGround ? 1 : 0 );
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

	/** Test hook: the active tiles as they stand, and the last probe's lag. */
	S.debugActive = () => ( {
		rect: tileBox( act, S.rw, S.rh ),
		cells: tileCells( act, S.rw, S.rh ),
		lag: lastLag,
	} );

	S.readField = ( which ) => {
		const map = { C, K, S: Sx, SD };
		const tex = ( map[ which ] || C )[ cur ];
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
