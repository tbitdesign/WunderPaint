/** One edit, one history entry. Refuse stale plans before touching the editor. */
export function isCurrent( editor, base ) {
	return editor.state.layers === base.layers && editor.state.doc === base.doc;
}

export function applyPlan( editor, base, result, label ) {
	if ( ! isCurrent( editor, base ) ) {
		return 'stale';
	}
	if ( ! result || ( ! result.patches.size && ! result.docPatch ) ) {
		return 'empty';
	}
	if ( result.patches.size ) {
		editor.dispatch( {
			type: 'UPDATE_LAYERS',
			ids: [ ...result.patches.keys() ],
			patchFor: ( layer ) => result.patches.get( layer.id ) || {},
		} );
	}
	if ( result.docPatch ) {
		editor.dispatch( { type: 'SET_DOC', doc: result.docPatch } );
	}
	editor.commit( label );
	return 'applied';
}
