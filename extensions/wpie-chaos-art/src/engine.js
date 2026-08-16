/**
 * The stage: three.js renderer for the society's command stream.
 *
 * The core (src/core) knows nothing about WebGL and the engine knows
 * nothing about decisions - it drains world.emitted every frame and turns
 * segments into instanced capsules, puffs into billboards, decay orders
 * into shrinking matter. The instance rings ARE the transience: when the
 * budget wraps, the oldest paint quietly makes room for the newest.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
	Pass,
	FullScreenQuad,
} from 'three/examples/jsm/postprocessing/Pass.js';

import { World } from './core/actors.js';
import { makeEnsemble, hireOne } from './core/styles.js';
import { MOVEMENTS } from './core/movements.js';
import { resolveMedium } from './core/media.js';
import { makeRng } from './core/rng.js';
import { makeRing } from './core/ring.js';

const SOLID_CAP = 42000;
const GLOW_CAP = 24000;
const PUFF_CAP = 16000;
const SHARD_CAP = 26000;
const SNAP_EVERY = 2.5; // wall seconds
const SNAP_EDGE = 1280; // long edge of a ring snapshot
const RECORD_CAP = 360; // seconds of process film, then the tape ends

/* ------------------------------ trail stores ------------------------------ */

/** An instanced ring of capsule-ish marks. */
class TrailStore {
	constructor( scene, cap, material, opts = {} ) {
		const geo = opts.geometry || new THREE.SphereGeometry( 1, 8, 6 );
		// Shards are flattened along their z so a box reads as a crystal
		// facet, not a brick.
		this.flatZ = opts.flatZ || 1;
		this.mesh = new THREE.InstancedMesh( geo, material, cap );
		this.mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		this.cap = cap;
		this.at = 0;
		this.used = 0;
		this.dummy = new THREE.Object3D();
		this.color = new THREE.Color();
		this.zero = new THREE.Matrix4().makeScale( 0, 0, 0 );
		scene.add( this.mesh );
	}

	writeSeg( a, b, w, color ) {
		const d = this.dummy;
		d.position.set(
			( a[ 0 ] + b[ 0 ] ) / 2,
			( a[ 1 ] + b[ 1 ] ) / 2,
			( a[ 2 ] + b[ 2 ] ) / 2
		);
		const dx = b[ 0 ] - a[ 0 ];
		const dy = b[ 1 ] - a[ 1 ];
		const dz = b[ 2 ] - a[ 2 ];
		const len = Math.hypot( dx, dy, dz );
		// Along +X, then rotated onto the segment; a touch of overlap so a
		// trail reads as one stroke, not a string of beads.
		d.scale.set( Math.max( w, len * 0.72 ), w, w * this.flatZ );
		d.quaternion.setFromUnitVectors(
			X_AXIS,
			len > 1e-6
				? TMP_V3.set( dx / len, dy / len, dz / len )
				: TMP_V3.set( 1, 0, 0 )
		);
		d.updateMatrix();
		const i = this.at;
		this.mesh.setMatrixAt( i, d.matrix );
		this.mesh.setColorAt(
			i,
			this.color.setRGB( color[ 0 ], color[ 1 ], color[ 2 ] )
		);
		this.at = ( this.at + 1 ) % this.cap;
		this.used = Math.min( this.cap, this.used + 1 );
		this.mesh.count = this.used;
	}

	/** The decayer's hand: shrink k random marks, dust the smallest away. */
	decay( k, rng ) {
		if ( ! this.used ) {
			return;
		}
		const m = new THREE.Matrix4();
		for ( let i = 0; i < k; i++ ) {
			const idx = Math.floor( rng() * this.used );
			this.mesh.getMatrixAt( idx, m );
			const sx = TMP_V3.setFromMatrixColumn( m, 0 ).length();
			if ( sx < 0.08 ) {
				this.mesh.setMatrixAt( idx, this.zero );
			} else {
				m.multiply( TMP_M4.makeScale( 0.82, 0.82, 0.82 ) );
				this.mesh.setMatrixAt( idx, m );
			}
		}
	}

	flush() {
		this.mesh.instanceMatrix.needsUpdate = true;
		if ( this.mesh.instanceColor ) {
			this.mesh.instanceColor.needsUpdate = true;
		}
	}

	clear() {
		this.at = 0;
		this.used = 0;
		this.mesh.count = 0;
	}

	dispose( scene ) {
		scene.remove( this.mesh );
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}

const X_AXIS = new THREE.Vector3( 1, 0, 0 );
const TMP_V3 = new THREE.Vector3();
const TMP_M4 = new THREE.Matrix4();

/**
 * A store per mark shape. Each geometry carries a natural axis; a mark's
 * direction turns the instance so that axis follows it ('thread' rings
 * sit ON the path like beads because the torus axis IS the path).
 */
class ShapeStore {
	constructor( scene, cap, material, geometry, axis ) {
		this.mesh = new THREE.InstancedMesh( geometry, material, cap );
		this.mesh.instanceMatrix.setUsage( THREE.DynamicDrawUsage );
		this.mesh.frustumCulled = false;
		this.mesh.count = 0;
		this.cap = cap;
		this.at = 0;
		this.used = 0;
		this.axis = axis;
		this.dummy = new THREE.Object3D();
		this.color = new THREE.Color();
		this.zero = new THREE.Matrix4().makeScale( 0, 0, 0 );
		scene.add( this.mesh );
	}

	write( p, dir, sc, color ) {
		const d = this.dummy;
		d.position.set( p[ 0 ], p[ 1 ], p[ 2 ] );
		const len = dir ? Math.hypot( dir[ 0 ], dir[ 1 ], dir[ 2 ] ) : 0;
		if ( len > 1e-6 ) {
			d.quaternion.setFromUnitVectors(
				this.axis,
				TMP_V3.set( dir[ 0 ] / len, dir[ 1 ] / len, dir[ 2 ] / len )
			);
		} else {
			d.quaternion.identity();
		}
		d.scale.set( sc[ 0 ], sc[ 1 ], sc[ 2 ] );
		d.updateMatrix();
		const i = this.at;
		this.mesh.setMatrixAt( i, d.matrix );
		this.mesh.setColorAt(
			i,
			this.color.setRGB( color[ 0 ], color[ 1 ], color[ 2 ] )
		);
		this.at = ( this.at + 1 ) % this.cap;
		this.used = Math.min( this.cap, this.used + 1 );
		this.mesh.count = this.used;
	}

	decay( k, rng ) {
		if ( ! this.used ) {
			return;
		}
		const m = new THREE.Matrix4();
		for ( let i = 0; i < k; i++ ) {
			const idx = Math.floor( rng() * this.used );
			this.mesh.getMatrixAt( idx, m );
			const sx = TMP_V3.setFromMatrixColumn( m, 0 ).length();
			if ( sx < 0.08 ) {
				this.mesh.setMatrixAt( idx, this.zero );
			} else {
				m.multiply( TMP_M4.makeScale( 0.85, 0.85, 0.85 ) );
				this.mesh.setMatrixAt( idx, m );
			}
		}
	}

	flush() {
		this.mesh.instanceMatrix.needsUpdate = true;
		if ( this.mesh.instanceColor ) {
			this.mesh.instanceColor.needsUpdate = true;
		}
	}

	clear() {
		this.at = 0;
		this.used = 0;
		this.mesh.count = 0;
	}

