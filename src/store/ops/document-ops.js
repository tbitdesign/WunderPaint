/**
 * Document-level ops: canvas geometry, layer merging and the pixel-moving
 * operations that work on the document as a whole.
 *
 * Second half of this topic (PSD, smart objects, project IO, SVG) lives in
 * io-ops.js - the split is by cost, not by theme: everything in there pulls
 * a heavy lazy chunk.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __ } from '@wordpress/i18n';
import { makeRaster } from '../document';
import { selectionBounds, selectionToMaskCanvas } from '../selection';
import { activeLayerOf } from '../editor-context';
import * as DocOps from '../doc-ops';
import { openPlaceDialog } from '../../lib/import-files';
import {
	renderToCanvas,
	createCanvas,
	sharedImageCache,
} from '../../lib/raster';
import {
	imageToRaster,
	clearSelectedRegion,
	trimRasterPatch,
} from '../../lib/raster-layer';
import { selectionUnits, unitsBounds } from '../../lib/selection-units';

/* ------------------- document / PSD / smart-object ops ------------------ */

// Task 23: in-browser placing.
export function openPlaceOp( editor, extras ) {
	openPlaceDialog( editor, extras );
}

export function trimOp( editor, extras ) {
	DocOps.trimDoc( editor ).then( ( trimmed ) => {
		if ( ! trimmed ) {
			extras?.toasts?.toast?.(
				__(
					'Nothing to trim, no fully transparent margins.',
					'wunderpaint'
				)
			);
		}
	} );
}
export function rotateDocOp( editor, cw ) {
	DocOps.rotateDoc( editor, cw );
}
export function flipDocOp( editor, horizontal ) {
	DocOps.flipDoc( editor, horizontal );
}
export function cropToSelectionOp( editor ) {
	const bounds = selectionBounds( editor.state.selection );
	if ( bounds && bounds.w > 1 && bounds.h > 1 ) {
		DocOps.cropDoc(
			editor,
			bounds,
			__( 'Crop to Selection', 'wunderpaint' )
		);
	}
}
/**
 * Crop the canvas to the selected layers' footprint (v1.289.0): "Crop to
 * Image" (Image menu) and "Crop to Layer" (Layer menu) both resize the
 * document to exactly the selection's axis-aligned bounds - rotation-aware
 * via the same unit footprints the align ops use.
 */
export function cropToLayerOp( editor, label ) {
	const units = selectionUnits( editor.state );
	if ( ! units.length ) {
		return;
	}
	const b = unitsBounds( units );
	DocOps.cropDoc(
		editor,
		{ x: b.x, y: b.y, w: b.r - b.x, h: b.b - b.y },
		label || __( 'Crop to Layer', 'wunderpaint' )
	);
}
export function mergeDownOp( editor ) {
	DocOps.mergeDown( editor );
}
export function flattenOp( editor ) {
	DocOps.flattenDoc( editor );
}

/** Layer via Copy: selection contents of the active layer → new layer. */
export async function layerViaCopyOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	const sel = state.selection;
	if ( ! layer || ! sel ) {
		return;
	}
	const bounds = selectionBounds( sel );
	if ( ! bounds || bounds.w < 1 || bounds.h < 1 ) {
		return;
	}
	const rendered = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ { ...layer, parent: null } ],
		{ cache: sharedImageCache }
	);
	const mask = selectionToMaskCanvas( sel, state.doc.w, state.doc.h, {
		feather: sel.feather,
	} );
	const ctx = rendered.getContext( '2d' );
	ctx.globalCompositeOperation = 'destination-in';
	ctx.drawImage( mask, 0, 0 );
	const clipped = createCanvas(
		Math.ceil( bounds.w ),
		Math.ceil( bounds.h )
	);
	clipped.getContext( '2d' ).drawImage( rendered, -bounds.x, -bounds.y );
	const copy = makeRaster( {
		name: layer.name + ' copy',
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		canvas: clipped,
	} );
	dispatch( { type: 'ADD_LAYER', layer: copy } );
	commit( __( 'Layer via Copy', 'wunderpaint' ) );
}

/**
 * Fill the selection with the foreground color as a NEW raster layer
 * (v1.365.0, selection actions bar). Non-destructive: the fill lands on
 * its own layer, honoring the selection's feather.
 */
export function fillSelectionOp( editor ) {
	const { state, dispatch, commit } = editor;
	const sel = state.selection;
	const bounds = sel && selectionBounds( sel );
	if ( ! bounds || bounds.w < 1 || bounds.h < 1 ) {
		return;
	}
	const mask = selectionToMaskCanvas( sel, state.doc.w, state.doc.h, {
		feather: sel.feather,
	} );
	const clipped = createCanvas(
		Math.ceil( bounds.w ),
		Math.ceil( bounds.h )
	);
	const ctx = clipped.getContext( '2d' );
	ctx.drawImage( mask, -bounds.x, -bounds.y );
	ctx.globalCompositeOperation = 'source-in';
	ctx.fillStyle = state.fgColor;
	ctx.fillRect( 0, 0, clipped.width, clipped.height );
	const layer = makeRaster( {
		name: __( 'Fill', 'wunderpaint' ),
		x: bounds.x,
		y: bounds.y,
		w: bounds.w,
		h: bounds.h,
		canvas: clipped,
	} );
	dispatch( { type: 'ADD_LAYER', layer } );
	commit( __( 'Fill Selection', 'wunderpaint' ) );
}

/** Delete (clear) the active raster layer's pixels within the selection. */
export async function deleteWithinSelectionOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	const sel = state.selection;
	if ( ! layer || ! sel ) {
		return;
	}
	if ( 'image' === layer.type ) {
		await sharedImageCache.warm( [ layer ] );
		const img = sharedImageCache.get( layer.src );
		if ( ! img ) {
			return;
		}
		const raster = imageToRaster( layer, img );
		clearSelectedRegion( raster, sel, state.doc );
		// Shrink the box to the remaining pixels so the transform frame
		// matches what is visible (masked layers keep their box, the mask
		// anchor maps the original region).
		const patch = layer.mask ? {} : trimRasterPatch( raster );
		dispatch( {
			type: 'SET_LAYERS',
			layers: state.layers.map( ( l ) =>
				l.id === layer.id ? { ...raster, ...patch } : l
			),
		} );
		commit( __( 'Delete selection contents', 'wunderpaint' ) );
		return;
	}
	if ( 'raster' === layer.type && layer.canvas ) {
		clearSelectedRegion( layer, sel, state.doc );
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: layer.mask ? {} : trimRasterPatch( layer ),
		} );
		commit( __( 'Delete selection contents', 'wunderpaint' ) );
	}
}

/** Layer → Trim Transparent Pixels (v1.69): shrink to opaque bounds. */
export function trimLayerOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || 'raster' !== layer.type || ! layer.canvas ) {
		return;
	}
	const patch = trimRasterPatch( layer );
	if ( ! Object.keys( patch ).length ) {
		return;
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	commit( __( 'Trim layer', 'wunderpaint' ) );
}
