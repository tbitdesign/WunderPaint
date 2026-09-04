/**
 * Chord names: parsing, intervals, spelling and transposition. Pure data,
 * no DOM. Pitch classes are 0..11 with C = 0.
 */
export const NOTE_NAMES_SHARP = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B',
];
export const NOTE_NAMES_FLAT = [
	'C',
	'Db',
	'D',
	'Eb',
	'E',
	'F',
	'Gb',
	'G',
	'Ab',
	'A',
	'Bb',
	'B',
];
const LETTERS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11, H: 11 };

/** 'C', 'C#', 'Db', 'H' (German B) -> pitch class, or null. */
export function pitchClass( name ) {
	const m = /^([A-Ha-h])(#|b|♯|♭)?$/.exec( String( name || '' ).trim() );
	if ( ! m ) {
		return null;
	}
	let pc = LETTERS[ m[ 1 ].toUpperCase() ];
	if ( '#' === m[ 2 ] || '♯' === m[ 2 ] ) {
		pc += 1;
	} else if ( 'b' === m[ 2 ] || '♭' === m[ 2 ] ) {
		pc -= 1;
	}
	return ( ( pc % 12 ) + 12 ) % 12;
}

/* Quality spellings people type -> the canonical id. */
const ALIASES = {
	'': '',
	maj: '',
	M: '',
	major: '',
	m: 'm',
	min: 'm',
	'-': 'm',
	minor: 'm',
	7: '7',
	dom7: '7',
	maj7: 'maj7',
	M7: 'maj7',
	ma7: 'maj7',
	Δ: 'maj7',
	Δ7: 'maj7',
	major7: 'maj7',
	m7: 'm7',
	min7: 'm7',
	'-7': 'm7',
	dim: 'dim',
	o: 'dim',
	'°': 'dim',
	dim7: 'dim7',
	o7: 'dim7',
	'°7': 'dim7',
	aug: 'aug',
	'+': 'aug',
	'+5': 'aug',
	'#5': 'aug',
	sus2: 'sus2',
	sus4: 'sus4',
	sus: 'sus4',
	add9: 'add9',
	add2: 'add9',
	6: '6',
	m6: 'm6',
	min6: 'm6',
	9: '9',
	maj9: 'maj9',
	M9: 'maj9',
	m9: 'm9',
	min9: 'm9',
	11: '11',
	13: '13',
	'7sus4': '7sus4',
	'7sus': '7sus4',
	m7b5: 'm7b5',
	ø: 'm7b5',
	ø7: 'm7b5',
	min7b5: 'm7b5',
	'-7b5': 'm7b5',
	5: '5',
	mmaj7: 'mmaj7',
	mM7: 'mmaj7',
	'm(maj7)': 'mmaj7',
	minmaj7: 'mmaj7',
	69: '69',
	'6/9': '69',
};

const INTERVALS = {
	'': [ 0, 4, 7 ],
	m: [ 0, 3, 7 ],
	7: [ 0, 4, 7, 10 ],
	maj7: [ 0, 4, 7, 11 ],
	m7: [ 0, 3, 7, 10 ],
	dim: [ 0, 3, 6 ],
	dim7: [ 0, 3, 6, 9 ],
	aug: [ 0, 4, 8 ],
	sus2: [ 0, 2, 7 ],
	sus4: [ 0, 5, 7 ],
	add9: [ 0, 4, 7, 14 ],
	6: [ 0, 4, 7, 9 ],
	m6: [ 0, 3, 7, 9 ],
	9: [ 0, 4, 7, 10, 14 ],
	maj9: [ 0, 4, 7, 11, 14 ],
	m9: [ 0, 3, 7, 10, 14 ],
	11: [ 0, 4, 7, 10, 14, 17 ],
	13: [ 0, 4, 7, 10, 14, 21 ],
	'7sus4': [ 0, 5, 7, 10 ],
	m7b5: [ 0, 3, 6, 10 ],
	5: [ 0, 7 ],
	mmaj7: [ 0, 3, 7, 11 ],
	69: [ 0, 4, 7, 9, 14 ],
};

export const QUALITIES = Object.keys( INTERVALS );

/** Intervals in semitones above the root for a canonical quality. */
export function chordIntervals( quality ) {
	return (
		INTERVALS[
			ALIASES[ quality ] !== undefined ? ALIASES[ quality ] : quality
		] || null
	);
}

/** 'F#m7b5/A' -> { root: 6, quality: 'm7b5', bass: 9, name }, or null. */
export function parseChord( name ) {
	const s = String( name || '' ).trim();
	const m = /^([A-Ha-h])(#|b|♯|♭)?(.*?)(?:\/([A-Ha-h](?:#|b|♯|♭)?))?$/.exec(
		s
	);
	if ( ! m ) {
		return null;
	}
	// A lowercase root letter is only a root when nothing else reads as one
	// ('b' alone would be a flat sign in the wrong place).
	const root = pitchClass( m[ 1 ].toUpperCase() + ( m[ 2 ] || '' ) );
	const quality = ALIASES[ m[ 3 ] ];
	if ( root === null || quality === undefined ) {
		return null;
	}
	const bass = m[ 4 ]
		? pitchClass( m[ 4 ].charAt( 0 ).toUpperCase() + m[ 4 ].slice( 1 ) )
		: null;
	if ( m[ 4 ] && bass === null ) {
		return null;
	}
	return { root, quality, bass, name: s };
}

/** Pitch classes sounding in a chord (bass first when it is not a chord tone). */
export function chordPitches( parsed ) {
	const pcs = chordIntervals( parsed.quality ).map(
		( i ) => ( parsed.root + i ) % 12
	);
	if ( parsed.bass !== null && ! pcs.includes( parsed.bass ) ) {
		pcs.unshift( parsed.bass );
	}
	return [ ...new Set( pcs ) ];
}

/** 10 -> 'Bb' or 'A#'. */
export function spell( pc, prefer ) {
	const n = ( ( pc % 12 ) + 12 ) % 12;
	return ( 'flat' === prefer ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP )[ n ];
}

/** Keys that are written with flats; everything else takes sharps. */
export function keyPreference( key ) {
	const k = String( key || '' ).trim();
	const m = /^([A-Ha-h])(#|b|♯|♭)?\s*(m|min|minor|-)?/.exec( k );
	if ( ! m ) {
		return 'sharp';
	}
	const pc = pitchClass( m[ 1 ].toUpperCase() + ( m[ 2 ] || '' ) );
	const minor = !! m[ 3 ];
	const flatMajor = [ 5, 10, 3, 8, 1, 6 ]; // F Bb Eb Ab Db Gb
	const flatMinor = [ 2, 7, 0, 5, 10, 3 ]; // Dm Gm Cm Fm Bbm Ebm
	return ( minor ? flatMinor : flatMajor ).includes( pc ) ? 'flat' : 'sharp';
}

/** Transpose a chord name by semitones, keeping quality and slash bass. */
export function transposeChord( name, semitones, prefer = 'sharp' ) {
	const p = parseChord( name );
	if ( ! p || ! semitones ) {
		return name;
	}
	const root = spell( p.root + semitones, prefer );
	const bass =
		p.bass === null ? '' : '/' + spell( p.bass + semitones, prefer );
	// Keep the quality exactly as the user typed it.
	const m = /^([A-Ha-h])(#|b|♯|♭)?(.*?)(?:\/([A-Ha-h](?:#|b|♯|♭)?))?$/.exec(
		String( name ).trim()
	);
	return root + m[ 3 ] + bass;
}

/** The display name for a chord in a target spelling (root respelled, quality kept). */
export function respell( name, prefer ) {
	return transposeChord( name, 12, prefer ).replace( /^(.+)$/, '$1' );
}
