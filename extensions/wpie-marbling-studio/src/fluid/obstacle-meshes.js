import * as THREE from 'three';
import { insideLoop } from './obstacle-shapes.js';
/** Build all islands and holes, including nested islands, from the shared contour. */
export function contourShapes( loops ) {
	const shapes = [];
	for ( let i = 0; i < loops.length; i++ ) {
		const loop = loops[ i ],
			parents = loops.filter(
				( other, j ) =>
					j !== i &&
					insideLoop( loop[ 0 ][ 0 ], loop[ 0 ][ 1 ], other )
			);
		if ( parents.length % 2 ) {
			continue;
		}
		const shape = new THREE.Shape(
			loop.map( ( [ x, y ] ) => new THREE.Vector2( x, -y ) )
		);
		for ( let j = 0; j < loops.length; j++ ) {
			const hole = loops[ j ];
			if (
				j === i ||
				! insideLoop( hole[ 0 ][ 0 ], hole[ 0 ][ 1 ], loop )
			) {
				continue;
			}
			const depth = loops.filter(
				( other, k ) =>
					k !== j &&
					insideLoop( hole[ 0 ][ 0 ], hole[ 0 ][ 1 ], other )
			).length;
			if ( depth === parents.length + 1 ) {
				shape.holes.push(
					new THREE.Path(
						hole.map( ( [ x, y ] ) => new THREE.Vector2( x, -y ) )
					)
				);
			}
		}
		shapes.push( shape );
	}
	return shapes;
}
export class ObstacleMeshes {
	constructor( scene ) {
		this.scene = scene;
		this.meshes = new Map();
		this.revision = -1;
	}
	update( model ) {
		if ( this.model === model && this.revision === model.revision ) {
			return;
		}
		this.model = model;
		this.revision = model.revision;
		const ids = new Set( model.items.map( ( o ) => o.id ) );
		for ( const [ id, mesh ] of this.meshes ) {
			if ( ! ids.has( id ) ) {
				this.scene.remove( mesh );
				mesh.geometry.dispose();
				mesh.material.dispose();
				this.meshes.delete( id );
			}
		}
		for ( const o of model.items ) {
			let mesh = this.meshes.get( o.id );
			if ( mesh && mesh.userData.shape !== o.shape ) {
				mesh.geometry.dispose();
				mesh.material.dispose();
				this.scene.remove( mesh );
				mesh = null;
			}
			if ( ! mesh ) {
				mesh = new THREE.Mesh(
					new THREE.ExtrudeGeometry(
						contourShapes( model.loops( o.shape ) ),
						{
							depth: 0.65,
							steps: 1,
							bevelEnabled: true,
							bevelThickness: 0.002,
							bevelSize: 0.008,
							bevelSegments: 4,
							curveSegments: 32,
						}
					),
					new THREE.MeshPhysicalMaterial( {
						color: o.color,
						roughness: 0.3,
						metalness: 0.2,
						clearcoat: 0.4,
					} )
				);
				mesh.userData.shape = o.shape;
				this.meshes.set( o.id, mesh );
				this.scene.add( mesh );
			}
			mesh.position.set( ( o.x - 0.5 ) * model.sim.aspect, 0.5 - o.y, 0 );
			mesh.rotation.z = ( -o.angle * Math.PI ) / 180;
			mesh.scale.set( o.size, o.size, 1 );
			mesh.material.color.set( o.color );
		}
	}
	dispose() {
		for ( const mesh of this.meshes.values() ) {
			this.scene.remove( mesh );
			mesh.geometry.dispose();
			mesh.material.dispose();
		}
		this.meshes.clear();
	}
}
