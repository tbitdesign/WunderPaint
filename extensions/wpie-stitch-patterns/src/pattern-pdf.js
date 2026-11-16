/**
 * The pattern as a printable PDF (v2.9): how charts are actually worked
 * from - a cover with the finished piece, the chart spread over pages at a
 * size the symbols can be read at, and the thread list.
 *
 * Each chart page repeats the last two columns and rows of its
 * neighbour under a light veil, so the pages line up when you move from
 * one to the next, and every page counts in the whole chart's numbers.
 * Pages are drawn in millimetres at print resolution and written with the
 * nail template's PDF writer, so they print at their true size.
 *
 * Pure apart from the canvas handed in; node-testable.
 */

import { renderChart, SYMBOLS, hexOf, usageLine, fitText } from './stitch-engine.js';
import { PAPERS } from './nail-template.js';

const DPI = 200;
const px = ( mm ) => Math.round( ( mm / 25.4 ) * DPI );
const MARGIN = 12; // mm
const HEAD = 14; // mm
const FOOT = 8; // mm
const GUTTER = 9; // mm, for the row numbers
const TOP_NUMBERS = 6; // mm, for the column numbers
export const OVERLAP = 2;

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/**
 * How the chart is cut into pages.
 *
 * @param {number} cols   Chart columns.
 * @param {number} rows   Chart rows.
 * @param {Object} o      { paper, cellMm, cellHmm }.
 * @return {Object} { perCol, perRow, across, down, tiles: [ { col, row,
 *                  c0, r0, c1, r1 } ] } - c1/r1 exclusive.
 */
export function chartTiles( cols, rows, o = {} ) {
	const [ W, H ] = PAPERS[ o.paper ] || PAPERS.a4;
	const cellMm = o.cellMm || 3;
	const cellHmm = o.cellHmm || cellMm;
	const areaW = W - 2 * MARGIN - GUTTER;
	const areaH = H - 2 * MARGIN - HEAD - FOOT - TOP_NUMBERS;
	const perCol = Math.max( OVERLAP + 4, Math.floor( areaW / cellMm ) );
	const perRow = Math.max( OVERLAP + 4, Math.floor( areaH / cellHmm ) );
	const step = ( n ) => n - OVERLAP;
	const starts = ( total, per ) => {
		const out = [ 0 ];
		while ( out[ out.length - 1 ] + per < total ) {
			out.push( out[ out.length - 1 ] + step( per ) );
		}
		return out;
	};
	const xs = starts( cols, perCol );
	const ys = starts( rows, perRow );
	const tiles = [];
	ys.forEach( ( r0, row ) =>
		xs.forEach( ( c0, col ) =>
			tiles.push( {
				col,
				row,
				c0,
				r0,
				c1: Math.min( cols, c0 + perCol ),
				r1: Math.min( rows, r0 + perRow ),
			} )
		)
	);
	return { perCol, perRow, across: xs.length, down: ys.length, tiles };
}

/** A part of the grid, for one page. */
function subGrid( grid, cols, t ) {
	const w = t.c1 - t.c0;
	const h = t.r1 - t.r0;
	const idx = new Uint16Array( w * h );
	for ( let r = 0; r < h; r++ ) {
		for ( let q = 0; q < w; q++ ) {
			idx[ r * w + q ] = grid.idx[ ( t.r0 + r ) * cols + t.c0 + q ];
		}
	}
	return { ...grid, idx };
}

/**
 * All pages of the pattern.
 *
 * @param {Object} like  Canvas-like.
 * @param {Object} grid  From buildGrid (or fairIsle).
 * @param {number} cols  Columns.
 * @param {number} rows  Rows.
 * @param {Object} o     { mode, gauge (knitting, %), symbols, drill,
 *                       boardSize, paper, title, facts [lines], finished
 *                       (canvas for the cover, optional), labels { page,
 *                       of, columns, rows, colors, stitches, overview,
 *                       floats } }.
 * @return {Array} [ { canvas, wMm, hMm } ].
 */
