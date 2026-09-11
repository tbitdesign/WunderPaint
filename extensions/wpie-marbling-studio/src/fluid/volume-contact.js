import * as THREE from 'three';
/** Optical continuation at a solid boundary. The PBF particles remain outside. */
export class VolumeContact {
	constructor( sim, size, extent ) {
		this.sim = sim;
		this.size = size;
		this.extent = extent;
		this.key = '';
		this.columns = [];
		const m = sim.customObstacles;
		this.data = new Uint16Array( m.w * m.h );
		this.texture = new THREE.DataTexture(
			this.data,
			m.w,
			m.h,
			THREE.RedFormat,
			THREE.HalfFloatType
		);
		this.texture.minFilter = this.texture.magFilter = THREE.LinearFilter;
		this.uniforms = {
			fluidContact: { value: this.texture },
			fluidContactAspect: { value: sim.aspect },
			fluidHasContact: { value: 0 },
		};
	}
	distance( x, y ) {
		let d = this.sim.customObstacles.sample( x / this.sim.aspect, y );
		for ( const o of this.sim.obstacles ) {
			d = Math.min(
				d,
				Math.hypot( x - o.x * this.sim.aspect, y - o.y ) - o.radius
			);
		}
		return d;
	}
	update() {
		const { sim, size, extent } = this,
			m = sim.customObstacles,
			key = m.revision + ':' + JSON.stringify( sim.obstacles );
		if ( this.model === m && this.key === key ) {
			return;
		}
		this.model = m;
		this.key = key;
		this.columns = [];
		const active = m.items.length + sim.obstacles.length;
		this.uniforms.fluidHasContact.value = active ? 1 : 0;
		if ( ! active ) {
			return;
		}
		for ( let y = 0; y < m.h; y++ ) {
			for ( let x = 0; x < m.w; x++ ) {
				this.data[ y * m.w + x ] = THREE.DataUtils.toHalfFloat(
					this.distance(
						( x / ( m.w - 1 ) ) * sim.aspect,
						y / ( m.h - 1 )
					)
				);
			}
		}
		this.texture.needsUpdate = true;
		const margin = sim.spacing * 0.45,
			e = 0.003;
		for ( let y = 1; y < size - 1; y++ ) {
			for ( let x = 1; x < size - 1; x++ ) {
				const wx = ( x / size ) * extent[ 0 ] - 0.12,
					wy = 1.12 - ( y / size ) * extent[ 1 ],
					d = this.distance( wx, wy );
				if (
					d >= margin ||
					wx < 0 ||
					wx > sim.aspect ||
					wy < 0 ||
					wy > 1
				) {
					continue;
				}
				let dx =
						this.distance( wx + e, wy ) -
						this.distance( wx - e, wy ),
					dy =
						this.distance( wx, wy + e ) -
						this.distance( wx, wy - e ),
					length = Math.hypot( dx, dy );
				if ( length < 1e-7 ) {
					dx = 1;
					dy = 0;
					length = 1;
				}
				const tx =
						( ( wx + ( dx / length ) * ( margin - d ) + 0.12 ) /
							extent[ 0 ] ) *
						size,
					ty =
						( ( 1.12 - wy - ( dy / length ) * ( margin - d ) ) /
							extent[ 1 ] ) *
						size;
				const ix = Math.max(
						1,
						Math.min( size - 3, Math.floor( tx ) )
					),
					iy = Math.max( 1, Math.min( size - 3, Math.floor( ty ) ) ),
					fx = Math.max( 0, Math.min( 1, tx - ix ) ),
					fy = Math.max( 0, Math.min( 1, ty - iy ) );
				this.columns.push( {
					index: x + y * size,
					sources: [
						ix + iy * size,
						ix + 1 + iy * size,
						ix + ( iy + 1 ) * size,
						ix + 1 + ( iy + 1 ) * size,
					],
					weights: [
						( 1 - fx ) * ( 1 - fy ),
						fx * ( 1 - fy ),
						( 1 - fx ) * fy,
						fx * fy,
					],
				} );
			}
		}
	}
	extend( mesh ) {
		if ( ! this.columns.length ) {
			return;
		}
		const { size } = this,
			layer = size * size;
		// Read the unmodified field: extension must not cascade across solids.
		this.source ||= new Float32Array( mesh.field.length );
		this.source.set( mesh.field );
		if ( mesh.palette ) {
			this.colors ||= new Float32Array( mesh.palette.length );
			this.colors.set( mesh.palette );
		}
		for (
			let z = 1;
			z < size - 1 && ( z / size ) * this.extent[ 2 ] - 0.08 < 0.65;
			z++
		) {
			const offset = z * layer;
			for ( const col of this.columns ) {
				const i = offset + col.index;
				let density = 0;
				const rgb = [ 0, 0, 0 ];
				for ( let k = 0; k < 4; k++ ) {
					const j = offset + col.sources[ k ],
						weight = col.weights[ k ];
					density += this.source[ j ] * weight;
					if ( mesh.palette ) {
						for ( let c = 0; c < 3; c++ ) {
							rgb[ c ] += this.colors[ j * 3 + c ] * weight;
						}
					}
				}
				mesh.field[ i ] = density;
				if ( mesh.palette ) {
					for ( let c = 0; c < 3; c++ ) {
						mesh.palette[ i * 3 + c ] = rgb[ c ];
					}
				}
			}
		}
	}
	compile( shader ) {
		Object.assign( shader.uniforms, this.uniforms );
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying vec3 fluidContactPosition;'
			)
			.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\nfluidContactPosition=(modelMatrix*vec4(transformed,1.0)).xyz;'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				`#include <common>
		varying vec3 fluidContactPosition;
		uniform sampler2D fluidContact;
		uniform float fluidContactAspect;
		uniform float fluidHasContact;`
			)
			.replace(
				'#include <clipping_planes_fragment>',
				`#include <clipping_planes_fragment>
		vec2 contactUV=vec2(fluidContactPosition.x/fluidContactAspect+0.5,0.5-fluidContactPosition.y);
		if(fluidHasContact>0.5 && fluidContactPosition.z<0.648 && all(greaterThanEqual(contactUV,vec2(0.0))) && all(lessThanEqual(contactUV,vec2(1.0))) && texture2D(fluidContact,contactUV).r < -0.002) discard;`
			);
	}
	dispose() {
		this.texture.dispose();
	}
}
