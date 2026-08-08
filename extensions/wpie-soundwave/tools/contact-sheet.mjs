/**
 * Dev tool: render a synthetic track through the v2.0 looks - color
 * modes, glow, reflection, stereo and every new style.
 *   node tools/contact-sheet.mjs <out.png>
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
	THEMES,
	computePeaks,
	computeBrights,
	drawWave,
} from '../src/wave-engine.js';

const require = createRequire(
	new URL( '../../../package.json', import.meta.url )
);
const { createCanvas } = require( 'canvas' );

const [ , , outPath ] = process.argv;

// Deterministic "song": beats + verses via layered sines. The second
// channel drifts against the first so the stereo split shows.
const length = 480000;
const dataL = new Float32Array( length );
const dataR = new Float32Array( length );
for ( let i = 0; i < length; i++ ) {
	const tt = i / 48000;
	const beat = Math.pow( Math.max( 0, Math.sin( tt * Math.PI * 2 ) ), 12 );
	const verse = 0.4 + 0.35 * Math.sin( tt * 0.55 ) + 0.2 * Math.sin( tt * 1.7 + 1 );
	const verseR = 0.4 + 0.35 * Math.sin( tt * 0.42 + 2 ) + 0.2 * Math.sin( tt * 2.1 );
	// The tone brightens over the track - feeds the spectral mode.
	const f = 220 + 1600 * ( i / length );
	dataL[ i ] = ( 0.55 * beat + 0.5 * Math.max( 0.1, verse ) * Math.sin( tt * f ) ) * 0.9;
	dataR[ i ] = ( 0.35 * beat + 0.55 * Math.max( 0.1, verseR ) * Math.sin( tt * f * 0.7 ) ) * 0.9;
}
const buffer = {
	length,
	numberOfChannels: 2,
	getChannelData: ( c ) => ( c ? dataR : dataL ),
};
const peaks = computePeaks( buffer, 140 );
const peaksR = computePeaks( buffer, 140, 0, 1, 1 );
const brights = computeBrights( buffer, 140 );
const peaksFull = computePeaks( buffer, 3200 );

const themeOf = ( id ) => THEMES.find( ( th ) => th.id === id );

const TILE_W = 460;
const TILE_H = 210;
const COLS = 3;
const tiles = [
	{ label: 'bars · gold foil · glow', theme: themeOf( 'black' ), o: { style: 'bars', colorMode: 'gradient', gradientId: 'goldfoil', glow: 0.5 } },
	{ label: 'bars · aurora · amp map', theme: themeOf( 'midnight' ), o: { style: 'bars', colorMode: 'gradient', gradientId: 'aurora', gradientMap: 'amp', glow: 0.4 } },
	{ label: 'bars · spectral (sound color)', theme: themeOf( 'black' ), o: { style: 'bars', colorMode: 'spectral', gradientId: 'spectrum', brights, glow: 0.3 } },
	{ label: 'bars · stereo L/R', theme: themeOf( 'midnight' ), o: { style: 'bars', colorMode: 'gradient', gradientId: 'candy', peaksB: peaksR } },
	{ label: 'line · reflect · glow', theme: themeOf( 'black' ), o: { style: 'line', colorMode: 'gradient', gradientId: 'ocean', glow: 0.6, reflect: true } },
	{ label: 'fill · sunset · reflect', theme: themeOf( 'midnight' ), o: { style: 'fill', colorMode: 'gradient', gradientId: 'sunset', reflect: true } },
	{ label: 'ridgeline · solid', theme: themeOf( 'black' ), h: 340, o: { style: 'ridgeline', peaksFull } },
	{ label: 'ridgeline · spectral rows', theme: themeOf( 'midnight' ), h: 340, o: { style: 'ridgeline', colorMode: 'spectral', gradientId: 'aurora', peaksFull, glow: 0.35 } },
	{ label: 'spiral · spectrum', theme: themeOf( 'black' ), h: TILE_W, o: { style: 'spiral', colorMode: 'gradient', gradientId: 'spectrum', peaks: computePeaks( buffer, 360 ), glow: 0.3 } },
	{ label: 'sunburst · sunset · glow', theme: themeOf( 'midnight' ), h: TILE_W, o: { style: 'sunburst', colorMode: 'gradient', gradientId: 'sunset', peaks: computePeaks( buffer, 220 ), glow: 0.45 } },
	{ label: 'heartbeat · candy · glow', theme: themeOf( 'black' ), h: TILE_W, o: { style: 'heart', colorMode: 'gradient', gradientId: 'candy', peaks: computePeaks( buffer, 220 ), glow: 0.5 } },
	{ label: 'hexagon · chrome', theme: themeOf( 'midnight' ), h: TILE_W, o: { style: 'hexagon', colorMode: 'gradient', gradientId: 'chrome', peaks: computePeaks( buffer, 200 ), glow: 0.3 } },
];

const rows = Math.ceil( tiles.length / COLS );
let sheetH = 0;
const positions = [];
for ( let r = 0; r < rows; r++ ) {
	const rowTiles = tiles.slice( r * COLS, r * COLS + COLS );
	const rowH = Math.max( ...rowTiles.map( ( tile ) => tile.h || TILE_H ) ) + 26;
	rowTiles.forEach( ( tile, c ) => positions.push( { x: c * TILE_W, y: sheetH } ) );
	sheetH += rowH;
}
const sheet = createCanvas( COLS * TILE_W, sheetH );
const sctx = sheet.getContext( '2d' );
sctx.fillStyle = '#202328';
sctx.fillRect( 0, 0, sheet.width, sheet.height );

tiles.forEach( ( { label, theme, h, o }, i ) => {
	const th = h || TILE_H;
	const tile = createCanvas( TILE_W, th );
	drawWave( tile.getContext( '2d' ), TILE_W, th, {
		peaks,
		theme,
		createCanvas,
		...o,
	} );
	const { x, y } = positions[ i ];
	sctx.drawImage( tile, x, y );
	sctx.fillStyle = '#e8eaee';
	sctx.font = '13px sans-serif';
	sctx.fillText( label, x + 8, y + th + 17 );
} );

writeFileSync( outPath, sheet.toBuffer( 'image/png' ) );
process.stdout.write( `wrote ${ outPath }\n` );
