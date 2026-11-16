import { flushSync } from 'react-dom';

// Real modals, including extension dialogs, block editor color picking.
// Floating tool panels historically also use aria-modal, so exclude them.
export const COLOR_BLOCKING_DIALOG =
	'.modal-backdrop, [role="dialog"][aria-modal="true"]:not(.ed-float-panel)';
export const colorPickBlocked = (
	root = document.querySelector( '#wpie-root' )
) => !! root?.querySelector( COLOR_BLOCKING_DIALOG );

// One mounted Color panel owns every entry point and its current color target.
const panels = new WeakMap();
export function bindColorPick( dispatch, api ) {
	panels.set( dispatch, api );
	return () => {
		if ( panels.get( dispatch ) === api ) {
			panels.delete( dispatch );
		}
	};
}

/** Keep mounting/preparation inside the gesture: native EyeDropper requires it. */
export function beginColorPick( editor, options = {} ) {
	if ( colorPickBlocked() ) {
		return;
	}
	flushSync( () => {
		if ( ! options.keepTarget ) {
			editor.dispatch( { type: 'SET_TOOL', tool: 'eyedropper' } );
		}
		// Screen capture is an explicit one-shot action, never a persisted tool mode.
		editor.dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: 'eyedropper',
			patch: { source: 'canvas' },
		} );
		editor.dispatch( {
			type: 'TOGGLE_COLOR_PANEL',
			show: true,
			mode: options.keepTarget ? editor.state.colorPanelMode : 'panel',
			fromSwatch: !! options.keepTarget,
		} );
	} );
	flushSync( () => panels.get( editor.dispatch )?.prepare( options ) );
	return panels.get( editor.dispatch )?.start( options );
}
