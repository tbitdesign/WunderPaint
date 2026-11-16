/**
 * Client wrappers for the guaranteed-local image operations (spec 11.1):
 * remove background (U2-Netp worker, BiRefNet when downloaded), upscale
 * (workers), auto enhance (kernels), each with a main-thread fallback when
 * workers / OffscreenCanvas are unavailable (older Safari).
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
import { assertLocalRuntime, isModelInstalled, modelsBaseUrl } from './ml';
import { subjectMaskCanvas } from './subject-mask';
import { CUTOUT_MODEL, foundSubject, subjectAnswer } from './subject-model';
import { logEvent } from './debug-log';

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

	// The model's mask, refined against the picture (lib/subject-mask.js).
	const smooth = await subjectMask( img, w, h );

	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	octx.globalCompositeOperation = 'destination-in';
	octx.drawImage( smooth, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * Portrait-mode background blur (v0.4): subject stays sharp (the subject
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

	// Sharp subject cut-out (same mask as removeBackgroundLocal).
	const subject = subjectCanvasFor(
		img,
		await subjectMask( img, w, h ),
		w,
		h
	);

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
 * drops to black and white. Fully local - same subject mask as Remove
 * BG, soft edges blend instead of cutting.
 *
 * @param {string} imageUrl Source data URL / same-origin URL.
 * @return {Promise<string>} PNG data URL.
 */
export async function colorPopLocal( imageUrl ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;

	// The refined subject mask (lib/subject-mask.js).
	const smooth = await subjectMask( img, w, h );

	const out = createCanvas( w, h );
	const octx = out.getContext( '2d' );
	octx.drawImage( img, 0, 0 );
	const pixels = octx.getImageData( 0, 0, w, h );
	const mask = smooth.getContext( '2d' ).getImageData( 0, 0, w, h );
	popPixels( pixels.data, mask.data );
	octx.putImageData( pixels, 0, 0 );
	return out.toDataURL( 'image/png' );
}

/**
 * The subject mask of a picture as an image-sized canvas, refined against
 * the picture (lib/subject-mask.js) - the shared first step of every
 * subject look. The model's own map comes along for callers that need a
 * bounding box.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img      The picture.
 * @param {number}                             w        Width.
 * @param {number}                             h        Height.
 * @param {Object}                             alphaMap computeCutoutAlpha() result, when already at hand.
 * @return {Promise<HTMLCanvasElement>} w x h mask, subject = opaque.
 */
export async function subjectMask( img, w, h, alphaMap = null ) {
	const map = alphaMap || ( await computeCutoutAlpha( img ) );
	return subjectMaskCanvas( img, w, h, map );
}

/** Whether the better cutout model (BiRefNet) can run here. */
export function canCutWithModel() {
	return isModelInstalled( 'cutout' ) && supportsWorkers();
}

/**
 * The subject map for a cutout: BiRefNet when it is downloaded and finds
 * something (lib/subject-model.js), U2-Netp otherwise, also when BiRefNet
 * fails (a browser that cannot give it the memory). Bounding-box users that
 * must stay quick (Crop to Subject, thumbnail framing) call
 * computeSubjectAlpha() directly.
 *
 * @param {HTMLImageElement|HTMLCanvasElement} img Source.
 * @return {Promise<{alpha: Float32Array, size: number, refine?: boolean}>} Square map.
 */
