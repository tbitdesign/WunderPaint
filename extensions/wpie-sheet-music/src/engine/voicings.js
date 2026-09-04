/**
 * Instruments, tunings, curated open chords and a voicing finder for
 * everything the tables do not cover. Shapes list frets from the LOW
 * string to the high one: -1 muted, 0 open, n = fret.
 */
import {
	parseChord,
	chordPitches,
	chordIntervals,
	spell,
	NOTE_NAMES_SHARP,
	NOTE_NAMES_FLAT,
} from './chords.js';

export const INSTRUMENTS = {
	guitar: {
		label: 'Guitar',
		strings: 6,
		frets: 22,
		tunings: {
			standard: [ 'E2', 'A2', 'D3', 'G3', 'B3', 'E4' ],
			'drop-d': [ 'D2', 'A2', 'D3', 'G3', 'B3', 'E4' ],
			dadgad: [ 'D2', 'A2', 'D3', 'G3', 'A3', 'D4' ],
		},
	},
	ukulele: {
		label: 'Ukulele',
		strings: 4,
		frets: 15,
		tunings: {
			standard: [ 'G4', 'C4', 'E4', 'A4' ],
			baritone: [ 'D3', 'G3', 'B3', 'E4' ],
		},
	},
	bass: {
		label: 'Bass',
		strings: 4,
		frets: 20,
		tunings: { standard: [ 'E1', 'A1', 'D2', 'G2' ] },
	},
	mandolin: {
		label: 'Mandolin',
		strings: 4,
		frets: 20,
		tunings: { standard: [ 'G3', 'D4', 'A4', 'E5' ] },
	},
	banjo: {
		label: 'Banjo',
		strings: 5,
		frets: 22,
		tunings: { standard: [ 'G4', 'D3', 'G3', 'B3', 'D4' ] },
	},
	piano: { label: 'Piano', strings: 0, frets: 0, tunings: {} },
};

export const TUNING_LABELS = {
	standard: 'Standard',
	'drop-d': 'Drop D',
	dadgad: 'DADGAD',
	baritone: 'Baritone',
};

