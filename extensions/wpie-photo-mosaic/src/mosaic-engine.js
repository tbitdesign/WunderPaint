/**
 * Photo Mosaic render engine - the textbook photomosaic pipeline:
 * block matching on 4x4 sub-blocks (tile INTERNAL structure forms the
 * contours), color adjustment as a per-channel offset of the tile
 * pixels toward the target block mean (keeps all internal contrast -
 * never an overlay), and a distance-based repeat lock. Pure module,
 * node-testable.
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

/**
 * Analyze one tile image: normalized square canvas plus its mean color
 * and 4x4 sub-block means.
 *
 * @param {Object}            like   Canvas-like (node fallback).
 * @param {HTMLCanvasElement} source Tile source (any size).
 * @return {Object} { canvas, mean, sub }
 */
export function analyzeTile( like, source ) {
	const c = makeCanvas( like, TILE_SIZE, TILE_SIZE );
	const g = c.getContext( '2d' );
	const side = Math.min( source.width, source.height );
	g.drawImage(
		source,
		( source.width - side ) / 2,
		( source.height - side ) / 2,
		side,
		side,
		0,
		0,
		TILE_SIZE,
		TILE_SIZE
	);
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
		mean: mean.map( ( v ) => v / ( TILE_SIZE * TILE_SIZE ) ),
		sub: sub.map( ( s, q ) => s.map( ( v ) => v / cnt[ q ] ) ),
	};
}

// Perceptual-ish channel weights (green carries the most luminance).
const dist = ( a, b ) =>
	( a[ 0 ] - b[ 0 ] ) ** 2 * 0.6 +
	( a[ 1 ] - b[ 1 ] ) ** 2 * 1.0 +
	( a[ 2 ] - b[ 2 ] ) ** 2 * 0.4;

/**
 * Mosaic build as a generator: yields { row, rows } after every grid row so
 * a browser host can slice the work across frames (and abort mid-build);
 * the return value of the generator is { canvas, cols, rows } or null.
 *
 * Performance contract: tiles are rescaled to the cell size ONCE up front
 * (one readback per tile) and the whole mosaic is composed in a single
 * pixel buffer with one final putImageData - the per-cell getImageData/
 * putImageData round trips of v1.0 forced thousands of GPU pipeline
 * flushes and froze the tab on real-world tile sets.
 *
 * @param {Object}            like  Canvas-like.
 * @param {HTMLCanvasElement} main  Main image canvas.
 * @param {Array}             tiles From analyzeTile.
 * @param {Object}            opts  {
 *   cols        24..80 grid columns (default 48).
 *   colorAdjust 0..1: per-channel pixel offset strength (default 0.6).
 *   cell        Rendered cell size px (default 32).
 *   repeatDist  Min grid distance before a tile may repeat (default 4).
 * }
 */
