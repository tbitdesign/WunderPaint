/**
 * Fetch a shipped content pack (v1.261.0).
 *
 * The bundled templates and combos are several megabytes of highly
 * compressible JSON. They used to ride inside webpack chunks, which meant
 * the browser downloaded them raw: we cannot count on the host to gzip,
 * since plenty of WordPress servers ship without mod_deflate, nginx setups
 * ignore .htaccess, and a plugin has no business rewriting server config to
 * make up for it. The plugin ships the packs as plain .json (wordpress.org
 * forbids bundling a .gz) and gzips them once into uploads at runtime
 * (Content_Cache, exposed as window.WPIE.contentCacheUrl); the standalone
 * build ships the .gz next to the plain file. We fetch the .gz and inflate it
 * here, which behaves the same on every host: measured ~11:1.
 *
 * Browsers without DecompressionStream, and installs where the .gz is
 * unavailable, fall back to the plain .json that always ships.
 */

const canInflate = () =>
	typeof window !== 'undefined' &&
	'function' === typeof window.DecompressionStream;

/**
 * Read a pack response, whatever the host did to it on the way out.
 *
 * Most servers hand the .gz back untouched, so we inflate it ourselves.
 * Some map the suffix to Content-Encoding, in which case the browser
 * already inflated it and a second pass would throw. The gzip magic number
 * tells the two apart, which beats trusting a header the browser may strip.
 *
 * @param {Response} res Fetch response for the .json.gz file.
 * @return {Promise<*>} The parsed pack.
 */
async function readPack( res ) {
	const buf = await res.arrayBuffer();
	const head = new Uint8Array( buf, 0, Math.min( 2, buf.byteLength ) );
	if ( 0x1f !== head[ 0 ] || 0x8b !== head[ 1 ] ) {
		return JSON.parse( new TextDecoder().decode( buf ) );
	}
	const stream = new Blob( [ buf ] )
		.stream()
		.pipeThrough( new window.DecompressionStream( 'gzip' ) );
	return new Response( stream ).json();
}

/**
 * Load one bundled content pack by name.
 *
 * @param {string} name Pack file name without extension, e.g. `bundled-templates`.
 * @return {Promise<Array>} The pack contents (empty array if unavailable).
 */
export async function fetchPack( name ) {
	const plugin = window.WPIE?.pluginUrl || '';
	const cache = window.WPIE?.contentCacheUrl || '';
	const bundled = plugin + 'assets/content/' + name;

	if ( canInflate() ) {
		// Prefer the gzipped pack (~11:1). In the plugin it lives in uploads
		// (contentCacheUrl); the standalone build ships it next to the plain
		// file. Either way we inflate it client-side.
		// Only offer the bundled .gz when the plugin actually ships it.
		// The wordpress.org release strips them, so asking anyway costs a
		// 404 in the console on every install whose uploads cache is
		// unavailable, for a file that was never going to be there.
		const gzSources = [];
		if ( cache ) {
			gzSources.push( cache + '/' + name + '.json.gz' );
		}
		if ( window.WPIE?.bundledPackGz ) {
			gzSources.push( bundled + '.json.gz' );
		}
		for ( const gz of gzSources ) {
			try {
				const res = await window.fetch( gz );
				if ( res.ok ) {
					return await readPack( res );
				}
			} catch ( e ) {
				// Try the next source.
			}
		}
	}

	// The plain .json always ships and is the final fallback.
	const res = await window.fetch( bundled + '.json' );
	if ( ! res.ok ) {
		throw new Error(
			'WPIE: content pack ' + name + ' failed (' + res.status + ')'
		);
	}
	return res.json();
}
