/**
 * Marble Bath (wpie-marbling-studio) - the renderer.
 *
 * The picture is a per-pixel question ("where did this point come from,
 * and which drop did it land in?"), which is exactly what a fragment
 * shader is. The op history lives in one small float texture, the shader
 * walks it backwards per pixel, and the whole bath re-renders in a
 * fraction of a millisecond - combing feels like combing.
 *
 * The GLSL mirrors src/marbling.js line by line (the node tests hold the
 * JS side exact; a source-contract test keeps the two in sync). Without
 * WebGL2 the same mathematics runs on the CPU via colorAt - slower, so
 * the fallback renders smaller, but the picture is identical.
 *
 * Stills render on the live canvas at export size and are copied out in
 * the same task (no preserveDrawingBuffer), the family's proven pattern.
 */

import {
	MAX_OPS,
	OP_CODE,
	traceColor,
	replaySchedule,
	ease,
} from './marbling.js';

const VERT = `#version 300 es
void main() {
	// One triangle covers the screen; no buffers, no attributes.
	vec2 v = vec2( ( gl_VertexID << 1 ) & 2, gl_VertexID & 2 );
	gl_Position = vec4( v * 2.0 - 1.0, 0.0, 1.0 );
}
`;

const FRAG = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

uniform sampler2D uOps;   // 2 texels per op, RGBA32F
uniform int   uCount;
uniform float uLastT;     // the newest op's growth, 0..1
uniform vec3  uInks[ 8 ];
uniform vec4  uBath;      // premultiplied; w = 0 for clear water
uniform vec2  uRes;
uniform float uAspect;
uniform vec2  uLive;      // living water: amplitude, loop angle
uniform float uVeins;     // pigment: rim darkening + clouds + tone
uniform float uPaper;     // paper grain over the finished sheet

out vec4 outColor;

float mhash( vec2 q ) {
	return fract( sin( dot( q, vec2( 127.1, 311.7 ) ) ) * 43758.5453 );
}

float mnoise( vec2 q ) {
	vec2 i = floor( q );
	vec2 f = fract( q );
	f = f * f * ( 3.0 - 2.0 * f );
	return mix(
		mix( mhash( i ), mhash( i + vec2( 1.0, 0.0 ) ), f.x ),
		mix(
			mhash( i + vec2( 0.0, 1.0 ) ),
			mhash( i + vec2( 1.0, 1.0 ) ),
			f.x
		),
		f.y
	);
}

