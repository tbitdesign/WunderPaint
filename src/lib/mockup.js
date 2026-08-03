/**
 * Mockup engine (v1.117.0): six studio-style product mockups (ebook,
 * software box, DVD case, CD jewel case, report stack, monitor) built
 * from a tiny software 3D pipeline - cuboids, a perspective camera,
 * painter-sorted faces, Lambert shading and a strip-subdivided
 * perspective warp for the artwork faces. No WebGL, no dependencies,
 * fully deterministic: same params + same artwork = same pixels, which
 * is what makes Edit Mockup reproducible. The proportions adapt to the
 * artwork's aspect ratio within believable per-type clamps.
 */

import { createCanvas } from './raster';

export const MOCKUP_TYPES = [ 'book', 'box', 'dvd', 'cd', 'report', 'monitor' ];

export const MOCKUP_DEFAULTS = {
	type: 'book',
	yaw: 22, // degrees; positive turns the spine (left side) into view
	pitch: 5, // degrees; positive looks slightly down onto the object
	light: 42, // 0..100, left..right
	material: '#2f3d57', // spine / sides / bezel color
	shadow: 55, // 0..100 ground shadow strength
	gloss: 40, // 0..100 sheen on plastic and glass fronts
};

/* ------------------------------- colors ------------------------------- */

const PAGES = '#f1eee6';

const hexRgb = ( hex ) => {
	let h = String( hex || '' ).replace( '#', '' );
	if ( 3 === h.length ) {
		h = h.replace( /./g, ( c ) => c + c );
	}
	const n = parseInt( h || '888888', 16 );
	return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ];
};

const rgbCss = ( [ r, g, b ], k = 1, a = 1 ) => {
	const c = ( v ) => Math.max( 0, Math.min( 255, Math.round( v * k ) ) );
	return 1 === a
		? `rgb(${ c( r ) },${ c( g ) },${ c( b ) })`
		: `rgba(${ c( r ) },${ c( g ) },${ c( b ) },${ a })`;
};

const blendRgb = ( a, b, t ) => a.map( ( v, i ) => v + ( b[ i ] - v ) * t );

/* ------------------------------ 3D math ------------------------------- */

const rot3 = ( [ x, y, z ], yaw, pitch ) => {
	// Yaw around Y, then pitch around X (y grows downward like on canvas).
	const cy = Math.cos( yaw );
	const sy = Math.sin( yaw );
	const cx = Math.cos( pitch );
	const sx = Math.sin( pitch );
	const x1 = x * cy + z * sy;
	const z1 = -x * sy + z * cy;
	return [ x1, y * cx - z1 * sx, y * sx + z1 * cx ];
};

const sub3 = ( a, b ) => [ a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ], a[ 2 ] - b[ 2 ] ];
const dot3 = ( a, b ) => a[ 0 ] * b[ 0 ] + a[ 1 ] * b[ 1 ] + a[ 2 ] * b[ 2 ];
const cross3 = ( a, b ) => [
	a[ 1 ] * b[ 2 ] - a[ 2 ] * b[ 1 ],
	a[ 2 ] * b[ 0 ] - a[ 0 ] * b[ 2 ],
	a[ 0 ] * b[ 1 ] - a[ 1 ] * b[ 0 ],
];
const norm3 = ( v ) => {
	const l = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ) || 1;
	return [ v[ 0 ] / l, v[ 1 ] / l, v[ 2 ] / l ];
};

/** Outward normal of a face authored TL, TR, BR, BL (seen from outside). */
export const faceNormal = ( rect ) =>
	norm3(
		cross3( sub3( rect[ 3 ], rect[ 0 ] ), sub3( rect[ 1 ], rect[ 0 ] ) )
	);

