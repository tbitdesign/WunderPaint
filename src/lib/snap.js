/**
 * Snapping, smart guides and live measurements (spec 05.5, rebuilt 1.431).
 *
 * A drag moves the selection FRAME, the box the selection frame shows (a
 * rotated layer by its footprint, a group or several layers as the union of
 * their leaves). That frame snaps to what the user sees: the edges and
 * centres of the other layers and groups (rotated ones by their footprint,
 * warped ones by their corners, clipped ones by the part their base lets
 * through), the canvas, guides and grid, and equal gaps between neighbours.
 * The drag also measures the distance to the nearest edge on every side.
 *
 * Everything here is pure: the move handler builds one scene per drag and
 * asks for one result per pointer move.
 */

import { layerFootprint, topGroupOf } from './selection-units';
import { withDescendants } from '../store/editor-context';

/* One implementation serves both axes: `pos`/`size` run along the axis,
   `cross`/`crossSize` across it; `guide` names the line that marks it. */
const X = { pos: 'x', size: 'w', cross: 'y', crossSize: 'h', guide: 'v' };
const Y = { pos: 'y', size: 'h', cross: 'x', crossSize: 'w', guide: 'h' };
const AXES = [ X, Y ];

const endOf = ( box, A ) => box[ A.pos ] + box[ A.size ];
const crossEnd = ( box, A ) => box[ A.cross ] + box[ A.crossSize ];

/** Start, centre and end of a box along one axis. */
const stations = ( box, A ) => [
	box[ A.pos ],
	box[ A.pos ] + box[ A.size ] / 2,
	endOf( box, A ),
];

/**
 * Do two boxes face each other along the axis, i.e. share some of the cross
 * axis? A zero-thickness box (a straight line shape) counts when it runs
 * through the other one.
 */
const sharesCross = ( a, b, A ) => {
	const shared =
		Math.min( crossEnd( a, A ), crossEnd( b, A ) ) -
		Math.max( a[ A.cross ], b[ A.cross ] );
	return (
		shared > 0 ||
		( 0 === shared && ( 0 === a[ A.crossSize ] || 0 === b[ A.crossSize ] ) )
	);
};

/** Middle of the stretch two boxes share across the axis. */
const crossMiddle = ( a, b, A ) =>
	( Math.max( a[ A.cross ], b[ A.cross ] ) +
		Math.min( crossEnd( a, A ), crossEnd( b, A ) ) ) /
	2;

/** A measuring line from `from` to `to` along the axis, at `at` across it. */
const measureLine = ( A, from, to, at ) =>
	X === A
		? { x1: from, y1: at, x2: to, y2: at }
		: { x1: at, y1: from, x2: at, y2: to };

/** Union of boxes (nulls skipped), or null. */
function unionBoxes( boxes ) {
	const list = boxes.filter( Boolean );
	if ( ! list.length ) {
		return null;
	}
	const x = Math.min( ...list.map( ( b ) => b.x ) );
	const y = Math.min( ...list.map( ( b ) => b.y ) );
	return {
		x,
		y,
		w: Math.max( ...list.map( ( b ) => b.x + b.w ) ) - x,
		h: Math.max( ...list.map( ( b ) => b.y + b.h ) ) - y,
	};
}

