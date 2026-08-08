/**
 * The swan: a kite base folded in half, then the whole front half
 * reverse-folds up as the neck and a smaller reverse fold at the top
 * bends the head forward. The same machinery as the crane's neck -
 * crease as the bisector of where the spike is and where it should
 * point - on a much friendlier figure.
 */
import { compileFigure } from '../compile.js';
import { foldedCentroid, mirrorAcross, sideOf } from '../authoring.js';

const T = Math.tan( ( 22.5 * Math.PI ) / 180 );

const norm = ( v ) => {
	const l = Math.hypot( v[ 0 ], v[ 1 ] ) || 1;
	return [ v[ 0 ] / l, v[ 1 ] / l ];
};
const reverseCrease = ( through, spikeDir, target ) => {
	const s = norm( spikeDir );
	const t = norm( target );
	const c = norm( [ s[ 0 ] + t[ 0 ], s[ 1 ] + t[ 1 ] ] );
	return [
		[ through[ 0 ] - 0.6 * c[ 0 ], through[ 1 ] - 0.6 * c[ 1 ] ],
		[ through[ 0 ] + 0.6 * c[ 0 ], through[ 1 ] + 0.6 * c[ 1 ] ],
	];
};

// The neck: everything nose-side of a crease through the body rises.
const HINGE = [ 0.35, 0.35 ];
const NOSE_DIR = [ -Math.SQRT1_2, -Math.SQRT1_2 ];
const NECK = reverseCrease( HINGE, NOSE_DIR, [ 0.55, -0.84 ] );
const NECK_SIDE = sideOf( NECK, [ 0, 0 ] );

// The head: the tip of the risen neck bends forward.
const TIP = mirrorAcross( NECK[ 0 ], NECK[ 1 ] )( [ 0, 0 ] );
const headHinge = [
	TIP[ 0 ] + 0.5 * ( HINGE[ 0 ] - TIP[ 0 ] ),
	TIP[ 1 ] + 0.5 * ( HINGE[ 1 ] - TIP[ 1 ] ),
];
const HEAD = reverseCrease(
	headHinge,
	norm( [ TIP[ 0 ] - headHinge[ 0 ], TIP[ 1 ] - headHinge[ 1 ] ] ),
	[ 0.95, -0.3 ]
);
const HEAD_SIDE = sideOf( HEAD, TIP );

export const swan = compileFigure( {
	id: 'swan',
	label: 'Swan',
	difficulty: 3,
	view: { yaw: -40, pitch: 52, zoom: 1.2 },
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
			text: 'Reverse-fold the long point up between the layers - the neck.',
			folds: [
				{
					line: NECK,
					side: NECK_SIDE,
					dir: 1,
					layers: ( p ) =>
						sideOf( NECK, foldedCentroid( p ) ) === NECK_SIDE,
				},
			],
		},
		{
			text: 'A small reverse fold at the top - the head looks forward.',
			folds: [
				{
					line: HEAD,
					side: HEAD_SIDE,
					dir: -1,
					layers: ( p ) =>
						sideOf( HEAD, foldedCentroid( p ) ) === HEAD_SIDE,
				},
			],
		},
	],
	probes: [
		{ label: 'Body', at: [ 0.55, 0.78 ] },
		{ label: 'Neck', at: [ 0.498, 0.241 ] },
	],
} );
