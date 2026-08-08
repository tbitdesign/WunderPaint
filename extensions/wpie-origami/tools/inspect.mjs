/**
 * Looking at the studio properly: every figure, key fold states, the
 * designer overlays, and a page build - as numbered screenshots.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist/look' ) } );
const { page } = qa;

const state = () => page.evaluate( () => window.__wpieogState() );
const shot = ( name ) => qa.shot( `${ name }.png` );
const settle = ( ms ) => page.waitForTimeout( ms );

page.on( 'pageerror', ( e ) => console.log( `ERROR ${ e }` ) );

// The dialog opens by itself; the fox animates to its finished state.
await settle( 3500 );
await shot( '01-fox-finished' );
console.log( 'fox state:', JSON.stringify( await state() ) );

// Walk the fox by steps.
for ( const step of [ 0, 1, 2 ] ) {
	await page.locator( '.wpieog-step' ).nth( step ).click();
	await settle( 1600 );
	await shot( `02-fox-step-${ step }` );
}

// Mid-fold, held by the slider.
await page.locator( '.wpieog-progress' ).fill( '500' );
await settle( 400 );
await shot( '03-fox-midfold' );
console.log( 'mid state:', JSON.stringify( await state() ) );

// Region overlay on the sheet.
await page.getByText( 'Zeigen, wo was landet' ).click();
await page.locator( '.wpieog-progress' ).fill( '0' );
await settle( 500 );
await shot( '04-fox-regions-flat' );

// The heart, full play.
await page.locator( '.wpieog-figure' ).nth( 1 ).click();
await settle( 4500 );
await shot( '05-heart-finished' );
console.log( 'heart state:', JSON.stringify( await state() ) );

await page.locator( '.wpieog-step' ).nth( 3 ).click();
await settle( 1600 );
await shot( '06-heart-step-3' );

// Views and scene.
await page.locator( '.wpieog-views .ai-btn' ).nth( 2 ).click();
await settle( 400 );
await shot( '07-heart-threequarter' );
await page.locator( '.dsm-rowline', { hasText: 'Untergrund' } ).locator( 'select' ).selectOption( 'plane' );
await settle( 500 );
await shot( '08-heart-table' );

// Colour the paper via the mock swatch (front colour is the first).
await page.locator( '.wpieog-sidebox' ).first().locator( 'button' ).first().click();
await settle( 600 );
await shot( '09-heart-recolored' );
console.log( 'front after pick:', JSON.stringify( ( await state() ).front ) );

// Build the pages.
await page.getByText( 'Faltbogen + Anleitung einfügen' ).click();
await settle( 2500 );
const dispatched = await page.evaluate( () =>
	window.__dispatched.map( ( d ) => d.type )
);
console.log( 'dispatched:', JSON.stringify( dispatched ) );
const pages = await page.evaluate( () => {
	const set = window.__dispatched.find( ( d ) => 'SET_PAGES' === d.type );
	return set ? set.pages.length : 0;
} );
console.log( 'pages after insert:', pages );

process.exit( 0 );
