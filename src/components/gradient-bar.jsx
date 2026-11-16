/** Shared gradient editor. Fills its container; the toolbar can set an explicit width. */
import { useState, useRef, useEffect, useMemo } from '@wordpress/element';
import { useColorEditor } from './use-color-editor';
import { __, sprintf } from '@wordpress/i18n';
import { ColorPopover, anchoredPopoverStyle } from './color-popover';
import {
	expandedGradientStops,
	insertGradientStop,
} from '../lib/gradient-ramp';

export function GradientBar( {
	stops,
	onChange,
	width = '100%',
	activeIndex,
	onSelect,
	onCommit,
	disabled = false,
} ) {
	const barRef = useRef( null ),
		[ localIndex, setLocalIndex ] = useState( null ),
		[ editing, setEditing ] = useState( null ),
		cleanup = useRef( null ),
		latest = useRef( null );
	latest.current = { stops, onChange, onCommit };
	const paint = useMemo( () => ( { stops } ), [ stops ] );
	const shared = useColorEditor( {
		paint,
		ramp: true,
		onChange: ( patch ) => onChange( patch.stops ),
		onCommit,
		disabled,
		title: __( 'Gradient', 'wunderpaint' ),
	} );
	useEffect( () => () => cleanup.current?.(), [] );
	const selected = activeIndex === undefined ? localIndex : activeIndex;
	const select = ( index ) => {
		setLocalIndex( index );
		onSelect?.( index );
	};
	const sorted = expandedGradientStops( stops );
	const css = `linear-gradient(90deg, ${ sorted
		.map( ( s ) => `${ s.color } ${ s.at * 100 }%` )
		.join( ', ' ) })`;
	const position = ( clientX ) => {
		const rect = barRef.current.getBoundingClientRect();
		return Math.max(
			0,
			Math.min( 1, ( clientX - rect.left ) / rect.width )
		);
	};
	const update = ( index, patch, done = false ) => {
		if ( disabled ) {
			return;
		}
		const current = latest.current;
		current.onChange(
			current.stops.map( ( s, i ) =>
				i === index ? { ...s, ...patch } : s
			)
		);
		if ( done ) {
			current.onCommit?.();
		}
	};
	const add = ( at ) => {
		if ( disabled ) {
			return;
		}
		onChange( insertGradientStop( stops, at ) );
		select( stops.length );
		onCommit?.();
	};
	const remove = ( index ) => {
		if ( disabled || stops.length <= 2 ) {
			return;
		}
		onChange( stops.filter( ( _, i ) => i !== index ) );
		select( Math.max( 0, index - 1 ) );
		setEditing( null );
		onCommit?.();
	};
	const recolor = ( index, target ) => {
		select( index );
		const host = target.closest( '.global-color-panel' );
		if ( host ) {
			host.querySelector( 'input[data-color-hex]' )?.focus();
			return;
		}
		if ( shared.show( target, { initialStop: index } ) ) {
			return;
		}
		setEditing( {
			index,
			style: anchoredPopoverStyle( target.getBoundingClientRect() ),
		} );
	};
	const drag = ( index, e ) => {
		e.stopPropagation();
		if ( disabled || e.button !== 0 ) {
			return;
		}
		e.preventDefault();
		select( index );
		cleanup.current?.();
		const move = ( event ) =>
			update( index, { at: position( event.clientX ) } );
		const end = () => {
			cleanup.current?.();
			latest.current.onCommit?.();
		};
		cleanup.current = () => {
			document.removeEventListener( 'mousemove', move );
			document.removeEventListener( 'mouseup', end );
			cleanup.current = null;
		};
		document.addEventListener( 'mousemove', move );
		document.addEventListener( 'mouseup', end );
	};
	return (
		<div
			className="gradient-editor"
			style={ { position: 'relative', width } }
		>
			<div
				ref={ barRef }
				className="gradient-bar"
				style={ { background: css } }
				role="button"
				tabIndex={ disabled ? -1 : 0 }
				aria-disabled={ disabled }
				aria-label={ __( 'Click to add a stop', 'wunderpaint' ) }
				title={ __( 'Click to add a stop', 'wunderpaint' ) }
				onMouseDown={ ( e ) => {
					if ( e.button === 0 ) {
						add( position( e.clientX ) );
					}
				} }
				onKeyDown={ ( e ) => {
					if ( e.target !== e.currentTarget ) {
						return;
					}
					if ( e.key === 'Enter' || e.key === ' ' ) {
						e.preventDefault();
						add( 0.5 );
					}
					if (
						[ 'Delete', 'Backspace' ].includes( e.key ) &&
						selected !== null
					) {
						e.preventDefault();
						remove( selected );
					}
				} }
			>
				{ stops.map( ( stop, i ) => (
					<div
						key={ i }
						className={ `gradient-stop${
							i === selected ? ' active' : ''
						}` }
						style={ {
							left: `${ stop.at * 100 }%`,
							background: stop.color,
						} }
						role="slider"
						tabIndex={ disabled ? -1 : 0 }
						aria-disabled={ disabled }
						aria-label={ sprintf(
							/* translators: %d: color stop number. */ __(
								'Color stop %d',
								'wunderpaint'
							),
							i + 1
						) }
						aria-valuemin={ 0 }
						aria-valuemax={ 100 }
						aria-valuenow={ Math.round( stop.at * 100 ) }
						title={ __(
							'Drag to move · double-click to recolor · right-click to remove',
							'wunderpaint'
						) }
						onFocus={ () => select( i ) }
						onMouseDown={ ( e ) => drag( i, e ) }
						onDoubleClick={ ( e ) => {
							e.stopPropagation();
							if ( ! disabled ) {
								recolor( i, e.currentTarget );
							}
						} }
						onContextMenu={ ( e ) => {
							e.preventDefault();
							e.stopPropagation();
							remove( i );
						} }
						onKeyDown={ ( e ) => {
							if ( disabled ) {
								return;
							}
							if (
								[
									'ArrowLeft',
									'ArrowRight',
									'ArrowUp',
									'ArrowDown',
									'Home',
									'End',
									'Delete',
									'Backspace',
									'Enter',
									' ',
								].includes( e.key )
							) {
								e.preventDefault();
								e.stopPropagation();
							}
							if ( [ 'Delete', 'Backspace' ].includes( e.key ) ) {
								remove( i );
							} else if ( e.key === 'Enter' || e.key === ' ' ) {
								recolor( i, e.currentTarget );
							} else if (
								[
									'ArrowLeft',
									'ArrowRight',
									'ArrowUp',
									'ArrowDown',
									'Home',
									'End',
								].includes( e.key )
							) {
								const delta =
									( e.shiftKey ? 0.1 : 0.01 ) *
									( [ 'ArrowLeft', 'ArrowDown' ].includes(
										e.key
									)
										? -1
										: 1 );
								update(
									i,
									{
										at:
											e.key === 'Home'
												? 0
												: e.key === 'End'
												? 1
												: Math.max(
														0,
														Math.min(
															1,
															stop.at + delta
														)
												  ),
									},
									true
								);
							}
						} }
					/>
				) ) }
			</div>
			{ editing && stops[ editing.index ] && ! disabled && (
				<ColorPopover
					color={ stops[ editing.index ].color }
					onChange={ ( color ) =>
						update( editing.index, { color }, true )
					}
					onClose={ () => setEditing( null ) }
					style={ editing.style }
				/>
			) }
		</div>
	);
}