const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'E2' -> 40 (C4 = 60). */
export function noteToMidi( n ) {
	const m = /^([A-G])(#|b)?(-?\d)$/.exec( n );
	if ( ! m ) {
		return null;
	}
	return (
		( parseInt( m[ 3 ], 10 ) + 1 ) * 12 +
		LETTER[ m[ 1 ] ] +
		( '#' === m[ 2 ] ? 1 : 'b' === m[ 2 ] ? -1 : 0 )
	);
}

const shape = ( frets, fingers, barre = null ) => ( { frets, fingers, barre } );

export const CURATED = {
	guitar: {
		C: shape( [ -1, 3, 2, 0, 1, 0 ], [ 0, 3, 2, 0, 1, 0 ] ),
		G: shape( [ 3, 2, 0, 0, 0, 3 ], [ 2, 1, 0, 0, 0, 3 ] ),
		D: shape( [ -1, -1, 0, 2, 3, 2 ], [ 0, 0, 0, 1, 3, 2 ] ),
		A: shape( [ -1, 0, 2, 2, 2, 0 ], [ 0, 0, 1, 2, 3, 0 ] ),
		E: shape( [ 0, 2, 2, 1, 0, 0 ], [ 0, 2, 3, 1, 0, 0 ] ),
		Am: shape( [ -1, 0, 2, 2, 1, 0 ], [ 0, 0, 2, 3, 1, 0 ] ),
		Em: shape( [ 0, 2, 2, 0, 0, 0 ], [ 0, 2, 3, 0, 0, 0 ] ),
		Dm: shape( [ -1, -1, 0, 2, 3, 1 ], [ 0, 0, 0, 2, 3, 1 ] ),
		F: shape( [ 1, 3, 3, 2, 1, 1 ], [ 1, 3, 4, 2, 1, 1 ], {
			fret: 1,
			from: 0,
			to: 5,
		} ),
		B7: shape( [ -1, 2, 1, 2, 0, 2 ], [ 0, 2, 1, 3, 0, 4 ] ),
		D7: shape( [ -1, -1, 0, 2, 1, 2 ], [ 0, 0, 0, 2, 1, 3 ] ),
		G7: shape( [ 3, 2, 0, 0, 0, 1 ], [ 3, 2, 0, 0, 0, 1 ] ),
		A7: shape( [ -1, 0, 2, 0, 2, 0 ], [ 0, 0, 2, 0, 3, 0 ] ),
		E7: shape( [ 0, 2, 0, 1, 0, 0 ], [ 0, 2, 0, 1, 0, 0 ] ),
		C7: shape( [ -1, 3, 2, 3, 1, 0 ], [ 0, 3, 2, 4, 1, 0 ] ),
		Cmaj7: shape( [ -1, 3, 2, 0, 0, 0 ], [ 0, 3, 2, 0, 0, 0 ] ),
		Fmaj7: shape( [ -1, -1, 3, 2, 1, 0 ], [ 0, 0, 3, 2, 1, 0 ] ),
		Am7: shape( [ -1, 0, 2, 0, 1, 0 ], [ 0, 0, 2, 0, 1, 0 ] ),
		Em7: shape( [ 0, 2, 2, 0, 3, 0 ], [ 0, 1, 2, 0, 3, 0 ] ),
		Dm7: shape( [ -1, -1, 0, 2, 1, 1 ], [ 0, 0, 0, 2, 1, 1 ], {
			fret: 1,
			from: 4,
			to: 5,
		} ),
		Asus2: shape( [ -1, 0, 2, 2, 0, 0 ], [ 0, 0, 1, 2, 0, 0 ] ),
		Dsus4: shape( [ -1, -1, 0, 2, 3, 3 ], [ 0, 0, 0, 1, 2, 3 ] ),
		Bm: shape( [ -1, 2, 4, 4, 3, 2 ], [ 0, 1, 3, 4, 2, 1 ], {
			fret: 2,
			from: 1,
			to: 5,
		} ),
		'F#m': shape( [ 2, 4, 4, 2, 2, 2 ], [ 1, 3, 4, 1, 1, 1 ], {
			fret: 2,
			from: 0,
			to: 5,
		} ),
	},
	ukulele: {
		C: shape( [ 0, 0, 0, 3 ], [ 0, 0, 0, 3 ] ),
		G: shape( [ 0, 2, 3, 2 ], [ 0, 1, 3, 2 ] ),
		Am: shape( [ 2, 0, 0, 0 ], [ 2, 0, 0, 0 ] ),
		F: shape( [ 2, 0, 1, 0 ], [ 2, 0, 1, 0 ] ),
		D: shape( [ 2, 2, 2, 0 ], [ 1, 2, 3, 0 ] ),
		Em: shape( [ 0, 4, 3, 2 ], [ 0, 3, 2, 1 ] ),
		A: shape( [ 2, 1, 0, 0 ], [ 2, 1, 0, 0 ] ),
		E: shape( [ 1, 4, 0, 2 ], [ 1, 3, 0, 2 ] ),
		Dm: shape( [ 2, 2, 1, 0 ], [ 2, 3, 1, 0 ] ),
		G7: shape( [ 0, 2, 1, 2 ], [ 0, 2, 1, 3 ] ),
		C7: shape( [ 0, 0, 0, 1 ], [ 0, 0, 0, 1 ] ),
		A7: shape( [ 0, 1, 0, 0 ], [ 0, 1, 0, 0 ] ),
		D7: shape( [ 2, 2, 2, 3 ], [ 1, 1, 1, 2 ], {
			fret: 2,
			from: 0,
			to: 2,
		} ),
		E7: shape( [ 1, 2, 0, 2 ], [ 1, 2, 0, 3 ] ),
		Bb: shape( [ 3, 2, 1, 1 ], [ 3, 2, 1, 1 ], {
			fret: 1,
			from: 2,
			to: 3,
		} ),
		Fm: shape( [ 1, 0, 1, 3 ], [ 1, 0, 2, 4 ] ),
	},
};

/** Pitch classes sounding in a shape on a tuning. */
export function shapePitches( sh, tuningNotes ) {
	return sh.frets
		.map( ( f, i ) =>
			f < 0 ? null : ( noteToMidi( tuningNotes[ i ] ) + f ) % 12
		)
		.filter( ( x ) => null !== x );
}

/**
 * Playable shapes for a set of pitch classes on a tuning: every chord
 * tone present, at most `maxSpan` frets wide, at most `maxFingers`
 * fingers (a barre counts once), no muted string between sounding ones.
 * Sorted by a playability score, best first.
 */
export function findVoicings(
	pcs,
	tuningNotes,
	{
		maxSpan = 4,
		maxFingers = 4,
		frets = 15,
		minStrings = 3,
		limit = 6,
		optional = [],
	} = {}
) {
	const all = [ ...new Set( pcs.map( ( p ) => ( ( p % 12 ) + 12 ) % 12 ) ) ];
	const rootPc = all[ 0 ];
	// Tones that may be left out (the fifth, a low extension) still must
	// not be replaced by foreign notes: `all` gates the strings, `need`
	// gates the result.
	const need = all.filter( ( p ) => ! optional.includes( p ) );
	const open = tuningNotes.map( ( n ) => noteToMidi( n ) % 12 );
	const results = [];
	const seen = new Set();
	const n = tuningNotes.length;
	for ( let lo = 1; lo + maxSpan - 1 <= frets; lo++ ) {
		const hi = lo + maxSpan - 1;
		const cur = new Array( n ).fill( -1 );
		const walk = ( s ) => {
			if ( s === n ) {
				consider( cur );
				return;
			}
			const choices = [ -1, 0 ];
			for ( let f = lo; f <= hi; f++ ) {
				choices.push( f );
			}
			for ( const f of choices ) {
				if ( f >= 0 && ! all.includes( ( open[ s ] + f ) % 12 ) ) {
					continue;
				}
				cur[ s ] = f;
				walk( s + 1 );
			}
			cur[ s ] = -1;
		};
		const consider = ( fr ) => {
			const key = fr.join( ',' );
			if ( seen.has( key ) ) {
				return;
			}
			const sounding = fr.map( ( f, i ) =>
				f < 0 ? null : ( open[ i ] + f ) % 12
			);
			const have = new Set( sounding.filter( ( x ) => null !== x ) );
			if (
				have.size < need.length ||
				! need.every( ( p ) => have.has( p ) )
			) {
				return;
			}
			const played = fr.filter( ( f ) => f >= 0 ).length;
			if ( played < Math.min( minStrings, n ) ) {
				return;
			}
			// No muted string inside the sounding block.
			const first = fr.findIndex( ( f ) => f >= 0 );
			let last = fr.length - 1;
			while ( fr[ last ] < 0 ) {
				last--;
			}
			let mutedInside = 0;
			for ( let i = first; i <= last; i++ ) {
				if ( fr[ i ] < 0 ) {
					mutedInside++;
				}
			}
			if ( mutedInside ) {
				return;
			}
			const fretted = fr.filter( ( f ) => f > 0 );
			if ( ! fretted.length ) {
				// All open: only valid when the tuning itself spells the chord.
			}
			const minF = fretted.length ? Math.min( ...fretted ) : 0;
			// A barre: the lowest fretted fret shared by two or more strings with nothing lower between.
			let barre = null;
			if ( fretted.length >= 2 ) {
				const at = fr
					.map( ( f, i ) => ( f === minF ? i : -1 ) )
					.filter( ( i ) => i >= 0 );
				if ( at.length >= 2 ) {
					const from = at[ 0 ];
					const to = at[ at.length - 1 ];
					let ok = true;
					for ( let i = from; i <= to; i++ ) {
						if ( fr[ i ] >= 0 && fr[ i ] < minF ) {
							ok = false;
						}
					}
					if ( ok && to - from >= 1 ) {
						barre = { fret: minF, from, to };
					}
				}
			}
			const fingersNeeded = barre
				? fretted.length -
				  fr.filter(
						( f, i ) =>
							f === minF && i >= barre.from && i <= barre.to
				  ).length +
				  1
				: fretted.length;
			if ( fingersNeeded > maxFingers ) {
				return;
			}
			const openCount = fr.filter( ( f ) => 0 === f ).length;
			const bassIsRoot = sounding[ first ] === rootPc;
			const score =
				fingersNeeded * 3 +
				( fretted.length ? minF : 0 ) -
				openCount -
				( bassIsRoot ? 4 : 0 ) +
				( n - played ) * 1.5;
			seen.add( key );
			results.push( {
				frets: [ ...fr ],
				fingers: assignFingers( fr, barre ),
				barre,
				score,
			} );
		};
		walk( 0 );
	}
	results.sort( ( a, b ) => a.score - b.score );
	return results.slice( 0, limit ).map( ( { score, ...rest } ) => rest );
}

/** Finger numbers by fret order (barre = finger 1), a pragmatic assignment. */
function assignFingers( fr, barre ) {
	const fingers = fr.map( () => 0 );
	const spots = [];
	fr.forEach( ( f, i ) => {
		if ( f > 0 ) {
			if (
				barre &&
				f === barre.fret &&
				i >= barre.from &&
				i <= barre.to
			) {
				fingers[ i ] = 1;
			} else {
				spots.push( { i, f } );
			}
		}
	} );
	spots.sort( ( a, b ) => a.f - b.f || a.i - b.i );
	let next = barre ? 2 : 1;
	for ( const s of spots ) {
		fingers[ s.i ] = Math.min( 4, next++ );
	}
	return fingers;
}

/** Curated shape or the best computed voicing for a chord on an instrument. */
export function shapeFor( chordName, instrumentId, tuningId = 'standard' ) {
	const p = parseChord( chordName );
	const inst = INSTRUMENTS[ instrumentId ];
	if ( ! p || ! inst || ! inst.strings ) {
		return null;
	}
	const tuning = inst.tunings[ tuningId ] || inst.tunings.standard;
	const table =
		( 'standard' === tuningId || ! inst.tunings[ tuningId ] ) &&
		CURATED[ instrumentId ];
	if ( table ) {
		const q = p.quality;
		for ( const root of [
			NOTE_NAMES_SHARP[ p.root ],
			NOTE_NAMES_FLAT[ p.root ],
		] ) {
			const hit = table[ root + q ];
			if ( hit && p.bass === null ) {
				return {
					...hit,
					frets: [ ...hit.frets ],
					fingers: [ ...hit.fingers ],
				};
			}
		}
	}
	const found = findVoicings( chordPitches( p ), tuning, {
		frets: inst.frets - 4,
		optional: optionalTones( p ),
	} );
	return found[ 0 ] || null;
}

/**
 * Which tones a voicing may drop: the perfect fifth once the chord has
 * more than three tones, then the lowest extension while more than four
 * tones remain. Altered fifths (dim, aug, m7b5) always stay.
 */
export function optionalTones( p ) {
	const iv = chordIntervals( p.quality ) || [];
	if ( iv.length <= 3 ) {
		return [];
	}
	const drop = [];
	if ( iv.includes( 7 ) ) {
		drop.push( 7 );
	}
	const ext = iv.filter( ( i ) => i > 12 ).sort( ( a, b ) => a - b );
	let remain = iv.length - drop.length;
	while ( remain > 4 && ext.length > 1 ) {
		drop.push( ext.shift() );
		remain--;
	}
	return drop.map( ( i ) => ( p.root + i ) % 12 );
}

/** Keys of a keyboard from C4 upward, marked for a pitch-class set. */
export function pianoKeys( pcs, rootPc, octaves = 2, prefer = 'sharp' ) {
	const set = new Set( pcs );
	const keys = [];
	for ( let k = 0; k < octaves * 12; k++ ) {
		const midi = 60 + k;
		const pc = midi % 12;
		keys.push( {
			midi,
			pc,
			black: [ 1, 3, 6, 8, 10 ].includes( pc ),
			on: set.has( pc ),
			root: pc === rootPc,
			label: spell( pc, prefer ),
		} );
	}
	return keys;
}
