/**
 * "Show document", done once for every studio (October 2026).
 *
 * Every studio with a "Show document" button rendered the whole document
 * without its own layer into ONE picture and laid it behind the preview.
 * Two things went wrong with that:
 *
 *  1. The layer order was lost. A planet image at the bottom of the stack
 *     with a headline on top showed the headline BEHIND the planet while
 *     the planet was being edited.
 *  2. The place was lost. A mockup moved onto a table and scaled to fit
 *     came back big and centered in the studio, with the table somewhere
 *     behind it, so the perspective had to be matched by guesswork.
 *
 * This module splits the document at the edited layer - what paints below
 * it goes behind the preview, what paints above it goes in front (click-
 * through) - and maps the edited layer back to the document region the
 * studio's frame covers, rotation included, so the preview can sit
 * exactly where the layer sits.
 *
 * Pure layout functions (splitLayers, frameRect, bakeFrame) have no DOM;
 * renderAround and cropRegion draw on canvases.
 */

const isGroup = ( l ) => 'group' === l.type;
// Stands in for a layer that does not exist yet (splitLayers' `at`).
const NEW_ID = '\u0000wpie-new-layer';

/**
 * Where the editor puts a new layer, and which group it joins: right above
 * the selected layer - inside its group when a member is selected - or on
 * top without a selection. A group a generator rebuilds, a Repeat wrapper
 * or a locked group stays closed: the new layer goes above the whole of it.
 * The same rule as insertPlace() in src/store/editor-context.jsx, which
 * ADD_LAYER without an index follows (19.10.2026).
 *
 * @param {Object} state The editor state ({ layers, selectedIds, activeId }).
 * @return {{index: number, parent: (string|null)}} Flat index and group id.
 */
export function insertPlace( state ) {
	const layers = ( state && state.layers ) || [];
	const anchors =
		state && state.selectedIds && state.selectedIds.length
			? state.selectedIds
			: [ state && state.activeId ];
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const closed = ( g ) =>
		!! g && ( !! g.generator || !! g.repeatGroup || !! g.locked );
	const anchorOf = ( id ) => {
		let anchor = byId.get( id );
		const seen = new Set();
		for ( let cur = anchor; cur && cur.parent && ! seen.has( cur.id ); ) {
			seen.add( cur.id );
			const up = byId.get( cur.parent );
			if ( ! up ) {
				break;
			}
			if ( closed( up ) ) {
				anchor = up;
			}
			cur = up;
		}
		return anchor;
	};
	let best = null;
	let at = -1;
	for ( const id of anchors ) {
		const anchor = id ? anchorOf( id ) : null;
		const i = anchor ? layers.indexOf( anchor ) : -1;
		if ( i > at ) {
			at = i;
			best = anchor;
		}
	}
	if ( ! best ) {
		return { index: layers.length, parent: null };
	}
	return {
		index: at + 1,
		parent: best.parent && byId.has( best.parent ) ? best.parent : null,
	};
}

/**
 * The flat index of insertPlace(), for callers that only need the index.
 *
 * @param {Object} state The editor state.
 * @return {number} Index in the flat layer list.
 */
export function insertIndex( state ) {
	return insertPlace( state ).index;
}

/**
 * The layers that paint below and above the edited layer, each as a list
 * the core renderer can draw on its own: leaves in their paint order plus
 * every group that holds one of them. The edited layer (a group: with all
 * it holds) is in neither.
 *
 * A new layer (no editId) is split at `at`, the flat index it will be
 * inserted at, as a member of `parent` when it joins a group
 * (insertPlace()); without `at` it lands on top.
 *
 * @param {Array}       layers The document's flat layer list (z order).
 * @param {string}      editId The edited layer's id, or null for a new layer.
 * @param {number|null} at     Insert index of a new layer.
 * @param {string|null} parent The group a new layer joins.
 * @return {{below: Array, above: Array}} Two render lists.
 */
