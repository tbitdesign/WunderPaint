/**
 * Headless QA for the Pattern Generator dialog: editor CSS + bundle +
 * mock, drives presets, custom palette, playground drag, context menu,
 * library save and layer insert. Writes PNGs into dist/.
 * Usage: node tools/qa-dialog.mjs   Env: WPIE_LOCALE=de_DE
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

const stage = path.join( root, 'dist', 'qa-stage' );
fs.rmSync( stage, { recursive: true, force: true } );
fs.mkdirSync( stage, { recursive: true } );
fs.copyFileSync(
	path.join( EDITOR, 'build', 'index.css' ),
	path.join( stage, 'editor.css' )
);
fs.copyFileSync( path.join( root, 'style.css' ), path.join( stage, 'style.css' ) );
fs.copyFileSync( path.join( root, 'extension.js' ), path.join( stage, 'extension.js' ) );
fs.copyFileSync( path.join( here, 'preview', 'dialog-mock.js' ), path.join( stage, 'mock.js' ) );
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

const shot = ( page, name ) =>
	page.screenshot( { path: path.join( root, 'dist', name ) } );

const browser = await chromium.launch();
try {
	const page = await browser.newPage( {
		viewport: { width: 1500, height: 1000 },
	} );
	page.on( 'pageerror', ( e ) => console.error( 'PAGEERROR:', e.message ) );
	page.on( 'console', ( m ) => {
		if ( 'error' === m.type() ) {
			console.error( 'CONSOLE:', m.text() );
		}
	} );
	await page.goto(
		'file://' +
			path.join( stage, 'index.html' ) +
			'?locale=' +
			( process.env.WPIE_LOCALE || 'de_DE' )
	);
	await page.waitForFunction( 'window.__dialogReady === true', {
		timeout: 20000,
	} );

	// 1: deterministic scatter state, frame on.
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'scatter',
			set: 'botanik',
			seed: 4711,
			palette: 'salbei',
			bg: 'light',
			repeat: 'halfdrop',
			count: 12,
			size: 62,
			jitter: 60,
			rot: 45,
		} );
	} );
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-1-dialog.png' );

	// 2: playground drag - grab an element and pull it across the edge.
	const canvas = page.locator( '.wpiepg-view canvas' );
	const box = await canvas.boundingBox();
	const el0 = await page.evaluate( () => {
		const e = window.__pgParams;
		return null; // marker only
	} );
	await page.mouse.move( box.x + 130, box.y + 130 );
	await page.mouse.down();
	await page.mouse.move( box.x + 40, box.y + 90, { steps: 8 } );
	await page.mouse.up();
	const moved = await page.evaluate(
		() => window.__pgParams.moved.length
	);
	console.log( 'moved entries after drag:', moved );
	await shot( page, 'qa-2-drag.png' );

	// 3: context menu open (own div, not native).
	await page.mouse.click( box.x + 260, box.y + 220, { button: 'right' } );
	await page.waitForTimeout( 150 );
	await shot( page, 'qa-3-menu.png' );
	await page.mouse.click( box.x + 600, box.y + 500 );

	// 4: structured motif + custom brand palette + custom bg + zoom.
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'streifen',
			dir: 2,
			count: 8,
			weight: 55,
			variety: 52,
			palette: 'custom',
			customBase: '#e63946',
			bg: 'custom',
			bgCustom: '#fdf6ee',
			repeat: 'straight',
			shift: { x: 0, y: 0 },
		} );
	} );
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-4-custom.png' );

	// 5: mirror rapport with hearts + tile frame via checkbox.
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'scatter',
			set: 'herzen',
			seed: 99,
			palette: 'rose',
			bg: 'light',
			repeat: 'mirror',
			count: 10,
			size: 58,
			rot: 55,
		} );
	} );
	await page.locator( '.wpiepg-check input' ).first().check();
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-5-mirror-frame.png' );

	// 5b: V2 - new motifs sampler (truchet with riso offset print).
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'truchet',
			count: 6,
			weight: 55,
			variety: 30,
			palette: 'mono',
			bg: 'light',
			repeat: 'straight',
			riso: 45,
			dash: '',
			seed: 77,
		} );
	} );
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-6-truchet-riso.png' );

	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'hex',
			count: 6,
			weight: 50,
			size: 80,
			variety: 35,
			palette: 'zitrus',
			bg: 'dark',
			repeat: 'straight',
			riso: 0,
			seed: 5,
		} );
	} );
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-7-hex.png' );

	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'ogee',
			count: 8,
			amp: 70,
			freqI: 1,
			weight: 45,
			palette: 'terracotta',
			bg: 'light',
			repeat: 'straight',
			dash: 'dash',
			seed: 3,
		} );
	} );
	await page.waitForTimeout( 250 );
	await shot( page, 'qa-8-ogee-dash.png' );

	// 5c: V2 - own layer as stamp: select the stamp set, capture runs
	// via the mocked renderToCanvas.
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'scatter',
			set: 'geo',
			seed: 21,
			palette: 'nordlicht',
			bg: 'light',
			repeat: 'halfdrop',
			count: 10,
			size: 60,
			rot: 25,
			riso: 0,
			dash: '',
		} );
	} );
	await page
		.locator( '.wpiepg-row select' )
		.nth( 1 )
		.selectOption( 'stamp' );
	await page.waitForTimeout( 600 );
	const stampState = await page.evaluate( () => ( {
		hasStamp: ( window.__pgParams.stampData || '' ).startsWith(
			'data:image/png'
		),
		set: window.__pgParams.set,
	} ) );
	console.log( 'stamp state:', JSON.stringify( stampState ) );
	await shot( page, 'qa-9-stamp.png' );

	// Favorite: save + tile appears.
	await page
		.locator( 'button', { hasText: /Als Favorit|Save as favorite/ } )
		.click();
	await page.waitForTimeout( 200 );
	const favCount = await page.evaluate(
		() => document.querySelectorAll( '.wpiepg-favs .wpiepg-preset' ).length
	);
	console.log( 'favorites:', favCount );

	// 5d: brand kit palette from window.WPIE.brandKits.
	await page.evaluate( () => {
		window.__pgApply( {
			motif: 'schuppen',
			count: 7,
			size: 70,
			weight: 45,
			bg: 'light',
			repeat: 'straight',
			riso: 0,
			dash: '',
			seed: 12,
		} );
		const sel = [
			...document.querySelectorAll( '.wpiepg-row select' ),
		].find( ( s ) =>
			[ ...s.options ].some( ( o ) => 'kit:0' === o.value )
		);
		sel.value = 'kit:0';
		sel.dispatchEvent( new Event( 'change' ) );
	} );
	await page.waitForTimeout( 300 );
	const kitState = await page.evaluate( () => ( {
		palette: window.__pgParams.palette,
		kit: window.__pgParams.kitName,
		n: ( window.__pgParams.kitColors || [] ).length,
	} ) );
	console.log( 'kit state:', JSON.stringify( kitState ) );
	await shot( page, 'qa-10-kit.png' );

	// 6: library save (mock URL - the failure note proves the path).
	await page
		.locator( 'button', { hasText: /Als Füllmuster|Save as fill/ } )
		.click();
	await page.waitForTimeout( 800 );
	const note = await page
		.locator( '.wpiepg-note' )
		.first()
		.textContent();
	console.log( 'library note:', note.trim() );

	// 7: insert - dispatch must carry a pattern shape layer + generator.
	await page
		.locator( 'button', { hasText: /Muster einfügen|Insert pattern/ } )
		.click();
	await page.waitForTimeout( 200 );
	const action = await page.evaluate( () => {
		const a = window.__dispatched[ 0 ];
		return a
			? {
					type: a.type,
					shape: a.layer?.shape,
					pattern: a.layer?.pattern,
					fillType: a.layer?.fillType,
					hasTile: ( a.layer?.patternData || '' ).startsWith(
						'data:image/png'
					),
					gen: a.layer?.generator?.id,
					w: a.layer?.w,
					h: a.layer?.h,
			  }
			: null;
	} );
	console.log( 'insert action:', JSON.stringify( action ) );
	console.log( 'OK' );
} finally {
	await browser.close();
}
