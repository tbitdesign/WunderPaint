/**
 * A song, read for painting: local and pure, no library, no service.
 *
 * One pass over mono samples (22050 Hz is plenty) turns a song into what
 * a painter can follow: curves over time (how loud, how much bass, how
 * much air, how bright, how busy), the accents where something strikes,
 * the beat grid, the sections where the music changes, and a character
 * of the whole song. Loudness and balance are read against the song
 * itself, so a quiet sonata has its loud moments too; the character
 * keeps the absolute levels, so a quiet sonata still reads as quiet.
 *
 * Every curve is 0..1, one value per hop (512 samples), and finite for
 * any input, silence included.
 */
import { detectBeats } from './beats.js';

const N = 1024;
const HOP = 512;
// Below this a frame counts as silence: no accents, no loudness.
const SILENT_DB = -60;
// The smallest rise (log magnitude per bin, bands averaged) that can be
// an accent at all. Measured on the test signals: a held chord breathes
// at 0.12 at most, a hi-hat strikes at 1.7 and more, a kick at 3 and more.
const FLUX_FLOOR = 0.6;

// From this beat confidence on the song has a pulse to paint on. Measured
// on real recordings: acid techno 0.28, a pop song 0.49, two Bach
// preludes on the piano 0.03 and 0.09. (Motion Graphics asks 0.3 of its
// own reels.)
export const PULSE = 0.2;

const clamp01 = ( v ) => ( v > 1 ? 1 : v > 0 ? v : 0 );

/** Hann window of length n. */
function hann( n ) {
	const w = new Float64Array( n );
	for ( let i = 0; i < n; i++ ) {
		w[ i ] = 0.5 - 0.5 * Math.cos( ( 2 * Math.PI * i ) / ( n - 1 ) );
	}
	return w;
}

/** An in-place radix-2 FFT with its tables made once. */
function makeFft( n ) {
	const rev = new Uint32Array( n );
	const bits = Math.log2( n );
	for ( let i = 0; i < n; i++ ) {
		let r = 0;
		for ( let b = 0; b < bits; b++ ) {
			r = ( r << 1 ) | ( ( i >> b ) & 1 );
		}
		rev[ i ] = r;
	}
	const cos = new Float64Array( n / 2 );
	const sin = new Float64Array( n / 2 );
	for ( let i = 0; i < n / 2; i++ ) {
		cos[ i ] = Math.cos( ( -2 * Math.PI * i ) / n );
		sin[ i ] = Math.sin( ( -2 * Math.PI * i ) / n );
	}
	return ( re, im ) => {
		for ( let i = 0; i < n; i++ ) {
			const j = rev[ i ];
			if ( i < j ) {
				let t = re[ i ];
				re[ i ] = re[ j ];
				re[ j ] = t;
				t = im[ i ];
				im[ i ] = im[ j ];
				im[ j ] = t;
			}
		}
		for ( let size = 2; size <= n; size <<= 1 ) {
			const half = size >> 1;
			const step = n / size;
			for ( let start = 0; start < n; start += size ) {
				for ( let k = 0; k < half; k++ ) {
					const c = cos[ k * step ];
					const s = sin[ k * step ];
					const a = start + k;
					const b = a + half;
					const tr = re[ b ] * c - im[ b ] * s;
					const ti = re[ b ] * s + im[ b ] * c;
					re[ b ] = re[ a ] - tr;
					im[ b ] = im[ a ] - ti;
					re[ a ] += tr;
					im[ a ] += ti;
				}
			}
		}
	};
}

/** The q-quantile of the values where keep() holds (0 if none). */
function quantile( values, q, keep = null ) {
	const list = [];
	for ( let i = 0; i < values.length; i++ ) {
		if ( ! keep || keep( i ) ) {
			list.push( values[ i ] );
		}
	}
	if ( ! list.length ) {
		return 0;
	}
	list.sort( ( a, b ) => a - b );
	return list[ Math.min( list.length - 1, Math.floor( q * list.length ) ) ];
}

