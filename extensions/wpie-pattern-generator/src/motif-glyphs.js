import {
	TAU,
	path,
	ellipse,
	line,
	fill,
	transform,
	leaf,
	cubic,
} from './geometry.js';
import { COLLECTION_GLYPH_SETS } from './collection-glyphs.js';

const variants = ( fn ) => Array.from( { length: 5 }, ( _, i ) => fn( i ) );
const stem = ( bend = 0 ) =>
	line(
		cubic( [ 0, 0.46 ], [ bend, 0.12 ], [ -bend, -0.1 ], [ 0, -0.44 ] ),
		0.022
	);
const fern = ( i ) => {
	const out = [ stem( 0.1 ) ];
	for ( let j = 0; j < 8; j++ )
		for ( const side of [ -1, 1 ] ) {
			const y = 0.3 - j * 0.09,
				s = ( 0.3 - j * 0.024 ) * ( 0.85 + i * 0.055 );
			out.push(
				fill(
					leaf(
						side * s * 0.48,
						y - 0.04,
						s,
						side * -0.6,
						0.14 + i * 0.025
					)
				)
			);
		}
	return out;
};
const flower = ( i ) => {
	const n = 5 + i,
		out = [
			line(
				[
					[ 0, 0.45 ],
					[ 0.01, -0.08 ],
				],
				0.023
			),
			fill( leaf( -0.1, 0.2, 0.27, -0.6 ) ),
			fill( leaf( 0.1, 0.3, 0.24, 0.6 ) ),
		];
	for ( let j = 0; j < n; j++ ) {
		const a = ( j / n ) * TAU;
		out.push( {
			...line(
				leaf(
					Math.cos( a ) * 0.14,
					-0.2 + Math.sin( a ) * 0.14,
					0.29,
					a,
					0.27
				),
				0.017,
				true
			),
			tone: 1,
		} );
	}
	out.push( { ...fill( ellipse( 0, -0.2, 0.055 ) ), tone: 2 } );
	return out;
};
const tropical = ( i ) => {
	const out = [
		line( leaf( 0, 0, 0.9, Math.PI / 2, 0.32 + i * 0.025 ), 0.024, true ),
		stem(),
	];
	for ( let j = 0; j < 7; j++ )
		for ( const side of [ -1, 1 ] ) {
			const y = -0.28 + j * 0.09,
				w = Math.sin( ( ( j + 1 ) / 8 ) * Math.PI ) * 0.25;
			out.push(
				line(
					cubic(
						[ 0, y + 0.07 ],
						[ side * w * 0.5, y + 0.05 ],
						[ side * w, y - 0.05 ],
						[ side * w, y - 0.08 ]
					),
					0.014 + i * 0.002
				)
			);
		}
	return out;
};
const mushroom = ( i ) => {
	const cap = ellipse(
		0,
		-0.06,
		0.37 + i * 0.012,
		0.29 - i * 0.02,
		Math.PI,
		TAU
	);
	const out = [
		line( cap.concat( [ [ -0.37, -0.06 ] ] ), 0.025, true ),
		line(
			[
				[ -0.06, -0.06 ],
				[ -0.1, 0.38 ],
				[ 0.09, 0.38 ],
				[ 0.05, -0.06 ],
			],
			0.025
		),
		line( ellipse( 0, -0.06, 0.37, 0.06 ), 0.012, true ),
	];
	for ( let j = 0; j < 5; j++ ) {
		const a = Math.PI + ( ( j + 1 ) * Math.PI ) / 6;
		out.push( {
			...fill(
				ellipse(
					Math.cos( a ) * 0.24,
					-0.06 + Math.sin( a ) * 0.19,
					0.025 + i * 0.002
				)
			),
			tone: 1,
		} );
	}
	return out;
};
const citrus = ( i ) => {
	const out = [
		line( ellipse( 0, 0, 0.39, 0.35 + i * 0.012 ), 0.027, true ),
		line( ellipse( 0, 0, 0.33 ), 0.015, true ),
		fill( leaf( 0.2, -0.36, 0.27, -0.5 ) ),
	];
	const n = 7 + i;
	for ( let j = 0; j < n; j++ ) {
		const a = ( j * TAU ) / n + 0.06,
			b = ( ( j + 1 ) * TAU ) / n - 0.06;
		out.push( {
			...line(
				[
					[ Math.cos( a ) * 0.06, Math.sin( a ) * 0.06 ],
					...ellipse( 0, 0, 0.29, 0.29, a, b, 10 ),
					[ Math.cos( b ) * 0.06, Math.sin( b ) * 0.06 ],
				],
				0.013,
				true
			),
			tone: 1,
		} );
	}
	return out;
};
const berries = ( i ) => {
	const out = [
		stem( 0.1 ),
		fill( leaf( 0.14, -0.3, 0.34, -0.6 ) ),
		fill( leaf( -0.12, -0.18, 0.28, 0.4 ) ),
	];
	for ( let j = 0; j < 5 + i; j++ ) {
		const a = j * 2.4,
			r = Math.sqrt( j + 1 ) * 0.09,
			x = Math.cos( a ) * r,
			y = 0.1 + Math.sin( a ) * r;
		out.push(
			line(
				[
					[ 0, -0.18 ],
					[ x, y ],
				],
				0.014
			),
			{ ...line( ellipse( x, y, 0.083 ), 0.023, true ), tone: 1 },
			line(
				ellipse(
					x - 0.02,
					y - 0.02,
					0.036,
					0.036,
					Math.PI,
					Math.PI * 1.6
				),
				0.012
			)
		);
	}
	return out;
};
const shell = ( i ) => {
	const out = [];
	for ( let j = 0; j <= 10; j++ ) {
		const a = Math.PI * ( 1.12 + ( j / 10 ) * 0.76 );
		out.push(
			line(
				cubic(
					[ 0, 0.37 ],
					[ Math.cos( a ) * 0.12, 0.1 ],
					[ Math.cos( a ) * 0.38, -0.05 ],
					[
						Math.cos( a ) * 0.46,
						0.12 + Math.sin( a ) * ( 0.5 + i * 0.012 ),
					]
				),
				0.016
			)
		);
	}
	out.push(
		line(
			ellipse(
				0,
				0.12,
				0.46,
				0.5 + i * 0.012,
				Math.PI * 1.12,
				Math.PI * 1.88
			),
			0.027
		),
		line(
			[
				[ -0.16, 0.3 ],
				[ -0.12, 0.4 ],
				[ 0.12, 0.4 ],
				[ 0.16, 0.3 ],
			],
			0.025
		)
	);
	return out;
};
const coral = ( i ) => {
	const out = [];
	const branch = ( x, y, a, len, depth ) => {
		const nx = x + Math.sin( a ) * len,
			ny = y - Math.cos( a ) * len;
		out.push(
			line(
				cubic(
					[ x, y ],
					[ x, y - len * 0.4 ],
					[ nx, ny + len * 0.3 ],
					[ nx, ny ]
				),
				0.009 + depth * 0.012
			)
		);
		if ( depth ) {
			branch( nx, ny, a - 0.45 - i * 0.035, len * 0.64, depth - 1 );
			branch( nx, ny, a + 0.5, len * 0.66, depth - 1 );
		}
	};
	branch( 0, 0.43, 0, 0.32, 3 );
	return out;
};
const butterfly = ( i ) => {
	const out = [
		line(
			[
				[ 0, 0.26 ],
				[ 0, -0.25 ],
			],
			0.036
		),
	];
	for ( const s of [ -1, 1 ] ) {
		out.push(
			line(
				cubic(
					[ 0, -0.14 ],
					[ s * 0.62, -0.68 ],
					[ s * 0.62, 0.25 ],
					[ 0, 0.02 ]
				).concat(
					cubic(
						[ 0, 0.02 ],
						[ s * 0.59, 0.12 ],
						[ s * 0.3, 0.63 ],
						[ 0, 0.19 ]
					)
				),
				0.023,
				true
			),
			line(
				cubic(
					[ 0, -0.22 ],
					[ s * 0.03, -0.37 ],
					[ s * 0.14, -0.42 ],
					[ s * 0.14, -0.34 ]
				),
				0.015
			),
			{
				...line(
					ellipse( s * 0.25, -0.13, 0.07 + i * 0.008, 0.11 ),
					0.018,
					true
				),
				tone: 1,
			},
			{ ...fill( ellipse( s * 0.19, 0.24, 0.043 ) ), tone: 1 }
		);
	}
	return out;
};
const bee = ( i ) => {
	const out = [
		line( ellipse( 0, 0.08, 0.17, 0.27 ), 0.025, true ),
		fill( ellipse( 0, -0.23, 0.1 ) ),
	];
	for ( const s of [ -1, 1 ] )
		out.push(
			line(
				transform(
					ellipse( 0, 0, 0.13, 0.25 ),
					s * 0.2,
					-0.1,
					1,
					s * 0.7
				),
				0.018,
				true
			),
			line(
				[
					[ s * 0.05, -0.27 ],
					[ s * 0.11, -0.4 ],
				],
				0.018
			),
			line(
				[
					[ s * 0.1, 0.11 ],
					[ s * 0.26, 0.3 ],
				],
				0.016
			)
		);
	for ( let j = 0; j < 3; j++ )
		out.push( {
			...line(
				[
					[ -0.145, -0.04 + j * 0.1 ],
					[ 0.145, -0.04 + j * 0.1 ],
				],
				0.03 + i * 0.003
			),
			tone: 1,
		} );
	return out;
};
const ink = ( i ) =>
	Array.from( { length: 7 + i }, ( _, j ) =>
		line(
			path(
				( t ) => [
					-0.4 + t * 0.8,
					-0.3 +
						j * 0.065 +
						Math.sin( t * TAU * ( 1 + ( i % 3 ) ) + j * 0.27 ) *
							0.045,
				],
				32
			),
			0.009 + ( j % 3 ) * 0.005
		)
	);
