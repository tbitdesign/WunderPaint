/**
 * Proof sheet: every starter of every card rendered by the real dialog
 * engine in ONE headless browser (the QA stage opens the dialog by
 * itself), one PNG each plus dist/proof/sheet.png to look at.
 *
 *   npm run proof            all starters
 *   PROOF_ONLY=a,b npm run proof
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildStage, launchQA, EDITOR } from '../../shared/qa-kit/stage.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const out = path.join( root, 'dist', 'proof' );
fs.mkdirSync( out, { recursive: true } );
const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { createCanvas, loadImage } = req( 'canvas' );

const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: out, viewport: { width: 1700, height: 2400 }, locale: 'en_US' } );
const { page } = qa;
await page.waitForFunction( () => window.__wpiesmProof && window.__wpiesmState && window.__wpiesmState().frames > 0, null, { timeout: 30000 } );
const only = process.env.PROOF_ONLY ? process.env.PROOF_ONLY.split( ',' ) : null;
const starters = await page.evaluate( () => window.__wpiesmProof.starters );
const tiles = [];
for ( const s of starters ) {
	if ( only && ! only.includes( s.id ) ) {
		continue;
	}
	const t0 = Date.now();
	let res;
	try {
		res = await page.evaluate( async ( id ) => {
			const r = await window.__wpiesmProof.render( id );
			// Show it as an image outside the dialog for the shot.
			let img = document.getElementById( 'proofshot' );
			if ( ! img ) {
				img = document.createElement( 'img' );
				img.id = 'proofshot';
				img.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;background:#888';
				document.body.appendChild( img );
			}
			img.width = r.width;
			img.height = r.height;
			await new Promise( ( ok, bad ) => {
				img.onload = ok;
				img.onerror = () => bad( new Error( 'svg did not load as an image' ) );
				img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent( r.svg );
			} );
			return { width: r.width, height: r.height, warnings: r.warnings, texts: ( r.svg.match( /<text/g ) || [] ).length, classes: ( r.svg.match( /class=/g ) || [] ).length, svg: r.svg };
		}, s.id );
	} catch ( e ) {
		console.log( 'FAIL', s.id, e.message );
		continue;
	}
	fs.writeFileSync( path.join( out, s.id + '.svg' ), res.svg );
	const file = path.join( out, s.id + '.png' );
	await page.locator( '#proofshot' ).screenshot( { path: file } );
	console.log( s.id.padEnd( 20 ), s.card.padEnd( 10 ), res.width + 'x' + res.height, ( Date.now() - t0 ) + ' ms', 'texts ' + res.texts, res.classes ? 'CLASSES ' + res.classes : '', res.warnings.length ? 'WARN ' + res.warnings.join( ' | ' ) : '' );
	tiles.push( { id: s.id, file, w: res.width, h: res.height } );
}
await qa.browser.close();

const COLS = 2;
const TW = 800;
const rows = [];
for ( let i = 0; i < tiles.length; i += COLS ) {
	rows.push( tiles.slice( i, i + COLS ) );
}
const rowH = rows.map( ( r ) => Math.max( ...r.map( ( t ) => Math.round( ( t.h * TW ) / t.w ) ) ) + 30 );
const sheet = createCanvas( COLS * TW + ( COLS + 1 ) * 20, rowH.reduce( ( a, b ) => a + b, 0 ) + 20 );
const g = sheet.getContext( '2d' );
g.fillStyle = '#666';
g.fillRect( 0, 0, sheet.width, sheet.height );
let y = 20;
for ( let ri = 0; ri < rows.length; ri++ ) {
	for ( let ci = 0; ci < rows[ ri ].length; ci++ ) {
		const t = rows[ ri ][ ci ];
		const img = await loadImage( t.file );
		const h = Math.round( ( t.h * TW ) / t.w );
		const x = 20 + ci * ( TW + 20 );
		g.drawImage( img, x, y, TW, h );
		g.fillStyle = '#fff';
		g.font = '16px sans-serif';
		g.fillText( t.id, x, y + h + 20 );
	}
	y += rowH[ ri ];
}
fs.writeFileSync( path.join( out, 'sheet.png' ), sheet.toBuffer( 'image/png' ) );
console.log( 'sheet ' + path.join( out, 'sheet.png' ) + ' (' + tiles.length + ' tiles, ' + sheet.width + 'x' + sheet.height + ')' );
