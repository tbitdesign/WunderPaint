import { continuousLine } from './continuous-line.js';
import {
	stringArt,
	stringArtColors,
	threadColorsFrom,
} from '../../shared/string-art.js';

/**
 * Text Art, drawn with lines: the picture rebuilt from ink instead of
 * from glyphs or tiles. Four pens - an engraving whose lines swell
 * instead of darkening, iso-lines of brightness, stippled dots, and one
 * single continuous line through every dot.
 *
 * The geometry is pure and node-testable: everything reads from ONE
 * field of tone and returns polylines. Only `renderLineArt` touches a
 * canvas, and `lineArtPaths` hands the same geometry to the editor as
 * real vector paths - which is what makes these four the only cards here
 * that can leave as curves rather than as pixels.
 */

const makeCanvas = ( like, w, h ) => {
	const c =
		'undefined' !== typeof document
			? document.createElement( 'canvas' )
			: new like.constructor( w, h );
	c.width = w;
	c.height = h;
	return c;
};

/* ------------------------------ the field ------------------------------- */

/** RGBA bytes to brightness 0..1, with the eye's own weights. */
export function luminanceField( img ) {
	const { w, h, data } = img;
	const v = new Float32Array( w * h );
	for ( let i = 0, p = 0; p < v.length; i += 4, p++ ) {
		v[ p ] =
			( data[ i ] * 0.299 +
				data[ i + 1 ] * 0.587 +
				data[ i + 2 ] * 0.114 ) /
			255;
	}
	return { w, h, v };
}

/** Box blur, separable, radius in pixels. Detail a pen cannot draw is noise. */
export function blur( field, radius ) {
	const r = Math.max( 0, Math.round( radius ) );
	if ( ! r ) {
		return field;
	}
	const { w, h, v } = field;
	const tmp = new Float32Array( w * h );
	const out = new Float32Array( w * h );
	const k = 1 / ( 2 * r + 1 );
	for ( let y = 0; y < h; y++ ) {
		let sum = 0;
		for ( let x = -r; x <= r; x++ ) {
			sum += v[ y * w + Math.min( w - 1, Math.max( 0, x ) ) ];
		}
		for ( let x = 0; x < w; x++ ) {
			tmp[ y * w + x ] = sum * k;
			sum +=
				v[ y * w + Math.min( w - 1, x + r + 1 ) ] -
				v[ y * w + Math.max( 0, x - r ) ];
		}
	}
	for ( let x = 0; x < w; x++ ) {
		let sum = 0;
		for ( let y = -r; y <= r; y++ ) {
			sum += tmp[ Math.min( h - 1, Math.max( 0, y ) ) * w + x ];
		}
		for ( let y = 0; y < h; y++ ) {
			out[ y * w + x ] = sum * k;
			sum +=
				tmp[ Math.min( h - 1, y + r + 1 ) * w + x ] -
				tmp[ Math.max( 0, y - r ) * w + x ];
		}
	}
	return { w, h, v: out };
}