/** One-pole smoothing with separate rise and fall times (in frames). */
function smooth( values, rise, fall = rise ) {
	const out = new Float32Array( values.length );
	const ka = 1 - Math.exp( -1 / Math.max( 0.5, rise ) );
	const kr = 1 - Math.exp( -1 / Math.max( 0.5, fall ) );
	let v = values.length ? values[ 0 ] : 0;
	for ( let i = 0; i < values.length; i++ ) {
		const x = values[ i ];
		v += ( x - v ) * ( x > v ? ka : kr );
		out[ i ] = v;
	}
	return out;
}

/** Map against the song's own spread (p10..p90), blended with a fixed scale. */
function relative( values, active, absolute, minSpread = 0.15, weight = 0.7 ) {
	const lo = quantile( values, 0.1, active );
	const hi = quantile( values, 0.9, active );
	const spread = Math.max( minSpread, hi - lo );
	const out = new Float32Array( values.length );
	for ( let i = 0; i < values.length; i++ ) {
		if ( ! active( i ) ) {
			out[ i ] = 0;
			continue;
		}
		const rel = clamp01( ( values[ i ] - lo ) / spread );
		out[ i ] = clamp01(
			weight * rel + ( 1 - weight ) * absolute( values[ i ] )
		);
	}
	return out;
}

/**
 * The analysis as a generator: it yields its progress (0..1) now and
 * then while it reads frames, and returns the song.
 */
