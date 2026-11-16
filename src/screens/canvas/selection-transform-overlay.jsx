import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { selectionBounds } from '../../store/selection';
import {
	selectionFrame,
	transformSelection,
	resizeSelectionFrame,
} from '../../store/selection-geometry';
import { docToScreen } from './use-viewport';

const HANDLES = [ 'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w' ];

export function SelectionSizeBadge( { box, zoom, pan, areaRef } ) {
	if ( ! box || ! box.w || ! box.h ) {
		return null;
	}
	const at = docToScreen( { x: box.x + box.w, y: box.y + box.h }, pan, zoom );
	const area = areaRef?.current;
	return (
		<div
			className="sel-size selection-size"
			style={ {
				left: Math.max(
					8,
					Math.min( at.x + 12, ( area?.clientWidth || 10000 ) - 145 )
				),
				top: Math.max(
					8,
					Math.min( at.y + 12, ( area?.clientHeight || 10000 ) - 32 )
				),
			} }
		>
			{ Math.round( box.w ) } × { Math.round( box.h ) } px
		</div>
	);
}

export function DraftSizeBadge( { draft, ...props } ) {
	const box =
		draft?.kind === 'marquee'
			? draft.rect
			: draft?.kind === 'shape'
			? draft.layer
			: [ 'lasso', 'lassoPoly' ].includes( draft?.kind ) &&
			  draft.points.length > 1
			? selectionBounds( {
					kind: 'poly',
					points: [
						...draft.points,
						...( draft.cursor ? [ draft.cursor ] : [] ),
					],
			  } )
			: null;
	return <SelectionSizeBadge box={ box } { ...props } />;
}

/** Selection-only handles; a gesture commits once, Escape restores the original. */
export function SelectionTransformOverlay( { editor, zoom, pan, areaRef } ) {
	const gesture = useRef( null );
	useEffect( () => () => gesture.current?.finish( false ), [] );
	const { selection, doc } = editor.state;
	const box = selectionFrame( selection, doc );
	if ( ! box?.w || ! box?.h ) {
		return null;
	}
	const screen = docToScreen( box, pan, zoom );
	const start = ( e ) => {
		if ( e.button !== 0 || gesture.current ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.focus();
		const live = editor.live || editor;
		const original = live.state.selection;
		const from = selectionFrame( original, doc );
		const handle = e.target.dataset.handle || 'move';
		const x = e.clientX,
			y = e.clientY,
			id = e.pointerId;
		let last = original;
		const move = ( event ) => {
			if ( event.pointerId !== id ) {
				return;
			}
			if ( live.state.doc !== doc || live.state.selection !== last ) {
				finish( false );
				return;
			}
			event.preventDefault();
			const to = resizeSelectionFrame(
				from,
				handle,
				( event.clientX - x ) / zoom,
				( event.clientY - y ) / zoom,
				event.shiftKey
			);
			last = [ 'x', 'y', 'w', 'h' ].every(
				( key ) => from[ key ] === to[ key ]
			)
				? original
				: transformSelection( original, from, to, doc );
			live.dispatch( { type: 'SET_SELECTION', selection: last } );
		};
		const finish = ( commit ) => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
			window.removeEventListener( 'pointercancel', cancel );
			window.removeEventListener( 'blur', blur );
			window.removeEventListener( 'keydown', key, true );
			gesture.current = null;
			if ( live.state.doc !== doc || live.state.selection !== last ) {
				return;
			}
			if ( commit && last !== original ) {
				live.commit( __( 'Transform selection', 'wunderpaint' ) );
			} else if ( ! commit ) {
				live.dispatch( { type: 'SET_SELECTION', selection: original } );
			}
		};
		const up = ( event ) => {
			if ( event.pointerId === id ) {
				finish( true );
			}
		};
		const cancel = ( event ) => {
			if ( event.pointerId === id ) {
				finish( false );
			}
		};
		const blur = () => finish( false );
		const key = ( event ) => {
			if ( event.key === 'Escape' ) {
				event.preventDefault();
				event.stopPropagation();
				finish( false );
			}
		};
		gesture.current = { finish };
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
		window.addEventListener( 'pointercancel', cancel );
		window.addEventListener( 'blur', blur );
		window.addEventListener( 'keydown', key, true );
	};
	return (
		<>
			{ /* A two-dimensional canvas widget: arrows move it; the panel supplies keyboard-accessible size fields. */ }
			{ /* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions */ }
			<div
				className="layer-selection selection-transform"
				role="application"
				aria-label={ __( 'Transform selection', 'wunderpaint' ) }
				tabIndex="0"
				style={ {
					left: screen.x,
					top: screen.y,
					width: box.w * zoom,
					height: box.h * zoom,
				} }
				onPointerDown={ start }
				onKeyDown={ ( e ) => {
					const directions = {
						ArrowLeft: [ -1, 0 ],
						ArrowRight: [ 1, 0 ],
						ArrowUp: [ 0, -1 ],
						ArrowDown: [ 0, 1 ],
					};
					const d = directions[ e.key ];
					if ( ! d || gesture.current ) {
						return;
					}
					e.preventDefault();
					e.stopPropagation();
					const n = e.shiftKey ? 10 : 1;
					editor.dispatch( {
						type: 'SET_SELECTION',
						selection: transformSelection(
							selection,
							box,
							{
								...box,
								x: box.x + d[ 0 ] * n,
								y: box.y + d[ 1 ] * n,
							},
							doc
						),
					} );
					editor.commit( __( 'Transform selection', 'wunderpaint' ) );
				} }
			>
				{ HANDLES.map( ( handle ) => (
					<span
						key={ handle }
						className={ `layer-handle ${ handle }` }
						data-handle={ handle }
					/>
				) ) }
			</div>
			<SelectionSizeBadge
				box={ box }
				zoom={ zoom }
				pan={ pan }
				areaRef={ areaRef }
			/>
		</>
	);
}
