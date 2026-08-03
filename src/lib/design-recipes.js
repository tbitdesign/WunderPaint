/**
 * Design recipes (v4, "recipes design, the model only writes the words").
 *
 * The earlier assistant asked a blind LLM to compose a layout from generic
 * primitives on an empty grid - and a model that cannot see hedged to the
 * same safe arrangement every time (a headline, a button, two decorative
 * shapes). The starter-template generator produces professional work for
 * the opposite reason: a human authored each composition, encoding taste
 * (scale contrast, colour inversion, ghost numerals, marquees) as code.
 *
 * This module ports that discipline into the runtime. A recipe is a
 * parametrised, professional composition: given a document, copy, a curated
 * palette and a font pair, it returns finished editable layers with the
 * scale hierarchy, colour relationships and decorative moves baked in.
 * Contrast and fit are guaranteed by construction - text on a field always
 * uses that field's readable colour. The model's job shrinks to what it is
 * good at: writing the copy and naming a direction. Recipes work with no
 * model at all.
 */

import {
	makeText,
	makeShape,
	makeGradient,
	makeGroup,
	makeImage,
} from '../store/document';
import { measureTextWidth, measureTextHeight } from './raster';
import { labelColorFor } from './color-scheme';
import { nearestWeight } from './font-manager';
import { contrastRatio } from './contrast-check';
import { parseColor } from './color';

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
const isSet = ( v ) => undefined !== v && null !== v;
const isStr = ( v ) => 'string' === typeof v && v.trim();
const words = ( s ) =>
	String( s || '' )
		.trim()
		.split( /\s+/ )
		.filter( Boolean );

// Measurement runs slightly narrower than the real box so the layout never
// under-counts wrapped lines: sub-pixel kerning can make the renderer wrap
// one line more than the measurer at a size that lands on the box edge,
// which would collide the next block into the headline. Reserving a touch
// of slack turns any mismatch into a hair of extra gap instead of overlap.
const SAFE_W = 0.95;

/** Text colour with a contrast floor over its ground, else a fallback. */
const readable = ( fg, bg, alt ) => {
	try {
		return contrastRatio( parseColor( fg ), parseColor( bg ) ) >= 3
			? fg
			: alt;
	} catch ( e ) {
		return fg;
	}
};

/* --------------------------- font pairing ------------------------------- */

// Each recipe has a "voice" (a display-face character). The pair is curated
// so a recipe never lands a serif face on a brutalist poster. Brand fonts
// win: the first brand font drives the display face, the second the body.
export const VOICE_FONTS = {
	impact: { display: 'Anton', body: 'Inter' },
	grotesk: { display: 'Archivo', body: 'Inter' },
	condensed: { display: 'Bebas Neue', body: 'Inter' },
	serif: { display: 'Playfair Display', body: 'Inter' },
	elegant: { display: 'Cormorant Garamond', body: 'Inter' },
	modern: { display: 'Space Grotesk', body: 'Inter' },
	slab: { display: 'DM Serif Display', body: 'Inter' },
	rounded: { display: 'Fredoka', body: 'Mulish' },
};

const RECIPE_VOICE = {
	brutalist: 'impact',
	editorial: 'serif',
	poster: 'grotesk',
	split: 'condensed',
	spotlight: 'impact',
	pattern: 'modern',
	sticker: 'rounded',
	quote: 'elegant',
	minimal: 'modern',
	feature: 'grotesk',
	photo: 'grotesk',
	promo: 'impact',
	photoframe: 'grotesk',
};

/** Resolve a recipe's font pair, letting brand fonts override the voice. */
export function recipeFonts( name, brand ) {
	const base =
		VOICE_FONTS[ RECIPE_VOICE[ name ] || 'grotesk' ] || VOICE_FONTS.grotesk;
	const bf = ( brand?.fonts || [] ).filter( isStr );
	return { display: bf[ 0 ] || base.display, body: bf[ 1 ] || base.body };
}

/* ------------------------------ colour ---------------------------------- */

/**
 * Readable text colour for text placed on a field of role `on`. This is the
 * contrast guarantee: a recipe never puts ink on ink or accent on accent.
 */
function onField( palette, on ) {
	if ( 'accent' === on ) {
		return palette.onAccent;
	}
	if ( 'ink' === on ) {
		return palette.bg;
	}
	if ( isStr( on ) && '#' === on[ 0 ] ) {
		return labelColorFor( on );
	}
	// bg / surface / default: the palette's ink already contrasts them.
	return palette.ink;
}

const roleColor = ( palette, role ) =>
	( {
		bg: palette.bg,
		surface: palette.surface,
		ink: palette.ink,
		accent: palette.accent,
		muted: palette.muted,
	} )[ role ] || ( isStr( role ) && '#' === role[ 0 ] ? role : palette.ink );

/* ------------------------------ fitting --------------------------------- */

