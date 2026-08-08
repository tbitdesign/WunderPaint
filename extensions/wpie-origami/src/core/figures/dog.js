/**
 * The dog face: the classic first fold of every childhood - a diagonal
 * fold, two ears flopping down over the face, the chin folded behind.
 * Three folds, instantly a dog.
 */
import { compileFigure } from '../compile.js';

export const dog = compileFigure( {
	id: 'dog',
	label: 'Dog face',
	difficulty: 1,
	view: { yaw: 45, pitch: 58, zoom: 1.15 },
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
			text: 'Fold the front corners down over the face - the floppy ears.',
			folds: [
				{
					line: [
						[ 0.6, 0.1 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0.1, 0.6 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold the front chin tip up, the back tip behind - the snout.',
			folds: [
				{
					line: [
						[ 1, 0.8 ],
						[ 0.8, 1 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 1, 0.8 ],
						[ 0.8, 1 ],
					],
					side: -1,
					dir: -1,
					layers: 'bottom',
					w: [ 0.45, 1 ],
				},
			],
		},
	],
	probes: [
		{ label: 'Ears', at: [ 0.78, 0.4 ] },
		{ label: 'Ears', at: [ 0.4, 0.78 ] },
		{ label: 'Face', at: [ 0.75, 0.75 ] },
	],
} );
