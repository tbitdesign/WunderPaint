/**
 * Stroke expansion: turn a polyline (sampled from an SVG stroke, e.g.
 * a Tabler icon) into closed outline polygons that an extruder can
 * fill. Pure 2D math - no three.js - so it is unit-testable in node.
 *
 * Open strokes become one outline (right side out, round cap, left
 * side back, round cap). Closed strokes become an outer ring plus an
 * inner hole ring. Joins use angle-bisector offsets with a miter
 * clamp, which reads as round-ish at icon scale.
 */

const EPS = 1e-6;

/** Deduplicate consecutive (near-)identical points. */
export function cleanPoints( pts ) {
	const out = [];
	for ( const p of pts || [] ) {
		const last = out[ out.length - 1 ];
		if ( ! last || Math.hypot( p.x - last.x, p.y - last.y ) > EPS ) {
			out.push( { x: p.x, y: p.y } );
		}
	}
	// A closing duplicate of the first point drops too.
	if (
		out.length > 2 &&
		Math.hypot(
			out[ 0 ].x - out[ out.length - 1 ].x,
			out[ 0 ].y - out[ out.length - 1 ].y
		) <= EPS
	) {
		out.pop();
	}
	return out;
}

/** Whether a raw sampled subpath closes on itself. */
export function isClosedRing( pts ) {
	if ( ! pts || pts.length < 3 ) {
		return false;
	}
	const a = pts[ 0 ];
	const b = pts[ pts.length - 1 ];
	return Math.hypot( a.x - b.x, a.y - b.y ) <= EPS * 1000;
}

/**
 * Offset a clean polyline by `d` (positive = left of travel). Returns
 * one point per input point, bisector-based with a miter clamp.
 */
export function offsetLine( pts, d, closed ) {
	const n = pts.length;
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		const prev = pts[ closed ? ( i - 1 + n ) % n : Math.max( 0, i - 1 ) ];
		const next = pts[ closed ? ( i + 1 ) % n : Math.min( n - 1, i + 1 ) ];
		const cur = pts[ i ];
		// Normals of the incoming and outgoing segments.
		let ax = cur.x - prev.x;
		let ay = cur.y - prev.y;
		let bx = next.x - cur.x;
		let by = next.y - cur.y;
		const al = Math.hypot( ax, ay ) || 1;
		const bl = Math.hypot( bx, by ) || 1;
		ax /= al;
		ay /= al;
		bx /= bl;
		by /= bl;
		// First/last point of an open line only have one segment.
		if ( ! closed && 0 === i ) {
			ax = bx;
			ay = by;
		}
		if ( ! closed && i === n - 1 ) {
			bx = ax;
			by = ay;
		}
		const n1 = { x: -ay, y: ax };
		const n2 = { x: -by, y: bx };
		let mx = n1.x + n2.x;
		let my = n1.y + n2.y;
		const ml = Math.hypot( mx, my );
		if ( ml < EPS ) {
			// 180° turn: fall back to the incoming normal.
			mx = n1.x;
			my = n1.y;
		} else {
			mx /= ml;
			my /= ml;
		}
		// Miter length grows with the angle; clamp to stay icon-safe.
		const cos = Math.max( 0.35, ( 1 + ( n1.x * n2.x + n1.y * n2.y ) ) / 2 );
		const scale = Math.min( 1 / Math.sqrt( cos ), 2.2 );
		out.push( { x: cur.x + mx * d * scale, y: cur.y + my * d * scale } );
	}
	return out;
}

/**
 * Half-circle cap around `center`, from angle a0 sweeping -PI: the
 * left-edge end (dir+90°) swings over the tip (dir) to the right edge
 * (dir-90°), i.e. around the OUTSIDE of the line end.
 */
function capArc( center, a0, r, segments = 8 ) {
	const pts = [];
	for ( let i = 1; i < segments; i++ ) {
		const a = a0 - ( i / segments ) * Math.PI;
		pts.push( {
			x: center.x + Math.cos( a ) * r,
			y: center.y + Math.sin( a ) * r,
		} );
	}
	return pts;
}

/**
 * Expand one sampled stroke subpath into outline rings.
 *
 * @param {Array}  raw   Sampled points [{x,y}].
 * @param {number} width Stroke width.
 * @return {Array} Rings: [{ points, hole }] - hole rings belong to the
 *                 ring right before them.
 */
export function strokeOutline( raw, width ) {
	const pts = cleanPoints( raw );
	if ( pts.length < 2 || width <= 0 ) {
		return [];
	}
	const r = width / 2;
	if ( isClosedRing( raw ) && pts.length >= 3 ) {
		// Which offset side is "outside" depends on the winding -
		// the bigger ring is the outer one, the smaller the hole.
		const a = offsetLine( pts, r, true );
		const b = offsetLine( pts, -r, true );
		const areaOf = ( ring ) => {
			let sum = 0;
			for ( let i = 0; i < ring.length; i++ ) {
				const p = ring[ i ];
				const q = ring[ ( i + 1 ) % ring.length ];
				sum += p.x * q.y - q.x * p.y;
			}
			return Math.abs( sum / 2 );
		};
		const outer = areaOf( a ) >= areaOf( b ) ? a : b;
		const inner = outer === a ? b : a;
		return [
			{ points: outer, hole: false },
			{ points: inner, hole: true },
		];
	}
	const left = offsetLine( pts, r, false );
	const right = offsetLine( pts, -r, false );
	const last = pts[ pts.length - 1 ];
	const first = pts[ 0 ];
	// Cap angles follow the segment directions at the ends.
	const dirEnd = Math.atan2(
		last.y - pts[ pts.length - 2 ].y,
		last.x - pts[ pts.length - 2 ].x
	);
	const dirStart = Math.atan2(
		pts[ 1 ].y - first.y,
		pts[ 1 ].x - first.x
	);
	const ring = [
		...left,
		...capArc( last, dirEnd + Math.PI / 2, r ),
		...right.slice().reverse(),
		...capArc( first, dirStart - Math.PI / 2, r ),
	];
	return [ { points: ring, hole: false } ];
}
