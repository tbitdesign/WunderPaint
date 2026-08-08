/**
 * Dialog QA in a real browser.
 *
 * The unit tests prove the arithmetic; this proves the parts of the
 * extension that only exist once there is a DOM: that the dialog opens
 * without errors, that a pointer dragged across the canvas leaves a
 * stroke behind, that a project can be opened out of a font file, and
 * that pressing the button really does produce and upload a family.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
import { sampleProject } from './sample-project.mjs';
import { buildWeightSteps, drain } from '../src/core/build.js';
import { WEIGHTS } from '../src/core/metrics.js';
import { encodeProject } from '../src/core/project.js';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );

const stage = await buildStage( { root } );

// A font with a whole alphabet inside it, for the import path to find.
const project = sampleProject( 'QA Hand' );
const payload = await encodeProject( project );
const font = drain( buildWeightSteps( project, WEIGHTS[ 1 ], { project: payload } ) );
const fontPath = path.join( stage, 'qa-hand.ttf' );
fs.writeFileSync( fontPath, font );
process.stdout.write( `sample font ${ ( font.length / 1024 ).toFixed( 1 ) } KB\n` );

const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;

/* ------------------------------ the dialog ------------------------------- */

check( await page.locator( '.dsm-title' ).count() > 0, 'dialog opened' );
check(
	( await page.locator( '.dsm-badge svg' ).count() ) > 0,
	'brand badge is in the head'
);
check( ( await page.locator( '.wpiehw-tile' ).count() ) > 100, 'every character has a tile' );
check( ( await page.locator( '.dsm-card' ).count() ) >= 5, 'panel sections rendered' );
check(
	( await page.locator( '.wpiehw-canvas' ).count() ) === 1,
	'the drawing surface is there'
);

/* ------------------------------- drawing --------------------------------- */

const box = await page.locator( '.wpiehw-canvas' ).boundingBox();
// A surface taller than the window is a layout regression, and it also
// puts the part we are about to click on out of reach.
check(
	box.height > 140 && box.y + box.height <= 1000,
	`the surface fits the window (${ Math.round( box.height ) }px, bottom at ${ Math.round( box.y + box.height ) })`
);
await page.mouse.move( box.x + box.width * 0.35, box.y + box.height * 0.8 );
await page.mouse.down();
for ( let i = 1; i <= 12; i++ ) {
	await page.mouse.move(
		box.x + box.width * ( 0.35 + 0.014 * i ),
		box.y + box.height * ( 0.8 - 0.045 * i )
	);
}
await page.mouse.up();
await page.waitForTimeout( 250 );

check(
	await page.locator( '.wpiehw-tile.is-done' ).first().isVisible(),
	'the stroke turned a tile into a drawn one'
);
const counted = await page.locator( '.wpiehw-count' ).textContent();
check( /\b1\b/.test( counted ), `counter moved (${ counted.trim() })` );

await page.click( 'text=' + ( await page.locator( '.wpiehw-tools .ai-btn' ).nth( 1 ).textContent() ) );
await page.waitForTimeout( 200 );
check(
	0 === ( await page.locator( '.wpiehw-tile.is-done' ).count() ),
	'undo took the stroke back off'
);

/* -------------------------------- tabs ----------------------------------- */

await page.locator( '.wpiehw-tab' ).nth( 1 ).click();
await page.waitForTimeout( 200 );
check(
	await page.locator( '.wpiehw-pane' ).nth( 1 ).isVisible(),
	'the sheet tab shows its pane'
);
check(
	( await page.locator( '.wpiehw-pane' ).nth( 1 ).locator( '.dsm-card' ).count() ) >= 2,
	'the sheet pane has its two steps'
);
await page.locator( '.wpiehw-tab' ).nth( 0 ).click();
await page.waitForTimeout( 400 );

// Going to the other tab and back must leave the drawing area exactly
// where it was. It used to gain the width of a scrollbar each time,
// which reads as the canvas quietly growing.
const after = await page.locator( '.wpiehw-canvas' ).boundingBox();
check(
	Math.abs( after.width - box.width ) < 0.5,
	`the drawing area keeps its width across tabs (${ box.width.toFixed( 1 ) } -> ${ after.width.toFixed( 1 ) })`
);

/* ------------------------------- the import ------------------------------ */

await page.setInputFiles( 'input.wpiehw-file[accept*="ttf"]', fontPath );
await page.waitForTimeout( 1200 );

const status = ( await page.locator( '.wpiehw-status' ).textContent() ) || '';
check( /QA Hand/.test( status ), `the project came out of the font (${ status.trim() })` );
const done = await page.locator( '.wpiehw-tile.is-done' ).count();
check( done > 70, `the whole alphabet arrived (${ done } tiles)` );
check(
	! ( await page.locator( '.dsm-actions .ai-btn.primary' ).isDisabled() ),
	'the build button unlocked'
);

/* ------------------------------ the bench -------------------------------- */

await page.locator( '.wpiehw-tab' ).nth( 2 ).click();
await page.waitForTimeout( 400 );
check( await page.locator( '.wpiehw-bench' ).isVisible(), 'the spacing bench opens' );

