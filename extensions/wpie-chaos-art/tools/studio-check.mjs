/**
 * Chaos Art against the REAL core: the local Studio build serves the
 * editor with bridge.paint, the dialog opens by deeplink, the field is
 * charged, a school paints for a while, and the dialog is photographed.
 * Page errors and console errors are collected - a picture shows what
 * rendered, not what died.
 *
 * Usage: node tools/studio-check.mjs (serve a Studio build on 127.0.0.1:8791 first, see docs in the head) <out-dir> [school-tile-index ...]
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const out = process.argv[ 2 ];
const tiles = process.argv.slice( 3 ).map( Number );
fs.mkdirSync( out, { recursive: true } );
const errors = [];

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
const ctx = await browser.newContext( {
	viewport: { width: 1600, height: 1000 },
	deviceScaleFactor: 1,
} );
const page = await ctx.newPage();
page.on( 'pageerror', ( e ) => errors.push( 'PAGEERROR: ' + e.message ) );
page.on( 'console', ( m ) => {
	if ( 'error' === m.type() ) {
		errors.push( 'CONSOLE: ' + m.text() );
	}
} );
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
		await name.first().fill( 'Chaos check' );
		await page.waitForTimeout( 200 );
		await page.locator( '.modal-backdrop .ai-btn.primary' ).first().click();
	}
	await page.waitForSelector( '.ed-canvas-area', { timeout: 60000 } );
	await page.waitForTimeout( 1200 );
	// Extensions > Art & Illustration > Chaos Art (a lazy placeholder).
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
	log(
		'dialog up; tiles:',
		await page.locator( '.wpiechaos-style' ).count()
	);
	const kit = await page.evaluate( () => {
		const b = window.WPIE && window.WPIE.bridge;
		return {
			paint: !! ( b && b.paint ),
			wet: !! (
				b &&
				b.paint &&
				b.paint.wet &&
				b.paint.wet.available &&
				b.paint.wet.available()
			),
			api: b && b.apiVersion,
		};
	} );
	log( 'bridge.paint', JSON.stringify( kit ) );

	// Charge the field.
	const field = page.locator( '.wpiechaos-field' );
	const fb = await field.boundingBox();
	for ( let i = 0; i < 230; i++ ) {
		await page.mouse.move(
			fb.x + 40 + ( ( i * 23 ) % Math.max( 40, fb.width - 80 ) ),
			fb.y + 40 + ( ( i * 31 ) % Math.max( 40, fb.height - 80 ) )
		);
	}
	log(
		'charged',
		await page.evaluate( () => window.__wpiechaosState().charge )
	);

	const shot = async ( tag ) => {
		// The sheet alone, straight from the engine (no stability needed).
		const still = await page.evaluate( () => {
			const e = window.__wpiechaosEngine;
			return e && e.thumbUrl ? e.thumbUrl( 1400 ) : '';
		} );
		if ( still ) {
			fs.writeFileSync(
				path.join( out, tag + '-sheet.jpg' ),
				Buffer.from( still.split( ',' )[ 1 ], 'base64' )
			);
		}
		try {
			// Under SwiftShader the element shot waits for a "stable" box
			// that a busy renderer never confirms: clip the page instead.
			const dlg = page.locator( '.wpiechaos-dialog' ).first();
			const box = await dlg.boundingBox();
			await page.screenshot( {
				path: path.join( out, tag + '.jpg' ),
				type: 'jpeg',
				quality: 86,
				timeout: 60000,
				animations: 'disabled',
				clip: box || undefined,
			} );
		} catch ( e ) {
			log( 'dialog shot skipped:', e.message.split( '\n' )[ 0 ] );
		}
	};

	// MOTIF=<image path>: a picture of one's own becomes the motif; the
	// file chooser the dialog opens is answered by Playwright.
	if ( process.env.MOTIF ) {
		await page
			.locator( '.wpiechaos-left .dsm-select' )
			.nth( 1 )
			.evaluate( ( el ) => {
				el.value = 'file';
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			} );
		await page.waitForTimeout( 300 );
		const [ chooser ] = await Promise.all( [
			page.waitForEvent( 'filechooser', { timeout: 10000 } ),
			page.locator( '.wpiechaos-filerow .ai-btn' ).first().click(),
		] );
		await chooser.setFiles( process.env.MOTIF );
		await page.waitForTimeout( 1500 );
		if ( process.env.READING ) {
			await page
				.locator( '.wpiechaos-motif .dsm-select' )
				.last()
				.evaluate( ( el, v ) => {
					el.value = v;
					el.dispatchEvent(
						new Event( 'change', { bubbles: true } )
					);
				}, process.env.READING );
		}
		log(
			'motif set',
			await page.locator( '.wpiechaos-filename' ).textContent()
		);
	}

	// TEXT=<words>: a text becomes the motif (reading from READING).
	if ( process.env.TEXT ) {
		await page
			.locator( '.wpiechaos-left .dsm-select' )
			.nth( 1 )
			.evaluate( ( el ) => {
				el.value = 'text';
				el.dispatchEvent( new Event( 'change', { bubbles: true } ) );
			} );
		await page.waitForTimeout( 300 );
		await page.locator( '.wpiechaos-text' ).fill( process.env.TEXT );
		if ( process.env.READING ) {
			await page
				.locator( '.wpiechaos-motif .dsm-select' )
				.last()
				.evaluate( ( el, v ) => {
					el.value = v;
					el.dispatchEvent(
						new Event( 'change', { bubbles: true } )
					);
				}, process.env.READING );
		}
		log( 'text motif set', process.env.TEXT );
	}

	for ( const idx of tiles.length ? tiles : [ 1 ] ) {
		await page
			.locator( '.wpiechaos-style' )
			.nth( idx )
			.dispatchEvent( 'click' );
		await page.waitForTimeout( 400 );

		const label = await page
			.locator( '.wpiechaos-style' )
			.nth( idx )
			.locator( '.wpiechaos-style-name' )
			.textContent();
		// Since 1.8 a tile picked mid-piece switches the school of the
		// running piece; a fresh piece per tile is Start over.
		const begun = await page.evaluate(
			() => window.__wpiechaosState().started
		);
		await page
			.locator( begun ? '.wpiechaos-over' : '.wpiechaos-start' )
			.dispatchEvent( 'click' );
		const t0 = Date.now();
		let last = null;
		while (
			Date.now() - t0 <
			( Number( process.env.RUN_S ) || 45 ) * 1000
		) {
			await page.waitForTimeout( 5000 );
			const s = await page.evaluate( () => window.__wpiechaosState() );
			const w = await page.evaluate( () => {
				const e = window.__wpiechaosEngine;
				return e && e.world
					? {
							phase: e.world.phase,
							t: e.world.time.toFixed( 0 ),
							cov: ( e.world.coverage || 0 ).toFixed( 2 ),
					  }
					: null;
			} );
			last = { painted: s.painted, family: s.family, ...w };
			log( label, JSON.stringify( last ) );
		}
		// Pause first: the loop idles, the bio renders, the shot is stable.
		await page.locator( '.wpiechaos-start' ).dispatchEvent( 'click' );
		await page.waitForTimeout( 1200 );
		await shot(
			String( idx ).padStart( 2, '0' ) +
				'-' +
				label.toLowerCase().replace( /[^a-z]+/g, '-' )
		);
		const bio = await page.evaluate( () => {
			const t = document.querySelector( '.wpiechaos-title' );
			const b = document.querySelector( '.wpiechaos-bio' );
			return (
				( t ? t.textContent : '-' ) +
				' | ' +
				( b ? b.textContent : '-' )
			);
		} );
		log( 'bio:', bio );
	}
} catch ( e ) {
	errors.push( 'THREW: ' + ( e && e.message ) );
}
log( 'errors:', errors.length ? '\n' + errors.join( '\n' ) : 'none' );
await browser.close();
