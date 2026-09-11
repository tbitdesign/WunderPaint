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
	out: path.join( root, 'dist/qa-indicator-stage' ),
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
const render = ( output = 'print' ) =>
	page.evaluate( ( output ) => {
		const l = window.__wpieFluidLab;
		l.renderer.update( l.settings );
		return l.renderer.still( 300, 225, output ).toDataURL();
	}, output );
const select = async ( id ) => {
	await page.locator( `[data-indicator-state="${ id }"]` ).click();
	check(
		( await page.locator( '.wpiemb-pigment-wheel .cw' ).count() ) === 1,
		`${ id }: one shared color wheel`
	);
};
const pick = async ( hue ) => {
	const wheel = page.locator( '.wpiemb-pigment-wheel .cw' );
	await wheel.scrollIntoViewIfNeeded();
	const b = await wheel.boundingBox(),
		angle = hue * Math.PI * 2,
		r = ( b.width / 2 - 1 ) * 0.925;
	await page.mouse.click(
		b.x + b.width / 2 + Math.cos( angle ) * r,
		b.y + b.height / 2 + Math.sin( angle ) * r
	);
	const sq = await page
		.locator( '.wpiemb-pigment-wheel .cw-sq' )
		.boundingBox();
	await page.mouse.click( sq.x + sq.width * 0.85, sq.y + sq.height * 0.12 );
};
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.pause();
		l.choose( 'blank', 17 );
		l.pause();
		l.sim.indicator.fill( 0.9 );
		for ( let i = 0; i < l.sim.n; i++ ) {
			const x = ( i % l.sim.w ) / l.sim.w;
			l.sim.acid[ i ] = x < 0.33 ? 1 : 0;
			l.sim.base[ i ] = x > 0.66 ? 1 : 0;
		}
	} );
	await page.locator( '[data-fluid-palette="chemistry"]' ).click();
	await page.locator( '[data-material="indicator"]' ).click();
	check(
		( await page.locator( '[data-indicator-state]' ).count() ) === 3,
		'Three labeled states are available'
	);
	const legacy = await render();
	const original = await page.evaluate(
		() => window.__wpieFluidLab.sim.snapshot().data
	);
	const chosen = {};
	for ( const [ id, hue ] of [
		[ 'acid', 0.9 ],
		[ 'neutral', 0.74 ],
		[ 'base', 0.48 ],
	] ) {
		await select( id );
		await pick( hue );
		chosen[ id ] = await page.evaluate(
			( id ) => window.__wpieFluidLab.settings.indicatorColors[ id ],
			id
		);
	}
	check(
		new Set( Object.values( chosen ) ).size === 3,
		'All three states accept independent colors from the actual wheel'
	);
	check(
		await page.evaluate(
			( data ) => window.__wpieFluidLab.sim.snapshot().data === data,
			original
		),
		'Editing existing indicator colors changes no simulation field'
	);
	const colored = await render();
	check(
		colored !== legacy,
		'Custom palette changes the exported existing indicator ink'
	);
	const beforeSwitch = await page.evaluate( () =>
		window.__wpieFluidLab.save()
	);
	await page.locator( '[data-material="acid"]' ).click();
	check(
		( await page.locator( '.wpiemb-pigment-wheel .cw' ).count() ) === 0,
		'Acid remains a clear reagent'
	);
	await page.locator( '[data-material="base"]' ).click();
	check(
		( await page.locator( '.wpiemb-pigment-wheel .cw' ).count() ) === 0,
		'Base remains a clear reagent'
	);
	await page.locator( '[data-material="indicator"]' ).click();
	check(
		await page.evaluate(
			( colors ) =>
				JSON.stringify(
					window.__wpieFluidLab.settings.indicatorColors
				) === JSON.stringify( colors ),
			chosen
		),
		'Material switching preserves every indicator color'
	);
	await page.locator( '[data-action="resetIndicatorColors"]' ).click();
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.indicatorColors === null
		),
		'Reset restores the original palette mode'
	);
	check(
		( await render() ) === legacy,
		'Reset exactly restores the original surface export'
	);
	await page.evaluate( ( saved ) => {
		const l = window.__wpieFluidLab;
		l.restore( saved );
		l.pause();
	}, beforeSwitch );
	check(
		( await render() ) === colored,
		'Save and reopen reproduce the custom surface export exactly'
	);
	const normalWet = await render( 'wet' );
	await page.locator( '[data-setting="fluorescence"]' ).fill( '0.8' );
	await page
		.locator( '[data-setting="fluorescence"]' )
		.dispatchEvent( 'input' );
	check(
		( await render( 'wet' ) ) !== normalWet,
		'Fluorescence illuminates the custom indicator colors'
	);
	// Use the real 3D simulation and renderer with three reagent regions.
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.choose( 'volume_clouds', 17 );
		l.pause();
		l.sim.clear();
		l.sim.fill( 0.2 );
		for ( let i = 0; i < l.sim.count; i++ ) {
			const x = l.sim.x[ i ] / l.sim.aspect;
			l.sim.indicator[ i ] = 0.9;
			l.sim.acid[ i ] = x < 0.33 ? 1 : 0;
			l.sim.base[ i ] = x > 0.66 ? 1 : 0;
		}
		l.settings.material = 'indicator';
		l.settings.fluorescence = 0.8;
		l.settings.volumeAngle = 0;
		l.restore( l.save() );
		l.pause();
	} );
	check(
		( await page.locator( '[data-indicator-state]' ).count() ) === 3,
		'Deep baths expose the same three palette controls'
	);
	const deepLegacy = await render( 'wet' );
	const deepBefore = await page.evaluate(
		() => window.__wpieFluidLab.sim.snapshot().data
	);
	// Change settings immediately before export, without stepping the simulation.
	await page.evaluate( ( colors ) => {
		window.__wpieFluidLab.settings.indicatorColors = colors;
	}, chosen );
	const deepColor = await render( 'wet' );
	check(
		deepColor !== deepLegacy,
		'Deep export immediately picks up new colors without a simulation step'
	);
	const deepSaved = await page.evaluate( () => window.__wpieFluidLab.save() );
	await page.evaluate( ( s ) => {
		const l = window.__wpieFluidLab;
		l.restore( s );
		l.pause();
	}, deepSaved );
	check(
		( await render( 'wet' ) ) === deepColor,
		'Reopening preserves custom deep indicator colors and fluorescence'
	);
	check(
		await page.evaluate(
			( data ) => window.__wpieFluidLab.sim.snapshot().data === data,
			deepBefore
		),
		'Deep recoloring and export preserve reagent and particle state'
	);
	await page.locator( '[data-action="resetIndicatorColors"]' ).click();
	check(
		( await render( 'wet' ) ) === deepLegacy,
		'Reset exactly restores the legacy deep palette'
	);
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		( await page.locator( '.cw' ).count() ) === 0,
		'Closing unmounts the color wheel'
	);
	exitCode = await qa.finish();
} catch ( error ) {
	console.error( error );
	await qa.finish();
}
process.exit( exitCode );
