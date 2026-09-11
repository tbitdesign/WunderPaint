/**
 * Photo Mosaic render engine - the textbook photomosaic pipeline:
 * block matching on 4x4 sub-blocks (tile INTERNAL structure forms the
 * contours), color adjustment as a per-channel offset of the tile
 * pixels toward the target block mean (keeps all internal contrast -
 * never an overlay), and a distance-based repeat lock. Pure module,
 * node-testable.
 *
 * v2.0: cells are no longer only squares. A LATTICE lays the cells out
 * (squares, rounded squares, dots, honeycomb, diamonds, triangles, brick
 * bond, fish scales), every cell is composed through its own clip path
 * from a full-resolution crop of the tile, so a cell can be 160 px on a
 * print without going soft. The picture can be framed (moved and zoomed)
 * inside the output, the output masked to a shape, and tinted.
 */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

export const TILE_SIZE = 64;
export const SUB = 4;
export const MIN_TILES = 8;
/** The square crop kept per tile for composing - print cells stay sharp. */
export const FULL_SIZE = 256;

export const SHAPES = [
	'square',
	'rounded',
	'circle',
	'hex',
	'diamond',
	'triangle',
	'brick',
	'scales',
];

export const MASKS = [
	'none',
	'heart',
	'circle',
	'oval',
	'star',
	'hexagon',
	'diamond',
	'rounded',
];

/** Masks that want a square picture (the others keep the source aspect). */
export const SQUARE_MASKS = [ 'heart', 'circle', 'star', 'hexagon', 'diamond' ];

/** Deterministic Lehmer walk - the house bans the browser's dice. */
export function rng( seed ) {
	let s = ( seed | 0 ) % 2147483647 || 7;
	return () => {
		s = ( s * 48271 ) % 2147483647;
		return s / 2147483647;
	};
}

/**
 * Analyze one tile image: normalized square canvases plus its mean color
 * and 4x4 sub-block means. `canvas` is the 64 px signature square (kept
 * for older callers), `full` the sharp crop the mosaic is composed from.
 *
 * @param {Object}            like   Canvas-like (node fallback).
 * @param {HTMLCanvasElement} source Tile source (any size).
 * @return {Object} { canvas, full, mean, sub }
 */
export function analyzeTile( like, source ) {
	const side = Math.min( source.width, source.height );
	const sx = ( source.width - side ) / 2;
	const sy = ( source.height - side ) / 2;
	const fullSide = Math.max( 8, Math.min( FULL_SIZE, side ) );
	const full = makeCanvas( like, fullSide, fullSide );
	full.getContext( '2d' ).drawImage(
		source,
		sx,
		sy,
		side,
		side,
		0,
		0,
		fullSide,
		fullSide
	);
	const c = makeCanvas( like, TILE_SIZE, TILE_SIZE );
	const g = c.getContext( '2d' );
	g.drawImage( full, 0, 0, TILE_SIZE, TILE_SIZE );
	const d = g.getImageData( 0, 0, TILE_SIZE, TILE_SIZE ).data;
	const sub = Array.from( { length: SUB * SUB }, () => [ 0, 0, 0 ] );
	const cnt = new Array( SUB * SUB ).fill( 0 );
	const mean = [ 0, 0, 0 ];
	for ( let y = 0; y < TILE_SIZE; y++ ) {
		for ( let x = 0; x < TILE_SIZE; x++ ) {
			const i = ( y * TILE_SIZE + x ) * 4;
			const q =
				Math.floor( ( y * SUB ) / TILE_SIZE ) * SUB +
				Math.floor( ( x * SUB ) / TILE_SIZE );
			for ( let ch = 0; ch < 3; ch++ ) {
				sub[ q ][ ch ] += d[ i + ch ];
				mean[ ch ] += d[ i + ch ];
			}
			cnt[ q ]++;
		}
	}
	return {
		canvas: c,
		full,
		mean: mean.map( ( v ) => v / ( TILE_SIZE * TILE_SIZE ) ),
		sub: sub.map( ( s, q ) => s.map( ( v ) => v / cnt[ q ] ) ),
	};
}

