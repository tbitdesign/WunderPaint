/**
 * Local background removal (spec 11.1, the GUARANTEED keyless path):
 * U2-Netp segmentation via onnxruntime-web, running inside a Web Worker
 * with OffscreenCanvas. Assets (wasm + model) are plugin-local, no CDN.
 *
 * Protocol: postMessage({ bitmap, wasmPath, modelUrl }) →
 *           { alpha: Float32Array(320*320) } | { error }
 * Compositing back happens on the caller side (needs the original pixels).
 */

import { cachedRuntimeBuffer, ORT_WASM_FILE } from './ml-cache';

const SIZE = 320;
const MEAN = [ 0.485, 0.456, 0.406 ];
const STD = [ 0.229, 0.224, 0.225 ];

let sessionPromise = null;

async function getSession( wasmPath, modelUrl ) {
	if ( ! sessionPromise ) {
		sessionPromise = ( async () => {
			const ort = await import(
				/* webpackChunkName: "ort" */ 'onnxruntime-web'
			);
			ort.env.wasm.wasmPaths = wasmPath;
			// Single-threaded: no SharedArrayBuffer requirement in wp-admin.
			ort.env.wasm.numThreads = 1;
			// Serve the wasm from the Cache API (v1.298.1 pattern) so
			// revisits never re-download it; ORT fetches it itself when
			// this returns null.
			try {
				const buf = await cachedRuntimeBuffer(
					wasmPath + ORT_WASM_FILE
				);
				if ( buf ) {
					ort.env.wasm.wasmBinary = buf;
				}
			} catch ( e ) {}
			const session = await ort.InferenceSession.create( modelUrl, {
				executionProviders: [ 'wasm' ],
			} );
			return { ort, session };
		} )();
	}
	return sessionPromise;
}

self.onmessage = async ( event ) => {
	const { bitmap, wasmPath, modelUrl } = event.data;
	try {
		const { ort, session } = await getSession( wasmPath, modelUrl );

		// Preprocess: draw to 320×320, normalize CHW float32.
		const canvas = new OffscreenCanvas( SIZE, SIZE );
		const ctx = canvas.getContext( '2d' );
		ctx.drawImage( bitmap, 0, 0, SIZE, SIZE );
		const { data } = ctx.getImageData( 0, 0, SIZE, SIZE );
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
		const output = results[ session.outputNames[ 0 ] ].data; // d0: 1×1×320×320

		// Min-max normalize to a clean 0..1 alpha map.
		let min = Infinity;
		let max = -Infinity;
		for ( let i = 0; i < output.length; i++ ) {
			if ( output[ i ] < min ) {
				min = output[ i ];
			}
			if ( output[ i ] > max ) {
				max = output[ i ];
			}
		}
		const range = max - min || 1;
		const alpha = new Float32Array( SIZE * SIZE );
		for ( let i = 0; i < alpha.length; i++ ) {
			alpha[ i ] = ( output[ i ] - min ) / range;
		}

		self.postMessage( { alpha, size: SIZE }, [ alpha.buffer ] );
	} catch ( err ) {
		self.postMessage( { error: err?.message || String( err ) } );
	}
};
