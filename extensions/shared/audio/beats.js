/**
 * Beat detection for the music track (v1.25), local and pure.
 *
 * The studio only knew a live throb from an analyser while playing. To
 * choreograph ON the beat it needs the grid before playing: the tempo and
 * where the first beat falls. The recipe is the classic one: an onset
 * envelope (rises in bass energy, where kick drums live, plus a little of
 * the full band), its autocorrelation for the tempo with a gentle
 * preference for ~120 BPM (half and double tempo correlate too), then the
 * phase whose beats collect the most onset energy. Steady-tempo music is
 * what reels use; a track without a clear pulse reports a low confidence
 * and the studio leaves the timing alone.
 */

const HOP = 256;

/** Rises in energy per hop: kick-weighted, detrended, never negative. */
export function onsetEnvelope( samples, sampleRate ) {
	const frames = Math.floor( samples.length / HOP );
	const env = new Float32Array( frames );
	if ( frames < 4 ) {
		return { env, rate: sampleRate / HOP };
	}
	// One-pole low-pass at ~150 Hz for the bass band.
	const a = Math.exp( ( -2 * Math.PI * 150 ) / sampleRate );
	let lp = 0;
	let prevLow = 0;
	let prevAll = 0;
	for ( let f = 0; f < frames; f++ ) {
		let low = 0;
		let all = 0;
		for ( let i = f * HOP, end = i + HOP; i < end; i++ ) {
			const x = samples[ i ];
			lp = lp * a + x * ( 1 - a );
			low += lp * lp;
			all += x * x;
		}
		const lowDb = Math.log( 1e-9 + low );
		const allDb = Math.log( 1e-9 + all );
		if ( f ) {
			env[ f ] =
				Math.max( 0, lowDb - prevLow ) +
				0.5 * Math.max( 0, allDb - prevAll );
		}
		prevLow = lowDb;
		prevAll = allDb;
	}
	// Remove the slow drift (crescendos) with a one-second moving mean.
	const rate = sampleRate / HOP;
	const win = Math.max( 3, Math.round( rate ) );
	const out = new Float32Array( frames );
	let sum = 0;
	for ( let f = 0; f < frames; f++ ) {
		sum += env[ f ];
		if ( f >= win ) {
			sum -= env[ f - win ];
		}
		out[ f ] = Math.max( 0, env[ f ] - sum / Math.min( f + 1, win ) );
	}
	return { env: out, rate };
}

const at = ( env, x ) => {
	const i = Math.floor( x );
	if ( i < 0 || i + 1 >= env.length ) {
		return 0;
	}
	const t = x - i;
	return env[ i ] * ( 1 - t ) + env[ i + 1 ] * t;
};

/**
 * @param {Float32Array} samples    Mono samples.
 * @param {number}       sampleRate Samples per second.
 * @return {Object} { bpm, first, confidence }: `first` is the time of the
 *                  first beat in seconds from sample 0 (0 <= first < beat
 *                  length); confidence 0..1, from 0.3 on a clear pulse.
 */
export function detectBeats( samples, sampleRate ) {
	const { env, rate } = onsetEnvelope( samples, sampleRate );
	const none = { bpm: 0, first: 0, confidence: 0 };
	if ( env.length < rate * 4 ) {
		return none;
	}
	// Tempo: autocorrelation over 60..200 BPM on a lightly smoothed
	// envelope (a lag is whole frames, spikes are narrow). Each lag also
	// collects its double and triple (a harmonic sum), so the real beat
	// beats its own half tempo; a gentle preference for ~120 BPM decides
	// the rest.
	const smooth = new Float32Array( env.length );
	for ( let i = 1; i < env.length - 1; i++ ) {
		smooth[ i ] =
			0.25 * env[ i - 1 ] + 0.5 * env[ i ] + 0.25 * env[ i + 1 ];
	}
	const minLag = ( 60 / 200 ) * rate;
	const maxLag = ( 60 / 60 ) * rate;
	// Autocorrelation at fractional lags: the true beat is rarely a whole
	// number of frames, and a misaligned lag loses to its own double.
	const acAt = ( lag ) => {
		let s = 0;
		const n = smooth.length - Math.ceil( lag ) - 1;
		for ( let i = 0; i < n; i++ ) {
			s += smooth[ i ] * at( smooth, i + lag );
		}
		return n > 0 ? s / n : 0;
	};
	let best = -1;
	let bestScore = 0;
	let mean = 0;
	let count = 0;
	for ( let lag = minLag; lag <= maxLag; lag += 0.25 ) {
		const base = acAt( lag );
		mean += base;
		count++;
		const bpm = ( 60 * rate ) / lag;
		const prior = Math.exp(
			-0.5 * Math.pow( Math.log2( bpm / 120 ) / 0.9, 2 )
		);
		const score =
			( base + 0.5 * acAt( lag * 2 ) + 0.25 * acAt( lag * 3 ) ) * prior;
		if ( score > bestScore ) {
			bestScore = score;
			best = lag;
		}
	}
	mean /= Math.max( 1, count );
	if ( best < 0 || mean <= 0 ) {
		return none;
	}
	// Tempo and phase together: a lag is a whole number of frames, and a
	// tempo off by half a percent drifts a full beat-fraction over 20 s.
	// The comb that collects the most onset energy wins.
	const comb = ( period, phase ) => {
		let sum = 0;
		for ( let x = phase; x < env.length - 1; x += period ) {
			sum += at( env, x ) + 0.5 * ( at( env, x - 1 ) + at( env, x + 1 ) );
		}
		return sum;
	};
	let period = best;
	let phase = 0;
	let top = -1;
	for ( let p = best * 0.97; p <= best * 1.03; p += 0.02 ) {
		for ( let ph = 0; ph < p; ph += 0.25 ) {
			const sc = comb( p, ph );
			if ( sc > top ) {
				top = sc;
				period = p;
				phase = ph;
			}
		}
	}
	// Confidence: the normalised autocorrelation at the beat distance -
	// near 0 for noise, well above 0.3 for a steady pulse.
	let m = 0;
	for ( let i = 0; i < env.length; i++ ) {
		m += env[ i ];
	}
	m /= env.length;
	let num = 0;
	let den = 0;
	for ( let i = 0; i < env.length; i++ ) {
		const d = env[ i ] - m;
		den += d * d;
		num += d * ( at( env, i + period ) - m );
	}
	return {
		bpm: Math.round( ( ( 60 * rate ) / period ) * 10 ) / 10,
		// A rise is registered in the frame it starts in: half a hop late
		// on average, so the frame's middle is the best estimate.
		first: Math.round( ( ( phase + 0.5 ) / rate ) * 1000 ) / 1000,
		confidence: den > 0 ? Math.round( ( num / den ) * 100 ) / 100 : 0,
	};
}

/**
 * The beat grid in SCENE time: the scene starts `offset` seconds into the
 * track. Returns { period, first } with 0 <= first < period, or null.
 *
 * @param {Object} audio Scene audio { bpm, beat0, offset }.
 */
export function sceneBeats( audio ) {
	if ( ! audio || ! ( audio.bpm > 0 ) ) {
		return null;
	}
	const period = 60 / audio.bpm;
	const first =
		( ( ( ( audio.beat0 || 0 ) - ( audio.offset || 0 ) ) % period ) +
			period ) %
		period;
	return { period, first };
}
