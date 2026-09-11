/** Real rendering at device scale 2, contour measurement and optional legacy file. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const running = execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], {
	encoding: 'utf8',
} )
	.split( '\n' )
	.some(
		( line ) =>
			! /^\s*Z/.test( line ) &&
			/chrome|chromium|headless_shell/.test( line )
	);
if ( running ) throw new Error( 'Another headless browser is running.' );
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const stage = await buildStage( { root } );
const qa = await launchQA( { stage, locale: 'de_DE' } );
const { check } = qa;
try {
	await qa.page.close();
	const page = await qa.browser.newPage( {
		viewport: { width: 1280, height: 900 },
		deviceScaleFactor: 2,
	} );
	page.on( 'pageerror', ( error ) => check( false, error.message ) );
	page.on( 'console', ( message ) => {
		if ( message.type() === 'error' )
			check( false, message.text().slice( 0, 240 ) );
	} );
	await page.goto(
		pathToFileURL( path.join( stage, 'index.html' ) ).href + '?locale=de_DE'
	);
	await page.waitForFunction( () => !! window.__marblingStudio );
	await page.evaluate( () => {
		document.querySelector( '[data-mode="fluid"]' ).click();
		window.__wpieFluidLab.pause();
	} );
	await page.waitForFunction(
		() =>
			document.querySelectorAll(
				'.wpiemb-lab-experiment canvas[data-ready="true"]'
			).length === 42,
		null,
		{ timeout: 90000 }
	);
	check(
		await page.evaluate( () => {
			const c = window.__wpieFluidLab.canvas,
				r = c.getBoundingClientRect();
			return (
				window.devicePixelRatio === 2 &&
				Math.abs( c.width - r.width * 2 ) <= 1 &&
				Math.abs( c.height - r.height * 2 ) <= 1
			);
		} ),
		'the actual preview uses both pixels per CSS pixel on a HiDPI display'
	);
	const shot = ( name ) =>
		page.screenshot( { path: path.join( root, 'dist', name ) } );
	await shot( 'qa-fluid-hidpi.png' );
	for ( const id of [
		'silver',
		'alcohol_bloom',
		'soap_cells',
		'mix_green',
		'ferro_twin',
		'reactive_fronts',
	] ) {
		await page.evaluate(
			( recipe ) => window.__wpieFluidLab.choose( recipe, 17 ),
			id
		);
		await shot( 'qa-fluid-hidpi-' + id + '.png' );
	}
	const arrangement = () =>
		page.evaluate( () => {
			const lab = window.__wpieFluidLab;
			lab.renderer.update( lab.settings );
			return lab.renderer.still( 80, 60, 'print' ).toDataURL();
		} );
	const beforeVariation = await arrangement();
	await page.locator( '.wpiemb-lab-variation' ).click();
	check(
		( await arrangement() ) !== beforeVariation,
		'New variation changes the rendered reactive experiment'
	);
	await shot( 'qa-fluid-variation.png' );
	const toolsFit = () =>
		page.evaluate( () => {
			const grid = document.querySelector( '.wpiemb-lab-tool-groups' ),
				panel = document.querySelector( '.wpiemb-lab-tool-deck' );
			return (
				grid.getBoundingClientRect().right <=
					panel.getBoundingClientRect().right &&
				grid.scrollWidth <= grid.clientWidth + 1 &&
				[ ...grid.querySelectorAll( '.wpiemb-tool b' ) ].every(
					( label ) => label.scrollWidth <= label.clientWidth + 1
				)
			);
		} );
	check(
		await toolsFit(),
		'German tool names fit the panel without clipping'
	);
	await page.setViewportSize( { width: 1100, height: 780 } );
	await page.waitForTimeout( 150 );
	check(
		await toolsFit(),
		'German tool names also fit the narrow desktop panel'
	);
	await shot( 'qa-fluid-forces-de-small.png' );
	await page.setViewportSize( { width: 1280, height: 900 } );
	await page.waitForTimeout( 150 );
	const spread = await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.sim.clear();
		lab.settings.bath = '#000000';
		lab.sim.drop( 0.5, 0.5, 0.12, 'oil', '#ffffff', 1 );
		lab.renderer.update( lab.settings );
		const canvas = lab.renderer.still( 1024, 768, 'print' );
		const pixels = canvas
			.getContext( '2d' )
			.getImageData( 0, 0, 1024, 768 ).data;
		const sample = ( x, y ) => {
			const ix = Math.floor( x ),
				iy = Math.floor( y ),
				fx = x - ix,
				fy = y - iy;
			const at = ( xx, yy ) => pixels[ ( yy * 1024 + xx ) * 4 ];
			return (
				( at( ix, iy ) * ( 1 - fx ) + at( ix + 1, iy ) * fx ) *
					( 1 - fy ) +
				( at( ix, iy + 1 ) * ( 1 - fx ) + at( ix + 1, iy + 1 ) * fx ) *
					fy
			);
		};
		const radii = [];
		for ( let k = 0; k < 360; k++ ) {
			const angle = ( k * Math.PI ) / 180;
			let lo = 0,
				hi = 140;
			for ( let j = 0; j < 14; j++ ) {
				const radius = ( lo + hi ) / 2;
				if (
					sample(
						511.5 + Math.cos( angle ) * radius,
						383.5 + Math.sin( angle ) * radius
					) > 127.5
				)
					lo = radius;
				else hi = radius;
			}
			radii.push( ( lo + hi ) / 2 );
		}
		return { min: Math.min( ...radii ), max: Math.max( ...radii ) };
	} );
	check(
		spread.min > 20 && spread.max - spread.min < 0.9,
		'a round drop has less than one output pixel of radial contour variation'
	);
	qa.note(
		'Measured contour radii at 1024 × 768: ' + JSON.stringify( spread )
	);
	for ( const input of process.argv.slice( 2 ) ) {
		const file = path.resolve( input );
		const legacy = JSON.parse( fs.readFileSync( file, 'utf8' ) );
		if ( ! [ 1, 2 ].includes( legacy.snapshot.version ) )
			throw new Error(
				'Expected an actual version-one or version-two experiment.'
			);
		await page.locator( '.wpiemb-lab-file' ).setInputFiles( file );
		await page.waitForFunction(
			( time ) => window.__wpieFluidLab.sim.time === time,
			legacy.snapshot.time
		);
		const restored = await page.evaluate(
			() => window.__wpieFluidLab.save().snapshot
		);
		const bytes = Buffer.from( restored.data, 'base64' );
		const previous = Buffer.from( legacy.snapshot.data, 'base64' );
		check(
			bytes.subarray( 0, previous.length ).equals( previous ),
			'a real snapshot v' +
				legacy.snapshot.version +
				' reopens with every original float unchanged'
		);
		await shot(
			'qa-fluid-legacy-v' + legacy.snapshot.version + '-reopened.png'
		);
	}
	await page.keyboard.press( 'Escape' );
	check(
		await page.evaluate( () => ! window.__wpieFluidLab ),
		'the HiDPI lab releases its renderer on close'
	);
	process.exitCode = qa.failures() ? 1 : 0;
} finally {
	await qa.browser.close();
}