/** Point on a planar rectangle at (u, v) in [0,1]^2 - exact, no drift. */
const rectAt = ( rect, u, v ) => {
	const top = [
		rect[ 0 ][ 0 ] + ( rect[ 1 ][ 0 ] - rect[ 0 ][ 0 ] ) * u,
		rect[ 0 ][ 1 ] + ( rect[ 1 ][ 1 ] - rect[ 0 ][ 1 ] ) * u,
		rect[ 0 ][ 2 ] + ( rect[ 1 ][ 2 ] - rect[ 0 ][ 2 ] ) * u,
	];
	const bot = [
		rect[ 3 ][ 0 ] + ( rect[ 2 ][ 0 ] - rect[ 3 ][ 0 ] ) * u,
		rect[ 3 ][ 1 ] + ( rect[ 2 ][ 1 ] - rect[ 3 ][ 1 ] ) * u,
		rect[ 3 ][ 2 ] + ( rect[ 2 ][ 2 ] - rect[ 3 ][ 2 ] ) * u,
	];
	return [
		top[ 0 ] + ( bot[ 0 ] - top[ 0 ] ) * v,
		top[ 1 ] + ( bot[ 1 ] - top[ 1 ] ) * v,
		top[ 2 ] + ( bot[ 2 ] - top[ 2 ] ) * v,
	];
};

/**
 * Lambert intensity 0..1 for a rotated face normal under the light
 * slider (0 = light from the left, 100 = from the right, always a bit
 * above and in front of the scene).
 * @param normal
 * @param light
 */
export function faceShade( normal, light ) {
	const a = ( ( ( light ?? 50 ) - 50 ) / 50 ) * ( Math.PI / 3 );
	const L = norm3( [ Math.sin( a ), -0.55, -0.8 ] );
	return Math.max( 0, dot3( norm3( normal ), L ) );
}

/* ----------------------------- geometry ------------------------------- */

// Base millimeter-ish proportions; `clamp` bounds the artwork aspect
// (w/h) the shape is allowed to adopt.
const TYPE_SPEC = {
	book: { w: 135, h: 200, d: 24, clamp: [ 0.55, 0.85 ] },
	box: { w: 160, h: 225, d: 42, clamp: [ 0.6, 0.85 ] },
	dvd: { w: 136, h: 190, d: 15, clamp: [ 0.62, 0.8 ] },
	cd: { w: 142, h: 125, d: 11, clamp: [ 1, 1.25 ] },
	report: { w: 170, h: 240, d: 6, clamp: [ 0.6, 0.85 ] },
	monitor: { w: 384, h: 216, d: 14, clamp: [ 1.3, 2 ] },
};

const fitDims = ( spec, aspect ) => {
	const a = Math.min(
		spec.clamp[ 1 ],
		Math.max( spec.clamp[ 0 ], aspect || spec.w / spec.h )
	);
	return spec.w >= spec.h
		? { w: spec.h * a, h: spec.h, d: spec.d }
		: { w: spec.w, h: spec.w / a, d: spec.d };
};

/**
 * The six faces of a box, each authored TL, TR, BR, BL as seen from
 * outside so faceNormal points outward.
 * @param w
 * @param h
 * @param d
 * @param at
 */
export function cuboid( w, h, d, at = {} ) {
	const X = w / 2;
	const Y = h / 2;
	const Z = d / 2;
	const o = ( [ x, y, z ] ) => [
		x + ( at.x || 0 ),
		y + ( at.y || 0 ),
		z + ( at.z || 0 ),
	];
	const P = ( x, y, z ) => o( [ x, y, z ] );
	return {
		front: [
			P( -X, -Y, -Z ),
			P( X, -Y, -Z ),
			P( X, Y, -Z ),
			P( -X, Y, -Z ),
		],
		back: [ P( X, -Y, Z ), P( -X, -Y, Z ), P( -X, Y, Z ), P( X, Y, Z ) ],
		left: [
			P( -X, -Y, Z ),
			P( -X, -Y, -Z ),
			P( -X, Y, -Z ),
			P( -X, Y, Z ),
		],
		right: [ P( X, -Y, -Z ), P( X, -Y, Z ), P( X, Y, Z ), P( X, Y, -Z ) ],
		top: [ P( -X, -Y, Z ), P( X, -Y, Z ), P( X, -Y, -Z ), P( -X, -Y, -Z ) ],
		bottom: [ P( -X, Y, -Z ), P( X, Y, -Z ), P( X, Y, Z ), P( -X, Y, Z ) ],
	};
}

/**
 * Face descriptors before rotation. role: 'image' (artwork), 'color'
 * (material), 'pages' (paper block with page lines). Optional flags:
 * gloss (0..1 sheen strength), detail ('hinge'|'plastic'), dim
 * (multiplies the shade, for stacked copies).
 * @param type
 * @param dims
 */
