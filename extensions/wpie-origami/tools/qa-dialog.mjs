/**
 * The origami studio, checked the way a user meets it: figures fold,
 * steps walk, the paper takes colour and pictures, the overlays sit
 * on the sheet, and both exits deliver what they promise.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve( path.dirname( fileURLToPath( import.meta.url ) ), '..' );
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, shotDir: path.join( root, 'dist' ) } );
const { page, check } = qa;

const state = () => page.evaluate( () => window.__wpieogState() );
const settle = ( ms ) => page.waitForTimeout( ms );

/** How much of the 3D canvas carries paint. */
const inked = () =>
	page.evaluate( () => {
		const c = document.querySelector( '.wpieog-canvas' );
		const probe = document.createElement( 'canvas' );
		probe.width = c.width;
		probe.height = c.height;
		const g = probe.getContext( '2d' );
		g.drawImage( c, 0, 0 );
		const data = g.getImageData( 0, 0, c.width, c.height ).data;
		let hit = 0;
		for ( let i = 3; i < data.length; i += 4 ) {
			if ( data[ i ] > 10 ) {
				hit++;
			}
		}
		return ( hit / ( c.width * c.height ) ) * 100;
	} );

await settle( 3500 );

/* ------------------------------ the basics ------------------------------- */

const { FIGURES } = await import( '../src/core/figures/index.js' );
check(
	FIGURES.length === ( await page.locator( '.wpieog-figure' ).count() ),
	`${ FIGURES.length } figure cards`
);
check( ( await state() ).figure === 'crane', 'the crane opens the studio' );
check( ( await state() ).progress === ( await state() ).steps, 'opens folded' );
check( ( await inked() ) > 3, 'the model is on the canvas' );
check(
	( await page.locator( '.wpieog-step' ).count() ) ===
		( await state() ).steps + 1,
	'one instruction entry per step plus the sheet'
);

/* ---------------------------- steps and slider ---------------------------- */

await page.locator( '.wpieog-step' ).nth( 0 ).click();
await settle( 3000 );
check( ( await state() ).progress < 0.01, 'the sheet entry unfolds everything' );
await page.locator( '.wpieog-step' ).nth( 2 ).click();
await settle( 2400 );
check( Math.abs( ( await state() ).progress - 2 ) < 0.01, 'step two folds to step two' );
await page.locator( '.wpieog-progress' ).fill( '500' );
await settle( 300 );
const mid = ( await state() ).progress;
check( mid > 0 && mid < ( await state() ).steps, 'the slider scrubs mid-fold' );

/* ------------------------------ every figure ------------------------------ */

for ( let i = 1; i < FIGURES.length; i++ ) {
	await page.locator( '.wpieog-figure' ).nth( i ).click();
	await settle( 3200 );
	const s = await state();
	check(
		s.progress === s.steps && ( await inked() ) > 2,
		`figure ${ s.figure } folds to its end and shows`
	);
}

/* ------------------------------ the paper -------------------------------- */

await page.locator( '.wpieog-figure' ).nth( 1 ).click();
await settle( 3000 );

// Colour pick repaints the swatch (the controlled-component gotcha).
const swatch = page.locator( '.wpieog-sidebox' ).first().locator( 'button' ).first();
await swatch.click();
await settle( 500 );
check(
	( await state() ).front.color === '#e63946',
	'front colour follows the picker'
);
const bg = await swatch.evaluate( ( el ) => el.style.background );
check( bg.includes( '230' ) && bg.includes( '57' ), 'the swatch repaints itself' );

// A picture on the back.
await page.locator( '.wpieog-sidebox' ).nth( 1 ).getByText( 'Bild wählen' ).click();
await settle( 400 );
await page.locator( '.mock-pick .mock-media-item' ).first().click();
await settle( 700 );
check( !! ( await state() ).back.image, 'the back takes a picture' );

// Overlays.
await page.getByText( 'Zeigen, wo was landet' ).click();
await settle( 400 );
check( ( await state() ).showRegions, 'the region overlay switches on' );
await qa.shot( 'qa-regions.png' );

/* -------------------------------- views ---------------------------------- */

const yawBefore = ( await state() ).yaw;
await page.locator( '.wpieog-views .ai-btn' ).nth( 2 ).click();
await settle( 300 );
check( ( await state() ).yaw !== yawBefore, 'view presets move the camera' );

/* ------------------------------ both exits -------------------------------- */

await page.getByText( 'Als Bild einfügen' ).click();
await settle( 1200 );
let types = await page.evaluate( () => window.__dispatched.map( ( d ) => d.type ) );
check( types.includes( 'ADD_LAYER' ), 'the picture lands as a layer' );
const gen = await page.evaluate( () => {
	const add = window.__dispatched.find( ( d ) => 'ADD_LAYER' === d.type );
	return add && add.layer.generator;
} );
check( gen && 'wpie-origami/studio' === gen.id, 'the layer remembers its generator' );
check( gen && 'fox' === gen.params.figure, 'the layer remembers the figure' );

await page.getByText( 'Faltbogen + Anleitung einfügen' ).click();
await settle( 3000 );
types = await page.evaluate( () => window.__dispatched.map( ( d ) => d.type ) );
check( types.includes( 'SET_PAGES' ), 'the sheets land as pages' );
const pages = await page.evaluate( () => {
	const set = window.__dispatched.find( ( d ) => 'SET_PAGES' === d.type );
	return set ? set.pages : [];
} );
check( 4 === pages.length, 'fox: sheet, mirrored back, instructions, plus the open page' );
check(
	pages.slice( 1 ).every( ( p ) => 1 === p.layers.length && p.layers[ 0 ].src ),
	'every new page carries one rendered sheet'
);

process.exit( await qa.finish() );
