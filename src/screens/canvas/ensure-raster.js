/**
 * Give a layer the pixels a brush can write into.
 *
 * Two kinds of layer arrive without them: a raster from "New Layer" (or a
 * reopened document) carries no canvas until something paints into it,
 * and an image layer is not a raster at all (rasterize-on-first-edit,
 * spec 02.2). Both are promoted here, and the editor is told right away
 * (UPDATE_LAYER / SET_LAYERS, no history entry - the stroke that follows
 * makes the one entry).
 *
 * Its own module, not a helper inside tool-handlers.js, because BOTH the
 * classic stroke commit (tool-handlers.js) and the wet island
 * (wet-controller.js) need it, and tool-handlers.js already imports the
 * controller. Before this the controller refused any layer without a
 * canvas, so the FIRST medium stroke on every fresh layer went through the
 * static style pass and only the second one into the wash.
 */

import { buildRasterCanvas, imageToRaster } from '../../lib/raster-layer';

/**
 * Promote a layer to a raster with a live canvas.
 *
 * @param {Object} tc    Tool context (editor, layers, imageCache).
 * @param {Object} layer The active layer.
 * @return {Object|null} The layer with a canvas (the same object when it
 *   already had one), or null when it cannot take paint yet: an image
 *   that has not finished loading, or a type no brush writes into.
 */
export function ensureRaster( tc, layer ) {
	if ( 'raster' === layer.type ) {
		if ( ! layer.canvas ) {
			const source = layer.dataUrl
				? tc.imageCache.get( layer.dataUrl )
				: null;
			const canvas = buildRasterCanvas( layer, source );
			const patched = { ...layer, canvas };
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { canvas },
			} );
			return patched;
		}
		return layer;
	}
	if ( 'image' === layer.type ) {
		const img = tc.imageCache.get( layer.src );
		if ( ! img ) {
			return null;
		}
		const raster = imageToRaster( layer, img );
		tc.editor.dispatch( {
			type: 'SET_LAYERS',
			layers: tc.layers.map( ( l ) =>
				l.id === layer.id ? raster : l
			),
		} );
		return raster;
	}
	return null;
}
