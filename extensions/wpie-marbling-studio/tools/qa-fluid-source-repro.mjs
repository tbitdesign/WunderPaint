import fs from 'node:fs';
import path from 'node:path';
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
)
	throw Error( 'Browser already running' );
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const stage = await buildStage( {
	root,
	out: path.join( root, 'dist/qa-source-repro' ),
} );
const installed = path.resolve(
	root,
	'../../../../uploads/wpie-extensions/wpie-marbling-studio/extension.js'
);
// The installed code, not our current development bundle.
fs.copyFileSync( installed, path.join( stage, 'extension.js' ) );
const qa = await launchQA( { stage, locale: 'en_US' } );
const { page } = qa;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.pause();
		lab.choose( 'ferro_twin', 17 );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	} );
	await page.locator( '[data-tool="removeSource"]' ).click();
	await page.locator( '[data-setting="selectedSource"]' ).selectOption( '1' );
	console.log(
		'dropdown',
		await page.evaluate( () => ( {
			tool: window.__wpieFluidLab.settings.tool,
			sources: window.__wpieFluidLab.sim.sources.length,
		} ) )
	);
	await page.locator( '[data-tool="removeSource"]' ).click();
	const pos = await page.evaluate( () => {
		const m = document.querySelector( '[data-source="1"]' );
		const r = m.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	} );
	await page.mouse.click( pos.x, pos.y );
	console.log(
		'ordinary click',
		await page.evaluate( () => window.__wpieFluidLab.sim.sources.length )
	);
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'ferro_twin', 17 );
		lab.settings.depth = 1.5;
		lab.settings.angle = 32;
		for ( const source of lab.sim.sources ) {
			source.gap = 0.04;
			source.power = 3;
		}
		for ( let k = 0; k < 30; k++ ) lab.sim.step( lab.settings );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	} );
	await page.waitForTimeout( 250 );
	await page.locator( '[data-tool="removeSource"]' ).click();
	const peak = await page.evaluate( () => {
		const r = document
			.querySelector( '[data-source="1"]' )
			.getBoundingClientRect();
		const x = r.x + r.width / 2,
			y = r.y + r.height / 2;
		return {
			x,
			y,
			picked: window.__wpieFluidLab.renderer.point( x, y ),
			source: window.__wpieFluidLab.sim.sources[ 0 ],
		};
	} );
	await page.mouse.click( peak.x, peak.y );
	console.log(
		'peak click',
		JSON.stringify( {
			peak,
			left: await page.evaluate(
				() => window.__wpieFluidLab.sim.sources.length
			),
		} )
	);
} finally {
	await qa.finish();
}
