/**
 * One picture per figure, finished, plus the posed steps of the 3D
 * models - the fastest way to see whether the catalogue looks like a
 * catalogue.
 *
 *   node tools/gallery.mjs [figureId]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist/look' ) } );
const { page } = qa;
page.on( 'pageerror', ( e ) => console.log( `ERROR ${ e }` ) );

const only = process.argv[ 2 ];
await page.waitForTimeout( 2500 );

const tiles = await page.locator( '.wpieog-figure' ).count();
for ( let i = 0; i < tiles; i++ ) {
	const label = await page
		.locator( '.wpieog-figure' )
		.nth( i )
		.locator( 'span' )
		.textContent();
	const state = await page.evaluate( () => window.__wpieogState() );
	void state;
	await page.locator( '.wpieog-figure' ).nth( i ).click();
	await page.waitForTimeout( 3800 );
	const id = await page.evaluate( () => window.__wpieogState().figure );
	if ( only && id !== only ) {
		continue;
	}
	await qa.shot( `fig-${ id }.png` );
	console.log( `shot ${ id } (${ label })` );
	if ( only ) {
		// Walk the steps of the requested figure.
		const steps = await page.locator( '.wpieog-step' ).count();
		for ( let s = 0; s < steps; s++ ) {
			await page.locator( '.wpieog-step' ).nth( s ).click();
			await page.waitForTimeout( 1700 );
			await qa.shot( `fig-${ id }-step-${ s }.png` );
		}
	}
}
process.exit( 0 );
