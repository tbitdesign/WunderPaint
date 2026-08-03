/**
 * Media Library Manager client (v1.189.0): thin wrappers around the
 * wpie/v1/media-library/* REST endpoints (listing, folder + tag CRUD, bulk
 * assign, bulk delete, smart folders) plus a fully client-side clustering
 * pass that groups the library's SigLIP vectors into folder suggestions.
 *
 * The vectors already exist for semantic search, so clustering costs no extra
 * model work: it reads the stored embeddings and groups them by cosine.
 */

import { request } from './api';
import { loadVectors, cosine } from './image-search';
import { dominantColorBuckets } from './image-colors';

/** Serialize only the meaningful filter params into a query string. */
function itemQuery( params = {} ) {
	const q = new URLSearchParams();
	const {
		folder,
		tag,
		search,
		missingAlt,
		unused,
		usage,
		mime,
		type,
		orient,
		size,
		color,
		author,
		month,
		orderby,
		order,
		ids,
		page,
		per,
	} = params;
	if ( author ) {
		q.set( 'author', String( author ) );
	}
	if ( month ) {
		q.set( 'month', String( month ) );
	}
	if ( folder ) {
		q.set( 'folder', String( folder ) );
	}
	if ( tag ) {
		q.set( 'tag', String( tag ) );
	}
	if ( search ) {
		q.set( 'q', search );
	}
	if ( missingAlt ) {
		q.set( 'missingAlt', '1' );
	}
	if ( unused ) {
		q.set( 'unused', '1' );
	}
	if ( usage ) {
		q.set( 'usage', usage );
	}
	if ( mime ) {
		q.set( 'mime', mime );
	}
	if ( type && 'images' !== type ) {
		q.set( 'type', type );
	}
	if ( orient ) {
		q.set( 'orient', orient );
	}
	if ( size ) {
		q.set( 'size', size );
	}
	if ( color ) {
		q.set( 'color', color );
	}
	if ( orderby ) {
		q.set( 'orderby', orderby );
	}
	if ( order ) {
		q.set( 'order', order );
	}
	if ( ids && ids.length ) {
		q.set( 'ids', ids.join( ',' ) );
	}
	q.set( 'page', String( page || 1 ) );
	q.set( 'per', String( per || 60 ) );
	return q.toString();
}

export const mediaLib = {
	/** A filtered, paged page of images. */
	items: ( params ) =>
		request( {
			path: `/media-library/items?${ itemQuery( params ) }`,
			method: 'GET',
		} ),

	folders: {
		list: () =>
			request( { path: '/media-library/folders', method: 'GET' } ),
		create: ( name, parent = 0 ) =>
			request( {
				path: '/media-library/folders',
				method: 'POST',
				data: { name, parent },
			} ),
		update: ( id, fields ) =>
			request( {
				path: `/media-library/folders/${ id }`,
				method: 'POST',
				data: fields,
			} ),
		remove: ( id ) =>
			request( {
				path: `/media-library/folders/${ id }`,
				method: 'DELETE',
			} ),
	},

	tags: {
		list: () => request( { path: '/media-library/tags', method: 'GET' } ),
		create: ( name ) =>
			request( {
				path: '/media-library/tags',
				method: 'POST',
				data: { name },
			} ),
		remove: ( id ) =>
			request( {
				path: `/media-library/tags/${ id }`,
				method: 'DELETE',
			} ),
	},

	/** Bulk folder move / tag add / tag remove. */
	assign: ( payload ) =>
		request( {
			path: '/media-library/assign',
			method: 'POST',
			data: payload,
		} ),

	/** Trash or permanently delete the given attachment ids. */
	remove: ( ids, force = false ) =>
		request( {
			path: '/media-library/delete',
			method: 'POST',
			data: { ids, force },
		} ),

	/** Backfill numeric sort meta for a batch; returns { done, remaining }. */
	backfill: ( per = 150 ) =>
		request( {
			path: '/media-library/backfill',
			method: 'POST',
			data: { per },
		} ),

	/** Images still missing dominant-color extraction. */
	colorPending: ( per = 12 ) =>
		request( {
			path: `/media-library/color-pending?per=${ per }`,
			method: 'GET',
		} ),

	/** Store browser-computed color buckets for one attachment. */
	saveColors: ( id, colors ) =>
		request( {
			path: `/media-library/colors/${ id }`,
			method: 'POST',
			data: { colors },
		} ),

	/** Regenerate thumbnails + metadata for the given attachment ids. */
	regenerate: ( ids ) =>
		request( {
			path: '/media-library/regenerate',
			method: 'POST',
			data: { ids },
		} ),

	/** Attachment ids whose file is missing on disk. */
	broken: () => request( { path: '/media-library/broken', method: 'GET' } ),

	smart: {
		list: () => request( { path: '/media-library/smart', method: 'GET' } ),
		create: ( item ) =>
			request( {
				path: '/media-library/smart',
				method: 'POST',
				data: item,
			} ),
		remove: ( id ) =>
			request( {
				path: `/media-library/smart/${ id }`,
				method: 'DELETE',
			} ),
	},
};

/**
 * Resolve tag names to term ids, creating any that do not exist yet. The
 * server returns the existing term on a duplicate name, so this is race safe.
 * Pass a shared `cache` (name -> id) across a batch to avoid repeat requests.
 *
 * @param {string[]}         names   Tag names.
 * @param {Map<string,number>} [cache] Optional lowercase-name -> id cache.
 * @return {Promise<number[]>} Term ids (deduped).
 */
