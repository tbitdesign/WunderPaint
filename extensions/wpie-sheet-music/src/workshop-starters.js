/** Original exercises and teaching layouts, independent of audio or playback. */
const melody = ( pitches, ticks = 12 ) =>
	pitches
		.split( ' ' )
		.map( ( pitch ) => ( { pitch: pitch === 'z' ? null : pitch, ticks } ) );
const make = ( id, card, name, category, params, subtitle = '' ) => ( {
	id,
	card,
	name,
	category,
	subtitle,
	params,
} );
export const WORKSHOP_STARTERS = [
	make(
		'first-melody',
		'melody',
		'First melody',
		'Foundations',
		{
			melody: { notes: melody( 'C4 D4 E4 G4 F4 E4 D4 C4' ) },
			root: 'C',
			style: { decoration: 'rule' },
		},
		'Build a phrase on the keyboard.'
	),
	make(
		'question-answer',
		'melody',
		'Question and answer',
		'Foundations',
		{ melody: { notes: melody( 'C4 E4 G4 G4 F4 D4 C4 z' ) } },
		'Create matching musical phrases.'
	),
	make(
		'minor-melody',
		'melody',
		'Minor melody',
		'Technique',
		{ melody: { key: 'Am', notes: melody( 'A4 B4 C5 E5 D5 C5 B4 A4' ) } },
		'Explore a minor-key phrase.'
	),
	make(
		'waltz-melody',
		'melody',
		'Waltz melody',
		'Technique',
		{
			melody: {
				meter: '3/4',
				notes: melody( 'C4 E4 G4 F4 A4 C5 G4 B4 D5 C5 G4 C4' ),
			},
		},
		'A phrase in triple meter.'
	),
	make(
		'pickup-melody',
		'melody',
		'Pickup phrase',
		'Technique',
		{ melody: { pickup: 1, notes: melody( 'G4 C5 E5 D5 C5 B4 A4 G4 z' ) } },
		'Begin before the first full bar.'
	),
	make(
		'bass-warmup',
		'melody',
		'Bass warm-up',
		'Technique',
		{
			melody: {
				clef: 'bass',
				notes: melody( 'C3 G3 E3 G3 F3 C4 A3 C4' ),
			},
		},
		'Build a bass-clef exercise.'
	),
	make(
		'eighth-melody',
		'melody',
		'Flowing eighths',
		'Technique',
		{
			melody: {
				notes: melody(
					'C4 D4 E4 F4 G4 A4 B4 C5 C5 B4 A4 G4 F4 E4 D4 C4',
					6
				),
			},
		},
		'Stepwise motion with shorter notes.'
	),
	make(
		'tied-phrase',
		'melody',
		'Across the bar',
		'Technique',
		{
			melody: {
				notes: [
					...melody( 'C4 E4 G4' ),
					{ pitch: 'A4', ticks: 24 },
					{ pitch: 'G4', ticks: 12 },
					{ pitch: 'E4', ticks: 24 },
				],
			},
		},
		'Sustained notes across bar lines.'
	),
	...[
		[ 'pulse-study', 'Steady pulse', 'quarters', '4/4', false ],
		[ 'eighth-study', 'Eighth-note study', 'eighths', '4/4', true ],
		[
			'sixteenth-study',
			'Sixteenth-note study',
			'sixteenths',
			'4/4',
			true,
		],
		[ 'triplet-study', 'Triplet study', 'triplets', '4/4', false ],
		[ 'compound-study', 'Compound meter', 'eighths', '6/8', true ],
		[ 'odd-study', 'Uneven meter', 'eighths', '5/4', true ],
		[ 'seven-study', 'Seven-eight study', 'sixteenths', '7/8', true ],
		[ 'triple-study', 'Triple meter', 'eighths', '3/4', true ],
	].map( ( [ id, name, level, meter, rests ], i ) =>
		make(
			id,
			'rhythm',
			name,
			'Rhythm',
			{
				rhythm: { level, meter, rests, seed: 43 + i * 71 },
				style: { decoration: 'band' },
			},
			'Count, clap and complete the pattern.'
		)
	),
	make(
		'complete-rhythm',
		'rhythm',
		'Complete the rhythm',
		'Exercises',
		{ rhythm: { blanks: true, counts: true, seed: 109 } },
		'Fill in the empty bars.'
	),
	make(
		'rhythm-question',
		'rhythm',
		'Rhythm challenge',
		'Exercises',
		{ rhythm: { counts: false, level: 'sixteenths', seed: 231 } },
		'Work out the counting.'
	),
	make(
		'down-strum',
		'rhythm',
		'Downstroke pulse',
		'Guitar',
		{
			rhythm: {
				kind: 'strum',
				pattern: 'down',
				level: 'quarters',
				rests: false,
				rows: 1,
			},
		},
		'Direction arrows with beat counts.'
	),
	make(
		'alternate-strum',
		'rhythm',
		'Alternating strum',
		'Guitar',
		{
			rhythm: {
				kind: 'strum',
				pattern: 'down-up',
				rests: false,
				seed: 13,
			},
		},
		'Direction arrows with beat counts.'
	),
	make(
		'rolling-pick',
		'rhythm',
		'Rolling fingerpicking',
		'Guitar',
		{
			rhythm: {
				kind: 'picking',
				pattern: 'rolling',
				meter: '6/8',
				rests: false,
			},
		},
		'Finger order with beat counts.'
	),
	make(
		'return-pick',
		'rhythm',
		'Returning fingerpicking',
		'Guitar',
		{ rhythm: { kind: 'picking', pattern: 'return', rests: false } },
		'Finger order with beat counts.'
	),
	...[ 'backbeat', 'half-time', 'offbeat' ].map( ( pattern, i ) =>
		make(
			'drums-' + pattern,
			'rhythm',
			[ 'Backbeat', 'Half-time groove', 'Offbeat groove' ][ i ],
			'Percussion',
			{
				rhythm: {
					kind: 'drums',
					pattern,
					meter: '4/4',
					rows: 2,
					counts: true,
				},
			},
			'Hi-hat, snare and kick on a beat grid.'
		)
	),
	make(
		'major-circle',
		'harmony',
		'Major-key circle',
		'Theory',
		{
			root: 'C',
			harmony: { topic: 'circle' },
			layout: { format: 'square' },
			style: { decoration: 'frame' },
		},
		'Major keys and their relative minors.'
	),
	make(
		'minor-circle',
		'harmony',
		'Minor-key circle',
		'Theory',
		{
			root: 'A',
			harmony: { topic: 'circle', minor: true },
			layout: { format: 'square' },
			style: {
				paper: 'dark',
				ink: '#f1f5f9',
				accent: '#7dd3fc',
				decoration: 'frame',
			},
		},
		'Highlight a minor key and its neighbors.'
	),
	make(
		'interval-thirds',
		'harmony',
		'A major third',
		'Theory',
		{ root: 'C', harmony: { topic: 'intervals', interval: 4 } },
		'Compare the notes and their spacing.'
	),
	make(
		'interval-fifths',
		'harmony',
		'A perfect fifth',
		'Theory',
		{ root: 'D', harmony: { topic: 'intervals', interval: 7 } },
		'Compare the notes and their spacing.'
	),
	make(
		'chord-anatomy',
		'harmony',
		'Inside a major chord',
		'Theory',
		{ root: 'C', harmony: { topic: 'chord', quality: '' } },
		'Read the chord on a staff and keyboard.'
	),
	make(
		'seventh-anatomy',
		'harmony',
		'Inside a seventh chord',
		'Theory',
		{ root: 'G', harmony: { topic: 'chord', quality: '7' } },
		'Read the chord on a staff and keyboard.'
	),
	make(
		'triad-inversions',
		'harmony',
		'Triad inversions',
		'Theory',
		{ root: 'F', harmony: { topic: 'inversions', quality: '' } },
		'Follow the bass note through the inversions.'
	),
	make(
		'seventh-inversions',
		'harmony',
		'Seventh-chord inversions',
		'Theory',
		{
			root: 'C',
			harmony: { topic: 'inversions', quality: 'maj7' },
			layout: { format: 'page' },
		},
		'Follow the bass note through the inversions.'
	),
	...[
		[ 'major-cadence', 'Major cadence', '1 4 5 1', false, false ],
		[ 'minor-cadence', 'Minor-key progression', '1 6 3 7', true, false ],
		[ 'jazz-cadence', 'Seventh-chord cadence', '2 5 1', false, true ],
		[ 'song-progression', 'Song progression', '1 5 6 4', false, false ],
		[
			'circle-progression',
			'Descending-fifths progression',
			'6 2 5 1',
			false,
			true,
		],
	].map( ( [ id, name, progression, minor, sevenths ] ) =>
		make(
			id,
			'harmony',
			name,
			'Progressions',
			{
				root: 'C',
				instrument: 'piano',
				harmony: { topic: 'progression', progression, minor, sevenths },
			},
			'Scale degrees with matching chord diagrams.'
		)
	),
	make(
		'piano-lesson',
		'lesson',
		'Piano lesson',
		'Lessons',
		{
			root: 'C',
			scale: 'major',
			instrument: 'piano',
			lesson: { fretboard: false },
			scales: { fingering: 'right' },
			style: { decoration: 'band', accent: '#087e8b' },
		},
		'A coordinated scale, keyboard and chord sheet.'
	),
	make(
		'guitar-lesson',
		'lesson',
		'Guitar lesson',
		'Lessons',
		{
			root: 'G',
			scale: 'major',
			instrument: 'guitar',
			lesson: { keyboard: false },
			fretFrom: 0,
			fretTo: 12,
			labels: 'degrees',
			style: { decoration: 'rule' },
		},
		'A coordinated scale, fretboard and chord sheet.'
	),
	make(
		'minor-lesson',
		'lesson',
		'Minor-key lesson',
		'Lessons',
		{
			root: 'A',
			scale: 'natural-minor',
			instrument: 'piano',
			lesson: { fretboard: false },
			style: { paper: 'cream', decoration: 'frame' },
		},
		'Connect a minor scale with its chords.'
	),
	make(
		'compare-instruments',
		'lesson',
		'Keys and strings',
		'Lessons',
		{
			root: 'D',
			scale: 'major',
			lesson: { keyboard: true, fretboard: true, chords: false },
		},
		'Compare the same notes on both instruments.'
	),
	make(
		'grip-comparison',
		'diagrams',
		'Alternative chord positions',
		'Guitar',
		{
			chords: 'C G Am F',
			grip: { compare: true },
			layout: { format: 'page' },
		},
		'Compare fingerings along the neck.'
	),
	make(
		'left-handed-chords',
		'diagrams',
		'Left-handed chord sheet',
		'Guitar',
		{ chords: 'C D Em G Am', grip: { leftHanded: true } },
		'Mirrored string order with readable labels.'
	),
	...[ 'intervals', 'chords', 'signatures', 'rhythms' ].map( ( topic, i ) =>
		make(
			'study-cards-' + topic,
			'flash',
			[
				'Interval cards',
				'Chord cards',
				'Key signature cards',
				'Rhythm cards',
			][ i ],
			'Exercises',
			{
				root: 'C',
				flash: { topic, side: 'front', columns: 3 },
				layout: { format: 'page', fit: true },
				style: { decoration: 'rule' },
			},
			'Questions and matching answer cards.'
		)
	),
	make(
		'original-duet',
		'score',
		'Little duet',
		'Ensemble',
		{
			abc: 'X:1\nT:Little duet\nM:4/4\nL:1/4\n%%score {1 2}\nV:1 clef=treble name="Melody"\nV:2 clef=bass name="Bass"\nK:C\n[V:1] C E G E | F A G2 | E D C D | E G C2 |]\n[V:2] C,2 G,2 | F,2 G,2 | C,2 G,2 | C,4 |]',
			style: { decoration: 'rule' },
		},
		'An original melody with a bass part.'
	),
	make(
		'original-round',
		'score',
		'A little round',
		'Ensemble',
		{
			abc: 'X:1\nT:A little round\nM:4/4\nL:1/4\n%%score {1 2}\nV:1 clef=treble\nV:2 clef=treble\nK:C\n[V:1] C E G E | E G c G | G c e c | c4 | x4 |]\n[V:2] x4 | C E G E | E G c G | G c e c | c4 |]',
		},
		'An original round with a delayed entry.'
	),
	make(
		'music-quote',
		'score',
		'Melody excerpt',
		'Design',
		{
			abc: 'X:1\nM:none\nL:1/8\nK:C\nC2 E G c2 G E | F2 A c B4 |]',
			style: { paper: 'transparent' },
			layout: { margin: 8, scale: 1.8 },
		},
		'A transparent musical phrase for your design.'
	),
];
