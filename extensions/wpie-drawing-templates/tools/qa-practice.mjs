/** Real React editor, reducer, raster renderer, font picker and color panel. */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { ALL_MODES, PRESETS } from '../src/practice-catalog.js';
import { MOTIFS } from '../src/motifs.js';

const source = fileURLToPath( new URL( '../', import.meta.url ) );
const root = fileURLToPath( new URL( '../../../', import.meta.url ) );
const version = JSON.parse(
	fs.readFileSync( source + '/manifest.json' )
).version;
const req = createRequire( root + '/tools/template-generator/package.json' );
const out = fs.mkdtempSync( '/tmp/wpie-drawing-qa-' );
function occupied() {
	return execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], { encoding: 'utf8' } )
		.split( '\n' )
		.some(
			( line ) =>
				! /^\s*Z/.test( line ) &&
				/chrome|chromium|headless_shell/.test( line )
		);
}
if ( occupied() ) throw Error( 'Another browser is active' );
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
const css = [ root + '/build/index.css' ],
	extensions = [];
for ( const name of fs.readdirSync( root + '/extensions' ) ) {
	const dir = root + '/extensions/' + name;
	if ( fs.existsSync( dir + '/style.css' ) ) css.push( dir + '/style.css' );
	if ( fs.existsSync( dir + '/manifest.json' ) ) {
		const manifest = JSON.parse(
			fs.readFileSync( dir + '/manifest.json' )
		);
		extensions.push( {
			...manifest,
			main: pathToFileURL( dir + '/' + manifest.main ).href,
		} );
	}
}
fs.writeFileSync(
	out + '/index.html',
	'<!doctype html><html lang="en"><meta charset="utf-8">' +
		css
			.map(
				( file ) =>
					'<link rel="stylesheet" href="' +
					pathToFileURL( file ).href +
					'">'
			)
			.join( '' ) +
		'<style>html,body{margin:0;height:100%;overflow:hidden}#wpie-root,#app{height:100%}</style><div id="wpie-root" data-theme="light"><div id="app"></div></div><script>window.__auditBoot=' +
		JSON.stringify( { extensions } ) +
		'</script><script type="module">import "./app.js";await import(' +
		JSON.stringify( pathToFileURL( source + '/extension.js' ).href ) +
		');</script></html>'
);
if ( occupied() ) throw Error( 'Another browser became active' );
const browser = await req( 'playwright' ).chromium.launch( {
	args: [
		'--no-sandbox',
		'--use-gl=swiftshader',
		'--enable-unsafe-swiftshader',
		'--allow-file-access-from-files',
	],
} );
console.log( 'QA artifacts: ' + out );
try {
	const page = await browser.newPage( {
			viewport: { width: 1600, height: 1000 },
		} ),
		errors = [];
	page.setDefaultTimeout( 20000 );
	page.on( 'pageerror', ( e ) => {
		errors.push( e.message );
		console.error( e.message );
	} );
	page.on( 'console', ( m ) => {
		if ( m.type() === 'error' ) {
			errors.push( m.text() );
			console.error( m.text() );
		}
	} );
	await page.route( /^https?:/, ( route ) => route.abort() );
	await page.goto( pathToFileURL( out + '/index.html' ).href );
	await page.waitForFunction(
		() =>
			window.__auditActions?.length &&
			window.__auditEditor?.state.colorPanelCommand === 0
	);
	const open = async ( edit = false ) => {
		await page.evaluate(
			( edit ) =>
				window.__auditOpen(
					edit
						? window.__auditEditor.state.layers.find(
								( l ) => l.generator
						  )
						: null
				),
			edit
		);
		await page.waitForFunction( () => window.__drawingTemplates?.ready() );
	};
	const click = ( name ) =>
		page.getByRole( 'button', { name, exact: true } ).click();
	const params = () =>
		page.evaluate( () => window.__drawingTemplates.params );
	const check = ( label, ok ) => {
		assert.ok( ok, label );
		console.log( label );
	};
	const settle = () => page.waitForTimeout( 300 );
	await open();
	await settle();
	// Playwright clicks can scroll even an overflow:hidden ancestor into view.
	// Use native wheel input so this catches the clipping users actually hit.
	async function scrollLibrary( label ) {
		await click( label );
		await settle();
		const before = await page.evaluate( () => {
			const list = document.querySelector( '.wpiedrw-library-content' );
			const panel = document.querySelector( '.wpiedrw-library' );
			const rect = list.getBoundingClientRect();
			return {
				x: rect.left + rect.width / 2,
				y:
					( rect.top +
						Math.min(
							rect.bottom,
							panel.getBoundingClientRect().bottom
						) ) /
					2,
				top: list.scrollTop,
				filterTop: document
					.querySelector( '.wpiedrw-library-tools' )
					.getBoundingClientRect().top,
			};
		} );
		await page.mouse.move( before.x, before.y );
		await page.mouse.wheel( 0, 650 );
		await settle();
		check(
			label + ': mouse wheel scrolls the library',
			await page
				.locator( '.wpiedrw-library-content' )
				.evaluate( ( node, top ) => node.scrollTop > top, before.top )
		);
		await page.mouse.wheel( 0, 100000 );
		await settle();
		check(
			label + ': last entry is reachable and filters stay visible',
			await page.evaluate( ( filterTop ) => {
				const list = document.querySelector(
					'.wpiedrw-library-content'
				);
				const rect = list.getBoundingClientRect();
				const last = list
					.querySelector(
						'.dsm-card:last-child .dsm-pick:last-child'
					)
					.getBoundingClientRect();
				return (
					list.scrollTop >=
						list.scrollHeight - list.clientHeight - 1 &&
					last.top >= rect.top &&
					last.bottom <= rect.bottom + 1 &&
					Math.abs(
						document
							.querySelector( '.wpiedrw-library-tools' )
							.getBoundingClientRect().top - filterTop
					) < 1
				);
			}, before.filterTop )
		);
		await page.mouse.wheel( 0, -100000 );
		await settle();
	}
	for ( const viewport of [
		{ width: 1600, height: 1000 },
		{ width: 1280, height: 800 },
	] ) {
		await page.setViewportSize( viewport );
		for ( const tab of [ 'Templates', 'Presets', 'Motifs' ] )
			await scrollLibrary( tab );
	}
	await page.setViewportSize( { width: 1600, height: 1000 } );
	await click( 'Templates' );
	await settle();
	check(
		'25 templates are grouped into five sections with icons',
		( await page.locator( '[data-mode]' ).count() ) === 25 &&
			( await page
				.locator( '.wpiedrw-library-content .dsm-card-head svg' )
				.count() ) === 5
	);
	await page
		.locator( '.wpiedrw-library-content img' )
		.evaluateAll( ( images ) =>
			images.forEach( ( image ) => {
				image.loading = 'eager';
			} )
		);
	await page.waitForFunction( () =>
		[
			...document.querySelectorAll( '.wpiedrw-library-content img' ),
		].every( ( image ) => image.complete && image.naturalWidth > 0 )
	);
	check(
		'Versioned local worksheet thumbnails load',
		await page
			.locator( '.wpiedrw-library-content img' )
			.first()
			.getAttribute( 'src' )
			.then(
				( src ) =>
					src.includes( 'assets/templates/' ) &&
					src.includes( '?ver=' + version )
			)
	);
	await page.screenshot( { path: out + '/library-light.png' } );
	await click( 'Motifs' );
	// 3.1: counted from the library itself, not written down here.
	const sections = new Set( MOTIFS.map( ( m ) => m.category ) ).size;
	check(
		`${ MOTIFS.length } motifs in ${ sections } icon sections`,
		( await page.locator( '[data-motif]' ).count() ) === MOTIFS.length &&
			( await page
				.locator( '.wpiedrw-library-content .dsm-card-head svg' )
				.count() ) === sections
	);
	await page
		.getByRole( 'combobox', { name: 'Category', exact: true } )
		.selectOption( 'Ocean life' );
	check(
		'Category narrows motif choices to nine',
		( await page.locator( '[data-motif]' ).count() ) === 9
	);
	await page.locator( '[data-motif="octopus"]' ).click();
	await settle();
	check(
		'Selecting a motif opens an applicable drawing template',
		( await params() ).mode === 'coloring' &&
			( await params() ).motif === 'octopus'
	);
	await click( 'Random in category' );
	check(
		'Random stays in the selected category and changes the motif',
		[
			'fish',
			'angelfish',
			'whale',
			'dolphin',
			'shark',
			'jellyfish',
			'seahorse',
			'turtle',
		].includes( ( await params() ).motif )
	);
	await page.getByRole( 'searchbox' ).fill( 'nonexistent' );
	check(
		'Empty search disables random',
		await page
			.getByRole( 'button', { name: 'Random in category' } )
			.isDisabled()
	);
	await click( 'Presets' );
	check(
		'73 concrete presets',
		( await page.locator( '[data-preset]' ).count() ) === PRESETS.length
	);
	await page.getByRole( 'searchbox' ).fill( 'Enlarge' );
	await click( 'Enlarge a drawing' );
	await settle();
	check(
		'Preset synchronizes the scale control',
		( await page
			.getByRole( 'combobox', { name: 'Drawing scale', exact: true } )
			.inputValue() ) === '1.5'
	);
	const renderTimes = [];
	for ( const mode of ALL_MODES ) {
		const result = await page.evaluate( ( id ) => {
			window.__drawingTemplates.choose( {
				mode: id,
				source: 'motif',
				motif: 'fox',
				practiceVariant: 0,
			} );
			const start = performance.now(),
				c = window.__drawingTemplates.bake();
			return {
				w: c.width,
				h: c.height,
				ms: performance.now() - start,
				png: c.toDataURL(),
			};
		}, mode.id );
		assert.ok( result.w >= 600 && result.h >= 400, mode.id );
		renderTimes.push( { id: mode.id, ms: Math.round( result.ms ) } );
		fs.writeFileSync(
			out + '/' + mode.id + '.png',
			Buffer.from( result.png.split( ',' )[ 1 ], 'base64' )
		);
	}
	check( 'All 25 modes render in the browser', renderTimes.length === 25 );
	console.log( JSON.stringify( renderTimes ) );
	await page.evaluate( () =>
		window.__drawingTemplates.choose( {
			mode: 'lettering',
			practiceText: 'WunderPaint',
			rows: 4,
		} )
	);
	await settle();
	await page
		.getByRole( 'textbox', { name: 'Practice text', exact: true } )
		.fill( 'Hallo Thomas' );
	await settle();
	check(
		'Custom lettering text reaches the sheet recipe',
		( await params() ).practiceText === 'Hallo Thomas'
	);
	await page.screenshot( { path: out + '/lettering-light.png' } );
	await page.evaluate( () => {
		document.getElementById( 'wpie-root' ).dataset.theme = 'dark';
		window.__drawingTemplates.choose( {
			mode: 'construction',
			source: 'motif',
			practiceVariant: 1,
			motif: 'lighthouse',
		} );
	} );
	await settle();
	await page.screenshot( { path: out + '/construction-dark.png' } );
	await page.setViewportSize( { width: 1280, height: 800 } );
	await settle();
	check(
		'Panels fit at 1280 pixels',
		await page.evaluate( () => {
			const d = document
					.querySelector( '.wpiedrw-dialog' )
					.getBoundingClientRect(),
				s = document
					.querySelector( '.wpiedrw-side' )
					.getBoundingClientRect();
			return (
				s.right <= d.right + 1 &&
				d.right <= innerWidth &&
				document.querySelector( '.wpiedrw-view' ).clientWidth > 300
			);
		} )
	);
	await page.screenshot( { path: out + '/dialog-1280.png' } );
	await page.setViewportSize( { width: 1600, height: 1000 } );
	await page.evaluate( () =>
		window.__drawingTemplates.choose( { mode: 'grid', source: 'doc' } )
	);
	await page.waitForFunction( () => window.__drawingTemplates.ready() );
	check(
		'Whole Document uses the real editor raster renderer',
		( await params() ).source === 'doc' &&
			( await page
				.getByRole( 'combobox', { name: 'Source', exact: true } )
				.locator( 'option[value="doc"]' )
				.textContent() ) === 'Whole Document'
	);
	const sourceSelect = page.getByRole( 'combobox', {
		name: 'Source',
		exact: true,
	} );
	const layerID = await page.evaluate(
		() => window.__auditEditor.state.layers[ 0 ].id
	);
	await sourceSelect.selectOption( 'layer:' + layerID );
	await page.waitForFunction( () => window.__drawingTemplates.ready() );
	check(
		'Individual editor layer remains selectable',
		( await params() ).source === 'layer:' + layerID
	);
	await page.evaluate( () => {
		window.__beforeColor = window.__drawingTemplates.bake().toDataURL();
	} );
	const swatch = page.locator( '.wpiedrw-customs button' ).first();
	await swatch.click();
	await page.waitForSelector( '.color-panel-window' );
	const hex = page
		.locator( '.color-panel-window' )
		.getByRole( 'textbox', { name: 'Hex color', exact: true } );
	await hex.fill( '#315f87' );
	await hex.press( 'Enter' );
	await settle();
	check(
		'The shared color panel updates the generator',
		( await params() ).customColors.includes( '#315f87' ) &&
			( await page.evaluate(
				() =>
					window.__beforeColor !==
					window.__drawingTemplates.bake().toDataURL()
			) )
	);
	await page.keyboard.press( 'Escape' );
	await page.waitForSelector( '.color-panel-window', { state: 'detached' } );
	check(
		'Escape closes the color window and keeps the extension open',
		( await page.locator( '.wpiedrw-dialog' ).count() ) === 1
	);
	await page.evaluate( () =>
		window.__drawingTemplates.choose( {
			mode: 'construction',
			source: 'motif',
			motif: 'lighthouse',
			practiceVariant: 1,
		} )
	);
	await settle();
	const saved = await params();
	await click( 'Insert template' );
	await page.waitForFunction( () =>
		window.__auditEditor.state.layers.some(
			( l ) => l.generator?.id === 'wpie-drawing-templates/sheet'
		)
	);
	check(
		'Insert creates a real editor image layer with full resolution',
		await page.evaluate( () => {
			const l = window.__auditEditor.state.layers.find(
				( item ) => item.generator
			);
			return (
				l.naturalW === 1080 &&
				l.naturalH === 1400 &&
				l.src.startsWith( 'data:image/png' )
			);
		} )
	);
	await open( true );
	check(
		'Reopening restores the complete recipe',
		JSON.stringify( await params() ) === JSON.stringify( saved )
	);
	await page.evaluate( () =>
		window.__drawingTemplates.choose( { motif: 'turtle' } )
	);
	await settle();
	await click( 'Update template' );
	await page.waitForFunction(
		() =>
			window.__auditEditor.state.layers.find( ( l ) => l.generator )
				?.generator.params.motif === 'turtle'
	);
	check(
		'Editing updates the same image instead of inserting a second layer',
		await page.evaluate(
			() =>
				window.__auditEditor.state.layers.filter( ( l ) => l.generator )
					.length === 1
		)
	);
	await open();
	await page.evaluate( () => {
		window.__drawingTemplates.choose( { source: 'doc' } );
		window.__drawingTemplates.close();
	} );
	await settle();
	check(
		'Closing during source rendering does not resurrect the dialog',
		( await page.locator( '.wpiedrw-dialog' ).count() ) === 0
	);
	check( 'No browser errors', errors.length === 0 );
	check(
		'No editor error messages',
		await page.evaluate( () => window.__auditMessages.length === 0 )
	);
} finally {
	await browser.close();
}
