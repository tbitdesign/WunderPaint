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

import {
	stringArt,
	stringArtColors,
	threadLength,
} from '../../shared/string-art.js';
import { snapPalette } from './threadsets.js';

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
 * @param {string}            yarn         v2.9: a thread range id
 *                                         (threadsets.js) - the palette
 *                                         snaps to its real colors.
 * @return {Object} { palette, idx (Uint16Array rows*cols), counts, codes
 *                  (per palette entry, or null) }
 */
export function buildGrid( source, cols, rows, nColors, fixedPalette, yarn = '' ) {
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
	const chosen =
		fixedPalette && fixedPalette.length >= 2
			? fixedPalette.map( ( p ) => p.slice() )
			: buildPalette( cells, nColors );
	// The colors a stitcher can buy: the palette lands on the nearest
	// threads of the range, and every cell is matched again to those -
	// two palette colors on one skein become one legend entry.
	const snapped = snapPalette( chosen, yarn );
	const palette = snapped.palette;
	const idx = new Uint16Array( cols * rows );
	const counts = new Array( palette.length ).fill( 0 );
	for ( let i = 0; i < cells.length; i++ ) {
		idx[ i ] = nearestIndex( palette, cells[ i ] );
		counts[ idx[ i ] ]++;
	}
	return { palette, idx, counts, codes: snapped.codes };
}

/* ------------------------------- fair isle -------------------------------- */

/**
 * Fair Isle (v2.9): stranded knitting carries two colours per row - the
 * one being knitted and the one floating behind it. Each row keeps the
 * pair of its colours that draws it best; every other stitch takes the
 * nearer of the two. Where one colour runs longer than `maxFloat`
 * stitches, the other floats that far behind it and must be caught: those
 * runs are returned, so the chart can mark them.
 *
 * @param {Object} grid     From buildGrid.
 * @param {number} cols     Columns.
 * @param {number} rows     Rows.
 * @param {number} maxFloat Longest float a knitter leaves uncaught.
 * @return {Object} A new grid (unused colours dropped) plus floats:
 *                  [ { row, from, to } ] - the stitches the long float
 *                  runs behind.
 */
export function fairIsle( grid, cols, rows, maxFloat = 5 ) {
	const { palette, idx } = grid;
	const out = new Uint16Array( idx.length );
	const floats = [];
	for ( let r = 0; r < rows; r++ ) {
		const row = idx.subarray( r * cols, ( r + 1 ) * cols );
		const count = new Map();
		for ( const v of row ) {
			count.set( v, ( count.get( v ) || 0 ) + 1 );
		}
		// The pair: among the row's most used colours, the two that leave
		// the least error when every stitch takes the nearer one.
		const top = [ ...count.entries() ]
			.sort( ( a, b ) => b[ 1 ] - a[ 1 ] )
			.slice( 0, 6 )
			.map( ( e ) => e[ 0 ] );
		let pair = [ top[ 0 ], top[ 1 ] ?? top[ 0 ] ];
		if ( top.length > 2 ) {
			let best = Infinity;
			for ( let a = 0; a < top.length; a++ ) {
				for ( let b = a + 1; b < top.length; b++ ) {
					let err = 0;
					for ( const [ v, n ] of count ) {
						err +=
							n *
							Math.min(
								dist2( palette[ v ], palette[ top[ a ] ] ),
								dist2( palette[ v ], palette[ top[ b ] ] )
							);
					}
					if ( err < best ) {
						best = err;
						pair = [ top[ a ], top[ b ] ];
					}
				}
			}
		}
		for ( let q = 0; q < cols; q++ ) {
			const v = row[ q ];
			out[ r * cols + q ] =
				v === pair[ 0 ] || v === pair[ 1 ]
					? v
					: dist2( palette[ v ], palette[ pair[ 0 ] ] ) <=
					  dist2( palette[ v ], palette[ pair[ 1 ] ] )
					? pair[ 0 ]
					: pair[ 1 ];
		}
		// A run of one colour is a float of the other behind it - only
		// when the row really has two colours.
		if ( pair[ 0 ] !== pair[ 1 ] ) {
			let start = 0;
			for ( let q = 1; q <= cols; q++ ) {
				if ( q === cols || out[ r * cols + q ] !== out[ r * cols + start ] ) {
					if ( q - start > maxFloat ) {
						floats.push( { row: r, from: start, to: q - 1 } );
					}
					start = q;
				}
			}
		}
	}
	// Drop the colours no row kept, so the legend lists only real yarns.
	const used = [ ...new Set( out ) ].sort( ( a, b ) => a - b );
	const remap = new Map( used.map( ( v, i ) => [ v, i ] ) );
	const idx2 = out.map( ( v ) => remap.get( v ) );
	const counts = used.map( () => 0 );
	for ( const v of idx2 ) {
		counts[ v ]++;
	}
	return {
		palette: used.map( ( v ) => palette[ v ] ),
		codes: grid.codes ? used.map( ( v ) => grid.codes[ v ] ) : null,
		idx: idx2,
		counts,
		floats,
	};
}

