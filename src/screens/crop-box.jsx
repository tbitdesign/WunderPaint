/**
 * Ratio-locked crop mask (v1.351.0).
 *
 * Drag the rectangle to move it, drag a corner to resize it. The ratio is
 * fixed by the caller, because the whole point when replacing an image is that
 * the result has to drop into the same slot the old one occupied.
 *
 * All state is kept in source pixels and only scaled for display, so the crop
 * a user sees is exactly the crop that gets rendered, at any zoom.
 */

import { useState, useRef, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { clampCrop } from '../lib/image-prep';

const CORNERS = [ 'nw', 'ne', 'sw', 'se' ];

export function CropBox( { src, srcW, srcH, ratio, crop, onChange } ) {
	const wrapRef = useRef( null );
	const [ scale, setScale ] = useState( 1 );
	const drag = useRef( null );

	// Track the displayed size so pointer deltas can be converted back to
	// source pixels. ResizeObserver rather than a one-off measure: the dialog
	// can be resized and the image loads asynchronously.
	useEffect( () => {
		const el = wrapRef.current;
		if ( ! el || ! srcW ) {
			return undefined;
		}
		const measure = () => {
			const rect = el.getBoundingClientRect();
			if ( rect.width ) {
				setScale( rect.width / srcW );
			}
		};
		measure();
		const ro = new window.ResizeObserver( measure );
		ro.observe( el );
		return () => ro.disconnect();
	}, [ srcW ] );

	const apply = useCallback(
		( next ) => onChange( clampCrop( next, srcW, srcH, ratio ) ),
		[ onChange, srcW, srcH, ratio ]
	);

	const onPointerDown = ( e, corner ) => {
		e.preventDefault();
		e.stopPropagation();
		e.currentTarget.setPointerCapture?.( e.pointerId );
		drag.current = {
			corner,
			startX: e.clientX,
			startY: e.clientY,
			orig: { ...crop },
		};
	};

	const onPointerMove = ( e ) => {
		const d = drag.current;
		if ( ! d || ! scale ) {
			return;
		}
		const dx = ( e.clientX - d.startX ) / scale;
		const dy = ( e.clientY - d.startY ) / scale;

		if ( ! d.corner ) {
			apply( { ...d.orig, x: d.orig.x + dx, y: d.orig.y + dy } );
			return;
		}

		// Resizing: width drives, and the anchored edge stays put. Working out
		// the new width from the moved corner keeps the ratio exact instead of
		// letting x and y fight each other.
		const right = d.orig.x + d.orig.w;
		const bottom = d.orig.y + d.orig.h;
		let w = d.orig.w;

		if ( 'se' === d.corner || 'ne' === d.corner ) {
			w = d.orig.w + dx;
		} else {
			w = d.orig.w - dx;
		}
		w = Math.max( 24, w );
		const h = ratio ? w / ratio : d.orig.h;

		let x = d.orig.x;
		let y = d.orig.y;
		if ( 'nw' === d.corner || 'sw' === d.corner ) {
			x = right - w;
		}
		if ( 'nw' === d.corner || 'ne' === d.corner ) {
			y = bottom - h;
		}
		apply( { x, y, w, h } );
	};

	const onPointerUp = ( e ) => {
		if ( drag.current ) {
			e.currentTarget.releasePointerCapture?.( e.pointerId );
			drag.current = null;
		}
	};

	// Keyboard nudging, so the mask is not mouse-only.
	const onKeyDown = ( e ) => {
		const step = e.shiftKey ? 20 : 2;
		const map = {
			ArrowLeft: { x: -step },
			ArrowRight: { x: step },
			ArrowUp: { y: -step },
			ArrowDown: { y: step },
		};
		const move = map[ e.key ];
		if ( ! move ) {
			return;
		}
		e.preventDefault();
		apply( {
			...crop,
			x: crop.x + ( move.x || 0 ),
			y: crop.y + ( move.y || 0 ),
		} );
	};

	const pct = ( v, total ) => `${ ( v / total ) * 100 }%`;

	return (
		<div className="wpie-cropbox" ref={ wrapRef }>
			<img src={ src } alt="" draggable="false" />
			<div
				className="wpie-cropbox-mask"
				style={ {
					left: pct( crop.x, srcW ),
					top: pct( crop.y, srcH ),
					width: pct( crop.w, srcW ),
					height: pct( crop.h, srcH ),
				} }
				onPointerDown={ ( e ) => onPointerDown( e, null ) }
				onPointerMove={ onPointerMove }
				onPointerUp={ onPointerUp }
				onPointerCancel={ onPointerUp }
				onKeyDown={ onKeyDown }
				role="slider"
				tabIndex={ 0 }
				aria-label={ __( 'Crop area', 'wunderpaint' ) }
				aria-valuenow={ Math.round( crop.w ) }
				aria-valuemin={ 24 }
				aria-valuemax={ srcW }
			>
				{ CORNERS.map( ( c ) => (
					<span
						key={ c }
						className={ 'wpie-cropbox-h ' + c }
						onPointerDown={ ( e ) => onPointerDown( e, c ) }
						onPointerMove={ onPointerMove }
						onPointerUp={ onPointerUp }
						onPointerCancel={ onPointerUp }
					/>
				) ) }
			</div>
		</div>
	);
}
