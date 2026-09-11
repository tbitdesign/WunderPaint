import { waxMelt } from './materials.js';
import { ObstacleSurface } from './obstacle-surface.js';
import {
	orientCamera,
	FluidViewControls,
	artworkSize,
} from './view-controls.js';
import { VolumeView } from './volume-view.js';
import * as THREE from 'three';
import { rgb } from './simulation.js';
import { PIGMENT_SUFFIXES, decodePigment } from './pigment.js';
import { IndicatorPalette, indicatorIndex } from './influences.js';
import {
	SURFACE_GLSL,
	COLOR_GLSL,
	COLOR_FRAGMENT,
	sampleSurface,
} from './surface.js';

/** One mesh carries the simulated height, local color and optical properties. */
export class FluidRenderer {
	constructor( canvas, options = {} ) {
		this.interactive = options.interactive === true;
		this.viewEnabled = true;
		this.viewControls = this.interactive
			? new FluidViewControls( this )
			: null;
		this.canvas = canvas;
		this.renderer = new THREE.WebGLRenderer( {
			canvas,
			alpha: true,
			antialias: true,
			preserveDrawingBuffer: true,
		} );
		this.renderer.setPixelRatio( 1 );
		this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
		this.renderer.toneMappingExposure = 0.85;
		this.renderer.setClearColor( 0x000000, 0 );
		this.renderer.transmissionResolutionScale = 1;
		this.scene = new THREE.Scene();
		this.camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0.01, 20 );
		this.raycaster = new THREE.Raycaster();
		// A neutral studio and narrow softboxes give metal a readable reflection
		// without reflecting broad overexposed white panels across the water.
		const room = new THREE.Scene();
		room.background = new THREE.Color( 0x929da8 );
		for ( const [ x, y, z, width, height, power ] of [
			[ -2, 4, 6, 5, 0.65, 14 ],
			[ 5, -1, 4, 0.7, 4, 10 ],
		] ) {
			const light = new THREE.Mesh(
				new THREE.PlaneGeometry( width, height ),
				new THREE.MeshBasicMaterial( {
					color: new THREE.Color().setScalar( power ),
					side: THREE.DoubleSide,
				} )
			);
			light.position.set( x, y, z );
			light.lookAt( 0, 0, 0 );
			room.add( light );
		}
		const pmrem = new THREE.PMREMGenerator( this.renderer );
		this.env = pmrem.fromScene( room, 0.05 );
		this.scene.environment = this.env.texture;
		pmrem.dispose();
		room.traverse( ( o ) => {
			o.geometry?.dispose();
			if ( o.material ) {
				o.material.dispose();
			}
		} );
		const key = new THREE.DirectionalLight( 0xfff4e5, 1.1 );
		key.position.set( -2, 3, 5 );
		this.scene.add(
			key,
			new THREE.HemisphereLight( 0xe8f3ff, 0x313b4b, 0.3 )
		);
		this.material = new THREE.MeshPhysicalMaterial( {
			color: 0xffffff,
			envMap: this.env.texture,
			roughness: 1,
			metalness: 0,
			clearcoat: 1,
			clearcoatRoughness: 0.12,
			transmission: 0.85,
			thickness: 0.08,
			ior: 1.38,
			iridescence: 1,
			iridescenceIOR: 1.3,
			iridescenceThicknessRange: [ 120, 440 ],
			side: THREE.DoubleSide,
		} );
		this.floor = new THREE.Mesh(
			new THREE.PlaneGeometry( 1, 1 ),
			new THREE.MeshStandardMaterial( {
				color: 0xe3e9e4,
				envMap: this.env.texture,
				roughness: 0.65,
				envMapIntensity: 0.12,
			} )
		);
		this.floor.position.z = -0.045;
		this.scene.add( this.floor );
		this.width = this.height = 1;
		this.textures = [];
		this.indicatorPalette = new IndicatorPalette();
		this.uniforms = {
			fluidGrid: { value: new THREE.Vector2() },
			fluidHeight: { value: null },
			fluidObstacles: { value: null },
			fluidObstacleDistance: { value: null },
			fluidAspect: { value: 1 },
			fluidObstacleGrid: { value: new THREE.Vector2() },
			fluidHasObstacles: { value: 0 },
			fluidWater: { value: null },
			fluidOil: { value: null },
			fluidMetal: { value: null },
			fluidSilicone: { value: null },
			fluidWax: { value: null },
			fluidWaxState: { value: null },
			fluidBath: { value: new THREE.Vector3() },
			fluidGloss: { value: 0.72 },
			fluidFluorescence: { value: 0 },
			fluidTransparency: { value: 0.45 },
			fluidIridescence: { value: 0.25 },
			fluidNormalMatrix: { value: new THREE.Matrix3() },
		};
		this.material.onBeforeCompile = ( shader ) =>
			this.compile( shader, true );
		this.paperMaterial = new THREE.MeshBasicMaterial( {
			toneMapped: false,
		} );
		this.paperMaterial.onBeforeCompile = ( shader ) =>
			this.compile( shader, false );
		this.paperScene = new THREE.Scene();
		this.paperCamera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0, 2 );
		this.paperCamera.position.z = 1;
		this.paperMesh = new THREE.Mesh(
			new THREE.PlaneGeometry( 2, 2 ),
			this.paperMaterial
		);
		this.paperScene.add( this.paperMesh );
	}

	compile( shader, wet ) {
		Object.assign( shader.uniforms, this.uniforms );
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\n' + SURFACE_GLSL + COLOR_GLSL
			)
			.replace( '#include <map_fragment>', COLOR_FRAGMENT );
		if ( ! wet ) {
			return;
		}
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\n' + SURFACE_GLSL
			)
			.replace(
				'#include <begin_vertex>',
				'vec3 transformed = vec3(position.xy, fluidCubic(fluidHeight, uv).r + obstacleRelief(uv));'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
				// Artistic pigment emission, independent of the transport/force solver.
				float fluidGlowCover = 1.0 - (1.0-fluidInk)*(1.0-fluidCover)*(1.0-fluidMetalCover)*(1.0-fluidSiliconeCover)*(1.0-fluidWaxCover);
				totalEmissiveRadiance += diffuseColor.rgb * fluidFluorescence * 2.0 * fluidGlowCover * (1.0-fluidWall);`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				`
				float roughnessFactor = mix(0.06 + (1.0-fluidGloss)*0.4,
					0.04 + (1.0-fluidGloss)*0.2, fluidMetalCover);
				roughnessFactor = mix(roughnessFactor, 0.07 + (1.0-fluidGloss)*0.15, fluidSiliconeCover);
				roughnessFactor = mix(roughnessFactor, mix(0.1,0.68,fluidWaxSolid), fluidWaxCover);
				roughnessFactor = mix(roughnessFactor, 0.7, fluidWall);
			`
			)
			.replace(
				'#include <metalnessmap_fragment>',
				'float metalnessFactor = fluidMetalCover * (1.0-fluidWall) * (1.0-fluidWaxCover) * (1.0-fluidSiliconeCover);'
			)
			.replace(
				'#include <normal_fragment_maps>',
				`
				float contourDx = (obstacleRelief(vMapUv + vec2(0.001/fluidAspect,0.0)) - obstacleRelief(vMapUv - vec2(0.001/fluidAspect,0.0)))/0.002;
                float contourDy = (obstacleRelief(vMapUv - vec2(0.0,0.001)) - obstacleRelief(vMapUv + vec2(0.0,0.001)))/0.002;
                normal = normalize(fluidNormalMatrix * vec3(-fluidShape.g-contourDx, fluidShape.b+contourDy, 1.0));
				#ifdef DOUBLE_SIDED
					normal *= faceDirection;
				#endif
			`
			)
			.replace(
				'#include <clearcoat_normal_fragment_maps>',
				'#ifdef USE_CLEARCOAT\nclearcoatNormal = normal;\n#endif'
			)
			.replace(
				'#include <lights_physical_fragment>',
				THREE.ShaderChunk.lights_physical_fragment.replace(
					'material.iridescence = iridescence;',
					'material.iridescence = fluidIridescence * max(fluidCover,fluidSiliconeCover*0.4) * (1.0-fluidWaxCover) * (1.0-fluidMetalCover) * (1.0-fluidWall) * (1.0-smoothstep(0.1,0.8,fluidO.a));'
				)
			)
			.replace(
				'#include <transmission_fragment>',
				THREE.ShaderChunk.transmission_fragment.replace(
					'material.transmission = transmission;',
					'material.transmission = fluidTransparency * (1.0-fluidWaxCover*mix(0.65,1.0,fluidWaxSolid)) * (1.0-fluidSiliconeCover*0.55) * (1.0-fluidCover*0.88) * (1.0-fluidInk*0.65) * (1.0-fluidMetalCover) * (1.0-fluidWall);'
				)
			);
	}

	setSimulation( sim ) {
		this.viewControls?.dispose();
		this.volume?.dispose();
		this.volume = null;
		this.sim = sim;
		if ( sim.kind === 'volume' ) {
			this.volume = new VolumeView( this, sim );
			return;
		}
		this.waterPigment = PIGMENT_SUFFIXES.map(
			( key ) => sim[ 'water' + key ]
		);
		this.oilPigment = PIGMENT_SUFFIXES.map(
			( key ) => sim[ 'paint' + key ]
		);
		if ( this.mesh ) {
			this.scene.remove( this.mesh );
			this.mesh.geometry.dispose();
		}
		for ( const tex of this.textures ) {
			tex.dispose();
		}
		this.textures = [];
		// Half-float linear filtering is native to WebGL2. The optical fields
		// retain precision; color is reconstructed before coverage thresholds.
		const texture = ( key ) => {
			const tex = new THREE.DataTexture(
				new Uint16Array( sim.n * 4 ),
				sim.w,
				sim.h,
				THREE.RGBAFormat,
				THREE.HalfFloatType
			);
			tex.minFilter = tex.magFilter = THREE.LinearFilter;
			tex.flipY = true;
			this.textures.push( tex );
			this.uniforms[ key ].value = tex;
			return tex;
		};
		this.silicone = texture( 'fluidSilicone' );
		this.wax = texture( 'fluidWax' );
		this.waxState = texture( 'fluidWaxState' );
		this.water = texture( 'fluidWater' );
		this.oil = texture( 'fluidOil' );
		this.metal = texture( 'fluidMetal' );
		this.surface = texture( 'fluidHeight' );
		this.obstacleTexture = new THREE.DataTexture(
			sim.customObstacles.rgba,
			sim.customObstacles.w,
			sim.customObstacles.h,
			THREE.RGBAFormat
		);
		this.obstacleTexture.minFilter = this.obstacleTexture.magFilter =
			THREE.LinearFilter;
		this.obstacleTexture.flipY = true;
		this.textures.push( this.obstacleTexture );
		this.uniforms.fluidObstacles.value = this.obstacleTexture;
		this.obstacleDistance = new THREE.DataTexture(
			new Uint16Array( sim.customObstacles.w * sim.customObstacles.h ),
			sim.customObstacles.w,
			sim.customObstacles.h,
			THREE.RedFormat,
			THREE.HalfFloatType
		);
		this.obstacleDistance.minFilter = this.obstacleDistance.magFilter =
			THREE.LinearFilter;
		this.obstacleDistance.flipY = true;
		this.textures.push( this.obstacleDistance );
		this.uniforms.fluidObstacleDistance.value = this.obstacleDistance;
		this.uniforms.fluidAspect.value = sim.aspect;
		this.uniforms.fluidObstacleGrid.value.set(
			sim.customObstacles.w,
			sim.customObstacles.h
		);
		this.obstacleRevision = -1;
		this.legacyObstacleSurface = new ObstacleSurface( sim.w, sim.h );
		this.heights = new Float32Array( sim.n );
		this.obstacleSurface = new ObstacleSurface( sim.w, sim.h );
		this.uniforms.fluidGrid.value.set( sim.w, sim.h );
		this.material.map = this.water;
		this.paperMaterial.map = this.water;
		this.material.needsUpdate = this.paperMaterial.needsUpdate = true;
		// Geometry and per-pixel shading no longer inherit the coarse solver mesh.
		this.mesh = new THREE.Mesh(
			new THREE.PlaneGeometry(
				sim.aspect,
				1,
				Math.max( 160, sim.w * 2 ),
				Math.max( 120, sim.h * 2 )
			),
			this.material
		);
		this.mesh.frustumCulled = false;
		this.scene.add( this.mesh );
		this.floor.scale.set( sim.aspect, 1, 1 );
	}

	update( p ) {
		this.settings = p;
		if ( this.volume ) {
			this.volume.update( p );
			this.viewControls?.attach( this.volume.camera );
			return;
		}
		this.obstacleSurface.update( this.sim.wall );
		this.legacyObstacleSurface.update(
			this.sim.customObstacles.baseWall || this.sim.wall
		);
		this.indicatorPalette.update( p.bufferCapacity, p.indicatorColors );
		this.indicatorColors = this.indicatorPalette.spectra;
		const sim = this.sim,
			half = THREE.DataUtils.toHalfFloat;
		const water = this.water.image.data,
			oil = this.oil.image.data,
			metal = this.metal.image.data,
			surface = this.surface.image.data;
		const waterColor = [ 0, 0, 0 ],
			oilColor = [ 0, 0, 0 ],
			extraColor = [ 0, 0, 0 ];
		for ( let i = 0; i < sim.n; i++ ) {
			const melt = waxMelt( sim.temperature[ i ], p.waxMeltingPoint );
			this.waxState.image.data[ i * 4 ] = half( 1 - melt );
			for ( const key of [ 'silicone', 'wax' ] ) {
				const amount = Math.max( 0, sim[ key ][ i ] ),
					data = this[ key ].image.data;
				decodePigment( sim[ key + 'Pigments' ], i, amount, extraColor );
				for ( let c = 0; c < 3; c++ ) {
					const value =
						key === 'wax'
							? extraColor[ c ] * ( 0.72 + melt * 0.28 ) +
							  0.28 * ( 1 - melt )
							: extraColor[ c ];
					data[ i * 4 + c ] = half( value * amount );
				}
				data[ i * 4 + 3 ] = half( amount );
			}
			const m = Math.max( 0, sim.metal?.[ i ] || 0 );
			const o = Math.max( 0, sim.oilAt( i ) );
			const ink = Math.max( 0, sim.water[ i ] );
			const indicator = Math.max( 0, sim.indicator[ i ] );
			const colorIndex = indicatorIndex( sim.acid[ i ], sim.base[ i ] );
			decodePigment(
				this.waterPigment,
				i,
				ink,
				waterColor,
				this.indicatorColors[ colorIndex ],
				indicator
			);
			decodePigment( this.oilPigment, i, o, oilColor );
			for ( let c = 0; c < 3; c++ ) {
				const suffix = [ 'R', 'G', 'B' ][ c ];
				water[ i * 4 + c ] = half(
					waterColor[ c ] * ( ink + indicator )
				);
				oil[ i * 4 + c ] = half( oilColor[ c ] * o );
				metal[ i * 4 + c ] = half(
					sim[ 'metal' + suffix ]?.[ i ] || 0
				);
			}
			water[ i * 4 + 3 ] = half( ink + indicator );
			oil[ i * 4 + 3 ] = half( o );
			metal[ i * 4 + 3 ] = half( m );
			// Finite slopes at vanishing concentration prevent luminous broken rims.
			const thickness =
				o * 0.035 +
				sim.thick[ i ] * 0.018 +
				m * 0.07 +
				sim.silicone[ i ] * 0.021 +
				sim.wax[ i ] * ( 0.045 + ( 1 - melt ) * 0.012 );
			this.heights[ i ] =
				( thickness + sim.height[ i ] + sim.magnetHeight[ i ] ) *
				p.depth;
		}
		// Continue optical amounts and height through solid cells before cubic
		// reconstruction. Otherwise the missing samples imprint a grid on contact.
		for ( const texture of [
			this.water,
			this.oil,
			this.metal,
			this.silicone,
			this.wax,
			this.waxState,
		] ) {
			this.obstacleSurface.extend( texture.image.data, 4 );
		}
		this.obstacleSurface.extend( this.heights );
		for ( let i = 0; i < sim.n; i++ ) {
			this.heights[ i ] += this.legacyObstacleSurface.relief[ i ] * 0.045;
		}
		if ( this.obstacleRevision !== sim.customObstacles.revision ) {
			this.obstacleRevision = sim.customObstacles.revision;
			this.uniforms.fluidHasObstacles.value = sim.customObstacles.items
				.length
				? 1
				: 0;
			this.obstacleTexture.image.data = sim.customObstacles.rgba;
			for ( let i = 0; i < sim.customObstacles.distance.length; i++ ) {
				this.obstacleDistance.image.data[ i ] = half(
					sim.customObstacles.distance[ i ]
				);
			}
			this.obstacleTexture.needsUpdate =
				this.obstacleDistance.needsUpdate = true;
		}
		for ( let y = 0; y < sim.h; y++ ) {
			for ( let x = 0; x < sim.w; x++ ) {
				const i = y * sim.w + x;
				const l = Math.max( 0, x - 1 ),
					r = Math.min( sim.w - 1, x + 1 );
				const a = Math.max( 0, y - 1 ),
					b = Math.min( sim.h - 1, y + 1 );
				surface[ i * 4 ] = half( this.heights[ i ] );
				surface[ i * 4 + 1 ] = half(
					( ( this.heights[ y * sim.w + r ] -
						this.heights[ y * sim.w + l ] ) *
						( sim.w - 1 ) ) /
						( ( r - l ) * sim.aspect )
				);
				surface[ i * 4 + 2 ] = half(
					( ( this.heights[ b * sim.w + x ] -
						this.heights[ a * sim.w + x ] ) *
						( sim.h - 1 ) ) /
						( b - a )
				);
				surface[ i * 4 + 3 ] = half(
					sim.customObstacles.baseWall?.[ i ] ?? sim.wall[ i ]
				);
			}
		}
		for ( const tex of this.textures ) {
			if (
				tex === this.obstacleTexture ||
				tex === this.obstacleDistance
			) {
				continue;
			}
			tex.needsUpdate = true;
		}
		this.uniforms.fluidBath.value.fromArray( rgb( p.bath ) );
		this.uniforms.fluidGloss.value = p.gloss;
		this.uniforms.fluidFluorescence.value = p.fluorescence ?? 0;
		this.uniforms.fluidTransparency.value = p.transparency;
		this.uniforms.fluidIridescence.value = p.iridescence;
		this.material.envMapIntensity = p.light * 0.9;
		this.material.thickness = 0.035 + p.depth * 0.1;
		this.floor.material.color.set( p.bath );
		this.frame();
	}

	frame() {
		if ( this.volume ) {
			this.volume.frame();
			if ( this.settings ) {
				this.viewControls?.attach( this.volume.camera );
			}
			return;
		}
		if ( ! this.sim || ! this.settings ) {
			return;
		}
		const aspect = this.width / this.height;
		const size =
			this.settings.boundary === 'open'
				? artworkSize( this.settings, this.sim.aspect, aspect )
				: Math.max( 1.08, ( this.sim.aspect / aspect ) * 1.08 );
		this.camera.left = ( -size * aspect ) / 2;
		this.camera.right = ( size * aspect ) / 2;
		this.camera.top = size / 2;
		this.camera.bottom = -size / 2;
		orientCamera( this.camera, this.settings );
		this.viewControls?.attach( this.camera );
		this.uniforms.fluidNormalMatrix.value.getNormalMatrix(
			this.camera.matrixWorldInverse
		);
	}

	resize( width, height ) {
		this.width = Math.max( 2, Math.round( width ) );
		this.height = Math.max( 2, Math.round( height ) );
		this.renderer.setSize( this.width, this.height, false );
		this.frame();
	}

	render() {
		if ( this.volume ) {
			this.volume.render();
			return;
		}
		this.renderer.render( this.scene, this.camera );
	}

	pickSource( clientX, clientY ) {
		const rect = this.canvas.getBoundingClientRect();
		let nearest = null,
			distance = 20 * 20;
		for ( const source of this.sim.sources ) {
			const p = this.projectSource( source.x, source.y );
			const d =
				( p.x + rect.left - clientX ) ** 2 +
				( p.y + rect.top - clientY ) ** 2;
			if ( d <= distance ) {
				nearest = source;
				distance = d;
			}
		}
		return nearest;
	}
	setViewEnabled( value ) {
		this.viewEnabled = value;
		this.viewControls?.configure();
	}
	// Handles belong to stationary apparatus, never to the moving liquid.
	// Projection, picking and dragging all use the same fixed basin plane.
	projectSource( x, y ) {
		return this.projectPoint( x, y, 0 );
	}
	sourcePoint( clientX, clientY ) {
		return this.point( clientX, clientY, 0 );
	}
	projectPoint( x, y, planeHeight ) {
		if ( this.volume ) {
			return this.volume.projectPoint( x, y, planeHeight );
		}
		const z =
			planeHeight ??
			sampleSurface( this.heights, this.sim.w, this.sim.h, x, y ) +
				this.obstacleHeight( x, y );
		const p = new THREE.Vector3(
			( x - 0.5 ) * this.sim.aspect,
			0.5 - y,
			z
		).project( this.camera );
		return {
			x: ( p.x + 1 ) * 0.5 * this.canvas.clientWidth,
			y: ( 1 - p.y ) * 0.5 * this.canvas.clientHeight,
		};
	}

	obstacleHeight( x, y ) {
		if ( ! this.sim.customObstacles.items.length ) {
			return 0;
		}
		const model = this.sim.customObstacles;
		const d = sampleSurface( model.distance, model.w, model.h, x, y ),
			t = Math.max( 0, Math.min( 1, ( d + 0.02 ) / 0.04 ) );
		return 0.045 * ( 1 - t * t * ( 3 - 2 * t ) );
	}
	point( clientX, clientY, planeHeight ) {
		if ( this.volume ) {
			return this.volume.point( clientX, clientY, planeHeight );
		}
		const r = this.canvas.getBoundingClientRect();
		this.raycaster.setFromCamera(
			new THREE.Vector2(
				( ( clientX - r.left ) / r.width ) * 2 - 1,
				1 - ( ( clientY - r.top ) / r.height ) * 2
			),
			this.camera
		);
		const plane = new THREE.Plane(
			new THREE.Vector3( 0, 0, 1 ),
			-( planeHeight ?? 0 )
		);
		const hit = new THREE.Vector3();
		let x = 0,
			y = 0;
		for ( let k = 0; k < ( planeHeight === undefined ? 5 : 1 ); k++ ) {
			if ( ! this.raycaster.ray.intersectPlane( plane, hit ) ) {
				return null;
			}
			x = hit.x / this.sim.aspect + 0.5;
			y = 0.5 - hit.y;
			plane.constant =
				-this.obstacleHeight( x, y ) -
				sampleSurface( this.heights, this.sim.w, this.sim.h, x, y );
		}
		return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
	}

	still( width, height, output = 'wet' ) {
		const out = document.createElement( 'canvas' );
		out.width = width;
		out.height = height;
		const g = out.getContext( '2d' );
		const w = this.width,
			h = this.height;
		try {
			this.resize( width, height );
			if ( this.volume ) {
				this.volume.render( output === 'print' );
			} else if ( output === 'print' ) {
				this.renderer.render( this.paperScene, this.paperCamera );
			} else {
				this.render();
			}
			g.drawImage( this.canvas, 0, 0 );
		} finally {
			this.resize( w, h );
			this.render();
		}
		return out;
	}

	dispose() {
		this.viewControls?.dispose();
		this.volume?.dispose();
		for ( const t of this.textures ) {
			t.dispose();
		}
		this.mesh?.geometry.dispose();
		this.material.dispose();
		this.paperMaterial.dispose();
		this.paperMesh.geometry.dispose();
		this.floor.geometry.dispose();
		this.floor.material.dispose();
		this.env.dispose();
		this.renderer.dispose();
		this.renderer.forceContextLoss();
	}
}
