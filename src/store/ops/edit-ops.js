/**
 * Edit, Select, Layers, Align: the ops that move pixels and selections
 * around without touching the document itself.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __, sprintf } from '@wordpress/i18n';
import { makeRaster, makeGroup } from '../document';
import { selectAll, invertSelection } from '../selection';
import * as DocOps from '../doc-ops';
import * as SharedClipboard from '../shared-clipboard';
import { promptDialog } from '../../lib/dialogs';
import { captureLayerStyle, layerStylePatch } from '../../lib/layer-style';
import {
	selectionUnits,
	unitRoots,
	unitsBounds,
	effectiveIds,
} from '../../lib/selection-units';

/** Index of the active layer in the flat array (or -1). */
const activeIndex = ( state ) =>
	state.layers.findIndex( ( l ) => l.id === state.activeId );

/* --------------------------------- Edit -------------------------------- */

export function copyLayers( editor, cut = false ) {
	const { state, dispatch, commit } = editor;
	const ids = state.selectedIds.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
	if ( ! ids.length ) {
		return;
	}
	// Whole subtrees ride along (a copied group used to lose its children):
	// unit roots drop ids whose ancestor is also selected, the clipboard
	// snapshot is deep-cloned, paste remaps again so repeated pastes never
	// collide.
	const roots = unitRoots( state.layers, ids ).map( ( r ) => r.id );
	const { copies } = DocOps.cloneLayerTree( state.layers, roots );
	dispatch( { type: 'SET_CLIPBOARD', layers: copies } );
	// Mirror to the page-level store so Paste works after switching to a tab
	// that mounts its own reducer (v1.226.0).
	SharedClipboard.setLayerClip( copies );
	if ( cut ) {
		dispatch( { type: 'REMOVE_LAYERS', ids: roots } );
		commit( __( 'Cut layer', 'wunderpaint' ) );
	}
}

export function pasteLayers( editor ) {
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
	const placed = copies.map( ( c ) => {
		const moved = DocOps.offsetLayer( c, 10, 10 );
		return rootSet.has( c.id ) ? { ...moved, parent: null } : moved;
	} );
	dispatch( { type: 'SET_LAYERS', layers: [ ...state.layers, ...placed ] } );
	const roots = [ ...rootSet ];
	dispatch( {
		type: 'SET_ACTIVE',
		id: roots[ roots.length - 1 ] || placed[ placed.length - 1 ].id,
	} );
	commit( __( 'Paste layer', 'wunderpaint' ) );
}

/* ---- copy / paste styles (v1.226.0) ---- */

/** Remember the active layer's whole appearance (effects, blend, paint). */
export function copyLayerStyles( editor ) {
	const { state, dispatch } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	if ( ! layer ) {
		return;
	}
	const style = captureLayerStyle( layer );
	dispatch( { type: 'SET_STYLE_CLIPBOARD', style } );
	SharedClipboard.setStyleClip( style );
}

/**
 * Apply the copied appearance to every selected layer: universal fields
 * always, type-specific paint only where the type matches the source. Content,
 * position and size are left untouched.
 */
export function pasteLayerStyles( editor ) {
	const { state, dispatch, commit } = editor;
	const clip = state.styleClipboard;
	if ( ! clip ) {
		return;
	}
	const ids = state.selectedIds.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
	if ( ! ids.length ) {
		return;
	}
	dispatch( {
		type: 'UPDATE_LAYERS',
		ids,
		// Fresh clones per target so multiple layers never share a styles or
		// adjust object.
		patchFor: ( l ) => layerStylePatch( l, clip ),
	} );
	commit( __( 'Paste styles', 'wunderpaint' ) );
}

