/**
 * Depth-based background blur (v1.27): estimate a depth map with Depth Anything
 * (local, in-browser) and blend a sharp and a blurred copy by each pixel's
 * distance from a chosen focus plane, a graduated "portrait mode" bokeh.
 *
 * estimateDepth() does the expensive work once; renderDepthBlur() re-blends
 * cheaply for live focus/strength sliders.
 */

import { loadTransformers, mlPipeline } from './ml';
import { createCanvas } from './raster';

// Depth Anything V2 (v1.124): clearly better depth maps, Apache-2.0
// (only the SMALL variant is commercially free, keep it that way).
const MODEL = 'onnx-community/depth-anything-v2-small';
const MAX = 1536; // cap for snappy per-pixel blending

let pipe = null;

async function ensurePipe() {
	const TF = await loadTransformers();
	if ( ! pipe ) {
		pipe = await mlPipeline( 'depth-estimation', MODEL );
	}
	return TF;
}

/**
 * Estimate depth and precompute the sharp/blurred buffers.
 *
 * @param {string} dataUrl Source image data URL.
 * @return {Promise<Object>} { W, H, sharp, blurred, depth, autoFocus }.
 */
export async function estimateDepth( dataUrl ) {
	const TF = await ensurePipe();
	const img = await TF.RawImage.read( dataUrl );
	const scale = Math.min( 1, MAX / Math.max( img.width, img.height ) );
	const W = Math.max( 1, Math.round( img.width * scale ) );
	const H = Math.max( 1, Math.round( img.height * scale ) );

	const base = createCanvas( W, H );
	const bctx = base.getContext( '2d' );
	bctx.drawImage( img.toCanvas(), 0, 0, W, H );
	const sharp = bctx.getImageData( 0, 0, W, H ).data;

	const bl = createCanvas( W, H );
	const blc = bl.getContext( '2d' );
	blc.filter = 'blur(10px)';
	blc.drawImage( base, 0, 0 );
	const blurred = blc.getImageData( 0, 0, W, H ).data;

	const out = await pipe( dataUrl );
	const dc = createCanvas( W, H );
	const dctx = dc.getContext( '2d' );
	dctx.drawImage( out.depth.toCanvas(), 0, 0, W, H );
	const depth = dctx.getImageData( 0, 0, W, H ).data; // grayscale (R channel)

	const centre = ( ( H >> 1 ) * W + ( W >> 1 ) ) * 4;
	const autoFocus = depth[ centre ] / 255;

	return { W, H, sharp, blurred, depth, autoFocus };
}

/**
 * Blend sharp↔blurred by distance from the focus plane.
 *
 * @param {Object} d        estimateDepth() result.
 * @param {number} focus    Focus depth 0..1.
 * @param {number} strength How fast blur ramps with distance (1..8).
 * @return {HTMLCanvasElement} The blurred result.
 */
export function renderDepthBlur( d, focus, strength ) {
	const { W, H, sharp, blurred, depth } = d;
	const cv = createCanvas( W, H );
	const ctx = cv.getContext( '2d' );
	const out = ctx.createImageData( W, H );
	const f = focus * 255;
	for ( let i = 0; i < W * H; i++ ) {
		const j = i * 4;
		let t = ( Math.abs( depth[ j ] - f ) / 255 ) * strength;
		if ( t > 1 ) {
			t = 1;
		}
		const s = 1 - t;
		out.data[ j ] = sharp[ j ] * s + blurred[ j ] * t;
		out.data[ j + 1 ] = sharp[ j + 1 ] * s + blurred[ j + 1 ] * t;
		out.data[ j + 2 ] = sharp[ j + 2 ] * s + blurred[ j + 2 ] * t;
		out.data[ j + 3 ] = 255;
	}
	ctx.putImageData( out, 0, 0 );
	return cv;
}

/**
 * Just the depth map, for callers that do not want a bokeh.
 *
 * estimateDepth() also precomputes a sharp and a blurred full-size copy
 * of the picture, which is three RGBA buffers a studio has no use for -
 * at 1536px that is roughly 28 MB handed over for nothing. This returns
 * one channel: 0 is far, 255 is near.
 *
 * @param {string} dataUrl Source image data URL.
 * @return {Promise<Object>} `{ w, h, depth: Uint8Array }`.
 */
export async function depthMap( dataUrl ) {
	const TF = await ensurePipe();
	const img = await TF.RawImage.read( dataUrl );
	const scale = Math.min( 1, MAX / Math.max( img.width, img.height ) );
	const w = Math.max( 1, Math.round( img.width * scale ) );
	const h = Math.max( 1, Math.round( img.height * scale ) );
	const out = await pipe( dataUrl );
	const dc = createCanvas( w, h );
	const dctx = dc.getContext( '2d' );
	dctx.drawImage( out.depth.toCanvas(), 0, 0, w, h );
	const rgba = dctx.getImageData( 0, 0, w, h ).data;
	const depth = new Uint8Array( w * h );
	for ( let i = 0; i < w * h; i++ ) {
		depth[ i ] = rgba[ i * 4 ];
	}
	return { w, h, depth };
}
