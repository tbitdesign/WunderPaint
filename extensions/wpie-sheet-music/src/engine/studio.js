/** Musical models shared by the editors, notation and teaching graphics. */
import {
	NOTE_NAMES_SHARP,
	NOTE_NAMES_FLAT,
	pitchClass,
	parseChord,
} from './chords.js';
import { scaleSteps } from './scales.js';
import { INSTRUMENTS, noteToMidi } from './voicings.js';
import {
	scaleNotes,
	diatonicChords,
	intervalNotes,
	randomSource,
	noteToAbc,
} from './workshop.js';

export const STUDIO_TYPES = [
	{
		id: 'song',
		label: 'Song Builder',
		hint: 'Arrange song sections and place chords over your lyrics.',
	},
	{
		id: 'worksheet',
		label: 'Exercise Sheets',
		hint: 'Create musical questions with matching solution sheets.',
	},
	{
		id: 'roadmap',
		label: 'Guitar Maps',
		hint: 'Connect scale positions, chord tones and practice routes.',
	},
];
export const MODE_IDS = [
	'major',
	'dorian',
	'phrygian',
	'lydian',
	'mixolydian',
	'natural-minor',
	'locrian',
	'harmonic-minor',
	'melodic-minor',
];
export const SECTION_TYPES = [
	'Intro',
	'Verse',
	'Chorus',
	'Bridge',
	'Interlude',
	'Outro',
];
export const EXERCISE_TYPES = [
	{ value: 'mixed', label: 'Mixed exercises' },
	{ value: 'note', label: 'Complete the melody' },
	{ value: 'rest', label: 'Complete the measure' },
	{ value: 'interval', label: 'Build an interval' },
	{ value: 'accidental', label: 'Add accidentals' },
	{ value: 'error', label: 'Find the wrong note' },
];
export const DRUM_LANES = [
	{ id: 'hat', label: 'Hi-hat', pitch: 'g', cross: true },
	{ id: 'snare', label: 'Snare', pitch: 'c' },
	{ id: 'tom', label: 'Tom', pitch: 'e' },
	{ id: 'kick', label: 'Kick', pitch: 'F' },
];
export const DRUM_PATTERNS = [
	{ value: 'backbeat', label: 'Backbeat' },
	{ value: 'half-time', label: 'Half-time groove' },
	{ value: 'offbeat', label: 'Offbeat groove' },
	{ value: 'fill', label: 'Descending fill' },
	{ value: 'single', label: 'Single strokes' },
	{ value: 'double', label: 'Double strokes' },
	{ value: 'paradiddle', label: 'Paradiddle' },
];
export const STUDIO_DEFAULTS = {
	connections: { smooth: true, notation: true },
	comparison: {
		modes: [ 'major', 'dorian', 'natural-minor' ],
		baseline: 'major',
		diagram: 'keyboard',
	},
	rhythmGraphic: {
		kind: 'tree',
		upper: 3,
		lower: 2,
		levels: 4,
		dotted: false,
		rests: false,
	},
	drums: {
		steps: 16,
		bars: 1,
		pattern: 'backbeat',
		hits: [],
		sticking: [],
		notation: true,
		grid: true,
	},
	worksheet: {
		topic: 'mixed',
		difficulty: 'beginner',
		seed: 31,
		count: 8,
		answers: false,
		clef: 'treble',
		minor: false,
	},
	roadmap: {
		start: 3,
		span: 4,
		positions: 3,
		chord: 'Am',
		route: true,
		fingers: true,
		leftHanded: false,
	},
	song: {
		overview: true,
		sections: [
			{
				type: 'Intro',
				label: '',
				repeats: 1,
				lines: [
					{
						text: '',
						chords: [
							{ at: 0, name: 'C' },
							{ at: 1, name: 'G' },
						],
					},
				],
			},
			{
				type: 'Verse',
				label: '',
				repeats: 1,
				lines: [
					{
						text: '',
						chords: [
							{ at: 0, name: 'C' },
							{ at: 1, name: 'Am' },
							{ at: 2, name: 'F' },
							{ at: 3, name: 'G' },
						],
					},
				],
			},
			{
				type: 'Chorus',
				label: '',
				repeats: 2,
				lines: [
					{
						text: '',
						chords: [
							{ at: 0, name: 'F' },
							{ at: 1, name: 'G' },
							{ at: 2, name: 'C' },
						],
					},
				],
			},
		],
	},
	analysis: { items: [] },
};

