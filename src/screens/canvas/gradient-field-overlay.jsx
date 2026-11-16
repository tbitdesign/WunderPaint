/** Color points and real mesh tangent handles in the existing canvas overlay. */
import { useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { gradientPaint, gradientPoint } from '../../lib/gradient-layer';
import { clampGradient as clamp } from '../../lib/gradient-ramp';
import { meshPatchPoint, prepareGradientMesh } from '../../lib/gradient-fields';
import { setGradientEditing } from '../../lib/gradient-render-state';
import { ancestorHidden, ancestorLocked } from './tool-handlers';

export function GradientFieldOverlay( {
	editor,
	layer,
	zoom,
	pan,
	selectedStop,
	onSelectStop,
} ) {
	const drag = useRef( null );
	useEffect(
		() => () => setGradientEditing( layer.id, false ),
		[ layer.id ]
	);
	if (
		! layer.visible ||
		layer.locked ||
		ancestorHidden( editor.state.layers, layer ) ||
		ancestorLocked( editor.state.layers, layer )
	) {
		return null;
	}
	const mesh = layer.kind === 'mesh',
		key = mesh ? 'mesh' : 'freeform',
		itemsKey = mesh ? 'nodes' : 'points';
	const field = gradientPaint( layer )[ key ],
		items = field[ itemsKey ];
	const index = Math.max( 0, Math.min( items.length - 1, selectedStop ) );
	const screen = ( p ) => {
		const q = gradientPoint( layer, {
			x: layer.x + p.x * layer.w,
			y: layer.y + p.y * layer.h,
		} );
		return { x: pan.x + q.x * zoom, y: pan.y + q.y * zoom };
	};
	const local = ( e ) => {
		const rect = e.currentTarget.ownerSVGElement.getBoundingClientRect();
		const p = gradientPoint(
			layer,
			{
				x: ( e.clientX - rect.left - pan.x ) / zoom,
				y: ( e.clientY - rect.top - pan.y ) / zoom,
			},
			true
		);
		return {
			x: ( p.x - layer.x ) / layer.w,
			y: ( p.y - layer.y ) / layer.h,
		};
	};
	const write = ( next, done = false ) => {
		const current = editor.state.layers.find( ( l ) => l.id === layer.id );
		if (
			! current ||
			current.locked ||
			ancestorLocked( editor.state.layers, current )
		) {
			return;
		}
		editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { [ key ]: next },
		} );
		if ( done ) {
			editor.commit( __( 'Edit gradient', 'wunderpaint' ) );
		}
	};
	const start = ( e, i, tangent, sign = 1 ) => {
		if ( e.button !== 0 ) {
			return;
		}
		e.stopPropagation();
		e.preventDefault();
		onSelectStop( i );
		drag.current = {
			index: i,
			tangent,
			sign,
			start: local( e ),
			base: field,
			changed: false,
		};
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const move = ( e ) => {
		const d = drag.current;
		if ( ! d ) {
			return;
		}
		e.stopPropagation();
		e.preventDefault();
		const p = local( e ),
			base = d.base[ itemsKey ][ d.index ];
		const dx = p.x - d.start.x,
			dy = p.y - d.start.y;
		if (
			Math.hypot( dx * layer.w, dy * layer.h ) * zoom < 0.5 &&
			! d.changed
		) {
			return;
		}
		const next = d.tangent
			? {
					...base,
					[ d.tangent ]: {
						x: clamp(
							base[ d.tangent ].x + dx * 3 * d.sign,
							-2,
							2
						),
						y: clamp(
							base[ d.tangent ].y + dy * 3 * d.sign,
							-2,
							2
						),
					},
			  }
			: { ...base, x: clamp( base.x + dx ), y: clamp( base.y + dy ) };
		setGradientEditing( layer.id, true );
		write( {
			...d.base,
			[ itemsKey ]: d.base[ itemsKey ].map( ( item, i ) =>
				i === d.index ? next : item
			),
		} );
		d.changed = true;
	};
	const end = ( e ) => {
		e.stopPropagation();
		const changed = drag.current?.changed;
		drag.current = null;
		setGradientEditing( layer.id, false );
		if ( changed ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {},
			} );
			editor.commit( __( 'Edit gradient', 'wunderpaint' ) );
		}
	};
	const keys = ( e, i, tangent, sign = 1 ) => {
		if (
			! [
				'ArrowLeft',
				'ArrowRight',
				'ArrowUp',
				'ArrowDown',
				'Delete',
				'Backspace',
			].includes( e.key )
		) {
			return;
		}
		e.stopPropagation();
		e.preventDefault();
		if ( e.key === 'Delete' || e.key === 'Backspace' ) {
			if ( ! mesh && items.length > 2 ) {
				write(
					{ ...field, points: items.filter( ( _, n ) => n !== i ) },
					true
				);
				onSelectStop( Math.max( 0, i - 1 ) );
			}
			return;
		}
		const direction = [ 'ArrowLeft', 'ArrowUp' ].includes( e.key ) ? -1 : 1;
		const axis = [ 'ArrowLeft', 'ArrowRight' ].includes( e.key )
			? 'x'
			: 'y';
		const delta =
			( ( e.shiftKey ? 10 : 1 ) * direction ) /
			( axis === 'x' ? layer.w : layer.h );
		const item = items[ i ],
			next = tangent
				? {
						...item,
						[ tangent ]: {
							...item[ tangent ],
							[ axis ]: clamp(
								item[ tangent ][ axis ] + delta * 3 * sign,
								-2,
								2
							),
						},
				  }
				: { ...item, [ axis ]: clamp( item[ axis ] + delta ) };
		write(
			{
				...field,
				[ itemsKey ]: items.map( ( n, j ) => ( j === i ? next : n ) ),
			},
			true
		);
	};
	const handlers = ( i, tangent, sign ) => ( {
		onPointerDown: ( e ) => start( e, i, tangent, sign ),
		onPointerMove: move,
		onPointerUp: end,
		onPointerCancel: end,
		onLostPointerCapture: end,
		onKeyDown: ( e ) => keys( e, i, tangent, sign ),
		onFocus: () => onSelectStop( i ),
		onDoubleClick: ( e ) => e.stopPropagation(),
	} );
	const lines = [];
	if ( mesh ) {
		const prepared = prepareGradientMesh( field );
		for ( let row = 0; row < field.rows - 1; row++ ) {
			for ( let col = 0; col < field.cols - 1; col++ ) {
				for ( const edge of [
					'top',
					'left',
					...( row === field.rows - 2 ? [ 'bottom' ] : [] ),
					...( col === field.cols - 2 ? [ 'right' ] : [] ),
				] ) {
					const path = [];
					for ( let step = 0; step <= 24; step++ ) {
						const t = step / 24;
						const p = screen(
							meshPatchPoint(
								prepared,
								row,
								col,
								edge === 'left' ? 0 : edge === 'right' ? 1 : t,
								edge === 'top' ? 0 : edge === 'bottom' ? 1 : t
							)
						);
						path.push( `${ step ? 'L' : 'M' }${ p.x },${ p.y }` );
					}
					lines.push(
						<path
							key={ `${ row }-${ col }-${ edge }` }
							d={ path.join( ' ' ) }
						/>
					);
				}
			}
		}
	}
	const selected = items[ index ],
		origin = screen( selected );
	return (
		<svg
			className="gp-overlay gp-field-overlay"
			width="100%"
			height="100%"
			style={ { position: 'absolute', inset: 0, overflow: 'visible' } }
		>
			<g fill="none" stroke="#000" strokeOpacity=".5" strokeWidth="3">
				{ lines }
			</g>
			<g fill="none" stroke="#fff" strokeOpacity=".85" strokeWidth="1">
				{ lines }
			</g>
			{ mesh &&
				[ 'u', 'v' ].flatMap( ( tangent ) =>
					[ -1, 1 ].map( ( sign ) => {
						const p = screen( {
							x:
								selected.x +
								( selected[ tangent ].x * sign ) / 3,
							y:
								selected.y +
								( selected[ tangent ].y * sign ) / 3,
						} );
						return (
							<g key={ `${ tangent }-${ sign }` }>
								<line
									x1={ origin.x }
									y1={ origin.y }
									x2={ p.x }
									y2={ p.y }
									stroke="#fff"
									strokeWidth="2"
								/>
								<circle
									cx={ p.x }
									cy={ p.y }
									r="5"
									fill="#fff"
									stroke="#222"
									strokeWidth="1.5"
									role="slider"
									tabIndex="0"
									aria-label={
										tangent === 'u'
											? __(
													'Horizontal mesh handle',
													'wunderpaint'
											  )
											: __(
													'Vertical mesh handle',
													'wunderpaint'
											  )
									}
									aria-valuemin={ -200 }
									aria-valuemax={ 200 }
									aria-valuenow={ Math.round(
										selected[ tangent ].x * 100
									) }
									{ ...handlers( index, tangent, sign ) }
								/>
							</g>
						);
					} )
				) }
			{ items.map( ( point, i ) => {
				const p = screen( point );
				return (
					<g key={ i }>
						<circle
							cx={ p.x }
							cy={ p.y }
							r={ i === index ? 10 : 8 }
							fill="none"
							stroke="#222"
							strokeWidth="3"
						/>
						<circle
							cx={ p.x }
							cy={ p.y }
							r={ i === index ? 9 : 7 }
							fill={ point.color }
							stroke="#fff"
							strokeWidth={ i === index ? 3 : 2 }
							role="slider"
							tabIndex="0"
							aria-label={ sprintf(
								/* translators: %d: point number. */ __(
									'Color point %d',
									'wunderpaint'
								),
								i + 1
							) }
							aria-valuemin={ 0 }
							aria-valuemax={ 100 }
							aria-valuenow={ Math.round( point.x * 100 ) }
							aria-valuetext={ `${ Math.round(
								point.x * 100
							) }%, ${ Math.round( point.y * 100 ) }%` }
							{ ...handlers( i ) }
						/>
					</g>
				);
			} ) }
		</svg>
	);
}
