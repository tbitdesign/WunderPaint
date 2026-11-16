/** Musical building blocks for the visual editor and the lesson cards.
 * Durations use twelve ticks per quarter; tuplets therefore stay exact. */
import {
	pitchClass,
	keyPreference,
	chordIntervals,
	parseChord,
	chordPitches,
} from './chords.js';
import { spellScale, abcNatural } from './notation.js';
import {
	INSTRUMENTS,
	shapeFor,
	findVoicings,
	optionalTones,
} from './voicings.js';

export const DURATIONS = [
	{ value: 48, label: 'Whole note', symbol: '𝅝' },
	{ value: 36, label: 'Dotted half', symbol: '𝅗𝅥·' },
	{ value: 24, label: 'Half note', symbol: '𝅗𝅥' },
	{ value: 18, label: 'Dotted quarter', symbol: '♩·' },
	{ value: 12, label: 'Quarter note', symbol: '♩' },
	{ value: 9, label: 'Dotted eighth', symbol: '♪·' },
	{ value: 6, label: 'Eighth note', symbol: '♪' },
	{ value: 3, label: 'Sixteenth note', symbol: '♬' },
];
export const ROOTS = [
	'C',
	'Db',
	'D',
	'Eb',
	'E',
	'F',
	'F#',
	'G',
	'Ab',
	'A',
	'Bb',
	'B',
];
export const WORKSHOP_DEFAULTS = {
	melody: {
		meter: '4/4',
		key: 'C',
		clef: 'treble',
		pickup: 0,
		notes: [
			{ pitch: 'C4', ticks: 12 },
			{ pitch: 'D4', ticks: 12 },
			{ pitch: 'E4', ticks: 12 },
			{ pitch: 'G4', ticks: 12 },
			{ pitch: 'F4', ticks: 12 },
			{ pitch: 'E4', ticks: 12 },
			{ pitch: 'C4', ticks: 24 },
		],
	},
	rhythm: {
		kind: 'clap',
		meter: '4/4',
		bars: 4,
		rows: 2,
		level: 'eighths',
		seed: 17,
		counts: true,
		accents: true,
		blanks: false,
		rests: true,
		pattern: 'down-up',
	},
	harmony: {
		topic: 'circle',
		quality: '',
		interval: 4,
		minor: false,
		progression: '1 5 6 4',
		sevenths: false,
	},
	lesson: { keyboard: true, fretboard: true, chords: true, explanation: '' },
	grip: {
		variants: {},
		custom: {},
		leftHanded: false,
		compare: false,
		fingers: true,
	},
	excerpt: {
		from: 1,
		to: 0,
		voice: 0,
		highlightFrom: 0,
		highlightTo: 0,
		highlightVoice: 0,
	},
};
export const WORKSHOP_TYPES = [
	{
		id: 'melody',
		label: 'Melody Builder',
		hint: 'Create a melody with keys, note values and rests.',
	},
	{
		id: 'rhythm',
		label: 'Rhythm Workshop',
		hint: 'Rhythm exercises, strumming, picking and drum grooves.',
	},
	{
		id: 'harmony',
		label: 'Harmony Atlas',
		hint: 'Circle of fifths, intervals, chords and progressions.',
	},
	{
		id: 'lesson',
		label: 'Lesson Sheet',
		hint: 'Notation, keys, fretboard and chords in one coordinated sheet.',
	},
];
export const THEMES = [
	{
		id: 'classic',
		label: 'Classic engraving',
		paper: 'white',
		ink: '#1a1a1a',
		accent: '#8d1436',
		titleFont: 'Georgia',
		textFont: 'Arial',
		decoration: 'rule',
	},
	{
		id: 'classroom',
		label: 'Modern classroom',
		paper: 'white',
		ink: '#173447',
		accent: '#087e8b',
		titleFont: 'Arial',
		textFont: 'Arial',
		decoration: 'band',
	},
	{
		id: 'songbook',
		label: 'Warm songbook',
		paper: 'cream',
		ink: '#362921',
		accent: '#ae572d',
		titleFont: 'Georgia',
		textFont: 'Arial',
		decoration: 'rule',
	},
	{
		id: 'blueprint',
		label: 'Midnight study',
		paper: 'dark',
		ink: '#f1f5f9',
		accent: '#7dd3fc',
		titleFont: 'Arial',
		textFont: 'Arial',
		decoration: 'band',
	},
	{
		id: 'botanical',
		label: 'Sage notebook',
		paper: 'cream',
		ink: '#243e36',
		accent: '#447c60',
		titleFont: 'Georgia',
		textFont: 'Arial',
		decoration: 'frame',
	},
	{
		id: 'poster',
		label: 'Editorial poster',
		paper: 'white',
		ink: '#232037',
		accent: '#8356b5',
		titleFont: 'Georgia',
		textFont: 'Arial',
		decoration: 'frame',
	},
];

