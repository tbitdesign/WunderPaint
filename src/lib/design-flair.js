/**
 * Design Assistant flair (v1.171.0): the "kick" pass. The composer
 * builds a correct, readable layout - this module makes it feel
 * designed, using the editor's own toolbox: span-level emphasis on the
 * headline (two-tone / italic / hand-drawn marker), a giant watermark
 * echo, accent rings, dot-grid textures, sparkle stars, thin editorial
 * frames, a radial glow over photos and a slight sticker tilt on
 * badges. Deliberately restrained: one or two decorative elements per
 * design, chosen by profile and rotated by the variant seed - composed
 * beauty, not confetti.
 */

import { __ } from '@wordpress/i18n';

import { makeText, makeShape, makeGradient } from '../store/document';
import { contrastRatio } from './contrast-check';
import { parseColor } from './color';
import { labelColorFor } from './color-scheme';
import { measureTextWidth } from './raster';

const NONE = 'rgba(0,0,0,0)';

// Brand kits may deliver 8-digit hex - alpha suffixes need the solid part.
const solid = ( c ) => String( c || '' ).slice( 0, 7 );

/** The word worth emphasizing: a number/price/percent, else the last word. */
export function emphasisToken( headline ) {
	const text = String( headline || '' );
	const num = text.match( /(?:[%€$£]\s?)?\d+(?:[.,]\d+)?\s?[%€$£]?/ );
	if ( num && num[ 0 ].trim().length > 1 ) {
		return num[ 0 ].trim();
	}
	const words = text.trim().split( /\s+/ );
	return words.length >= 3 ? words[ words.length - 1 ] : '';
}

/**
 * Two-tone / marker emphasis on the headline via rich-text spans. Runs
 * after sizing (color changes nothing, the marker pads its own buffer).
 *
 * @param {Object} layer   Headline text layer (mutated).
 * @param {Object} palette Palette roles.
 * @param {string} profile Style profile.
 */
export function emphasizeHeadline( layer, palette, profile ) {
	const token = emphasisToken( layer.text );
	if ( ! token ) {
		return;
	}
	const idx = layer.text.indexOf( token );
	if ( idx < 0 ) {
		return;
	}
	// The accent must be readable on the backdrop AND visibly different
	// from the base ink - otherwise the two-tone effect just looks off.
	if (
		contrastRatio(
			parseColor( palette.accent ),
			parseColor( palette.bg )
		) < 2 ||
		contrastRatio(
			parseColor( palette.accent ),
			parseColor( layer.color )
		) < 1.4
	) {
		return;
	}
	// Span-level `mark` is a color STRING (the renderer builds the
	// hand-drawn swipe from it); dark ink on the accent swipe must read.
	const style =
		'playful' === profile
			? {
					mark: palette.accent,
					color: labelColorFor( palette.accent ),
			  }
			: 'editorial' === profile
			? { color: palette.accent, italic: true }
			: { color: palette.accent };
	const spans = [];
	if ( idx > 0 ) {
		spans.push( { text: layer.text.slice( 0, idx ), s: null } );
	}
	spans.push( { text: token, s: style } );
	if ( idx + token.length < layer.text.length ) {
		spans.push( {
			text: layer.text.slice( idx + token.length ),
			s: null,
		} );
	}
	layer.spans = spans;
}

/** Giant rotated echo of the punchiest token, whisper-quiet behind all. */
function watermarkLayer( spec, doc, palette, recipe ) {
	const token =
		String( spec?.copy?.badge || '' ).trim() ||
		emphasisToken( spec?.copy?.headline ) ||
		String( spec?.copy?.headline || '' )
			.trim()
			.split( /\s+/ )[ 0 ] ||
		'';
	if ( ! token ) {
		return null;
	}
	const docMin = Math.min( doc.w, doc.h );
	const size = Math.round( docMin * 0.42 );
	const text = recipe.upper ? token.toUpperCase() : token;
	const layer = makeText( {
		name: __( 'Watermark', 'wunderpaint' ),
		text,
		x: Math.round( doc.w * 0.34 ),
		y: Math.round( -docMin * 0.05 ),
		w: doc.w,
		h: Math.round( size * 1.2 ),
		fontSize: size,
		color: palette.ink,
		fontFamily: recipe.headline.fontFamily,
		weight: recipe.headline.weight,
		align: 'left',
	} );
	// The tight box keeps the finisher's into-canvas clamp honest.
	layer.w = Math.min(
		doc.w,
		measureTextWidth( layer ) + Math.round( size * 0.1 )
	);
	layer.opacity = 0.06;
	layer.rot = -8;
	return layer;
}

