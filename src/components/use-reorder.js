/**
 * Pointer reordering for short lists (v1.432.0, Color Schemer: the palette
 * slots and the saved palettes). Plain pointer events instead of HTML5
 * drag and drop: nothing leaves the list, and the editor's own drop zones
 * (canvas, layers, media) never see a drag that was only a reorder.
 *
 * A press becomes a drag after a few pixels, so a click on the same item
 * keeps its own meaning; `wasDrag()` tells the item's click handler to
 * stand down right after a drag. Items carry `data-reorder-index`; the
 * caller draws the gap marker from `drag.over` (the insertion index) and
 * gets `onMove( from, to )` with `to` as the final index.
 */

import { useEffect, useRef, useState } from '@wordpress/element';

const THRESHOLD = 5;

export function useReorder( { axis = 'y', onMove } ) {
	const [ drag, setDrag ] = useState( null );
	const live = useRef( null );
	const dragged = useRef( false );
	const moveRef = useRef( onMove );
	moveRef.current = onMove;

	const stop = () => {
		const d = live.current;
		live.current = null;
		if ( ! d ) {
			return;
		}
		window.removeEventListener( 'pointermove', d.move );
		window.removeEventListener( 'pointerup', d.up );
		window.removeEventListener( 'pointercancel', d.cancel );
		window.removeEventListener( 'keydown', d.key, true );
		setDrag( null );
	};

	useEffect( () => stop, [] );

	const start = ( index, event ) => {
		if ( event.button !== 0 || live.current ) {
			return;
		}
		const list = event.currentTarget.closest( '[data-reorder-list]' );
		if ( ! list ) {
			return;
		}
		dragged.current = false;
		const origin = axis === 'x' ? event.clientX : event.clientY;
		const d = { index, origin, list, active: false, over: index };
		d.move = ( e ) => {
			const pos = axis === 'x' ? e.clientX : e.clientY;
			if ( ! d.active && Math.abs( pos - d.origin ) < THRESHOLD ) {
				return;
			}
			d.active = true;
			const items = [
				...d.list.querySelectorAll( '[data-reorder-index]' ),
			];
			let over = items.length;
			for ( const item of items ) {
				const r = item.getBoundingClientRect();
				const mid =
					axis === 'x' ? r.left + r.width / 2 : r.top + r.height / 2;
				if ( pos < mid ) {
					over = +item.dataset.reorderIndex;
					break;
				}
			}
			d.over = over;
			setDrag( { from: d.index, over } );
		};
		d.up = () => {
			const { active, index: from, over } = d;
			stop();
			if ( ! active ) {
				return;
			}
			dragged.current = true;
			// Suppress only the click that belongs to this very release.
			window.setTimeout( () => ( dragged.current = false ), 0 );
			const to = over > from ? over - 1 : over;
			if ( to !== from ) {
				moveRef.current?.( from, to );
			}
		};
		d.cancel = () => stop();
		d.key = ( e ) => {
			if ( e.key === 'Escape' && d.active ) {
				e.preventDefault();
				e.stopPropagation();
				stop();
			}
		};
		live.current = d;
		window.addEventListener( 'pointermove', d.move );
		window.addEventListener( 'pointerup', d.up );
		window.addEventListener( 'pointercancel', d.cancel );
		window.addEventListener( 'keydown', d.key, true );
	};

	return {
		drag,
		start,
		wasDrag: () => dragged.current,
	};
}
