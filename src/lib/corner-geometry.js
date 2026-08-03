/**
 * Rounded and smoothed corners for any polygon (v1.368).
 *
 * Until now only the rectangle could round its corners, and it did so with
 * four hand-written arcTo calls that the vector export mirrored by hand.
 * Polygons and stars could not round at all, which rules out a soft
 * hexagon or a star with blunt points - two of the most ordinary shapes in
 * graphic design.
 *
 * This module turns "a ring of points plus a radius" into a list of drawing
 * commands, ONCE, and hands the same list to the canvas and to the path
 * exporter. Neither one gets to have its own opinion about geometry.
 *
 * SMOOTHING is the second knob (the squircle look). At 0 a corner is a true
 * circular arc, exactly what the editor drew before, so nothing that exists
 * today changes shape. Above 0 the corner starts earlier along both edges
 * and blends with a cubic instead, which is what makes an app icon read as
 * "soft" rather than "rounded".
 *
 * The cubic is tangent to both edges at its ends for every smoothing value,
 * so the outline never kinks:
 *
 *   d = t · ( 1 + s )                 how far from the corner the curve starts
 *   k = 0.5523 + 0.4477 · s           how far the controls sit toward the corner
 *
 * At s = 0 that is the classic circle approximation; at s = 1 both controls
 * meet at the corner itself and the curve is at its softest.
 */

/**
 * Shapes whose corners can be rounded. Everything else either has no
 * corners (ellipse, line) or carries hand-authored geometry the radius
 * has no say over (heart, arrow, speech, badge, pen paths).
 */
export const ROUNDABLE_SHAPES = [ 'rect', 'polygon', 'star' ];

/** Cubic approximation of a quarter circle (the usual kappa). */
const KAPPA = 0.5523;

const len = ( ax, ay, bx, by ) => Math.hypot( bx - ax, by - ay );

/**
 * Vertices of a regular polygon or star inscribed in a w x h box.
 *
 * @param {string} kind       'polygon' or 'star'.
 * @param {number} w          Box width.
 * @param {number} h          Box height.
 * @param {number} sides      Sides (polygon) or points (star), >= 3.
 * @param {number} innerRatio Star waist, 0..1 (ignored for polygons).
 * @return {Array} [ { x, y } ] clockwise from the top.
 */
export function polygonVertices( kind, w, h, sides, innerRatio = 0.45 ) {
	const n = Math.max( 3, Math.round( sides ) || 3 );
	const cx = w / 2;
	const cy = h / 2;
	const out = [];
	if ( 'star' === kind ) {
		const inner = Math.max( 0.05, Math.min( innerRatio, 0.95 ) );
		for ( let i = 0; i < n * 2; i++ ) {
			const a = ( i / ( n * 2 ) ) * 2 * Math.PI - Math.PI / 2;
			const f = i % 2 ? inner : 1;
			out.push( {
				x: cx + cx * f * Math.cos( a ),
				y: cy + cy * f * Math.sin( a ),
			} );
		}
		return out;
	}
	for ( let i = 0; i < n; i++ ) {
		const a = ( i / n ) * 2 * Math.PI - Math.PI / 2;
		out.push( { x: cx + cx * Math.cos( a ), y: cy + cy * Math.sin( a ) } );
	}
	return out;
}

/** The four corners of a box, clockwise from the top-left. */
export const rectVertices = ( w, h ) => [
	{ x: 0, y: 0 },
	{ x: w, y: 0 },
	{ x: w, y: h },
	{ x: 0, y: h },
];

/**
 * Half the interior angle at a vertex, and the shorter of its two edges.
 * Both the grip placement and the drag arithmetic need them.
 *
 * @param {Array}  pts Ring of points.
 * @param {number} i   Vertex index.
 * @return {Object} { tan, room } - tan( half angle ) and the usable edge.
 */
