/**
 * Dev tool: render a geo-proxy fixture through the engine in every theme.
 *
 * node tools/contact-sheet.mjs <fixture.json> <out.png> [pins]
 * Fixture shape: { bbox: [south, west, north, east], data: { els } }.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { THEMES, renderMap } from '../src/map-engine.js';

const require = createRequire(
	new URL( '../../../package.json', import.meta.url )
);
const { createCanvas } = require( 'canvas' );

const [ , , fixturePath, outPath, withPins ] = process.argv;
const fixture = JSON.parse( readFileSync( fixturePath, 'utf8' ) );
const [ south, west, north, east ] = fixture.bbox;
const bbox = { south, west, north, east };

const TILE = 460;
const COLS = 5;
const EXTRA = [
	{ label: 'GOLD FOIL roads + glow (black)', theme: THEMES.find( ( t ) => 'midnight' === t.id ), o: { roadGradientId: 'goldfoil', glow: 0.45, overrides: { bg: '#050608' } } },
	{ label: 'Neon theme + glow 80', theme: THEMES.find( ( t ) => 'neon' === t.id ), o: { glow: 0.8 } },
	{ label: 'Aurora across the poster', theme: THEMES.find( ( t ) => 'midnight' === t.id ), o: { roadGradientId: 'aurora', roadMap: 'x', glow: 0.3 } },
	{ label: 'Copper by class (minimal bg)', theme: THEMES.find( ( t ) => 'midnight' === t.id ), o: { roadGradientId: 'copper', glow: 0.2 } },
	{ label: 'Spectrum by class + glow', theme: THEMES.find( ( t ) => 'neon' === t.id ), o: { roadGradientId: 'spectrum', glow: 0.6 } },
	{ label: 'HEART mask, gold foil outline', theme: THEMES.find( ( t ) => 'midnight' === t.id ), o: { mask: 'heart', roadGradientId: 'goldfoil', glow: 0.25, overrides: { bg: '#050608' } } },
];
const rows = Math.ceil( ( THEMES.length + EXTRA.length ) / COLS );
const sheet = createCanvas( COLS * TILE, rows * ( TILE + 26 ) );
const sctx = sheet.getContext( '2d' );
sctx.fillStyle = '#202328';
sctx.fillRect( 0, 0, sheet.width, sheet.height );

const midLat = ( south + north ) / 2;
const midLon = ( west + east ) / 2;
const pins = withPins
	? [
			{
				lat: midLat + ( north - south ) * 0.12,
				lon: midLon - ( east - west ) * 0.15,
				label: 'Start',
			},
			{
				lat: midLat - ( north - south ) * 0.18,
				lon: midLon + ( east - west ) * 0.2,
				label: 'Ziel',
			},
	  ]
	: [];

const tiles = [
	...THEMES.map( ( theme ) => ( { label: theme.label, theme, o: {} } ) ),
	...EXTRA,
];
tiles.forEach( ( { label, theme, o }, i ) => {
	const tile = createCanvas( TILE, TILE );
	const ctx = tile.getContext( '2d' );
	renderMap( ctx, TILE, TILE, {
		data: fixture.data,
		bbox,
		theme,
		pins,
		route: pins.length ? 'arc' : 'none',
		showDistance: !! pins.length,
		mask: 'circle' === theme.id ? 'circle' : 'none',
		...o,
	} );
	const x = ( i % COLS ) * TILE;
	const y = Math.floor( i / COLS ) * ( TILE + 26 );
	sctx.drawImage( tile, x, y );
	sctx.fillStyle = '#e8eaee';
	sctx.font = '13px sans-serif';
	sctx.fillText( label, x + 8, y + TILE + 17 );
} );

writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
process.stdout.write( `wrote ${ outPath }\n` );
