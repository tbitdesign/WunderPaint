/**
 * Table engine: data tables, comparison/feature matrices and pricing
 * tables built as a group of fully editable rect/text/path layers - the
 * same output contract as the chart engine (buildChart), so the Chart &
 * Table dialog inserts and re-edits them through one path.
 *
 * A table is styled by a bundle of visual axes (header treatment, row
 * style, container, corner radius, density, mark style, gradient, badge,
 * text scale). TABLE_STYLES ships 12 named presets and randomTableStyle
 * samples fresh designs from the same axes with a seed.
 */

import { __ } from '@wordpress/i18n';

import { makeShape, makeText, makeGroup } from '../store/document';
import { tightenPathLayer } from './path-edit';
import { fmtCell } from './grid-model';

export const TABLE_TYPES = [
	'tableData',
	'tableComparison',
	'tablePricing',
	'tableRanking',
	'tableSchedule',
	'tableChecklist',
	'tableMenu',
	'tableSpec',
	'tableScorecard',
	'tableCalendar',
	'tableStandings',
];

/* ------------------------------- colors ---------------------------------- */

const hexRgb = ( hex ) => {
	const h = String( hex || '' ).replace( '#', '' );
	return [ 0, 2, 4 ].map( ( i ) =>
		parseInt( h.slice( i, i + 2 ) || '0', 16 )
	);
};
const rgbHex = ( r, g, b ) =>
	'#' +
	[ r, g, b ]
		.map( ( v ) =>
			Math.max( 0, Math.min( 255, Math.round( v ) ) )
				.toString( 16 )
				.padStart( 2, '0' )
		)
		.join( '' );
const mix = ( a, b, t ) => {
	const A = hexRgb( a );
	const B = hexRgb( b );
	return rgbHex(
		A[ 0 ] + ( B[ 0 ] - A[ 0 ] ) * t,
		A[ 1 ] + ( B[ 1 ] - A[ 1 ] ) * t,
		A[ 2 ] + ( B[ 2 ] - A[ 2 ] ) * t
	);
};
const luma = ( hex ) => {
	const [ r, g, b ] = hexRgb( hex );
	return ( 0.299 * r + 0.587 * g + 0.114 * b ) / 255;
};
/** Readable text color on a given background. */
export const onColor = ( bg ) => ( luma( bg ) > 0.6 ? '#1a1d21' : '#ffffff' );

/** Rotate a color's hue (degrees), keeping its saturation and lightness. */
export function hueShift( hex, deg ) {
	const [ r, g, b ] = hexRgb( hex ).map( ( v ) => v / 255 );
	const max = Math.max( r, g, b );
	const min = Math.min( r, g, b );
	const l = ( max + min ) / 2;
	let h = 0;
	let s = 0;
	if ( max !== min ) {
		const d = max - min;
		s = l > 0.5 ? d / ( 2 - max - min ) : d / ( max + min );
		if ( max === r ) {
			h = ( g - b ) / d + ( g < b ? 6 : 0 );
		} else if ( max === g ) {
			h = ( b - r ) / d + 2;
		} else {
			h = ( r - g ) / d + 4;
		}
		h /= 6;
	}
	h = ( h + deg / 360 + 1 ) % 1;
	const hue2 = ( p, q, t ) => {
		if ( t < 0 ) {
			t += 1;
		}
		if ( t > 1 ) {
			t -= 1;
		}
		if ( t < 1 / 6 ) {
			return p + ( q - p ) * 6 * t;
		}
		if ( t < 1 / 2 ) {
			return q;
		}
		if ( t < 2 / 3 ) {
			return p + ( q - p ) * ( 2 / 3 - t ) * 6;
		}
		return p;
	};
	if ( 0 === s ) {
		return rgbHex( l * 255, l * 255, l * 255 );
	}
	const q = l < 0.5 ? l * ( 1 + s ) : l + s - l * s;
	const p = 2 * l - q;
	return rgbHex(
		hue2( p, q, h + 1 / 3 ) * 255,
		hue2( p, q, h ) * 255,
		hue2( p, q, h - 1 / 3 ) * 255
	);
}

/* ----------------------------- cell parsing ------------------------------ */

const YES = /^(yes|y|true|ja|1|✓|✔|✅)$/i;
const NO = /^(no|n|false|nein|0|x|[-–—✗✘✕])$/i;

/** Cell value classification for comparison tables. */
export function cellMark( value ) {
	const s = String( value ?? '' ).trim();
	if ( '' === s ) {
		return 'no'; // an empty cell reads as "not included"
	}
	if ( YES.test( s ) ) {
		return 'yes';
	}
	if ( NO.test( s ) ) {
		return 'no';
	}
	return 'text';
}

const isNum = ( s ) => {
	const v = String( s ?? '' )
		.replace( ',', '.' )
		.trim();
	return v !== '' && ! Number.isNaN( Number( v ) );
};

/** Default alignment of a data column (numeric → right, label col → left). */
export function columnAlign( rows, ci ) {
	if ( 0 === ci ) {
		return 'left';
	}
	const vals = rows
		.map( ( r ) => r[ ci ] )
		.filter( ( v ) => null !== v && undefined !== v && '' !== v );
	const numeric =
		vals.length && vals.filter( isNum ).length >= vals.length * 0.6;
	return numeric ? 'right' : 'left';
}

/* -------------------------------- styles --------------------------------- */

const STYLE_DEFAULTS = {
	preset: 'classic',
	header: 'solid', // solid | gradient | underline | none
	rows: 'zebra', // zebra | lines | plain | cards
	container: 'outline', // none | outline | soft | dark
	radius: 6, // corner radius in px
	density: 'normal', // compact | normal | roomy
	mark: 'check', // check | badge | dot
	marksMode: 'both', // both | checkOnly
	gradient: false, // gradient header / featured card
	gradientAngle: 90,
	badge: true, // "Popular" badge on the featured pricing tier
	headerWeight: 700,
	textScale: 1,
	highlightCol: -1,
	title: '',
	subtitle: '',
	// v2 geometry knobs (v1.270).
	wrap: true, // wrap long cells onto multiple lines
	maxLines: 4, // per-cell line cap, last line ellipsized
	rowScale: 1, // row height factor
	cellPad: 1, // cell padding factor
	outerPad: 1, // container padding factor
	headerScale: 1, // header height factor
};

