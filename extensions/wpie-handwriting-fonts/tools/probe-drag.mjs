/**
 * Drag a slider the way a hand drags it, and watch the preview.
 *
 * The earlier probe dispatched a synthetic input event, which is not the
 * same thing at all: a real drag fires a burst of events, and anything
 * debounced behind them behaves differently.
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
const project = sampleProject( 'QA Hand' );
fs.writeFileSync(
	path.join( stage, 'qa-hand.ttf' ),
	drain( buildWeightSteps( project, WEIGHTS[ 1 ], { project: await encodeProject( project ) } ) )
);

const qa = await launchQA( { stage } );
const { page } = qa;
page.on( 'console', ( m ) => process.stderr.write( 'CONSOLE ' + m.type() + ': ' + m.text() + '\n' ) );
await page.setInputFiles( 'input.wpiehw-file[accept*="ttf"]', path.join( stage, 'qa-hand.ttf' ) );
await page.waitForTimeout( 1500 );

// Count how often the preview canvas is actually painted.
await page.evaluate( () => {
	window.__paints = 0;
	const c = document.querySelector( '.wpiehw-preview' );
	const g = c.getContext( '2d' );
	const orig = g.fill.bind( g );
	g.fill = ( ...a ) => {
		window.__paints++;
		return orig( ...a );
	};
} );

const snap = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiehw-preview' );
		const d = c.getContext( '2d' ).getImageData( 0, 0, c.width, c.height ).data;
		let ink = 0;
		let sum = 0;
		for ( let i = 3; i < d.length; i += 4 ) {
			if ( d[ i ] > 8 ) {
				ink++;
				sum += i;
			}
		}
		return { ink, sum, paints: window.__paints };
	} );

async function dragSlider( index, label ) {
	const el = page.locator( '.dsm-range' ).nth( index );
	const box = await el.boundingBox();
	const before = await snap();
	await page.mouse.move( box.x + box.width * 0.3, box.y + box.height / 2 );
	await page.mouse.down();
	// A real drag: many small moves, then a pause, then release.
	for ( let i = 1; i <= 14; i++ ) {
		await page.mouse.move( box.x + box.width * ( 0.3 + 0.045 * i ), box.y + box.height / 2 );
		await page.waitForTimeout( 25 );
	}
	const during = await snap();
	await page.mouse.up();
	await page.waitForTimeout( 500 );
	const after = await snap();
	const moved = ( a, b ) => a.ink !== b.ink || a.sum !== b.sum;
	process.stdout.write(
		`${ label.padEnd( 14 ) } paints ${ before.paints } -> ${ during.paints } -> ${ after.paints }   ` +
			`during drag: ${ moved( before, during ) ? 'updates' : 'STILL' }   ` +
			`after release: ${ moved( before, after ) ? 'updates' : 'STILL' }\n`
	);
}

const labels = [];
const n = await page.locator( '.dsm-range' ).count();
for ( let i = 0; i < n; i++ ) {
	labels.push(
		( await page.locator( '.dsm-sliderrow' ).nth( i ).locator( 'span' ).first().textContent() ).trim()
	);
}
for ( let i = 0; i < n; i++ ) {
	await dragSlider( i, labels[ i ] );
}

// And the control case: typing in the sample field.
const before = await snap();
await page.locator( '.wpiehw-sample' ).click();
await page.keyboard.type( 'a' );
await page.waitForTimeout( 400 );
const after = await snap();
process.stdout.write(
	`typing a letter  paints ${ before.paints } -> ${ after.paints }   ` +
		`${ before.ink !== after.ink || before.sum !== after.sum ? 'updates' : 'STILL' }\n`
);
await qa.finish();
