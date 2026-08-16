/**
 * The schools: art movements as a layer ABOVE the styles.
 *
 * A movement never talks to an actor. It is applied once, at casting
 * and look time: it biases WHO takes the stage (weights), WHAT mark a
 * painter leaves (marks), how big and how many (sizeMul, countMul),
 * which colors and ground feel like home, where the dials rest, and
 * how the light treats the result (post multipliers, feedback). The
 * society underneath stays exactly the society.
 *
 * Weights use the painter keys: ink, neon, oil, shard, coral, thread,
 * mason, hive, clock, constel, metro. A missing key means 1.
 */

export const MOVEMENTS = [
	{
		id: 'free',
		label: 'Free study',
		blurb: 'No school. The society as it came.',
	},
	{
		id: 'impressionism',
		medium: 'brush',
		label: 'Impressionism',
		blurb: 'Broken color in soft light, laid on in short dabs.',
		paletteId: 'morning',
		ground: 'paper',
		dials: { chaos: 45, energy: 50, density: 75, tempo: 90 },
		post: { bloom: 0.6, dof: 1.25, grain: 1.3, vignette: 0.9 },
		weights: {
			ink: 1.6,
			oil: 1,
			thread: 0.4,
			neon: 0.1,
			shard: 0,
			coral: 0.5,
			mason: 0.1,
			hive: 0.3,
			clock: 0.4,
			constel: 0.1,
			metro: 0.3,
		},
		marks: { ink: 'disc' },
		sizeMul: 0.65,
	},
	{
		id: 'pointillism',
		medium: 'brush',
		label: 'Pointillism',
		blurb: 'The whole picture from tiny dots of pure color.',
		paletteId: 'morning',
		ground: 'paper',
		dials: { chaos: 35, energy: 55, density: 95, tempo: 100 },
		post: { bloom: 0.4, dof: 0.9, grain: 1, vignette: 0.8 },
		weights: {
			ink: 2,
			oil: 0.5,
			thread: 0.4,
			neon: 0.1,
			shard: 0,
			coral: 0.4,
			mason: 0,
			hive: 0.2,
			clock: 0.6,
			constel: 0.2,
			metro: 0.4,
		},
		marks: { ink: 'dot', oil: 'dot', thread: 'dot' },
		sizeMul: 0.42,
	},
	{
		id: 'cubism',
		label: 'Cubism',
		blurb: 'The subject taken apart into facets and planes.',
		paletteId: 'earthen',
		dials: { chaos: 60, energy: 55, density: 60, tempo: 95 },
		post: { bloom: 0.2, dof: 0.6, grain: 0.9, vignette: 0.8 },
		weights: {
			ink: 0.5,
			oil: 0.1,
			thread: 0.2,
			neon: 0,
			shard: 1.6,
			coral: 0.1,
			mason: 1.2,
			hive: 0.4,
			clock: 0.3,
			constel: 0.6,
			metro: 0.8,
		},
		marks: { ink: 'frame' },
		sizeMul: 1.1,
	},
	{
		id: 'bauhaus',
		label: 'Bauhaus',
		blurb: 'Circle, square, triangle; primary colors, clear order.',
		paletteId: 'bauhaus',
		ground: 'paper',
		dials: { chaos: 25, energy: 55, density: 55, tempo: 100 },
		post: { bloom: 0.05, dof: 0.5, grain: 0.25, vignette: 0.35 },
		weights: {
			ink: 0.3,
			oil: 0,
			thread: 1.2,
			neon: 0,
			shard: 0.2,
			coral: 0,
			mason: 1.6,
			hive: 0.4,
			clock: 0.8,
			constel: 0.5,
			metro: 1,
		},
		marks: { ink: 'rod' },
		sizeMul: 1.15,
	},
	{
		id: 'surrealism',
		label: 'Surrealism',
		blurb: 'Dream logic: soft matter, strange neighbors, slow time.',
		paletteId: 'aurora',
		ground: 'mist',
		dials: { chaos: 70, energy: 45, density: 55, tempo: 70 },
		post: { bloom: 0.7, dof: 1.5, grain: 0.9, vignette: 1.1 },
		weights: {
			ink: 0.4,
			oil: 1.6,
			thread: 0.5,
			neon: 0.2,
			shard: 0.3,
			coral: 1.3,
			mason: 0.2,
			hive: 0.4,
			clock: 0.7,
			constel: 0.3,
			metro: 0.2,
		},
		marks: { shard: 'cone' },
		sizeMul: 1.35,
	},
	{
		id: 'opart',
		label: 'Op Art',
		blurb: 'Rhythm and repetition until the eye starts to swim.',
		paletteId: 'mono',
		ground: 'void',
		dials: { chaos: 18, energy: 60, density: 80, tempo: 110 },
		post: { bloom: 0.15, dof: 0.25, grain: 0.15, vignette: 0.5 },
		weights: {
			ink: 0.2,
			oil: 0,
			thread: 1.2,
			neon: 0.1,
			shard: 0.1,
			coral: 0,
			mason: 0.5,
			hive: 0.3,
			clock: 1.2,
			constel: 0.2,
			metro: 1.8,
		},
		marks: { metro: 'ring' },
		sizeMul: 1,
	},
	{
		id: 'action',
		medium: 'splash',
		label: 'Action Painting',
		blurb: 'The gesture itself, flung fast and wet.',
		paletteId: 'crimson',
		dials: { chaos: 85, energy: 90, density: 65, tempo: 140 },
		post: { bloom: 0.4, dof: 0.7, grain: 1.1, vignette: 0.7 },
		weights: {
			ink: 2,
			oil: 0.3,
			thread: 0.1,
			neon: 0.4,
			shard: 0.6,
			coral: 0.1,
			mason: 0,
			hive: 0,
			clock: 0.1,
			constel: 0.1,
			metro: 0.1,
		},
		sizeMul: 1.2,
	},
	{
		id: 'futurism',
		label: 'Futurism',
		blurb: 'Speed made visible; everything in motion at once.',
		paletteId: 'ember',
		dials: { chaos: 60, energy: 85, density: 60, tempo: 150 },
		post: {
			bloom: 0.8,
			dof: 0.5,
			grain: 0.6,
			vignette: 0.8,
			feedback: 0.82,
			fbZoom: 0.02,
			fbTwist: 0.002,
		},
		weights: {
			ink: 0.8,
			oil: 0.1,
			thread: 0.8,
			neon: 1.5,
			shard: 1,
			coral: 0,
			mason: 0.2,
			hive: 0.1,
			clock: 0.5,
			constel: 0.4,
			metro: 0.6,
		},
		marks: { shard: 'cone' },
		sizeMul: 0.9,
	},
	{
		id: 'minimalism',
		label: 'Minimalism',
		blurb: 'A few large, calm forms and a great deal of room.',
		paletteId: 'mono',
		ground: 'void',
		dials: { chaos: 20, energy: 30, density: 12, tempo: 60 },
		post: { bloom: 0.1, dof: 0.8, grain: 0.3, vignette: 0.9 },
		weights: {
			ink: 0.2,
			oil: 0.2,
			thread: 1,
			neon: 0,
			shard: 0.2,
			coral: 0.1,
			mason: 0.8,
			hive: 0.2,
			clock: 0.6,
			constel: 0.3,
			metro: 0.3,
		},
		countMul: 0.25,
		sizeMul: 2.4,
	},
];

export function movementById( id ) {
	return MOVEMENTS.find( ( m ) => m.id === id ) || MOVEMENTS[ 0 ];
}

/** The temperament a painter of `key` gets under this school. */
export function schooledTemperament( movement, key, base ) {
	if ( ! movement || 'free' === movement.id ) {
		return base;
	}
	const out = { ...base };
	if ( movement.marks && movement.marks[ key ] ) {
		out.markShape = movement.marks[ key ];
	}
	if ( movement.sizeMul ) {
		out.sizeMul = ( base.sizeMul || 1 ) * movement.sizeMul;
	}
	return out;
}
