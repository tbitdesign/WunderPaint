/**
 * Pure viewport math (spec 05.1): fit, zoom-about-point, ruler steps,
 * doc↔screen mapping.
 */

import { ZOOM_MIN, ZOOM_MAX } from '../../store/constants';

const clampZoom = ( z ) => Math.min( ZOOM_MAX, Math.max( ZOOM_MIN, z ) );

/** Auto-fit: fit = min((areaW-80)/w, (areaH-80)/h, 1), centered. */
export function fitView( areaW, areaH, docW, docH ) {
	const zoom = clampZoom(
		Math.min( ( areaW - 80 ) / docW, ( areaH - 80 ) / docH, 1 )
	);
	return {
		zoom,
		pan: { x: ( areaW - docW * zoom ) / 2, y: ( areaH - docH * zoom ) / 2 },
	};
}

/**
 * Zoom keeping the given screen point fixed (spec 05.1 wheel zoom).
 *
 * @param {number} zoom    Current zoom.
 * @param {number} nextRaw Desired zoom (unclamped).
 * @param {Object} pan     Current pan {x,y} (screen px).
 * @param {Object} point   Anchor point in AREA screen px.
 * @return {{zoom: number, pan: Object}} New view.
 */
export function zoomAboutPoint( zoom, nextRaw, pan, point ) {
	const next = clampZoom( nextRaw );
	const scale = next / zoom;
	return {
		zoom: next,
		pan: {
			x: point.x - ( point.x - pan.x ) * scale,
			y: point.y - ( point.y - pan.y ) * scale,
		},
	};
}

export const RULER_SIZE = 22;
export const RULER_UNITS = [ 'px', 'mm', 'cm', 'in' ];

/** Keep labelled ticks at least minSpacing screen pixels apart, in 1–2–5 steps. */
export function rulerStep( zoom, minSpacing = 64 ) {
	const target = minSpacing / zoom;
	const power = 10 ** Math.floor( Math.log10( target ) );
	const multiple = [ 1, 2, 5, 10 ].find( ( n ) => n * power >= target );
	return multiple * power;
}

/**
 * Visible ticks only, including the pasteboard on either side of the document.
 * Origin is document zero in ruler-local screen pixels (without the corner).
 * Cost depends on viewport size, never on document dimensions or pan distance.
 */
export function rulerTicks( zoom, origin, length, unit = 'px', dpi = 72 ) {
	if (
		! Number.isFinite( zoom ) ||
		zoom <= 0 ||
		! Number.isFinite( origin ) ||
		! Number.isFinite( length ) ||
		length <= 0
	) {
		return [];
	}
	const resolution = Number( dpi );
	const safeDpi =
		Number.isFinite( resolution ) && resolution > 0 ? resolution : 72;
	const pixelsPerUnit =
		unit === 'in'
			? safeDpi
			: unit === 'cm'
			? safeDpi / 2.54
			: unit === 'mm'
			? safeDpi / 25.4
			: 1;
	// Only the scale uses physical units. Document geometry stays in pixels.
	const scale = zoom * pixelsPerUnit;
	if ( ! Number.isFinite( scale ) || scale <= 0 ) {
		return [];
	}
	const largest = Math.max(
		Math.abs( origin / scale ),
		Math.abs( ( length - origin ) / scale )
	);
	// Leave room for a sign, long coordinates and fractional physical units.
	const decimals = Math.max(
		0,
		-Math.floor( Math.log10( rulerStep( scale ) ) )
	);
	const labelWidth =
		( String( Math.ceil( largest ) ).length +
			1 +
			( decimals ? decimals + 1 : 0 ) ) *
		6.5;
	const major = rulerStep( scale, Math.max( 64, labelWidth + 16 ) );
	const minor = Math.max( pixelsPerUnit === 1 ? 1 : 0, major / 10 );
	const divisions = Math.round( major / minor );
	const precision = Math.min(
		12,
		Math.max( 0, -Math.floor( Math.log10( minor ) ) )
	);
	const first = Math.ceil( -origin / ( minor * scale ) );
	const count = Math.ceil( length / ( minor * scale ) ) + 1;
	const ticks = [];
	for ( let n = 0; n < count; n++ ) {
		const index = first + n;
		const value = Number( ( index * minor ).toFixed( precision ) ) || 0;
		const position = value * scale + origin;
		if ( position < 0 || position > length ) {
			continue;
		}
		const remainder = Math.abs( index % divisions );
		ticks.push( {
			value,
			position,
			kind:
				remainder === 0
					? 'major'
					: remainder === divisions / 2
					? 'medium'
					: 'minor',
		} );
	}
	return ticks;
}

export const screenToDoc = ( point, pan, zoom ) => ( {
	x: ( point.x - pan.x ) / zoom,
	y: ( point.y - pan.y ) / zoom,
} );

export const docToScreen = ( point, pan, zoom ) => ( {
	x: point.x * zoom + pan.x,
	y: point.y * zoom + pan.y,
} );
