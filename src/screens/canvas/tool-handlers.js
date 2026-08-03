/**
 * Complete behavior of every tool in TOOLS (spec 05.4). Each handler implements
 * onDown/onMove/onUp (+ onDblClick) in DOCUMENT coordinates; one history
 * commit per finished gesture (spec 04.6).
 *
 * The tool context `tc` (built fresh per event by editor-canvas.jsx):
 * { editor, extras, doc, layers, opts, fg, bg, selection,
 *   draft, setDraft, setGuides, zoom, beginTextEdit, imageCache }
 */

import { CORNERS, withCorner } from '../../lib/corner-radii';
import { polygonVertices, radiusFromInset } from '../../lib/corner-geometry';
import {
	leadingFromDrag,
	trackingFromDrag,
	widthFromDrag,
} from '../../lib/text-grips';
import {
	angleAtPoint,
	offsetAtPoint,
	withStopAt,
} from '../../lib/gradient-axis';
import {
	hasPivot,
	pivotFromLocal,
	pivotPoint,
	rotateAbout,
} from '../../lib/pivot';
import { __ } from '@wordpress/i18n';

import { bindToolHandlerSink } from '../../lib/extensions';
import {
	lineEndpoints,
	lineFromEndpoints,
	snapLineEnd,
} from '../../lib/line-geometry';
import { socialCropById } from '../../lib/safe-zones';
import { wandMask } from '../../lib/magic-wand';
import { isModelInstalled } from '../../lib/ml';
import { createSegmenter } from '../../lib/smart-select';
import {
	makeText,
	makeShape,
	makeStroke,
	makeGradient,
	makeGroup,
} from '../../store/document';
import {
	combine,
	pointInSelection,
	selectionToMaskCanvas,
} from '../../store/selection';
import {
	imageToRaster,
	paintStroke,
	paintOnMask,
	floodFill,
	layerLocalMask,
	buildRasterCanvas,
	cloneStamp,
	effectStamp,
	mirrorPathD,
} from '../../lib/raster-layer';
import {
	samplePixel,
	renderToCanvas,
	sharedImageCache,
	createCanvas,
	layerAlphaAt,
	PIXEL_HIT_ALPHA,
} from '../../lib/raster';
import { rgbToHex, colorLuminance } from '../../lib/color';
import { parsePathAnchors, nearestOnPath } from '../../lib/path-edit';
import { shapeToPathD } from '../../lib/shape-path';
import { isStampTip, mirrorPts } from '../../lib/brush-tips';
import { collectTargets, snapRect } from '../../lib/snap';
import { cropDoc, cloneLayerTree } from '../../store/doc-ops';
import { expandGroupIds } from '../../store/editor-context';
import {
	topGroupOf as unitTopGroupOf,
	selectionUnits,
	unitFor,
	scaleLeafPatch,
	leafSnapshot,
} from '../../lib/selection-units';
import { zoomAboutPoint } from './use-viewport';

/* ------------------------------- helpers ------------------------------- */

/** Point in the convex quad {tl,tr,br,bl}? Sign-consistent cross products. */
const pointInQuad = ( quad, x, y ) => {
	const pts = [ quad.tl, quad.tr, quad.br, quad.bl ];
	let sign = 0;
	for ( let i = 0; i < 4; i++ ) {
		const a = pts[ i ];
		const b = pts[ ( i + 1 ) % 4 ];
		const cross = ( b.x - a.x ) * ( y - a.y ) - ( b.y - a.y ) * ( x - a.x );
		if ( 0 === cross ) {
			continue;
		}
		const s = cross > 0 ? 1 : -1;
		if ( sign && s !== sign ) {
			return false;
		}
		sign = s;
	}
	return true;
};

/** Rotation-aware point-in-layer hit test (spec 05.4 Move). */
export function hitTestLayer( layer, x, y ) {
	if ( layer.quad ) {
		// Perspective-warped layers render at their quad corners, which
		// need not match the stored box (v1.364.0): a warped corner used
		// to be unclickable while the empty box corner swallowed clicks.
		return pointInQuad( layer.quad, x, y );
	}
	if ( layer.rot ) {
		const cx = layer.x + layer.w / 2;
		const cy = layer.y + layer.h / 2;
		const rad = ( -layer.rot * Math.PI ) / 180;
		const dx = x - cx;
		const dy = y - cy;
		x = cx + dx * Math.cos( rad ) - dy * Math.sin( rad );
		y = cy + dx * Math.sin( rad ) + dy * Math.cos( rad );
	}
	return (
		x >= layer.x &&
		x <= layer.x + layer.w &&
		y >= layer.y &&
		y <= layer.y + layer.h
	);
}

/**
 * True when any ancestor group of the layer is hidden. Rendering walks the
 * tree and skips a hidden group's whole subtree, but the children keep
 * their own `visible: true` - hit tests must mirror that (v1.363.0), or
 * the invisible members of a hidden group still swallow clicks and drops.
 */
export function ancestorHidden( layers, layer ) {
	for (
		let g = layers.find( ( l ) => l.id === layer.parent );
		g;
		g = layers.find( ( l ) => l.id === g.parent )
	) {
		if ( ! g.visible ) {
			return true;
		}
	}
	return false;
}

/**
 * True when any ancestor group of the layer is locked (v1.364.0). A locked
 * group protects its whole subtree: without the walk, the direct-select
 * tool could still grab and move an unlocked CHILD of a locked group.
 */
export function ancestorLocked( layers, layer ) {
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
 * Top-most unlocked visible layer at a doc point (walks groups).
 *
 * With `opts.pixel` the CONTENT decides (v1.127.0): transparent pixels of
 * images, rasters and shapes let the click fall through to the layer you
 * actually see - stacked vector paths from an SVG import or a vectorize run
 * all share overlapping boxes, so a box test always hit the top path.
 *
 * @param {Array}  layers Flat layer list.
 * @param {number} x      Doc X.
 * @param {number} y      Doc Y.
 * @param {Object} [opts] { pixel, cache } - pixel-accurate mode + image cache.
 * @return {Object|null} The hit layer.
 */
export function topLayerAt( layers, x, y, opts = {} ) {
	for ( let i = layers.length - 1; i >= 0; i-- ) {
		const layer = layers[ i ];
		if (
			! layer.visible ||
			layer.locked ||
			'group' === layer.type ||
			'adjustment' === layer.type
		) {
			continue;
		}
		if ( ! hitTestLayer( layer, x, y ) ) {
			continue;
		}
		if (
			ancestorHidden( layers, layer ) ||
			ancestorLocked( layers, layer )
		) {
			continue;
		}
		if ( opts.pixel ) {
			const a = layerAlphaAt( layer, x, y, opts.cache );
			if ( null !== a && a * ( layer.opacity ?? 1 ) < PIXEL_HIT_ALPHA ) {
				continue;
			}
		}
		return layer;
	}
	return null;
}

/**
 * Targets for an image dropped at a doc point (v1.363.0): `swap` is the
 * image layer whose picture gets replaced in place, `frame` the
 * silhouette (shape, text, stroke, raster) the drop is clipped into.
 *
 * The layer panel is explicit intent, so a usable ACTIVE image layer wins
 * no matter where the drop lands - inside a group, buried under a
 * vignette, or on empty canvas. Without one the pixel hit decides:
 * transparent overlay areas let the drop fall through to the layer you
 * actually see. Eraser strokes cannot be a clipping base.
 *
 * @param {Array}  layers   Flat layer list.
 * @param {string} activeId Active layer id (or null).
 * @param {number} x        Doc X.
 * @param {number} y        Doc Y.
 * @param {Object} [opts]   { cache } - image cache for the pixel probe.
 * @return {Object} { swap, frame } - either may be null.
 */
export function dropTargetsAt( layers, activeId, x, y, opts = {} ) {
	const active = activeId ? layers.find( ( l ) => l.id === activeId ) : null;
	if (
		active &&
		'image' === active.type &&
		active.visible &&
		! active.locked &&
		! ancestorHidden( layers, active ) &&
		! ancestorLocked( layers, active )
	) {
		return { swap: active, frame: null };
	}
	const hit = topLayerAt( layers, x, y, {
		pixel: true,
		cache: opts.cache,
	} );
	const swap = hit && 'image' === hit.type ? hit : null;
	const frame =
		hit &&
		[ 'shape', 'text', 'stroke', 'raster' ].includes( hit.type ) &&
		! hit.erase
			? hit
			: null;
	return { swap, frame };
}

/** Any opaque content of the layer inside the rect? Coarse 5x5 grid probe. */
const rectTouchesContent = ( layer, rect, cache ) => {
	const x0 = Math.max( rect.x, layer.x );
	const y0 = Math.max( rect.y, layer.y );
	const x1 = Math.min( rect.x + rect.w, layer.x + layer.w );
	const y1 = Math.min( rect.y + rect.h, layer.y + layer.h );
	if ( x1 <= x0 || y1 <= y0 ) {
		return false;
	}
	const N = 4;
	for ( let i = 0; i <= N; i++ ) {
		for ( let j = 0; j <= N; j++ ) {
			const a = layerAlphaAt(
				layer,
				x0 + ( ( x1 - x0 ) * i ) / N,
				y0 + ( ( y1 - y0 ) * j ) / N,
				cache
			);
			// Not pixel-testable (text, strokes) keeps the box result.
			if ( null === a || a * ( layer.opacity ?? 1 ) >= PIXEL_HIT_ALPHA ) {
				return true;
			}
		}
	}
	return false;
};

/**
 * Resolve a rubber-band rect to the units it selects (v1.364.0). A layer
 * only joins when some of its VISIBLE content lies inside the rect: the
 * old box-overlap test put every full-canvas overlay (vignette, glow) and
 * background into EVERY marquee, so any rubber band selected "everything"
 * and dragging moved the whole picture as one clump. Children of hidden
 * groups never join, locked units never join. With `opts.deep` (Select
 * tool) the touched leaves are returned instead of their outer groups.
 *
 * @param {Array}  layers Flat layer list.
 * @param {Object} rect   { x, y, w, h } in doc coords.
 * @param {Object} [opts] { cache, deep }.
 * @return {Array} Selected layer objects (unit roots or leaves).
 */
export function rubberSelectRoots( layers, rect, opts = {} ) {
	const seen = new Set();
	const roots = [];
	for ( const l of layers ) {
		if (
			! l.visible ||
			l.locked ||
			'group' === l.type ||
			l.x >= rect.x + rect.w ||
			l.x + l.w <= rect.x ||
			l.y >= rect.y + rect.h ||
			l.y + l.h <= rect.y ||
			ancestorHidden( layers, l ) ||
			ancestorLocked( layers, l )
		) {
			continue;
		}
		if ( ! rectTouchesContent( l, rect, opts.cache ) ) {
			continue;
		}
		const root = opts.deep ? l : topGroupOf( layers, l );
		if ( ! root.locked && ! seen.has( root.id ) ) {
			seen.add( root.id );
			roots.push( root );
		}
	}
	return roots;
}

/**
 * The top-most group a layer belongs to (Photoshop "auto-select group"), or
 * the layer itself when it is not grouped. Clicking any group member on the
 * canvas should then select and move the whole group.
 */
export const topGroupOf = unitTopGroupOf;

/** The active layer, or null. */
const activeLayer = ( tc ) =>
	tc.layers.find( ( l ) => l.id === tc.editor.state.activeId ) || null;

/**
 * Promote an image layer to raster for destructive edits
 * (rasterize-on-first-edit, spec 02.2). Returns the (new) raster layer.
 */
export function ensureRaster( tc, layer ) {
	if ( 'raster' === layer.type ) {
		if ( ! layer.canvas ) {
			const source = layer.dataUrl
				? tc.imageCache.get( layer.dataUrl )
				: null;
			const canvas = buildRasterCanvas( layer, source );
			const patched = { ...layer, canvas };
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { canvas },
			} );
			return patched;
		}
		return layer;
	}
	if ( 'image' === layer.type ) {
		const img = tc.imageCache.get( layer.src );
		if ( ! img ) {
			return null;
		}
		const raster = imageToRaster( layer, img );
		tc.editor.dispatch( {
			type: 'SET_LAYERS',
			layers: tc.layers.map( ( l ) =>
				l.id === layer.id ? raster : l
			),
		} );
		return raster;
	}
	return null;
}

/** Apply the current selection as a mask on a newly committed vector layer. */
function maskFromSelection( tc, layer ) {
	if ( ! tc.selection ) {
		return layer;
	}
	const mask = selectionToMaskCanvas( tc.selection, tc.doc.w, tc.doc.h, {
		feather: tc.selection.feather,
	} );
	return {
		...layer,
		mask: {
			kind: 'raster',
			canvas: mask,
			data: mask.toDataURL ? mask.toDataURL( 'image/png' ) : null,
			inverted: false,
			enabled: true,
		},
	};
}

