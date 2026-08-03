/**
 * Close-on-Escape for modal dialogs (B2, v0.5). Capture-phase so the
 * editor's global shortcut handler never sees the key while a dialog
 * is open.
 */

import { useEffect } from '@wordpress/element';

/**
 * @param {Function} onClose Called when Escape is pressed.
 */
export function useEscape( onClose ) {
	useEffect( () => {
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				e.preventDefault();
				onClose?.();
			}
		};
		document.addEventListener( 'keydown', onKey, true );
		return () => document.removeEventListener( 'keydown', onKey, true );
	}, [ onClose ] );
}
