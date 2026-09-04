/**
 * The blocks of a figure and the figure itself. A block is a pure
 * function render( block, ctx, env ) -> { inner, w, h, warnings } with
 * ctx = { innerWidth, blockWidth, style, typo, scale, t } and env =
 * { docW, docH, t, kits, typeset, measure }. renderFigure() stacks the
 * head (title, subtitle), the blocks and the foot (caption, note) on the
 * paper, with the typography from the params. Formula and legend text
 * need the MathJax engine (env.typeset); without it the block says so.
 */
import { svgDoc, textEl, PAPERS, paperPattern, r } from './engine/svg.js';
import { parseFunctions, renderPlot } from './engine/plot.js';
import { parseGeometry, renderGeometry } from './engine/geometry.js';
import { parseNumberLine, renderNumberLine } from './engine/numberline.js';
import { parseFractions, renderFractions } from './engine/fractions.js';
import { layoutText } from './engine/text.js';
import { parseSteps, layoutSteps } from './engine/steps.js';
import { parseNotes, layoutMarks } from './engine/annotate.js';
import { parseTable, layoutTable } from './engine/table.js';
import { parseClock, renderClock } from './engine/clock.js';
import { parseHundred, renderHundred } from './engine/hundred.js';
import { parsePlaceValue, renderPlaceValue } from './engine/placevalue.js';
import {
	parseMultiplication,
	renderMultiplication,
} from './engine/multiplication.js';
import { parseWall, renderWall } from './engine/wall.js';
import { parseRuler, renderRuler } from './engine/ruler.js';
import { parseStats, renderStats } from './engine/stats.js';
import { parseUnitCircle, renderUnitCircle } from './engine/unitcircle.js';
import { parseSets, renderSets } from './engine/sets.js';
import { parseTree, renderTree } from './engine/tree.js';
import { parseSolids, renderSolids } from './engine/solids.js';
import { WIDE, FIGURE_DEFAULTS } from './figure.js';

export const GRID_OPTIONS = [
	{ value: 'none', label: 'No grid' },
	{ value: 'major', label: 'Grid' },
	{ value: 'fine', label: 'Fine grid' },
];
export const TICK_OPTIONS = [
	{ value: 'numbers', label: 'Numbers' },
	{ value: 'pi', label: 'Multiples of pi' },
];
export const FRACTION_MODES = [
	{ value: 'circle', label: 'Circles' },
	{ value: 'bar', label: 'Bars' },
	{ value: 'grid', label: 'Grids' },
	{ value: 'set', label: 'Sets' },
];

export const CLOCK_NUMBERS = [
	{ value: 'numbers', label: 'Numbers' },
	{ value: 'roman', label: 'Roman numerals' },
	{ value: 'ticks', label: 'Ticks only' },
	{ value: 'none', label: 'Blank face' },
];

export const STATS_CHARTS = [
	{ value: 'dotplot', label: 'Dot plot' },
	{ value: 'bar', label: 'Bar chart' },
	{ value: 'histogram', label: 'Histogram' },
	{ value: 'boxplot', label: 'Box plot' },
];
export const ANGLE_UNITS = [
	{ value: 'degrees', label: 'Degrees' },
	{ value: 'radians', label: 'Radians' },
];
export const TREE_FORMATS = [
	{ value: 'typed', label: 'As typed' },
	{ value: 'decimal', label: 'Decimal' },
	{ value: 'fraction', label: 'Fraction' },
	{ value: 'percent', label: 'Percent' },
];
export const TREE_DIRECTIONS = [
	{ value: 'right', label: 'To the right' },
	{ value: 'down', label: 'Downwards' },
];

export const BLOCK_GROUPS = [
	{ id: 'explain', label: 'Formulas and text' },
	{ id: 'graphs', label: 'Graphs and geometry' },
	{ id: 'numbers', label: 'Numbers' },
	{ id: 'primary', label: 'Primary school' },
	{ id: 'secondary', label: 'Secondary school' },
];

const ENGINE_LOADING = 'The formula engine is still loading.';
const HAS_MATH = /\$[^$]+\$/;

export function frameFor( figure, docW, docH ) {
	switch ( figure.format ) {
		case 'document':
			return {
				width: Math.max( 200, docW || 1600 ),
				height: Math.max( 200, docH || 1000 ),
			};
		case 'page':
			return { width: 1600, height: 2263 };
		case 'square':
			return { width: 1600, height: 1600 };
		case 'wide':
			return { width: 1920, height: 1080 };
		default:
			return {
				width: docW ? Math.max( 600, Math.min( 2400, docW ) ) : 1600,
				height: null,
			};
	}
}

