/** One offline browser, real editor components, no WordPress writes. Run after build. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { COLLECTION_SCENE_LABELS } from '../src/core/collection-scenes.js';
import { WORLD_SCENE_LABELS } from '../src/core/world-scenes.js';

const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const editor = path.resolve( root, '../..' );
const req = createRequire(
	path.join( editor, 'tools/template-generator/package.json' )
);
if (
	execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( line ) =>
				! /^\s*Z/.test( line ) &&
				/chrome|chromium|headless_shell/.test( line )
		)
) {
	throw Error( 'A headless browser is already running.' );
}
const out = fs.mkdtempSync( '/tmp/wpie-papercut-interactions-' );
await req( 'esbuild' ).build( {
	entryPoints: [ path.join( root, 'tools/preview/editor-entry.jsx' ) ],
	outfile: path.join( out, 'app.js' ),
	bundle: true,
	format: 'iife',
	jsx: 'automatic',
	platform: 'browser',
	nodePaths: [ path.join( editor, 'node_modules' ) ],
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
const file = ( p ) => pathToFileURL( p ).href;
fs.writeFileSync(
	path.join( out, 'index.html' ),
	`<!doctype html><html lang="en"><head><meta charset="utf-8"><link rel="stylesheet" href="${ file(
		path.join( editor, 'build/index.css' )
	) }"><link rel="stylesheet" href="${ file(
		path.join( root, 'style.css' )
	) }"><style>html,body{margin:0;height:100%;overflow:hidden}#wpie-root,#app{height:100%}</style></head><body><div id="wpie-root"><div id="app"></div></div><script src="app.js"></script><script src="${ file(
		path.join( root, 'extension.js' )
	) }"></script></body></html>`
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
	viewport: { width: 1600, height: 1200 },
} );
page.setDefaultTimeout( 10000 );
const errors = [];
page.on( 'pageerror', ( error ) => errors.push( error.message ) );
await page.route( /^https?:/, ( route ) => route.abort() );
const names = () => page.locator( '.wpiepca-lname' ).allTextContents();
const state = () =>
	page.evaluate( () => JSON.stringify( window.__pca.params ) );
const undo = async () => {
	await page.evaluate( () => document.activeElement.blur() );
	await page.keyboard.press( 'Control+z' );
};
const drag = async ( from, to, fraction = 0.25, cancel = false ) => {
	const grip = page.locator( '.wpiepca-grip' ).nth( from );
	await grip.scrollIntoViewIfNeeded();
	const a = await grip.boundingBox();
	const b = await page.locator( '.wpiepca-lrow' ).nth( to ).boundingBox();
	await page.mouse.move( a.x + a.width / 2, a.y + a.height / 2 );
	await page.mouse.down();
	await page.mouse.move( b.x + 20, b.y + b.height * fraction, { steps: 8 } );
	assert.equal(
		await page.locator( '.wpiepca-lrow.is-over' ).count(),
		1,
		'row drop marker'
	);
	if ( cancel ) await grip.dispatchEvent( 'pointercancel', { pointerId: 1 } );
	await page.mouse.up();
};
const search = page.locator( '.wpiepca-left' ).getByRole( 'searchbox' );
const chooseScene = async ( id, label ) => {
	await search.fill( label );
	await page.locator( `[data-library-key="preset:${ id }"]` ).click();
	await page.getByRole( 'button', { name: 'Replace', exact: true } ).click();
};
try {
	await page.goto( file( path.join( out, 'index.html' ) ) );
	await page.waitForFunction(
		() =>
			window.pcaGenerator &&
			window.pcaEditor?.state.colorPanelCommand === 0
	);
	await page.evaluate( () =>
		window.pcaGenerator.run( { editor: window.pcaEditor } )
	);
	await page.waitForFunction(
		() =>
			window.__pca?.engine.allLayers().length > 0 &&
			window.__pca.params.photo.source === 'none'
	);
	const initial = await names();
	assert.equal( initial.length, 3 );
	await drag( 0, 2 );
	assert.deepEqual( await names(), [
		initial[ 1 ],
		initial[ 0 ],
		initial[ 2 ],
	] );
	await page
		.locator( '.wpiepca-lrow' )
		.nth( 1 )
		.getByRole( 'button', { name: 'Move forward', exact: true } )
		.press( 'Enter' );
	assert.deepEqual( await names(), initial );
	await page
		.locator( '.wpiepca-lrow' )
		.first()
		.getByRole( 'button', { name: 'Move backward', exact: true } )
		.click();
	assert.deepEqual( await names(), [
		initial[ 1 ],
		initial[ 0 ],
		initial[ 2 ],
	] );
	await undo();
	assert.deepEqual( await names(), initial );
	await drag( 0, 2, 0.75 );
	assert.deepEqual( await names(), [
		initial[ 1 ],
		initial[ 2 ],
		initial[ 0 ],
	] );
	await undo();
	const beforeCancel = await state();
	await drag( 0, 2, 0.25, true );
	assert.equal( await state(), beforeCancel );
	console.log(
		'PASS row drag in both directions, arrows, Undo and pointer cancellation'
	);

	for ( let i = 0; i < 12; i++ ) {
		await page
			.getByRole( 'button', { name: 'Add empty sheet', exact: true } )
			.click();
	}
	const longListState = await state();
	const longGrip = page.locator( '.wpiepca-grip' ).first();
	await longGrip.scrollIntoViewIfNeeded();
	const gripBox = await longGrip.boundingBox();
	const side = page.locator( '.wpiepca-side' );
	const sideBox = await side.boundingBox();
	const scrollBefore = await side.evaluate( ( el ) => el.scrollTop );
	await page.mouse.move( gripBox.x + 5, gripBox.y + 5 );
	await page.mouse.down();
	await page.mouse.move( gripBox.x + 5, sideBox.y + sideBox.height - 8, {
		steps: 8,
	} );
	await page.waitForFunction(
		( before ) =>
			document.querySelector( '.wpiepca-side' ).scrollTop > before + 120,
		scrollBefore
	);
	await longGrip.dispatchEvent( 'pointercancel', { pointerId: 1 } );
	await page.mouse.up();
	assert.equal( await state(), longListState );
	console.log(
		'PASS long-list auto-scroll without committing a canceled drag'
	);

	await chooseScene( 'nightwolf', 'Night Wolf' );
	const beforeColor = await state();
	const beforeNames = await names();
	const wolf = page.locator( '.wpiepca-lrow' ).filter( {
		has: page.locator( '.wpiepca-lname', { hasText: /^Wolf$/ } ),
	} );
	await wolf.evaluate( ( el ) => {
		window.savedWolfRow = el;
	} );
	const swatch = wolf.locator( '.wpiepca-lcolor button' );
	await swatch.click();
	await page.locator( '.global-color-panel' ).waitFor();
	await page.screenshot( { path: path.join( out, 'picker-before.png' ) } );
	const wheel = await page.locator( '.global-color-panel .cw' ).boundingBox();
	const color = () =>
		page.evaluate(
			() =>
				window.__pca.params.layers.find( ( layer ) =>
					layer.objects.some(
						( object ) => object.species === 'wolf'
					)
				).color
		);
	const changeColor = async ( x, y ) => {
		await page.mouse.move(
			wheel.x + wheel.width * x,
			wheel.y + wheel.height * y
		);
		await page.mouse.down();
		await page.mouse.move(
			wheel.x + wheel.width * ( x + 0.03 ),
			wheel.y + wheel.height * ( y + 0.03 ),
			{ steps: 6 }
		);
		await page.mouse.up();
	};
	await changeColor( 0.6, 0.4 );
	const firstColor = await color();
	assert.ok( firstColor );
	await changeColor( 0.38, 0.62 );
	assert.notEqual( await color(), firstColor );
	assert.equal(
		await wolf.evaluate( ( el ) => window.savedWolfRow === el ),
		true,
		'active React color host survives splitting'
	);
	assert.equal( await page.locator( '.global-color-panel' ).count(), 1 );
	assert.deepEqual( await names(), beforeNames );
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.locator( '.global-color-panel' ).count(), 0 );
	assert.equal( await page.locator( '.wpiepca-dialog' ).count(), 1 );
	await undo();
	assert.equal(
		await state(),
		beforeColor,
		'one Undo restores the entire color gesture and shared sheet'
	);
	await wolf
		.getByRole( 'button', { name: 'Move forward', exact: true } )
		.click();
	const afterMove = beforeNames.slice();
	const at = afterMove.indexOf( 'Wolf' );
	[ afterMove[ at - 1 ], afterMove[ at ] ] = [
		afterMove[ at ],
		afterMove[ at - 1 ],
	];
	assert.deepEqual( await names(), afterMove );
	await undo();
	assert.equal( await state(), beforeColor );
	console.log(
		'PASS continuous shared-sheet recoloring, exact object order, one-step Undo and nested Escape'
	);

	const additions = [
		'quatrefoil',
		'ogee',
		'sunburstwindow',
		'raindrop',
		'ginkgo',
		'eucalyptus',
		'tulip',
		'snowdrop',
		'cotton',
		'coral',
		'hotairballoon',
		'observatory',
		'greenhouse',
		'campingtent',
		'pagoda',
		'steppingstones',
	];
	const samples = await page.evaluate(
		( ids ) =>
			window.__pcaLibrary.samples.filter( ( item ) =>
				ids.includes( item.id )
			),
		additions
	);
	assert.equal( samples.length, 16 );
	for ( const sample of samples ) {
		const prefix = {
			frame: 'win',
			trees: 'tree',
			plants: 'plant',
			decoration: 'decoration',
		}[ sample.kind ];
		await search.fill( sample.label );
		await page
			.locator( `[data-library-key="${ prefix }:${ sample.id }"]` )
			.click();
		assert.equal(
			await page.evaluate(
				( id ) =>
					window.__pca.params.layers
						.flatMap( ( layer ) => layer.objects )
						.some(
							( object ) =>
								( object.window ||
									object.species ||
									object.variant ) === id
						),
				sample.id
			),
			true,
			sample.id
		);
	}
	await chooseScene( 'greenhousegarden', 'Greenhouse garden' );
	const beforeConfirmation = await state();
	await search.fill( 'Balloon valley' );
	await page.locator( '[data-library-key="preset:balloonvalley"]' ).click();
	await page
		.getByRole( 'button', { name: 'Replace', exact: true } )
		.waitFor();
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.locator( '.modal-backdrop' ).count(), 1 );
	assert.equal( await state(), beforeConfirmation );
	await search.fill( '' );
	await page.screenshot( { path: path.join( out, 'dialog.png' ) } );
	console.log(
		'PASS all sixteen new motifs insert through their actual library cards'
	);

	// v3.8: new animals, buildings and the editor's own shapes come in
	// through their cards; Ctrl+D and the Duplicate button copy, and the
	// copy walks back and forth with Ctrl+Z, Ctrl+Shift+Z and Ctrl+Y.
	await search.fill( '' );
	const countOf = ( field, value ) =>
		page.evaluate(
			( [ f, v ] ) =>
				window.__pca.params.layers
					.flatMap( ( layer ) => layer.objects )
					.filter( ( object ) => object[ f ] === v ).length,
			[ field, value ]
		);
	const sheets = () =>
		page.evaluate( () => window.__pca.params.layers.length );
	await search.fill( 'Elephant' );
	await page.locator( '[data-library-key="an:elephant"]' ).click();
	assert.equal( await countOf( 'species', 'elephant' ), 1 );
	const before = await sheets();
	await page.evaluate( () => document.activeElement.blur() );
	await page.keyboard.press( 'Control+d' );
	assert.equal( await countOf( 'species', 'elephant' ), 2, 'Ctrl+D' );
	assert.equal( await sheets(), before + 1, 'the copy has its own sheet' );
	await undo();
	assert.equal( await countOf( 'species', 'elephant' ), 1, 'Undo' );
	await page.keyboard.press( 'Control+Shift+z' );
	assert.equal( await countOf( 'species', 'elephant' ), 2, 'Redo' );
	await undo();
	await page.keyboard.press( 'Control+y' );
	assert.equal( await countOf( 'species', 'elephant' ), 2, 'Ctrl+Y' );
	await page.evaluate( () => {
		const elephant = window.__pca.params.layers
			.flatMap( ( layer ) => layer.objects )
			.find( ( object ) => 'elephant' === object.species );
		window.__pca.pick( elephant.id );
	} );
	await page
		.getByRole( 'button', { name: 'Duplicate', exact: true } )
		.first()
		.click();
	assert.equal( await countOf( 'species', 'elephant' ), 3, 'the button' );
	for ( const [ key, label, field, value ] of [
		[ 'an:penguin', 'Penguin', 'species', 'penguin' ],
		[ 'an:trex', 'T. rex', 'species', 'trex' ],
		[ 'decoration:castle', 'Castle', 'variant', 'castle' ],
		[ 'decoration:ferriswheel', 'Ferris wheel', 'variant', 'ferriswheel' ],
		[ 'sky:flyerbat', 'Bat', 'species', 'bat' ],
	] ) {
		await search.fill( label );
		await page.locator( `[data-library-key="${ key }"]` ).click();
		assert.ok( ( await countOf( field, value ) ) >= 1, key );
	}
	await search.fill( '' );
	const formTiles = await page
		.locator( '[data-library-key^="form:"]' )
		.count();
	assert.ok( formTiles >= 20, 'the editor shapes are offered: ' + formTiles );
	await page.locator( '[data-library-key="form:heart"]' ).click();
	assert.ok(
		await page.evaluate( () => {
			const form = window.__pca.params.layers
				.flatMap( ( layer ) => layer.objects )
				.find( ( object ) => 'form' === object.kind );
			const built = window.__pca.engine
				.allLayers()
				.find( ( layer ) =>
					layer.layer.objects.some( ( o ) => o.id === form.id )
				);
			return 'heart' === form.shape && built && built.rings.length > 0;
		} ),
		'a shape is cut as paper'
	);
	const theme = page
		.locator( '.wpiepca-left' )
		.getByRole( 'combobox', { name: 'Theme' } );
	await theme.selectOption( 'prehistoric' );
	const shown = async ( key ) =>
		page.locator( `[data-library-key="${ key }"]` ).isVisible();
	assert.equal( await shown( 'an:trex' ), true, 'theme: the T. rex' );
	assert.equal( await shown( 'preset:trexcanyon' ), true, 'theme: scene' );
	assert.equal( await shown( 'an:deer' ), false, 'theme: no deer' );
	await theme.selectOption( 'all' );
	console.log(
		'PASS new animals, buildings and shapes insert; Duplicate, Redo and the theme filter work'
	);

	for ( const [ name, entries ] of [
		[ 'scenes', COLLECTION_SCENE_LABELS ],
		[ 'world-scenes', WORLD_SCENE_LABELS ],
		[ 'motifs', samples ],
	] ) {
		await page.evaluate( () => {
			const grid = document.createElement( 'div' );
			grid.id = 'collection-contact';
			grid.style.cssText =
				'position:absolute;top:0;left:0;z-index:99999;background:#e6e8eb;padding:16px;display:grid;grid-template-columns:repeat(4,300px);gap:12px;color:#162031;font:16px sans-serif';
			document.body.append( grid );
		} );
		for ( const entry of entries ) {
			const rendered = await page.evaluate( ( entry ) => {
				const rendered = window.__pcaLibrary.render(
					entry,
					entry.kind ? 'midnight' : null,
					600
				);
				const item = document.createElement( 'div' );
				const image = document.createElement( 'img' );
				image.src = rendered.url;
				image.style.cssText = 'display:block;width:300px;height:200px';
				const caption = document.createElement( 'div' );
				caption.textContent = entry.label;
				item.append( image, caption );
				document.getElementById( 'collection-contact' ).append( item );
				return { empty: rendered.empty, layers: rendered.layers };
			}, entry );
			assert.equal( rendered.empty, 0, entry.id + ' renders all sheets' );
		}
		await page
			.locator( '#collection-contact' )
			.screenshot( { path: path.join( out, name + '.png' ) } );
		await page
			.locator( '#collection-contact' )
			.evaluate( ( el ) => el.remove() );
	}
	console.log(
		'PASS all forty-two scenes and sixteen motifs render every paper sheet'
	);
	const saved = await state();
	await page.getByRole( 'button', { name: 'Insert', exact: true } ).click();
	await page.waitForFunction(
		() =>
			! window.__pca &&
			window.pcaEditor.state.layers.some( ( layer ) => layer.generator )
	);
	await page.evaluate( () =>
		window.pcaGenerator.edit( {
			editor: window.pcaEditor,
			layer: window.pcaEditor.state.layers.find(
				( layer ) => layer.generator
			),
		} )
	);
	await page.waitForFunction( () => window.__pca?.engine.allLayers().length );
	assert.equal(
		await state(),
		saved,
		'new scene survives actual editor insertion and reopening'
	);
	await page.keyboard.press( 'Escape' );
	assert.equal( await page.locator( '.wpiepca-dialog' ).count(), 0 );
	assert.equal( await page.evaluate( () => !! window.__pca ), false );
	await page.setViewportSize( { width: 1280, height: 900 } );
	await page.goto( file( path.join( out, 'index.html' ) ) + '?locale=de_DE' );
	await page.waitForFunction(
		() =>
			window.pcaGenerator &&
			window.pcaEditor?.state.colorPanelCommand === 0
	);
	await page.evaluate( () =>
		window.pcaGenerator.run( { editor: window.pcaEditor } )
	);
	await page.waitForFunction( () => window.__pca?.engine.allLayers().length );
	await page
		.getByRole( 'searchbox', { name: 'Motive suchen' } )
		.fill( 'Gewächshaus' );
	assert.equal(
		await page
			.locator( '[data-library-key="preset:greenhousegarden"]' )
			.isVisible(),
		true
	);
	await page
		.locator( '[data-library-key="preset:greenhousegarden"]' )
		.click();
	await page.getByRole( 'button', { name: 'Ersetzen', exact: true } ).click();
	const layout = await page.locator( '.wpiepca-dialog' ).boundingBox();
	assert.ok(
		layout.x >= 0 &&
			layout.y >= 0 &&
			layout.x + layout.width <= 1280 &&
			layout.y + layout.height <= 900
	);
	await page.screenshot( { path: path.join( out, 'dialog-de-1280.png' ) } );
	await page.mouse.click( 4, 4 );
	assert.equal(
		await page.evaluate( () => !! window.__pca ),
		false,
		'an actual background click still closes the studio'
	);
	assert.deepEqual( errors, [] );
	console.log(
		'PASS editable insertion, reopening, dialog cleanup; no browser runtime errors'
	);
	console.log( 'Screenshots: ' + out );
} catch ( error ) {
	console.log( 'Browser errors:', errors, 'Screenshots:', out );
	await page.screenshot( { path: path.join( out, 'failure.png' ) } );
	throw error;
} finally {
	await browser.close();
}
