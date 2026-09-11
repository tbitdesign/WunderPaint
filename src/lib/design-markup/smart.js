import { makeSmart, serializeLayers } from '../../store/document';
import { renderToCanvas, layerOvershoot, sharedImageCache } from '../raster';

/**
 * Smart-Hülle nach dem Vertrag von convertToSmartOp (src/store/ops/io-ops.js):
 * Bounds aus den Blättern plus Überstand, Vorschau-PNG, eingebettete Ebenen
 * relativ zur Box, Smart Filter am Hüllen-Layer. Läuft ohne Dokument-Op.
 */
export async function wrapSmart( {
	layers,
	doc,
	name,
	filters = [],
	render = renderToCanvas,
} ) {
	const leaves = layers.filter( ( l ) => 'group' !== l.type );
	const minX = Math.floor(
		Math.min( ...leaves.map( ( l ) => l.x - layerOvershoot( l ) ) )
	);
	const minY = Math.floor(
		Math.min( ...leaves.map( ( l ) => l.y - layerOvershoot( l ) ) )
	);
	const maxX = Math.ceil(
		Math.max( ...leaves.map( ( l ) => l.x + l.w + layerOvershoot( l ) ) )
	);
	const maxY = Math.ceil(
		Math.max( ...leaves.map( ( l ) => l.y + l.h + layerOvershoot( l ) ) )
	);
	const bounds = {
		x: minX,
		y: minY,
		w: Math.max( 1, maxX - minX ),
		h: Math.max( 1, maxY - minY ),
	};
	const subtree = layers.map( ( l ) => ( { ...l, previewEffect: null } ) );
	const preview = await render( { ...doc, bg: 'transparent' }, subtree, {
		viewport: bounds,
		cache: sharedImageCache,
	} );
	const smart = makeSmart( {
		name,
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		src: preview.toDataURL( 'image/png' ),
		srcW: bounds.w,
		srcH: bounds.h,
		embedded: {
			kind: 'layers',
			bytes: null,
			layers: serializeLayers(
				subtree.map( ( l ) => ( {
					...l,
					x: l.x - bounds.x,
					y: l.y - bounds.y,
				} ) )
			),
			doc: { w: bounds.w, h: bounds.h, bg: 'transparent' },
		},
		smartFilters: filters,
	} );
	return smart;
}
