/** Real bundle/UI, real WebGL and pointer events; shared mock editor bridge. */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';

const active = execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], {
	encoding: 'utf8',
} )
	.split( '\n' )
	.filter(
		( line ) =>
			! /^\s*Z/.test( line ) &&
			/chrome|chromium|headless_shell/.test( line )
	);
if ( active.length ) {
	throw new Error( 'Another headless browser is running.' );
}
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const stage = await buildStage( { root } );
const qa = await launchQA( {
	stage,
	locale: 'en_US',
	shotDir: path.join( root, 'dist' ),
} );
const { page, check } = qa;
page.on( 'console', ( message ) => {
	if ( message.type() === 'error' ) {
		check( false, message.text().slice( 0, 300 ) );
	}
} );
// The QA-only freeze hook isolates exact image comparisons. No freeze
// control exists in the product, and normal-operation checks below release it.
const open = async () => {
	await page.evaluate( () => {
		document.querySelector( '[data-mode="fluid"]' ).click();
		window.__wpieFluidLab.pause();
	} );
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.waitForTimeout( 180 );
};

const snapshot = () =>
	page.evaluate( () => window.__wpieFluidLab.save().snapshot.data );
const signature = ( output = 'wet' ) =>
	page.evaluate( ( type ) => {
		const lab = window.__wpieFluidLab;
		lab.renderer.update( lab.settings );
		const c = lab.renderer.still( 320, 240, type );
		const d = c.getContext( '2d' ).getImageData( 0, 0, 320, 240 ).data;
		let hash = 2166136261,
			opaque = 0,
			varied = 0,
			dark = 0,
			light = 0;
		for ( let i = 0; i < d.length; i += 4 ) {
			hash =
				Math.imul(
					hash ^ ( d[ i ] + d[ i + 1 ] * 17 + d[ i + 2 ] * 31 ),
					16777619
				) >>> 0;
			if ( d[ i + 3 ] > 250 ) {
				opaque++;
				const luminance =
					d[ i ] * 0.21 + d[ i + 1 ] * 0.72 + d[ i + 2 ] * 0.07;
				if ( luminance < 80 ) dark++;
				if ( luminance > 140 ) light++;
			}
			if (
				Math.max( d[ i ], d[ i + 1 ], d[ i + 2 ] ) -
					Math.min( d[ i ], d[ i + 1 ], d[ i + 2 ] ) >
				30
			) {
				varied++;
			}
		}
		return { hash, opaque, varied, dark, light };
	}, output );
