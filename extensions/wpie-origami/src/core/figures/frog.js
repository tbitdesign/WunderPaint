/**
 * The jumping frog: fold the sheet in half, collapse the top into a
 * triangle - the head with front legs - fold the legs out, then the
 * zigzag at the back that makes it jump, and a last bend that puts it
 * into its crouch.
 *
 * The collapse works on the doubled sheet: the two front layers of
 * the stack tuck forward, the two back layers backward.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid } from '../authoring.js';

export const frog = compileFigure( {
	id: 'frog',
	label: 'Jumping frog',
	difficulty: 3,
	view: { yaw: 18, pitch: 42, zoom: 1.5 },
	steps: [
		{
			text: 'Fold the sheet in half backward, left behind right.',
			folds: [
				{
					line: [
						[ 0.5, 0 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: -1,
				},
			],
		},
		{
			text: 'Fold the top edge down behind, then push both sides in - the top collapses into a triangle.',
			folds: [
				{
					line: [
						[ 0.5, 0.25 ],
						[ 1, 0.25 ],
					],
					side: -1,
					dir: -1,
				},
				{
					line: [
						[ 0.75, 0.25 ],
						[ 0.5, 0.5 ],
					],
					side: 1,
					dir: 1,
					layers: ( p ) => p.h >= -1,
				},
				{
					line: [
						[ 0.75, 0.25 ],
						[ 0.5, 0.5 ],
					],
					side: 1,
					dir: -1,
					layers: ( p ) => p.h < -1,
				},
				{
					line: [
						[ 0.75, 0.25 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: 1,
					layers: ( p ) => p.h >= -1,
				},
				{
					line: [
						[ 0.75, 0.25 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: -1,
					layers: ( p ) => p.h < -1,
				},
			],
		},
		{
			text: 'Fold the front corners up to the top point.',
			folds: [
				{
					line: [
						[ 0.625, 0.375 ],
						[ 0.75, 0.5 ],
					],
					side: 1,
					dir: 1,
					layers: ( p ) => p.h >= 1,
				},
				{
					line: [
						[ 0.875, 0.375 ],
						[ 0.75, 0.5 ],
					],
					side: -1,
					dir: 1,
					layers: ( p ) => p.h >= 1,
				},
			],
		},
		{
			text: 'Fold the little triangles down and out - the front legs.',
			folds: [
				// One leg per side: without the centre split the middle
				// pieces land in BOTH rotations, get turned twice and
				// stick out of the model as flat slivers.
				{
					line: [
						[ 0.625, 0.375 ],
						[ 0.7, 0.5 ],
					],
					side: -1,
					dir: 1,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 3 &&
							c[ 0 ] < 0.75 - 1e-6 &&
							0.075 * ( c[ 1 ] - 0.375 ) -
								0.125 * ( c[ 0 ] - 0.625 ) <
								-1e-9
						);
					},
				},
				{
					line: [
						[ 0.875, 0.375 ],
						[ 0.8, 0.5 ],
					],
					side: 1,
					dir: 1,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 3 &&
							c[ 0 ] > 0.75 + 1e-6 &&
							-0.075 * ( c[ 1 ] - 0.375 ) -
								0.125 * ( c[ 0 ] - 0.875 ) >
								1e-9
						);
					},
				},
			],
		},
		{
			text: 'Fold the bottom edge up, then its half back down - the spring.',
			folds: [
				{
					line: [
						[ 0.5, 0.75 ],
						[ 1, 0.75 ],
					],
					side: 1,
					dir: 1,
				},
				{
					line: [
						[ 0.5, 0.625 ],
						[ 1, 0.625 ],
					],
					side: -1,
					dir: -1,
					layers: ( p ) =>
						p.h >= 1 && p.paper.every( ( pt ) => pt[ 1 ] > 0.7 ),
				},
			],
		},
		{
			text: 'Let the spring open a little - the frog crouches, ready to jump.',
			folds: [
				{
					line: [
						[ 0.5, 0.75 ],
						[ 1, 0.75 ],
					],
					side: -1,
					dir: 1,
					angle: 1,
					layers: ( p ) =>
						p.h >= 1 && p.paper.every( ( pt ) => pt[ 1 ] > 0.7 ),
				},
			],
		},
	],
	probes: [
		{ label: 'Back', at: [ 0.75, 0.6 ] },
		{ label: 'Head', at: [ 0.75, 0.35 ] },
	],
} );
