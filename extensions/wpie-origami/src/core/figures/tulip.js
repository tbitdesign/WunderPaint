/**
 * The tulip bloom: a diagonal fold, then both bottom corners rise
 * across the middle so their tips poke out beside the top - the
 * petals. The last step opens the bloom and stands it up.
 */
import { compileFigure } from '../compile.js';

export const tulip = compileFigure( {
	id: 'tulip',
	label: 'Tulip',
	difficulty: 1,
	view: { yaw: 45, pitch: 55, zoom: 1.25 },
	steps: [
		{
			text: 'Fold the sheet in half along the diagonal, away from you.',
			folds: [
				{
					line: [
						[ 1, 0 ],
						[ 0, 1 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold both corners up across the middle, tips past the edges - the petals.',
			folds: [
				{
					line: [
						[ 0.55, 0.45 ],
						[ 1, 0.6 ],
					],
					side: -1,
					dir: 1,
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0.45, 0.55 ],
						[ 0.6, 1 ],
					],
					side: 1,
					dir: 1,
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Open the bloom a little - it stands.',
			folds: [
				{
					line: [
						[ 0, 1 ],
						[ 1, 0 ],
					],
					side: 1,
					dir: 1,
					angle: 0.22,
					shaped: true,
					layers: ( p ) => p.h >= 0,
				},
				{
					line: [
						[ 0, 1 ],
						[ 1, 0 ],
					],
					side: 1,
					dir: -1,
					angle: 0.22,
					shaped: true,
					layers: ( p ) => p.h < 0,
				},
			],
		},
	],
	probes: [
		{ label: 'Bloom', at: [ 0.8, 0.8 ] },
		{ label: 'Petals', at: [ 0.75, 0.62 ] },
	],
} );
