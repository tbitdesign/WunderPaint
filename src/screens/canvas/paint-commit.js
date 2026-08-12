/**
 * Where a finished brush stroke goes, and the geometry needed to put its
 * pixels in the right place once it lands on an existing layer.
 *
 * Pure arithmetic on the layer list and on plain numbers - no store, no
 * DOM - so the decisions can be tested. `setDocTransform` and
 * `canvasBoundsOfDocRect` do use `createCanvas` (lib/raster) to get a real
 * 2D context for matrix work, but never touch the editor store. The caller
 * does the dispatching.
 *
 * BUGS FOUND HERE, all reported by Thomas or code review, none of them
 * independent of each other:
 *
 * 1. Every stroke made its own layer. A portrait ends up with hundreds, and
 *    nobody wants that. Painting into the ACTIVE layer is what every other
 *    editor does, so it is the default now.
 * 2. A new layer was appended at the END of the list, which is the TOP of
 *    the stack. Making an empty layer, selecting it and painting put the
 *    paint above everything instead of into the layer chosen for it.
 *    `newLayerOp` in `src/store/ops/edit-ops.js` already inserts above the
 *    active layer; the brush simply never did.
 * 3. A raster layer's canvas is not a 1:1 copy of its box: `drawContent`
 *    (lib/raster/content.js) stretches it into `layer.w x layer.h`, and
 *    the renderer (lib/raster/render.js) rotates and flips it around its
 *    centre. Writing a stroke into the canvas with a plain translate is
 *    only correct for a layer that was never resized, rotated or flipped -
 *    `setDocTransform` is the real inverse of that whole chain.
 * 4. Warped layers (`layer.quad`) are drawn through a mesh, not an affine
 *    transform, so they cannot take a brush stroke at all this way.
 * 5. A raster inside a LOCKED GROUP was still paintable, because only the
 *    active layer's own `.locked` was checked, not its ancestors.
 */

import { createCanvas } from '../../lib/raster';

/** Layer types whose pixels a brush may write into. */
const PAINTABLE = [ 'raster', 'image' ];

/**
 * True when any ancestor GROUP of the layer is locked. This mirrors
 * `ancestorLocked` in tool-handlers.js exactly (same walk up `.parent`,
 * same meaning), kept as its own small copy here rather than imported:
 * tool-handlers.js imports `paintTarget` from this module, so importing
 * back from tool-handlers.js would make the two files depend on each
 * other.
 *
 * @param {Object[]} layers Flat layer list.
 * @param {Object}   layer  Layer to check.
 * @return {boolean} True when a group ancestor is locked.
 */
function ancestorLocked( layers, layer ) {
	for (
		let g = layers.find( ( l ) => l.id === layer.parent );
		g;
		g = layers.find( ( l ) => l.id === g.parent )
	) {
		if ( g.locked ) {
			return true;
		}
	}
	return false;
}

/**
 * Decide where a finished stroke belongs.
 *
 * @param {Object}   opts           Arguments.
 * @param {Object[]} opts.layers    The layer list, bottom first.
 * @param {string}   opts.activeId  Id of the active layer, or null.
 * @param {string}   opts.layerMode 'single' or 'perStroke'.
 * @return {{kind: string, layer: Object|null, index: number, reason: string}}
 *   The target. `kind` is 'paint' (write into `layer`), 'newRaster' (make a
 *   pixel layer at `index` and write into it) or 'strokeLayer' (add a
 *   stroke layer at `index`, the old behaviour). `index` is the insertion
 *   point for 'newRaster' and 'strokeLayer'; it is -1 when `kind` is
 *   'paint' because nothing is inserted. `reason` explains why an active
 *   layer was passed over for 'newRaster': 'hidden' | 'locked' | 'warped' |
 *   'type' | 'none' ('none' covers both "it worked" and "nothing was
 *   active to reject").
 */
export function paintTarget( { layers, activeId, layerMode } ) {
	const list = layers || [];
	const at = list.findIndex( ( l ) => l.id === activeId );
	// Above the active layer; on top when nothing is active.
	const index = at >= 0 ? at + 1 : list.length;

	if ( 'perStroke' === layerMode ) {
		return { kind: 'strokeLayer', layer: null, index, reason: 'none' };
	}

	const active = at >= 0 ? list[ at ] : null;
	if ( ! active ) {
		return { kind: 'newRaster', layer: null, index, reason: 'none' };
	}
	if ( active.quad ) {
		// Free-transformed (warped) layers render through a mesh
		// (drawWarped), not the affine transform setDocTransform inverts -
		// there is no straight-line mapping from a document stroke into
		// that canvas.
		return { kind: 'newRaster', layer: null, index, reason: 'warped' };
	}
	if ( ! PAINTABLE.includes( active.type ) ) {
		return { kind: 'newRaster', layer: null, index, reason: 'type' };
	}
	if ( false === active.visible ) {
		return { kind: 'newRaster', layer: null, index, reason: 'hidden' };
	}
	if ( active.locked || ancestorLocked( list, active ) ) {
		return { kind: 'newRaster', layer: null, index, reason: 'locked' };
	}
	return { kind: 'paint', layer: active, index: -1, reason: 'none' };
}

