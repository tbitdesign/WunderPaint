/** Real editor reducer, bridge, layer factories and color panel. One browser, files only in /tmp. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = path.resolve(
		path.dirname( fileURLToPath( import.meta.url ) ),
		'..'
	),
	editor = path.resolve( root, '../..' );
const req = createRequire( editor + '/tools/template-generator/package.json' );
const out =
	process.env.MATH_QA_DIR ||
	fs.mkdtempSync( path.join( os.tmpdir(), 'math-figures-premium-' ) );
fs.mkdirSync( out, { recursive: true } );
if (
	execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( s ) =>
				! /^\s*Z/.test( s ) &&
				/chrome|chromium|headless_shell/.test( s )
		)
)
	throw new Error( 'Another browser is active' );
await req( 'esbuild' ).build( {
	entryPoints: [ root + '/tools/preview/editor-entry.jsx' ],
	outfile: out + '/app.js',
	bundle: true,
	format: 'iife',
	jsx: 'automatic',
	platform: 'browser',
	nodePaths: [ editor + '/node_modules' ],
	alias: { '@editor': editor + '/src' },
	define: { 'process.env.NODE_ENV': '"development"' },
	loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'file' },
	logOverride: { 'empty-import-meta': 'silent' },
	plugins: [
		{
			name: 'browser-util',
			setup( build ) {
				build.onResolve( { filter: /^util$/ }, () => ( {
					path: 'util',
					namespace: 'empty',
				} ) );
				build.onLoad( { filter: /.*/, namespace: 'empty' }, () => ( {
					contents: 'module.exports={};',
					loader: 'js',
				} ) );
			},
		},
	],
} );
const url = ( p ) => pathToFileURL( p ).href;
fs.mkdirSync( out + '/assets', { recursive: true } );
fs.copyFileSync( root + '/assets/mathjax.js', out + '/assets/mathjax.js' );
fs.writeFileSync(
	out + '/index.html',
	`<!doctype html><html lang="en"><meta charset="utf-8"><link rel="stylesheet" href="${ url(
		editor + '/build/index.css'
	) }"><link rel="stylesheet" href="${ url(
		root + '/style.css'
	) }"><style>html,body{margin:0;height:100%;overflow:hidden}#wpie-root,#app{height:100%}</style><div id="wpie-root" data-theme="dark"><div id="app"></div></div><script src="app.js"></script><script src="${ url(
		root + '/extension.js'
	) }"></script></html>`
);
const browser = await req( 'playwright' ).chromium.launch( {
	args: [
		'--no-sandbox',
		'--use-gl=swiftshader',
		'--enable-unsafe-swiftshader',
		'--allow-file-access-from-files',
	],
} );
const page = await browser.newPage( {
		viewport: { width: 1600, height: 1100 },
	} ),
	errors = [];