export async function computeCutoutAlpha( img ) {
	assertLocalRuntime();
	if ( canCutWithModel() ) {
		try {
			const bitmap = await window.createImageBitmap( img );
			// The worker spawn lives in its own module (import.meta, webpack
			// only), loaded on demand like migan-worker-client.js.
			const { runCutoutWorker } = await import(
				'./birefnet-worker-client'
			);
			const map = await runCutoutWorker( {
				bitmap,
				wasmPath: ortBase(),
				modelUrl: modelsBaseUrl() + CUTOUT_MODEL,
				version: window.WPIE?.version || '',
			} );
			if ( foundSubject( map.alpha ) ) {
				return { alpha: map.alpha, size: map.size, refine: false };
			}
			logEvent( 'info', 'ml', 'BiRefNet found no subject, U2-Netp used' );
		} catch ( e ) {
			logEvent(
				'warn',
				'ml',
				'BiRefNet failed, U2-Netp used',
				e?.message
			);
		}
	}
	return computeSubjectAlpha( img );
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
	const alphaMap = await computeCutoutAlpha( img );
	const bbox = alphaBBox( alphaMap, w, h );
	if ( ! bbox ) {
		throw new Error(
			__( 'No clear subject was detected.', 'wunderpaint' )
		);
	}
	const mask = await subjectMask( img, w, h, alphaMap );
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
	const alphaMap = await computeCutoutAlpha( img );
	const mask = await subjectMask( img, w, h, alphaMap );
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
	const alphaMap = await computeCutoutAlpha( img );
	const mask = await subjectMask( img, w, h, alphaMap );
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
 * Subject segmentation alpha map (U2-Netp) for an image element: the quick
 * map for bounding boxes and the fallback of computeCutoutAlpha().
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
						version: window.WPIE?.version || '',
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
		const buf = await cachedRuntimeBuffer(
			ortBase() + ORT_WASM_FILE,
			window.WPIE?.version || ''
		);
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
	return { alpha, size: SIZE, min, max };
}

/**
 * The subject of a live view, look after look (ml.subjectWatch, API 2.26).
 *
 * computeSubjectAlpha() starts a worker, loads the model, answers once and
 * ends: right for one picture, wasteful for a camera, where the next look
 * follows the last. This keeps one worker with its loaded model until
 * close(). Looks wait for each other, the runtime runs one at a time.
 *
 * @return {{look: Function, close: Function}} `look( source )` resolves to
 *         `{ w, h, subject: Uint8Array, top }` (subject-model.js
 *         subjectAnswer); `close()` ends the worker and frees the model.
 */
export function watchSubject() {
	assertLocalRuntime();
	let worker = null;
	let closed = false;
	let abort = null;
	let queue = Promise.resolve();

	const drop = () => {
		if ( worker ) {
			worker.terminate();
			worker = null;
		}
	};

	const ask = ( bitmap ) =>
		new Promise( ( resolve, reject ) => {
			if ( ! worker ) {
				// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
				worker = new Worker(
					new URL( './removebg.worker.js', import.meta.url )
				);
			}
			const w = worker;
			const done = ( fn, value ) => {
				window.clearTimeout( timeout );
				abort = null;
				fn( value );
			};
			const timeout = window.setTimeout( () => {
				drop();
				done( reject, new Error( 'subject look timed out' ) );
			}, 120000 );
			// close() during a look: the worker is gone, so nothing would
			// ever answer and the caller would wait out the timeout.
			abort = () =>
				done( reject, new Error( 'subject watch is closed' ) );
			w.onmessage = ( event ) => {
				if ( event.data.error ) {
					drop();
					done( reject, new Error( event.data.error ) );
				} else {
					done( resolve, event.data );
				}
			};
			w.onerror = ( err ) => {
				drop();
				done( reject, new Error( err.message || 'worker failed' ) );
			};
			w.postMessage(
				{
					bitmap,
					wasmPath: ortBase(),
					modelUrl: assetUrl( 'assets/models/u2netp.onnx' ),
					version: window.WPIE?.version || '',
				},
				[ bitmap ]
			);
		} );

	const look = ( source ) => {
		const run = queue.then( async () => {
			if ( closed ) {
				throw new Error( 'subject watch is closed' );
			}
			const src =
				'string' === typeof source ? await loadImage( source ) : source;
			// A bitmap on both paths: it takes every kind of source (an
			// image, a video's current frame, a canvas, ImageData, a Blob).
			const bitmap = await window.createImageBitmap( src );
			if ( closed ) {
				bitmap.close();
				throw new Error( 'subject watch is closed' );
			}
			if ( ! supportsWorkers() ) {
				try {
					return subjectAnswer(
						await removeBgOnMainThread( bitmap )
					);
				} finally {
					bitmap.close();
				}
			}
			return subjectAnswer( await ask( bitmap ) );
		} );
		queue = run.catch( () => {} );
		return run;
	};

	return {
		look,
		close() {
			closed = true;
			drop();
			if ( abort ) {
				abort();
			}
		},
	};
}

