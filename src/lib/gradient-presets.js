/**
 * User-saved gradients (v1.0; picker panel v1.0.7).
 *
 * The built-in gradient *presets* moved to `src/content/gradients.json`
 * (v1.16) and load lazily via `src/content`, this module now only owns
 * the small, synchronous localStorage layer for gradients the user saves.
 */

const KEY = 'wpie-gradients';
export const GRADIENT_CAP = 12;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook. */
export const __setGradientStorage = ( s ) => {
	storage = s;
};

const read = () => {
	try {
		const raw = storage?.getItem( KEY );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list ) ? list : [];
	} catch ( e ) {
		return [];
	}
};

export const listUserGradients = () => read();

/**
 * Save a gradient (same name replaces).
 *
 * @param {string} name  Name.
 * @param {Array}  stops Stops.
 * @param {string} kind  linear|radial|angle.
 * @return {Array} Updated list.
 */
export function saveUserGradient( name, stops, kind = 'linear' ) {
	const entry = {
		name: String( name || 'Gradient' ).slice( 0, 24 ),
		stops: stops.map( ( s ) => ( { ...s } ) ),
		kind,
	};
	const list = [
		...read().filter( ( item ) => item.name !== entry.name ),
		entry,
	].slice( -GRADIENT_CAP );
	try {
		storage?.setItem( KEY, JSON.stringify( list ) );
	} catch ( e ) {}
	return list;
}

/**
 * @param {string} name Name to delete.
 * @return {Array} Updated list.
 */
export function deleteUserGradient( name ) {
	const list = read().filter( ( item ) => item.name !== name );
	try {
		storage?.setItem( KEY, JSON.stringify( list ) );
	} catch ( e ) {}
	return list;
}
