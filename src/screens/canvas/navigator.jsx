/**
 * Navigator (F1, v0.5): minimap with draggable viewport rectangle and a
 * zoom slider, floats in the canvas corner, toggled via View menu.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { ZOOM_MIN, ZOOM_MAX } from '../../store/constants';

const THUMB_W = 168;

export function Navigator( { editor, areaSize, viewApi } ) {
	const { state, dispatch } = editor;
	const { doc, layers, zoom, pan } = state;
	const [ thumb, setThumb ] = useState( null );
	const dragging = useRef( false );

	const scale = Math.min( THUMB_W / doc.w, 110 / doc.h );
	const tw = Math.max( 24, Math.round( doc.w * scale ) );
	const th = Math.max( 18, Math.round( doc.h * scale ) );

	// Debounced thumbnail refresh on any document change.
	useEffect( () => {
		let cancelled = false;
		const timer = setTimeout( () => {
			renderToCanvas( doc, layers, {
				scale,
				cache: sharedImageCache,
			} )
				.then( ( canvas ) => {
					if ( ! cancelled ) {
						setThumb( canvas.toDataURL() );
					}
				} )
				.catch( () => {} );
		}, 250 );
		return () => {
			cancelled = true;
			clearTimeout( timer );
		};
	}, [ doc, layers, scale ] );

	// Visible document region → thumb coordinates, clamped to the thumbnail so
	// the rectangle never marks area outside the canvas (when zoomed out or
	// panned past an edge).
	const view = {
		x: -pan.x / zoom,
		y: -pan.y / zoom,
		w: areaSize.w / zoom,
		h: areaSize.h / zoom,
	};
	const left = Math.max( 0, view.x * scale );
	const top = Math.max( 0, view.y * scale );
	const right = Math.min( tw, ( view.x + view.w ) * scale );
	const bottom = Math.min( th, ( view.y + view.h ) * scale );
	const rect = {
		left,
		top,
		width: Math.max( 0, right - left ),
		height: Math.max( 0, bottom - top ),
	};

	const centerOn = ( e, el ) => {
		const box = el.getBoundingClientRect();
		const dx = ( e.clientX - box.left ) / scale;
		const dy = ( e.clientY - box.top ) / scale;
		dispatch( {
			type: 'SET_VIEW',
			zoom,
			pan: {
				x: areaSize.w / 2 - dx * zoom,
				y: areaSize.h / 2 - dy * zoom,
			},
		} );
	};

	return (
		<div
			className="ed-navigator"
			aria-label={ __( 'Navigator', 'wunderpaint' ) }
			// Keep interactions inside the navigator: without this, pointer
			// events bubble to .ed-canvas-area and start a marquee selection on
			// the canvas behind it (even a small zoom-slider drag).
			onPointerDown={ ( e ) => e.stopPropagation() }
			onPointerMove={ ( e ) => e.stopPropagation() }
			onPointerUp={ ( e ) => e.stopPropagation() }
			onMouseDown={ ( e ) => e.stopPropagation() }
			onWheel={ ( e ) => e.stopPropagation() }
		>
			<div
				className="ed-navigator-thumb"
				style={ { width: tw, height: th } }
				role="presentation"
				onPointerDown={ ( e ) => {
					dragging.current = true;
					e.currentTarget.setPointerCapture( e.pointerId );
					centerOn( e, e.currentTarget );
				} }
				onPointerMove={ ( e ) =>
					dragging.current && centerOn( e, e.currentTarget )
				}
				onPointerUp={ () => ( dragging.current = false ) }
			>
				{ thumb && <img src={ thumb } alt="" draggable={ false } /> }
				<div className="ed-navigator-view" style={ rect } />
			</div>
			<div className="ed-navigator-zoom">
				<input
					type="range"
					min={ Math.log( ZOOM_MIN ) }
					max={ Math.log( ZOOM_MAX ) }
					step={ 0.01 }
					value={ Math.log( zoom ) }
					aria-label={ __( 'Zoom', 'wunderpaint' ) }
					onChange={ ( e ) =>
						viewApi.current?.zoomTo( Math.exp( +e.target.value ) )
					}
				/>
				<button
					title={ __( 'Fit', 'wunderpaint' ) }
					onClick={ () => viewApi.current?.fit() }
				>
					{ Math.round( zoom * 100 ) }%
				</button>
			</div>
		</div>
	);
}
