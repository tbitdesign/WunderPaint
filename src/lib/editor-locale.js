/**
 * The editor language on the client side.
 *
 * Two storage locations, one decision: if there is an own logged-in
 * user, the choice belongs in user meta; otherwise in a cookie. The
 * second case is the demo, where every visitor shares one login and a
 * user meta would hand the choice on to the next visitor.
 *
 * Why a cookie and not local storage: the language is decided on the
 * SERVER. The translation files are loaded through determine_locale, so
 * whatever the server cannot read has no effect on what the editor
 * speaks. Local storage is invisible to it - a choice stored there would
 * move the checkmark in the menu and change nothing else, which looks
 * like a working feature and is not one. A cookie is the one channel
 * both sides see. Server counterpart: Editor_Locale::demo_choice().
 */

import { __ } from '@wordpress/i18n';

import { confirmDialog } from './dialogs';

/** Marker for an intentional reload. */
export const RELOAD_MARK = 'wpie:locale-reload';

/**
 * Cookie holding the choice when there is no own user (the demo).
 *
 * Same name on the server side (Editor_Locale::COOKIE); the two must
 * stay in step or the choice is written where nobody reads it.
 */
const COOKIE = 'wpie_editor_locale';

/** A year, in seconds. */
const COOKIE_LIFETIME = 31536000;

const hasUser = () => !! ( window.WPIE && window.WPIE.hasUser );

/**
 * Is this locale actually on offer?
 *
 * Guards the two values that come from outside (the address and the
 * cookie). An unknown one is ignored rather than mapped onto something
 * else, so a stale link cannot park the menu on a language the install
 * does not ship.
 *
 * @param {string} locale Candidate.
 * @return {boolean} True if the server listed it.
 */
function isOffered( locale ) {
	return (
		!! locale &&
		!! ( ( window.WPIE && window.WPIE.locales ) || {} )[ locale ]
	);
}

/**
 * Read a cookie.
 *
 * @param {string} name Cookie name.
 * @return {string} Value, or '' if unset.
 */
function readCookie( name ) {
	const hit = ( window.document.cookie || '' )
		.split( ';' )
		.map( ( part ) => part.trim() )
		.find( ( part ) => part.startsWith( name + '=' ) );
	return hit ? decodeURIComponent( hit.slice( name.length + 1 ) ) : '';
}

/**
 * Store the demo's choice where the server can see it too.
 *
 * @param {string} locale Locale to remember.
 * @return {void}
 */
function writeCookie( locale ) {
	const secure = 'https:' === window.location.protocol ? '; secure' : '';
	window.document.cookie =
		COOKIE +
		'=' +
		encodeURIComponent( locale ) +
		'; path=/; max-age=' +
		COOKIE_LIFETIME +
		'; samesite=lax' +
		secure;
}

/**
 * The language the editor is currently running in.
 *
 * Without an own user the order is: the address, then the cookie, then
 * whatever the server bootstrapped with. The address comes first because
 * that is how the marketing site hands a language over - the visitor
 * clicking through from the Spanish pricing page must get the Spanish
 * editor even though their cookie may still say English from a visit
 * before.
 */
export function currentLocale() {
	if ( ! hasUser() ) {
		const fromAddress = new URLSearchParams( window.location.search ).get(
			'locale'
		);
		if ( isOffered( fromAddress ) ) {
			return fromAddress;
		}
		const fromCookie = readCookie( COOKIE );
		if ( isOffered( fromCookie ) ) {
			return fromCookie;
		}
	}
	return ( window.WPIE && window.WPIE.locale ) || 'en_US';
}

/** The offered languages, as the server reported them. */
export function availableLocales() {
	const list = ( window.WPIE && window.WPIE.locales ) || {};
	return Object.keys( list ).map( ( locale ) => ( {
		locale,
		label: list[ locale ],
	} ) );
}

/**
 * Latched answer for "did this page load come from a language switch?".
 *
 * null until the first caller asks.
 *
 * @type {boolean|null}
 */
let arrival = null;

/**
 * Was this reload an intentional language change?
 *
 * The first caller reads the marker and clears it; every later caller in
 * the same page load gets the same answer. That matters because more
 * than one place needs to know - the autosave restore in
 * screens/editor-main.jsx and the parked-tabs offer in app.jsx - and
 * React runs child effects before parent effects. Would each caller
 * consume the marker, the first one to run would blind the rest, and
 * which one that is depends on the component tree. Measured: with a
 * consuming read, a language switch on a fresh document asked "restore
 * your parked tabs?" right after the reload, which is exactly the
 * question this whole mechanism exists to avoid.
 *
 * Cleared on the first read, not left standing: if the editor crashes
 * mid change, the marker would otherwise stay behind, and from then on
 * every recovery would happen without a word, even the one after a real
 * crash.
 *
 * @return {boolean} True if this page load came from a language switch.
 */
export function takeIntentionalReload() {
	if ( null === arrival ) {
		arrival = window.sessionStorage.getItem( RELOAD_MARK ) === '1';
		window.sessionStorage.removeItem( RELOAD_MARK );
	}
	return arrival;
}