const normHex = ( c ) => {
	if ( 'string' !== typeof c ) {
		return null;
	}
	const s = c.trim().toLowerCase();
	if ( /^#[0-9a-f]{6}$/.test( s ) ) {
		return s;
	}
	const m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec( s );
	return m ? '#' + m[ 1 ] + m[ 1 ] + m[ 2 ] + m[ 2 ] + m[ 3 ] + m[ 3 ] : null;
};
const lum = ( h ) => {
	const n = parseInt( h.slice( 1 ), 16 );
	return (
		0.299 * ( ( n >> 16 ) & 255 ) +
		0.587 * ( ( n >> 8 ) & 255 ) +
		0.114 * ( n & 255 )
	);
};
/** ink blended towards the paper, for explanations and numbers. */
const mix = ( a, b, k ) => {
	const A = normHex( a ) || '#000000';
	const B = normHex( b ) || '#ffffff';
	const ch = ( i ) =>
		Math.round(
			parseInt( A.slice( 1 + 2 * i, 3 + 2 * i ), 16 ) * ( 1 - k ) +
				parseInt( B.slice( 1 + 2 * i, 3 + 2 * i ), 16 ) * k
		);
	return (
		'#' +
		[ 0, 1, 2 ]
			.map( ( i ) => ch( i ).toString( 16 ).padStart( 2, '0' ) )
			.join( '' )
	);
};

export function styleFor( figure, kits ) {
	let bg;
	let ink;
	let accent = figure.accent;
	let pattern = null;
	if ( 'brand' === figure.paper ) {
		const kit = Array.isArray( kits ) && kits.length ? kits[ 0 ] : null;
		const cols = ( kit && kit.colors ? kit.colors : [] )
			.map( normHex )
			.filter( Boolean );
		const byLum = [ ...cols ].sort( ( a, b ) => lum( a ) - lum( b ) );
		bg = byLum.length ? byLum[ byLum.length - 1 ] : '#ffffff';
		ink = byLum.length ? byLum[ 0 ] : '#1a1a1a';
		accent =
			byLum.length > 2
				? byLum[ Math.floor( byLum.length / 2 ) ]
				: figure.accent;
		if ( lum( bg ) - lum( ink ) < 60 ) {
			bg = lum( bg ) > 128 ? '#ffffff' : '#15171b';
		}
	} else {
		const paper = PAPERS[ figure.paper ] || PAPERS.white;
		bg = paper.bg;
		ink =
			figure.ink && figure.ink !== FIGURE_DEFAULTS.ink
				? figure.ink
				: paper.ink;
		pattern = paper.pattern || null;
	}
	const muted = mix( ink, bg || '#ffffff', 0.35 );
	return {
		bg,
		ink,
		accent,
		muted,
		pattern,
		titleFont: figure.titleFont || 'Arial',
		textFont: figure.textFont || 'Arial',
	};
}

export function stripSvg( svg ) {
	const m = /^<svg[^>]*>/.exec( svg );
	const head = m ? m[ 0 ] : '';
	const w = parseFloat(
		( /\swidth="([\d.]+)"/.exec( head ) || [] )[ 1 ] || 0
	);
	const h = parseFloat(
		( /\sheight="([\d.]+)"/.exec( head ) || [] )[ 1 ] || 0
	);
	return {
		inner: svg.replace( /^<svg[^>]*>/, '' ).replace( /<\/svg>\s*$/, '' ),
		w,
		h,
	};
}

const tOf = ( env ) => ( env && env.t ) || ( ( s ) => s );
const lineErrors = ( t, errors, warnings ) => {
	for ( const e of errors ) {
		warnings.push( t( 'Line' ) + ' ' + e.line + ': ' + e.message );
	}
};
const empty = ( warnings ) => ( { inner: '', w: 0, h: 0, warnings } );
const textOpts = ( ctx, width ) => {
	const ty = ctx.typo.text;
	return {
		width,
		size: ty.size * ctx.scale,
		font: ctx.style.textFont,
		color: ty.color || ctx.style.ink,
		weight: ty.weight,
		italic: ty.italic,
		align: ty.align,
	};
};

