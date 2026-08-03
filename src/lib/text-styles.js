/**
 * One-click text style presets (v1.139.0): each tile patches the layer with
 * a ready-made combination of fills, outlines and text effects. Everything
 * stays non-destructive and tweakable afterwards in Character / Text
 * Effects / Warp. `patch` REPLACES textFX (a style is a fresh look, not an
 * addition); fill/outline keys included so the look is complete.
 */

import { __ } from '@wordpress/i18n';

const RESET = {
	textFX: null,
	fillType: 'solid',
	gradientStops: null,
	outlineColor: null,
	outlineW: 0,
	shadowOn: false,
	bgColor: null,
};

export const TEXT_STYLES = [
	{
		id: 'plain',
		label: __( 'Plain', 'wunderpaint' ),
		patch: { ...RESET },
	},
	{
		id: 'sticker',
		label: __( 'Sticker', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e5484d',
			textFX: {
				rings: {
					size: 7,
					count: 2,
					color: '#ffffff',
					color2: '#1a1d21',
				},
			},
		},
	},
	{
		id: 'comic',
		label: __( 'Comic', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5d90a',
			outlineColor: '#1a1d21',
			outlineW: 2,
			textFX: {
				rings: {
					size: 5,
					count: 2,
					color: '#1a1d21',
					color2: '#ffffff',
				},
				dotShadow: { angle: 45, offset: 12, color: '#1a1d21' },
			},
		},
	},
	{
		id: 'gold',
		label: __( 'Gold', 'wunderpaint' ),
		patch: {
			...RESET,
			fillType: 'gradient',
			gradientAngle: 90,
			gradientKind: 'linear',
			gradientStops: [
				{ at: 0, color: '#f9e58a' },
				{ at: 0.42, color: '#c9992e' },
				{ at: 0.55, color: '#f6e27a' },
				{ at: 1, color: '#8f6413' },
			],
			outlineColor: '#6e4c0b',
			outlineW: 1,
			textFX: { bevel: { depth: 2 } },
		},
	},
	{
		id: 'chrome',
		label: __( 'Chrome', 'wunderpaint' ),
		patch: {
			...RESET,
			fillType: 'gradient',
			gradientAngle: 90,
			gradientKind: 'linear',
			gradientStops: [
				{ at: 0, color: '#e8eef5' },
				{ at: 0.46, color: '#8fa3b8' },
				{ at: 0.52, color: '#f8fbff' },
				{ at: 0.6, color: '#5c7186' },
				{ at: 1, color: '#c8d4e0' },
			],
			outlineColor: '#3d4b5a',
			outlineW: 1,
			textFX: { bevel: { depth: 2 } },
		},
	},
	{
		id: 'neonPink',
		label: __( 'Neon', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ffffff',
			textFX: { neon: { color: '#ff36c7', size: 18 } },
		},
	},
	{
		id: 'fire',
		label: __( 'Fire', 'wunderpaint' ),
		patch: {
			...RESET,
			fillType: 'gradient',
			gradientAngle: 90,
			gradientKind: 'linear',
			gradientStops: [
				{ at: 0, color: '#ffe259' },
				{ at: 0.55, color: '#ff8a00' },
				{ at: 1, color: '#e5484d' },
			],
			textFX: { glow: { color: '#ff6a00', size: 16 } },
		},
	},
	{
		id: 'ice',
		label: __( 'Ice', 'wunderpaint' ),
		patch: {
			...RESET,
			fillType: 'gradient',
			gradientAngle: 115,
			gradientKind: 'linear',
			gradientStops: [
				{ at: 0, color: '#eaf6ff' },
				{ at: 0.6, color: '#7cc4f4' },
				{ at: 1, color: '#2b6cb0' },
			],
			outlineColor: '#ffffff',
			outlineW: 1,
			textFX: { glow: { color: '#9bd4ff', size: 12 } },
		},
	},
	{
		id: 'retro3d',
		label: __( 'Retro 3D', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#fff7e6',
			outlineColor: '#1a1d21',
			outlineW: 2,
			textFX: {
				extrude: { angle: 45, depth: 14, color: '#12a594' },
				skew: { x: -8, y: 0 },
			},
		},
	},
	{
		id: 'longShadow',
		label: __( 'Flat shadow', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#3b82f6',
			textFX: {
				longShadow: {
					angle: 45,
					length: 60,
					color: 'rgba(0,0,0,0.25)',
				},
			},
		},
	},
	{
		id: 'riso',
		label: __( 'Print offset', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1a1d21',
			textFX: {
				splice: { angle: 200, offset: 5, color: '#00b3c6' },
				echo: { angle: 25, count: 1, gap: 7 },
			},
		},
	},
	{
		id: 'letterpress',
		label: __( 'Letterpress', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#b8bec6',
			textFX: { letterpress: { depth: 3 } },
		},
	},
	{
		id: 'kids',
		label: __( 'Playful', 'wunderpaint' ),
		patch: {
			...RESET,
			textFX: {
				rainbow: {},
				jitter: { amount: 55, seed: 3 },
			},
		},
	},
	{
		id: 'glass',
		label: __( 'Reflection', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ffffff',
			textFX: {
				reflection: { gap: 4, alpha: 40 },
				glow: { color: 'rgba(0,0,0,0.35)', size: 8 },
			},
		},
	},
	{
		id: 'wavy',
		label: __( 'Wave', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#3b82f6',
			outlineColor: '#ffffff',
			outlineW: 2,
			textFX: {
				warp: { type: 'wave', bend: 55 },
				longShadow: { angle: 90, length: 10, color: 'rgba(0,0,0,0.2)' },
			},
		},
	},
	{
		id: 'glitch',
		label: __( 'Glitch', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#eef3ff',
			textFX: {
				chromatic: { offset: 5, angle: 0 },
				glitch: { strength: 12, slices: 9, seed: 4 },
			},
		},
	},
	{
		id: 'vhs',
		label: __( 'VHS', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#d9f4ff',
			textFX: {
				chromatic: { offset: 3, angle: 0 },
				scanlines: { gap: 4, opacity: 55 },
				glow: { color: 'rgba(0,224,255,0.8)', size: 8 },
			},
		},
	},
	{
		id: 'stamp',
		label: __( 'Rubber stamp', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#c22f2f',
			textFX: {
				grunge: { amount: 60, scale: 60, seed: 2 },
				skew: { x: -4, y: -2 },
			},
		},
	},
	{
		id: 'standing',
		label: __( 'Standing', 'wunderpaint' ),
		patch: {
			...RESET,
			fillType: 'gradient',
			gradientAngle: 90,
			gradientKind: 'linear',
			gradientStops: [
				{ at: 0, color: '#ffd66e' },
				{ at: 1, color: '#f5a623' },
			],
			outlineColor: '#8a5a00',
			outlineW: 1,
			textFX: {
				bevel: { depth: 2 },
				shine: { width: 24, opacity: 70, pos: 35, angle: 115 },
				groundShadow: {
					squash: 45,
					shear: 30,
					blur: 7,
					opacity: 40,
					color: '#000000',
				},
			},
		},
	},
	{
		id: 'neonSign',
		label: __( 'Neon sign', 'wunderpaint' ),
		patch: {
			...RESET,
			color: 'rgba(0,0,0,0)',
			textFX: { neonTube: { width: 3, glow: 18, color: '#ff36c7' } },
		},
	},
	{
		id: 'arcade',
		label: __( '8-bit arcade', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5d90a',
			textFX: {
				pixelate: { size: 6 },
				extrude: { angle: 90, depth: 6, color: '#b3541e' },
			},
		},
	},
	{
		id: 'slime',
		label: __( 'Slime', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#4fbf26',
			outlineColor: '#2d7a12',
			outlineW: 1,
			textFX: {
				drip: { count: 6, length: 46, seed: 3, color: '#4fbf26' },
				innerGlow: { size: 8, color: '#baf59a' },
			},
		},
	},
	{
		id: 'speed',
		label: __( 'Speed', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e5484d',
			outlineColor: '#ffffff',
			outlineW: 2,
			textFX: {
				motionBlur: { length: 44, angle: 180 },
				skew: { x: -12, y: 0 },
			},
		},
	},
	{
		id: 'highlighted',
		label: __( 'Highlight', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1a1d21',
			textFX: { marker: { color: '#ffe066', rough: 4, seed: 1 } },
		},
	},
	{
		id: 'papercut',
		label: __( 'Paper cut', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1a1d21',
			textFX: {
				paperCut: {
					color: '#f4f1ea',
					pad: 14,
					radius: 14,
					opacity: 50,
				},
			},
		},
	},
	{
		id: 'party',
		label: __( 'Party', 'wunderpaint' ),
		patch: {
			...RESET,
			textFX: {
				rainbow: {},
				jitter: { amount: 45, seed: 5 },
				confetti: { density: 50, size: 5, seed: 2 },
			},
		},
	},
	{
		id: 'candy',
		label: __( 'Candy', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff6ea9',
			textFX: {
				stripesFill: {
					width: 9,
					angle: 45,
					color: '#ff6ea9',
					color2: '#ffffff',
					color3: '#ff8fbf',
				},
				rings: {
					size: 5,
					count: 2,
					color: '#ffffff',
					color2: '#d23d75',
				},
			},
		},
	},
	{
		id: 'vegas',
		label: __( 'Vegas marquee', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#7a1626',
			outlineColor: '#3d0a12',
			outlineW: 1,
			textFX: {
				marquee: { size: 5, gap: 15, color: '#ffd166', glow: 14 },
				bevel: { depth: 2 },
			},
		},
	},
	{
		id: 'scoreboard',
		label: __( 'Scoreboard', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#181210',
			textFX: {
				dotMatrix: {
					size: 11,
					color: '#ff3b30',
					bg: '#181210',
					glow: 12,
				},
			},
		},
	},
	{
		id: 'blueprint',
		label: __( 'Blueprint', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#dbeafe',
			textFX: {
				wireframe: { color: '#93c5fd', width: 2, grid: 11 },
			},
		},
	},
	{
		id: 'varsity',
		label: __( 'Varsity', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1d4ed8',
			outlineColor: '#ffffff',
			outlineW: 3,
			textFX: {
				inline: { inset: 5, width: 2, color: '#ffffff' },
				outline: { size: 7, color: '#b91c1c' },
			},
		},
	},
	{
		id: 'knockoutBadge',
		label: __( 'Knockout', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#111827',
			textFX: {
				knockout: {
					color: '#111827',
					pad: 16,
					radius: 16,
					shadow: 30,
				},
			},
		},
	},
	{
		id: 'origami',
		label: __( 'Origami', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#7dd3fc',
			textFX: {
				fold: { bands: 7, strength: 62, angle: 65, seed: 3 },
				extrude: { angle: 118, depth: 5, color: '#0e7490' },
			},
		},
	},
	{
		id: 'tvStatic',
		label: __( 'Off air', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e5e7eb',
			textFX: {
				static: { scale: 2, amount: 100, seed: 2 },
				chromatic: { offset: 4, angle: 0 },
				scanlines: { gap: 5, opacity: 35 },
			},
		},
	},
	{
		id: 'comicShade',
		label: __( 'Comic shade', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#38bdf8',
			outlineColor: '#0c1c2e',
			outlineW: 3,
			textFX: {
				halftone: {
					size: 8,
					strength: 85,
					angle: 90,
					color: '#0c1c2e',
				},
				extrude: { angle: 45, depth: 8, color: '#0c1c2e' },
			},
		},
	},
	{
		id: 'ska',
		label: __( 'Checkerboard', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#111111',
			outlineColor: '#111111',
			outlineW: 2,
			textFX: {
				checker: { size: 12, color: '#111111', color2: '#ffffff' },
			},
		},
	},
	{
		id: 'topo',
		label: __( 'Topography', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#14532d',
			textFX: {
				contour: {
					count: 3,
					gap: 8,
					width: 2,
					color: '#4ade80',
					color2: '#166534',
				},
			},
		},
	},
	{
		id: 'sparkleGold',
		label: __( 'Sparkle gold', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#b98a1c',
			textFX: {
				foil: { color: '#f5c518', sparkles: 14, seed: 2 },
				sparkle: { count: 7, size: 11, color: '#fff7d6', seed: 4 },
			},
		},
	},
	{
		id: 'roseGold',
		label: __( 'Rose gold', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#d98a7e',
			textFX: {
				foil: { color: '#e8a798', sparkles: 8, seed: 5 },
				shine: { width: 26, opacity: 60, pos: 40, angle: 115 },
			},
		},
	},
	{
		id: 'silver',
		label: __( 'Silver', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#c3cad6',
			outlineColor: '#5d6675',
			outlineW: 1,
			textFX: {
				chrome: { color: '#d7dde8' },
				sparkle: { count: 4, size: 9, color: '#ffffff', seed: 8 },
			},
		},
	},
	{
		id: 'vaporwave',
		label: __( 'Vaporwave', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff71ce',
			textFX: {
				gradient: { color: '#ff71ce', color2: '#01cdfe', angle: 115 },
				chromatic: { offset: 5, angle: 0 },
				scanlines: { gap: 6, opacity: 30 },
			},
		},
	},
	{
		id: 'cyberpunk',
		label: __( 'Cyberpunk', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#fcee0a',
			textFX: {
				glitch: { strength: 10, slices: 6, seed: 7 },
				splice: { offset: 5, angle: 45, color: '#00f0ff' },
			},
		},
	},
	{
		id: 'graffiti',
		label: __( 'Graffiti', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff4d00',
			outlineColor: '#1a1d21',
			outlineW: 4,
			textFX: {
				spray: { density: 45, grain: 2, color: '#ff4d00' },
				drip: { count: 5, length: 34, seed: 8, color: '#ff4d00' },
				skew: { x: -8, y: 0 },
			},
		},
	},
	{
		id: 'western',
		label: __( 'Western', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#a3652c',
			outlineColor: '#4a2c11',
			outlineW: 2,
			textFX: {
				inline: { inset: 4, width: 2, color: '#f3e2c4' },
				extrude: { angle: 90, depth: 8, color: '#4a2c11' },
			},
		},
	},
	{
		id: 'neonBlue',
		label: __( 'Neon blue', 'wunderpaint' ),
		patch: {
			...RESET,
			color: 'rgba(0,0,0,0)',
			textFX: { neonTube: { width: 3, glow: 20, color: '#38bdf8' } },
		},
	},
	{
		id: 'neonMint',
		label: __( 'Neon mint', 'wunderpaint' ),
		patch: {
			...RESET,
			color: 'rgba(0,0,0,0)',
			textFX: { neonTube: { width: 3, glow: 18, color: '#34d399' } },
		},
	},
	{
		id: 'bubblePop',
		label: __( 'Bubble pop', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff6ea9',
			outlineColor: '#c02662',
			outlineW: 2,
			textFX: {
				bevel: { depth: 3 },
				innerGlow: { size: 10, color: '#ffd3e5' },
				shine: { width: 22, opacity: 75, pos: 30, angle: 115 },
				dotShadow: { offset: 10, angle: 45, color: '#c02662' },
			},
		},
	},
	{
		id: 'honey',
		label: __( 'Honey', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5a623',
			outlineColor: '#8a5200',
			outlineW: 1,
			textFX: {
				gradient: { color: '#ffd66e', color2: '#e8890c', angle: 90 },
				drip: { count: 5, length: 40, seed: 4, color: '#e8890c' },
				shine: { width: 20, opacity: 65, pos: 35, angle: 115 },
			},
		},
	},
	{
		id: 'lava',
		label: __( 'Lava', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff5a1f',
			textFX: {
				gradient: { color: '#ffd166', color2: '#d7263d', angle: 90 },
				glow: { color: '#ff5a1f', size: 18 },
				drip: { count: 6, length: 38, seed: 6, color: '#d7263d' },
			},
		},
	},
	{
		id: 'newsprint',
		label: __( 'Newsprint', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1a1d21',
			textFX: {
				offsetPrint: {
					offset: 6,
					angle: 45,
					width: 2,
					color: '#e5484d',
				},
			},
		},
	},
	{
		id: 'stamped',
		label: __( 'Stamped', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#b91c1c',
			textFX: {
				grunge: { amount: 55, seed: 9 },
				dashedOutline: { width: 2, dash: 7, gap: 5, color: '#b91c1c' },
			},
		},
	},
	{
		id: 'kawaii',
		label: __( 'Kawaii', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff9ec4',
			textFX: {
				rings: {
					size: 6,
					count: 2,
					color: '#ffffff',
					color2: '#7dd3fc',
				},
				sparkle: { count: 6, size: 10, color: '#ffffff', seed: 7 },
				innerGlow: { size: 7, color: '#ffd3e5' },
			},
		},
	},
	{
		id: 'disco',
		label: __( 'Disco', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#c3cad6',
			textFX: {
				chrome: { color: '#d0b3ff' },
				burst: { count: 18, length: 46, gap: 46, color: '#8b5cf6' },
				sparkle: { count: 8, size: 12, color: '#ffffff', seed: 3 },
			},
		},
	},
	{
		id: 'racing',
		label: __( 'Racing', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#111111',
			outlineColor: '#ffffff',
			outlineW: 2,
			textFX: {
				checker: { size: 9, color: '#111111', color2: '#ffffff' },
				skew: { x: -14, y: 0 },
				motionBlur: { length: 30, angle: 180 },
			},
		},
	},
	{
		id: 'midnight',
		label: __( 'Midnight', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#93b5f8',
			textFX: {
				gradient: { color: '#dbeafe', color2: '#1e3a8a', angle: 90 },
				sparkle: { count: 9, size: 8, color: '#ffffff', seed: 11 },
				glow: { color: '#3b82f6', size: 12 },
			},
		},
	},
	{
		id: 'frost',
		label: __( 'Frost', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#bfe8ff',
			outlineColor: '#5eb6e4',
			outlineW: 1,
			textFX: {
				innerGlow: { size: 9, color: '#ffffff' },
				glow: { color: '#9ad7f5', size: 14 },
				sparkle: { count: 6, size: 9, color: '#ffffff', seed: 5 },
			},
		},
	},
	{
		id: 'sunsetStack',
		label: __( 'Sunset stack', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#fff7ed',
			textFX: {
				gradient: { color: '#fdba74', color2: '#e11d48', angle: 90 },
				stackShadow: {
					angle: 45,
					offset: 8,
					count: 2,
					color: '#7c2d12',
					color2: '#fdba74',
				},
			},
		},
	},
	{
		id: 'ocean',
		label: __( 'Ocean', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#38bdf8',
			outlineColor: '#0c4a6e',
			outlineW: 2,
			textFX: {
				waves: {
					size: 60,
					amp: 8,
					color: '#7dd3fc',
					color2: '#0284c7',
				},
				reflection: { gap: 4, alpha: 30 },
			},
		},
	},
	{
		id: 'mermaid',
		label: __( 'Mermaid', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#2dd4bf',
			outlineColor: '#134e4a',
			outlineW: 1,
			textFX: {
				waves: {
					size: 44,
					amp: 6,
					color: '#5eead4',
					color2: '#7c3aed',
				},
				sparkle: { count: 6, size: 10, color: '#ffffff', seed: 6 },
			},
		},
	},
	{
		id: 'soda',
		label: __( 'Soda', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#fb923c',
			outlineColor: '#9a3412',
			outlineW: 2,
			textFX: {
				gradient: { color: '#fdba74', color2: '#ea580c', angle: 90 },
				bubbles: { count: 30, size: 7, color: '#ffffff', seed: 4 },
			},
		},
	},
	{
		id: 'champagne',
		label: __( 'Champagne', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e8c96a',
			textFX: {
				foil: { color: '#efd98b', sparkles: 10, seed: 3 },
				bubbles: { count: 24, size: 5, color: '#fff8e1', seed: 9 },
			},
		},
	},
	{
		id: 'stone',
		label: __( 'Stone', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#9aa2ad',
			textFX: {
				gradient: { color: '#c4cad3', color2: '#6b7280', angle: 90 },
				cracks: { count: 7, color: '#2f353d', seed: 5 },
				bevel: { depth: 2 },
			},
		},
	},
	{
		id: 'iceberg',
		label: __( 'Iceberg', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#bfe8ff',
			outlineColor: '#4a9fd4',
			outlineW: 1,
			textFX: {
				cracks: { count: 5, color: '#1e6a9e', seed: 7 },
				innerGlow: { size: 8, color: '#ffffff' },
				glow: { color: '#9ad7f5', size: 10 },
			},
		},
	},
	{
		id: 'saleSeal',
		label: __( 'Sale seal', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ffffff',
			textFX: {
				seal: {
					points: 16,
					pad: 26,
					depth: 16,
					color: '#e5484d',
					color2: '#7f1d1d',
				},
			},
		},
	},
	{
		id: 'priceStar',
		label: __( 'Price star', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#7c2d12',
			textFX: {
				seal: {
					points: 20,
					pad: 22,
					depth: 20,
					color: '#f5d90a',
					color2: '#b45309',
				},
			},
		},
	},
	{
		id: 'editorial',
		label: __( 'Editorial', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#111827',
			textFX: {
				hatchShadow: {
					offset: 12,
					angle: 45,
					gap: 6,
					color: '#94a3b8',
				},
			},
		},
	},
	{
		id: 'loveNote',
		label: __( 'Love note', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ff6ea9',
			outlineColor: '#be2c60',
			outlineW: 2,
			textFX: {
				motifFill: {
					style: 0,
					size: 16,
					color: '#ffffff',
					bg: '#ff6ea9',
				},
			},
		},
	},
	{
		id: 'starry',
		label: __( 'Starry', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1e2a5a',
			outlineColor: '#f5c518',
			outlineW: 1,
			textFX: {
				motifFill: {
					style: 1,
					size: 17,
					color: '#f5c518',
					bg: '#1e2a5a',
				},
			},
		},
	},
	{
		id: 'circuitBoard',
		label: __( 'Circuit', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#22c55e',
			textFX: {
				circuit: { size: 22, color: '#22c55e', bg: '#0c1f13' },
				glow: { color: '#22c55e', size: 10 },
			},
		},
	},
	{
		id: 'terminal',
		label: __( 'Terminal', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#101410',
			textFX: {
				dotMatrix: {
					size: 10,
					color: '#4ade80',
					bg: '#101410',
					glow: 10,
				},
			},
		},
	},
	{
		id: 'army',
		label: __( 'Army', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#5a6f43',
			outlineColor: '#2c3520',
			outlineW: 2,
			textFX: {
				camo: { size: 22, seed: 4 },
				grunge: { amount: 30, seed: 6 },
			},
		},
	},
	{
		id: 'highland',
		label: __( 'Highland', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#9f1239',
			outlineColor: '#4c0519',
			outlineW: 2,
			textFX: {
				plaid: {
					size: 30,
					bg: '#9f1239',
					color: '#1e3a5f',
					color2: '#f8e8c8',
				},
			},
		},
	},
	{
		id: 'gingham',
		label: __( 'Gingham', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e5484d',
			outlineColor: '#b91c1c',
			outlineW: 1,
			textFX: {
				plaid: {
					size: 22,
					bg: '#ffffff',
					color: '#e5484d',
					color2: '#e5484d',
				},
			},
		},
	},
	{
		id: 'poolside',
		label: __( 'Poolside', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#22d3ee',
			textFX: {
				gradient: { color: '#67e8f9', color2: '#0891b2', angle: 90 },
				ripple: { amp: 7, size: 42 },
			},
		},
	},
	{
		id: 'mirage',
		label: __( 'Mirage', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#fb923c',
			textFX: {
				gradient: { color: '#fde68a', color2: '#ea580c', angle: 90 },
				ripple: { amp: 6, size: 30 },
				fade: { angle: 90, amount: 25 },
			},
		},
	},
	{
		id: 'goldRing',
		label: __( 'Gold ring', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#1f2430',
			textFX: {
				gradientOutline: {
					width: 6,
					angle: 90,
					color: '#f8e08e',
					color2: '#b98a1c',
				},
			},
		},
	},
	{
		id: 'neonRing',
		label: __( 'Neon ring', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#10131a',
			textFX: {
				gradientOutline: {
					width: 5,
					angle: 115,
					color: '#00e0ff',
					color2: '#ff36c7',
				},
				glow: { color: '#7b2ff7', size: 14 },
			},
		},
	},
	{
		id: 'diner',
		label: __( 'Retro diner', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f8f1df',
			outlineColor: '#8c2f39',
			outlineW: 2,
			textFX: {
				inline: { inset: 4, width: 2, color: '#8c2f39' },
				stackShadow: {
					angle: 45,
					offset: 7,
					count: 1,
					color: '#3aa6a0',
				},
			},
		},
	},
	{
		id: 'bumblebee',
		label: __( 'Bumblebee', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5d90a',
			outlineColor: '#1a1d21',
			outlineW: 3,
			textFX: {
				stripesFill: {
					width: 12,
					angle: 0,
					color: '#f5d90a',
					color2: '#1a1d21',
				},
			},
		},
	},
	{
		id: 'hazard',
		label: __( 'Hazard', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5d90a',
			outlineColor: '#111111',
			outlineW: 3,
			textFX: {
				stripesFill: {
					width: 14,
					angle: 45,
					color: '#f5d90a',
					color2: '#111111',
				},
				extrude: { angle: 90, depth: 6, color: '#111111' },
			},
		},
	},
	{
		id: 'peppermint',
		label: __( 'Peppermint', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#e5484d',
			outlineColor: '#9f1239',
			outlineW: 2,
			textFX: {
				stripesFill: {
					width: 10,
					angle: 45,
					color: '#e5484d',
					color2: '#ffffff',
				},
				dotShadow: { offset: 9, angle: 45, color: '#14532d' },
			},
		},
	},
	{
		id: 'galaxy',
		label: __( 'Galaxy', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#a78bfa',
			textFX: {
				gradient: { color: '#c4b5fd', color2: '#4c1d95', angle: 115 },
				sparkle: { count: 10, size: 8, color: '#ffffff', seed: 13 },
				glow: { color: '#7c3aed', size: 14 },
			},
		},
	},
	{
		id: 'denim',
		label: __( 'Denim', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#3b5b92',
			textFX: {
				stripesFill: {
					width: 4,
					angle: 45,
					color: '#3b5b92',
					color2: '#2c4770',
				},
				dashedOutline: { width: 2, dash: 6, gap: 4, color: '#e8a33d' },
			},
		},
	},
	{
		id: 'chalk',
		label: __( 'Chalk', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f4f6f8',
			textFX: {
				grunge: { amount: 45, scale: 55, seed: 8 },
				sketch: {
					passes: 1,
					width: 1,
					rough: 3,
					seed: 4,
					color: '#f4f6f8',
				},
			},
		},
	},
	{
		id: 'horror',
		label: __( 'Horror', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#b91c1c',
			outlineColor: '#450a0a',
			outlineW: 1,
			textFX: {
				drip: { count: 8, length: 52, seed: 2, color: '#b91c1c' },
				grunge: { amount: 25, seed: 11 },
				glow: { color: '#450a0a', size: 10 },
			},
		},
	},
	{
		id: 'goldenTicket',
		label: __( 'Golden ticket', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#6b4600',
			textFX: {
				seal: {
					points: 24,
					pad: 24,
					depth: 10,
					color: '#f5c518',
					color2: '#b98a1c',
				},
				sparkle: { count: 6, size: 10, color: '#fff7d6', seed: 6 },
			},
		},
	},
	{
		id: 'boom',
		label: __( 'Boom', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#f5d90a',
			outlineColor: '#1a1d21',
			outlineW: 3,
			textFX: {
				burst: { count: 22, length: 52, gap: 44, color: '#e5484d' },
				extrude: { angle: 90, depth: 7, color: '#b3541e' },
				skew: { x: -8, y: -4 },
			},
		},
	},
];