	dispose( scene ) {
		scene.remove( this.mesh );
		this.mesh.geometry.dispose();
		this.mesh.material.dispose();
	}
}

/** Soft billboard puffs with their own color and alpha attributes. */
class PuffStore {
	constructor( scene, cap ) {
		const geo = new THREE.InstancedBufferGeometry();
		const plane = new THREE.PlaneGeometry( 2, 2 );
		geo.index = plane.index;
		geo.attributes.position = plane.attributes.position;
		geo.attributes.uv = plane.attributes.uv;
		this.aPos = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 3 ),
			3
		);
		this.aCol = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 3 ),
			3
		);
		this.aMix = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 2 ),
			2
		);
		this.aPos.setUsage( THREE.DynamicDrawUsage );
		this.aCol.setUsage( THREE.DynamicDrawUsage );
		this.aMix.setUsage( THREE.DynamicDrawUsage );
		geo.setAttribute( 'aPos', this.aPos );
		geo.setAttribute( 'aCol', this.aCol );
		geo.setAttribute( 'aMix', this.aMix ); // x: radius, y: alpha
		const mat = new THREE.ShaderMaterial( {
			transparent: true,
			depthWrite: false,
			uniforms: {
				uFog: { value: 0.002 },
				uFogColor: { value: new THREE.Color( 0 ) },
			},
			vertexShader: `
				attribute vec3 aPos;
				attribute vec3 aCol;
				attribute vec2 aMix;
				varying vec2 vUv;
				varying vec3 vCol;
				varying float vA;
				uniform float uFog;
				void main() {
					vUv = uv;
					vCol = aCol;
					vec4 mv = modelViewMatrix * vec4( aPos, 1.0 );
					mv.xy += ( uv - 0.5 ) * 2.0 * aMix.x;
					float depth = length( mv.xyz );
					vA = aMix.y * exp( -depth * uFog * 14.0 );
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: `
				varying vec2 vUv;
				varying vec3 vCol;
				varying float vA;
				void main() {
					float d = length( vUv - 0.5 ) * 2.0;
					float soft = smoothstep( 1.0, 0.12, d );
					float a = vA * soft;
					if ( a < 0.004 ) discard;
					gl_FragColor = vec4( vCol, a );
				}`,
		} );
		this.mesh = new THREE.Mesh( geo, mat );
		this.mesh.frustumCulled = false;
		this.cap = cap;
		this.at = 0;
		this.used = 0;
		this.geo = geo;
		scene.add( this.mesh );
		geo.instanceCount = 0;
	}

	write( p, r, color, alpha ) {
		const i = this.at;
		this.aPos.array.set( p, i * 3 );
		this.aCol.array.set( color, i * 3 );
		this.aMix.array[ i * 2 ] = r;
		this.aMix.array[ i * 2 + 1 ] = alpha;
		this.at = ( this.at + 1 ) % this.cap;
		this.used = Math.min( this.cap, this.used + 1 );
		this.geo.instanceCount = this.used;
	}

	decay( k, rng ) {
		for ( let i = 0; i < k && this.used; i++ ) {
			const idx = Math.floor( rng() * this.used );
			this.aMix.array[ idx * 2 + 1 ] *= 0.8;
		}
	}

	flush() {
		this.aPos.needsUpdate = true;
		this.aCol.needsUpdate = true;
		this.aMix.needsUpdate = true;
	}

	clear() {
		this.at = 0;
		this.used = 0;
		this.geo.instanceCount = 0;
	}

	dispose( scene ) {
		scene.remove( this.mesh );
		this.geo.dispose();
		this.mesh.material.dispose();
	}
}

/* ------------------------------ stroke store ------------------------------ */

/**
 * The painterly mark: a flat, textured stroke whose long axis follows
 * the gesture ON SCREEN. Unlit on purpose - a painting is not a lit
 * scene - and the far ones fade toward the paper tone, the way real
 * air treats real paint. Textures come from a procedural atlas drawn
 * on a canvas at start-up: no asset, no request, no sameness.
 */
class StrokeStore {
	constructor( scene, cap, atlas ) {
		const geo = new THREE.InstancedBufferGeometry();
		const plane = new THREE.PlaneGeometry( 2, 2 );
		geo.index = plane.index;
		geo.attributes.position = plane.attributes.position;
		geo.attributes.uv = plane.attributes.uv;
		this.aPos = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 3 ),
			3
		);
		this.aDir = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 3 ),
			3
		);
		this.aCol = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 3 ),
			3
		);
		// x: length, y: width, z: alpha, w: atlas tile
		this.aForm = new THREE.InstancedBufferAttribute(
			new Float32Array( cap * 4 ),
			4
		);
		for ( const a of [ this.aPos, this.aDir, this.aCol, this.aForm ] ) {
			a.setUsage( THREE.DynamicDrawUsage );
		}
		geo.setAttribute( 'aPos', this.aPos );
		geo.setAttribute( 'aDir', this.aDir );
		geo.setAttribute( 'aCol', this.aCol );
		geo.setAttribute( 'aForm', this.aForm );
		const mat = new THREE.ShaderMaterial( {
			transparent: true,
			depthWrite: false,
			uniforms: {
				uAtlas: { value: atlas },
				uFog: { value: 0.004 },
				uFogColor: { value: new THREE.Color( '#efe8da' ) },
			},
			vertexShader: `
				attribute vec3 aPos;
				attribute vec3 aDir;
				attribute vec3 aCol;
				attribute vec4 aForm;
				varying vec2 vUv;
				varying vec3 vCol;
				varying float vA;
				varying float vAir;
				varying float vTile;
				uniform float uFog;
				void main() {
					vCol = aCol;
					vA = aForm.z;
					vTile = aForm.w;
					vec4 mv = modelViewMatrix * vec4( aPos, 1.0 );
					vec3 dv = normalize(
						( modelViewMatrix * vec4( aDir, 0.0 ) ).xyz + vec3( 1e-4 )
					);
					vec2 rt = normalize( dv.xy + vec2( 1e-5, 0.0 ) );
					vec2 up = vec2( -rt.y, rt.x );
					vec2 c = ( uv - 0.5 ) * 2.0;
					mv.xy += rt * c.x * aForm.x + up * c.y * aForm.y;
					float depth = length( mv.xyz );
					vAir = exp( -depth * uFog * 6.0 );
					vUv = uv;
					gl_Position = projectionMatrix * mv;
				}`,
			fragmentShader: `
				uniform sampler2D uAtlas;
				uniform vec3 uFogColor;
				varying vec2 vUv;
				varying vec3 vCol;
				varying float vA;
				varying float vAir;
				varying float vTile;
				void main() {
					float col = mod( vTile, 4.0 );
					float row = floor( vTile / 4.0 );
					vec2 tuv = ( vUv + vec2( col, row ) ) / vec2( 4.0, 2.0 );
					float a = texture2D( uAtlas, tuv ).a * vA;
					if ( a < 0.012 ) discard;
					vec3 c = mix( uFogColor, vCol, vAir );
					gl_FragColor = vec4( c, a );
				}`,
		} );
		this.mesh = new THREE.Mesh( geo, mat );
		this.mesh.frustumCulled = false;
		this.mesh.renderOrder = 2;
		this.cap = cap;
		this.at = 0;
		this.used = 0;
		this.geo = geo;
		scene.add( this.mesh );
		geo.instanceCount = 0;
	}

	write( p, dir, len, w, alpha, tile, color ) {
		const i = this.at;
		this.aPos.array.set( p, i * 3 );
		this.aDir.array.set( dir, i * 3 );
		this.aCol.array.set( color, i * 3 );
		const f = this.aForm.array;
		f[ i * 4 ] = len;
		f[ i * 4 + 1 ] = w;
		f[ i * 4 + 2 ] = alpha;
		f[ i * 4 + 3 ] = tile;
		this.at = ( this.at + 1 ) % this.cap;
		this.used = Math.min( this.cap, this.used + 1 );
		this.geo.instanceCount = this.used;
	}

	decay( k, rng ) {
		for ( let i = 0; i < k && this.used; i++ ) {
			const idx = Math.floor( rng() * this.used );
			this.aForm.array[ idx * 4 + 2 ] *= 0.82;
		}
	}

	flush() {
		this.aPos.needsUpdate = true;
		this.aDir.needsUpdate = true;
		this.aCol.needsUpdate = true;
		this.aForm.needsUpdate = true;
	}

	clear() {
		this.at = 0;
		this.used = 0;
		this.geo.instanceCount = 0;
	}

	dispose( scene ) {
		scene.remove( this.mesh );
		this.geo.dispose();
		this.mesh.material.dispose();
	}
}

/** The 4x2 stroke atlas, drawn fresh at start-up. White on alpha. */
function makeStrokeAtlas() {
	const T = 256;
	const c = document.createElement( 'canvas' );
	c.width = T * 4;
	c.height = T * 2;
	const g = c.getContext( '2d' );
	const rnd = () => Math.random();
	const tile = ( ix, iy, draw ) => {
		g.save();
		g.translate( ix * T, iy * T );
		g.beginPath();
		g.rect( 0, 0, T, T );
		g.clip();
		draw();
		g.restore();
	};
	const dab = () => {
		// A short bristle stroke: many streaks, ragged ends.
		for ( let i = 0; i < 46; i++ ) {
			const y = T / 2 + ( rnd() - 0.5 ) * T * 0.5;
			const x0 = T * ( 0.08 + rnd() * 0.2 );
			const x1 = T * ( 0.72 + rnd() * 0.2 );
			g.strokeStyle = 'rgba(255,255,255,' + ( 0.25 + rnd() * 0.5 ) + ')';
			g.lineWidth = 2 + rnd() * 7;
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo( x0, y );
			g.bezierCurveTo(
				T * 0.4,
				y + ( rnd() - 0.5 ) * 14,
				T * 0.6,
				y + ( rnd() - 0.5 ) * 14,
				x1,
				y + ( rnd() - 0.5 ) * 10
			);
			g.stroke();
		}
	};
	const wash = () => {
		// A translucent pool with the darker rim real washes dry to.
		g.beginPath();
		for ( let a = 0; a <= 24; a++ ) {
			const t = ( a / 24 ) * Math.PI * 2;
			const r = T * ( 0.3 + 0.1 * Math.sin( t * 3 + rnd() * 9 ) );
			const x = T / 2 + Math.cos( t ) * r;
			const y = T / 2 + Math.sin( t ) * r * 0.8;
			if ( a ) {
				g.lineTo( x, y );
			} else {
				g.moveTo( x, y );
			}
		}
		g.closePath();
		g.fillStyle = 'rgba(255,255,255,0.5)';
		g.fill();
		g.lineWidth = 9;
		g.strokeStyle = 'rgba(255,255,255,0.45)';
		g.stroke();
	};
	const chalk = () => {
		// Powder catching on tooth: dense specks thinning to the rim.
		for ( let i = 0; i < 3200; i++ ) {
			const x = rnd() * T;
			const y = rnd() * T;
			const d = Math.hypot( x - T / 2, y - T / 2 ) / ( T / 2 );
			if ( rnd() < d * d ) {
				continue;
			}
			g.fillStyle = 'rgba(255,255,255,' + ( 0.3 + rnd() * 0.6 ) + ')';
			g.fillRect( x, y, 1 + rnd() * 2.4, 1 + rnd() * 2.4 );
		}
	};
	const hatch = () => {
		for ( let i = 0; i < 13; i++ ) {
			const y = T * 0.12 + ( i / 13 ) * T * 0.76 + ( rnd() - 0.5 ) * 5;
			g.strokeStyle = 'rgba(255,255,255,' + ( 0.5 + rnd() * 0.4 ) + ')';
			g.lineWidth = 1.6 + rnd() * 2.2;
			g.beginPath();
			g.moveTo( T * 0.08, y + ( rnd() - 0.5 ) * 6 );
			g.lineTo( T * 0.92, y + ( rnd() - 0.5 ) * 6 );
			g.stroke();
		}
	};
	const splat = () => {
		g.fillStyle = 'rgba(255,255,255,0.92)';
		g.beginPath();
		g.arc( T / 2, T / 2, T * 0.22, 0, 7 );
		g.fill();
		for ( let i = 0; i < 16; i++ ) {
			const a = rnd() * Math.PI * 2;
			const d = T * ( 0.26 + rnd() * 0.2 );
			g.beginPath();
			g.arc(
				T / 2 + Math.cos( a ) * d,
				T / 2 + Math.sin( a ) * d,
				2 + rnd() * 9,
				0,
				7
			);
			g.fill();
		}
	};
	tile( 0, 0, dab );
	tile( 1, 0, wash );
	tile( 2, 0, chalk );
	tile( 3, 0, hatch );
	tile( 0, 1, dab );
	tile( 1, 1, wash );
	tile( 2, 1, chalk );
	tile( 3, 1, splat );
	const tex = new THREE.CanvasTexture( c );
	tex.anisotropy = 2;
	return tex;
}

/* ------------------------------ grain shader ------------------------------ */

const GrainVignetteShader = {
	uniforms: {
		tDiffuse: { value: null },
		uGrain: { value: 0.4 },
		uVignette: { value: 0.5 },
		uPaper: { value: 0 },
		uTime: { value: 0 },
	},
	vertexShader: `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
		}`,
	fragmentShader: `
		uniform sampler2D tDiffuse;
		uniform float uGrain;
		uniform float uVignette;
		uniform float uPaper;
		uniform float uTime;
		varying vec2 vUv;
		// Fract-first hash: the classic fract(sin(BIG)*43758) collapses
		// into visible stripes once its argument outgrows fp32 - and at
		// vUv*1913 dotted with 127-ish it reached the hundred thousands.
		float hash12( vec2 p ) {
			vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
			p3 += dot( p3, p3.yzx + 33.33 );
			return fract( ( p3.x + p3.y ) * p3.z );
		}
		void main() {
			vec4 c = texture2D( tDiffuse, vUv );
			float g =
				( hash12(
					vUv * vec2( 1913.0, 1021.0 ) +
						fract( uTime * 0.613 ) * 43.0
				) - 0.5 ) *
				0.14 * uGrain;
			// The tooth of the paper: STILL, and the fibers are short
			// DASHES - a per-segment value breaks them. A value per whole
			// row painted full-width ruler lines, not paper.
			float fh =
				hash12( vec2(
					floor( vUv.y * 620.0 ),
					floor( vUv.x * 26.0 )
				) ) - 0.5;
			float fv =
				hash12( vec2(
					floor( vUv.x * 540.0 ) + 91.0,
					floor( vUv.y * 26.0 )
				) ) - 0.5;
			float speck =
				hash12( floor( vUv * vec2( 833.0, 761.0 ) ) + 7.0 ) - 0.5;
			float tooth =
				( fh * 0.4 + fv * 0.3 + speck * 0.3 ) * 0.14 * uPaper;
			vec2 q = vUv - 0.5;
			float v = 1.0 - dot( q, q ) * uVignette * 1.4;
			gl_FragColor = vec4( ( c.rgb + g + tooth ) * v, c.a );
		}`,
};

/* ----------------------------- video feedback ----------------------------- */

/**
 * The Echo Chamber's heart: each frame is blended with a slightly zoomed
 * and twisted copy of the LAST OUTPUT frame - a camera filming its own
 * monitor, the feedback art of the seventies. max() instead of additive
 * keeps highlights trailing without graying the whole picture out.
 */
class FeedbackPass extends Pass {
	constructor() {
		super();
		this.uniforms = {
			tDiffuse: { value: null },
			tPrev: { value: null },
			uAmount: { value: 0 },
			uZoom: { value: 1.012 },
			uTwist: { value: 0.005 },
		};
		this.material = new THREE.ShaderMaterial( {
			uniforms: this.uniforms,
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
				}`,
			fragmentShader: `
				uniform sampler2D tDiffuse;
				uniform sampler2D tPrev;
				uniform float uAmount;
				uniform float uZoom;
				uniform float uTwist;
				varying vec2 vUv;
				void main() {
					vec4 cur = texture2D( tDiffuse, vUv );
					vec2 q = vUv - 0.5;
					float s = sin( uTwist );
					float c = cos( uTwist );
					q = mat2( c, -s, s, c ) * q / uZoom;
					vec2 uv2 = q + 0.5;
					float edge = smoothstep(
						0.0,
						0.03,
						min( min( uv2.x, uv2.y ), min( 1.0 - uv2.x, 1.0 - uv2.y ) )
					);
					vec4 prev = texture2D( tPrev, uv2 ) * edge;
					gl_FragColor = max( cur, prev * uAmount );
				}`,
		} );
		this.fsQuad = new FullScreenQuad( this.material );
		this.memA = null;
		this.memB = null;
	}

	setSize( w, h ) {
		if ( this.memA ) {
			this.memA.dispose();
			this.memB.dispose();
		}
		this.memA = new THREE.WebGLRenderTarget( w, h );
		this.memB = new THREE.WebGLRenderTarget( w, h );
	}

	render( renderer, writeBuffer, readBuffer ) {
		if ( ! this.memA ) {
			this.setSize( readBuffer.width, readBuffer.height );
		}
		this.uniforms.tDiffuse.value = readBuffer.texture;
		this.uniforms.tPrev.value = this.memA.texture;
		// Once into the chain, once into the memory for the next frame.
		renderer.setRenderTarget( this.renderToScreen ? null : writeBuffer );
		this.fsQuad.render( renderer );
		renderer.setRenderTarget( this.memB );
		this.fsQuad.render( renderer );
		const t = this.memA;
		this.memA = this.memB;
		this.memB = t;
	}

	dispose() {
		if ( this.memA ) {
			this.memA.dispose();
			this.memB.dispose();
		}
		this.material.dispose();
		this.fsQuad.dispose();
	}
}