const constrain = ( w, h, on ) => {
	if ( ! on ) {
		return { w, h };
	}
	const m = Math.max( Math.abs( w ), Math.abs( h ) );
	return { w: Math.sign( w || 1 ) * m, h: Math.sign( h || 1 ) * m };
};

/**
 * Symmetry twins for a paint stroke (v0.7, v1.23): mirror BOTH the SVG path
 * (round tips) and the sampled points (stamped tips) across the document
 * axes, so every brush tip supports symmetry. Twin order matches
 * mirrorPathD: x, y, then xy.
 *
 * @param {Object} path   Stroke path { d, pts, ... }.
 * @param {number} docW   Document width.
 * @param {number} docH   Document height.
 * @param {string} mirror off | x | y | xy.
 * @return {Array} Mirrored twin paths.
 */
export function mirrorStrokeTwins( path, docW, docH, mirror ) {
	if ( ! mirror || 'off' === mirror ) {
		return [];
	}
	const ds = mirrorPathD( path.d, docW, docH, mirror );
	const axes = 'xy' === mirror ? [ 'x', 'y', 'xy' ] : [ mirror ];
	return ds.map( ( d2, i ) => ( {
		...path,
		d: d2,
		pts: mirrorPts( path.pts || [], docW, docH, axes[ i ] ),
	} ) );
}

/* --------------------------------- Move -------------------------------- */

export const moveTool = {
	onDown( tc, e, p ) {
		const hit = topLayerAt( tc.layers, p.x, p.y, {
			pixel: true,
			cache: tc.imageCache,
		} );
		// Direct selection (v1.126): the Select tool - or Cmd/Ctrl-click
		// with Move (Figma convention) - targets the clicked element
		// itself, even inside groups. Move keeps auto-selecting the group.
		const deep =
			'select' === tc.editor.state.tool || e.metaKey || e.ctrlKey;
		const resolveTarget = ( l ) =>
			deep ? l : topGroupOf( tc.layers, l );
		// Drill into a group on the canvas (v1.291.0): once a group is
		// engaged, a plain click (no drag) on one of its children selects
		// that child so you can move a single text/element without the layer
		// panel. A drag still moves the whole group until you have drilled in;
		// then dragging moves the child and clicks hop between siblings.
		const activeL = activeLayer( tc );
		const ctxGroupId = activeL ? topGroupOf( tc.layers, activeL ).id : null;
		const drilledIn = !! (
			activeL &&
			ctxGroupId &&
			activeL.id !== ctxGroupId
		);
		const selTopGroups = new Set(
			tc.editor.state.selectedIds
				.map( ( id ) => tc.layers.find( ( l ) => l.id === id ) )
				.filter( Boolean )
				.map( ( l ) => topGroupOf( tc.layers, l ).id )
		);
		const singleContext = selTopGroups.size <= 1;
		const insideEngaged =
			! deep &&
			! e.shiftKey &&
			!! ctxGroupId &&
			singleContext &&
			!! hit &&
			topGroupOf( tc.layers, hit ).id === ctxGroupId &&
			hit.id !== ctxGroupId;
		let drillTo = null;
		if ( ! hit ) {
			// Rubber-band multi-select on empty canvas.
			tc.setDraft( {
				kind: 'rubber',
				start: p,
				rect: { x: p.x, y: p.y, w: 0, h: 0 },
				deep,
			} );
			if ( ! e.shiftKey ) {
				tc.editor.dispatch( { type: 'SET_ACTIVE', id: null } );
			}
			return;
		}
		// Alt-drag duplicates the hit UNIT and drags the copy (v1.15,
		// Photoshop/Figma standard). On the canvas the unit is the whole
		// outermost group: the clone brings the full subtree along (v1.66).
		if ( e.altKey && ! e.shiftKey && ! hit.locked ) {
			const layers = tc.editor.state.layers;
			const target = resolveTarget( hit );
			if ( target.locked ) {
				return;
			}
			const { copies, idMap } = cloneLayerTree( layers, [ target.id ] );
			const rootId = idMap.get( target.id );
			const placed = copies.map( ( c ) =>
				c.id === rootId ? { ...c, name: target.name + ' copy' } : c
			);
			// Insert right above the original subtree, keep any outer group.
			let insertAt = layers.findIndex( ( l ) => l.id === target.id );
			layers.forEach( ( l, i ) => {
				if ( idMap.has( l.id ) ) {
					insertAt = Math.max( insertAt, i );
				}
			} );
			let next = [ ...layers ];
			next.splice( insertAt + 1, 0, ...placed );
			if ( target.parent ) {
				next = next.map( ( l ) =>
					l.id === target.parent && 'group' === l.type
						? {
								...l,
								children: [ ...( l.children || [] ), rootId ],
						  }
						: l
				);
			}
			tc.editor.dispatch( { type: 'SET_LAYERS', layers: next } );
			tc.editor.dispatch( { type: 'SET_ACTIVE', id: rootId } );
			const moveIds = placed
				.filter( ( l ) => ! l.locked )
				.map( ( l ) => l.id );
			tc.setDraft( {
				kind: 'move',
				start: p,
				ids: moveIds,
				orig: new Map(
					placed.map( ( l ) => [ l.id, { x: l.x, y: l.y } ] )
				),
				moved: false,
				dup: true,
			} );
			return;
		}
		// v1.4: a SELECTED group captures drags on any of its children, so
		// the whole group moves as one unit (Photoshop group behavior).
		const selectedSet = new Set( tc.editor.state.selectedIds );
		let capturingGroup = null;
		if ( ! deep ) {
			for (
				let g = tc.layers.find( ( l ) => l.id === hit.parent );
				g;
				g = tc.layers.find( ( l ) => l.id === g.parent )
			) {
				if (
					'group' === g.type &&
					! g.locked &&
					selectedSet.has( g.id )
				) {
					capturingGroup = g;
					break;
				}
			}
		}
		let ids;
		if ( capturingGroup ) {
			ids = tc.editor.state.selectedIds; // keep the group selection
			// The clicked unit becomes the active layer, so context-bar
			// actions (duplicate, delete, layout) target the group (v1.66).
			tc.editor.dispatch( { type: 'SET_ACTIVE', id: capturingGroup.id } );
			tc.editor.dispatch( { type: 'SET_SELECTED', ids } );
			// A plain click (no drag) here drills into the clicked child on
			// release; a drag keeps moving the whole group (v1.291.0).
			if ( singleContext ) {
				drillTo = hit.id;
			}
		} else if ( e.shiftKey ) {
			const target = resolveTarget( hit );
			const current = new Set( tc.editor.state.selectedIds );
			if ( current.has( target.id ) ) {
				current.delete( target.id );
			} else {
				current.add( target.id );
			}
			ids = Array.from( current );
			tc.editor.dispatch( { type: 'SET_SELECTED', ids } );
		} else if (
			deep
				? tc.editor.state.selectedIds.includes( hit.id )
				: expandGroupIds(
						tc.layers,
						tc.editor.state.selectedIds
				  ).includes( hit.id )
		) {
			// Clicking any MEMBER of the current selection (including a
			// child of a selected group) keeps the multi-selection intact
			// for the drag; before, a click on a grouped child reset the
			// selection to its own group and only that group moved.
			ids = tc.editor.state.selectedIds;
			let anchor = hit;
			while ( anchor && ! ids.includes( anchor.id ) ) {
				anchor = tc.layers.find( ( l ) => l.id === anchor.parent );
			}
			tc.editor.dispatch( {
				type: 'SET_ACTIVE',
				id: anchor ? anchor.id : hit.id,
			} );
			tc.editor.dispatch( { type: 'SET_SELECTED', ids } );
		} else if ( insideEngaged && drilledIn ) {
			// Already inside the group (a child is active): a click selects the
			// clicked child directly, so you can move a single element and hop
			// between siblings without popping back out to the group (v1.291.0).
			ids = [ hit.id ];
			tc.editor.dispatch( { type: 'SET_ACTIVE', id: hit.id } );
		} else {
			// Fresh click resolves to the whole group the layer belongs to, so
			// a grouped lockup selects and moves as one (auto-select group).
			// The Select tool (or Cmd/Ctrl-click) picks the element itself.
			const target = resolveTarget( hit );
			ids = [ target.id ];
			tc.editor.dispatch( { type: 'SET_ACTIVE', id: target.id } );
		}
		// Groups in the selection move with all their descendants. A locked
		// member freezes its WHOLE unit (v1.66): moving only the free
		// members would tear the group apart.
		const moveIds = selectionUnits( {
			layers: tc.layers,
			selectedIds: ids,
		} )
			.filter( ( unit ) => ! unit.locked )
			.flatMap( ( unit ) => unit.ids );
		tc.setDraft( {
			kind: 'move',
			start: p,
			ids: moveIds,
			orig: new Map(
				tc.layers
					.filter( ( l ) => moveIds.includes( l.id ) )
					.map( ( l ) => [ l.id, { x: l.x, y: l.y } ] )
			),
			moved: false,
			drillTo,
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft ) {
			return;
		}
		if ( 'rubber' === draft.kind ) {
			const rect = {
				x: Math.min( draft.start.x, p.x ),
				y: Math.min( draft.start.y, p.y ),
				w: Math.abs( p.x - draft.start.x ),
				h: Math.abs( p.y - draft.start.y ),
			};
			tc.setDraft( { ...draft, rect } );
			return;
		}
		if ( 'move' !== draft.kind ) {
			return;
		}
		let dx = p.x - draft.start.x;
		let dy = p.y - draft.start.y;

		// Snapping + smart guides (spec 05.5).
		if ( tc.editor.state.snap && 1 === draft.ids.length ) {
			const layer = tc.layers.find( ( l ) => l.id === draft.ids[ 0 ] );
			const orig = draft.orig.get( layer.id );
			const target = {
				x: orig.x + dx,
				y: orig.y + dy,
				w: layer.w,
				h: layer.h,
			};
			const snapped = snapRect(
				target,
				collectTargets( tc.editor.state, draft.ids ),
				6 / tc.zoom
			);
			dx += snapped.dx;
			dy += snapped.dy;
			tc.setGuides( snapped.guides );
		}

		tc.editor.dispatch( {
			type: 'UPDATE_LAYERS',
			ids: draft.ids,
			patchFor: ( l ) => {
				const orig = draft.orig.get( l.id );
				return orig ? { x: orig.x + dx, y: orig.y + dy } : {};
			},
		} );
		if ( ! draft.moved ) {
			tc.setDraft( { ...draft, moved: true } );
		}
	},
	onUp( tc ) {
		const draft = tc.draft;
		tc.setGuides( [] );
		if ( ! draft ) {
			return;
		}
		if ( 'rubber' === draft.kind ) {
			if ( draft.rect.w > 4 || draft.rect.h > 4 ) {
				// Marquee selects UNITS (v1.66): every touched element
				// resolves to its outermost group, so the selection reads
				// "these groups", exactly like clicking does. Membership is
				// content-aware since v1.364.0 - see rubberSelectRoots.
				const ids = rubberSelectRoots( tc.layers, draft.rect, {
					cache: tc.imageCache,
					deep: draft.deep,
				} ).map( ( l ) => l.id );
				tc.editor.dispatch( { type: 'SET_SELECTED', ids } );
			}
		} else if ( 'move' === draft.kind && ( draft.moved || draft.dup ) ) {
			tc.editor.commit(
				draft.dup
					? __( 'Duplicate layer', 'wunderpaint' )
					: __( 'Move layer', 'wunderpaint' )
			);
		} else if ( 'move' === draft.kind && draft.drillTo && ! draft.dup ) {
			// A click without a drag inside an engaged group: drill into the
			// clicked child so the next drag moves just that element (v1.291.0).
			tc.editor.dispatch( { type: 'SET_ACTIVE', id: draft.drillTo } );
		}
		tc.setDraft( null );
	},
	onDblClick( tc, e, p ) {
		const hit = topLayerAt( tc.layers, p.x, p.y, {
			pixel: true,
			cache: tc.imageCache,
		} );
		if ( ! hit ) {
			return;
		}
		// Drill into a group: double-click selects the child itself even
		// while its group is selected (Photoshop-style, v1.4.1). This MUST
		// also happen for text (v1.66.1): the edit overlay alone left the
		// GROUP active, so panel/options-bar styling still hit the group
		// after closing the overlay.
		tc.editor.dispatch( { type: 'SET_ACTIVE', id: hit.id } );
		if ( 'text' === hit.type ) {
			tc.beginTextEdit( hit.id );
		} else if ( 'smart' === hit.type ) {
			// Photoshop parity (v1.67): double-click opens the smart
			// object's contents in a nested editing session.
			tc.extras?.smartObject?.editContents?.( hit );
		} else if (
			'image' === hit.type &&
			[ 'cover', 'contain' ].includes( hit.imageFit?.mode )
		) {
			// Reposition the picture inside its box (v1.116).
			tc.beginImagePan?.( hit.id );
		} else if ( 'shape' === hit.type && hit.pathD && ! hit.quad ) {
			// Anchor editing for pen shapes and icon paths (v1.118).
			tc.beginPathEdit?.( hit.id );
		}
	},
};

/* --------------------------- Transform handles -------------------------- */

const rotatePoint = ( px, py, cx, cy, deg ) => {
	const rad = ( deg * Math.PI ) / 180;
	const dx = px - cx;
	const dy = py - cy;
	return {
		x: cx + dx * Math.cos( rad ) - dy * Math.sin( rad ),
		y: cy + dx * Math.sin( rad ) + dy * Math.cos( rad ),
	};
};

/** Begin resize/rotate from a SelectionBox handle. */
export function startTransform( tc, layer, mode, handle, p, e ) {
	// Group corner handles scale the whole UNIT uniformly (v1.66.2): the
	// anchor is the opposite corner of the union box, every leaf scales
	// about it (same math as the Scale slider).
	if ( 'group' === layer.type ) {
		const layers = tc.editor.state.layers;
		const unit = unitFor( layers, layer );
		if ( unit.locked ) {
			return;
		}
		const b = unit.box;
		const leafLayers = unit.ids
			.map( ( id ) => layers.find( ( l ) => l.id === id ) )
			.filter( ( l ) => l && 'group' !== l.type );
		if ( ! leafLayers.length ) {
			return;
		}
		if ( 'rotate' === mode ) {
			// Rigid unit rotation (v1.67): every leaf orbits the union
			// centre AND spins its own rot by the same angle (the
			// compositor applies no group transform).
			tc.setDraft( {
				kind: 'transform',
				mode: 'unit-rotate',
				center: { x: b.x + b.w / 2, y: b.y + b.h / 2 },
				start: p,
				leaves: leafLayers.map( ( l ) => ( {
					id: l.id,
					lcx: l.x + l.w / 2,
					lcy: l.y + l.h / 2,
					w: l.w,
					h: l.h,
					rot: l.rot || 0,
				} ) ),
			} );
			return;
		}
		const anchor = {
			x: handle.includes( 'w' ) ? b.x + b.w : b.x,
			y: handle.includes( 'n' ) ? b.y + b.h : b.y,
		};
		tc.setDraft( {
			kind: 'transform',
			mode: 'unit-scale',
			anchor,
			start: p,
			leaves: leafLayers.map( leafSnapshot ),
		} );
		return;
	}
	// Line endpoint drag (v1.299): the other end stays anchored; the
	// handle name says which end travels with the pointer.
	if ( 'lineEnd' === mode ) {
		const ends = lineEndpoints( layer );
		tc.setDraft( {
			kind: 'transform',
			mode,
			handle,
			layerId: layer.id,
			start: p,
			fixed: 'p1' === handle ? ends[ 1 ] : ends[ 0 ],
		} );
		return;
	}
	if ( 'pivotReset' === mode ) {
		// Double-click on the pivot puts it back in the middle. No drag
		// follows, so this never becomes a gesture.
		tc.editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { pivot: null },
		} );
		tc.editor.commit( __( 'Centre pivot', 'wunderpaint' ) );
		return;
	}
	tc.setDraft( {
		kind: 'transform',
		mode,
		handle,
		layerId: layer.id,
		start: p,
		orig: {
			x: layer.x,
			y: layer.y,
			w: layer.w,
			h: layer.h,
			rot: layer.rot || 0,
			fontSize: layer.fontSize,
			spans: layer.spans || null,
			radius: layer.radius ?? 0,
			gradientStops: layer.gradientStops || null,
			styles: layer.styles || null,
			pivot: layer.pivot || null,
			letterSpacing: layer.letterSpacing || 0,
			lineHeight: layer.lineHeight,
			sides: layer.sides,
			innerRatio: layer.innerRatio,
			shape: layer.shape,
		},
		alt: e.altKey,
	} );
}

