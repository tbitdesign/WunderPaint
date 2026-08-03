/**
 * Interactive Curves editor (v0.2): draggable control points on an SVG,
 * click the curve to add a point, double-click a point to remove it.
 * Values live in 0..255 space; interpolation matches the render kernel
 * (curvesLut) exactly, so the preview line IS the applied curve.
 */

import { useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { curvesLut } from '../lib/effects';

const W = 232;
const H = 160;

const toSvg = ( p ) => ( { x: ( p.x / 255 ) * W, y: H - ( p.y / 255 ) * H } );
const fromSvg = ( x, y ) => ( {
	x: Math.round( Math.min( 255, Math.max( 0, ( x / W ) * 255 ) ) ),
	y: Math.round( Math.min( 255, Math.max( 0, ( ( H - y ) / H ) * 255 ) ) ),
} );

export function CurveEditor( { points, onChange } ) {
	const svgRef = useRef( null );
	const [ dragIdx, setDragIdx ] = useState( null );

	const pts = points?.length
		? points
		: [
				{ x: 0, y: 0 },
				{ x: 255, y: 255 },
		  ];
	const lut = curvesLut( pts );
	const path = Array.from( { length: 64 }, ( _, i ) => {
		const x = Math.round( ( i / 63 ) * 255 );
		const p = toSvg( { x, y: lut[ x ] } );
		return `${ 0 === i ? 'M' : 'L' } ${ p.x.toFixed( 1 ) } ${ p.y.toFixed(
			1
		) }`;
	} ).join( ' ' );

	const localPoint = ( e ) => {
		const rect = svgRef.current.getBoundingClientRect();
		return { x: e.clientX - rect.left, y: e.clientY - rect.top };
	};

	const startDrag = ( idx ) => ( e ) => {
		e.stopPropagation();
		e.preventDefault();
		setDragIdx( idx );
		const onMove = ( ev ) => {
			const l = localPoint( ev );
			const value = fromSvg( l.x, l.y );
			const next = pts.map( ( p, i ) => {
				if ( i !== idx ) {
					return p;
				}
				// Endpoints stay pinned on their x; interior points cannot
				// cross their neighbors (keeps the curve a function).
				let x = value.x;
				if ( 0 === i ) {
					x = p.x;
				} else if ( i === pts.length - 1 ) {
					x = p.x;
				} else {
					x = Math.min(
						pts[ i + 1 ].x - 1,
						Math.max( pts[ i - 1 ].x + 1, x )
					);
				}
				return { x, y: value.y };
			} );
			onChange( next );
		};
		const onUp = () => {
			setDragIdx( null );
			document.removeEventListener( 'mousemove', onMove );
			document.removeEventListener( 'mouseup', onUp );
		};
		document.addEventListener( 'mousemove', onMove );
		document.addEventListener( 'mouseup', onUp );
	};

	const addPoint = ( e ) => {
		const l = localPoint( e );
		const value = fromSvg( l.x, l.y );
		if ( pts.some( ( p ) => Math.abs( p.x - value.x ) < 6 ) ) {
			return;
		}
		onChange( [ ...pts, value ].sort( ( a, b ) => a.x - b.x ) );
	};

	const removePoint = ( idx ) => ( e ) => {
		e.stopPropagation();
		e.preventDefault();
		if ( 0 === idx || idx === pts.length - 1 || pts.length <= 2 ) {
			return;
		}
		onChange( pts.filter( ( _, i ) => i !== idx ) );
	};

	return (
		<div>
			<svg
				ref={ svgRef }
				width={ W }
				height={ H }
				role="application"
				aria-label={ __( 'Tone curve', 'wunderpaint' ) }
				style={ {
					background: 'var(--ed-panel-alt)',
					border: '1px solid var(--ed-border-strong)',
					borderRadius: 3,
					cursor: 'copy',
					display: 'block',
				} }
				onMouseDown={ addPoint }
			>
				{ /* Grid quarters + diagonal reference. */ }
				{ [ 0.25, 0.5, 0.75 ].map( ( f ) => (
					<g key={ f } stroke="var(--ed-border)" strokeWidth="1">
						<line x1={ f * W } y1={ 0 } x2={ f * W } y2={ H } />
						<line x1={ 0 } y1={ f * H } x2={ W } y2={ f * H } />
					</g>
				) ) }
				<line
					x1={ 0 }
					y1={ H }
					x2={ W }
					y2={ 0 }
					stroke="var(--ed-border-strong)"
					strokeDasharray="3 3"
				/>
				<path
					d={ path }
					fill="none"
					stroke="var(--accent)"
					strokeWidth="2"
				/>
				{ pts.map( ( p, i ) => {
					const s = toSvg( p );
					return (
						<circle
							key={ i }
							cx={ s.x }
							cy={ s.y }
							r={ dragIdx === i ? 6 : 4.5 }
							fill="#fff"
							stroke="var(--accent)"
							strokeWidth="1.5"
							style={ { cursor: 'grab' } }
							onMouseDown={ startDrag( i ) }
							onDoubleClick={ removePoint( i ) }
						/>
					);
				} ) }
			</svg>
			<p
				style={ {
					fontSize: 10,
					color: 'var(--ed-text-muted)',
					margin: '4px 0 0',
				} }
			>
				{ __(
					'Click: add point · drag: move · double-click: remove',
					'wunderpaint'
				) }
			</p>
		</div>
	);
}
