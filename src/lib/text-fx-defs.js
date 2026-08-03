/**
 * Text-effect definitions (v1.142.0): the tile list and the per-effect
 * parameter rows, shared by the Effects panel (tiles) and the floating
 * canvas settings card (sliders). Moved out of the panel so both can
 * import them without a cycle.
 */

import { __ } from '@wordpress/i18n';

export const TEXT_FX = [
	{
		id: 'longShadow',
		label: __( 'Long shadow', 'wunderpaint' ),
		def: { angle: 45, length: 40, color: 'rgba(0,0,0,0.28)' },
		prev: {
			longShadow: { angle: 45, length: 34, color: 'rgba(0,0,0,0.4)' },
		},
	},
	{
		id: 'extrude',
		label: __( 'Block shadow', 'wunderpaint' ),
		def: { angle: 45, depth: 20, color: '#1a1d21' },
		prev: { extrude: { angle: 45, depth: 16, color: '#1a1d21' } },
	},
	{
		id: 'glow',
		label: __( 'Glow', 'wunderpaint' ),
		def: { color: '#3ba7ff', size: 16 },
		prev: { glow: { color: '#3ba7ff', size: 16 } },
	},
	{
		id: 'echo',
		label: __( 'Echo', 'wunderpaint' ),
		def: { angle: 45, count: 6, gap: 10 },
		prev: { echo: { angle: 45, count: 6, gap: 9 } },
	},
	{
		id: 'skew',
		label: __( 'Skew', 'wunderpaint' ),
		def: { x: 15, y: 0 },
		prev: { skew: { x: 20, y: 0 } },
	},
	{
		id: 'outline',
		label: __( 'Outline', 'wunderpaint' ),
		def: { size: 8, color: '#ffffff' },
		prev: { outline: { size: 6, color: '#ffffff' } },
	},
	{
		id: 'neon',
		label: __( 'Neon', 'wunderpaint' ),
		def: { color: '#ff36c7', size: 18 },
		prev: { neon: { color: '#ff36c7', size: 12 } },
	},
	{
		id: 'splice',
		label: __( 'Splice', 'wunderpaint' ),
		def: { angle: 45, offset: 10, color: '#e5484d' },
		prev: { splice: { angle: 45, offset: 8, color: '#e5484d' } },
	},
	{
		id: 'dotShadow',
		label: __( 'Halftone', 'wunderpaint' ),
		def: { angle: 45, offset: 14, color: '#1a1d21' },
		prev: { dotShadow: { angle: 45, offset: 10, color: '#1a1d21' } },
	},
	{
		id: 'reflection',
		label: __( 'Reflection', 'wunderpaint' ),
		def: { gap: 6, alpha: 45 },
		prev: { reflection: { gap: 3, alpha: 55 } },
		tall: true,
	},
	{
		id: 'rings',
		label: __( 'Multi outline', 'wunderpaint' ),
		def: { size: 6, count: 2, color: '#ffffff', color2: '#1a1d21' },
		prev: {
			rings: { size: 5, count: 2, color: '#ffffff', color2: '#1a1d21' },
		},
	},
	{
		id: 'bevel',
		label: __( 'Bevel', 'wunderpaint' ),
		def: { depth: 3 },
		prev: { bevel: { depth: 3 } },
	},
	{
		id: 'letterpress',
		label: __( 'Letterpress', 'wunderpaint' ),
		def: { depth: 3 },
		prev: { letterpress: { depth: 3 } },
	},
	{
		id: 'imageFill',
		label: __( 'Image fill', 'wunderpaint' ),
		def: { src: null },
		prev: { imageFill: { src: null } },
		fillPrev: true,
	},
	{
		id: 'jitter',
		label: __( 'Letter dance', 'wunderpaint' ),
		def: { amount: 50, seed: 1 },
		prev: { jitter: { amount: 60, seed: 1 } },
	},
	{
		id: 'rainbow',
		label: __( 'Color cycle', 'wunderpaint' ),
		def: {},
		prev: { rainbow: {} },
	},
	{
		id: 'chromatic',
		label: __( 'Chromatic', 'wunderpaint' ),
		def: { offset: 4, angle: 0 },
		prev: { chromatic: { offset: 5, angle: 0 } },
	},
	{
		id: 'glitch',
		label: __( 'Glitch', 'wunderpaint' ),
		def: { strength: 12, slices: 7, seed: 1 },
		prev: { glitch: { strength: 10, slices: 7, seed: 3 } },
	},
	{
		id: 'shine',
		label: __( 'Shine', 'wunderpaint' ),
		def: { width: 26, opacity: 65, pos: 38, angle: 115 },
		prev: { shine: { width: 30, opacity: 80, pos: 40, angle: 115 } },
	},
	{
		id: 'scanlines',
		label: __( 'Scanlines', 'wunderpaint' ),
		def: { gap: 4, opacity: 40 },
		prev: { scanlines: { gap: 4, opacity: 55 } },
	},
	{
		id: 'grunge',
		label: __( 'Grunge', 'wunderpaint' ),
		def: { amount: 50, scale: 70, seed: 1 },
		prev: { grunge: { amount: 60, scale: 60, seed: 2 } },
	},
	{
		id: 'dashedOutline',
		label: __( 'Stitch outline', 'wunderpaint' ),
		def: { width: 2, dash: 8, gap: 6, color: '#1a1d21' },
		prev: {
			dashedOutline: { width: 2, dash: 7, gap: 5, color: '#1a1d21' },
		},
	},
	{
		id: 'innerGlow',
		label: __( 'Inner glow', 'wunderpaint' ),
		def: { size: 10, color: '#ffe08a' },
		prev: { innerGlow: { size: 10, color: '#ffe08a' } },
	},
	{
		id: 'neonTube',
		label: __( 'Neon tube', 'wunderpaint' ),
		def: { width: 3, glow: 16, color: '#ff36c7' },
		prev: { neonTube: { width: 3, glow: 14, color: '#ff36c7' } },
	},
	{
		id: 'motionBlur',
		label: __( 'Motion blur', 'wunderpaint' ),
		def: { length: 40, angle: 180 },
		prev: { motionBlur: { length: 34, angle: 180 } },
	},
	{
		id: 'marker',
		label: __( 'Marker', 'wunderpaint' ),
		def: { color: '#ffe066', rough: 4, seed: 1 },
		prev: { marker: { color: '#ffe066', rough: 4, seed: 1 } },
	},
	{
		id: 'circleMark',
		label: __( 'Circle mark', 'wunderpaint' ),
		def: { color: '#e5484d', rough: 4, seed: 1 },
		prev: { circleMark: { color: '#e5484d', rough: 4, seed: 1 } },
	},
	{
		id: 'scribbleUnder',
		label: __( 'Scribble line', 'wunderpaint' ),
		def: { color: '#3b82f6', rough: 4, seed: 1 },
		prev: { scribbleUnder: { color: '#3b82f6', rough: 5, seed: 1 } },
	},
	{
		id: 'strikeFx',
		label: __( 'Strike / Cross', 'wunderpaint' ),
		def: { style: 2, color: '#e5484d', rough: 4, seed: 1 },
		prev: { strikeFx: { style: 2, color: '#e5484d', rough: 4, seed: 2 } },
	},
	{
		id: 'paperCut',
		label: __( 'Paper cut', 'wunderpaint' ),
		def: { color: '#ffffff', pad: 14, radius: 12, opacity: 45 },
		prev: {
			paperCut: { color: '#ffffff', pad: 10, radius: 10, opacity: 50 },
		},
	},
	{
		id: 'pixelate',
		label: __( '8-bit', 'wunderpaint' ),
		def: { size: 6 },
		prev: { pixelate: { size: 5 } },
	},
	{
		id: 'sketch',
		label: __( 'Sketch', 'wunderpaint' ),
		def: { passes: 2, width: 2, rough: 3, seed: 1, color: '#1a1d21' },
		prev: {
			sketch: {
				passes: 2,
				width: 2,
				rough: 4,
				seed: 2,
				color: '#1a1d21',
			},
		},
	},
	{
		id: 'confetti',
		label: __( 'Confetti', 'wunderpaint' ),
		def: { density: 40, size: 5, seed: 1 },
		prev: { confetti: { density: 45, size: 5, seed: 3 } },
	},
	{
		id: 'stripesFill',
		label: __( 'Stripes', 'wunderpaint' ),
		def: {
			width: 12,
			angle: 0,
			color: '#e5484d',
			color2: '#ff8a00',
			color3: '#f5d90a',
		},
		prev: {
			stripesFill: {
				width: 9,
				angle: 0,
				color: '#e5484d',
				color2: '#ff8a00',
				color3: '#f5d90a',
			},
		},
	},
	{
		id: 'drip',
		label: __( 'Drip', 'wunderpaint' ),
		def: { count: 5, length: 50, seed: 1 },
		prev: { drip: { count: 5, length: 36, seed: 2 } },
		tall: true,
	},
	{
		id: 'groundShadow',
		label: __( 'Ground shadow', 'wunderpaint' ),
		def: { squash: 45, shear: 25, blur: 6, opacity: 35, color: '#000000' },
		prev: {
			groundShadow: {
				squash: 50,
				shear: 30,
				blur: 5,
				opacity: 45,
				color: '#000000',
			},
		},
		tall: true,
	},
	{
		id: 'gradient',
		label: __( 'Gradient', 'wunderpaint' ),
		def: { color: '#ff5db1', color2: '#7b2ff7', angle: 90 },
		prev: { gradient: { color: '#ff5db1', color2: '#7b2ff7', angle: 90 } },
	},
	{
		id: 'chrome',
		label: __( 'Chrome', 'wunderpaint' ),
		def: { color: '#cfd6e4', shine: 50, contrast: 60 },
		prev: { chrome: { color: '#cfd6e4', shine: 46, contrast: 62 } },
	},
	{
		id: 'comicDots',
		label: __( 'Comic dots', 'wunderpaint' ),
		def: { size: 8, color: '#1a1d21', bg: '#ffd400' },
		prev: { comicDots: { size: 6, color: '#1a1d21', bg: '#ffd400' } },
	},
	{
		id: 'spray',
		label: __( 'Spray', 'wunderpaint' ),
		def: { density: 55, grain: 3, color: '#1a1d21' },
		prev: { spray: { density: 62, grain: 3, color: '#1a1d21' } },
	},
	{
		id: 'highlight',
		label: __( 'Highlight', 'wunderpaint' ),
		def: { color: '#ffe066', pad: 14, radius: 8, opacity: 100 },
		prev: {
			highlight: { color: '#ffe066', pad: 10, radius: 6, opacity: 100 },
		},
	},
	{
		id: 'underlineFx',
		label: __( 'Underline', 'wunderpaint' ),
		def: { style: 0, thickness: 8, offset: 8, color: '#e5484d' },
		prev: {
			underlineFx: {
				style: 2,
				thickness: 9,
				offset: 10,
				color: '#e5484d',
			},
		},
	},
	{
		id: 'sticker',
		label: __( 'Sticker', 'wunderpaint' ),
		def: { size: 12, color: '#ffffff', shadow: 35 },
		prev: { sticker: { size: 9, color: '#ffffff', shadow: 42 } },
	},
	{
		id: 'burst',
		label: __( 'Speed lines', 'wunderpaint' ),
		def: { count: 16, length: 60, gap: 40, color: '#111417' },
		prev: { burst: { count: 16, length: 40, gap: 34, color: '#111417' } },
	},
	{
		id: 'twoTone',
		label: __( 'Two tone', 'wunderpaint' ),
		def: { angle: 0, split: 50, color: '#ffd166', color2: '#ef476f' },
		prev: {
			twoTone: {
				angle: 0,
				split: 50,
				color: '#ffd166',
				color2: '#ef476f',
			},
		},
	},
	{
		id: 'foil',
		label: __( 'Gold foil', 'wunderpaint' ),
		def: { color: '#d4af37', sparkles: 8, seed: 1 },
		prev: { foil: { color: '#d4af37', sparkles: 8, seed: 3 } },
	},
	{
		id: 'stackShadow',
		label: __( 'Retro stack', 'wunderpaint' ),
		def: {
			angle: 45,
			offset: 12,
			count: 2,
			color: '#e5484d',
			color2: '#3b82f6',
			color3: '#f5d90a',
		},
		prev: {
			stackShadow: {
				angle: 45,
				offset: 9,
				count: 2,
				color: '#e5484d',
				color2: '#3b82f6',
				color3: '#f5d90a',
			},
		},
	},
	{
		id: 'offsetPrint',
		label: __( 'Misprint', 'wunderpaint' ),
		def: { offset: 8, angle: 45, width: 2, color: '#e5484d' },
		prev: {
			offsetPrint: { offset: 7, angle: 45, width: 2, color: '#e5484d' },
		},
	},
	{
		id: 'fade',
		label: __( 'Fade', 'wunderpaint' ),
		def: { angle: 90, amount: 90 },
		prev: { fade: { angle: 90, amount: 95 } },
	},
	{
		id: 'softBlur',
		label: __( 'Soft blur', 'wunderpaint' ),
		def: { amount: 6 },
		prev: { softBlur: { amount: 5 } },
	},
	{
		id: 'sparkle',
		label: __( 'Sparkles', 'wunderpaint' ),
		def: { count: 8, size: 12, color: '#ffffff', seed: 1 },
		prev: { sparkle: { count: 7, size: 12, color: '#ffffff', seed: 1 } },
	},
	{
		id: 'inline',
		label: __( 'Inline', 'wunderpaint' ),
		def: { inset: 5, width: 2, color: '#ffffff' },
		prev: { inline: { inset: 4, width: 2, color: '#ffffff' } },
	},
	{
		id: 'contour',
		label: __( 'Contour lines', 'wunderpaint' ),
		def: {
			count: 3,
			gap: 8,
			width: 2,
			color: '#1a1d21',
			color2: '#1a1d21',
		},
		prev: {
			contour: {
				count: 2,
				gap: 7,
				width: 2,
				color: '#1a1d21',
				color2: '#1a1d21',
			},
		},
	},
	{
		id: 'marquee',
		label: __( 'Marquee lights', 'wunderpaint' ),
		def: { size: 5, gap: 14, color: '#ffd166', glow: 12 },
		prev: { marquee: { size: 5, gap: 13, color: '#ffd166', glow: 10 } },
	},
	{
		id: 'knockout',
		label: __( 'Knockout', 'wunderpaint' ),
		def: { color: '#ffffff', pad: 16, radius: 18, shadow: 25 },
		prev: {
			knockout: { color: '#ffffff', pad: 10, radius: 12, shadow: 25 },
		},
	},
	{
		id: 'checker',
		label: __( 'Checker fill', 'wunderpaint' ),
		def: { size: 14, color: '#1a1d21', color2: '#ffffff' },
		prev: { checker: { size: 10, color: '#1a1d21', color2: '#ffffff' } },
	},
	{
		id: 'halftone',
		label: __( 'Halftone shade', 'wunderpaint' ),
		def: { size: 9, strength: 80, angle: 90, color: '#1a1d21' },
		prev: {
			halftone: { size: 7, strength: 85, angle: 90, color: '#1a1d21' },
		},
	},
	{
		id: 'static',
		label: __( 'TV static', 'wunderpaint' ),
		def: { scale: 2, amount: 100, seed: 1 },
		prev: { static: { scale: 2, amount: 100, seed: 1 } },
	},
	{
		id: 'dotMatrix',
		label: __( 'LED board', 'wunderpaint' ),
		def: { size: 12, color: '#ff3b30', bg: '#181210', glow: 10 },
		prev: {
			dotMatrix: { size: 9, color: '#ff3b30', bg: '#181210', glow: 8 },
		},
	},
	{
		id: 'fold',
		label: __( 'Origami fold', 'wunderpaint' ),
		def: { bands: 7, strength: 70, angle: 65, seed: 3 },
		prev: { fold: { bands: 6, strength: 75, angle: 65, seed: 3 } },
	},
	{
		id: 'waves',
		label: __( 'Waves fill', 'wunderpaint' ),
		def: { size: 70, amp: 8, color: '#38bdf8', color2: '#1d4ed8' },
		prev: {
			waves: { size: 56, amp: 7, color: '#38bdf8', color2: '#1d4ed8' },
		},
	},
	{
		id: 'motifFill',
		label: __( 'Motif fill', 'wunderpaint' ),
		def: { style: 0, size: 18, color: '#ffffff', bg: '#ff6ea9' },
		prev: {
			motifFill: { style: 0, size: 13, color: '#ffffff', bg: '#ff6ea9' },
		},
	},
	{
		id: 'camo',
		label: __( 'Camo fill', 'wunderpaint' ),
		def: {
			size: 26,
			seed: 1,
			bg: '#5a6f43',
			color: '#3e4a2e',
			color2: '#8a9a6b',
			color3: '#2c3520',
		},
		prev: { camo: { size: 18, seed: 2 } },
	},
	{
		id: 'circuit',
		label: __( 'Circuit board', 'wunderpaint' ),
		def: { size: 26, color: '#22c55e', bg: '#0c1f13' },
		prev: { circuit: { size: 18, color: '#22c55e', bg: '#0c1f13' } },
	},
	{
		id: 'plaid',
		label: __( 'Plaid fill', 'wunderpaint' ),
		def: { size: 34, bg: '#9f1239', color: '#1e3a5f', color2: '#f8e8c8' },
		prev: {
			plaid: {
				size: 24,
				bg: '#9f1239',
				color: '#1e3a5f',
				color2: '#f8e8c8',
			},
		},
	},
	{
		id: 'bubbles',
		label: __( 'Bubbles', 'wunderpaint' ),
		def: { count: 26, size: 7, color: '#ffffff', seed: 1 },
		prev: { bubbles: { count: 22, size: 6, color: '#ffffff', seed: 1 } },
	},
	{
		id: 'cracks',
		label: __( 'Cracked', 'wunderpaint' ),
		def: { count: 6, color: '#1a1d21', seed: 1 },
		prev: { cracks: { count: 6, color: '#1a1d21', seed: 3 } },
	},
	{
		id: 'ripple',
		label: __( 'Ripple', 'wunderpaint' ),
		def: { amp: 8, size: 46 },
		prev: { ripple: { amp: 6, size: 36 } },
	},
	{
		id: 'seal',
		label: __( 'Star seal', 'wunderpaint' ),
		def: {
			points: 16,
			pad: 26,
			depth: 16,
			color: '#e5484d',
			color2: '#7f1d1d',
		},
		prev: {
			seal: {
				points: 14,
				pad: 16,
				depth: 16,
				color: '#e5484d',
				color2: '#7f1d1d',
			},
		},
	},
	{
		id: 'hatchShadow',
		label: __( 'Hatch shadow', 'wunderpaint' ),
		def: { offset: 10, angle: 45, gap: 6, color: '#1a1d21' },
		prev: {
			hatchShadow: { offset: 8, angle: 45, gap: 5, color: '#1a1d21' },
		},
	},
	{
		id: 'gradientOutline',
		label: __( 'Gradient outline', 'wunderpaint' ),
		def: { width: 6, angle: 90, color: '#f5c518', color2: '#e5484d' },
		prev: {
			gradientOutline: {
				width: 5,
				angle: 90,
				color: '#f5c518',
				color2: '#e5484d',
			},
		},
	},
	{
		id: 'wireframe',
		label: __( 'Blueprint', 'wunderpaint' ),
		def: { color: '#3b82f6', width: 2, grid: 12 },
		prev: { wireframe: { color: '#3b82f6', width: 2, grid: 9 } },
	},
	{
		id: 'threeD',
		label: __( '3D', 'wunderpaint' ),
		def: {
			angle: 45,
			depth: 20,
			color: '#e4d9ff',
			color2: '#8b6bff',
			side: '#4b2fa8',
			border: '#ffffff',
		},
		prev: {
			threeD: {
				angle: 45,
				depth: 15,
				color: '#e4d9ff',
				color2: '#8b6bff',
				side: '#4b2fa8',
				border: '#ffffff',
			},
		},
	},
];