export function duplicateLayer( editor ) {
	const { state, dispatch, commit } = editor;
	// Every selection UNIT duplicates as a whole (v1.66): a group as one
	// block, a deliberately selected child alone; multi-selections
	// duplicate every unit and select the copies.
	const roots = unitRoots( state.layers, effectiveIds( state ) );
	if ( ! roots.length ) {
		return;
	}
	let layers = [ ...state.layers ];
	const newRoots = [];
	for ( const root of roots ) {
		const { copies, idMap } = DocOps.cloneLayerTree( layers, [ root.id ] );
		const rootId = idMap.get( root.id );
		const placed = copies.map( ( c ) => {
			const moved = DocOps.offsetLayer( c, 10, 10 );
			return c.id === rootId
				? { ...moved, name: root.name + ' copy' }
				: moved;
		} );
		// Insert right above the original subtree in the flat list.
		let insertAt = layers.findIndex( ( l ) => l.id === root.id );
		layers.forEach( ( l, i ) => {
			if ( idMap.has( l.id ) ) {
				insertAt = Math.max( insertAt, i );
			}
		} );
		layers.splice( insertAt + 1, 0, ...placed );
		// A duplicated child stays inside its group.
		if ( root.parent ) {
			layers = layers.map( ( l ) =>
				l.id === root.parent && 'group' === l.type
					? { ...l, children: [ ...( l.children || [] ), rootId ] }
					: l
			);
		}
		newRoots.push( rootId );
	}
	dispatch( { type: 'SET_LAYERS', layers } );
	dispatch( { type: 'SET_ACTIVE', id: newRoots[ newRoots.length - 1 ] } );
	if ( newRoots.length > 1 ) {
		dispatch( { type: 'SET_SELECTED', ids: newRoots } );
	}
	commit( __( 'Duplicate layer', 'wunderpaint' ) );
}

export function deleteLayers( editor ) {
	const { state, dispatch, commit } = editor;
	const ids = state.selectedIds.length
		? state.selectedIds
		: state.activeId
		? [ state.activeId ]
		: [];
	if ( ! ids.length ) {
		return;
	}
	dispatch( { type: 'REMOVE_LAYERS', ids } );
	commit( __( 'Delete layer', 'wunderpaint' ) );
}

/* -------------------------------- Select ------------------------------- */

export function selectAllOp( editor ) {
	const { state, dispatch } = editor;
	dispatch( {
		type: 'SET_SELECTION',
		selection: selectAll( state.doc.w, state.doc.h ),
	} );
	editor.commit( __( 'Select All', 'wunderpaint' ) );
}

export function deselectOp( editor ) {
	if ( editor.state.selection ) {
		editor.dispatch( {
			type: 'SET_SELECTION',
			selection: null,
			remember: true,
		} );
		editor.commit( __( 'Deselect', 'wunderpaint' ) );
	}
}

/** Restore just the last explicitly cleared selection, preserving later edits. */
export function restoreSelectionOp( editor ) {
	if ( ! editor.state.selection && editor.state.lastSelection ) {
		editor.dispatch( { type: 'RESTORE_SELECTION' } );
		editor.commit( __( 'Restore last selection', 'wunderpaint' ) );
	}
}

export function inverseSelectionOp( editor ) {
	const { state, dispatch, commit } = editor;
	dispatch( {
		type: 'SET_SELECTION',
		selection: invertSelection( state.selection, state.doc.w, state.doc.h ),
	} );
	commit( __( 'Inverse Selection', 'wunderpaint' ) );
}

export async function featherSelectionOp( editor, extras ) {
	const { state, dispatch, commit } = editor;
	if ( ! state.selection ) {
		return;
	}
	const value = await promptDialog( {
		title: __( 'Feather Selection', 'wunderpaint' ),
		label: __( 'Feather radius (px)', 'wunderpaint' ),
		type: 'number',
		defaultValue: String( state.selection.feather || 0 ),
	} );
	if ( null === value ) {
		return;
	}
	const feather = parseFloat( value );
	if ( Number.isNaN( feather ) || feather < 0 ) {
		return;
	}
	dispatch( {
		type: 'SET_SELECTION_FEATHER',
		feather,
	} );
	commit( __( 'Feather Selection', 'wunderpaint' ) );
	extras?.toasts?.success?.(
		sprintf(
			/* translators: %d: radius */ __(
				'Feather set to %dpx.',
				'wunderpaint'
			),
			feather
		)
	);
}

