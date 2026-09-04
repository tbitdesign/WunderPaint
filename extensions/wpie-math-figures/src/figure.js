/**
 * The figure model (0.2): head (title, subtitle), blocks stacked on the
 * paper, foot (caption, note), typography per element and the paper.
 * One figure is ONE vector group in the editor; its params live in
 * layer.generator.params. 0.1 params (one card, one picture) migrate
 * here so older groups keep opening.
 */

export const FIGURE_DEFAULTS = {
	format: 'line',
	scale: 1,
	margin: 40,
	paper: 'white',
	ink: '#1a1a1a',
	accent: '#8d1436',
	titleFont: 'Arial',
	textFont: 'Arial',
};

export const TYPO_DEFAULTS = {
	title: {
		size: 40,
		color: '',
		weight: 700,
		italic: false,
		align: 'center',
		gap: 24,
	},
	subtitle: {
		size: 24,
		color: '',
		weight: 400,
		italic: false,
		align: 'center',
		gap: 20,
	},
	caption: {
		size: 22,
		color: '',
		weight: 400,
		italic: true,
		align: 'center',
		gap: 12,
	},
	note: {
		size: 16,
		color: '',
		weight: 400,
		italic: false,
		align: 'left',
		gap: 0,
	},
	text: {
		size: 22,
		color: '',
		weight: 400,
		italic: false,
		align: 'left',
		gap: 0,
	},
	numbers: { size: 22, color: '' },
};

export const BLOCK_DEFAULTS = {
	formula: { latex: '', formulaSize: 56, box: false, notes: '' },
	graph: {
		functions: '',
		xmin: -5,
		xmax: 5,
		ymin: null,
		ymax: null,
		equal: false,
		grid: 'major',
		ticks: 'numbers',
		legend: true,
		xLabel: 'x',
		yLabel: 'y',
		pa: 1,
		pb: 1,
		pc: 1,
	},
	geometry: { geometry: '' },
	numberline: { numberline: '' },
	fractions: { fractions: '', fractionMode: 'circle' },
	text: { text: '' },
	steps: { steps: '', formulaSize: 44, numbered: true, arrows: false },
	table: { table: '', header: true, zebra: false, border: true },
	clock: {
		clock: '',
		numbers: 'numbers',
		seconds: false,
		digital: false,
		hands: true,
	},
	hundred: { hundred: '', numbers: true },
	placevalue: { placevalue: '', blocks: false },
	multiplication: { multiplication: '' },
	wall: { wall: '' },
	ruler: { ruler: '' },
	stats: {
		stats: '',
		chart: 'dotplot',
		bins: 0,
		mean: false,
		median: false,
		counts: true,
	},
	unitcircle: {
		unitcircle: '',
		sincos: true,
		tangent: false,
		special: true,
		units: 'degrees',
	},
	sets: { sets: '', elements: true },
	tree: { tree: '', paths: true, format: 'typed', direction: 'right' },
	solids: { solids: '', hidden: true, dims: true, net: false },
};

/** The user's text per block type, for dynamic content and the block list snippet. */
const TEXT_FIELDS = {
	formula: [ 'latex', 'notes' ],
	graph: [ 'functions', 'xLabel', 'yLabel' ],
	geometry: [ 'geometry' ],
	numberline: [ 'numberline' ],
	fractions: [ 'fractions' ],
	text: [ 'text' ],
	steps: [ 'steps' ],
	table: [ 'table' ],
	clock: [ 'clock' ],
	hundred: [ 'hundred' ],
	placevalue: [ 'placevalue' ],
	multiplication: [ 'multiplication' ],
	wall: [ 'wall' ],
	ruler: [ 'ruler' ],
	stats: [ 'stats' ],
	unitcircle: [ 'unitcircle' ],
	sets: [ 'sets' ],
	tree: [ 'tree' ],
	solids: [ 'solids' ],
};

/** Blocks that take the figure's width (a percentage) instead of their natural width. */
export const WIDE = new Set( [
	'graph',
	'geometry',
	'text',
	'steps',
	'table',
	'clock',
	'hundred',
	'placevalue',
	'multiplication',
	'wall',
	'ruler',
	'stats',
	'unitcircle',
	'sets',
	'tree',
	'solids',
] );

