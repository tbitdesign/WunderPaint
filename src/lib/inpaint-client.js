/**
 * Inpaint a region, off the main thread where a Worker exists, on it
 * otherwise. Either way the caller gets the pixels back and the editor
 * stays responsive while a big photo is worked on.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img Pixels.
 * @param {Uint8Array} mask 1 where to fill.
 * @param {Object} [opts] { smoothPasses, timeoutMs, spawn } - `spawn` is the
 *                        worker runner (tests hand in a failing one).
 * @return {Promise<Uint8ClampedArray>} The filled pixels (a new array from the
 *                                       worker, the same array on the main thread).
 */
export async function inpaintOffThread( img, mask, opts = {} ) {
	const spawn =
		opts.spawn ||
		( 'function' === typeof Worker
			? async ( i, m, o ) =>
					(
						await import( './inpaint-worker-client' )
					).runInpaintWorker( i, m, o )
			: null );
	if ( spawn ) {
		try {
			return await spawn( img, mask, opts );
		} catch ( e ) {
			// A worker that cannot start, dies or times out: the main thread
			// does the work, exactly as before.
		}
	}
	const { inpaintRegion } = await import( './inpaint' );
	inpaintRegion(
		img,
		mask,
		undefined === opts.smoothPasses
			? {}
			: { smoothPasses: opts.smoothPasses }
	);
	return img.data;
}
