/** Actual Brush ColorWheel and mount adapter, real extension/WebGL, mock editor. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
if (
	execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( line ) =>
				! /^\s*Z/.test( line ) &&
				/chrome|chromium|headless_shell/.test( line )
		)
) {
	throw Error( 'Another headless browser is running.' );
}
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const repo = path.resolve( root, '../..' );
const stage = await buildStage( {
	root,
	out: path.join( root, 'dist/qa-obstacle-shapes-stage' ),
} );
const { build } = await import(
	path.join( root, 'node_modules/esbuild/lib/main.js' )
);
await build( {
	stdin: {
		contents:
			"import { importObstacleLayer } from './extensions/wpie-marbling-studio/src/fluid/obstacle-import.js'; window.__importObstacleLayer=importObstacleLayer; import { renderToCanvas } from './src/lib/raster/render.js'; import { makeShape, makeText, makeGroup } from './src/store/document.js'; window.__factories={makeShape,makeText,makeGroup}; window.WPIE.bridge.raster.renderToCanvas=renderToCanvas; import { mountColorWheel } from './src/lib/mount-color-wheel.js'; window.__actualColorWheelMount = mountColorWheel; window.WPIE.bridge.components.mountColorWheel = mountColorWheel;",
		resolveDir: repo,
		sourcefile: 'actual-wheel-entry.js',
	},
	bundle: true,
	format: 'iife',
	jsx: 'automatic',
	outfile: path.join( stage, 'actual-wheel.js' ),
	minify: true,
	define: { 'process.env.NODE_ENV': '"production"' },
	alias: {
		'@wordpress/i18n': path.join(
			repo,
			'tools/template-generator/tools/stubs/i18n.js'
		),
	},
} );
const html = path.join( stage, 'index.html' );
fs.writeFileSync(
	html,
	fs
		.readFileSync( html, 'utf8' )
		.replace(
			'<script src="extension.js">',
			'<script src="actual-wheel.js"></script>\n<script src="extension.js">'
		)
);
const qa = await launchQA( {
	stage,
	locale: 'de_DE',
	shotDir: path.join( root, 'dist' ),
} );
const { page, check } = qa;
page.on( 'console', ( m ) => {
	if ( m.type() === 'error' ) check( false, m.text() );
} );
const setting = async ( key, value ) =>
	page.locator( `[data-setting="${ key }"]` ).evaluate( ( el, v ) => {
		el.value = v;
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}, String( value ) );
const location = async ( x, y, z ) =>
	page.evaluate(
		( { x, y, z } ) => {
			const l = window.__wpieFluidLab,
				r = l.canvas.getBoundingClientRect(),
				p = l.renderer.projectPoint( x, y, z );
			return { x: p.x + r.left, y: p.y + r.top };
		},
		{ x, y, z }
	);
const clickAt = async ( x, y, z ) => {
	const p = await location( x, y, z );
	await page.mouse.click( p.x, p.y );
};
let exitCode = 1;
try {
	await page.evaluate( () => {
		const { makeShape, makeText, makeGroup } = window.__factories;
		const heart = makeShape( {
			name: 'Canvas heart',
			shape: 'heart',
			x: 350,
			y: 220,
			w: 400,
			h: 400,
			fill: '#ee3377',
		} );
		heart.id = 'heart';
		heart.parent = 'group';
		const letter = makeText( {
			name: 'Letter O',
			text: 'O',
			fontFamily: 'Arial',
			fontSize: 320,
			x: 250,
			y: 200,
			w: 500,
			h: 420,
			color: '#000000',
		} );
		letter.id = 'letter';
		const group = makeGroup( { name: 'Group', children: [ 'heart' ] } );
		group.id = 'group';
		window.__editor.state.layers = [ group, heart, letter ];
		window.__editor.state.activeId = 'heart';
		window.__editor.state.doc.bg = '#ffffff';
	} );
	check(
		await page.evaluate( async () => {
			const { makeShape } = window.__factories,
				base = makeShape( {
					shape: 'rect',
					x: 300,
					y: 200,
					w: 200,
					h: 200,
				} ),
				clipped = makeShape( {
					shape: 'rect',
					x: 100,
					y: 200,
					w: 600,
					h: 200,
				} );
			clipped.clipped = true;
			const loops = await window.__importObstacleLayer(
				window.WPIE.bridge,
				{
					doc: { w: 1000, h: 800, bg: '#fff' },
					layers: [ base, clipped ],
				},
				clipped.id
			);
			const ys = loops.flat().map( ( p ) => p[ 1 ] );
			return Math.max( ...ys ) - Math.min( ...ys ) > 0.95;
		} ),
		'Canvas clipping masks limit the imported silhouette without importing their base'
	);
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.pause();
		l.choose( 'blank', 17 );
		l.pause();
		l.settings.angle = 0;
		l.renderer.update( l.settings );
	} );
	await page.locator( '[data-tool="wall"]' ).click();
	await page
		.locator( '[data-setting="obstacleShape"]' )
		.selectOption( 'heart' );
	await clickAt( 0.5, 0.5 );
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.sim.customObstacles.items[ 0 ]?.shape ===
				'heart'
		),
		'Pointer places an actual heart'
	);
	await setting( 'obstacleSize', 0.36 );
	await setting( 'obstacleAngle', 32 );
	const before = await page.evaluate( () => ( {
		...window.__wpieFluidLab.sim.customObstacles.items[ 0 ],
	} ) );
	const a = await location( 0.5, 0.5 ),
		b = await location( 0.6, 0.52 );
	await page.mouse.move( a.x, a.y );
	await page.mouse.down();
	await page.mouse.move( b.x, b.y, { steps: 4 } );
	await page.mouse.up();
	check(
		await page.evaluate(
			() =>
				Math.abs(
					window.__wpieFluidLab.sim.customObstacles.items[ 0 ].x - 0.6
				) < 0.015
		),
		'Dragging preserves shape and changes position'
	);
	check(
		before.size === 0.36 && before.angle === 32,
		'Size and rotation controls update the collision model'
	);
	const wheel = page.locator( '.wpiemb-side .cw-sq' ).first();
	check(
		( await page.locator( '.wpiemb-side .cw' ).count() ) > 0,
		'Real Brush color wheel mounts for obstacles'
	);
	await wheel.scrollIntoViewIfNeeded();
	const sv = await wheel.boundingBox();
	if ( sv )
		await page.mouse.click(
			sv.x + sv.width * 0.8,
			sv.y + sv.height * 0.12
		);
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.sim.customObstacles.items[ 0 ].color !==
				'#647884'
		),
		'Wheel recolors the selected form'
	);
	await page
		.locator( '[data-setting="obstacleLayer"]' )
		.selectOption( 'heart' );
	await page.locator( '[data-action="import-obstacle"]' ).click();
	await page.waitForFunction(
		() => window.__wpieFluidLab.sim.customObstacles.assets.length === 1
	);
	await clickAt( 0.3, 0.5 );
	check(
		await page.evaluate( () =>
			window.__wpieFluidLab.sim.customObstacles.items.some(
				( o ) => o.shape === 'layer-1'
			)
		),
		'Nested canvas shape imports through the actual renderer with a white document background'
	);
	await page
		.locator( '[data-setting="obstacleLayer"]' )
		.selectOption( 'letter' );
	await page.locator( '[data-action="import-obstacle"]' ).click();
	await page.waitForFunction(
		() => window.__wpieFluidLab.sim.customObstacles.assets.length === 2
	);
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.sim.customObstacles.assets[ 1 ].loops
					.length >= 2
		),
		'Real text renderer preserves the hole of O'
	);
	await clickAt( 0.8, 0.35 );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.sim.drop( 0.5, 0.5, 0.38, 'oil', '#f71a65', 0.9 );
		l.renderer.update( l.settings );
		l.renderer.render();
	} );
	await qa.shot( 'qa-obstacle-shapes-surface.png' );
	check(
		await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			const s = l.save(),
				pixels = l.renderer.still( 700, 525, 'print' ).toDataURL();
			l.restore( s );
			l.pause();
			return (
				l.sim.customObstacles.items.length === 3 &&
				l.sim.customObstacles.assets.length === 2 &&
				pixels.length > 5000
			);
		} ),
		'Forms, transforms, imported contours and export survive reopening'
	);
	await page.locator( '[data-tool="wall"]' ).click();
	await page.locator( '[data-tool="draw"]' ).click();
	await page
		.locator( '[data-setting="obstacleShape"]' )
		.selectOption( 'circle' );
	const p0 = await location( 0.2, 0.75 ),
		p1 = await location( 0.4, 0.75 );
	await page.mouse.move( p0.x, p0.y );
	await page.mouse.down();
	await page.mouse.move( p1.x, p1.y, { steps: 5 } );
	await page.mouse.up();
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.customObstacles.items.length > 5
		),
		'Dragging paints colored obstacle stamps'
	);
	await page.locator( '[data-tool="wall"]' ).click();
	await page
		.locator( '[data-setting="selectedObstacle"]' )
		.selectOption( '1' );
	const n = await page.evaluate(
		() => window.__wpieFluidLab.sim.customObstacles.items.length
	);
	await page.locator( '[data-action="remove-obstacle"]' ).click();
	check(
		await page.evaluate(
			( n ) =>
				window.__wpieFluidLab.sim.customObstacles.items.length ===
				n - 1,
			n
		),
		'Selected form can be removed'
	);
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.choose( 'volume_oil_mix', 17 );
		l.pause();
		l.settings.volumeAngle = 0;
		l.renderer.update( l.settings );
	} );
	await page.locator( '[data-tool="wall"]' ).click();
	await page
		.locator( '[data-setting="obstacleShape"]' )
		.selectOption( 'ring' );
	await setting( 'obstacleSize', 0.45 );
	await clickAt( 0.5, 0.5, 0 );
	check(
		await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			l.renderer.update( l.settings );
			return (
				l.sim.customObstacles.items[ 0 ]?.shape === 'ring' &&
				l.renderer.volume.customObstacles.meshes.size === 1
			);
		} ),
		'Deep bath renders the actual ring mesh'
	);
	await page.locator( '[data-view="perspective"]' ).click();
	await qa.shot( 'qa-obstacle-shapes-deep.png' );
	check(
		await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			const canvas = l.renderer.still( 700, 525, 'wet' );
			return (
				canvas.width === 700 &&
				canvas.height === 525 &&
				canvas.toDataURL().length > 5000
			);
		} ),
		'Wet export includes deep shapes at full output size'
	);
	await page.evaluate( () => {
		window.__wpieFluidLab.close();
	} );
	exitCode = await qa.finish();
} finally {
	await qa.browser.close();
}
process.exitCode = exitCode;
