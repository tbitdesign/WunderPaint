/**
 * The samurai helmet (kabuto): diagonal fold, both corners down to the
 * chin, the tips back up to the crown, then out as horns; the front
 * brim folds up over everything, the back edge disappears behind. The
 * last step opens it so it would actually sit on a (paper) head.
 */
import { compileFigure } from '../compile.js';

export const helmet = compileFigure( {
	id: 'helmet',
	label: 'Samurai helmet',
	difficulty: 2,
	view: { yaw: 45, pitch: 52, zoom: 1.25 },
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
			text: 'Fold both corners down to the chin point.',
			folds: [
				{
					line: [
						[ 0.5, 0.5 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: 1,
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold both hanging tips back up to the crown.',
			folds: [
				{
					line: [
						[ 1, 0.5 ],
						[ 0.75, 0.75 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0.5, 1 ],
						[ 0.75, 0.75 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold the tips out at an angle - the horns.',
			folds: [
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.875, 0.625 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.625, 0.875 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold the front layer up over the horns - the brim.',
			folds: [
				{
					line: [
						[ 1, 0.6 ],
						[ 0.6, 1 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
				},
			],
		},
		{
			text: 'Fold the back layer up behind - the helmet closes.',
			folds: [
				{
					line: [
						[ 1, 0.8 ],
						[ 0.8, 1 ],
					],
					side: -1,
					dir: -1,
					layers: 'bottom',
				},
			],
		},
	],
	probes: [
		{ label: 'Helmet', at: [ 0.7, 0.7 ] },
		{ label: 'Horns', at: [ 0.8, 0.55 ] },
		{ label: 'Brim', at: [ 0.85, 0.85 ] },
	],
} );
