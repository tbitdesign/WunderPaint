/** Short-lived thumbnail caches, collected with their source renderer. */
const caches = new WeakMap();
const MAX_ENTRIES = 160;
const MAX_BYTES = 8 * 1024 * 1024;

// Catalogs rebuild some descriptor wrappers on every React render. Their
// rendering inputs, not those wrappers, determine whether an image is current.
export function samePreviewValues( a, b ) {
	if ( a === b ) {
		return true;
	}
	if ( ! a || ! b ) {
		return false;
	}
	const keys = Object.keys( a );
	return (
		keys.length === Object.keys( b ).length &&
		keys.every(
			( key ) =>
				Object.hasOwn( b, key ) && Object.is( a[ key ], b[ key ] )
		)
	);
}
function cacheFor( renderer ) {
	let cache = caches.get( renderer );
	if ( ! cache ) {
		cache = { entries: new Map(), bytes: 0 };
		caches.set( renderer, cache );
	}
	return cache;
}
function forget( cache, id ) {
	const entry = cache.entries.get( id );
	if ( entry ) {
		cache.bytes -= entry.bytes;
		cache.entries.delete( id );
	}
}
function find( cache, item ) {
	const entry = cache.entries.get( item.id );
	if ( entry && samePreviewValues( entry.item, item ) ) {
		cache.entries.delete( item.id );
		cache.entries.set( item.id, entry );
		return entry;
	}
	return null;
}
export function cachedCatalogPreview( renderer, item ) {
	const entry = find( cacheFor( renderer ), item );
	return entry?.ready ? entry : null;
}
export function renderCatalogPreview( renderer, item ) {
	const cache = cacheFor( renderer ),
		cached = find( cache, item );
	if ( cached ) {
		return cached.promise;
	}
	forget( cache, item.id );
	const entry = { item, ready: false, bytes: 0, url: null, promise: null };
	cache.entries.set( item.id, entry );
	entry.promise = Promise.resolve()
		.then( () => renderer( item ) )
		.then(
			( url ) => {
				entry.url = url;
				entry.ready = true;
				// A replacement recipe may already occupy this id while an older render finishes.
				if ( cache.entries.get( item.id ) === entry ) {
					entry.bytes = ( url?.length || 0 ) * 2;
					cache.bytes += entry.bytes;
					while (
						cache.entries.size > MAX_ENTRIES ||
						cache.bytes > MAX_BYTES
					) {
						forget( cache, cache.entries.keys().next().value );
					}
				}
				return url;
			},
			( error ) => {
				if ( cache.entries.get( item.id ) === entry ) {
					forget( cache, item.id );
				}
				throw error;
			}
		);
	return entry.promise;
}
