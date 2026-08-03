/**
 * Canvas video capture (v1.273.0): captureStream + MediaRecorder with the
 * mime fallback chain, once - six extensions each hand-rolled this for
 * their WebM exports. Bridged as `video.recordCanvas`.
 */

import { __ } from '@wordpress/i18n';

// WebM first, because that is what every export from this editor has been
// and what Chrome, Edge and Firefox encode best. MP4 behind it for WebKit:
// Safari HAS a MediaRecorder but cannot encode WebM, so the old chain ended
// on 'video/webm' anyway and the constructor threw (v1.353.0).
const MIMES = [
	'video/webm;codecs=vp9',
	'video/webm;codecs=vp8',
	'video/webm',
	'video/mp4;codecs=avc1.42E01E',
	'video/mp4',
];

/**
 * First supported mime from the fallback chain.
 *
 * @param {Function} [isSupported] Injectable for tests; defaults to
 *                                 MediaRecorder.isTypeSupported.
 * @return {string} Mime type, or '' when this browser records none of them.
 *                  Callers must treat '' as "no video export here" rather
 *                  than hand it to the MediaRecorder constructor.
 */
export function pickRecorderMime(
	isSupported = ( m ) => window.MediaRecorder?.isTypeSupported?.( m )
) {
	return (
		MIMES.find( ( m ) => {
			try {
				return !! isSupported( m );
			} catch ( e ) {
				return false;
			}
		} ) || ''
	);
}

/**
 * Can this browser record a canvas at all? Ask before offering the button:
 * MediaRecorder existing is not the same as it encoding anything we can use.
 *
 * @return {boolean} Whether recordCanvas() will work here.
 */
export function canRecordCanvas() {
	return !! (
		window.MediaRecorder &&
		window.HTMLCanvasElement?.prototype?.captureStream &&
		pickRecorderMime()
	);
}

/**
 * Can this browser record WebM specifically? The export dialog offers a
 * format called "WebM", so it may only offer it when that is what the user
 * would actually get - unlike a studio's "record the loop", which is happy
 * with whatever plays.
 *
 * @return {boolean} Whether a WebM recording is possible here.
 */
export function canRecordWebm() {
	return (
		canRecordCanvas() && 0 === pickRecorderMime().indexOf( 'video/webm' )
	);
}

/**
 * File extension that matches a recorder mime.
 *
 * @param {string} mimeType Mime from pickRecorderMime().
 * @return {string} 'mp4' or 'webm'.
 */
export function recordingExtension( mimeType ) {
	return String( mimeType ).includes( 'mp4' ) ? 'mp4' : 'webm';
}

/**
 * Record a canvas to a WebM blob.
 *
 * @param {HTMLCanvasElement} canvas Source canvas (keep painting it).
 * @param {Object}            [opts]
 * @param {number}   [opts.fps=30]              Capture frame rate.
 * @param {number}   [opts.durationMs=0]        Auto-stop after this many
 *                                              ms (0 = manual stop()).
 * @param {number}   [opts.bitsPerSecond=8e6]   Video bitrate.
 * @param {Function} [opts.onProgress]          ( elapsedMs ) every 250ms.
 * @return {{ stop: Function, blob: Promise<Blob>, mimeType: string,
 *           extension: string }}
 * @throws {Error} When the browser cannot record. Callers used to get an
 *                 exception out of the MediaRecorder constructor instead,
 *                 which in a requestAnimationFrame loop left the studio
 *                 stuck on "Recording loop..." with no message at all.
 */
export function recordCanvas(
	canvas,
	{ fps = 30, durationMs = 0, bitsPerSecond = 8000000, onProgress } = {}
) {
	const mimeType = pickRecorderMime();
	if ( ! mimeType || ! canvas?.captureStream ) {
		throw new Error(
			__(
				'This browser cannot record video. Chrome, Edge, Firefox and Safari 17 or newer can.',
				'wunderpaint'
			)
		);
	}
	const stream = canvas.captureStream( fps );
	const rec = new window.MediaRecorder( stream, {
		mimeType,
		videoBitsPerSecond: bitsPerSecond,
	} );
	const chunks = [];
	rec.ondataavailable = ( ev ) => {
		if ( ev.data && ev.data.size ) {
			chunks.push( ev.data );
		}
	};
	const started = Date.now();
	let timer = null;
	let tick = null;
	const cleanup = () => {
		if ( timer ) {
			clearTimeout( timer );
		}
		if ( tick ) {
			clearInterval( tick );
		}
		stream.getTracks().forEach( ( t ) => t.stop() );
	};
	const blob = new Promise( ( resolve, reject ) => {
		rec.onstop = () => {
			cleanup();
			// Follow the recorder, do not assume WebM: on Safari these bytes
			// are MP4 and a blob labelled video/webm would be rejected on
			// upload and unplayable on download.
			resolve( new Blob( chunks, { type: mimeType.split( ';' )[ 0 ] } ) );
		};
		rec.onerror = ( e ) => {
			cleanup();
			reject( e.error || new Error( 'MediaRecorder failed' ) );
		};
	} );
	const stop = () => {
		if ( 'inactive' !== rec.state ) {
			rec.stop();
		}
	};
	if ( durationMs > 0 ) {
		timer = setTimeout( stop, durationMs );
	}
	if ( onProgress ) {
		tick = setInterval( () => onProgress( Date.now() - started ), 250 );
	}
	// Timeslice so long recordings don't buffer one giant in-memory chunk.
	rec.start( 200 );
	return { stop, blob, mimeType, extension: recordingExtension( mimeType ) };
}
