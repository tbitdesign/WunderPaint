/**
 * THE unified rendering pipeline (spec 05.2 / 07.3).
 *
 * `renderSync` draws the document composite for BOTH the live preview and
 * the export rasterizer, one code path, so preview == output. The viewport
 * option restricts work to the visible region: per-layer scratch canvases
 * are clipped to (rotated layer bounds ∩ viewport), so cost scales with
 * screen pixels, not doc pixels × layers.
 *
 * Coordinates: everything below the world transform is in document pixels.
 * Device space = (docPoint − viewport.xy) × scale.
 *
 * Split into focused modules under ./raster/ (env, cache, bounds, content,
 * patterns, shapes, text-metrics, text-warp, text-paint, text-draw, styles,
 * render). This file re-exports the public API so existing imports keep
 * working; internals import their siblings directly.
 */

export {
	blendToComposite,
	createCanvas,
	cssFilterPixels,
	setCanvasFactory,
	supportsCtxFilter,
} from './raster/env';
export { ImageCache } from './raster/cache';
export { effectReach, layerOvershoot, stylesPadding } from './raster/bounds';
export { layerAlphaAt, PIXEL_HIT_ALPHA } from './raster/content';
export {
	__seedUserTile,
	registerUserTile,
	scaledTile,
	userTile,
} from './raster/patterns';
export { dashDefaults, dashPattern, tracePathD } from './raster/shapes';
export {
	curvedGlyphLayout,
	maxTextSize,
	measureTextHeight,
	measureTextWidth,
	textBlockHeight,
	textCommitHeight,
	textEditOffset,
	textFillStyle,
	textLineStyle,
} from './raster/text-metrics';
export { textFxReach } from './raster/text-warp';
export { blurCanvas, drawSoftRoundStroke } from './raster/styles';
export {
	drawWarped,
	renderSync,
	renderToBlob,
	renderToCanvas,
	renderToDataURL,
	samplePixel,
} from './raster/render';
export { defaultCache as sharedImageCache } from './raster/cache';
export { hexToRgb } from './color';
