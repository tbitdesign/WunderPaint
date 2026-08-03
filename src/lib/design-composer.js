/**
 * Design Assistant 2.0 composer (v1.170.0): "the LLM plans, code
 * perfects". The model delivers a SEMANTIC plan (style profile, mood,
 * palette intent, copy, a layout archetype) and this module turns it
 * into precise layers. The typography is owned entirely by code: each
 * style profile maps to curated font recipes, the headline is sized to
 * fit its region via real text measurement, and eyebrow / headline /
 * subhead / CTA flow as ONE vertical stack with consistent rhythm.
 * Palettes are curated per intent (never derived hue math), buttons
 * and badges size themselves to their labels. The finisher
 * (design-finisher.js) then runs contrast/effect passes.
 *
 * NOT ON THE RUNTIME PATH. The live design route is design-dialog ->
 * prepareDesignVariants -> design-ir / design-recipes. The only production
 * import from here is resolvePalette(); composeDesign() and everything it
 * pulls in is reachable from the tests only, and webpack tree-shakes it out
 * of the bundle (verified 2026-07-25 - no string unique to this file
 * survives into build/index.js). Kept because it still encodes the layout
 * thinking, but do not read it as a description of what the editor does.
 */

import { __, sprintf } from '@wordpress/i18n';

import {
	makeText,
	makeShape,
	makeGradient,
	makeGroup,
} from '../store/document';
import { schemeRoles, labelColorFor } from './color-scheme';
import { measureTextWidth, measureTextHeight } from './raster';
import { nearestWeight } from './font-manager';
import { emphasizeHeadline, flairLayers } from './design-flair';

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
const isHex = ( c ) =>
	'string' === typeof c && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test( c );

/** rgba() of a 6-digit hex at the given alpha (muted text tones). */
const rgbaOf = ( hex, a ) => {
	const m = /^#([0-9a-f]{6})/i.exec( hex || '' );
	if ( ! m ) {
		return hex;
	}
	const n = parseInt( m[ 1 ], 16 );

	return `rgba(${ ( n >> 16 ) & 255 },${ ( n >> 8 ) & 255 },${
		n & 255
	},${ a })`;
};

export const STYLE_PROFILES = [ 'bold', 'editorial', 'corporate', 'playful' ];
export const LAYOUTS = [ 'hero-left', 'centered', 'split-diagonal', 'card' ];
export const PALETTE_INTENTS = [
	'warm',
	'cool',
	'earthy',
	'vibrant',
	'pastel',
	'dark',
];

// Which style profiles fit a mood - the model picks ONE styleProfile,
// but the three variants explore mood-compatible neighbours so each is a
// distinct art direction (different fonts, decor, energy), still on brief.
const MOOD_PROFILES = {
	'mood-cool': [ 'corporate', 'editorial', 'bold' ],
	'mood-professional': [ 'corporate', 'editorial' ],
	'mood-romantic': [ 'editorial', 'playful' ],
	'mood-cute': [ 'playful', 'bold' ],
	'mood-cozy': [ 'editorial', 'bold', 'playful' ],
	'mood-dramatic': [ 'bold', 'editorial' ],
	'mood-playful': [ 'playful', 'bold' ],
	'mood-luxurious': [ 'editorial', 'corporate' ],
	'mood-fresh': [ 'bold', 'corporate', 'playful' ],
	'mood-moody': [ 'editorial', 'bold' ],
	'mood-energetic': [ 'bold', 'playful' ],
	'mood-calm': [ 'editorial', 'corporate' ],
};

const uniq = ( arr ) => [ ...new Set( arr ) ];
const rotate = ( arr, by ) => {
	const n = arr.length;
	const k = ( ( by % n ) + n ) % n;
	return [ ...arr.slice( k ), ...arr.slice( 0, k ) ];
};

/**
 * Distinct style profiles for `count` variants: the model's pick and its
 * mood-compatible neighbours first, then the rest as fallback, rotated by
 * the roll so re-generating explores different directions.
 *
 * @param {Object} spec Semantic spec ({ styleProfile, mood }).
 * @param {number} count Variant count.
 * @param {number} roll  Roll seed (a fresh integer per Create click).
 * @return {Array<string>} Distinct profiles, length `count`.
 */
export function variantProfiles( spec, count, roll = 0 ) {
	const primary = STYLE_PROFILES.includes( spec?.styleProfile )
		? spec.styleProfile
		: 'bold';
	const relevant = uniq( [
		primary,
		...( MOOD_PROFILES[ spec?.mood ] || [] ),
	] );
	const pool = uniq( [ ...relevant, ...STYLE_PROFILES ] );
	// Rotate within the on-brief head when it is large enough, else across
	// the whole pool - either way three distinct, mostly-relevant profiles.
	const span = Math.max( count, relevant.length );
	const head = rotate( pool.slice( 0, span ), roll );
	return uniq( [ ...head, ...pool ] ).slice( 0, count );
}

/**
 * Distinct layouts for `count` variants, led by the model's choice and
 * rotated by the roll.
 *
 * @param {Object} spec  Semantic spec ({ layout }).
 * @param {number} count Variant count.
 * @param {number} roll  Roll seed.
 * @return {Array<string>} Distinct layouts, length `count`.
 */
export function variantLayouts( spec, count, roll = 0 ) {
	const start = Math.max( 0, LAYOUTS.indexOf( spec?.layout ) );
	return rotate( LAYOUTS, start + roll ).slice( 0, count );
}

