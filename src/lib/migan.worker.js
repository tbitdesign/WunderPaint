/**
 * Object removal (20.10.2026): the MI-GAN ONNX pipeline (downloaded under
 * Settings, Local AI models) on the plugin's own ONNX runtime, in a worker.
 *
 * Protocol: postMessage({ image, mask, width, height, wasmPath, modelUrl,
 *           version }) -> { result: Uint8Array( 3 * w * h ) } | { error }
 * image is planar RGB, mask 255 = keep, 0 = rebuild (object-removal.js).
 */

import { cachedRuntimeBuffer, ORT_WASM_FILE } from './ml-cache';

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
	const { image, mask, width, height, wasmPath, modelUrl, version } =
		event.data;
	try {
		const { ort, session } = await getSession(
			wasmPath,
			modelUrl,
			version || ''
		);
		const res = await session.run( {
			image: new ort.Tensor( 'uint8', image, [ 1, 3, height, width ] ),
			mask: new ort.Tensor( 'uint8', mask, [ 1, 1, height, width ] ),
		} );
		const result = new Uint8Array( res[ session.outputNames[ 0 ] ].data );
		self.postMessage( { result }, [ result.buffer ] );
	} catch ( err ) {
		self.postMessage( { error: err?.message || String( err ) } );
	}
};
