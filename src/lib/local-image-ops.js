/**
 * Client wrappers for the guaranteed-local image operations (spec 11.1):
 * remove background (U2-Netp worker), Lanczos upscale (worker), auto
 * enhance (kernels), each with a main-thread fallback when workers /
 * OffscreenCanvas are unavailable (older Safari).
 */

import { __ } from '@wordpress/i18n';

import { createCanvas } from './raster';
import { popPixels } from './color-pop';
import { alphaBBox } from './recrop';
import {
	fitProductRect,
	shadowEllipse,
	fogAlphaAt,
	zoomOffsets,
} from './looks';
import { estimateDepth } from './depth-blur';
import { gaussianBlur, unsharpMask } from './effects';
import { applyAdjustmentsPixels } from './color';
import { loadImage } from '../store/document';
import { cachedRuntimeBuffer, ORT_WASM_FILE } from './ml-cache';
import { assertLocalRuntime } from './ml';

const supportsWorkers = () =>
	'undefined' !== typeof window.Worker &&
	'undefined' !== typeof window.OffscreenCanvas;

const assetUrl = ( path ) => ( window.WPIE?.pluginUrl || '/' ) + path;

// ONNX runtime (v1.316): the CPU/SIMD build ships bundled in assets/ort/
// (copied by tools/sync-ort.js) and is served from the plugin's own origin —
// no download. Shared with transformers.js (see ml.js ortWasmBase).
function ortBase() {
	return assetUrl( 'assets/ort/' );
}

/* ------------------------------ remove bg ------------------------------ */

/**
 * Remove the background of an image (data URL) locally.
 *
 * @param {string} imageUrl Source data URL / same-origin URL.
 * @return {Promise<string>} RGBA PNG data URL with background removed.
 */
