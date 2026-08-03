/**
 * Layer comps (v1.1): named snapshots of per-layer visibility, position
 * and opacity, stored on the document (they travel with projects/.wpie).
 */

import { uid } from '../store/document';

/** Capture the comp-relevant state of every layer. */
export function captureComp( name, layers ) {
	const map = {};
	for ( const layer of layers || [] ) {
		map[ layer.id ] = {
			visible: !! layer.visible,
			x: layer.x,
			y: layer.y,
			opacity: layer.opacity ?? 1,
		};
	}
	return { id: uid(), name: String( name || 'Comp' ).slice( 0, 40 ), map };
}

/**
 * Apply a comp to a layer list without mutating it.
 *
 * @param {Array}  layers Layers.
 * @param {Object} comp   Comp from captureComp.
 * @return {Array} New layer array (unknown layers untouched).
 */
export function applyComp( layers, comp ) {
	return ( layers || [] ).map( ( layer ) => {
		const saved = comp?.map?.[ layer.id ];
		return saved ? { ...layer, ...saved } : layer;
	} );
}
