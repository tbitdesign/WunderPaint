/**
 * Arrange and housekeeping ops (v1.429): the handful of moves every
 * design tool has on a right-click and a key - to the front or back of
 * the stack, hide, lock, flip, quarter turns, rename, paste in place and
 * "select the same". Groups move as units: a flip or a turn of a group
 * moves its leaves about the union centre, the way the Transform panel
 * does it.
 */

import { __ } from '@wordpress/i18n';

import { promptDialog } from '../../lib/dialogs';
import { selectionUnits } from '../../lib/selection-units';
import * as DocOps from '../doc-ops';

/** The selected unit roots in stack order (bottom first). */
function rootsInStackOrder( state ) {
	return selectionUnits( state )
		.map( ( u ) => u.root )
		.sort(
			( a, b ) =>
				state.layers.findIndex( ( l ) => l.id === a.id ) -
				state.layers.findIndex( ( l ) => l.id === b.id )
		);
}

/** Flat index of the last (top) or first (bottom) sibling of a layer. */
function edgeSiblingIndex( layers, idx, toTop ) {
	const parent = layers[ idx ].parent || null;
	let found = idx;
	if ( toTop ) {
		for ( let i = idx + 1; i < layers.length; i++ ) {
			if ( ( layers[ i ].parent || null ) === parent ) {
				found = i;
			}
		}
	} else {
		for ( let i = idx - 1; i >= 0; i-- ) {
			if ( ( layers[ i ].parent || null ) === parent ) {
				found = i;
			}
		}
	}
	return found;
}

/**
 * Move the selected units to the top of their siblings, keeping their
 * relative order.
 *
 * @param {Object} editor Editor context.
 */
export function bringToFrontOp( editor ) {
	const { state, dispatch, commit } = editor;
	const roots = rootsInStackOrder( state );
	if ( ! roots.length ) {
		return;
	}
	let moved = false;
	for ( const root of roots ) {
		const layers = editor.state.layers;
		const idx = layers.findIndex( ( l ) => l.id === root.id );
		const to = edgeSiblingIndex( layers, idx, true );
		if ( to === idx ) {
			continue;
		}
		// REORDER removes first, then inserts: the old index of the top
		// sibling is where "right after it" lands.
		dispatch( {
			type: 'REORDER',
			id: root.id,
			toIndex: to,
			parent: root.parent || null,
		} );
		moved = true;
	}
	if ( moved ) {
		commit( __( 'Bring to Front', 'wunderpaint' ) );
	}
}

/**
 * Move the selected units to the bottom of their siblings, keeping their
 * relative order.
 *
 * @param {Object} editor Editor context.
 */
export function sendToBackOp( editor ) {
	const { state, dispatch, commit } = editor;
	const roots = rootsInStackOrder( state ).reverse();
	if ( ! roots.length ) {
		return;
	}
	let moved = false;
	for ( const root of roots ) {
		const layers = editor.state.layers;
		const idx = layers.findIndex( ( l ) => l.id === root.id );
		const to = edgeSiblingIndex( layers, idx, false );
		if ( to === idx ) {
			continue;
		}
		dispatch( {
			type: 'REORDER',
			id: root.id,
			toIndex: to,
			parent: root.parent || null,
		} );
		moved = true;
	}
	if ( moved ) {
		commit( __( 'Send to Back', 'wunderpaint' ) );
	}
}

/**
 * Hide the selected units. Showing them again is the eye in the Layers
 * panel: a hidden layer cannot be hit on the canvas.
 *
 * @param {Object} editor Editor context.
 */
export function hideLayersOp( editor ) {
	const { state, dispatch, commit } = editor;
	const roots = selectionUnits( state ).map( ( u ) => u.root );
	if ( ! roots.length ) {
		return;
	}
	for ( const root of roots ) {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: root.id,
			patch: { visible: false },
		} );
	}
	commit( __( 'Hide layer', 'wunderpaint' ) );
}

/**
 * Lock or unlock the selected units; the active layer decides the
 * direction, every other selected unit follows it.
 *
 * @param {Object} editor Editor context.
 * @return {boolean} The new locked state, or null when nothing was selected.
 */
export function toggleLockOp( editor ) {
	const { state, dispatch, commit } = editor;
	const roots = selectionUnits( state ).map( ( u ) => u.root );
	if ( ! roots.length ) {
		return null;
	}
	const active = roots.find( ( r ) => r.id === state.activeId ) || roots[ 0 ];
	const locked = ! active.locked;
	for ( const root of roots ) {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: root.id,
			patch: { locked },
		} );
	}
	commit(
		locked
			? __( 'Lock layer', 'wunderpaint' )
			: __( 'Unlock layer', 'wunderpaint' )
	);
	return locked;
}

