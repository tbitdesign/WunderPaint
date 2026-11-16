/** Real PaperEngine and shared editor bridge; no second browser and no server writes. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { launchQA, EDITOR } from '../../shared/qa-kit/stage.mjs';
import { PREMIUM_SCENE_LABELS } from '../src/core/premium-scenes.js';
import { PAPER_SURFACES } from '../src/core/finishes.js';
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
if (
	execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( line ) =>
				! /^\s*Z/.test( line ) &&
				/chrome|chromium|headless_shell/.test( line )
		)
)
	throw Error( 'A headless browser is already running.' );
const out = fs.mkdtempSync( '/tmp/wpie-papercut-premium-qa-' );
const stage = path.join( out, 'stage' );
fs.mkdirSync( stage );
const req = createRequire(
	path.join( EDITOR, 'tools/template-generator/package.json' )
);
// The shared mock now imports React context. Its historical empty element alias no longer builds.
// Reuse that mock with the installed real @wordpress/element; do not change other extensions' harnesses.
await req( 'esbuild' ).build( {
	entryPoints: [
		path.join( EDITOR, 'extensions/shared/qa-kit/mock-entry.js' ),
	],
	bundle: true,
	// The core's HEIC decoder (Node glue + .wasm) is never used here.
	external: [ 'libheif-js/*' ],
	format: 'iife',
	outfile: path.join( stage, 'mock.js' ),
	logLevel: 'warning',
	alias: {
		'@ed': path.join( EDITOR, 'src' ),
		'@wordpress/i18n': path.join(
			EDITOR,
			'tools/template-generator/tools/stubs/i18n.js'
		),
		'@wordpress/hooks': path.join(
			EDITOR,
			'tools/template-generator/tools/stubs/noop.js'
		),
	},
	nodePaths: [ path.join( EDITOR, 'node_modules' ) ],
	loader: { '.json': 'json' },
} );
for ( const [ from, to ] of [
	[ path.join( EDITOR, 'build/index.css' ), 'editor.css' ],
	[ path.join( root, 'style.css' ), 'style.css' ],
	[ path.join( root, 'extension.js' ), 'extension.js' ],
	[ path.join( root, 'tools/preview/setup.js' ), 'setup.js' ],
] )
	fs.copyFileSync( from, path.join( stage, to ) );
fs.writeFileSync(
	path.join( stage, 'index.html' ),
	'<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><link rel="stylesheet" href="editor.css"><link rel="stylesheet" href="style.css"><style>html,body{height:100%;margin:0}#wpie-root{position:fixed;inset:0}</style></head><body><div id="wpie-root" data-theme="dark"></div><script src="mock.js"></script><script src="setup.js"></script><script src="extension.js"></script></body></html>'
);
const qa = await launchQA( {
	stage,
	locale: 'en_US',
	viewport: { width: 1600, height: 1100 },
	shotDir: out,
	args: [ '--use-gl=swiftshader' ],
} );
const { page, check } = qa;
const results = { out, scenes: [], surfaces: [], controls: [] };
const writePng = ( name, url ) =>
	fs.writeFileSync(
		path.join( out, name + '.png' ),
		Buffer.from( url.split( ',' )[ 1 ], 'base64' )
	);
try {
	await page.waitForFunction(
		() => window.__pca?.engine.allLayers().length > 0
	);
	check(
		( await page.locator( '[data-library-key^="preset:"]' ).count() ) ===
			98,
		'98 editable scene cards'
	);
	check(
		( await page.locator( '[data-library-key^="look:"]' ).count() ) === 16,
		'16 real palette previews'
	);
	check(
		( await page.locator( '[data-library-key^="surface:"]' ).count() ) ===
			8,
		'8 real surface previews'
	);
	for ( const recipe of PREMIUM_SCENE_LABELS ) {
		const r = await page.evaluate( ( id ) => {
			const q = window.__pca;
			q.applyPreset( id );
			const start = performance.now();
			const url = q.engine.still( 960, 640 );
			return {
				url,
				ms: performance.now() - start,
				layers: q.engine.allLayers().length,
				empty: q.engine.allLayers().filter( ( l ) => ! l.rings.length )
					.length,
			};
		}, recipe.id );
		writePng( recipe.id, r.url );
		results.scenes.push( {
			id: recipe.id,
			label: recipe.label,
			ms: r.ms,
			layers: r.layers,
		} );
		check(
			r.layers >= 10 && r.empty === 0,
			recipe.id + ' renders every paper sheet'
		);
	}
	for ( const surface of PAPER_SURFACES ) {
		const r = await page.evaluate( ( id ) => {
			const q = window.__pca;
			q.applyPreset( 'clay-strata' );
			q.params.paper = id;
			q.params.grain = 78;
			q.params.sheen = 80;
			q.params.layers.forEach( ( l ) => ( l.paper = '' ) );
			q.rebuild();
			return q.engine.still( 720, 480 );
		}, surface.id );
		writePng( 'surface-' + surface.id, r );
		results.surfaces.push( { id: surface.id, url: r } );
	}
	check(
		new Set( results.surfaces.map( ( s ) => s.url ) ).size === 8,
		'All eight surfaces produce different image pixels'
	);
	results.surfaces = results.surfaces.map( ( { id } ) => ( { id } ) );
	await page.evaluate( () => window.__pca.applyPreset( 'polar-prism' ) );
	await qa.shot( 'dialog-premium.png' );
	const setting = ( key ) =>
		page.locator( '[data-paper-control="' + key + '"]' );
	for ( const [ key, value ] of [
		[ 'paper', 'foil' ],
		[ 'look', 'copper' ],
	] ) {
		await setting( key ).selectOption( value );
		check(
			await page.evaluate(
				( { key, value } ) => window.__pca.params[ key ] === value,
				{ key, value }
			),
			key + ' select updates scene'
		);
	}
	for ( const key of [
		'thickness',
		'edgeLight',
		'textureScale',
		'sheen',
		'lightY',
	] ) {
		const before = await page.evaluate(
			( key ) => ( {
				value: window.__pca.params[ key ],
				png: window.__pca.engine.still( 400, 280 ),
			} ),
			key
		);
		const control = setting( key );
		await control.focus();
		await control.press( 'Home' );
		await control.press( 'End' );
		const after = await page.evaluate(
			( key ) => ( {
				value: window.__pca.params[ key ],
				png: window.__pca.engine.still( 400, 280 ),
			} ),
			key
		);
		check(
			after.value === 100 && after.png !== before.png,
			key + ' changes actual rendered image'
		);
		await page.evaluate( () => document.activeElement.blur() );
		await page.keyboard.press( 'Control+z' );
		check(
			( await control.inputValue() ) ===
				String( key === 'lightY' ? -100 : 0 ),
			key + ' Undo restores model and visible control'
		);
		results.controls.push( key );
	}
	const sun = page.locator( '.wpiepca-sun' );
	await sun.focus();
	const oldY = await page.evaluate( () => window.__pca.params.lightY );
	await sun.press( 'ArrowDown' );
	check(
		await page.evaluate(
			( old ) => window.__pca.params.lightY === Math.min( 100, old + 4 ),
			oldY
		),
		'Light handle supports vertical keyboard movement'
	);
	await page.evaluate( () => {
		const q = window.__pca;
		q.applyPreset( 'gilded-portal' );
		q.pick( q.params.layers.at( -1 ).objects[ 0 ].id );
	} );
	await setting( 'sheetPaper' ).selectOption( 'linen' );
	await setting( 'sheetElevation' ).focus();
	await setting( 'sheetElevation' ).press( 'Home' );
	check(
		await page.evaluate( () => {
			const l = window.__pca.params.layers.at( -1 );
			return l.paper === 'linen' && l.elevation === 0;
		} ),
		'Selected sheet material and spacing are independent'
	);
	await setting( 'windowAngle' ).focus();
	await setting( 'windowAngle' ).press( 'ArrowRight' );
	check(
		await page.evaluate(
			() =>
				window.__pca.params.layers.at( -1 ).objects[ 0 ].windowAngle ===
				1
		),
		'Aperture rotates independently of the full paper sheet'
	);
	const holes = await page.evaluate( () => {
		const q = window.__pca,
			layer = q.engine.allLayers().at( -1 );
		const c = document.createElement( 'canvas' );
		c.width = 400;
		c.height = 280;
		q.engine.paintLayer( c.getContext( '2d' ), layer, {
			w: 400,
			h: 280,
			baseW: q.engine.w,
		} );
		const data = c.getContext( '2d' ).getImageData( 200, 140, 1, 1 ).data;
		return data[ 3 ];
	} );
	check(
		holes === 0,
		'Material and bevel do not fill the window transparency'
	);
	const saved = await page.evaluate( () =>
		JSON.parse( JSON.stringify( window.__pca.params ) )
	);
	await page.getByRole( 'button', { name: 'Insert', exact: true } ).click();

	await page.waitForFunction( () =>
		window.__dispatched.some( ( a ) => a.type === 'SET_ACTIVE' )
	);
	const inserted = await page.evaluate( () => {
		const adds = window.__dispatched
			.filter( ( a ) => a.type === 'ADD_LAYER' )
			.map( ( a ) => a.layer );
		const group = adds.find( ( l ) => l.generator );
		const children = adds.filter( ( l ) => l.parent === group?.id );
		return {
			id: group?.id,
			generator: group?.generator,
			children: children.length,
			images: children.every( ( l ) =>
				l.src?.startsWith( 'data:image' )
			),
		};
	} );
	check(
		inserted.generator?.id === 'wpie-papercut-art/scene' &&
			inserted.images &&
			inserted.children >= 10,
		'Insert creates an editable group with separate rendered sheets'
	);
	results.inserted = { id: inserted.id, children: inserted.children };
	await page.evaluate( () => {
		const adds = window.__dispatched
			.filter( ( a ) => a.type === 'ADD_LAYER' )
			.map( ( a ) => a.layer );
		window.__editor.state.layers.push( ...adds );
		window.__gen.edit( {
			editor: window.__editor,
			extras: {},
			layer: adds.find( ( l ) => l.generator ),
		} );
	} );
	await page.waitForFunction(
		() => !! window.__pca?.engine.allLayers().length
	);
	check(
		await page.evaluate( ( saved ) => {
			const p = window.__pca.params;
			return (
				[
					'look',
					'paper',
					'thickness',
					'edgeLight',
					'textureScale',
					'sheen',
					'lightY',
				].every( ( k ) => p[ k ] === saved[ k ] ) &&
				p.layers.at( -1 ).paper === 'linen' &&
				p.layers.at( -1 ).elevation === 0 &&
				p.layers.at( -1 ).objects[ 0 ].windowAngle === 1
			);
		}, saved ),
		'Reopen restores all finishes, sheet overrides and aperture angle'
	);
	await page.evaluate( () => {
		window.__dispatched.length = 0;
	} );
	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	await page.waitForFunction( () =>
		window.__dispatched.some( ( a ) => a.type === 'ADD_LAYER' )
	);
	check(
		await page.evaluate(
			( id ) =>
				window.__dispatched.some(
					( a ) => a.type === 'ADD_LAYER' && a.layer.id === id
				),
			inserted.id
		),
		'Update preserves the existing group identity'
	);
	for ( const theme of [ 'dark', 'light' ] ) {
		await page.evaluate( ( theme ) => {
			document.documentElement.dataset.theme = theme;
			document.getElementById( 'wpie-root' ).dataset.theme = theme;
			// ADD_LAYER is recorded by this editor bridge; SET_LAYERS is applied.
			const group = window.__dispatched.find(
				( a ) => a.type === 'ADD_LAYER' && a.layer.generator
			).layer;
			window.__gen.edit( {
				editor: window.__editor,
				extras: {},
				layer: group,
			} );
		}, theme );
		await page.setViewportSize( { width: 1280, height: 800 } );
		await page.waitForTimeout( 200 );
		check(
			await page.evaluate( () =>
				[
					...document.querySelectorAll(
						'.wpiepca-side,.wpiepca-left'
					),
				].every( ( el ) => el.scrollWidth <= el.clientWidth + 1 )
			),
			'No horizontal panel overflow at 1280px in ' + theme
		);
		await page
			.getByLabel( 'Category', { exact: true } )
			.selectOption( 'surfaces' );
		await page.locator( '[data-library-key="surface:foil"]' ).click();
		check(
			await page.evaluate( () => window.__pca.params.paper === 'foil' ),
			'Surface preview card applies material in ' + theme
		);
		await setting( 'paper' ).scrollIntoViewIfNeeded();
		await qa.shot( 'dialog-' + theme + '-1280.png' );
		await page.evaluate( () => window.__pca.close() );
	}
	results.saved = saved;
	fs.writeFileSync(
		path.join( out, 'results.json' ),
		JSON.stringify( results, null, 2 )
	);
	console.log( 'Artifacts: ' + out );
} finally {
	process.exitCode = await qa.finish();
}