/* --------------------------------- engine --------------------------------- */

export class ChaosEngine {
	constructor( { embed = false } = {} ) {
		// Embed manners: no recorder, no snapshot ring, the page keeps its
		// scroll wheel until the visitor takes hold, and touch can pan by.
		this.embed = embed;
		this._held = false;
		this._asleep = false;
		this.running = false;
		this.world = null;
		this.actors = [];
		this.ring = makeRing( 48 );
		this.onFrame = null;
		this._raf = 0;
		this._snapAcc = 0;
		this._dpr = Math.min( window.devicePixelRatio || 1, 1.75 );
		this._ema = 16;
		this._manualUntil = 0;
		this._recorder = null;
		this._recChunks = [];
		this._recBlob = null;
		this._painted = 0;
	}

	mount( host, aspect ) {
		this.host = host;
		this.aspect = Math.max( 0.2, Math.min( 5, aspect || 1 ) );
		this.renderer = new THREE.WebGLRenderer( {
			antialias: true,
			preserveDrawingBuffer: false,
			powerPreference: 'high-performance',
		} );
		this.canvas = this.renderer.domElement;
		this.canvas.className = 'wpiechaos-canvas';
		if ( this.embed ) {
			// The studio stylesheet is not on a foreign page; and 'none'
			// would trap a phone's scroll on the embed.
			this.canvas.style.touchAction = 'pan-y';
			this.canvas.style.display = 'block';
		}
		host.appendChild( this.canvas );
		this.scene = new THREE.Scene();
		this.camera = new THREE.PerspectiveCamera( 55, this.aspect, 1, 1200 );
		this.hemi = new THREE.HemisphereLight( 0xffffff, 0x30343f, 1.1 );
		this.scene.add( this.hemi );
		this.keyLight = new THREE.DirectionalLight( 0xfff2e0, 1.5 );
		this.keyLight.position.set( 120, 180, 80 );
		this.scene.add( this.keyLight );
		this.rimLight = new THREE.DirectionalLight( 0xbcd0ff, 0.7 );
		this.rimLight.position.set( -140, -60, -120 );
		this.scene.add( this.rimLight );

		this.solid = new TrailStore(
			this.scene,
			SOLID_CAP,
			new THREE.MeshStandardMaterial( {
				roughness: 0.55,
				metalness: 0.08,
			} )
		);
		this.glow = new TrailStore(
			this.scene,
			GLOW_CAP,
			new THREE.MeshBasicMaterial( {
				transparent: true,
				opacity: 0.85,
				blending: THREE.AdditiveBlending,
				depthWrite: false,
				// Fogged additive light would ADD the background color and
				// wash the whole scene toward it on bright grounds.
				fog: false,
			} )
		);
		this.puffs = new PuffStore( this.scene, PUFF_CAP );
		// The mark alphabet: one instanced store per shape. Y is the
		// natural axis of the lathed geometries, Z the torus hole.
		const matte = () =>
			new THREE.MeshStandardMaterial( {
				roughness: 0.5,
				metalness: 0.06,
			} );
		const Y = new THREE.Vector3( 0, 1, 0 );
		const Z = new THREE.Vector3( 0, 0, 1 );
		this.shapes = {
			ring: new ShapeStore(
				this.scene,
				14000,
				matte(),
				new THREE.TorusGeometry( 1, 0.16, 10, 28 ),
				Z
			),
			frame: new ShapeStore(
				this.scene,
				9000,
				matte(),
				new THREE.TorusGeometry( 1, 0.13, 8, 4 ),
				Z
			),
			disc: new ShapeStore(
				this.scene,
				16000,
				matte(),
				new THREE.CylinderGeometry( 1, 1, 0.16, 22 ),
				Y
			),
			hex: new ShapeStore(
				this.scene,
				12000,
				matte(),
				new THREE.CylinderGeometry( 1, 1, 0.3, 6 ),
				Y
			),
			cube: new ShapeStore(
				this.scene,
				16000,
				matte(),
				new THREE.BoxGeometry( 1, 1, 1 ),
				Y
			),
			rod: new ShapeStore(
				this.scene,
				16000,
				matte(),
				new THREE.CylinderGeometry( 0.16, 0.16, 2, 8 ),
				Y
			),
			cone: new ShapeStore(
				this.scene,
				9000,
				matte(),
				new THREE.ConeGeometry( 1, 1.7, 4 ),
				Y
			),
			dot: new ShapeStore(
				this.scene,
				14000,
				matte(),
				new THREE.SphereGeometry( 1, 10, 8 ),
				Y
			),
		};
		this.strokes = new StrokeStore( this.scene, 60000, makeStrokeAtlas() );
		this.medium = { paint: false };
		this.shards = new TrailStore(
			this.scene,
			SHARD_CAP,
			new THREE.MeshStandardMaterial( {
				roughness: 0.26,
				metalness: 0.18,
				flatShading: true,
			} ),
			{ geometry: new THREE.BoxGeometry( 1, 1, 1 ), flatZ: 0.3 }
		);

		this.composer = new EffectComposer( this.renderer );
		this.composer.addPass( new RenderPass( this.scene, this.camera ) );
		this.bloomPass = new UnrealBloomPass(
			new THREE.Vector2( 640, 360 ),
			0.4,
			0.85,
			0.82
		);
		this.composer.addPass( this.bloomPass );
		this.feedbackPass = new FeedbackPass();
		this.feedbackPass.enabled = false;
		this.composer.addPass( this.feedbackPass );
		this.bokehPass = new BokehPass( this.scene, this.camera, {
			focus: 140,
			aperture: 0.0002,
			maxblur: 0.008,
		} );
		this.composer.addPass( this.bokehPass );
		this.grainPass = new ShaderPass( GrainVignetteShader );
		this.composer.addPass( this.grainPass );
		this.composer.addPass( new OutputPass() );

		this.snapCanvas = document.createElement( 'canvas' );

		this._onResize = () => this.resize();
		this._ro = new ResizeObserver( this._onResize );
		this._ro.observe( host );
		this.resize();
		this.bindPointer();
		this._clock = new THREE.Clock();
		this.loop();
	}

