import { useLayoutEffect, useRef, useState } from '@wordpress/element';
import { flushSync } from 'react-dom';
import { useEditorMaybe } from '../store/editor-context';
import { colorEditorFor } from '../lib/color-editor-session';

/** Callbacks stay current during local dialog drafts, Undo and layer edits. */
export function useColorEditor( value ) {
	const editor = useEditorMaybe();
	const binding = useRef( value );
	binding.current = value;
	const host = useRef( null );
	const [ open, setOpen ] = useState( false );
	useLayoutEffect( () => {
		if ( host.current?.request?.binding === binding ) {
			host.current.notify();
		}
	}, [ value.color, value.paint, value.layer, value.disabled ] );
	useLayoutEffect(
		() => () => {
			if ( host.current?.request?.binding === binding ) {
				host.current.beforeChange?.();
				host.current.clear();
			}
		},
		[]
	);
	useLayoutEffect( () => {
		if ( ! host.current ) {
			return undefined;
		}
		return host.current.subscribe( () =>
			setOpen( host.current.request?.binding === binding )
		);
	}, [ open ] );
	return {
		open,
		show( anchor, options = {} ) {
			binding.current = { ...binding.current, ...options };
			const session = colorEditorFor( anchor, editor?.dispatch );
			if ( ! session ) {
				return false;
			}
			host.current = session;
			flushSync( () => {
				session.open( binding, anchor );
				if ( ! session.request?.nested ) {
					session.dispatch( {
						type: 'TOGGLE_COLOR_PANEL',
						show: true,
						mode: session.request?.mode,
						fromSwatch: true,
						preserveTab: !! anchor.closest?.(
							'.modal-backdrop, [role="dialog"][aria-modal="true"]:not(.ed-float-panel)'
						),
					} );
				}
				setOpen( true );
			} );
			return true;
		},
	};
}
