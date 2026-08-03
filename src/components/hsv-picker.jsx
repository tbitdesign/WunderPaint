/**
 * Free HSV picker (v1.0.1): saturation/value field + hue slider, replaces
 * the native color input (no OS dialogs). Internal HSV state is the source
 * of truth while interacting so the hue survives black/white/gray passes.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { hexToHsv, hsvToHex } from '../lib/color';

const clamp01 = ( n ) => Math.max( 0, Math.min( 1, n ) );

export function HsvPicker( { color, onChange, onCommit } ) {
	const [ hsv, setHsv ] = useState( () => hexToHsv( color || '#000000' ) );
	const svRef = useRef( null );
	const hueRef = useRef( null );
	const lastEmitted = useRef( null );

	// Follow external changes (hex field, swatches, eyedropper), but not
	// our own onChange echoes, so the hue isn't lost on gray colors.
	useEffect( () => {
		if ( color && color !== lastEmitted.current ) {
			setHsv( hexToHsv( color ) );
		}
	}, [ color ] );

	const emit = ( next, commit ) => {
		setHsv( next );
		const hex = hsvToHex( next.h, next.s, next.v );
		lastEmitted.current = hex;
		onChange( hex );
		if ( commit ) {
			onCommit?.( hex );
		}
	};

	const dragify = ( ref, toPatch ) => ( event ) => {
		event.preventDefault();
		const el = ref.current;
		el.setPointerCapture?.( event.pointerId );
		const apply = ( e, commit ) => {
			const rect = el.getBoundingClientRect();
			const x = clamp01( ( e.clientX - rect.left ) / rect.width );
			const y = clamp01( ( e.clientY - rect.top ) / rect.height );
			emit( { ...hsvRef.current, ...toPatch( x, y ) }, commit );
		};
		apply( event, false );
		const move = ( e ) => apply( e, false );
		const up = ( e ) => {
			apply( e, true );
			el.removeEventListener( 'pointermove', move );
			el.removeEventListener( 'pointerup', up );
			el.removeEventListener( 'pointercancel', up );
		};
		el.addEventListener( 'pointermove', move );
		el.addEventListener( 'pointerup', up );
		el.addEventListener( 'pointercancel', up );
	};

	// The drag closures outlive a render, read current hsv via a ref.
	const hsvRef = useRef( hsv );
	hsvRef.current = hsv;

	const hueColor = hsvToHex( hsv.h, 1, 1 );

	return (
		<div className="hsv-picker">
			<div
				ref={ svRef }
				className="hsv-sv"
				style={ { backgroundColor: hueColor } }
				role="slider"
				aria-label={ __( 'Saturation and brightness', 'wunderpaint' ) }
				aria-valuetext={ `${ Math.round(
					hsv.s * 100
				) }% / ${ Math.round( hsv.v * 100 ) }%` }
				tabIndex={ 0 }
				onPointerDown={ dragify( svRef, ( x, y ) => ( {
					s: x,
					v: 1 - y,
				} ) ) }
				onKeyDown={ ( e ) => {
					const step = e.shiftKey ? 0.1 : 0.02;
					const patch =
						'ArrowLeft' === e.key
							? { s: clamp01( hsv.s - step ) }
							: 'ArrowRight' === e.key
							? { s: clamp01( hsv.s + step ) }
							: 'ArrowUp' === e.key
							? { v: clamp01( hsv.v + step ) }
							: 'ArrowDown' === e.key
							? { v: clamp01( hsv.v - step ) }
							: null;
					if ( patch ) {
						e.preventDefault();
						emit( { ...hsv, ...patch }, true );
					}
				} }
			>
				<span
					className="hsv-cursor"
					style={ {
						left: `${ hsv.s * 100 }%`,
						top: `${ ( 1 - hsv.v ) * 100 }%`,
						backgroundColor: hsvToHex( hsv.h, hsv.s, hsv.v ),
					} }
				/>
			</div>
			<div
				ref={ hueRef }
				className="hsv-hue"
				role="slider"
				aria-label={ __( 'Hue', 'wunderpaint' ) }
				aria-valuemin={ 0 }
				aria-valuemax={ 360 }
				aria-valuenow={ Math.round( hsv.h ) }
				tabIndex={ 0 }
				onPointerDown={ dragify( hueRef, ( x ) => ( {
					h: Math.min( 359.9, x * 360 ),
				} ) ) }
				onKeyDown={ ( e ) => {
					const step = e.shiftKey ? 15 : 3;
					const dir =
						'ArrowLeft' === e.key || 'ArrowDown' === e.key
							? -1
							: 'ArrowRight' === e.key || 'ArrowUp' === e.key
							? 1
							: 0;
					if ( dir ) {
						e.preventDefault();
						emit(
							{
								...hsv,
								h:
									( ( ( hsv.h + dir * step ) % 360 ) + 360 ) %
									360,
							},
							true
						);
					}
				} }
			>
				<span
					className="hsv-hue-knob"
					style={ {
						left: `${ ( hsv.h / 360 ) * 100 }%`,
						backgroundColor: hueColor,
					} }
				/>
			</div>
		</div>
	);
}