export async function saveSelectionOp( editor ) {
	const { state, dispatch } = editor;
	if ( ! state.selection ) {
		return;
	}
	const name = await promptDialog( {
		title: __( 'Save Selection', 'wunderpaint' ),
		label: __( 'Name', 'wunderpaint' ),
		defaultValue: __( 'Selection 1', 'wunderpaint' ),
	} );
	if ( name ) {
		dispatch( { type: 'SAVE_SELECTION', name } );
	}
}

export async function loadSelectionOp( editor ) {
	const { state, dispatch } = editor;
	if ( ! state.savedSelections.length ) {
		return;
	}
	const names = state.savedSelections.map( ( s ) => s.name );
	const name = await promptDialog( {
		title: __( 'Load Selection', 'wunderpaint' ),
		label: __( 'Saved selections', 'wunderpaint' ),
		options: names,
	} );
	if ( name ) {
		dispatch( { type: 'LOAD_SELECTION', name } );
	}
}

/* -------------------------------- Layers ------------------------------- */

export function newLayerOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = makeRaster( {
		name: __( 'Layer', 'wunderpaint' ) + ' ' + ( state.layers.length + 1 ),
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
	} );
	dispatch( {
		type: 'ADD_LAYER',
		layer,
		index: activeIndex( state ) + 1 || state.layers.length,
	} );
	commit( __( 'New Layer', 'wunderpaint' ) );
}

export function newGroupOp( editor ) {
	const { state, dispatch, commit } = editor;
	// Unit roots only: grouping a selection that contains both a group and
	// one of its children must nest the group once, not re-parent the child.
	const selected = unitRoots(
		state.layers,
		state.selectedIds.length ? state.selectedIds : []
	)
		.map( ( r ) => r.id )
		// In STACK order, not in the order they happened to be clicked.
		// `unitRoots` keeps selection order on purpose (other callers want
		// it), but each member below is moved to the end of the flat array
		// in turn, so the iteration order becomes their new z-order - and
		// the renderer paints a group's children by flat position, not by
		// the `children` list. Picking top-down therefore swapped them.
		.sort(
			( x, y ) =>
				state.layers.findIndex( ( l ) => l.id === x ) -
				state.layers.findIndex( ( l ) => l.id === y )
		);
	const group = makeGroup( { name: __( 'Group', 'wunderpaint' ) } );
	dispatch( { type: 'ADD_LAYER', layer: group } );
	for ( const id of selected ) {
		const idx = editor.state.layers.length; // append inside group
		dispatch( { type: 'REORDER', id, toIndex: idx, parent: group.id } );
	}
	commit( __( 'New Group', 'wunderpaint' ) );
}

// Z-order is sibling order, not flat-array order: children of other
// groups may interleave between two siblings in the flat array, so a
// one-step move must jump to the nearest SAME-PARENT neighbour, never
// to flat idx±1 (that reads as a dead click and still pollutes history).
function siblingIndex( state, idx, dir ) {
	const parent = state.layers[ idx ].parent || null;
	for ( let i = idx + dir; i >= 0 && i < state.layers.length; i += dir ) {
		if ( ( state.layers[ i ].parent || null ) === parent ) {
			return i;
		}
	}
	return -1;
}

export function bringForwardOp( editor ) {
	const { state, dispatch, commit } = editor;
	const idx = activeIndex( state );
	if ( idx < 0 ) {
		return;
	}
	// REORDER removes first, then inserts: inserting at the sibling's old
	// flat index lands the layer right after it (it shifted down by one).
	const to = siblingIndex( state, idx, 1 );
	if ( to < 0 ) {
		return;
	}
	const layer = state.layers[ idx ];
	dispatch( {
		type: 'REORDER',
		id: layer.id,
		toIndex: to,
		parent: layer.parent,
	} );
	commit( __( 'Bring Forward', 'wunderpaint' ) );
}