/* ------------------------------- palettes ------------------------------- */

// Curated palettes per intent (bg, surface, ink, accent). Derived hue
// math produced garish combinations - these are hand-picked. Six per
// intent so a fresh roll draws a genuinely different color subset each
// time (three variants never exhaust the set).
const PALETTES = {
	warm: [
		{
			bg: '#fff6ee',
			surface: '#ffe7d2',
			ink: '#33221a',
			accent: '#e8590c',
		},
		{
			bg: '#2b1a12',
			surface: '#3a2418',
			ink: '#ffefe2',
			accent: '#ff9350',
		},
		{
			bg: '#f9ecdf',
			surface: '#f2dcc3',
			ink: '#4a2c1a',
			accent: '#c2410c',
		},
		{
			bg: '#3a1e14',
			surface: '#4d2a1c',
			ink: '#ffe9d6',
			accent: '#f97316',
		},
		{
			bg: '#fdf2e9',
			surface: '#f7dfc6',
			ink: '#5a2c12',
			accent: '#dc2626',
		},
		{
			bg: '#f4ede3',
			surface: '#e6d5bf',
			ink: '#43301f',
			accent: '#b45309',
		},
	],
	cool: [
		{
			bg: '#f2f5fc',
			surface: '#e1e9f8',
			ink: '#16233f',
			accent: '#3b66ff',
		},
		{
			bg: '#101b30',
			surface: '#1a2946',
			ink: '#e9efff',
			accent: '#5b8cff',
		},
		{
			bg: '#e9f1f4',
			surface: '#d6e6ec',
			ink: '#0f3038',
			accent: '#0e7490',
		},
		{
			bg: '#0a2540',
			surface: '#123a5e',
			ink: '#e8f2ff',
			accent: '#38bdf8',
		},
		{
			bg: '#eef4ff',
			surface: '#dbe6fb',
			ink: '#1e293b',
			accent: '#4f46e5',
		},
		{
			bg: '#0f172a',
			surface: '#1e293b',
			ink: '#f1f5f9',
			accent: '#2dd4bf',
		},
	],
	earthy: [
		{
			bg: '#f7f3ea',
			surface: '#ece3d0',
			ink: '#3c3325',
			accent: '#8a6d3b',
		},
		{
			bg: '#2e2a22',
			surface: '#3b352a',
			ink: '#f3ede1',
			accent: '#c9a35c',
		},
		{
			bg: '#eef0e6',
			surface: '#dde3cd',
			ink: '#2f3b2a',
			accent: '#5f7a4e',
		},
		{
			bg: '#3a3226',
			surface: '#4a4032',
			ink: '#f2ead9',
			accent: '#d8a24a',
		},
		{
			bg: '#faf6ee',
			surface: '#ece0c9',
			ink: '#443b28',
			accent: '#7c6f2b',
		},
		{
			bg: '#efe9db',
			surface: '#ddd2ba',
			ink: '#3d3524',
			accent: '#a3702f',
		},
	],
	vibrant: [
		{
			bg: '#1c0a28',
			surface: '#2c1240',
			ink: '#fdeffa',
			accent: '#e6007e',
		},
		{
			bg: '#fff0f6',
			surface: '#ffdcec',
			ink: '#4a0e30',
			accent: '#d6006f',
		},
		{
			bg: '#0d1330',
			surface: '#1a2148',
			ink: '#eef1ff',
			accent: '#22d3ee',
		},
		{
			bg: '#0b1020',
			surface: '#171f3a',
			ink: '#eef2ff',
			accent: '#f43f5e',
		},
		{
			bg: '#fef2f7',
			surface: '#fcd9e8',
			ink: '#3d0a24',
			accent: '#7c3aed',
		},
		{
			bg: '#12002e',
			surface: '#22084a',
			ink: '#f3e8ff',
			accent: '#a855f7',
		},
	],
	pastel: [
		{
			bg: '#fdf6f0',
			surface: '#f6e6d9',
			ink: '#5b4a45',
			accent: '#d97b95',
		},
		{
			bg: '#eef3f8',
			surface: '#dce8f2',
			ink: '#44515f',
			accent: '#7fa7d4',
		},
		{
			bg: '#f2f4ec',
			surface: '#e2e8d6',
			ink: '#4a5442',
			accent: '#8fae72',
		},
		{
			bg: '#fbf3f7',
			surface: '#f3dde9',
			ink: '#5a4450',
			accent: '#c084ac',
		},
		{
			bg: '#eef6f3',
			surface: '#d6e9e1',
			ink: '#3f5049',
			accent: '#5eaa8e',
		},
		{
			bg: '#f6f2fb',
			surface: '#e6dcf3',
			ink: '#4a4256',
			accent: '#9d8bd0',
		},
	],
	dark: [
		{
			bg: '#101216',
			surface: '#1b1f27',
			ink: '#f2f4f8',
			accent: '#d9a441',
		},
		{
			bg: '#0c1220',
			surface: '#141d33',
			ink: '#e8eefc',
			accent: '#4c8dff',
		},
		{
			bg: '#16121a',
			surface: '#241d2b',
			ink: '#f4eef8',
			accent: '#e0447c',
		},
		{
			bg: '#0d0f14',
			surface: '#191c24',
			ink: '#eef1f6',
			accent: '#f97316',
		},
		{
			bg: '#111318',
			surface: '#20242e',
			ink: '#eef2f8',
			accent: '#34d399',
		},
		{
			bg: '#14101c',
			surface: '#221a30',
			ink: '#f2ecfa',
			accent: '#818cf8',
		},
	],
};

