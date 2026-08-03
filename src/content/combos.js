/**
 * Text combinations (v1.13): professionally styled headline groups —
 * eyebrow + headline + subline, italic accents, mixed families, dividers.
 * Each build() returns fresh ordinary layers (texts + hairline shapes),
 * centered on the document; the insert op wraps them in a group.
 */

import { __ } from '@wordpress/i18n';

import { makeText, makeShape } from '../store/document';
import { comboToLayers } from '../lib/content-io';

/**
 * Every builder receives a context:
 *   u     , base unit: min(doc.w, doc.h)
 *   cx, cy, document center
 *   ink   , primary text color
 *   muted , secondary text color
 *   accent, accent color (first brand color when available)
 */
const ctxFor = ( doc, opts = {} ) => ( {
	u: Math.min( doc.w, doc.h ),
	cx: doc.w / 2,
	cy: doc.h / 2,
	ink: opts.ink || '#1a1d21',
	muted: opts.muted || 'rgba(26,29,33,0.62)',
	accent: opts.accent || '#3b66ff',
} );

/** Centered text block: y is the block's TOP edge, x derived from width. */
const t = ( c, props ) =>
	makeText( {
		align: 'center',
		fixedWidth: true,
		x: Math.round( c.cx - props.w / 2 ),
		...props,
	} );

/** Centered hairline / divider shape. */
const line = ( c, { y, w, h = 3, fill } ) =>
	makeShape( {
		name: __( 'Divider', 'wunderpaint' ),
		x: Math.round( c.cx - w / 2 ),
		y: Math.round( y ),
		w: Math.round( w ),
		h,
		fill: fill || c.accent,
	} );

