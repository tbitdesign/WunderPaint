/**
 * Turning ink into outlines.
 *
 * The path is deliberately short: follow the cracks between ink and
 * background to get exact closed loops, thin those loops down with
 * Ramer-Douglas-Peucker, decide which of the surviving corners are real
 * corners, and run a smooth curve through everything in between.
 *
 * Working on the pixel cracks rather than pixel centres means the loops
 * are closed and non-self-intersecting by construction, which is the
 * property that makes the rest of the pipeline safe. The staircase this
 * leaves behind is one pixel tall, and at the resolution the glyphs are
 * rendered with that is roughly one unit on a 1000 em square, which no
 * reader will ever meet.
 */

/**
 * Follow the ink boundary of a bitmap and return closed pixel loops.
 *
 * Every ink pixel contributes the edges that face background, oriented
 * so that following them keeps ink on one consistent side. The loops
 * therefore close on themselves without any searching. Where two ink
 * pixels touch only at a corner, the walk crosses the diagonal, so a
 * thin diagonal stroke stays one shape instead of falling apart into a
 * string of squares.
 *
 * @param {Object} bmp Bitmap `{ w, h, data }`.
 * @return {Array} Loops, each an array of `{ x, y }` in pixel units.
 */
export function traceBitmap( bmp ) {
	const { w, h, data } = bmp;
	const ink = ( x, y ) => x >= 0 && y >= 0 && x < w && y < h && data[ y * w + x ];
	const segs = [];
	const from = new Map();
	const key = ( x, y ) => x * 100003 + y;
	const push = ( ax, ay, bx, by ) => {
		const i = segs.length;
		segs.push( { ax, ay, bx, by, used: false } );
		const k = key( ax, ay );
		const list = from.get( k );
		if ( list ) {
			list.push( i );
		} else {
			from.set( k, [ i ] );
		}
	};
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( ! ink( x, y ) ) {
				continue;
			}
			if ( ! ink( x, y - 1 ) ) {
				push( x, y, x + 1, y );
			}
			if ( ! ink( x + 1, y ) ) {
				push( x + 1, y, x + 1, y + 1 );
			}
			if ( ! ink( x, y + 1 ) ) {
				push( x + 1, y + 1, x, y + 1 );
			}
			if ( ! ink( x - 1, y ) ) {
				push( x, y + 1, x, y );
			}
		}
	}

	const loops = [];
	for ( let start = 0; start < segs.length; start++ ) {
		if ( segs[ start ].used ) {
			continue;
		}
		const loop = [];
		let cur = start;
		while ( cur >= 0 && ! segs[ cur ].used ) {
			const s = segs[ cur ];
			s.used = true;
			loop.push( { x: s.ax, y: s.ay } );
			cur = nextSegment( segs, from.get( key( s.bx, s.by ) ), s );
		}
		if ( loop.length >= 4 ) {
			loops.push( collapse( loop ) );
		}
	}
	return loops;
}

/**
 * Pick the continuation at a junction.
 *
 * Only diagonal touches produce a choice at all. Taking the turn that
 * bends one consistent way there is what decides whether diagonally
 * touching pixels count as connected, and for handwriting they must.
 *
 * @param {Array}  segs     All segments.
 * @param {Array}  outgoing Candidate indices leaving the shared point.
 * @param {Object} incoming The segment we arrived on.
 * @return {number} Index of the next segment, or -1.
 */
function nextSegment( segs, outgoing, incoming ) {
	if ( ! outgoing || ! outgoing.length ) {
		return -1;
	}
	const free = outgoing.filter( ( i ) => ! segs[ i ].used );
	if ( ! free.length ) {
		return -1;
	}
	if ( 1 === free.length ) {
		return free[ 0 ];
	}
	const dx = incoming.bx - incoming.ax;
	const dy = incoming.by - incoming.ay;
	let best = free[ 0 ];
	let bestCross = Infinity;
	for ( const i of free ) {
		const s = segs[ i ];
		const cross = dx * ( s.by - s.ay ) - dy * ( s.bx - s.ax );
		if ( cross < bestCross ) {
			bestCross = cross;
			best = i;
		}
	}
	return best;
}