/**
 * Corner-radius drag (v1.367). The grip sits at ( r, r ) inside its corner,
 * so it tracks the pointer along the diagonal when the radius is the MEAN of
 * the two offsets - projecting onto the diagonal instead would move the grip
 * at √2 times the pointer's speed and slide out from under the cursor.
 *
 * @param {string} corner tl|tr|br|bl.
 * @param {Object} o      The gesture's original box { x, y, w, h }.
 * @param {Object} local  Pointer in the layer's unrotated space.
 * @return {number} The radius that puts the grip under the pointer.
 */
export function radiusFromPointer( corner, o, local ) {
	const dx =
		corner === 'tl' || corner === 'bl'
			? local.x - o.x
			: o.x + o.w - local.x;
	const dy =
		corner === 'tl' || corner === 'tr'
			? local.y - o.y
			: o.y + o.h - local.y;
	const max = Math.min( o.w, o.h ) / 2;
	return Math.max( 0, Math.min( ( dx + dy ) / 2, max ) );
}

export const transformGesture = {
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'transform' !== draft.kind ) {
			return;
		}
		if ( 'unit-rotate' === draft.mode ) {
			const c = draft.center;
			const angle0 =
				( Math.atan2( draft.start.y - c.y, draft.start.x - c.x ) *
					180 ) /
				Math.PI;
			const angle1 =
				( Math.atan2( p.y - c.y, p.x - c.x ) * 180 ) / Math.PI;
			let deg = angle1 - angle0;
			if ( e.shiftKey ) {
				deg = Math.round( deg / 15 ) * 15;
			} else if ( ! e.altKey ) {
				const nearest = Math.round( deg / 15 ) * 15;
				if ( Math.abs( deg - nearest ) <= 3 ) {
					deg = nearest;
				}
			}
			const rad = ( deg * Math.PI ) / 180;
			const cos = Math.cos( rad );
			const sin = Math.sin( rad );
			for ( const lf of draft.leaves ) {
				const dx = lf.lcx - c.x;
				const dy = lf.lcy - c.y;
				const ncx = c.x + dx * cos - dy * sin;
				const ncy = c.y + dx * sin + dy * cos;
				const rot =
					( ( ( ( lf.rot + deg + 180 ) % 360 ) + 360 ) % 360 ) - 180;
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: lf.id,
					patch: {
						x: ncx - lf.w / 2,
						y: ncy - lf.h / 2,
						rot,
					},
				} );
			}
			return;
		}
		if ( 'unit-scale' === draft.mode ) {
			// Uniform group scaling: project the cursor onto the original
			// anchor→grab diagonal, factor = projected length ratio.
			const a = draft.anchor;
			const sx = draft.start.x - a.x;
			const sy = draft.start.y - a.y;
			const denom = sx * sx + sy * sy || 1;
			const f = Math.max(
				0.05,
				( ( p.x - a.x ) * sx + ( p.y - a.y ) * sy ) / denom
			);
			for ( const lf of draft.leaves ) {
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: lf.id,
					patch: scaleLeafPatch( lf, f, a.x, a.y ),
				} );
			}
			return;
		}
		const layer = tc.layers.find( ( l ) => l.id === draft.layerId );
		if ( ! layer ) {
			return;
		}
		if ( 'lineEnd' === draft.mode ) {
			const target = e.shiftKey ? snapLineEnd( draft.fixed, p ) : p;
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: lineFromEndpoints( draft.fixed, target ),
			} );
			return;
		}
		const o = draft.orig;
		const cx = o.x + o.w / 2;
		const cy = o.y + o.h / 2;

		if ( 'rotate' === draft.mode ) {
			// With a pivot the layer does what a group has always done:
			// it spins AND orbits, so the pivot itself stays put.
			if ( hasPivot( o ) ) {
				const pv = pivotPoint( { ...o, pivot: o.pivot } );
				const from =
					( Math.atan2( draft.start.y - pv.y, draft.start.x - pv.x ) *
						180 ) /
					Math.PI;
				const to =
					( Math.atan2( p.y - pv.y, p.x - pv.x ) * 180 ) / Math.PI;
				let deg = to - from;
				if ( e.shiftKey ) {
					deg = Math.round( deg / 15 ) * 15;
				} else if ( ! e.altKey ) {
					const near = Math.round( deg / 15 ) * 15;
					if ( Math.abs( deg - near ) <= 3 ) {
						deg = near;
					}
				}
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: rotateAbout( o, pv, deg ),
				} );
				return;
			}
			const angle0 =
				( Math.atan2( draft.start.y - cy, draft.start.x - cx ) * 180 ) /
				Math.PI;
			const angle1 = ( Math.atan2( p.y - cy, p.x - cx ) * 180 ) / Math.PI;
			let rot = o.rot + ( angle1 - angle0 );
			if ( e.shiftKey ) {
				// Hard 15° grid.
				rot = Math.round( rot / 15 ) * 15;
			} else if ( ! e.altKey ) {
				// Soft detents: settle on 15° multiples when close (v1.3);
				// Alt keeps rotation fully free.
				const nearest = Math.round( rot / 15 ) * 15;
				if ( Math.abs( rot - nearest ) <= 3 ) {
					rot = nearest;
				}
			}
			// Normalize to -180..180.
			rot = ( ( ( ( rot + 180 ) % 360 ) + 360 ) % 360 ) - 180;
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { rot },
			} );
			return;
		}

		// Text spacing grips (v1.371). All three measure the drag in the
		// layer's own space, so a rotated headline behaves like a level one.
		if (
			'textWidth' === draft.mode ||
			'textLeading' === draft.mode ||
			'textTracking' === draft.mode
		) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			const from = rotatePoint(
				draft.start.x,
				draft.start.y,
				cx,
				cy,
				-o.rot
			);
			const dx = at.x - from.x;
			const dy = at.y - from.y;
			const patch =
				'textWidth' === draft.mode
					? widthFromDrag( o, dx )
					: 'textLeading' === draft.mode
					? { lineHeight: leadingFromDrag( o, dy ) }
					: { letterSpacing: trackingFromDrag( o, dx ) };
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch,
			} );
			return;
		}

		// Pivot (v1.370): moved in the layer's own space, so it stays on
		// the feature it was placed on however the layer is turned.
		if ( 'pivot' === draft.mode ) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					pivot: pivotFromLocal( o, {
						x: at.x - o.x,
						y: at.y - o.y,
					} ),
				},
			} );
			return;
		}

		// Shadow grip (v1.369): the pointer's offset from the layer centre
		// IS the shadow's angle and distance. One gesture for two numbers
		// that used to be typed blind.
		if ( 'shadow' === draft.mode ) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			const dx = at.x - ( o.x + o.w / 2 );
			const dy = at.y - ( o.y + o.h / 2 );
			let deg = ( Math.atan2( dy, dx ) * 180 ) / Math.PI;
			if ( e.shiftKey ) {
				deg = Math.round( deg / 15 ) * 15;
			}
			const key = draft.handle;
			const prev = ( o.styles && o.styles[ key ] ) || {};
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					styles: {
						...( layer.styles || {} ),
						[ key ]: {
							...prev,
							angle: Math.round(
								( ( ( ( deg + 180 ) % 360 ) + 360 ) % 360 ) -
									180
							),
							distance: Math.round( Math.hypot( dx, dy ) ),
						},
					},
				},
			} );
			return;
		}

		// Gradient handles (v1.369): the axis end swings the angle, a stop
		// dot slides along the axis. Both read the pointer in the layer's
		// own space, so a rotated layer needs no special case.
		if ( 'gradAngle' === draft.mode || 'gradStop' === draft.mode ) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			const local = { x: at.x - o.x, y: at.y - o.y };
			if ( 'gradAngle' === draft.mode ) {
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						gradientAngle: angleAtPoint( layer, local, e.shiftKey ),
					},
				} );
				return;
			}
			const index = parseInt( draft.handle, 10 ) || 0;
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					gradientStops: withStopAt(
						o.gradientStops,
						index,
						offsetAtPoint( layer, local )
					),
				},
			} );
			return;
		}

		// Polygon and star grips (v1.368). Both read the pointer in the
		// layer's own space and change ONE number; the box never moves.
		if ( 'ringRadius' === draft.mode || 'starWaist' === draft.mode ) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			const lx = at.x - o.x;
			const ly = at.y - o.y;
			const pts = polygonVertices(
				o.shape,
				o.w,
				o.h,
				o.sides || ( 'star' === o.shape ? 5 : 6 ),
				o.innerRatio
			);
			if ( 'starWaist' === draft.mode ) {
				// The waist is a fraction of the outer radius, measured
				// along the ray the inner point sits on.
				const ox = o.w / 2;
				const oy = o.h / 2;
				const outer = Math.hypot( pts[ 0 ].x - ox, pts[ 0 ].y - oy );
				const at1 = Math.hypot( lx - ox, ly - oy );
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: {
						innerRatio: Math.max(
							0.05,
							Math.min( at1 / ( outer || 1 ), 0.95 )
						),
					},
				} );
				return;
			}
			// Project the pointer onto the first edge; how far along it sits
			// is how deep the rounding cuts into the corner.
			const v0 = pts[ 0 ];
			const v1 = pts[ 1 % pts.length ];
			const ex = v1.x - v0.x;
			const ey = v1.y - v0.y;
			const elen = Math.hypot( ex, ey ) || 1;
			const along = ( ( lx - v0.x ) * ex + ( ly - v0.y ) * ey ) / elen;
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					radius: Math.round( radiusFromInset( pts, 0, along ) ),
				},
			} );
			return;
		}

		// Corner radius: same local space as a resize, but nothing about the
		// box changes - only how its corners are drawn. Alt bends the one
		// corner under the pointer, a plain drag keeps all four together.
		if ( 'radius' === draft.mode ) {
			const at = rotatePoint( p.x, p.y, cx, cy, -o.rot );
			const r = Math.round( radiusFromPointer( draft.handle, o, at ) );
			const index = CORNERS.indexOf( draft.handle );
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: {
					radius: e.altKey ? withCorner( o.radius, index, r ) : r,
				},
			} );
			return;
		}

		// Resize: work in the layer's local (unrotated) space.
		const local = rotatePoint( p.x, p.y, cx, cy, -o.rot );
		const start = rotatePoint(
			draft.start.x,
			draft.start.y,
			cx,
			cy,
			-o.rot
		);
		const dx = local.x - start.x;
		const dy = local.y - start.y;

		const h = draft.handle;
		let { x, y, w, h: hh } = o;
		if ( h.includes( 'e' ) ) {
			w = o.w + dx;
		}
		if ( h.includes( 'w' ) ) {
			w = o.w - dx;
			x = o.x + dx;
		}
		if ( h.includes( 's' ) ) {
			hh = o.h + dy;
		}
		if ( h.includes( 'n' ) ) {
			hh = o.h - dy;
			y = o.y + dy;
		}

		// Corner + Shift keeps aspect; images/smart keep aspect by default.
		const corner = 2 === h.length;
		const keepAspect =
			corner &&
			( e.shiftKey || [ 'image', 'smart' ].includes( layer.type ) );
		if ( keepAspect && o.w && o.h ) {
			const ratio = o.w / o.h;
			if ( Math.abs( w / o.w ) < Math.abs( hh / o.h ) ) {
				w = Math.sign( w || 1 ) * Math.abs( hh * ratio );
			} else {
				hh = Math.sign( hh || 1 ) * Math.abs( w / ratio );
			}
			if ( h.includes( 'w' ) ) {
				x = o.x + o.w - w;
			}
			if ( h.includes( 'n' ) ) {
				y = o.y + o.h - hh;
			}
		}

		// Alt: resize about center.
		if ( draft.alt ) {
			x = cx - w / 2;
			y = cy - hh / 2;
		}

		w = Math.max( 2, w );
		hh = Math.max( 2, hh );

		// Keep the (possibly moved) center consistent under rotation.
		const newCenterLocal = { x: x + w / 2, y: y + hh / 2 };
		const newCenter = rotatePoint(
			newCenterLocal.x,
			newCenterLocal.y,
			cx,
			cy,
			o.rot
		);
		x = newCenter.x - w / 2;
		y = newCenter.y - hh / 2;

		const patch = { x, y, w, h: hh };
		// Text: corner resize scales the font size proportionally (spec 05.3).
		if ( 'text' === layer.type && corner && o.fontSize && o.h ) {
			patch.fontSize = Math.max( 4, ( o.fontSize * hh ) / o.h );
			// Rich spans (v1.46) carry their own sizes — scale them along.
			if ( o.spans ) {
				const f = hh / o.h;
				patch.spans = o.spans.map( ( run ) =>
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
		tc.editor.dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	},
	onUp( tc ) {
		if ( tc.draft && 'transform' === tc.draft.kind ) {
			tc.editor.commit(
				'rotate' === tc.draft.mode || 'unit-rotate' === tc.draft.mode
					? __( 'Rotate layer', 'wunderpaint' )
					: 'unit-scale' === tc.draft.mode
					? __( 'Scale layer', 'wunderpaint' )
					: 'lineEnd' === tc.draft.mode
					? __( 'Adjust line', 'wunderpaint' )
					: 'radius' === tc.draft.mode ||
					  'ringRadius' === tc.draft.mode
					? __( 'Round corners', 'wunderpaint' )
					: 'starWaist' === tc.draft.mode
					? __( 'Edit shape', 'wunderpaint' )
					: 'gradAngle' === tc.draft.mode ||
					  'gradStop' === tc.draft.mode
					? __( 'Edit gradient', 'wunderpaint' )
					: 'shadow' === tc.draft.mode
					? __( 'Edit layer style', 'wunderpaint' )
					: 'pivot' === tc.draft.mode
					? __( 'Move pivot', 'wunderpaint' )
					: 'textWidth' === tc.draft.mode ||
					  'textLeading' === tc.draft.mode ||
					  'textTracking' === tc.draft.mode
					? __( 'Edit text spacing', 'wunderpaint' )
					: __( 'Resize layer', 'wunderpaint' )
			);
			tc.setDraft( null );
		}
	},
};

/* --------------------------- Marquee & Lasso ---------------------------- */

const selectionOpFromEvent = ( e ) =>
	e.shiftKey ? 'add' : e.altKey ? 'subtract' : 'replace';

export const marqueeTool = {
	onDown( tc, e, p ) {
		tc.setDraft( {
			kind: 'marquee',
			start: p,
			rect: { x: p.x, y: p.y, w: 0, h: 0 },
			op: selectionOpFromEvent( e ),
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'marquee' !== draft.kind ) {
			return;
		}
		tc.setDraft( {
			...draft,
			rect: {
				x: Math.min( draft.start.x, p.x ),
				y: Math.min( draft.start.y, p.y ),
				w: Math.abs( p.x - draft.start.x ),
				h: Math.abs( p.y - draft.start.y ),
			},
		} );
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( ! draft || 'marquee' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		if ( draft.rect.w < 3 || draft.rect.h < 3 ) {
			if ( 'replace' === draft.op ) {
				tc.editor.dispatch( {
					type: 'SET_SELECTION',
					selection: null,
				} );
			}
			return;
		}
		const next = combine(
			tc.selection,
			{ kind: 'rect', ...draft.rect },
			draft.op
		);
		tc.editor.dispatch( { type: 'SET_SELECTION', selection: next } );
		tc.editor.commit( __( 'Marquee selection', 'wunderpaint' ) );
	},
};

export const lassoTool = {
	onDown( tc, e, p ) {
		tc.setDraft( {
			kind: 'lasso',
			points: [ p ],
			op: selectionOpFromEvent( e ),
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'lasso' !== draft.kind ) {
			return;
		}
		const last = draft.points[ draft.points.length - 1 ];
		if ( Math.hypot( p.x - last.x, p.y - last.y ) >= 2 / tc.zoom ) {
			tc.setDraft( { ...draft, points: [ ...draft.points, p ] } );
		}
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( ! draft || 'lasso' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		if ( draft.points.length < 3 ) {
			return;
		}
		const next = combine(
			tc.selection,
			{ kind: 'poly', points: draft.points },
			draft.op
		);
		tc.editor.dispatch( { type: 'SET_SELECTION', selection: next } );
		tc.editor.commit( __( 'Lasso selection', 'wunderpaint' ) );
	},
};

/* --------------------------------- Crop --------------------------------- */

const RATIOS = {
	'1:1': 1,
	'4:3': 4 / 3,
	'16:9': 16 / 9,
	'9:16': 9 / 16,
	'3:2': 3 / 2,
};

/** Resolve a ratio option (plain or `social:<id>`) to a number or null. */
export function cropRatioValue( option ) {
	if ( RATIOS[ option ] ) {
		return RATIOS[ option ];
	}
	if ( String( option ).startsWith( 'social:' ) ) {
		const preset = socialCropById( option.slice( 7 ) );
		if ( preset ) {
			const [ rw, rh ] = preset.ratio.split( ':' ).map( Number );
			return rw / rh;
		}
	}
	return null;
}

/* ------------------------------ Magic Wand ------------------------------ */

export const wandTool = {
	async onDown( tc, e, p ) {
		const { doc, layers } = tc.editor.state;
		const opts = tc.opts;
		const composite = await renderToCanvas( doc, layers, {
			cache: sharedImageCache,
		} );
		const ctx = composite.getContext( '2d' );
		const img = ctx.getImageData( 0, 0, doc.w, doc.h );
		const { mask, bounds } = wandMask(
			{ data: img.data, width: doc.w, height: doc.h },
			p.x,
			p.y,
			opts.tolerance ?? 32,
			opts.contiguous ?? true
		);
		if ( ! bounds ) {
			tc.editor.dispatch( { type: 'SET_SELECTION', selection: null } );
			return;
		}
		const maskCanvas = createCanvas( doc.w, doc.h );
		const mctx = maskCanvas.getContext( '2d' );
		const out = mctx.createImageData( doc.w, doc.h );
		for ( let i = 0; i < mask.length; i++ ) {
			out.data[ i * 4 ] = 255;
			out.data[ i * 4 + 1 ] = 255;
			out.data[ i * 4 + 2 ] = 255;
			out.data[ i * 4 + 3 ] = mask[ i ];
		}
		mctx.putImageData( out, 0, 0 );
		tc.editor.dispatch( {
			type: 'SET_SELECTION',
			selection: { kind: 'mask', canvas: maskCanvas, bounds },
		} );
		tc.editor.commit( __( 'Magic Wand', 'wunderpaint' ) );
	},
};

/* --------------------------- Smart Select (AI) -------------------------- */

// A doc-sized, softly-feathered mask selection from a SlimSAM binary mask
// (its hard 0/1 edge would otherwise be blocky).
function smartMaskToSelection( mask ) {
	const { data, w, h } = mask;
	let minX = w;
	let minY = h;
	let maxX = -1;
	let maxY = -1;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( data[ y * w + x ] ) {
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
	if ( maxX < 0 ) {
		return null;
	}
	const bin = createCanvas( w, h );
	const bctx = bin.getContext( '2d' );
	const im = bctx.createImageData( w, h );
	for ( let i = 0; i < w * h; i++ ) {
		const j = i * 4;
		im.data[ j ] = 255;
		im.data[ j + 1 ] = 255;
		im.data[ j + 2 ] = 255;
		im.data[ j + 3 ] = data[ i ] ? 255 : 0;
	}
	bctx.putImageData( im, 0, 0 );

	const maskCanvas = createCanvas( w, h );
	const mctx = maskCanvas.getContext( '2d' );
	mctx.filter = 'blur(1.5px)';
	mctx.drawImage( bin, 0, 0 );

	return {
		kind: 'mask',
		canvas: maskCanvas,
		bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
		source: 'smart',
	};
}

// Session state so extra clicks REFINE the same mask (encode once, decode
// per click) instead of re-segmenting from scratch. Reset when there is no
// smart selection to continue (e.g. after Escape clears it). The encoder
// remembers the exact doc/layers it was rendered from (v1.127.1), so a new
// selection on an unchanged document skips the expensive re-encode.
let smartSeg = null;
let smartPoints = [];
let smartSegLayers = null;
let smartSegDoc = null;

export const smartSelectTool = {
	async onDown( tc, e, p ) {
		const toasts = tc.extras?.toasts;
		if ( ! isModelInstalled( 'smart-select' ) ) {
			toasts?.error(
				__(
					'Smart Select needs its model. Download it under Settings → WunderPaint → AI Models.',
					'wunderpaint'
				),
				{
					linkText: __( 'Settings', 'wunderpaint' ),
					linkHref: tc.editor.WPIE?.settingsUrl,
				}
			);
			return;
		}
		const { doc, layers, selection } = tc.editor.state;
		// Alt/Option-click = negative point (subtract from the mask).
		const point = {
			x: p.x / doc.w,
			y: p.y / doc.h,
			label: e.altKey ? 0 : 1,
		};
		// Keep refining the SAME mask (every click ADDS a point) while our
		// selection is live and the document is unchanged. v1.125.1 guessed
		// "new object" from a distance heuristic and silently DROPPED the
		// collected points - selecting a laptop and then clicking the head
		// lost the laptop (v1.127.1). New object is explicit now: Esc, the
		// refine card's New selection button, or applying the cutout.
		const sameDoc = smartSegLayers === layers && smartSegDoc === doc;
		const refining = !! (
			smartSeg &&
			sameDoc &&
			selection &&
			'smart' === selection.source
		);
		const fresh = ! refining;
		const needsEncode = ! smartSeg || ! sameDoc;
		const id = toasts?.toast(
			needsEncode
				? __( 'Smart Select: analyzing…', 'wunderpaint' )
				: __( 'Refining…', 'wunderpaint' ),
			{ duration: 0 }
		);
		try {
			if ( fresh ) {
				smartPoints = [];
				if ( needsEncode ) {
					const composite = await renderToCanvas( doc, layers, {
						cache: sharedImageCache,
					} );
					smartSeg = await createSegmenter( composite.toDataURL() );
					smartSegLayers = layers;
					smartSegDoc = doc;
				}
			}
			smartPoints.push( point );
			const mask = await smartSeg.segment( smartPoints );
			if ( id ) {
				toasts?.remove( id );
			}
			const sel = smartMaskToSelection( mask );
			if ( sel ) {
				// Doc-coord copies of the clicked points for the on-canvas dots.
				sel.points = smartPoints.map( ( q ) => ( {
					x: q.x * doc.w,
					y: q.y * doc.h,
					label: q.label,
				} ) );
			}
			tc.editor.dispatch( { type: 'SET_SELECTION', selection: sel } );
			if ( sel ) {
				tc.editor.commit( __( 'Smart Select', 'wunderpaint' ) );
			} else if ( fresh ) {
				toasts?.toast(
					__(
						'No object found there, try another spot.',
						'wunderpaint'
					)
				);
			}
		} catch ( err ) {
			smartSeg = null;
			smartPoints = [];
			smartSegLayers = null;
			smartSegDoc = null;
			if ( id ) {
				toasts?.remove( id );
			}
			toasts?.error(
				__( 'Smart Select failed.', 'wunderpaint' ) +
					' ' +
					( err?.message || '' )
			);
		}
	},
};

export const cropTool = {
	onDown( tc, e, p ) {
		tc.setDraft( { kind: 'crop', start: p } );
		tc.editor.dispatch( {
			type: 'SET_CROP',
			crop: { x: p.x, y: p.y, w: 0, h: 0 },
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'crop' !== draft.kind ) {
			return;
		}
		let w = Math.abs( p.x - draft.start.x );
		let h = Math.abs( p.y - draft.start.y );
		const ratio = cropRatioValue( tc.opts.ratio );
		if ( ratio ) {
			if ( w / Math.max( 1, h ) > ratio ) {
				h = w / ratio;
			} else {
				w = h * ratio;
			}
		}
		const x = p.x < draft.start.x ? draft.start.x - w : draft.start.x;
		const y = p.y < draft.start.y ? draft.start.y - h : draft.start.y;
		tc.editor.dispatch( { type: 'SET_CROP', crop: { x, y, w, h } } );
	},
	onUp( tc ) {
		if ( tc.draft && 'crop' === tc.draft.kind ) {
			tc.setDraft( null );
			const crop = tc.editor.state.crop;
			if ( crop && ( crop.w < 4 || crop.h < 4 ) ) {
				tc.editor.dispatch( { type: 'SET_CROP', crop: null } );
			}
		}
	},
	onDblClick( tc ) {
		applyCrop( tc.editor );
	},
};

/** Apply the pending crop (spec 05.4 Crop): resize doc + offset layers. */
export function applyCrop( editor ) {
	const crop = editor.state.crop;
	if ( ! crop || crop.w < 1 || crop.h < 1 ) {
		return false;
	}
	return cropDoc( editor, crop );
}

/** When the mask chip is selected, paint tools target the mask canvas. */
function maskPaintTarget( tc ) {
	const state = tc.editor.state;
	if ( ! state.maskEditId || state.maskEditId !== state.activeId ) {
		return null;
	}
	const layer = tc.layers.find( ( l ) => l.id === state.activeId );
	return layer?.mask?.canvas ? layer : null;
}

/**
 * Begin a mask stroke (v1.12): snapshot the mask so every pointer move can
 * rebuild snapshot + WHOLE path in one pass, per-segment stamping left
 * seams/residue at joints and soft edges (erase+re-add never reached 0).
 */
function maskStrokeStart( tc, layer, p, color ) {
	const src = layer.mask.canvas;
	const base = createCanvas( src.width, src.height );
	base.getContext( '2d' ).drawImage( src, 0, 0 );
	const d = `M ${ p.x } ${ p.y } L ${ p.x } ${ p.y }`;
	tc.setDraft( {
		kind: 'maskpaint',
		layerId: layer.id,
		lastPt: p,
		color,
		d,
		base,
	} );
	maskStrokeApply( tc, layer, d, color );
}

/** Apply the full stroke path (+ symmetry twins) onto the mask, once. */
function maskStrokeApply( tc, layer, d, color ) {
	const opts = tc.opts;
	// Twins join the SAME path so the erase pass can't eat fresh paint
	// where mirrored strokes cross.
	const full =
		opts.mirror && 'off' !== opts.mirror
			? [ d, ...mirrorPathD( d, tc.doc.w, tc.doc.h, opts.mirror ) ].join(
					' '
			  )
			: d;
	// Photoshop semantics (v1.11.2): luminance → alpha (black hides).
	paintOnMask(
		layer.mask.canvas,
		{
			d: full,
			color,
			size: opts.size || 24,
			opacity: ( opts.opacity ?? 100 ) / 100,
		},
		{ hardness: opts.hardness ?? 100, flow: opts.flow ?? 100 }
	);
	tc.requestRender();
}

/** Extend the current mask stroke to point p (rebuild from the snapshot). */
function maskStrokeMove( tc, p ) {
	const draft = tc.draft;
	const layer = tc.layers.find( ( l ) => l.id === draft.layerId );
	if (
		! layer?.mask?.canvas ||
		Math.hypot( p.x - draft.lastPt.x, p.y - draft.lastPt.y ) < 1.5 / tc.zoom
	) {
		return;
	}
	const d = draft.d + ` L ${ p.x } ${ p.y }`;
	const ctx = layer.mask.canvas.getContext( '2d' );
	ctx.clearRect( 0, 0, layer.mask.canvas.width, layer.mask.canvas.height );
	ctx.drawImage( draft.base, 0, 0 );
	maskStrokeApply( tc, layer, d, draft.color );
	tc.setDraft( { ...draft, d, lastPt: p } );
}

/* ---------------------------- Brush / Pencil ---------------------------- */

function makePaintTool( toolId ) {
	return {
		onDown( tc, e, p ) {
			// Pen pressure scales the stroke (F16).
			tc.pressure =
				e.pressure > 0 && e.pressure < 1 ? 0.35 + e.pressure * 0.65 : 1;
			const maskLayer = maskPaintTarget( tc );
			if ( maskLayer ) {
				maskStrokeStart( tc, maskLayer, p, tc.fg );
				return;
			}
			const opts = tc.opts;
			const isPencil = 'pencil' === toolId;
			const layer = makeStroke( {
				name:
					'pencil' === toolId
						? __( 'Pencil stroke', 'wunderpaint' )
						: __( 'Brush stroke', 'wunderpaint' ),
				x: 0,
				y: 0,
				w: tc.doc.w,
				h: tc.doc.h,
				paths: [
					{
						d: `M ${ p.x } ${ p.y } L ${ p.x } ${ p.y }`,
						color: tc.fg,
						size: opts.size || ( isPencil ? 2 : 24 ),
						// Photoshop semantics (v1.129.0): opacity caps the
						// whole stroke, flow is the per-stamp build-up rate
						// (self-overlaps darken). The pencil has neither.
						opacity: ( opts.opacity ?? 100 ) / 100,
						flow: isPencil ? 1 : ( opts.flow ?? 100 ) / 100,
						tip: isPencil ? 'round' : opts.tip || 'round',
						pts: [ p ],
					},
				],
			} );
			layer.x0 = 0;
			layer.y0 = 0;
			layer.hardness = isPencil ? 100 : opts.hardness ?? 85;
			tc.setDraft( {
				kind: 'paint',
				layer,
				lastPt: p,
				smooth: ! isPencil,
				pts: [ p ],
				bounds: { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y },
			} );
		},
		onMove( tc, e, p ) {
			tc.pressure =
				e.pressure > 0 && e.pressure < 1 ? 0.35 + e.pressure * 0.65 : 1;
			const draft = tc.draft;
			if ( draft && 'maskpaint' === draft.kind ) {
				maskStrokeMove( tc, p );
				return;
			}
			if ( ! draft || 'paint' !== draft.kind ) {
				return;
			}
			const prev = draft.lastPt;
			if ( Math.hypot( p.x - prev.x, p.y - prev.y ) < 2 / tc.zoom ) {
				return;
			}
			const path = { ...draft.layer.paths[ 0 ] };
			const pts = [ ...( draft.pts || [] ), p ];
			if ( draft.smooth ) {
				const mid = {
					x: ( prev.x + p.x ) / 2,
					y: ( prev.y + p.y ) / 2,
				};
				path.d += ` Q ${ prev.x } ${ prev.y } ${ mid.x } ${ mid.y }`;
			} else {
				path.d += ` L ${ p.x } ${ p.y }`;
			}
			path.pts = pts;
			// Symmetry painting (v0.7): mirrored twins grow with the stroke —
			// path + points both mirrored so every tip works (v1.23).
			const twins = mirrorStrokeTwins(
				path,
				tc.doc.w,
				tc.doc.h,
				tc.opts.mirror
			);
			const bounds = {
				minX: Math.min( draft.bounds.minX, p.x ),
				minY: Math.min( draft.bounds.minY, p.y ),
				maxX: Math.max( draft.bounds.maxX, p.x ),
				maxY: Math.max( draft.bounds.maxY, p.y ),
			};
			tc.setDraft( {
				...draft,
				layer: { ...draft.layer, paths: [ path, ...twins ] },
				lastPt: p,
				pts,
				bounds,
			} );
		},
		onUp( tc ) {
			const draft = tc.draft;
			if ( draft && 'maskpaint' === draft.kind ) {
				tc.setDraft( null );
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: draft.layerId,
					patch: {},
				} );
				tc.editor.commit( __( 'Edit mask', 'wunderpaint' ) );
				return;
			}
			if ( ! draft || 'paint' !== draft.kind ) {
				return;
			}
			tc.setDraft( null );
			const p0 = draft.layer.paths[ 0 ];
			// Stamped tips (calligraphy/spray) reach past size/2, pad more.
			const pad = isStampTip( p0.tip )
				? ( p0.size || 1 ) * 0.8 + 2
				: ( p0.size || 1 ) / 2 + 2;
			// Symmetry twins live outside the pointer-path bounds, union
			// their mirrored extents or they get cropped away on commit
			// (v1.12 fix).
			const mirror = tc.opts.mirror;
			let { minX, minY, maxX, maxY } = draft.bounds;
			if ( mirror && 'off' !== mirror ) {
				if ( 'x' === mirror || 'xy' === mirror ) {
					const fx1 = tc.doc.w - draft.bounds.maxX;
					const fx2 = tc.doc.w - draft.bounds.minX;
					minX = Math.min( minX, fx1 );
					maxX = Math.max( maxX, fx2 );
				}
				if ( 'y' === mirror || 'xy' === mirror ) {
					const fy1 = tc.doc.h - draft.bounds.maxY;
					const fy2 = tc.doc.h - draft.bounds.minY;
					minY = Math.min( minY, fy1 );
					maxY = Math.max( maxY, fy2 );
				}
			}
			let layer = {
				...draft.layer,
				x: minX - pad,
				y: minY - pad,
				w: maxX - minX + 2 * pad,
				h: maxY - minY + 2 * pad,
			};
			layer.x0 = layer.x;
			layer.y0 = layer.y;
			// Selection clips painting (spec 05.4): bake as a layer mask.
			layer = maskFromSelection( tc, layer );
			tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
			tc.editor.commit(
				'pencil' === toolId
					? __( 'Pencil', 'wunderpaint' )
					: __( 'Brush stroke', 'wunderpaint' )
			);
		},
	};
}

export const brushTool = makePaintTool( 'brush' );
export const pencilTool = makePaintTool( 'pencil' );

/* -------------------------------- Eraser -------------------------------- */

export const eraserTool = {
	onDown( tc, e, p ) {
		tc.pressure =
			e.pressure > 0 && e.pressure < 1 ? 0.35 + e.pressure * 0.65 : 1;
		const maskLayer = maskPaintTarget( tc );
		if ( maskLayer ) {
			maskStrokeStart( tc, maskLayer, p, '#000000' );
			return;
		}
		let target = activeLayer( tc );
		if ( target && [ 'image', 'raster' ].includes( target.type ) ) {
			hintIfInvisible( tc, target );
			target = ensureRaster( tc, target );
			if ( ! target ) {
				tc.extras.toasts.error(
					__(
						'The image is still loading, try again in a moment.',
						'wunderpaint'
					)
				);
				return;
			}
			const mask = tc.selection
				? layerLocalMask( tc.selection, tc.doc, target )
				: null;
			tc.setDraft( {
				kind: 'erase',
				layerId: target.id,
				lastPt: p,
				mask,
				pathStart: `M ${ p.x } ${ p.y } L ${ p.x } ${ p.y }`,
			} );
			this.stamp(
				tc,
				target,
				`M ${ p.x } ${ p.y } L ${ p.x } ${ p.y }`,
				mask
			);
			return;
		}
		// No raster active → spec 05.4: no-op with a hint.
		tc.extras.toasts.toast(
			__(
				'The eraser needs a pixel layer, select an image/raster layer (shapes and text are edited via their properties).',
				'wunderpaint'
			)
		);
	},
	stamp( tc, layer, d, mask ) {
		const opts = tc.opts;
		const variants =
			opts.mirror && 'off' !== opts.mirror
				? [ d, ...mirrorPathD( d, tc.doc.w, tc.doc.h, opts.mirror ) ]
				: [ d ];
		for ( const dv of variants ) {
			paintStroke(
				layer,
				{
					d: dv,
					color: '#000',
					size: ( opts.size || 32 ) * ( tc.pressure || 1 ),
					opacity: ( opts.opacity ?? 100 ) / 100,
				},
				{
					erase: true,
					hardness: opts.hardness ?? 100,
					flow: opts.flow ?? 100,
					mask,
				}
			);
		}
		tc.requestRender();
	},
	onMove( tc, e, p ) {
		tc.pressure =
			e.pressure > 0 && e.pressure < 1 ? 0.35 + e.pressure * 0.65 : 1;
		const draft = tc.draft;
		if ( draft && 'maskpaint' === draft.kind ) {
			maskStrokeMove( tc, p );
			return;
		}
		if ( ! draft || 'erase' !== draft.kind ) {
			return;
		}
		const layer = tc.layers.find( ( l ) => l.id === draft.layerId );
		if ( ! layer || ! layer.canvas ) {
			return;
		}
		const prev = draft.lastPt;
		if ( Math.hypot( p.x - prev.x, p.y - prev.y ) < 1.5 / tc.zoom ) {
			return;
		}
		this.stamp(
			tc,
			layer,
			`M ${ prev.x } ${ prev.y } L ${ p.x } ${ p.y }`,
			draft.mask
		);
		tc.setDraft( { ...draft, lastPt: p } );
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( draft && 'maskpaint' === draft.kind ) {
			tc.setDraft( null );
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: draft.layerId,
				patch: {},
			} );
			tc.editor.commit( __( 'Edit mask', 'wunderpaint' ) );
			return;
		}
		if ( draft && 'erase' === draft.kind ) {
			tc.setDraft( null );
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: draft.layerId,
				patch: {},
			} ); // poke for re-render
			tc.editor.commit( __( 'Erase', 'wunderpaint' ) );
		}
	},
};

/* ------------------------------ Paint Bucket ---------------------------- */

/**
 * Gentle heads-up for actions with no visible effect (v1.365.0),
 * throttled so a paint gesture does not stack toasts. The action itself
 * still runs where applicable - this only says WHY nothing seems to
 * happen.
 */
let lastNoopHint = 0;
function noopHint( tc, msg ) {
	const now = Date.now();
	if ( now - lastNoopHint < 3000 ) {
		return;
	}
	lastNoopHint = now;
	tc.extras?.toasts?.toast?.( msg );
}

/** Hint when the tool's target layer is not visible on the canvas. */
function hintIfInvisible( tc, layer ) {
	if (
		layer &&
		( false === layer.visible || ancestorHidden( tc.layers, layer ) )
	) {
		noopHint(
			tc,
			__( 'This edit lands on a hidden layer.', 'wunderpaint' )
		);
	}
}

export const bucketTool = {
	onDown( tc, e, p ) {
		// Always the foreground color (v1.128.2): the options bar shows a
		// direct color field now instead of the old fg/bg toggle.
		const color = tc.fg;
		// Selection gating: clicks outside an active selection do nothing -
		// but SAY so, silence reads as "broken" (v1.365.0).
		if ( tc.selection && ! pointInSelection( tc.selection, p.x, p.y ) ) {
			noopHint(
				tc,
				__(
					'That click was outside the active selection.',
					'wunderpaint'
				)
			);
			return;
		}
		// Pixel-accurate (v1.127.0): recolor the shape you SEE, not the top
		// bounding box - crucial for recoloring vectorized artwork.
		const hit = topLayerAt( tc.layers, p.x, p.y, {
			pixel: true,
			cache: tc.imageCache,
		} );

		if ( hit && 'shape' === hit.type ) {
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: hit.id,
				patch: { fill: color },
			} );
			tc.editor.commit( __( 'Recolor shape', 'wunderpaint' ) );
			return;
		}
		if ( hit && 'text' === hit.type ) {
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: hit.id,
				patch: { color },
			} );
			tc.editor.commit( __( 'Recolor text', 'wunderpaint' ) );
			return;
		}
		if ( hit && [ 'image', 'raster', 'stroke' ].includes( hit.type ) ) {
			let target = hit;
			if ( 'stroke' === hit.type ) {
				// Flood-filling a vector stroke recolors its paths.
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: hit.id,
					patch: {
						paths: hit.paths.map( ( path ) => ( {
							...path,
							color,
						} ) ),
					},
				} );
				tc.editor.commit( __( 'Recolor stroke', 'wunderpaint' ) );
				return;
			}
			target = ensureRaster( tc, target );
			if ( ! target ) {
				return;
			}
			const mask = tc.selection
				? layerLocalMask( tc.selection, tc.doc, target )
				: null;
			const filled = floodFill(
				target.canvas,
				p.x - target.x,
				p.y - target.y,
				color,
				{
					tolerance: tc.opts.tolerance ?? 32,
					contiguous: tc.opts.contiguous !== false,
					opacity: ( tc.opts.opacity ?? 100 ) / 100,
					mask,
				}
			);
			if ( filled ) {
				tc.editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: target.id,
					patch: {},
				} );
				tc.editor.commit( __( 'Flood fill', 'wunderpaint' ) );
				tc.requestRender();
			}
			return;
		}

		// Miss → full-canvas fill layer at the bottom (or selection-only).
		let layer = makeShape( {
			name: __( 'Fill', 'wunderpaint' ),
			x: 0,
			y: 0,
			w: tc.doc.w,
			h: tc.doc.h,
			shape: 'rect',
			fill: color,
		} );
		layer.opacity = ( tc.opts.opacity ?? 100 ) / 100;
		layer = maskFromSelection( tc, layer );
		tc.editor.dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
		tc.editor.commit( __( 'Fill', 'wunderpaint' ) );
	},
	onMove() {},
	onUp() {},
};

