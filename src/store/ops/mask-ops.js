/**
 * Masks: add, cut out, remove, invert, toggle, apply, clipping.
 *
 * Its own module because it is the one block with dedicated test files
 * (add-mask, clipping-mask, cut-out, cut-out-render) and it borrows nothing
 * from the rest of ops - only library functions.
 *
 * Split out of src/store/ops.js in v1.338.0, which had grown to 2944 lines.
 * ops.js stays as the barrel over these modules - the same shape src/lib/raster.js
 * uses - so every existing `from './ops'` import is unchanged.
 */

import { __, sprintf } from '@wordpress/i18n';
import { makeRaster, makeGroup } from '../document';
import { selectionToMaskCanvas } from '../selection';
import { activeLayerOf } from '../editor-context';
import {
	renderToCanvas,
	createCanvas,
	sharedImageCache,
	blurCanvas,
} from '../../lib/raster';

// Task 25: masks + clipping.
export function addMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || layer.mask ) {
		return;
	}
	let canvas;
	if ( state.selection ) {
		// Photoshop semantics (v1.11.1): with an active selection the mask
		// comes FROM it, selected area visible, rest hidden.
		canvas = selectionToMaskCanvas(
			state.selection,
			state.doc.w,
			state.doc.h,
			{
				feather: state.selection.feather,
			}
		);
	} else {
		// White reveal-all raster mask (doc-sized), spec 06.1.
		canvas = createCanvas( state.doc.w, state.doc.h );
		const ctx = canvas.getContext( '2d' );
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			mask: {
				kind: 'raster',
				canvas,
				data: null,
				inverted: false,
				enabled: true,
				// The layer box at creation, the renderer maps this region of
				// the doc-sized mask onto the layer's local content, so the mask
				// follows every transform (move/scale/rotate/flip), v1.27.
				anchor: {
					x: layer.x,
					y: layer.y,
					w: layer.w,
					h: layer.h,
				},
			},
		},
	} );
	if ( state.selection ) {
		dispatch( { type: 'SET_SELECTION', selection: null } );
	}
	commit( __( 'Add Layer Mask', 'wunderpaint' ) );
}

/** Grow (expand > 0) or shrink (< 0) the white area of a mask canvas. */
function morphMaskCanvas( canvas, expand ) {
	if ( ! expand ) {
		return canvas;
	}
	const w = canvas.width;
	const h = canvas.height;
	const ctx = canvas.getContext( '2d' );
	const img = ctx.getImageData( 0, 0, w, h );
	const a = img.data;
	// Chamfer distance transform (3-4 weights, two passes): dist[i] is
	// ~3x the pixel distance to the nearest pixel OUTSIDE the region we
	// measure from. Exact enough for a px-accurate grow/shrink and O(n).
	// Seeds (distance 0) are the region we measure FROM: the kept area
	// when growing, the outside when shrinking.
	const seed = ( i ) =>
		expand > 0 ? a[ i * 4 + 3 ] > 127 : a[ i * 4 + 3 ] <= 127;
	const INF = 1 << 29;
	const dist = new Int32Array( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		dist[ i ] = seed( i ) ? 0 : INF;
	}
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			const i = y * w + x;
			if ( ! dist[ i ] ) {
				continue;
			}
			let d = dist[ i ];
			if ( x > 0 ) {
				d = Math.min( d, dist[ i - 1 ] + 3 );
			}
			if ( y > 0 ) {
				d = Math.min( d, dist[ i - w ] + 3 );
				if ( x > 0 ) {
					d = Math.min( d, dist[ i - w - 1 ] + 4 );
				}
				if ( x < w - 1 ) {
					d = Math.min( d, dist[ i - w + 1 ] + 4 );
				}
			}
			dist[ i ] = d;
		}
	}
	for ( let y = h - 1; y >= 0; y-- ) {
		for ( let x = w - 1; x >= 0; x-- ) {
			const i = y * w + x;
			if ( ! dist[ i ] ) {
				continue;
			}
			let d = dist[ i ];
			if ( x < w - 1 ) {
				d = Math.min( d, dist[ i + 1 ] + 3 );
			}
			if ( y < h - 1 ) {
				d = Math.min( d, dist[ i + w ] + 3 );
				if ( x < w - 1 ) {
					d = Math.min( d, dist[ i + w + 1 ] + 4 );
				}
				if ( x > 0 ) {
					d = Math.min( d, dist[ i + w - 1 ] + 4 );
				}
			}
			dist[ i ] = d;
		}
	}
	// Grow: everything within `expand` px of the region joins it.
	// Shrink: everything within |expand| px of the OUTSIDE leaves it.
	const limit = Math.abs( expand ) * 3;
	for ( let i = 0; i < w * h; i++ ) {
		const nowInside =
			expand > 0
				? a[ i * 4 + 3 ] > 127 || dist[ i ] <= limit
				: a[ i * 4 + 3 ] > 127 && dist[ i ] > limit;
		a[ i * 4 ] = a[ i * 4 + 1 ] = a[ i * 4 + 2 ] = 255;
		a[ i * 4 + 3 ] = nowInside ? 255 : 0;
	}
	const out = createCanvas( w, h );
	out.getContext( '2d' ).putImageData( img, 0, 0 );
	return out;
}

