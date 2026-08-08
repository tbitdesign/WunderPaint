/**
 * Stitch Patterns render engine: a photo (or captured layer) becomes a
 * counted craft chart - cross-stitch, diamond painting, fuse beads,
 * knitting or corner-to-corner crochet. Pure module (no DOM globals
 * beyond the 2d context handed in), unit-testable in node-canvas.
 *
 * Pipeline: resample the source into a cell grid (the resample IS the
 * per-cell average), reduce to a small palette with median cut - with
 * accent rescue so small vivid regions (blue eyes!) survive - then
 * render the chart for the chosen craft plus a legend with per-color
 * usage estimates.
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

/* ------------------------------ quantization ----------------------------- */

const dist2 = ( a, b ) =>
	( a[ 0 ] - b[ 0 ] ) ** 2 * 0.55 +
	( a[ 1 ] - b[ 1 ] ) ** 2 +
	( a[ 2 ] - b[ 2 ] ) ** 2 * 0.45;

const sat = ( p ) => {
	const mx = Math.max( p[ 0 ], p[ 1 ], p[ 2 ] );
	const mn = Math.min( p[ 0 ], p[ 1 ], p[ 2 ] );
	return mx ? ( mx - mn ) / mx : 0;
};

function widestChannel( box ) {
	let best = 0;
	let bestR = -1;
	for ( let c = 0; c < 3; c++ ) {
		let lo = 255;
		let hi = 0;
		for ( const p of box ) {
			if ( p[ c ] < lo ) {
				lo = p[ c ];
			}
			if ( p[ c ] > hi ) {
				hi = p[ c ];
			}
		}
		if ( hi - lo > bestR ) {
			bestR = hi - lo;
			best = c;
		}
	}
	return best;
}

function boxSpread( box ) {
	let s = 0;
	for ( let c = 0; c < 3; c++ ) {
		let lo = 255;
		let hi = 0;
		for ( const p of box ) {
			if ( p[ c ] < lo ) {
				lo = p[ c ];
			}
			if ( p[ c ] > hi ) {
				hi = p[ c ];
			}
		}
		s = Math.max( s, hi - lo );
	}
	return s * Math.log( box.length + 1 );
}

/**
 * Median-cut palette with accent rescue: the last two slots go to the
 * most saturated clusters that plain mass-averaging would swallow.
 *
 * @param {Array}  pixels [ [r,g,b], ... ].
 * @param {number} n      Palette size.
 * @return {Array} [ [r,g,b], ... ] length <= n.
 */
export function buildPalette( pixels, n ) {
	const rescueSlots = n >= 10 ? 2 : n >= 6 ? 1 : 0;
	const boxes = [ pixels.slice() ];
	while ( boxes.length < n - rescueSlots ) {
		boxes.sort( ( a, b ) => boxSpread( b ) - boxSpread( a ) );
		const box = boxes.shift();
		if ( box.length < 2 ) {
			boxes.push( box );
			break;
		}
		const ch = widestChannel( box );
		box.sort( ( a, b ) => a[ ch ] - b[ ch ] );
		const mid = box.length >> 1;
		boxes.push( box.slice( 0, mid ), box.slice( mid ) );
	}
	const avg = ( box ) => {
		const s = [ 0, 0, 0 ];
		for ( const p of box ) {
			s[ 0 ] += p[ 0 ];
			s[ 1 ] += p[ 1 ];
			s[ 2 ] += p[ 2 ];
		}
		return s.map( ( v ) => Math.round( v / box.length ) );
	};
	const palette = boxes.map( avg );
	// Accent rescue: vivid pixels far from every palette entry form
	// their own clusters (mass-averaged palettes drown blue eyes in a
	// sea of skin tones).
	for ( let slot = 0; slot < rescueSlots; slot++ ) {
		let best = null;
		let bestScore = 0;
		for ( const p of pixels ) {
			let d = Infinity;
			for ( const q of palette ) {
				const dd = dist2( p, q );
				if ( dd < d ) {
					d = dd;
				}
			}
			const score = Math.sqrt( d ) * ( 0.35 + sat( p ) );
			if ( score > bestScore ) {
				bestScore = score;
				best = p;
			}
		}
		if ( ! best || bestScore < 26 ) {
			break;
		}
		// Average the neighborhood of the rescue seed for a stable tone.
		const near = pixels.filter( ( p ) => dist2( p, best ) < 900 );
		palette.push( avg( near.length ? near : [ best ] ) );
	}
	return palette;
}

