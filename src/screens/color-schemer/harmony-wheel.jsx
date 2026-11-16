/**
 * Harmony wheel (Color Schemer, v1.432.0): the palette as points on a
 * color disc - hue around, saturation outward - with a line from the
 * middle to every color, so a harmony reads as its shape (a fan, a line
 * across, a triangle). The large ring is the base color: drag it to turn
 * the whole harmony, arrow keys do the same in single steps. Colors on the
 * same spot (shades of one hue) step inward so each stays visible.
 */

import { useEffect, useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from '../../lib/color';

const hslOf = ( hex ) => {
	const { r, g, b } = hexToRgb( hex );
	return rgbToHsl( r, g, b );
};

/** Hue 0 at the top, clockwise; radius 0..1 from the middle. */
const pointOf = ( hue, radius, size ) => {
	const rad = ( ( hue - 90 ) * Math.PI ) / 180;
	const half = size / 2;
	return {
		x: half + Math.cos( rad ) * radius * ( half - 8 ),
		y: half + Math.sin( rad ) * radius * ( half - 8 ),
	};
};

/** Dots on the same spot step inward along their ray. */
function placeDots( colors, size ) {
	const placed = [];
	for ( const color of colors ) {
		const { h, s } = hslOf( color );
		let radius = s;
		let p = pointOf( h, radius, size );
		for ( let guard = 0; guard < 12; guard++ ) {
			const clash = placed.some(
				( q ) => Math.hypot( q.x - p.x, q.y - p.y ) < 11
			);
			if ( ! clash ) {
				break;
			}
			radius = Math.max( 0, radius - 12 / ( size / 2 - 8 ) );
			p = pointOf( h, radius, size );
		}
		placed.push( { ...p, color } );
	}
	return placed;
}

function paintDisc( canvas, size ) {
	const scale = window.devicePixelRatio || 1;
	const px = Math.round( size * scale );
	canvas.width = px;
	canvas.height = px;
	const ctx = canvas.getContext( '2d' );
	if ( ! ctx ) {
		return;
	}
	const img = ctx.createImageData( px, px );
	const half = px / 2;
	const outer = half - 8 * scale;
	for ( let y = 0; y < px; y++ ) {
		for ( let x = 0; x < px; x++ ) {
			const dx = x + 0.5 - half;
			const dy = y + 0.5 - half;
			const dist = Math.hypot( dx, dy );
			const edge = outer + 0.5 - dist;
			if ( edge <= 0 ) {
				continue;
			}
			const hue =
				( ( Math.atan2( dx, -dy ) * 180 ) / Math.PI + 360 ) % 360;
			// White in the middle, full hues on the rim (HSV at full value).
			const sat = Math.min( 1, dist / outer );
			const { r, g, b } = hslToRgb( hue, 1, 1 - sat / 2 );
			const i = ( y * px + x ) * 4;
			img.data[ i ] = r;
			img.data[ i + 1 ] = g;
			img.data[ i + 2 ] = b;
			img.data[ i + 3 ] = Math.round( Math.min( 1, edge ) * 255 );
		}
	}
	ctx.putImageData( img, 0, 0 );
}

export function HarmonyWheel( { base, colors, onBase, size = 200 } ) {
	const canvas = useRef( null );
	const wrap = useRef( null );
	useEffect( () => {
		if ( canvas.current ) {
			paintDisc( canvas.current, size );
		}
	}, [ size ] );

	const baseHsl = hslOf( base );
	const handle = pointOf( baseHsl.h, baseHsl.s, size );
	const dots = placeDots( colors, size );
	const half = size / 2;

	const setFrom = ( e ) => {
		const rect = wrap.current.getBoundingClientRect();
		const dx = e.clientX - rect.left - half;
		const dy = e.clientY - rect.top - half;
		const hue = ( ( Math.atan2( dx, -dy ) * 180 ) / Math.PI + 360 ) % 360;
		const sat = Math.min( 1, Math.hypot( dx, dy ) / ( half - 8 ) );
		const { r, g, b } = hslToRgb( hue, sat, baseHsl.l );
		onBase( rgbToHex( r, g, b ) );
	};
	const down = ( e ) => {
		if ( e.button !== 0 ) {
			return;
		}
		e.preventDefault();
		e.currentTarget.setPointerCapture?.( e.pointerId );
		setFrom( e );
	};
	const move = ( e ) => {
		if ( e.currentTarget.hasPointerCapture?.( e.pointerId ) ) {
			setFrom( e );
		}
	};
	const key = ( e ) => {
		const step = e.shiftKey ? 10 : 1;
		let { h, s } = baseHsl;
		if ( 'ArrowLeft' === e.key ) {
			h -= step;
		} else if ( 'ArrowRight' === e.key ) {
			h += step;
		} else if ( 'ArrowUp' === e.key ) {
			s += step / 100;
		} else if ( 'ArrowDown' === e.key ) {
			s -= step / 100;
		} else {
			return;
		}
		e.preventDefault();
		const { r, g, b } = hslToRgb(
			( ( h % 360 ) + 360 ) % 360,
			Math.min( 1, Math.max( 0, s ) ),
			baseHsl.l
		);
		onBase( rgbToHex( r, g, b ) );
	};

	return (
		<div
			ref={ wrap }
			className="csd-wheel"
			style={ { width: size, height: size } }
			onPointerDown={ down }
			onPointerMove={ move }
		>
			<canvas
				ref={ canvas }
				style={ { width: size, height: size } }
				aria-hidden="true"
			/>
			<svg
				width={ size }
				height={ size }
				viewBox={ `0 0 ${ size } ${ size }` }
				aria-hidden="true"
			>
				{ dots.map( ( d, i ) => (
					<line
						key={ `l${ i }` }
						x1={ half }
						y1={ half }
						x2={ d.x }
						y2={ d.y }
					/>
				) ) }
				{ dots.map( ( d, i ) => (
					<circle
						key={ `d${ i }` }
						className="csd-wheel-dot"
						cx={ d.x }
						cy={ d.y }
						r="5.5"
						fill={ d.color }
					/>
				) ) }
			</svg>
			<span
				className="csd-wheel-base"
				role="slider"
				tabIndex={ 0 }
				aria-label={ __( 'Base color on the wheel', 'wunderpaint' ) }
				aria-valuemin={ 0 }
				aria-valuemax={ 359 }
				aria-valuenow={ Math.round( baseHsl.h ) }
				aria-valuetext={ base }
				title={ __(
					'Drag to turn the harmony. Arrow keys: hue and saturation.',
					'wunderpaint'
				) }
				style={ {
					left: handle.x,
					top: handle.y,
					background: base,
				} }
				onKeyDown={ key }
			/>
		</div>
	);
}
