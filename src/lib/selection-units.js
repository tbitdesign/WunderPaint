/**
 * ONE selection semantic for every operation (v1.66).
 *
 * The selection is a list of UNITS: each selected layer is a unit together
 * with all its descendants; a selected id whose ancestor is also selected
 * collapses into the ancestor's unit. The canvas always works in whole
 * groups (click and marquee select the outermost group), the Layers panel
 * can deliberately select single children, and both intents flow through
 * here unchanged, so every op (move, align, distribute, duplicate, copy,
 * delete, group, smart-object) behaves identically.
 */

import { withDescendants, expandGroupIds } from '../store/editor-context';

/** The selection, falling back to the active layer. */
export function effectiveIds( state ) {
	return state.selectedIds?.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
}

/** The outermost group an element belongs to (canvas click semantics). */
export function topGroupOf( layers, layer ) {
	let top = layer;
	for (
		let g = layers.find( ( l ) => l.id === layer.parent );
		g;
		g = layers.find( ( l ) => l.id === g.parent )
	) {
		if ( 'group' === g.type ) {
			top = g;
		}
	}
	return top;
}

/**
 * Reduce ids to unit roots: drop every id whose ancestor is also selected
 * (it already rides along inside that unit), keep selection order.
 *
 * @param {Array} layers Flat layer list.
 * @param {Array} ids    Selected ids.
 * @return {Array} Root layer objects.
 */
export function unitRoots( layers, ids ) {
	const selected = new Set( ids );
	const find = ( id ) => layers.find( ( l ) => l.id === id );
	const roots = [];
	for ( const id of ids ) {
		const layer = find( id );
		if ( ! layer ) {
			continue;
		}
		let covered = false;
		for ( let p = find( layer.parent ); p; p = find( p.parent ) ) {
			if ( selected.has( p.id ) ) {
				covered = true;
				break;
			}
		}
		if ( ! covered ) {
			roots.push( layer );
		}
	}
	return roots;
}

/**
 * Axis-aligned FOOTPRINT of a layer on the canvas (v1.130.0): a rotated
 * layer renders rotated about its center, so its screen bounds differ
 * from the stored x/y/w/h box. Union boxes built from raw boxes put the
 * group handles beside the artwork and gave group scaling a wrong
 * anchor after a unit rotation.
 *
 * @param {Object} l Layer.
 * @return {Object} { x, y, w, h } covering the rendered extent.
 */
export function layerFootprint( l ) {
	if ( ! l.rot ) {
		return { x: l.x, y: l.y, w: l.w, h: l.h };
	}
	const rad = ( l.rot * Math.PI ) / 180;
	const cos = Math.abs( Math.cos( rad ) );
	const sin = Math.abs( Math.sin( rad ) );
	const w = l.w * cos + l.h * sin;
	const h = l.w * sin + l.h * cos;
	return {
		x: l.x + l.w / 2 - w / 2,
		y: l.y + l.h / 2 - h / 2,
		w,
		h,
	};
}

/**
 * One unit: a root layer with all descendants, its union bounds and its
 * effective lock (a locked member freezes the WHOLE unit for moves —
 * moving only the free members would tear the group apart).
 *
 * @param {Array}  layers Flat layer list.
 * @param {Object} root   Unit root layer.
 * @return {Object} { root, ids, box, locked }
 */
export function unitFor( layers, root ) {
	const ids = expandGroupIds( layers, [ root.id ] );
	const members = ids
		.map( ( id ) => layers.find( ( l ) => l.id === id ) )
		.filter( ( l ) => l && 'group' !== l.type );
	const geo = ( members.length ? members : [ root ] ).map( layerFootprint );
	const x = Math.min( ...geo.map( ( l ) => l.x ) );
	const y = Math.min( ...geo.map( ( l ) => l.y ) );
	// A locked ANCESTOR locks the unit too (v1.364.0): the direct-select
	// tool builds units from single children, and a child of a locked
	// group must not move just because its own flag is clear.
	let ancLocked = false;
	for (
		let g = layers.find( ( l ) => l.id === root.parent );
		g;
		g = layers.find( ( l ) => l.id === g.parent )
	) {
		if ( g.locked ) {
			ancLocked = true;
			break;
		}
	}
	return {
		root,
		ids,
		locked:
			!! root.locked ||
			ancLocked ||
			ids.some( ( id ) => layers.find( ( l ) => l.id === id )?.locked ),
		box: {
			x,
			y,
			w: Math.max( ...geo.map( ( l ) => l.x + l.w ) ) - x,
			h: Math.max( ...geo.map( ( l ) => l.y + l.h ) ) - y,
		},
	};
}

