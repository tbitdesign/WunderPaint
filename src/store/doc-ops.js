/**
 * Document-level geometry operations (spec 04.2 Image menu): crop, image
 * size (resample), canvas size, trim, rotate 90°, flip. Shared by the menu
 * ops and the crop tool.
 */

import { __ } from '@wordpress/i18n';
import { scalePathD, offsetPathD } from '../lib/path';
import { recordStep } from '../lib/macro-recorder';

import { createCanvas, renderToCanvas, sharedImageCache } from '../lib/raster';
import { makeRaster, uid } from './document';

// Path transforms live in lib/path since v1.4 (the reducer needs them too);
// re-exported so existing `from doc-ops` imports keep working.
export { scalePathD, offsetPathD };

/**
 * Deep-copy layer subtrees for duplicate/paste: every layer of the trees
 * gets a fresh id, parent/children references are remapped onto the copies,
 * and live raster canvases are cloned so a duplicate never shares pixels
 * with its original. Roots keep their original `parent` id untouched; the
 * caller decides group membership (duplicate keeps it, paste clears it).
 *
 * @param {Array} layers  Flat layer list containing the subtrees.
 * @param {Array} rootIds Ids of the subtree roots to copy.
 * @return {{copies: Array, idMap: Map}} Copies in the originals' flat
 *                                       order + old-id → new-id map.
 */
export function cloneLayerTree( layers, rootIds ) {
	const wanted = new Set( rootIds );
	let grew = true;
	while ( grew ) {
		grew = false;
		for ( const layer of layers ) {
			if ( 'group' === layer.type && wanted.has( layer.id ) ) {
				for ( const child of layer.children || [] ) {
					if ( ! wanted.has( child ) ) {
						wanted.add( child );
						grew = true;
					}
				}
			}
		}
	}
	const idMap = new Map();
	const copies = layers
		.filter( ( l ) => wanted.has( l.id ) )
		.map( ( l ) => {
			const copy = { ...l, id: uid() };
			idMap.set( l.id, copy.id );
			if ( copy.canvas ) {
				try {
					const c = createCanvas(
						copy.canvas.width,
						copy.canvas.height
					);
					c.getContext( '2d' ).drawImage( copy.canvas, 0, 0 );
					copy.canvas = c;
				} catch ( e ) {
					// No 2d context (tests): the shared canvas stays.
				}
			}
			return copy;
		} );
	for ( const copy of copies ) {
		if ( copy.parent && idMap.has( copy.parent ) ) {
			copy.parent = idMap.get( copy.parent );
		}
		if ( 'group' === copy.type ) {
			copy.children = ( copy.children || [] )
				.map( ( id ) => idMap.get( id ) )
				.filter( Boolean );
		}
	}
	return { copies, idMap };
}

/** Offset a layer (and its coordinate-bearing extras) by dx/dy. */
export function offsetLayer( layer, dx, dy ) {
	const patch = { ...layer, x: layer.x + dx, y: layer.y + dy };
	if ( 'stroke' === layer.type ) {
		patch.x0 = ( layer.x0 ?? layer.x ) + dx;
		patch.y0 = ( layer.y0 ?? layer.y ) + dy;
	}
	if ( 'gradient' === layer.type ) {
		patch.from = { x: layer.from.x + dx, y: layer.from.y + dy };
		patch.to = { x: layer.to.x + dx, y: layer.to.y + dy };
	}
	if ( layer.quad ) {
		patch.quad = {
			tl: { x: layer.quad.tl.x + dx, y: layer.quad.tl.y + dy },
			tr: { x: layer.quad.tr.x + dx, y: layer.quad.tr.y + dy },
			br: { x: layer.quad.br.x + dx, y: layer.quad.br.y + dy },
			bl: { x: layer.quad.bl.x + dx, y: layer.quad.bl.y + dy },
		};
	}
	return patch;
}

/**
 * Crop the document to a rect: doc.w/h shrink, layers offset (spec 05.4).
 *
 * @param {Object} editor Editor context.
 * @param {Object} rect   { x, y, w, h } in doc px.
 * @param {string} label  History label.
 */
export function cropDoc(
	editor,
	rect,
	label = __( 'Apply Crop', 'wunderpaint' )
) {
	const { dispatch, commit, state } = editor;
	if ( ! rect || rect.w < 1 || rect.h < 1 ) {
		return false;
	}
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => offsetLayer( l, -rect.x, -rect.y ) ),
	} );
	dispatch( {
		type: 'SET_DOC',
		doc: { w: Math.round( rect.w ), h: Math.round( rect.h ) },
	} );
	dispatch( { type: 'SET_CROP', crop: null } );
	dispatch( { type: 'SET_SELECTION', selection: null } );
	commit( label );
	return true;
}

