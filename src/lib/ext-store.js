/**
 * Extension key-value store client (v1.273.0 / API 2.10): per-user,
 * per-extension JSON objects behind /ext-store/{ns} - the server-backed
 * replacement for the localStorage favorites eight extensions kept.
 * Bridged as `storage.get` / `storage.set`.
 */

import { request } from './api';

const NS_RE = /^[a-z0-9][a-z0-9-]{2,63}$/;

const assertNs = ( ns ) => {
	if ( ! NS_RE.test( String( ns || '' ) ) ) {
		throw new Error(
			'WPIE storage: namespace must match [a-z0-9-]{3,64}, got "' +
				ns +
				'"'
		);
	}
};

// Demo installs keep the KV store in the visitor's browser instead of
// the (read-only) server: favorites and studio prefs still work, per
// visitor, and background writes cannot fail (v1.307).
const demoKey = ( ns ) => `wpie-demo-store:${ ns }`;

/**
 * Read the stored object for a namespace ({} when nothing stored).
 *
 * @param {string} ns Extension namespace (use the extension slug).
 * @return {Promise<Object>} Stored value.
 */
export async function storeGet( ns ) {
	assertNs( ns );
	if ( window.WPIE?.demo ) {
		try {
			const raw = window.localStorage.getItem( demoKey( ns ) );
			const val = raw ? JSON.parse( raw ) : null;
			return val && 'object' === typeof val ? val : {};
		} catch ( e ) {
			return {};
		}
	}
	const res = await request( { path: `/ext-store/${ ns }` } );
	return res?.value && 'object' === typeof res.value ? res.value : {};
}

/**
 * Replace the stored object for a namespace.
 *
 * @param {string} ns    Extension namespace.
 * @param {Object} value JSON-serializable object (<= 32 KB).
 * @return {Promise<Object>} The stored (sanitized) value.
 */
export async function storeSet( ns, value ) {
	assertNs( ns );
	if ( window.WPIE?.demo ) {
		try {
			window.localStorage.setItem(
				demoKey( ns ),
				JSON.stringify( value || {} )
			);
		} catch ( e ) {
			// Quota or private mode: the demo pref is simply not remembered.
		}
		return value && 'object' === typeof value ? value : {};
	}
	const res = await request( {
		path: `/ext-store/${ ns }`,
		method: 'POST',
		data: { value },
	} );
	return res?.value && 'object' === typeof res.value ? res.value : {};
}
