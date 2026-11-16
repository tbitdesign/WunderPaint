/**
 * String art, shared by Text Art (the picture) and Stitch Patterns (the
 * picture you can actually build): ONE thread wound from nail to nail
 * around a board until the picture appears in its crossings.
 *
 * Greedy, like the hand that winds it: from the nail the thread is on,
 * take the chord that still crosses the most darkness nobody has served
 * yet, then take that darkness away. The work happens on a small square
 * of the field; `weight` is how much of a working pixel one thread covers,
 * which is also how wide it is drawn, so the model and the drawing agree
 * at every size.
 *
 * Pure and node-testable: a tone field in, nail positions and the
 * winding order out.
 */

const TAU = Math.PI * 2;
const clamp = ( v, lo, hi ) => ( v < lo ? lo : v > hi ? hi : v );

/** A seeded stream, so a board can be wound again the same way. */
function rng( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/** Bilinear read, clamped at the edges. */
function sample( field, x, y ) {
	const { w, h, v } = field;
	const maxX = Math.max( 0, w - 1.001 );
	const maxY = Math.max( 0, h - 1.001 );
	const cx = x < 0 ? 0 : x > maxX ? maxX : x;
	const cy = y < 0 ? 0 : y > maxY ? maxY : y;
	const x0 = cx | 0;
	const y0 = cy | 0;
	const fx = cx - x0;
	const fy = cy - y0;
	const i = y0 * w + x0;
	const right = x0 + 1 < w ? 1 : 0;
	const down = y0 + 1 < h ? w : 0;
	const a = v[ i ] + ( v[ i + right ] - v[ i ] ) * fx;
	const b = v[ i + down ] + ( v[ i + down + right ] - v[ i + down ] ) * fx;
	return a + ( b - a ) * fy;
}

export const BOARDS = [ 'round', 'square', 'heart' ];

// The heart as a closed outline in the unit square, top notch first and
// then clockwise; equal steps along it, so the nails sit evenly.
let heartCache = null;
function heartOutline() {
	if ( heartCache ) {
		return heartCache;
	}
	const raw = [];
	for ( let i = 0; i < 2048; i++ ) {
		const t = ( i / 2048 ) * TAU;
		raw.push( [
			16 * Math.sin( t ) ** 3,
			-(
				13 * Math.cos( t ) -
				5 * Math.cos( 2 * t ) -
				2 * Math.cos( 3 * t ) -
				Math.cos( 4 * t )
			),
		] );
	}
	const xs = raw.map( ( p ) => p[ 0 ] );
	const ys = raw.map( ( p ) => p[ 1 ] );
	const x0 = Math.min( ...xs );
	const x1 = Math.max( ...xs );
	const y0 = Math.min( ...ys );
	const y1 = Math.max( ...ys );
	const s = 2 / Math.max( x1 - x0, y1 - y0 );
	const mx = ( x0 + x1 ) / 2;
	const my = ( y0 + y1 ) / 2;
	const pts = raw.map( ( p ) => [
		( p[ 0 ] - mx ) * s,
		( p[ 1 ] - my ) * s,
	] );
	const run = [ 0 ];
	for ( let i = 1; i <= pts.length; i++ ) {
		const a = pts[ i - 1 ];
		const b = pts[ i % pts.length ];
		run.push(
			run[ i - 1 ] + Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] )
		);
	}
	heartCache = { pts, run, length: run[ run.length - 1 ] };
	return heartCache;
}

function inPolygon( pts, x, y ) {
	let inside = false;
	for ( let i = 0, j = pts.length - 1; i < pts.length; j = i++ ) {
		const [ xi, yi ] = pts[ i ];
		const [ xj, yj ] = pts[ j ];
		if (
			yi > y !== yj > y &&
			x < ( ( xj - xi ) * ( y - yi ) ) / ( yj - yi ) + xi
		) {
			inside = ! inside;
		}
	}
	return inside;
}

/**
 * The nails of a board in the unit square [-1, 1]², nail 0 at the top
 * centre and then clockwise, plus what the board covers. On a square
 * board two nails on the same edge never take a thread: it would only
 * run along the frame.
 *
 * @param {string} shape round | square | heart.
 * @param {number} n     Number of nails.
 * @return {Object} { nails: [[x,y]], sides (bit masks or null), inside(x,y) }.
 */
