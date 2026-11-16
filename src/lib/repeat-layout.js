/**
 * Repeat layout (v1.431): the pure mathematics behind the Repeat layer.
 *
 * A Repeat layer stamps its source N-1 times after a rule - a row, a grid,
 * a circle or a path drawn in the panel - and lets a progression run over
 * the copies (size, opacity, rotation, colour). Everything here is plain
 * numbers on plain objects, so the renderer, the bake/export expansion and
 * the on-canvas handles all read the SAME placements and cannot disagree.
 *
 * Placements are relative to the source unit: `dx, dy` move the copy's
 * centre away from the source's centre, `rot` is added rotation in degrees,
 * `scale` scales about the copy's centre. The source itself is copy zero
 * and is never in the list.
 */
import { gradientColorAt } from './gradient-ramp';
import { curvesLut } from './effects';

export const REPEAT_LIMITS = { count: 300, cols: 30, rows: 30 };

/** The source's own value: what every progression starts from. */
const START = { size: 100, opacity: 100, rotation: 0, color: 0 };

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );
const num = ( v, d = 0 ) =>
	Number.isFinite( Number( v ) ) ? Number( v ) : d;
const int = ( v, lo, hi, d ) => clamp( Math.round( num( v, d ) ), lo, hi );
const rad = ( deg ) => ( deg * Math.PI ) / 180;
const deg = ( r ) => ( r * 180 ) / Math.PI;

/**
 * Where on the 0..1 progression a copy at position t (0..1) sits, after
 * the curve. No curve is a straight line; the curve is the CurveEditor's
 * point list in 0..255 space and reads through the same LUT the editor
 * paints, so the preview line IS the applied curve.
 *
 * @param {Array|null} curve Curve points [{x,y}] in 0..255, or null.
 * @param {number}     t     Position along the copies, 0..1.
 * @return {number} Factor 0..1.
 */
export function curveFactor( curve, t ) {
	const tt = clamp( num( t ), 0, 1 );
	if ( ! curve || ! curve.length ) {
		return tt;
	}
	const lut = curvesLut( curve );
	return clamp( lut[ Math.round( tt * 255 ) ] / 255, 0, 1 );
}

/**
 * The value of one progression target for a copy at position t.
 *
 * @param {Object} progression The layer's progression block.
 * @param {string} key         size | opacity | rotation | color.
 * @param {number} t           Position along the copies, 0..1.
 * @return {number} size/opacity in percent, rotation in degrees, colour as
 *                  tint amount 0..1.
 */
export function progressionValue( progression, key, t ) {
	const target = progression && progression[ key ];
	const start = START[ key ] ?? 0;
	if ( ! target || ! target.on ) {
		return start;
	}
	const end = 'color' === key ? 1 : num( target.end, start );
	return start + ( end - start ) * curveFactor( target.curve, t );
}

/**
 * Axis-aligned footprint of a box turned about its centre.
 *
 * @param {Object} box {x,y,w,h}.
 * @param {number} rot Degrees.
 * @return {Object} {x,y,w,h}.
 */
export function footprintOf( box, rot ) {
	if ( ! rot ) {
		return { x: box.x, y: box.y, w: box.w, h: box.h };
	}
	const r = rad( rot );
	const cos = Math.abs( Math.cos( r ) );
	const sin = Math.abs( Math.sin( r ) );
	const w = box.w * cos + box.h * sin;
	const h = box.w * sin + box.h * cos;
	return {
		x: box.x + box.w / 2 - w / 2,
		y: box.y + box.h / 2 - h / 2,
		w,
		h,
	};
}

/**
 * The panel-drawn path in document coordinates: normalized points (0..1
 * inside the frame) scaled into the frame and turned about its centre.
 *
 * @param {Object} path { points: [{x,y}], frame: {x,y,w,h,rot} }.
 * @return {Array} Document points [{x,y}].
 */