/** Merge runs of collinear pixel-crack points, which are very common. */
function collapse( loop ) {
	const out = [];
	const n = loop.length;
	for ( let i = 0; i < n; i++ ) {
		const prev = loop[ ( i - 1 + n ) % n ];
		const cur = loop[ i ];
		const next = loop[ ( i + 1 ) % n ];
		const ax = cur.x - prev.x;
		const ay = cur.y - prev.y;
		const bx = next.x - cur.x;
		const by = next.y - cur.y;
		if ( ax * by - ay * bx !== 0 ) {
			out.push( cur );
		}
	}
	return out.length >= 3 ? out : loop;
}

/** Signed area of a closed polygon (positive is counter-clockwise). */
export function signedArea( ring ) {
	let a = 0;
	for ( let i = 0; i < ring.length; i++ ) {
		const p = ring[ i ];
		const q = ring[ ( i + 1 ) % ring.length ];
		a += p.x * q.y - q.x * p.y;
	}
	return a / 2;
}

/** Even-odd point in polygon, used to work out contour nesting. */
export function pointInRing( pt, ring ) {
	let inside = false;
	for ( let i = 0, j = ring.length - 1; i < ring.length; j = i++ ) {
		const a = ring[ i ];
		const b = ring[ j ];
		if ( a.y > pt.y !== b.y > pt.y ) {
			const x = ( ( b.x - a.x ) * ( pt.y - a.y ) ) / ( b.y - a.y ) + a.x;
			if ( pt.x < x ) {
				inside = ! inside;
			}
		}
	}
	return inside;
}

/**
 * Take the pixel quantisation out of a traced ring.
 *
 * A traced boundary is the true curve plus a half-pixel staircase, and
 * that staircase does more damage than its size suggests. It inflates
 * the path length unevenly, by up to the square root of two where the
 * shape runs diagonally and not at all where it runs straight, so
 * chord-length parameters stop tracking arc length. A curve fitter that
 * measures its error at those parameters then sees a large error where
 * the curve is geometrically fine, gives up, splits, and repeats. In
 * measurements this was the difference between four hundred and forty
 * eight curve segments at two hundred units of error, and twenty eight
 * segments at one.
 *
 * Two passes are enough. The staircase is what disappears; the shape,
 * being much larger than a pixel, stays where it was.
 *
 * @param {Array}  ring   Closed ring of points.
 * @param {number} passes How many averaging passes.
 * @return {Array} Smoothed ring.
 */
export function smoothRing( ring, passes = 2 ) {
	let cur = ring;
	for ( let k = 0; k < passes; k++ ) {
		const n = cur.length;
		if ( n < 5 ) {
			return cur;
		}
		const next = new Array( n );
		for ( let i = 0; i < n; i++ ) {
			const a = cur[ ( i - 1 + n ) % n ];
			const b = cur[ i ];
			const c = cur[ ( i + 1 ) % n ];
			next[ i ] = { x: ( a.x + 2 * b.x + c.x ) / 4, y: ( a.y + 2 * b.y + c.y ) / 4 };
		}
		cur = next;
	}
	return cur;
}

/**
 * Ramer-Douglas-Peucker on a closed ring.
 *
 * @param {Array}  ring Points.
 * @param {number} tol  Tolerance in the ring's own units.
 * @return {Array} Simplified ring.
 */
export function simplifyRing( ring, tol ) {
	if ( ring.length < 4 || tol <= 0 ) {
		return ring.slice();
	}
	// Anchor on the two points furthest apart so the split is stable.
	let ai = 0;
	let bi = 0;
	let best = -1;
	for ( let i = 1; i < ring.length; i++ ) {
		const d = Math.hypot( ring[ i ].x - ring[ 0 ].x, ring[ i ].y - ring[ 0 ].y );
		if ( d > best ) {
			best = d;
			bi = i;
		}
	}
	best = -1;
	for ( let i = 0; i < ring.length; i++ ) {
		const d = Math.hypot( ring[ i ].x - ring[ bi ].x, ring[ i ].y - ring[ bi ].y );
		if ( d > best ) {
			best = d;
			ai = i;
		}
	}
	const first = [];
	const second = [];
	for ( let i = ai; i !== bi; i = ( i + 1 ) % ring.length ) {
		first.push( ring[ i ] );
	}
	first.push( ring[ bi ] );
	for ( let i = bi; i !== ai; i = ( i + 1 ) % ring.length ) {
		second.push( ring[ i ] );
	}
	second.push( ring[ ai ] );
	const out = rdp( first, tol ).concat( rdp( second, tol ).slice( 1, -1 ) );
	return out.length >= 3 ? out : ring.slice();
}

