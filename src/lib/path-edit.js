/**
 * Path edit engine (v1.118): parses a shape's pathD into editable
 * anchor subpaths (bezier handles preserved) and builds it back. The
 * normalizer reduces every SVG path to absolute M/L/C/Q/Z, so pen
 * shapes AND icon paths round-trip; quads are elevated to cubics so
 * the editor has a single handle model. All coordinates are
 * layer-local, the same space pathD lives in.
 */

import { ensureNormalizedPathD } from './path';

const NUM = /[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g;

const fmt = ( n ) => {
	const r = Math.round( n * 100 ) / 100;
	return Object.is( r, -0 ) ? '0' : String( r );
};
const pt = ( p ) => `${ fmt( p.x ) } ${ fmt( p.y ) }`;
const lerp = ( a, b, t ) => ( {
	x: a.x + ( b.x - a.x ) * t,
	y: a.y + ( b.y - a.y ) * t,
} );

/**
 * Parse pathD into subpaths of anchors: [{ anchors: [{x, y, hIn, hOut}],
 * closed }]. Returns null when the path cannot be expressed (should not
 * happen after normalization) - callers hide the edit mode then.
 * @param d
 */
export function parsePathAnchors( d ) {
	const tokens =
		ensureNormalizedPathD( String( d || '' ) ).match( NUM ) || [];
	const subs = [];
	let cur = null;
	let i = 0;
	let cmd = null;
	const num = () => parseFloat( tokens[ i++ ] );
	while ( i < tokens.length ) {
		if ( /[a-zA-Z]/.test( tokens[ i ] ) ) {
			cmd = tokens[ i++ ];
		}
		switch ( cmd ) {
			case 'M':
				cur = {
					anchors: [ { x: num(), y: num(), hIn: null, hOut: null } ],
					closed: false,
				};
				subs.push( cur );
				cmd = 'L';
				break;
			case 'L': {
				if ( ! cur ) {
					return null;
				}
				cur.anchors.push( {
					x: num(),
					y: num(),
					hIn: null,
					hOut: null,
				} );
				break;
			}
			case 'C': {
				if ( ! cur ) {
					return null;
				}
				const c1 = { x: num(), y: num() };
				const c2 = { x: num(), y: num() };
				cur.anchors[ cur.anchors.length - 1 ].hOut = c1;
				cur.anchors.push( { x: num(), y: num(), hIn: c2, hOut: null } );
				break;
			}
			case 'Q': {
				// Elevate to cubic: one handle model for the editor.
				if ( ! cur ) {
					return null;
				}
				const prev = cur.anchors[ cur.anchors.length - 1 ];
				const qx = num();
				const qy = num();
				const px = num();
				const py = num();
				prev.hOut = {
					x: prev.x + ( 2 / 3 ) * ( qx - prev.x ),
					y: prev.y + ( 2 / 3 ) * ( qy - prev.y ),
				};
				cur.anchors.push( {
					x: px,
					y: py,
					hIn: {
						x: px + ( 2 / 3 ) * ( qx - px ),
						y: py + ( 2 / 3 ) * ( qy - py ),
					},
					hOut: null,
				} );
				break;
			}
			case 'Z':
			case 'z': {
				if ( ! cur ) {
					return null;
				}
				cur.closed = true;
				// A closing curve ends on a duplicate of the first anchor:
				// merge so the loop has one anchor per corner.
				const a = cur.anchors;
				if ( a.length > 1 ) {
					const first = a[ 0 ];
					const last = a[ a.length - 1 ];
					if (
						Math.abs( first.x - last.x ) < 0.01 &&
						Math.abs( first.y - last.y ) < 0.01
					) {
						first.hIn = last.hIn;
						a.pop();
					}
				}
				cur = null;
				break;
			}
			default:
				return null;
		}
	}
	return subs.length && subs.every( ( s ) => s.anchors.length >= 1 )
		? subs
		: null;
}

const segD = ( prev, cur ) =>
	prev.hOut || cur.hIn
		? ` C ${ pt( prev.hOut || prev ) } ${ pt( cur.hIn || cur ) } ${ pt(
				cur
		  ) }`
		: ` L ${ pt( cur ) }`;

/**
 * Anchors back to pathD (round-trips with parsePathAnchors).
 * @param subs
 */
export function buildPathD( subs ) {
	let d = '';
	for ( const s of subs ) {
		const a = s.anchors;
		if ( ! a.length ) {
			continue;
		}
		d += ( d ? ' ' : '' ) + `M ${ pt( a[ 0 ] ) }`;
		for ( let i = 1; i < a.length; i++ ) {
			d += segD( a[ i - 1 ], a[ i ] );
		}
		if ( s.closed && a.length > 1 ) {
			const last = a[ a.length - 1 ];
			const first = a[ 0 ];
			if ( last.hOut || first.hIn ) {
				d += segD( last, first );
			}
			d += ' Z';
		}
	}
	return d;
}

/**
 * Bounds over anchors and handles (superset of the curve, same rule the
 * pen tool uses).
 * @param subs
 * @param pad
 */
export function pathBounds( subs, pad = 4 ) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for ( const s of subs ) {
		for ( const a of s.anchors ) {
			for ( const p of [ a, a.hIn, a.hOut ] ) {
				if ( p ) {
					minX = Math.min( minX, p.x );
					minY = Math.min( minY, p.y );
					maxX = Math.max( maxX, p.x );
					maxY = Math.max( maxY, p.y );
				}
			}
		}
	}
	if ( ! isFinite( minX ) ) {
		return { x: 0, y: 0, w: 1, h: 1 };
	}
	return {
		x: minX - pad,
		y: minY - pad,
		w: Math.max( 1, maxX - minX + 2 * pad ),
		h: Math.max( 1, maxY - minY + 2 * pad ),
	};
}

