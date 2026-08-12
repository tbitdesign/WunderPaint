/**
 * Editable multi-stop gradient bar (spec 04.2 / 06.2): drag stops, click the
 * bar to add one, double-click a stop to recolor, right-click/⌫ to remove.
 *
 * IT FILLS ITS CONTAINER. The default used to be 180 pixels, and every place
 * that mounted one guessed a number of its own - 150 here, 190 there, 230,
 * 176 - so the bar stopped short of the panel edge in some panels and pushed
 * a scrollbar out of others, and no guess could be right in two panels at
 * once because the panels are not the same width. A percentage is right in
 * all of them, and it stays right when the panel is resized.
 *
 * Pass a pixel number ONLY where there is no width to fill: a horizontal
 * toolbar row is sized by its contents, so a percentage there resolves
 * against nothing.
 */

import { useState, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { ColorPopover, anchoredPopoverStyle } from './color-popover';

/**
 * @param {Object}          props          Component props.
 * @param {Array}           props.stops    [ { color, at } ], `at` from 0 to 1.
 * @param {Function}        props.onChange Called with the new stop list.
 * @param {number|string}   props.width    CSS width. Leave it alone.
 * @return {Object} The bar element.
 */
export function GradientBar( { stops, onChange, width = '100%' } ) {
	const barRef = useRef( null );
	const [ activeIdx, setActiveIdx ] = useState( null );
	const [ editingIdx, setEditingIdx ] = useState( null );
	const dragRef = useRef( null );

	const sorted = [ ...stops ]
		.map( ( s, i ) => ( { ...s, _i: i } ) )
		.sort( ( a, b ) => a.at - b.at );
	const css = `linear-gradient(90deg, ${ sorted
		.map( ( s ) => `${ s.color } ${ s.at * 100 }%` )
		.join( ', ' ) })`;

	const atFromEvent = ( e ) => {
		const rect = barRef.current.getBoundingClientRect();
		return Math.min(
			1,
			Math.max( 0, ( e.clientX - rect.left ) / rect.width )
		);
	};

	const updateStop = ( index, patch ) => {
		onChange(
			stops.map( ( s, i ) => ( i === index ? { ...s, ...patch } : s ) )
		);
	};

	const addStop = ( e ) => {
		const at = atFromEvent( e );
		// Interpolate the color roughly by picking the nearest stop's color.
		const nearest = sorted.reduce(
			( best, s ) =>
				Math.abs( s.at - at ) < Math.abs( best.at - at ) ? s : best,
			sorted[ 0 ]
		);
		onChange( [ ...stops, { color: nearest?.color || '#000000', at } ] );
		setActiveIdx( stops.length );
	};

	const removeStop = ( index ) => {
		if ( stops.length <= 2 ) {
			return; // keep at least two stops
		}
		onChange( stops.filter( ( _, i ) => i !== index ) );
		setActiveIdx( null );
		setEditingIdx( null );
	};

	const onStopMouseDown = ( index, e ) => {
		e.stopPropagation();
		e.preventDefault();
		setActiveIdx( index );
		dragRef.current = index;
		const onMove = ( ev ) => {
			if ( null !== dragRef.current ) {
				updateStop( dragRef.current, { at: atFromEvent( ev ) } );
			}
		};
		const onUp = () => {
			dragRef.current = null;
			document.removeEventListener( 'mousemove', onMove );
			document.removeEventListener( 'mouseup', onUp );
		};
		document.addEventListener( 'mousemove', onMove );
		document.addEventListener( 'mouseup', onUp );
	};

	return (
		<div style={ { position: 'relative', width } }>
			<div
				ref={ barRef }
				className="gradient-bar"
				style={ { background: css } }
				role="button"
				tabIndex={ 0 }
				title={ __( 'Click to add a stop', 'wunderpaint' ) }
				onMouseDown={ addStop }
				onKeyDown={ ( e ) => {
					if (
						( 'Delete' === e.key || 'Backspace' === e.key ) &&
						null !== activeIdx
					) {
						removeStop( activeIdx );
					}
				} }
			>
				{ stops.map( ( stop, i ) => (
					<div
						key={ i }
						className={ `gradient-stop${
							i === activeIdx ? ' active' : ''
						}` }
						style={ {
							left: `${ stop.at * 100 }%`,
							background: stop.color,
						} }
						role="button"
						tabIndex={ 0 }
						title={ __(
							'Drag to move · double-click to recolor · right-click to remove',
							'wunderpaint'
						) }
						onMouseDown={ ( e ) => onStopMouseDown( i, e ) }
						onDoubleClick={ ( e ) => {
							e.stopPropagation();
							setEditingIdx( {
								i,
								style: anchoredPopoverStyle(
									e.currentTarget.getBoundingClientRect()
								),
							} );
						} }
						onContextMenu={ ( e ) => {
							e.preventDefault();
							removeStop( i );
						} }
					/>
				) ) }
			</div>
			{ null !== editingIdx && stops[ editingIdx.i ] && (
				<ColorPopover
					color={ stops[ editingIdx.i ].color }
					onChange={ ( c ) =>
						updateStop( editingIdx.i, { color: c } )
					}
					onClose={ () => setEditingIdx( null ) }
					style={ editingIdx.style }
				/>
			) }
		</div>
	);
}