/** Largest font size at which `text` fits `box` within `maxLines`. */
function fit( text, face, box, maxLines = 3 ) {
	const { family, weight, track = 0, lineHeight = 1.05 } = face;
	const longest = words( text ).reduce(
		( a, b ) => ( b.length > a.length ? b : a ),
		''
	);
	const fits = ( s ) => {
		const ls = Math.round( s * track );
		const wordW = measureTextWidth( {
			text: longest,
			fontSize: s,
			fontFamily: family,
			weight,
			letterSpacing: ls,
		} );
		if ( wordW > box.w * SAFE_W ) {
			return false;
		}
		const bh = measureTextHeight( {
			text,
			fontSize: s,
			fontFamily: family,
			weight,
			letterSpacing: ls,
			lineHeight,
			w: box.w * SAFE_W,
			fixedWidth: true,
		} );
		// Measured height carries a constant ascent/descent overhead (~0.4x
		// the size) on top of nLines * lineHeight; the line budget must add
		// that as a constant, not scale it by lineHeight - or a tight
		// lineHeight (< 1) makes even a single line "not fit" and the fit
		// collapses to the floor (the giant stat that rendered tiny).
		return bh <= box.h && bh <= s * ( lineHeight * maxLines + 0.5 );
	};
	let lo = 8;
	let hi = Math.max( 8, Math.round( box.h ) );
	let best = 8;
	while ( lo <= hi ) {
		const mid = ( lo + hi ) >> 1;
		if ( fits( mid ) ) {
			best = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return best;
}

/** Measured height of a text block at a known size (conservative width). */
const blockH = ( text, face, w ) =>
	measureTextHeight( {
		text,
		fontSize: face.size,
		fontFamily: face.family,
		weight: face.weight,
		letterSpacing: Math.round( face.size * ( face.track || 0 ) ),
		lineHeight: face.lineHeight || 1.1,
		w: w * SAFE_W,
		fixedWidth: true,
	} );

/* ---------------------------- tiny builders ----------------------------- */

const T = ( o ) =>
	makeText( { fixedWidth: true, valign: 'top', align: 'left', ...o } );
const R = ( o ) => makeShape( { shape: 'rect', ...o } );

/** A pill / sharp CTA sized to its label, returned as a group + members. */
function ctaButton( label, region, palette, body, opts = {} ) {
	const text = false === opts.arrow ? label : `${ label }  →`;
	const h = clamp( Math.round( region.min * 0.07 ), 42, 108 );
	let fs = Math.round( h * 0.36 );
	let lw = measureTextWidth( {
		text,
		fontSize: fs,
		fontFamily: body,
		weight: 700,
	} );
	const maxW = opts.maxW || region.min;
	if ( lw + h * 1.2 > maxW ) {
		fs = Math.max( 12, Math.floor( ( fs * ( maxW - h * 1.2 ) ) / lw ) );
		lw = measureTextWidth( {
			text,
			fontSize: fs,
			fontFamily: body,
			weight: 700,
		} );
	}
	const w = Math.round( Math.min( maxW, lw + h * 1.3 ) );
	const outline = 'outline' === opts.style;
	const fillRole = opts.fill || 'accent';
	const fill = outline ? 'rgba(0,0,0,0)' : roleColor( palette, fillRole );
	const rect = { x: opts.x || 0, y: opts.y || 0, w, h };
	const group = makeGroup( { name: `Btn ${ label }`.slice( 0, 28 ) } );
	const shape = R( {
		name: 'Btn',
		...rect,
		fill,
		stroke: outline ? roleColor( palette, opts.fill || 'ink' ) : null,
		strokeW: outline ? Math.max( 2, Math.round( h * 0.05 ) ) : 0,
		radius:
			'sharp' === opts.style
				? Math.round( h * 0.14 )
				: Math.round( h / 2 ),
		styles: opts.flat
			? null
			: {
					dropShadow: {
						color: '#000000',
						opacity: 0.16,
						angle: 90,
						distance: 6,
						blur: 18,
						spread: 0,
					},
			  },
	} );
	const t = T( {
		name: label.slice( 0, 24 ),
		text,
		...rect,
		fontSize: fs,
		color: outline
			? roleColor( palette, opts.fill || 'ink' )
			: onField( palette, fillRole ),
		fontFamily: body,
		weight: 700,
		align: 'center',
		valign: 'middle',
	} );
	shape.parent = group.id;
	t.parent = group.id;
	group.children = [ shape.id, t.id ];
	return { layers: [ group, shape, t ], w, h };
}

/** A chip / badge sized to its label. */
function chip( label, palette, min, opts = {} ) {
	const h = clamp( Math.round( min * 0.042 ), 26, 66 );
	const fs = Math.round( h * 0.42 );
	const ls = Math.round( fs * 0.08 );
	const body = opts.body || 'Inter';
	const outline = 'outline' === opts.variant;
	const lw = measureTextWidth( {
		text: label,
		fontSize: fs,
		fontFamily: body,
		weight: 700,
		letterSpacing: ls,
	} );
	const w = Math.round( lw + h * 1.05 );
	const rect = { x: opts.x || 0, y: opts.y || 0, w, h };
	const fillRole = opts.fill || 'accent';
	const group = makeGroup( { name: 'Chip' } );
	const shape = R( {
		name: 'Chip',
		...rect,
		fill: outline ? 'rgba(0,0,0,0)' : roleColor( palette, fillRole ),
		stroke: outline ? roleColor( palette, opts.fill || 'ink' ) : null,
		strokeW: outline ? Math.max( 1, Math.round( h * 0.05 ) ) : 0,
		radius:
			'square' === opts.shape
				? Math.round( h * 0.16 )
				: Math.round( h / 2 ),
	} );
	const t = T( {
		name: label.slice( 0, 20 ),
		text: String( label ).toUpperCase(),
		...rect,
		fontSize: fs,
		color: outline
			? roleColor( palette, opts.fill || 'ink' )
			: onField( palette, fillRole ),
		fontFamily: body,
		weight: 700,
		align: 'center',
		valign: 'middle',
		letterSpacing: ls,
	} );
	if ( opts.tilt ) {
		shape.rot = opts.tilt;
		t.rot = opts.tilt;
	}
	shape.parent = group.id;
	t.parent = group.id;
	group.children = [ shape.id, t.id ];
	return { layers: [ group, shape, t ], w, h };
}

const shiftBy = ( layers, dx, dy ) => {
	for ( const l of layers ) {
		if ( 'group' !== l.type ) {
			l.x = Math.round( l.x + dx );
			l.y = Math.round( l.y + dy );
		}
	}
	return layers;
};

/* --------------------------- content column ----------------------------- */

/**
 * A calm vertical flow: kicker, headline (one word optionally emphasised),
 * subhead, CTA. Shared by the calmer recipes (poster, minimal, feature,
 * pattern). Fitted and anchored inside `region`, everything on one spine.
 *
 * @param {Object} ctx    { copy, palette }.
 * @param {Object} region { x, y, w, h }.
 * @param {Object} o      { align, anchor, faces, onColor, min, accentRole,
 *                         emphasisWord, ctaStyle }.
 * @return {Array} Layers.
 */
function contentColumn( ctx, region, o ) {
	const { copy, palette } = ctx;
	const align = o.align || 'left';
	const anchor = o.anchor || 'middle';
	const { display, body } = o.faces;
	const ink = o.onColor?.ink || palette.ink;
	const muted = o.onColor?.muted || palette.muted;
	const accent = roleColor( palette, o.accentRole || 'accent' );
	const min = o.min;
	const parts = [];

	const kicker = isStr( copy.kicker ) ? copy.kicker.trim() : '';
	const headline = isStr( copy.headline ) ? copy.headline.trim() : '';
	const subhead = isStr( copy.subhead ) ? copy.subhead.trim() : '';
	const cta = isStr( copy.cta ) ? copy.cta.trim() : '';

	const gap = ( f ) => Math.round( min * f );

	if ( kicker ) {
		const size = clamp( Math.round( min * 0.024 ), 13, 40 );
		const l = T( {
			name: kicker.slice( 0, 30 ),
			text: kicker.toUpperCase(),
			x: region.x,
			y: 0,
			w: region.w,
			h: Math.round( size * 1.6 ),
			fontSize: size,
			color: accent,
			fontFamily: body,
			weight: 700,
			letterSpacing: Math.round( size * 0.14 ),
			lineHeight: 1.2,
			align,
		} );
		l.h =
			blockH(
				kicker.toUpperCase(),
				{
					size,
					family: body,
					weight: 700,
					track: 0.14,
					lineHeight: 1.2,
				},
				region.w
			) + 2;
		parts.push( { l, h: l.h, after: gap( 0.022 ) } );
	}

	if ( headline ) {
		const face = {
			family: display,
			weight: nearestWeight( display, 800 ),
			track: 0,
			lineHeight: 1.05,
		};
		const cap = { w: region.w, h: Math.round( region.h * 0.6 ) };
		const size = fit( headline, face, cap, 4 );
		const l = T( {
			name: headline.slice( 0, 40 ),
			text: headline,
			x: region.x,
			y: 0,
			w: region.w,
			h: size * 2,
			fontSize: size,
			color: ink,
			fontFamily: display,
			weight: face.weight,
			lineHeight: 1.05,
			align,
		} );
		l.h =
			blockH(
				headline,
				{
					size,
					family: display,
					weight: face.weight,
					lineHeight: 1.05,
				},
				region.w
			) + Math.round( size * 0.06 );
		if ( isStr( o.emphasisWord ) ) {
			emphasise( l, o.emphasisWord, accent );
		}
		parts.push( { l, h: l.h, after: gap( 0.028 ) } );
	}

	if ( subhead ) {
		let size = clamp( Math.round( min * 0.028 ), 14, 44 );
		const mk = ( s ) =>
			T( {
				name: subhead.slice( 0, 40 ),
				text: subhead,
				x: region.x,
				y: 0,
				w: region.w,
				h: Math.round( s * 1.6 ),
				fontSize: s,
				color: muted,
				fontFamily: body,
				weight: 400,
				lineHeight: 1.4,
				align,
			} );
		let l = mk( size );
		while (
			size > 14 &&
			blockH(
				subhead,
				{ size, family: body, weight: 400, lineHeight: 1.4 },
				region.w
			) >
				size * 1.4 * 3.4
		) {
			size -= 2;
			l = mk( size );
		}
		l.h =
			blockH(
				subhead,
				{ size, family: body, weight: 400, lineHeight: 1.4 },
				region.w
			) + 2;
		parts.push( { l, h: l.h, after: gap( 0.045 ) } );
	}

	let button = null;
	if ( cta ) {
		button = ctaButton( cta, { min }, palette, body, {
			maxW: region.w,
			style: o.ctaStyle || 'pill',
			fill: o.ctaFill || 'accent',
		} );
		parts.push( { button, h: button.h, after: 0 } );
	}
	if ( ! parts.length ) {
		return [];
	}
	parts[ parts.length - 1 ].after = 0;

	const total = parts.reduce( ( s, p ) => s + p.h + p.after, 0 );
	let y =
		'bottom' === anchor
			? region.y + region.h - total
			: 'top' === anchor
			? region.y
			: region.y + Math.max( 0, ( region.h - total ) / 2 );
	y = Math.round( Math.max( region.y, y ) );

	const alignX = ( w ) =>
		'center' === align
			? Math.round( region.x + ( region.w - w ) / 2 )
			: 'right' === align
			? region.x + region.w - w
			: region.x;

	const out = [];
	for ( const p of parts ) {
		if ( p.button ) {
			shiftBy( p.button.layers, alignX( p.button.w ), y );
			out.push( ...p.button.layers );
		} else {
			p.l.y = y;
			out.push( p.l );
		}
		y += p.h + p.after;
	}
	return out;
}

/** Two-tone a single word inside a headline (spans). */
function emphasise( layer, word, color ) {
	const text = layer.text;
	const at = text.toLowerCase().indexOf( word.toLowerCase() );
	if ( at < 0 ) {
		return;
	}
	const w = text.substr( at, word.length );
	const spans = [];
	if ( at > 0 ) {
		spans.push( { text: text.slice( 0, at ), s: null } );
	}
	spans.push( { text: w, s: { color } } );
	if ( at + w.length < text.length ) {
		spans.push( { text: text.slice( at + w.length ), s: null } );
	}
	layer.spans = spans;
}

/* ------------------------- decor & accents ------------------------------ */
/*
 * Decorative shapes live at the BACKGROUND level (behind the copy) and hug an
 * EDGE or CORNER, never the content region, so they enrich a composition
 * without colliding with the text. Recipes pick them by seed for variety.
 */

/** A slanted colour band hugging the top or bottom edge. */
function angledBand( doc, palette, o = {} ) {
	const side = o.side || 'bottom';
	const at = o.at ?? 0.16;
	const slant = o.slant ?? 0.06;
	const h = Math.round( doc.h * at );
	const sl = Math.round( doc.h * slant );
	const d =
		'bottom' === side
			? `M 0 ${ doc.h } L ${ doc.w } ${ doc.h } L ${ doc.w } ${
					doc.h - h
			  } L 0 ${ doc.h - h + sl } Z`
			: `M 0 0 L ${ doc.w } 0 L ${ doc.w } ${ h } L 0 ${ h - sl } Z`;
	const s = makeShape( {
		name: 'Band',
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		fill: roleColor( palette, o.role || 'accent' ),
		pathD: d,
	} );
	if ( isSet( o.opacity ) ) {
		s.opacity = o.opacity;
	}
	return s;
}

/** A big circle poking in from one edge (a half-circle at the margin). */
function arcPoke( doc, palette, o = {} ) {
	const from = o.from || 'right';
	const rad = Math.round( Math.min( doc.w, doc.h ) * ( o.size ?? 0.5 ) );
	const pos =
		'left' === from
			? { x: -rad * 1.3, y: doc.h * 0.5 - rad }
			: 'right' === from
			? { x: doc.w - rad * 0.7, y: doc.h * 0.5 - rad }
			: 'top' === from
			? { x: doc.w * 0.5 - rad, y: -rad * 1.3 }
			: { x: doc.w * 0.5 - rad, y: doc.h - rad * 0.7 };
	const s = makeShape( {
		name: 'Arc',
		shape: 'ellipse',
		x: Math.round( pos.x ),
		y: Math.round( pos.y ),
		w: rad * 2,
		h: rad * 2,
		fill: roleColor( palette, o.role || 'surface' ),
	} );
	if ( isSet( o.opacity ) ) {
		s.opacity = o.opacity;
	}
	return s;
}

/** A right-triangle wedge tucked into a corner. */
function cornerWedge( doc, palette, o = {} ) {
	const corner = o.corner || 'tr';
	const s = Math.round( Math.min( doc.w, doc.h ) * ( o.size ?? 0.28 ) );
	const d = {
		tl: `M 0 0 L ${ s } 0 L 0 ${ s } Z`,
		tr: `M ${ doc.w } 0 L ${ doc.w - s } 0 L ${ doc.w } ${ s } Z`,
		bl: `M 0 ${ doc.h } L ${ s } ${ doc.h } L 0 ${ doc.h - s } Z`,
		br: `M ${ doc.w } ${ doc.h } L ${ doc.w - s } ${ doc.h } L ${ doc.w } ${
			doc.h - s
		} Z`,
	}[ corner ];
	const shp = makeShape( {
		name: 'Wedge',
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		fill: roleColor( palette, o.role || 'accent' ),
		pathD: d,
	} );
	if ( isSet( o.opacity ) ) {
		shp.opacity = o.opacity;
	}
	return shp;
}

/** A soft blob poking from a corner (organic accent). */
function blobPoke( doc, palette, o = {} ) {
	const rad = Math.round( Math.min( doc.w, doc.h ) * ( o.size ?? 0.6 ) );
	const corner = o.corner || 'br';
	const pos = {
		tl: { x: -rad * 0.35, y: -rad * 0.35 },
		tr: { x: doc.w - rad * 0.65, y: -rad * 0.35 },
		bl: { x: -rad * 0.35, y: doc.h - rad * 0.65 },
		br: { x: doc.w - rad * 0.65, y: doc.h - rad * 0.65 },
	}[ corner ];
	const s = makeShape( {
		name: 'Blob',
		x: Math.round( pos.x ),
		y: Math.round( pos.y ),
		w: rad,
		h: rad,
		fill: roleColor( palette, o.role || 'accent' ),
		pathD: decorBlob( rad, rad ),
	} );
	if ( isSet( o.opacity ) ) {
		s.opacity = o.opacity;
	}
	return s;
}

/** Soft asymmetric organic blob path in a w x h box (local coords). */
function decorBlob( w, h ) {
	const r = ( n ) => Math.round( n );
	return `M ${ r( w * 0.5 ) } 0 C ${ r( w * 0.92 ) } 0 ${ r( w ) } ${ r(
		h * 0.22
	) } ${ r( w ) } ${ r( h * 0.52 ) } C ${ r( w ) } ${ r( h * 0.86 ) } ${ r(
		w * 0.82
	) } ${ r( h ) } ${ r( w * 0.48 ) } ${ r( h ) } C ${ r( w * 0.16 ) } ${ r(
		h
	) } 0 ${ r( h * 0.82 ) } 0 ${ r( h * 0.5 ) } C 0 ${ r( h * 0.18 ) } ${ r(
		w * 0.12
	) } 0 ${ r( w * 0.5 ) } 0 Z`;
}

/**
 * Pick a subtle background decor accent by seed. Every option is CORNER or
 * bottom-EDGE bound and low-key, so it is safe behind centred content (the
 * centre stays clear). Returns a layer or null (restraint).
 */
function pickDecor( doc, palette, seed ) {
	const menu = [
		() =>
			blobPoke( doc, palette, {
				corner: 'br',
				role: 'accent',
				size: 0.62,
				opacity: 0.12,
			} ),
		() =>
			blobPoke( doc, palette, {
				corner: 'tl',
				role: 'accent',
				size: 0.44,
				opacity: 0.1,
			} ),
		() =>
			cornerWedge( doc, palette, {
				corner: 'tr',
				role: 'accent',
				size: 0.26,
				opacity: 0.16,
			} ),
		() =>
			arcPoke( doc, palette, {
				from: 'bottom',
				role: 'accent',
				size: 0.3,
				opacity: 0.12,
			} ),
		() =>
			angledBand( doc, palette, {
				side: 'bottom',
				at: 0.1,
				role: 'accent',
				opacity: 0.16,
			} ),
		() => null, // sometimes nothing - restraint.
	];
	return menu[ ( ( seed % menu.length ) + menu.length ) % menu.length ]();
}

/* ------------------------------ components ------------------------------ */

/** A starburst seal with short text - the classic "SALE!" sticker. */
function starburst( label, palette, min, o = {} ) {
	const d = clamp( Math.round( min * ( o.size ?? 0.17 ) ), 90, 280 );
	const fillRole = o.fill || 'accent';
	const tilt = o.tilt ?? -8;
	const region = { x: o.x || 0, y: o.y || 0, w: d, h: d };
	const group = makeGroup( { name: 'Sticker' } );
	const seal = makeShape( {
		name: 'Seal',
		...region,
		shape: 'star',
		sides: o.points || 16,
		points: o.points || 16,
		fill: roleColor( palette, fillRole ),
	} );
	const words2 = words( label );
	const fs = clamp(
		Math.round( d * ( words2.length > 1 ? 0.16 : 0.22 ) ),
		12,
		200
	);
	const t = T( {
		name: String( label ).slice( 0, 16 ),
		text: String( label ).toUpperCase(),
		...region,
		fontSize: fs,
		color: onField( palette, fillRole ),
		fontFamily: o.body || 'Inter',
		weight: 800,
		align: 'center',
		valign: 'middle',
		lineHeight: 1.02,
	} );
	seal.rot = tilt;
	t.rot = tilt;
	seal.parent = group.id;
	t.parent = group.id;
	group.children = [ seal.id, t.id ];
	return { layers: [ group, seal, t ], w: d, h: d };
}

/** An arrow shape pointing a direction (annotate / point at something). */
function arrowMark( palette, o = {} ) {
	const s = makeShape( {
		name: 'Arrow',
		shape: 'arrow',
		x: o.x || 0,
		y: o.y || 0,
		w: o.w || 120,
		h: o.h || 60,
		fill: roleColor( palette, o.role || 'accent' ),
	} );
	if ( o.rot ) {
		s.rot = o.rot;
	}
	return s;
}

/* ------------------------------ text styles ----------------------------- */

/**
 * Apply a tasteful, palette-aware text treatment in place. Kept subtle so it
 * reads as craft, not costume, and always stays legible.
 *
 * @param {Object} layer   Text layer (mutated).
 * @param {Object} palette Palette.
 * @param {string} style   outline | hollow | gradient | shadow | sticker | block.
 * @return {Object} layer.
 */
function treatText( layer, palette, style ) {
	const size = layer.fontSize || 40;
	if ( 'outline' === style ) {
		layer.outlineColor = layer.color;
		layer.outlineW = Math.max( 1, Math.round( size * 0.028 ) );
	} else if ( 'hollow' === style ) {
		layer.outlineColor = layer.color;
		layer.outlineW = Math.max( 2, Math.round( size * 0.04 ) );
		layer.color = palette.bg;
	} else if ( 'gradient' === style ) {
		layer.fillType = 'gradient';
		layer.gradientStops = [
			{ color: layer.color, at: 0 },
			{ color: mix( layer.color, palette.accent, 0.55 ), at: 1 },
		];
		layer.gradientAngle = 90;
	} else if ( 'shadow' === style ) {
		layer.shadowOn = true;
		layer.shadowColor = 'rgba(0,0,0,0.3)';
	} else if ( 'sticker' === style ) {
		layer.textFX = {
			rings: {
				size: 6,
				count: 1,
				color: palette.bg,
				color2: palette.ink,
			},
		};
	} else if ( 'block' === style ) {
		layer.bgColor = palette.accent;
		layer.color = palette.onAccent;
		layer.bgRadius = Math.round( size * 0.16 );
	}
	return layer;
}

/* ------------------------------ recipes --------------------------------- */
/*
 * Each recipe: ( ctx ) => layers, where ctx = { doc, copy, palette, faces,
 * seed }. Layers are bottom-first, groups precede their children. Every
 * recipe fills the whole canvas (its own background) and guarantees contrast.
 */

/** BRUTALIST: giant stacked type, one line inverted in an accent block. */
function brutalist( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.075 );
	const L = [];
	const dark = isDark( palette.bg );
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);

	// Ghost numeral / word behind, top-right, very low opacity accent.
	const ghost = isStr( copy.stat )
		? copy.stat.replace( /[^0-9%]/g, '' ) || copy.stat
		: String( ( ( seed || 0 ) % 9 ) + 1 ).padStart( 2, '0' );
	const gSize = Math.round( doc.h * 0.42 );
	L.push(
		T( {
			name: 'Ghost',
			text: ghost.slice( 0, 3 ),
			x: Math.round( doc.w * 0.28 ),
			y: -Math.round( gSize * 0.14 ),
			w: Math.round( doc.w * 0.75 ),
			h: gSize,
			fontSize: gSize,
			color: withAlpha( palette.accent, 0.1 ),
			fontFamily: faces.display,
			weight: nearestWeight( faces.display, 800 ),
			align: 'right',
			valign: 'top',
			lineHeight: 1,
		} )
	);

	// Kicker chip, top-left.
	let top = M;
	if ( isStr( copy.kicker ) ) {
		const c = chip( copy.kicker.trim(), palette, min, {
			body: faces.body,
			shape: 'square',
			x: M,
			y: M,
		} );
		L.push( ...c.layers );
		top = M + c.h + Math.round( min * 0.03 );
	}

	// Headline as up to 3 huge stacked lines; the middle one inverts inside
	// a full-bleed-ish accent block. Every line shares one big size.
	const hw = words( copy.headline || copy.label || 'Bold Statement' );
	const lines = splitLines( hw, 3 );
	const colW = doc.w - M * 2;
	const face = {
		family: faces.display,
		weight: nearestWeight( faces.display, 800 ),
		lineHeight: 1,
		track: -0.01,
	};
	// One size that fits the longest single word across all lines.
	let size = Math.round( doc.h * 0.2 );
	for ( const ln of lines ) {
		size = Math.min(
			size,
			fit( ln, face, { w: colW, h: doc.h * 0.3 }, 1 )
		);
	}
	const lineH = Math.round( size * 1.04 );
	const bandH = Math.round( lineH * 1.02 );
	const stackH = lines.length * lineH;
	let y = clamp(
		Math.round( ( doc.h - stackH ) * 0.52 ),
		top,
		doc.h - M - stackH
	);
	const midIdx = lines.length >= 2 ? 1 : 0;
	lines.forEach( ( ln, i ) => {
		const invert = i === midIdx && lines.length >= 2;
		const alt = i % 2 === 1;
		if ( invert ) {
			L.push(
				R( {
					name: 'Acid block',
					x: 0,
					y: y - Math.round( ( bandH - lineH ) / 2 ),
					w: doc.w,
					h: bandH,
					fill: palette.accent,
				} )
			);
		}
		L.push(
			T( {
				name: ln.slice( 0, 30 ),
				text: ln.toUpperCase(),
				x: M,
				y,
				w: colW,
				h: lineH,
				fontSize: size,
				color: invert ? palette.onAccent : palette.ink,
				fontFamily: faces.display,
				weight: face.weight,
				align: alt ? 'right' : 'left',
				valign: 'middle',
				letterSpacing: Math.round( size * -0.01 ),
				lineHeight: 1,
			} )
		);
		y += lineH;
	} );

	// Meta rule + meta line + marquee bar at the foot.
	const metaY = Math.min(
		doc.h - M - Math.round( min * 0.12 ),
		y + Math.round( min * 0.05 )
	);
	L.push(
		R( {
			name: 'Rule',
			x: M,
			y: metaY,
			w: colW,
			h: Math.max( 2, Math.round( min * 0.004 ) ),
			fill: dark ? palette.ink : palette.ink,
		} )
	);
	const meta = isStr( copy.meta )
		? copy.meta.trim()
		: isStr( copy.subhead )
		? copy.subhead.trim()
		: '';
	if ( meta ) {
		const ms = clamp( Math.round( min * 0.026 ), 14, 40 );
		L.push(
			T( {
				name: meta.slice( 0, 30 ),
				text: meta.toUpperCase(),
				x: M,
				y: metaY + Math.round( min * 0.02 ),
				w: colW,
				h: Math.round( ms * 2 ),
				fontSize: ms,
				color: palette.accent,
				fontFamily: faces.body,
				weight: 700,
				letterSpacing: Math.round( ms * 0.05 ),
			} )
		);
	}
	if ( isStr( copy.cta ) ) {
		const barH = Math.round( min * 0.085 );
		const bs = Math.round( barH * 0.36 );
		const unit = `${ copy.cta.trim().toUpperCase() }   ·   `;
		L.push(
			R( {
				name: 'Marquee bar',
				x: 0,
				y: doc.h - barH,
				w: doc.w,
				h: barH,
				fill: palette.accent,
			} )
		);
		L.push(
			T( {
				name: 'Marquee',
				text: unit.repeat( 6 ),
				x: 0,
				y: doc.h - barH,
				w: doc.w,
				h: barH,
				fontSize: bs,
				color: palette.onAccent,
				fontFamily: faces.body,
				weight: 700,
				align: 'center',
				valign: 'middle',
				letterSpacing: Math.round( bs * 0.06 ),
			} )
		);
	}
	return L;
}

