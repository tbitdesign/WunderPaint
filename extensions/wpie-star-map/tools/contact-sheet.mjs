/**
 * Dev tool: render the Hamburg winter sky in every theme.
 *   node tools/contact-sheet.mjs <out.png>
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { drawSky, THEMES } from '../src/sky-engine.js';
import { jdForLocal } from '../src/astro.js';
import stars from '../src/stars.json' with { type: 'json' };
import lines from '../src/lines.json' with { type: 'json' };

const require = createRequire( new URL( '../../../package.json', import.meta.url ) );
const { createCanvas } = require( 'canvas' );

const [ , , outPath ] = process.argv;
const TILE = 440;
const COLS = 4;
const rows = Math.ceil( ( THEMES.length + 7 ) / COLS );
const sheet = createCanvas( COLS * TILE, rows * ( TILE + 26 ) );
const sctx = sheet.getContext( '2d' );
sctx.fillStyle = '#202328';
sctx.fillRect( 0, 0, sheet.width, sheet.height );

const jd = jdForLocal( '2024-01-15', '22:00', 9.9937 );
const base = { stars, lines, lat: 53.5511, lon: 9.9937, jd };

const tiles = [
	...THEMES.map( ( t ) => ( { label: t.label, opts: { ...base, theme: t, show: { lines: true } } } ) ),
	{ label: 'Heart + grid + cardinals', opts: { ...base, theme: THEMES[ 0 ], mask: 'heart', show: { lines: true, grid: true, cardinals: true }, cardinalLabels: [ 'N', 'O', 'S', 'W' ] } },
	{ label: 'Colored stars, no lines', opts: { ...base, theme: THEMES[ 1 ], colorStars: true, starScale: 1.3, show: { lines: false } } },
	// v2.0 looks
	{ label: 'GOLD FOIL lines + glints + milky way', opts: { ...base, theme: THEMES[ 1 ], lineGradientId: 'goldfoil', glints: true, milkyway: true, colorStars: true, starScale: 1.15, show: { lines: true } } },
	{ label: 'Aurora lines + glow 70', opts: { ...base, theme: THEMES[ 0 ], lineGradientId: 'aurora', glow: 0.7, glints: true, show: { lines: true } } },
	{ label: 'Copper foil, heart', opts: { ...base, theme: THEMES[ 1 ], mask: 'heart', lineGradientId: 'copper', glow: 0.3, glints: true, show: { lines: true } } },
	{ label: 'Milky way + colored stars + glow', opts: { ...base, theme: THEMES[ 0 ], milkyway: true, colorStars: true, glow: 0.5, glints: true, starScale: 1.25, show: { lines: false } } },
	{ label: 'HIGHLIGHT Orion, gold foil', opts: { ...base, theme: THEMES[ 1 ], lineGradientId: 'goldfoil', highlight: 'Ori', glints: true, show: { lines: true } } },
];

tiles.forEach( ( { label, opts }, i ) => {
	const tile = createCanvas( TILE, TILE );
	drawSky( tile.getContext( '2d' ), TILE, TILE, opts );
	const x = ( i % COLS ) * TILE;
	const y = Math.floor( i / COLS ) * ( TILE + 26 );
	sctx.drawImage( tile, x, y );
	sctx.fillStyle = '#e8eaee';
	sctx.font = '13px sans-serif';
	sctx.fillText( label, x + 8, y + TILE + 17 );
} );

writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
process.stdout.write( `wrote ${ outPath }\n` );
