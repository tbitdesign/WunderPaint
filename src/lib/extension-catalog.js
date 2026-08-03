/**
 * Pure catalog helpers for the extensions manager: compare versions, merge
 * the remote catalog with what is installed into display-ready cards (both
 * ways - sideloaded packages without a catalog entry become cards too),
 * count the sidebar groups and filter the grid. No React, no DOM, so it
 * can be reasoned about and tested on its own.
 */

/**
 * True when semver `a` is strictly greater than `b`, comparing
 * major.minor.patch numerically. Missing parts count as 0.
 *
 * @param {string} a Candidate version.
 * @param {string} b Baseline version.
 * @return {boolean} Whether a > b.
 */
export function semverGt( a, b ) {
	const pa = String( a || '0' ).split( '.' );
	const pb = String( b || '0' ).split( '.' );
	for ( let i = 0; i < 3; i++ ) {
		const x = parseInt( pa[ i ], 10 ) || 0;
		const y = parseInt( pb[ i ], 10 ) || 0;
		if ( x > y ) {
			return true;
		}
		if ( x < y ) {
			return false;
		}
	}
	return false;
}

/**
 * Merge catalog entries with the installed extensions into cards.
 *
 * State rules:
 * - installed and the catalog is newer  -> 'update'
 * - installed and current               -> 'installed'
 * - not installed, tier 'pro'           -> 'locked'
 * - not installed, tier 'free'          -> 'installable'
 *
 * Installed packages without a catalog entry (sideloaded ZIPs) become
 * cards as well, with `catalogVersion: null` and no tier. A missing
 * category always falls back to 'other' so every card has a home.
 *
 * @param {Array<Object>} catalogEntries Catalog entries from the delivery host.
 * @param {Array<Object>} installed      Installed extensions ({ slug, version, … }).
 * @return {Array<Object>} Cards for the manager.
 */
export function mergeCatalog( catalogEntries, installed ) {
	const bySlug = {};
	( installed || [] ).forEach( ( e ) => {
		bySlug[ e.slug ] = e;
	} );
	const seen = new Set();
	const cards = ( catalogEntries || [] ).map( ( c ) => {
		const inst = bySlug[ c.slug ];
		seen.add( c.slug );
		let state;
		if ( inst ) {
			state = semverGt( c.version, inst.version )
				? 'update'
				: 'installed';
		} else {
			state = 'pro' === c.tier ? 'locked' : 'installable';
		}
		return {
			slug: c.slug,
			name: c.name,
			description: c.description || inst?.description || '',
			tier: c.tier || null,
			category: c.category || 'other',
			download: c.download || null,
			requiresApi: c.requiresApi,
			state,
			installed: !! inst,
			enabled: inst ? false !== inst.enabled : null,
			apiBlocked: inst ? !! inst.apiBlocked : false,
			author: inst?.author,
			homepage: inst?.homepage,
			provides: inst?.provides || [],
			installedVersion: inst ? inst.version : null,
			catalogVersion: c.version || null,
		};
	} );
	( installed || [] ).forEach( ( e ) => {
		if ( seen.has( e.slug ) ) {
			return;
		}
		cards.push( {
			slug: e.slug,
			name: e.name,
			description: e.description || '',
			tier: null,
			category: 'other',
			download: null,
			requiresApi: e.requiresApi,
			state: 'installed',
			installed: true,
			enabled: false !== e.enabled,
			apiBlocked: !! e.apiBlocked,
			author: e.author,
			homepage: e.homepage,
			provides: e.provides || [],
			installedVersion: e.version || null,
			catalogVersion: null,
		} );
	} );
	return cards;
}

/**
 * Counts for the sidebar. Discover rows (`all`, `categories`) only count
 * cards that exist in the catalog; the library rows count everything, so
 * sideloaded packages show up under Installed but never in Discover.
 *
 * @param {Array<Object>} cards Cards from mergeCatalog().
 * @return {Object} { all, installed, updates, categories }.
 */
export function groupCounts( cards ) {
	const categories = {};
	let all = 0;
	let installed = 0;
	let updates = 0;
	for ( const c of cards || [] ) {
		if ( c.catalogVersion ) {
			all++;
			categories[ c.category ] = ( categories[ c.category ] || 0 ) + 1;
		}
		if ( c.installed ) {
			installed++;
		}
		if ( 'update' === c.state ) {
			updates++;
		}
	}
	return { all, installed, updates, categories };
}

/**
 * The cards one view shows. A non-empty query searches globally across
 * name and description and ignores the view; otherwise 'installed' and
 * 'updates' filter the library while 'browse' shows the catalog,
 * optionally narrowed to one category.
 *
 * @param {Array<Object>} cards Cards from mergeCatalog().
 * @param {Object}        view  { kind: 'installed'|'updates'|'browse', category, query }.
 * @return {Array<Object>} Filtered cards.
 */
export function filterCards( cards, view ) {
	const list = cards || [];
	const q = ( view?.query || '' ).trim().toLowerCase();
	if ( q ) {
		return list.filter( ( c ) =>
			( c.name + ' ' + ( c.description || '' ) )
				.toLowerCase()
				.includes( q )
		);
	}
	if ( 'installed' === view?.kind ) {
		return list.filter( ( c ) => c.installed );
	}
	if ( 'updates' === view?.kind ) {
		return list.filter( ( c ) => 'update' === c.state );
	}
	const browse = list.filter( ( c ) => !! c.catalogVersion );
	if ( view?.category ) {
		return browse.filter( ( c ) => c.category === view.category );
	}
	return browse;
}