/**
 * Resolve the working palette: brand-kit colors win (mapped to roles),
 * otherwise a curated palette for the intent. Returns semantic roles.
 *
 * @param {Object} spec  Semantic spec ({ palette }).
 * @param {Object} brand Brand kit ({ colors }) or null.
 * @param {number} seed  Variant seed (rotates palette/accent).
 * @return {Object} { bg, surface, ink, accent, onAccent, muted }.
 */
export function resolvePalette( spec, brand, seed = 0 ) {
	const brandColors = ( brand?.colors || [] ).filter( isHex );
	let roles;
	if ( 'brand' === spec?.palette?.mode && brandColors.length >= 3 ) {
		const r = schemeRoles( brandColors );
		let accent = r.primary;
		// Variants rotate the accent between primary/secondary for variety.
		if ( seed % 2 && r.secondary && r.secondary !== accent ) {
			accent = r.secondary;
		}
		roles = { bg: r.bg, surface: r.surface, ink: r.text, accent };
	} else {
		const intent = PALETTE_INTENTS.includes( spec?.palette?.intent )
			? spec.palette.intent
			: 'cool';
		const list = PALETTES[ intent ];
		roles = { ...list[ Math.abs( seed ) % list.length ] };
	}
	if ( isHex( spec?.palette?.accent ) ) {
		roles.accent = spec.palette.accent;
	}
	return {
		...roles,
		onAccent: labelColorFor( roles.accent ),
		muted: rgbaOf( roles.ink, 0.72 ),
	};
}

/* ----------------------------- type recipes ----------------------------- */

// Curated font recipes per style profile; FOUR per profile so a variant
// draws a genuinely different typographic flavor. `factor` scales the
// headline off min(w,h), `track` is letter-spacing as a fraction of the
// font size, `eyebrow`/`sub` override the supporting families.
const TYPE_RECIPES = {
	bold: [
		{
			headline: { fontFamily: 'Archivo', weight: 800, lineHeight: 1.04 },
			upper: true,
			factor: 0.105,
			pill: true,
		},
		{
			headline: {
				fontFamily: 'Bebas Neue',
				weight: 400,
				lineHeight: 1.0,
				track: 0.015,
			},
			upper: true,
			factor: 0.125,
			pill: true,
		},
		{
			headline: { fontFamily: 'Anton', weight: 400, lineHeight: 1.02 },
			upper: true,
			factor: 0.115,
			pill: true,
		},
		{
			headline: { fontFamily: 'Archivo', weight: 900, lineHeight: 1.02 },
			factor: 0.1,
			pill: false,
		},
	],
	editorial: [
		{
			headline: {
				fontFamily: 'Playfair Display',
				weight: 700,
				lineHeight: 1.12,
			},
			factor: 0.088,
			bar: true,
		},
		{
			headline: {
				fontFamily: 'DM Serif Display',
				weight: 400,
				lineHeight: 1.1,
			},
			factor: 0.092,
			bar: true,
		},
		{
			headline: {
				fontFamily: 'Cormorant Garamond',
				weight: 700,
				lineHeight: 1.08,
			},
			factor: 0.108,
			bar: true,
		},
		{
			headline: {
				fontFamily: 'Abril Fatface',
				weight: 400,
				lineHeight: 1.06,
			},
			factor: 0.096,
			bar: true,
		},
	],
	corporate: [
		{
			headline: { fontFamily: 'Archivo', weight: 700, lineHeight: 1.08 },
			factor: 0.088,
			bar: true,
		},
		{
			headline: { fontFamily: 'Inter', weight: 800, lineHeight: 1.08 },
			factor: 0.084,
			bar: true,
		},
		{
			headline: { fontFamily: 'Sora', weight: 700, lineHeight: 1.08 },
			factor: 0.084,
			bar: true,
		},
		{
			headline: {
				fontFamily: 'Space Grotesk',
				weight: 700,
				lineHeight: 1.06,
			},
			factor: 0.086,
			bar: true,
		},
	],
	playful: [
		{
			headline: { fontFamily: 'Anton', weight: 400, lineHeight: 1.06 },
			upper: true,
			factor: 0.1,
			pill: true,
		},
		{
			headline: { fontFamily: 'Archivo', weight: 800, lineHeight: 1.05 },
			factor: 0.095,
			pill: true,
		},
		{
			headline: {
				fontFamily: 'Barlow Condensed',
				weight: 700,
				lineHeight: 1.0,
			},
			upper: true,
			factor: 0.12,
			pill: true,
		},
		{
			headline: { fontFamily: 'Fredoka', weight: 600, lineHeight: 1.05 },
			factor: 0.092,
			pill: true,
		},
	],
};

