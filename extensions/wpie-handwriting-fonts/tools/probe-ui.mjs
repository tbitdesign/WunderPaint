/** Does the group caption follow the selection, and does the preview follow the sliders? */
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
const payload = await encodeProject( project );
fs.writeFileSync(
	path.join( stage, 'qa-hand.ttf' ),
	drain( buildWeightSteps( project, WEIGHTS[ 1 ], { project: payload } ) )
);

const qa = await launchQA( { stage } );
const { page } = qa;
await page.setInputFiles( 'input.wpiehw-file[accept*="ttf"]', path.join( stage, 'qa-hand.ttf' ) );
await page.waitForTimeout( 1500 );

/* --- the caption above the drawing field ------------------------------- */
const caption = async () => ( await page.locator( '.wpiehw-charhint' ).textContent() ) || '';
const name = async () => ( await page.locator( '.wpiehw-charname' ).textContent() ) || '';

await page.locator( '.wpiehw-tile' ).nth( 0 ).click();
await page.waitForTimeout( 150 );
process.stdout.write( `tile 0  name "${ await name() }"  caption "${ await caption() }"\n` );

await page.locator( '.wpiehw-tile' ).nth( 27 ).click();
await page.waitForTimeout( 150 );
process.stdout.write( `tile 27 name "${ await name() }"  caption "${ await caption() }"\n` );

await page.locator( '.wpiehw-tile' ).nth( 55 ).click();
await page.waitForTimeout( 150 );
process.stdout.write( `tile 55 name "${ await name() }"  caption "${ await caption() }"\n` );

/* --- the Next button and the Enter key ---------------------------------- */
await page.locator( '.wpiehw-tile' ).nth( 25 ).click();
await page.waitForTimeout( 120 );
process.stdout.write( `before Next: "${ await name() }" / "${ await caption() }"\n` );
const nextBtn = page.locator( '.wpiehw-tools .ai-btn' ).last();
for ( let i = 0; i < 3; i++ ) {
	await nextBtn.click();
	await page.waitForTimeout( 120 );
	process.stdout.write( `after Next ${ i + 1 }: "${ await name() }" / "${ await caption() }"\n` );
}
await page.keyboard.press( 'Enter' );
await page.waitForTimeout( 120 );
process.stdout.write( `after Enter: "${ await name() }" / "${ await caption() }"\n` );

/* --- does the preview react to the spacing sliders? --------------------- */
const snap = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpiehw-preview' );
		const g = c.getContext( '2d' );
		const d = g.getImageData( 0, 0, c.width, c.height ).data;
		let sum = 0;
		let ink = 0;
		for ( let i = 3; i < d.length; i += 4 ) {
			if ( d[ i ] > 8 ) {
				ink++;
				sum += i;
			}
		}
		return { ink, sum };
	} );

const before = await snap();
const sliders = await page.locator( '.dsm-range' ).count();
process.stdout.write( `sliders: ${ sliders }\n` );
for ( let i = 0; i < sliders; i++ ) {
	const label = await page
		.locator( '.dsm-sliderrow' )
		.nth( i )
		.locator( 'span' )
		.first()
		.textContent();
	process.stdout.write( `  slider ${ i }: ${ label }\n` );
}

process.stdout.write( 'does each control move the preview?\n' );
for ( let i = 0; i < sliders; i++ ) {
	const label = ( await page.locator( '.dsm-sliderrow' ).nth( i ).locator( 'span' ).first().textContent() ).trim();
	const was = await snap();
	const el = page.locator( '.dsm-range' ).nth( i );
	const { min, max, value } = await el.evaluate( ( n ) => ( { min: +n.min, max: +n.max, value: +n.value } ) );
	const target = value < ( min + max ) / 2 ? max : min;
	await el.evaluate( ( n, v ) => {
		n.value = String( v );
		n.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}, target );
	await page.waitForTimeout( 700 );
	const now = await snap();
	const moved = was.ink !== now.ink || was.sum !== now.sum;
	process.stdout.write( `  ${ label.padEnd( 14 ) } ${ value } -> ${ target }  ${ moved ? 'preview moved' : 'PREVIEW UNCHANGED' }\n` );
	await el.evaluate( ( n, v ) => {
		n.value = String( v );
		n.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}, value );
	await page.waitForTimeout( 300 );
}
for ( const label of [ 'Buchstaben verbinden', 'Automatisch unterschneiden' ] ) {
	const box = page.locator( `.dsm-checkrow:has-text("${ label }") input` ).first();
	if ( ! ( await box.count() ) ) {
		continue;
	}
	const was = await snap();
	await box.click();
	await page.waitForTimeout( 700 );
	const now = await snap();
	process.stdout.write(
		`  ${ label.padEnd( 26 ) } ${ was.ink !== now.ink || was.sum !== now.sum ? 'preview moved' : 'PREVIEW UNCHANGED' }\n`
	);
	await box.click();
	await page.waitForTimeout( 300 );
}

await qa.shot( 'probe-ui.png' );
await qa.finish();
