import { objectPaintToSvg } from './svg-paint';
import { drawGradient } from './raster/shapes';
import { expandedGradientStops } from './gradient-ramp';
/**
 * SVG import/export (v1.1; import rebuilt v1.431.0).
 *
 * Import turns everyday SVG into editable layers: the primitives, every
 * transform (rotate, matrix and skew are baked into the geometry), the root
 * element's own paint, currentColor, fill and stroke opacity, the fill
 * rule, rounded rectangles, linear and radial gradients as gradient fills,
 * clip paths as linked layer masks, <use> and <symbol>, tspans and text
 * anchors, unit sizes, and on request the group structure. Filters, masks,
 * patterns, images, fonts and animation are reported as notes and left out
 * on purpose: they are the long tail, and a wrong picture is worse than an
 * honest note. Export writes vector layers natively and embeds pixel layers
 * as <image>.
 *
 * The measure behind the rebuild (15.09.2026): 534 real files from
 * WordPress, Elementor, icon packs and drawn artwork went through the old
 * importer. 38 % of the icons and 57 % of the drawings came out wrong, and
 * the reasons were not exotic - a root `fill="none"` that was never read
 * turned every outline icon into black blobs, an ignored rotate() put
 * artwork in the wrong place, a missing fill rule filled every ring.
 */

import { __, sprintf } from '@wordpress/i18n';
import {
	hasPenPaint,
	penPaintParts,
	penPaintStops,
	penPaintHasAlpha,
} from './pen-paint';

import { makeShape, makeText, makeGroup, uid } from '../store/document';
import { hasTokens } from './dynamic-content';
import { arrowHeadSpec, ARROW_KINDS } from './line-geometry';
import { withTextFit } from './text-fit';
import {
	parsePathAnchors,
	buildPathD,
	pathBounds,
	tightenPathLayer,
} from './path-edit';
import { createCanvas, dashPattern } from './raster';
import { isUniform, cornerRadii } from './corner-radii';
import { shapeToPathD } from './shape-path';
import {
	strokeAlignOf,
	strokeCapOf,
	strokeJoinOf,
	STROKE_CAPS,
	STROKE_JOINS,
} from './stroke-align';
import { parseColor, toHexColor } from './color';
import { expandRepeat } from './repeat-expand';

const KAPPA = 0.5522847498;

/* ------------------------------- matrices ------------------------------- */

// SVG matrix [a b c d e f]: x' = a x + c y + e, y' = b x + d y + f.
const IDENTITY = [ 1, 0, 0, 1, 0, 0 ];

/** m after n: the point goes through n first, then m (SVG nesting order). */
const mul = ( m, n ) => [
	m[ 0 ] * n[ 0 ] + m[ 2 ] * n[ 1 ],
	m[ 1 ] * n[ 0 ] + m[ 3 ] * n[ 1 ],
	m[ 0 ] * n[ 2 ] + m[ 2 ] * n[ 3 ],
	m[ 1 ] * n[ 2 ] + m[ 3 ] * n[ 3 ],
	m[ 0 ] * n[ 4 ] + m[ 2 ] * n[ 5 ] + m[ 4 ],
	m[ 1 ] * n[ 4 ] + m[ 3 ] * n[ 5 ] + m[ 5 ],
];
const applyM = ( m, x, y ) => ( {
	x: m[ 0 ] * x + m[ 2 ] * y + m[ 4 ],
	y: m[ 1 ] * x + m[ 3 ] * y + m[ 5 ],
} );
const linearM = ( m, x, y ) => ( {
	x: m[ 0 ] * x + m[ 2 ] * y,
	y: m[ 1 ] * x + m[ 3 ] * y,
} );
/** The uniform scale a matrix applies to lengths (stroke widths, fonts). */
const scaleOf = ( m ) =>
	Math.sqrt( Math.abs( m[ 0 ] * m[ 3 ] - m[ 1 ] * m[ 2 ] ) );
const rotationOf = ( m ) => ( Math.atan2( m[ 1 ], m[ 0 ] ) * 180 ) / Math.PI;
const translateM = ( x, y ) => [ 1, 0, 0, 1, x, y ];

/**
 * A transform attribute as one matrix. Every SVG transform function is
 * understood; the old reader knew translate and scale and dropped the rest
 * with a note, which put 42 % of the drawn artwork in the wrong place.
 *
 * @param {string} str Transform list.
 * @return {number[]} Matrix.
 */
function parseTransform( str ) {
	let m = IDENTITY;
	const calls = String( str || '' ).match( /(\w+)\s*\(([^)]*)\)/g ) || [];
	for ( const call of calls ) {
		const [ , fn, raw ] = call.match( /(\w+)\s*\(([^)]*)\)/ );
		const a = raw
			.split( /[\s,]+/ )
			.filter( Boolean )
			.map( Number );
		let t = null;
		switch ( fn ) {
			case 'translate':
				t = translateM( a[ 0 ] || 0, a[ 1 ] || 0 );
				break;
			case 'scale':
				t = [ a[ 0 ] ?? 1, 0, 0, a[ 1 ] ?? a[ 0 ] ?? 1, 0, 0 ];
				break;
			case 'rotate': {
				const r = ( ( a[ 0 ] || 0 ) * Math.PI ) / 180;
				const c = Math.cos( r );
				const s = Math.sin( r );
				t = [ c, s, -s, c, 0, 0 ];
				if ( a.length >= 3 ) {
					t = mul(
						mul( translateM( a[ 1 ], a[ 2 ] ), t ),
						translateM( -a[ 1 ], -a[ 2 ] )
					);
				}
				break;
			}
			case 'skewX':
				t = [
					1,
					0,
					Math.tan( ( ( a[ 0 ] || 0 ) * Math.PI ) / 180 ),
					1,
					0,
					0,
				];
				break;
			case 'skewY':
				t = [
					1,
					Math.tan( ( ( a[ 0 ] || 0 ) * Math.PI ) / 180 ),
					0,
					1,
					0,
					0,
				];
				break;
			case 'matrix':
				if (
					a.length >= 6 &&
					a.slice( 0, 6 ).every( Number.isFinite )
				) {
					t = a.slice( 0, 6 );
				}
				break;
			default:
				break;
		}
		if ( t ) {
			m = mul( m, t );
		}
	}
	return m;
}

/**
 * A path under a matrix. The normalizer behind parsePathAnchors reduces
 * every command (arcs included) to lines and cubics, so mapping the anchors
 * and handles through the matrix is exact for any affine transform.
 *
 * @param {string}   d Path data in local space.
 * @param {number[]} m Matrix.
 * @return {?string} Transformed path, or null when the path is unreadable.
 */
function transformPathD( d, m ) {
	const subs = parsePathAnchors( d );
	if ( ! subs ) {
		return null;
	}
	const mv = ( p ) => ( p ? applyM( m, p.x, p.y ) : null );
	return buildPathD(
		subs.map( ( s ) => ( {
			...s,
			anchors: s.anchors.map( ( a ) => ( {
				...mv( a ),
				hIn: mv( a.hIn ),
				hOut: mv( a.hOut ),
			} ) ),
		} ) )
	);
}

/* ------------------------------- geometry ------------------------------- */

const ellipsePath = ( cx, cy, rx, ry ) =>
	`M ${ cx - rx } ${ cy } ` +
	`C ${ cx - rx } ${ cy - ry * KAPPA } ${ cx - rx * KAPPA } ${
		cy - ry
	} ${ cx } ${ cy - ry } ` +
	`C ${ cx + rx * KAPPA } ${ cy - ry } ${ cx + rx } ${ cy - ry * KAPPA } ${
		cx + rx
	} ${ cy } ` +
	`C ${ cx + rx } ${ cy + ry * KAPPA } ${ cx + rx * KAPPA } ${
		cy + ry
	} ${ cx } ${ cy + ry } ` +
	`C ${ cx - rx * KAPPA } ${ cy + ry } ${ cx - rx } ${ cy + ry * KAPPA } ${
		cx - rx
	} ${ cy } Z`;

/** A rectangle, with rounded corners when rx/ry say so. */
const rectPath = ( x, y, w, h, rx = 0, ry = rx ) => {
	rx = Math.max( 0, Math.min( rx || 0, w / 2 ) );
	ry = Math.max( 0, Math.min( ry || 0, h / 2 ) );
	if ( ! rx || ! ry ) {
		return `M ${ x } ${ y } L ${ x + w } ${ y } L ${ x + w } ${
			y + h
		} L ${ x } ${ y + h } Z`;
	}
	const kx = rx * KAPPA;
	const ky = ry * KAPPA;
	const r = x + w;
	const b = y + h;
	return (
		`M ${ x + rx } ${ y } L ${ r - rx } ${ y } ` +
		`C ${ r - rx + kx } ${ y } ${ r } ${ y + ry - ky } ${ r } ${
			y + ry
		} ` +
		`L ${ r } ${ b - ry } ` +
		`C ${ r } ${ b - ry + ky } ${ r - rx + kx } ${ b } ${
			r - rx
		} ${ b } ` +
		`L ${ x + rx } ${ b } ` +
		`C ${ x + rx - kx } ${ b } ${ x } ${ b - ry + ky } ${ x } ${
			b - ry
		} ` +
		`L ${ x } ${ y + ry } ` +
		`C ${ x } ${ y + ry - ky } ${ x + rx - kx } ${ y } ${ x + rx } ${ y } Z`
	);
};

const num = ( el, name, def = 0 ) => {
	const v = parseFloat( el.getAttribute( name ) );
	return Number.isNaN( v ) ? def : v;
};

const UNIT_PX = {
	px: 1,
	pt: 96 / 72,
	pc: 16,
	mm: 96 / 25.4,
	cm: 96 / 2.54,
	in: 96,
	em: 16,
	ex: 8,
};

/**
 * A length attribute in pixels. Inkscape writes "210mm", print work comes
 * in pt, some tools write "100%"; parseFloat took the number and lost the
 * unit, which made an A4 sheet 210 pixels wide.
 *
 * @param {string} v   Attribute value.
 * @param {number} ref What 100 % means.
 * @return {number} Pixels, or NaN.
 */