const BUILDER_COMBOS = [
	{
		id: 'big-sale',
		label: __( 'Big Sale', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Eyebrow',
					text: 'LIMITED TIME',
					y: c.cy - 0.2 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.03 * s ),
					fontFamily: 'Archivo',
					weight: 700,
					letterSpacing: Math.round( 0.01 * s ),
					color: c.muted,
				} ),
				t( c, {
					name: 'Headline',
					text: 'MEGA SALE',
					y: c.cy - 0.14 * s,
					w: 0.9 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.16 * s ),
					fontFamily: 'Bebas Neue',
					weight: 400,
					letterSpacing: Math.round( 0.004 * s ),
					color: c.ink,
				} ),
				t( c, {
					name: 'Offer',
					text: 'UP TO 50% OFF',
					y: c.cy + 0.08 * s,
					w: 0.7 * s,
					h: 0.07 * s,
					fontSize: Math.round( 0.045 * s ),
					fontFamily: 'Archivo',
					weight: 800,
					color: c.accent,
				} ),
			];
		},
	},
	{
		id: 'pull-quote',
		label: __( 'Pull Quote', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Quote',
					text: '“Design is intelligence\nmade visible.”',
					y: c.cy - 0.14 * s,
					w: 0.82 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.062 * s ),
					fontFamily: 'Playfair Display',
					weight: 500,
					italic: true,
					lineHeight: 1.2,
					color: c.ink,
				} ),
				line( c, { y: c.cy + 0.1 * s, w: 0.07 * s } ),
				t( c, {
					name: 'Author',
					text: 'ALINA WHEELER',
					y: c.cy + 0.13 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.022 * s ),
					fontFamily: 'Inter',
					weight: 600,
					letterSpacing: Math.round( 0.006 * s ),
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'event-card',
		label: __( 'Event Card', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Date',
					text: 'SAT · 24 AUG · 8PM',
					y: c.cy - 0.18 * s,
					w: 0.8 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.028 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.006 * s ),
					color: c.accent,
				} ),
				t( c, {
					name: 'Title',
					text: 'Rooftop\nSessions',
					y: c.cy - 0.11 * s,
					w: 0.85 * s,
					h: 0.24 * s,
					fontSize: Math.round( 0.095 * s ),
					fontFamily: 'Anton',
					weight: 400,
					lineHeight: 1.02,
					color: c.ink,
				} ),
				t( c, {
					name: 'Venue',
					text: 'The Skyline Bar · Downtown',
					y: c.cy + 0.16 * s,
					w: 0.75 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.024 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'wordmark',
		label: __( 'Wordmark', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Brand',
					text: 'LUMEN',
					y: c.cy - 0.06 * s,
					w: 0.8 * s,
					h: 0.1 * s,
					fontSize: Math.round( 0.09 * s ),
					fontFamily: 'Archivo',
					weight: 800,
					letterSpacing: Math.round( 0.02 * s ),
					color: c.ink,
				} ),
				t( c, {
					name: 'Tagline',
					text: 'S T U D I O',
					y: c.cy + 0.06 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 500,
					letterSpacing: Math.round( 0.02 * s ),
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'bold-stack',
		label: __( 'Bold Stack', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Line 1',
					text: 'MAKE IT',
					y: c.cy - 0.16 * s,
					w: 0.85 * s,
					h: 0.11 * s,
					fontSize: Math.round( 0.11 * s ),
					fontFamily: 'Barlow Condensed',
					weight: 700,
					lineHeight: 0.95,
					color: c.ink,
				} ),
				t( c, {
					name: 'Line 2',
					text: 'HAPPEN',
					y: c.cy - 0.04 * s,
					w: 0.85 * s,
					h: 0.11 * s,
					fontSize: Math.round( 0.11 * s ),
					fontFamily: 'Barlow Condensed',
					weight: 700,
					lineHeight: 0.95,
					color: c.accent,
				} ),
				t( c, {
					name: 'Subline',
					text: 'no excuses, just results',
					y: c.cy + 0.1 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'editorial',
		label: __( 'Editorial', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Eyebrow',
					text: 'NEW COLLECTION',
					y: c.cy - 0.16 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.008 * s ),
					color: c.accent,
				} ),
				t( c, {
					name: 'Headline',
					text: 'Timeless pieces,\nmodern attitude',
					y: c.cy - 0.1 * s,
					w: 0.82 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.075 * s ),
					fontFamily: 'Playfair Display',
					weight: 700,
					lineHeight: 1.12,
					color: c.ink,
				} ),
				t( c, {
					name: 'Subline',
					text: 'Discover the pieces everyone talks about.',
					y: c.cy + 0.13 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'italic-accent',
		label: __( 'Italic Accent', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Accent',
					text: 'feels like',
					y: c.cy - 0.17 * s,
					w: 0.6 * s,
					h: 0.1 * s,
					fontSize: Math.round( 0.065 * s ),
					fontFamily: 'Playfair Display',
					weight: 500,
					italic: true,
					color: c.accent,
				} ),
				t( c, {
					name: 'Headline',
					text: 'SUMMER',
					y: c.cy - 0.07 * s,
					w: 0.85 * s,
					h: 0.2 * s,
					fontSize: Math.round( 0.17 * s ),
					fontFamily: 'Anton',
					weight: 400,
					letterSpacing: Math.round( 0.006 * s ),
					color: c.ink,
				} ),
				t( c, {
					name: 'Subline',
					text: 'the season starts now',
					y: c.cy + 0.15 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.028 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'serif-divider',
		label: __( 'Serif & Divider', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Headline',
					text: 'The Art of\nSlow Living',
					y: c.cy - 0.17 * s,
					w: 0.8 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.08 * s ),
					fontFamily: 'DM Serif Display',
					weight: 400,
					lineHeight: 1.14,
					color: c.ink,
				} ),
				line( c, { y: c.cy + 0.08 * s, w: 0.09 * s } ),
				t( c, {
					name: 'Subline',
					text: 'A JOURNAL ON MINDFUL DESIGN',
					y: c.cy + 0.11 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.022 * s ),
					fontFamily: 'Inter',
					weight: 600,
					letterSpacing: Math.round( 0.007 * s ),
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'big-statement',
		label: __( 'Big Statement', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Headline',
					text: 'GO\nBOLD',
					y: c.cy - 0.24 * s,
					w: 0.8 * s,
					h: 0.42 * s,
					fontSize: Math.round( 0.19 * s ),
					fontFamily: 'Bebas Neue',
					weight: 400,
					lineHeight: 0.94,
					color: c.ink,
				} ),
				t( c, {
					name: 'Subline',
					text: 'or go home',
					y: c.cy + 0.18 * s,
					w: 0.5 * s,
					h: 0.08 * s,
					fontSize: Math.round( 0.045 * s ),
					fontFamily: 'Playfair Display',
					weight: 500,
					italic: true,
					color: c.accent,
				} ),
			];
		},
	},
	{
		id: 'quote',
		label: __( 'Quote', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Quote mark',
					text: '“',
					y: c.cy - 0.28 * s,
					w: 0.3 * s,
					h: 0.2 * s,
					fontSize: Math.round( 0.2 * s ),
					fontFamily: 'Playfair Display',
					weight: 700,
					color: c.accent,
				} ),
				t( c, {
					name: 'Quote',
					text: 'Simplicity is the\nultimate sophistication.',
					y: c.cy - 0.1 * s,
					w: 0.8 * s,
					h: 0.18 * s,
					fontSize: Math.round( 0.055 * s ),
					fontFamily: 'Playfair Display',
					weight: 500,
					italic: true,
					lineHeight: 1.3,
					color: c.ink,
				} ),
				t( c, {
					name: 'Author',
					text: 'LEONARDO DA VINCI',
					y: c.cy + 0.12 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.022 * s ),
					fontFamily: 'Inter',
					weight: 600,
					letterSpacing: Math.round( 0.005 * s ),
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'price',
		label: __( 'Price Tag', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Eyebrow',
					text: 'ONLY',
					y: c.cy - 0.19 * s,
					w: 0.4 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.03 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.009 * s ),
					color: c.muted,
				} ),
				t( c, {
					name: 'Price',
					text: '$29',
					y: c.cy - 0.13 * s,
					w: 0.6 * s,
					h: 0.24 * s,
					fontSize: Math.round( 0.18 * s ),
					fontFamily: 'Archivo',
					weight: 700,
					color: c.accent,
				} ),
				t( c, {
					name: 'Detail',
					text: 'per month, cancel anytime',
					y: c.cy + 0.13 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'event',
		label: __( 'Event Date', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Day',
					text: '24',
					y: c.cy - 0.22 * s,
					w: 0.44 * s,
					h: 0.26 * s,
					fontSize: Math.round( 0.2 * s ),
					fontFamily: 'Anton',
					weight: 400,
					color: c.ink,
				} ),
				t( c, {
					name: 'Month',
					text: 'AUGUST · 8 PM',
					y: c.cy + 0.05 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.032 * s ),
					fontFamily: 'Barlow Condensed',
					weight: 600,
					letterSpacing: Math.round( 0.006 * s ),
					color: c.accent,
				} ),
				t( c, {
					name: 'Venue',
					text: 'Rooftop Garden, Berlin',
					y: c.cy + 0.12 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'sale-pill',
		label: __( 'Sale + Badge', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			const pillW = 0.42 * s;
			const pillH = 0.075 * s;
			const pill = makeShape( {
				name: 'Badge',
				x: Math.round( c.cx - pillW / 2 ),
				y: Math.round( c.cy + 0.12 * s ),
				w: Math.round( pillW ),
				h: Math.round( pillH ),
				radius: Math.round( pillH / 2 ),
				fill: c.accent,
			} );
			return [
				t( c, {
					name: 'Headline',
					text: 'SALE',
					y: c.cy - 0.2 * s,
					w: 0.8 * s,
					h: 0.28 * s,
					fontSize: Math.round( 0.21 * s ),
					fontFamily: 'Bebas Neue',
					weight: 400,
					color: c.ink,
				} ),
				pill,
				t( c, {
					name: 'Badge text',
					text: 'UP TO 50% OFF',
					y: c.cy + 0.132 * s,
					w: pillW,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.004 * s ),
					color: '#ffffff',
				} ),
			];
		},
	},
	{
		id: 'minimal-caps',
		label: __( 'Minimal Caps', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				line( c, {
					y: c.cy - 0.09 * s,
					w: 0.5 * s,
					h: 2,
					fill: c.muted,
				} ),
				t( c, {
					name: 'Headline',
					text: 'E S S E N T I A L S',
					y: c.cy - 0.045 * s,
					w: 0.8 * s,
					h: 0.09 * s,
					fontSize: Math.round( 0.05 * s ),
					fontFamily: 'Inter',
					weight: 400,
					letterSpacing: Math.round( 0.012 * s ),
					color: c.ink,
				} ),
				line( c, {
					y: c.cy + 0.07 * s,
					w: 0.5 * s,
					h: 2,
					fill: c.muted,
				} ),
			];
		},
	},
	{
		id: 'condensed-stack',
		label: __( 'Condensed Stack', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Kicker',
					text: 'THIS WEEKEND',
					y: c.cy - 0.18 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.026 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.008 * s ),
					color: c.accent,
				} ),
				t( c, {
					name: 'Headline',
					text: 'STREET FOOD\nFESTIVAL',
					y: c.cy - 0.12 * s,
					w: 0.84 * s,
					h: 0.26 * s,
					fontSize: Math.round( 0.09 * s ),
					fontFamily: 'Barlow Condensed',
					weight: 700,
					lineHeight: 1.02,
					color: c.ink,
				} ),
				t( c, {
					name: 'Body',
					text: '40+ trucks · live music · free entry',
					y: c.cy + 0.15 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.027 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'playful',
		label: __( 'Playful', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Intro',
					text: 'hello, weekend!',
					y: c.cy - 0.16 * s,
					w: 0.7 * s,
					h: 0.1 * s,
					fontSize: Math.round( 0.07 * s ),
					fontFamily: 'Amatic SC',
					weight: 700,
					color: c.accent,
				} ),
				t( c, {
					name: 'Headline',
					text: 'PANCAKE\nBRUNCH',
					y: c.cy - 0.05 * s,
					w: 0.8 * s,
					h: 0.24 * s,
					fontSize: Math.round( 0.095 * s ),
					fontFamily: 'Anton',
					weight: 400,
					lineHeight: 1.05,
					color: c.ink,
				} ),
				t( c, {
					name: 'Subline',
					text: 'every Sunday from 10 am',
					y: c.cy + 0.2 * s,
					w: 0.6 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.027 * s ),
					fontFamily: 'Inter',
					weight: 400,
					color: c.muted,
				} ),
			];
		},
	},
	{
		id: 'fashion-serif',
		label: __( 'Fashion Serif', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Eyebrow',
					text: 'ISSUE Nº 12',
					y: c.cy - 0.17 * s,
					w: 0.5 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.022 * s ),
					fontFamily: 'Inter',
					weight: 600,
					letterSpacing: Math.round( 0.01 * s ),
					color: c.muted,
				} ),
				t( c, {
					name: 'Headline',
					text: 'Vogue',
					y: c.cy - 0.12 * s,
					w: 0.8 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.15 * s ),
					fontFamily: 'Abril Fatface',
					weight: 400,
					color: c.ink,
				} ),
				t( c, {
					name: 'Accent',
					text: 'the autumn edit',
					y: c.cy + 0.1 * s,
					w: 0.6 * s,
					h: 0.08 * s,
					fontSize: Math.round( 0.045 * s ),
					fontFamily: 'Playfair Display',
					weight: 500,
					italic: true,
					color: c.accent,
				} ),
			];
		},
	},
	{
		id: 'cta',
		label: __( 'Call to Action', 'wunderpaint' ),
		build( doc, opts ) {
			const c = ctxFor( doc, opts );
			const s = c.u;
			return [
				t( c, {
					name: 'Headline',
					text: 'Ready when\nyou are.',
					y: c.cy - 0.17 * s,
					w: 0.8 * s,
					h: 0.22 * s,
					fontSize: Math.round( 0.08 * s ),
					fontFamily: 'Archivo',
					weight: 700,
					lineHeight: 1.08,
					color: c.ink,
				} ),
				line( c, { y: c.cy + 0.07 * s, w: 0.14 * s, h: 4 } ),
				t( c, {
					name: 'CTA',
					text: 'START YOUR FREE TRIAL →',
					y: c.cy + 0.11 * s,
					w: 0.7 * s,
					h: 0.05 * s,
					fontSize: Math.round( 0.025 * s ),
					fontFamily: 'Inter',
					weight: 700,
					letterSpacing: Math.round( 0.005 * s ),
					color: c.accent,
				} ),
			];
		},
	},
];