// Slider/color rows shown while an effect is active, per effect id.
export const FX_PARAMS = {
	longShadow: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'length',
			label: __( 'Length', 'wunderpaint' ),
			min: 0,
			max: 200,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	extrude: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'depth',
			label: __( 'Depth', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	glow: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 1,
			max: 60,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	echo: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'count',
			label: __( 'Count', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 1, max: 60 },
	],
	skew: [
		{
			key: 'x',
			label: __( 'Skew X', 'wunderpaint' ),
			min: -45,
			max: 45,
		},
		{
			key: 'y',
			label: __( 'Skew Y', 'wunderpaint' ),
			min: -45,
			max: 45,
		},
	],
	outline: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	neon: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 4,
			max: 60,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	splice: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 1,
			max: 80,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	dotShadow: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 1,
			max: 80,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	reflection: [
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 0, max: 60 },
		{
			key: 'alpha',
			label: __( 'Opacity', 'wunderpaint' ),
			min: 5,
			max: 95,
		},
	],
	rings: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 1,
			max: 30,
		},
		{
			key: 'count',
			label: __( 'Rings', 'wunderpaint' ),
			min: 2,
			max: 5,
		},
		{ key: 'color', label: __( 'Inner', 'wunderpaint' ), color: true },
		{
			key: 'color2',
			label: __( 'Middle', 'wunderpaint' ),
			color: true,
		},
		{ key: 'color3', label: __( 'Outer', 'wunderpaint' ), color: true },
	],
	bevel: [
		{
			key: 'depth',
			label: __( 'Depth', 'wunderpaint' ),
			min: 1,
			max: 12,
		},
	],
	letterpress: [
		{
			key: 'depth',
			label: __( 'Depth', 'wunderpaint' ),
			min: 1,
			max: 12,
		},
	],
	imageFill: [],
	chromatic: [
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	glitch: [
		{
			key: 'strength',
			label: __( 'Strength', 'wunderpaint' ),
			min: 2,
			max: 60,
		},
		{
			key: 'slices',
			label: __( 'Slices', 'wunderpaint' ),
			min: 2,
			max: 16,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
	],
	shine: [
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 4,
			max: 90,
		},
		{
			key: 'opacity',
			label: __( 'Opacity', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'pos',
			label: __( 'Position', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	scanlines: [
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 2, max: 14 },
		{
			key: 'opacity',
			label: __( 'Opacity', 'wunderpaint' ),
			min: 5,
			max: 90,
		},
	],
	grunge: [
		{
			key: 'amount',
			label: __( 'Amount', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'scale',
			label: __( 'Scale', 'wunderpaint' ),
			min: 20,
			max: 200,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
	],
	dashedOutline: [
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 12,
		},
		{
			key: 'dash',
			label: __( 'Dash', 'wunderpaint' ),
			min: 2,
			max: 40,
		},
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 2, max: 40 },
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	groundShadow: [
		{
			key: 'squash',
			label: __( 'Depth', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{
			key: 'shear',
			label: __( 'Slant', 'wunderpaint' ),
			min: -60,
			max: 60,
		},
		{
			key: 'blur',
			label: __( 'Blur', 'wunderpaint' ),
			min: 0,
			max: 20,
		},
		{
			key: 'opacity',
			label: __( 'Opacity', 'wunderpaint' ),
			min: 5,
			max: 90,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	jitter: [
		{
			key: 'amount',
			label: __( 'Amount', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
	],
	rainbow: [],
	innerGlow: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	neonTube: [
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 10,
		},
		{
			key: 'glow',
			label: __( 'Glow', 'wunderpaint' ),
			min: 4,
			max: 60,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	motionBlur: [
		{
			key: 'length',
			label: __( 'Length', 'wunderpaint' ),
			min: 4,
			max: 120,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	marker: [
		{
			// 0 band, 1 swipe, 2 double swipe, 3 scribble fill (v1.256.0).
			key: 'style',
			label: __( 'Style', 'wunderpaint' ),
			min: 0,
			max: 3,
		},
		{
			key: 'rough',
			label: __( 'Roughness', 'wunderpaint' ),
			min: 0,
			max: 10,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	circleMark: [
		{
			// 0 oval, 1 double loop, 2 sketchy box (v1.256.0).
			key: 'style',
			label: __( 'Style', 'wunderpaint' ),
			min: 0,
			max: 2,
		},
		{
			key: 'rough',
			label: __( 'Roughness', 'wunderpaint' ),
			min: 0,
			max: 10,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	strikeFx: [
		{
			key: 'style',
			label: __( 'Style', 'wunderpaint' ),
			min: 0,
			max: 2,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{
			key: 'rough',
			label: __( 'Roughness', 'wunderpaint' ),
			min: 0,
			max: 10,
		},
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 99,
		},
	],
	scribbleUnder: [
		{
			// 0 wave, 1 double, 2 zigzag, 3 cursive loops (v1.256.0).
			key: 'style',
			label: __( 'Style', 'wunderpaint' ),
			min: 0,
			max: 3,
		},
		{
			key: 'rough',
			label: __( 'Roughness', 'wunderpaint' ),
			min: 0,
			max: 10,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	paperCut: [
		{
			key: 'pad',
			label: __( 'Padding', 'wunderpaint' ),
			min: 0,
			max: 60,
		},
		{
			key: 'radius',
			label: __( 'Radius', 'wunderpaint' ),
			min: 0,
			max: 80,
		},
		{
			key: 'opacity',
			label: __( 'Shadow', 'wunderpaint' ),
			min: 0,
			max: 90,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	pixelate: [
		{
			key: 'size',
			label: __( 'Pixel size', 'wunderpaint' ),
			min: 2,
			max: 24,
		},
	],
	sketch: [
		{
			key: 'passes',
			label: __( 'Passes', 'wunderpaint' ),
			min: 1,
			max: 3,
		},
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 6,
		},
		{
			key: 'rough',
			label: __( 'Roughness', 'wunderpaint' ),
			min: 0,
			max: 10,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	confetti: [
		{
			key: 'density',
			label: __( 'Density', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 2,
			max: 14,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
	],
	stripesFill: [
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 2,
			max: 60,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color3',
			label: __( 'Color 3', 'wunderpaint' ),
			color: true,
		},
	],
	drip: [
		{
			key: 'count',
			label: __( 'Drops', 'wunderpaint' ),
			min: 1,
			max: 12,
		},
		{
			key: 'length',
			label: __( 'Length', 'wunderpaint' ),
			min: 10,
			max: 160,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	gradient: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	chrome: [
		{
			key: 'shine',
			label: __( 'Shine', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{
			key: 'contrast',
			label: __( 'Contrast', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{ key: 'color', label: __( 'Tint', 'wunderpaint' ), color: true },
	],
	comicDots: [
		{
			key: 'size',
			label: __( 'Dot size', 'wunderpaint' ),
			min: 3,
			max: 24,
		},
		{ key: 'color', label: __( 'Dots', 'wunderpaint' ), color: true },
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
	],
	spray: [
		{
			key: 'density',
			label: __( 'Density', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{
			key: 'grain',
			label: __( 'Grain', 'wunderpaint' ),
			min: 1,
			max: 8,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	highlight: [
		{
			key: 'pad',
			label: __( 'Padding', 'wunderpaint' ),
			min: 0,
			max: 40,
		},
		{
			key: 'radius',
			label: __( 'Radius', 'wunderpaint' ),
			min: 0,
			max: 60,
		},
		{
			key: 'opacity',
			label: __( 'Opacity', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	underlineFx: [
		{
			key: 'style',
			label: __( 'Style', 'wunderpaint' ),
			min: 0,
			max: 3,
		},
		{
			key: 'thickness',
			label: __( 'Thickness', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 0,
			max: 40,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	sticker: [
		{
			key: 'size',
			label: __( 'Thickness', 'wunderpaint' ),
			min: 2,
			max: 40,
		},
		{
			key: 'shadow',
			label: __( 'Shadow', 'wunderpaint' ),
			min: 0,
			max: 90,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	burst: [
		{
			key: 'count',
			label: __( 'Lines', 'wunderpaint' ),
			min: 6,
			max: 48,
		},
		{
			key: 'length',
			label: __( 'Length', 'wunderpaint' ),
			min: 10,
			max: 200,
		},
		{
			key: 'gap',
			label: __( 'Gap', 'wunderpaint' ),
			min: 10,
			max: 120,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	twoTone: [
		{
			key: 'split',
			label: __( 'Split', 'wunderpaint' ),
			min: 10,
			max: 90,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	foil: [
		{
			key: 'sparkles',
			label: __( 'Sparkles', 'wunderpaint' ),
			min: 0,
			max: 20,
		},
		{
			key: 'seed',
			label: __( 'Variant', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{ key: 'color', label: __( 'Tint', 'wunderpaint' ), color: true },
	],
	stackShadow: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 2,
			max: 60,
		},
		{
			key: 'count',
			label: __( 'Copies', 'wunderpaint' ),
			min: 1,
			max: 3,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color3',
			label: __( 'Color 3', 'wunderpaint' ),
			color: true,
		},
	],
	offsetPrint: [
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'width',
			label: __( 'Line width', 'wunderpaint' ),
			min: 1,
			max: 8,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	fade: [
		{
			key: 'angle',
			label: __( 'Direction', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'amount',
			label: __( 'Amount', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
	],
	softBlur: [
		{
			key: 'amount',
			label: __( 'Amount', 'wunderpaint' ),
			min: 1,
			max: 30,
		},
	],
	threeD: [
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'depth',
			label: __( 'Depth', 'wunderpaint' ),
			min: 2,
			max: 60,
		},
		{
			key: 'color',
			label: __( 'Face top', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Face bottom', 'wunderpaint' ),
			color: true,
		},
		{ key: 'side', label: __( 'Depth', 'wunderpaint' ), color: true },
		{ key: 'border', label: __( 'Shine', 'wunderpaint' ), color: true },
	],
	sparkle: [
		{
			key: 'count',
			label: __( 'Count', 'wunderpaint' ),
			min: 1,
			max: 24,
		},
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 3,
			max: 30,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
	],
	inline: [
		{
			key: 'inset',
			label: __( 'Inset', 'wunderpaint' ),
			min: 1,
			max: 24,
		},
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 10,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	contour: [
		{
			key: 'count',
			label: __( 'Count', 'wunderpaint' ),
			min: 1,
			max: 4,
		},
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 3, max: 30 },
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 6,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	marquee: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 2,
			max: 14,
		},
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 4, max: 48 },
		{
			key: 'glow',
			label: __( 'Glow', 'wunderpaint' ),
			min: 0,
			max: 30,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	knockout: [
		{
			key: 'pad',
			label: __( 'Padding', 'wunderpaint' ),
			min: 0,
			max: 60,
		},
		{
			key: 'radius',
			label: __( 'Radius', 'wunderpaint' ),
			min: 0,
			max: 90,
		},
		{
			key: 'shadow',
			label: __( 'Shadow', 'wunderpaint' ),
			min: 0,
			max: 90,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	checker: [
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 4,
			max: 60,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	halftone: [
		{
			key: 'size',
			label: __( 'Dot size', 'wunderpaint' ),
			min: 4,
			max: 24,
		},
		{
			key: 'strength',
			label: __( 'Strength', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	static: [
		{
			key: 'scale',
			label: __( 'Pixel size', 'wunderpaint' ),
			min: 1,
			max: 6,
		},
		{
			key: 'amount',
			label: __( 'Amount', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
	],
	dotMatrix: [
		{
			key: 'size',
			label: __( 'Dot size', 'wunderpaint' ),
			min: 6,
			max: 26,
		},
		{
			key: 'glow',
			label: __( 'Glow', 'wunderpaint' ),
			min: 0,
			max: 30,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
	],
	fold: [
		{
			key: 'bands',
			label: __( 'Bands', 'wunderpaint' ),
			min: 3,
			max: 16,
		},
		{
			key: 'strength',
			label: __( 'Strength', 'wunderpaint' ),
			min: 10,
			max: 100,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
	],
	wireframe: [
		{
			key: 'width',
			label: __( 'Line width', 'wunderpaint' ),
			min: 1,
			max: 5,
		},
		{
			key: 'grid',
			label: __( 'Grid', 'wunderpaint' ),
			min: 5,
			max: 40,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	waves: [
		{
			key: 'size',
			label: __( 'Scale', 'wunderpaint' ),
			min: 20,
			max: 160,
		},
		{
			key: 'amp',
			label: __( 'Strength', 'wunderpaint' ),
			min: 2,
			max: 24,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	motifFill: [
		{
			key: 'style',
			label: __( 'Variant', 'wunderpaint' ),
			min: 0,
			max: 3,
		},
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 8,
			max: 48,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
	],
	camo: [
		{
			key: 'size',
			label: __( 'Scale', 'wunderpaint' ),
			min: 10,
			max: 60,
		},
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color3',
			label: __( 'Color 3', 'wunderpaint' ),
			color: true,
		},
	],
	circuit: [
		{
			key: 'size',
			label: __( 'Scale', 'wunderpaint' ),
			min: 14,
			max: 60,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
	],
	plaid: [
		{
			key: 'size',
			label: __( 'Scale', 'wunderpaint' ),
			min: 14,
			max: 80,
		},
		{ key: 'bg', label: __( 'Fill', 'wunderpaint' ), color: true },
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	bubbles: [
		{
			key: 'count',
			label: __( 'Count', 'wunderpaint' ),
			min: 4,
			max: 80,
		},
		{
			key: 'size',
			label: __( 'Size', 'wunderpaint' ),
			min: 2,
			max: 20,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
	],
	cracks: [
		{
			key: 'count',
			label: __( 'Count', 'wunderpaint' ),
			min: 1,
			max: 14,
		},
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
		{
			key: 'seed',
			label: __( 'Variation', 'wunderpaint' ),
			min: 1,
			max: 40,
		},
	],
	ripple: [
		{
			key: 'amp',
			label: __( 'Strength', 'wunderpaint' ),
			min: 2,
			max: 30,
		},
		{
			key: 'size',
			label: __( 'Scale', 'wunderpaint' ),
			min: 10,
			max: 140,
		},
	],
	seal: [
		{
			key: 'points',
			label: __( 'Count', 'wunderpaint' ),
			min: 8,
			max: 40,
		},
		{
			key: 'pad',
			label: __( 'Padding', 'wunderpaint' ),
			min: 4,
			max: 80,
		},
		{
			key: 'depth',
			label: __( 'Depth', 'wunderpaint' ),
			min: 4,
			max: 40,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
	hatchShadow: [
		{
			key: 'offset',
			label: __( 'Offset', 'wunderpaint' ),
			min: 2,
			max: 60,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{ key: 'gap', label: __( 'Gap', 'wunderpaint' ), min: 3, max: 20 },
		{ key: 'color', label: __( 'Color', 'wunderpaint' ), color: true },
	],
	gradientOutline: [
		{
			key: 'width',
			label: __( 'Width', 'wunderpaint' ),
			min: 1,
			max: 20,
		},
		{
			key: 'angle',
			label: __( 'Angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
		{
			key: 'color',
			label: __( 'Color 1', 'wunderpaint' ),
			color: true,
		},
		{
			key: 'color2',
			label: __( 'Color 2', 'wunderpaint' ),
			color: true,
		},
	],
};
