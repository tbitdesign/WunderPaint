/**
 * Media usage client (v1.351.0): thin wrappers around the wpie/v1/media-usage,
 * media-quarantine, media-orphans, media-oversize and media-credits endpoints.
 *
 * The sweep is driven by polling: the server works until its own time budget
 * runs out and returns progress, so the client just keeps asking until
 * `running` goes false. No chunk size to tune from here, because the right one
 * depends on how fast the host is and only the host knows that.
 */

import { request } from './api';

/** Verdicts the engine can return, in the order the panel lists them. */
export const VERDICTS = [ 'used', 'unused', 'fresh', 'unknown' ];

export const mediaUsage = {
	/** Every place one attachment is referenced. Always live. */
	for: ( id ) =>
		request( { path: `/media-usage/for/${ id }`, method: 'GET' } ),

	/** Current sweep progress. */
	status: () => request( { path: '/media-usage/scan', method: 'GET' } ),

	/** Work on the sweep for one request. */
	step: ( restart = false ) =>
		request( {
			path: '/media-usage/scan',
			method: 'POST',
			data: restart ? { restart: 1 } : {},
		} ),

	/** Abandon a running sweep. */
	reset: () => request( { path: '/media-usage/scan/reset', method: 'POST' } ),
};

export const quarantine = {
	list: () => request( { path: '/media-quarantine', method: 'GET' } ),
	hold: ( ids, force = false ) =>
		request( {
			path: '/media-quarantine',
			method: 'POST',
			data: { ids, force: force ? 1 : 0 },
		} ),
	restore: ( ids ) =>
		request( {
			path: '/media-quarantine/restore',
			method: 'POST',
			data: { ids },
		} ),
	purge: () => request( { path: '/media-quarantine/purge', method: 'POST' } ),
};

export const orphans = {
	dirs: () => request( { path: '/media-orphans/dirs', method: 'GET' } ),
	scan: ( dir ) =>
		request( {
			path: '/media-orphans/scan',
			method: 'POST',
			data: { dir },
		} ),
	hold: ( paths ) =>
		request( {
			path: '/media-orphans/hold',
			method: 'POST',
			data: { paths },
		} ),
	held: () => request( { path: '/media-orphans/held', method: 'GET' } ),
	restore: ( paths ) =>
		request( {
			path: '/media-orphans/held',
			method: 'POST',
			data: { paths },
		} ),
};

export const oversize = {
	list: ( limit = 100 ) =>
		request( { path: `/media-oversize?limit=${ limit }`, method: 'GET' } ),
};

export const credits = {
	get: ( id ) => request( { path: `/media-credits/${ id }`, method: 'GET' } ),
	set: ( id, values ) =>
		request( {
			path: `/media-credits/${ id }`,
			method: 'POST',
			data: values,
		} ),
	overview: () => request( { path: '/media-credits', method: 'GET' } ),
};

/** What is embedded in the file itself, and how to take it back out (v1.401.0). */
export const fileMeta = {
	get: ( id ) =>
		request( { path: `/media-metadata/${ id }`, method: 'GET' } ),
	strip: ( id, what ) =>
		request( {
			path: `/media-metadata/${ id }`,
			method: 'POST',
			data: { what },
		} ),
};

/**
 * Run the sweep to completion, reporting progress as it goes.
 *
 * @param {Function} onProgress Called with each status payload.
 * @param {Object}   ctl        Optional { cancelled: boolean } escape hatch.
 * @return {Promise<Object>} The final status.
 */
export async function runSweep( onProgress, ctl = {} ) {
	let status = await mediaUsage.step( true );
	onProgress?.( status );

	// A guard, not a limit: the server reports completion itself. This only
	// stops a runaway loop if a deploy ever leaves the two sides disagreeing.
	for ( let i = 0; i < 5000 && status?.running; i++ ) {
		if ( ctl.cancelled ) {
			await mediaUsage.reset();
			return { ...status, running: false, cancelled: true };
		}
		status = await mediaUsage.step();
		onProgress?.( status );
	}
	return status;
}

/** Human-readable byte size. */
export function fmtBytes( b ) {
	if ( ! b ) {
		return '';
	}
	if ( b >= 1073741824 ) {
		return ( b / 1073741824 ).toFixed( 1 ) + ' GB';
	}
	if ( b >= 1048576 ) {
		return ( b / 1048576 ).toFixed( 1 ) + ' MB';
	}
	if ( b >= 1024 ) {
		return Math.round( b / 1024 ) + ' KB';
	}
	return b + ' B';
}

/** Localized date from a unix timestamp. */
export function fmtWhen( t ) {
	if ( ! t ) {
		return '';
	}
	try {
		return new Date( t * 1000 ).toLocaleDateString();
	} catch ( e ) {
		return '';
	}
}
