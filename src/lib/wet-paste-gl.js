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
 * - NO lateral water transport at all. Paste stays where the brush put it.
 *
 * No imports; the dev-docroot harness loads this module directly.
 */

const SC = 2; // cell size in document pixels (same grid family as liquid)
const MARGIN = 128;
const MAX_CELLS = 4194304;

const TILE = 512;

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
	for ( let y = 0; y < TILE; y++ ) {
		for ( let x = 0; x < TILE; x++ ) {
			const i = y * TILE + x;
			// A woven look: two fine perpendicular waves plus soft noise.
			// 128 cycles = 4 px thread pitch at document resolution; the
			// first cut (64 = 8 px, sampled at half res in the relief) read
			// as a coarse diagonal grid, "zoomed in 500%" (Thomas).
			const weave =
				0.5 +
				0.22 *
					Math.sin( ( x * 2 * Math.PI * 128 ) / TILE ) *
					Math.sin( ( y * 2 * Math.PI * 128 ) / TILE + 1.3 );
			let pf;
			if ( ! pap ) {
				pf =
					0.55 * weave +
					0.3 * pnoise( x, y, TILE, 44, 71 ) +
					0.15 * pnoise( x, y, TILE, 90, 913 );
			} else {
				pf =
					( pap.gewebe ? 0.55 * weave : 0.55 * 0.5 ) +
					0.3 * pnoise( x, y, TILE, f1, 71 ) +
					0.15 * pnoise( x, y, TILE, f2, 913 );
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
`;

/*
 * The single simulation pass: fold the frame's stamp deltas in (thickness
 * grows, pigment amounts add = KM mixing), decay the open clock, and while
 * open blend gently sideways so brush marks soften the way wet paint does.
 * MRT: C (thickness, open), K, S.
 */
const FRAG_PASTE = `#version 300 es
__CHUNK__

uniform sampler2D uC;  // r = thickness, g = open
uniform sampler2D uK;  // K.rgb
uniform sampler2D uS;  // S.rgb
// The LAYER's paint under the island, seeded per cell (rgb = absorbing K
// of what the pixel shows, a = 1 + remaining fraction; a < 1 = virgin).
uniform sampler2D uSD;
uniform sampler2D uStamp; // r = coverage delta of this frame's dabs
uniform ivec2 uStampSize; // 0,0 = none
// The stamp texture is only overwritten inside this frame's batch rect;
// outside it the texture still holds EARLIER batches, so the stamp may
// only be applied inside the rect (x0, y0, x1, y1 inclusive).
uniform ivec4 uStampRect;
uniform vec4 uStampPig;   // K.rgb, thickness rate
uniform vec4 uStampPigS;  // S.rgb, pigment rate

layout( location = 0 ) out vec4 oC;
layout( location = 1 ) out vec4 oK;
layout( location = 2 ) out vec4 oS;
layout( location = 3 ) out vec4 oSD;

void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 C = texelFetch( uC, xy, 0 );
	vec3 K = texelFetch( uK, xy, 0 ).rgb;
	vec3 S = texelFetch( uS, xy, 0 ).rgb;
	vec4 sd = texelFetch( uSD, xy, 0 );
	float T = C.r;
	float open = C.g;

	if ( uStampSize.x > 0 &&
		xy.x >= uStampRect.x && xy.y >= uStampRect.y &&
		xy.x <= uStampRect.z && xy.y <= uStampRect.w ) {
		float d = texelFetch( uStamp, xy, 0 ).r;
		if ( d > 0.0 ) {
			T += d * uStampPig.a;
			K += uStampPig.rgb * ( d * uStampPigS.a );
			S += uStampPigS.rgb * ( d * uStampPigS.a );
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
					vec3 kk = ( 1.0 - c ) * ( 1.0 - c ) / ( 2.0 * c ) * 1.6;
					T += df * 0.45;
					K += kk * ( df * 0.9 );
					S += vec3( 1.6 ) * ( df * 0.9 );
					sd.a = 1.0 + ( rest - df );
				}
			}
			open = 1.0; // fresh paint opens the spot again
		}
	}

	// While open, paint blends into open neighbours: brush marks soften,
	// colours pull into each other (the oil joy). Conservative gather with
	// per-pair symmetric factors, capped well below mass loss.
	if ( open > 0.02 && uBlendK > 0.0 ) {
		float wsum = 0.0;
		float Tn = 0.0;
		vec3 Kn = vec3( 0.0 );
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
			// SHARED openness - identical from both sides, so the gather
			// conserves mass (the pair-cap lesson from the liquid engine).
			float w = min( open, Cn.g );
			if ( w <= 0.02 ) {
				continue;
			}
			w *= uBlendK * 0.06;
			wsum += w;
			Tn += w * Cn.r;
			Kn += w * texelFetch( uK, n, 0 ).rgb;
			Sn += w * texelFetch( uS, n, 0 ).rgb;
		}
		if ( wsum > 0.0 ) {
			T = T * ( 1.0 - wsum ) + Tn;
			K = K * ( 1.0 - wsum ) + Kn;
			S = S * ( 1.0 - wsum ) + Sn;
		}
	}

	// DIRECTIONAL smear: open paint is dragged along the stroke. A
	// conservative PAIR scheme (gather form): what this cell hands its
	// downstream neighbour is exactly what that neighbour computes as
	// its inflow - identical factors on both sides, the liquid engine's
	// pair-cap lesson. uAdvK is capped at 0.15 in JS so the total
	// outflow (max 2*(|dx|+|dy|)*uAdvK = 0.42) can never need clamping;
	// a clamp that engages would CREATE mass.
	if ( open > 0.02 && uAdvK > 0.0 ) {
		float out2 = 0.0;
		float Tn2 = 0.0;
		vec3 Kn2 = vec3( 0.0 );
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
				out2 += f * g;
			} else {
				float fg = f * -g;
				Tn2 += fg * Cn.r;
				Kn2 += fg * texelFetch( uK, n, 0 ).rgb;
				Sn2 += fg * texelFetch( uS, n, 0 ).rgb;
			}
		}
		if ( out2 > 0.0 || Tn2 > 0.0 ) {
			T = T * ( 1.0 - out2 ) + Tn2;
			K = K * ( 1.0 - out2 ) + Kn2;
			S = S * ( 1.0 - out2 ) + Sn2;
		}
	}

	// The open clock. Paint without substance closes immediately.
	open = T > 0.003 ? max( 0.0, open - uOpenK ) : 0.0;
	oC = vec4( T, open, 0.0, 0.0 );
	oK = vec4( K, 0.0 );
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
 * The paste render: colour is Kubelka-Munk at full body (a thick layer
 * shows R_inf; thin strokes let the ground through via coverage alpha),
 * then the RELIEF: height = thickness, roughened, lit from the upper
 * left. Y-flipped like every island render (WebGL origin is bottom-left).
 */
