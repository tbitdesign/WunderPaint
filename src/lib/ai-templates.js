/**
 * AI-generated library items (v1.31): send a short description to Claude
 * (server-side Anthropic proxy, the key never reaches the browser) and get
 * back gradient presets, text lockups or vector elements. This module
 * validates the model's JSON, builds preview strings for the dialog, and
 * inserts a chosen item onto the canvas.
 */

import { __ } from '@wordpress/i18n';

import {
	makeGradient,
	makeText,
	makeShape,
	makeGroup,
} from '../store/document';
import { scalePathD as scaleElementPath } from './path';
import { ALL_FONT_FAMILIES } from './font-manager';
import { ai } from './api';

export const TEMPLATE_FONTS = [
	'Inter',
	'Playfair Display',
	'DM Serif Display',
	'Bebas Neue',
	'Anton',
	'Archivo',
	'Barlow Condensed',
	'Bitter',
	'Montserrat',
	'Lora',
	'Oswald',
	'Poppins',
];

const isHex = ( c ) =>
	'string' === typeof c &&
	/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test( c.trim() );
const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const num = ( v, fallback ) => ( Number.isFinite( +v ) ? +v : fallback );

/* --------------------------------- validate -------------------------------- */

function cleanGradient( item ) {
	const kind = 'radial' === item?.kind ? 'radial' : 'linear';
	let stops = Array.isArray( item?.stops ) ? item.stops : [];
	stops = stops
		.filter( ( s ) => isHex( s?.color ) )
		.map( ( s ) => ( {
			color: s.color.trim(),
			at: clamp( num( s.at, 0 ), 0, 1 ),
		} ) )
		.sort( ( a, b ) => a.at - b.at );
	if ( stops.length < 2 ) {
		return null;
	}
	stops[ 0 ].at = 0;
	stops[ stops.length - 1 ].at = 1;
	return {
		name: String( item.name || __( 'Gradient', 'wunderpaint' ) ).slice(
			0,
			40
		),
		kind,
		stops,
	};
}

function cleanText( item ) {
	let lines = Array.isArray( item?.lines ) ? item.lines : [];
	lines = lines
		.filter( ( l ) => l && 'string' === typeof l.text && l.text.trim() )
		.slice( 0, 8 )
		.map( ( l ) => ( {
			text: String( l.text ).slice( 0, 120 ),
			fontSize: Math.round( clamp( num( l.fontSize, 64 ), 8, 400 ) ),
			weight: [ 400, 700, 800, 900 ].includes( +l.weight )
				? +l.weight
				: 700,
			color: isHex( l.color ) ? l.color.trim() : '#1a1d21',
			// Brand fonts (v1.90.0) may sit outside the curated template
			// list; every self-hosted family is fair game.
			fontFamily:
				TEMPLATE_FONTS.includes( l.font ) ||
				ALL_FONT_FAMILIES.includes( l.font )
					? l.font
					: 'Inter',
			align: [ 'left', 'center', 'right' ].includes( l.align )
				? l.align
				: 'center',
			italic: !! l.italic,
			letterSpacing: clamp( num( l.letterSpacing, 0 ), -5, 40 ),
		} ) );
	if ( ! lines.length ) {
		return null;
	}
	return {
		name: String( item.name || lines[ 0 ].text ).slice( 0, 40 ),
		lines,
	};
}

function cleanElement( item ) {
	const d = String( item?.pathD || '' ).trim();
	// A plausible SVG path: starts with a move and holds only path grammar.
	if (
		! /^[Mm][\s\d.,-]/.test( d ) ||
		! /^[MmLlHhVvCcSsQqTtAaZz\s\d.,-]+$/.test( d )
	) {
		return null;
	}
	return {
		name: String( item?.name || __( 'Element', 'wunderpaint' ) ).slice(
			0,
			40
		),
		pathD: d,
	};
}

const CLEANERS = {
	gradient: cleanGradient,
	text: cleanText,
	element: cleanElement,
};

