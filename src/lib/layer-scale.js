/**
 * Resizing a layer (24.09.2026): the one place that knows every pixel a
 * layer carries besides its box.
 *
 * Three paths resize whole layers: a combo or mark inserted from the
 * library (content-io scaleLayers), Image Size and Magic Resize
 * (store/doc-ops). Each kept its own list. The two document paths scaled
 * neither layer styles nor text effects, rich-text runs, text outlines,
 * dash patterns, corner radii, pattern tiles, mask feather, repeat spacing,
 * text paths or free-transform corners: a design resized to twice its size
 * kept 8 px shadows and 2 px outlines around glyphs twice as big, and a
 * free-transformed layer stayed on its old corners. Image Size did not even
 * scale stroke widths. The library path knew styles and effects but not the
 * rest. All three ask scaleLayer() now; only the raster buffers (canvas,
 * mask canvas) stay with doc-ops, which owns the canvases.
 */
import { scalePathD, offsetPathD } from './path';
import { scaleRadius } from './corner-radii';

/* Pixel-metric keys per layer-style effect. Opacity/strength stay put. The
 * pattern overlay's scale multiplies a pixel tile, so it scales the way
 * Photoshop's "Scale Styles" does. */
export const STYLE_METRICS = {
	dropShadow: [ 'distance', 'blur', 'spread' ],
	innerShadow: [ 'distance', 'blur' ],
	outerGlow: [ 'blur', 'spread' ],
	innerGlow: [ 'blur' ],
	satin: [ 'distance', 'blur' ],
	stroke: [ 'size' ],
	bevel: [ 'size' ],
	patternOverlay: [ 'scale' ],
};

/* Pixel-metric keys per text FX. Percent/roughness/count/seed params stay put.
 *
 * This list covered 17 of the 73 effects until the 2026-07-25 inventory, so
 * the other 56 kept their pixel values through a resize and came out at the
 * wrong size: a 12 px dot grid stayed 12 px on a document twice as large.
 * Nothing said so, which is why it survived. content-io.test.js now walks
 * FX_PARAMS and fails if a pixel-named parameter is missing here, so the
 * next effect cannot arrive unscaled.
 *
 * The name is only a hint; the renderer decides. The 24.09.2026 pass
 * rendered every effect at 1x against scaleLayers() at 2x and flipped each
 * parameter's scaling: pad, amp, dash, inset, grain and a few more turned out
 * to be pixels, while the refreshed underline, shine, seal depth and
 * highlight radius had become fractions of the text size and were being
 * scaled twice. The pixel-named parameters that are NOT pixels are listed in
 * content-io.test.js (NOT_PIXELS), and that test fails if one lands here. */
export const FX_METRICS = {
	echo: [ 'gap' ],
	extrude: [ 'depth' ],
	longShadow: [ 'length' ],
	outline: [ 'size' ],
	dashedOutline: [ 'width', 'gap', 'dash' ],
	neonTube: [ 'width', 'glow' ],
	neon: [ 'size' ],
	glow: [ 'size' ],
	offsetPrint: [ 'offset', 'width' ],
	dotShadow: [ 'offset', 'size' ],
	splice: [ 'offset', 'width' ],
	threeD: [ 'depth' ],
	scanlines: [ 'gap', 'width' ],
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
	groundShadow: [ 'blur' ],
	innerGlow: [ 'size' ],
	paperCut: [ 'radius', 'pad', 'depth' ],
	pixelate: [ 'size' ],
	sketch: [ 'width', 'rough' ],
	confetti: [ 'size' ],
	stripesFill: [ 'width' ],
	comicDots: [ 'size' ],
	highlight: [ 'pad' ],
	sticker: [ 'size' ],
	burst: [ 'length', 'gap' ],
	stackShadow: [ 'offset' ],
	sparkle: [ 'size' ],
	inline: [ 'width', 'inset' ],
	contour: [ 'gap', 'width' ],
	marquee: [ 'size', 'gap', 'glow' ],
	knockout: [ 'radius', 'pad' ],
	checker: [ 'size' ],
	halftone: [ 'size' ],
	dotMatrix: [ 'size', 'glow' ],
	wireframe: [ 'width', 'depth', 'grid' ],
	waves: [ 'size', 'amp' ],
	motifFill: [ 'size' ],
	camo: [ 'size' ],
	circuit: [ 'size' ],
	plaid: [ 'size' ],
	bubbles: [ 'size' ],
	ripple: [ 'size', 'amp' ],
	seal: [ 'pad' ],
	hatchShadow: [ 'offset', 'gap', 'width' ],
	gradientOutline: [ 'width' ],
	glitch: [ 'strength' ],
	grunge: [ 'scale' ],
	static: [ 'scale' ],
	spray: [ 'grain' ],
	softBlur: [ 'amount' ],
	cracks: [ 'width' ],
};