export function pathPointsToDoc( path ) {
	const frame = path?.frame || { x: 0, y: 0, w: 0, h: 0, rot: 0 };
	const points = Array.isArray( path?.points ) ? path.points : [];
	const cx = frame.x + frame.w / 2;
	const cy = frame.y + frame.h / 2;
	const r = rad( frame.rot || 0 );
	const cos = Math.cos( r );
	const sin = Math.sin( r );
	return points.map( ( p ) => {
		const lx = frame.x + num( p.x ) * frame.w - cx;
		const ly = frame.y + num( p.y ) * frame.h - cy;
		return {
			x: cx + lx * cos - ly * sin,
			y: cy + lx * sin + ly * cos,
		};
	} );
}

/**
 * `count` points evenly spaced by arc length along a polyline, with the
 * tangent angle of the segment each one lies on.
 *
 * @param {Array}  points Document points [{x,y}], two or more for a line.
 * @param {number} count  How many samples (>= 1).
 * @return {Array} [{ x, y, angle }] angle in degrees.
 */
export function samplePolyline( points, count ) {
	const pts = ( points || [] ).filter(
		( p ) => p && Number.isFinite( p.x ) && Number.isFinite( p.y )
	);
	const n = Math.max( 1, Math.round( num( count, 1 ) ) );
	if ( ! pts.length ) {
		return [];
	}
	const segs = [];
	let total = 0;
	for ( let i = 1; i < pts.length; i++ ) {
		const a = pts[ i - 1 ];
		const b = pts[ i ];
		const len = Math.hypot( b.x - a.x, b.y - a.y );
		segs.push( {
			a,
			b,
			len,
			from: total,
			angle: deg( Math.atan2( b.y - a.y, b.x - a.x ) ),
		} );
		total += len;
	}
	const firstAngle = segs.length ? segs[ 0 ].angle : 0;
	if ( ! segs.length || total <= 0 ) {
		return Array.from( { length: n }, () => ( {
			x: pts[ 0 ].x,
			y: pts[ 0 ].y,
			angle: firstAngle,
		} ) );
	}
	const out = [];
	let s = 0;
	for ( let k = 0; k < n; k++ ) {
		const dist = 1 === n ? 0 : ( total * k ) / ( n - 1 );
		while ( s < segs.length - 1 && dist > segs[ s ].from + segs[ s ].len ) {
			s++;
		}
		const seg = segs[ s ];
		const f =
			seg.len > 0 ? clamp( ( dist - seg.from ) / seg.len, 0, 1 ) : 0;
		out.push( {
			x: seg.a.x + ( seg.b.x - seg.a.x ) * f,
			y: seg.a.y + ( seg.b.y - seg.a.y ) * f,
			angle: seg.angle,
		} );
	}
	return out;
}

