import * as THREE from 'three';

/**
 * Beer–Lambert integration of the advected dye concentration. A cloud has
 * optical depth throughout its interior, rather than an opaque painted skin.
 */
export class DyeVolume extends THREE.Mesh {
	constructor( size, extent ) {
		const texture = new THREE.Data3DTexture(
			new Uint16Array( size ** 3 * 4 ),
			size,
			size,
			size
		);
		texture.format = THREE.RGBAFormat;
		texture.type = THREE.HalfFloatType;
		texture.minFilter = texture.magFilter = THREE.LinearFilter;
		texture.unpackAlignment = 1;
		const material = new THREE.ShaderMaterial( {
			transparent: true,
			depthWrite: false,
			depthTest: false,
			uniforms: {
				dye: { value: texture },
				fluorescence: { value: 0 },
				occlusion: { value: null },
				resolution: { value: new THREE.Vector2( 1, 1 ) },
				viewRange: { value: new THREE.Vector2( 0.01, 20 ) },
				direction: { value: new THREE.Vector3( 0, 0, -1 ) },
				boxSize: { value: new THREE.Vector3( ...extent ) },
				boxMin: {
					value: new THREE.Vector3(
						-extent[ 0 ] / 2,
						-extent[ 1 ] / 2,
						-0.08
					),
				},
			},
			vertexShader: `
				varying vec3 worldPoint;
				varying float viewDepth;
				void main() {
					vec4 world = modelMatrix * vec4(position, 1.0);
					worldPoint = world.xyz;
					vec4 view = viewMatrix * world;
					viewDepth = -view.z;
					gl_Position = projectionMatrix * view;
				}`,
			fragmentShader: `
				precision highp sampler3D;
				uniform sampler3D dye;
				uniform float fluorescence;
				uniform sampler2D occlusion;
				uniform vec2 resolution, viewRange;
				uniform vec3 direction, boxSize, boxMin;
				varying vec3 worldPoint;
				varying float viewDepth;
				void main() {
					vec3 ray = normalize(direction);
					vec3 inverseRay = 1.0 / (ray + vec3(0.000001));
					vec3 a = (boxMin - worldPoint) * inverseRay;
					vec3 b = (boxMin + boxSize - worldPoint) * inverseRay;
					vec3 farPlane = max(a, b);
					float end = min(farPlane.x, min(farPlane.y, farPlane.z));
					float depth = texture2D(occlusion, gl_FragCoord.xy / resolution).x;
					end = min(end, mix(viewRange.x, viewRange.y, depth) - viewDepth);
					if(end <= 0.0) discard;
					float stepSize = end / 56.0;
					vec4 sum = vec4(0.0);
					for(int i = 0; i < 56; i++) {
						vec3 uv = (worldPoint + ray * ((float(i) + 0.5) * stepSize) - boxMin) / boxSize;
						vec4 medium = texture(dye, uv);
						float alpha = 1.0 - exp(-medium.a * stepSize * 16.0);
						float shade = 0.58 + 0.42 * exp(-texture(dye, uv + vec3(-0.018, 0.025, 0.05)).a * 0.65);
						sum.rgb += (1.0 - sum.a) * alpha * medium.rgb * (shade + fluorescence * 2.0);
						sum.a += (1.0 - sum.a) * alpha;
						if(sum.a > 0.985) break;
					}
					if(sum.a < 0.002) discard;
					gl_FragColor = vec4(sum.rgb / max(sum.a, 0.0001), sum.a);
					#include <tonemapping_fragment>
					#include <colorspace_fragment>
				}`,
		} );
		super( new THREE.BoxGeometry( 2, 2, 2 ), material );
		this.texture = texture;
		this.field = new Float32Array( size ** 3 );
		this.palette = new Float32Array( size ** 3 * 3 );
		this.count = 36;
		this.renderOrder = 2;
	}
	reset() {
		this.field.fill( 0 );
		this.palette.fill( 0 );
	}
	update() {
		const pixels = this.texture.image.data,
			half = THREE.DataUtils.toHalfFloat;
		for ( let i = 0; i < this.field.length; i++ ) {
			pixels[ i * 4 ] = half( this.palette[ i * 3 ] );
			pixels[ i * 4 + 1 ] = half( this.palette[ i * 3 + 1 ] );
			pixels[ i * 4 + 2 ] = half( this.palette[ i * 3 + 2 ] );
			pixels[ i * 4 + 3 ] = half( Math.min( 8, this.field[ i ] ) );
		}
		this.texture.needsUpdate = true;
	}
}
