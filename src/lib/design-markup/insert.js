import { __ } from '@wordpress/i18n';
import { reassignIds } from '../template-io';
import { ensureFontsForLayers } from '../font-manager';

/**
 * Kompilierte Ebenen in das offene Dokument: neue IDs (Parent/Children
 * mitgeschrieben), Gruppen mit leeren Kindlisten (der Reducer füllt sie,
 * siehe insertDesignVariant), Fonts vorab, ein Undo-Schritt.
 *
 * A rejected compile - or one that resolved to zero layers - inserts
 * nothing and never touches history; `commit()` after an empty dispatch
 * loop would still add a real undo entry and clear the redo stack.
 */
export async function insertDesign( editor, compiled ) {
	if ( 'valid' !== compiled.status || ! compiled.layers?.length ) {
		return 0;
	}
	const { dispatch, commit } = editor;
	const fresh = reassignIds( compiled.layers );
	await ensureFontsForLayers( fresh );
	for ( const layer of fresh ) {
		dispatch( {
			type: 'ADD_LAYER',
			layer: 'group' === layer.type ? { ...layer, children: [] } : layer,
		} );
	}
	commit( __( 'Design', 'wunderpaint' ) );
	return fresh.length;
}