function rdp( pts, tol ) {
	if ( pts.length < 3 ) {
		return pts.slice();
	}
	const a = pts[ 0 ];
	const b = pts[ pts.length - 1 ];
	let idx = -1;
	let far = -1;
	for ( let i = 1; i < pts.length - 1; i++ ) {
		const d = distToSegment( pts[ i ], a, b );
		if ( d > far ) {
			far = d;
			idx = i;
		}
	}
	if ( far <= tol || idx < 0 ) {
		return [ a, b ];
	}
	const left = rdp( pts.slice( 0, idx + 1 ), tol );
	const right = rdp( pts.slice( idx ), tol );
	return left.slice( 0, -1 ).concat( right );
}

function distToSegment( p, a, b ) {
	const vx = b.x - a.x;
	const vy = b.y - a.y;
	const len2 = vx * vx + vy * vy;
	let t = len2 > 0 ? ( ( p.x - a.x ) * vx + ( p.y - a.y ) * vy ) / len2 : 0;
	t = t < 0 ? 0 : t > 1 ? 1 : t;
	return Math.hypot( p.x - ( a.x + vx * t ), p.y - ( a.y + vy * t ) );
}

/**
 * Which vertices of a simplified ring are real corners.
 *
 * A corner is a vertex where the direction changes more sharply than
 * the threshold. Everything else is treated as a point the curve should
 * glide through, which is what keeps round letters round.
 *
 * @param {Array}  ring       Simplified ring.
 * @param {number} degreesMin Turn angle that counts as a corner.
 * @return {boolean[]} One flag per vertex.
 */
export function findCorners( ring, degreesMin = 62 ) {
	const n = ring.length;
	// The turn angle is measured between the two directions, so a
	// straight run is zero degrees and a right angle is ninety.
	const limit = Math.cos( ( degreesMin * Math.PI ) / 180 );
	return ring.map( ( cur, i ) => {
		const prev = ring[ ( i - 1 + n ) % n ];
		const next = ring[ ( i + 1 ) % n ];
		const ax = cur.x - prev.x;
		const ay = cur.y - prev.y;
		const bx = next.x - cur.x;
		const by = next.y - cur.y;
		const la = Math.hypot( ax, ay );
		const lb = Math.hypot( bx, by );
		if ( ! la || ! lb ) {
			return true;
		}
		const cos = ( ax * bx + ay * by ) / ( la * lb );
		return cos < limit;
	} );
}

/* ---------------------------- fitting curves ---------------------------- */

const sub = ( a, b ) => ( { x: a.x - b.x, y: a.y - b.y } );
const add = ( a, b ) => ( { x: a.x + b.x, y: a.y + b.y } );
const mul = ( a, k ) => ( { x: a.x * k, y: a.y * k } );
const dot = ( a, b ) => a.x * b.x + a.y * b.y;
const len = ( a ) => Math.hypot( a.x, a.y );
const unit = ( a ) => {
	const l = len( a );
	return l > 1e-12 ? { x: a.x / l, y: a.y / l } : { x: 0, y: 0 };
};

/**
 * A unit tangent estimated over a stretch of the boundary.
 *
 * This is the single most delicate number in the tracer. A traced
 * boundary is a staircase, so the direction to the very next point is
 * whichever way that one step happened to go, which has nothing to do
 * with where the shape is heading. Taking the nearest neighbour, or
 * weighting it most heavily, feeds the fitter noise: it then fails,
 * splits, and hands the two halves the same noise, all the way down.
 *
 * So every chord within a short arc is counted, all with equal weight,
 * and the staircase averages itself out.
 *
 * @param {Array}  pts   Points.
 * @param {number} i     Index to take the tangent at.
 * @param {number} step  +1 forwards, -1 backwards.
 * @param {number} arc   How far to look along the boundary, in units.
 * @return {Object} Unit vector.
 */