/* -------------------------------- symbols -------------------------------- */

// High-contrast, easily distinguished chart symbols (30 slots).
export const SYMBOLS =
	'X O / + = * # V T L S 4 Z 7 A e n u ? % 3 b K y 9 R w 2 f 6'.split( ' ' );

export const hexOf = ( p ) =>
	'#' + p.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) ).join( '' );

/* -------------------------------- modes ---------------------------------- */

export const MODES = [
	{ id: 'crossstitch', label: 'Cross-stitch', group: 'photo' },
	{ id: 'diamond', label: 'Diamond painting', group: 'photo' },
	{ id: 'beads', label: 'Fuse beads', group: 'photo' },
	// v3.0: crafts from the proof sheet.
	{ id: 'beadweave', label: 'Bead weaving', group: 'photo' },
	{ id: 'knitting', label: 'Knitting chart', group: 'photo' },
	{ id: 'c2c', label: 'C2C crochet', group: 'photo' },
	{ id: 'filet', label: 'Filet crochet', group: 'photo' },
	{ id: 'latchhook', label: 'Latch hook', group: 'photo' },
	{ id: 'blackwork', label: 'Blackwork', group: 'photo' },
	{ id: 'quilt', label: 'Patchwork quilt', group: 'photo' },
	{ id: 'stringart', label: 'String art', group: 'photo' },
	{ id: 'mandala', label: 'String mandala', group: 'nophoto' },
	{ id: 'hitomezashi', label: 'Hitomezashi', group: 'nophoto' },
	{ id: 'bracelet', label: 'Friendship bracelet', group: 'nophoto' },
];

/** v3.0: the crafts drawn by crafts.js (their own chart and piece). */
export const CRAFTS = [ 'beadweave', 'filet', 'blackwork', 'quilt', 'hitomezashi', 'bracelet' ];

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