function buildParts( type, dims ) {
	const { w, h, d } = dims;
	const faces = [];
	const push = ( rect, props ) => faces.push( { rect, ...props } );
	const solid = ( sides, props = {} ) => {
		for ( const [ id, rect ] of Object.entries( sides ) ) {
			if ( 'front' !== id ) {
				push( rect, { id, role: 'color', ...props } );
			}
		}
	};

	if ( 'book' === type ) {
		const c = cuboid( w, h, d );
		push( c.front, { id: 'front', role: 'image', gloss: 0.35 } );
		push( c.left, { id: 'left', role: 'color' } );
		push( c.back, { id: 'back', role: 'color' } );
		push( c.right, { id: 'right', role: 'pages' } );
		push( c.top, { id: 'top', role: 'pages' } );
		push( c.bottom, { id: 'bottom', role: 'pages' } );
	} else if ( 'box' === type ) {
		const c = cuboid( w, h, d );
		push( c.front, { id: 'front', role: 'image', gloss: 0.6 } );
		solid( c );
	} else if ( 'dvd' === type ) {
		// Keepcase signature: rounded corners on the opening side and a
		// thin dark plastic rim around the cover sheet.
		const c = cuboid( w, h, d );
		const r = [ ( 0.055 * h ) / w, 0.055 ];
		push( c.front, {
			id: 'front',
			role: 'image',
			gloss: 0.45,
			detail: 'dvdCase',
			cornersUV: [ null, r, r, null ],
			art: [ 0.016, 0.012, 0.984, 0.988 ],
		} );
		solid( c );
	} else if ( 'cd' === type ) {
		// Jewel case: the inlay card sits right of the hinge zone, the
		// dark tray shows through the clear lid on the left.
		const c = cuboid( w, h, d );
		push( c.front, {
			id: 'front',
			role: 'image',
			gloss: 1,
			glossStyle: 'streak',
			detail: 'hinge',
			art: [ 0.1, 0.012, 0.99, 0.988 ],
		} );
		solid( c, { detail: 'plastic' } );
	} else if ( 'report' === type ) {
		// A stack: the front copy plus two slightly offset ones behind.
		// The offsets outrun the perspective shrink, so the copies peek
		// out at the right and at the bottom.
		for ( let i = 2; i >= 0; i-- ) {
			const at = { x: i * w * 0.055, y: i * h * 0.045, z: i * d * 2.6 };
			const c = cuboid( w, h, d, at );
			const dim = 1 - i * 0.09;
			push( c.front, {
				id: 'front' + i,
				role: 'image',
				dim,
				gloss: 0.2,
			} );
			for ( const id of [ 'left', 'right', 'top', 'bottom' ] ) {
				push( c[ id ], { id: id + i, role: 'pages', dim } );
			}
			push( c.back, { id: 'back' + i, role: 'color', dim } );
		}
	} else if ( 'monitor' === type ) {
		// dims = screen size; the slab adds bezel and chin around it.
		const ow = w * 1.05;
		const oh = h * 1.12;
		const neckH = h * 0.32;
		const baseT = h * 0.035;
		const slabY = -( neckH + baseT ) / 2;
		const slab = cuboid( ow, oh, d, { y: slabY } );
		push( slab.front, { id: 'bezel', role: 'color', bezel: true } );
		solid( slab, { bezel: true } );
		// Screen: an inset rect a hair in front of the bezel plane.
		const sy = slabY - oh * 0.018;
		const z = -d / 2 - 0.5;
		push(
			[
				[ -w / 2, sy - h / 2, z ],
				[ w / 2, sy - h / 2, z ],
				[ w / 2, sy + h / 2, z ],
				[ -w / 2, sy + h / 2, z ],
			],
			{ id: 'screen', role: 'image', gloss: 0.8 }
		);
		const neck = cuboid( w * 0.1, neckH, d * 0.7, {
			y: slabY + oh / 2 + neckH / 2,
			z: d * 0.4,
		} );
		solid( neck, { bezel: true } );
		push( neck.front, { id: 'neckFront', role: 'color', bezel: true } );
		const base = cuboid( w * 0.34, baseT, d * 3.2, {
			y: slabY + oh / 2 + neckH + baseT / 2,
			z: d * 0.4,
		} );
		solid( base, { bezel: true } );
		push( base.front, { id: 'baseFront', role: 'color', bezel: true } );
	}
	return faces;
}

/* ------------------------------- scene -------------------------------- */

