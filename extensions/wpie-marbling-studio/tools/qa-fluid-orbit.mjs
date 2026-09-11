/** Real WebGL and pointer events; only the editor bridge and clock freeze are QA. */
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
const stage = await buildStage( {
	root,
	out: path.join( root, 'dist/qa-orbit-stage' ),
} );
const qa = await launchQA( {
	stage,
	locale: 'de_DE',
	shotDir: path.join( root, 'dist' ),
} );
const { page, check } = qa;
let code = 1;
const choose = async ( id ) => {
	await page.evaluate( ( id ) => {
		const lab = window.__wpieFluidLab;
		lab.choose( id, 17 );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	}, id );
	await page.waitForTimeout( 80 );
};
const center = async () => {
	const box = await page.locator( '.wpiemb-lab-canvas' ).boundingBox();
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};
const sourceCenter = async ( id ) =>
	page.evaluate( ( id ) => {
		const r = document
			.querySelector( `[data-source="${ id }"]` )
			.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}, id );
const drag = async ( button, dx, dy ) => {
	const c = await center();
	await page.mouse.move( c.x, c.y );
	await page.mouse.down( { button } );
	await page.mouse.move( c.x + dx, c.y + dy, { steps: 9 } );
	await page.mouse.up( { button } );
	await page.waitForTimeout( 100 );
};
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	await choose( 'ferro_twin' );
	await page.locator( '[data-tool="removeSource"]' ).click();
	await page.locator( '[data-setting="selectedSource"]' ).selectOption( '1' );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.tool === 'removeSource'
		),
		'Choosing a source preserves Remove source mode'
	);
	await page.locator( '[data-action="removeSource"]' ).click();
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.sim.sources.length === 1 &&
				! window.__wpieFluidLab.sim.sources.some( ( s ) => s.id === 1 )
		),
		'The selected magnet can be removed from the panel'
	);
	await choose( 'ferro_twin' );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		Object.assign( lab.settings, {
			depth: 1.5,
			angle: 67,
			viewYaw: 35,
			showSources: false,
		} );
		for ( const s of lab.sim.sources )
			Object.assign( s, { power: 3, gap: 0.04, radius: 0.04 } );
		for ( let k = 0; k < 30; k++ ) lab.sim.step( lab.settings );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
	} );
	await page.locator( '[data-tool="removeSource"]' ).click();
	check(
		await page.locator( '[data-source="1"]' ).isVisible(),
		'Remove mode exposes hidden source handles'
	);
	const hit = await sourceCenter( 1 );
	console.log(
		'projected handle',
		await page.evaluate(
			( p ) => ( {
				hit: window.__wpieFluidLab.renderer.pickSource( p.x, p.y )?.id,
				target: document.elementFromPoint( p.x, p.y )?.className,
				x: p.x,
				y: p.y,
			} ),
			hit
		)
	);
	await page.mouse.click( hit.x, hit.y );
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.sim.sources.length === 1 &&
				! window.__wpieFluidLab.sim.sources.some( ( s ) => s.id === 1 )
		),
		'A narrow magnet can be deleted by its projected handle on a tilted, deformed surface'
	);

	await page.locator( '[data-setting="selectedSource"]' ).selectOption( '2' );
	await page.locator( '[data-action="removeSource"]' ).click();
	check(
		await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			l.sim.step( l.settings );
			return (
				l.sim.sources.length === 0 &&
				l.sim.magnetic.every( ( v ) => v === 0 ) &&
				l.sim.magneticX.every( ( v ) => v === 0 ) &&
				l.sim.magneticY.every( ( v ) => v === 0 )
			);
		} ),
		'Removing the last magnet clears its actual field on the next step'
	);
	for ( const id of process.argv.includes( '--sources-only' )
		? []
		: [ 'ferro_twin', 'volume_clouds' ] ) {
		await choose( id );
		await page.locator( '[data-tool="orbit"]' ).click();
		await page.evaluate( () => {
			const lab = window.__wpieFluidLab;
			window.__orbitBefore = JSON.stringify( lab.sim.snapshot() );
			window.__orbitPhysical = [
				lab.settings.tiltX,
				lab.settings.tiltY,
				lab.settings.gravity,
			];
			window.__orbitAngles = [
				lab.settings.angle,
				lab.settings.volumeAngle,
				lab.settings.viewYaw,
			];
		} );
		await drag( 'left', 100, 100 );
		const first = await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			return {
				unchanged:
					window.__orbitBefore === JSON.stringify( l.sim.snapshot() ),
				changed:
					JSON.stringify( window.__orbitAngles ) !==
					JSON.stringify( [
						l.settings.angle,
						l.settings.volumeAngle,
						l.settings.viewYaw,
					] ),
				yaw: l.settings.viewYaw,
			};
		} );
		check(
			first.unchanged && first.changed,
			id +
				' left drag rotates the camera without adding, moving or recoloring liquid'
		);

		const touch = await page.context().newCDPSession( page );
		const tc = await center();
		await touch.send( 'Input.dispatchTouchEvent', {
			type: 'touchStart',
			touchPoints: [ { x: tc.x, y: tc.y, id: 1 } ],
		} );
		for ( let k = 1; k <= 6; k++ ) {
			await touch.send( 'Input.dispatchTouchEvent', {
				type: 'touchMove',
				touchPoints: [ { x: tc.x + k * 8, y: tc.y - k * 6, id: 1 } ],
			} );
		}
		await touch.send( 'Input.dispatchTouchEvent', {
			type: 'touchEnd',
			touchPoints: [],
		} );
		await touch.detach();
		check(
			await page.evaluate( ( yaw ) => {
				const l = window.__wpieFluidLab;
				return (
					Math.abs( l.settings.viewYaw - yaw ) > 2 &&
					window.__orbitBefore === JSON.stringify( l.sim.snapshot() )
				);
			}, first.yaw ),
			id + ' touch drag orbits without changing the liquid'
		);
		await page.locator( '[data-tool="pipette"]' ).click();
		await drag( 'right', -120, -70 );
		check(
			await page.evaluate( ( yaw ) => {
				const l = window.__wpieFluidLab;
				return (
					window.__orbitBefore ===
						JSON.stringify( l.sim.snapshot() ) &&
					Math.abs( l.settings.viewYaw - yaw ) > 2
				);
			}, first.yaw ),
			id +
				' right drag orbits while Pipette is selected without adding a drop'
		);
		const c = await center();
		await page.mouse.move( c.x, c.y );
		await page.mouse.wheel( 0, -300 );
		await page.waitForTimeout( 150 );
		check(
			await page.evaluate( () => {
				const l = window.__wpieFluidLab;
				return (
					l.settings.viewZoom > 1.05 &&
					window.__orbitBefore === JSON.stringify( l.sim.snapshot() )
				);
			} ),
			id + ' mouse wheel zooms without changing the bath'
		);
		const saved = await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			Object.assign( l.settings, {
				angle: 128,
				volumeAngle: 128,
				viewYaw: 72,
				viewZoom: 1,
			} );
			l.renderer.update( l.settings );
			l.renderer.render();
			const camera = l.renderer.volume?.camera || l.renderer.camera;
			const state = l.save();
			const image = l.renderer.still( 480, 360, 'wet' );
			const data = image
				.getContext( '2d' )
				.getImageData( 0, 0, 480, 360 ).data;
			let visible = 0;
			for ( let i = 3; i < data.length; i += 4 )
				if ( data[ i ] > 10 ) visible++;
			const wet = image.toDataURL();
			const top = l.renderer.still( 480, 360, 'print' ).toDataURL();
			l.restore( state );
			l.renderer.update( l.settings );
			l.renderer.render();
			return {
				below: camera.position.z < 0,
				visible,
				viewsDiffer: wet !== top,
				restore: JSON.stringify( l.save() ) === JSON.stringify( state ),
				physics:
					window.__orbitBefore ===
						JSON.stringify( l.sim.snapshot() ) &&
					JSON.stringify( window.__orbitPhysical ) ===
						JSON.stringify( [
							l.settings.tiltX,
							l.settings.tiltY,
							l.settings.gravity,
						] ),
				wet,
			};
		} );
		check(
			saved.below && saved.visible > 3000,
			id + ' underside view displays the actual liquid'
		);
		check(
			saved.viewsDiffer && saved.restore && saved.physics,
			id +
				' camera survives save/reopen and both exports without changing the physical state'
		);
		fs.writeFileSync(
			path.join( root, 'dist', 'qa-fluid-orbit-' + id + '-under.png' ),
			Buffer.from( saved.wet.split( ',' )[ 1 ], 'base64' )
		);
		await qa.shot( 'qa-fluid-orbit-' + id + '.png' );
		if ( id === 'ferro_twin' ) {
			await page.locator( '[data-tool="removeSource"]' ).click();
			const p = await sourceCenter( 1 );
			await page.mouse.click( p.x, p.y );
			check(
				await page.evaluate(
					() => window.__wpieFluidLab.sim.sources.length === 1
				),
				'The magnet is deletable in the underside view'
			);
			await page.evaluate( () => {
				window.__orbitBefore = JSON.stringify(
					window.__wpieFluidLab.sim.snapshot()
				);
			} );
		}
		await page.locator( '[data-action="resetView"]' ).click();
		check(
			await page.evaluate( () => {
				const l = window.__wpieFluidLab;
				return (
					l.settings.viewYaw === 0 &&
					l.settings.viewZoom === 1 &&
					window.__orbitBefore === JSON.stringify( l.sim.snapshot() )
				);
			} ),
			id + ' Reset view resets only the camera'
		);
		await page.locator( '[data-tool="pipette"]' ).click();
		const p = await page.evaluate( () => {
			const l = window.__wpieFluidLab,
				r = l.canvas.getBoundingClientRect(),
				p = l.renderer.projectPoint( 0.5, 0.5 );
			return { x: r.left + p.x, y: r.top + p.y };
		} );
		await page.mouse.click( p.x, p.y );
		check(
			await page.evaluate(
				() =>
					window.__orbitBefore !==
					JSON.stringify( window.__wpieFluidLab.sim.snapshot() )
			),
			id + ' normal liquid input still works after camera interaction'
		);
	}
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		( await page.locator( '.wpiemb-lab-dialog' ).count() ) === 0,
		'Closing disposes the interactive view'
	);
	code = await qa.finish();
} catch ( e ) {
	console.error( e );
	await qa.shot( 'qa-fluid-orbit-failure.png' );
	await qa.finish();
}
process.exit( code );
