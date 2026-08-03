/**
 * Adaptive palette snap for Vectorize (v1.128.0). Flat artwork traced
 * straight from a PNG/JPEG grows mushy multi-colored fringes: the
 * anti-aliased edge pixels (and JPEG ringing) between two fills form
 * their own thin color clusters and every one becomes an SVG path.
 *
 * Fix: detect flat artwork, build its real palette from the massive
 * color bins, and snap every pixel (including all edge blends) to the
 * nearest palette color BEFORE tracing. Photos are detected and left
 * untouched - they have neither constant fills nor a dominant palette.
 */

// A color bin must hold at least this share of the pixels to FOUND a
// palette color; smaller bins (edge blends, ringing) only get mapped.
const MASSIVE_SHARE = 0.005;
// Palette colors closer than this RGB distance melt into one.
const MERGE_DIST = 32;
// Flat artwork: most horizontal neighbor pairs are EXACTLY equal…
const MIN_EQUAL_NEIGHBORS = 0.65;
// …and most pixels live in massive bins. Photos fail both.
const MIN_DOMINANT_SHARE = 0.7;

const binKey = ( d, i ) =>
	( ( d[ i ] >> 4 ) << 8 ) |
	( ( d[ i + 1 ] >> 4 ) << 4 ) |
	( d[ i + 2 ] >> 4 );

/**
 * Snap flat artwork to its dominant palette, in place.
 *
 * @param {ImageData} imageData RGBA pixels (mutated when flat).
 * @param {Object}    [opts]    { maxColors } palette cap (default 48).
 * @return {boolean} True when the image was detected as flat artwork and
 *                   snapped; false leaves the pixels untouched (photo).
 */
export function posterizeFlat( imageData, opts = {} ) {
	const { data, width: w, height: h } = imageData;
	const maxColors = opts.maxColors || 48;

	// Signal 1: constant fills - share of exactly equal neighbor pairs.
	let eq = 0;
	let pairs = 0;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 1; x < w; x++ ) {
			const i = ( y * w + x ) * 4;
			const j = i - 4;
			if ( data[ i + 3 ] < 128 && data[ j + 3 ] < 128 ) {
				continue; // fully transparent pairs say nothing
			}
			pairs++;
			if (
				data[ i ] === data[ j ] &&
				data[ i + 1 ] === data[ j + 1 ] &&
				data[ i + 2 ] === data[ j + 2 ] &&
				data[ i + 3 ] === data[ j + 3 ]
			) {
				eq++;
			}
		}
	}
	if ( ! pairs || eq / pairs < MIN_EQUAL_NEIGHBORS ) {
		return false;
	}

	// Histogram on 4-bit bins (means kept per bin for exact palette colors).
	const bins = new Map(); // key -> [count, rSum, gSum, bSum]
	let opaque = 0;
	for ( let i = 0; i < w * h * 4; i += 4 ) {
		if ( data[ i + 3 ] < 128 ) {
			continue;
		}
		opaque++;
		const key = binKey( data, i );
		let b = bins.get( key );
		if ( ! b ) {
			b = [ 0, 0, 0, 0 ];
			bins.set( key, b );
		}
		b[ 0 ]++;
		b[ 1 ] += data[ i ];
		b[ 2 ] += data[ i + 1 ];
		b[ 3 ] += data[ i + 2 ];
	}
	if ( ! opaque ) {
		return false;
	}

	// Signal 2: a dominant palette - most pixels sit in massive bins.
	const massive = Math.max( 64, opaque * MASSIVE_SHARE );
	let dominant = 0;
	for ( const b of bins.values() ) {
		if ( b[ 0 ] >= massive ) {
			dominant += b[ 0 ];
		}
	}
	if ( dominant / opaque < MIN_DOMINANT_SHARE ) {
		return false;
	}

	// Palette: massive bins found colors, near-duplicates melt together
	// (weighted), so JPEG ringing joins its parent instead of surviving.
	const sorted = [ ...bins.values() ].sort( ( a, b ) => b[ 0 ] - a[ 0 ] );
	const palette = []; // [r, g, b, weight]
	for ( const b of sorted ) {
		if ( b[ 0 ] < massive ) {
			break;
		}
		const r = b[ 1 ] / b[ 0 ];
		const g = b[ 2 ] / b[ 0 ];
		const bl = b[ 3 ] / b[ 0 ];
		let hit = null;
		for ( const pc of palette ) {
			if (
				Math.hypot( pc[ 0 ] - r, pc[ 1 ] - g, pc[ 2 ] - bl ) <
				MERGE_DIST
			) {
				hit = pc;
				break;
			}
		}
		if ( hit ) {
			const wSum = hit[ 3 ] + b[ 0 ];
			hit[ 0 ] = ( hit[ 0 ] * hit[ 3 ] + r * b[ 0 ] ) / wSum;
			hit[ 1 ] = ( hit[ 1 ] * hit[ 3 ] + g * b[ 0 ] ) / wSum;
			hit[ 2 ] = ( hit[ 2 ] * hit[ 3 ] + bl * b[ 0 ] ) / wSum;
			hit[ 3 ] = wSum;
		} else if ( palette.length < maxColors ) {
			palette.push( [ r, g, bl, b[ 0 ] ] );
		}
	}
	if ( ! palette.length ) {
		return false;
	}

	// Per-bin nearest palette color, pixels snap via their bin. Alpha is
	// binarized so soft edges cannot fringe against transparency either.
	const lut = new Map();
	for ( const [ key, b ] of bins ) {
		const r = b[ 1 ] / b[ 0 ];
		const g = b[ 2 ] / b[ 0 ];
		const bl = b[ 3 ] / b[ 0 ];
		let bi = 0;
		let bd = Infinity;
		for ( let p = 0; p < palette.length; p++ ) {
			const d =
				( palette[ p ][ 0 ] - r ) * ( palette[ p ][ 0 ] - r ) +
				( palette[ p ][ 1 ] - g ) * ( palette[ p ][ 1 ] - g ) +
				( palette[ p ][ 2 ] - bl ) * ( palette[ p ][ 2 ] - bl );
			if ( d < bd ) {
				bd = d;
				bi = p;
			}
		}
		lut.set( key, palette[ bi ] );
	}
	for ( let i = 0; i < w * h * 4; i += 4 ) {
		if ( data[ i + 3 ] < 128 ) {
			data[ i + 3 ] = 0;
			continue;
		}
		const c = lut.get( binKey( data, i ) );
		data[ i ] = Math.round( c[ 0 ] );
		data[ i + 1 ] = Math.round( c[ 1 ] );
		data[ i + 2 ] = Math.round( c[ 2 ] );
		data[ i + 3 ] = 255;
	}
	return true;
}
