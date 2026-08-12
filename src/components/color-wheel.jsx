/**
 * Colour wheel: every hue visible at once.
 *
 * The square picker shows one hue at a time, so choosing a colour means
 * first finding the hue on a strip and only then seeing the colour - two
 * steps for something that should be one glance. A ring puts every hue on
 * the table; the square inside it is the shade of whichever hue the ring
 * is on. Drag the ring to turn, drag inside to pick.
 *
 * Canvas rather than a pile of gradients, because the ring has to be a
 * real colour circle and not an approximation stitched from stops.
 */

import { useEffect, useRef, useState, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

const RING = 15; // ring thickness as a share of the radius, in percent

function hsvToRgb( h, s, v ) {
	const i = Math.floor( h * 6 );
	const f = h * 6 - i;
	const p = v * ( 1 - s );
	const q = v * ( 1 - f * s );
	const t = v * ( 1 - ( 1 - f ) * s );
	const m = [
		[ v, t, p ],
		[ q, v, p ],
		[ p, v, t ],
		[ p, q, v ],
		[ t, p, v ],
		[ v, p, q ],
	][ i % 6 ];
	return m.map( ( c ) => Math.round( c * 255 ) );
}

const toHex = ( rgb ) =>
	'#' + rgb.map( ( c ) => c.toString( 16 ).padStart( 2, '0' ) ).join( '' );

function hexToHsv( hex ) {
	const h = /^#[0-9a-f]{6}$/i.test( hex || '' ) ? hex : '#000000';
	const r = parseInt( h.slice( 1, 3 ), 16 ) / 255;
	const g = parseInt( h.slice( 3, 5 ), 16 ) / 255;
	const b = parseInt( h.slice( 5, 7 ), 16 ) / 255;
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const d = max - min;
	let hue = 0;
	if ( d ) {
		if ( max === r ) {
			hue = ( ( g - b ) / d + ( g < b ? 6 : 0 ) ) / 6;
		} else if ( max === g ) {
			hue = ( ( b - r ) / d + 2 ) / 6;
		} else {
			hue = ( ( r - g ) / d + 4 ) / 6;
		}
	}
	return { h: hue, s: max ? d / max : 0, v: max };
}

export function ColorWheel( { color, onChange, size = 176 } ) {
	const ref = useRef( null );
	const drag = useRef( null );
	const [ hsv, setHsv ] = useState( () => hexToHsv( color ) );
	const mine = useRef( null );

	// Follow the outside world, but not our own echoes - otherwise the hue
	// is lost the moment the colour goes grey and comes back different.
	useEffect( () => {
		if ( color && color !== mine.current ) {
			setHsv( hexToHsv( color ) );
		}
	}, [ color ] );

	const emit = useCallback(
		( next ) => {
			setHsv( next );
			const hex = toHex( hsvToRgb( next.h, next.s, next.v ) );
			mine.current = hex;
			if ( onChange ) {
				onChange( hex );
			}
		},
		[ onChange ]
	);

	// The wheel itself never changes, so it is drawn once per size.
	useEffect( () => {
		const cv = ref.current;
		if ( ! cv ) {
			return;
		}
		const dpr = window.devicePixelRatio || 1;
		cv.width = size * dpr;
		cv.height = size * dpr;
		const ctx = cv.getContext( '2d' );
		ctx.setTransform( dpr, 0, 0, dpr, 0, 0 );
		ctx.clearRect( 0, 0, size, size );
		const c = size / 2;
		const outer = c - 1;
		const inner = outer * ( 1 - RING / 100 );

		// The hue ring, in one-degree wedges. A conic gradient would be
		// shorter but is not everywhere yet, and this is drawn once.
		for ( let deg = 0; deg < 360; deg++ ) {
			const a0 = ( ( deg - 0.6 ) * Math.PI ) / 180;
			const a1 = ( ( deg + 0.6 ) * Math.PI ) / 180;
			ctx.beginPath();
			ctx.arc( c, c, outer, a0, a1 );
			ctx.arc( c, c, inner, a1, a0, true );
			ctx.closePath();
			ctx.fillStyle = toHex( hsvToRgb( deg / 360, 1, 1 ) );
			ctx.fill();
		}
	}, [ size ] );

	const c = size / 2;
	const outer = c - 1;
	const inner = outer * ( 1 - RING / 100 );
	// The biggest square that fits inside the ring.
	const sq = Math.floor( ( inner * 2 ) / Math.SQRT2 ) - 2;
	const sqLeft = c - sq / 2;
	const sqTop = c - sq / 2;
	const hueHex = toHex( hsvToRgb( hsv.h, 1, 1 ) );
	const dotHex = toHex( hsvToRgb( hsv.h, hsv.s, hsv.v ) );

	const at = ( e ) => {
		const r = ref.current.getBoundingClientRect();
		return {
			x: ( ( e.clientX - r.left ) * size ) / r.width,
			y: ( ( e.clientY - r.top ) * size ) / r.height,
		};
	};

	const handle = ( p, which ) => {
		if ( 'ring' === which ) {
			const a = Math.atan2( p.y - c, p.x - c );
			emit( { ...hsv, h: ( ( ( a / ( Math.PI * 2 ) ) % 1 ) + 1 ) % 1 } );
			return;
		}
		const s = Math.min( 1, Math.max( 0, ( p.x - sqLeft ) / sq ) );
		const v = 1 - Math.min( 1, Math.max( 0, ( p.y - sqTop ) / sq ) );
		emit( { ...hsv, s, v } );
	};

	const onDown = ( e ) => {
		const p = at( e );
		const d = Math.hypot( p.x - c, p.y - c );
		// Inside the square wins, so a corner of the square that pokes
		// under the ring still picks a shade.
		const which =
			p.x >= sqLeft &&
			p.x <= sqLeft + sq &&
			p.y >= sqTop &&
			p.y <= sqTop + sq
				? 'sq'
				: d <= outer + 2
				? 'ring'
				: null;
		if ( ! which ) {
			return;
		}
		e.currentTarget.setPointerCapture( e.pointerId );
		drag.current = which;
		handle( p, which );
	};

	return (
		<div
			className="cw"
			style={ { width: size, height: size } }
			onPointerDown={ onDown }
			onPointerMove={ ( e ) => {
				if ( drag.current ) {
					handle( at( e ), drag.current );
				}
			} }
			onPointerUp={ () => ( drag.current = null ) }
			onPointerCancel={ () => ( drag.current = null ) }
			role="application"
			aria-label={ __( 'Color wheel', 'wunderpaint' ) }
		>
			<canvas ref={ ref } style={ { width: size, height: size } } />
			<div
				className="cw-sq"
				style={ {
					left: sqLeft,
					top: sqTop,
					width: sq,
					height: sq,
					background:
						'linear-gradient(to top, #000, transparent),' +
						'linear-gradient(to right, #fff, ' +
						hueHex +
						')',
				} }
			/>
			<span
				className="cw-ringdot"
				style={ {
					left:
						c +
						Math.cos( hsv.h * Math.PI * 2 ) *
							( ( outer + inner ) / 2 ),
					top:
						c +
						Math.sin( hsv.h * Math.PI * 2 ) *
							( ( outer + inner ) / 2 ),
					background: hueHex,
				} }
			/>
			<span
				className="cw-dot"
				style={ {
					left: sqLeft + hsv.s * sq,
					top: sqTop + ( 1 - hsv.v ) * sq,
					background: dotHex,
				} }
			/>
		</div>
	);
}