function tangentOver( pts, i, step, arc = 4 ) {
	let acc = { x: 0, y: 0 };
	let dist = 0;
	let j = i;
	let n = 0;
	while ( dist < arc ) {
		const k = j + step;
		if ( k < 0 || k >= pts.length ) {
			break;
		}
		dist += len( sub( pts[ k ], pts[ j ] ) );
		j = k;
		acc = add( acc, unit( sub( pts[ j ], pts[ i ] ) ) );
		n++;
	}
	if ( ! n ) {
		const k = Math.max( 0, Math.min( pts.length - 1, i + step ) );
		return unit( sub( pts[ k ], pts[ i ] ) );
	}
	return unit( acc );
}

const B0 = ( u ) => ( 1 - u ) ** 3;
const B1 = ( u ) => 3 * u * ( 1 - u ) ** 2;
const B2 = ( u ) => 3 * u * u * ( 1 - u );
const B3 = ( u ) => u ** 3;

const bezAt = ( bez, u ) =>
	add(
		add( mul( bez.p0, B0( u ) ), mul( bez.c1, B1( u ) ) ),
		add( mul( bez.c2, B2( u ) ), mul( bez.p1, B3( u ) ) )
	);

/**
 * The best cubic through a run of points for a fixed pair of end
 * tangents, in the least-squares sense.
 *
 * @param {Array}  d     Points.
 * @param {number} first First index.
 * @param {number} last  Last index.
 * @param {Array}  u     Parameter value per point.
 * @param {Object} tHat1 Unit tangent leaving the start.
 * @param {Object} tHat2 Unit tangent entering the end, pointing back.
 * @return {Object} Cubic `{ p0, c1, c2, p1 }`.
 */
function generateBezier( d, first, last, u, tHat1, tHat2 ) {
	const p0 = d[ first ];
	const p3 = d[ last ];
	let c00 = 0;
	let c01 = 0;
	let c11 = 0;
	let x0 = 0;
	let x1 = 0;
	for ( let i = first; i <= last; i++ ) {
		const t = u[ i - first ];
		const a0 = mul( tHat1, B1( t ) );
		const a1 = mul( tHat2, B2( t ) );
		c00 += dot( a0, a0 );
		c01 += dot( a0, a1 );
		c11 += dot( a1, a1 );
		const base = add( mul( p0, B0( t ) + B1( t ) ), mul( p3, B2( t ) + B3( t ) ) );
		const tmp = sub( d[ i ], base );
		x0 += dot( a0, tmp );
		x1 += dot( a1, tmp );
	}
	const det = c00 * c11 - c01 * c01;
	let alphaL = 0 === det ? 0 : ( x0 * c11 - x1 * c01 ) / det;
	let alphaR = 0 === det ? 0 : ( c00 * x1 - c01 * x0 ) / det;
	const segLen = len( sub( p3, p0 ) );
	// A negative or vanishing arm means the fit has gone degenerate; the
	// even thirds are the standard fallback and never fold the curve.
	if ( alphaL < 1e-6 * segLen || alphaR < 1e-6 * segLen ) {
		alphaL = segLen / 3;
		alphaR = segLen / 3;
	}
	return {
		p0,
		c1: add( p0, mul( tHat1, alphaL ) ),
		c2: add( p3, mul( tHat2, alphaR ) ),
		p1: p3,
	};
}

function chordParam( d, first, last ) {
	const u = [ 0 ];
	for ( let i = first + 1; i <= last; i++ ) {
		u.push( u[ u.length - 1 ] + len( sub( d[ i ], d[ i - 1 ] ) ) );
	}
	const total = u[ u.length - 1 ] || 1;
	return u.map( ( v ) => v / total );
}

function maxError( d, first, last, bez, u ) {
	let max = 0;
	let split = Math.floor( ( last + first ) / 2 );
	for ( let i = first + 1; i < last; i++ ) {
		const err = len( sub( bezAt( bez, u[ i - first ] ), d[ i ] ) );
		if ( err > max ) {
			max = err;
			split = i;
		}
	}
	return { max, split };
}