export async function removeBackgroundLocal( imageUrl ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;

	const alphaMap = await computeSubjectAlpha( img );

	// Upscale the 320×320 alpha map to image size and apply it.
	const alphaCanvas = createCanvas( alphaMap.size, alphaMap.size );
	const actx = alphaCanvas.getContext( '2d' );
	const alphaImage = actx.createImageData( alphaMap.size, alphaMap.size );
	for ( let i = 0; i < alphaMap.alpha.length; i++ ) {
		alphaImage.data[ i * 4 + 3 ] = Math.round( alphaMap.alpha[ i ] * 255 );
		alphaImage.data[ i * 4 ] = 255;
		alphaImage.data[ i * 4 + 1 ] = 255;
		alphaImage.data[ i * 4 + 2 ] = 255;
	}
	actx.putImageData( alphaImage, 0, 0 );

	// Slight blur on the mask smooths staircase edges from the 320px map.
	const smooth = createCanvas( w, h );
	const sctx = smooth.getContext( '2d' );
	sctx.imageSmoothingEnabled = true;
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage( alphaCanvas, 0, 0, w, h );

	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	octx.globalCompositeOperation = 'destination-in';
	octx.drawImage( smooth, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Portrait-mode background blur (v0.4): subject stays sharp (U2-Netp
 * mask), everything else gets a gaussian blur. Fully local.
 *
 * @param {string} imageUrl Source data URL / same-origin URL.
 * @param {Object} opts     Options.
 * @param {number} opts.radius Blur radius in px (at natural size).
 * @return {Promise<string>} PNG data URL.
 */
export async function blurBackgroundLocal( imageUrl, { radius = 18 } = {} ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;

	const alphaMap = await computeSubjectAlpha( img );

	// Sharp subject cut-out (same masking as removeBackgroundLocal).
	const alphaCanvas = createCanvas( alphaMap.size, alphaMap.size );
	const actx = alphaCanvas.getContext( '2d' );
	const alphaImage = actx.createImageData( alphaMap.size, alphaMap.size );
	for ( let i = 0; i < alphaMap.alpha.length; i++ ) {
		alphaImage.data[ i * 4 + 3 ] = Math.round( alphaMap.alpha[ i ] * 255 );
		alphaImage.data[ i * 4 ] = 255;
		alphaImage.data[ i * 4 + 1 ] = 255;
		alphaImage.data[ i * 4 + 2 ] = 255;
	}
	actx.putImageData( alphaImage, 0, 0 );

	const subject = createCanvas( w, h );
	const sctx = subject.getContext( '2d' );
	sctx.drawImage( img, 0, 0 );
	sctx.globalCompositeOperation = 'destination-in';
	sctx.imageSmoothingEnabled = true;
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage( alphaCanvas, 0, 0, w, h );

	// Blurred background (pixel kernel, same one the effects use).
	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	const bg = octx.getImageData( 0, 0, w, h );
	gaussianBlur(
		{ data: bg.data, width: w, height: h },
		{ radius: Math.max( 1, radius ) }
	);
	octx.putImageData( bg, 0, 0 );

	octx.drawImage( subject, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Color Pop (v1.375.1): the subject keeps its colors, everything else
 * drops to black and white. Fully local - same U2-Netp mask as Remove
 * BG, soft edges blend instead of cutting.
 *
 * @param {string} imageUrl Source data URL / same-origin URL.
 * @return {Promise<string>} PNG data URL.
 */
export async function colorPopLocal( imageUrl ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;

	const alphaMap = await computeSubjectAlpha( img );

	// The 320px alpha map, smoothed up to image size (same recipe as
	// removeBackgroundLocal, the soft edge is the point here).
	const alphaCanvas = createCanvas( alphaMap.size, alphaMap.size );
	const actx = alphaCanvas.getContext( '2d' );
	const alphaImage = actx.createImageData( alphaMap.size, alphaMap.size );
	for ( let i = 0; i < alphaMap.alpha.length; i++ ) {
		alphaImage.data[ i * 4 + 3 ] = Math.round( alphaMap.alpha[ i ] * 255 );
		alphaImage.data[ i * 4 ] = 255;
		alphaImage.data[ i * 4 + 1 ] = 255;
		alphaImage.data[ i * 4 + 2 ] = 255;
	}
	actx.putImageData( alphaImage, 0, 0 );
	const smooth = createCanvas( w, h );
	const sctx = smooth.getContext( '2d' );
	sctx.imageSmoothingEnabled = true;
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage( alphaCanvas, 0, 0, w, h );

	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	const pixels = octx.getImageData( 0, 0, w, h );
	const mask = sctx.getImageData( 0, 0, w, h );
	popPixels( pixels.data, mask.data );
	octx.putImageData( pixels, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * The 320px alpha map as a smooth, image-sized mask canvas - the shared
 * first step of every subject look (v1.376).
 *
 * @param {Object} alphaMap computeSubjectAlpha() result.
 * @param {number} w        Image width.
 * @param {number} h        Image height.
 * @return {HTMLCanvasElement} w×h mask, subject = opaque.
 */
function maskCanvasFor( alphaMap, w, h ) {
	const alphaCanvas = createCanvas( alphaMap.size, alphaMap.size );
	const actx = alphaCanvas.getContext( '2d' );
	const alphaImage = actx.createImageData( alphaMap.size, alphaMap.size );
	for ( let i = 0; i < alphaMap.alpha.length; i++ ) {
		alphaImage.data[ i * 4 + 3 ] = Math.round( alphaMap.alpha[ i ] * 255 );
		alphaImage.data[ i * 4 ] = 255;
		alphaImage.data[ i * 4 + 1 ] = 255;
		alphaImage.data[ i * 4 + 2 ] = 255;
	}
	actx.putImageData( alphaImage, 0, 0 );
	const smooth = createCanvas( w, h );
	const sctx = smooth.getContext( '2d' );
	sctx.imageSmoothingEnabled = true;
	sctx.imageSmoothingQuality = 'high';
	sctx.drawImage( alphaCanvas, 0, 0, w, h );
	return smooth;
}

/** Subject-only canvas (image masked by the smooth alpha). */
function subjectCanvasFor( img, mask, w, h ) {
	const subject = createCanvas( w, h );
	const sctx = subject.getContext( '2d' );
	sctx.drawImage( img, 0, 0 );
	sctx.globalCompositeOperation = 'destination-in';
	sctx.drawImage( mask, 0, 0 );
	return subject;
}

/**
 * Product Shot (v1.376): subject cut out, centered on clean white with a
 * soft contact shadow - the catalog look, fully local.
 *
 * @param {string} imageUrl Source data URL / same-origin URL.
 * @return {Promise<string>} PNG data URL.
 */
export async function productShotLocal( imageUrl ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const alphaMap = await computeSubjectAlpha( img );
	const bbox = alphaBBox( alphaMap, w, h );
	if ( ! bbox ) {
		throw new Error(
			__( 'No clear subject was detected.', 'wunderpaint' )
		);
	}
	const mask = maskCanvasFor( alphaMap, w, h );
	const subject = subjectCanvasFor( img, mask, w, h );
	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.fillStyle = '#ffffff';
	octx.fillRect( 0, 0, w, h );
	const rect = fitProductRect( bbox, w, h );
	const s = shadowEllipse( rect );
	octx.save();
	octx.translate( s.cx, s.cy );
	octx.scale( 1, s.ry / s.rx );
	const grad = octx.createRadialGradient( 0, 0, 0, 0, 0, s.rx );
	grad.addColorStop( 0, 'rgba(0,0,0,0.22)' );
	grad.addColorStop( 1, 'rgba(0,0,0,0)' );
	octx.fillStyle = grad;
	octx.fillRect( -s.rx, -s.rx, 2 * s.rx, 2 * s.rx );
	octx.restore();
	octx.imageSmoothingEnabled = true;
	octx.imageSmoothingQuality = 'high';
	octx.drawImage(
		subject,
		bbox.x,
		bbox.y,
		bbox.w,
		bbox.h,
		rect.x,
		rect.y,
		rect.w,
		rect.h
	);
	return out.toDataURL( 'image/png' );
}

/**
 * Neon Rim (v1.376): dimmed background, glowing colored rim around the
 * subject - the thumbnail look.
 *
 * @param {string} imageUrl     Source data URL / same-origin URL.
 * @param {Object} opts         Options.
 * @param {string} opts.color   Glow color (hex).
 * @return {Promise<string>} PNG data URL.
 */
export async function neonRimLocal( imageUrl, { color = '#00e5ff' } = {} ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const alphaMap = await computeSubjectAlpha( img );
	const mask = maskCanvasFor( alphaMap, w, h );
	const subject = subjectCanvasFor( img, mask, w, h );
	// Colored silhouette that carries the glow.
	const sil = createCanvas( w, h );
	const silCtx = sil.getContext( '2d' );
	silCtx.drawImage( mask, 0, 0 );
	silCtx.globalCompositeOperation = 'source-in';
	silCtx.fillStyle = color;
	silCtx.fillRect( 0, 0, w, h );
	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	octx.fillStyle = 'rgba(8, 10, 16, 0.55)';
	octx.fillRect( 0, 0, w, h );
	octx.save();
	octx.shadowColor = color;
	octx.shadowBlur = Math.max( 12, Math.min( w, h ) * 0.03 );
	octx.drawImage( sil, 0, 0 );
	octx.drawImage( sil, 0, 0 );
	octx.drawImage( sil, 0, 0 );
	octx.restore();
	octx.drawImage( subject, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Speed Blur (v1.376): the background rushes outward in a zoom blur
 * centered on the subject, the subject itself stays sharp.
 *
 * @param {string} imageUrl      Source data URL / same-origin URL.
 * @param {Object} opts          Options.
 * @param {number} opts.strength Zoom range (0.14 = 14%).
 * @return {Promise<string>} PNG data URL.
 */
export async function speedBlurLocal( imageUrl, { strength = 0.14 } = {} ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const alphaMap = await computeSubjectAlpha( img );
	const mask = maskCanvasFor( alphaMap, w, h );
	const subject = subjectCanvasFor( img, mask, w, h );
	const bbox = alphaBBox( alphaMap, w, h );
	const cx = bbox ? bbox.x + bbox.w / 2 : w / 2;
	const cy = bbox ? bbox.y + bbox.h / 2 : h / 2;
	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.imageSmoothingEnabled = true;
	octx.imageSmoothingQuality = 'high';
	const offs = zoomOffsets( 14, strength );
	offs.forEach( ( scale, i ) => {
		octx.save();
		// Running average keeps every tap equally weighted.
		octx.globalAlpha = 0 === i ? 1 : 1 / ( i + 1 );
		octx.translate( cx, cy );
		octx.scale( scale, scale );
		octx.translate( -cx, -cy );
		octx.drawImage( img, 0, 0 );
		octx.restore();
	} );
	octx.drawImage( subject, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Depth Fog (v1.376): atmospheric haze staged by real depth - clear up
 * front, misty in the distance.
 *
 * @param {string} imageUrl      Source data URL / same-origin URL.
 * @param {Object} opts          Options.
 * @param {number} opts.strength Fog multiplier (~1).
 * @return {Promise<string>} PNG data URL.
 */
export async function depthFogLocal( imageUrl, { strength = 1 } = {} ) {
	const d = await estimateDepth( imageUrl );
	const out = createCanvas( d.W, d.H );
	const octx = out.getContext( '2d' );
	const px = octx.createImageData( d.W, d.H );
	const fogR = 223;
	const fogG = 231;
	const fogB = 238;
	for ( let i = 0; i < d.W * d.H; i++ ) {
		const j = i * 4;
		const a = fogAlphaAt( d.depth[ j ], strength );
		const keep = 1 - a;
		px.data[ j ] = d.sharp[ j ] * keep + fogR * a;
		px.data[ j + 1 ] = d.sharp[ j + 1 ] * keep + fogG * a;
		px.data[ j + 2 ] = d.sharp[ j + 2 ] * keep + fogB * a;
		px.data[ j + 3 ] = 255;
	}
	octx.putImageData( px, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Subject segmentation alpha map (U2-Netp) for an image element, shared by
 * Remove BG and Select Subject (v0.2).
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img Source.
 * @return {Promise<{alpha: Float32Array, size: number}>} 320×320 alpha map.
 */
export async function computeSubjectAlpha( img ) {
	assertLocalRuntime();
	return supportsWorkers()
		? removeBgViaWorker( img )
		: removeBgOnMainThread( img );
}

function removeBgViaWorker( img ) {
	return new Promise( ( resolve, reject ) => {
		// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
		const worker = new Worker(
			new URL( './removebg.worker.js', import.meta.url )
		);
		const timeout = window.setTimeout( () => {
			worker.terminate();
			reject(
				new Error(
					__( 'Background removal timed out.', 'wunderpaint' )
				)
			);
		}, 120000 );
		worker.onmessage = ( event ) => {
			window.clearTimeout( timeout );
			worker.terminate();
			if ( event.data.error ) {
				reject( new Error( event.data.error ) );
			} else {
				resolve( event.data );
			}
		};
		worker.onerror = ( err ) => {
			window.clearTimeout( timeout );
			worker.terminate();
			reject( new Error( err.message || 'worker failed' ) );
		};
		window
			.createImageBitmap( img )
			.then( ( bitmap ) =>
				worker.postMessage(
					{
						bitmap,
						wasmPath: ortBase(),
						modelUrl: assetUrl( 'assets/models/u2netp.onnx' ),
					},
					[ bitmap ]
				)
			)
			.catch( reject );
	} );
}

/** Main-thread fallback (no OffscreenCanvas/Worker, older Safari). */
async function removeBgOnMainThread( img ) {
	const ort = await import( /* webpackChunkName: "ort" */ 'onnxruntime-web' );
	ort.env.wasm.wasmPaths = ortBase();
	ort.env.wasm.numThreads = 1;
	// Same Cache API treatment as the worker path (v1.298.1): ORT
	// fetches the wasm itself when this returns null.
	try {
		const buf = await cachedRuntimeBuffer( ortBase() + ORT_WASM_FILE );
		if ( buf ) {
			ort.env.wasm.wasmBinary = buf;
		}
	} catch ( e ) {}
	const session = await ort.InferenceSession.create(
		assetUrl( 'assets/models/u2netp.onnx' ),
		{
			executionProviders: [ 'wasm' ],
		}
	);
	const SIZE = 320;
	const canvas = createCanvas( SIZE, SIZE );
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( img, 0, 0, SIZE, SIZE );
	const { data } = ctx.getImageData( 0, 0, SIZE, SIZE );
	const MEAN = [ 0.485, 0.456, 0.406 ];
	const STD = [ 0.229, 0.224, 0.225 ];
	const input = new Float32Array( 3 * SIZE * SIZE );
	for ( let i = 0; i < SIZE * SIZE; i++ ) {
		for ( let c = 0; c < 3; c++ ) {
			input[ c * SIZE * SIZE + i ] =
				( data[ i * 4 + c ] / 255 - MEAN[ c ] ) / STD[ c ];
		}
	}
	const tensor = new ort.Tensor( 'float32', input, [ 1, 3, SIZE, SIZE ] );
	const results = await session.run( {
		[ session.inputNames[ 0 ] ]: tensor,
	} );
	const output = results[ session.outputNames[ 0 ] ].data;
	let min = Infinity;
	let max = -Infinity;
	for ( const v of output ) {
		min = Math.min( min, v );
		max = Math.max( max, v );
	}
	const range = max - min || 1;
	const alpha = new Float32Array( SIZE * SIZE );
	for ( let i = 0; i < alpha.length; i++ ) {
		alpha[ i ] = ( output[ i ] - min ) / range;
	}
	return { alpha, size: SIZE };
}

/* ------------------------------- upscale -------------------------------- */

/**
 * Lanczos upscale (2×/4×) locally.
 *
 * @param {string} imageUrl Source data URL.
 * @param {number} factor   2 | 4.
 * @return {Promise<{url: string, width: number, height: number}>} Result.
 */
export async function upscaleLocal( imageUrl, factor = 2 ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const source = createCanvas( w, h );
	source.getContext( '2d' ).drawImage( img, 0, 0 );
	const rgba = source.getContext( '2d' ).getImageData( 0, 0, w, h ).data;

	let result;
	if ( supportsWorkers() ) {
		result = await new Promise( ( resolve, reject ) => {
			// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
			const worker = new Worker(
				new URL( './upscale.worker.js', import.meta.url )
			);
			worker.onmessage = ( event ) => {
				worker.terminate();
				if ( event.data.error ) {
					reject( new Error( event.data.error ) );
				} else {
					resolve( event.data );
				}
			};
			worker.onerror = ( err ) => {
				worker.terminate();
				reject( new Error( err.message || 'worker failed' ) );
			};
			const copy = new Uint8ClampedArray( rgba );
			worker.postMessage( { data: copy, width: w, height: h, factor }, [
				copy.buffer,
			] );
		} );
	} else {
		const { lanczosResize } = await import( './upscale.worker.js' );
		result = {
			data: lanczosResize(
				rgba,
				w,
				h,
				Math.round( w * factor ),
				Math.round( h * factor )
			),
			width: Math.round( w * factor ),
			height: Math.round( h * factor ),
		};
	}

	const out = createCanvas( result.width, result.height );
	const octx = out.getContext( '2d' );
	const outImage = octx.createImageData( result.width, result.height );
	outImage.data.set( result.data );
	octx.putImageData( outImage, 0, 0 );
	return {
		url: out.toDataURL( 'image/png' ),
		width: result.width,
		height: result.height,
	};
}

/* -------------------------------- enhance ------------------------------- */

/**
 * Local auto enhance (spec 11.1): histogram auto-levels + mild saturation
 * + unsharp mask.
 *
 * @param {string} imageUrl Source data URL.
 * @return {Promise<string>} Enhanced PNG data URL.
 */
export async function enhanceLocal( imageUrl ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const canvas = createCanvas( w, h );
	const ctx = canvas.getContext( '2d' );
	ctx.drawImage( img, 0, 0 );
	const imageData = ctx.getImageData( 0, 0, w, h );
	const buffer = { data: imageData.data, width: w, height: h };

	// Auto-levels: stretch the 1st..99th percentile to full range.
	const histogram = new Uint32Array( 256 );
	for ( let i = 0; i < buffer.data.length; i += 4 ) {
		histogram[
			Math.round(
				0.2126 * buffer.data[ i ] +
					0.7152 * buffer.data[ i + 1 ] +
					0.0722 * buffer.data[ i + 2 ]
			)
		]++;
	}
	const total = w * h;
	let lo = 0;
	let acc = 0;
	while ( lo < 255 && acc < total * 0.01 ) {
		acc += histogram[ lo++ ];
	}
	let hi = 255;
	acc = 0;
	while ( hi > 0 && acc < total * 0.01 ) {
		acc += histogram[ hi-- ];
	}
	if ( hi > lo + 16 ) {
		const scale = 255 / ( hi - lo );
		for ( let i = 0; i < buffer.data.length; i += 4 ) {
			buffer.data[ i ] = ( buffer.data[ i ] - lo ) * scale;
			buffer.data[ i + 1 ] = ( buffer.data[ i + 1 ] - lo ) * scale;
			buffer.data[ i + 2 ] = ( buffer.data[ i + 2 ] - lo ) * scale;
		}
	}

	applyAdjustmentsPixels( buffer, { saturation: 12, vibrance: 10 } );
	// Light denoise-free sharpening.
	unsharpMask( buffer, { radius: 2, amount: 60, threshold: 2 } );
	// Tiny blur on alpha edges is unnecessary; keep pixels as-is otherwise.
	void gaussianBlur; // (imported for potential soft-focus variants)

	ctx.putImageData( imageData, 0, 0 );
	return canvas.toDataURL( 'image/png' );
}