/**
 * Set a context up so drawing in DOCUMENT coordinates lands in the right
 * pixels of a layer's own canvas.
 *
 * A raster layer's canvas is not a 1:1 copy of its box. `drawContent`
 * stretches it into `layer.w x layer.h`, and the renderer rotates and flips
 * it around its centre. So the inverse of all of that has to be applied
 * before a stroke in document coordinates can be written into the canvas.
 * A plain translate is right only for a layer that was never resized,
 * rotated or flipped - which is exactly the case the first version of this
 * code was tested against.
 *
 * @param {Object} ctx        The destination canvas 2D context.
 * @param {Object} layer      The raster layer being painted into.
 * @param {Object} [size]     Explicit { cw, ch } canvas-pixel size to use
 *                            instead of `ctx.canvas`'s own. Needed when
 *                            `ctx` belongs to a scratch canvas that is
 *                            WINDOWED to only part of the layer's canvas
 *                            (see `canvasBoundsOfDocRect`) - reading the
 *                            scale off that smaller canvas would be wrong.
 */
export function setDocTransform( ctx, layer, size ) {
	const cw = size ? size.cw : ctx.canvas.width;
	const ch = size ? size.ch : ctx.canvas.height;
	const w = Math.max( 1, layer.w );
	const h = Math.max( 1, layer.h );
	ctx.setTransform( 1, 0, 0, 1, 0, 0 );
	// Canvas pixels per layer unit: the stretch the renderer applies.
	ctx.scale( cw / w, ch / h );
	ctx.translate( w / 2, h / 2 );
	if ( layer.flipX || layer.flipY ) {
		ctx.scale( layer.flipX ? -1 : 1, layer.flipY ? -1 : 1 );
	}
	if ( layer.rot ) {
		// Note the sign: the renderer rotates by +rot, so writing INTO the
		// canvas rotates by -rot.
		ctx.rotate( ( -layer.rot * Math.PI ) / 180 );
	}
	ctx.translate( -( layer.x + w / 2 ), -( layer.y + h / 2 ) );
}

/**
 * Canvas-pixel bounds a document-space rectangle covers once mapped
 * through `setDocTransform`, clamped to the layer's own canvas.
 *
 * Used to size a scratch canvas to just the stroke instead of the whole
 * layer: `drawSoftRoundStroke` (lib/raster/styles.js) keeps a shared
 * scratch buffer that only ever grows to fit the biggest context it has
 * seen, so handing it a context the size of a whole big layer for one
 * small stroke would pin that memory for the rest of the session.
 *
 * @param {Object} layer Raster layer being painted into.
 * @param {number} cw    The layer canvas's actual width in pixels.
 * @param {number} ch    The layer canvas's actual height in pixels.
 * @param {Object} rect  { x, y, w, h } in document coordinates.
 * @return {{x: number, y: number, w: number, h: number}} Integer,
 *   axis-aligned canvas-pixel bounds, clamped to [0, cw] x [0, ch]. `w`
 *   and/or `h` come back 0 when the rect does not touch the canvas at all.
 */
export function canvasBoundsOfDocRect( layer, cw, ch, rect ) {
	// A 1x1 probe is enough - only its context's transform maths are used,
	// nothing is ever drawn into it.
	const probe = createCanvas( 1, 1 );
	const ctx = probe.getContext( '2d' );
	setDocTransform( ctx, layer, { cw, ch } );
	const m = ctx.getTransform();
	const xs = [];
	const ys = [];
	for ( const [ x, y ] of [
		[ rect.x, rect.y ],
		[ rect.x + rect.w, rect.y ],
		[ rect.x, rect.y + rect.h ],
		[ rect.x + rect.w, rect.y + rect.h ],
	] ) {
		const p = m.transformPoint( { x, y } );
		xs.push( p.x );
		ys.push( p.y );
	}
	// A tiny epsilon before floor/ceil: an exact 90 degree rotation does
	// not produce an exact 0 from Math.cos, so a corner that is really AT
	// a pixel boundary lands a sliver past it and would otherwise round
	// outward to a whole extra pixel.
	const EPS = 1e-6;
	const minX = Math.max( 0, Math.floor( Math.min( ...xs ) + EPS ) );
	const minY = Math.max( 0, Math.floor( Math.min( ...ys ) + EPS ) );
	const maxX = Math.min( cw, Math.ceil( Math.max( ...xs ) - EPS ) );
	const maxY = Math.min( ch, Math.ceil( Math.max( ...ys ) - EPS ) );
	return {
		x: minX,
		y: minY,
		w: Math.max( 0, maxX - minX ),
		h: Math.max( 0, maxY - minY ),
	};
}
