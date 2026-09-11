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
	out: path.join( root, 'dist/qa-open-stage' ),
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

const picture = async () =>
	page.evaluate( () => {
		const lab = window.__wpieFluidLab,
			r = lab.canvas.getBoundingClientRect();
		const aspect = r.width / r.height,
			w = 480,
			h = Math.round( w / aspect );
		lab.renderer.update( lab.settings );
		lab.renderer.render();
		const camera = lab.renderer.volume?.camera || lab.renderer.camera;
		const before = {
			left: camera.left,
			right: camera.right,
			top: camera.top,
			bottom: camera.bottom,
			zoom: camera.zoom,
		};
		const canvas = lab.renderer.still( w, h, 'wet' );
		const data = canvas.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
		let transparent = 0;
		for ( let i = 3; i < data.length; i += 4 )
			if ( data[ i ] < 250 ) transparent++;
		return {
			transparent,
			ratio: aspect,
			framingUnchanged: Object.entries( before ).every(
				( [ key, value ] ) => Math.abs( camera[ key ] - value ) < 1e-6
			),
			src: canvas.toDataURL( 'image/png' ),
		};
	} );
const checkPng = async ( src ) =>
	page.evaluate( async ( src ) => {
		const image = new Image();
		image.src = src;
		await image.decode();
		const c = document.createElement( 'canvas' );
		c.width = image.width;
		c.height = image.height;
		const ctx = c.getContext( '2d' );
		ctx.drawImage( image, 0, 0 );
		const data = ctx.getImageData( 0, 0, c.width, c.height ).data;
		let clear = 0;
		for ( let i = 3; i < data.length; i += 4 )
			if ( data[ i ] < 250 ) clear++;
		return { clear, w: c.width, h: c.height };
	}, src );