	resize() {
		if ( ! this.host || ! this.renderer ) {
			return;
		}
		const hw = this.host.clientWidth || 640;
		const hh = this.host.clientHeight || 400;
		// Letterboxed to the DOCUMENT's proportions: what you watch is
		// exactly what you export.
		let w = hw;
		let h = w / this.aspect;
		if ( h > hh ) {
			h = hh;
			w = h * this.aspect;
		}
		this.canvas.style.width = w + 'px';
		this.canvas.style.height = h + 'px';
		this.renderer.setPixelRatio( this._dpr );
		this.renderer.setSize(
			Math.max( 2, Math.round( w ) ),
			Math.max( 2, Math.round( h ) ),
			false
		);
		this.composer.setSize(
			Math.max( 2, Math.round( w * this._dpr ) ),
			Math.max( 2, Math.round( h * this._dpr ) )
		);
	}

	/** Build a fresh world from the entropy pool. Clears the stage. */
	newWorld( settings, pool ) {
		this.settings = settings;
		this.world = new World( {
			rng: makeRng( pool.words ),
			params: settings.params,
		} );
		this.actors = makeEnsemble(
			this.world,
			settings.style,
			settings.params.density,
			settings.movement || null
		);
		this.world.chronicle.push( {
			e: 'born',
			style: settings.style.id,
			school: ( settings.movement || {} ).id || 'free',
			medium: ( settings.medium || {} ).id || 'sculpt',
		} );
		this.world.cursor.mode = settings.cursorMode;
		this.solid.clear();
		this.glow.clear();
		this.puffs.clear();
		this.shards.clear();
		for ( const key in this.shapes ) {
			this.shapes[ key ].clear();
		}
		this.strokes.clear();
		this.ring.clear();
		this._painted = 0;
		// A new piece gets a new film; whatever the old recorder held is
		// the previous piece and dies with it.
		this.resetRecorder();
		this.drawMoods();
		this.applyLook(
			settings.style,
			settings.fx,
			settings.ground,
			settings.movement || null,
			settings.medium || null
		);
	}