export function boardNails( shape, n ) {
	if ( 'square' === shape ) {
		const nails = [];
		const sides = [];
		for ( let i = 0; i < n; i++ ) {
			// Perimeter 8, starting at the top centre.
			const t = ( ( i / n ) * 8 + 1 ) % 8;
			let p;
			if ( t < 2 ) {
				p = [ -1 + t, -1 ];
			} else if ( t < 4 ) {
				p = [ 1, -1 + ( t - 2 ) ];
			} else if ( t < 6 ) {
				p = [ 1 - ( t - 4 ), 1 ];
			} else {
				p = [ -1, 1 - ( t - 6 ) ];
			}
			const near = ( a, b ) => Math.abs( a - b ) < 1e-6;
			sides.push(
				( near( p[ 1 ], -1 ) ? 1 : 0 ) |
					( near( p[ 0 ], 1 ) ? 2 : 0 ) |
					( near( p[ 1 ], 1 ) ? 4 : 0 ) |
					( near( p[ 0 ], -1 ) ? 8 : 0 )
			);
			nails.push( p );
		}
		return { nails, sides, inside: () => true };
	}
	if ( 'heart' === shape ) {
		const { pts, run, length } = heartOutline();
		const nails = [];
		let k = 0;
		for ( let i = 0; i < n; i++ ) {
			const at = ( i / n ) * length;
			while ( k < pts.length - 1 && run[ k + 1 ] < at ) {
				k++;
			}
			const a = pts[ k ];
			const b = pts[ ( k + 1 ) % pts.length ];
			const f =
				( at - run[ k ] ) / Math.max( 1e-9, run[ k + 1 ] - run[ k ] );
			nails.push( [
				a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f,
				a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f,
			] );
		}
		// Every eighth point is plenty to tell inside from outside.
		const coarse = pts.filter( ( _, i ) => 0 === i % 8 );
		return {
			nails,
			sides: null,
			inside: ( x, y ) => inPolygon( coarse, x, y ),
		};
	}
	const nails = [];
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * TAU - Math.PI / 2;
		nails.push( [ Math.cos( a ), Math.sin( a ) ] );
	}
	return {
		nails,
		sides: null,
		inside: ( x, y ) => x * x + y * y <= 1,
	};
}

/**
 * Wind the board.
 *
 * @param {Object} field A tone field (0 dark .. 1 light).
 * @param {Object} o     nails, threads, weight, minGap, dark, size, seed,
 *                       gamma, repel, stopAt, board (round | square | heart).
 * @return {Object} { pts (the thread, field units), order (nail indices),
 *                  nails (field units), width (half, field units) }.
 */
export function stringArt( field, o = {} ) {
	const {
		nails = 288,
		threads = 4000,
		weight = 0.07,
		minGap = 18,
		dark = false,
		size = 300,
		seed = 3,
		gamma = 1.4,
		repel = 0.1,
		stopAt = 0.02,
		board = 'round',
	} = o;
	const side = Math.min( field.w, field.h );
	const cx = field.w / 2;
	const cy = field.h / 2;
	const R = side / 2 - 1;
	const N = Math.max( 120, Math.min( size, Math.round( side ) ) );
	const k = ( 2 * R ) / N;
	const half = N / 2;
	const n = clamp( Math.round( nails ), 60, 400 );
	const shape = BOARDS.includes( board ) ? board : 'round';
	const layout = boardNails( shape, n );
	// What the thread still owes each working pixel. Off the board there is
	// nothing to serve: on a round board a chord never gets there, on a
	// heart it would only cross the notch, so there it costs like paper.
	const ink = new Float32Array( N * N );
	for ( let y = 0; y < N; y++ ) {
		for ( let x = 0; x < N; x++ ) {
			const dx = x + 0.5 - half;
			const dy = y + 0.5 - half;
			if ( 'round' === shape ) {
				if ( dx * dx + dy * dy > half * half ) {
					continue;
				}
			} else if ( ! layout.inside( dx / half, dy / half ) ) {
				ink[ y * N + x ] = -repel;
				continue;
			}
			const v = sample(
				field,
				cx - R + ( x + 0.5 ) * k,
				cy - R + ( y + 0.5 ) * k
			);
			// Highlights push the thread away instead of merely not
			// pulling it: every chord crosses the background somewhere,
			// and a background that costs nothing fills up with thread.
			ink[ y * N + x ] = Math.pow( dark ? v : 1 - v, gamma ) - repel;
		}
	}
	const nx = new Float32Array( n );
	const ny = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		nx[ i ] = half + layout.nails[ i ][ 0 ] * ( half - 0.5 );
		ny[ i ] = half + layout.nails[ i ][ 1 ] * ( half - 0.5 );
	}
	const at = ( x, y ) =>
		Math.min( N - 1, Math.max( 0, y | 0 ) ) * N +
		Math.min( N - 1, Math.max( 0, x | 0 ) );
	const used = new Uint8Array( n * n );
	const gap = clamp( Math.round( minGap ), 2, Math.floor( n / 4 ) );
	const steps = clamp( Math.round( threads ), 100, 8000 );
	let from = Math.floor( rng( seed )() * n );
	const order = [ from ];
	for ( let s = 0; s < steps; s++ ) {
		let best = -1;
		let bestScore = 0;
		const x0 = nx[ from ];
		const y0 = ny[ from ];
		for ( let j = 0; j < n; j++ ) {
			const d = Math.abs( j - from );
			if (
				Math.min( d, n - d ) < gap ||
				used[ from * n + j ] ||
				( layout.sides && layout.sides[ from ] & layout.sides[ j ] )
			) {
				continue;
			}
			const dx = nx[ j ] - x0;
			const dy = ny[ j ] - y0;
			const m = Math.max( 2, Math.hypot( dx, dy ) | 0 );
			let sum = 0;
			for ( let t = 0; t <= m; t++ ) {
				sum += ink[ at( x0 + ( dx * t ) / m, y0 + ( dy * t ) / m ) ];
			}
			const score = sum / ( m + 1 );
			if ( score > bestScore ) {
				bestScore = score;
				best = j;
			}
		}
		// When no chord serves more darkness than it spoils, the picture
		// is done; winding on would only grey it.
		if ( best < 0 || bestScore < stopAt ) {
			break;
		}
		const dx = nx[ best ] - x0;
		const dy = ny[ best ] - y0;
		const m = Math.max( 2, Math.hypot( dx, dy ) | 0 );
		for ( let t = 0; t <= m; t++ ) {
			ink[ at( x0 + ( dx * t ) / m, y0 + ( dy * t ) / m ) ] -= weight;
		}
		used[ from * n + best ] = 1;
		used[ best * n + from ] = 1;
		order.push( best );
		from = best;
	}
	const toField = ( i ) => [ cx - R + nx[ i ] * k, cy - R + ny[ i ] * k ];
	return {
		pts: order.map( toField ),
		order,
		nails: Array.from( { length: n }, ( _, i ) => toField( i ) ),
		width: ( weight * k ) / 2,
	};
}