const setBoundary = async ( boundary ) => {
	await page.locator( '[data-setting="boundary"]' ).selectOption( boundary );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.renderer.update( lab.settings );
		lab.renderer.render();
		lab.pause();
	} );
};
const snapshot = () =>
	page.evaluate( () =>
		JSON.stringify( window.__wpieFluidLab.sim.snapshot() )
	);
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => window.__wpieFluidLab.pause() );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.boundary === 'open'
		),
		'Fresh artwork starts with open edges'
	);
	for ( const id of [
		'islands',
		'ferro_pool',
		'volume_oil_mix',
		'volume_tilt',
	] ) {
		await choose( id );
		const result = await picture();
		fs.writeFileSync(
			path.join( root, 'dist', 'qa-open-' + id + '-output.png' ),
			Buffer.from( result.src.split( ',' )[ 1 ], 'base64' )
		);
		check(
			result.transparent === 0,
			id + ': wet artwork covers the complete document'
		);
		check(
			Math.abs( result.ratio - 4 / 3 ) < 0.001 && result.framingUnchanged,
			id + ': document aspect and preview framing survive export'
		);
		check(
			await page.evaluate(
				() => window.__wpieFluidLab.settings.boundary === 'open'
			),
			id + ': selecting a preset keeps the open boundary'
		);
		if ( id.startsWith( 'volume' ) )
			check(
				await page.evaluate(
					() =>
						! window.__wpieFluidLab.renderer.volume.outline.visible
				),
				id + ': no basin outline is rendered'
			);
		await qa.shot( 'qa-open-' + id + '.png' );
	}
	for ( const id of [ 'ferro_twin', 'volume_magnetic' ] ) {
		await choose( id );
		const before = await snapshot();
		for ( const [ view, angle ] of [
			[ 'top', 0 ],
			[ 'perspective', 55 ],
			[ 'side', 90 ],
			[ 'bottom', 180 ],
		] ) {
			await page.locator( '[data-view="' + view + '"]' ).click();
			await page.waitForTimeout( 100 );
			check(
				await page.evaluate( ( angle ) => {
					const l = window.__wpieFluidLab;
					return (
						Math.abs(
							l.settings[
								l.sim.kind === 'volume'
									? 'volumeAngle'
									: 'angle'
							] - angle
						) < 0.001
					);
				}, angle ),
				id + ': ' + view + ' sets the requested angle'
			);
			check(
				( await snapshot() ) === before,
				id + ': ' + view + ' leaves the physical state untouched'
			);
			if ( view === 'top' || view === 'perspective' )
				check(
					( await picture() ).transparent === 0,
					id + ': ' + view + ' fills the artwork'
				);
			if ( view === 'side' ) {
				check(
					await page.evaluate( () => {
						const l = window.__wpieFluidLab,
							c = l.renderer.volume?.camera || l.renderer.camera;
						return (
							c.right - c.left >= l.sim.aspect &&
							c.top - c.bottom >= 1
						);
					} ),
					id + ': side view keeps an overview of the whole fluid'
				);
				await qa.shot( 'qa-open-' + id + '-side.png' );
			}
		}
		await page.locator( '[data-view="top"]' ).click();
		await page.locator( '[data-tool="orbit"]' ).click();
		const rect = await page.locator( '.wpiemb-lab-canvas' ).boundingBox();
		await page.mouse.move(
			rect.x + rect.width / 2,
			rect.y + rect.height / 2
		);
		await page.mouse.down();
		await page.mouse.move(
			rect.x + rect.width / 2 + 80,
			rect.y + rect.height / 2 + 55,
			{ steps: 7 }
		);
		await page.mouse.up();
		check(
			await page.evaluate( () => {
				const l = window.__wpieFluidLab;
				return Math.abs( l.settings.viewYaw ) > 1;
			} ),
			id + ': pointer orbit still rotates the camera'
		);
		check(
			( await snapshot() ) === before,
			id + ': pointer orbit leaves the fluid unchanged'
		);
	}
	await choose( 'ferro_pool' );
	for ( const viewport of [
		{ width: 1500, height: 1000 },
		{ width: 1100, height: 780 },
	] ) {
		await page.setViewportSize( viewport );
		await page.waitForTimeout( 120 );
		const projection = await page.evaluate( () => {
			const l = window.__wpieFluidLab,
				r = l.canvas.getBoundingClientRect(),
				s = l.sim.sources[ 0 ],
				p = l.renderer.projectSource( s.x, s.y ),
				m = document
					.querySelector( '[data-source="' + s.id + '"]' )
					.getBoundingClientRect();
			return {
				dx: Math.abs( r.x + p.x - m.x - m.width / 2 ),
				dy: Math.abs( r.y + p.y - m.y - m.height / 2 ),
				id: l.renderer.pickSource(
					m.x + m.width / 2,
					m.y + m.height / 2
				)?.id,
				expected: s.id,
				ratio: r.width / r.height,
			};
		} );
		check(
			projection.dx < 1 &&
				projection.dy < 1 &&
				projection.id === projection.expected,
			viewport.width +
				': source icon and picking stay aligned with the fitted canvas'
		);
		check(
			Math.abs( projection.ratio - 4 / 3 ) < 0.001,
			viewport.width + ': preview keeps document proportions'
		);
	}
	const id = await page.evaluate(
		() => window.__wpieFluidLab.sim.sources[ 0 ].id
	);
	const beforeSource = await page.evaluate( () => ( {
		...window.__wpieFluidLab.sim.sources[ 0 ],
	} ) );
	const handle = await sourceCenter( id );
	await page.mouse.move( handle.x, handle.y );
	await page.mouse.down();
	await page.mouse.move( handle.x + 24, handle.y + 15, { steps: 4 } );
	await page.mouse.up();
	check(
		await page.evaluate( ( before ) => {
			const s = window.__wpieFluidLab.sim.sources[ 0 ];
			return Math.hypot( s.x - before.x, s.y - before.y ) > 0.02;
		}, beforeSource ),
		'Dragging the aligned handle moves its source'
	);
	await page.locator( '[data-tool="removeSource"]' ).click();
	const moved = await sourceCenter( id );
	await page.mouse.click( moved.x, moved.y );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.sources.length === 0
		),
		'Remove source works with the new canvas framing'
	);
	await choose( 'ferro_twin' );
	await page.evaluate( () => {
		const l = window.__wpieFluidLab;
		l.settings.viewZoom = 4;
		l.renderer.update( l.settings );
		l.renderer.render();
		l.pause();
	} );
	check(
		( await page.locator( '.wpiemb-lab-source[hidden]' ).count() ) > 0 &&
			( await page
				.locator( '.wpiemb-lab-source[hidden]:visible' )
				.count() ) === 0,
		'Source handles outside the artwork are clipped'
	);
	await page.locator( '[data-view="top"]' ).click();
	const beforeBoundary = await snapshot();
	await setBoundary( 'closed' );
	check(
		( await snapshot() ) === beforeBoundary,
		'Changing the boundary keeps all current liquid and sources'
	);
	await choose( 'volume_oil_mix' );
	check(
		await page.evaluate(
			() =>
				window.__wpieFluidLab.settings.boundary === 'closed' &&
				window.__wpieFluidLab.renderer.volume.outline.visible
		),
		'Closed boundaries are retained across preset changes'
	);
	await setBoundary( 'open' );
	const saved = await page.evaluate( () => window.__wpieFluidLab.save() );
	await page.evaluate( ( saved ) => {
		const l = window.__wpieFluidLab;
		l.restore( saved );
		l.pause();
	}, saved );
	check(
		await page.evaluate(
			( saved ) =>
				JSON.stringify( window.__wpieFluidLab.save() ) ===
				JSON.stringify( saved ),
			saved
		),
		'Open 3D state reopens exactly'
	);
	await page.setViewportSize( { width: 1500, height: 1000 } );
	await choose( 'islands' );
	await page.locator( '[data-view="perspective"]' ).click();
	await page.evaluate( () => {
		window.__wpieFluidLab.settings.output = 'wet';
	} );
	const insertedState = await page.evaluate( () =>
		window.__wpieFluidLab.save()
	);
	await page.getByRole( 'button', { name: 'Einfügen', exact: true } ).click();
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiemb-lab-dialog' )
	);
	const inserted = await page.evaluate(
		() =>
			window.__dispatched.findLast( ( a ) => a.type === 'ADD_LAYER' )
				?.layer
	);
	check(
		inserted?.x === 0 &&
			inserted?.y === 0 &&
			inserted?.w === 1400 &&
			inserted?.h === 1050,
		'Wet insertion fills the document at its normal size and origin'
	);
	const png = await checkPng( inserted.src );
	check(
		png.clear === 0 && png.w === 1600 && png.h === 1200,
		'Inserted PNG has no transparent basin margin'
	);
	check(
		inserted.generator.params.lab.settings.boundary === 'open',
		'The inserted generator saves its open edges'
	);
	await page.evaluate( ( layer ) => {
		window.__gen.edit( { editor: window.__editor, layer } );
		window.__wpieFluidLab.pause();
	}, inserted );
	check(
		await page.evaluate(
			( state ) =>
				JSON.stringify( window.__wpieFluidLab.save() ) ===
				JSON.stringify( state ),
			insertedState
		),
		'Editing the inserted layer restores its exact state and framing'
	);
	await page
		.getByRole( 'button', { name: 'Aktualisieren', exact: true } )
		.click();
	const updated = await page.evaluate( () =>
		window.__dispatched.findLast( ( a ) => a.type === 'UPDATE_LAYER' )
	);
	check(
		updated?.id === inserted.id &&
			! ( 'w' in updated.patch ) &&
			! ( 'h' in updated.patch ) &&
			! ( 'x' in updated.patch ) &&
			! ( 'y' in updated.patch ),
		'Updating preserves the existing layer dimensions and placement'
	);
	check(
		( await checkPng( updated.patch.src ) ).clear === 0,
		'Updated wet image remains filled to every edge'
	);
	for ( const [ w, h ] of [
		[ 900, 1200 ],
		[ 1800, 600 ],
	] ) {
		await page.evaluate(
			( { w, h } ) => {
				Object.assign( window.__editor.state.doc, { w, h } );
				window.__gen.run( { editor: window.__editor } );
			},
			{ w, h }
		);
		await page.locator( '[data-mode="fluid"]' ).click();
		await page.evaluate( () => window.__wpieFluidLab.pause() );
		const result = await picture();
		check(
			Math.abs( result.ratio - w / h ) < 0.002 &&
				result.transparent === 0,
			w + '×' + h + ': document aspect and full wet coverage'
		);
		await qa.shot( 'qa-open-' + w + 'x' + h + '.png' );
		await page
			.getByRole( 'button', { name: 'Einfügen', exact: true } )
			.click();
		const layer = await page.evaluate(
			() =>
				window.__dispatched.findLast( ( a ) => a.type === 'ADD_LAYER' )
					.layer
		);
		check(
			layer.w === w && layer.h === h && layer.x === 0 && layer.y === 0,
			w + '×' + h + ': insertion has the full document size'
		);
		check(
			( await checkPng( layer.src ) ).clear === 0,
			w + '×' + h + ': exported surface has no empty border'
		);
	}
} finally {
	exitCode = await qa.finish();
}
process.exitCode = exitCode;
