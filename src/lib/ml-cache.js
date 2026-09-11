/**
 * Cache-API-backed fetch for the ML runtime's WebAssembly binaries
 * (v1.298.1). The ONNX runtime pulls its ~21 MB wasm with a plain
 * fetch(), so on hosts without long-lived cache headers (or with HTTP
 * caches that evict entries this large) every session downloads it
 * again. A Cache API entry is ours and survives reloads on any host —
 * exactly what a wordpress.org install needs, where the server config
 * is out of our hands.
 *
 * Worker-safe: the remove-background path runs inside a Web Worker,
 * which has its own `caches` global.
 */

/* global caches */

/**
 * Fetch a same-origin binary through the Cache API. Returns null when
 * the Cache API is unavailable or the fetch fails, so callers can fall
 * back to the runtime's own loader.
 *
 * The plugin version is part of the key. It used to be the bare file
 * URL, so after an update the NEW runtime kept loading the OLD binary
 * from this cache, and nothing in the project ever deleted an entry -
 * the classic "feature X broke with the update, but only for some
 * people". Entries of other versions go as soon as a new one lands.
 *
 * @param {string} url     Same-origin binary URL.
 * @param {string} version Plugin version (window.WPIE.version; a worker
 *                         gets it in its message).
 * @return {Promise<ArrayBuffer|null>} The bytes, or null.
 */
export async function cachedRuntimeBuffer( url, version = '' ) {
	if ( 'undefined' === typeof caches ) {
		return null;
	}
	const cache = await caches.open( 'wpie-ml-runtime' );
	const key = version
		? `${ url }?ver=${ encodeURIComponent( version ) }`
		: url;
	let res = await cache.match( key );
	if ( ! res ) {
		res = await fetch( key, { credentials: 'same-origin' } );
		if ( ! res || ! res.ok ) {
			return null;
		}
		try {
			await cache.put( key, res.clone() );
			for ( const req of await cache.keys() ) {
				const stored = req.url || String( req );
				if ( stored !== key && stored.split( '?' )[ 0 ] === url ) {
					await cache.delete( req );
				}
			}
		} catch ( e ) {
			// Quota exceeded: serve uncached this time.
		}
	}
	return res.arrayBuffer();
}

/** The one wasm binary the shared CPU/SIMD runtime loads (v1.316). */
export const ORT_WASM_FILE = 'ort-wasm-simd-threaded.wasm';
