/**
 * The cat face: same diagonal start as the dog, but the ears fold UP
 * and poke past the top edge - pointy, unmistakably a cat - and the
 * chin folds behind to square the head.
 */
import { compileFigure } from '../compile.js';

export const cat = compileFigure( {
	id: 'cat',
	label: 'Cat face',
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
			text: 'Fold both corners up past the top edge - the pointy ears.',
			folds: [
				{
					line: [
						[ 0.8, 0 ],
						[ 1, 0.3 ],
					],
					side: -1,
					dir: 1,
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0, 0.8 ],
						[ 0.3, 1 ],
					],
					side: 1,
					dir: 1,
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold the chin tip behind - the cat looks at you.',
			folds: [
				{
					line: [
						[ 1, 0.75 ],
						[ 0.75, 1 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
	],
	probes: [
		{ label: 'Ears', at: [ 0.9, 0.22 ] },
		{ label: 'Ears', at: [ 0.22, 0.9 ] },
		{ label: 'Face', at: [ 0.7, 0.7 ] },
	],
} );
