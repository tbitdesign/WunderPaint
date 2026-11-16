import { offsetLayer } from '../../store/doc-ops';
import { makeSmart, serializeLayers } from '../../store/document';
import { renderToCanvas, contentBounds, sharedImageCache } from '../raster';

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
	const subtree = layers.map( ( l ) => ( { ...l, previewEffect: null } ) );
	const bounds = contentBounds( subtree, { includeHidden: true } );
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
				subtree.map( ( l ) => {
					const moved = offsetLayer( l, -bounds.x, -bounds.y );
					// Stroke paths are absolute. Preserve their original reference
					// point so the new x/y translates the ink into the embedded doc.
					return 'stroke' === l.type
						? { ...moved, x0: l.x0 ?? l.x, y0: l.y0 ?? l.y }
						: moved;
				} )
			),
			doc: { w: bounds.w, h: bounds.h, bg: 'transparent' },
		},
		smartFilters: filters,
	} );
	return smart;
}
