/** Scales and arpeggios as semitone sets, plus the labels the UI shows. */
export const SCALES = {
	major: [ 0, 2, 4, 5, 7, 9, 11 ],
	'natural-minor': [ 0, 2, 3, 5, 7, 8, 10 ],
	'harmonic-minor': [ 0, 2, 3, 5, 7, 8, 11 ],
	'melodic-minor': [ 0, 2, 3, 5, 7, 9, 11 ],
	dorian: [ 0, 2, 3, 5, 7, 9, 10 ],
	phrygian: [ 0, 1, 3, 5, 7, 8, 10 ],
	lydian: [ 0, 2, 4, 6, 7, 9, 11 ],
	mixolydian: [ 0, 2, 4, 5, 7, 9, 10 ],
	locrian: [ 0, 1, 3, 5, 6, 8, 10 ],
	'major-pentatonic': [ 0, 2, 4, 7, 9 ],
	'minor-pentatonic': [ 0, 3, 5, 7, 10 ],
	blues: [ 0, 3, 5, 6, 7, 10 ],
	chromatic: [ 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 ],
	'whole-tone': [ 0, 2, 4, 6, 8, 10 ],
	diminished: [ 0, 1, 3, 4, 6, 7, 9, 10 ],
};

export const ARPEGGIOS = {
	'arp-major': [ 0, 4, 7 ],
	'arp-minor': [ 0, 3, 7 ],
	'arp-dim': [ 0, 3, 6 ],
	'arp-aug': [ 0, 4, 8 ],
	'arp-maj7': [ 0, 4, 7, 11 ],
	'arp-dom7': [ 0, 4, 7, 10 ],
	'arp-m7': [ 0, 3, 7, 10 ],
};

/** Source strings for the select; translated through t() in the UI. */
export const SCALE_LABELS = {
	major: 'Major',
	'natural-minor': 'Natural minor',
	'harmonic-minor': 'Harmonic minor',
	'melodic-minor': 'Melodic minor',
	dorian: 'Dorian',
	phrygian: 'Phrygian',
	lydian: 'Lydian',
	mixolydian: 'Mixolydian',
	locrian: 'Locrian',
	'major-pentatonic': 'Major pentatonic',
	'minor-pentatonic': 'Minor pentatonic',
	blues: 'Blues',
	chromatic: 'Chromatic',
	'whole-tone': 'Whole tone',
	diminished: 'Diminished',
	'arp-major': 'Major arpeggio',
	'arp-minor': 'Minor arpeggio',
	'arp-dim': 'Diminished arpeggio',
	'arp-aug': 'Augmented arpeggio',
	'arp-maj7': 'Major seventh arpeggio',
	'arp-dom7': 'Dominant seventh arpeggio',
	'arp-m7': 'Minor seventh arpeggio',
};

export function scaleSteps( id ) {
	return SCALES[ id ] || ARPEGGIOS[ id ] || null;
}

/** Pitch classes of a scale on a root, in scale order. */
export function scalePitches( rootPc, id ) {
	const steps = scaleSteps( id );
	return steps ? steps.map( ( s ) => ( rootPc + s ) % 12 ) : [];
}

export const degreeLabel = ( index ) => String( index + 1 );

const INTERVAL_LABELS = [
	'R',
	'b2',
	'2',
	'b3',
	'3',
	'4',
	'b5',
	'5',
	'b6',
	'6',
	'b7',
	'7',
];
export const intervalLabel = ( semitones ) =>
	INTERVAL_LABELS[ ( ( semitones % 12 ) + 12 ) % 12 ];
