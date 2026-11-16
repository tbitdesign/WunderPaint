/**
 * The frequencies of a sound (v2.5).
 *
 * The waveform styles only know HOW LOUD a moment is. Two songs at the
 * same volume draw the same bars; what tells them apart is which
 * frequencies sound - the bass line, the voice, the cymbals. This file
 * measures that, with a plain FFT, in three shapes:
 *
 *   computeSpectrum  the whole track as a compact grid (time x bands),
 *                    kept after decoding like the peak profiles are
 *   spectrumWindow   a trimmed / resampled view of that grid
 *   offlineAnalyser  what the browser's AnalyserNode reports at a given
 *                    moment, worked out from the samples - so the video
 *                    can be rendered frame by frame instead of recorded
 *                    in real time, and still dance the same way
 *
 * Pure: no DOM, no Web Audio, tested in node.
 */

/** In-place radix-2 FFT. `re` and `im` have a power-of-two length. */
export function fft( re, im ) {
	const n = re.length;
	for ( let i = 1, j = 0; i < n; i++ ) {
		let bit = n >> 1;
		for ( ; j & bit; bit >>= 1 ) {
			j ^= bit;
		}
		j ^= bit;
		if ( i < j ) {
			[ re[ i ], re[ j ] ] = [ re[ j ], re[ i ] ];
			[ im[ i ], im[ j ] ] = [ im[ j ], im[ i ] ];
		}
	}
	for ( let len = 2; len <= n; len <<= 1 ) {
		const ang = ( -2 * Math.PI ) / len;
		const wr = Math.cos( ang );
		const wi = Math.sin( ang );
		for ( let i = 0; i < n; i += len ) {
			let cr = 1;
			let ci = 0;
			for ( let k = 0; k < len / 2; k++ ) {
				const a = i + k;
				const b = a + len / 2;
				const tr = re[ b ] * cr - im[ b ] * ci;
				const ti = re[ b ] * ci + im[ b ] * cr;
				re[ b ] = re[ a ] - tr;
				im[ b ] = im[ a ] - ti;
				re[ a ] += tr;
				im[ a ] += ti;
				const nr = cr * wr - ci * wi;
				ci = cr * wi + ci * wr;
				cr = nr;
			}
		}
	}
}

const windows = new Map();
/** Blackman window, the one the AnalyserNode uses. */
function blackman( n ) {
	if ( ! windows.has( n ) ) {
		const w = new Float32Array( n );
		for ( let i = 0; i < n; i++ ) {
			const x = ( 2 * Math.PI * i ) / ( n - 1 );
			w[ i ] = 0.42 - 0.5 * Math.cos( x ) + 0.08 * Math.cos( 2 * x );
		}
		windows.set( n, w );
	}
	return windows.get( n );
}

/**
 * Magnitudes of one window of samples (mono mix of the given channels),
 * centred at `centre`, scaled the way the AnalyserNode scales them.
 *
 * @param {Float32Array[]} channels PCM.
 * @param {number}         centre   Sample index.
 * @param {number}         size     FFT size, a power of two.
 * @param {Float32Array}   out      size/2 magnitudes, written.
 */
export function magnitudes( channels, centre, size, out ) {
	const re = new Float32Array( size );
	const im = new Float32Array( size );
	const w = blackman( size );
	const start = Math.round( centre - size / 2 );
	const k = 1 / channels.length;
	for ( let i = 0; i < size; i++ ) {
		const at = start + i;
		let v = 0;
		for ( const ch of channels ) {
			v += at >= 0 && at < ch.length ? ch[ at ] : 0;
		}
		re[ i ] = v * k * w[ i ];
	}
	fft( re, im );
	for ( let i = 0; i < size / 2; i++ ) {
		out[ i ] = Math.hypot( re[ i ], im[ i ] ) / size;
	}
}

/**
 * Band edges as FFT bin ranges, log-spaced between fMin and fMax.
 *
 * @return {Array} [b0, b1) per band.
 */
export function bandRanges( bands, sampleRate, size, fMin = 40, fMax = 16000 ) {
	const binHz = sampleRate / size;
	const top = Math.min( fMax, sampleRate / 2 - binHz );
	const out = [];
	for ( let i = 0; i < bands; i++ ) {
		const f0 = fMin * Math.pow( top / fMin, i / bands );
		const f1 = fMin * Math.pow( top / fMin, ( i + 1 ) / bands );
		const b0 = Math.max( 1, Math.floor( f0 / binHz ) );
		out.push( [ b0, Math.max( b0 + 1, Math.ceil( f1 / binHz ) ) ] );
	}
	return out;
}

/**
 * The whole track as a grid of `cols` moments by `bands` frequency bands,
 * loudness in decibels spread to 0..1 across the track.
 *
 * @param {Object} buffer AudioBuffer-like: { length, sampleRate,
 *                        numberOfChannels, getChannelData( i ) }.
 * @param {number} cols   Moments.
 * @param {number} bands  Bands, bass first.
 * @return {{ data: Float32Array, cols: number, bands: number }}
 */