export const FORMATS = [
	{ value: 'line', label: 'Line (width of the document)' },
	{ value: 'document', label: 'Document' },
	{ value: 'page', label: 'Page' },
	{ value: 'square', label: 'Square' },
	{ value: 'wide', label: 'Wide' },
];
export const PAPER_OPTIONS = [
	{ value: 'white', label: 'White' },
	{ value: 'cream', label: 'Cream' },
	{ value: 'grid', label: 'Grid paper' },
	{ value: 'lines', label: 'Lined paper' },
	{ value: 'chalk', label: 'Chalkboard' },
	{ value: 'dark', label: 'Dark' },
	{ value: 'transparent', label: 'Transparent' },
	{ value: 'brand', label: 'Brand kit' },
];
export const ALIGN_OPTIONS = [
	{ value: 'left', label: 'Left' },
	{ value: 'center', label: 'Center' },
	{ value: 'right', label: 'Right' },
];
export const TYPO_ELEMENTS = [
	{ value: 'title', label: 'Title' },
	{ value: 'subtitle', label: 'Subtitle' },
	{ value: 'caption', label: 'Caption' },
	{ value: 'note', label: 'Footnote' },
	{ value: 'text', label: 'Text' },
];

let counter = 0;
const newId = () =>
	'b' +
	( ++counter ).toString( 36 ) +
	Math.random().toString( 36 ).slice( 2, 6 );
const defined = ( o ) =>
	Object.fromEntries(
		Object.entries( o || {} ).filter( ( [ , v ] ) => undefined !== v )
	);

export function blockFields( type ) {
	return TEXT_FIELDS[ type ] || [];
}

export function newBlock( type, over = {} ) {
	const t = BLOCK_DEFAULTS[ type ] ? type : 'formula';
	return {
		id: newId(),
		type: t,
		align: 'center',
		gap: 24,
		width: 100,
		...BLOCK_DEFAULTS[ t ],
		...defined( over ),
	};
}

/** 0.1: one card with its fields, layout, style and a title. */
function fromV1( s ) {
	const type = BLOCK_DEFAULTS[ s.card ] ? s.card : 'formula';
	const over = {};
	for ( const k of Object.keys( BLOCK_DEFAULTS[ type ] ) ) {
		if ( undefined !== s[ k ] ) {
			over[ k ] = s[ k ];
		}
	}
	const layout = s.layout || {};
	const style = s.style || {};
	return normalizeParams( {
		v: 2,
		figure: {
			format: layout.format,
			scale: layout.scale,
			margin: layout.margin,
			paper: style.paper,
			ink: style.ink,
			accent: style.accent,
			titleFont: style.font,
			textFont: style.font,
		},
		head: { title: ( s.text && s.text.title ) || '' },
		blocks: [ { type, ...over } ],
	} );
}

export function normalizeParams( p ) {
	const src = p || {};
	if (
		! src.v &&
		( src.card || undefined !== src.latex || src.layout || src.style )
	) {
		return fromV1( src );
	}
	const typo = {};
	for ( const k of Object.keys( TYPO_DEFAULTS ) ) {
		typo[ k ] = {
			...TYPO_DEFAULTS[ k ],
			...defined( src.typo && src.typo[ k ] ),
		};
	}
	const blocks = ( Array.isArray( src.blocks ) ? src.blocks : [] )
		.filter( ( b ) => b && BLOCK_DEFAULTS[ b.type ] )
		.map( ( b ) => ( { ...newBlock( b.type ), ...defined( b ) } ) );
	if ( ! blocks.length ) {
		blocks.push( newBlock( 'formula' ) );
	}
	return {
		v: 2,
		figure: { ...FIGURE_DEFAULTS, ...defined( src.figure ) },
		head: { title: '', subtitle: '', ...defined( src.head ) },
		blocks,
		foot: { caption: '', note: '', ...defined( src.foot ) },
		typo,
		numbering: !! src.numbering,
	};
}
