/**
 * Dynamic shapes: parametric geometry with live dials (the Shape Studio).
 *
 * The third shape class next to the hand-written cases in drawShape and
 * the static paths in shape-library.js. Every shape here defines its
 * geometry ONCE as a command list in the corner-geometry format
 * (M/L/A/C/Z objects): the canvas paints it via traceCommands, the
 * vector export reads it via commandsToPathD, so the two cannot drift -
 * the same contract the corner engine (v1.368) established.
 *
 * Shape-specific dials live in `layer.shapeParams`, a flat JSON object.
 * A layer without one renders with the registry defaults - and for the
 * shapes that MOVED here (triangle, diamond, cross, arrow, speech) those
 * defaults reproduce the old geometry exactly, so no saved design
 * changes its outline.
 *
 * Winding matters: outlines run clockwise (in screen coordinates, y
 * down), holes counter-clockwise, because ctx.fill() winds nonzero and
 * the SVG export inherits the same fill rule.
 */

import { __ } from '@wordpress/i18n';

import { cornerRadii } from './corner-radii';
import { normalizePathD } from './path';
import {
	polygonVertices,
	rectVertices,
	roundedPolyCommands,
} from './corner-geometry';

const TAU = 2 * Math.PI;
/** Angles start at the top and grow clockwise, like a clock face. */
const TOP = -Math.PI / 2;

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

/**
 * Cubic segments for an elliptical arc around ( cx, cy ). The caller has
 * already moved/lined to the arc's start point (angle a0); the returned
 * C commands land exactly on the point at a1. Negative sweeps (a1 < a0)
 * run counter-clockwise, which is how holes are wound.
 *
 * @param {number} cx Ellipse centre x.
 * @param {number} cy Ellipse centre y.
 * @param {number} rx Radius x.
 * @param {number} ry Radius y.
 * @param {number} a0 Start angle (radians).
 * @param {number} a1 End angle (radians).
 * @return {Array} C commands.
 */
export function arcCommands( cx, cy, rx, ry, a0, a1 ) {
	const total = a1 - a0;
	if ( ! total ) {
		return [];
	}
	const steps = Math.max(
		1,
		Math.ceil( Math.abs( total ) / ( Math.PI / 2 ) )
	);
	const delta = total / steps;
	// Standard cubic arc approximation; exact tangents at both ends.
	const k = ( 4 / 3 ) * Math.tan( delta / 4 );
	const out = [];
	let a = a0;
	for ( let i = 0; i < steps; i++ ) {
		const b = a + delta;
		const cosA = Math.cos( a );
		const sinA = Math.sin( a );
		const cosB = Math.cos( b );
		const sinB = Math.sin( b );
		out.push( {
			t: 'C',
			c1x: cx + rx * ( cosA - k * sinA ),
			c1y: cy + ry * ( sinA + k * cosA ),
			c2x: cx + rx * ( cosB + k * sinB ),
			c2y: cy + ry * ( sinB - k * cosB ),
			x: cx + rx * cosB,
			y: cy + ry * sinB,
		} );
		a = b;
	}
	return out;
}

const at = ( cx, cy, rx, ry, a ) => ( {
	x: cx + rx * Math.cos( a ),
	y: cy + ry * Math.sin( a ),
} );

/** M/L to a point, choosing M only for the first command of a subpath. */
const mv = ( p ) => ( { t: 'M', x: p.x, y: p.y } );
const ln = ( p ) => ( { t: 'L', x: p.x, y: p.y } );

/**
 * A full ellipse as a closed subpath. `ccw` winds it counter-clockwise,
 * which is the hole direction under nonzero filling.
 */
function ellipseSub( cx, cy, rx, ry, ccw = false ) {
	const a0 = TOP;
	const a1 = ccw ? TOP - TAU : TOP + TAU;
	return [
		mv( at( cx, cy, rx, ry, a0 ) ),
		...arcCommands( cx, cy, rx, ry, a0, a1 ),
		{ t: 'Z' },
	];
}

/**
 * Fit a command list into the 0..w by 0..h box, measured over every
 * coordinate including control points. The hull encloses the curve, so a
 * fitted shape sits a hair inside its box - inside is the safe direction
 * (the same reasoning as fitted() in shape-library.js). Used by shapes
 * whose construction cannot cheaply guarantee its own bounds (cloud).
 */
function fitCommands( cmds, w, h ) {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	const KEYS = [
		[ 'x', 'y' ],
		[ 'c1x', 'c1y' ],
		[ 'c2x', 'c2y' ],
		[ 'cx', 'cy' ],
	];
	for ( const c of cmds ) {
		for ( const [ kx, ky ] of KEYS ) {
			if ( 'number' === typeof c[ kx ] ) {
				minX = Math.min( minX, c[ kx ] );
				maxX = Math.max( maxX, c[ kx ] );
				minY = Math.min( minY, c[ ky ] );
				maxY = Math.max( maxY, c[ ky ] );
			}
		}
	}
	const bw = Math.max( 1e-6, maxX - minX );
	const bh = Math.max( 1e-6, maxY - minY );
	const sx = w / bw;
	const sy = h / bh;
	return cmds.map( ( c ) => {
		const out = { ...c };
		for ( const [ kx, ky ] of KEYS ) {
			if ( 'number' === typeof out[ kx ] ) {
				out[ kx ] = ( out[ kx ] - minX ) * sx;
				out[ ky ] = ( out[ ky ] - minY ) * sy;
			}
		}
		if ( 'number' === typeof out.r ) {
			out.r = out.r * Math.min( sx, sy );
		}
		return out;
	} );
}

/* --------------------- corner engine for path shapes -------------------- */

// Parsed rings per path string. Bounded: the catalog reuses the same
// strings forever, user paths churn - old entries just fall out.
const ringsCache = new Map();

/**
 * A path's vertex rings, when the path is a PURE POLYGON (only straight
 * lines after normalisation). That is what makes a corner engine honest
 * here: rounding a polygon's corners is exact, rounding a curve is not.
 * Most of the element catalog qualifies - arrows, banners, crowns.
 *
 * @param {string} d Path data (any SVG subset; normalised internally).
 * @return {?Array} Array of vertex rings, or null (curves involved).
 */
export function pathPolygonRings( d ) {
	if ( ! d ) {
		return null;
	}
	if ( ringsCache.has( d ) ) {
		return ringsCache.get( d );
	}
	let out = null;
	const norm = normalizePathD( d );
	// Arcs become cubics during normalisation, so one test covers all.
	if ( ! /[CQ]/i.test( norm ) ) {
		const tokens = norm.match( /[MLZ]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi ) || [];
		const rings = [];
		let ring = [];
		const closeRing = () => {
			// Drop a duplicated closing vertex; zero-length edges make
			// degenerate corners.
			const first = ring[ 0 ];
			const last = ring[ ring.length - 1 ];
			if (
				ring.length > 1 &&
				Math.abs( first.x - last.x ) < 1e-6 &&
				Math.abs( first.y - last.y ) < 1e-6
			) {
				ring.pop();
			}
			if ( ring.length >= 3 ) {
				rings.push( ring );
			}
			ring = [];
		};
		let i = 0;
		let cmd = '';
		while ( i < tokens.length ) {
			if ( /[a-z]/i.test( tokens[ i ] ) ) {
				cmd = tokens[ i++ ].toUpperCase();
				if ( 'Z' === cmd ) {
					closeRing();
				}
				if ( 'M' === cmd && ring.length ) {
					closeRing();
				}
				continue;
			}
			const x = parseFloat( tokens[ i++ ] );
			const y = parseFloat( tokens[ i++ ] );
			const prev = ring[ ring.length - 1 ];
			if (
				! prev ||
				Math.abs( prev.x - x ) > 1e-6 ||
				Math.abs( prev.y - y ) > 1e-6
			) {
				ring.push( { x, y } );
			}
		}
		closeRing();
		out = rings.length ? rings : null;
	}
	if ( ringsCache.size > 400 ) {
		ringsCache.clear();
	}
	ringsCache.set( d, out );
	return out;
}

/**
 * A polygon path with its corners rounded, as a command list - or null
 * when the path is not a pure polygon (then the raw path stays as is).
 *
 * @param {string}          d         Path data.
 * @param {number|number[]} radius    Corner radius.
 * @param {number}          smoothing 0..1 corner smoothing.
 * @return {?Array} Command list over all subpath rings.
 */
export function roundedPathCommands( d, radius, smoothing ) {
	const rings = pathPolygonRings( d );
	if ( ! rings ) {
		return null;
	}
	// A per-corner radius array is a rectangle concept; anything else
	// rounds uniformly.
	const r = Array.isArray( radius ) ? radius[ 0 ] || 0 : radius;
	const cmds = [];
	for ( const ring of rings ) {
		cmds.push( ...roundedPolyCommands( ring, r, smoothing ) );
	}
	return cmds;
}

/* --------------------------- generator helpers -------------------------- */

/**
 * Seeded pseudo-randomness. The seed is a STORED NUMBER, never a dice
 * roll at draw time: a saved design has to render identically forever,
 * on every machine and in every export. The studio's shuffle button
 * writes a new seed, it does not randomise the drawing.
 *
 * @param {number} seed Any integer.
 * @return {Function} () => 0..1
 */
function seededRandom( seed ) {
	let s = ( Math.abs( Math.round( seed ) ) * 7919 + 104729 ) % 233280;
	return () => {
		s = ( s * 9301 + 49297 ) % 233280;
		return s / 233280;
	};
}

/**
 * A closed outline through a ring of samples (Catmull-Rom as cubics) -
 * what turns "radius per angle" maths into a smooth shape.
 *
 * @param {Array} pts Ring of { x, y }, at least 3.
 * @return {Array} Command list.
 */
function smoothRing( pts ) {
	const n = pts.length;
	if ( n < 3 ) {
		return [];
	}
	const cmds = [ mv( pts[ 0 ] ) ];
	for ( let i = 0; i < n; i++ ) {
		const p0 = pts[ ( i + n - 1 ) % n ];
		const p1 = pts[ i ];
		const p2 = pts[ ( i + 1 ) % n ];
		const p3 = pts[ ( i + 2 ) % n ];
		cmds.push( {
			t: 'C',
			c1x: p1.x + ( p2.x - p0.x ) / 6,
			c1y: p1.y + ( p2.y - p0.y ) / 6,
			c2x: p2.x - ( p3.x - p1.x ) / 6,
			c2y: p2.y - ( p3.y - p1.y ) / 6,
			x: p2.x,
			y: p2.y,
		} );
	}
	cmds.push( { t: 'Z' } );
	return cmds;
}

/**
 * A band of VARIABLE half-width along an open centreline: the brush
 * stroke, the guilloche, the wave divider. Straight chords between
 * dense samples - an offset curve would loop on tight turns.
 *
 * @param {Array}    pts    Centreline samples.
 * @param {Function} halfAt u ( 0..1 ) -> half width.
 * @return {Array} Command list (closed).
 */
function bandFrom( pts, halfAt ) {
	const n = pts.length;
	const left = [];
	const right = [];
	for ( let i = 0; i < n; i++ ) {
		const a = pts[ Math.max( 0, i - 1 ) ];
		const b = pts[ Math.min( n - 1, i + 1 ) ];
		const tx = b.x - a.x;
		const ty = b.y - a.y;
		const l = Math.hypot( tx, ty ) || 1;
		const hw = halfAt( i / ( n - 1 ) );
		left.push( {
			x: pts[ i ].x - ( ty / l ) * hw,
			y: pts[ i ].y + ( tx / l ) * hw,
		} );
		right.push( {
			x: pts[ i ].x + ( ty / l ) * hw,
			y: pts[ i ].y - ( tx / l ) * hw,
		} );
	}
	const ring = [ ...left, ...right.reverse() ];
	return [ mv( ring[ 0 ] ), ...ring.slice( 1 ).map( ln ), { t: 'Z' } ];
}

/**
 * Split a polyline into the runs that stay inside the box, so a pattern
 * can be drawn past the edges and simply CLIPPED. Clamping the points
 * instead flattens every arc against the border.
 *
 * @param {Array}  pts    Polyline samples.
 * @param {number} w      Box width.
 * @param {number} h      Box height.
 * @param {number} margin Keep-out margin (usually the band's half width).
 * @return {Array} Array of polylines.
 */
function insideRuns( pts, w, h, margin ) {
	const runs = [];
	let run = [];
	// Two points are a legitimate run: a hatching stroke IS two points,
	// and requiring three dropped every single one of them.
	for ( const q of pts ) {
		if (
			q.x < margin ||
			q.y < margin ||
			q.x > w - margin ||
			q.y > h - margin
		) {
			if ( run.length >= 2 ) {
				runs.push( run );
			}
			run = [];
			continue;
		}
		run.push( q );
	}
	if ( run.length >= 2 ) {
		runs.push( run );
	}
	return runs;
}

/**
 * Contour chains of a scalar field at one iso level (marching squares).
 * Metaballs turn the chains into closed rings, the Chladni figure draws
 * them as lines - so this returns the CHAINS and lets the caller decide.
 *
 * Neighbouring cells compute a shared edge crossing from the same two
 * corner values, so their endpoints match to the bit and can be keyed.
 *
 * @param {Function} fieldAt ( x, y ) -> scalar.
 * @param {number}   iso     Level to trace.
 * @param {number}   min     Grid origin (both axes).
 * @param {number}   span    Grid size (both axes).
 * @param {number}   N       Cells per axis.
 * @return {Array} Array of point chains.
 */
function isoContours( fieldAt, iso, min, span, N ) {
	const step = span / N;
	const segs = [];
	const cross = ( x0, y0, v0, x1, y1, v1 ) => {
		const t = ( iso - v0 ) / ( v1 - v0 || 1e-6 );
		return { x: x0 + ( x1 - x0 ) * t, y: y0 + ( y1 - y0 ) * t };
	};
	for ( let gy = 0; gy < N; gy++ ) {
		for ( let gx = 0; gx < N; gx++ ) {
			const px = min + gx * step;
			const py = min + gy * step;
			const cs = [
				[ px, py ],
				[ px + step, py ],
				[ px + step, py + step ],
				[ px, py + step ],
			];
			const vs = cs.map( ( c ) => fieldAt( c[ 0 ], c[ 1 ] ) );
			const hits = [];
			for ( let e = 0; e < 4; e++ ) {
				const i0 = e;
				const i1 = ( e + 1 ) % 4;
				if ( vs[ i0 ] >= iso !== vs[ i1 ] >= iso ) {
					hits.push(
						cross(
							cs[ i0 ][ 0 ],
							cs[ i0 ][ 1 ],
							vs[ i0 ],
							cs[ i1 ][ 0 ],
							cs[ i1 ][ 1 ],
							vs[ i1 ]
						)
					);
				}
			}
			// Two crossings = one segment. The rare four-crossing saddle
			// is skipped; at this density it costs a pixel-sized nick.
			if ( 2 === hits.length ) {
				segs.push( { a: hits[ 0 ], b: hits[ 1 ] } );
			}
		}
	}
	const K = ( q ) =>
		Math.round( q.x * 1000 ) + ':' + Math.round( q.y * 1000 );
	const bucket = new Map();
	segs.forEach( ( s, i ) => {
		for ( const q of [ s.a, s.b ] ) {
			const k = K( q );
			if ( ! bucket.has( k ) ) {
				bucket.set( k, [] );
			}
			bucket.get( k ).push( i );
		}
	} );
	const used = new Array( segs.length ).fill( false );
	const chains = [];
	for ( let i = 0; i < segs.length; i++ ) {
		if ( used[ i ] ) {
			continue;
		}
		used[ i ] = true;
		const chain = [ segs[ i ].a, segs[ i ].b ];
		for ( let guard = 0; guard < segs.length; guard++ ) {
			const tail = chain[ chain.length - 1 ];
			const cands = bucket.get( K( tail ) ) || [];
			let nxt = -1;
			for ( const j of cands ) {
				if ( ! used[ j ] ) {
					nxt = j;
					break;
				}
			}
			if ( nxt < 0 ) {
				break;
			}
			used[ nxt ] = true;
			const s = segs[ nxt ];
			chain.push( K( s.a ) === K( tail ) ? s.b : s.a );
		}
		chains.push( chain );
	}
	return chains;
}

/** Greatest common divisor - decides a spirograph's closing turn count. */
function gcd( a, b ) {
	return b ? gcd( b, a % b ) : Math.abs( a );
}

/**
 * One cubic per sampled interval through ( x, y( x ) ) with known slope -
 * the wave banner's edges. Returns commands from the second sample on.
 */
function hermiteCommands( xs, yAt, dyAt ) {
	const out = [];
	for ( let i = 1; i < xs.length; i++ ) {
		const x0 = xs[ i - 1 ];
		const x1 = xs[ i ];
		const dx = x1 - x0;
		out.push( {
			t: 'C',
			c1x: x0 + dx / 3,
			c1y: yAt( x0 ) + ( dyAt( x0 ) * dx ) / 3,
			c2x: x1 - dx / 3,
			c2y: yAt( x1 ) - ( dyAt( x1 ) * dx ) / 3,
			x: x1,
			y: yAt( x1 ),
		} );
	}
	return out;
}

/* ------------------------------ the registry --------------------------- */

const pct = { min: 0, max: 1, step: 0.01 };

/**
 * Every dynamic shape. `params` describes the dials (def = default, and
 * for the rebuilt shapes the default IS the old hard-wired constant).
 * `corners: true` means layer.radius / layer.cornerSmoothing apply.
 * `commands( w, h, p, c )` returns the command list; `c` carries
 * { radius, smoothing } straight from the layer. Returning null defers
 * to the legacy renderer (the ellipse does that while it is unsliced).
 */
