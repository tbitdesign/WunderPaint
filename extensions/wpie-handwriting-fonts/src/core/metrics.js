/**
 * Heights, spacing and kerning.
 *
 * Two things decide whether a hand-made font reads as a typeface or as
 * a novelty. The heights have to agree across every letter, which is
 * why the drawing surface shows the very values written into the file
 * rather than a decorative grid. And the space around each letter has
 * to come from its actual ink rather than from the box it was drawn in,
 * because a hand-drawn box is never tight.
 */

import { contourBounds, translateContours } from './outline.js';

/** The heights a new project starts from, on a 1000 em square. */
export const DEFAULT_METRICS = {
	unitsPerEm: 1000,
	ascender: 800,
	descender: -200,
	capHeight: 700,
	xHeight: 500,
	lineGap: 0,
};

/** A sane default pen width for a fresh project. */
export const DEFAULT_PEN = 62;

/** The three weights one drawing yields, and what they do to the pen. */
export const WEIGHTS = [
	{ id: 'light', style: 'Light', weight: 300, widthFactor: 0.66, inkDelta: -12 },
	{ id: 'regular', style: 'Regular', weight: 400, widthFactor: 1, inkDelta: 0 },
	{ id: 'bold', style: 'Bold', weight: 700, widthFactor: 1.55, inkDelta: 18 },
];

/**
 * Place one glyph on its side bearings.
 *
 * The outline is moved so its ink starts at the left side bearing, and
 * the advance is the ink plus both bearings. In cursive mode the
 * bearings go negative instead, which is what lets the exit stroke of
 * one letter run into the entry stroke of the next.
 *
 * @param {Array}  contours Contours in drawing position.
 * @param {Object} opts     Options.
 * @param {number} opts.side     Base side bearing in units.
 * @param {number} opts.tracking Extra space on both sides, in units.
 * @param {boolean} opts.cursive Whether letters should join.
 * @param {number} opts.overlap  How far letters overlap when joining.
 * @param {number} opts.nudgeL   Per-glyph left correction.
 * @param {number} opts.nudgeR   Per-glyph right correction.
 * @return {Object} `{ contours, advance, lsb, rsb, bounds }`.
 */
export function placeGlyph( contours, opts = {} ) {
	const {
		side = 60,
		tracking = 0,
		cursive = false,
		overlap = 24,
		nudgeL = 0,
		nudgeR = 0,
	} = opts;
	const box = contourBounds( contours );
	if ( ! box ) {
		return { contours: [], advance: 0, lsb: 0, rsb: 0, bounds: null };
	}
	const base = cursive ? -overlap : side + tracking;
	const lsb = Math.round( base + nudgeL );
	const rsb = Math.round( base + nudgeR );
	const width = box.x1 - box.x0;
	const dx = lsb - box.x0;
	const shifted = translateContours( contours, dx );
	return {
		contours: shifted,
		advance: Math.max( 1, Math.round( lsb + width + rsb ) ),
		lsb,
		rsb,
		dx,
		bounds: contourBounds( shifted ),
	};
}

/**
 * The advance of the word space.
 *
 * Derived from the letters rather than fixed, so a wide open hand gets
 * a wide space and a cramped one does not end up with words glued
 * together.
 *
 * @param {number} avgAdvance Mean advance of the lowercase letters.
 * @param {Object} opts       `{ tracking, cursive }`.
 * @return {number} Advance in units.
 */
export function spaceAdvance( avgAdvance, { tracking = 0, cursive = false } = {} ) {
	const base = Math.max( 120, Math.round( avgAdvance * ( cursive ? 0.5 : 0.62 ) ) );
	return Math.max( 80, base + tracking * 2 );
}

/**
 * Flatten quadratic contours into polylines.
 *
 * @param {Array}  contours Contours of `{ x, y, on }`.
 * @param {number} steps    Segments per curve.
 * @return {Array} Arrays of `{ x, y }`.
 */
export function flatten( contours, steps = 8 ) {
	return ( contours || [] ).map( ( ring ) => {
		const out = [];
		const n = ring.length;
		if ( ! n ) {
			return out;
		}
		for ( let i = 0; i < n; i++ ) {
			const cur = ring[ i ];
			if ( cur.on ) {
				out.push( { x: cur.x, y: cur.y } );
				continue;
			}
			const a = lastOn( out, ring, i );
			const b = nextOnPoint( ring, i );
			for ( let s = 1; s <= steps; s++ ) {
				const t = s / steps;
				const u = 1 - t;
				out.push( {
					x: u * u * a.x + 2 * u * t * cur.x + t * t * b.x,
					y: u * u * a.y + 2 * u * t * cur.y + t * t * b.y,
				} );
			}
		}
		return out;
	} );
}

function lastOn( out, ring, i ) {
	if ( out.length ) {
		return out[ out.length - 1 ];
	}
	for ( let k = 1; k <= ring.length; k++ ) {
		const p = ring[ ( i - k + ring.length * 2 ) % ring.length ];
		if ( p.on ) {
			return p;
		}
	}
	return ring[ i ];
}

