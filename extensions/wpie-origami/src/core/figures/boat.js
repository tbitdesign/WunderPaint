/**
 * The sailboat: a diagonal fold makes the sail, a strip folded up
 * makes the hull, the tip folded over makes the pennant. Hull and
 * pennant fold only the front layer, so they show the back design -
 * a boat in two colours from one sheet.
 */
import { compileFigure } from '../compile.js';

export const boat = compileFigure( {
	id: 'boat',
	label: 'Sailboat',
	difficulty: 1,
	view: { yaw: 8, pitch: 55, zoom: 1.15 },
	steps: [
		{
			text: 'Fold the sheet in half along the diagonal, away from you - the sail.',
			folds: [
				{
					line: [
						[ 0, 0 ],
						[ 1, 1 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the bottom strip of the front layer up - the hull.',
			folds: [
				{
					line: [
						[ 0, 0.85 ],
						[ 0.85, 0.85 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
				},
			],
		},
		{
			text: 'Fold the tip of the front layer down - the pennant.',
			folds: [
				{
					line: [
						[ 0, 0.2 ],
						[ 0.2, 0.2 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
				},
			],
		},
	],
	probes: [
		{ label: 'Sail', at: [ 0.25, 0.55 ] },
		{ label: 'Hull', at: [ 0.5, 0.78 ] },
	],
} );