export function splitLayers( layers, editId, at = null, parent = null ) {
	let list = Array.isArray( layers ) ? layers : [];
	if ( ! editId && Number.isFinite( at ) ) {
		const i = Math.max( 0, Math.min( list.length, Math.round( at ) ) );
		const joins = parent && list.some( ( l ) => l.id === parent ) ? parent : null;
		list = [
			...list.slice( 0, i ),
			{ id: NEW_ID, type: 'image', parent: joins },
			...list.slice( i ),
		].map( ( l ) =>
			joins && l.id === joins
				? { ...l, children: [ ...( l.children || [] ), NEW_ID ] }
				: l
		);
		editId = NEW_ID;
	}
	const byId = new Map( list.map( ( l ) => [ l.id, l ] ) );
	const order = new Map( list.map( ( l, i ) => [ l.id, i ] ) );
	const kids = ( g ) =>
		( g.children || [] )
			.map( ( id ) => byId.get( id ) )
			.filter( Boolean )
			.sort( ( a, b ) => order.get( a.id ) - order.get( b.id ) );
	// Everything the edited layer holds.
	const edited = new Set();
	const mark = ( l ) => {
		edited.add( l.id );
		if ( isGroup( l ) ) {
			kids( l ).forEach( mark );
		}
	};
	if ( editId && byId.has( editId ) ) {
		mark( byId.get( editId ) );
	}
	// Leaves in paint order: top-level layers in list order, a group's
	// children in list order inside it (the core renderer's order).
	const leaves = [];
	const visit = ( l ) => {
		if ( isGroup( l ) ) {
			kids( l ).forEach( visit );
		} else {
			leaves.push( l );
		}
	};
	list.filter( ( l ) => ! l.parent || ! byId.has( l.parent ) ).forEach( visit );
	const cut = leaves.findIndex( ( l ) => edited.has( l.id ) );
	const below = new Set(),
		above = new Set();
	leaves.forEach( ( l, i ) => {
		if ( edited.has( l.id ) ) {
			return;
		}
		( cut < 0 || i < cut ? below : above ).add( l.id );
	} );
	// A group belongs to a list when it holds one of its leaves.
	const holds = ( g, set ) =>
		kids( g ).some( ( c ) => set.has( c.id ) || ( isGroup( c ) && holds( c, set ) ) );
	const pick = ( set ) =>
		list.filter(
			( l ) =>
				! edited.has( l.id ) &&
				( set.has( l.id ) || ( isGroup( l ) && holds( l, set ) ) )
		);
	return { below: pick( below ), above: pick( above ) };
}

/**
 * Render the document around the edited layer, at `scale` of its size:
 * `below` carries the document background, `above` is transparent and
 * null when nothing paints above.
 *
 * A new layer (no editId) is split where the editor will insert it, above
 * the selected layer and inside its group (insertPlace()); `insertAt`
 * overrides that for a studio that inserts elsewhere (on the top level).
 *
 * @param {Object} raster The core's bridge.raster.
 * @param {Object} state  The editor state ({ doc, layers, selectedIds, activeId }).
 * @param {Object} o      { editId, scale, insertAt }.
 * @return {Promise<{below: HTMLCanvasElement, above: HTMLCanvasElement|null, scale: number}>}
 */
export async function renderAround( raster, state, { editId = null, scale = 1, insertAt = null } = {} ) {
	const doc = state.doc;
	const place = editId || null !== insertAt ? null : insertPlace( state );
	const at = editId ? null : insertAt ?? place.index;
	const { below, above } = splitLayers(
		state.layers || [],
		editId,
		at,
		place ? place.parent : null
	);
	const opts = { scale, cache: raster.sharedImageCache };
	const back = await raster.renderToCanvas( doc, below, opts );
	const front = above.length
		? await raster.renderToCanvas( { ...doc, bg: 'transparent' }, above, opts )
		: null;
	return { below: back, above: front, scale };
}

/**
 * The document region (document pixels) a studio's frame covers when the
 * edited layer was cut from it: `frame` = { size: [ W, H ], x, y, w, h },
 * the full baked picture and the crop the layer shows. Without a frame
 * the layer rectangle itself. Rotation stays the layer's, around the
 * layer's center (the core renderer's pivot).
 *
 * @param {Object}      layer The edited layer.
 * @param {Object|null} frame Bake frame, or null.
 * @return {{x: number, y: number, w: number, h: number, rot: number, cx: number, cy: number}}
 */
export function frameRect( layer, frame = null ) {
	const lx = layer.x || 0,
		ly = layer.y || 0,
		lw = layer.w || 1,
		lh = layer.h || 1;
	const pivot = { rot: layer.rot || 0, cx: lx + lw / 2, cy: ly + lh / 2 };
	if ( ! frame || ! frame.w || ! frame.h || ! Array.isArray( frame.size ) ) {
		return { x: lx, y: ly, w: lw, h: lh, ...pivot };
	}
	const sx = lw / frame.w,
		sy = lh / frame.h;
	return {
		x: lx - frame.x * sx,
		y: ly - frame.y * sy,
		w: frame.size[ 0 ] * sx,
		h: frame.size[ 1 ] * sy,
		...pivot,
	};
}