/**
 * The subject of one picture as one grayscale channel (ml.subjectMap,
 * API 2.26): watchSubject() for a single look.
 *
 * @param {string|HTMLImageElement|HTMLVideoElement|HTMLCanvasElement|ImageData|Blob} source Picture.
 * @return {Promise<{w: number, h: number, subject: Uint8Array, top: number}>} Map.
 */
export async function subjectMap( source ) {
	const eye = watchSubject();
	try {
		return await eye.look( source );
	} finally {
		eye.close();
	}
}

/* ------------------------------- upscale -------------------------------- */

/**
 * Largest picture the AI upscaler takes (20.10.2026). Real-ESRGAN costs
 * about a minute per megapixel on one browser thread (measured on the
 * plugin's runtime); beyond this the plain Lanczos path answers at once.
 */
export const AI_UPSCALE_MAX_PIXELS = 1500000;

/**
 * Real-ESRGAN in its worker (esrgan.worker.js), tile by tile.
 *
 * @param {Uint8ClampedArray} rgba   Pixels.
 * @param {number}            w      Width.
 * @param {number}            h      Height.
 * @param {number}            factor 2 | 4.
 * @param {Object}            opts   Options.
 * @param {Function}          opts.onProgress ( done, total ) per tile.
 * @param {AbortSignal}       opts.signal     Stops the run.
 * @return {Promise<{data: Uint8ClampedArray, width: number, height: number}>} Result.
 */
function upscaleWithModel( rgba, w, h, factor, { onProgress, signal } = {} ) {
	return new Promise( ( resolve, reject ) => {
		// Literal `new Worker( new URL( … ) )`, see psd-worker-client.js.
		const worker = new Worker(
			new URL( './esrgan.worker.js', import.meta.url )
		);
		const stop = () => {
			worker.terminate();
			const err = new Error(
				__( 'Upscale was canceled.', 'wunderpaint' )
			);
			err.canceled = true;
			reject( err );
		};
		if ( signal?.aborted ) {
			stop();
			return;
		}
		signal?.addEventListener( 'abort', stop, { once: true } );
		worker.onmessage = ( event ) => {
			if ( event.data.progress ) {
				onProgress?.( ...event.data.progress );
				return;
			}
			signal?.removeEventListener( 'abort', stop );
			worker.terminate();
			if ( event.data.error ) {
				reject( new Error( event.data.error ) );
			} else {
				resolve( event.data );
			}
		};
		worker.onerror = ( err ) => {
			signal?.removeEventListener( 'abort', stop );
			worker.terminate();
			reject( new Error( err.message || 'worker failed' ) );
		};
		const copy = new Uint8ClampedArray( rgba );
		worker.postMessage(
			{
				data: copy,
				width: w,
				height: h,
				factor,
				wasmPath: ortBase(),
				modelUrl: assetUrl( 'assets/models/realesr-general-x4v3.onnx' ),
				version: window.WPIE?.version || '',
			},
			[ copy.buffer ]
		);
	} );
}

/**
 * Upscale (2x / 4x) locally: Real-ESRGAN up to AI_UPSCALE_MAX_PIXELS, which
 * draws real detail instead of only enlarging, Lanczos above that or where
 * workers are missing. Nothing leaves the browser either way.
 *
 * @param {string} imageUrl Source data URL.
 * @param {number} factor   2 | 4.
 * @param {Object} opts     { onProgress( done, total ), signal }, passed on to
 *                          the model run.
 * @return {Promise<{url: string, width: number, height: number, ai: boolean}>} Result.
 */
export async function upscaleLocal( imageUrl, factor = 2, opts = {} ) {
	const img = await loadImage( imageUrl );
	const w = img.naturalWidth;
	const h = img.naturalHeight;
	const source = createCanvas( w, h );
	source.getContext( '2d' ).drawImage( img, 0, 0 );
	const rgba = source.getContext( '2d' ).getImageData( 0, 0, w, h ).data;

	let result = null;
	let ai = false;
	if ( supportsWorkers() && w * h <= AI_UPSCALE_MAX_PIXELS ) {
		try {
			result = await upscaleWithModel( rgba, w, h, factor, opts );
			ai = true;
		} catch ( err ) {
			if ( err.canceled ) {
				throw err;
			}
			// The model could not run (old browser, memory): Lanczos below.
			result = null;
		}
	}
	if ( ! result && supportsWorkers() ) {
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
	} else if ( ! result ) {
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
		ai,
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