/**
 * Bundled text combinations (v1.20): authored in the editor via File →
 * Export for Library → "Export as Text Combination", dropped into
 * src/content/bundled-combos/ and aggregated by tools/build-content.js. Each
 * exposes the same build(doc) contract, the layers scale to fit and center
 * in the target document.
 */
/**
 * Wrap the raw bundled combos. The data arrives from ./index.js, which
 * fetches the shipped (pre-compressed) pack: importing the JSON here would
 * put ~2 MB back into a webpack chunk, downloaded uncompressed.
 *
 * @param {Array} descriptors Raw `wpie-combo@1` descriptors.
 * @return {Array} Bundled combos in the runtime contract.
 */
const buildBundled = ( descriptors ) =>
	descriptors.map( ( descriptor ) => ( {
		id: descriptor.id,
		label: descriptor.label,
		bundled: true,
		category: descriptor.category || 'headlines',
		// Word-art lockups are MARKS: they fill the document (and scale
		// UP to get there) instead of dropping in at badge size.
		build: ( doc ) =>
			comboToLayers(
				descriptor,
				doc,
				'wordart' === descriptor.category ? { fit: 'mark' } : {}
			),
	} ) );

// Categories of the (fixed) builder combos.
const BUILDER_CATEGORY = {
	'big-sale': 'sales',
	'pull-quote': 'quotes',
	'event-card': 'events',
	wordmark: 'headlines',
	'bold-stack': 'headlines',
	editorial: 'headlines',
	'italic-accent': 'headlines',
	'serif-divider': 'headlines',
	'big-statement': 'headlines',
	quote: 'quotes',
	price: 'sales',
	event: 'events',
	'sale-pill': 'sales',
	'minimal-caps': 'headlines',
	'condensed-stack': 'headlines',
	playful: 'headlines',
	'fashion-serif': 'headlines',
	cta: 'buttons',
};

/**
 * The full combo set: the parameterized builders in this module plus the
 * bundled descriptors fetched from the shipped pack.
 *
 * @param {Array} descriptors Raw bundled combo descriptors.
 * @return {Array} Every combo, builders first.
 */
export const buildCombos = ( descriptors ) => [
	...BUILDER_COMBOS.map( ( c ) => ( {
		...c,
		category: BUILDER_CATEGORY[ c.id ] || 'headlines',
	} ) ),
	...buildBundled( descriptors ),
];
