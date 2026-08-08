/**
 * The stroke model: what a drawn glyph actually is.
 *
 * A glyph drawn by hand is a list of strokes, and a stroke is a
 * polyline with a nominal width plus a pressure value per point. This
 * is the master data of the whole extension: it is what gets stored,
 * and every outline, every weight and every slant is derived from it
 * later. Nothing here knows about pixels or fonts.
 *
 * Coordinates are font units on a 1000 em square, x to the right and
 * y UP from the baseline, which is the convention the font file wants.
 * The drawing surface converts on the way in and out.
 */

/** Pressure a device reports when it has no idea (mice, some pens). */
export const NEUTRAL_PRESSURE = 0.5;

/**
 * Drop points that sit on top of each other, which pointer devices
 * emit in bursts and which would make smoothing and tracing wobble.
 *
 * @param {Array}  pts    Points `{ x, y, p }`.
 * @param {number} minDst Minimum distance to keep a point.
 * @return {Array} Cleaned points.
 */
export function dedupe( pts, minDst = 0.5 ) {
	const out = [];
	for ( const pt of pts || [] ) {
		const last = out[ out.length - 1 ];
		if ( ! last || Math.hypot( pt.x - last.x, pt.y - last.y ) >= minDst ) {
			out.push( pt );
		}
	}
	if ( 1 === out.length && pts.length > 1 ) {
		// A dot: keep the last sample too so it still has a direction.
		out.push( pts[ pts.length - 1 ] );
	}
	return out;
}

/**
 * Smooth a polyline while pinning both ends.
 *
 * A plain windowed average, applied `passes` times. It is deliberately
 * boring: predictable, cheap, and it never invents overshoot the way a
 * spline fit can, which matters because the user is watching the line
 * appear under the cursor.
 *
 * @param {Array}  pts    Points `{ x, y, p }`.
 * @param {number} passes How often to average (0 disables).
 * @return {Array} Smoothed points.
 */
export function smooth( pts, passes = 1 ) {
	let cur = ( pts || [] ).slice();
	for ( let n = 0; n < passes; n++ ) {
		if ( cur.length < 3 ) {
			return cur;
		}
		const next = [ cur[ 0 ] ];
		for ( let i = 1; i < cur.length - 1; i++ ) {
			const a = cur[ i - 1 ];
			const b = cur[ i ];
			const c = cur[ i + 1 ];
			next.push( {
				x: ( a.x + 2 * b.x + c.x ) / 4,
				y: ( a.y + 2 * b.y + c.y ) / 4,
				p: ( a.p + 2 * b.p + c.p ) / 4,
			} );
		}
		next.push( cur[ cur.length - 1 ] );
		cur = next;
	}
	return cur;
}

/**
 * Resample a polyline to roughly even spacing.
 *
 * Even spacing is what makes the width ramp look smooth and keeps the
 * rasteriser's per-segment cost predictable.
 *
 * @param {Array}  pts     Points `{ x, y, p }`.
 * @param {number} spacing Target distance between points, in units.
 * @return {Array} Resampled points.
 */
export function resample( pts, spacing = 8 ) {
	const src = pts || [];
	if ( src.length < 2 || spacing <= 0 ) {
		return src.slice();
	}
	const out = [ src[ 0 ] ];
	let carry = 0;
	for ( let i = 1; i < src.length; i++ ) {
		const a = src[ i - 1 ];
		const b = src[ i ];
		const seg = Math.hypot( b.x - a.x, b.y - a.y );
		if ( seg <= 0 ) {
			continue;
		}
		let t = spacing - carry;
		while ( t <= seg ) {
			const f = t / seg;
			out.push( {
				x: a.x + ( b.x - a.x ) * f,
				y: a.y + ( b.y - a.y ) * f,
				p: a.p + ( b.p - a.p ) * f,
			} );
			t += spacing;
		}
		carry = ( carry + seg ) % spacing;
	}
	const last = src[ src.length - 1 ];
	const tail = out[ out.length - 1 ];
	if ( Math.hypot( last.x - tail.x, last.y - tail.y ) > spacing * 0.25 ) {
		out.push( last );
	}
	return out;
}

/**
 * Prepare a freshly drawn stroke for storage.
 *
 * @param {Array}  raw       Raw pointer samples `{ x, y, p }`.
 * @param {Object} opts      Options.
 * @param {number} opts.smoothing 0..100 smoothing amount.
 * @param {number} opts.width Nominal stroke width in units.
 * @return {Object|null} `{ w, pts }` or null when nothing was drawn.
 */
