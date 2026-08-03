/**
 * Semantic image search (v1.131.0): SigLIP dual encoder, fully local.
 * Every media-library image gets ONE 768-dim embedding (computed in the
 * browser from its medium thumbnail, stored as attachment meta via
 * REST). A search query embeds the TEXT and ranks the stored vectors by
 * cosine - finding images that have no useful filename, alt text or
 * tags. Headless-proven on transformers.js 3.8.1 before wiring
 * (3 queries x 3 images ranked correctly).
 *
 * Model: Xenova/siglip-base-patch16-224 (Apache-2.0), self-hosted via
 * the models mirror like every other local model. Nothing leaves the
 * browser except the finished 1 KB vector.
 */

import { loadTransformers, isModelInstalled, loadWithFallback } from './ml';
import { request } from './api';
import { logEvent } from './debug-log';
import { dominantColorBuckets } from './image-colors';

const MODEL = 'Xenova/siglip-base-patch16-224';
let modelsReady = null;

/** Lazy-load tokenizer + both encoders (q8, WASM). */
function ensureModels() {
	if ( ! modelsReady ) {
		modelsReady = ( async () => {
			const TF = await loadTransformers();
			// Both encoders share one device with a joint WASM fallback, so
			// they never split across backends.
			const [ tokenizer, processor, [ textModel, visionModel ] ] =
				await Promise.all( [
					TF.AutoTokenizer.from_pretrained( MODEL ),
					TF.AutoProcessor.from_pretrained( MODEL ),
					loadWithFallback( 'image-search', ( device ) =>
						Promise.all( [
							TF.SiglipTextModel.from_pretrained( MODEL, {
								dtype: 'q8',
								device,
							} ),
							TF.SiglipVisionModel.from_pretrained( MODEL, {
								dtype: 'q8',
								device,
							} ),
						] )
					),
				] );
			return { TF, tokenizer, textModel, processor, visionModel };
		} )();
		modelsReady.catch( () => {
			modelsReady = null; // allow a retry after a failed load
		} );
	}
	return modelsReady;
}

export const searchModelInstalled = () => isModelInstalled( 'image-search' );

/** Store one image's freshly computed vector (used right after an upload). */
export async function saveVector( id, vec ) {
	await request( {
		path: `/search-index/${ id }`,
		method: 'POST',
		data: { vec: packVector( vec ) },
	} );
}

const normalize = ( v ) => {
	let s = 0;
	for ( let i = 0; i < v.length; i++ ) {
		s += v[ i ] * v[ i ];
	}
	s = Math.sqrt( s ) || 1;
	return Float32Array.from( v, ( x ) => x / s );
};

/** Embed an image URL (same-origin thumbnail) into a unit vector. */
export async function embedImageUrl( url ) {
	const { TF, processor, visionModel } = await ensureModels();
	const image = await TF.RawImage.read( url );
	const inputs = await processor( image );
	const out = await visionModel( inputs );
	return normalize( out.pooler_output.data );
}

/** Embed a search query into a unit vector. */
export async function embedText( query ) {
	const { tokenizer, textModel } = await ensureModels();
	// SigLIP is trained on max_length-padded sequences; without the
	// padding the scores collapse.
	const inputs = tokenizer( [ query ], {
		padding: 'max_length',
		truncation: true,
	} );
	const out = await textModel( inputs );
	return normalize( out.pooler_output.data );
}

/* ------------------------- vector (de)quantization --------------------- */

/** Unit-vector Float32 → base64 int8 (~1 KB), lossy but ranking-safe. */
export function packVector( vec ) {
	let max = 1e-6;
	for ( let i = 0; i < vec.length; i++ ) {
		max = Math.max( max, Math.abs( vec[ i ] ) );
	}
	const scale = 127 / max;
	const bytes = new Uint8Array( vec.length );
	for ( let i = 0; i < vec.length; i++ ) {
		bytes[ i ] = Math.round( vec[ i ] * scale ) & 0xff;
	}
	let bin = '';
	for ( let i = 0; i < bytes.length; i += 4096 ) {
		bin += String.fromCharCode( ...bytes.subarray( i, i + 4096 ) );
	}
	return window.btoa( bin );
}

/**
 * base64 int8 → UNIT Float32Array. Renormalizing here makes the packed
 * scale irrelevant, so the plain dot product below IS the cosine.
 */
