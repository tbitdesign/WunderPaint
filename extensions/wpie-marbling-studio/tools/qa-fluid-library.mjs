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
	out: path.join( root, 'dist/qa-library-stage' ),
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
const choose = async ( id ) => {
	await page.evaluate( ( id ) => {
		const lab = window.__wpieFluidLab;
		lab.choose( id, 17 );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
		lab.pause();
	}, id );
	await page.waitForTimeout( 80 );
};
const sourceCenter = async ( id ) =>
	page.evaluate( ( id ) => {
		const r = document
			.querySelector( `[data-source="${ id }"]` )
			.getBoundingClientRect();
		return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
	}, id );
const newIds = [
	'lab_viscosity',
	'lab_oil_water',
	'lab_diffusion',
	'lab_warm_oil',
	'lab_alcohol',
	'lab_soap_gate',
	'lab_magnet_line',
	'lab_magnet_ring',
	'lab_ferro_dilute',
	'lab_metal_oil',
	'lab_ph',
	'lab_buffer',
	'volume_oil_mix',
	'volume_bubbles_metal',
	'volume_double_wave',
	'volume_crystal_front',
	'volume_tilt',
	'volume_magnetic',
];
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	check(
		( await page.locator( '[data-experiment]' ).count() ) === 60,
		'60 experiment cards are available'
	);
	await choose( 'lab_viscosity' );
	check(
		(
			await page.locator( '.wpiemb-lab-experiment-note' ).innerText()
		).includes( 'Falten' ),
		'The selected experiment explains what to try in German'
	);
	for ( const size of [
		{ width: 1500, height: 1000 },
		{ width: 1100, height: 780 },
	] ) {
		await page.setViewportSize( size );
		await page.waitForTimeout( 100 );
		const scroll = await page.evaluate( () => {
			const left = document.querySelector( '.wpiemb-lab-left' ),
				body = document.querySelector( '.wpiemb-lab-scroll' ),
				modes = document.querySelector( '.wpiemb-lab-modes' ),
				grid = document.querySelector( '.wpiemb-lab-experiments' );
			body.scrollTop = 0;
			const modeTop = modes.getBoundingClientRect().top,
				materialTop = document
					.querySelector( '.wpiemb-lab-materials' )
					.getBoundingClientRect().top;
			body.scrollTop = 480;
			return {
				modesFixed: modes.getBoundingClientRect().top === modeTop,
				materialsMoved:
					materialTop -
						document
							.querySelector( '.wpiemb-lab-materials' )
							.getBoundingClientRect().top >
					400,
				oneScroll:
					body.scrollTop > 400 &&
					left.scrollHeight <= left.clientHeight + 1 &&
					grid.scrollHeight <= grid.clientHeight + 1,
				clipped:
					body.getBoundingClientRect().top >=
					modes.getBoundingClientRect().bottom,
				pills: [ ...document.querySelectorAll( '[data-view]' ) ].every(
					( b ) => {
						const r = b.getBoundingClientRect(),
							v = document
								.querySelector( '.wpiemb-lab-view' )
								.getBoundingClientRect();
						return (
							r.left >= v.left &&
							r.right <= v.right &&
							r.height >= 24
						);
					}
				),
			};
		} );
		check(
			scroll.modesFixed && scroll.materialsMoved && scroll.clipped,
			size.width + ': only the content below the mode buttons scrolls'
		);
		check(
			scroll.oneScroll,
			size.width + ': the experiment grid has no nested scrollbar'
		);
		check(
			scroll.pills,
			size.width + ': all four view pills fit inside the preview'
		);
	}
	for ( const id of [ 'ferro_pool', 'volume_oil_mix' ] ) {
		await choose( id );
		const before = await page.evaluate(
			() => window.__wpieFluidLab.sim.snapshot().data
		);
		for ( const [ name, angle ] of [
			[ 'top', 0 ],
			[ 'perspective', 55 ],
			[ 'side', 90 ],
			[ 'bottom', 180 ],
		] ) {
			await page.locator( `[data-view="${ name }"]` ).click();
			await page.waitForTimeout( 70 );
			check(
				( await page.evaluate( ( angle ) => {
					const l = window.__wpieFluidLab;
					return (
						l.settings[
							l.sim.kind === 'volume' ? 'volumeAngle' : 'angle'
						] === angle
					);
				}, angle ) ) &&
					( await page
						.locator( `[data-view="${ name }"]` )
						.getAttribute( 'aria-pressed' ) ) === 'true',
				id + ': ' + name + ' selects the camera view'
			);
		}
		check(
			before ===
				( await page.evaluate(
					() => window.__wpieFluidLab.sim.snapshot().data
				) ),
			id + ': view pills leave every physical field unchanged'
		);
		await page.locator( '[data-view="top"]' ).click();
		const state = await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			const saved = l.save();
			l.restore( saved );
			return JSON.stringify( l.save() ) === JSON.stringify( saved );
		} );
		check(
			state,
			id + ': the selected top view survives saving and reopening'
		);
	}
	await page.setViewportSize( { width: 1500, height: 1000 } );
	for ( const id of [
		'ferro_pool',
		'ferro_twin',
		'hot_ferro',
		'volume_crystal_front',
		'volume_magnetic',
	] ) {
		await choose( id );
		await page.locator( '[data-view="perspective"]' ).click();
		await page.waitForTimeout( 80 );
		const stable = await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			const markers = () =>
				[ ...document.querySelectorAll( '[data-source]' ) ].map(
					( el ) => ( { left: el.style.left, top: el.style.top } )
				);
			const before = markers();
			const initial = l.sim.snapshot().data;
			let unchanged = true;
			for ( let batch = 0; batch < 3; batch++ ) {
				for ( let k = 0; k < 15; k++ ) l.sim.step( l.settings, 1 / 30 );
				l.renderer.update( l.settings );
				l.renderer.render();
				l.pause();
				unchanged &&=
					JSON.stringify( before ) === JSON.stringify( markers() );
			}
			return {
				unchanged,
				evolved: initial !== l.sim.snapshot().data,
				count: before.length,
			};
		} );
		check(
			stable.unchanged && stable.evolved && stable.count > 0,
			id + ': sources stay pixel-stable while the fluid evolves'
		);
		const p = await sourceCenter( 1 );
		const old = await page.evaluate( () => ( {
			...window.__wpieFluidLab.sim.sources[ 0 ],
		} ) );
		const tool = old.type;
		await page.locator( `[data-tool="${ tool }"]` ).click();
		await page.mouse.move( p.x, p.y );
		await page.mouse.down();
		await page.mouse.move( p.x + 28, p.y + 8, { steps: 5 } );
		await page.mouse.up();
		const dragged = await sourceCenter( 1 );
		check(
			Math.abs( dragged.x - p.x - 28 ) < 1.5 &&
				Math.abs( dragged.y - p.y - 8 ) < 1.5,
			id + ': dragging follows the pointer on the fixed source plane'
		);
		await page.locator( '[data-tool="removeSource"]' ).click();
		await page.mouse.click( dragged.x, dragged.y );
		check(
			( await page.locator( '[data-source="1"]' ).count() ) === 0,
			id + ': the displayed source can be removed'
		);
	}
	await choose( 'ferro_twin' );
	await page.locator( '[data-view="perspective"]' ).click();
	const liveBefore = await sourceCenter( 1 );
	await page.evaluate( () => window.__wpieFluidLab.pause( false ) );
	await page.waitForTimeout( 1600 );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	const liveAfter = await sourceCenter( 1 );
	check(
		Math.hypot( liveBefore.x - liveAfter.x, liveBefore.y - liveAfter.y ) <
			0.05,
		'Source icons also stay still during ordinary requestAnimationFrame playback'
	);
	await choose( 'volume_clouds' );
	for ( const tab of [ 'liquids', 'chemistry' ] ) {
		await page.locator( `[data-fluid-palette="${ tab }"]` ).click();
		const ids = await page
			.locator( '[data-material]:visible' )
			.evaluateAll( ( nodes ) =>
				nodes.map( ( n ) => n.dataset.material )
			);
		for ( const id of ids ) {
			await page.locator( `[data-material="${ id }"]` ).click();
			const intro = await page
				.locator( '.wpiemb-liquid-intro' )
				.innerText();
			check(
				intro.length > 40 && ! intro.includes( 'undefined' ),
				id + ': has a visible introductory explanation'
			);
			if ( await page.locator( '.wpiemb-pigment-control' ).count() ) {
				check(
					await page.evaluate(
						() =>
							!! (
								document
									.querySelector( '.wpiemb-liquid-intro' )
									.compareDocumentPosition(
										document.querySelector(
											'.wpiemb-pigment-control'
										)
									) & Node.DOCUMENT_POSITION_FOLLOWING
							)
					),
					id + ': introduction precedes pigment color'
				);
			}
		}
	}
	for ( const id of newIds ) {
		await choose( id );
		check(
			( await page.locator( '.wpiemb-lab-experiment-note' ).innerText() )
				.length > 40,
			id + ': explains the experiment'
		);
		const result = await page.evaluate( () => {
			const l = window.__wpieFluidLab;
			const state = l.save();
			const c = l.renderer.still( 240, 180, 'wet' ),
				d = c.getContext( '2d' ).getImageData( 0, 0, 240, 180 ).data;
			let opaque = 0,
				min = 255,
				max = 0;
			for ( let k = 0; k < d.length; k += 4 ) {
				if ( d[ k + 3 ] > 240 ) opaque++;
				min = Math.min( min, d[ k ] );
				max = Math.max( max, d[ k ] );
			}
			l.restore( state );
			return {
				visible: opaque > 5000 && max - min > 30,
				exact: JSON.stringify( l.save() ) === JSON.stringify( state ),
				image: c.toDataURL(),
			};
		} );
		check(
			result.visible && result.exact,
			id + ': renders real liquid and saves/reopens exactly'
		);
		fs.writeFileSync(
			path.join( root, 'dist', 'qa-library-' + id + '.png' ),
			Buffer.from( result.image.split( ',' )[ 1 ], 'base64' )
		);
	}
	await page.waitForFunction(
		() =>
			document.querySelectorAll(
				'[data-experiment] canvas[data-ready="true"]'
			).length === 60,
		{ timeout: 120000 }
	);
	check( true, 'All 60 preview thumbnails rendered' );
	await choose( 'lab_viscosity' );
	await page.evaluate( () => {
		document.querySelector( '.wpiemb-lab-scroll' ).scrollTop = 340;
		document.querySelector( '.wpiemb-side' ).scrollTop = 180;
	} );
	await qa.shot( 'qa-fluid-library-de.png' );
	await choose( 'ferro_pool' );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		for ( let k = 0; k < 300; k++ ) l.sim.step( l.settings, 1 / 30 );
		l.renderer.update( l.settings );
		l.renderer.render();
		l.pause();
	} );
	await qa.shot( 'qa-fluid-library-ferro.png' );
	await page.locator( '[data-view="top"]' ).click();
	await qa.shot( 'qa-fluid-library-top.png' );
	await page.setViewportSize( { width: 1100, height: 780 } );
	await choose( 'lab_viscosity' );
	await page.evaluate( () => {
		document.querySelector( '.wpiemb-lab-scroll' ).scrollTop = 400;
		document.querySelector( '.wpiemb-side' ).scrollTop = 220;
	} );
	await qa.shot( 'qa-fluid-library-small.png' );
	await page.evaluate( () => window.__wpieFluidLab.close() );
	check(
		( await page.locator( '.wpiemb-lab-dialog' ).count() ) === 0,
		'The dialog cleans up its canvases and view controls'
	);
	exitCode = 0;
} finally {
	const failures = await qa.finish();
	if ( failures ) exitCode = failures;
}
process.exit( exitCode );
