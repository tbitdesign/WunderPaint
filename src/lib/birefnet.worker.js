/**
 * Better cutouts (20.10.2026): BiRefNet lite at 512 px (subject-model.js) on
 * the plugin's own ONNX runtime, in a worker.
 *
 * Protocol: postMessage({ bitmap, wasmPath, modelUrl, version })
 *           -> { alpha: Float32Array( 512 * 512 ), size: 512 } | { error }
 * The session stays loaded while the worker lives; the client ends the
 * worker after a quiet minute, which gives the memory back.
 */

import { cachedRuntimeBuffer, ORT_WASM_FILE } from './ml-cache';
import { CUTOUT_SIZE, cutoutInput } from './subject-model';

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

self.onmessage = async ( event ) => {
	const { bitmap, wasmPath, modelUrl, version } = event.data;
	try {
		const { ort, session } = await getSession(
			wasmPath,
			modelUrl,
			version || ''
		);
		const size = CUTOUT_SIZE;
		const canvas = new OffscreenCanvas( size, size );
		const ctx = canvas.getContext( '2d' );
		// A smooth reduction, as the measurements were made with.
		ctx.imageSmoothingQuality = 'high';
		ctx.drawImage( bitmap, 0, 0, size, size );
		bitmap.close?.();
		const { data } = ctx.getImageData( 0, 0, size, size );
		const res = await session.run( {
			input_image: new ort.Tensor( 'float32', cutoutInput( data, size ), [
				1,
				3,
				size,
				size,
			] ),
		} );
		const alpha = new Float32Array( res.mask.data );
		self.postMessage( { alpha, size }, [ alpha.buffer ] );
	} catch ( err ) {
		self.postMessage( { error: err?.message || String( err ) } );
	}
};
