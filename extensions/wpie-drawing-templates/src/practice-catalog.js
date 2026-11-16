import { MODES } from './drawing-engine.js';

// The photo tools and the source-independent exercises share one library.
export const PRACTICE_MODES = [
	[
		'warmup',
		'Line warmups',
		'Foundations',
		[ 'Waves', 'Loops', 'Arches', 'Spirals', 'Zigzags', 'Parallel lines' ],
	],
	[
		'forms',
		'Shape practice',
		'Foundations',
		[ 'Circles', 'Ellipses', 'Leaves', 'Compound shapes' ],
	],
	[
		'hatching',
		'Hatching practice',
		'Tone and texture',
		[
			'Parallel hatching',
			'Crosshatching',
			'Contour hatching',
			'Scribble shading',
		],
	],
	[
		'stippling',
		'Stippling practice',
		'Tone and texture',
		[ 'Tonal steps', 'Soft gradient', 'Sphere study' ],
	],
	[
		'textures',
		'Texture studies',
		'Tone and texture',
		[
			'Wood grain',
			'Bark',
			'Fur',
			'Feathers',
			'Water',
			'Stone',
			'Woven fabric',
		],
	],
	[
		'values',
		'Light and shadow',
		'Tone and texture',
		[ 'Tonal steps', 'Soft gradient', 'Sphere study' ],
	],
	[
		'lettering',
		'Lettering practice',
		'Lettering and ornament',
		[ 'Outline letters', 'Fading letters', 'Freehand lettering' ],
	],
	[
		'ornaments',
		'Ornament borders',
		'Lettering and ornament',
		[ 'Leaf border', 'Flower border', 'Wave band', 'Braided band' ],
	],
	[
		'rosette',
		'Rosette builder',
		'Lettering and ornament',
		[ 'Petals', 'Leaf rings', 'Scallops', 'Complete the rosette' ],
	],
	[
		'negative',
		'Negative space',
		'Observation',
		[ 'Silhouette', 'Inverted silhouette' ],
		true,
	],
	[
		'anchors',
		'Anchor points',
		'Observation',
		[ 'Light guides', 'Independent study' ],
		true,
	],
	[
		'detailstudy',
		'Detail studies',
		'Observation',
		[ 'Center detail', 'Upper detail', 'Lower detail' ],
		true,
	],
	[
		'construction',
		'Draw a motif step by step',
		'Observation',
		[ 'Four stages', 'Six stages' ],
	],
].map( ( [ id, label, category, variants, source = false ] ) => ( {
	id,
	label,
	category,
	variants,
	source,
} ) );

