/**
 * Pixel work, without a canvas.
 *
 * Everything here runs on plain typed arrays: stroking a polyline,
 * filling a contour, and growing or shrinking ink. Doing it by hand
 * rather than through a 2D context buys two things that matter. The
 * results are bit-identical in the browser and in `node --test`, so the
 * whole pipeline is testable without a headless browser, and the
 * rasteriser can stay tuned for the one case we care about: solid ink
 * on a clean field.
 *
 * Font units come in with y pointing up. Bitmaps are the usual y-down
 * grid, and `viewFor` is the only place that knows about the flip.
 */

import { halfWidthAt } from './strokes.js';

/**
 * A pen nib.
 *
 * Round is the default and costs nothing. A chisel nib is an ellipse
 * held at an angle: broad across the stroke in one direction, narrow in
 * the other, which is what makes calligraphy calligraphy. Sweeping an
 * ellipse along a line is the same as sweeping a circle along a squashed
 * line and unsqueezing the result, so the test below squashes the world
 * instead of thickening the maths: rotate into the nib's frame, stretch
 * the narrow axis back to round, and the ordinary distance test applies.
 *
 * @param {Object} nib `{ angle, ratio }`, ratio 1 being round.
 * @return {Object|null} Transform, or null when the nib is round.
 */
export function nibFrame( nib ) {
	const ratio = Math.max( 0.08, Math.min( 1, nib?.ratio ?? 1 ) );
	if ( ratio > 0.995 ) {
		return null;
	}
	const a = ( ( nib?.angle || 0 ) * Math.PI ) / 180;
	return { cos: Math.cos( -a ), sin: Math.sin( -a ), stretch: 1 / ratio };
}

const nibX = ( f, x, y ) => ( f ? x * f.cos - y * f.sin : x );
const nibY = ( f, x, y ) => ( f ? ( x * f.sin + y * f.cos ) * f.stretch : y );

/**
 * Allocate an empty bitmap.
 *
 * @param {number} w Width in pixels.
 * @param {number} h Height in pixels.
 * @return {Object} `{ w, h, data }` with `data` one byte per pixel.
 */
export function makeBitmap( w, h ) {
	return { w, h, data: new Uint8Array( Math.max( 0, w * h ) ) };
}

/**
 * Build the mapping from font units to a pixel grid around a box.
 *
 * @param {Object} box    `{ x0, y0, x1, y1 }` in font units.
 * @param {Object} opts   Options.
 * @param {number} opts.pxPerEm Pixels per em square.
 * @param {number} opts.pad     Padding in pixels around the ink.
 * @param {number} opts.unitsPerEm Em size in font units.
 * @return {Object} View `{ scale, ox, oy, w, h }`.
 */
export function viewFor( box, { pxPerEm = 768, pad = 4, unitsPerEm = 1000 } = {} ) {
	const scale = pxPerEm / unitsPerEm;
	const w = Math.max( 1, Math.ceil( ( box.x1 - box.x0 ) * scale ) + pad * 2 );
	const h = Math.max( 1, Math.ceil( ( box.y1 - box.y0 ) * scale ) + pad * 2 );
	return {
		scale,
		ox: box.x0 - pad / scale,
		oy: box.y1 + pad / scale,
		w,
		h,
	};
}

/** Font units to pixel column. */
export const toPx = ( view, x ) => ( x - view.ox ) * view.scale;
/** Font units to pixel row (this is where y flips). */
export const toPy = ( view, y ) => ( view.oy - y ) * view.scale;
/** Pixel column back to font units. */
export const toUx = ( view, px ) => px / view.scale + view.ox;
/** Pixel row back to font units. */
export const toUy = ( view, py ) => view.oy - py / view.scale;

/**
 * Draw strokes into a bitmap as round-capped, round-joined ink.
 *
 * Each segment is treated as a capsule whose radius ramps from one end
 * to the other, so pressure changes read as a swelling line rather than
 * a staircase of discs. Only the pixels inside a segment's own bounding
 * box are ever touched, which keeps the cost proportional to the ink
 * rather than to the canvas.
 *
 * @param {Array}  strokes Strokes `{ w, pts }` in font units.
 * @param {Object} view    View from `viewFor`.
 * @param {Object} opts    Options.
 * @param {number} opts.influence   Pressure influence, 0..1.
 * @param {number} opts.widthFactor Extra width multiplier (the weights).
 * @return {Object} Bitmap.
 */