/**
 * Rotate, cull and depth-sort the faces of a mockup and project them
 * with a gentle perspective camera. Returns world-agnostic screen
 * coordinates plus the projector, so the renderer can subdivide image
 * faces perspective-correct straight from the 3D rectangles.
 *
 * @param {Object} params    MOCKUP_DEFAULTS-shaped params.
 * @param {number} srcAspect Artwork aspect (w/h) or null.
 * @return {Object} { faces, project, bbox, dims }
 */
export function mockupScene( params, srcAspect = null ) {
	const p = { ...MOCKUP_DEFAULTS, ...params };
	const spec = TYPE_SPEC[ p.type ] || TYPE_SPEC.book;
	const dims = fitDims( spec, srcAspect );
	const yaw = ( -Math.max( -45, Math.min( 45, p.yaw ) ) * Math.PI ) / 180;
	const pitch = ( Math.max( -20, Math.min( 25, p.pitch ) ) * Math.PI ) / 180;
	const dist =
		3.4 * Math.max( dims.w, dims.h ) * ( 'monitor' === p.type ? 1.5 : 1.2 );
	const project = ( pt ) => {
		const t = 1000 / ( pt[ 2 ] + dist );
		return [ pt[ 0 ] * t, pt[ 1 ] * t ];
	};

	const faces = [];
	for ( const f of buildParts( p.type, dims ) ) {
		const rect3 = f.rect.map( ( pt ) => rot3( pt, yaw, pitch ) );
		const n = faceNormal( rect3 );
		const center = [
			( rect3[ 0 ][ 0 ] + rect3[ 2 ][ 0 ] ) / 2,
			( rect3[ 0 ][ 1 ] + rect3[ 2 ][ 1 ] ) / 2,
			( rect3[ 0 ][ 2 ] + rect3[ 2 ][ 2 ] ) / 2,
		];
		// Camera sits at (0, 0, -dist); a face looks at it when its
		// outward normal points against the view ray.
		if (
			dot3( n, [ center[ 0 ], center[ 1 ], center[ 2 ] + dist ] ) >= 0
		) {
			continue;
		}
		faces.push( {
			...f,
			rect3,
			quad: rect3.map( project ),
			shade: faceShade( n, p.light ),
			depth: center[ 2 ],
		} );
	}
	faces.sort( ( a, b ) => b.depth - a.depth );

	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for ( const f of faces ) {
		for ( const [ x, y ] of f.quad ) {
			minX = Math.min( minX, x );
			minY = Math.min( minY, y );
			maxX = Math.max( maxX, x );
			maxY = Math.max( maxY, y );
		}
	}
	return {
		faces,
		project,
		dims,
		bbox: { x: minX, y: minY, w: maxX - minX || 1, h: maxY - minY || 1 },
	};
}

/* ------------------------------ painting ------------------------------ */

/**
 * Affine-map one textured triangle. Deliberately NOT clipped to the
 * triangle: per-triangle clips leave antialiased hairline seams between
 * cells. Instead each call rasterizes its cell's source rectangle and
 * the next cell overdraws the spill with an almost identical mapping;
 * the caller clips the whole face path once, keeping edges exact.
 * @param ctx
 * @param img
 * @param s
 * @param d
 */
function tri( ctx, img, s, d ) {
	const [ [ x0, y0 ], [ x1, y1 ], [ x2, y2 ] ] = d;
	const [ [ u0, v0 ], [ u1, v1 ], [ u2, v2 ] ] = s;
	const den = u0 * ( v1 - v2 ) + u1 * ( v2 - v0 ) + u2 * ( v0 - v1 );
	if ( ! den ) {
		return;
	}
	ctx.save();
	const a = ( x0 * ( v1 - v2 ) + x1 * ( v2 - v0 ) + x2 * ( v0 - v1 ) ) / den;
	const b = ( y0 * ( v1 - v2 ) + y1 * ( v2 - v0 ) + y2 * ( v0 - v1 ) ) / den;
	const c = ( x0 * ( u2 - u1 ) + x1 * ( u0 - u2 ) + x2 * ( u1 - u0 ) ) / den;
	const dd = ( y0 * ( u2 - u1 ) + y1 * ( u0 - u2 ) + y2 * ( u1 - u0 ) ) / den;
	ctx.transform( a, b, c, dd, x0 - a * u0 - c * v0, y0 - b * u0 - dd * v0 );
	// Only rasterize this cell's source region (fast at high subdivision).
	const sx = Math.max( 0, Math.min( u0, u1, u2 ) - 1 );
	const sy = Math.max( 0, Math.min( v0, v1, v2 ) - 1 );
	const sw = Math.min( img.width, Math.max( u0, u1, u2 ) + 1 ) - sx;
	const sh = Math.min( img.height, Math.max( v0, v1, v2 ) + 1 ) - sy;
	if ( sw > 0 && sh > 0 ) {
		ctx.drawImage( img, sx, sy, sw, sh, sx, sy, sw, sh );
	}
	ctx.restore();
}

