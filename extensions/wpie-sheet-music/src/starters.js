/**
 * Starters: public-domain material, one finished picture per entry that
 * the user changes. Names are names and stay untranslated.
 */
export const STARTERS = [
	{
		id: 'ode-to-joy',
		card: 'score',
		name: 'Ode to Joy',
		subtitle: 'Beethoven, melody with lyrics',
		params: {
			abc: `X:1
T:Ode to Joy
C:Ludwig van Beethoven
M:4/4
L:1/4
K:C
E E F G | G F E D | C C D E | E3/2 D/2 D2 |
w:Freu-de schö-ner Göt-ter-fun-ken, Toch-ter aus E-ly-si-um,
E E F G | G F E D | C C D E | D3/2 C/2 C2 |]
w:wir be-tre-ten feu-er-trun-ken, Himm-li-sche, dein Hei-lig-tum!
`,
		},
	},
	{
		id: 'greensleeves',
		card: 'score',
		name: 'Greensleeves',
		subtitle: 'Traditional, 6/8 in A minor',
		params: {
			abc: `X:2
T:Greensleeves
C:Traditional
M:6/8
L:1/8
K:Am
A | c2 d e3/2 f/2 e | d2 B G3/2 A/2 B | c2 A A3/2 ^G/2 A | B2 ^G E2 A |
c2 d e3/2 f/2 e | d2 B G3/2 A/2 B | c3/2 B/2 A ^G3/2 F/2 ^G | A3 A2 |]
`,
		},
	},
	{
		id: 'amazing-grace',
		card: 'score',
		name: 'Amazing Grace',
		subtitle: 'Hymn with chords and lyrics',
		params: {
			abc: `X:3
T:Amazing Grace
C:John Newton
M:3/4
L:1/4
Q:1/4=80
K:G
D | "G"G2 B/2G/2 | "G"B2 A | "C"G2 E | "G"D2 D |
w:A- ma- zing _ grace how sweet the sound that
"G"G2 B/2G/2 | "G"B2 A | "D7"d3 | "D7"d2 B/2d/2 |
w:saved _ _ a wretch like me. I once
"G"d2 B/2G/2 | "G"B2 A | "C"G2 E | "G"D2 D |
w:was _ _ lost but now am found, was
"G"G2 B/2G/2 | "G"B2 A | "D7"G3 | "G"G2 |]
w:blind _ _ but now I see.
`,
		},
	},
	{
		id: 'twinkle-tab',
		card: 'score',
		name: 'Twinkle, Twinkle',
		subtitle: 'With guitar tab',
		params: {
			tab: true,
			instrument: 'guitar',
			abc: `X:4
T:Twinkle, Twinkle, Little Star
M:4/4
L:1/4
K:C
C C G G | A A G2 | F F E E | D D C2 |
G G F F | E E D2 | G G F F | E E D2 |
C C G G | A A G2 | F F E E | D D C2 |]
`,
		},
	},
	{
		id: 'prelude-piano',
		card: 'score',
		name: 'Prelude in C',
		subtitle: 'Bach, piano system with two voices',
		params: {
			abc: `X:5
T:Prelude in C
C:Johann Sebastian Bach
M:4/4
L:1/16
%%score {1 2}
V:1 clef=treble
V:2 clef=bass
K:C
[V:1] z2 GceGce z2 GceGce | z2 Adfadf z2 Adfadf | z2 Gdfgdf z2 Gdfgdf | z2 GceGce z2 GceGce |]
[V:2] C,16 | C,16 | B,,16 | C,16 |]
`,
		},
	},
	{
		id: 'silent-night',
		card: 'score',
		name: 'Silent Night',
		subtitle: 'Gruber, 6/8 with lyrics',
		params: {
			abc: `X:6
T:Silent Night
C:Franz Xaver Gruber
M:6/8
L:1/8
K:C
G3/2 A/2 G E3 | G3/2 A/2 G E3 | d3 d B | c3 c G |
w:Si- lent night _ ho- ly night _ all is calm all is bright
A3 A c3/2 B/2 A | G3/2 A/2 G E3 | A3 A c3/2 B/2 A | G3/2 A/2 G E3 |
w:round yon vir- gin mo- ther and child _ ho- ly in- fant so ten- der and mild
d3 d f3/2 d/2 B | c3 e3 | c3/2 G/2 E G3/2 F/2 D | C3 C3 |]
w:sleep in hea- ven- ly peace _ sleep in hea- ven- ly peace _ _
`,
		},
	},
	{
		id: 'frere-jacques',
		card: 'score',
		name: 'Frère Jacques',
		subtitle: 'Round, plain melody',
		params: {
			abc: `X:7
T:Frère Jacques
M:4/4
L:1/4
K:C
C D E C | C D E C | E F G2 | E F G2 |
G/2 A/2 G/2 F/2 E C | G/2 A/2 G/2 F/2 E C | C G, C2 | C G, C2 |]
`,
		},
	},
	{
		id: 'scarborough-score',
		card: 'score',
		name: 'Scarborough Fair',
		subtitle: 'Traditional, Dorian mode',
		params: {
			abc: `X:8
T:Scarborough Fair
C:Traditional
M:3/4
L:1/4
K:Ddor
D2 D | A2 A | E3/2 F/2 E | D3 | A3 | c3 | d2 c | A3 | B/2 G/2 A2 | D2 D |]
`,
		},
	},
	{
		id: 'fuer-elise',
		card: 'score',
		name: 'Für Elise',
		subtitle: 'Beethoven, the opening',
		params: {
			abc: `X:9
T:Für Elise
C:Ludwig van Beethoven
M:3/8
L:1/16
K:Am
e^d | e^d e B d c | A2 z C E A | B2 z E ^G B | c2 z E e^d |
e^d e B d c | A2 z C E A | B2 z E c B | A2 z2 |]
`,
		},
	},
	{
		id: 'evening-hymn',
		card: 'score',
		name: 'Evening Hymn',
		subtitle: 'Two voices on one staff',
		params: {
			abc: `X:10
T:Evening Hymn
M:4/4
L:1/4
%%score (1 2)
V:1 clef=treble
V:2 clef=treble
K:G
[V:1] G A B d | c B A2 | G A B G | A2 G2 |]
[V:2] D D D G | E D D2 | D D D D | D2 D2 |]
`,
		},
	},
	{
		id: 'ls-amazing-grace',
		card: 'leadsheet',
		name: 'Amazing Grace',
		subtitle: 'Leadsheet with diagrams',
		params: {
			chordpro: `{title: Amazing Grace}
{artist: John Newton, 1779}
{key: G}
A[G]mazing grace how [G7]sweet the [C]sound that [G]saved a wretch like [D7]me
I [G]once was lost but [G7]now am [C]found, was [G]blind but [D7]now I [G]see

'Twas [G]grace that taught my [G7]heart to [C]fear, and [G]grace my fears re[D7]lieved
How [G]precious did that [G7]grace ap[C]pear the [G]hour I [D7]first be[G]lieved
`,
		},
	},
	{
		id: 'ls-silent-night',
		card: 'leadsheet',
		name: 'Silent Night',
		subtitle: 'Leadsheet, two columns',
		params: {
			layout: { columns: 2 },
			chordpro: `{title: Silent Night}
{artist: Joseph Mohr, Franz Gruber}
{key: C}
[C]Silent night, holy night, [G7]all is calm, [C]all is bright
[F]Round yon virgin [C]mother and child, [F]holy infant so [C]tender and mild
[G7]Sleep in heavenly [C]peace, [C]sleep in [G7]heavenly [C]peace

[C]Silent night, holy night, [G7]shepherds quake [C]at the sight
[F]Glories stream from [C]heaven afar, [F]heavenly hosts sing [C]alleluia
[G7]Christ the Savior is [C]born, [C]Christ the [G7]Savior is [C]born
`,
		},
	},
	{
		id: 'ls-scarborough',
		card: 'leadsheet',
		name: 'Scarborough Fair',
		subtitle: 'Ukulele leadsheet',
		params: {
			instrument: 'ukulele',
			chordpro: `{title: Scarborough Fair}
{artist: Traditional}
{key: Am}
[Am]Are you going to [G]Scarborough [Am]Fair?
[C]Parsley, [Am]sage, rose[C]mary and [G]thyme
Re[Am]member me to [C]one who lives [G]there
[Am]She once was a [G]true love of [Am]mine
`,
		},
	},
	{
		id: 'chords-beginner',
		card: 'diagrams',
		name: 'Beginner chords',
		subtitle: 'The first eight guitar chords',
		params: {
			instrument: 'guitar',
			chords: 'C G D A E Am Em Dm',
			text: { title: 'Beginner chords' },
		},
	},
	{
		id: 'chords-key-c',
		card: 'diagrams',
		name: 'Key of C',
		subtitle: 'Diatonic chords',
		params: {
			instrument: 'guitar',
			chords: 'C Dm Em F G Am Bdim',
			text: { title: 'Key of C' },
		},
	},
	{
		id: 'chords-key-g',
		card: 'diagrams',
		name: 'Key of G',
		subtitle: 'Diatonic chords',
		params: {
			instrument: 'guitar',
			chords: 'G Am Bm C D Em F#dim',
			text: { title: 'Key of G' },
		},
	},
	{
		id: 'chords-key-d',
		card: 'diagrams',
		name: 'Key of D',
		subtitle: 'Diatonic chords',
		params: {
			instrument: 'guitar',
			chords: 'D Em F#m G A Bm C#dim',
			text: { title: 'Key of D' },
		},
	},
	{
		id: 'chords-ukulele',
		card: 'diagrams',
		name: 'Ukulele starter',
		subtitle: 'Eight chords for the ukulele',
		params: {
			instrument: 'ukulele',
			chords: 'C G Am F D Em A E',
			text: { title: 'Ukulele chords' },
		},
	},
	{
		id: 'chords-barre',
		card: 'diagrams',
		name: 'Barre chords',
		subtitle: 'The movable shapes',
		params: {
			instrument: 'guitar',
			chords: 'F Bm F#m Bb Cm Gm',
			text: { title: 'Barre chords' },
		},
	},
	{
		id: 'chords-jazz',
		card: 'diagrams',
		name: 'Jazz sevenths',
		subtitle: 'Seventh chords in C',
		params: {
			instrument: 'guitar',
			chords: 'Cmaj7 Dm7 Em7 Fmaj7 G7 Am7 Bm7b5 E7',
			text: { title: 'Seventh chords in C' },
		},
	},
	{
		id: 'chords-piano',
		card: 'diagrams',
		name: 'Piano triads',
		subtitle: 'Chords on the keys',
		params: {
			instrument: 'piano',
			chords: 'C Dm Em F G Am',
			text: { title: 'Triads in C' },
		},
	},
	{
		id: 'fret-am-penta',
		card: 'fretboard',
		name: 'A minor pentatonic',
		subtitle: 'Box one, frets 5 to 8',
		params: {
			instrument: 'guitar',
			root: 'A',
			scale: 'minor-pentatonic',
			fretFrom: 4,
			fretTo: 9,
			labels: 'intervals',
		},
	},
	{
		id: 'fret-c-major',
		card: 'fretboard',
		name: 'C major, whole neck',
		subtitle: 'Note names to the twelfth fret',
		params: {
			instrument: 'guitar',
			root: 'C',
			scale: 'major',
			fretFrom: 0,
			fretTo: 12,
			labels: 'names',
		},
	},
	{
		id: 'fret-e-blues',
		card: 'fretboard',
		name: 'E blues',
		subtitle: 'Scale degrees, open position',
		params: {
			instrument: 'guitar',
			root: 'E',
			scale: 'blues',
			fretFrom: 0,
			fretTo: 12,
			labels: 'degrees',
		},
	},
	{
		id: 'fret-bass-g',
		card: 'fretboard',
		name: 'G major on bass',
		subtitle: 'Four strings, frets 2 to 7',
		params: {
			instrument: 'bass',
			root: 'G',
			scale: 'major',
			fretFrom: 2,
			fretTo: 7,
			labels: 'names',
		},
	},
	{
		id: 'keys-c-major',
		card: 'fretboard',
		name: 'C major on piano',
		subtitle: 'Two octaves',
		params: { instrument: 'piano', root: 'C', scale: 'major', octaves: 2 },
	},
	{
		id: 'keys-a-minor',
		card: 'fretboard',
		name: 'A harmonic minor on piano',
		subtitle: 'Two octaves',
		params: {
			instrument: 'piano',
			root: 'A',
			scale: 'harmonic-minor',
			octaves: 2,
		},
	},
	/* 0.2: manuscript paper */
	{
		id: 'paper-treble',
		card: 'paper',
		name: 'Treble staves',
		subtitle: 'Ten staves in 4/4, four bars each',
		params: {
			paper: {
				clef: 'treble',
				key: 'C',
				meter: '4/4',
				bars: 4,
				staves: 10,
				sep: 90,
				tab: false,
				grids: 0,
			},
			layout: { format: 'page', scale: 1.2, margin: 60 },
		},
	},
	{
		id: 'paper-grand',
		card: 'paper',
		name: 'Piano paper',
		subtitle: 'Six grand-staff systems in G',
		params: {
			paper: {
				clef: 'grand',
				key: 'G',
				meter: '4/4',
				bars: 4,
				staves: 6,
				sep: 70,
				tab: false,
				grids: 0,
			},
			layout: { format: 'page', scale: 1.2, margin: 60 },
		},
	},
	{
		id: 'paper-guitar',
		card: 'paper',
		name: 'Guitar paper',
		subtitle: 'Staff with TAB lines and chord grids',
		params: {
			paper: {
				clef: 'treble',
				key: 'C',
				meter: 'none',
				bars: 0,
				staves: 6,
				sep: 110,
				tab: true,
				grids: 6,
			},
			instrument: 'guitar',
			layout: { format: 'page', scale: 1.2, margin: 60 },
		},
	},
	{
		id: 'paper-free',
		card: 'paper',
		name: 'Free paper',
		subtitle: 'Twelve staves, no clef, no bars',
		params: {
			paper: {
				clef: 'none',
				key: 'C',
				meter: 'none',
				bars: 0,
				staves: 12,
				sep: 80,
				tab: false,
				grids: 0,
			},
			layout: { format: 'page', scale: 1.2, margin: 60 },
		},
	},
	/* 0.2: note cards */
	{
		id: 'flash-treble',
		card: 'flash',
		name: 'Treble clef cards',
		subtitle: 'Lines and spaces, letter names',
		params: {
			flash: {
				clef: 'treble',
				range: 'all',
				names: 'letters',
				side: 'front',
				columns: 3,
			},
			layout: { format: 'page', scale: 1.3, margin: 48 },
		},
	},
	{
		id: 'flash-bass',
		card: 'flash',
		name: 'Bass clef cards',
		subtitle: 'Lines and spaces',
		params: {
			flash: {
				clef: 'bass',
				range: 'all',
				names: 'letters',
				side: 'front',
				columns: 3,
			},
			layout: { format: 'page', scale: 1.3, margin: 48 },
		},
	},
	{
		id: 'flash-ledger',
		card: 'flash',
		name: 'Ledger line cards',
		subtitle: 'Both clefs, the notes above and below',
		params: {
			flash: {
				clef: 'both',
				range: 'ledger',
				names: 'letters',
				side: 'front',
				columns: 4,
			},
			layout: { format: 'page', scale: 1.2, margin: 48 },
		},
	},
	{
		id: 'flash-german',
		card: 'flash',
		name: 'Note cards, German names',
		subtitle: 'Both clefs, H for B, backs',
		params: {
			flash: {
				clef: 'both',
				range: 'all',
				names: 'german',
				side: 'back',
				columns: 3,
			},
			layout: { format: 'page', scale: 1.3, margin: 48 },
		},
	},
	/* 0.2: scale sheets */
	{
		id: 'scale-c-piano',
		card: 'scales',
		name: 'C major, piano',
		subtitle: 'Two octaves, both hands fingered',
		params: {
			root: 'C',
			scale: 'major',
			scales: {
				mode: 'one',
				direction: 'updown',
				octaves: 2,
				fingering: 'both',
			},
			instrument: 'piano',
			layout: { format: 'line', scale: 1.5, margin: 48 },
		},
	},
	{
		id: 'scale-majors',
		card: 'scales',
		name: 'The twelve majors',
		subtitle: 'Circle of fifths, right-hand fingering',
		params: {
			scales: {
				mode: 'majors',
				direction: 'up',
				octaves: 1,
				fingering: 'right',
			},
			instrument: 'piano',
			layout: { format: 'line', scale: 1.1, margin: 48 },
		},
	},
	{
		id: 'scale-minors',
		card: 'scales',
		name: 'The twelve harmonic minors',
		subtitle: 'Circle of fifths, one octave',
		params: {
			scales: {
				mode: 'minors',
				direction: 'up',
				octaves: 1,
				fingering: 'right',
			},
			instrument: 'piano',
			layout: { format: 'line', scale: 1.1, margin: 48 },
		},
	},
	{
		id: 'scale-a-minor-penta-tab',
		card: 'scales',
		name: 'A minor pentatonic, guitar',
		subtitle: 'With tablature',
		params: {
			root: 'A',
			scale: 'minor-pentatonic',
			scales: {
				mode: 'one',
				direction: 'updown',
				octaves: 2,
				fingering: 'tab',
			},
			instrument: 'guitar',
			tuning: 'standard',
			layout: { format: 'line', scale: 1.5, margin: 48 },
		},
	},
	{
		id: 'scale-e-blues-tab',
		card: 'scales',
		name: 'E blues, guitar',
		subtitle: 'Ascending and descending with TAB',
		params: {
			root: 'E',
			scale: 'blues',
			scales: {
				mode: 'one',
				direction: 'updown',
				octaves: 1,
				fingering: 'tab',
			},
			instrument: 'guitar',
			tuning: 'standard',
			layout: { format: 'line', scale: 1.5, margin: 48 },
		},
	},
];

export const starterById = ( id ) =>
	STARTERS.find( ( s ) => s.id === id ) || null;
