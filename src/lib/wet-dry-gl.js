/**
 * The DRY engine of the wet island family: charcoal (and later pastel,
 * pencil shading). Third of the style-engine modules, same interface as
 * the liquid (wet-surface-gl.js) and paste (wet-paste-gl.js) engines.
 *
 * Dry media have NO liquid at all: no flow, no drying dynamics, no body.
 * A dab abrades pigment onto the paper tooth, and everything that makes
 * charcoal read as charcoal is the TOOTH: the dust catches the RIDGES of
 * the grain first - exactly inverse to watercolour pigment, which settles
 * into the valleys. Light pressure draws broken, grainy strokes that show
 * the paper; heavy pressure fills the valleys too.
 *
 * Strokes deposit as coverage DELTAS against a per-stroke memory (the
 * paste engine's cure for the ghost-circle chains), and a stroke "sets"
 * moments after the hand stops - the wet clock here is a plain timer, not
 * physics.
 *
 * A deposit only touches its dabs' rect, and the render redraws only what
 * the deposits touched (wet-gl-active.js) - the rest of the region was a
 * full-canvas render every frame, the metal leaf's noise included.
 *
 * CELL SIZE. The island was born on the wet islands' grid of 2 px cells.
 * Dust has no neighbour physics, so nothing here needs a coarse grid - and
 * a pencil line three pixels wide is one and a half such cells: it came
 * out as a chain of crumbs (analysis of 09.11.2026). The editor now asks
 * for cells of ONE document pixel (createWetDryGL( { sc: 1 } )); a driver
 * that says nothing keeps the old 2 px, with every position it computes.
 */

import { LEAF_GLSL } from './metal-leaf';
import { toothTile, BOUND_GLSL, TOOTH_SPREAD } from './dry-grain';
import {
	createFrameFence,
	growTo,
	pxUnion,
	rectGrow,
	rectShift,
	rectUnion,
} from './wet-gl-active';

const LEGACY_SC = 2;
// Slack around a stroke, in document pixels (128 cells of the old grid).
const MARGIN_PX = 256;
const MAX_CELLS = 4194304;
// The render reads a 3x3 B-spline around a position warped up to 3.2 px:
// a changed cell shows up to three cells away.
const RENDER_PAD = 4;

const TILE = 512;

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

