/** Delayed canvas-only previews shared by effect catalogs, warp tiles and menus. */
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { useEscape } from '../../components/use-escape';

export function useEffectPreview( editor, layer, patchFor, { onEscape } = {} ) {
	const { state, dispatch } = editor;
	const owner = 'effects:' + useId();
	const live = useRef();
	live.current = { state, layer, patchFor };
	const target = useRef( null );
	const timer = useRef( null );
	const [ engaged, setEngaged ] = useState( false );
	const stop = useCallback(
		( element ) => {
			// A disappearing card must not cancel a newer card's preview.
			if ( element && element !== target.current ) {
				return;
			}
			clearTimeout( timer.current );
			timer.current = null;
			target.current = null;
			setEngaged( false );
			dispatch( { type: 'CLEAR_COLOR_PREVIEW', owner } );
		},
		[ dispatch, owner ]
	);
	const start = useCallback(
		( item, element ) => {
			stop();
			const base = live.current;
			if (
				! base.layer ||
				base.layer.type === 'adjustment' ||
				base.state.activeId !== base.layer.id
			) {
				return;
			}
			target.current = element;
			setEngaged( true );
			timer.current = setTimeout( () => {
				timer.current = null;
				const current = live.current;
				if (
					! element.isConnected ||
					! element.getClientRects().length ||
					current.state.layers !== base.state.layers ||
					current.state.doc !== base.state.doc ||
					current.state.activeId !== base.state.activeId ||
					current.state.selectedIds !== base.state.selectedIds ||
					current.state.tool !== base.state.tool ||
					current.state.history !== base.state.history
				) {
					stop();
					return;
				}
				const patch = current.patchFor( item, current.layer );
				if ( ! patch ) {
					stop();
					return;
				}
				dispatch( {
					type: 'SET_COLOR_PREVIEW',
					scope: 'effects',
					owner,
					baseLayers: base.state.layers,
					baseDoc: base.state.doc,
					baseState: base.state,
					patches: new Map( [ [ base.layer.id, patch ] ] ),
				} );
			}, 200 );
		},
		[ dispatch, owner, stop ]
	);

	// Pending timers also belong to the original document and selection.
	useEffect(
		() => () => stop(),
		[
			stop,
			layer?.id,
			state.layers,
			state.doc,
			state.activeId,
			state.selectedIds,
			state.tool,
			state.history,
			state.rightTab,
		]
	);
	useEscape( () => {
		stop();
		onEscape?.();
	}, engaged );
	useEffect( () => {
		if ( ! engaged ) {
			return undefined;
		}
		const cancel = () => stop();
		const onKey = ( event ) => {
			// Tab moves the preview to the next tile. All other commands first
			// return to the document, including typing into an active text edit.
			if ( event.key !== 'Tab' && event.key !== 'Escape' ) {
				cancel();
			}
		};
		window.addEventListener( 'blur', cancel );
		document.addEventListener( 'visibilitychange', cancel );
		document.addEventListener( 'pointerdown', cancel, true );
		document.addEventListener( 'scroll', cancel, true );
		document.addEventListener( 'keydown', onKey, true );
		document.addEventListener( 'beforeinput', cancel, true );
		return () => {
			window.removeEventListener( 'blur', cancel );
			document.removeEventListener( 'visibilitychange', cancel );
			document.removeEventListener( 'pointerdown', cancel, true );
			document.removeEventListener( 'scroll', cancel, true );
			document.removeEventListener( 'keydown', onKey, true );
			document.removeEventListener( 'beforeinput', cancel, true );
		};
	}, [ engaged, stop ] );

	return useMemo(
		() => ( {
			stop,
			forItem: ( item ) => ( {
				onPointerEnter: ( event ) => {
					if ( event.pointerType !== 'touch' && ! event.buttons ) {
						start( item, event.currentTarget );
					}
				},
				onPointerLeave: ( event ) => stop( event.currentTarget ),
				onPointerCancel: ( event ) => stop( event.currentTarget ),
				onFocus: ( event ) => {
					if ( event.currentTarget.matches( ':focus-visible' ) ) {
						start( item, event.currentTarget );
					}
				},
				onBlur: ( event ) => stop( event.currentTarget ),
				onPointerDown: () => stop(),
			} ),
		} ),
		[ start, stop ]
	);
}
