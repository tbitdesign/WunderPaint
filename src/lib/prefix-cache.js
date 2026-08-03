/**
 * Prefix-cache helpers for the canvas painter (leaf module so tests can
 * import them without the editor-canvas dependency chain).
 *
 * The painter composites all top-level layers BELOW the active layer's
 * root once ("prefix") and repaints only active + above per frame; the
 * cache key must therefore change whenever ANYTHING inside the prefix
 * changes, including children of grouped layers.
 */

import { withDescendants } from '../store/editor-context';

// Identity-based version tags (v0.7): a layer object edit produces a new
// object, which gets a fresh sequence number on first sight.
const layerVersions = new WeakMap();
let layerVersionSeq = 0;

export function layerVersion( layer ) {
	if ( ! layerVersions.has( layer ) ) {
		layerVersions.set( layer, ++layerVersionSeq );
	}
	return layerVersions.get( layer );
}

/**
 * Version list for the prefix-cache signature (v1.65.5): covers the prefix
 * roots AND all their descendants. Hashing only the top-level objects
 * froze grouped children in the live preview: moving a child of a
 * below-active group (marquee selections select children, not the group)
 * left the group object identical, the signature matched and the stale
 * cached pixels kept painting until something else invalidated them.
 *
 * @param {Array} allLayers Flat layer list.
 * @param {Array} roots     Top-level layers below the active root.
 * @return {Array} Version numbers of roots + descendants.
 */
export function prefixVersions( allLayers, roots ) {
	const ids = withDescendants(
		allLayers,
		roots.map( ( l ) => l.id )
	);
	return allLayers
		.filter( ( l ) => ids.has( l.id ) )
		.map( ( l ) => layerVersion( l ) );
}