/**
 * One-click cutout (v1.125): turn the current selection into a layer
 * mask on the active image-ish layer - the friendly "Cut out now" path
 * for people who have never seen a mask. Replaces an existing mask.
 *
 * @param {Object}  editor         Editor context.
 * @param {Object}  [opts]         Options.
 * @param {number}  [opts.feather] Edge softness in px.
 * @param {number}  [opts.expand]  Grow/shrink the kept area in px.
 * @param {boolean} [opts.invert]  Remove the selected area instead of
 *                                 keeping it (v1.127.0).
 */
export function cutOutOp(
	editor,
	{ feather = 0, expand = 0, invert = false } = {}
) {
	const { state, dispatch, commit } = editor;
	if ( ! state.selection ) {
		throw new Error( __( 'Make a selection first.', 'wunderpaint' ) );
	}
	let layer = activeLayerOf( state );
	if ( ! layer || ! [ 'image', 'raster', 'smart' ].includes( layer.type ) ) {
		// The subject click usually happens with a single photo in the
		// document: fall back to the topmost image-ish layer.
		layer = [ ...state.layers ]
			.reverse()
			.find(
				( l ) =>
					[ 'image', 'raster', 'smart' ].includes( l.type ) &&
					l.visible
			);
	}
	if ( ! layer ) {
		throw new Error( __( 'Select an image layer first.', 'wunderpaint' ) );
	}
	// Expand first (hard threshold), feather afterwards - the other way
	// round the threshold would eat the soft edge again.
	let canvas = selectionToMaskCanvas(
		state.selection,
		state.doc.w,
		state.doc.h,
		{
			feather: 0,
		}
	);
	canvas = morphMaskCanvas( canvas, expand );
	if ( feather > 0 ) {
		canvas = blurCanvas( canvas, feather );
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			mask: {
				kind: 'raster',
				canvas,
				data: null,
				// Inverted mask = the selected area gets REMOVED (the
				// renderer switches to destination-out).
				inverted: invert,
				enabled: true,
				anchor: { x: layer.x, y: layer.y, w: layer.w, h: layer.h },
			},
		},
	} );
	dispatch( { type: 'SET_ACTIVE', id: layer.id } );
	dispatch( { type: 'SET_SELECTION', selection: null } );
	dispatch( { type: 'SET_TOOL', tool: 'move' } );
	commit(
		invert
			? __( 'Remove Selection', 'wunderpaint' )
			: __( 'Cut Out', 'wunderpaint' )
	);
}

/** Delete the active layer's mask, the layer becomes fully visible again. */
export function removeMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer?.mask ) {
		return;
	}
	dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch: { mask: null } } );
	if ( state.maskEditId === layer.id ) {
		dispatch( { type: 'SET_MASK_EDIT', id: null } );
	}
	commit( __( 'Delete Layer Mask', 'wunderpaint' ) );
}

