/**
 * The crafts of v3.0: bead weaving (peyote, brick stitch, loom), filet
 * crochet, blackwork, a patchwork quilt, hitomezashi and friendship
 * bracelets - judged on a proof sheet from real photos first, then built.
 *
 * Every craft returns the same four things, so the studio lays them all
 * out alike: the working chart, the finished piece, the legend (what to
 * buy, how much) and a few facts (how big it gets).
 *
 *   { chart, finished, legend: [ { rgb, label, usage, symbol } ], facts }
 *
 * Pure apart from the canvas handed in; seeded; node-testable.
 */

import { buildPalette, nearestIndex, hexOf, SYMBOLS } from './stitch-engine.js';
import { snapPalette } from './threadsets.js';

export const NO_PHOTO = [ 'mandala', 'hitomezashi', 'bracelet' ];

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = Math.max( 1, Math.round( w ) );
	c.height = Math.max( 1, Math.round( h ) );
	return c;
};

const lumOf = ( p ) => 0.299 * p[ 0 ] + 0.587 * p[ 1 ] + 0.114 * p[ 2 ];

/** A rounded rectangle path, without relying on ctx.roundRect. */
function rrect( g, x, y, w, h, r ) {
	const k = Math.min( r, w / 2, h / 2 );
	g.beginPath();
	g.moveTo( x + k, y );
	g.arcTo( x + w, y, x + w, y + h, k );
	g.arcTo( x + w, y + h, x, y + h, k );
	g.arcTo( x, y + h, x, y, k );
	g.arcTo( x, y, x + w, y, k );
	g.closePath();
}

