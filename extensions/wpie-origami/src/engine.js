/**
 * The scene: a sheet of real paper on a real table, folding itself.
 *
 * Every face of the figure is its own little mesh - front and back,
 * because origami paper has two designs - and each frame they are
 * placed by the transforms the fold engine hands over, pushed apart a
 * hair along their normals so forty layers of zero-thickness paper
 * read as a stack instead of a shimmer.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
	foldState,
	stackHeights,
	foldOrientations,
	foldBounds,
	paperTo3d,
} from './core/fold.js';

const LAYER = 0.0016;

export const LIGHTS = [ 'soft', 'warm', 'dramatic', 'studio' ];
export const GROUNDS = [ 'shadow', 'plane', 'mirror', 'none' ];
export const VIEWS = {
	reader: { yaw: 18, pitch: 55 },
	front: { yaw: 0, pitch: 78 },
	quarter: { yaw: -35, pitch: 50 },
	flat: { yaw: 0, pitch: 88 },
};

const easeInOut = ( t ) =>
	t < 0.5 ? 4 * t * t * t : 1 - Math.pow( -2 * t + 2, 3 ) / 2;

export class OrigamiEngine {
	constructor( canvas ) {
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer( {
			canvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true,
		} );
		this.renderer.toneMapping = THREE.NoToneMapping;
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = true;
		this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		this.scene = new THREE.Scene();
		const env = new RoomEnvironment();
		const pmrem = new THREE.PMREMGenerator( this.renderer );
		this.scene.environment = pmrem.fromScene( env, 0.04 ).texture;
		this.scene.environmentIntensity = 0.55;

		this.camera = new THREE.PerspectiveCamera( 36, 1, 0.01, 50 );
		this.params = {
			yaw: 20,
			pitch: 55,
			zoom: 1,
			light: 'soft',
			ground: 'shadow',
			background: null,
			progress: 0,
		};

		this.paperGroup = new THREE.Group();
		this.scene.add( this.paperGroup );
		this._lights();
		this._ground();
		this._faces = [];
		this._anim = null;
		this.onProgress = null;

		this.frontTex = null;
		this.backTex = null;
	}

	/* ------------------------------ dressing ------------------------------ */

	_lights() {
		this.hemi = new THREE.HemisphereLight( 0xffffff, 0xb8b0a4, 0.5 );
		this.key = new THREE.DirectionalLight( 0xffffff, 1.6 );
		this.key.position.set( 0.9, 1.6, 0.7 );
		this.key.castShadow = true;
		this.key.shadow.mapSize.set( 2048, 2048 );
		this.key.shadow.camera.left = -1.2;
		this.key.shadow.camera.right = 1.2;
		this.key.shadow.camera.top = 1.2;
		this.key.shadow.camera.bottom = -1.2;
		this.key.shadow.bias = -0.0004;
		this.key.shadow.normalBias = 0.004;
		this.fill = new THREE.DirectionalLight( 0xffffff, 0.35 );
		this.fill.position.set( -1.1, 0.8, -0.6 );
		this.scene.add( this.hemi, this.key, this.fill );
	}

	setLight( kind ) {
		this.params.light = kind;
		const k = this.key;
		if ( 'soft' === kind ) {
			k.intensity = 1.6;
			k.position.set( 0.9, 1.6, 0.7 );
			this.hemi.intensity = 0.5;
			this.fill.intensity = 0.35;
			this.scene.environmentIntensity = 0.55;
		} else if ( 'warm' === kind ) {
			k.intensity = 1.9;
			k.color.set( 0xffe0b8 );
			k.position.set( 1.2, 0.9, 0.4 );
			this.hemi.intensity = 0.35;
			this.fill.intensity = 0.25;
			this.scene.environmentIntensity = 0.4;
		} else if ( 'dramatic' === kind ) {
			k.intensity = 2.6;
			k.color.set( 0xffffff );
			k.position.set( 1.5, 1.1, -0.9 );
			this.hemi.intensity = 0.14;
			this.fill.intensity = 0.1;
			this.scene.environmentIntensity = 0.25;
		} else {
			k.intensity = 2.1;
			k.color.set( 0xffffff );
			k.position.set( 0, 2, 0.15 );
			this.hemi.intensity = 0.6;
			this.fill.intensity = 0.5;
			this.scene.environmentIntensity = 0.7;
		}
		if ( 'warm' !== kind && 'dramatic' !== kind ) {
			k.color.set( 0xffffff );
		}
	}

	_ground() {
		const geo = new THREE.PlaneGeometry( 8, 8 );
		this.shadowMat = new THREE.ShadowMaterial( { opacity: 0.3 } );
		this.planeMat = new THREE.MeshStandardMaterial( {
			color: 0xded7cb,
			roughness: 0.95,
		} );
		this.groundMesh = new THREE.Mesh( geo, this.shadowMat );
		this.groundMesh.rotation.x = -Math.PI / 2;
		this.groundMesh.position.y = -0.002;
		this.groundMesh.receiveShadow = true;
		this.scene.add( this.groundMesh );
	}

	setGround( kind ) {
		this.params.ground = kind;
		this.groundMesh.visible = 'none' !== kind;
		this.groundMesh.material =
			'plane' === kind || 'mirror' === kind
				? this.planeMat
				: this.shadowMat;
		this.planeMat.color.set( 'mirror' === kind ? 0xb9c2c9 : 0xded7cb );
		this.planeMat.roughness = 'mirror' === kind ? 0.25 : 0.95;
		this.planeMat.metalness = 'mirror' === kind ? 0.6 : 0;
	}

	setBackground( color ) {
		this.params.background = color;
		this.scene.background = color ? new THREE.Color( color ) : null;
	}

	/* ------------------------------- figure ------------------------------- */

	setFigure( figure ) {
		this.figure = figure;
		for ( const f of this._faces ) {
			this.paperGroup.remove( f.front, f.back );
			f.geo.dispose();
		}
		this._faces = [];
		const frontMat = new THREE.MeshStandardMaterial( {
			map: this.frontTex,
			roughness: 0.88,
			side: THREE.FrontSide,
		} );
		const backMat = new THREE.MeshStandardMaterial( {
			map: this.backTex,
			roughness: 0.88,
			side: THREE.BackSide,
		} );
		this.frontMat = frontMat;
		this.backMat = backMat;
		for ( const pts of figure.faces ) {
			const n = pts.length;
			const pos = new Float32Array( n * 3 );
			const uv = new Float32Array( n * 2 );
			pts.forEach( ( pt, i ) => {
				const p = paperTo3d( pt );
				pos[ 3 * i ] = p[ 0 ];
				pos[ 3 * i + 1 ] = p[ 1 ];
				pos[ 3 * i + 2 ] = p[ 2 ];
				uv[ 2 * i ] = pt[ 0 ];
				uv[ 2 * i + 1 ] = pt[ 1 ];
			} );
			const idx = [];
			for ( let i = 2; i < n; i++ ) {
				idx.push( 0, i, i - 1 );
			}
			const geo = new THREE.BufferGeometry();
			geo.setAttribute( 'position', new THREE.BufferAttribute( pos, 3 ) );
			geo.setAttribute( 'uv', new THREE.BufferAttribute( uv, 2 ) );
			geo.setIndex( idx );
			geo.computeVertexNormals();
			const front = new THREE.Mesh( geo, frontMat );
			const back = new THREE.Mesh( geo, backMat );
			for ( const m of [ front, back ] ) {
				m.castShadow = true;
				m.receiveShadow = true;
				m.matrixAutoUpdate = false;
			}
			this.paperGroup.add( front, back );
			this._faces.push( { geo, front, back } );
		}
		// Stack heights are ORDER values with gaps (a fold can jump a
		// piece from 0 to 5). For display only the order matters, so
		// compress each step's values to gapless ranks - otherwise the
		// gaps become visible air between layers that are really
		// touching.
		const compress = ( row ) => {
			const pos = [ ...new Set( row.filter( ( v ) => v > 0 ) ) ].sort(
				( a, b ) => a - b
			);
			const neg = [ ...new Set( row.filter( ( v ) => v < 0 ) ) ].sort(
				( a, b ) => b - a
			);
			const map = new Map();
			pos.forEach( ( v, i ) => map.set( v, i + 1 ) );
			neg.forEach( ( v, i ) => map.set( v, -( i + 1 ) ) );
			map.set( 0, 0 );
			return row.map( ( v ) => map.get( v ) );
		};
		this.heights = stackHeights( figure ).map( compress );
		this.orients = foldOrientations( figure );
		this.setProgress( 0 );
	}

	/**
	 * Both sides of the paper. The back canvas must already be drawn
	 * MIRRORED - the geometry is seen from behind.
	 */
	setPaper( frontCanvas, backCanvas ) {
		if ( ! this.frontTex ) {
			this.frontTex = new THREE.CanvasTexture( frontCanvas );
			this.backTex = new THREE.CanvasTexture( backCanvas );
			for ( const t of [ this.frontTex, this.backTex ] ) {
				t.flipY = false;
				t.colorSpace = THREE.SRGBColorSpace;
				t.anisotropy = 4;
			}
		}
		if ( this.frontMat ) {
			this.frontMat.map = this.frontTex;
			this.backMat.map = this.backTex;
			this.frontMat.needsUpdate = true;
			this.backMat.needsUpdate = true;
		}
		this.paperDirty();
	}

	paperDirty() {
		if ( this.frontTex ) {
			this.frontTex.needsUpdate = true;
			this.backTex.needsUpdate = true;
		}
	}

	/* ------------------------------ folding ------------------------------- */

	setProgress( p ) {
		const total = this.figure ? this.figure.steps.length : 0;
		p = Math.min( Math.max( p, 0 ), total );
		this.params.progress = p;
		if ( ! this.figure ) {
			return;
		}
		const { transforms } = foldState( this.figure, p );
		const k = Math.floor( p );
		const t = easeInOut( p - k );
		const hPre = this.heights[ k ];
		const hPost = this.heights[ Math.min( k + 1, total ) ];
		const oPre = this.orients[ k ];
		const oPost = this.orients[ Math.min( k + 1, total ) ];
		const m = new THREE.Matrix4();
		let minH = 0;
		for ( let f = 0; f < this._faces.length; f++ ) {
			const tr = transforms[ f ];
			// The stack offset rides IN FRONT OF the fold transform: a
			// face is lifted off the sheet by its stack height (signed
			// by which way up it lies at rest, so the offset ends up
			// global again in every flat state) and then folded. That
			// way a turning packet keeps its layers apart in ANY
			// orientation - offsetting the folded result globally
			// collapses the gaps the moment the packet leaves the
			// table, and forty coplanar layers shimmer.
			const a = hPre[ f ] * oPre[ f ];
			const b = hPost[ f ] * oPost[ f ];
			const off = ( a + ( b - a ) * t ) * LAYER;
			minH = Math.min( minH, a, b );
			const r = tr.r;
			m.set(
				r[ 0 ],
				r[ 1 ],
				r[ 2 ],
				tr.t[ 0 ] + r[ 1 ] * off,
				r[ 3 ],
				r[ 4 ],
				r[ 5 ],
				tr.t[ 1 ] + r[ 4 ] * off,
				r[ 6 ],
				r[ 7 ],
				r[ 8 ],
				tr.t[ 2 ] + r[ 7 ] * off,
				0,
				0,
				0,
				1
			);
			this._faces[ f ].front.matrix.copy( m );
			this._faces[ f ].back.matrix.copy( m );
		}
		// Keep the whole model above the table.
		const { lo, hi } = foldBounds( this.figure, transforms );
		this.paperGroup.position.y =
			Math.max( 0, -lo[ 1 ] ) + Math.max( 0, -minH ) * LAYER + 0.001;
		// The camera orbits the model's middle, not the table point -
		// a standing model otherwise swings around a fixed spot near
		// its feet instead of turning around itself.
		this._lookY = this.paperGroup.position.y + ( lo[ 1 ] + hi[ 1 ] ) / 2;
		if ( this.onProgress ) {
			this.onProgress( p );
		}
	}

	animateTo( target, speed = 1.4 ) {
		this.stop();
		const from = this.params.progress;
		const dist = Math.abs( target - from );
		if ( dist < 1e-4 ) {
			this.setProgress( target );
			return Promise.resolve();
		}
		const dur = Math.min( 2600, ( 650 * dist ) / ( speed * 0.75 ) );
		return new Promise( ( done ) => {
			const t0 = performance.now();
			const tick = ( now ) => {
				const u = Math.min( 1, ( now - t0 ) / dur );
				this.setProgress( from + ( target - from ) * u );
				if ( u < 1 ) {
					this._anim = requestAnimationFrame( tick );
				} else {
					this._anim = null;
					done();
				}
			};
			this._anim = requestAnimationFrame( tick );
		} );
	}

	async play() {
		this.stop();
		this._playing = true;
		const total = this.figure.steps.length;
		if ( this.params.progress >= total - 1e-4 ) {
			this.setProgress( 0 );
		}
		while ( this._playing ) {
			const next = Math.min(
				total,
				Math.floor( this.params.progress + 1e-4 ) + 1
			);
			// A step with many part-folds gets more time - the eye has
			// to follow each flap, not watch a blur of five.
			const rots = ( this.figure.steps[ next - 1 ].rotations || [] )
				.length;
			await this.animateTo(
				next,
				Math.max( 0.55, 1.4 / ( 1 + 0.35 * ( rots - 1 ) ) )
			);
			if ( next >= total ) {
				break;
			}
			await new Promise( ( r ) => setTimeout( r, 350 ) );
		}
		this._playing = false;
	}

	stop() {
		this._playing = false;
		if ( this._anim ) {
			cancelAnimationFrame( this._anim );
			this._anim = null;
		}
	}

	/* ------------------------------- camera ------------------------------- */

	setView( { yaw, pitch, zoom } ) {
		if ( undefined !== yaw ) {
			this.params.yaw = yaw;
		}
		if ( undefined !== pitch ) {
			this.params.pitch = pitch;
		}
		if ( undefined !== zoom ) {
			this.params.zoom = zoom;
		}
	}

	_placeCamera() {
		const { yaw, pitch, zoom } = this.params;
		const dist = 2.6 / ( zoom || 1 );
		const ya = ( yaw * Math.PI ) / 180;
		const pa = ( Math.min( 89, Math.max( 4, pitch ) ) * Math.PI ) / 180;
		const lookY = undefined === this._lookY ? 0.04 : this._lookY;
		const y = lookY + Math.sin( pa ) * dist;
		const r = Math.cos( pa ) * dist;
		this.camera.position.set( Math.sin( ya ) * r, y, Math.cos( ya ) * r );
		this.camera.lookAt( 0, lookY, 0 );
	}

	resize( w, h ) {
		this.renderer.setSize( w, h, false );
		this.renderer.setPixelRatio(
			Math.min( 2, window.devicePixelRatio || 1 )
		);
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
	}

	render() {
		this._placeCamera();
		this.renderer.render( this.scene, this.camera );
	}

	/** A still of the model alone, on nothing, for the canvas. */
	snapshot( size = 1200 ) {
		const canvas = document.createElement( 'canvas' );
		canvas.width = size;
		canvas.height = size;
		const r = new THREE.WebGLRenderer( {
			canvas,
			antialias: true,
			alpha: true,
			preserveDrawingBuffer: true,
		} );
		r.toneMapping = THREE.NoToneMapping;
		r.outputColorSpace = THREE.SRGBColorSpace;
		r.shadowMap.enabled = true;
		r.shadowMap.type = THREE.PCFSoftShadowMap;
		const wasGround = this.groundMesh.visible;
		const wasBg = this.scene.background;
		this.groundMesh.visible = false;
		this.scene.background = null;
		const cam = this.camera.clone();
		cam.aspect = 1;
		cam.updateProjectionMatrix();
		this._placeCamera();
		cam.position.copy( this.camera.position );
		cam.lookAt( 0, undefined === this._lookY ? 0.04 : this._lookY, 0 );
		r.render( this.scene, cam );
		const url = canvas.toDataURL( 'image/png' );
		this.groundMesh.visible = wasGround;
		this.scene.background = wasBg;
		// One renderer per export: without releasing the context too,
		// every saved still would strand one and the preview dies after
		// a handful of exports.
		r.dispose();
		r.forceContextLoss();
		return url;
	}

	dispose() {
		this.stop();
		for ( const f of this._faces ) {
			f.geo.dispose();
		}
		if ( this.frontTex ) {
			this.frontTex.dispose();
			this.backTex.dispose();
		}
		// dispose() frees the buffers but NOT the WebGL context - the
		// browser holds ~16 and drops the oldest, so a studio opened and
		// closed a few times would go black. (Bug class from 2026-07-11,
		// fixed in Mockup and 3D Text back then; swept across the family
		// on 2026-08-01.)
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}