const categories = {
	paintbynumbers: 'Color and codes',
	coloring: 'Color and codes',
	code: 'Color and codes',
	shade: 'Color and codes',
	tracing: 'Observation',
	dots: 'Observation',
	symmetry: 'Observation',
	grid: 'Observation',
	steps: 'Observation',
	oneline: 'Lettering and ornament',
	finish: 'Observation',
	mandala: 'Lettering and ornament',
};
export const ALL_MODES = [
	...PRACTICE_MODES,
	...MODES.map( ( m ) => ( {
		...m,
		category: categories[ m.id ],
		source: true,
	} ) ),
];
export const PRACTICE_DEFAULTS = {
	motif: 'fox',
	difficulty: 'guided',
	practiceVariant: 0,
	rows: 5,
	hintOpacity: 38,
	practiceText: 'Aa Bb Cc',
	strokeWeight: 2,
	rings: 4,
	symAxis: 'vertical',
	gridScale: 1,
};
export const DIFFICULTIES = [
	[ 'guided', 'Guided' ],
	[ 'balanced', 'Balanced' ],
	[ 'independent', 'Independent' ],
];
export const PRESETS = [
	...PRACTICE_MODES.flatMap( ( m ) =>
		m.variants.map( ( label, i ) => ( {
			id: m.id + '-' + i,
			label,
			mode: m.id,
			category: m.category,
			params: {
				mode: m.id,
				practiceVariant: i,
				...( m.id === 'construction'
					? { source: 'motif', steps: i ? 6 : 4 }
					: {} ),
			},
		} ) )
	),
	...[
		[ 'coloring', 'Simple outlines', { detail: 1 } ],
		[ 'coloring', 'Detailed outlines', { detail: 3 } ],
		[ 'tracing', 'Gentle tracing', { detail: 1 } ],
		[ 'tracing', 'Detailed tracing', { detail: 3 } ],
		[ 'dots', 'First dot drawing', { dots: 30, dotHints: true } ],
		[ 'dots', 'Dot challenge', { dots: 90, dotHints: false } ],
		[ 'symmetry', 'Vertical symmetry', { symAxis: 'vertical' } ],
		[ 'symmetry', 'Horizontal symmetry', { symAxis: 'horizontal' } ],
		[ 'symmetry', 'Diagonal symmetry', { symAxis: 'diagonal' } ],
		[ 'symmetry', 'Quarter symmetry', { symAxis: 'quarter' } ],
		[ 'grid', 'Copy at original size', { gridScale: 1 } ],
		[ 'grid', 'Enlarge a drawing', { gridScale: 1.5 } ],
		[ 'grid', 'Reduce a drawing', { gridScale: 0.75 } ],
		[ 'paintbynumbers', 'Soft color study', { colors: 6, smooth: 3 } ],
		[ 'paintbynumbers', 'Rich color study', { colors: 14, smooth: 2 } ],
		[ 'code', 'Color by symbols', { codeKind: 'symbols', codeColors: 6 } ],
		[ 'code', 'Color by letters', { codeKind: 'letters' } ],
		[ 'code', 'Color by addition', { codeKind: 'add' } ],
		[ 'shade', 'Three-tone study', { shades: 3 } ],
		[ 'shade', 'Five-tone study', { shades: 5 } ],
		[ 'oneline', 'Wave drawing', { lineStyle: 'waves' } ],
		[ 'oneline', 'Spiral drawing', { lineStyle: 'spiral' } ],
		[ 'finish', 'Fading drawing', { finishVariant: 'fade' } ],
		[ 'finish', 'Missing pieces', { finishVariant: 'missing' } ],
		[ 'steps', 'Photo study in four steps', { steps: 4 } ],
		[ 'mandala', 'Photo mandala', { segments: 8 } ],
	].map( ( [ mode, label, params ], i ) => ( {
		id: 'image-' + i,
		label,
		mode,
		category: categories[ mode ],
		params: { mode, ...params },
	} ) ),
];

export function practiceOptions( params ) {
	const m = PRACTICE_MODES.find( ( entry ) => entry.id === params.mode );
	const clamp = ( value, min, max, fallback ) =>
		Number.isFinite( Number( value ) )
			? Math.max( min, Math.min( max, Number( value ) ) )
			: fallback;
	return {
		...PRACTICE_DEFAULTS,
		...params,
		motif: typeof params.motif === 'string' ? params.motif : 'fox',
		practiceVariant: Math.floor(
			clamp(
				params.practiceVariant,
				0,
				( m?.variants.length || 1 ) - 1,
				0
			)
		),
		rows: Math.round( clamp( params.rows, 3, 7, 5 ) ),
		rings: Math.round( clamp( params.rings, 2, 6, 4 ) ),
		segments: Math.round( clamp( params.segments, 4, 16, 8 ) ),
		strokeWeight: clamp( params.strokeWeight, 1, 4, 2 ),
		hintOpacity: clamp( params.hintOpacity, 10, 70, 38 ),
		difficulty: DIFFICULTIES.some( ( [ id ] ) => id === params.difficulty )
			? params.difficulty
			: 'guided',
		practiceText: String( params.practiceText ?? 'Aa Bb Cc' ).slice(
			0,
			80
		),
	};
}
