/**
 * A song file into mono samples, in the browser, for song.js.
 *
 * The file is fetched (same origin, like every media item), its length
 * is checked from the metadata before anything is decoded, then the
 * browser's own decoder turns it into samples at a low rate (22050 Hz
 * holds everything a painter can hear) and the channels are folded into
 * the first one in place - a ten-minute stereo song would otherwise hold
 * a second copy of itself. Nothing leaves the browser.
 */

/** The length of an audio file from its metadata (seconds). */
function durationOf( url, signal ) {
	return new Promise( ( resolve, reject ) => {
		const audio = document.createElement( 'audio' );
		let timer = 0;
		const done = ( fn, value ) => {
			clearTimeout( timer );
			audio.onloadedmetadata = audio.onerror = null;
			audio.removeAttribute( 'src' );
			audio.load();
			if ( signal ) {
				signal.removeEventListener( 'abort', abort );
			}
			fn( value );
		};
		const abort = () =>
			done( reject, new DOMException( 'Aborted', 'AbortError' ) );
		if ( signal ) {
			signal.addEventListener( 'abort', abort, { once: true } );
		}
		timer = setTimeout(
			() => done( reject, new Error( 'The audio could not be read.' ) ),
			20000
		);
		audio.preload = 'metadata';
		audio.onloadedmetadata = () => done( resolve, audio.duration );
		audio.onerror = () =>
			done( reject, new Error( 'The audio could not be read.' ) );
		audio.src = url;
	} );
}

/**
 * @param {string} url  The song (a media library URL).
 * @param {Object} o
 * @param {number} o.sampleRate  Analysis rate.
 * @param {number} o.maxSeconds  Longer songs are refused (error.tooLong).
 * @param {AbortSignal} [o.signal]
 * @return {Promise<{samples: Float32Array, sampleRate: number, duration: number}>}
 */
export async function decodeSong(
	url,
	{ sampleRate = 22050, maxSeconds = 600, signal = null } = {}
) {
	const tooLong = () => {
		const e = new Error( 'The song is too long.' );
		e.tooLong = true;
		return e;
	};
	const length = await durationOf( url, signal );
	if ( Number.isFinite( length ) && length > maxSeconds ) {
		throw tooLong();
	}
	const response = await window.fetch( url, {
		credentials: 'same-origin',
		signal: signal || undefined,
	} );
	if ( ! response.ok ) {
		throw new Error( 'The audio could not be read.' );
	}
	const bytes = await response.arrayBuffer();
	const Offline =
		window.OfflineAudioContext || window.webkitOfflineAudioContext;
	let buffer;
	if ( Offline ) {
		// The length is only for rendering; decoding resamples to the rate.
		buffer = await new Offline( 1, 1, sampleRate ).decodeAudioData( bytes );
	} else {
		const Live = window.AudioContext || window.webkitAudioContext;
		const ctx = new Live( { sampleRate } );
		try {
			buffer = await ctx.decodeAudioData( bytes );
		} finally {
			if ( ctx.close ) {
				ctx.close().catch( () => {} );
			}
		}
	}
	if ( buffer.duration > maxSeconds ) {
		throw tooLong();
	}
	const n = buffer.length;
	const channels = buffer.numberOfChannels;
	const mono = buffer.getChannelData( 0 );
	if ( channels > 1 ) {
		for ( let c = 1; c < channels; c++ ) {
			const data = buffer.getChannelData( c );
			for ( let i = 0; i < n; i++ ) {
				mono[ i ] += data[ i ];
			}
		}
		const k = 1 / channels;
		for ( let i = 0; i < n; i++ ) {
			mono[ i ] *= k;
		}
	}
	return {
		samples: mono,
		sampleRate: buffer.sampleRate,
		duration: buffer.duration,
	};
}