export function strokesToBitmap( strokes, view, { influence = 0.5, widthFactor = 1, nib = null } = {} ) {
	const bmp = makeBitmap( view.w, view.h );
	const { data, w, h } = bmp;
	// The nib angle is given the way a right-handed person holds a pen,
	// measured in font space where y points up. Down here y points down,
	// so the angle turns the other way or the nib comes out mirrored.
	const frame = nibFrame( nib ? { ...nib, angle: -( nib.angle || 0 ) } : null );
	for ( const st of strokes || [] ) {
		const pts = st.pts || [];
		if ( ! pts.length ) {
			continue;
		}
		if ( 1 === pts.length ) {
			stampDisc(
				data,
				w,
				h,
				toPx( view, pts[ 0 ].x ),
				toPy( view, pts[ 0 ].y ),
				halfWidthAt( st.w * widthFactor, pts[ 0 ].p, influence ) * view.scale,
				frame
			);
			continue;
		}
		for ( let i = 1; i < pts.length; i++ ) {
			const a = pts[ i - 1 ];
			const b = pts[ i ];
			capsule(
				data,
				w,
				h,
				toPx( view, a.x ),
				toPy( view, a.y ),
				halfWidthAt( st.w * widthFactor, a.p, influence ) * view.scale,
				toPx( view, b.x ),
				toPy( view, b.y ),
				halfWidthAt( st.w * widthFactor, b.p, influence ) * view.scale,
				frame
			);
		}
	}
	return bmp;
}

function stampDisc( data, w, h, cx, cy, r, frame ) {
	const x0 = Math.max( 0, Math.floor( cx - r ) );
	const x1 = Math.min( w - 1, Math.ceil( cx + r ) );
	const y0 = Math.max( 0, Math.floor( cy - r ) );
	const y1 = Math.min( h - 1, Math.ceil( cy + r ) );
	const rr = r * r;
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const ox = x + 0.5 - cx;
			const oy = y + 0.5 - cy;
			const dx = nibX( frame, ox, oy );
			const dy = nibY( frame, ox, oy );
			if ( dx * dx + dy * dy <= rr ) {
				data[ y * w + x ] = 1;
			}
		}
	}
}

function capsule( data, w, h, ax, ay, ar, bx, by, br, frame ) {
	const maxR = Math.max( ar, br );
	// The bounding box stays in the world's own frame: whatever the nib
	// is doing, no ink lands further than its long axis from the line.
	const x0 = Math.max( 0, Math.floor( Math.min( ax, bx ) - maxR ) );
	const x1 = Math.min( w - 1, Math.ceil( Math.max( ax, bx ) + maxR ) );
	const y0 = Math.max( 0, Math.floor( Math.min( ay, by ) - maxR ) );
	const y1 = Math.min( h - 1, Math.ceil( Math.max( ay, by ) + maxR ) );
	const qax = nibX( frame, ax, ay );
	const qay = nibY( frame, ax, ay );
	const vx = nibX( frame, bx, by ) - qax;
	const vy = nibY( frame, bx, by ) - qay;
	const len2 = vx * vx + vy * vy;
	for ( let y = y0; y <= y1; y++ ) {
		for ( let x = x0; x <= x1; x++ ) {
			const px = nibX( frame, x + 0.5, y + 0.5 );
			const py = nibY( frame, x + 0.5, y + 0.5 );
			let t = len2 > 0 ? ( ( px - qax ) * vx + ( py - qay ) * vy ) / len2 : 0;
			t = t < 0 ? 0 : t > 1 ? 1 : t;
			const dx = px - ( qax + vx * t );
			const dy = py - ( qay + vy * t );
			const r = ar + ( br - ar ) * t;
			if ( dx * dx + dy * dy <= r * r ) {
				data[ y * w + x ] = 1;
			}
		}
	}
}

/**
 * Fill closed contours into a bitmap using the non-zero rule.
 *
 * This is the way back from outlines to pixels, which the scanned path
 * needs when it re-renders a glyph at a different weight.
 *
 * @param {Array}  contours Arrays of `{ x, y }` in font units.
 * @param {Object} view     View from `viewFor`.
 * @return {Object} Bitmap.
 */
export function fillContours( contours, view ) {
	const bmp = makeBitmap( view.w, view.h );
	const { data, w, h } = bmp;
	const edges = [];
	for ( const ring of contours || [] ) {
		const n = ring.length;
		for ( let i = 0; i < n; i++ ) {
			const a = ring[ i ];
			const b = ring[ ( i + 1 ) % n ];
			const ay = toPy( view, a.y );
			const by = toPy( view, b.y );
			if ( ay === by ) {
				continue;
			}
			edges.push( {
				x0: toPx( view, a.x ),
				y0: ay,
				x1: toPx( view, b.x ),
				y1: by,
				dir: by > ay ? 1 : -1,
			} );
		}
	}
	if ( ! edges.length ) {
		return bmp;
	}
	const hits = [];
	for ( let y = 0; y < h; y++ ) {
		const sy = y + 0.5;
		hits.length = 0;
		for ( const e of edges ) {
			const lo = Math.min( e.y0, e.y1 );
			const hi = Math.max( e.y0, e.y1 );
			if ( sy < lo || sy >= hi ) {
				continue;
			}
			const t = ( sy - e.y0 ) / ( e.y1 - e.y0 );
			hits.push( { x: e.x0 + ( e.x1 - e.x0 ) * t, dir: e.dir } );
		}
		if ( hits.length < 2 ) {
			continue;
		}
		hits.sort( ( a, b ) => a.x - b.x );
		let wind = 0;
		for ( let i = 0; i < hits.length - 1; i++ ) {
			wind += hits[ i ].dir;
			if ( 0 === wind ) {
				continue;
			}
			const from = Math.max( 0, Math.ceil( hits[ i ].x - 0.5 ) );
			const to = Math.min( w - 1, Math.floor( hits[ i + 1 ].x - 0.5 ) );
			for ( let x = from; x <= to; x++ ) {
				data[ y * w + x ] = 1;
			}
		}
	}
	return bmp;
}

