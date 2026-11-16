/** Original vector drawings. Each family contains five distinct silhouettes/details. */
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
const ink = ( points, tone = 0, width = 0.019, closed = false ) => ( {
	...line( points, width, closed ),
	tone,
} );
const solid = ( points, tone = 0 ) => ( { ...fill( points ), tone } );
const curve = ( a, b, c, d ) => cubic( a, b, c, d, 20 );
const twig = () =>
	ink( curve( [ 0, 0.46 ], [ -0.07, 0.1 ], [ 0.06, -0.15 ], [ 0, -0.45 ] ) );

function ginkgo( i ) {
	const spread = 0.94 + i * 0.04;
	const edge = path( ( t ) => {
		const a = Math.PI * ( 1.04 + 0.92 * t ),
			r = 0.42 + 0.015 * Math.sin( t * 23 + i );
		return [
			Math.cos( a ) * r * spread,
			0.1 +
				Math.sin( a ) * r +
				0.075 * Math.exp( -140 * ( t - 0.5 ) ** 2 ),
		];
	}, 50 );
	const out = [
		ink( [ [ 0, 0.3 ], ...edge, [ 0, 0.3 ] ], 0, 0.023, true ),
		ink( [
			[ 0, 0.3 ],
			[ 0.035, 0.47 ],
		] ),
	];
	for ( let j = 1; j < 10 + i; j++ ) {
		const end = edge[ Math.floor( ( j * 50 ) / ( 10 + i ) ) ];
		out.push(
			ink(
				curve(
					[ 0, 0.28 ],
					[ end[ 0 ] * 0.15, 0.09 ],
					[ end[ 0 ] * 0.75, end[ 1 ] + 0.05 ],
					end
				),
				1,
				0.011
			)
		);
	}
	return out;
}
function eucalyptus( i ) {
	const out = [ twig() ];
	for ( let j = 0; j < 6 + ( i % 3 ); j++ ) {
		const side = j % 2 ? 1 : -1,
			y = 0.3 - j * 0.1,
			s = 0.13 - j * 0.008;
		out.push(
			ink(
				[
					[ 0, y + 0.025 ],
					[ side * 0.12, y ],
				],
				0,
				0.012
			),
			solid(
				transform(
					ellipse( 0, 0, s, s * ( 0.75 + i * 0.08 ) ),
					side * 0.13,
					y,
					1,
					side * -0.3
				),
				j % 2
			),
			ink(
				[
					[ side * 0.055, y + 0.025 ],
					[ side * 0.205, y - 0.025 ],
				],
				2,
				0.011
			)
		);
	}
	return out;
}
function olive( i ) {
	const out = [ twig() ];
	for ( let j = 0; j < 4; j++ ) {
		const y = 0.24 - j * 0.19;
		for ( const side of [ -1, 1 ] )
			out.push(
				solid(
					leaf(
						side * 0.14,
						y,
						0.34 - j * 0.025,
						-side * 0.48,
						0.12 + i * 0.013
					),
					j % 2
				)
			);
		if ( j < 2 + ( i % 2 ) )
			out.push(
				ink(
					ellipse( 0.04 + j * 0.025, y + 0.065, 0.05, 0.073 ),
					2,
					0.025,
					true
				)
			);
	}
	return out;
}
function rose( i ) {
	const out = [
		ink( curve( [ 0, 0.45 ], [ 0.04, 0.2 ], [ -0.03, 0 ], [ 0, -0.14 ] ) ),
		solid( leaf( -0.11, 0.24, 0.28, -0.5 ), 1 ),
		solid( leaf( 0.12, 0.14, 0.28, 0.6 ), 1 ),
	];
	const edge = path( ( t ) => {
		const a = t * TAU,
			r = 0.27 + 0.025 * Math.sin( a * ( 5 + i ) );
		return [ Math.cos( a ) * r, -0.15 + Math.sin( a ) * r ];
	}, 72 );
	out.push( ink( edge, 0, 0.026, true ) );
	for ( let j = 0; j < 7; j++ ) {
		const a = j * 2.36 + i * 0.21,
			r = 0.055 + j * 0.026;
		out.push(
			ink(
				ellipse(
					Math.cos( a ) * r * 0.22,
					-0.15 + Math.sin( a ) * r * 0.22,
					r,
					r * 0.8,
					a,
					a + 2.9,
					20
				),
				j % 2,
				0.018
			)
		);
	}
	return out;
}
function tulip( i ) {
	const w = 0.2 + i * 0.018;
	const rim = [
		[ -w, -0.37 ],
		[ -0.08, -0.26 ],
		[ 0, -0.44 ],
		[ 0.09, -0.26 ],
		[ w, -0.37 ],
	];
	const out = [
		ink(
			curve( [ 0, 0.45 ], [ 0.03, 0.2 ], [ -0.02, 0.02 ], [ 0, -0.05 ] )
		),
		ink(
			rim.concat(
				curve( [ w, -0.37 ], [ w, 0.08 ], [ -w, 0.08 ], [ -w, -0.37 ] )
			),
			0,
			0.025,
			true
		),
		ink(
			curve(
				[ -0.08, -0.26 ],
				[ -0.11, -0.12 ],
				[ -0.06, -0.02 ],
				[ 0, -0.015 ]
			),
			1
		),
		ink(
			curve(
				[ 0.09, -0.26 ],
				[ 0.12, -0.1 ],
				[ 0.06, -0.02 ],
				[ 0, -0.015 ]
			),
			1
		),
		solid( leaf( -0.095, 0.18, 0.43, 1.02, 0.16 ), 1 ),
		solid( leaf( 0.11, 0.28, 0.35, 2.1, 0.15 ), 1 ),
	];
	return out;
}
function succulent( i ) {
	const out = [];
	for ( let ring = 0; ring < 3; ring++ ) {
		const n = 7 + i - ring,
			radius = 0.24 - ring * 0.07,
			size = 0.4 - ring * 0.09;
		for ( let j = 0; j < n; j++ ) {
			const a = ( j * TAU ) / n + ring * 0.35;
			out.push(
				ink(
					leaf(
						Math.cos( a ) * radius,
						Math.sin( a ) * radius,
						size,
						a,
						0.24
					),
					ring,
					0.02,
					true
				)
			);
		}
	}
	out.push( solid( ellipse( 0, 0, 0.035 ), 2 ) );
	return out;
}
function orchard( i ) {
	const outline = path( ( t ) => {
		const a = t * TAU,
			pear = i === 1 || i === 3;
		return [
			Math.sin( a ) *
				( pear
					? 0.25 - 0.11 * Math.cos( a )
					: 0.32 + 0.035 * Math.cos( 3 * a ) ),
			0.05 -
				Math.cos( a ) * 0.31 +
				( pear ? 0 : 0.045 * Math.cos( 2 * a ) ),
		];
	}, 60 );
	const out = [
		ink( outline, 0, 0.025, true ),
		ink(
			curve(
				[ 0, -0.2 ],
				[ -0.05, -0.32 ],
				[ 0.04, -0.38 ],
				[ 0.04, -0.45 ]
			),
			0,
			0.027
		),
		solid( leaf( 0.15, -0.34, 0.26, -0.3 ), 1 ),
	];
	if ( i === 2 )
		out.push(
			ink(
				curve(
					[ 0.05, -0.22 ],
					[ -0.15, -0.06 ],
					[ 0.14, 0.26 ],
					[ 0.01, 0.36 ]
				),
				1,
				0.014
			)
		);
	else if ( i === 3 ) {
		out.push( ink( ellipse( 0, 0.12, 0.13, 0.18 ), 1, 0.015, true ) );
		for ( let j = 0; j < 8; j++ )
			out.push(
				solid(
					ellipse(
						Math.sin( j * 2.4 ) * 0.07,
						0.12 + Math.cos( j * 2.4 ) * 0.12,
						0.014
					),
					2
				)
			);
	} else if ( i === 4 )
		out.push(
			ink(
				[
					[ -0.085, -0.22 ],
					[ -0.1, -0.35 ],
					[ -0.02, -0.3 ],
					[ 0.02, -0.38 ],
					[ 0.07, -0.3 ],
					[ 0.12, -0.35 ],
					[ 0.08, -0.22 ],
				],
				1
			)
		);
	else
		out.push(
			ink(
				ellipse( -0.1, 0, 0.12, 0.2, Math.PI, Math.PI * 1.45, 16 ),
				1,
				0.014
			)
		);
	return out;
}
function teaware( i ) {
	const pot = i === 2,
		tall = i === 3,
		top = tall ? -0.23 : -0.13,
		bottom = tall ? 0.25 : 0.19;
	const out = [ ink( ellipse( 0, 0.32, 0.39, 0.065 ), 1, 0.017, true ) ];
	if ( pot ) {
		out.push(
			ink( ellipse( 0, 0.055, 0.25, 0.2 ), 0, 0.024, true ),
			ink( ellipse( 0, -0.15, 0.14, 0.03 ), 0, 0.02, true ),
			solid( ellipse( 0, -0.2, 0.032 ) ),
			ink(
				[
					[ -0.22, -0.02 ],
					[ -0.42, -0.17 ],
					[ -0.36, 0.11 ],
					[ -0.19, 0.2 ],
				],
				0,
				0.027
			)
		);
	} else {
		out.push(
			ink(
				curve(
					[ -0.25, top ],
					[ -0.24, bottom + 0.12 ],
					[ 0.24, bottom + 0.12 ],
					[ 0.25, top ]
				),
				0,
				0.025
			),
			ink( ellipse( 0, top, 0.25, 0.06 ), 0, 0.02, true )
		);
		for ( let j = 0; j <= i % 3; j++ )
			out.push(
				ink(
					ellipse( 0, 0.02 + j * 0.055, 0.21, 0.022, 0, Math.PI, 20 ),
					1,
					0.013
				)
			);
		if ( i === 4 ) out.push( solid( leaf( 0, 0.07, 0.16, -0.5 ), 2 ) );
	}
	out.push(
		ink(
			curve(
				[ 0.24, -0.07 ],
				[ 0.5, -0.18 ],
				[ 0.45, 0.23 ],
				[ 0.23, 0.16 ]
			),
			0,
			0.027
		)
	);
	for ( let j = -1; j <= 1; j++ )
		out.push(
			ink(
				curve(
					[ j * 0.1, top - 0.1 ],
					[ j * 0.1 + 0.06, top - 0.19 ],
					[ j * 0.1 - 0.04, top - 0.21 ],
					[ j * 0.1, top - 0.28 ]
				),
				2,
				0.012
			)
		);
	return out;
}
function dragonfly( i ) {
	const out = [];
	for ( const side of [ -1, 1 ] )
		for ( const row of [ -1, 1 ] ) {
			const a = side * row * ( 0.3 + i * 0.025 );
			out.push(
				ink(
					leaf( side * 0.24, row * 0.12 - 0.04, 0.5, a, 0.19 ),
					1,
					0.016,
					true
				),
				ink(
					[
						[ 0, -0.08 ],
						[ side * 0.45, row * 0.17 - 0.04 ],
					],
					1,
					0.01
				)
			);
		}
	for ( let j = 0; j < 8; j++ )
		out.push(
			solid( ellipse( 0, -0.14 + j * 0.064, 0.039 - j * 0.003, 0.045 ) )
		);
	out.push(
		solid( ellipse( 0, -0.23, 0.06 ) ),
		ink(
			[
				[ -0.025, -0.26 ],
				[ -0.075, -0.35 ],
			],
			0,
			0.014
		),
		ink(
			[
				[ 0.025, -0.26 ],
				[ 0.075, -0.35 ],
			],
			0,
			0.014
		)
	);
	return out;
}
function bird( i ) {
	const out = [
		ink( ellipse( -0.035, 0.04, 0.26, 0.2 ), 0, 0.023, true ),
		ink( ellipse( 0.22, -0.16, 0.12, 0.13 ), 0, 0.023, true ),
		solid(
			[
				[ 0.32, -0.2 ],
				[ 0.48, -0.15 ],
				[ 0.33, -0.11 ],
			],
			1
		),
		solid( ellipse( 0.245, -0.19, 0.018 ), 2 ),
		ink(
			[
				[ -0.25, 0 ],
				[ -0.48, -0.15 - i * 0.025 ],
				[ -0.4, 0.1 ],
				[ -0.2, 0.13 ],
			],
			0,
			0.024
		),
		ink( leaf( -0.06, 0.06, 0.3, -0.22, 0.3 ), 1, 0.019, true ),
		ink(
			[
				[ -0.07, 0.22 ],
				[ -0.09, 0.34 ],
				[ -0.16, 0.36 ],
			],
			0,
			0.014
		),
		ink(
			[
				[ 0.06, 0.22 ],
				[ 0.08, 0.34 ],
				[ 0.16, 0.36 ],
			],
			0,
			0.014
		),
	];
	for ( let j = 0; j < 3 + i; j++ )
		out.push(
			ink(
				[
					[ -0.19 + j * 0.035, 0.015 ],
					[ -0.13 + j * 0.035, 0.11 ],
				],
				1,
				0.012
			)
		);
	if ( i % 2 )
		out.push(
			ink(
				[
					[ 0.13, -0.23 ],
					[ 0.1, -0.4 ],
					[ 0.21, -0.28 ],
					[ 0.23, -0.39 ],
					[ 0.28, -0.25 ],
				],
				1,
				0.02
			)
		);
	return out;
}
function fish( i ) {
	const width = 0.25 + i * 0.022;
	const out = [
		ink( leaf( 0.025, 0, 0.77, 0, width ), 0, 0.024, true ),
		ink(
			[
				[ -0.31, 0 ],
				[ -0.5, -0.19 ],
				[ -0.46, 0 ],
				[ -0.5, 0.19 ],
				[ -0.31, 0 ],
			],
			1,
			0.023,
			true
		),
		ink(
			[
				[ -0.1, -0.16 ],
				[ 0.01, -0.33 ],
				[ 0.16, -0.18 ],
			],
			1,
			0.017
		),
		ink(
			[
				[ -0.1, 0.16 ],
				[ -0.03, 0.3 ],
				[ 0.12, 0.19 ],
			],
			1,
			0.017
		),
		solid( ellipse( 0.255, -0.04, 0.021 ), 2 ),
		ink(
			curve(
				[ 0.16, -0.14 ],
				[ 0.05, -0.04 ],
				[ 0.08, 0.09 ],
				[ 0.18, 0.14 ]
			),
			1,
			0.016
		),
	];
	for ( let j = 0; j < 3 + ( i % 3 ); j++ )
		out.push(
			ink(
				ellipse(
					-0.19 + j * 0.065,
					0,
					0.035,
					0.065,
					-Math.PI / 2,
					Math.PI / 2,
					12
				),
				1,
				0.012
			)
		);
	return out;
}
function seastar( i ) {
	const n = i === 4 ? 6 : 5,
		angle = i * 0.13;
	const outline = path( ( t ) => {
		const a = t * TAU + angle,
			r = 0.25 + 0.14 * Math.cos( n * ( a - angle ) );
		return [ Math.cos( a ) * r, Math.sin( a ) * r * ( 0.85 + i * 0.035 ) ];
	}, 120 );
	const out = [
		ink( outline, 0, 0.025, true ),
		ink( ellipse( 0, 0, 0.055 ), 1, 0.014, true ),
	];
	for ( let j = 0; j < n; j++ )
		for ( let k = 1; k <= 4; k++ ) {
			const a = ( j * TAU ) / n + angle,
				r = 0.065 + k * 0.062;
			out.push(
				solid(
					ellipse(
						Math.cos( a ) * r,
						Math.sin( a ) * r * ( 0.85 + i * 0.035 ),
						0.019 - k * 0.002
					),
					1
				)
			);
		}
	return out;
}
function sailboat( i ) {
	const tilt = ( i - 2 ) * 0.026;
	const out = [
		ink(
			[
				[ -0.4, 0.17 ],
				[ 0.4, 0.17 ],
				[ 0.27, 0.32 ],
				[ -0.25, 0.32 ],
				[ -0.4, 0.17 ],
			],
			0,
			0.024,
			true
		),
		ink(
			[
				[ 0.01, 0.17 ],
				[ 0.01 + tilt, -0.44 ],
			],
			0,
			0.019
		),
		ink(
			[
				[ -0.035 + tilt, -0.38 ],
				[ -0.035, 0.1 ],
				[ -0.32, 0.1 ],
				[ -0.035 + tilt, -0.38 ],
			],
			1,
			0.024,
			true
		),
		ink(
			[
				[ 0.06 + tilt, -0.34 ],
				[ 0.32, 0.11 ],
				[ 0.06, 0.11 ],
				[ 0.06 + tilt, -0.34 ],
			],
			2,
			0.017,
			true
		),
	];
	for ( let j = 0; j < 2; j++ )
		out.push(
			ink(
				path(
					( t ) => [
						-0.46 + t * 0.92,
						0.4 + j * 0.065 + Math.sin( t * TAU * 2 + i ) * 0.017,
					],
					32
				),
				1,
				0.013
			)
		);
	return out;
}
function celestial( i ) {
	const out = [];
	if ( i % 2 === 0 ) {
		out.push(
			ink( ellipse( 0, 0, 0.22 ), 0, 0.024, true ),
			ink( ellipse( 0, 0, 0.17 ), 1, 0.011, true )
		);
		for ( let j = 0; j < 8 + i * 2; j++ ) {
			const a = ( j * TAU ) / ( 8 + i * 2 );
			out.push(
				ink(
					[
						[ Math.cos( a ) * 0.28, Math.sin( a ) * 0.28 ],
						[
							Math.cos( a ) * ( j % 2 ? 0.36 : 0.44 ),
							Math.sin( a ) * ( j % 2 ? 0.36 : 0.44 ),
						],
					],
					1,
					0.018
				)
			);
		}
	} else {
		out.push(
			ink(
				curve(
					[ 0.2, -0.37 ],
					[ -0.56, -0.42 ],
					[ -0.56, 0.42 ],
					[ 0.2, 0.37 ]
				).concat(
					curve(
						[ 0.2, 0.37 ],
						[ -0.25, 0.22 ],
						[ -0.25, -0.22 ],
						[ 0.2, -0.37 ]
					)
				),
				0,
				0.025,
				true
			)
		);
		for ( let j = 0; j < i + 1; j++ ) {
			const x = 0.18 + ( j % 2 ) * 0.18,
				y = -0.15 + j * 0.105;
			out.push(
				ink(
					[
						[ x - 0.044, y ],
						[ x + 0.044, y ],
					],
					1,
					0.015
				),
				ink(
					[
						[ x, y - 0.044 ],
						[ x, y + 0.044 ],
					],
					1,
					0.015
				)
			);
		}
	}
	return out;
}
function bow( i ) {
	const out = [ ink( ellipse( 0, 0, 0.065, 0.075 ), 0, 0.024, true ) ];
	for ( const side of [ -1, 1 ] ) {
		const loop = curve(
			[ side * 0.055, -0.03 ],
			[ side * 0.5, -0.42 + i * 0.025 ],
			[ side * 0.5, 0.27 ],
			[ side * 0.055, 0.035 ]
		);
		out.push(
			ink( loop, 0, 0.023, true ),
			ink(
				curve(
					[ side * 0.07, 0 ],
					[ side * 0.22, -0.04 ],
					[ side * 0.26, 0.03 ],
					[ side * 0.35, 0.04 ]
				),
				1,
				0.012
			),
			ink(
				[
					[ side * 0.04, 0.065 ],
					[ side * 0.08, 0.4 ],
					[ side * 0.15, 0.34 ],
					[ side * 0.24, 0.4 ],
					[ side * 0.13, 0.04 ],
				],
				1,
				0.017,
				true
			)
		);
	}
	return out;
}
function snowflake( i ) {
	const out = [
		ink(
			path(
				( t ) => [
					Math.cos( t * TAU ) * 0.09,
					Math.sin( t * TAU ) * 0.09,
				],
				6
			),
			1,
			0.015,
			true
		),
	];
	for ( let j = 0; j < 6; j++ ) {
		const a = ( j * TAU ) / 6;
		out.push(
			ink(
				transform(
					[
						[ 0.06, 0 ],
						[ 0.45, 0 ],
					],
					0,
					0,
					1,
					a
				),
				0,
				0.023
			)
		);
		for ( let k = 0; k < 2 + ( i % 2 ); k++ ) {
			const x = 0.18 + k * 0.085,
				w = 0.065 + ( i % 3 ) * 0.015;
			out.push(
				ink(
					transform(
						[
							[ x + 0.04, -w ],
							[ x, 0 ],
							[ x + 0.04, w ],
						],
						0,
						0,
						1,
						a
					),
					1,
					0.014
				)
			);
		}
		if ( i > 2 )
			out.push(
				solid(
					transform(
						[
							[ 0.38, 0 ],
							[ 0.44, -0.035 ],
							[ 0.49, 0 ],
							[ 0.44, 0.035 ],
						],
						0,
						0,
						1,
						a
					),
					2
				)
			);
	}
	return out;
}

export const COLLECTION_GLYPH_SETS = [
	[ 'ginkgo', 'Ginkgo leaves', ginkgo ],
	[ 'eucalyptus', 'Eucalyptus', eucalyptus ],
	[ 'olive', 'Olive branches', olive ],
	[ 'roses', 'Roses', rose ],
	[ 'tulips', 'Tulips', tulip ],
	[ 'succulents', 'Succulents', succulent ],
	[ 'orchard', 'Orchard fruit', orchard ],
	[ 'teaware', 'Teaware', teaware ],
	[ 'dragonflies', 'Dragonflies', dragonfly ],
	[ 'songbirds', 'Songbirds', bird ],
	[ 'fish', 'Fish', fish ],
	[ 'seastars', 'Sea stars', seastar ],
	[ 'sailboats', 'Sailboats', sailboat ],
	[ 'sunmoons', 'Suns and moons', celestial ],
	[ 'bows', 'Ribbon bows', bow ],
	[ 'snowflakes', 'Snowflakes', snowflake ],
].map( ( [ id, label, fn ] ) => ( {
	id,
	label,
	glyphs: Array.from( { length: 5 }, ( _, i ) => fn( i ) ),
} ) );