/** Index of the nearest palette entry. */
export const nearestIndex = ( palette, p ) => {
	let bi = 0;
	let bd = Infinity;
	for ( let i = 0; i < palette.length; i++ ) {
		const d = dist2( palette[ i ], p );
		if ( d < bd ) {
			bd = d;
			bi = i;
		}
	}
	return bi;
};

/* --------------------------------- grid ---------------------------------- */

/**
 * Resample a source canvas into the cell grid and quantize.
 *
 * @param {HTMLCanvasElement} source       Source canvas (already cropped).
 * @param {number}            cols         Grid width in cells.
 * @param {number}            rows         Grid height in cells.
 * @param {number}            nColors      Palette size (auto mode).
 * @param {Array}             fixedPalette Optional [ [r,g,b], ... ]: use
 *                                         these yarn colors instead of
 *                                         median cut (brand kits, custom
 *                                         colors, preset palettes).
 * @return {Object} { palette, idx (Uint16Array rows*cols), counts }
 */
export function buildGrid( source, cols, rows, nColors, fixedPalette ) {
	// node-canvas has no document; clone a canvas via the source's ctor.
	const tiny =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new source.constructor( cols, rows );
	tiny.width = cols;
	tiny.height = rows;
	const g = tiny.getContext( '2d' );
	g.drawImage( source, 0, 0, cols, rows );
	const data = g.getImageData( 0, 0, cols, rows ).data;
	const cells = [];
	for ( let i = 0; i < cols * rows; i++ ) {
		cells.push( [ data[ i * 4 ], data[ i * 4 + 1 ], data[ i * 4 + 2 ] ] );
	}
	const palette =
		fixedPalette && fixedPalette.length >= 2
			? fixedPalette.map( ( p ) => p.slice() )
			: buildPalette( cells, nColors );
	const idx = new Uint16Array( cols * rows );
	const counts = new Array( palette.length ).fill( 0 );
	for ( let i = 0; i < cells.length; i++ ) {
		idx[ i ] = nearestIndex( palette, cells[ i ] );
		counts[ idx[ i ] ]++;
	}
	return { palette, idx, counts };
}

/* -------------------------------- symbols -------------------------------- */

// High-contrast, easily distinguished chart symbols (30 slots).
export const SYMBOLS =
	'X O / + = * # V T L S 4 Z 7 A e n u ? % 3 b K y 9 R w 2 f 6'.split( ' ' );

export const hexOf = ( p ) =>
	'#' + p.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );

/* -------------------------------- modes ---------------------------------- */

export const MODES = [
	{ id: 'crossstitch', label: 'Cross-stitch' },
	{ id: 'diamond', label: 'Diamond painting' },
	{ id: 'beads', label: 'Fuse beads' },
	{ id: 'knitting', label: 'Knitting chart' },
	{ id: 'c2c', label: 'C2C crochet' },
	{ id: 'latchhook', label: 'Latch hook' },
	{ id: 'stringart', label: 'String art' },
	{ id: 'mandala', label: 'String mandala' },
];

/**
 * Per-color usage line for the legend, craft-specific.
 *
 * @param {string} mode  Mode id.
 * @param {number} count Cells of that color.
 * @return {string} e.g. "1520x · ~1 skein".
 */
export function usageLine( mode, count ) {
	if ( 'crossstitch' === mode ) {
		// ~1700 full stitches per 6-strand skein stitched with 2 strands
		// on 14 ct - a planning estimate, not gospel.
		const skeins = Math.max( 1, Math.ceil( count / 1700 ) );
		return `${ count }x · ~${ skeins } skein${ 1 === skeins ? '' : 's' }`;
	}
	if ( 'diamond' === mode ) {
		const drills = Math.ceil( count * 1.03 );
		return `${ count }x · ${ drills } drills`;
	}
	if ( 'beads' === mode ) {
		return `${ count }x beads`;
	}
	if ( 'latchhook' === mode ) {
		// Precut rug yarn commonly ships in ~320-piece packs.
		const packs = Math.max( 1, Math.ceil( count / 320 ) );
		return `${ count } knots · ~${ packs } pack${ 1 === packs ? '' : 's' }`;
	}
	return `${ count } sts`;
}

