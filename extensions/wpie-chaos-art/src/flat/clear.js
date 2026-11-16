/**
 * Room for the page's own text (v1.13).
 *
 * A Chaos Art piece covers the whole page, and on a website a headline
 * stands on it. The critic always kept one quiet window - but one it
 * picked for itself, anywhere. Here the quiet places are where the
 * document's text sits: every visible text layer, a little grown so the
 * letters breathe, becomes a zone in frame units (x from 0 to the
 * aspect, y from 0 to 1, the sheet's own coordinates). The painters
 * place nothing loud there; underpainting may pass, softened. Pure
 * arithmetic, no canvas - the tests check it as numbers.
 */

// More of the page than this under text, and there is nothing left to
// paint around: then the painters use the whole sheet.
export const CLEAR_MAX_SHARE = 0.5;
// How strongly underpainting that crosses a zone is softened.
export const CALM = 0.25;

const DEG = Math.PI / 180;

/** Is a layer drawn: itself and every group above it visible? */
function shown( layer, byId ) {
	let cur = layer;
	const seen = new Set();
	while ( cur && ! seen.has( cur.id ) ) {
		seen.add( cur.id );
		if ( false === cur.visible || ( cur.opacity ?? 1 ) < 0.05 ) {
			return false;
		}
		cur = cur.parent ? byId.get( cur.parent ) : null;
	}
	return true;
}

/** The outermost group a layer belongs to (itself when it has none). */
function rootOf( layer, byId ) {
	let cur = layer;
	const seen = new Set();
	while ( cur && cur.parent && ! seen.has( cur.id ) ) {
		seen.add( cur.id );
		const up = byId.get( cur.parent );
		if ( ! up ) {
			break;
		}
		cur = up;
	}
	return cur;
}

/**
 * The quiet zones for a sheet laid over `box` (document pixels).
 *
 * @param {Object[]} layers  The document's flat layer list (0 = back).
 * @param {Object}   box     { x, y, w, h } the picture will cover.
 * @param {number}   aspect  The sheet's width over its height.
 * @param {Object}   [o]
 * @param {number}   [o.above] Only text above this flat index counts (an
 *                             update keeps its place in the stack; text
 *                             under the picture is hidden anyway).
 * @return {{zones: Object[], ids: string[], below: number, tooMuch: boolean}}
 *   zones { x0, y0, x1, y1 } in frame units; `below` the flat index the
 *   picture goes in at so all of that text stays in front of it.
 */
export function textZones( layers, box, aspect, { above = -1 } = {} ) {
	const list = layers || [];
	const byId = new Map( list.map( ( l ) => [ l.id, l ] ) );
	const zones = [];
	const ids = [];
	let below = Infinity;
	if ( ! box || box.w <= 0 || box.h <= 0 || ! ( aspect > 0 ) ) {
		return { zones, ids, below: -1, tooMuch: false };
	}
	list.forEach( ( l, index ) => {
		if (
			! l ||
			'text' !== l.type ||
			! String( l.text || '' ).trim() ||
			index <= above ||
			! shown( l, byId ) ||
			! ( l.w > 0 && l.h > 0 )
		) {
			return;
		}
		// The box as it is drawn: turned about its centre.
		const a = ( l.rot || 0 ) * DEG;
		const c = Math.abs( Math.cos( a ) );
		const s = Math.abs( Math.sin( a ) );
		const hw = ( l.w * c + l.h * s ) / 2;
		const hh = ( l.w * s + l.h * c ) / 2;
		const cx = l.x + l.w / 2;
		const cy = l.y + l.h / 2;
		const fx = ( v ) => ( ( v - box.x ) / box.w ) * aspect;
		const fy = ( v ) => ( v - box.y ) / box.h;
		let x0 = fx( cx - hw );
		let x1 = fx( cx + hw );
		let y0 = fy( cy - hh );
		let y1 = fy( cy + hh );
		// Air around the letters: a little everywhere, more for big type.
		const m = 0.025 + 0.12 * Math.min( x1 - x0, y1 - y0 );
		x0 = Math.max( 0, x0 - m );
		y0 = Math.max( 0, y0 - m );
		x1 = Math.min( aspect, x1 + m );
		y1 = Math.min( 1, y1 + m );
		if (
			x1 - x0 <= 0 ||
			y1 - y0 <= 0 ||
			( x1 - x0 ) * ( y1 - y0 ) < 4e-4
		) {
			return;
		}
		zones.push( { x0, y0, x1, y1 } );
		ids.push( l.id );
		const root = rootOf( l, byId );
		below = Math.min( below, index, root ? list.indexOf( root ) : index );
	} );
	const tooMuch = zoneShare( zones, aspect ) > CLEAR_MAX_SHARE;
	return {
		zones: tooMuch ? [] : zones,
		ids: tooMuch ? [] : ids,
		below: zones.length && ! tooMuch ? below : -1,
		tooMuch,
	};
}

