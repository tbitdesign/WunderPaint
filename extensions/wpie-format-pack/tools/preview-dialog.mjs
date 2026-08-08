/**
 * Screenshot the Reformat dialog headless: editor CSS + extension +
 * mock, one PNG. Usage: node tools/preview-dialog.mjs [out] [w] [h]
 * Env: WPIE_LOCALE=de_DE
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const EDITOR =
	fileURLToPath( import.meta.url ).replace( /\/wunderpaint\/.*$/, '/wunderpaint' );
const { chromium } = createRequire(
	path.join( EDITOR, 'node_modules', 'x.js' )
)( 'playwright' );

const out = path.resolve( process.argv[ 2 ] || 'dist/dialog.png' );
const width = parseInt( process.argv[ 3 ] || '1500', 10 );
const height = parseInt( process.argv[ 4 ] || '950', 10 );

const stage = path.join( root, 'dist', 'dialog-preview' );
fs.rmSync( stage, { recursive: true, force: true } );
fs.mkdirSync( stage, { recursive: true } );
fs.copyFileSync(
	path.join( EDITOR, 'build', 'index.css' ),
	path.join( stage, 'editor.css' )
);
fs.copyFileSync( path.join( root, 'style.css' ), path.join( stage, 'style.css' ) );
fs.copyFileSync(
	path.join( root, 'extension.js' ),
	path.join( stage, 'extension.js' )
);
fs.copyFileSync(
	path.join( here, 'preview', 'dialog-mock.js' ),
	path.join( stage, 'mock.js' )
);
fs.writeFileSync(
	path.join( stage, 'index.html' ),
	[
		'<!doctype html>',
		'<html data-theme="dark"><head><meta charset="utf-8">',
		'<link rel="stylesheet" href="editor.css">',
		'<link rel="stylesheet" href="style.css">',
		'<style>html,body{height:100%;margin:0}#wpie-root{position:fixed;inset:0}</style>',
		'</head><body>',
		'<div id="wpie-root" data-theme="dark"></div>',
		'<script src="mock.js"></script>',
		'<script src="extension.js"></script>',
		'</body></html>',
	].join( '\n' )
);

const browser = await chromium.launch();
try {
	const page = await browser.newPage( { viewport: { width, height } } );
	page.on( 'pageerror', ( e ) => console.error( 'PAGEERROR:', e.message ) );
	page.on( 'console', ( m ) => {
		if ( 'error' === m.type() ) {
			console.error( 'PAGE:', m.text() );
		}
	} );
	await page.goto(
		'file://' +
			path.join( stage, 'index.html' ) +
			'?locale=' +
			( process.env.WPIE_LOCALE || 'en_US' )
	);
	await page.waitForFunction( 'window.__dialogReady === true', {
		timeout: 20000,
	} );
	await page.waitForTimeout( 600 );
	fs.mkdirSync( path.dirname( out ), { recursive: true } );
	await page.screenshot( { path: out } );
	console.log( 'wrote', out );
} finally {
	await browser.close();
}
