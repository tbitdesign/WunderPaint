/**
 * Curated vector element sets (v1.11, Canva-style "Elements"): arrows,
 * blobs, badges, speech bubbles and more, inserted as ordinary shape
 * layers (pathD in a 100×100 box or built-in shape kinds).
 */

import { __ } from '@wordpress/i18n';

import bundledElements from './bundled-elements.json';
import extraElements from './elements-extra.json';

const blob = ( d ) => ( { pathD: d } );

const BUILTIN_ELEMENT_SETS = [
	{
		id: 'arrows',
		label: __( 'Arrows', 'wunderpaint' ),
		items: [
			{ name: 'Arrow right', shape: 'arrow' },
			{ name: 'Arrow left', shape: 'arrow', flipX: true },
			{
				name: 'Chevron',
				...blob( 'M 20 10 L 60 50 L 20 90 L 40 90 L 80 50 L 40 10 Z' ),
			},
			{
				name: 'Curved arrow',
				...blob(
					'M 10 80 Q 50 10 82 42 L 90 20 L 95 55 L 60 50 L 78 46 Q 52 22 18 84 Z'
				),
			},
			{
				name: 'Double arrow',
				...blob(
					'M 0 50 L 25 30 L 25 42 L 75 42 L 75 30 L 100 50 L 75 70 L 75 58 L 25 58 L 25 70 Z'
				),
			},
		],
	},
	{
		id: 'blobs',
		label: __( 'Blobs', 'wunderpaint' ),
		items: [
			{
				name: 'Blob 1',
				...blob(
					'M 50 6 C 74 2 94 20 92 44 C 90 68 78 92 52 94 C 26 96 6 78 8 52 C 10 26 26 10 50 6 Z'
				),
			},
			{
				name: 'Blob 2',
				...blob(
					'M 42 8 C 66 0 92 14 94 38 C 96 62 84 88 58 94 C 32 100 8 84 6 58 C 4 32 18 16 42 8 Z'
				),
			},
			{
				name: 'Blob 3',
				...blob(
					'M 54 4 C 78 8 98 28 92 52 C 86 76 64 98 40 92 C 16 86 2 64 8 40 C 14 16 30 0 54 4 Z'
				),
			},
			{
				name: 'Squircle',
				...blob(
					'M 50 4 C 88 4 96 12 96 50 C 96 88 88 96 50 96 C 12 96 4 88 4 50 C 4 12 12 4 50 4 Z'
				),
			},
		],
	},
	{
		id: 'badges',
		label: __( 'Badges', 'wunderpaint' ),
		items: [
			{ name: 'Star badge', shape: 'star', sides: 12 },
			{ name: 'Star', shape: 'star', sides: 5 },
			{ name: 'Seal', shape: 'star', sides: 24 },
			{ name: 'Hexagon', shape: 'polygon', sides: 6 },
			{ name: 'Octagon', shape: 'polygon', sides: 8 },
			{
				name: 'Ribbon',
				...blob( 'M 8 30 L 92 30 L 82 50 L 92 70 L 8 70 L 18 50 Z' ),
			},
		],
	},
	{
		id: 'speech',
		label: __( 'Speech', 'wunderpaint' ),
		items: [
			{ name: 'Speech bubble', shape: 'speech' },
			{
				name: 'Round bubble',
				...blob(
					'M 50 8 C 78 8 96 24 96 46 C 96 68 78 82 50 82 C 44 82 38 81 33 80 L 12 92 L 20 72 C 10 65 4 56 4 46 C 4 24 22 8 50 8 Z'
				),
			},
			{
				name: 'Thought bubble',
				...blob(
					'M 50 6 C 76 6 94 20 94 40 C 94 60 76 74 50 74 C 24 74 6 60 6 40 C 6 20 24 6 50 6 Z M 26 80 C 32 80 36 84 36 88 C 36 92 32 96 26 96 C 20 96 16 92 16 88 C 16 84 20 80 26 80 Z'
				),
			},
		],
	},
	{
		id: 'basics',
		label: __( 'Basics', 'wunderpaint' ),
		items: [
			{ name: 'Heart', shape: 'heart' },
			{ name: 'Circle', shape: 'ellipse' },
			{ name: 'Triangle', shape: 'polygon', sides: 3 },
			{ name: 'Line', shape: 'line' },
			{ name: 'Half circle', ...blob( 'M 4 96 A 46 46 0 0 1 96 96 Z' ) },
			{
				name: 'Quarter circle',
				...blob( 'M 4 96 L 4 4 A 92 92 0 0 1 96 96 Z' ),
			},
		],
	},
	{
		id: 'symbols',
		label: __( 'Symbols', 'wunderpaint' ),
		items: [
			{
				name: 'Check',
				...blob( 'M 10 55 L 40 85 L 90 25 L 78 15 L 40 62 L 22 44 Z' ),
			},
			{
				name: 'Cross',
				...blob(
					'M 20 8 L 50 38 L 80 8 L 92 20 L 62 50 L 92 80 L 80 92 L 50 62 L 20 92 L 8 80 L 38 50 L 8 20 Z'
				),
			},
			{
				name: 'Plus',
				...blob(
					'M 38 8 L 62 8 L 62 38 L 92 38 L 92 62 L 62 62 L 62 92 L 38 92 L 38 62 L 8 62 L 8 38 L 38 38 Z'
				),
			},
			{
				name: 'Bolt',
				...blob( 'M 55 2 L 15 58 L 42 58 L 35 98 L 85 38 L 55 38 Z' ),
			},
			{
				name: 'Pin',
				...blob(
					'M 50 2 C 70 2 85 18 85 38 C 85 62 50 98 50 98 C 50 98 15 62 15 38 C 15 18 30 2 50 2 Z'
				),
			},
			{
				name: 'Tag',
				...blob( 'M 8 25 L 62 25 L 92 50 L 62 75 L 8 75 Z' ),
			},
			{
				name: 'Shield',
				...blob(
					'M 50 4 L 88 18 L 88 50 C 88 74 72 90 50 98 C 28 90 12 74 12 50 L 12 18 Z'
				),
			},
			{
				name: 'Crown',
				...blob(
					'M 10 75 L 10 30 L 32 50 L 50 20 L 68 50 L 90 30 L 90 75 Z'
				),
			},
			{
				name: 'Sparkle',
				...blob(
					'M 50 0 C 55 30 70 45 100 50 C 70 55 55 70 50 100 C 45 70 30 55 0 50 C 30 45 45 30 50 0 Z'
				),
			},
			{
				name: 'Drop',
				...blob(
					'M 50 2 C 50 2 85 45 85 65 C 85 85 70 98 50 98 C 30 98 15 85 15 65 C 15 45 50 2 50 2 Z'
				),
			},
		],
	},
	{
		id: 'banners',
		label: __( 'Banners', 'wunderpaint' ),
		items: [
			{
				name: 'Ribbon',
				...blob( 'M 5 30 L 95 30 L 84 50 L 95 70 L 5 70 L 16 50 Z' ),
			},
			{
				name: 'Banner',
				...blob(
					'M 5 35 L 20 25 L 80 25 L 95 35 L 95 65 L 80 75 L 20 75 L 5 65 Z'
				),
			},
			{
				name: 'Bookmark',
				...blob( 'M 25 4 L 75 4 L 75 96 L 50 74 L 25 96 Z' ),
			},
			{ name: 'Pennant', ...blob( 'M 10 10 L 90 50 L 10 90 Z' ) },
			{
				name: 'Flag',
				...blob(
					'M 15 5 L 22 5 L 22 95 L 15 95 Z M 22 10 L 88 10 L 76 30 L 88 50 L 22 50 Z'
				),
			},
			{ name: 'Corner', ...blob( 'M 0 35 L 35 0 L 55 0 L 0 55 Z' ) },
		],
	},
	{
		id: 'nature',
		label: __( 'Nature', 'wunderpaint' ),
		items: [
			{
				name: 'Moon',
				...blob(
					'M 62 4 C 38 10 22 30 22 52 C 22 76 40 94 64 96 C 44 84 34 68 34 50 C 34 32 44 14 62 4 Z'
				),
			},
			{
				name: 'Cloud',
				...blob(
					'M 28 78 C 14 78 6 68 6 58 C 6 47 14 40 24 39 C 26 25 38 16 52 16 C 66 16 76 24 80 36 C 90 37 96 45 96 56 C 96 68 87 78 74 78 Z'
				),
			},
			{
				name: 'Leaf',
				...blob(
					'M 88 12 C 50 8 14 30 12 66 C 12 82 22 90 34 88 C 70 84 90 50 88 12 Z'
				),
			},
			{
				name: 'Mountain',
				...blob( 'M 4 88 L 38 30 L 55 56 L 68 20 L 96 88 Z' ),
			},
			{
				name: 'Wave',
				...blob(
					'M 0 60 C 15 40 30 40 45 60 C 60 80 75 80 90 60 L 100 70 L 100 95 L 0 95 Z'
				),
			},
		],
	},
	{
		id: 'geometric',
		label: __( 'Geometric', 'wunderpaint' ),
		items: [
			{ name: 'Triangle', ...blob( 'M 50 8 L 95 90 L 5 90 Z' ) },
			{ name: 'Right triangle', ...blob( 'M 10 10 L 10 90 L 90 90 Z' ) },
			{
				name: 'Parallelogram',
				...blob( 'M 25 20 L 95 20 L 75 80 L 5 80 Z' ),
			},
			{
				name: 'Trapezoid',
				...blob( 'M 25 25 L 75 25 L 95 80 L 5 80 Z' ),
			},
			{ name: 'Semicircle', ...blob( 'M 5 75 A 45 45 0 0 1 95 75 Z' ) },
			{
				name: 'Quarter circle',
				...blob( 'M 10 90 L 10 10 A 80 80 0 0 1 90 90 Z' ),
			},
			{ name: 'Diamond', ...blob( 'M 50 4 L 96 50 L 50 96 L 4 50 Z' ) },
			{ name: 'Kite', ...blob( 'M 50 4 L 80 40 L 50 96 L 20 40 Z' ) },
		],
	},
];

