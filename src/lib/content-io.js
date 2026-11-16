/**
 * Content authoring I/O (v1.20): turn an editor selection into bundle-able
 * library content, text combinations, elements and backgrounds, the same
 * way `template-io` turns a document into a bundled template.
 *
 * Each `xFromLayers`/`xFromLayer` returns a JSON descriptor (File → Export
 * downloads it); dropped into src/content/bundled-<kind>/ and rebuilt, it
 * appears in the matching Library section. The `xToLayers` helpers hydrate a
 * descriptor back into fresh, editable layers for insertion/preview.
 */

import { sanitizeSpanStyle } from './rich-text';
import { serializeLayers } from '../store/document';
import { reassignIds, slugify } from './template-io';
import { scalePathD } from './path';
import { scaleLayer, FX_METRICS, STYLE_METRICS } from './layer-scale';

/** Text layers with their run and line styles scrubbed (see hydrateLayers). */
function scrubSpans( layers ) {
	return ( layers || [] ).map( ( l ) => {
		if ( ! l || 'text' !== l.type ) {
			return l;
		}
		const out = { ...l };
		if ( Array.isArray( out.spans ) ) {
			out.spans = out.spans.map( ( run ) =>
				run && run.s ? { ...run, s: sanitizeSpanStyle( run.s ) } : run
			);
		}
		if ( Array.isArray( out.lineStyles ) ) {
			out.lineStyles = out.lineStyles.map( ( ls ) =>
				ls ? sanitizeSpanStyle( ls ) : ls
			);
		}
		return out;
	} );
}

export const COMBO_FORMAT = 'wpie-combo@1';
export const ELEMENT_FORMAT = 'wpie-element@1';
export const BACKGROUND_FORMAT = 'wpie-background@1';