/**
 * The selection as units.
 *
 * @param {Object} state Editor state (or {layers, selectedIds, activeId}).
 * @return {Array} [{ root, ids, box, locked }]
 */
export function selectionUnits( state ) {
	const layers = state.layers;
	return unitRoots( layers, effectiveIds( state ) ).map( ( root ) =>
		unitFor( layers, root )
	);
}

/**
 * Patch that scales one snapshotted leaf about an anchor point (used by the
 * group Scale slider AND the group corner handles): size and offset scale
 * by the same factor, text carries its font size and span sizes along.
 *
 * @param {Object} lf Snapshot { id, x, y, w, h, fontSize, spans, isText }.
 * @param {number} f  Scale factor.
 * @param {number} ax Anchor x (doc coords).
 * @param {number} ay Anchor y (doc coords).
 * @return {Object} Layer patch.
 */
export function scaleLeafPatch( lf, f, ax, ay ) {
	const nw = Math.max( 1, lf.w * f );
	const nh = Math.max( 1, lf.h * f );
	const ncx = ax + ( lf.x + lf.w / 2 - ax ) * f;
	const ncy = ay + ( lf.y + lf.h / 2 - ay ) * f;
	const patch = { w: nw, h: nh, x: ncx - nw / 2, y: ncy - nh / 2 };
	if ( lf.isText && lf.fontSize ) {
		patch.fontSize = Math.max( 4, lf.fontSize * f );
		// Rich spans (v1.46) carry their own sizes — scale them along.
		if ( lf.spans ) {
			patch.spans = lf.spans.map( ( run ) =>
				run?.s?.size
					? {
							...run,
							s: {
								...run.s,
								size: Math.max( 4, run.s.size * f ),
							},
					  }
					: run
			);
		}
	}
	return patch;
}

/** Leaf snapshot for scaleLeafPatch. */
export const leafSnapshot = ( l ) => ( {
	id: l.id,
	x: l.x,
	y: l.y,
	w: l.w,
	h: l.h,
	fontSize: l.fontSize,
	spans: l.spans || null,
	isText: 'text' === l.type,
} );

/** Union bounds of several units (align reference for 2+ units). */
export function unitsBounds( units ) {
	return {
		x: Math.min( ...units.map( ( u ) => u.box.x ) ),
		y: Math.min( ...units.map( ( u ) => u.box.y ) ),
		r: Math.max( ...units.map( ( u ) => u.box.x + u.box.w ) ),
		b: Math.max( ...units.map( ( u ) => u.box.y + u.box.h ) ),
	};
}

/**
 * Group-rigidity snapshot for tests and sanity checks: relative offsets of
 * every group's members. Two snapshots being equal means no group was torn
 * apart by an operation.
 *
 * @param {Array} layers Flat layer list.
 * @return {Object} { groupId: [ 'childId:dx,dy', … ] }
 */
export function groupLayoutSignature( layers ) {
	const out = {};
	for ( const g of layers ) {
		if ( 'group' !== g.type ) {
			continue;
		}
		const ids = Array.from( withDescendants( layers, [ g.id ] ) );
		const members = ids
			.map( ( id ) => layers.find( ( l ) => l.id === id ) )
			.filter( ( l ) => l && 'group' !== l.type );
		if ( ! members.length ) {
			out[ g.id ] = [];
			continue;
		}
		const ox = members[ 0 ].x;
		const oy = members[ 0 ].y;
		out[ g.id ] = members.map(
			( m ) =>
				`${ m.id }:${ Math.round( ( m.x - ox ) * 100 ) / 100 },${
					Math.round( ( m.y - oy ) * 100 ) / 100
				}`
		);
	}
	return out;
}
