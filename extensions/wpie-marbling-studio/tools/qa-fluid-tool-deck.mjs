import { FEATURE_EXPERIMENTS } from '../src/fluid/feature-experiments.js';
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
	out: path.join( root, 'dist/qa-tool-deck-stage' ),
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
let result = 1;
try {
	await page.locator( '[data-mode="fluid"]' ).click();
	await page.waitForFunction( () => !! window.__wpieFluidLab );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'blank', 17 );
		lab.pause();
		lab.settings.angle = 0;
		lab.renderer.update( lab.settings );
	} );
	check(
		( await page
			.locator( '.wpiemb-lab-tool-deck [data-tool]:visible' )
			.count() ) === 16,
		'Surface bath has 16 application and manipulation tools below the preview'
	);
	check(
		( await page.locator( '.wpiemb-side [data-tool]' ).count() ) === 0,
		'Right settings panel no longer contains the tool grid'
	);
	check(
		( await page.locator( '.wpiemb-lab-tool-group:visible' ).count() ) ===
			4,
		'Tools form four visible groups in the surface bath'
	);
	check(
		( await page.locator( '.wpiemb-lab-palettes.dsm-seg' ).count() ) === 1,
		'Liquid categories use the shared CI segment'
	);
	check(
		( await page
			.locator( '.wpiemb-lab-views [data-tool="orbit"]' )
			.count() ) === 1 &&
			( await page
				.locator( '.wpiemb-lab-tool-deck [data-tool="orbit"]' )
				.count() ) === 0,
		'Rotate sits beside the four fixed views above the preview'
	);
	await tool( 'pour' ).click();
	await tool( 'orbit' ).click();
	check(
		( await tool( 'orbit' ).getAttribute( 'aria-pressed' ) ) === 'true',
		'Rotate is marked as active'
	);
	await tool( 'orbit' ).click();
	check(
		( await current() ) === 'pour',
		'Rotate toggles back to the remembered application tool'
	);
	await tool( 'orbit' ).click();
	await page.locator( '[data-view="top"]' ).click();
	check(
		( await current() ) === 'pour' &&
			( await tool( 'orbit' ).getAttribute( 'aria-pressed' ) ) ===
				'false',
		'A fixed view exits Rotate and clears its selection'
	);
	await tool( 'pipette' ).click();
	await tool( 'magnet' ).click();
	await page.locator( '[data-view="top"]' ).click();
	check(
		( await current() ) === 'magnet',
		'A fixed view preserves other tools'
	);
	await clickAt( 0.25, 0.25 );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.sources.length === 1
		),
		'Magnet tool places a lasting source in the actual simulation'
	);
	await liquid( 'silicone' ).click();
	check(
		( await current() ) === 'pipette',
		'Magnet to silicone oil immediately resumes the pipette'
	);
	await clickAt( 0.7, 0.6 );
	check(
		await page.evaluate( () => {
			const s = window.__wpieFluidLab.sim;
			return s.sources.length === 1 && s.silicone.some( ( x ) => x > 0 );
		} ),
		'Next canvas click adds silicone oil and preserves the existing magnet'
	);
	await tool( 'pour' ).click();
	for ( const id of [
		'stir',
		'air',
		'vortex',
		'comb',
		'draw',
		'duplicate',
		'heat',
		'cool',
		'magnet',
		'removeSource',
		'wall',
		'erase',
		'orbit',
	] ) {
		await tool( id ).click();
		await liquid( 'silicone' ).click();
		check(
			( await current() ) === 'pour',
			`${ id } to liquid restores Pour`
		);
	}
	await tool( 'pipette' ).click();
	await tool( 'vortex' ).click();
	await liquid( 'oil' ).click();
	check(
		( await current() ) === 'pipette',
		'Changing the preferred application tool replaces the remembered Pour'
	);
	await tool( 'magnet' ).click();
	await page.locator( '[data-fluid-palette="chemistry"]' ).click();
	check(
		( await current() ) === 'magnet',
		'Browsing Chemistry does not change the tool'
	);
	await liquid( 'indicator' ).click();
	check(
		( await current() ) === 'pipette',
		'Selecting a reagent also resumes application'
	);
	await page.locator( '[data-fluid-palette="liquids"]' ).click();
	await tool( 'pour' ).click();
	check(
		( await page
			.locator( '.wpiemb-lab-tool-deck input[type=range]' )
			.count() ) === 0 &&
			( await page
				.locator(
					'.wpiemb-side .wpiemb-lab-tool-settings [data-setting=amount]'
				)
				.count() ) === 1,
		'All tool sliders moved into their own sidebar section'
	);
	await setting( 'amount', 0.3 );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.settings.amount === 0.3
		),
		'Sidebar tool section controls the actual application amount'
	);
	await tool( 'magnet' ).click();
	await page.locator( '[data-setting="selectedSource"]' ).selectOption( '1' );
	await setting( 'sourcePower', 1.8 );
	check(
		await page.evaluate(
			() => window.__wpieFluidLab.sim.sources[ 0 ].power === 1.8
		),
		'Sidebar strength slider edits the selected lasting source'
	);
	const before = await tool( 'pipette' ).boundingBox();
	await page.locator( '.wpiemb-side' ).evaluate( ( el ) => {
		el.scrollTop = el.scrollHeight;
	} );
	const after = await tool( 'pipette' ).boundingBox();
	check(
		Math.abs( before.y - after.y ) < 1,
		'Scrolling detailed settings leaves the tool deck in place'
	);
	await page.locator( '.wpiemb-side' ).evaluate( ( el ) => {
		el.scrollTop = 0;
	} );
	await page.mouse.move( 10, 10 );
	await tool( 'magnet' ).hover();
	await page.waitForTimeout( 2500 );
	check(
		( await page.locator( '[role="tooltip"]' ).count() ) === 0,
		'Tool explanation stays hidden before three seconds'
	);
	await page.waitForSelector( '[role="tooltip"]', { timeout: 2000 } );
	check(
		( await page.locator( '[role="tooltip"]' ).textContent() ).includes(
			'Ferrofluid'
		),
		'After three seconds the translated magnet explanation appears'
	);
	const tip = await page.locator( '[role="tooltip"]' ).boundingBox();
	check(
		tip.x >= 0 && tip.y >= 0 && tip.x + tip.width <= 1500,
		'Tooltip stays within the viewport'
	);
	await qa.shot( 'qa-tool-deck-tooltip.png' );
	await page.keyboard.press( 'Escape' );
	check(
		( await page.locator( '[role="tooltip"]' ).count() ) === 0 &&
			( await page.locator( '.wpiemb-lab-dialog' ).count() ) === 1,
		'Escape dismisses the tooltip without closing the bath'
	);
	await tool( 'pour' ).focus();
	await page.waitForSelector( '[role="tooltip"]', { timeout: 4000 } );
	check(
		( await page.locator( '[role="tooltip"]' ).textContent() ).includes(
			'einzugießen'
		),
		'Keyboard focus reveals the same delayed explanation'
	);
	await page.keyboard.press( 'Enter' );
	check(
		( await current() ) === 'pour' &&
			( await tool( 'pour' ).evaluate(
				( el ) => document.activeElement === el
			) ),
		'Keyboard selection retains focus on the mounted button'
	);
	await page.mouse.move( 10, 10 );
	await tool( 'stir' ).hover();
	await page.waitForTimeout( 1800 );
	await page.mouse.move( 10, 10 );
	await page.waitForTimeout( 1400 );
	check(
		( await page.locator( '[role="tooltip"]' ).count() ) === 0,
		'Leaving a tool cancels its pending tooltip'
	);
	for ( const [ width, height ] of [
		[ 1500, 1000 ],
		[ 1280, 850 ],
		[ 1100, 800 ],
	] ) {
		await page.setViewportSize( { width, height } );
		await page.waitForTimeout( 250 );
		const bounds = await page.evaluate( () => {
			const deck = document
				.querySelector( '.wpiemb-lab-tool-deck' )
				.getBoundingClientRect();
			const view = document
				.querySelector( '.wpiemb-lab-view' )
				.getBoundingClientRect();
			const canvas = window.__wpieFluidLab.canvas.getBoundingClientRect();
			const nodes = [
				...document.querySelectorAll(
					'.wpiemb-lab-tool-deck [data-tool]'
				),
			].filter( ( n ) => ! n.hidden );
			return {
				deck: { x: deck.x, y: deck.y, w: deck.width, h: deck.height },
				view: { h: view.height, bottom: view.bottom },
				ratio: canvas.width / canvas.height,
				columns: getComputedStyle(
					document.querySelector(
						'[data-tool-group="apply"] .wpiemb-lab-tool-grid'
					)
				).gridTemplateColumns.split( ' ' ).length,
				modalHeight: document
					.querySelector( '.wpiemb-lab-dialog' )
					.getBoundingClientRect().height,
				compact: nodes.every( ( n ) => {
					const icon = n
						.querySelector( 'svg' )
						.getBoundingClientRect();
					const label = n
						.querySelector( 'b' )
						.getBoundingClientRect();
					return (
						n.getBoundingClientRect().height <= 32 &&
						icon.right <= label.left &&
						Math.abs(
							icon.y +
								icon.height / 2 -
								label.y -
								label.height / 2
						) < 2
					);
				} ),
				fits: nodes.every( ( n ) => {
					const r = n.getBoundingClientRect();
					return (
						r.left >= deck.left &&
						r.right <= deck.right &&
						r.top >= deck.top &&
						r.bottom <= deck.bottom
					);
				} ),
			};
		} );
		qa.note( JSON.stringify( { width, height, ...bounds } ) );
		check(
			bounds.deck.h <= ( width === 1500 ? 125 : 195 ) &&
				bounds.columns === ( width === 1500 ? 2 : 1 ) &&
				bounds.compact &&
				Math.abs(
					bounds.modalHeight - Math.min( 900, height * 0.92 )
				) < 1,
			`At ${ width }px the moderately sized modal has a compact tool section with icon-left rows`
		);
		check(
			bounds.fits &&
				bounds.deck.y >= bounds.view.bottom - 1 &&
				bounds.view.h > 200 &&
				Math.abs( bounds.ratio - 4 / 3 ) < 0.01,
			`At ${ width }px all tools are visible below a proportionate usable preview`
		);
		check(
			await page
				.locator( '.wpiemb-lab-tool-deck .wpiemb-tool:visible b' )
				.evaluateAll( ( nodes ) =>
					nodes.every(
						( n ) =>
							n.scrollWidth <= n.clientWidth + 1 &&
							n.scrollHeight <= n.clientHeight + 1
					)
				),
			`At ${ width }px tool labels remain fully readable`
		);
		await qa.shot( `qa-tool-deck-${ width }.png` );
	}
	await page.setViewportSize( { width: 1500, height: 1000 } );
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'volume_oil_mix', 17 );
		lab.pause();
	} );
	check(
		( await tool( 'lift' ).isVisible() ) &&
			( await tool( 'drain' ).isVisible() ),
		'Deep bath exposes Lift and Drain in the corresponding groups'
	);
	await tool( 'pour' ).click();
	await tool( 'drain' ).click();
	await liquid( 'silicone' ).click();
	check(
		( await current() ) === 'pour',
		'Drain to silicone oil restores Pour in the deep bath'
	);
	await tool( 'magnet' ).click();
	await page.locator( '.wpiemb-side' ).evaluate( ( el ) => {
		el.scrollTop = 0;
	} );
	await qa.shot( 'qa-tool-deck-deep.png' );
	await page.setViewportSize( { width: 1100, height: 800 } );
	await page.waitForTimeout( 250 );
	check(
		await page
			.locator( '.wpiemb-lab-tool-deck .wpiemb-tool:visible b' )
			.evaluateAll( ( nodes ) =>
				nodes.every(
					( n ) =>
						n.scrollWidth <= n.clientWidth + 1 &&
						n.scrollHeight <= n.clientHeight + 1
				)
			),
		'Deep bath tool labels also fit at 1100px'
	);
	check(
		await page
			.locator( '.wpiemb-lab-tool-deck' )
			.evaluate( ( n ) => n.getBoundingClientRect().height <= 215 ),
		'Deep bath also keeps the tool section at most 215px high'
	);
	await qa.shot( 'qa-tool-deck-deep-1100.png' );
	await page.setViewportSize( { width: 1500, height: 1000 } );

	const featureShots = [];
	for ( const recipe of FEATURE_EXPERIMENTS ) {
		const card = page.locator( `[data-experiment="${ recipe.id }"]` );
		await card.click();
		const sample = await page.evaluate( () => {
			const lab = window.__wpieFluidLab;
			lab.pause();
			lab.renderer.update( lab.settings );
			lab.renderer.render();
			const saved = lab.save();
			const image = lab.renderer.still( 400, 300, 'wet' );
			const pixels = image
				.getContext( '2d' )
				.getImageData( 0, 0, 400, 300 ).data;
			const colors = new Set();
			for ( let i = 0; i < pixels.length; i += 64 )
				colors.add(
					`${ pixels[ i ] },${ pixels[ i + 1 ] },${ pixels[ i + 2 ] }`
				);
			lab.restore( saved );
			lab.pause();
			return {
				id: lab.settings.experiment,
				restored:
					JSON.stringify( saved ) === JSON.stringify( lab.save() ),
				forms: lab.sim.customObstacles.items.length,
				image: image.toDataURL(),
				colors: colors.size,
			};
		} );
		check(
			sample.id === recipe.id &&
				sample.restored &&
				sample.colors > 30 &&
				( recipe.id === 'feature_volume_glow' || sample.forms > 0 ),
			`${ recipe.id }: real card opens, renders and reopens with its apparatus`
		);
		featureShots.push( {
			title: ( await card.innerText() ).trim(),
			image: sample.image,
		} );
		if ( recipe.id === 'feature_glow_magnets' )
			await qa.shot( 'qa-sidebar-recipes-ui.png' );
	}
	await page.evaluate( () => {
		const lab = window.__wpieFluidLab;
		lab.choose( 'volume_oil_mix', 17 );
		lab.pause();
	} );
	await tool( 'magnet' ).click();

	await page.evaluate( () => {
		document.documentElement.dataset.theme = 'light';
		document.querySelector( '#wpie-root' ).dataset.theme = 'light';
	} );
	await qa.shot( 'qa-tool-deck-light.png' );
	const saved = await page.evaluate( () => window.__wpieFluidLab.save() );
	await page.evaluate( ( s ) => {
		window.__wpieFluidLab.restore( s );
		window.__wpieFluidLab.pause();
	}, saved );
	check(
		( await current() ) === 'magnet' &&
			( await tool( 'magnet' ).getAttribute( 'aria-pressed' ) ) ===
				'true',
		'Restored experiment and deck agree on the selected tool'
	);
	await tool( 'magnet' ).hover();
	await page.evaluate( () => window.__wpieFluidLab.close() );
	await page.waitForTimeout( 3200 );
	check(
		( await page.locator( '[role="tooltip"]' ).count() ) === 0,
		'Closing the dialog cancels pending tooltips'
	);
	await page.setViewportSize( { width: 1280, height: 1050 } );
	await page.evaluate( ( cards ) => {
		const sheet = document.createElement( 'div' );
		sheet.style.cssText =
			'position:fixed;inset:0;z-index:99999;background:#131a22;color:#e4ebf2;padding:20px;display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-content:start;font:14px sans-serif;overflow:auto';
		for ( const card of cards ) {
			const tile = document.createElement( 'div' );
			const title = document.createElement( 'h3' );
			title.textContent = card.title;
			const img = document.createElement( 'img' );
			img.src = card.image;
			img.style.cssText =
				'width:100%;display:block;background:repeating-conic-gradient(#384451 0 25%,#27323d 0 50%) 0 0 / 18px 18px';
			tile.append( title, img );
			sheet.append( tile );
		}
		document.body.append( sheet );
	}, featureShots );
	await qa.shot( 'qa-sidebar-recipes-sheet.png' );
	result = await qa.finish();
} finally {
	await qa.browser.close();
}
process.exitCode = result;
