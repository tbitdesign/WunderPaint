/**
 * Fit cubic Bezier curves to a polyline (v1.429): Philip Schneider's
 * algorithm from Graphics Gems, the one behind Illustrator's pencil and
 * Inkscape's freehand tool. The stroke is split where the fit misses by
 * more than `maxError` px, so a wobbly hand becomes a handful of smooth
 * anchors instead of one anchor per sample.
 */

const sub = ( a, b ) => ( { x: a.x - b.x, y: a.y - b.y } );
const add = ( a, b ) => ( { x: a.x + b.x, y: a.y + b.y } );
const scale = ( a, s ) => ( { x: a.x * s, y: a.y * s } );
const dot = ( a, b ) => a.x * b.x + a.y * b.y;
const len = ( a ) => Math.hypot( a.x, a.y );
const norm = ( a ) => {
	const l = len( a );
	return l ? scale( a, 1 / l ) : { x: 0, y: 0 };
};

/** Point on a cubic at t. */
export function bezierAt( [ p0, p1, p2, p3 ], t ) {
	const u = 1 - t;
	return {
		x:
			u * u * u * p0.x +
			3 * u * u * t * p1.x +
			3 * u * t * t * p2.x +
			t * t * t * p3.x,
		y:
			u * u * u * p0.y +
			3 * u * u * t * p1.y +
			3 * u * t * t * p2.y +
			t * t * t * p3.y,
	};
}

/** Chord-length parameterisation of the points. */
function chordLengths( pts ) {
	const u = [ 0 ];
	for ( let i = 1; i < pts.length; i++ ) {
		u.push( u[ i - 1 ] + len( sub( pts[ i ], pts[ i - 1 ] ) ) );
	}
	const total = u[ u.length - 1 ] || 1;
	return u.map( ( v ) => v / total );
}

/** Least-squares cubic for the points with the given tangents. */
function generateBezier( pts, u, t1, t2 ) {
	const first = pts[ 0 ];
	const last = pts[ pts.length - 1 ];
	let c00 = 0;
	let c01 = 0;
	let c11 = 0;
	let x0 = 0;
	let x1 = 0;
	for ( let i = 0; i < pts.length; i++ ) {
		const t = u[ i ];
		const b = 1 - t;
		const b0 = b * b * b;
		const b1 = 3 * t * b * b;
		const b2 = 3 * t * t * b;
		const b3 = t * t * t;
		const a1 = scale( t1, b1 );
		const a2 = scale( t2, b2 );
		c00 += dot( a1, a1 );
		c01 += dot( a1, a2 );
		c11 += dot( a2, a2 );
		const tmp = sub(
			pts[ i ],
			add( scale( first, b0 + b1 ), scale( last, b2 + b3 ) )
		);
		x0 += dot( a1, tmp );
		x1 += dot( a2, tmp );
	}
	const det = c00 * c11 - c01 * c01;
	let alphaL = det ? ( c11 * x0 - c01 * x1 ) / det : 0;
	let alphaR = det ? ( c00 * x1 - c01 * x0 ) / det : 0;
	const segLen = len( sub( last, first ) );
	const eps = 1e-6 * segLen;
	if ( alphaL < eps || alphaR < eps ) {
		// Degenerate: Wu/Barsky heuristic, a third of the chord each.
		alphaL = segLen / 3;
		alphaR = segLen / 3;
	}
	return [
		first,
		add( first, scale( t1, alphaL ) ),
		add( last, scale( t2, alphaR ) ),
		last,
	];
}

/** Newton-Raphson refinement of a parameter value. */
function refine( bez, p, t ) {
	const q = bezierAt( bez, t );
	const [ p0, p1, p2, p3 ] = bez;
	const q1 = [
		scale( sub( p1, p0 ), 3 ),
		scale( sub( p2, p1 ), 3 ),
		scale( sub( p3, p2 ), 3 ),
	];
	const q2 = [
		scale( sub( q1[ 1 ], q1[ 0 ] ), 2 ),
		scale( sub( q1[ 2 ], q1[ 1 ] ), 2 ),
	];
	const u = 1 - t;
	const d1 = add(
		add( scale( q1[ 0 ], u * u ), scale( q1[ 1 ], 2 * u * t ) ),
		scale( q1[ 2 ], t * t )
	);
	const d2 = add( scale( q2[ 0 ], u ), scale( q2[ 1 ], t ) );
	const diff = sub( q, p );
	const num = dot( diff, d1 );
	const den = dot( d1, d1 ) + dot( diff, d2 );
	return den ? t - num / den : t;
}

