import { newId } from './model.js';

/** The visible stack, front first; photo and empty sheets each have one row. */
export function stackRows( layers ) {
	return layers
		.slice()
		.reverse()
		.flatMap( ( layer ) =>
			layer.source === 'elements' && layer.objects.length
				? layer.objects
						.slice()
						.reverse()
						.map( ( object ) => ( {
							id: object.id,
							layer,
							object,
						} ) )
				: [ { id: layer.id, layer, object: null } ]
		);
}

const copySheet = ( layer, objects ) => ( { ...layer, id: newId(), objects } );

/** Return a boundary in the back-to-front sheet array, splitting only when needed. */
function boundaryAfter( layers, row ) {
	const at = layers.indexOf( row.layer );
	if ( row.object ) {
		const split = row.layer.objects.indexOf( row.object ) + 1;
		if ( split < row.layer.objects.length ) {
			const front = row.layer.objects.splice( split );
			layers.splice( at + 1, 0, copySheet( row.layer, front ) );
		}
	}
	return at + 1;
}

/** Give an object its own paper without changing the visible row order. */
export function isolateRow( layers, id ) {
	const row = stackRows( layers ).find( ( item ) => item.id === id );
	if ( ! row || ! row.object || row.layer.objects.length === 1 ) {
		return row;
	}
	boundaryAfter( layers, row );
	if ( row.layer.objects.length === 1 ) {
		return row;
	}
	row.layer.objects.pop();
	const own = copySheet( row.layer, [ row.object ] );
	layers.splice( layers.indexOf( row.layer ) + 1, 0, own );
	return { ...row, layer: own };
}

/** Move immediately before a visible row; null means the back of the stack. */
export function moveRow( layers, id, beforeId ) {
	const rows = stackRows( layers );
	const from = rows.findIndex( ( row ) => row.id === id );
	const target =
		beforeId === null
			? rows.length
			: rows.findIndex( ( row ) => row.id === beforeId );
	if ( from < 0 || target < 0 || target === from || target === from + 1 ) {
		return false;
	}
	const row = rows[ from ];
	let sheet = row.layer;
	if ( row.object && row.layer.objects.length > 1 ) {
		row.layer.objects.splice( row.layer.objects.indexOf( row.object ), 1 );
		sheet = copySheet( row.layer, [ row.object ] );
	} else {
		layers.splice( layers.indexOf( sheet ), 1 );
	}
	const at = beforeId === null ? 0 : boundaryAfter( layers, rows[ target ] );
	layers.splice( at, 0, sheet );
	return true;
}
