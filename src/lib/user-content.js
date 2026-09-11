/**
 * User library (v1.34): Elements, Text combinations and Backgrounds the user
 * saves via "Save as Asset". Stored SERVER-SIDE (REST /library/{kind}) so
 * they persist across browsers and devices. This module holds a small
 * in-memory cache + a change notifier so the tray and the dialog stay in sync.
 *
 * Kinds: 'element' | 'combo' | 'background' | 'asset' (v1.74: assets are
 * layer snapshots with a user-defined category).
 */

import { useState, useEffect } from '@wordpress/element';

import { library } from './api';

const KINDS = [ 'element', 'combo', 'background', 'asset' ];

// null = not loaded yet; array = loaded (oldest-first, as stored).
const cache = { element: null, combo: null, background: null, asset: null };
const loading = {};
const listeners = new Set();

function notify() {
	listeners.forEach( ( fn ) => {
		try {
			fn();
		} catch ( e ) {}
	} );
}

/** Subscribe to loads/saves/removals; returns an unsubscribe function. */
export function onUserContentChange( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}

/** Synchronous cached list for a kind (empty until loaded). */
export function getUserItems( kind ) {
	return cache[ kind ] || [];
}

/** Load a kind from the server once (subsequent calls reuse the cache). */
export function ensureUserItems( kind ) {
	if ( ! KINDS.includes( kind ) ) {
		return Promise.resolve( [] );
	}
	if ( cache[ kind ] ) {
		return Promise.resolve( cache[ kind ] );
	}
	if ( ! loading[ kind ] ) {
		loading[ kind ] = library
			.list( kind )
			.then( ( list ) => {
				cache[ kind ] = Array.isArray( list ) ? list : [];
				notify();
				return cache[ kind ];
			} )
			.catch( () => {
				// Not cached: an empty list from a failed load used to stand
				// for the whole session, without a word and without a retry.
				// The next mount asks again.
				return cache[ kind ] || [];
			} )
			.finally( () => {
				loading[ kind ] = null;
			} );
	}
	return loading[ kind ];
}

/**
 * Save a content-io descriptor to the server library. Same id replaces.
 *
 * @param {string} kind       'element' | 'combo' | 'background'.
 * @param {Object} descriptor content-io descriptor.
 * @return {Promise<Object>} The saved item (with its id).
 */
export async function saveUserItem( kind, descriptor ) {
	if ( ! descriptor || ! KINDS.includes( kind ) ) {
		return null;
	}
	const saved = await library.save( kind, descriptor );
	const item = saved && saved.id ? saved : { ...descriptor };
	cache[ kind ] = [
		...( cache[ kind ] || [] ).filter( ( x ) => x.id !== item.id ),
		item,
	];
	notify();
	return item;
}

/**
 * Patch a saved item in place (v1.266): same id, list position kept, so
 * renaming or re-categorising an asset does not bump it to "newest".
 *
 * @param {string} kind  Kind.
 * @param {string} id    Item id.
 * @param {Object} patch Fields to change (e.g. { label, category }).
 * @return {Promise<Object|null>} The updated item, or null when unknown.
 */
export async function updateUserItem( kind, id, patch ) {
	const current = ( cache[ kind ] || [] ).find( ( x ) => x.id === id );
	if ( ! current || ! KINDS.includes( kind ) ) {
		return null;
	}
	const before = cache[ kind ];
	const item = { ...current, ...patch, id };
	cache[ kind ] = cache[ kind ].map( ( x ) => ( x.id === id ? item : x ) );
	notify();
	try {
		await library.save( kind, item );
	} catch ( e ) {
		// Optimistic, but honest: a refused save puts the old item back and
		// says so, instead of showing a rename the server never got.
		cache[ kind ] = before;
		notify();
		report( e );
		return current;
	}
	return item;
}

let onError = null;

/**
 * Where a refused library write is reported (screens/editor-main.jsx hands
 * the toasts in). Without a handler it goes to the console.
 *
 * @param {Function|null} fn ( err ) => void.
 */
export function onUserContentError( fn ) {
	onError = 'function' === typeof fn ? fn : null;
}

const report = ( err ) => {
	if ( onError ) {
		onError( err );
	} else {
		// eslint-disable-next-line no-console
		console.warn( 'WPIE: library write refused', err );
	}
};

/**
 * Remove an item from the server library (optimistic).
 *
 * @param {string} kind Kind.
 * @param {string} id   Item id.
 * @return {Promise<void>}
 */
export async function removeUserItem( kind, id ) {
	if ( ! KINDS.includes( kind ) ) {
		return;
	}
	const before = cache[ kind ] || [];
	cache[ kind ] = before.filter( ( x ) => x.id !== id );
	notify();
	try {
		await library.remove( kind, id );
	} catch ( e ) {
		// The item comes back on screen: it is still on the server.
		cache[ kind ] = before;
		notify();
		report( e );
	}
}

/**
 * React hook: newest-first list of the user's saved items of a kind. Loads
 * from the server on first use and re-renders on any change.
 *
 * @param {string} kind Kind.
 * @return {Array} Saved items, newest first.
 */
export function useUserItems( kind ) {
	const [ , setTick ] = useState( 0 );
	useEffect( () => {
		ensureUserItems( kind );
		return onUserContentChange( () => setTick( ( t ) => t + 1 ) );
	}, [ kind ] );
	return getUserItems( kind ).slice().reverse();
}

/* ----------------------------- categories ------------------------------ */

let categoriesCache = null;

/** Load the user's asset categories once (cached). */
export function ensureCategories() {
	if ( categoriesCache ) {
		return Promise.resolve( categoriesCache );
	}
	return library
		.categories()
		.then( ( list ) => {
			categoriesCache = Array.isArray( list ) ? list : [];
			notify();
			return categoriesCache;
		} )
		.catch( () => categoriesCache || [] );
}

/** Synchronous cached category list (empty until loaded). */
export function getCategories() {
	return categoriesCache || [];
}

/** add/rename/delete a category on the server and refresh the cache. */
export async function mutateCategory( action, name, to = '' ) {
	const res = await library.categoryAction( action, name, to );
	categoriesCache = Array.isArray( res?.categories )
		? res.categories
		: categoriesCache;
	// Renames/deletes touch the items' category fields server-side.
	if ( 'add' !== action ) {
		cache.asset = null;
	}
	notify();
	return categoriesCache;
}

/** Hook: the category list, live. */
export function useCategories() {
	const [ , force ] = useState( 0 );
	useEffect( () => {
		ensureCategories();
		return onUserContentChange( () => force( ( n ) => n + 1 ) );
	}, [] );
	return getCategories();
}