function* analysis( samples, sampleRate ) {
	const sr = sampleRate;
	const n = samples.length;
	const frames = Math.max( 1, Math.floor( Math.max( 0, n - N ) / HOP ) + 1 );
	const hop = HOP / sr;
	const t0 = N / 2 / sr;
	const fft = makeFft( N );
	const win = hann( N );
	const re = new Float64Array( N );
	const im = new Float64Array( N );
	const prevLog = new Float64Array( N / 2 );
	const binHz = sr / N;
	const kBass = Math.max( 2, Math.round( 250 / binHz ) );
	const kMid = Math.max( kBass + 1, Math.round( 2000 / binHz ) );
	const norm = N / 4; // a full-scale sine peaks near 1 after this
	const db = new Float32Array( frames );
	const shareLow = new Float32Array( frames );
	const shareHigh = new Float32Array( frames );
	const centroid = new Float32Array( frames );
	const flux = new Float32Array( frames );

	for ( let f = 0; f < frames; f++ ) {
		const off = f * HOP;
		let e = 0;
		for ( let i = 0; i < N; i++ ) {
			const v = off + i < n ? samples[ off + i ] : 0;
			e += v * v;
			re[ i ] = v * win[ i ];
			im[ i ] = 0;
		}
		const rms = Math.sqrt( e / N );
		db[ f ] = rms > 1e-6 ? 20 * Math.log10( rms ) : -120;
		fft( re, im );
		let low = 0;
		let mid = 0;
		let high = 0;
		let weighted = 0;
		let total = 0;
		// The rise per band, averaged over its bins: a kick moves a few
		// low bins, a hi-hat hundreds of high ones - summed over all bins
		// the hat would drown every kick, and the kick is the beat.
		let riseLow = 0;
		let riseMid = 0;
		let riseHigh = 0;
		for ( let k = 1; k < N / 2; k++ ) {
			const mag = Math.hypot( re[ k ], im[ k ] ) / norm;
			const lg = Math.log1p( 1000 * mag );
			const up = lg > prevLog[ k ] ? lg - prevLog[ k ] : 0;
			prevLog[ k ] = lg;
			if ( k < kBass ) {
				low += mag;
				riseLow += up;
			} else if ( k < kMid ) {
				mid += mag;
				riseMid += up;
			} else {
				high += mag;
				riseHigh += up;
			}
			weighted += k * binHz * mag;
			total += mag;
		}
		const sum = low + mid + high;
		shareLow[ f ] = sum > 0 ? low / sum : 0;
		shareHigh[ f ] = sum > 0 ? high / sum : 0;
		centroid[ f ] = total > 0 ? weighted / total : 0;
		flux[ f ] =
			db[ f ] > SILENT_DB && f > 0
				? ( 1.5 * riseLow ) / ( kBass - 1 ) +
				  riseMid / ( kMid - kBass ) +
				  riseHigh / ( N / 2 - kMid )
				: 0;
		if ( 255 === ( f & 255 ) ) {
			yield f / frames;
		}
	}

	const active = ( i ) => db[ i ] > SILENT_DB;
	const anyActive = db.some( ( v ) => v > SILENT_DB );

	// Loudness: against the song (p05..p95), with a fixed dB scale mixed in.
	const lo = quantile( db, 0.05, active );
	const hi = quantile( db, 0.95, active );
	const range = Math.max( 6, hi - lo );
	const rawLoud = new Float32Array( frames );
	for ( let i = 0; i < frames; i++ ) {
		if ( ! active( i ) ) {
			continue;
		}
		const rel = clamp01( ( db[ i ] - lo ) / range );
		const abs = clamp01( ( db[ i ] + 40 ) / 32 );
		rawLoud[ i ] = clamp01( 0.7 * rel + 0.3 * abs );
	}
	const frameRate = 1 / hop;
	const loud = smooth( rawLoud, 0.04 * frameRate, 0.35 * frameRate );

	// Balance: bass share and air share, each against the song itself.
	const low = relative( smooth( shareLow, 0.25 * frameRate ), active, ( v ) =>
		clamp01( v / 0.5 )
	);
	const air = relative(
		smooth( shareHigh, 0.25 * frameRate ),
		active,
		( v ) => clamp01( v / 0.5 )
	);
	const octave = ( hz ) =>
		clamp01(
			( Math.log2( Math.max( 1, hz ) ) - Math.log2( 300 ) ) /
				Math.log2( 3000 / 300 )
		);
	const bright = relative(
		smooth( centroid, 0.4 * frameRate ),
		active,
		octave,
		200,
		0.6
	);

	// Accents: peaks of the spectral rise over a local threshold.
	const wide = Math.max( 2, Math.round( 0.35 * frameRate ) );
	const prefix = new Float64Array( frames + 1 );
	for ( let i = 0; i < frames; i++ ) {
		prefix[ i + 1 ] = prefix[ i ] + flux[ i ];
	}
	const localMean = ( i ) => {
		const a = Math.max( 0, i - wide );
		const b = Math.min( frames, i + wide + 1 );
		return ( prefix[ b ] - prefix[ a ] ) / ( b - a );
	};
	const top = quantile( flux, 0.95, active );
	const minGap = Math.max( 2, Math.round( 0.08 * frameRate ) );
	const peaks = [];
	let last = -Infinity;
	for ( let i = 2; i < frames - 2; i++ ) {
		const v = flux[ i ];
		if (
			v < FLUX_FLOOR ||
			v < flux[ i - 1 ] ||
			v < flux[ i - 2 ] ||
			v <= flux[ i + 1 ] ||
			v <= flux[ i + 2 ]
		) {
			continue;
		}
		const thr = 1.4 * localMean( i ) + 0.06 * top;
		if ( v <= thr ) {
			continue;
		}
		if ( i - last < minGap ) {
			// Two rises in one strike: keep the stronger.
			const prev = peaks[ peaks.length - 1 ];
			if ( prev && v - thr > prev.x ) {
				prev.i = i;
				prev.x = v - thr;
				last = i;
			}
			continue;
		}
		peaks.push( { i, x: v - thr } );
		last = i;
	}
	const scale =
		quantile(
			Float32Array.from( peaks, ( p ) => p.x ),
			0.9
		) || 1;
	const accents = {
		t: new Float32Array( peaks.length ),
		s: new Float32Array( peaks.length ),
	};
	peaks.forEach( ( p, k ) => {
		// The rise peaks when the strike reaches the middle of the window.
		accents.t[ k ] = p.i * hop + t0 - hop / 2;
		accents.s[ k ] = Math.max( 0.02, Math.min( 1, p.x / scale ) );
	} );

	// Busyness: accents per second around each moment, six or more = 1.
	const busyRaw = new Float32Array( frames );
	const reach = Math.round( 1 * frameRate );
	for ( const p of peaks ) {
		for (
			let i = Math.max( 0, p.i - reach );
			i < Math.min( frames, p.i + reach );
			i++
		) {
			busyRaw[ i ] += 1 / 2;
		}
	}
	for ( let i = 0; i < frames; i++ ) {
		busyRaw[ i ] = clamp01( busyRaw[ i ] / 6 );
	}
	const busy = smooth( busyRaw, 0.5 * frameRate );

	const beat = anyActive
		? detectBeats( samples, sr )
		: { bpm: 0, first: 0, confidence: 0 };

	const duration = n / sr;
	const sections = findSections( {
		loud,
		low,
		air,
		bright,
		busy,
		hop,
		t0,
		frames,
		duration,
	} );

	// The character of the whole song.
	let activeFrames = 0;
	let dbSum = 0;
	let octSum = 0;
	let lowSum = 0;
	let fluxSum = 0;
	for ( let i = 0; i < frames; i++ ) {
		if ( active( i ) ) {
			activeFrames++;
			dbSum += db[ i ];
			octSum += octave( centroid[ i ] );
			lowSum += shareLow[ i ];
			fluxSum += flux[ i ];
		}
	}
	const activeSeconds = activeFrames * hop;
	const strong = peaks.length
		? Array.from( accents.s ).filter( ( s ) => s >= 0.2 ).length
		: 0;
	const rate = activeSeconds > 0 ? strong / activeSeconds : 0;
	const crest =
		activeFrames && fluxSum > 0
			? quantile( flux, 0.97, active ) / ( fluxSum / activeFrames )
			: 0;
	const energy = activeFrames
		? clamp01( ( dbSum / activeFrames + 40 ) / 30 )
		: 0;
	const character = activeFrames
		? {
				percussive: clamp01(
					0.75 * clamp01( ( rate - 0.4 ) / 3.2 ) +
						0.25 * clamp01( ( crest - 2 ) / 6 )
				),
				energy,
				full: clamp01( 0.55 * energy + 0.45 * clamp01( rate / 4 ) ),
				bright: octSum / activeFrames,
				dynamics: clamp01(
					( quantile( db, 0.95, active ) -
						quantile( db, 0.1, active ) -
						4 ) /
						24
				),
				low: clamp01( lowSum / activeFrames / 0.5 ),
				tempo: beat.confidence >= PULSE ? beat.bpm : 0,
				pulse: beat.confidence || 0,
		  }
		: {
				percussive: 0,
				energy: 0,
				full: 0,
				bright: 0,
				dynamics: 0,
				low: 0,
				tempo: 0,
				pulse: 0,
		  };

	return {
		duration,
		sampleRate: sr,
		hop,
		t0,
		frames,
		loud,
		low,
		air,
		bright,
		busy,
		accents,
		beat,
		sections,
		character,
	};
}