/**
 * How long the thread is, as a multiple of the board's width: wind a
 * board 40 cm across and the thread is that many times 40 cm long.
 *
 * @param {Array} pts The thread from stringArt().
 * @param {Array} nails Its nails, same units.
 * @return {number} Thread length / board width.
 */
export function threadLength( pts, nails ) {
	let length = 0;
	for ( let i = 1; i < pts.length; i++ ) {
		length += Math.hypot(
			pts[ i ][ 0 ] - pts[ i - 1 ][ 0 ],
			pts[ i ][ 1 ] - pts[ i - 1 ][ 1 ]
		);
	}
	const xs = nails.map( ( p ) => p[ 0 ] );
	const span = Math.max( ...xs ) - Math.min( ...xs );
	return span > 0 ? length / span : 0;
}

/**
 * Several threads, one after another, each in its own colour (v2.9) - the
 * way coloured string art is made: a light thread first, the darkest last
 * and on top. On a dark board it turns round (v3.6 of Text Art): the
 * thread furthest from the board is always the one on top.
 *
 * Every pixel is shared out among the threads and the bare board by how
 * close its colour is to each: a red cheek asks for the red thread, a
 * black eyebrow for the black one, a white wall for none. Each thread is
 * then wound like the single one, on the same nails, through what is
 * asked of it, with a share of the thread budget that matches how much
 * is asked.
 *
 * @param {Object} field  { w, h, r, g, b } - channels 0..255 (Float32Array).
 * @param {Array}  colors Thread colours [ [r,g,b], ... ].
 * @param {Object} o      As stringArt, plus paper ([r,g,b], the board).
 * @return {Object} { layers: [ { color, order, pts } ] closest to the
 *                  board first, nails, width }.
 */
