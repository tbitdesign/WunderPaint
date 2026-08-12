/**
 * Where the prompt/confirm dialog is HUNG, which turns out to decide
 * whether it can be seen at all.
 *
 * `.editor-root` is `position: fixed` with `z-index: auto`. A positioned
 * element like that is painted as one unit on level nought, and everything
 * inside it goes with it - so this dialog's z-index of seven hundred only
 * ever counted against its own siblings. An extension dialog next door, at
 * a hundred, covered it whole: asked for a name from inside a studio, the
 * box opened BEHIND the studio.
 *
 * The fix is where it lives, not what number it carries, so that is what
 * this checks.
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

import { DialogHost } from './input-dialog';
import { promptDialog, confirmDialog } from '../lib/dialogs';

global.IS_REACT_ACT_ENVIRONMENT = true;

/**
 * The editor's shell, as the real page builds it. Assembled node by node
 * rather than with innerHTML: a test is the place people copy patterns
 * from, and that one carries a habit worth not spreading.
 */
function mountEditorLike() {
	const wrap = document.createElement( 'div' );
	wrap.id = 'wpie-root';
	const shell = document.createElement( 'div' );
	shell.className = 'editor-root';
	const host = document.createElement( 'div' );
	shell.appendChild( host );
	wrap.appendChild( shell );
	document.body.appendChild( wrap );
	const root = createRoot( host );
	act( () => root.render( <DialogHost /> ) );
	return root;
}

describe( 'DialogHost', () => {
	afterEach( () => {
		document.body.replaceChildren();
	} );

	it( 'hangs its box beside the extension dialogs, not inside the shell', async () => {
		const root = mountEditorLike();
		let answer;
		act( () => {
			answer = promptDialog( { title: 'Name', defaultValue: 'x' } );
		} );
		const box = document.querySelector( '.modal-backdrop' );
		expect( box ).toBeTruthy();
		expect( box.parentElement.id ).toBe( 'wpie-root' );
		expect( box.closest( '.editor-root' ) ).toBeNull();
		// And it still says what it is worth, for the siblings it now has.
		expect( box.style.zIndex ).toBe( '700' );
		act( () => {
			document
				.querySelector( '.modal-backdrop' )
				.dispatchEvent( new MouseEvent( 'click', { bubbles: true } ) );
		} );
		await expect( answer ).resolves.toBeNull();
		act( () => root.unmount() );
	} );

	it( 'covers a dialog that an extension hung at the usual level', async () => {
		const root = mountEditorLike();
		// What ui.dialog() does: a plain backdrop appended to #wpie-root.
		const studio = document.createElement( 'div' );
		studio.className = 'modal-backdrop';
		studio.id = 'studio';
		document.getElementById( 'wpie-root' ).appendChild( studio );
		act( () => {
			confirmDialog( { title: 'Sure?' } );
		} );
		const boxes = Array.from(
			document.querySelectorAll( '#wpie-root > .modal-backdrop' )
		);
		expect( boxes.length ).toBe( 2 );
		// Same stacking context now, so the number decides - which is the
		// whole point of moving it out of the shell.
		const ours = boxes.find( ( b ) => 'studio' !== b.id );
		expect( Number( ours.style.zIndex ) ).toBeGreaterThan( 100 );
		act( () => root.unmount() );
	} );
} );