/**
 * Where the music changes: a novelty search over one-second blocks,
 * comparing what came before with what follows.
 */
function findSections( {
	loud,
	low,
	air,
	bright,
	busy,
	hop,
	t0,
	frames,
	duration,
} ) {
	const blocks = Math.floor( duration );
	const one = [ { start: 0, end: duration } ];
	const fill = ( list ) =>
		list.map( ( s ) => {
			const a = Math.max( 0, Math.floor( ( s.start - t0 ) / hop ) );
			const b = Math.min(
				frames,
				Math.max( a + 1, Math.floor( ( s.end - t0 ) / hop ) )
			);
			let l = 0;
			let y = 0;
			for ( let i = a; i < b; i++ ) {
				l += loud[ i ];
				y += busy[ i ];
			}
			return { ...s, loud: l / ( b - a ), busy: y / ( b - a ) };
		} );
	if ( blocks < 12 ) {
		return fill( one );
	}
	const curves = [ loud, low, air, bright, busy ];
	const weights = [ 1.4, 0.6, 0.6, 0.8, 0.8 ];
	const vec = [];
	for ( let k = 0; k < blocks; k++ ) {
		const a = Math.max( 0, Math.floor( ( k - t0 ) / hop ) );
		const b = Math.min(
			frames,
			Math.max( a + 1, Math.floor( ( k + 1 - t0 ) / hop ) )
		);
		vec.push(
			curves.map( ( c ) => {
				let s = 0;
				for ( let i = a; i < b; i++ ) {
					s += c[ i ];
				}
				return s / ( b - a );
			} )
		);
	}
	const W = 6;
	const edge = 4;
	const nov = new Float32Array( blocks );
	for ( let k = edge; k <= blocks - edge; k++ ) {
		const wb = Math.min( W, k );
		const wa = Math.min( W, blocks - k );
		let d = 0;
		for ( let c = 0; c < curves.length; c++ ) {
			let before = 0;
			let after = 0;
			for ( let j = k - wb; j < k; j++ ) {
				before += vec[ j ][ c ];
			}
			for ( let j = k; j < k + wa; j++ ) {
				after += vec[ j ][ c ];
			}
			const diff = after / wa - before / wb;
			d += weights[ c ] * diff * diff;
		}
		nov[ k ] = Math.sqrt( d );
	}
	let m = 0;
	let m2 = 0;
	let cnt = 0;
	for ( let k = edge; k <= blocks - edge; k++ ) {
		m += nov[ k ];
		m2 += nov[ k ] * nov[ k ];
		cnt++;
	}
	m /= Math.max( 1, cnt );
	const sd = Math.sqrt( Math.max( 0, m2 / Math.max( 1, cnt ) - m * m ) );
	const thr = Math.max( 0.12, m + 0.8 * sd );
	const cuts = [];
	for ( let k = edge; k <= blocks - edge; k++ ) {
		if ( nov[ k ] < thr ) {
			continue;
		}
		let peak = true;
		for (
			let j = Math.max( edge, k - 4 );
			j <= Math.min( blocks - edge, k + 4 );
			j++
		) {
			if ( nov[ j ] > nov[ k ] || ( nov[ j ] === nov[ k ] && j < k ) ) {
				peak = false;
				break;
			}
		}
		if ( ! peak ) {
			continue;
		}
		if ( cuts.length && k - cuts[ cuts.length - 1 ] < 8 ) {
			continue;
		}
		cuts.push( k );
	}
	const list = [];
	let start = 0;
	for ( const k of cuts ) {
		list.push( { start, end: k } );
		start = k;
	}
	list.push( { start, end: duration } );
	return fill( list );
}