/* -------------------------------- Gradient ------------------------------ */

export const gradientTool = {
	onDown( tc, e, p ) {
		tc.setDraft( { kind: 'gradient', from: p, to: p } );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'gradient' !== draft.kind ) {
			return;
		}
		let to = p;
		if ( e.shiftKey ) {
			// Constrain to 45° increments.
			const angle = Math.atan2( p.y - draft.from.y, p.x - draft.from.x );
			const step = Math.PI / 4;
			const snapped = Math.round( angle / step ) * step;
			const len = Math.hypot( p.x - draft.from.x, p.y - draft.from.y );
			to = {
				x: draft.from.x + Math.cos( snapped ) * len,
				y: draft.from.y + Math.sin( snapped ) * len,
			};
		}
		tc.setDraft( { ...draft, to } );
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( ! draft || 'gradient' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		if (
			Math.hypot( draft.to.x - draft.from.x, draft.to.y - draft.from.y ) <
			4 / tc.zoom
		) {
			return;
		}
		let stops = ( tc.opts.stops || [] ).map( ( s ) => ( { ...s } ) );
		if ( ! stops.length ) {
			stops = [
				{ color: tc.fg, at: 0 },
				{ color: 'rgba(0,0,0,0)', at: 1 },
			];
		}
		if ( tc.opts.reverse ) {
			stops = stops
				.map( ( s ) => ( { ...s, at: 1 - s.at } ) )
				.sort( ( a, b ) => a.at - b.at );
		}

		const active = activeLayer( tc );
		if ( active && 'gradient' === active.type ) {
			// Update the active gradient layer's direction (spec 05.4).
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: active.id,
				patch: {
					kind: tc.opts.kind || 'linear',
					from: draft.from,
					to: draft.to,
					stops,
				},
			} );
			tc.editor.commit( __( 'Edit gradient', 'wunderpaint' ) );
			return;
		}

		let layer = makeGradient( {
			name: __( 'Gradient', 'wunderpaint' ),
			x: 0,
			y: 0,
			w: tc.doc.w,
			h: tc.doc.h,
			kind: tc.opts.kind || 'linear',
			from: draft.from,
			to: draft.to,
			stops,
		} );
		layer = maskFromSelection( tc, layer );
		tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
		tc.editor.commit( __( 'Gradient', 'wunderpaint' ) );
	},
};

