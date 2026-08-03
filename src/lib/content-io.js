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

import { serializeLayers } from '../store/document';
import { reassignIds, slugify } from './template-io';
import { scalePathD } from './path';
import { scaleRadius } from './corner-radii';

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
 * Uniformly scale a layer set by `f` (geometry + type-specific fields), the
 * same way Resize Design scales a document. Used to fit a bundled combo into
 * its target document / preview.
 *
 * @param {Array}  layers Layers.
 * @param {number} f      Scale factor.
 * @return {Array} Scaled copies.
 */
export function scaleLayers( layers, f ) {
	if ( 1 === f ) {
		return layers.map( ( l ) => ( { ...l } ) );
	}
	return layers.map( ( layer ) => {
		const l = {
			...layer,
			x: layer.x * f,
			y: layer.y * f,
			w: layer.w * f,
			h: layer.h * f,
		};
		if ( 'text' === l.type ) {
			l.fontSize = ( layer.fontSize || 0 ) * f;
			l.letterSpacing = ( layer.letterSpacing || 0 ) * f;
			// Rich spans (v1.46) carry their own sizes — scale them along.
			if ( Array.isArray( layer.spans ) ) {
				l.spans = layer.spans.map( ( run ) =>
					run && run.s
						? {
								...run,
								s: {
									...run.s,
									...( run.s.size
										? { size: run.s.size * f }
										: {} ),
									...( run.s.ls ? { ls: run.s.ls * f } : {} ),
								},
						  }
						: run
				);
			}
		}
		if ( layer.strokeW ) {
			l.strokeW = layer.strokeW * f;
		}
		// Explicit dash metrics scale with the stroke they decorate (text
		// outlineW is deliberately NOT scaled here, so its dash isn't either).
		for ( const k of [ 'strokeDashLen', 'strokeDashGap' ] ) {
			if ( layer[ k ] ) {
				l[ k ] = layer[ k ] * f;
			}
		}
		if ( layer.radius ) {
			// Keeps the number-or-[tl,tr,br,bl] shape; an array multiplied
			// as a number would have turned into NaN.
			l.radius = scaleRadius( layer.radius, f );
		}
		if ( 'shape' === l.type && layer.pathD ) {
			l.pathD = scalePathD( layer.pathD, f, f );
		}
		// Layer styles and text FX carry pixel metrics of their own
		// (v1.287): a word-art mark scaled 2-3x into a large document kept
		// its 8px offset shadow and 10px echo gap, so every effect shrank
		// relative to the glyphs it decorates.
		if ( layer.styles ) {
			l.styles = scaleStyleMetrics( layer.styles, f );
		}
		if ( layer.textFX ) {
			l.textFX = scaleFxMetrics( layer.textFX, f );
		}
		return l;
	} );
}

/* Pixel-metric keys per layer-style effect. Opacity/strength stay put. */
const STYLE_METRICS = {
	dropShadow: [ 'distance', 'blur', 'spread' ],
	innerShadow: [ 'distance', 'blur' ],
	outerGlow: [ 'blur', 'spread' ],
	innerGlow: [ 'blur' ],
	satin: [ 'distance', 'blur' ],
	stroke: [ 'size' ],
	bevel: [ 'size' ],
};

/* Pixel-metric keys per text FX. Percent/roughness/count/seed params stay put.
 *
 * This list covered 17 of the 73 effects until the 2026-07-25 inventory, so
 * the other 56 kept their pixel values through a resize and came out at the
 * wrong size: a 12 px dot grid stayed 12 px on a document twice as large.
 * Nothing said so, which is why it survived. content-io.test.js now walks
 * FX_PARAMS and fails if a pixel-named parameter is missing here, so the
 * next effect cannot arrive unscaled. */
export const FX_METRICS = {
	echo: [ 'gap' ],
	extrude: [ 'depth' ],
	longShadow: [ 'length' ],
	outline: [ 'size' ],
	dashedOutline: [ 'width', 'gap' ],
	neonTube: [ 'width', 'glow' ],
	neon: [ 'size' ],
	glow: [ 'size' ],
	offsetPrint: [ 'offset', 'width' ],
	dotShadow: [ 'offset' ],
	splice: [ 'offset' ],
	threeD: [ 'depth' ],
	scanlines: [ 'gap' ],
	// 'gap' was in this list for a parameter rings does not have. Harmless
	// (the scaler skips absent keys) but it is how a list stops describing
	// what it claims to.
	rings: [ 'size' ],
	chromatic: [ 'offset' ],
	motionBlur: [ 'length' ],
	drip: [ 'length' ],
	reflection: [ 'gap' ],
	bevel: [ 'depth' ],
	letterpress: [ 'depth' ],
	shine: [ 'width' ],
	groundShadow: [ 'blur' ],
	innerGlow: [ 'size' ],
	paperCut: [ 'radius' ],
	pixelate: [ 'size' ],
	sketch: [ 'width' ],
	confetti: [ 'size' ],
	stripesFill: [ 'width' ],
	comicDots: [ 'size' ],
	highlight: [ 'radius' ],
	underlineFx: [ 'thickness', 'offset' ],
	sticker: [ 'size' ],
	burst: [ 'length', 'gap' ],
	stackShadow: [ 'offset' ],
	sparkle: [ 'size' ],
	inline: [ 'width' ],
	contour: [ 'gap', 'width' ],
	marquee: [ 'size', 'gap', 'glow' ],
	knockout: [ 'radius' ],
	checker: [ 'size' ],
	halftone: [ 'size' ],
	dotMatrix: [ 'size', 'glow' ],
	wireframe: [ 'width' ],
	waves: [ 'size' ],
	motifFill: [ 'size' ],
	camo: [ 'size' ],
	circuit: [ 'size' ],
	plaid: [ 'size' ],
	bubbles: [ 'size' ],
	ripple: [ 'size' ],
	seal: [ 'depth' ],
	hatchShadow: [ 'offset', 'gap' ],
	gradientOutline: [ 'width' ],
};

function scaleMetricMap( obj, keysByEffect, f ) {
	const out = {};
	for ( const [ effect, cfg ] of Object.entries( obj ) ) {
		const keys = keysByEffect[ effect ];
		if ( ! cfg || 'object' !== typeof cfg || ! keys ) {
			out[ effect ] = cfg;
			continue;
		}
		const scaled = { ...cfg };
		for ( const key of keys ) {
			if ( 'number' === typeof scaled[ key ] ) {
				scaled[ key ] = scaled[ key ] * f;
			}
		}
		out[ effect ] = scaled;
	}
	return out;
}

const scaleStyleMetrics = ( styles, f ) =>
	scaleMetricMap( styles, STYLE_METRICS, f );
const scaleFxMetrics = ( fx, f ) => scaleMetricMap( fx, FX_METRICS, f );

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
	const scaled = scaleLayers( reassignIds( descriptor.layers || [] ), f );
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