/** Scale a live canvas to new dimensions (resampled). */
function scaleCanvas( canvas, w, h ) {
	const out = createCanvas(
		Math.max( 1, Math.round( w ) ),
		Math.max( 1, Math.round( h ) )
	);
	out.getContext( '2d' ).drawImage( canvas, 0, 0, out.width, out.height );
	return out;
}

/**
 * Image Size: resample the whole document (spec 04.2), doc + every layer's
 * geometry, raster buffers, text sizes, stroke paths, gradients, masks.
 */
export function scaleDoc( editor, newW, newH ) {
	recordStep( 'resizeImage', { w: newW, h: newH } );
	const { dispatch, commit, state } = editor;
	const sx = newW / state.doc.w;
	const sy = newH / state.doc.h;
	if ( ! isFinite( sx ) || ! isFinite( sy ) || sx <= 0 || sy <= 0 ) {
		return false;
	}
	const fontScale = ( sx + sy ) / 2;

	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( layer ) => {
			const patch = {
				...layer,
				x: layer.x * sx,
				y: layer.y * sy,
				w: layer.w * sx,
				h: layer.h * sy,
			};
			if ( 'text' === layer.type ) {
				patch.fontSize = layer.fontSize * fontScale;
				patch.letterSpacing = ( layer.letterSpacing || 0 ) * fontScale;
			}
			if ( 'stroke' === layer.type ) {
				patch.x0 = ( layer.x0 ?? layer.x ) * sx;
				patch.y0 = ( layer.y0 ?? layer.y ) * sy;
				patch.paths = layer.paths.map( ( p ) => ( {
					...p,
					d: scalePathD( p.d, sx, sy ),
					size: p.size * fontScale,
				} ) );
			}
			if ( 'gradient' === layer.type ) {
				patch.from = { x: layer.from.x * sx, y: layer.from.y * sy };
				patch.to = { x: layer.to.x * sx, y: layer.to.y * sy };
			}
			if ( 'shape' === layer.type && layer.pathD ) {
				patch.pathD = scalePathD( layer.pathD, sx, sy );
			}
			if ( 'raster' === layer.type && layer.canvas ) {
				patch.canvas = scaleCanvas(
					layer.canvas,
					layer.canvas.width * sx,
					layer.canvas.height * sy
				);
			}
			if ( layer.mask?.canvas ) {
				patch.mask = {
					...layer.mask,
					canvas: scaleCanvas( layer.mask.canvas, newW, newH ),
				};
			}
			return patch;
		} ),
	} );
	dispatch( {
		type: 'SET_DOC',
		doc: { w: Math.round( newW ), h: Math.round( newH ) },
	} );
	commit( __( 'Image Size', 'wunderpaint' ) );
	return true;
}

/** Canvas Size: change bounds without scaling, anchored center (spec 04.2). */
export function resizeCanvasDoc( editor, newW, newH, anchor = 'center' ) {
	const { dispatch, commit, state } = editor;
	// Photoshop-style 3×3 anchor: where the existing content sticks.
	const factors = {
		tl: [ 0, 0 ],
		t: [ 0.5, 0 ],
		tr: [ 1, 0 ],
		l: [ 0, 0.5 ],
		center: [ 0.5, 0.5 ],
		r: [ 1, 0.5 ],
		bl: [ 0, 1 ],
		b: [ 0.5, 1 ],
		br: [ 1, 1 ],
	};
	const [ fx, fy ] = factors[ anchor ] || factors.center;
	const dx = Math.round( ( newW - state.doc.w ) * fx );
	const dy = Math.round( ( newH - state.doc.h ) * fy );
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( l ) => offsetLayer( l, dx, dy ) ),
	} );
	dispatch( {
		type: 'SET_DOC',
		doc: { w: Math.round( newW ), h: Math.round( newH ) },
	} );
	commit( __( 'Canvas Size', 'wunderpaint' ) );
	return true;
}