export async function ensureTagIds( names, cache ) {
	const map = cache || new Map();
	const out = [];
	for ( const raw of names ) {
		const name = ( raw || '' ).trim();
		const key = name.toLowerCase();
		if ( ! name ) {
			continue;
		}
		if ( map.has( key ) ) {
			if ( ! out.includes( map.get( key ) ) ) {
				out.push( map.get( key ) );
			}
			continue;
		}
		try {
			const t = await mediaLib.tags.create( name );
			map.set( key, t.id );
			out.push( t.id );
		} catch ( e ) {
			// skip a tag we could not create
		}
	}
	return out;
}

/* ------------------------------ clustering ----------------------------- */

/** Unit-normalize a Float32Array in place-safe fashion. */
function normalize( v ) {
	let s = 0;
	for ( let i = 0; i < v.length; i++ ) {
		s += v[ i ] * v[ i ];
	}
	s = Math.sqrt( s ) || 1;
	return Float32Array.from( v, ( x ) => x / s );
}

/**
 * Greedy single-pass agglomerative clustering by cosine similarity. Each item
 * joins the nearest existing cluster whose centroid is within `threshold`,
 * otherwise it seeds a new cluster. Deterministic for a given input order
 * (loadVectors returns a stable id order), so no randomness is needed.
 *
 * @param {Array}  vectors [{ id, vec:Float32Array, thumb, url, title }].
 * @param {Object} [opts]  { threshold, minSize, maxClusters }.
 * @return {Array} [{ size, ids:number[], thumb }] largest first.
 */
export function clusterVectors( vectors, opts = {} ) {
	const threshold = opts.threshold ?? 0.58;
	const minSize = opts.minSize ?? 3;
	const maxClusters = opts.maxClusters ?? 30;
	const clusters = [];

	for ( const v of vectors ) {
		if ( ! v.vec || ! v.vec.length ) {
			continue;
		}
		let best = -1;
		let bestScore = threshold;
		for ( let c = 0; c < clusters.length; c++ ) {
			const s = cosine( v.vec, clusters[ c ].centroid );
			if ( s >= bestScore ) {
				bestScore = s;
				best = c;
			}
		}
		if ( best === -1 ) {
			if ( clusters.length >= maxClusters ) {
				continue; // keep clusters tight instead of exploding.
			}
			clusters.push( {
				sum: Float32Array.from( v.vec ),
				centroid: v.vec,
				items: [ v ],
			} );
		} else {
			const cl = clusters[ best ];
			for ( let i = 0; i < cl.sum.length; i++ ) {
				cl.sum[ i ] += v.vec[ i ];
			}
			cl.centroid = normalize( cl.sum );
			cl.items.push( v );
		}
	}

	return clusters
		.filter( ( c ) => c.items.length >= minSize )
		.sort( ( a, b ) => b.items.length - a.items.length )
		.map( ( c ) => ( {
			size: c.items.length,
			ids: c.items.map( ( x ) => x.id ),
			thumb: c.items[ 0 ].thumb || c.items[ 0 ].url || '',
		} ) );
}

/**
 * Extract dominant colors for every image that lacks them, in the browser
 * (canvas, no model). Loops batch by batch until the server reports none
 * pending or a safety cap is reached. `onTick` fires per processed image.
 */
export async function indexColors( onTick ) {
	for ( let guard = 0; guard < 400; guard++ ) {
		const batch = await mediaLib.colorPending( 12 );
		const items = batch.items || [];
		if ( ! items.length ) {
			break;
		}
		for ( const it of items ) {
			let colors = [];
			try {
				colors = await dominantColorBuckets( it.src );
			} catch ( e ) {
				colors = [];
			}

			await mediaLib.saveColors( it.id, colors ).catch( () => {} );
			if ( onTick ) {
				onTick();
			}
		}
	}
}

/** Load the stored SigLIP vectors and cluster them into folder suggestions. */
export async function clusterLibrary( opts = {} ) {
	const vectors = await loadVectors();
	return clusterVectors( vectors, opts );
}

/**
 * Ids of images most visually similar to the given one, best first (the image
 * itself excluded). Uses the stored SigLIP vectors, so it needs the image to
 * be indexed.
 *
 * @param {number} id      Reference attachment id.
 * @param {Object} [opts]  { limit = 60, minScore = 0.4 }.
 * @return {Promise<number[]>} Ranked attachment ids.
 */
export async function findSimilar( id, opts = {} ) {
	const limit = opts.limit || 60;
	const minScore = opts.minScore ?? 0.4;
	const vectors = await loadVectors();
	const base = vectors.find( ( v ) => v.id === id );
	if ( ! base ) {
		return [];
	}
	return vectors
		.filter( ( v ) => v.id !== id )
		.map( ( v ) => ( { id: v.id, score: cosine( base.vec, v.vec ) } ) )
		.filter( ( v ) => v.score >= minScore )
		.sort( ( a, b ) => b.score - a.score )
		.slice( 0, limit )
		.map( ( v ) => v.id );
}

/**
 * Near-duplicate groups: the same clustering at a very high cosine threshold,
 * so only visually (near) identical images land together. Returns groups of
 * two or more, largest first, each with full member info for review.
 */
export async function findDuplicates( opts = {} ) {
	const vectors = await loadVectors();
	const threshold = opts.threshold ?? 0.965;
	const clusters = clusterVectors( vectors, {
		threshold,
		minSize: 2,
		maxClusters: 4096,
	} );
	// clusterVectors returns ids only; re-attach thumbs from the vector store.
	const byId = new Map( vectors.map( ( v ) => [ v.id, v ] ) );
	return clusters.map( ( c ) => ( {
		size: c.size,
		items: c.ids.map( ( id ) => {
			const v = byId.get( id ) || {};
			return { id, thumb: v.thumb || v.url || '', title: v.title || '' };
		} ),
	} ) );
}