function cornerShape( pts, i ) {
	const n = pts.length;
	const prev = pts[ ( i + n - 1 ) % n ];
	const c = pts[ i ];
	const next = pts[ ( i + 1 ) % n ];
	const lp = len( c.x, c.y, prev.x, prev.y );
	const ln = len( c.x, c.y, next.x, next.y );
	if ( ! lp || ! ln ) {
		return { tan: 0, room: 0 };
	}
	const cosT = Math.max(
		-1,
		Math.min(
			( ( ( prev.x - c.x ) / lp ) * ( next.x - c.x ) ) / ln +
				( ( ( prev.y - c.y ) / lp ) * ( next.y - c.y ) ) / ln,
			1
		)
	);
	return {
		tan: Math.tan( Math.acos( cosT ) / 2 ),
		room: Math.min( lp, ln ) / 2,
	};
}

/**
 * How far along its edges a radius starts eating into a corner. This is
 * where the on-canvas grip belongs: the point you hold IS where the
 * rounding begins.
 *
 * @param {Array}           pts    Ring of points.
 * @param {number}          i      Vertex index.
 * @param {number|number[]} radius Radius value.
 * @return {number} Distance from the vertex along either edge.
 */
export function tangentInset( pts, i, radius ) {
	const r = Number( Array.isArray( radius ) ? radius[ i ] : radius ) || 0;
	const { tan, room } = cornerShape( pts, i );
	if ( r <= 0 || ! tan || ! Number.isFinite( tan ) ) {
		return 0;
	}
	return Math.min( r / tan, room );
}

/**
 * The inverse: a grip dragged `d` along the edge means this radius.
 *
 * @param {Array}  pts Ring of points.
 * @param {number} i   Vertex index.
 * @param {number} d   Distance from the vertex along the edge.
 * @return {number} The radius that produces that inset.
 */
export function radiusFromInset( pts, i, d ) {
	const { tan, room } = cornerShape( pts, i );
	if ( ! tan || ! Number.isFinite( tan ) ) {
		return 0;
	}
	return Math.max( 0, Math.min( d, room ) ) * tan;
}

/**
 * Drawing commands for a closed polygon with rounded corners.
 *
 * Commands are plain objects so both consumers can walk the same list:
 *   { t: 'M'|'L', x, y }
 *   { t: 'A', cx, cy, x, y, r, sweep }  arc tangent to both edges
 *   { t: 'C', c1x, c1y, c2x, c2y, x, y }
 *   { t: 'Z' }
 *
 * @param {Array}           pts       Ring of { x, y }, at least 3.
 * @param {number|number[]} radius    One radius, or one per vertex.
 * @param {number}          smoothing 0..1 corner smoothing.
 * @return {Array} The command list.
 */
