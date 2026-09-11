/** Real extension bundle, real WebGL, shared editor bridge harness. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
const active = execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], {
	encoding: 'utf8',
} )
	.split( '\n' )
	.some(
		( line ) =>
			! /^\s*Z/.test( line ) &&
			/chrome|chromium|headless_shell/.test( line )
	);
if ( active ) {
	throw new Error( 'Another headless browser is running.' );
}
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const stage = await buildStage( {
	root,
	out: path.join( root, 'dist/qa-volume-stage' ),
} );
const qa = await launchQA( {
	stage,
	locale: 'de_DE',
	shotDir: path.join( root, 'dist' ),
} );
const { page, check } = qa;
const results = [];
let exitCode = 1;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	for ( const id of process.argv.includes( '--ferro-only' )
		? [ 'ferro_pool' ]
		: [
				'volume_clouds',
				'volume_layers',
				'volume_honey',
				'volume_foam',
				'volume_melt',
				'volume_thermal',
				'volume_splash',
				'volume_bubbles',
				'volume_crystal',
				'volume_waves',
				'ferro_pool',
		  ] ) {
		await page.evaluate( ( value ) => {
			const lab = window.__wpieFluidLab;
			lab.choose( value, 17 );
			lab.renderer.update( lab.settings );
			lab.renderer.render();
		}, id );
		await page.waitForTimeout( 150 );
		const result = await page.evaluate( () => {
			const lab = window.__wpieFluidLab,
				{ sim, settings, renderer } = lab;
			const saved = lab.save();
			const c = renderer.still( 400, 300, 'wet' );
			const image = c.toDataURL();
			const d = c.getContext( '2d' ).getImageData( 0, 0, 400, 300 ).data;
			let colored = 0,
				opaque = 0;
			for ( let k = 0; k < d.length; k += 4 ) {
				if ( d[ k + 3 ] > 240 ) {
					opaque++;
				}
				if (
					Math.max( d[ k ], d[ k + 1 ], d[ k + 2 ] ) -
						Math.min( d[ k ], d[ k + 1 ], d[ k + 2 ] ) >
					40
				) {
					colored++;
				}
			}
			const top = renderer.still( 400, 300, 'print' ).toDataURL();
			lab.restore( saved );
			const exact =
				JSON.stringify( lab.save() ) === JSON.stringify( saved );
			const start = performance.now();
			for ( let k = 0; k < 10; k++ ) {
				lab.sim.step( settings );
			}
			const ms = ( performance.now() - start ) / 10;
			lab.renderer.update( lab.settings );
			lab.renderer.render();
			return {
				id: settings.experiment,
				count: sim.count,
				meshes: renderer.volume?.meshes.map( ( m ) => m.count ),
				colored,
				opaque,
				exact,
				viewsDiffer: image !== top,
				moving: saved.snapshot.data !== lab.save().snapshot.data,
				ms,
			};
		} );
		results.push( result );
		check( result.exact, id + ' saves and reopens exactly' );
		check( result.opaque > 10000, id + ' has a visible vessel / bath' );
		check( result.viewsDiffer, id + ' supports both export views' );
		check( result.moving, id + ' evolves' );
		console.log( JSON.stringify( result ) );
		await qa.shot( 'qa-fluid-' + id + '.png' );
		if ( id === 'ferro_pool' ) {
			const peaks = await page.evaluate( () => {
				const lab = window.__wpieFluidLab;
				for ( let k = 0; k < 200; k++ ) {
					lab.sim.step( lab.settings );
				}
				lab.renderer.update( lab.settings );
				lab.renderer.render();
				const { sim } = lab;
				let peaks = 0;
				for ( let i = sim.w * 2; i < sim.n - sim.w * 2; i++ ) {
					if (
						sim.ferroPattern[ i ] > 0.3 &&
						[ i - 1, i + 1, i - sim.w, i + sim.w ].every(
							( j ) =>
								sim.ferroPattern[ i ] > sim.ferroPattern[ j ]
						)
					) {
						peaks++;
					}
				}
				return peaks;
			} );
			check(
				peaks >= 6,
				'Multiple ferrofluid peaks develop in the actual flowing preset: ' +
					peaks
			);
			await qa.shot( 'qa-fluid-ferro-spikes.png' );
		}
	}
	if ( process.argv.includes( '--ferro-only' ) ) {
		process.exit( await qa.finish() );
	}
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'volume_clouds', 17 );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	} );
	const point = await page.evaluate( () => {
		const lab = window.__wpieFluidLab,
			p = lab.renderer.projectPoint( 0.5, 0.5 ),
			r = lab.canvas.getBoundingClientRect();
		return { x: p.x + r.left, y: p.y + r.top };
	} );
	const before = await page.evaluate( () => window.__wpieFluidLab.sim.count );
	await page.locator( '[data-tool="pipette"]' ).click();
	await page.mouse.move( point.x, point.y );
	await page.mouse.down();
	await page.waitForTimeout( 100 );
	await page.mouse.up();
	check(
		( await page.evaluate( () => window.__wpieFluidLab.sim.count ) ) >
			before,
		'A real pointer gesture adds 3D liquid at the projected point'
	);
	await page.locator( '[data-fluid-palette="chemistry"]' ).click();
	check(
		await page.locator( '[data-material="bicarbonate"]' ).isVisible(),
		'Chemistry palette exposes the new reagents'
	);
	await page.locator( '[data-material="bicarbonate"]' ).click();
	await page.mouse.click( point.x, point.y );
	check(
		await page.evaluate( () =>
			window.__wpieFluidLab.sim.bicarbonate.some( ( v ) => v > 0 )
		),
		'Reagent gesture reaches the spatial bath'
	);
	await page.evaluate( () => window.__wpieFluidLab.choose( 'islands', 17 ) );
	check(
		! ( await page.locator( '[data-tool="lift"]' ).count() ),
		'Surface experiments retain their appropriate tools'
	);
	await page.locator( '[data-fluid-palette="chemistry"]' ).click();
	check(
		! ( await page.locator( '[data-material="bicarbonate"]' ).isVisible() ),
		'Volume-only chemistry is not offered in the surface solver'
	);
	await page
		.waitForFunction(
			() =>
				document.querySelectorAll(
					'.wpiemb-lab-experiment canvas[data-ready="true"]'
				).length >= 60,
			{ timeout: 120000 }
		)
		.catch( () => {} );
	const cards = await page.evaluate( () => ( {
		ready: document.querySelectorAll( 'canvas[data-ready="true"]' ).length,
		total: document.querySelectorAll( '.wpiemb-lab-experiment' ).length,
	} ) );
	check( cards.ready >= 60, 'All 60 preview cards rendered' );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'volume_bubbles', 17 );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	} );
	const savedVolume = await page.evaluate(
		() => window.__wpieFluidLab.save().snapshot.data
	);
	await page.getByRole( 'button', { name: 'Einfügen', exact: true } ).click();
	const inserted = await page.evaluate(
		() =>
			window.__dispatched.findLast(
				( action ) => action.type === 'ADD_LAYER'
			)?.layer
	);
	check(
		inserted?.generator?.params?.lab?.snapshot?.kind === 'volume' &&
			inserted.src.startsWith( 'data:image/png' ),
		'Insert preserves the spatial experiment and a real full-size PNG'
	);
	await page.evaluate( ( layer ) => {
		window.__gen.edit( { editor: window.__editor, layer } );
		window.__wpieFluidLab.pause();
	}, inserted );
	check(
		( await page.evaluate(
			() => window.__wpieFluidLab.save().snapshot.data
		) ) === savedVolume,
		'Editing the spatial generator restores every particle and reagent'
	);
	await page
		.getByRole( 'button', { name: 'Aktualisieren', exact: true } )
		.click();
	const update = await page.evaluate( () =>
		window.__dispatched.findLast(
			( action ) => action.type === 'UPDATE_LAYER'
		)
	);
	check(
		update?.id === inserted.id &&
			update.patch.generator.params.lab.snapshot.kind === 'volume',
		'Update targets the same spatial generator layer'
	);
	fs.writeFileSync(
		'/tmp/wpie-fluid-volume-browser.json',
		JSON.stringify( { results, cards }, null, 2 )
	);
	exitCode = await qa.finish();
} catch ( error ) {
	console.error( error );
	await qa.shot( 'qa-fluid-volume-error.png' );
	await qa.finish();
}
process.exit( exitCode );