export function sendBackwardOp( editor ) {
	const { state, dispatch, commit } = editor;
	const idx = activeIndex( state );
	if ( idx <= 0 ) {
		return;
	}
	const to = siblingIndex( state, idx, -1 );
	if ( to < 0 ) {
		return;
	}
	const layer = state.layers[ idx ];
	dispatch( {
		type: 'REORDER',
		id: layer.id,
		toIndex: to,
		parent: layer.parent,
	} );
	commit( __( 'Send Backward', 'wunderpaint' ) );
}

/* --------------------------- Align & Distribute ------------------------- */

// Align/distribute reference (v1.66): the shared selection-units model —
// a selected group is ONE object (union bounds, uniform offset), a
// deliberately selected child is its own unit. A single unit aligns to
// the canvas, several to their common bounding box.
function alignUnits( state ) {
	const units = selectionUnits( state );
	const bounds =
		units.length > 1
			? unitsBounds( units )
			: { x: 0, y: 0, r: state.doc.w, b: state.doc.h };
	return { units, bounds };
}

/** Apply per-unit offsets in ONE dispatch (locked units stay put). */
function applyUnitOffsets( editor, offsets, label ) {
	const patches = new Map();
	for ( const { unit, dx, dy } of offsets ) {
		if ( ( ! dx && ! dy ) || unit.locked ) {
			continue;
		}
		for ( const id of unit.ids ) {
			patches.set( id, { dx, dy } );
		}
	}
	if ( ! patches.size ) {
		return;
	}
	editor.dispatch( {
		type: 'UPDATE_LAYERS',
		ids: Array.from( patches.keys() ),
		patchFor: ( l ) => {
			const p = patches.get( l.id );
			return p && ! l.locked ? { x: l.x + p.dx, y: l.y + p.dy } : {};
		},
	} );
	editor.commit( label );
}

/** True when a distribute would do something (needs 3+ objects). */
export function canDistribute( state ) {
	return alignUnits( state ).units.length >= 3;
}

/** Align the selection (L/C/R/T/M/B) to the canvas or the selection bounds. */
export function alignLayersOp( editor, mode ) {
	const { units, bounds } = alignUnits( editor.state );
	if ( ! units.length ) {
		return;
	}
	const offsets = units.map( ( unit ) => {
		let dx = 0;
		let dy = 0;
		switch ( mode ) {
			case 'L':
				dx = bounds.x - unit.box.x;
				break;
			case 'C':
				dx =
					bounds.x +
					( bounds.r - bounds.x - unit.box.w ) / 2 -
					unit.box.x;
				break;
			case 'R':
				dx = bounds.r - unit.box.w - unit.box.x;
				break;
			case 'T':
				dy = bounds.y - unit.box.y;
				break;
			case 'M':
				dy =
					bounds.y +
					( bounds.b - bounds.y - unit.box.h ) / 2 -
					unit.box.y;
				break;
			case 'B':
				dy = bounds.b - unit.box.h - unit.box.y;
				break;
		}
		return { unit, dx, dy };
	} );
	applyUnitOffsets( editor, offsets, __( 'Align layers', 'wunderpaint' ) );
}

/** Evenly distribute 3+ selected objects horizontally or vertically. */
export function distributeLayersOp( editor, horizontal ) {
	const { units } = alignUnits( editor.state );
	if ( units.length < 3 ) {
		return;
	}
	const sorted = [ ...units ].sort( ( a, b ) =>
		horizontal ? a.box.x - b.box.x : a.box.y - b.box.y
	);
	const first = sorted[ 0 ];
	const last = sorted[ sorted.length - 1 ];
	const span = horizontal
		? last.box.x - first.box.x
		: last.box.y - first.box.y;
	const step = span / ( sorted.length - 1 );
	const offsets = sorted.map( ( unit, i ) => ( {
		unit,
		dx: horizontal ? first.box.x + step * i - unit.box.x : 0,
		dy: horizontal ? 0 : first.box.y + step * i - unit.box.y,
	} ) );
	applyUnitOffsets(
		editor,
		offsets,
		__( 'Distribute layers', 'wunderpaint' )
	);
}