/** EDITORIAL: serif masthead, hairline rules, calm columns, refined. */
function editorial( ctx ) {
	const { doc, copy, palette, faces } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.085 );
	const colW = doc.w - M * 2;
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);

	// Masthead: top rule, kicker left, meta right.
	const hair = Math.max( 1, Math.round( min * 0.0025 ) );
	L.push(
		R( {
			name: 'Top rule',
			x: M,
			y: M,
			w: colW,
			h: hair,
			fill: palette.ink,
		} )
	);
	const mhY = M + Math.round( min * 0.028 );
	const ks = clamp( Math.round( min * 0.024 ), 13, 36 );
	if ( isStr( copy.kicker ) ) {
		L.push(
			T( {
				name: copy.kicker.slice( 0, 30 ),
				text: copy.kicker.trim().toUpperCase(),
				x: M,
				y: mhY,
				w: colW * 0.6,
				h: Math.round( ks * 1.6 ),
				fontSize: ks,
				color: palette.accent,
				fontFamily: faces.body,
				weight: 700,
				letterSpacing: Math.round( ks * 0.16 ),
			} )
		);
	}
	if ( isStr( copy.meta ) ) {
		L.push(
			T( {
				name: copy.meta.slice( 0, 30 ),
				text: copy.meta.trim().toUpperCase(),
				x: M + colW * 0.4,
				y: mhY,
				w: colW * 0.6,
				h: Math.round( ks * 1.6 ),
				fontSize: ks,
				color: palette.muted,
				fontFamily: faces.body,
				weight: 500,
				letterSpacing: Math.round( ks * 0.1 ),
				align: 'right',
			} )
		);
	}

	// Headline: big serif, generous, left. Region is the upper-middle band.
	const headTop = mhY + Math.round( min * 0.09 );
	const headRegion = {
		x: M,
		y: headTop,
		w: colW,
		h: Math.round( doc.h * 0.42 ),
	};
	const hFace = {
		family: faces.display,
		weight: nearestWeight( faces.display, 700 ),
		lineHeight: 1.08,
		track: 0,
	};
	const headline = isStr( copy.headline )
		? copy.headline.trim()
		: copy.label || 'A Considered Headline';
	const hSize = fit( headline, hFace, headRegion, 4 );
	const hH = blockH(
		headline,
		{
			size: hSize,
			family: faces.display,
			weight: hFace.weight,
			lineHeight: 1.08,
		},
		colW
	);
	const hL = T( {
		name: headline.slice( 0, 40 ),
		text: headline,
		x: M,
		y: headTop,
		w: colW,
		h: hH + Math.round( hSize * 0.1 ),
		fontSize: hSize,
		color: palette.ink,
		fontFamily: faces.display,
		weight: hFace.weight,
		lineHeight: 1.08,
	} );
	if ( isStr( copy.emphasisWord ) ) {
		emphasise( hL, copy.emphasisWord.trim(), palette.accent );
	}
	L.push( hL );

	// Subhead in a narrower measure below.
	let sy = headTop + hH + Math.round( min * 0.05 );
	if ( isStr( copy.subhead ) ) {
		const sw = Math.round( colW * 0.78 );
		let ss = clamp( Math.round( min * 0.03 ), 15, 44 );
		const subhead = copy.subhead.trim();
		while (
			ss > 15 &&
			blockH(
				subhead,
				{ size: ss, family: faces.body, weight: 400, lineHeight: 1.5 },
				sw
			) >
				ss * 1.5 * 4.4
		) {
			ss -= 1;
		}
		const sH = blockH(
			subhead,
			{ size: ss, family: faces.body, weight: 400, lineHeight: 1.5 },
			sw
		);
		L.push(
			T( {
				name: subhead.slice( 0, 40 ),
				text: subhead,
				x: M,
				y: sy,
				w: sw,
				h: sH + 4,
				fontSize: ss,
				color: palette.muted,
				fontFamily: faces.body,
				weight: 400,
				lineHeight: 1.5,
			} )
		);
		sy += sH;
	}

	// Foot: hairline + CTA text link with arrow.
	const footY = doc.h - M - Math.round( min * 0.07 );
	L.push(
		R( {
			name: 'Foot rule',
			x: M,
			y: footY,
			w: colW,
			h: hair,
			fill: palette.ink,
		} )
	);
	if ( isStr( copy.cta ) ) {
		const cs = clamp( Math.round( min * 0.03 ), 16, 44 );
		L.push(
			T( {
				name: copy.cta.slice( 0, 30 ),
				text: `${ copy.cta.trim() }  →`,
				x: M,
				y: footY + Math.round( min * 0.02 ),
				w: colW,
				h: Math.round( cs * 1.8 ),
				fontSize: cs,
				color: palette.accent,
				fontFamily: faces.body,
				weight: 700,
			} )
		);
	}
	return L;
}