const readout = () => page.locator( '.wpiehw-benchvalue' ).textContent();
const bench = await page.locator( '.wpiehw-bench' ).boundingBox();
// Grab the gap between the first two letters and pull them apart.
const gapAt = await page.evaluate( () => {
	const c = document.querySelector( '.wpiehw-bench' );
	const r = c.getBoundingClientRect();
	return { left: r.left, top: r.top, height: r.height };
} );
let dragged = false;
for ( let x = 20; x < bench.width - 20 && ! dragged; x += 4 ) {
	await page.mouse.move( gapAt.left + x, gapAt.top + gapAt.height * 0.5 );
	const cursor = await page.evaluate(
		() => document.querySelector( '.wpiehw-bench' ).style.cursor
	);
	if ( 'ew-resize' === cursor ) {
		await page.mouse.down();
		for ( let k = 1; k <= 8; k++ ) {
			await page.mouse.move( gapAt.left + x + k * 5, gapAt.top + gapAt.height * 0.5 );
		}
		await page.mouse.up();
		dragged = true;
	}
}
check( dragged, 'a draggable spot was found on the bench' );
await page.waitForTimeout( 300 );
const kerns = await page.evaluate( () => {
	const el = document.querySelector( '.wpiehw-benchcount' );
	return el ? el.textContent : '';
} );
check( /[1-9]/.test( kerns ), `a correction was recorded (${ kerns.trim() || 'none' })` );
check( ( await readout() ).length > 3, `and the readout says what it is (${ ( await readout() ).trim() })` );

await qa.shot( 'qa-bench.png' );
await page.locator( '.wpiehw-tab' ).nth( 0 ).click();
await page.waitForTimeout( 200 );

await qa.shot( 'qa-dialog.png' );

/* -------------------------------- the build ------------------------------ */

await page.locator( '.dsm-actions .ai-btn.primary' ).click();
await page.waitForFunction( 'window.__uploads && window.__uploads.length > 0', {
	timeout: 90000,
} );
const uploads = await page.evaluate( () => window.__uploads );
check( uploads.includes( 'QA Hand' ), `the family was uploaded (${ uploads.join( ', ' ) })` );

const registered = await page.evaluate( () =>
	( window.WPIE.customFonts || [] ).map( ( f ) => f.family )
);
check(
	registered.includes( 'QA Hand' ),
	`and announced to the editor (${ registered.join( ', ' ) })`
);

// The strictest check in the suite: the browser's own font sanitiser has
// to accept the bytes and actually shape text with them.
const face = await page.evaluate( async () => {
	const url = new URL( 'qa-hand.ttf', window.location.href ).href;
	const probe = new FontFace( 'QA Probe', `url(${ url }) format('truetype')` );
	let error = '';
	try {
		await probe.load();
		document.fonts.add( probe );
	} catch ( e ) {
		error = String( ( e && e.message ) || e );
	}
	await document.fonts.ready;
	const families = Array.from( document.fonts ).map( ( f ) => f.family.replace( /^"|"$/g, '' ) );
	const measure = ( family ) => {
		const c = document.createElement( 'canvas' ).getContext( '2d' );
		c.font = `48px "${ family }", monospace`;
		return c.measureText( 'Hamburgefonstiv' ).width;
	};
	return {
		error,
		families,
		installedWidth: measure( 'QA Hand' ),
		probeWidth: measure( 'QA Probe' ),
		fallbackWidth: measure( 'no-such-family-xyz' ),
	};
} );
check( ! face.error, `the sanitiser accepted the file${ face.error ? ': ' + face.error : '' }` );
check(
	face.families.includes( 'QA Hand' ),
	`the installed family is registered (${ face.families.join( ', ' ) })`
);
check(
	Math.abs( face.probeWidth - face.fallbackWidth ) > 1,
	`text is shaped with our outlines (${ face.probeWidth.toFixed( 1 ) } vs fallback ${ face.fallbackWidth.toFixed( 1 ) })`
);

/* --------------------- what you can do with it next ---------------------- */

const useBtns = await page.locator( '.dsm-actions .ai-btn' ).allTextContents();
check(
	useBtns.some( ( b ) => /Textebene|text layer/i.test( b ) ),
	`the follow-on actions appeared (${ useBtns.join( ' | ' ) })`
);
await page.locator( '.dsm-actions .ai-btn', { hasText: /Textebene|text layer/i } ).first().click();
await page.waitForTimeout( 300 );
const added = await page.evaluate( () =>
	( window.__dispatched || [] ).filter( ( a ) => 'ADD_LAYER' === a.type ).map( ( a ) => a.layer )
);
check( 1 === added.length, `a text layer was added (${ added.length })` );
check(
	added[ 0 ] && 'QA Hand' === added[ 0 ].fontFamily,
	`and it uses the new family (${ added[ 0 ] && added[ 0 ].fontFamily })`
);

await page.locator( '.dsm-actions .ai-btn', { hasText: /Musterblatt|specimen/i } ).first().click();
await page.waitForTimeout( 300 );
const all = await page.evaluate( () =>
	( window.__dispatched || [] ).filter( ( a ) => 'ADD_LAYER' === a.type ).length
);
check( all >= 8, `the specimen added a set of layers (${ all } in total)` );

const finalStatus = ( await page.locator( '.wpiehw-status' ).textContent() ) || '';
check( /QA Hand/.test( finalStatus ), `install reported (${ finalStatus.trim() })` );

await qa.shot( 'qa-installed.png' );
process.exit( await qa.finish() );