/* ---------------------------------- Text -------------------------------- */

/**
 * The layer-local path data a text layer can flow along, or null. Covers
 * BOTH pen results: "Fill Path" shapes (pathD is already layer-local)
 * and "Stroke Path" layers (paths store their draw-time document
 * coordinates and x/y0 the original origin, so draw-coords minus x0/y0
 * are layer-local regardless of later moves).
 *
 * @param {Object} layer Candidate layer.
 * @return {?string} Layer-local path data.
 */
export function pathTextSource( layer ) {
	if ( ! layer || false === layer.visible ) {
		return null;
	}
	if ( 'shape' === layer.type && layer.pathD && ! layer.quad ) {
		return layer.pathD;
	}
	if ( 'stroke' === layer.type && layer.paths?.[ 0 ]?.d ) {
		return rebasePathD(
			layer.paths[ 0 ].d,
			-( layer.x0 ?? layer.x ),
			-( layer.y0 ?? layer.y )
		);
	}
	return null;
}

/**
 * Topmost visible layer whose drawn path runs under the pointer
 * (v1.156.0). The point is transformed into layer-local coordinates
 * incl. rotation.
 *
 * @param {Object} tc Tool context.
 * @param {Object} p  Pointer position in document coordinates.
 * @return {?Object} { layer, d } of the hit path layer.
 */
