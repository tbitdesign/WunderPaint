/**
 * Spawns the inpaint worker. Its own module because `import.meta.url` is
 * browser/webpack-only; inpaint-client.js imports it lazily and only where
 * a Worker exists.
 */

export function runInpaintWorker( img, mask, opts = {} ) {
	return new Promise( ( resolve, reject ) => {
		// MUST be exactly `new Worker( new URL( … ) )`, see psd-worker-client.
		const worker = new Worker(
			new URL( './inpaint.worker.js', import.meta.url )
		);
		// Copies: the buffers are transferred away, and the main-thread
		// fallback needs the originals untouched.
		const data = img.data.slice().buffer;
		const m = mask.slice().buffer;
		const timer = setTimeout( () => {
			worker.terminate();
			reject( new Error( 'inpaint worker timed out' ) );
		}, opts.timeoutMs || 120000 );
		worker.onmessage = ( event ) => {
			clearTimeout( timer );
			worker.terminate();
			if ( event.data.error ) {
				reject( new Error( event.data.error ) );
			} else {
				resolve( new Uint8ClampedArray( event.data.data ) );
			}
		};
		worker.onerror = ( err ) => {
			clearTimeout( timer );
			worker.terminate();
			reject( new Error( err.message || 'inpaint worker failed' ) );
		};
		worker.postMessage(
			{
				data,
				width: img.width,
				height: img.height,
				mask: m,
				smoothPasses: opts.smoothPasses,
			},
			[ data, m ]
		);
	} );
}