/** One Newton step per point, pulling each parameter onto its foot. */
function reparam( d, first, last, u, bez ) {
	const d1 = ( b ) => [ mul( sub( b.c1, b.p0 ), 3 ), mul( sub( b.c2, b.c1 ), 3 ), mul( sub( b.p1, b.c2 ), 3 ) ];
	const q1 = d1( bez );
	const q2 = [ mul( sub( q1[ 1 ], q1[ 0 ] ), 2 ), mul( sub( q1[ 2 ], q1[ 1 ] ), 2 ) ];
	const at1 = ( t ) =>
		add( add( mul( q1[ 0 ], ( 1 - t ) ** 2 ), mul( q1[ 1 ], 2 * t * ( 1 - t ) ) ), mul( q1[ 2 ], t * t ) );
	const at2 = ( t ) => add( mul( q2[ 0 ], 1 - t ), mul( q2[ 1 ], t ) );
	return u.map( ( t, k ) => {
		const p = d[ first + k ];
		const diff = sub( bezAt( bez, t ), p );
		const den = dot( at1( t ), at1( t ) ) + dot( diff, at2( t ) );
		if ( Math.abs( den ) < 1e-12 ) {
			return t;
		}
		const next = t - dot( diff, at1( t ) ) / den;
		return next < 0 ? 0 : next > 1 ? 1 : next;
	} );
}

/**
 * Fit a run of points with as few cubics as the tolerance allows.
 *
 * This is Schneider's method: fit, measure, and where it does not hold,
 * split at the worst point and fit again. Fitting the points rather
 * than interpolating a thinned-out subset of them is the whole point:
 * a curve threaded through every fifth point honours those five and is
 * free to wander between them, which is exactly how a clean stroke
 * turns lumpy.
 *
 * @param {Array}  d     Points.
 * @param {Object} tHat1 Unit tangent leaving the start.
 * @param {Object} tHat2 Unit tangent entering the end, pointing back.
 * @param {number} tol   Tolerance in the points' own units.
 * @return {Array} Cubic segments.
 */
export function fitCubics( d, tHat1, tHat2, tol, arc = 4 ) {
	const out = [];
	fitRun( d, 0, d.length - 1, tHat1, tHat2, tol, out, 0, arc );
	return out;
}

function fitRun( d, first, last, tHat1, tHat2, tol, out, depth, arc ) {
	if ( last - first < 1 ) {
		return;
	}
	if ( 1 === last - first ) {
		const dist = len( sub( d[ last ], d[ first ] ) ) / 3;
		out.push( {
			p0: d[ first ],
			c1: add( d[ first ], mul( tHat1, dist ) ),
			c2: add( d[ last ], mul( tHat2, dist ) ),
			p1: d[ last ],
		} );
		return;
	}
	let u = chordParam( d, first, last );
	let bez = generateBezier( d, first, last, u, tHat1, tHat2 );
	let err = maxError( d, first, last, bez, u );
	if ( err.max < tol ) {
		out.push( bez );
		return;
	}
	// Close enough that pulling the parameters onto their feet should
	// finish the job, which is cheaper than another split.
	if ( err.max < tol * 6 ) {
		for ( let i = 0; i < 6; i++ ) {
			u = reparam( d, first, last, u, bez );
			bez = generateBezier( d, first, last, u, tHat1, tHat2 );
			err = maxError( d, first, last, bez, u );
			if ( err.max < tol ) {
				out.push( bez );
				return;
			}
		}
	}
	if ( depth >= 14 ) {
		out.push( bez );
		return;
	}
	// Measured over an arc, not between neighbours: a split tangent taken
	// from the two adjacent staircase steps is noise, and handing noise to
	// both halves is what makes a fitter split for ever.
	const centre = tangentOver( d, err.split, -1, arc );
	fitRun( d, first, err.split, tHat1, centre, tol, out, depth + 1, arc );
	fitRun( d, err.split, last, mul( centre, -1 ), tHat2, tol, out, depth + 1, arc );
}

/**
 * The indices of a ring where the direction really changes.
 *
 * The turn is measured across a stretch of the boundary rather than
 * between neighbouring points, because neighbouring points on a traced
 * boundary are a staircase and every step of a staircase is a right
 * angle. Only the sharpest point of each cluster survives, so one
 * corner produces one split.
 *
 * @param {Array}  ring    Ring of points.
 * @param {number} degrees Turn that counts as a corner.
 * @param {number} look    How far along the ring to look, in units.
 * @return {number[]} Corner indices, ascending.
 */