	/** Ground + fog + post dials; safe to call live. */
	applyLook( style, fx, ground, movement = null, medium = null ) {
		const mv = ( movement && movement.post ) || {};
		this.medium = medium && medium.paint ? medium : { paint: false };
		const md = ( this.medium.paint && this.medium.post ) || {};
		let bg = style.ground;
		let fog = style.fog;
		if ( ground && '#' === ground[ 0 ] ) {
			// A drawn ground: the piece stands on one of its own colors.
			bg = ground;
		} else if ( 'void' === ground ) {
			bg = '#000004';
		} else if ( 'paper' === ground ) {
			bg = '#efe8da';
		} else if ( 'mist' === ground ) {
			fog = style.fog * 3;
		} else if ( this.medium.paint && this.medium.ground ) {
			// Paint wants to sit on paper: the medium brings its tone
			// whenever the user left the ground to the style.
			bg = this.medium.ground;
		}
		this.scene.background = new THREE.Color( bg );
		if ( this.world ) {
			// The doubter paints in the ground's own color; the world
			// has to know what that is.
			const gc = new THREE.Color( bg );
			this.world.groundRgb = [ gc.r, gc.g, gc.b ];
		}
		this.scene.fog = new THREE.FogExp2( bg, fog );
		this.puffs.mesh.material.uniforms.uFog.value = fog;
		this.puffs.mesh.material.uniforms.uFogColor.value.set( bg );
		this.strokes.mesh.material.uniforms.uFog.value =
			fog * ( this.medium.air || 1 );
		this.strokes.mesh.material.uniforms.uFogColor.value.set( bg );
		this.grainPass.uniforms.uPaper.value = this.medium.paint
			? this.medium.paper || 0
			: 'paper' === ground
			? 0.3
			: 0;
		const bloom =
			fx.bloom * style.post.bloom * ( mv.bloom ?? 1 ) * ( md.bloom ?? 1 );
		this.bloomPass.strength = 1.6 * bloom;
		this.bloomPass.enabled = bloom > 0.02;
		const dof = fx.dof * style.post.dof * ( mv.dof ?? 1 ) * ( md.dof ?? 1 );
		this.bokehPass.enabled = dof > 0.02;
		this.bokehPass.materialBokeh.uniforms.maxblur.value = 0.012 * dof;
		this.grainPass.uniforms.uGrain.value =
			fx.grain * style.post.grain * ( mv.grain ?? 1 ) * ( md.grain ?? 1 );
		this.grainPass.uniforms.uVignette.value =
			fx.vignette * style.post.vignette * ( mv.vignette ?? 1 );
		// A school may bring its own feedback (futurism); the stronger
		// voice wins, its zoom and twist travel with it.
		const fb = Math.max( style.post.feedback || 0, mv.feedback || 0 );
		this.feedbackPass.enabled = fb > 0.02;
		this.feedbackPass.uniforms.uAmount.value = fb;
		const fbSrc =
			( mv.feedback || 0 ) > ( style.post.feedback || 0 )
				? mv
				: style.post;
		this.feedbackPass.uniforms.uZoom.value = 1 + ( fbSrc.fbZoom || 0.012 );
		this.feedbackPass.uniforms.uTwist.value = fbSrc.fbTwist || 0.005;
	}

	start() {
		if ( ! this.world ) {
			return;
		}
		this.running = true;
		this.startRecorder();
	}

	stop() {
		this.running = false;
		if ( this._recorder && 'recording' === this._recorder.state ) {
			try {
				this._recorder.pause();
			} catch ( e ) {}
		}
	}

	resume() {
		if ( ! this.world ) {
			return;
		}
		this.running = true;
		if ( this._recorder && 'paused' === this._recorder.state ) {
			try {
				this._recorder.resume();
			} catch ( e ) {}
		} else if ( ! this._recorder ) {
			this.startRecorder();
		}
	}

