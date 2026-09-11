/**
 * Session-restore coordinator (v1.130.1). Two independent systems find
 * leftovers of the previous visit - the current document's autosave and
 * the parked document tabs - and each used to raise its own toast, so a
 * reload greeted the user with TWO restore prompts. Offers are collected
 * for a short window and shown as ONE toast whose link restores
 * everything at once.
 */

import { __, sprintf } from '@wordpress/i18n';

const WINDOW_MS = 600;

let pending = [];
let timer = null;
// Kinds already shown this page load. A late offer of a NEW kind gets its
// own toast; one of a kind already shown is a re-mounted effect and is
// ignored. (It used to be one boolean: after the first toast every later
// offer was dropped whole, and a tabs record that arrived a moment after
// the autosave's toast was never offered at all.)
const shownKinds = new Set();

const messageFor = ( offers ) => {
	const tabs = offers.find( ( o ) => 'tabs' === o.kind );
	const autosave = offers.find( ( o ) => 'autosave' === o.kind );
	if ( autosave && tabs ) {
		return {
			text: sprintf(
				/* translators: %d: number of documents. */
				__(
					'Your last session left unsaved changes and %d more open document(s).',
					'wunderpaint'
				),
				tabs.count
			),
			link: __( 'Restore session', 'wunderpaint' ),
		};
	}
	if ( tabs ) {
		return {
			text: sprintf(
				/* translators: %d: number of documents. */
				__(
					'Your last session had %d more open document(s).',
					'wunderpaint'
				),
				tabs.count
			),
			link: __( 'Restore tabs', 'wunderpaint' ),
		};
	}
	return {
		text: __(
			'An unsaved session from a previous visit was found.',
			'wunderpaint'
		),
		link: __( 'Restore', 'wunderpaint' ),
	};
};

const flush = ( toasts ) => {
	timer = null;
	if ( ! pending.length ) {
		return;
	}
	const offers = pending;
	pending = [];
	offers.forEach( ( o ) => shownKinds.add( o.kind ) );
	const { text, link } = messageFor( offers );
	// Restore exactly once, however often the link handler fires.
	let restored = false;
	toasts.toast( text, {
		duration: 15000,
		linkText: link,
		onLink: () => {
			if ( restored ) {
				return;
			}
			restored = true;
			offers.forEach( ( o ) => o.restore() );
		},
	} );
};

/**
 * Register a restore offer; offers arriving within the collection window
 * merge into one toast. One toast per page load, one offer per kind -
 * a re-mounted effect registering the same offer again must not restore
 * the same tabs twice (v1.130.2).
 *
 * @param {Object}   offer         { kind: 'autosave'|'tabs', count?, restore }.
 * @param {Object}   toasts        Toast API.
 */
export function offerRestore( offer, toasts ) {
	if (
		shownKinds.has( offer.kind ) ||
		pending.some( ( o ) => o.kind === offer.kind )
	) {
		return;
	}
	pending.push( offer );
	if ( timer ) {
		clearTimeout( timer );
	}
	if ( shownKinds.size ) {
		// The merge window is over; this one stands on its own.
		flush( toasts );
		return;
	}
	timer = setTimeout( () => flush( toasts ), WINDOW_MS );
}

/** Test hook: reset the per-page-load state. */
export function resetRestoreOffers() {
	pending = [];
	shownKinds.clear();
	if ( timer ) {
		clearTimeout( timer );
		timer = null;
	}
}
