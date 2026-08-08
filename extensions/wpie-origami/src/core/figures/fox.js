/**
 * The fox: a diagonal fold, two ears through both layers, a snout.
 *
 * Three folds a child can do. The ear folds catch two layers, the
 * snout only the front one - the compiler works out which paper
 * pieces that means.
 */
import { compileFigure } from '../compile.js';

export const fox = compileFigure( {
	id: 'fox',
	label: 'Fox',
	difficulty: 1,
	view: { yaw: 45, pitch: 58, zoom: 1.1 },
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
			text: 'Fold both corners up over the front - the ears.',
			folds: [
				{
					line: [
						[ 0.85, 0.15 ],
						[ 1, 0.45 ],
					],
					side: -1,
					dir: 1,
				},
				{
					line: [
						[ 0.15, 0.85 ],
						[ 0.45, 1 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Fold the front point up across the face - the snout.',
			folds: [
				{
					line: [
						[ 1, 0.7 ],
						[ 0.7, 1 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
				},
			],
		},
	],
	probes: [
		{ label: 'Face', at: [ 0.6, 0.65 ] },
		{ label: 'Ears', at: [ 0.83, 0.26 ] },
		{ label: 'Ears', at: [ 0.26, 0.83 ] },
		{ label: 'Snout', at: [ 0.8, 0.8 ] },
	],
} );
