/**
 * Dev tool: render a photo through every template mode.
 *   node tools/contact-sheet.mjs <photo> <silhouettePhoto> <out.png>
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	paintByNumbers,
	renderNumberLegend,
	coloringPage,
	connectTheDots,
	gridSheet,
} from '../src/drawing-engine.js';

const require = createRequire(
	new URL( '../../../package.json', import.meta.url )
);
const { createCanvas, loadImage } = require( 'canvas' );

const [ , , photoPath, silhouettePath, outPath ] = process.argv;

const toCanvas = ( img, maxW ) => {
	const s = Math.min( 1, maxW / img.width );
	const c = createCanvas(
		Math.round( img.width * s ),
		Math.round( img.height * s )
	);
	c.getContext( '2d' ).drawImage( img, 0, 0, c.width, c.height );
	return c;
};

const photo = toCanvas( await loadImage( photoPath ), 900 );
const silhouette = toCanvas( await loadImage( silhouettePath ), 900 );

const pbn = paintByNumbers( photo, { colors: 14, smooth: 2 } );
const pbnSheet = ( () => {
	const rows = Math.ceil(
		pbn.palette.length / Math.max( 3, Math.floor( pbn.canvas.width / 130 ) )
	);
	const c = createCanvas(
		pbn.canvas.width,
		pbn.canvas.height + rows * 32 + 24
	);
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.drawImage( pbn.canvas, 0, 0 );
	renderNumberLegend( g, pbn.palette, {
		x: 0,
		y: pbn.canvas.height + 10,
		width: c.width,
	} );
	return c;
} )();

const tiles = [
	{ label: `Paint by numbers (${ pbn.regions } Regionen)`, c: pbnSheet },
	{ label: 'Coloring page', c: coloringPage( photo, { detail: 2 } ) },
	{
		label: 'Connect the dots (Hase)',
		c: connectTheDots( silhouette, { count: 60 } ).canvas,
	},
	{ label: 'Grid drawing aid', c: gridSheet( photo, { cells: 8 } ) },
];

const PAD = 24;
const maxH = Math.max( ...tiles.map( ( tl ) => tl.c.height ) );
const W = tiles.reduce( ( s, tl ) => s + tl.c.width + PAD, PAD );
const sheet = createCanvas( W, maxH + PAD * 2 + 24 );
const g = sheet.getContext( '2d' );
g.fillStyle = '#23262b';
g.fillRect( 0, 0, sheet.width, sheet.height );
let x = PAD;
for ( const tl of tiles ) {
	g.drawImage( tl.c, x, PAD );
	g.fillStyle = '#e8eaee';
	g.font = '600 15px sans-serif';
	g.fillText( tl.label, x + 2, PAD + maxH + 18 );
	x += tl.c.width + PAD;
}
writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
process.stdout.write( `wrote ${ outPath }\n` );