export const clampInt = ( value, min, max, fallback = min ) =>
	Number.isFinite( +value )
		? Math.max( min, Math.min( max, Math.round( +value ) ) )
		: fallback;
const clone = ( value ) => JSON.parse( JSON.stringify( value ) );

export function normalizeStudio( p ) {
	for ( const [ key, value ] of Object.entries( STUDIO_DEFAULTS ) )
		p[ key ] = clone( { ...value, ...( p[ key ] || {} ) } );
	p.comparison.modes = [
		...new Set(
			p.comparison.modes.filter( ( id ) => MODE_IDS.includes( id ) )
		),
	].slice( 0, 9 );
	if ( ! p.comparison.modes.length ) p.comparison.modes = [ 'major' ];
	p.drums.steps = p.drums.steps === 8 ? 8 : 16;
	p.drums.bars = clampInt( p.drums.bars, 1, 4 );
	if ( ! p.drums.hits.length )
		Object.assign(
			p.drums,
			drumPattern( p.drums.pattern, p.drums.steps, p.drums.bars )
		);
	p.drums.hits = DRUM_LANES.map( ( _, lane ) =>
		Array.from( { length: p.drums.steps * p.drums.bars }, ( __, i ) =>
			clampInt( p.drums.hits[ lane ]?.[ i ], 0, 3 )
		)
	);
	p.drums.sticking = Array.from(
		{ length: p.drums.steps * p.drums.bars },
		( _, i ) =>
			[ 'R', 'L' ].includes( p.drums.sticking[ i ] )
				? p.drums.sticking[ i ]
				: ''
	);
	p.worksheet.count = clampInt( p.worksheet.count, 1, 24, 8 );
	p.song.sections = p.song.sections.slice( 0, 24 ).map( ( section ) => ( {
		type: SECTION_TYPES.includes( section.type ) ? section.type : 'Verse',
		label: String( section.label || '' ).slice( 0, 80 ),
		repeats: clampInt( section.repeats, 1, 8 ),
		lines: ( section.lines || [] ).slice( 0, 24 ).map( ( l ) => ( {
			text: String( l.text || '' ).slice( 0, 400 ),
			autoChords: l.autoChords ?? ! l.text,
			chords: ( l.chords || [] )
				.slice( 0, 32 )
				.filter( ( c ) => parseChord( c.name ) )
				.map( ( c ) => ( {
					at: clampInt(
						c.at,
						0,
						l.autoChords || ! l.text ? 400 : l.text.length
					),
					name: c.name,
				} ) ),
		} ) ),
	} ) );
	p.analysis.items = p.analysis.items.slice( 0, 24 ).map( ( a ) => ( {
		...a,
		from: clampInt( a.from, 1, 999 ),
		to: clampInt( a.to, 1, 999 ),
		label: String( a.label || '' ).slice( 0, 100 ),
	} ) );
	return p;
}

export function pitchFromMidi( midi, flats = false ) {
	const n = clampInt( midi, 36, 95 );
	return (
		( flats ? NOTE_NAMES_FLAT : NOTE_NAMES_SHARP )[ n % 12 ] +
		( Math.floor( n / 12 ) - 1 )
	);
}

/** The editor uses diatonic staff steps and the current key signature. */
export function staffPitch( y, staff, key = 'C', accidental = 'key' ) {
	const bottom =
		{ treble: 4 * 7 + 2, bass: 2 * 7 + 4, alto: 3 * 7 + 3 }[ staff.clef ] ??
		30;
	const number = clampInt(
		bottom + Math.round( ( staff.bottom - y ) / staff.step ),
		14,
		48
	);
	const letter = 'CDEFGAB'[ number % 7 ];
	const scale = scaleNotes(
		key.replace( /m$/, '' ),
		key.endsWith( 'm' ) ? 'natural-minor' : 'major'
	);
	const sign =
		accidental === 'key'
			? scale.find( ( n ) => n.letter === letter )?.name.slice( 1 ) || ''
			: { sharp: '#', flat: 'b', natural: '' }[ accidental ] || '';
	return letter + sign + Math.floor( number / 7 );
}