function pathLayerUnderPoint( tc, p ) {
	const layers = tc.editor.state.layers;
	const tol = 8 / Math.max( 0.05, tc.zoom || 1 );
	for ( let i = layers.length - 1; i >= 0; i-- ) {
		const l = layers[ i ];
		const d = pathTextSource( l );
		if ( ! d ) {
			continue;
		}
		let px = p.x - l.x;
		let py = p.y - l.y;
		if ( l.rot ) {
			const a = ( -l.rot * Math.PI ) / 180;
			const dx = px - l.w / 2;
			const dy = py - l.h / 2;
			px = l.w / 2 + dx * Math.cos( a ) - dy * Math.sin( a );
			py = l.h / 2 + dx * Math.sin( a ) + dy * Math.cos( a );
		}
		try {
			const subs = parsePathAnchors( d );
			if ( nearestOnPath( subs, { x: px, y: py }, tol ) ) {
				return { layer: l, d };
			}
		} catch ( err ) {
			// Unparseable path data: not a candidate.
		}
	}
	return null;
}

/**
 * Group the source shape/path with the text just bound to it, so the pair
 * moves as one unit (v1.211.0). Mirrors newGroupOp: create the group, then
 * reparent the source (bottom) and the text (top) into it. The dispatches
 * queue in order, so the reducer sees the group before the reparents. With
 * `hideSrc` the source is hidden first - text on path uses the path only as a
 * guide. The caller commits.
 *
 * @param {Object}  tc      Tool context.
 * @param {Object}  src     Source shape/path layer.
 * @param {string}  textId  The new text layer id.
 * @param {string}  name    Group name.
 * @param {boolean} hideSrc Hide the source (path guide) after grouping.
 */