export function ringCorners( ring, degrees = 65, look = 2.5 ) {
	const n = ring.length;
	if ( n < 8 ) {
		return [];
	}
	const step = [];
	let total = 0;
	for ( let i = 0; i < n; i++ ) {
		const l = len( sub( ring[ ( i + 1 ) % n ], ring[ i ] ) );
		step.push( l );
		total += l;
	}
	if ( total < look * 4 ) {
		return [];
	}
	const walk = ( i, dir ) => {
		let acc = 0;
		let j = i;
		while ( acc < look ) {
			const k = dir > 0 ? j : ( j - 1 + n ) % n;
			acc += step[ k ];
			j = ( j + dir + n ) % n;
			if ( j === i ) {
				break;
			}
		}
		return j;
	};
	const limit = Math.cos( ( degrees * Math.PI ) / 180 );
	const turn = new Float64Array( n );
	for ( let i = 0; i < n; i++ ) {
		const a = unit( sub( ring[ i ], ring[ walk( i, -1 ) ] ) );
		const b = unit( sub( ring[ walk( i, 1 ) ], ring[ i ] ) );
		turn[ i ] = dot( a, b );
	}
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		if ( turn[ i ] >= limit ) {
			continue;
		}
		// Only the sharpest of a cluster counts as the corner.
		let best = true;
		for ( let k = 1; k <= 3; k++ ) {
			if ( turn[ ( i + k ) % n ] < turn[ i ] || turn[ ( i - k + n ) % n ] < turn[ i ] ) {
				best = false;
				break;
			}
		}
		if ( best ) {
			out.push( i );
		}
	}
	return out;
}

/**
 * Fit a whole closed ring, splitting it only where it really turns.
 *
 * @param {Array}  ring    Ring of points.
 * @param {Object} opts    `{ corner, look, fitTol }`.
 * @return {Array} Cubic segments covering the ring.
 */
export function fitRing( ring, opts = {} ) {
	const { corner = 65, look = 2.5, fitTol = 0.8, arc = 4 } = opts;
	const n = ring.length;
	if ( n < 4 ) {
		return [];
	}
	const corners = ringCorners( ring, corner, look );
	if ( ! corners.length ) {
		// No corners: one closed run, seamed at an arbitrary point and
		// given matching tangents there so the join does not show.
		const d = ring.concat( [ ring[ 0 ] ] );
		const ahead = tangentOver( d, 0, 1, arc );
		const behind = tangentOver( d, d.length - 1, -1, arc );
		const seam = unit( add( ahead, mul( behind, -1 ) ) );
		return fitCubics( d, seam, mul( seam, -1 ), fitTol, arc );
	}
	const out = [];
	for ( let c = 0; c < corners.length; c++ ) {
		const from = corners[ c ];
		const to = corners[ ( c + 1 ) % corners.length ];
		const run = [];
		let i = from;
		do {
			run.push( ring[ i ] );
			i = ( i + 1 ) % n;
		} while ( i !== to );
		run.push( ring[ to ] );
		if ( run.length < 2 ) {
			continue;
		}
		const t1 = tangentOver( run, 0, 1, arc );
		const t2 = tangentOver( run, run.length - 1, -1, arc );
		for ( const cu of fitCubics( run, t1, t2, fitTol, arc ) ) {
			out.push( cu );
		}
	}
	return out;
}

/**
 * Approximate a cubic with quadratics, splitting until it fits.
 *
 * TrueType outlines are quadratic, so this conversion has to happen
 * somewhere. Doing it here, against an explicit tolerance, means the
 * font writer downstream never has to guess.
 *
 * @param {Object} cu    Cubic `{ p0, c1, c2, p1 }`.
 * @param {number} tol   Tolerance in units.
 * @param {number} depth Recursion guard.
 * @return {Array} Quadratics `{ p0, c, p1 }`.
 */
export function cubicToQuads( cu, tol = 0.6, depth = 0 ) {
	const ex = cu.p0.x - 3 * cu.c1.x + 3 * cu.c2.x - cu.p1.x;
	const ey = cu.p0.y - 3 * cu.c1.y + 3 * cu.c2.y - cu.p1.y;
	const err = ( Math.sqrt( 3 ) / 18 ) * Math.hypot( ex, ey );
	if ( err <= tol || depth >= 6 ) {
		return [
			{
				p0: cu.p0,
				c: {
					x: ( 3 * cu.c1.x - cu.p0.x + 3 * cu.c2.x - cu.p1.x ) / 4,
					y: ( 3 * cu.c1.y - cu.p0.y + 3 * cu.c2.y - cu.p1.y ) / 4,
				},
				p1: cu.p1,
			},
		];
	}
	const [ a, b ] = splitCubic( cu );
	return cubicToQuads( a, tol, depth + 1 ).concat( cubicToQuads( b, tol, depth + 1 ) );
}

