/** The loaded motif must be visible in the final composite, not just present as layers. */
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
const out = fs.mkdtempSync( '/tmp/wpie-papercut-photo-start-' );
const setup = path.join( out, 'setup.js' );
fs.writeFileSync(
	setup,
	`window.__wpieQA=true;
window.__photoDocument=(x)=>x===null?[]:[
 {id:'bg',type:'shape',shape:'rect',x:0,y:0,w:1500,h:1000,fill:'#eeeeee'},
 {id:'motif',type:'shape',shape:'rect',x,y:200,w:450,h:600,fill:'#202020'}];
window.__installWpieMock({iconClassPrefix:'wpiepca',doc:{w:1500,h:1000},readyDelay:900,
 patch:(WPIE,editor)=>{editor.state.layers=window.__photoDocument(200);}});`
);
const stage = await buildStage( {
	root,
	setup,
	out: path.join( out, 'stage' ),
} );
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
const waitPhoto = () =>
	page.waitForFunction(
		() =>
			window.__pca?.params.layers.some( ( l ) => l.source === 'photo' ) &&
			! document.querySelector( '.wpiepca-hist' ).hidden
	);
const reopen = async ( x ) => {
	await page.evaluate( ( x ) => {
		window.__pca?.close();
		window.__editor.state.layers = window.__photoDocument( x );
		window.__gen.run( { editor: window.__editor, extras: {} } );
	}, x );
};
const pixels = () =>
	page.locator( '.wpiepca-view canvas' ).evaluate( ( c ) => {
		const p = c
			.getContext( '2d' )
			.getImageData( 0, 0, c.width, c.height ).data;
		const bg =
			( Math.floor( c.height * 0.07 ) * c.width +
				Math.floor( c.width * 0.07 ) ) *
			4;
		let count = 0,
			sumX = 0;
		for ( let y = Math.ceil( c.height * 0.1 ); y < c.height * 0.9; y++ )
			for ( let x = Math.ceil( c.width * 0.1 ); x < c.width * 0.9; x++ ) {
				const i = ( y * c.width + x ) * 4;
				if (
					Math.hypot(
						p[ i ] - p[ bg ],
						p[ i + 1 ] - p[ bg + 1 ],
						p[ i + 2 ] - p[ bg + 2 ]
					) > 18
				) {
					count++;
					sumX += x;
				}
			}
		return {
			coverage: count / ( c.width * c.height ),
			cx: sumX / Math.max( 1, count ) / c.width,
		};
	} );
const source = () =>
	page
		.locator( '.wpiepca-side select' )
		.filter( { has: page.locator( 'option[value="document"]' ) } )
		.first();
const delayNextPhoto = () =>
	page.evaluate( () => {
		window.__originalRaster = window.WPIE.bridge.raster.renderToCanvas;
		window.__releasePhoto = null;
		window.WPIE.bridge.raster.renderToCanvas = async ( ...args ) => {
			const c = await window.__originalRaster( ...args );
			return new Promise( ( resolve ) => {
				window.__releasePhoto = () => resolve( c );
			} );
		};
	} );
const releasePhoto = () =>
	page.evaluate( () => {
		window.WPIE.bridge.raster.renderToCanvas = window.__originalRaster;
		window.__releasePhoto();
	} );
