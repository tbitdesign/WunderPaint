/**
 * Heaven and hell: corners to the middle, turn it over, corners to
 * the middle again, then open it up over your fingers. The last step
 * is the only one that leaves the table - partial hinges strike the
 * open X pose.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid } from '../authoring.js';

export const fortune = compileFigure( {
	id: 'fortune',
	label: 'Fortune teller',
	difficulty: 2,
	view: { yaw: 30, pitch: 50, zoom: 1.3 },
	steps: [
		{
			text: 'Fold all four corners to the middle of the sheet.',
			folds: [
				{
					line: [
						[ 0.5, 0 ],
						[ 0, 0.5 ],
					],
					side: 1,
					dir: 1,
				},
				{
					line: [
						[ 0.5, 0 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: 1,
				},
				{
					line: [
						[ 1, 0.5 ],
						[ 0.5, 1 ],
					],
					side: -1,
					dir: 1,
				},
				{
					line: [
						[ 0, 0.5 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Turn the whole thing over.',
			folds: [
				{
					line: [
						[ 0.5, 0 ],
						[ 0.5, 1 ],
					],
					turnOver: true,
				},
			],
		},
		{
			text: 'Fold all four corners to the middle again.',
			folds: [
				{
					line: [
						[ 0.25, 0.25 ],
						[ 0.75, 0.25 ],
					],
					side: -1,
					dir: 1,
				},
				{
					line: [
						[ 0.75, 0.25 ],
						[ 0.75, 0.75 ],
					],
					side: -1,
					dir: 1,
				},
				{
					line: [
						[ 0.25, 0.75 ],
						[ 0.75, 0.75 ],
					],
					side: 1,
					dir: 1,
				},
				{
					line: [
						[ 0.25, 0.25 ],
						[ 0.25, 0.75 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Slide your fingers into the four pockets and push them together - it opens.',
			folds: [
				// Each hinge takes its WHOLE half or quadrant - also the
				// inner flaps, which would otherwise stay behind in the
				// air when the pose strikes.
				{
					line: [
						[ 0.5, 0.25 ],
						[ 0.5, 0.75 ],
					],
					side: -1,
					dir: -1,
					angle: 1.2,
					w: [ 0, 1 ],
					layers: ( p ) => foldedCentroid( p )[ 0 ] > 0.5 + 1e-9,
				},
				{
					line: [
						[ 0.25, 0.5 ],
						[ 0.5, 0.5 ],
					],
					side: 1,
					dir: -1,
					angle: 1.2,
					w: [ 0, 1 ],
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return c[ 0 ] < 0.5 - 1e-9 && c[ 1 ] > 0.5 + 1e-9;
					},
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.75, 0.5 ],
					],
					side: 1,
					dir: -1,
					angle: 1.2,
					w: [ 0, 1 ],
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return c[ 0 ] > 0.5 + 1e-9 && c[ 1 ] > 0.5 + 1e-9;
					},
				},
			],
		},
	],
	probes: [
		{ label: 'Inside flaps', at: [ 0.5, 0.35 ] },
		{ label: 'Pockets', at: [ 0.62, 0.5 ] },
	],
} );