/** Laid paper for dry media: pronounced tooth with a light lay pattern. */
function buildPaperTile( pap ) {
	const out = new Uint8Array( TILE * TILE * 4 );
	const tooth = toothTile( pap );
	// Paper dials (document setting); without one the calibrated laid
	// paper runs untouched. Explicit papers swap the lay for weave or
	// plain tooth and scale contrast/feature size.
	const f1 = pap ? Math.max( 1, Math.round( 52 * pap.freq ) ) : 52;
	const f2 = pap ? Math.max( 1, Math.round( 105 * pap.freq ) ) : 105;
	for ( let y = 0; y < TILE; y++ ) {
		for ( let x = 0; x < TILE; x++ ) {
			const i = y * TILE + x;
			const lay =
				0.5 + 0.16 * Math.sin( ( y * 2 * Math.PI * 96 ) / TILE );
			let pf;
			if ( ! pap ) {
				pf =
					0.4 * lay +
					0.35 * pnoise( x, y, TILE, 52, 71 ) +
					0.25 * pnoise( x, y, TILE, 105, 913 );
			} else {
				const struktur = pap.rippen
					? lay
					: pap.gewebe
					? 0.5 +
					  0.16 *
							Math.sin( ( x * 2 * Math.PI * 128 ) / TILE ) *
							Math.sin( ( y * 2 * Math.PI * 128 ) / TILE + 1.3 )
					: 0.5;
				pf =
					0.4 * struktur +
					0.35 * pnoise( x, y, TILE, f1, 71 ) +
					0.25 * pnoise( x, y, TILE, f2, 913 );
				pf = Math.min(
					1,
					Math.max( 0, 0.5 + ( pf - 0.5 ) * pap.kont )
				);
			}
			const wx = ( pnoise( x, y, TILE, 23, 911 ) - 0.5 ) * 2.0;
			const wy = ( pnoise( x, y, TILE, 23, 137 ) - 0.5 ) * 2.0;
			out[ i * 4 ] = Math.max(
				0,
				Math.min( 255, Math.round( pf * 255 ) )
			);
			out[ i * 4 + 1 ] =
				128 + Math.max( -127, Math.min( 127, Math.round( wx * 40 ) ) );
			out[ i * 4 + 2 ] =
				128 + Math.max( -127, Math.min( 127, Math.round( wy * 40 ) ) );
			out[ i * 4 + 3 ] = Math.round( tooth[ i ] * 255 );
		}
	}
	return out;
}

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
uniform float uTooth; // how selective the ridges are
uniform float uMedium; // 0 dust, 1 wax, 2 pencil, 3 spray, 4 metal leaf
uniform float uSheen;
uniform float uPiece; // metal: platelet / flake size, document px
uniform float uFlakes; // metal leaf: 1 = crumpled flakes instead of sheets
uniform float uWear; // metal leaf: rubbed through to the bole
uniform float uDrop; // airbrush: droplet size
uniform vec4 uLeafXf; // metal leaf: this laying's turn and shift (leafTurn)
// Dust that COVERS (pastel, chalk) instead of tinting what lies under it
// like a film (charcoal): 0 = the absorbing film, 1 = opaque powder.
uniform float uOpaque;
`;

/* Deposit pass: fold the frame's coverage deltas into the dust field. */
const FRAG_DEPOSIT = `#version 300 es
__CHUNK__
uniform sampler2D uD;     // rgb = K, a = amount
uniform sampler2D uStamp; // r = coverage delta
uniform ivec2 uStampSize;
// The stamp texture is only overwritten inside this frame's batch rect;
// outside it the texture still holds EARLIER batches, so the stamp may
// only be applied inside the rect (x0, y0, x1, y1 inclusive).
uniform ivec4 uStampRect;
uniform vec4 uStampPig;   // K.rgb, amount rate
layout( location = 0 ) out vec4 oD;
void main() {
	ivec2 xy = ivec2( gl_FragCoord.xy );
	vec4 D = texelFetch( uD, xy, 0 );
	if ( uStampSize.x > 0 &&
		xy.x >= uStampRect.x && xy.y >= uStampRect.y &&
		xy.x <= uStampRect.z && xy.y <= uStampRect.w ) {
		float d = texelFetch( uStamp, xy, 0 ).r;
		if ( d > 0.0 ) {
			D.rgb += uStampPig.rgb * ( d * uStampPig.a );
			D.a += d * uStampPig.a;
		}
	}
	oD = D;
}
`;

/*
 * The dust render: charcoal catches the RIDGES of the tooth first -
 * inverse to watercolour. Light strokes break over the grain and show
 * paper in every valley; heavy layers fill the valleys too. Matte, a
 * whisper of body so a thick black reads as dust, not as print.
 */
const fragRender = ( SC ) => `#version 300 es
__CHUNK__
uniform sampler2D uD;
uniform sampler2D uPF;
// The GROUND: the target layer's own pixels under the island, straight
// RGBA at canvas resolution (the liquid engine's glaze, same contract).
// A pencil GLAZES what is already on the layer instead of floating over
// it as an alpha film - blue over dried yellow turns green, not grey.
uniform sampler2D uGround;
uniform int uHasGround;
out vec4 oC;
${ LEAF_GLSL }
${ BOUND_GLSL }

// Droplets on a jittered grid: each cell holds one droplet with its own
// size and birth threshold, and more paint means more cells carry one.
// Crisp little dots at the fringe of a spray, continuous where it builds.
float sprayDrops( vec2 p, float rho, float scale ) {
	float cs = 2.2 * scale;
	ivec2 c = ivec2( floor( p / cs ) );
	float cov = 0.0;
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			ivec2 g = c + ivec2( i, j );
			if ( leafHash( g, 81 ) > rho ) {
				continue;
			}
			vec2 fp = ( vec2( g ) + vec2( leafHash( g, 82 ), leafHash( g, 83 ) ) ) * cs;
			float r = ( 0.3 + 0.55 * leafHash( g, 84 ) ) * scale;
			float d = length( p - fp );
			cov = max( cov, 1.0 - smoothstep( r - 0.45, r + 0.45, d ) );
		}
	}
	return cov;
}