/* ------------------------------- rendering ------------------------------- */

/**
 * Render the chart (without legend) into ctx at cell size `cell`.
 *
 * @param {CanvasRenderingContext2D} ctx  Target.
 * @param {Object}                   grid { palette, idx }.
 * @param {number}                   cols Grid columns.
 * @param {number}                   rows Grid rows.
 * @param {Object}                   opts {
 *   mode:       MODES id.
 *   cell:       Cell width px.
 *   cellH:      Cell height px (knitting gauge; default = cell).
 *   symbols:    Draw chart symbols (default true).
 *   boardSize:  Fuse beads: pegboard size in cells (0 = off).
 *   x, y:       Origin.
 * }
 */
export function renderChart( ctx, grid, cols, rows, opts ) {
	const {
		mode = 'crossstitch',
		cell = 12,
		cellH = 0,
		symbols = true,
		boardSize = 0,
		x = 0,
		y = 0,
	} = opts;
	const ch =
		cellH || ( 'knitting' === mode ? Math.round( cell * 0.75 ) : cell );
	const { palette, idx } = grid;
	const W = cols * cell;
	const H = rows * ch;

	ctx.save();
	// Paper.
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( x, y, W, H );

	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			const pi = idx[ r * cols + q ];
			const p = palette[ pi ];
			const cx = x + q * cell;
			const cy = y + r * ch;
			if ( 'diamond' === mode ) {
				// Drill on a light paper cell: square (full coverage,
				// the common kit style) or the classic round.
				ctx.fillStyle = `rgba(${ p[ 0 ] },${ p[ 1 ] },${ p[ 2 ] },0.25)`;
				ctx.fillRect( cx, cy, cell, ch );
				if ( 'round' !== opts.drill ) {
					const ins = cell * 0.06;
					const sx = cx + ins;
					const sy = cy + ins;
					const sw = cell - 2 * ins;
					const sh = ch - 2 * ins;
					ctx.fillStyle = hexOf( p );
					ctx.fillRect( sx, sy, sw, sh );
					// Facets: lighter top wedge, darker bottom wedge,
					// thin X lines to the center.
					ctx.fillStyle = 'rgba(255,255,255,0.22)';
					ctx.beginPath();
					ctx.moveTo( sx, sy );
					ctx.lineTo( sx + sw, sy );
					ctx.lineTo( sx + sw / 2, sy + sh / 2 );
					ctx.closePath();
					ctx.fill();
					ctx.fillStyle = 'rgba(0,0,0,0.14)';
					ctx.beginPath();
					ctx.moveTo( sx, sy + sh );
					ctx.lineTo( sx + sw, sy + sh );
					ctx.lineTo( sx + sw / 2, sy + sh / 2 );
					ctx.closePath();
					ctx.fill();
					ctx.strokeStyle = 'rgba(255,255,255,0.3)';
					ctx.lineWidth = 1;
					ctx.beginPath();
					ctx.moveTo( sx, sy );
					ctx.lineTo( sx + sw, sy + sh );
					ctx.moveTo( sx + sw, sy );
					ctx.lineTo( sx, sy + sh );
					ctx.stroke();
				} else {
					ctx.fillStyle = hexOf( p );
					ctx.beginPath();
					ctx.arc(
						cx + cell / 2,
						cy + ch / 2,
						cell * 0.42,
						0,
						Math.PI * 2
					);
					ctx.fill();
					ctx.fillStyle = 'rgba(255,255,255,0.35)';
					ctx.beginPath();
					ctx.arc(
						cx + cell * 0.4,
						cy + ch * 0.4,
						cell * 0.14,
						0,
						Math.PI * 2
					);
					ctx.fill();
				}
			} else if ( 'beads' === mode ) {
				// A bead: ring with a hole, on white board.
				ctx.fillStyle = hexOf( p );
				ctx.beginPath();
				ctx.arc(
					cx + cell / 2,
					cy + ch / 2,
					cell * 0.46,
					0,
					Math.PI * 2
				);
				ctx.fill();
				ctx.fillStyle = '#ffffff';
				ctx.beginPath();
				ctx.arc(
					cx + cell / 2,
					cy + ch / 2,
					cell * 0.16,
					0,
					Math.PI * 2
				);
				ctx.fill();
			} else if ( 'latchhook' === mode ) {
				// A knotted yarn tuft: darker canvas cell, plush disc,
				// small shadow dot where the knot sits.
				ctx.fillStyle = `rgb(${ ( p[ 0 ] * 0.72 ) | 0 },${
					( p[ 1 ] * 0.72 ) | 0
				},${ ( p[ 2 ] * 0.72 ) | 0 })`;
				ctx.fillRect( cx, cy, cell, ch );
				ctx.fillStyle = hexOf( p );
				ctx.beginPath();
				ctx.arc(
					cx + cell / 2,
					cy + ch / 2,
					cell * 0.48,
					0,
					Math.PI * 2
				);
				ctx.fill();
				ctx.fillStyle = 'rgba(0,0,0,0.22)';
				ctx.beginPath();
				ctx.arc(
					cx + cell / 2,
					cy + ch / 2,
					cell * 0.12,
					0,
					Math.PI * 2
				);
				ctx.fill();
			} else if ( 'knitting' === mode || 'c2c' === mode ) {
				// Solid color cells - knitting charts read by color.
				ctx.fillStyle = hexOf( p );
				ctx.fillRect( cx, cy, cell, ch );
			} else {
				// Cross-stitch: light tint + symbol.
				ctx.fillStyle = `rgba(${ p[ 0 ] },${ p[ 1 ] },${ p[ 2 ] },0.3)`;
				ctx.fillRect( cx, cy, cell, ch );
			}
			if (
				symbols &&
				( 'crossstitch' === mode ||
					'diamond' === mode ||
					'c2c' === mode )
			) {
				const lum = 0.299 * p[ 0 ] + 0.587 * p[ 1 ] + 0.114 * p[ 2 ];
				ctx.fillStyle =
					'diamond' === mode || 'c2c' === mode
						? lum > 150
							? '#31353b'
							: '#ffffff'
						: '#3a3f46';
				ctx.font = `600 ${ Math.max(
					6,
					Math.round( cell * 0.62 )
				) }px sans-serif`;
				ctx.textAlign = 'center';
				ctx.textBaseline = 'middle';
				ctx.fillText(
					SYMBOLS[ pi % SYMBOLS.length ],
					cx + cell / 2,
					cy + ch / 2 + 0.5
				);
			}
		}
	}

	// Fine grid.
	ctx.strokeStyle = 'rgba(0,0,0,0.13)';
	ctx.lineWidth = 1;
	for ( let q = 0; q <= cols; q++ ) {
		ctx.beginPath();
		ctx.moveTo( x + q * cell + 0.5, y );
		ctx.lineTo( x + q * cell + 0.5, y + H );
		ctx.stroke();
	}
	for ( let r = 0; r <= rows; r++ ) {
		ctx.beginPath();
		ctx.moveTo( x, y + r * ch + 0.5 );
		ctx.lineTo( x + W, y + r * ch + 0.5 );
		ctx.stroke();
	}
	// Bold counting grid every 10 (or the pegboard boundary for beads).
	const bold = 'beads' === mode && boardSize > 0 ? boardSize : 10;
	ctx.strokeStyle = 'rgba(0,0,0,0.45)';
	ctx.lineWidth = 'beads' === mode && boardSize > 0 ? 2.2 : 1.4;
	for ( let q = 0; q <= cols; q += bold ) {
		ctx.beginPath();
		ctx.moveTo( x + q * cell, y );
		ctx.lineTo( x + q * cell, y + H );
		ctx.stroke();
	}
	for ( let r = 0; r <= rows; r += bold ) {
		ctx.beginPath();
		ctx.moveTo( x, y + r * ch );
		ctx.lineTo( x + W, y + r * ch );
		ctx.stroke();
	}
	// Edge numbers every bold line (counted charts live on these).
	ctx.fillStyle = '#4a4f57';
	ctx.font = `600 ${ Math.max( 8, Math.round( cell * 0.8 ) ) }px sans-serif`;
	ctx.textAlign = 'center';
	ctx.textBaseline = 'bottom';
	for ( let q = bold; q < cols; q += bold ) {
		ctx.fillText( String( q ), x + q * cell, y - 3 );
	}
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	for ( let r = bold; r < rows; r += bold ) {
		ctx.fillText( String( r ), x - 4, y + r * ch );
	}
	ctx.restore();
	return { width: W, height: H };
}