vec4 bathColor( vec2 p ) {
	// Living water: two gentle crossed sways on whole loop cycles - the
	// same wave mathematics, applied as the newest ops of all.
	if ( uLive.x > 0.0 ) {
		p.x -= uLive.x * 0.016 * sin( 6.2831853 * p.y / 0.43 + uLive.y );
		p.y -= uLive.x * 0.011 * sin( 6.2831853 * p.x / 0.57 - uLive.y );
	}
	for ( int i = 0; i < ${ MAX_OPS }; i++ ) {
		int k = uCount - 1 - i;
		if ( k < 0 ) {
			break;
		}
		vec4 A = texelFetch( uOps, ivec2( 2 * k, 0 ), 0 );
		vec4 B = texelFetch( uOps, ivec2( 2 * k + 1, 0 ), 0 );
		float s = k == uCount - 1 ? uLastT : 1.0;
		if ( s <= 0.0 ) {
			continue;
		}
		int type = int( A.x + 0.5 );
		if ( type == ${ OP_CODE.d } ) {
			vec2 d = p - A.yz;
			float r = A.w * s;
			float L2 = dot( d, d );
			if ( L2 <= r * r ) {
				// The gall drop displaces like ink but leaves water.
				if ( B.x < -0.5 ) {
					return uBath;
				}
				vec3 col = uInks[ int( B.x + 0.5 ) ];
				if ( uVeins > 0.0 ) {
					// The rim and the clouds live in the PRE-IMAGE of
					// the drop, so they survive every later combing -
					// which is exactly what real pigment does.
					float edge = sqrt( L2 ) / r;
					float rim = smoothstep( 0.7, 1.0, edge );
					float cloud = mnoise(
						d / r * 2.8 +
							vec2( float( k ) * 7.31, float( k ) * 3.17 )
					);
					float tone = 1.0 +
						( mhash( vec2( float( k ), 4.7 ) ) - 0.5 ) *
							0.14 * uVeins;
					tone *= 1.0 - uVeins * 0.13 * ( cloud * 2.0 - 1.0 );
					col *= tone * ( 1.0 - 0.34 * uVeins * rim );
				}
				return vec4( col, 1.0 );
			}
			p = A.yz + d * sqrt( 1.0 - r * r / L2 );
		} else if ( type == ${ OP_CODE.a } || type == ${ OP_CODE.o } ) {
			vec2 d = p - A.yz;
			float L = length( d );
			float R = max( 0.02, A.w );
			float dist = L - R;
			if ( type == ${ OP_CODE.o } ) {
				float sp = B.z;
				dist = mod( dist + sp * 0.5, sp ) - sp * 0.5;
			}
			float phi = ( B.x * s / R ) *
				( B.y / ( B.y + abs( dist ) ) );
			float cc = cos( -phi );
			float sn = sin( -phi );
			p = A.yz + vec2( cc * d.x - sn * d.y, sn * d.x + cc * d.y );
		} else if ( type == ${ OP_CODE.t } || type == ${ OP_CODE.c } ) {
			vec2 u = vec2( A.w, B.x );
			float e = dot( p - A.yz, vec2( -u.y, u.x ) );
			float dd = abs( e );
			if ( type == ${ OP_CODE.c } ) {
				float sp = B.w;
				dd = abs( mod( e + sp * 0.5, sp ) - sp * 0.5 );
			}
			p -= u * ( B.y * s * B.z / ( B.z + dd ) );
		} else if ( type == ${ OP_CODE.v } ) {
			vec2 d = p - A.yz;
			float L = length( d );
			float q = 1.0 + ( L / B.x ) * ( L / B.x );
			float th = -A.w * s / ( q * q );
			float c = cos( th );
			float sn = sin( th );
			p = A.yz + vec2( c * d.x - sn * d.y, sn * d.x + c * d.y );
		} else {
			vec2 u = A.yz;
			float sh =
				A.w * s * sin( 6.2831853 * dot( p, u ) / B.x + B.y );
			p -= vec2( -u.y, u.x ) * sh;
		}
	}
	return uBath;
}