/**
 * The self-mosaic (v2.0): the picture rebuilt from crops of itself, at
 * three zoom levels, seeded. Solves "too few photos" on the side.
 *
 * @param {Object}            like Canvas-like.
 * @param {HTMLCanvasElement} main Main image canvas.
 * @param {number}            n    Tiles to cut (24..400).
 * @param {number}            seed Seed.
 * @return {Array} tiles from analyzeTile.
 */
export function selfTiles( like, main, n = 120, seed = 7 ) {
	const rand = rng( seed );
	const count = Math.max( MIN_TILES, Math.min( 400, n | 0 ) );
	const short = Math.min( main.width, main.height );
	const tiles = [];
	for ( let i = 0; i < count; i++ ) {
		const zoom = [ 3, 5, 8 ][ i % 3 ];
		const side = Math.max( 8, Math.floor( short / zoom ) );
		const x = Math.floor( rand() * ( main.width - side ) );
		const y = Math.floor( rand() * ( main.height - side ) );
		const crop = makeCanvas( like, side, side );
		crop.getContext( '2d' ).drawImage(
			main,
			x,
			y,
			side,
			side,
			0,
			0,
			side,
			side
		);
		tiles.push( analyzeTile( like, crop ) );
	}
	return tiles;
}

// Perceptual-ish channel weights (green carries the most luminance).
const dist = ( a, b ) =>
	( a[ 0 ] - b[ 0 ] ) ** 2 * 0.6 +
	( a[ 1 ] - b[ 1 ] ) ** 2 * 1.0 +
	( a[ 2 ] - b[ 2 ] ) ** 2 * 0.4;

/* --------------------------------- lattice -------------------------------- */

const SQRT3 = Math.sqrt( 3 );

/**
 * Where the cells go. Every cell is { x, y, w, h, up } (bounding box in
 * output px; `up` flips triangles). All cells of one lattice share the
 * same bounding box, so tiles are rescaled once per build.
 *
 * @param {string} shape One of SHAPES.
 * @param {number} cols  Cells across.
 * @param {number} W     Output width.
 * @param {number} H     Output height.
 * @return {Object} { cells, bw, bh, rows }
 */
export function lattice( shape, cols, W, H ) {
	const s = W / cols;
	const cells = [];
	let bw = s;
	let bh = s;
	let rows = 0;
	const cover = ( pitchY, off ) => Math.ceil( ( H + off ) / pitchY ) + 1;
	if ( 'hex' === shape ) {
		// Pointy-top honeycomb: rows three quarters of a hex apart, every
		// other row half a cell over.
		bh = ( 2 * s ) / SQRT3;
		const pitch = bh * 0.75;
		rows = cover( pitch, bh );
		for ( let r = 0; r < rows; r++ ) {
			const off = r % 2 ? s / 2 : 0;
			for ( let q = -1; q <= cols; q++ ) {
				cells.push( {
					x: q * s + off,
					y: r * pitch - bh * 0.25,
					w: bw,
					h: bh,
				} );
			}
		}
	} else if ( 'triangle' === shape ) {
		bh = ( s * SQRT3 ) / 2;
		rows = cover( bh, 0 );
		for ( let r = 0; r < rows; r++ ) {
			for ( let q = -1; q <= cols * 2; q++ ) {
				cells.push( {
					x: ( q * s ) / 2 - ( r % 2 ? s / 2 : 0 ),
					y: r * bh,
					w: bw,
					h: bh,
					up: ( q + r ) % 2 === 0,
				} );
			}
		}
	} else if ( 'diamond' === shape ) {
		// Rhombi on a checkerboard: half-rows, alternately half a cell over.
		rows = cover( s / 2, s );
		for ( let r = 0; r < rows; r++ ) {
			const off = r % 2 ? s / 2 : 0;
			for ( let q = -1; q <= cols; q++ ) {
				cells.push( {
					x: q * s + off,
					y: ( r * s ) / 2 - s / 2,
					w: bw,
					h: bh,
				} );
			}
		}
	} else if ( 'brick' === shape ) {
		bh = s * 0.5;
		rows = cover( bh, 0 );
		for ( let r = 0; r < rows; r++ ) {
			const off = r % 2 ? s / 2 : 0;
			for ( let q = -1; q <= cols; q++ ) {
				cells.push( { x: q * s + off, y: r * bh, w: bw, h: bh } );
			}
		}
	} else if ( 'scales' === shape ) {
		// Fish scales: round cells in half-row steps, each row laid over
		// the one above (drawn top to bottom).
		bw = s * 1.12;
		bh = s * 1.12;
		rows = cover( s / 2, s );
		for ( let r = 0; r < rows; r++ ) {
			const off = r % 2 ? s / 2 : 0;
			for ( let q = -1; q <= cols; q++ ) {
				cells.push( {
					x: q * s + off - ( bw - s ) / 2,
					y: ( r * s ) / 2 - bh * 0.6,
					w: bw,
					h: bh,
				} );
			}
		}
	} else {
		rows = Math.max( 1, Math.round( H / s ) );
		const hh = H / rows;
		bh = hh;
		for ( let r = 0; r < rows; r++ ) {
			for ( let q = 0; q < cols; q++ ) {
				cells.push( { x: q * s, y: r * hh, w: bw, h: bh } );
			}
		}
	}
	// Drop cells entirely outside the output.
	const kept = cells.filter(
		( c ) => c.x + c.w > 0 && c.y + c.h > 0 && c.x < W && c.y < H
	);
	return { cells: kept, bw, bh, rows };
}