/** Bilinear read, clamped at the edges. */
export function sample( field, x, y ) {
	const { w, h, v } = field;
	// The last legal reading place is one pixel in from the far edge,
	// because bilinear reads the NEXT row and column too. On a field one
	// pixel high that place is zero, not a negative number - which is what
	// walked the read off the end of the array and returned NaN.
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

/** Where the tone falls fastest, and how fast. */
export function gradient( field, x, y, step = 1 ) {
	const gx =
		( sample( field, x + step, y ) - sample( field, x - step, y ) ) /
		( 2 * step );
	const gy =
		( sample( field, x, y + step ) - sample( field, x, y - step ) ) /
		( 2 * step );
	return { gx, gy, mag: Math.hypot( gx, gy ) };
}

/**
 * Stretch the tones so the darkest ink and the empty paper are actually
 * used. A photograph that never reaches black draws a grey drawing.
 */
export function stretch( field, o = {} ) {
	const { low = 0.02, high = 0.98, gamma = 1 } = o;
	const sorted = Float32Array.from( field.v ).sort();
	const lo = sorted[ Math.floor( low * ( sorted.length - 1 ) ) ];
	const hi = sorted[ Math.floor( high * ( sorted.length - 1 ) ) ];
	// A picture with no range at all must be left alone. Dividing by a
	// span of nothing turned an empty white canvas into solid black, and
	// every pen then drew furiously across a page that had nothing on it.
	if ( hi - lo < 0.02 ) {
		return { w: field.w, h: field.h, v: Float32Array.from( field.v ) };
	}
	const span = hi - lo;
	const out = new Float32Array( field.v.length );
	for ( let i = 0; i < out.length; i++ ) {
		const t = Math.min( 1, Math.max( 0, ( field.v[ i ] - lo ) / span ) );
		out[ i ] = 1 === gamma ? t : Math.pow( t, gamma );
	}
	return { w: field.w, h: field.h, v: out };
}

/** How much ink a point wants: dark is much, light is none. */
export const inkAt = ( field, x, y ) => 1 - sample( field, x, y );

/* -------------------------------- the pens ------------------------------- */

const TAU = Math.PI * 2;

/** A seeded stream, so a drawing can be drawn again. */
export function rng( seed ) {
	let a = seed >>> 0 || 1;
	return () => {
		a |= 0;
		a = ( a + 0x6d2b79f5 ) | 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

/**
 * Parallel engraving lines at a fixed angle.
 *
 * The line wanders a little across its own path (`wobble`), which is what
 * keeps an engraving from looking like a printer test page, and swells
 * with the ink under it.
 */
export function engraveParallel( field, o = {} ) {
	const {
		spacing = 6,
		angle = 0,
		wobble = 0.35,
		waves = 2.2,
		weight = 1,
		minInk = 0.04,
		step = 2,
	} = o;
	const { w, h } = field;
	const dx = Math.cos( angle );
	const dy = Math.sin( angle );
	const nx = -dy;
	const ny = dx;
	const diag = Math.hypot( w, h );
	const half = diag / 2;
	const cx = w / 2;
	const cy = h / 2;
	const lines = [];
	for ( let off = -half; off <= half; off += spacing ) {
		const pts = [];
		const width = [];
		let run = [];
		let runW = [];
		for ( let t = -half; t <= half; t += step ) {
			// The line's own place, plus a lateral wobble along its length.
			const wob =
				wobble *
				spacing *
				Math.sin( ( t / diag ) * TAU * waves + off * 0.05 );
			const x = cx + dx * t + nx * ( off + wob );
			const y = cy + dy * t + ny * ( off + wob );
			if ( x < 0 || y < 0 || x > w || y > h ) {
				if ( run.length > 1 ) {
					lines.push( { pts: run, width: runW } );
				}
				run = [];
				runW = [];
				continue;
			}
			const ink = inkAt( field, x, y );
			if ( ink < minInk ) {
				if ( run.length > 1 ) {
					lines.push( { pts: run, width: runW } );
				}
				run = [];
				runW = [];
				continue;
			}
			run.push( [ x, y ] );
			// Half the spacing is full black: at that width the lines touch.
			runW.push( ink * spacing * 0.5 * weight );
		}
		if ( run.length > 1 ) {
			lines.push( { pts: run, width: runW } );
		}
		void pts;
		void width;
	}
	return lines;
}

/**
 * Engraving lines that follow the FORM: they run along the tone instead
 * of across it, so they wrap a cheek the way contour lines wrap a hill.
 * Evenly spaced streamlines through the field's tangent direction.
 */
export function engraveForm( field, o = {} ) {
	const {
		spacing = 7,
		weight = 1,
		minInk = 0.05,
		step = 2,
		maxLines = 900,
		seed = 1,
		flatten = 0.6,
	} = o;
	const { w, h } = field;
	const cell = spacing;
	const grid = new Map();
	const key = ( x, y ) => ( ( x / cell ) | 0 ) + ',' + ( ( y / cell ) | 0 );
	const near = ( x, y, d ) => {
		const i0 = ( ( x - d ) / cell ) | 0;
		const i1 = ( ( x + d ) / cell ) | 0;
		const j0 = ( ( y - d ) / cell ) | 0;
		const j1 = ( ( y + d ) / cell ) | 0;
		for ( let i = i0; i <= i1; i++ ) {
			for ( let j = j0; j <= j1; j++ ) {
				const bucket = grid.get( i + ',' + j );
				if ( ! bucket ) {
					continue;
				}
				for ( const p of bucket ) {
					if ( Math.hypot( p[ 0 ] - x, p[ 1 ] - y ) < d ) {
						return true;
					}
				}
			}
		}
		return false;
	};
	const add = ( x, y ) => {
		const k = key( x, y );
		if ( ! grid.has( k ) ) {
			grid.set( k, [] );
		}
		grid.get( k ).push( [ x, y ] );
	};
	// Where the picture is flat there is no form to follow, so the lines
	// fall back to one direction and stay parallel instead of curling into
	// noise. That is a drawing decision, not a numerical one.
	const dirAt = ( x, y ) => {
		const g = gradient( field, x, y, 1.5 );
		if ( g.mag < 0.002 ) {
			return [ Math.cos( flatten ), Math.sin( flatten ) ];
		}
		return [ -g.gy / g.mag, g.gx / g.mag ];
	};
	const walk = ( sx, sy, dir ) => {
		const pts = [];
		let x = sx;
		let y = sy;
		let px = 0;
		let py = 0;
		for ( let i = 0; i < 2000; i++ ) {
			if ( x < 0 || y < 0 || x > w - 1 || y > h - 1 ) {
				break;
			}
			if ( pts.length > 3 && near( x, y, spacing * 0.85 ) ) {
				break;
			}
			pts.push( [ x, y ] );
			let [ ux, uy ] = dirAt( x, y );
			// Never turn back on yourself: a direction field has no sign,
			// and without this the line walks two steps and stalls.
			if ( pts.length > 1 && ux * px + uy * py < 0 ) {
				ux = -ux;
				uy = -uy;
			}
			px = ux;
			py = uy;
			x += ux * dir * step;
			y += uy * dir * step;
		}
		return pts;
	};
	const rnd = rng( seed );
	const lines = [];
	const seeds = [];
	const n = Math.ceil( Math.sqrt( maxLines * 8 ) );
	for ( let j = 0; j < n; j++ ) {
		for ( let i = 0; i < n; i++ ) {
			seeds.push( [
				( ( i + rnd() ) / n ) * w,
				( ( j + rnd() ) / n ) * h,
			] );
		}
	}
	seeds.sort( () => rnd() - 0.5 );
	for ( const [ sx, sy ] of seeds ) {
		if ( lines.length >= maxLines ) {
			break;
		}
		if ( inkAt( field, sx, sy ) < minInk || near( sx, sy, spacing ) ) {
			continue;
		}
		const back = walk( sx, sy, -1 ).reverse();
		const fwd = walk( sx, sy, 1 ).slice( 1 );
		const pts = back.concat( fwd );
		if ( pts.length < 4 ) {
			continue;
		}
		pts.forEach( ( p ) => add( p[ 0 ], p[ 1 ] ) );
		lines.push( {
			pts,
			width: pts.map(
				( p ) => inkAt( field, p[ 0 ], p[ 1 ] ) * spacing * 0.5 * weight
			),
		} );
	}
	return lines;
}

/**
 * Crosshatch: layers of straight strokes, each one only where the tone
 * has fallen far enough to call for it. Four layers give five tones, the
 * way a pen does it - not by pressing harder but by going over again.
 */
export function hatchLayers( field, o = {} ) {
	const {
		layers = 4,
		spacing = 7,
		angle = -0.5,
		turn = 0.85,
		step = 2,
		jitter = 0.35,
		seed = 3,
	} = o;
	const rnd = rng( seed );
	const out = [];
	for ( let k = 0; k < layers; k++ ) {
		// Layer k appears below this brightness: the darker the tone, the
		// more layers have already been laid over it.
		const threshold = 1 - ( k + 1 ) / ( layers + 1 );
		const a = angle + turn * k;
		const strokes = engraveParallel( field, {
			spacing,
			angle: a,
			wobble: 0,
			weight: 0,
			minInk: 1 - threshold,
			step,
		} ).map( ( line ) => ( {
			pts: line.pts.map( ( p ) => [
				p[ 0 ] + ( rnd() - 0.5 ) * jitter,
				p[ 1 ] + ( rnd() - 0.5 ) * jitter,
			] ),
			width: null,
			layer: k,
		} ) );
		out.push( ...strokes );
	}
	return out;
}

/**
 * Iso-lines of brightness: the picture as a map of heights. Marching
 * squares, then the segments are joined end to end so a contour comes out
 * as one path instead of a thousand dashes.
 */
export function contourLines( field, o = {} ) {
	const { levels = 12, step = 2, minLength = 12 } = o;
	const { w, h } = field;
	const out = [];
	for ( let l = 1; l <= levels; l++ ) {
		const level = l / ( levels + 1 );
		const segs = [];
		for ( let y = 0; y + step < h; y += step ) {
			for ( let x = 0; x + step < w; x += step ) {
				const a = sample( field, x, y );
				const b = sample( field, x + step, y );
				const c = sample( field, x + step, y + step );
				const d = sample( field, x, y + step );
				const idx =
					( a > level ? 1 : 0 ) |
					( b > level ? 2 : 0 ) |
					( c > level ? 4 : 0 ) |
					( d > level ? 8 : 0 );
				if ( 0 === idx || 15 === idx ) {
					continue;
				}
				const top = [ x + step * mix( a, b, level ), y ];
				const right = [ x + step, y + step * mix( b, c, level ) ];
				const bottom = [ x + step * mix( d, c, level ), y + step ];
				const left = [ x, y + step * mix( a, d, level ) ];
				for ( const [ p, q ] of CASES[ idx ](
					top,
					right,
					bottom,
					left
				) ) {
					segs.push( [ p, q ] );
				}
			}
		}
		join( segs, minLength ).forEach( ( pts ) =>
			out.push( { pts, width: null, level: l } )
		);
	}
	return out;
}

const mix = ( a, b, level ) => {
	const d = b - a;
	return Math.abs( d ) < 1e-9
		? 0.5
		: Math.min( 1, Math.max( 0, ( level - a ) / d ) );
};

/** Which edges a cell's corners connect. The two saddles take both pairs. */
const CASES = {
	1: ( t, r, b, l ) => [ [ l, t ] ],
	2: ( t, r ) => [ [ t, r ] ],
	3: ( t, r, b, l ) => [ [ l, r ] ],
	4: ( t, r, b ) => [ [ r, b ] ],
	5: ( t, r, b, l ) => [
		[ l, t ],
		[ r, b ],
	],
	6: ( t, r, b ) => [ [ t, b ] ],
	7: ( t, r, b, l ) => [ [ l, b ] ],
	8: ( t, r, b, l ) => [ [ b, l ] ],
	9: ( t, r, b ) => [ [ t, b ] ],
	10: ( t, r, b, l ) => [
		[ t, r ],
		[ b, l ],
	],
	11: ( t, r, b ) => [ [ r, b ] ],
	12: ( t, r, b, l ) => [ [ r, l ] ],
	13: ( t, r ) => [ [ t, r ] ],
	14: ( t, r, b, l ) => [ [ l, t ] ],
};

/** Segments to polylines: whoever shares an end is the same line. */
export function join( segs, minLength = 0 ) {
	const key = ( p ) =>
		Math.round( p[ 0 ] * 4 ) + ',' + Math.round( p[ 1 ] * 4 );
	const ends = new Map();
	segs.forEach( ( s, i ) => {
		for ( const p of s ) {
			const k = key( p );
			if ( ! ends.has( k ) ) {
				ends.set( k, [] );
			}
			ends.get( k ).push( i );
		}
	} );
	const used = new Set();
	const lines = [];
	const grow = ( pts, from ) => {
		for (;;) {
			const k = key( pts[ from ? 0 : pts.length - 1 ] );
			const next = ( ends.get( k ) || [] ).find(
				( i ) => ! used.has( i )
			);
			if ( undefined === next ) {
				return;
			}
			used.add( next );
			const [ a, b ] = segs[ next ];
			const tail = pts[ from ? 0 : pts.length - 1 ];
			const other = key( a ) === key( tail ) ? b : a;
			if ( from ) {
				pts.unshift( other );
			} else {
				pts.push( other );
			}
		}
	};
	segs.forEach( ( seg, i ) => {
		if ( used.has( i ) ) {
			return;
		}
		used.add( i );
		const pts = [ seg[ 0 ], seg[ 1 ] ];
		grow( pts, false );
		grow( pts, true );
		let len = 0;
		for ( let j = 1; j < pts.length; j++ ) {
			len += Math.hypot(
				pts[ j ][ 0 ] - pts[ j - 1 ][ 0 ],
				pts[ j ][ 1 ] - pts[ j - 1 ][ 1 ]
			);
		}
		if ( len >= minLength ) {
			lines.push( pts );
		}
	} );
	return lines;
}

/* --------------------------- dots and one line --------------------------- */

/**
 * Dots whose density follows the ink.
 *
 * @param {Object} field  A tone field.
 * @param {Object} o      count, gamma, rounds, seed, sample.
 * @return {Array} Points as [x, y].
 */
export function stipple( field, o = {} ) {
	const {
		count = 4000,
		gamma = 1,
		rounds = 4,
		seed = 7,
		sample: sub = 2,
		minInk = 0,
	} = o;
	const { w, h } = field;
	const rnd = rng( seed );
	// Empty paper gets no dots at all. Without that floor the relaxation
	// spreads them into the background as evenly as into the face, and the
	// drawing becomes a texture instead of a portrait.
	const weight = ( x, y ) => {
		const ink = inkAt( field, x, y );
		return ink < minInk
			? 0
			: Math.pow( ( ink - minInk ) / ( 1 - minInk ), gamma );
	};
	const pts = [];
	// Rejection sampling: a dark place says yes more often than a light one.
	for ( let guard = 0; pts.length < count && guard < count * 400; guard++ ) {
		const x = rnd() * ( w - 1 );
		const y = rnd() * ( h - 1 );
		if ( rnd() < weight( x, y ) ) {
			pts.push( [ x, y ] );
		}
	}
	for ( let r = 0; r < rounds; r++ ) {
		relax( pts, field, weight, sub );
	}
	return pts;
}

/**
 * One round of Lloyd: every pixel goes to its nearest dot, every dot
 * moves to the weighted middle of what it collected. The nearest dot is
 * found through a grid, or this would be one long multiplication table.
 */
export function relax( pts, field, weight, sub = 2 ) {
	const { w, h } = field;
	if ( pts.length < 2 ) {
		return pts;
	}
	const cell = Math.max( 4, Math.sqrt( ( w * h ) / pts.length ) );
	const cols = Math.ceil( w / cell );
	const rows = Math.ceil( h / cell );
	const buckets = new Array( cols * rows );
	pts.forEach( ( p, i ) => {
		const k =
			Math.min( rows - 1, ( p[ 1 ] / cell ) | 0 ) * cols +
			Math.min( cols - 1, ( p[ 0 ] / cell ) | 0 );
		( buckets[ k ] || ( buckets[ k ] = [] ) ).push( i );
	} );
	const sumX = new Float64Array( pts.length );
	const sumY = new Float64Array( pts.length );
	const sumW = new Float64Array( pts.length );
	for ( let y = 0; y < h; y += sub ) {
		const cj = Math.min( rows - 1, ( y / cell ) | 0 );
		for ( let x = 0; x < w; x += sub ) {
			const ci = Math.min( cols - 1, ( x / cell ) | 0 );
			let best = -1;
			let bestD = Infinity;
			// Three rings of cells is enough: beyond that a dot is never
			// the nearest one, because the grid holds about one dot a cell.
			for ( let r = 1; r <= 3 && best < 0; r++ ) {
				for (
					let j = Math.max( 0, cj - r );
					j <= Math.min( rows - 1, cj + r );
					j++
				) {
					for (
						let i = Math.max( 0, ci - r );
						i <= Math.min( cols - 1, ci + r );
						i++
					) {
						for ( const idx of buckets[ j * cols + i ] || [] ) {
							const dx = pts[ idx ][ 0 ] - x;
							const dy = pts[ idx ][ 1 ] - y;
							const d = dx * dx + dy * dy;
							if ( d < bestD ) {
								bestD = d;
								best = idx;
							}
						}
					}
				}
			}
			if ( best < 0 ) {
				continue;
			}
			const wgt = weight( x, y ) + 0.002;
			sumX[ best ] += x * wgt;
			sumY[ best ] += y * wgt;
			sumW[ best ] += wgt;
		}
	}
	pts.forEach( ( p, i ) => {
		if ( sumW[ i ] > 1e-6 ) {
			p[ 0 ] = sumX[ i ] / sumW[ i ];
			p[ 1 ] = sumY[ i ] / sumW[ i ];
		}
	} );
	return pts;
}

/**
 * One line through every dot.
 *
 * A nearest-neighbour tour first, which is quick and ugly, then 2-opt
 * only on neighbours that are actually close - untangling a crossing far
 * away costs everything and changes nothing anybody sees. Time-budgeted,
 * because this is a drawing, not a proof.
 */
export function tour( points, o = {} ) {
	const { budgetMs = 1500, neighbours = 12 } = o;
	const n = points.length;
	if ( n < 3 ) {
		return points.map( ( _, i ) => i );
	}
	const cell = Math.max(
		4,
		Math.sqrt( ( bounds( points ).area || 1 ) / n ) * 1.5
	);
	const grid = new Map();
	const key = ( x, y ) => ( ( x / cell ) | 0 ) + ',' + ( ( y / cell ) | 0 );
	points.forEach( ( p, i ) => {
		const k = key( p[ 0 ], p[ 1 ] );
		( grid.get( k ) || grid.set( k, [] ).get( k ) ).push( i );
	} );
	const used = new Uint8Array( n );
	const order = [ 0 ];
	used[ 0 ] = 1;
	let cur = 0;
	for ( let k = 1; k < n; k++ ) {
		let best = -1;
		let bestD = Infinity;
		const [ cx, cy ] = points[ cur ];
		for ( let r = 1; r <= 40 && best < 0; r++ ) {
			const i0 = ( ( cx - r * cell ) / cell ) | 0;
			const i1 = ( ( cx + r * cell ) / cell ) | 0;
			const j0 = ( ( cy - r * cell ) / cell ) | 0;
			const j1 = ( ( cy + r * cell ) / cell ) | 0;
			for ( let j = j0; j <= j1; j++ ) {
				for ( let i = i0; i <= i1; i++ ) {
					for ( const idx of grid.get( i + ',' + j ) || [] ) {
						if ( used[ idx ] ) {
							continue;
						}
						const d =
							( points[ idx ][ 0 ] - cx ) ** 2 +
							( points[ idx ][ 1 ] - cy ) ** 2;
						if ( d < bestD ) {
							bestD = d;
							best = idx;
						}
					}
				}
			}
		}
		if ( best < 0 ) {
			best = used.indexOf( 0 );
			if ( best < 0 ) {
				break;
			}
		}
		used[ best ] = 1;
		order.push( best );
		cur = best;
	}
	return twoOpt( order, points, budgetMs, neighbours );
}

/** Untangle crossings, nearest pairs first, until the clock runs out. */
export function twoOpt( order, points, budgetMs, neighbours ) {
	const t0 = Date.now();
	const n = order.length;
	const d = ( a, b ) =>
		Math.hypot(
			points[ a ][ 0 ] - points[ b ][ 0 ],
			points[ a ][ 1 ] - points[ b ][ 1 ]
		);
	let improved = true;
	while ( improved && Date.now() - t0 < budgetMs ) {
		improved = false;
		for ( let i = 1; i < n - 2 && Date.now() - t0 < budgetMs; i++ ) {
			const end = Math.min( n - 1, i + neighbours );
			for ( let k = i + 1; k < end; k++ ) {
				const a = order[ i - 1 ];
				const b = order[ i ];
				const c = order[ k ];
				const e = order[ k + 1 ];
				if ( d( a, b ) + d( c, e ) > d( a, c ) + d( b, e ) + 1e-9 ) {
					let lo = i;
					let hi = k;
					while ( lo < hi ) {
						const t = order[ lo ];
						order[ lo ] = order[ hi ];
						order[ hi ] = t;
						lo++;
						hi--;
					}
					improved = true;
				}
			}
		}
	}
	return order;
}

/** How long a tour is, which is the only honest way to say it got better. */
export function tourLength( order, points ) {
	let sum = 0;
	for ( let i = 1; i < order.length; i++ ) {
		sum += Math.hypot(
			points[ order[ i ] ][ 0 ] - points[ order[ i - 1 ] ][ 0 ],
			points[ order[ i ] ][ 1 ] - points[ order[ i - 1 ] ][ 1 ]
		);
	}
	return sum;
}

function bounds( points ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const p of points ) {
		x0 = Math.min( x0, p[ 0 ] );
		y0 = Math.min( y0, p[ 1 ] );
		x1 = Math.max( x1, p[ 0 ] );
		y1 = Math.max( y1, p[ 1 ] );
	}
	return { x0, y0, x1, y1, area: ( x1 - x0 ) * ( y1 - y0 ) };
}

/* --------------------------- thread and morse ---------------------------- */

// String art lives in extensions/shared/string-art.js since 3.6: Stitch
// Patterns winds its buildable boards with the very same engine.
export { stringArt };

/** International Morse, plus the German letters. */
export const MORSE = {
	A: '.-',
	B: '-...',
	C: '-.-.',
	D: '-..',
	E: '.',
	F: '..-.',
	G: '--.',
	H: '....',
	I: '..',
	J: '.---',
	K: '-.-',
	L: '.-..',
	M: '--',
	N: '-.',
	O: '---',
	P: '.--.',
	Q: '--.-',
	R: '.-.',
	S: '...',
	T: '-',
	U: '..-',
	V: '...-',
	W: '.--',
	X: '-..-',
	Y: '-.--',
	Z: '--..',
	0: '-----',
	1: '.----',
	2: '..---',
	3: '...--',
	4: '....-',
	5: '.....',
	6: '-....',
	7: '--...',
	8: '---..',
	9: '----.',
	'.': '.-.-.-',
	',': '--..--',
	'?': '..--..',
	'!': '-.-.--',
	'&': '.-...',
	'@': '.--.-.',
	'-': '-....-',
	'/': '-..-.',
	Ä: '.-.-',
	Ö: '---.',
	Ü: '..--',
	ẞ: '...--..',
};

/**
 * A message as Morse tokens: '.' and '-' are marks, ' ' ends a letter,
 * '/' ends a word. Characters Morse has no sign for are left out.
 *
 * @param {string} text Any text.
 * @return {Array<string>} Tokens, never empty.
 */
export function morseTokens( text ) {
	const out = [];
	// The sharp s has a sign of its own; upper-casing first would turn it
	// into two letters.
	for ( const word of String( text || '' )
		.replace( /ß/g, 'ẞ' )
		.toUpperCase()
		.split( /\s+/ )
		.filter( Boolean ) ) {
		let any = false;
		for ( const ch of word ) {
			const code = MORSE[ ch ];
			if ( ! code ) {
				continue;
			}
			out.push( ...code, ' ' );
			any = true;
		}
		if ( any ) {
			out[ out.length - 1 ] = '/';
		}
	}
	return out.length
		? out
		: [ ...MORSE.S, ' ', ...MORSE.O, ' ', ...MORSE.S, '/' ];
}

/**
 * Morse portrait: rows of dots and dashes that spell a message over and
 * over, and swell with the ink under them, so the code IS the picture.
 * Marks get round ends: a dot reads as a dot, not as a short brick.
 *
 * @param {Object} field A tone field.
 * @param {Object} o     spacing, weight, text, gamma.
 * @return {Array} Lines { pts, width } for a ribbon drawing.
 */
export function morseLines( field, o = {} ) {
	const spacing = clamp( o.spacing || 7, 4, 18 );
	const weight = clamp( o.weight || 1, 0.2, 2 );
	const gamma = o.gamma || 0.9;
	const tokens = morseTokens( o.text );
	const u = spacing * 0.55;
	const maxHalf = spacing * 0.44 * weight;
	const step = Math.max( 0.5, u / 6 );
	const lines = [];
	let ti = 0;
	for ( let y = spacing / 2; y < field.h; y += spacing ) {
		let x = u * 0.5;
		for ( let guard = 0; guard < 4000; guard++ ) {
			const tok = tokens[ ti % tokens.length ];
			if ( '.' === tok || '-' === tok ) {
				const len = '.' === tok ? u : 3 * u;
				if ( x + len > field.w - u * 0.5 ) {
					break;
				}
				const pts = [];
				const width = [];
				for ( let s = 0; s <= len + 1e-6; s += step ) {
					const px = x + Math.min( s, len );
					const ink = Math.max( 0, inkAt( field, px, y ) );
					// The end of a mark rounds off over half a unit.
					const e = Math.min( s, len - s );
					const round = Math.sqrt(
						Math.max( 0, Math.min( 1, e / ( u * 0.5 ) ) )
					);
					pts.push( [ px, y ] );
					width.push(
						Math.max( 0.1, maxHalf * Math.pow( ink, gamma ) ) *
							Math.max( 0.18, round )
					);
				}
				lines.push( { pts, width } );
				x += len + u;
			} else {
				x += ' ' === tok ? 2 * u : 6 * u;
			}
			ti++;
			if ( x >= field.w - u * 0.5 ) {
				break;
			}
		}
	}
	return lines;
}

/* ------------------------------- path data ------------------------------- */

const r2 = ( v ) => Math.round( v * 100 ) / 100;

/** A polyline as a stroked path. */
export function linePath( pts, close = false ) {
	if ( ! pts || pts.length < 2 ) {
		return '';
	}
	let d = 'M' + r2( pts[ 0 ][ 0 ] ) + ' ' + r2( pts[ 0 ][ 1 ] );
	for ( let i = 1; i < pts.length; i++ ) {
		d += 'L' + r2( pts[ i ][ 0 ] ) + ' ' + r2( pts[ i ][ 1 ] );
	}
	return d + ( close ? 'Z' : '' );
}

/**
 * A line that swells: walk up one side and back down the other.
 *
 * The normal comes from the neighbours, not from the segment, so the
 * outline does not pinch at a bend.
 */
export function ribbonPath( pts, width, min = 0.15 ) {
	if ( ! pts || pts.length < 2 ) {
		return '';
	}
	const left = [];
	const right = [];
	for ( let i = 0; i < pts.length; i++ ) {
		const a = pts[ Math.max( 0, i - 1 ) ];
		const b = pts[ Math.min( pts.length - 1, i + 1 ) ];
		const dx = b[ 0 ] - a[ 0 ];
		const dy = b[ 1 ] - a[ 1 ];
		const len = Math.hypot( dx, dy ) || 1;
		const nx = -dy / len;
		const ny = dx / len;
		const half = Math.max( min, width[ i ] );
		left.push( [ pts[ i ][ 0 ] + nx * half, pts[ i ][ 1 ] + ny * half ] );
		right.push( [ pts[ i ][ 0 ] - nx * half, pts[ i ][ 1 ] - ny * half ] );
	}
	right.reverse();
	return linePath( left.concat( right ), true );
}

/** Every line of a drawing in ONE path, so a drawing is one layer. */
export function bundle( lines, o = {} ) {
	const { ribbon = false, min = 0.15 } = o;
	let d = '';
	for ( const line of lines ) {
		d +=
			ribbon && line.width
				? ribbonPath( line.pts, line.width, min )
				: linePath( line.pts, !! line.close );
	}
	return d;
}

/** Dots as one path of little circles, drawn as two arcs each. */
export function dotsPath( points, radius ) {
	let d = '';
	points.forEach( ( p, i ) => {
		const r = 'function' === typeof radius ? radius( p, i ) : radius;
		if ( r <= 0 ) {
			return;
		}
		const x = r2( p[ 0 ] );
		const y = r2( p[ 1 ] );
		const rr = r2( r );
		d +=
			'M' +
			r2( p[ 0 ] - r ) +
			' ' +
			y +
			'a' +
			rr +
			' ' +
			rr +
			' 0 1 0 ' +
			r2( r * 2 ) +
			' 0a' +
			rr +
			' ' +
			rr +
			' 0 1 0 ' +
			r2( -r * 2 ) +
			' 0';
		void x;
	} );
	return d;
}

/* ------------------------------- the cards ------------------------------- */

const clamp = ( v, lo, hi ) => ( v < lo ? lo : v > hi ? hi : v );

/** The tone field of a source picture, at a working size a pen can use. */
export function fieldFrom( source, like, width = 620 ) {
	const sw = source.width || source.w;
	const sh = source.height || source.h;
	const w = Math.max( 80, Math.min( width, sw ) );
	const h = Math.max( 60, Math.round( ( w * sh ) / sw ) );
	const c = makeCanvas( like, w, h );
	const g = c.getContext( '2d' );
	g.drawImage( source, 0, 0, w, h );
	return luminanceField( { w, h, data: g.getImageData( 0, 0, w, h ).data } );
}

/**
 * The picture in colour at the same working size as fieldFrom, levelled
 * by its brightness (3.6): what the coloured string art winds from.
 */
export function colorFieldFrom( source, like, width = 620 ) {
	const sw = source.width || source.w;
	const sh = source.height || source.h;
	const w = Math.max( 80, Math.min( width, sw ) );
	const h = Math.max( 60, Math.round( ( w * sh ) / sw ) );
	const c = makeCanvas( like, w, h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, w, h );
	g.drawImage( source, 0, 0, w, h );
	const d = g.getImageData( 0, 0, w, h ).data;
	const n = w * h;
	const r = new Float32Array( n );
	const gg = new Float32Array( n );
	const b = new Float32Array( n );
	const lum = new Float32Array( n );
	for ( let i = 0; i < n; i++ ) {
		r[ i ] = d[ i * 4 ];
		gg[ i ] = d[ i * 4 + 1 ];
		b[ i ] = d[ i * 4 + 2 ];
		lum[ i ] = 0.299 * r[ i ] + 0.587 * gg[ i ] + 0.114 * b[ i ];
	}
	const sorted = Float32Array.from( lum ).sort();
	const lo = sorted[ Math.floor( n * 0.02 ) ];
	const hi = sorted[ Math.floor( n * 0.98 ) ];
	if ( hi - lo > 5 ) {
		const k = 255 / ( hi - lo );
		for ( const ch of [ r, gg, b ] ) {
			for ( let i = 0; i < n; i++ ) {
				ch[ i ] = Math.min( 255, Math.max( 0, ( ch[ i ] - lo ) * k ) );
			}
		}
	}
	return { w, h, r, g: gg, b };
}

const segmentsOf = ( pts ) => {
	const lines = [];
	for ( let i = 1; i < pts.length; i++ ) {
		lines.push( { pts: [ pts[ i - 1 ], pts[ i ] ] } );
	}
	return lines;
};

/**
 * The geometry of one drawing: polylines and their swelling, ready to be
 * painted or handed over as paths. Everything a pen needs to decide it
 * has already happened in the field.
 */
export function lineArtGeometry( field, o = {} ) {
	const mode = o.mode || 'engrave';
	// The contrast dial of the studio is the tone curve of the drawing:
	// a photograph that never reaches black draws a grey drawing.
	const base = stretch( blur( field, 1 ), {
		low: 0.02,
		high: 0.98,
		gamma: clamp( 1 / Math.max( 0.2, o.contrast || 1 ), 0.4, 2.5 ),
	} );
	const soft = blur( base, 3 );
	if ( 'string' === mode && ( o.threadColors || 1 ) >= 2 && o.colorField ) {
		// 3.6: several threads, each in its own colour, on the same nails.
		const paper = 'dark' === o.background ? [ 14, 16, 19 ] : [ 255, 255, 255 ];
		const k = Math.max( 2, Math.min( 4, o.threadColors ) );
		const colors =
			o.threadList && o.threadList.length >= 2
				? o.threadList.slice( 0, k )
				: threadColorsFrom( o.colorField, k, paper );
		const art = stringArtColors( o.colorField, colors, {
			nails: o.nails || 288,
			threads: o.threads || 4000,
			weight: ( o.threadWeight || 7 ) / 100,
			seed: o.seed || 3,
			paper,
		} );
		const layers = art.layers.map( ( l ) => ( { color: l.color, lines: segmentsOf( l.pts ) } ) );
		const side = Math.min( base.w, base.h );
		return {
			lines: layers.flatMap( ( l ) => l.lines ),
			layers,
			width: art.width,
			minWidth: Math.min( 0.12, art.width ),
			pins: art.nails,
			pinR: Math.max( 0.35, side / 520 ),
			crop: {
				x: ( base.w - side ) / 2,
				y: ( base.h - side ) / 2,
				w: side,
				h: side,
			},
		};
	}
	if ( 'string' === mode ) {
		const art = stringArt( base, {
			nails: o.nails || 288,
			threads: o.threads || 4000,
			weight: ( o.threadWeight || 7 ) / 100,
			dark: 'dark' === o.background,
			seed: o.seed || 3,
		} );
		const lines = [];
		for ( let i = 1; i < art.pts.length; i++ ) {
			lines.push( { pts: [ art.pts[ i - 1 ], art.pts[ i ] ] } );
		}
		// A string art board is round: the drawing is the square around
		// its ring, with the nails the thread was wound on.
		const side = Math.min( base.w, base.h );
		const pinR = Math.max( 0.35, side / 520 );
		return {
			lines,
			width: art.width,
			minWidth: Math.min( 0.12, art.width ),
			pins: art.nails,
			pinR,
			crop: {
				x: ( base.w - side ) / 2,
				y: ( base.h - side ) / 2,
				w: side,
				h: side,
			},
		};
	}
	if ( 'morse' === mode ) {
		return {
			lines: morseLines( base, {
				spacing: clamp( o.spacing || 7, 4, 18 ),
				weight: clamp( ( o.weight || 100 ) / 100, 0.2, 2 ),
				text: o.morseText,
			} ),
			ribbon: true,
			minWidth: 0.06,
		};
	}
	if ( 'contour' === mode ) {
		const lines = contourLines( soft, {
			levels: clamp( Math.round( o.levels || 16 ), 3, 40 ),
			step: 2,
			minLength: 26,
		} );
		return { lines, width: ( o.stroke || 1 ) / 2, fillRule: 'nonzero' };
	}
	if ( 'stipple' === mode ) {
		const pts = stipple( base, {
			count: clamp( Math.round( o.dots || 9000 ), 300, 30000 ),
			gamma: 0.85,
			rounds: 4,
			seed: o.seed || 7,
			minInk: 0.1,
		} );
		return { dots: pts, field: base, size: ( o.dotSize || 100 ) / 100 };
	}
	if ( 'oneline' === mode ) {
		if ( o.oneLine && o.oneLine !== 'tour' ) {
			return continuousLine( base, o );
		}
		// Empty paper gets no dots: without that floor the line spreads
		// evenly over the background and the face stops reading.
		const pts = stipple( base, {
			count: clamp( Math.round( o.dots || 7000 ), 300, 14000 ),
			gamma: 0.7,
			rounds: 4,
			seed: o.seed || 12,
			minInk: 0.16,
		} );
		const order = tour( pts, {
			budgetMs: o.budgetMs || 2500,
			neighbours: 24,
		} );
		// The longest hop is the seam between the beginning and the end of
		// the walk; cutting it there is what keeps one stray line from
		// crossing the whole portrait.
		const path = order.map( ( i ) => pts[ i ] );
		let worst = 0;
		let worstAt = 0;
		for ( let i = 1; i < path.length; i++ ) {
			const d = Math.hypot(
				path[ i ][ 0 ] - path[ i - 1 ][ 0 ],
				path[ i ][ 1 ] - path[ i - 1 ][ 1 ]
			);
			if ( d > worst ) {
				worst = d;
				worstAt = i;
			}
		}
		const cut =
			worst > 40
				? path.slice( worstAt ).concat( path.slice( 0, worstAt ) )
				: path;
		return { lines: [ { pts: cut } ], width: ( o.stroke || 1 ) / 2 };
	}
	const spacing = clamp( o.spacing || 5, 3, 16 );
	const weight = clamp( ( o.weight || 100 ) / 100, 0.2, 2 );
	if ( o.follow ) {
		// A form-following line needs a CALM field, or it follows every
		// pore and curls into noodles. The direction comes from the calm
		// field, the swelling still from the sharp one.
		const calm = blur( base, 7 );
		return {
			lines: engraveForm( calm, {
				spacing,
				weight: weight * 0.72,
				minInk: 0.06,
				step: 2.5,
				maxLines: 900,
				seed: o.seed || 4,
			} ),
			ribbon: true,
		};
	}
	return {
		lines: engraveParallel( base, {
			spacing,
			angle: ( ( o.angle || 0 ) * Math.PI ) / 180,
			wobble: 0.5,
			waves: 3,
			weight,
			minInk: 0.05,
			step: 2,
		} ),
		ribbon: true,
	};
}

/** One path per drawing: every line of it, in one string. */
export function lineArtPathData( geo, scale = 1 ) {
	if ( geo.dots ) {
		return dotsPath(
			geo.dots,
			( p ) =>
				( 0.45 +
					1.15 *
						inkAt( geo.field, p[ 0 ] / scale, p[ 1 ] / scale ) ) *
				geo.size
		);
	}
	// Even a line of one width leaves as an OUTLINE, not a stroke: a path
	// layer carries a fill, and an outline is the only shape that can hold
	// a swelling line anyway.
	const pins = geo.pins
		? dotsPath(
				geo.pins.map( ( p ) => [ p[ 0 ] * scale, p[ 1 ] * scale ] ),
				geo.pinR * scale
		  )
		: '';
	return (
		pins +
		geo.lines
			.map( ( line ) =>
				ribbonPath(
					line.pts,
					line.width || line.pts.map( () => geo.width || 0.5 ),
					geo.minWidth ?? 0.12
				)
			)
			.join( '' )
	);
}

/** The card, drawn: ink on ground, exactly the geometry the paths carry. */
export function renderLineArt( like, source, opts = {} ) {
	const field = fieldFrom( source, like, opts.detail || 620 );
	const { geo, w, h } = cropped( lineArtGeometry( field, withColor( source, like, opts ) ), field );
	// The preview width, then `outScale` on top of it for a layer at the
	// document's own size (3.5) - never past a side of 4096.
	const scale = Math.min(
		4096 / Math.max( w, h ),
		Math.max( 1, Math.min( 3, ( opts.scale || 1600 ) / w ) ) *
			( opts.outScale || 1 )
	);
	const c = makeCanvas(
		like,
		Math.round( w * scale ),
		Math.round( h * scale )
	);
	const g = c.getContext( '2d' );
	const dark = 'dark' === opts.background;
	g.fillStyle = dark ? '#0e1013' : '#ffffff';
	g.fillRect( 0, 0, c.width, c.height );
	g.save();
	g.scale( scale, scale );
	g.fillStyle = opts.ink || ( dark ? '#ffffff' : '#14161a' );
	if ( geo.layers && 'undefined' !== typeof Path2D ) {
		// 3.6: thread after thread, each in its colour, the nails on top.
		for ( const layer of geo.layers ) {
			const d = lineArtPathData( { ...geo, lines: layer.lines, pins: null } );
			if ( d ) {
				g.fillStyle = `rgb(${ layer.color.map( Math.round ).join( ',' ) })`;
				g.fill( new Path2D( d ) );
			}
		}
		g.fillStyle = dark ? '#cfd3da' : '#31353b';
		const pins = lineArtPathData( { ...geo, lines: [] } );
		if ( pins ) {
			g.fill( new Path2D( pins ) );
		}
		g.restore();
		return c;
	}
	const d = lineArtPathData( geo );
	if ( d && 'undefined' !== typeof Path2D ) {
		g.fill( new Path2D( d ) );
	}
	g.restore();
	return c;
}

/** The colour field rides along when coloured threads are asked for. */
function withColor( source, like, opts ) {
	if ( 'string' === opts.mode && ( opts.threadColors || 1 ) >= 2 ) {
		return { ...opts, colorField: colorFieldFrom( source, like, opts.detail || 620 ) };
	}
	return opts;
}

/**
 * The same drawing as vector paths, sized for the layer it will become.
 *
 * The geometry is drawn at working size and then SCALED, because the
 * spacing of an engraving is a decision in the drawing, not in the
 * document: at four times the size it should be the same drawing, larger,
 * not four times as many lines.
 */
export function lineArtPaths( source, like, opts = {} ) {
	const field = fieldFrom( source, like, opts.detail || 620 );
	const {
		geo,
		w: fw,
		h: fh,
	} = cropped( lineArtGeometry( field, withColor( source, like, opts ) ), field );
	const k = opts.scaleTo ? opts.scaleTo / fw : 1;
	if ( 1 !== k ) {
		if ( geo.dots ) {
			geo.dots = geo.dots.map( ( p ) => [ p[ 0 ] * k, p[ 1 ] * k ] );
			// The dot radius asks the field where it stands, so the field
			// has to be asked in ITS own coordinates.
			const field0 = geo.field;
			geo.field = { w: field0.w, h: field0.h, v: field0.v, scale: k };
			geo.size *= k;
		} else {
			const scaleLines = ( lines ) =>
				lines.map( ( line ) => ( {
					pts: line.pts.map( ( p ) => [ p[ 0 ] * k, p[ 1 ] * k ] ),
					width: line.width ? line.width.map( ( v ) => v * k ) : null,
				} ) );
			geo.lines = scaleLines( geo.lines );
			if ( geo.layers ) {
				geo.layers = geo.layers.map( ( l ) => ( { ...l, lines: scaleLines( l.lines ) } ) );
			}
			geo.width = ( geo.width || 0.5 ) * k;
		}
	}
	return {
		w: Math.round( fw * k ),
		h: Math.round( fh * k ),
		d: lineArtPathData( geo, k ),
		// 3.6: one path per thread colour, for whoever can place several.
		layers: geo.layers
			? geo.layers.map( ( l ) => ( {
					color: l.color,
					d: lineArtPathData( { ...geo, lines: l.lines, pins: null }, k ),
			  } ) )
			: null,
	};
}

/**
 * A drawing that is only part of its field (the round string art board)
 * moved to its own origin, with its own size.
 *
 * @param {Object} geo   lineArtGeometry().
 * @param {Object} field The field it was drawn on.
 * @return {Object} { geo, w, h }.
 */
function cropped( geo, field ) {
	const box = geo.crop;
	if ( ! box ) {
		return { geo, w: field.w, h: field.h };
	}
	const move = ( p ) => [ p[ 0 ] - box.x, p[ 1 ] - box.y ];
	return {
		geo: {
			...geo,
			lines: geo.lines.map( ( line ) => ( {
				...line,
				pts: line.pts.map( move ),
			} ) ),
			layers: geo.layers
				? geo.layers.map( ( l ) => ( {
						...l,
						lines: l.lines.map( ( line ) => ( { ...line, pts: line.pts.map( move ) } ) ),
				  } ) )
				: null,
			pins: geo.pins ? geo.pins.map( move ) : null,
		},
		w: box.w,
		h: box.h,
	};
}
