/**
 * Ready-made background looks (v1.433.0): a Background Studio style, its
 * settings and a palette of its own. Shown as tiles in the Background
 * Studio and as backdrops in the Screenshot Beautifier; applying one
 * gives exactly the picture its tile shows (the seed is part of it).
 */

import { __ } from '@wordpress/i18n';

import { BG_DEFAULTS } from './backgrounds';

/** Ready-made looks: a style, its settings and a palette of its own. */
export const BACKGROUND_LOOKS = () => [
	{
		id: 'northern',
		label: __( 'Northern Lights', 'wunderpaint' ),
		params: {
			style: 'aurora',
			aurora: { bands: 3, width: 55, height: 70 },
			colors: [ '#04121c', '#1de9b6', '#3b66ff', '#8e7dff' ],
			grain: 8,
			seed: 4,
		},
	},
	{
		id: 'golden',
		label: __( 'Golden Hour', 'wunderpaint' ),
		params: {
			style: 'glow',
			glow: { x: 78, y: 22, size: 80 },
			colors: [ '#1b1026', '#ff7a59', '#ffc46b', '#fff1d6' ],
			grain: 12,
			seed: 7,
		},
	},
	{
		id: 'pastel',
		label: __( 'Pastel', 'wunderpaint' ),
		params: {
			style: 'mesh',
			mesh: { points: 5, softness: 80 },
			colors: [ '#f6d5f7', '#fbe9d7', '#c2e9fb', '#a1c4fd' ],
			grain: 6,
			seed: 11,
		},
	},
	{
		id: 'city',
		label: __( 'City Lights', 'wunderpaint' ),
		params: {
			style: 'bokeh',
			bokeh: { count: 45, size: 50, blur: 60 },
			colors: [ '#0b1020', '#ffb86b', '#ff6b9a', '#6bc5ff' ],
			grain: 10,
			seed: 3,
		},
	},
	{
		id: 'sunset',
		label: __( 'Sunset', 'wunderpaint' ),
		params: {
			style: 'gradient',
			gradient: { kind: 'linear', angle: 90, x: 50, y: 40 },
			colors: [ '#2e1a47', '#c44569', '#f8b195' ],
			grain: 10,
			seed: 1,
		},
	},
	{
		id: 'candy',
		label: __( 'Candy', 'wunderpaint' ),
		params: {
			style: 'organic',
			organic: { variant: 'blobs', count: 6, shape: 70 },
			colors: [ '#ffe8f0', '#ff8fb1', '#ffd166', '#8fd3ff' ],
			grain: 4,
			seed: 21,
		},
	},
	{
		id: 'ocean',
		label: __( 'Ocean', 'wunderpaint' ),
		params: {
			style: 'organic',
			organic: { variant: 'waves', count: 5, shape: 50 },
			colors: [ '#03256c', '#2541b2', '#1768ac', '#06bee1' ],
			grain: 6,
			seed: 8,
		},
	},
	{
		id: 'spotlight',
		label: __( 'Spotlight', 'wunderpaint' ),
		params: {
			style: 'gradient',
			gradient: { kind: 'radial', angle: 135, x: 50, y: 38 },
			colors: [ '#101418', '#39424e', '#cfd8dc' ],
			grain: 14,
			seed: 1,
		},
	},
	{
		id: 'pop',
		label: __( 'Pop Art', 'wunderpaint' ),
		params: {
			style: 'halftone',
			halftone: { size: 60, gap: 40, angle: 45 },
			colors: [ '#ffe45e', '#ff6392', '#5aa9e6' ],
			grain: 0,
			seed: 5,
		},
	},
	{
		id: 'party',
		label: __( 'Party', 'wunderpaint' ),
		params: {
			style: 'confetti',
			confetti: { count: 80, size: 45, mix: 70 },
			colors: [ '#fff8ef', '#ff6b6b', '#4ecdc4', '#ffe66d', '#5f6caf' ],
			grain: 0,
			seed: 12,
		},
	},
	// One look for each style that had none (19.10.2026): every style now
	// has a starting point in the row.
	{
		id: 'night',
		label: __( 'Night Sky', 'wunderpaint' ),
		params: {
			style: 'stars',
			stars: { count: 70, size: 35, glow: 65 },
			colors: [ '#050814', '#1b2a4a', '#8e7dff', '#fdf6e3' ],
			grain: 6,
			seed: 14,
		},
	},
	{
		id: 'blueprint',
		label: __( 'Blueprint', 'wunderpaint' ),
		params: {
			style: 'geo',
			geo: { variant: 'grid', size: 18, gap: 40, angle: 0 },
			colors: [ '#0d3b66', '#7fb7e6' ],
			grain: 6,
			seed: 2,
		},
	},
	{
		id: 'contour',
		label: __( 'Contour Map', 'wunderpaint' ),
		params: {
			style: 'topo',
			topo: { lines: 16, weight: 30, rough: 45 },
			colors: [ '#f4f1de', '#81b29a', '#3d405b' ],
			grain: 4,
			seed: 6,
		},
	},
	{
		id: 'ripple',
		label: __( 'Ripple', 'wunderpaint' ),
		params: {
			style: 'rings',
			rings: { gap: 40, weight: 30, warp: 35 },
			colors: [ '#e0fbfc', '#98c1d9', '#3d5a80' ],
			grain: 4,
			seed: 9,
		},
	},
	{
		id: 'crystal',
		label: __( 'Crystal', 'wunderpaint' ),
		params: {
			style: 'poly',
			poly: { cell: 55, variance: 70 },
			colors: [ '#0f2027', '#2c5364', '#7ed6df', '#e0f7fa' ],
			grain: 4,
			seed: 5,
		},
	},
	{
		id: 'speckled',
		label: __( 'Speckled Stone', 'wunderpaint' ),
		params: {
			style: 'terrazzo',
			terrazzo: { count: 60, size: 40, mix: 60 },
			colors: [ '#f3ede4', '#e07a5f', '#3d405b', '#81b29a', '#f2cc8f' ],
			grain: 3,
			seed: 10,
		},
	},
	{
		id: 'tartan',
		label: __( 'Tartan', 'wunderpaint' ),
		params: {
			style: 'plaid',
			plaid: { size: 55, bands: 60, weave: 60 },
			colors: [ '#1d3557', '#7a1f2b', '#2a9d8f', '#f1faee' ],
			grain: 0,
			seed: 3,
		},
	},
	{
		id: 'mermaid',
		label: __( 'Mermaid', 'wunderpaint' ),
		params: {
			style: 'scales',
			scales: { size: 40, rings: 4, weight: 35 },
			colors: [ '#0b3954', '#087e8b', '#3fb8af', '#e0fff4' ],
			grain: 4,
			seed: 7,
		},
	},
];

/** Full params of a look (every option the engine may read is present). */
export const lookParams = ( look ) => {
	const { style } = look.params;
	return {
		...BG_DEFAULTS,
		...look.params,
		[ style ]: { ...BG_DEFAULTS[ style ], ...look.params[ style ] },
	};
};