/** Returns an atomic edit; no clipping or silent partial phrase transforms. */
export function transformPhrase(
	notes,
	from,
	to,
	action,
	amount = 1,
	flats = false
) {
	const start = Math.max( 0, Math.min( from, to ) ),
		end = Math.min( notes.length - 1, Math.max( from, to ) );
	if ( start > end ) return { notes: clone( notes ), from, to };
	let part = clone( notes.slice( start, end + 1 ) );
	if ( action === 'repeat' && notes.length + part.length > 256 )
		return { error: 'The melody can contain up to 256 notes.' };
	if ( action === 'transpose' ) {
		const pitches = part
			.filter( ( n ) => n.pitch )
			.map( ( n ) => noteToMidi( n.pitch ) + amount );
		if ( pitches.some( ( n ) => n < 36 || n > 95 ) )
			return {
				error: 'The phrase would leave the supported pitch range.',
			};
		part = part.map( ( n ) =>
			n.pitch
				? {
						...n,
						pitch: pitchFromMidi(
							noteToMidi( n.pitch ) + amount,
							flats
						),
				  }
				: n
		);
	}
	if ( action === 'duration' ) {
		if (
			part.some(
				( n ) =>
					n.ticks * amount < 3 ||
					n.ticks * amount > 48 ||
					! Number.isInteger( n.ticks * amount )
			)
		)
			return {
				error: 'This rhythm cannot be scaled with the supported note values.',
			};
		part = part.map( ( n ) => ( { ...n, ticks: n.ticks * amount } ) );
	}
	if ( action === 'reverse' )
		part = part.reverse().map( ( n ) => ( {
			...n,
			tie: false,
			slurStart: !! n.slurEnd,
			slurEnd: !! n.slurStart,
		} ) );
	const output = clone( notes );
	if ( action === 'repeat' ) {
		output.splice( end + 1, 0, ...part );
		return { notes: output, from: end + 1, to: end + part.length };
	}
	output.splice( start, part.length, ...part );
	return { notes: output, from: start, to: end };
}

/** Close-position inversions, selected globally for the least total movement. */
export function voiceLeading( root, harmony, smooth = true ) {
	const pool = diatonicChords( root, harmony.minor, harmony.sevenths );
	const progression = String( harmony.progression )
		.split( /[\s,;]+/ )
		.map( Number )
		.filter( ( n ) => n >= 1 && n <= 7 && Number.isInteger( n ) )
		.slice( 0, 16 )
		.map( ( n ) => pool[ n - 1 ] );
	if ( ! progression.length ) return [];
	if ( ! smooth ) return progression;
	const candidates = progression.map( ( chord ) => {
		const list = [];
		for ( let inversion = 0; inversion < chord.notes.length; inversion++ ) {
			const rotated = chord.notes.map( ( _, i ) => {
				const ix = ( i + inversion ) % chord.notes.length;
				return {
					...chord.notes[ ix ],
					midi: chord.notes[ ix ].midi + ( ix < inversion ? 12 : 0 ),
				};
			} );
			for ( const octave of [ -24, -12, 0, 12 ] ) {
				const notes = rotated.map( ( n ) => ( {
					...n,
					midi: n.midi + octave,
				} ) );
				if ( notes[ 0 ].midi >= 48 && notes.at( -1 ).midi <= 84 )
					list.push( notes );
			}
		}
		return list;
	} );
	const stages = [];
	candidates.forEach( ( voices, i ) => {
		stages.push(
			voices.map( ( notes ) => {
				if ( ! i )
					return {
						cost: notes.reduce(
							( sum, n, j ) =>
								sum +
								Math.abs(
									n.midi - progression[ 0 ].notes[ j ].midi
								) *
									0.35,
							0
						),
						prev: -1,
					};
				let best = { cost: Infinity, prev: 0 };
				candidates[ i - 1 ].forEach( ( before, k ) => {
					const cost =
						stages[ i - 1 ][ k ].cost +
						notes.reduce(
							( sum, n, j ) =>
								sum + Math.abs( n.midi - before[ j ].midi ),
							0
						);
					if ( cost < best.cost ) best = { cost, prev: k };
				} );
				return best;
			} )
		);
	} );
	let index = stages
		.at( -1 )
		.reduce(
			( best, s, i, a ) => ( s.cost < a[ best ].cost ? i : best ),
			0
		);
	const result = [];
	for ( let i = progression.length - 1; i >= 0; i-- ) {
		result.unshift( {
			...progression[ i ],
			notes: candidates[ i ][ index ],
		} );
		index = stages[ i ][ index ].prev;
	}
	return result;
}

export function compareModes( root, modes, baseline = 'major' ) {
	const base = scaleNotes( root, baseline );
	return modes.map( ( id ) => ( {
		id,
		notes: scaleNotes( root, id ).map( ( n, i ) => ( {
			...n,
			changed: n.midi !== base[ i ]?.midi,
			degree: i + 1,
		} ) ),
	} ) );
}

