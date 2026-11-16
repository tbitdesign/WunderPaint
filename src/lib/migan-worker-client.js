/**
 * Spawns the MI-GAN worker (object-removal.js). Browser/webpack only: it
 * uses `new Worker( new URL( …, import.meta.url ) )`, which Jest cannot
 * parse, so object-removal.js imports it lazily.
 */

/**
 * Run one removal in the worker.
 *
 * @param {Object} msg { image, mask, width, height, wasmPath, modelUrl, version }.
 * @return {Promise<Uint8Array>} Planar RGB result.
 */
export function runMiganWorker( msg ) {
	return new Promise( ( resolve, reject ) => {
		// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
		const worker = new Worker(
			new URL( './migan.worker.js', import.meta.url )
		);
		const timeout = window.setTimeout( () => {
			worker.terminate();
			reject( new Error( 'object removal timed out' ) );
		}, 120000 );
		worker.onmessage = ( event ) => {
			window.clearTimeout( timeout );
			worker.terminate();
			if ( event.data.error ) {
				reject( new Error( event.data.error ) );
			} else {
				resolve( event.data.result );
			}
		};
		worker.onerror = ( err ) => {
			window.clearTimeout( timeout );
			worker.terminate();
			reject( new Error( err.message || 'worker failed' ) );
		};
		worker.postMessage( msg, [ msg.image.buffer, msg.mask.buffer ] );
	} );
}
