/** Pixel fill with independent sampling, selection coverage and gap closing. */
import { parseColor } from './color';

/**
 * Paint matching pixels over a destination. Source and mask use the same
 * pixel coordinates as the destination. Neither is modified.
 *
 * @param {HTMLCanvasElement} canvas Destination.
 * @param {number} x Click x.
 * @param {number} y Click y.
 * @param {string} color Fill color.
 * @param {Object} opts Sampling, opacity and selection options.
 * @return {boolean} Whether any destination pixel changed.
 */
export function fillBucketCanvas( canvas, x, y, color, opts = {} ) {
	const { source = canvas, mask = null, contiguous = true } = opts;
	const opacity = Math.max( 0, Math.min( 1, opts.opacity ?? 1 ) );
	const tolerance = Math.max( 0, Math.min( 255, opts.tolerance ?? 32 ) );
	const fill = parseColor( color );
	const w = canvas.width;
	const h = canvas.height;
	const sx = Math.floor( x );
	const sy = Math.floor( y );
	if ( ! opacity || ! fill.a || sx < 0 || sy < 0 || sx >= w || sy >= h ) {
		return false;
	}
	const ctx = canvas.getContext( '2d' );
	const image = ctx.getImageData( 0, 0, w, h );
	const original =
		source === canvas
			? image.data
			: source.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
	const coverage = mask?.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
	const start = sy * w + sx;
	if ( coverage && ! coverage[ start * 4 + 3 ] ) {
		return false;
	}
	const seed = original.slice( start * 4, start * 4 + 4 );
	const allowed = new Uint8Array( w * h );
	for ( let p = 0; p < allowed.length; p++ ) {
		const i = p * 4;
		// Fully transparent RGB values are invisible and cannot divide a region.
		allowed[ p ] =
			Math.abs( original[ i + 3 ] - seed[ 3 ] ) <= tolerance &&
			( ( ! original[ i + 3 ] && ! seed[ 3 ] ) ||
				( Math.abs( original[ i ] - seed[ 0 ] ) <= tolerance &&
					Math.abs( original[ i + 1 ] - seed[ 1 ] ) <= tolerance &&
					Math.abs( original[ i + 2 ] - seed[ 2 ] ) <= tolerance ) )
				? 1
				: 0;
	}
	const gap = Math.max( 0, Math.min( 8, Math.round( opts.gap || 0 ) ) );
	if ( contiguous && gap ) {
		// Bridge short horizontal and vertical breaks in the sampled outline.
		// Read the original boundary so one bridge cannot create more bridges.
		const originalRegion = allowed.slice();
		const columns = new Int32Array( w ).fill( -1 );
		for ( let row = 0; row < h; row++ ) {
			let previous = -1;
			for ( let col = 0; col < w; col++ ) {
				if ( originalRegion[ row * w + col ] ) {
					continue;
				}
				if ( previous >= 0 && col - previous - 1 <= gap ) {
					for ( let k = previous + 1; k < col; k++ ) {
						allowed[ row * w + k ] = 0;
					}
				}
				if ( columns[ col ] >= 0 && row - columns[ col ] - 1 <= gap ) {
					for ( let k = columns[ col ] + 1; k < row; k++ ) {
						allowed[ k * w + col ] = 0;
					}
				}
				previous = col;
				columns[ col ] = row;
			}
		}
	}
	if ( coverage ) {
		for ( let p = 0; p < allowed.length; p++ ) {
			if ( ! coverage[ p * 4 + 3 ] ) {
				allowed[ p ] = 0;
			}
		}
	}
	let changed = false;
	const paint = ( p ) => {
		const i = p * 4;
		const dst = image.data;
		const a = opacity * fill.a * ( coverage ? coverage[ i + 3 ] / 255 : 1 );
		const oldAlpha = dst[ i + 3 ] / 255;
		const outAlpha = a + oldAlpha * ( 1 - a );
		if ( ! outAlpha ) {
			return;
		}
		const next = [ fill.r, fill.g, fill.b ].map( ( c, channel ) =>
			Math.round(
				( c * a + dst[ i + channel ] * oldAlpha * ( 1 - a ) ) / outAlpha
			)
		);
		next.push( Math.round( outAlpha * 255 ) );
		for ( let c = 0; c < 4; c++ ) {
			changed = changed || dst[ i + c ] !== next[ c ];
			dst[ i + c ] = next[ c ];
		}
	};
	if ( contiguous ) {
		const stack = [];
		const visit = ( p ) => {
			if ( allowed[ p ] ) {
				allowed[ p ] = 0;
				stack.push( p );
			}
		};
		visit( start );
		while ( stack.length ) {
			const p = stack.pop();
			paint( p );
			if ( p % w ) {
				visit( p - 1 );
			}
			if ( p % w < w - 1 ) {
				visit( p + 1 );
			}
			if ( p >= w ) {
				visit( p - w );
			}
			if ( p < w * ( h - 1 ) ) {
				visit( p + w );
			}
		}
	} else {
		for ( let p = 0; p < allowed.length; p++ ) {
			if ( allowed[ p ] ) {
				paint( p );
			}
		}
	}
	if ( changed ) {
		ctx.putImageData( image, 0, 0 );
	}
	return changed;
}