/** Trim: crop away fully transparent margins (spec 04.2). */
export async function trimDoc( editor ) {
	const { state } = editor;
	const canvas = await renderToCanvas( state.doc, state.layers, {
		cache: sharedImageCache,
	} );
	const ctx = canvas.getContext( '2d' );
	const { data } = ctx.getImageData( 0, 0, canvas.width, canvas.height );
	let minX = canvas.width;
	let minY = canvas.height;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < canvas.height; y++ ) {
		for ( let x = 0; x < canvas.width; x++ ) {
			if ( data[ ( y * canvas.width + x ) * 4 + 3 ] > 0 ) {
				if ( x < minX ) {
					minX = x;
				}
				if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				}
				if ( y > maxY ) {
					maxY = y;
				}
			}
		}
	}
	if (
		maxX < 0 ||
		( 0 === minX &&
			0 === minY &&
			maxX === canvas.width - 1 &&
			maxY === canvas.height - 1 )
	) {
		return false; // nothing to trim
	}
	return cropDoc(
		editor,
		{ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
		__( 'Trim', 'wunderpaint' )
	);
}

/** Rotate the whole document 90° (spec 04.2). */
export function rotateDoc( editor, cw ) {
	recordStep( 'rotate90', { cw: !! cw } );
	const { dispatch, commit, state } = editor;
	const H = state.doc.h;
	const W = state.doc.w;

	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( layer ) => {
			const cx = layer.x + layer.w / 2;
			const cy = layer.y + layer.h / 2;
			const ncx = cw ? H - cy : cy;
			const ncy = cw ? cx : W - cx;
			const patch = {
				...layer,
				x: ncx - layer.w / 2,
				y: ncy - layer.h / 2,
				rot:
					( ( ( ( ( layer.rot || 0 ) + ( cw ? 90 : -90 ) + 180 ) %
						360 ) +
						360 ) %
						360 ) -
					180,
			};
			if ( 'stroke' === layer.type ) {
				// Keep the paint-order delta consistent with the moved bbox.
				patch.x0 = ( layer.x0 ?? layer.x ) + ( patch.x - layer.x );
				patch.y0 = ( layer.y0 ?? layer.y ) + ( patch.y - layer.y );
			}
			if ( 'gradient' === layer.type ) {
				const rp = ( p ) =>
					cw ? { x: H - p.y, y: p.x } : { x: p.y, y: W - p.x };
				patch.from = rp( layer.from );
				patch.to = rp( layer.to );
			}
			return patch;
		} ),
	} );
	dispatch( { type: 'SET_DOC', doc: { w: H, h: W } } );
	commit(
		cw
			? __( 'Rotate 90° CW', 'wunderpaint' )
			: __( 'Rotate 90° CCW', 'wunderpaint' )
	);
	return true;
}

/** Flip the whole document (spec 04.2). */
export function flipDoc( editor, horizontal ) {
	recordStep( 'flip', { horizontal: !! horizontal } );
	const { dispatch, commit, state } = editor;
	const W = state.doc.w;
	const H = state.doc.h;
	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( layer ) => {
			const cx = layer.x + layer.w / 2;
			const cy = layer.y + layer.h / 2;
			const patch = {
				...layer,
				rot: -( layer.rot || 0 ),
				[ horizontal ? 'flipX' : 'flipY' ]:
					! layer[ horizontal ? 'flipX' : 'flipY' ],
			};
			if ( horizontal ) {
				patch.x = W - cx - layer.w / 2;
			} else {
				patch.y = H - cy - layer.h / 2;
			}
			if ( 'stroke' === layer.type ) {
				patch.x0 =
					( layer.x0 ?? layer.x ) +
					( ( patch.x ?? layer.x ) - layer.x );
				patch.y0 =
					( layer.y0 ?? layer.y ) +
					( ( patch.y ?? layer.y ) - layer.y );
			}
			if ( 'gradient' === layer.type ) {
				const fp = ( p ) =>
					horizontal
						? { x: W - p.x, y: p.y }
						: { x: p.x, y: H - p.y };
				patch.from = fp( layer.from );
				patch.to = fp( layer.to );
			}
			return patch;
		} ),
	} );
	commit(
		horizontal
			? __( 'Flip Horizontal', 'wunderpaint' )
			: __( 'Flip Vertical', 'wunderpaint' )
	);
	return true;
}

/**
 * Merge the active layer into the visible layer below (spec 04.2 Layer).
 * Both render through the shared pipeline, so the merge is pixel-exact.
 */
