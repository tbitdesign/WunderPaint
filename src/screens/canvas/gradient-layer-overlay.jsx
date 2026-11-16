import { GradientFieldOverlay } from './gradient-field-overlay';
import { isGradientField } from '../../lib/gradient-fields';
import { setGradientEditing } from '../../lib/gradient-render-state';
/** Direct endpoint and color-stop editing for standalone gradient layers. */
import { useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { gradientPoint } from '../../lib/gradient-layer';
import { ancestorHidden, ancestorLocked } from './tool-handlers';

export function GradientLayerOverlay( props ) {
	return isGradientField( props.layer.kind ) ? (
		<GradientFieldOverlay { ...props } />
	) : (
		<GradientAxisOverlay { ...props } />
	);
}
function GradientAxisOverlay( {
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
	const screen = ( point ) => {
		const p = gradientPoint( layer, point );
		return { x: pan.x + p.x * zoom, y: pan.y + p.y * zoom };
	};
	const a = screen( layer.from ),
		b = screen( layer.to ),
		dx = b.x - a.x,
		dy = b.y - a.y,
		span = Math.max( 1, Math.hypot( dx, dy ) ),
		perp = { x: ( -dy / span ) * 18, y: ( dx / span ) * 18 };
	const stopPoint = ( stop ) => {
		if ( layer.kind === 'angle' ) {
			const r =
					Math.hypot(
						layer.to.x - layer.from.x,
						layer.to.y - layer.from.y
					) +
					18 / zoom,
				angle =
					Math.atan2(
						layer.to.y - layer.from.y,
						layer.to.x - layer.from.x
					) +
					stop.at * Math.PI * 2;
			return screen( {
				x: layer.from.x + Math.cos( angle ) * r,
				y: layer.from.y + Math.sin( angle ) * r,
			} );
		}
		return {
			x: a.x + dx * stop.at + perp.x,
			y: a.y + dy * stop.at + perp.y,
		};
	};
	const toStored = ( e, svg ) => {
		const rect = svg.getBoundingClientRect();
		return gradientPoint(
			layer,
			{
				x: ( e.clientX - rect.left - pan.x ) / zoom,
				y: ( e.clientY - rect.top - pan.y ) / zoom,
			},
			true
		);
	};
	const write = ( patch, done = false ) => {
		const current = editor.state.layers.find( ( l ) => l.id === layer.id );
		if (
			! current ||
			current.locked ||
			ancestorLocked( editor.state.layers, current )
		) {
			return;
		}
		if ( ! done && layer.spread && layer.spread !== 'pad' ) {
			setGradientEditing( layer.id, true );
		}
		editor.dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		if ( done ) {
			editor.commit( __( 'Edit gradient', 'wunderpaint' ) );
		}
	};
	const start = ( e, key, index = null ) => {
		if ( e.button !== 0 ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if ( index !== null ) {
			onSelectStop( index );
		}
		const svg = e.currentTarget.ownerSVGElement;
		drag.current = {
			key,
			index,
			base: layer,
			start: toStored( e, svg ),
			angleDelta: 0,
			lastAngle: null,
			changed: false,
		};
		e.currentTarget.setPointerCapture( e.pointerId );
	};
	const move = ( e ) => {
		if ( ! drag.current ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		const d = drag.current,
			p = toStored( e, e.currentTarget.ownerSVGElement ),
			vx = p.x - d.start.x,
			vy = p.y - d.start.y;
		if ( Math.hypot( vx, vy ) * zoom < 0.5 && ! d.changed ) {
			return;
		}
		if ( d.index === null ) {
			let point = {
				x: d.base[ d.key ].x + vx,
				y: d.base[ d.key ].y + vy,
			};
			if ( e.shiftKey ) {
				const fixed = d.base[ d.key === 'from' ? 'to' : 'from' ],
					angle =
						( Math.round(
							Math.atan2( point.y - fixed.y, point.x - fixed.x ) /
								( Math.PI / 4 )
						) *
							Math.PI ) /
						4,
					r = Math.hypot( point.x - fixed.x, point.y - fixed.y );
				point = {
					x: fixed.x + Math.cos( angle ) * r,
					y: fixed.y + Math.sin( angle ) * r,
				};
			}
			write( { [ d.key ]: point } );
		} else {
			const x = d.base.to.x - d.base.from.x,
				y = d.base.to.y - d.base.from.y;
			let at;
			if ( d.base.kind === 'angle' ) {
				const oldAngle = Math.atan2(
						d.start.y - d.base.from.y,
						d.start.x - d.base.from.x
					),
					newAngle = Math.atan2(
						p.y - d.base.from.y,
						p.x - d.base.from.x
					),
					delta = Math.atan2(
						Math.sin( newAngle - ( d.lastAngle ?? oldAngle ) ),
						Math.cos( newAngle - ( d.lastAngle ?? oldAngle ) )
					);
				d.angleDelta += delta;
				d.lastAngle = newAngle;
				at =
					d.base.stops[ d.index ].at + d.angleDelta / ( Math.PI * 2 );
			} else {
				at =
					d.base.stops[ d.index ].at +
					( vx * x + vy * y ) / Math.max( 1, x * x + y * y );
			}
			write( {
				stops: d.base.stops.map( ( s, i ) =>
					i === d.index
						? { ...s, at: Math.max( 0, Math.min( 1, at ) ) }
						: s
				),
			} );
		}
		d.changed = true;
	};
	const end = ( e ) => {
		e.stopPropagation();
		setGradientEditing( layer.id, false );
		if ( drag.current?.changed ) {
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {},
			} );
			editor.commit( __( 'Edit gradient', 'wunderpaint' ) );
		}
		drag.current = null;
	};
	const keys = ( e, key, index = null ) => {
		if (
			! [ 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown' ].includes(
				e.key
			)
		) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if ( index !== null ) {
			onSelectStop( index );
			const delta =
				( e.shiftKey ? 0.1 : 0.01 ) *
				( [ 'ArrowLeft', 'ArrowDown' ].includes( e.key ) ? -1 : 1 );
			write(
				{
					stops: layer.stops.map( ( s, i ) =>
						i === index
							? {
									...s,
									at: Math.max(
										0,
										Math.min( 1, s.at + delta )
									),
							  }
							: s
					),
				},
				true
			);
		} else {
			const amount = e.shiftKey ? 10 : 1,
				x =
					e.key === 'ArrowLeft'
						? -amount
						: e.key === 'ArrowRight'
						? amount
						: 0,
				y =
					e.key === 'ArrowUp'
						? -amount
						: e.key === 'ArrowDown'
						? amount
						: 0;
			write(
				{ [ key ]: { x: layer[ key ].x + x, y: layer[ key ].y + y } },
				true
			);
		}
	};
	return (
		<svg
			className="ed-overlay gp-overlay"
			width="100%"
			height="100%"
			aria-label={ __( 'Gradient handles', 'wunderpaint' ) }
		>
			<line
				x1={ a.x }
				y1={ a.y }
				x2={ b.x }
				y2={ b.y }
				stroke="#fff"
				strokeWidth="3"
			/>
			<line
				x1={ a.x }
				y1={ a.y }
				x2={ b.x }
				y2={ b.y }
				stroke="var(--accent)"
				strokeWidth="1.5"
			/>
			{ [
				[ 'from', a, __( 'Gradient start', 'wunderpaint' ) ],
				[ 'to', b, __( 'Gradient end', 'wunderpaint' ) ],
			].map( ( [ key, p, label ] ) => (
				<rect
					key={ key }
					x={ p.x - 6 }
					y={ p.y - 6 }
					width="12"
					height="12"
					rx="2"
					fill="#fff"
					stroke="var(--accent)"
					strokeWidth="2"
					role="slider"
					tabIndex="0"
					aria-label={ label }
					aria-valuetext={ `${ Math.round(
						layer[ key ].x
					) }, ${ Math.round( layer[ key ].y ) }` }
					aria-valuenow={ Math.round( layer[ key ].x ) }
					onPointerDown={ ( e ) => start( e, key ) }
					onPointerMove={ move }
					onPointerUp={ end }
					onPointerCancel={ end }
					onLostPointerCapture={ end }
					onKeyDown={ ( e ) => keys( e, key ) }
				>
					<title>{ label }</title>
				</rect>
			) ) }
			{ layer.stops.map( ( stop, i ) => {
				const p = stopPoint( stop ),
					seam = layer.kind === 'angle' && stop.at === 1 ? 16 : 0;
				return (
					<circle
						key={ i }
						cx={ p.x + ( perp.x / 18 ) * seam }
						cy={ p.y + ( perp.y / 18 ) * seam }
						r={ i === selectedStop ? 7 : 6 }
						fill={ stop.color }
						stroke={ i === selectedStop ? 'var(--accent)' : '#fff' }
						strokeWidth="2"
						role="slider"
						tabIndex="0"
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
						onFocus={ () => onSelectStop( i ) }
						onPointerDown={ ( e ) => start( e, 'stop', i ) }
						onPointerMove={ move }
						onPointerUp={ end }
						onPointerCancel={ end }
						onLostPointerCapture={ end }
						onKeyDown={ ( e ) => keys( e, 'stop', i ) }
					>
						<title>{ Math.round( stop.at * 100 ) }%</title>
					</circle>
				);
			} ) }
		</svg>
	);
}