/** How much of the sheet the zones cover together (overlaps once). */
export function zoneShare( zones, aspect, rows = 60 ) {
	if ( ! zones.length ) {
		return 0;
	}
	const cols = Math.max( 1, Math.round( rows * aspect ) );
	let hit = 0;
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < cols; x++ ) {
			if (
				inZones(
					zones,
					( ( x + 0.5 ) / cols ) * aspect,
					( y + 0.5 ) / rows
				)
			) {
				hit++;
			}
		}
	}
	return hit / ( rows * cols );
}

/** Is the frame point inside any zone? */
export function inZones( zones, x, y ) {
	for ( const z of zones ) {
		if ( x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 ) {
			return true;
		}
	}
	return false;
}

/**
 * The share of a mark's points inside the zones: brush points ({x, y})
 * or a prepared mark's bounds - a stroke that only grazes a zone stays.
 */
export function markShare( pts, zones ) {
	if ( ! pts || ! pts.length || ! zones.length ) {
		return 0;
	}
	let n = 0;
	for ( const p of pts ) {
		const x = Array.isArray( p ) ? p[ 0 ] : p.x;
		const y = Array.isArray( p ) ? p[ 1 ] : p.y;
		if ( inZones( zones, x, y ) ) {
			n++;
		}
	}
	return n / pts.length;
}

/**
 * A place outside the zones, drawn with `rng`, anywhere on the sheet -
 * never just past the zone's edge, or the displaced marks would frame
 * the text in a ring of paint. Null only when the zones leave nothing.
 */
export function outside( zones, aspect, rng ) {
	for ( let k = 0; k < 24; k++ ) {
		const p = [ rng() * aspect, rng() ];
		if ( ! inZones( zones, p[ 0 ], p[ 1 ] ) ) {
			return p;
		}
	}
	return null;
}

// A cut stroke runs out instead of stopping blunt: the point at the cut
// keeps this share of its width.
const TAPER = 0.35;

/** The parameter span [t0, t1] of segment a-b inside one zone, or null. */
function segmentIn( ax, ay, bx, by, z ) {
	let t0 = 0;
	let t1 = 1;
	const dx = bx - ax;
	const dy = by - ay;
	for ( const [ p, q ] of [
		[ -dx, ax - z.x0 ],
		[ dx, z.x1 - ax ],
		[ -dy, ay - z.y0 ],
		[ dy, z.y1 - ay ],
	] ) {
		if ( 0 === p ) {
			if ( q < 0 ) {
				return null;
			}
			continue;
		}
		const r = q / p;
		if ( p < 0 ) {
			t0 = Math.max( t0, r );
		} else {
			t1 = Math.min( t1, r );
		}
		if ( t0 > t1 ) {
			return null;
		}
	}
	return [ t0, t1 ];
}

/**
 * A path cut where it crosses the zones: the runs that stay outside,
 * each tapered at its cuts. Points are {x, y, w, ...} or [x, y]; a path
 * that never enters a zone comes back as `[ pts ]`, the same array.
 * Every segment is clipped, so even a two-point line across a zone is
 * caught.
 */
