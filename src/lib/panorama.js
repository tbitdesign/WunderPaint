/**
 * 360° panorama math (v1.378.0): the pure half of the panorama tool.
 * Projection helpers shared by the in-editor viewer and the embed
 * (hotspot placement, click-to-yaw/pitch), the wrap-seam repair, and the
 * GLSL sources both viewers compile. No DOM, no WebGL here - Jest holds
 * the math.
 */

const D2R = Math.PI / 180;

/** World direction for yaw/pitch (yaw 0 = image center, pitch + = up). */
export function dirFromYawPitch( yawDeg, pitchDeg ) {
	const y = yawDeg * D2R;
	const p = pitchDeg * D2R;
	return {
		x: Math.cos( p ) * Math.sin( y ),
		y: Math.sin( p ),
		z: Math.cos( p ) * Math.cos( y ),
	};
}

/** Horizon-locked camera basis (roll 0) for a yaw/pitch camera. */
function cameraBasis( cam ) {
	const f = dirFromYawPitch( cam.yaw, cam.pitch );
	const yr = cam.yaw * D2R;
	const r = { x: Math.cos( yr ), y: 0, z: -Math.sin( yr ) };
	const u = {
		x: r.y * f.z - r.z * f.y,
		y: r.z * f.x - r.x * f.z,
		z: r.x * f.y - r.y * f.x,
	};
	return { f, r, u };
}

/**
 * Project a yaw/pitch point into viewer pixels.
 *
 * @param {number} yawDeg   Point yaw.
 * @param {number} pitchDeg Point pitch.
 * @param {Object} cam      { yaw, pitch, fov } (fov = vertical, deg).
 * @param {number} W        Viewport width.
 * @param {number} H        Viewport height.
 * @return {Object} { x, y, visible }.
 */
export function screenFromYawPitch( yawDeg, pitchDeg, cam, W, H ) {
	const { f, r, u } = cameraBasis( cam );
	const d = dirFromYawPitch( yawDeg, pitchDeg );
	const cz = d.x * f.x + d.y * f.y + d.z * f.z;
	if ( cz <= 0.001 ) {
		return { x: 0, y: 0, visible: false };
	}
	const cx = d.x * r.x + d.y * r.y + d.z * r.z;
	const cy = d.x * u.x + d.y * u.y + d.z * u.z;
	const tanHalf = Math.tan( ( cam.fov / 2 ) * D2R );
	const aspect = W / H;
	const xNdc = cx / cz / ( tanHalf * aspect );
	const yNdc = cy / cz / tanHalf;
	return {
		x: W / 2 + ( xNdc * W ) / 2,
		y: H / 2 - ( yNdc * H ) / 2,
		visible: Math.abs( xNdc ) <= 1.15 && Math.abs( yNdc ) <= 1.15,
	};
}

/**
 * Inverse projection: viewer pixel -> yaw/pitch (for click-placed
 * hotspots).
 *
 * @param {number} px  Pixel x.
 * @param {number} py  Pixel y.
 * @param {Object} cam { yaw, pitch, fov }.
 * @param {number} W   Viewport width.
 * @param {number} H   Viewport height.
 * @return {Object} { yaw, pitch } degrees.
 */
export function yawPitchFromScreen( px, py, cam, W, H ) {
	const { f, r, u } = cameraBasis( cam );
	const tanHalf = Math.tan( ( cam.fov / 2 ) * D2R );
	const aspect = W / H;
	const vx = ( ( px - W / 2 ) / ( W / 2 ) ) * tanHalf * aspect;
	const vy = ( ( H / 2 - py ) / ( H / 2 ) ) * tanHalf;
	const d = {
		x: vx * r.x + vy * u.x + f.x,
		y: vx * r.y + vy * u.y + f.y,
		z: vx * r.z + vy * u.z + f.z,
	};
	const len = Math.hypot( d.x, d.y, d.z ) || 1;
	return {
		yaw: Math.atan2( d.x / len, d.z / len ) / D2R,
		pitch: Math.asin( d.y / len ) / D2R,
	};
}

/**
 * Repair the wrap seam of an equirectangular image in place. AI
 * panoramas typically drift in color/exposure across the width, so the
 * left and right edges no longer match. Per row, the edge difference is
 * measured and distributed as a ramp onto both sides (the edges meet
 * halfway); a narrow wrap-aware blur band then hides the residual
 * texture line.
 *
 * @param {Uint8ClampedArray} data      RGBA pixels, mutated.
 * @param {number} w         Width.
 * @param {number} h         Height.
 * @param {Object} opts      Options.
 * @param {number} opts.ramp Ramp width as a fraction of the width.
 * @param {number} opts.band Blur band half-width in px.
 * @return {Uint8ClampedArray} The same array.
 */
