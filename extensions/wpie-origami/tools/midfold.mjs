/**
 * The folding itself, caught in the act: every figure, every step, at
 * quarter/half/three-quarter progress. The finished states all look
 * right by construction - it is the way there that can look wrong, and
 * only these frames show it.
 *
 *   node tools/midfold.mjs [figureId] [stepIndex]
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist/midfold' ) } );
const { page } = qa;
page.on( 'pageerror', ( e ) => console.log( `ERROR ${ e }` ) );

const only = process.argv[ 2 ];
const onlyStep = process.argv[ 3 ];
await page.waitForTimeout( 2500 );

const tiles = await page.locator( '.wpieog-figure' ).count();
for ( let i = 0; i < tiles; i++ ) {
	await page.locator( '.wpieog-figure' ).nth( i ).click();
	await page.waitForTimeout( 600 );
	const id = await page.evaluate( () => window.__wpieogState().figure );
	if ( only && id !== only ) {
		continue;
	}
	const steps = await page.evaluate(
		() => window.__wpieogEngine.figure.steps.length
	);
	for ( let s = 0; s < steps; s++ ) {
		if ( undefined !== onlyStep && Number( onlyStep ) !== s ) {
			continue;
		}
		for ( const frac of [ 0.25, 0.5, 0.75 ] ) {
			await page.evaluate(
				( p ) => {
					const e = window.__wpieogEngine;
					e.stop();
					e.setProgress( p );
					e.render();
				},
				s + frac
			);
			await page.waitForTimeout( 120 );
			await qa.shot(
				`${ id }-s${ String( s ).padStart( 2, '0' ) }-${ frac * 100 }.png`
			);
		}
	}
	console.log( `${ id }: ${ steps } steps done` );
}
process.exit( 0 );