/* --------------------------------- formula -------------------------------- */

function renderFormula( block, ctx, env ) {
	const t = ctx.t;
	const warnings = [];
	const latex = String( block.latex || '' ).trim();
	if ( ! latex ) {
		return empty( [ t( 'Type a formula in LaTeX to begin.' ) ] );
	}
	if ( ! env.typeset ) {
		return empty( [ t( ENGINE_LOADING ) ] );
	}
	let flat;
	try {
		flat = env.typeset( latex, {
			size: block.formulaSize * ctx.scale,
			color: ctx.style.ink,
			display: true,
		} );
	} catch ( e ) {
		return empty( [
			( e && e.message ) || t( 'The formula could not be typeset.' ),
		] );
	}
	if ( flat.error ) {
		warnings.push( flat.error );
	}
	let inner = flat.inner;
	let w = flat.w;
	let h = flat.h;
	const { notes, errors } = parseNotes( block.notes );
	lineErrors( t, errors, warnings );
	if ( notes.length ) {
		const m = layoutMarks(
			{ inner, w, h, marks: flat.marks || {} },
			notes,
			{
				size: ctx.typo.text.size * ctx.scale * 0.9,
				font: ctx.style.textFont,
				ink: ctx.style.ink,
				accent: ctx.style.accent,
			},
			env
		);
		for ( const key of m.missing ) {
			warnings.push( t( 'No mark named' ) + ' ' + key );
		}
		inner = m.inner;
		w = m.w;
		h = m.h;
	}
	if ( block.box ) {
		const pad = block.formulaSize * ctx.scale * 0.5;
		inner = `<rect x="0" y="0" width="${ r( w + 2 * pad ) }" height="${ r(
			h + 2 * pad
		) }" rx="${ r( pad * 0.4 ) }" fill="none" stroke="${
			ctx.style.ink
		}" stroke-width="2"/><g transform="translate(${ r( pad ) } ${ r(
			pad
		) })">${ inner }</g>`;
		w += 2 * pad;
		h += 2 * pad;
	}
	if ( w > ctx.innerWidth ) {
		warnings.push(
			t(
				'The formula is wider than the picture. Lower the size or break the line with \\\\.'
			)
		);
	}
	return { inner, w: r( w ), h: r( h ), warnings };
}

/* ---------------------------------- graph --------------------------------- */

function renderGraph( block, ctx, env ) {
	const t = ctx.t;
	const warnings = [];
	const { items, errors } = parseFunctions( block.functions, {
		a: block.pa,
		b: block.pb,
		c: block.pc,
	} );
	lineErrors( t, errors, warnings );
	if ( ! items.length && ! errors.length ) {
		warnings.push(
			t( 'Type a function per line, for example f(x) = x^2 - 2.' )
		);
	}
	const typeset = env.typeset
		? ( latex, o ) => env.typeset( latex, { ...o, display: false } )
		: null;
	const res = renderPlot( items, {
		width: ctx.blockWidth,
		height: null,
		xmin: block.xmin,
		xmax: block.xmax,
		ymin: block.ymin,
		ymax: block.ymax,
		equal: block.equal,
		grid: block.grid,
		ticks: block.ticks,
		legend: block.legend,
		xLabel: block.xLabel,
		yLabel: block.yLabel,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		bg: ctx.style.bg || '#ffffff',
		font: ctx.style.textFont,
		fontSize: 18 * ctx.scale,
		params: { a: block.pa, b: block.pb, c: block.pc, k: 1 },
		typeset,
	} );
	for ( const w of res.warnings ) {
		warnings.push( t( 'No function named' ) + ' ' + w );
	}
	return { ...stripSvg( res.svg ), warnings };
}

/* -------------------------------- geometry -------------------------------- */

function renderGeometryBlock( block, ctx, env ) {
	const t = ctx.t;
	const warnings = [];
	const fig = parseGeometry( block.geometry );
	lineErrors( t, fig.errors, warnings );
	if ( ! fig.points.size && ! fig.errors.length ) {
		warnings.push(
			t(
				'Define points like A = (0, 0) and draw with segment, polygon, circle and angle.'
			)
		);
	}
	const res = renderGeometry( fig, {
		width: ctx.blockWidth,
		height: null,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		bg: ctx.style.bg || '#ffffff',
		font: ctx.style.textFont,
		fontSize: 20 * ctx.scale,
		typeset: env.typeset
			? ( latex, o ) => env.typeset( latex, { ...o, display: false } )
			: null,
	} );
	return { ...stripSvg( res.svg ), warnings };
}

