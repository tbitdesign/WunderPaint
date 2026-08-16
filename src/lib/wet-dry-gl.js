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
 */

const SC = 2;
const MARGIN = 128;
const MAX_CELLS = 4194304;

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
			out[ i * 4 + 3 ] = 255;
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
const FRAG_RENDER = `#version 300 es
__CHUNK__
uniform sampler2D uD;
uniform sampler2D uPF;
out vec4 oC;

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
	// coverage only ridges (high g) carry anything at all.
	float reach = T * ( 0.15 + uTooth * 1.7 * g ) / ( 0.1 + uTooth * 0.25 );
	float gate = clamp( reach, 0.0, 1.0 );
	gate = gate * gate * ( 3.0 - 2.0 * gate );
	// Grain inside the stroke: ridges darker (they carry the dust).
	float mod2 = 1.0 + ( g - 0.5 ) * uTooth * 1.4 * exp( -1.2 * T );
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
	float v = ( cu.r + cu.g + cu.b ) / 3.0;
	float body =
		pow( v, 1.5 ) * clamp( min( 3.0, T ) * 1.3 * mod2, 0.0, 1.0 ) * 0.97;
	float a = clamp( ( body + aAbs * ( 1.0 - body ) ) * gate, 0.0, 1.0 );
	if ( a <= 0.003 ) {
		oC = vec4( 0.0 );
		return;
	}
	vec3 cAbs = clamp( 1.0 - ( 1.0 - t ) / max( aAbs, 1e-3 ), 0.0, 1.0 );
	vec3 col = mix( cAbs * aAbs, cu, body ) * gate;
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

export const WET_DRY_SC = SC;

export function createWetDryGL() {
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
	const progRender = program( FRAG_RENDER );
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
		raffer: false,
		params: { tooth: 0.85 },
	};
	S.setParams = ( p ) => {
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
	};
	canvas.addEventListener( 'webglcontextlost', () => {
		S.lost = true;
	} );

	let D = [ null, null ];
	let cur = 0;
	let strokeCov = null;
	let stampQueue = null;
	// Dry media have no drying physics; a stroke "sets" a beat after the
	// hand stops, so the wash can bake as one history entry.
	let lastStamp = 0;

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
		const loc = gl.getUniformLocation( prog, 'uTooth' );
		if ( loc ) {
			gl.uniform1f( loc, S.params.tooth );
		}
	}

	function bindTex( prog, name, unit, tex ) {
		const loc = gl.getUniformLocation( prog, name );
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

	S.reset = () => {
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
		canvas.width = 1;
		canvas.height = 1;
	};

	S.hasRegion = () => S.rw > 0;

	S.strokeBegin = () => {
		if ( strokeCov ) {
			strokeCov.fill( 0 );
		}
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
			target1( D[ 0 ] );
			gl.clear( gl.COLOR_BUFFER_BIT );
			strokeCov = new Float32Array( S.rw * S.rh );
			canvas.width = S.rw * SC;
			canvas.height = S.rh * SC;
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
		target1( D[ 0 ] );
		bindQuad( progCopy );
		bindTex( progCopy, 'uT', 0, old[ oldCur ] );
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
				acc: new Float32Array( S.rw * S.rh ),
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
				q.acc[ i ] += delta;
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
		gl.disable( gl.BLEND );
		gl.viewport( 0, 0, S.rw, S.rh );
		const a = cur;
		const b = 1 - cur;
		const q = stampQueue;
		target1( D[ b ] );
		bindQuad( progDeposit );
		bindTex( progDeposit, 'uD', 0, D[ a ] );
		if ( q.x1 >= q.x0 ) {
			const qw = q.x1 - q.x0 + 1;
			const qh = q.y1 - q.y0 + 1;
			const sub = new Float32Array( qw * qh );
			for ( let y = 0; y < qh; y++ ) {
				for ( let x = 0; x < qw; x++ ) {
					sub[ y * qw + x ] = q.acc[ ( q.y0 + y ) * S.rw + q.x0 + x ];
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
			gl.uniform1i( gl.getUniformLocation( progDeposit, 'uStamp' ), 3 );
			gl.uniform2i(
				gl.getUniformLocation( progDeposit, 'uStampSize' ),
				S.rw,
				S.rh
			);
			gl.uniform4i(
				gl.getUniformLocation( progDeposit, 'uStampRect' ),
				q.x0,
				q.y0,
				q.x1,
				q.y1
			);
			gl.uniform4f(
				gl.getUniformLocation( progDeposit, 'uStampPig' ),
				...q.pig
			);
		} else {
			gl.uniform2i(
				gl.getUniformLocation( progDeposit, 'uStampSize' ),
				0,
				0
			);
		}
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		stampQueue = null;
		cur = b;
	};

	S.checkWet = () => {
		// A beat after the last dab the dust has "set".
		S.wet = Date.now() - lastStamp < 900 ? 1 : 0;
		return S.wet;
	};

	S.dryAll = () => {
		lastStamp = 0;
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
		bindTex( progRender, 'uD', 0, D[ cur ] );
		bindTex( progRender, 'uPF', 1, texPF );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
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