/** Geometry only: where the copies go and how they turn, before the progression. */
function rawPlacements( unitBox, rule ) {
	const mode = rule?.mode || 'row';
	const raw = [];
	if ( 'row' === mode ) {
		const n = int( rule.count, 1, REPEAT_LIMITS.count, 3 );
		const dx = num( rule.dx );
		const dy = num( rule.dy );
		for ( let i = 1; i < n; i++ ) {
			raw.push( { dx: i * dx, dy: i * dy, rot: 0 } );
		}
	} else if ( 'grid' === mode ) {
		const cols = int( rule.cols, 1, REPEAT_LIMITS.cols, 3 );
		const rows = int( rule.rows, 1, REPEAT_LIMITS.rows, 2 );
		const stepX = unitBox.w + num( rule.gapX );
		const stepY = unitBox.h + num( rule.gapY );
		for ( let r = 0; r < rows; r++ ) {
			for ( let c = 0; c < cols; c++ ) {
				if ( ! r && ! c ) {
					continue;
				}
				raw.push( { dx: c * stepX, dy: r * stepY, rot: 0 } );
			}
		}
	} else if ( 'circle' === mode ) {
		const n = int( rule.count, 1, REPEAT_LIMITS.count, 8 );
		const cx = num( rule.center?.dx );
		const cy = num( rule.center?.dy );
		const radius = Math.hypot( cx, cy );
		if ( n < 2 || radius < 0.5 ) {
			return raw;
		}
		const span = clamp( num( rule.span, 360 ), 1, 360 );
		const step = span >= 360 ? span / n : span / ( n - 1 );
		const start = Math.atan2( -cy, -cx );
		for ( let i = 1; i < n; i++ ) {
			const a = start + rad( i * step );
			raw.push( {
				dx: cx + radius * Math.cos( a ),
				dy: cy + radius * Math.sin( a ),
				rot: rule.turn === false ? 0 : i * step,
			} );
		}
	} else if ( 'path' === mode ) {
		const n = int( rule.count, 1, REPEAT_LIMITS.count, 5 );
		const pts = pathPointsToDoc( rule.path );
		if ( pts.length < 2 ) {
			return raw;
		}
		const sx = unitBox.x + unitBox.w / 2;
		const sy = unitBox.y + unitBox.h / 2;
		for ( const s of samplePolyline( pts, n ) ) {
			raw.push( {
				dx: s.x - sx,
				dy: s.y - sy,
				rot: rule.path?.tangent === false ? 0 : s.angle,
			} );
		}
	}
	return raw;
}

/**
 * The copies of one Repeat layer: geometry plus progression.
 *
 * @param {Object} unitBox     Footprint of the source unit {x,y,w,h}.
 * @param {Object} rule        The layer's rule.
 * @param {Object} progression The layer's progression.
 * @return {Array} [{ i, t, dx, dy, rot, scale, opacity, tint }]
 */
export function repeatPlacements( unitBox, rule, progression ) {
	const raw = rawPlacements(
		unitBox || { x: 0, y: 0, w: 0, h: 0 },
		rule || {}
	);
	const total = raw.length;
	return raw.map( ( p, k ) => {
		const t = total ? ( k + 1 ) / total : 1;
		return {
			i: k + 1,
			t,
			dx: p.dx,
			dy: p.dy,
			rot: p.rot + progressionValue( progression, 'rotation', t ),
			scale: Math.max(
				0,
				progressionValue( progression, 'size', t ) / 100
			),
			opacity: clamp(
				progressionValue( progression, 'opacity', t ) / 100,
				0,
				1
			),
			tint: clamp( progressionValue( progression, 'color', t ), 0, 1 ),
			...( progression?.color?.on &&
			progression.color.mode === 'gradient' &&
			progression.color.stops?.length >= 2
				? {
						paintColor: gradientColorAt(
							progression.color.stops,
							curveFactor(
								progression.color.curve,
								total > 1 ? k / ( total - 1 ) : 0
							)
						),
				  }
				: {} ),
		};
	} );
}

/**
 * Union box of every copy's footprint - the Repeat layer's own x/y/w/h.
 *
 * @param {Object} unitBox    Footprint of the source unit.
 * @param {Array}  placements From repeatPlacements.
 * @return {Object|null} {x,y,w,h} or null without copies.
 */
export function repeatBounds( unitBox, placements ) {
	if ( ! placements || ! placements.length || ! unitBox ) {
		return null;
	}
	const cx = unitBox.x + unitBox.w / 2;
	const cy = unitBox.y + unitBox.h / 2;
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for ( const p of placements ) {
		const w = unitBox.w * p.scale;
		const h = unitBox.h * p.scale;
		const f = footprintOf(
			{ x: cx + p.dx - w / 2, y: cy + p.dy - h / 2, w, h },
			p.rot
		);
		minX = Math.min( minX, f.x );
		minY = Math.min( minY, f.y );
		maxX = Math.max( maxX, f.x + f.w );
		maxY = Math.max( maxY, f.y + f.h );
	}
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
