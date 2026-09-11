/** Actual dialog + PaperEngine, using the repository's shared editor bridge harness. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { buildStage, launchQA, EDITOR } from '../../shared/qa-kit/stage.mjs';
const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const processes = execFileSync( 'ps', [ '-eo', 'stat=,comm=' ], {
	encoding: 'utf8',
} );
if (
	processes
		.split( '\n' )
		.some(
			( l ) =>
				! /^\s*Z/.test( l ) &&
				/chrome|chromium|headless_shell/.test( l )
		)
)
	throw Error( 'A headless browser is already running.' );
const out = fs.mkdtempSync( '/tmp/wpie-papercut-library-qa-' );
const stage = await buildStage( { root, out: path.join( out, 'stage' ) } );
const req = createRequire(
	path.join( EDITOR, 'tools/template-generator/node_modules', 'x.js' )
);
await req( 'esbuild' ).build( {
	entryPoints: [ path.join( root, 'tools/preview/library-entry.js' ) ],
	outfile: path.join( stage, 'library.js' ),
	bundle: true,
	format: 'iife',
} );
const qa = await launchQA( {
	stage,
	locale: 'de_DE',
	shotDir: out,
	viewport: { width: 1600, height: 1100 },
} );
const { page, check } = qa;
try {
	await page.waitForFunction( () => window.__pca?.engine.allLayers().length );
	await page.addScriptTag( { path: path.join( stage, 'library.js' ) } );
	check(
		( await page
			.locator( '.wpiepca-tile[data-library-key^="preset:"]' )
			.count() ) === 48,
		'48 starter scene cards'
	);
	check(
		( await page
			.locator( '.wpiepca-tile[data-library-key^="win:"]' )
			.count() ) === 34,
		'34 frame cards'
	);
	const search = page.getByRole( 'searchbox', { name: 'Motive suchen' } ),
		category = page.getByRole( 'combobox', {
			name: 'Kategorie',
			exact: true,
		} ),
		theme = page.getByRole( 'combobox', { name: 'Thema', exact: true } );
	await category.selectOption( 'scenes' );
	await theme.selectOption( 'tropical' );
	check(
		( await page.locator( '.wpiepca-tile:visible' ).count() ) === 4,
		'tropical filter shows its four scenes'
	);
	await search.fill( 'wasserfall' );
	check(
		( await page.locator( '.wpiepca-tile:visible' ).count() ) === 1,
		'search combines with category and theme'
	);
	await search.fill( 'zzzz' );
	check(
		await page.getByText( 'Keine passenden Motive' ).isVisible(),
		'empty search feedback'
	);
	await search.fill( '' );
	await theme.selectOption( 'all' );
	await category.selectOption( 'all' );
	const selectedObject = () =>
		page.evaluate( () =>
			window.__pca.params.layers
				.flatMap( ( l ) => l.objects )
				.find( ( o ) => o.id === window.__pca.selected )
		);
	const adjustAndUndo = async ( label, field ) => {
		const before = await selectedObject();
		const slider = page
			.locator( '.dsm-sliderrow' )
			.filter( { has: page.getByText( label, { exact: true } ) } )
			.locator( 'input[type="range"]' );
		await slider.focus();
		await slider.press( 'ArrowRight' );
		const after = await selectedObject();
		check(
			after[ field ] !== before[ field ],
			label + ' changes the selected object'
		);
		await slider.evaluate( ( el ) => el.blur() );
		await page.keyboard.press( 'Control+z' );
		const restored = await selectedObject();
		check(
			restored[ field ] === before[ field ],
			label + ' can be undone without removing the object'
		);
	};
	await search.fill( 'Baobab' );
	await page.locator( '[data-library-key="tree:baobab"]' ).click();
	check(
		await page.evaluate( () =>
			window.__pca.params.layers.some( ( l ) =>
				l.objects.some(
					( o ) => o.kind === 'trees' && o.species === 'baobab'
				)
			)
		),
		'Baobab inserts through the real card handler'
	);
	await adjustAndUndo( 'Wuchsneigung', 'lean' );
	await search.fill( 'Felsentor' );
	await page.locator( '[data-library-key="landform:rockarch"]' ).click();
	check(
		await page.evaluate( () =>
			window.__pca.params.layers.some( ( l ) =>
				l.objects.some(
					( o ) => o.kind === 'landform' && o.variant === 'rockarch'
				)
			)
		),
		'rock arch inserts as editable landform'
	);
	await adjustAndUndo( 'Breite', 'stretch' );
	await search.fill( '' );
	await category.selectOption( 'frames' );
	await page.locator( '[data-library-key="win:triplecircle"]' ).click();
	check(
		await page.getByText( 'Fensterabstand', { exact: true } ).isVisible(),
		'multi-window spacing control'
	);
	await adjustAndUndo( 'Fensterabstand', 'spacing' );
	await page.locator( '[data-library-key="win:leafwreath"]' ).click();
	check(
		await page.getByText( 'Ornamentdichte', { exact: true } ).isVisible(),
		'wreath ornament control'
	);
	check(
		( await page.evaluate(
			() =>
				window.__pca.params.layers
					.flatMap( ( l ) => l.objects )
					.filter( ( o ) => o.kind === 'frame' ).length
		) ) === 1,
		'changing the frame keeps one frame'
	);
	await adjustAndUndo( 'Ornamentdichte', 'ornament' );
	await category.selectOption( 'scenes' );
	await theme.selectOption( 'tropical' );
	await page.locator( '[data-library-key="preset:junglefalls"]' ).click();
	if (
		await page
			.getByRole( 'button', { name: 'Ersetzen', exact: true } )
			.isVisible()
	)
		await page
			.getByRole( 'button', { name: 'Ersetzen', exact: true } )
			.click();
	check(
		await page.evaluate( () =>
			window.__pca.params.layers
				.flatMap( ( l ) => l.objects )
				.some(
					( o ) => o.kind === 'landform' && o.variant === 'waterfall'
				)
		),
		'new starter scene opens through its real card handler'
	);
	await page.waitForTimeout( 500 );
	await qa.shot( 'dialog-tropical.png' );
	const catalog = await page.evaluate( () => ( {
		samples: window.__pcaLibrary.samples,
		scenes: window.__pcaLibrary.scenes,
	} ) );
	check(
		catalog.samples.length === 89 && catalog.scenes.length === 32,
		'121 additions in total'
	);
	const results = [];
	// Contact sheets in the actual renderer, with labels outside the paper image.
	for ( const [ name, entries ] of [
		[ 'scenes-1', catalog.scenes.slice( 0, 16 ) ],
		[ 'scenes-2', catalog.scenes.slice( 16 ) ],
		[ 'windows', catalog.samples.filter( ( e ) => e.kind === 'frame' ) ],
		[ 'trees', catalog.samples.filter( ( e ) => e.kind === 'trees' ) ],
		[ 'plants', catalog.samples.filter( ( e ) => e.kind === 'plants' ) ],
		[
			'landforms',
			catalog.samples.filter( ( e ) => e.kind === 'landform' ),
		],
		[ 'decor', catalog.samples.filter( ( e ) => e.kind === 'decoration' ) ],
	] ) {
		await page.evaluate( () => {
			document.getElementById( 'library-contact' )?.remove();
			const grid = document.createElement( 'div' );
			grid.id = 'library-contact';
			grid.style.cssText =
				'position:absolute;top:0;left:0;z-index:99999;background:#e6e8eb;padding:16px;display:grid;grid-template-columns:repeat(4,280px);gap:12px;color:#162031;font:16px sans-serif;';
			document.body.append( grid );
		} );
		for ( const entry of entries ) {
			const result = await page.evaluate( ( entry ) => {
				const res = window.__pcaLibrary.render(
					entry,
					entry.kind ? 'midnight' : null,
					420
				);
				const item = document.createElement( 'div' );
				const img = document.createElement( 'img' );
				img.src = res.url;
				img.style.cssText = 'display:block;width:280px;height:187px';
				const caption = document.createElement( 'div' );
				caption.textContent = entry.label;
				caption.style.padding = '7px 0 2px';
				item.append( img, caption );
				document.getElementById( 'library-contact' ).append( item );
				return { id: entry.id, empty: res.empty, layers: res.layers };
			}, entry );
			results.push( result );
			check(
				result.empty === 0,
				`${ entry.label }: all ${ result.layers } layers render`
			);
		}
		await page
			.locator( '#library-contact' )
			.screenshot( { path: path.join( out, `${ name }.png` ) } );
	}
	// Exercise all eight looks at thumbnail size and save comparison for review.
	await page.evaluate( () =>
		document.getElementById( 'library-contact' )?.remove()
	);
	const variants = [];
	for ( const look of [
		'lightbox',
		'midnight',
		'sunset',
		'night',
		'forest',
		'vintage',
		'noirgold',
		'rose',
	] )
		variants.push(
			await page.evaluate( ( look ) => {
				const r = window.__pcaLibrary.render(
					{ id: 'cherrypath' },
					look,
					168
				);
				return { look, empty: r.empty };
			}, look )
		);
	check(
		variants.every( ( v ) => v.empty === 0 ),
		'all eight looks render a new scene at thumbnail size'
	);
	await page.evaluate( () => {
		window.__dispatched.length = 0;
	} );
	await page.locator( '.dsm-actions .ai-btn.primary' ).click();
	await page.waitForFunction( () =>
		window.__dispatched.some(
			( a ) => a.type === 'ADD_LAYER' && a.layer.generator
		)
	);
	const inserted = await page.evaluate( () => {
		const actions = window.__dispatched,
			group = actions.find(
				( a ) => a.type === 'ADD_LAYER' && a.layer.generator
			)?.layer;
		const objects =
			group?.generator.params?.layers?.flatMap( ( l ) => l.objects ) ||
			[];
		return {
			kinds: objects.map( ( o ) => o.kind ),
			variants: objects.map( ( o ) => o.species || o.variant ),
			images: actions
				.filter(
					( a ) =>
						a.type === 'ADD_LAYER' && a.layer.parent === group?.id
				)
				.every( ( a ) =>
					( a.layer.src || '' ).startsWith( 'data:image' )
				),
			children: actions.filter(
				( a ) => a.type === 'ADD_LAYER' && a.layer.parent === group?.id
			).length,
		};
	} );
	check(
		inserted.images &&
			inserted.children >= 5 &&
			inserted.kinds.includes( 'landform' ) &&
			inserted.variants.includes( 'banana' ) &&
			inserted.variants.includes( 'waterfall' ),
		'new scene inserts as image layers and retains editable generator objects'
	);
	fs.writeFileSync(
		path.join( out, 'results.json' ),
		JSON.stringify( { results, variants, inserted }, null, 2 )
	);
	console.log( 'QA artifacts: ' + out );
	process.exitCode = await qa.finish();
} catch ( error ) {
	await qa.browser.close();
	throw error;
}
