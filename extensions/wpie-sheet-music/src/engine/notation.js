/**
 * ABC for the lesson cards: blank manuscript paper, note-reading cards
 * and scale sheets. DOM-free; the cards hand the ABC to abcjs.
 */
import { scaleSteps } from './scales.js';
import { NOTE_NAMES_SHARP, NOTE_NAMES_FLAT } from './chords.js';

/* ------------------------------ option lists ------------------------------ */

export const CLEF_OPTIONS = [
	{ value: 'treble', label: 'Treble clef' },
	{ value: 'bass', label: 'Bass clef' },
	{ value: 'grand', label: 'Grand staff (piano)' },
	{ value: 'alto', label: 'Alto clef' },
	{ value: 'tenor', label: 'Tenor clef' },
	{ value: 'none', label: 'No clef' },
];
export const KEY_OPTIONS = [
	'C',
	'G',
	'D',
	'A',
	'E',
	'B',
	'F#',
	'F',
	'Bb',
	'Eb',
	'Ab',
	'Db',
	'Gb',
	'Am',
	'Em',
	'Bm',
	'F#m',
	'C#m',
	'Dm',
	'Gm',
	'Cm',
	'Fm',
	'Bbm',
].map( ( k ) => ( { value: k, label: k } ) );
export const METER_OPTIONS = [
	{ value: 'none', label: 'No meter' },
	{ value: '4/4', label: '4/4' },
	{ value: '3/4', label: '3/4' },
	{ value: '2/4', label: '2/4' },
	{ value: '6/8', label: '6/8' },
	{ value: '2/2', label: '2/2' },
];
export const FLASH_CLEFS = [
	{ value: 'treble', label: 'Treble clef' },
	{ value: 'bass', label: 'Bass clef' },
	{ value: 'both', label: 'Both clefs' },
];
export const FLASH_RANGES = [
	{ value: 'lines', label: 'Notes on the lines' },
	{ value: 'spaces', label: 'Notes in the spaces' },
	{ value: 'all', label: 'Lines and spaces' },
	{ value: 'ledger', label: 'Ledger lines' },
	{ value: 'everything', label: 'Everything' },
];
export const NAME_SYSTEMS = [
	{ value: 'letters', label: 'Letters (C D E)' },
	{ value: 'german', label: 'German (C D E, H)' },
	{ value: 'solfege', label: 'Solfège (Do Re Mi)' },
];
export const SIDE_OPTIONS = [
	{ value: 'front', label: 'Fronts (the notes)' },
	{ value: 'back', label: 'Backs (the names)' },
];
export const SCALE_MODES = [
	{ value: 'one', label: 'One scale' },
	{ value: 'majors', label: 'All twelve majors' },
	{ value: 'minors', label: 'All twelve harmonic minors' },
];
export const DIRECTIONS = [
	{ value: 'up', label: 'Ascending' },
	{ value: 'updown', label: 'Ascending and descending' },
];
export const FINGERING_OPTIONS = [
	{ value: 'none', label: 'No fingering' },
	{ value: 'right', label: 'Piano, right hand' },
	{ value: 'left', label: 'Piano, left hand' },
	{ value: 'both', label: 'Piano, both hands' },
	{ value: 'tab', label: 'Guitar tablature' },
];

/* ------------------------------ manuscript paper -------------------------- */

const BEATS = {
	'4/4': [ 4, 4 ],
	'3/4': [ 3, 4 ],
	'2/4': [ 2, 4 ],
	'6/8': [ 6, 8 ],
	'2/2': [ 4, 4 ],
};

