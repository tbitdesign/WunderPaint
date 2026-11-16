/** Art-directed defaults and controls for the refreshed built-in text effects. */
import { __ } from '@wordpress/i18n';

export const TEXT_EFFECT_RECIPES = {
	longShadow: {
		group: 'depth',
		def: { angle: 40, length: 64, color: '#283953', fade: 70 },
		params: [
			{
				key: 'fade',
				label: __( 'Fade', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	extrude: {
		group: 'depth',
		def: { angle: 32, depth: 24, color: '#38455f', color2: '#8aa3bb' },
		params: [
			{
				key: 'color2',
				label: __( 'Color 2', 'wunderpaint' ),
				color: true,
			},
		],
	},
	glow: {
		group: 'light',
		def: { color: '#5adad1', size: 20, intensity: 75 },
		params: [
			{
				key: 'intensity',
				label: __( 'Intensity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	echo: {
		group: 'depth',
		def: {
			angle: 22,
			count: 7,
			gap: 10,
			color: '#88d9d5',
			color2: '#6655a2',
			decay: 65,
		},
		params: [
			{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
			{
				key: 'color2',
				label: __( 'Color 2', 'wunderpaint' ),
				color: true,
			},
			{
				key: 'decay',
				label: __( 'Fade', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	skew: { group: 'transform', def: { x: -10, y: -2 }, params: [] },
	outline: {
		group: 'contour',
		def: { size: 4, color: '#e5dcc9' },
		params: [],
	},
	neon: {
		group: 'light',
		def: { color: '#ff5eb9', size: 22, intensity: 85 },
		params: [
			{
				key: 'intensity',
				label: __( 'Intensity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	splice: {
		group: 'print',
		def: { angle: 30, offset: 7, color: '#6fdacf', width: 2 },
		params: [
			{
				key: 'width',
				label: __( 'Line width', 'wunderpaint' ),
				min: 1,
				max: 8,
			},
		],
	},
	dotShadow: {
		group: 'print',
		def: { angle: 38, offset: 12, color: '#21394e', size: 7 },
		params: [
			{
				key: 'size',
				label: __( 'Dot size', 'wunderpaint' ),
				min: 2,
				max: 24,
			},
		],
	},
	reflection: {
		group: 'light',
		def: { gap: 3, alpha: 50, fade: 75 },
		params: [
			{
				key: 'fade',
				label: __( 'Fade', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	rings: {
		group: 'contour',
		def: {
			size: 4,
			count: 3,
			color: '#fff1d8',
			color2: '#a8734a',
			color3: '#352a35',
		},
		params: [],
	},
	bevel: {
		group: 'soft',
		def: { depth: 6, lightAngle: 125, shine: 65 },
		params: [
			{
				key: 'lightAngle',
				label: __( 'Light angle', 'wunderpaint' ),
				min: 0,
				max: 360,
			},
			{
				key: 'shine',
				label: __( 'Shine', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	letterpress: {
		group: 'print',
		def: { depth: 5, lightAngle: 125, shine: 45 },
		params: [
			{
				key: 'lightAngle',
				label: __( 'Light angle', 'wunderpaint' ),
				min: 0,
				max: 360,
			},
			{
				key: 'shine',
				label: __( 'Shine', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	imageFill: {
		group: 'essentials',
		def: { zoom: 100, x: 0, y: 0 },
		params: [
			{
				key: 'zoom',
				label: __( 'Zoom', 'wunderpaint' ),
				min: 50,
				max: 300,
			},
			{
				key: 'x',
				label: __( 'Position X', 'wunderpaint' ),
				min: -100,
				max: 100,
			},
			{
				key: 'y',
				label: __( 'Position Y', 'wunderpaint' ),
				min: -100,
				max: 100,
			},
		],
	},
	jitter: {
		group: 'transform',
		def: { amount: 35, seed: 4, rotation: 65, spread: 50 },
		params: [
			{
				key: 'rotation',
				label: __( 'Rotation', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
			{
				key: 'spread',
				label: __( 'Spread', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	rainbow: {
		group: 'essentials',
		def: { offset: 20, saturation: 70 },
		params: [
			{
				key: 'offset',
				label: __( 'Hue', 'wunderpaint' ),
				min: 0,
				max: 360,
			},
			{
				key: 'saturation',
				label: __( 'Saturation', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	chromatic: {
		group: 'light',
		def: { offset: 3, angle: 15, color: '#59dae8', color2: '#f66d95' },
		params: [
			{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
			{
				key: 'color2',
				label: __( 'Color 2', 'wunderpaint' ),
				color: true,
			},
		],
	},
	glitch: {
		group: 'transform',
		def: { strength: 10, slices: 10, seed: 8 },
		params: [],
	},
	shine: {
		group: 'light',
		def: { width: 20, opacity: 75, pos: 34, angle: 118 },
		params: [],
	},
	scanlines: {
		group: 'print',
		def: { gap: 5, opacity: 25, width: 1 },
		params: [
			{
				key: 'width',
				label: __( 'Line width', 'wunderpaint' ),
				min: 1,
				max: 8,
			},
		],
	},
	grunge: {
		group: 'print',
		def: { amount: 34, scale: 90, seed: 7 },
		params: [],
	},
	dashedOutline: {
		group: 'contour',
		def: { width: 1, dash: 7, gap: 5, color: '#e7b568' },
		params: [],
	},
	innerGlow: {
		group: 'light',
		def: { size: 7, color: '#c2f5e2', intensity: 60 },
		params: [
			{
				key: 'intensity',
				label: __( 'Intensity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	neonTube: {
		group: 'light',
		def: { width: 3, glow: 24, color: '#ef70b8', intensity: 90 },
		params: [
			{
				key: 'intensity',
				label: __( 'Intensity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	motionBlur: {
		group: 'depth',
		def: { length: 48, angle: 180, opacity: 65 },
		params: [
			{
				key: 'opacity',
				label: __( 'Opacity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	marker: {
		group: 'marks',
		def: { style: 1, color: '#f3cc72', rough: 2, seed: 4, opacity: 80 },
		params: [
			{
				key: 'opacity',
				label: __( 'Opacity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	circleMark: {
		group: 'marks',
		def: { style: 1, color: '#de705e', rough: 3, seed: 6, opacity: 90 },
		params: [
			{
				key: 'opacity',
				label: __( 'Opacity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	scribbleUnder: {
		group: 'marks',
		def: { style: 1, color: '#51a39d', rough: 3, seed: 8, opacity: 100 },
		params: [
			{
				key: 'opacity',
				label: __( 'Opacity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	strikeFx: {
		group: 'marks',
		def: { style: 0, color: '#c46b65', rough: 2, seed: 4, opacity: 85 },
		params: [
			{
				key: 'opacity',
				label: __( 'Opacity', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	paperCut: {
		group: 'cut',
		def: { color: '#f4e8d8', pad: 18, radius: 8, opacity: 55, depth: 4 },
		params: [
			{
				key: 'depth',
				label: __( 'Depth', 'wunderpaint' ),
				min: 1,
				max: 24,
			},
		],
	},
	pixelate: { group: 'transform', def: { size: 5 }, params: [] },
	sketch: {
		group: 'print',
		def: { passes: 3, width: 1, rough: 2, seed: 11, color: '#8096a5' },
		params: [],
	},
	confetti: {
		group: 'marks',
		def: {
			density: 26,
			size: 5,
			seed: 5,
			color: '#e89273',
			color2: '#80cfc7',
		},
		params: [
			{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
			{
				key: 'color2',
				label: __( 'Color 2', 'wunderpaint' ),
				color: true,
			},
		],
	},
	stripesFill: {
		group: 'print',
		def: {
			width: 10,
			angle: 32,
			color: '#f3d4b5',
			color2: '#c66d85',
			color3: '#729caa',
			relief: 45,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	drip: {
		group: 'soft',
		def: { count: 5, length: 42, seed: 5, color: '#92bd54', shine: 55 },
		params: [
			{
				key: 'shine',
				label: __( 'Shine', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	groundShadow: {
		group: 'depth',
		def: {
			squash: 38,
			shear: 25,
			blur: 7,
			opacity: 40,
			color: '#182637',
			fade: 70,
		},
		params: [
			{
				key: 'fade',
				label: __( 'Fade', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	gradient: {
		group: 'essentials',
		def: {
			color: '#f7c6a5',
			color2: '#8a74bf',
			color3: '#78daca',
			angle: 115,
			midpoint: 55,
		},
		params: [
			{
				key: 'color3',
				label: __( 'Color 3', 'wunderpaint' ),
				color: true,
			},
			{
				key: 'midpoint',
				label: __( 'Midpoint', 'wunderpaint' ),
				min: 5,
				max: 95,
			},
		],
	},
	chrome: {
		group: 'metal',
		def: {
			color: '#c7d8e8',
			shine: 85,
			contrast: 75,
			relief: 55,
			lightAngle: 125,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
			{
				key: 'lightAngle',
				label: __( 'Light angle', 'wunderpaint' ),
				min: 0,
				max: 360,
			},
		],
	},
	comicDots: {
		group: 'print',
		def: { size: 6, color: '#453455', bg: '#ffcb8a', relief: 10 },
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	spray: {
		group: 'print',
		def: { density: 42, grain: 2, color: '#5a8b98' },
		params: [],
	},
	highlight: {
		group: 'marks',
		def: { color: '#cbe5d0', pad: 11, radius: 5, opacity: 90 },
		params: [],
	},
	underlineFx: {
		group: 'marks',
		def: { style: 1, thickness: 4, offset: 10, color: '#bf6e60' },
		params: [],
	},
	sticker: {
		group: 'marks',
		def: { size: 9, color: '#fff4e3', shadow: 40 },
		params: [],
	},
	burst: {
		group: 'marks',
		def: { count: 24, length: 56, gap: 42, color: '#d79b65' },
		params: [],
	},
	twoTone: {
		group: 'print',
		def: {
			angle: 32,
			split: 56,
			color: '#ecbf91',
			color2: '#7473a5',
			softness: 4,
		},
		params: [
			{
				key: 'softness',
				label: __( 'Softness', 'wunderpaint' ),
				min: 0,
				max: 50,
			},
		],
	},
	foil: {
		group: 'metal',
		def: {
			color: '#d4b471',
			sparkles: 10,
			seed: 7,
			relief: 48,
			lightAngle: 120,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
			{
				key: 'lightAngle',
				label: __( 'Light angle', 'wunderpaint' ),
				min: 0,
				max: 360,
			},
		],
	},
	stackShadow: {
		group: 'depth',
		def: {
			angle: 40,
			offset: 8,
			count: 3,
			color: '#be6579',
			color2: '#81a8ad',
			color3: '#e6bf84',
		},
		params: [],
	},
	offsetPrint: {
		group: 'print',
		def: { offset: 5, angle: 32, width: 1, color: '#d27476', grain: 28 },
		params: [
			{
				key: 'grain',
				label: __( 'Grain', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	fade: {
		group: 'transform',
		def: { angle: 105, amount: 70, midpoint: 50 },
		params: [
			{
				key: 'midpoint',
				label: __( 'Midpoint', 'wunderpaint' ),
				min: 5,
				max: 95,
			},
		],
	},
	softBlur: { group: 'transform', def: { amount: 4 }, params: [] },
	sparkle: {
		group: 'light',
		def: { count: 6, size: 13, color: '#fff1c8', seed: 5, glow: 35 },
		params: [
			{
				key: 'glow',
				label: __( 'Glow', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	inline: {
		group: 'contour',
		def: { inset: 5, width: 1, color: '#f4e3ba' },
		params: [],
	},
	contour: {
		group: 'contour',
		def: {
			count: 4,
			gap: 7,
			width: 1,
			color: '#9fcebe',
			color2: '#586f91',
		},
		params: [],
	},
	marquee: {
		group: 'light',
		def: { size: 4, gap: 12, color: '#ffe2a1', glow: 15 },
		params: [],
	},
	knockout: {
		group: 'cut',
		def: { color: '#243547', pad: 18, radius: 10, shadow: 35, relief: 30 },
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	checker: {
		group: 'print',
		def: { size: 11, color: '#ddd6c8', color2: '#434654', relief: 20 },
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	halftone: {
		group: 'print',
		def: { size: 7, strength: 75, angle: 35, color: '#3d4865' },
		params: [],
	},
	static: {
		group: 'print',
		def: {
			scale: 2,
			amount: 70,
			seed: 4,
			color: '#adcacb',
			color2: '#516778',
		},
		params: [
			{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
			{
				key: 'color2',
				label: __( 'Color 2', 'wunderpaint' ),
				color: true,
			},
		],
	},
	dotMatrix: {
		group: 'light',
		def: { size: 9, color: '#ffd18a', bg: '#181b29', glow: 8 },
		params: [],
	},
	fold: {
		group: 'cut',
		def: { bands: 6, strength: 60, angle: 32, seed: 6, relief: 35 },
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	waves: {
		group: 'mineral',
		def: {
			size: 55,
			amp: 6,
			color: '#8bd5cf',
			color2: '#445b93',
			relief: 55,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	motifFill: {
		group: 'print',
		def: {
			style: 2,
			size: 18,
			color: '#e9c784',
			bg: '#374052',
			relief: 20,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	camo: {
		group: 'mineral',
		def: {
			size: 24,
			seed: 8,
			bg: '#98a78b',
			color: '#657862',
			color2: '#c0baa0',
			color3: '#435656',
			relief: 20,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	circuit: {
		group: 'woven',
		def: { size: 22, color: '#78d5b4', bg: '#162b35', relief: 35 },
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	plaid: {
		group: 'woven',
		def: {
			size: 27,
			bg: '#c28b76',
			color: '#485e71',
			color2: '#ebd4ac',
			relief: 30,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	bubbles: {
		group: 'glass',
		def: { count: 22, size: 6, color: '#d1edf0', seed: 8, shine: 80 },
		params: [
			{
				key: 'shine',
				label: __( 'Shine', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	cracks: {
		group: 'mineral',
		def: { count: 7, color: '#365464', seed: 9, width: 1 },
		params: [
			{
				key: 'width',
				label: __( 'Line width', 'wunderpaint' ),
				min: 1,
				max: 8,
			},
		],
	},
	ripple: { group: 'transform', def: { amp: 5, size: 54 }, params: [] },
	seal: {
		group: 'marks',
		def: {
			points: 18,
			pad: 25,
			depth: 12,
			color: '#ba7866',
			color2: '#5c4050',
			relief: 45,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
	hatchShadow: {
		group: 'print',
		def: { offset: 13, angle: 38, gap: 5, color: '#5a788a', width: 1 },
		params: [
			{
				key: 'width',
				label: __( 'Line width', 'wunderpaint' ),
				min: 1,
				max: 8,
			},
		],
	},
	gradientOutline: {
		group: 'contour',
		def: { width: 5, angle: 35, color: '#ead6ae', color2: '#7aa9b1' },
		params: [],
	},
	wireframe: {
		group: 'contour',
		def: { color: '#90c1d6', width: 1, grid: 10, depth: 9 },
		params: [
			{
				key: 'depth',
				label: __( 'Depth', 'wunderpaint' ),
				min: 1,
				max: 24,
			},
		],
	},
	threeD: {
		group: 'depth',
		def: {
			angle: 32,
			depth: 22,
			color: '#f2ddc5',
			color2: '#ab7793',
			side: '#4d456a',
			border: '#fff0dd',
			relief: 35,
		},
		params: [
			{
				key: 'relief',
				label: __( 'Relief', 'wunderpaint' ),
				min: 0,
				max: 100,
			},
		],
	},
};

export function applyTextEffectRecipe( item ) {
	const update = TEXT_EFFECT_RECIPES[ item.id ];
	if ( ! update ) {
		return item;
	}
	const def = { ...item.def, ...update.def };
	return {
		...item,
		group: update.group,
		def,
		prev: { [ item.id ]: { ...def } },
	};
}

export function extendTextEffectParameters( definitions ) {
	const result = { ...definitions };
	for ( const [ id, update ] of Object.entries( TEXT_EFFECT_RECIPES ) ) {
		result[ id ] = [ ...( definitions[ id ] || [] ), ...update.params ];
	}
	return result;
}