/** Shorten a label with an ellipsis until it fits `max` pixels. */
export function fitText( ctx, text, max ) {
	let s = String( text );
	if ( ctx.measureText( s ).width <= max ) {
		return s;
	}
	while ( s.length > 1 && ctx.measureText( s + '…' ).width > max ) {
		s = s.slice( 0, -1 );
	}
	return s + '…';
}

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
 *   colOffset, rowOffset: v2.9 - where this piece sits in the whole
 *               chart (a page of the PDF), so the bold lines and the
 *               edge numbers count in the whole chart's terms.
 *   tiled:      Number the outer edges too (a page needs them).
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
		colOffset = 0,
		rowOffset = 0,
		tiled = false,
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
					// Square drills butt up against each other on the
					// canvas - that gapless coverage is the whole reason
					// people pick them over round ones, so the drill
					// fills its cell edge to edge. An inset here would
					// print a paper margin the finished piece never has;
					// the fine grid drawn on top keeps the cells
					// countable without one.
					const sx = cx;
					const sy = cy;
					const sw = cell;
					const sh = ch;
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

	// v2.9: Fair Isle floats too long to leave - a red bar along the
	// stitches the float runs behind.
	if ( grid.floats && grid.floats.length ) {
		ctx.fillStyle = '#e5484d';
		const bar = Math.max( 2, Math.round( ch * 0.18 ) );
		for ( const f of grid.floats ) {
			const r = f.row - rowOffset;
			if ( r < 0 || r >= rows ) {
				continue;
			}
			const q0 = Math.max( 0, f.from - colOffset );
			const q1 = Math.min( cols - 1, f.to - colOffset );
			if ( q1 < q0 ) {
				continue;
			}
			ctx.fillRect(
				x + q0 * cell + 1,
				y + ( r + 1 ) * ch - bar,
				( q1 - q0 + 1 ) * cell - 2,
				bar
			);
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
	for ( let q = 0; q <= cols; q++ ) {
		if ( 0 !== ( q + colOffset ) % bold ) {
			continue;
		}
		ctx.beginPath();
		ctx.moveTo( x + q * cell, y );
		ctx.lineTo( x + q * cell, y + H );
		ctx.stroke();
	}
	for ( let r = 0; r <= rows; r++ ) {
		if ( 0 !== ( r + rowOffset ) % bold ) {
			continue;
		}
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
	const lastCol = tiled ? cols : cols - 1;
	const lastRow = tiled ? rows : rows - 1;
	for ( let q = 1; q <= lastCol; q++ ) {
		if ( 0 === ( q + colOffset ) % bold ) {
			ctx.fillText( String( q + colOffset ), x + q * cell, y - 3 );
		}
	}
	ctx.textAlign = 'right';
	ctx.textBaseline = 'middle';
	for ( let r = 1; r <= lastRow; r++ ) {
		if ( 0 === ( r + rowOffset ) % bold ) {
			ctx.fillText( String( r + rowOffset ), x - 4, y + r * ch );
		}
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
	const cellW = ( width - 24 ) / perRow;
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
		// v2.9: the thread you buy, when a range is chosen; the hex value
		// otherwise.
		const code = grid.codes && grid.codes[ i ];
		ctx.fillText(
			fitText( ctx, code ? `${ code.brand } ${ code.code } ${ code.name }` : hexOf( p ), cellW - 36 ),
			lx + 30,
			ly + 1
		);
		ctx.fillStyle = '#6a7078';
		ctx.font = '500 10px sans-serif';
		ctx.fillText( usageLine( mode, counts[ i ] ), lx + 30, ly + 13 );
	} );
	ctx.restore();
	return rows * rowH + 16;
}

/* -------------------------------- string art ------------------------------ */

// The boards a thread is wound on, and how much a thread covers. The
// winding itself is the shared engine Text Art draws with
// (extensions/shared/string-art.js), so both draw the same picture.
export const BOARD_SHAPES = [
	{ id: 'round', label: 'Round' },
	{ id: 'square', label: 'Square' },
	{ id: 'heart', label: 'Heart' },
];
export const THREAD_WEIGHTS = { fine: 0.05, normal: 0.07, bold: 0.1 };
// Nails sit this far in from the edge of a real board.
export const NAIL_INSET_CM = 1;
// One planning size for preview and insert: the board is wound once and
// then drawn at whatever size it is shown, so what you see is what you get.
const PLAN_FIELD = 360;
const PLAN_GRID = 300;

/** The square in the middle of the picture, as tones 0 (dark) .. 1. */
function boardField( source, side ) {
	const c = makeCanvas( source, side, side );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, side, side );
	const s = Math.min( source.width, source.height );
	g.drawImage(
		source,
		( source.width - s ) / 2,
		( source.height - s ) / 2,
		s,
		s,
		0,
		0,
		side,
		side
	);
	const d = g.getImageData( 0, 0, side, side ).data;
	const v = new Float32Array( side * side );
	for ( let i = 0; i < v.length; i++ ) {
		v[ i ] =
			( 0.299 * d[ i * 4 ] +
				0.587 * d[ i * 4 + 1 ] +
				0.114 * d[ i * 4 + 2 ] ) /
			255;
	}
	// A photo that never reaches black would wind a grey board.
	const sorted = Float32Array.from( v ).sort();
	const lo = sorted[ Math.floor( sorted.length * 0.02 ) ];
	const hi = sorted[ Math.floor( sorted.length * 0.98 ) ];
	if ( hi - lo > 0.02 ) {
		for ( let i = 0; i < v.length; i++ ) {
			v[ i ] = Math.min(
				1,
				Math.max( 0, ( v[ i ] - lo ) / ( hi - lo ) )
			);
		}
	}
	return { w: side, h: side, v };
}

