/** Original starting points for the visual editors and teaching diagrams. */
import { DRUM_PATTERNS, EXERCISE_TYPES } from './engine/studio.js';

const preset = ( id, card, name, category, params, subtitle ) => ( {
	id,
	card,
	name,
	category,
	subtitle,
	params: { style: { decoration: 'rule' }, ...params },
} );
const notes = ( pitches ) =>
	pitches.split( ' ' ).map( ( pitch ) => ( { pitch, ticks: 12 } ) );
const section = ( type, chords, repeats = 1 ) => ( {
	type,
	label: '',
	repeats,
	lines: [
		{
			text: '',
			chords: chords.split( ' ' ).map( ( name, at ) => ( { at, name } ) ),
		},
	],
} );

export const STUDIO_STARTERS = [
	...[
		[
			'gentle-connections',
			'Common tones',
			'C',
			'1 6 4 5 1',
			false,
			false,
		],
		[
			'seventh-connections',
			'Seventh-chord connections',
			'F',
			'2 5 1 6',
			false,
			true,
		],
		[
			'minor-connections',
			'Minor-key connections',
			'A',
			'1 4 7 3 6',
			true,
			false,
		],
		[ 'fifths-connections', 'Linked fifths', 'D', '6 2 5 1', false, true ],
		[
			'root-connections',
			'Root-position comparison',
			'G',
			'1 5 6 4',
			false,
			false,
		],
	].map( ( [ id, name, root, progression, minor, sevenths ] ) =>
		preset(
			id,
			'harmony',
			name,
			'Harmony',
			{
				root,
				harmony: {
					topic: 'voice-leading',
					progression,
					minor,
					sevenths,
				},
				connections: { smooth: id !== 'root-connections' },
			},
			'Follow each voice between chords.'
		)
	),
	...[
		[
			'modal-colors',
			'Modal colors',
			'C',
			[
				'major',
				'dorian',
				'phrygian',
				'lydian',
				'mixolydian',
				'natural-minor',
				'locrian',
			],
			'major',
			'keyboard',
		],
		[
			'minor-colors',
			'Minor-scale comparison',
			'A',
			[ 'natural-minor', 'harmonic-minor', 'melodic-minor', 'dorian' ],
			'natural-minor',
			'keyboard',
		],
		[
			'bright-colors',
			'Bright modes',
			'D',
			[ 'major', 'lydian', 'mixolydian' ],
			'major',
			'none',
		],
		[
			'modal-neck',
			'Modes on the neck',
			'E',
			[ 'natural-minor', 'dorian', 'phrygian' ],
			'natural-minor',
			'fretboard',
		],
	].map( ( [ id, name, root, modes, baseline, diagram ] ) =>
		preset(
			id,
			'harmony',
			name,
			'Theory',
			{
				root,
				harmony: { topic: 'modes' },
				comparison: { modes, baseline, diagram },
			},
			'Compare colors on a shared root.'
		)
	),
	...[
		[ 'value-tree', 'Note-value tree', { kind: 'tree', levels: 4 } ],
		[
			'rest-tree',
			'Rest-value tree',
			{ kind: 'tree', levels: 5, rests: true },
		],
		[ 'beat-strips', 'Beat strips', { kind: 'strips', dotted: true } ],
		[
			'three-two-map',
			'Three against two',
			{ kind: 'poly', upper: 3, lower: 2 },
		],
		[
			'four-three-map',
			'Four against three',
			{ kind: 'poly', upper: 4, lower: 3 },
		],
		[
			'five-four-map',
			'Five against four',
			{ kind: 'poly', upper: 5, lower: 4 },
		],
	].map( ( [ id, name, rhythmGraphic ] ) =>
		preset(
			id,
			'rhythm',
			name,
			'Rhythm graphics',
			{ rhythm: { kind: 'graphics' }, rhythmGraphic },
			'Understand duration through proportional graphics.'
		)
	),
	...DRUM_PATTERNS.map( ( pattern ) =>
		preset(
			'editable-' + pattern.value,
			'rhythm',
			pattern.label,
			'Percussion',
			{
				rhythm: { kind: 'drum-editor' },
				drums: { pattern: pattern.value, steps: 16, bars: 1 },
			},
			'Edit the hits, accents and sticking.'
		)
	),
	...EXERCISE_TYPES.map( ( topic ) =>
		preset(
			'worksheet-' + topic.value,
			'worksheet',
			topic.label,
			'Teaching',
			{
				root: topic.value === 'accidental' ? 'D' : 'C',
				worksheet: { topic: topic.value, count: 6 },
			},
			'Generate a worksheet and its matching solutions.'
		)
	),
	preset(
		'bass-worksheet',
		'worksheet',
		'Bass-clef exercises',
		'Teaching',
		{ root: 'F', worksheet: { topic: 'mixed', clef: 'bass', count: 6 } },
		'Generate a worksheet and its matching solutions.'
	),
	preset(
		'advanced-worksheet',
		'worksheet',
		'Interval challenge',
		'Teaching',
		{
			root: 'Eb',
			worksheet: { topic: 'interval', difficulty: 'advanced', count: 8 },
		},
		'Generate a worksheet and its matching solutions.'
	),
	...[
		[
			'pentatonic-road',
			'Connected pentatonic positions',
			'A',
			'minor-pentatonic',
			'Am',
			5,
		],
		[ 'major-road', 'Major-scale pathways', 'G', 'major', 'G', 2 ],
		[ 'blues-road', 'Blues pathways', 'E', 'blues', 'E7', 0 ],
		[ 'dorian-road', 'Dorian pathways', 'D', 'dorian', 'Dm7', 3 ],
		[ 'chord-road', 'Chord tones in context', 'C', 'major', 'G7', 3 ],
	].map( ( [ id, name, root, scale, chord, start ] ) =>
		preset(
			id,
			'roadmap',
			name,
			'Technique',
			{ root, scale, roadmap: { start, chord, positions: 3 } },
			'Connect positions and highlight chord tones.'
		)
	),
	preset(
		'song-pop',
		'song',
		'Verse and chorus',
		'Songwriting',
		{
			song: {
				sections: [
					section( 'Intro', 'C G' ),
					section( 'Verse', 'C Am F G' ),
					section( 'Chorus', 'F G C Am', 2 ),
					section( 'Verse', 'C Am F G' ),
					section( 'Bridge', 'Dm Am F G' ),
					section( 'Chorus', 'F G C', 2 ),
					section( 'Outro', 'F G C' ),
				],
			},
		},
		'Arrange sections and add your own lyrics.'
	),
	preset(
		'song-minor',
		'song',
		'Minor song sketch',
		'Songwriting',
		{
			song: {
				sections: [
					section( 'Intro', 'Am Em' ),
					section( 'Verse', 'Am F C G' ),
					section( 'Chorus', 'F G Am', 2 ),
					section( 'Interlude', 'Dm Am Em Am' ),
					section( 'Outro', 'F Em Am' ),
				],
			},
		},
		'Arrange sections and add your own lyrics.'
	),
	preset(
		'song-acoustic',
		'song',
		'Acoustic song sketch',
		'Songwriting',
		{
			song: {
				sections: [
					section( 'Verse', 'G D Em C' ),
					section( 'Chorus', 'C D G', 2 ),
					section( 'Bridge', 'Am C D' ),
					section( 'Chorus', 'C D G' ),
				],
			},
			style: { paper: 'cream', accent: '#447c60', decoration: 'rule' },
		},
		'Arrange sections and add your own lyrics.'
	),
	preset(
		'motif-analysis',
		'melody',
		'Motif study',
		'Analysis',
		{
			melody: { notes: notes( 'C4 D4 E4 G4 D4 E4 F4 A4 E4 D4 C4 C4' ) },
			analysis: {
				items: [
					{
						from: 1,
						to: 4,
						kind: 'bracket',
						label: 'A',
						color: '#8d1436',
					},
					{
						from: 5,
						to: 8,
						kind: 'bracket',
						label: 'A′',
						color: '#087e8b',
					},
					{
						from: 9,
						to: 12,
						kind: 'phrase',
						label: 'B',
						color: '#8356b5',
					},
				],
			},
		},
		'Mark motifs and attach your own explanations.'
	),
	preset(
		'phrase-analysis',
		'melody',
		'Phrase study',
		'Analysis',
		{
			melody: { notes: notes( 'C4 E4 G4 A4 G4 E4 D4 G4 F4 D4 C4 C4' ) },
			analysis: {
				items: [
					{
						from: 1,
						to: 6,
						kind: 'phrase',
						label: 'A',
						color: '#087e8b',
					},
					{
						from: 7,
						to: 12,
						kind: 'phrase',
						label: 'B',
						color: '#8d1436',
					},
				],
			},
		},
		'Mark motifs and attach your own explanations.'
	),
	preset(
		'callout-analysis',
		'melody',
		'Note callouts',
		'Analysis',
		{
			melody: { notes: notes( 'C4 E4 G4 F#4 G4 B4 C5 C5' ) },
			analysis: {
				items: [
					{
						from: 4,
						to: 4,
						kind: 'callout',
						label: 'F♯',
						color: '#8d1436',
					},
					{
						from: 7,
						to: 8,
						kind: 'bracket',
						label: 'C',
						color: '#087e8b',
					},
				],
			},
		},
		'Mark motifs and attach your own explanations.'
	),
];