page.on( 'pageerror', ( e ) => errors.push( e.message ) );
page.on( 'console', ( m ) => {
	if ( m.type() === 'error' ) errors.push( m.text() );
} );
await page.route( /^https?:/, ( r ) => r.abort() );
const state = () => page.evaluate( () => __wpiemfState() );
const settle = async ( n = -1 ) => {
	await page.waitForFunction(
		( before ) => {
			const s = window.__wpiemfState?.();
			return s && s.frames > before && ! s.busy;
		},
		n,
		{ timeout: 40000 }
	);
	return state();
};
const load = async ( id ) => {
	const n = ( await state() ).frames;
	await page.evaluate( ( v ) => __wpiemfProof.load( v ), id );
	return settle( n );
};
const save = async ( name ) => {
	const s = await state();
	fs.writeFileSync( out + '/' + name + '.svg', s.last.svg );
	await page
		.locator( '.wpiemf-dialog' )
		.screenshot( { path: out + '/' + name + '.png' } );
};
try {
	await page.goto( url( out + '/index.html' ) );
	await page.waitForFunction(
		() =>
			window.genGenerator &&
			window.genEditor?.state.colorPanelCommand === 0
	);
	await page.evaluate( () => genGenerator.run( { editor: genEditor } ) );
	await settle();
	assert.equal( await page.locator( '.wpiemf-type' ).count(), 26 );
	// Run all presets through the real MathJax/canvas measurement pipeline.
	const proof = await page.evaluate( async () => {
		const issues = [];
		for ( const s of __wpiemfProof.starters ) {
			const r = await __wpiemfProof.render( s.id );
			if ( r.warnings.length || /NaN|Infinity|undefined/.test( r.svg ) )
				issues.push( { id: s.id, warnings: r.warnings } );
		}
		return { count: __wpiemfProof.starters.length, issues };
	} );
	assert.deepEqual( proof.issues, [] );
	console.log( 'Presets rendered:', proof.count );
	for ( const id of [
		'linked-function-sheet',
		'linked-comparison',
		'analysis-parabola',
		'analysis-area',
		'region-parabolic',
		'field-damped',
		'contour-saddle',
		'complex-roots',
	] ) {
		await load( id );
		await save( id );
	}
	await load( 'linked-function-sheet' );
	await page.locator( '.wpiemf-shared summary' ).click();
	let before = ( await state() ).frames;
	await page
		.locator( '[data-shared="expression"][data-index="0"]' )
		.fill( 'x^2+10' );
	let s = await settle( before );
	assert.ok( s.last.svg.includes( '14' ) );
	assert.equal(
		s.params.blocks.filter( ( b ) => b.source === 'f' ).length,
		3
	);
	await save( 'shared-updated' );
	// Source selection must expose table range controls and preserve independent input.
	const tableId = s.params.blocks.find( ( b ) => b.type === 'table' ).id;
	await page.locator( `.wpiemf-block[data-id="${ tableId }"]` ).click();
	assert.equal( await page.locator( '[data-key="tableStep"]' ).count(), 1 );
	await page.locator( '[data-key="source"]' ).selectOption( '' );
	await page.locator( '[data-key="source"]' ).selectOption( 'f' );
	assert.equal( await page.locator( '[data-key="tableStep"]' ).count(), 1 );
	await load( 'geometry-workbench' );
	const original = ( await state() ).params.blocks[ 0 ].geometry;
	const point = page.locator(
		'.wpiemf-handle[data-point="B"][data-kind="point"]'
	);
	const box = await point.boundingBox();
	assert.ok( box );
	before = ( await state() ).frames;
	await page.mouse.move( box.x + box.width / 2, box.y + box.height / 2 );
	await page.mouse.down();
	await page.mouse.move( box.x + 40, box.y - 30, { steps: 8 } );
	await page.mouse.up();
	s = await settle( before );
	assert.notEqual( s.params.blocks[ 0 ].geometry, original );
	assert.ok( s.params.blocks[ 0 ].viewRange );
	const label = page.locator(
			'.wpiemf-handle[data-point="B"][data-kind="label"]'
		),
		lb = await label.boundingBox();
	before = s.frames;
	await page.mouse.move( lb.x + lb.width / 2, lb.y + lb.height / 2 );
	await page.mouse.down();
	await page.mouse.move( lb.x + 25, lb.y + 20, { steps: 5 } );
	await page.mouse.up();
	s = await settle( before );
	assert.ok( s.params.blocks[ 0 ].labelOffsets.B );
	assert.ok( ! s.last.svg.includes( 'wpiemf-handle' ) );
	before = s.frames;
	await page.locator( '[data-geometry="x"]' ).fill( '1.25' );
	await page.locator( '[data-geometry="x"]' ).press( 'Tab' );
	s = await settle( before );
	assert.ok( s.params.blocks[ 0 ].geometry.includes( '(1.25,' ) );
	await save( 'geometry-dragged' );
	// Insert into the actual reducer through the actual SVG importer.
	await load( 'linked-function-sheet' );
	const insertedParams = ( await state() ).params;
	await page.locator( '.wpiemf-insert' ).click();
	await page.waitForFunction( () =>
		genEditor.state.layers.some( ( l ) => l.generator )
	);
	let layers = await page.evaluate( () => genEditor.state.layers );
	let group = layers.find( ( l ) => l.generator );
	assert.equal( group.type, 'group' );
	assert.ok( group.children.length > 10 );
	assert.ok( ! layers.some( ( l ) => l.type === 'image' ) );
	assert.deepEqual( group.generator.params.math, insertedParams.math );
	const originalIds = layers.map( ( l ) => l.id );
	const png = await page.evaluate( async () => {
		const c = await WPIE.bridge.raster.renderToCanvas(
			genEditor.state.doc,
			genEditor.state.layers,
			{ scale: 1, cache: WPIE.bridge.raster.sharedImageCache }
		);
		return c.toDataURL();
	} );
	fs.writeFileSync(
		out + '/inserted-real-editor.png',
		Buffer.from( png.split( ',' )[ 1 ], 'base64' )
	);
	await page.evaluate( () =>
		genGenerator.edit( {
			editor: genEditor,
			layer: genEditor.state.layers.find( ( l ) => l.generator ),
		} )
	);
	await settle();
	assert.deepEqual( ( await state() ).params.math, insertedParams.math );
	await page.locator( '.wpiemf-shared summary' ).click();
	before = ( await state() ).frames;
	await page
		.locator( '[data-shared="expression"][data-index="0"]' )
		.fill( '3x+2' );
	await settle( before );
	await page.locator( '.wpiemf-insert' ).click();
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiemf-dialog' )
	);
	layers = await page.evaluate( () => genEditor.state.layers );
	group = layers.find( ( l ) => l.generator );
	assert.equal( layers.filter( ( l ) => l.generator ).length, 1 );
	assert.ok( layers.every( ( l ) => ! originalIds.includes( l.id ) ) );
	assert.equal(
		group.generator.params.math.definitions[ 0 ].expression,
		'3x+2'
	);
	await page.evaluate( () =>
		genGenerator.edit( {
			editor: genEditor,
			layer: genEditor.state.layers.find( ( l ) => l.generator ),
		} )
	);
	await settle();
	await page.getByRole( 'button', { name: 'Cancel', exact: true } ).click();
	assert.deepEqual(
		await page.evaluate( () => genEditor.state.layers ),
		layers
	);
	// All locales use the same working dialog, tested sequentially in one browser.
	for ( const locale of [
		'de_DE',
		'es_ES',
		'fr_FR',
		'it_IT',
		'nl_NL',
		'pt_BR',
	] ) {
		await page.goto( url( out + '/index.html' ) + '?locale=' + locale );
		await page.waitForFunction(
			() =>
				window.genGenerator &&
				window.genEditor?.state.colorPanelCommand === 0
		);
		await page.evaluate( () => genGenerator.run( { editor: genEditor } ) );
		await settle();
		await load( 'analysis-area' );
		assert.deepEqual( ( await state() ).last.warnings, [] );
		if ( locale === 'de_DE' ) {
			await page.evaluate(
				() =>
					( document.querySelector( '#wpie-root' ).dataset.theme =
						'light' )
			);
			await save( 'german-light' );
			assert.equal(
				await page
					.locator( '.wpiemf-canvas' )
					.evaluate( ( c ) => getComputedStyle( c ).boxShadow ),
				'none'
			);
		}
	}
	assert.deepEqual( errors, [] );
	console.log(
		'PASS: shared data, point/label dragging, precise fields, vector insert/update/cancel, six locales, no browser errors. Artifacts: ' +
			out
	);
} catch ( e ) {
	await page.screenshot( { path: out + '/failure.png' } );
	console.error( 'Browser errors:', errors );
	throw e;
} finally {
	await browser.close();
}
