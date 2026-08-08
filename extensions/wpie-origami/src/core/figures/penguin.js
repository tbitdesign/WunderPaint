/**
 * The penguin: a kite base from the head corner, folded in half - slim
 * head up, plump body down. The kite flaps land showing the BACK design
 * along the spine - dark back, light chest, from one sheet. The head
 * tip bends down as the beak and the body opens so it stands.
 */
import { compileFigure } from '../compile.js';

const T = Math.tan( ( 22.5 * Math.PI ) / 180 );

export const penguin = compileFigure( {
	id: 'penguin',
	label: 'Penguin',
	difficulty: 1,
	view: { yaw: 50, pitch: 55, zoom: 1.3 },
	steps: [
		{
			text: 'Fold both edges at the head corner in to the diagonal - the dark back.',
			folds: [
				{
					line: [
						[ 0, 0 ],
						[ 1, T ],
					],
					side: -1,
					dir: 1,
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0, 0 ],
						[ T, 1 ],
					],
					side: 1,
					dir: 1,
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold it in half along the diagonal, away from you.',
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
			text: 'Bend the head tip down through both layers - the beak.',
			folds: [
				{
					line: [
						[ 0.3, 0 ],
						[ 0, 0.3 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Open the body a little - the penguin stands.',
			folds: [
				{
					line: [
						[ 0, 0 ],
						[ 1, 1 ],
					],
					side: 1,
					dir: 1,
					angle: 0.5,
					shaped: true,
					layers: ( p ) => p.h >= 0,
				},
			],
		},
	],
	probes: [
		{ label: 'Chest', at: [ 0.6, 0.95 ] },
		{ label: 'Back', at: [ 0.45, 0.6 ] },
		{ label: 'Beak', at: [ 0.12, 0.25 ] },
	],
} );