/* --------------------------------- generate -------------------------------- */

/**
 * The brand payload for kit-aware generations (v1.90.0): palette, house
 * fonts and a compact company profile. `tone` picks up a matching custom
 * variable when the kit has one.
 *
 * @param {?Object} kit Brand kit from window.WPIE.brandKits.
 * @return {?Object} Brand payload or null.
 */
export function kitBrandContext( kit ) {
	if ( ! kit ) {
		return null;
	}
	const tone = ( kit.vars || [] ).find( ( v ) =>
		[ 'tonalitaet', 'tone', 'tonality' ].includes( v.key )
	);
	return {
		colors: kit.colors || [],
		fonts: kit.fonts || [],
		company: kit.company || '',
		industry: kit.industry || '',
		description: kit.description || '',
		tone: tone?.value || '',
	};
}

/**
 * Ask Claude for `n` library items of `kind` from a description.
 *
 * @param {Object}  opts        Options.
 * @param {string}  opts.kind   'gradient' | 'text' | 'element'.
 * @param {string}  opts.prompt Free-text description.
 * @param {string}  opts.text   Optional exact wording (text kind).
 * @param {number}  opts.n      How many items to request.
 * @param {?Object} opts.brand  Brand payload from kitBrandContext().
 * @return {Promise<{kind:string, items:Array}>} Validated items (may be fewer
 *   than requested if some failed validation).
 */
export async function generateTemplates( {
	kind,
	prompt,
	text,
	n = 4,
	brand,
} ) {
	const res = await ai.template( {
		kind,
		prompt,
		text,
		n,
		brand: brand ? JSON.stringify( brand ) : undefined,
	} );
	const cleaner = CLEANERS[ kind ] || CLEANERS.gradient;
	const items = ( res?.items || [] )
		.map( ( it ) => cleaner( it ) )
		.filter( Boolean );
	if ( ! items.length ) {
		throw new Error(
			__(
				'The AI response could not be used. Please try again.',
				'wunderpaint'
			)
		);
	}
	return { kind: res.kind || kind, items };
}

/**
 * One colorful AI vector illustration (v1.71): the text model writes an
 * SVG, the SVG importer turns it into editable shape layers. Returns
 * { layers, width, height, warnings } ready for placeSvgLayers().
 *
 * @param {Object}  opts        Options.
 * @param {string}  opts.prompt Description of the illustration.
 * @param {?Object} opts.brand  Brand payload from kitBrandContext().
 * @return {Promise<Object>} Parsed illustration.
 */
export async function generateIllustration( { prompt, brand } ) {
	const res = await ai.svg( {
		prompt,
		brand: brand ? JSON.stringify( brand ) : undefined,
	} );
	const { importSvg } = await import(
		/* webpackChunkName: "svg-io" */ './svg-io'
	);
	const parsed = importSvg( String( res?.svg || '' ) );
	if ( ! parsed.layers.length ) {
		throw new Error(
			__(
				'The AI response could not be used. Please try again.',
				'wunderpaint'
			)
		);
	}
	return parsed;
}

/* --------------------------------- previews -------------------------------- */

/** A CSS gradient string for a preview swatch. */
export function gradientCss( item ) {
	const stops = item.stops
		.map( ( s ) => `${ s.color } ${ Math.round( s.at * 100 ) }%` )
		.join( ', ' );
	return 'radial' === item.kind
		? `radial-gradient(circle at 50% 50%, ${ stops })`
		: `linear-gradient(135deg, ${ stops })`;
}