function nextOnPoint( ring, i ) {
	for ( let k = 1; k <= ring.length; k++ ) {
		const p = ring[ ( i + k ) % ring.length ];
		if ( p.on ) {
			return p;
		}
	}
	return ring[ i ];
}

/**
 * The left and right silhouette of a glyph, sampled in bands.
 *
 * Kerning is an optical judgement about how close two shapes come, and
 * a silhouette is the cheapest honest way to ask that question: it sees
 * the diagonal of an A and the arm of a T where a bounding box only
 * sees two rectangles that do not touch.
 *
 * @param {Array}  contours Placed contours.
 * @param {Object} metrics  Font metrics.
 * @param {number} bands    Number of vertical bands.
 * @return {Object} `{ left, right, filled }` typed arrays.
 */
export function edgeProfile( contours, metrics = DEFAULT_METRICS, bands = 24 ) {
	const top = metrics.ascender;
	const bottom = metrics.descender;
	const h = ( top - bottom ) / bands;
	const left = new Float32Array( bands ).fill( Infinity );
	const right = new Float32Array( bands ).fill( -Infinity );
	const filled = new Uint8Array( bands );
	for ( const ring of flatten( contours, 6 ) ) {
		for ( let i = 0; i < ring.length; i++ ) {
			const a = ring[ i ];
			const b = ring[ ( i + 1 ) % ring.length ];
			const steps = Math.max( 1, Math.ceil( Math.abs( b.y - a.y ) / ( h / 2 ) ) );
			for ( let s = 0; s <= steps; s++ ) {
				const t = s / steps;
				const x = a.x + ( b.x - a.x ) * t;
				const y = a.y + ( b.y - a.y ) * t;
				let k = Math.floor( ( y - bottom ) / h );
				if ( k < 0 ) {
					k = 0;
				}
				if ( k >= bands ) {
					k = bands - 1;
				}
				filled[ k ] = 1;
				if ( x < left[ k ] ) {
					left[ k ] = x;
				}
				if ( x > right[ k ] ) {
					right[ k ] = x;
				}
			}
		}
	}
	return { left, right, filled };
}

/**
 * Optical kerning across a set of placed glyphs.
 *
 * For each ordered pair the closest the two silhouettes come is
 * measured band by band; the pair is then pulled together or pushed
 * apart until that distance matches the target. Pairs that already sit
 * right, or that never see each other because their ink is at different
 * heights, produce nothing.
 *
 * @param {Array}  glyphs  `{ key, advance, profile }` records.
 * @param {Object} opts    Options.
 * @param {number} opts.target Desired optical distance in units.
 * @param {number} opts.limit  Largest correction allowed, in units.
 * @param {number} opts.minAbs Corrections smaller than this are dropped.
 * @return {Array} `[ leftKey, rightKey, value ]` triples.
 */
export function computeKerning( glyphs, opts = {} ) {
	const { target = 96, limit = 120, minAbs = 10 } = opts;
	const out = [];
	for ( const a of glyphs ) {
		if ( ! a.profile ) {
			continue;
		}
		for ( const b of glyphs ) {
			if ( ! b.profile ) {
				continue;
			}
			let gap = Infinity;
			for ( let i = 0; i < a.profile.filled.length; i++ ) {
				if ( ! a.profile.filled[ i ] || ! b.profile.filled[ i ] ) {
					continue;
				}
				const d = a.advance + b.profile.left[ i ] - a.profile.right[ i ];
				if ( d < gap ) {
					gap = d;
				}
			}
			if ( ! Number.isFinite( gap ) ) {
				continue;
			}
			let value = Math.round( target - gap );
			if ( value > limit ) {
				value = limit;
			}
			if ( value < -limit ) {
				value = -limit;
			}
			if ( Math.abs( value ) >= minAbs ) {
				out.push( [ a.key, b.key, value ] );
			}
		}
	}
	return out;
}

/**
 * Sanity-check user-entered metrics so a slip cannot produce a file no
 * shaper will touch.
 *
 * @param {Object} m Candidate metrics.
 * @return {Object} Corrected metrics.
 */
export function sanitizeMetrics( m ) {
	const upm = clamp( Math.round( m?.unitsPerEm || 1000 ), 64, 16384 );
	const asc = clamp( Math.round( m?.ascender ?? 800 ), 1, upm * 2 );
	const desc = clamp( Math.round( m?.descender ?? -200 ), -upm * 2, -1 );
	return {
		unitsPerEm: upm,
		ascender: asc,
		descender: desc,
		capHeight: clamp( Math.round( m?.capHeight ?? 700 ), 1, asc ),
		xHeight: clamp( Math.round( m?.xHeight ?? 500 ), 1, asc ),
		lineGap: clamp( Math.round( m?.lineGap ?? 0 ), 0, upm ),
	};
}

const clamp = ( v, lo, hi ) => ( v < lo ? lo : v > hi ? hi : v );