/**
 * Chamfer distance transform: for every pixel, the approximate distance
 * to the nearest set pixel of `target`.
 *
 * The 5-7-11 weights land within about two percent of true Euclidean
 * distance in two sweeps, which is far more accuracy than growing a
 * stroke by a couple of units needs.
 *
 * @param {Object}  bmp    Bitmap.
 * @param {number}  target Value counted as the seed (1 or 0).
 * @return {Float32Array} Distances in pixels.
 */
export function distanceField( bmp, target = 1 ) {
	const { w, h, data } = bmp;
	const D = new Float32Array( w * h );
	const BIG = 1e9;
	const A = 5 / 5;
	const B = 7 / 5;
	const C = 11 / 5;
	for ( let i = 0; i < D.length; i++ ) {
		D[ i ] = data[ i ] === target ? 0 : BIG;
	}
	const relax = ( i, j, cost ) => {
		const v = D[ j ] + cost;
		if ( v < D[ i ] ) {
			D[ i ] = v;
		}
	};
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if ( 0 === D[ i ] ) {
				continue;
			}
			if ( x > 0 ) {
				relax( i, i - 1, A );
			}
			if ( y > 0 ) {
				relax( i, i - w, A );
				if ( x > 0 ) {
					relax( i, i - w - 1, B );
				}
				if ( x < w - 1 ) {
					relax( i, i - w + 1, B );
				}
			}
			if ( y > 1 ) {
				if ( x > 0 ) {
					relax( i, i - 2 * w - 1, C );
				}
				if ( x < w - 1 ) {
					relax( i, i - 2 * w + 1, C );
				}
			}
			if ( x > 1 && y > 0 ) {
				relax( i, i - w - 2, C );
			}
			if ( x < w - 2 && y > 0 ) {
				relax( i, i - w + 2, C );
			}
		}
	}
	for ( let y = h - 1; y >= 0; y-- ) {
		for ( let x = w - 1; x >= 0; x-- ) {
			const i = y * w + x;
			if ( 0 === D[ i ] ) {
				continue;
			}
			if ( x < w - 1 ) {
				relax( i, i + 1, A );
			}
			if ( y < h - 1 ) {
				relax( i, i + w, A );
				if ( x < w - 1 ) {
					relax( i, i + w + 1, B );
				}
				if ( x > 0 ) {
					relax( i, i + w - 1, B );
				}
			}
			if ( y < h - 2 ) {
				if ( x < w - 1 ) {
					relax( i, i + 2 * w + 1, C );
				}
				if ( x > 0 ) {
					relax( i, i + 2 * w - 1, C );
				}
			}
			if ( x < w - 2 && y < h - 1 ) {
				relax( i, i + w + 2, C );
			}
			if ( x > 1 && y < h - 1 ) {
				relax( i, i + w - 2, C );
			}
		}
	}
	return D;
}

/**
 * Grow (positive radius) or shrink (negative) the ink of a bitmap.
 *
 * This is how a scanned glyph gets a second weight: there is no stroke
 * centre line to re-draw, so the ink itself is thickened or thinned.
 *
 * @param {Object} bmp    Bitmap (not modified).
 * @param {number} radius Pixels to grow, negative to shrink.
 * @return {Object} New bitmap.
 */
export function morph( bmp, radius ) {
	if ( ! radius ) {
		return { w: bmp.w, h: bmp.h, data: bmp.data.slice() };
	}
	const out = makeBitmap( bmp.w, bmp.h );
	if ( radius > 0 ) {
		const D = distanceField( bmp, 1 );
		for ( let i = 0; i < D.length; i++ ) {
			out.data[ i ] = D[ i ] <= radius ? 1 : 0;
		}
	} else {
		const D = distanceField( bmp, 0 );
		for ( let i = 0; i < D.length; i++ ) {
			out.data[ i ] = D[ i ] > -radius ? 1 : 0;
		}
	}
	return out;
}

/** How many pixels carry ink. Handy in tests and for empty checks. */
export function inkCount( bmp ) {
	let n = 0;
	for ( let i = 0; i < bmp.data.length; i++ ) {
		n += bmp.data[ i ] ? 1 : 0;
	}
	return n;
}