// Six deliberately distinct designs: airy, solid-striped, gradient,
// dark, row-cards, heavy-bold.
export const TABLE_STYLES = [
	{
		id: 'minimal',
		label: 'Minimal',
		header: 'underline',
		rows: 'lines',
		container: 'none',
		radius: 0,
		density: 'roomy',
		mark: 'check',
	},
	{
		id: 'classic',
		label: 'Classic',
		header: 'solid',
		rows: 'zebra',
		container: 'outline',
		radius: 8,
		mark: 'check',
	},
	{
		id: 'gradient',
		label: 'Gradient',
		header: 'gradient',
		rows: 'zebra',
		container: 'soft',
		radius: 16,
		mark: 'check',
		gradient: true,
	},
	{
		id: 'dark',
		label: 'Dark',
		header: 'solid',
		rows: 'plain',
		container: 'dark',
		radius: 14,
		mark: 'badge',
		gradient: true,
	},
	{
		id: 'cards',
		label: 'Card rows',
		header: 'none',
		rows: 'cards',
		container: 'none',
		radius: 14,
		density: 'roomy',
		mark: 'dot',
	},
	{
		id: 'bold',
		label: 'Bold',
		header: 'solid',
		rows: 'plain',
		container: 'outline',
		radius: 4,
		mark: 'badge',
		headerWeight: 800,
	},
];

/** Full option set for a named preset id (merged over the defaults). */
export function styleOptions( id ) {
	const preset =
		TABLE_STYLES.find( ( s ) => s.id === id ) || TABLE_STYLES[ 0 ];
	return { ...STYLE_DEFAULTS, ...preset, preset: preset.id };
}

/* ------------------------------ randomizer ------------------------------- */

const makeRng = ( seed ) => {
	let s = ( Math.abs( Math.round( seed ) ) || 1 ) & 0x7fffffff;
	return () => {
		s = ( s * 1103515245 + 12345 ) & 0x7fffffff;
		return s / 0x7fffffff;
	};
};
const pick = ( rnd, arr ) => arr[ Math.floor( rnd() * arr.length ) ];

/**
 * Sample a fresh table design from the style axes. The user's accent is
 * kept; a harmonized second color is derived for gradients.
 *
 * @param {number} seed   Reproducible seed.
 * @param {string} accent Primary color (kept).
 * @return {Object} Style option fields plus { colors: [accent, accent2] }.
 */
export function randomTableStyle( seed, accent = '#3b66ff' ) {
	const rnd = makeRng( seed );
	const header = pick( rnd, [ 'solid', 'gradient', 'underline', 'none' ] );
	let rows = pick( rnd, [ 'zebra', 'lines', 'plain', 'cards' ] );
	let container = pick( rnd, [ 'none', 'outline', 'soft', 'dark' ] );
	// Avoid an all-invisible combo.
	if ( 'none' === header && 'plain' === rows && 'none' === container ) {
		rows = 'lines';
	}
	// Dark cards want a filled header for contrast.
	if ( 'dark' === container && 'underline' === header ) {
		container = 'soft';
	}
	const gradient = 'gradient' === header || rnd() < 0.35;
	const accent2 = hueShift( accent, pick( rnd, [ -28, -14, 18, 32 ] ) );
	return {
		preset: 'custom',
		header,
		rows,
		container,
		radius: pick( rnd, [ 0, 6, 12, 18, 24 ] ),
		density: pick( rnd, [ 'compact', 'normal', 'roomy' ] ),
		mark: pick( rnd, [ 'check', 'badge', 'dot' ] ),
		gradient,
		gradientAngle: pick( rnd, [ 90, 90, 60, 120, 45 ] ),
		badge: rnd() < 0.6,
		headerWeight: pick( rnd, [ 700, 800 ] ),
		colors: [ accent, accent2 ],
	};
}

/* ------------------------------- builder --------------------------------- */

const DENSITY = { compact: 0.5, normal: 0.75, roomy: 1.05 };

/**
 * Word-wrap a cell onto at most maxLines lines of ~charsPerLine chars;
 * the last line gets an ellipsis when content is cut (v1.270). Pure and
 * deterministic - the same estimate the column weights use, no canvas.
 *
 * @param {string} text         Cell text.
 * @param {number} charsPerLine Character budget per line.
 * @param {number} maxLines     Line cap.
 * @return {Array} Lines.
 */
export function wrapCellLines( text, charsPerLine, maxLines ) {
	const words = String( text ?? '' )
		.split( /\s+/ )
		.filter( Boolean );
	if ( ! words.length ) {
		return [ '' ];
	}
	const lines = [];
	let cur = '';
	let truncated = false;
	for ( const word of words ) {
		const next = cur ? cur + ' ' + word : word;
		if ( next.length <= charsPerLine || ! cur ) {
			cur = next;
			continue;
		}
		if ( lines.length === maxLines - 1 ) {
			truncated = true;
			break;
		}
		lines.push( cur );
		cur = word;
	}
	lines.push( cur );
	if ( truncated ) {
		lines[ lines.length - 1 ] += '…';
	}
	return lines;
}

/**
 * Shared grid geometry (v1.270): column positions (content weights with
 * per-column percent overrides), wrapped cell lines and the resulting
 * IDEAL row heights. buildGrid scales these into its box; the natural
 * height helper sums them - one source, no drift.
 *
 * @param {Object}  env            Grid environment.
 * @param {Array}   env.headers    Header strings.
 * @param {Array}   env.rows       Body rows (string cells).
 * @param {Array}   env.cols       Per-column meta ({width} percent).
 * @param {boolean} env.comparison Comparison-table mode.
 * @param {number}  env.bw         Content box width.
 * @param {number}  env.fs         Font size.
 * @param {Object}  env.o          Resolved style options.
 * @return {Object} { pad, colOff[], colW[], lines[][][], rowLines[],
 *                    headerH, rowHeights[], bodyIdeal }.
 */