/** An inline SVG markup string for an element preview. */
export function elementSvg( item, color = 'currentColor' ) {
	// This string is injected via dangerouslySetInnerHTML, so both values are
	// constrained to shapes that cannot break out of their attribute: pathD
	// keeps only valid SVG path-data characters, fill only a colour literal.
	const d = String( item?.pathD || '' ).replace(
		/[^-0-9eE.,+\s MLHVCSQTAZmlhvcsqtaz]/g,
		''
	);
	const fill = /^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+|rgba?\([0-9.,%\s/]+\))$/.test(
		String( color )
	)
		? color
		: 'currentColor';
	return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><path d="${ d }" fill="${ fill }"/></svg>`;
}

/* --------------------------------- insert ---------------------------------- */

function insertGradient( editor, item ) {
	const { doc } = editor.state;
	const layer = makeGradient( {
		name: item.name,
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		kind: item.kind,
		stops: item.stops,
		from: { x: 0, y: 0 },
		to:
			'radial' === item.kind
				? { x: doc.w / 2, y: doc.h / 2 }
				: { x: doc.w, y: doc.h },
	} );
	editor.dispatch( { type: 'ADD_LAYER', layer, index: 0 } );
	editor.commit( __( 'Insert Gradient', 'wunderpaint' ) );
}

function insertText( editor, item ) {
	const { doc } = editor.state;
	// The model designs for a ~1080px-tall reference canvas; scale to this one.
	const k = ( doc.h || 1080 ) / 1080;
	const gap = 1.22;
	const sized = item.lines.map( ( l ) => ( {
		...l,
		fs: Math.max( 8, Math.round( l.fontSize * k ) ),
		ls: Math.round( ( l.letterSpacing || 0 ) * k ),
	} ) );
	const total = sized.reduce( ( a, l ) => a + l.fs * gap, 0 );
	const boxW = Math.round( doc.w * 0.86 );
	const x = Math.round( ( doc.w - boxW ) / 2 );
	let y = Math.round( ( doc.h - total ) / 2 );
	// Insert the lines as one group so the lockup moves as a whole.
	const group = makeGroup( { name: item.name } );
	editor.dispatch( { type: 'ADD_LAYER', layer: group } );
	for ( const l of sized ) {
		const h = Math.round( l.fs * gap );
		const layer = makeText( {
			name: l.text.slice( 0, 30 ),
			text: l.text,
			x,
			y,
			w: boxW,
			h,
			fontSize: l.fs,
			weight: l.weight,
			color: l.color,
			fontFamily: l.fontFamily,
			align: l.align,
			italic: l.italic,
			letterSpacing: l.ls,
			fixedWidth: true,
		} );
		layer.parent = group.id;
		editor.dispatch( { type: 'ADD_LAYER', layer } );
		y += h;
	}
	editor.dispatch( { type: 'SET_ACTIVE', id: group.id } );
	editor.commit( __( 'Insert Text', 'wunderpaint' ) );
}

function insertElement( editor, item ) {
	const { doc, fgColor } = editor.state;
	const size = Math.round( Math.min( doc.w, doc.h ) * 0.3 );
	editor.dispatch( {
		type: 'ADD_LAYER',
		layer: makeShape( {
			name: item.name,
			x: Math.round( ( doc.w - size ) / 2 ),
			y: Math.round( ( doc.h - size ) / 2 ),
			w: size,
			h: size,
			fill: fgColor || '#3b66ff',
			shape: 'rect',
			pathD: scaleElementPath( item.pathD, size / 100, size / 100 ),
		} ),
	} );
	editor.commit( __( 'Insert Element', 'wunderpaint' ) );
}

/**
 * Insert a validated AI item of the given kind onto the canvas.
 *
 * @param {Object} editor Editor context.
 * @param {string} kind   'gradient' | 'text' | 'element'.
 * @param {Object} item   Validated item.
 */
export function insertTemplateItem( editor, kind, item ) {
	if ( 'gradient' === kind ) {
		insertGradient( editor, item );
	} else if ( 'text' === kind ) {
		insertText( editor, item );
	} else if ( 'element' === kind ) {
		insertElement( editor, item );
	}
	// Switch to Move so the freshly inserted item can be positioned at once.
	editor.dispatch( { type: 'SET_TOOL', tool: 'move' } );
}
