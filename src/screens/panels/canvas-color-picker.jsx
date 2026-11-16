import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import {
	readCanvasProbe,
	readCanvasLine,
	PROBE_CENTER,
	PROBE_PIXELS,
} from '../../lib/canvas-color-probe';

/** Pixel loupe and sampling share a 15×15 document-pixel render. */
export function CanvasColorPicker( {
	doc,
	layers,
	size,
	pointOf,
	collecting,
	lineMode = false,
	viewport,
	onLine,
	onPick,
	onCancel,
	onError,
} ) {
	const canvasRef = useRef( null );
	const surfaceRef = useRef( null );
	const startedOutside = useRef( false );
	const latest = useRef( null );
	const busy = useRef( false );
	const sequence = useRef( 0 );
	const generation = useRef( 0 );
	const clicking = useRef( false );
	const drag = useRef( null );
	const lineAbort = useRef( null );
	const [ line, setLine ] = useState( null );
	const [ readingLine, setReadingLine ] = useState( false );
	const [ probe, setProbe ] = useState( null );
	useLayoutEffect(
		() => () => {
			sequence.current++;
			generation.current++;
			latest.current = null;
			lineAbort.current?.abort();
		},
		[ doc, layers, size ]
	);
	useEffect( () => {
		// Editing controls must invalidate a pending click and must never sample
		// a panel drag that happens to end over the canvas. A newly mounted picker
		// can still receive the release of the canvas click that activated it.
		const onDown = ( event ) => {
			startedOutside.current = ! surfaceRef.current?.contains(
				event.target
			);
			if ( startedOutside.current ) {
				generation.current++;
				sequence.current++;
				latest.current = null;
				setProbe( null );
			}
		};
		document.addEventListener( 'pointerdown', onDown, true );
		return () =>
			document.removeEventListener( 'pointerdown', onDown, true );
	}, [] );
	useEffect( () => {
		if ( ! probe || ! canvasRef.current ) {
			return;
		}
		const ctx = canvasRef.current.getContext( '2d' ),
			cell = 8;
		ctx.clearRect( 0, 0, 120, 120 );
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage( probe.canvas, 0, 0, 120, 120 );
		ctx.strokeStyle = 'rgba(127,127,127,.3)';
		ctx.lineWidth = 1;
		ctx.beginPath();
		for ( let i = 1; i < PROBE_PIXELS; i++ ) {
			ctx.moveTo( i * cell + 0.5, 0 );
			ctx.lineTo( i * cell + 0.5, 120 );
			ctx.moveTo( 0, i * cell + 0.5 );
			ctx.lineTo( 120, i * cell + 0.5 );
		}
		ctx.stroke();
		const edge = ( PROBE_CENTER - ( probe.size - 1 ) / 2 ) * cell;
		ctx.strokeStyle = '#000';
		ctx.lineWidth = 3;
		ctx.strokeRect( edge, edge, probe.size * cell, probe.size * cell );
		ctx.strokeStyle = '#fff';
		ctx.lineWidth = 1;
		ctx.strokeRect( edge, edge, probe.size * cell, probe.size * cell );
	}, [ probe ] );
	const drain = async () => {
		if ( busy.current ) {
			return;
		}
		busy.current = true;
		while ( latest.current ) {
			const request = latest.current;
			latest.current = null;
			try {
				const result = await readCanvasProbe(
					request.doc,
					request.layers,
					request.p,
					request.size
				);
				if ( request.token === sequence.current ) {
					setProbe(
						result
							? {
									...result,
									clientX: request.x,
									clientY: request.y,
							  }
							: null
					);
				}
			} catch ( error ) {
				if ( request.token === sequence.current ) {
					setProbe( null );
				}
			}
		}
		busy.current = false;
	};
	const boundedPoint = ( event ) => {
		const p = pointOf( event ).p;
		return {
			x: Math.max( 0, Math.min( doc.w - 1, p.x ) ),
			y: Math.max( 0, Math.min( doc.h - 1, p.y ) ),
		};
	};
	const move = ( e ) => {
		if ( lineMode && drag.current ) {
			setLine( { from: drag.current.from, to: boundedPoint( e ) } );
		}

		latest.current = {
			doc,
			layers,
			size,
			p: pointOf( e ).p,
			x: e.clientX,
			y: e.clientY,
			token: ++sequence.current,
		};
		drain();
	};
	const pick = async ( e ) => {
		if ( startedOutside.current ) {
			return;
		}
		e.preventDefault();
		e.stopPropagation();
		if ( e.button !== 0 || clicking.current ) {
			return;
		}
		clicking.current = true;
		const token = generation.current;
		sequence.current++;
		latest.current = null;
		try {
			if ( lineMode ) {
				const captured = drag.current;
				drag.current = null;
				if ( ! captured || captured.pointerId !== e.pointerId ) {
					return;
				}
				const controller = new AbortController();
				lineAbort.current = controller;
				setReadingLine( true );
				const colors = await readCanvasLine(
					doc,
					layers,
					captured.from,
					boundedPoint( e ),
					size,
					controller.signal
				);
				if (
					colors &&
					token === generation.current &&
					! controller.signal.aborted
				) {
					onLine( colors );
				}
				return;
			}
			const result = await readCanvasProbe(
				doc,
				layers,
				pointOf( e ).p,
				size
			);
			if ( result && token === generation.current ) {
				onPick( result );
			}
		} catch ( error ) {
			if ( token === generation.current ) {
				onError( error );
			}
		} finally {
			clicking.current = false;
			if ( token === generation.current ) {
				setReadingLine( false );
				setLine( null );
			}
		}
	};
	return (
		<div
			ref={ surfaceRef }
			className="color-panel-pick-surface"
			role="presentation"
			onPointerDown={ ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				const p = pointOf( e ).p;
				if (
					lineMode &&
					e.button === 0 &&
					! clicking.current &&
					p.x >= 0 &&
					p.y >= 0 &&
					p.x < doc.w &&
					p.y < doc.h
				) {
					drag.current = {
						from: boundedPoint( e ),
						pointerId: e.pointerId,
					};
					setLine( {
						from: drag.current.from,
						to: drag.current.from,
					} );
					e.currentTarget.setPointerCapture( e.pointerId );
				}
			} }
			onPointerCancel={ () => {
				drag.current = null;
				setLine( null );
				onCancel();
			} }
			onPointerEnter={ move }
			onPointerMove={ move }
			onPointerUp={ pick }
			onPointerLeave={ () => {
				sequence.current++;
				latest.current = null;
				setProbe( null );
			} }
			onContextMenu={ ( e ) => {
				e.preventDefault();
				e.stopPropagation();
				onCancel();
			} }
		>
			{ lineMode && line && viewport && (
				<svg className="color-sample-line" aria-hidden="true">
					<line
						x1={ viewport.pan.x + line.from.x * viewport.zoom }
						y1={ viewport.pan.y + line.from.y * viewport.zoom }
						x2={ viewport.pan.x + line.to.x * viewport.zoom }
						y2={ viewport.pan.y + line.to.y * viewport.zoom }
					/>
					<line
						x1={ viewport.pan.x + line.from.x * viewport.zoom }
						y1={ viewport.pan.y + line.from.y * viewport.zoom }
						x2={ viewport.pan.x + line.to.x * viewport.zoom }
						y2={ viewport.pan.y + line.to.y * viewport.zoom }
					/>
				</svg>
			) }
			{ probe && (
				<div
					className="color-pixel-loupe"
					aria-hidden="true"
					style={ {
						left: Math.max(
							4,
							Math.min(
								probe.clientX + 22,
								window.innerWidth - 144
							)
						),
						top: Math.max(
							4,
							Math.min(
								probe.clientY + 22,
								window.innerHeight - 188
							)
						),
					} }
				>
					<canvas ref={ canvasRef } width="120" height="120" />
					<div>
						<span
							style={ {
								background: probe.value.a
									? probe.color
									: 'transparent',
							} }
						/>
						{ probe.value.a
							? probe.color
							: __( 'Transparent', 'wunderpaint' ) }
					</div>
					<small>
						{ probe.point.x }, { probe.point.y } · { probe.size }×
						{ probe.size }
					</small>
				</div>
			) }
			<div className="color-panel-pick-hint">
				{ lineMode
					? readingLine
						? __( 'Sampling colors', 'wunderpaint' )
						: __(
								'Drag a line across the canvas. Esc cancels.',
								'wunderpaint'
						  )
					: collecting
					? __(
							'Click colors to collect them. Done or Esc finishes.',
							'wunderpaint'
					  )
					: __(
							'Click a color on the canvas. Esc cancels.',
							'wunderpaint'
					  ) }
			</div>
		</div>
	);
}