/** Blank staves: invisible rests draw only clef, key, meter and bar lines. */
export function paperAbc( o ) {
	const staves = Math.max( 1, Math.min( 24, o.staves || 10 ) );
	const bars = Math.max(
		0,
		Math.min( 8, o.bars === undefined ? 4 : o.bars )
	);
	const meter = o.meter && 'none' !== o.meter ? o.meter : 'none';
	const [ n, unit ] = BEATS[ meter ] || [ 8, 8 ];
	const bar = 'x' + n;
	const line = bars ? ( bar + '|' ).repeat( bars ) : 'x' + n * 4;
	const key = o.key || 'C';
	const head = [
		'X:1',
		'%%staffsep ' + Math.round( o.sep || 90 ),
		'%%stretchlast 1',
		'M:' + meter,
		'L:1/' + unit,
	];
	if ( 'grand' === o.clef ) {
		head.push(
			'%%score {1 2}',
			'V:1 clef=treble',
			'V:2 clef=bass',
			'K:' + key
		);
		const body = [];
		for ( let i = 0; i < staves; i++ ) {
			body.push( '[V:1] ' + line, '[V:2] ' + line );
		}
		return head.join( '\n' ) + '\n' + body.join( '\n' ) + '\n';
	}
	head.push( 'K:' + key + ' clef=' + ( o.clef || 'treble' ) );
	const body = [];
	for ( let i = 0; i < staves; i++ ) {
		body.push( line );
	}
	return head.join( '\n' ) + '\n' + body.join( '\n' ) + '\n';
}

/* ------------------------------- note cards ------------------------------- */

const LETTERS = 'CDEFGAB';
const NATURAL_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SOLFEGE = {
	C: 'Do',
	D: 'Re',
	E: 'Mi',
	F: 'Fa',
	G: 'Sol',
	A: 'La',
	B: 'Si',
};

/** Midi of a natural note, e.g. ( 'E', 4 ) = 64. */
export const naturalMidi = ( letter, octave ) =>
	12 * ( octave + 1 ) + NATURAL_PC[ letter ];

/** ABC pitch text for a natural note: C4 = C, C5 = c, C3 = C, C6 = c' */
export function abcNatural( letter, octave ) {
	if ( octave >= 5 ) {
		return letter.toLowerCase() + "'".repeat( octave - 5 );
	}
	return letter + ','.repeat( Math.max( 0, 4 - octave ) );
}

const RANGES = {
	treble: {
		lines: [
			[ 'E', 4 ],
			[ 'G', 4 ],
			[ 'B', 4 ],
			[ 'D', 5 ],
			[ 'F', 5 ],
		],
		spaces: [
			[ 'F', 4 ],
			[ 'A', 4 ],
			[ 'C', 5 ],
			[ 'E', 5 ],
		],
		ledger: [
			[ 'A', 3 ],
			[ 'B', 3 ],
			[ 'C', 4 ],
			[ 'D', 4 ],
			[ 'G', 5 ],
			[ 'A', 5 ],
			[ 'B', 5 ],
			[ 'C', 6 ],
		],
	},
	bass: {
		lines: [
			[ 'G', 2 ],
			[ 'B', 2 ],
			[ 'D', 3 ],
			[ 'F', 3 ],
			[ 'A', 3 ],
		],
		spaces: [
			[ 'A', 2 ],
			[ 'C', 3 ],
			[ 'E', 3 ],
			[ 'G', 3 ],
		],
		ledger: [
			[ 'C', 2 ],
			[ 'D', 2 ],
			[ 'E', 2 ],
			[ 'F', 2 ],
			[ 'B', 3 ],
			[ 'C', 4 ],
			[ 'D', 4 ],
			[ 'E', 4 ],
		],
	},
};

/** The notes of a range on a clef: { clef, letter, octave, midi, abc }. */
export function flashNotes( clef, range ) {
	const clefs =
		'both' === clef
			? [ 'treble', 'bass' ]
			: [ clef in RANGES ? clef : 'treble' ];
	const out = [];
	for ( const c of clefs ) {
		const r = RANGES[ c ];
		let list;
		if ( 'lines' === range || 'spaces' === range || 'ledger' === range ) {
			list = r[ range ];
		} else if ( 'everything' === range ) {
			list = [ ...r.lines, ...r.spaces, ...r.ledger ];
		} else {
			list = [ ...r.lines, ...r.spaces ];
		}
		list = list
			.slice()
			.sort(
				( a, b ) =>
					naturalMidi( a[ 0 ], a[ 1 ] ) -
					naturalMidi( b[ 0 ], b[ 1 ] )
			);
		for ( const [ letter, octave ] of list ) {
			out.push( {
				clef: c,
				letter,
				octave,
				midi: naturalMidi( letter, octave ),
				abc: abcNatural( letter, octave ),
			} );
		}
	}
	return out;
}

