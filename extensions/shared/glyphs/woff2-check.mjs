/**
 * Proof that a woff2 helper runs without dynamic code.
 *
 * Run it under `node --disallow-code-generation-from-strings`: the flag makes
 * eval() and the Function constructor throw, which is exactly what a
 * Content-Security-Policy without 'unsafe-eval' does in the browser
 * (wunderpaint.com sets one). The stock wawoff2 binding died there at
 * start-up - Embind names its functions and crafts its invokers through
 * `new Function` - so the helper never defined its global and every woff2
 * face fell back to the bundled one (found 12.09.2026 in Type Flow).
 *
 *   node --disallow-code-generation-from-strings woff2-check.mjs \
 *        <helper.js> <globalName> <fixture.woff2> <packageRoot>
 *
 * Loads the helper the way a page would (one global), decompresses the
 * fixture and parses the result with the package's own opentype.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const [ helper, globalName, fixture, pkgRoot ] = process.argv.slice( 2 );
if ( ! helper || ! globalName || ! fixture || ! pkgRoot ) {
	console.error( 'usage: woff2-check.mjs <helper.js> <globalName> <fixture.woff2> <packageRoot>' );
	process.exit( 2 );
}
const abs = path.resolve( helper );
// The Emscripten runtime sees a Node process and reaches for these.
globalThis.window = globalThis;
globalThis.require = createRequire( path.resolve( pkgRoot, 'package.json' ) );
globalThis.__dirname = path.dirname( abs );
globalThis.module = { exports: {} };
vm.runInThisContext( fs.readFileSync( abs, 'utf8' ), { filename: abs } );
const api = globalThis[ globalName ];
if ( ! api || 'function' !== typeof api.decompress ) {
	console.error( 'FAIL: the helper defined no ' + globalName + ' (it died while starting)' );
	process.exit( 1 );
}
const bytes = new Uint8Array( fs.readFileSync( fixture ) );
const ttf = await api.decompress( bytes );
const opentype = globalThis.require( 'opentype.js' );
const font = opentype.parse( ttf.buffer.slice( ttf.byteOffset, ttf.byteOffset + ttf.byteLength ) );
if ( ! font.unitsPerEm || ! font.numGlyphs ) {
	console.error( 'FAIL: decompressed bytes do not parse as a font' );
	process.exit( 1 );
}
console.log( 'woff2 helper ok without dynamic code: ' + ttf.length + ' bytes, ' + font.numGlyphs + ' glyphs' );
