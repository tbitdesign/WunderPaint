/**
 * User pattern tiles (v1.1, server-backed since v1.110.0): small tile
 * images embedded into layers as `patternData`, so documents stay
 * self-contained. The tiles themselves live in the server user library
 * (option wpie_user_library, kind "pattern"), which makes them
 * per-site instead of per-browser and puts them into every backup.
 * Legacy localStorage tiles migrate to the server on first load.
 */

import { library } from './api';

const LEGACY_KEY = 'wpie-patterns';
const MIGRATED_KEY = 'wpie-patterns-migrated';
export const PATTERN_CAP = 24;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook. */
export const __setPatternStorage = ( s ) => {
	storage = s;
	cache = null;
	loading = null;
};

const readLegacy = () => {
	try {
		const raw = storage?.getItem( LEGACY_KEY );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list )
			? list.filter( ( p ) => p && p.name && p.dataUrl )
			: [];
	} catch ( e ) {
		return [];
	}
};

let cache = null; // [{id, name, dataUrl}] once loaded
let loading = null;
const listeners = new Set();
const notify = () => listeners.forEach( ( fn ) => fn() );

/** Subscribe to pattern-list changes; returns the unsubscribe. */
export function onPatternsChange( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}

/**
 * Synchronous list for render paths: the server cache once loaded,
 * legacy localStorage tiles before that.
 *
 * @return {Array} [{id?, name, dataUrl}].
 */
export const listPatterns = () => cache || readLegacy();

/**
 * Load the server tiles once (and migrate legacy localStorage tiles).
 *
 * @return {Promise<Array>} Patterns.
 */
export function ensurePatterns() {
	if ( cache ) {
		return Promise.resolve( cache );
	}
	if ( ! loading ) {
		loading = library
			.list( 'pattern' )
			.then( async ( items ) => {
				cache = ( items || [] ).filter( ( p ) => p?.dataUrl );
				// One-time migration of per-browser tiles to the server.
				const legacy = readLegacy();
				if ( legacy.length && ! storage?.getItem( MIGRATED_KEY ) ) {
					for ( const p of legacy ) {
						if ( cache.some( ( x ) => x.name === p.name ) ) {
							continue;
						}
						try {
							const saved = await library.save( 'pattern', {
								name: p.name,
								dataUrl: p.dataUrl,
							} );
							cache.push( saved );
						} catch ( e ) {
							// Server unreachable: retry next session.
							return cache;
						}
					}
					try {
						storage?.setItem( MIGRATED_KEY, '1' );
					} catch ( e ) {}
				}
				notify();
				return cache;
			} )
			.catch( () => listPatterns() );
	}
	return loading;
}

/**
 * Save a tile (same name replaces).
 *
 * @param {string} name    Name.
 * @param {string} dataUrl Tile data URL (≤512px recommended).
 * @return {Promise<Array>} Updated list.
 */
export async function savePattern( name, dataUrl ) {
	const clean = String( name || 'Pattern' ).slice( 0, 24 );
	await ensurePatterns();
	const existing = ( cache || [] ).find( ( p ) => p.name === clean );
	const saved = await library.save( 'pattern', {
		...( existing?.id ? { id: existing.id } : {} ),
		name: clean,
		dataUrl,
	} );
	cache = [
		...( cache || [] ).filter( ( p ) => p.name !== clean ),
		saved,
	].slice( -PATTERN_CAP );
	notify();
	return cache;
}

/**
 * Delete a tile by name.
 *
 * @param {string} name Pattern to delete.
 * @return {Promise<Array>} Updated list.
 */
export async function deletePattern( name ) {
	await ensurePatterns();
	const entry = ( cache || [] ).find( ( p ) => p.name === name );
	if ( entry?.id ) {
		await library.remove( 'pattern', entry.id );
	}
	cache = ( cache || [] ).filter( ( p ) => p.name !== name );
	notify();
	return cache;
}