const pathQuad = ( ctx, q ) => {
	ctx.beginPath();
	ctx.moveTo( q[ 0 ][ 0 ], q[ 0 ][ 1 ] );
	for ( let i = 1; i < 4; i++ ) {
		ctx.lineTo( q[ i ][ 0 ], q[ i ][ 1 ] );
	}
	ctx.closePath();
};

/**
 * Trace a face outline (or an inner box of it) with optional per-corner
 * radii, sampling the projected geometry so rounded corners stay correct
 * under perspective. corners = [TL, TR, BR, BL], each [ru, rv] in face
 * UV units or null for a square corner.
 * @param ctx
 * @param rect3
 * @param P
 * @param box
 * @param corners
 */
function facePath( ctx, rect3, P, box = [ 0, 0, 1, 1 ], corners = null ) {
	const [ u0, v0, u1, v1 ] = box;
	const cs = corners || [ null, null, null, null ];
	const pts = [];
	const corner = ( c, cu, cv, a0, du, dv ) => {
		if ( ! c || ! c[ 0 ] || ! c[ 1 ] ) {
			pts.push( [ cu, cv ] );
			return;
		}
		const ou = cu + du * c[ 0 ];
		const ov = cv + dv * c[ 1 ];
		for ( let i = 0; i <= 5; i++ ) {
			const a = a0 + ( i / 5 ) * ( Math.PI / 2 );
			pts.push( [
				ou + Math.cos( a ) * c[ 0 ],
				ov + Math.sin( a ) * c[ 1 ],
			] );
		}
	};
	corner( cs[ 0 ], u0, v0, Math.PI, 1, 1 );
	corner( cs[ 1 ], u1, v0, 1.5 * Math.PI, -1, 1 );
	corner( cs[ 2 ], u1, v1, 0, -1, -1 );
	corner( cs[ 3 ], u0, v1, 0.5 * Math.PI, 1, -1 );
	ctx.beginPath();
	pts.forEach( ( [ u, v ], i ) => {
		const [ x, y ] = P( rect3, u, v );
		if ( i ) {
			ctx.lineTo( x, y );
		} else {
			ctx.moveTo( x, y );
		}
	} );
	ctx.closePath();
}

/**
 * Render a mockup into a fresh transparent canvas of the given size.
 *
 * @param {Object}                          params MOCKUP_DEFAULTS-shaped params.
 * @param {HTMLImageElement|HTMLCanvasElement|null} art Front artwork.
 * @param {number}                          outW   Canvas width.
 * @param {number}                          outH   Canvas height.
 * @return {HTMLCanvasElement} The rendered mockup.
 */
