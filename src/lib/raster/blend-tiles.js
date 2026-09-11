/**
 * Blend-mode preview tiles (v1.430): one small render per blend mode, so
 * the picker shows all sixteen results side by side instead of one hovered
 * mode on the canvas. Same pipeline as the export (`renderSync` and the
 * `blendToComposite` mapping), a tile IS what the mode does.
 *
 * Cheap on purpose: the layers below the active one are composited ONCE
 * (the editor's own prefix-cache mechanism, `opts.base`), every tile only
 * re-composites the active layer and whatever lies above it. Layers above
 * with their own blend modes therefore stay exact, they blend onto the
 * accumulated result like on the canvas.
 *
 * The viewport is a window AROUND the active layer, not the whole
 * document: a small logo on a big photo would otherwise be a few identical
 * pixels in every tile.
 */
import { BLEND_MODES } from '../../store/constants';
import { createCanvas } from './env';
import { defaultCache } from './cache';
import { layerDeviceBounds } from './bounds';
import { groupDeviceBounds, renderSync } from './render';

/** Tile pixel size (the 1px frame around it lives in CSS). */
export const BLEND_TILE = { w: 58, h: 42 };

/**
 * Photoshop's grouping of the modes by what they do to the layers below.
 * Labels live in the picker (i18n); this is the data.
 */
export const BLEND_FAMILIES = [
	{ key: 'normal', modes: [ 'normal' ] },
	{ key: 'darken', modes: [ 'darken', 'multiply', 'color-burn' ] },
	{ key: 'lighten', modes: [ 'lighten', 'screen', 'color-dodge' ] },
	{ key: 'contrast', modes: [ 'overlay', 'soft-light', 'hard-light' ] },
	{ key: 'invert', modes: [ 'difference', 'exclusion' ] },
	{ key: 'color', modes: [ 'hue', 'saturation', 'color', 'luminosity' ] },
];

/** Top-level ancestor of a layer: the slot it paints in (groups nest). */
export function topLevelOf( layers, layer ) {
	let l = layer;
	const seen = new Set();
	while ( l && l.parent && ! seen.has( l.id ) ) {
		seen.add( l.id );
		l = layers.find( ( x ) => x.id === l.parent );
	}
	return l || layer;
}

/** Doc-space box of a layer (groups: union of the children). */
function layerDocBounds( layer, doc, layers ) {
	const env = {
		doc,
		layers,
		scale: 1,
		viewport: { x: 0, y: 0, w: doc.w, h: doc.h },
	};
	const b =
		'group' === layer.type
			? groupDeviceBounds( layer, env )
			: layerDeviceBounds( layer, env );
	return b || { x: 0, y: 0, w: doc.w, h: doc.h };
}

/**
 * Viewport for the tiles: the layer box padded by a third on every side,
 * widened to the tile aspect, never wider than the document itself. Kept
 * inside the document where it fits, centred on it where it does not.
 *
 * @param {Object} doc  { w, h }.
 * @param {Object} box  Layer box in doc space { x, y, w, h }.
 * @param {Object} tile { w, h } pixel size.
 * @return {Object} { x, y, w, h } in doc space.
 */
export function blendTileViewport( doc, box, tile = BLEND_TILE ) {
	const aspect = tile.w / tile.h;
	const pad = 0.35;
	let vw = Math.max( 1, box.w ) * ( 1 + 2 * pad );
	let vh = Math.max( 1, box.h ) * ( 1 + 2 * pad );
	if ( vw / vh < aspect ) {
		vw = vh * aspect;
	} else {
		vh = vw / aspect;
	}
	// Tiny layers: do not zoom into single pixels.
	const maxW = Math.max( doc.w, doc.h * aspect );
	vw = Math.max( vw, Math.min( maxW, 48 ) );
	if ( vw > maxW ) {
		vw = maxW;
	}
	vh = vw / aspect;
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const place = ( c, size, docSize ) =>
		size <= docSize
			? Math.min( Math.max( 0, c - size / 2 ), docSize - size )
			: ( docSize - size ) / 2;
	return {
		x: place( cx, vw, doc.w ),
		y: place( cy, vh, doc.h ),
		w: vw,
		h: vh,
	};
}

/**
 * Render one tile per blend mode for the active layer.
 *
 * @param {Object} doc      Document.
 * @param {Array}  layers   Flat layer list (bottom→top).
 * @param {string} activeId Layer whose blend mode the tiles vary.
 * @param {Object} opts     { tile?, modes?, cache? }.
 * @return {Promise<Object|null>} mode → data URL, null without the layer.
 */
export async function renderBlendTiles( doc, layers, activeId, opts = {} ) {
	const tile = opts.tile || BLEND_TILE;
	const modes = opts.modes || BLEND_MODES;
	const cache = opts.cache || defaultCache;
	const active = layers.find( ( l ) => l.id === activeId );
	if ( ! active ) {
		return null;
	}
	await cache.warm( layers );

	const slot = topLevelOf( layers, active );
	const topLevel = layers.filter( ( l ) => ! l.parent );
	const fromIndex = Math.max( 0, topLevel.indexOf( slot ) );
	const viewport = blendTileViewport(
		doc,
		layerDocBounds( active, doc, layers ),
		tile
	);
	const scale = tile.w / viewport.w;
	const common = { viewport, scale, cache };

	// Everything below the active slot, once.
	const below = createCanvas( tile.w, tile.h );
	renderSync( below.getContext( '2d' ), doc, topLevel.slice( 0, fromIndex ), {
		...common,
		allLayers: layers,
	} );

	const out = {};
	for ( const mode of modes ) {
		const patched = layers.map( ( l ) =>
			l.id === activeId ? { ...l, blend: mode } : l
		);
		const canvas = createCanvas( tile.w, tile.h );
		renderSync( canvas.getContext( '2d' ), doc, patched, {
			...common,
			allLayers: patched,
			base: { canvas: below, fromIndex },
		} );
		out[ mode ] = canvas.toDataURL();
	}
	return out;
}