/** Read the whole song at once (tests, proofs, workers). */
export function analyzeSong( samples, sampleRate ) {
	const it = analysis( samples, sampleRate );
	let r = it.next();
	while ( ! r.done ) {
		r = it.next();
	}
	return r.value;
}

/**
 * Read the song in slices so the page keeps breathing (a long song is a
 * second of arithmetic). Rejects with an AbortError when `signal` fires.
 */
export async function analyzeSongAsync(
	samples,
	sampleRate,
	{ signal = null, onProgress = null, sliceMs = 12 } = {}
) {
	const now = () =>
		'undefined' !== typeof performance ? performance.now() : Date.now();
	const it = analysis( samples, sampleRate );
	let mark = now();
	let r = it.next();
	while ( ! r.done ) {
		if ( signal && signal.aborted ) {
			throw new DOMException( 'Aborted', 'AbortError' );
		}
		if ( now() - mark > sliceMs ) {
			if ( onProgress ) {
				onProgress( r.value );
			}
			await new Promise( ( res ) => setTimeout( res, 0 ) );
			mark = now();
		}
		r = it.next();
	}
	return r.value;
}

/** The curves at song time t (seconds), read between frames. */
export function songAt( song, t ) {
	const x = ( t - song.t0 ) / song.hop;
	const last = song.frames - 1;
	const i = Math.max( 0, Math.min( last, Math.floor( x ) ) );
	const j = Math.min( last, i + 1 );
	const f = Math.max( 0, Math.min( 1, x - i ) );
	const at = ( c ) => c[ i ] + ( c[ j ] - c[ i ] ) * f;
	return {
		loud: at( song.loud ),
		low: at( song.low ),
		air: at( song.air ),
		bright: at( song.bright ),
		busy: at( song.busy ),
	};
}