function lengthPx( v, ref ) {
	const m = /^\s*(-?\d*\.?\d+(?:e[+-]?\d+)?)\s*([a-z%]*)\s*$/i.exec(
		String( v || '' )
	);
	if ( ! m ) {
		return NaN;
	}
	const n = parseFloat( m[ 1 ] );
	const u = m[ 2 ].toLowerCase();
	if ( '%' === u ) {
		return ( ref * n ) / 100;
	}
	return n * ( UNIT_PX[ u ] || 1 );
}

/** The geometry of one primitive as local path data, or null. */
function geometryD( el ) {
	switch ( el.tagName.toLowerCase() ) {
		case 'path':
			return el.getAttribute( 'd' ) || null;
		case 'rect': {
			const hasRx = el.hasAttribute( 'rx' );
			const hasRy = el.hasAttribute( 'ry' );
			const rx = hasRx ? num( el, 'rx' ) : hasRy ? num( el, 'ry' ) : 0;
			const ry = hasRy ? num( el, 'ry' ) : rx;
			return rectPath(
				num( el, 'x' ),
				num( el, 'y' ),
				num( el, 'width' ),
				num( el, 'height' ),
				rx,
				ry
			);
		}
		case 'circle':
			return ellipsePath(
				num( el, 'cx' ),
				num( el, 'cy' ),
				num( el, 'r' ),
				num( el, 'r' )
			);
		case 'ellipse':
			return ellipsePath(
				num( el, 'cx' ),
				num( el, 'cy' ),
				num( el, 'rx' ),
				num( el, 'ry' )
			);
		case 'polygon':
		case 'polyline': {
			const pts = ( el.getAttribute( 'points' ) || '' )
				.split( /[\s,]+/ )
				.filter( Boolean )
				.map( Number );
			if ( pts.length < 4 ) {
				return null;
			}
			let d = `M ${ pts[ 0 ] } ${ pts[ 1 ] }`;
			for ( let i = 2; i < pts.length - 1; i += 2 ) {
				d += ` L ${ pts[ i ] } ${ pts[ i + 1 ] }`;
			}
			return 'polygon' === el.tagName.toLowerCase() ? d + ' Z' : d;
		}
		case 'line':
			return `M ${ num( el, 'x1' ) } ${ num( el, 'y1' ) } L ${ num(
				el,
				'x2'
			) } ${ num( el, 'y2' ) }`;
		default:
			return null;
	}
}

const SHAPE_NAMES = {
	path: 'Path',
	rect: 'Rect',
	circle: 'Circle',
	ellipse: 'Ellipse',
	polygon: 'Polygon',
	polyline: 'Polyline',
	line: 'Line',
};

/* -------------------------------- styling ------------------------------- */

// Properties that flow from parent to child (fill, font, ...).
const INHERITED = [
	'fill',
	'stroke',
	'stroke-width',
	'stroke-dasharray',
	'stroke-linecap',
	'stroke-linejoin',
	'fill-opacity',
	'stroke-opacity',
	'fill-rule',
	'clip-rule',
	'color',
	'visibility',
	'font-size',
	'font-family',
	'font-weight',
	'font-style',
	'text-anchor',
	'letter-spacing',
];
// Properties that belong to the element alone.
const OWN = [ 'opacity', 'display', 'clip-path', 'mask' ];

/**
 * CSS font-weight to the numeric weight a text layer stores (04.09.2026).
 * SVG text is regular unless it says otherwise, so no value means 400 -
 * makeText's own default of 700 must not leak into imported lyrics.
 *
 * @param {string|undefined} v Raw font-weight value.
 * @return {number} 100..900.
 */
const fontWeightOf = ( v ) => {
	const s = String( v ?? '' )
		.trim()
		.toLowerCase();
	if ( ! s || 'normal' === s ) {
		return 400;
	}
	if ( 'bold' === s || 'bolder' === s ) {
		return 700;
	}
	if ( 'lighter' === s ) {
		return 300;
	}
	const n = parseInt( s, 10 );
	return Number.isNaN( n ) ? 400 : Math.min( 900, Math.max( 100, n ) );
};

const isItalic = ( v ) =>
	/^(italic|oblique)/.test(
		String( v ?? '' )
			.trim()
			.toLowerCase()
	);

/**
 * Class rules from <style> blocks (v1.70.1). Illustrator/Figma/Inkscape
 * exports carry their colors as `.cls-1{fill:#ff6a00}` + class attributes;
 * skipping them painted everything with the inherited black. Only simple
 * class selectors are resolved (optionally tag-qualified, comma lists).
 *
 * @param {Element} svg Root SVG element.
 * @return {Object} className → declarations map.
 */
function parseClassRules( svg ) {
	const rules = {};
	for ( const styleEl of Array.from( svg.querySelectorAll( 'style' ) ) ) {
		const css = ( styleEl.textContent || '' ).replace(
			/\/\*[\s\S]*?\*\//g,
			''
		);
		// /([^{}]+)\{([^}]*)\}/ backtracked once per character of a run
		// without braces and was quadratic on a big <style> - an icon sheet
		// with a megabyte of CSS froze the tab. Match the blocks alone
		// (linear) and take the selectors as the text since the last block.
		const re = /\{([^}]*)\}/g;
		let m;
		let lastEnd = 0;
		while ( ( m = re.exec( css ) ) ) {
			const selectorText = css.slice( lastEnd, m.index );
			lastEnd = re.lastIndex;
			const decls = {};
			for ( const part of m[ 1 ].split( ';' ) ) {
				const [ k, v ] = part
					.split( ':' )
					.map( ( t ) => t && t.trim() );
				if ( k && v ) {
					decls[ k.toLowerCase() ] = v;
				}
			}
			for ( const sel of selectorText.split( ',' ) ) {
				const cls = sel.trim().match( /^[a-zA-Z0-9_-]*\.([\w-]+)$/ );
				if ( cls ) {
					rules[ cls[ 1 ] ] = {
						...( rules[ cls[ 1 ] ] || {} ),
						...decls,
					};
				}
			}
		}
	}
	return rules;
}

/**
 * The element's own declarations: class rules first, the inline style on
 * top (v1.70.1 priority: inline style > class rule > presentation
 * attribute; the attribute is read by the callers as the last resort).
 *
 * @param {Element} el         Element.
 * @param {Object}  classRules From parseClassRules().
 * @return {Object} property → value.
 */
function declsOf( el, classRules ) {
	const out = {};
	for ( const c of ( el.getAttribute( 'class' ) || '' )
		.split( /\s+/ )
		.filter( Boolean ) ) {
		Object.assign( out, classRules[ c ] || {} );
	}
	for ( const part of ( el.getAttribute( 'style' ) || '' ).split( ';' ) ) {
		const i = part.indexOf( ':' );
		if ( i > 0 ) {
			const k = part.slice( 0, i ).trim().toLowerCase();
			const v = part.slice( i + 1 ).trim();
			if ( k && v ) {
				out[ k ] = v;
			}
		}
	}
	return out;
}

const readProp = ( el, decl, key ) => {
	const v = decl[ key ] ?? el.getAttribute( key );
	return undefined === v || null === v || '' === v || 'inherit' === v
		? undefined
		: v;
};

/** Inherited properties, the element's own values over the parent's. */
function styleOf( el, inherited, classRules = {} ) {
	const decl = declsOf( el, classRules );
	const out = { ...inherited };
	for ( const key of INHERITED ) {
		const v = readProp( el, decl, key );
		if ( undefined !== v ) {
			out[ key ] = v;
		}
	}
	return out;
}

/** The element's own, non-inherited properties. */
function ownOf( el, classRules = {} ) {
	const decl = declsOf( el, classRules );
	const out = {};
	for ( const key of OWN ) {
		const v = readProp( el, decl, key );
		if ( undefined !== v ) {
			out[ key ] = v;
		}
	}
	return out;
}

