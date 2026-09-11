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
	out: path.join( root, 'dist/qa-wax-damping-stage' ),
} );
const { build } = await import(
	path.join( root, 'node_modules/esbuild/lib/main.js' )
);
await build( {
	stdin: {
		contents:
			"import { mountColorWheel } from './src/lib/mount-color-wheel.js'; window.WPIE.bridge.components.mountColorWheel = mountColorWheel;",
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
const advance = async ( count ) => {
	for ( let k = 0; k < count; k += 30 ) {
		await page.evaluate(
			( n ) => {
				const lab = window.__wpieFluidLab;
				for ( let i = 0; i < n; i++ )
					lab.sim.step( lab.settings, 1 / 30 );
			},
			Math.min( 30, count - k )
		);
	}
};
const sample = () =>
	page.evaluate( () => {
		const lab = window.__wpieFluidLab,
			sim = lab.sim;
		const peak = sim.wave.reduce(
			( a, b ) => Math.max( a, Math.abs( b ) ),
			0
		);
		const i =
			Math.round( 0.3271028 * ( sim.h - 1 ) ) * sim.w +
			Math.round( 0.6993007 * ( sim.w - 1 ) );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
		return {
			peak,
			wave: sim.wave[ i ],
			height: sim.height[ i ],
			temperature: sim.temperature[ i ],
			wax: sim.wax[ i ],
			resolution: [ sim.w, sim.h ],
		};
	} );
let result = 1;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.locator( '[data-experiment="wax_duet"]' ).click();
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	await advance( 360 );
	const cold = await sample();
	check(
		cold.resolution[ 0 ] === 144 &&
			cold.peak < 0.01 &&
			cold.temperature < 52 &&
			cold.wax > 0.5,
		'The real Melt and set recipe settles at full resolution while the wax remains cold and solid'
	);
	qa.note( JSON.stringify( { cold } ) );
	await qa.shot( 'qa-wax-damping-cold.png' );
	await page.locator( '[data-tool="erase"]' ).click();
	const point = await page.evaluate( () => {
		const l = window.__wpieFluidLab,
			r = l.canvas.getBoundingClientRect(),
			p = l.renderer.projectPoint( 0.6993007, 0.3271028 );
		return { x: r.left + p.x, y: r.top + p.y };
	} );
	await page.mouse.click( point.x, point.y );
	const erased = await sample();
	check(
		erased.wave === 0 && erased.height === 0 && erased.wax > 0.5,
		'Remove Obstacle still clears the local wave without deleting wax'
	);
	await advance( 120 );
	const later = await sample();
	check(
		later.peak < 0.01,
		'The repeating oscillation does not return after Remove Obstacle'
	);
	qa.note( JSON.stringify( { erased, later } ) );
	// Exercise a saved state containing the old saturated oscillation.
	await page.evaluate( () => {
		const l = window.__wpieFluidLab,
			s = l.sim;
		for ( let i = 0; i < s.n; i++ ) {
			if ( s.wax[ i ] > 0.5 && s.temperature[ i ] < 52 ) {
				const sign =
					( ( i % s.w ) + Math.floor( i / s.w ) ) % 2 ? 1 : -1;
				s.wave[ i ] = sign * 0.3;
				s.height[ i ] = sign * 0.005;
			}
		}
		const saved = l.save();
		l.restore( saved );
		l.pause();
	} );
	await advance( 300 );
	const restored = await sample();
	check(
		restored.peak < 0.01,
		'Reopening a saturated cold-wax wave state also settles with the new solver'
	);
	qa.note( JSON.stringify( { restored } ) );
	await qa.shot( 'qa-wax-damping-restored.png' );
	result = await qa.finish();
} finally {
	await qa.browser.close();
}
process.exitCode = result;
