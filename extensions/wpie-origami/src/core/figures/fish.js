/**
 * The fish: a kite base folded in half makes the slim body, the tail
 * flicks up across the back, the nose folds behind to blunt the mouth.
 * Front and back of the paper both show - body one colour, tail and
 * belly the other.
 */
import { compileFigure } from '../compile.js';

const T = Math.tan( ( 22.5 * Math.PI ) / 180 );

export const fish = compileFigure( {
	id: 'fish',
	label: 'Fish',
	difficulty: 1,
	view: { yaw: -45, pitch: 56, zoom: 1.25 },
	steps: [
		{
			text: 'Fold both edges at the nose corner in to the diagonal - the kite.',
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
			text: 'Fold the kite in half along the diagonal, away from you.',
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
			text: 'Fold the thin end up across the back - the tail.',
			folds: [
				{
					line: [
						[ 0.63, 0.93 ],
						[ 0.93, 0.63 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Fold the nose tip behind - the mouth.',
			folds: [
				{
					line: [
						[ 0.1, 0 ],
						[ 0, 0.1 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
	],
	probes: [
		{ label: 'Body', at: [ 0.35, 0.6 ] },
		{ label: 'Tail', at: [ 0.6, 0.64 ] },
	],
} );