const brush = ( i ) =>
	Array.from( { length: 9 }, ( _, j ) =>
		fill(
			path(
				( t ) => [
					-0.44 + t * 0.88,
					-0.26 +
						j * 0.06 +
						Math.sin( t * Math.PI + i ) * 0.15 +
						Math.sin( t * 29 + j ) * 0.008,
				],
				32
			).concat(
				path(
					( t ) => [
						0.44 - t * 0.88,
						-0.245 +
							j * 0.06 +
							Math.sin( ( 1 - t ) * Math.PI + i ) * 0.15,
					],
					32
				)
			)
		)
	);
const herb = ( i ) => {
	const out = [ stem( 0.07 ) ];
	for ( let j = 0; j < 5; j++ )
		for ( const s of [ -1, 1 ] ) {
			const y = 0.3 - j * 0.15;
			out.push(
				line(
					leaf(
						s * 0.13,
						y - 0.05,
						0.32,
						s * -0.75,
						0.16 + i * 0.035
					),
					0.017,
					true
				),
				line(
					[
						[ 0, y ],
						[ s * 0.24, y - 0.15 ],
					],
					0.01
				)
			);
		}
	return out;
};
const pod = ( i ) => {
	const out = [
		stem(),
		line( ellipse( 0, -0.16, 0.21 + i * 0.012, 0.25 ), 0.023, true ),
	];
	for ( let j = -2; j <= 2; j++ )
		out.push(
			line(
				cubic(
					[ 0, -0.41 ],
					[ j * 0.1, -0.3 ],
					[ j * 0.1, -0.03 ],
					[ 0, 0.09 ]
				),
				0.013
			)
		);
	out.push(
		line(
			[
				[ -0.09, -0.39 ],
				[ -0.06, -0.46 ],
				[ 0.06, -0.46 ],
				[ 0.09, -0.39 ],
			],
			0.02
		)
	);
	return out;
};
const acorn = ( i ) => {
	const out = [
		line(
			cubic(
				[ -0.23, -0.12 ],
				[ -0.25, 0.4 ],
				[ 0.25, 0.4 ],
				[ 0.23, -0.12 ]
			),
			0.025
		),
		line( ellipse( 0, -0.12, 0.27, 0.16 ), 0.024, true ),
		line(
			[
				[ 0, -0.26 ],
				[ 0.05 + i * 0.008, -0.43 ],
			],
			0.035
		),
	];
	for ( let j = -2; j <= 2; j++ )
		out.push(
			line(
				[
					[ j * 0.07 - 0.07, -0.21 ],
					[ j * 0.07 + 0.07, -0.06 ],
				],
				0.011
			)
		);
	return out;
};
const feather = ( i ) => {
	const out = [ stem( 0.04 ) ];
	for ( let j = 0; j < 17; j++ )
		for ( const s of [ -1, 1 ] ) {
			const y = 0.3 - j * 0.04,
				w =
					Math.sin( ( ( j + 1 ) / 19 ) * Math.PI ) *
					( 0.21 + i * 0.016 );
			out.push(
				line(
					cubic(
						[ 0, y + 0.07 ],
						[ s * w * 0.4, y + 0.04 ],
						[ s * w, y - 0.02 ],
						[ s * w, y - 0.08 ]
					),
					0.012
				)
			);
		}
	return out;
};
const seaweed = ( i ) => {
	const out = [];
	for ( let j = -2; j <= 2; j++ ) {
		const curve = path( ( t ) => [
			j * 0.1 * t + Math.sin( t * ( 5 + i ) + j ) * 0.035 * t,
			0.42 - t * ( 0.7 - Math.abs( j ) * 0.08 ),
		] );
		out.push( line( curve, 0.032 + ( j % 2 === 0 ? 0.013 : 0 ) ) );
	}
	return out;
};

export const EXTRA_GLYPH_SETS = [
	[ 'ferns', 'Ferns', fern ],
	[ 'wildflowers', 'Wildflowers', flower ],
	[ 'tropical', 'Tropical leaves', tropical ],
	[ 'mushrooms', 'Mushrooms', mushroom ],
	[ 'citrusfruit', 'Citrus fruit', citrus ],
	[ 'berries', 'Berries', berries ],
	[ 'shells', 'Shells', shell ],
	[ 'coral', 'Coral', coral ],
	[ 'butterflies', 'Butterflies', butterfly ],
	[ 'bees', 'Bees', bee ],
	[ 'inkmarks', 'Ink marks', ink ],
	[ 'brushmarks', 'Brush marks', brush ],
	[ 'herbs', 'Herbs', herb ],
	[ 'seedpods', 'Seed pods', pod ],
	[ 'acorns', 'Acorns', acorn ],
	[ 'feathers', 'Feathers', feather ],
	[ 'seaweed', 'Seaweed', seaweed ],
].map( ( [ id, label, fn ] ) => ( { id, label, glyphs: variants( fn ) } ) );

EXTRA_GLYPH_SETS.push( ...COLLECTION_GLYPH_SETS );