/** Overlap of two boxes, or null when they miss each other. */
function intersectBoxes( a, b ) {
	const x = Math.max( a.x, b.x );
	const y = Math.max( a.y, b.y );
	const w = Math.min( a.x + a.w, b.x + b.w ) - x;
	const h = Math.min( a.y + a.h, b.y + b.h ) - y;
	return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/**
 * The canvas box a layer covers: a rotated layer by its footprint, a warped
 * (Distort/Perspective) one by its four corners.
 *
 * @param {Object} layer Layer.
 * @return {Object} { x, y, w, h }.
 */
export function coverBox( layer ) {
	const quad = layer.quad;
	if ( quad && quad.tl && quad.tr && quad.br && quad.bl ) {
		const xs = [ quad.tl.x, quad.tr.x, quad.br.x, quad.bl.x ];
		const ys = [ quad.tl.y, quad.tr.y, quad.br.y, quad.bl.y ];
		const x = Math.min( ...xs );
		const y = Math.min( ...ys );
		return { x, y, w: Math.max( ...xs ) - x, h: Math.max( ...ys ) - y };
	}
	return layerFootprint( layer );
}

/** Adjustment layers and eraser strokes show no box of their own. */
const paints = ( layer ) =>
	'adjustment' !== layer.type && ! ( 'stroke' === layer.type && layer.erase );

/**
 * Visible boxes for a layer list. `moving` layers are left out of group
 * unions and of the clipping windows they would open.
 *
 * @param {Array} layers Flat layer list.
 * @param {Set}   moving Ids that move.
 * @return {Object} { byId, siblings, hidden, boxOf }.
 */
function resolver( layers, moving = new Set() ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const parentOf = ( l ) => ( l.parent && byId.get( l.parent ) ) || null;

	// A hidden group hides its whole subtree: the renderer skips it, while
	// the children keep their own `visible: true`.
	const hiddenMemo = new Map();
	const hidden = ( l ) => {
		if ( ! hiddenMemo.has( l.id ) ) {
			hiddenMemo.set( l.id, false ); // a broken parent cycle ends here
			const parent = parentOf( l );
			hiddenMemo.set(
				l.id,
				! l.visible || ( !! parent && hidden( parent ) )
			);
		}
		return hiddenMemo.get( l.id );
	};

	const siblings = new Map();
	for ( const l of layers ) {
		const key = l.parent || '';
		if ( ! siblings.has( key ) ) {
			siblings.set( key, [] );
		}
		siblings.get( key ).push( l );
	}
	// Same rule as the renderer: a clipped layer shows through the nearest
	// earlier sibling that paints and is not clipped itself.
	const baseOf = ( l ) => {
		const list = siblings.get( l.parent || '' );
		for ( let i = list.indexOf( l ) - 1; i >= 0; i-- ) {
			const below = list[ i ];
			if ( below.visible && ! below.clipped && paints( below ) ) {
				return below;
			}
		}
		return null;
	};

	const memo = new Map();
	const measure = ( l ) => {
		if ( 'group' === l.type ) {
			return unionBoxes(
				( l.children || [] )
					.map( ( id ) => byId.get( id ) )
					.filter( ( c ) => c && c.visible && ! moving.has( c.id ) )
					.map( boxOf )
			);
		}
		if ( ! paints( l ) ) {
			return null;
		}
		const box = coverBox( l );
		if ( box.w <= 0 && box.h <= 0 ) {
			return null;
		}
		const base = l.clipped ? baseOf( l ) : null;
		if ( ! base ) {
			return box;
		}
		// The window moves with the drag; there is no still box to offer.
		if ( moving.has( base.id ) ) {
			return null;
		}
		const opening = boxOf( base );
		return opening && intersectBoxes( box, opening );
	};
	function boxOf( l ) {
		if ( ! memo.has( l.id ) ) {
			memo.set( l.id, null ); // a broken children cycle ends here
			memo.set( l.id, measure( l ) );
		}
		return memo.get( l.id );
	}

	return { byId, siblings, hidden, boxOf };
}

/**
 * What a layer or group shows on the canvas: rotated and warped layers by
 * the area they cover, clipped ones by the part their base lets through,
 * groups by their visible members. A group's own x/y/w/h is NOT used - it
 * is not kept up to date (a new group starts at 0/0/0/0).
 *
 * @param {Array}  layers Flat layer list.
 * @param {Object} layer  Layer or group.
 * @return {Object|null} { x, y, w, h }, or null when nothing shows.
 */
export function visibleBox( layers, layer ) {
	return resolver( layers ).boxOf( layer );
}

/**
 * The frame a selection shows: the footprints of its leaves joined, the way
 * the selection frame draws a group or several layers (a single rotated
 * layer by its footprint).
 *
 * @param {Array} layers Flat layer list.
 * @param {Array} ids    Selected ids (groups resolve to their leaves).
 * @param {Map}   [at]   Optional id → { x, y } overrides, e.g. drag start.
 * @return {Object|null} { x, y, w, h }.
 */
export function frameBox( layers, ids, at = null ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const seen = new Set();
	const boxes = [];
	const visit = ( id ) => {
		const layer = byId.get( id );
		if ( ! layer || seen.has( id ) ) {
			return;
		}
		seen.add( id );
		if ( 'group' === layer.type ) {
			( layer.children || [] ).forEach( visit );
			return;
		}
		const pos = at && at.get( id );
		boxes.push( layerFootprint( pos ? { ...layer, ...pos } : layer ) );
	};
	ids.forEach( visit );
	return unionBoxes( boxes );
}

/**
 * Everything a drag can snap to or measure against, built once per drag.
 *
 * - `lines.x` / `lines.y`: snap positions, each { pos, box, kind } with kind
 *   object | canvas | guide | grid (box only for objects).
 * - `walls`: boxes the live measurement runs to (visible leaves + canvas).
 * - `objects`: the moving selection's siblings for equal gaps - the layers
 *   on its own level, each group as one unit.
 *
 * Moving layers are left out, and so is every group around one, since
 * those change shape while the drag runs.
 *
 * @param {Object} state     { doc, layers, showGrid, gridSize }.
 * @param {Array}  movingIds Ids that move (units with their descendants).
 * @return {Object} Scene.
 */
export function buildSnapScene( state, movingIds = [] ) {
	const doc = state.doc || { w: 0, h: 0 };
	const layers = state.layers || [];
	const moving = new Set( movingIds );
	const { byId, siblings, hidden, boxOf } = resolver( layers, moving );

	const around = new Set();
	for ( const id of moving ) {
		let parent = byId.get( byId.get( id )?.parent );
		while ( parent && ! around.has( parent.id ) ) {
			around.add( parent.id );
			parent = byId.get( parent.parent );
		}
	}
	const still = ( l ) =>
		! moving.has( l.id ) && ! around.has( l.id ) && ! hidden( l );

	const canvas = { x: 0, y: 0, w: doc.w, h: doc.h };
	const lines = { x: [], y: [] };
	const add = ( A, pos, box, kind ) =>
		lines[ A.pos ].push( { pos, box, kind } );
	const walls = [ canvas ];
	for ( const A of AXES ) {
		stations( canvas, A ).forEach( ( pos ) =>
			add( A, pos, null, 'canvas' )
		);
	}
	for ( const l of layers ) {
		const box = still( l ) ? boxOf( l ) : null;
		if ( ! box ) {
			continue;
		}
		for ( const A of AXES ) {
			stations( box, A ).forEach( ( pos ) =>
				add( A, pos, box, 'object' )
			);
		}
		if ( 'group' !== l.type ) {
			walls.push( box );
		}
	}
	for ( const guide of doc.guides || [] ) {
		add( 'v' === guide.axis ? X : Y, guide.pos, null, 'guide' );
	}
	if ( state.showGrid ) {
		const step = Math.max( 1, state.gridSize || 50 );
		for ( let at = 0; at <= doc.w; at += step ) {
			add( X, at, null, 'grid' );
		}
		for ( let at = 0; at <= doc.h; at += step ) {
			add( Y, at, null, 'grid' );
		}
	}

	const roots = [ ...moving ]
		.map( ( id ) => byId.get( id ) )
		.filter( ( l ) => l && ! moving.has( l.parent ) );
	const levels = new Set( roots.map( ( l ) => l.parent || '' ) );
	const level = 1 === levels.size ? [ ...levels ][ 0 ] : '';
	const objects = ( siblings.get( level ) || [] )
		.filter( ( l ) => still( l ) && ! l.clipped )
		.map( boxOf )
		.filter( Boolean );

	return { doc, lines, walls, objects };
}

/* ------------------------------ equal gaps ----------------------------- */

/** Objects beside the frame along the axis. */
const rowOf = ( A, rect, objects ) =>
	objects.filter( ( o ) => sharesCross( o, rect, A ) );

/**
 * Nearest object before and after the frame. `slack` lets an object that
 * overlaps the frame by that much still count as a neighbour.
 */
function neighbours( A, rect, row, slack ) {
	let before = null;
	let after = null;
	for ( const o of row ) {
		const end = endOf( o, A );
		if (
			end <= rect[ A.pos ] + slack &&
			( ! before || end > endOf( before, A ) )
		) {
			before = o;
		}
		if (
			o[ A.pos ] >= endOf( rect, A ) - slack &&
			( ! after || o[ A.pos ] < after[ A.pos ] )
		) {
			after = o;
		}
	}
	return { before, after };
}

/**
 * Gaps between neighbours in a row: every object to the nearest one before
 * it. The frame stands in the row, so no gap reaches across it, but it
 * never forms a pair itself.
 */
function rowGaps( A, row, rect, eps ) {
	const gaps = [];
	for ( const b of row ) {
		let a = null;
		for ( const o of [ ...row, rect ] ) {
			if ( o === b || ! sharesCross( o, b, A ) ) {
				continue;
			}
			const end = endOf( o, A );
			if ( end <= b[ A.pos ] + eps && ( ! a || end > endOf( a, A ) ) ) {
				a = o;
			}
		}
		const gap = a && a !== rect ? b[ A.pos ] - endOf( a, A ) : 0;
		if ( gap > eps ) {
			gaps.push( { a, b, gap } );
		}
	}
	return gaps;
}

/**
 * Corrections that put the frame at an equal gap: midway between its two
 * neighbours, or next to one of them at a gap the row already uses.
 */
function gapOffers( A, rect, objects, threshold ) {
	const row = rowOf( A, rect, objects );
	if ( ! row.length ) {
		return [];
	}
	const { before, after } = neighbours( A, rect, row, threshold );
	const start = rect[ A.pos ];
	const offers = [];
	if ( before && after ) {
		const free = after[ A.pos ] - endOf( before, A ) - rect[ A.size ];
		if ( free > 0 ) {
			offers.push( endOf( before, A ) + free / 2 - start );
		}
	}
	for ( const { gap } of rowGaps( A, row, rect, 0 ) ) {
		if ( before ) {
			offers.push( endOf( before, A ) + gap - start );
		}
		if ( after ) {
			offers.push( after[ A.pos ] - gap - rect[ A.size ] - start );
		}
	}
	return offers;
}

/**
 * The equal gaps that hold with the frame where it is: its gap to a
 * neighbour when the gap on its other side or a gap elsewhere in the row
 * matches, together with every matching gap.
 */
function spacingMarks( A, rect, objects, eps ) {
	const row = rowOf( A, rect, objects );
	const { before, after } = neighbours( A, rect, row, eps );
	const sides = [];
	if ( before && rect[ A.pos ] - endOf( before, A ) > eps ) {
		sides.push( {
			a: before,
			b: rect,
			gap: rect[ A.pos ] - endOf( before, A ),
			side: 'before',
		} );
	}
	if ( after && after[ A.pos ] - endOf( rect, A ) > eps ) {
		sides.push( {
			a: rect,
			b: after,
			gap: after[ A.pos ] - endOf( rect, A ),
			side: 'after',
		} );
	}
	if ( ! sides.length ) {
		return [];
	}
	const pairs = rowGaps( A, row, rect, eps );
	const shown = [];
	for ( const side of sides ) {
		const same = pairs.filter(
			( p ) => Math.abs( p.gap - side.gap ) <= eps
		);
		const twin = sides.some(
			( s ) => s !== side && Math.abs( s.gap - side.gap ) <= eps
		);
		if ( ! same.length && ! twin ) {
			continue;
		}
		for ( const pair of [ side, ...same ] ) {
			if ( ! shown.includes( pair ) ) {
				shown.push( pair );
			}
		}
	}
	return shown.map( ( p ) => ( {
		line: measureLine(
			A,
			endOf( p.a, A ),
			p.b[ A.pos ],
			crossMiddle( p.a, p.b, A )
		),
		value: p.gap,
		axis: A.pos,
		side: p.side || null,
	} ) );
}

/* ------------------------------- snapping ------------------------------ */

/**
 * The correction along one axis: the smallest one within the threshold,
 * from edge and centre alignment or from an equal gap.
 */
function snapAxis( A, rect, scene, threshold ) {
	let best = 0;
	let bestDist = Infinity;
	const offer = ( d ) => {
		const dist = Math.abs( d );
		if ( dist <= threshold && dist < bestDist ) {
			best = d;
			bestDist = dist;
		}
	};
	for ( const edge of stations( rect, A ) ) {
		for ( const line of scene.lines[ A.pos ] ) {
			offer( line.pos - edge );
		}
	}
	gapOffers( A, rect, scene.objects, threshold ).forEach( offer );
	return best;
}

/**
 * The guide lines that hold with the frame where it is. A line to other
 * objects runs from the frame across all of them; a canvas or guide line
 * runs the length of the canvas. The grid snaps but draws nothing extra:
 * it shows already, and a frame on three grid lines would light up three.
 */
function alignLines( A, rect, scene, eps ) {
	const docCross = X === A ? scene.doc.h : scene.doc.w;
	const found = [];
	for ( const edge of stations( rect, A ) ) {
		if ( found.some( ( f ) => Math.abs( f.pos - edge ) <= eps ) ) {
			continue;
		}
		const hits = scene.lines[ A.pos ].filter(
			( line ) =>
				'grid' !== line.kind && Math.abs( line.pos - edge ) <= eps
		);
		if ( ! hits.length ) {
			continue;
		}
		let from = rect[ A.cross ];
		let to = crossEnd( rect, A );
		for ( const { box } of hits ) {
			from = Math.min( from, box ? box[ A.cross ] : 0 );
			to = Math.max( to, box ? crossEnd( box, A ) : docCross );
		}
		found.push( { axis: A.guide, pos: edge, from, to } );
	}
	return found;
}

/**
 * The distance from the frame to the nearest edge on both sides along the
 * axis: an element beside it, or the element or canvas it sits in.
 */
function nearestEdges( A, rect, walls, eps ) {
	const start = rect[ A.pos ];
	const end = endOf( rect, A );
	let before = null;
	let after = null;
	for ( const wall of walls ) {
		if ( ! sharesCross( wall, rect, A ) ) {
			continue;
		}
		for ( const at of [ wall[ A.pos ], endOf( wall, A ) ] ) {
			if ( at <= start + eps && ( ! before || at > before.at ) ) {
				before = { at, wall };
			}
			if ( at >= end - eps && ( ! after || at < after.at ) ) {
				after = { at, wall };
			}
		}
	}
	const out = [];
	if ( before && start - before.at > eps ) {
		out.push( {
			line: measureLine(
				A,
				before.at,
				start,
				crossMiddle( rect, before.wall, A )
			),
			value: start - before.at,
			axis: A.pos,
			side: 'before',
		} );
	}
	if ( after && after.at - end > eps ) {
		out.push( {
			line: measureLine(
				A,
				end,
				after.at,
				crossMiddle( rect, after.wall, A )
			),
			value: after.at - end,
			axis: A.pos,
			side: 'after',
		} );
	}
	return out;
}

/**
 * One pointer move of a drag: snap the frame, then describe what holds.
 *
 * @param {Object} rect  Frame at the raw pointer position { x, y, w, h }.
 * @param {Object} scene From buildSnapScene().
 * @param {Object} opts  { snap, threshold, eps } - both in document px.
 * @return {Object} { dx, dy, lines, spacing, distances }: the correction,
 *         guide lines { axis, pos, from, to }, equal gaps and the distances
 *         to the nearest edges ({ line, value } each).
 */
export function smartSnap( rect, scene, opts = {} ) {
	const { snap = true, threshold = 6, eps = 0.5 } = opts;
	const dx = snap ? snapAxis( X, rect, scene, threshold ) : 0;
	const dy = snap ? snapAxis( Y, rect, scene, threshold ) : 0;
	const at = { ...rect, x: rect.x + dx, y: rect.y + dy };
	const lines = snap
		? AXES.flatMap( ( A ) => alignLines( A, at, scene, eps ) )
		: [];
	const spacing = snap
		? AXES.flatMap( ( A ) => spacingMarks( A, at, scene.objects, eps ) )
		: [];
	// A side whose gap already shows as an equal gap needs no second label.
	const distances = AXES.flatMap( ( A ) =>
		nearestEdges( A, at, scene.walls, eps )
	).filter(
		( d ) =>
			! spacing.some( ( s ) => s.axis === d.axis && s.side === d.side )
	);
	return { dx, dy, lines, spacing, distances };
}

/* ------------------------------ Alt measure ---------------------------- */

/**
 * Edge gaps between two rects for measurement overlays (v0.7).
 * Positive gap = empty space between the facing edges; 0 = overlap.
 *
 * @param {Object} a { x, y, w, h }.
 * @param {Object} b { x, y, w, h }.
 * @return {{gapX:number,gapY:number,xLine:Object|null,yLine:Object|null}}
 *         Lines are { x1, y1, x2, y2 } in doc space (null when overlapping).
 */
export function edgeDistances( a, b ) {
	const aR = a.x + a.w;
	const bR = b.x + b.w;
	const aB = a.y + a.h;
	const bB = b.y + b.h;
	const midY = ( Math.max( a.y, b.y ) + Math.min( aB, bB ) ) / 2;
	const midX = ( Math.max( a.x, b.x ) + Math.min( aR, bR ) ) / 2;

	let gapX = 0;
	let xLine = null;
	if ( bR < a.x ) {
		gapX = a.x - bR;
		xLine = { x1: bR, y1: midY, x2: a.x, y2: midY };
	} else if ( b.x > aR ) {
		gapX = b.x - aR;
		xLine = { x1: aR, y1: midY, x2: b.x, y2: midY };
	}

	let gapY = 0;
	let yLine = null;
	if ( bB < a.y ) {
		gapY = a.y - bB;
		yLine = { x1: midX, y1: bB, x2: midX, y2: a.y };
	} else if ( b.y > aB ) {
		gapY = b.y - aB;
		yLine = { x1: midX, y1: aB, x2: midX, y2: b.y };
	}
	return { gapX, gapY, xLine, yLine };
}

/**
 * The four gaps from a box to the inner edges of a box around it (left,
 * right, top, bottom), drawn through the box's centre. Negative when the
 * box spills past that edge.
 *
 * @param {Object} box    { x, y, w, h }.
 * @param {Object} around { x, y, w, h }.
 * @return {Array} [ { line, value } ] for DistanceLabels.
 */
export function insideRects( box, around ) {
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const right = box.x + box.w;
	const bottom = box.y + box.h;
	const aRight = around.x + around.w;
	const aBottom = around.y + around.h;
	return [
		{
			line: { x1: around.x, y1: cy, x2: box.x, y2: cy },
			value: box.x - around.x,
		},
		{
			line: { x1: right, y1: cy, x2: aRight, y2: cy },
			value: aRight - right,
		},
		{
			line: { x1: cx, y1: around.y, x2: cx, y2: box.y },
			value: box.y - around.y,
		},
		{
			line: { x1: cx, y1: bottom, x2: cx, y2: aBottom },
			value: aBottom - bottom,
		},
	];
}

/**
 * What Alt shows with the Move tool: the gaps from the selection frame to
 * the canvas edges, plus the gaps to the element under the pointer. When
 * that element holds the selection (a card around its text), the gaps run
 * to its inner edges instead of the canvas.
 *
 * @param {Object}      box    Selection frame { x, y, w, h }.
 * @param {Object|null} target Box of the element under the pointer.
 * @param {Object}      doc    { w, h }.
 * @return {Array} [ { line, value } ] for DistanceLabels.
 */
export function measureRects( box, target, doc ) {
	const eps = 0.5;
	if (
		target &&
		target.x <= box.x + eps &&
		target.y <= box.y + eps &&
		target.x + target.w >= box.x + box.w - eps &&
		target.y + target.h >= box.y + box.h - eps
	) {
		return insideRects( box, target );
	}
	const rects = insideRects( box, { x: 0, y: 0, w: doc.w, h: doc.h } );
	if ( target ) {
		const gaps = edgeDistances( box, target );
		if ( gaps.xLine ) {
			rects.push( { line: gaps.xLine, value: gaps.gapX } );
		}
		if ( gaps.yLine ) {
			rects.push( { line: gaps.yLine, value: gaps.gapY } );
		}
	}
	return rects;
}

/**
 * Alt with the Move tool (v0.7, rebuilt 1.431): measure from the selection
 * frame, not from the active layer's own box (a group's is stale, a new
 * one's is 0/0/0/0), to the canvas edges and to the element under the
 * pointer, picked the way a click would pick it: the outermost group, the
 * element itself with Cmd/Ctrl or inside the group you are working in.
 *
 * @param {Object}      state { layers, doc, selectedIds, activeId }.
 * @param {Object|null} hit   Layer under the pointer (pixel hit).
 * @param {boolean}     deep  Cmd/Ctrl held.
 * @return {Array|null} DistanceLabels rects, or null without a selection.
 */
export function altMeasure( state, hit, deep ) {
	const { layers, doc, activeId } = state;
	const selectedIds = state.selectedIds || [];
	const ids = selectedIds.length
		? selectedIds
		: [ activeId ].filter( Boolean );
	const box = frameBox( layers, ids );
	if ( ! box ) {
		return null;
	}
	let target = null;
	if ( hit ) {
		const active = layers.find( ( l ) => l.id === activeId );
		const context = active ? topGroupOf( layers, active ) : null;
		const unit = topGroupOf( layers, hit );
		const inside =
			!! context && context.id !== active.id && unit.id === context.id;
		const pick = deep || inside ? hit : unit;
		if ( ! withDescendants( layers, ids ).has( pick.id ) ) {
			target = visibleBox( layers, pick );
		}
	}
	return measureRects( box, target, doc );
}