/** Test hook: forget the latched arrival of this page load. */
export function resetLocaleArrival() {
	arrival = null;
}

/**
 * Is a language switch reloading the page right this moment?
 *
 * Peeks at the same marker without consuming it, because the unload
 * handler runs BEFORE the reload while takeIntentionalReload() runs
 * after it; whoever consumes the marker first would leave the other
 * blind.
 *
 * Needed by the unsaved-changes guard on beforeunload. Without it the
 * browser puts up its own "leave site?" dialog on a switch the user just
 * asked for - measured in a real browser, and it also swallows the
 * switch when declined. That dialog is both a native popup (which this
 * project does not use) and a false alarm: setLocale() has written the
 * autosave snapshot before setting this marker, so nothing is at risk.
 *
 * @return {boolean} True while an intentional reload is under way.
 */
export function isIntentionalReload() {
	return window.sessionStorage.getItem( RELOAD_MARK ) === '1';
}

/**
 * Can this environment keep a snapshot at all?
 *
 * A private window or locked storage may have no IndexedDB. Then a
 * silent reload must not happen, or the unsaved work would be gone
 * without a trace.
 *
 * @return {boolean} True if IndexedDB is present.
 */
export function canSnapshot() {
	return !! window.indexedDB;
}

/**
 * Switch the language and reload.
 *
 * The confirmation gate comes FIRST, before any side effect. Cancelling
 * it must cancel the whole switch, not just the reload - otherwise the
 * new locale would already be saved (REST/local storage) and show up
 * unannounced the next time the editor opens, even though the user just
 * declined. Everything past the gate (save, snapshot, marker, notify,
 * reload) only runs once the switch is actually going to happen, which
 * also means `notify` - the toast that explains the reload - never fires
 * for a switch that got cancelled.
 *
 * The callbacks come in an options object, not as three positional
 * parameters: they are all optional functions of the same shape, so a
 * caller swapping two of them would be invisible to the type system and
 * would show up as a missing snapshot or a missing notice, both silent.
 * createAutosave() in lib/autosave.js takes the same shape for the same
 * reason.
 *
 * @param {string}   locale              Target locale.
 * @param {Object}   [options]           Callbacks.
 * @param {Function} [options.snapshot]  Forces an autosave snapshot.
 * @param {Function} [options.notify]    Called right before the reload
 *                                       actually happens (e.g. a toast).
 *                                       Never called when the switch is
 *                                       cancelled at the gate.
 * @param {Function} [options.reload]    The reload itself; a seam for
 *                                       tests (jsdom's real
 *                                       window.location.reload() throws
 *                                       "not implemented"). Defaults to
 *                                       the real reload.
 * @return {Promise<void>} Nothing.
 */
export async function setLocale( locale, options = {} ) {
	const {
		snapshot,
		notify,
		reload = () => window.location.reload(),
	} = options;
	if ( ! canSnapshot() ) {
		// No safety net for the reload: ask instead of silently losing
		// whatever is unsaved. The editor-styled dialog, never the
		// native window.confirm() popup (see lib/dialogs.js).
		const proceed = await confirmDialog( {
			title: __( 'Editor Language', 'wunderpaint' ),
			message: __(
				'This browser cannot keep a snapshot, so unsaved work would be lost.',
				'wunderpaint'
			),
			confirmLabel: __( 'Switch anyway', 'wunderpaint' ),
			danger: true,
		} );
		if ( ! proceed ) {
			// Cancel means cancel: nothing saved, nothing reloaded.
			return;
		}
	}

	// Snapshot BEFORE storing the choice, not after. Both can fail, and
	// the order decides what a failure leaves behind. Stored first, a
	// failing snapshot leaves the new language persisted while nothing
	// visible happened: the next time the editor opens it speaks the new
	// language, unannounced, exactly the surprise the cancel gate above
	// was built to prevent. Snapshot first, a failure leaves nothing at
	// all - the switch simply did not happen.
	if ( canSnapshot() && snapshot ) {
		await snapshot();
	}

	if ( hasUser() ) {
		await window.wp.apiFetch( {
			path: '/wpie/v1/editor-locale',
			method: 'POST',
			data: { locale },
		} );
	} else {
		writeCookie( locale );
	}

	window.sessionStorage.setItem( RELOAD_MARK, '1' );
	if ( notify ) {
		notify();
	}
	reload();
}

/**
 * Mark every REST request of the editor as such.
 *
 * The filter on determine_locale intentionally only applies to editor
 * requests. A REST request cannot be told apart by its address, because
 * the same routes are also used from elsewhere; hence this header.
 * Without it the server would answer in the WordPress language while the
 * interface speaks the chosen one.
 */
export function markEditorRequests() {
	if ( ! window.wp || ! window.wp.apiFetch ) {
		return;
	}
	window.wp.apiFetch.use( ( options, next ) => {
		options.headers = {
			...( options.headers || {} ),
			'X-WPIE-Locale-Scope': 'editor',
		};
		return next( options );
	} );
}
