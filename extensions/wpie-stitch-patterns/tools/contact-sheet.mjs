/**
 * Dev tool: render a photo through every craft mode.
 *   node tools/contact-sheet.mjs <photo> <out.png>
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	MODES,
	buildGrid,
	renderChart,
	renderLegend,
} from '../src/stitch-engine.js';

const require = createRequire(
	new URL( '../../../package.json', import.meta.url )
);
const { createCanvas, loadImage } = require( 'canvas' );

const [ , , photoPath, outPath ] = process.argv;
const img = await loadImage( photoPath );

const COLS = 60;
const CELL = 10;

const tiles = MODES.map( ( m ) => {
	const gauge = 'knitting' === m.id ? 0.75 : 1;
	const rows = Math.max(
		8,
		Math.round( COLS / ( img.width / img.height ) / gauge )
	);
	// Crop to the grid aspect, centered.
	const target = COLS / rows;
	let sw = img.width;
	let sh = img.width / target;
	if ( sh > img.height ) {
		sh = img.height;
		sw = img.height * target;
	}
	const src = createCanvas( Math.round( sw ), Math.round( sh ) );
	src.getContext( '2d' ).drawImage(
		img,
		( img.width - sw ) / 2,
		( img.height - sh ) * 0.35,
		sw,
		sh,
		0,
		0,
		src.width,
		src.height
	);
	const grid = buildGrid( src, COLS, rows, 14 );
	const cellH = 'knitting' === m.id ? Math.round( CELL * 0.75 ) : CELL;
	const chartW = COLS * CELL;
	const chartH = rows * cellH;
	const legendRows = Math.ceil(
		grid.palette.length / Math.max( 2, Math.floor( chartW / 190 ) )
	);
	const c = createCanvas( chartW + 60, chartH + 60 + legendRows * 34 + 30 );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	renderChart( g, grid, COLS, rows, {
		mode: m.id,
		cell: CELL,
		cellH,
		boardSize: 'beads' === m.id ? 29 : 0,
		x: 30,
		y: 30,
	} );
	renderLegend( g, grid, {
		mode: m.id,
		x: 30,
		y: 30 + chartH + 12,
		width: chartW,
	} );
	return { label: m.label, canvas: c };
} );

const PAD = 26;
const maxH = Math.max( ...tiles.map( ( tl ) => tl.canvas.height ) );
const W = tiles.reduce( ( s, tl ) => s + tl.canvas.width + PAD, PAD );
const sheet = createCanvas( W, maxH + PAD * 2 + 26 );
const g = sheet.getContext( '2d' );
g.fillStyle = '#23262b';
g.fillRect( 0, 0, sheet.width, sheet.height );
let x = PAD;
for ( const tl of tiles ) {
	g.drawImage( tl.canvas, x, PAD );
	g.fillStyle = '#e8eaee';
	g.font = '600 15px sans-serif';
	g.fillText( tl.label, x + 4, PAD + maxH + 20 );
	x += tl.canvas.width + PAD;
}
writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
process.stdout.write( `wrote ${ outPath }\n` );
