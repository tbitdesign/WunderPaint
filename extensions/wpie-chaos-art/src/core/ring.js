/**
 * The snapshot ring: because nothing here can be repeated, the moments
 * keep themselves. A fixed-size ring of the last ~two minutes; the
 * moment picker reads it oldest-first after Stop.
 */

export function makeRing( cap = 48, onDrop = null ) {
	const items = [];
	// A moment that leaves the ring lets go of what it holds (a blob link).
	const drop = ( item ) => {
		if ( onDrop ) {
			try {
				onDrop( item );
			} catch ( e ) {}
		}
	};
	return {
		cap,
		push( item ) {
			items.push( item );
			while ( items.length > cap ) {
				drop( items.shift() );
			}
		},
		list() {
			return items.slice();
		},
		size() {
			return items.length;
		},
		clear() {
			items.forEach( drop );
			items.length = 0;
		},
	};
}

/**
 * A moment as the editor keeps pictures: a full-resolution data URL. The
 * sheet's moments are kept as picture files (blobs) so the ring can hold
 * two minutes at full size; one becomes data only when it is chosen.
 *
 * @param {Object} item A ring entry { url, thumb?, blob?, w, h } or a still.
 * @return {Promise<Object>} The same entry with `url` as a data URL.
 */
export function stillOf( item ) {
	if ( ! item || ! item.blob ) {
		return Promise.resolve( item );
	}
	return new Promise( ( resolve, reject ) => {
		const reader = new FileReader();
		reader.onload = () =>
			resolve( { ...item, url: reader.result, blob: null } );
		reader.onerror = () =>
			reject( reader.error || new Error( 'moment unreadable' ) );
		reader.readAsDataURL( item.blob );
	} );
}
