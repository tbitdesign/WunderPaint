/**
 * Try camera yaws for one figure - the fastest way to pick a view that
 * shows a standing model standing.
 *
 *   node tools/viewtest.mjs <figureId> <yaw1> <yaw2> ...
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist/viewtest' ) } );
const { page } = qa;
page.on( 'pageerror', ( e ) => console.log( `ERROR ${ e }` ) );

const id = process.argv[ 2 ];
const yaws = process.argv.slice( 3 ).map( Number );
await page.waitForTimeout( 2500 );

const tiles = await page.locator( '.wpieog-figure' ).count();
for ( let i = 0; i < tiles; i++ ) {
	await page.locator( '.wpieog-figure' ).nth( i ).click();
	await page.waitForTimeout( 500 );
	if ( ( await page.evaluate( () => window.__wpieogState().figure ) ) !== id ) {
		continue;
	}
	await page.waitForTimeout( 2500 );
	for ( const yaw of yaws ) {
		await page.evaluate( ( y ) => {
			const e = window.__wpieogEngine;
			e.setView( { yaw: y } );
			e.render();
		}, yaw );
		await page.waitForTimeout( 120 );
		await qa.shot( `${ id }-yaw${ yaw }.png` );
		console.log( `${ id } yaw ${ yaw }` );
	}
	break;
}
process.exit( 0 );