export function meterTicks( meter ) {
	const [ n, d ] = String( meter ).split( '/' ).map( Number );
	return n > 0 && d > 0 ? ( n * 48 ) / d : 48;
}
export const cleanAbcText = ( s ) =>
	String( s || '' )
		.replace( /[\r\n"\\]/g, ' ' )
		.slice( 0, 300 );
const fraction = ( ticks ) => {
	if ( ticks === 6 ) return '';
	if ( ticks % 6 === 0 ) return String( ticks / 6 );
	const gcd = ( a, b ) => ( b ? gcd( b, a % b ) : a );
	const g = gcd( ticks, 6 );
	return `${ ticks / g }/${ 6 / g }`;
};
export function pitchAbc( pitch ) {
	if ( ! pitch ) return 'z';
	const m = /^([A-G])([#b]{0,2})([2-6])$/.exec( pitch );
	if ( ! m ) return 'z';
	const accidental = m[ 2 ].replace( /#/g, '^' ).replace( /b/g, '_' ) || '=';
	return accidental + abcNatural( m[ 1 ], +m[ 3 ] );
}
export function melodyAbc( melody, title = '' ) {
	const bar = meterTicks( melody.meter );
	let room = melody.pickup > 0 ? Math.min( bar, melody.pickup * 12 ) : bar;
	let bars = 0;
	const parts = [];
	const ranges = [];
	let offset = 0;
	const add = ( s ) => {
		parts.push( s );
		offset += s.length;
	};
	const notes = ( melody.notes || [] ).slice( 0, 256 );
	for ( let i = 0; i < notes.length; i++ ) {
		const n = notes[ i ];
		let remaining = Math.max( 3, Math.min( 48, Number( n.ticks ) || 12 ) );
		const start = offset;
		if ( n.slurStart && n.pitch ) add( '(' );
		while ( remaining > 0 ) {
			const duration = Math.min( room, remaining );
			add(
				( n.accent && remaining === n.ticks ? '!accent!' : '' ) +
					pitchAbc( n.pitch ) +
					fraction( duration )
			);
			remaining -= duration;
			room -= duration;
			if (
				n.pitch &&
				( remaining > 0 ||
					( n.tie && notes[ i + 1 ]?.pitch === n.pitch ) )
			)
				add( '-' );
			if ( ! remaining && n.slurEnd && n.pitch ) add( ')' );
			if ( room === 0 ) {
				add( ++bars % 4 === 0 ? ' |\n' : ' | ' );
				room = bar;
			} else if (
				duration > 6 ||
				( notes[ i + 1 ]?.ticks || 12 ) > 6 ||
				( bar - room ) %
					( /^(6|9|12)\/8$/.test( melody.meter ) ? 18 : 12 ) ===
					0
			)
				add( ' ' );
		}
		ranges.push( { start, end: offset, index: i } );
	}
	if ( room < bar ) add( 'x' + fraction( room ) + ' |' );
	const header = `X:1\n${
		title ? 'T:' + cleanAbcText( title ) + '\n' : ''
	}M:${ melody.meter }\nL:1/8\nK:${ melody.key || 'C' } clef=${
		melody.clef || 'treble'
	}\n`;
	return {
		abc: header + ( parts.join( '' ) || 'x' + fraction( bar ) + ' |' ),
		ranges: ranges.map( ( r ) => ( {
			...r,
			start: r.start + header.length,
			end: r.end + header.length,
		} ) ),
	};
}

export function randomSource( seed ) {
	let state = ( Number( seed ) || 1 ) >>> 0;
	return () => {
		state = ( Math.imul( state, 1664525 ) + 1013904223 ) >>> 0;
		return state / 4294967296;
	};
}

/** Cells always fill their beat, including compound-meter and tuplet cells. */
export function rhythmBars( options, row = 0 ) {
	const rand = randomSource( ( +options.seed || 1 ) + row * 3571 );
	const bar = meterTicks( options.meter );
	const compound = /^(6|9|12)\/8$/.test( options.meter );
	const beat = compound ? 18 : /\/8$/.test( options.meter ) ? 6 : 12;
	const cells = compound
		? [ [ 18 ], [ 6, 6, 6 ], [ 12, 6 ], [ 6, 12 ] ]
		: beat === 6
		? [ [ 6 ], [ 3, 3 ] ]
		: [ [ 12 ] ];
	if ( ! compound && beat === 12 && options.level !== 'quarters' )
		cells.push( [ 6, 6 ] );
	if ( ! compound && beat === 12 && options.level === 'sixteenths' )
		cells.push( [ 3, 3, 3, 3 ], [ 6, 3, 3 ], [ 3, 6, 3 ] );
	if ( ! compound && beat === 12 && options.level === 'triplets' )
		cells.push( [ 4, 4, 4 ] );
	const result = [];
	for ( let b = 0; b < Math.max( 1, Math.min( 12, options.bars ) ); b++ ) {
		const events = [];
		for ( let pos = 0; pos < bar; pos += beat ) {
			const cell =
				options.level === 'quarters'
					? cells[ 0 ]
					: cells[ Math.floor( rand() * cells.length ) ];
			let at = pos;
			cell.forEach( ( ticks, index ) => {
				const beatNo = Math.floor( pos / beat ) + 1;
				const sub = at - pos;
				const count =
					sub === 0
						? String( beatNo )
						: ticks === 4
						? index === 1
							? 'trip'
							: 'let'
						: compound
						? String( index + 1 )
						: { 3: 'e', 6: '&', 9: 'a' }[ sub ] || '&';
				events.push( {
					ticks,
					count,
					rest: !! options.rests && rand() < 0.15,
					accent: pos === 0 && index === 0,
					triplet: ticks === 4 && index === 0,
					endBeat: index === cell.length - 1,
				} );
				at += ticks;
			} );
		}
		result.push( events );
	}
	return result;
}
export function rhythmAbc( options, row = 0, showCounts = options.counts ) {
	const bars = rhythmBars( options, row );
	const text = bars
		.map( ( events, b ) => {
			if ( options.blanks && b % 2 === 1 )
				return 'x' + fraction( meterTicks( options.meter ) );
			return events
				.map(
					( e ) =>
						( e.triplet ? '(3' : '' ) +
						( showCounts ? '"_' + e.count + '"' : '' ) +
						( options.accents && e.accent && ! e.rest
							? '!accent!'
							: '' ) +
						( e.rest ? 'z' : 'B' ) +
						( e.ticks === 4 ? '' : fraction( e.ticks ) ) +
						( e.endBeat ? ' ' : '' )
				)
				.join( '' );
		} )
		.join( ' | ' );
	return `X:1\nM:${ options.meter }\nL:1/8\nK:C clef=perc stafflines=1\n${ text } |]`;
}

/** Spelling keeps the diatonic letter (including E# and Cb) in teaching graphics. */
const rootSemitone = ( root ) =>
	( ( { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 } )[ root[ 0 ] ] ?? 0 ) +
	( root.includes( '#' ) ? 1 : root.includes( 'b' ) ? -1 : 0 );
export function scaleNotes( root, scale ) {
	const spelling = spellScale( root, scale, keyPreference( root ) );
	const base = rootSemitone( root );
	return spelling.notes.map( ( n ) => ( {
		...n,
		name:
			n.letter +
			( n.accidental > 0
				? '#'.repeat( n.accidental )
				: 'b'.repeat( -n.accidental ) ),
		midi: 60 + base + n.step,
	} ) );
}
export function noteToAbc( n, midi = n.midi ) {
	const octave = Math.floor( ( midi - n.accidental ) / 12 ) - 1;
	const acc =
		n.accidental > 0
			? '^'.repeat( n.accidental )
			: n.accidental < 0
			? '_'.repeat( -n.accidental )
			: '=';
	return acc + abcNatural( n.letter, octave );
}
const ROMANS = [ 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII' ];
export function diatonicChords( root, minor = false, sevenths = false ) {
	const scale = scaleNotes( root, minor ? 'natural-minor' : 'major' );
	const tones = sevenths ? 4 : 3;
	return scale.map( ( n, degree ) => {
		const notes = Array.from( { length: tones }, ( _, k ) => {
			const i = degree + k * 2;
			return {
				...scale[ i % 7 ],
				midi: scale[ i % 7 ].midi + Math.floor( i / 7 ) * 12,
			};
		} );
		const intervals = notes.map( ( v ) => v.midi - notes[ 0 ].midi );
		const quality =
			intervals[ 2 ] === 6
				? sevenths
					? 'm7b5'
					: 'dim'
				: intervals[ 1 ] === 3
				? sevenths
					? 'm7'
					: 'm'
				: sevenths
				? intervals[ 3 ] === 11
					? 'maj7'
					: '7'
				: '';
		const roman =
			( intervals[ 1 ] === 3
				? ROMANS[ degree ].toLowerCase()
				: ROMANS[ degree ] ) +
			( intervals[ 2 ] === 6 ? '°' : '' ) +
			( sevenths ? '7' : '' );
		return {
			name: n.name + quality,
			roman,
			notes,
			intervals,
			degree: degree + 1,
		};
	} );
}
export function chordNotes( root, quality = '', inversion = 0 ) {
	const intervals = chordIntervals( quality ) || [ 0, 4, 7 ];
	const tonic = rootSemitone( root );
	const letters = 'CDEFGAB';
	const natural = [ 0, 2, 4, 5, 7, 9, 11 ];
	// Triadic stacks, with the suspended second/fourth replacing the third.
	const degrees = intervals.map( ( v, i ) =>
		i === 0
			? 0
			: v === 2 && quality === 'sus2'
			? 1
			: v === 5 && quality === 'sus4'
			? 3
			: v >= 20
			? 12
			: v >= 17
			? 10
			: v >= 13
			? 8
			: v === 9 && /6/.test( quality ) && ! /dim/.test( quality )
			? 5
			: i * 2
	);
	const notes = intervals.map( ( interval, i ) => {
		const index = ( letters.indexOf( root[ 0 ] ) + degrees[ i ] ) % 7;
		let accidental = ( tonic + interval - natural[ index ] + 12 ) % 12;
		if ( accidental > 6 ) accidental -= 12;
		return {
			letter: letters[ index ],
			accidental,
			name:
				letters[ index ] +
				( accidental > 0
					? '#'.repeat( accidental )
					: 'b'.repeat( -accidental ) ),
			midi: 60 + tonic + interval,
		};
	} );
	for ( let i = 0; i < Math.min( inversion, notes.length - 1 ); i++ ) {
		const n = notes.shift();
		let midi = n.midi + 12;
		while ( midi <= notes.at( -1 ).midi ) midi += 12;
		notes.push( { ...n, midi } );
	}
	return notes;
}
export const INTERVAL_NAMES = [
	'Unison',
	'Minor second',
	'Major second',
	'Minor third',
	'Major third',
	'Perfect fourth',
	'Tritone',
	'Perfect fifth',
	'Minor sixth',
	'Major sixth',
	'Minor seventh',
	'Major seventh',
	'Octave',
];
export function intervalNotes( root, semitones ) {
	const n = Math.max( 0, Math.min( 12, semitones | 0 ) );
	const degrees = [ 0, 1, 1, 2, 2, 3, 3, 4, 5, 5, 6, 6, 7 ];
	const letters = 'CDEFGAB';
	const natural = [ 0, 2, 4, 5, 7, 9, 11 ];
	const base = rootSemitone( root );
	return [ 0, n ].map( ( step, i ) => {
		const ix =
			( letters.indexOf( root[ 0 ] ) + ( i ? degrees[ n ] : 0 ) ) % 7;
		let acc = ( base + step - natural[ ix ] + 12 ) % 12;
		if ( acc > 6 ) acc -= 12;
		return {
			letter: letters[ ix ],
			accidental: acc,
			name:
				letters[ ix ] +
				( acc > 0 ? '#'.repeat( acc ) : 'b'.repeat( -acc ) ),
			midi: 60 + base + step,
		};
	} );
}

const voicingCache = new Map();
export function gripChoices( name, instrument, tuning ) {
	const key = [ name, instrument, tuning ].join( '|' );
	if ( voicingCache.has( key ) ) return voicingCache.get( key );
	const parsed = parseChord( name ),
		inst = INSTRUMENTS[ instrument ];
	if ( ! parsed || ! inst?.strings ) return [];
	const first = shapeFor( name, instrument, tuning );
	const found = findVoicings(
		chordPitches( parsed ),
		inst.tunings[ tuning ] || inst.tunings.standard,
		{ frets: inst.frets - 4, optional: optionalTones( parsed ), limit: 8 }
	);
	const seen = new Set();
	const choices = [ first, ...found ].filter(
		( s ) =>
			s &&
			! seen.has( s.frets.join( ',' ) ) &&
			seen.add( s.frets.join( ',' ) )
	);
	if ( voicingCache.size > 160 ) voicingCache.clear();
	voicingCache.set( key, choices );
	return choices;
}
export const gripKey = ( name, p ) =>
	[ p.instrument, p.tuning, name ].join( '|' );
export function selectedGrip( name, p ) {
	const key = gripKey( name, p );
	const custom = p.grip?.custom?.[ key ];
	if ( custom )
		return {
			frets: [ ...custom.frets ],
			fingers: [ ...( custom.fingers || custom.frets.map( () => 0 ) ) ],
			barre: custom.barre || null,
		};
	const choices = gripChoices( name, p.instrument, p.tuning );
	return choices[ p.grip?.variants?.[ key ] || 0 ] || choices[ 0 ] || null;
}