export function patternPages( like, grid, cols, rows, o = {} ) {
	const paper = PAPERS[ o.paper ] ? o.paper : 'a4';
	const [ W, H ] = PAPERS[ paper ];
	const L = o.labels || {};
	const cellMm = 3;
	const cellHmm = 'knitting' === o.mode ? ( cellMm * ( o.gauge || 75 ) ) / 100 : cellMm;
	const plan = chartTiles( cols, rows, { paper, cellMm, cellHmm } );
	const pages = [];
	const total = 1 + plan.tiles.length + Math.ceil( grid.palette.length / 26 );
	const newPage = () => {
		const canvas = makeCanvas( like, px( W ), px( H ) );
		const g = canvas.getContext( '2d' );
		g.fillStyle = '#ffffff';
		g.fillRect( 0, 0, canvas.width, canvas.height );
		pages.push( { canvas, wMm: W, hMm: H } );
		return g;
	};
	const header = ( g, right ) => {
		g.fillStyle = '#26292e';
		g.font = `700 ${ px( 4.6 ) }px sans-serif`;
		g.textAlign = 'left';
		g.textBaseline = 'alphabetic';
		g.fillText( fitText( g, o.title || 'Pattern', px( W * 0.55 ) ), px( MARGIN ), px( MARGIN + 6 ) );
		g.font = `500 ${ px( 3 ) }px sans-serif`;
		g.textAlign = 'right';
		g.fillStyle = '#4a4f57';
		g.fillText( right, px( W - MARGIN ), px( MARGIN + 6 ) );
		g.fillRect( px( MARGIN ), px( MARGIN + 9 ), px( W - 2 * MARGIN ), Math.max( 1, px( 0.25 ) ) );
	};
	const footer = ( g, n ) => {
		g.fillStyle = '#6a7078';
		g.font = `500 ${ px( 2.8 ) }px sans-serif`;
		g.textAlign = 'center';
		g.textBaseline = 'alphabetic';
		g.fillText( `${ L.page || 'Page' } ${ n } ${ L.of || '/' } ${ total }`, px( W / 2 ), px( H - MARGIN + 4 ) );
	};

	/* cover */
	{
		const g = newPage();
		header( g, `${ cols } × ${ rows } ${ L.stitches || '' }`.trim() );
		let y = MARGIN + HEAD + 4;
		if ( o.finished ) {
			const maxW = W - 2 * MARGIN;
			const maxH = H * 0.5;
			const s = Math.min( maxW / o.finished.width, maxH / o.finished.height );
			const w = o.finished.width * s;
			const h = o.finished.height * s;
			g.drawImage( o.finished, px( ( W - w ) / 2 ), px( y ), px( w ), px( h ) );
			y += h + 8;
		}
		g.fillStyle = '#31353b';
		g.font = `500 ${ px( 3.6 ) }px sans-serif`;
		g.textAlign = 'left';
		g.textBaseline = 'top';
		for ( const line of o.facts || [] ) {
			g.fillText( fitText( g, line, px( W - 2 * MARGIN ) ), px( MARGIN ), px( y ) );
			y += 6;
		}
		// Which page holds which part of the chart.
		y += 4;
		g.font = `700 ${ px( 3.4 ) }px sans-serif`;
		g.fillText( L.overview || 'Pages', px( MARGIN ), px( y ) );
		y += 7;
		const boxW = Math.min( 22, ( W - 2 * MARGIN ) / plan.across );
		const boxH = Math.min( 22 * ( rows / plan.down / Math.max( 1, cols / plan.across ) ), H - y - MARGIN - FOOT, ( H - y - MARGIN - FOOT ) / plan.down );
		g.font = `600 ${ px( 3 ) }px sans-serif`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		plan.tiles.forEach( ( t, i ) => {
			const x0 = MARGIN + t.col * boxW;
			const y0 = y + t.row * boxH;
			g.strokeStyle = '#6a7078';
			g.lineWidth = Math.max( 1, px( 0.3 ) );
			g.strokeRect( px( x0 ), px( y0 ), px( boxW - 1 ), px( boxH - 1 ) );
			g.fillStyle = '#31353b';
			g.fillText( String( i + 2 ), px( x0 + boxW / 2 ), px( y0 + boxH / 2 ) );
		} );
		footer( g, 1 );
	}

	/* chart pages */
	const cell = px( cellMm );
	const cellH = 'knitting' === o.mode ? Math.round( ( cell * ( o.gauge || 75 ) ) / 100 ) : cell;
	plan.tiles.forEach( ( t, i ) => {
		const g = newPage();
		header(
			g,
			`${ L.columns || 'Columns' } ${ t.c0 + 1 }–${ t.c1 } · ${ L.rows || 'Rows' } ${ t.r0 + 1 }–${ t.r1 }`
		);
		const x = px( MARGIN + GUTTER );
		const y = px( MARGIN + HEAD + TOP_NUMBERS );
		const w = t.c1 - t.c0;
		const h = t.r1 - t.r0;
		renderChart( g, subGrid( grid, cols, t ), w, h, {
			mode: o.mode,
			cell,
			cellH,
			symbols: o.symbols,
			boardSize: o.boardSize || 0,
			drill: o.drill,
			x,
			y,
			colOffset: t.c0,
			rowOffset: t.r0,
			tiled: true,
		} );
		// The overlap with the page before: shown, but veiled.
		g.fillStyle = 'rgba(120,128,140,0.28)';
		if ( t.col > 0 ) {
			g.fillRect( x, y, OVERLAP * cell, h * cellH );
		}
		if ( t.row > 0 ) {
			g.fillRect( x, y, w * cell, OVERLAP * cellH );
		}
		footer( g, i + 2 );
	} );

	/* thread list */
	const PER = 26;
	for ( let start = 0; start < grid.palette.length; start += PER ) {
		const g = newPage();
		header( g, `${ grid.palette.length } ${ L.colors || 'colors' }` );
		let y = MARGIN + HEAD + 4;
		const rowMm = 8.6;
		for ( let i = start; i < Math.min( grid.palette.length, start + PER ); i++ ) {
			const p = grid.palette[ i ];
			// Symbol on the chart's own tint, then the colour itself.
			g.fillStyle = `rgba(${ p[ 0 ] },${ p[ 1 ] },${ p[ 2 ] },0.3)`;
			g.fillRect( px( MARGIN ), px( y ), px( 7 ), px( 7 ) );
			g.strokeStyle = 'rgba(0,0,0,0.4)';
			g.lineWidth = Math.max( 1, px( 0.2 ) );
			g.strokeRect( px( MARGIN ), px( y ), px( 7 ), px( 7 ) );
			if ( o.symbols ) {
				g.fillStyle = '#31353b';
				g.font = `600 ${ px( 4.4 ) }px sans-serif`;
				g.textAlign = 'center';
				g.textBaseline = 'middle';
				g.fillText( SYMBOLS[ i % SYMBOLS.length ], px( MARGIN + 3.5 ), px( y + 3.7 ) );
			}
			g.fillStyle = hexOf( p );
			g.fillRect( px( MARGIN + 10 ), px( y ), px( 12 ), px( 7 ) );
			g.strokeRect( px( MARGIN + 10 ), px( y ), px( 12 ), px( 7 ) );
			const code = grid.codes && grid.codes[ i ];
			g.fillStyle = '#26292e';
			g.font = `600 ${ px( 3.4 ) }px sans-serif`;
			g.textAlign = 'left';
			g.textBaseline = 'middle';
			g.fillText(
				fitText( g, code ? `${ code.brand } ${ code.code } · ${ code.name }` : hexOf( p ), px( 100 ) ),
				px( MARGIN + 26 ),
				px( y + 3.7 )
			);
			g.fillStyle = '#4a4f57';
			g.font = `500 ${ px( 3.2 ) }px sans-serif`;
			g.textAlign = 'right';
			g.fillText( usageLine( o.mode, grid.counts[ i ] ), px( W - MARGIN ), px( y + 3.7 ) );
			y += rowMm;
		}
		if ( grid.floats && grid.floats.length && start + PER >= grid.palette.length && L.floats ) {
			g.fillStyle = '#e5484d';
			g.fillRect( px( MARGIN ), px( y + 3 ), px( 7 ), px( 1.4 ) );
			g.fillStyle = '#31353b';
			g.font = `500 ${ px( 3.2 ) }px sans-serif`;
			g.textAlign = 'left';
			g.fillText( L.floats, px( MARGIN + 10 ), px( y + 3.7 ) );
		}
		footer( g, 1 + plan.tiles.length + 1 + Math.floor( start / PER ) );
	}
	return pages;
}
