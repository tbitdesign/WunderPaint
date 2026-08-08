/**
 * The masu box: corners to the middle, then the paper leaves the
 * table - all four walls rise along the floor edges, and each wall's
 * folded corner wraps over the rim and hangs into the box as lining.
 * Floor, walls and lining from one sheet.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid } from '../authoring.js';

const H = Math.PI / 2;
// The corner gussets: the paper between two rising walls must split
// along the corner bisector and each half must ride ITS wall - left
// alone it stays flat on the table, disconnected in the air. The
// splitters are exact near-zero folds: they only cut, nothing turns.
const CUT = { angle: 1e-9, exact: true, side: 1, dir: 1, w: [ 0, 0.02 ] };
const wedge = ( test ) => ( p ) => test( foldedCentroid( p ) );

export const masu = compileFigure( {
	id: 'masu',
	label: 'Masu box',
	difficulty: 3,
	view: { yaw: 30, pitch: 40, zoom: 1.9 },
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
			text: 'Raise all four walls along the edges of the floor.',
			folds: [
				{
					...CUT,
					line: [
						[ 0.75, 0.5 ],
						[ 1, 0.5 ],
					],
				},
				{
					...CUT,
					line: [
						[ 0.5, 0.75 ],
						[ 0.5, 1 ],
					],
				},
				{
					...CUT,
					line: [
						[ 0.25, 0.5 ],
						[ 0, 0.5 ],
					],
				},
				{
					...CUT,
					line: [
						[ 0.5, 0.25 ],
						[ 0.5, 0 ],
					],
				},
				{
					line: [
						[ 0.25, 0 ],
						[ 1, 0.75 ],
					],
					side: -1,
					dir: 1,
					angle: H,
					shaped: true,
					w: [ 0.05, 0.4 ],
					layers: wedge(
						( c ) =>
							c[ 0 ] > 0.5 &&
							c[ 1 ] < 0.5 &&
							c[ 0 ] - c[ 1 ] > 0.25
					),
				},
				{
					line: [
						[ 0.25, 1 ],
						[ 1, 0.25 ],
					],
					side: 1,
					dir: 1,
					angle: H,
					shaped: true,
					w: [ 0.2, 0.6 ],
					layers: wedge(
						( c ) =>
							c[ 0 ] > 0.5 &&
							c[ 1 ] > 0.5 &&
							c[ 0 ] + c[ 1 ] > 1.25
					),
				},
				{
					line: [
						[ 0, 0.25 ],
						[ 0.75, 1 ],
					],
					side: 1,
					dir: 1,
					angle: H,
					shaped: true,
					w: [ 0.4, 0.8 ],
					layers: wedge(
						( c ) =>
							c[ 0 ] < 0.5 &&
							c[ 1 ] > 0.5 &&
							c[ 1 ] - c[ 0 ] > 0.25
					),
				},
				{
					line: [
						[ 0, 0.75 ],
						[ 0.75, 0 ],
					],
					side: -1,
					dir: 1,
					angle: H,
					shaped: true,
					w: [ 0.6, 1 ],
					layers: wedge(
						( c ) =>
							c[ 0 ] < 0.5 &&
							c[ 1 ] < 0.5 &&
							c[ 0 ] + c[ 1 ] < 0.75
					),
				},
			],
		},
		{
			text: 'Unfold each corner out over the rim - the lining shows.',
			folds: [
				{
					line: [
						[ 0.5, 0 ],
						[ 1, 0.5 ],
					],
					side: 1,
					dir: -1,
					angle: 2.95,
					shaped: true,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 1 &&
							c[ 0 ] > 0.5 + 1e-9 &&
							c[ 1 ] < 0.5 - 1e-9
						);
					},
					w: [ 0, 0.4 ],
				},
				{
					line: [
						[ 0.5, 1 ],
						[ 1, 0.5 ],
					],
					side: -1,
					dir: -1,
					angle: 2.95,
					shaped: true,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 1 &&
							c[ 0 ] > 0.5 + 1e-9 &&
							c[ 1 ] > 0.5 + 1e-9
						);
					},
					w: [ 0.2, 0.6 ],
				},
				{
					line: [
						[ 0, 0.5 ],
						[ 0.5, 1 ],
					],
					side: -1,
					dir: -1,
					angle: 2.95,
					shaped: true,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 1 &&
							c[ 0 ] < 0.5 - 1e-9 &&
							c[ 1 ] > 0.5 + 1e-9
						);
					},
					w: [ 0.4, 0.8 ],
				},
				{
					line: [
						[ 0, 0.5 ],
						[ 0.5, 0 ],
					],
					side: 1,
					dir: -1,
					angle: 2.95,
					shaped: true,
					layers: ( p ) => {
						const c = foldedCentroid( p );
						return (
							p.h >= 1 &&
							c[ 0 ] < 0.5 - 1e-9 &&
							c[ 1 ] < 0.5 - 1e-9
						);
					},
					w: [ 0.6, 1 ],
				},
			],
		},
	],
	probes: [
		{ label: 'Floor', at: [ 0.5, 0.5 ] },
		{ label: 'Walls', at: [ 0.62, 0.32 ] },
	],
} );
