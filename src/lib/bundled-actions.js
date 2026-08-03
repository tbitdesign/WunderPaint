/**
 * Bundled starter actions (v1.246): a curated, read-only set of practical
 * one-click recipes shipped with the editor. Pure data on the macro-op
 * vocabulary (lib/macros.js) - every step must reference a registered op,
 * every effect a registered effect id, so bundled-actions.test.js can
 * verify the whole set against the real registries.
 *
 * Users cannot delete these; their own recorded actions live alongside in
 * localStorage and group under "My Actions".
 */

import { __ } from '@wordpress/i18n';

/** Display order + labels of the bundled categories. */
export const ACTION_CATEGORIES = {
	web: () => __( 'Web & Sizes', 'wunderpaint' ),
	fix: () => __( 'Photo Fixes', 'wunderpaint' ),
	looks: () => __( 'Looks & Styles', 'wunderpaint' ),
	artistic: () => __( 'Artistic', 'wunderpaint' ),
	ai: () => __( 'Privacy & AI', 'wunderpaint' ),
	social: () => __( 'Social Formats', 'wunderpaint' ),
	utility: () => __( 'Utilities', 'wunderpaint' ),
};

const a = ( id, category, name, steps ) => ( {
	id: `ba-${ id }`,
	name,
	category,
	kind: 'macro',
	builtIn: true,
	steps,
} );

const effect = ( id, params = {} ) => ( {
	op: 'applyEffect',
	params: { id, params },
} );
const filter = ( id ) => ( { op: 'applyFilter', params: { id } } );
const adjust = ( fields ) => ( {
	op: 'setAdjustments',
	params: { adjust: fields },
} );
const maxW = ( px ) => ( { op: 'resizeImage', params: { maxW: px } } );
const social = ( ratio, w, h ) => ( {
	op: 'cropAspect',
	params: { ratio, w, h },
} );

/* Gentle output sharpening after a downscale. */
const webSharpen = effect( 'unsharp-mask', {
	radius: 1,
	amount: 60,
	threshold: 2,
} );