export function stringArtColors( field, colors, o = {} ) {
	const paper = o.paper || [ 255, 255, 255 ];
	const n = field.w * field.h;
	const K = colors.length;
	const d2 = ( r, g, b, c ) =>
		( r - c[ 0 ] ) ** 2 * 0.55 + ( g - c[ 1 ] ) ** 2 + ( b - c[ 2 ] ) ** 2 * 0.45;
	const SIGMA2 = 2 * 62 * 62;
	const asks = colors.map( () => new Float32Array( n ) );
	const total = new Float64Array( K );
	for ( let i = 0; i < n; i++ ) {
		const r = field.r[ i ];
		const g = field.g[ i ];
		const b = field.b[ i ];
		let sum = Math.exp( -d2( r, g, b, paper ) / SIGMA2 );
		const s = new Float64Array( K );
		for ( let k = 0; k < K; k++ ) {
			s[ k ] = Math.exp( -d2( r, g, b, colors[ k ] ) / SIGMA2 );
			sum += s[ k ];
		}
		for ( let k = 0; k < K; k++ ) {
			const v = sum > 0 ? s[ k ] / sum : 0;
			asks[ k ][ i ] = v;
			total[ k ] += v;
		}
	}
	const all = total.reduce( ( a, v ) => a + v, 0 ) || 1;
	const budget = Math.max( 100, o.threads || 4000 );
	const lum = ( c ) => 0.299 * c[ 0 ] + 0.587 * c[ 1 ] + 0.114 * c[ 2 ];
	const layers = colors
		.map( ( color, k ) => {
			// The thread's tone field: dark where it is asked for.
			const v = new Float32Array( n );
			for ( let i = 0; i < n; i++ ) {
				v[ i ] = 1 - asks[ k ][ i ];
			}
			const art = stringArt(
				{ w: field.w, h: field.h, v },
				{
					...o,
					threads: Math.max( 120, Math.round( ( budget * total[ k ] ) / all ) ),
					seed: ( o.seed || 3 ) + k,
				}
			);
			return { color, order: art.order, pts: art.pts, art };
		} )
		.sort( ( a, b ) => ( lum( paper ) > 128 ? 1 : -1 ) * ( lum( b.color ) - lum( a.color ) ) );
	const first = layers[ 0 ].art;
	return {
		layers: layers.map( ( { color, order, pts } ) => ( { color, order, pts } ) ),
		nails: first.nails,
		width: first.width,
	};
}

/**
 * The thread colours a picture asks for (Text Art 3.6): its
 * strongest colours that are not the board, the one furthest from the
 * board always among them - on white that is the darkest, which draws
 * the outlines.
 *
 * A few rounds of k-means on a sample of the field; seeded, so the same
 * picture always gets the same threads.
 *
 * @param {Object} field { w, h, r, g, b } 0..255.
 * @param {number} k     Threads wanted.
 * @param {Array}  paper The board [r,g,b].
 * @return {Array} [ [r,g,b], ... ].
 */
export function threadColorsFrom( field, k, paper = [ 255, 255, 255 ] ) {
	const d2 = ( a, b ) =>
		( a[ 0 ] - b[ 0 ] ) ** 2 * 0.55 + ( a[ 1 ] - b[ 1 ] ) ** 2 + ( a[ 2 ] - b[ 2 ] ) ** 2 * 0.45;
	const n = field.w * field.h;
	const step = Math.max( 1, Math.floor( n / 4000 ) );
	const px = [];
	for ( let i = 0; i < n; i += step ) {
		const p = [ field.r[ i ], field.g[ i ], field.b[ i ] ];
		if ( d2( p, paper ) > 1600 ) {
			px.push( p );
		}
	}
	if ( ! px.length ) {
		return [ paper.map( ( v ) => 255 - v ) ];
	}
	// The farthest from the board is always a thread.
	const far = px.reduce( ( a, p ) => ( d2( p, paper ) > d2( a, paper ) ? p : a ), px[ 0 ] );
	// k-means with farthest-point seeds.
	const K = Math.min( px.length, Math.max( k * 2, 4 ) );
	const centres = [ far.slice() ];
	while ( centres.length < K ) {
		let best = px[ 0 ];
		let bd = -1;
		for ( const p of px ) {
			const d = Math.min( ...centres.map( ( c ) => d2( p, c ) ) );
			if ( d > bd ) {
				bd = d;
				best = p;
			}
		}
		centres.push( best.slice() );
	}
	let sizes = centres.map( () => 0 );
	for ( let round = 0; round < 6; round++ ) {
		const sums = centres.map( () => [ 0, 0, 0 ] );
		sizes = centres.map( () => 0 );
		for ( const p of px ) {
			let bi = 0;
			let bd = Infinity;
			centres.forEach( ( c, i ) => {
				const d = d2( p, c );
				if ( d < bd ) {
					bd = d;
					bi = i;
				}
			} );
			sums[ bi ][ 0 ] += p[ 0 ];
			sums[ bi ][ 1 ] += p[ 1 ];
			sums[ bi ][ 2 ] += p[ 2 ];
			sizes[ bi ]++;
		}
		centres.forEach( ( c, i ) => {
			if ( sizes[ i ] ) {
				centres[ i ] = sums[ i ].map( ( v ) => v / sizes[ i ] );
			}
		} );
	}
	const ranked = centres
		.map( ( c, i ) => ( { c, score: sizes[ i ] * Math.sqrt( d2( c, paper ) ) } ) )
		.filter( ( e ) => e.score > 0 )
		.sort( ( a, b ) => b.score - a.score );
	const out = [ far.map( Math.round ) ];
	for ( const e of ranked ) {
		if ( out.length >= k ) {
			break;
		}
		if ( out.every( ( c ) => d2( c, e.c ) > 1600 ) ) {
			out.push( e.c.map( Math.round ) );
		}
	}
	return out;
}