/**
 * Render the legend under the chart.
 *
 * @param {CanvasRenderingContext2D} ctx  Target.
 * @param {Object}                   grid { palette, counts }.
 * @param {Object}                   opts { mode, x, y, width, symbols }.
 * @return {number} Legend height.
 */
export function renderLegend( ctx, grid, opts ) {
	const {
		mode = 'crossstitch',
		x = 0,
		y = 0,
		width = 600,
		symbols = true,
	} = opts;
	const { palette, counts } = grid;
	const perRow = Math.max( 2, Math.floor( width / 190 ) );
	const rowH = 34;
	const rows = Math.ceil( palette.length / perRow );
	ctx.save();
	ctx.fillStyle = '#ffffff';
	ctx.fillRect( x, y, width, rows * rowH + 16 );
	palette.forEach( ( p, i ) => {
		const lx = x + 12 + ( i % perRow ) * ( ( width - 24 ) / perRow );
		const ly = y + 10 + Math.floor( i / perRow ) * rowH;
		ctx.fillStyle = hexOf( p );
		ctx.fillRect( lx, ly, 22, 22 );
		ctx.strokeStyle = 'rgba(0,0,0,0.35)';
		ctx.lineWidth = 1;
		ctx.strokeRect( lx + 0.5, ly + 0.5, 21, 21 );
		if (
			symbols &&
			'beads' !== mode &&
			'knitting' !== mode &&
			'latchhook' !== mode
		) {
			const lum = 0.299 * p[ 0 ] + 0.587 * p[ 1 ] + 0.114 * p[ 2 ];
			ctx.fillStyle = lum > 150 ? '#31353b' : '#ffffff';
			ctx.font = '600 12px sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText( SYMBOLS[ i % SYMBOLS.length ], lx + 11, ly + 12 );
		}
		ctx.fillStyle = '#31353b';
		ctx.font = '600 11px sans-serif';
		ctx.textAlign = 'left';
		ctx.textBaseline = 'top';
		ctx.fillText( hexOf( p ), lx + 30, ly + 1 );
		ctx.fillStyle = '#6a7078';
		ctx.font = '500 10px sans-serif';
		ctx.fillText( usageLine( mode, counts[ i ] ), lx + 30, ly + 13 );
	} );
	ctx.restore();
	return rows * rowH + 16;
}

