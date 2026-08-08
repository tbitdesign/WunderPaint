/**
 * Screenshot the REAL studio dialog headless: stages the built
 * extension.js + style.css together with the editor's compiled CSS
 * and a minimal WPIE mock, serves the stage over a local HTTP server
 * (the extension fetches its fonts at runtime - file:// would block
 * that) and writes a PNG.
 *
 * Usage: node tools/preview-dialog.mjs [out.png] [width] [height]
 *        [bottom] [tileTitle]
 */

import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
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
if ( fs.existsSync( path.join( root, 'thumbs' ) ) ) {
	fs.cpSync( path.join( root, 'thumbs' ), path.join( stage, 'thumbs' ), {
		recursive: true,
	} );
}
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

const MIME = {
	'.html': 'text/html',
	'.css': 'text/css',
	'.js': 'text/javascript',
	'.webp': 'image/webp',
	'.woff': 'font/woff',
	'.woff2': 'font/woff2',
	'.txt': 'text/plain',
};
const server = http.createServer( ( req, res ) => {
	const file = path.join(
		stage,
		decodeURIComponent( ( req.url || '/' ).split( '?' )[ 0 ] ).replace(
			/^\/+/,
			''
		) || 'index.html'
	);
	if ( ! file.startsWith( stage ) || ! fs.existsSync( file ) ) {
		res.writeHead( 404 );
		res.end();
		return;
	}
	res.writeHead( 200, {
		'content-type': MIME[ path.extname( file ) ] || 'application/octet-stream',
	} );
	res.end( fs.readFileSync( file ) );
} );
await new Promise( ( resolve ) =>
	server.listen( 0, '127.0.0.1', resolve )
);
const port = server.address().port;

const browser = await chromium.launch( {
	args: [ '--enable-unsafe-swiftshader' ],
} );
try {
	const page = await browser.newPage( { viewport: { width, height } } );
	page.on( 'pageerror', ( e ) => console.error( 'PAGEERROR:', e.message ) );
	page.on( 'console', ( m ) => {
		if ( 'error' === m.type() ) {
			console.error( 'PAGE:', m.text() );
		}
	} );
	await page.goto(
	`http://127.0.0.1:${ port }/index.html?locale=` +
		( process.env.WPIE_LOCALE || 'en_US' ) +
		( process.env.WPIE_NODEMO ? '&nodemo=1' : '' )
);
	await page.waitForFunction( 'window.__dialogReady === true', {
		timeout: 20000,
	} );
	if ( process.env.WPIE_COLORMODE || process.env.WPIE_LAYOUT || process.env.WPIE_KM ) {
		await page.evaluate(
			( vals ) => {
				const sels = [
					...document.querySelectorAll( '.wpiert-dialog select' ),
				];
				const pick = ( value ) => {
					const sel = sels.find( ( s ) =>
						[ ...s.options ].some( ( o ) => o.value === value )
					);
					if ( sel ) {
						sel.value = value;
						sel.dispatchEvent( new Event( 'change' ) );
					}
				};
				vals.filter( Boolean ).forEach( pick );
			},
			[
				process.env.WPIE_COLORMODE || null,
				process.env.WPIE_LAYOUT || null,
				process.env.WPIE_KM || null,
			].map( ( x ) => x )
		);
		await page.waitForTimeout( 400 );
	}
	if ( process.env.WPIE_MAPBG ) {
		await page.evaluate( () => {
			const boxes = [
				...document.querySelectorAll( '.wpiert-checkbox' ),
			];
			const map = boxes[ boxes.length - 1 - 5 ];
		} );
		await page.evaluate( () => {
			// The street-map checkbox is the only unchecked wide row in
			// the Map card: click the first checkbox after the map icon.
			const cards = [
				...document.querySelectorAll( '.wpiert-card' ),
			];
			const mapCard = cards.find( ( c ) =>
				/Karte|Map/.test(
					c.querySelector( '.wpiert-card-head span' ).textContent
				)
			);
			mapCard.querySelector( 'input[type="checkbox"]' ).click();
		} );
		await page.waitForTimeout( 700 );
	}
	if ( process.argv[ 6 ] ) {
		// Click a font/material tile by its title first (e.g. "Neon").
		await page.click(
			`.wpiert-dialog .dsm-tile[title="${ process.argv[ 6 ] }"]`
		);
		await page.waitForTimeout( 500 );
	}
	if ( 'bottom' === process.argv[ 5 ] ) {
		await page.evaluate( () => {
			const side = document.querySelector( '.wpiert-side' );
			if ( side ) {
				side.scrollTop = side.scrollHeight;
			}
		} );
		await page.waitForTimeout( 150 );
	}
	fs.mkdirSync( path.dirname( out ), { recursive: true } );
	await page.screenshot( { path: out } );
	console.log( 'wrote', out );
} finally {
	await browser.close();
	server.close();
}