/** Outline ring, half off-canvas - the classic poster accent. */
function ringLayer( doc, palette, seed ) {
	const docMin = Math.min( doc.w, doc.h );
	const size = Math.round( docMin * ( 0.22 + 0.05 * ( seed % 2 ) ) );
	const topRight = 0 === seed % 2;
	const ring = makeShape( {
		name: __( 'Decoration', 'wunderpaint' ),
		shape: 'ellipse',
		x: topRight
			? doc.w - Math.round( size * 0.62 )
			: Math.round( -size * 0.4 ),
		y: topRight
			? Math.round( -size * 0.38 )
			: doc.h - Math.round( size * 0.6 ),
		w: size,
		h: size,
		fill: NONE,
		stroke: palette.accent,
		strokeW: Math.max( 6, Math.round( docMin * 0.011 ) ),
	} );
	ring.opacity = 0.85;
	return ring;
}

/** Dot-grid texture patch (the editor's own pattern fill, scaled up). */
function dotGridLayer( doc, palette, seed ) {
	const docMin = Math.min( doc.w, doc.h );
	const topRight = 0 === seed % 2;
	const w = Math.round( docMin * 0.2 );
	const h = Math.round( docMin * 0.14 );
	// Inset past the card archetype's frame so the patch never straddles
	// a rounded corner.
	const inset = Math.round( docMin * 0.1 );
	const dots = makeShape( {
		name: __( 'Decoration', 'wunderpaint' ),
		shape: 'rect',
		x: topRight ? doc.w - w - inset : inset,
		y: topRight ? inset : doc.h - h - inset,
		w,
		h,
		fill: palette.accent,
		pattern: 'dots',
	} );
	dots.fillType = 'pattern';
	dots.patternScale = Math.max( 3, Math.round( docMin / 240 ) );
	dots.opacity = 0.5;
	return dots;
}

/** Soft corner blob (quarter off-canvas), barely-there brand tint. */
function cornerBlobLayer( doc, palette, seed ) {
	const docMin = Math.min( doc.w, doc.h );
	const size = Math.round( docMin * 0.55 );
	const right = 0 === seed % 2;
	const blob = makeShape( {
		name: __( 'Decoration', 'wunderpaint' ),
		shape: 'ellipse',
		x: right ? doc.w - Math.round( size * 0.5 ) : Math.round( -size * 0.5 ),
		y: doc.h - Math.round( size * 0.5 ),
		w: size,
		h: size,
		fill: palette.accent,
	} );
	blob.opacity = 0.08;
	return blob;
}

/** Sparkle stars in the free band ABOVE the stack - never on the copy. */
function sparkleLayers( doc, palette, seed, stackTop ) {
	const docMin = Math.min( doc.w, doc.h );
	const band = Math.max( docMin * 0.14, stackTop || doc.h * 0.2 );
	const spots = [
		{ x: 0.84, y: 0.42, f: 0.05, rot: 12, color: palette.accent },
		{ x: 0.34, y: 0.68, f: 0.03, rot: -18, color: palette.accent },
		{ x: 0.92, y: 0.78, f: 0.026, rot: 30, color: palette.ink },
	];
	return spots.slice( 0, 2 + ( seed % 2 ) ).map( ( s ) => {
		const size = Math.round( docMin * s.f );
		const star = makeShape( {
			name: __( 'Decoration', 'wunderpaint' ),
			shape: 'star',
			sides: 4,
			x: Math.round( doc.w * s.x - size / 2 ),
			y: Math.round( band * s.y - size / 2 ),
			w: size,
			h: size,
			fill: s.color,
		} );
		star.rot = s.rot;
		star.opacity = 0.9;
		return star;
	} );
}

/** Thin inner frame - quiet editorial luxury. */
function frameLayer( doc, palette ) {
	const docMin = Math.min( doc.w, doc.h );
	const inset = Math.round( docMin * 0.035 );
	const frame = makeShape( {
		name: __( 'Decoration', 'wunderpaint' ),
		shape: 'rect',
		x: inset,
		y: inset,
		w: doc.w - inset * 2,
		h: doc.h - inset * 2,
		fill: NONE,
		stroke: palette.ink,
		strokeW: Math.max( 2, Math.round( docMin * 0.002 ) ),
	} );
	frame.opacity = 0.55;
	return frame;
}