export function roundedPolyCommands( pts, radius = 0, smoothing = 0 ) {
	const n = pts.length;
	if ( n < 3 ) {
		return [];
	}
	const s = Math.max( 0, Math.min( Number( smoothing ) || 0, 1 ) );
	const radiusAt = ( i ) => {
		const v = Array.isArray( radius ) ? radius[ i ] : radius;
		const num = Number( v );
		return Number.isFinite( num ) && num > 0 ? num : 0;
	};
	const cmds = [];
	let first = null;

	for ( let i = 0; i < n; i++ ) {
		const prev = pts[ ( i + n - 1 ) % n ];
		const c = pts[ i ];
		const next = pts[ ( i + 1 ) % n ];
		const r = radiusAt( i );

		// Unit vectors pointing AWAY from the corner along both edges.
		const lp = len( c.x, c.y, prev.x, prev.y );
		const ln = len( c.x, c.y, next.x, next.y );
		if ( ! r || ! lp || ! ln ) {
			const p = { t: first ? 'L' : 'M', x: c.x, y: c.y };
			cmds.push( p );
			first = first || p;
			continue;
		}
		const ux = ( prev.x - c.x ) / lp;
		const uy = ( prev.y - c.y ) / lp;
		const vx = ( next.x - c.x ) / ln;
		const vy = ( next.y - c.y ) / ln;

		// Half the interior angle decides how far along each edge a circle
		// of radius r first touches it.
		const cosT = Math.max( -1, Math.min( ux * vx + uy * vy, 1 ) );
		const half = Math.acos( cosT ) / 2;
		const tan = Math.tan( half );
		if ( ! tan || ! Number.isFinite( tan ) ) {
			// Degenerate corner (the two edges fold back on each other).
			const p = { t: first ? 'L' : 'M', x: c.x, y: c.y };
			cmds.push( p );
			first = first || p;
			continue;
		}
		// Never eat more than half of either edge, or neighbouring corners
		// would overlap and the outline would fold.
		const room = Math.min( lp, ln ) / 2;
		let d = Math.min( r / tan, room );
		let rr = d * tan;
		// Smoothing starts the curve further out; the same room applies.
		const dStart = Math.min( d * ( 1 + s ), room );
		if ( s > 0 ) {
			d = dStart;
			rr = d * tan;
		}

		const ax = c.x + ux * d;
		const ay = c.y + uy * d;
		const bx = c.x + vx * d;
		const by = c.y + vy * d;

		const move = { t: first ? 'L' : 'M', x: ax, y: ay };
		cmds.push( move );
		first = first || move;

		if ( s > 0 ) {
			const k = KAPPA + ( 1 - KAPPA ) * s;
			cmds.push( {
				t: 'C',
				c1x: ax + ( c.x - ax ) * k,
				c1y: ay + ( c.y - ay ) * k,
				c2x: bx + ( c.x - bx ) * k,
				c2y: by + ( c.y - by ) * k,
				x: bx,
				y: by,
			} );
		} else {
			// Which way the outline turns here decides the arc's sweep.
			const cross =
				( c.x - prev.x ) * ( next.y - c.y ) -
				( c.y - prev.y ) * ( next.x - c.x );
			cmds.push( {
				t: 'A',
				cx: c.x,
				cy: c.y,
				x: bx,
				y: by,
				r: rr,
				sweep: cross > 0 ? 1 : 0,
			} );
		}
	}
	if ( cmds.length ) {
		cmds.push( { t: 'Z' } );
	}
	return cmds;
}

/**
 * Walk a command list onto a canvas context (beginPath is the caller's job).
 *
 * @param {CanvasRenderingContext2D} ctx  Target context.
 * @param {Array}                    cmds From roundedPolyCommands().
 */
export function traceCommands( ctx, cmds ) {
	for ( const c of cmds ) {
		if ( 'M' === c.t ) {
			ctx.moveTo( c.x, c.y );
		} else if ( 'L' === c.t ) {
			ctx.lineTo( c.x, c.y );
		} else if ( 'A' === c.t ) {
			// arcTo takes the CORNER as its first point and rounds the turn
			// into the next edge, which is exactly this command.
			ctx.arcTo( c.cx, c.cy, c.x, c.y, c.r );
		} else if ( 'C' === c.t ) {
			ctx.bezierCurveTo( c.c1x, c.c1y, c.c2x, c.c2y, c.x, c.y );
		} else if ( 'Z' === c.t ) {
			ctx.closePath();
		}
	}
}

/**
 * Render a command list as SVG path data.
 *
 * @param {Array}    cmds From roundedPolyCommands().
 * @param {Function} n    Number formatter (rounding is the caller's taste).
 * @return {string} Path data.
 */
export function commandsToPathD( cmds, n = ( v ) => String( v ) ) {
	const out = [];
	for ( const c of cmds ) {
		if ( 'M' === c.t ) {
			out.push( `M ${ n( c.x ) } ${ n( c.y ) }` );
		} else if ( 'L' === c.t ) {
			out.push( `L ${ n( c.x ) } ${ n( c.y ) }` );
		} else if ( 'A' === c.t ) {
			out.push(
				`A ${ n( c.r ) } ${ n( c.r ) } 0 0 ${ c.sweep } ${ n(
					c.x
				) } ${ n( c.y ) }`
			);
		} else if ( 'C' === c.t ) {
			out.push(
				`C ${ n( c.c1x ) } ${ n( c.c1y ) } ${ n( c.c2x ) } ${ n(
					c.c2y
				) } ${ n( c.x ) } ${ n( c.y ) }`
			);
		} else if ( 'Z' === c.t ) {
			out.push( 'Z' );
		}
	}
	return out.join( ' ' );
}
