/**
 * Dev tool (v2.1): one contact sheet of the poster kinds, the lettering
 * and the cartographic details.
 *
 * node tools/kinds-sheet.mjs <city.json> <out.png> [closeup.json] [region.json]
 *
 * Fixtures: { bbox: [south, west, north, east], data: { els } } - a city
 * view (the bundled oldenburg.json reshaped works), optionally a close-up
 * with buildings for the figure-ground plan and a wider region for the
 * water network. Missing ones fall back to the city.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { THEMES, buildScene, drawScene } from '../src/map-engine.js';

const require = createRequire(
	new URL( '../../../package.json', import.meta.url )
);
const { createCanvas } = require( 'canvas' );

const [ , , cityPath, outPath, closePath, regionPath ] = process.argv;
const load = ( p ) => {
	const f = JSON.parse( readFileSync( p, 'utf8' ) );
	const [ south, west, north, east ] = f.bbox;
	return { bbox: { south, west, north, east }, scene: buildScene( f.data ) };
};
const city = load( cityPath );
const close = closePath ? load( closePath ) : city;
const region = regionPath ? load( regionPath ) : city;
const theme = ( id ) => THEMES.find( ( t ) => t.id === id );
// Square views in the middle of each fixture.
const square = ( f, frac = 1 ) => {
	const b = f.bbox;
	const cLat = ( b.south + b.north ) / 2;
	const cLon = ( b.west + b.east ) / 2;
	const half = ( ( b.north - b.south ) / 2 ) * frac;
	const lonHalf = half / Math.cos( ( cLat * Math.PI ) / 180 );
	return { south: cLat - half, north: cLat + half, west: cLon - lonHalf, east: cLon + lonHalf };
};
const center = ( b ) => ( { lat: ( b.south + b.north ) / 2, lon: ( b.west + b.east ) / 2 } );

const TILES = [
	{ label: 'classic (reference)', f: city, o: { theme: theme( 'minimal' ) } },
	{ label: 'figure-ground', f: close, o: { kind: 'figure', theme: theme( 'minimal' ) } },
	{ label: 'figure-ground, midnight', f: close, o: { kind: 'figure', theme: theme( 'midnight' ) } },
	{ label: 'water network, region', f: region, frac: 1, o: { kind: 'water', theme: theme( 'midnight' ), glow: 0.4 } },
	{ label: 'water network, city', f: city, o: { kind: 'water', theme: theme( 'minimal' ) } },
	{ label: 'street compass + rose', f: city, o: { kind: 'compass', theme: theme( 'midnight' ), rose: true } },
	{ label: 'street compass, close', f: close, o: { kind: 'compass', theme: theme( 'minimal' ), rose: true } },
	{ label: 'compass, aurora + glow', f: region, o: { kind: 'compass', theme: theme( 'midnight' ), roadGradientId: 'aurora', glow: 0.5 } },
	{ label: 'antique', f: city, o: { kind: 'antique', theme: theme( 'vintage' ), scale: true } },
	{ label: 'antique, close', f: close, o: { kind: 'antique', theme: theme( 'vintage' ) } },
	{ label: 'directions sketch', f: close, pins: 1, o: { kind: 'directions', theme: theme( 'minimal' ), north: true, scale: true } },
	{ label: 'directions, midnight', f: city, pins: 1, o: { kind: 'directions', theme: theme( 'midnight' ), north: true, scale: true } },
	{ label: 'lettering', f: city, aspect: 2.6, o: { theme: theme( 'minimal' ), letters: { text: 'OLDENBURG', font: 'Impact', weight: 700 } } },
	{ label: 'details: north, scale, ticks, numbered', f: city, pins: 3, o: { theme: theme( 'terracotta' ), north: true, scale: true, ticks: true, numbered: true } },
	{ label: 'heart + compass + rose', f: city, o: { kind: 'compass', theme: theme( 'midnight' ), mask: 'heart', rose: true } },
];

const TILE = 440;
const COLS = 5;
const rows = Math.ceil( TILES.length / COLS );
const sheet = createCanvas( COLS * TILE, rows * ( TILE + 26 ) );
const s = sheet.getContext( '2d' );
s.fillStyle = '#202328';
s.fillRect( 0, 0, sheet.width, sheet.height );
const makeCanvas = ( w, h ) => createCanvas( Math.max( 1, Math.round( w ) ), Math.max( 1, Math.round( h ) ) );

TILES.forEach( ( tile, i ) => {
	const w = TILE;
	const h = tile.aspect ? Math.round( TILE / tile.aspect ) : TILE;
	let bbox = square( tile.f, tile.frac || 0.7 );
	if ( tile.aspect ) {
		const c = center( bbox );
		const half = ( bbox.north - bbox.south ) / 2 / tile.aspect;
		bbox = { ...bbox, south: c.lat - half, north: c.lat + half };
	}
	const c = center( bbox );
	const dLat = ( bbox.north - bbox.south ) * 0.18;
	const pins = [
		{ lat: c.lat + dLat * 0.2, lon: c.lon - dLat * 0.3, label: 'Café' },
		{ lat: c.lat - dLat, lon: c.lon + dLat * 0.8, label: 'Station' },
		{ lat: c.lat + dLat * 1.2, lon: c.lon + dLat * 1.1, label: 'Park' },
	].slice( 0, tile.pins || 0 );
	const cv = createCanvas( w, h );
	drawScene( cv.getContext( '2d' ), w, h, tile.f.scene, {
		bbox,
		pins,
		makeCanvas,
		...tile.o,
	} );
	const x = ( i % COLS ) * TILE;
	const y = Math.floor( i / COLS ) * ( TILE + 26 );
	s.drawImage( cv, x, y + ( TILE - h ) / 2 );
	s.fillStyle = '#c9ced6';
	s.font = '13px sans-serif';
	s.fillText( tile.label, x + 8, y + TILE + 17 );
} );

writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
console.log( 'wrote', outPath );
