/** One browser, real editor components, in-memory persistence, no REST writes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
const root = fileURLToPath( new URL( '../../../', import.meta.url ) ),
	source = root + '/extensions/wpie-pattern-generator',
	req = createRequire( root + '/tools/template-generator/package.json' );
const out = fs.mkdtempSync( '/tmp/wpie-seamless-qa-' );
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = '1';
const occupied = () =>
	execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( s ) =>
				! /^\s*Z/.test( s ) &&
				/chrome|chromium|headless_shell/.test( s )
		);
for ( let attempt = 0; occupied(); attempt++ ) {
	if ( attempt > 45 ) throw Error( 'Another browser remains active' );
	await new Promise( ( r ) => setTimeout( r, 2000 ) );
}
await req( 'esbuild' ).build( {
	entryPoints: [ source + '/tools/qa-host.jsx' ],
	outfile: out + '/app.js',
	bundle: true,
	format: 'esm',
	jsx: 'automatic',
	external: [ 'util' ],
	alias: { '@editor': root + '/src' },
	define: { 'process.env.NODE_ENV': '"production"' },
	loader: { '.js': 'jsx' },
	logLevel: 'warning',
} );
await req( 'esbuild' ).build( {
	entryPoints: [ source + '/tools/qa-probe.js' ],
	outfile: out + '/probe.js',
	bundle: true,
	format: 'iife',
	logLevel: 'warning',
} );
const css = [ root + '/build/index.css' ],
	extensions = [];
for ( const entry of fs.readdirSync( root + '/extensions' ) ) {
	const dir = root + '/extensions/' + entry;
	if ( fs.existsSync( dir + '/style.css' ) ) css.push( dir + '/style.css' );
	if ( fs.existsSync( dir + '/manifest.json' ) ) {
		const m = JSON.parse(
			fs.readFileSync( dir + '/manifest.json', 'utf8' )
		);
		extensions.push( {
			...m,
			main: pathToFileURL( dir + '/' + m.main ).href,
		} );
	}
}
fs.writeFileSync(
	out + '/index.html',
	'<!doctype html><html lang="en"><meta charset="utf-8">' +
		css
			.map(
				( f ) =>
					'<link rel="stylesheet" href="' +
					pathToFileURL( f ).href +
					'">'
			)
			.join( '' ) +
		'<style>html,body{margin:0;height:100%;overflow:hidden}#wpie-root,#app{height:100%}</style><div id="wpie-root" data-theme="light"><div id="app"></div></div><script>window.__auditBoot=' +
		JSON.stringify( { extensions } ) +
		'</script><script type="module">import "./app.js";await import(' +
		JSON.stringify( pathToFileURL( source + '/extension.js' ).href ) +
		');await import("./probe.js");</script></html>'
);
if ( occupied() ) throw Error( 'Another browser became active' );
const browser = await req( 'playwright' ).chromium.launch( {
	args: [
		'--no-sandbox',
		'--enable-unsafe-swiftshader',
		'--use-gl=swiftshader',
		'--allow-file-access-from-files',
	],
} );
const results = { checks: [], errors: [] };
console.log( 'QA artifacts: ' + out );
try {
	const page = await browser.newPage( {
		viewport: { width: 1600, height: 1000 },
		acceptDownloads: true,
	} );
	page.setDefaultTimeout( 15000 );
	page.on( 'pageerror', ( e ) => {
		results.errors.push( e.message );
		console.error( e.message );
	} );
	await page.route( /^https?:/, ( r ) => r.abort() );
	await page.goto( pathToFileURL( out + '/index.html' ).href, {
		waitUntil: 'domcontentloaded',
	} );
	await page.waitForFunction(
		() =>
			window.__auditActions?.length &&
			window.__auditEditor?.state.colorPanelCommand === 0
	);
	await page.evaluate( () => __auditOpen() );
	await page.waitForFunction( () => window.__wpiePattern );
	const check = ( name, ok = true ) => {
		assert.ok( ok, name );
		results.checks.push( name );
		console.log( name );
	};
	const click = async ( name ) =>
		page
			.getByRole( 'button', { name, exact: true } )
			.evaluate( ( e ) => e.click() );
	const tab = async ( name ) =>
		page.getByRole( 'tab', { name, exact: true } ).click();
	const params = () => page.evaluate( () => __wpiePattern.params() );
	const slider = async ( label, value ) =>
		page
			.getByRole( 'slider', { name: label, exact: true } )
			.evaluate( ( e, v ) => {
				e.value = v;
				e.dispatchEvent( new Event( 'input', { bubbles: true } ) );
			}, String( value ) );
	const apply = async ( p ) =>
		page.evaluate( async ( p ) => {
			await __wpiePattern.apply( p );
		}, p );
	const base = await page.evaluate( () => __patternProbe.DEFAULTS );
	check(
		'200 searchable presets',
		( await page.locator( '.wpiepg-preset' ).count() ) === 200
	);
	check(
		'Preset thumbnails render on demand',
		( await page.locator( '.wpiepg-preset canvas' ).count() ) < 40
	);
	for ( const theme of [ 'light', 'dark' ] ) {
		await page.evaluate(
			( theme ) =>
				( document.querySelector( '#wpie-root' ).dataset.theme =
					theme ),
			theme
		);
		await page.waitForTimeout( 700 );
		const toolbar = await page.locator( '.wpiepg-toolbar' ).boundingBox(),
			tabs = await page
				.locator( '.wpiepg-tabs button' )
				.evaluateAll( ( es ) =>
					es.map( ( e ) => e.getBoundingClientRect().width )
				),
			label = await page.locator( '.wpiepg-layerselect' ).boundingBox();
		check(
			theme + ' toolbar and panel widths',
			toolbar.height < 90 &&
				tabs.every( ( w ) => w > 50 ) &&
				label.width > 100
		);
		check(
			theme + ' CI section icons and directly visible random action',
			await page.evaluate( () => {
				const headers = Array.from(
						document.querySelectorAll(
							'.wpiepg-dialog .dsm-card-head'
						)
					),
					button = document.querySelector(
						'.wpiepg-toolbar .primary'
					),
					r = button.getBoundingClientRect();
				return (
					headers.every(
						( h ) =>
							h.querySelector( 'svg' )?.getBoundingClientRect()
								.width === 14
					) &&
					headers.some( ( h ) => h.textContent === 'Presets' ) &&
					headers.some(
						( h ) => h.textContent === 'Pattern layers'
					) &&
					r.top > 0 &&
					r.bottom < innerHeight &&
					r.width > 100
				);
			} )
		);
		await page.screenshot( { path: out + '/panel-' + theme + '.png' } );
	}
	await page
		.getByLabel( 'Search presets', { exact: true } )
		.fill( 'guilloche' );
	check(
		'Search finds the line preset',
		( await page.locator( '.wpiepg-preset' ).count() ) >= 2
	);
	await click( 'Fine Guilloche' );
	check(
		'Search result loads the correct motif',
		( await params() ).layers[ 0 ].motif === 'guilloche'
	);
	await page.getByLabel( 'Search presets', { exact: true } ).fill( '' );
	await page
		.getByLabel( 'Category', { exact: true } )
		.selectOption( 'Textiles' );
	check(
		'Category filters the preset gallery',
		( await page.locator( '.wpiepg-preset' ).count() ) === 16
	);
	await page.getByLabel( 'Category', { exact: true } ).selectOption( 'All' );
	await page.getByLabel( 'Search presets', { exact: true } ).fill( 'ginkgo' );
	check(
		'Search includes new sets and motifs inside layered compositions',
		( await page
			.getByRole( 'button', { name: 'Golden Herbarium', exact: true } )
			.count() ) === 1
	);
	await click( 'Golden Herbarium' );
	check(
		'New collection composition loads three editable layers',
		( await params() ).layers.length === 3
	);
	const composition = await params();
	await page.evaluate( () => __wpiePattern.selectLayer( 1 ) );
	await click( 'Random layer' );
	const layerRoll = await params();
	check(
		'Random layer changes only the selected layer',
		JSON.stringify( composition.layers[ 1 ] ) !==
			JSON.stringify( layerRoll.layers[ 1 ] ) &&
			JSON.stringify( {
				...composition,
				layers: [ composition.layers[ 0 ], composition.layers[ 2 ] ],
			} ) ===
				JSON.stringify( {
					...layerRoll,
					layers: [ layerRoll.layers[ 0 ], layerRoll.layers[ 2 ] ],
				} )
	);
	await click( 'Undo' );
	check(
		'One undo restores the random layer operation',
		JSON.stringify( await params() ) === JSON.stringify( composition )
	);
	await click( 'Random colors' );
	const colorsRoll = await params();
	check(
		'Random colors retains all motifs and layer structure',
		colorsRoll.layers.length === composition.layers.length &&
			colorsRoll.layers.every(
				( l, i ) =>
					l.motif === composition.layers[ i ].motif &&
					l.seed === composition.layers[ i ].seed &&
					l.palette !== composition.layers[ i ].palette
			)
	);
	await click( 'Undo' );
	await click( 'Random pattern' );
	check(
		'Random pattern generates a complete design',
		JSON.stringify( await params() ) !== JSON.stringify( composition )
	);
	await click( 'Undo' );
	check(
		'One undo restores the complete design after randomization',
		JSON.stringify( await params() ) === JSON.stringify( composition )
	);
	await tab( 'Colors' );
	await page.getByLabel( 'Transparent', { exact: true } ).check();
	await page.getByLabel( 'Keep colors', { exact: true } ).check();
	const transparent = await params();
	await click( 'Random pattern' );
	check(
		'Randomization preserves transparency and the remembered background color',
		( await params() ).bg === '' &&
			( await params() ).bgCustom === transparent.bgCustom
	);
	await click( 'Undo' );
	await page.getByLabel( 'Transparent', { exact: true } ).uncheck();
	await page.getByLabel( 'Keep colors', { exact: true } ).uncheck();
	await tab( 'Pattern' );
	await page
		.getByLabel( 'Search presets', { exact: true } )
		.fill( 'Silver Fronds' );
	await click( 'Silver Fronds' );
	check(
		'Combined preset loads two layers',
		( await params() ).layers.length === 2
	);
	const first = ( await params() ).layers[ 0 ].motif;
	await page.locator( '.wpiepg-layerselect' ).last().click();
	await page
		.getByRole( 'button', { name: 'Move layer up', exact: true } )
		.click();
	check(
		'Layer toolbar changes compositing order and follows the selected layer',
		( await params() ).layers[ 1 ].motif === first &&
			( await page.evaluate( () => __wpiePattern.active() ) ) === 1 &&
			( await page
				.getByRole( 'button', { name: 'Move layer up', exact: true } )
				.isDisabled() )
	);
	await click( 'Undo' );
	check(
		'Undo restores layer order',
		( await params() ).layers[ 0 ].motif === first
	);
	await click( 'Redo' );
	check(
		'Redo restores reordering',
		( await params() ).layers[ 1 ].motif === first
	);
	const eye = await page
		.getByRole( 'button', { name: 'Hide layer 1', exact: true } )
		.innerHTML();
	await page
		.getByRole( 'button', { name: 'Hide layer 1', exact: true } )
		.focus();
	await page.keyboard.press( 'Enter' );
	check(
		'Eye toggles only its layer and keeps keyboard focus without changing selection',
		( await params() ).layers[ 0 ].visible === false &&
			( await page.evaluate( () => __wpiePattern.active() ) ) === 1 &&
			( await page.evaluate( () =>
				document.activeElement.getAttribute( 'aria-label' )
			) ) === 'Show layer 1' &&
			( await page
				.getByRole( 'button', { name: 'Show layer 1', exact: true } )
				.innerHTML() ) !== eye
	);
	await page.keyboard.press( 'Space' );
	check(
		'Keyboard restores visibility and the open eye',
		( await params() ).layers[ 0 ].visible === true &&
			( await page
				.getByRole( 'button', { name: 'Hide layer 1', exact: true } )
				.innerHTML() ) === eye
	);
	await page
		.getByRole( 'button', { name: 'Add layer', exact: true } )
		.click();
	await page
		.getByRole( 'button', { name: 'Duplicate', exact: true } )
		.click();
	check(
		'Four independent layers and bounded controls',
		( await params() ).layers.length === 4 &&
			( await page
				.getByRole( 'button', { name: 'Add layer', exact: true } )
				.isDisabled() )
	);
	await page
		.getByLabel( 'Layer name', { exact: true } )
		.fill( 'Botanical details with a deliberately long layer name' );
	await page.getByLabel( 'Layer name', { exact: true } ).press( 'Tab' );
	await page
		.getByRole( 'button', { name: 'Hide layer 2', exact: true } )
		.click();
	await page.locator( '.wpiepg-layerselect' ).first().focus();
	await page.keyboard.press( 'Enter' );
	check(
		'Keyboard layer selection retains a visible focus indicator',
		await page.evaluate( () => {
			const e = document.activeElement;
			return (
				e.matches(
					'.wpiepg-layerselect[aria-current="true"]:focus-visible'
				) && parseFloat( getComputedStyle( e ).outlineWidth ) >= 2
			);
		} )
	);
	for ( const theme of [ 'light', 'dark' ] ) {
		await page.evaluate( ( theme ) => {
			document.querySelector( '#wpie-root' ).dataset.theme = theme;
		}, theme );
		// A fresh pointer selection ends the previous keyboard-focus session.
		await page.locator( '.wpiepg-layerselect' ).last().click();
		await page.locator( '.wpiepg-layerselect' ).first().click();
		await page.mouse.move( 800, 800 );
		await page.waitForTimeout( 150 );
		check(
			theme +
				' layer list has aligned eyes, roomy names and no nested outlines',
			await page.evaluate( () => {
				const rows = Array.from(
						document.querySelectorAll( '.wpiepg-layerrow' )
					),
					controls = Array.from(
						document.querySelectorAll(
							'.wpiepg-layerrow, .wpiepg-layerrow button, .wpiepg-layeractions button'
						)
					);
				return (
					rows.length === 4 &&
					rows.filter( ( r ) => r.dataset.active === 'true' )
						.length === 1 &&
					controls.every( ( e ) => {
						const s = getComputedStyle( e );
						return (
							parseFloat( s.borderTopWidth ) === 0 &&
							s.boxShadow === 'none' &&
							s.outlineStyle === 'none'
						);
					} ) &&
					rows.every( ( r ) => {
						const label = r.querySelector( '.wpiepg-layerselect' ),
							b = label.getBoundingClientRect(),
							eye = r
								.querySelector( 'svg' )
								.getBoundingClientRect(),
							s = getComputedStyle( label );
						return (
							b.width > 180 &&
							b.height >= 28 &&
							eye.width === 14 &&
							Math.abs(
								b.y + b.height / 2 - eye.y - eye.height / 2
							) < 1 &&
							parseFloat( s.paddingLeft ) >= 6 &&
							s.textOverflow === 'ellipsis'
						);
					} )
				);
			} )
		);
		await page
			.locator( '.wpiepg-side' )
			.screenshot( { path: out + '/layers-' + theme + '.png' } );
	}
	const beforeRemove = await params();
	await page
		.getByRole( 'button', { name: 'Move layer down', exact: true } )
		.click();
	check(
		'Down arrow moves the selected layer and preserves its selection',
		( await params() ).layers[ 2 ].name === beforeRemove.layers[ 3 ].name &&
			( await page.evaluate( () => __wpiePattern.active() ) ) === 2
	);
	await page
		.getByRole( 'button', { name: 'Remove layer', exact: true } )
		.click();
	check(
		'Toolbar removes the selected layer and retains the others',
		JSON.stringify( ( await params() ).layers ) ===
			JSON.stringify( beforeRemove.layers.slice( 0, 3 ) )
	);
	await click( 'Undo' );
	await click( 'Undo' );
	check(
		'Undo restores removed and reordered layers',
		JSON.stringify( await params() ) === JSON.stringify( beforeRemove )
	);
	await apply( { ...base, motif: 'ringe', repeat: 'straight' } );
	check(
		'Single layer cannot be moved or removed',
		( await page
			.getByRole( 'button', { name: 'Remove layer', exact: true } )
			.isDisabled() ) &&
			( await page
				.getByRole( 'button', { name: 'Move layer up', exact: true } )
				.isDisabled() ) &&
			( await page
				.getByRole( 'button', { name: 'Move layer down', exact: true } )
				.isDisabled() )
	);
	await tab( 'Pattern' );
	check(
		'Previously missing ring controls are available',
		( await page
			.getByRole( 'slider', { name: 'Size', exact: true } )
			.count() ) === 1 &&
			( await page
				.getByRole( 'slider', { name: 'Weight', exact: true } )
				.count() ) === 1
	);
	await tab( 'Colors' );
	const ink = page.locator( '.wpiepg-inkrow input[type=text]' ).first();
	await ink.fill( '#da3355' );
	check(
		'Real color field updates the palette',
		( await params() ).layers[ 0 ].paletteColors[ 0 ] === '#da3355'
	);
	await ink.fill( '#da' );
	check(
		'Incomplete color input preserves the complete palette',
		( await params() ).layers[ 0 ].paletteColors.length === 5 &&
			( await params() ).layers[ 0 ].paletteColors[ 0 ] === '#da3355'
	);
	await ink.fill( '#da3355' );
	await page.getByRole( 'button', { name: 'Color 1', exact: true } ).click();
	await page.waitForSelector( '.color-panel-window' );
	check(
		'Shared editor color picker opens without losing the extension',
		( await page.locator( '.wpiepg-dialog' ).count() ) === 1
	);
	await page
		.getByRole( 'textbox', { name: 'Hex color', exact: true } )
		.fill( '#2255aa' );
	await page
		.getByRole( 'textbox', { name: 'Hex color', exact: true } )
		.press( 'Enter' );
	await page.waitForTimeout( 150 );
	check(
		'Shared picker changes the selected ink',
		( await params() ).layers[ 0 ].paletteColors[ 0 ] === '#2255aa'
	);
	await page
		.locator( '.color-panel-window' )
		.getByRole( 'button', { name: /close/i } )
		.first()
		.click();
	await tab( 'Rapport' );
	await page.getByLabel( 'Repeat', { exact: true } ).selectOption( 'third' );
	await slider( 'Cell aspect', 1.35 );
	await page.getByLabel( 'Tile size', { exact: true } ).selectOption( '512' );
	const dimensions = await page.evaluate( async () => {
		const c = await __wpiePattern.tile(),
			ctx = c.getContext( '2d' );
		const edge = ctx.getImageData( c.width - 1, 0, 1, c.height ).data;
		return {
			w: c.width,
			h: c.height,
			minAlpha: Math.min(
				...Array.from( edge ).filter( ( _, i ) => i % 4 === 3 )
			),
			svg: __wpiePattern.svg().slice( 0, 180 ),
		};
	} );
	check(
		'Rectangular third-drop PNG and SVG have identical dimensions',
		dimensions.w === 2074 &&
			dimensions.h === 512 &&
			dimensions.svg.includes( 'width="2074" height="512"' )
	);
	check(
		'Rounded tile widths have no transparent edge sliver',
		dimensions.minAlpha === 255
	);
	const exportedBefore = await page.evaluate( async () =>
		( await __wpiePattern.tile() ).toDataURL()
	);
	await click( 'Single tile' );
	await click( 'Tile frame' );
	check(
		'Preview frame and single-tile mode stay out of export',
		exportedBefore ===
			( await page.evaluate( async () =>
				( await __wpiePattern.tile() ).toDataURL()
			) )
	);
	await click( 'Single tile' );
	// Deterministic single editable element, repeated across a boundary.
	await apply( {
		...base,
		motif: 'scatter',
		repeat: 'straight',
		count: 4,
		removed: [ 0, 1, 2, 3 ],
		added: [ { id: 7, x: 0.5, y: 0.5, s: 0.24, g: 0, rot: 0, c: 0 } ],
		set: 'ferns',
	} );
	await tab( 'Elements' );
	await page.locator( '[data-element="100007"]' ).click();
	await slider( 'Size', 35 );
	await slider( 'Rotation', 75 );
	let e = await page.evaluate(
		() =>
			__patternProbe.cellElements(
				__wpiePattern.params().layers[ 0 ]
			)[ 0 ]
	);
	check(
		'Element size and rotation edits are retained',
		Math.abs( e.s - 0.35 ) < 0.001 &&
			Math.abs( e.rot - ( 75 * Math.PI ) / 180 ) < 0.001
	);
	await page
		.getByRole( 'textbox', { name: 'Element color', exact: true } )
		.fill( '#e33e64' );
	e = await page.evaluate(
		() =>
			__patternProbe.cellElements(
				__wpiePattern.params().layers[ 0 ]
			)[ 0 ]
	);
	check(
		'Element color is independent of the palette',
		e.color === '#e33e64'
	);
	await click( 'Duplicate element' );
	check(
		'Duplicating keeps the source element',
		( await params() ).layers[ 0 ].added.length === 2
	);
	await click( 'Remove element' );
	check(
		'Removing a duplicate retains stable source IDs',
		( await params() ).layers[ 0 ].added[ 0 ].id === 7
	);
	await click( 'Undo' );
	check(
		'Undo restores removed elements',
		( await params() ).layers[ 0 ].added.length === 2
	);
	await click( 'Redo' );
	await page.locator( '[data-element="100007"]' ).click();
	await page.getByLabel( 'Locked', { exact: true } ).check();
	const locked = await page.evaluate(
		() =>
			__patternProbe.cellElements(
				__wpiePattern.params().layers[ 0 ]
			)[ 0 ]
	);
	await tab( 'Pattern' );
	await click( 'New seed' );
	const lockedAfter = await page.evaluate( () =>
		__patternProbe
			.cellElements( __wpiePattern.params().layers[ 0 ] )
			.find( ( e ) => e.i === 100007 )
	);
	check(
		'Locked geometry survives a new seed',
		locked.x === lockedAfter.x &&
			locked.y === lockedAfter.y &&
			locked.s === lockedAfter.s &&
			locked.rot === lockedAfter.rot
	);
	await tab( 'Elements' );
	await page.locator( '[data-element="100007"]' ).click();
	check(
		'Locked element controls cannot move the object',
		await page
			.getByRole( 'slider', { name: 'Size', exact: true } )
			.isDisabled()
	);
	await page.getByLabel( 'Locked', { exact: true } ).uncheck();
	const box = await page.locator( '.wpiepg-canvas' ).boundingBox();
	await page.mouse.move( box.x + 225, box.y + 225 );
	await page.mouse.down();
	await page.mouse.move( box.x + 365, box.y + 260, { steps: 10 } );
	await page.mouse.up();
	const moved = await page.evaluate( () =>
		__patternProbe
			.cellElements( __wpiePattern.params().layers[ 0 ] )
			.find( ( e ) => e.i === 100007 )
	);
	check(
		'Dragging wraps an element over the tile edge',
		moved.x >= 0 && moved.x < 1 && Math.abs( moved.x - 0.5 ) > 0.05
	);
	await click( 'Undo' );
	for ( const repeat of [
		'straight',
		'halfdrop',
		'brick',
		'mirror',
		'third',
		'quarter',
		'rotate',
		'halfturn',
	] ) {
		await apply( {
			...base,
			repeat,
			motif: 'scatter',
			set: 'ferns',
			count: 4,
			shift: { x: 0.45, y: -0.38 },
			removed: [ 0, 1, 2, 3 ],
			added: [ { id: 7, x: 0.95, y: 0.76, s: 0.24, g: 0, rot: 0, c: 0 } ],
		} );
		await page.waitForTimeout( 80 );
		const start = await page.evaluate( () => {
			const d = __wpiePattern.params(),
				info = __wpiePattern.preview(),
				e = __patternProbe
					.elementsInTile( { ...d.layers[ 0 ], repeat: d.repeat } )
					.at( -1 ),
				r = __wpiePattern.canvas.getBoundingClientRect();
			return {
				x: r.x + info.x + e.x * info.unit * d.aspect,
				y: r.y + info.y + ( e.y + info.rows ) * info.unit,
				tx: e.x + 0.32,
				ty: e.y + info.rows - 0.25,
				ux: info.unit * d.aspect,
				uy: info.unit,
			};
		} );
		await page.mouse.move( start.x, start.y );
		await page.mouse.down();
		await page.mouse.move(
			start.x + 0.32 * start.ux,
			start.y - 0.25 * start.uy,
			{ steps: 6 }
		);
		await page.mouse.up();
		const follows = await page.evaluate( ( point ) => {
			const d = __wpiePattern.params(),
				{ cols, rows } = __wpiePattern.preview(),
				mod = ( v, n ) => ( ( v % n ) + n ) % n;
			return __patternProbe
				.elementsInTile( { ...d.layers[ 0 ], repeat: d.repeat } )
				.some(
					( e ) =>
						Math.hypot(
							e.x - mod( point.tx, cols ),
							e.y - mod( point.ty, rows )
						) < 0.015
				);
		}, start );
		assert.ok(
			follows,
			repeat + ' drag keeps its transformed copy under the pointer'
		);
		const target = await page.evaluate( () => {
			const d = __wpiePattern.params(),
				info = __wpiePattern.preview(),
				r = __wpiePattern.canvas.getBoundingClientRect(),
				tx = info.cols * 0.72,
				ty = info.rows * 0.68;
			return {
				x: r.x + info.x + tx * info.unit * d.aspect,
				y: r.y + info.y + ty * info.unit,
				tx,
				ty,
			};
		} );
		await page.mouse.click( target.x, target.y, { button: 'right' } );
		await page
			.locator( '.wpiepg-menu' )
			.getByRole( 'button', { name: 'Add element', exact: true } )
			.click();
		const placed = await page.evaluate( ( point ) => {
			const d = __wpiePattern.params(),
				layer = d.layers[ 0 ],
				id = 100000 + layer.added.at( -1 ).id;
			return __patternProbe
				.elementsInTile( { ...layer, repeat: d.repeat } )
				.some(
					( e ) =>
						e.i === id &&
						Math.hypot( e.x - point.tx, e.y - point.ty ) < 0.015
				);
		}, target );
		assert.ok(
			placed,
			repeat + ' context menu adds at the pointer position'
		);
	}
	check(
		'Dragging and adding at the pointer works with shifts in all eight repeat layouts'
	);
	await apply( {
		...base,
		set: 'wildflowers',
		motif: 'scatter',
		count: 12,
		repeat: 'straight',
	} );
	await tab( 'Pattern' );
	await page.getByLabel( 'Keep colors', { exact: true } ).check();
	await page.getByLabel( 'Keep motifs', { exact: true } ).check();
	await page.getByLabel( 'Keep arrangement', { exact: true } ).check();
	const before = await params();
	await click( 'Random pattern' );
	const after = await params();
	check(
		'Randomizer respects all three locks',
		before.layers[ 0 ].palette === after.layers[ 0 ].palette &&
			before.layers[ 0 ].set === after.layers[ 0 ].set &&
			before.layers[ 0 ].count === after.layers[ 0 ].count &&
			before.layers[ 0 ].seed === after.layers[ 0 ].seed &&
			before.repeat === after.repeat
	);
	check(
		'Fully locked random actions are visibly disabled',
		await page
			.getByRole( 'button', { name: 'Random pattern', exact: true } )
			.isDisabled()
	);
	for ( const label of [ 'Keep colors', 'Keep motifs', 'Keep arrangement' ] )
		await page.getByLabel( label, { exact: true } ).uncheck();
	await page.getByLabel( 'Search presets', { exact: true } ).fill( '' );
	await page
		.locator( '.wpiepg-left' )
		.getByRole( 'textbox', { name: 'Name', exact: true } )
		.fill( 'QA Wildflowers' );
	await click( 'Save as favorite' );
	await page.getByLabel( 'Favorites', { exact: true } ).check();
	check(
		'Named favorites use the existing storage',
		( await page
			.getByRole( 'button', { name: 'QA Wildflowers', exact: true } )
			.count() ) === 1
	);
	await click( 'QA Wildflowers' );
	await page.getByLabel( 'Favorites', { exact: true } ).uncheck();
	// Capture actual editor layers, with no fake raster service.
	await tab( 'Pattern' );
	await page
		.getByLabel( 'Doodle set', { exact: true } )
		.selectOption( 'stamp' );
	const sources = await page
		.getByLabel( 'Source layer', { exact: true } )
		.locator( 'option' )
		.evaluateAll( ( es ) =>
			es.filter( ( e ) => e.value ).map( ( e ) => e.value )
		);
	assert.ok( sources.length >= 2 );
	for ( const id of sources.slice( 0, 2 ) ) {
		await page
			.getByLabel( 'Source layer', { exact: true } )
			.selectOption( id );
		await click( 'Add layer stamp' );
		await page.waitForFunction(
			( n ) => __wpiePattern.params().layers[ 0 ].stamps.length >= n,
			sources.indexOf( id ) + 1
		);
	}
	check(
		'Two real editor layers become distinct stamps',
		( await params() ).layers[ 0 ].stamps.length === 2
	);
	const stampRecipe = await params();
	await click( 'Random pattern' );
	check(
		'Whole-pattern randomization retains captured image sources',
		JSON.stringify( ( await params() ).layers[ 0 ].stamps ) ===
			JSON.stringify( stampRecipe.layers[ 0 ].stamps ) &&
			( await params() ).layers[ 0 ].set === 'stamp'
	);
	await click( 'Undo' );
	check(
		'Image stamps are embedded in SVG',
		( await page.evaluate( () => __wpiePattern.svg() ) ).includes(
			'<image id="pgstamp1"'
		)
	);
	await page.getByLabel( 'Motif frequency 1', { exact: true } ).fill( '0' );
	await page
		.getByLabel( 'Motif frequency 1', { exact: true } )
		.press( 'Tab' );
	check(
		'Stamp frequency excludes an individual source',
		await page.evaluate( () =>
			__patternProbe
				.cellElements( __wpiePattern.params().layers[ 0 ] )
				.every( ( e ) => e.g === 1 )
		)
	);
	await tab( 'Rapport' );
	await page.getByLabel( 'Repeat', { exact: true } ).selectOption( 'rotate' );
	await slider( 'Cell aspect', 1.4 );
	for ( const type of [ 'PNG', 'SVG' ] ) {
		const waiting = page.waitForEvent( 'download' );
		await click( 'Download ' + type + ' tile' );
		const dl = await waiting;
		await dl.saveAs( out + '/export.' + type.toLowerCase() );
		check(
			type + ' download produces a real file',
			fs.statSync( out + '/export.' + type.toLowerCase() ).size > 100
		);
	}
	const storedParams = await params(),
		count = await page.evaluate( () => __auditEditor.state.layers.length );
	await click( 'Insert pattern' );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepg-dialog' )
	);
	await page.waitForFunction(
		( n ) => __auditEditor.state.layers.length === n,
		count + 1
	);
	check(
		'Insert creates a full-document editable pattern fill',
		await page.evaluate( () => {
			const l = __auditEditor.state.layers.find(
				( l ) => l.generator?.id === 'wpie-pattern-generator/pattern'
			);
			return (
				l &&
				l.fillType === 'pattern' &&
				l.w === __auditEditor.state.doc.w &&
				l.h === __auditEditor.state.doc.h
			);
		} )
	);
	await page.evaluate( async () => {
		const layer = __auditEditor.state.layers.find(
			( l ) => l.generator?.id === 'wpie-pattern-generator/pattern'
		);
		await __auditActions[ 0 ].edit( {
			editor: __auditEditor,
			layer,
			extras: {},
		} );
	} );
	await page.waitForFunction( () => window.__wpiePattern );
	check(
		'Reopening preserves the complete recipe and both stamps',
		JSON.stringify( await params() ) === JSON.stringify( storedParams )
	);
	await tab( 'Pattern' );
	await slider( 'Opacity', 60 );
	await click( 'Update pattern' );
	await page.waitForFunction(
		() => ! document.querySelector( '.wpiepg-dialog' )
	);
	check(
		'Updating changes the existing layer in place',
		( await page.evaluate( () => __auditEditor.state.layers.length ) ) ===
			count + 1
	);
	// Pixel comparison: SVG and Canvas, including fractional aspect and crossing stamps.
	const parity = await page.evaluate( async () => {
		const { PRESETS, makeDesign, renderTile, toSvgTile, ensureStamps } =
				__patternProbe,
			values = [];
		const samples = [
			'Midnight Paisley',
			'Classic Houndstooth',
			'Fine Contours',
			'Silver Fronds',
			'Ivory Lace',
			'Golden Herbarium',
			'Tea Room Lace',
			'Moonlit Aviary',
		].map( ( name ) =>
			makeDesign( {
				...PRESETS.find( ( p ) => p.name === name ).p,
				aspect: 1.35,
				repeat: 'third',
			} )
		);
		samples.push(
			__auditEditor.state.layers.find(
				( l ) => l.generator?.id === 'wpie-pattern-generator/pattern'
			).generator.params
		);
		for ( const d of samples ) {
			await ensureStamps( d );
			const a = renderTile( d, 128 ),
				img = new Image(),
				url = URL.createObjectURL(
					new Blob( [ toSvgTile( d, 128 ) ], {
						type: 'image/svg+xml',
					} )
				);
			await new Promise( ( resolve, reject ) => {
				img.onload = resolve;
				img.onerror = reject;
				img.src = url;
			} );
			const b = document.createElement( 'canvas' );
			b.width = a.width;
			b.height = a.height;
			b.getContext( '2d' ).drawImage( img, 0, 0, a.width, a.height );
			URL.revokeObjectURL( url );
			const aa = a
					.getContext( '2d' )
					.getImageData( 0, 0, a.width, a.height ).data,
				bb = b
					.getContext( '2d' )
					.getImageData( 0, 0, b.width, b.height ).data;
			let diff = 0;
			for ( let i = 0; i < aa.length; i++ )
				diff += Math.abs( aa[ i ] - bb[ i ] );
			values.push( diff / aa.length );
		}
		return values;
	} );
	results.svgMeanErrors = parity;
	check(
		'Canvas and SVG agree for ornaments, contours, layers and stamps',
		parity.every( ( v ) => v < 3 )
	);
	// Visual sheet from the real renderer for design review.
	const sheet = await page.evaluate( () => {
		const { MOTIFS, DEFAULTS, makeDesign, renderTile } = __patternProbe,
			c = document.createElement( 'canvas' );
		c.width = 1280;
		c.height = 1480;
		const ctx = c.getContext( '2d' );
		ctx.fillStyle = '#faf8f4';
		ctx.fillRect( 0, 0, c.width, c.height );
		for ( const [ i, m ] of MOTIFS.entries() ) {
			const tile = renderTile(
					makeDesign( {
						...DEFAULTS,
						motif: m.id,
						count: 4,
						size: 75,
						weight: 30,
						amp: 65,
						freqI: 2,
						palette: 'nordlicht',
						repeat: 'straight',
						bg: 'light',
					} ),
					82
				),
				x = ( i % 6 ) * 213,
				y = Math.floor( i / 6 ) * 185;
			ctx.save();
			ctx.translate( x + 5, y + 5 );
			ctx.fillStyle = ctx.createPattern( tile, 'repeat' );
			ctx.fillRect( 0, 0, 200, 155 );
			ctx.restore();
			ctx.fillStyle = '#222';
			ctx.font = '13px sans-serif';
			ctx.fillText( m.label, x + 5, y + 178 );
		}
		return c.toDataURL();
	} );
	fs.writeFileSync(
		out + '/motif-sheet.png',
		Buffer.from( sheet.split( ',' )[ 1 ], 'base64' )
	);
	const collections = await page.evaluate( () => {
		const { GLYPH_SETS, DEFAULTS, makeDesign, renderTile } = __patternProbe,
			c = document.createElement( 'canvas' );
		c.width = 1200;
		c.height = 1000;
		const ctx = c.getContext( '2d' );
		ctx.fillStyle = '#faf8f4';
		ctx.fillRect( 0, 0, c.width, c.height );
		GLYPH_SETS.slice( -16 ).forEach( ( set, i ) => {
			const x = ( i % 4 ) * 300,
				y = Math.floor( i / 4 ) * 250;
			for ( let j = 0; j < set.glyphs.length; j++ ) {
				const tile = renderTile(
					makeDesign( {
						...DEFAULTS,
						motif: 'scatter',
						repeat: 'straight',
						set: set.id,
						bg: 'light',
						count: 4,
						removed: [ 0, 1, 2, 3 ],
						added: [
							{
								id: 1,
								x: 0.5,
								y: 0.5,
								s: 0.95,
								g: j,
								c: 0,
								rot: 0,
							},
						],
						weight: 45,
					} ),
					90
				);
				ctx.drawImage(
					tile,
					x + ( j % 3 ) * 98 + 3,
					y + Math.floor( j / 3 ) * 98 + 3
				);
			}
			ctx.fillStyle = '#222';
			ctx.font = '15px sans-serif';
			ctx.fillText( set.label, x + 7, y + 222 );
		} );
		return c.toDataURL();
	} );
	fs.writeFileSync(
		out + '/collections.png',
		Buffer.from( collections.split( ',' )[ 1 ], 'base64' )
	);
	const stories = await page.evaluate( () => {
		const { PRESETS, makeDesign, renderTile } = __patternProbe,
			c = document.createElement( 'canvas' );
		c.width = 1280;
		c.height = 720;
		const ctx = c.getContext( '2d' );
		ctx.fillStyle = '#faf8f4';
		ctx.fillRect( 0, 0, c.width, c.height );
		PRESETS.slice( -80 )
			.filter(
				( p ) => p.id.endsWith( '-0' ) || p.id.startsWith( 'story-' )
			)
			.forEach( ( p, i ) => {
				const tile = renderTile( makeDesign( p.p ), 110 ),
					x = ( i % 8 ) * 160,
					y = Math.floor( i / 8 ) * 180;
				ctx.save();
				ctx.translate( x + 3, y + 3 );
				ctx.fillStyle = ctx.createPattern( tile, 'repeat' );
				ctx.fillRect( 0, 0, 154, 150 );
				ctx.restore();
				ctx.fillStyle = '#222';
				ctx.font = '11px sans-serif';
				ctx.fillText( p.name, x + 3, y + 167 );
			} );
		return c.toDataURL();
	} );
	fs.writeFileSync(
		out + '/new-presets.png',
		Buffer.from( stories.split( ',' )[ 1 ], 'base64' )
	);
	check(
		'No browser errors or editor error messages',
		! results.errors.length &&
			! ( await page.evaluate( () => __auditMessages.length ) )
	);
} finally {
	fs.writeFileSync(
		out + '/results.json',
		JSON.stringify( results, null, 2 )
	);
	await browser.close();
}
