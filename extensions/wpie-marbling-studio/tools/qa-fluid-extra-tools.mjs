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
	out: path.join( root, 'dist/qa-extra-tools-stage' ),
} );
const { build } = await import(
	path.join( root, 'node_modules/esbuild/lib/main.js' )
);
await build( {
	stdin: {
		contents:
			"import { importObstacleLayer } from './extensions/wpie-marbling-studio/src/fluid/obstacle-import.js'; window.__importObstacleLayer=importObstacleLayer; import { renderToCanvas } from './src/lib/raster/render.js'; import { makeShape, makeText, makeGroup } from './src/store/document.js'; window.__factories={makeShape,makeText,makeGroup}; window.WPIE.bridge.raster.renderToCanvas=renderToCanvas; import { mountColorWheel } from './src/lib/mount-color-wheel.js'; window.__actualColorWheelMount = mountColorWheel; window.WPIE.bridge.components.mountColorWheel = mountColorWheel;",
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
const tool = ( id ) => page.locator( `[data-tool="${ id }"]` );
const liquid = ( id ) => page.locator( `[data-material="${ id }"]` );
const current = () =>
	page.evaluate( () => window.__wpieFluidLab.settings.tool );
const setting = async ( key, value ) =>
	page.locator( `[data-setting="${ key }"]` ).evaluate( ( el, value ) => {
		el.value = value;
		el.dispatchEvent( new Event( 'input', { bubbles: true } ) );
	}, String( value ) );
const clickAt = async ( x, y ) => {
	const p = await page.evaluate(
		( { x, y } ) => {
			const lab = window.__wpieFluidLab;
			const rect = lab.canvas.getBoundingClientRect();
			const pt = lab.renderer.projectPoint( x, y );
			return { x: rect.left + pt.x, y: rect.top + pt.y };
		},
		{ x, y }
	);
	await page.mouse.click( p.x, p.y );
};
const position = ( x, y, z ) =>
	page.evaluate(
		( { x, y, z } ) => {
			const lab = window.__wpieFluidLab,
				r = lab.canvas.getBoundingClientRect(),
				p = lab.renderer.projectPoint( x, y, z );
			return { x: r.left + p.x, y: r.top + p.y };
		},
		{ x, y, z }
	);
const dragAt = async ( from, to, z ) => {
	const a = await position( ...from, z ),
		b = await position( ...to, z );
	await page.mouse.move( a.x, a.y );
	await page.mouse.down();
	await page.mouse.move( b.x, b.y, { steps: 8 } );
	await page.mouse.up();
};
const reset = async ( kind ) => {
	await page.evaluate( ( kind ) => {
		const lab = window.__wpieFluidLab;
		lab.choose( kind === 'volume' ? 'volume_oil_mix' : 'blank', 17 );
		lab.pause();
		if ( kind === 'volume' ) {
			lab.sim.count = 0;
			lab.sim.pending = 0;
			lab.sim.obstacles = [];
			for ( const o of [ ...lab.sim.customObstacles.items ] )
				lab.sim.customObstacles.remove( o.id );
		}
	}, kind );
	await page.locator( '[data-view="top"]' ).click();
};
let result = 1;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	for ( const kind of [ 'surface', 'volume' ] ) {
		await reset( kind );
		check(
			( await page
				.locator( '[data-tool-group="apply"] [data-tool]' )
				.count() ) === 4 &&
				( await page
					.locator( '[data-tool-group="flow"] [data-tool]' )
					.count() ) === 4 &&
				( await page
					.locator( '[data-tool-group="obstacles"] [data-tool]' )
					.count() ) === 4,
			`${ kind }: application, flow and obstacles each have four tools`
		);
		check(
			( await page
				.locator( '[data-tool-group="depth"]' )
				.isVisible() ) ===
				( kind === 'volume' ),
			`${ kind }: depth tools form their own section`
		);
		for ( const id of [ 'spray', 'ring' ] ) {
			await reset( kind );
			await liquid( 'silicone' ).click();
			await tool( id ).click();
			await setting( id === 'spray' ? 'spraySpread' : 'ringRadius', 0.2 );
			check(
				( await page
					.locator(
						`.wpiemb-lab-tool-settings [data-setting="${
							id === 'spray' ? 'spraySpread' : 'ringRadius'
						}"]`
					)
					.count() ) === 1,
				`${ kind }: ${ id } exposes its spread/radius in the sidebar`
			);
			await clickAt( 0.5, 0.5 );
			check(
				await page.evaluate( () => {
					const s = window.__wpieFluidLab.sim;
					return s.kind === 'volume'
						? s.count > 0
						: s.silicone.some( ( x ) => x > 0 );
				} ),
				`${ kind }: ${ id } adds silicone through a real canvas click`
			);
			await tool( 'magnet' ).click();
			await liquid( 'silicone' ).click();
			check(
				( await current() ) === id,
				`${ kind }: choosing liquid restores ${ id } after Magnet`
			);
			await tool( 'orbit' ).click();
			await tool( 'orbit' ).click();
			check(
				( await current() ) === id,
				`${ kind }: Rotate returns to ${ id }`
			);
			const state = await page.evaluate( () =>
				window.__wpieFluidLab.save()
			);
			await page.evaluate( ( state ) => {
				window.__wpieFluidLab.restore( state );
				window.__wpieFluidLab.pause();
			}, state );
			check(
				( await current() ) === id &&
					( await tool( id ).getAttribute( 'aria-pressed' ) ) ===
						'true',
				`${ kind }: reopening preserves ${ id } and its active button`
			);
			await qa.shot( `qa-extra-tools-${ kind }-${ id }.png` );
		}
		await reset( kind );
		await liquid( 'oil' ).click();
		await tool( 'pour' ).click();
		await clickAt( 0.5, 0.5 );
		await tool( 'comb' ).click();
		await setting( 'combTeeth', 7 );
		await setting( 'combSpacing', 0.08 );
		check(
			await page.evaluate( () => {
				const p = window.__wpieFluidLab.settings;
				return p.combTeeth === 7 && p.combSpacing === 0.08;
			} ),
			`${ kind }: comb count and spacing controls update actual settings`
		);
		await page.evaluate( () => {
			const s = window.__wpieFluidLab.sim;
			if ( s.kind === 'volume' ) {
				s.vx.fill( 0 );
				s.vy.fill( 0 );
				window.__liquidBeforeComb = s.count;
			} else {
				s.u.fill( 0 );
				s.v.fill( 0 );
				window.__liquidBeforeComb = s.oil.reduce(
					( a, b ) => a + b,
					0
				);
			}
		} );
		await dragAt( [ 0.5, 0.35 ], [ 0.5, 0.7 ] );
		check(
			await page.evaluate( () => {
				const s = window.__wpieFluidLab.sim;
				return (
					( s.kind === 'volume'
						? s.count
						: s.oil.reduce( ( a, b ) => a + b, 0 ) ) ===
						window.__liquidBeforeComb &&
					( s.vy || s.v ).some( ( v ) => Math.abs( v ) > 0.001 )
				);
			} ),
			`${ kind }: dragging Comb creates flow while preserving liquid amount`
		);
		await reset( kind );
		await tool( 'draw' ).click();
		await page
			.locator( '[data-setting="obstacleShape"]' )
			.selectOption( 'star' );
		await setting( 'radius', 0.025 );
		await dragAt( [ 0.2, 0.25 ], [ 0.4, 0.25 ], 0 );
		check(
			await page.evaluate(
				() => window.__wpieFluidLab.sim.customObstacles.items.length > 2
			),
			`${ kind }: Draw paints real solid shape stamps`
		);
		await tool( 'wall' ).click();
		await setting( 'obstacleSize', 0.16 );
		await setting( 'obstacleAngle', 32 );
		const at = await position( 0.3, 0.65, 0 );
		await page.mouse.click( at.x, at.y );
		const original = await page.evaluate( () => ( {
			...window.__wpieFluidLab.sim.customObstacles.items.at( -1 ),
		} ) );
		check(
			original.size === 0.16,
			`${ kind }: switching from Draw to Obstacle uses placement size`
		);
		await tool( 'duplicate' ).click();
		check(
			( await page.locator( '.wpiemb-lab-tool-settings' ).count() ) ===
				0 &&
				( await page
					.locator( '[data-setting="obstacleSize"]' )
					.count() ) === 0,
			`${ kind }: Duplicate shows selection and instructions without editing the original`
		);
		for ( const x of [ 0.55, 0.8 ] ) {
			const p = await position( x, 0.65, 0 );
			await page.mouse.click( p.x, p.y );
		}
		check(
			await page.evaluate( ( original ) => {
				const items = window.__wpieFluidLab.sim.customObstacles.items;
				return (
					JSON.stringify(
						items.find( ( o ) => o.id === original.id )
					) === JSON.stringify( original ) &&
					items
						.slice( -2 )
						.every(
							( o ) =>
								o.id !== original.id &&
								[ 'shape', 'size', 'angle', 'color' ].every(
									( key ) => o[ key ] === original[ key ]
								)
						)
				);
			}, original ),
			`${ kind }: two canvas clicks create independent copies and preserve the original`
		);
		// Re-select an existing form through its projected top face.
		const copied = await page.evaluate( () =>
			window.__wpieFluidLab.sim.customObstacles.items.at( -1 )
		);
		const cp = await position(
			copied.x,
			copied.y,
			kind === 'volume' ? 0.65 : 0.05
		);
		await page.mouse.click( cp.x, cp.y );
		check(
			( await page
				.locator( '[data-setting="selectedObstacle"]' )
				.inputValue() ) === String( copied.id ),
			`${ kind }: Duplicate can pick a different visible obstacle`
		);
		const saved = await page.evaluate( () => window.__wpieFluidLab.save() );
		await page.evaluate( ( saved ) => {
			window.__wpieFluidLab.restore( saved );
			window.__wpieFluidLab.pause();
		}, saved );
		check(
			( await current() ) === 'duplicate' &&
				( await page
					.locator( '[data-setting="selectedObstacle"]' )
					.inputValue() ) === '0',
			`${ kind }: reopening keeps Duplicate and clears its transient template`
		);
		await qa.shot( `qa-extra-tools-${ kind }-obstacles.png` );
	}
	await reset( 'surface' );
	for ( const id of [ 'spray', 'ring', 'comb', 'draw', 'duplicate' ] ) {
		await tool( id ).focus();
		await page.waitForSelector( '[role="tooltip"]', { timeout: 4500 } );
		check(
			( await page.locator( '[role="tooltip"]' ).textContent() ).length >
				40,
			`${ id }: keyboard focus opens translated help after three seconds`
		);
		await page.keyboard.press( 'Escape' );
	}
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab,
			saved = lab.save();
		saved.settings.tool = 'wall';
		saved.settings.obstacleMode = 'paint';
		lab.restore( saved );
		lab.pause();
	} );
	check(
		( await current() ) === 'draw' &&
			( await tool( 'draw' ).getAttribute( 'aria-pressed' ) ) === 'true',
		'Old saved wall/paint mode reopens with Draw selected'
	);
	result = await qa.finish();
} finally {
	await qa.browser.close();
}
process.exitCode = result;
