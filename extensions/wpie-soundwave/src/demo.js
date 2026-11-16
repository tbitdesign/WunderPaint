/**
 * The example sound (v2.5): a short piece of music made in code, so the
 * studio opens on a wave instead of an empty frame.
 *
 * No file, no download: drums, bass, chords and a little melody are
 * synthesised sample by sample from a fixed seed, so the example is the
 * same on every machine and costs nothing to ship. It is shaped like a
 * song on purpose - a quiet intro, a verse, a build, a loud chorus and an
 * outro - because a wave is only interesting where the loudness moves,
 * and both channels differ a little, so the stereo split has something to
 * show. It plays, too: the video preview and export use it like any track.
 */

const BPM = 120;
const BEAT = 60 / BPM;
const BARS = 12;
export const DEMO_SECONDS = BARS * 4 * BEAT;

/** Seeded noise. */
function mulberry( seed ) {
	let a = seed >>> 0;
	return () => {
		a = ( a + 0x6d2b79f5 ) >>> 0;
		let t = Math.imul( a ^ ( a >>> 15 ), 1 | a );
		t = ( t + Math.imul( t ^ ( t >>> 7 ), 61 | t ) ) ^ t;
		return ( ( t ^ ( t >>> 14 ) ) >>> 0 ) / 4294967296;
	};
}

const hz = ( midi ) => 440 * Math.pow( 2, ( midi - 69 ) / 12 );

/** A sine by table lookup, `cycles` in turns: some ten million of these
 * are needed, and Math.sin made opening the studio noticeably slower. */
const TABLE = 4096;
const SINE = new Float32Array( TABLE + 1 );
for ( let i = 0; i <= TABLE; i++ ) {
	SINE[ i ] = Math.sin( ( 2 * Math.PI * i ) / TABLE );
}
const sine = ( cycles ) => {
	const x = ( cycles - Math.floor( cycles ) ) * TABLE;
	const i = x | 0;
	return SINE[ i ] + ( SINE[ i + 1 ] - SINE[ i ] ) * ( x - i );
};

/** A minor, F, C, G - one chord per bar, roots for the bass. */
const ROOTS = [ 45, 41, 48, 43 ];
const CHORDS = [
	[ 57, 60, 64 ],
	[ 53, 57, 60 ],
	[ 55, 60, 64 ],
	[ 55, 59, 62 ],
];
/** The chorus melody, one note per eighth, null = rest. */
const MELODY = [
	76, null, 74, 72, 74, null, 72, 69,
	72, null, 74, 76, 79, null, 76, 74,
	76, null, 74, 72, 71, null, 72, 74,
	72, null, 69, 71, 72, null, null, null,
];

/** How the song is built, bar by bar: 'intro' | 'verse' | 'build' | 'chorus' | 'outro'. */
export function sectionOf( bar ) {
	if ( bar < 2 ) {
		return 'intro';
	}
	if ( bar < 6 ) {
		return 'verse';
	}
	if ( bar < 8 ) {
		return 'build';
	}
	if ( bar < 11 ) {
		return 'chorus';
	}
	return 'outro';
}

/**
 * Render the example.
 *
 * @param {number} sampleRate Samples per second.
 * @return {{ sampleRate, length, numberOfChannels, duration,
 *            getChannelData( c ) }} An AudioBuffer-like object.
 */
