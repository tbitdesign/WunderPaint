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
	out: path.join( root, 'dist/qa-fluorescence-stage' ),
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
	} );
	for ( const id of [
		'water',
		'oil',
		'thick',
		'metal',
		'alcohol',
		'surfactant',
		'ferro',
		'silicone',
		'wax',
	] ) {
		await page.locator( `[data-material="${ id }"]` ).click();
		check(
			( await page.locator( '.wpiemb-pigment-wheel .cw' ).count() ) === 1,
			`${ id }: actual Brush color wheel available`
		);
	}
	await page.locator( '[data-material="ferro"]' ).click();
	const wheel = page.locator( '.wpiemb-pigment-wheel .cw' );
	await wheel.scrollIntoViewIfNeeded();
	const b = await wheel.boundingBox(),
		angle = 0.9 * Math.PI * 2,
		r = ( b.width / 2 - 1 ) * 0.925;
	await page.mouse.click(
		b.x + b.width / 2 + Math.cos( angle ) * r,
		b.y + b.height / 2 + Math.sin( angle ) * r
	);
	const sq = await page
		.locator( '.wpiemb-pigment-wheel .cw-sq' )
		.boundingBox();
	await page.mouse.click( sq.x + sq.width * 0.8, sq.y + sq.height * 0.1 );
	const pigment = await page.evaluate(
		() => window.__wpieFluidLab.settings.colors.ferro
	);
	check(
		pigment !== '#181c24',
		'Ferrofluid wheel selects an artistic pigment'
	);
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.settings.light = 0.2;
		l.settings.bath = '#080a18';
		l.settings.angle = 0;
		l.sim.drop( 0.5, 0.5, 0.25, 'ferro', l.settings.colors.ferro, 0.9 );
		l.renderer.update( l.settings );
		l.renderer.render();
	} );
	const glow = page.locator( '[data-setting="fluorescence"]' );
	await glow.fill( '0.8' );
	await glow.dispatchEvent( 'input' );
	const state = await page.evaluate( () => window.__wpieFluidLab.save() );
	check(
		state.settings.fluorescence === 0.8,
		'Fluorescence control updates saved settings'
	);
	await page.evaluate( ( s ) => {
		const l = window.__wpieFluidLab;
		l.restore( s );
		l.pause();
	}, state );
	check(
		await page.evaluate( ( c ) => {
			const l = window.__wpieFluidLab;
			return (
				l.settings.colors.ferro === c && l.settings.fluorescence === 0.8
			);
		}, pigment ),
		'Reopening preserves ferro pigment and fluorescence'
	);
	const renderComparison = async ( kind, print = false ) =>
		page.evaluate(
			( { kind, print } ) => {
				const l = window.__wpieFluidLab,
					before = l.sim.snapshot().data;
				const capture = ( intensity ) => {
					l.settings.fluorescence = intensity;
					l.renderer.update( l.settings );
					const c = l.renderer.still(
						400,
						300,
						print ? 'print' : 'wet'
					);
					return c
						.getContext( '2d' )
						.getImageData( 0, 0, c.width, c.height ).data;
				};
				const a = capture( 0 ),
					b = capture( 1 );
				let changed = 0,
					gain = 0,
					alpha = 0;
				for ( let i = 0; i < a.length; i += 4 ) {
					const diff =
						b[ i ] +
						b[ i + 1 ] +
						b[ i + 2 ] -
						a[ i ] -
						a[ i + 1 ] -
						a[ i + 2 ];
					if ( Math.abs( diff ) > 6 ) changed++;
					gain += diff;
					alpha += Math.abs( a[ i + 3 ] - b[ i + 3 ] );
				}
				return {
					kind,
					changed,
					gain,
					alpha,
					stable: before === l.sim.snapshot().data,
				};
			},
			{ kind, print }
		);
	const flat = await renderComparison( 'surface' );
	check(
		flat.changed > 200 &&
			flat.gain > 5000 &&
			flat.stable &&
			flat.alpha === 0,
		'Surface fluorescence changes exported radiance, preserves geometry/opacity and simulation'
	);
	console.log( JSON.stringify( flat ) );
	const print = await renderComparison( 'flat pigment print', true );
	check(
		print.changed === 0 && print.stable,
		'Flat pigment output retains pigment colors without surface lighting'
	);
	const blank = await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.sim.clear();
		const render = ( fluorescence ) => {
			l.settings.fluorescence = fluorescence;
			l.renderer.update( l.settings );
			return l.renderer.still( 100, 75 ).toDataURL();
		};
		return render( 0 ) === render( 1 );
	} );
	check( blank, 'An empty bath does not glow' );
	for ( const preset of [
		'volume_clouds',
		'volume_silicone',
		'volume_wax',
	] ) {
		await page.evaluate( ( id ) => {
			const l = window.__wpieFluidLab;
			l.choose( id, 17 );
			l.pause();
			l.settings.light = 0.2;
			l.settings.bath = '#080a18';
			l.renderer.update( l.settings );
		}, preset );
		const result = await renderComparison( preset );
		console.log( JSON.stringify( result ) );
		check(
			result.changed > 200 && result.gain > 5000 && result.stable,
			`${ preset }: deep fluids export fluorescent pigment without changing the simulation`
		);
	}
	await page.locator( '[data-material="ferro"]' ).click();
	check(
		( await page.locator( '.wpiemb-pigment-wheel .cw' ).count() ) === 1,
		'Deep ferrofluid also exposes the actual pigment wheel'
	);
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.sim.clear();
		l.sim.fill( 0.23, 'ferro', '#ec289b', 1 );
		l.settings.fluorescence = 1;
		l.settings.volumeAngle = 0;
		l.renderer.update( l.settings );
		l.renderer.render();
	} );
	const ferro = await renderComparison( 'deep ferrofluid' );
	console.log( JSON.stringify( ferro ) );
	check(
		ferro.changed > 200 && ferro.gain > 5000 && ferro.stable,
		'Deep ferrofluid uses its chosen pigment for fluorescence'
	);
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.sim.clear();
		l.sim.fill( 0.23, 'metal', '#28ec9b', 1 );
		l.renderer.update( l.settings );
	} );
	const metal = await renderComparison( 'deep liquid metal' );
	check(
		metal.changed > 200 && metal.gain > 5000,
		'Reflective liquid metal supports colored fluorescence'
	);
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		( await page.locator( '.cw' ).count() ) === 0,
		'Closing releases the color wheel'
	);
	exitCode = await qa.finish();
} catch ( error ) {
	console.error( error );
	await qa.finish();
}
process.exit( exitCode );