export const DYNAMIC_SHAPES = [
	{
		id: 'triangle',
		name: () => __( 'Triangle', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'apex',
				label: () => __( 'Apex', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				[
					{ x: w * p.apex, y: 0 },
					{ x: w, y: h },
					{ x: 0, y: h },
				],
				c.radius,
				c.smoothing
			),
	},
	{
		id: 'diamond',
		name: () => __( 'Diamond', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'balance',
				label: () => __( 'Balance', 'wunderpaint' ),
				min: -0.35,
				max: 0.35,
				step: 0.01,
				def: 0,
			},
		],
		commands: ( w, h, p, c ) => {
			const waist = h * ( 0.5 + p.balance );
			return roundedPolyCommands(
				[
					{ x: w / 2, y: 0 },
					{ x: w, y: waist },
					{ x: w / 2, y: h },
					{ x: 0, y: waist },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'cross',
		name: () => __( 'Cross', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'arm',
				label: () => __( 'Arm width', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.36,
			},
		],
		commands: ( w, h, p, c ) => {
			// Margin per side; 0.36 arm = the 0.32 margins the static
			// library shape used, so old crosses keep their outline.
			const mx = ( w * ( 1 - p.arm ) ) / 2;
			const my = ( h * ( 1 - p.arm ) ) / 2;
			return roundedPolyCommands(
				[
					{ x: mx, y: 0 },
					{ x: w - mx, y: 0 },
					{ x: w - mx, y: my },
					{ x: w, y: my },
					{ x: w, y: h - my },
					{ x: w - mx, y: h - my },
					{ x: w - mx, y: h },
					{ x: mx, y: h },
					{ x: mx, y: h - my },
					{ x: 0, y: h - my },
					{ x: 0, y: my },
					{ x: mx, y: my },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'arrow',
		name: () => __( 'Arrow', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'head',
				label: () => __( 'Head length', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.38,
			},
			{
				key: 'headW',
				label: () => __( 'Head width', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1,
				def: 0.84,
			},
			{
				key: 'shaft',
				label: () => __( 'Shaft width', 'wunderpaint' ),
				...pct,
				min: 0.06,
				max: 0.9,
				def: 0.36,
			},
			{
				key: 'heads',
				label: () => __( 'Heads', 'wunderpaint' ),
				min: 1,
				max: 2,
				step: 1,
				def: 1,
			},
		],
		commands: ( w, h, p, c ) => {
			const dual = 2 === Math.round( p.heads );
			// With two heads each takes the same length off its own end.
			const hl = w * p.head * ( dual ? 0.5 : 1 );
			const xh = w - hl;
			const xl = dual ? hl : 0;
			const sy = ( h * ( 1 - Math.min( p.shaft, p.headW ) ) ) / 2;
			const hy = ( h * ( 1 - p.headW ) ) / 2;
			const left = dual
				? [
						{ x: xl, y: h - sy },
						{ x: xl, y: h - hy },
						{ x: 0, y: h / 2 },
						{ x: xl, y: hy },
						{ x: xl, y: sy },
				  ]
				: [
						{ x: 0, y: h - sy },
						{ x: 0, y: sy },
				  ];
			return roundedPolyCommands(
				[
					{ x: xh, y: sy },
					{ x: xh, y: hy },
					{ x: w, y: h / 2 },
					{ x: xh, y: h - hy },
					{ x: xh, y: h - sy },
					...left,
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'burst',
		name: () => __( 'Burst', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'points',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 8,
				max: 40,
				step: 1,
				def: 16,
			},
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.5,
				def: 0.2,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				polygonVertices( 'star', w, h, p.points, 1 - p.depth ),
				c.radius,
				c.smoothing
			),
	},
	{
		id: 'chevron',
		name: () => __( 'Chevron', 'wunderpaint' ),
		aspect: 2.4,
		corners: true,
		params: [
			{
				key: 'cut',
				label: () => __( 'Point depth', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.5,
				def: 0.25,
			},
		],
		commands: ( w, h, p, c ) => {
			const cut = Math.min( w * p.cut, w / 2 );
			return roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w - cut, y: 0 },
					{ x: w, y: h / 2 },
					{ x: w - cut, y: h },
					{ x: 0, y: h },
					{ x: cut, y: h / 2 },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'gear',
		name: () => __( 'Gear', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'teeth',
				label: () => __( 'Teeth', 'wunderpaint' ),
				min: 8,
				max: 24,
				step: 1,
				def: 10,
			},
			{
				key: 'depth',
				label: () => __( 'Tooth depth', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.35,
				def: 0.2,
			},
			{
				key: 'bore',
				label: () => __( 'Bore', 'wunderpaint' ),
				...pct,
				max: 0.7,
				def: 0.35,
			},
		],
		commands: ( w, h, p, c ) => {
			const cx = w / 2;
			const cy = h / 2;
			const teeth = Math.round( p.teeth );
			const pitch = TAU / teeth;
			const inner = 1 - p.depth;
			const pts = [];
			for ( let i = 0; i < teeth; i++ ) {
				const a = TOP + i * pitch;
				// Trapezoid tooth: a slightly narrower top than base reads
				// as a gear even when the corners are rounded soft.
				for ( const [ f, r ] of [
					[ 0.08, inner ],
					[ 0.16, 1 ],
					[ 0.42, 1 ],
					[ 0.5, inner ],
				] ) {
					pts.push(
						at(
							cx,
							cy,
							( w / 2 ) * r,
							( h / 2 ) * r,
							a + f * pitch
						)
					);
				}
			}
			const cmds = roundedPolyCommands( pts, c.radius, c.smoothing );
			if ( p.bore > 0.02 ) {
				const rb = inner * p.bore;
				cmds.push(
					...ellipseSub(
						cx,
						cy,
						( w / 2 ) * rb,
						( h / 2 ) * rb,
						true
					)
				);
			}
			return cmds;
		},
	},
	{
		id: 'ellipse',
		name: () => __( 'Ellipse', 'wunderpaint' ),
		params: [
			{
				key: 'sliceStart',
				label: () => __( 'Slice start', 'wunderpaint' ),
				min: 0,
				max: 360,
				step: 1,
				def: 0,
				deg: true,
			},
			{
				key: 'sliceSpan',
				label: () => __( 'Slice length', 'wunderpaint' ),
				min: 5,
				max: 360,
				step: 1,
				def: 360,
				deg: true,
			},
		],
		commands: ( w, h, p ) => {
			if ( p.sliceSpan >= 360 ) {
				return null; // A full circle keeps the legacy renderer.
			}
			const cx = w / 2;
			const cy = h / 2;
			const a0 = TOP + ( p.sliceStart * Math.PI ) / 180;
			const a1 = a0 + ( p.sliceSpan * Math.PI ) / 180;
			return [
				mv( at( cx, cy, cx, cy, a0 ) ),
				...arcCommands( cx, cy, cx, cy, a0, a1 ),
				ln( { x: cx, y: cy } ),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'ring',
		name: () => __( 'Ring', 'wunderpaint' ),
		params: [
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.9,
				def: 0.35,
			},
			{
				key: 'sliceStart',
				label: () => __( 'Slice start', 'wunderpaint' ),
				min: 0,
				max: 360,
				step: 1,
				def: 0,
				deg: true,
			},
			{
				key: 'sliceSpan',
				label: () => __( 'Slice length', 'wunderpaint' ),
				min: 5,
				max: 360,
				step: 1,
				def: 360,
				deg: true,
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const f = 1 - p.thickness;
			if ( p.sliceSpan >= 360 ) {
				return [
					...ellipseSub( cx, cy, cx, cy ),
					...ellipseSub( cx, cy, cx * f, cy * f, true ),
				];
			}
			// An open gauge arc: outer sweep, flat end, inner sweep back.
			const a0 = TOP + ( p.sliceStart * Math.PI ) / 180;
			const a1 = a0 + ( p.sliceSpan * Math.PI ) / 180;
			return [
				mv( at( cx, cy, cx, cy, a0 ) ),
				...arcCommands( cx, cy, cx, cy, a0, a1 ),
				ln( at( cx, cy, cx * f, cy * f, a1 ) ),
				...arcCommands( cx, cy, cx * f, cy * f, a1, a0 ),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'squircle',
		name: () => __( 'Squircle', 'wunderpaint' ),
		params: [
			{
				key: 'curve',
				label: () => __( 'Curvature', 'wunderpaint' ),
				...pct,
				def: 0.6,
			},
		],
		commands: ( w, h, p ) => {
			// One cubic per quarter; the control pull interpolates from a
			// true ellipse (kappa) toward the box corners (app-icon look).
			const k = 0.5523 + ( 0.995 - 0.5523 ) * p.curve;
			const cx = w / 2;
			const cy = h / 2;
			const quarter = ( x0, y0, x1, y1, cxr, cyr ) => ( {
				t: 'C',
				c1x: x0 + ( cxr - x0 ) * k,
				c1y: y0 + ( cyr - y0 ) * k,
				c2x: x1 + ( cxr - x1 ) * k,
				c2y: y1 + ( cyr - y1 ) * k,
				x: x1,
				y: y1,
			} );
			return [
				{ t: 'M', x: cx, y: 0 },
				quarter( cx, 0, w, cy, w, 0 ),
				quarter( w, cy, cx, h, w, h ),
				quarter( cx, h, 0, cy, 0, h ),
				quarter( 0, cy, cx, 0, 0, 0 ),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'frame',
		name: () => __( 'Frame', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.45,
				def: 0.12,
			},
			{
				key: 'sliceStart',
				label: () => __( 'Slice start', 'wunderpaint' ),
				min: 0,
				max: 360,
				step: 1,
				def: 0,
				deg: true,
			},
			{
				key: 'sliceSpan',
				label: () => __( 'Slice length', 'wunderpaint' ),
				min: 5,
				max: 360,
				step: 1,
				def: 360,
				deg: true,
			},
		],
		commands: ( w, h, p, c ) => {
			const t = Math.min( w, h ) * p.thickness;
			const radii = cornerRadii( c.radius, w, h );
			if ( p.sliceSpan >= 360 ) {
				const outer = roundedPolyCommands(
					rectVertices( w, h ),
					radii,
					c.smoothing
				);
				const innerPts = [
					{ x: t, y: t },
					{ x: t, y: h - t },
					{ x: w - t, y: h - t },
					{ x: w - t, y: t },
				];
				const innerRadii = [
					radii[ 0 ],
					radii[ 3 ],
					radii[ 2 ],
					radii[ 1 ],
				].map( ( r ) => Math.max( 0, r - t ) );
				return [
					...outer,
					...roundedPolyCommands( innerPts, innerRadii, c.smoothing ),
				];
			}
			// An OPEN frame: walk the rectangle's perimeter from the top
			// centre, clockwise, like the ring's gauge slice.
			const walk = ( x0, y0, ww, hh, frac ) => {
				const P = 2 * ( ww + hh );
				let d = ( ( ( frac % 1 ) + 1 ) % 1 ) * P;
				const segs = [
					{
						len: ww / 2,
						pt: ( u ) => ( { x: x0 + ww / 2 + u, y: y0 } ),
					},
					{ len: hh, pt: ( u ) => ( { x: x0 + ww, y: y0 + u } ) },
					{
						len: ww,
						pt: ( u ) => ( { x: x0 + ww - u, y: y0 + hh } ),
					},
					{ len: hh, pt: ( u ) => ( { x: x0, y: y0 + hh - u } ) },
					{ len: ww / 2, pt: ( u ) => ( { x: x0 + u, y: y0 } ) },
				];
				for ( const seg of segs ) {
					if ( d <= seg.len ) {
						return seg.pt( d );
					}
					d -= seg.len;
				}
				return segs[ 0 ].pt( 0 );
			};
			// Corner fractions along that walk (outer rect).
			const P = 2 * ( w + h );
			const cornersAt = [
				w / 2 / P,
				( w / 2 + h ) / P,
				( w / 2 + h + w ) / P,
				( w / 2 + h + w + h ) / P,
			];
			const f0 = p.sliceStart / 360;
			const f1 = f0 + p.sliceSpan / 360;
			const between = [];
			for ( let k = 0; k < 8; k++ ) {
				const cf = cornersAt[ k % 4 ] + Math.floor( k / 4 );
				if ( cf > f0 + 1e-6 && cf < f1 - 1e-6 ) {
					between.push( cf );
				}
			}
			const outerPts = [
				walk( 0, 0, w, h, f0 ),
				...between.map( ( f ) => walk( 0, 0, w, h, f ) ),
				walk( 0, 0, w, h, f1 ),
			];
			const innerPts = [
				walk( t, t, w - 2 * t, h - 2 * t, f1 ),
				...between
					.slice()
					.reverse()
					.map( ( f ) => walk( t, t, w - 2 * t, h - 2 * t, f ) ),
				walk( t, t, w - 2 * t, h - 2 * t, f0 ),
			];
			const r = Array.isArray( c.radius ) ? c.radius[ 0 ] || 0 : c.radius;
			return roundedPolyCommands(
				[ ...outerPts, ...innerPts ],
				r,
				c.smoothing
			);
		},
	},
	{
		id: 'ticket',
		name: () => __( 'Ticket', 'wunderpaint' ),
		aspect: 2,
		corners: true,
		params: [
			{
				key: 'notch',
				label: () => __( 'Notch', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.3,
				def: 0.14,
			},
		],
		commands: ( w, h, p, c ) => {
			const rN = Math.min( ( Math.min( w, h ) * p.notch ) / 1, h / 3 );
			const [ tl, tr, br, bl ] = cornerRadii( c.radius, w, h ).map(
				( r ) => Math.min( r, h / 2 - rN )
			);
			const cy = h / 2;
			const corner = ( cxr, cyr, x, y, r ) =>
				r > 0
					? [ { t: 'A', cx: cxr, cy: cyr, x, y, r, sweep: 1 } ]
					: [ ln( { x: cxr, y: cyr } ) ];
			return [
				{ t: 'M', x: tl, y: 0 },
				ln( { x: w - tr, y: 0 } ),
				...corner( w, 0, w, tr, tr ),
				ln( { x: w, y: cy - rN } ),
				// Semicircular bite, punched inward.
				...arcCommands(
					w,
					cy,
					rN,
					rN,
					-Math.PI / 2,
					( -3 * Math.PI ) / 2
				),
				ln( { x: w, y: h - br } ),
				...corner( w, h, w - br, h, br ),
				ln( { x: bl, y: h } ),
				...corner( 0, h, 0, h - bl, bl ),
				ln( { x: 0, y: cy + rN } ),
				...arcCommands( 0, cy, rN, rN, Math.PI / 2, -Math.PI / 2 ),
				ln( { x: 0, y: tl } ),
				...corner( 0, 0, tl, 0, tl ),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'wave',
		name: () => __( 'Wave banner', 'wunderpaint' ),
		aspect: 2.4,
		params: [
			{
				key: 'amp',
				label: () => __( 'Amplitude', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.3,
				def: 0.14,
			},
			{
				key: 'waves',
				label: () => __( 'Waves', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
		],
		commands: ( w, h, p ) => {
			const m = h * p.amp;
			const k = Math.round( p.waves );
			const yAt = ( x ) =>
				( m / 2 ) * ( 1 - Math.cos( ( TAU * k * x ) / w ) );
			const dyAt = ( x ) =>
				( ( m * Math.PI * k ) / w ) * Math.sin( ( TAU * k * x ) / w );
			const xs = [];
			for ( let i = 0; i <= 4 * k; i++ ) {
				xs.push( ( w * i ) / ( 4 * k ) );
			}
			const back = xs.slice().reverse();
			return [
				{ t: 'M', x: 0, y: yAt( 0 ) },
				...hermiteCommands( xs, yAt, dyAt ),
				ln( { x: w, y: h - m + yAt( w ) } ),
				...hermiteCommands(
					back,
					( x ) => h - m + yAt( x ),
					( x ) => dyAt( x )
				),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'cloud',
		name: () => __( 'Cloud', 'wunderpaint' ),
		aspect: 1.6,
		params: [
			{
				key: 'puffs',
				label: () => __( 'Puffs', 'wunderpaint' ),
				min: 4,
				max: 9,
				step: 1,
				def: 6,
			},
			{
				key: 'puffiness',
				label: () => __( 'Puffiness', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
		],
		commands: ( w, h, p ) => {
			// Puffs all the way around a ring - a cloud has no sharp
			// bottom edge (the flat-ground version did, and Thomas is
			// right that no cloud looks like that). Union outline again:
			// each circle contributes the arc between the OUTER
			// intersections with its neighbours.
			const nP = Math.round( p.puffs );
			const R = 30;
			const c0 = { x: 50, y: 50 };
			const chord = 2 * R * Math.sin( Math.PI / nP );
			const centers = [];
			const radii = [];
			for ( let i = 0; i < nP; i++ ) {
				const a = TOP + ( i / nP ) * TAU;
				// Top puffs grow, bottom puffs stay small and round.
				const topW = Math.max( 0, -Math.sin( a ) );
				centers.push( at( c0.x, c0.y, R, R * 0.72, a ) );
				radii.push(
					chord * ( 0.85 - 0.25 * p.puffiness ) * ( 1 + 0.5 * topW )
				);
			}
			const meet = ( i, j ) => {
				const A = centers[ i ];
				const B = centers[ j ];
				const r1 = radii[ i ];
				const r2 = radii[ j ];
				const dx = B.x - A.x;
				const dy = B.y - A.y;
				const d = Math.hypot( dx, dy ) || 1;
				const a = ( r1 * r1 - r2 * r2 + d * d ) / ( 2 * d );
				const hh = Math.sqrt( Math.max( 0, r1 * r1 - a * a ) );
				const px = A.x + ( a * dx ) / d;
				const py = A.y + ( a * dy ) / d;
				const p1 = { x: px + ( hh * dy ) / d, y: py - ( hh * dx ) / d };
				const p2 = { x: px - ( hh * dy ) / d, y: py + ( hh * dx ) / d };
				const dist = ( q ) => Math.hypot( q.x - c0.x, q.y - c0.y );
				return dist( p1 ) > dist( p2 ) ? p1 : p2;
			};
			const angleOn = ( i, pt ) =>
				Math.atan2( pt.y - centers[ i ].y, pt.x - centers[ i ].x );
			const cmds = [];
			let entryPt = meet( 0, nP - 1 ) || null;
			for ( let i = 0; i < nP; i++ ) {
				const exitPt = meet( i, ( i + 1 ) % nP );
				const e = angleOn( i, entryPt );
				let x = angleOn( i, exitPt );
				// Walk clockwise; the outward arc is the shorter route
				// that keeps the puff's crown, so wrap x above e.
				while ( x <= e ) {
					x += TAU;
				}
				cmds.push( cmds.length ? ln( entryPt ) : mv( entryPt ) );
				cmds.push(
					...arcCommands(
						centers[ i ].x,
						centers[ i ].y,
						radii[ i ],
						radii[ i ],
						e,
						x
					)
				);
				entryPt = exitPt;
			}
			cmds.push( { t: 'Z' } );
			return fitCommands( cmds, w, h );
		},
	},
	{
		id: 'crescent',
		name: () => __( 'Crescent', 'wunderpaint' ),
		params: [
			{
				key: 'fullness',
				label: () => __( 'Fullness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.85,
				def: 0.45,
			},
		],
		commands: ( w, h, p ) => {
			// Outer edge: the left half of an ellipse centred on the right
			// edge, so the cusps sit at the box's right corners. The inner
			// edge is one cubic through the bulge point; the cusps are
			// meant to be sharp, so no tangent matching there.
			const cy = h / 2;
			const bulge = w * ( 1 - p.fullness );
			const cx = ( bulge - 0.25 * w ) / 0.75;
			return [
				{ t: 'M', x: w, y: 0 },
				...arcCommands(
					w,
					cy,
					w,
					cy,
					-Math.PI / 2,
					( -3 * Math.PI ) / 2
				),
				{
					t: 'C',
					c1x: cx,
					c1y: h * 0.75,
					c2x: cx,
					c2y: h * 0.25,
					x: w,
					y: 0,
				},
				{ t: 'Z' },
			];
		},
	},
	{
		// Exact rebuild of the static library tag (cut 0.22, eyelet 0.09),
		// now with dials. The eyelet is a reversed subpath (a real hole).
		id: 'tag',
		name: () => __( 'Tag', 'wunderpaint' ),
		params: [
			{
				key: 'cut',
				label: () => __( 'Point depth', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.45,
				def: 0.22,
			},
			{
				key: 'eyelet',
				label: () => __( 'Eyelet', 'wunderpaint' ),
				...pct,
				max: 0.2,
				def: 0.09,
			},
		],
		commands: ( w, h, p ) => {
			const cut = Math.min( w * p.cut, h / 2 );
			const hx = cut * 0.75;
			// The eyelet must stay inside the point, whatever the dials say.
			const hole = Math.min( Math.min( w, h ) * p.eyelet, hx * 0.9 );
			const cmds = [
				{ t: 'M', x: cut, y: 0 },
				ln( { x: w, y: 0 } ),
				ln( { x: w, y: h } ),
				ln( { x: cut, y: h } ),
				ln( { x: 0, y: h / 2 } ),
				{ t: 'Z' },
			];
			if ( hole > 0.5 ) {
				cmds.push( ...ellipseSub( hx, h / 2, hole, hole, true ) );
			}
			return cmds;
		},
	},
	{
		// Exact rebuild of the static ribbon (swallow-tail banner).
		id: 'ribbon',
		name: () => __( 'Ribbon', 'wunderpaint' ),
		aspect: 2.4,
		corners: true,
		params: [
			{
				key: 'notch',
				label: () => __( 'Notch', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.45,
				def: 0.09,
			},
		],
		commands: ( w, h, p, c ) => {
			const cut = Math.min( w * p.notch, h * 0.35 );
			return roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w, y: 0 },
					{ x: w - cut, y: h / 2 },
					{ x: w, y: h },
					{ x: 0, y: h },
					{ x: cut, y: h / 2 },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// Exact rebuild of the static shield; the point dial moves the
		// shoulder while the curve controls keep their old ratios.
		id: 'shield',
		name: () => __( 'Shield', 'wunderpaint' ),
		params: [
			{
				key: 'point',
				label: () => __( 'Point depth', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.8,
				def: 0.45,
			},
		],
		commands: ( w, h, p ) => {
			const sh = h * ( 1 - p.point );
			const c1 = sh + h * p.point * 0.6;
			const c2 = sh + h * p.point * ( 8 / 9 );
			return [
				{ t: 'M', x: 0, y: 0 },
				ln( { x: w, y: 0 } ),
				ln( { x: w, y: sh } ),
				{
					t: 'C',
					c1x: w,
					c1y: c1,
					c2x: w * 0.72,
					c2y: c2,
					x: w / 2,
					y: h,
				},
				{
					t: 'C',
					c1x: w * 0.28,
					c1y: c2,
					c2x: 0,
					c2y: c1,
					x: 0,
					y: sh,
				},
				{ t: 'Z' },
			];
		},
	},
	{
		// Exact rebuild of the static arch; the rise dial flattens the top.
		id: 'arch',
		name: () => __( 'Arch', 'wunderpaint' ),
		params: [
			{
				key: 'rise',
				label: () => __( 'Rise', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 1,
				def: 1,
			},
		],
		commands: ( w, h, p ) => {
			const r = Math.min( w / 2, h ) * p.rise;
			return [
				{ t: 'M', x: 0, y: h },
				ln( { x: 0, y: r } ),
				...arcCommands( w / 2, r, w / 2, r, Math.PI, TAU ),
				ln( { x: w, y: h } ),
				{ t: 'Z' },
			];
		},
	},
	{
		// Exact rebuild of the static bolt; girth fattens or thins the
		// zigzag around the old vertices, and the ring rounds its corners.
		id: 'bolt',
		name: () => __( 'Bolt', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'girth',
				label: () => __( 'Girth', 'wunderpaint' ),
				min: -0.1,
				max: 0.18,
				step: 0.01,
				def: 0,
			},
		],
		commands: ( w, h, p, c ) => {
			const g = p.girth;
			// Fattened vertices stay inside the box, whatever the dial says.
			const fx = ( f ) => w * clamp( f, 0, 1 );
			return roundedPolyCommands(
				[
					{ x: fx( 0.58 + g ), y: 0 },
					{ x: fx( 0.16 - g ), y: h * 0.56 },
					{ x: fx( 0.45 + g ), y: h * 0.56 },
					{ x: fx( 0.36 - g * 0.5 ), y: h },
					{ x: fx( 0.86 + g ), y: h * 0.4 },
					{ x: fx( 0.55 - g ), y: h * 0.4 },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// The heart's dials. At their defaults this returns null and the
		// hand-drawn library path renders instead, so every existing heart
		// keeps its exact outline; the parametric twin below is tuned to
		// look the same, and only a touched dial switches over to it.
		id: 'heart',
		name: () => __( 'Heart', 'wunderpaint' ),
		params: [
			{
				key: 'lobes',
				label: () => __( 'Lobes', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.8,
				def: 0.5,
			},
			{
				key: 'taper',
				label: () => __( 'Point', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
		],
		commands: ( w, h, p ) => {
			if ( 0.5 === p.lobes && 0.5 === p.taper ) {
				return null;
			}
			const dip = 0.16 + 0.28 * p.lobes;
			const side = 0.3 + 0.24 * ( 1 - p.taper );
			const cmds = [
				{ t: 'M', x: 0.5, y: dip },
				{
					t: 'C',
					c1x: 0.45,
					c1y: dip - 0.2,
					c2x: 0.32,
					c2y: -0.04,
					x: 0.2,
					y: 0.02,
				},
				{
					t: 'C',
					c1x: 0.05,
					c1y: 0.1,
					c2x: -0.02,
					c2y: 0.3,
					x: 0.04,
					y: 0.48,
				},
				{
					t: 'C',
					c1x: 0.1,
					c1y: 0.66,
					c2x: 0.5 - side * 0.6,
					c2y: 0.76,
					x: 0.5,
					y: 0.98,
				},
				{
					t: 'C',
					c1x: 0.5 + side * 0.6,
					c1y: 0.76,
					c2x: 0.9,
					c2y: 0.66,
					x: 0.96,
					y: 0.48,
				},
				{
					t: 'C',
					c1x: 1.02,
					c1y: 0.3,
					c2x: 0.95,
					c2y: 0.1,
					x: 0.8,
					y: 0.02,
				},
				{
					t: 'C',
					c1x: 0.68,
					c1y: -0.04,
					c2x: 0.55,
					c2y: dip - 0.2,
					x: 0.5,
					y: dip,
				},
				{ t: 'Z' },
			].map( ( cmd ) => {
				const out = { ...cmd };
				for ( const k of [ 'x', 'c1x', 'c2x' ] ) {
					if ( 'number' === typeof out[ k ] ) {
						out[ k ] *= w;
					}
				}
				for ( const k of [ 'y', 'c1y', 'c2y' ] ) {
					if ( 'number' === typeof out[ k ] ) {
						out[ k ] *= h;
					}
				}
				return out;
			} );
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Thomas' blob stays byte-identical at variation 0 (null defers to
		// the library path); above that a seeded round of control points
		// grows a NEW organic blob - same dial, always reproducible.
		id: 'blob',
		name: () => __( 'Blob', 'wunderpaint' ),
		params: [
			{
				key: 'variation',
				label: () => __( 'Variation', 'wunderpaint' ),
				min: 0,
				max: 12,
				step: 1,
				def: 0,
			},
			{
				key: 'softness',
				label: () => __( 'Softness', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
		],
		commands: ( w, h, p ) => {
			const seed = Math.round( p.variation );
			if ( ! seed ) {
				return null;
			}
			// Tiny LCG: deterministic per variation, no Date/random.
			let s = seed * 7919 + 104729;
			const rand = () => {
				s = ( s * 9301 + 49297 ) % 233280;
				return s / 233280;
			};
			const n = 8;
			const amp = 0.38 - 0.22 * p.softness;
			const pts = [];
			for ( let i = 0; i < n; i++ ) {
				const a =
					( i / n ) * TAU + ( rand() - 0.5 ) * ( TAU / n ) * 0.6;
				const r = 1 - amp * rand();
				pts.push( {
					x: 50 + 50 * r * Math.cos( a ),
					y: 50 + 50 * r * Math.sin( a ),
				} );
			}
			// Catmull-Rom through the ring, as cubics.
			const cmds = [ { t: 'M', x: pts[ 0 ].x, y: pts[ 0 ].y } ];
			for ( let i = 0; i < n; i++ ) {
				const p0 = pts[ ( i + n - 1 ) % n ];
				const p1 = pts[ i ];
				const p2 = pts[ ( i + 1 ) % n ];
				const p3 = pts[ ( i + 2 ) % n ];
				cmds.push( {
					t: 'C',
					c1x: p1.x + ( p2.x - p0.x ) / 6,
					c1y: p1.y + ( p2.y - p0.y ) / 6,
					c2x: p2.x - ( p3.x - p1.x ) / 6,
					c2y: p2.y - ( p3.y - p1.y ) / 6,
					x: p2.x,
					y: p2.y,
				} );
			}
			cmds.push( { t: 'Z' } );
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Rounded squares in a grid ("Cross square" generalised): count,
		// gap, and the corner radius per tile.
		id: 'grid',
		name: () => __( 'Squares', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 2,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.4,
				def: 0.14,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.count );
			const px = w / n;
			const py = h / n;
			const gx = ( px * p.gap ) / 2;
			const gy = ( py * p.gap ) / 2;
			const cmds = [];
			for ( let iy = 0; iy < n; iy++ ) {
				for ( let ix = 0; ix < n; ix++ ) {
					const x0 = ix * px + gx;
					const y0 = iy * py + gy;
					const x1 = ( ix + 1 ) * px - gx;
					const y1 = ( iy + 1 ) * py - gy;
					cmds.push(
						...roundedPolyCommands(
							[
								{ x: x0, y: y0 },
								{ x: x1, y: y0 },
								{ x: x1, y: y1 },
								{ x: x0, y: y1 },
							],
							c.radius,
							c.smoothing
						)
					);
				}
			}
			return cmds;
		},
	},
	{
		// A daisy: petals as a smooth polar curve around the centre.
		id: 'flower',
		name: () => __( 'Flower', 'wunderpaint' ),
		params: [
			{
				key: 'petals',
				label: () => __( 'Petals', 'wunderpaint' ),
				min: 4,
				max: 12,
				step: 1,
				def: 6,
			},
			{
				key: 'width',
				label: () => __( 'Petal width', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.9,
				def: 0.55,
			},
		],
		commands: ( w, h, p ) => {
			const k = Math.round( p.petals );
			const e = 0.6 + 2.2 * ( 1 - p.width );
			const inner = 0.22;
			const rAt = ( a ) =>
				inner +
				( 1 - inner ) * Math.pow( ( 1 + Math.cos( k * a ) ) / 2, e );
			const cx = w / 2;
			const cy = h / 2;
			const steps = 8 * k;
			const pt = ( a ) => {
				const r = rAt( a );
				return {
					x: cx + cx * r * Math.cos( a ),
					y: cy + cy * r * Math.sin( a ),
				};
			};
			// Hermite through samples; tangents by central difference.
			const d = TAU / steps;
			const cmds = [ mv( pt( TOP ) ) ];
			for ( let i = 0; i < steps; i++ ) {
				const a0 = TOP + i * d;
				const a1 = a0 + d;
				const t0 = {
					x: ( pt( a0 + d / 4 ).x - pt( a0 - d / 4 ).x ) * 2,
					y: ( pt( a0 + d / 4 ).y - pt( a0 - d / 4 ).y ) * 2,
				};
				const t1 = {
					x: ( pt( a1 + d / 4 ).x - pt( a1 - d / 4 ).x ) * 2,
					y: ( pt( a1 + d / 4 ).y - pt( a1 - d / 4 ).y ) * 2,
				};
				cmds.push( {
					t: 'C',
					c1x: pt( a0 ).x + t0.x / 3,
					c1y: pt( a0 ).y + t0.y / 3,
					c2x: pt( a1 ).x - t1.x / 3,
					c2y: pt( a1 ).y - t1.y / 3,
					x: pt( a1 ).x,
					y: pt( a1 ).y,
				} );
			}
			cmds.push( { t: 'Z' } );
			return cmds;
		},
	},
	{
		// A star racing left: the star itself plus tapered tail strips.
		id: 'shooting',
		name: () => __( 'Shooting star', 'wunderpaint' ),
		aspect: 2,
		params: [
			{
				key: 'tails',
				label: () => __( 'Tails', 'wunderpaint' ),
				min: 2,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'length',
				label: () => __( 'Tail length', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.75,
				def: 0.45,
			},
		],
		commands: ( w, h, p ) => {
			const d = Math.min( h, w * ( 1 - p.length * 0.8 ) );
			const star = polygonVertices( 'star', d, d, 5, 0.45 ).map(
				( v ) => ( { x: v.x + ( w - d ), y: v.y + ( h - d ) / 2 } )
			);
			const cmds = roundedPolyCommands( star, 0, 0 );
			const t = Math.round( p.tails );
			// Detached speed lines, the classic comet look (Thomas): a
			// small gap between star and trails, the outer ones shorter
			// and starting a touch further back.
			const edge = w - d * 1.05;
			for ( let i = 0; i < t; i++ ) {
				const f = t > 1 ? i / ( t - 1 ) : 0.5;
				const off = Math.abs( f - 0.5 ) * 2;
				const yC = h / 2 + ( f - 0.5 ) * d * 0.52;
				const th = ( d * 0.055 ) / ( 1 + off * 0.8 );
				const xR = Math.max( w * 0.02, edge - off * d * 0.16 );
				const len = w * p.length * ( 1 - 0.4 * off );
				cmds.push(
					{ t: 'M', x: xR, y: yC - th },
					ln( { x: xR, y: yC + th } ),
					ln( { x: Math.max( 0, xR - len ), y: yC } ),
					{ t: 'Z' }
				);
			}
			return cmds;
		},
	},
	{
		id: 'speech',
		name: () => __( 'Speech Bubble', 'wunderpaint' ),
		params: [
			{
				key: 'tailX',
				label: () => __( 'Tail position', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.92,
				def: 0.28,
			},
			{
				key: 'tailW',
				label: () => __( 'Tail width', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.4,
				def: 0.12,
			},
			{
				key: 'lean',
				label: () => __( 'Tail lean', 'wunderpaint' ),
				min: -0.5,
				max: 0.5,
				step: 0.01,
				def: -0.08,
			},
			{
				key: 'body',
				label: () => __( 'Body height', 'wunderpaint' ),
				...pct,
				min: 0.5,
				max: 0.92,
				def: 0.74,
			},
			{
				key: 'round',
				label: () => __( 'Roundness', 'wunderpaint' ),
				...pct,
				max: 0.4,
				def: 0.12,
			},
		],
		commands: ( w, h, p ) => {
			// Defaults reproduce the drawShape original exactly: body 0.74,
			// corner 0.12 x min( w, h ), tail base 0.22..0.34, tip at 0.2.
			const bh = h * p.body;
			const r = Math.min( Math.min( w, h ) * p.round, bh / 2, w / 2 );
			const x2 = clamp( p.tailX + p.tailW / 2, 0.02, 0.98 ) * w;
			const x1 = clamp( p.tailX - p.tailW / 2, 0.01, 0.97 ) * w;
			const tip = clamp( p.tailX + p.lean, 0, 1 ) * w;
			const corner = ( cxr, cyr, x, y ) => ( {
				t: 'A',
				cx: cxr,
				cy: cyr,
				x,
				y,
				r,
				sweep: 1,
			} );
			return [
				{ t: 'M', x: r, y: 0 },
				ln( { x: w - r, y: 0 } ),
				corner( w, 0, w, r ),
				ln( { x: w, y: bh - r } ),
				corner( w, bh, w - r, bh ),
				ln( { x: Math.min( x2, w - r ), y: bh } ),
				ln( { x: tip, y: h } ),
				ln( { x: Math.max( x1, r ), y: bh } ),
				ln( { x: r, y: bh } ),
				corner( 0, bh, 0, bh - r ),
				ln( { x: 0, y: r } ),
				corner( 0, 0, r, 0 ),
				{ t: 'Z' },
			];
		},
	},
	{
		// Thomas' benchmark for "really dynamic": prong count, not radius.
		id: 'crown',
		name: () => __( 'Crown', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'prongs',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 2,
				max: 8,
				step: 1,
				// Five by default: three prongs read as a fork (v1.430).
				def: 5,
			},
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.75,
				def: 0.45,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.prongs );
			const valley = h * p.depth;
			const pts = [ { x: 0, y: h } ];
			for ( let i = 0; i < n; i++ ) {
				pts.push( { x: ( w * i ) / ( n - 1 || 1 ), y: 0 } );
				if ( i < n - 1 ) {
					pts.push( {
						x: ( w * ( i + 0.5 ) ) / ( n - 1 ),
						y: valley,
					} );
				}
			}
			pts.push( { x: w, y: h } );
			return roundedPolyCommands( pts, c.radius, c.smoothing );
		},
	},
	{
		// The other named benchmark: tier count, not a frozen silhouette.
		id: 'pine',
		name: () => __( 'Pine tree', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'tiers',
				label: () => __( 'Tiers', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'spread',
				label: () => __( 'Spread', 'wunderpaint' ),
				...pct,
				min: 0.5,
				max: 1,
				def: 0.85,
			},
			{
				key: 'trunk',
				label: () => __( 'Trunk', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.2,
				def: 0.12,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.tiers );
			const cx = w / 2;
			const bodyH = h * 0.9;
			const tw = ( w * p.trunk ) / 2;
			const span = ( i ) =>
				( w / 2 ) * p.spread * ( 0.45 + ( 0.55 * ( i + 1 ) ) / n );
			const right = [ { x: cx, y: 0 } ];
			for ( let i = 0; i < n; i++ ) {
				const y = ( bodyH * ( i + 1 ) ) / n;
				right.push( { x: cx + span( i ), y } );
				if ( i < n - 1 ) {
					right.push( { x: cx + span( i ) * 0.55, y } );
				}
			}
			right.push( { x: cx + tw, y: bodyH } );
			right.push( { x: cx + tw, y: h } );
			const left = right
				.slice( 1 )
				.reverse()
				.map( ( v ) => ( { x: 2 * cx - v.x, y: v.y } ) );
			return roundedPolyCommands(
				[ ...right, ...left ],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// Scalloped seal: round bumps (the burst has straight spikes).
		id: 'seal',
		name: () => __( 'Seal', 'wunderpaint' ),
		params: [
			{
				key: 'bumps',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 8,
				max: 24,
				step: 1,
				def: 12,
			},
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.03,
				max: 0.18,
				def: 0.08,
			},
			{
				key: 'bore',
				label: () => __( 'Bore', 'wunderpaint' ),
				...pct,
				max: 0.7,
				def: 0,
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.bumps );
			const cx = w / 2;
			const cy = h / 2;
			// The bump crest must land on the box edge.
			const rx = cx / ( 1 + p.depth );
			const ry = cy / ( 1 + p.depth );
			const cmds = [ mv( at( cx, cy, rx, ry, TOP ) ) ];
			for ( let i = 0; i < n; i++ ) {
				const a0 = TOP + ( i / n ) * TAU;
				const a1 = TOP + ( ( i + 1 ) / n ) * TAU;
				const am = ( a0 + a1 ) / 2;
				const q = at(
					cx,
					cy,
					rx * ( 1 + 2 * p.depth ),
					ry * ( 1 + 2 * p.depth ),
					am
				);
				const p0 = at( cx, cy, rx, ry, a0 );
				const p1 = at( cx, cy, rx, ry, a1 );
				// Quadratic bump written as its exact cubic.
				cmds.push( {
					t: 'C',
					c1x: p0.x + ( 2 / 3 ) * ( q.x - p0.x ),
					c1y: p0.y + ( 2 / 3 ) * ( q.y - p0.y ),
					c2x: p1.x + ( 2 / 3 ) * ( q.x - p1.x ),
					c2y: p1.y + ( 2 / 3 ) * ( q.y - p1.y ),
					x: p1.x,
					y: p1.y,
				} );
			}
			cmds.push( { t: 'Z' } );
			if ( p.bore > 0.02 ) {
				cmds.push(
					...ellipseSub( cx, cy, rx * p.bore, ry * p.bore, true )
				);
			}
			return cmds;
		},
	},
	{
		// One curved arrow covers the catalog's U-turn, circle and loop.
		id: 'arcarrow',
		name: () => __( 'Curved arrow', 'wunderpaint' ),
		params: [
			{
				key: 'sweep',
				label: () => __( 'Sweep', 'wunderpaint' ),
				min: 60,
				max: 320,
				step: 1,
				def: 220,
				deg: true,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.3,
				def: 0.16,
			},
			{
				key: 'head',
				label: () => __( 'Head length', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.35,
				def: 0.22,
			},
		],
		commands: ( w, h, p ) => {
			// A mathematically true CIRCLE band, centred, never stretched
			// to the box - the first cut ran the ellipse radii through a
			// bounding-box fit and every arrow came out warped.
			const cx = w / 2;
			const cy = h / 2;
			const U = Math.min( cx, cy );
			// Band + head flare may never eat the whole radius, and the
			// head may never swallow the sweep (fat 120-degree arrows
			// collapsed to slivers without these clamps).
			let T = U * p.thickness * 1.7;
			let flare = T * 0.55;
			// Keep an inner hole of at least 0.22 U, whatever the dials.
			const roomK = Math.min( 1, ( U * 0.78 ) / ( T + flare ) );
			T *= roomK;
			flare *= roomK;
			const rM = U - T / 2 - flare;
			const rO = rM + T / 2;
			const rI = rM - T / 2;
			const sweepRad = ( p.sweep * Math.PI ) / 180;
			const headA = Math.min( ( U * p.head * 1.9 ) / rM, sweepRad * 0.4 );
			const a0 = TOP + 0.14;
			const a1 = a0 + sweepRad - headA;
			const tip = a1 + headA;
			return [
				mv( at( cx, cy, rO, rO, a0 ) ),
				...arcCommands( cx, cy, rO, rO, a0, a1 ),
				// Head base flares straight out along the radius, the tip
				// sits on the centreline - the classic refresh arrow.
				ln( at( cx, cy, rM + T / 2 + flare, rM + T / 2 + flare, a1 ) ),
				ln( at( cx, cy, rM, rM, tip ) ),
				ln( at( cx, cy, rM - T / 2 - flare, rM - T / 2 - flare, a1 ) ),
				ln( at( cx, cy, rI, rI, a1 ) ),
				...arcCommands( cx, cy, rI, rI, a1, a0 ),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'chevrons',
		name: () => __( 'Chevrons', 'wunderpaint' ),
		aspect: 1.4,
		corners: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.8,
				def: 0.45,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.count );
			const cw = w / n;
			const tw = cw * p.thickness * 0.75;
			const bend = cw - tw;
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const x0 = i * cw;
				cmds.push(
					...roundedPolyCommands(
						[
							{ x: x0, y: 0 },
							{ x: x0 + tw, y: 0 },
							{ x: x0 + tw + bend, y: h / 2 },
							{ x: x0 + tw, y: h },
							{ x: x0, y: h },
							{ x: x0 + bend, y: h / 2 },
						],
						c.radius,
						c.smoothing
					)
				);
			}
			return cmds;
		},
	},
	{
		id: 'parallelogram',
		name: () => __( 'Parallelogram', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'skew',
				label: () => __( 'Skew', 'wunderpaint' ),
				min: -0.45,
				max: 0.45,
				step: 0.01,
				def: 0.2,
			},
		],
		commands: ( w, h, p, c ) => {
			const s = Math.abs( w * p.skew );
			const flip = p.skew < 0;
			return roundedPolyCommands(
				[
					{ x: flip ? 0 : s, y: 0 },
					{ x: flip ? w - s : w, y: 0 },
					{ x: flip ? w : w - s, y: h },
					{ x: flip ? s : 0, y: h },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'trapezoid',
		name: () => __( 'Trapezoid', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'top',
				label: () => __( 'Top width', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 1,
				def: 0.5,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				[
					{ x: ( w * ( 1 - p.top ) ) / 2, y: 0 },
					{ x: ( w * ( 1 + p.top ) ) / 2, y: 0 },
					{ x: w, y: h },
					{ x: 0, y: h },
				],
				c.radius,
				c.smoothing
			),
	},
	{
		id: 'stairs',
		name: () => __( 'Stairs', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'steps',
				label: () => __( 'Steps', 'wunderpaint' ),
				min: 2,
				max: 6,
				step: 1,
				def: 3,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.steps );
			const pts = [ { x: 0, y: h } ];
			for ( let i = 0; i < n; i++ ) {
				pts.push( { x: ( w * i ) / n, y: ( h * ( n - 1 - i ) ) / n } );
				pts.push( {
					x: ( w * ( i + 1 ) ) / n,
					y: ( h * ( n - 1 - i ) ) / n,
				} );
			}
			pts.push( { x: w, y: h } );
			return roundedPolyCommands( pts, c.radius, c.smoothing );
		},
	},
	{
		id: 'lshape',
		name: () => __( 'L shape', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'armX',
				label: () => __( 'Arm width', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.85,
				def: 0.35,
			},
			{
				key: 'armY',
				label: () => __( 'Arm height', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.85,
				def: 0.35,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w * p.armX, y: 0 },
					{ x: w * p.armX, y: h * ( 1 - p.armY ) },
					{ x: w, y: h * ( 1 - p.armY ) },
					{ x: w, y: h },
					{ x: 0, y: h },
				],
				c.radius,
				c.smoothing
			),
	},
	{
		id: 'bookmark',
		name: () => __( 'Bookmark', 'wunderpaint' ),
		aspect: 0.6,
		corners: true,
		params: [
			{
				key: 'notch',
				label: () => __( 'Notch', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.6,
				def: 0.24,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w, y: 0 },
					{ x: w, y: h },
					{ x: w / 2, y: h * ( 1 - p.notch ) },
					{ x: 0, y: h },
				],
				c.radius,
				c.smoothing
			),
	},
	{
		// Pointed ends outward, notched ends inward - one dial, both
		// classic label silhouettes.
		id: 'label',
		name: () => __( 'Label', 'wunderpaint' ),
		aspect: 2.4,
		corners: true,
		params: [
			{
				key: 'ends',
				label: () => __( 'Ends', 'wunderpaint' ),
				min: -0.45,
				max: 0.45,
				step: 0.01,
				def: 0.12,
			},
		],
		commands: ( w, h, p, c ) => {
			const m = Math.abs( w * p.ends );
			if ( p.ends >= 0 ) {
				return roundedPolyCommands(
					[
						{ x: m, y: 0 },
						{ x: w - m, y: 0 },
						{ x: w, y: h / 2 },
						{ x: w - m, y: h },
						{ x: m, y: h },
						{ x: 0, y: h / 2 },
					],
					c.radius,
					c.smoothing
				);
			}
			return roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w, y: 0 },
					{ x: w - m, y: h / 2 },
					{ x: w, y: h },
					{ x: 0, y: h },
					{ x: m, y: h / 2 },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'flag',
		name: () => __( 'Flag', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'notch',
				label: () => __( 'Notch', 'wunderpaint' ),
				...pct,
				max: 0.5,
				def: 0.3,
			},
			{
				key: 'pole',
				label: () => __( 'Pole', 'wunderpaint' ),
				...pct,
				min: 0.03,
				max: 0.15,
				def: 0.07,
			},
		],
		commands: ( w, h, p, c ) => {
			const pw = w * p.pole;
			const bh = h * 0.52;
			const nw = w * 0.16 * ( p.notch > 0 ? 1 : 0 );
			const banner = [
				{ x: pw * 0.6, y: h * 0.04 },
				{ x: w, y: h * 0.04 },
				...( p.notch > 0.02
					? [ { x: w - nw * ( p.notch * 2 ), y: h * 0.04 + bh / 2 } ]
					: [] ),
				{ x: w, y: h * 0.04 + bh },
				{ x: pw * 0.6, y: h * 0.04 + bh },
			];
			return [
				...roundedPolyCommands(
					[
						{ x: 0, y: 0 },
						{ x: pw, y: 0 },
						{ x: pw, y: h },
						{ x: 0, y: h },
					],
					c.radius,
					c.smoothing
				),
				...roundedPolyCommands( banner, c.radius, c.smoothing ),
			];
		},
	},
	{
		id: 'mountain',
		name: () => __( 'Mountains', 'wunderpaint' ),
		aspect: 1.6,
		corners: true,
		params: [
			{
				key: 'peaks',
				label: () => __( 'Peaks', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
			{
				key: 'jag',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.7,
				def: 0.45,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.peaks );
			const pts = [ { x: 0, y: h } ];
			for ( let i = 0; i < n; i++ ) {
				// Alternate the summit heights so a range reads as one.
				const top = h * ( i % 2 ? 0.22 : 0.04 );
				pts.push( { x: ( w * ( i + 0.5 ) ) / n, y: top } );
				if ( i < n - 1 ) {
					pts.push( {
						x: ( w * ( i + 1 ) ) / n,
						y: h * p.jag + h * 0.1,
					} );
				}
			}
			pts.push( { x: w, y: h } );
			return roundedPolyCommands( pts, c.radius, c.smoothing );
		},
	},
	{
		id: 'clover',
		name: () => __( 'Clover', 'wunderpaint' ),
		params: [
			{
				key: 'leaves',
				label: () => __( 'Leaves', 'wunderpaint' ),
				min: 3,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'size',
				label: () => __( 'Leaf size', 'wunderpaint' ),
				...pct,
				min: 0.3,
				max: 0.7,
				def: 0.5,
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.leaves );
			const r = 26 * ( 0.7 + 0.6 * p.size );
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const a = TOP + ( i / n ) * TAU;
				const pos = at( 50, 50, 50 - r, 50 - r, a );
				cmds.push( ...ellipseSub( pos.x, pos.y, r, r ) );
			}
			return fitCommands( cmds, w, h );
		},
	},
	{
		id: 'leaf',
		name: () => __( 'Leaf', 'wunderpaint' ),
		params: [
			{
				key: 'width',
				label: () => __( 'Fullness', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 1,
				def: 0.55,
			},
		],
		commands: ( w, h, p ) => {
			// Two bows mirrored about the stem-to-tip diagonal; the dial
			// pulls them apart. The first try bent both the same way and
			// drew a sliver moon instead of a leaf.
			const b = p.width * 0.42;
			const cUp = ( f ) => ( {
				x: w * ( f - b ),
				y: h * ( 1 - f - b ),
			} );
			const cDn = ( f ) => ( {
				x: w * ( f + b ),
				y: h * ( 1 - f + b ),
			} );
			return fitCommands(
				[
					{ t: 'M', x: 0, y: h },
					{
						t: 'C',
						c1x: cUp( 1 / 3 ).x,
						c1y: cUp( 1 / 3 ).y,
						c2x: cUp( 2 / 3 ).x,
						c2y: cUp( 2 / 3 ).y,
						x: w,
						y: 0,
					},
					{
						t: 'C',
						c1x: cDn( 2 / 3 ).x,
						c1y: cDn( 2 / 3 ).y,
						c2x: cDn( 1 / 3 ).x,
						c2y: cDn( 1 / 3 ).y,
						x: 0,
						y: h,
					},
					{ t: 'Z' },
				],
				w,
				h
			);
		},
	},
	{
		id: 'drop',
		name: () => __( 'Drop', 'wunderpaint' ),
		aspect: 0.72,
		params: [
			{
				key: 'point',
				label: () => __( 'Point', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.6,
				def: 0.4,
			},
		],
		commands: ( w, h, p ) => {
			// The classic teardrop: a round bulb, sides that leave the
			// bulb TANGENTIALLY and run into a slim tip. The first cut
			// bowed the sides outward and looked like a cone on a ball.
			const r = ( h * ( 1 - p.point ) ) / 2;
			const cy = h - r;
			const cx = w / 2;
			// The bulb stays ROUND: box-fitting stretched long drops
			// into volcanoes, a full-width bulb flattened them. Correct
			// beats box-filling (same call as the curved arrow).
			const rx = Math.min( w / 2, r );
			// Tangent points climb with the point so the sides meet the
			// bulb without a notch.
			const aT = Math.PI * ( 1.24 + 0.14 * p.point );
			const aEnd = Math.PI * ( 2 - ( 0.24 + 0.14 * p.point ) );
			const pl = at( cx, cy, rx, r, aT );
			const pr = at( cx, cy, rx, r, aEnd );
			// Tip tangents: near-vertical, a hair apart.
			const tipA = 0.22;
			const dist = cy - r * 0.2;
			return [
				{ t: 'M', x: cx, y: 0 },
				{
					t: 'C',
					c1x: cx - Math.sin( tipA ) * dist * 0.4,
					c1y: Math.cos( tipA ) * dist * 0.4,
					c2x: pl.x - Math.sin( aT ) * rx * 0.3,
					c2y: pl.y + Math.cos( aT ) * r * 0.3,
					x: pl.x,
					y: pl.y,
				},
				...arcCommands( cx, cy, rx, r, aT, aEnd - TAU ),
				{
					t: 'C',
					c1x: pr.x + Math.sin( aEnd ) * rx * 0.3,
					c1y: pr.y - Math.cos( aEnd ) * r * 0.3,
					c2x: cx + Math.sin( tipA ) * dist * 0.4,
					c2y: Math.cos( tipA ) * dist * 0.4,
					x: cx,
					y: 0,
				},
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'check',
		name: () => __( 'Checkmark', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.45,
				def: 0.24,
			},
		],
		commands: ( w, h, p, c ) => {
			const t = ( Math.min( w, h ) * p.thickness ) / 2;
			// Centreline: short arm down-right, long arm up-right.
			const A = { x: w * 0.1, y: h * 0.52 };
			const B = { x: w * 0.38, y: h * 0.8 };
			const C = { x: w * 0.9, y: h * 0.16 };
			const off = ( P, Q ) => {
				const dx = Q.x - P.x;
				const dy = Q.y - P.y;
				const l = Math.hypot( dx, dy ) || 1;
				return { x: ( -dy / l ) * t, y: ( dx / l ) * t };
			};
			const o1 = off( A, B );
			const o2 = off( B, C );
			return fitCommands(
				roundedPolyCommands(
					[
						{ x: A.x + o1.x, y: A.y + o1.y },
						{ x: B.x + o1.x + o2.x, y: B.y + o1.y + o2.y },
						{ x: C.x + o2.x, y: C.y + o2.y },
						{ x: C.x - o2.x, y: C.y - o2.y },
						{ x: B.x, y: B.y },
						{ x: A.x - o1.x, y: A.y - o1.y },
					],
					c.radius,
					c.smoothing
				),
				w,
				h
			);
		},
	},
	{
		id: 'xmark',
		name: () => __( 'X mark', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.45,
				def: 0.28,
			},
		],
		commands: ( w, h, p, c ) => {
			const m = p.thickness * 0.7;
			const u = ( x, y ) => ( { x: x * w, y: y * h } );
			return roundedPolyCommands(
				[
					u( m, 0 ),
					u( 0.5, 0.5 - m ),
					u( 1 - m, 0 ),
					u( 1, m ),
					u( 0.5 + m, 0.5 ),
					u( 1, 1 - m ),
					u( 1 - m, 1 ),
					u( 0.5, 0.5 + m ),
					u( m, 1 ),
					u( 0, 1 - m ),
					u( 0.5 - m, 0.5 ),
					u( 0, m ),
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'thought',
		name: () => __( 'Thought bubble', 'wunderpaint' ),
		params: [
			{
				key: 'dots',
				label: () => __( 'Dots', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
			{
				key: 'lean',
				label: () => __( 'Tail lean', 'wunderpaint' ),
				min: -0.5,
				max: 0.5,
				step: 0.01,
				def: -0.2,
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.dots );
			const cmds = [ ...ellipseSub( w / 2, h * 0.34, w / 2, h * 0.34 ) ];
			// Shrinking trail toward a corner, like the classic comic.
			for ( let i = 0; i < n; i++ ) {
				const f = ( i + 1 ) / ( n + 1 );
				const r = h * 0.1 * ( 1 - f * 0.5 );
				cmds.push(
					...ellipseSub(
						w * ( 0.5 + p.lean * ( 0.4 + 1.1 * f ) ),
						h * ( 0.72 + 0.26 * f ),
						r * 1.35,
						r
					)
				);
			}
			return fitCommands( cmds, w, h );
		},
	},
	{
		id: 'sun',
		name: () => __( 'Sun', 'wunderpaint' ),
		params: [
			{
				key: 'rays',
				label: () => __( 'Rays', 'wunderpaint' ),
				min: 6,
				max: 20,
				step: 1,
				def: 10,
			},
			{
				key: 'core',
				label: () => __( 'Core', 'wunderpaint' ),
				...pct,
				min: 0.25,
				max: 0.7,
				def: 0.48,
			},
			{
				key: 'rayW',
				label: () => __( 'Ray width', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.7,
				def: 0.38,
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const n = Math.round( p.rays );
			const gap = p.core + 0.1;
			const cmds = [ ...ellipseSub( cx, cy, cx * p.core, cy * p.core ) ];
			// Detached trapezoid rays around the core.
			for ( let i = 0; i < n; i++ ) {
				const a = TOP + ( i / n ) * TAU;
				const half = ( ( TAU / n ) * p.rayW ) / 2;
				cmds.push(
					mv( at( cx, cy, cx * gap, cy * gap, a - half ) ),
					ln( at( cx, cy, cx, cy, a - half * 0.6 ) ),
					ln( at( cx, cy, cx, cy, a + half * 0.6 ) ),
					ln( at( cx, cy, cx * gap, cy * gap, a + half ) ),
					{ t: 'Z' }
				);
			}
			return cmds;
		},
	},
	{
		// The comic shout: a burst with a speech tail.
		id: 'shout',
		name: () => __( 'Shout bubble', 'wunderpaint' ),
		params: [
			{
				key: 'points',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 8,
				max: 24,
				step: 1,
				def: 12,
			},
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.4,
				def: 0.22,
			},
			{
				key: 'tailX',
				label: () => __( 'Tail position', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.3,
			},
		],
		commands: ( w, h, p ) => {
			const bh = h * 0.82;
			const pts = polygonVertices(
				'star',
				w,
				bh,
				Math.round( p.points ),
				1 - p.depth
			);
			const cmds = roundedPolyCommands( pts, 0, 0 );
			// The tail wedge overlaps the burst body (same winding).
			const bx = w * p.tailX;
			cmds.push(
				mv( { x: Math.max( 0, bx - w * 0.08 ), y: bh * 0.75 } ),
				ln( { x: Math.min( w, bx + w * 0.1 ), y: bh * 0.75 } ),
				ln( { x: bx, y: h } ),
				{ t: 'Z' }
			);
			return cmds;
		},
	},
	{
		// Award medal: the disc with two ribbon tails below.
		id: 'medal',
		name: () => __( 'Medal', 'wunderpaint' ),
		aspect: 0.75,
		params: [
			{
				key: 'tails',
				label: () => __( 'Tail length', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.55,
				def: 0.38,
			},
			{
				key: 'spreadM',
				label: () => __( 'Spread', 'wunderpaint' ),
				...pct,
				max: 0.5,
				def: 0.2,
			},
			{
				key: 'bore',
				label: () => __( 'Bore', 'wunderpaint' ),
				...pct,
				max: 0.7,
				def: 0,
			},
		],
		commands: ( w, h, p ) => {
			const r = ( h * ( 1 - p.tails ) ) / 2;
			const cx = w / 2;
			const rx = Math.min( w / 2, r );
			const cmds = [ ...ellipseSub( cx, r, rx, r ) ];
			if ( p.bore > 0.02 ) {
				cmds.push(
					...ellipseSub( cx, r, rx * p.bore, r * p.bore, true )
				);
			}
			// Two notched ribbon tails fanning out below the disc.
			const tw = rx * 0.52;
			const y0 = r * 1.2;
			for ( const side of [ -1, 1 ] ) {
				const off = side * rx * ( 0.28 + p.spreadM );
				const x0 = cx + off - tw / 2 + ( side * tw ) / 4;
				const x1 = x0 + tw;
				cmds.push(
					mv( { x: cx + ( side * tw ) / 3 - tw / 2, y: y0 } ),
					ln( { x: cx + ( side * tw ) / 3 + tw / 2, y: y0 } ),
					ln( { x: x1, y: h * 0.96 } ),
					ln( { x: ( x0 + x1 ) / 2, y: h * 0.86 } ),
					ln( { x: x0, y: h * 0.96 } ),
					{ t: 'Z' }
				);
			}
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Moon phases: 0.5 is the half moon, below it wanes to a sliver,
		// above it waxes gibbous until the disc is full.
		id: 'moon',
		name: () => __( 'Moon', 'wunderpaint' ),
		params: [
			{
				key: 'phase',
				label: () => __( 'Phase', 'wunderpaint' ),
				...pct,
				min: 0.05,
				def: 0.35,
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			// Signed terminator radius: negative bows toward the lit rim.
			const rt = cx * ( 2 * p.phase - 1 );
			return [
				mv( at( cx, cy, cx, cy, -Math.PI / 2 ) ),
				...arcCommands( cx, cy, cx, cy, -Math.PI / 2, Math.PI / 2 ),
				...arcCommands(
					cx,
					cy,
					rt,
					cy,
					Math.PI / 2,
					( 3 * Math.PI ) / 2
				),
				{ t: 'Z' },
			];
		},
	},
	{
		id: 'spiral',
		name: () => __( 'Spiral', 'wunderpaint' ),
		params: [
			{
				key: 'turns',
				label: () => __( 'Turns', 'wunderpaint' ),
				min: 1,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.38,
				def: 0.25,
			},
		],
		commands: ( w, h, p ) => {
			// An Archimedean BAND with round caps at both ends. Two
			// defects had to go: the centre self-crossed (the inner edge
			// radius went negative and flipped to the far side) and the
			// outer end was chopped off square. So the centreline starts
			// at a radius the half-width fits inside, and each end is
			// closed by a half-circle cap around its centreline point.
			const turns = Math.round( p.turns );
			const aMax = turns * TAU;
			const U = Math.min( w, h ) / 2;
			// Gap between windings decides the band's half width.
			const pitch = U / ( turns + 0.6 );
			const half = pitch * p.thickness * 0.9;
			const r0 = half * 1.35;
			const rAt = ( a ) => r0 + ( ( U - r0 - half ) * a ) / aMax;
			const cx = w / 2;
			const cy = h / 2;
			// Centreline point and its tangent-normal frame.
			const pt = ( a, off ) => {
				const r = rAt( a ) + off;
				return { x: cx + r * Math.cos( a ), y: cy + r * Math.sin( a ) };
			};
			const steps = Math.max( 8, turns * 10 );
			const seq = [];
			for ( let i = 0; i <= steps; i++ ) {
				seq.push( ( aMax * i ) / steps );
			}
			// Hermite chain along one edge; tangents by central difference.
			const edge = ( list, off ) => {
				const out = [];
				const d = 1e-3;
				const tang = ( a ) => ( {
					x: ( pt( a + d, off ).x - pt( a - d, off ).x ) / ( 2 * d ),
					y: ( pt( a + d, off ).y - pt( a - d, off ).y ) / ( 2 * d ),
				} );
				for ( let i = 1; i < list.length; i++ ) {
					const a0 = list[ i - 1 ];
					const a1 = list[ i ];
					const s = ( a1 - a0 ) / 3;
					const t0 = tang( a0 );
					const t1 = tang( a1 );
					const q0 = pt( a0, off );
					const q1 = pt( a1, off );
					out.push( {
						t: 'C',
						c1x: q0.x + t0.x * s,
						c1y: q0.y + t0.y * s,
						c2x: q1.x - t1.x * s,
						c2y: q1.y - t1.y * s,
						x: q1.x,
						y: q1.y,
					} );
				}
				return out;
			};
			// A cap is a half turn around the centreline point, from the
			// outer edge to the inner one (radial direction is the cap's
			// diameter, so sweeping pi covers it exactly).
			const cap = ( a, dir ) => {
				const c = pt( a, 0 );
				const start = Math.atan2(
					pt( a, half ).y - c.y,
					pt( a, half ).x - c.x
				);
				return arcCommands(
					c.x,
					c.y,
					half,
					half,
					start,
					start + dir * Math.PI
				);
			};
			return [
				mv( pt( 0, half ) ),
				...edge( seq, half ),
				...cap( aMax, 1 ),
				...edge( seq.slice().reverse(), -half ),
				...cap( 0, 1 ),
				{ t: 'Z' },
			];
		},
	},
	{
		// The layers icon: the top sheet plus the visible rims below.
		id: 'layers',
		name: () => __( 'Layers', 'wunderpaint' ),
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.5,
				def: 0.34,
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.count );
			const cx = w / 2;
			const dh = h * p.depth;
			const s = n > 1 ? ( h - 2 * dh ) / ( n - 1 ) : 0;
			const cmds = roundedPolyCommands(
				[
					{ x: cx, y: 0 },
					{ x: w, y: dh },
					{ x: cx, y: 2 * dh },
					{ x: 0, y: dh },
				],
				0,
				0
			);
			for ( let i = 1; i < n; i++ ) {
				const yb = 2 * dh + i * s;
				cmds.push(
					mv( { x: 0, y: yb - dh } ),
					ln( { x: cx, y: yb } ),
					ln( { x: w, y: yb - dh } ),
					ln( { x: cx, y: yb - s * 0.45 } ),
					{ t: 'Z' }
				);
			}
			return cmds;
		},
	},
	{
		// Isometric cube; the seam dial carves the three edge gaps that
		// make it read as a solid.
		id: 'cube',
		name: () => __( 'Cube', 'wunderpaint' ),
		params: [
			{
				key: 'depth',
				label: () => __( 'Depth', 'wunderpaint' ),
				...pct,
				min: 0.25,
				max: 0.75,
				def: 0.5,
			},
			{
				key: 'seam',
				label: () => __( 'Seam', 'wunderpaint' ),
				...pct,
				max: 0.08,
				def: 0.03,
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const th = ( h * p.depth ) / 2;
			const cmds = roundedPolyCommands(
				[
					{ x: cx, y: 0 },
					{ x: w, y: th },
					{ x: w, y: h - th },
					{ x: cx, y: h },
					{ x: 0, y: h - th },
					{ x: 0, y: th },
				],
				0,
				0
			);
			const sw = Math.min( w, h ) * p.seam * 1.5;
			if ( sw > 0.5 ) {
				const mid = { x: cx, y: 2 * th };
				const gap = ( A0, B0 ) => {
					const dx0 = B0.x - A0.x;
					const dy0 = B0.y - A0.y;
					const l = Math.hypot( dx0, dy0 ) || 1;
					// Inset both ends so the seam never pokes past the
					// silhouette's edges.
					const inset = sw * 0.9;
					const A = {
						x: A0.x + ( dx0 / l ) * inset,
						y: A0.y + ( dy0 / l ) * inset,
					};
					const B = {
						x: B0.x - ( dx0 / l ) * inset,
						y: B0.y - ( dy0 / l ) * inset,
					};
					const nx = ( -dy0 / l ) * ( sw / 2 );
					const ny = ( dx0 / l ) * ( sw / 2 );
					// Counter-clockwise = a hole under nonzero filling.
					return [
						mv( { x: A.x + nx, y: A.y + ny } ),
						ln( { x: B.x + nx, y: B.y + ny } ),
						ln( { x: B.x - nx, y: B.y - ny } ),
						ln( { x: A.x - nx, y: A.y - ny } ),
						{ t: 'Z' },
					];
				};
				cmds.push( ...gap( mid, { x: cx, y: h } ) );
				cmds.push( ...gap( mid, { x: 0, y: th } ) );
				cmds.push( ...gap( mid, { x: w, y: th } ) );
			}
			return cmds;
		},
	},
	{
		id: 'target',
		name: () => __( 'Target', 'wunderpaint' ),
		params: [
			{
				key: 'rings',
				label: () => __( 'Rings', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 0.8,
				def: 0.5,
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const n = Math.round( p.rings );
			const step = 1 / n;
			const cmds = [];
			for ( let i = 0; i < n - 1; i++ ) {
				const ro = 1 - i * step;
				const ri = ro - step * p.thickness;
				cmds.push( ...ellipseSub( cx, cy, cx * ro, cy * ro ) );
				cmds.push( ...ellipseSub( cx, cy, cx * ri, cy * ri, true ) );
			}
			const core = ( 1 - ( n - 1 ) * step ) * 0.9;
			cmds.push( ...ellipseSub( cx, cy, cx * core, cy * core ) );
			return cmds;
		},
	},
	{
		// Two meshing gears, the small one driven by the ratio dial.
		id: 'gearpair',
		name: () => __( 'Gear pair', 'wunderpaint' ),
		params: [
			{
				key: 'teeth',
				label: () => __( 'Teeth', 'wunderpaint' ),
				min: 8,
				max: 16,
				step: 1,
				def: 10,
			},
			{
				key: 'ratio',
				label: () => __( 'Ratio', 'wunderpaint' ),
				...pct,
				min: 0.4,
				max: 0.75,
				def: 0.55,
			},
		],
		commands: ( w, h, p ) => {
			const gearSub = ( cx, cy, R, teeth, phase ) => {
				const pitch = TAU / teeth;
				const inner = 0.78;
				const pts = [];
				for ( let i = 0; i < teeth; i++ ) {
					const a = phase + i * pitch;
					for ( const [ f, r ] of [
						[ 0.08, inner ],
						[ 0.16, 1 ],
						[ 0.42, 1 ],
						[ 0.5, inner ],
					] ) {
						pts.push( at( cx, cy, R * r, R * r, a + f * pitch ) );
					}
				}
				const sub = roundedPolyCommands( pts, 0, 0 );
				sub.push( ...ellipseSub( cx, cy, R * 0.3, R * 0.3, true ) );
				return sub;
			};
			const R1 = 34;
			const R2 = R1 * p.ratio;
			const c1 = { x: R1, y: 100 - R1 };
			const c2 = {
				x: R1 + ( R1 + R2 ) * 0.66,
				y: 100 - R1 - ( R1 + R2 ) * 0.66,
			};
			return fitCommands(
				[
					...gearSub( c1.x, c1.y, R1, Math.round( p.teeth ), TOP ),
					...gearSub(
						c2.x,
						c2.y,
						R2,
						Math.max( 6, Math.round( p.teeth * p.ratio ) ),
						TOP + 0.3
					),
				],
				w,
				h
			);
		},
	},
	{
		// The cut gemstone silhouette: table, crown, pavilion.
		id: 'gem',
		name: () => __( 'Gem', 'wunderpaint' ),
		aspect: 1.25,
		corners: true,
		params: [
			{
				key: 'table',
				label: () => __( 'Top width', 'wunderpaint' ),
				...pct,
				min: 0.3,
				max: 0.85,
				def: 0.55,
			},
			{
				key: 'crownH',
				label: () => __( 'Crown height', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.5,
				def: 0.3,
			},
		],
		commands: ( w, h, p, c ) =>
			roundedPolyCommands(
				[
					{ x: ( w * ( 1 - p.table ) ) / 2, y: 0 },
					{ x: ( w * ( 1 + p.table ) ) / 2, y: 0 },
					{ x: w, y: h * p.crownH },
					{ x: w / 2, y: h },
					{ x: 0, y: h * p.crownH },
				],
				c.radius,
				c.smoothing
			),
	},
	{
		id: 'rhombus',
		name: () => __( 'Rhombus', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'skew',
				label: () => __( 'Skew', 'wunderpaint' ),
				min: -0.4,
				max: 0.4,
				step: 0.01,
				def: 0.18,
			},
		],
		commands: ( w, h, p, c ) => {
			const L = w * p.skew;
			return roundedPolyCommands(
				[
					{ x: w / 2 + L, y: 0 },
					{ x: w, y: h / 2 },
					{ x: w / 2 - L, y: h },
					{ x: 0, y: h / 2 },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		id: 'kite',
		name: () => __( 'Kite', 'wunderpaint' ),
		aspect: 0.8,
		corners: true,
		params: [
			{
				key: 'balance',
				label: () => __( 'Balance', 'wunderpaint' ),
				min: -0.4,
				max: 0.1,
				step: 0.01,
				def: -0.22,
			},
		],
		commands: ( w, h, p, c ) => {
			const waist = h * ( 0.5 + p.balance );
			return roundedPolyCommands(
				[
					{ x: w / 2, y: 0 },
					{ x: w, y: waist },
					{ x: w / 2, y: h },
					{ x: 0, y: waist },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// A polygon ring - the hexagon/pentagon frame, with dials.
		id: 'polyframe',
		name: () => __( 'Polygon frame', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'sidesP',
				label: () => __( 'Sides', 'wunderpaint' ),
				min: 3,
				max: 12,
				step: 1,
				def: 6,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.45,
				def: 0.14,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.sidesP );
			const outer = polygonVertices( 'polygon', w, h, n );
			const f = 1 - p.thickness * 2;
			const inner = outer
				.map( ( v ) => ( {
					x: w / 2 + ( v.x - w / 2 ) * f,
					y: h / 2 + ( v.y - h / 2 ) * f,
				} ) )
				.reverse();
			const r = Array.isArray( c.radius ) ? c.radius[ 0 ] || 0 : c.radius;
			return [
				...roundedPolyCommands( outer, r, c.smoothing ),
				...roundedPolyCommands( inner, r * f, c.smoothing ),
			];
		},
	},
	{
		// The funnel chart: stacked trapezoids narrowing downward.
		id: 'funnel',
		name: () => __( 'Funnel', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'levels',
				label: () => __( 'Levels', 'wunderpaint' ),
				min: 2,
				max: 6,
				step: 1,
				def: 4,
			},
			{
				key: 'taper',
				label: () => __( 'Taper', 'wunderpaint' ),
				...pct,
				max: 0.9,
				def: 0.25,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				max: 0.3,
				def: 0.1,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.levels );
			const band = h / n;
			const g = ( band * p.gap ) / 2;
			const wAt = ( f ) => w * ( 1 - ( 1 - p.taper ) * f );
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const y0 = i * band + g;
				const y1 = ( i + 1 ) * band - g;
				const wTop = wAt( y0 / h );
				const wBot = wAt( y1 / h );
				cmds.push(
					...roundedPolyCommands(
						[
							{ x: ( w - wTop ) / 2, y: y0 },
							{ x: ( w + wTop ) / 2, y: y0 },
							{ x: ( w + wBot ) / 2, y: y1 },
							{ x: ( w - wBot ) / 2, y: y1 },
						],
						c.radius,
						c.smoothing
					)
				);
			}
			return cmds;
		},
	},
	{
		// Chart / equalizer bars: a deterministic height profile, so the
		// same dials always draw the same bars.
		id: 'bars',
		name: () => __( 'Bars', 'wunderpaint' ),
		aspect: 1.3,
		corners: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'spread',
				label: () => __( 'Height spread', 'wunderpaint' ),
				...pct,
				max: 0.9,
				def: 0.55,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.6,
				def: 0.3,
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.count );
			const slot = w / n;
			const bw = slot * ( 1 - p.gap );
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				// Two out-of-phase sines: reads as data, not a ramp.
				const f =
					0.5 +
					0.5 * Math.sin( i * 1.9 + 0.6 ) * Math.cos( i * 0.7 + 1.1 );
				const bh = h * ( 1 - p.spread + p.spread * f );
				const x0 = i * slot + ( slot - bw ) / 2;
				cmds.push(
					...roundedPolyCommands(
						[
							{ x: x0, y: h - bh },
							{ x: x0 + bw, y: h - bh },
							{ x: x0 + bw, y: h },
							{ x: x0, y: h },
						],
						c.radius,
						c.smoothing
					)
				);
			}
			return cmds;
		},
	},
	{
		// Compass rose: long points with shorter ones between them.
		id: 'compass',
		name: () => __( 'Compass star', 'wunderpaint' ),
		params: [
			{
				key: 'points',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 3,
				max: 8,
				step: 1,
				def: 4,
			},
			{
				key: 'minor',
				label: () => __( 'Minor points', 'wunderpaint' ),
				...pct,
				max: 0.9,
				def: 0.55,
			},
			{
				key: 'waistC',
				label: () => __( 'Waist', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.5,
				def: 0.16,
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.points );
			const cx = w / 2;
			const cy = h / 2;
			const tips = 2 * n;
			const pts = [];
			for ( let i = 0; i < tips; i++ ) {
				const a = TOP + ( i / tips ) * TAU;
				const r = i % 2 ? p.minor : 1;
				pts.push( at( cx, cy, cx * r, cy * r, a ) );
				const av = a + TAU / ( 2 * tips );
				pts.push( at( cx, cy, cx * p.waistC, cy * p.waistC, av ) );
			}
			return roundedPolyCommands( pts, 0, 0 );
		},
	},
	{
		id: 'hourglass',
		name: () => __( 'Hourglass', 'wunderpaint' ),
		aspect: 0.8,
		corners: true,
		params: [
			{
				key: 'waistH',
				label: () => __( 'Waist', 'wunderpaint' ),
				...pct,
				max: 0.6,
				def: 0.12,
			},
			{
				key: 'plate',
				label: () => __( 'Plates', 'wunderpaint' ),
				...pct,
				max: 0.25,
				def: 0.08,
			},
		],
		commands: ( w, h, p, c ) => {
			const ww = ( w * p.waistH ) / 2;
			const cp = h * p.plate;
			return roundedPolyCommands(
				[
					{ x: 0, y: 0 },
					{ x: w, y: 0 },
					{ x: w, y: cp },
					{ x: w / 2 + ww, y: h / 2 },
					{ x: w, y: h - cp },
					{ x: w, y: h },
					{ x: 0, y: h },
					{ x: 0, y: h - cp },
					{ x: w / 2 - ww, y: h / 2 },
					{ x: 0, y: cp },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// Corner banner: the diagonal "sale" band across a corner.
		id: 'cornerband',
		name: () => __( 'Corner band', 'wunderpaint' ),
		corners: true,
		params: [
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.6,
				def: 0.3,
			},
			{
				key: 'inset',
				label: () => __( 'Inset', 'wunderpaint' ),
				...pct,
				max: 0.5,
				def: 0.15,
			},
		],
		commands: ( w, h, p, c ) => {
			// Distances measured along the two edges from the corner.
			const a = ( 1 - p.inset ) * ( 1 - p.thickness );
			const b = Math.min( 1, a + p.thickness );
			return roundedPolyCommands(
				[
					{ x: 0, y: h * a },
					{ x: w * a, y: 0 },
					{ x: w * b, y: 0 },
					{ x: 0, y: h * b },
				],
				c.radius,
				c.smoothing
			);
		},
	},
	{
		// The postage stamp: semicircular perforations bitten out of all
		// four edges. The notch count follows each edge's LENGTH, so a
		// wide stamp gets more teeth along the top than down its side -
		// a fixed count per edge reads as wrong immediately.
		id: 'stamp',
		name: () => __( 'Postage stamp', 'wunderpaint' ),
		aspect: 0.82,
		params: [
			{
				key: 'perfs',
				label: () => __( 'Perforations', 'wunderpaint' ),
				min: 4,
				max: 14,
				step: 1,
				def: 7,
			},
			{
				key: 'depth',
				label: () => __( 'Notch depth', 'wunderpaint' ),
				...pct,
				min: 0.3,
				max: 1,
				def: 0.75,
			},
			{
				key: 'border',
				label: () => __( 'Inner frame', 'wunderpaint' ),
				...pct,
				max: 0.4,
				def: 0,
			},
		],
		commands: ( w, h, p ) => {
			const U = Math.min( w, h );
			const dens = Math.round( p.perfs );
			const nx = Math.max( 2, Math.round( ( dens * w ) / U ) );
			const ny = Math.max( 2, Math.round( ( dens * h ) / U ) );
			const rx = ( ( w / nx ) * p.depth ) / 2;
			const ry = ( ( h / ny ) * p.depth ) / 2;
			// One notch radius for all edges keeps the teeth uniform.
			const r = Math.min( rx, ry );
			const cmds = [ { t: 'M', x: 0, y: 0 } ];
			// Each edge: straight to the notch's near lip, then a
			// half-circle bulging INWARD, then on to the next.
			const edge = ( n, len, along, angles ) => {
				for ( let i = 0; i < n; i++ ) {
					const c = ( len * ( i + 0.5 ) ) / n;
					cmds.push( ln( along( c - r ) ) );
					const q = along( c );
					cmds.push(
						...arcCommands(
							q.x,
							q.y,
							r,
							r,
							angles[ 0 ],
							angles[ 1 ]
						)
					);
				}
			};
			edge( nx, w, ( d ) => ( { x: d, y: 0 } ), [ Math.PI, 0 ] );
			cmds.push( ln( { x: w, y: 0 } ) );
			edge( ny, h, ( d ) => ( { x: w, y: d } ), [
				-Math.PI / 2,
				( -3 * Math.PI ) / 2,
			] );
			cmds.push( ln( { x: w, y: h } ) );
			edge( nx, w, ( d ) => ( { x: w - d, y: h } ), [ 0, -Math.PI ] );
			cmds.push( ln( { x: 0, y: h } ) );
			edge( ny, h, ( d ) => ( { x: 0, y: h - d } ), [
				Math.PI / 2,
				-Math.PI / 2,
			] );
			cmds.push( { t: 'Z' } );
			if ( p.border > 0.02 ) {
				// Reversed inner rectangle: the stamp becomes a frame.
				const m = U * ( r / U + p.border * 0.5 );
				cmds.push(
					mv( { x: m, y: m } ),
					ln( { x: m, y: h - m } ),
					ln( { x: w - m, y: h - m } ),
					ln( { x: w - m, y: m } ),
					{ t: 'Z' }
				);
			}
			return cmds;
		},
	},
	{
		// ONE formula, hundreds of shapes: flowers, stars, lenses, soft
		// polygons, gear discs. Four dials, and presets to aim them.
		id: 'superform',
		name: () => __( 'Superformula', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'symmetry',
				label: () => __( 'Symmetry', 'wunderpaint' ),
				min: 1,
				max: 20,
				step: 1,
				def: 6,
			},
			{
				key: 'fill1',
				label: () => __( 'Roundness', 'wunderpaint' ),
				min: 0.2,
				max: 8,
				step: 0.05,
				def: 0.6,
			},
			{
				key: 'fill2',
				label: () => __( 'Pinch', 'wunderpaint' ),
				min: 0.2,
				max: 12,
				step: 0.05,
				def: 0.4,
			},
			{
				key: 'fill3',
				label: () => __( 'Stretch', 'wunderpaint' ),
				min: 0.2,
				max: 12,
				step: 0.05,
				def: 0.4,
			},
		],
		presets: [
			{
				name: () => __( 'Flower', 'wunderpaint' ),
				params: { symmetry: 6, fill1: 0.6, fill2: 0.4, fill3: 0.4 },
			},
			{
				name: () => __( 'Star', 'wunderpaint' ),
				params: { symmetry: 5, fill1: 0.35, fill2: 0.5, fill3: 0.5 },
			},
			{
				name: () => __( 'Soft square', 'wunderpaint' ),
				params: { symmetry: 4, fill1: 4.5, fill2: 10, fill3: 10 },
			},
			{
				name: () => __( 'Gear disc', 'wunderpaint' ),
				params: { symmetry: 16, fill1: 1.7, fill2: 1.7, fill3: 1.7 },
			},
			{
				name: () => __( 'Lens', 'wunderpaint' ),
				params: { symmetry: 2, fill1: 0.5, fill2: 0.5, fill3: 0.5 },
			},
			{
				name: () => __( 'Amoeba', 'wunderpaint' ),
				params: { symmetry: 7, fill1: 1.2, fill2: 3, fill3: 1 },
			},
		],
		commands: ( w, h, p ) => {
			const S = 240;
			const pts = [];
			for ( let i = 0; i < S; i++ ) {
				const t = ( i / S ) * TAU;
				const q = ( p.symmetry * t ) / 4;
				const term =
					Math.pow( Math.abs( Math.cos( q ) ), p.fill2 ) +
					Math.pow( Math.abs( Math.sin( q ) ), p.fill3 );
				// Small exponents blow the radius up; clamp, then fit.
				const r = clamp(
					Math.pow( Math.max( 1e-6, term ), -1 / p.fill1 ),
					0,
					6
				);
				pts.push( {
					x: 50 + 50 * r * Math.cos( t ),
					y: 50 + 50 * r * Math.sin( t ),
				} );
			}
			return fitCommands( smoothRing( pts ), w, h );
		},
	},
	{
		// The organic blob: a Fourier ring with seeded harmonics, so
		// ENTROPY is one honest slider from near-circle to torn.
		id: 'blobgen',
		name: () => __( 'Organic blob', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'lobes',
				label: () => __( 'Lobes', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'entropy',
				label: () => __( 'Entropy', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
			{
				key: 'smoothness',
				label: () => __( 'Smoothness', 'wunderpaint' ),
				min: 0.6,
				max: 2.5,
				step: 0.05,
				def: 1.4,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 7,
			},
		],
		presets: [
			{
				name: () => __( 'Pebble', 'wunderpaint' ),
				params: { lobes: 4, entropy: 0.25, smoothness: 1.8, seed: 3 },
			},
			{
				name: () => __( 'Amoeba', 'wunderpaint' ),
				params: { lobes: 6, entropy: 0.6, smoothness: 1.4, seed: 12 },
			},
			{
				name: () => __( 'Splash', 'wunderpaint' ),
				params: { lobes: 11, entropy: 1, smoothness: 0.9, seed: 5 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const lobes = Math.round( p.lobes );
			const phase = [];
			for ( let k = 0; k <= lobes; k++ ) {
				phase.push( rnd() * TAU );
			}
			const pts = [];
			for ( let i = 0; i < 200; i++ ) {
				const t = ( i / 200 ) * TAU;
				let r = 1;
				for ( let k = 1; k <= lobes; k++ ) {
					r +=
						( ( p.entropy * 0.55 ) / Math.pow( k, p.smoothness ) ) *
						Math.cos( k * t + phase[ k ] );
				}
				r = Math.max( 0.05, r );
				pts.push( {
					x: 50 + 46 * r * Math.cos( t ),
					y: 50 + 46 * r * Math.sin( t ),
				} );
			}
			return fitCommands( smoothRing( pts ), w, h );
		},
	},
	{
		// Rose curve as a band: r = cos( k/d * angle ). The petal count
		// falls out of the ratio, which is why it takes two dials.
		id: 'rose',
		name: () => __( 'Rose curve', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'petalsK',
				label: () => __( 'Petals', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'petalsD',
				label: () => __( 'Ratio', 'wunderpaint' ),
				min: 1,
				max: 7,
				step: 1,
				def: 1,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.01,
				max: 0.16,
				def: 0.04,
			},
		],
		presets: [
			{
				name: () => __( 'Clover', 'wunderpaint' ),
				params: { petalsK: 4, petalsD: 1, thickness: 0.06 },
			},
			{
				name: () => __( 'Knot', 'wunderpaint' ),
				params: { petalsK: 7, petalsD: 3, thickness: 0.03 },
			},
			{
				name: () => __( 'Ribbon rose', 'wunderpaint' ),
				params: { petalsK: 5, petalsD: 2, thickness: 0.09 },
			},
		],
		commands: ( w, h, p ) => {
			const k = Math.round( p.petalsK );
			const d = Math.round( p.petalsD );
			const turns = d / gcd( k, d );
			const S = Math.min( 1400, Math.max( 320, 200 * turns ) );
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const t = ( i / S ) * TAU * turns;
				const r = Math.cos( ( k / d ) * t );
				pts.push( {
					x: 50 + 46 * r * Math.cos( t ),
					y: 50 + 46 * r * Math.sin( t ),
				} );
			}
			const half = 50 * p.thickness;
			return fitCommands(
				bandFrom( pts, () => half ),
				w,
				h
			);
		},
	},
	{
		// Spirograph / guilloche: the interlaced rosettes off banknotes,
		// drawn as a BAND so a stroke traces the outline and not every
		// internal crossing.
		id: 'guilloche',
		name: () => __( 'Guilloche', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'ringR',
				label: () => __( 'Outer wheel', 'wunderpaint' ),
				min: 3,
				max: 13,
				step: 1,
				def: 5,
			},
			{
				key: 'ringr',
				label: () => __( 'Inner wheel', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 3,
			},
			{
				key: 'pen',
				label: () => __( 'Pen offset', 'wunderpaint' ),
				min: 1,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.01,
				max: 0.1,
				def: 0.03,
			},
		],
		presets: [
			{
				name: () => __( 'Rosette', 'wunderpaint' ),
				params: { ringR: 7, ringr: 3, pen: 6, thickness: 0.03 },
			},
			{
				name: () => __( 'Star web', 'wunderpaint' ),
				params: { ringR: 11, ringr: 7, pen: 9, thickness: 0.02 },
			},
			{
				name: () => __( 'Chain', 'wunderpaint' ),
				params: { ringR: 6, ringr: 5, pen: 3, thickness: 0.06 },
			},
		],
		commands: ( w, h, p ) => {
			const R = Math.round( p.ringR );
			// The inner wheel has to be SMALLER than the outer one: at
			// R === r the rolling radius k collapses to zero and the
			// whole rosette vanished.
			const r = Math.max( 1, Math.min( Math.round( p.ringr ), R - 1 ) );
			const d = Math.round( p.pen );
			const turns = r / gcd( R, r );
			const S = Math.min( 2000, Math.max( 400, 240 * turns ) );
			const k = R - r;
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const t = ( i / S ) * TAU * turns;
				pts.push( {
					x:
						50 +
						4 *
							( k * Math.cos( t ) +
								d * Math.cos( ( k / r ) * t ) ),
					y:
						50 +
						4 *
							( k * Math.sin( t ) -
								d * Math.sin( ( k / r ) * t ) ),
				} );
			}
			const half = 50 * p.thickness;
			return fitCommands(
				bandFrom( pts, () => half ),
				w,
				h
			);
		},
	},
	{
		// Truchet tiles: a quarter-arc pair in every cell, flipped by the
		// seed - instant maze / weave art.
		id: 'truchet',
		name: () => __( 'Truchet tiles', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 4,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.08,
				max: 0.45,
				def: 0.22,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 11,
			},
		],
		presets: [
			{
				name: () => __( 'Maze', 'wunderpaint' ),
				params: { grid: 5, thickness: 0.18, seed: 4 },
			},
			{
				name: () => __( 'Ribbon weave', 'wunderpaint' ),
				params: { grid: 3, thickness: 0.4, seed: 21 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.grid );
			const rnd = seededRandom( p.seed );
			const cw = w / n;
			const ch = h / n;
			const half = ( Math.min( cw, ch ) * p.thickness ) / 2;
			const rad = Math.min( cw, ch ) / 2;
			const cmds = [];
			const quarter = ( cx, cy, a0, a1 ) => {
				const S = 10;
				const pts = [];
				for ( let i = 0; i <= S; i++ ) {
					const a = a0 + ( ( a1 - a0 ) * i ) / S;
					pts.push( {
						x: cx + rad * Math.cos( a ),
						y: cy + rad * Math.sin( a ),
					} );
				}
				return bandFrom( pts, () => half );
			};
			for ( let gy = 0; gy < n; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					const x0 = gx * cw;
					const y0 = gy * ch;
					if ( rnd() < 0.5 ) {
						cmds.push(
							...quarter( x0, y0, 0, Math.PI / 2 ),
							...quarter(
								x0 + cw,
								y0 + ch,
								Math.PI,
								( 3 * Math.PI ) / 2
							)
						);
					} else {
						cmds.push(
							...quarter( x0 + cw, y0, Math.PI / 2, Math.PI ),
							...quarter( x0, y0 + ch, ( 3 * Math.PI ) / 2, TAU )
						);
					}
				}
			}
			return cmds;
		},
	},
	{
		// Fractal edge: every edge grows a bump, over and over -
		// snowflake at zero roughness, torn paper at high.
		id: 'fractal',
		name: () => __( 'Fractal edge', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'sidesF',
				label: () => __( 'Sides', 'wunderpaint' ),
				min: 3,
				max: 8,
				step: 1,
				def: 3,
			},
			{
				key: 'depthF',
				label: () => __( 'Iterations', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 3,
			},
			{
				key: 'roughness',
				label: () => __( 'Roughness', 'wunderpaint' ),
				...pct,
				def: 0.35,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 5,
			},
		],
		presets: [
			{
				name: () => __( 'Snowflake', 'wunderpaint' ),
				params: { sidesF: 3, depthF: 4, roughness: 0, seed: 1 },
			},
			{
				name: () => __( 'Torn edge', 'wunderpaint' ),
				params: { sidesF: 6, depthF: 3, roughness: 0.8, seed: 9 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			let ring = polygonVertices(
				'polygon',
				100,
				100,
				Math.round( p.sidesF )
			);
			const iters = Math.round( p.depthF );
			for ( let it = 0; it < iters; it++ ) {
				const next = [];
				for ( let i = 0; i < ring.length; i++ ) {
					const a = ring[ i ];
					const b = ring[ ( i + 1 ) % ring.length ];
					const dx = b.x - a.x;
					const dy = b.y - a.y;
					const p1 = { x: a.x + dx / 3, y: a.y + dy / 3 };
					const p2 = {
						x: a.x + ( 2 * dx ) / 3,
						y: a.y + ( 2 * dy ) / 3,
					};
					// Koch tip along the edge normal; roughness jitters
					// its height and its sideways lean.
					// Roughness varies how FAR the tip reaches, never
					// its direction: a negative height flipped tips
					// inward and the outline turned to spiky dust.
					const hgt =
						( Math.sqrt( 3 ) / 6 ) *
						Math.max(
							0.25,
							1 + p.roughness * ( rnd() - 0.5 ) * 1.6
						);
					const lean = p.roughness * ( rnd() - 0.5 ) * 0.3;
					next.push(
						a,
						p1,
						{
							// OUTWARD normal: polygonVertices winds
							// clockwise in screen space, where ( dy, -dx )
							// points away from the centre. The other sign
							// grew tips inward and drew Koch's ANTI-
							// snowflake instead of the snowflake.
							x: ( p1.x + p2.x ) / 2 + dy * hgt + dx * lean,
							y: ( p1.y + p2.y ) / 2 - dx * hgt + dy * lean,
						},
						p2
					);
				}
				ring = next;
			}
			return fitCommands( roundedPolyCommands( ring, 0, 0 ), w, h );
		},
	},
	{
		// A real brush stroke: tapered band with a pressure profile and a
		// seeded wobble for the dry-brush look.
		id: 'stroke',
		name: () => __( 'Brush stroke', 'wunderpaint' ),
		generator: true,
		aspect: 3.2,
		params: [
			{
				key: 'curve',
				label: () => __( 'Sweep', 'wunderpaint' ),
				min: -1,
				max: 1,
				step: 0.01,
				def: 0.35,
			},
			{
				key: 'widthS',
				label: () => __( 'Width', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 1,
				def: 0.5,
			},
			{
				key: 'taper',
				label: () => __( 'Taper', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 0.05,
				def: 2,
			},
			{
				key: 'lift',
				label: () => __( 'Pressure point', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.5,
			},
			{
				key: 'wobble',
				label: () => __( 'Wobble', 'wunderpaint' ),
				...pct,
				def: 0.2,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 3,
			},
		],
		presets: [
			{
				name: () => __( 'Ink brush', 'wunderpaint' ),
				params: {
					curve: 0.35,
					widthS: 0.5,
					taper: 2,
					lift: 0.5,
					wobble: 0.2,
				},
			},
			{
				name: () => __( 'Dry brush', 'wunderpaint' ),
				params: {
					curve: 0.2,
					widthS: 0.6,
					taper: 2,
					lift: 0.5,
					wobble: 1,
				},
			},
			{
				name: () => __( 'Underline', 'wunderpaint' ),
				params: {
					curve: 0.12,
					widthS: 0.26,
					taper: 2.2,
					lift: 0.55,
					wobble: 0.15,
				},
			},
			{
				name: () => __( 'Swash', 'wunderpaint' ),
				params: {
					curve: 1,
					widthS: 0.5,
					taper: 2.4,
					lift: 0.4,
					wobble: 0.1,
				},
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const ph = [ rnd() * TAU, rnd() * TAU ];
			const maxHalf = ( h * p.widthS ) / 2;
			const pts = [];
			for ( let i = 0; i <= 200; i++ ) {
				const u = i / 200;
				const y =
					h * 0.5 +
					h * p.curve * 0.32 * Math.sin( Math.PI * u - Math.PI / 2 ) +
					h *
						p.wobble *
						0.05 *
						Math.sin( 4.1 * Math.PI * u + ph[ 0 ] );
				pts.push( { x: maxHalf + ( w - 2 * maxHalf ) * u, y } );
			}
			const prof = ( u ) => {
				const c = clamp( p.lift, 0.05, 0.95 );
				const s = u < c ? u / c : ( 1 - u ) / ( 1 - c );
				return Math.pow( Math.max( 0, s ), 1 / p.taper );
			};
			return fitCommands(
				bandFrom(
					pts,
					( u ) =>
						maxHalf *
						( 0.06 + 0.94 * prof( u ) ) *
						( 1 +
							p.wobble *
								0.3 *
								Math.sin( 6.3 * Math.PI * u + ph[ 1 ] ) )
				),
				w,
				h
			);
		},
	},
	{
		id: 'splat',
		name: () => __( 'Ink splat', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'drops',
				label: () => __( 'Droplets', 'wunderpaint' ),
				min: 0,
				max: 12,
				step: 1,
				def: 6,
			},
			{
				key: 'entropy',
				label: () => __( 'Entropy', 'wunderpaint' ),
				...pct,
				min: 0.2,
				def: 0.7,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 7,
			},
		],
		presets: [
			{
				name: () => __( 'Blot', 'wunderpaint' ),
				params: { drops: 2, entropy: 0.4, seed: 2 },
			},
			{
				name: () => __( 'Splatter', 'wunderpaint' ),
				params: { drops: 11, entropy: 1, seed: 13 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const lobes = 7;
			const phase = [];
			for ( let k = 0; k <= lobes; k++ ) {
				phase.push( rnd() * TAU );
			}
			const body = [];
			for ( let i = 0; i < 160; i++ ) {
				const t = ( i / 160 ) * TAU;
				let r = 1;
				for ( let k = 1; k <= lobes; k++ ) {
					r +=
						( ( ( 0.3 + p.entropy * 0.5 ) * 0.55 ) /
							Math.pow( k, 1.2 ) ) *
						Math.cos( k * t + phase[ k ] );
				}
				r = Math.max( 0.05, r );
				body.push( {
					x: 50 + 30 * r * Math.cos( t ),
					y: 50 + 30 * r * Math.sin( t ),
				} );
			}
			const cmds = smoothRing( body );
			const drops = Math.round( p.drops );
			for ( let i = 0; i < drops; i++ ) {
				const a = rnd() * TAU;
				const dist = 34 + rnd() * 16 * ( 0.4 + p.entropy );
				const rr = 1.4 + rnd() * 4.5 * p.entropy;
				const cx = 50 + dist * Math.cos( a );
				const cy = 50 + dist * Math.sin( a );
				const ring = [];
				for ( let k = 0; k < 14; k++ ) {
					const t = ( k / 14 ) * TAU;
					const wob = 1 + 0.25 * p.entropy * Math.sin( 3 * t + a );
					ring.push( {
						x: cx + rr * wob * Math.cos( t ),
						y: cy + rr * wob * Math.sin( t ),
					} );
				}
				cmds.push( ...smoothRing( ring ) );
			}
			return fitCommands( cmds, w, h );
		},
	},
	{
		id: 'shard',
		name: () => __( 'Crystal shard', 'wunderpaint' ),
		generator: true,
		corners: true,
		params: [
			{
				key: 'sidesS',
				label: () => __( 'Sides', 'wunderpaint' ),
				min: 3,
				max: 12,
				step: 1,
				def: 7,
			},
			{
				key: 'jitter',
				label: () => __( 'Jitter', 'wunderpaint' ),
				...pct,
				max: 0.9,
				def: 0.45,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 11,
			},
		],
		presets: [
			{
				name: () => __( 'Gemstone', 'wunderpaint' ),
				params: { sidesS: 5, jitter: 0.25, seed: 2 },
			},
			{
				name: () => __( 'Shatter', 'wunderpaint' ),
				params: { sidesS: 9, jitter: 0.85, seed: 17 },
			},
		],
		commands: ( w, h, p, c ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.sidesS );
			const pts = [];
			for ( let i = 0; i < n; i++ ) {
				const a =
					( i / n ) * TAU - Math.PI / 2 + ( rnd() - 0.5 ) * p.jitter;
				const r = 50 * ( 1 - rnd() * p.jitter );
				pts.push( {
					x: 50 + r * Math.cos( a ),
					y: 50 + r * Math.sin( a ),
				} );
			}
			const rr = Array.isArray( c.radius )
				? ( c.radius[ 0 ] || 0 ) / 2
				: ( c.radius || 0 ) / 2;
			return fitCommands(
				roundedPolyCommands( pts, rr, c.smoothing ),
				w,
				h
			);
		},
	},
	{
		// A scatter field: confetti, halftone dots, star dust. ONE shape
		// with many subpaths, so it fills, strokes and exports as one.
		id: 'scatter',
		name: () => __( 'Scatter field', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 4,
				max: 80,
				step: 1,
				def: 24,
			},
			{
				key: 'sizeS',
				label: () => __( 'Size', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.3,
				def: 0.09,
			},
			{
				key: 'variance',
				label: () => __( 'Variance', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
			{
				key: 'squares',
				label: () => __( 'Squares', 'wunderpaint' ),
				min: 0,
				max: 1,
				step: 1,
				def: 0,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 5,
			},
		],
		presets: [
			{
				name: () => __( 'Confetti', 'wunderpaint' ),
				params: {
					count: 30,
					sizeS: 0.1,
					variance: 0.7,
					squares: 1,
					seed: 8,
				},
			},
			{
				name: () => __( 'Star dust', 'wunderpaint' ),
				params: {
					count: 70,
					sizeS: 0.04,
					variance: 0.8,
					squares: 0,
					seed: 3,
				},
			},
			{
				name: () => __( 'Halftone', 'wunderpaint' ),
				params: {
					count: 40,
					sizeS: 0.12,
					variance: 0,
					squares: 0,
					seed: 1,
				},
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.count );
			// A jittered GRID, so the field covers the box evenly instead
			// of clumping the way pure randomness does.
			const cols = Math.max(
				1,
				Math.round( Math.sqrt( ( n * w ) / h ) )
			);
			const rows = Math.max( 1, Math.ceil( n / cols ) );
			const cw = w / cols;
			const ch = h / rows;
			const base = Math.min( w, h ) * p.sizeS * 0.5;
			const cmds = [];
			let made = 0;
			for ( let gy = 0; gy < rows && made < n; gy++ ) {
				for ( let gx = 0; gx < cols && made < n; gx++ ) {
					made++;
					const jx = ( rnd() - 0.5 ) * cw * 0.7 * p.variance;
					const jy = ( rnd() - 0.5 ) * ch * 0.7 * p.variance;
					const cx = clamp( ( gx + 0.5 ) * cw + jx, base, w - base );
					const cy = clamp( ( gy + 0.5 ) * ch + jy, base, h - base );
					const r = base * ( 1 - p.variance * 0.6 * rnd() );
					if ( p.squares > 0.5 ) {
						const a = rnd() * TAU * p.variance;
						const co = Math.cos( a ) * r;
						const si = Math.sin( a ) * r;
						cmds.push(
							mv( { x: cx - co + si, y: cy - si - co } ),
							ln( { x: cx + co + si, y: cy + si - co } ),
							ln( { x: cx + co - si, y: cy + si + co } ),
							ln( { x: cx - co - si, y: cy - si + co } ),
							{ t: 'Z' }
						);
					} else {
						cmds.push( ...ellipseSub( cx, cy, r, r ) );
					}
				}
			}
			return cmds;
		},
	},
	{
		// Section divider: a wave band across the full width.
		id: 'divider',
		name: () => __( 'Wave divider', 'wunderpaint' ),
		generator: true,
		aspect: 4,
		params: [
			{
				key: 'waves',
				label: () => __( 'Waves', 'wunderpaint' ),
				min: 1,
				max: 6,
				step: 1,
				def: 2,
			},
			{
				key: 'amp',
				label: () => __( 'Amplitude', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 1,
				def: 0.5,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.7,
				def: 0.25,
			},
			{
				key: 'decay',
				label: () => __( 'Decay', 'wunderpaint' ),
				...pct,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Ripple', 'wunderpaint' ),
				params: { waves: 4, amp: 0.35, thickness: 0.12, decay: 0 },
			},
			{
				name: () => __( 'Tail off', 'wunderpaint' ),
				params: { waves: 3, amp: 0.7, thickness: 0.35, decay: 0.9 },
			},
		],
		commands: ( w, h, p ) => {
			// The band width follows the thickness dial but never exceeds
			// what the SHORT box side holds (a tall narrow drag turned
			// the band wider than its own box).
			const half = Math.min( h * p.thickness, w * 0.3 ) / 2;
			const amp = ( h / 2 - half ) * p.amp;
			const k = Math.round( p.waves );
			const pts = [];
			for ( let i = 0; i <= 220; i++ ) {
				const u = i / 220;
				pts.push( {
					// Inset by the band's own half width: at a steep end
					// tangent the normal points sideways, and the cap
					// would otherwise stick out of the box.
					x: half + ( w - 2 * half ) * u,
					y: h / 2 + amp * Math.sin( TAU * k * u ),
				} );
			}
			return bandFrom( pts, ( u ) => half * ( 1 - p.decay * u * 0.9 ) );
		},
	},
	{
		// Retro sunburst FAN: rays over an angular span (the Sun shape is
		// the full disc with a core).
		id: 'rays',
		name: () => __( 'Ray fan', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'rays',
				label: () => __( 'Rays', 'wunderpaint' ),
				min: 3,
				max: 28,
				step: 1,
				def: 12,
			},
			{
				key: 'span',
				label: () => __( 'Span', 'wunderpaint' ),
				min: 30,
				max: 360,
				step: 1,
				def: 360,
				deg: true,
			},
			{
				key: 'rayW',
				label: () => __( 'Ray width', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 0.9,
				def: 0.5,
			},
			{
				key: 'inner',
				label: () => __( 'Inner radius', 'wunderpaint' ),
				...pct,
				max: 0.8,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Sunburst', 'wunderpaint' ),
				params: { rays: 16, span: 360, rayW: 0.5, inner: 0 },
			},
			{
				name: () => __( 'Spotlight', 'wunderpaint' ),
				params: { rays: 7, span: 120, rayW: 0.55, inner: 0.1 },
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const n = Math.round( p.rays );
			const full = p.span >= 359.5;
			const spanRad = ( p.span * Math.PI ) / 180;
			const step = full ? TAU / n : spanRad / n;
			const start = TOP - ( full ? 0 : spanRad / 2 ) + step / 2;
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const a = start + i * step;
				const hw = ( step * p.rayW ) / 2;
				const ri = p.inner;
				const inHw = hw * ( ri ? 1 : 0.4 );
				cmds.push(
					mv( at( cx, cy, cx * ri, cy * ri, a - inHw ) ),
					ln( at( cx, cy, cx, cy, a - hw ) ),
					ln( at( cx, cy, cx, cy, a + hw ) ),
					ln( at( cx, cy, cx * ri, cy * ri, a + inHw ) ),
					{ t: 'Z' }
				);
			}
			return cmds;
		},
	},
	{
		// Lissajous knot: two sine frequencies against each other.
		id: 'lissajous',
		name: () => __( 'Lissajous knot', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'freqA',
				label: () => __( 'Frequency A', 'wunderpaint' ),
				min: 1,
				max: 9,
				step: 1,
				def: 3,
			},
			{
				key: 'freqB',
				label: () => __( 'Frequency B', 'wunderpaint' ),
				min: 1,
				max: 9,
				step: 1,
				def: 2,
			},
			{
				key: 'phase',
				label: () => __( 'Phase', 'wunderpaint' ),
				min: 0,
				max: 180,
				step: 1,
				def: 90,
				deg: true,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.01,
				max: 0.14,
				def: 0.04,
			},
		],
		presets: [
			{
				name: () => __( 'Trefoil', 'wunderpaint' ),
				params: { freqA: 3, freqB: 2, phase: 90, thickness: 0.05 },
			},
			{
				name: () => __( 'Weave', 'wunderpaint' ),
				params: { freqA: 5, freqB: 4, phase: 90, thickness: 0.03 },
			},
			{
				name: () => __( 'Infinity', 'wunderpaint' ),
				params: { freqA: 1, freqB: 2, phase: 90, thickness: 0.1 },
			},
		],
		commands: ( w, h, p ) => {
			const a = Math.round( p.freqA );
			const b = Math.round( p.freqB );
			const ph = ( p.phase * Math.PI ) / 180;
			const S = 600;
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const t = ( i / S ) * TAU;
				pts.push( {
					x: 50 + 46 * Math.sin( a * t + ph ),
					y: 50 + 46 * Math.sin( b * t ),
				} );
			}
			const half = 50 * p.thickness;
			return fitCommands(
				bandFrom( pts, () => half ),
				w,
				h
			);
		},
	},
	{
		// Star polygon { n / k }: every k-th vertex of an n-ring. At
		// thickness 0 it fills solid (nonzero winding), above it becomes
		// the woven outline.
		id: 'starpoly',
		name: () => __( 'Star polygon', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'pointsN',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 5,
				max: 24,
				step: 1,
				def: 7,
			},
			{
				key: 'skip',
				label: () => __( 'Skip', 'wunderpaint' ),
				min: 2,
				max: 11,
				step: 1,
				def: 3,
			},
			{
				key: 'thickness',
				label: () => __( 'Line width', 'wunderpaint' ),
				...pct,
				max: 0.12,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Pentagram', 'wunderpaint' ),
				params: { pointsN: 5, skip: 2, thickness: 0 },
			},
			{
				name: () => __( 'Woven star', 'wunderpaint' ),
				params: { pointsN: 12, skip: 5, thickness: 0.03 },
			},
			{
				name: () => __( 'Compass web', 'wunderpaint' ),
				params: { pointsN: 16, skip: 7, thickness: 0.02 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.pointsN );
			// Skip must be coprime-ish and below n/2, or the walk closes
			// after two vertices and draws a line.
			const k = clamp(
				Math.round( p.skip ),
				2,
				Math.floor( ( n - 1 ) / 2 )
			);
			const cx = w / 2;
			const cy = h / 2;
			const step = gcd( n, k );
			const loops = step;
			const pts = [];
			for ( let l = 0; l < loops; l++ ) {
				for ( let i = 0; i <= n / step; i++ ) {
					const idx = ( l + i * k ) % n;
					pts.push( at( cx, cy, cx, cy, TOP + ( idx / n ) * TAU ) );
				}
			}
			if ( p.thickness > 0.005 ) {
				const half = Math.min( cx, cy ) * p.thickness;
				// The band's offset sticks past the tips; fit it back.
				return fitCommands(
					bandFrom( pts, () => half ),
					w,
					h
				);
			}
			return roundedPolyCommands( pts, 0, 0 );
		},
	},
	{
		// Phyllotaxis: the golden-angle spiral every sunflower grows.
		id: 'phyllotaxis',
		name: () => __( 'Sunflower spiral', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Seeds', 'wunderpaint' ),
				min: 20,
				max: 240,
				step: 1,
				def: 120,
			},
			{
				key: 'dotSize',
				label: () => __( 'Dot size', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1.4,
				def: 0.8,
			},
			{
				key: 'angle',
				label: () => __( 'Divergence', 'wunderpaint' ),
				min: 130,
				max: 145,
				step: 0.1,
				def: 137.5,
				deg: true,
			},
			{
				key: 'grow',
				label: () => __( 'Growth', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
		],
		presets: [
			{
				name: () => __( 'Sunflower', 'wunderpaint' ),
				params: { count: 140, dotSize: 0.8, angle: 137.5, grow: 0.5 },
			},
			{
				name: () => __( 'Pine cone', 'wunderpaint' ),
				params: { count: 70, dotSize: 1.1, angle: 137.5, grow: 0.8 },
			},
			{
				name: () => __( 'Detuned', 'wunderpaint' ),
				params: { count: 160, dotSize: 0.7, angle: 140, grow: 0.4 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.count );
			const golden = ( p.angle * Math.PI ) / 180;
			const cx = w / 2;
			const cy = h / 2;
			// Dots sit at r = c * sqrt( i ), so the disc fills evenly.
			const c = 1 / Math.sqrt( n );
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const f = Math.sqrt( i ) * c;
				const a = i * golden;
				const rr =
					( Math.min( cx, cy ) / Math.sqrt( n ) ) *
					p.dotSize *
					( 0.6 + p.grow * f * 1.4 );
				// Place on ( radius - own dot radius ), or the rim dots
				// hang out of the box.
				cmds.push(
					...ellipseSub(
						cx + Math.max( 0, cx - rr ) * f * Math.cos( a ),
						cy + Math.max( 0, cy - rr ) * f * Math.sin( a ),
						rr,
						rr
					)
				);
			}
			return cmds;
		},
	},
	{
		// Mandala: one petal, rotated around rings.
		id: 'mandala',
		name: () => __( 'Mandala', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'repeats',
				label: () => __( 'Repeats', 'wunderpaint' ),
				min: 4,
				max: 24,
				step: 1,
				def: 12,
			},
			{
				key: 'rings',
				label: () => __( 'Rings', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
			{
				key: 'petalW',
				label: () => __( 'Petal width', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.4,
			},
			{
				key: 'core',
				label: () => __( 'Core', 'wunderpaint' ),
				...pct,
				max: 0.5,
				def: 0.12,
			},
		],
		presets: [
			{
				name: () => __( 'Lotus', 'wunderpaint' ),
				params: { repeats: 16, rings: 3, petalW: 0.35, core: 0.14 },
			},
			{
				name: () => __( 'Rosette', 'wunderpaint' ),
				params: { repeats: 8, rings: 1, petalW: 0.75, core: 0.2 },
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const reps = Math.round( p.repeats );
			const rings = Math.round( p.rings );
			const cmds = [];
			if ( p.core > 0.02 ) {
				cmds.push( ...ellipseSub( cx, cy, cx * p.core, cy * p.core ) );
			}
			for ( let ring = 0; ring < rings; ring++ ) {
				const inner = p.core + ( ( 1 - p.core ) * ring ) / rings;
				const outer =
					p.core + ( ( 1 - p.core ) * ( ring + 1 ) ) / rings;
				const spin = ring % 2 ? Math.PI / reps : 0;
				for ( let i = 0; i < reps; i++ ) {
					const a = TOP + ( i / reps ) * TAU + spin;
					// A petal: two arcs meeting at inner and outer tip,
					// swept sideways by the width dial.
					const halfA = ( TAU / reps ) * p.petalW * 0.5;
					const ring20 = [];
					for ( let s = 0; s <= 12; s++ ) {
						const u = s / 12;
						const rad = inner + ( outer - inner ) * u;
						const bow = Math.sin( Math.PI * u ) * halfA;
						ring20.push(
							at( cx, cy, cx * rad, cy * rad, a + bow )
						);
					}
					for ( let s = 12; s >= 0; s-- ) {
						const u = s / 12;
						const rad = inner + ( outer - inner ) * u;
						const bow = Math.sin( Math.PI * u ) * halfA;
						ring20.push(
							at( cx, cy, cx * rad, cy * rad, a - bow )
						);
					}
					cmds.push( ...smoothRing( ring20 ) );
				}
			}
			// The sideways bow can reach past the box on extreme
			// aspect ratios; one fit at the end settles it.
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Spiral galaxy: logarithmic arms, tapering outward.
		id: 'galaxy',
		name: () => __( 'Spiral arms', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'arms',
				label: () => __( 'Arms', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 3,
			},
			{
				key: 'twist',
				label: () => __( 'Twist', 'wunderpaint' ),
				min: 0.3,
				max: 1.6,
				step: 0.01,
				def: 0.8,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.3,
				def: 0.13,
			},
			{
				key: 'core',
				label: () => __( 'Core', 'wunderpaint' ),
				...pct,
				max: 0.5,
				def: 0.16,
			},
		],
		presets: [
			{
				name: () => __( 'Galaxy', 'wunderpaint' ),
				params: { arms: 2, twist: 1.1, thickness: 0.16, core: 0.2 },
			},
			{
				name: () => __( 'Pinwheel', 'wunderpaint' ),
				params: { arms: 6, twist: 0.5, thickness: 0.1, core: 0.06 },
			},
		],
		commands: ( w, h, p ) => {
			const cx = w / 2;
			const cy = h / 2;
			const arms = Math.round( p.arms );
			const U = Math.min( cx, cy );
			const half = U * p.thickness;
			const rIn = Math.max( 0.04, p.core );
			const cmds = [];
			if ( p.core > 0.02 ) {
				cmds.push( ...ellipseSub( cx, cy, cx * p.core, cy * p.core ) );
			}
			for ( let a = 0; a < arms; a++ ) {
				const base = TOP + ( a / arms ) * TAU;
				const pts = [];
				const S = 44;
				for ( let i = 0; i <= S; i++ ) {
					const u = i / S;
					// Logarithmic growth from the core to the rim, with
					// the half width kept inside the box.
					const rad = rIn + ( 1 - rIn - p.thickness ) * u;
					const ang = base + p.twist * TAU * u;
					pts.push( {
						x: cx + cx * rad * Math.cos( ang ),
						y: cy + cy * rad * Math.sin( ang ),
					} );
				}
				cmds.push(
					...bandFrom( pts, ( u ) => half * ( 1 - 0.8 * u ) )
				);
			}
			return cmds;
		},
	},
	{
		// Honeycomb: hexagon rings, solid or hollow.
		id: 'honeycomb',
		name: () => __( 'Honeycomb', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'rings',
				label: () => __( 'Rings', 'wunderpaint' ),
				min: 1,
				max: 4,
				step: 1,
				def: 2,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.4,
				def: 0.12,
			},
			{
				key: 'hollow',
				label: () => __( 'Hollow', 'wunderpaint' ),
				...pct,
				max: 0.45,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Solid comb', 'wunderpaint' ),
				params: { rings: 2, gap: 0.1, hollow: 0 },
			},
			{
				name: () => __( 'Wire comb', 'wunderpaint' ),
				params: { rings: 3, gap: 0.08, hollow: 0.3 },
			},
		],
		commands: ( w, h, p ) => {
			const rings = Math.round( p.rings );
			// Axial hex coordinates out to `rings`, pointy-top layout.
			const cells = [];
			for ( let q = -rings; q <= rings; q++ ) {
				for ( let r = -rings; r <= rings; r++ ) {
					if ( Math.abs( q + r ) <= rings ) {
						cells.push( [ q, r ] );
					}
				}
			}
			const span = 2 * rings + 1;
			// Pointy-top hexes are 2R tall and sqrt(3)R wide, and the
			// rows overlap by 1.5R - so the vertical budget is
			// ( 1.5 * span + 0.5 ) * R, not 1.5 * span.
			const R = Math.min(
				w / ( span * Math.sqrt( 3 ) ),
				h / ( 1.5 * span + 0.5 )
			);
			const cmds = [];
			for ( const [ q, r ] of cells ) {
				const cx = w / 2 + R * Math.sqrt( 3 ) * ( q + r / 2 );
				const cy = h / 2 + R * 1.5 * r;
				const rad = R * ( 1 - p.gap );
				const hexAt = ( f ) => {
					const pts = [];
					for ( let i = 0; i < 6; i++ ) {
						const a = TOP + ( i / 6 ) * TAU;
						pts.push( {
							x: cx + rad * f * Math.cos( a ),
							y: cy + rad * f * Math.sin( a ),
						} );
					}
					return pts;
				};
				cmds.push( ...roundedPolyCommands( hexAt( 1 ), 0, 0 ) );
				if ( p.hollow > 0.02 ) {
					cmds.push(
						...roundedPolyCommands(
							hexAt( 1 - p.hollow * 2 ).reverse(),
							0,
							0
						)
					);
				}
			}
			return cmds;
		},
	},
	{
		// A branching structure: tree, lightning, coral - depth, angle
		// and a seeded jitter decide which.
		id: 'branch',
		name: () => __( 'Branches', 'wunderpaint' ),
		generator: true,
		aspect: 0.85,
		params: [
			{
				key: 'depthB',
				label: () => __( 'Depth', 'wunderpaint' ),
				min: 2,
				max: 6,
				step: 1,
				def: 5,
			},
			{
				key: 'angleB',
				label: () => __( 'Branch angle', 'wunderpaint' ),
				min: 8,
				max: 60,
				step: 1,
				def: 26,
				deg: true,
			},
			{
				key: 'splits',
				label: () => __( 'Splits', 'wunderpaint' ),
				min: 2,
				max: 3,
				step: 1,
				def: 2,
			},
			{
				key: 'jitter',
				label: () => __( 'Jitter', 'wunderpaint' ),
				...pct,
				def: 0.3,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 4,
			},
		],
		presets: [
			{
				name: () => __( 'Tree', 'wunderpaint' ),
				params: {
					depthB: 5,
					angleB: 26,
					splits: 2,
					jitter: 0.3,
					seed: 4,
				},
			},
			{
				name: () => __( 'Lightning', 'wunderpaint' ),
				params: {
					depthB: 6,
					angleB: 14,
					splits: 2,
					jitter: 0.9,
					seed: 17,
				},
			},
			{
				name: () => __( 'Coral', 'wunderpaint' ),
				params: {
					depthB: 4,
					angleB: 48,
					splits: 3,
					jitter: 0.5,
					seed: 8,
				},
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const depth = Math.round( p.depthB );
			const splits = Math.round( p.splits );
			const spread = ( p.angleB * Math.PI ) / 180;
			const cmds = [];
			// Segments are quads: a straight taper from base to tip.
			const seg = ( x0, y0, x1, y1, wBase, wTip ) => {
				const dx = x1 - x0;
				const dy = y1 - y0;
				const l = Math.hypot( dx, dy ) || 1;
				const nx = -dy / l;
				const ny = dx / l;
				cmds.push(
					mv( { x: x0 + nx * wBase, y: y0 + ny * wBase } ),
					ln( { x: x1 + nx * wTip, y: y1 + ny * wTip } ),
					ln( { x: x1 - nx * wTip, y: y1 - ny * wTip } ),
					ln( { x: x0 - nx * wBase, y: y0 - ny * wBase } ),
					{ t: 'Z' }
				);
			};
			const grow = ( x, y, ang, len, wid, level ) => {
				const x1 = x + Math.cos( ang ) * len;
				const y1 = y + Math.sin( ang ) * len;
				seg( x, y, x1, y1, wid, wid * 0.68 );
				if ( level >= depth ) {
					return;
				}
				for ( let i = 0; i < splits; i++ ) {
					const side =
						splits > 1 ? ( i / ( splits - 1 ) ) * 2 - 1 : 0;
					const jit = ( rnd() - 0.5 ) * spread * p.jitter * 2;
					grow(
						x1,
						y1,
						ang + side * spread + jit,
						len * ( 0.72 - 0.06 * rnd() * p.jitter ),
						wid * 0.66,
						level + 1
					);
				}
			};
			grow( 50, 100, -Math.PI / 2, 26, 3.2, 1 );
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Metaballs: seeded circles that MERGE into one liquid outline.
		// The union comes from marching squares over the scalar field -
		// arc intersection maths only works for a ring of circles.
		id: 'metaball',
		name: () => __( 'Metaballs', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'balls',
				label: () => __( 'Balls', 'wunderpaint' ),
				min: 2,
				max: 8,
				step: 1,
				def: 4,
			},
			{
				key: 'spread',
				label: () => __( 'Spread', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 1,
				def: 0.55,
			},
			{
				key: 'merge',
				label: () => __( 'Merge', 'wunderpaint' ),
				...pct,
				min: 0.15,
				max: 1,
				def: 0.55,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 9,
			},
		],
		presets: [
			{
				name: () => __( 'Lava', 'wunderpaint' ),
				params: { balls: 3, spread: 0.55, merge: 0.85, seed: 6 },
			},
			{
				name: () => __( 'Cluster', 'wunderpaint' ),
				params: { balls: 7, spread: 0.9, merge: 0.6, seed: 14 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.balls );
			// Radius vs spacing decides everything here: the first cut
			// gave every ball a radius bigger than its neighbour's
			// distance, so any count merged into one plain circle.
			const ringDist = 12 + 34 * p.spread;
			const base = 24 / Math.sqrt( n );
			const balls = [];
			for ( let i = 0; i < n; i++ ) {
				const ang = ( i / n ) * TAU + rnd() * 0.7;
				const d = ringDist * ( 0.75 + rnd() * 0.5 );
				balls.push( {
					x: 50 + d * Math.cos( ang ),
					y: 50 + d * Math.sin( ang ),
					r: Math.min(
						26,
						base * ( 0.7 + 1.3 * p.merge ) * ( 0.8 + 0.4 * rnd() )
					),
				} );
			}
			const field = ( x, y ) => {
				let v = 0;
				for ( const ball of balls ) {
					const dx = x - ball.x;
					const dy = y - ball.y;
					v +=
						( ball.r * ball.r ) /
						Math.max( 1e-3, dx * dx + dy * dy );
				}
				return v;
			};
			// Marching squares over the scalar field, then chain the
			// segments into loops. Neighbouring cells compute the shared
			// edge crossing from the SAME two corner values, so their
			// endpoints match exactly and can be keyed.
			// The grid must be BIGGER than the balls reach, or a
			// contour leaves it, the chain never closes and smoothRing
			// shuts it with a straight chord across the shape.
			const cmds = [];
			for ( const chain of isoContours( field, 1, -18, 136, 72 ) ) {
				// Sub-pixel scraps are noise, not shapes.
				if ( chain.length > 10 ) {
					cmds.push( ...smoothRing( chain ) );
				}
			}
			return cmds.length ? fitCommands( cmds, w, h ) : [];
		},
	},
	{
		// A fractal skyline: midpoint displacement across the width.
		id: 'skyline',
		name: () => __( 'Ridge line', 'wunderpaint' ),
		generator: true,
		aspect: 1.8,
		params: [
			{
				key: 'detail',
				label: () => __( 'Detail', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 5,
			},
			{
				key: 'roughness',
				label: () => __( 'Roughness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				def: 0.55,
			},
			{
				key: 'height',
				label: () => __( 'Height', 'wunderpaint' ),
				...pct,
				min: 0.2,
				def: 0.7,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 6,
			},
		],
		presets: [
			{
				name: () => __( 'Mountains', 'wunderpaint' ),
				params: { detail: 5, roughness: 0.55, height: 0.75, seed: 6 },
			},
			{
				name: () => __( 'Rolling hills', 'wunderpaint' ),
				params: { detail: 3, roughness: 0.3, height: 0.45, seed: 21 },
			},
			{
				name: () => __( 'Jagged rocks', 'wunderpaint' ),
				params: { detail: 7, roughness: 0.95, height: 0.85, seed: 33 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const steps = Math.round( p.detail );
			let ys = [ 0.35 + rnd() * 0.3, 0.35 + rnd() * 0.3 ];
			let amp = 0.5 * p.roughness;
			for ( let it = 0; it < steps; it++ ) {
				const next = [];
				for ( let i = 0; i < ys.length - 1; i++ ) {
					next.push( ys[ i ] );
					next.push(
						( ys[ i ] + ys[ i + 1 ] ) / 2 + ( rnd() - 0.5 ) * amp
					);
				}
				next.push( ys[ ys.length - 1 ] );
				ys = next;
				amp *= 0.55;
			}
			const lo = Math.min( ...ys );
			const hi = Math.max( ...ys );
			const norm = ( v ) => ( v - lo ) / ( hi - lo || 1 );
			const pts = [];
			for ( let i = 0; i < ys.length; i++ ) {
				pts.push( {
					x: ( w * i ) / ( ys.length - 1 ),
					y: h * ( 1 - p.height * norm( ys[ i ] ) ),
				} );
			}
			return [
				mv( { x: 0, y: h } ),
				...pts.map( ln ),
				ln( { x: w, y: h } ),
				{ t: 'Z' },
			];
		},
	},
	{
		// Op-art moire: parallel wave lines with a marching phase.
		id: 'moire',
		name: () => __( 'Moire lines', 'wunderpaint' ),
		generator: true,
		aspect: 1.4,
		params: [
			{
				key: 'lines',
				label: () => __( 'Lines', 'wunderpaint' ),
				min: 3,
				max: 24,
				step: 1,
				def: 10,
			},
			{
				key: 'amp',
				label: () => __( 'Amplitude', 'wunderpaint' ),
				...pct,
				max: 1,
				def: 0.45,
			},
			{
				key: 'shift',
				label: () => __( 'Phase shift', 'wunderpaint' ),
				min: 0,
				max: 180,
				step: 1,
				def: 40,
				deg: true,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.45,
			},
			{
				key: 'waves',
				label: () => __( 'Waves', 'wunderpaint' ),
				min: 1,
				max: 5,
				step: 1,
				def: 2,
			},
		],
		presets: [
			{
				name: () => __( 'Interference', 'wunderpaint' ),
				params: {
					lines: 14,
					amp: 0.5,
					shift: 30,
					thickness: 0.4,
					waves: 2,
				},
			},
			{
				name: () => __( 'Ripple field', 'wunderpaint' ),
				params: {
					lines: 20,
					amp: 0.25,
					shift: 90,
					thickness: 0.5,
					waves: 3,
				},
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.lines );
			const slot = h / n;
			const half = ( slot * p.thickness ) / 2;
			// The outermost line may swing by at most its own margin to
			// the box edge, not by half a slot.
			const amp = Math.max( 0, ( slot / 2 - half ) * p.amp );
			const k = Math.round( p.waves );
			const shift = ( p.shift * Math.PI ) / 180;
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const base = slot * ( i + 0.5 );
				const pts = [];
				for ( let s = 0; s <= 90; s++ ) {
					const u = s / 90;
					pts.push( {
						x: half + ( w - 2 * half ) * u,
						y: base + amp * Math.sin( TAU * k * u + i * shift ),
					} );
				}
				cmds.push( ...bandFrom( pts, () => half ) );
			}
			return cmds;
		},
	},
	{
		// Circle packing: seeded bubbles that never overlap.
		id: 'packing',
		name: () => __( 'Circle packing', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'count',
				label: () => __( 'Count', 'wunderpaint' ),
				min: 4,
				max: 60,
				step: 1,
				def: 18,
			},
			{
				key: 'sizeMax',
				label: () => __( 'Largest', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.5,
				def: 0.3,
			},
			{
				key: 'spread',
				label: () => __( 'Size range', 'wunderpaint' ),
				...pct,
				def: 0.7,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 12,
			},
		],
		presets: [
			{
				name: () => __( 'Bubbles', 'wunderpaint' ),
				params: { count: 26, sizeMax: 0.28, spread: 0.8, seed: 12 },
			},
			{
				name: () => __( 'Cobble', 'wunderpaint' ),
				params: { count: 46, sizeMax: 0.16, spread: 0.35, seed: 5 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const U = Math.min( w, h );
			const rMax = U * p.sizeMax * 0.5;
			const rMin = rMax * ( 1 - p.spread * 0.85 );
			const want = Math.round( p.count );
			const placed = [];
			// Largest first, then fill the gaps: the classic greedy pack.
			for (
				let tries = 0;
				tries < want * 60 && placed.length < want;
				tries++
			) {
				const t = placed.length / want;
				const r = rMax - ( rMax - rMin ) * t * ( 0.5 + rnd() * 0.5 );
				const cx = r + rnd() * ( w - 2 * r );
				const cy = r + rnd() * ( h - 2 * r );
				let ok = true;
				for ( const c of placed ) {
					if ( Math.hypot( c.x - cx, c.y - cy ) < c.r + r ) {
						ok = false;
						break;
					}
				}
				if ( ok ) {
					placed.push( { x: cx, y: cy, r } );
				}
			}
			const cmds = [];
			for ( const c of placed ) {
				cmds.push( ...ellipseSub( c.x, c.y, c.r, c.r ) );
			}
			return cmds;
		},
	},
	{
		// Stripes of seeded widths - barcode, ticket edge, retro block.
		id: 'stripes',
		name: () => __( 'Stripes', 'wunderpaint' ),
		generator: true,
		aspect: 1.6,
		corners: true,
		params: [
			{
				key: 'bars',
				label: () => __( 'Bars', 'wunderpaint' ),
				min: 3,
				max: 40,
				step: 1,
				def: 14,
			},
			{
				key: 'variance',
				label: () => __( 'Width variance', 'wunderpaint' ),
				...pct,
				def: 0.6,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.8,
				def: 0.45,
			},
			{
				key: 'lean',
				label: () => __( 'Lean', 'wunderpaint' ),
				min: -0.5,
				max: 0.5,
				step: 0.01,
				def: 0,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 3,
			},
		],
		presets: [
			{
				name: () => __( 'Barcode', 'wunderpaint' ),
				params: { bars: 28, variance: 0.9, gap: 0.5, lean: 0, seed: 7 },
			},
			{
				name: () => __( 'Awning', 'wunderpaint' ),
				params: { bars: 8, variance: 0, gap: 0.5, lean: 0, seed: 1 },
			},
			{
				name: () => __( 'Speed lines', 'wunderpaint' ),
				params: {
					bars: 16,
					variance: 0.7,
					gap: 0.6,
					lean: 0.35,
					seed: 4,
				},
			},
		],
		commands: ( w, h, p, c ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.bars );
			const lean = w * p.lean * 0.5;
			// Slots live inside an inset field, so a leaning stripe stays
			// in the box without clamping it into a wedge.
			const inset = Math.abs( lean );
			const slot = ( w - 2 * inset ) / n;
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const bw =
					slot * ( 1 - p.gap ) * ( 1 - p.variance * 0.8 * rnd() );
				const x0 = inset + i * slot + ( slot - bw ) / 2;
				cmds.push(
					...roundedPolyCommands(
						[
							{ x: x0 + lean, y: 0 },
							{ x: x0 + bw + lean, y: 0 },
							{ x: x0 + bw - lean, y: h },
							{ x: x0 - lean, y: h },
						],
						c.radius,
						c.smoothing
					)
				);
			}
			return cmds;
		},
	},
	{
		// Voronoi cells: every seeded site keeps the ground closest to
		// it. The cell is the box clipped by the bisector against every
		// other site (Sutherland-Hodgman), then shrunk for the gap.
		id: 'voronoi',
		name: () => __( 'Voronoi cells', 'wunderpaint' ),
		generator: true,
		// With a radius the cells read as foam instead of shards.
		corners: true,
		params: [
			{
				key: 'cells',
				label: () => __( 'Cells', 'wunderpaint' ),
				min: 3,
				max: 28,
				step: 1,
				def: 12,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				max: 0.3,
				def: 0.08,
			},
			{
				key: 'jitter',
				label: () => __( 'Irregularity', 'wunderpaint' ),
				...pct,
				def: 0.7,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 9,
			},
		],
		presets: [
			{
				name: () => __( 'Cracked glass', 'wunderpaint' ),
				params: { cells: 16, gap: 0.03, jitter: 0.9, seed: 21 },
			},
			{
				name: () => __( 'Cell tissue', 'wunderpaint' ),
				params: { cells: 22, gap: 0.14, jitter: 0.5, seed: 6 },
			},
			{
				name: () => __( 'Stone wall', 'wunderpaint' ),
				params: { cells: 9, gap: 0.09, jitter: 0.35, seed: 3 },
			},
		],
		commands: ( w, h, p, c ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.cells );
			// A jittered grid of sites: pure randomness clumps, and a
			// clump of Voronoi sites reads as noise, not as cells.
			const cols = Math.max(
				1,
				Math.round( Math.sqrt( ( n * w ) / h ) )
			);
			const rows = Math.max( 1, Math.ceil( n / cols ) );
			const sites = [];
			for ( let gy = 0; gy < rows && sites.length < n; gy++ ) {
				for ( let gx = 0; gx < cols && sites.length < n; gx++ ) {
					sites.push( {
						x:
							( ( gx + 0.5 ) / cols ) * w +
							( rnd() - 0.5 ) * ( w / cols ) * p.jitter,
						y:
							( ( gy + 0.5 ) / rows ) * h +
							( rnd() - 0.5 ) * ( h / rows ) * p.jitter,
					} );
				}
			}
			// Clip a polygon to the half-plane closer to A than to B.
			const clip = ( poly, A, B ) => {
				const mx = ( A.x + B.x ) / 2;
				const my = ( A.y + B.y ) / 2;
				const nx = B.x - A.x;
				const ny = B.y - A.y;
				const side = ( q ) => nx * ( q.x - mx ) + ny * ( q.y - my );
				const out = [];
				for ( let i = 0; i < poly.length; i++ ) {
					const cur = poly[ i ];
					const d = poly[ ( i + 1 ) % poly.length ];
					const sc = side( cur );
					const sd = side( d );
					if ( sc <= 0 ) {
						out.push( cur );
					}
					if ( sc <= 0 !== sd <= 0 ) {
						const t = sc / ( sc - sd );
						out.push( {
							x: cur.x + ( d.x - cur.x ) * t,
							y: cur.y + ( d.y - cur.y ) * t,
						} );
					}
				}
				return out;
			};
			const cmds = [];
			for ( const site of sites ) {
				let poly = [
					{ x: 0, y: 0 },
					{ x: w, y: 0 },
					{ x: w, y: h },
					{ x: 0, y: h },
				];
				for ( const other of sites ) {
					if ( other === site || poly.length < 3 ) {
						continue;
					}
					poly = clip( poly, site, other );
				}
				if ( poly.length < 3 ) {
					continue;
				}
				// Shrink toward the centroid for the visible gap.
				let cx = 0;
				let cy = 0;
				for ( const q of poly ) {
					cx += q.x / poly.length;
					cy += q.y / poly.length;
				}
				const f = 1 - p.gap;
				cmds.push(
					...roundedPolyCommands(
						poly.map( ( q ) => ( {
							x: cx + ( q.x - cx ) * f,
							y: cy + ( q.y - cy ) * f,
						} ) ),
						c.radius,
						c.smoothing
					)
				);
			}
			return cmds;
		},
	},
	{
		// Flow field: many thin lines following one smooth angle field -
		// the classic generative-art look.
		id: 'flowfield',
		name: () => __( 'Flow lines', 'wunderpaint' ),
		generator: true,
		aspect: 1.4,
		params: [
			{
				key: 'lines',
				label: () => __( 'Lines', 'wunderpaint' ),
				min: 4,
				max: 40,
				step: 1,
				def: 18,
			},
			{
				key: 'turbulence',
				label: () => __( 'Turbulence', 'wunderpaint' ),
				...pct,
				def: 0.45,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.4,
				def: 0.12,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 5,
			},
		],
		presets: [
			{
				name: () => __( 'Silk', 'wunderpaint' ),
				params: {
					lines: 26,
					turbulence: 0.25,
					thickness: 0.08,
					seed: 2,
				},
			},
			{
				name: () => __( 'Storm', 'wunderpaint' ),
				params: {
					lines: 14,
					turbulence: 0.95,
					thickness: 0.2,
					seed: 11,
				},
			},
			{
				name: () => __( 'Contour map', 'wunderpaint' ),
				params: {
					lines: 34,
					turbulence: 0.6,
					thickness: 0.05,
					seed: 7,
				},
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.lines );
			const ph = [ rnd() * TAU, rnd() * TAU, rnd() * TAU ];
			const slot = h / n;
			const half = Math.min( slot * p.thickness, slot * 0.4 );
			// Two sine layers make a smooth, seamless angle field.
			const angleAt = ( x, y ) =>
				p.turbulence *
				1.1 *
				( Math.sin( ( x / w ) * 5.2 + ph[ 0 ] ) *
					Math.cos( ( y / h ) * 3.7 + ph[ 1 ] ) +
					0.5 *
						Math.sin( ( ( x + y ) / ( w + h ) ) * 9.1 + ph[ 2 ] ) );
			const cmds = [];
			const steps = 70;
			for ( let i = 0; i < n; i++ ) {
				let x = half;
				let y = slot * ( i + 0.5 );
				const pts = [ { x, y } ];
				for ( let s = 0; s < steps; s++ ) {
					// The angle is capped: an unbounded field turned
					// lines back on themselves and they piled into one
					// solid lump against the right edge.
					const a = clamp( angleAt( x, y ), -0.62, 0.62 );
					x += ( ( w - 2 * half ) / steps ) * Math.cos( a );
					y += ( ( w - 2 * half ) / steps ) * Math.sin( a ) * 0.55;
					// A line that reaches the border ENDS there.
					if ( x > w - half || y < half || y > h - half ) {
						break;
					}
					pts.push( { x, y } );
				}
				if ( pts.length > 2 ) {
					cmds.push( ...bandFrom( pts, () => half ) );
				}
			}
			return cmds;
		},
	},
	{
		// Hilbert curve: the space-filling classic, as a band.
		id: 'hilbert',
		name: () => __( 'Space-filling curve', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'order',
				label: () => __( 'Order', 'wunderpaint' ),
				min: 1,
				max: 5,
				step: 1,
				def: 3,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.5,
				def: 0.22,
			},
		],
		presets: [
			{
				name: () => __( 'Circuit', 'wunderpaint' ),
				params: { order: 4, thickness: 0.16 },
			},
			{
				name: () => __( 'Labyrinth', 'wunderpaint' ),
				params: { order: 2, thickness: 0.4 },
			},
		],
		commands: ( w, h, p ) => {
			const order = Math.round( p.order );
			const side = Math.pow( 2, order );
			// Standard d -> ( x, y ) walk over the Hilbert index.
			const d2xy = ( d ) => {
				let rx;
				let ry;
				let t = d;
				let x = 0;
				let y = 0;
				for ( let s = 1; s < side; s *= 2 ) {
					rx = 1 & ( t / 2 );
					ry = 1 & ( t ^ rx );
					if ( 0 === ry ) {
						if ( 1 === rx ) {
							x = s - 1 - x;
							y = s - 1 - y;
						}
						const tmp = x;
						x = y;
						y = tmp;
					}
					x += s * rx;
					y += s * ry;
					t = Math.floor( t / 4 );
				}
				return { x, y };
			};
			const cellW = w / side;
			const cellH = h / side;
			const half = Math.min(
				( Math.min( cellW, cellH ) * p.thickness * 2 ) / 2,
				Math.min( cellW, cellH ) * 0.45
			);
			const pts = [];
			for ( let d = 0; d < side * side; d++ ) {
				const q = d2xy( d );
				pts.push( {
					x: clamp( ( q.x + 0.5 ) * cellW, half, w - half ),
					y: clamp( ( q.y + 0.5 ) * cellH, half, h - half ),
				} );
			}
			return bandFrom( pts, () => half );
		},
	},
	{
		// A real maze: recursive backtracker, drawn as the corridors it
		// carves (not as walls) - one continuous ribbon of paths.
		id: 'maze',
		name: () => __( 'Maze', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 3,
				max: 9,
				step: 1,
				def: 6,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.6,
				def: 0.3,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 8,
			},
		],
		presets: [
			{
				name: () => __( 'Tight maze', 'wunderpaint' ),
				params: { grid: 9, thickness: 0.2, seed: 13 },
			},
			{
				name: () => __( 'Wide paths', 'wunderpaint' ),
				params: { grid: 4, thickness: 0.55, seed: 4 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.grid );
			const rnd = seededRandom( p.seed );
			const cellW = w / n;
			const cellH = h / n;
			const half = ( Math.min( cellW, cellH ) * p.thickness * 1.6 ) / 2;
			const seen = new Set();
			const links = [];
			const key = ( x, y ) => x + ':' + y;
			// Depth-first carve with a seeded neighbour order.
			const stack = [ { x: 0, y: 0 } ];
			seen.add( key( 0, 0 ) );
			while ( stack.length ) {
				const cur = stack[ stack.length - 1 ];
				const dirs = [
					[ 1, 0 ],
					[ -1, 0 ],
					[ 0, 1 ],
					[ 0, -1 ],
				];
				// Seeded shuffle, so the same seed carves the same maze.
				for ( let i = dirs.length - 1; i > 0; i-- ) {
					const j = Math.floor( rnd() * ( i + 1 ) );
					const t = dirs[ i ];
					dirs[ i ] = dirs[ j ];
					dirs[ j ] = t;
				}
				let moved = false;
				for ( const [ dx, dy ] of dirs ) {
					const nx = cur.x + dx;
					const ny = cur.y + dy;
					if (
						nx >= 0 &&
						ny >= 0 &&
						nx < n &&
						ny < n &&
						! seen.has( key( nx, ny ) )
					) {
						seen.add( key( nx, ny ) );
						links.push( [ cur, { x: nx, y: ny } ] );
						stack.push( { x: nx, y: ny } );
						moved = true;
						break;
					}
				}
				if ( ! moved ) {
					stack.pop();
				}
			}
			const centre = ( c ) => ( {
				x: clamp( ( c.x + 0.5 ) * cellW, half, w - half ),
				y: clamp( ( c.y + 0.5 ) * cellH, half, h - half ),
			} );
			const cmds = [];
			for ( const [ a, b ] of links ) {
				cmds.push(
					...bandFrom( [ centre( a ), centre( b ) ], () => half )
				);
			}
			return cmds;
		},
	},
	{
		// Halftone ramp: dot size follows a direction, the way a print
		// screen fades a tone.
		id: 'halftone',
		name: () => __( 'Halftone ramp', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 4,
				max: 26,
				step: 1,
				def: 12,
			},
			{
				key: 'angle',
				label: () => __( 'Direction', 'wunderpaint' ),
				min: 0,
				max: 360,
				step: 1,
				def: 45,
				deg: true,
			},
			{
				key: 'small',
				label: () => __( 'Smallest', 'wunderpaint' ),
				...pct,
				max: 0.8,
				def: 0.05,
			},
			{
				key: 'large',
				label: () => __( 'Largest', 'wunderpaint' ),
				...pct,
				min: 0.2,
				def: 1,
			},
		],
		presets: [
			{
				name: () => __( 'Fade out', 'wunderpaint' ),
				params: { grid: 14, angle: 45, small: 0, large: 1 },
			},
			{
				name: () => __( 'Screen tone', 'wunderpaint' ),
				params: { grid: 20, angle: 90, small: 0.5, large: 0.9 },
			},
			{
				name: () => __( 'Reverse fade', 'wunderpaint' ),
				params: { grid: 16, angle: 180, small: 0.1, large: 1 },
			},
		],
		commands: ( w, h, p ) => {
			const cols = Math.round( p.grid );
			const rows = Math.max( 2, Math.round( ( cols * h ) / w ) );
			const cw = w / cols;
			const ch = h / rows;
			const base = Math.min( cw, ch ) / 2;
			const a = ( p.angle * Math.PI ) / 180;
			const ux = Math.cos( a );
			const uy = Math.sin( a );
			const cmds = [];
			for ( let gy = 0; gy < rows; gy++ ) {
				for ( let gx = 0; gx < cols; gx++ ) {
					const cx = ( gx + 0.5 ) * cw;
					const cy = ( gy + 0.5 ) * ch;
					// Projection onto the ramp direction, 0..1.
					const t = clamp(
						( cx / w - 0.5 ) * ux + ( cy / h - 0.5 ) * uy + 0.5,
						0,
						1
					);
					const r = base * ( p.small + ( p.large - p.small ) * t );
					if ( r > base * 0.04 ) {
						cmds.push( ...ellipseSub( cx, cy, r, r ) );
					}
				}
			}
			return cmds;
		},
	},
	{
		// Fish scales / roof tiles: rows of arcs, every other row offset.
		id: 'scales',
		name: () => __( 'Fish scales', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'cols',
				label: () => __( 'Columns', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'rows',
				label: () => __( 'Rows', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.5,
				def: 0.16,
			},
			{
				key: 'span',
				label: () => __( 'Arc', 'wunderpaint' ),
				min: 100,
				max: 220,
				step: 1,
				def: 180,
				deg: true,
			},
		],
		presets: [
			{
				name: () => __( 'Roof tiles', 'wunderpaint' ),
				params: { cols: 6, rows: 6, thickness: 0.14, span: 180 },
			},
			{
				name: () => __( 'Peacock', 'wunderpaint' ),
				params: { cols: 4, rows: 4, thickness: 0.35, span: 215 },
			},
		],
		commands: ( w, h, p ) => {
			const cols = Math.round( p.cols );
			const rows = Math.round( p.rows );
			const cw = w / cols;
			const ch = h / rows;
			const rad = Math.min( cw, ch ) * 0.62;
			const half = Math.min( rad * p.thickness, rad * 0.48 );
			const spanRad = ( p.span * Math.PI ) / 180;
			const cmds = [];
			for ( let gy = 0; gy < rows; gy++ ) {
				const offset = gy % 2 ? cw / 2 : 0;
				for ( let gx = 0; gx <= cols; gx++ ) {
					const cx = gx * cw + offset;
					const cy = ( gy + 0.35 ) * ch;
					const pts = [];
					for ( let s = 0; s <= 24; s++ ) {
						const ang =
							Math.PI / 2 - spanRad / 2 + ( spanRad * s ) / 24;
						pts.push( {
							x: cx + rad * Math.cos( ang ),
							y: cy + rad * Math.sin( ang ),
						} );
					}
					for ( const run of insideRuns( pts, w, h, half ) ) {
						cmds.push( ...bandFrom( run, () => half ) );
					}
				}
			}
			return cmds;
		},
	},
	{
		// Tree rings / ripples: concentric bands, each one wobbled by its
		// own seeded harmonics.
		id: 'treerings',
		name: () => __( 'Tree rings', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'rings',
				label: () => __( 'Rings', 'wunderpaint' ),
				min: 3,
				max: 18,
				step: 1,
				def: 8,
			},
			{
				key: 'wobble',
				label: () => __( 'Wobble', 'wunderpaint' ),
				...pct,
				def: 0.4,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.7,
				def: 0.35,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 4,
			},
		],
		presets: [
			{
				name: () => __( 'Tree rings', 'wunderpaint' ),
				params: { rings: 10, wobble: 0.5, thickness: 0.4, seed: 4 },
			},
			{
				name: () => __( 'Water rings', 'wunderpaint' ),
				params: { rings: 14, wobble: 0.12, thickness: 0.25, seed: 2 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.rings );
			const cx = w / 2;
			const cy = h / 2;
			const cmds = [];
			for ( let i = 0; i < n; i++ ) {
				const f = ( i + 1 ) / n;
				const half = ( 0.5 / n ) * p.thickness * Math.min( cx, cy );
				const ph = [ rnd() * TAU, rnd() * TAU, rnd() * TAU ];
				const pts = [];
				for ( let s = 0; s <= 90; s++ ) {
					const t = ( s / 90 ) * TAU;
					const wob =
						1 +
						p.wobble *
							0.16 *
							( Math.sin( 3 * t + ph[ 0 ] ) +
								0.6 * Math.sin( 5 * t + ph[ 1 ] ) +
								0.35 * Math.sin( 8 * t + ph[ 2 ] ) );
					const rad = f * ( 1 - 1 / ( n * 2 ) ) * wob;
					pts.push( {
						x: cx + ( cx - half ) * rad * Math.cos( t ),
						y: cy + ( cy - half ) * rad * Math.sin( t ),
					} );
				}
				cmds.push( ...bandFrom( pts, () => half ) );
			}
			return fitCommands( cmds, w, h );
		},
	},
	{
		// Op-art grid: squares that grow, shrink and lean toward the
		// centre - the Vasarely trick.
		id: 'gridwarp',
		name: () => __( 'Warped grid', 'wunderpaint' ),
		generator: true,
		corners: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 3,
				max: 16,
				step: 1,
				def: 8,
			},
			{
				key: 'bulge',
				label: () => __( 'Bulge', 'wunderpaint' ),
				min: -1,
				max: 1,
				step: 0.01,
				def: 0.6,
			},
			{
				key: 'twist',
				label: () => __( 'Twist', 'wunderpaint' ),
				min: -1,
				max: 1,
				step: 0.01,
				def: 0.3,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.05,
				max: 0.6,
				def: 0.2,
			},
		],
		presets: [
			{
				name: () => __( 'Bulge', 'wunderpaint' ),
				params: { grid: 9, bulge: 0.9, twist: 0, gap: 0.18 },
			},
			{
				name: () => __( 'Vortex', 'wunderpaint' ),
				params: { grid: 10, bulge: 0.2, twist: 0.9, gap: 0.25 },
			},
			{
				name: () => __( 'Dent', 'wunderpaint' ),
				params: { grid: 8, bulge: -0.8, twist: -0.2, gap: 0.2 },
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.grid );
			const cw = w / n;
			const ch = h / n;
			const cmds = [];
			for ( let gy = 0; gy < n; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					const cx = ( gx + 0.5 ) * cw;
					const cy = ( gy + 0.5 ) * ch;
					// Distance from the centre drives size and rotation.
					const dx = ( cx - w / 2 ) / ( w / 2 );
					const dy = ( cy - h / 2 ) / ( h / 2 );
					const d = Math.min( 1, Math.hypot( dx, dy ) );
					const scale = clamp(
						1 - p.bulge * ( 0.85 - d ),
						0.12,
						1.35
					);
					const ang = p.twist * ( 1 - d ) * 1.2;
					const sx = ( ( cw * ( 1 - p.gap ) ) / 2 ) * scale;
					const sy = ( ( ch * ( 1 - p.gap ) ) / 2 ) * scale;
					const co = Math.cos( ang );
					const si = Math.sin( ang );
					const corner = ( ox, oy ) => ( {
						x: clamp( cx + ox * sx * co - oy * sy * si, 0, w ),
						y: clamp( cy + ox * sx * si + oy * sy * co, 0, h ),
					} );
					cmds.push(
						...roundedPolyCommands(
							[
								corner( -1, -1 ),
								corner( 1, -1 ),
								corner( 1, 1 ),
								corner( -1, 1 ),
							],
							c.radius,
							c.smoothing
						)
					);
				}
			}
			return cmds;
		},
	},
	{
		// The heart as a FORMULA, so it can be dialled - the library's
		// heart is a hand-drawn path and stays one.
		id: 'heartcurve',
		name: () => __( 'Heart curve', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'dip',
				label: () => __( 'Dip', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1.6,
				def: 1,
			},
			{
				key: 'tip',
				label: () => __( 'Point', 'wunderpaint' ),
				...pct,
				min: 0.4,
				max: 1.6,
				def: 1,
			},
			{
				key: 'plump',
				label: () => __( 'Plumpness', 'wunderpaint' ),
				...pct,
				min: 0.5,
				max: 1.5,
				def: 1,
			},
		],
		presets: [
			{
				name: () => __( 'Classic heart', 'wunderpaint' ),
				params: { dip: 1, tip: 1, plump: 1 },
			},
			{
				name: () => __( 'Fat heart', 'wunderpaint' ),
				params: { dip: 0.6, tip: 0.7, plump: 1.4 },
			},
			{
				name: () => __( 'Sharp heart', 'wunderpaint' ),
				params: { dip: 1.5, tip: 1.5, plump: 0.7 },
			},
		],
		commands: ( w, h, p ) => {
			// The textbook curve, with each cosine term on its own dial.
			const pts = [];
			for ( let i = 0; i < 220; i++ ) {
				const t = ( i / 220 ) * TAU;
				const x = 16 * Math.pow( Math.sin( t ), 3 ) * p.plump;
				const y = -(
					13 * Math.cos( t ) -
					5 * p.dip * Math.cos( 2 * t ) -
					2 * Math.cos( 3 * t ) -
					p.tip * Math.cos( 4 * t )
				);
				pts.push( { x: 50 + x * 2.6, y: 50 + y * 2.6 } );
			}
			return fitCommands( smoothRing( pts ), w, h );
		},
	},
	{
		// Constellation: stars, plus the lines a stargazer draws.
		id: 'constellation',
		name: () => __( 'Constellation', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'stars',
				label: () => __( 'Stars', 'wunderpaint' ),
				min: 4,
				max: 30,
				step: 1,
				def: 12,
			},
			{
				key: 'links',
				label: () => __( 'Links', 'wunderpaint' ),
				min: 0,
				max: 3,
				step: 1,
				def: 1,
			},
			{
				key: 'dotSize',
				label: () => __( 'Star size', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.18,
				def: 0.06,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 7,
			},
		],
		presets: [
			{
				name: () => __( 'Star map', 'wunderpaint' ),
				params: { stars: 16, links: 1, dotSize: 0.05, seed: 7 },
			},
			{
				name: () => __( 'Network', 'wunderpaint' ),
				params: { stars: 22, links: 3, dotSize: 0.04, seed: 15 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.stars );
			const U = Math.min( w, h );
			const r = ( U * p.dotSize ) / 2;
			const cols = Math.max(
				1,
				Math.round( Math.sqrt( ( n * w ) / h ) )
			);
			const rows = Math.max( 1, Math.ceil( n / cols ) );
			const stars = [];
			for ( let gy = 0; gy < rows && stars.length < n; gy++ ) {
				for ( let gx = 0; gx < cols && stars.length < n; gx++ ) {
					stars.push( {
						x: clamp(
							( ( gx + 0.5 ) / cols ) * w +
								( rnd() - 0.5 ) * ( w / cols ) * 0.8,
							r * 2,
							w - r * 2
						),
						y: clamp(
							( ( gy + 0.5 ) / rows ) * h +
								( rnd() - 0.5 ) * ( h / rows ) * 0.8,
							r * 2,
							h - r * 2
						),
						s: 0.6 + rnd() * 0.8,
					} );
				}
			}
			const cmds = [];
			const lines = Math.round( p.links );
			const half = Math.max( 0.6, r * 0.18 );
			for ( let i = 0; i < stars.length; i++ ) {
				// Link to the nearest neighbours that come later in the
				// list, so no pair is drawn twice.
				const rest = stars
					.slice( i + 1 )
					.map( ( q ) => ( {
						q,
						d: Math.hypot( q.x - stars[ i ].x, q.y - stars[ i ].y ),
					} ) )
					.sort( ( a, b ) => a.d - b.d )
					.slice( 0, lines );
				for ( const { q } of rest ) {
					cmds.push( ...bandFrom( [ stars[ i ], q ], () => half ) );
				}
			}
			for ( const st of stars ) {
				cmds.push( ...ellipseSub( st.x, st.y, r * st.s, r * st.s ) );
			}
			return cmds;
		},
	},
	{
		// Argyle: the diamond lattice off a knitted sock.
		id: 'argyle',
		name: () => __( 'Argyle lattice', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 2,
				max: 8,
				step: 1,
				def: 3,
			},
			{
				key: 'size',
				label: () => __( 'Diamond size', 'wunderpaint' ),
				...pct,
				min: 0.3,
				max: 1,
				def: 0.8,
			},
			{
				key: 'lines',
				label: () => __( 'Lattice lines', 'wunderpaint' ),
				...pct,
				max: 0.2,
				def: 0.05,
			},
		],
		presets: [
			{
				name: () => __( 'Argyle', 'wunderpaint' ),
				params: { grid: 3, size: 0.8, lines: 0.05 },
			},
			{
				name: () => __( 'Harlequin', 'wunderpaint' ),
				params: { grid: 5, size: 1, lines: 0 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.grid );
			const cw = w / n;
			const ch = h / n;
			const cmds = [];
			for ( let gy = 0; gy < n; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					const cx = ( gx + 0.5 ) * cw;
					const cy = ( gy + 0.5 ) * ch;
					const rx = ( cw / 2 ) * p.size;
					const ry = ( ch / 2 ) * p.size;
					cmds.push(
						...roundedPolyCommands(
							[
								{ x: cx, y: cy - ry },
								{ x: cx + rx, y: cy },
								{ x: cx, y: cy + ry },
								{ x: cx - rx, y: cy },
							],
							0,
							0
						)
					);
				}
			}
			if ( p.lines > 0.005 ) {
				// The lattice follows the diamonds' own edge slope and
				// every line is CLIPPED to the box; the first cut took
				// its slope from the wrong ratio and fanned outward.
				const half = Math.min( cw, ch ) * p.lines * 0.5;
				for ( let i = -n; i <= 2 * n; i++ ) {
					for ( const dir of [ 1, -1 ] ) {
						const x0 = i * cw;
						const pts = [];
						for ( let s = 0; s <= 40; s++ ) {
							const y = ( h * s ) / 40;
							pts.push( { x: x0 + dir * y * ( cw / ch ), y } );
						}
						for ( const run of insideRuns( pts, w, h, half ) ) {
							cmds.push( ...bandFrom( run, () => half ) );
						}
					}
				}
			}
			return cmds;
		},
	},
	{
		// Interference: two or more ring sets, offset against each other.
		id: 'interference',
		name: () => __( 'Ring interference', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'sets',
				label: () => __( 'Sources', 'wunderpaint' ),
				min: 2,
				max: 5,
				step: 1,
				def: 2,
			},
			{
				key: 'rings',
				label: () => __( 'Rings', 'wunderpaint' ),
				min: 4,
				max: 24,
				step: 1,
				def: 12,
			},
			{
				key: 'offset',
				label: () => __( 'Distance', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 1,
				def: 0.5,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.8,
				def: 0.4,
			},
		],
		presets: [
			{
				name: () => __( 'Two drops', 'wunderpaint' ),
				params: { sets: 2, rings: 16, offset: 0.55, thickness: 0.35 },
			},
			{
				name: () => __( 'Triple wave', 'wunderpaint' ),
				params: { sets: 3, rings: 10, offset: 0.7, thickness: 0.45 },
			},
		],
		commands: ( w, h, p ) => {
			const sets = Math.round( p.sets );
			const rings = Math.round( p.rings );
			const U = Math.min( w, h ) / 2;
			const spacing = U / rings;
			const half = Math.min(
				( spacing * p.thickness ) / 2,
				spacing * 0.45
			);
			const cmds = [];
			for ( let s = 0; s < sets; s++ ) {
				const a = TOP + ( s / sets ) * TAU;
				const cx = w / 2 + ( w / 2 ) * 0.42 * p.offset * Math.cos( a );
				const cy = h / 2 + ( h / 2 ) * 0.42 * p.offset * Math.sin( a );
				for ( let i = 1; i <= rings; i++ ) {
					const rad = spacing * i;
					const pts = [];
					// Only the arc that stays inside the box is drawn, so
					// a ring set near the edge does not spill.
					for ( let k = 0; k <= 120; k++ ) {
						const t = ( k / 120 ) * TAU;
						const x = cx + rad * Math.cos( t );
						const y = cy + rad * Math.sin( t );
						if (
							x < half ||
							y < half ||
							x > w - half ||
							y > h - half
						) {
							if ( pts.length > 3 ) {
								cmds.push( ...bandFrom( pts, () => half ) );
							}
							pts.length = 0;
							continue;
						}
						pts.push( { x, y } );
					}
					if ( pts.length > 3 ) {
						cmds.push( ...bandFrom( pts, () => half ) );
					}
				}
			}
			return cmds;
		},
	},
	{
		// The pendulum drawing machine: two damped sines per axis. The
		// decay dial is what makes it spiral inward like the real thing.
		id: 'harmonograph',
		name: () => __( 'Harmonograph', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'freqA',
				label: () => __( 'Frequency A', 'wunderpaint' ),
				min: 1,
				max: 9,
				step: 1,
				def: 3,
			},
			{
				key: 'freqB',
				label: () => __( 'Frequency B', 'wunderpaint' ),
				min: 1,
				max: 9,
				step: 1,
				def: 2,
			},
			{
				key: 'detune',
				label: () => __( 'Detune', 'wunderpaint' ),
				...pct,
				max: 0.2,
				def: 0.02,
			},
			{
				key: 'decay',
				label: () => __( 'Decay', 'wunderpaint' ),
				...pct,
				def: 0.4,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.005,
				max: 0.06,
				def: 0.015,
			},
		],
		presets: [
			{
				name: () => __( 'Pendulum', 'wunderpaint' ),
				params: {
					freqA: 3,
					freqB: 2,
					detune: 0.02,
					decay: 0.45,
					thickness: 0.015,
				},
			},
			{
				name: () => __( 'Spiral web', 'wunderpaint' ),
				params: {
					freqA: 5,
					freqB: 4,
					detune: 0.06,
					decay: 0.8,
					thickness: 0.01,
				},
			},
			{
				name: () => __( 'Ribbon knot', 'wunderpaint' ),
				params: {
					freqA: 2,
					freqB: 3,
					detune: 0,
					decay: 0.15,
					thickness: 0.05,
				},
			},
		],
		commands: ( w, h, p ) => {
			const turns = 14;
			const S = 2400;
			const a = p.freqA + p.detune;
			const b = p.freqB;
			const damp = p.decay * 2.2;
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const u = i / S;
				const t = u * TAU * turns;
				const e = Math.exp( -damp * u );
				pts.push( {
					x: 50 + 46 * e * Math.sin( a * t ),
					y: 50 + 46 * e * Math.sin( b * t + 1.1 ),
				} );
			}
			const half = 50 * p.thickness;
			return fitCommands(
				bandFrom( pts, () => half ),
				w,
				h
			);
		},
	},
	{
		// Chladni figure: the nodal lines of a vibrating plate - where
		// the sand collects because the plate stands still.
		id: 'chladni',
		name: () => __( 'Chladni figure', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'modeM',
				label: () => __( 'Mode M', 'wunderpaint' ),
				min: 1,
				max: 8,
				step: 1,
				def: 3,
			},
			{
				key: 'modeN',
				label: () => __( 'Mode N', 'wunderpaint' ),
				min: 1,
				max: 8,
				step: 1,
				def: 5,
			},
			{
				key: 'mix',
				label: () => __( 'Mix', 'wunderpaint' ),
				min: -1,
				max: 1,
				step: 0.01,
				def: -1,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.01,
				max: 0.1,
				def: 0.03,
			},
		],
		presets: [
			{
				name: () => __( 'Sand figure', 'wunderpaint' ),
				params: { modeM: 3, modeN: 5, mix: -1, thickness: 0.03 },
			},
			{
				name: () => __( 'Grid mode', 'wunderpaint' ),
				params: { modeM: 4, modeN: 4, mix: 1, thickness: 0.025 },
			},
			{
				name: () => __( 'High mode', 'wunderpaint' ),
				params: { modeM: 7, modeN: 5, mix: -1, thickness: 0.015 },
			},
		],
		commands: ( w, h, p ) => {
			const m = Math.round( p.modeM );
			const n = Math.round( p.modeN );
			// The classic square-plate solution: two modes, and the mix
			// dial slides between their sum and their difference.
			const field = ( x, y ) => {
				const sx = Math.sin( ( m * Math.PI * x ) / 100 );
				const sy = Math.sin( ( n * Math.PI * y ) / 100 );
				const tx = Math.sin( ( n * Math.PI * x ) / 100 );
				const ty = Math.sin( ( m * Math.PI * y ) / 100 );
				return sx * sy + p.mix * tx * ty;
			};
			const half = Math.min( w, h ) * p.thickness;
			const cmds = [];
			for ( const chain of isoContours( field, 0, 0, 100, 96 ) ) {
				if ( chain.length < 3 ) {
					continue;
				}
				const scaled = chain.map( ( q ) => ( {
					x: ( q.x / 100 ) * w,
					y: ( q.y / 100 ) * h,
				} ) );
				for ( const run of insideRuns( scaled, w, h, half ) ) {
					cmds.push( ...bandFrom( run, () => half ) );
				}
			}
			return cmds;
		},
	},
	{
		// Epitrochoid: the OUTER rolling wheel, so flower and gear
		// outlines rather than the guilloche's interlaced rosettes.
		id: 'epitrochoid',
		name: () => __( 'Flower gear', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'ringR',
				label: () => __( 'Outer wheel', 'wunderpaint' ),
				min: 2,
				max: 12,
				step: 1,
				def: 5,
			},
			{
				key: 'ringr',
				label: () => __( 'Inner wheel', 'wunderpaint' ),
				min: 1,
				max: 10,
				step: 1,
				def: 1,
			},
			{
				key: 'pen',
				label: () => __( 'Pen offset', 'wunderpaint' ),
				min: 1,
				max: 12,
				step: 1,
				def: 3,
			},
			{
				key: 'thickness',
				label: () => __( 'Line width', 'wunderpaint' ),
				...pct,
				max: 0.1,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Flower', 'wunderpaint' ),
				params: { ringR: 5, ringr: 1, pen: 3, thickness: 0 },
			},
			{
				name: () => __( 'Cog', 'wunderpaint' ),
				params: { ringR: 9, ringr: 1, pen: 2, thickness: 0 },
			},
			{
				name: () => __( 'Looped ring', 'wunderpaint' ),
				params: { ringR: 4, ringr: 3, pen: 7, thickness: 0.03 },
			},
		],
		commands: ( w, h, p ) => {
			const R = Math.round( p.ringR );
			const r = Math.round( p.ringr );
			const d = Math.round( p.pen );
			const turns = r / gcd( R, r );
			const S = Math.min( 2000, Math.max( 360, 240 * turns ) );
			const k = R + r;
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const t = ( i / S ) * TAU * turns;
				pts.push( {
					x:
						50 +
						4 *
							( k * Math.cos( t ) -
								d * Math.cos( ( k / r ) * t ) ),
					y:
						50 +
						4 *
							( k * Math.sin( t ) -
								d * Math.sin( ( k / r ) * t ) ),
				} );
			}
			if ( p.thickness > 0.004 ) {
				const half = 50 * p.thickness;
				return fitCommands(
					bandFrom( pts, () => half ),
					w,
					h
				);
			}
			return fitCommands( smoothRing( pts ), w, h );
		},
	},
	{
		// The butterfly curve - one formula, one unmistakable silhouette.
		id: 'butterfly',
		name: () => __( 'Butterfly curve', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'wing',
				label: () => __( 'Wing spread', 'wunderpaint' ),
				...pct,
				min: 0.4,
				max: 1.6,
				def: 1,
			},
			{
				key: 'notch',
				label: () => __( 'Notch', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1.8,
				def: 1,
			},
			{
				key: 'thickness',
				label: () => __( 'Line width', 'wunderpaint' ),
				...pct,
				max: 0.08,
				def: 0,
			},
		],
		presets: [
			{
				name: () => __( 'Butterfly', 'wunderpaint' ),
				params: { wing: 1, notch: 1, thickness: 0 },
			},
			{
				name: () => __( 'Moth', 'wunderpaint' ),
				params: { wing: 1.5, notch: 0.4, thickness: 0 },
			},
		],
		commands: ( w, h, p ) => {
			const S = 720;
			const pts = [];
			for ( let i = 0; i <= S; i++ ) {
				const t = ( i / S ) * TAU * 6;
				const r =
					Math.exp( Math.sin( t ) ) -
					2.1 * p.notch * Math.cos( 4 * t ) +
					Math.pow( Math.sin( ( 2 * t - Math.PI ) / 24 ), 5 );
				pts.push( {
					x: 50 + 12 * p.wing * r * Math.sin( t ),
					y: 50 - 12 * r * Math.cos( t ),
				} );
			}
			if ( p.thickness > 0.004 ) {
				const half = 50 * p.thickness;
				return fitCommands(
					bandFrom( pts, () => half ),
					w,
					h
				);
			}
			return fitCommands( smoothRing( pts ), w, h );
		},
	},
	{
		// Sierpinski: the triangle, or the carpet - holes inside holes.
		id: 'sierpinski',
		name: () => __( 'Sierpinski', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'order',
				label: () => __( 'Order', 'wunderpaint' ),
				min: 1,
				max: 5,
				step: 1,
				def: 4,
			},
			{
				key: 'carpet',
				label: () => __( 'Carpet', 'wunderpaint' ),
				min: 0,
				max: 1,
				step: 1,
				def: 0,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				max: 0.3,
				def: 0.04,
			},
		],
		presets: [
			{
				name: () => __( 'Triangle', 'wunderpaint' ),
				params: { order: 4, carpet: 0, gap: 0.04 },
			},
			{
				name: () => __( 'Carpet', 'wunderpaint' ),
				params: { order: 3, carpet: 1, gap: 0.02 },
			},
		],
		commands: ( w, h, p ) => {
			const cmds = [];
			const gap = p.gap;
			if ( p.carpet > 0.5 ) {
				// The carpet grows eightfold per step, so its order is
				// capped lower than the triangle's.
				const order = clamp( Math.round( p.order ), 1, 3 );
				const cells = [ { x: 0, y: 0, s: 1 } ];
				let live = cells;
				for ( let it = 0; it < order; it++ ) {
					const next = [];
					for ( const cell of live ) {
						const s = cell.s / 3;
						for ( let iy = 0; iy < 3; iy++ ) {
							for ( let ix = 0; ix < 3; ix++ ) {
								if ( 1 === ix && 1 === iy ) {
									continue;
								}
								next.push( {
									x: cell.x + ix * s,
									y: cell.y + iy * s,
									s,
								} );
							}
						}
					}
					live = next;
				}
				for ( const cell of live ) {
					const g = cell.s * gap;
					cmds.push(
						...roundedPolyCommands(
							[
								{
									x: ( cell.x + g ) * w,
									y: ( cell.y + g ) * h,
								},
								{
									x: ( cell.x + cell.s - g ) * w,
									y: ( cell.y + g ) * h,
								},
								{
									x: ( cell.x + cell.s - g ) * w,
									y: ( cell.y + cell.s - g ) * h,
								},
								{
									x: ( cell.x + g ) * w,
									y: ( cell.y + cell.s - g ) * h,
								},
							],
							0,
							0
						)
					);
				}
				return cmds;
			}
			const order = Math.round( p.order );
			let tris = [
				[
					{ x: 0.5, y: 0 },
					{ x: 1, y: 1 },
					{ x: 0, y: 1 },
				],
			];
			for ( let it = 0; it < order; it++ ) {
				const next = [];
				for ( const t of tris ) {
					const mid = ( a, b ) => ( {
						x: ( a.x + b.x ) / 2,
						y: ( a.y + b.y ) / 2,
					} );
					const m01 = mid( t[ 0 ], t[ 1 ] );
					const m12 = mid( t[ 1 ], t[ 2 ] );
					const m20 = mid( t[ 2 ], t[ 0 ] );
					next.push(
						[ t[ 0 ], m01, m20 ],
						[ m01, t[ 1 ], m12 ],
						[ m20, m12, t[ 2 ] ]
					);
				}
				tris = next;
			}
			for ( const t of tris ) {
				const cx = ( t[ 0 ].x + t[ 1 ].x + t[ 2 ].x ) / 3;
				const cy = ( t[ 0 ].y + t[ 1 ].y + t[ 2 ].y ) / 3;
				const f = 1 - gap * 2;
				cmds.push(
					...roundedPolyCommands(
						t.map( ( q ) => ( {
							x: ( cx + ( q.x - cx ) * f ) * w,
							y: ( cy + ( q.y - cy ) * f ) * h,
						} ) ),
						0,
						0
					)
				);
			}
			return cmds;
		},
	},
	{
		// The dragon curve: every step folds the path, and the outline
		// turns out to tile the plane with itself.
		id: 'dragon',
		name: () => __( 'Dragon curve', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'order',
				label: () => __( 'Order', 'wunderpaint' ),
				min: 4,
				max: 12,
				step: 1,
				def: 9,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.9,
				def: 0.5,
			},
		],
		presets: [
			{
				name: () => __( 'Dragon', 'wunderpaint' ),
				params: { order: 10, thickness: 0.5 },
			},
			{
				name: () => __( 'Folded ribbon', 'wunderpaint' ),
				params: { order: 6, thickness: 0.85 },
			},
		],
		commands: ( w, h, p ) => {
			const order = Math.round( p.order );
			const count = Math.pow( 2, order );
			// Turn direction from the bit trick: ( i & -i ) << 1 & i.
			let dir = 0;
			let x = 0;
			let y = 0;
			const pts = [ { x, y } ];
			for ( let i = 1; i <= count; i++ ) {
				const right = ( ( ( i & -i ) << 1 ) & i ) !== 0;
				const step = [
					[ 1, 0 ],
					[ 0, 1 ],
					[ -1, 0 ],
					[ 0, -1 ],
				][ dir ];
				x += step[ 0 ];
				y += step[ 1 ];
				pts.push( { x, y } );
				dir = ( dir + ( right ? 1 : 3 ) ) % 4;
			}
			// Fit the lattice walk into the box, then band it.
			const xs = pts.map( ( q ) => q.x );
			const ys = pts.map( ( q ) => q.y );
			const spanX = Math.max( ...xs ) - Math.min( ...xs ) || 1;
			const spanY = Math.max( ...ys ) - Math.min( ...ys ) || 1;
			const cell = Math.min( w / spanX, h / spanY );
			const half = Math.max( 0.4, ( cell * p.thickness ) / 2 );
			const offX = ( w - spanX * cell ) / 2 - Math.min( ...xs ) * cell;
			const offY = ( h - spanY * cell ) / 2 - Math.min( ...ys ) * cell;
			const placed = pts.map( ( q ) => ( {
				x: clamp( offX + q.x * cell, half, w - half ),
				y: clamp( offY + q.y * cell, half, h - half ),
			} ) );
			return bandFrom( placed, () => half );
		},
	},
	{
		// Delaunay mesh: the low-poly triangle net over seeded points.
		// Brute force is fine here - the point count is capped, and the
		// result is cached like every other generator.
		id: 'delaunay',
		name: () => __( 'Triangle mesh', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'points',
				label: () => __( 'Points', 'wunderpaint' ),
				min: 5,
				max: 26,
				step: 1,
				def: 14,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				max: 0.25,
				def: 0.06,
			},
			{
				key: 'jitter',
				label: () => __( 'Irregularity', 'wunderpaint' ),
				...pct,
				def: 0.6,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 6,
			},
		],
		presets: [
			{
				name: () => __( 'Low poly', 'wunderpaint' ),
				params: { points: 12, gap: 0.04, jitter: 0.5, seed: 6 },
			},
			{
				name: () => __( 'Shattered', 'wunderpaint' ),
				params: { points: 22, gap: 0.12, jitter: 0.9, seed: 19 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.points );
			const cols = Math.max(
				2,
				Math.round( Math.sqrt( ( n * w ) / h ) )
			);
			const rows = Math.max( 2, Math.ceil( n / cols ) );
			const pts = [];
			for ( let gy = 0; gy < rows; gy++ ) {
				for ( let gx = 0; gx < cols; gx++ ) {
					pts.push( {
						x: clamp(
							( gx / ( cols - 1 ) ) * w +
								( rnd() - 0.5 ) * ( w / cols ) * p.jitter,
							0,
							w
						),
						y: clamp(
							( gy / ( rows - 1 ) ) * h +
								( rnd() - 0.5 ) * ( h / rows ) * p.jitter,
							0,
							h
						),
					} );
				}
			}
			// A triple is a Delaunay triangle when no other point sits
			// inside its circumcircle.
			const cmds = [];
			const N = pts.length;
			for ( let i = 0; i < N - 2; i++ ) {
				for ( let j = i + 1; j < N - 1; j++ ) {
					for ( let k = j + 1; k < N; k++ ) {
						const A = pts[ i ];
						const B = pts[ j ];
						const C = pts[ k ];
						const d =
							2 *
							( A.x * ( B.y - C.y ) +
								B.x * ( C.y - A.y ) +
								C.x * ( A.y - B.y ) );
						if ( Math.abs( d ) < 1e-6 ) {
							continue;
						}
						const ux =
							( ( A.x * A.x + A.y * A.y ) * ( B.y - C.y ) +
								( B.x * B.x + B.y * B.y ) * ( C.y - A.y ) +
								( C.x * C.x + C.y * C.y ) * ( A.y - B.y ) ) /
							d;
						const uy =
							( ( A.x * A.x + A.y * A.y ) * ( C.x - B.x ) +
								( B.x * B.x + B.y * B.y ) * ( A.x - C.x ) +
								( C.x * C.x + C.y * C.y ) * ( B.x - A.x ) ) /
							d;
						const rad2 =
							( A.x - ux ) * ( A.x - ux ) +
							( A.y - uy ) * ( A.y - uy );
						let ok = true;
						for ( let m = 0; m < N; m++ ) {
							if ( m === i || m === j || m === k ) {
								continue;
							}
							const q = pts[ m ];
							if (
								( q.x - ux ) * ( q.x - ux ) +
									( q.y - uy ) * ( q.y - uy ) <
								rad2 - 1e-6
							) {
								ok = false;
								break;
							}
						}
						if ( ! ok ) {
							continue;
						}
						const cx = ( A.x + B.x + C.x ) / 3;
						const cy = ( A.y + B.y + C.y ) / 3;
						const f = 1 - p.gap;
						cmds.push(
							...roundedPolyCommands(
								[ A, B, C ].map( ( q ) => ( {
									x: cx + ( q.x - cx ) * f,
									y: cy + ( q.y - cy ) * f,
								} ) ),
								0,
								0
							)
						);
					}
				}
			}
			return cmds;
		},
	},
	{
		// Star-and-cross tiling: the Persian tile grid, eight-pointed
		// stars with a turned square between them.
		id: 'startile',
		name: () => __( 'Star tiling', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 3,
			},
			{
				key: 'points',
				label: () => __( 'Star points', 'wunderpaint' ),
				min: 6,
				max: 12,
				step: 1,
				def: 8,
			},
			{
				key: 'starSize',
				label: () => __( 'Star size', 'wunderpaint' ),
				...pct,
				min: 0.3,
				max: 1,
				def: 0.85,
			},
			{
				key: 'crossSize',
				label: () => __( 'Cross size', 'wunderpaint' ),
				...pct,
				max: 0.7,
				def: 0.32,
			},
		],
		presets: [
			{
				name: () => __( 'Persian tile', 'wunderpaint' ),
				params: { grid: 3, points: 8, starSize: 0.85, crossSize: 0.32 },
			},
			{
				name: () => __( 'Star field', 'wunderpaint' ),
				params: { grid: 6, points: 6, starSize: 0.9, crossSize: 0 },
			},
		],
		commands: ( w, h, p ) => {
			const n = Math.round( p.grid );
			const pts = Math.round( p.points );
			const cw = w / n;
			const ch = h / n;
			const cmds = [];
			for ( let gy = 0; gy < n; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					const cx = ( gx + 0.5 ) * cw;
					const cy = ( gy + 0.5 ) * ch;
					const rx = ( cw / 2 ) * p.starSize;
					const ry = ( ch / 2 ) * p.starSize;
					const ring = [];
					for ( let i = 0; i < pts * 2; i++ ) {
						const a = TOP + ( i / ( pts * 2 ) ) * TAU;
						const f = i % 2 ? 0.45 : 1;
						ring.push( {
							x: cx + rx * f * Math.cos( a ),
							y: cy + ry * f * Math.sin( a ),
						} );
					}
					cmds.push( ...roundedPolyCommands( ring, 0, 0 ) );
				}
			}
			if ( p.crossSize > 0.02 ) {
				// Turned squares on the INNER grid crossings only: on the
				// border ones half of every square hung out of the box.
				const sx = ( cw / 2 ) * p.crossSize;
				const sy = ( ch / 2 ) * p.crossSize;
				for ( let gy = 1; gy < n; gy++ ) {
					for ( let gx = 1; gx < n; gx++ ) {
						const cx = gx * cw;
						const cy = gy * ch;
						cmds.push(
							...roundedPolyCommands(
								[
									{ x: cx, y: cy - sy },
									{ x: cx + sx, y: cy },
									{ x: cx, y: cy + sy },
									{ x: cx - sx, y: cy },
								],
								0,
								0
							)
						);
					}
				}
			}
			return cmds;
		},
	},
	{
		// Herringbone: bricks at right angles, each pair an L, the whole
		// field marching diagonally.
		id: 'herringbone',
		name: () => __( 'Herringbone', 'wunderpaint' ),
		generator: true,
		corners: true,
		params: [
			{
				key: 'bricks',
				label: () => __( 'Bricks', 'wunderpaint' ),
				min: 2,
				max: 9,
				step: 1,
				def: 4,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				min: 0.02,
				max: 0.3,
				def: 0.08,
			},
		],
		presets: [
			{
				name: () => __( 'Parquet', 'wunderpaint' ),
				params: { bricks: 4, gap: 0.06 },
			},
			{
				name: () => __( 'Fine weave', 'wunderpaint' ),
				params: { bricks: 8, gap: 0.12 },
			},
		],
		commands: ( w, h, p, c ) => {
			const n = Math.round( p.bricks );
			const u = Math.min( w, h ) / n;
			const g = u * p.gap;
			const cmds = [];
			const brick = ( x0, y0, bw, bh ) => {
				if ( x0 > w || y0 > h || x0 + bw < 0 || y0 + bh < 0 ) {
					return;
				}
				const x1 = clamp( x0 + g, 0, w );
				const y1 = clamp( y0 + g, 0, h );
				const x2 = clamp( x0 + bw - g, 0, w );
				const y2 = clamp( y0 + bh - g, 0, h );
				if ( x2 - x1 < 0.5 || y2 - y1 < 0.5 ) {
					return;
				}
				cmds.push(
					...roundedPolyCommands(
						[
							{ x: x1, y: y1 },
							{ x: x2, y: y1 },
							{ x: x2, y: y2 },
							{ x: x1, y: y2 },
						],
						c.radius,
						c.smoothing
					)
				);
			};
			// The real herringbone lattice: an L-pair (one lying brick,
			// one standing one) repeated along v1 = ( -1, 1 ) and
			// v2 = ( 3, 1 ) in brick units. That cell holds exactly two
			// bricks, which is why the pattern locks with no gaps - the
			// first attempt just sheared rows and left staircases.
			const reach = Math.ceil( Math.max( w, h ) / u ) + 3;
			for ( let a = -reach; a <= reach; a++ ) {
				for ( let b = -reach; b <= reach; b++ ) {
					const ox = ( -a + 3 * b ) * u;
					const oy = ( a + b ) * u;
					if (
						ox > w + 2 * u ||
						oy > h + 2 * u ||
						ox < -3 * u ||
						oy < -3 * u
					) {
						continue;
					}
					brick( ox, oy, 2 * u, u );
					brick( ox + 2 * u, oy, u, 2 * u );
				}
			}
			return cmds;
		},
	},
	{
		// Isometric blocks: a stack of cubes, three faces each, with a
		// seam so the faces stay readable in one colour.
		id: 'isoblocks',
		name: () => __( 'Isometric blocks', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'cols',
				label: () => __( 'Columns', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 4,
			},
			{
				key: 'heightV',
				label: () => __( 'Height variance', 'wunderpaint' ),
				...pct,
				def: 0.6,
			},
			{
				key: 'seam',
				label: () => __( 'Seam', 'wunderpaint' ),
				...pct,
				max: 0.2,
				def: 0.05,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 5,
			},
		],
		presets: [
			{
				name: () => __( 'City', 'wunderpaint' ),
				params: { cols: 5, heightV: 0.9, seam: 0.06, seed: 12 },
			},
			{
				name: () => __( 'Block stack', 'wunderpaint' ),
				params: { cols: 3, heightV: 0.2, seam: 0.1, seed: 3 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.cols );
			// Isometric unit: half width, quarter height per cell.
			const ux = w / ( 2 * n );
			const uy = ux * 0.5;
			const maxLift = h - 2 * n * uy - 4;
			const cmds = [];
			const face = ( pts ) => {
				let cx = 0;
				let cy = 0;
				for ( const q of pts ) {
					cx += q.x / pts.length;
					cy += q.y / pts.length;
				}
				const f = 1 - p.seam;
				cmds.push(
					...roundedPolyCommands(
						pts.map( ( q ) => ( {
							x: clamp( cx + ( q.x - cx ) * f, 0, w ),
							y: clamp( cy + ( q.y - cy ) * f, 0, h ),
						} ) ),
						0,
						0
					)
				);
			};
			// Back to front, so nearer blocks sit over farther ones.
			for ( let gy = 0; gy < n; gy++ ) {
				for ( let gx = n - 1; gx >= 0; gx-- ) {
					const lift =
						Math.max( 0, maxLift ) *
						( 0.25 + 0.75 * p.heightV * rnd() );
					const bx = w / 2 + ( gx - gy ) * ux;
					const by = 2 + ( gx + gy ) * uy + maxLift - lift;
					const top = [
						{ x: bx, y: by },
						{ x: bx + ux, y: by + uy },
						{ x: bx, y: by + 2 * uy },
						{ x: bx - ux, y: by + uy },
					];
					face( top );
					face( [
						{ x: bx - ux, y: by + uy },
						{ x: bx, y: by + 2 * uy },
						{ x: bx, y: by + 2 * uy + lift },
						{ x: bx - ux, y: by + uy + lift },
					] );
					face( [
						{ x: bx, y: by + 2 * uy },
						{ x: bx + ux, y: by + uy },
						{ x: bx + ux, y: by + uy + lift },
						{ x: bx, y: by + 2 * uy + lift },
					] );
				}
			}
			return cmds;
		},
	},
	{
		// Data blocks: a seeded matrix of squares. Tech-poster texture -
		// deliberately NOT a scannable code of any kind.
		id: 'datablocks',
		name: () => __( 'Data blocks', 'wunderpaint' ),
		generator: true,
		corners: true,
		params: [
			{
				key: 'grid',
				label: () => __( 'Grid', 'wunderpaint' ),
				min: 4,
				max: 24,
				step: 1,
				def: 10,
			},
			{
				key: 'density',
				label: () => __( 'Density', 'wunderpaint' ),
				...pct,
				min: 0.1,
				max: 0.95,
				def: 0.5,
			},
			{
				key: 'gap',
				label: () => __( 'Gap', 'wunderpaint' ),
				...pct,
				max: 0.6,
				def: 0.15,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 7,
			},
		],
		presets: [
			{
				name: () => __( 'Data', 'wunderpaint' ),
				params: { grid: 12, density: 0.5, gap: 0.14, seed: 7 },
			},
			{
				name: () => __( 'Sparse dots', 'wunderpaint' ),
				params: { grid: 20, density: 0.2, gap: 0.35, seed: 21 },
			},
		],
		commands: ( w, h, p, c ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.grid );
			const cw = w / n;
			const rows = Math.max( 1, Math.round( h / cw ) );
			const ch = h / rows;
			const cmds = [];
			for ( let gy = 0; gy < rows; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					if ( rnd() > p.density ) {
						continue;
					}
					const gxp = ( cw * p.gap ) / 2;
					const gyp = ( ch * p.gap ) / 2;
					cmds.push(
						...roundedPolyCommands(
							[
								{ x: gx * cw + gxp, y: gy * ch + gyp },
								{ x: ( gx + 1 ) * cw - gxp, y: gy * ch + gyp },
								{
									x: ( gx + 1 ) * cw - gxp,
									y: ( gy + 1 ) * ch - gyp,
								},
								{ x: gx * cw + gxp, y: ( gy + 1 ) * ch - gyp },
							],
							c.radius,
							c.smoothing
						)
					);
				}
			}
			return cmds;
		},
	},
	{
		// Film strip: sprocket holes down both edges, frame windows in
		// the middle - all as reversed subpaths, so they punch through.
		id: 'filmstrip',
		name: () => __( 'Film strip', 'wunderpaint' ),
		generator: true,
		aspect: 2.6,
		params: [
			{
				key: 'frames',
				label: () => __( 'Frames', 'wunderpaint' ),
				min: 1,
				max: 6,
				step: 1,
				def: 3,
			},
			{
				key: 'holes',
				label: () => __( 'Hole size', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1,
				def: 0.6,
			},
			{
				key: 'window',
				label: () => __( 'Window', 'wunderpaint' ),
				...pct,
				max: 0.9,
				def: 0.7,
			},
		],
		presets: [
			{
				name: () => __( 'Film strip', 'wunderpaint' ),
				params: { frames: 3, holes: 0.6, window: 0.7 },
			},
			{
				name: () => __( 'Perforated band', 'wunderpaint' ),
				params: { frames: 1, holes: 0.9, window: 0 },
			},
		],
		commands: ( w, h, p ) => {
			const cmds = [
				...roundedPolyCommands( rectVertices( w, h ), 0, 0 ),
			];
			const band = h * 0.18;
			const holeH = band * p.holes * 0.7;
			const perRow = Math.max( 2, Math.round( w / ( holeH * 2.2 ) ) );
			const rect = ( x0, y0, x1, y1 ) =>
				// Reversed winding: this is a hole, not a block.
				cmds.push(
					mv( { x: x0, y: y0 } ),
					ln( { x: x0, y: y1 } ),
					ln( { x: x1, y: y1 } ),
					ln( { x: x1, y: y0 } ),
					{ t: 'Z' }
				);
			for ( let i = 0; i < perRow; i++ ) {
				const hw = holeH * 0.6;
				// Hole centres live inside a field inset by their own
				// half width, so no sprocket bleeds off the strip.
				const cx = hw + ( ( w - 2 * hw ) * ( i + 0.5 ) ) / perRow;
				for ( const cy of [ band / 2, h - band / 2 ] ) {
					rect( cx - hw, cy - holeH / 2, cx + hw, cy + holeH / 2 );
				}
			}
			if ( p.window > 0.02 ) {
				const frames = Math.round( p.frames );
				const inner = h - 2 * band;
				const fw = w / frames;
				const mx = ( fw * ( 1 - p.window ) ) / 2 + 2;
				const my = ( inner * ( 1 - p.window ) ) / 2 + 2;
				for ( let i = 0; i < frames; i++ ) {
					rect(
						i * fw + mx,
						band + my,
						( i + 1 ) * fw - mx,
						h - band - my
					);
				}
			}
			return cmds;
		},
	},
	{
		// A strip with torn edges: fractal displacement top and bottom,
		// the section divider that looks like ripped paper.
		id: 'tornstrip',
		name: () => __( 'Torn strip', 'wunderpaint' ),
		generator: true,
		aspect: 3.5,
		params: [
			{
				key: 'roughness',
				label: () => __( 'Roughness', 'wunderpaint' ),
				...pct,
				min: 0.1,
				def: 0.5,
			},
			{
				key: 'detail',
				label: () => __( 'Detail', 'wunderpaint' ),
				min: 2,
				max: 7,
				step: 1,
				def: 5,
			},
			{
				key: 'edges',
				label: () => __( 'Edges', 'wunderpaint' ),
				min: 1,
				max: 2,
				step: 1,
				def: 2,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 11,
			},
		],
		presets: [
			{
				name: () => __( 'Torn paper', 'wunderpaint' ),
				params: { roughness: 0.5, detail: 5, edges: 2, seed: 11 },
			},
			{
				name: () => __( 'Ripped edge', 'wunderpaint' ),
				params: { roughness: 0.9, detail: 6, edges: 1, seed: 4 },
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const steps = Math.round( p.detail );
			// Midpoint displacement along one edge, 0..1.
			const edge = () => {
				let ys = [ rnd(), rnd() ];
				let amp = 0.5;
				for ( let it = 0; it < steps; it++ ) {
					const next = [];
					for ( let i = 0; i < ys.length - 1; i++ ) {
						next.push( ys[ i ] );
						next.push(
							( ys[ i ] + ys[ i + 1 ] ) / 2 +
								( rnd() - 0.5 ) * amp
						);
					}
					next.push( ys[ ys.length - 1 ] );
					ys = next;
					amp *= 0.55;
				}
				const lo = Math.min( ...ys );
				const hi = Math.max( ...ys );
				return ys.map( ( v ) => ( v - lo ) / ( hi - lo || 1 ) );
			};
			const tear = h * 0.3 * p.roughness;
			const top = edge();
			const bottom = 2 === Math.round( p.edges ) ? edge() : null;
			const topPts = top.map( ( v, i ) => ( {
				x: ( w * i ) / ( top.length - 1 ),
				y: v * tear,
			} ) );
			const botPts = ( bottom || top ).map( ( v, i ) => ( {
				x: w - ( w * i ) / ( top.length - 1 ),
				y: h - ( bottom ? v * tear : 0 ),
			} ) );
			return [
				mv( topPts[ 0 ] ),
				...topPts.slice( 1 ).map( ln ),
				...botPts.map( ln ),
				{ t: 'Z' },
			];
		},
	},
	{
		// Hatching: the flow field broken into short strokes - texture
		// rather than ribbons.
		id: 'hatching',
		name: () => __( 'Hatching', 'wunderpaint' ),
		generator: true,
		params: [
			{
				key: 'density',
				label: () => __( 'Density', 'wunderpaint' ),
				min: 4,
				max: 20,
				step: 1,
				def: 10,
			},
			{
				key: 'length',
				label: () => __( 'Stroke length', 'wunderpaint' ),
				...pct,
				min: 0.2,
				max: 1,
				def: 0.7,
			},
			{
				key: 'turbulence',
				label: () => __( 'Turbulence', 'wunderpaint' ),
				...pct,
				def: 0.5,
			},
			{
				key: 'thickness',
				label: () => __( 'Thickness', 'wunderpaint' ),
				...pct,
				min: 0.04,
				max: 0.4,
				def: 0.14,
			},
			{
				key: 'seed',
				label: () => __( 'Seed', 'wunderpaint' ),
				min: 1,
				max: 999,
				step: 1,
				def: 3,
			},
		],
		presets: [
			{
				name: () => __( 'Pencil shading', 'wunderpaint' ),
				params: {
					density: 14,
					length: 0.8,
					turbulence: 0.35,
					thickness: 0.08,
					seed: 3,
				},
			},
			{
				name: () => __( 'Fur', 'wunderpaint' ),
				params: {
					density: 12,
					length: 0.5,
					turbulence: 1,
					thickness: 0.22,
					seed: 9,
				},
			},
		],
		commands: ( w, h, p ) => {
			const rnd = seededRandom( p.seed );
			const n = Math.round( p.density );
			const cw = w / n;
			const rows = Math.max( 2, Math.round( h / cw ) );
			const ch = h / rows;
			const cell = Math.min( cw, ch );
			const half = ( cell * p.thickness ) / 2;
			const len = cell * p.length;
			const ph = [ rnd() * TAU, rnd() * TAU ];
			const cmds = [];
			for ( let gy = 0; gy < rows; gy++ ) {
				for ( let gx = 0; gx < n; gx++ ) {
					const cx = ( gx + 0.5 ) * cw;
					const cy = ( gy + 0.5 ) * ch;
					// One smooth angle field, plus a seeded nudge.
					const a =
						p.turbulence *
							1.4 *
							( Math.sin( ( cx / w ) * 4.3 + ph[ 0 ] ) *
								Math.cos( ( cy / h ) * 3.1 + ph[ 1 ] ) ) +
						( rnd() - 0.5 ) * p.turbulence * 0.8;
					const dx = ( Math.cos( a ) * len ) / 2;
					const dy = ( Math.sin( a ) * len ) / 2;
					const pts = [
						{ x: cx - dx, y: cy - dy },
						{ x: cx + dx, y: cy + dy },
					];
					for ( const run of insideRuns( pts, w, h, half ) ) {
						cmds.push( ...bandFrom( run, () => half ) );
					}
				}
			}
			return cmds;
		},
	},
];

// Prototype-free: a document's `shape` is data, and `"constructor"` or
// `"__proto__"` used to come back as a Function from a plain object and
// throw in the paint loop. Every lookup below and in the panels goes
// through this map, so the fix lives in the map, not at each site.
export const DYNAMIC_SHAPE_MAP = DYNAMIC_SHAPES.reduce( ( map, s ) => {
	map[ s.id ] = s;
	return map;
}, Object.create( null ) );

/** Whether this shape keyword has a dynamic (parametric) definition. */
export const isDynamicShape = ( id ) => !! DYNAMIC_SHAPE_MAP[ id ];

/**
 * The registry defaults for a shape, as a plain { key: value } object.
 *
 * @param {string} id Shape keyword.
 * @return {Object} Defaults (empty for unknown shapes).
 */
export function dynamicDefaults( id ) {
	const def = DYNAMIC_SHAPE_MAP[ id ];
	const out = {};
	for ( const prm of def?.params || [] ) {
		out[ prm.key ] = prm.def;
	}
	return out;
}

/** Every dynamic family id in the registry (Design Markup catalog). */
export function dynamicShapeIds() {
	return Object.keys( DYNAMIC_SHAPE_MAP );
}

/**
 * Merge a layer's stored dials over the defaults, clamped to each dial's
 * range so a hand-edited document cannot fold the geometry.
 *
 * @param {string}  id     Shape keyword.
 * @param {?Object} stored layer.shapeParams (may be missing).
 * @return {Object} Complete, clamped parameter set.
 */
export function resolvedParams( id, stored ) {
	const def = DYNAMIC_SHAPE_MAP[ id ];
	const out = {};
	for ( const prm of def?.params || [] ) {
		const v = Number( stored?.[ prm.key ] );
		out[ prm.key ] = Number.isFinite( v )
			? clamp( v, prm.min, prm.max )
			: prm.def;
	}
	return out;
}

/**
 * The command list for a dynamic shape layer, or null when the layer is
 * not dynamic (or defers to the legacy path, like an unsliced ellipse).
 *
 * @param {Object} layer Shape layer.
 * @return {?Array} corner-geometry commands.
 */
const commandCache = new Map();

export function dynamicShapeCommands( layer ) {
	const def = DYNAMIC_SHAPE_MAP[ layer?.shape ];
	if ( ! def || layer.pathD ) {
		return null;
	}
	const w = Math.max( 1, layer.w || 0 );
	const h = Math.max( 1, layer.h || 0 );
	const params = resolvedParams( layer.shape, layer.shapeParams );
	const corner = {
		radius: def.corners ? layer.radius : 0,
		smoothing: def.corners ? layer.cornerSmoothing : 0,
	};
	// drawShape runs on every frame and a guilloche samples two thousand
	// points; same dials + same box = same list, so keep the last few.
	const key =
		layer.shape +
		'|' +
		w +
		'x' +
		h +
		'|' +
		JSON.stringify( params ) +
		'|' +
		JSON.stringify( corner.radius ?? 0 ) +
		'|' +
		( corner.smoothing || 0 );
	if ( commandCache.has( key ) ) {
		return commandCache.get( key );
	}
	const out = def.commands( w, h, params, corner );
	if ( commandCache.size > 160 ) {
		commandCache.clear();
	}
	commandCache.set( key, out );
	return out;
}