/** Axis-aligned bounding box of a set of layers. */
export function bboxOf( layers ) {
	const minX = Math.min( ...layers.map( ( l ) => l.x ) );
	const minY = Math.min( ...layers.map( ( l ) => l.y ) );
	const maxX = Math.max( ...layers.map( ( l ) => l.x + l.w ) );
	const maxY = Math.max( ...layers.map( ( l ) => l.y + l.h ) );
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Uniformly scale a layer set by `f` (geometry and every pixel metric), the
 * same way Resize Design scales a document: all three paths share
 * scaleLayer() since 24.09.2026. Used to fit a bundled combo into its
 * target document / preview.
 *
 * @param {Array}  layers Layers.
 * @param {number} f      Scale factor.
 * @return {Array} Scaled copies.
 */
export function scaleLayers( layers, f ) {
	if ( 1 === f ) {
		return layers.map( ( l ) => ( { ...l } ) );
	}
	return layers.map( ( layer ) => scaleLayer( layer, { sx: f, sy: f } ) );
}

// The metric lists live in layer-scale.js with the one scaler that reads
// them; re-exported so `FX_METRICS from './content-io'` keeps working.
export { FX_METRICS, STYLE_METRICS };

/* ---------------------------- text combinations ------------------------- */

/**
 * Build a bundle-able text-combination descriptor from selected layers.
 * Groups are dropped to their leaves and positions normalized to the box
 * origin (the combo re-centers itself on insert).
 *
 * @param {Array}  layers Selected leaf layers (no group wrappers).
 * @param {Object} meta   { label }.
 * @return {Object} Combo descriptor.
 */
export function comboFromLayers( layers, meta = {} ) {
	const leaves = layers.filter( ( l ) => 'group' !== l.type );
	const box = bboxOf( leaves );
	const norm = serializeLayers( leaves ).map( ( l ) => {
		const copy = { ...l, x: l.x - box.x, y: l.y - box.y };
		delete copy.parent;
		delete copy.children;
		// Combo text wraps to its box when scaled (matches builder combos).
		if ( 'text' === copy.type ) {
			copy.fixedWidth = true;
		}
		return copy;
	} );
	const label = meta.label || 'Text Combination';
	return {
		format: COMBO_FORMAT,
		id: `combo-${ slugify( label ) }`,
		label,
		w: Math.round( box.w ),
		h: Math.round( box.h ),
		layers: norm,
	};
}

/**
 * Hydrate a combo descriptor into fresh layers, scaled to fit and centered in
 * `doc`. The insert op wraps the returned parts in a group (like builders).
 *
 * @param {Object} descriptor Combo descriptor.
 * @param {Object} doc        Target document { w, h }.
 * @return {Array} Fresh, positioned layers.
 */
export function comboToLayers( descriptor, doc, opts = {} ) {
	const w = descriptor.w || 1;
	const h = descriptor.h || 1;
	/*
	 * Classic combos only ever scale DOWN: a 630px badge should not blow
	 * up to fill a 4k canvas. A MARK is the opposite ('mark' fit, v1.287,
	 * the word-art category): it is the artwork, so it lands at ~72% of
	 * the document and scales UP to get there - capped at 4x so a tiny
	 * descriptor cannot turn to mush.
	 */
	const f =
		'mark' === opts.fit
			? Math.min( 4, ( doc.w * 0.72 ) / w, ( doc.h * 0.72 ) / h )
			: Math.min( 1, ( doc.w * 0.86 ) / w, ( doc.h * 0.86 ) / h );
	// The descriptor may come from the server library; its span styles get
	// the same scrub every opened project gets (rich-text's defence for the
	// edit overlay), which this path used to skip.
	const scaled = scaleLayers(
		reassignIds( scrubSpans( descriptor.layers || [] ) ),
		f
	);
	const dx = Math.round( ( doc.w - w * f ) / 2 );
	const dy = Math.round( ( doc.h - h * f ) / 2 );
	return scaled.map( ( l ) => ( {
		...l,
		x: Math.round( l.x + dx ),
		y: Math.round( l.y + dy ),
	} ) );
}

/* -------------------------------- elements ------------------------------ */

/**
 * Build a bundle-able element descriptor from a single shape layer. Custom
 * paths are normalized into the 100×100 box the element library expects.
 *
 * @param {Object} layer Shape layer.
 * @param {Object} meta  { name }.
 * @return {Object|null} Element descriptor, or null if not a shape.
 */
export function elementFromLayer( layer, meta = {} ) {
	if ( ! layer || 'shape' !== layer.type ) {
		return null;
	}
	const name = meta.name || layer.name || 'Element';
	const base = {
		format: ELEMENT_FORMAT,
		id: `el-${ slugify( name ) }`,
		name,
	};
	if ( layer.pathD ) {
		const sx = 100 / ( layer.w || 100 );
		const sy = 100 / ( layer.h || 100 );
		return { ...base, pathD: scalePathD( layer.pathD, sx, sy ) };
	}
	return { ...base, shape: layer.shape || 'rect', sides: layer.sides || 6 };
}

/* ------------------------------- backgrounds ---------------------------- */

/**
 * Build a bundle-able background descriptor from a gradient (or solid) layer.
 *
 * @param {Object} layer Gradient or shape layer.
 * @param {Object} meta  { name }.
 * @return {Object|null} Background descriptor, or null if unsupported.
 */
export function backgroundFromLayer( layer, meta = {} ) {
	if ( ! layer ) {
		return null;
	}
	const name = meta.name || 'Background';
	const id = `bg-${ slugify( name ) }`;
	if ( 'gradient' === layer.type ) {
		return {
			format: BACKGROUND_FORMAT,
			id,
			name,
			kind: layer.kind || 'linear',
			stops: ( layer.stops || [] ).map( ( s ) => ( { ...s } ) ),
		};
	}
	if ( 'shape' === layer.type && layer.fill && ! layer.pathD ) {
		return {
			format: BACKGROUND_FORMAT,
			id,
			name,
			kind: 'solid',
			color: layer.fill,
		};
	}
	return null;
}