const FRAG_RENDER = `#version 300 es
__CHUNK__

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

out vec4 oC;

vec3 wgt( float f ) {
	float a = 0.5 * ( 1.0 - f ) * ( 1.0 - f );
	float c = 0.5 * f * f;
	return vec3( a, 1.0 - a - c, c );
}

// B-spline sampled fields at a grid position.
void fields( vec2 u, out float T, out float open, out vec3 K, out vec3 S ) {
	u = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
	ivec2 ic = ivec2( floor( u + 0.5 ) );
	vec2 fr = u + 0.5 - vec2( ic );
	vec3 wx = wgt( fr.x );
	vec3 wy = wgt( fr.y );
	T = 0.0;
	open = 0.0;
	K = vec3( 0.0 );
	S = vec3( 0.0 );
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			float k = wx[ i + 1 ] * wy[ j + 1 ];
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			vec4 C = texelFetch( uC, c, 0 );
			T += k * C.r;
			open += k * C.g;
			K += k * texelFetch( uK, c, 0 ).rgb;
			S += k * texelFetch( uS, c, 0 ).rgb;
		}
	}
}

float heightAt( vec2 u, ivec2 absPx ) {
	float T;
	float open;
	vec3 K;
	vec3 S;
	fields( u, T, open, K, S );
	// Two octaves of roughness, scaled by how much paint is there - the
	// bumps belong to the paint, not to the canvas. Sampled at FULL and
	// half document resolution; and the finer the pattern, the steeper
	// the same amplitude lights, so it stays moderate.
	float g1 = texelFetch(
		uPF,
		ivec2( absPx.x & ${ TILE - 1 }, absPx.y & ${ TILE - 1 } ),
		0
	).r;
	float g2 = texelFetch(
		uPF,
		ivec2( ( absPx.x >> 1 ) & ${ TILE - 1 }, ( absPx.y >> 1 ) & ${ TILE - 1 } ),
		0
	).r;
	float rough = 0.55 * g1 + 0.45 * g2;
	return T * ( 1.0 + ( rough - 0.5 ) * 0.5 * uBody );
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
	vec3 K;
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
	vec3 r = K / ( S + 1e-3 );
	vec3 Rinf = 1.0 + r - sqrt( r * r + 2.0 * r );
	float toothFade = exp( -2.0 * T );
	float mod2 = 1.0 + ( 0.5 - g ) * uKorn * 1.2 * toothFade;
	vec3 col = clamp( Rinf * mod2, 0.0, 1.0 );

	// Coverage: thin paint is a scraped film, thick paint covers fully -
	// and the tooth gates the THIN end, which is what makes a dry-brushed
	// paste stroke break over the weave instead of ending in a ramp.
	float aBase = 1.0 - exp( -3.0 * T );
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
	float hC = heightAt( u, absPx );
	float hX1 = heightAt( u + vec2( 0.5, 0.0 ), absPx + ivec2( 1, 0 ) );
	float hX0 = heightAt( u - vec2( 0.5, 0.0 ), absPx - ivec2( 1, 0 ) );
	float hY1 = heightAt( u + vec2( 0.0, 0.5 ), absPx + ivec2( 0, 1 ) );
	float hY0 = heightAt( u - vec2( 0.0, 0.5 ), absPx - ivec2( 0, 1 ) );
	float relief = 5.5 * ( 0.35 + uBody );
	vec3 nrm = normalize(
		vec3( -( hX1 - hX0 ) * relief, -( hY1 - hY0 ) * relief, 1.0 )
	);
	vec3 L = vec3( -0.45, -0.45, 0.772 );
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
				Rg = pow( max( Rg, vec3( 1e-4 ) ), vec3( fRest ) );
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

const FRAG_MAXCOL = `#version 300 es
precision highp float;
uniform sampler2D uT;
uniform ivec2 uSize;
out vec4 oC;
void main() {
	int x = int( gl_FragCoord.x );
	float m = 0.0;
	for ( int y = 0; y < uSize.y; y++ ) {
		m = max( m, texelFetch( uT, ivec2( x, y ), 0 ).g );
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

const FRAG_LOCK = `#version 300 es
__CHUNK__
uniform sampler2D uC;
layout( location = 0 ) out vec4 oC;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 C = texelFetch( uC, xy, 0 );
	oC = vec4( C.r, 0.0, 0.0, 0.0 );
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
			compile( gl.FRAGMENT_SHADER, fragSrc.replace( '__CHUNK__', CHUNK ) )
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
	const progRender = program( FRAG_RENDER );
	const progCopy = program( FRAG_COPY );
	const progMaxCol = program( FRAG_MAXCOL );
	const progMaxRow = program( FRAG_MAXROW );
	const progLock = program( FRAG_LOCK );

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
	// The GROUND (target layer's pixels, RGBA8 at canvas resolution) and
	// the SEED pair (the layer's paint as liftable body colour). Dropped
	// on grow/reset; the controller re-feeds on geometry change.
	let texGround = null;
	const fbo = gl.createFramebuffer();
	const fboRead = gl.createFramebuffer();

	const S = {
		canvas,
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0,
		lost: false,
		// No time-lapse after release: the open clock IS the medium.
		raffer: false,
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
		},
	};
	S.setParams = ( p ) => {
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
	};
	canvas.addEventListener( 'webglcontextlost', () => {
		S.lost = true;
	} );

	let C = [ null, null ];
	let K = [ null, null ];
	let Sx = [ null, null ];
	let SD = [ null, null ];
	let cur = 0;
	let maxCol = null;
	let maxOne = null;
	// Coverage memory of the CURRENT stroke (delta stamping) plus the
	// frame's delta batch.
	let strokeCov = null;
	let stampQueue = null; // { acc, x0, y0, x1, y1, pig, pigS }

	const allPairs = () => [ C, K, Sx, SD ];

	function bindQuad( prog ) {
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, quad );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		const set2i = ( name, a, b ) => {
			const loc = gl.getUniformLocation( prog, name );
			if ( loc ) {
				gl.uniform2i( loc, a, b );
			}
		};
		set2i( 'uSize', S.rw, S.rh );
		set2i( 'uOrigin', S.rx, S.ry );
		const dial = ( name, val ) => {
			const loc = gl.getUniformLocation( prog, name );
			if ( loc ) {
				gl.uniform1f( loc, val );
			}
		};
		dial( 'uOpenK', S.params.openK );
		dial( 'uBlendK', S.params.blendK );
		dial( 'uPickK', S.params.pickK ?? 0 );
		dial( 'uAdvK', Math.min( 0.15, S.params.advK ?? 0 ) );
		dial( 'uAdvX', S.params.advX ?? 0 );
		dial( 'uAdvY', S.params.advY ?? 0 );
		dial( 'uBody', S.params.body );
		dial( 'uGloss', S.params.gloss );
		dial( 'uKorn', S.params.korn );
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
		C = [ null, null ];
		K = [ null, null ];
		Sx = [ null, null ];
		SD = [ null, null ];
		S.rw = 0;
		S.rh = 0;
		S.wet = 0;
		strokeCov = null;
		stampQueue = null;
		canvas.width = 1;
		canvas.height = 1;
	};

	S.hasRegion = () => S.rw > 0;

	/**
	 * A new stroke starts: its coverage memory begins empty, so the SAME
	 * spot can take paint again (that is how impasto builds up).
	 */
	S.strokeBegin = () => {
		if ( strokeCov ) {
			strokeCov.fill( 0 );
		}
	};

	/**
	 * Feed (or clear) the ground under the island - a canvas of exactly
	 * the island canvas' size holding the target layer's straight RGBA.
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
		// Only the SEED pair flips: the merged side becomes current.
		SD = [ SD[ 1 ], SD[ 0 ] ];
	};

	function makeStampTex() {
		if ( texStamp ) {
			gl.deleteTexture( texStamp );
		}
		texStamp = gl.createTexture();
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.texStorage2D( gl.TEXTURE_2D, 1, gl.R32F, S.rw, S.rh );
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
		targets( [ C[ 0 ], K[ 0 ], Sx[ 0 ] ] );
		gl.clear( gl.COLOR_BUFFER_BIT );
		targets( [ SD[ 0 ] ] );
		gl.clear( gl.COLOR_BUFFER_BIT );
		strokeCov = new Float32Array( S.rw * S.rh );
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
		if ( stampQueue ) {
			stampQueue.acc = moveF32( stampQueue.acc );
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
		C = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		K = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		Sx = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
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
	 * Stamp a dab: only the coverage DELTA against the stroke's own memory
	 * deposits, so a stroke is one continuous body instead of a chain of
	 * circles, and only a NEW stroke thickens the same spot again.
	 *
	 * @param {Object} map { data, w, h, gx, gy } alpha map, absolute grid.
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
				// One batch, ONE rate pair - pen pressure varies them.
				stampQueue.pig[ 3 ] !== p.water ||
				stampQueue.pigS[ 3 ] !== p.pigment )
		) {
			S.steps( 1 );
		}
		if ( ! stampQueue ) {
			stampQueue = {
				acc: new Float32Array( S.rw * S.rh ),
				x0: S.rw,
				y0: S.rh,
				x1: -1,
				y1: -1,
				pig: [ p.kr, p.kg, p.kb, p.water ],
				pigS: [ p.sr || 0, p.sg || 0, p.sb || 0, p.pigment ],
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
				const delta = a - strokeCov[ i ];
				if ( delta <= 0 ) {
					continue;
				}
				strokeCov[ i ] = a;
				q.acc[ i ] += delta;
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
					if ( q && q.x1 >= q.x0 ) {
						const qw = q.x1 - q.x0 + 1;
						const qh = q.y1 - q.y0 + 1;
						const sub = new Float32Array( qw * qh );
						for ( let y = 0; y < qh; y++ ) {
							for ( let x = 0; x < qw; x++ ) {
								sub[ y * qw + x ] =
									q.acc[ ( q.y0 + y ) * S.rw + q.x0 + x ];
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
							gl.RED,
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
						gl.uniform4f(
							gl.getUniformLocation( prog, 'uStampPigS' ),
							...q.pigS
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
			cur = b;
		}
	};

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
			bindTex( progMaxCol, 'uT', 0, C[ cur ] )
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
		S.wet = px[ 0 ] > 0.02 ? 1 : 0;
		return S.wet;
	};

	S.dryAll = () => {
		if ( ! S.rw || S.lost ) {
			return;
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
			gl.uniform2i( gl.getUniformLocation( progCopy, 'uShift' ), 0, 0 );
			gl.uniform2i(
				gl.getUniformLocation( progCopy, 'uOldSize' ),
				S.rw,
				S.rh
			);
			gl.drawArrays( gl.TRIANGLES, 0, 3 );
		}
		cur = b;
		S.wet = 0;
	};

	S.render = () => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, canvas.width, canvas.height );
		gl.disable( gl.BLEND );
		bindQuad( progRender );
		bindTex( progRender, 'uC', 0, C[ cur ] );
		bindTex( progRender, 'uK', 1, K[ cur ] );
		bindTex( progRender, 'uS', 2, Sx[ cur ] );
		bindTex( progRender, 'uPF', 3, texPF );
		// A dummy binding keeps the sampler unit complete when no ground
		// is set; the uHasGround gate keeps it unread.
		bindTex( progRender, 'uGround', 4, texGround || texPF );
		bindTex( progRender, 'uSDt', 5, SD[ cur ] );
		gl.uniform1i(
			gl.getUniformLocation( progRender, 'uHasGround' ),
			texGround ? 1 : 0
		);
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	};

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
