/**
 * Extension package client (v1.119): REST calls for the in-editor
 * extensions library, live script injection after an install (no reload
 * needed) and a window-level error watcher that attributes load/runtime
 * errors of installed packages so the manager can show them instead of
 * letting them die silently in the console.
 */

import { request } from './api';
import {
	API_VERSION,
	apiSatisfies,
	recordExtensionIssue,
	watchInventory,
	installPlaceholders,
	retirePlaceholders,
} from './extensions';

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

/** Append ?ver=<version> unless the URL already carries a query or hash. */
export const versioned = ( url, version ) =>
	version && ! /[?#]/.test( String( url ) )
		? `${ url }?ver=${ encodeURIComponent( version ) }`
		: url;

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
export function injectExtension( ext, { onLoad, onError } = {} ) {
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
		if ( onError ) {
			onError();
		}
		return false;
	}
	injected.add( ext.slug );
	// The version rides along as ?ver=, exactly as wp_enqueue_script used
	// to send it: browser and CDN caches are keyed by the full URL, so an
	// updated package must ask for a new one. Without it the edge served
	// the bundle a previous version had left there (found 2026-09-02).
	if ( ext.style ) {
		const link = document.createElement( 'link' );
		link.rel = 'stylesheet';
		link.href = versioned( ext.style, ext.version );
		document.head.appendChild( link );
	}
	const script = document.createElement( 'script' );
	script.src = versioned( ext.main, ext.version );
	// Dynamically inserted scripts run in whatever order they arrive;
	// registration order is menu order, so keep the list's order.
	script.async = false;
	script.dataset.wpieExt = ext.slug;
	script.onerror = () => {
		recordExtensionIssue(
			ext.slug,
			`Failed to load ${ ext.main.split( '/' ).pop() }`
		);
		if ( onError ) {
			onError();
		}
	};
	if ( onLoad ) {
		script.onload = onLoad;
	}
	document.body.appendChild( script );
	return true;
}

/* ------------------------------ lazy loading ----------------------------- */

/*
 * The boot used to load every package's bundle so its menu entries could
 * exist. Now each package's INVENTORY (what it registered: kinds, generator
 * ids and labels, menu items - see lib/extensions.js) is kept in
 * localStorage per package version, editor locale and API version. A
 * package whose inventory holds only generators and menu items gets
 * placeholders at boot and its bundle on first use; everything else, and
 * every package without a matching inventory (first boot, an update, a
 * language switch, a blocked store), loads as before. The cache is
 * self-healing: it is rewritten on every registration, so a package that
 * turns out to register a library section later is eager from then on.
 */
const INVENTORY_PREFIX = 'wpie-ext-inv:';
const LAZY_KINDS = new Set( [ 'generator', 'menuItem' ] );

const storage = () => {
	try {
		return window.localStorage;
	} catch ( e ) {
		return null;
	}
};

export const inventoryKey = ( slug ) => INVENTORY_PREFIX + slug;

/** The stored inventory of a package, or null when absent or stale. */
export function readInventory( ext, locale ) {
	const st = storage();
	if ( ! st ) {
		return null;
	}
	try {
		const raw = st.getItem( inventoryKey( ext.slug ) );
		const v = raw ? JSON.parse( raw ) : null;
		if (
			! v ||
			v.version !== ext.version ||
			v.locale !== locale ||
			v.api !== API_VERSION
		) {
			return null;
		}
		return v;
	} catch ( e ) {
		return null;
	}
}

export function writeInventory( ext, locale, snap ) {
	const st = storage();
	if ( ! st || ! snap ) {
		return;
	}
	try {
		st.setItem(
			inventoryKey( ext.slug ),
			JSON.stringify( {
				version: ext.version,
				locale,
				api: API_VERSION,
				...snap,
			} )
		);
	} catch ( e ) {
		// A full or blocked store means "eager next time", nothing more.
	}
}

/** Only generators and menu items have placeholders. */
export const canBeLazy = ( inv ) =>
	!! inv &&
	Array.isArray( inv.kinds ) &&
	inv.kinds.length > 0 &&
	inv.kinds.every( ( k ) => LAZY_KINDS.has( k ) ) &&
	( inv.generators || [] ).length + ( inv.menuItems || [] ).length > 0;

const pending = new Map(); // slug → Promise<boolean>

/**
 * Load one package now (idempotent). Resolves true once its script ran,
 * false when it failed; either way its placeholders are gone afterwards.
 *
 * @param {Object} ext Package descriptor (window.WPIE.extensions entry).
 * @return {Promise<boolean>} Loaded.
 */
export function loadExtension( ext ) {
	if ( pending.has( ext.slug ) ) {
		return pending.get( ext.slug );
	}
	const p = new Promise( ( resolve ) => {
		const done = ( ok ) => {
			retirePlaceholders( ext.slug );
			resolve( ok );
		};
		const started = injectExtension( ext, {
			onLoad: () => done( true ),
			onError: () => done( false ),
		} );
		if ( ! started ) {
			// Already on the page (PHP fallback, or an earlier injection):
			// nothing to wait for.
			done( true );
		}
	} );
	pending.set( ext.slug, p );
	return p;
}

/**
 * Boot every enabled package: placeholders for the ones the inventory
 * vouches for, scripts for the rest.
 *
 * @param {Array}  list             window.WPIE.extensions.
 * @param {Object} [options]        Options.
 * @param {string} [options.locale] Editor locale (labels are localised).
 * @return {{eager: string[], lazy: string[]}} What happened, for the log.
 */
export function bootExtensions( list, { locale = '' } = {} ) {
	const packages = ( Array.isArray( list ) ? list : [] ).filter(
		( e ) => e && e.slug && e.main && false !== e.enabled && ! e.apiBlocked
	);
	const bySlug = new Map( packages.map( ( e ) => [ e.slug, e ] ) );
	watchInventory( ( slug, snap ) => {
		const ext = bySlug.get( slug );
		if ( ext ) {
			writeInventory( ext, locale, snap );
		}
	} );
	const report = { eager: [], lazy: [] };
	for ( const ext of packages ) {
		const inv = readInventory( ext, locale );
		if ( canBeLazy( inv ) ) {
			installPlaceholders( ext.slug, inv, () => loadExtension( ext ) );
			report.lazy.push( ext.slug );
		} else {
			report.eager.push( ext.slug );
		}
	}
	for ( const slug of report.eager ) {
		loadExtension( bySlug.get( slug ) );
	}
	return report;
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
