/**
 * Offline visual QA: renders poster variants (synthetic GPX + fake map
 * data, no network) in headless Chromium and writes one PNG strip.
 *
 * Usage: node tools/preview-poster.mjs out.png '<views JSON>' [tileW]
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const EDITOR_MODULES =
	fileURLToPath( import.meta.url ).replace( /\/wunderpaint\/.*$/, '/wunderpaint' ) + '/node_modules';
const { chromium } = createRequire( path.join( EDITOR_MODULES, 'x.js' ) )(
	'playwright'
);

const out = path.resolve( process.argv[ 2 ] || 'dist/posters.png' );
const views = JSON.parse(
	process.argv[ 3 ] || '[{"theme":"minimal"},{"theme":"midnight","mapBg":true}]'
);
const size = parseInt( process.argv[ 4 ] || '480', 10 );

const esbuild = ( await import(
	path.join( root, 'node_modules', 'esbuild', 'lib', 'main.js' )
) ).default;
const stage = path.join( root, 'dist', 'preview' );
fs.mkdirSync( stage, { recursive: true } );
await esbuild.build( {
	entryPoints: [ path.join( here, 'preview', 'entry.js' ) ],
	bundle: true,
	format: 'iife',
	outfile: path.join( stage, 'harness.js' ),
	logLevel: 'silent',
} );
fs.writeFileSync(
	path.join( stage, 'harness.html' ),
	'<!doctype html>\n<meta charset="utf-8">\n<body><script src="harness.js"></script></body>\n'
);

const browser = await chromium.launch();
try {
	const page = await browser.newPage( {
		viewport: { width: 800, height: 600 },
	} );
	page.on( 'pageerror', ( e ) => console.error( 'PAGEERROR:', e.message ) );
	await page.goto( 'file://' + path.join( stage, 'harness.html' ) );
	await page.waitForFunction( 'window.__ready === true', {
		timeout: 15000,
	} );
	const dataUrl = await page.evaluate(
		( [ v, s ] ) => window.renderPosters( v, s ),
		[ views, size ]
	);
	fs.mkdirSync( path.dirname( out ), { recursive: true } );
	fs.writeFileSync(
		out,
		Buffer.from( dataUrl.split( ',' )[ 1 ], 'base64' )
	);
	console.log( 'wrote', out );
} finally {
	await browser.close();
}
