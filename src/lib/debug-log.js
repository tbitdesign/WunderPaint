/**
 * In-memory debug log (v1.132.0): a capped ring buffer of everything a
 * support case needs - JS errors, failed REST calls, model loads, indexer
 * runs, extension issues. Lives only in memory (privacy: no document
 * content, no keys, no pixels), shown and exported via Help → System
 * Status so users can send ONE file that tells the whole story.
 */

const CAP = 500;

const entries = [];
const listeners = new Set();
let installed = false;

const notify = () => listeners.forEach( ( fn ) => fn( entries ) );

/**
 * Append one entry.
 *
 * @param {string} level  'info' | 'warn' | 'error'.
 * @param {string} source Short origin tag ('rest', 'ml', 'js', …).
 * @param {string} message One line, human readable.
 * @param {*}      [detail] Small serializable extra (kept terse).
 */
export function logEvent( level, source, message, detail ) {
	entries.push( {
		t: Date.now(),
		level,
		source,
		message: String( message ).slice( 0, 400 ),
		detail:
			undefined === detail
				? undefined
				: String(
						'string' === typeof detail
							? detail
							: ( () => {
									try {
										return JSON.stringify( detail );
									} catch ( e ) {
										return String( detail );
									}
							  } )()
				  ).slice( 0, 400 ),
	} );
	if ( entries.length > CAP ) {
		entries.splice( 0, entries.length - CAP );
	}
	notify();
}

/** Current entries (live array, do not mutate). */
export const getLog = () => entries;

/** Subscribe to changes; returns an unsubscribe function. */
export function subscribeLog( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}

export function clearLog() {
	entries.length = 0;
	notify();
}

/** Global JS error capture, installed once at app boot. */
export function initDebugLog() {
	if ( installed || 'undefined' === typeof window ) {
		return;
	}
	installed = true;
	logEvent( 'info', 'app', 'Editor session started', {
		version: window.WPIE?.version,
		ua: window.navigator?.userAgent,
	} );
	window.addEventListener( 'error', ( e ) =>
		logEvent(
			'error',
			'js',
			e.message || 'Script error',
			e.filename ? `${ e.filename }:${ e.lineno }` : undefined
		)
	);
	window.addEventListener( 'unhandledrejection', ( e ) =>
		logEvent(
			'error',
			'js',
			'Unhandled rejection: ' +
				( e.reason?.message || String( e.reason ) )
		)
	);
}

/**
 * Export bundle: status snapshot + log, as a Blob for download. The
 * caller adds counts it already has on screen.
 *
 * @param {Object} status Snapshot from the status dialog.
 * @return {Blob} JSON blob.
 */
export function exportLogBlob( status ) {
	const payload = {
		exportedAt: new Date().toISOString(),
		plugin: window.WPIE?.version,
		browser: window.navigator?.userAgent,
		language: window.navigator?.language,
		webgpu: !! window.navigator?.gpu,
		status,
		log: entries,
	};
	return new window.Blob( [ JSON.stringify( payload, null, '\t' ) ], {
		type: 'application/json',
	} );
}
