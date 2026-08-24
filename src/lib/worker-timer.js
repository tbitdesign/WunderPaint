/**
 * A sleep() that keeps ticking in background tabs (P07).
 *
 * Browsers throttle main-thread timers once a tab loses focus - after a
 * few minutes to roughly one tick per minute. A long batch (Featured
 * Images, article generation) that polls with setTimeout then crawls,
 * and nobody understands why. Dedicated workers are throttled far less,
 * so the waiting happens in a tiny inline worker and the main thread
 * only hears the result.
 *
 * Everything degrades silently: no Worker, a CSP that blocks blob
 * workers, or a worker error at any point all fall back to plain
 * setTimeout - the pre-P07 behaviour.
 */

/** The whole worker: receive {id, ms}, answer id after ms. */
const WORKER_SOURCE =
	'onmessage=function(e){var d=e.data;setTimeout(function(){postMessage(d.id)},d.ms)}';

let worker = null;
let broken = false;
let seq = 0;
const pending = new Map();

function ensureWorker() {
	if ( worker || broken ) {
		return worker;
	}
	if (
		'undefined' === typeof window ||
		! window.Worker ||
		! window.Blob ||
		! window.URL?.createObjectURL
	) {
		broken = true;
		return null;
	}
	try {
		const url = URL.createObjectURL(
			new Blob( [ WORKER_SOURCE ], { type: 'text/javascript' } )
		);
		worker = new Worker( url );
		URL.revokeObjectURL( url );
		worker.onmessage = ( e ) => {
			const resolve = pending.get( e.data );
			if ( resolve ) {
				pending.delete( e.data );
				resolve();
			}
		};
		worker.onerror = () => {
			// Resolve everything in flight so no caller hangs, then fall
			// back to setTimeout for good.
			const waiting = [ ...pending.values() ];
			pending.clear();
			try {
				worker.terminate();
			} catch ( e ) {
				// Already gone.
			}
			worker = null;
			broken = true;
			waiting.forEach( ( resolve ) => resolve() );
		};
	} catch ( e ) {
		worker = null;
		broken = true;
	}
	return worker;
}

/**
 * Wait, background-tab-proof.
 *
 * @param {number} ms Milliseconds.
 * @return {Promise<void>} Resolves after ms.
 */
export const sleep = ( ms ) =>
	new Promise( ( resolve ) => {
		const w = ensureWorker();
		if ( ! w ) {
			setTimeout( resolve, ms );
			return;
		}
		const id = ++seq;
		pending.set( id, resolve );
		try {
			w.postMessage( { id, ms } );
		} catch ( e ) {
			pending.delete( id );
			setTimeout( resolve, ms );
		}
	} );

/** Test seam: forget the worker and the broken flag. */
export const __resetWorkerTimer = () => {
	try {
		worker?.terminate();
	} catch ( e ) {
		// Already gone.
	}
	worker = null;
	broken = false;
	pending.clear();
};
