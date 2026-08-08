/**
 * Pure geometry helpers - no DOM, no canvas, fully node-testable.
 *
 * Everything the papercut pipeline needs to go from ideas to polygons:
 * a seeded RNG, 1D value noise for profile lines, polygon smoothing and
 * simplification, and SVG path building.
 */

/** Mulberry32 - the family's usual small seeded RNG. */
export function rng( seed ) {
	let a = ( seed >>> 0 ) || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/**
 * 1D value noise with fBm octaves in [0,1] - the backbone of every
 * ridge and cloud profile. Deterministic per seed.
 *
 * @param {number} seed    RNG seed.
 * @param {number} octaves fBm octaves (default 4).
 * @return {Function} `( x ) => 0..1` for any x >= 0.
 */
export function valueNoise( seed, octaves = 4 ) {
	const r = rng( seed );
	const lattice = new Float32Array( 1024 );
	for ( let i = 0; i < lattice.length; i++ ) {
		lattice[ i ] = r();
	}
	const at = ( i ) => lattice[ ( ( i % 1024 ) + 1024 ) % 1024 ];
	const smooth = ( t ) => t * t * ( 3 - 2 * t );
	const one = ( x ) => {
		const i = Math.floor( x );
		const f = smooth( x - i );
		return at( i ) * ( 1 - f ) + at( i + 1 ) * f;
	};
	return ( x ) => {
		let sum = 0;
		let amp = 0.5;
		let freq = 1;
		let norm = 0;
		for ( let o = 0; o < octaves; o++ ) {
			sum += one( x * freq + o * 137.3 ) * amp;
			norm += amp;
			amp *= 0.5;
			freq *= 2.1;
		}
		return sum / norm;
	};
}

/**
 * Douglas-Peucker simplification of a closed or open polyline.
 *
 * @param {Array}   pts    `[ [x,y], ... ]`.
 * @param {number}  eps    Max deviation.
 * @param {boolean} closed Treat as ring.
 * @return {Array} Simplified points.
 */
export function simplify( pts, eps, closed = true ) {
	if ( pts.length <= 4 ) {
		return pts.slice();
	}
	const keep = new Uint8Array( pts.length );
	keep[ 0 ] = 1;
	keep[ pts.length - 1 ] = 1;
	const stack = [ [ 0, pts.length - 1 ] ];
	while ( stack.length ) {
		const [ a, b ] = stack.pop();
		const [ ax, ay ] = pts[ a ];
		const [ bx, by ] = pts[ b ];
		const dx = bx - ax;
		const dy = by - ay;
		const len = Math.hypot( dx, dy ) || 1e-9;
		let worst = -1;
		let worstD = eps;
		for ( let i = a + 1; i < b; i++ ) {
			const d =
				Math.abs(
					dy * pts[ i ][ 0 ] -
						dx * pts[ i ][ 1 ] +
						bx * ay -
						by * ax
				) / len;
			if ( d > worstD ) {
				worstD = d;
				worst = i;
			}
		}
		if ( worst >= 0 ) {
			keep[ worst ] = 1;
			stack.push( [ a, worst ], [ worst, b ] );
		}
	}
	const out = [];
	for ( let i = 0; i < pts.length; i++ ) {
		if ( keep[ i ] ) {
			out.push( pts[ i ] );
		}
	}
	// A ring must keep enough points to stay a ring.
	if ( closed && out.length < 3 ) {
		return pts.slice();
	}
	return out;
}

/**
 * Circular moving-average smoothing on a dense ring. Unlike corner
 * cutting this turns pixel staircases AND polygon facets into real
 * curves: every point becomes the mean of its ±k neighbours. On a
 * radius-r arc the deviation is tiny (window² / 8r); a sharp corner
 * rounds by roughly half the window - the scissor look.
 */
export function smoothRing( pts, k = 4 ) {
	const n = pts.length;
	if ( n <= 2 * k + 1 ) {
		return pts.slice();
	}
	const out = new Array( n );
	for ( let i = 0; i < n; i++ ) {
		let sx = 0;
		let sy = 0;
		for ( let d = -k; d <= k; d++ ) {
			const p = pts[ ( i + d + n ) % n ];
			sx += p[ 0 ];
			sy += p[ 1 ];
		}
		out[ i ] = [ sx / ( 2 * k + 1 ), sy / ( 2 * k + 1 ) ];
	}
	return out;
}

/**
 * Insert points so no segment is longer than maxLen. Chaikin cuts a
 * quarter off every segment - on a simplified ring a canvas-border
 * edge is ONE 700px segment, and cutting it chamfered huge corners
 * off every sheet. Densifying first caps the chamfer at ~maxLen/4.
 */
export function densify( pts, maxLen = 6 ) {
	const out = [];
	for ( let i = 0; i < pts.length; i++ ) {
		const a = pts[ i ];
		const b = pts[ ( i + 1 ) % pts.length ];
		out.push( a );
		const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const n = Math.floor( len / maxLen );
		for ( let k = 1; k <= n; k++ ) {
			const f = k / ( n + 1 );
			out.push( [
				a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f,
				a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f,
			] );
		}
	}
	return out;
}

/**
 * One round of Chaikin corner cutting on a closed ring - turns traced
 * pixel staircases into paper-scissor curves.
 */
export function chaikin( pts, rounds = 2 ) {
	let cur = pts;
	for ( let n = 0; n < rounds; n++ ) {
		const out = [];
		for ( let i = 0; i < cur.length; i++ ) {
			const a = cur[ i ];
			const b = cur[ ( i + 1 ) % cur.length ];
			out.push(
				[ a[ 0 ] * 0.75 + b[ 0 ] * 0.25, a[ 1 ] * 0.75 + b[ 1 ] * 0.25 ],
				[ a[ 0 ] * 0.25 + b[ 0 ] * 0.75, a[ 1 ] * 0.25 + b[ 1 ] * 0.75 ]
			);
		}
		cur = out;
	}
	return cur;
}

/** Signed area of a ring (positive = counter-clockwise in y-down space). */
export function ringArea( pts ) {
	let s = 0;
	for ( let i = 0; i < pts.length; i++ ) {
		const [ x1, y1 ] = pts[ i ];
		const [ x2, y2 ] = pts[ ( i + 1 ) % pts.length ];
		s += x1 * y2 - x2 * y1;
	}
	return s / 2;
}

/**
 * SVG path data for a set of rings, drawn with even-odd fill so holes
 * need no orientation bookkeeping.
 *
 * @param {Array}  rings  `[ [ [x,y], ... ], ... ]`.
 * @param {number} digits Decimals (default 1).
 * @return {string} Path `d`.
 */
export function ringsToPath( rings, digits = 1 ) {
	const f = ( v ) => Number( v.toFixed( digits ) );
	let d = '';
	for ( const ring of rings ) {
		if ( ring.length < 3 ) {
			continue;
		}
		d += `M ${ f( ring[ 0 ][ 0 ] ) } ${ f( ring[ 0 ][ 1 ] ) } `;
		for ( let i = 1; i < ring.length; i++ ) {
			d += `L ${ f( ring[ i ][ 0 ] ) } ${ f( ring[ i ][ 1 ] ) } `;
		}
		d += 'Z ';
	}
	return d.trim();
}

/** Scale every ring point by [sx, sy]. */
export function scaleRings( rings, sx, sy = sx ) {
	return rings.map( ( ring ) =>
		ring.map( ( [ x, y ] ) => [ x * sx, y * sy ] )
	);
}
