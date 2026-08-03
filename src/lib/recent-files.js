/**
 * Recently edited attachments (v0.7), localStorage, per browser.
 */

const KEY = 'wpie-recent';
export const RECENT_FILES_CAP = 10;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

const read = () => {
	try {
		const raw = storage?.getItem( KEY );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list ) ? list : [];
	} catch ( e ) {
		return [];
	}
};

export const listRecentFiles = () => read();

/**
 * Record an opened attachment (moves to front, capped).
 *
 * @param {number} id   Attachment id.
 * @param {string} name Display name.
 * @return {Array} Updated list.
 */
export function pushRecentFile( id, name ) {
	if ( ! id ) {
		return read();
	}
	const list = [
		{
			id,
			name: String( name || `#${ id }` ).slice( 0, 40 ),
			ts: Date.now(),
		},
		...read().filter( ( f ) => f.id !== id ),
	].slice( 0, RECENT_FILES_CAP );
	try {
		storage?.setItem( KEY, JSON.stringify( list ) );
	} catch ( e ) {}
	return list;
}