/** POSTER: centred headline, accent rule, badge, CTA, corner frame ticks. */
function poster( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	// Subtle vertical ground so it is not a flat slab.
	L.push( gradientV( doc, palette.surface, palette.bg ) );
	// Decor varies by seed so the corner frame is ONE option among several,
	// not a tell on every poster: ticks, a soft corner blob, or nothing.
	const decorPick = ( ( ( seed || 0 ) % 3 ) + 3 ) % 3;
	if ( 0 === decorPick ) {
		const tick = Math.round( min * 0.06 );
		const tw = Math.max( 2, Math.round( min * 0.006 ) );
		const corners = [
			[ M, M, 1, 1 ],
			[ doc.w - M, M, -1, 1 ],
			[ M, doc.h - M, 1, -1 ],
			[ doc.w - M, doc.h - M, -1, -1 ],
		];
		for ( const [ cx, cy, sx, sy ] of corners ) {
			L.push(
				R( {
					name: 'Tick',
					x: sx > 0 ? cx : cx - tick,
					y: cy - ( sy > 0 ? 0 : tw ),
					w: tick,
					h: tw,
					fill: palette.accent,
				} )
			);
			L.push(
				R( {
					name: 'Tick',
					x: cx - ( sx > 0 ? 0 : tw ),
					y: sy > 0 ? cy : cy - tick,
					w: tw,
					h: tick,
					fill: palette.accent,
				} )
			);
		}
	} else if ( 1 === decorPick ) {
		L.push(
			blobPoke( doc, palette, {
				corner: 'br',
				role: 'accent',
				size: 0.62,
				opacity: 0.12,
			} )
		);
		L.push(
			blobPoke( doc, palette, {
				corner: 'tl',
				role: 'accent',
				size: 0.42,
				opacity: 0.1,
			} )
		);
	}
	// Centred badge on top.
	let topY = Math.round( doc.h * 0.16 );
	if ( isStr( copy.badge ) || isStr( copy.kicker ) ) {
		const label = ( copy.badge || copy.kicker ).trim();
		const c = chip( label, palette, min, { body: faces.body } );
		shiftBy( c.layers, Math.round( ( doc.w - c.w ) / 2 ), topY );
		L.push( ...c.layers );
		topY += c.h + Math.round( min * 0.04 );
	}
	// Centred content column (headline + subhead + CTA) in the middle band.
	const region = { x: M, y: topY, w: doc.w - M * 2, h: doc.h - topY - M };
	const col = contentColumn( ctx, region, {
		align: 'center',
		anchor: 'middle',
		faces,
		min,
		emphasisWord: copy.emphasisWord,
		ctaStyle: 'pill',
	} );
	L.push( ...col );
	return L;
}

