/**
 * Undo/redo history, an immutable snapshot stack (spec 04.6).
 *
 * A Snapshot is `{ label, doc, layers, selection }` with layers in their
 * SERIALIZED form (document.js#serializeLayers) so snapshots are plain data.
 * `savedRef` marks the snapshot that matches the last save → dirty flag.
 */

import { HISTORY_CAP } from './constants';

export const createHistory = ( present ) => ( {
	past: [],
	present,
	future: [],
	savedRef: present,
} );

export const canUndo = ( h ) => h.past.length > 0;
export const canRedo = ( h ) => h.future.length > 0;
export const isDirty = ( h ) => h.present !== h.savedRef;

/**
 * All snapshots oldest→newest plus the index of the present one.
 * @param h
 */
export const entries = ( h ) => ( {
	list: [ ...h.past, h.present, ...h.future ],
	currentIndex: h.past.length,
} );

/**
 * Push a new committed snapshot; clears the redo branch.
 * @param h
 * @param snapshot
 */
export const push = ( h, snapshot ) => ( {
	...h,
	past: trimByBytes( [ ...h.past, h.present ].slice( -HISTORY_CAP ) ),
	present: snapshot,
	future: [],
} );

// Memory guard (v0.7): large photos serialize to multi-MB data URLs per
// step, cap the byte footprint of the past stack, dropping oldest first.
const MAX_HISTORY_BYTES = 256 * 1024 * 1024;

export function snapshotBytes( snapshot ) {
	let bytes = 0;
	for ( const layer of snapshot?.layers || [] ) {
		if ( layer.dataUrl ) {
			bytes += layer.dataUrl.length;
		}
		if ( layer.mask?.data ) {
			bytes += layer.mask.data.length;
		}
	}
	return bytes;
}

export function trimByBytes( past, maxBytes = MAX_HISTORY_BYTES ) {
	let total = 0;
	let cut = past.length;
	for ( let i = past.length - 1; i >= 0; i-- ) {
		total += snapshotBytes( past[ i ] );
		if ( total > maxBytes ) {
			cut = i + 1;
			break;
		}
		cut = i;
	}
	return cut > 0 ? past.slice( cut ) : past;
}

export const undo = ( h ) => {
	if ( ! canUndo( h ) ) {
		return h;
	}
	return {
		...h,
		past: h.past.slice( 0, -1 ),
		present: h.past[ h.past.length - 1 ],
		future: [ h.present, ...h.future ],
	};
};

export const redo = ( h ) => {
	if ( ! canRedo( h ) ) {
		return h;
	}
	return {
		...h,
		past: [ ...h.past, h.present ],
		present: h.future[ 0 ],
		future: h.future.slice( 1 ),
	};
};

/**
 * Time-travel to an absolute index within entries() (History panel).
 * @param h
 * @param index
 */
export const goTo = ( h, index ) => {
	const { list, currentIndex } = entries( h );
	if ( index < 0 || index >= list.length || index === currentIndex ) {
		return h;
	}
	return {
		...h,
		past: list.slice( 0, index ),
		present: list[ index ],
		future: list.slice( index + 1 ),
	};
};

/**
 * Mark the present snapshot as saved (dirty = false until the next push).
 * @param h
 */
export const markSaved = ( h ) => ( { ...h, savedRef: h.present } );
