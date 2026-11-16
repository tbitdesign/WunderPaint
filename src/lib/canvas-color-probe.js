import { renderToCanvas, sharedImageCache } from './raster';
import { rgbToHex, toHexColor } from './color';
import { lineSamplePoints } from './color-panel-workflows';

export const PROBE_PIXELS = 15;
export const PROBE_CENTER = 7;
export const probeSize = ( size ) =>
	[ 1, 3, 5 ].includes( +size ) ? +size : 1;

/** Alpha-weighted, matching raster.samplePixel; transparent pixels add no black. */
export function averageProbe( data ) {
	let r = 0,
		g = 0,
		b = 0,
		a = 0;
	for ( let i = 0; i < data.length; i += 4 ) {
		const alpha = data[ i + 3 ];
		r += data[ i ] * alpha;
		g += data[ i + 1 ] * alpha;
		b += data[ i + 2 ] * alpha;
		a += alpha;
	}
	return a
		? {
				r: Math.round( r / a ),
				g: Math.round( g / a ),
				b: Math.round( b / a ),
				a: Math.round( a / ( data.length / 4 ) ),
		  }
		: { r: 0, g: 0, b: 0, a: 0 };
}

/** Bounded real-renderer patch, also on very large documents. No screenshot scaling. */
export async function readCanvasProbe( doc, layers, point, size = 1 ) {
	const x = Math.floor( point.x ),
		y = Math.floor( point.y );
	if ( x < 0 || y < 0 || x >= doc.w || y >= doc.h ) {
		return null;
	}
	const n = probeSize( size );
	const canvas = await renderToCanvas( doc, layers, {
		cache: sharedImageCache,
		scale: 1,
		viewport: {
			x: x - PROBE_CENTER,
			y: y - PROBE_CENTER,
			w: PROBE_PIXELS,
			h: PROBE_PIXELS,
		},
	} );
	const offset = PROBE_CENTER - ( n - 1 ) / 2;
	const value = averageProbe(
		canvas.getContext( '2d' ).getImageData( offset, offset, n, n ).data
	);
	return {
		canvas,
		value,
		color: rgbToHex( value.r, value.g, value.b ),
		point: { x, y },
		size: n,
	};
}

/** Eight bounded document-pixel samples, with order, repeats and alpha intact. */
export async function readCanvasLine(
	doc,
	layers,
	from,
	to,
	size = 1,
	signal
) {
	const points = lineSamplePoints( from, to );
	const colors = [];
	for ( const point of points ) {
		if ( signal?.aborted ) {
			return null;
		}
		const probe = await readCanvasProbe( doc, layers, point, size );
		if ( ! probe || signal?.aborted ) {
			return null;
		}
		const { r, g, b, a } = probe.value;
		colors.push( toHexColor( r, g, b, a / 255 ) );
	}
	return colors.length >= 2 ? colors : null;
}