function gridMetricsFor( { headers, rows, cols, comparison, bw, fs, o } ) {
	const pad = fs * ( 0.5 + DENSITY[ o.density ] * 0.5 ) * ( o.cellPad ?? 1 );
	const colMax = headers.map( ( hd, ci ) =>
		Math.max(
			String( hd ).length,
			...rows.map( ( r ) => String( r[ ci ] ?? '' ).length )
		)
	);
	if ( comparison ) {
		colMax[ 0 ] = Math.max( colMax[ 0 ], 12 );
	}
	const weights = colMax.map( ( l ) => Math.min( 24, Math.max( 4, l ) ) );
	// Percent overrides: explicit columns are fixed, auto columns share
	// the remaining percent proportionally to their content weight.
	const pct = headers.map( ( _, ci ) => {
		const v = ( cols || [] )[ ci ]?.width;
		return Number.isFinite( v ) ? Math.min( 80, Math.max( 5, v ) ) : null;
	} );
	const sumExplicit = pct.reduce( ( a, b ) => a + ( b || 0 ), 0 );
	const autoWeight = weights.reduce(
		( a, wgt, ci ) => a + ( null === pct[ ci ] ? wgt : 0 ),
		0
	);
	const remaining = Math.max( 5, 100 - sumExplicit );
	const frac = headers.map( ( _, ci ) =>
		null !== pct[ ci ]
			? pct[ ci ] / 100
			: ( remaining / 100 ) * ( weights[ ci ] / ( autoWeight || 1 ) )
	);
	const fSum = frac.reduce( ( a, b ) => a + b, 0 ) || 1;
	const colOff = [];
	const colW = [];
	let cxo = 0;
	for ( const f of frac ) {
		colOff.push( cxo );
		colW.push( ( bw * f ) / fSum );
		cxo += ( bw * f ) / fSum;
	}
	// Wrapped lines per cell (marks in comparison columns never wrap).
	const wrapOn = false !== o.wrap;
	const maxLines = Math.max( 1, o.maxLines ?? 4 );
	const lines = rows.map( ( row ) =>
		headers.map( ( _, ci ) => {
			const val = String( row[ ci ] ?? '' );
			const isMark = comparison && ci > 0 && 'text' !== cellMark( val );
			if ( ! wrapOn || isMark ) {
				return [ val ];
			}
			const budget = Math.max(
				3,
				Math.floor( ( colW[ ci ] - 2 * pad ) / ( fs * 0.55 ) )
			);
			return wrapCellLines( val, budget, maxLines );
		} )
	);
	const rowLines = lines.map( ( cells ) =>
		Math.max( 1, ...cells.map( ( ls ) => ls.length ) )
	);
	const rowUnit = fs * ( 1.9 + DENSITY[ o.density ] * 0.9 );
	const headFrac = 1.1 + DENSITY[ o.density ] * 0.4;
	const headerH = rowUnit * headFrac * ( o.headerScale ?? 1 );
	const rowHeights = rowLines.map(
		( n ) => ( rowUnit + ( n - 1 ) * fs * 1.25 ) * ( o.rowScale ?? 1 )
	);
	const bodyIdeal = headerH + rowHeights.reduce( ( a, b ) => a + b, 0 );
	return {
		pad,
		colOff,
		colW,
		lines,
		rowLines,
		headerH,
		rowHeights,
		bodyIdeal,
	};
}

/**
 * Build table layers.
 *
 * @param {Object} spec { type, headers[], rows[][], tiers[], colors[],
 *                        x, y, w, h, options{} }.
 * @return {{group: Object, layers: Array}} Group + member layers.
 */
