/**
 * The editor's browser storage, in one place and per site.
 *
 * Two things every access needs and nobody wants to write thirty times:
 *
 * A try. A blocked site store (a private window, a browser set to refuse
 * site data, an iframe on another origin) throws on the `window.localStorage`
 * getter itself, and the editor used to die in initialState() before it drew
 * anything.
 *
 * A site. Two WordPress installations on one origin (`/shop` and `/blog`)
 * share the origin's storage, so they used to share autosaves, tab records,
 * the theme and every panel state. Every key carries the site's key from
 * the bootstrap (`WPIE.siteKey`, a hash of home_url()); a value still under
 * the old bare key is moved over the first time it is read.
 */

const suffix = () => {
	const key =
		( 'undefined' !== typeof window &&
			window.WPIE &&
			window.WPIE.siteKey ) ||
		'';
	return key ? '@' + String( key ) : '';
};

const facade = ( backing ) => ( {
	getItem( key ) {
		try {
			const store = backing();
			if ( ! store ) {
				return null;
			}
			const ns = key + suffix();
			let value = store.getItem( ns );
			if ( null === value && suffix() ) {
				const legacy = store.getItem( key );
				if ( null !== legacy ) {
					store.setItem( ns, legacy );
					store.removeItem( key );
					value = legacy;
				}
			}
			return value;
		} catch ( e ) {
			return null;
		}
	},
	setItem( key, value ) {
		try {
			backing().setItem( key + suffix(), String( value ) );
			return true;
		} catch ( e ) {
			return false;
		}
	},
	removeItem( key ) {
		try {
			const store = backing();
			store.removeItem( key + suffix() );
			if ( suffix() ) {
				store.removeItem( key );
			}
		} catch ( e ) {}
	},
} );

/** localStorage, per site, never throwing. */
export const siteStorage = facade( () => window.localStorage );

/** sessionStorage (per browser tab), per site, never throwing. */
export const siteSession = facade( () => window.sessionStorage );

/**
 * @param {string} key      Key.
 * @param {*}      fallback What to answer when the store is blocked or empty.
 * @return {*} The stored string, or the fallback.
 */
export function readLocal( key, fallback = null ) {
	const value = siteStorage.getItem( key );
	return null === value ? fallback : value;
}

/**
 * @param {string} key   Key.
 * @param {string} value Value.
 * @return {boolean} Whether it was stored.
 */
export function writeLocal( key, value ) {
	return siteStorage.setItem( key, value );
}

/** The site's own suffix for names outside this facade (the autosave database). */
export const siteSuffix = suffix;