export async function mergeDown( editor ) {
	const { dispatch, commit, state } = editor;
	const idx = state.layers.findIndex( ( l ) => l.id === state.activeId );
	if ( idx < 1 ) {
		return false;
	}
	const top = state.layers[ idx ];
	const below = state.layers[ idx - 1 ];
	if (
		'group' === top.type ||
		'group' === below.type ||
		top.parent !== below.parent
	) {
		return false;
	}
	const canvas = await renderToCanvas(
		{ ...state.doc, bg: 'transparent' },
		[ below, top ],
		{ cache: sharedImageCache }
	);
	const merged = makeRaster( {
		name: below.name,
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
		canvas,
	} );
	merged.parent = below.parent;
	const layers = state.layers
		.filter( ( l ) => l.id !== top.id )
		.map( ( l ) => ( l.id === below.id ? merged : l ) );
	dispatch( { type: 'SET_LAYERS', layers } );
	dispatch( { type: 'SET_ACTIVE', id: merged.id } );
	commit( __( 'Merge Down', 'wunderpaint' ) );
	return true;
}

/** Flatten the whole document into one raster layer (spec 04.2). */
export async function flattenDoc( editor ) {
	recordStep( 'flatten', {} );
	const { dispatch, commit, state } = editor;
	const canvas = await renderToCanvas( state.doc, state.layers, {
		cache: sharedImageCache,
	} );
	const flat = makeRaster( {
		name: __( 'Background', 'wunderpaint' ),
		x: 0,
		y: 0,
		w: state.doc.w,
		h: state.doc.h,
		canvas,
	} );
	dispatch( { type: 'SET_LAYERS', layers: [ flat ] } );
	dispatch( { type: 'SET_ACTIVE', id: flat.id } );
	commit( __( 'Flatten', 'wunderpaint' ) );
	return true;
}

/**
 * Magic Resize (v1.11): retarget the document to a new format WITHOUT
 * distortion, every layer scales uniformly and the whole composition is
 * re-centered in the new canvas (Canva-style).
 *
 * @param {Object} editor Editor context.
 * @param {number} newW   Target width.
 * @param {number} newH   Target height.
 * @return {boolean} Success.
 */
export function magicResizeDoc( editor, newW, newH ) {
	const { dispatch, commit, state } = editor;
	const s = Math.min( newW / state.doc.w, newH / state.doc.h );
	if ( ! isFinite( s ) || s <= 0 ) {
		return false;
	}
	const dx = ( newW - state.doc.w * s ) / 2;
	const dy = ( newH - state.doc.h * s ) / 2;
	recordStep( 'magicResize', { w: newW, h: newH } );

	dispatch( {
		type: 'SET_LAYERS',
		layers: state.layers.map( ( layer ) => {
			const patch = {
				...layer,
				x: layer.x * s + dx,
				y: layer.y * s + dy,
				w: layer.w * s,
				h: layer.h * s,
			};
			if ( 'text' === layer.type ) {
				patch.fontSize = layer.fontSize * s;
				patch.letterSpacing = ( layer.letterSpacing || 0 ) * s;
			}
			if ( layer.strokeW ) {
				patch.strokeW = layer.strokeW * s;
			}
			if ( 'stroke' === layer.type ) {
				patch.x0 = ( layer.x0 ?? layer.x ) * s + dx;
				patch.y0 = ( layer.y0 ?? layer.y ) * s + dy;
				patch.paths = layer.paths.map( ( p ) => ( {
					...p,
					d: offsetPathD( scalePathD( p.d, s, s ), dx, dy ),
					size: p.size * s,
				} ) );
			}
			if ( 'gradient' === layer.type ) {
				patch.from = {
					x: layer.from.x * s + dx,
					y: layer.from.y * s + dy,
				};
				patch.to = { x: layer.to.x * s + dx, y: layer.to.y * s + dy };
			}
			if ( 'shape' === layer.type && layer.pathD ) {
				// pathD is layer-local, scale only, the offset lives in x/y.
				patch.pathD = scalePathD( layer.pathD, s, s );
			}
			if ( 'raster' === layer.type && layer.canvas ) {
				patch.canvas = scaleCanvas(
					layer.canvas,
					layer.canvas.width * s,
					layer.canvas.height * s
				);
			}
			if ( layer.mask?.canvas ) {
				const scaled = createCanvas( newW, newH );
				const mctx = scaled.getContext( '2d' );
				mctx.drawImage(
					layer.mask.canvas,
					dx,
					dy,
					state.doc.w * s,
					state.doc.h * s
				);
				patch.mask = { ...layer.mask, canvas: scaled };
			}
			return patch;
		} ),
	} );
	dispatch( {
		type: 'SET_DOC',
		doc: { w: Math.round( newW ), h: Math.round( newH ) },
	} );
	commit( __( 'Resize Design', 'wunderpaint' ) );
	return true;
}
