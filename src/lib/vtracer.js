/**
 * VTracer bridge (v1.124): full-color raster→SVG tracing via the
 * visioncortex VTracer WASM build (MIT, 137 KB, self-hosted as a webpack
 * asset - no CDN). Replaces imagetracerjs as the Vectorize engine; the
 * old tracer stays as a fallback when WASM cannot load.
 *
 * LEAF MODULE: uses `new URL( …, import.meta.url )`, so it must only be
 * reached through dynamic import (Jest never parses it, see the
 * import.meta gotcha in tools notes).
 */

import { vtracerConfig } from './vtracer-config';

let ready = null;
let mod = null;

async function ensure() {
	if ( ! ready ) {
		ready = ( async () => {
			mod = await import(
				/* webpackChunkName: "vtracer" */ 'vtracer-wasm'
			);
			await mod.default( {
				module_or_path: new URL(
					'vtracer-wasm/vtracer.wasm',
					import.meta.url
				),
			} );
		} )();
	}
	return ready;
}

/**
 * Trace RGBA image data into an SVG string.
 *
 * @param {ImageData} imageData Canvas image data.
 * @param {Object}    [opts]    VTracer overrides in CLI units (camelCase).
 * @return {Promise<string>} SVG markup.
 */
export async function traceImageData( imageData, opts = {} ) {
	await ensure();
	// All unit conversions (degrees to radians etc.) live in
	// vtracer-config.js - the wasm wrapper takes CORE units, and feeding
	// it CLI values turned rectangles into trapezoids (v1.128.0).
	return mod.to_svg(
		new Uint8Array(
			imageData.data.buffer,
			imageData.data.byteOffset,
			imageData.data.byteLength
		),
		imageData.width,
		imageData.height,
		vtracerConfig( opts )
	);
}
