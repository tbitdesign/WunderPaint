/** Inspect the actual CSS-rendered library cards, not a separate geometry contact sheet. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { buildStage, launchQA } from '../../shared/qa-kit/stage.mjs';
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
	throw Error( 'A browser is already running.' );
const out = fs.mkdtempSync( '/tmp/wpie-papercut-thumbnails-' );
const stage = await buildStage( { root, out: path.join( out, 'stage' ) } );
const qa = await launchQA( {
	stage,
	shotDir: out,
	locale: 'de_DE',
	viewport: { width: 1600, height: 1100 },
} );
const { page, check } = qa;
try {
	await page.waitForFunction(
		() => document.querySelectorAll( '.wpiepca-tile-thumb' ).length === 194
	);
	await page.waitForFunction(
		() =>
			[ ...document.querySelectorAll( '.wpiepca-tile-thumb' ) ].every(
				( el ) => el.style.backgroundImage.includes( 'url(' )
			),
		{ timeout: 45000 }
	);
	const cards = await page
		.locator( '.wpiepca-tile-thumb' )
		.evaluateAll( ( els ) =>
			els.map( ( el ) => {
				const style = getComputedStyle( el ),
					rect = el.getBoundingClientRect();
				return {
					key: el.parentElement.dataset.libraryKey,
					size: style.backgroundSize,
					position: style.backgroundPosition,
					repeat: style.backgroundRepeat,
					width: rect.width,
					height: rect.height,
				};
			} )
		);
	check(
		cards.every(
			( c ) =>
				c.size === 'contain' &&
				c.position === '50% 50%' &&
				c.repeat === 'no-repeat'
		),
		'all 194 actual cards fit and center their image without cropping or repetition'
	);
	check(
		cards.every( ( c ) => Math.abs( c.width / c.height - 1.5 ) < 0.025 ),
		'all cards keep the rendered 3:2 aspect ratio'
	);
	const lateBaseStyle = await page.addStyleTag( {
		content: '#wpie-root .dsm-pick-thumb { background: #20242b; }',
	} );
	check(
		await page
			.locator( '.wpiepca-tile-thumb' )
			.evaluateAll( ( els ) =>
				els.every(
					( el ) =>
						getComputedStyle( el ).backgroundSize === 'contain' &&
						getComputedStyle( el ).backgroundPosition === '50% 50%'
				)
			),
		'thumbnail sizing survives a later shared background shorthand'
	);
	await lateBaseStyle.evaluate( ( el ) => el.remove() );
	const before = await page.evaluate( () =>
		JSON.stringify( window.__pca.params )
	);
	const category = page.getByRole( 'combobox', {
		name: 'Kategorie',
		exact: true,
	} );
	for ( const family of [
		'scenes',
		'frames',
		'trees',
		'plants',
		'landscape',
		'sky',
		'decor',
	] ) {
		await category.selectOption( family );
		await page
			.locator( '.wpiepca-library-scroll' )
			.evaluate( ( el ) => ( el.scrollTop = 0 ) );
		await qa.shot( 'panel-' + family + '.png' );
	}
	await category.selectOption( 'all' );
	check(
		( await page.evaluate( () =>
			JSON.stringify( window.__pca.params )
		) ) === before,
		'preview rendering and category navigation leave the scene untouched'
	);
	// Clone the live cards under the same root and styles, preserving each card's real width.
	// Only the sheet layout changes, never the thumbnail renderer or its CSS.
	for ( const [ family, prefixes ] of [
		[ 'scenes', [ 'preset:' ] ],
		[ 'frames', [ 'win:' ] ],
		[ 'botanical', [ 'tree:', 'plant:' ] ],
		[
			'elements',
			[ 'base:', 'landform:', 'decoration:', 'sky:', 'an:', 'fr:' ],
		],
	] ) {
		await page.evaluate(
			( { prefixes, cards } ) => {
				document.getElementById( 'thumbnail-sheet' )?.remove();
				const sheet = document.createElement( 'div' );
				sheet.id = 'thumbnail-sheet';
				sheet.className = 'wpiepca-libgrid';
				sheet.style.cssText =
					'position:fixed;top:0;left:0;z-index:999999;display:grid;grid-template-columns:repeat(6,120px);align-content:start;gap:12px;padding:16px;background:#20242b;max-height:none;';
				for ( const button of document.querySelectorAll(
					'.wpiepca-left .wpiepca-tile'
				) ) {
					if (
						! prefixes.some( ( prefix ) =>
							button.dataset.libraryKey.startsWith( prefix )
						)
					)
						continue;
					const clone = button.cloneNode( true );
					clone.hidden = false;
					const card = cards.find(
						( c ) => c.key === button.dataset.libraryKey
					);
					clone.style.width = card.width + 10 + 'px';
					clone.style.alignSelf = 'start';
					sheet.append( clone );
				}
				document.getElementById( 'wpie-root' ).append( sheet );
			},
			{ prefixes, cards }
		);
		await page.locator( '#thumbnail-sheet' ).screenshot( {
			path: path.join( out, 'cards-' + family + '.png' ),
		} );
	}
	await page.evaluate( () =>
		document.getElementById( 'thumbnail-sheet' ).remove()
	);
	await category.selectOption( 'sky' );
	// Compare each screenshot's visible motif with its own card background.
	const samples = [];
	for ( const key of [
		'sky:orbmoon',
		'sky:orbcrescent',
		'sky:orbsun',
		'sky:cloud',
		'sky:flockgullfly',
	] ) {
		const thumb = page.locator(
			`[data-library-key="${ key }"] .wpiepca-tile-thumb`
		);
		await thumb.scrollIntoViewIfNeeded();
		const png = await thumb.screenshot();
		const metrics = await page.evaluate(
			async ( data ) => {
				const img = new Image();
				img.src = data;
				await img.decode();
				const c = document.createElement( 'canvas' );
				c.width = img.width;
				c.height = img.height;
				const g = c.getContext( '2d' );
				g.drawImage( img, 0, 0 );
				const p = g.getImageData( 0, 0, c.width, c.height ).data;
				const bgAt = ( 5 * c.width + 5 ) * 4;
				const bg = [ p[ bgAt ], p[ bgAt + 1 ], p[ bgAt + 2 ] ];
				let ink = 0,
					x = 0,
					y = 0;
				for ( let i = 0; i < p.length; i += 4 ) {
					if (
						Math.hypot(
							p[ i ] - bg[ 0 ],
							p[ i + 1 ] - bg[ 1 ],
							p[ i + 2 ] - bg[ 2 ]
						) > 80
					) {
						ink++;
						x += ( i / 4 ) % c.width;
						y += Math.floor( i / 4 / c.width );
					}
				}
				return {
					coverage: ink / ( c.width * c.height ),
					cx: x / Math.max( 1, ink ) / c.width,
					cy: y / Math.max( 1, ink ) / c.height,
				};
			},
			'data:image/png;base64,' + png.toString( 'base64' )
		);
		samples.push( { key, ...metrics } );
		check(
			metrics.coverage > 0.06 &&
				metrics.coverage < 0.8 &&
				metrics.cx > 0.2 &&
				metrics.cx < 0.8 &&
				metrics.cy > 0.2 &&
				metrics.cy < 0.8,
			key + ' has a visible centered motif in the actual card'
		);
	}
	fs.writeFileSync(
		path.join( out, 'results.json' ),
		JSON.stringify( { cards, samples }, null, 2 )
	);
	console.log( 'QA artifacts: ' + out );
	process.exitCode = await qa.finish();
} catch ( error ) {
	await qa.browser.close();
	throw error;
}