/* -------------------------------- string art ------------------------------ */

/**
 * String art: greedy error accumulation - every thread subtracts from
 * the need map exactly what the render adds (thread-thickness aware,
 * which kills the parallel-band artifact), with a contrast stretch,
 * gamma and an edge boost so faces keep their features.
 *
 * @param {HTMLCanvasElement} source Source canvas (any size).
 * @param {Object}            opts   { nails (144..320), budget
 *                                     (400..4000), color (hex thread),
 *                                     size (internal, default 380) }.
 * @return {Object} { canvas, sequence (nail indices), nails }
 */
export function buildStringArt( source, opts = {} ) {
	const SRC = Math.max( 240, Math.min( 520, opts.size || 380 ) );
	const NAILS = Math.max( 96, Math.min( 400, opts.nails || 288 ) );
	const budget = Math.max( 400, Math.min( 5000, opts.budget || 2200 ) );
	const color = opts.color || '#26292e';
	const CX = SRC / 2;
	const CY = SRC / 2;
	const R = SRC / 2 - 8;
	const work = makeCanvas( source, SRC, SRC );
	{
		// Square center crop.
		const g = work.getContext( '2d' );
		const side = Math.min( source.width, source.height );
		g.drawImage(
			source,
			( source.width - side ) / 2,
			( source.height - side ) / 2,
			side,
			side,
			0,
			0,
			SRC,
			SRC
		);
	}
	const nails = [];
	for ( let i = 0; i < NAILS; i++ ) {
		const a = ( i / NAILS ) * Math.PI * 2 - Math.PI / 2;
		nails.push( [ CX + Math.cos( a ) * R, CY + Math.sin( a ) * R ] );
	}
	const d = work.getContext( '2d' ).getImageData( 0, 0, SRC, SRC ).data;
	const lum = new Float32Array( SRC * SRC );
	for ( let i = 0; i < SRC * SRC; i++ ) {
		lum[ i ] =
			0.299 * d[ i * 4 ] +
			0.587 * d[ i * 4 + 1 ] +
			0.114 * d[ i * 4 + 2 ];
	}
	const sorted = Float32Array.from( lum ).sort();
	const lo = sorted[ Math.floor( sorted.length * 0.05 ) ];
	const hi = sorted[ Math.floor( sorted.length * 0.95 ) ];
	const norm = ( v ) =>
		Math.max( 0, Math.min( 1, ( v - lo ) / Math.max( 1, hi - lo ) ) );
	// Edge boost keeps facial features.
	const err = new Float32Array( SRC * SRC );
	for ( let y = 1; y < SRC - 1; y++ ) {
		for ( let x = 1; x < SRC - 1; x++ ) {
			const i = y * SRC + x;
			const ddx = x - CX;
			const ddy = y - CY;
			if ( ddx * ddx + ddy * ddy > R * R ) {
				continue;
			}
			const gx =
				lum[ i - SRC + 1 ] +
				2 * lum[ i + 1 ] +
				lum[ i + SRC + 1 ] -
				lum[ i - SRC - 1 ] -
				2 * lum[ i - 1 ] -
				lum[ i + SRC - 1 ];
			const gy =
				lum[ i + SRC - 1 ] +
				2 * lum[ i + SRC ] +
				lum[ i + SRC + 1 ] -
				lum[ i - SRC - 1 ] -
				2 * lum[ i - SRC ] -
				lum[ i - SRC + 1 ];
			const dark = Math.pow( 1 - norm( lum[ i ] ), 0.85 ) * 255;
			err[ i ] = Math.min(
				255,
				dark + Math.min( 90, Math.sqrt( gx * gx + gy * gy ) * 0.35 )
			);
		}
	}
	const lineCache = new Map();
	const linePixels = ( a, b ) => {
		const key = a < b ? a * 1000 + b : b * 1000 + a;
		let px = lineCache.get( key );
		if ( px ) {
			return px;
		}
		let x0 = Math.round( nails[ a ][ 0 ] );
		let y0 = Math.round( nails[ a ][ 1 ] );
		const x1 = Math.round( nails[ b ][ 0 ] );
		const y1 = Math.round( nails[ b ][ 1 ] );
		const dx = Math.abs( x1 - x0 );
		const dy = -Math.abs( y1 - y0 );
		const sx = x0 < x1 ? 1 : -1;
		const sy = y0 < y1 ? 1 : -1;
		let e = dx + dy;
		const list = [];
		for (;;) {
			list.push( y0 * SRC + x0 );
			if ( x0 === x1 && y0 === y1 ) {
				break;
			}
			const e2 = 2 * e;
			if ( e2 >= dy ) {
				e += dy;
				x0 += sx;
			}
			if ( e2 <= dx ) {
				e += dx;
				y0 += sy;
			}
		}
		px = Int32Array.from( list );
		lineCache.set( key, px );
		return px;
	};
	const S = 3;
	const c = makeCanvas( source, SRC * S, SRC * S );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.strokeStyle = color;
	// Thread weight: how much ink one pass leaves (fine/normal/bold).
	g.globalAlpha = Math.max( 0.08, Math.min( 0.3, opts.alpha || 0.16 ) );
	g.lineWidth = 1;
	g.lineCap = 'round';
	const FADE = 18;
	const SIDE = 4;
	const MIN_SPAN = Math.round( NAILS * 0.05 );
	const PENALTY = 14;
	const used = new Set();
	let cur = 0;
	const sequence = [ 0 ];
	for ( let k = 0; k < budget; k++ ) {
		let best = -1;
		let bestScore = -1e9;
		for ( let cand = 0; cand < NAILS; cand++ ) {
			const span = Math.abs( cand - cur );
			if ( Math.min( span, NAILS - span ) < MIN_SPAN ) {
				continue;
			}
			const key = cur < cand ? cur * 1000 + cand : cand * 1000 + cur;
			if ( used.has( key ) ) {
				continue;
			}
			const px = linePixels( cur, cand );
			let s = 0;
			for ( let j = 0; j < px.length; j++ ) {
				const e = err[ px[ j ] ];
				s += e > 0 ? e : -PENALTY;
			}
			s /= px.length;
			if ( s > bestScore ) {
				bestScore = s;
				best = cand;
			}
		}
		if ( best < 0 || bestScore < 4 ) {
			break;
		}
		const px = linePixels( cur, best );
		for ( let j = 0; j < px.length; j++ ) {
			const p = px[ j ];
			err[ p ] = Math.max( 0, err[ p ] - FADE );
			if ( p >= SRC ) {
				err[ p - SRC ] = Math.max( 0, err[ p - SRC ] - SIDE );
			}
			if ( p < SRC * SRC - SRC ) {
				err[ p + SRC ] = Math.max( 0, err[ p + SRC ] - SIDE );
			}
		}
		used.add( cur < best ? cur * 1000 + best : best * 1000 + cur );
		g.beginPath();
		g.moveTo( nails[ cur ][ 0 ] * S, nails[ cur ][ 1 ] * S );
		g.lineTo( nails[ best ][ 0 ] * S, nails[ best ][ 1 ] * S );
		g.stroke();
		sequence.push( best );
		cur = best;
	}
	g.globalAlpha = 1;
	g.fillStyle = '#31353b';
	for ( const [ x, y ] of nails ) {
		g.beginPath();
		g.arc( x * S, y * S, 2.4, 0, Math.PI * 2 );
		g.fill();
	}
	return { canvas: c, sequence, nails: NAILS };
}