export function renderMockup( params, art, outW, outH ) {
	const p = { ...MOCKUP_DEFAULTS, ...params };
	const aspect =
		art && art.width && art.height ? art.width / art.height : null;
	const scene = mockupScene( p, aspect );
	const canvas = createCanvas( Math.max( 2, outW ), Math.max( 2, outH ) );
	const ctx = canvas.getContext( '2d' );

	// Fit the projected bbox plus room for the ground shadow.
	const { bbox } = scene;
	const shadowPad = bbox.w * 0.075 * ( p.shadow / 100 );
	const s = Math.min(
		( outW * 0.9 ) / bbox.w,
		( outH * 0.9 ) / ( bbox.h + shadowPad )
	);
	const ox = outW / 2 - ( bbox.x + bbox.w / 2 ) * s;
	const oy = outH / 2 - ( bbox.y + ( bbox.h + shadowPad ) / 2 ) * s;
	const tp = ( [ x, y ] ) => [ x * s + ox, y * s + oy ];
	const P = ( rect3, u, v ) => tp( scene.project( rectAt( rect3, u, v ) ) );

	const material = hexRgb( p.material );
	const bezelRgb = blendRgb( material, [ 16, 18, 22 ], 0.72 );
	const pagesRgb = hexRgb( PAGES );

	/* Ground shadow: a soft ellipse nudged away from the light. */
	if ( p.shadow > 0 ) {
		const bw = bbox.w * s;
		const cy = ( bbox.y + bbox.h ) * s + oy + bw * 0.015;
		const lightA = ( ( p.light - 50 ) / 50 ) * 0.6;
		const cx =
			ox + ( bbox.x + bbox.w / 2 ) * s - Math.sin( lightA ) * bw * 0.08;
		const rx = bw * 0.54;
		const ry = Math.max( 5, bw * 0.05 );
		const g = ctx.createRadialGradient( cx, cy, 0, cx, cy, rx );
		const a = 0.42 * ( p.shadow / 100 );
		g.addColorStop( 0, `rgba(15,18,26,${ a })` );
		g.addColorStop( 0.65, `rgba(15,18,26,${ a * 0.45 })` );
		g.addColorStop( 1, 'rgba(15,18,26,0)' );
		ctx.save();
		ctx.translate( cx, cy );
		ctx.scale( 1, ry / rx );
		ctx.translate( -cx, -cy );
		ctx.fillStyle = g;
		ctx.beginPath();
		ctx.arc( cx, cy, rx, 0, 2 * Math.PI );
		ctx.fill();
		ctx.restore();
	}

	for ( const f of scene.faces ) {
		const q = f.quad.map( tp );
		const k = ( 0.45 + 0.55 * f.shade ) * ( f.dim || 1 );

		if ( 'image' === f.role && art ) {
			const box = f.art || [ 0, 0, 1, 1 ];
			ctx.save();
			facePath( ctx, f.rect3, P, [ 0, 0, 1, 1 ], f.cornersUV );
			ctx.clip();
			// Case plastic behind an inset artwork sheet (dvd rim, cd tray).
			if ( f.art ) {
				const base =
					'hinge' === f.detail ? [ 34, 37, 44 ] : [ 20, 22, 26 ];
				ctx.fillStyle = rgbCss( base, 0.55 + 0.45 * f.shade );
				ctx.fill();
			}
			ctx.save();
			if ( f.art ) {
				const shrink = ( c ) =>
					c
						? [
								Math.max( 0, c[ 0 ] - 0.015 ),
								Math.max( 0, c[ 1 ] - 0.015 ),
						  ]
						: null;
				facePath(
					ctx,
					f.rect3,
					P,
					box,
					f.cornersUV ? f.cornersUV.map( shrink ) : null
				);
				ctx.clip();
			}
			const qw = Math.max(
				Math.hypot(
					q[ 1 ][ 0 ] - q[ 0 ][ 0 ],
					q[ 1 ][ 1 ] - q[ 0 ][ 1 ]
				),
				Math.hypot(
					q[ 2 ][ 0 ] - q[ 3 ][ 0 ],
					q[ 2 ][ 1 ] - q[ 3 ][ 1 ]
				)
			);
			const qh = Math.max(
				Math.hypot(
					q[ 3 ][ 0 ] - q[ 0 ][ 0 ],
					q[ 3 ][ 1 ] - q[ 0 ][ 1 ]
				),
				Math.hypot(
					q[ 2 ][ 0 ] - q[ 1 ][ 0 ],
					q[ 2 ][ 1 ] - q[ 1 ][ 1 ]
				)
			);
			const cols = Math.max( 4, Math.min( 26, Math.ceil( qw / 42 ) ) );
			const rows = Math.max( 4, Math.min( 26, Math.ceil( qh / 42 ) ) );
			const iw = art.width;
			const ih = art.height;
			const bu = ( t ) => box[ 0 ] + t * ( box[ 2 ] - box[ 0 ] );
			const bv = ( t ) => box[ 1 ] + t * ( box[ 3 ] - box[ 1 ] );
			for ( let i = 0; i < cols; i++ ) {
				for ( let j = 0; j < rows; j++ ) {
					const u0 = i / cols;
					const u1 = ( i + 1 ) / cols;
					const v0 = j / rows;
					const v1 = ( j + 1 ) / rows;
					const d00 = P( f.rect3, bu( u0 ), bv( v0 ) );
					const d10 = P( f.rect3, bu( u1 ), bv( v0 ) );
					const d11 = P( f.rect3, bu( u1 ), bv( v1 ) );
					const d01 = P( f.rect3, bu( u0 ), bv( v1 ) );
					const s00 = [ u0 * iw, v0 * ih ];
					const s10 = [ u1 * iw, v0 * ih ];
					const s11 = [ u1 * iw, v1 * ih ];
					const s01 = [ u0 * iw, v1 * ih ];
					tri( ctx, art, [ s00, s10, s11 ], [ d00, d10, d11 ] );
					tri( ctx, art, [ s00, s11, s01 ], [ d00, d11, d01 ] );
				}
			}
			ctx.restore();
			// Lambert as a darkening veil so the artwork keeps its colors.
			const veil =
				Math.max( 0, 0.32 * ( 1 - f.shade / 0.85 ) ) +
				( 1 - ( f.dim || 1 ) ) * 0.5;
			if ( veil > 0.004 ) {
				facePath( ctx, f.rect3, P, [ 0, 0, 1, 1 ], f.cornersUV );
				ctx.fillStyle = `rgba(8,10,14,${ Math.min( 0.5, veil ) })`;
				ctx.fill();
			}
			ctx.restore();
		} else if ( 'image' === f.role ) {
			// No artwork yet: neutral placeholder keeps the shape readable.
			ctx.save();
			facePath( ctx, f.rect3, P, [ 0, 0, 1, 1 ], f.cornersUV );
			ctx.fillStyle = rgbCss( [ 154, 163, 173 ], k );
			ctx.fill();
			ctx.restore();
		} else {
			let rgb = material;
			if ( 'pages' === f.role ) {
				rgb = pagesRgb;
			} else if ( f.bezel ) {
				rgb = bezelRgb;
			}
			ctx.save();
			pathQuad( ctx, q );
			ctx.fillStyle = rgbCss( rgb, k );
			ctx.fill();
			if ( 'pages' === f.role ) {
				// Page edges: thin lines across the block's thickness.
				ctx.clip();
				const across = Math.max(
					Math.hypot(
						q[ 1 ][ 0 ] - q[ 0 ][ 0 ],
						q[ 1 ][ 1 ] - q[ 0 ][ 1 ]
					),
					Math.hypot(
						q[ 2 ][ 0 ] - q[ 3 ][ 0 ],
						q[ 2 ][ 1 ] - q[ 3 ][ 1 ]
					)
				);
				const n = Math.max(
					3,
					Math.min( 20, Math.round( across / 3.5 ) )
				);
				ctx.strokeStyle = 'rgba(60,55,45,0.16)';
				ctx.lineWidth = 1;
				for ( let i = 1; i < n; i++ ) {
					const u = i / n;
					const a = P( f.rect3, u, 0.02 );
					const b = P( f.rect3, u, 0.98 );
					ctx.beginPath();
					ctx.moveTo( a[ 0 ], a[ 1 ] );
					ctx.lineTo( b[ 0 ], b[ 1 ] );
					ctx.stroke();
				}
			} else if ( 'plastic' === f.detail ) {
				ctx.fillStyle = 'rgba(255,255,255,0.16)';
				ctx.fill();
			}
			ctx.restore();
		}

		/* CD jewel case: hinge bars, inlay edge and plastic lid edges. */
		if ( 'hinge' === f.detail ) {
			ctx.save();
			facePath( ctx, f.rect3, P );
			ctx.clip();
			// Two translucent hinge bars left of the inlay card.
			ctx.fillStyle = 'rgba(255,255,255,0.3)';
			for ( const [ a, b ] of [
				[ 0.016, 0.042 ],
				[ 0.06, 0.086 ],
			] ) {
				pathQuad( ctx, [
					P( f.rect3, a, 0.015 ),
					P( f.rect3, b, 0.015 ),
					P( f.rect3, b, 0.985 ),
					P( f.rect3, a, 0.985 ),
				] );
				ctx.fill();
			}
			const line = ( u0, v0, u1, v1, style, width ) => {
				const a = P( f.rect3, u0, v0 );
				const b = P( f.rect3, u1, v1 );
				ctx.strokeStyle = style;
				ctx.lineWidth = width;
				ctx.beginPath();
				ctx.moveTo( a[ 0 ], a[ 1 ] );
				ctx.lineTo( b[ 0 ], b[ 1 ] );
				ctx.stroke();
			};
			// Inlay card edge next to the hinge zone.
			line( 0.1, 0.012, 0.1, 0.988, 'rgba(10,12,16,0.30)', 1 );
			// Polished lid: bright top edge, soft bottom edge.
			line( 0.008, 0.014, 0.992, 0.014, 'rgba(255,255,255,0.38)', 1.4 );
			line( 0.008, 0.988, 0.992, 0.988, 'rgba(255,255,255,0.16)', 1.2 );
			ctx.restore();
			ctx.save();
			facePath( ctx, f.rect3, P );
			ctx.strokeStyle = 'rgba(255,255,255,0.28)';
			ctx.lineWidth = 1.5;
			ctx.stroke();
			ctx.restore();
		}

		/* DVD keepcase: crease shadow along the spine fold. */
		if ( 'dvdCase' === f.detail && art ) {
			ctx.save();
			facePath( ctx, f.rect3, P, [ 0, 0, 1, 1 ], f.cornersUV );
			ctx.clip();
			const g0 = P( f.rect3, 0.016, 0.5 );
			const g1 = P( f.rect3, 0.1, 0.5 );
			const g = ctx.createLinearGradient(
				g0[ 0 ],
				g0[ 1 ],
				g1[ 0 ],
				g1[ 1 ]
			);
			g.addColorStop( 0, 'rgba(8,10,14,0.32)' );
			g.addColorStop( 0.45, 'rgba(8,10,14,0.10)' );
			g.addColorStop( 1, 'rgba(8,10,14,0)' );
			ctx.fillStyle = g;
			ctx.fill();
			ctx.restore();
		}

		/* Sheen on glossy fronts: soft gradient, or two crisp streaks on
		   polished plastic (CD lid). */
		if ( f.gloss && p.gloss > 0 && 'image' === f.role ) {
			const a = 0.26 * ( p.gloss / 100 ) * f.gloss;
			const g = ctx.createLinearGradient(
				q[ 0 ][ 0 ],
				q[ 0 ][ 1 ],
				q[ 2 ][ 0 ],
				q[ 2 ][ 1 ]
			);
			if ( 'streak' === f.glossStyle ) {
				g.addColorStop( 0.08, 'rgba(255,255,255,0)' );
				g.addColorStop( 0.17, `rgba(255,255,255,${ a })` );
				g.addColorStop( 0.27, 'rgba(255,255,255,0)' );
				g.addColorStop( 0.44, 'rgba(255,255,255,0)' );
				g.addColorStop( 0.53, `rgba(255,255,255,${ a * 0.45 })` );
				g.addColorStop( 0.64, 'rgba(255,255,255,0)' );
			} else {
				g.addColorStop( 0, `rgba(255,255,255,${ a })` );
				g.addColorStop( 0.38, `rgba(255,255,255,${ a * 0.28 })` );
				g.addColorStop( 0.55, 'rgba(255,255,255,0)' );
			}
			ctx.save();
			facePath( ctx, f.rect3, P, [ 0, 0, 1, 1 ], f.cornersUV );
			ctx.fillStyle = g;
			ctx.fill();
			ctx.restore();
		}
	}
	return canvas;
}

/**
 * Crop a canvas to its non-transparent content (plus padding). Returns
 * the input when it is fully transparent.
 * @param canvas
 * @param pad
 */
export function trimTransparent( canvas, pad = 4 ) {
	const ctx = canvas.getContext( '2d' );
	const { width: w, height: h } = canvas;
	const data = ctx.getImageData( 0, 0, w, h ).data;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( data[ ( y * w + x ) * 4 + 3 ] > 2 ) {
				if ( x < minX ) {
					minX = x;
				}
				if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				}
				if ( y > maxY ) {
					maxY = y;
				}
			}
		}
	}
	if ( maxX < 0 ) {
		return canvas;
	}
	minX = Math.max( 0, minX - pad );
	minY = Math.max( 0, minY - pad );
	maxX = Math.min( w - 1, maxX + pad );
	maxY = Math.min( h - 1, maxY + pad );
	const out = createCanvas( maxX - minX + 1, maxY - minY + 1 );
	out.getContext( '2d' ).drawImage(
		canvas,
		minX,
		minY,
		out.width,
		out.height,
		0,
		0,
		out.width,
		out.height
	);
	return out;
}
