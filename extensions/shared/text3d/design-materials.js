/** Local procedural relief. No downloaded maps, canvas textures or runtime assets. */
export const DESIGN_MATERIALS = {
	travertine: {
		label: 'Travertine',
		face: '#e6d4af',
		side: '#b3a07e',
		texture: 1,
		mat: { roughness: 0.74, metalness: 0, env: 0.8 },
	},
	concrete: {
		label: 'Fine concrete',
		face: '#c1c3c0',
		side: '#929691',
		texture: 2,
		mat: { roughness: 0.88, metalness: 0, env: 0.8 },
	},
	cork: {
		label: 'Cork',
		face: '#c39566',
		side: '#896644',
		texture: 3,
		mat: { roughness: 0.95, metalness: 0, env: 0.7 },
	},
	wood: {
		label: 'Waxed wood',
		face: '#bb7d48',
		side: '#7e4a28',
		texture: 4,
		mat: {
			roughness: 0.42,
			metalness: 0,
			clearcoat: 0.35,
			clearcoatRoughness: 0.35,
			env: 1,
		},
	},
	brushed: {
		label: 'Brushed metal',
		face: '#d6e1ed',
		side: '#778a9e',
		texture: 5,
		mat: { roughness: 0.3, metalness: 1, env: 1.8 },
	},
	enamel: {
		label: 'Enamel',
		face: '#71b9ac',
		side: '#2d786e',
		texture: 6,
		mat: {
			roughness: 0.27,
			metalness: 0.12,
			clearcoat: 1,
			clearcoatRoughness: 0.13,
			env: 1.1,
		},
	},
	fabric: {
		label: 'Woven fabric',
		face: '#c5a9c9',
		side: '#8a6e92',
		texture: 7,
		mat: { roughness: 0.88, metalness: 0, sheen: 0.65, env: 0.85 },
	},
	paper: {
		label: 'Cotton paper',
		face: '#f0e7d6',
		side: '#c8bba7',
		texture: 8,
		mat: { roughness: 0.86, metalness: 0, env: 0.8 },
	},
};

const shaderNoise = `
varying vec3 wpieSurfacePoint;
uniform float wpieTextureScale;
uniform float wpieTextureStrength;
float wpieHash(vec3 p) {
 p = fract(p * .1031); p += dot(p, p.yzx + 33.33);
 return fract((p.x + p.y) * p.z);
}
float wpieNoise(vec3 p) {
 vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(wpieHash(i),wpieHash(i+vec3(1,0,0)),f.x),
                mix(wpieHash(i+vec3(0,1,0)),wpieHash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(wpieHash(i+vec3(0,0,1)),wpieHash(i+vec3(1,0,1)),f.x),
                mix(wpieHash(i+vec3(0,1,1)),wpieHash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
float wpieRelief(vec3 p) {
 p *= wpieTextureScale;
 #if WPIE_SURFACE == 1
  float band=wpieNoise(vec3(p.x*.5,p.y*2.5+wpieNoise(p*.18)*2.,p.z*.5));
  float pore=smoothstep(.68,.87,wpieNoise(p*5.));
  return band*.45-pore*.85;
 #elif WPIE_SURFACE == 2
  return wpieNoise(p*3.)*.55+wpieNoise(p*12.)*.16-smoothstep(.72,.88,wpieNoise(p*6.))*.6;
 #elif WPIE_SURFACE == 3
  return floor(wpieNoise(p*1.4)*5.)*.14+wpieNoise(p*9.)*.15;
 #elif WPIE_SURFACE == 4
  float grain=sin(p.y*3.+wpieNoise(vec3(p.x*.25,p.y*.14,p.z*.4))*14.);
  return grain*.25+wpieNoise(vec3(p.x*.5,p.y*24.,p.z*.5))*.16;
 #elif WPIE_SURFACE == 5
  return wpieNoise(vec3(p.x*.14,p.y*32.,p.z*.2))*.3;
 #elif WPIE_SURFACE == 6
  return wpieNoise(p*1.6)*.2+wpieNoise(p*8.)*.09;
 #elif WPIE_SURFACE == 7
  return sin(p.x*23.)*sin(p.y*23.)*.16+wpieNoise(p*2.)*.08;
 #else
  return wpieNoise(p*11.)*.16+wpieNoise(vec3(p.x*.5,p.y*18.,p.z*4.))*.12;
 #endif
}
vec3 wpieBump(vec3 position, vec3 n, vec2 gradient, float direction) {
 vec3 sx=dFdx(position), sy=dFdy(position);
 vec3 r1=cross(sy,n), r2=cross(n,sx);
 float determinant=dot(sx,r1)*direction;
 return normalize(abs(determinant)*n-sign(determinant)*(gradient.x*r1+gradient.y*r2));
}
`;

export function applySurfaceTexture( material, kind, p ) {
	if ( ! kind || p.textureStrength === 0 ) {
		return;
	}
	const previous = material.userData.wpiePatch;
	const key = ( material.userData.wpieCacheKey || '' ) + '|surface-' + kind;
	const uniforms = {
		wpieTextureScale: { value: 0.06 + ( p.textureScale ?? 45 ) * 0.008 },
		wpieTextureStrength: { value: ( p.textureStrength ?? 60 ) / 100 },
	};
	const patch = ( shader ) => {
		if ( previous ) {
			previous( shader );
		}
		Object.assign( shader.uniforms, uniforms );
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying vec3 wpieSurfacePoint;'
			)
			.replace(
				'#include <begin_vertex>',
				'#include <begin_vertex>\nwpieSurfacePoint = position;'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\n#define WPIE_SURFACE ' +
					kind +
					'\n' +
					shaderNoise
			)
			.replace(
				'#include <color_fragment>',
				`#include <color_fragment>
float wpieHeight = wpieRelief(wpieSurfacePoint);
diffuseColor.rgb *= max(.25, 1. + (wpieHeight - .22) * wpieTextureStrength * ${
					kind === 5 || kind === 6 ? '.25' : '.72'
				});`
			)
			.replace(
				'#include <roughnessmap_fragment>',
				'#include <roughnessmap_fragment>\nroughnessFactor = clamp(roughnessFactor + (wpieHeight - .25) * wpieTextureStrength * .15, .04, 1.);'
			)
			.replace(
				'#include <normal_fragment_maps>',
				'#include <normal_fragment_maps>\nnormal = wpieBump(-vViewPosition, normal, vec2(dFdx(wpieHeight), dFdy(wpieHeight)) * wpieTextureStrength * ' +
					( kind === 5
						? '.045'
						: kind === 7 || kind === 8
						? '.09'
						: kind === 6
						? '.13'
						: '.28' ) +
					', faceDirection);'
			);
	};
	material.onBeforeCompile = patch;
	material.customProgramCacheKey = () => key;
	material.userData.wpiePatch = patch;
	material.userData.wpieCacheKey = key;
}
