/**
 * Background Studio engine (v1.105.0): deterministic, seed-based
 * background generators (mesh gradient, organic blobs/waves, geometric
 * patterns, low-poly) rendered straight to canvas. All geometry uses
 * relative units and fixed sample counts, so the preview and the final
 * full-resolution render look identical for the same parameters.
 */

import { hexToRgb, rgbToHex } from './color';
import { createCanvas } from './raster';
import { encodeCanvas } from './canvas-encode';

export const BG_STYLES = [
	'mesh',
	'organic',
	'geo',
	'poly',
	'topo',
	'halftone',
	'rings',
	'confetti',
	'gradient',
	'aurora',
	'glow',
	'bokeh',
	'stars',
	'terrazzo',
	'plaid',
	'scales',
];

export const BG_DEFAULTS = {
	style: 'mesh',
	colors: [ '#1e2a78', '#3b66ff', '#b388ff' ],
	seed: 1,
	grain: 15,
	mesh: { points: 5, softness: 60 },
	organic: { variant: 'blobs', count: 6, shape: 50 },
	geo: { variant: 'dots', size: 40, gap: 50, angle: 0 },
	poly: { cell: 40, variance: 60 },
	topo: { lines: 12, weight: 40, rough: 50 },
	halftone: { size: 55, gap: 45, angle: 45 },
	rings: { gap: 45, weight: 35, warp: 25 },
	confetti: { count: 55, size: 40, mix: 60 },
	gradient: { kind: 'linear', angle: 135, x: 50, y: 40 },
	aurora: { bands: 3, width: 50, height: 50 },
	glow: { x: 20, y: 18, size: 70 },
	bokeh: { count: 30, size: 45, blur: 50 },
	stars: { count: 50, size: 40, glow: 50 },
	terrazzo: { count: 50, size: 45, mix: 50 },
	plaid: { size: 50, bands: 50, weave: 50 },
	scales: { size: 45, rings: 4, weight: 40 },
};

/** Deterministic PRNG (mulberry32), the whole engine draws from it. */
export function mulberry32( seed ) {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

const clamp01 = ( v ) => Math.min( 1, Math.max( 0, v ) );
const lerp = ( a, b, t ) => a + ( b - a ) * t;

/** Interpolated palette color at t (0..1). */
export function paletteAt( colors, t ) {
	const list = colors && colors.length ? colors : BG_DEFAULTS.colors;
	if ( 1 === list.length ) {
		return list[ 0 ];
	}
	const x = clamp01( t ) * ( list.length - 1 );
	const i = Math.min( list.length - 2, Math.floor( x ) );
	const f = x - i;
	const a = hexToRgb( list[ i ] );
	const b = hexToRgb( list[ i + 1 ] );
	return rgbToHex(
		Math.round( lerp( a.r, b.r, f ) ),
		Math.round( lerp( a.g, b.g, f ) ),
		Math.round( lerp( a.b, b.b, f ) )
	);
}

/** Shade a hex color by factor (0.9 darker, 1.1 lighter). */
function shade( hex, factor ) {
	const { r, g, b } = hexToRgb( hex );
	const s = ( v ) => Math.max( 0, Math.min( 255, Math.round( v * factor ) ) );
	return rgbToHex( s( r ), s( g ), s( b ) );
}

/* ------------------------------- styles ------------------------------- */

function drawMesh( ctx, w, h, colors, opts, rand, tile ) {
	const points = Math.max( 2, Math.min( 8, opts.points || 5 ) );
	const softness = clamp01( ( opts.softness ?? 60 ) / 100 );
	// The mesh look comes from radial gradients painted at LOW resolution
	// and upscaled with smoothing; lower res = creamier blends.
	const res = Math.round( lerp( 180, 28, softness ) );
	const off = createCanvas( res, res );
	const octx = off.getContext( '2d' );
	octx.fillStyle = colors[ 0 ] || '#1e2a78';
	octx.fillRect( 0, 0, res, res );
	// Tile mode: every gradient is stamped at the 8 wrap offsets too, so
	// the edges continue seamlessly when the tile repeats.
	const stamps = tile
		? [ -1, 0, 1 ].flatMap( ( sx ) =>
				[ -1, 0, 1 ].map( ( sy ) => [ sx * res, sy * res ] )
		  )
		: [ [ 0, 0 ] ];
	for ( let i = 0; i < points; i++ ) {
		const cx = rand() * res;
		const cy = rand() * res;
		const radius = res * lerp( 0.45, 0.95, rand() );
		const color = colors[ ( i + 1 ) % colors.length ] || colors[ 0 ];
		const { r, g, b } = hexToRgb( color );
		for ( const [ sx, sy ] of stamps ) {
			const grad = octx.createRadialGradient(
				cx + sx,
				cy + sy,
				0,
				cx + sx,
				cy + sy,
				radius
			);
			grad.addColorStop( 0, `rgba(${ r },${ g },${ b },0.95)` );
			grad.addColorStop( 1, `rgba(${ r },${ g },${ b },0)` );
			octx.fillStyle = grad;
			octx.fillRect( 0, 0, res, res );
		}
	}
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( off, 0, 0, res, res, 0, 0, w, h );
}

function blobPoints( cx, cy, radius, wobble, rand ) {
	const n = 10;
	const pts = [];
	for ( let i = 0; i < n; i++ ) {
		const angle = ( i / n ) * 2 * Math.PI;
		const r = radius * ( 1 - wobble * rand() );
		pts.push( [ cx + Math.cos( angle ) * r, cy + Math.sin( angle ) * r ] );
	}
	return pts;
}

function blobPath( ctx, pts, ox = 0, oy = 0 ) {
	const n = pts.length;
	// Smooth closed curve through midpoints.
	ctx.beginPath();
	const mid = ( a, b ) => [
		( a[ 0 ] + b[ 0 ] ) / 2 + ox,
		( a[ 1 ] + b[ 1 ] ) / 2 + oy,
	];
	const m = mid( pts[ n - 1 ], pts[ 0 ] );
	ctx.moveTo( m[ 0 ], m[ 1 ] );
	for ( let i = 0; i < n; i++ ) {
		const next = mid( pts[ i ], pts[ ( i + 1 ) % n ] );
		ctx.quadraticCurveTo(
			pts[ i ][ 0 ] + ox,
			pts[ i ][ 1 ] + oy,
			next[ 0 ],
			next[ 1 ]
		);
	}
	ctx.closePath();
}

function drawOrganic( ctx, w, h, colors, opts, rand, tile ) {
	const variant = 'waves' === opts.variant ? 'waves' : 'blobs';
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );
	if ( 'waves' === variant ) {
		const bands = Math.max( 2, Math.min( 8, opts.count || 4 ) );
		const amp = lerp( 0.02, 0.18, clamp01( ( opts.shape ?? 50 ) / 100 ) );
		for ( let bIdx = 1; bIdx <= bands; bIdx++ ) {
			const base = ( bIdx / ( bands + 1 ) ) * 1.15;
			const f1 = lerp( 1.5, 4, rand() );
			const f2 = lerp( 4, 9, rand() );
			const p1 = rand() * 2 * Math.PI;
			const p2 = rand() * 2 * Math.PI;
			ctx.beginPath();
			ctx.moveTo( 0, h );
			for ( let s = 0; s <= 48; s++ ) {
				const x = s / 48;
				const y =
					base +
					Math.sin( x * f1 * Math.PI + p1 ) * amp +
					Math.sin( x * f2 * Math.PI + p2 ) * amp * 0.4;
				ctx.lineTo( x * w, y * h );
			}
			ctx.lineTo( w, h );
			ctx.closePath();
			ctx.fillStyle = paletteAt( colors, bIdx / bands );
			ctx.fill();
		}
		return;
	}
	const count = Math.max( 2, Math.min( 12, opts.count || 6 ) );
	const wobble = lerp( 0.45, 0.05, clamp01( ( opts.shape ?? 50 ) / 100 ) );
	const unit = Math.min( w, h );
	const stamps = tile
		? [ -1, 0, 1 ].flatMap( ( sx ) =>
				[ -1, 0, 1 ].map( ( sy ) => [ sx * w, sy * h ] )
		  )
		: [ [ 0, 0 ] ];
	for ( let i = 0; i < count; i++ ) {
		const cx = rand() * w;
		const cy = rand() * h;
		const radius =
			unit * lerp( 0.12, 0.4, rand() ) * ( 1 - ( i / count ) * 0.5 );
		ctx.fillStyle = paletteAt(
			colors,
			count > 1 ? i / ( count - 1 ) : 0.5
		);
		const pts = blobPoints( cx, cy, radius, wobble, rand );
		for ( const [ sx, sy ] of stamps ) {
			blobPath( ctx, pts, sx, sy );
			ctx.fill();
		}
	}
}

