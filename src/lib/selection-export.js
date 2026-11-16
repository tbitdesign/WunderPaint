import { selectionUnits } from './selection-units';
import { contentBounds } from './raster';

/** Selected subtrees and their full painted extent, including group styles. */
export function selectionExportView( state ) {
	const units = selectionUnits( state );
	if ( ! units.length ) {
		return null;
	}
	const ids = new Set( units.flatMap( ( unit ) => unit.ids ) );
	return {
		ids,
		box: contentBounds( state.layers, {
			roots: units.map( ( unit ) => unit.root ),
		} ),
		layers: state.layers
			.filter( ( layer ) => ids.has( layer.id ) )
			.map( ( layer ) =>
				ids.has( layer.parent ) ? layer : { ...layer, parent: null }
			),
	};
}