/**
 * The clip path of one cell, shrunk by the gap, on a context.
 *
 * @param {CanvasRenderingContext2D} g      Target.
 * @param {string}                   shape  One of SHAPES.
 * @param {Object}                   c      Cell { x, y, w, h, up }.
 * @param {number}                   gap    0..0.5 of the cell.
 * @param {number}                   radius 0..0.5 corner rounding (squares).
 */
export function cellPath( g, shape, c, gap, radius ) {
	const cx = c.x + c.w / 2;
	const cy = c.y + c.h / 2;
	const k = 1 - gap;
	const w = c.w * k;
	const h = c.h * k;
	g.beginPath();
	if ( 'circle' === shape || 'scales' === shape ) {
		g.arc( cx, cy, Math.min( w, h ) / 2, 0, Math.PI * 2 );
	} else if ( 'hex' === shape ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 6;
			const px = cx + ( w / 2 ) * Math.cos( a );
			const py = cy + ( h / 2 ) * Math.sin( a );
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'diamond' === shape ) {
		g.moveTo( cx, cy - h / 2 );
		g.lineTo( cx + w / 2, cy );
		g.lineTo( cx, cy + h / 2 );
		g.lineTo( cx - w / 2, cy );
		g.closePath();
	} else if ( 'triangle' === shape ) {
		if ( c.up ) {
			g.moveTo( cx, cy - h / 2 );
			g.lineTo( cx + w / 2, cy + h / 2 );
			g.lineTo( cx - w / 2, cy + h / 2 );
		} else {
			g.moveTo( cx - w / 2, cy - h / 2 );
			g.lineTo( cx + w / 2, cy - h / 2 );
			g.lineTo( cx, cy + h / 2 );
		}
		g.closePath();
	} else {
		const r =
			'rounded' === shape
				? Math.min( w, h ) * Math.max( 0.08, radius )
				: Math.min( w, h ) * radius;
		roundRect( g, cx - w / 2, cy - h / 2, w, h, r );
	}
}

function roundRect( g, x, y, w, h, r ) {
	const rr = Math.max( 0, Math.min( r, w / 2, h / 2 ) );
	if ( rr < 0.5 ) {
		g.rect( x, y, w, h );
		return;
	}
	g.moveTo( x + rr, y );
	g.lineTo( x + w - rr, y );
	g.quadraticCurveTo( x + w, y, x + w, y + rr );
	g.lineTo( x + w, y + h - rr );
	g.quadraticCurveTo( x + w, y + h, x + w - rr, y + h );
	g.lineTo( x + rr, y + h );
	g.quadraticCurveTo( x, y + h, x, y + h - rr );
	g.lineTo( x, y + rr );
	g.quadraticCurveTo( x, y, x + rr, y );
	g.closePath();
}