/** The middle square in colour (v2.9), levelled like the tone field. */
function boardFieldRGB( source, side ) {
	const c = makeCanvas( source, side, side );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, side, side );
	const s = Math.min( source.width, source.height );
	g.drawImage(
		source,
		( source.width - s ) / 2,
		( source.height - s ) / 2,
		s,
		s,
		0,
		0,
		side,
		side
	);
	const d = g.getImageData( 0, 0, side, side ).data;
	const n = side * side;
	const r = new Float32Array( n );
	const gg = new Float32Array( n );
	const b = new Float32Array( n );
	const lum = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		r[ i ] = d[ i * 4 ];
		gg[ i ] = d[ i * 4 + 1 ];
		b[ i ] = d[ i * 4 + 2 ];
		lum[ i ] = 0.299 * r[ i ] + 0.587 * gg[ i ] + 0.114 * b[ i ];
	}
	const sorted = Float32Array.from( lum ).sort();
	const lo = sorted[ Math.floor( n * 0.02 ) ];
	const hi = sorted[ Math.floor( n * 0.98 ) ];
	if ( hi - lo > 5 ) {
		const k = 255 / ( hi - lo );
		for ( const ch of [ r, gg, b ] ) {
			for ( let i = 0; i < n; i++ ) {
				ch[ i ] = Math.min( 255, Math.max( 0, ( ch[ i ] - lo ) * k ) );
			}
		}
	}
	return { w: side, h: side, r, g: gg, b };
}

/**
 * The thread colours a picture asks for (v2.9): its strongest colours that
 * are not the board itself, always including the darkest one, which draws
 * the outlines a coloured string art piece still needs.
 *
 * @param {HTMLCanvasElement} source Picture.
 * @param {number}            k      How many.
 * @return {Array} [ [r,g,b], ... ].
 */
export function pickThreadColors( source, k ) {
	const field = boardFieldRGB( source, 64 );
	const px = [];
	for ( let i = 0; i < 64 * 64; i++ ) {
		px.push( [ field.r[ i ], field.g[ i ], field.b[ i ] ].map( Math.round ) );
	}
	const pal = buildPalette( px, Math.max( 8, k * 3 ) );
	const counts = pal.map( () => 0 );
	for ( const p of px ) {
		counts[ nearestIndex( pal, p ) ]++;
	}
	const paper = [ 255, 255, 255 ];
	const lum = ( c ) => 0.299 * c[ 0 ] + 0.587 * c[ 1 ] + 0.114 * c[ 2 ];
	const order = pal
		.map( ( c, i ) => ( { c, score: counts[ i ] * Math.pow( Math.sqrt( dist2( c, paper ) ), 1.3 ) } ) )
		.filter( ( e ) => dist2( e.c, paper ) > 900 )
		.sort( ( a, b ) => b.score - a.score );
	const darkest = pal.slice().sort( ( a, b ) => lum( a ) - lum( b ) )[ 0 ];
	const out = [ darkest ];
	for ( const e of order ) {
		if ( out.length >= k ) {
			break;
		}
		if ( out.every( ( c ) => dist2( c, e.c ) > 1600 ) ) {
			out.push( e.c );
		}
	}
	return out.slice( 0, Math.max( 1, k ) );
}

/**
 * Wind the board once.
 *
 * @param {HTMLCanvasElement} source Picture (any size; its middle square).
 * @param {Object}            opts   { nails, threads, thickness
 *                                   (fine | normal | bold), board
 *                                   (round | square | heart), grid,
 *                                   colors (v2.9: two or more thread
 *                                   colours [r,g,b] - one thread each) }.
 * @return {Object} { layers: [ { color (null = the chosen ink), order,
 *                  pts, length } ] in winding order, nails, width, side,
 *                  board, length (all thread, in board widths); order and
 *                  pts of the first thread for the old single-thread uses }.
 */
export function planStringArt( source, opts = {} ) {
	const board = BOARD_SHAPES.some( ( b ) => b.id === opts.board )
		? opts.board
		: 'round';
	const common = {
		nails: opts.nails || 288,
		threads: opts.threads || 2400,
		weight: THREAD_WEIGHTS[ opts.thickness ] || THREAD_WEIGHTS.normal,
		size: opts.grid || PLAN_GRID,
		board,
		seed: 3,
	};
	let layers;
	let nails;
	let width;
	if ( opts.colors && opts.colors.length >= 2 ) {
		const art = stringArtColors( boardFieldRGB( source, PLAN_FIELD ), opts.colors, common );
		nails = art.nails;
		width = art.width;
		layers = art.layers.map( ( l ) => ( { ...l, length: threadLength( l.pts, nails ) } ) );
	} else {
		const art = stringArt( boardField( source, PLAN_FIELD ), common );
		nails = art.nails;
		width = art.width;
		layers = [
			{ color: null, order: art.order, pts: art.pts, length: threadLength( art.pts, nails ) },
		];
	}
	return {
		layers,
		order: layers[ 0 ].order,
		pts: layers[ 0 ].pts,
		nails,
		width,
		side: PLAN_FIELD,
		board,
		length: layers.reduce( ( a, l ) => a + l.length, 0 ),
	};
}