/* ------------------------------- number line ------------------------------ */

function renderNumberLineBlock( block, ctx, env ) {
	const t = ctx.t;
	const warnings = [];
	const { spec, errors } = parseNumberLine( block.numberline );
	lineErrors( t, errors, warnings );
	const res = renderNumberLine( spec, {
		width: ctx.blockWidth,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		bg: ctx.style.bg || '#ffffff',
		font: ctx.style.textFont,
		fontSize: 22 * ctx.scale,
		typeset: env.typeset
			? ( latex, o ) => env.typeset( latex, { ...o, display: false } )
			: null,
	} );
	return { ...stripSvg( res.svg ), warnings };
}

/* -------------------------------- fractions ------------------------------- */

function renderFractionsBlock( block, ctx ) {
	const t = ctx.t;
	const warnings = [];
	const { fractions, errors } = parseFractions( block.fractions );
	for ( const e of errors ) {
		warnings.push( e.message );
	}
	if ( ! fractions.length && ! errors.length ) {
		warnings.push( t( 'Type fractions like 3/4, 1/2 or 1 3/4.' ) );
	}
	const res = renderFractions( fractions, {
		width: ctx.blockWidth,
		mode: block.fractionMode,
		ink: ctx.style.ink,
		accent: ctx.style.accent,
		bg: ctx.style.bg || '#ffffff',
		font: ctx.style.textFont,
		fontSize: 30 * ctx.scale,
		size: 220 * ctx.scale,
	} );
	return { ...stripSvg( res.svg ), warnings };
}

/* ----------------------------------- text --------------------------------- */

function renderText( block, ctx, env ) {
	const t = ctx.t;
	const text = String( block.text || '' );
	if ( ! text.trim() ) {
		return empty( [
			t(
				'Type a paragraph. A blank line starts a new one, - a bullet, $x^2$ math, **bold** and *italic*.'
			),
		] );
	}
	const warnings = [];
	if ( HAS_MATH.test( text ) && ! env.typeset ) {
		warnings.push( t( ENGINE_LOADING ) );
	}
	const res = layoutText( text, textOpts( ctx, ctx.blockWidth ), env );
	return { inner: res.inner, w: res.w, h: res.h, warnings };
}

/* ---------------------------------- steps --------------------------------- */

function renderSteps( block, ctx, env ) {
	const t = ctx.t;
	const { steps } = parseSteps( block.steps );
	if ( ! steps.length ) {
		return empty( [
			t(
				'One step per line: 2x + 3 = 7 | subtract 3. Start a line with <=> or => for an arrow.'
			),
		] );
	}
	const warnings = [];
	if ( ! env.typeset ) {
		warnings.push( t( ENGINE_LOADING ) );
	}
	const ty = ctx.typo.text;
	const res = layoutSteps(
		steps,
		{
			width: ctx.blockWidth,
			size: block.formulaSize * ctx.scale,
			textSize: ty.size * ctx.scale,
			font: ctx.style.textFont,
			ink: ctx.style.ink,
			muted: ctx.style.muted,
			numbered: block.numbered && ! ctx.figureNumbering,
			arrows: block.arrows,
			numberSize: ctx.typo.numbers.size * ctx.scale,
		},
		env
	);
	warnings.push( ...res.warnings );
	return { inner: res.inner, w: res.w, h: res.h, warnings };
}

/* ---------------------------------- table --------------------------------- */

function renderTable( block, ctx, env ) {
	const t = ctx.t;
	const table = parseTable( block.table );
	const warnings = [];
	lineErrors( t, table.errors, warnings );
	if ( ! table.rows.length ) {
		if ( ! table.errors.length ) {
			warnings.push(
				t(
					'Rows with cells split by |, a --- line under the head; or values f(x) = x^2; x = -3..3.'
				)
			);
		}
		return empty( warnings );
	}
	if ( HAS_MATH.test( block.table ) && ! env.typeset ) {
		warnings.push( t( ENGINE_LOADING ) );
	}
	const ty = ctx.typo.text;
	const res = layoutTable(
		table,
		{
			width: ctx.blockWidth,
			size: ty.size * ctx.scale,
			font: ctx.style.textFont,
			ink: ctx.style.ink,
			muted: ctx.style.muted,
			accent: ctx.style.accent,
			header: block.header,
			zebra: block.zebra,
			border: block.border,
		},
		env
	);
	if ( res.warnings.includes( 'wide' ) ) {
		warnings.push(
			t( 'The table is wider than the figure and was scaled down.' )
		);
	}
	return { inner: res.inner, w: res.w, h: res.h, warnings };
}

