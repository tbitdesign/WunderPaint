/**
 * Persistent user colors (v0.3): recently used colors (auto-collected,
 * cap 10) and starred custom swatches (cap 20), stored in localStorage
 * per browser. Storage failures (private mode, quota) degrade silently.
 */

const RECENT_KEY = 'wpie-recent-colors';
const CUSTOM_KEY = 'wpie-custom-swatches';
export const RECENT_CAP = 18;
export const CUSTOM_CAP = 20;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook: swap the backing store (pass a Map-like {getItem,setItem}). */
export const __setStorage = ( s ) => {
	storage = s;
};

const read = ( key ) => {
	try {
		const raw = storage?.getItem( key );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list )
			? list.filter( ( c ) => 'string' === typeof c )
			: [];
	} catch ( e ) {
		return [];
	}
};

const write = ( key, list ) => {
	try {
		storage?.setItem( key, JSON.stringify( list ) );
	} catch ( e ) {
		// Quota/private mode, non-fatal.
	}
};

const normalize = ( color ) =>
	String( color || '' )
		.trim()
		.toLowerCase();

const isColor = ( color ) =>
	/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/.test( color );

/** @return {string[]} Most-recent-first list of used colors. */
export const recentColors = () => read( RECENT_KEY );

/**
 * Record a used color (deduped, most-recent-first, capped).
 *
 * @param {string} color Hex color.
 * @return {string[]} Updated list.
 */
export function pushRecentColor( color ) {
	const c = normalize( color );
	if ( ! isColor( c ) ) {
		return recentColors();
	}
	const list = [ c, ...recentColors().filter( ( x ) => x !== c ) ].slice(
		0,
		RECENT_CAP
	);
	write( RECENT_KEY, list );
	return list;
}

/** @return {string[]} Saved custom swatches (insertion order). */
export const customSwatches = () => read( CUSTOM_KEY );

/**
 * Toggle a color in the custom swatch set (capped).
 *
 * @param {string} color Hex color.
 * @return {string[]} Updated list.
 */
export function toggleCustomSwatch( color ) {
	const c = normalize( color );
	if ( ! isColor( c ) ) {
		return customSwatches();
	}
	const current = customSwatches();
	const list = current.includes( c )
		? current.filter( ( x ) => x !== c )
		: [ ...current, c ].slice( -CUSTOM_CAP );
	write( CUSTOM_KEY, list );
	return list;
}

/**
 * @param {string} color Hex color.
 * @return {boolean} Whether the color is a saved custom swatch.
 */
export const isCustomSwatch = ( color ) =>
	customSwatches().includes( normalize( color ) );
