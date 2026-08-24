/**
 * Canvas encoding off the main thread (P07).
 *
 * canvas.toBlob encodes on the main thread; a full-size PNG of a big
 * composite blocks the UI for seconds on weak hardware, and a background
 * tab may throttle it further. Where the browser offers OffscreenCanvas
 * and ImageBitmap transfer, the pixels move to a small dedicated worker
 * and come back as a Blob; everywhere else (and on any error, including
 * a codec the worker cannot produce) the old main-thread path runs
 * unchanged.
 *
 * The contract mirrors canvas.toBlob deliberately: the caller gets
 * whatever the browser can produce - a Safari that answers a WebP
 * request with a PNG-typed blob keeps doing so via the fallback, so
 * callers that check blob.type keep working.
 */

/** The whole worker: draw the bitmap, convert, answer. */
const WORKER_SOURCE = `onmessage = async ( e ) => {
	const { id, bitmap, type, quality } = e.data;
	try {
		const canvas = new OffscreenCanvas( bitmap.width, bitmap.height );
		canvas.getContext( '2d' ).drawImage( bitmap, 0, 0 );
		bitmap.close && bitmap.close();
		const blob = await canvas.convertToBlob( { type, quality } );
		postMessage( { id, blob } );
	} catch ( err ) {
		postMessage( { id, error: String( ( err && err.message ) || err ) } );
	}
};`;

let worker = null;
let broken = false;
let seq = 0;
const pending = new Map();

const supported = () =>
	'undefined' !== typeof window &&
	!! window.Worker &&
	!! window.OffscreenCanvas &&
	'function' === typeof window.createImageBitmap &&
	!! window.Blob &&
	!! window.URL?.createObjectURL;

function ensureWorker() {
	if ( worker || broken ) {
		return worker;
	}
	if ( ! supported() ) {
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
			const entry = pending.get( e.data.id );
			if ( entry ) {
				pending.delete( e.data.id );
				entry( e.data );
			}
		};
		worker.onerror = () => {
			const waiting = [ ...pending.values() ];
			pending.clear();
			try {
				worker.terminate();
			} catch ( e ) {
				// Already gone.
			}
			worker = null;
			broken = true;
			waiting.forEach( ( entry ) => entry( { error: 'worker died' } ) );
		};
	} catch ( e ) {
		worker = null;
		broken = true;
	}
	return worker;
}

/**
 * Encode a canvas to a Blob, in a worker where possible.
 *
 * @param {HTMLCanvasElement} canvas  Rendered canvas.
 * @param {string}            mime    Target MIME type.
 * @param {number}            quality 0..1 encoder quality.
 * @return {Promise<Blob|null>} Encoded blob, or null when even the
 *                              main-thread encoder produced nothing.
 */
export async function encodeCanvasBlob( canvas, mime, quality ) {
	const native = () =>
		new Promise( ( resolve ) =>
			canvas.toBlob( ( blob ) => resolve( blob ), mime, quality )
		);
	const w = ensureWorker();
	if ( ! w ) {
		return native();
	}
	try {
		const bitmap = await createImageBitmap( canvas );
		const answer = await new Promise( ( resolve ) => {
			const id = ++seq;
			pending.set( id, resolve );
			try {
				w.postMessage( { id, bitmap, type: mime, quality }, [
					bitmap,
				] );
			} catch ( e ) {
				pending.delete( id );
				resolve( { error: String( e?.message || e ) } );
			}
		} );
		// A worker that cannot produce this codec (convertToBlob throws
		// for unsupported types) hands over to the main thread, which
		// keeps canvas.toBlob's lenient give-what-you-can semantics.
		if ( answer.blob && answer.blob.type === mime ) {
			return answer.blob;
		}
		return native();
	} catch ( e ) {
		return native();
	}
}

/** Test seam: forget the worker and the broken flag. */
export const __resetEncodeWorker = () => {
	try {
		worker?.terminate();
	} catch ( e ) {
		// Already gone.
	}
	worker = null;
	broken = false;
	pending.clear();
};