export function demoSong( sampleRate = 44100 ) {
	const length = Math.round( DEMO_SECONDS * sampleRate );
	const L = new Float32Array( length );
	const R = new Float32Array( length );
	const rnd = mulberry( 20261019 );
	const at = ( s ) => Math.max( 0, Math.min( length - 1, Math.round( s * sampleRate ) ) );

	/** Add a voice from t0 for `dur` seconds: fn( t ) -> sample, panned. */
	const add = ( t0, dur, gain, pan, fn ) => {
		const a = at( t0 );
		const b = at( t0 + dur );
		const gl = gain * Math.min( 1, 1 - pan );
		const gr = gain * Math.min( 1, 1 + pan );
		for ( let i = a; i < b; i++ ) {
			const v = fn( ( i - a ) / sampleRate );
			L[ i ] += v * gl;
			R[ i ] += v * gr;
		}
	};

	const kick = ( t0, g ) =>
		add( t0, 0.32, g, 0, ( t ) => {
			// The pitch falls from 120 to 45 Hz; integrated, so the phase
			// stays continuous while it does.
			const cycles = 45 * t + ( 75 / 28 ) * ( 1 - Math.exp( -t * 28 ) );
			return sine( cycles ) * Math.exp( -t * 9 );
		} );
	const snare = ( t0, g ) => {
		const noise = Array.from( { length: Math.round( 0.2 * sampleRate ) }, () => rnd() * 2 - 1 );
		add( t0, 0.2, g, 0.05, ( t ) => {
			const i = Math.min( noise.length - 1, Math.round( t * sampleRate ) );
			return ( noise[ i ] * 0.8 + sine( 185 * t ) * 0.4 ) * Math.exp( -t * 18 );
		} );
	};
	const hat = ( t0, g, open ) => {
		let prev = 0;
		add( t0, open ? 0.22 : 0.06, g, 0.35, ( t ) => {
			const n = rnd() * 2 - 1;
			const v = n - prev;
			prev = n;
			return v * Math.exp( -t * ( open ? 14 : 60 ) );
		} );
	};
	const bass = ( t0, dur, midi, g ) =>
		add( t0, dur, g, -0.05, ( t ) => {
			const f = hz( midi );
			let v = 0;
			for ( let h = 1; h <= 4; h++ ) {
				v += sine( f * h * t ) / h;
			}
			return v * Math.min( 1, t * 60 ) * Math.exp( -t * 2.2 );
		} );
	const pad = ( t0, dur, notes, g ) => {
		notes.forEach( ( midi, k ) =>
			add( t0, dur, g, k === 0 ? -0.5 : k === 2 ? 0.5 : 0, ( t ) => {
				const f = hz( midi );
				const env = Math.min( 1, t / 0.6 ) * Math.min( 1, ( dur - t ) / 0.4 );
				return ( sine( f * t ) + 0.3 * sine( f * 2.003 * t ) ) * env;
			} )
		);
	};
	const lead = ( t0, dur, midi, g ) =>
		add( t0, dur, g, 0.15, ( t ) => {
			const f = hz( midi );
			// A soft triangle.
			const ph = ( f * t ) % 1;
			const tri = 4 * Math.abs( ph - 0.5 ) - 1;
			return tri * Math.min( 1, t * 80 ) * Math.exp( -t * 3 );
		} );

	for ( let bar = 0; bar < BARS; bar++ ) {
		const part = sectionOf( bar );
		const t0 = bar * 4 * BEAT;
		const chord = bar % 4;
		const loud = { intro: 0.35, verse: 0.6, build: 0.7, chorus: 1, outro: 0.4 }[ part ];
		pad( t0, 4 * BEAT, CHORDS[ chord ], 0.05 * ( part === 'chorus' ? 1.4 : 1 ) );
		if ( part !== 'intro' && part !== 'outro' ) {
			for ( let b = 0; b < 4; b++ ) {
				bass( t0 + b * BEAT, BEAT * 0.9, ROOTS[ chord ], 0.16 * loud );
			}
		}
		for ( let b = 0; b < 4; b++ ) {
			const tb = t0 + b * BEAT;
			if ( part === 'chorus' || ( part !== 'intro' && b % 2 === 0 ) ) {
				kick( tb, 0.55 * loud );
			}
			if ( part !== 'intro' && part !== 'outro' && b % 2 === 1 ) {
				snare( tb, 0.32 * loud );
			}
			for ( const e of [ 0, 0.5 ] ) {
				hat( tb + e * BEAT, 0.05 * loud + 0.02, part === 'chorus' && e === 0.5 );
			}
			if ( part === 'build' ) {
				// The roll that leads into the chorus gets denser and louder.
				const steps = bar === 7 ? 4 : 2;
				for ( let s = 0; s < steps; s++ ) {
					snare( tb + ( s * BEAT ) / steps, 0.08 + 0.06 * ( b / 4 ) + ( bar === 7 ? 0.1 : 0 ) );
				}
			}
		}
		if ( part === 'chorus' ) {
			for ( let e = 0; e < 8; e++ ) {
				const note = MELODY[ ( ( bar - 8 ) * 8 + e ) % MELODY.length ];
				if ( note ) {
					lead( t0 + e * BEAT * 0.5, BEAT * 0.48, note, 0.11 );
				}
			}
		}
		if ( part === 'outro' ) {
			kick( t0, 0.5 );
		}
	}

	// Fade the very end, and bring the loudest moment to just under full.
	const fade = at( DEMO_SECONDS - 1.2 );
	let peak = 0;
	for ( let i = 0; i < length; i++ ) {
		if ( i > fade ) {
			const k = 1 - ( i - fade ) / ( length - fade );
			L[ i ] *= k;
			R[ i ] *= k;
		}
		peak = Math.max( peak, Math.abs( L[ i ] ), Math.abs( R[ i ] ) );
	}
	const norm = peak > 0 ? 0.9 / peak : 1;
	for ( let i = 0; i < length; i++ ) {
		L[ i ] *= norm;
		R[ i ] *= norm;
	}
	return {
		sampleRate,
		length,
		numberOfChannels: 2,
		duration: length / sampleRate,
		getChannelData: ( c ) => ( c ? R : L ),
	};
}
