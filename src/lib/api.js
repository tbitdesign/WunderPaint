/**
 * REST client (spec 08.2): apiFetch wrappers with automatic nonce refresh.
 *
 * The editor is a long-lived SPA and wp_rest nonces expire; on a nonce 403
 * we fetch a fresh nonce from core's admin-ajax `rest-nonce` endpoint and
 * retry ONCE, a save is never silently dropped (spec 03.3).
 */

import apiFetch from '@wordpress/api-fetch';
import { logEvent } from './debug-log';
import { __, sprintf } from '@wordpress/i18n';

let restRoot = '';
let ajaxUrl = '';

/** Typed error for UI toasts. */
export class ApiError extends Error {
	constructor( message, { code = '', status = 0 } = {} ) {
		super( message );
		this.code = code;
		this.status = status;
		this.isAuth = 401 === status || 'wpie_ai_auth' === code;
		this.isQuota =
			429 === status ||
			'wpie_ai_quota' === code ||
			'wpie_budget_exceeded' === code;
		this.isUnconfigured = 'wpie_ai_unconfigured' === code;
	}
}

const toApiError = ( err ) =>
	err instanceof ApiError
		? err
		: new ApiError(
				err?.message || __( 'Request failed.', 'wunderpaint' ),
				{
					code: err?.code || '',
					status: err?.data?.status || 0,
				}
		  );

/**
 * Initialize apiFetch middleware from the bootstrap payload.
 *
 * @param {Object} WPIE window.WPIE.
 */
export function initApi( WPIE ) {
	restRoot = ( WPIE.restUrl || '' ).replace( /\/$/, '' );
	ajaxUrl = WPIE.ajaxUrl || '';
	apiFetch.nonceMiddleware = apiFetch.createNonceMiddleware( WPIE.nonce );
	apiFetch.use( apiFetch.nonceMiddleware );
	apiFetch.nonceEndpoint = ajaxUrl
		? `${ ajaxUrl }?action=rest-nonce`
		: undefined;
}

/** Refresh the REST nonce via core's admin-ajax rest-nonce action. */
async function refreshNonce() {
	if ( ! ajaxUrl ) {
		throw new ApiError(
			__( 'Session expired, please reload the editor.', 'wunderpaint' ),
			{ status: 403 }
		);
	}
	const response = await window.fetch( `${ ajaxUrl }?action=rest-nonce`, {
		credentials: 'same-origin',
	} );
	if ( ! response.ok ) {
		throw new ApiError(
			__(
				'Could not refresh the session, please reload the editor.',
				'wunderpaint'
			),
			{ status: 403 }
		);
	}
	const nonce = ( await response.text() ).trim();
	if ( apiFetch.nonceMiddleware ) {
		apiFetch.nonceMiddleware.nonce = nonce;
	}
	return nonce;
}

const isNonceFailure = ( err ) =>
	err &&
	( 'rest_cookie_invalid_nonce' === err.code ||
		( 403 === err?.data?.status && /nonce/i.test( err?.message || '' ) ) );

/**
 * apiFetch with one nonce-refresh retry (spec 08.2).
 *
 * @param {Object} options apiFetch options (url built from `path`).
 * @return {Promise<any>} Parsed response.
 */
export async function request( options ) {
	let path = options.path || '';
	// Plain permalinks (v1.131.4): rest_url() is then
	// index.php?rest_route=/wpie/v1/ - a second '?' from a caller's query
	// string would become part of the rest_route VALUE and 404. Chain
	// with '&' instead.
	if ( restRoot.includes( '?' ) && path.includes( '?' ) ) {
		path = path.replace( '?', '&' );
	}
	const finalOptions = {
		...options,
		url: `${ restRoot }${ path }`,
		path: undefined,
	};
	try {
		return await apiFetch( finalOptions );
	} catch ( err ) {
		if ( isNonceFailure( err ) ) {
			await refreshNonce();
			try {
				return await apiFetch( finalOptions );
			} catch ( retryErr ) {
				logEvent(
					'error',
					'rest',
					`${ options.method || 'GET' } ${ options.path }`,
					retryErr?.message
				);
				throw toApiError( retryErr );
			}
		}
		// Support trail (v1.132.0): every failed REST call lands in the
		// debug log with route + reason, never with payload data.
		logEvent(
			'error',
			'rest',
			`${ options.method || 'GET' } ${ options.path }`,
			err?.message
		);
		throw toApiError( err );
	}
}