export function computeSpectrum( buffer, cols = 1024, bands = 64 ) {
	const size = 2048;
	const channels = [];
	for ( let c = 0; c < Math.min( 2, buffer.numberOfChannels ); c++ ) {
		channels.push( buffer.getChannelData( c ) );
	}
	const data = new Float32Array( cols * bands );
	if ( ! channels.length || ! buffer.length ) {
		return { data, cols, bands };
	}
	const ranges = bandRanges( bands, buffer.sampleRate || 44100, size );
	const mags = new Float32Array( size / 2 );
	for ( let c = 0; c < cols; c++ ) {
		const centre = ( ( c + 0.5 ) / cols ) * buffer.length;
		magnitudes( channels, centre, size, mags );
		for ( let b = 0; b < bands; b++ ) {
			const [ b0, b1 ] = ranges[ b ];
			let sum = 0;
			for ( let k = b0; k < b1; k++ ) {
				sum += mags[ k ] || 0;
			}
			data[ c * bands + b ] = 20 * Math.log10( sum / ( b1 - b0 ) + 1e-9 );
		}
	}
	// Spread by percentiles, like the brightness profile: one loud hit
	// must not leave the rest of the song in the dark.
	const sorted = Array.from( data ).sort( ( a, b ) => a - b );
	const lo = sorted[ Math.floor( sorted.length * 0.06 ) ];
	const hi = sorted[ Math.floor( sorted.length * 0.995 ) ];
	const range = Math.max( 1e-6, hi - lo );
	for ( let i = 0; i < data.length; i++ ) {
		data[ i ] = Math.max( 0, Math.min( 1, ( data[ i ] - lo ) / range ) );
	}
	return { data, cols, bands };
}

/**
 * A view of a spectrum: the part between from01 and to01, resampled to
 * `cols` moments (averaging, so a long song shrinks smoothly).
 */
export function spectrumWindow( spec, from01, to01, cols ) {
	const { data, bands } = spec;
	const out = new Float32Array( cols * bands );
	const a = Math.max( 0, Math.min( spec.cols - 1, Math.floor( spec.cols * from01 ) ) );
	const b = Math.max( a + 1, Math.min( spec.cols, Math.ceil( spec.cols * to01 ) ) );
	const span = b - a;
	for ( let c = 0; c < cols; c++ ) {
		const s0 = a + Math.floor( ( span * c ) / cols );
		const s1 = Math.max( s0 + 1, a + Math.floor( ( span * ( c + 1 ) ) / cols ) );
		for ( let k = 0; k < bands; k++ ) {
			let sum = 0;
			for ( let s = s0; s < s1; s++ ) {
				sum += data[ s * bands + k ];
			}
			out[ c * bands + k ] = sum / ( s1 - s0 );
		}
	}
	return { data: out, cols, bands };
}

/**
 * The AnalyserNode, worked out from the samples.
 *
 * Same FFT size, window, smoothing and decibel range as the live
 * analyser, and the same log-spaced bars as the studio's frequency
 * mapper - so a video rendered frame by frame dances like the preview.
 * Smoothing is per call, as in the browser; called at the video's frame
 * rate instead of the screen's, it is tightened to match.
 *
 * @param {Float32Array[]} channels   PCM of the clip.
 * @param {number}         sampleRate Its rate.
 * @param {Object}         o          `{ fftSize, smoothing, minDb, maxDb }`.
 * @return {{ bars( seconds, count ): Float32Array }}
 */
export function offlineAnalyser( channels, sampleRate, o = {} ) {
	const size = o.fftSize || 2048;
	const smoothing = o.smoothing ?? 0.82;
	const minDb = o.minDb ?? -100;
	const maxDb = o.maxDb ?? -30;
	const mags = new Float32Array( size / 2 );
	const smooth = new Float32Array( size / 2 );
	let ranges = null;
	let rangeCount = 0;
	return {
		bars( seconds, count ) {
			// The live analyser looks at the LAST fftSize samples.
			magnitudes( channels, seconds * sampleRate - size / 2, size, mags );
			for ( let i = 0; i < mags.length; i++ ) {
				smooth[ i ] = smoothing * smooth[ i ] + ( 1 - smoothing ) * mags[ i ];
			}
			if ( ! ranges || rangeCount !== count ) {
				ranges = bandRanges( count, sampleRate, size, 50, 11000 );
				rangeCount = count;
			}
			const out = new Float32Array( count );
			for ( let b = 0; b < count; b++ ) {
				const [ b0, b1 ] = ranges[ b ];
				let sum = 0;
				for ( let k = b0; k < b1; k++ ) {
					const db = 20 * Math.log10( smooth[ k ] + 1e-12 );
					sum += Math.max( 0, Math.min( 1, ( db - minDb ) / ( maxDb - minDb ) ) );
				}
				out[ b ] = sum / ( b1 - b0 );
			}
			return out;
		},
	};
}