const refOf = ( v ) => {
	const m = /url\(\s*['"]?#([^'")\s]+)/.exec( v || '' );
	return m ? m[ 1 ] : null;
};

const hrefId = ( el ) =>
	String( el.getAttribute( 'href' ) || el.getAttribute( 'xlink:href' ) || '' )
		.trim()
		.replace( /^#/, '' );

/** An opacity value (number or percentage) clamped to 0..1. */
const alphaOf = ( v ) => {
	if ( undefined === v || null === v || '' === v ) {
		return 1;
	}
	const s = String( v ).trim();
	let n = parseFloat( s );
	if ( Number.isNaN( n ) ) {
		return 1;
	}
	if ( s.endsWith( '%' ) ) {
		n /= 100;
	}
	return Math.max( 0, Math.min( 1, n ) );
};

// The colour names that turn up in hand-written SVG. Anything else with an
// opacity keeps its name and loses the opacity, which is the smaller lie.
const NAMED = {
	white: '#ffffff',
	black: '#000000',
	red: '#ff0000',
	green: '#008000',
	blue: '#0000ff',
	yellow: '#ffff00',
	gray: '#808080',
	grey: '#808080',
	silver: '#c0c0c0',
	orange: '#ffa500',
	purple: '#800080',
	pink: '#ffc0cb',
	brown: '#a52a2a',
	cyan: '#00ffff',
	aqua: '#00ffff',
	magenta: '#ff00ff',
	fuchsia: '#ff00ff',
	navy: '#000080',
	teal: '#008080',
	maroon: '#800000',
	lime: '#00ff00',
	olive: '#808000',
};

/** A colour with fill-opacity / stroke-opacity baked into its alpha. */
function withAlpha( color, alpha ) {
	if ( ! ( alpha < 1 ) ) {
		return color;
	}
	const v = String( color ).trim();
	const base = NAMED[ v.toLowerCase() ] || v;
	if ( ! /^(#|rgba?\()/i.test( base ) ) {
		return color;
	}
	const c = parseColor( base );
	return toHexColor( c.r, c.g, c.b, c.a * alpha );
}

const clamp01 = ( n ) => Math.max( 0, Math.min( 1, n ) );

/* ------------------------------- gradients ------------------------------ */

/**
 * Every gradient in the document with its stops and geometry, href chains
 * resolved (Illustrator and Inkscape keep the stops on one gradient and
 * reference it from the ones that carry the geometry).
 *
 * @param {Element} svg        Root.
 * @param {Object}  classRules Class rules.
 * @return {Object} id → { kind, stops, attrs }.
 */
function parseGradients( svg, classRules ) {
	const nodes = Array.from(
		svg.querySelectorAll( 'linearGradient, radialGradient' )
	);
	const byId = new Map(
		nodes
			.filter( ( n ) => n.getAttribute( 'id' ) )
			.map( ( n ) => [ n.getAttribute( 'id' ), n ] )
	);
	const GEOM = [
		'x1',
		'y1',
		'x2',
		'y2',
		'cx',
		'cy',
		'r',
		'gradientUnits',
		'gradientTransform',
	];
	const build = ( el, depth ) => {
		const hid = hrefId( el );
		const parent =
			hid && byId.has( hid ) && depth < 8
				? build( byId.get( hid ), depth + 1 )
				: null;
		const attrs = {};
		for ( const n of GEOM ) {
			attrs[ n ] = el.hasAttribute( n )
				? el.getAttribute( n )
				: parent
				? parent.attrs[ n ]
				: undefined;
		}
		let last = 0;
		let stops = Array.from( el.children )
			.filter( ( c ) => 'stop' === c.tagName.toLowerCase() )
			.map( ( s ) => {
				const decl = declsOf( s, classRules );
				const off = String( s.getAttribute( 'offset' ) || '0' ).trim();
				let at = off.endsWith( '%' )
					? parseFloat( off ) / 100
					: parseFloat( off );
				at = clamp01( Number.isNaN( at ) ? 0 : at );
				// Offsets must not go backwards (SVG clamps them the same way).
				at = Math.max( last, at );
				last = at;
				let color = String(
					decl[ 'stop-color' ] ||
						s.getAttribute( 'stop-color' ) ||
						'#000000'
				).trim();
				if ( 'currentcolor' === color.toLowerCase() ) {
					color = '#000000';
				}
				const op = alphaOf(
					decl[ 'stop-opacity' ] ?? s.getAttribute( 'stop-opacity' )
				);
				return { at, color: withAlpha( color, op ) };
			} );
		if ( ! stops.length && parent ) {
			stops = parent.stops;
		}
		return {
			kind:
				'radialgradient' === el.tagName.toLowerCase()
					? 'radial'
					: 'linear',
			stops,
			attrs,
		};
	};
	const out = {};
	for ( const [ id, el ] of byId ) {
		out[ id ] = build( el, 0 );
	}
	return out;
}

/**
 * The direction of an SVG gradient as the angle our box gradient uses:
 * 0 runs left to right, 90 top to bottom. Bounding-box gradients are
 * scaled by the layer box, then both the gradient's own transform and the
 * element's matrix turn the vector.
 *
 * @param {Object}   g Gradient from parseGradients().
 * @param {number[]} m Element matrix.
 * @param {number}   w Layer width.
 * @param {number}   h Layer height.
 * @return {number} Degrees.
 */
function gradientAngle( g, m, w, h ) {
	const a = g.attrs;
	const val = ( v, def ) => {
		if ( undefined === v || null === v || '' === v ) {
			return def;
		}
		const s = String( v ).trim();
		const n = parseFloat( s );
		if ( Number.isNaN( n ) ) {
			return def;
		}
		return s.endsWith( '%' ) ? n / 100 : n;
	};
	const obb = 'userSpaceOnUse' !== a.gradientUnits;
	let v = {
		x: val( a.x2, obb ? 1 : 0 ) - val( a.x1, 0 ),
		y: val( a.y2, 0 ) - val( a.y1, 0 ),
	};
	v = linearM( parseTransform( a.gradientTransform ), v.x, v.y );
	if ( obb ) {
		v = { x: v.x * w, y: v.y * h };
	}
	v = linearM( m, v.x, v.y );
	if ( ! v.x && ! v.y ) {
		return 0;
	}
	return Math.round( ( Math.atan2( v.y, v.x ) * 180 ) / Math.PI );
}

/* -------------------------------- clipping ------------------------------ */

const near = ( a, b ) => Math.abs( a - b ) < 0.01;

/** One closed, axis-aligned rectangle without curves? */
function isAxisRect( subs ) {
	if ( 1 !== subs.length ) {
		return false;
	}
	const a = subs[ 0 ].anchors;
	if ( a.some( ( p ) => p.hIn || p.hOut ) ) {
		return false;
	}
	const pts =
		5 === a.length &&
		near( a[ 0 ].x, a[ 4 ].x ) &&
		near( a[ 0 ].y, a[ 4 ].y )
			? a.slice( 0, 4 )
			: a;
	if ( 4 !== pts.length ) {
		return false;
	}
	for ( let i = 0; i < 4; i++ ) {
		const p = pts[ i ];
		const q = pts[ ( i + 1 ) % 4 ];
		if ( ! near( p.x, q.x ) && ! near( p.y, q.y ) ) {
			return false;
		}
	}
	return true;
}

/** Trace anchor subpaths onto a context, shifted by (dx, dy). */
function traceSubs( ctx, subs, dx, dy ) {
	for ( const s of subs ) {
		const a = s.anchors;
		if ( ! a.length ) {
			continue;
		}
		ctx.moveTo( a[ 0 ].x + dx, a[ 0 ].y + dy );
		const seg = ( p, q ) => {
			if ( p.hOut || q.hIn ) {
				const c1 = p.hOut || p;
				const c2 = q.hIn || q;
				ctx.bezierCurveTo(
					c1.x + dx,
					c1.y + dy,
					c2.x + dx,
					c2.y + dy,
					q.x + dx,
					q.y + dy
				);
			} else {
				ctx.lineTo( q.x + dx, q.y + dy );
			}
		};
		for ( let i = 1; i < a.length; i++ ) {
			seg( a[ i - 1 ], a[ i ] );
		}
		if ( s.closed && a.length > 1 ) {
			seg( a[ a.length - 1 ], a[ 0 ] );
			ctx.closePath();
		}
	}
}

/**
 * Clip the layer with the clip paths in force, as a linked layer mask.
 *
 * A clip that is a plain rectangle around the whole layer changes nothing
 * and is dropped: that is the frame Figma puts around every export and the
 * artboard Illustrator clips to. Everything else becomes a mask canvas the
 * size of the layer, anchored to its box, so it follows the layer through
 * the scaling of placeSvgLayers() and every later transform. Kept small on
 * purpose: a doc-sized mask per clipped layer would cost a Figma export
 * with fifty clipped layers hundreds of megabytes.
 *
 * @param {Object} layer Imported layer with a tight box.
 * @param {Array}  clips [{ subs, box, rect, rule }].
 * @return {Object} The layer, masked when needed.
 */
function applyClips( layer, clips ) {
	const live = clips.filter(
		( c ) =>
			! (
				c.rect &&
				layer.x >= c.box.x - 0.5 &&
				layer.y >= c.box.y - 0.5 &&
				layer.x + layer.w <= c.box.x + c.box.w + 0.5 &&
				layer.y + layer.h <= c.box.y + c.box.h + 0.5
			)
	);
	if ( ! live.length ) {
		return layer;
	}
	const w = Math.max( 1, Math.ceil( layer.w ) );
	const h = Math.max( 1, Math.ceil( layer.h ) );
	if ( w * h > 16e6 ) {
		return layer;
	}
	const canvas = createCanvas( w, h );
	const ctx = canvas && canvas.getContext ? canvas.getContext( '2d' ) : null;
	if ( ! ctx ) {
		return layer;
	}
	ctx.fillStyle = '#ffffff';
	live.forEach( ( c, i ) => {
		if ( i ) {
			ctx.globalCompositeOperation = 'destination-in';
		}
		ctx.beginPath();
		traceSubs( ctx, c.subs, -layer.x, -layer.y );
		ctx.fill( c.rule );
	} );
	return {
		...layer,
		mask: {
			kind: 'raster',
			canvas,
			data: null,
			inverted: false,
			enabled: true,
			anchor: { x: 0, y: 0, w, h },
		},
	};
}

/* --------------------------------- import ------------------------------- */

/**
 * Parse an SVG document into WPIE layers.
 *
 * @param {string}  text           SVG source.
 * @param {Object}  [opts]         Options.
 * @param {boolean} [opts.groups]  Keep <g> elements as group layers (File →
 *                                 Import SVG). Off by default: the bridge
 *                                 contract for extensions is a flat list.
 * @return {{layers: Array, warnings: Array, width: number, height: number}} Result.
 */
export function importSvg( text, opts = {} ) {
	const groups = !! opts.groups;
	const doc = new window.DOMParser().parseFromString( text, 'image/svg+xml' );
	const svg = doc.querySelector( 'svg' );
	const warnings = [];
	const seen = new Set();
	const note = ( msg ) => {
		if ( ! seen.has( msg ) ) {
			seen.add( msg );
			warnings.push( msg );
		}
	};
	if ( ! svg || doc.querySelector( 'parsererror' ) ) {
		throw new Error( __( 'Not a readable SVG file.', 'wunderpaint' ) );
	}

	/* ------------------------------ canvas ------------------------------ */

	const viewBoxOf = ( el ) => {
		const raw = el.getAttribute( 'viewBox' );
		if ( ! raw ) {
			return null;
		}
		const v = raw
			.split( /[\s,]+/ )
			.filter( Boolean )
			.map( Number );
		return 4 === v.length &&
			v[ 2 ] > 0 &&
			v[ 3 ] > 0 &&
			v.every( Number.isFinite )
			? { x: v[ 0 ], y: v[ 1 ], w: v[ 2 ], h: v[ 3 ] }
			: false;
	};
	let vb = viewBoxOf( svg );
	let width = lengthPx( svg.getAttribute( 'width' ), vb ? vb.w : NaN );
	let height = lengthPx( svg.getAttribute( 'height' ), vb ? vb.h : NaN );
	if ( vb ) {
		if ( ! ( width > 0 ) && ! ( height > 0 ) ) {
			width = vb.w;
			height = vb.h;
		} else if ( ! ( width > 0 ) ) {
			width = ( vb.w * height ) / vb.h;
		} else if ( ! ( height > 0 ) ) {
			height = ( vb.h * width ) / vb.w;
		}
	} else {
		if ( false === vb ) {
			// A viewBox with a zero or negative side ("0 0 0 0") used to
			// divide into NaN and import every layer invisible, as a success.
			note(
				__(
					'The SVG has no usable viewBox; the drawing was imported at its width and height.',
					'wunderpaint'
				)
			);
		}
		width = width > 0 ? width : 512;
		height = height > 0 ? height : 512;
		vb = { x: 0, y: 0, w: width, h: height };
	}
	// preserveAspectRatio: the drawing is fitted, not stretched, unless the
	// file says "none" - the old reader stretched, so a 3:2 viewBox in a
	// square box came out squashed.
	const par = svg.getAttribute( 'preserveAspectRatio' ) || 'xMidYMid meet';
	let sx = width / vb.w;
	let sy = height / vb.h;
	let ox = 0;
	let oy = 0;
	if ( ! /\bnone\b/.test( par ) ) {
		const s = /\bslice\b/.test( par )
			? Math.max( sx, sy )
			: Math.min( sx, sy );
		const ax = /xMin/.test( par ) ? 0 : /xMax/.test( par ) ? 1 : 0.5;
		const ay = /YMin/.test( par ) ? 0 : /YMax/.test( par ) ? 1 : 0.5;
		ox = ( width - vb.w * s ) * ax;
		oy = ( height - vb.h * s ) * ay;
		sx = s;
		sy = s;
	}
	const root = [ sx, 0, 0, sy, ox - vb.x * sx, oy - vb.y * sy ];

	/* ----------------------------- registries --------------------------- */

	const classRules = parseClassRules( svg );
	const gradients = parseGradients( svg, classRules );
	const idIndex = {};
	for ( const el of Array.from( svg.querySelectorAll( '[id]' ) ) ) {
		idIndex[ el.getAttribute( 'id' ) ] = el;
	}
	const clipIndex = {};
	for ( const el of Array.from( svg.querySelectorAll( 'clipPath' ) ) ) {
		if ( el.getAttribute( 'id' ) ) {
			clipIndex[ el.getAttribute( 'id' ) ] = el;
		}
	}
	const maskIndex = {};
	for ( const el of Array.from( svg.querySelectorAll( 'mask' ) ) ) {
		if ( el.getAttribute( 'id' ) ) {
			maskIndex[ el.getAttribute( 'id' ) ] = el;
		}
	}
	const unsupported = ( tag ) =>
		note(
			sprintf(
				/* translators: %s: SVG element name. */
				__( 'Unsupported element <%s> skipped.', 'wunderpaint' ),
				tag
			)
		);

	const WHITE = new Set( [ 'white', '#fff', '#ffffff', 'rgb(255,255,255)' ] );

	/**
	 * The geometry inside a <clipPath> or <mask>, in root space, with
	 * transforms and <use> references resolved one level deep. For a mask
	 * every shape has to be plain white: that is the shape-as-window Figma
	 * writes for nearly every mask (175 of 191 in the corpus); a mask with
	 * gradients or grey is a real luminance mask and stays a note.
	 *
	 * @param {Element}  el        clipPath or mask element.
	 * @param {number[]} m         Matrix of the element that references it.
	 * @param {boolean}  whiteOnly Mask semantics.
	 * @return {?Object} { subs, box, rect, rule } or null.
	 */
	const windowOf = ( el, m, whiteOnly ) => {
		const unitsAttr = whiteOnly ? 'maskContentUnits' : 'clipPathUnits';
		if ( 'objectBoundingBox' === el.getAttribute( unitsAttr ) ) {
			return null;
		}
		const parts = [];
		let rule = 'nonzero';
		let clean = true;
		const collect = ( node, pm, inheritedFill, depth ) => {
			for ( const c of Array.from( node.children ) ) {
				if ( ! clean || depth > 4 ) {
					return;
				}
				const ctag = c.tagName.toLowerCase();
				const decl = declsOf( c, classRules );
				if ( 'none' === readProp( c, decl, 'display' ) ) {
					continue;
				}
				let lm = mul(
					pm,
					parseTransform( c.getAttribute( 'transform' ) )
				);
				const fill = readProp( c, decl, 'fill' ) ?? inheritedFill;
				if ( 'g' === ctag ) {
					collect( c, lm, fill, depth + 1 );
					continue;
				}
				let target = c;
				if ( 'use' === ctag ) {
					target = idIndex[ hrefId( c ) ];
					if ( ! target ) {
						continue;
					}
					lm = mul(
						mul( lm, translateM( num( c, 'x' ), num( c, 'y' ) ) ),
						parseTransform( target.getAttribute( 'transform' ) )
					);
				}
				const d = geometryD( target );
				if ( ! d ) {
					continue;
				}
				if ( whiteOnly ) {
					const f = String( fill ?? '#000000' )
						.replace( /\s+/g, '' )
						.toLowerCase();
					const op = alphaOf( readProp( c, decl, 'fill-opacity' ) );
					if ( ! WHITE.has( f ) || op < 1 ) {
						clean = false;
						return;
					}
				}
				const t = transformPathD( d, lm );
				if ( ! t ) {
					continue;
				}
				parts.push( t );
				if (
					'evenodd' ===
					readProp(
						target,
						declsOf( target, classRules ),
						'clip-rule'
					)
				) {
					rule = 'evenodd';
				}
			}
		};
		collect(
			el,
			mul( m, parseTransform( el.getAttribute( 'transform' ) ) ),
			whiteOnly ? '#000000' : null,
			0
		);
		if ( ! clean || ! parts.length ) {
			return null;
		}
		const subs = parsePathAnchors( parts.join( ' ' ) );
		if ( ! subs ) {
			return null;
		}
		return {
			subs,
			box: pathBounds( subs, 0 ),
			rect: isAxisRect( subs ),
			rule,
		};
	};
	const clipOf = ( clipEl, m ) => windowOf( clipEl, m, false );
	const maskOf = ( maskEl, m ) => windowOf( maskEl, m, true );

	/* ------------------------------- paint ------------------------------ */

	/**
	 * A fill or stroke value as { color } or { color, gradient }, null for
	 * none. currentColor resolves against the inherited `color`, the way a
	 * browser does; the old reader handed the word itself to the canvas,
	 * which ignores an unknown colour and paints with whatever came before.
	 */
	const paintOf = ( value, alpha, style ) => {
		const v = String( value ?? '' ).trim();
		if ( ! v || 'none' === v || 'transparent' === v ) {
			return null;
		}
		if ( 'currentcolor' === v.toLowerCase() ) {
			return { color: withAlpha( style.color || '#000000', alpha ) };
		}
		const id = refOf( v );
		if ( id ) {
			const g = gradients[ id ];
			if ( g && g.stops.length ) {
				return {
					color: withAlpha( g.stops[ 0 ].color, alpha ),
					gradient: g,
					alpha,
				};
			}
			note(
				__(
					'Unsupported paint reference replaced with gray.',
					'wunderpaint'
				)
			);
			return { color: '#888888' };
		}
		return { color: withAlpha( v, alpha ) };
	};

	const gradientProps = ( p ) =>
		p && p.gradient
			? {
					fillType: 'gradient',
					gradientStops: p.gradient.stops.map( ( s ) => ( {
						at: s.at,
						color: withAlpha( s.color, p.alpha ),
					} ) ),
					...( 'radial' === p.gradient.kind
						? { gradientKind: 'radial' }
						: {} ),
			  }
			: {};

	/* ------------------------------- layers ----------------------------- */

	const layers = [];

	const emitShape = ( d, style, m, name, alpha, clips, parentId ) => {
		const fillP = paintOf(
			style.fill,
			alphaOf( style[ 'fill-opacity' ] ),
			style
		);
		let strokeP = paintOf(
			style.stroke,
			alphaOf( style[ 'stroke-opacity' ] ),
			style
		);
		const swRaw = parseFloat( style[ 'stroke-width' ] );
		const sw = Number.isNaN( swRaw ) ? 1 : swRaw;
		if ( strokeP && sw <= 0 ) {
			strokeP = null;
		}
		if ( ! fillP && ! strokeP ) {
			// Invisible geometry (Figma's bounding rects, guides): no layer.
			return;
		}

		const s = scaleOf( m );
		const strokeW = strokeP ? Math.max( 0.5, sw * s ) : 0;
		// stroke-dasharray -> our dashed stroke style (first two values).
		const dashRaw =
			strokeP && style[ 'stroke-dasharray' ]
				? String( style[ 'stroke-dasharray' ] )
						.split( /[\s,]+/ )
						.map( parseFloat )
						.filter( ( v ) => v > 0 )
				: [];
		const dashProps = dashRaw.length
			? {
					strokeDash: 'dashed',
					strokeDashLen: Math.max( 1, dashRaw[ 0 ] * s ),
					strokeDashGap: Math.max(
						1,
						( dashRaw[ 1 ] ?? dashRaw[ 0 ] ) * s
					),
			  }
			: {};
		const pathD = transformPathD( d, m );
		if ( ! pathD ) {
			return;
		}
		const cap = style[ 'stroke-linecap' ];
		const join = style[ 'stroke-linejoin' ];
		// Tight layer box (v1.128.1, shared helper since v1.130.0): every
		// imported shape used to span the WHOLE SVG canvas, so selecting
		// an element showed no visible frame and the handles were useless.
		let layer = tightenPathLayer(
			makeShape( {
				name,
				x: 0,
				y: 0,
				w: Math.round( width ),
				h: Math.round( height ),
				pathD,
				fill: fillP ? fillP.color : 'transparent',
				stroke: strokeP ? strokeP.color : null,
				strokeW,
				...dashProps,
				...( strokeP && STROKE_CAPS.includes( cap )
					? { strokeCap: cap }
					: {} ),
				...( strokeP && STROKE_JOINS.includes( join )
					? { strokeJoin: join }
					: {} ),
				...( fillP && 'evenodd' === style[ 'fill-rule' ]
					? { fillRule: 'evenodd' }
					: {} ),
				...gradientProps( fillP ),
			} ),
			strokeP ? Math.ceil( strokeW / 2 ) : 0
		);
		if ( strokeP?.gradient ) {
			const paint = gradientProps( strokeP );
			layer.strokeGradient = {
				kind: paint.gradientKind || 'linear',
				stops: paint.gradientStops,
				angle: gradientAngle( strokeP.gradient, m, layer.w, layer.h ),
			};
		}

		if ( fillP && fillP.gradient ) {
			layer.gradientAngle = gradientAngle(
				fillP.gradient,
				m,
				layer.w,
				layer.h
			);
		}
		if ( alpha < 1 ) {
			layer.opacity = alpha;
		}
		layer = applyClips( layer, clips );
		if ( parentId ) {
			layer.parent = parentId;
		}
		layers.push( layer );
	};

	/**
	 * The lines of a <text>: a tspan with its own x or y (Inkscape's lines,
	 * Illustrator's positioned spans) starts a new line, a dy-only tspan
	 * moves down by that much, everything else joins the current line.
	 */
	const textLines = ( el, style ) => {
		const lines = [];
		let cur = null;
		const tx = num( el, 'x' );
		const ty = num( el, 'y' );
		const start = ( x, y, st ) => {
			cur = { x, y, parts: [], style: st };
			lines.push( cur );
		};
		const dyPx = ( v, size ) => {
			const s = String( v || '' ).trim();
			const n = parseFloat( s );
			if ( Number.isNaN( n ) ) {
				return 0;
			}
			return /em$/i.test( s ) ? n * size : n;
		};
		const visitNode = ( node, st ) => {
			for ( const n of Array.from( node.childNodes ) ) {
				if ( 3 === n.nodeType || 4 === n.nodeType ) {
					if ( ! cur ) {
						if ( ! n.data.trim() ) {
							continue;
						}
						start( tx, ty, st );
					}
					cur.parts.push( n.data );
				} else if ( 1 === n.nodeType ) {
					const t = n.tagName.toLowerCase();
					if (
						'tspan' !== t &&
						'tref' !== t &&
						'a' !== t &&
						'textpath' !== t
					) {
						continue;
					}
					const sst = styleOf( n, st, classRules );
					const hasX = n.hasAttribute( 'x' );
					const hasY = n.hasAttribute( 'y' );
					const hasDy = n.hasAttribute( 'dy' );
					const filled = cur && cur.parts.join( '' ).trim();
					if ( hasX || hasY || ( hasDy && filled ) ) {
						const bx = cur ? cur.x : tx;
						const by = cur ? cur.y : ty;
						let ny = hasY ? num( n, 'y', by ) : by;
						if ( ! hasY && hasDy ) {
							ny =
								by +
								dyPx(
									n.getAttribute( 'dy' ),
									parseFloat( sst[ 'font-size' ] || 16 )
								);
						}
						start( hasX ? num( n, 'x', bx ) : bx, ny, sst );
					} else if ( ! cur ) {
						start( tx, ty, sst );
					}
					visitNode( n, sst );
				}
			}
		};
		visitNode( el, style );
		return lines
			.map( ( l ) => ( {
				x: l.x,
				y: l.y,
				style: l.style,
				text: l.parts.join( '' ).replace( /\s+/g, ' ' ).trim(),
			} ) )
			.filter( ( l ) => l.text );
	};

	const emitText = ( ln, m, alpha, clips, parentId ) => {
		const st = ln.style;
		const s = scaleOf( m );
		const size = ( parseFloat( st[ 'font-size' ] ) || 16 ) * s;
		const rot = rotationOf( m );
		const p = applyM( m, ln.x, ln.y );
		const w = Math.round( Math.max( 60, ln.text.length * size * 0.6 ) );
		const h = Math.round( size * 1.4 );
		const anchor = st[ 'text-anchor' ];
		const align =
			'middle' === anchor
				? 'center'
				: 'end' === anchor
				? 'right'
				: 'left';
		// From the baseline start to the box's top-left in text space; the
		// box centre is then turned by the rotation so the baseline start
		// stays where the file put it. y is the baseline; size is already
		// scaled, so the ascent comes off AFTER the transform (v1.431).
		const offX = 'center' === align ? -w / 2 : 'right' === align ? -w : 0;
		const offY = -size * 0.8;
		const cx = offX + w / 2;
		const cy = offY + h / 2;
		const r = ( rot * Math.PI ) / 180;
		const rcx = cx * Math.cos( r ) - cy * Math.sin( r );
		const rcy = cx * Math.sin( r ) + cy * Math.cos( r );
		const fillP = paintOf( st.fill, alphaOf( st[ 'fill-opacity' ] ), st );
		const strokeP = paintOf(
			st.stroke,
			alphaOf( st[ 'stroke-opacity' ] ),
			st
		);
		const ls = parseFloat( st[ 'letter-spacing' ] );
		let layer = makeText( {
			text: ln.text,
			x: Math.round( p.x + rcx - w / 2 ),
			y: Math.round( p.y + rcy - h / 2 ),
			w,
			h,
			fontSize: Math.round( size ),
			fontFamily: ( st[ 'font-family' ] || 'Inter' )
				.replace( /['"]/g, '' )
				.split( ',' )[ 0 ]
				.trim(),
			weight: fontWeightOf( st[ 'font-weight' ] ),
			italic: isItalic( st[ 'font-style' ] ),
			color: fillP ? fillP.color : '#000000',
			align,
			...( Number.isFinite( ls ) && ls ? { letterSpacing: ls * s } : {} ),
			...( strokeP
				? {
						outlineColor: strokeP.color,
						outlineW: Math.max(
							0.5,
							( parseFloat( st[ 'stroke-width' ] ) || 1 ) * s
						),
				  }
				: {} ),
			...gradientProps( fillP ),
		} );
		if ( strokeP?.gradient ) {
			const paint = gradientProps( strokeP );
			layer.strokeGradient = {
				kind: paint.gradientKind || 'linear',
				stops: paint.gradientStops,
				angle: gradientAngle( strokeP.gradient, m, w, h ),
			};
		}

		if ( fillP && fillP.gradient ) {
			layer.gradientAngle = gradientAngle( fillP.gradient, m, w, h );
		}
		if ( Math.abs( rot ) > 0.01 ) {
			layer.rot = Math.round( rot * 100 ) / 100;
		}
		if ( alpha < 1 ) {
			layer.opacity = alpha;
		}
		layer = applyClips( layer, clips );
		if ( parentId ) {
			layer.parent = parentId;
		}
		layers.push( layer );
	};

	/* -------------------------------- walk ------------------------------ */

	const GROUP_TAGS = new Set( [ 'g', 'a', 'svg', 'switch', 'symbol' ] );
	const SILENT = new Set( [
		'defs',
		'title',
		'desc',
		'metadata',
		'style',
		'clippath',
		'mask',
		'lineargradient',
		'radialgradient',
		'symbol',
		'font',
		'font-face',
		'glyph',
		'missing-glyph',
		'script',
		'view',
	] );

	// ctx: { parentId, alpha, clips, depth, useStack, viaUse }
	const walkChildren = ( els, inherited, m, ctx ) => {
		for ( const child of els ) {
			if ( 1 === child.nodeType ) {
				visit( child, inherited, m, { ...ctx, viaUse: false } );
			}
		}
	};

	/**
	 * A <g> is kept as a group layer when it holds more than one thing or
	 * carries an opacity or clip of its own; a wrapper around a single
	 * child (Figma nests two or three per shape) is walked through so the
	 * layer panel does not fill with empty folders.
	 */
	const group = ( child, name, style, m, opacity, clips, ctx, els ) => {
		const kids = els.filter( ( n ) => 1 === n.nodeType );
		const real =
			groups && ( kids.length > 1 || opacity < 1 || clips !== ctx.clips );
		if ( ! real ) {
			walkChildren( kids, style, m, {
				...ctx,
				alpha: ctx.alpha * opacity,
				clips,
			} );
			return;
		}
		const g = makeGroup( { name: name || 'Group' } );
		g.parent = ctx.parentId;
		if ( opacity < 1 ) {
			g.opacity = opacity;
		}
		const before = layers.length;
		walkChildren( kids, style, m, {
			...ctx,
			parentId: g.id,
			alpha: 1,
			clips,
		} );
		const members = layers
			.slice( before )
			.filter( ( l ) => l.parent === g.id );
		if ( ! members.length ) {
			return;
		}
		g.children = members.map( ( l ) => l.id );
		// Members first, the group after them: the flat list paints in
		// array order and a group entry sits behind its members.
		layers.push( g );
	};

	const visit = ( child, inherited, ctm, ctx ) => {
		const tag = child.tagName.toLowerCase();
		if ( tag.includes( ':' ) ) {
			// Editor metadata (sodipodi:namedview, inkscape:...), nothing to draw.
			return;
		}
		const own = ownOf( child, classRules );
		if ( 'none' === own.display ) {
			return;
		}
		const style = styleOf( child, inherited, classRules );
		if (
			'hidden' === style.visibility ||
			'collapse' === style.visibility
		) {
			return;
		}
		let m = mul( ctm, parseTransform( child.getAttribute( 'transform' ) ) );
		const opacity = alphaOf( own.opacity );
		let clips = ctx.clips;
		const clipRef = refOf( own[ 'clip-path' ] );
		if ( clipRef ) {
			const c = clipIndex[ clipRef ]
				? clipOf( clipIndex[ clipRef ], m )
				: null;
			if ( c ) {
				clips = [ ...clips, c ];
			}
		}
		const maskRef = refOf( own.mask );
		if ( maskRef ) {
			const mk = maskIndex[ maskRef ]
				? maskOf( maskIndex[ maskRef ], m )
				: null;
			if ( mk ) {
				clips = [ ...clips, mk ];
			} else {
				unsupported( 'mask' );
			}
		}
		const name =
			child.getAttribute( 'inkscape:label' ) ||
			child.getAttribute( 'id' ) ||
			null;

		if ( GROUP_TAGS.has( tag ) && ( 'symbol' !== tag || ctx.viaUse ) ) {
			let els = Array.from( child.childNodes );
			if ( 'switch' === tag ) {
				const first = els.find( ( n ) => 1 === n.nodeType );
				els = first ? [ first ] : [];
			}
			if ( 'svg' === tag || 'symbol' === tag ) {
				// A nested viewport: its own origin, and its own viewBox when
				// it has one and a size to fit it into.
				m = mul(
					m,
					translateM( num( child, 'x' ), num( child, 'y' ) )
				);
				const ivb = viewBoxOf( child );
				const iw = lengthPx(
					child.getAttribute( 'width' ),
					ivb ? ivb.w : NaN
				);
				const ih = lengthPx(
					child.getAttribute( 'height' ),
					ivb ? ivb.h : NaN
				);
				if ( ivb && iw > 0 && ih > 0 ) {
					const s = Math.min( iw / ivb.w, ih / ivb.h );
					m = mul( m, [ s, 0, 0, s, -ivb.x * s, -ivb.y * s ] );
				} else if ( ivb ) {
					m = mul( m, translateM( -ivb.x, -ivb.y ) );
				}
			}
			group( child, name, style, m, opacity, clips, ctx, els );
			return;
		}
		switch ( tag ) {
			case 'path':
			case 'rect':
			case 'circle':
			case 'ellipse':
			case 'polygon':
			case 'polyline':
			case 'line': {
				const d = geometryD( child );
				if ( d ) {
					emitShape(
						d,
						'line' === tag ? { ...style, fill: 'none' } : style,
						m,
						name || SHAPE_NAMES[ tag ],
						ctx.alpha * opacity,
						clips,
						ctx.parentId
					);
				}
				return;
			}
			case 'text': {
				for ( const ln of textLines( child, style ) ) {
					emitText( ln, m, ctx.alpha * opacity, clips, ctx.parentId );
				}
				return;
			}
			case 'use': {
				const ref = idIndex[ hrefId( child ) ];
				if ( ! ref || ctx.depth > 8 || ctx.useStack.has( ref ) ) {
					unsupported( 'use' );
					return;
				}
				const um = mul(
					m,
					translateM( num( child, 'x' ), num( child, 'y' ) )
				);
				const stack = new Set( ctx.useStack );
				stack.add( ref );
				// The <use> element's own width/height size a referenced
				// symbol; hand them over so the symbol branch can fit its
				// viewBox. Done by wrapping: the symbol reads them from itself.
				const rtag = ref.tagName.toLowerCase();
				let target = ref;
				if (
					( 'symbol' === rtag || 'svg' === rtag ) &&
					( child.hasAttribute( 'width' ) ||
						child.hasAttribute( 'height' ) )
				) {
					target = ref.cloneNode( true );
					if ( child.hasAttribute( 'width' ) ) {
						target.setAttribute(
							'width',
							child.getAttribute( 'width' )
						);
					}
					if ( child.hasAttribute( 'height' ) ) {
						target.setAttribute(
							'height',
							child.getAttribute( 'height' )
						);
					}
				}
				visit( target, style, um, {
					...ctx,
					alpha: ctx.alpha * opacity,
					clips,
					depth: ctx.depth + 1,
					useStack: stack,
					viaUse: true,
				} );
				return;
			}
			default:
				if ( ! SILENT.has( tag ) ) {
					unsupported( tag );
				}
		}
	};

	// The root element's own paint counts: modern icon sets put
	// fill="none" stroke="currentColor" on <svg> and nothing on the paths.
	const rootStyle = styleOf(
		svg,
		{ fill: '#000000', color: '#000000' },
		classRules
	);
	walkChildren( Array.from( svg.childNodes ), rootStyle, root, {
		parentId: null,
		alpha: 1,
		clips: [],
		depth: 0,
		useStack: new Set(),
		viaUse: false,
	} );

	return {
		layers,
		warnings,
		width: Math.round( width ),
		height: Math.round( height ),
	};
}

/* --------------------------------- export ------------------------------- */

const esc = ( s ) =>
	String( s )
		.replace( /&/g, '&amp;' )
		.replace( /</g, '&lt;' )
		.replace( />/g, '&gt;' )
		.replace( /"/g, '&quot;' );

/**
 * A geometry value, forced to be one.
 *
 * esc() covers every colour, path and text field of the export, and the
 * numbers were left alone on the assumption that a number is a number. Nothing
 * enforces that: openProjectOp() checks `data.wpie` and that `layers` is an
 * array, hydrateLayers() converts bytes and spans, and neither makes `layer.x`
 * numeric. A shared .wpie file or a template with `"strokeW": "1\" onload=\"…"`
 * therefore wrote an extra attribute into the exported SVG - and that file is
 * one the person then puts on their own site.
 *
 * More escaping would work too, but this is the honest fix: these fields are
 * coordinates, and a coordinate that is not a number is a zero.
 *
 * @param {*} v        Raw value.
 * @param {number} [d] Fallback.
 * @return {number} A finite number.
 */
const geoNum = ( v, d = 0 ) => {
	const n = Number( v );
	return Number.isFinite( n ) ? n : d;
};

/**
 * Every numeric field a layer can carry into an SVG attribute.
 *
 * A project file is user data: openProjectOp() checks `wpie` and that
 * `layers` is an array, and nothing else. Any of these can therefore be a
 * string, and a string lands unescaped inside an attribute.
 */
const GEO_FIELDS = [
	'x',
	'y',
	'w',
	'h',
	'rot',
	'opacity',
	'strokeW',
	'strokeDashLen',
	'strokeDashGap',
	'fontSize',
	'lineHeight',
	'letterSpacing',
	'paragraphSpacing',
	'weight',
	'sides',
];

/**
 * The same layer with its numbers guaranteed to be numbers.
 *
 * This is deliberately NOT another list of call sites. JSPARSE-05 was
 * reported, fixed for the document size, marked as done - and the layer
 * coordinates stayed raw. It was fixed again for most layer coordinates on
 * 11.09.2026, marked as done, and `font-size`, `font-weight`, the two text
 * transforms, the image height and the right-aligned anchor stayed raw
 * (audit C05). Twice the fix reached the reported line and not the class.
 * So every emitter below now works on a normalized layer, and a new
 * attribute cannot reintroduce the hole by forgetting a helper.
 *
 * A value that is not a finite number is DROPPED rather than zeroed, so the
 * branch's own fallback still applies: `layer.fontSize || 16` has to keep
 * meaning sixteen, not zero.
 *
 * @param {Object} layer Raw layer.
 * @return {Object} The layer, or a copy with clean numbers.
 */
const geoLayer = ( layer ) => {
	if ( ! layer || 'object' !== typeof layer ) {
		return layer;
	}
	let copy = null;
	for ( const f of GEO_FIELDS ) {
		const v = layer[ f ];
		if ( undefined === v || null === v ) {
			continue;
		}
		if ( 'number' === typeof v && Number.isFinite( v ) ) {
			continue;
		}
		const n = Number( v );
		copy = copy || { ...layer };
		if ( Number.isFinite( n ) ) {
			copy[ f ] = n;
		} else {
			delete copy[ f ];
		}
	}
	return copy || layer;
};

const dashAttr = ( layer, width ) => {
	const d = dashPattern(
		layer.strokeDash,
		width,
		layer.strokeDashLen,
		layer.strokeDashGap
	);
	if ( ! d ) {
		return '';
	}
	const vals = d.map( ( v ) => Math.round( v * 100 ) / 100 ).join( ' ' );
	return ` stroke-dasharray="${ esc( String( vals ) ) }"${
		'dotted' === layer.strokeDash ? ' stroke-linecap="round"' : ''
	}`;
};

function textPaintToSvg( layer, defs ) {
	const paint = objectPaintToSvg( layer, 'fill', defs );
	if ( ! layer.outlineColor || ! ( layer.outlineW > 0 ) ) {
		return `fill="${ esc( paint ) }"`;
	}
	const stroke = objectPaintToSvg( layer, 'stroke', defs );
	return `fill="${ esc( paint ) }" stroke="${ esc(
		stroke
	) }" stroke-width="${ geoNum(
		layer.outlineW
	) }" stroke-linejoin="round" paint-order="stroke fill"${ dashAttr(
		{
			strokeDash: layer.outlineDash,
			strokeDashLen: layer.outlineDashLen,
			strokeDashGap: layer.outlineDashGap,
		},
		layer.outlineW
	) }`;
}

function shapeToSvg( layer, defs ) {
	const fillPaint = objectPaintToSvg( layer, 'fill', defs );
	const fillAttr =
		fillPaint && fillPaint !== 'transparent' ? fillPaint : 'none';
	const strokePaint = objectPaintToSvg( layer, 'stroke', defs );
	// Caps and joins travel only when the layer set them (v1.429), so
	// older exports stay byte-identical.
	const capJoinAttr =
		( layer.strokeCap
			? ` stroke-linecap="${ strokeCapOf( layer ) }"`
			: '' ) +
		( layer.strokeJoin
			? ` stroke-linejoin="${ strokeJoinOf( layer ) }"`
			: '' );
	const strokeAttr =
		layer.stroke && layer.strokeW
			? ` stroke="${ esc( strokePaint ) }" stroke-width="${ geoNum(
					layer.strokeW
			  ) }"${ dashAttr( layer, layer.strokeW ) }${ capJoinAttr }`
			: '';
	const common = `fill="${ esc( fillAttr ) }"${
		'evenodd' === layer.fillRule ? ' fill-rule="evenodd"' : ''
	}${ strokeAttr }`;
	const tx = ` transform="translate(${ geoNum( layer.x ) },${ geoNum(
		layer.y
	) })${
		layer.rot
			? ` rotate(${ geoNum( layer.rot ) } ${ geoNum( layer.w ) / 2 } ${
					geoNum( layer.h ) / 2
			  })`
			: ''
	}"`;
	if ( hasPenPaint( layer ) && layer.pathD ) {
		const id = `wpie-pen${ defs.items.length + 1 }`,
			parts = penPaintParts( layer.penPath.d, layer.penPath.style ),
			sx = layer.w / layer.penPath.w,
			sy = layer.h / layer.penPath.h;
		defs.items.push(
			`<clipPath id="${ id }"><path d="${ esc(
				layer.pathD
			) }" clip-rule="${
				layer.fillRule === 'evenodd' ? 'evenodd' : 'nonzero'
			}"/></clipPath>`
		);
		const paint = ( alpha = false ) =>
			parts
				.map( ( part, i ) => {
					const gid = `${ id }-${ alpha ? 'a' : 'c' }-${ i }`;
					const stops = penPaintStops( part, alpha )
						.map(
							( stop ) =>
								`<stop offset="${ stop.t }" stop-color="${ esc(
									stop.color
								) }"/>`
						)
						.join( '' );
					defs.items.push(
						`<linearGradient id="${ gid }" gradientUnits="userSpaceOnUse" x1="${ geoNum(
							part.from.x
						) }" y1="${ geoNum( part.from.y ) }" x2="${ geoNum(
							part.to.x
						) }" y2="${ geoNum(
							part.to.y
						) }">${ stops }</linearGradient>`
					);
					return `<path d="${ esc(
						part.d
					) }" fill="url(#${ gid })"/>`;
				} )
				.join( '' );
		const body = paint(),
			alphaId = `${ id }-alpha`,
			transparent = penPaintHasAlpha( layer.penPath.style );
		if ( transparent ) {
			const coverage = paint( true );
			defs.items.push(
				`<mask id="${ alphaId }" maskUnits="userSpaceOnUse" x="0" y="0" width="${ layer.penPath.w }" height="${ layer.penPath.h }" style="mask-type:luminance">${ coverage }</mask>`
			);
		}

		const flip =
			layer.flipX || layer.flipY
				? ` transform="translate(${ layer.w / 2 } ${
						layer.h / 2
				  }) scale(${ layer.flipX ? -1 : 1 } ${
						layer.flipY ? -1 : 1
				  }) translate(${ -layer.w / 2 } ${ -layer.h / 2 })"`
				: '';
		return `<g${ tx }><g${ flip }><g clip-path="url(#${ id })"><g transform="scale(${ sx } ${ sy })"${
			transparent ? ` mask="url(#${ alphaId })"` : ''
		}>${ body }</g></g>${
			strokeAttr
				? shapeToSvg(
						{
							...layer,
							penPath: null,
							fill: 'none',
							x: 0,
							y: 0,
							rot: 0,
							flipX: false,
							flipY: false,
						},
						defs
				  )
				: ''
		}</g></g>`;
	}
	const align = strokeAlignOf( layer );
	if ( 'center' !== align && strokeAttr ) {
		// Stroke position (v1.430): SVG has no such attribute, so the
		// stroke travels at double width and a clipPath (inside) or a mask
		// (outside) keeps the half that shows - the same construction the
		// canvas paints.
		const d = shapeToPathD( layer );
		if ( d ) {
			const id = `wpie-sa${ defs.items.length + 1 }`;
			const sw = layer.strokeW;
			const outline = `<path d="${ esc( d ) }" fill="none" stroke="${ esc(
				strokePaint
			) }" stroke-width="${ sw * 2 }" stroke-linejoin="${ strokeJoinOf(
				layer
			) }" stroke-linecap="${ strokeCapOf( layer ) }"${ dashAttr(
				layer,
				sw
			) }`;
			if ( 'inside' === align ) {
				defs.items.push(
					`<clipPath id="${ id }"><path d="${ esc(
						d
					) }"/></clipPath>`
				);
				return `<g${ tx }><path d="${ esc( d ) }" fill="${ esc(
					fillAttr
				) }"/>${ outline } clip-path="url(#${ id })"/></g>`;
			}
			const m = sw * 2;
			defs.items.push(
				`<mask id="${ id }" maskUnits="userSpaceOnUse" x="${ -m }" y="${ -m }" width="${
					layer.w + 2 * m
				}" height="${
					layer.h + 2 * m
				}"><rect x="${ -m }" y="${ -m }" width="${
					layer.w + 2 * m
				}" height="${ layer.h + 2 * m }" fill="#fff"/><path d="${ esc(
					d
				) }" fill="#000"/></mask>`
			);
			return `<g${ tx }><path d="${ esc( d ) }" fill="${ esc(
				fillAttr
			) }"/>${ outline } mask="url(#${ id })"/></g>`;
		}
	}
	if ( layer.pathD ) {
		return `<path d="${ esc( layer.pathD ) }" ${ common }${ tx }/>`;
	}
	switch ( layer.shape ) {
		case 'ellipse':
			return `<ellipse cx="${ layer.w / 2 }" cy="${ layer.h / 2 }" rx="${
				layer.w / 2
			}" ry="${ layer.h / 2 }" ${ common }${ tx }/>`;
		case 'line': {
			const ly1 = layer.lineFlip ? layer.h : 0;
			const ly2 = layer.lineFlip ? 0 : layer.h;
			const lw = Math.max( 2, layer.strokeW || 0 );
			const color = esc(
				layer.strokeGradient ? strokePaint : fillPaint || '#000'
			);
			const dx = layer.w;
			const dy = ly2 - ly1;
			const len = Math.hypot( dx, dy ) || 1;
			const ux = dx / len;
			const uy = dy / len;
			const startKind = ARROW_KINDS.includes( layer.arrowStart )
				? layer.arrowStart
				: '';
			const endKind = ARROW_KINDS.includes( layer.arrowEnd )
				? layer.arrowEnd
				: '';
			let t1 = startKind ? arrowHeadSpec( startKind, lw ).trim : 0;
			let t2 = endKind ? arrowHeadSpec( endKind, lw ).trim : 0;
			if ( t1 + t2 >= len ) {
				t1 = 0;
				t2 = 0;
			}
			const shaft = `<line x1="${ ux * t1 }" y1="${
				ly1 + uy * t1
			}" x2="${ layer.w - ux * t2 }" y2="${
				ly2 - uy * t2
			}" stroke="${ color }" stroke-width="${ lw }"${ dashAttr(
				layer,
				lw
			) }/>`;
			// Same head geometry as the raster renderer (arrowHeadSpec).
			const head = ( tipX, tipY, deg, kind ) => {
				const headColor =
					layer.strokeGradient || layer.fillType === 'gradient'
						? esc(
								objectPaintToSvg(
									layer,
									layer.strokeGradient ? 'stroke' : 'fill',
									defs,
									`rotate(${ -deg }) translate(${ -tipX } ${ -tipY })`
								)
						  )
						: color;
				const { len: hl, half, r } = arrowHeadSpec( kind, lw );
				const g = `transform="translate(${ tipX } ${ tipY }) rotate(${ deg })"`;
				if ( 'arrow' === kind ) {
					return `<path d="M ${ -hl } ${ -half } L 0 0 L ${ -hl } ${ half }" fill="none" stroke="${ headColor }" stroke-width="${ lw }" stroke-linecap="round" stroke-linejoin="round" ${ g }/>`;
				}
				if ( 'triangle' === kind ) {
					return `<path d="M 0 0 L ${ -hl } ${ -half } L ${ -hl } ${ half } Z" fill="${ headColor }" ${ g }/>`;
				}
				if ( 'circle' === kind ) {
					return `<circle cx="0" cy="0" r="${ r }" fill="${ headColor }" ${ g }/>`;
				}
				return `<line x1="0" y1="${ -half }" x2="0" y2="${ half }" stroke="${ headColor }" stroke-width="${ lw }" stroke-linecap="round" ${ g }/>`;
			};
			const deg = ( Math.atan2( dy, dx ) * 180 ) / Math.PI;
			const heads =
				( startKind ? head( 0, ly1, deg + 180, startKind ) : '' ) +
				( endKind ? head( layer.w, ly2, deg, endKind ) : '' );
			if ( ! heads ) {
				return `<line x1="0" y1="${ ly1 }" x2="${
					layer.w
				}" y2="${ ly2 }" stroke="${ color }" stroke-width="${ lw }"${ dashAttr(
					layer,
					lw
				) }${ tx }/>`;
			}
			return `<g${ tx }>${ shaft }${ heads }</g>`;
		}
		case 'rect': {
			// <rect rx> can only say ONE radius. Four different corners
			// (v1.367) therefore leave through the path geometry, which is
			// the same one the canvas draws.
			if ( ! isUniform( layer.radius ) ) {
				return `<path d="${ shapeToPathD(
					layer
				) }" ${ common }${ tx }/>`;
			}
			const [ r ] = cornerRadii( layer.radius, layer.w, layer.h );
			return `<rect width="${ geoNum( layer.w ) }" height="${ geoNum(
				layer.h
			) }" rx="${ r }" ${ common }${ tx }/>`;
		}
		default: {
			// A shape whose geometry we can bake travels as its real path
			// (v1.368). This used to approximate everything as a sharp
			// polygon, which threw away rounded corners, corner smoothing
			// and a star's waist - all of them invisible in the export
			// while the editor showed them plainly.
			const baked = shapeToPathD( layer );
			if ( baked ) {
				return `<path d="${ baked }" ${ common }${ tx }/>`;
			}
			const sides = Math.max( 3, layer.sides || 6 );
			const pts = [];
			for ( let i = 0; i < sides; i++ ) {
				const a = ( i / sides ) * 2 * Math.PI - Math.PI / 2;
				pts.push(
					`${ ( layer.w / 2 ) * ( 1 + Math.cos( a ) ) },${
						( layer.h / 2 ) * ( 1 + Math.sin( a ) )
					}`
				);
			}
			defs.warnings.push(
				sprintf(
					/* translators: %s: shape kind. */
					__( 'Shape "%s" exported as polygon.', 'wunderpaint' ),
					layer.shape
				)
			);
			return `<polygon points="${ pts.join(
				' '
			) }" ${ common }${ tx }/>`;
		}
	}
}

function textToSvg( layer, defs ) {
	// Same non-destructive transforms as the raster painter (v1.301).
	layer = withTextFit( layer );
	if ( layer.textFitView ) {
		return fluidTextToSvg( layer, defs );
	}
	const lines = String( layer.text || '' ).split( '\n' );
	const size = layer.fontSize || 16;
	const lineHeight = ( layer.lineHeight || 1.05 ) * size;
	const anchor =
		'center' === layer.align
			? 'middle'
			: 'right' === layer.align
			? 'end'
			: 'start';
	const ax =
		'middle' === anchor ? layer.w / 2 : 'end' === anchor ? layer.w : 0;
	// Every authored line is a paragraph here (the export does not wrap),
	// so the paragraph spacing (v1.429) adds up per line.
	const ps = Number( layer.paragraphSpacing ) || 0;
	const spans = lines
		.map(
			( line, i ) =>
				`<tspan x="${ ax }" y="${
					size * 0.8 + i * ( lineHeight + ps )
				}">${ esc( line ) }</tspan>`
		)
		.join( '' );
	// Dynamic binding marker (v1.157.0): server-side consumers (Pro live
	// badges) substitute the text content of marked nodes per request.
	// The layout metadata (v1.159.0) lets them WRAP and shrink-to-fit the
	// substituted value: box size, line height and the measured average
	// character width of this face (SVG text never wraps on its own).
	// Unbound text with inline {{tokens}} (v1.162.0) gets the same
	// metadata under data-wpie-tokens; the node keeps its raw token text
	// and the server expands it per request.
	let binding = '';
	if ( layer.binding || hasTokens( layer.text ) ) {
		let cw = size * 0.55;
		try {
			const ctx = document.createElement( 'canvas' ).getContext( '2d' );
			ctx.font = `${ layer.italic ? 'italic ' : '' }${
				layer.weight || 400
			} ${ size }px "${ layer.fontFamily || 'Inter' }"`;
			const sample =
				'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
			cw = ctx.measureText( sample ).width / sample.length;
		} catch ( e ) {
			// Headless (tests): the 0.55em heuristic stands in.
		}
		binding =
			( layer.binding
				? ` data-wpie-binding="${ esc( layer.binding ) }"`
				: // The raw token string rides along: the wrapped tspans may
				  // split it, the attribute is what the server expands.
				  ` data-wpie-tokens="1" data-wpie-text="${ esc(
						String( layer.text || '' )
				  ) }"` ) +
			` data-wpie-w="${ Math.round( layer.w ) }"` +
			` data-wpie-h="${ Math.round( layer.h ) }"` +
			` data-wpie-fs="${ size }"` +
			` data-wpie-lh="${ Math.round( lineHeight * 100 ) / 100 }"` +
			` data-wpie-cw="${ Math.round( cw * 100 ) / 100 }"`;
	}
	return `<text${ binding } transform="translate(${ layer.x },${
		layer.y
	})" font-family="${ esc(
		layer.fontFamily || 'Inter'
	) }" font-size="${ size }" font-weight="${ layer.weight || 400 }"${
		layer.italic ? ' font-style="italic"' : ''
	} text-anchor="${ anchor }" ${ textPaintToSvg(
		layer,
		defs
	) }>${ spans }</text>`;
}

/**
 * Fluid Text (v1.429): one tspan per fitted line, each with its own size;
 * a line's leading is its runs' lh × size. Character colours are not
 * carried (the plain path drops them too).
 *
 * @param {Object} layer Paint view of a fluid text layer.
 * @return {string} SVG text element.
 */
function fluidTextToSvg( layer, defs ) {
	const rows = [];
	let row = { size: 0, lh: 0, text: '' };
	for ( const run of layer.spans || [] ) {
		const parts = String( run.text ).split( '\n' );
		parts.forEach( ( part, i ) => {
			if ( i ) {
				rows.push( row );
				row = { size: 0, lh: 0, text: '' };
			}
			row.size = row.size || run.s?.size || layer.fontSize || 16;
			row.lh = row.lh || run.s?.lh || layer.lineHeight || 1.05;
			row.text += part;
		} );
	}
	rows.push( row );
	const r2 = ( v ) => Math.round( v * 100 ) / 100;
	let y = 0;
	const tspans = rows
		.map( ( r, i ) => {
			y += i ? r.lh * r.size : r.size * 0.8;
			return `<tspan x="${ r2( layer.w / 2 ) }" y="${ r2(
				y
			) }" font-size="${ r2( r.size ) }">${ esc( r.text ) }</tspan>`;
		} )
		.join( '' );
	const deco = [
		layer.underline ? 'underline' : '',
		layer.strike ? 'line-through' : '',
	]
		.filter( Boolean )
		.join( ' ' );
	const decoAttr = deco ? ` text-decoration="${ deco }"` : '';
	return `<text${ decoAttr } transform="translate(${ layer.x },${
		layer.y
	})" font-family="${ esc( layer.fontFamily || 'Inter' ) }" font-size="${ r2(
		rows[ 0 ]?.size || 16
	) }" font-weight="${ layer.weight || 400 }"${
		layer.italic ? ' font-style="italic"' : ''
	} text-anchor="middle" ${ textPaintToSvg(
		layer,
		defs
	) }>${ tspans }</text>`;
}

function gradientToSvg( layer, defs ) {
	const w = geoNum( layer.w ),
		h = geoNum( layer.h );
	const transform = `translate(${ geoNum( layer.x + layer.w / 2 ) } ${ geoNum(
		layer.y + layer.h / 2
	) }) rotate(${ geoNum( layer.rot || 0 ) }) scale(${
		layer.flipX ? -1 : 1
	} ${ layer.flipY ? -1 : 1 }) translate(${ geoNum(
		-layer.w / 2
	) } ${ geoNum( -layer.h / 2 ) })`;
	if ( [ 'freeform', 'mesh', 'angle' ].includes( layer.kind ) ) {
		const scale = Math.min(
			1,
			8192 / Math.max( layer.w, layer.h ),
			Math.sqrt( 16777216 / Math.max( 1, layer.w * layer.h ) )
		);
		const canvas = createCanvas( layer.w * scale, layer.h * scale ),
			ctx = canvas.getContext( '2d' );
		ctx.scale( canvas.width / layer.w, canvas.height / layer.h );
		drawGradient( ctx, layer );
		defs.warnings.push(
			sprintf(
				/* translators: %s: layer name. */ __(
					'The gradient "%s" is embedded as an image in SVG. Its points remain editable in the project.',
					'wunderpaint'
				),
				layer.name
			)
		);
		return `<image href="${ esc(
			canvas.toDataURL( 'image/png' )
		) }" width="${ w }" height="${ h }" transform="${ transform }" preserveAspectRatio="none"/>`;
	}
	const id = `grad-${ uid() }`;
	const stops = expandedGradientStops( layer.stops || [] )
		.map( ( s ) => {
			const c = parseColor( s.color );
			return `<stop offset="${ geoNum(
				s.at * 100
			) }%" stop-color="${ toHexColor(
				c.r,
				c.g,
				c.b
			) }" stop-opacity="${ geoNum( c.a ) }"/>`;
		} )
		.join( '' );
	const fx = ( layer.from?.x ?? layer.x ) - layer.x,
		fy = ( layer.from?.y ?? layer.y ) - layer.y;
	const tx = ( layer.to?.x ?? layer.x + layer.w ) - layer.x,
		ty = ( layer.to?.y ?? layer.y + layer.h ) - layer.y;
	const attrs = `id="${ id }" gradientUnits="userSpaceOnUse" spreadMethod="${
		[ 'repeat', 'reflect' ].includes( layer.spread ) ? layer.spread : 'pad'
	}"`;
	defs.items.push(
		layer.kind === 'radial'
			? `<radialGradient ${ attrs } cx="${ geoNum( fx ) }" cy="${ geoNum(
					fy
			  ) }" r="${ geoNum(
					Math.max( 1, Math.hypot( tx - fx, ty - fy ) )
			  ) }">${ stops }</radialGradient>`
			: `<linearGradient ${ attrs } x1="${ geoNum( fx ) }" y1="${ geoNum(
					fy
			  ) }" x2="${ geoNum( tx ) }" y2="${ geoNum(
					ty
			  ) }">${ stops }</linearGradient>`
	);
	return `<rect width="${ w }" height="${ h }" transform="${ transform }" fill="url(#${ id })"/>`;
}

/**
 * Serialize layers into a standalone SVG document.
 *
 * @param {Object} doc    Document.
 * @param {Array}  layers Full flat layer list.
 * @return {{svg: string, warnings: Array}} SVG source + warnings.
 */

export function exportSvg( doc, layers ) {
	const defs = { items: [], warnings: [] };
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );

	// `extra` is an id map for layers that are not in the document, such as
	// the expanded copies of a Repeat layer (v1.431).
	const emit = ( raw, extra = null ) => {
		// ONE place where a layer's numbers become numbers, before any
		// branch can interpolate one into an attribute.
		const layer = geoLayer( raw );
		if ( ! layer.visible ) {
			return '';
		}
		const alpha =
			1 !== ( layer.opacity ?? 1 )
				? ` opacity="${ geoNum( layer.opacity, 1 ) }"`
				: '';
		if ( 'group' === layer.type ) {
			const pool = extra || byId;
			const inner = ( layer.children || [] )
				.map( ( id ) => pool.get( id ) )
				.filter( Boolean )
				.map( ( c ) => emit( c, extra ) )
				.join( '\n' );
			return `<g${ alpha }>\n${ inner }\n</g>`;
		}
		if (
			layer.mask ||
			layer.styles ||
			'none' !== ( layer.filter || 'none' )
		) {
			defs.warnings.push(
				sprintf(
					/* translators: %s: layer name. */
					__(
						'Masks/styles/filters on "%s" are not exported.',
						'wunderpaint'
					),
					layer.name
				)
			);
		}
		let body = '';
		switch ( layer.type ) {
			case 'shape':
				body = shapeToSvg( layer, defs );
				break;
			case 'text':
				body = textToSvg( layer, defs );
				break;
			case 'gradient':
				body = gradientToSvg( layer, defs );
				break;
			case 'adjustment':
				return '';
			case 'repeat': {
				// The copies of a Repeat layer, expanded through the same
				// placements the canvas stamps (v1.431).
				const { copies } = expandRepeat( layers, layer );
				const inner = copies
					.filter(
						( c ) =>
							! c.parent ||
							! copies.some( ( o ) => o.id === c.parent )
					)
					.map( ( c ) =>
						emit( c, new Map( copies.map( ( o ) => [ o.id, o ] ) ) )
					)
					.join( '\n' );
				return inner ? `<g${ alpha }>\n${ inner }\n</g>` : '';
			}
			default: {
				// Pixel content embeds as an image.
				let href = layer.src || layer.dataUrl || '';
				if ( ! href && layer.canvas?.toDataURL ) {
					href = layer.canvas.toDataURL( 'image/png' );
				}
				if ( ! href ) {
					return '';
				}
				body = `<image href="${ esc( href ) }" x="${ geoNum(
					layer.x
				) }" y="${ layer.y }" width="${ geoNum( layer.w ) }" height="${
					layer.h
				}" preserveAspectRatio="none"/>`;
			}
		}
		return alpha && body.startsWith( '<' )
			? `<g${ alpha }>${ body }</g>`
			: body;
	};

	const body = layers
		.filter( ( l ) => ! l.parent )
		.map( emit )
		.filter( Boolean )
		.join( '\n' );
	// The document's size fields come from a project file; a string with
	// a quote in it used to land in the attribute as it was.
	const docW = Number( doc.w ) || 0;
	const docH = Number( doc.h ) || 0;
	const bg =
		doc.bg && 'transparent' !== doc.bg
			? `<rect width="${ docW }" height="${ docH }" fill="${ esc(
					doc.bg
			  ) }"/>\n`
			: '';
	const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${ docW }" height="${ docH }" viewBox="0 0 ${ docW } ${ docH }">\n${
		defs.items.length ? `<defs>${ defs.items.join( '' ) }</defs>\n` : ''
	}${ bg }${ body }\n</svg>\n`;
	return { svg, warnings: defs.warnings };
}
