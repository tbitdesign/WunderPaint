/**
 * Local ML runtime (v1.316). transformers.js is bundled by webpack (npm
 * import) and shares ONE CPU/SIMD onnxruntime-web build with the
 * background-removal path; that runtime's wasm ships in assets/ort/ (see
 * ortWasmBase). Models the admin downloaded live under uploads/wpie-models
 * (see class-ml-models.php). allowRemoteModels = false and wasmPaths point
 * at the plugin's own origin, so no library/wasm/model request ever leaves
 * the browser at run time — no CDN. CPU/WASM only (no WebGPU).
 */

import { __ } from '@wordpress/i18n';

import { logEvent } from './debug-log';

/**
 * Whether the local-AI CPU runtime is present. It normally ships in
 * assets/ort/, so a full install answers true; the slim wordpress.org review
 * build leaves it out and class-ml-models reports that as
 * window.WPIE.runtime.installed === false. An undefined value (older or
 * non-editor bootstrap) counts as available so nothing changes there.
 *
 * @return {boolean} True unless the bootstrap explicitly says the runtime is absent.
 */
export function localRuntimeAvailable() {
	return false !== window.WPIE?.runtime?.installed;
}

/**
 * Throw a single clear message when a local-AI feature is used in a build that
 * does not carry the runtime. Every local-AI entry point calls this before
 * touching the wasm, so the features fail as "not included" instead of a 404.
 *
 * @return {void}
 */
export function assertLocalRuntime() {
	if ( ! localRuntimeAvailable() ) {
		throw new Error(
			__(
				'Local AI is not included in this download. It is part of the full version of WunderPaint.',
				'wunderpaint'
			)
		);
	}
}

/**
 * Shared ONNX-runtime location (v1.316): transformers.js and the direct
 * background-removal path both use ONE bundled onnxruntime-web, whose
 * CPU/SIMD wasm ships in assets/ort/ (copied by tools/sync-ort.js). The
 * library itself is bundled by webpack (npm import) — nothing is fetched
 * from a CDN, which is what wordpress.org requires (Guideline 8).
 */
export function ortWasmBase() {
	const url = window.WPIE && window.WPIE.pluginUrl;
	return url ? url + 'assets/ort/' : '';
}

let tf = null;
let loading = null;

/** Base URL of the downloaded models (trailing slash), from the PHP bootstrap. */
export function modelsBaseUrl() {
	return ( window.WPIE && window.WPIE.mlModelsUrl ) || '';
}

/** Whether a feature's model has been downloaded to the server. */
export function isModelInstalled( id ) {
	return !! (
		window.WPIE &&
		window.WPIE.mlInstalled &&
		window.WPIE.mlInstalled[ id ]
	);
}

/**
 * Load transformers.js once, configured to read models locally.
 *
 * @return {Promise<Object>} The transformers.js module namespace.
 */
export async function loadTransformers() {
	if ( tf ) {
		return tf;
	}
	assertLocalRuntime();
	if ( ! loading ) {
		loading = ( async () => {
			// Bundled via webpack (lazy chunk) — no external script, no CDN.
			const mod = await import(
				/* webpackChunkName: "transformers" */ '@huggingface/transformers'
			);
			mod.env.allowLocalModels = true;
			mod.env.allowRemoteModels = false;
			mod.env.localModelPath = modelsBaseUrl();
			// Point the shared ONNX runtime at our bundled CPU wasm and stay
			// single-threaded (threads need SharedArrayBuffer/cross-origin
			// isolation, which WP admin pages do not set).
			if ( mod.env.backends?.onnx?.wasm ) {
				mod.env.backends.onnx.wasm.wasmPaths = ortWasmBase();
				mod.env.backends.onnx.wasm.numThreads = 1;
			}
			tf = mod;
			logEvent(
				'info',
				'ml',
				'transformers.js runtime loaded (bundled)',
				{}
			);
			return mod;
		} )();
	}
	return loading;
}

/**
 * Inference device (v1.316): CPU/WASM only. We ship a single CPU/SIMD
 * onnxruntime-web build, so there is no WebGPU path (it also broke Smart
 * Select and gave only marginal gains elsewhere). Kept as an exported
 * function because the Pro bridge and the status dialog read it.
 *
 * @return {string} Always 'wasm'.
 */
export function preferredDevice() {
	return 'wasm';
}

/**
 * Device for a specific model — CPU/WASM only (v1.316). Kept for callers
 * that pass a device (e.g. smart-select).
 *
 * @return {string} Always 'wasm'.
 */
export function deviceForModel() {
	return 'wasm';
}

/**
 * Run a model loader on the CPU/WASM device (v1.316). Kept for callers
 * (caption, image-search) that pass a `(device) => Promise` builder.
 *
 * @param {string}   id   Model id (unused; kept for signature stability).
 * @param {Function} load (device) => Promise. Loads with that device.
 * @return {Promise<*>} Whatever `load` resolves to.
 */

export async function loadWithFallback( id, load ) {
	return load( 'wasm' );
}

/**
 * Create a transformers.js pipeline with quantized weights on the CPU/WASM
 * device (v1.316).
 *
 * @param {string} task   Pipeline task id.
 * @param {string} model  Model repo id.
 * @param {Object} [opts] Extra pipeline options.
 * @return {Promise<Function>} The pipeline.
 */
export async function mlPipeline( task, model, opts = {} ) {
	const TF = await loadTransformers();
	return TF.pipeline( task, model, { dtype: 'q8', ...opts } );
}
