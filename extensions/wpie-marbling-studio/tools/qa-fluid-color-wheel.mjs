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
	out: path.join( root, 'dist/qa-color-wheel-stage' ),
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
const wheel = () => page.locator( '.wpiemb-pigment-wheel .cw' );
const color = () =>
	page.evaluate( () => {
		const l = window.__wpieFluidLab;
		return l.settings.colors[ l.settings.material ];
	} );
const choose = async ( id ) => {
	await page.evaluate( ( id ) => window.__wpieFluidLab.choose( id, 17 ), id );
	await page.waitForTimeout( 80 );
};
const ringPoint = async ( hue ) => {
	await wheel().scrollIntoViewIfNeeded();
	const b = await wheel().boundingBox(),
		r = ( b.width / 2 - 1 ) * 0.925;
	return {
		x: b.x + b.width / 2 + Math.cos( hue * Math.PI * 2 ) * r,
		y: b.y + b.height / 2 + Math.sin( hue * Math.PI * 2 ) * r,
	};
};
const pick = async ( hue, s = 0.9, v = 0.9 ) => {
	const p = await ringPoint( hue );
	await page.mouse.click( p.x, p.y );
	const b = await page
		.locator( '.wpiemb-pigment-wheel .cw-sq' )
		.boundingBox();
	await page.mouse.click( b.x + b.width * s, b.y + b.height * ( 1 - v ) );
	await page.waitForTimeout( 50 );
	return color();
};
const rgb = ( hex ) =>
	[ 1, 3, 5 ].map( ( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) );