/**
 * Shrink a path layer's box to the actual path extents and rebase the
 * pathD to the box origin (v1.130.0). Generators used to hand out boxes
 * from the DOCUMENT origin (x 0, y 0, w = chart right edge), so charts
 * carried hundreds of phantom padding pixels depending on where they
 * were placed. No-op when the path cannot be parsed.
 *
 * @param {Object} layer Shape layer with pathD in layer-local coords.
 * @param {number} [pad] Extra padding in px (half the stroke width).
 * @return {Object} Layer with a tight box, or the input unchanged.
 */
export function tightenPathLayer( layer, pad = 0 ) {
	const subs = parsePathAnchors( layer.pathD );
	if ( ! subs || ! subs.length ) {
		return layer;
	}
	const b = pathBounds( subs, pad );
	return {
		...layer,
		x: b.x,
		y: b.y,
		w: b.w,
		h: b.h,
		pathD: buildPathD( shiftSubs( subs, -b.x, -b.y ) ),
	};
}

/**
 * Translate every anchor and handle (used to rebase into a new box).
 * @param subs
 * @param dx
 * @param dy
 */
export function shiftSubs( subs, dx, dy ) {
	const mv = ( p ) => ( p ? { x: p.x + dx, y: p.y + dy } : null );
	return subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( {
			...a,
			x: a.x + dx,
			y: a.y + dy,
			hIn: mv( a.hIn ),
			hOut: mv( a.hOut ),
		} ) ),
	} ) );
}

/** Segment list of a subpath: [from, to] anchor indices incl. the closing one. */
const segments = ( s ) => {
	const list = [];
	for ( let i = 1; i < s.anchors.length; i++ ) {
		list.push( [ i - 1, i ] );
	}
	if ( s.closed && s.anchors.length > 1 ) {
		list.push( [ s.anchors.length - 1, 0 ] );
	}
	return list;
};

const segPoint = ( a, b, t ) => {
	if ( ! a.hOut && ! b.hIn ) {
		return lerp( a, b, t );
	}
	const p1 = a.hOut || a;
	const p2 = b.hIn || b;
	const q0 = lerp( a, p1, t );
	const q1 = lerp( p1, p2, t );
	const q2 = lerp( p2, b, t );
	const r0 = lerp( q0, q1, t );
	const r1 = lerp( q1, q2, t );
	return lerp( r0, r1, t );
};

/**
 * Closest point on the outline within maxDist, or null.
 * @param subs
 * @param p
 * @param maxDist
 * @return {Object|null} { si, seg, t, x, y, dist }
 */