let exitCode = 1;
try {
	const classic = await page.evaluate( () =>
		JSON.stringify( window.__marblingStudio.getState().ops )
	);
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	const openedTime = await page.evaluate(
		() => window.__wpieFluidLab.sim.time
	);
	await page.waitForTimeout( 700 );
	check(
		await page.evaluate(
			( before ) =>
				! window.__wpieFluidLab.paused &&
				window.__wpieFluidLab.sim.time > before,
			openedTime
		),
		'the lab starts flowing automatically'
	);
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	check(
		( await page.locator( '.wpiemb-lab-playback' ).count() ) === 0 &&
			( await page
				.getByRole( 'button', {
					name: /^(Play|Pause|Undo|Redo|Restart)$/,
				} )
				.count() ) === 0,
		'no transport or history controls in the fluid lab'
	);
	await page.waitForFunction(
		() =>
			document.querySelectorAll(
				'.wpiemb-lab-experiment canvas[data-ready="true"]'
			).length === 60,
		null,
		{ timeout: 120000 }
	);
	check( true, 'all forty-two preview cards render before reuse' );
	check(
		( await page.locator( '[data-material]' ).count() ) === 14,
		'fourteen materials across the two palette groups'
	);
	check(
		( await page.locator( '[data-experiment]' ).count() ) === 60,
		'forty-two experiments'
	);
	check(
		( await page.locator( '.wpiemb-lab-dialog [data-tool]' ).count() ) ===
			12,
		'twelve tools including camera orbit'
	);
	const first = await signature();
	check(
		first.opaque > 40000 && first.varied > 2000,
		'the wet surface contains a visible colored bath'
	);
	const frozen = await snapshot();
	await page.waitForTimeout( 200 );
	check(
		frozen === ( await snapshot() ),
		'QA-only capture holds a reproducible state'
	);

	const box = await page.locator( '.wpiemb-lab-canvas' ).boundingBox();
	await page.locator( '[data-material="thick"]' ).click();
	const beforeDrop = await snapshot();
	await page.mouse.move(
		box.x + box.width * 0.38,
		box.y + box.height * 0.55
	);
	await page.mouse.down();
	await page.waitForTimeout( 200 );
	await page.mouse.up();
	const afterDrop = await snapshot();
	check(
		afterDrop !== beforeDrop,
		'a held pointer deposits the selected liquid'
	);

	await page.locator( '[data-tool="stir"]' ).click();
	await page.mouse.move( box.x + box.width * 0.32, box.y + box.height * 0.5 );
	await page.mouse.down();
	await page.mouse.move( box.x + box.width * 0.7, box.y + box.height * 0.6, {
		steps: 15,
	} );
	await page.mouse.up();
	check(
		await page.evaluate( () =>
			window.__wpieFluidLab.sim.u.some( ( n ) => Math.abs( n ) > 0.1 )
		),
		'a real stirring gesture imparts momentum'
	);
	await page.locator( '[data-tool="wall"]' ).click();
	await page.mouse.click( box.x + box.width * 0.5, box.y + box.height * 0.5 );
	check(
		await page.evaluate( () =>
			window.__wpieFluidLab.sim.wall.some( ( n ) => n > 0.5 )
		),
		'the obstacle tool places a real flow barrier'
	);
	const lightBefore = await signature();
	const lightInput = page.locator( '[data-setting="light"]' );
	await lightInput.focus();
	await page.keyboard.press( 'End' );
	check(
		( await signature() ).hash !== lightBefore.hash,
		'the light control changes the actual optical rendering'
	);
	let savedState = await snapshot(),
		savedPicture = await signature();
	await page.locator( '[data-mode="classic"]' ).click();
	check(
		classic ===
			( await page.evaluate( () =>
				JSON.stringify( window.__marblingStudio.getState().ops )
			) ),
		'switching modes preserves the classic history'
	);
	await open();
	check(
		savedState === ( await snapshot() ),
		'switching back restores the lab state'
	);
	check(
		savedPicture.hash === ( await signature() ).hash,
		'switching back restores the same wet picture'
	);
	check(
		( await signature( 'print' ) ).hash !== savedPicture.hash,
		'paper print and wet surface are distinct outputs'
	);
	await qa.shot( 'qa-fluid-bath.png' );
	const scroll = await page.evaluate( () => {
		const left = document.querySelector( '.wpiemb-lab-left' ),
			list = document.querySelector( '.wpiemb-lab-experiments' ),
			content = document.querySelector( '.wpiemb-lab-scroll' );
		return {
			left: left.scrollHeight - left.clientHeight,
			list: list.scrollHeight - list.clientHeight,
			content: content.scrollHeight - content.clientHeight,
		};
	} );
	check(
		scroll.left <= 1 && scroll.list <= 1 && scroll.content > 100,
		'the shared library content scrolls below the fixed mode buttons'
	);
	// Exercise the actual download and re-import, not just the save helper.
	const savedDownload = page.waitForEvent( 'download' );
	await page.locator( '[data-action="save"]' ).click();
	const experimentFile = await savedDownload;
	const experimentPath = path.join(
		root,
		'dist',
		'qa-fluid-experiment.json'
	);
	await experimentFile.saveAs( experimentPath );
	const saved = JSON.parse( fs.readFileSync( experimentPath, 'utf8' ) );
	check(
		saved.type === 'wpie-fluid-lab' && saved.snapshot.data === savedState,
		'downloaded experiment contains the exact state'
	);
	await page.locator( '[data-experiment="honey"]' ).click();
	check(
		( await snapshot() ) !== savedState,
		'another experiment replaces the bath'
	);
	await page.locator( '.wpiemb-lab-file' ).setInputFiles( experimentPath );
	await page.waitForTimeout( 300 );
	check(
		( await snapshot() ) === savedState,
		'opening the downloaded experiment restores the bath'
	);
	const pngExpected = await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.renderer.update( lab.settings );
		return lab.renderer
			.still( 1600, 1200 )
			.toDataURL( 'image/png' )
			.split( ',' )[ 1 ];
	} );
	const pngDownload = page.waitForEvent( 'download' );
	await page.locator( '[data-action="png"]' ).click();
	const png = await pngDownload;
	const pngPath = path.join( root, 'dist', 'qa-fluid-export.png' );
	await png.saveAs( pngPath );
	check(
		fs.readFileSync( pngPath ).toString( 'base64' ) === pngExpected,
		'PNG download contains precisely the frozen wet render'
	);
	// Record real encoded bytes. The live bath must keep its progressed state.
	const timeBeforeFilm = await page.evaluate(
		() => window.__wpieFluidLab.sim.time
	);
	const filmDownload = page.waitForEvent( 'download', { timeout: 30000 } );
	await page.locator( '[data-action="record"]' ).click();
	check(
		await page.evaluate(
			() => ! window.__wpieFluidLab.renderer.viewControls.control.enabled
		),
		'camera input locks during the video recording'
	);
	const film = await filmDownload;
	const filmPath = path.join( root, 'dist', 'qa-fluid-film.webm' );
	await film.saveAs( filmPath );
	check(
		fs.statSync( filmPath ).size > 1000,
		'video recording produces encoded media'
	);
	const media = await page.evaluate( async ( data ) => {
		const bytes = Uint8Array.from( atob( data ), ( c ) =>
			c.charCodeAt( 0 )
		);
		const url = URL.createObjectURL(
			new Blob( [ bytes ], { type: 'video/webm' } )
		);
		const video = document.createElement( 'video' );
		video.preload = 'auto';
		try {
			return await new Promise( ( resolve, reject ) => {
				const timer = setTimeout(
					() => reject( new Error( 'video decode timeout' ) ),
					10000
				);
				video.onloadeddata = () => {
					clearTimeout( timer );
					resolve( {
						width: video.videoWidth,
						height: video.videoHeight,
					} );
				};
				video.onerror = () => {
					clearTimeout( timer );
					reject( new Error( 'video decode failed' ) );
				};
				video.src = url;
			} );
		} finally {
			video.removeAttribute( 'src' );
			video.load();
			URL.revokeObjectURL( url );
		}
	}, fs.readFileSync( filmPath ).toString( 'base64' ) );
	check(
		media.width > 0 && media.height > 0,
		'the recorded video decodes a real frame'
	);
	await page.waitForTimeout( 200 );
	check(
		await page.evaluate(
			( before ) => window.__wpieFluidLab.sim.time > before,
			timeBeforeFilm
		),
		'recording advances the bath without rewinding'
	);
	check(
		! ( await page.locator( '[data-action="record"]' ).isDisabled() ) &&
			( await page.evaluate(
				() =>
					window.__wpieFluidLab.renderer.viewControls.control.enabled
			) ),
		'controls unlock after recording'
	);
	savedState = await snapshot();
	savedPicture = await signature();
	// Insert -> editor generator edit -> Update must preserve position and IDs.
	await page.getByRole( 'button', { name: 'Insert', exact: true } ).click();
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiemb-lab-dialog' )
	);
	const inserted = await page.evaluate(
		() =>
			window.__dispatched.findLast( ( a ) => a.type === 'ADD_LAYER' )
				?.layer
	);
	check(
		inserted?.generator?.params?.mode === 'fluid' &&
			inserted.src.startsWith( 'data:image/png' ),
		'insert creates a reopenable fluid generator with a real PNG'
	);
	await page.evaluate( ( layer ) => {
		window.__gen.edit( { editor: window.__editor, layer } );
		window.__wpieFluidLab.pause();
	}, inserted );
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	check(
		( await snapshot() ) === savedState,
		'generator edit restores the exact inserted state'
	);
	check(
		( await signature() ).hash === savedPicture.hash,
		'generator edit restores the exported appearance'
	);
	await page.getByRole( 'button', { name: 'Update', exact: true } ).click();
	const updated = await page.evaluate( () =>
		window.__dispatched.findLast( ( a ) => a.type === 'UPDATE_LAYER' )
	);
	check(
		updated?.id === inserted.id &&
			! ( 'x' in updated.patch ) &&
			! ( 'w' in updated.patch ),
		'Update targets the existing layer without changing its placement'
	);
	await page.evaluate( () =>
		window.__gen.run( { editor: window.__editor } )
	);
	await open();
	for ( const [ id, material ] of [
		[ 'silver', 'metal' ],
		[ 'alcohol_bloom', 'alcohol' ],
		[ 'soap_cells', 'surfactant' ],
	] ) {
		await page.locator( '[data-experiment="' + id + '"]' ).click();
		check(
			await page.evaluate(
				( m ) =>
					window.__wpieFluidLab.settings.material === m &&
					window.__wpieFluidLab.sim[ m ].some( ( n ) => n > 0 ),
				material
			),
			id + ' loads its distinct material'
		);
		const picture = await signature();
		check(
			picture.opaque > 40000 && picture.varied > 500,
			id + ' has a visible rendered bath'
		);
		await qa.shot( 'qa-fluid-' + id + '.png' );
	}

	// New forces are exercised with the real controls and real pointer events.
	const at = async ( x, y ) =>
		page.evaluate(
			( point ) => {
				const lab = window.__wpieFluidLab,
					p = lab.renderer.projectPoint( point.x, point.y ),
					r = lab.canvas.getBoundingClientRect();
				return { x: r.left + p.x, y: r.top + p.y };
			},
			{ x, y }
		);
	const evolve = async ( n ) =>
		page.evaluate( ( count ) => {
			const lab = window.__wpieFluidLab;
			for ( let k = 0; k < count; k++ )
				lab.sim.step( lab.settings, 1 / 30 );
			lab.renderer.update( lab.settings );
			lab.renderer.render();
		}, n );
	for ( const id of [
		'mix_orange',
		'mix_green',
		'thermal_flow',
		'ferro_twin',
		'reactive_fronts',
	] ) {
		await page.locator( '[data-experiment="' + id + '"]' ).click();
		const picture = await signature();
		check(
			picture.opaque > 40000 &&
				( id === 'ferro_twin'
					? picture.dark > 500 && picture.light > 500
					: picture.varied > 500 ),
			id + ' has a visible fluid result'
		);
		check(
			await page.evaluate( () => {
				const sources = window.__wpieFluidLab.sim.sources,
					markers = [
						...document.querySelectorAll( '.wpiemb-lab-source' ),
					];
				return (
					markers.length === sources.length &&
					sources.every( ( source ) => {
						const marker = markers.find(
							( node ) =>
								Number( node.dataset.source ) === source.id
						);
						return marker?.dataset.kind === source.type;
					} )
				);
			} ),
			id + ' updates every source handle to the current experiment'
		);
		await qa.shot( 'qa-fluid-' + id + '.png' );
	}
	await page.locator( '[data-experiment="thermal_flow"]' ).click();
	const hot = await at( 0.4, 0.4 );
	await page.mouse.click( hot.x, hot.y );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.sources.length === 2
		),
		'a source handle selects its existing source without creating a duplicate'
	);
	await page.locator( '[data-setting="sourcePower"]' ).focus();
	await page.keyboard.press( 'End' );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.sources[ 0 ].power === 3
		),
		'source strength updates the selected heater'
	);
	const thermalBefore = await page.evaluate( () =>
		Math.max( ...window.__wpieFluidLab.sim.temperature )
	);
	await evolve( 20 );
	check(
		await page.evaluate(
			( before ) =>
				Math.max( ...window.__wpieFluidLab.sim.temperature ) > before,
			thermalBefore
		),
		'the placed heater keeps adding heat after release'
	);
	await page.locator( '[data-tool="magnet"]' ).click();
	const where = await at( 0.65, 0.35 );
	await page.mouse.click( where.x, where.y );
	const endPoint = await at( 0.75, 0.55 );
	await page.mouse.move( where.x, where.y );
	await page.mouse.down();
	await page.mouse.move( endPoint.x, endPoint.y, { steps: 8 } );
	await page.mouse.up();
	check(
		await page.evaluate( () => {
			const source = window.__wpieFluidLab.sim.sources.find(
				( source ) => source.type === 'magnet'
			);
			return (
				Math.abs( source.x - 0.75 ) < 0.02 &&
				Math.abs( source.y - 0.55 ) < 0.02
			);
		} ),
		'dragging moves the actual magnetic source'
	);
	await page.locator( '[data-action="removeSource"]' ).click();
	check(
		await page.evaluate(
			() =>
				! window.__wpieFluidLab.sim.sources.some(
					( source ) => source.type === 'magnet'
				)
		),
		'remove selected source removes its force'
	);
	await page.locator( '[data-material="ferro"]' ).click();
	const startFerro = await page.evaluate( () =>
		window.__wpieFluidLab.sim.ferro.reduce( ( a, b ) => a + b, 0 )
	);
	const pourPoint = await at( 0.5, 0.5 );
	await page.mouse.click( pourPoint.x, pourPoint.y );
	check(
		await page.evaluate(
			( before ) =>
				window.__wpieFluidLab.sim.ferro.reduce( ( a, b ) => a + b, 0 ) >
				before,
			startFerro
		),
		'the material picker deposits real magnetic liquid'
	);
	await page.locator( '[data-experiment="reactive_fronts"]' ).click();
	const beforeAcid = await page.evaluate( () =>
		window.__wpieFluidLab.sim.acid.reduce( ( a, b ) => a + b, 0 )
	);
	await page.locator( '[data-material="acid"]' ).click();
	const acidPoint = await at( 0.5, 0.5 );
	await page.mouse.click( acidPoint.x, acidPoint.y );
	check(
		await page.evaluate(
			( before ) =>
				window.__wpieFluidLab.sim.acid.reduce( ( a, b ) => a + b, 0 ) >
				before,
			beforeAcid
		),
		'acid is delivered through the liquid controls'
	);
	const beforeReaction = await signature();
	await evolve( 30 );
	check(
		( await signature() ).hash !== beforeReaction.hash,
		'reactive ink evolves through transport and neutralization'
	);
	await page.locator( '[data-experiment="hot_ferro"]' ).click();
	const forceState = await page.evaluate( () =>
		window.__wpieFluidLab.save()
	);
	const forcesDownload = page.waitForEvent( 'download' );
	await page.locator( '[data-action="save"]' ).click();
	const forcesFile = await forcesDownload,
		forcesPath = path.join( root, 'dist', 'qa-fluid-forces.json' );
	await forcesFile.saveAs( forcesPath );
	await page.locator( '[data-experiment="blank"]' ).click();
	await page.locator( '.wpiemb-lab-file' ).setInputFiles( forcesPath );
	await page.waitForTimeout( 200 );
	check(
		await page.evaluate(
			( expected ) =>
				JSON.stringify( window.__wpieFluidLab.save() ) ===
				JSON.stringify( expected ),
			forceState
		),
		'download and reopen preserve all pigments, temperatures and force positions'
	);
	const withHandles = await signature();
	await page.getByLabel( 'Show source handles', { exact: true } ).uncheck();
	check(
		( await signature() ).hash === withHandles.hash,
		'apparatus handles never appear in the fluid export'
	);
	await page.getByLabel( 'Show source handles', { exact: true } ).check();
	await qa.shot( 'qa-fluid-forces.png' );
	await page.locator( '[data-experiment="islands"]' ).click();
	await page.evaluate( () => window.__wpieFluidLab.pause( false ) );
	const flowTime = () =>
		page.evaluate( () => window.__wpieFluidLab.sim.time );
	const liveSave = page.waitForEvent( 'download' );
	await page.locator( '[data-action="save"]' ).click();
	await liveSave;
	let time = await flowTime();
	await page.waitForTimeout( 350 );
	check(
		( await flowTime() ) > time &&
			( await page.evaluate( () => ! window.__wpieFluidLab.paused ) ),
		'saving an experiment leaves the bath flowing'
	);
	const livePNG = page.waitForEvent( 'download' );
	await page.locator( '[data-action="png"]' ).click();
	await livePNG;
	time = await flowTime();
	await page.waitForTimeout( 350 );
	check( ( await flowTime() ) > time, 'PNG export leaves the bath flowing' );
	await page.locator( '.wpiemb-lab-file' ).setInputFiles( experimentPath );
	await page.waitForTimeout( 350 );
	check(
		( await flowTime() ) > saved.snapshot.time &&
			( await page.evaluate( () => ! window.__wpieFluidLab.paused ) ),
		'opening an experiment resumes its flow automatically'
	);
	await page.evaluate( () => window.__wpieFluidLab.close() );
	await page.evaluate(
		( layer ) => window.__gen.edit( { editor: window.__editor, layer } ),
		inserted
	);
	time = await flowTime();
	await page.waitForTimeout( 350 );
	check(
		( await flowTime() ) > time &&
			( await page.evaluate( () => ! window.__wpieFluidLab.paused ) ),
		'reopening a generator resumes its flow automatically'
	);
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	await page.setViewportSize( { width: 1100, height: 780 } );
	await page.waitForTimeout( 200 );
	check(
		await page
			.locator( '.wpiemb-lab-canvas' )
			.evaluate( ( e ) => e.getBoundingClientRect().width > 300 ),
		'the bath remains usable at a smaller desktop size'
	);
	await qa.shot( 'qa-fluid-small.png' );
	await page.keyboard.press( 'Escape' );
	check(
		( await page.locator( '.wpiemb-lab-dialog' ).count() ) === 0,
		'Escape closes the lab'
	);
	check(
		await page.evaluate( () => ! window.__wpieFluidLab ),
		'close releases the lab API and renderer'
	);
	exitCode = qa.failures() ? 1 : 0;
} finally {
	await qa.browser.close();
}
process.exitCode = exitCode;
