/**
 * Embedded "edit in place" bridge (v1.180.0).
 *
 * When a page builder opens the editor inside an iframe (Elementor first, but
 * this is deliberately builder-AGNOSTIC), it appends `&wpie_embed=1` and an
 * opaque token. The editor then talks to the host window over postMessage:
 *
 *   editor -> host   ready      once the app has mounted
 *   editor -> host   applied    after a save/save-as, with the resulting image
 *   editor -> host   cancelled  when the session ends without applying
 *
 * The host and the editor are the SAME wp-admin origin (a same-site iframe),
 * so the exact `window.location.origin` is used as the postMessage target and
 * never '*'. The token is not a security boundary (the same-origin check is);
 * it only lets the host match a reply to the request it opened.
 *
 * Only the send side lives here so the whole editor stays builder-neutral; the
 * host-side script (per builder) writes the result back into its own control.
 */

export const WPIE_EMBED_SOURCE = 'wpie';

// Message types the editor emits. Kept as constants so the host script and the
// tests share one vocabulary.
export const EMBED_MSG = {
	READY: 'ready',
	APPLIED: 'applied',
	CANCELLED: 'cancelled',
};

// Set once we have emitted `applied`, so a later unload does not also fire a
// spurious `cancelled` on top of a successful hand-off.
let applied = false;

const ctx = () =>
	( 'undefined' !== typeof window && window.WPIE && window.WPIE.embed ) ||
	null;

/**
 * Whether the editor is running inside a host iframe that expects a result.
 *
 * @return {boolean} True when embedded and framed.
 */
export function isEmbedded() {
	return (
		!! ctx() &&
		'undefined' !== typeof window &&
		!! window.parent &&
		window.parent !== window
	);
}

/**
 * The opaque token the host passed, echoed back in every message.
 *
 * @return {string} Token, or '' when absent.
 */
export function embedToken() {
	return ctx()?.token || '';
}

// Display names for the "Apply to <host>" action, so the label names the actual
// builder (Elementor, …) while the mode itself stays builder-agnostic.
const HOST_LABELS = { elementor: 'Elementor', gutenberg: 'Gutenberg' };

/**
 * Human name of the embedding host for UI labels, or '' when unknown.
 *
 * @return {string} Host label.
 */
export function embedHostLabel() {
	return HOST_LABELS[ ctx()?.host || '' ] || '';
}

/**
 * Whether the embedding host is the media LIBRARY grid (v1.236): the user
 * manages the attachment itself there, so the editor offers the normal
 * overwrite save instead of the copy-based Apply that element-bound hosts
 * (builders, insert flows) get.
 *
 * @return {boolean} True for the library-management overlay.
 */
export function isLibraryEmbed() {
	return isEmbedded() && 'media-library' === ( ctx()?.host || '' );
}

/**
 * Exact same-site origin to post to (never '*').
 *
 * @return {string} Origin.
 */
export function targetOrigin() {
	return ( 'undefined' !== typeof window && window.location?.origin ) || '/';
}

/**
 * Shape a message with the shared envelope (source + token).
 *
 * @param {string} type    One of EMBED_MSG.
 * @param {Object} payload Extra fields.
 * @return {Object} Message object.
 */
export function buildMessage( type, payload = {} ) {
	return { source: WPIE_EMBED_SOURCE, type, token: embedToken(), ...payload };
}

/**
 * Normalize a save/save-as response into the `applied` payload. Pure so it is
 * unit-tested directly; accepts either {id} (REST) or {attachmentId}.
 *
 * @param {Object} result Save result / overrides.
 * @return {{attachmentId:number,url:string,width:number,height:number,alt:string}} Payload.
 */
export function normalizeApplied( result = {} ) {
	return {
		attachmentId: Number( result.attachmentId || result.id || 0 ) || 0,
		url: String( result.url || '' ),
		width: Number( result.width || 0 ) || 0,
		height: Number( result.height || 0 ) || 0,
		alt: String( result.alt || '' ),
	};
}

function post( type, payload ) {
	if ( ! isEmbedded() ) {
		return false;
	}
	window.parent.postMessage( buildMessage( type, payload ), targetOrigin() );
	return true;
}

/** Announce that the app has mounted and is ready to be used. */
export const postReady = () => post( EMBED_MSG.READY, {} );

/**
 * Hand the resulting image back to the host and remember we applied.
 *
 * @param {Object} result Save result (id/attachmentId, url, width, height, alt).
 * @return {boolean} Whether a message was sent.
 */
export function postApplied( result ) {
	const sent = post( EMBED_MSG.APPLIED, normalizeApplied( result ) );
	if ( sent ) {
		applied = true;
	}
	return sent;
}

/**
 * Has this embedded session already handed a result back?
 *
 * The unsaved-changes guard asks: once Apply has gone through, the work IS
 * saved, and the document staying "dirty" is an artefact of the editor, not a
 * risk to the visitor. Warning there produced a native browser dialog on the
 * way out of a flow the user had just completed.
 *
 * @return {boolean} Whether postApplied() succeeded at least once.
 */
export const hasApplied = () => applied;

/** Tell the host the session ended without applying (unless we already did). */
export function postCancelled() {
	if ( applied ) {
		return false;
	}
	return post( EMBED_MSG.CANCELLED, {} );
}
