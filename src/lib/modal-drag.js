/**
 * Draggable editor modals (v1.264): every dialog header (.dsm-head) acts as
 * a drag handle for its dialog - the direct child of a .modal-backdrop.
 * One delegated listener covers all present and future dialogs, including
 * the ones extensions build themselves from the dsm family.
 *
 * Dragging switches the dialog to fixed positioning with explicit left/top
 * (NOT a transform: a transformed ancestor would become the containing
 * block for position:fixed descendants such as context menus). Double-click
 * on the header re-centers. A window resize clamps moved dialogs back in.
 */

const INTERACTIVE =
	'button, input, select, textarea, a, [contenteditable="true"], [role="button"]';

const MARGIN = 90; // px of the dialog that must stay reachable

function clampInto( dlg ) {
	const vw = window.innerWidth;
	const vh = window.innerHeight;
	const r = dlg.getBoundingClientRect();
	const left = Math.min(
		Math.max( parseFloat( dlg.style.left ) || r.left, MARGIN - r.width ),
		vw - MARGIN
	);
	const top = Math.min(
		Math.max( parseFloat( dlg.style.top ) || r.top, 0 ),
		Math.max( 0, vh - 48 )
	);
	dlg.style.left = left + 'px';
	dlg.style.top = top + 'px';
}

function resetDialog( dlg ) {
	dlg.style.position = '';
	dlg.style.left = '';
	dlg.style.top = '';
	dlg.style.margin = '';
	delete dlg.dataset.wpieDragged;
	dlg.parentElement.classList.remove( 'wpie-backdrop-clear' );
}

function dialogFor( target ) {
	const head = target && target.closest && target.closest( '.dsm-head' );
	if ( ! head || ( target.closest && target.closest( INTERACTIVE ) ) ) {
		return null;
	}
	const dlg = head.parentElement;
	if (
		! dlg ||
		! dlg.parentElement ||
		! dlg.parentElement.classList.contains( 'modal-backdrop' )
	) {
		return null;
	}
	return dlg;
}

export function installModalDrag( doc = document ) {
	if ( doc.__wpieModalDrag ) {
		return;
	}
	doc.__wpieModalDrag = true;

	// Dialogs close via their buttons only (v1.265): a click on the dim
	// backdrop no longer closes them - accidental clicks were throwing away
	// dialog state, and dragged-away dialogs let clicks reach the editor.
	// Capture phase kills both React onClick handlers and plain
	// backdrop.onclick wiring before they run.
	doc.addEventListener(
		'click',
		( e ) => {
			if (
				e.target &&
				e.target.classList &&
				e.target.classList.contains( 'modal-backdrop' )
			) {
				e.stopPropagation();
			}
		},
		true
	);

	doc.addEventListener( 'pointerdown', ( e ) => {
		if ( 0 !== e.button ) {
			return;
		}
		const dlg = dialogFor( e.target );
		if ( ! dlg ) {
			return;
		}
		const startX = e.clientX;
		const startY = e.clientY;
		const rect = dlg.getBoundingClientRect();
		let started = false;
		const move = ( ev ) => {
			const dx = ev.clientX - startX;
			const dy = ev.clientY - startY;
			if ( ! started ) {
				// A small threshold keeps plain clicks (focus, dblclick)
				// from turning into micro-drags.
				if ( Math.abs( dx ) < 3 && Math.abs( dy ) < 3 ) {
					return;
				}
				started = true;
				dlg.style.position = 'fixed';
				dlg.style.left = rect.left + 'px';
				dlg.style.top = rect.top + 'px';
				dlg.style.margin = '0';
				dlg.dataset.wpieDragged = '1';
				// Moving a dialog is about seeing the canvas behind it:
				// drop the backdrop dim while it is dragged away.
				dlg.parentElement.classList.add( 'wpie-backdrop-clear' );
				if ( doc.body ) {
					doc.body.classList.add( 'wpie-modal-dragging' );
				}
			}
			dlg.style.left = rect.left + dx + 'px';
			dlg.style.top = rect.top + dy + 'px';
			clampInto( dlg );
			ev.preventDefault();
		};
		const up = () => {
			doc.removeEventListener( 'pointermove', move );
			doc.removeEventListener( 'pointerup', up );
			if ( doc.body ) {
				doc.body.classList.remove( 'wpie-modal-dragging' );
			}
		};
		doc.addEventListener( 'pointermove', move );
		doc.addEventListener( 'pointerup', up );
	} );

	// Double-click on the header re-centers (drops the inline position).
	doc.addEventListener( 'dblclick', ( e ) => {
		const dlg = dialogFor( e.target );
		if ( dlg && dlg.dataset.wpieDragged ) {
			resetDialog( dlg );
		}
	} );

	// Keep moved dialogs reachable when the window shrinks.
	window.addEventListener( 'resize', () => {
		doc.querySelectorAll( '[data-wpie-dragged]' ).forEach( clampInto );
	} );
}