	/**
	 * Every piece lights and builds its stage anew: key light warmth,
	 * height and strength, a rim in one of the piece's own colors, and
	 * a matter mood from soft clay to hard metal. Drawn from the same
	 * entropy as everything else.
	 */
	drawMoods() {
		const w = this.world;
		if ( ! w ) {
			return;
		}
		const r = w.rng;
		const warm = r();
		const keyHue =
			warm < 0.4
				? 0.08 + r() * 0.05
				: warm < 0.7
				? 0.58 + r() * 0.06
				: r();
		const keySat = warm < 0.85 ? 0.2 + r() * 0.35 : 0.65 + r() * 0.3;
		this.keyLight.color.setHSL( keyHue, keySat, 0.62 + r() * 0.15 );
		this.keyLight.intensity = 0.8 + r() * 1.6;
		const az = r() * Math.PI * 2;
		const el = 0.15 + r() * 1.1;
		this.keyLight.position.set(
			Math.cos( az ) * Math.cos( el ) * 220,
			Math.sin( el ) * 220,
			Math.sin( az ) * Math.cos( el ) * 220
		);
		this.hemi.intensity = 0.5 + r() * 1;
		this.hemi.color.setHSL( r(), 0.08 + r() * 0.15, 0.75 );
		this.hemi.groundColor.setHSL(
			r(),
			0.15 + r() * 0.25,
			0.12 + r() * 0.1
		);
		// The rim borrows the piece's own loudest color half the time.
		if ( r() < 0.5 && w.params.colors && w.params.colors.length ) {
			let best = null;
			let bl = -1;
			for ( const hx of w.params.colors ) {
				const c = new THREE.Color( hx );
				const l = c.r + c.g + c.b;
				if ( l > bl ) {
					bl = l;
					best = c;
				}
			}
			this.rimLight.color.copy( best );
			this.rimLight.intensity = 0.4 + r() * 1;
		} else {
			this.rimLight.color.setHSL( r(), 0.2, 0.7 );
			this.rimLight.intensity = 0.2 + r() * 0.6;
		}
		// Matter: clay, satin, porcelain, velvet or metal.
		const mm = r();
		const rough =
			mm < 0.3
				? 0.92
				: mm < 0.55
				? 0.55
				: mm < 0.75
				? 0.3
				: mm < 0.9
				? 0.75
				: 0.32;
		const metal = mm < 0.75 ? 0.02 + r() * 0.1 : mm < 0.9 ? 0.15 : 0.8;
		for ( const m of [
			this.solid.mesh.material,
			this.shards.mesh.material,
		] ) {
			m.roughness = rough;
			m.metalness = metal;
		}
		for ( const key in this.shapes ) {
			this.shapes[ key ].mesh.material.roughness = rough;
			this.shapes[ key ].mesh.material.metalness = metal;
		}
	}

	/** Re-cast the ensemble on the SAME stage (density changed live). */
	recast() {
		if ( ! this.world || ! this.settings ) {
			return;
		}
		this.actors = makeEnsemble(
			this.world,
			this.settings.style,
			this.world.params.density,
			this.settings.movement || null
		);
	}

	impulse() {
		if ( ! this.world ) {
			return;
		}
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		const dir = [ r(), r(), r() ];
		const len = Math.hypot( ...dir ) || 1;
		const at =
			w.cursor.active && 'off' !== w.cursor.mode
				? w.cursor.point.slice()
				: [ r() * 60, r() * 60, r() * 60 ];
		w.impulses.push( {
			pos: at,
			dir: [ dir[ 0 ] / len, dir[ 1 ] / len, dir[ 2 ] / len ],
			power: 4200,
			dur: 1.6,
			age: 0,
		} );
	}

	/* ------------------------------ the loop ------------------------------ */

	loop() {
		this._raf = requestAnimationFrame( () => this.loop() );
		const dt = Math.min(
			0.1,
			this._clock ? this._clock.getDelta() : 0.016
		);
		let needSnap = false;
		if ( this.world && this.running ) {
			this.world.step( dt, this.actors );
			this.stageDirections();
			if ( this.world.moodJolt ) {
				this.world.moodJolt = false;
				this.upheaval();
			}
			this.drain();
			this._snapAcc += dt;
			if ( this._snapAcc >= SNAP_EVERY && ! this.embed ) {
				this._snapAcc = 0;
				needSnap = true;
			}
		}
		this.placeCamera();
		this.grainPass.uniforms.uTime.value =
			( this.world ? this.world.wall : 0 ) % 61;
		this.composer.render();
		if ( needSnap ) {
			// STRICTLY after the render, in the same task: without
			// preserveDrawingBuffer the canvas is only readable between
			// the draw and the end of the task that drew it.
			this.snapshot();
		}
		if ( this._capNext ) {
			const cb = this._capNext;
			this._capNext = null;
			cb( this.thumbUrl( 640 ) );
		}
		this.adapt( dt );
		if ( this.onFrame ) {
			this.onFrame();
		}
	}

	/**
	 * An upheaval mid-piece: new light, new matter - and when the school
	 * was left to the society, a NEW school. Painters already on stage
	 * keep their manners; the newly hired learn the new ones. A
	 * generational change, visible in the paint.
	 */
	upheaval() {
		const w = this.world;
		this.drawMoods();
		if ( this.settings && this.settings.movementAuto ) {
			this.settings.movement =
				MOVEMENTS[
					Math.floor( w.rng() * MOVEMENTS.length ) % MOVEMENTS.length
				];
			w.chronicle.push( {
				e: 'school',
				t: w.time,
				id: this.settings.movement.id,
			} );
			if ( this.settings.mediumAuto ) {
				this.settings.medium = resolveMedium(
					'auto',
					this.settings.movement
				);
			}
			this.applyLook(
				this.settings.style,
				this.settings.fx,
				this.settings.ground,
				this.settings.movement,
				this.settings.medium
			);
		}
	}

	/** The Restless one's notes: players retire, new ones walk on. */
	stageDirections() {
		const w = this.world;
		while ( w.casting.length ) {
			const d = w.casting.shift();
			const painters = this.actors.filter( ( a ) => a.isPainter );
			if ( 'retire' === d.type && painters.length > 2 ) {
				const gone =
					painters[ Math.floor( w.rng() * painters.length ) ];
				this.actors.splice( this.actors.indexOf( gone ), 1 );
			} else if ( 'hire' === d.type && painters.length < 40 ) {
				this.actors.push(
					hireOne(
						w,
						this.settings.style,
						this.settings.movement || null
					)
				);
			}
		}
	}