/** Largest distance from the points to the curve, and where it is. */
function maxError( pts, bez, u ) {
	let worst = 0;
	let split = Math.floor( pts.length / 2 );
	for ( let i = 1; i < pts.length - 1; i++ ) {
		const d = len( sub( bezierAt( bez, u[ i ] ), pts[ i ] ) );
		if ( d > worst ) {
			worst = d;
			split = i;
		}
	}
	return { worst, split };
}

function fitCubic( pts, t1, t2, tolerance, out ) {
	if ( 2 === pts.length ) {
		const d = len( sub( pts[ 1 ], pts[ 0 ] ) ) / 3;
		out.push( [
			pts[ 0 ],
			add( pts[ 0 ], scale( t1, d ) ),
			add( pts[ 1 ], scale( t2, d ) ),
			pts[ 1 ],
		] );
		return;
	}
	let u = chordLengths( pts );
	let bez = generateBezier( pts, u, t1, t2 );
	let { worst, split } = maxError( pts, bez, u );
	if ( worst < tolerance ) {
		out.push( bez );
		return;
	}
	// A few rounds of reparameterisation before giving up and splitting.
	if ( worst < tolerance * tolerance ) {
		for ( let round = 0; round < 4; round++ ) {
			u = u.map( ( t, i ) => refine( bez, pts[ i ], t ) );
			bez = generateBezier( pts, u, t1, t2 );
			( { worst, split } = maxError( pts, bez, u ) );
			if ( worst < tolerance ) {
				out.push( bez );
				return;
			}
		}
	}
	// Split at the worst point with a shared centre tangent.
	const centre = norm(
		sub(
			pts[ split - 1 ] || pts[ 0 ],
			pts[ split + 1 ] || pts[ pts.length - 1 ]
		)
	);
	fitCubic( pts.slice( 0, split + 1 ), t1, centre, tolerance, out );
	fitCubic( pts.slice( split ), scale( centre, -1 ), t2, tolerance, out );
}

/** Drop repeated points; the fit needs distinct samples. */
function dedupe( points ) {
	const out = [];
	for ( const p of points ) {
		const last = out[ out.length - 1 ];
		if ( ! last || Math.hypot( p.x - last.x, p.y - last.y ) > 1e-6 ) {
			out.push( { x: p.x, y: p.y } );
		}
	}
	return out;
}

/**
 * Fit a polyline with cubic Beziers.
 *
 * @param {Array<{x:number,y:number}>} points   Samples in order.
 * @param {number}                     maxErr   Allowed distance in px.
 * @return {Array<Array<{x:number,y:number}>>} Segments [ p0, c1, c2, p3 ].
 */
export function fitCurve( points, maxErr = 4 ) {
	const pts = dedupe( points );
	if ( pts.length < 2 ) {
		return [];
	}
	const t1 = norm( sub( pts[ 1 ], pts[ 0 ] ) );
	const t2 = norm( sub( pts[ pts.length - 2 ], pts[ pts.length - 1 ] ) );
	const out = [];
	fitCubic( pts, t1, t2, Math.max( 0.1, maxErr ), out );
	return out;
}

/**
 * The fitted curve as pen anchors { x, y, hIn, hOut }, the form the pen
 * tool and the anchor editor work with.
 *
 * @param {Array<{x:number,y:number}>} points Samples.
 * @param {number}                     maxErr Allowed distance in px.
 * @return {Array<Object>} Anchors, or [] when nothing can be fitted.
 */
export function fitToAnchors( points, maxErr = 4 ) {
	const segs = fitCurve( points, maxErr );
	if ( ! segs.length ) {
		return [];
	}
	const anchors = [];
	segs.forEach( ( [ p0, c1, c2, p3 ], i ) => {
		if ( 0 === i ) {
			anchors.push( { x: p0.x, y: p0.y, hIn: null, hOut: { ...c1 } } );
		} else {
			anchors[ anchors.length - 1 ].hOut = { ...c1 };
		}
		anchors.push( { x: p3.x, y: p3.y, hIn: { ...c2 }, hOut: null } );
	} );
	return anchors;
}