export function drumPattern( pattern, steps = 16, bars = 1 ) {
	const hits = DRUM_LANES.map( () => Array( steps * bars ).fill( 0 ) );
	const sticking = Array( steps * bars ).fill( '' );
	const beat = steps / 4;
	for ( let i = 0; i < steps * bars; i++ ) {
		const at = i % steps;
		if ( [ 'single', 'double', 'paradiddle' ].includes( pattern ) ) {
			hits[ 1 ][ i ] = at % beat === 0 ? 2 : 1;
			sticking[ i ] = {
				single: 'RL',
				double: 'RRLL',
				paradiddle: 'RLRRLRLL',
			}[ pattern ][
				i % ( pattern === 'single' ? 2 : pattern === 'double' ? 4 : 8 )
			];
		} else if ( pattern === 'fill' ) {
			hits[ at < steps / 2 ? 1 : 2 ][ i ] = at % beat === 0 ? 2 : 1;
			sticking[ i ] = i % 2 ? 'L' : 'R';
		} else {
			hits[ 0 ][ i ] =
				at % ( beat / 2 ) === 0 &&
				( pattern !== 'offbeat' || at % beat !== 0 )
					? 1
					: 0;
			hits[ 1 ][ i ] = (
				pattern === 'half-time'
					? at === steps / 2
					: at === beat || at === beat * 3
			)
				? 2
				: 0;
			hits[ 3 ][ i ] =
				at === 0 ||
				( pattern !== 'half-time' && at === steps / 2 ) ||
				( pattern === 'offbeat' && at === steps - beat / 2 )
					? 1
					: 0;
		}
	}
	return { hits, sticking };
}

export function resizeDrums( drums, steps, bars ) {
	const hits = DRUM_LANES.map( () => Array( steps * bars ).fill( 0 ) ),
		sticking = Array( steps * bars ).fill( '' );
	for ( let i = 0; i < drums.steps * drums.bars; i++ ) {
		const target = ( i / drums.steps ) * steps;
		if ( ! Number.isInteger( target ) || target >= steps * bars ) {
			if (
				drums.hits.some( ( lane ) => lane[ i ] ) ||
				drums.sticking[ i ]
			)
				return null;
			continue;
		}
		for ( let lane = 0; lane < hits.length; lane++ )
			hits[ lane ][ target ] = drums.hits[ lane ][ i ] || 0;
		sticking[ target ] = drums.sticking[ i ] || '';
	}
	return { ...drums, steps, bars, hits, sticking };
}

/** Separate voices keep cymbal cross heads and stem directions unambiguous. */
export function drumAbc( drums, bar = 0 ) {
	const head = `X:1\n%%score (h s t k)\nM:4/4\nL:1/${ drums.steps }\nV:h clef=perc stem=up style=x\nV:s clef=perc stem=up\nV:t clef=perc stem=up\nV:k clef=perc stem=down\nK:C\n`;
	const first = bar * drums.steps,
		last = first + drums.steps;
	const anyHit = drums.hits.some( ( lane ) =>
		lane.slice( first, last ).some( Boolean )
	);
	const bodies = DRUM_LANES.map( ( lane, k ) => {
		let body = '';
		if ( ! drums.hits[ k ].slice( first, last ).some( Boolean ) ) {
			return `[V:${ [ 'h', 's', 't', 'k' ][ k ] }] ${
				! anyHit && k === 3 ? 'z' : 'x'
			}${ drums.steps } |]`;
		}
		for ( let i = 0; i < drums.steps;  ) {
			const index = bar * drums.steps + i,
				hit = drums.hits[ k ][ index ];
			const endBeat =
				( Math.floor( i / ( drums.steps / 4 ) ) + 1 ) *
				( drums.steps / 4 );
			let end = i + 1;
			while ( end < endBeat && ! drums.hits[ k ][ first + end ] ) end++;
			const duration = end - i;
			const hand = k === 1 || k === 2 ? drums.sticking[ index ] : '';
			body +=
				( hit && hand ? `"_${ hand }"` : '' ) +
				( hit === 2 ? '!accent!' : hit === 3 ? '!p!' : '' ) +
				( hit ? lane.pitch : k === 3 ? 'z' : 'x' ) +
				( duration > 1 ? duration : '' );
			i = end;
			if ( i % ( drums.steps / 4 ) === 0 ) body += ' ';
		}
		return `[V:${ [ 'h', 's', 't', 'k' ][ k ] }] ${ body } |]`;
	} );
	return head + bodies.join( '\n' );
}

