import { VolumeContact } from './volume-contact.js';
import { ObstacleMeshes } from './obstacle-meshes.js';
import { waxMelt } from './materials.js';
import { roundedObstacleProfile } from './obstacle-surface.js';
import { orientCamera, artworkSize } from './view-controls.js';
import { DyeVolume } from './dye-volume.js';
import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

/**
 * Isosurfaces are reconstructed from the actual 3D phase distribution.
 * The translucent vessel reveals internal dye volumes and detached drops.
 */
export class VolumeView {
	constructor( owner, sim ) {
		this.owner = owner;
		this.sim = sim;
		this.scene = new THREE.Scene();
		this.scene.environment = owner.env.texture;
		this.customObstacles = new ObstacleMeshes( this.scene );
		this.camera = new THREE.OrthographicCamera( -1, 1, 1, -1, 0.01, 20 );
		this.camera.up.set( 0, 0, 1 );
		this.raycaster = new THREE.Raycaster();
		const light = new THREE.DirectionalLight( 0xfff4e6, 2.4 );
		light.position.set( -2, -2, 5 );
		this.scene.add(
			light,
			new THREE.HemisphereLight( 0xd8ebff, 0x647688, 1.1 )
		);
		this.size = sim.spacing >= 0.089 ? 38 : 56;
		this.extent = [ sim.aspect + 0.24, 1.24, 1.26 ];
		this.contact = new VolumeContact( sim, this.size, this.extent );
		this.meshes = [];
		this.waxWhite = new THREE.Color( 0xffffff );
		for ( let phase = 0; phase < 6; phase++ ) {
			const material = new THREE.MeshPhysicalMaterial( {
				color: 0xffffff,
				vertexColors: phase !== 0,
				roughness: phase === 2 ? 0.12 : 0.14,
				metalness: phase === 2 ? 1 : 0,
				clearcoat: 1,
				clearcoatRoughness: 0.06,
				transmission:
					phase === 0
						? 0.7
						: phase === 4
						? 0.28
						: phase === 1 || phase === 5
						? 0.12
						: 0,
				transparent: phase === 0,
				opacity: phase === 0 ? 0.32 : 1,
				depthWrite: phase !== 0,
				thickness: phase === 0 ? 0.35 : 0.08,
				ior: phase === 0 ? 1.333 : phase === 4 ? 1.405 : 1.46,
				envMapIntensity: 0.85,
				side: THREE.FrontSide,
			} );
			// Match surface emission using the actual local pigment, never the
			// unpigmented carrier water, vessel or source handles.
			const glow = { value: 0 };
			material.userData.fluorescence = glow;
			material.onBeforeCompile = ( shader ) => {
				this.contact.compile( shader );
				shader.uniforms.fluidFluorescence = glow;
				shader.fragmentShader = shader.fragmentShader
					.replace(
						'#include <common>',
						'#include <common>\nuniform float fluidFluorescence;'
					)
					.replace(
						'#include <emissivemap_fragment>',
						'#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * fluidFluorescence * 2.0;'
					);
			};
			const mesh =
				phase === 3
					? new DyeVolume( this.size, this.extent )
					: new MarchingCubes(
							this.size,
							material,
							false,
							phase !== 0,
							65000
					  );
			if ( phase === 3 ) {
				material.dispose();
			}
			mesh.isolation = phase === 3 ? 0.15 : 0.43;
			mesh.scale.set(
				this.extent[ 0 ] / 2,
				this.extent[ 1 ] / 2,
				this.extent[ 2 ] / 2
			);
			mesh.position.set( 0, 0, 0.55 );
			mesh.frustumCulled = false;
			mesh.renderOrder = phase === 0 ? 5 : phase === 3 ? 2 : 0;
			this.scene.add( mesh );
			this.meshes.push( mesh );
		}
		const floor = new THREE.Mesh(
			new THREE.PlaneGeometry( sim.aspect + 0.13, 1.13 ),
			new THREE.MeshStandardMaterial( {
				color: 0xd9e3e6,
				roughness: 0.36,
				metalness: 0.1,
			} )
		);
		floor.position.z = -0.018;
		this.floor = floor;
		this.scene.add( floor );
		// Fine glass edges describe depth without hiding the liquid behind an
		// opaque sidewall. They belong to the export as well as the preview.
		const outline = new THREE.LineSegments(
			new THREE.EdgesGeometry(
				new THREE.BoxGeometry( sim.aspect + 0.07, 1.07, 0.6 )
			),
			new THREE.LineBasicMaterial( {
				color: 0x8caeb8,
				transparent: true,
				opacity: 0.45,
			} )
		);
		outline.position.z = 0.29;
		this.scene.add( outline );
		this.outline = outline;
		this.bubbles = new THREE.InstancedMesh(
			new THREE.SphereGeometry( 1, 12, 8 ),
			new THREE.MeshPhysicalMaterial( {
				color: 0xc8f6ff,
				metalness: 0.15,
				roughness: 0.04,
				transparent: true,
				opacity: 0.6,
				clearcoat: 1,
			} ),
			200
		);
		this.crystals = new THREE.InstancedMesh(
			new THREE.OctahedronGeometry( 1, 0 ),
			new THREE.MeshPhysicalMaterial( {
				color: 0x91eaff,
				roughness: 0.18,
				metalness: 0.2,
				clearcoat: 1,
				flatShading: true,
			} ),
			2400
		);
		this.obstacles = new THREE.InstancedMesh(
			new THREE.LatheGeometry(
				roundedObstacleProfile().map(
					( p ) => new THREE.Vector2( ...p )
				),
				64
			),
			new THREE.MeshStandardMaterial( {
				color: 0x647884,
				roughness: 0.3,
				metalness: 0.45,
			} ),
			40
		);
		this.bubbles.frustumCulled =
			this.crystals.frustumCulled =
			this.obstacles.frustumCulled =
				false;
		this.scene.add( this.bubbles, this.crystals, this.obstacles );
		this.object = new THREE.Object3D();
		this.color = new THREE.Color();
		this.depthTarget = new THREE.WebGLRenderTarget( 2, 2, {
			depthBuffer: true,
		} );
		this.depthTarget.depthTexture = new THREE.DepthTexture( 2, 2 );
		this.depthMaterial = new THREE.MeshDepthMaterial();
		this.meshes[ 3 ].material.uniforms.occlusion.value =
			this.depthTarget.depthTexture;
	}
	update( settings ) {
		this.settings = settings;
		this.customObstacles.update( this.sim.customObstacles );
		this.contact.update();
		this.sim.settings = settings;
		const sim = this.sim,
			size = this.size,
			[ sx, sy, sz ] = this.extent;
		for ( const mesh of this.meshes ) {
			mesh.reset();
		}
		const color = [ 1, 1, 1 ],
			linear = this.color;
		const support = sim.spacing * 1.7;
		const active = [ true, true, true, true, false, false ];
		let waxAmount = 0,
			waxLiquid = 0;
		for ( let i = 0; i < sim.count; i++ ) {
			const phase = sim.phase[ i ];
			sim.colorAt( i, color );
			linear.setRGB( ...color, THREE.SRGBColorSpace );
			const px = ( ( sim.x[ i ] + 0.12 ) / sx ) * size;
			const py = ( ( 1.12 - sim.y[ i ] ) / sy ) * size;
			const pz = ( ( sim.z[ i ] + 0.08 ) / sz ) * size;
			const rx = ( support / sx ) * size,
				ry = ( support / sy ) * size,
				rz = ( support / sz ) * size;
			if ( phase === 4 ) {
				const melt = waxMelt(
					sim.temperature[ i ],
					settings.waxMeltingPoint
				);
				linear.lerp( this.waxWhite, 0.28 * ( 1 - melt ) );
				waxAmount++;
				waxLiquid += melt;
			}
			const mesh = this.meshes[ phase >= 3 ? phase + 1 : phase ];
			active[ phase >= 3 ? phase + 1 : phase ] = true;
			const cloud =
				phase === 0
					? Math.min(
							1,
							sim.dye[ i ] +
								sim.indicator[ i ] +
								sim.reactive[ i ]
					  )
					: 0;
			for (
				let z = Math.max( 1, Math.floor( pz - rz ) );
				z <= Math.min( size - 2, pz + rz );
				z++
			) {
				for (
					let y = Math.max( 1, Math.floor( py - ry ) );
					y <= Math.min( size - 2, py + ry );
					y++
				) {
					for (
						let x = Math.max( 1, Math.floor( px - rx ) );
						x <= Math.min( size - 2, px + rx );
						x++
					) {
						const q =
							( ( x - px ) / rx ) ** 2 +
							( ( y - py ) / ry ) ** 2 +
							( ( z - pz ) / rz ) ** 2;
						if ( q >= 1 ) {
							continue;
						}
						const value = ( 1 - q ) ** 3,
							j = x + size * ( y + size * z );
						mesh.field[ j ] += value;
						if ( phase !== 0 ) {
							mesh.palette[ j * 3 ] += value * linear.r;
							mesh.palette[ j * 3 + 1 ] += value * linear.g;
							mesh.palette[ j * 3 + 2 ] += value * linear.b;
						}
						if ( cloud > 0.001 ) {
							const dye = this.meshes[ 3 ],
								amount = value * cloud;
							dye.field[ j ] += amount;
							dye.palette[ j * 3 ] += amount * linear.r;
							dye.palette[ j * 3 + 1 ] += amount * linear.g;
							dye.palette[ j * 3 + 2 ] += amount * linear.b;
						}
					}
				}
			}
		}
		for ( let phase = 0; phase < 6; phase++ ) {
			const mesh = this.meshes[ phase ];
			mesh.visible = active[ phase ];
			if ( ! active[ phase ] ) {
				continue;
			}
			if ( phase !== 3 ) {
				this.contact.extend( mesh );
			}
			if ( phase !== 0 ) {
				for ( let j = 0; j < mesh.field.length; j++ ) {
					if ( mesh.field[ j ] > 0 ) {
						for ( let k = 0; k < 3; k++ ) {
							mesh.palette[ j * 3 + k ] /= mesh.field[ j ];
						}
					}
				}
			}
			mesh.update();
			if ( phase === 3 ) {
				mesh.material.uniforms.fluorescence.value =
					settings.fluorescence ?? 0;
			} else {
				mesh.material.userData.fluorescence.value =
					phase === 0 ? 0 : settings.fluorescence ?? 0;
			}
			mesh.material.roughness = Math.max(
				0.045,
				0.34 - settings.gloss * 0.28
			);
			mesh.material.envMapIntensity = settings.light;
		}
		this.meshes[ 5 ].material.roughness =
			0.1 + 0.55 * ( 1 - waxLiquid / Math.max( 1, waxAmount ) );
		this.meshes[ 5 ].material.transmission =
			( 0.12 * waxLiquid ) / Math.max( 1, waxAmount );
		this.meshes[ 0 ].material.opacity = 0.48 - settings.transparency * 0.32;
		this.meshes[ 1 ].material.iridescence = settings.iridescence;
		this.floor.material.color.set( settings.bath );
		this.outline.visible = settings.boundary !== 'open';
		const o = this.object;
		this.bubbles.count = sim.bubbles.length;
		sim.bubbles.forEach( ( b, i ) => {
			o.position.set( b.x - sim.aspect / 2, 0.5 - b.y, b.z );
			o.rotation.set( 0, 0, 0 );
			o.scale.setScalar(
				Math.min( 0.045, 0.009 + Math.cbrt( b.amount ) * 0.018 )
			);
			o.updateMatrix();
			this.bubbles.setMatrixAt( i, o.matrix );
		} );
		let crystals = 0;
		for ( let i = 0; i < sim.count; i++ ) {
			if ( sim.crystal[ i ] < 0.015 ) {
				continue;
			}
			o.position.set(
				sim.x[ i ] - sim.aspect / 2,
				0.5 - sim.y[ i ],
				sim.z[ i ]
			);
			o.rotation.set( i * 0.31, i * 1.17, i * 0.67 );
			const radius = sim.spacing * Math.cbrt( sim.crystal[ i ] ) * 0.65;
			o.scale.set( radius, radius, radius * 1.8 );
			o.updateMatrix();
			this.crystals.setMatrixAt( crystals++, o.matrix );
		}
		this.crystals.count = crystals;
		this.obstacles.count = sim.obstacles.length;
		sim.obstacles.forEach( ( p, i ) => {
			o.position.set(
				( p.x - 0.5 ) * sim.aspect,
				0.5 - p.y,
				p.height / 2
			);
			o.rotation.set( Math.PI / 2, 0, 0 );
			o.scale.set( p.radius, p.height, p.radius );
			o.updateMatrix();
			this.obstacles.setMatrixAt( i, o.matrix );
		} );
		this.bubbles.instanceMatrix.needsUpdate =
			this.crystals.instanceMatrix.needsUpdate =
			this.obstacles.instanceMatrix.needsUpdate =
				true;
		this.frame();
	}
	frame( top = false ) {
		const aspect = this.owner.width / this.owner.height;
		const settings = this.settings || this.owner.settings;
		const size =
			settings?.boundary === 'open'
				? artworkSize( settings, this.sim.aspect, aspect, true, top )
				: Math.max( 1.65, ( this.sim.aspect + 0.55 ) / aspect );
		this.camera.left = ( -size * aspect ) / 2;
		this.camera.right = ( size * aspect ) / 2;
		this.camera.top = size / 2;
		this.camera.bottom = -size / 2;
		orientCamera(
			this.camera,
			this.settings || this.owner.settings || { volumeAngle: 55 },
			true,
			top
		);
	}
	render( top = false ) {
		this.frame( top );
		const engine = this.owner.renderer;
		const width = this.owner.width,
			height = this.owner.height;
		if (
			this.depthTarget.width !== width ||
			this.depthTarget.height !== height
		) {
			this.depthTarget.setSize( width, height );
		}
		const cloud = this.meshes[ 3 ];
		cloud.material.uniforms.resolution.value.set( width, height );
		this.camera.getWorldDirection(
			cloud.material.uniforms.direction.value
		);
		const previous = engine.getRenderTarget();
		try {
			this.meshes[ 0 ].visible =
				cloud.visible =
				this.bubbles.visible =
					false;
			this.scene.overrideMaterial = this.depthMaterial;
			engine.setRenderTarget( this.depthTarget );
			engine.render( this.scene, this.camera );
		} finally {
			engine.setRenderTarget( previous );
			this.scene.overrideMaterial = null;
			this.meshes[ 0 ].visible =
				cloud.visible =
				this.bubbles.visible =
					true;
		}
		engine.render( this.scene, this.camera );
	}
	projectPoint( x, y, planeHeight ) {
		const p = new THREE.Vector3(
			( x - 0.5 ) * this.sim.aspect,
			0.5 - y,
			planeHeight ?? this.sim.level()
		).project( this.camera );
		return {
			x: ( p.x + 1 ) * this.owner.canvas.clientWidth * 0.5,
			y: ( 1 - p.y ) * this.owner.canvas.clientHeight * 0.5,
		};
	}
	point( clientX, clientY, planeHeight ) {
		const r = this.owner.canvas.getBoundingClientRect();
		this.raycaster.setFromCamera(
			new THREE.Vector2(
				( ( clientX - r.left ) / r.width ) * 2 - 1,
				1 - ( ( clientY - r.top ) / r.height ) * 2
			),
			this.camera
		);
		const hit = new THREE.Vector3();
		if (
			! this.raycaster.ray.intersectPlane(
				new THREE.Plane(
					new THREE.Vector3( 0, 0, 1 ),
					-( planeHeight ?? this.sim.level() )
				),
				hit
			)
		) {
			return null;
		}
		const x = hit.x / this.sim.aspect + 0.5,
			y = 0.5 - hit.y;
		return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? { x, y } : null;
	}
	dispose() {
		this.customObstacles.dispose();
		this.contact.dispose();
		this.depthTarget.dispose();
		this.depthMaterial.dispose();
		this.meshes[ 3 ].texture.dispose();
		this.scene.traverse( ( o ) => {
			o.geometry?.dispose();
			o.material?.dispose();
			if ( o.isInstancedMesh ) {
				o.dispose();
			}
		} );
	}
}