	drain() {
		const w = this.world;
		if ( ! w.emitted.length ) {
			return;
		}
		for ( const c of w.emitted ) {
			if ( 'seg' === c.type && this.medium.paint ) {
				// The medium turns the same gesture into paint: a flat,
				// textured stroke along the motion instead of a 3D body.
				const m = this.medium;
				const dx = c.b[ 0 ] - c.a[ 0 ];
				const dy = c.b[ 1 ] - c.a[ 1 ];
				const dz = c.b[ 2 ] - c.a[ 2 ];
				const len = Math.hypot( dx, dy, dz ) || 0.5;
				const tiles = m.tex;
				this.strokes.write(
					[
						( c.a[ 0 ] + c.b[ 0 ] ) / 2,
						( c.a[ 1 ] + c.b[ 1 ] ) / 2,
						( c.a[ 2 ] + c.b[ 2 ] ) / 2,
					],
					[ dx, dy, dz ],
					len * 0.5 * m.stretch + c.w,
					c.w * m.wmul * ( 0.8 + w.rng() * 0.7 ),
					m.alpha[ 0 ] + w.rng() * ( m.alpha[ 1 ] - m.alpha[ 0 ] ),
					tiles[
						Math.floor( w.rng() * tiles.length ) % tiles.length
					],
					c.color
				);
				this._painted++;
			} else if ( 'seg' === c.type ) {
				if ( 'shard' === c.store ) {
					this.shards.writeSeg( c.a, c.b, c.w, c.color );
					if ( c.glow > 0.5 ) {
						this.glow.writeSeg( c.a, c.b, c.w * 1.6, [
							c.color[ 0 ] * 0.25,
							c.color[ 1 ] * 0.25,
							c.color[ 2 ] * 0.25,
						] );
					}
					this._painted++;
				} else if ( 'glow' === c.store ) {
					const boost = 0.55 + c.glow;
					this.glow.writeSeg( c.a, c.b, c.w, [
						c.color[ 0 ] * boost,
						c.color[ 1 ] * boost,
						c.color[ 2 ] * boost,
					] );
				} else {
					this.solid.writeSeg( c.a, c.b, c.w, c.color );
					if ( c.glow > 0.5 ) {
						// A halo around solid paint when the sculptor turns
						// the glow up - matter that starts to burn.
						this.glow.writeSeg( c.a, c.b, c.w * 1.9, [
							c.color[ 0 ] * 0.3,
							c.color[ 1 ] * 0.3,
							c.color[ 2 ] * 0.3,
						] );
					}
				}
				this._painted++;
			} else if ( 'shape' === c.type ) {
				const store = this.shapes[ c.shape ];
				if ( store ) {
					store.write( c.p, c.dir, c.s, c.color );
					if ( c.glow > 0.6 ) {
						this.glow.writeSeg( c.p, c.p, c.s[ 0 ] * 1.4, [
							c.color[ 0 ] * 0.25,
							c.color[ 1 ] * 0.25,
							c.color[ 2 ] * 0.25,
						] );
					}
					this._painted++;
				}
			} else if ( 'puff' === c.type && this.medium.paint ) {
				const m = this.medium;
				this.strokes.write(
					c.p,
					[ w.rng() - 0.5, w.rng() - 0.5, w.rng() - 0.5 ],
					c.r * 1.3,
					c.r * 1.1,
					Math.min( 1, c.alpha * 2.4 ),
					m.tex[ 0 ],
					c.color
				);
				this._painted++;
			} else if ( 'puff' === c.type ) {
				this.puffs.write( c.p, c.r, c.color, c.alpha );
				this._painted++;
			} else if ( 'decay' === c.type ) {
				this.solid.decay( c.k, w.rng );
				this.glow.decay( Math.ceil( c.k / 2 ), w.rng );
				this.puffs.decay( c.k, w.rng );
				this.shards.decay( Math.ceil( c.k / 2 ), w.rng );
				for ( const key in this.shapes ) {
					this.shapes[ key ].decay( Math.ceil( c.k / 6 ), w.rng );
				}
				this.strokes.decay( c.k, w.rng );
			}
		}
		w.emitted.length = 0;
		this.solid.flush();
		this.glow.flush();
		this.puffs.flush();
		this.shards.flush();
		for ( const key in this.shapes ) {
			this.shapes[ key ].flush();
		}
		this.strokes.flush();
	}

	placeCamera() {
		if ( ! this.world ) {
			return;
		}
		const c = this.world.camera;
		const home = this.world.domain ? this.world.domain.center : [ 0, 0, 0 ];
		const sp = Math.sin( c.phi );
		this.camera.position.set(
			home[ 0 ] + c.radius * sp * Math.cos( c.theta ),
			home[ 1 ] + c.radius * Math.cos( c.phi ),
			home[ 2 ] + c.radius * sp * Math.sin( c.theta )
		);
		this.camera.lookAt(
			home[ 0 ] + c.look[ 0 ],
			home[ 1 ] + c.look[ 1 ],
			home[ 2 ] + c.look[ 2 ]
		);
		// The focus follows the orbit radius, so a dive pulls the world
		// into sharpness around the camera.
		this.bokehPass.materialBokeh.uniforms.focus.value = c.radius * 0.9;
	}

	adapt( dt ) {
		this._ema = this._ema * 0.95 + dt * 1000 * 0.05;
		if ( this._ema > 30 && this._dpr > 0.7 ) {
			this._dpr = Math.max( 0.7, this._dpr - 0.25 );
			this._ema = 20;
			this.resize();
		} else if (
			this._ema < 12 &&
			this._dpr < Math.min( window.devicePixelRatio || 1, 1.75 )
		) {
			this._dpr = Math.min(
				this._dpr + 0.25,
				Math.min( window.devicePixelRatio || 1, 1.75 )
			);
			this._ema = 16;
			this.resize();
		}
	}

	/* ------------------------------ pointer ------------------------------- */

	bindPointer() {
		const el = this.canvas;
		let dragging = false;
		let lx = 0;
		let ly = 0;
		let downX = 0;
		let downY = 0;
		el.addEventListener( 'pointerdown', ( e ) => {
			dragging = true;
			this._held = true;
			lx = downX = e.clientX;
			ly = downY = e.clientY;
			if ( el.setPointerCapture ) {
				el.setPointerCapture( e.pointerId );
			}
		} );
		el.addEventListener( 'pointermove', ( e ) => {
			if ( ! this.world ) {
				return;
			}
			if ( dragging ) {
				// The grip: the visitor takes the camera from the cameraman;
				// he simply keeps deciding and eases it back later.
				const cam = this.world.camera;
				cam.theta += ( e.clientX - lx ) * 0.006;
				cam.phi = Math.max(
					0.25,
					Math.min( 2.6, cam.phi + ( e.clientY - ly ) * 0.006 )
				);
				cam.thetaT = cam.theta;
				cam.phiT = cam.phi;
				lx = e.clientX;
				ly = e.clientY;
				return;
			}
			this.pointCursor( e );
		} );
		const drop = () => {
			dragging = false;
		};
		el.addEventListener( 'pointerup', ( e ) => {
			// A tap (no drag) is an impulse: the visitor pokes the world.
			if (
				dragging &&
				Math.hypot( e.clientX - downX, e.clientY - downY ) < 6
			) {
				this.impulse();
			}
			drop();
		} );
		el.addEventListener( 'pointercancel', drop );
		el.addEventListener( 'pointerleave', () => {
			drop();
			if ( this.world ) {
				this.world.cursor.active = false;
			}
		} );
		el.addEventListener(
			'wheel',
			( e ) => {
				if ( ! this.world ) {
					return;
				}
				// Embed manners: the page keeps its scroll wheel until the
				// visitor takes hold (or zooms deliberately with ctrl).
				if ( this.embed && ! this._held && ! e.ctrlKey ) {
					return;
				}
				e.preventDefault();
				const cam = this.world.camera;
				cam.radius = Math.max(
					24,
					Math.min( 300, cam.radius * ( e.deltaY > 0 ? 1.07 : 0.93 ) )
				);
				cam.radiusT = cam.radius;
			},
			{ passive: false }
		);
	}

