/**
 * A per-run view of the editor whose writes can be revoked.
 *
 * The AI panel's Cancel button used to set a flag and clear the busy state,
 * and that was all: there is no AbortController anywhere in src/ and no
 * worker.terminate() on that path, so the work carried on and, when it came
 * back, called replaceLayerContent() - which dispatches UPDATE_LAYER and
 * commit() without asking. Because busy was already clear, the user had
 * started the NEXT action by then. Two results landing on the same layer,
 * the slower one winning, two undo steps for one intention.
 *
 * A shared "cancelled" flag cannot fix that: the next run resets it, and the
 * late write from the run before sails through. The write has to carry the
 * identity of the run that issued it. So every run gets its own editor view;
 * revoke() makes that view's dispatch and commit no-ops for good, while the
 * live editor and every other run stay untouched.
 *
 * Reads stay live (state is a getter), so an action that inspects
 * `editor.state.layers` mid-flight still sees the current document.
 */

/**
 * @param {Object} editor Live editor context ({ state, dispatch, commit, … }).
 * @return {{ editor: Object, revoke: Function, revoked: Function }}
 */
export function guardedRun( editor ) {
	let revoked = false;
	const view = Object.create( null );
	for ( const key of Object.keys( editor ) ) {
		if ( 'state' === key || 'dispatch' === key || 'commit' === key ) {
			continue;
		}
		view[ key ] = editor[ key ];
	}
	Object.defineProperty( view, 'state', {
		enumerable: true,
		get: () => editor.state,
	} );
	view.dispatch = ( action ) => {
		if ( ! revoked ) {
			return editor.dispatch( action );
		}
		return undefined;
	};
	view.commit = ( label ) => {
		if ( ! revoked ) {
			return editor.commit( label );
		}
		return undefined;
	};
	return {
		editor: view,
		revoke: () => {
			revoked = true;
		},
		revoked: () => revoked,
	};
}