/**
 * Where a new crop of the same frame lands so the object keeps its place
 * and its size in the document (the inverse of frameRect): the layer
 * rectangle for `crop` inside the region `rect`.
 *
 * @param {Object} rect  frameRect() of the old layer.
 * @param {Object} frame The old bake frame ({ size }).
 * @param {Object} crop  The new crop ({ x, y, w, h } in bake pixels).
 * @return {{x: number, y: number, w: number, h: number}}
 */
export function placeCrop( rect, frame, crop ) {
	const sx = rect.w / frame.size[ 0 ],
		sy = rect.h / frame.size[ 1 ];
	return {
		x: Math.round( rect.x + crop.x * sx ),
		y: Math.round( rect.y + crop.y * sy ),
		w: Math.max( 1, Math.round( crop.w * sx ) ),
		h: Math.max( 1, Math.round( crop.h * sy ) ),
	};
}

/**
 * Where a re-baked picture lands when its layer is updated, so what it
 * shows keeps its size and its place in the document (20.10.2026). Fitting
 * the new picture into the old box instead shrank it with every update
 * whose shape changed (3D Text: a longer word, a deeper extrusion), and a
 * box that has shrunk never grows back.
 *
 * The old frame's place in the document (frameRect) gives the scale. The
 * new frame is set around the same middle:
 * - both frames know their size in the 3D world (`world: [w, h]` at the
 *   camera's target): document pixels per world unit stay the same, so
 *   letters keep their size and a longer text simply gets wider;
 * - the same frame size: the same rectangle (the frame IS the picture);
 * - another shape of frame from the same camera: three.js keeps the
 *   vertical field of view, so the frame keeps its height.
 * A turned layer turns the new crop around its old middle.
 *
 * @param {Object} layer The layer being updated ({ x, y, w, h, rot }).
 * @param {Object} old   Its stored bake frame ({ size, x, y, w, h, world? }).
 * @param {Object} bake  The new bake frame, same shape.
 * @return {{x: number, y: number, w: number, h: number}|null} null when the
 *   old frame is unknown (the caller keeps its own fallback).
 */
export function placeRebake( layer, old, bake ) {
	const known = ( f ) =>
		f && Array.isArray( f.size ) && f.size[ 0 ] > 0 && f.size[ 1 ] > 0 && f.w > 0 && f.h > 0;
	if ( ! known( old ) || ! known( bake ) ) {
		return null;
	}
	const R = frameRect( layer, old );
	const hasWorld = ( f ) =>
		Array.isArray( f.world ) && f.world[ 0 ] > 0 && f.world[ 1 ] > 0;
	let fw, fh;
	if ( hasWorld( old ) && hasWorld( bake ) ) {
		const k = R.h / old.world[ 1 ];
		fw = bake.world[ 0 ] * k;
		fh = bake.world[ 1 ] * k;
	} else if ( old.size[ 0 ] === bake.size[ 0 ] && old.size[ 1 ] === bake.size[ 1 ] ) {
		fw = R.w;
		fh = R.h;
	} else {
		fh = R.h;
		fw = ( R.h * bake.size[ 0 ] ) / bake.size[ 1 ];
	}
	const r = placeCrop(
		{
			x: R.x + R.w / 2 - fw / 2,
			y: R.y + R.h / 2 - fh / 2,
			w: fw,
			h: fh,
		},
		bake,
		bake
	);
	let cx = r.x + r.w / 2,
		cy = r.y + r.h / 2;
	if ( R.rot ) {
		const a = ( R.rot * Math.PI ) / 180,
			dx = cx - R.cx,
			dy = cy - R.cy;
		cx = R.cx + dx * Math.cos( a ) - dy * Math.sin( a );
		cy = R.cy + dx * Math.sin( a ) + dy * Math.cos( a );
	}
	return {
		x: Math.round( cx - r.w / 2 ),
		y: Math.round( cy - r.h / 2 ),
		w: r.w,
		h: r.h,
	};
}

/**
 * The crop a trim keeps of a baked picture (the same bounds and margin as
 * three3d/trim.js trimCanvas), as a bake frame for frameRect.
 *
 * @param {Object} bounds { x0, y0, x1, y1 } inclusive (alphaBounds), or null.
 * @param {number} W      Bake width.
 * @param {number} H      Bake height.
 * @param {number} margin Margin in pixels.
 * @return {Object} { size: [ W, H ], x, y, w, h }
 */
