/**
 * Chaos Art interactions in the real dialog. The editor shell and font loading
 * are controlled by the shared bridge mock; paint, image factories and fitting
 * come from the real core. One browser, no WordPress writes, output under /tmp.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildStage, launchQA, EDITOR } from '../../shared/qa-kit/stage.mjs';

const root = path.resolve(
	path.dirname( fileURLToPath( import.meta.url ) ),
	'..'
);
const out = fs.mkdtempSync(
	path.join( os.tmpdir(), 'wpie-chaos-interactions-' )
);
const stage = await buildStage( { root, out: path.join( out, 'stage' ) } );
fs.cpSync( path.join( root, 'thumbs' ), path.join( stage, 'thumbs' ), {
	recursive: true,
} );
const esbuild = (
	await import(
		path.join(
			EDITOR,
			'tools/template-generator/node_modules/esbuild/lib/main.js'
		)
	)
).default;
await esbuild.build( {
	stdin: {
		contents:
			"import {paintKit} from './src/lib/paint-kit'; import {makeImage} from './src/store/document'; import {fitRects} from './src/lib/image-fit'; window.__corePaint=paintKit; window.__coreImage=makeImage; window.__coreFit=fitRects;",
		resolveDir: EDITOR,
	},
	bundle: true,
	format: 'iife',
	outfile: path.join( stage, 'core.js' ),
	logLevel: 'warning',
	alias: {
		'@wordpress/i18n': path.join(
			EDITOR,
			'tools/template-generator/tools/stubs/i18n.js'
		),
		'@wordpress/hooks': path.join(
			EDITOR,
			'tools/template-generator/tools/stubs/noop.js'
		),
	},
	nodePaths: [ path.join( EDITOR, 'node_modules' ) ],
} );

const qa = await launchQA( { stage, locale: 'en_US', shotDir: out } );
const { page, browser, check } = qa;
page.setDefaultTimeout( 15000 );
const state = () => page.evaluate( () => window.__wpiechaosState() );
const school = ( label ) =>
	page
		.locator( '.wpiechaos-style' )
		.filter( { has: page.getByText( label, { exact: true } ) } )
		.click();
async function charge() {
	const r = await page.locator( '.wpiechaos-field' ).boundingBox();
	for ( let i = 0; i < 112; i++ ) {
		await page.mouse.move(
			r.x + 30 + ( ( i * 23 ) % ( r.width - 60 ) ),
			r.y + 30 + ( ( i * 37 ) % ( r.height - 60 ) )
		);
	}
}
async function reset( doc ) {
	await page.evaluate( ( dimensions ) => {
		const cancel = [
			...document.querySelectorAll( '.dsm-actions button' ),
		].find( ( b ) => b.textContent === 'Cancel' );
		if ( cancel ) {
			cancel.click();
		}
		if ( dimensions ) {
			window.__editor.state.doc = dimensions;
		}
		window.__gen.run( { editor: window.__editor, layer: null } );
	}, doc );
	await charge();
}
async function start() {
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForFunction( () => window.__wpiechaosState().started );
}
async function paint() {
	await page.waitForFunction( () => window.__wpiechaosState().painted > 0 );
}
async function palette( value ) {
	await page.evaluate( ( id ) => {
		const select = [
			...document.querySelectorAll( '.wpiechaos-side select' ),
		].find( ( s ) =>
			[ ...s.options ].some( ( o ) => o.value === 'custom' )
		);
		select.value = id;
		select.dispatchEvent( new Event( 'change', { bubbles: true } ) );
	}, value );
}
async function prepareDelayedText() {
	await school( 'Bauhaus' );
	await page
		.locator( '.wpiechaos-side select' )
		.first()
		.selectOption( 'text' );
	await page.locator( '.wpiechaos-text' ).fill( 'ART' );
	await page
		.locator( '.wpiechaos-motif select' )
		.first()
		.selectOption( 'Georgia' );
	await page.evaluate( () => {
		delete window.__releaseFont;
		window.WPIE.bridge.fonts.ensureFont = () =>
			new Promise( ( resolve ) => {
				window.__releaseFont = resolve;
			} );
	} );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForFunction( () => !! window.__releaseFont );
}

try {
	await page.addScriptTag( { path: path.join( stage, 'core.js' ) } );
	await page.evaluate( () => {
		window.WPIE.bridge.paint = window.__corePaint;
		window.WPIE.bridge.documents.makeImage = window.__coreImage;
	} );
	await reset();
	await school( 'Action painting' );
	await start();
	await page.waitForFunction( () => {
		const engine = window.__wpiechaosEngine;
		if (
			engine.session.stage.pending.some(
				( p ) => p.done > 0 && p.done < p.prep.steps
			)
		) {
			document.querySelector( '.wpiechaos-start' ).click();
			return true;
		}
		return false;
	} );
	const still = await page.evaluate( () => {
		const en = window.__wpiechaosEngine;
		const s = en.session.stage;
		const c = document.createElement( 'canvas' );
		c.width = s.W;
		c.height = s.H;
		s.render( c.getContext( '2d' ), c.width, c.height, en.finishSpec );
		const before = c.toDataURL( 'image/png' );
		const count = s.pending.length;
		const result = en.renderStill();
		return {
			equal: before === result.url,
			count,
			after: s.pending.length,
			realKit: s.kit === window.__corePaint,
		};
	} );
	check(
		still.realKit &&
			still.equal &&
			still.count > 0 &&
			still.count === still.after,
		'export copies the paused pixels without completing pending strokes, with real core paint'
	);

	const oldColors = await page.evaluate( () =>
		JSON.stringify( window.__wpiechaosEngine.world.palette.list )
	);
	await palette( 'ocean' );
	const paletteResult = await page.evaluate( () => {
		const en = window.__wpiechaosEngine;
		const w = en.world;
		const colors = JSON.stringify( w.params.colors );
		w.paletteJolt = true;
		en.session.actors.find( ( a ) => 'heatT' in a ).decide();
		return {
			colors: JSON.stringify( w.palette.list ),
			manual: w.params.autoPalette === false,
			kept: colors === JSON.stringify( w.params.colors ),
		};
	} );
	check(
		paletteResult.colors !== oldColors &&
			paletteResult.manual &&
			paletteResult.kept,
		'palette changes reach the painters and disable automatic palette replacement'
	);
	await page
		.locator( '.wpiechaos-side input[type=range]' )
		.first()
		.fill( '17' );
	await page
		.locator( '.wpiechaos-side input[type=range]' )
		.first()
		.dispatchEvent( 'input' );
	check(
		await page.evaluate( () => {
			const en = window.__wpiechaosEngine;
			const w = en.world;
			const before = w.params.chaos;
			en.session.actors.find( ( a ) => 'lastBreak' in a ).decide();
			return (
				! w.params.autoTemper &&
				before === 0.17 &&
				before === w.params.chaos
			);
		} ),
		'a manual dial stops the restless actor from changing the dials'
	);
	await page.locator( '.wpiechaos-start' ).click();
	await page.locator( '.wpiechaos-remember' ).click();
	check(
		( await state() ).running && ( await state() ).saved.length === 1,
		'remembering a live moment keeps painting'
	);
	await page.waitForFunction( () => window.__wpiechaosState().snapshots > 0 );
	await page.locator( '.wpiechaos-start' ).click();
	await page.locator( '.wpiechaos-strip .wpiechaos-moment' ).first().click();
	check(
		await page.evaluate(
			() =>
				document.querySelector( '.wpiechaos-moment-preview' ).src ===
				window.__wpiechaosEngine.ring.list()[ 0 ].url
		),
		'the chosen historic moment fills the large preview'
	);
	await page.locator( '.wpiechaos-strip .is-live' ).click();
	check(
		await page.locator( '.wpiechaos-moment-preview' ).isHidden(),
		'Now returns to the live canvas'
	);

	// Further pieces use the plain road to keep this interaction check light.
	await page.evaluate( () => {
		window.WPIE.bridge.paint = null;
	} );
	const remembered = await page
		.locator( '.wpiechaos-saved-strip img' )
		.first()
		.getAttribute( 'src' );
	await school( 'Ink Storm' );
	check(
		( await state() ).saved.length === 1,
		'remembered moments survive a change of family'
	);
	await school( 'Echo Chamber' );
	await start();
	await paint();
	await page.evaluate( () => {
		const e = window.__wpiechaosEngine;
		window.__feedbackBefore = [ e.feedbackPass.memA, e.feedbackPass.memB ];
	} );
	await page.locator( '.wpiechaos-remember' ).click();
	check(
		( await page.evaluate( () => {
			const e = window.__wpiechaosEngine;
			return (
				e.running &&
				window.__feedbackBefore.includes( e.feedbackPass.memA ) &&
				window.__feedbackBefore.includes( e.feedbackPass.memB )
			);
		} ) ) && ( await state() ).saved.length === 2,
		'remembering in space preserves the live feedback history and keeps painting'
	);
	await school( 'Bauhaus' );
	await start();
	await paint();
	await page.locator( '.wpiechaos-start' ).click();
	await page
		.locator( '.wpiechaos-saved-strip .wpiechaos-moment' )
		.first()
		.click();
	await page
		.getByRole( 'button', { name: 'Insert as picture', exact: true } )
		.click();
	const inserted = await page.evaluate( () => {
		const layer = window.__dispatched
			.filter( ( a ) => a.type === 'ADD_LAYER' )
			.at( -1 ).layer;
		return { src: layer.src, style: layer.generator.params.styleId };
	} );
	check(
		inserted.src === remembered && inserted.style === 'action',
		'a remembered piece inserts its own pixels and settings after another piece'
	);

	await reset();
	await school( 'Your ensemble' );
	await page
		.locator( '.wpiechaos-ensemble select' )
		.nth( 2 )
		.selectOption( '' );
	await start();
	await paint();
	const voices = await page.evaluate( () =>
		window.__wpiechaosEngine.session.actors
			.filter( ( a ) => a.isPainter )
			.map(
				( a ) => ( a.voice || window.__wpiechaosEngine.world.voice ).id
			)
	);
	check(
		voices.includes( 'bauhaus' ) &&
			voices.includes( 'sumi' ) &&
			voices.every( ( id ) => [ 'bauhaus', 'sumi' ].includes( id ) ),
		'a two-school ensemble uses exactly the chosen schools'
	);
	await page
		.locator( '.wpiechaos-ensemble select' )
		.nth( 2 )
		.selectOption( 'fauvism' );
	check(
		( await state() ).running && ( await state() ).painted > 0,
		'editing the ensemble changes voices without erasing the piece'
	);

	// The finite remembered set does not evict a visitor's favorite.
	for ( let i = 0; i < 6; i++ ) {
		if ( i ) {
			await page.locator( '.wpiechaos-over' ).click();
			await paint();
		}
		await page.locator( '.wpiechaos-remember' ).click();
	}
	check(
		( await state() ).saved.length === 6 &&
			( await page.locator( '.wpiechaos-remember' ).isDisabled() ),
		'six remembered moments fill the set without overwriting any'
	);
	await page.locator( '.wpiechaos-start' ).click();
	await page.locator( '.wpiechaos-forget' ).first().click();
	check(
		( await state() ).saved.length === 5,
		'removing a remembered moment frees space'
	);
	await page.setViewportSize( { width: 1280, height: 720 } );
	check(
		await page.evaluate( () => {
			const foot = document
				.querySelector( '.dsm-foot' )
				.getBoundingClientRect();
			const moments = document
				.querySelector( '.wpiechaos-moments' )
				.getBoundingClientRect();
			return foot.bottom <= innerHeight && moments.bottom <= foot.top;
		} ),
		'both moment strips and the primary action fit a laptop viewport'
	);
	await page.screenshot( {
		path: path.join( out, 'moments.jpg' ),
		type: 'jpeg',
		quality: 75,
		timeout: 10000,
	} );
	await page.setViewportSize( { width: 1500, height: 1000 } );

	for ( const dimensions of [
		{ w: 4800, h: 600 },
		{ w: 600, h: 4800 },
	] ) {
		await reset( dimensions );
		await school( 'Bauhaus' );
		await start();
		await paint();
		await page
			.getByRole( 'button', { name: 'Insert as picture', exact: true } )
			.click();
		const fit = await page.evaluate( () => {
			const l = window.__dispatched
				.filter( ( a ) => a.type === 'ADD_LAYER' )
				.at( -1 ).layer;
			return {
				naturalW: l.naturalW,
				naturalH: l.naturalH,
				box: [ l.w, l.h ],
				crop: window.__coreFit(
					l.naturalW,
					l.naturalH,
					l.w,
					l.h,
					l.imageFit
				),
			};
		} );
		check(
			fit.crop.sx === 0 &&
				fit.crop.sy === 0 &&
				fit.crop.sw === fit.naturalW &&
				fit.crop.sh === fit.naturalH,
			'extreme document ' +
				dimensions.w +
				'x' +
				dimensions.h +
				' inserts the complete picture'
		);
	}

	await reset( { w: 1600, h: 1000 } );
	await prepareDelayedText();
	await page.getByRole( 'button', { name: 'Cancel', exact: true } ).click();
	const old = await page.evaluate( () => {
		window.__oldChaosEngine = window.__wpiechaosEngine;
		window.__releaseFont();
		return document.querySelectorAll( '.wpiechaos-body' ).length;
	} );
	await page.waitForTimeout( 300 );
	check(
		old === 0 &&
			( await page.evaluate(
				() =>
					window.__wpiechaosEngine === window.__oldChaosEngine &&
					! window.__wpiechaosEngine.running
			) ),
		'a closed dialog cannot restart painting after font loading'
	);

	await reset();
	await prepareDelayedText();
	await school( 'Cubism' );
	check(
		! ( await state() ).started && ! ( await state() ).beginning,
		'a style change cancels an outstanding start without an exception'
	);
	await page.evaluate( () => {
		window.WPIE.bridge.fonts.ensureFont = () =>
			new Promise( ( resolve ) => {
				window.__releaseNewFont = resolve;
			} );
	} );
	await page.locator( '.wpiechaos-start' ).click();
	await page.waitForFunction( () => !! window.__releaseNewFont );
	await page.evaluate( () => window.__releaseFont() );
	await page.waitForTimeout( 200 );
	check(
		( await state() ).beginning &&
			! ( await state() ).started &&
			( await page.locator( '.wpiechaos-start' ).isDisabled() ),
		'an old font response cannot finish or unlock the newer start'
	);
	await page.evaluate( () => window.__releaseNewFont() );
	await page.waitForFunction( () => window.__wpiechaosState().started );
	await paint();
	check(
		( await state() ).styleId === 'cubism',
		'the next start uses the new school'
	);

	await reset();
	await school( 'Bauhaus' );
	await page
		.locator( '.wpiechaos-side select' )
		.first()
		.selectOption( 'file' );
	const chooser = page.waitForEvent( 'filechooser' );
	await page
		.getByRole( 'button', { name: 'Choose a picture', exact: true } )
		.click();
	await (
		await chooser
	).setFiles( {
		name: 'motif.svg',
		mimeType: 'image/svg+xml',
		buffer: Buffer.from(
			'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="400" height="300" fill="#ddd"/><circle cx="200" cy="150" r="90" fill="#193d96"/></svg>'
		),
	} );
	await page.waitForFunction(
		() =>
			document.querySelector( '.wpiechaos-filename' ).textContent ===
			'motif.svg'
	);
	await start();
	await page.locator( '.wpiechaos-motif input[type=range]' ).fill( '0' );
	await page
		.locator( '.wpiechaos-motif input[type=range]' )
		.dispatchEvent( 'input' );
	check(
		await page.evaluate(
			() => window.__wpiechaosEngine.world.motifLikeness === 0
		),
		'the likeness dial affects the current piece immediately'
	);
	// The added controls also have room for their longer German labels.
	await page.goto(
		'file://' + path.join( stage, 'index.html' ) + '?locale=de_DE'
	);
	await page.waitForFunction( () => window.__dialogReady === true );
	await page.setViewportSize( { width: 1280, height: 720 } );
	await school( 'Dein Ensemble' );
	check(
		await page.evaluate( () => {
			return [
				...document.querySelectorAll(
					'.wpiechaos-ensemble .dsm-rowline'
				),
			].every( ( row ) => {
				const label = row
					.querySelector( '.dsm-rowline-label' )
					.getBoundingClientRect();
				const control = row
					.querySelector( 'select' )
					.getBoundingClientRect();
				return control.top >= label.bottom && control.width >= 190;
			} );
		} ),
		'the ensemble selectors have full width below their German labels'
	);
	await charge();
	await start();
	await paint();
	await page.locator( '.wpiechaos-remember' ).click();
	await page.locator( '.wpiechaos-start' ).click();
	await page
		.locator( '.wpiechaos-saved-strip .wpiechaos-moment' )
		.first()
		.click();
	await page.screenshot( {
		path: path.join( out, 'moments-de.jpg' ),
		type: 'jpeg',
		quality: 75,
		timeout: 10000,
	} );
	console.log( 'Artifacts: ' + out );
	assert.equal( qa.failures(), 0, 'interaction failures' );
} finally {
	await browser.close();
}
