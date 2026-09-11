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
	out: path.join( root, 'dist/qa-obstacle-polish-stage' ),
} );
const { build } = await import(
	path.join( root, 'node_modules/esbuild/lib/main.js' )
);
await build( {
	stdin: {
		contents:
			"import { mountColorWheel } from './src/lib/mount-color-wheel.js'; window.__actualColorWheelMount = mountColorWheel; window.WPIE.bridge.components.mountColorWheel = mountColorWheel;",
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
let exitCode = 1;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.pause();
		l.choose( 'blank', 17 );
		l.pause();
		l.settings.angle = 45;
		l.settings.bath = '#dbe7ea';
		l.sim.obstacle( 0.5, 0.5, 0.14 );
		l.renderer.update( l.settings );
		l.renderer.render();
	} );
	await page.locator( '[data-tool="wall"]' ).click();
	const layout = await page.evaluate( () => {
		const grid = document.querySelector(
			'[data-tool-group="apply"] .wpiemb-lab-tool-grid'
		);
		const labels = [ 'removeSource', 'erase' ].map( ( id ) => {
			const span = document.querySelector(
					`.wpiemb-lab-tool-deck [data-tool="${ id }"] b`
				),
				style = getComputedStyle( span );
			return {
				text: span.textContent,
				line: parseFloat( style.lineHeight ),
				font: parseFloat( style.fontSize ),
				clipped:
					span.scrollHeight > span.clientHeight ||
					span.scrollWidth > span.clientWidth,
			};
		} );
		return {
			columns:
				getComputedStyle( grid ).gridTemplateColumns.split( ' ' )
					.length,
			labels,
		};
	} );
	check(
		layout.columns === 2,
		'Fluid Lab tools use two columns per group at desktop width'
	);
	check(
		layout.labels.every( ( l ) => l.line <= l.font * 1.25 && ! l.clipped ),
		'Remove source and Remove obstacle have compact, readable labels'
	);
	const state = await page.evaluate( () => window.__wpieFluidLab.save() );
	await qa.shot( 'qa-obstacle-polish-surface.png' );
	const newImage = await page.evaluate( () =>
		window.__wpieFluidLab.renderer.still( 600, 450 ).toDataURL()
	);
	const originalImage = await page.evaluate( () => {
		const l = window.__wpieFluidLab,
			surface = l.renderer.obstacleSurface,
			update = surface.update;
		// Reproduce the exact old binary relief without changing any simulation data.
		const coverage = l.sim.wall.slice();
		l.sim.wall.forEach( ( value, i ) => {
			l.sim.wall[ i ] = value > 0.5 ? 1 : 0;
		} );
		surface.update = function ( wall ) {
			this.relief.set( wall );
		};
		l.renderer.update( l.settings );
		const result = l.renderer.still( 600, 450 ).toDataURL();
		l.sim.wall.set( coverage );
		surface.update = update;
		surface.source.fill( -1 );
		return result;
	} );
	check(
		newImage !== originalImage,
		'Rounded relief changes the old grid highlights'
	);
	fs.writeFileSync(
		path.join( root, 'dist/qa-obstacle-surface-before.png' ),
		Buffer.from( originalImage.split( ',' )[ 1 ], 'base64' )
	);
	fs.writeFileSync(
		path.join( root, 'dist/qa-obstacle-surface-after.png' ),
		Buffer.from( newImage.split( ',' )[ 1 ], 'base64' )
	);
	await page.evaluate( ( saved ) => {
		const l = window.__wpieFluidLab;
		l.restore( saved );
		l.pause();
	}, state );
	check(
		( await page.evaluate( () =>
			window.__wpieFluidLab.renderer.still( 600, 450 ).toDataURL()
		) ) === newImage,
		'Reopening produces the same smoothed obstacle'
	);
	check(
		await page.evaluate(
			( data ) => window.__wpieFluidLab.sim.snapshot().data === data,
			state.snapshot.data
		),
		'Rendering and reopening preserve the original collision mask'
	);
	await page.setViewportSize( { width: 1100, height: 780 } );
	check(
		( await page.evaluate(
			() =>
				getComputedStyle(
					document.querySelector(
						'[data-tool-group="apply"] .wpiemb-lab-tool-grid'
					)
				).gridTemplateColumns.split( ' ' ).length
		) ) === 1,
		'The narrower panel also keeps one application-tool column'
	);
	await page.setViewportSize( { width: 1500, height: 1000 } );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.sim.obstacle( 0.5, 0.5, 0.14, true );
		l.renderer.update( l.settings );
	} );
	check(
		await page.evaluate( () =>
			window.__wpieFluidLab.renderer.obstacleSurface.relief.every(
				( x ) => x === 0
			)
		),
		'Removing the obstacle also clears the rounded relief'
	);
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.choose( 'volume_clouds', 17 );
		l.pause();
		l.sim.clear();
		l.sim.fill( 0.14 );
		l.sim.obstacle( 0.5, 0.5, 0.14 );
		l.settings.volumeAngle = 55;
		l.settings.bath = '#dbe7ea';
		l.settings.boundary = 'closed';
		l.settings.tool = 'wall';
		l.restore( l.save() );
		l.pause();
		l.renderer.update( l.settings );
		l.renderer.render();
	} );
	const deep = await page.evaluate( () => {
		const l = window.__wpieFluidLab,
			geometry = l.renderer.volume.obstacles.geometry;
		return {
			type: geometry.type,
			segments: geometry.parameters.segments,
			finite: Array.from( geometry.attributes.normal.array ).every(
				Number.isFinite
			),
			count: l.renderer.volume.obstacles.count,
		};
	} );
	check(
		deep.type === 'LatheGeometry' &&
			deep.segments === 64 &&
			deep.finite &&
			deep.count === 1,
		'Deep obstacles use a smooth round profile with rounded lips and finite normals'
	);
	await qa.shot( 'qa-obstacle-polish-deep.png' );
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		! ( await page.evaluate( () => !! window.__wpieFluidLab ) ),
		'Closing disposes the preview and its obstacle geometry'
	);
	exitCode = await qa.finish();
} catch ( error ) {
	console.error( error );
	await qa.finish();
}
process.exit( exitCode );