/**
 * Multiply the listed numeric keys of every effect config by f.
 *
 * @param {Object} obj          Effect configs by id (layer.styles, textFX).
 * @param {Object} keysByEffect Pixel keys per effect id.
 * @param {number} f            Factor.
 * @return {Object} Scaled copy.
 */
export function scaleMetricMap( obj, keysByEffect, f ) {
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

/** Multiply the listed numeric keys of source into target. */
const scaleKeys = ( target, source, keys, f ) => {
	for ( const key of keys ) {
		if ( 'number' === typeof source[ key ] && source[ key ] ) {
			target[ key ] = source[ key ] * f;
		}
	}
	return target;
};

/* A rich-text run or line style: size and tracking are pixels, lh is a
 * multiple of the size and rides along by itself. */
const scaleRun = ( style, f ) =>
	style && 'object' === typeof style
		? scaleKeys( { ...style }, style, [ 'size', 'ls' ], f )
		: style;

/* The Repeat rule (repeat-layout.js): row offsets, grid gaps and the circle
 * centre are pixels relative to the source; the path frame is absolute. */
function scaleRepeatRule( rule, { sx, sy, dx, dy } ) {
	const out = { ...rule };
	scaleKeys( out, rule, [ 'dx', 'gapX' ], sx );
	scaleKeys( out, rule, [ 'dy', 'gapY' ], sy );
	if ( rule.center ) {
		out.center = {
			...rule.center,
			dx: ( Number( rule.center.dx ) || 0 ) * sx,
			dy: ( Number( rule.center.dy ) || 0 ) * sy,
		};
	}
	if ( rule.path?.frame ) {
		const fr = rule.path.frame;
		out.path = {
			...rule.path,
			frame: {
				...fr,
				x: fr.x * sx + dx,
				y: fr.y * sy + dy,
				w: fr.w * sx,
				h: fr.h * sy,
			},
		};
	}
	return out;
}

/**
 * One layer scaled by sx/sy and moved by dx/dy, in document pixels.
 *
 * The box and document-absolute geometry (stroke paths, gradient ends,
 * free-transform corners, the repeat path) take the full transform;
 * layer-local paths take sx/sy; sizes that are not geometry (type, strokes,
 * effects, spacing) take the mean of the two, the way Image Size has always
 * sized text. Raster canvases and mask canvases are left to the caller.
 *
 * @param {Object} layer  Layer.
 * @param {Object} t      Transform.
 * @param {number} t.sx   Horizontal factor.
 * @param {number} t.sy   Vertical factor.
 * @param {number} [t.dx] Horizontal offset after scaling (default 0).
 * @param {number} [t.dy] Vertical offset after scaling (default 0).
 * @return {Object} Scaled copy.
 */
export function scaleLayer( layer, { sx, sy, dx = 0, dy = 0 } ) {
	const f = ( sx + sy ) / 2;
	const at = ( p ) => ( { ...p, x: p.x * sx + dx, y: p.y * sy + dy } );
	const l = {
		...layer,
		x: layer.x * sx + dx,
		y: layer.y * sy + dy,
		w: layer.w * sx,
		h: layer.h * sy,
	};
	if ( 'text' === layer.type ) {
		scaleKeys( l, layer, [ 'fontSize' ], f );
		l.letterSpacing = ( layer.letterSpacing || 0 ) * f;
		if ( Array.isArray( layer.spans ) ) {
			l.spans = layer.spans.map( ( run ) =>
				run && run.s ? { ...run, s: scaleRun( run.s, f ) } : run
			);
		}
		if ( Array.isArray( layer.lineStyles ) ) {
			l.lineStyles = layer.lineStyles.map( ( s ) => scaleRun( s, f ) );
		}
		scaleKeys(
			l,
			layer,
			[
				'outlineW',
				'outlineDashLen',
				'outlineDashGap',
				'paragraphSpacing',
			],
			f
		);
		// The pill behind the text falls back to an 8 px radius in
		// text-draw.js; a resized pill keeps its roundness even without one.
		if ( layer.bgColor ) {
			l.bgRadius = ( layer.bgRadius ?? 8 ) * f;
		}
		// Path text and shape text keep their outline in the layer box and
		// scale it with the box, like the reducer does on a handle resize.
		if ( layer.textPath?.d ) {
			l.textPath = {
				...layer.textPath,
				d: scalePathD( layer.textPath.d, sx, sy ),
			};
		}
		if ( layer.shapeBox?.d ) {
			l.shapeBox = {
				...layer.shapeBox,
				d: scalePathD( layer.shapeBox.d, sx, sy ),
			};
		}
	}
	scaleKeys( l, layer, [ 'strokeW', 'strokeDashLen', 'strokeDashGap' ], f );
	if ( layer.radius ) {
		// Keeps the number-or-[tl,tr,br,bl] shape; an array multiplied
		// as a number would have turned into NaN.
		l.radius = scaleRadius( layer.radius, f );
	}
	if (
		layer.patternScale ||
		layer.patternData ||
		( layer.pattern && 'none' !== layer.pattern )
	) {
		l.patternScale = ( layer.patternScale || 1 ) * f;
	}
	if ( 'shape' === layer.type && layer.pathD ) {
		// pathD is layer-local: scale only, the offset lives in x/y.
		l.pathD = scalePathD( layer.pathD, sx, sy );
	}
	if ( 'stroke' === layer.type ) {
		l.x0 = ( layer.x0 ?? layer.x ) * sx + dx;
		l.y0 = ( layer.y0 ?? layer.y ) * sy + dy;
		l.paths = ( layer.paths || [] ).map( ( p ) => {
			const d = scalePathD( p.d, sx, sy );
			return {
				...p,
				d: dx || dy ? offsetPathD( d, dx, dy ) : d,
				size: p.size * f,
			};
		} );
	}
	if ( 'gradient' === layer.type ) {
		if ( layer.from ) {
			l.from = at( layer.from );
		}
		if ( layer.to ) {
			l.to = at( layer.to );
		}
	}
	if ( layer.quad ) {
		l.quad = {
			tl: at( layer.quad.tl ),
			tr: at( layer.quad.tr ),
			br: at( layer.quad.br ),
			bl: at( layer.quad.bl ),
		};
	}
	if ( 'repeat' === layer.type && layer.rule ) {
		l.rule = scaleRepeatRule( layer.rule, { sx, sy, dx, dy } );
	}
	if ( layer.mask?.feather ) {
		l.mask = { ...layer.mask, feather: layer.mask.feather * f };
	}
	if ( layer.styles ) {
		l.styles = scaleMetricMap( layer.styles, STYLE_METRICS, f );
	}
	if ( layer.textFX ) {
		l.textFX = scaleMetricMap( layer.textFX, FX_METRICS, f );
	}
	return l;
}