export function nearestOnPath( subs, p, maxDist ) {
	let best = null;
	subs.forEach( ( s, si ) => {
		segments( s ).forEach( ( [ ia, ib ], seg ) => {
			const a = s.anchors[ ia ];
			const b = s.anchors[ ib ];
			const steps = ! a.hOut && ! b.hIn ? 16 : 32;
			for ( let k = 0; k <= steps; k++ ) {
				const t = k / steps;
				const q = segPoint( a, b, t );
				const dist = Math.hypot( q.x - p.x, q.y - p.y );
				if ( dist <= maxDist && ( ! best || dist < best.dist ) ) {
					best = { si, seg, t, x: q.x, y: q.y, dist };
				}
			}
		} );
	} );
	return best;
}

/**
 * Split the segment at t (de Casteljau for cubics, lerp for lines) and
 * insert the new anchor. Returns new subs.
 * @param subs
 * @param si
 * @param seg
 * @param t
 */
export function insertAnchor( subs, si, seg, t ) {
	const next = subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( { ...a } ) ),
	} ) );
	const s = next[ si ];
	const [ ia, ib ] = segments( s )[ seg ];
	const a = s.anchors[ ia ];
	const b = s.anchors[ ib ];
	let mid;
	if ( ! a.hOut && ! b.hIn ) {
		mid = { ...lerp( a, b, t ), hIn: null, hOut: null };
	} else {
		const p1 = a.hOut || a;
		const p2 = b.hIn || b;
		const q0 = lerp( a, p1, t );
		const q1 = lerp( p1, p2, t );
		const q2 = lerp( p2, b, t );
		const r0 = lerp( q0, q1, t );
		const r1 = lerp( q1, q2, t );
		mid = { ...lerp( r0, r1, t ), hIn: r0, hOut: r1 };
		// Both halves of a split cubic are cubics: degenerate controls
		// (equal to the endpoint) keep one-sided curves shape-identical.
		a.hOut = q0;
		b.hIn = q2;
	}
	s.anchors.splice( ib === 0 ? s.anchors.length : ib, 0, mid );
	return next;
}

/**
 * Remove an anchor (keeps at least 2 on open, 3 on closed subpaths).
 * @param subs
 * @param si
 * @param ai
 */
export function deleteAnchor( subs, si, ai ) {
	const s = subs[ si ];
	if ( ! s || s.anchors.length <= ( s.closed ? 3 : 2 ) ) {
		return subs;
	}
	return subs.map( ( sub, i ) =>
		i === si
			? { ...sub, anchors: sub.anchors.filter( ( _, j ) => j !== ai ) }
			: sub
	);
}

/**
 * Corner <-> smooth: with handles they are removed; without, symmetric
 * handles are derived from the neighbor directions.
 * @param subs
 * @param si
 * @param ai
 */
export function toggleSmooth( subs, si, ai ) {
	const next = subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( { ...a } ) ),
	} ) );
	const s = next[ si ];
	const a = s.anchors[ ai ];
	if ( a.hIn || a.hOut ) {
		a.hIn = null;
		a.hOut = null;
		return next;
	}
	const n = s.anchors.length;
	const prev = s.anchors[ ( ai - 1 + n ) % n ];
	const nxt = s.anchors[ ( ai + 1 ) % n ];
	const usePrev = s.closed || ai > 0 ? prev : a;
	const useNext = s.closed || ai < n - 1 ? nxt : a;
	let dx = useNext.x - usePrev.x;
	let dy = useNext.y - usePrev.y;
	const len = Math.hypot( dx, dy ) || 1;
	dx /= len;
	dy /= len;
	const inLen = Math.hypot( a.x - usePrev.x, a.y - usePrev.y ) / 3 || 8;
	const outLen = Math.hypot( useNext.x - a.x, useNext.y - a.y ) / 3 || 8;
	if ( s.closed || ai > 0 ) {
		a.hIn = { x: a.x - dx * inLen, y: a.y - dy * inLen };
	}
	if ( s.closed || ai < n - 1 ) {
		a.hOut = { x: a.x + dx * outLen, y: a.y + dy * outLen };
	}
	return next;
}
