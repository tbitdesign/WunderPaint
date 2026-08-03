/**
 * Alt-text assistant core (v1.0): scan the library for images without alt
 * text, then caption + update each one. All I/O is injected so the loop is
 * unit-testable and the dialog stays thin.
 */

/**
 * Collect images missing alt text, paginating until `limit` images were
 * inspected (or the library ends).
 *
 * @param {Object}   deps       Dependencies.
 * @param {Function} deps.list  (page) → { items: [{id, alt, …}], hasMore }.
 * @param {number}   deps.limit Max images to inspect (default 200).
 * @return {Promise<Array>} Items with empty alt.
 */
export async function scanMissingAlt( { list, limit = 200 } ) {
	const missing = [];
	let inspected = 0;
	let page = 1;
	for (;;) {
		const { items, hasMore } = await list( page );
		inspected += items.length;
		missing.push( ...items.filter( ( item ) => ! item.alt ) );
		if ( ! hasMore || inspected >= limit || ! items.length ) {
			break;
		}
		page++;
	}
	return missing;
}

/**
 * Caption + update every item; errors skip the item and the loop goes on.
 *
 * @param {Array}    items             Items from scanMissingAlt.
 * @param {Object}   deps              Dependencies.
 * @param {Function} deps.load         (item) → image payload for caption.
 * @param {Function} deps.caption      (image) → alt string.
 * @param {Function} deps.update       (id, alt) → Promise.
 * @param {Function} [deps.onProgress] (item, status, detail) per step.
 * @param {Function} [deps.isCancelled] () → boolean, checked per item.
 * @return {Promise<{done: number, failed: number, cancelled: boolean}>} Summary.
 */
export async function runAltTextBatch(
	items,
	{ load, caption, update, onProgress, isCancelled }
) {
	let done = 0;
	let failed = 0;
	let cancelled = false;
	for ( const item of items ) {
		if ( isCancelled?.() ) {
			cancelled = true;
			break;
		}
		onProgress?.( item, 'working' );
		try {
			const image = await load( item );
			const alt = await caption( image );
			if ( ! alt ) {
				throw new Error( 'Empty caption' );
			}
			await update( item.id, alt );
			done++;
			onProgress?.( item, 'done', alt );
		} catch ( err ) {
			failed++;
			onProgress?.( item, 'error', err.message );
		}
	}
	return { done, failed, cancelled };
}