// The tooth a bound medium feels (dry-grain.js boundTooth): a lead reads
// the sheet finer than it is, a wax stick adds half frequency - and each
// mix is spread out evenly again, as there.
float boundTooth( ivec2 q, bool pencil ) {
	float t1 = texelFetch( uPF, ivec2( q.x & ${ TILE - 1 }, q.y & ${
		TILE - 1
	} ), 0 ).a;
	if ( pencil ) {
		return smoothstep( ${ TOOTH_SPREAD.pencil[ 0 ] }, ${
			TOOTH_SPREAD.pencil[ 1 ]
		}, 0.5 * texelFetch( uPF, ivec2( ( q.x * 3 + 7 ) & ${
			TILE - 1
		}, ( q.y * 3 + 3 ) & ${ TILE - 1 } ), 0 ).a +
			0.3 * texelFetch( uPF, ivec2( ( q.x * 2 + 11 ) & ${
				TILE - 1
			}, ( q.y * 2 + 5 ) & ${ TILE - 1 } ), 0 ).a + 0.2 * t1 );
	}
	return smoothstep( ${ TOOTH_SPREAD.wax[ 0 ] }, ${
		TOOTH_SPREAD.wax[ 1 ]
	}, 0.65 * t1 + 0.35 * texelFetch( uPF, ivec2( ( ( q.x + 256 ) >> 1 ) & ${
		TILE - 1
	}, ( ( q.y + 128 ) >> 1 ) & ${ TILE - 1 } ), 0 ).a );
}

vec3 wgt( float f ) {
	float a = 0.5 * ( 1.0 - f ) * ( 1.0 - f );
	float c = 0.5 * f * f;
	return vec3( a, 1.0 - a - c, c );
}

