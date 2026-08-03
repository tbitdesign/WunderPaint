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
 * @param {string} url Same-origin binary URL.
 * @return {Promise<ArrayBuffer|null>} The bytes, or null.
 */
export async function cachedRuntimeBuffer( url ) {
	if ( 'undefined' === typeof caches ) {
		return null;
	}
	const cache = await caches.open( 'wpie-ml-runtime' );
	let res = await cache.match( url );
	if ( ! res ) {
		res = await fetch( url, { credentials: 'same-origin' } );
		if ( ! res || ! res.ok ) {
			return null;
		}
		try {
			await cache.put( url, res.clone() );
		} catch ( e ) {
			// Quota exceeded: serve uncached this time.
		}
	}
	return res.arrayBuffer();
}

/** The one wasm binary the shared CPU/SIMD runtime loads (v1.316). */
export const ORT_WASM_FILE = 'ort-wasm-simd-threaded.wasm';