function splitCubic( cu ) {
	const mid = ( a, b ) => ( { x: ( a.x + b.x ) / 2, y: ( a.y + b.y ) / 2 } );
	const p01 = mid( cu.p0, cu.c1 );
	const p12 = mid( cu.c1, cu.c2 );
	const p23 = mid( cu.c2, cu.p1 );
	const p012 = mid( p01, p12 );
	const p123 = mid( p12, p23 );
	const m = mid( p012, p123 );
	return [
		{ p0: cu.p0, c1: p01, c2: p012, p1: m },
		{ p0: m, c1: p123, c2: p23, p1: cu.p1 },
	];
}

/**
 * The whole trace, from bitmap to quadratic contours in font units.
 *
 * @param {Object}   bmp    Bitmap.
 * @param {Object}   opts   Options.
 * @param {number}   opts.simplify Simplification tolerance in pixels.
 * @param {number}   opts.corner   Corner angle in degrees.
 * @param {number}   opts.quadTol  Quadratic fit tolerance in units.
 * @param {number}   opts.minArea  Loops smaller than this are dropped.
 * @param {Function} opts.toUnits  Maps a pixel point to font units.
 * @return {Array} Contours of `{ x, y, on }` points.
 */
export function traceToContours( bmp, opts = {} ) {
	const {
		smooth: smoothPasses = 2,
		simplify = 0,
		corner = 65,
		look = 2.5,
		fitTol = 0.8,
		arc = 4,
		quadTol = 0.6,
		minArea = 6,
		toUnits = ( p ) => p,
	} = opts;
	// The fit works in pixels, where the tolerance is meaningful, and the
	// finished control points are mapped afterwards. The mapping is
	// affine, so nothing is lost by doing it last.
	return traceBitmap( bmp )
		.filter( ( ring ) => Math.abs( signedArea( ring ) ) >= minArea )
		.map( ( ring ) => simplifyRing( smoothRing( ring, smoothPasses ), simplify ) )
		.map( ( ring ) => {
			const pts = [];
			for ( const cu of fitRing( ring, { corner, look, fitTol, arc } ) ) {
				const mapped = {
					p0: toUnits( cu.p0 ),
					c1: toUnits( cu.c1 ),
					c2: toUnits( cu.c2 ),
					p1: toUnits( cu.p1 ),
				};
				for ( const q of cubicToQuads( mapped, quadTol ) ) {
					pts.push( { x: q.p0.x, y: q.p0.y, on: true } );
					pts.push( { x: q.c.x, y: q.c.y, on: false } );
				}
			}
			return pts;
		} )
		.filter( ( ring ) => ring.length >= 3 );
}

/**
 * Set contour directions so the non-zero fill rule does the right thing.
 *
 * TrueType wants outer contours clockwise and the holes inside them the
 * other way round. Nesting is decided by counting how many contours a
 * contour sits inside, which handles the awkward cases (a hole with an
 * island in it, as in a letter drawn with a loop inside a loop) without
 * any special casing.
 *
 * @param {Array} contours Contours of `{ x, y, on }`.
 * @return {Array} Contours with corrected direction.
 */
export function normalizeWinding( contours ) {
	const rings = contours.map( ( c ) => c.filter( ( p ) => p.on ) );
	return contours.map( ( c, i ) => {
		const ring = rings[ i ];
		if ( ring.length < 3 ) {
			return c;
		}
		let depth = 0;
		for ( let j = 0; j < rings.length; j++ ) {
			if ( j !== i && rings[ j ].length >= 3 && pointInRing( ring[ 0 ], rings[ j ] ) ) {
				depth++;
			}
		}
		const wantNegative = depth % 2 === 0;
		const area = signedArea( ring );
		const isNegative = area < 0;
		return wantNegative === isNegative ? c : c.slice().reverse();
	} );
}