	pointCursor( e ) {
		const r = this.canvas.getBoundingClientRect();
		const nx = ( ( e.clientX - r.left ) / Math.max( 1, r.width ) ) * 2 - 1;
		const ny = -(
			( ( e.clientY - r.top ) / Math.max( 1, r.height ) ) * 2 -
			1
		);
		TMP_V3.set( nx, ny, 0.5 ).unproject( this.camera );
		TMP_V3.sub( this.camera.position ).normalize();
		// The stir point sits on the plane through the origin, at the
		// camera's own distance - where the paint actually is.
		const dist = this.camera.position.length();
		const c = this.world.cursor;
		c.point = [
			this.camera.position.x + TMP_V3.x * dist,
			this.camera.position.y + TMP_V3.y * dist,
			this.camera.position.z + TMP_V3.z * dist,
		];
		c.active = true;
	}

	/** Hand over a thumb of the NEXT rendered frame (same-task rule). */
	captureNext( cb ) {
		this._capNext = cb;
	}

	/** A small JPEG of the canvas as it stands - call only in-task. */
	thumbUrl( edge ) {
		const src = this.canvas;
		if ( ! src.width || ! src.height ) {
			return '';
		}
		const k = Math.min( 1, edge / Math.max( src.width, src.height ) );
		const c = this.snapCanvas;
		c.width = Math.max( 2, Math.round( src.width * k ) );
		c.height = Math.max( 2, Math.round( src.height * k ) );
		c.getContext( '2d' ).drawImage( src, 0, 0, c.width, c.height );
		return c.toDataURL( 'image/jpeg', 0.85 );
	}

	/* ----------------------------- snapshots ------------------------------ */

	snapshot() {
		const src = this.canvas;
		if ( ! src.width || ! src.height ) {
			return;
		}
		const k = Math.min( 1, SNAP_EDGE / Math.max( src.width, src.height ) );
		const c = this.snapCanvas;
		c.width = Math.max( 2, Math.round( src.width * k ) );
		c.height = Math.max( 2, Math.round( src.height * k ) );
		// Same task as the composer render: the buffer is still alive
		// without preserveDrawingBuffer.
		c.getContext( '2d' ).drawImage( src, 0, 0, c.width, c.height );
		this.ring.push( {
			url: c.toDataURL( 'image/jpeg', 0.86 ),
			w: c.width,
			h: c.height,
			wall: this.world ? this.world.wall : 0,
		} );
	}

	/** A full-quality frame of the CURRENT state, in document proportions. */
	renderStill( edge = 2048 ) {
		const w0 = this.renderer.domElement.width;
		const h0 = this.renderer.domElement.height;
		const dpr0 = this.renderer.getPixelRatio();
		let w = edge;
		let h = Math.round( edge / this.aspect );
		if ( this.aspect < 1 ) {
			h = edge;
			w = Math.round( edge * this.aspect );
		}
		this.renderer.setPixelRatio( 1 );
		this.renderer.setSize( w, h, false );
		this.composer.setSize( w, h );
		this.composer.render();
		const url = this.canvas.toDataURL( 'image/png' );
		this.renderer.setPixelRatio( dpr0 );
		this.renderer.setSize( w0 / dpr0, h0 / dpr0, false );
		this.composer.setSize( w0, h0 );
		this.composer.render();
		return { url, w, h };
	}

	/* ------------------------------ recorder ------------------------------ */

	/** Throw the current tape away, silently. */
	resetRecorder() {
		window.clearTimeout( this._recStopAt );
		const rec = this._recorder;
		if ( rec ) {
			rec.ondataavailable = null;
			rec.onstop = null;
			if ( 'inactive' !== rec.state ) {
				try {
					rec.stop();
				} catch ( e ) {}
			}
		}
		this._recorder = null;
		this._recChunks = [];
		this._recBlob = null;
	}

	startRecorder() {
		if (
			this.embed ||
			this._recorder ||
			! window.MediaRecorder ||
			! this.canvas.captureStream
		) {
			return;
		}
		this._recBlob = null;
		try {
			const stream = this.canvas.captureStream( 30 );
			const mime = window.MediaRecorder.isTypeSupported(
				'video/webm;codecs=vp9'
			)
				? 'video/webm;codecs=vp9'
				: 'video/webm';
			this._recorder = new window.MediaRecorder( stream, {
				mimeType: mime,
				videoBitsPerSecond: 9000000,
			} );
			this._recChunks = [];
			this._recorder.ondataavailable = ( e ) => {
				if ( e.data && e.data.size ) {
					this._recChunks.push( e.data );
				}
			};
			this._recorder.start( 1000 );
			this._recStopAt = window.setTimeout( () => {
				// The tape has an end; the painting does not.
				if ( this._recorder && 'inactive' !== this._recorder.state ) {
					this._recorder.stop();
				}
			}, RECORD_CAP * 1000 );
		} catch ( e ) {
			this._recorder = null;
		}
	}

	/** Finalize and hand over the film. The next start records anew. */
	getRecording() {
		return new Promise( ( resolve ) => {
			if ( this._recBlob ) {
				resolve( this._recBlob );
				return;
			}
			const rec = this._recorder;
			if ( ! rec || 'inactive' === rec.state ) {
				resolve(
					this._recChunks.length
						? new Blob( this._recChunks, { type: 'video/webm' } )
						: null
				);
				return;
			}
			rec.onstop = () => {
				this._recBlob = this._recChunks.length
					? new Blob( this._recChunks, { type: 'video/webm' } )
					: null;
				this._recorder = null;
				resolve( this._recBlob );
			};
			try {
				rec.stop();
			} catch ( e ) {
				this._recorder = null;
				resolve( null );
			}
		} );
	}

	hasRecording() {
		return !! (
			this._recBlob ||
			this._recChunks.length ||
			( this._recorder && 'inactive' !== this._recorder.state )
		);
	}

	painted() {
		return this._painted;
	}

	/* ----------------------------- sleep & haste -------------------------- */

	/** Offscreen embeds sleep: no ticking, no rendering, no battery. */
	sleep() {
		if ( this._asleep ) {
			return;
		}
		this._asleep = true;
		cancelAnimationFrame( this._raf );
	}

	wake() {
		if ( ! this._asleep ) {
			return;
		}
		this._asleep = false;
		if ( this._clock ) {
			this._clock.getDelta(); // swallow the slept time
		}
		this.loop();
	}

	/**
	 * Reduced motion: live through a stretch of world time in one task and
	 * show the single frame it arrived at - a still original, no animation.
	 */
	fastForward( seconds ) {
		if ( ! this.world ) {
			return;
		}
		const steps = Math.round( seconds * 30 );
		for ( let i = 0; i < steps; i++ ) {
			this.world.step( 1 / 30, this.actors );
			this.drain();
		}
		this.placeCamera();
		this.composer.render();
	}

	/* ------------------------------- dispose ------------------------------ */

	dispose() {
		cancelAnimationFrame( this._raf );
		this.running = false;
		window.clearTimeout( this._recStopAt );
		if ( this._recorder && 'inactive' !== this._recorder.state ) {
			try {
				this._recorder.stop();
			} catch ( e ) {}
		}
		this._recorder = null;
		if ( this._ro ) {
			this._ro.disconnect();
		}
		if ( this.renderer ) {
			this.solid.dispose( this.scene );
			this.glow.dispose( this.scene );
			this.puffs.dispose( this.scene );
			this.shards.dispose( this.scene );
			for ( const key in this.shapes ) {
				this.shapes[ key ].dispose( this.scene );
			}
			this.strokes.dispose( this.scene );
			this.feedbackPass.dispose();
			this.composer.dispose();
			this.renderer.dispose();
			// The family rule: hand the context back, or ten open studios
			// later the browser starts refusing new ones.
			this.renderer.forceContextLoss();
			this.canvas.remove();
			this.renderer = null;
		}
	}
}