function drawGeo( ctx, w, h, colors, opts, rand, tile ) {
	const variant = opts.variant || 'dots';
	const size = clamp01( ( opts.size ?? 40 ) / 100 );
	const gap = clamp01( ( opts.gap ?? 50 ) / 100 );
	const angle = ( ( opts.angle || 0 ) * Math.PI ) / 180;
	const unit = Math.min( w, h );
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );
	const ink = colors[ 1 ] || shade( colors[ 0 ] || '#1e2a78', 1.5 );

	if ( tile && 'rays' !== variant ) {
		// Tileable lattice: no rotation, the cell snapped so a whole
		// (even, for the dot stagger) number of cells fits the tile.
		const raw = unit * lerp( 0.02, 0.16, gap );
		const n = Math.max( 2, 2 * Math.round( w / raw / 2 ) );
		const cell = w / n;
		ctx.fillStyle = ink;
		if ( 'stripes' === variant ) {
			const band = cell * lerp( 0.15, 0.9, size );
			for ( let x = 0; x < w; x += cell ) {
				ctx.fillRect( x, 0, band, h );
			}
		} else if ( 'grid' === variant ) {
			const line = Math.max( 1, cell * lerp( 0.04, 0.35, size ) );
			for ( let x = 0; x < w; x += cell ) {
				ctx.fillRect( x, 0, line, h );
			}
			for ( let y = 0; y < h; y += cell ) {
				ctx.fillRect( 0, y, w, line );
			}
		} else {
			const radius = ( cell / 2 ) * lerp( 0.15, 0.85, size );
			for ( let row = 0; row < n; row++ ) {
				const offset = row % 2 ? cell / 2 : 0;
				for ( let col = -1; col <= n; col++ ) {
					ctx.beginPath();
					ctx.arc(
						col * cell + offset,
						row * cell + cell / 2,
						radius,
						0,
						2 * Math.PI
					);
					ctx.fill();
				}
			}
		}
		return;
	}

	if ( 'rays' === variant ) {
		const count = 2 * Math.round( lerp( 4, 16, size ) );
		const cx = w * lerp( 0.35, 0.65, rand() );
		const cy = h * lerp( 0.35, 0.65, rand() );
		const reach = Math.hypot( w, h );
		for ( let i = 0; i < count; i++ ) {
			if ( i % 2 ) {
				continue;
			}
			const a0 = angle + ( i / count ) * 2 * Math.PI;
			const a1 = angle + ( ( i + 1 ) / count ) * 2 * Math.PI;
			ctx.beginPath();
			ctx.moveTo( cx, cy );
			ctx.lineTo(
				cx + Math.cos( a0 ) * reach,
				cy + Math.sin( a0 ) * reach
			);
			ctx.lineTo(
				cx + Math.cos( a1 ) * reach,
				cy + Math.sin( a1 ) * reach
			);
			ctx.closePath();
			ctx.fillStyle = ink;
			ctx.fill();
		}
		return;
	}

	// dots/grid/stripes draw an oversized lattice rotated around center.
	ctx.save();
	ctx.translate( w / 2, h / 2 );
	ctx.rotate( angle );
	const reach = Math.hypot( w, h ) / 2;
	const cell = unit * lerp( 0.02, 0.16, gap );
	if ( 'stripes' === variant ) {
		const band = cell * lerp( 0.15, 0.9, size );
		ctx.fillStyle = ink;
		for ( let x = -reach; x <= reach; x += cell ) {
			ctx.fillRect( x, -reach, band, reach * 2 );
		}
	} else if ( 'grid' === variant ) {
		const line = Math.max( 1, cell * lerp( 0.04, 0.35, size ) );
		ctx.fillStyle = ink;
		for ( let x = -reach; x <= reach; x += cell ) {
			ctx.fillRect( x, -reach, line, reach * 2 );
			ctx.fillRect( -reach, x, reach * 2, line );
		}
	} else {
		const radius = ( cell / 2 ) * lerp( 0.15, 0.85, size );
		ctx.fillStyle = ink;
		let row = 0;
		for ( let y = -reach; y <= reach; y += cell, row++ ) {
			const offset = row % 2 ? cell / 2 : 0;
			for ( let x = -reach; x <= reach; x += cell ) {
				ctx.beginPath();
				ctx.arc( x + offset, y, radius, 0, 2 * Math.PI );
				ctx.fill();
			}
		}
	}
	ctx.restore();
}

function drawPoly( ctx, w, h, colors, opts, rand ) {
	// Opaque base: triangle edges antialias against SOMETHING; without
	// this the seams keep sub-255 alpha.
	ctx.fillStyle = paletteAt( colors, 0.5 );
	ctx.fillRect( 0, 0, w, h );
	const cols = Math.round(
		lerp( 22, 5, clamp01( ( opts.cell ?? 40 ) / 100 ) )
	);
	const rows = Math.max( 3, Math.round( ( cols * h ) / w ) );
	const variance = clamp01( ( opts.variance ?? 60 ) / 100 ) * 0.75;
	const cw = w / cols;
	const ch = h / rows;
	// Jittered grid; edge points stay on their edge so the mesh covers.
	const pts = [];
	for ( let j = 0; j <= rows; j++ ) {
		pts[ j ] = [];
		for ( let i = 0; i <= cols; i++ ) {
			const jx =
				0 === i || cols === i ? 0 : ( rand() - 0.5 ) * cw * variance;
			const jy =
				0 === j || rows === j ? 0 : ( rand() - 0.5 ) * ch * variance;
			pts[ j ][ i ] = [ i * cw + jx, j * ch + jy ];
		}
	}
	const tri = ( a, b, c ) => {
		const t =
			( a[ 0 ] + b[ 0 ] + c[ 0 ] ) / ( 3 * w ) / 2 +
			( a[ 1 ] + b[ 1 ] + c[ 1 ] ) / ( 3 * h ) / 2 +
			( rand() - 0.5 ) * 0.12;
		const fill = shade(
			paletteAt( colors, t ),
			lerp( 0.92, 1.08, rand() )
		);
		ctx.beginPath();
		ctx.moveTo( a[ 0 ], a[ 1 ] );
		ctx.lineTo( b[ 0 ], b[ 1 ] );
		ctx.lineTo( c[ 0 ], c[ 1 ] );
		ctx.closePath();
		ctx.fillStyle = fill;
		// Hairline stroke in the fill color hides antialiasing seams.
		ctx.strokeStyle = fill;
		ctx.lineWidth = 1;
		ctx.fill();
		ctx.stroke();
	};
	for ( let j = 0; j < rows; j++ ) {
		for ( let i = 0; i < cols; i++ ) {
			const p00 = pts[ j ][ i ];
			const p10 = pts[ j ][ i + 1 ];
			const p01 = pts[ j + 1 ][ i ];
			const p11 = pts[ j + 1 ][ i + 1 ];
			if ( rand() < 0.5 ) {
				tri( p00, p10, p11 );
				tri( p00, p11, p01 );
			} else {
				tri( p00, p10, p01 );
				tri( p10, p11, p01 );
			}
		}
	}
}

/* ---- topographic contours -------------------------------------------- */

/*
 * Marching squares over a smooth height field. The field is a sum of sine
 * products with INTEGER frequencies, which is the whole trick behind the
 * tile mode: an integer number of periods across the tile means the field
 * meets itself at the edge, so the contours continue without a seam.
 *
 * The 16 cases are symmetric (case i and 15-i cut the same edges), so only
 * the segment endpoints matter, not which side is "inside".
 */
