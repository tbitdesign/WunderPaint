/**
 * The loop behind Batch Watermark, on its own so it can be stopped and
 * tested. Every step is handed in - render one item to a blob, save the
 * blob - so the dialog owns the canvas work and the upload, and this owns
 * only the order, the counting and the stop.
 *
 * `cancelled()` is asked before every item. A stop lands after the item in
 * flight: an upload is never cut in half, so there is no half-written
 * attachment to clean up.
 *
 * @param {Object}   o            Options.
 * @param {Array}    o.items      Media items ({ id, url, fullUrl?, title? }).
 * @param {Function} o.render     async ( item ) => Blob.
 * @param {Function} o.save       async ( item, blob ) => any.
 * @param {Function} [o.cancelled] () => boolean, asked before each item.
 * @param {Function} [o.onProgress] ( { done, total } ) after each item.
 * @return {Promise<{done:number,failed:number,stopped:boolean}>} Counts.
 */
export async function watermarkBatch( {
	items,
	render,
	save,
	cancelled = () => false,
	onProgress = () => {},
} ) {
	let done = 0;
	let failed = 0;
	let stopped = false;
	for ( const item of items ) {
		if ( cancelled() ) {
			stopped = true;
			break;
		}
		try {
			const blob = await render( item );
			await save( item, blob );
			done++;
		} catch ( err ) {
			failed++;
		}
		onProgress( { done: done + failed, total: items.length } );
	}
	return { done, failed, stopped };
}
