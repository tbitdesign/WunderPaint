/**
 * Local word salience (E3 of the dynamic-layouts design): a multilingual
 * sentence-embedding model (MiniLM via the self-hosted transformers.js
 * runtime, downloaded once through Settings → AI Models) scores how much
 * each word carries the meaning of the whole text. The layout generator
 * uses these scores to accent the IMPORTANT word ("SALE", the price, the
 * date) instead of merely the longest one — free, offline, private. When
 * the model is not installed everything falls back to the heuristics.
 */

import { mlPipeline, isModelInstalled } from './ml';

const MODEL = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let pipePromise = null;

async function defaultEmbed( texts ) {
	if ( ! pipePromise ) {
		pipePromise = mlPipeline( 'feature-extraction', MODEL );
	}
	const pipe = await pipePromise;
	const out = [];
	for ( const t of texts ) {
		const r = await pipe( t, { pooling: 'mean', normalize: true } );
		out.push( Array.from( r.data ) );
	}
	return out;
}

/** Whether the salience model has been downloaded to the server. */
export const salienceAvailable = () => isModelInstalled( 'salience' );

/** Cosine similarity of two normalized vectors. */
export const cosine = ( a, b ) =>
	a.reduce( ( acc, v, i ) => acc + v * b[ i ], 0 );

// A word key: lowercased, punctuation-stripped (keeps digits/%/€).
export const salienceKey = ( w ) =>
	w.toLowerCase().replace( /^[^\p{L}\p{N}%€$£]+|[^\p{L}\p{N}%€$£]+$/gu, '' );

/**
 * Score every unique word of the text by semantic closeness to the whole
 * text (min-max normalized to 0..1).
 *
 * @param {string} text Full source text.
 * @param {Object} opts { embed } — injectable embedder for tests.
 * @return {Promise<?Map>} Map salienceKey → score, or null (model missing).
 */
export async function wordSalience( text, opts = {} ) {
	const embed = opts.embed || ( salienceAvailable() ? defaultEmbed : null );
	if ( ! embed ) {
		return null;
	}
	const keys = Array.from(
		new Set(
			String( text || '' )
				.split( /\s+/ )
				.map( salienceKey )
				.filter( ( w ) => w.length >= 2 )
		)
	);
	if ( keys.length < 2 ) {
		return null;
	}
	const vecs = await embed( [ text, ...keys ] );
	const doc = vecs[ 0 ];
	const raw = keys.map( ( k, i ) => cosine( doc, vecs[ i + 1 ] ) );
	const lo = Math.min( ...raw );
	const hi = Math.max( ...raw );
	const span = hi - lo || 1;
	const map = new Map();
	keys.forEach( ( k, i ) => map.set( k, ( raw[ i ] - lo ) / span ) );
	return map;
}

/**
 * The most salient word of a line: `{ index, score }` among its words, or
 * `{ index: -1, score: -1 }` when the line has fewer than two words or no
 * scored word.
 *
 * @param {string} lineText Display line.
 * @param {?Map}   salience Map from wordSalience().
 * @return {{index: number, score: number}} Best word.
 */
export function salientWord( lineText, salience ) {
	const none = { index: -1, score: -1 };
	if ( ! salience ) {
		return none;
	}
	const ws = String( lineText || '' )
		.split( /\s+/ )
		.filter( Boolean );
	if ( ws.length < 2 ) {
		return none;
	}
	let best = -1;
	let bestScore = -1;
	ws.forEach( ( w, i ) => {
		const score = salience.get( salienceKey( w ) );
		if (
			undefined !== score &&
			( score > bestScore ||
				( score === bestScore &&
					best >= 0 &&
					w.length > ws[ best ].length ) )
		) {
			best = i;
			bestScore = score;
		}
	} );
	return best >= 0 ? { index: best, score: bestScore } : none;
}

/** Index-only convenience wrapper around salientWord(). */
export const salientWordIndex = ( lineText, salience ) =>
	salientWord( lineText, salience ).index;