/* ----------------------------- primary school ----------------------------- */

const baseOpts = ( ctx ) => ( {
	width: ctx.blockWidth,
	size: ctx.typo.text.size * ctx.scale,
	font: ctx.style.textFont,
	ink: ctx.style.ink,
	accent: ctx.style.accent,
	muted: ctx.style.muted,
	bg: ctx.style.bg || '#ffffff',
	scale: ctx.scale,
	t: ctx.t,
} );

function primaryBlock( parse, render, key, hint, extra ) {
	return ( block, ctx ) => {
		const t = ctx.t;
		const warnings = [];
		const parsed = parse( block[ key ] );
		lineErrors( t, parsed.errors, warnings );
		const data = parsed.spec || parsed.clocks || parsed.numbers;
		const isEmpty = Array.isArray( data ) ? ! data.length : false;
		if ( isEmpty && ! parsed.errors.length ) {
			warnings.push( t( hint ) );
		}
		if ( isEmpty ) {
			return { inner: '', w: 0, h: 0, warnings };
		}
		const res = render( data, {
			...baseOpts( ctx ),
			...( extra ? extra( block ) : {} ),
		} );
		return {
			inner: res.inner,
			w: res.w,
			h: res.h,
			warnings: [ ...warnings, ...( res.warnings || [] ) ],
		};
	};
}

const renderClockBlock = primaryBlock(
	parseClock,
	renderClock,
	'clock',
	'One time per line, like 7:35 or 19:05:30 "Evening".',
	( b ) => ( {
		numbers: b.numbers,
		seconds: b.seconds,
		digital: b.digital,
		hands: b.hands,
	} )
);
const renderHundredBlock = primaryBlock(
	parseHundred,
	renderHundred,
	'hundred',
	'',
	( b ) => ( { numbers: b.numbers } )
);
const renderPlaceValueBlock = primaryBlock(
	parsePlaceValue,
	renderPlaceValue,
	'placevalue',
	'One number per line, like 4736 or 3.75.',
	( b ) => ( { blocks: b.blocks } )
);
const renderMultiplicationBlock = primaryBlock(
	parseMultiplication,
	renderMultiplication,
	'multiplication',
	''
);
const renderWallBlock = primaryBlock( parseWall, renderWall, 'wall', '', null );
const renderRulerBlock = primaryBlock(
	parseRuler,
	renderRuler,
	'ruler',
	'',
	null
);

const renderStatsBlock = primaryBlock(
	parseStats,
	renderStats,
	'stats',
	'Type data 3, 5, 5, 7, 8, 12 or words for categories.',
	( b ) => ( {
		chart: b.chart,
		bins: b.bins,
		mean: b.mean,
		median: b.median,
		counts: b.counts,
	} )
);
const renderUnitCircleBlock = primaryBlock(
	parseUnitCircle,
	renderUnitCircle,
	'unitcircle',
	'One angle per line, like angle 30 or angle pi/6.',
	( b ) => ( {
		sincos: b.sincos,
		tangent: b.tangent,
		special: b.special,
		units: b.units,
	} )
);
const renderSetsBlock = primaryBlock(
	parseSets,
	renderSets,
	'sets',
	'Define sets like A = {1, 2, 3} and B = {3, 4}, then shade A ∩ B.',
	( b ) => ( { elements: b.elements } )
);
const renderTreeBlock = primaryBlock(
	parseTree,
	renderTree,
	'tree',
	'One branch per line, two spaces deeper for the next stage: R 0.3.',
	( b ) => ( { paths: b.paths, format: b.format, direction: b.direction } )
);
const renderSolidsBlock = primaryBlock(
	parseSolids,
	renderSolids,
	'solids',
	'One solid per line, like cube 4 or cylinder 2 5.',
	( b ) => ( { hidden: b.hidden, dims: b.dims, net: b.net } )
);

/* --------------------------------- registry ------------------------------- */