/**
 * The mask over the whole picture.
 *
 * @param {CanvasRenderingContext2D} g    Target.
 * @param {number}                   W    Width.
 * @param {number}                   H    Height.
 * @param {string}                   kind One of MASKS.
 */
export function maskPath( g, W, H, kind ) {
	const cx = W / 2;
	const cy = H / 2;
	g.beginPath();
	if ( 'heart' === kind ) {
		const s = Math.min( W, H );
		const x = cx;
		const y = cy - s * 0.42;
		g.moveTo( x, y + s * 0.3 );
		g.bezierCurveTo(
			x - s * 0.05,
			y + s * 0.1,
			x - s * 0.5,
			y + s * 0.05,
			x - s * 0.5,
			y + s * 0.35
		);
		g.bezierCurveTo(
			x - s * 0.5,
			y + s * 0.6,
			x - s * 0.15,
			y + s * 0.8,
			x,
			y + s * 0.98
		);
		g.bezierCurveTo(
			x + s * 0.15,
			y + s * 0.8,
			x + s * 0.5,
			y + s * 0.6,
			x + s * 0.5,
			y + s * 0.35
		);
		g.bezierCurveTo(
			x + s * 0.5,
			y + s * 0.05,
			x + s * 0.05,
			y + s * 0.1,
			x,
			y + s * 0.3
		);
		g.closePath();
	} else if ( 'circle' === kind ) {
		g.arc( cx, cy, Math.min( W, H ) / 2, 0, Math.PI * 2 );
	} else if ( 'oval' === kind ) {
		g.ellipse( cx, cy, W / 2, H / 2, 0, 0, Math.PI * 2 );
	} else if ( 'star' === kind ) {
		const R = Math.min( W, H ) / 2;
		const r = R * 0.5;
		for ( let i = 0; i < 10; i++ ) {
			const a = -Math.PI / 2 + ( i * Math.PI ) / 5;
			const rad = i % 2 ? r : R;
			const px = cx + rad * Math.cos( a );
			const py = cy + rad * Math.sin( a );
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'hexagon' === kind ) {
		const R = Math.min( W, H ) / 2;
		for ( let i = 0; i < 6; i++ ) {
			const a = ( Math.PI / 3 ) * i - Math.PI / 6;
			const px = cx + R * Math.cos( a );
			const py = cy + R * Math.sin( a );
			if ( i ) {
				g.lineTo( px, py );
			} else {
				g.moveTo( px, py );
			}
		}
		g.closePath();
	} else if ( 'diamond' === kind ) {
		g.moveTo( cx, 0 );
		g.lineTo( W, cy );
		g.lineTo( cx, H );
		g.lineTo( 0, cy );
		g.closePath();
	} else if ( 'rounded' === kind ) {
		roundRect( g, 0, 0, W, H, Math.min( W, H ) * 0.12 );
	} else {
		g.rect( 0, 0, W, H );
	}
}

/**
 * The window of the main picture that fills the output: the largest
 * window of the output's aspect, zoomed in by `zoom` and moved by the
 * frame offsets (-1..1 of the slack) - "drag the picture in the frame".
 *
 * @param {HTMLCanvasElement} main   Main image canvas.
 * @param {number}            aspect Output aspect (W / H).
 * @param {Object}            frame  { x, y, zoom }.
 * @return {Object} { sx, sy, sw, sh }
 */
export function frameWindow( main, aspect, frame = {} ) {
	const zoom = Math.max( 1, Math.min( 4, Number( frame.zoom ) || 1 ) );
	let sw = main.width;
	let sh = sw / aspect;
	if ( sh > main.height ) {
		sh = main.height;
		sw = sh * aspect;
	}
	sw /= zoom;
	sh /= zoom;
	const slackX = main.width - sw;
	const slackY = main.height - sh;
	const fx = Math.max( -1, Math.min( 1, Number( frame.x ) || 0 ) );
	const fy = Math.max( -1, Math.min( 1, Number( frame.y ) || 0 ) );
	return {
		sx: slackX / 2 + ( fx * slackX ) / 2,
		sy: slackY / 2 + ( fy * slackY ) / 2,
		sw,
		sh,
	};
}

/**
 * Mosaic build as a generator: yields { row, rows } after every band of
 * cells so a browser host can slice the work across frames (and abort
 * mid-build); the return value is { canvas, cols, rows, cells } or null.
 *
 * Performance contract: tiles are rescaled to the cell size ONCE up front
 * (one readback per tile), the target signatures come from ONE readback
 * of the framed picture, and every cell is one clipped drawImage (plus
 * one putImageData when its colours are shifted) - never a readback in
 * the cell loop.
 *
 * @param {Object}            like  Canvas-like.
 * @param {HTMLCanvasElement} main  Main image canvas.
 * @param {Array}             tiles From analyzeTile.
 * @param {Object}            opts  {
 *   cols         24..80 cells across (default 48).
 *   colorAdjust  0..1: per-channel pixel offset strength (default 0.6).
 *   cell         Rendered cell size px (default 32, up to 200).
 *   repeatDist   Min grid distance before a tile may repeat (default 4).
 *   shape        One of SHAPES (default 'square').
 *   gap          0..0.5 of the cell left open (default 0).
 *   radius       0..0.5 corner rounding for squares (default 0).
 *   bg           Background colour behind gaps, null = transparent.
 *   mask         One of MASKS (default 'none').
 *   tint         Hex colour laid over the finished mosaic, or null.
 *   tintStrength 0..1.
 *   frame        { x, y, zoom } of the picture in the output.
 * }
 */
export function* mosaicSteps( like, main, tiles, opts = {} ) {
	if ( ! tiles || tiles.length < MIN_TILES ) {
		return null;
	}
	const cols = Math.max( 24, Math.min( 80, opts.cols || 48 ) );
	const strength = Math.max( 0, Math.min( 1, opts.colorAdjust ?? 0.6 ) );
	const cell = Math.max( 8, Math.min( 200, opts.cell || 32 ) );
	const repeat2 = ( opts.repeatDist || 4 ) ** 2;
	const shape = SHAPES.includes( opts.shape ) ? opts.shape : 'square';
	const gap = Math.max( 0, Math.min( 0.5, opts.gap || 0 ) );
	const radius = Math.max( 0, Math.min( 0.5, opts.radius || 0 ) );
	const mask = MASKS.includes( opts.mask ) ? opts.mask : 'none';
	const bg = undefined === opts.bg ? '#ffffff' : opts.bg;
	const aspect = SQUARE_MASKS.includes( mask ) ? 1 : main.width / main.height;
	const W = cols * cell;
	const H = Math.max( cell, Math.round( W / aspect ) );
	const lat = lattice( shape, cols, W, H );
	const bw = Math.max( 1, Math.round( lat.bw ) );
	const bh = Math.max( 1, Math.round( lat.bh ) );

	// Target reference: the framed picture at eight samples per cell.
	const refW = cols * SUB * 2;
	const refH = Math.max( SUB, Math.round( ( refW * H ) / W ) );
	const ref = makeCanvas( like, refW, refH );
	const win = frameWindow( main, W / H, opts.frame );
	ref.getContext( '2d' ).drawImage(
		main,
		win.sx,
		win.sy,
		win.sw,
		win.sh,
		0,
		0,
		refW,
		refH
	);
	const rd = ref.getContext( '2d' ).getImageData( 0, 0, refW, refH ).data;
	const kx = refW / W;
	const ky = refH / H;

	// Precompute centered tile signatures once.
	const cent = tiles.map( ( t ) =>
		t.sub.map( ( p ) => [
			p[ 0 ] - t.mean[ 0 ],
			p[ 1 ] - t.mean[ 1 ],
			p[ 2 ] - t.mean[ 2 ],
		] )
	);
	const lastUse = tiles.map( () => [] );

	// Rescale every tile to the cell box once - the only readbacks.
	const scaledCanvas = makeCanvas( like, bw, bh );
	const scaledCtx = scaledCanvas.getContext( '2d' );
	const scaled = tiles.map( ( t ) => {
		const src = t.full || t.canvas;
		scaledCtx.clearRect( 0, 0, bw, bh );
		// Cover the box: the crop is square, the box may not be.
		const s = Math.max( bw / src.width, bh / src.height );
		const dw = src.width * s;
		const dh = src.height * s;
		scaledCtx.drawImage( src, ( bw - dw ) / 2, ( bh - dh ) / 2, dw, dh );
		const c = makeCanvas( like, bw, bh );
		c.getContext( '2d' ).drawImage( scaledCanvas, 0, 0 );
		return {
			canvas: c,
			data: strength > 0 ? scaledCtx.getImageData( 0, 0, bw, bh ) : null,
		};
	} );
	const scratch = makeCanvas( like, bw, bh );
	const scratchCtx = scratch.getContext( '2d' );
	const scratchImg = scratchCtx.createImageData( bw, bh );
	const sd = scratchImg.data;

	const out = makeCanvas( like, W, H );
	const g = out.getContext( '2d' );
	if ( bg ) {
		g.fillStyle = bg;
		g.fillRect( 0, 0, W, H );
	}
	const tMean = [ 0, 0, 0 ];
	const tSubC = Array.from( { length: SUB * SUB }, () => [ 0, 0, 0 ] );
	const cells = lat.cells;
	const band = Math.max(
		1,
		Math.round( cells.length / Math.max( 1, lat.rows ) )
	);
	for ( let ci = 0; ci < cells.length; ci++ ) {
		const c = cells[ ci ];
		// Target signature: mean + centered sub-blocks of the cell's box.
		tMean[ 0 ] = tMean[ 1 ] = tMean[ 2 ] = 0;
		let total = 0;
		for ( let sy = 0; sy < SUB; sy++ ) {
			for ( let sx = 0; sx < SUB; sx++ ) {
				const x0 = Math.max(
					0,
					Math.floor( ( c.x + ( c.w * sx ) / SUB ) * kx )
				);
				const x1 = Math.min(
					refW,
					Math.max(
						x0 + 1,
						Math.floor( ( c.x + ( c.w * ( sx + 1 ) ) / SUB ) * kx )
					)
				);
				const y0 = Math.max(
					0,
					Math.floor( ( c.y + ( c.h * sy ) / SUB ) * ky )
				);
				const y1 = Math.min(
					refH,
					Math.max(
						y0 + 1,
						Math.floor( ( c.y + ( c.h * ( sy + 1 ) ) / SUB ) * ky )
					)
				);
				let r = 0;
				let gg = 0;
				let b = 0;
				let n = 0;
				for ( let y = y0; y < y1; y++ ) {
					for ( let x = x0; x < x1; x++ ) {
						const i = ( y * refW + x ) * 4;
						r += rd[ i ];
						gg += rd[ i + 1 ];
						b += rd[ i + 2 ];
						n++;
					}
				}
				const k = sy * SUB + sx;
				if ( n ) {
					tSubC[ k ][ 0 ] = r / n;
					tSubC[ k ][ 1 ] = gg / n;
					tSubC[ k ][ 2 ] = b / n;
				} else {
					tSubC[ k ][ 0 ] = tSubC[ k ][ 1 ] = tSubC[ k ][ 2 ] = 128;
				}
				tMean[ 0 ] += tSubC[ k ][ 0 ];
				tMean[ 1 ] += tSubC[ k ][ 1 ];
				tMean[ 2 ] += tSubC[ k ][ 2 ];
				total++;
			}
		}
		for ( let ch = 0; ch < 3; ch++ ) {
			tMean[ ch ] /= total;
		}
		for ( let k = 0; k < SUB * SUB; k++ ) {
			tSubC[ k ][ 0 ] -= tMean[ 0 ];
			tSubC[ k ][ 1 ] -= tMean[ 1 ];
			tSubC[ k ][ 2 ] -= tMean[ 2 ];
		}
		// Grid coordinates for the repeat lock.
		const gq = c.x / lat.bw;
		const gr = c.y / lat.bh;
		let bi = 0;
		let bs = Infinity;
		for ( let t = 0; t < tiles.length; t++ ) {
			let s = 0;
			for ( const [ lq, lr ] of lastUse[ t ] ) {
				if ( ( lq - gq ) ** 2 + ( lr - gr ) ** 2 < repeat2 ) {
					s += 100000;
					break;
				}
			}
			s += dist( tiles[ t ].mean, tMean ) * 6;
			if ( s >= bs ) {
				continue;
			}
			const cs = cent[ t ];
			for ( let k = 0; k < SUB * SUB && s < bs; k++ ) {
				s += dist( cs[ k ], tSubC[ k ] ) * 1.6;
			}
			if ( s >= bs ) {
				continue;
			}
			bs = s;
			bi = t;
		}
		const uses = lastUse[ bi ];
		uses.push( [ gq, gr ] );
		if ( uses.length > 6 ) {
			uses.shift();
		}
		// Place the tile through the cell's clip, colour-adjusting ITS
		// pixels: per-channel offset toward the target mean - contrast
		// stays untouched (never an overlay).
		let src = scaled[ bi ].canvas;
		if ( strength > 0 && scaled[ bi ].data ) {
			const td = scaled[ bi ].data.data;
			const o0 = ( tMean[ 0 ] - tiles[ bi ].mean[ 0 ] ) * strength;
			const o1 = ( tMean[ 1 ] - tiles[ bi ].mean[ 1 ] ) * strength;
			const o2 = ( tMean[ 2 ] - tiles[ bi ].mean[ 2 ] ) * strength;
			for ( let i = 0; i < td.length; i += 4 ) {
				sd[ i ] = Math.max( 0, Math.min( 255, td[ i ] + o0 ) );
				sd[ i + 1 ] = Math.max( 0, Math.min( 255, td[ i + 1 ] + o1 ) );
				sd[ i + 2 ] = Math.max( 0, Math.min( 255, td[ i + 2 ] + o2 ) );
				sd[ i + 3 ] = td[ i + 3 ];
			}
			scratchCtx.putImageData( scratchImg, 0, 0 );
			src = scratch;
		}
		g.save();
		cellPath( g, shape, c, gap, radius );
		g.clip();
		g.drawImage( src, Math.round( c.x ), Math.round( c.y ), bw, bh );
		g.restore();
		if ( ( ci + 1 ) % band === 0 ) {
			yield { row: Math.ceil( ( ci + 1 ) / band ), rows: lat.rows };
		}
	}
	// The tint: a wash over the finished picture (never over the gaps).
	if ( opts.tint && opts.tintStrength > 0 ) {
		g.save();
		g.globalCompositeOperation = 'source-atop';
		g.globalAlpha = Math.max( 0, Math.min( 1, opts.tintStrength ) );
		g.fillStyle = opts.tint;
		g.fillRect( 0, 0, W, H );
		g.restore();
	}
	if ( 'none' !== mask ) {
		g.save();
		g.globalCompositeOperation = 'destination-in';
		maskPath( g, W, H, mask );
		g.fill();
		g.restore();
	}
	return { canvas: out, cols, rows: lat.rows, cells: cells.length };
}

/**
 * Synchronous build (tests, small sets): drains mosaicSteps in one go.
 *
 * @param {Object}            like  Canvas-like.
 * @param {HTMLCanvasElement} main  Main image canvas.
 * @param {Array}             tiles From analyzeTile.
 * @param {Object}            opts  See mosaicSteps.
 * @return {Object} { canvas, cols, rows, cells } or null.
 */
export function buildMosaic( like, main, tiles, opts = {} ) {
	const it = mosaicSteps( like, main, tiles, opts );
	for (;;) {
		const step = it.next();
		if ( step.done ) {
			return step.value || null;
		}
	}
}