export function splitOutside( pts, zones ) {
	if ( ! pts || pts.length < 2 || ! zones.length ) {
		return [ pts ];
	}
	const arr = Array.isArray( pts[ 0 ] );
	const X = ( p ) => ( arr ? p[ 0 ] : p.x );
	const Y = ( p ) => ( arr ? p[ 1 ] : p.y );
	const at = ( a, b, t, cut ) => {
		const x = X( a ) + ( X( b ) - X( a ) ) * t;
		const y = Y( a ) + ( Y( b ) - Y( a ) ) * t;
		if ( arr ) {
			return [ x, y ];
		}
		const p = { ...( t < 0.5 ? a : b ), x, y };
		if ( Number.isFinite( a.w ) && Number.isFinite( b.w ) ) {
			p.w = ( a.w + ( b.w - a.w ) * t ) * ( cut ? TAPER : 1 );
		}
		return p;
	};
	const runs = [];
	let run = [];
	let touched = false;
	for ( let i = 1; i < pts.length; i++ ) {
		const a = pts[ i - 1 ];
		const b = pts[ i ];
		// The spans of this segment inside any zone, merged.
		const spans = [];
		for ( const z of zones ) {
			const s = segmentIn( X( a ), Y( a ), X( b ), Y( b ), z );
			if ( s && s[ 1 ] > s[ 0 ] ) {
				spans.push( s );
			}
		}
		spans.sort( ( u, v ) => u[ 0 ] - v[ 0 ] );
		const merged = [];
		for ( const s of spans ) {
			const last = merged[ merged.length - 1 ];
			if ( last && s[ 0 ] <= last[ 1 ] ) {
				last[ 1 ] = Math.max( last[ 1 ], s[ 1 ] );
			} else {
				merged.push( s.slice() );
			}
		}
		if ( ! merged.length ) {
			if ( ! run.length ) {
				run.push( a );
			}
			run.push( b );
			continue;
		}
		touched = true;
		// The outside pieces of this segment, between the inside spans.
		let from = 0;
		for ( const [ s0, s1 ] of merged ) {
			if ( s0 > from ) {
				if ( ! run.length ) {
					run.push( from > 0 ? at( a, b, from, true ) : a );
				}
				run.push( at( a, b, s0, true ) );
			}
			if ( run.length >= 2 ) {
				runs.push( run );
			}
			run = [];
			from = s1;
		}
		if ( from < 1 ) {
			run.push( at( a, b, from, true ) );
			run.push( b );
		}
	}
	if ( ! touched ) {
		return [ pts ];
	}
	if ( run.length >= 2 ) {
		runs.push( run );
	}
	return runs;
}

/**
 * The composition built around the text, the way a designer would: a
 * planned mass or the focal spot that sits in a zone moves out of it by
 * the shortest way that stays on the sheet (plus a little air) - the
 * picture's weight next to the headline, not under it. Deterministic,
 * no dice: the plan was drawn already, this only moves it.
 */
export function composeAround( plan, zones, aspect ) {
	if ( ! plan || ! zones.length ) {
		return plan;
	}
	const GAP = 0.06;
	const EDGE = 0.05;
	const away = ( x, y ) => {
		if ( ! inZones( zones, x, y ) ) {
			return null;
		}
		let best = null;
		for ( const z of zones ) {
			if ( ! ( x >= z.x0 && x <= z.x1 && y >= z.y0 && y <= z.y1 ) ) {
				continue;
			}
			for ( const [ cx, cy ] of [
				[ z.x0 - GAP, y ],
				[ z.x1 + GAP, y ],
				[ x, z.y0 - GAP ],
				[ x, z.y1 + GAP ],
			] ) {
				if (
					cx < EDGE ||
					cx > aspect - EDGE ||
					cy < EDGE ||
					cy > 1 - EDGE ||
					inZones( zones, cx, cy )
				) {
					continue;
				}
				const d = Math.hypot( cx - x, cy - y );
				if ( ! best || d < best.d ) {
					best = { x: cx, y: cy, d };
				}
			}
		}
		return best;
	};
	for ( const m of plan.masses || [] ) {
		const to = away( m.cx, m.cy );
		if ( to ) {
			m.cx = to.x;
			m.cy = to.y;
		}
	}
	if ( plan.focal ) {
		const to = away( plan.focal.x, plan.focal.y );
		if ( to ) {
			plan.focal = { x: to.x, y: to.y };
		}
	}
	return plan;
}