const TOPO_CASES = [
	[],
	[ [ 3, 2 ] ],
	[ [ 2, 1 ] ],
	[ [ 3, 1 ] ],
	[ [ 0, 1 ] ],
	[
		[ 0, 3 ],
		[ 2, 1 ],
	],
	[ [ 0, 2 ] ],
	[ [ 0, 3 ] ],
	[ [ 3, 0 ] ],
	[ [ 2, 0 ] ],
	[
		[ 3, 0 ],
		[ 1, 2 ],
	],
	[ [ 1, 0 ] ],
	[ [ 3, 1 ] ],
	[ [ 2, 1 ] ],
	[ [ 3, 2 ] ],
	[],
];

function drawTopo( ctx, w, h, colors, opts, rand, tile ) {
	const levels = Math.max(
		3,
		Math.min( 24, Math.round( opts.lines ?? 12 ) )
	);
	const weight = clamp01( ( opts.weight ?? 40 ) / 100 );
	const rough = clamp01( ( opts.rough ?? 50 ) / 100 );
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );

	const waves = [];
	const count = 3 + Math.round( rough * 3 );
	for ( let i = 0; i < count; i++ ) {
		waves.push( {
			kx: 1 + Math.floor( rand() * ( 1 + rough * 4 ) ),
			ky: 1 + Math.floor( rand() * ( 1 + rough * 4 ) ),
			px: rand() * 2 * Math.PI,
			py: rand() * 2 * Math.PI,
			amp: lerp( 1, 0.35, i / count ),
		} );
	}
	const field = ( x, y ) => {
		let v = 0;
		let sum = 0;
		for ( const wv of waves ) {
			v +=
				wv.amp *
				Math.sin( 2 * Math.PI * wv.kx * x + wv.px ) *
				Math.cos( 2 * Math.PI * wv.ky * y + wv.py );
			sum += wv.amp;
		}
		return ( v / sum + 1 ) / 2;
	};

	// Fixed sample count, so the picture is the same at any resolution.
	const n = 110;
	const grid = [];
	for ( let j = 0; j <= n; j++ ) {
		grid[ j ] = [];
		for ( let i = 0; i <= n; i++ ) {
			grid[ j ][ i ] = field( i / n, j / n );
		}
	}
	const cw = w / n;
	const ch = h / n;
	ctx.lineWidth = Math.max(
		0.6,
		( Math.min( w, h ) / 400 ) * lerp( 0.6, 3.4, weight )
	);
	ctx.lineCap = 'round';
	const point = ( edge, i, j, v00, v10, v11, v01, level ) => {
		const t = ( a, b ) => ( 0 === b - a ? 0.5 : ( level - a ) / ( b - a ) );
		if ( 0 === edge ) {
			return [ ( i + t( v00, v10 ) ) * cw, j * ch ];
		}
		if ( 1 === edge ) {
			return [ ( i + 1 ) * cw, ( j + t( v10, v11 ) ) * ch ];
		}
		if ( 2 === edge ) {
			return [ ( i + t( v01, v11 ) ) * cw, ( j + 1 ) * ch ];
		}
		return [ i * cw, ( j + t( v00, v01 ) ) * ch ];
	};
	for ( let l = 1; l <= levels; l++ ) {
		const level = l / ( levels + 1 );
		ctx.strokeStyle = paletteAt( colors, l / levels );
		ctx.beginPath();
		for ( let j = 0; j < n; j++ ) {
			for ( let i = 0; i < n; i++ ) {
				const v00 = grid[ j ][ i ];
				const v10 = grid[ j ][ i + 1 ];
				const v11 = grid[ j + 1 ][ i + 1 ];
				const v01 = grid[ j + 1 ][ i ];
				const idx =
					( v00 > level ? 8 : 0 ) |
					( v10 > level ? 4 : 0 ) |
					( v11 > level ? 2 : 0 ) |
					( v01 > level ? 1 : 0 );
				for ( const [ ea, eb ] of TOPO_CASES[ idx ] ) {
					const a = point( ea, i, j, v00, v10, v11, v01, level );
					const b = point( eb, i, j, v00, v10, v11, v01, level );
					ctx.moveTo( a[ 0 ], a[ 1 ] );
					ctx.lineTo( b[ 0 ], b[ 1 ] );
				}
			}
		}
		ctx.stroke();
	}
	// tile is implicit: the field wraps, nothing else to do.
	void tile;
}

/* ---- halftone --------------------------------------------------------- */

function drawHalftone( ctx, w, h, colors, opts, rand, tile ) {
	const size = clamp01( ( opts.size ?? 55 ) / 100 );
	const gap = clamp01( ( opts.gap ?? 45 ) / 100 );
	const angle = ( ( opts.angle ?? 45 ) * Math.PI ) / 180;
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );
	const ink = colors[ 1 ] || shade( colors[ 0 ] || '#1e2a78', 1.6 );
	ctx.fillStyle = ink;

	const unit = Math.min( w, h );
	// The ramp is what makes this a halftone rather than a dot grid: the dot
	// grows along one direction. A straight ramp cannot repeat, so the tile
	// mode swings it back with a cosine instead - same look, and it meets
	// itself at the edge. The lattice is snapped to whole cells there too.
	const ramp = tile
		? ( x, y ) =>
				( 1 -
					Math.cos(
						2 *
							Math.PI *
							( x * Math.cos( angle ) + y * Math.sin( angle ) )
					) ) /
				2
		: ( x, y ) =>
				clamp01(
					( x * Math.cos( angle ) + y * Math.sin( angle ) + 1 ) / 2
				);

	const raw = unit * lerp( 0.02, 0.13, gap );
	const cols = Math.max( 3, Math.round( w / raw ) );
	const cell = w / cols;
	const rows = Math.max( 3, Math.round( h / cell ) );
	const rmax = ( cell / 2 ) * lerp( 0.25, 1.05, size );
	for ( let j = 0; j < rows; j++ ) {
		for ( let i = 0; i <= cols; i++ ) {
			const cx = ( i + ( j % 2 ? 0.5 : 0 ) ) * cell;
			const cy = ( j + 0.5 ) * ( h / rows );
			const r = rmax * clamp01( ramp( cx / w, cy / h ) );
			if ( r <= 0.15 ) {
				continue;
			}
			ctx.beginPath();
			ctx.arc( cx, cy, r, 0, 2 * Math.PI );
			ctx.fill();
		}
	}
	void rand;
}

/* ---- concentric rings ------------------------------------------------- */

function drawRings( ctx, w, h, colors, opts, rand ) {
	const gap = clamp01( ( opts.gap ?? 45 ) / 100 );
	const weight = clamp01( ( opts.weight ?? 35 ) / 100 );
	const warp = clamp01( ( opts.warp ?? 25 ) / 100 );
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );

	const cx = w * lerp( 0.3, 0.7, rand() );
	const cy = h * lerp( 0.3, 0.7, rand() );
	const reach = Math.hypot( Math.max( cx, w - cx ), Math.max( cy, h - cy ) );
	const step = Math.min( w, h ) * lerp( 0.02, 0.14, gap );
	// Two low frequencies are enough to make a ring look hand-drawn rather
	// than mechanical; more turns it into a flower.
	const f1 = 2 + Math.floor( rand() * 3 );
	const f2 = 4 + Math.floor( rand() * 4 );
	const p1 = rand() * 2 * Math.PI;
	const p2 = rand() * 2 * Math.PI;
	ctx.lineWidth = Math.max( 0.6, step * lerp( 0.06, 0.5, weight ) );
	ctx.lineCap = 'round';
	let idx = 0;
	for ( let r = step; r <= reach + step; r += step, idx++ ) {
		ctx.strokeStyle = paletteAt( colors, ( idx % 12 ) / 11 );
		ctx.beginPath();
		for ( let s = 0; s <= 90; s++ ) {
			const a = ( s / 90 ) * 2 * Math.PI;
			const wob =
				1 +
				warp *
					0.22 *
					( Math.sin( a * f1 + p1 ) + 0.5 * Math.sin( a * f2 + p2 ) );
			const x = cx + Math.cos( a ) * r * wob;
			const y = cy + Math.sin( a ) * r * wob;
			if ( 0 === s ) {
				ctx.moveTo( x, y );
			} else {
				ctx.lineTo( x, y );
			}
		}
		ctx.closePath();
		ctx.stroke();
	}
}