export const BLOCKS = {
	formula: {
		label: 'Formula',
		hint: 'LaTeX in, a typeset formula out; \\mark{a}{...} and a note label a part.',
		group: 'explain',
		note: 'LaTeX, for example \\frac{a}{b}, \\sqrt{x}, x^{2}, \\int_0^1. New line with \\\\. Tag a part with \\mark{a}{...} and label it below: a "Discriminant" below.',
		placeholder: 'x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}',
		needsEngine: () => true,
		render: renderFormula,
	},
	text: {
		label: 'Text',
		hint: 'Paragraphs and bullets with inline math, bold and italic.',
		group: 'explain',
		note: 'A blank line starts a new paragraph, - a bullet, $x^2$ sets math in the line, **bold** and *italic*.',
		placeholder:
			'The roots of a quadratic $ax^2 + bx + c = 0$ follow from the discriminant.',
		needsEngine: ( b ) => HAS_MATH.test( b.text || '' ),
		render: renderText,
	},
	steps: {
		label: 'Worked solution',
		hint: 'Steps aligned at the equals sign, with an explanation next to each.',
		group: 'explain',
		note: 'One step per line: 2x + 3 = 7 | subtract 3. Lines starting with <=> or => get an arrow.',
		placeholder:
			'2x + 3 = 7 | subtract 3\n<=> 2x = 4 | divide by 2\n<=> x = 2',
		needsEngine: ( b ) => !! String( b.steps || '' ).trim(),
		render: renderSteps,
	},
	table: {
		label: 'Table',
		hint: 'Rows and columns, or a value table computed from a function.',
		group: 'explain',
		note: 'Cells split by |, a --- line under the head. values f(x) = x^2; x = -3..3 step 1 computes a value table.',
		placeholder: 'x | 0 | 1 | 2\n---\nf(x) | 1 | 2 | 4',
		needsEngine: ( b ) => HAS_MATH.test( b.table || '' ),
		render: renderTable,
	},
	graph: {
		label: 'Function Graph',
		hint: 'Functions on a coordinate system, with grid, ticks and legend.',
		group: 'graphs',
		note: 'One function per line: f(x) = x^2, y = sin(x), param: cos(t), sin(t), polar: 1 + cos(t), point (1, 2) "P", area f 0..2.',
		placeholder: 'f(x) = x^2 - 2\ng(x) = sin(x)',
		needsEngine: ( b ) => !! b.legend || HAS_MATH.test( b.functions || '' ),
		render: renderGraph,
	},
	geometry: {
		label: 'Geometry',
		hint: 'Points, segments, polygons, circles and angles from commands.',
		group: 'graphs',
		note: 'Commands: A = (0, 0), segment A B "c", polygon A B C, circle A 2, angle A B C, vector A B, midpoint M A B, grid on, axes on.',
		placeholder:
			'A = (0, 0)\nB = (4, 0)\nC = (0, 3)\npolygon A B C\nangle B A C',
		needsEngine: ( b ) => HAS_MATH.test( b.geometry || '' ),
		render: renderGeometryBlock,
	},
	numberline: {
		label: 'Number Line',
		hint: 'A number line with marks, intervals and jumps.',
		group: 'numbers',
		note: 'Commands: range -2 8, step 1, minor 2, point 3 "x", point 2/3, interval [2, 5), jump 3 -> 7 "+4", labels above.',
		placeholder: 'range 0 10\nstep 1\npoint 3 "a"',
		needsEngine: ( b ) => HAS_MATH.test( b.numberline || '' ),
		render: renderNumberLineBlock,
	},
	fractions: {
		label: 'Fractions',
		hint: 'Fractions as circles, bars, grids or sets.',
		group: 'numbers',
		note: 'Fractions separated by commas: 3/4, 1/2, 1 3/4.',
		placeholder: '3/4, 1/2',
		needsEngine: () => false,
		render: renderFractionsBlock,
	},
	clock: {
		label: 'Clock',
		hint: 'Clock faces for reading and setting the time.',
		group: 'primary',
		note: 'One time per line: 7:35, 19:05:30, 7:35 "Morning". Numbers, hands, seconds and a digital readout are options.',
		placeholder: '7:35\n12:00 "Noon"',
		needsEngine: () => false,
		render: renderClockBlock,
	},
	hundred: {
		label: 'Hundred square',
		hint: 'The hundred square, the twenty field and dot fields.',
		group: 'primary',
		note: 'Commands: field 100 | 20 | 10, mark 7 14 21 #color, hide 5 6, dots 13 (dots instead of numbers, in fives).',
		placeholder: 'field 100\nmark 7 14 21 28',
		needsEngine: () => false,
		render: renderHundredBlock,
	},
	placevalue: {
		label: 'Place value',
		hint: 'A place value chart, with base-ten blocks if you like.',
		group: 'primary',
		note: 'One number per line: 4736, 205, 3.75. The columns follow the widest number.',
		placeholder: '4736\n205',
		needsEngine: () => false,
		render: renderPlaceValueBlock,
	},
	multiplication: {
		label: 'Multiplication',
		hint: 'The multiplication table or single rows of facts, with gaps.',
		group: 'primary',
		note: 'Commands: table 1..10, row 7, rows 6 7 8, hide 3x4 5x6 (table cells), hide 3 5 (facts), hide all.',
		placeholder: 'table 1..10',
		needsEngine: () => false,
		render: renderMultiplicationBlock,
	},
	wall: {
		label: 'Number wall',
		hint: 'Number walls and number triangles with gaps to fill in.',
		group: 'primary',
		note: 'Commands: wall 3 5 2 4 (base row, ? for a gap), hide 2.1 (row from the bottom . position), triangle 3 5 2, hide inner | outer | a b ab.',
		placeholder: 'wall 3 5 2 4',
		needsEngine: () => false,
		render: renderWallBlock,
	},
	ruler: {
		label: 'Ruler',
		hint: 'A ruler with measured spans and points.',
		group: 'primary',
		note: 'Commands: ruler 0..12 cm (also mm, in), mark 2.5..7 "4,5 cm", mark 3 "P".',
		placeholder: 'ruler 0..12 cm\nmark 2.5..7 "4,5 cm"',
		needsEngine: () => false,
		render: renderRulerBlock,
	},
	stats: {
		label: 'Statistics',
		hint: 'Dot plot, bar chart, histogram or box plot of a data set.',
		group: 'secondary',
		note: 'data 3, 5, 5, 7, 8, 12 (or words for categories), label "Points". The chart type, bins, mean and median are options.',
		placeholder: 'data 3, 5, 5, 7, 8, 12\nlabel "Points"',
		needsEngine: () => false,
		render: renderStatsBlock,
	},
	unitcircle: {
		label: 'Unit circle',
		hint: 'Angles on the unit circle with sine, cosine and tangent.',
		group: 'secondary',
		note: 'One angle per line: angle 30, angle 30°, angle pi/6, angle 210 "label". Exact values at the special angles.',
		placeholder: 'angle 30\nangle 135',
		needsEngine: () => false,
		render: renderUnitCircleBlock,
	},
	sets: {
		label: 'Sets',
		hint: 'Venn diagrams of two or three sets with shaded regions.',
		group: 'secondary',
		note: "A = {1, 2, 3}, B = {3, 4, 5}, U = {1..10}, shade A ∩ B (also A & B, A ∪ B, A \\ B, A', not A).",
		placeholder:
			'A = {1, 2, 3, 4}\nB = {3, 4, 5, 6}\nU = {1..8}\nshade A ∩ B',
		needsEngine: () => false,
		render: renderSetsBlock,
	},
	tree: {
		label: 'Probability tree',
		hint: 'A tree diagram with probabilities on the branches and along the paths.',
		group: 'secondary',
		note: 'One branch per line, two spaces deeper for the next stage: R 0.3, then R 0.5 and B 0.5. Decimals, percent or fractions.',
		placeholder: 'R 0.3\n  R 0.5\n  B 0.5\nB 0.7\n  R 0.4\n  B 0.6',
		needsEngine: () => false,
		render: renderTreeBlock,
	},
	solids: {
		label: 'Solids',
		hint: 'Cube, cuboid, cylinder, cone, sphere, pyramid and prism in cabinet projection.',
		group: 'secondary',
		note: 'One solid per line: cube 4, cuboid 5 3 2, cylinder 2 5, cone 2 5, sphere 3, pyramid 4 4 5, prism 4 3 6, optionally "label".',
		placeholder: 'cuboid 5 3 2\ncylinder 2 5',
		needsEngine: () => false,
		render: renderSolidsBlock,
	},
};

