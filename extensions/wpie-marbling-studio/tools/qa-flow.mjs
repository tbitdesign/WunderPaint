/** One offline browser, real editor components, no WordPress writes. Run after build. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { FLOW_EXPERIMENTS } from '../src/fluid/flow-experiments.js';

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
const out = fs.mkdtempSync( '/tmp/wpie-fluid-interactions-' );
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
page.setDefaultTimeout( 30000 );
const errors = [];
page.on( 'pageerror', ( error ) => errors.push( error.message ) );
await page.route( /^https?:/, ( route ) => route.abort() );
const choose = async ( id ) => {
	await page.locator( `[data-experiment="${ id }"]` ).click();
	await page.waitForFunction(
		( value ) => window.__wpieFluidLab.settings.experiment === value,
		id
	);
};
const point = ( x, y, source = true ) =>
	page.evaluate(
		( p ) => {
			const lab = window.__wpieFluidLab;
			const at = p.source
				? lab.renderer.projectSource( p.x, p.y )
				: lab.renderer.projectPoint( p.x, p.y );
			const bounds = lab.canvas.getBoundingClientRect();
			return { x: at.x + bounds.left, y: at.y + bounds.top };
		},
		{ x, y, source }
	);
const clickPoint = async ( x, y, source = true ) => {
	const at = await point( x, y, source );
	await page.mouse.click( at.x, at.y );
};
const sources = () => page.evaluate( () => window.__wpieFluidLab.sim.sources );
const setting = ( key ) => page.locator( `[data-setting="${ key }"]` );
const open = async ( locale = 'en_US' ) => {
	await page.goto(
		file( path.join( out, 'index.html' ) ) + '?locale=' + locale
	);
	await page.waitForFunction(
		() =>
			window.fluidGenerator &&
			window.fluidEditor?.state.colorPanelCommand === 0
	);
	await page.evaluate( () =>
		window.fluidGenerator.run( { editor: window.fluidEditor } )
	);
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
};
try {
	await open();
	const initialTime = await page.evaluate(
		() => window.__wpieFluidLab.sim.time
	);
	await page.waitForFunction(
		( time ) => window.__wpieFluidLab.sim.time > time + 0.1,
		initialTime
	);
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	assert.equal( await page.locator( '[data-experiment]' ).count(), 80 );
	assert.equal( await page.locator( '[data-material]' ).count(), 18 );
	await page.waitForFunction( () =>
		document.querySelector( '[data-experiment] canvas[data-ready]' )
	);
	assert.ok(
		( await page
			.locator( '[data-experiment] canvas[data-ready]' )
			.count() ) < 20,
		'offscreen recipes are not eagerly simulated'
	);
	await page.locator( '[data-experiment]' ).last().scrollIntoViewIfNeeded();
	await page.waitForFunction(
		() =>
			[ ...document.querySelectorAll( '[data-experiment] canvas' ) ].at(
				-1
			).dataset.ready === 'true'
	);
	assert.ok(
		( await page
			.locator( '[data-experiment] canvas[data-ready]' )
			.count() ) < 30
	);
	console.log(
		'PASS continuous simulation and lazy thumbnails after scrolling'
	);

	await choose( 'ink_whirlpool' );
	assert.equal(
		await page.evaluate( () => window.__wpieFluidLab.settings.boundary ),
		'closed',
		'new water-tank recipes retain their carrier liquid'
	);
	await page.locator( '[data-tool="rotor"]' ).click();
	await clickPoint( 0.5, 0.5 );
	await setting( 'sourceSpin' ).selectOption( '-1' );
	assert.equal( ( await sources() )[ 0 ].spin, -1 );
	const from = await point( 0.5, 0.5 ),
		to = await point( 0.64, 0.59 );
	await page.mouse.move( from.x, from.y );
	await page.mouse.down();
	await page.mouse.move( to.x, to.y, { steps: 7 } );
	await page.mouse.up();
	assert.ok( Math.abs( ( await sources() )[ 0 ].x - 0.64 ) < 0.025 );
	await page.locator( '[data-tool="jet"]' ).click();
	await clickPoint( 0.26, 0.35 );
	await setting( 'sourceAngle' ).press( 'End' );
	const jet = ( await sources() ).find( ( s ) => s.type === 'jet' );
	assert.equal( jet.angle, 180 );
	assert.ok( Math.abs( jet.x - 0.26 ) < 0.025 );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		const saved = lab.save();
		lab.restore( saved );
		if ( JSON.stringify( lab.save() ) !== JSON.stringify( saved ) )
			throw Error( 'source save mismatch' );
	} );
	await page.locator( '[data-tool="removeSource"]' ).click();
	await clickPoint( jet.x, jet.y );
	assert.equal( ( await sources() ).length, 1 );
	console.log(
		'PASS source placement, selection, dragging, direction, save and removal'
	);

	await choose( 'ink_plume' );
	await setting( 'inkDensity' ).press( 'End' );
	assert.equal(
		await page.evaluate( () => window.__wpieFluidLab.settings.inkDensity ),
		1.8
	);
	await setting( 'vorticity' ).press( 'End' );
	assert.equal(
		await page.evaluate( () => window.__wpieFluidLab.settings.vorticity ),
		1
	);
	for ( const material of [ 'ink', 'glycerin' ] ) {
		await page.locator( `[data-material="${ material }"]` ).click();
		const mass = () =>
			page.evaluate(
				( key ) =>
					window.__wpieFluidLab.sim[ key ].reduce(
						( a, b ) => a + b,
						0
					),
				material
			);
		const before = await mass();
		await clickPoint( 0.45, 0.5, false );
		assert.ok(
			( await mass() ) > before,
			material + ' is added by the actual pipette'
		);
	}
	await setting( 'glycerinViscosity' ).press( 'End' );
	assert.equal(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.glycerinViscosity
		),
		30
	);
	const wheel = page.locator( '.wpiemb-pigment-wheel .cw' );
	await wheel.scrollIntoViewIfNeeded();
	const wheelBox = await wheel.boundingBox();
	const oldColor = await page.evaluate(
		() => window.__wpieFluidLab.settings.colors.glycerin
	);
	await page.mouse.click(
		wheelBox.x + wheelBox.width * 0.6,
		wheelBox.y + wheelBox.height * 0.4
	);
	assert.notEqual(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.colors.glycerin
		),
		oldColor
	);
	const bathRow = page
		.locator( '.dsm-rowline' )
		.filter( { hasText: /^Bath color/ } );
	await bathRow.locator( '.wpie-color-swatch button' ).click();
	await page.locator( '.global-color-panel' ).waitFor();
	const bathBefore = await page.evaluate(
		() => window.__wpieFluidLab.settings.bath
	);
	const bathWheel = await page
		.locator( '.global-color-panel .cw' )
		.boundingBox();
	await page.mouse.click(
		bathWheel.x + bathWheel.width * 0.65,
		bathWheel.y + bathWheel.height * 0.4
	);
	assert.notEqual(
		await page.evaluate( () => window.__wpieFluidLab.settings.bath ),
		bathBefore
	);
	await page.keyboard.press( 'Escape' );
	await page.waitForFunction(
		() => ! document.querySelector( '.global-color-panel' )
	);
	assert.equal( await page.locator( '.wpiemb-lab-dialog' ).count(), 1 );
	console.log(
		'PASS solution controls, pipettes and both real core color pickers'
	);
	const downloadEvent = page.waitForEvent( 'download' );
	await page.locator( '[data-action="save"]' ).click();
	const download = await downloadEvent;
	const savedPath = await download.path();
	const savedFile = JSON.parse( fs.readFileSync( savedPath, 'utf8' ) );
	assert.equal( savedFile.snapshot.version, 3 );
	await choose( 'surface_jets' );
	await page.locator( '.wpiemb-lab-file' ).setInputFiles( savedPath );
	await page.waitForFunction(
		() => window.__wpieFluidLab.settings.experiment === 'ink_plume'
	);
	assert.deepEqual(
		await page.evaluate( () => window.__wpieFluidLab.save() ),
		{ settings: savedFile.settings, snapshot: savedFile.snapshot }
	);
	console.log( 'PASS real experiment-file download and exact reopening' );

	const shots = [];
	for ( const recipe of FLOW_EXPERIMENTS ) {
		await choose( recipe.id );
		const images = await page.evaluate( () => {
			const lab = window.__wpieFluidLab;
			const draw = () => {
				lab.renderer.update( lab.settings );
				return lab.renderer.still( 480, 360, 'wet' ).toDataURL();
			};
			const before = draw();
			const saved = lab.save();
			lab.restore( saved );
			if ( JSON.stringify( lab.save() ) !== JSON.stringify( saved ) )
				throw Error( 'state mismatch' );
			for ( let k = 0; k < 100; k++ ) lab.sim.step( lab.settings );
			const after = draw();
			const top = lab.renderer.still( 480, 360, 'print' ).toDataURL();
			return { before, after, top };
		} );
		assert.notEqual(
			images.before,
			images.after,
			recipe.id + ' visibly evolves'
		);
		assert.notEqual(
			images.after,
			images.top,
			recipe.id + ' supports both export views'
		);
		for ( const [ name, data ] of Object.entries( images ) ) {
			fs.writeFileSync(
				path.join( out, recipe.id + '-' + name + '.png' ),
				Buffer.from( data.split( ',' )[ 1 ], 'base64' )
			);
		}
		shots.push( { label: recipe.label, ...images } );
	}
	console.log(
		'PASS all six new experiments: evolution, exact saves and both render views'
	);
	await choose( 'surface_jets' );
	await setting( 'boundary' ).selectOption( 'open' );
	await choose( 'islands' );
	assert.equal(
		await page.evaluate( () => window.__wpieFluidLab.settings.boundary ),
		'open',
		'existing recipes still keep the edge preference'
	);
	await choose( 'surface_jets' );
	assert.equal(
		await page.locator( '[data-material="ink"]' ).isVisible(),
		false
	);
	await page.locator( '[data-tool="jet"]' ).click();
	await clickPoint( 0.25, 0.4 );
	await setting( 'sourceAngle' ).press( 'Home' );
	assert.equal( ( await sources() )[ 0 ].angle, -180 );
	await page.keyboard.press( 'Escape' );
	await page.waitForFunction( () => ! window.__wpieFluidLab );
	assert.equal( await page.locator( '.wpiemb-lab-dialog' ).count(), 0 );
	console.log( 'PASS surface source controls and complete dialog cleanup' );

	await page.setViewportSize( { width: 1280, height: 900 } );
	await open( 'de_DE' );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	await choose( 'ink_plume' );
	assert.equal(
		await page.locator( '[data-material="ink"]' ).textContent(),
		'Dichte Tinte'
	);
	await setting( 'inkDensity' ).scrollIntoViewIfNeeded();
	assert.ok(
		( await setting( 'inkDensity' ).getAttribute( 'aria-label' ) ).includes(
			'Tinte'
		)
	);
	await page.screenshot( { path: path.join( out, 'dialog-de-1280.png' ) } );
	await page.evaluate( () => window.__wpieFluidLab.close() );
	assert.deepEqual( errors, [] );
	await page.setViewportSize( { width: 1450, height: 820 } );
	await page.evaluate( ( rows ) => {
		document.body.innerHTML =
			'<div id="gallery" style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px;background:#24272d;color:white;font:14px sans-serif"></div>';
		for ( const row of rows ) {
			const card = document.createElement( 'div' );
			card.innerHTML =
				'<div>' +
				row.label +
				' · after 100 steps</div><img style="width:100%" src="' +
				row.after +
				'">';
			document.getElementById( 'gallery' ).append( card );
		}
	}, shots );
	await page
		.locator( '#gallery' )
		.screenshot( { path: path.join( out, 'experiments.png' ) } );
	console.log(
		'PASS German layout and zero browser exceptions. Screenshots: ' + out
	);
} catch ( error ) {
	await page.screenshot( { path: path.join( out, 'failure.png' ) } );
	console.error( 'Browser exceptions:', errors, 'Artifacts:', out );
	throw error;
} finally {
	await browser.close();
}
