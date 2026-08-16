/**
 * Embed QA for Chaos Art, three parts:
 *
 * 1. The family scroll check: a reader must scroll straight past the
 *    embed, and still be able to zoom it after taking hold.
 * 2. Life and uniqueness: two embeds on one page both paint, and they
 *    paint DIFFERENT pictures - the unique-per-visitor promise.
 * 3. Reduced motion: the piece arrives as a finished still, the render
 *    loop is asleep, nothing animates.
 *
 * Usage: node tools/qa-embed.mjs
 */
import path from 'node:path';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { EDITOR } from '../../shared/qa-kit/embed-scroll.mjs';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const outDir = path.join( root, 'dist', 'qa-embed' );
fs.mkdirSync( outDir, { recursive: true } );

const PARAMS = JSON.stringify( {
	styleId: 'neon',
	chaos: 60,
	energy: 70,
	density: 60,
	tempo: 140,
	aspect: [ 16, 10 ],
} );

const snippet =
	`<div data-wpie-chaos='${ PARAMS }' style="width:100%;aspect-ratio:16/10"></div>\n` +
	`<script src="file://${ root }/runtime.js" defer></scr` +
	`ipt>`;

let fails = 0;
const check = ( cond, msg ) => {
	process.stdout.write( ( cond ? 'ok   ' : 'FAIL ' ) + msg + '\n' );
	if ( ! cond ) {
		fails++;
	}
};

