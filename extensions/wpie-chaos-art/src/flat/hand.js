/**
 * The hand: a gesture becomes a path a hand would actually leave.
 *
 * The 3D stage emitted marks uniformly along smooth curves, and every
 * picture was woven from that one fabric. A hand is not uniform: it
 * presses and lifts, it moves fast through the middle of a stroke and
 * slows at the turns, it trembles a little, it overshoots a flick and
 * hesitates before a careful start. Speed decides width and dryness:
 * the faster the hand, the thinner and drier the trace.
 *
 * Frame units: the picture is `aspect` wide and 1 tall. Pure math.
 */

import { gesturePoint, gestureSpan, widthAt } from '../core/gestures.js';
import { vnoise } from '../core/rng.js';

/**
 * Sample a gesture into hand points.
 *
 * @param {Object}   motif  Gesture motif (see core/gestures.js).
 * @param {Object}   o      Placement and manner.
 * @param {number[]} o.at   Origin in frame units.
 * @param {number}   o.angle Writing direction (radians).
 * @param {number}   o.scale Size: the unit gesture spans about 2 * scale.
 * @param {number}   o.width Base width in frame units.
 * @param {Function} o.rng  Random source.
 * @param {number}   [o.tremor]   0..1, how shaky the hand is.
 * @param {number}   [o.haste]    0..1, how fast it moves (thinner, drier).
 * @param {number}   [o.overshoot] 0..1, tail past the end for flicks.
 * @param {number}   [o.hesitate] 0..1, pooling at the start.
 * @param {number}   [o.steps]    Sample count override.
 * @return {Object[]} [{ x, y, w, t, speed, dry }] along the stroke.
 */
export function handPath( motif, o ) {
	const rng = o.rng || ( () => 0.5 );
	const tremor = o.tremor === undefined ? 0.3 : o.tremor;
	const haste = o.haste === undefined ? 0.4 : o.haste;
	const overshoot = o.overshoot || 0;
	const hesitate = o.hesitate || 0;
	const span = gestureSpan( motif ) * o.scale;
	const steps = Math.max(
		6,
		Math.min(
			240,
			o.steps || Math.round( span / Math.max( 0.004, o.width * 0.35 ) )
		)
	);
	const cs = Math.cos( o.angle );
	const sn = Math.sin( o.angle );
	const seedA = rng() * 100;
	const seedB = rng() * 100;
	const out = [];
	// A stroke starts slow, races through the middle, and eases out; a
	// hasty hand keeps more of the race and less of the ease.
	const speedAt = ( t ) => {
		const bell = Math.sin( Math.min( 1, Math.max( 0, t ) ) * Math.PI );
		return 0.25 + ( 0.35 + haste * 0.65 ) * bell;
	};
	const tail = overshoot > 0 ? overshoot * 0.25 : 0;
	const nAll = steps + Math.round( steps * tail );
	let last = null;
	for ( let i = 0; i <= nAll; i++ ) {
		const t = i / steps; // may run past 1 in the overshoot
		let p;
		if ( t <= 1 ) {
			p = gesturePoint( motif, t );
		} else {
			// Past the end the hand flies on along the last tangent.
			const p1 = gesturePoint( motif, 1 );
			const p0 = gesturePoint( motif, 0.97 );
			const k = ( t - 1 ) * 3;
			p = [
				p1[ 0 ] + ( p1[ 0 ] - p0[ 0 ] ) * k * 8,
				p1[ 1 ] + ( p1[ 1 ] - p0[ 1 ] ) * k * 8,
			];
		}
		// Tremor: two octaves of noise, sideways more than along.
		const tr =
			tremor *
			( vnoise( seedA + t * 9, seedB, 0 ) -
				0.5 +
				( vnoise( seedA + t * 31, seedB + 3, 0 ) - 0.5 ) * 0.4 ) *
			0.18;
		const lx = p[ 0 ] * o.scale;
		const ly = ( p[ 1 ] + tr ) * o.scale;
		const x = o.at[ 0 ] + lx * cs - ly * sn;
		const y = o.at[ 1 ] + lx * sn + ly * cs;
		const speed = speedAt( t );
		const tt = Math.min( 1, t );
		let w = widthAt( motif, tt ) * o.width;
		// Speed thins the trace; hesitation pools at the very start.
		w *= 1.12 - speed * 0.5;
		if ( hesitate > 0 && t < 0.08 ) {
			w *= 1 + hesitate * 1.6 * ( 1 - t / 0.08 );
		}
		if ( t > 1 ) {
			w *= Math.max( 0.05, 1 - ( t - 1 ) / Math.max( 0.01, tail ) );
		}
		// Dryness grows with speed and along the stroke as the load runs out.
		const dry = Math.min(
			1,
			Math.max( 0, speed * 0.6 + tt * 0.5 - 0.35 + haste * 0.25 )
		);
		const pt = { x, y, w: Math.max( 0.0005, w ), t: tt, speed, dry };
		if ( last && Math.hypot( x - last.x, y - last.y ) < 1e-6 ) {
			continue;
		}
		out.push( pt );
		last = pt;
	}
	return out;
}

