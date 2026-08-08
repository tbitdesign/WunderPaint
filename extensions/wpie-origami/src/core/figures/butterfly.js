/**
 * The butterfly, from the waterbomb base: the sheet collapses into a
 * triangle - front corners tuck forward, back corners tuck backward -
 * then the front corners rise as upper wings and the whole thing
 * bends along the body into flight.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid } from '../authoring.js';

export const butterfly = compileFigure( {
	id: 'butterfly',
	label: 'Butterfly',
	difficulty: 2,
	view: { yaw: 0, pitch: 52, zoom: 1.3 },
	steps: [
		{
			text: 'Fold the sheet in half backward, top edge behind the bottom edge.',
			folds: [
				{
					line: [
						[ 0, 0.5 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: -1,
				},
			],
		},
		{
			text: 'Push both sides in between the layers - the sheet collapses into a triangle.',
			folds: [
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0, 1 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0, 1 ],
					],
					side: 1,
					dir: -1,
					layers: 'bottom',
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 1, 1 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 1, 1 ],
					],
					side: -1,
					dir: -1,
					layers: 'bottom',
				},
			],
		},
		{
			text: 'Fold the front corners up to the top point - the upper wings.',
			folds: [
				{
					line: [
						[ 0.25, 0.75 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
				},
				{
					line: [
						[ 0.75, 0.75 ],
						[ 0.5, 1 ],
					],
					side: -1,
					dir: 1,
					layers: 'top',
				},
			],
		},
		{
			text: 'Bend the wings up along the middle - and it flies.',
			folds: [
				// Each side takes EVERYTHING lying on it - also the
				// tucked collapse flaps, which neither cross nor hinge
				// on the middle line and would stay behind in the air.
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.5, 1 ],
					],
					side: -1,
					dir: 1,
					angle: 0.7,
					layers: ( p ) => foldedCentroid( p )[ 0 ] > 0.5 + 1e-9,
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
					angle: 0.7,
					layers: ( p ) => foldedCentroid( p )[ 0 ] < 0.5 - 1e-9,
				},
			],
		},
	],
	probes: [
		{ label: 'Wings', at: [ 0.35, 0.8 ] },
		{ label: 'Wings', at: [ 0.65, 0.8 ] },
	],
} );