/** SPLIT: hard two-tone field, content on the calm side, a graphic accent. */
function split( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	const portrait = doc.h > doc.w * 1.1;
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);

	if ( portrait ) {
		// Top accent band holds a kicker + badge, bottom bg holds the stack.
		const at = 0.42;
		const bandH = Math.round( doc.h * at );
		L.push(
			R( {
				name: 'Accent field',
				x: 0,
				y: 0,
				w: doc.w,
				h: bandH,
				fill: palette.accent,
			} )
		);
		// A big graphic shape (circle) straddling the seam.
		const rr = Math.round( min * 0.34 );
		L.push(
			makeShape( {
				name: 'Disc',
				shape: 'ellipse',
				x: doc.w - rr * 0.7,
				y: bandH - rr * 0.55,
				w: rr,
				h: rr,
				fill: palette.surface,
				opacity: 0.9,
			} )
		);
		if ( isStr( copy.badge ) || isStr( copy.kicker ) ) {
			const c = chip(
				( copy.badge || copy.kicker ).trim(),
				palette,
				min,
				{ body: faces.body, fill: 'bg', variant: 'solid' }
			);
			shiftBy( c.layers, M, M );
			// recolor chip text to read on accent -> use bg fill already ok.
			L.push( ...c.layers );
		}
		// Headline on the accent field (big, onAccent).
		const hFace = {
			family: faces.display,
			weight: nearestWeight( faces.display, 700 ),
			lineHeight: 1.0,
			track: 0,
		};
		const headline = isStr( copy.headline )
			? copy.headline.trim()
			: copy.label || 'Big News';
		const hRegion = {
			x: M,
			y: Math.round( bandH * 0.34 ),
			w: doc.w - M * 2,
			h: Math.round( bandH * 0.6 ),
		};
		const hSize = fit( headline, hFace, hRegion, 3 );
		const hH = blockH(
			headline,
			{
				size: hSize,
				family: faces.display,
				weight: hFace.weight,
				lineHeight: 1.0,
			},
			hRegion.w
		);
		L.push(
			T( {
				name: headline.slice( 0, 40 ),
				text: headline.toUpperCase(),
				x: M,
				y: bandH - hH - Math.round( min * 0.04 ),
				w: hRegion.w,
				h: hH + Math.round( hSize * 0.1 ),
				fontSize: hSize,
				color: palette.onAccent,
				fontFamily: faces.display,
				weight: hFace.weight,
				lineHeight: 1.0,
			} )
		);
		// Subhead + CTA on the bg field below.
		const region = {
			x: M,
			y: bandH + Math.round( min * 0.06 ),
			w: doc.w - M * 2,
			h: doc.h - bandH - M - Math.round( min * 0.06 ),
		};
		L.push(
			...contentColumn(
				{ copy: { subhead: copy.subhead, cta: copy.cta }, palette },
				region,
				{
					align: 'left',
					anchor: 'top',
					faces,
					min,
					ctaStyle: 'pill',
				}
			)
		);
		return L;
	}

	// Landscape / square: vertical split, accent panel left, stack right.
	const leftIsAccent = ( seed || 0 ) % 2 === 0;
	const at = 0.44;
	const splitX = Math.round( doc.w * at );
	L.push(
		R( {
			name: 'Accent field',
			x: 0,
			y: 0,
			w: splitX,
			h: doc.h,
			fill: leftIsAccent ? palette.accent : palette.surface,
		} )
	);
	// Big centred word/number on the accent panel.
	const word = isStr( copy.stat )
		? copy.stat.trim()
		: words( copy.headline )[ 0 ] || 'GO';
	const pFace = {
		family: faces.display,
		weight: nearestWeight( faces.display, 800 ),
		lineHeight: 1,
	};
	const pSize = fit(
		word,
		pFace,
		{ w: splitX - M * 1.4, h: doc.h * 0.5 },
		1
	);
	L.push(
		T( {
			name: word.slice( 0, 12 ),
			text: word.toUpperCase(),
			x: Math.round( M * 0.5 ),
			y: Math.round( doc.h * 0.3 ),
			w: splitX - M,
			h: Math.round( doc.h * 0.4 ),
			fontSize: pSize,
			color: leftIsAccent ? palette.onAccent : palette.accent,
			fontFamily: faces.display,
			weight: pFace.weight,
			align: 'center',
			valign: 'middle',
			lineHeight: 1,
		} )
	);
	// Content stack on the right bg panel.
	const region = {
		x: splitX + M,
		y: M,
		w: doc.w - splitX - M * 2,
		h: doc.h - M * 2,
	};
	L.push(
		...contentColumn( ctx, region, {
			align: 'left',
			anchor: 'middle',
			faces,
			min,
			emphasisWord: copy.emphasisWord,
			ctaStyle: 'pill',
		} )
	);
	return L;
}

/** SPOTLIGHT: one giant stat/number is the hero; copy explains it. */
function spotlight( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	const dec = pickDecor( doc, palette, ( seed || 0 ) + 1 );
	if ( dec ) {
		L.push( dec );
	}
	const stat = isStr( copy.stat )
		? copy.stat.trim()
		: words( copy.headline )[ 0 ] || '24';

	// Kicker above.
	let y = Math.round( doc.h * 0.16 );
	if ( isStr( copy.kicker ) ) {
		const ks = clamp( Math.round( min * 0.028 ), 15, 42 );
		L.push(
			T( {
				name: copy.kicker.slice( 0, 30 ),
				text: copy.kicker.trim().toUpperCase(),
				x: M,
				y,
				w: doc.w - M * 2,
				h: Math.round( ks * 1.6 ),
				fontSize: ks,
				color: palette.accent,
				fontFamily: faces.body,
				weight: 700,
				letterSpacing: Math.round( ks * 0.14 ),
				align: 'center',
			} )
		);
		y += Math.round( ks * 1.6 ) + Math.round( min * 0.02 );
	}
	// The giant stat, gradient-filled accent->ink for richness.
	const gFace = {
		family: faces.display,
		weight: nearestWeight( faces.display, 800 ),
		lineHeight: 0.92,
	};
	const gSize = fit(
		stat,
		gFace,
		{ w: doc.w - M * 1.2, h: doc.h * 0.42 },
		1
	);
	// The stat must read on the ground; a soft accent on a light bg would
	// vanish, so fall back to ink where the accent lacks contrast.
	const statTop = readable( palette.accent, palette.bg, palette.ink );
	const statL = T( {
		name: stat.slice( 0, 12 ),
		text: stat,
		x: M,
		y,
		w: doc.w - M * 2,
		h: Math.round( gSize * 1.1 ),
		fontSize: gSize,
		color: statTop,
		fontFamily: faces.display,
		weight: gFace.weight,
		align: 'center',
		valign: 'top',
		lineHeight: 0.92,
	} );
	statL.fillType = 'gradient';
	statL.gradientStops = [
		{ color: statTop, at: 0 },
		{ color: mix( statTop, palette.ink, 0.35 ), at: 1 },
	];
	statL.gradientAngle = 90;
	L.push( statL );
	y += Math.round( gSize * 0.98 );

	// Headline + subhead + CTA, centred, below the stat.
	const region = {
		x: M,
		y: y + Math.round( min * 0.02 ),
		w: doc.w - M * 2,
		h: doc.h - y - M,
	};
	L.push(
		...contentColumn(
			{
				copy: {
					headline: copy.headline,
					subhead: copy.subhead,
					cta: copy.cta,
				},
				palette,
			},
			region,
			{
				align: 'center',
				anchor: 'top',
				faces,
				min,
				ctaStyle: 'pill',
			}
		)
	);
	return L;
}

