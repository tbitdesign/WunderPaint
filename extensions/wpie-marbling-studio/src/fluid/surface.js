/**
 * Positive cubic B-splines reconstruct the fields before shading their borders.
 * Four bilinear samples replace a 4x4 kernel; unlike a sharpening filter the
 * weights cannot create negative concentrations or ringing around a drop.
 */
export const SURFACE_GLSL = /* glsl */ `
uniform vec2 fluidGrid;
uniform sampler2D fluidHeight;
uniform sampler2D fluidObstacleDistance;
uniform float fluidAspect;
uniform vec2 fluidObstacleGrid;
uniform float fluidHasObstacles;
vec4 fluidCubicGrid(sampler2D field, vec2 uv, vec2 grid) {
    vec2 p = uv * (grid - 1.0);
    vec2 cell = floor(p), f = fract(p), q = 1.0 - f;
    vec2 a = q*q*q / 6.0;
    vec2 b = (3.0*f*f*f - 6.0*f*f + 4.0) / 6.0;
    vec2 c = (-3.0*f*f*f + 3.0*f*f + 3.0*f + 1.0) / 6.0;
    vec2 d = f*f*f / 6.0;
    vec2 lo = a+b, hi = c+d;
    vec2 l = (cell - 0.5 + b/lo) / grid;
    vec2 r = (cell + 1.5 + d/hi) / grid;
    return mix(
        mix(texture2D(field, l), texture2D(field, vec2(r.x,l.y)), hi.x),
        mix(texture2D(field, vec2(l.x,r.y)), texture2D(field, r), hi.x), hi.y
    );
}
vec4 fluidCubic(sampler2D field, vec2 uv) { return fluidCubicGrid(field, uv, fluidGrid); }
float obstacleRelief(vec2 uv) {
    if (fluidHasObstacles<0.5) return 0.0;
    float d=fluidCubicGrid(fluidObstacleDistance,uv,fluidObstacleGrid).r;
    return 0.045*(1.0-smoothstep(-0.02,0.02,d));
}
`;

export const COLOR_GLSL = /* glsl */ `
uniform sampler2D fluidObstacles;
uniform sampler2D fluidWater;
uniform sampler2D fluidOil;
uniform sampler2D fluidMetal;
uniform sampler2D fluidSilicone;
uniform sampler2D fluidWax;
uniform sampler2D fluidWaxState;
uniform vec3 fluidBath;
uniform float fluidGloss;
uniform float fluidFluorescence;
uniform float fluidTransparency;
uniform float fluidIridescence;
uniform mat3 fluidNormalMatrix;
`;

export const COLOR_FRAGMENT = /* glsl */ `
vec4 fluidW = max(vec4(0.0), fluidCubic(fluidWater, vMapUv));
vec4 fluidO = max(vec4(0.0), fluidCubic(fluidOil, vMapUv));
vec4 fluidM = max(vec4(0.0), fluidCubic(fluidMetal, vMapUv));
vec4 fluidShape = fluidCubic(fluidHeight, vMapUv);
vec4 fluidS = max(vec4(0.0), fluidCubic(fluidSilicone, vMapUv));
vec4 fluidX = max(vec4(0.0), fluidCubic(fluidWax, vMapUv));
float fluidSiliconeCover = smoothstep(0.025, 0.22, fluidS.a);
float fluidWaxCover = smoothstep(0.025, 0.25, fluidX.a);
float fluidWaxSolid = clamp(fluidCubic(fluidWaxState, vMapUv).r, 0.0, 1.0);
float fluidInk = 1.0 - exp(-fluidW.a * 2.5);
float fluidCover = smoothstep(0.025, 0.25, fluidO.a);
float fluidMetalCover = smoothstep(0.025, 0.25, fluidM.a);
vec4 obstacleColor = texture2D(fluidObstacles, vMapUv);
if (fluidHasObstacles>0.5) {
    float contourDistance=fluidCubicGrid(fluidObstacleDistance,vMapUv,fluidObstacleGrid).r;
    float contourAA=max(0.0001,fwidth(contourDistance)*0.7);
    obstacleColor.a=1.0-smoothstep(-contourAA,contourAA,contourDistance);
}
float legacyWall = smoothstep(0.35, 0.65, fluidShape.a);
float fluidWall = max(legacyWall, obstacleColor.a);
vec3 fluidColor = mix(fluidBath, fluidW.rgb / max(fluidW.a, 0.0001), fluidInk);
fluidColor = mix(fluidColor, fluidO.rgb / max(fluidO.a, 0.0001), fluidCover);
fluidColor = mix(fluidColor, fluidM.rgb / max(fluidM.a, 0.0001), fluidMetalCover);
fluidColor = mix(fluidColor, fluidS.rgb / max(fluidS.a,0.0001), fluidSiliconeCover);
fluidColor = mix(fluidColor, fluidX.rgb / max(fluidX.a,0.0001), fluidWaxCover);
fluidColor = mix(fluidColor, vec3(0.263,0.302,0.322), legacyWall);
fluidColor = mix(fluidColor, obstacleColor.rgb, obstacleColor.a);
diffuseColor *= sRGBTransferEOTF(vec4(clamp(fluidColor, 0.0, 1.0), 1.0));
`;

/** CPU counterpart for pointer intersection with the actual displaced surface. */
export function sampleSurface( field, w, h, x, y ) {
	const weights = ( t ) => [
		( 1 - t ) ** 3 / 6,
		( 3 * t ** 3 - 6 * t ** 2 + 4 ) / 6,
		( -3 * t ** 3 + 3 * t ** 2 + 3 * t + 1 ) / 6,
		t ** 3 / 6,
	];
	const xx = Math.max( 0, Math.min( w - 1, x * ( w - 1 ) ) );
	const yy = Math.max( 0, Math.min( h - 1, y * ( h - 1 ) ) );
	const ix = Math.floor( xx ),
		iy = Math.floor( yy );
	const wx = weights( xx - ix ),
		wy = weights( yy - iy );
	let value = 0;
	for ( let j = 0; j < 4; j++ ) {
		for ( let i = 0; i < 4; i++ ) {
			const col = Math.max( 0, Math.min( w - 1, ix + i - 1 ) );
			const row = Math.max( 0, Math.min( h - 1, iy + j - 1 ) );
			value += field[ row * w + col ] * wx[ i ] * wy[ j ];
		}
	}
	return value;
}
