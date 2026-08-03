/**
 * Dominant-color extraction (v2.0): coarse RGB bucketing over a downscaled
 * copy, then a vibrancy-weighted, perceptually spread selection so the
 * palette carries variety (not six shades of one dominant color) and does
 * not bury saturated accents under a dull background.
 */

import { createCanvas } from './raster';

// Perceptual-ish weighted RGB distance (same weights the recolor snap uses).
const dist2 = ( a, b ) =>
	3 * ( a.r - b.r ) * ( a.r - b.r ) +
	4 * ( a.g - b.g ) * ( a.g - b.g ) +
	2 * ( a.b - b.b ) * ( a.b - b.b );

// 0..1 saturation (HSV style): 0 = gray, 1 = pure hue.
const saturation = ( r, g, b ) => {
	const mx = Math.max( r, g, b );
	const mn = Math.min( r, g, b );
	return mx ? ( mx - mn ) / mx : 0;
};

/**
 * @param {HTMLCanvasElement} source Canvas to sample.
 * @param {number}            k      Colors to return.
 * @return {string[]} Hex colors, most important first.
 */
export function extractPalette( source, k = 6 ) {
	if ( ! source?.width || ! source?.height ) {
		return [];
	}
	const size = 64;
	const scale = Math.min( 1, size / Math.max( source.width, source.height ) );
	const w = Math.max( 1, Math.round( source.width * scale ) );
	const h = Math.max( 1, Math.round( source.height * scale ) );
	const small = createCanvas( w, h );
	const ctx = small.getContext( '2d' );
	ctx.drawImage( source, 0, 0, w, h );
	const { data } = ctx.getImageData( 0, 0, w, h );

	// 4 bits per channel → 4096 buckets; track sums for a nicer average.
	const buckets = new Map();
	for ( let i = 0; i < data.length; i += 4 ) {
		if ( data[ i + 3 ] < 128 ) {
			continue;
		}
		const key =
			( ( data[ i ] >> 4 ) << 8 ) |
			( ( data[ i + 1 ] >> 4 ) << 4 ) |
			( data[ i + 2 ] >> 4 );
		let b = buckets.get( key );
		if ( ! b ) {
			b = { n: 0, r: 0, g: 0, b: 0 };
			buckets.set( key, b );
		}
		b.n++;
		b.r += data[ i ];
		b.g += data[ i + 1 ];
		b.b += data[ i + 2 ];
	}
	if ( ! buckets.size ) {
		return [];
	}

	// Averaged candidate colors, scored by frequency with a gentle vibrancy
	// bonus so a saturated accent is not buried under a dull dominant color
	// (specks still need real frequency to rank, so noise stays out).
	const candidates = [];
	for ( const b of buckets.values() ) {
		const r = b.r / b.n;
		const g = b.g / b.n;
		const bl = b.b / b.n;
		candidates.push( {
			r,
			g,
			b: bl,
			n: b.n,
			score: b.n * ( 1 + 0.6 * saturation( r, g, bl ) ),
		} );
	}
	candidates.sort( ( a, b ) => b.score - a.score );

	// Greedy spread: take the highest-scoring colors that are perceptually
	// distinct from those already chosen, so the palette has variety. The
	// threshold is roughly a 22/channel just-noticeable difference.
	const minDist = 4400;
	const picked = [];
	for ( const c of candidates ) {
		if ( picked.length >= k ) {
			break;
		}
		if ( picked.every( ( p ) => dist2( p, c ) >= minDist ) ) {
			picked.push( c );
		}
	}
	// Few distinct colors in the image: top up with the next best candidates
	// so callers still get up to k entries.
	if ( picked.length < k ) {
		for ( const c of candidates ) {
			if ( picked.length >= k ) {
				break;
			}
			if ( ! picked.includes( c ) ) {
				picked.push( c );
			}
		}
	}

	const hex = ( v ) =>
		Math.max( 0, Math.min( 255, Math.round( v ) ) )
			.toString( 16 )
			.padStart( 2, '0' );
	return picked.map(
		( c ) => `#${ hex( c.r ) }${ hex( c.g ) }${ hex( c.b ) }`
	);
}
