/**
 * Contact sheet of the BAKED silhouettes - what the extension will
 * really draw, including facing direction, so poses and flips can be
 * judged before they ship.
 *
 *   node tools/sheet-silhouettes.mjs [out.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { SILHOUETTES } from '../src/core/silhouettes.js';

const here = path.dirname( fileURLToPath( import.meta.url ) );
const root = path.resolve( here, '..' );
const out = process.argv[ 2 ] || path.join( here, 'silhouette-src', 'baked.png' );
const GEN = path.resolve( root, '..', '..' );
const req = createRequire( path.join( GEN, 'node_modules', 'x.js' ) );
const { chromium } = req( 'playwright' );
const browser = await chromium.launch( { args: [ '--no-sandbox' ] } );
const page = await browser.newPage( { viewport: { width: 1360, height: 1200 } } );
const tiles = Object.entries( SILHOUETTES ).map( ( [ name, s ] ) => {
	const W = 150;
	const H = 120;
	const sc = Math.min( ( W - 12 ) / s.w, H - 16 );
	const paths = s.polys
		.map(
			( p ) =>
				'M ' +
				p
					.map(
						( [ x, y ] ) =>
							`${ ( W / 2 + ( x - 0.5 ) * s.w * sc ).toFixed( 1 ) } ${ (
								H - 8 - ( 1 - y ) * sc
							).toFixed( 1 ) }`
					)
					.join( ' L ' ) +
				' Z'
		)
		.join( ' ' );
	return `<div class="t"><svg width="${ W }" height="${ H }"><path d="${ paths }" fill="#15181c" fill-rule="evenodd"/></svg><br>${ name }</div>`;
} );
await page.setContent( `<style>body{margin:10px;font:11px monospace;background:#efe9dd}
.t{display:inline-block;margin:3px;text-align:center;background:#fff;border:1px solid #ccc}</style>${ tiles.join( '' ) }` );
await page.waitForTimeout( 200 );
await page.screenshot( { path: out, fullPage: true } );
await browser.close();
console.log( 'wrote', out );