// Families the composer may use - the assistant preloads these before
// composing so text measurement sees the real fonts, not a fallback.
export const DESIGN_FONTS = [
	{ fontFamily: 'Archivo', weight: 700 },
	{ fontFamily: 'Archivo', weight: 800 },
	{ fontFamily: 'Archivo', weight: 900 },
	{ fontFamily: 'Bebas Neue', weight: 400 },
	{ fontFamily: 'Anton', weight: 400 },
	{ fontFamily: 'Playfair Display', weight: 700 },
	{ fontFamily: 'DM Serif Display', weight: 400 },
	{ fontFamily: 'Cormorant Garamond', weight: 700 },
	{ fontFamily: 'Abril Fatface', weight: 400 },
	{ fontFamily: 'Sora', weight: 700 },
	{ fontFamily: 'Space Grotesk', weight: 700 },
	{ fontFamily: 'Barlow Condensed', weight: 700 },
	{ fontFamily: 'Fredoka', weight: 600 },
	{ fontFamily: 'Inter', weight: 400 },
	{ fontFamily: 'Inter', weight: 700 },
	{ fontFamily: 'Inter', weight: 800 },
];

/** Probe layers for ensureFontsForLayers (font preload before measure). */
export const designFontProbes = () =>
	DESIGN_FONTS.map( ( f ) => ( { type: 'text', text: 'Ag', ...f } ) );

/* ------------------------------ components ------------------------------ */

/** Rounded CTA button: the shape hugs its measured label. */
export function buttonComponent( label, palette, docMin, opts = {} ) {
	const h = clamp( Math.round( docMin * 0.072 ), 44, 112 );
	let fontSize = Math.round( h * 0.36 );
	// The arrow affordance is part of the label (still one text layer,
	// trivially editable); Archivo/Inter both cover U+2192.
	const labelText = false === opts.arrow ? label : `${ label }  →`;
	const family = opts.body || 'Archivo';
	const probe = {
		text: labelText,
		fontSize,
		fontFamily: family,
		weight: 700,
	};
	let labelW = measureTextWidth( probe );
	const maxW = opts.maxW || docMin;
	// Long labels shrink instead of overflowing their region.
	if ( labelW + h * 1.2 > maxW ) {
		fontSize = Math.max(
			12,
			Math.floor( ( fontSize * ( maxW - h * 1.2 ) ) / labelW )
		);
		labelW = measureTextWidth( { ...probe, fontSize } );
	}
	const w = Math.round( Math.min( maxW, labelW + h * 1.3 ) );
	const region = { x: opts.x || 0, y: opts.y || 0, w, h };
	const group = makeGroup( {
		name: sprintf(
			/* translators: %s: button label. */
			__( 'Button: %s', 'wunderpaint' ),
			label
		),
	} );
	const shape = makeShape( {
		name: __( 'Button', 'wunderpaint' ),
		...region,
		shape: 'rect',
		fill: palette.accent,
		radius: opts.pill ? Math.round( h / 2 ) : Math.round( h * 0.22 ),
	} );
	const text = makeText( {
		name: label.slice( 0, 30 ),
		text: labelText,
		...region,
		fontSize,
		color: palette.onAccent,
		fontFamily: family,
		weight: 700,
		align: 'center',
		valign: 'middle',
		fixedWidth: true,
	} );
	shape.parent = group.id;
	text.parent = group.id;
	// Group FIRST and double-linked: the raw array renders directly in
	// previews (the renderer walks group.children), and the store's
	// ADD_LAYER can only register children on groups that already exist.
	group.children = [ shape.id, text.id ];
	return { layers: [ group, shape, text ], w, h };
}

/** Small badge chip sized to its label, e.g. "-20%" or "LIVE". */
export function badgeComponent( label, palette, docMin, opts = {} ) {
	const h = clamp( Math.round( docMin * 0.045 ), 26, 64 );
	const fontSize = Math.round( h * 0.42 );
	const ls = Math.round( fontSize * 0.06 );
	const family = opts.body || 'Inter';
	const labelW = measureTextWidth( {
		text: label,
		fontSize,
		fontFamily: family,
		weight: 700,
		letterSpacing: ls,
	} );
	const w = Math.round( labelW + h * 1.05 );
	const region = { x: 0, y: 0, w, h };
	const group = makeGroup( { name: __( 'Badge', 'wunderpaint' ) } );
	const shape = makeShape( {
		name: __( 'Badge', 'wunderpaint' ),
		...region,
		shape: 'rect',
		fill: palette.accent,
		radius: Math.round( h / 2 ),
	} );
	const text = makeText( {
		name: label.slice( 0, 20 ),
		text: label,
		...region,
		fontSize,
		color: palette.onAccent,
		fontFamily: family,
		weight: 700,
		align: 'center',
		valign: 'middle',
		letterSpacing: ls,
		fixedWidth: true,
	} );
	if ( opts.tilt ) {
		// Sticker lean: shape and label share the same box, so the same
		// angle keeps them glued together.
		shape.rot = opts.tilt;
		text.rot = opts.tilt;
	}
	shape.parent = group.id;
	text.parent = group.id;
	group.children = [ shape.id, text.id ];
	return { layers: [ group, shape, text ], w, h };
}

/** Readability scrim: a linear gradient from dark to transparent. */
export function scrimLayer( region, direction = 'up', strength = 0.6 ) {
	const a = Math.round( clamp( strength, 0, 1 ) * 255 )
		.toString( 16 )
		.padStart( 2, '0' );
	const vertical = 'up' === direction || 'down' === direction;
	const from =
		'up' === direction
			? { x: region.x, y: region.y + region.h }
			: 'down' === direction
			? { x: region.x, y: region.y }
			: 'right' === direction
			? { x: region.x, y: region.y }
			: { x: region.x + region.w, y: region.y };
	const to = vertical
		? {
				x: region.x,
				y: 'up' === direction ? region.y : region.y + region.h,
		  }
		: {
				x: 'right' === direction ? region.x + region.w : region.x,
				y: region.y,
		  };
	const layer = makeGradient( {
		x: region.x,
		y: region.y,
		w: region.w,
		h: region.h,
		kind: 'linear',
		from,
		to,
		stops: [
			{ color: `#000000${ a }`, at: 0 },
			{ color: '#00000000', at: 1 },
		],
	} );
	layer.name = __( 'Scrim', 'wunderpaint' );
	return layer;
}

