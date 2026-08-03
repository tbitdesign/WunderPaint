/**
 * Programmatic dominant-color extraction (v1.190.0). Fully local, no model:
 * an image is drawn tiny, its pixels are bucketed into a fixed palette by hue
 * and lightness, and the buckets that make up a meaningful share are stored as
 * attachment meta. The Media Library Manager then filters by color bucket, so
 * "green" matches dark green, a lawn and a leaf alike (hue based, not exact).
 */

import { loadImage } from '../store/document';
import { createCanvas } from './raster';

/** The fixed filterable palette, in display order. */
export const COLOR_BUCKETS = [
	'red',
	'orange',
	'yellow',
	'green',
	'teal',
	'blue',
	'purple',
	'pink',
	'brown',
	'black',
	'gray',
	'white',
];

/** Representative swatch color per bucket for the UI. */
export const COLOR_SWATCH = {
	red: '#e5484d',
	orange: '#f76b15',
	yellow: '#f5d90a',
	green: '#46a758',
	teal: '#12a594',
	blue: '#3b82f6',
	purple: '#8e4ec6',
	pink: '#e93d82',
	brown: '#8b5a2b',
	black: '#1a1a1a',
	gray: '#8b8d98',
	white: '#f5f5f5',
};

/**
 * Classify one RGB color (0-255 each) into a palette bucket. Pure and
 * deterministic, so it is unit tested directly.
 *
 * @param {number} r Red.
 * @param {number} g Green.
 * @param {number} b Blue.
 * @return {string} A bucket from COLOR_BUCKETS.
 */
export function rgbToBucket( r, g, b ) {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max( rn, gn, bn );
	const min = Math.min( rn, gn, bn );
	const l = ( max + min ) / 2;
	const d = max - min;
	let s = 0;
	if ( d !== 0 ) {
		s = d / ( 1 - Math.abs( 2 * l - 1 ) );
	}

	// Achromatic first: near-white, near-black, gray.
	if ( l >= 0.9 && s < 0.18 ) {
		return 'white';
	}
	if ( l <= 0.08 ) {
		return 'black';
	}
	if ( s < 0.12 ) {
		return 'gray';
	}

	let h = 0;
	if ( d !== 0 ) {
		if ( max === rn ) {
			h = ( ( gn - bn ) / d ) % 6;
		} else if ( max === gn ) {
			h = ( bn - rn ) / d + 2;
		} else {
			h = ( rn - gn ) / d + 4;
		}
		h *= 60;
		if ( h < 0 ) {
			h += 360;
		}
	}

	// Dark, muted orange reads as brown.
	if ( h >= 15 && h < 45 && l < 0.4 && s < 0.75 ) {
		return 'brown';
	}
	if ( h < 15 || h >= 345 ) {
		return 'red';
	}
	if ( h < 45 ) {
		return 'orange';
	}
	if ( h < 70 ) {
		return 'yellow';
	}
	if ( h < 160 ) {
		return 'green';
	}
	if ( h < 195 ) {
		return 'teal';
	}
	if ( h < 255 ) {
		return 'blue';
	}
	if ( h < 290 ) {
		return 'purple';
	}
	return 'pink';
}

/**
 * The dominant color buckets of an image, most prominent first. Chromatic
 * buckets are weighted up so a colorful subject on a white background is not
 * drowned out by the background.
 *
 * @param {string} url       Same-origin image URL.
 * @param {number} [maxOut]  Max buckets to return (default 3).
 * @return {Promise<string[]>} Bucket names.
 */
export async function dominantColorBuckets( url, maxOut = 3 ) {
	const img = await loadImage( url );
	const n = 32;
	const canvas = createCanvas( n, n );
	const ctx = canvas.getContext( '2d', { willReadFrequently: true } );
	ctx.drawImage( img, 0, 0, n, n );
	const { data } = ctx.getImageData( 0, 0, n, n );

	const weights = {};
	for ( let i = 0; i < data.length; i += 4 ) {
		if ( data[ i + 3 ] < 128 ) {
			continue; // skip transparent pixels
		}
		const bucket = rgbToBucket( data[ i ], data[ i + 1 ], data[ i + 2 ] );
		// Neutrals count less so a real color wins ties.
		const w =
			'white' === bucket || 'black' === bucket || 'gray' === bucket
				? 0.35
				: 1;
		weights[ bucket ] = ( weights[ bucket ] || 0 ) + w;
	}

	const total = Object.values( weights ).reduce( ( a, x ) => a + x, 0 ) || 1;
	return Object.entries( weights )
		.filter( ( [ , w ] ) => w / total >= 0.12 )
		.sort( ( a, b ) => b[ 1 ] - a[ 1 ] )
		.slice( 0, maxOut )
		.map( ( [ name ] ) => name );
}
