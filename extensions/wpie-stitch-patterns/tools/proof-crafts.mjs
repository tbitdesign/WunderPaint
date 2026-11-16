/**
 * Proof sheet for the candidate crafts (v2.9): every one drawn from a
 * real photo with src/crafts-next.js, side by side, so they can be judged
 * BEFORE any of them is built into the studio (the lesson of Film
 * Frames: proof from real material first).
 *
 *   node tools/proof-crafts.mjs <photo> <portrait> <delica.json> <out.png>
 *
 * delica.json: data/json/miyuki-delica.json of the craft-color-codes
 * package (CC BY 4.0, see ATTRIBUTION.md) - optional, '' to skip.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	beadWeave,
	filetCrochet,
	blackwork,
	quilt,
	hitomezashi,
	bracelet,
} from '../src/crafts.js';

const require = createRequire( new URL( '../../../package.json', import.meta.url ) );
const { createCanvas, loadImage } = require( 'canvas' );

const [ , , photoPath, portraitPath, delicaPath, outPath ] = process.argv;
const toCanvas = async ( p, max = 900 ) => {
	const im = await loadImage( p );
	const s = Math.min( 1, max / Math.max( im.width, im.height ) );
	const c = createCanvas( Math.round( im.width * s ), Math.round( im.height * s ) );
	c.getContext( '2d' ).drawImage( im, 0, 0, c.width, c.height );
	return c;
};
const photo = await toCanvas( photoPath );
const portrait = await toCanvas( portraitPath );
const delica = delicaPath
	? JSON.parse( readFileSync( delicaPath, 'utf8' ) )
			.colors.filter( ( c ) => ! c.discontinued )
			.map( ( c ) => [ c.code, c.name, ...c.rgb ] )
	: null;

const tiles = [
	[ 'Perlenweben: Peyote (Delica-Farben)', beadWeave( photo, { weave: 'peyote', cols: 36, colors: 10, fixed: null, yarn: '', cell: 13 } ).finished ],
	[ 'Perlenweben: Brick Stitch', beadWeave( photo, { weave: 'brick', cols: 36, colors: 10, cell: 13 } ).finished ],
	[ 'Perlenweben: Webrahmen (Porträt)', beadWeave( portrait, { weave: 'loom', cols: 40, colors: 12, cell: 12 } ).finished ],
	[ 'Filethäkeln (Porträt): Zählmuster', filetCrochet( portrait, { cols: 40, cell: 9 } ).chart ],
	[ 'Filethäkeln (Porträt): Spitze', filetCrochet( portrait, { cols: 40, cell: 9 } ).finished ],
	[ 'Blackwork (Porträt)', blackwork( portrait, { cols: 46, cell: 11 } ).finished ],
	[ 'Patchwork-Quilt', quilt( photo, { blocks: 14, fabrics: 7, cell: 34 } ).finished ],
	[ 'Hitomezashi', hitomezashi( createCanvas( 1, 1 ), { across: 'WUNDERPAINT', down: 'SASHIKO', cols: 30, rows: 30, cell: 16 } ).finished ],
	[ 'Freundschaftsband: Chevron', bracelet( createCanvas( 1, 1 ), { kind: 'chevron', cell: 20 } ).chart ],
];
void delica;

const TILE = 520;
const COLS = 3;
const LABEL = 30;
const rowsN = Math.ceil( tiles.length / COLS );
const sheet = createCanvas( COLS * TILE + ( COLS + 1 ) * 16, rowsN * ( TILE + LABEL ) + ( rowsN + 1 ) * 16 );
const g = sheet.getContext( '2d' );
g.fillStyle = '#e9e7e2';
g.fillRect( 0, 0, sheet.width, sheet.height );
tiles.forEach( ( [ label, c ], i ) => {
	const x = 16 + ( i % COLS ) * ( TILE + 16 );
	const y = 16 + Math.floor( i / COLS ) * ( TILE + LABEL + 16 );
	g.fillStyle = '#ffffff';
	g.fillRect( x, y, TILE, TILE + LABEL );
	const s = Math.min( ( TILE - 16 ) / c.width, ( TILE - 16 ) / c.height );
	g.drawImage( c, x + ( TILE - c.width * s ) / 2, y + 8 + ( TILE - 16 - c.height * s ) / 2, c.width * s, c.height * s );
	g.fillStyle = '#26292e';
	g.font = '600 15px sans-serif';
	g.fillText( label, x + 10, y + TILE + 20 );
} );
writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
console.log( 'wrote', outPath );