export function finishStroke( raw, { smoothing = 40, width = 60 } = {} ) {
	const cleaned = dedupe( raw, 1.5 );
	if ( ! cleaned.length ) {
		return null;
	}
	const passes = Math.round( ( Math.max( 0, Math.min( 100, smoothing ) ) / 100 ) * 6 );
	const pts = resample( smooth( cleaned, passes ), 10 );
	return { w: width, pts };
}

/**
 * Effective half width at one point.
 *
 * @param {number} base      Nominal stroke width.
 * @param {number} pressure  0..1 pressure at the point.
 * @param {number} influence 0..1 how much pressure is allowed to matter.
 * @return {number} Half width in units.
 */
export function halfWidthAt( base, pressure, influence = 0.5 ) {
	const p = 'number' === typeof pressure ? pressure : NEUTRAL_PRESSURE;
	const factor = 1 + influence * ( p - NEUTRAL_PRESSURE ) * 1.6;
	return ( base * Math.max( 0.25, Math.min( 2, factor ) ) ) / 2;
}

/**
 * Bounding box of a set of strokes, widened by the ink they carry.
 *
 * This is the real ink extent, which is exactly what side bearings and
 * the accent placement need. An empty set returns null rather than a
 * zero box, so callers cannot mistake "nothing" for "a dot at origin".
 *
 * @param {Array}  strokes   Strokes `{ w, pts }`.
 * @param {number} influence Pressure influence used for the width.
 * @return {Object|null} `{ x0, y0, x1, y1 }` or null.
 */
export function strokeBounds( strokes, influence = 0.5 ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const st of strokes || [] ) {
		for ( const pt of st.pts || [] ) {
			const r = halfWidthAt( st.w, pt.p, influence );
			x0 = Math.min( x0, pt.x - r );
			y0 = Math.min( y0, pt.y - r );
			x1 = Math.max( x1, pt.x + r );
			y1 = Math.max( y1, pt.y + r );
		}
	}
	return Number.isFinite( x0 ) ? { x0, y0, x1, y1 } : null;
}

/**
 * Affine map over strokes, used for slanting and for nudging a glyph.
 *
 * @param {Array}  strokes Strokes.
 * @param {Object} m       `{ a, b, c, d, e, f }` (as in a 2x3 matrix).
 * @return {Array} New strokes.
 */
export function transform( strokes, m ) {
	const { a = 1, b = 0, c = 0, d = 1, e = 0, f = 0 } = m || {};
	return ( strokes || [] ).map( ( st ) => ( {
		w: st.w,
		pts: ( st.pts || [] ).map( ( pt ) => ( {
			x: a * pt.x + c * pt.y + e,
			y: b * pt.x + d * pt.y + f,
			p: pt.p,
		} ) ),
	} ) );
}

/**
 * Slant strokes around the baseline, which is how the italic is made.
 *
 * @param {Array}  strokes Strokes.
 * @param {number} degrees Slant angle, positive leans right.
 * @return {Array} New strokes.
 */
export function slant( strokes, degrees ) {
	if ( ! degrees ) {
		return ( strokes || [] ).slice();
	}
	return transform( strokes, { c: Math.tan( ( degrees * Math.PI ) / 180 ) } );
}

/**
 * Scale every stroke's nominal width, which is how the weights are made.
 *
 * @param {Array}  strokes Strokes.
 * @param {number} factor  Width multiplier.
 * @return {Array} New strokes.
 */
export function reweight( strokes, factor ) {
	return ( strokes || [] ).map( ( st ) => ( {
		w: st.w * factor,
		pts: ( st.pts || [] ).slice(),
	} ) );
}

/**
 * Split the tittle off an i or j.
 *
 * The accented forms of i need the dotless base, and asking someone to
 * draw a letter they never write on its own would be silly. The dot is
 * the stroke whose ink sits entirely above the x-height and covers a
 * small area, which is a description the letter i satisfies and almost
 * nothing else does.
 *
 * @param {Array}  strokes  Strokes of the drawn i or j.
 * @param {number} xHeight  x-height in units.
 * @return {Array} Strokes without the tittle.
 */
export function stripTittle( strokes, xHeight ) {
	const list = strokes || [];
	if ( list.length < 2 ) {
		return list.slice();
	}
	const kept = list.filter( ( st ) => {
		const b = strokeBounds( [ st ] );
		if ( ! b ) {
			return false;
		}
		const small = b.x1 - b.x0 < xHeight * 0.5 && b.y1 - b.y0 < xHeight * 0.5;
		return ! ( small && b.y0 >= xHeight * 0.92 );
	} );
	return kept.length ? kept : list.slice();
}
