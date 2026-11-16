import { useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

/** One value: edit the current selection immediately and remember it for new ones. */
export function useSelectionFeather( editor ) {
	const changed = useRef( false );
	const { state, dispatch, commit } = editor;
	const value = state.selection
		? state.selection.feather || 0
		: state.toolOpts.marquee.feather || 0;
	return {
		value,
		onChange: ( input ) => {
			if ( ! Number.isFinite( input ) ) {
				return;
			}
			const feather = Math.max( 0, Math.round( input ) );
			if ( state.selection && feather !== value ) {
				changed.current = true;
			}
			dispatch( { type: 'SET_SELECTION_FEATHER', feather } );
		},
		onCommit: () => {
			if ( changed.current ) {
				changed.current = false;
				commit( __( 'Feather Selection', 'wunderpaint' ) );
			}
		},
	};
}
