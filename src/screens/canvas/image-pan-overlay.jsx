/**
 * Image reposition session (v1.116.0): double-clicking a cover/contain
 * image layer enters this overlay - dragging pans the picture inside
 * its box by adjusting imageFit.ax/ay continuously, the mouse wheel
 * zooms the picture inside the frame (cover), and a ghost of the FULL
 * source shows what lies outside the crop. Each drag commits once;
 * Enter, Escape or clicking outside the box ends the session.
 */

import { useEffect, useRef, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { fitRects } from '../../lib/image-fit';

export function ImagePanOverlay( {
	editor,
	layerId,
	zoom,
	pan,
	onDone,
	onEditText,
} ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === layerId );
	const drag = useRef( null ); // { startX, startY, ax, ay, moved }
	const wheelDirty = useRef( false );
	const [ , force ] = useState( 0 );

	const finish = () => {
		if ( wheelDirty.current ) {
			commit( __( 'Reposition image', 'wunderpaint' ) );
			wheelDirty.current = false;
		}
		onDone();
	};

	useEffect( () => {
		const onKey = ( e ) => {
			if ( 'Escape' === e.key || 'Enter' === e.key ) {
				e.stopPropagation();
				finish();
			}
		};
		window.addEventListener( 'keydown', onKey, true );
		return () => window.removeEventListener( 'keydown', onKey, true );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ onDone ] );

	if ( ! layer || 'image' !== layer.type ) {
		onDone();
		return null;
	}
	const fit = layer.imageFit || {};
	const mode = fit.mode || 'fill';
	const nw = layer.naturalW || 1;
	const nh = layer.naturalH || 1;
	const r = fitRects( nw, nh, layer.w, layer.h, fit );

	// When this picture is masked into a text frame (image dropped onto text),
	// its sibling in the frame group is that text. A second double-click drops
	// from moving the picture into editing that text (v1.179.0).
	const frameGroup = layer.parent
		? state.layers.find(
				( l ) => l.id === layer.parent && 'group' === l.type
		  )
		: null;
	const frameText =
		( frameGroup?.children || [] )
			.map( ( id ) => state.layers.find( ( l ) => l.id === id ) )
			.find( ( l ) => l && 'text' === l.type ) || null;

	// Screen-space geometry (the pan gesture ignores rotation handles;
	// deltas are rotated back into the layer's local space below).
	const bx = pan.x + layer.x * zoom;
	const by = pan.y + layer.y * zoom;
	const bw = layer.w * zoom;
	const bh = layer.h * zoom;

	// Ghost rect of the FULL image in screen space.
	let ghost = null;
	if ( 'cover' === mode ) {
		const scale =
			Math.max( layer.w / nw, layer.h / nh ) *
			Math.max( 1, Number( fit.zoom ) || 1 );
		ghost = {
			left: bx - r.sx * scale * zoom,
			top: by - r.sy * scale * zoom,
			width: nw * scale * zoom,
			height: nh * scale * zoom,
		};
	} else if ( 'contain' === mode ) {
		ghost = {
			left: bx + r.dx * zoom,
			top: by + r.dy * zoom,
			width: r.dw * zoom,
			height: r.dh * zoom,
		};
	}

	const applyDelta = ( dxScreen, dyScreen, base ) => {
		// Back into unrotated layer space.
		const rot = ( ( layer.rot || 0 ) * Math.PI ) / 180;
		const dx =
			( dxScreen * Math.cos( -rot ) - dyScreen * Math.sin( -rot ) ) /
			zoom;
		const dy =
			( dxScreen * Math.sin( -rot ) + dyScreen * Math.cos( -rot ) ) /
			zoom;
		let { ax, ay } = base;
		if ( 'cover' === mode ) {
			const scale =
				Math.max( layer.w / nw, layer.h / nh ) *
				Math.max( 1, Number( fit.zoom ) || 1 );
			const overX = nw - layer.w / scale;
			const overY = nh - layer.h / scale;
			if ( overX > 1e-6 ) {
				ax = Math.min( 1, Math.max( 0, base.ax - dx / scale / overX ) );
			}
			if ( overY > 1e-6 ) {
				ay = Math.min( 1, Math.max( 0, base.ay - dy / scale / overY ) );
			}
		} else {
			const freeX = layer.w - r.dw;
			const freeY = layer.h - r.dh;
			if ( Math.abs( freeX ) > 1e-6 ) {
				ax = Math.min( 1, Math.max( 0, base.ax + dx / freeX ) );
			}
			if ( Math.abs( freeY ) > 1e-6 ) {
				ay = Math.min( 1, Math.max( 0, base.ay + dy / freeY ) );
			}
		}
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { imageFit: { ...fit, mode, ax, ay } },
		} );
	};

	const onPointerDown = ( e ) => {
		e.stopPropagation();
		// Outside the box ends the session.
		const inBox =
			e.clientX >= e.currentTarget.getBoundingClientRect().left + bx &&
			e.clientX <=
				e.currentTarget.getBoundingClientRect().left + bx + bw &&
			e.clientY >= e.currentTarget.getBoundingClientRect().top + by &&
			e.clientY <= e.currentTarget.getBoundingClientRect().top + by + bh;
		if ( ! inBox ) {
			finish();
			return;
		}
		drag.current = {
			startX: e.clientX,
			startY: e.clientY,
			ax: 'number' === typeof fit.ax ? fit.ax : 0.5,
			ay: 'number' === typeof fit.ay ? fit.ay : 0.5,
			moved: false,
		};
		e.currentTarget.setPointerCapture?.( e.pointerId );
	};
	const onPointerMove = ( e ) => {
		if ( ! drag.current ) {
			return;
		}
		drag.current.moved = true;
		applyDelta(
			e.clientX - drag.current.startX,
			e.clientY - drag.current.startY,
			drag.current
		);
		force( ( n ) => n + 1 );
	};
	const onPointerUp = () => {
		if ( drag.current?.moved ) {
			commit( __( 'Reposition image', 'wunderpaint' ) );
		}
		drag.current = null;
	};

	return (
		<div
			style={ {
				position: 'absolute',
				inset: 0,
				zIndex: 40,
				cursor: 'grab',
				overflow: 'hidden',
			} }
			onPointerDown={ onPointerDown }
			onPointerMove={ onPointerMove }
			onPointerUp={ onPointerUp }
			onDoubleClick={ ( e ) => {
				e.stopPropagation();
				finish();
				// Masked text: hand off from the picture to editing the
				// text it fills, so repeated double-clicks step inward.
				if ( frameText && onEditText ) {
					onEditText( frameText.id );
				}
			} }
			onWheel={ ( e ) => {
				if ( 'cover' !== mode ) {
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				const cur = Math.max( 1, Number( fit.zoom ) || 1 );
				const next = Math.min(
					4,
					Math.max( 1, cur * ( e.deltaY < 0 ? 1.06 : 1 / 1.06 ) )
				);
				if ( Math.abs( next - cur ) < 0.001 ) {
					return;
				}
				wheelDirty.current = true;
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { imageFit: { ...fit, mode, zoom: next } },
				} );
				force( ( n ) => n + 1 );
			} }
		>
			{ ghost && (
				<img
					src={ layer.src }
					alt=""
					draggable={ false }
					style={ {
						position: 'absolute',
						...ghost,
						opacity: 0.35,
						pointerEvents: 'none',
						transform: layer.rot
							? `rotate(${ layer.rot }deg)`
							: undefined,
						transformOrigin: `${ bx + bw / 2 - ghost.left }px ${
							by + bh / 2 - ghost.top
						}px`,
					} }
				/>
			) }
			<div
				style={ {
					position: 'absolute',
					left: bx,
					top: by,
					width: bw,
					height: bh,
					border: '2px solid var(--accent)',
					boxShadow: '0 0 0 9999px rgba(13, 15, 20, 0.45)',
					pointerEvents: 'none',
					transform: layer.rot
						? `rotate(${ layer.rot }deg)`
						: undefined,
				} }
			/>
			<div
				style={ {
					position: 'absolute',
					left: Math.max( 8, bx ),
					top: Math.min( window.innerHeight - 60, by + bh + 10 ),
					background: 'var(--accent)',
					color: '#fff',
					borderRadius: 5,
					padding: '4px 10px',
					fontSize: 11,
					pointerEvents: 'none',
					whiteSpace: 'nowrap',
				} }
			>
				{ ( 'cover' === mode
					? __(
							'Drag to move, scroll to zoom, Enter or Esc to finish.',
							'wunderpaint'
					  )
					: __(
							'Drag to reposition the image, Enter or Esc to finish.',
							'wunderpaint'
					  ) ) +
					( 'cover' === mode && ( Number( fit.zoom ) || 1 ) > 1.001
						? ` · ${ Math.round(
								( Number( fit.zoom ) || 1 ) * 100
						  ) }%`
						: '' ) +
					( frameText
						? ` · ${ __(
								'double-click to edit the text',
								'wunderpaint'
						  ) }`
						: '' ) }
			</div>
		</div>
	);
}