function rng( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/** The source squeezed to w x h cells: an [r,g,b] per cell. */
export function sampleGrid( source, w, h ) {
	const c = makeCanvas( source, w, h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, w, h );
	g.drawImage( source, 0, 0, w, h );
	const d = g.getImageData( 0, 0, w, h ).data;
	const out = [];
	for ( let i = 0; i < w * h; i++ ) {
		out.push( [ d[ i * 4 ], d[ i * 4 + 1 ], d[ i * 4 + 2 ] ] );
	}
	return out;
}

/** Bold edge numbers every ten cells, as on every counted chart. */
function edgeNumbers( g, o ) {
	const { x, y, cols, rows, cw, ch, dx = 0 } = o;
	g.fillStyle = '#4a4f57';
	g.font = `600 ${ Math.max( 8, Math.round( Math.min( cw, ch ) * 0.8 ) ) }px sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'bottom';
	for ( let q = 10; q < cols; q += 10 ) {
		g.fillText( String( q ), x + q * cw + dx, y - 3 );
	}
	g.textAlign = 'right';
	g.textBaseline = 'middle';
	for ( let r = 10; r < rows; r += 10 ) {
		g.fillText( String( r ), x - 4, y + r * ch );
	}
}

/** The palette of a photo craft: pinned colours, or the image's own;
 * snapped to a maker range when one is chosen. */
function craftPalette( cells, o ) {
	const chosen =
		o.fixed && o.fixed.length >= 2 ? o.fixed.map( ( p ) => p.slice() ) : buildPalette( cells, o.colors || 10 );
	const snapped = snapPalette( chosen, o.yarn || '' );
	return { palette: snapped.palette, codes: snapped.codes };
}

/** The few words a legend needs; the studio hands in its translations. */
const WORDS = {
	filled: 'filled',
	open: 'open',
	stitches: 'stitches',
	knots: 'knots',
	squares: 'squares',
	halves: 'triangle squares',
	beads: 'beads',
};
const words = ( o ) => ( { ...WORDS, ...( o.words || {} ) } );

const codeLabel = ( codes, i, p ) =>
	codes && codes[ i ] ? `${ codes[ i ].brand } ${ codes[ i ].code } ${ codes[ i ].name }` : hexOf( p );

/* ------------------------------ bead weaving ----------------------------- */

export const WEAVES = [
	{ id: 'peyote', label: 'Peyote' },
	{ id: 'brick', label: 'Brick stitch' },
	{ id: 'loom', label: 'Loom' },
];

/**
 * Cylinder beads (Delica 11/0: about 1.6 mm across, 1.3 mm along the
 * hole). Peyote columns sit half a bead up and down, brick-stitch rows
 * half a bead left and right, loom beads in plain rows.
 *
 * @param {Object} source Picture.
 * @param {Object} o      { weave, cols, colors, fixed, yarn, cell, symbols }.
 */
export function beadWeave( source, o = {} ) {
	const weave = WEAVES.some( ( w ) => w.id === o.weave ) ? o.weave : 'peyote';
	const cols = Math.max( 8, o.cols || 40 );
	const bw = Math.max( 4, o.cell || 12 );
	const bh = Math.max( 3, Math.round( ( bw * 1.3 ) / 1.6 ) );
	const rows = Math.max( 8, Math.round( ( cols * bw * source.height ) / source.width / bh ) );
	const cells = sampleGrid( source, cols, rows );
	const { palette, codes } = craftPalette( cells, o );
	const idx = cells.map( ( p ) => nearestIndex( palette, p ) );
	const counts = palette.map( () => 0 );
	idx.forEach( ( i ) => counts[ i ]++ );
	const pos = ( q, r ) => [
		q * bw + ( 'brick' === weave && r % 2 ? bw / 2 : 0 ),
		r * bh + ( 'peyote' === weave && q % 2 ? bh / 2 : 0 ),
	];
	const W = cols * bw + bw;
	const H = rows * bh + bh;
	const M = Math.round( bw * 2.2 );
	const draw = ( glassy ) => {
		const c = makeCanvas( source, W + M * 2, H + M * 2 );
		const g = c.getContext( '2d' );
		g.fillStyle = glassy ? '#f2efe8' : '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		for ( let r = 0; r < rows; r++ ) {
			for ( let q = 0; q < cols; q++ ) {
				const pi = idx[ r * cols + q ];
				const p = palette[ pi ];
				const [ x0, y0 ] = pos( q, r );
				const x = M + x0;
				const y = M + y0;
				rrect( g, x + 0.5, y + 0.5, bw - 1, bh - 1, Math.min( bw, bh ) * ( glassy ? 0.32 : 0.18 ) );
				g.fillStyle = hexOf( p );
				g.fill();
				g.strokeStyle = glassy ? 'rgba(0,0,0,0.22)' : 'rgba(0,0,0,0.35)';
				g.lineWidth = 1;
				g.stroke();
				if ( glassy ) {
					// The glassy highlight along the bead, and the hole.
					g.fillStyle = 'rgba(255,255,255,0.32)';
					g.fillRect( x + bw * 0.2, y + bh * 0.16, bw * 0.6, bh * 0.15 );
					g.fillStyle = 'rgba(0,0,0,0.2)';
					g.fillRect( x + bw * 0.42, y + bh * 0.36, bw * 0.16, bh * 0.28 );
				} else if ( o.symbols && bw >= 9 ) {
					g.fillStyle = lumOf( p ) > 150 ? '#31353b' : '#ffffff';
					g.font = `600 ${ Math.round( bh * 0.72 ) }px sans-serif`;
					g.textAlign = 'center';
					g.textBaseline = 'middle';
					g.fillText( SYMBOLS[ pi % SYMBOLS.length ], x + bw / 2, y + bh / 2 + 0.5 );
				}
			}
		}
		if ( ! glassy ) {
			edgeNumbers( g, { x: M, y: M, cols, rows, cw: bw, ch: bh, dx: bw / 2 } );
		}
		return c;
	};
	return {
		chart: draw( false ),
		finished: draw( true ),
		legend: palette.map( ( p, i ) => ( {
			rgb: p,
			symbol: SYMBOLS[ i % SYMBOLS.length ],
			label: codeLabel( codes, i, p ),
			// About two hundred Delica 11/0 to the gram.
			usage: `${ counts[ i ] } ${ words( o ).beads } · ~${ Math.max( 1, Math.ceil( counts[ i ] / 200 ) ) } g`,
		} ) ),
		facts: { cols, rows, widthMm: cols * 1.6, heightMm: rows * 1.3, beads: cols * rows },
	};
}

/* ------------------------------ filet crochet ---------------------------- */

/** Otsu's threshold on 0..255 luminances. */
export function otsu( lums ) {
	const hist = new Array( 256 ).fill( 0 );
	for ( const v of lums ) {
		hist[ Math.max( 0, Math.min( 255, Math.round( v ) ) ) ]++;
	}
	const total = lums.length;
	let sum = 0;
	for ( let i = 0; i < 256; i++ ) {
		sum += i * hist[ i ];
	}
	let sumB = 0;
	let wB = 0;
	let best = 0;
	let thr = 128;
	for ( let i = 0; i < 256; i++ ) {
		wB += hist[ i ];
		if ( ! wB ) {
			continue;
		}
		const wF = total - wB;
		if ( ! wF ) {
			break;
		}
		sumB += i * hist[ i ];
		const mB = sumB / wB;
		const mF = ( sum - sumB ) / wF;
		const between = wB * wF * ( mB - mF ) ** 2;
		if ( between > best ) {
			best = between;
			thr = i;
		}
	}
	return thr;
}

/**
 * Filet crochet: open meshes and filled blocks. Filet draws with light
 * and dark, so the picture is split at its own threshold, and the smaller
 * side - usually the motif - is the one that is filled.
 *
 * @param {Object} source Picture.
 * @param {Object} o      { cols, cell, invert, thread (hex) }.
 */
export function filetCrochet( source, o = {} ) {
	const cols = Math.max( 8, o.cols || 40 );
	const cell = Math.max( 4, o.cell || 12 );
	const rows = Math.max( 8, Math.round( ( cols * source.height ) / source.width ) );
	const lums = sampleGrid( source, cols, rows ).map( lumOf );
	const thr = otsu( lums );
	let filled = lums.map( ( v ) => v < thr );
	const dark = filled.filter( Boolean ).length;
	if ( dark > lums.length / 2 ) {
		filled = filled.map( ( f ) => ! f );
	}
	if ( o.invert ) {
		filled = filled.map( ( f ) => ! f );
	}
	const W = cols * cell;
	const H = rows * cell;
	const M = Math.round( cell * 2.2 );
	const nFilled = filled.filter( Boolean ).length;
	const thread = o.thread || '#f3ecdc';

	const chart = makeCanvas( source, W + M * 2, H + M * 2 );
	{
		const g = chart.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, chart.width, chart.height );
		g.fillStyle = '#2b2e33';
		filled.forEach( ( f, i ) => {
			if ( f ) {
				g.fillRect( M + ( i % cols ) * cell, M + Math.floor( i / cols ) * cell, cell, cell );
			}
		} );
		g.strokeStyle = 'rgba(0,0,0,0.18)';
		g.lineWidth = 1;
		for ( let q = 0; q <= cols; q++ ) {
			g.beginPath();
			g.moveTo( M + q * cell + 0.5, M );
			g.lineTo( M + q * cell + 0.5, M + H );
			g.stroke();
		}
		for ( let r = 0; r <= rows; r++ ) {
			g.beginPath();
			g.moveTo( M, M + r * cell + 0.5 );
			g.lineTo( M + W, M + r * cell + 0.5 );
			g.stroke();
		}
		g.strokeStyle = 'rgba(0,0,0,0.45)';
		g.lineWidth = 1.4;
		for ( let q = 0; q <= cols; q += 10 ) {
			g.beginPath();
			g.moveTo( M + q * cell, M );
			g.lineTo( M + q * cell, M + H );
			g.stroke();
		}
		for ( let r = 0; r <= rows; r += 10 ) {
			g.beginPath();
			g.moveTo( M, M + r * cell );
			g.lineTo( M + W, M + r * cell );
			g.stroke();
		}
		edgeNumbers( g, { x: M, y: M, cols, rows, cw: cell, ch: cell } );
	}

	// The lace on a dark table: open squares are holes, filled ones are
	// three trebles side by side.
	const finished = makeCanvas( source, W + M * 2, H + M * 2 );
	{
		const g = finished.getContext( '2d' );
		g.fillStyle = '#3a3330';
		g.fillRect( 0, 0, finished.width, finished.height );
		const lw = Math.max( 1.2, cell * 0.17 );
		for ( let r = 0; r < rows; r++ ) {
			for ( let q = 0; q < cols; q++ ) {
				const x = M + q * cell;
				const y = M + r * cell;
				if ( filled[ r * cols + q ] ) {
					g.fillStyle = thread;
					g.fillRect( x, y, cell, cell );
					g.strokeStyle = 'rgba(90,70,50,0.3)';
					g.lineWidth = 1;
					for ( let k = 1; k < 3; k++ ) {
						g.beginPath();
						g.moveTo( x + ( k * cell ) / 3, y + 1 );
						g.lineTo( x + ( k * cell ) / 3, y + cell - 1 );
						g.stroke();
					}
				} else {
					g.strokeStyle = thread;
					g.lineWidth = lw;
					g.strokeRect( x + lw / 2, y + lw / 2, cell - lw, cell - lw );
				}
			}
		}
	}
	return {
		chart,
		finished,
		legend: [
			{ rgb: [ 43, 46, 51 ], label: words( o ).filled, usage: String( nFilled ) },
			{ rgb: [ 255, 255, 255 ], label: words( o ).open, usage: String( cols * rows - nFilled ) },
		],
		facts: { cols, rows, filled: nFilled, open: cols * rows - nFilled },
	};
}

/* -------------------------------- blackwork ------------------------------ */

/** The fill pattern of one tone step, as segments in a unit cell. */
export function blackworkStitches( level, q, r ) {
	const out = [];
	if ( level >= 1 && ( q + r ) % 2 === 0 ) {
		out.push( [ 0, 1, 1, 0 ] );
	}
	if ( level >= 2 ) {
		out.push( [ 0, 0, 1, 1 ] );
	}
	if ( level >= 3 ) {
		out.push( [ 0, 1, 1, 0 ] );
	}
	if ( level >= 4 ) {
		out.push( [ 0.5, 0, 0.5, 1 ] );
	}
	if ( level >= 5 ) {
		out.push( [ 0, 0.5, 1, 0.5 ], [ 0, 0, 1, 0 ] );
	}
	return out;
}

/**
 * Blackwork: one dark thread on light linen; the tones become fill
 * patterns of growing density, each step adding stitches to the one
 * below it, as in a sampler.
 *
 * @param {Object} source Picture.
 * @param {Object} o      { cols, cell, thread (hex), label (thread name) }.
 */
export function blackwork( source, o = {} ) {
	const cols = Math.max( 8, o.cols || 48 );
	const cell = Math.max( 4, o.cell || 12 );
	const rows = Math.max( 8, Math.round( ( cols * source.height ) / source.width ) );
	const lums = sampleGrid( source, cols, rows ).map( lumOf );
	const sorted = lums.slice().sort( ( a, b ) => a - b );
	const lo = sorted[ Math.floor( lums.length * 0.03 ) ];
	const hi = sorted[ Math.floor( lums.length * 0.97 ) ];
	const levels = lums.map( ( v ) =>
		Math.max( 0, Math.min( 5, Math.floor( ( 1 - ( v - lo ) / Math.max( 1, hi - lo ) ) * 6 ) ) )
	);
	const thread = o.thread || '#1d1f24';
	const M = Math.round( cell * 2.2 );
	let stitches = 0;
	const draw = ( paper, grid ) => {
		const c = makeCanvas( source, cols * cell + M * 2, rows * cell + M * 2 );
		const g = c.getContext( '2d' );
		g.fillStyle = paper;
		g.fillRect( 0, 0, c.width, c.height );
		if ( grid ) {
			g.strokeStyle = 'rgba(0,0,0,0.1)';
			g.lineWidth = 1;
			for ( let q = 0; q <= cols; q++ ) {
				g.beginPath();
				g.moveTo( M + q * cell + 0.5, M );
				g.lineTo( M + q * cell + 0.5, M + rows * cell );
				g.stroke();
			}
			for ( let r = 0; r <= rows; r++ ) {
				g.beginPath();
				g.moveTo( M, M + r * cell + 0.5 );
				g.lineTo( M + cols * cell, M + r * cell + 0.5 );
				g.stroke();
			}
		}
		g.strokeStyle = thread;
		g.lineWidth = Math.max( 1, cell * ( grid ? 0.1 : 0.13 ) );
		g.lineCap = 'round';
		let n = 0;
		for ( let r = 0; r < rows; r++ ) {
			for ( let q = 0; q < cols; q++ ) {
				for ( const [ a, b, c2, d ] of blackworkStitches( levels[ r * cols + q ], q, r ) ) {
					g.beginPath();
					g.moveTo( M + ( q + a ) * cell, M + ( r + b ) * cell );
					g.lineTo( M + ( q + c2 ) * cell, M + ( r + d ) * cell );
					g.stroke();
					n++;
				}
			}
		}
		stitches = n;
		if ( grid ) {
			edgeNumbers( g, { x: M, y: M, cols, rows, cw: cell, ch: cell } );
		}
		return c;
	};
	const chart = draw( '#ffffff', true );
	const finished = draw( '#f3eee2', false );
	return {
		chart,
		finished,
		legend: [ { rgb: hexRgb( thread ), label: o.label || thread, usage: `${ stitches } ${ words( o ).stitches }` } ],
		facts: { cols, rows, stitches },
		key: ( size ) => blackworkKey( source, size, thread ),
	};
}

/** The six tone steps side by side - the key printed under the chart. */
export function blackworkKey( like, size = 18, thread = '#1d1f24' ) {
	const c = makeCanvas( like, 6 * ( size * 2 + size ) + size, size * 2 + 8 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.strokeStyle = thread;
	g.lineWidth = Math.max( 1, size * 0.1 );
	for ( let level = 0; level < 6; level++ ) {
		const x0 = size / 2 + level * size * 3;
		for ( let r = 0; r < 2; r++ ) {
			for ( let q = 0; q < 2; q++ ) {
				g.strokeStyle = 'rgba(0,0,0,0.12)';
				g.strokeRect( x0 + q * size, 4 + r * size, size, size );
				g.strokeStyle = thread;
				for ( const [ a, b, c2, d ] of blackworkStitches( level, q, r ) ) {
					g.beginPath();
					g.moveTo( x0 + ( q + a ) * size, 4 + ( r + b ) * size );
					g.lineTo( x0 + ( q + c2 ) * size, 4 + ( r + d ) * size );
					g.stroke();
				}
			}
		}
	}
	return c;
}

function hexRgb( hex ) {
	const h = String( hex ).replace( '#', '' );
	return [ 0, 2, 4 ].map( ( i ) => parseInt( h.slice( i, i + 2 ), 16 ) || 0 );
}

/* --------------------------------- quilt --------------------------------- */

const LETTERS = 'ABCDEFGHIJKLMNOP';

/**
 * A patchwork quilt: blocks of one fabric, or two fabrics meeting on a
 * diagonal (half-square triangles) where that draws the picture clearly
 * better; with the cutting list a quilter works from.
 *
 * @param {Object} source Picture.
 * @param {Object} o      { blocks (across), fabrics, fixed, cell (px per
 *                        block), blockCm (finished block size), seed }.
 */
export function quilt( source, o = {} ) {
	const bx = Math.max( 4, o.blocks || 14 );
	const by = Math.max( 4, Math.round( ( bx * source.height ) / source.width ) );
	const S = Math.max( 10, o.cell || 36 );
	const sub = 8;
	const cells = sampleGrid( source, bx * sub, by * sub );
	const fabrics =
		o.fixed && o.fixed.length >= 2
			? o.fixed.map( ( p ) => p.slice() )
			: buildPalette( cells, Math.max( 3, Math.min( 12, o.fabrics || 7 ) ) );
	const err = ( a, b ) =>
		( a[ 0 ] - b[ 0 ] ) ** 2 + ( a[ 1 ] - b[ 1 ] ) ** 2 + ( a[ 2 ] - b[ 2 ] ) ** 2;
	const bestOf = ( px ) => {
		let bi = 0;
		let be = Infinity;
		fabrics.forEach( ( f, k ) => {
			const e = px.reduce( ( a, p ) => a + err( p, f ), 0 );
			if ( e < be ) {
				be = e;
				bi = k;
			}
		} );
		return [ bi, be ];
	};
	// Every block: [ kind, a, b ] - 'sq' one fabric, 'd1' split from the
	// top left to the bottom right (a above), 'd2' from top right to
	// bottom left (a above).
	const blocks = [];
	const squares = fabrics.map( () => 0 );
	const halves = fabrics.map( () => 0 );
	for ( let j = 0; j < by; j++ ) {
		for ( let i = 0; i < bx; i++ ) {
			const parts = { all: [], a1: [], a2: [], b1: [], b2: [] };
			for ( let y = 0; y < sub; y++ ) {
				for ( let x = 0; x < sub; x++ ) {
					const p = cells[ ( j * sub + y ) * bx * sub + i * sub + x ];
					parts.all.push( p );
					( x > y ? parts.a1 : parts.a2 ).push( p );
					( x + y < sub - 1 ? parts.b1 : parts.b2 ).push( p );
				}
			}
			const [ fa, ea ] = bestOf( parts.all );
			const [ f1, e1 ] = bestOf( parts.a1 );
			const [ f2, e2 ] = bestOf( parts.a2 );
			const [ g1, h1 ] = bestOf( parts.b1 );
			const [ g2, h2 ] = bestOf( parts.b2 );
			if ( Math.min( e1 + e2, h1 + h2 ) < ea * 0.72 && ( f1 !== f2 || g1 !== g2 ) ) {
				if ( e1 + e2 <= h1 + h2 && f1 !== f2 ) {
					blocks.push( [ 'd1', f1, f2 ] );
					halves[ f1 ]++;
					halves[ f2 ]++;
				} else {
					blocks.push( [ 'd2', g1, g2 ] );
					halves[ g1 ]++;
					halves[ g2 ]++;
				}
			} else {
				blocks.push( [ 'sq', fa, fa ] );
				squares[ fa ]++;
			}
		}
	}
	const M = Math.round( S * 0.9 );
	const tri = ( g, pts, fill ) => {
		g.fillStyle = fill;
		g.beginPath();
		pts.forEach( ( p, n ) => ( n ? g.lineTo( p[ 0 ], p[ 1 ] ) : g.moveTo( p[ 0 ], p[ 1 ] ) ) );
		g.closePath();
		g.fill();
	};
	const shapesOf = ( b, x, y ) =>
		'd1' === b[ 0 ]
			? [
					[ [ [ x, y ], [ x + S, y ], [ x + S, y + S ] ], b[ 1 ] ],
					[ [ [ x, y ], [ x, y + S ], [ x + S, y + S ] ], b[ 2 ] ],
			  ]
			: 'd2' === b[ 0 ]
			? [
					[ [ [ x, y ], [ x + S, y ], [ x, y + S ] ], b[ 1 ] ],
					[ [ [ x + S, y ], [ x + S, y + S ], [ x, y + S ] ], b[ 2 ] ],
			  ]
			: [ [ [ [ x, y ], [ x + S, y ], [ x + S, y + S ], [ x, y + S ] ], b[ 1 ] ] ];
	const draw = ( finished ) => {
		const c = makeCanvas( source, bx * S + M * 2, by * S + M * 2 );
		const g = c.getContext( '2d' );
		g.fillStyle = finished ? '#e9e3d6' : '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		const rand = rng( o.seed || 7 );
		blocks.forEach( ( b, n ) => {
			const x = M + ( n % bx ) * S;
			const y = M + Math.floor( n / bx ) * S;
			for ( const [ pts, k ] of shapesOf( b, x, y ) ) {
				const f = fabrics[ k ];
				tri( g, pts, finished ? hexOf( f ) : `rgba(${ f[ 0 ] },${ f[ 1 ] },${ f[ 2 ] },0.55)` );
				if ( finished ) {
					// A small print on every fabric, so the pieces read as cloth.
					g.save();
					g.beginPath();
					pts.forEach( ( p, i ) => ( i ? g.lineTo( p[ 0 ], p[ 1 ] ) : g.moveTo( p[ 0 ], p[ 1 ] ) ) );
					g.closePath();
					g.clip();
					g.fillStyle = lumOf( f ) > 140 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.09)';
					for ( let d = 0; d < 7; d++ ) {
						g.beginPath();
						g.arc( x + rand() * S, y + rand() * S, S * 0.05, 0, Math.PI * 2 );
						g.fill();
					}
					g.restore();
				} else {
					// Which fabric: its letter in the middle of the piece.
					const cx = pts.reduce( ( a, p ) => a + p[ 0 ], 0 ) / pts.length;
					const cy = pts.reduce( ( a, p ) => a + p[ 1 ], 0 ) / pts.length;
					g.fillStyle = '#26292e';
					g.font = `700 ${ Math.round( S * ( pts.length > 3 ? 0.4 : 0.28 ) ) }px sans-serif`;
					g.textAlign = 'center';
					g.textBaseline = 'middle';
					g.fillText( LETTERS[ k % LETTERS.length ], cx, cy );
				}
			}
			// Seams; on the finished quilt a running quilting stitch too.
			g.strokeStyle = finished ? 'rgba(40,30,20,0.4)' : 'rgba(0,0,0,0.55)';
			g.lineWidth = finished ? 1 : 1.2;
			g.strokeRect( x + 0.5, y + 0.5, S - 1, S - 1 );
			if ( 'sq' !== b[ 0 ] ) {
				g.beginPath();
				if ( 'd1' === b[ 0 ] ) {
					g.moveTo( x, y );
					g.lineTo( x + S, y + S );
				} else {
					g.moveTo( x + S, y );
					g.lineTo( x, y + S );
				}
				g.stroke();
			}
			if ( finished ) {
				g.save();
				g.setLineDash( [ S * 0.08, S * 0.06 ] );
				g.strokeStyle = 'rgba(255,255,255,0.45)';
				g.strokeRect( x + S * 0.18, y + S * 0.18, S * 0.64, S * 0.64 );
				g.restore();
			}
		} );
		if ( ! finished ) {
			edgeNumbers( g, { x: M, y: M, cols: bx, rows: by, cw: S, ch: S } );
		}
		return c;
	};
	const blockCm = o.blockCm || 10;
	return {
		chart: draw( false ),
		finished: draw( true ),
		legend: fabrics.map( ( f, k ) => ( {
			rgb: f,
			symbol: LETTERS[ k % LETTERS.length ],
			label: `${ LETTERS[ k % LETTERS.length ] } · ${ hexOf( f ) }`,
			// Half-square triangles two at a time: one square of each
			// fabric gives two units.
			usage: `${ squares[ k ] } ${ words( o ).squares } · ${ Math.ceil( halves[ k ] / 2 ) } ${ words( o ).halves }`,
		} ) ),
		facts: {
			blocks: [ bx, by ],
			blockCm,
			// Seam allowances: squares + 1.25 cm, HST squares + 2.2 cm.
			cutSquare: blockCm + 1.25,
			cutHalf: blockCm + 2.2,
			widthCm: bx * blockCm,
			heightCm: by * blockCm,
			squares: squares.reduce( ( a, v ) => a + v, 0 ),
			halves: halves.reduce( ( a, v ) => a + v, 0 ) / 2,
		},
	};
}

/* ------------------------------- hitomezashi ------------------------------ */

/** The on/off start of every line, from the letters of a word. */
export function hitoBits( word, n ) {
	const letters =
		String( word || '' )
			.toUpperCase()
			.normalize( 'NFD' )
			.replace( /[^A-Z]/g, '' ) || 'A';
	return Array.from( { length: n }, ( _, i ) => ( 'AEIOUY'.includes( letters[ i % letters.length ] ) ? 1 : 0 ) );
}

/**
 * Hitomezashi: running stitches along every grid line, each line starting
 * with a stitch or a gap by one letter of a word (a vowel starts with a
 * stitch). Where the lines cross, the pattern locks; its regions can
 * always be coloured in two colours, which is what makes it look woven.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} o    { across, down, cols, rows, cell, thread, fabric
 *                      [two colours] }.
 */
export function hitomezashi( like, o = {} ) {
	const cols = Math.max( 6, o.cols || 30 );
	const rows = Math.max( 6, o.rows || 30 );
	const cell = Math.max( 4, o.cell || 14 );
	const rowBits = hitoBits( o.across, rows + 1 );
	const colBits = hitoBits( o.down, cols + 1 );
	const hStitch = ( r, q ) => ( q + rowBits[ r ] ) % 2 === 0;
	const vStitch = ( q, r ) => ( r + colBits[ q ] ) % 2 === 0;
	const colour = new Uint8Array( cols * rows );
	for ( let r = 0; r < rows; r++ ) {
		for ( let q = 0; q < cols; q++ ) {
			if ( q ) {
				colour[ r * cols + q ] = colour[ r * cols + q - 1 ] ^ ( vStitch( q, r ) ? 1 : 0 );
			} else if ( r ) {
				colour[ r * cols ] = colour[ ( r - 1 ) * cols ] ^ ( hStitch( r, 0 ) ? 1 : 0 );
			}
		}
	}
	let stitches = 0;
	const M = Math.round( cell * 1.8 );
	const draw = ( finished ) => {
		const c = makeCanvas( like, cols * cell + M * 2, rows * cell + M * 2 );
		const g = c.getContext( '2d' );
		const fills = o.fabric || [ '#1f3a5f', '#284b78' ];
		g.fillStyle = finished ? fills[ 0 ] : '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		if ( finished ) {
			for ( let r = 0; r < rows; r++ ) {
				for ( let q = 0; q < cols; q++ ) {
					g.fillStyle = fills[ colour[ r * cols + q ] ];
					g.fillRect( M + q * cell, M + r * cell, cell + 0.5, cell + 0.5 );
				}
			}
		} else {
			// Grid dots: where the needle goes in and out.
			g.fillStyle = 'rgba(0,0,0,0.3)';
			for ( let r = 0; r <= rows; r++ ) {
				for ( let q = 0; q <= cols; q++ ) {
					g.fillRect( M + q * cell - 1, M + r * cell - 1, 2, 2 );
				}
			}
			// The letter of every line at its start.
			g.font = `600 ${ Math.max( 7, Math.round( cell * 0.6 ) ) }px sans-serif`;
			g.textBaseline = 'middle';
			g.textAlign = 'right';
			for ( let r = 0; r <= rows; r++ ) {
				g.fillStyle = rowBits[ r ] ? '#c0392b' : '#8a9099';
				g.fillText( rowBits[ r ] ? '●' : '○', M - 4, M + r * cell );
			}
			g.textAlign = 'center';
			g.textBaseline = 'bottom';
			for ( let q = 0; q <= cols; q++ ) {
				g.fillStyle = colBits[ q ] ? '#c0392b' : '#8a9099';
				g.fillText( colBits[ q ] ? '●' : '○', M + q * cell, M - 3 );
			}
		}
		g.strokeStyle = finished ? o.thread || '#f4efe4' : '#26292e';
		g.lineWidth = Math.max( 1.4, cell * ( finished ? 0.17 : 0.12 ) );
		g.lineCap = 'round';
		const inset = cell * 0.12;
		let n = 0;
		for ( let r = 0; r <= rows; r++ ) {
			for ( let q = 0; q < cols; q++ ) {
				if ( hStitch( r, q ) ) {
					g.beginPath();
					g.moveTo( M + q * cell + inset, M + r * cell );
					g.lineTo( M + ( q + 1 ) * cell - inset, M + r * cell );
					g.stroke();
					n++;
				}
			}
		}
		for ( let q = 0; q <= cols; q++ ) {
			for ( let r = 0; r < rows; r++ ) {
				if ( vStitch( q, r ) ) {
					g.beginPath();
					g.moveTo( M + q * cell, M + r * cell + inset );
					g.lineTo( M + q * cell, M + ( r + 1 ) * cell - inset );
					g.stroke();
					n++;
				}
			}
		}
		stitches = n;
		return c;
	};
	const fills = o.fabric || [ '#1f3a5f', '#284b78' ];
	return {
		chart: draw( false ),
		finished: draw( true ),
		legend: [
			{ rgb: hexRgb( o.thread || '#f4efe4' ), label: o.threadLabel || o.thread || '#f4efe4', usage: `${ stitches } ${ words( o ).stitches }` },
			{ rgb: hexRgb( fills[ 0 ] ), label: fills[ 0 ], usage: '' },
			{ rgb: hexRgb( fills[ 1 ] ), label: fills[ 1 ], usage: '' },
		],
		facts: { cols, rows, stitches },
	};
}

/* --------------------------- friendship bracelets ------------------------- */

// Capitals and digits, 5 x 7.
const FONT = {
	A: '01110 10001 10001 11111 10001 10001 10001',
	B: '11110 10001 10001 11110 10001 10001 11110',
	C: '01110 10001 10000 10000 10000 10001 01110',
	D: '11110 10001 10001 10001 10001 10001 11110',
	E: '11111 10000 10000 11110 10000 10000 11111',
	F: '11111 10000 10000 11110 10000 10000 10000',
	G: '01110 10001 10000 10111 10001 10001 01111',
	H: '10001 10001 10001 11111 10001 10001 10001',
	I: '01110 00100 00100 00100 00100 00100 01110',
	J: '00111 00010 00010 00010 00010 10010 01100',
	K: '10001 10010 10100 11000 10100 10010 10001',
	L: '10000 10000 10000 10000 10000 10000 11111',
	M: '10001 11011 10101 10101 10001 10001 10001',
	N: '10001 11001 10101 10011 10001 10001 10001',
	O: '01110 10001 10001 10001 10001 10001 01110',
	P: '11110 10001 10001 11110 10000 10000 10000',
	Q: '01110 10001 10001 10001 10101 10010 01101',
	R: '11110 10001 10001 11110 10100 10010 10001',
	S: '01111 10000 10000 01110 00001 00001 11110',
	T: '11111 00100 00100 00100 00100 00100 00100',
	U: '10001 10001 10001 10001 10001 10001 01110',
	V: '10001 10001 10001 10001 10001 01010 00100',
	W: '10001 10001 10001 10101 10101 10101 01010',
	X: '10001 10001 01010 00100 01010 10001 10001',
	Y: '10001 10001 01010 00100 00100 00100 00100',
	Z: '11111 00001 00010 00100 01000 10000 11111',
	0: '01110 10001 10011 10101 11001 10001 01110',
	1: '00100 01100 00100 00100 00100 00100 01110',
	2: '01110 10001 00001 00010 00100 01000 11111',
	3: '11111 00010 00100 00010 00001 10001 01110',
	4: '00010 00110 01010 10010 11111 00010 00010',
	5: '11111 10000 11110 00001 00001 10001 01110',
	6: '00110 01000 10000 11110 10001 10001 01110',
	7: '11111 00001 00010 00100 01000 01000 01000',
	8: '01110 10001 10001 01110 10001 10001 01110',
	9: '01110 10001 10001 01111 00001 00010 01100',
	'♥': '00000 01010 11111 11111 01110 00100 00000',
	'-': '00000 00000 00000 11111 00000 00000 00000',
	'!': '00100 00100 00100 00100 00100 00000 00100',
	'.': '00000 00000 00000 00000 00000 00000 00100',
	' ': '000 000 000 000 000 000 000',
};

/** A word in knots: 9 knots high, letters 5 x 7 with a one-knot border. */
export function alphaGrid( text ) {
	const chars = [ ...String( text || '' ).toUpperCase().normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' ) ]
		// A star asks for a heart.
		.map( ( ch ) => ( '*' === ch ? '♥' : ch ) )
		.filter( ( ch ) => FONT[ ch ] );
	const glyphs = ( chars.length ? chars : [ 'A' ] ).map( ( ch ) => FONT[ ch ].split( ' ' ) );
	const cols = glyphs.reduce( ( a, gl ) => a + gl[ 0 ].length + 1, 3 );
	const rows = 9;
	const on = new Uint8Array( cols * rows );
	let x0 = 2;
	for ( const gl of glyphs ) {
		for ( let r = 0; r < 7; r++ ) {
			for ( let q = 0; q < gl[ r ].length; q++ ) {
				if ( '1' === gl[ r ][ q ] ) {
					on[ ( r + 1 ) * cols + x0 + q ] = 1;
				}
			}
		}
		x0 += gl[ 0 ].length + 1;
	}
	return { cols, rows, on };
}

/**
 * A chevron, knot by knot: the strings mirrored about the middle, forward
 * knots on the left, backward knots on the right, a forward-backward knot
 * in the middle. A forward knot shows the left string and swaps the two,
 * a backward knot the right one; forward-backward shows the left one and
 * leaves them in place. The V-shaped stripes come out of the simulation,
 * so the diagram is the one you actually knot.
 *
 * @param {number} k    Colours (2..5).
 * @param {number} rows Knot rows.
 * @return {Array} rows of [ { at (between string at and at+1), type, color } ].
 */
export function chevronKnots( k, rows ) {
	const n = Math.max( 2, Math.min( 5, k ) );
	let strings = [ ...Array.from( { length: n }, ( _, i ) => i ), ...Array.from( { length: n }, ( _, i ) => n - 1 - i ) ];
	const S = strings.length;
	const mid = ( S - 1 ) / 2;
	const out = [];
	for ( let r = 0; r < rows; r++ ) {
		const row = [];
		for ( let at = r % 2; at + 1 < S; at += 2 ) {
			const centre = at + 0.5;
			const type = Math.abs( centre - mid ) < 1e-9 ? 'fb' : centre < mid ? 'f' : 'b';
			const left = strings[ at ];
			const right = strings[ at + 1 ];
			row.push( { at, type, color: 'b' === type ? right : left } );
			if ( 'fb' !== type ) {
				strings = strings.slice();
				strings[ at ] = right;
				strings[ at + 1 ] = left;
			}
		}
		out.push( row );
	}
	return { rows: out, strings: S };
}

/**
 * Friendship bracelets: a name in knots (alpha) or a chevron.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} o    { kind (alpha | chevron), name, colors [rgb],
 *                      labels, cell, length (chevron rows) }.
 */
export function bracelet( like, o = {} ) {
	const k = Math.max( 6, o.cell || 14 );
	const colors = ( o.colors && o.colors.length >= 2 ? o.colors : [ [ 232, 80, 91 ], [ 249, 213, 110 ], [ 20, 177, 171 ], [ 243, 236, 226 ] ] ).slice( 0, 5 );
	const labels = o.labels || colors.map( hexOf );
	const M = Math.round( k * 1.5 );
	if ( 'chevron' === o.kind ) {
		const nRows = Math.max( 8, o.length || 24 );
		const plan = chevronKnots( colors.length, nRows );
		const S = plan.strings;
		const counts = colors.map( () => 0 );
		plan.rows.forEach( ( row ) => row.forEach( ( kn ) => counts[ kn.color ]++ ) );
		const width = ( S - 1 ) * k;
		const draw = ( finished ) => {
			const c = makeCanvas( like, width + M * 2, nRows * k * 0.75 + k + M * 2 );
			const g = c.getContext( '2d' );
			g.fillStyle = finished ? '#efeae0' : '#ffffff';
			g.fillRect( 0, 0, c.width, c.height );
			if ( ! finished ) {
				// The strings at the top, in their colours.
				for ( let s = 0; s < S; s++ ) {
					const col = colors[ s < S / 2 ? s : S - 1 - s ];
					g.fillStyle = hexOf( col );
					g.fillRect( M + s * k - k * 0.06, M - k * 0.9, k * 0.12, k * 0.7 );
				}
			}
			plan.rows.forEach( ( row, r ) => {
				for ( const kn of row ) {
					const cx = M + ( kn.at + 0.5 ) * k;
					const cy = M + r * k * 0.75 + k / 2;
					const col = hexOf( colors[ kn.color ] );
					if ( finished ) {
						// A knot is a little slanted bump.
						g.save();
						g.translate( cx, cy );
						g.rotate( ( 'b' === kn.type ? -1 : 1 ) * Math.PI / 4 );
						rrect( g, -k * 0.5, -k * 0.34, k, k * 0.68, k * 0.3 );
						g.fillStyle = col;
						g.fill();
						g.strokeStyle = 'rgba(0,0,0,0.18)';
						g.lineWidth = 1;
						g.stroke();
						g.restore();
					} else {
						g.fillStyle = col;
						g.beginPath();
						g.arc( cx, cy, k * 0.46, 0, Math.PI * 2 );
						g.fill();
						g.strokeStyle = 'rgba(0,0,0,0.35)';
						g.lineWidth = 1;
						g.stroke();
						// The knot's direction as an arrow.
						const dark = lumOf( colors[ kn.color ] ) > 150 ? '#26292e' : '#ffffff';
						g.strokeStyle = dark;
						g.fillStyle = dark;
						g.lineWidth = Math.max( 1.2, k * 0.09 );
						const arrow = ( dir ) => {
							g.beginPath();
							g.moveTo( cx - dir * k * 0.2, cy - k * 0.2 );
							g.lineTo( cx + dir * k * 0.2, cy + k * 0.2 );
							g.stroke();
							g.beginPath();
							g.moveTo( cx + dir * k * 0.24, cy + k * 0.24 );
							g.lineTo( cx + dir * k * 0.06, cy + k * 0.2 );
							g.lineTo( cx + dir * k * 0.2, cy + k * 0.06 );
							g.closePath();
							g.fill();
						};
						if ( 'fb' === kn.type ) {
							g.beginPath();
							g.moveTo( cx - k * 0.2, cy - k * 0.15 );
							g.lineTo( cx, cy + k * 0.15 );
							g.lineTo( cx + k * 0.2, cy - k * 0.15 );
							g.stroke();
						} else {
							arrow( 'f' === kn.type ? 1 : -1 );
						}
					}
				}
			} );
			return c;
		};
		return {
			chart: draw( false ),
			finished: draw( true ),
			legend: colors.map( ( p, i ) => ( { rgb: p, label: labels[ i ], usage: `${ counts[ i ] } ${ words( o ).knots }` } ) ),
			facts: { strings: S, rows: nRows, knots: plan.rows.reduce( ( a, r ) => a + r.length, 0 ), lengthCm: Math.round( nRows * 0.18 ) },
		};
	}
	// Alpha: the word in knots, background the first colour, letters the
	// second.
	const grid = alphaGrid( o.name );
	const bg = colors[ 0 ];
	const fg = colors[ 1 ];
	const draw = ( finished ) => {
		const c = makeCanvas( like, grid.cols * k + M * 2, grid.rows * k + M * 2 );
		const g = c.getContext( '2d' );
		g.fillStyle = finished ? '#efeae0' : '#ffffff';
		g.fillRect( 0, 0, c.width, c.height );
		for ( let r = 0; r < grid.rows; r++ ) {
			for ( let q = 0; q < grid.cols; q++ ) {
				const col = hexOf( grid.on[ r * grid.cols + q ] ? fg : bg );
				const x = M + q * k;
				const y = M + r * k;
				if ( finished ) {
					g.save();
					g.translate( x + k / 2, y + k / 2 );
					g.rotate( Math.PI / 4 );
					rrect( g, -k * 0.5, -k * 0.36, k, k * 0.72, k * 0.3 );
					g.fillStyle = col;
					g.fill();
					g.strokeStyle = 'rgba(0,0,0,0.16)';
					g.lineWidth = 1;
					g.stroke();
					g.restore();
				} else {
					g.fillStyle = col;
					g.fillRect( x, y, k, k );
					g.strokeStyle = 'rgba(0,0,0,0.25)';
					g.lineWidth = 1;
					g.strokeRect( x + 0.5, y + 0.5, k - 1, k - 1 );
				}
			}
		}
		if ( ! finished ) {
			edgeNumbers( g, { x: M, y: M, cols: grid.cols, rows: grid.rows, cw: k, ch: k } );
		}
		return c;
	};
	const fgCount = grid.on.reduce( ( a, v ) => a + v, 0 );
	return {
		chart: draw( false ),
		finished: draw( true ),
		legend: [
			{ rgb: bg, label: labels[ 0 ], usage: `${ grid.cols * grid.rows - fgCount } ${ words( o ).knots }` },
			{ rgb: fg, label: labels[ 1 ], usage: `${ fgCount } ${ words( o ).knots }` },
		],
		facts: { strings: grid.rows + 1, rows: grid.cols, knots: grid.cols * grid.rows, lengthCm: Math.round( grid.cols * 0.32 ) },
	};
}