/** Explicit target questions have a single known answer, independent of view. */
export function exerciseSet( options, root ) {
	const rand = randomSource( options.seed ),
		scale = scaleNotes( root, options.minor ? 'natural-minor' : 'major' );
	const types = EXERCISE_TYPES.slice( 1 ).map( ( t ) => t.value );
	const harder = options.difficulty !== 'beginner';
	return Array.from(
		{ length: clampInt( options.count, 1, 24, 8 ) },
		( _, i ) => {
			const type =
				options.topic === 'mixed'
					? types[ i % types.length ]
					: options.topic;
			const degree = Math.floor( rand() * 7 );
			const octave =
				options.clef === 'bass' ? -24 : harder && rand() > 0.6 ? 12 : 0;
			const tones = scale.map( ( n ) => ( {
				...n,
				midi: n.midi + octave,
			} ) );
			const base = tones[ degree ];
			if ( type === 'rest' ) {
				const total = harder ? 36 : 48;
				const missing = [ 6, 12, 24 ][ Math.floor( rand() * 3 ) ];
				const units = [];
				let left = total - missing;
				while ( left ) {
					const n = Math.min( left, 12 );
					units.push( n );
					left -= n;
				}
				return {
					type,
					meter: total === 36 ? '3/4' : '4/4',
					units,
					missing,
					clef: options.clef,
				};
			}
			if ( type === 'interval' ) {
				const semitones = (
					harder
						? [ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12 ]
						: [ 2, 4, 5, 7, 12 ]
				)[ Math.floor( rand() * ( harder ? 12 : 5 ) ) ];
				const pair = intervalNotes( base.name, semitones );
				const shift = base.midi - pair[ 0 ].midi;
				return {
					type,
					semitones,
					notes: pair.map( ( n ) => ( {
						...n,
						midi: n.midi + shift,
					} ) ),
					clef: options.clef,
				};
			}
			if ( type === 'accidental' )
				return { type, notes: tones, clef: options.clef };
			if ( type === 'error' ) {
				const notes = tones.map( ( n ) => ( { ...n } ) );
				const delta = base.accidental >= 1 ? -1 : 1;
				notes[ degree ] = {
					...base,
					accidental: base.accidental + delta,
					midi: base.midi + delta,
				};
				return {
					type,
					notes,
					answer: base,
					index: degree,
					clef: options.clef,
				};
			}
			return {
				type: 'note',
				notes: tones,
				index: degree,
				answer: base,
				clef: options.clef,
			};
		}
	);
}
export function exerciseAbc( e, answers ) {
	let body,
		meter = 'none',
		length = '1/4';
	if ( e.type === 'rest' ) {
		meter = e.meter;
		length = '1/8';
		body =
			e.units.map( ( ticks ) => 'B' + ticks / 6 ).join( ' ' ) +
			' ' +
			( answers ? 'z' : '"^?"x' ) +
			e.missing / 6;
	} else if ( e.type === 'interval' )
		body =
			noteToAbc( e.notes[ 0 ] ) +
			' ' +
			( answers ? noteToAbc( e.notes[ 1 ] ) : '"^?"x' );
	else
		body = e.notes
			.map( ( n, i ) => {
				if ( e.type === 'note' && i === e.index && ! answers )
					return '"^?"x';
				if ( e.type === 'accidental' && ! answers )
					return noteToAbc( {
						...n,
						accidental: 0,
						midi: n.midi - n.accidental,
					} );
				return noteToAbc(
					e.type === 'error' && answers && i === e.index
						? e.answer
						: n
				);
			} )
			.join( ' ' );
	return `X:1\nM:${ meter }\nL:${ length }\nK:C clef=${
		e.type === 'rest' ? 'perc stafflines=1' : e.clef
	}\n${ body } |]`;
}