/** Radial accent glow behind the text stack (photos and dark scenes). */
function glowLayer( doc, palette, center, strength ) {
	const docMin = Math.min( doc.w, doc.h );
	const r = Math.round( docMin * 0.6 );
	const a = Math.round( strength * 255 )
		.toString( 16 )
		.padStart( 2, '0' );
	const glow = makeGradient( {
		x: Math.max( 0, center.x - r ),
		y: Math.max( 0, center.y - r ),
		w: Math.min( doc.w, r * 2 ),
		h: Math.min( doc.h, r * 2 ),
		kind: 'radial',
		from: { x: center.x, y: center.y },
		to: { x: center.x + r, y: center.y },
		stops: [
			{ color: `${ solid( palette.accent ) }${ a }`, at: 0 },
			{ color: `${ solid( palette.accent ) }00`, at: 1 },
		],
	} );
	glow.name = __( 'Glow', 'wunderpaint' );
	glow.blend = 'screen';
	return glow;
}

/** True when the background role is dark (light ink = dark scene). */
const darkScene = ( palette ) =>
	contrastRatio( parseColor( palette.ink ), parseColor( '#ffffff' ) ) < 3;

/**
 * Decor plan per profile/scene: which quiet extras this design gets.
 * Designs WITH a photo only ever get the glow - the image is the
 * decoration, and watermarks/rings crossing a photo edge look broken.
 *
 * @param {Object} args { spec, doc, palette, recipe, profile, seed,
 *                        onPhoto, hasImage, headlineCenter }.
 * @return {Object} { behind: [], above: [] } layers to weave in.
 */
export function flairLayers( args ) {
	const {
		spec,
		doc,
		palette,
		recipe,
		profile,
		seed,
		onPhoto,
		hasImage,
		headlineCenter,
	} = args;
	const behind = [];
	const above = [];
	if ( onPhoto ) {
		if ( headlineCenter ) {
			above.push( glowLayer( doc, palette, headlineCenter, 0.26 ) );
		}
		return { behind, above };
	}
	if ( ! hasImage ) {
		if ( 'bold' === profile ) {
			const mark = watermarkLayer( spec, doc, palette, recipe );
			if ( mark ) {
				behind.push( mark );
			}
			behind.push( ringLayer( doc, palette, seed ) );
		} else if ( 'corporate' === profile ) {
			behind.push( cornerBlobLayer( doc, palette, seed ) );
			behind.push( dotGridLayer( doc, palette, seed ) );
		} else if ( 'playful' === profile ) {
			above.push( ...sparkleLayers( doc, palette, seed, args.stackTop ) );
		} else {
			behind.push( frameLayer( doc, palette ) );
		}
	}
	if ( darkScene( palette ) && headlineCenter ) {
		behind.push( glowLayer( doc, palette, headlineCenter, 0.16 ) );
	}
	return { behind, above };
}

/**
 * Palette-tinted placeholder "photo": soft diagonal wash plus a few
 * blurry light blobs - looks intentional in every slot and costs
 * nothing. The user swaps in a real image later.
 *
 * @param {Function} createCanvas Canvas factory (w, h).
 * @param {number}   w            Width.
 * @param {number}   h            Height.
 * @param {Object}   palette      Palette roles.
 * @param {number}   seed         Variant seed.
 * @return {Object} { src, w, h } - JPEG data URL plus its pixel size.
 */
export function placeholderPhoto( createCanvas, w, h, palette, seed ) {
	const scale = Math.min( 1, 1280 / Math.max( w, h ) );
	const cw = Math.max( 8, Math.round( w * scale ) );
	const ch = Math.max( 8, Math.round( h * scale ) );
	const canvas = createCanvas( cw, ch );
	const ctx = canvas.getContext( '2d' );
	const g = ctx.createLinearGradient( 0, 0, cw, ch );
	g.addColorStop( 0, solid( palette.surface ) );
	g.addColorStop( 0.55, solid( palette.accent ) );
	g.addColorStop( 1, solid( palette.bg ) );
	ctx.fillStyle = g;
	ctx.fillRect( 0, 0, cw, ch );
	// Soft "bokeh" blobs, deterministic per seed.
	for ( let i = 0; i < 7; i++ ) {
		const t = ( i * 137 + seed * 61 ) % 100;
		const u = ( i * 71 + seed * 37 ) % 100;
		const r = ( 0.12 + ( ( i * 29 ) % 17 ) / 60 ) * Math.min( cw, ch );
		const x = ( t / 100 ) * cw;
		const y = ( u / 100 ) * ch;
		const rg = ctx.createRadialGradient( x, y, 0, x, y, r );
		const tone = i % 2 ? solid( palette.surface ) : '#ffffff';
		rg.addColorStop( 0, tone + '2e' );
		rg.addColorStop( 1, tone + '00' );
		ctx.fillStyle = rg;
		ctx.beginPath();
		ctx.arc( x, y, r, 0, Math.PI * 2 );
		ctx.fill();
	}
	return { src: canvas.toDataURL( 'image/jpeg', 0.82 ), w: cw, h: ch };
}