/* ------------------------------ save/versions -------------------------- */

/**
 * Build a FormData payload from blobs + scalar fields.
 *
 * @param {Object} blobs  name → Blob (skipped when null).
 * @param {Object} fields name → scalar (skipped when undefined/null).
 * @return {FormData} Form data.
 */
export function buildFormData( blobs = {}, fields = {} ) {
	const fd = new window.FormData();
	for ( const [ name, blob ] of Object.entries( blobs ) ) {
		if ( blob ) {
			fd.append(
				name,
				blob,
				`${ name }.${ 'psd' === name ? 'psd' : 'png' }`
			);
		}
	}
	for ( const [ name, value ] of Object.entries( fields ) ) {
		if ( undefined !== value && null !== value ) {
			fd.append( name, value );
		}
	}
	return fd;
}

export const saveToLibrary = ( fd ) =>
	request( { path: '/save', method: 'POST', body: fd } );
export const saveAsNew = ( fd ) =>
	request( { path: '/save-as', method: 'POST', body: fd } );
export const getVersions = ( id ) =>
	request( { path: `/versions/${ id }`, method: 'GET' } );
export const restoreVersion = ( id, v ) =>
	request( {
		path: `/versions/${ id }/restore`,
		method: 'POST',
		data: { v },
	} );
