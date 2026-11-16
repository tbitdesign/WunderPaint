/**
 * Spawns the BiRefNet worker (subject-model.js). Browser/webpack only: it
 * uses `new Worker( new URL( …, import.meta.url ) )`, which Jest cannot
 * parse, so local-image-ops.js imports it lazily.
 *
 * Unlike the other model workers this one is kept for a minute after a
 * cutout: loading the model takes a few seconds of its own, and cutouts tend
 * to come in a row. After that quiet minute it ends and the memory it holds
 * (well over a gigabyte) goes back to the browser.
 */

const IDLE_MS = 60000;
const RUN_TIMEOUT_MS = 180000;

let worker = null;
let idleTimer = null;
let queue = Promise.resolve();

function drop() {
	window.clearTimeout( idleTimer );
	if ( worker ) {
		worker.terminate();
		worker = null;
	}
}

/**
 * Run one cutout in the worker; calls wait for each other.
 *
 * @param {Object} msg { bitmap, wasmPath, modelUrl, version }.
 * @return {Promise<{alpha: Float32Array, size: number}>} The 512 map.
 */
export function runCutoutWorker( msg ) {
	const run = queue.then(
		() =>
			new Promise( ( resolve, reject ) => {
				window.clearTimeout( idleTimer );
				if ( ! worker ) {
					// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
					worker = new Worker(
						new URL( './birefnet.worker.js', import.meta.url )
					);
				}
				const w = worker;
				const timeout = window.setTimeout( () => {
					drop();
					reject( new Error( 'cutout timed out' ) );
				}, RUN_TIMEOUT_MS );
				w.onmessage = ( event ) => {
					window.clearTimeout( timeout );
					if ( event.data.error ) {
						drop();
						reject( new Error( event.data.error ) );
						return;
					}
					idleTimer = window.setTimeout( drop, IDLE_MS );
					resolve( event.data );
				};
				w.onerror = ( err ) => {
					window.clearTimeout( timeout );
					drop();
					reject( new Error( err.message || 'worker failed' ) );
				};
				w.postMessage( msg, [ msg.bitmap ] );
			} )
	);
	queue = run.catch( () => {} );
	return run;
}