/* ---- confetti --------------------------------------------------------- */

function confettiShape( ctx, kind, x, y, r, rot ) {
	ctx.save();
	ctx.translate( x, y );
	ctx.rotate( rot );
	ctx.beginPath();
	if ( 0 === kind ) {
		ctx.arc( 0, 0, r, 0, 2 * Math.PI );
	} else if ( 1 === kind ) {
		ctx.rect( -r, -r, r * 2, r * 2 );
	} else if ( 2 === kind ) {
		ctx.moveTo( 0, -r );
		ctx.lineTo( r, r );
		ctx.lineTo( -r, r );
		ctx.closePath();
	} else {
		ctx.rect( -r * 1.6, -r * 0.42, r * 3.2, r * 0.84 );
	}
	ctx.fill();
	ctx.restore();
}

function drawConfetti( ctx, w, h, colors, opts, rand, tile ) {
	const count = Math.max(
		8,
		Math.min( 400, Math.round( opts.count ?? 55 ) )
	);
	const size = clamp01( ( opts.size ?? 40 ) / 100 );
	const mix = clamp01( ( opts.mix ?? 60 ) / 100 );
	ctx.fillStyle = colors[ 0 ] || '#1e2a78';
	ctx.fillRect( 0, 0, w, h );
	const unit = Math.min( w, h );
	// Same wrap-stamping as the organic blobs: every piece is drawn at the
	// eight neighbouring offsets as well, so a piece crossing the edge comes
	// back on the other side.
	const stamps = tile
		? [ -1, 0, 1 ].flatMap( ( sx ) =>
				[ -1, 0, 1 ].map( ( sy ) => [ sx * w, sy * h ] )
		  )
		: [ [ 0, 0 ] ];
	// mix 0 = circles only, 1 = all four shapes.
	const kinds = 1 + Math.round( mix * 3 );
	for ( let i = 0; i < count; i++ ) {
		const x = rand() * w;
		const y = rand() * h;
		const r = unit * lerp( 0.006, 0.045, size ) * lerp( 0.6, 1.4, rand() );
		const rot = rand() * 2 * Math.PI;
		const kind = Math.floor( rand() * kinds );
		ctx.fillStyle = paletteAt( colors, 0.15 + rand() * 0.85 );
		for ( const [ sx, sy ] of stamps ) {
			confettiShape( ctx, kind, x + sx, y + sy, r, rot );
		}
	}
}

/* -------- v1.433: gradient, aurora, glow, bokeh (none of them tile) -------- */

const luminance = ( hex ) => {
	const { r, g, b } = hexToRgb( hex );
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const byLight = ( colors ) =>
	[ ...colors ].sort( ( a, b ) => luminance( a ) - luminance( b ) );
const rgba = ( hex, a ) => {
	const { r, g, b } = hexToRgb( hex );
	return `rgba(${ r },${ g },${ b },${ a })`;
};

/**
 * Paint something soft: draw it on a small canvas in full-size units and
 * scale it up. Bilinear upscaling is the blur - no canvas filters
 * (node-canvas has none, and they are slow on big documents). It grows at
 * most twice per step: every step cuts corners like Chaikin's subdivision,
 * so the result is smooth, where one big step leaves visible creases.
 */
export function soft( ctx, w, h, factor, paint ) {
	let cw = Math.max( 2, Math.round( w * factor ) );
	let ch = Math.max( 2, Math.round( h * factor ) );
	let canvas = createCanvas( cw, ch );
	const sctx = canvas.getContext( '2d' );
	sctx.scale( cw / w, ch / h );
	paint( sctx );
	while ( cw * 2 < w || ch * 2 < h ) {
		const nw = Math.min( w, cw * 2 );
		const nh = Math.min( h, ch * 2 );
		const next = createCanvas( nw, nh );
		const nctx = next.getContext( '2d' );
		nctx.imageSmoothingEnabled = true;
		nctx.drawImage( canvas, 0, 0, nw, nh );
		canvas = next;
		cw = nw;
		ch = nh;
	}
	ctx.save();
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage( canvas, 0, 0, w, h );
	ctx.restore();
}

/** A smooth gradient through every palette color, linear or radial. */
function drawGradient( ctx, w, h, colors, opts ) {
	let stops =
		colors.length > 1
			? colors
			: [ colors[ 0 ], shade( colors[ 0 ], 0.55 ) ];
	let g;
	if ( 'radial' === opts.kind ) {
		// Light in the middle, fading to the darkest color at the edge.
		stops = byLight( stops ).reverse();
		const cx = clamp01( ( opts.x ?? 50 ) / 100 ) * w;
		const cy = clamp01( ( opts.y ?? 40 ) / 100 ) * h;
		const r = Math.hypot( Math.max( cx, w - cx ), Math.max( cy, h - cy ) );
		g = ctx.createRadialGradient( cx, cy, 0, cx, cy, r );
	} else {
		const a = ( ( opts.angle ?? 135 ) * Math.PI ) / 180;
		const dx = Math.cos( a );
		const dy = Math.sin( a );
		const half = ( Math.abs( dx ) * w + Math.abs( dy ) * h ) / 2;
		g = ctx.createLinearGradient(
			w / 2 - dx * half,
			h / 2 - dy * half,
			w / 2 + dx * half,
			h / 2 + dy * half
		);
	}
	stops.forEach( ( c, i ) => g.addColorStop( i / ( stops.length - 1 ), c ) );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, w, h );
}

/** A color moved toward white by `t` (0 none, 1 white). */
const toward = ( hex, t ) => {
	const { r, g, b } = hexToRgb( hex );
	const m = ( v ) => Math.round( v + ( 255 - v ) * t );
	return rgbToHex( m( r ), m( g ), m( b ) );
};

/**
 * Smooth seeded 1D value noise over `cells` cells that wrap; `t` is in
 * cells. The values are drawn once, from `rand`.
 *
 * @param {Function} rand  Seeded random source.
 * @param {number}   cells How many cells before it repeats.
 * @return {Function} t -> 0..1.
 */
function noise1( rand, cells ) {
	const v = Float32Array.from( { length: cells }, () => rand() );
	return ( t ) => {
		const i = Math.floor( t );
		const f = t - i;
		const a = v[ ( ( i % cells ) + cells ) % cells ];
		const b = v[ ( ( ( i + 1 ) % cells ) + cells ) % cells ];
		return a + ( b - a ) * f * f * ( 3 - 2 * f );
	};
}

/** Two octaves of a noise1, still 0..1. */
const fbm2 = ( n, t ) => ( n( t ) * 2 + n( t * 2.03 + 17.3 ) ) / 3;

const smooth01 = ( a, b, v ) => {
	const t = clamp01( ( v - a ) / ( b - a ) );
	return t * t * ( 3 - 2 * t );
};

/**
 * Aurora as a light field (20.10.2026). The earlier one painted strokes and
 * blurred them; Thomas, after making it sharper: "sieht aber nicht gut
 * aus". A real aurora is a curtain of light: a fairly crisp, brighter lower
 * edge that folds as it runs across the sky, light rising from it in fine
 * vertical rays of every height, its colour changing with height, a glow
 * around it. So it is worked out per pixel now, the way a shader would:
 *
 * - per column, from seeded noise in units of the picture (so the preview
 *   and the full picture match): where the lower edge runs, how bright the
 *   rays are there, how high they reach, where the curtain folds;
 * - per pixel, only a lookup: how far above (or just below) the edge it is,
 *   which gives brightness and colour from two small tables.
 *
 * Bands sets the curtains (the farther ones lower and dimmer), Thickness
 * how tall the bright part above the edge is, Height how far the rays
 * reach. A soft halo of the same light and a few faint stars finish it.
 */
