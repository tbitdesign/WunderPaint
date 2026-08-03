/**
 * WCAG contrast check for text layers (v1.15): every visible text layer
 * is rated against the average color of what actually lies UNDER it —
 * the composite is rendered once per text with that layer hidden.
 */

import { renderToCanvas, sharedImageCache } from './raster';
import { parseColor } from './color';

/** WCAG relative luminance (sRGB, 0..1 channels linearized). */
const channel = ( c ) => {
	const v = c / 255;
	return v <= 0.03928 ? v / 12.92 : Math.pow( ( v + 0.055 ) / 1.055, 2.4 );
};
const relLuminance = ( { r, g, b } ) =>
	0.2126 * channel( r ) + 0.7152 * channel( g ) + 0.0722 * channel( b );

/** WCAG contrast ratio between two RGB colors. */
export function contrastRatio( a, b ) {
	const l1 = relLuminance( a );
	const l2 = relLuminance( b );
	return ( Math.max( l1, l2 ) + 0.05 ) / ( Math.min( l1, l2 ) + 0.05 );
}

/** Average (alpha-over-white) color of a rect region on a canvas. */
function averageColor( canvas, rect ) {
	const ctx = canvas.getContext( '2d' );
	const x = Math.max( 0, Math.floor( rect.x ) );
	const y = Math.max( 0, Math.floor( rect.y ) );
	const w = Math.min( canvas.width - x, Math.ceil( rect.w ) );
	const h = Math.min( canvas.height - y, Math.ceil( rect.h ) );
	if ( w < 1 || h < 1 ) {
		return { r: 255, g: 255, b: 255 };
	}
	const data = ctx.getImageData( x, y, w, h ).data;
	let r = 0;
	let g = 0;
	let b = 0;
	const count = data.length / 4;
	for ( let i = 0; i < data.length; i += 4 ) {
		const a = data[ i + 3 ] / 255;
		// Transparent regions read as white (the admin page behind).
		r += data[ i ] * a + 255 * ( 1 - a );
		g += data[ i + 1 ] * a + 255 * ( 1 - a );
		b += data[ i + 2 ] * a + 255 * ( 1 - a );
	}
	return {
		r: Math.round( r / count ),
		g: Math.round( g / count ),
		b: Math.round( b / count ),
	};
}

/**
 * Check every visible text layer.
 *
 * @param {Object} doc    Document.
 * @param {Array}  layers Flat layer list.
 * @return {Promise<Array>} [{ id, name, ratio, required, pass, textColor }]
 */
export async function checkContrast( doc, layers ) {
	const visible = ( layer ) => {
		for (
			let l = layer;
			l;
			l = layers.find( ( x ) => x.id === l.parent )
		) {
			if ( ! l.visible ) {
				return false;
			}
		}
		return true;
	};
	const texts = layers.filter(
		( l ) =>
			'text' === l.type &&
			visible( l ) &&
			parseColor( l.color ) &&
			l.w > 0 &&
			l.h > 0
	);
	const scale = Math.min( 1, 480 / Math.max( doc.w, doc.h ) );
	const results = [];
	for ( const text of texts ) {
		// Composite WITHOUT this text = what the glyphs sit on.
		const canvas = await renderToCanvas(
			doc,
			layers.filter( ( l ) => l.id !== text.id ),
			{ scale, cache: sharedImageCache }
		);
		const bg = averageColor( canvas, {
			x: text.x * scale,
			y: text.y * scale,
			w: text.w * scale,
			h: text.h * scale,
		} );
		const ratio = contrastRatio( parseColor( text.color ), bg );
		// WCAG large text (≥24px or bold ≥18.66px) needs 3:1, normal 4.5:1.
		const large =
			text.fontSize >= 24 ||
			( text.fontSize >= 18.66 && ( text.weight || 400 ) >= 700 );
		const required = large ? 3 : 4.5;
		results.push( {
			id: text.id,
			name: text.name,
			textColor: text.color,
			ratio: Math.round( ratio * 100 ) / 100,
			required,
			pass: ratio >= required,
		} );
	}
	return results;
}
