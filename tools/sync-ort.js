/**
 * Copy the onnxruntime-web wasm runtime artifacts the bundled build may
 * request into assets/ort/ (served same-origin; workers set wasmPaths).
 * Run after every `npm install`/onnxruntime-web update: node tools/sync-ort.js
 */
const fs = require( 'fs' );
const path = require( 'path' );

const dist = path.join( __dirname, '../node_modules/onnxruntime-web/dist' );
const out = path.join( __dirname, '../assets/ort' );
fs.mkdirSync( out, { recursive: true } );

// CPU/SIMD build only (v1.316): the WebGPU (jsep) provider is dropped —
// it broke Smart Select and gave only marginal gains, and shipping the
// ~20 MB jsep wasm doubled the runtime. We ship the ~10 MB CPU pair.
const files = fs
	.readdirSync( dist )
	.filter( ( f ) => /^ort-wasm-simd-threaded\.(mjs|wasm)$/.test( f ) );
for ( const file of files ) {
	fs.copyFileSync( path.join( dist, file ), path.join( out, file ) );
	// eslint-disable-next-line no-console
	console.log(
		'copied',
		file,
		Math.round( fs.statSync( path.join( out, file ) ).size / 1024 ) + 'k'
	);
}
// Remove any stale jsep binaries from earlier installs.
for ( const f of fs.readdirSync( out ) ) {
	if ( f.includes( '.jsep.' ) ) {
		fs.rmSync( path.join( out, f ) );
	}
}
if ( ! files.some( ( f ) => f === 'ort-wasm-simd-threaded.wasm' ) ) {
	throw new Error(
		'CPU runtime (ort-wasm-simd-threaded.wasm) not found in onnxruntime-web/dist'
	);
}