function groupSourceWithText( tc, src, textId, name, hideSrc ) {
	if ( hideSrc ) {
		tc.editor.dispatch( {
			type: 'UPDATE_LAYER',
			id: src.id,
			patch: { visible: false },
		} );
	}
	const group = makeGroup( { name } );
	tc.editor.dispatch( { type: 'ADD_LAYER', layer: group } );
	for ( const id of [ src.id, textId ] ) {
		tc.editor.dispatch( {
			type: 'REORDER',
			id,
			toIndex: tc.editor.state.layers.length,
			parent: group.id,
		} );
	}
}

/**
 * Bind a new text layer to a drawn path and start typing. The path is
 * COPIED onto the text layer (self-contained, survives deleting the
 * source layer); direction/start live in Properties. Shared by the
 * text-tool click and the "Text on Path" context-menu entry.
 *
 * @param {Object} tc  Tool context.
 * @param {Object} src Source layer (pen shape or stroke).
 * @return {boolean} Whether a text layer was created.
 */
export function insertPathText( tc, src ) {
	const d = pathTextSource( src );
	if ( ! d ) {
		return false;
	}
	const opts = tc.opts || {};
	const layer = makeText( {
		text: '',
		x: src.x,
		y: src.y,
		w: src.w,
		h: src.h,
		fontSize: opts.fontSize || 48,
		fontFamily: opts.fontFamily || 'Inter',
		weight: opts.weight || 700,
		color: tc.fg,
		align: opts.align || 'left',
		letterSpacing: opts.letterSpacing || 0,
		lineHeight: opts.lineHeight || 1.05,
		italic: !! opts.italic,
		fixedWidth: true,
	} );
	layer.rot = src.rot || 0;
	layer.textPath = { d, start: 0, flip: false };
	layer.name = __( 'Path Text', 'wunderpaint' );
	tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
	// Hide the guide path and keep it grouped with the text (v1.211.0).
	groupSourceWithText(
		tc,
		src,
		layer.id,
		__( 'Path Text', 'wunderpaint' ),
		true
	);
	tc.editor.commit( __( 'Add Text', 'wunderpaint' ) );
	tc.editor.dispatch( { type: 'SET_TOOL', tool: 'move' } );
	tc.beginTextEdit( layer.id );
	return true;
}

/**
 * Layer-local outline a text layer can flow INSIDE (area text), or null.
 * Any fillable shape qualifies: parametric shapes are expanded to a path,
 * path shapes use their own pathD. A `line` (no area) and quad-warped
 * shapes are excluded.
 *
 * @param {Object} layer Candidate layer.
 * @return {?string} Layer-local path data for the fill outline.
 */
export function shapeTextSource( layer ) {
	if ( ! layer || false === layer.visible ) {
		return null;
	}
	if ( 'shape' !== layer.type || layer.quad || 'line' === layer.shape ) {
		return null;
	}
	return shapeToPathD( layer );
}

/**
 * Bind a new text layer to flow inside a shape and start typing. The shape's
 * outline is COPIED onto the text layer (self-contained), so the text keeps
 * its silhouette even if the source shape is deleted. Shared by the text-tool
 * click and the "Text in Shape" context-menu entry.
 *
 * @param {Object} tc  Tool context.
 * @param {Object} src Source shape layer.
 * @return {boolean} Whether a text layer was created.
 */
export function insertShapeText( tc, src ) {
	const d = shapeTextSource( src );
	if ( ! d ) {
		return false;
	}
	const opts = tc.opts || {};
	// Default to a colour that reads on the shape's fill (a dark fill gets
	// white text, a light fill gets ink) so it is never born invisible on its
	// own background (v1.211.0). A gradient/undefined fill falls back to ink.
	const fillColor = 'string' === typeof src.fill ? src.fill : '#ffffff';
	const readable = colorLuminance( fillColor ) < 0.55 ? '#ffffff' : '#141821';
	const layer = makeText( {
		text: '',
		x: src.x,
		y: src.y,
		w: src.w,
		h: src.h,
		fontSize: opts.fontSize || 48,
		fontFamily: opts.fontFamily || 'Inter',
		weight: opts.weight || 700,
		color: readable,
		align: 'center',
		letterSpacing: opts.letterSpacing || 0,
		lineHeight: opts.lineHeight || 1.15,
		italic: !! opts.italic,
		fixedWidth: true,
	} );
	layer.rot = src.rot || 0;
	layer.shapeBox = { d };
	layer.name = __( 'Shape Text', 'wunderpaint' );
	tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
	// Keep the shape and its text as one movable unit (v1.211.0).
	groupSourceWithText(
		tc,
		src,
		layer.id,
		__( 'Shape Text', 'wunderpaint' ),
		false
	);
	tc.editor.commit( __( 'Add Text', 'wunderpaint' ) );
	tc.editor.dispatch( { type: 'SET_TOOL', tool: 'move' } );
	tc.beginTextEdit( layer.id );
	return true;
}

/**
 * The fillable shape whose ink sits under the pointer (pixel-accurate, so a
 * click in a transparent corner of an ellipse's box falls through). Used by
 * the text tool to drop area text into the shape you clicked.
 *
 * @param {Object} tc Tool context.
 * @param {Object} p  Pointer in doc coordinates.
 * @return {?Object} The shape layer, or null.
 */
function shapeUnderPoint( tc, p ) {
	const hit = topLayerAt( tc.layers, p.x, p.y, {
		pixel: true,
		cache: tc.imageCache,
	} );
	if ( hit && shapeTextSource( hit ) ) {
		return hit;
	}
	return null;
}

export const textTool = {
	onDown( tc, e, p ) {
		// Clicking near a drawn outline binds text ALONG it (text on path);
		// clicking inside a shape's fill flows text INSIDE it (area text).
		const hit = pathLayerUnderPoint( tc, p );
		if ( hit && insertPathText( tc, hit.layer ) ) {
			return;
		}
		const shp = shapeUnderPoint( tc, p );
		if ( shp && insertShapeText( tc, shp ) ) {
			return;
		}
		tc.setDraft( { kind: 'textbox', start: p, rect: null } );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'textbox' !== draft.kind ) {
			return;
		}
		if (
			Math.hypot( p.x - draft.start.x, p.y - draft.start.y ) >
			6 / tc.zoom
		) {
			tc.setDraft( {
				...draft,
				rect: {
					x: Math.min( draft.start.x, p.x ),
					y: Math.min( draft.start.y, p.y ),
					w: Math.abs( p.x - draft.start.x ),
					h: Math.abs( p.y - draft.start.y ),
				},
			} );
		}
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( ! draft || 'textbox' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		const opts = tc.opts;
		const fontSize = opts.fontSize || 48;
		const layer = makeText( {
			text: '',
			x: draft.rect ? draft.rect.x : draft.start.x,
			y: draft.rect ? draft.rect.y : draft.start.y,
			w: draft.rect ? draft.rect.w : Math.max( 200, fontSize * 6 ),
			h: draft.rect ? draft.rect.h : fontSize * 1.3,
			fontSize,
			fontFamily: opts.fontFamily || 'Inter',
			weight: opts.weight || 700,
			color: tc.fg,
			align: opts.align || 'center',
			valign: opts.valign || 'middle',
			letterSpacing: opts.letterSpacing || 0,
			lineHeight: opts.lineHeight || 1.05,
			curve: opts.curve || 0,
			italic: !! opts.italic,
			fixedWidth: !! draft.rect,
		} );
		layer.name = __( 'Text', 'wunderpaint' );
		tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
		tc.editor.commit( __( 'Add Text', 'wunderpaint' ) );
		// Switch to Move and edit immediately (spec 05.4 Text).
		tc.editor.dispatch( { type: 'SET_TOOL', tool: 'move' } );
		tc.beginTextEdit( layer.id );
	},
};

/* ---------------------------------- Shape ------------------------------- */

export const shapeTool = {
	onDown( tc, e, p ) {
		const opts = tc.opts;
		const layer = makeShape( {
			name: ( opts.shape || 'rect' ).replace( /^./, ( c ) =>
				c.toUpperCase()
			),
			x: p.x,
			y: p.y,
			w: 1,
			h: 1,
			shape: opts.shape || 'rect',
			fill: tc.fg,
			stroke: opts.stroke || null,
			strokeW: opts.strokeW || 0,
			strokeDash: opts.strokeDash || null,
			radius: opts.radius || 0,
			sides: opts.sides || 6,
			pattern: opts.pattern || 'none',
			patternData: opts.patternData || null,
		} );
		tc.setDraft( { kind: 'shape', layer, start: p } );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'shape' !== draft.kind ) {
			return;
		}
		const rawDx = p.x - draft.start.x;
		const rawDy = p.y - draft.start.y;
		const goingLeft = rawDx < 0;
		const goingUp = rawDy < 0;
		let { w, h } = constrain( rawDx, rawDy, e.shiftKey );
		let x;
		let y;
		if ( e.altKey ) {
			// Draw from center.
			x = draft.start.x - Math.abs( w );
			y = draft.start.y - Math.abs( h );
			w = Math.abs( w ) * 2;
			h = Math.abs( h ) * 2;
		} else {
			x = w < 0 ? draft.start.x + w : draft.start.x;
			y = h < 0 ? draft.start.y + h : draft.start.y;
			w = Math.abs( w );
			h = Math.abs( h );
		}
		const layer = { ...draft.layer, x, y, w, h };
		if ( 'line' === draft.layer.shape ) {
			// The bounding box loses the drag direction, so a line always drew
			// from top-left to bottom-right (endpoint "jumped" when dragging up
			// or left, and horizontal lines were unstable). Remember when the
			// stroke runs along the anti-diagonal instead.
			layer.lineFlip = goingLeft !== goingUp;
		}
		tc.setDraft( { ...draft, layer } );
	},
	onUp( tc ) {
		const draft = tc.draft;
		if ( ! draft || 'shape' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		if ( draft.layer.w < 4 && draft.layer.h < 4 ) {
			return; // discard tiny drafts (spec 05.4).
		}
		tc.editor.dispatch( { type: 'ADD_LAYER', layer: draft.layer } );
		tc.editor.commit( __( 'Add Shape', 'wunderpaint' ) );
	},
};

/* ----------------------------------- Pen -------------------------------- */

/** Build an SVG path from pen anchors (bezier handles when present). */
export function penPathD( anchors, closed ) {
	if ( ! anchors.length ) {
		return '';
	}
	let d = `M ${ anchors[ 0 ].x } ${ anchors[ 0 ].y }`;
	for ( let i = 1; i < anchors.length; i++ ) {
		const prev = anchors[ i - 1 ];
		const cur = anchors[ i ];
		if ( prev.hOut || cur.hIn ) {
			const c1 = prev.hOut || { x: prev.x, y: prev.y };
			const c2 = cur.hIn || { x: cur.x, y: cur.y };
			d += ` C ${ c1.x } ${ c1.y } ${ c2.x } ${ c2.y } ${ cur.x } ${ cur.y }`;
		} else {
			d += ` L ${ cur.x } ${ cur.y }`;
		}
	}
	if ( closed && anchors.length > 2 ) {
		const last = anchors[ anchors.length - 1 ];
		const first = anchors[ 0 ];
		if ( last.hOut || first.hIn ) {
			const c1 = last.hOut || { x: last.x, y: last.y };
			const c2 = first.hIn || { x: first.x, y: first.y };
			d += ` C ${ c1.x } ${ c1.y } ${ c2.x } ${ c2.y } ${ first.x } ${ first.y }`;
		}
		d += ' Z';
	}
	return d;
}