try {
	await waitPhoto();
	check(
		await page.evaluate( () =>
			window.__pca.params.layers.every( ( l ) => l.source === 'photo' )
		),
		'a photo start has no automatic landscape in front of it'
	);
	const a = await pixels();
	check(
		a.coverage > 0.05 && a.coverage < 0.5 && a.cx < 0.45,
		'the left-hand input motif is visibly on the left in the final preview'
	);
	await qa.shot( 'photo-a-visible.png' );
	await reopen( 850 );
	await waitPhoto();
	const b = await pixels();
	check(
		b.coverage > 0.05 && b.coverage < 0.5 && b.cx > 0.55,
		'the right-hand input motif is visibly on the right in the final preview'
	);
	check(
		b.cx - a.cx > 0.25,
		'different documents produce different visible composites immediately after opening'
	);
	await qa.shot( 'photo-b-visible.png' );
	await page.locator( '[data-library-key="sky:orbmoon"]' ).click();
	const own = await page.evaluate( () =>
		JSON.stringify(
			window.__pca.params.layers.filter(
				( l ) => l.source === 'elements'
			)
		)
	);
	await source().selectOption( 'document' );
	await waitPhoto();
	check(
		( await page.evaluate( () =>
			JSON.stringify(
				window.__pca.params.layers.filter(
					( l ) => l.source === 'elements'
				)
			)
		) ) === own,
		're-slicing a photo preserves manually added objects'
	);
	const saved = await page.evaluate( () =>
		JSON.stringify( window.__pca.params.layers )
	);
	await page.getByRole( 'button', { name: 'Insert', exact: true } ).click();
	await page.evaluate( () => {
		const added = window.__dispatched.filter(
			( a ) => a.type === 'ADD_LAYER'
		);
		const group = added.find( ( a ) => a.layer.generator ).layer;
		window.__editor.state.layers.push( ...added.map( ( a ) => a.layer ) );
		window.__gen.edit( {
			editor: window.__editor,
			extras: {},
			layer: group,
		} );
	} );
	await waitPhoto();
	check(
		( await page.evaluate( () =>
			JSON.stringify( window.__pca.params.layers )
		) ) === saved,
		'insert and reopen preserve the saved photo layers and the added object'
	);
	await reopen( null );
	await page.waitForFunction(
		() => window.__pca?.params.photo.source === 'none'
	);
	const empty = await page.evaluate( () => ( {
		layers: window.__pca.params.layers.map( ( l ) => l.source ),
		hidden: document.querySelector( '.wpiepca-hist' ).hidden,
	} ) );
	check(
		empty.layers.length === 3 &&
			empty.layers.every( ( x ) => x === 'elements' ) &&
			empty.hidden,
		'a transparent empty document keeps the fallback landscape and hides the histogram'
	);
	check(
		( await source().inputValue() ) === 'none',
		'the source control reflects the empty-document fallback'
	);
	await qa.shot( 'empty-document-fallback.png' );
	await page.evaluate( () => {
		window.__editor.state.layers = window.__photoDocument( 850 );
	} );
	await source().selectOption( 'document' );
	await waitPhoto();
	check(
		( await page.evaluate( () =>
			window.__pca.params.layers.every( ( l ) => l.source === 'photo' )
		) ) && ( await pixels() ).cx > 0.55,
		'the first photo selected after an empty start replaces the automatic fallback and is visible'
	);
	await page.evaluate( () => {
		window.__originalRaster = window.WPIE.bridge.raster.renderToCanvas;
		window.WPIE.bridge.raster.renderToCanvas = async () => {
			throw Error( 'QA unavailable document' );
		};
	} );
	await reopen( 200 );
	await page.waitForFunction(
		() => window.__pca?.params.photo.source === 'none'
	);
	check(
		await page.evaluate(
			() =>
				window.__pca.params.layers.length === 3 &&
				! window.__pca.engine.photoCanvas
		),
		'an unavailable document retains the fallback without old photo data'
	);
	await page.evaluate(
		() =>
			( window.WPIE.bridge.raster.renderToCanvas =
				window.__originalRaster )
	);
	await delayNextPhoto();
	await reopen( 200 );
	await page.waitForFunction(
		() => typeof window.__releasePhoto === 'function'
	);
	await page.locator( '[data-library-key="sky:orbmoon"]' ).click();
	const addedWhileLoading = await page.evaluate( () =>
		JSON.stringify(
			window.__pca.params.layers
				.flatMap( ( l ) => l.objects )
				.find( ( o ) => o.kind === 'orb' )
		)
	);
	await releasePhoto();
	await waitPhoto();
	check(
		( await page.evaluate( () =>
			JSON.stringify(
				window.__pca.params.layers
					.flatMap( ( l ) => l.objects )
					.find( ( o ) => o.kind === 'orb' )
			)
		) ) === addedWhileLoading,
		'an object added during photo loading survives startup'
	);
	check(
		await page.evaluate( () =>
			window.__pca.params.layers
				.flatMap( ( l ) => l.objects )
				.every(
					( o ) => ! [ 'backdrop', 'terrain' ].includes( o.kind )
				)
		),
		'only the untouched automatic landscape is removed after delayed loading'
	);
	await delayNextPhoto();
	await reopen( 200 );
	await page.waitForFunction(
		() => typeof window.__releasePhoto === 'function'
	);
	// This edit models a saved color change on an existing starter layer.
	await page.evaluate( () => {
		window.__pca.params.layers[ 1 ].color = '#b05030';
		window.__pca.rerender();
	} );
	const edited = await page.evaluate( () =>
		JSON.stringify( window.__pca.params.layers[ 1 ] )
	);
	await releasePhoto();
	await waitPhoto();
	// Compare outside the page so the assertion uses the captured original layer.
	const preserved = await page.evaluate( () =>
		window.__pca.params.layers.map( ( l ) => JSON.stringify( l ) )
	);
	check(
		preserved.includes( edited ),
		'a starter layer deliberately edited while loading is preserved'
	);
	await delayNextPhoto();
	await reopen( 200 );
	await page.waitForFunction(
		() => typeof window.__releasePhoto === 'function'
	);
	await page.locator( '[data-library-key="preset:alps"]' ).click();
	const replace = page.getByRole( 'button', {
		name: 'Replace',
		exact: true,
	} );
	if ( await replace.count() ) await replace.click();
	await page.waitForFunction( () => window.__pca.params.layers.length > 3 );
	const chosen = await page.evaluate( () =>
		JSON.stringify( window.__pca.params.layers )
	);
	await releasePhoto();
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepca-hist' ).hidden
	);
	await page.evaluate(
		() =>
			new Promise( ( resolve ) =>
				requestAnimationFrame( () => requestAnimationFrame( resolve ) )
			)
	);
	check(
		( await page.evaluate( () =>
			JSON.stringify( window.__pca.params.layers )
		) ) === chosen,
		'a deliberately selected start scene survives completion of the initial photo load'
	);
	fs.writeFileSync(
		path.join( out, 'results.json' ),
		JSON.stringify(
			{ checks, pixels: { a, b }, failures: qa.failures() },
			null,
			2
		)
	);
	console.log( 'QA artifacts:', out );
	process.exitCode = qa.failures() ? 1 : 0;
} finally {
	await qa.browser.close();
}