export function bakeFrame( bounds, W, H, margin = 0 ) {
	if ( ! bounds ) {
		return { size: [ W, H ], x: 0, y: 0, w: W, h: H };
	}
	const x0 = Math.max( 0, bounds.x0 - margin ),
		y0 = Math.max( 0, bounds.y0 - margin ),
		x1 = Math.min( W - 1, bounds.x1 + margin ),
		y1 = Math.min( H - 1, bounds.y1 + margin );
	return { size: [ W, H ], x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Cut the document region `rect` out of a document render (at `scale` of
 * the document) into a canvas of outW x outH, turned back by the layer's
 * rotation, so it lines up with an unrotated preview of the layer.
 *
 * @param {HTMLCanvasElement} src   Document render.
 * @param {number}            scale Render scale (render px per document px).
 * @param {Object}            rect  frameRect().
 * @param {number}            outW  Output width.
 * @param {number}            outH  Output height.
 * @return {HTMLCanvasElement}
 */
export function cropRegion( src, scale, rect, outW, outH ) {
	const out = document.createElement( 'canvas' );
	out.width = Math.max( 2, Math.round( outW ) );
	out.height = Math.max( 2, Math.round( outH ) );
	const g = out.getContext( '2d' );
	const k = out.width / rect.w;
	g.setTransform( k, 0, 0, out.height / rect.h, 0, 0 );
	// Into the region's frame: document point p shows at p - rect.xy, with
	// the layer's turn undone around its pivot.
	g.translate( rect.cx - rect.x, rect.cy - rect.y );
	if ( rect.rot ) {
		g.rotate( ( -rect.rot * Math.PI ) / 180 );
	}
	g.translate( -rect.cx, -rect.cy );
	g.scale( 1 / scale, 1 / scale );
	g.drawImage( src, 0, 0 );
	return out;
}

/**
 * Render the document around the edited layer once and hand back both
 * parts as data URLs (for CSS backgrounds) plus the canvases and their
 * scale (for cropRegion). The long side stays at or below `maxSide`.
 *
 * @param {Object} raster  The core's bridge.raster.
 * @param {Object} state   The editor state.
 * @param {string} editId  The edited layer's id, or null for a new layer.
 * @param {number} maxSide Longest side of the render.
 * @return {Promise<Object>} { below, above, scale, canvases: { below, above } }
 */
export async function captureAround( raster, state, editId = null, maxSide = 1400 ) {
	const d = state.doc;
	const scale = Math.min( 1, maxSide / Math.max( d.w || 1, d.h || 1 ) );
	const r = await renderAround( raster, state, { editId, scale } );
	return {
		below: r.below.toDataURL( 'image/png' ),
		above: r.above ? r.above.toDataURL( 'image/png' ) : null,
		scale,
		canvases: { below: r.below, above: r.above },
	};
}

/**
 * Both parts cut to the edited layer's own rectangle (turned back by its
 * rotation) at outW x outH: for studios whose preview IS the layer.
 *
 * @return {{below: string, above: string|null}} Data URLs.
 */
export function cropAround( captured, layer, outW, outH, frame = null ) {
	const rect = frameRect( layer, frame );
	const cut = ( c ) =>
		c ? cropRegion( c, captured.scale, rect, outW, outH ).toDataURL( 'image/png' ) : null;
	return { below: cut( captured.canvases.below ), above: cut( captured.canvases.above ) };
}

/**
 * The two document parts as elements in a preview host: `.wpie-docpart`
 * behind everything the host shows, `.wpie-docpart.is-above` in front,
 * click-through. The host becomes its own stacking context, so the part
 * behind sits above the host's own backdrop and below the preview
 * without the preview's canvas needing any style.
 *
 * @param {HTMLElement}   host  The element the preview lives in.
 * @param {HTMLElement[]} onTop Controls that must stay above the front part.
 * @return {Object} { below, above, show( parts, rect ), hide(), fit( w, h, pad ) }
 */
export function docParts( host, onTop = [] ) {
	host.style.isolation = 'isolate';
	if ( 'static' === getComputedStyle( host ).position ) {
		host.style.position = 'relative';
	}
	const make = ( front ) => {
		const d = document.createElement( 'div' );
		d.className = 'wpie-docpart' + ( front ? ' is-above' : '' );
		Object.assign( d.style, {
			position: 'absolute',
			pointerEvents: 'none',
			backgroundSize: '100% 100%',
			backgroundRepeat: 'no-repeat',
			zIndex: front ? '1' : '-1',
			display: 'none',
		} );
		return d;
	};
	const below = make( false ),
		above = make( true );
	host.insertBefore( below, host.firstChild );
	host.appendChild( above );
	onTop.forEach( ( node ) => {
		if ( node ) {
			node.style.zIndex = '3';
			if ( 'static' === getComputedStyle( node ).position ) {
				node.style.position = 'relative';
			}
		}
	} );
	const place = ( node, url, rect ) => {
		if ( ! url ) {
			node.style.display = 'none';
			return;
		}
		Object.assign( node.style, {
			display: 'block',
			backgroundImage: 'url(' + url + ')',
			left: ( rect ? rect.x : 0 ) + 'px',
			top: ( rect ? rect.y : 0 ) + 'px',
			width: rect ? rect.w + 'px' : '100%',
			height: rect ? rect.h + 'px' : '100%',
		} );
	};
	return {
		below,
		above,
		/** Show both parts in `rect` (host pixels), or over the whole host. */
		show( parts, rect = null ) {
			// The front part stays the host's last child, above anything
			// the studio added after it.
			if ( host.lastChild !== above ) {
				host.appendChild( above );
			}
			place( below, parts && parts.below, rect );
			place( above, parts && parts.above, rect );
		},
		hide() {
			below.style.display = 'none';
			above.style.display = 'none';
		},
		/** The document contain-fitted into the host, `pad` px all round. */
		fit( docW, docH, pad = 8 ) {
			const W = host.clientWidth,
				H = host.clientHeight;
			const k = Math.max( 0.001, Math.min( ( W - 2 * pad ) / docW, ( H - 2 * pad ) / docH ) );
			return { k, x: ( W - docW * k ) / 2, y: ( H - docH * k ) / 2, w: docW * k, h: docH * k };
		},
	};
}

/**
 * Put a preview element where the edited layer sits in a document shown
 * at `fit` (docParts().fit()): `rect` is frameRect() of the layer.
 * Returns the element's size in pixels; unplace() undoes it.
 */
export function placeAt( node, rect, fit, layer = {} ) {
	const w = Math.max( 8, Math.round( rect.w * fit.k ) ),
		h = Math.max( 8, Math.round( rect.h * fit.k ) );
	const flip =
		( layer.flipX ? ' scaleX(-1)' : '' ) + ( layer.flipY ? ' scaleY(-1)' : '' );
	const css = {
		position: 'absolute',
		left: fit.x + rect.x * fit.k + 'px',
		top: fit.y + rect.y * fit.k + 'px',
		width: w + 'px',
		height: h + 'px',
		'max-width': 'none',
		'max-height': 'none',
		margin: '0',
		'transform-origin': ( rect.cx - rect.x ) * fit.k + 'px ' + ( rect.cy - rect.y ) * fit.k + 'px',
		// 'none', not '': an empty inline transform hands the element back
		// to a stylesheet transform (a centering translate, say).
		transform: ( ( rect.rot ? 'rotate(' + rect.rot + 'deg)' : '' ) + flip ).trim() || 'none',
	};
	// With priority: some studios size their canvas with !important.
	for ( const [ k, v ] of Object.entries( css ) ) {
		node.style.setProperty( k, v, 'important' );
	}
	// Marked for the shared QA (qa-kit/doc-preview-qa.mjs).
	node.dataset.wpiePlaced = '1';
	return { w, h };
}

const PLACED = [ 'position', 'left', 'top', 'width', 'height', 'max-width', 'max-height', 'margin', 'transform-origin', 'transform' ];
export function unplace( node ) {
	if ( ! node.dataset.wpiePlaced ) {
		return;
	}
	PLACED.forEach( ( k ) => node.style.removeProperty( k ) );
	delete node.dataset.wpiePlaced;
}

/**
 * The document laid around a preview that already sits somewhere: `box`
 * is the preview's rectangle in the host (pixels), `R` the document region
 * it shows (frameRect or a fit). Returns the rectangle the whole document
 * covers in the host, for docParts().show().
 */
export function docAround( box, R, docW, docH ) {
	const k = box.w / Math.max( 1e-6, R.w );
	return { x: box.x - R.x * k, y: box.y - R.y * k, w: docW * k, h: docH * k, k };
}

/** A picture of aspect `ar` fitted centered into a box ({ x, y, w, h }). */
export function fitInto( box, ar ) {
	const s = Math.min( box.w / ar, box.h );
	const w = s * ar,
		h = s;
	return { x: box.x + ( box.w - w ) / 2, y: box.y + ( box.h - h ) / 2, w, h };
}