/**
 * Flip every selected unit about its own centre.
 *
 * @param {Object}  editor   Editor context.
 * @param {boolean} vertical Flip top to bottom instead of left to right.
 */
export function flipLayersOp( editor, vertical ) {
	const { state, dispatch, commit } = editor;
	const units = selectionUnits( state ).filter( ( u ) => ! u.locked );
	if ( ! units.length ) {
		return;
	}
	for ( const unit of units ) {
		const cx = unit.box.x + unit.box.w / 2;
		const cy = unit.box.y + unit.box.h / 2;
		dispatch( {
			type: 'UPDATE_LAYERS',
			ids: unit.ids,
			patchFor: ( l ) => {
				if ( 'group' === l.type ) {
					return {};
				}
				return vertical
					? {
							y: 2 * cy - ( l.y + l.h ),
							flipY: ! l.flipY,
							rot: -( l.rot || 0 ),
					  }
					: {
							x: 2 * cx - ( l.x + l.w ),
							flipX: ! l.flipX,
							rot: -( l.rot || 0 ),
					  };
			},
		} );
	}
	commit(
		vertical
			? __( 'Flip layer V', 'wunderpaint' )
			: __( 'Flip layer H', 'wunderpaint' )
	);
}

const normDeg = ( deg ) => ( ( ( ( deg + 180 ) % 360 ) + 360 ) % 360 ) - 180;

/**
 * Turn every selected unit by `deg` about its own centre (quarter turns
 * from the menu; any angle works).
 *
 * @param {Object} editor Editor context.
 * @param {number} deg    Degrees, clockwise positive.
 */
export function rotateLayersOp( editor, deg ) {
	const { state, dispatch, commit } = editor;
	const units = selectionUnits( state ).filter( ( u ) => ! u.locked );
	if ( ! units.length || ! deg ) {
		return;
	}
	const rad = ( deg * Math.PI ) / 180;
	const cos = Math.cos( rad );
	const sin = Math.sin( rad );
	for ( const unit of units ) {
		const cx = unit.box.x + unit.box.w / 2;
		const cy = unit.box.y + unit.box.h / 2;
		dispatch( {
			type: 'UPDATE_LAYERS',
			ids: unit.ids,
			patchFor: ( l ) => {
				if ( 'group' === l.type ) {
					return {};
				}
				const lcx = l.x + l.w / 2;
				const lcy = l.y + l.h / 2;
				const dx = lcx - cx;
				const dy = lcy - cy;
				const ncx = cx + dx * cos - dy * sin;
				const ncy = cy + dx * sin + dy * cos;
				return {
					x: ncx - l.w / 2,
					y: ncy - l.h / 2,
					rot: normDeg( ( l.rot || 0 ) + deg ),
				};
			},
		} );
	}
	commit( __( 'Rotate layer', 'wunderpaint' ) );
}

/**
 * Rename a layer through a small prompt.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Layer id (defaults to the active layer).
 */
export async function renameLayerOp( editor, id ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find(
		( l ) => l.id === ( id || state.activeId )
	);
	if ( ! layer ) {
		return;
	}
	const value = await promptDialog( {
		title: __( 'Rename layer', 'wunderpaint' ),
		label: __( 'Name', 'wunderpaint' ),
		defaultValue: layer.name || '',
	} );
	if ( null === value || undefined === value ) {
		return;
	}
	const name = String( value ).trim();
	if ( ! name || name === layer.name ) {
		return;
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch: { name } } );
	commit( __( 'Rename layer', 'wunderpaint' ) );
}

/**
 * Paste the clipboard where it was copied from, without the 10px offset.
 *
 * @param {Object} editor Editor context.
 */
export function pasteInPlaceOp( editor ) {
	const { state, dispatch, commit } = editor;
	if ( ! state.clipboard?.length ) {
		return;
	}
	const entries = state.clipboard;
	const rootIds = entries
		.filter( ( e ) => ! entries.some( ( o ) => o.id === e.parent ) )
		.map( ( e ) => e.id );
	const { copies, idMap } = DocOps.cloneLayerTree( entries, rootIds );
	const rootSet = new Set( rootIds.map( ( id ) => idMap.get( id ) ) );
	const placed = copies.map( ( c ) =>
		rootSet.has( c.id ) ? { ...c, parent: null } : c
	);
	dispatch( { type: 'SET_LAYERS', layers: [ ...state.layers, ...placed ] } );
	const roots = [ ...rootSet ];
	dispatch( {
		type: 'SET_ACTIVE',
		id: roots[ roots.length - 1 ] || placed[ placed.length - 1 ].id,
	} );
	commit( __( 'Paste in Place', 'wunderpaint' ) );
}

/* ----------------------------- select same ------------------------------ */