void main() {
	// A fine comb folds the bath below pixel size; four samples per pixel
	// keep the classic tight patterns silky instead of gritty.
	vec2 px = vec2( 1.0 / uRes.x * uAspect, -1.0 / uRes.y );
	vec2 p = vec2(
		gl_FragCoord.x / uRes.x * uAspect,
		1.0 - gl_FragCoord.y / uRes.y
	);
	outColor =
		( bathColor( p + px * vec2( -0.25, -0.25 ) ) +
			bathColor( p + px * vec2( 0.25, -0.25 ) ) +
			bathColor( p + px * vec2( -0.25, 0.25 ) ) +
			bathColor( p + px * vec2( 0.25, 0.25 ) ) ) *
		0.25;
	// Paper grain: a faint tooth over the finished sheet, ink and bath
	// alike (only where something is - premultiplied rgb).
	if ( uPaper > 0.0 && outColor.a > 0.0 ) {
		float g =
			mnoise( gl_FragCoord.xy * 0.71 ) * 0.72 +
			mnoise( gl_FragCoord.xy * 2.9 ) * 0.28;
		outColor.rgb *= 1.0 + ( g * 2.0 - 1.0 ) * 0.055 * uPaper;
	}
}
`;

const hexRgb = ( h ) => [
	parseInt( h.slice( 1, 3 ), 16 ) / 255,
	parseInt( h.slice( 3, 5 ), 16 ) / 255,
	parseInt( h.slice( 5, 7 ), 16 ) / 255,
];

/** Pack the op list into the 2-texels-per-op float layout. */
export function packOps( ops ) {
	const data = new Float32Array( MAX_OPS * 2 * 4 );
	ops.forEach( ( op, k ) => {
		const o = k * 8;
		const code = OP_CODE[ op[ 0 ] ];
		data[ o ] = code;
		if ( 0 === code ) {
			data[ o + 1 ] = op[ 1 ];
			data[ o + 2 ] = op[ 2 ];
			data[ o + 3 ] = op[ 3 ];
			data[ o + 4 ] = op[ 4 ];
		} else if ( 1 === code || 2 === code ) {
			data[ o + 1 ] = op[ 1 ];
			data[ o + 2 ] = op[ 2 ];
			data[ o + 3 ] = op[ 3 ];
			data[ o + 4 ] = op[ 4 ];
			data[ o + 5 ] = op[ 5 ];
			data[ o + 6 ] = op[ 6 ];
			data[ o + 7 ] = 2 === code ? op[ 7 ] : 0;
		} else if ( 3 === code ) {
			data[ o + 1 ] = op[ 1 ];
			data[ o + 2 ] = op[ 2 ];
			data[ o + 3 ] = op[ 3 ];
			data[ o + 4 ] = op[ 4 ];
		} else {
			for ( let j = 1; j <= 6; j++ ) {
				if ( undefined !== op[ j ] ) {
					data[ o + j ] = op[ j ];
				}
			}
		}
	} );
	return data;
}

export class MarblingEngine {
	constructor( canvas ) {
		this.canvas = canvas;
		this.state = {
			ops: [],
			inks: [],
			bath: '#f0e8d6',
			bathClear: false,
			aspect: 4 / 3,
			veins: 0.45,
			paper: 0.22,
		};
		this.partial = { count: 0, lastT: 1 };
		this.live = { amp: 0, theta: 0 };
		this._disposed = false;

		const gl = canvas.getContext( 'webgl2', {
			alpha: true,
			antialias: false,
			premultipliedAlpha: true,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance',
		} );
		this.gl = gl;
		this.cpu = ! gl;
		if ( this.cpu ) {
			this.ctx2d = canvas.getContext( '2d' );
			return;
		}

		const make = ( type, src ) => {
			const sh = gl.createShader( type );
			gl.shaderSource( sh, src );
			gl.compileShader( sh );
			if ( ! gl.getShaderParameter( sh, gl.COMPILE_STATUS ) ) {
				throw new Error( gl.getShaderInfoLog( sh ) || 'shader' );
			}
			return sh;
		};
		const prog = gl.createProgram();
		gl.attachShader( prog, make( gl.VERTEX_SHADER, VERT ) );
		gl.attachShader( prog, make( gl.FRAGMENT_SHADER, FRAG ) );
		gl.linkProgram( prog );
		if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS ) ) {
			throw new Error( gl.getProgramInfoLog( prog ) || 'link' );
		}
		gl.useProgram( prog );
		this.prog = prog;
		this.loc = {};
		for ( const name of [
			'uOps',
			'uCount',
			'uLastT',
			'uBath',
			'uRes',
			'uAspect',
			'uLive',
			'uVeins',
			'uPaper',
		] ) {
			this.loc[ name ] = gl.getUniformLocation( prog, name );
		}
		// A uniform ARRAY is portably addressed by its first element -
		// the bare name comes back null on some implementations, and a
		// null location swallows the upload without a word (every ink
		// rendered black until this line existed).
		this.loc.uInks =
			gl.getUniformLocation( prog, 'uInks[0]' ) ||
			gl.getUniformLocation( prog, 'uInks' );
		this.tex = gl.createTexture();
		gl.activeTexture( gl.TEXTURE0 );
		gl.bindTexture( gl.TEXTURE_2D, this.tex );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE );
		gl.texParameteri( gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE );
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA32F,
			MAX_OPS * 2,
			1,
			0,
			gl.RGBA,
			gl.FLOAT,
			packOps( [] )
		);
		gl.uniform1i( this.loc.uOps, 0 );
	}

	/** The bath's full state; uploads the history texture. */
	setState( s ) {
		this.state = { ...this.state, ...s };
		this.partial = { count: this.state.ops.length, lastT: 1 };
		if ( ! this.cpu ) {
			const gl = this.gl;
			gl.bindTexture( gl.TEXTURE_2D, this.tex );
			gl.texSubImage2D(
				gl.TEXTURE_2D,
				0,
				0,
				0,
				MAX_OPS * 2,
				1,
				gl.RGBA,
				gl.FLOAT,
				packOps( this.state.ops )
			);
		}
	}

	/** Replay progress: render only `count` ops, the newest grown to t. */
	setPartial( count, lastT ) {
		this.partial = { count, lastT };
	}

	setLive( amp, theta ) {
		this.live = { amp, theta };
	}

	resize( w, h ) {
		const pr = Math.min( window.devicePixelRatio || 1, 2 );
		const bw = Math.max( 2, Math.round( w * pr ) );
		const bh = Math.max( 2, Math.round( h * pr ) );
		// The CPU fallback pays per pixel; it renders smaller and lets CSS
		// scale up - the veins stay smooth, the wait stays short.
		const cap = this.cpu ? 480 : 4096;
		const k = Math.min( 1, cap / Math.max( bw, bh ) );
		this.canvas.width = Math.round( bw * k );
		this.canvas.height = Math.round( bh * k );
	}

	render() {
		if ( this._disposed ) {
			return;
		}
		const { ops, inks, bath, bathClear, aspect } = this.state;
		if ( this.cpu ) {
			this._renderCpu( ops, inks, bath, bathClear, aspect );
			return;
		}
		const gl = this.gl;
		const w = this.canvas.width;
		const h = this.canvas.height;
		gl.viewport( 0, 0, w, h );
		gl.useProgram( this.prog );
		gl.uniform1i( this.loc.uCount, this.partial.count );
		gl.uniform1f( this.loc.uLastT, this.partial.lastT );
		const flat = new Float32Array( 24 );
		inks.forEach( ( c, i ) => {
			if ( i < 8 ) {
				flat.set( hexRgb( c ), i * 3 );
			}
		} );
		gl.uniform3fv( this.loc.uInks, flat );
		const b = hexRgb( bath );
		gl.uniform4f(
			this.loc.uBath,
			bathClear ? 0 : b[ 0 ],
			bathClear ? 0 : b[ 1 ],
			bathClear ? 0 : b[ 2 ],
			bathClear ? 0 : 1
		);
		gl.uniform2f( this.loc.uRes, w, h );
		gl.uniform1f( this.loc.uAspect, aspect );
		gl.uniform2f( this.loc.uLive, this.live.amp, this.live.theta );
		gl.uniform1f( this.loc.uVeins, this.state.veins );
		gl.uniform1f( this.loc.uPaper, this.state.paper );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
	}

	_renderCpu( ops, inks, bath, bathClear, aspect ) {
		const w = this.canvas.width;
		const h = this.canvas.height;
		const img = this.ctx2d.createImageData( w, h );
		const px = img.data;
		const rgb = inks.map( ( c ) => hexRgb( c ).map( ( v ) => v * 255 ) );
		const bg = hexRgb( bath ).map( ( v ) => Math.round( v * 255 ) );
		const opt = this.partial;
		const veins = this.state.veins;
		const fract = ( v ) => v - Math.floor( v );
		const mh = ( qx, qy ) =>
			fract( Math.sin( qx * 127.1 + qy * 311.7 ) * 43758.5453 );
		const smooth = ( t ) => t * t * ( 3 - 2 * t );
		const mn = ( qx, qy ) => {
			const ix = Math.floor( qx );
			const iy = Math.floor( qy );
			const fx = smooth( qx - ix );
			const fy = smooth( qy - iy );
			return (
				( mh( ix, iy ) * ( 1 - fx ) + mh( ix + 1, iy ) * fx ) *
					( 1 - fy ) +
				( mh( ix, iy + 1 ) * ( 1 - fx ) + mh( ix + 1, iy + 1 ) * fx ) *
					fy
			);
		};
		for ( let gy = 0; gy < h; gy++ ) {
			const y = ( gy + 0.5 ) / h;
			for ( let gx = 0; gx < w; gx++ ) {
				const tr = traceColor(
					ops,
					( ( gx + 0.5 ) / w ) * aspect,
					y,
					opt
				);
				const o = ( gy * w + gx ) * 4;
				if ( tr.ink >= 0 ) {
					let f = 1;
					if ( veins > 0 ) {
						const rim =
							tr.edge <= 0.7
								? 0
								: smooth(
										Math.min( 1, ( tr.edge - 0.7 ) / 0.3 )
								  );
						const cloud = mn(
							tr.u * 2.8 + tr.k * 7.31,
							tr.v * 2.8 + tr.k * 3.17
						);
						f =
							( 1 + ( mh( tr.k, 4.7 ) - 0.5 ) * 0.14 * veins ) *
							( 1 - veins * 0.13 * ( cloud * 2 - 1 ) ) *
							( 1 - 0.34 * veins * rim );
					}
					px[ o ] = Math.min( 255, rgb[ tr.ink ][ 0 ] * f );
					px[ o + 1 ] = Math.min( 255, rgb[ tr.ink ][ 1 ] * f );
					px[ o + 2 ] = Math.min( 255, rgb[ tr.ink ][ 2 ] * f );
					px[ o + 3 ] = 255;
				} else if ( ! bathClear ) {
					px[ o ] = bg[ 0 ];
					px[ o + 1 ] = bg[ 1 ];
					px[ o + 2 ] = bg[ 2 ];
					px[ o + 3 ] = 255;
				}
			}
		}
		this.ctx2d.putImageData( img, 0, 0 );
	}

	/**
	 * A still at any size, copied out in the same task. The CPU path caps
	 * the size; the GPU path renders the exact pixels asked for.
	 */
	renderStill( w, h ) {
		const ow = this.canvas.width;
		const oh = this.canvas.height;
		const cap = this.cpu ? 900 : 4096;
		const k = Math.min( 1, cap / Math.max( w, h ) );
		this.canvas.width = Math.round( w * k );
		this.canvas.height = Math.round( h * k );
		this.render();
		const out = document.createElement( 'canvas' );
		out.width = w;
		out.height = h;
		const g = out.getContext( '2d' );
		g.imageSmoothingQuality = 'high';
		g.drawImage( this.canvas, 0, 0, w, h );
		this.canvas.width = ow;
		this.canvas.height = oh;
		this.render();
		return out;
	}

	/**
	 * The film: either the making of the bath, replayed (drops patter in,
	 * strokes sweep through), or the finished bath on living water - one
	 * seamless loop. Records the live canvas, the family's pattern.
	 */
	recordVideo( { width, height, fps = 30, mode, params } ) {
		return new Promise( ( resolve, reject ) => {
			if ( this.cpu ) {
				reject( new Error( 'video needs WebGL2' ) );
				return;
			}
			const mimes = [
				'video/webm;codecs=vp9',
				'video/webm;codecs=vp8',
				'video/webm',
			];
			const mime = mimes.find(
				( m ) =>
					window.MediaRecorder &&
					window.MediaRecorder.isTypeSupported &&
					window.MediaRecorder.isTypeSupported( m )
			);
			if ( ! mime ) {
				reject( new Error( 'recording unsupported' ) );
				return;
			}
			const ow = this.canvas.width;
			const oh = this.canvas.height;
			this.canvas.width = width;
			this.canvas.height = height;
			let stream;
			try {
				stream = this.canvas.captureStream( fps );
			} catch ( e ) {
				this.canvas.width = ow;
				this.canvas.height = oh;
				reject( e );
				return;
			}
			const rec = new window.MediaRecorder( stream, {
				mimeType: mime,
				videoBitsPerSecond: 12000000,
			} );
			const chunks = [];
			rec.ondataavailable = ( e ) => {
				if ( e.data && e.data.size ) {
					chunks.push( e.data );
				}
			};
			const finish = ( err ) => {
				this.canvas.width = ow;
				this.canvas.height = oh;
				this.setPartial( this.state.ops.length, 1 );
				this.setLive( 0, 0 );
				this.render();
				if ( err ) {
					reject( err );
				} else {
					resolve( {
						blob: new Blob( chunks, { type: mime } ),
						ext: 'webm',
					} );
				}
			};
			rec.onerror = () => finish( new Error( 'recorder error' ) );
			rec.onstop = () => finish();
			const ops = this.state.ops;
			const sched = replaySchedule( ops );
			const total =
				'water' === mode ? params.loop : sched.total + sched.hold;
			let start = 0;
			const step = ( now ) => {
				if ( this._disposed ) {
					try {
						rec.stop();
					} catch ( e ) {}
					return;
				}
				if ( ! start ) {
					start = now;
				}
				const t = ( now - start ) / 1000;
				if ( 'water' === mode ) {
					this.setPartial( ops.length, 1 );
					this.setLive(
						params.waterAmp,
						( 2 * Math.PI * t ) / params.loop
					);
				} else {
					let count = 0;
					let lastT = 1;
					for ( let i = 0; i < ops.length; i++ ) {
						if ( t >= sched.starts[ i ] ) {
							count = i + 1;
							lastT = ease(
								( t - sched.starts[ i ] ) /
									Math.max( 0.001, sched.durations[ i ] )
							);
						}
					}
					this.setPartial( count, lastT );
				}
				this.render();
				if ( t >= total + 0.1 ) {
					try {
						rec.stop();
					} catch ( e ) {}
					return;
				}
				window.requestAnimationFrame( step );
			};
			rec.start( 200 );
			window.requestAnimationFrame( step );
		} );
	}

	dispose() {
		this._disposed = true;
		if ( this.gl ) {
			const ext = this.gl.getExtension( 'WEBGL_lose_context' );
			if ( ext ) {
				ext.loseContext();
			}
		}
	}
}