const req = createRequire( path.join( EDITOR, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );

/* 1 ------------------------------ scroll manners ------------------------- */
// The shared embedScrollCheck expects the viewer at page load; this
// runtime boots lazily near the viewport (the family manner), so the
// same three assertions run here with a scroll-in first.

const tall = path.join( outDir, 'tall.html' );
fs.writeFileSync(
	tall,
	`<!doctype html><html><head><meta charset="utf-8"><title>tall</title>
<style>body{margin:0;font:16px/1.6 system-ui}.pad{height:1200px;background:#eee}
.host{width:660px;margin:0 auto}</style></head><body>
<div class="pad">before</div>
<div class="host">${ snippet }</div>
<div class="pad">after</div>
</body></html>`
);

const browser0 = await chromium.launch( {
	args: [ '--enable-unsafe-swiftshader', '--no-sandbox' ],
} );
{
	const page = await browser0.newPage( {
		viewport: { width: 1100, height: 800 },
	} );
	await page.goto( 'file://' + tall );
	await page.locator( '.host [data-wpie-chaos]' ).scrollIntoViewIfNeeded();
	await page.waitForTimeout( 2500 );
	const view = page.locator( '.host canvas' );
	check( ( await view.count() ) > 0, 'the viewer boots once scrolled near' );
	const ta = await view.evaluate( ( c ) => getComputedStyle( c ).touchAction );
	check(
		'none' !== ta,
		`leaves vertical swiping to the page (touch-action: ${ ta })`
	);
	const b = await view.boundingBox();
	await page.mouse.move( b.x + b.width / 2, b.y + b.height / 2 );
	await page.waitForTimeout( 120 );
	const before = await page.evaluate( () => window.scrollY );
	await page.mouse.wheel( 0, 300 );
	await page.waitForTimeout( 350 );
	const after = await page.evaluate( () => window.scrollY );
	check(
		after > before + 50,
		`the page scrolls straight past it (${ before } -> ${ after })`
	);
	// Taking hold makes the wheel a deliberate zoom and stops the page.
	await view.scrollIntoViewIfNeeded();
	await page.waitForTimeout( 250 );
	const b2 = await view.boundingBox();
	await page.mouse.move( b2.x + b2.width / 2, b2.y + b2.height / 2 );
	await page.mouse.down();
	await page.mouse.up();
	const r0 = await page.evaluate(
		() =>
			document.querySelector( '[data-wpie-chaos]' ).__wpieChaosEngine
				.world.camera.radius
	);
	const held = await page.evaluate( () => window.scrollY );
	await page.mouse.wheel( 0, 300 );
	await page.waitForTimeout( 350 );
	const heldAfter = await page.evaluate( () => window.scrollY );
	const r1 = await page.evaluate(
		() =>
			document.querySelector( '[data-wpie-chaos]' ).__wpieChaosEngine
				.world.camera.radius
	);
	check(
		Math.abs( heldAfter - held ) < 5 && Math.abs( r1 - r0 ) > 0.5,
		`after taking hold the wheel zooms instead (page ${ held } -> ${ heldAfter }, radius ${ r0.toFixed(
			1
		) } -> ${ r1.toFixed( 1 ) })`
	);
	await page.close();
}
await browser0.close();

/* 2+3 --------------------------- life, uniqueness, stillness ------------- */

const twin = path.join( outDir, 'twin.html' );
fs.writeFileSync(
	twin,
	`<!doctype html><html><head><meta charset="utf-8"><title>twin</title>
<style>body{margin:0}.host{width:640px;margin:12px auto}</style></head><body>
<div class="host">${ snippet }</div>
<div class="host">${ snippet.replace( ' defer', '' ) }</div>
</body></html>`
);

const browser = await chromium.launch( {
	args: [ '--enable-unsafe-swiftshader', '--no-sandbox' ],
} );
{
	const page = await browser.newPage( {
		viewport: { width: 900, height: 1400 },
	} );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await page.goto( 'file://' + twin );
	await page.waitForTimeout( 5000 );
	const life = await page.evaluate( () => {
		const els = Array.from(
			document.querySelectorAll( '[data-wpie-chaos]' )
		);
		return els.map( ( el ) => {
			const en = el.__wpieChaosEngine;
			if ( ! en ) {
				return null;
			}
			const painter = en.actors.find( ( a ) => a.pos );
			return {
				painted: en.painted(),
				running: en.running,
				pos: painter ? painter.pos.map( ( v ) => v.toFixed( 2 ) ) : null,
			};
		} );
	} );
	check( 2 === life.length && life.every( Boolean ), 'both embeds booted' );
	if ( life.every( Boolean ) ) {
		check(
			life.every( ( l ) => l.painted > 30 && l.running ),
			`both embeds paint (${ life.map( ( l ) => l.painted ).join( ', ' ) } marks)`
		);
		check(
			JSON.stringify( life[ 0 ].pos ) !== JSON.stringify( life[ 1 ].pos ),
			'the two originals differ - unique per load'
		);
	}
	check( 0 === errors.length, `no page errors (${ errors.join( ' | ' ) })` );
	await page.close();
}
{
	const page = await browser.newPage( {
		viewport: { width: 900, height: 1400 },
		reducedMotion: 'reduce',
	} );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await page.goto( 'file://' + twin );
	await page.waitForTimeout( 4000 );
	const still = await page.evaluate( () => {
		const el = document.querySelector( '[data-wpie-chaos]' );
		const en = el && el.__wpieChaosEngine;
		return en
			? { painted: en.painted(), running: en.running, asleep: en._asleep }
			: null;
	} );
	check( !! still, 'reduced motion: embed booted' );
	if ( still ) {
		check(
			still.painted > 30,
			`reduced motion: a finished still exists (${ still.painted } marks)`
		);
		check(
			! still.running && still.asleep,
			'reduced motion: nothing animates, the loop sleeps'
		);
	}
	check(
		0 === errors.length,
		`no page errors under reduced motion (${ errors.join( ' | ' ) })`
	);
	await page.close();
}
{
	// The gallery cycle: with a fast cycle the embed must complete its
	// piece and begin a NEW original (the painted counter starts over).
	const cyc = path.join( outDir, 'cycle.html' );
	fs.writeFileSync(
		cyc,
		`<!doctype html><html><head><meta charset="utf-8"><title>cycle</title>
<style>body{margin:0}.host{width:640px;margin:12px auto}</style></head><body>
<div class="host">${ snippet.replace(
			"data-wpie-chaos='",
			`data-wpie-chaos='`
		).replace( '{"styleId"', '{"cycle":6,"styleId"' ) }</div>
</body></html>`
	);
	const page = await browser.newPage( {
		viewport: { width: 900, height: 900 },
	} );
	const errors = [];
	page.on( 'pageerror', ( e ) => errors.push( e.message ) );
	await page.goto( 'file://' + cyc );
	await page.waitForTimeout( 5000 );
	const first = await page.evaluate( () => {
		const en = document.querySelector( '[data-wpie-chaos]' )
			.__wpieChaosEngine;
		return {
			painted: en.painted(),
			center: en.world.domain.center.join( ',' ),
		};
	} );
	check( first.painted > 0, `cycle: first piece paints (${ first.painted })` );
	await page.waitForTimeout( 14000 );
	const second = await page.evaluate( () => {
		const en = document.querySelector( '[data-wpie-chaos]' )
			.__wpieChaosEngine;
		return {
			painted: en.painted(),
			center: en.world.domain.center.join( ',' ),
		};
	} );
	check(
		second.center !== first.center || second.painted < first.painted,
		'cycle: a new original began'
	);
	check( 0 === errors.length, `cycle: no page errors (${ errors.join( ' | ' ) })` );
	await page.close();
}
await browser.close();

process.stdout.write( fails ? `\n${ fails } FAILURES\n` : '\nall green\n' );
process.exit( fails ? 1 : 0 );