/** The name on the back of a card. */
export function noteName( note, system ) {
	if ( 'german' === system ) {
		return 'B' === note.letter ? 'H' : note.letter;
	}
	if ( 'solfege' === system ) {
		return SOLFEGE[ note.letter ];
	}
	return note.letter;
}

/** One whole note on a staff, nothing else. */
export function flashAbc( note ) {
	return `X:1\n%%stretchlast 1\nM:none\nL:1/1\nK:C clef=${ note.clef }\nx ${ note.abc } x|]\n`;
}

/* ------------------------------- scale sheets ----------------------------- */

export const CIRCLE_MAJORS = [
	'C',
	'G',
	'D',
	'A',
	'E',
	'B',
	'F#',
	'Db',
	'Ab',
	'Eb',
	'Bb',
	'F',
];
export const CIRCLE_MINORS = [
	'A',
	'E',
	'B',
	'F#',
	'C#',
	'G#',
	'Eb',
	'Bb',
	'F',
	'C',
	'G',
	'D',
];

/* Standard one-octave fingerings, ascending; the descent is the mirror. */
export const PIANO_FINGERINGS = {
	major: {
		right: {
			C: '12312345',
			G: '12312345',
			D: '12312345',
			A: '12312345',
			E: '12312345',
			B: '12312345',
			'F#': '23412312',
			Gb: '23412312',
			F: '12341234',
			Bb: '41231234',
			Eb: '31234123',
			Ab: '34123123',
			Db: '23123412',
			'C#': '23123412',
		},
		left: {
			C: '54321321',
			G: '54321321',
			D: '54321321',
			A: '54321321',
			E: '54321321',
			B: '43214321',
			'F#': '43213214',
			Gb: '43213214',
			F: '54321321',
			Bb: '32143213',
			Eb: '32143213',
			Ab: '32143213',
			Db: '32143213',
			'C#': '32143213',
		},
	},
	minor: {
		right: {
			A: '12312345',
			E: '12312345',
			B: '12312345',
			'F#': '34123123',
			'C#': '34123123',
			'G#': '34123123',
			Ab: '34123123',
			Eb: '31234123',
			'D#': '31234123',
			Bb: '21231234',
			'A#': '21231234',
			F: '12341234',
			C: '12312345',
			G: '12312345',
			D: '12312345',
		},
		left: {
			A: '54321321',
			E: '54321321',
			B: '43214321',
			'F#': '43213214',
			'C#': '32143213',
			'G#': '32132143',
			Ab: '32132143',
			Eb: '21432132',
			'D#': '21432132',
			Bb: '21321432',
			'A#': '21321432',
			F: '54321321',
			C: '54321321',
			G: '54321321',
			D: '54321321',
		},
	},
};

/* Scales that a key signature can carry, with the ABC mode word. */
const MODE_KEY = {
	major: '',
	'natural-minor': 'm',
	'harmonic-minor': 'm',
	'melodic-minor': 'm',
	dorian: 'dor',
	phrygian: 'phr',
	lydian: 'lyd',
	mixolydian: 'mix',
	locrian: 'loc',
	'major-pentatonic': '',
	'minor-pentatonic': 'm',
	blues: 'm',
};
/* The diatonic set the signature covers, as steps from the root. */
const SIGNATURE_STEPS = {
	'': [ 0, 2, 4, 5, 7, 9, 11 ],
	m: [ 0, 2, 3, 5, 7, 8, 10 ],
	dor: [ 0, 2, 3, 5, 7, 9, 10 ],
	phr: [ 0, 1, 3, 5, 7, 8, 10 ],
	lyd: [ 0, 2, 4, 6, 7, 9, 11 ],
	mix: [ 0, 2, 4, 5, 7, 9, 10 ],
	loc: [ 0, 1, 3, 5, 6, 8, 10 ],
};

