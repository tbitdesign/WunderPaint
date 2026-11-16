/**
 * Object removal with MI-GAN (20.10.2026).
 *
 * The keyless Remove Object used to fill the selection inward from its edge
 * by averaging neighbours: fine on a plain wall, a smear on anything with
 * structure. With the Object removal model downloaded (Settings, Local AI
 * models: MI-GAN, MIT) it now paints in what should be there. The official
 * ONNX pipeline crops around the hole, works at 512 px and blends back, so
 * a removal takes about 1.4 s on one browser thread whatever the picture
 * size. Without the model the old fill stays the answer.
 *
 * The hole is grown by a few pixels first: a selection drawn along an
 * object leaves its outline behind otherwise, and MI-GAN would carry that
 * fringe into the new background.
 */

import { isModelInstalled, modelsBaseUrl, ortWasmBase } from './ml';

export const MIGAN_MODEL = 'andraniksargsyan/migan/migan_pipeline_v2.onnx';

/**
 * How far to grow the hole: a little more on larger pictures.
 *
 * @param {number} w Width.
 * @param {number} h Height.
 * @return {number} Radius in pixels, 3 .. 12.
 */
export function removalRadius( w, h ) {
	return Math.max( 3, Math.min( 12, Math.round( Math.min( w, h ) / 200 ) ) );
}

/**
 * Grow a hole mask (1 = remove) by r pixels: a square dilation done as two
 * passes of running counts, so it costs the same for any radius.
 *
 * @param {Uint8Array} mask Hole, w * h.
 * @param {number}     w    Width.
 * @param {number}     h    Height.
 * @param {number}     r    Radius.
 * @return {Uint8Array} Grown hole.
 */
export function dilateMask( mask, w, h, r ) {
	const tmp = new Uint8Array( w * h );
	for ( let y = 0; y < h; y++ ) {
		const row = y * w;
		let count = 0;
		for ( let x = 0; x <= Math.min( r, w - 1 ); x++ ) {
			count += mask[ row + x ] ? 1 : 0;
		}
		for ( let x = 0; x < w; x++ ) {
			tmp[ row + x ] = count > 0 ? 1 : 0;
			const add = x + r + 1;
			if ( add < w && mask[ row + add ] ) {
				count++;
			}
			const drop = x - r;
			if ( drop >= 0 && mask[ row + drop ] ) {
				count--;
			}
		}
	}
	const out = new Uint8Array( w * h );
	for ( let x = 0; x < w; x++ ) {
		let count = 0;
		for ( let y = 0; y <= Math.min( r, h - 1 ); y++ ) {
			count += tmp[ y * w + x ];
		}
		for ( let y = 0; y < h; y++ ) {
			out[ y * w + x ] = count > 0 ? 1 : 0;
			const add = y + r + 1;
			if ( add < h ) {
				count += tmp[ add * w + x ];
			}
			const drop = y - r;
			if ( drop >= 0 ) {
				count -= tmp[ drop * w + x ];
			}
		}
	}
	return out;
}

/**
 * The model's inputs: planar RGB and a mask that is 255 where the picture
 * stays and 0 where it is rebuilt.
 *
 * @param {Uint8ClampedArray} rgba Picture, w * h * 4.
 * @param {Uint8Array}        hole 1 = remove, w * h.
 * @return {{image: Uint8Array, mask: Uint8Array}} Model inputs.
 */
export function miganInputs( rgba, hole ) {
	const n = hole.length;
	const image = new Uint8Array( 3 * n );
	const mask = new Uint8Array( n );
	for ( let i = 0, j = 0; i < n; i++, j += 4 ) {
		image[ i ] = rgba[ j ];
		image[ n + i ] = rgba[ j + 1 ];
		image[ 2 * n + i ] = rgba[ j + 2 ];
		mask[ i ] = hole[ i ] ? 0 : 255;
	}
	return { image, mask };
}

/**
 * The model's planar RGB back into the picture; alpha and every pixel
 * outside the hole stay exactly as they were.
 *
 * @param {Uint8ClampedArray} rgba   Picture, changed in place.
 * @param {Uint8Array}        result Model output, 3 * n.
 * @param {Uint8Array}        hole   1 = rebuilt, n.
 * @return {Uint8ClampedArray} The same picture.
 */
export function applyMiganResult( rgba, result, hole ) {
	const n = hole.length;
	for ( let i = 0, j = 0; i < n; i++, j += 4 ) {
		if ( hole[ i ] ) {
			rgba[ j ] = result[ i ];
			rgba[ j + 1 ] = result[ n + i ];
			rgba[ j + 2 ] = result[ 2 * n + i ];
		}
	}
	return rgba;
}

/** Whether the MI-GAN path can run here. */
export function canRemoveWithModel() {
	return isModelInstalled( 'object-removal' ) && 'function' === typeof Worker;
}

/**
 * Rebuild the hole with MI-GAN in its worker.
 *
 * @param {Uint8ClampedArray} rgba Picture, w * h * 4 (not changed).
 * @param {number}            w    Width.
 * @param {number}            h    Height.
 * @param {Uint8Array}        hole 1 = remove (already grown).
 * @return {Promise<Uint8ClampedArray>} The picture with the hole rebuilt.
 */
export async function removeWithModel( rgba, w, h, hole ) {
	const version = window.WPIE?.version || '';
	const { image, mask } = miganInputs( rgba, hole );
	// The worker spawn lives in its own module (import.meta, webpack only),
	// loaded on demand like inpaint-worker-client.js.
	const { runMiganWorker } = await import( './migan-worker-client' );
	const result = await runMiganWorker( {
		image,
		mask,
		width: w,
		height: h,
		wasmPath: ortWasmBase(),
		modelUrl: modelsBaseUrl() + MIGAN_MODEL,
		version,
	} );
	return applyMiganResult( new Uint8ClampedArray( rgba ), result, hole );
}