/** How many threads the board takes, all colours together. */
export const threadCount = ( plan ) =>
	plan.layers.reduce( ( a, l ) => a + Math.max( 0, l.order.length - 1 ), 0 );

/**
 * How much thread a real board takes, in metres: the chords at the nails'
 * span plus a little around every nail.
 *
 * @param {Object} plan   From planStringArt.
 * @param {number} boardCm Board width in centimetres.
 * @return {number} Metres.
 */
export function threadMetres( plan, boardCm, layer = null ) {
	const span = Math.max( 1, boardCm - 2 * NAIL_INSET_CM );
	const of = ( l ) => ( l.length * span + l.order.length * 0.6 ) / 100;
	if ( layer ) {
		return of( layer );
	}
	return ( plan.layers || [ plan ] ).reduce( ( a, l ) => a + of( l ), 0 );
}

/**
 * Draw the wound board at any size. The thread is as wide as the planner
 * assumed, scaled with the drawing, so a board drawn four times larger is
 * the same picture, sharper.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} plan From planStringArt.
 * @param {Object} opts { size (px), color (thread), paper, limit (v2.9:
 *                      only the first so many threads - the winding as it
 *                      goes, for the time-lapse), canvas (draw into this
 *                      one instead of a new canvas) }.
 * @return {HTMLCanvasElement} A square canvas.
 */
export function drawStringArt( like, plan, opts = {} ) {
	const size = Math.max( 32, Math.round( opts.size || 1200 ) );
	const c = opts.canvas || makeCanvas( like, size, size );
	const g = c.getContext( '2d' );
	g.fillStyle = opts.paper || '#ffffff';
	g.fillRect( 0, 0, size, size );
	const s = size / plan.side;
	g.save();
	g.scale( s, s );
	// One path, one stroke per thread: where threads cross the colour does
	// not pile up, just as a real thread lying on another one is not
	// darker. Coloured threads are wound one after the other, the last on
	// top.
	g.lineWidth = plan.width * 2;
	g.lineCap = 'round';
	g.lineJoin = 'round';
	let left = undefined === opts.limit ? Infinity : opts.limit;
	for ( const layer of plan.layers || [ plan ] ) {
		if ( left <= 0 ) {
			break;
		}
		const pts = layer.pts.slice( 0, Math.min( layer.pts.length, left + 1 ) );
		left -= Math.max( 0, layer.pts.length - 1 );
		if ( pts.length < 2 ) {
			continue;
		}
		g.strokeStyle = layer.color ? hexOf( layer.color ) : opts.color || '#26292e';
		g.beginPath();
		pts.forEach( ( p, i ) =>
			i ? g.lineTo( p[ 0 ], p[ 1 ] ) : g.moveTo( p[ 0 ], p[ 1 ] )
		);
		g.stroke();
	}
	g.fillStyle = '#31353b';
	const r = Math.max( 0.35, plan.side / 520 );
	for ( const [ x, y ] of plan.nails ) {
		g.beginPath();
		g.arc( x, y, r, 0, Math.PI * 2 );
		g.fill();
	}
	g.restore();
	return c;
}

/**
 * The winding guide: nail numbers in threading order, in columns -
 * print it and actually build the piece. Nail 1 is the top centre and
 * the count runs clockwise, exactly as on the nail template.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} plan From planStringArt.
 * @param {Object} opts { title, facts (second header line), labels (v2.9:
 *                      one per thread colour, e.g. "DMC 310 Black") }.
 * @return {HTMLCanvasElement}
 */
