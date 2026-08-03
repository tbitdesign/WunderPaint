/**
 * Post-build scrub (v1.316): transformers.js ships a dormant jsDelivr
 * default for its wasm/model host. It is short-circuited at run time by our
 * env.wasm.wasmPaths + allowRemoteModels = false, so nothing is ever
 * fetched from it — but wordpress.org forbids referencing a third-party CDN
 * for code, so we remove the string from the built assets entirely. The
 * dead fallback becomes a same-origin path.
 *
 * Runs after `wp-scripts build`: node tools/scrub-cdn.js
 */
const fs = require( 'fs' );
const path = require( 'path' );

const buildDir = path.join( __dirname, '..', 'build' );
const CDN = /https:\/\/cdn\.jsdelivr\.net\/npm\//g;

let scrubbed = 0;
for ( const file of fs.readdirSync( buildDir ) ) {
	if ( ! file.endsWith( '.js' ) ) {
		continue;
	}
	const full = path.join( buildDir, file );
	const src = fs.readFileSync( full, 'utf8' );
	if ( ! src.includes( 'cdn.jsdelivr.net' ) ) {
		continue;
	}
	fs.writeFileSync( full, src.replace( CDN, '/wpie-no-cdn/' ) );
	++scrubbed;
	// eslint-disable-next-line no-console
	console.log( 'scrubbed jsDelivr from', file );
}
if ( ! scrubbed ) {
	// eslint-disable-next-line no-console
	console.log( 'scrub-cdn: no jsDelivr references in build/' );
}