function drawAurora( ctx, w, h, colors, opts, rand ) {
	const sorted = byLight( colors );
	const sky = ctx.createLinearGradient( 0, 0, 0, h );
	sky.addColorStop( 0, shade( sorted[ 0 ], 0.22 ) );
	sky.addColorStop( 1, shade( sorted[ 0 ], 0.5 ) );
	ctx.fillStyle = sky;
	ctx.fillRect( 0, 0, w, h );
	const unit = Math.max( w, h );

	// Faint stars behind, the same number on any picture size.
	ctx.save();
	for ( let i = 0; i < 260; i++ ) {
		const x = rand() * w;
		const y = rand() * h * 0.85;
		const r = unit * ( 0.0004 + rand() * 0.0009 );
		ctx.fillStyle = `rgba(255,255,255,${ 0.12 + rand() * 0.45 })`;
		ctx.beginPath();
		ctx.arc( x, y, Math.max( 0.35, r ), 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.restore();

	const lights = sorted.length > 1 ? sorted.slice( 1 ) : sorted;
	const bands = Math.max( 1, Math.min( 6, Math.round( opts.bands ?? 3 ) ) );
	const thick = lerp( 0.12, 0.5, clamp01( ( opts.width ?? 50 ) / 100 ) );
	const reach = lerp( 0.14, 0.5, clamp01( ( opts.height ?? 50 ) / 100 ) );
	const edgePx = Math.max( 0.6, h * 0.0035 );

	const layer = createCanvas( w, h );
	const lctx = layer.getContext( '2d' );
	const img = lctx.createImageData( w, h );
	const px = img.data;
	for ( let i = 3; i < px.length; i += 4 ) {
		px[ i ] = 255;
	}

	// Brightness above the edge, by height (0 = edge, 1 = top of the rays).
	const STEPS = 512;
	const rise = new Float32Array( STEPS + 1 );
	for ( let k = 0; k <= STEPS; k++ ) {
		const d = k / STEPS;
		// Strongest at the edge, gone at the top; no even fill between
		// the rays, or the lit area reads as a hill with a hard foot.
		rise[ k ] =
			Math.pow( 1 - d, 1.3 ) * ( 0.06 + 0.94 * Math.exp( -d / thick ) );
	}

	for ( let b = 0; b < bands; b++ ) {
		const color = lights[ b % lights.length ];
		const upper = lights[ ( b + 1 ) % lights.length ];
		// Farther curtains (later bands) sit lower, reach less, glow less.
		const depth = 1 - ( b / Math.max( 1, bands ) ) * 0.45;
		const y0 = h * ( 0.42 + rand() * 0.34 + ( 1 - depth ) * 0.25 );
		// Flat arcs with small folds: big smooth waves across the whole
		// picture read as hills, not as light.
		const tilt = ( rand() * 2 - 1 ) * 0.12 * h;
		const amp = h * ( 0.015 + rand() * 0.035 );
		const freq = 0.6 + rand() * 1.0;
		const phase = rand() * Math.PI * 2;
		const wiggle = noise1( rand, 12 );
		const folds = noise1( rand, 10 );
		const active = noise1( rand, 9 );
		const mid = noise1( rand, 96 );
		const fine = noise1( rand, 360 );
		const tops = noise1( rand, 140 );
		const gain = 1.7 * depth;

		// Colour by height: a light edge, the band's colour, the next
		// palette colour towards the top.
		const tint = hexToRgb( toward( color, 0.4 ) );
		const body = hexToRgb( color );
		const high = hexToRgb( upper );
		const tone = new Float32Array( ( STEPS + 1 ) * 3 );
		for ( let k = 0; k <= STEPS; k++ ) {
			const d = k / STEPS;
			const lo = smooth01( 0, 0.12, d );
			const hi = smooth01( 0.3, 1, d );
			for ( const [ c, key ] of [
				[ 0, 'r' ],
				[ 1, 'g' ],
				[ 2, 'b' ],
			] ) {
				const v1 = tint[ key ] + ( body[ key ] - tint[ key ] ) * lo;
				tone[ k * 3 + c ] = v1 + ( high[ key ] - v1 ) * hi * 0.85;
			}
		}

		// Per column: the edge, how bright, how high, how folded.
		const base = new Float32Array( w );
		const glow = new Float32Array( w );
		const top = new Float32Array( w );
		let minY = h;
		let maxY = 0;
		const reachPx = h * reach * depth;
		for ( let x = 0; x < w; x++ ) {
			const t = x / w;
			base[ x ] =
				y0 +
				tilt * ( t - 0.5 ) +
				amp * Math.sin( t * Math.PI * 2 * freq + phase ) +
				h * 0.022 * ( fbm2( wiggle, t * 11 ) * 2 - 1 );
			const fold =
				0.55 +
				0.45 *
					Math.abs(
						Math.sin(
							( fbm2( folds, t * 4 ) * 5 + t * 7 ) * Math.PI
						)
					);
			// The curtain breaks off in places and comes back.
			const on = smooth01( 0.32, 0.72, fbm2( active, t * 5 ) );
			const ray =
				0.06 +
				0.7 * Math.pow( mid( t * 96 ), 2 ) +
				1.3 * Math.pow( fine( t * 360 ), 3 );
			glow[ x ] = gain * fold * on * ray;
			top[ x ] = reachPx * ( 0.45 + 0.55 * fbm2( tops, t * 70 ) );
			minY = Math.min( minY, base[ x ] - top[ x ] );
			maxY = Math.max( maxY, base[ x ] + edgePx * 8 );
		}

		const y1 = Math.max( 0, Math.floor( minY ) );
		const y2 = Math.min( h - 1, Math.ceil( maxY ) );
		for ( let y = y1; y <= y2; y++ ) {
			let i = y * w * 4;
			for ( let x = 0; x < w; x++, i += 4 ) {
				const below = y - base[ x ];
				let v;
				let k;
				if ( below > 0 ) {
					// Under the edge the light ends within a few pixels.
					if ( below > edgePx * 8 ) {
						continue;
					}
					v = Math.exp( -below / edgePx );
					k = 0;
				} else {
					const d = -below / top[ x ];
					if ( d >= 1 ) {
						continue;
					}
					k = ( d * STEPS ) | 0;
					v = rise[ k ];
				}
				const a = v * glow[ x ];
				px[ i ] += tone[ k * 3 ] * a;
				px[ i + 1 ] += tone[ k * 3 + 1 ] * a;
				px[ i + 2 ] += tone[ k * 3 + 2 ] * a;
			}
		}
	}
	lctx.putImageData( img, 0, 0 );

	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	// The halo: the same light, soft and dimmer.
	soft( ctx, w, h, 1 / 10, ( s ) => {
		s.globalAlpha = 0.38;
		s.drawImage( layer, 0, 0, w, h );
	} );
	ctx.drawImage( layer, 0, 0 );
	ctx.restore();
}

/** Light pouring in from one point, layered radial glows over a dark base. */
function drawGlow( ctx, w, h, colors, opts, rand ) {
	const sorted = byLight( colors );
	ctx.fillStyle = shade( sorted[ 0 ], 0.45 );
	ctx.fillRect( 0, 0, w, h );
	const cx = clamp01( ( opts.x ?? 20 ) / 100 ) * w;
	const cy = clamp01( ( opts.y ?? 18 ) / 100 ) * h;
	const reach =
		Math.hypot( w, h ) *
		lerp( 0.3, 1.2, clamp01( ( opts.size ?? 70 ) / 100 ) );
	const lights = ( sorted.length > 1 ? sorted.slice( 1 ) : sorted ).reverse();
	ctx.save();
	ctx.globalCompositeOperation = 'screen';
	lights.forEach( ( color, i ) => {
		const r = reach * ( 1 - i * 0.2 );
		const ox = cx + ( rand() * 2 - 1 ) * r * 0.12;
		const oy = cy + ( rand() * 2 - 1 ) * r * 0.12;
		const g = ctx.createRadialGradient(
			ox,
			oy,
			0,
			ox,
			oy,
			Math.max( 1, r )
		);
		const peak = 0 === i ? 0.7 : 0.9;
		g.addColorStop( 0, rgba( color, peak ) );
		g.addColorStop( 0.35, rgba( color, peak * 0.45 ) );
		g.addColorStop( 1, rgba( color, 0 ) );
		ctx.fillStyle = g;
		ctx.fillRect( 0, 0, w, h );
	} );
	ctx.restore();
}

/**
 * Out-of-focus lights: a soft far layer and crisp discs in front.
 *
 * Since 20.10.2026 the front discs look like bokeh: an even fill, a narrow
 * soft edge and a faint lighter rim, brighter than before. They used to fade
 * out from the middle - with Blur at its default almost a third of every
 * disc was edge - and at most half covering, so the whole picture read as
 * blurry. Blur now softens the far layer and, a little, the front edges.
 * The discs sit where they did: their random numbers are drawn the same way.
 */
function drawBokeh( ctx, w, h, colors, opts, rand ) {
	const sorted = byLight( colors );
	const top = shade( sorted[ 0 ], 0.4 );
	const bottom = shade( sorted[ Math.min( 1, sorted.length - 1 ) ], 0.55 );
	const g = ctx.createLinearGradient( 0, 0, 0, h );
	g.addColorStop( 0, top );
	g.addColorStop( 1, bottom );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, w, h );
	const count = Math.round(
		lerp( 6, 90, clamp01( ( opts.count ?? 30 ) / 100 ) )
	);
	const unit = Math.min( w, h );
	const size = lerp( 0.03, 0.16, clamp01( ( opts.size ?? 45 ) / 100 ) );
	const blur = clamp01( ( opts.blur ?? 50 ) / 100 );
	const lights = sorted.length > 1 ? sorted.slice( 1 ) : sorted;
	const discs = [];
	for ( let i = 0; i < count; i++ ) {
		discs.push( {
			x: rand() * w,
			y: rand() * h,
			r: unit * size * ( 0.4 + rand() * 1.2 ),
			color: lights[ Math.floor( rand() * lights.length ) ],
			// Raw 0..1, mapped per layer below.
			a: rand(),
			far: rand() < 0.5,
		} );
	}
	// A far light: a soft glow.
	const glow = ( s, d ) => {
		const a = 0.12 + d.a * 0.35;
		const rg = s.createRadialGradient( d.x, d.y, 0, d.x, d.y, d.r );
		rg.addColorStop( 0, rgba( d.color, a ) );
		rg.addColorStop( 0.4, rgba( d.color, a * 0.85 ) );
		rg.addColorStop( 1, rgba( d.color, 0 ) );
		s.fillStyle = rg;
		s.beginPath();
		s.arc( d.x, d.y, d.r, 0, Math.PI * 2 );
		s.fill();
	};
	// A front light: even fill, a narrow soft edge, a faint lighter rim.
	const edge = lerp( 0.03, 0.14, blur );
	const disc = ( s, d ) => {
		const a = 0.26 + d.a * 0.42;
		const rg = s.createRadialGradient( d.x, d.y, 0, d.x, d.y, d.r );
		rg.addColorStop( 0, rgba( d.color, a * 0.82 ) );
		rg.addColorStop( Math.max( 0.05, 1 - edge * 2 ), rgba( d.color, a ) );
		rg.addColorStop( 1 - edge, rgba( toward( d.color, 0.3 ), a ) );
		rg.addColorStop( 1, rgba( d.color, 0 ) );
		s.fillStyle = rg;
		s.beginPath();
		s.arc( d.x, d.y, d.r, 0, Math.PI * 2 );
		s.fill();
	};
	ctx.save();
	ctx.globalCompositeOperation = 'screen';
	soft( ctx, w, h, lerp( 1 / 3, 1 / 10, blur ), ( s ) => {
		s.globalCompositeOperation = 'lighter';
		discs
			.filter( ( d ) => d.far )
			.forEach( ( d ) => glow( s, { ...d, r: d.r * 1.4 } ) );
	} );
	discs.filter( ( d ) => ! d.far ).forEach( ( d ) => disc( ctx, d ) );
	ctx.restore();
}

/* ------- v1.433: starfield, terrazzo, plaid, scales (the last three tile) ------- */

/** The eight neighbouring offsets for wrap-stamping in tile mode. */
const wrapStamps = ( tile, w, h ) =>
	tile
		? [ -1, 0, 1 ].flatMap( ( sx ) =>
				[ -1, 0, 1 ].map( ( sy ) => [ sx * w, sy * h ] )
		  )
		: [ [ 0, 0 ] ];

/**
 * Starfield: a night sky in the darkest palette color, faint nebula
 * clouds in the lighter ones and stars of every size, a few bright ones
 * with a glow and a sparkle. The nebula takes its random numbers even when
 * it is off, so turning it on or off never moves a star.
 */
function drawStars( ctx, w, h, colors, opts, rand ) {
	const sorted = byLight( colors );
	const sky = ctx.createLinearGradient( 0, 0, 0, h );
	sky.addColorStop( 0, shade( sorted[ 0 ], 0.28 ) );
	sky.addColorStop( 1, shade( sorted[ 0 ], 0.58 ) );
	ctx.fillStyle = sky;
	ctx.fillRect( 0, 0, w, h );
	const lights = sorted.length > 1 ? sorted.slice( 1 ) : sorted;
	const unit = Math.min( w, h );
	const glow = clamp01( ( opts.glow ?? 50 ) / 100 );
	const clouds = Array.from( { length: 5 }, ( v, i ) => ( {
		x: rand() * w,
		y: rand() * h,
		r: Math.hypot( w, h ) * lerp( 0.14, 0.34, rand() ),
		color: lights[ i % lights.length ],
	} ) );
	if ( glow > 0 ) {
		soft( ctx, w, h, 1 / 10, ( s ) => {
			s.globalCompositeOperation = 'lighter';
			for ( const c of clouds ) {
				const g = s.createRadialGradient( c.x, c.y, 0, c.x, c.y, c.r );
				g.addColorStop( 0, rgba( c.color, 0.3 * glow ) );
				g.addColorStop( 0.5, rgba( c.color, 0.1 * glow ) );
				g.addColorStop( 1, rgba( c.color, 0 ) );
				s.fillStyle = g;
				s.fillRect( 0, 0, w, h );
			}
		} );
	}
	const count = Math.round(
		lerp( 80, 900, clamp01( ( opts.count ?? 50 ) / 100 ) )
	);
	const size = lerp( 0.5, 1.7, clamp01( ( opts.size ?? 40 ) / 100 ) );
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	for ( let i = 0; i < count; i++ ) {
		const x = rand() * w;
		const y = rand() * h;
		const t = rand();
		const alpha = 0.35 + rand() * 0.65;
		const tinted = rand() < 0.22;
		const tint = lights[ Math.floor( rand() * lights.length ) ];
		const color = tinted
			? paletteAt( [ tint, '#ffffff' ], 0.5 )
			: '#ffffff';
		const r = unit * 0.0016 * size * ( 0.45 + Math.pow( t, 7 ) * 3.4 );
		if ( t > 0.9 ) {
			const halo = ctx.createRadialGradient( x, y, 0, x, y, r * 7 );
			halo.addColorStop( 0, rgba( color, 0.35 * alpha ) );
			halo.addColorStop( 1, rgba( color, 0 ) );
			ctx.fillStyle = halo;
			ctx.fillRect( x - r * 7, y - r * 7, r * 14, r * 14 );
		}
		if ( t > 0.975 ) {
			// A soft four-point sparkle on the brightest stars.
			ctx.strokeStyle = rgba( color, 0.45 * alpha );
			ctx.lineWidth = Math.max( 0.5, r * 0.35 );
			ctx.beginPath();
			ctx.moveTo( x - r * 9, y );
			ctx.lineTo( x + r * 9, y );
			ctx.moveTo( x, y - r * 9 );
			ctx.lineTo( x, y + r * 9 );
			ctx.stroke();
		}
		ctx.fillStyle = rgba( color, alpha );
		ctx.beginPath();
		ctx.arc( x, y, Math.max( 0.35, r ), 0, Math.PI * 2 );
		ctx.fill();
	}
	ctx.restore();
}

/**
 * Terrazzo: stone chips in the palette set in a light ground, irregular
 * polygons of every size plus fine flecks. Mix sets how much of it is
 * flecks. Tiles by stamping every chip at the neighbouring offsets.
 */
function drawTerrazzo( ctx, w, h, colors, opts, rand, tile ) {
	const sorted = byLight( colors );
	ctx.fillStyle = paletteAt(
		[ sorted[ sorted.length - 1 ], '#ffffff' ],
		0.6
	);
	ctx.fillRect( 0, 0, w, h );
	const chips = sorted.length > 1 ? sorted.slice( 0, -1 ) : sorted;
	const unit = Math.min( w, h );
	const count = Math.round(
		lerp( 30, 260, clamp01( ( opts.count ?? 50 ) / 100 ) )
	);
	const size = lerp( 0.014, 0.065, clamp01( ( opts.size ?? 45 ) / 100 ) );
	const mix = clamp01( ( opts.mix ?? 50 ) / 100 );
	const stamps = wrapStamps( tile, w, h );
	for ( let i = 0; i < count; i++ ) {
		const x = rand() * w;
		const y = rand() * h;
		const fleck = rand() < mix * 0.75;
		const r =
			unit *
			size *
			( fleck ? lerp( 0.12, 0.32, rand() ) : lerp( 0.5, 1.15, rand() ) );
		const color = shade(
			chips[ Math.floor( rand() * chips.length ) ],
			lerp( 0.86, 1.12, rand() )
		);
		const sides = 5 + Math.floor( rand() * 4 );
		const rot = rand() * Math.PI * 2;
		const squash = lerp( 0.55, 1, rand() );
		const radii = Array.from( { length: 8 }, () =>
			lerp( 0.6, 1.15, rand() )
		);
		const cr = Math.cos( rot );
		const sr = Math.sin( rot );
		ctx.fillStyle = color;
		for ( const [ sx, sy ] of stamps ) {
			ctx.beginPath();
			for ( let j = 0; j < sides; j++ ) {
				const a = ( j / sides ) * Math.PI * 2;
				const lx = Math.cos( a ) * r * radii[ j ];
				const ly = Math.sin( a ) * r * radii[ j ] * squash;
				const px = x + sx + lx * cr - ly * sr;
				const py = y + sy + lx * sr + ly * cr;
				if ( 0 === j ) {
					ctx.moveTo( px, py );
				} else {
					ctx.lineTo( px, py );
				}
			}
			ctx.closePath();
			ctx.fill();
		}
	}
}

/**
 * Plaid: a mirrored sett of bands in the palette, laid across and along
 * over a ground so the crossings mix, with a fine twill on top. The sett
 * repeats; in tile mode its period is snapped to divide the tile.
 */
function drawPlaid( ctx, w, h, colors, opts, rand, tile ) {
	const sorted = byLight( colors );
	const unit = Math.min( w, h );
	let period = unit * lerp( 0.16, 0.6, clamp01( ( opts.size ?? 50 ) / 100 ) );
	if ( tile ) {
		period = w / Math.max( 1, Math.round( w / period ) );
	}
	const half = 2 + Math.round( clamp01( ( opts.bands ?? 50 ) / 100 ) * 4 );
	// Half a sett, then mirrored: [ offset, width, color ] in period units.
	const raw = Array.from( { length: half }, () => ( {
		w: lerp( 0.02, 0.13, rand() ),
		color:
			sorted[
				1 + Math.floor( rand() * Math.max( 1, sorted.length - 1 ) )
			] || sorted[ 0 ],
		line: rand() < 0.3,
	} ) );
	const total = raw.reduce( ( sum, b ) => sum + b.w, 0 );
	const gapAll = Math.max( 0, 0.5 - total );
	const gap = gapAll / half;
	const bands = [];
	let at = 0;
	for ( const b of raw ) {
		at += gap;
		bands.push( { o: at, w: b.w, color: b.color, line: b.line } );
		at += b.w;
	}
	for ( const b of [ ...bands ].reverse() ) {
		bands.push( {
			o: 1 - b.o - b.w,
			w: b.w,
			color: b.color,
			line: b.line,
		} );
	}
	ctx.fillStyle = sorted[ 0 ];
	ctx.fillRect( 0, 0, w, h );
	const reps = ( span ) => Math.ceil( span / period ) + 1;
	ctx.save();
	for ( const b of bands ) {
		const bw = b.line ? Math.max( 1, period * 0.012 ) : b.w * period;
		ctx.fillStyle = rgba(
			b.line ? sorted[ sorted.length - 1 ] : b.color,
			b.line ? 0.7 : 0.55
		);
		for ( let k = -1; k < reps( w ); k++ ) {
			ctx.fillRect( k * period + b.o * period, 0, bw, h );
		}
		for ( let k = -1; k < reps( h ); k++ ) {
			ctx.fillRect( 0, k * period + b.o * period, w, bw );
		}
	}
	ctx.restore();
	// Twill: fine diagonal threads, light and dark by turns.
	const weave = clamp01( ( opts.weave ?? 50 ) / 100 );
	if ( weave > 0 ) {
		const step = Math.max( 1.5, unit * 0.006 );
		ctx.save();
		ctx.lineWidth = Math.max( 0.5, step * 0.35 );
		for ( let d = -h, i = 0; d < w; d += step, i++ ) {
			ctx.strokeStyle =
				i % 2
					? `rgba(255,255,255,${ 0.1 * weave })`
					: `rgba(0,0,0,${ 0.14 * weave })`;
			ctx.beginPath();
			ctx.moveTo( d, 0 );
			ctx.lineTo( d + h, h );
			ctx.stroke();
		}
		ctx.restore();
	}
}

/**
 * Scales (seigaiha): rows of fans, each a disc with concentric rings in
 * the lightest palette color, every row half a disc lower and overlapping
 * the one above. Fill colors come from a hash of the wrapped grid cell, so
 * in tile mode the pattern repeats exactly (the radius is snapped too).
 */
function drawScales( ctx, w, h, colors, opts, rand, tile ) {
	const sorted = byLight( colors );
	const unit = Math.min( w, h );
	let r = unit * lerp( 0.035, 0.15, clamp01( ( opts.size ?? 45 ) / 100 ) );
	let cols = 997;
	if ( tile ) {
		cols = Math.max( 2, Math.round( w / ( 2 * r ) ) );
		r = w / ( 2 * cols );
	}
	const rings = Math.max( 2, Math.min( 8, Math.round( opts.rings ?? 4 ) ) );
	const line = r * lerp( 0.03, 0.16, clamp01( ( opts.weight ?? 40 ) / 100 ) );
	const fills = sorted.length > 1 ? sorted.slice( 0, -1 ) : sorted;
	const ink = sorted[ sorted.length - 1 ];
	const salt = Math.floor( rand() * 1e9 );
	const rows = tile ? cols * 4 : 997;
	const pick = ( i, j ) => {
		let x = ( i * 374761393 + j * 668265263 + salt ) | 0;
		x = Math.imul( x ^ ( x >>> 13 ), 1274126177 );
		return ( ( x ^ ( x >>> 16 ) ) >>> 0 ) / 4294967296;
	};
	const wrap = ( v, n ) => ( ( v % n ) + n ) % n;
	ctx.fillStyle = fills[ 0 ];
	ctx.fillRect( 0, 0, w, h );
	const dy = r / 2;
	for ( let row = -2; row * dy < h + r; row++ ) {
		const y = row * dy;
		const odd = 0 !== wrap( row, 2 );
		for ( let col = -1; col * 2 * r < w + 2 * r; col++ ) {
			const x = col * 2 * r + ( odd ? r : 0 );
			const cell = pick( wrap( col, cols ), wrap( row, rows ) );
			ctx.fillStyle = fills[ Math.floor( cell * fills.length ) ];
			ctx.beginPath();
			ctx.arc( x, y, r, 0, Math.PI * 2 );
			ctx.fill();
			ctx.strokeStyle = ink;
			ctx.lineWidth = line;
			for ( let k = 0; k < rings; k++ ) {
				const rk = r * ( 1 - k / rings ) - line / 2;
				if ( rk > line ) {
					ctx.beginPath();
					ctx.arc( x, y, rk, 0, Math.PI * 2 );
					ctx.stroke();
				}
			}
		}
	}
}

/* ------------------------------- grain -------------------------------- */

/**
 * Film grain (19.10.2026): a fixed number of grains across the short side,
 * so it is the same grain at every size - the preview shows what the
 * inserted picture carries, scaled down. It used to be a 140 px tile of
 * one-pixel grains: in the small preview that looked many times coarser
 * than in the picture, and a large picture repeated it every 140 px.
 *
 * The field is one random grain per cell over the whole picture (no
 * repeat), drawn smoothly up to large sizes and halved step by step down
 * to small ones, which averages the grains the way a scaled-down picture
 * does. Fields are cached: sixteen style cards and the preview share one.
 */
const GRAIN_ACROSS = 800;
const grainFields = new Map();

function grainField( seed, gw, gh, halvings ) {
	const key = seed + ':' + gw + 'x' + gh + ':' + halvings;
	const hit = grainFields.get( key );
	if ( hit ) {
		return hit;
	}
	let field;
	if ( halvings > 0 ) {
		const full = grainField( seed, gw, gh, halvings - 1 );
		field = createCanvas(
			Math.max( 1, Math.ceil( full.width / 2 ) ),
			Math.max( 1, Math.ceil( full.height / 2 ) )
		);
		const fctx = field.getContext( '2d' );
		fctx.imageSmoothingEnabled = true;
		fctx.drawImage( full, 0, 0, field.width, field.height );
	} else {
		const rand = mulberry32( ( Number( seed ) || 1 ) ^ 0x9e3779b9 );
		field = createCanvas( gw, gh );
		const fctx = field.getContext( '2d' );
		const img = fctx.createImageData( gw, gh );
		for ( let i = 0; i < img.data.length; i += 4 ) {
			const v = Math.round( rand() * 255 );
			img.data[ i ] = v;
			img.data[ i + 1 ] = v;
			img.data[ i + 2 ] = v;
			img.data[ i + 3 ] = 255;
		}
		fctx.putImageData( img, 0, 0 );
	}
	grainFields.set( key, field );
	if ( grainFields.size > 12 ) {
		grainFields.delete( grainFields.keys().next().value );
	}
	return field;
}

function drawGrain( ctx, w, h, strength, seed ) {
	const short = Math.max( 1, Math.min( w, h ) );
	const gw = Math.max( 2, Math.round( ( GRAIN_ACROSS * w ) / short ) );
	const gh = Math.max( 2, Math.round( ( GRAIN_ACROSS * h ) / short ) );
	let halvings = 0;
	while (
		gw / 2 ** ( halvings + 1 ) >= w &&
		gh / 2 ** ( halvings + 1 ) >= h
	) {
		halvings++;
	}
	const field = grainField( seed, gw, gh, halvings );
	ctx.save();
	ctx.globalAlpha = clamp01( strength / 100 ) * 0.4;
	// Overlay keeps the colors, unsupported contexts just composite normally.
	ctx.globalCompositeOperation = 'overlay';
	ctx.imageSmoothingEnabled = true;
	ctx.drawImage( field, 0, 0, w, h );
	ctx.restore();
}

/* ------------------------------- public ------------------------------- */

/**
 * Render a background to a canvas. Same params + same aspect ratio give
 * the same picture at any resolution (relative geometry, fixed PRNG use).
 * With renderOpts.tile the mesh, organic-blob and geo (dots/grid/stripes)
 * styles render SEAMLESSLY tileable (wrap-stamped elements, snapped
 * lattice, rotation ignored); waves, rays and poly stay non-tiling.
 *
 * @param {Object} params Style params (see BG_DEFAULTS).
 * @param {number} w      Width in px.
 * @param {number} h      Height in px.
 * @return {HTMLCanvasElement} Canvas.
 */
export function renderBackground( params, w, h, renderOpts = {} ) {
	const tile = !! renderOpts.tile;
	const p = { ...BG_DEFAULTS, ...( params || {} ) };
	const colors = ( p.colors || [] ).filter( Boolean );
	const palette = colors.length ? colors : BG_DEFAULTS.colors;
	const rand = mulberry32( ( Number( p.seed ) || 1 ) * 2654435761 );
	const canvas = createCanvas( Math.max( 2, w ), Math.max( 2, h ) );
	const ctx = canvas.getContext( '2d' );
	const opts = { ...BG_DEFAULTS[ p.style ], ...( p[ p.style ] || {} ) };
	if ( 'organic' === p.style ) {
		drawOrganic(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else if ( 'geo' === p.style ) {
		drawGeo( ctx, canvas.width, canvas.height, palette, opts, rand, tile );
	} else if ( 'poly' === p.style ) {
		drawPoly( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'topo' === p.style ) {
		drawTopo( ctx, canvas.width, canvas.height, palette, opts, rand, tile );
	} else if ( 'halftone' === p.style ) {
		drawHalftone(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else if ( 'rings' === p.style ) {
		drawRings( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'gradient' === p.style ) {
		drawGradient( ctx, canvas.width, canvas.height, palette, opts );
	} else if ( 'aurora' === p.style ) {
		drawAurora( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'glow' === p.style ) {
		drawGlow( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'bokeh' === p.style ) {
		drawBokeh( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'stars' === p.style ) {
		drawStars( ctx, canvas.width, canvas.height, palette, opts, rand );
	} else if ( 'terrazzo' === p.style ) {
		drawTerrazzo(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else if ( 'plaid' === p.style ) {
		drawPlaid(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else if ( 'scales' === p.style ) {
		drawScales(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else if ( 'confetti' === p.style ) {
		drawConfetti(
			ctx,
			canvas.width,
			canvas.height,
			palette,
			opts,
			rand,
			tile
		);
	} else {
		drawMesh( ctx, canvas.width, canvas.height, palette, opts, rand, tile );
	}
	if ( p.grain > 0 ) {
		// Grain gets its own stream so style geometry stays put when only
		// the grain slider moves.
		drawGrain( ctx, canvas.width, canvas.height, p.grain, p.seed );
	}
	return canvas;
}

/**
 * Styles made of soft light only. Their pictures compress far better as
 * JPEG than as PNG (a fifth to a third of the size), with nothing a hard
 * edge could show.
 */
const SOFT_STYLES = new Set( [
	'mesh',
	'gradient',
	'aurora',
	'glow',
	'bokeh',
] );

/**
 * How a finished background is stored in the document (19.10.2026). Every
 * style covers the picture opaquely (contract-tested), so nothing needs
 * PNG's alpha. Grain is noise, which PNG cannot compress: with the default
 * grain a 12-megapixel background was close to ten megabytes, kept in the
 * document and in every undo step. JPEG at 0.92 stores it at a fifth, and
 * the grain hides what JPEG changes. Hard patterns without grain (plaid,
 * confetti, the lattices) stay PNG - there PNG is as small or smaller and
 * keeps every edge exact.
 *
 * @param {Object} params Background params.
 * @return {{ type: string, quality?: number }} Canvas encoding.
 */
export function backgroundEncoding( params ) {
	const p = { ...BG_DEFAULTS, ...( params || {} ) };
	return p.grain > 0 || SOFT_STYLES.has( p.style )
		? { type: 'image/jpeg', quality: 0.92 }
		: { type: 'image/png' };
}

/**
 * A finished background as the data URL a layer keeps, synchronously
 * (used where the document changes size).
 *
 * @param {Object} params Background params.
 * @param {number} w      Width in px.
 * @param {number} h      Height in px.
 * @return {{ canvas: HTMLCanvasElement, dataUrl: string }} The picture.
 */
export function backgroundImage( params, w, h ) {
	const canvas = renderBackground( params, w, h );
	const { type, quality } = backgroundEncoding( params );
	return { canvas, dataUrl: canvas.toDataURL( type, quality ) };
}

/**
 * The same, encoded off the main thread where the browser can (toBlob),
 * so inserting a large background does not freeze the editor.
 *
 * @param {HTMLCanvasElement} canvas A rendered background.
 * @param {Object}            params Its params.
 * @return {Promise<string>} The data URL.
 */
export function encodeBackground( canvas, params ) {
	const { type, quality } = backgroundEncoding( params );
	return encodeCanvas( canvas, type, quality );
}