/**
 * The winding guide: nail numbers in threading order, in columns -
 * print it and actually build the piece.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} art  From buildStringArt.
 * @param {Object} opts { title }.
 * @return {HTMLCanvasElement}
 */
export function renderStringGuide( like, art, opts = {} ) {
	const seq = art.sequence;
	const COLS = 10;
	const CW = 96;
	const RH = 26;
	const M = 50;
	const rows = Math.ceil( seq.length / COLS );
	const c = makeCanvas( like, COLS * CW + M * 2, rows * RH + M * 2 + 60 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.fillStyle = '#26292e';
	g.font = '700 24px sans-serif';
	g.textAlign = 'left';
	g.textBaseline = 'middle';
	g.fillText(
		`${ String( opts.title || 'String Art' ) } · ${ art.nails } · ${
			seq.length - 1
		}`,
		M,
		M
	);
	g.font = '500 15px monospace';
	for ( let i = 0; i < seq.length; i++ ) {
		const col = Math.floor( i / rows );
		const row = i % rows;
		g.fillStyle = i % 2 ? '#31353b' : '#6a7078';
		g.fillText(
			`${ String( i ).padStart( 4, ' ' ) }: ${ seq[ i ] + 1 }`,
			M + col * CW,
			M + 46 + row * RH
		);
	}
	return c;
}

/* ------------------------------ string mandala ---------------------------- */

/**
 * String mandala: the classic times-table chord pattern - nail i
 * connects to nail (i * factor) mod n. Factor 2 draws a cardioid,
 * 3 a nephroid, higher factors bloom into rosettes. No image needed.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { nails (60..320), factor (2..12), color (hex) }.
 * @return {HTMLCanvasElement}
 */
export function buildStringMandala( like, opts = {} ) {
	const NAILS = Math.max( 60, Math.min( 320, opts.nails || 200 ) );
	const factor = Math.max( 2, Math.min( 12, opts.factor || 2 ) );
	const color = opts.color || '#26292e';
	const SIZE = 1000;
	const CX = SIZE / 2;
	const CY = SIZE / 2;
	const R = SIZE / 2 - 30;
	const c = makeCanvas( like, SIZE, SIZE );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, SIZE, SIZE );
	const at = ( i ) => {
		const a = ( ( i % NAILS ) / NAILS ) * Math.PI * 2 - Math.PI / 2;
		return [ CX + Math.cos( a ) * R, CY + Math.sin( a ) * R ];
	};
	g.strokeStyle = color;
	g.globalAlpha = 0.55;
	g.lineWidth = 1.2;
	for ( let i = 1; i < NAILS; i++ ) {
		const [ x0, y0 ] = at( i );
		const [ x1, y1 ] = at( i * factor );
		g.beginPath();
		g.moveTo( x0, y0 );
		g.lineTo( x1, y1 );
		g.stroke();
	}
	g.globalAlpha = 1;
	g.fillStyle = '#31353b';
	for ( let i = 0; i < NAILS; i++ ) {
		const [ x, y ] = at( i );
		g.beginPath();
		g.arc( x, y, 3, 0, Math.PI * 2 );
		g.fill();
	}
	return c;
}
