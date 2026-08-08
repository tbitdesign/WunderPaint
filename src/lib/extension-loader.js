/**
 * Extension package client (v1.119): REST calls for the in-editor
 * extensions library, live script injection after an install (no reload
 * needed) and a window-level error watcher that attributes load/runtime
 * errors of installed packages so the manager can show them instead of
 * letting them die silently in the console.
 */

import { request } from './api';
import { apiSatisfies, recordExtensionIssue } from './extensions';

export const listExtensions = () => request( { path: '/extensions' } );

/*
 * There is no installExtension() and no deleteExtension() here any more.
 * The free plugin has no route that receives an extension package and none
 * that removes one (wordpress.org review, 2026-08-08 - see
 * includes/class-extensions.php). Pro brings both, and its own client for
 * them.
 */

export const toggleExtension = ( slug, enabled ) =>
	request( {
		path: `/extensions/${ slug }`,
		method: 'POST',
		data: { enabled },
	} );

/*
 * Extensions live in one of two directories now: bundled-extensions/ inside
 * the plugin (what the free version ships) and uploads/wpie-extensions/
 * (what Pro installs). Both names have to be recognised here, or a bundled
 * studio's errors would go unattributed and injectExtension() would think a
 * loaded package is not loaded. (2026-08-08)
 */
const EXT_DIR = /\/(?:wpie|bundled)-extensions\/([a-z0-9_-]+)\//;

/** Slug of an installed package from one of its asset URLs, or null. */
const slugFromUrl = ( url ) => {
	const m = EXT_DIR.exec( String( url || '' ) );
	return m ? m[ 1 ] : null;
};

const injected = new Set();

/**
 * Load a freshly installed package into the RUNNING editor: script (and
 * optional style) tags are appended, the extension registers through
 * `window.WPIE.api` exactly as it would after a reload. Re-installing an
 * already loaded slug cannot un-register the old code — the caller shows
 * a "reload to update" note instead.
 *
 * @param {Object} ext Package descriptor from the REST API.
 * @return {boolean} False when the slug is already live (reload needed).
 */
export function injectExtension( ext ) {
	const live =
		injected.has( ext.slug ) ||
		// Covers both enqueued (PHP) and previously injected scripts.
		document.querySelector(
			`script[src*="/wpie-extensions/${ ext.slug }/"],` +
				`script[src*="/bundled-extensions/${ ext.slug }/"]`
		);
	if ( live ) {
		return false;
	}
	// Packages built for a NEWER editor are not injected either
	// (v1.273.1) - same gate as the PHP enqueue.
	if ( ext.requiresApi && ! apiSatisfies( ext.requiresApi ) ) {
		recordExtensionIssue(
			ext.slug,
			`Needs editor API ${ ext.requiresApi }`
		);
		return false;
	}
	injected.add( ext.slug );
	if ( ext.style ) {
		const link = document.createElement( 'link' );
		link.rel = 'stylesheet';
		link.href = ext.style;
		document.head.appendChild( link );
	}
	const script = document.createElement( 'script' );
	script.src = ext.main;
	script.dataset.wpieExt = ext.slug;
	script.onerror = () =>
		recordExtensionIssue(
			ext.slug,
			`Failed to load ${ ext.main.split( '/' ).pop() }`
		);
	document.body.appendChild( script );
	return true;
}

/**
 * Attribute uncaught errors thrown by installed packages (syntax errors,
 * top-level throws) to their slug for the manager UI. Returns the
 * unlisten function.
 *
 * @return {Function} Cleanup.
 */
export function watchExtensionErrors() {
	const onError = ( event ) => {
		const slug = slugFromUrl( event.filename );
		if ( slug ) {
			recordExtensionIssue( slug, event.message || 'Script error' );
		}
	};
	window.addEventListener( 'error', onError );
	return () => window.removeEventListener( 'error', onError );
}
