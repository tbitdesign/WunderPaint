/**
 * Background Studio engine (v1.105.0): deterministic, seed-based
 * background generators (mesh gradient, organic blobs/waves, geometric
 * patterns, low-poly) rendered straight to canvas. All geometry uses
 * relative units and fixed sample counts, so the preview and the final
 * full-resolution render look identical for the same parameters.
 */

import { hexToRgb, rgbToHex } from './color';
import { createCanvas } from './raster';

export const BG_STYLES = [ 'mesh', 'organic', 'geo', 'poly' ];

export const BG_DEFAULTS = {
	style: 'mesh',
	colors: [ '#1e2a78', '#3b66ff', '#b388ff' ],
	seed: 1,
	grain: 15,
	mesh: { points: 5, softness: 60 },
	organic: { variant: 'blobs', count: 6, shape: 50 },
	geo: { variant: 'dots', size: 40, gap: 50, angle: 0 },
	poly: { cell: 40, variance: 60 },
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

/* ------------------------------- grain -------------------------------- */

function drawGrain( ctx, w, h, strength, rand ) {
	const size = 140;
	const tile = createCanvas( size, size );
	const tctx = tile.getContext( '2d' );
	const img = tctx.createImageData( size, size );
	for ( let i = 0; i < img.data.length; i += 4 ) {
		const v = Math.round( rand() * 255 );
		img.data[ i ] = v;
		img.data[ i + 1 ] = v;
		img.data[ i + 2 ] = v;
		img.data[ i + 3 ] = 255;
	}
	tctx.putImageData( img, 0, 0 );
	ctx.save();
	ctx.globalAlpha = clamp01( strength / 100 ) * 0.4;
	// Overlay keeps the colors, unsupported contexts just composite normally.
	ctx.globalCompositeOperation = 'overlay';
	const pattern = ctx.createPattern( tile, 'repeat' );
	if ( pattern ) {
		ctx.fillStyle = pattern;
		ctx.fillRect( 0, 0, w, h );
	}
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
	} else {
		drawMesh( ctx, canvas.width, canvas.height, palette, opts, rand, tile );
	}
	if ( p.grain > 0 ) {
		// Grain gets its own stream so style geometry stays put when only
		// the grain slider moves.
		drawGrain(
			ctx,
			canvas.width,
			canvas.height,
			p.grain,
			mulberry32( ( Number( p.seed ) || 1 ) ^ 0x9e3779b9 )
		);
	}
	return canvas;
}