/** PATTERN: a generated pattern field + a clean panel holding the copy. */
function pattern( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.06 );
	const L = [];
	L.push(
		R( {
			name: 'BG',
			x: 0,
			y: 0,
			w: doc.w,
			h: doc.h,
			fill: palette.surface,
		} )
	);
	// Full-canvas procedural pattern in accent over the surface.
	const kinds = [ 'dots', 'grid', 'diagonal', 'stripes' ];
	const kind = kinds[ ( seed || 0 ) % kinds.length ];
	const pat = R( {
		name: 'Pattern',
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		fill: withAlpha( palette.accent, 0.5 ),
		pattern: kind,
		fillType: 'pattern',
		patternScale: Math.max( 4, Math.round( min / 90 ) ),
	} );
	L.push( pat );
	// A clean centred panel (bg) with soft shadow holds the content.
	const pad = Math.round( min * 0.08 );
	const panel = {
		x: M,
		y: Math.round( doc.h * 0.14 ),
		w: doc.w - M * 2,
		h: Math.round( doc.h * 0.72 ),
	};
	L.push(
		R( {
			name: 'Card',
			...panel,
			fill: palette.bg,
			radius: Math.round( min * 0.03 ),
			styles: {
				dropShadow: {
					color: '#000000',
					opacity: 0.2,
					angle: 90,
					distance: 10,
					blur: 40,
					spread: 0,
				},
			},
		} )
	);
	const region = {
		x: panel.x + pad,
		y: panel.y + pad,
		w: panel.w - pad * 2,
		h: panel.h - pad * 2,
	};
	L.push(
		...contentColumn( ctx, region, {
			align: 'center',
			anchor: 'middle',
			faces,
			min,
			emphasisWord: copy.emphasisWord,
			ctaStyle: 'pill',
		} )
	);
	return L;
}

/** STICKER: playful, tilted chips, rounded, bright blocks. */
function sticker( ctx ) {
	const { doc, copy, palette, faces } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	// Big soft blob behind for energy.
	const rr = Math.round( min * 0.7 );
	L.push(
		makeShape( {
			name: 'Blob',
			shape: 'ellipse',
			x: -rr * 0.2,
			y: doc.h - rr * 0.6,
			w: rr,
			h: rr,
			fill: withAlpha( palette.accent, 0.16 ),
		} )
	);
	// A starburst seal in the top-right corner when there is a short stat.
	if ( isStr( copy.stat ) ) {
		const sb = starburst( copy.stat.trim(), palette, min, {
			fill: 'accent',
			body: faces.body,
			tilt: 8,
			size: 0.15,
		} );
		shiftBy(
			sb.layers,
			doc.w - sb.w - Math.round( M * 0.3 ),
			Math.round( M * 0.4 )
		);
		L.push( ...sb.layers );
	}
	// Tilted badge top.
	let topY = Math.round( doc.h * 0.14 );
	if ( isStr( copy.badge ) || isStr( copy.kicker ) ) {
		const c = chip( ( copy.badge || copy.kicker ).trim(), palette, min, {
			body: faces.body,
			tilt: -5,
		} );
		shiftBy( c.layers, Math.round( ( doc.w - c.w ) / 2 ), topY );
		L.push( ...c.layers );
		topY += c.h + Math.round( min * 0.05 );
	}
	// Headline: rounded, big, one word on an accent pill.
	const region = { x: M, y: topY, w: doc.w - M * 2, h: doc.h - topY - M };
	const col = contentColumn( ctx, region, {
		align: 'center',
		anchor: 'middle',
		faces,
		min,
		emphasisWord: copy.emphasisWord,
		ctaStyle: 'pill',
	} );
	L.push( ...col );
	return L;
}

/** QUOTE: oversized quotation marks, a centred quote, attribution. */
function quote( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.1 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	const dec = pickDecor( doc, palette, ( seed || 0 ) + 2 );
	if ( dec ) {
		L.push( dec );
	}
	// Big accent quotation mark.
	const qSize = Math.round( min * 0.42 );
	L.push(
		T( {
			name: 'Quote mark',
			text: '“',
			x: M,
			y: Math.round( doc.h * 0.1 ),
			w: doc.w - M * 2,
			h: qSize,
			fontSize: qSize,
			color: withAlpha( palette.accent, 0.9 ),
			fontFamily: faces.display,
			weight: nearestWeight( faces.display, 700 ),
			align: 'center',
			valign: 'top',
			lineHeight: 1,
		} )
	);
	// The quote itself, elegant serif, centred.
	const q = isStr( copy.headline )
		? copy.headline.trim()
		: copy.label || 'Words worth remembering.';
	const region = {
		x: M,
		y: Math.round( doc.h * 0.3 ),
		w: doc.w - M * 2,
		h: Math.round( doc.h * 0.4 ),
	};
	const qFace = {
		family: faces.display,
		weight: nearestWeight( faces.display, 600 ),
		lineHeight: 1.18,
		track: 0,
	};
	const qs = fit( q, qFace, region, 5 );
	const qH = blockH(
		q,
		{
			size: qs,
			family: faces.display,
			weight: qFace.weight,
			lineHeight: 1.18,
		},
		region.w
	);
	L.push(
		T( {
			name: q.slice( 0, 40 ),
			text: q,
			x: region.x,
			y: region.y,
			w: region.w,
			h: qH + Math.round( qs * 0.1 ),
			fontSize: qs,
			color: palette.ink,
			fontFamily: faces.display,
			weight: qFace.weight,
			lineHeight: 1.18,
			align: 'center',
		} )
	);
	// Short accent rule + attribution.
	const ay = region.y + qH + Math.round( min * 0.06 );
	const rw = Math.round( min * 0.08 );
	L.push(
		R( {
			name: 'Rule',
			x: Math.round( ( doc.w - rw ) / 2 ),
			y: ay,
			w: rw,
			h: Math.max( 2, Math.round( min * 0.006 ) ),
			fill: palette.accent,
		} )
	);
	const attribution = isStr( copy.meta )
		? copy.meta.trim()
		: isStr( copy.kicker )
		? copy.kicker.trim()
		: '';
	if ( attribution ) {
		const as = clamp( Math.round( min * 0.026 ), 14, 38 );
		L.push(
			T( {
				name: attribution.slice( 0, 30 ),
				text: attribution.toUpperCase(),
				x: M,
				y: ay + Math.round( min * 0.025 ),
				w: doc.w - M * 2,
				h: Math.round( as * 1.6 ),
				fontSize: as,
				color: palette.muted,
				fontFamily: faces.body,
				weight: 600,
				letterSpacing: Math.round( as * 0.12 ),
				align: 'center',
			} )
		);
	}
	return L;
}

/** MINIMAL: luxury whitespace, small refined type, one accent dot. */
function minimal( ctx ) {
	const { doc, copy, palette, faces } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.12 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	// Thin full frame.
	const fw = Math.max( 1, Math.round( min * 0.002 ) );
	const fm = Math.round( min * 0.06 );
	L.push(
		makeShape( {
			name: 'Frame',
			x: fm,
			y: fm,
			w: doc.w - fm * 2,
			h: doc.h - fm * 2,
			fill: 'rgba(0,0,0,0)',
			stroke: palette.ink,
			strokeW: fw,
		} )
	);
	// One accent dot top-left of the copy.
	const region = { x: M, y: M, w: doc.w - M * 2, h: doc.h - M * 2 };
	const dot = Math.round( min * 0.02 );
	L.push(
		makeShape( {
			name: 'Dot',
			shape: 'ellipse',
			x: region.x,
			y: Math.round( doc.h * 0.34 ),
			w: dot,
			h: dot,
			fill: palette.accent,
		} )
	);
	L.push(
		...contentColumn( ctx, region, {
			align: 'left',
			anchor: 'middle',
			faces,
			min,
			emphasisWord: copy.emphasisWord,
			ctaStyle: 'link',
		} )
	);
	return L;
}

/** FEATURE: left copy column + a right accent side-panel with a big mark. */
function feature( ctx ) {
	const { doc, copy, palette, faces } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.075 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	// Right accent side panel.
	const panelW = Math.round( doc.w * 0.3 );
	L.push(
		R( {
			name: 'Side panel',
			x: doc.w - panelW,
			y: 0,
			w: panelW,
			h: doc.h,
			fill: palette.accent,
		} )
	);
	// Big outlined numeral / word on the panel (vertical interest).
	const mark = isStr( copy.stat )
		? copy.stat.trim()
		: isStr( copy.kicker )
		? copy.kicker.trim()[ 0 ]
		: '+';
	const mFace = {
		family: faces.display,
		weight: nearestWeight( faces.display, 800 ),
		lineHeight: 1,
	};
	const mSize = fit( mark, mFace, { w: panelW * 1.1, h: doc.h * 0.5 }, 1 );
	L.push(
		T( {
			name: 'Mark',
			text: mark,
			x: doc.w - panelW,
			y: Math.round( doc.h * 0.3 ),
			w: panelW,
			h: Math.round( doc.h * 0.4 ),
			fontSize: mSize,
			color: withAlpha( palette.onAccent, 0.92 ),
			fontFamily: faces.display,
			weight: mFace.weight,
			align: 'center',
			valign: 'middle',
			lineHeight: 1,
		} )
	);
	// Left copy column.
	const region = {
		x: M,
		y: M,
		w: doc.w - panelW - M * 1.6,
		h: doc.h - M * 2,
	};
	L.push(
		...contentColumn( ctx, region, {
			align: 'left',
			anchor: 'middle',
			faces,
			min,
			emphasisWord: copy.emphasisWord,
			ctaStyle: 'pill',
		} )
	);
	return L;
}

