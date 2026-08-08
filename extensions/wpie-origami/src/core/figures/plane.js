/**
 * The paper plane - the dart every desk has flown: two kite folds to
 * the centre line, two more on top of them, fold in half, and the
 * wings open out with a little dihedral. The nose is the corner where
 * all the creases meet.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid } from '../authoring.js';

const T = Math.tan( ( 22.5 * Math.PI ) / 180 );
const T2 = Math.tan( ( 33.75 * Math.PI ) / 180 );
// Wing crease, parallel to the spine.
const W = 0.15 * Math.SQRT2;

const wingSide = ( p ) => {
	const c = foldedCentroid( p );
	return c[ 0 ] - c[ 1 ] > W + 1e-6;
};

export const plane = compileFigure( {
	id: 'plane',
	label: 'Paper plane',
	difficulty: 2,
	view: { yaw: -40, pitch: 50, zoom: 1.2 },
	steps: [
		{
			text: 'Fold both edges at the nose corner in to the centre line.',
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
			text: 'Fold the slanted edges in to the centre line again - the dart.',
			folds: [
				{
					line: [
						[ 0, 0 ],
						[ 1, T2 ],
					],
					side: -1,
					dir: 1,
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ 0, 0 ],
						[ T2, 1 ],
					],
					side: 1,
					dir: 1,
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Fold the dart in half along the centre line, away from you.',
			folds: [
				{
					line: [
						[ 0, 0 ],
						[ 1, 1 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the near wing down to the keel, the far wing behind.',
			folds: [
				{
					line: [
						[ W, 0 ],
						[ 1, 1 - W ],
					],
					side: -1,
					dir: 1,
					layers: ( p ) => p.h >= 0 && wingSide( p ),
					w: [ 0, 0.55 ],
				},
				{
					line: [
						[ W, 0 ],
						[ 1, 1 - W ],
					],
					side: -1,
					dir: -1,
					layers: ( p ) => p.h < 0 && wingSide( p ),
					w: [ 0.45, 1 ],
				},
			],
		},
		{
			text: 'Open the wings out - ready for the maiden flight.',
			folds: [
				{
					line: [
						[ W, 0 ],
						[ 1, 1 - W ],
					],
					side: 1,
					dir: 1,
					angle: 2.6,
					shaped: true,
					layers: ( p ) => p.h >= 5,
					w: [ 0, 0.6 ],
				},
				{
					line: [
						[ W, 0 ],
						[ 1, 1 - W ],
					],
					side: 1,
					dir: -1,
					angle: 2.6,
					shaped: true,
					layers: ( p ) => p.h <= -9,
					w: [ 0.4, 1 ],
				},
			],
		},
	],
	probes: [
		{ label: 'Wings', at: [ 0.6, 0.45 ] },
		{ label: 'Nose', at: [ 0.15, 0.12 ] },
	],
} );