/** The user text of a block in one line, for the block list. */
export function blockSnippet( block ) {
	const keys = {
		formula: 'latex',
		text: 'text',
		steps: 'steps',
		table: 'table',
		graph: 'functions',
		geometry: 'geometry',
		numberline: 'numberline',
		fractions: 'fractions',
		clock: 'clock',
		hundred: 'hundred',
		placevalue: 'placevalue',
		multiplication: 'multiplication',
		wall: 'wall',
		ruler: 'ruler',
		stats: 'stats',
		unitcircle: 'unitcircle',
		sets: 'sets',
		tree: 'tree',
		solids: 'solids',
	};
	return String( block[ keys[ block.type ] ] || '' )
		.split( '\n' )
		.map( ( s ) => s.trim() )
		.filter( Boolean )
		.join( ' · ' );
}

/* ---------------------------------- figure -------------------------------- */

export async function renderFigure( params, env ) {
	const t = tOf( env );
	const fig = params.figure;
	const frame = frameFor( fig, env.docW, env.docH );
	const style = styleFor( fig, env.kits );
	const margin = fig.margin;
	const innerWidth = frame.width - 2 * margin;
	const scale = fig.scale || 1;
	const typo = params.typo;
	const warnings = [];
	const children = [];
	let y = margin;
	let lastGap = 0;

	const putText = ( str, el, font ) => {
		if ( ! str || ! String( str ).trim() ) {
			return;
		}
		const ty = typo[ el ];
		const res = layoutText(
			str,
			{
				width: innerWidth,
				size: ty.size * scale,
				font,
				color: ty.color || style.ink,
				weight: ty.weight,
				italic: ty.italic,
				align: ty.align,
			},
			env
		);
		children.push(
			`<g transform="translate(${ r( margin ) } ${ r( y ) })">${
				res.inner
			}</g>`
		);
		lastGap = ty.gap * scale;
		y += res.h + lastGap;
	};
	putText( params.head.title, 'title', style.titleFont );
	putText( params.head.subtitle, 'subtitle', style.titleFont );

	let number = 0;
	let engineWarned = false;
	for ( const block of params.blocks ) {
		const def = BLOCKS[ block.type ];
		if ( ! def ) {
			continue;
		}
		const blockWidth = WIDE.has( block.type )
			? Math.round( ( innerWidth * ( block.width || 100 ) ) / 100 )
			: innerWidth;
		const ctx = {
			innerWidth,
			blockWidth,
			style,
			typo,
			scale,
			t,
			figureNumbering: !! params.numbering,
		};
		let res;
		try {
			res = def.render( block, ctx, env );
		} catch ( e ) {
			res = empty( [ ( e && e.message ) || String( e ) ] );
		}
		for ( const w of res.warnings || [] ) {
			if ( w === t( ENGINE_LOADING ) ) {
				if ( engineWarned ) {
					continue;
				}
				engineWarned = true;
			}
			warnings.push( w );
		}
		if ( res.inner ) {
			const free = innerWidth - res.w;
			const x =
				margin +
				( 'left' === block.align
					? 0
					: 'right' === block.align
					? free
					: free / 2 );
			children.push(
				`<g transform="translate(${ r( Math.max( margin, x ) ) } ${ r(
					y
				) })">${ res.inner }</g>`
			);
			if (
				params.numbering &&
				( 'formula' === block.type || 'steps' === block.type )
			) {
				number++;
				const ns = typo.numbers.size * scale;
				children.push(
					textEl(
						margin + innerWidth,
						y + res.h / 2 + ns * 0.35,
						'(' + number + ')',
						{
							size: ns,
							font: style.textFont,
							fill: typo.numbers.color || style.muted,
							anchor: 'end',
						}
					)
				);
			}
			lastGap = ( undefined === block.gap ? 24 : block.gap ) * scale;
			y += res.h + lastGap;
		}
	}
	putText( params.foot.caption, 'caption', style.textFont );
	putText( params.foot.note, 'note', style.textFont );

	let height = Math.ceil( y - lastGap + margin );
	if ( frame.height ) {
		if ( height > frame.height ) {
			warnings.push(
				t(
					'The content is taller than the page. Lower the size or the margin.'
				)
			);
		}
		height = frame.height;
	}
	const width = frame.width;
	const pattern = style.pattern
		? paperPattern( style.pattern, width, height, style.ink, scale )
		: '';
	return {
		svg: svgDoc( {
			width,
			height,
			bg: style.bg,
			children: [ pattern, ...children ],
		} ),
		width,
		height,
		warnings,
	};
}
