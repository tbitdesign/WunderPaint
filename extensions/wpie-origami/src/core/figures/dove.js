/**
 * The dove: a diagonal fold, the front wing up past the back ridge,
 * the back wing behind, the head tip bent down as the beak - then the
 * body opens and the bird flies.
 */
import { compileFigure } from '../compile.js';

const WING = [
	[ 0.55, 0.3 ],
	[ 1, 0.8 ],
];

// The wing pieces by their PAPER region: the front wing comes from the
// corner beyond the wing crease, the back wing from the mirror of that
// corner in the other half of the sheet. Corner points sit exactly ON
// the crease, so the test needs a tolerance, not a sign.
const wingCross = ( p ) =>
	( WING[ 1 ][ 0 ] - WING[ 0 ][ 0 ] ) * ( p[ 1 ] - WING[ 0 ][ 1 ] ) -
	( WING[ 1 ][ 1 ] - WING[ 0 ][ 1 ] ) * ( p[ 0 ] - WING[ 0 ][ 0 ] );
const onFrontWing = ( p ) => p.paper.every( ( pt ) => wingCross( pt ) <= 1e-6 );
const onBackWing = ( p ) =>
	p.paper.every(
		( pt ) => wingCross( [ 1 - pt[ 1 ], 1 - pt[ 0 ] ] ) <= 1e-6
	);

export const dove = compileFigure( {
	id: 'dove',
	label: 'Dove',
	difficulty: 2,
	view: { yaw: 15, pitch: 62, zoom: 1.1 },
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
			text: 'Fold the front layer up past the ridge - the near wing.',
			folds: [ { line: WING, side: -1, dir: 1, layers: 'top' } ],
		},
		{
			text: 'Fold the back layer behind, the same way - the far wing.',
			folds: [ { line: WING, side: -1, dir: -1, layers: 'bottom' } ],
		},
		{
			text: 'Bend the head tip down through both layers - the beak.',
			folds: [
				{
					line: [
						[ 0.12, 0.78 ],
						[ 0.32, 1 ],
					],
					side: 1,
					dir: 1,
				},
			],
		},
		{
			text: 'Let the wings open - the dove flies.',
			folds: [
				{
					line: WING,
					side: 1,
					dir: 1,
					angle: 1.05,
					shaped: true,
					layers: ( p ) => p.h >= 1 && onFrontWing( p ),
					w: [ 0, 0.6 ],
				},
				{
					line: WING,
					side: 1,
					dir: 1,
					angle: 2.09,
					shaped: true,
					layers: ( p ) => p.h <= -2 && onBackWing( p ),
					w: [ 0.4, 1 ],
				},
			],
		},
	],
	probes: [
		{ label: 'Wings', at: [ 0.6, 0.62 ] },
		{ label: 'Head', at: [ 0.28, 0.84 ] },
		{ label: 'Body', at: [ 0.75, 0.85 ] },
	],
} );
