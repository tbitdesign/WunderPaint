/**
 * AI upscale (20.10.2026): Real-ESRGAN general x4v3, bundled in
 * assets/models/, on the plugin's own ONNX runtime, inside a Web Worker.
 *
 * Protocol: postMessage({ data, width, height, factor, wasmPath, modelUrl,
 *           version }) -> { progress: [ done, total ] } (per tile) ...
 *           -> { data, width, height } | { error }
 *
 * The model works on colour only; the alpha channel is enlarged with the
 * Lanczos filter the plain upscale uses. 2x is the 4x result averaged down
 * by half, which keeps the model's detail and costs the same.
 */

import { cachedRuntimeBuffer, ORT_WASM_FILE } from './ml-cache';
import { halve, upscaleTiles, SCALE } from './esrgan-tiles';
// upscale.worker.js installs its own onmessage when it is evaluated inside
// a worker; imports run first, so the handler below replaces it.
import { lanczosResize } from './upscale.worker';

let sessionPromise = null;

async function getSession( wasmPath, modelUrl, version ) {
	if ( ! sessionPromise ) {
		sessionPromise = ( async () => {
			const ort = await import(
				/* webpackChunkName: "ort" */ 'onnxruntime-web'
			);
			ort.env.wasm.wasmPaths = wasmPath;
			// Single-threaded: no SharedArrayBuffer requirement in wp-admin.
			ort.env.wasm.numThreads = 1;
			try {
				const buf = await cachedRuntimeBuffer(
					wasmPath + ORT_WASM_FILE,
					version
				);
				if ( buf ) {
					ort.env.wasm.wasmBinary = buf;
				}
			} catch ( e ) {}
			const session = await ort.InferenceSession.create( modelUrl, {
				executionProviders: [ 'wasm' ],
			} );
			return { ort, session };
		} )().catch( ( e ) => {
			sessionPromise = null;
			throw e;
		} );
	}
	return sessionPromise;
}

/** Whether any pixel is not fully opaque. */
function hasAlpha( rgba ) {
	for ( let i = 3; i < rgba.length; i += 4 ) {
		if ( rgba[ i ] < 255 ) {
			return true;
		}
	}
	return false;
}

self.onmessage = async ( event ) => {
	const { data, width, height, factor, wasmPath, modelUrl, version } =
		event.data;
	try {
		const { ort, session } = await getSession(
			wasmPath,
			modelUrl,
			version || ''
		);
		const runner = async ( input, pw, ph ) => {
			const res = await session.run( {
				[ session.inputNames[ 0 ] ]: new ort.Tensor( 'float32', input, [
					1,
					3,
					ph,
					pw,
				] ),
			} );
			return res[ session.outputNames[ 0 ] ].data;
		};
		let out = await upscaleTiles( data, width, height, runner, {
			onTile: ( done, total ) =>
				self.postMessage( { progress: [ done, total ] } ),
		} );
		let ow = width * SCALE,
			oh = height * SCALE;
		if ( 2 === factor ) {
			out = halve( out, ow, oh );
			ow /= 2;
			oh /= 2;
		}
		if ( hasAlpha( data ) ) {
			const alpha = lanczosResize( data, width, height, ow, oh );
			for ( let i = 3; i < out.length; i += 4 ) {
				out[ i ] = alpha[ i ];
			}
		}
		self.postMessage( { data: out, width: ow, height: oh }, [
			out.buffer,
		] );
	} catch ( err ) {
		self.postMessage( { error: err?.message || String( err ) } );
	}
};