export function guitarPositions( root, scale, options, tuning = 'standard' ) {
	const strings =
		INSTRUMENTS.guitar.tunings[ tuning ] ||
		INSTRUMENTS.guitar.tunings.standard;
	const open = strings.map( noteToMidi ),
		pc = pitchClass( root ) ?? 9;
	const pcs = ( scaleSteps( scale ) || scaleSteps( 'minor-pentatonic' ) ).map(
		( n ) => ( pc + n ) % 12
	);
	const span = clampInt( options.span, 3, 5, 4 ),
		start = clampInt( options.start, 0, 17, 3 );
	const positions = [];
	for ( let i = 0; i < clampInt( options.positions, 1, 5, 3 ); i++ ) {
		const from = start + i * ( span - 1 ),
			to = Math.min( 22, from + span );
		if ( from >= 22 ) break;
		const notes = [];
		open.forEach( ( midi, string ) => {
			for ( let fret = from; fret <= to; fret++ )
				if ( pcs.includes( ( midi + fret ) % 12 ) )
					notes.push( {
						string,
						fret,
						midi: midi + fret,
						pc: ( midi + fret ) % 12,
						finger:
							fret === 0
								? 0
								: Math.min( 4, fret - Math.max( 1, from ) + 1 ),
					} );
		} );
		const seen = new Set();
		const route = notes
			.filter( ( n ) => {
				if ( seen.has( n.midi ) ) return false;
				seen.add( n.midi );
				return true;
			} )
			.sort( ( a, b ) => a.midi - b.midi );
		positions.push( { from, to, notes, route, strings } );
	}
	return positions;
}

export function songLineChords( line ) {
	const positions = line.chords
		.map( ( c, source ) => ( { ...c, source } ) )
		.sort( ( a, b ) => a.at - b.at );
	if ( ! line.autoChords || ! line.text ) return positions;
	const words = [ ...line.text.matchAll( /\S+/g ) ].map( ( m ) => m.index );
	return positions.map( ( c, i ) => ( {
		...c,
		at: words[ Math.floor( ( i * words.length ) / positions.length ) ] || 0,
	} ) );
}

export function songModel( options, text, t = ( s ) => s ) {
	return {
		title: text.title,
		subtitle: text.subtitle,
		artist: text.composer,
		key: '',
		sections: options.sections.map( ( section ) => ( {
			type: section.type.toLowerCase(),
			label:
				( section.label || t( section.type ) ) +
				( section.repeats > 1 ? ' ×' + section.repeats : '' ),
			lines: section.lines.map( ( line ) => {
				const text = line.text || '',
					positions = songLineChords( line );
				if ( ! positions.length )
					return { parts: [ { chord: null, text } ] };
				if ( ! text )
					return {
						parts: positions.map( ( c ) => ( {
							chord: c.name,
							text: '    ',
						} ) ),
					};
				const parts = [];
				if ( positions[ 0 ].at > 0 )
					parts.push( {
						chord: null,
						text: text.slice( 0, positions[ 0 ].at ),
					} );
				positions.forEach( ( c, i ) =>
					parts.push( {
						chord: c.name,
						text: text.slice(
							c.at,
							positions[ i + 1 ]?.at ?? text.length
						),
					} )
				);
				return { parts };
			} ),
		} ) ),
	};
}

/** Keep chord anchors attached when lyrics before them change. */
export function editLyrics( line, next ) {
	const before = line.text || '';
	if ( line.autoChords || ( ! before && line.chords.length ) )
		return { ...line, text: next, autoChords: true };
	let start = 0;
	while (
		start < before.length &&
		start < next.length &&
		before[ start ] === next[ start ]
	)
		start++;
	let suffix = 0;
	while (
		suffix < before.length - start &&
		suffix < next.length - start &&
		before.at( -1 - suffix ) === next.at( -1 - suffix )
	)
		suffix++;
	const oldEnd = before.length - suffix,
		delta = next.length - before.length;
	return {
		...line,
		text: next,
		chords: line.chords.map( ( c ) => ( {
			...c,
			at: Math.min(
				next.length,
				c.at < start ? c.at : c.at >= oldEnd ? c.at + delta : start
			),
		} ) ),
	};
}

export function moveItem( items, from, to ) {
	if ( from < 0 || to < 0 || from >= items.length || to >= items.length )
		return;
	items.splice( to, 0, items.splice( from, 1 )[ 0 ] );
}

/** Move note-range annotations with insertions and deletions in the melody. */
export function spliceAnnotations( items, start, removed, added ) {
	const first = start + 1,
		end = start + removed;
	const output = [];
	for ( const item of items ) {
		let from = Math.max( 1, +item.from || 1 ),
			to = Math.max( from, +item.to || from );
		if ( removed && from >= first && to <= end ) continue;
		if ( from > end ) from += added - removed;
		else if ( from >= first ) from = first + added;
		if ( to > end ) to += added - removed;
		else if ( to >= first ) to = first - 1 + added;
		output.push( { ...item, from, to: Math.max( from, to ) } );
	}
	return output;
}
