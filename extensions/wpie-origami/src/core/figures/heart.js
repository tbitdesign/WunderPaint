/**
 * The classic heart, on the diagonal: top corner behind to the middle,
 * bottom corner behind and past it, both sides folded behind so their
 * edges meet on the axis - the tips rising past the top edge become
 * the lobes. Four little tucks round it off.
 *
 * Everything folds AWAY from you, so the smooth front of the heart is
 * the side you design as the front, and you watch it stay whole while
 * the paper disappears behind it.
 */
import { compileFigure } from '../compile.js';

export const heart = compileFigure( {
	id: 'heart',
	label: 'Heart',
	difficulty: 1,
	view: { yaw: 45, pitch: 62, zoom: 1.3 },
	steps: [
		{
			text: 'Fold the top corner behind, down to the middle of the sheet.',
			folds: [
				{
					line: [
						[ 0.5, 0 ],
						[ 0, 0.5 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the bottom corner behind, well past the folded edge.',
			folds: [
				{
					line: [
						[ 1, 0.25 ],
						[ 0.25, 1 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold both sides behind so their edges meet in the middle of the back.',
			folds: [
				{
					line: [
						[ 0.625, 0 ],
						[ 0.625, 0.625 ],
					],
					side: -1,
					dir: -1,
				},
				{
					line: [
						[ 0, 0.625 ],
						[ 0.625, 0.625 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the four little corners behind to round the lobes.',
			folds: [
				{
					line: [
						[ 0.55, 0 ],
						[ 0.625, 0.075 ],
					],
					side: -1,
					dir: -1,
				},
				{
					line: [
						[ 0, 0.55 ],
						[ 0.075, 0.625 ],
					],
					side: 1,
					dir: -1,
				},
				{
					line: [
						[ 0.32, 0 ],
						[ 0.25, 0.07 ],
					],
					side: 1,
					dir: -1,
				},
				{
					line: [
						[ 0, 0.32 ],
						[ 0.07, 0.25 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
	],
	probes: [
		{ label: 'Heart', at: [ 0.35, 0.3 ] },
		{ label: 'Heart', at: [ 0.3, 0.35 ] },
	],
} );