export function* mosaicSteps( like, main, tiles, opts = {} ) {
	if ( ! tiles || tiles.length < MIN_TILES ) {
		return null;
	}
	const cols = Math.max( 24, Math.min( 80, opts.cols || 48 ) );
	const strength = Math.max( 0, Math.min( 1, opts.colorAdjust ?? 0.6 ) );
	const cell = Math.max( 16, Math.min( 64, opts.cell || 32 ) );
	const repeat2 = ( opts.repeatDist || 4 ) ** 2;
	const rows = Math.max(
		4,
		Math.round( ( cols * main.height ) / main.width )
	);
	// Target reference at SUB resolution per cell.
	const ref = makeCanvas( like, cols * SUB, rows * SUB );
	ref.getContext( '2d' ).drawImage( main, 0, 0, cols * SUB, rows * SUB );
	const rd = ref
		.getContext( '2d' )
		.getImageData( 0, 0, cols * SUB, rows * SUB ).data;

	// Precompute centered tile signatures once.
	const cent = tiles.map( ( t ) =>
		t.sub.map( ( p ) => [
			p[ 0 ] - t.mean[ 0 ],
			p[ 1 ] - t.mean[ 1 ],
			p[ 2 ] - t.mean[ 2 ],
		] )
	);
	// Per-tile recent placements (cheap repeat lock).
	const lastUse = tiles.map( () => [] );

	// Rescale every tile to the cell size once - the only readbacks.
	const scaledCanvas = makeCanvas( like, cell, cell );
	const scaledCtx = scaledCanvas.getContext( '2d' );
	const scaled = tiles.map( ( t ) => {
		scaledCtx.clearRect( 0, 0, cell, cell );
		scaledCtx.drawImage( t.canvas, 0, 0, cell, cell );
		return scaledCtx.getImageData( 0, 0, cell, cell ).data;
	} );

	const out = makeCanvas( like, cols * cell, rows * cell );
	const g = out.getContext( '2d' );
	const outImg = g.createImageData( cols * cell, rows * cell );
	const od = outImg.data;
	const stride = cols * cell * 4;
	const tMean = [ 0, 0, 0 ];
	const tSubC = Array.from( { length: SUB * SUB }, () => [ 0, 0, 0 ] );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			// Target block: mean + centered sub-signature.
			tMean[ 0 ] = tMean[ 1 ] = tMean[ 2 ] = 0;
			for ( let sy = 0; sy < SUB; sy++ ) {
				for ( let sx = 0; sx < SUB; sx++ ) {
					const i =
						( ( r * SUB + sy ) * cols * SUB + q * SUB + sx ) * 4;
					const k = sy * SUB + sx;
					tSubC[ k ][ 0 ] = rd[ i ];
					tSubC[ k ][ 1 ] = rd[ i + 1 ];
					tSubC[ k ][ 2 ] = rd[ i + 2 ];
					tMean[ 0 ] += rd[ i ];
					tMean[ 1 ] += rd[ i + 1 ];
					tMean[ 2 ] += rd[ i + 2 ];
				}
			}
			for ( let ch = 0; ch < 3; ch++ ) {
				tMean[ ch ] /= SUB * SUB;
			}
			for ( let k = 0; k < SUB * SUB; k++ ) {
				tSubC[ k ][ 0 ] -= tMean[ 0 ];
				tSubC[ k ][ 1 ] -= tMean[ 1 ];
				tSubC[ k ][ 2 ] -= tMean[ 2 ];
			}
			let bi = 0;
			let bs = Infinity;
			for ( let t = 0; t < tiles.length; t++ ) {
				// Repeat lock as a FINITE penalty: small pools still get
				// the right tile when nothing comparable exists, large
				// pools get variety.
				let s = 0;
				for ( const [ lq, lr ] of lastUse[ t ] ) {
					if ( ( lq - q ) ** 2 + ( lr - r ) ** 2 < repeat2 ) {
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
			uses.push( [ q, r ] );
			if ( uses.length > 6 ) {
				uses.shift();
			}
			// Place the tile into the output buffer, color-adjusting ITS
			// pixels: per-channel offset toward the target mean - contrast
			// stays untouched (never an overlay).
			const sd = scaled[ bi ];
			const o0 = ( tMean[ 0 ] - tiles[ bi ].mean[ 0 ] ) * strength;
			const o1 = ( tMean[ 1 ] - tiles[ bi ].mean[ 1 ] ) * strength;
			const o2 = ( tMean[ 2 ] - tiles[ bi ].mean[ 2 ] ) * strength;
			for ( let yy = 0; yy < cell; yy++ ) {
				let oi = ( r * cell + yy ) * stride + q * cell * 4;
				let si = yy * cell * 4;
				for ( let xx = 0; xx < cell; xx++ ) {
					od[ oi ] = Math.max( 0, Math.min( 255, sd[ si ] + o0 ) );
					od[ oi + 1 ] = Math.max(
						0,
						Math.min( 255, sd[ si + 1 ] + o1 )
					);
					od[ oi + 2 ] = Math.max(
						0,
						Math.min( 255, sd[ si + 2 ] + o2 )
					);
					od[ oi + 3 ] = sd[ si + 3 ];
					oi += 4;
					si += 4;
				}
			}
		}
		yield { row: r + 1, rows };
	}
	g.putImageData( outImg, 0, 0 );
	return { canvas: out, cols, rows };
}

/**
 * Synchronous build (tests, small sets): drains mosaicSteps in one go.
 *
 * @param {Object}            like  Canvas-like.
 * @param {HTMLCanvasElement} main  Main image canvas.
 * @param {Array}             tiles From analyzeTile.
 * @param {Object}            opts  See mosaicSteps.
 * @return {Object} { canvas, cols, rows } or null.
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