export const penTool = {
	onDown( tc, e, p ) {
		const draft =
			tc.draft && 'pen' === tc.draft.kind
				? tc.draft
				: { kind: 'pen', anchors: [], closed: false };
		// Close when clicking near the first anchor.
		if ( draft.anchors.length > 2 ) {
			const first = draft.anchors[ 0 ];
			if ( Math.hypot( p.x - first.x, p.y - first.y ) < 8 / tc.zoom ) {
				tc.setDraft( {
					...draft,
					closed: true,
					finalizing: true,
					at: p,
				} );
				return;
			}
		}
		tc.setDraft( {
			...draft,
			anchors: [
				...draft.anchors,
				{ x: p.x, y: p.y, hIn: null, hOut: null },
			],
			dragging: true,
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if (
			! draft ||
			'pen' !== draft.kind ||
			! draft.dragging ||
			! draft.anchors.length
		) {
			return;
		}
		// Dragging after placing an anchor pulls out symmetric handles.
		const anchors = [ ...draft.anchors ];
		const anchor = { ...anchors[ anchors.length - 1 ] };
		anchor.hOut = { x: p.x, y: p.y };
		anchor.hIn = { x: 2 * anchor.x - p.x, y: 2 * anchor.y - p.y };
		anchors[ anchors.length - 1 ] = anchor;
		tc.setDraft( { ...draft, anchors } );
	},
	onUp( tc ) {
		if ( tc.draft && 'pen' === tc.draft.kind ) {
			tc.setDraft( { ...tc.draft, dragging: false } );
		}
	},
	onDblClick( tc ) {
		if (
			tc.draft &&
			'pen' === tc.draft.kind &&
			tc.draft.anchors.length > 1
		) {
			tc.setDraft( { ...tc.draft, finalizing: true } );
		}
	},
};

/** Finalize the pen path as a stroke outline or a filled shape (spec 05.4). */
export function finalizePen( tc, mode ) {
	const draft = tc.draft;
	if ( ! draft || 'pen' !== draft.kind || draft.anchors.length < 2 ) {
		tc.setDraft( null );
		return;
	}
	tc.setDraft( null );
	const d = penPathD( draft.anchors, draft.closed );
	const xs = draft.anchors.flatMap( ( a ) =>
		[ a.x, a.hIn?.x, a.hOut?.x ].filter(
			( v ) => null !== v && undefined !== v
		)
	);
	const ys = draft.anchors.flatMap( ( a ) =>
		[ a.y, a.hIn?.y, a.hOut?.y ].filter(
			( v ) => null !== v && undefined !== v
		)
	);
	const pad = 4;
	const bounds = {
		x: Math.min( ...xs ) - pad,
		y: Math.min( ...ys ) - pad,
		w: Math.max( ...xs ) - Math.min( ...xs ) + 2 * pad,
		h: Math.max( ...ys ) - Math.min( ...ys ) + 2 * pad,
	};

	if ( 'fill' === mode ) {
		const layer = makeShape( {
			name: __( 'Path', 'wunderpaint' ),
			...bounds,
			shape: 'rect',
			fill: tc.fg,
			pathD: d,
		} );
		// pathD is in doc coordinates; the renderer draws it inside a layer
		// whose local origin is (x, y), rebase the path.
		layer.pathD = rebasePathD( d, -layer.x, -layer.y );
		tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
		tc.editor.commit( __( 'Fill Path', 'wunderpaint' ) );
	} else {
		const layer = makeStroke( {
			name: __( 'Pen path', 'wunderpaint' ),
			...bounds,
			paths: [ { d, color: tc.fg, size: 3, opacity: 1 } ],
		} );
		layer.x0 = layer.x;
		layer.y0 = layer.y;
		tc.editor.dispatch( { type: 'ADD_LAYER', layer } );
		tc.editor.commit( __( 'Stroke Path', 'wunderpaint' ) );
	}
}

/** Shift every coordinate in a path string (M/L/Q/C/Z subset). */
export function rebasePathD( d, dx, dy ) {
	const tokens =
		String( d ).match( /[a-zA-Z]|-?\d*\.?\d+(?:e[+-]?\d+)?/g ) || [];
	const out = [];
	let isX = true;
	for ( const token of tokens ) {
		if ( /[a-zA-Z]/.test( token ) ) {
			out.push( token );
			isX = true;
		} else {
			out.push( String( parseFloat( token ) + ( isX ? dx : dy ) ) );
			isX = ! isX;
		}
	}
	return out.join( ' ' );
}

/* ------------------------------- Eyedropper ----------------------------- */

export const eyedropperTool = {
	onDown( tc, e, p ) {
		const alt = e.altKey;
		samplePixel( tc.doc, tc.layers, p.x, p.y, tc.imageCache ).then(
			( { r, g, b, a } ) => {
				if ( ! a ) {
					return; // fully transparent, nothing to pick
				}
				const hex = rgbToHex( r, g, b );
				tc.editor.dispatch( {
					type: alt ? 'SET_BG' : 'SET_FG',
					color: hex,
				} );
			}
		);
	},
	onMove() {},
	onUp() {},
};

/* -------------------------------- Hand/Zoom ----------------------------- */

export const handTool = {
	onDown( tc, e ) {
		tc.setDraft( {
			kind: 'pan',
			startX: e.clientX,
			startY: e.clientY,
			pan: { ...tc.editor.state.pan },
		} );
	},
	onMove( tc, e ) {
		const draft = tc.draft;
		if ( ! draft || 'pan' !== draft.kind ) {
			return;
		}
		tc.editor.dispatch( {
			type: 'SET_PAN',
			pan: {
				x: draft.pan.x + ( e.clientX - draft.startX ),
				y: draft.pan.y + ( e.clientY - draft.startY ),
			},
		} );
	},
	onUp( tc ) {
		if ( tc.draft && 'pan' === tc.draft.kind ) {
			tc.setDraft( null );
		}
	},
};

export const zoomTool = {
	onDown( tc, e, p, screenP ) {
		tc.setDraft( {
			kind: 'zoombox',
			start: p,
			screenStart: screenP,
			rect: null,
		} );
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'zoombox' !== draft.kind ) {
			return;
		}
		if (
			Math.hypot( p.x - draft.start.x, p.y - draft.start.y ) >
			8 / tc.zoom
		) {
			tc.setDraft( {
				...draft,
				rect: {
					x: Math.min( draft.start.x, p.x ),
					y: Math.min( draft.start.y, p.y ),
					w: Math.abs( p.x - draft.start.x ),
					h: Math.abs( p.y - draft.start.y ),
				},
			} );
		}
	},
	onUp( tc, e ) {
		const draft = tc.draft;
		if ( ! draft || 'zoombox' !== draft.kind ) {
			return;
		}
		tc.setDraft( null );
		if ( draft.rect && draft.rect.w > 4 && draft.rect.h > 4 ) {
			tc.viewApi.zoomToRect( draft.rect );
			return;
		}
		// Plain click: ×1.25 about cursor (Alt = ×0.8), spec 05.4 Zoom.
		const factor = e.altKey ? 0.8 : 1.25;
		const view = zoomAboutPoint(
			tc.editor.state.zoom,
			tc.editor.state.zoom * factor,
			tc.editor.state.pan,
			draft.screenStart
		);
		tc.editor.dispatch( {
			type: 'SET_VIEW',
			zoom: view.zoom,
			pan: view.pan,
		} );
	},
};

/* ------------------------------ Clone Stamp ----------------------------- */

/* --------------------- Blur/Sharpen brush (v0.7) ------------------------ */

export const fxBrushTool = {
	onDown( tc, e, p ) {
		let target = activeLayer( tc );
		if ( ! target || ! [ 'image', 'raster' ].includes( target.type ) ) {
			tc.extras.toasts.toast(
				__(
					'The blur/sharpen brush needs a pixel layer, select an image/raster layer.',
					'wunderpaint'
				)
			);
			return;
		}
		hintIfInvisible( tc, target );
		target = ensureRaster( tc, target );
		if ( ! target ) {
			return;
		}
		const mask = tc.selection
			? layerLocalMask( tc.selection, tc.doc, target )
			: null;
		tc.setDraft( { kind: 'fxbrush', layerId: target.id, lastPt: p, mask } );
		effectStamp( target, p, { ...tc.opts, mask } );
		tc.requestRender();
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'fxbrush' !== draft.kind ) {
			return;
		}
		const layer = tc.layers.find( ( l ) => l.id === draft.layerId );
		if ( ! layer?.canvas ) {
			return;
		}
		const opts = tc.opts;
		const step = Math.max( 2, ( opts.size || 40 ) / 4 );
		const dist = Math.hypot( p.x - draft.lastPt.x, p.y - draft.lastPt.y );
		if ( dist < step / 2 ) {
			return;
		}
		const steps = Math.max( 1, Math.round( dist / step ) );
		for ( let i = 1; i <= steps; i++ ) {
			effectStamp(
				layer,
				{
					x:
						draft.lastPt.x +
						( ( p.x - draft.lastPt.x ) * i ) / steps,
					y:
						draft.lastPt.y +
						( ( p.y - draft.lastPt.y ) * i ) / steps,
				},
				{ ...opts, mask: draft.mask }
			);
		}
		draft.lastPt = p;
		tc.requestRender();
	},
	onUp( tc ) {
		if ( tc.draft?.kind === 'fxbrush' ) {
			tc.setDraft( null );
			tc.editor.commit(
				'sharpen' === tc.opts.mode
					? __( 'Sharpen Brush', 'wunderpaint' )
					: __( 'Blur Brush', 'wunderpaint' )
			);
		}
	},
};

export const stampTool = {
	onDown( tc, e, p ) {
		const opts = tc.opts;
		if ( e.altKey ) {
			// Alt-click sets the clone source (v0.2).
			tc.editor.dispatch( {
				type: 'SET_TOOL_OPTS',
				tool: 'stamp',
				patch: { source: { x: p.x, y: p.y } },
			} );
			return;
		}
		if ( ! opts.source ) {
			tc.extras.toasts.toast(
				__( 'Alt-click first to set the clone source.', 'wunderpaint' )
			);
			return;
		}
		let target = activeLayer( tc );
		if ( ! target || ! [ 'image', 'raster' ].includes( target.type ) ) {
			tc.extras.toasts.toast(
				__(
					'The clone stamp needs a pixel layer, select an image/raster layer.',
					'wunderpaint'
				)
			);
			return;
		}
		hintIfInvisible( tc, target );
		target = ensureRaster( tc, target );
		if ( ! target ) {
			return;
		}
		// Snapshot at stroke start = clone source pixels stay stable.
		const snapshot = buildRasterCanvas( target, target.canvas );
		const offset = { dx: opts.source.x - p.x, dy: opts.source.y - p.y };
		const mask = tc.selection
			? layerLocalMask( tc.selection, tc.doc, target )
			: null;
		tc.setDraft( {
			kind: 'stamp',
			layerId: target.id,
			snapshot,
			offset,
			lastPt: p,
			mask,
		} );
		cloneStamp( target, snapshot, offset, p, {
			size: opts.size,
			opacity: ( opts.opacity ?? 100 ) / 100,
			hardness: opts.hardness ?? 80,
			mask,
		} );
		tc.requestRender();
	},
	onMove( tc, e, p ) {
		const draft = tc.draft;
		if ( ! draft || 'stamp' !== draft.kind ) {
			return;
		}
		const layer = tc.layers.find( ( l ) => l.id === draft.layerId );
		if ( ! layer?.canvas ) {
			return;
		}
		const opts = tc.opts;
		const step = Math.max( 2, ( opts.size || 40 ) / 4 );
		const dist = Math.hypot( p.x - draft.lastPt.x, p.y - draft.lastPt.y );
		if ( dist < step / 2 ) {
			return;
		}
		// Stamp along the segment for a continuous stroke.
		const steps = Math.max( 1, Math.round( dist / step ) );
		for ( let i = 1; i <= steps; i++ ) {
			const at = {
				x: draft.lastPt.x + ( ( p.x - draft.lastPt.x ) * i ) / steps,
				y: draft.lastPt.y + ( ( p.y - draft.lastPt.y ) * i ) / steps,
			};
			cloneStamp( layer, draft.snapshot, draft.offset, at, {
				size: opts.size,
				opacity: ( opts.opacity ?? 100 ) / 100,
				hardness: opts.hardness ?? 80,
				mask: draft.mask,
			} );
		}
		tc.setDraft( { ...draft, lastPt: p } );
		tc.requestRender();
	},
	onUp( tc ) {
		if ( tc.draft && 'stamp' === tc.draft.kind ) {
			const draft = tc.draft;
			tc.setDraft( null );
			tc.editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: draft.layerId,
				patch: {},
			} );
			tc.editor.commit( __( 'Clone Stamp', 'wunderpaint' ) );
		}
	},
};

/* ------------------------------- dispatcher ----------------------------- */

export const TOOL_HANDLERS = {
	move: moveTool,
	marquee: marqueeTool,
	lasso: lassoTool,
	wand: wandTool,
	smartselect: smartSelectTool,
	select: moveTool,
	fxbrush: fxBrushTool,
	crop: cropTool,
	brush: brushTool,
	pencil: pencilTool,
	eraser: eraserTool,
	bucket: bucketTool,
	gradient: gradientTool,
	stamp: stampTool,
	text: textTool,
	shape: shapeTool,
	pen: penTool,
	eyedropper: eyedropperTool,
	hand: handTool,
	zoom: zoomTool,
};

// Extension tools dispatch through the same map (v0.4).
bindToolHandlerSink( TOOL_HANDLERS );