export const BUNDLED_ACTIONS = [
	/* ----------------------------- Web & Sizes ---------------------------- */
	a( 'web-1600', 'web', __( 'Web Optimized 1600px', 'wunderpaint' ), [
		maxW( 1600 ),
		webSharpen,
	] ),
	a( 'web-1200', 'web', __( 'Web Optimized 1200px', 'wunderpaint' ), [
		maxW( 1200 ),
		webSharpen,
	] ),
	a( 'web-800', 'web', __( 'Email Friendly 800px', 'wunderpaint' ), [
		maxW( 800 ),
		effect( 'unsharp-mask', { radius: 1, amount: 50, threshold: 2 } ),
	] ),
	a( 'web-thumb', 'web', __( 'Thumbnail 400px', 'wunderpaint' ), [
		maxW( 400 ),
		effect( 'unsharp-mask', { radius: 1, amount: 70, threshold: 2 } ),
	] ),
	a( 'web-fullhd', 'web', __( 'Fit to Full HD', 'wunderpaint' ), [
		maxW( 1920 ),
	] ),
	a( 'web-half', 'web', __( 'Half Size (50%)', 'wunderpaint' ), [
		{ op: 'resizePercent', params: { percent: 50 } },
	] ),
	a( 'web-flat', 'web', __( 'Flatten + Web 2000px', 'wunderpaint' ), [
		{ op: 'flatten', params: {} },
		maxW( 2000 ),
		webSharpen,
	] ),

	/* ----------------------------- Photo Fixes ---------------------------- */
	a( 'fix-auto', 'fix', __( 'Auto Fix', 'wunderpaint' ), [
		effect( 'auto-levels' ),
		effect( 'auto-color' ),
		effect( 'unsharp-mask', { radius: 1, amount: 50, threshold: 2 } ),
	] ),
	a( 'fix-under', 'fix', __( 'Rescue Underexposed', 'wunderpaint' ), [
		adjust( { exposure: 25, contrast: 5, vibrance: 15 } ),
		effect( 'shadows-highlights', { shadows: 35, highlights: -10 } ),
	] ),
	a( 'fix-over', 'fix', __( 'Rescue Overexposed', 'wunderpaint' ), [
		adjust( { exposure: -20, contrast: 10 } ),
		effect( 'shadows-highlights', { shadows: 5, highlights: -45 } ),
	] ),
	a( 'fix-backlight', 'fix', __( 'Backlight Fix', 'wunderpaint' ), [
		effect( 'shadows-highlights', { shadows: 55, highlights: -25 } ),
	] ),
	a( 'fix-dehaze', 'fix', __( 'Remove Haze', 'wunderpaint' ), [
		effect( 'levels', {
			inBlack: 12,
			inWhite: 243,
			gamma: 1,
			outBlack: 0,
			outWhite: 255,
		} ),
		adjust( { contrast: 15, saturation: 10 } ),
	] ),
	a( 'fix-phone', 'fix', __( 'Phone Photo Fix', 'wunderpaint' ), [
		effect( 'denoise', { strength: 1 } ),
		effect( 'auto-levels' ),
		effect( 'unsharp-mask', { radius: 2, amount: 80, threshold: 2 } ),
	] ),
	a( 'fix-scan', 'fix', __( 'Refresh Old Scan', 'wunderpaint' ), [
		effect( 'auto-color' ),
		effect( 'denoise', { strength: 1 } ),
		effect( 'levels', {
			inBlack: 8,
			inWhite: 245,
			gamma: 1,
			outBlack: 0,
			outWhite: 255,
		} ),
	] ),
	a( 'fix-denoise', 'fix', __( 'Reduce Noise', 'wunderpaint' ), [
		effect( 'denoise', { strength: 2 } ),
		effect( 'unsharp-mask', { radius: 1, amount: 40, threshold: 3 } ),
	] ),
	a( 'fix-skin', 'fix', __( 'Calm Skin Tones', 'wunderpaint' ), [
		adjust( { saturation: -10, temp: 4 } ),
		effect( 'denoise', { strength: 1 } ),
	] ),

	/* ---------------------------- Looks & Styles -------------------------- */
	a( 'look-cinematic', 'looks', __( 'Cinematic Warm', 'wunderpaint' ), [
		adjust( { temp: 15, contrast: 14, vibrance: 12 } ),
		effect( 'vignette', { amount: 25, size: 65, softness: 60 } ),
	] ),
	a( 'look-golden', 'looks', __( 'Golden Hour', 'wunderpaint' ), [
		adjust( { temp: 30, exposure: 6, vibrance: 10 } ),
		effect( 'vignette', { amount: 20, size: 70, softness: 60 } ),
	] ),
	a( 'look-summer', 'looks', __( 'Summer Warm', 'wunderpaint' ), [
		filter( 'warm' ),
		adjust( { vibrance: 12 } ),
	] ),
	a( 'look-nordic', 'looks', __( 'Nordic Cool', 'wunderpaint' ), [
		filter( 'cool' ),
		adjust( { contrast: -5, brightness: 4 } ),
	] ),
	a( 'look-matte', 'looks', __( 'Matte Film Fade', 'wunderpaint' ), [
		filter( 'faded' ),
		effect( 'levels', {
			inBlack: 0,
			inWhite: 255,
			gamma: 1,
			outBlack: 22,
			outWhite: 245,
		} ),
	] ),
	a( 'look-70s', 'looks', __( 'Analog 70s', 'wunderpaint' ), [
		filter( 'vintage' ),
		effect( 'add-noise', { amount: 10, size: 1, monochrome: true } ),
		effect( 'vignette', { amount: 35, size: 55, softness: 55 } ),
	] ),
	a( 'look-pastel', 'looks', __( 'Soft Pastel', 'wunderpaint' ), [
		adjust( { saturation: -18, brightness: 8, contrast: -8 } ),
	] ),
	a( 'look-punch', 'looks', __( 'Punchy Social', 'wunderpaint' ), [
		filter( 'punch' ),
		effect( 'unsharp-mask', { radius: 1, amount: 70, threshold: 0 } ),
	] ),
	a( 'look-bw', 'looks', __( 'Classic B&W', 'wunderpaint' ), [
		filter( 'mono' ),
		adjust( { contrast: 12 } ),
	] ),
	a( 'look-bw-drama', 'looks', __( 'Dramatic B&W', 'wunderpaint' ), [
		filter( 'noir' ),
		effect( 'vignette', { amount: 45, size: 50, softness: 45 } ),
	] ),
	a( 'look-sepia', 'looks', __( 'Sepia Postcard', 'wunderpaint' ), [
		filter( 'sepia' ),
		effect( 'vignette', { amount: 25, size: 60, softness: 60 } ),
	] ),
	a( 'look-cyber', 'looks', __( 'Cyberpunk Duotone', 'wunderpaint' ), [
		effect( 'duotone', { shadow: '#1a0533', highlight: '#00e5ff' } ),
		adjust( { contrast: 10 } ),
	] ),
	a( 'look-emerald', 'looks', __( 'Emerald Duotone', 'wunderpaint' ), [
		effect( 'duotone', { shadow: '#062b25', highlight: '#d9f7ef' } ),
	] ),
	a( 'look-crimson', 'looks', __( 'Crimson Duotone', 'wunderpaint' ), [
		effect( 'duotone', { shadow: '#2b060e', highlight: '#ffe3d0' } ),
	] ),

	/* ------------------------------ Artistic ------------------------------ */
	a( 'art-halftone', 'artistic', __( 'Halftone Print', 'wunderpaint' ), [
		filter( 'mono' ),
		effect( 'halftone', { cell: 6, angle: 45 } ),
	] ),
	a( 'art-poster', 'artistic', __( 'Poster Style', 'wunderpaint' ), [
		effect( 'posterize', { levels: 5 } ),
		effect( 'auto-contrast' ),
	] ),
	a( 'art-popart', 'artistic', __( 'Pop Art', 'wunderpaint' ), [
		effect( 'posterize', { levels: 4 } ),
		adjust( { saturation: 45, contrast: 20 } ),
	] ),
	a( 'art-emboss', 'artistic', __( 'Emboss Relief', 'wunderpaint' ), [
		effect( 'emboss', { strength: 120 } ),
	] ),
	a( 'art-sketch', 'artistic', __( 'Sketch Lines', 'wunderpaint' ), [
		effect( 'edge-detect', { strength: 160 } ),
		effect( 'invert' ),
		filter( 'mono' ),
	] ),
	a( 'art-glitch', 'artistic', __( 'Glitch Cover', 'wunderpaint' ), [
		effect( 'glitch', { shift: 10, scanlines: 40, blocks: 35, seed: 7 } ),
	] ),
	a( 'art-glow', 'artistic', __( 'Dreamy Glow', 'wunderpaint' ), [
		effect( 'glow', { radius: 18, intensity: 55 } ),
		adjust( { brightness: 4 } ),
	] ),
	a( 'art-miniature', 'artistic', __( 'Miniature World', 'wunderpaint' ), [
		effect( 'tilt-shift', { center: 55, band: 28, radius: 14 } ),
		adjust( { saturation: 25, contrast: 10 } ),
	] ),
	a( 'art-splash', 'artistic', __( 'Color Splash Red', 'wunderpaint' ), [
		effect( 'color-splash', { hue: 0, range: 25 } ),
		adjust( { contrast: 8 } ),
	] ),
	a( 'art-pixel', 'artistic', __( 'Retro Pixels', 'wunderpaint' ), [
		effect( 'pixelate', { cell: 10 } ),
		effect( 'posterize', { levels: 8 } ),
	] ),

	/* ----------------------------- Privacy & AI --------------------------- */
	a( 'ai-faces', 'ai', __( 'Blur Faces', 'wunderpaint' ), [
		{ op: 'blurFaces', params: {} },
	] ),
	a( 'ai-removebg', 'ai', __( 'Remove Background', 'wunderpaint' ), [
		{ op: 'removeBackground', params: {} },
	] ),
	a( 'ai-upscale', 'ai', __( '2× Upscale', 'wunderpaint' ), [
		{ op: 'upscale2x', params: {} },
	] ),
	a( 'ai-cutout-web', 'ai', __( 'Cutout + Web 1600px', 'wunderpaint' ), [
		{ op: 'removeBackground', params: {} },
		maxW( 1600 ),
	] ),
	a( 'ai-upscale-sharp', 'ai', __( 'Upscale + Sharpen', 'wunderpaint' ), [
		{ op: 'upscale2x', params: {} },
		webSharpen,
	] ),
	a( 'ai-anon-web', 'ai', __( 'Anonymize + Web 1600px', 'wunderpaint' ), [
		{ op: 'blurFaces', params: {} },
		maxW( 1600 ),
		webSharpen,
	] ),

	/* ---------------------------- Social Formats -------------------------- */
	a(
		'soc-ig-square',
		'social',
		__( 'Instagram Square 1080', 'wunderpaint' ),
		[ social( '1:1', 1080, 1080 ) ]
	),
	a(
		'soc-ig-portrait',
		'social',
		__( 'Instagram Portrait 4:5', 'wunderpaint' ),
		[ social( '4:5', 1080, 1350 ) ]
	),
	a( 'soc-story', 'social', __( 'Story / Reel 9:16', 'wunderpaint' ), [
		social( '9:16', 1080, 1920 ),
	] ),
	a( 'soc-youtube', 'social', __( 'YouTube Thumbnail', 'wunderpaint' ), [
		social( '16:9', 1280, 720 ),
	] ),
	a( 'soc-og', 'social', __( 'OG Image 1200×630', 'wunderpaint' ), [
		social( '1200:630', 1200, 630 ),
	] ),
	a( 'soc-pinterest', 'social', __( 'Pinterest 2:3', 'wunderpaint' ), [
		social( '2:3', 1000, 1500 ),
	] ),
	a( 'soc-x-header', 'social', __( 'X / Twitter Header', 'wunderpaint' ), [
		social( '3:1', 1500, 500 ),
	] ),

	/* ------------------------------ Utilities ----------------------------- */
	a( 'util-rotate', 'utility', __( 'Rotate CW + Flatten', 'wunderpaint' ), [
		{ op: 'rotate90', params: { cw: true } },
		{ op: 'flatten', params: {} },
	] ),
	a( 'util-mirror', 'utility', __( 'Mirror Horizontal', 'wunderpaint' ), [
		{ op: 'flip', params: { horizontal: true } },
	] ),
	a( 'util-print', 'utility', __( 'Print Prep', 'wunderpaint' ), [
		{ op: 'flatten', params: {} },
		effect( 'unsharp-mask', { radius: 1, amount: 40, threshold: 2 } ),
	] ),
];
