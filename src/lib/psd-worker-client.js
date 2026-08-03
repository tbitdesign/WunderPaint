/**
 * PSD worker instantiation, isolated in its own module because
 * `import.meta.url` is browser/webpack-only; the main-thread PSD path never
 * loads this file (it is reached via dynamic import behind an
 * OffscreenCanvas feature check).
 */

export function runPsdWorker( message, transfers ) {
	return new Promise( ( resolve, reject ) => {
		// MUST be exactly `new Worker( new URL( … ) )`, webpack only
		// detects this literal pattern and bundles the worker with its
		// npm dependencies; `window.Worker` ships the raw file instead.
		const worker = new Worker(
			new URL( './psd.worker.js', import.meta.url )
		);
		worker.onmessage = ( event ) => {
			worker.terminate();
			if ( event.data.error ) {
				reject( new Error( event.data.error ) );
			} else {
				resolve( event.data );
			}
		};
		worker.onerror = ( err ) => {
			worker.terminate();
			reject( new Error( err.message || 'PSD worker failed' ) );
		};
		worker.postMessage( message, transfers );
	} );
}