void main() {
	ivec2 px = ivec2(
		int( gl_FragCoord.x ),
		uSize.y * ${ SC } - 1 - int( gl_FragCoord.y )
	);
	ivec2 absPx = px + uOrigin * ${ SC };
	vec2 dp = vec2( absPx ) + 0.5;
	vec4 pf = texelFetch(
		uPF,
		ivec2( absPx.x & ${ TILE - 1 }, absPx.y & ${ TILE - 1 } ),
		0
	);
	float g = pf.r;
	vec2 warp = ( pf.gb * 255.0 - 128.0 ) / 40.0;
	if ( uMedium > 0.5 && uMedium < 1.5 ) warp *= 0.55;
	if ( uMedium > 1.5 && uMedium < 2.5 ) warp *= 0.2;
	if ( uMedium > 2.5 && uMedium < 3.5 ) warp = vec2( 0.0 );
	if ( uMedium > 3.5 ) warp *= 0.4;
	vec2 u = ( vec2( px ) + 0.5 + warp ) / float( ${ SC } ) - 0.5;
	u = clamp( u, vec2( 0.0 ), vec2( uSize ) - 1.001 );
	ivec2 ic = ivec2( floor( u + 0.5 ) );
	vec2 fr = u + 0.5 - vec2( ic );
	vec3 wx = wgt( fr.x );
	vec3 wy = wgt( fr.y );
	vec4 D = vec4( 0.0 );
	for ( int j = -1; j <= 1; j++ ) {
		for ( int i = -1; i <= 1; i++ ) {
			ivec2 c = clamp( ic + ivec2( i, j ), ivec2( 0 ), uSize - 1 );
			D += wx[ i + 1 ] * wy[ j + 1 ] * texelFetch( uD, c, 0 );
		}
	}
	float T = D.a;
	if ( T <= 0.004 ) {
		oC = vec4( 0.0 );
		return;
	}
	// The RIDGE gate: dust needs T to reach into the valleys. At light
	// coverage only ridges (high g) carry anything at all. The sheet's
	// coarse relief (and its laid lines) alone made every stroke a set of
	// soft stripes; half of it is now the felt-and-fibre tooth, so the
	// dust breaks over a real grain and the lines stay a whisper.
	float felt = boundTooth( absPx, false );
	float gd = 0.55 * g + 0.45 * felt;
	float reach = T * ( 0.15 + uTooth * 1.7 * gd ) / ( 0.1 + uTooth * 0.25 );
	float gate = clamp( reach, 0.0, 1.0 );
	gate = gate * gate * ( 3.0 - 2.0 * gate );
	// Grain inside the stroke: ridges darker (they carry the dust).
	float mod2 = 1.0 + ( gd - 0.5 ) * uTooth * 1.4 * exp( -1.2 * T );
	vec3 Ku = D.rgb / max( T, 1e-4 );
	vec3 K = Ku * min( 3.0, T ) * mod2;
	vec3 t = exp( -K );
	float aAbs = clamp( 1.0 - ( t.r + t.g + t.b ) / 3.0, 0.0, 1.0 );
	// Chalk BODY: light dust is a scattering powder and COVERS the
	// ground - white pastel on black paper, the oldest trick in the
	// drawing class. Dark dust only absorbs, exactly as before (body
	// falls to zero and the maths below collapses to the old formula).
	// The pigment's lightness comes out of its per-unit K, so the field
	// stores nothing new; ridges carry more powder, like the dust does.
	vec3 cu = clamp( exp( -Ku ), 0.0, 1.0 );
	if ( uMedium > 0.5 ) {
		if ( uMedium > 3.5 ) {
			// Foil is opaque: the leaf (and the bole it wore through to)
			// simply lies over whatever is there.
			oC = leafPixel( dp, cu, T, max( 3.0, uPiece ), uFlakes > 0.5, uTooth, uSheen, uWear, uLeafXf );
			return;
		}
		float lum = dot( cu, vec3( 0.299, 0.587, 0.114 ) );
		float cov;
		float dens;
		float opac;
		if ( uMedium < 1.5 ) {
			// WAX bites into the coarse felt and breaks crisply; along its
			// edge the stick sheds little lumps of wax.
			float tw = boundTooth( absPx, false );
			cov = boundCoverage( T, g, tw, uTooth, false );
			float rim = smoothstep( 0.04, 0.2, T ) * ( 1.0 - smoothstep( 0.45, 0.9, T ) );
			if ( rim > 0.0 ) {
				cov = max( cov, sprayDrops( dp, 0.05 * rim, 1.0 ) * 0.85 );
			}
			// Thicker wax on the ridges, a thinner film where it only just
			// reached into a valley: the colour itself carries the tooth.
			dens = ( 0.92 + 0.3 * smoothstep( 0.6, 3.0, T ) ) * ( 0.72 + 0.4 * tw );
			// Wax carries filler: light colours cover a dark ground.
			opac = 0.4 + 0.55 * pow( lum, 1.5 );
		} else if ( uMedium < 2.5 ) {
			// PENCIL: a thin, translucent film on the peaks, deepening as
			// layers go on; the flanks of the tooth take a lighter film.
			// A light hand lays a PALE film: with the density starting at
			// more than half, tone came from coverage alone and a light
			// stroke was a scatter of saturated specks.
			float tp = boundTooth( absPx, true );
			cov = boundCoverage( T, g, tp, uTooth, true );
			dens = ( 1.0 - 0.72 * exp( -1.6 * T ) + 0.28 * smoothstep( 1.2, 3.5, T ) ) * ( 0.8 + 0.3 * tp );
			opac = 0.12 + 0.6 * lum * lum;
		} else {
			// SPRAY: droplets at the fringe, a continuous film as it builds.
			float haze = 1.0 - exp( -1.9 * T );
			float rho = 1.0 - exp( -1.6 * T );
			float drops = sprayDrops( dp, rho, max( 0.5, uDrop ) );
			float lam = 0.55 + 0.45 * smoothstep( 0.05, 0.5, T );
			cov = mix( max( drops * 0.6, haze * 0.7 ), haze, lam );
			dens = 1.0 + 0.2 * smoothstep( 1.5, 4.0, T );
			opac = 0.5 + 0.45 * pow( lum, 1.5 );
		}
		cov = clamp( cov, 0.0, 1.0 );
		if ( cov <= 0.002 ) {
			oC = vec4( 0.0 );
			return;
		}
		vec3 col = clamp( exp( -Ku * dens ), 0.0, 1.0 );
		if ( uMedium < 1.5 ) {
			// Burnished wax catches a little light on the peaks.
			col += ( 1.0 - col ) * uSheen * 0.22 * smoothstep( 1.0, 3.0, T ) * smoothstep( 0.45, 0.85, pf.a );
		}
		if ( 1 == uHasGround ) {
			vec4 gpx = texelFetch( uGround, px, 0 );
			// Glaze and hide: the translucent part multiplies the ground,
			// the opaque part covers it. Overlay and bake lay this film
			// over the pixel (source-over), so it carries the glaze colour
			// where the ground is and the plain colour where it is not -
			// over an opaque ground exactly mix( ground, glaze, cov ).
			// Emitting the finished composite instead counted a
			// see-through ground twice: a darker box around every spray
			// over a soft wash.
			vec3 lay = gpx.rgb * col * ( 1.0 - opac ) + col * opac;
			oC = cov * vec4( gpx.a * lay + ( 1.0 - gpx.a ) * col, 1.0 );
			return;
		}
		oC = vec4( col * cov, cov );
		return;
	}
	float v = ( cu.r + cu.g + cu.b ) / 3.0;
	float body =
		pow( v, 1.5 ) * clamp( min( 3.0, T ) * 1.3 * mod2, 0.0, 1.0 ) * 0.97;
	float a = clamp( ( body + aAbs * ( 1.0 - body ) ) * gate, 0.0, 1.0 );
	// OPAQUE POWDER (pastel, chalk): every grain hides what lies under it
	// and shows its own colour, paper stays visible BETWEEN the grains.
	// As a film the powder tinted what it lay on: twelve layers of pink
	// went red, yellow over pink a clean orange like two sheets of
	// gel (analysis of 09.11.2026). The amount only decides how much of
	// the tooth the powder reaches - never the colour. The ridges first,
	// the valleys as it builds, over a SOFT threshold (velvet, not the
	// crisp break of wax); and where it lies it lies dense - a pale haze
	// over the whole stroke is the film again.
	float reliefP = 0.75 * felt + 0.25 * g;
	float reachP = 1.0 - exp( -3.5 * T );
	float softP = 0.1 + ( 1.0 - uTooth ) * 0.4;
	float thrP = 1.0 + softP - reachP * ( 1.0 + 2.0 * softP );
	float powder = smoothstep( thrP - softP, thrP + softP, reliefP ) *
		( 1.0 - exp( -8.0 * T * mod2 ) );
	// One firm pass still shows a whisper of the sheet in the valleys;
	// layers close it to velvet.
	powder *= 1.0 - 0.2 * ( 1.0 - reliefP ) * exp( -1.2 * T );
	// Dust falls off the stick at the very fringe of a stroke: specks
	// beyond the soft edge, the way charcoal and pastel dirty the sheet.
	float rim = smoothstep( 0.01, 0.05, T ) * ( 1.0 - smoothstep( 0.08, 0.16, T ) );
	float dd = rim > 0.0 ? sprayDrops( dp, 0.32 * rim, 0.75 ) * 0.55 : 0.0;
	if ( max( a, uOpaque * powder ) <= 0.003 && dd <= 0.003 ) {
		oC = vec4( 0.0 );
		return;
	}
	vec3 cAbs = clamp( 1.0 - ( 1.0 - t ) / max( aAbs, 1e-3 ), 0.0, 1.0 );
	vec3 col = mix( cAbs * aAbs, cu, body ) * gate;
	if ( uOpaque > 0.0 ) {
		// Powder is never a flat coat: the ridges stand a shade lighter
		// than the valleys, however many layers lie there - velvet.
		vec3 cp = clamp( cu * ( 1.0 + ( reliefP - 0.5 ) * 0.07 ), 0.0, 1.0 );
		col = mix( col, cp * powder, uOpaque );
		a = mix( a, powder, uOpaque );
	}
	if ( dd > a ) {
		col = a > 1e-3 ? col * ( dd / a ) : cu * dd;
		a = dd;
	}
	oC = vec4( col, a );
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

export const WET_DRY_SC = LEGACY_SC;

/**
 * @param {Object} opts    Options.
 * @param {number} opts.sc Document pixels per cell: 1 (the editor - thin
 *                         lines need it) or 2 (the default, the grid every
 *                         driver written before 09.11.2026 computes with).
 * @return {Object|null} The island, or null without WebGL2 float targets.
 */
export function createWetDryGL( opts = {} ) {
	const SC = 1 === opts.sc ? 1 : LEGACY_SC;
	const MARGIN = Math.round( MARGIN_PX / SC );
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
			throw new Error( 'wet-dry shader: ' + gl.getShaderInfoLog( sh ) );
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
			throw new Error( 'wet-dry link: ' + gl.getProgramInfoLog( p ) );
		}
		return p;
	}
	const progDeposit = program( FRAG_DEPOSIT );
	const progRender = program( fragRender( SC ) );
	const progCopy = program( FRAG_COPY );

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
		buildPaperTile( null )
	);
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
	gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );

	let texStamp = null;
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

	// What the deposits touched since the last render, and the previous
	// deposit's rect: a deposit writes its own rect AND that one, so the
	// two ping-pong sides agree everywhere outside the latest dabs.
	let dirty = null;
	let prevQ = null;
	let renderAll = true;
	const fence = createFrameFence( gl );

	const S = {
		canvas,
		// Document pixels per cell - whoever places this island's canvas
		// or maps points into its grid reads it here.
		sc: SC,
		rx: 0,
		ry: 0,
		rw: 0,
		rh: 0,
		wet: 0,
		lost: false,
		raffer: false,
		// Canvas pixels redrawn since the controller last presented them.
		drawn: null,
		// Tests only: false deposits and renders over the whole region -
		// the reference the scissored island must match.
		scissor: true,
		params: {
			tooth: 0.85,
			medium: 0,
			sheen: 0,
			piece: 13,
			flakes: 0,
			wear: 0,
			drop: 1,
			leafXf: [ 1, 0, 0, 0 ],
			opaque: 0,
		},
	};
	S.setParams = ( p ) => {
		// Every dial here is the render's: a changed one redraws it all,
		// the way every frame used to.
		for ( const k of Object.keys( p ) ) {
			if ( String( p[ k ] ) !== String( S.params[ k ] ) ) {
				renderAll = true;
			}
		}
		S.params = { ...S.params, ...p };
	};

	/** Swap the sheet (document paper); null = calibrated laid paper. */
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
			buildPaperTile( pap )
		);
		renderAll = true;
	};
	canvas.addEventListener( 'webglcontextlost', () => {
		S.lost = true;
	} );

	let D = [ null, null ];
	let cur = 0;
	let strokeCov = null;
	let stampQueue = null;
	// The batch accumulator lives as long as the region.
	let acc = null;
	let upload = new Float32Array( 0 );
	// Dry media have no drying physics; a stroke "sets" a beat after the
	// hand stops, so the wash can bake as one history entry.
	let lastStamp = 0;

	function bindQuad( prog ) {
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, quad );
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
		for ( const [ uniform, key ] of [
			[ 'uTooth', 'tooth' ],
			[ 'uMedium', 'medium' ],
			[ 'uSheen', 'sheen' ],
			[ 'uPiece', 'piece' ],
			[ 'uFlakes', 'flakes' ],
			[ 'uWear', 'wear' ],
			[ 'uDrop', 'drop' ],
			[ 'uOpaque', 'opaque' ],
		] ) {
			const loc = uloc( prog, uniform );
			if ( loc ) {
				gl.uniform1f( loc, S.params[ key ] || 0 );
			}
		}
		const xfLoc = uloc( prog, 'uLeafXf' );
		if ( xfLoc ) {
			gl.uniform4fv( xfLoc, S.params.leafXf || [ 1, 0, 0, 0 ] );
		}
	}

	function bindTex( prog, name, unit, tex ) {
		const loc = uloc( prog, name );
		if ( loc ) {
			gl.activeTexture( gl.TEXTURE0 + unit );
			gl.bindTexture( gl.TEXTURE_2D, tex );
			gl.uniform1i( loc, unit );
		}
	}

	function target1( t ) {
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			t,
			0
		);
		gl.drawBuffers( [ gl.COLOR_ATTACHMENT0 ] );
	}

	/**
	 * Feed (or clear) the ground under the island: the target layer's
	 * straight RGBA pixels, exactly the island canvas' size, document
	 * orientation - the liquid engine's contract. Null clears.
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

	S.reset = () => {
		S.setGround( null );
		D.forEach( ( t ) => t && gl.deleteTexture( t ) );
		if ( texStamp ) {
			gl.deleteTexture( texStamp );
			texStamp = null;
		}
		D = [ null, null ];
		S.rw = 0;
		S.rh = 0;
		S.wet = 0;
		strokeCov = null;
		stampQueue = null;
		acc = null;
		dirty = null;
		prevQ = null;
		renderAll = true;
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

	S.strokeBegin = () => {
		if ( strokeCov ) {
			strokeCov.fill( 0 );
		}
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
		S.stamp(
			{ data: new Float32Array( [ 1 ] ), w: 1, h: 1, gx: 0, gy: 0 },
			{ pigment: 1, kr: 0.5, kg: 0.5, kb: 0.5 }
		);
		S.steps( 1 );
		S.render();
		S.reset();
		lastStamp = 0;
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
			D = [ texFloat( S.rw, S.rh ), texFloat( S.rw, S.rh ) ];
			makeStampTex();
			cur = 0;
			gl.viewport( 0, 0, S.rw, S.rh );
			gl.disable( gl.BLEND );
			gl.clearColor( 0, 0, 0, 0 );
			for ( const side of D ) {
				target1( side );
				gl.clear( gl.COLOR_BUFFER_BIT );
			}
			strokeCov = new Float32Array( S.rw * S.rh );
			acc = new Float32Array( S.rw * S.rh );
			dirty = null;
			prevQ = null;
			renderAll = true;
			canvas.width = S.rw * SC;
			canvas.height = S.rh * SC;
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
		// The old ground no longer lines up with the grown region; the
		// controller re-feeds it right after the grow.
		S.setGround( null );
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
		dirty = rectShift( dirty, shift[ 0 ], shift[ 1 ] );
		prevQ = null; // both sides get the copy below
		renderAll = true;
		if ( stampQueue ) {
			stampQueue.x0 += shift[ 0 ];
			stampQueue.x1 += shift[ 0 ];
			stampQueue.y0 += shift[ 1 ];
			stampQueue.y1 += shift[ 1 ];
		}
		const old = D;
		const oldSize = [ S.rw, S.rh ];
		const oldCur = cur;
		S.rx = ox0;
		S.ry = oy0;
		S.rw = nw;
		S.rh = nh;
		D = [ texFloat( nw, nh ), texFloat( nw, nh ) ];
		cur = 0;
		gl.viewport( 0, 0, nw, nh );
		gl.disable( gl.BLEND );
		for ( const side of D ) {
			target1( side );
			bindQuad( progCopy );
			bindTex( progCopy, 'uT', 0, old[ oldCur ] );
			gl.uniform2i( uloc( progCopy, 'uShift' ), shift[ 0 ], shift[ 1 ] );
			gl.uniform2i(
				uloc( progCopy, 'uOldSize' ),
				oldSize[ 0 ],
				oldSize[ 1 ]
			);
			gl.drawArrays( gl.TRIANGLES, 0, 3 );
		}
		old.forEach( ( t ) => t && gl.deleteTexture( t ) );
		makeStampTex();
		canvas.width = S.rw * SC;
		canvas.height = S.rh * SC;
		return true;
	};

	S.stamp = ( map, p ) => {
		if ( ! S.rw ) {
			return;
		}
		// One batch, one pigment identity (see the liquid engine) - and
		// ONE deposit rate: pen pressure varies it per segment.
		if (
			stampQueue &&
			( stampQueue.pig[ 0 ] !== p.kr ||
				stampQueue.pig[ 1 ] !== p.kg ||
				stampQueue.pig[ 2 ] !== p.kb ||
				stampQueue.pig[ 3 ] !== p.pigment )
		) {
			S.steps( 1 );
		}
		if ( ! stampQueue ) {
			stampQueue = {
				x0: S.rw,
				y0: S.rh,
				x1: -1,
				y1: -1,
				pig: [ p.kr, p.kg, p.kb, p.pigment ],
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
				acc[ i ] += delta;
			}
		}
		q.x0 = Math.max( 0, Math.min( q.x0, dx ) );
		q.y0 = Math.max( 0, Math.min( q.y0, dy ) );
		q.x1 = Math.min( S.rw - 1, Math.max( q.x1, dx + map.w ) );
		q.y1 = Math.min( S.rh - 1, Math.max( q.y1, dy + map.h ) );
		S.wet = 1;
		lastStamp = Date.now();
	};

	S.steps = ( n ) => {
		if ( ! S.rw || S.lost || ! stampQueue ) {
			return;
		}
		void n; // dust has no time axis; only the deposit folds in
		const q = stampQueue;
		stampQueue = null;
		if ( q.x1 < q.x0 || q.y1 < q.y0 ) {
			return; // every dab fell outside the grid
		}
		const qr = { x0: q.x0, y0: q.y0, x1: q.x1, y1: q.y1 };
		const run =
			false === S.scissor
				? { x0: 0, y0: 0, x1: S.rw - 1, y1: S.rh - 1 }
				: rectUnion( qr, prevQ );
		const qw = q.x1 - q.x0 + 1;
		const qh = q.y1 - q.y0 + 1;
		if ( upload.length < qw * qh ) {
			upload = new Float32Array( qw * qh );
		}
		for ( let y = 0; y < qh; y++ ) {
			const row = ( q.y0 + y ) * S.rw + q.x0;
			upload.set( acc.subarray( row, row + qw ), y * qw );
			acc.fill( 0, row, row + qw );
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
			upload.subarray( 0, qw * qh )
		);
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		gl.enable( gl.SCISSOR_TEST );
		gl.scissor( run.x0, run.y0, run.x1 - run.x0 + 1, run.y1 - run.y0 + 1 );
		const a = cur;
		const b = 1 - cur;
		target1( D[ b ] );
		bindQuad( progDeposit );
		bindTex( progDeposit, 'uD', 0, D[ a ] );
		gl.uniform1i( uloc( progDeposit, 'uStamp' ), 3 );
		gl.uniform2i( uloc( progDeposit, 'uStampSize' ), S.rw, S.rh );
		gl.uniform4i(
			uloc( progDeposit, 'uStampRect' ),
			q.x0,
			q.y0,
			q.x1,
			q.y1
		);
		gl.uniform4f( uloc( progDeposit, 'uStampPig' ), ...q.pig );
		gl.activeTexture( gl.TEXTURE3 );
		gl.bindTexture( gl.TEXTURE_2D, texStamp );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.disable( gl.SCISSOR_TEST );
		fence.mark();
		cur = b;
		prevQ = qr;
		dirty = rectUnion( dirty, qr );
	};

	S.checkWet = () => {
		// A beat after the last dab the dust has "set".
		S.wet = Date.now() - lastStamp < 900 ? 1 : 0;
		return S.wet;
	};

	S.dryAll = () => {
		// Save/undo can flush a quick dab before the first animation frame.
		S.steps( 1 );
		lastStamp = 0;
		S.wet = 0;
	};

	S.render = () => {
		if ( ! S.rw || S.lost ) {
			return;
		}
		// Only what the deposits touched plus the render's reach; the
		// preserved drawing buffer still holds the truth everywhere else.
		let px = null;
		if ( ! renderAll && false !== S.scissor ) {
			const c = rectGrow( dirty, RENDER_PAD, S.rw, S.rh );
			if ( ! c ) {
				return;
			}
			px = {
				x: c.x0 * SC,
				y: c.y0 * SC,
				w: ( c.x1 - c.x0 + 1 ) * SC,
				h: ( c.y1 - c.y0 + 1 ) * SC,
			};
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, null );
		gl.viewport( 0, 0, canvas.width, canvas.height );
		gl.disable( gl.BLEND );
		if ( px ) {
			gl.enable( gl.SCISSOR_TEST );
			gl.scissor( px.x, canvas.height - px.y - px.h, px.w, px.h );
		}
		bindQuad( progRender );
		bindTex( progRender, 'uD', 0, D[ cur ] );
		bindTex( progRender, 'uPF', 1, texPF );
		// A dummy binding keeps the sampler unit complete without a ground.
		bindTex( progRender, 'uGround', 2, texGround || texPF );
		gl.uniform1i( uloc( progRender, 'uHasGround' ), texGround ? 1 : 0 );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.disable( gl.SCISSOR_TEST );
		S.drawn = pxUnion(
			S.drawn,
			px || { x: 0, y: 0, w: canvas.width, h: canvas.height }
		);
		dirty = null;
		renderAll = false;
		fence.mark();
	};

	S.readField = () => {
		const out = new Float32Array( S.rw * S.rh * 4 );
		gl.bindFramebuffer( gl.FRAMEBUFFER, fboRead );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			D[ cur ],
			0
		);
		gl.readPixels( 0, 0, S.rw, S.rh, gl.RGBA, gl.FLOAT, out );
		return out;
	};

	return S;
}