export function unpackVector( b64 ) {
	let bin = '';
	try {
		bin = window.atob( b64 );
	} catch ( e ) {
		return null;
	}
	if ( bin.length < 2 ) {
		return null;
	}
	const out = new Float32Array( bin.length );
	let sum = 0;
	for ( let i = 0; i < bin.length; i++ ) {
		let v = bin.charCodeAt( i );
		if ( v > 127 ) {
			v -= 256;
		}
		out[ i ] = v;
		sum += v * v;
	}
	const norm = Math.sqrt( sum ) || 1;
	for ( let i = 0; i < out.length; i++ ) {
		out[ i ] /= norm;
	}
	return out;
}

export const cosine = ( a, b ) => {
	let s = 0;
	const n = Math.min( a.length, b.length );
	for ( let i = 0; i < n; i++ ) {
		s += a[ i ] * b[ i ];
	}
	return s;
};

/* ------------------------------ index store ---------------------------- */

let vectorCache = null; // [{ id, vec: Float32Array, thumb, url, title }]

/** Load (and cache) every stored vector with its render info. */
export async function loadVectors( force = false ) {
	if ( vectorCache && ! force ) {
		return vectorCache;
	}
	const all = [];
	let page = 1;
	let pages = 1;
	do {
		const res = await request( {
			path: `/search-index/vectors?page=${ page }`,
			method: 'GET',
		} );
		pages = res.pages || 1;
		for ( const item of res.items || [] ) {
			const vec = unpackVector( item.vec );
			if ( vec ) {
				all.push( { ...item, vec } );
			}
		}
		page++;
	} while ( page <= pages );
	vectorCache = all;
	return all;
}

export const invalidateVectorCache = () => {
	vectorCache = null;
};

/**
 * Rank the indexed media library against a text query.
 *
 * @param {string} query   Free-text description.
 * @param {Object} [opts]  { limit = 12, minScore = 0.03 }.
 * @return {Promise<Array>} [{ id, thumb, url, title, score }] best first.
 */
export async function searchMediaLibrary( query, opts = {} ) {
	const limit = opts.limit || 12;
	const minScore = opts.minScore ?? 0.03;
	const [ qv, vectors ] = await Promise.all( [
		embedText( query ),
		loadVectors(),
	] );
	return vectors
		.map( ( v ) => ( { ...v, score: cosine( qv, v.vec ) } ) )
		.filter( ( v ) => v.score >= minScore )
		.sort( ( a, b ) => b.score - a.score )
		.slice( 0, limit );
}

/* ------------------------------- indexer ------------------------------- */

let indexerState = { running: false, done: 0, total: 0 };
const listeners = new Set();

const notify = () => listeners.forEach( ( fn ) => fn( { ...indexerState } ) );

/** Subscribe to indexer progress; returns an unsubscribe function. */
export function subscribeIndexer( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}

export const indexerStatus = () => ( { ...indexerState } );

/** Pending/total counts from the server (cheap, no model needed). */
export const fetchIndexStatus = () =>
	request( { path: '/search-index/pending?per=1', method: 'GET' } );

/**
 * Index every pending image, one at a time (the editor stays usable).
 * Safe to call twice - a running indexer is reused.
 */
export async function runIndexer() {
	// Demo installs index nothing: the store is read-only there and the
	// demo library ships pre-indexed, so a run would only burn CPU on
	// embeddings the server then refuses (v1.307).
	if (
		indexerState.running ||
		! searchModelInstalled() ||
		window.WPIE?.demo
	) {
		return;
	}
	indexerState = { running: true, done: 0, total: 0 };
	notify();
	logEvent( 'info', 'search', 'Indexer started' );
	try {
		for (;;) {
			const batch = await request( {
				path: '/search-index/pending?per=8',
				method: 'GET',
			} );
			if ( ! indexerState.total ) {
				indexerState.total = batch.pending || 0;
			}
			if ( ! batch.items?.length ) {
				break;
			}
			for ( const item of batch.items ) {
				try {
					const vec = await embedImageUrl( item.src );
					let colors = [];
					try {
						colors = await dominantColorBuckets( item.src );
					} catch ( ce ) {
						colors = [];
					}
					await request( {
						path: `/search-index/${ item.id }`,
						method: 'POST',
						data: { vec: packVector( vec ), colors },
					} );
				} catch ( e ) {
					// Broken image: tombstone so the queue can drain.
					await request( {
						path: `/search-index/${ item.id }`,
						method: 'POST',
						data: { vec: '' },
					} ).catch( () => {} );
				}
				indexerState.done++;
				notify();
				// Yield between images so painting stays smooth.
				await new Promise( ( r ) => setTimeout( r, 50 ) );
			}
		}
		invalidateVectorCache();
		logEvent(
			'info',
			'search',
			`Indexer finished: ${ indexerState.done } images embedded`
		);
	} finally {
		indexerState.running = false;
		notify();
	}
}