export function fixSeam( data, w, h, { ramp = 0.08, band = 4 } = {} ) {
	const R = Math.max( 2, Math.round( w * ramp ) );
	const S = Math.min( 3, w );
	for ( let y = 0; y < h; y++ ) {
		const row = y * w * 4;
		for ( let c = 0; c < 3; c++ ) {
			let left = 0;
			let right = 0;
			for ( let s = 0; s < S; s++ ) {
				left += data[ row + s * 4 + c ];
				right += data[ row + ( w - 1 - s ) * 4 + c ];
			}
			const delta = ( right - left ) / S;
			for ( let x = 0; x < R; x++ ) {
				const fall = ( 1 - x / R ) * 0.5;
				data[ row + x * 4 + c ] += delta * fall;
				data[ row + ( w - 1 - x ) * 4 + c ] -= delta * fall;
			}
		}
	}
	// Wrap-aware horizontal box blur over the seam band.
	if ( band > 0 ) {
		const radius = 2;
		for ( let y = 0; y < h; y++ ) {
			const row = y * w * 4;
			const patched = [];
			for ( let i = -band; i < band; i++ ) {
				const x = ( w + i ) % w;
				const px = [ 0, 0, 0 ];
				for ( let k = -radius; k <= radius; k++ ) {
					const xx = ( w + x + k ) % w;
					for ( let c = 0; c < 3; c++ ) {
						px[ c ] += data[ row + xx * 4 + c ];
					}
				}
				patched.push( [
					x,
					px.map( ( v ) => v / ( 2 * radius + 1 ) ),
				] );
			}
			for ( const [ x, px ] of patched ) {
				for ( let c = 0; c < 3; c++ ) {
					data[ row + x * 4 + c ] = px[ c ];
				}
			}
		}
	}
	return data;
}

/** True when a size is close enough to equirectangular 2:1. */
export function panoramaAspectOk( w, h, tol = 0.1 ) {
	return h > 0 && Math.abs( w / ( 2 * h ) - 1 ) <= tol;
}

/**
 * Bake a circular cap over the nadir (v1.379): the bottom rows of an
 * equirectangular image map to the floor point, where tripods and AI
 * distortion live - a logo disc covers that zone the way classic pano
 * software does. Pure per-pixel math: every pixel below the cap angle
 * projects onto the floor plane and samples the logo (nearest neighbor);
 * a soft alpha ramp at the rim blends into the scene.
 *
 * @param {Uint8ClampedArray} img  RGBA pixels of the panorama, mutated.
 * @param {number} w    Panorama width.
 * @param {number} h    Panorama height.
 * @param {Uint8ClampedArray} logo RGBA pixels of the (square) logo tile.
 * @param {number} lw   Logo width.
 * @param {number} lh   Logo height.
 * @param {number} capDeg Cap radius in degrees below the nadir (10-45).
 * @return {Uint8ClampedArray} The same panorama array.
 */
export function applyNadirCap( img, w, h, logo, lw, lh, capDeg = 25 ) {
	const capStart = h - Math.round( ( capDeg / 180 ) * h );
	const rim = Math.max( 2, Math.round( ( 2 / 180 ) * h ) );
	for ( let y = capStart; y < h; y++ ) {
		// 0 at the cap rim, 1 straight down.
		const depth = ( y - capStart ) / Math.max( 1, h - 1 - capStart );
		// Radius on the floor plane: rim of the cap = logo edge.
		const radius = 1 - depth;
		const blend = Math.min( 1, ( y - capStart ) / rim );
		for ( let x = 0; x < w; x++ ) {
			const az = ( x / w ) * 2 * Math.PI;
			const lx = Math.min(
				lw - 1,
				Math.max(
					0,
					Math.round(
						( 0.5 + ( radius * Math.sin( az ) ) / 2 ) * ( lw - 1 )
					)
				)
			);
			const ly = Math.min(
				lh - 1,
				Math.max(
					0,
					Math.round(
						( 0.5 + ( radius * Math.cos( az ) ) / 2 ) * ( lh - 1 )
					)
				)
			);
			const s = ( ly * lw + lx ) * 4;
			const d = ( y * w + x ) * 4;
			const a = ( logo[ s + 3 ] / 255 ) * blend;
			img[ d ] = img[ d ] * ( 1 - a ) + logo[ s ] * a;
			img[ d + 1 ] = img[ d + 1 ] * ( 1 - a ) + logo[ s + 1 ] * a;
			img[ d + 2 ] = img[ d + 2 ] * ( 1 - a ) + logo[ s + 2 ] * a;
		}
	}
	return img;
}

/* --------------------------- shared shaders ---------------------------- */
// One source of truth: the in-editor viewer AND the embed compile these.

export const PANO_VERT = `attribute vec2 p;varying vec2 v;void main(){v=p;gl_Position=vec4(p,0.,1.);}`;

export const PANO_FRAG = `precision highp float;varying vec2 v;uniform sampler2D t;uniform float yaw,pitch,fov,aspect;
void main(){
float th=tan(fov*0.5);
vec3 f=vec3(cos(pitch)*sin(yaw),sin(pitch),cos(pitch)*cos(yaw));
vec3 r=vec3(cos(yaw),0.,-sin(yaw));
vec3 u=cross(r,f);
vec3 d=normalize(f+v.x*th*aspect*r+v.y*th*u);
float uu=atan(d.x,d.z)/6.28318530718+0.5;
float vv=0.5+asin(clamp(d.y,-1.,1.))/3.14159265359;
gl_FragColor=texture2D(t,vec2(uu,vv));
}`;