/**
 * PROMO: a loud sale/announcement - a starburst seal, an angled band and an
 *  arrow pointing at the CTA. The showcase for stickers + arrows + decor.
 */
function promo( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);
	// A slanted accent band along the bottom edge (below the content).
	L.push(
		angledBand( doc, palette, {
			side: 'bottom',
			at: 0.13,
			slant: 0.05,
			role: 'accent',
		} )
	);

	// Starburst seal top-right with the stat/badge (short and loud).
	const seal = isStr( copy.stat )
		? copy.stat.trim()
		: isStr( copy.badge )
		? copy.badge.trim()
		: '';
	let sealBox = null;
	if ( seal ) {
		const sb = starburst( seal, palette, min, {
			fill: 'accent',
			body: faces.body,
			tilt: -10,
		} );
		const sx = doc.w - sb.w - Math.round( M * 0.3 );
		const sy = Math.round( M * 0.4 );
		shiftBy( sb.layers, sx, sy );
		L.push( ...sb.layers );
		sealBox = { x: sx, y: sy, w: sb.w, h: sb.h };
	}

	// Kicker + headline + subhead + CTA, left, clear of the seal corner.
	const region = {
		x: M,
		y: Math.round( doc.h * ( sealBox ? 0.34 : 0.24 ) ),
		w: doc.w - M * 2,
		h: Math.round( doc.h * 0.52 ),
	};
	const col = contentColumn( ctx, region, {
		align: 'left',
		anchor: 'middle',
		faces,
		min,
		emphasisWord: copy.emphasisWord,
		ctaStyle: 'pill',
	} );
	const head = col
		.filter( ( l ) => 'text' === l.type )
		.reduce(
			( a, b ) => ( ( b.fontSize || 0 ) > ( a?.fontSize || 0 ) ? b : a ),
			null
		);
	if ( head ) {
		treatText(
			head,
			palette,
			[ 'shadow', 'gradient', 'outline' ][ seed % 3 ]
		);
	}
	L.push( ...col );

	// An arrow to the RIGHT of the CTA, pointing back at it (kept in-bounds).
	const btn = col.find(
		( l ) => 'shape' === l.type && /^Btn/.test( l.name || '' )
	);
	if ( btn ) {
		const aw = Math.round( min * 0.085 );
		const ah = Math.round( aw * 0.52 );
		const ax = btn.x + btn.w + Math.round( min * 0.03 );
		if ( ax + aw < doc.w - M * 0.3 ) {
			L.push(
				arrowMark( palette, {
					x: ax,
					y: btn.y + Math.round( ( btn.h - ah ) / 2 ),
					w: aw,
					h: ah,
					role: 'ink',
					rot: 180,
				} )
			);
		}
	}
	return L;
}

/**
 * PHOTO: a full-bleed background photograph, a scrim and the copy over it.
 *  The simplest way to place a real (stock) image; falls back to a moody
 *  gradient when no photo resolved, so it never breaks.
 */
function photo( ctx ) {
	const { doc, copy, palette, faces } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const full = { x: 0, y: 0, w: doc.w, h: doc.h };
	const L = [];
	if ( ctx.photo && ctx.photo.src ) {
		const img = makeImage( {
			name: 'Photo',
			...full,
			src: ctx.photo.src,
			naturalW: ctx.photo.naturalW,
			naturalH: ctx.photo.naturalH,
		} );
		img.imageFit = { mode: 'cover', ax: 0.5, ay: 0.5 };
		L.push( img );
	} else {
		L.push( gradientV( doc, palette.surface, palette.bg ) );
	}
	// Readability scrim + copy anchored to the bottom in light type.
	L.push( bottomScrim( doc, 0.82 ) );
	if ( isStr( copy.badge ) || isStr( copy.kicker ) ) {
		const c = chip( ( copy.badge || copy.kicker ).trim(), palette, min, {
			body: faces.body,
			x: M,
			y: M,
		} );
		L.push( ...c.layers );
	}
	const region = {
		x: M,
		y: Math.round( doc.h * 0.42 ),
		w: doc.w - M * 2,
		h: Math.round( doc.h * 0.58 ) - M,
	};
	const col = contentColumn(
		{
			copy: {
				headline: copy.headline,
				subhead: copy.subhead,
				cta: copy.cta,
			},
			palette,
		},
		region,
		{
			align: 'left',
			anchor: 'bottom',
			faces,
			min,
			onColor: { ink: '#ffffff', muted: 'rgba(255,255,255,0.9)' },
			emphasisWord: copy.emphasisWord,
			ctaStyle: 'pill',
		}
	);
	// A soft shadow guarantees the light text stays legible even over a bright
	// patch of the photograph, where the scrim alone is not enough.
	for ( const l of col ) {
		if ( 'text' === l.type ) {
			l.shadowOn = true;
			l.shadowColor = 'rgba(0,0,0,0.55)';
		}
	}
	L.push( ...col );
	return L;
}

/* --------------------------- masked photos ------------------------------ */

/** Trace a shape outline on a canvas context in a w x h box (local coords). */
function traceShape( g, shape, w, h ) {
	g.beginPath();
	if ( 'circle' === shape ) {
		g.ellipse( w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2 );
	} else if ( 'arch' === shape ) {
		const r = Math.min( w / 2, h );
		g.moveTo( 0, h );
		g.lineTo( 0, r );
		g.arc( w / 2, r, r, Math.PI, 0, false );
		g.lineTo( w, h );
		g.closePath();
	} else if ( 'rounded' === shape ) {
		const r = Math.round( Math.min( w, h ) * 0.12 );
		g.moveTo( r, 0 );
		g.arcTo( w, 0, w, h, r );
		g.arcTo( w, h, 0, h, r );
		g.arcTo( 0, h, 0, 0, r );
		g.arcTo( 0, 0, w, 0, r );
		g.closePath();
	} else {
		// blob (matches decorBlob's curve).
		g.moveTo( w * 0.5, 0 );
		g.bezierCurveTo( w * 0.92, 0, w, h * 0.22, w, h * 0.52 );
		g.bezierCurveTo( w, h * 0.86, w * 0.82, h, w * 0.48, h );
		g.bezierCurveTo( w * 0.16, h, 0, h * 0.82, 0, h * 0.5 );
		g.bezierCurveTo( 0, h * 0.18, w * 0.12, 0, w * 0.5, 0 );
		g.closePath();
	}
}

/** SVG path for a shape in a w x h box (for placeholder shape layers). */
function shapePath( shape, w, h ) {
	const r = ( n ) => Math.round( n );
	if ( 'arch' === shape ) {
		const rr = Math.min( r( w / 2 ), h );
		return `M 0 ${ r( h ) } L 0 ${ rr } A ${ rr } ${ rr } 0 0 1 ${ r(
			w
		) } ${ rr } L ${ r( w ) } ${ r( h ) } Z`;
	}
	return decorBlob( w, h );
}

/** Cover-fit draw an image into a w x h canvas region (centre crop). */
function drawCover( g, img, w, h ) {
	const iw = img.naturalWidth || img.width || 1;
	const ih = img.naturalHeight || img.height || 1;
	const s = Math.max( w / iw, h / ih );
	const dw = iw * s;
	const dh = ih * s;
	g.drawImage( img, ( w - dw ) / 2, ( h - dh ) / 2, dw, dh );
}

/**
 * A photograph masked into `shape` inside `box`. Bakes the clipped photo to a
 * self-contained image when ctx offers a bake fn + loaded photo (the reliable
 * path). Without them it degrades: a plain cover-fit photo, or a filled shape
 * placeholder - so it always renders and stays testable.
 */
function maskedPhoto( ctx, shape, box, palette, o = {} ) {
	const round = {
		x: Math.round( box.x ),
		y: Math.round( box.y ),
		w: Math.round( box.w ),
		h: Math.round( box.h ),
	};
	const out = [];
	// An accent backing plate, offset a touch, for depth behind the frame.
	if ( o.plate ) {
		out.push(
			shapeLayer( shape, {
				x: round.x + Math.round( round.w * 0.03 ),
				y: round.y + Math.round( round.h * 0.03 ),
				w: round.w,
				h: round.h,
				fill: roleColor( palette, o.plate ),
			} )
		);
	}
	if ( ctx.bake && ctx.photoImg ) {
		const src = ctx.bake( round.w, round.h, ( g ) => {
			g.save();
			traceShape( g, shape, round.w, round.h );
			g.clip();
			drawCover( g, ctx.photoImg, round.w, round.h );
			g.restore();
		} );
		out.push(
			makeImage( {
				name: 'Photo',
				...round,
				src,
				naturalW: round.w,
				naturalH: round.h,
			} )
		);
	} else if ( ctx.photo && ctx.photo.src ) {
		const img = makeImage( {
			name: 'Photo',
			...round,
			src: ctx.photo.src,
			naturalW: ctx.photo.naturalW,
			naturalH: ctx.photo.naturalH,
		} );
		img.imageFit = { mode: 'cover', ax: 0.5, ay: 0.5 };
		out.push( img );
	} else {
		out.push( shapeLayer( shape, { ...round, fill: palette.surface } ) );
	}
	return out;
}