/** The comparable value of a layer for one "same" criterion. */
function sameKey( layer, criterion ) {
	switch ( criterion ) {
		case 'fill':
			if ( 'shape' === layer.type ) {
				return layer.fill && 'transparent' !== layer.fill
					? String( layer.fill ).toLowerCase()
					: null;
			}
			if ( 'text' === layer.type ) {
				return layer.color ? String( layer.color ).toLowerCase() : null;
			}
			return null;
		case 'stroke':
			if ( 'shape' === layer.type ) {
				return layer.stroke && layer.strokeW
					? String( layer.stroke ).toLowerCase()
					: null;
			}
			if ( 'text' === layer.type ) {
				return layer.outlineColor && layer.outlineW
					? String( layer.outlineColor ).toLowerCase()
					: null;
			}
			return null;
		case 'font':
			return 'text' === layer.type ? layer.fontFamily || null : null;
		case 'type':
			return 'shape' === layer.type
				? `shape:${ layer.pathD ? 'path' : layer.shape || 'rect' }`
				: layer.type;
		default:
			return null;
	}
}

export const SELECT_SAME_CRITERIA = [
	{ id: 'fill', label: () => __( 'Same Fill Color', 'wunderpaint' ) },
	{ id: 'stroke', label: () => __( 'Same Stroke Color', 'wunderpaint' ) },
	{ id: 'font', label: () => __( 'Same Font', 'wunderpaint' ) },
	{ id: 'type', label: () => __( 'Same Layer Type', 'wunderpaint' ) },
];

/**
 * Select every visible, unlocked layer that shares the active layer's
 * fill, stroke, font or type.
 *
 * @param {Object} editor    Editor context.
 * @param {string} criterion fill | stroke | font | type.
 * @return {number} How many layers are selected afterwards.
 */
export function selectSameOp( editor, criterion ) {
	const { state, dispatch } = editor;
	const active = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! active ) {
		return 0;
	}
	const key = sameKey( active, criterion );
	if ( null === key ) {
		return 0;
	}
	const ids = state.layers
		.filter(
			( l ) =>
				'group' !== l.type &&
				false !== l.visible &&
				! l.locked &&
				sameKey( l, criterion ) === key
		)
		.map( ( l ) => l.id );
	if ( ! ids.includes( active.id ) ) {
		ids.push( active.id );
	}
	dispatch( { type: 'SET_SELECTED', ids } );
	if ( ! ids.includes( state.activeId ) ) {
		dispatch( { type: 'SET_ACTIVE', id: active.id } );
	}
	return ids.length;
}

/* ------------------------------ solo / groups ----------------------------- */

/** Ancestor ids of a layer, nearest first. */
function ancestorsOf( layers, layer ) {
	const out = [];
	let cur = layer;
	let hops = 0;
	while ( cur && cur.parent && hops++ < 64 ) {
		cur = layers.find( ( l ) => l.id === cur.parent );
		if ( cur ) {
			out.push( cur.id );
		}
	}
	return out;
}

/** Descendant ids of a group (all levels). */
function descendantsOf( layers, id ) {
	const out = new Set();
	const walk = ( gid ) => {
		for ( const l of layers ) {
			if ( l.parent === gid && ! out.has( l.id ) ) {
				out.add( l.id );
				walk( l.id );
			}
		}
	};
	walk( id );
	return out;
}

/**
 * Solo (v1.429, Alt-click on the eye): show only this layer, its ancestors
 * and its descendants; a second solo on the same layer shows everything
 * again.
 *
 * @param {Object} editor Editor context.
 * @param {string} id     Layer id.
 */
export function soloLayerOp( editor, id ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === id );
	if ( ! layer ) {
		return;
	}
	const keep = new Set( [
		id,
		...ancestorsOf( state.layers, layer ),
		...descendantsOf( state.layers, id ),
	] );
	const others = state.layers.filter( ( l ) => ! keep.has( l.id ) );
	const alreadySolo =
		false !== layer.visible &&
		others.length > 0 &&
		others.every( ( l ) => false === l.visible );
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => {
			const visible = alreadySolo ? true : keep.has( l.id );
			return ( false !== l.visible ) === visible ? l : { ...l, visible };
		} ),
	} );
	commit(
		alreadySolo
			? __( 'Show all layers', 'wunderpaint' )
			: __( 'Solo layer', 'wunderpaint' )
	);
}

/**
 * Collapse every group in the Layers panel, or expand them all when none
 * is open.
 *
 * @param {Object} editor Editor context.
 * @return {boolean} Whether the groups are open afterwards.
 */
export function toggleAllGroupsOp( editor ) {
	const { state, dispatch } = editor;
	const groups = state.layers.filter( ( l ) => 'group' === l.type );
	if ( ! groups.length ) {
		return false;
	}
	const open = ! groups.some( ( g ) => g.isOpen );
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) =>
			'group' === l.type && !! l.isOpen !== open
				? { ...l, isOpen: open }
				: l
		),
	} );
	return open;
}