export function renderStringGuide( like, plan, opts = {} ) {
	const layers = plan.layers || [ plan ];
	if ( layers.length > 1 ) {
		// One section per thread, in the order they are wound, stacked.
		const parts = layers.map( ( layer, i ) =>
			renderStringGuide( like, { ...plan, layers: null, order: layer.order, nails: plan.nails }, {
				title: `${ i + 1 }. ${ ( opts.labels && opts.labels[ i ] ) || hexOf( layer.color ) }`,
				facts: i ? '' : opts.facts,
				swatch: hexOf( layer.color ),
			} )
		);
		const c = makeCanvas( like, parts[ 0 ].width, parts.reduce( ( a, p ) => a + p.height, 0 ) );
		const g = c.getContext( '2d' );
		let y = 0;
		for ( const p of parts ) {
			g.drawImage( p, 0, y );
			y += p.height;
		}
		return c;
	}
	const seq = plan.order;
	const COLS = 10;
	const CW = 96;
	const RH = 26;
	const M = 50;
	const head = opts.facts ? 92 : 60;
	const rows = Math.ceil( seq.length / COLS );
	const c = makeCanvas( like, COLS * CW + M * 2, rows * RH + M * 2 + head );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	let tx = M;
	if ( opts.swatch ) {
		g.fillStyle = opts.swatch;
		g.fillRect( M, M - 12, 24, 24 );
		g.strokeStyle = 'rgba(0,0,0,0.35)';
		g.strokeRect( M + 0.5, M - 11.5, 23, 23 );
		tx = M + 34;
	}
	g.fillStyle = '#26292e';
	g.font = '700 24px sans-serif';
	g.textAlign = 'left';
	g.textBaseline = 'middle';
	g.fillText(
		`${ String( opts.title || 'String Art' ) } · ${ plan.nails.length } · ${
			seq.length - 1
		}`,
		tx,
		M
	);
	if ( opts.facts ) {
		g.font = '500 17px sans-serif';
		g.fillStyle = '#4a4f57';
		g.fillText( String( opts.facts ), M, M + 32 );
	}
	g.font = '500 15px monospace';
	for ( let i = 0; i < seq.length; i++ ) {
		const col = Math.floor( i / rows );
		const row = i % rows;
		g.fillStyle = i % 2 ? '#31353b' : '#6a7078';
		g.fillText(
			`${ String( i ).padStart( 4, ' ' ) }: ${ seq[ i ] + 1 }`,
			M + col * CW,
			M + head - 14 + row * RH
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
 * The sheet prints the nail numbers it talks in, otherwise the rule
 * above is not buildable on a bare ring of dots.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { nails (60..320), factor (2..12), color (hex),
 *                        labels (false for the small preview tile,
 *                        where numbers only scale down to smudges) }.
 * @return {HTMLCanvasElement}
 */
export function buildStringMandala( like, opts = {} ) {
	const NAILS = Math.max( 60, Math.min( 320, opts.nails || 200 ) );
	const factor = Math.max( 2, Math.min( 12, opts.factor || 2 ) );
	const color = opts.color || '#26292e';
	const labels = false !== opts.labels;
	const SIZE = 1000;
	const CX = SIZE / 2;
	const CY = SIZE / 2;
	// The ring keeps its distance from the edge because the nail
	// numbers are printed outside it - shrink this margin back and they
	// run off the sheet. The margin stays the same when the numbers are
	// suppressed, so both sheets are the same drawing.
	const R = SIZE / 2 - 62;
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
	if ( labels ) {
		// Counting starts at 0 at the top and runs clockwise: the
		// mandala IS the times table, and "i goes to i * factor" only
		// reads off the sheet when the nail called 0 is the one the
		// arithmetic calls 0. (The string-art winding guide numbers
		// from 1 - that sheet lists a threading ORDER, not a table.)
		// Only every step-th nail is written, or the ring turns into a
		// grey band of digits.
		let step = 20;
		if ( NAILS <= 120 ) {
			step = 5;
		} else if ( NAILS <= 240 ) {
			step = 10;
		}
		g.font = '600 20px sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		for ( let i = 0; i < NAILS; i += step ) {
			const a = ( i / NAILS ) * Math.PI * 2 - Math.PI / 2;
			g.fillStyle = i ? '#6a7078' : '#26292e';
			g.fillText(
				String( i ),
				CX + Math.cos( a ) * ( R + 26 ),
				CY + Math.sin( a ) * ( R + 26 )
			);
		}
	}
	return c;
}
