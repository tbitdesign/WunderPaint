/** Reproduce the library clipping and photo histogram states in the actual dialog. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const processes = execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], {
	encoding: 'utf8',
} );
if (
	processes
		.split( '\n' )
		.some(
			( l ) =>
				! /^\s*Z/.test( l ) &&
				/chrome|chromium|headless_shell/.test( l )
		)
)
	throw Error( 'A browser is already running.' );
const out = fs.mkdtempSync( '/tmp/wpie-papercut-panels-' );
const stage = await buildStage( { root, out: path.join( out, 'stage' ) } );
const qa = await launchQA( {
	stage,
	shotDir: out,
	locale: 'en_US',
	viewport: { width: 1600, height: 1100 },
} );
const { page } = qa;
const checks = [];
const check = ( ok, label ) => {
	checks.push( { ok, label } );
	qa.check( ok, label );
};
const libraryState = () =>
	page.evaluate( () => {
		const left = document.querySelector( '.wpiepca-left' );
		const scroll = document.querySelector( '.wpiepca-library-scroll' );
		const head = document
			.querySelector( '.wpiepca-library-filter' )
			.getBoundingClientRect();
		const outer = left.getBoundingClientRect(),
			inner = scroll.getBoundingClientRect();
		const cards = [
			...scroll.querySelectorAll( '.wpiepca-tile:not([hidden])' ),
		]
			.slice( 0, 3 )
			.map( ( e ) => {
				const r = e.getBoundingClientRect();
				return { x: r.x, y: r.y };
			} );
		return {
			outerTop: left.scrollTop,
			innerTop: scroll.scrollTop,
			headTop: head.top,
			headBottom: head.bottom,
			innerY: inner.top,
			innerHeight: inner.height,
			outerHeight: outer.height,
			cards,
			topStripClear: [ 0.2, 0.5, 0.8 ].every(
				( f ) =>
					! document
						.elementFromPoint(
							outer.x + outer.width * f,
							outer.y + 4
						)
						?.closest( '.wpiepca-tile' )
			),
		};
	} );
const histogramState = () =>
	page.locator( '.wpiepca-hist' ).evaluate( ( el ) => ( {
		visible:
			el.getClientRects().length > 0 &&
			getComputedStyle( el ).display !== 'none',
		ink: el
			.getContext( '2d' )
			.getImageData( 0, 0, el.width, el.height )
			.data.some( ( v, i ) => i % 4 === 3 && v > 0 ),
	} ) );
try {
	await page.waitForFunction(
		() => document.querySelectorAll( '.wpiepca-tile' ).length === 194
	);
	const sceneBefore = await page.evaluate( () =>
		JSON.stringify( window.__pca.params )
	);
	for ( const viewport of [
		{ width: 1600, height: 1100 },
		{ width: 1366, height: 768 },
	] ) {
		await page.setViewportSize( viewport );
		await page
			.locator( '.wpiepca-library-scroll' )
			.evaluate( ( el ) => ( el.scrollTop = 0 ) );
		const before = await libraryState();
		const box = await page
			.locator( '.wpiepca-library-scroll' )
			.boundingBox();
		await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
		await page.mouse.wheel( 0, 730 );
		await page.waitForFunction(
			() =>
				document.querySelector( '.wpiepca-library-scroll' ).scrollTop >
				0
		);
		const after = await libraryState();
		check(
			after.outerTop === 0 && after.innerTop > 0,
			`${ viewport.width }: wheel scrolls only the motif area`
		);
		check(
			after.headTop === before.headTop &&
				after.innerY >= after.headBottom + 9 &&
				after.topStripClear,
			`${ viewport.width }: Library stays fixed and no cards appear above it`
		);
		check(
			after.innerHeight > 250 && after.innerHeight < after.outerHeight,
			`${ viewport.width }: the motif viewport fits below Library`
		);
		check(
			before.cards[ 0 ].y === before.cards[ 1 ].y &&
				before.cards[ 1 ].x > before.cards[ 0 ].x &&
				before.cards[ 2 ].y > before.cards[ 0 ].y,
			`${ viewport.width }: the card grid keeps two columns`
		);
		await qa.shot( `library-scrolled-${ viewport.width }.png` );
	}
	const category = page.getByRole( 'combobox', {
		name: 'Category',
		exact: true,
	} );
	const search = page.getByRole( 'searchbox', {
		name: 'Search motifs',
		exact: true,
	} );
	await category.selectOption( 'sky' );
	check(
		( await libraryState() ).innerTop === 0,
		'category changes return the motif area to the top'
	);
	await search.fill( 'zzzz-no-matching-motif' );
	check(
		( await page.locator( '.wpiepca-tile:visible' ).count() ) === 0 &&
			( await page.locator( '.wpiepca-results' ).textContent() ).includes(
				'No matching motifs'
			),
		'no results leaves Library accessible and reports the empty state'
	);
	await search.fill( 'Moon' );
	check(
		( await page.locator( '.wpiepca-tile:visible' ).count() ) > 0 &&
			( await libraryState() ).innerTop === 0,
		'search recovers visible results at the top'
	);
	await search.fill( '' );
	await category.selectOption( 'all' );
	check(
		( await page.evaluate( () =>
			JSON.stringify( window.__pca.params )
		) ) === sceneBefore,
		'scrolling and filtering leave the design unchanged'
	);
	const source = page
		.locator( '.wpiepca-side select' )
		.filter( { has: page.locator( 'option[value="document"]' ) } )
		.first();
	// The shared stage starts with an empty document. Use an actual motif
	// for the photo checks; transparent pixels correctly use the fallback.
	await page.evaluate( () => {
		window.__editor.state.layers = [
			{
				id: 'photo-bg',
				type: 'shape',
				shape: 'rect',
				x: 0,
				y: 0,
				w: 1500,
				h: 1000,
				fill: '#eeeeee',
			},
			{
				id: 'photo-motif',
				type: 'shape',
				shape: 'rect',
				x: 200,
				y: 200,
				w: 450,
				h: 600,
				fill: '#202020',
			},
		];
	} );
	await source.selectOption( 'document' );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepca-hist' ).hidden
	);
	let hist = await histogramState();
	check(
		hist.visible && hist.ink,
		'a loaded document displays the histogram'
	);
	await source.selectOption( 'none' );
	hist = await histogramState();
	check(
		! hist.visible && ! hist.ink,
		'None hides the histogram and clears old pixels'
	);
	await page.evaluate( () => window.__pca.rerender() );
	hist = await histogramState();
	check(
		! hist.visible && ! hist.ink,
		'refreshing a scene without a photo keeps the histogram hidden'
	);
	await qa.shot( 'photo-none.png' );
	await source.selectOption( 'document' );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepca-hist' ).hidden
	);
	const thBefore = await page.evaluate( () =>
		window.__pca.params.photo.thresholds.join( ',' )
	);
	const box = await page.locator( '.wpiepca-hist' ).boundingBox();
	await page.mouse.move( box.x + box.width * 0.5, box.y + box.height / 2 );
	await page.mouse.down();
	await page.mouse.move( box.x + box.width * 0.62, box.y + box.height / 2, {
		steps: 3,
	} );
	await page.mouse.up();
	check(
		( await page.evaluate( () =>
			window.__pca.params.photo.thresholds.join( ',' )
		) ) !== thBefore,
		'histogram thresholds remain draggable with a photo'
	);
	await qa.shot( 'photo-loaded.png' );
	await source.selectOption( 'upload' );
	hist = await histogramState();
	check(
		! hist.visible && ! hist.ink,
		'waiting for an uploaded photo hides the previous histogram'
	);
	await page.evaluate( () => {
		window.__savedRaster = window.WPIE.bridge.raster.renderToCanvas;
		window.WPIE.bridge.raster.renderToCanvas = async () => {
			throw Error( 'QA: unavailable photo source' );
		};
	} );
	await source.selectOption( 'document' );
	hist = await histogramState();
	check(
		! hist.visible && ! hist.ink,
		'a failed photo load cannot display the previous histogram'
	);
	await page.evaluate(
		() =>
			( window.WPIE.bridge.raster.renderToCanvas = window.__savedRaster )
	);
	await source.selectOption( 'none' );
	await source.selectOption( 'document' );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepca-hist' ).hidden
	);
	hist = await histogramState();
	check(
		hist.visible && hist.ink,
		'a successful retry displays the histogram again'
	);
	await source.selectOption( 'none' );
	await page.evaluate( () => {
		const params = JSON.parse( JSON.stringify( window.__pca.params ) );
		window.__pca.close();
		window.__gen.edit( {
			editor: window.__editor,
			extras: {},
			layer: {
				id: 'qa-no-photo',
				generator: { id: 'wpie-papercut-art/scene', params },
			},
		} );
	} );
	await page.waitForFunction(
		() => window.__pca && window.__pca.engine.allLayers().length > 0
	);
	hist = await histogramState();
	check(
		! hist.visible && ! hist.ink,
		'reopening a saved scene without a photo leaves no empty histogram'
	);
	fs.writeFileSync(
		path.join( out, 'results.json' ),
		JSON.stringify( { checks, failures: qa.failures() }, null, 2 )
	);
	console.log( 'QA artifacts:', out );
	process.exitCode = qa.failures() ? 1 : 0;
} finally {
	await qa.browser.close();
}