const paint = async ( x, y ) => {
	const p = await page.evaluate(
		( { x, y } ) => {
			const l = window.__wpieFluidLab,
				r = l.canvas.getBoundingClientRect(),
				p = l.renderer.projectPoint( x, y );
			return { x: r.left + p.x, y: r.top + p.y };
		},
		{ x, y }
	);
	await page.mouse.click( p.x, p.y );
};
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	await choose( 'blank' );
	await page.locator( '[data-material="oil"]' ).click();
	await wheel().waitFor();
	check(
		( await wheel().count() ) === 1,
		'The actual Brush color wheel is mounted inline at Pigment'
	);
	const before = await page.evaluate(
		() => window.__wpieFluidLab.sim.snapshot().data
	);
	const red = rgb( await pick( 0 ) );
	check(
		red[ 0 ] > 220 && red[ 1 ] < 35 && red[ 2 ] < 35,
		'Hue ring and shade square select red without a popover'
	);
	check(
		before ===
			( await page.evaluate(
				() => window.__wpieFluidLab.sim.snapshot().data
			) ),
		'Picking a pigment does not recolor the existing bath'
	);
	await paint( 0.3, 0.5 );
	await page.evaluate( () => {
		window.__pigmentBefore = window.__wpieFluidLab.sim.snapshot().data;
	} );
	const green = await pick( 1 / 3 ),
		g = rgb( green );
	check(
		g[ 1 ] > 220 && g[ 0 ] < 35 && g[ 2 ] < 35,
		'The next pigment can immediately be changed to green'
	);
	check(
		await page.evaluate(
			() =>
				window.__pigmentBefore ===
				window.__wpieFluidLab.sim.snapshot().data
		),
		'The already deposited red oil is preserved during the color change'
	);
	await paint( 0.7, 0.5 );
	const halves = await page.evaluate( () => {
		const s = window.__wpieFluidLab.sim;
		const out = [
			[ 0, 0, 0 ],
			[ 0, 0, 0 ],
		];
		for ( let i = 0; i < s.n; i++ ) {
			const h = i % s.w < s.w / 2 ? 0 : 1;
			out[ h ][ 0 ] += s.oil[ i ];
			out[ h ][ 1 ] += s.oilR[ i ];
			out[ h ][ 2 ] += s.oilG[ i ];
		}
		return out;
	} );
	check(
		halves[ 0 ][ 0 ] > 0 &&
			halves[ 1 ][ 0 ] > 0 &&
			halves[ 0 ][ 1 ] > halves[ 0 ][ 2 ] * 3 &&
			halves[ 1 ][ 2 ] > halves[ 1 ][ 1 ] * 3,
		'Actual new drops use red and green while preserving the earlier pigment'
	);
	await page.locator( '[data-material="water"]' ).click();
	await pick( 2 / 3 );
	await page.locator( '[data-material="oil"]' ).click();
	await wheel().waitFor();
	check(
		( await color() ) === green,
		'Each liquid remembers its own pigment after switching materials'
	);
	await pick( 1 / 3, 0.9, 0 );
	const black = rgb( await color() );
	check(
		black.every( ( v ) => v < 2 ),
		'The shade square reaches black'
	);
	const p = await ringPoint( 2 / 3 );
	await page.mouse.click( p.x, p.y );
	const sq = await page
		.locator( '.wpiemb-pigment-wheel .cw-sq' )
		.boundingBox();
	await page.mouse.click( sq.x + sq.width * 0.9, sq.y + sq.height * 0.1 );
	const blue = rgb( await color() );
	check(
		blue[ 2 ] > 220 && blue[ 0 ] < 35 && blue[ 1 ] < 35,
		'Hue selection survives black and reappears when brightness is raised'
	);
	const old = await color(),
		touch = await page.context().newCDPSession( page ),
		tp = await ringPoint( 0 );
	await touch.send( 'Input.dispatchTouchEvent', {
		type: 'touchStart',
		touchPoints: [ { ...tp, id: 1 } ],
	} );
	await touch.send( 'Input.dispatchTouchEvent', {
		type: 'touchMove',
		touchPoints: [ { x: tp.x - 7, y: tp.y + 20, id: 1 } ],
	} );
	await touch.send( 'Input.dispatchTouchEvent', {
		type: 'touchEnd',
		touchPoints: [],
	} );
	await touch.detach();
	check(
		( await color() ) !== old,
		'Touch input changes the pigment on the actual wheel'
	);
	await page.setViewportSize( { width: 1100, height: 780 } );
	await wheel().scrollIntoViewIfNeeded();
	const fit = await page.evaluate( () => {
		const w = document
				.querySelector( '.wpiemb-pigment-wheel .cw' )
				.getBoundingClientRect(),
			side = document
				.querySelector( '.wpiemb-side' )
				.getBoundingClientRect();
		return w.width >= 150 && w.left >= side.left && w.right <= side.right;
	} );
	check( fit, 'The wheel stays usable and inside the narrow desktop panel' );
	await pick( 1 / 3 );
	await qa.shot( 'qa-fluid-color-wheel-de-small.png' );
	const save = await page.evaluate( () => window.__wpieFluidLab.save() );
	await page.locator( '[data-material="ferro"]' ).click();
	check(
		( await wheel().count() ) === 1,
		'Ferrofluid has the same pigment wheel as the other liquids'
	);
	await page.evaluate(
		( state ) => window.__wpieFluidLab.restore( state ),
		save
	);
	await wheel().waitFor();
	check(
		( await color() ) === save.settings.colors[ save.settings.material ],
		'Saving and reopening restores the selected pigment'
	);
	await choose( 'volume_clouds' );
	await page.locator( '[data-material="oil"]' ).click();
	await pick( 1 / 3 );
	const count = await page.evaluate( () => window.__wpieFluidLab.sim.count );
	await paint( 0.5, 0.5 );
	check(
		await page.evaluate(
			( n ) => window.__wpieFluidLab.sim.count > n,
			count
		),
		'The same inline picker works for newly poured 3D liquid'
	);
	await choose( 'blank' );
	await page.locator( '[data-material="oil"]' ).click();
	await pick( 0 );
	const lockColor = await color(),
		lockedPoint = await ringPoint( 1 / 3 );
	const film = page.waitForEvent( 'download', { timeout: 30000 } );
	await page.evaluate( () =>
		document.querySelector( '[data-action="record"]' ).click()
	);
	await page.mouse.click( lockedPoint.x, lockedPoint.y );
	check(
		( await color() ) === lockColor,
		'Recording locks the wheel together with the other controls'
	);
	await (
		await film
	).saveAs( path.join( root, 'dist/qa-fluid-color-wheel-film.webm' ) );
	await page.waitForFunction(
		() =>
			! document.querySelector( '.wpiemb-lab-dialog .wpiemb-body' ).inert
	);
	check(
		( await pick( 1 / 3 ) ) !== lockColor,
		'The wheel becomes interactive again after recording'
	);
	const fallback = await page.evaluate( () => {
		const l = window.__wpieFluidLab,
			s = l.save();
		delete window.WPIE.bridge.components.mountColorWheel;
		l.restore( s );
		return l.settings.colors[ l.settings.material ];
	} );
	check(
		( await wheel().count() ) === 0,
		'Older cores retain the existing swatch fallback'
	);
	const swatch = page
		.locator( '.wpiemb-side .dsm-card' )
		.filter( { hasText: 'Pigmentfarbe' } )
		.locator( 'button' )
		.first();
	await swatch.click();
	check(
		( await color() ) !== fallback,
		'The fallback still updates the actual pigment setting'
	);
	await page.evaluate( () => {
		window.WPIE.bridge.components.mountColorWheel =
			window.__actualColorWheelMount;
		const l = window.__wpieFluidLab;
		l.restore( l.save() );
	} );
	await wheel().waitFor();
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		( await page.locator( '.cw' ).count() ) === 0 &&
			! ( await page.evaluate( () => !! window.__wpieFluidLab ) ),
		'Closing unmounts the color wheel and releases the lab'
	);
	exitCode = await qa.finish();
} catch ( e ) {
	console.error( e );
	await qa.shot( 'qa-fluid-color-wheel-failure.png' );
	await qa.finish();
}
process.exit( exitCode );