const letterIndex = ( letter ) => LETTERS.indexOf( letter );

/**
 * Spell a scale on a root: the key signature (ABC K: value), and every
 * note as { letter, octaveShift, accidental (relative to natural: -2..2),
 * inSignature }. Diatonic scales take the letters in turn; the rest are
 * spelled from the sharp or flat names.
 */
export function spellScale( rootName, scaleId, prefer ) {
	const steps = scaleSteps( scaleId ) || [ 0, 2, 4, 5, 7, 9, 11 ];
	const rootLetter = rootName[ 0 ].toUpperCase();
	const rootAcc =
		( rootName.slice( 1 ).match( /#/g ) || [] ).length -
		( rootName.slice( 1 ).match( /b/g ) || [] ).length;
	const rootPc = ( NATURAL_PC[ rootLetter ] + rootAcc + 12 ) % 12;
	const mode = MODE_KEY[ scaleId ];
	const notes = [];
	if (
		undefined !== mode &&
		( 7 === steps.length || 5 === steps.length || 6 === steps.length )
	) {
		// Diatonic letters: the key's seven letters carry the signature.
		const sig = SIGNATURE_STEPS[ mode ];
		const sigAcc = {};
		for ( let i = 0; i < 7; i++ ) {
			const letter = LETTERS[ ( letterIndex( rootLetter ) + i ) % 7 ];
			const want = ( rootPc + sig[ i ] ) % 12;
			let acc = want - NATURAL_PC[ letter ];
			if ( acc > 6 ) {
				acc -= 12;
			}
			if ( acc < -6 ) {
				acc += 12;
			}
			sigAcc[ letter ] = acc;
		}
		for ( const step of steps ) {
			const pc = ( rootPc + step ) % 12;
			// The letter whose signature pitch is closest to the wanted pitch.
			let best = null;
			for ( const letter of LETTERS ) {
				const sigPc =
					( NATURAL_PC[ letter ] + sigAcc[ letter ] + 12 ) % 12;
				let d = ( pc - sigPc + 12 ) % 12;
				if ( d > 6 ) {
					d -= 12;
				}
				const rank = Math.abs( d ) * 10 + ( 0 === d ? 0 : 5 );
				if ( ! best || rank < best.rank ) {
					best = { letter, rank, d };
				}
			}
			const acc = sigAcc[ best.letter ] + best.d;
			notes.push( {
				letter: best.letter,
				accidental: acc,
				inSignature: 0 === best.d,
				step,
			} );
		}
		return { key: rootName + mode, notes, sigAcc };
	}
	// No signature: sharps or flats from the names.
	const names = 'flat' === prefer ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP;
	for ( const step of steps ) {
		const pc = ( rootPc + step ) % 12;
		const name = names[ pc ];
		notes.push( {
			letter: name[ 0 ],
			accidental: '#' === name[ 1 ] ? 1 : 'b' === name[ 1 ] ? -1 : 0,
			inSignature:
				0 === ( '#' === name[ 1 ] ? 1 : 'b' === name[ 1 ] ? -1 : 0 ),
			step,
		} );
	}
	return { key: 'C', notes, sigAcc: {} };
}

const ACC = { 2: '^^', 1: '^', 0: '=', '-1': '_', '-2': '__' };

/**
 * A scale as ABC: root, scale, octaves, direction, fingering annotations.
 * Accidentals are written against the signature AND the bar state, so a
 * natural after a raised note in the same bar is written explicitly.
 */
export function scaleAbc( o ) {
	const rootName = o.root || 'C';
	const scaleId = o.scale || 'major';
	const octaves = 2 === o.octaves ? 2 : 1;
	const spelled = spellScale( rootName, scaleId, o.prefer );
	const steps = spelled.notes.map( ( n ) => n.step );
	// Written pitches: start at octave 4 (bass clef: 2 or 3).
	const baseOct = 'bass' === o.clef ? 2 : 4;
	const seq = [];
	for ( let oct = 0; oct < octaves; oct++ ) {
		spelled.notes.forEach( ( n, i ) =>
			seq.push( {
				...n,
				midi:
					12 * ( baseOct + oct + 1 ) +
					( NATURAL_PC[ rootName[ 0 ].toUpperCase() ] +
						( rootName[ 1 ] === '#'
							? 1
							: rootName[ 1 ] === 'b'
							? -1
							: 0 ) ) +
					steps[ i ],
				index: i,
			} )
		);
	}
	const top = spelled.notes[ 0 ];
	seq.push( {
		...top,
		midi:
			12 * ( baseOct + octaves + 1 ) +
			( NATURAL_PC[ rootName[ 0 ].toUpperCase() ] +
				( rootName[ 1 ] === '#'
					? 1
					: rootName[ 1 ] === 'b'
					? -1
					: 0 ) ),
		index: 0,
	} );
	let notes = seq;
	if ( 'updown' === o.direction ) {
		notes = [ ...seq, ...seq.slice( 0, -1 ).reverse() ];
	}
	// Fingerings.
	const fam = /minor|blues|dor|phr|loc/.test( scaleId ) ? 'minor' : 'major';
	const rh =
		'right' === o.fingering || 'both' === o.fingering
			? PIANO_FINGERINGS[ fam ].right[ rootName ] ||
			  PIANO_FINGERINGS[ fam ].right.C
			: null;
	const lh =
		'left' === o.fingering || 'both' === o.fingering
			? PIANO_FINGERINGS[ fam ].left[ rootName ] ||
			  PIANO_FINGERINGS[ fam ].left.C
			: null;
	const fingerAt = ( table, k, total, ascending ) => {
		if ( ! table || 7 !== spelled.notes.length ) {
			return '';
		}
		// One-octave pattern: the last digit is the top note; two octaves repeat the first seven.
		const asc = table.split( '' );
		if ( ascending ) {
			const idx = k === total - 1 ? 7 : k % 7;
			return asc[ idx ] || '';
		}
		const idx = k === 0 ? 7 : k % 7;
		return asc[ idx ] || '';
	};
	// Bars of eight notes; the accidental state per letter resets each bar.
	const out = [];
	let barState = {};
	let count = 0;
	const upCount = seq.length;
	notes.forEach( ( n, i ) => {
		if ( count && count % 8 === 0 ) {
			out.push( '|' );
			barState = {};
		}
		count++;
		const letter = n.letter;
		const octave = Math.floor( ( n.midi - n.accidental ) / 12 ) - 1;
		const current =
			letter in barState
				? barState[ letter ]
				: spelled.sigAcc[ letter ] || 0;
		let acc = '';
		if ( n.accidental !== current ) {
			acc = ACC[ n.accidental ];
			barState[ letter ] = n.accidental;
		}
		const ascending = i < upCount;
		const k = ascending ? i : notes.length - 1 - i;
		const parts = [];
		const f1 = fingerAt( rh, k, upCount, true );
		const f2 = fingerAt( lh, k, upCount, true );
		if ( f1 ) {
			parts.push( `"^${ f1 }"` );
		}
		if ( f2 ) {
			parts.push( `"_${ f2 }"` );
		}
		parts.push( acc + abcNatural( letter, octave ) );
		out.push( parts.join( '' ) );
	} );
	const head = [ 'X:1', '%%stretchlast 1' ];
	if ( o.title ) {
		head.push( 'T:' + o.title );
	}
	head.push(
		'M:none',
		'L:1/8',
		'K:' + spelled.key + ( 'bass' === o.clef ? ' clef=bass' : '' )
	);
	return head.join( '\n' ) + '\n' + out.join( ' ' ) + '|]\n';
}
