/**
 * The crane. The square base is folded flat (half fold, then both
 * sides tucked between the layers). Kite folds bring the edges to the
 * middle - through all four flaps - and the petal lifts throw the
 * free points high past the closed corner: the bird base, two long
 * legs below, two long points above. The legs reverse out as neck and
 * tail, a small reverse fold makes the head, and the petal flaps fan
 * up as wings.
 *
 * All creases are computed: 22.5 degree kites ending on the edges,
 * the petal hinge through their ends, reverse folds as direction
 * bisectors.
 */
import { compileFigure } from '../compile.js';
import { mirrorAcross } from '../authoring.js';

const F = [ 1, 1 ]; // the four free corners of the square base
const EPS = 1e-6;

// Kite creases from F at 22.5 degrees either side of the diagonal,
// ending on the edges of the square-base diamond (y=0.5 and x=0.5).
const T = Math.tan( ( 22.5 * Math.PI ) / 180 );
const K1 = [ 1 - 0.5 * T, 0.5 ]; // right edge
const K2 = [ 0.5, 1 - 0.5 * T ]; // left edge

const norm = ( v ) => {
	const l = Math.hypot( v[ 0 ], v[ 1 ] ) || 1;
	return [ v[ 0 ] / l, v[ 1 ] / l ];
};
const reverseCrease = ( through, spikeDir, target ) => {
	const s = norm( spikeDir );
	const t = norm( target );
	const c = norm( [ s[ 0 ] + t[ 0 ], s[ 1 ] + t[ 1 ] ] );
	return [
		[ through[ 0 ] - 0.5 * c[ 0 ], through[ 1 ] - 0.5 * c[ 1 ] ],
		[ through[ 0 ] + 0.5 * c[ 0 ], through[ 1 ] + 0.5 * c[ 1 ] ],
	];
};
const sideOf = ( [ a, b ], p ) =>
	Math.sign(
		( b[ 0 ] - a[ 0 ] ) * ( p[ 1 ] - a[ 1 ] ) -
			( b[ 1 ] - a[ 1 ] ) * ( p[ 0 ] - a[ 0 ] )
	);

// The paper quadrants behind each square-base flap.
const onA = ( p ) =>
	p.paper.every( ( pt ) => pt[ 0 ] <= 0.5 + EPS && pt[ 1 ] >= 0.5 - EPS );
const onB = ( p ) =>
	p.paper.every( ( pt ) => pt[ 0 ] >= 0.5 - EPS && pt[ 1 ] >= 0.5 - EPS );
const onC = ( p ) =>
	p.paper.every( ( pt ) => pt[ 0 ] <= 0.5 + EPS && pt[ 1 ] <= 0.5 + EPS );
const onD = ( p ) =>
	p.paper.every( ( pt ) => pt[ 0 ] >= 0.5 - EPS && pt[ 1 ] <= 0.5 + EPS );

// Reverse folds: neck up-left, tail up-right (screen up is (-1,-1)).
const DOWN = [ Math.SQRT1_2, Math.SQRT1_2 ];
const HINGE = [ 0.74, 0.74 ];
const NECK = reverseCrease( HINGE, DOWN, [ -0.9, 0.05 ] );
const TAIL = reverseCrease( HINGE, DOWN, [ 0.05, -0.9 ] );
const TIP = mirrorAcross( NECK[ 0 ], NECK[ 1 ] )( F );
const headHinge = [
	TIP[ 0 ] + 0.3 * ( HINGE[ 0 ] - TIP[ 0 ] ),
	TIP[ 1 ] + 0.3 * ( HINGE[ 1 ] - TIP[ 1 ] ),
];
const HEAD = reverseCrease(
	headHinge,
	norm( [ TIP[ 0 ] - headHinge[ 0 ], TIP[ 1 ] - headHinge[ 1 ] ] ),
	[ 0.3, 0.9 ]
);

export const crane = compileFigure( {
	id: 'crane',
	label: 'Crane',
	difficulty: 4,
	view: { yaw: 35, pitch: 42, zoom: 1.15 },
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
			text: 'Tuck the left half between the layers: front to the front, back to the back - the square base.',
			folds: [
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: 1,
					layers: 'top',
				},
				{
					line: [
						[ 0.5, 0.5 ],
						[ 0.5, 1 ],
					],
					side: 1,
					dir: -1,
					layers: 'bottom',
				},
			],
		},
		{
			text: 'Fold the edges of the front flaps to the middle and lift the front point high past the top - the petal.',
			folds: [
				{
					line: [ F, K1 ],
					side: 1,
					dir: 1,
					layers: 'top',
					w: [ 0, 0.3 ],
				},
				{
					line: [ F, K2 ],
					side: -1,
					dir: 1,
					layers: 'top',
					w: [ 0.1, 0.4 ],
				},
				{
					line: [ F, K1 ],
					side: 1,
					dir: -1,
					layers: ( p ) => onB( p ),
					w: [ 0.2, 0.5 ],
				},
				{
					line: [ F, K2 ],
					side: -1,
					dir: -1,
					layers: ( p ) => onB( p ),
					w: [ 0.3, 0.6 ],
				},
				{
					line: [ K1, K2 ],
					side: -1,
					dir: 1,
					layers: ( p ) => onA( p ),
					w: [ 0.55, 1 ],
				},
			],
		},
		{
			text: 'The same on the back - the bird base, two long points below.',
			folds: [
				{
					line: [ F, K1 ],
					side: 1,
					dir: -1,
					layers: 'bottom',
					w: [ 0, 0.3 ],
				},
				{
					line: [ F, K2 ],
					side: -1,
					dir: -1,
					layers: 'bottom',
					w: [ 0.1, 0.4 ],
				},
				{
					line: [ F, K1 ],
					side: 1,
					dir: 1,
					layers: ( p ) => onD( p ),
					w: [ 0.2, 0.5 ],
				},
				{
					line: [ F, K2 ],
					side: -1,
					dir: 1,
					layers: ( p ) => onD( p ),
					w: [ 0.3, 0.6 ],
				},
				{
					line: [ K1, K2 ],
					side: -1,
					dir: -1,
					layers: ( p ) => onC( p ),
					w: [ 0.55, 1 ],
				},
			],
		},
		{
			text: 'Reverse-fold the front point up and out - the neck.',
			folds: [
				{
					line: NECK,
					side: sideOf( NECK, F ),
					dir: 1,
					layers: ( p ) => onB( p ),
				},
			],
		},
		{
			text: 'Reverse-fold the back point up the other way - the tail.',
			folds: [
				{
					line: TAIL,
					side: sideOf( TAIL, F ),
					dir: -1,
					layers: ( p ) => onD( p ),
				},
			],
		},
		{
			text: 'A small reverse fold at the top of the neck - the head.',
			folds: [
				{
					line: HEAD,
					side: sideOf( HEAD, TIP ),
					dir: -1,
					layers: ( p ) => onB( p ),
				},
			],
		},
		{
			text: 'Fan the wings up - the crane is done.',
			folds: [
				{
					line: [ K1, K2 ],
					side: 1,
					dir: 1,
					angle: 0.85,
					shaped: true,
					layers: ( p ) => onA( p ),
					w: [ 0, 0.6 ],
				},
				{
					line: [ K1, K2 ],
					side: 1,
					dir: 1,
					angle: 1.45,
					shaped: true,
					layers: ( p ) => onC( p ),
					w: [ 0.4, 1 ],
				},
			],
		},
	],
	probes: [
		{ label: 'Wings', at: [ 0.6, 0.56 ] },
		{ label: 'Body', at: [ 0.7, 0.7 ] },
	],
} );
