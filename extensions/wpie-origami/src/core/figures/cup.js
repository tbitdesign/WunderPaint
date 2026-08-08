/**
 * The drinking cup: diagonal fold, both corners wrapped across so each
 * locks the other, the front tip folded down over the band, the back
 * tip behind. The corner creases are the perpendicular bisectors of
 * corner-to-landing-point, so the tips land exactly on the opposite
 * edges; the last step opens the pocket and stands the cup up.
 */
import { compileFigure } from '../compile.js';

// Corner (1,0) lands on the midpoint of the left leg, (0,1) on the
// midpoint of the right leg; creases follow from the reflections.
const C1 = [ 7 / 12, 5 / 12 ];
const C2 = [ 1, 0.625 ];
const C1M = [ 5 / 12, 7 / 12 ];
const C2M = [ 0.625, 1 ];

export const cup = compileFigure( {
	id: 'cup',
	label: 'Cup',
	difficulty: 1,
	view: { yaw: 45, pitch: 55, zoom: 1.35 },
	steps: [
		{
			text: 'Fold the sheet in half along the diagonal, away from you.',
			folds: [
				{
					line: [
						[ 0, 1 ],
						[ 1, 0 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the right corner across, its tip onto the left edge.',
			folds: [ { line: [ C1, C2 ], side: -1, dir: 1 } ],
		},
		{
			text: 'Fold the left corner across over it - the band locks.',
			folds: [ { line: [ C1M, C2M ], side: 1, dir: 1 } ],
		},
		{
			text: 'Fold the front tip down over the band, the back tip behind.',
			folds: [
				{
					line: [ C2, C2M ],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.55 ],
				},
				{
					line: [ C2, C2M ],
					side: -1,
					dir: -1,
					layers: 'bottom',
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Open the cup a little - it stands.',
			folds: [
				{
					line: [
						[ 0, 1 ],
						[ 1, 0 ],
					],
					side: 1,
					dir: 1,
					angle: 0.3,
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
					angle: 0.3,
					shaped: true,
					layers: ( p ) => p.h < 0,
				},
			],
		},
	],
	probes: [
		{ label: 'Cup', at: [ 0.7, 0.55 ] },
		{ label: 'Rim', at: [ 0.75, 0.75 ] },
	],
} );
