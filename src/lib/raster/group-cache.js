/**
 * Bitmap cache for finished generator groups, in the EDITOR view only.
 *
 * A Type Flow design is one group of hundreds of path layers, and every
 * pan step or zoom step drew all of them again - each into a scratch
 * canvas of its own. A group that has not changed looks the same at the
 * same scale, so it is drawn once, whole (not clipped to the viewport),
 * and every later paint at that scale only places the bitmap: a pan is a
 * blit. While the zoom is still moving (the editor says `fast`) the last
 * bitmap is scaled instead of re-rendered, and the editor asks for a
 * crisp paint once the zoom has settled.
 *
 * Only groups a generator made and that hold nothing but shapes and
 * groups qualify: text waits for fonts and images for decoding, and a
 * bitmap taken before them would keep the fallback. Exports never pass a
 * cache, so they never see one.
 *
 * The key is identity: the group and every descendant object, in paint
 * order. The editor's state is immutable - any edit is a new object - and
 * a reordering changes the order, so nothing can go stale unnoticed.
 */
import { createCanvas } from './env';

const MIN_PARTS = 24; // below this a plain render is cheap enough
const MAX_PIXELS = 8e6; // one whole group, device pixels (32 MB)
const MAX_ENTRIES = 4;
const FAST_RANGE = 3; // a scaled bitmap stands in up to 3x either way

export function createGroupCache() {
	return {
		entries: new Map(),
		/** Set by the editor while the zoom is moving. */
		fast: false,
		/** Set here when a paint used a scaled bitmap (a crisp one is due). */
		scaledUsed: false,
		clear() {
			this.entries.clear();
		},
	};
}

// One id index per layer list: the lookups of a paint share it.
const indexes = new WeakMap();
function indexOf( layers ) {
	let idx = indexes.get( layers );
	if ( ! idx ) {
		idx = new Map( layers.map( ( l, i ) => [ l.id, { l, i } ] ) );
		indexes.set( layers, idx );
	}
	return idx;
}

/**
 * The group and all its descendants in paint order, with their places in
 * the layer list, or null when the group does not qualify.
 *
 * @param {Object} layer A group layer.
 * @param {Array}  list  The full layer list of the paint.
 * @return {Object|null} { parts, order }.
 */
export function partsOf( layer, list ) {
	if (
		'group' !== layer.type ||
		! layer.generator ||
		layer.previewEffect ||
		layer.smartFilters
	) {
		return null;
	}
	const idx = indexOf( list );
	const parts = [ layer ];
	const order = [ idx.get( layer.id )?.i ?? -1 ];
	const walk = ( group ) => {
		const kids = ( group.children || [] )
			.map( ( id ) => idx.get( id ) )
			.filter( Boolean )
			.sort( ( a, b ) => a.i - b.i );
		for ( const { l, i } of kids ) {
			if ( 'group' === l.type ) {
				if ( l.previewEffect || l.smartFilters ) {
					return false;
				}
				parts.push( l );
				order.push( i );
				if ( ! walk( l ) ) {
					return false;
				}
			} else if (
				'shape' === l.type &&
				! l.src &&
				! l.patternData &&
				! l.previewEffect &&
				! l.smartFilters
			) {
				parts.push( l );
				order.push( i );
			} else {
				return false;
			}
		}
		return true;
	};
	return walk( layer ) ? { parts, order } : null;
}

const same = ( a, b ) =>
	a.length === b.length && a.every( ( v, i ) => v === b[ i ] );

/**
 * Draw a group through the cache.
 *
 * @param {Object}   layer  The group.
 * @param {Object}   env    The render environment (with env.groupCache).
 * @param {Function} render renderLayerToDevice, for the one real render.
 * @param {Function} bounds deviceBoundsFor.
 * @return {Object|null|undefined} What renderLayerToDevice returns, or
 *                                 undefined: not cached, render as usual.
 */
export function cachedGroup( layer, env, render, bounds ) {
	const cache = env.groupCache;
	const found = partsOf( layer, env.layers );
	if ( ! found || found.parts.length < MIN_PARTS ) {
		return undefined;
	}
	const s = env.scale;
	const vx = Math.round( env.viewport.x * s );
	const vy = Math.round( env.viewport.y * s );
	let entry = cache.entries.get( layer.id );
	const valid =
		entry &&
		entry.quality === env.gradientQuality &&
		same( entry.parts, found.parts ) &&
		same( entry.order, found.order );
	if ( valid && entry.scale === s ) {
		// The same group at the same scale: place it.
		return entry.canvas
			? { canvas: entry.canvas, x: entry.x - vx, y: entry.y - vy }
			: null;
	}
	if (
		valid &&
		cache.fast &&
		entry.canvas &&
		s / entry.scale <= FAST_RANGE &&
		entry.scale / s <= FAST_RANGE
	) {
		// The zoom is still moving: the last bitmap, scaled, only the part
		// the viewport shows.
		const k = s / entry.scale;
		const gx = entry.x * k - env.viewport.x * s;
		const gy = entry.y * k - env.viewport.y * s;
		const gw = entry.canvas.width * k;
		const gh = entry.canvas.height * k;
		const x0 = Math.max( 0, Math.floor( gx ) );
		const y0 = Math.max( 0, Math.floor( gy ) );
		const x1 = Math.min(
			Math.ceil( env.viewport.w * s ),
			Math.ceil( gx + gw )
		);
		const y1 = Math.min(
			Math.ceil( env.viewport.h * s ),
			Math.ceil( gy + gh )
		);
		cache.scaledUsed = true;
		if ( x1 <= x0 || y1 <= y0 ) {
			return null;
		}
		const out = createCanvas( x1 - x0, y1 - y0 );
		const octx = out.getContext( '2d' );
		octx.imageSmoothingQuality = 'low';
		octx.drawImage(
			entry.canvas,
			( x0 - gx ) / k,
			( y0 - gy ) / k,
			( x1 - x0 ) / k,
			( y1 - y0 ) / k,
			0,
			0,
			x1 - x0,
			y1 - y0
		);
		return { canvas: out, x: x0, y: y0 };
	}
	// Render the whole group once at this scale, in document-anchored
	// device space (viewport at the origin, nothing clipped).
	const whole = {
		...env,
		viewport: {
			x: 0,
			y: 0,
			w: env.doc ? env.doc.w : 0,
			h: env.doc ? env.doc.h : 0,
		},
		unclipped: true,
		groupCache: null,
		deviceOffset: null,
	};
	const box = bounds( layer, whole );
	if ( ! box ) {
		cache.entries.delete( layer.id );
		return undefined;
	}
	if ( box.w * box.h > MAX_PIXELS ) {
		// Too big to keep at this zoom: the viewport-clipped render is cheaper.
		cache.entries.delete( layer.id );
		return undefined;
	}
	const out = render( layer, whole );
	entry = {
		parts: found.parts,
		order: found.order,
		quality: env.gradientQuality,
		scale: s,
		canvas: out ? out.canvas : null,
		x: out ? out.x : 0,
		y: out ? out.y : 0,
	};
	cache.entries.delete( layer.id );
	cache.entries.set( layer.id, entry );
	while ( cache.entries.size > MAX_ENTRIES ) {
		cache.entries.delete( cache.entries.keys().next().value );
	}
	return entry.canvas
		? { canvas: entry.canvas, x: entry.x - vx, y: entry.y - vy }
		: null;
}
