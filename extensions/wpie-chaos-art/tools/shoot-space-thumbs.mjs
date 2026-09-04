/**
 * Thumbnails for the twelve styles in space: shot in a browser against
 * a local Studio build (serve one on 127.0.0.1:8791 first, see
 * studio-check.mjs), each style painted for a few seconds and grabbed
 * through the engine's own thumbnail, cropped square, written to
 * thumbs/space-<style>.jpg.
 *
 * Usage: node tools/shoot-space-thumbs.mjs [seconds]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { SCHOOLS } from '../src/flat/schools.js';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const out = path.resolve( here, '..', 'thumbs' );
fs.mkdirSync( out, { recursive: true } );
const seconds = Number( process.argv[ 2 ] || 8 );
const SPACE0 = 1 + SCHOOLS.length;
const SIZE = 176;

const browser = await chromium.launch( {
	executablePath:
		process.env.HOME +
		'/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome',
	args: [
		'--no-sandbox',
		'--disable-gpu',
		'--use-gl=swiftshader',
		'--enable-unsafe-swiftshader',
		'--ignore-gpu-blocklist',
	],
} );
const page = await (
	await browser.newContext( {
		viewport: { width: 1600, height: 1000 },
	} )
).newPage();
const errors = [];
page.on( 'pageerror', ( e ) => errors.push( 'PAGEERROR: ' + e.message ) );
await page.addInitScript( () => {
	try {
		localStorage.setItem( 'wpie-tour-done', '1' );
	} catch ( e ) {}
} );
const log = ( ...a ) =>
	console.log( new Date().toISOString().slice( 11, 19 ), ...a );

try {
	await page.goto( 'http://127.0.0.1:8791/index.html', {
		waitUntil: 'load',
		timeout: 60000,
	} );
	await page.waitForTimeout( 2000 );
	await page
		.getByRole( 'button', { name: 'Open the studio' } )
		.first()
		.click();
	await page.waitForTimeout( 2000 );
	const name = page.getByPlaceholder( /summer sale banner/i );
	if ( await name.count() ) {
		await name.first().fill( 'Thumbs' );
		await page.waitForTimeout( 200 );
		await page.locator( '.modal-backdrop .ai-btn.primary' ).first().click();
	}
	await page.waitForSelector( '.ed-canvas-area', { timeout: 60000 } );
	await page.waitForTimeout( 1200 );
	await page
		.locator( '.ed-menubar' )
		.getByText( 'Extensions', { exact: true } )
		.first()
		.click();
	await page.waitForTimeout( 400 );
	await page
		.locator( '.ed-dropdown [role=menuitem]' )
		.filter( { hasText: 'Art & Illustration' } )
		.first()
		.hover();
	await page.waitForTimeout( 500 );
	await page
		.locator( '.ed-submenu [role=menuitem]' )
		.filter( { hasText: 'Chaos Art' } )
		.first()
		.click();
	await page.waitForSelector( '.wpiechaos-body', { timeout: 60000 } );
	await page.waitForTimeout( 800 );
	const field = page.locator( '.wpiechaos-field' );
	const fb = await field.boundingBox();
	for ( let i = 0; i < 230; i++ ) {
		await page.mouse.move(
			fb.x + 40 + ( ( i * 23 ) % Math.max( 40, fb.width - 80 ) ),
			fb.y + 40 + ( ( i * 31 ) % Math.max( 40, fb.height - 80 ) )
		);
	}
	const tiles = await page.locator( '.wpiechaos-style' ).count();
	log( 'tiles', tiles, 'space from', SPACE0 );
	// ONLY=oil,hive: shoot just these (the slow ones want a longer run).
	const only = process.env.ONLY ? process.env.ONLY.split( ',' ) : null;
	for ( let idx = SPACE0; idx < tiles; idx++ ) {
		if ( only ) {
			const label = await page
				.locator( '.wpiechaos-style' )
				.nth( idx )
				.locator( '.wpiechaos-style-name' )
				.textContent();
			const key = String( label || '' )
				.toLowerCase()
				.replace( /[^a-z]/g, '' );
			if (
				! only.some( ( o ) =>
					key.includes( o.replace( /[^a-z]/g, '' ) )
				)
			) {
				continue;
			}
		}
		await page
			.locator( '.wpiechaos-style' )
			.nth( idx )
			.dispatchEvent( 'click' );
		await page.waitForTimeout( 500 );
		await page.locator( '.wpiechaos-start' ).dispatchEvent( 'click' );
		await page.waitForTimeout( seconds * 1000 );
		const shot = await page.evaluate( ( size ) => {
			const e = window.__wpiechaosEngine;
			const st = window.__wpiechaosState();
			// A WebGL canvas read outside its render task is black: the
			// ring's newest snapshot was taken inside it (the same-task rule).
			const ring = e && e.ring ? e.ring.list() : [];
			const url = ring.length
				? ring[ ring.length - 1 ].url
				: e && e.thumbUrl
				? e.thumbUrl( 640 )
				: '';
			if ( ! url ) {
				return null;
			}
			return new Promise( ( ok ) => {
				const im = new Image();
				im.onload = () => {
					const c = document.createElement( 'canvas' );
					c.width = size;
					c.height = size;
					const g = c.getContext( '2d' );
					const s = Math.min( im.width, im.height );
					g.drawImage(
						im,
						( im.width - s ) / 2,
						( im.height - s ) / 2,
						s,
						s,
						0,
						0,
						size,
						size
					);
					ok( {
						id: st.run && st.run.styleId,
						url: c.toDataURL( 'image/jpeg', 0.82 ),
						painted: st.painted,
					} );
				};
				im.onerror = () => ok( null );
				im.src = url;
			} );
		}, SIZE );
		await page.locator( '.wpiechaos-start' ).dispatchEvent( 'click' );
		await page.waitForTimeout( 300 );
		if ( shot && shot.id ) {
			fs.writeFileSync(
				path.join( out, 'space-' + shot.id + '.jpg' ),
				Buffer.from( shot.url.split( ',' )[ 1 ], 'base64' )
			);
			log( shot.id, shot.painted, 'marks' );
		} else {
			log( 'tile', idx, 'no shot' );
		}
	}
} catch ( e ) {
	errors.push( 'THREW: ' + ( e && e.message ) );
}
log( 'errors:', errors.length ? '\n' + errors.join( '\n' ) : 'none' );
await browser.close();