/** A shape layer (ellipse / arch / blob / rounded rect) filling a box. */
function shapeLayer( shape, box ) {
	if ( 'circle' === shape ) {
		return makeShape( { name: 'Frame', shape: 'ellipse', ...box } );
	}
	if ( 'rounded' === shape ) {
		return makeShape( {
			name: 'Frame',
			...box,
			radius: 0.12,
		} );
	}
	const s = makeShape( { name: 'Frame', ...box } );
	s.pathD = shapePath( shape, box.w, box.h );
	return s;
}

/**
 * PHOTOFRAME: a photo MASKED into a shape (arch / circle / blob) with the
 *  copy below it. Falls back gracefully with no photo.
 */
function photoframe( ctx ) {
	const { doc, copy, palette, faces, seed } = ctx;
	const min = Math.min( doc.w, doc.h );
	const M = Math.round( min * 0.08 );
	const L = [];
	L.push(
		R( { name: 'BG', x: 0, y: 0, w: doc.w, h: doc.h, fill: palette.bg } )
	);

	const shapes = [ 'arch', 'circle', 'blob', 'rounded' ];
	const shape =
		shapes[
			( ( ( seed || 0 ) % shapes.length ) + shapes.length ) %
				shapes.length
		];
	const centred = 'circle' === shape || 'blob' === shape;

	// Frame region: the top band of the canvas.
	const fw = doc.w - M * 2;
	const fh = Math.round( doc.h * 0.5 );
	let frameBox = { x: M, y: M, w: fw, h: fh };
	if ( centred ) {
		const d = Math.min( fw, fh );
		frameBox = { x: Math.round( ( doc.w - d ) / 2 ), y: M, w: d, h: d };
	}
	L.push(
		...maskedPhoto( ctx, shape, frameBox, palette, { plate: 'accent' } )
	);

	// Copy below the frame.
	const top = frameBox.y + frameBox.h + Math.round( min * 0.05 );
	const region = {
		x: M,
		y: top,
		w: doc.w - M * 2,
		h: doc.h - top - M,
	};
	L.push(
		...contentColumn(
			{
				copy: {
					kicker: copy.kicker,
					headline: copy.headline,
					subhead: copy.subhead,
					cta: copy.cta,
				},
				palette,
			},
			region,
			{
				align: centred ? 'center' : 'left',
				anchor: 'top',
				faces,
				min,
				emphasisWord: copy.emphasisWord,
				ctaStyle: 'pill',
			}
		)
	);
	return L;
}

/* ------------------------------ helpers --------------------------------- */

const rgbOf = ( hex ) => {
	const m = /^#([0-9a-f]{6})/i.exec( hex || '' );
	if ( ! m ) {
		return null;
	}
	const n = parseInt( m[ 1 ], 16 );
	return [ ( n >> 16 ) & 255, ( n >> 8 ) & 255, n & 255 ];
};

function withAlpha( hex, a ) {
	const c = rgbOf( hex );
	if ( ! c ) {
		return hex;
	}
	return `rgba(${ c[ 0 ] },${ c[ 1 ] },${ c[ 2 ] },${ a })`;
}

function mix( a, b, t ) {
	const ca = rgbOf( a );
	const cb = rgbOf( b );
	if ( ! ca || ! cb ) {
		return a;
	}
	const r = ca.map( ( v, i ) => Math.round( v + ( cb[ i ] - v ) * t ) );
	return `#${ r
		.map( ( v ) => v.toString( 16 ).padStart( 2, '0' ) )
		.join( '' ) }`;
}

function isDark( hex ) {
	const c = rgbOf( hex );
	if ( ! c ) {
		return false;
	}
	// Rec. 601 luma.
	return 0.299 * c[ 0 ] + 0.587 * c[ 1 ] + 0.114 * c[ 2 ] < 128;
}

function gradientV( doc, from, to ) {
	const g = makeGradient( {
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		kind: 'linear',
		from: { x: 0, y: 0 },
		to: { x: 0, y: doc.h },
		stops: [
			{ color: from, at: 0 },
			{ color: to, at: 1 },
		],
	} );
	g.name = 'BG';
	return g;
}

/** Dark-to-transparent readability scrim rising from the bottom. */
function bottomScrim( doc, strength ) {
	const a = Math.round( clamp( strength, 0, 1 ) * 255 )
		.toString( 16 )
		.padStart( 2, '0' );
	const g = makeGradient( {
		x: 0,
		y: 0,
		w: doc.w,
		h: doc.h,
		kind: 'linear',
		from: { x: 0, y: doc.h },
		to: { x: 0, y: Math.round( doc.h * 0.24 ) },
		stops: [
			{ color: `#000000${ a }`, at: 0 },
			{ color: '#00000000', at: 1 },
		],
	} );
	g.name = 'Scrim';
	return g;
}

/** Split words into up to `n` balanced lines (greedy by character length). */
function splitLines( ws, n ) {
	if ( ws.length <= n ) {
		return ws.length ? ws : [ '' ];
	}
	const total = ws.join( ' ' ).length;
	const target = total / n;
	const lines = [];
	let cur = [];
	let len = 0;
	for ( const w of ws ) {
		cur.push( w );
		len += w.length + 1;
		if ( len >= target && lines.length < n - 1 ) {
			lines.push( cur.join( ' ' ) );
			cur = [];
			len = 0;
		}
	}
	if ( cur.length ) {
		lines.push( cur.join( ' ' ) );
	}
	return lines.slice( 0, n );
}

/* ------------------------------ registry -------------------------------- */

export const RECIPES = {
	brutalist,
	editorial,
	poster,
	split,
	spotlight,
	pattern,
	sticker,
	quote,
	minimal,
	feature,
	photo,
	promo,
	photoframe,
};

export const RECIPE_NAMES = Object.keys( RECIPES );

// Recipes that need a real photograph (gated out when no stock provider is
// configured, and always fed a resolved photo when kept).
export const PHOTO_RECIPES = [ 'photo', 'photoframe' ];

// Which recipes fit a mood/intent - the picker leads with these so variants
// stay on brief while each is a genuinely different composition.
export const INTENT_RECIPES = {
	warm: [
		'poster',
		'photoframe',
		'editorial',
		'photo',
		'feature',
		'sticker',
	],
	cool: [ 'feature', 'photo', 'photoframe', 'editorial', 'minimal', 'split' ],
	earthy: [
		'editorial',
		'photoframe',
		'photo',
		'minimal',
		'quote',
		'poster',
	],
	vibrant: [ 'promo', 'brutalist', 'split', 'spotlight', 'sticker' ],
	pastel: [ 'minimal', 'poster', 'pattern', 'quote' ],
	dark: [ 'brutalist', 'spotlight', 'photo', 'split', 'feature' ],
};

/**
 * Pick `count` distinct recipe names, led by an explicit hint and the
 * intent's fitting recipes, rotated by a roll so a regenerate explores a
 * different set. Always returns `count` distinct names.
 *
 * @param {Object} plan  { recipe, intent }.
 * @param {number} count How many.
 * @param {number} roll  Roll seed.
 * @return {string[]} Distinct recipe names.
 */
export function pickRecipes( plan, count = 3, roll = 0 ) {
	const hint = RECIPE_NAMES.includes( plan?.recipe ) ? [ plan.recipe ] : [];
	const byIntent = INTENT_RECIPES[ plan?.intent ] || [];
	const pool = [ ...new Set( [ ...hint, ...byIntent, ...RECIPE_NAMES ] ) ];
	const k = ( ( roll % pool.length ) + pool.length ) % pool.length;
	const rotated = [ ...pool.slice( k ), ...pool.slice( 0, k ) ];
	// Keep the hint first if present (the model's explicit choice leads).
	const ordered = hint.length
		? [ hint[ 0 ], ...rotated.filter( ( n ) => n !== hint[ 0 ] ) ]
		: rotated;
	return ordered.slice( 0, count );
}

/**
 * Compose one recipe to finished layers. Coordinates are rounded and text
 * kept inside the canvas as a light safety net; recipes place in-bounds.
 *
 * @param {string} name Recipe name.
 * @param {Object} ctx  { doc, copy, palette, faces, seed }.
 * @return {Array} Layers (bottom-first; groups precede children).
 */
export function composeRecipe( name, ctx ) {
	const fn = RECIPES[ name ] || RECIPES.poster;
	let layers;
	try {
		layers = fn( ctx );
	} catch ( e ) {
		layers = RECIPES.poster( ctx );
	}
	return finalise( ctx.doc, layers );
}

/** Round coordinates and keep text from drifting off-canvas. */
function finalise( doc, layers ) {
	for ( const l of layers ) {
		if ( ! l || 'group' === l.type ) {
			continue;
		}
		l.x = Math.round( l.x );
		l.y = Math.round( l.y );
		if ( 'text' === l.type ) {
			l.x = Math.max( -l.w * 0.1, Math.min( doc.w - l.w * 0.9, l.x ) );
			l.y = Math.max( -l.h * 0.1, Math.min( doc.h - l.h * 0.5, l.y ) );
		}
	}
	return layers;
}