export function buildTable( spec ) {
	const type = TABLE_TYPES.includes( spec.type ) ? spec.type : 'tableData';
	const { x, y, w, h } = spec;
	const o = { ...STYLE_DEFAULTS, ...( spec.options || {} ) };
	// Back-compat: v1.151.0 groups stored zebra/borders instead of a style.
	if ( undefined === spec.options?.rows && spec.options ) {
		if ( undefined !== spec.options.zebra ) {
			o.rows = spec.options.zebra ? 'zebra' : 'lines';
		}
		if ( undefined !== spec.options.borders ) {
			o.container = spec.options.borders ? 'outline' : 'none';
		}
	}
	const accent = spec.colors?.[ 0 ] || '#3b66ff';
	const accent2 = spec.colors?.[ 1 ] || hueShift( accent, 22 );
	const dark = 'dark' === o.container;
	const ink = dark ? '#f2f5f8' : '#2c3338';
	const sub = dark ? '#aeb6c0' : '#8a8f98';
	const line = dark ? mix( '#191c22', '#ffffff', 0.16 ) : '#d9dee4';
	const softFill = dark
		? mix( '#191c22', '#ffffff', 0.06 )
		: mix( line, '#ffffff', 0.5 );
	const ts = o.textScale || 1;
	// Width-based so a wide, short table keeps readable text and the
	// natural-height helper can reproduce the exact metrics.
	const fs = Math.max(
		9,
		Math.round( w * ( 'tablePricing' === type ? 0.026 : 0.024 ) * ts )
	);
	const rad = Math.max( 0, o.radius || 0 );

	const group = makeGroup( { name: `Table (${ type })`, x, y, w, h } );
	const layers = [];
	const push = ( layer ) => {
		if ( layer.pathD ) {
			layer = tightenPathLayer(
				layer,
				layer.strokeW ? Math.ceil( layer.strokeW / 2 ) : 0
			);
		}
		layer.parent = group.id;
		layers.push( layer );
		return layer;
	};
	const rect = ( name, rx, ry, rw, rh, opts = {} ) =>
		push(
			makeShape( {
				name,
				shape: 'rect',
				x: Math.round( rx ),
				y: Math.round( ry ),
				w: Math.round( rw ),
				h: Math.round( rh ),
				fill: opts.fill ?? 'transparent',
				stroke: opts.stroke ?? null,
				strokeW: opts.strokeW || 0,
				radius: opts.radius || 0,
				...( opts.fillType ? { fillType: opts.fillType } : {} ),
				...( opts.gradientStops
					? {
							gradientStops: opts.gradientStops,
							gradientAngle: opts.gradientAngle ?? 90,
					  }
					: {} ),
			} )
		);
	const gradHeader = () => ( {
		fill: accent,
		fillType: 'gradient',
		gradientStops: [
			{ at: 0, color: accent },
			{ at: 1, color: accent2 },
		],
		gradientAngle: o.gradientAngle ?? 90,
	} );
	const cellText = ( name, text, cx, cyMid, cw, align, color, weight ) => {
		const str = String( text ?? '' );
		// Pre-wrapped multi-line cells (v1.270) size to their lines.
		const n = str ? str.split( '\n' ).length : 1;
		const hh = n > 1 ? fs * n * 1.3 : fs * 1.4;
		return push(
			makeText( {
				name,
				text: str,
				x: Math.round( cx ),
				y: Math.round( cyMid - hh / 2 ),
				w: Math.round( cw ),
				h: Math.round( hh ),
				fontSize: fs,
				align,
				color,
				weight: weight || 400,
				...( n > 1 ? { lineHeight: 1.25 } : {} ),
			} )
		);
	};
	const strokePath = ( name, d, color, sw, bx, by ) =>
		push(
			makeShape( {
				name,
				x: 0,
				y: 0,
				w: Math.round( bx ),
				h: Math.round( by ),
				pathD: d,
				fill: 'transparent',
				stroke: color,
				strokeW: sw,
			} )
		);
	// A yes/no marker in the chosen mark style, centered on (cx, cy).
	const markShape = ( name, cx, cy, kind ) => {
		const yes = 'yes' === kind;
		const s = fs * 0.6;
		const yesC = accent;
		const noC = dark ? sub : mix( sub, '#ffffff', 0.15 );
		if ( 'checkOnly' === o.marksMode && ! yes ) {
			return;
		}
		if ( 'badge' === o.mark ) {
			const r = s * 0.95;
			if ( yes ) {
				rect( name, cx - r, cy - r, 2 * r, 2 * r, {
					fill: yesC,
					radius: r,
				} );
				strokePath(
					`${ name } ✓`,
					`M ${ cx - r * 0.45 } ${ cy + r * 0.05 } L ${
						cx - r * 0.1
					} ${ cy + r * 0.4 } L ${ cx + r * 0.5 } ${ cy - r * 0.42 }`,
					'#ffffff',
					Math.max( 2, Math.round( fs * 0.16 ) ),
					cx + r,
					cy + r
				);
			} else {
				rect( name, cx - r, cy - r, 2 * r, 2 * r, {
					stroke: noC,
					strokeW: Math.max( 1, Math.round( fs * 0.1 ) ),
					radius: r,
				} );
			}
			return;
		}
		if ( 'dot' === o.mark ) {
			const r = s * 0.5;
			if ( yes ) {
				rect( name, cx - r, cy - r, 2 * r, 2 * r, {
					fill: yesC,
					radius: r,
				} );
			} else {
				rect( name, cx - r, cy - r, 2 * r, 2 * r, {
					stroke: noC,
					strokeW: Math.max( 1, Math.round( fs * 0.12 ) ),
					radius: r,
				} );
			}
			return;
		}
		// Default: stroked check / cross.
		const sw = Math.max( 2, Math.round( fs * 0.16 ) );
		if ( yes ) {
			strokePath(
				name,
				`M ${ cx - s * 0.55 } ${ cy + s * 0.05 } L ${ cx - s * 0.15 } ${
					cy + s * 0.45
				} L ${ cx + s * 0.6 } ${ cy - s * 0.5 }`,
				yesC,
				sw,
				cx + s,
				cy + s
			);
		} else {
			strokePath(
				name,
				`M ${ cx - s * 0.45 } ${ cy - s * 0.45 } L ${ cx + s * 0.45 } ${
					cy + s * 0.45
				} M ${ cx + s * 0.45 } ${ cy - s * 0.45 } L ${
					cx - s * 0.45
				} ${ cy + s * 0.45 }`,
				noC,
				sw,
				cx + s,
				cy + s
			);
		}
	};
	// A rounded "badge" pill with centered label.
	const badgePill = ( name, bx, by, label ) => {
		const bw = fs * ( 1.4 + label.length * 0.5 );
		const bh = fs * 1.5;
		rect( name, bx - bw / 2, by, bw, bh, { fill: accent, radius: bh / 2 } );
		cellText(
			`${ name } label`,
			label,
			bx - bw / 2,
			by + bh / 2,
			bw,
			'center',
			onColor( accent ),
			700
		);
		return bh;
	};

	// Nothing to draw (empty data) → an empty group, no container chrome.
	const hasContent =
		'tablePricing' === type
			? ( spec.tiers || [] ).some( ( t ) => t && t.name )
			: ( spec.headers || [] ).length > 0 &&
			  ( spec.rows || [] ).length > 0;
	if ( ! hasContent ) {
		group.children = [];
		return { group, layers };
	}

	/* ---------------------------- container ---------------------------- */
	const hasContainer = 'none' !== o.container;
	const cpad = hasContainer
		? Math.round( fs * 1.0 * ( o.outerPad ?? 1 ) )
		: 0;
	if ( 'soft' === o.container ) {
		rect( 'Card', x, y, w, h, {
			fill: mix( accent, '#ffffff', 0.94 ),
			radius: rad,
		} );
	} else if ( dark ) {
		rect( 'Card', x, y, w, h, {
			fill: mix( '#191c22', accent, 0.1 ),
			radius: rad,
		} );
	} else if ( 'outline' === o.container ) {
		rect( 'Card', x, y, w, h, {
			fill: 'transparent',
			stroke: accent,
			strokeW: 2,
			radius: rad,
		} );
	}
	const bx = x + cpad;
	const by = y + cpad;
	const bw = w - cpad * 2;
	const bh = h - cpad * 2;

	/* ------------------------------ chrome ----------------------------- */
	let top = by;
	if ( o.title ) {
		const size = Math.round( fs * 1.7 );
		push(
			makeText( {
				name: 'Title',
				text: o.title,
				x: bx,
				y: top,
				w: bw,
				h: Math.round( size * 1.3 ),
				fontSize: size,
				align: 'left',
				color: ink,
				weight: 800,
			} )
		);
		top += Math.round( size * 1.5 );
	}
	if ( o.subtitle ) {
		push(
			makeText( {
				name: 'Subtitle',
				text: o.subtitle,
				x: bx,
				y: top,
				w: bw,
				h: Math.round( fs * 1.4 ),
				fontSize: fs,
				align: 'left',
				color: sub,
				weight: 400,
			} )
		);
		top += Math.round( fs * 1.8 );
	}
	const gridH = by + bh - top;

	if ( 'tablePricing' === type ) {
		buildPricing();
	} else if ( 'tableMenu' === type ) {
		buildMenu();
	} else if ( 'tableSpec' === type ) {
		buildSpecSheet();
	} else if ( 'tableScorecard' === type ) {
		buildScorecard();
	} else if ( 'tableCalendar' === type ) {
		buildCalendar();
	} else {
		buildGrid();
	}

	// One post-pass instead of threading the family through every
	// makeText: tables carry a single typeface (v1.269.2).
	if ( o.fontFamily ) {
		for ( const l of layers ) {
			if ( 'text' === l.type ) {
				l.fontFamily = o.fontFamily;
			}
		}
	}

	group.children = layers.map( ( l ) => l.id );
	return { group, layers };

	/* --------------------------- data / comparison --------------------- */
	function buildGrid() {
		let headers = ( spec.headers || [] ).map( ( c ) => String( c ?? '' ) );
		let rows = ( spec.rows || [] ).map( ( r ) =>
			( r || [] ).map( ( c ) => String( c ?? '' ) )
		);
		let colsMeta = ( spec.cols || [] ).slice();
		// Grid-variant types (v1.272): rank tables prepend a generated
		// position column, schedules pin a narrow bold time column and
		// checklists render their second column as marks.
		const rankTable = 'tableRanking' === type || 'tableStandings' === type;
		const isSchedule = 'tableSchedule' === type;
		const marksCol = 'tableChecklist' === type ? 1 : -1;
		let trendCol = -1;
		if ( rankTable ) {
			if ( 'tableRanking' === type ) {
				const lastH = String( headers[ headers.length - 1 ] || '' )
					.trim()
					.toLowerCase();
				if ( [ 'trend', '+/-', 'delta' ].includes( lastH ) ) {
					trendCol = headers.length; // after the rank prepend
				}
			}
			headers = [ '#', ...headers ];
			rows = rows.map( ( r, i ) => [ String( i + 1 ), ...r ] );
			colsMeta = [ { width: 8 }, ...colsMeta ];
		}
		if ( isSchedule ) {
			colsMeta[ 0 ] = { width: 16, ...( colsMeta[ 0 ] || {} ) };
		}
		const nCols = headers.length;
		if ( ! nCols || ! rows.length ) {
			return;
		}
		const comparison = 'tableComparison' === type;
		const m = gridMetricsFor( {
			headers,
			rows,
			cols: colsMeta,
			comparison,
			bw,
			fs,
			o,
		} );
		const pad = m.pad;
		const colX = m.colOff.map( ( off ) => bx + off );
		const colW = m.colW;
		const cardRows = 'cards' === o.rows;
		const rowGap = cardRows ? gridH * 0.02 : 0;
		// Scale the ideal metrics into the box we were given, so the
		// table always fills its rect exactly (v1 behaviour preserved).
		const scale = Math.max(
			0.05,
			( gridH - rowGap * rows.length ) / m.bodyIdeal
		);
		const headerH = m.headerH * scale;
		const rowHeights = m.rowHeights.map( ( rh ) => rh * scale );
		const rowTops = [];
		{
			let ry = top + headerH;
			for ( let r = 0; r < rows.length; r++ ) {
				rowTops.push( ry );
				ry += rowHeights[ r ] + rowGap;
			}
		}
		const rowTop = ( r ) => rowTops[ r ];
		const hc = o.highlightCol;
		const hasHeaderBar = 'solid' === o.header || 'gradient' === o.header;

		// Highlight column tint (behind everything).
		if ( comparison && hc > 0 && hc < nCols ) {
			rect(
				'Highlight',
				colX[ hc ],
				top + ( hasHeaderBar ? 0 : headerH ),
				colW[ hc ],
				gridH - ( hasHeaderBar ? 0 : headerH ),
				{
					fill: mix(
						accent,
						dark ? '#191c22' : '#ffffff',
						dark ? 0.7 : 0.86
					),
					radius: rad * 0.6,
				}
			);
		}
		// Row backgrounds.
		rows.forEach( ( _, r ) => {
			if ( cardRows ) {
				rect( `Row ${ r + 1 }`, bx, rowTop( r ), bw, rowHeights[ r ], {
					fill: softFill,
					radius: rad,
				} );
			} else if ( 'zebra' === o.rows && r % 2 === 1 ) {
				rect( `Row ${ r + 1 }`, bx, rowTop( r ), bw, rowHeights[ r ], {
					fill: softFill,
				} );
			}
		} );
		// Header treatment.
		if ( hasHeaderBar ) {
			rect(
				'Header',
				bx,
				top,
				bw,
				headerH,
				'gradient' === o.header
					? { ...gradHeader(), radius: cardRows ? rad : rad * 0.5 }
					: { fill: accent, radius: cardRows ? rad : rad * 0.5 }
			);
		} else if ( 'underline' === o.header ) {
			rect( 'Header line', bx, top + headerH - 2, bw, 2, {
				fill: accent,
			} );
		}
		// Row separators (lines style).
		if ( 'lines' === o.rows ) {
			for ( let r = 1; r < rows.length; r++ ) {
				rect( `Line ${ r }`, bx, rowTop( r ) - 1, bw, 1, {
					fill: line,
				} );
			}
		}
		// Header labels.
		const headText = hasHeaderBar ? onColor( accent ) : accent;
		headers.forEach( ( hd, ci ) => {
			const meta = colsMeta[ ci ];
			const align =
				meta?.align && 'auto' !== meta.align
					? meta.align
					: 0 === ci
					? 'left'
					: comparison
					? 'center'
					: columnAlign( rows, ci );
			const lx = 'left' === align ? colX[ ci ] + pad : colX[ ci ];
			const cw =
				'left' === align || 'right' === align
					? colW[ ci ] - pad
					: colW[ ci ];
			cellText(
				`H ${ hd }`,
				hd,
				lx,
				top + headerH / 2,
				cw,
				align,
				headText,
				comparison && ci === hc ? 800 : o.headerWeight
			);
		} );
		// Body cells.
		rows.forEach( ( row, r ) => {
			const cyMid = rowTop( r ) + rowHeights[ r ] / 2;
			for ( let ci = 0; ci < nCols; ci++ ) {
				// Rank badge column (ranking/standings, v1.272).
				if ( rankTable && 0 === ci ) {
					const badge =
						r < 3 ? [ '#d4a94b', '#aab4c0', '#c88b5a' ][ r ] : null;
					const bs = Math.min( colW[ 0 ] * 0.7, fs * 1.7 );
					if ( badge ) {
						rect(
							`Rank ${ r + 1 }`,
							colX[ 0 ] + colW[ 0 ] / 2 - bs / 2,
							cyMid - bs / 2,
							bs,
							bs,
							{ fill: badge, radius: bs / 2 }
						);
					}
					cellText(
						`Cell ${ r + 1 }-1`,
						String( r + 1 ),
						colX[ 0 ],
						cyMid,
						colW[ 0 ],
						'center',
						badge ? onColor( badge ) : ink,
						700
					);
					continue;
				}
				// Trend arrows (ranking, v1.272).
				if ( trendCol === ci ) {
					const raw = String( row[ ci ] ?? '' ).trim();
					const dir = raw.startsWith( '+' )
						? 1
						: raw.startsWith( '-' )
						? -1
						: 0;
					cellText(
						`Cell ${ r + 1 }-${ ci + 1 }`,
						0 === dir
							? '–'
							: ( 1 === dir ? '▲ ' : '▼ ' ) +
									raw.replace( /^[+-]/, '' ),
						colX[ ci ],
						cyMid,
						colW[ ci ],
						'center',
						1 === dir ? '#00a32a' : -1 === dir ? '#d63638' : sub,
						700
					);
					continue;
				}
				const meta = colsMeta[ ci ];
				const wrapped = m.lines[ r ][ ci ];
				const val =
					wrapped.length > 1
						? wrapped.join( '\n' )
						: fmtCell( row[ ci ] ?? '', meta );
				const mark =
					( comparison && ci > 0 ) || marksCol === ci
						? cellMark( val )
						: 'text';
				if ( 'text' !== mark ) {
					markShape(
						`Cell ${ r + 1 }-${ ci + 1 }`,
						colX[ ci ] + colW[ ci ] / 2,
						cyMid,
						mark
					);
					continue;
				}
				const align =
					meta?.align && 'auto' !== meta.align
						? meta.align
						: 0 === ci
						? 'left'
						: comparison
						? 'center'
						: columnAlign( rows, ci );
				const lx =
					'left' === align || 'right' === align
						? colX[ ci ] + ( 'left' === align ? pad : 0 )
						: colX[ ci ];
				const cw =
					'left' === align || 'right' === align
						? colW[ ci ] - pad
						: colW[ ci ];
				const boldLast = 'tableStandings' === type && ci === nCols - 1;
				cellText(
					`Cell ${ r + 1 }-${ ci + 1 }`,
					val,
					lx,
					cyMid,
					cw,
					align,
					isSchedule && 0 === ci
						? accent
						: 0 === ci
						? ink
						: mix( ink, dark ? '#191c22' : '#ffffff', 0.12 ),
					isSchedule && 0 === ci
						? 700
						: boldLast
						? 700
						: 0 === ci
						? 600
						: 400
				);
			}
		} );
		// Featured-column badge.
		if ( comparison && o.badge && hc > 0 && hc < nCols && hasHeaderBar ) {
			// header already carries the column; no pill needed.
		}
	}

	/* ------------------------------ pricing ---------------------------- */
	function buildPricing() {
		const tiers = ( spec.tiers || [] ).filter( ( t ) => t && t.name );
		const n = tiers.length;
		if ( ! n ) {
			return;
		}
		const gap = bw * 0.03;
		const cardW = ( bw - gap * ( n - 1 ) ) / n;
		const pad = cardW * 0.08;
		tiers.forEach( ( tier, i ) => {
			const cardX = bx + i * ( cardW + gap );
			const hot = !! tier.highlight;
			// Card background + border.
			if ( hot && o.gradient ) {
				rect( `Card ${ tier.name }`, cardX, top, cardW, gridH, {
					...gradHeader(),
					radius: rad || Math.round( fs * 0.8 ),
				} );
			} else {
				rect( `Card ${ tier.name }`, cardX, top, cardW, gridH, {
					fill: hot
						? dark
							? mix( '#191c22', accent, 0.28 )
							: mix( accent, '#ffffff', 0.9 )
						: dark
						? mix( '#191c22', '#ffffff', 0.05 )
						: '#ffffff',
					stroke: hot ? accent : line,
					strokeW: hot ? 2 : 1,
					radius: rad || Math.round( fs * 0.8 ),
				} );
			}
			const gradCard = hot && o.gradient;
			const cardInk = gradCard
				? onColor( accent )
				: hot && dark
				? '#f4f6f9'
				: ink;
			const cardAccent = gradCard ? onColor( accent ) : accent;
			// Space at the card top is reserved for the badge (see
			// naturalTableHeight); draw it inside so nothing overflows.
			const anyBadge = o.badge && tiers.some( ( t ) => t.highlight );
			let cy = top + pad * 1.2 + ( anyBadge ? fs * 1.8 : 0 );
			if ( hot && o.badge ) {
				badgePill(
					`Badge ${ tier.name }`,
					cardX + cardW / 2,
					top + pad * 0.6,
					tier.badge || 'Popular'
				);
			}
			cellText(
				`Name ${ tier.name }`,
				tier.name,
				cardX,
				cy + fs * 0.66,
				cardW,
				'center',
				cardAccent,
				700
			);
			cy += fs * 1.8;
			const priceFs = Math.round( fs * 2.4 );
			push(
				makeText( {
					name: `Price ${ tier.name }`,
					text: String( tier.price ?? '' ),
					x: Math.round( cardX ),
					y: Math.round( cy ),
					w: Math.round( cardW ),
					h: Math.round( priceFs * 1.2 ),
					fontSize: priceFs,
					align: 'center',
					color: cardAccent,
					weight: 800,
				} )
			);
			cy += priceFs * 1.15;
			if ( tier.period ) {
				cellText(
					`Period ${ tier.name }`,
					tier.period,
					cardX,
					cy + fs * 0.5,
					cardW,
					'center',
					gradCard ? mix( onColor( accent ), accent, 0.3 ) : sub,
					400
				);
				cy += fs * 1.6;
			} else {
				cy += fs * 0.4;
			}
			rect(
				`Divider ${ tier.name }`,
				cardX + pad,
				cy,
				cardW - pad * 2,
				1,
				{
					fill: gradCard
						? mix( onColor( accent ), accent, 0.5 )
						: line,
				}
			);
			cy += fs * 0.9;
			const features = ( tier.features || [] ).filter(
				( f ) => String( f ).trim() !== ''
			);
			const ctaH = tier.cta ? fs * 2.6 : 0;
			const featMax = top + gridH - pad * 1.4 - ctaH;
			const featStep = fs * 1.7;
			for ( const feat of features ) {
				if ( cy + featStep > featMax ) {
					break;
				}
				markShape(
					`Check ${ tier.name }`,
					cardX + pad + fs * 0.4,
					cy + fs * 0.5,
					'yes'
				);
				cellText(
					`Feature ${ feat }`,
					feat,
					cardX + pad + fs * 1.2,
					cy + fs * 0.5,
					cardW - pad * 2 - fs * 1.2,
					'left',
					gradCard
						? onColor( accent )
						: mix( cardInk, dark ? '#191c22' : '#ffffff', 0.1 ),
					400
				);
				cy += featStep;
			}
			if ( tier.cta ) {
				const bhh = fs * 2;
				const byy = top + gridH - pad * 1.2 - bhh;
				const btnFill = gradCard
					? '#ffffff'
					: hot
					? accent
					: mix(
							accent,
							dark ? '#191c22' : '#ffffff',
							dark ? 0.4 : 0.12
					  );
				rect(
					`Button ${ tier.name }`,
					cardX + pad,
					byy,
					cardW - pad * 2,
					bhh,
					{
						fill: btnFill,
						radius: bhh / 2,
					}
				);
				cellText(
					`CTA label ${ tier.name }`,
					tier.cta,
					cardX + pad,
					byy + bhh / 2,
					cardW - pad * 2,
					'center',
					gradCard ? accent : onColor( btnFill ),
					700
				);
			}
		} );
	}

	/* ------------------------------- menu ------------------------------- */
	function buildMenu() {
		const rows = ( spec.rows || [] ).map( ( r ) =>
			( r || [] ).map( ( c ) => String( c ?? '' ) )
		);
		if ( ! rows.length ) {
			return;
		}
		const hasDesc = ( spec.headers || [] ).length >= 3;
		const rowH = gridH / rows.length;
		rows.forEach( ( row, r ) => {
			const dish = row[ 0 ] ?? '';
			const desc = hasDesc ? row[ 1 ] ?? '' : '';
			const price = row[ hasDesc ? 2 : 1 ] ?? '';
			const yTop = top + r * rowH;
			const priceW = Math.max( fs * 3.5, bw * 0.14 );
			cellText(
				`Item ${ r + 1 }`,
				dish,
				bx,
				yTop + fs * 1.1,
				bw * 0.6,
				'left',
				ink,
				700
			);
			cellText(
				`Price ${ r + 1 }`,
				price,
				bx + bw - priceW,
				yTop + fs * 1.1,
				priceW,
				'right',
				accent,
				800
			);
			const nameW = Math.min( bw * 0.55, dish.length * fs * 0.62 + fs );
			const dotsW = Math.max( 0, bw - priceW - nameW - fs * 1.5 );
			const nDots = Math.floor( dotsW / ( fs * 0.55 ) );
			if ( nDots > 2 ) {
				cellText(
					`Dots ${ r + 1 }`,
					'·'.repeat( nDots ),
					bx + nameW,
					yTop + fs * 1.1,
					dotsW,
					'center',
					line,
					400
				);
			}
			if ( desc ) {
				push(
					makeText( {
						name: `Desc ${ r + 1 }`,
						text: desc,
						x: Math.round( bx ),
						y: Math.round( yTop + fs * 1.9 ),
						w: Math.round( bw * 0.75 ),
						h: Math.round( fs * 1.2 ),
						fontSize: Math.round( fs * 0.85 ),
						align: 'left',
						color: sub,
						weight: 400,
					} )
				);
			}
			if ( r ) {
				rect( `Line ${ r }`, bx, yTop, bw, 1, { fill: line } );
			}
		} );
	}

	/* ----------------------------- spec sheet --------------------------- */
	function buildSpecSheet() {
		const rows = ( spec.rows || [] ).map( ( r ) =>
			( r || [] ).map( ( c ) => String( c ?? '' ) )
		);
		if ( ! rows.length ) {
			return;
		}
		const rowH = gridH / rows.length;
		rows.forEach( ( row, r ) => {
			const label = row[ 0 ] ?? '';
			const value = String( row[ 1 ] ?? '' );
			const cyMid = top + r * rowH + rowH / 2;
			if ( '' === value.trim() ) {
				cellText(
					`Group ${ label }`,
					label,
					bx,
					cyMid,
					bw,
					'left',
					ink,
					800
				);
				rect(
					`Group line ${ r + 1 }`,
					bx,
					cyMid + fs * 0.95,
					bw * 0.3,
					2,
					{ fill: accent }
				);
				return;
			}
			cellText(
				`Cell ${ r + 1 }-1`,
				label,
				bx,
				cyMid,
				bw * 0.55,
				'left',
				sub,
				400
			);
			cellText(
				`Cell ${ r + 1 }-2`,
				value,
				bx + bw * 0.45,
				cyMid,
				bw * 0.55,
				'right',
				ink,
				600
			);
			rect( `Line ${ r + 1 }`, bx, cyMid + rowH / 2 - 1, bw, 1, {
				fill: line,
			} );
		} );
	}

	/* ------------------------------ scorecard --------------------------- */
	function buildScorecard() {
		const rows = ( spec.rows || [] ).map( ( r ) =>
			( r || [] ).map( ( c ) => String( c ?? '' ) )
		);
		const n = rows.length;
		if ( ! n ) {
			return;
		}
		const tcols = n > 6 ? 3 : n > 1 ? 2 : 1;
		const trows = Math.ceil( n / tcols );
		const gap = fs * 0.8;
		const tw = ( bw - gap * ( tcols - 1 ) ) / tcols;
		const th = ( gridH - gap * ( trows - 1 ) ) / trows;
		rows.forEach( ( row, i ) => {
			const label = row[ 0 ] ?? '';
			const value = row[ 1 ] ?? '';
			const delta = String( row[ 2 ] ?? '' ).trim();
			const tx = bx + ( i % tcols ) * ( tw + gap );
			const ty = top + Math.floor( i / tcols ) * ( th + gap );
			rect( `Tile ${ label }`, tx, ty, tw, th, {
				fill: softFill,
				radius: rad,
			} );
			push(
				makeText( {
					name: `Value ${ label }`,
					text: value,
					x: Math.round( tx ),
					y: Math.round( ty + th * 0.16 ),
					w: Math.round( tw ),
					h: Math.round( th * 0.36 ),
					fontSize: Math.round( Math.min( fs * 2.1, th * 0.3 ) ),
					align: 'center',
					color: ink,
					weight: 800,
				} )
			);
			cellText(
				`Label ${ label }`,
				label,
				tx,
				ty + th * 0.66,
				tw,
				'center',
				sub,
				400
			);
			if ( delta ) {
				cellText(
					`Delta ${ label }`,
					delta,
					tx,
					ty + th * 0.84,
					tw,
					'center',
					delta.startsWith( '+' )
						? '#00a32a'
						: delta.startsWith( '-' )
						? '#d63638'
						: sub,
					700
				);
			}
		} );
	}

	/* ------------------------------ calendar ---------------------------- */
	function buildCalendar() {
		const rows = ( spec.rows || [] ).map( ( r ) =>
			( r || [] ).map( ( c ) => String( c ?? '' ) )
		);
		let ym = String( o.month || '' );
		if ( ! /^\d{4}-\d{2}$/.test( ym ) ) {
			const first = rows
				.map( ( r ) => String( r[ 0 ] || '' ) )
				.find( ( d ) => /^\d{4}-\d{2}/.test( d ) );
			ym = first ? first.slice( 0, 7 ) : '2026-07';
		}
		const [ yy, mm ] = ym.split( '-' ).map( Number );
		const days = new Date( Date.UTC( yy, mm, 0 ) ).getUTCDate();
		const firstDow =
			( new Date( Date.UTC( yy, mm - 1, 1 ) ).getUTCDay() + 6 ) % 7;
		const events = {};
		rows.forEach( ( r ) => {
			const d = String( r[ 0 ] || '' );
			if ( d.startsWith( ym + '-' ) ) {
				const day = parseInt( d.slice( 8, 10 ), 10 );
				if ( day ) {
					events[ day ] = events[ day ] || [];
					events[ day ].push( String( r[ 1 ] || '' ) );
				}
			}
		} );
		const headH = fs * 1.6;
		const weeks = Math.ceil( ( firstDow + days ) / 7 );
		const cw = bw / 7;
		const chh = ( gridH - headH ) / weeks;
		const WEEKDAYS = [
			__( 'Mon', 'wunderpaint' ),
			__( 'Tue', 'wunderpaint' ),
			__( 'Wed', 'wunderpaint' ),
			__( 'Thu', 'wunderpaint' ),
			__( 'Fri', 'wunderpaint' ),
			__( 'Sat', 'wunderpaint' ),
			__( 'Sun', 'wunderpaint' ),
		];
		WEEKDAYS.forEach( ( wd, i ) =>
			cellText(
				`H ${ wd }`,
				wd,
				bx + i * cw,
				top + headH / 2,
				cw,
				'center',
				sub,
				700
			)
		);
		for ( let d = 1; d <= days; d++ ) {
			const col = ( firstDow + d - 1 ) % 7;
			const rowI = Math.floor( ( firstDow + d - 1 ) / 7 );
			const cx = bx + col * cw;
			const cy = top + headH + rowI * chh;
			rect( `Day ${ d }`, cx + 1, cy + 1, cw - 2, chh - 2, {
				fill: 'transparent',
				stroke: line,
				strokeW: 1,
				radius: Math.min( rad, 6 ),
			} );
			push(
				makeText( {
					name: `Day number ${ d }`,
					text: String( d ),
					x: Math.round( cx + fs * 0.5 ),
					y: Math.round( cy + fs * 0.4 ),
					w: Math.round( cw - fs ),
					h: Math.round( fs * 1.2 ),
					fontSize: Math.round( fs * 0.85 ),
					align: 'left',
					color: events[ d ] ? ink : sub,
					weight: events[ d ] ? 700 : 400,
				} )
			);
			if ( events[ d ] ) {
				rect(
					`Event dot ${ d }`,
					cx + cw - fs * 1.1,
					cy + fs * 0.55,
					fs * 0.55,
					fs * 0.55,
					{ fill: accent, radius: fs * 0.3 }
				);
				push(
					makeText( {
						name: `Event ${ d }`,
						text: events[ d ].join( ', ' ),
						x: Math.round( cx + fs * 0.5 ),
						y: Math.round( cy + chh - fs * 1.5 ),
						w: Math.round( cw - fs ),
						h: Math.round( fs * 1.2 ),
						fontSize: Math.round( fs * 0.72 ),
						align: 'left',
						color: ink,
						weight: 400,
					} )
				);
			}
		}
	}
}

