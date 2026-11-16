/** Shared Easy navigation keeps the rail and the right panel in sync. */
import { useCallback, useEffect, useRef, useState } from '@wordpress/element';

const START = { area: 'start', section: 'basics' };

export function useEasyNavigation( editor, enabled ) {
	const [ location, setLocation ] = useState( START );
	const { activeId, tool } = editor.state;
	const previous = useRef( { enabled: false, activeId } );
	const navigate = useCallback( ( area, section = 'basics' ) => {
		if ( [ 'start', 'edit', 'elements', 'creative' ].includes( area ) ) {
			setLocation( { area, section } );
		}
	}, [] );
	useEffect( () => {
		if ( ! enabled ) {
			return;
		}
		const open = ( event ) =>
			navigate( event.detail?.area, event.detail?.section );
		window.addEventListener( 'wpie:easy-area', open );
		return () => window.removeEventListener( 'wpie:easy-area', open );
	}, [ enabled, navigate ] );
	useEffect( () => {
		const before = previous.current;
		previous.current = { enabled, activeId };
		if ( ! enabled ) {
			return;
		}
		if ( ! before.enabled ) {
			setLocation( START );
		} else if ( before.activeId !== activeId ) {
			// Browsing the element list must not dismiss it after every selection.
			setLocation( ( current ) =>
				current.area === 'elements'
					? current
					: {
							area:
								activeId ||
								[
									'brush',
									'pencil',
									'eraser',
									'crop',
								].includes( tool )
									? 'edit'
									: 'start',
							section: 'basics',
					  }
			);
		}
	}, [ enabled, activeId, tool ] );
	return { ...location, navigate };
}

export function openEasySection( editor, extras, section, area = 'edit' ) {
	extras?.richText?.current?.commit?.();
	editor.dispatch( { type: 'SET_TOOL', tool: 'move' } );
	openEasyArea( area, section );
}

export function openEasyArea( area = 'edit', section = 'basics' ) {
	window.dispatchEvent(
		new CustomEvent( 'wpie:easy-area', { detail: { area, section } } )
	);
}

export function activateEasyTool( editor, tool, extras ) {
	extras?.richText?.current?.commit?.();
	if ( tool === 'text' ) {
		window.dispatchEvent( new CustomEvent( 'wpie-insert-text' ) );
	} else {
		editor.dispatch( { type: 'SET_TOOL', tool } );
	}
	// Also works when the same tool is clicked again: its settings reopen.
	openEasyArea();
}
