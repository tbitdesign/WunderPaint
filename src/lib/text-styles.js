/**
 * One-click text style presets (v1.139.0): each tile patches the layer with
 * a ready-made combination of fills, outlines and text effects. Everything
 * stays non-destructive and tweakable afterwards in Character / Text
 * Effects / Warp. `patch` REPLACES textFX (a style is a fresh look, not an
 * addition); fill/outline keys included so the look is complete.
 */

import { __ } from '@wordpress/i18n';
import { TEXT_STYLE_COLLECTION } from './text-style-collection';
import { CLASSIC_TEXT_STYLES } from './text-style-classics';

const RESET = {
	textFX: null,
	fillType: 'solid',
	gradientStops: null,
	outlineColor: null,
	strokeGradient: null,
	outlineW: 0,
	shadowOn: false,
	bgColor: null,
};

export const TEXT_STYLES = [
	{
		id: 'platinum-flow',
		label: __( 'Platinum Flow', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#cbd9f2',
			textFX: {
				liquidMetal: {
					color: '#ccd9ed',
					bevel: 44,
					shine: 92,
					angle: 120,
				},
				ribbonFlow: {
					color: '#a3c8e4',
					color2: '#293650',
					length: 16,
					bend: 5,
					angle: 75,
					count: 24,
				},
			},
		},
	},
	{
		id: 'opal-glass',
		label: __( 'Opal Glass', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#a4e8e5',
			textFX: {
				dichroicGlass: {
					color: '#a0f4e7',
					color2: '#b6a0ff',
					bevel: 45,
					shine: 95,
					angle: 130,
					dispersion: 85,
					opacity: 72,
				},
			},
		},
	},
	{
		id: 'solar-ribbon',
		label: __( 'Solar Ribbon', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#ffe4a6',
			fillType: 'gradient',
			gradientKind: 'linear',
			gradientAngle: 90,
			gradientStops: [
				{ at: 0, color: '#fff0c4' },
				{ at: 0.48, color: '#ffd67d' },
				{ at: 1, color: '#f9a95f' },
			],
			textFX: {
				ribbonFlow: {
					color: '#f78b72',
					color2: '#80374e',
					length: 72,
					bend: 30,
					angle: 60,
					count: 24,
				},
			},
		},
	},
	{
		id: 'prism-bloom',
		label: __( 'Prism Bloom', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#89e9ed',
			textFX: {
				prismCut: {
					color: '#68ebe4',
					color2: '#ed83bf',
					slices: 9,
					shift: 11,
					depth: 12,
					angle: 22,
				},
			},
		},
	},
	{
		id: 'midnight-tunnel',
		label: __( 'Midnight Tunnel', 'wunderpaint' ),
		patch: {
			...RESET,
			color: '#aaf5df',
			textFX: {
				contourTunnel: {
					color: '#89f4dc',
					color2: '#6850c5',
					count: 20,
					width: 9,
					depth: 85,
					angle: 18,
				},
			},
		},
	},
	...TEXT_STYLE_COLLECTION.map( ( item ) => ( {
		...item,
		patch: { ...RESET, ...item.patch },
	} ) ),
	...CLASSIC_TEXT_STYLES.map( ( item ) => ( {
		...item,
		patch: { ...RESET, ...item.patch },
	} ) ),
];
