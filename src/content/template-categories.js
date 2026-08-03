/**
 * Starter-template categories (v1.255.0). Tiny standalone module (the
 * combo-categories pattern) so UI chrome can import the list WITHOUT
 * pulling the large, lazy-loaded templates chunk into the eager bundle.
 *
 * Occasion-first taxonomy: a template is filed under what it is FOR
 * (a sale, a menu, a gig), not how it looks - the look is what the
 * preview shows anyway.
 */

import { __ } from '@wordpress/i18n';

export const TEMPLATE_CATEGORIES = [
	{ id: 'sale', label: __( 'Sales & Specials', 'wunderpaint' ) },
	{ id: 'product', label: __( 'Products & Launches', 'wunderpaint' ) },
	{ id: 'event', label: __( 'Events & Invites', 'wunderpaint' ) },
	{ id: 'music', label: __( 'Music & Nightlife', 'wunderpaint' ) },
	{ id: 'food', label: __( 'Food & Drink', 'wunderpaint' ) },
	{ id: 'sport', label: __( 'Sports & Fitness', 'wunderpaint' ) },
	{ id: 'business', label: __( 'Business & Jobs', 'wunderpaint' ) },
	{ id: 'education', label: __( 'Tips & Courses', 'wunderpaint' ) },
	{ id: 'quotes', label: __( 'Quotes & Reviews', 'wunderpaint' ) },
	{ id: 'editorial', label: __( 'Editorial & Media', 'wunderpaint' ) },
	{ id: 'data', label: __( 'Data & Planning', 'wunderpaint' ) },
	{ id: 'art', label: __( 'Art & Posters', 'wunderpaint' ) },
];

/**
 * Built-in categories plus the ones template packs declare
 * (registerTemplatePack `categories`, v1.257.0). First declaration of an
 * id wins, built-ins always win over packs - a pack can reuse a built-in
 * id but not relabel it.
 *
 * @param {Array} packs Resolved packs from useExtensionTemplatePacks.
 * @return {Array} [{ id, label }] for the filter chips.
 */
const BUILTIN_IDS = new Set( TEMPLATE_CATEGORIES.map( ( c ) => c.id ) );

/**
 * Namespace a pack's own gallery categories (v1.273.2): reusing a
 * BUILT-IN id files the pack's templates into that chip on purpose; any
 * other id is prefixed with the pack's vendor slug, so two packs
 * declaring "yoga" get two chips instead of silently sharing one. Packs
 * of the SAME vendor share their categories deliberately.
 *
 * @param {string} packId     Namespaced pack id (`vendor/name`).
 * @param {Array}  categories Declared categories ([{ id, label }]).
 * @return {Object} { categories, mapId } - runtime categories plus a
 *   mapper that translates descriptor.category values.
 */
export function namespacePackCategories( packId, categories ) {
	const vendor = String( packId || '' ).split( '/' )[ 0 ];
	const map = new Map();
	const out = [];
	for ( const cat of categories || [] ) {
		if ( ! cat?.id || ! cat.label ) {
			continue;
		}
		const runtime = BUILTIN_IDS.has( cat.id )
			? cat.id
			: `${ vendor }:${ cat.id }`;
		map.set( cat.id, runtime );
		out.push( { id: runtime, label: cat.label } );
	}
	return {
		categories: out,
		mapId: ( id ) => map.get( id ) || id,
	};
}

export function mergeTemplateCategories( packs ) {
	const merged = [ ...TEMPLATE_CATEGORIES ];
	const seen = new Set( merged.map( ( c ) => c.id ) );
	for ( const pack of packs || [] ) {
		for ( const cat of pack.categories || [] ) {
			if ( cat?.id && cat.label && ! seen.has( cat.id ) ) {
				seen.add( cat.id );
				merged.push( { id: cat.id, label: cat.label } );
			}
		}
	}
	return merged;
}