/** Invert the active layer's mask (hidden ↔ visible). */
export function invertMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer?.mask ) {
		return;
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: { mask: { ...layer.mask, inverted: ! layer.mask.inverted } },
	} );
	commit( __( 'Invert Layer Mask', 'wunderpaint' ) );
}

/** Temporarily disable/enable the active layer's mask (also: Alt-click chip). */
export function toggleMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer?.mask ) {
		return;
	}
	dispatch( {
		type: 'UPDATE_LAYER',
		id: layer.id,
		patch: {
			mask: { ...layer.mask, enabled: layer.mask.enabled === false },
		},
	} );
	commit( __( 'Toggle mask', 'wunderpaint' ) );
}

/**
 * Bake the mask into the pixels: the layer becomes a doc-sized raster with
 * the masked alpha, the mask itself goes away (Photoshop "Apply Layer Mask").
 */
export async function applyMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if (
		! layer?.mask ||
		'group' === layer.type ||
		'adjustment' === layer.type
	) {
		return;
	}
	if ( layer.mask.enabled === false ) {
		// A disabled mask contributes nothing, applying it just drops it.
		removeMaskOp( editor );
		return;
	}
	await sharedImageCache.warm( [ layer ] );
	const rendered = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ { ...layer, parent: null, opacity: 1, blend: 'normal' } ],
		{ cache: sharedImageCache }
	);
	const raster = makeRaster( {
		name: layer.name,
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
		canvas: rendered,
	} );
	raster.id = layer.id;
	raster.opacity = layer.opacity;
	raster.blend = layer.blend;
	raster.parent = layer.parent;
	raster.clipped = layer.clipped || false;
	raster.visible = layer.visible;
	raster.locked = layer.locked || false;
	raster.label = layer.label || null;
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => ( l.id === layer.id ? raster : l ) ),
	} );
	if ( state.maskEditId === layer.id ) {
		dispatch( { type: 'SET_MASK_EDIT', id: null } );
	}
	commit( __( 'Apply Layer Mask', 'wunderpaint' ) );
}

export function clippingMaskOp( editor ) {
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );
	if ( ! layer || 'group' === layer.type ) {
		return;
	}
	if ( layer.clipped ) {
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { clipped: false },
		} );
		commit( __( 'Release Clipping Mask', 'wunderpaint' ) );
		return;
	}
	// The renderer clips against the nearest previous non-clipped sibling
	// in the same container (compositeLayers); resolve the same base here.
	const idx = state.layers.findIndex( ( l ) => l.id === layer.id );
	let base = null;
	for ( let i = idx - 1; i >= 0; i-- ) {
		const below = state.layers[ i ];
		if ( ( below.parent || null ) !== ( layer.parent || null ) ) {
			continue;
		}
		if (
			! below.visible ||
			below.clipped ||
			'adjustment' === below.type ||
			( 'stroke' === below.type && below.erase )
		) {
			continue;
		}
		base = below;
		break;
	}
	let layers = state.layers.map( ( l ) =>
		l.id === layer.id ? { ...l, clipped: true } : l
	);
	// Base and clipped layer move as one: wrap the top-level pair in a
	// group (user request v1.117.2). Inside a group they already travel
	// together, so nothing to do there.
	if ( base && ! layer.parent && ! base.parent ) {
		const group = makeGroup( {
			name: sprintf(
				/* translators: %s: layer name. */
				__( 'Clip: %s', 'wunderpaint' ),
				base.name || ''
			),
		} );
		// Groups are double-linked: children carry parent AND the group
		// lists the ids (v1.106.2 gotcha).
		group.children = [ base.id, layer.id ];
		layers = layers.map( ( l ) =>
			l.id === base.id || l.id === layer.id
				? { ...l, parent: group.id }
				: l
		);
		const at = layers.findIndex( ( l ) => l.id === layer.id );
		layers.splice( at + 1, 0, group );
	}
	dispatch( { type: 'SET_LAYERS', layers } );
	dispatch( { type: 'SET_ACTIVE', id: layer.id } );
	commit( __( 'Create Clipping Mask', 'wunderpaint' ) );
}