export const fetchProjectJson = ( url ) =>
	window
		.fetch( url, {
			credentials: 'same-origin',
			headers: { 'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '' },
		} )
		.then( ( r ) => {
			if ( ! r.ok ) {
				throw new ApiError(
					__( 'Could not load the stored project.', 'wunderpaint' ),
					{ status: r.status }
				);
			}
			return r.json();
		} );

/**
 * Pre-flight for uploads (v1.140.1): PHP silently DROPS files above its
 * upload limit - the request then arrives without the file and the server
 * can only answer with a misleading "no file received". Throw a clear,
 * human message before wasting the upload time.
 *
 * @param {File}   file    File about to be uploaded.
 * @param {number} [capMb] Optional stricter app-level cap in MB.
 * @throws {ApiError} When the file exceeds the effective limit.
 */
export function checkUploadSize( file, capMb = 0 ) {
	const serverMb = Number( window.WPIE?.maxUploadMb ) || 0;
	const limitMb =
		capMb && serverMb ? Math.min( capMb, serverMb ) : capMb || serverMb;
	if ( ! file || ! limitMb || file.size <= limitMb * 1048576 ) {
		return;
	}
	throw new ApiError(
		sprintf(
			/* translators: 1: file size in MB, 2: limit in MB. */
			__(
				'This file is %1$s MB, but the maximum upload size is %2$s MB (server upload limit).',
				'wunderpaint'
			),
			( file.size / 1048576 ).toFixed( 1 ),
			limitMb
		)
	);
}

/**
 * Upload a local file into the media library via core REST (v1.135.0),
 * used for watermark/logo uploads that are not in the library yet.
 *
 * @param {File} file Image file from an <input type="file">.
 * @return {Promise<{id:number,url:string}>} New attachment.
 */
export async function uploadMediaFile( file ) {
	checkUploadSize( file );
	// Host-adapter hook (v1.309): a non-WordPress host (the standalone
	// studio) stores uploads itself and resolves the same { id, url }
	// shape. Set by the host bootstrap, never by WordPress.
	if ( window.WPIE?.hostUpload ) {
		return window.WPIE.hostUpload( file );
	}
	const mediaRoot = restRoot.replace( 'wpie/v1', 'wp/v2/media' );
	const fd = new window.FormData();
	fd.append( 'file', file, file.name );
	const response = await window.fetch( mediaRoot, {
		method: 'POST',
		credentials: 'same-origin',
		headers: { 'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '' },
		body: fd,
	} );
	if ( ! response.ok ) {
		throw new ApiError( __( 'Upload failed.', 'wunderpaint' ), {
			status: response.status,
		} );
	}
	const media = await response.json();
	return { id: media.id, url: media.source_url || '' };
}

/**
 * Core media metadata for prefilling Alt/Title/Caption/Description
 * (spec 07.2). Returns null when unavailable.
 *
 * @param {number} id Attachment id.
 */
export async function getMediaMeta( id ) {
	try {
		// Works for pretty (…/wp-json/wpie/v1) AND plain
		// (…/index.php?rest_route=/wpie/v1) permalink styles.
		const mediaRoot = restRoot.replace( 'wpie/v1', `wp/v2/media/${ id }` );
		const url =
			mediaRoot +
			( mediaRoot.includes( '?' ) ? '&' : '?' ) +
			'context=edit';
		const response = await window.fetch( url, {
			credentials: 'same-origin',
			headers: {
				'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '',
			},
		} );
		if ( ! response.ok ) {
			return null;
		}
		const media = await response.json();
		return {
			alt: media.alt_text || '',
			title: media.title?.raw ?? media.title?.rendered ?? '',
			caption: media.caption?.raw ?? '',
			description: media.description?.raw ?? '',
			sourceUrl: media.source_url || '',
			thumb:
				media.media_details?.sizes?.thumbnail?.source_url ||
				media.media_details?.sizes?.medium?.source_url ||
				media.source_url ||
				'',
			mime: media.mime_type || '',
			width: media.media_details?.width || 0,
			height: media.media_details?.height || 0,
			filesize: media.media_details?.filesize || 0,
			date: media.date || '',
			filename: ( media.source_url || '' ).split( '/' ).pop() || '',
		};
	} catch ( e ) {
		return null;
	}
}

/**
 * One page of library images (core REST, works with plain permalinks).
 * Returns light objects for the alt-text assistant (v1.0).
 *
 * @param {number} page 1-based page (50 per page).
 * @return {Promise<{items: Array, hasMore: boolean}>} Page result.
 */
export async function listMediaPage( page = 1 ) {
	const mediaRoot = restRoot.replace( 'wpie/v1', 'wp/v2/media' );
	const url =
		mediaRoot +
		( mediaRoot.includes( '?' ) ? '&' : '?' ) +
		`context=edit&media_type=image&per_page=50&page=${ page }&orderby=date&order=desc&_fields=id,alt_text,source_url,media_details,title,mime_type`;
	const response = await window.fetch( url, {
		credentials: 'same-origin',
		headers: { 'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '' },
	} );
	if ( ! response.ok ) {
		throw new Error( `HTTP ${ response.status }` );
	}
	const totalPages =
		parseInt( response.headers.get( 'X-WP-TotalPages' ), 10 ) || 1;
	const media = await response.json();
	return {
		items: media.map( ( m ) => ( {
			id: m.id,
			alt: m.alt_text || '',
			title: m.title?.raw ?? m.title?.rendered ?? '',
			url:
				m.media_details?.sizes?.medium?.source_url ||
				m.media_details?.sizes?.thumbnail?.source_url ||
				m.source_url,
			fullUrl: m.source_url,
			width: m.media_details?.width || 0,
			height: m.media_details?.height || 0,
			filename: ( m.source_url || '' ).split( '/' ).pop() || '',
			mime: m.mime_type || '',
		} ) ),
		hasMore: page < totalPages,
	};
}

/**
 * Update an attachment's alt text via core REST (v1.0).
 *
 * @param {number} id  Attachment id.
 * @param {string} alt New alt text.
 * @return {Promise<void>} Resolves on success.
 */
export async function updateMediaAlt( id, alt ) {
	const mediaRoot = restRoot.replace( 'wpie/v1', `wp/v2/media/${ id }` );
	const response = await window.fetch( mediaRoot, {
		method: 'POST',
		credentials: 'same-origin',
		headers: {
			'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify( { alt_text: alt } ),
	} );
	if ( ! response.ok ) {
		throw new Error( `HTTP ${ response.status }` );
	}
}

/**
 * Update an attachment's title / alt / caption / description via core REST.
 * Only the keys present in `fields` are written (v1.187.0).
 *
 * @param {number} id     Attachment id.
 * @param {Object} fields { title?, alt?, caption?, description? }.
 * @return {Promise<void>} Resolves on success.
 */
export async function updateMedia( id, fields ) {
	const body = {};
	if ( undefined !== fields.title ) {
		body.title = fields.title;
	}
	if ( undefined !== fields.alt ) {
		body.alt_text = fields.alt;
	}
	if ( undefined !== fields.caption ) {
		body.caption = fields.caption;
	}
	if ( undefined !== fields.description ) {
		body.description = fields.description;
	}
	if ( ! Object.keys( body ).length ) {
		return;
	}
	const mediaRoot = restRoot.replace( 'wpie/v1', `wp/v2/media/${ id }` );
	const response = await window.fetch( mediaRoot, {
		method: 'POST',
		credentials: 'same-origin',
		headers: {
			'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify( body ),
	} );
	if ( ! response.ok ) {
		throw new Error( `HTTP ${ response.status }` );
	}
}

/** Core-REST fetch relative to wp/v2 (plain-permalink safe, v1.0). */
async function coreRest( path, { method = 'GET', data } = {} ) {
	const root = restRoot.replace( 'wpie/v1', `wp/v2/${ path }` );
	const response = await window.fetch( root, {
		method,
		credentials: 'same-origin',
		headers: {
			'X-WP-Nonce': apiFetch.nonceMiddleware?.nonce || '',
			...( data ? { 'Content-Type': 'application/json' } : {} ),
		},
		...( data ? { body: JSON.stringify( data ) } : {} ),
	} );
	if ( ! response.ok ) {
		throw new Error( `HTTP ${ response.status }` );
	}
	return response.json();
}

/**
 * Latest / matching posts for the post-save workflow (v1.0).
 *
 * @param {string} q Search text ('' = latest).
 * @return {Promise<Array>} [{id, title, link}].
 */
export async function searchPosts( q = '' ) {
	const posts = await coreRest(
		`posts&per_page=10&context=edit&_fields=id,title,link${
			q ? `&search=${ encodeURIComponent( q ) }` : ''
		}`
	);
	return posts.map( ( p ) => ( {
		id: p.id,
		title: p.title?.raw || p.title?.rendered || `#${ p.id }`,
		link: p.link,
	} ) );
}

/**
 * Set an attachment as a post's featured image (v1.0).
 *
 * @param {number} postId Post id.
 * @param {number} attId  Attachment id.
 * @return {Promise<Object>} Updated post.
 */
export const setFeaturedImage = ( postId, attId ) =>
	coreRest( `posts/${ postId }`, {
		method: 'POST',
		data: { featured_media: attId },
	} );

/**
 * Create a draft containing the image as a block (v1.0).
 *
 * @param {string} title Draft title.
 * @param {number} attId Attachment id.
 * @param {string} url   Image URL.
 * @return {Promise<Object>} {id, …} of the new draft.
 */
export const createDraftWithImage = ( title, attId, url ) =>
	coreRest( 'posts', {
		method: 'POST',
		data: {
			status: 'draft',
			title,
			content:
				`<!-- wp:image {"id":${ attId },"sizeSlug":"large"} -->\n` +
				`<figure class="wp-block-image size-large"><img src="${ url }" alt="" class="wp-image-${ attId }"/></figure>\n` +
				`<!-- /wp:image -->`,
		},
	} );

/**
 * Same-origin URL for a (possibly cross-origin) attachment source.
 * @param proxyUrl
 * @param src
 */
export const proxyImageUrl = ( proxyUrl, src ) =>
	`${ proxyUrl }${
		proxyUrl.includes( '?' ) ? '&' : '?'
	}src=${ encodeURIComponent( src ) }`;

/* ------------------------------- templates ------------------------------ */

export const templates = {
	list: () => request( { path: '/templates', method: 'GET' } ),
	create: ( { name, projectJson, preview } ) =>
		request( {
			path: '/templates',
			method: 'POST',
			data: { name, projectJson, preview },
		} ),
	load: ( id ) => request( { path: `/templates/${ id }`, method: 'GET' } ),
	update: ( id, { name, projectJson, preview } = {} ) =>
		request( {
			path: `/templates/${ id }`,
			method: 'POST',
			data: { name, projectJson, preview },
		} ),
	remove: ( id ) =>
		request( { path: `/templates/${ id }`, method: 'DELETE' } ),
};

/* --------- user library: saved elements / text / backgrounds (v1.34) ---- */

export const library = {
	list: ( kind ) => request( { path: `/library/${ kind }`, method: 'GET' } ),
	save: ( kind, item ) =>
		request( {
			path: `/library/${ kind }`,
			method: 'POST',
			data: { item },
		} ),
	remove: ( kind, id ) =>
		request( { path: `/library/${ kind }/${ id }`, method: 'DELETE' } ),
	categories: () => request( { path: '/library/categories', method: 'GET' } ),
	categoryAction: ( action, name, to ) =>
		request( {
			path: '/library/categories',
			method: 'POST',
			data: { action, name, to },
		} ),
};

/* ------------------------- designs (My Designs, v1.10) ------------------ */

export const designs = {
	list: () => request( { path: '/designs', method: 'GET' } ),
	create: ( { name, projectJson, preview } ) =>
		request( {
			path: '/designs',
			method: 'POST',
			data: { name, projectJson, preview },
		} ),
	update: ( id, { name, projectJson, preview, folder } = {} ) =>
		request( {
			path: `/designs/${ id }`,
			method: 'POST',
			data: { name, projectJson, preview, folder },
		} ),
	load: ( id ) => request( { path: `/designs/${ id }`, method: 'GET' } ),
	duplicate: ( id ) =>
		request( { path: `/designs/${ id }/duplicate`, method: 'POST' } ),
	share: ( id, image ) =>
		request( {
			path: `/designs/${ id }/share`,
			method: 'POST',
			data: { image },
		} ),
	unshare: ( id ) =>
		request( { path: `/designs/${ id }/share`, method: 'DELETE' } ),
	remove: ( id ) => request( { path: `/designs/${ id }`, method: 'DELETE' } ),
};

/* --------------------------------- stock -------------------------------- */

/**
 * Append query args to a REST path. With plain permalinks the REST root
 * already contains '?', so extra args must join with '&'.
 *
 * @param {string} path   Route path.
 * @param {Object} params Query params.
 * @return {string} Path with query string.
 */
const pathWithArgs = ( path, params ) => {
	const qs = new window.URLSearchParams( params ).toString();
	return `${ path }${ restRoot.includes( '?' ) ? '&' : '?' }${ qs }`;
};

// Help Assistant (v1.253): grounded chat over the bundled knowledge
// base; the server picks glossary sections and answers via the
// configured text provider. Returns { answer, tour }.
export const assistant = {
	chat: ( messages ) =>
		request( {
			path: '/assistant/chat',
			method: 'POST',
			data: { messages },
		} ),
};

export const stock = {
	search: ( provider, q, page = 1, type = 'photo' ) =>
		request( {
			path: pathWithArgs( '/stock/search', { provider, q, page, type } ),
			method: 'GET',
		} ),
	fetch: ( url ) =>
		request( { path: '/stock/fetch', method: 'POST', data: { url } } ),
	// Fire and forget. Unsplash requires this call the moment a photo is
	// actually used, and it is how the photographer gets counted. Nothing on
	// screen waits for it, and a failure must never stand between a visitor
	// and the picture they just picked.
	countDownload: ( location ) =>
		location
			? request( {
					path: '/stock/download',
					method: 'POST',
					data: { location },
			  } ).catch( () => {} )
			: Promise.resolve(),
};

/* --------------------- geo proxy (Extension API 2.4) --------------------- */

/**
 * Server-side OpenStreetMap proxy: place search (Nominatim) and compact
 * map vector data (Overpass). Both are cached on the server; the browser
 * never talks to OSM directly. Exposed to extensions via bridge.api.geo.
 */
export const geo = {
	/**
	 * Place search: the bundled index first, Nominatim only when it cannot
	 * answer.
	 *
	 * The index holds 34,079 cities and answers from memory, so a search for
	 * a town is instant and costs no request at all. A house number, a lake
	 * or a mountain pass is not in it, and those fall through to the proxy
	 * exactly as before - as does everything, if the index is missing or
	 * unreadable.
	 *
	 * Callers do not need to know any of this: the shape of the answer is
	 * the same either way, which is why the extensions that already call
	 * geo.search got the fast path without changing a line. (2026-08-08, when
	 * the index moved out of Map Posters and into the core.)
	 *
	 * @param {string} q     Place name.
	 * @param {number} limit Maximum results.
	 * @return {Promise<Object>} { results }.
	 */
	search: async ( q, limit = 6 ) => {
		try {
			const { load, search } = await import(
				/* webpackChunkName: "gazetteer" */ './gazetteer'
			);
			const index = await load();
			if ( index ) {
				const hits = search( index, q, limit );
				if ( hits.length ) {
					return { results: hits };
				}
			}
		} catch ( e ) {
			// Fall through. A broken index must never cost a user a search.
		}
		return request( {
			path: pathWithArgs( '/geo/search', { q, limit } ),
			method: 'GET',
		} );
	},
	map: ( { south, west, north, east, detail = 2, buildings = false } ) =>
		request( {
			path: pathWithArgs( '/geo/map', {
				south,
				west,
				north,
				east,
				detail,
				buildings: buildings ? 1 : 0,
			} ),
			method: 'GET',
		} ),
};

/* ------------------- posts (dynamic templates, E1) ---------------------- */

export const posts = {
	search: ( {
		search = '',
		cat = 0,
		page = 1,
		type = 'post',
		orderby = '',
	} = {} ) =>
		request( {
			path: pathWithArgs( '/posts', {
				search,
				cat,
				page,
				type,
				orderby,
			} ),
			method: 'GET',
		} ),
	context: ( id, metaKeys = [] ) =>
		request( {
			path: metaKeys.length
				? pathWithArgs( `/posts/${ id }/context`, {
						meta: metaKeys.join( ',' ),
				  } )
				: `/posts/${ id }/context`,
			method: 'GET',
		} ),
	types: () => request( { path: '/posts/types', method: 'GET' } ),
	categories: () => request( { path: '/posts/categories', method: 'GET' } ),
};

/* ------------------- automation jobs (dynamic templates, E2) ------------ */

export const automation = {
	jobs: () => request( { path: '/automate/jobs', method: 'GET' } ),
	queue: ( items ) =>
		request( { path: '/automate/jobs', method: 'POST', data: { items } } ),
	update: ( id, patch ) =>
		request( {
			path: `/automate/jobs/${ id }`,
			method: 'POST',
			data: patch,
		} ),
	remove: ( id ) =>
		request( { path: `/automate/jobs/${ id }`, method: 'DELETE' } ),
	clear: ( scope = 'finished' ) =>
		request( {
			path: pathWithArgs( '/automate/jobs', { scope } ),
			method: 'DELETE',
		} ),
	mark: ( data ) =>
		request( { path: '/automate/mark', method: 'POST', data } ),
	applyMeta: ( data ) =>
		request( { path: '/automate/apply-meta', method: 'POST', data } ),
	settings: () => request( { path: '/automate/settings', method: 'GET' } ),
	saveSettings: ( data ) =>
		request( { path: '/automate/settings', method: 'POST', data } ),
};

/* ---------------------------------- AI --------------------------------- */

// Slow generations run as detached server jobs + polling (v1.4.4): the
// direct request died at webserver gateway timeouts (~60s) while PHP was
// still waiting on the provider.
const AI_ASYNC_ACTIONS = [
	'generate',
	'edit',
	'inpaint',
	'outpaint',
	'variations',
	'design',
	// Schema completions can think for minutes (v1.273.0).
	'complete',
];
const JOB_POLL_MS = 2500;
const JOB_DEADLINE_MS = 5 * 60 * 1000;

const sleep = ( ms ) => new Promise( ( resolve ) => setTimeout( resolve, ms ) );

const mapGatewayError = ( err ) => {
	if ( 'invalid_json' === err?.code ) {
		return new ApiError(
			__(
				'The web server aborted the AI request (timeout or size limit) before the provider finished. Please try again.',
				'wunderpaint'
			),
			{ code: 'wpie_gateway', status: 502 }
		);
	}
	return err;
};

const aiPost = async ( action, data ) => {
	if ( ! AI_ASYNC_ACTIONS.includes( action ) ) {
		return request( { path: `/ai/${ action }`, method: 'POST', data } );
	}
	let first;
	try {
		first = await request( {
			path: `/ai/${ action }`,
			method: 'POST',
			data: { ...data, async: 1 },
		} );
	} catch ( err ) {
		throw mapGatewayError( err );
	}
	if ( ! first?.jobId ) {
		return first; // no FPM early-flush available → ran synchronously
	}
	const deadline = Date.now() + JOB_DEADLINE_MS;
	for (;;) {
		await sleep( JOB_POLL_MS );
		const job = await request( {
			path: `/ai/job/${ first.jobId }`,
			method: 'GET',
		} );
		if ( 'pending' !== job?.status ) {
			return job?.result;
		}
		if ( Date.now() > deadline ) {
			throw new ApiError(
				__(
					'The AI job is taking too long, please try again.',
					'wunderpaint'
				),
				{ code: 'wpie_job_timeout', status: 504 }
			);
		}
	}
};

export const ai = {
	// `model` (v1.81.1): optional exact-model override per call; the Pro
	// content generator lets a content template pin one.
	generate: ( {
		prompt,
		provider,
		model,
		size,
		style,
		n,
		aspect,
		refImage,
	} ) =>
		aiPost( 'generate', {
			prompt,
			provider,
			model,
			size,
			style,
			n,
			aspect,
			refImage,
		} ),
	edit: ( {
		prompt,
		provider,
		model,
		image,
		strength,
		size,
		aspect,
		refImage,
	} ) =>
		aiPost( 'edit', {
			prompt,
			provider,
			model,
			image,
			strength,
			size,
			aspect,
			refImage,
		} ),
	removeBg: ( { image } ) => aiPost( 'remove-bg', { image } ),
	inpaint: ( { prompt, provider, image, mask, size, aspect } ) =>
		aiPost( 'inpaint', { prompt, provider, image, mask, size, aspect } ),
	// v1.4: `mask` was silently dropped here, OpenAI edits then ran without
	// a mask and no real outpainting ever happened.
	outpaint: ( { prompt, provider, image, mask, extend, size, aspect } ) =>
		aiPost( 'outpaint', {
			prompt,
			provider,
			image,
			mask,
			extend,
			size,
			aspect,
		} ),
	enhance: ( { image } ) => aiPost( 'enhance', { image } ),
	variations: ( { image, n } ) => aiPost( 'variations', { image, n } ),
	caption: ( { image, provider, lang } ) =>
		aiPost( 'caption', { image, provider, lang } ),
	design: ( { brief, w, h, brand, product, image, variation } ) =>
		aiPost( 'design', { brief, w, h, brand, product, image, variation } ),
	template: ( { kind, prompt, text, n, brand } ) =>
		aiPost( 'template', { kind, prompt, text, n, brand } ),
	svg: ( { prompt, provider, brand } ) =>
		aiPost( 'svg', { prompt, provider, brand } ),
	// complete (v1.273.0 / API 2.10): generic text or schema-shaped JSON
	// completion for extensions. Returns { text } or, with `schema`,
	// { data }. tier 'caption' (fast, default) or 'design'.
	complete: ( {
		prompt,
		system,
		schema,
		tier,
		maxTokens,
		provider,
		model,
		// Vision input (v1.378): data-URL image, plain-text path only.
		image,
	} ) =>
		aiPost( 'complete', {
			prompt,
			system,
			schema,
			tier,
			maxTokens,
			provider,
			model,
			image,
		} ),
	layout: ( { text, style, w, h, n } ) =>
		aiPost( 'layout', { text, style, w, h, n } ),
	seo: ( { title, excerpt } ) => aiPost( 'seo', { title, excerpt } ),
	test: ( provider ) => aiPost( 'test', { provider } ),
};