/**
 * Bundled custom elements (v1.20): authored via File → Export for Library →
 * "Export as Element", dropped into src/content/bundled-elements/ and
 * aggregated by tools/build-content.js. Shown as their own "Custom" set.
 */
const CUSTOM_SET = bundledElements.length
	? [
			{
				id: 'custom',
				label: __( 'Custom', 'wunderpaint' ),
				items: bundledElements.map( ( element ) => ( {
					name: element.name,
					...( element.pathD
						? { pathD: element.pathD }
						: { shape: element.shape, sides: element.sides } ),
				} ) ),
			},
	  ]
	: [];

/**
 * Extended catalog (v1.301): ~100 more curated pathD shapes, generated
 * by tools/gen-shapes.mjs into elements-extra.json. Set labels live
 * here so they stay translatable literals.
 */
const EXTRA_SET_LABELS = {
	arrows2: __( 'More Arrows', 'wunderpaint' ),
	banners2: __( 'Banners & Ribbons', 'wunderpaint' ),
	bursts: __( 'Bursts & Seals', 'wunderpaint' ),
	frames: __( 'Frames', 'wunderpaint' ),
	geometry: __( 'More Geometry', 'wunderpaint' ),
	callouts: __( 'Callouts', 'wunderpaint' ),
	stars2: __( 'Stars & Sparkles', 'wunderpaint' ),
	nature2: __( 'Botanicals', 'wunderpaint' ),
	icons2: __( 'Icons', 'wunderpaint' ),
	ui: __( 'Media & UI', 'wunderpaint' ),
};

const EXTRA_SETS = extraElements.map( ( elementSet ) => ( {
	id: elementSet.id,
	label: EXTRA_SET_LABELS[ elementSet.id ] || elementSet.id,
	items: elementSet.items,
} ) );

export const ELEMENT_SETS = [
	...BUILTIN_ELEMENT_SETS,
	...EXTRA_SETS,
	...CUSTOM_SET,
];