/** Diagonal divider as a vector path across the canvas. */
export function diagonalDivider( doc, palette, lower = true ) {
	const h = Math.round( doc.h * 0.14 );
	const y = lower ? doc.h - h : 0;
	const d = lower
		? `M 0 ${ h } L ${ doc.w } 0 L ${ doc.w } ${ h } Z`
		: `M 0 0 L ${ doc.w } 0 L 0 ${ h } Z`;
	const layer = makeShape( {
		name: __( 'Diagonal', 'wunderpaint' ),
		x: 0,
		y,
		w: doc.w,
		h,
		pathD: d,
		fill: palette.accent,
	} );
	layer.opacity = 0.96;
	return layer;
}

/* ------------------------------ text stack ------------------------------ */

/**
 * Fit the headline into the region: as large as the budget allows while
 * the longest word fits the width and the wrapped block stays within
 * three lines / the region share. Real canvas measurement.
 */
function fitHeadline( text, recipe, region, docMin ) {
	const style = recipe.headline;
	const target = Math.round( docMin * recipe.factor );
	const min = Math.max( 14, Math.round( target * 0.42 ) );
	const longest = text
		.split( /\s+/ )
		.reduce( ( a, b ) => ( b.length > a.length ? b : a ), '' );
	const fits = ( size ) => {
		const ls = Math.round( size * ( style.track || 0 ) );
		if (
			measureTextWidth( {
				text: longest,
				fontSize: size,
				fontFamily: style.fontFamily,
				weight: style.weight,
				letterSpacing: ls,
			} ) >
			region.w * 0.98
		) {
			return false;
		}
		const blockH = measureTextHeight( {
			text,
			fontSize: size,
			fontFamily: style.fontFamily,
			weight: style.weight,
			letterSpacing: ls,
			lineHeight: style.lineHeight,
			w: region.w,
			fixedWidth: true,
		} );
		const maxLines = 3;
		return (
			blockH <= size * style.lineHeight * ( maxLines + 0.45 ) &&
			blockH <= region.h * 0.62
		);
	};
	let lo = min;
	let hi = Math.max( min, target );
	let best = min;
	while ( lo <= hi ) {
		const mid = Math.floor( ( lo + hi ) / 2 );
		if ( fits( mid ) ) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best;
}

/**
 * Build the full content stack - badge chip, eyebrow, headline, subhead,
 * CTA button - as one vertical flow with consistent rhythm, aligned and
 * anchored into the region. Texts form a group; button/badge get their
 * own groups (sized to their labels).
 *
 * @param {Object} spec    Semantic spec ({ copy }).
 * @param {Object} region  Target rect.
 * @param {Object} palette Palette (ink/muted may be overridden for photos).
 * @param {Object} recipe  Type recipe.
 * @param {Object} opts    { docMin, align, anchor, badgeInStack }.
 * @return {Array} Layers (groups first, double-linked).
 */
export function contentStack( spec, region, palette, recipe, opts ) {
	const { docMin, align = 'left', anchor = 'middle' } = opts;
	const copy = spec?.copy || {};
	const eyebrow = String( copy.eyebrow || '' ).trim();
	let headline = String( copy.headline || '' ).trim();
	const subhead = String( copy.subhead || '' ).trim();
	const cta = String( copy.cta || '' ).trim();
	const badge = opts.badgeInStack ? String( copy.badge || '' ).trim() : '';
	if ( recipe.upper ) {
		headline = headline.toUpperCase();
	}

	const headSize = headline
		? fitHeadline( headline, recipe, region, docMin )
		: Math.round( docMin * 0.06 );
	const parts = []; // { layer(s), h, gapAfter }
	const gap = ( f ) => Math.round( headSize * f );

	// Brand body font for supporting text, or the neutral default.
	const bodyFont = opts.body || 'Inter';

	let badgeBuilt = null;
	if ( badge ) {
		badgeBuilt = badgeComponent( badge, palette, docMin, {
			tilt: opts.badgeTilt || 0,
			body: opts.body,
		} );
		parts.push( {
			badge: badgeBuilt,
			h: badgeBuilt.h,
			gapAfter: gap( 0.62 ),
		} );
	}
	if ( recipe.bar && ! badge && 'left' === align ) {
		const barH = Math.max( 4, Math.round( docMin * 0.008 ) );
		const bar = makeShape( {
			name: __( 'Divider', 'wunderpaint' ),
			x: region.x,
			y: 0,
			w: Math.round( docMin * 0.06 ),
			h: barH,
			fill: palette.accent,
		} );
		parts.push( { layer: bar, h: barH, gapAfter: gap( 0.55 ) } );
	}
	if ( eyebrow ) {
		const size = clamp( Math.round( docMin * 0.023 ), 12, 40 );
		const layer = makeText( {
			name: eyebrow.slice( 0, 40 ),
			text: eyebrow.toUpperCase(),
			x: region.x,
			y: 0,
			w: region.w,
			h: Math.round( size * 1.5 ),
			fontSize: size,
			color: palette.eyebrow || palette.accent,
			fontFamily: bodyFont,
			weight: 700,
			letterSpacing: Math.round( size * 0.18 ),
			lineHeight: 1.2,
			align,
			fixedWidth: true,
		} );
		layer.h = measureTextHeight( layer ) + 2;
		parts.push( { layer, h: layer.h, gapAfter: gap( 0.5 ) } );
	}
	if ( headline ) {
		const style = recipe.headline;
		const layer = makeText( {
			name: headline.slice( 0, 40 ),
			text: headline,
			x: region.x,
			y: 0,
			w: region.w,
			h: headSize * 2,
			fontSize: headSize,
			color: palette.ink,
			fontFamily: style.fontFamily,
			weight: style.weight,
			letterSpacing: Math.round( headSize * ( style.track || 0 ) ),
			lineHeight: style.lineHeight,
			align,
			fixedWidth: true,
		} );
		layer.h = measureTextHeight( layer ) + Math.round( headSize * 0.08 );
		parts.push( { layer, h: layer.h, gapAfter: gap( 0.45 ) } );
	}
	if ( subhead ) {
		let size = clamp( Math.round( docMin * 0.029 ), 14, 46 );
		const make = ( s ) =>
			makeText( {
				name: subhead.slice( 0, 40 ),
				text: subhead,
				x: region.x,
				y: 0,
				w: region.w,
				h: Math.round( s * 1.6 ),
				fontSize: s,
				color: palette.muted,
				fontFamily: bodyFont,
				weight: 400,
				lineHeight: 1.38,
				align,
				fixedWidth: true,
			} );
		let layer = make( size );
		// Keep the subhead a supporting line: at most ~3 wrapped lines.
		while ( size > 14 && measureTextHeight( layer ) > size * 1.38 * 3.4 ) {
			size -= 2;
			layer = make( size );
		}
		layer.h = measureTextHeight( layer ) + 2;
		parts.push( { layer, h: layer.h, gapAfter: gap( 0.85 ) } );
	}
	let button = null;
	if ( cta ) {
		button = buttonComponent( cta, palette, docMin, {
			pill: !! recipe.pill,
			maxW: region.w,
			body: opts.body,
		} );
		parts.push( { button, h: button.h, gapAfter: 0 } );
	}
	if ( ! parts.length ) {
		return [];
	}
	parts[ parts.length - 1 ].gapAfter = 0;

	const totalH = parts.reduce( ( s, p ) => s + p.h + p.gapAfter, 0 );
	let y =
		'bottom' === anchor
			? region.y + region.h - totalH
			: region.y + Math.max( 0, ( region.h - totalH ) / 2 );
	y = Math.max( region.y, Math.round( y ) );

	const group = makeGroup( {
		name: headline ? headline.slice( 0, 30 ) : __( 'Text', 'wunderpaint' ),
	} );
	const groupKids = [];
	const out = [];
	const tail = [];
	const alignX = ( w ) =>
		'center' === align
			? Math.round( region.x + ( region.w - w ) / 2 )
			: region.x;
	for ( const part of parts ) {
		if ( part.badge ) {
			offsetLayers( part.badge.layers, alignX( part.badge.w ), y );
			tail.push( ...part.badge.layers );
		} else if ( part.button ) {
			offsetLayers( part.button.layers, alignX( part.button.w ), y );
			tail.push( ...part.button.layers );
		} else {
			part.layer.y = y;
			if ( 'shape' === part.layer.type ) {
				part.layer.x = alignX( part.layer.w );
			}
			part.layer.parent = group.id;
			groupKids.push( part.layer );
		}
		y += part.h + part.gapAfter;
	}
	if ( groupKids.length ) {
		group.children = groupKids.map( ( l ) => l.id );
		out.push( group, ...groupKids );
	}
	return [ ...out, ...tail ];
}

/** Shift a component's layers into place (groups have no own geometry). */
function offsetLayers( layers, dx, dy ) {
	for ( const l of layers ) {
		if ( 'group' !== l.type ) {
			l.x = Math.round( l.x + dx );
			l.y = Math.round( l.y + dy );
		}
	}
}

/* ------------------------------- archetypes ------------------------------ */

/**
 * Layout archetypes: pure geometry per format. Each returns the text
 * region (the stack flows inside it, CTA included), alignment/anchor,
 * where the badge lives, the image region and decor layers.
 *
 * @param {string} name    Archetype name.
 * @param {Object} doc     { w, h }.
 * @param {Object} spec    Semantic spec.
 * @param {Object} palette Palette roles.
 * @return {Object} { imageRegion, imageBackdrop, textRegion, align,
 *                    anchor, badgeInStack, badgeCorner, decor }.
 */
export function archetypeLayout( name, doc, spec, palette ) {
	const docMin = Math.min( doc.w, doc.h );
	const m = Math.round( docMin * 0.07 );
	const wantImage = !! spec?.image?.want;
	const portrait = doc.h > doc.w * 1.15;
	const out = {
		imageRegion: null,
		imageBackdrop: false,
		textRegion: null,
		align: 'left',
		anchor: 'middle',
		badgeInStack: true,
		badgeCorner: null,
		decor: [],
	};

	if ( 'hero-left' === name && ! portrait ) {
		// Text column left, image right (or a wider text column without).
		const split = wantImage ? 0.52 : 0.66;
		out.textRegion = {
			x: Math.round( m * 1.15 ),
			y: m,
			w: Math.round( doc.w * split ) - Math.round( m * 2.3 ),
			h: doc.h - m * 2,
		};
		out.imageRegion = wantImage
			? {
					x: Math.round( doc.w * split ),
					y: 0,
					w: doc.w - Math.round( doc.w * split ),
					h: doc.h,
			  }
			: null;
		// The text half gets a calm surface panel when an image splits.
		if ( wantImage ) {
			out.decor.push( () =>
				makeShape( {
					name: __( 'Panel', 'wunderpaint' ),
					x: 0,
					y: 0,
					w: Math.round( doc.w * split ),
					h: doc.h,
					fill: palette.surface,
				} )
			);
		}
		return out;
	}

	if ( 'split-diagonal' === name ) {
		out.imageBackdrop = wantImage;
		out.imageRegion = wantImage ? { x: 0, y: 0, w: doc.w, h: doc.h } : null;
		out.textRegion = {
			x: m,
			y: Math.round( doc.h * 0.34 ),
			w: Math.min( Math.round( doc.w * 0.82 ), doc.w - m * 2 ),
			h: Math.round( doc.h * 0.66 - doc.h * 0.14 - m * 0.8 ),
		};
		out.anchor = 'bottom';
		out.badgeInStack = false;
		out.badgeCorner = { x: m, y: m };
		out.decor.push( () => diagonalDivider( doc, palette, true ) );
		return out;
	}

	if ( 'card' === name ) {
		const cardW = doc.w - m * 2;
		const cardH = doc.h - m * 2;
		out.decor.push( () =>
			makeShape( {
				name: __( 'Card', 'wunderpaint' ),
				x: m,
				y: m,
				w: cardW,
				h: cardH,
				shape: 'rect',
				fill: palette.bg,
				radius: Math.round( m * 0.6 ),
			} )
		);
		const pad = Math.round( m * 0.55 );
		const imgH = wantImage ? Math.round( cardH * 0.44 ) : 0;
		out.imageRegion = wantImage
			? {
					x: m + pad,
					y: m + pad,
					w: cardW - pad * 2,
					h: imgH,
			  }
			: null;
		const innerX = m + Math.round( m * 1.05 );
		const topY = wantImage
			? m + pad + imgH + Math.round( m * 0.75 )
			: m + Math.round( m * 1.05 );
		out.textRegion = {
			x: innerX,
			y: topY,
			w: doc.w - innerX * 2,
			h: m + cardH - Math.round( m * 0.9 ) - topY,
		};
		if ( wantImage ) {
			// The chip sits on the photo, the stack stays clean.
			out.badgeInStack = false;
			out.badgeCorner = {
				x: m + pad + Math.round( m * 0.5 ),
				y: m + pad + Math.round( m * 0.5 ),
			};
		}
		return out;
	}

	// 'centered' (also the portrait fallback for hero-left).
	out.imageBackdrop = wantImage;
	out.imageRegion = wantImage ? { x: 0, y: 0, w: doc.w, h: doc.h } : null;
	out.align = 'center';
	out.textRegion = {
		x: Math.round( doc.w * 0.1 ),
		y: Math.round( doc.h * 0.14 ),
		w: Math.round( doc.w * 0.8 ),
		h: Math.round( doc.h * 0.72 ),
	};
	return out;
}

/* ------------------------------ background ------------------------------ */

/** One of a few tasteful ground treatments of the bg/surface roles. */
function backgroundLayer( doc, palette, seed ) {
	const style = Math.abs( seed ) % 4;
	const g = ( from, to, stops, kind = 'linear' ) => {
		const layer = makeGradient( {
			x: 0,
			y: 0,
			w: doc.w,
			h: doc.h,
			kind,
			from,
			to,
			stops,
		} );
		layer.name = __( 'Background', 'wunderpaint' );
		return layer;
	};
	if ( 1 === style ) {
		// Vertical: surface top to bg bottom.
		return g( { x: 0, y: 0 }, { x: 0, y: doc.h }, [
			{ color: palette.surface, at: 0 },
			{ color: palette.bg, at: 1 },
		] );
	}
	if ( 2 === style ) {
		// Soft radial vignette: lighter surface centre out to the bg.
		const r = Math.round( Math.max( doc.w, doc.h ) * 0.75 );
		return g(
			{ x: doc.w / 2, y: doc.h / 2 },
			{ x: doc.w / 2 + r, y: doc.h / 2 },
			[
				{ color: palette.surface, at: 0 },
				{ color: palette.bg, at: 1 },
			],
			'radial'
		);
	}
	if ( 3 === style ) {
		// Diagonal the other way (BL to TR).
		return g( { x: 0, y: doc.h }, { x: doc.w, y: 0 }, [
			{ color: palette.bg, at: 0 },
			{ color: palette.surface, at: 1 },
		] );
	}
	// Default diagonal TL to BR.
	return g( { x: 0, y: 0 }, { x: doc.w, y: doc.h }, [
		{ color: palette.bg, at: 0 },
		{ color: palette.surface, at: 1 },
	] );
}

/* -------------------------------- composer ------------------------------ */

/**
 * Compose one variant from the semantic spec. Pure geometry + layers;
 * the caller loads the image and runs the finisher.
 *
 * @param {Object} spec Semantic spec from the model.
 * @param {Object} doc  Document ({ w, h }).
 * @param {Object} opts { seed, layout, profile, brand }.
 * @return {Object} { layers, imageSlot, palette, layout } - imageSlot
 *                  carries { …region, prompt, backdrop } when wanted.
 */
export function composeDesign( spec, doc, opts = {} ) {
	const seed = opts.seed || 0;
	const layoutName = LAYOUTS.includes( opts.layout )
		? opts.layout
		: LAYOUTS.includes( spec?.layout )
		? spec.layout
		: 'centered';
	const profile = STYLE_PROFILES.includes( opts.profile )
		? opts.profile
		: STYLE_PROFILES.includes( spec?.styleProfile )
		? spec.styleProfile
		: 'bold';
	const recipes = TYPE_RECIPES[ profile ];
	const baseRecipe = recipes[ Math.abs( seed ) % recipes.length ];
	// Brand kit fonts win (v1.172.2): the first kit font becomes the
	// display face (headline + watermark), the second the body face
	// (eyebrow/subhead/CTA/badge). With one font only, body stays neutral.
	const brandFonts = ( opts.brand?.fonts || [] ).filter(
		( f ) => 'string' === typeof f && f.trim()
	);
	const recipe = brandFonts[ 0 ]
		? {
				...baseRecipe,
				headline: {
					...baseRecipe.headline,
					fontFamily: brandFonts[ 0 ],
					// The recipe's weight may not exist for the brand face
					// (e.g. Archivo 900 → Cormorant tops out at 700).
					weight: nearestWeight(
						brandFonts[ 0 ],
						baseRecipe.headline.weight
					),
				},
		  }
		: baseRecipe;
	const bodyFont = brandFonts[ 1 ] || null;
	const palette = resolvePalette( spec, opts.brand, seed );
	const plan = archetypeLayout( layoutName, doc, spec, palette );
	const docMin = Math.min( doc.w, doc.h );
	const layers = [];

	// Background: one of a few tasteful treatments, rotated by the seed.
	layers.push( backgroundLayer( doc, palette, seed ) );

	let imageSlot = null;
	if ( plan.imageRegion && spec?.image?.prompt ) {
		imageSlot = {
			...plan.imageRegion,
			prompt: String( spec.image.prompt ),
			backdrop: plan.imageBackdrop,
		};
	}

	// Decor (panels, diagonals, cards) sits above bg + image.
	for ( const make of plan.decor ) {
		layers.push( make() );
	}

	// Text on a photo backdrop: strong scrim + light type (the finisher
	// only guards; readable-by-construction beats fixed-after).
	const onPhoto = !! ( imageSlot && plan.imageBackdrop );
	if ( onPhoto ) {
		layers.push(
			scrimLayer(
				{
					x: 0,
					y: Math.round( doc.h * 0.3 ),
					w: doc.w,
					h: Math.round( doc.h * 0.7 ),
				},
				'up',
				0.72
			)
		);
	}
	const stackPalette = onPhoto
		? {
				...palette,
				ink: '#ffffff',
				muted: 'rgba(255,255,255,0.85)',
				eyebrow: '#ffffff',
		  }
		: palette;

	// Sticker lean for the loud profiles (badges only).
	const badgeTilt = [ 'bold', 'playful' ].includes( profile ) ? -4 : 0;

	// Corner badge (stack badges flow inside the stack itself).
	const badgeLayers = [];
	const badgeText = String( spec?.copy?.badge || '' ).trim();
	if ( badgeText && ! plan.badgeInStack && plan.badgeCorner ) {
		const chip = badgeComponent( badgeText, palette, docMin, {
			tilt: badgeTilt,
			body: bodyFont,
		} );
		offsetLayers( chip.layers, plan.badgeCorner.x, plan.badgeCorner.y );
		badgeLayers.push( ...chip.layers );
	}

	const stack = contentStack( spec, plan.textRegion, stackPalette, recipe, {
		docMin,
		align: plan.align,
		anchor: plan.anchor,
		badgeInStack: plan.badgeInStack,
		badgeTilt,
		body: bodyFont,
	} );

	// Flair (the "kick"): headline emphasis, then quiet decor chosen by
	// profile - behind the content, glow/sparkles above scrim level.
	const texts = stack.filter( ( l ) => 'text' === l.type );
	const headline = texts.length
		? texts.reduce( ( a, b ) => ( b.fontSize > a.fontSize ? b : a ) )
		: null;
	if ( headline && ! onPhoto ) {
		emphasizeHeadline( headline, stackPalette, profile );
	}
	const { behind, above } = flairLayers( {
		spec,
		doc,
		palette: stackPalette,
		recipe,
		profile,
		seed,
		onPhoto,
		hasImage: !! imageSlot,
		stackTop: stack.reduce(
			( top, l ) => ( 'group' === l.type ? top : Math.min( top, l.y ) ),
			doc.h
		),
		headlineCenter: headline
			? {
					x: headline.x + headline.w / 2,
					y: headline.y + headline.h / 2,
			  }
			: null,
	} );
	// The behind-decor slides UNDER the scrim (which is the last layer
	// so far on photo scenes) - watermarks/rings never dim the photo.
	layers.splice( layers.length - ( onPhoto ? 1 : 0 ), 0, ...behind );
	layers.push( ...above, ...badgeLayers, ...stack );

	return { layers, imageSlot, palette, layout: layoutName };
}
