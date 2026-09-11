/**
 * Close-on-Escape for modal dialogs (B2, v0.5). Capture-phase so the
 * editor's global shortcut handler never sees the key while a dialog
 * is open.
 *
 * One stack for all of them (LUECKE-02, 10.09.2026). Every open dialog used
 * to hang its own capture listener on the document, so one Escape reached
 * all of them at once: a confirm box over the export dialog took the export
 * dialog with it. Now the hook registers the dialog on a stack and only the
 * topmost - the one opened last - answers the key; the ones below wait
 * their turn.
 */

import { useEffect, useRef } from '@wordpress/element';

const stack = [];
let bound = false;

const onKey = ( e ) => {
	if ( 'Escape' !== e.key || ! stack.length ) {
		return;
	}
	e.stopPropagation();
	e.preventDefault();
	stack[ stack.length - 1 ].current?.();
};

/**
 * @param {Function} onClose Called when Escape is pressed while this dialog
 *                           is the topmost one.
 */
export function useEscape( onClose ) {
	const handler = useRef( onClose );
	handler.current = onClose;
	useEffect( () => {
		stack.push( handler );
		if ( ! bound ) {
			document.addEventListener( 'keydown', onKey, true );
			bound = true;
		}
		return () => {
			const i = stack.lastIndexOf( handler );
			if ( i >= 0 ) {
				stack.splice( i, 1 );
			}
			if ( ! stack.length && bound ) {
				document.removeEventListener( 'keydown', onKey, true );
				bound = false;
			}
		};
	}, [] );
}

/** How many dialogs are currently listening (tests). */
export const __escapeDepth = () => stack.length;