/**
 * A straight ruled line as hand points, with an optional wobble - a
 * ruler for the geometric schools, a free hand for the sketchers.
 */
export function linePath(
	a,
	b,
	width,
	{ rng = () => 0.5, wobble = 0, steps = 0 } = {}
) {
	const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
	const n = Math.max(
		2,
		steps || Math.round( len / Math.max( 0.003, width * 0.5 ) )
	);
	const nx = -( b[ 1 ] - a[ 1 ] ) / ( len || 1 );
	const ny = ( b[ 0 ] - a[ 0 ] ) / ( len || 1 );
	const s0 = rng() * 50;
	const out = [];
	for ( let i = 0; i <= n; i++ ) {
		const t = i / n;
		const wob = wobble * ( vnoise( s0 + t * 6, 1, 0 ) - 0.5 ) * len * 0.06;
		out.push( {
			x: a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t + nx * wob,
			y: a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t + ny * wob,
			w: width,
			t,
			speed: 0.5,
			dry: 0.1,
		} );
	}
	return out;
}

/** Resample hand points to a spacing (frame units); keeps the first and last. */
export function resample( pts, spacing ) {
	if ( pts.length < 2 ) {
		return pts.slice();
	}
	const out = [ pts[ 0 ] ];
	let acc = 0;
	for ( let i = 1; i < pts.length; i++ ) {
		const a = pts[ i - 1 ];
		const b = pts[ i ];
		const d = Math.hypot( b.x - a.x, b.y - a.y );
		if ( d <= 0 ) {
			continue;
		}
		let pos = spacing - acc;
		while ( pos <= d ) {
			const k = pos / d;
			out.push( {
				x: a.x + ( b.x - a.x ) * k,
				y: a.y + ( b.y - a.y ) * k,
				w: a.w + ( b.w - a.w ) * k,
				t: a.t + ( b.t - a.t ) * k,
				speed: a.speed + ( b.speed - a.speed ) * k,
				dry: a.dry + ( b.dry - a.dry ) * k,
			} );
			pos += spacing;
		}
		acc = d - ( pos - spacing );
	}
	const l = pts[ pts.length - 1 ];
	const e = out[ out.length - 1 ];
	if ( Math.hypot( l.x - e.x, l.y - e.y ) > spacing * 0.3 ) {
		out.push( l );
	}
	return out;
}

/** The bounding box of hand points, widths included. */
export function pathBounds( pts ) {
	let x0 = Infinity;
	let y0 = Infinity;
	let x1 = -Infinity;
	let y1 = -Infinity;
	for ( const p of pts ) {
		x0 = Math.min( x0, p.x - p.w );
		y0 = Math.min( y0, p.y - p.w );
		x1 = Math.max( x1, p.x + p.w );
		y1 = Math.max( y1, p.y + p.w );
	}
	return { x0, y0, x1, y1 };
}
