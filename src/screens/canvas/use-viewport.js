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

/** Ruler tick step by zoom (spec 05.1: 400/200/100/50). */
export const rulerStep = ( zoom ) =>
	zoom < 0.3 ? 400 : zoom < 0.6 ? 200 : zoom < 1.2 ? 100 : 50;

export const screenToDoc = ( point, pan, zoom ) => ( {
	x: ( point.x - pan.x ) / zoom,
	y: ( point.y - pan.y ) / zoom,
} );

export const docToScreen = ( point, pan, zoom ) => ( {
	x: point.x * zoom + pan.x,
	y: point.y * zoom + pan.y,
} );