/**
 * The height (px) the content wants at a given width, so the dialog can
 * size the insert box (and its WYSIWYG preview) to the content instead
 * of a fixed aspect - no empty space under a short pricing card.
 *
 * @param {Object} spec Same shape as buildTable's spec (uses w + content).
 * @return {number} Natural height in px.
 */
export function naturalTableHeight( spec ) {
	const type = TABLE_TYPES.includes( spec.type ) ? spec.type : 'tableData';
	const w = spec.w;
	const o = { ...STYLE_DEFAULTS, ...( spec.options || {} ) };
	const ts = o.textScale || 1;
	const fs = Math.max(
		9,
		Math.round( w * ( 'tablePricing' === type ? 0.026 : 0.024 ) * ts )
	);
	const cpad =
		'none' !== o.container
			? Math.round( fs * 1.0 * ( o.outerPad ?? 1 ) )
			: 0;
	let head = 0;
	if ( o.title ) {
		head += Math.round( fs * 1.7 * 1.5 );
	}
	if ( o.subtitle ) {
		head += Math.round( fs * 1.8 );
	}
	const bw = w - cpad * 2;
	if ( 'tablePricing' === type ) {
		const tiers = ( spec.tiers || [] ).filter( ( t ) => t && t.name );
		const n = Math.max( 1, tiers.length );
		const maxFeat = Math.max(
			1,
			...tiers.map(
				( t ) =>
					( t.features || [] ).filter(
						( f ) => String( f ).trim() !== ''
					).length
			)
		);
		const cardW = ( bw - bw * 0.03 * ( n - 1 ) ) / n;
		const pad = cardW * 0.08;
		const priceFs = Math.round( fs * 2.4 );
		const anyPeriod = tiers.some( ( t ) => t.period );
		const anyCta = tiers.some( ( t ) => t.cta );
		const anyBadge = o.badge && tiers.some( ( t ) => t.highlight );
		const cardH =
			pad * 1.2 +
			( anyBadge ? fs * 1.8 : 0 ) +
			fs * 1.8 +
			priceFs * 1.15 +
			( anyPeriod ? fs * 1.6 : fs * 0.4 ) +
			fs * 0.9 +
			maxFeat * fs * 1.7 +
			( anyCta ? fs * 2.6 : 0 ) +
			pad * 1.2;
		return Math.round( head + cardH + cpad * 2 );
	}
	// Custom layout types (v1.272) size from their own row math.
	if ( 'tableMenu' === type ) {
		const n = ( spec.rows || [] ).length || 1;
		return Math.round( head + n * fs * 3.4 + cpad * 2 );
	}
	if ( 'tableSpec' === type ) {
		const n = ( spec.rows || [] ).length || 1;
		return Math.round( head + n * fs * 2.6 + cpad * 2 );
	}
	if ( 'tableScorecard' === type ) {
		const n = ( spec.rows || [] ).length || 1;
		const tcols = n > 6 ? 3 : n > 1 ? 2 : 1;
		return Math.round( head + Math.ceil( n / tcols ) * fs * 7 + cpad * 2 );
	}
	if ( 'tableCalendar' === type ) {
		return Math.round( head + fs * 1.6 + 6 * fs * 4 + cpad * 2 );
	}

	// Grid types share the exact metrics buildGrid renders with, so the
	// dialog's content-driven box matches the ideal height 1:1 (v1.270).
	const headers = ( spec.headers || [] ).map( ( c ) => String( c ?? '' ) );
	const rows = ( spec.rows || [] ).map( ( r ) =>
		( r || [] ).map( ( c ) => String( c ?? '' ) )
	);
	if ( ! headers.length || ! rows.length ) {
		const nRows = rows.length;
		const headFrac = 1.1 + DENSITY[ o.density ] * 0.4;
		const rowUnit = fs * ( 1.9 + DENSITY[ o.density ] * 0.9 );
		const gapFactor = 'cards' === o.rows ? 1.12 : 1;
		const bodyH = rowUnit * ( nRows + headFrac ) * gapFactor;
		return Math.round( head + bodyH + cpad * 2 );
	}
	const m = gridMetricsFor( {
		headers,
		rows,
		cols: spec.cols,
		comparison: 'tableComparison' === type,
		bw,
		fs,
		o,
	} );
	const gapFactor = 'cards' === o.rows ? 1.12 : 1;
	return Math.round( head + m.bodyIdeal * gapFactor + cpad * 2 );
}
