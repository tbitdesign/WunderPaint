import {
	TAU,
	clamp,
	path,
	ellipse,
	line,
	fill,
	transform,
	leaf,
	petal,
	cubic,
} from './geometry.js';

/** Each builder emits the same vectors for Canvas and SVG. */
function context( P, colors ) {
	const k = Math.round( clamp( P.count, 2, 12 ) ),
		out = [];
	const color = ( n ) =>
		colors[
			( ( ( n + ( P.colorway || 0 ) ) % colors.length ) +
				colors.length ) %
				colors.length
		];
	const width = ( 0.018 + clamp( P.weight, 1, 100 ) * 0.00075 ) / k;
	const add = (
		pts,
		n = 0,
		solid = false,
		w = width,
		opacity = 1,
		closed = false
	) =>
		out.push( {
			points: pts.map( ( p ) => ( { x: p[ 0 ], y: p[ 1 ] } ) ),
			color: color( n ),
			fill: solid ? color( n ) : null,
			width: w,
			opacity: clamp( ( ( P.alpha ?? 100 ) / 100 ) * opacity, 0.01, 1 ),
			closed: solid || closed,
		} );
	const rect = ( x, y, w, h, n = 0, opacity = 1 ) =>
		add(
			[
				[ x, y ],
				[ x + w, y ],
				[ x + w, y + h ],
				[ x, y + h ],
			],
			n,
			true,
			0,
			opacity
		);
	const grid = ( fn, stagger = false ) => {
		for ( let y = 0; y < k; y++ )
			for ( let x = 0; x < k; x++ )
				fn(
					( x + 0.5 + ( stagger && y % 2 ? 0.5 : 0 ) ) / k,
					( y + 0.5 ) / k,
					x,
					y
				);
	};
	const glyph = ( primitives, x, y, n = 0, scale = 0.9 / k, rotation = 0 ) =>
		primitives.forEach( ( p ) =>
			add(
				transform( p.pts, x, y, scale, rotation ),
				n + ( p.tone || 0 ),
				p.fill,
				( p.w || 0.025 ) * scale * ( 0.55 + P.weight / 100 ),
				1,
				p.closed
			)
		);
	return { k, out, width, add, rect, grid, glyph };
}

const paisleyGlyph = ( detail = 5 ) => {
	const edge = cubic(
		[ 0.08, -0.46 ],
		[ 0.63, -0.15 ],
		[ 0.34, 0.54 ],
		[ -0.12, 0.35 ]
	).concat(
		cubic(
			[ -0.12, 0.35 ],
			[ -0.58, 0.13 ],
			[ -0.16, -0.27 ],
			[ 0.08, -0.46 ]
		)
	);
	const g = [
		line( edge, 0.027, true ),
		line( transform( edge, 0, 0.03, 0.78 ), 0.015, true ),
		line( ellipse( -0.06, 0.08, 0.14 ), 0.02, true ),
	];
	for ( let j = 0; j < detail + 6; j++ ) {
		const a = ( j / ( detail + 6 ) ) * TAU;
		g.push(
			line(
				leaf(
					-0.06 + Math.cos( a ) * 0.15,
					0.08 + Math.sin( a ) * 0.15,
					0.14,
					a,
					0.16
				),
				0.012,
				true
			)
		);
	}
	return g;
};
const damaskGlyph = () => {
	const g = [
		line(
			[
				[ 0, -0.44 ],
				[ 0, 0.44 ],
			],
			0.022
		),
		line( leaf( 0, -0.26, 0.3, Math.PI / 2 ), 0.019, true ),
	];
	for ( const s of [ -1, 1 ] ) {
		g.push(
			line(
				cubic(
					[ 0, 0.42 ],
					[ s * 0.48, 0.02 ],
					[ s * 0.33, -0.33 ],
					[ s * 0.13, -0.09 ]
				),
				0.025
			),
			line(
				cubic(
					[ 0, 0.13 ],
					[ s * 0.31, 0.24 ],
					[ s * 0.51, -0.08 ],
					[ s * 0.25, -0.17 ]
				),
				0.017
			)
		);
		for ( let i = 0; i < 3; i++ )
			g.push(
				fill(
					leaf(
						s * ( 0.12 + i * 0.09 ),
						0.16 - i * 0.16,
						0.25 - i * 0.025,
						s * -0.7,
						0.18
					)
				)
			);
	}
	return g;
};

function ornamental( P, colors, kind ) {
	const c = context( P, colors ),
		{ k, grid, glyph, add, width } = c;
	const size = 0.58 + ( P.size / 100 ) * 0.46;
	grid( ( x, y, i, j ) => {
		const n = i + j,
			detail = 3 + Math.round( P.variety / 20 );
		if ( kind === 'paisley' )
			glyph(
				paisleyGlyph( detail ),
				x,
				y,
				n,
				size / k,
				( ( i + j ) % 2 ? 1 : -1 ) * 0.42
			);
		if ( kind === 'damask' ) glyph( damaskGlyph(), x, y, j, size / k );
		if ( kind === 'rosettes' || kind === 'medallions' ) {
			for ( let r = 1; r <= ( kind === 'medallions' ? 4 : 2 ); r++ )
				add(
					transform(
						petal(
							4 + detail,
							( 0.09 + r * 0.075 ) * size,
							kind === 'rosettes' ? 0.34 : 0.12,
							( r % 2 ) * Math.PI
						),
						x,
						y,
						1 / k
					),
					n + r,
					false,
					width * ( r === 1 ? 1 : 0.6 ),
					1,
					true
				);
			add( ellipse( x, y, 0.037 / k ), n, true );
		}
		if ( kind === 'lotus' ) {
			for ( let r = 0; r < 2; r++ )
				for ( let a = 0; a < 7; a++ )
					glyph(
						[
							line(
								leaf(
									0,
									-0.16,
									0.55 - r * 0.16,
									Math.PI / 2,
									0.17
								),
								0.018,
								true
							),
						],
						x,
						y,
						n + r,
						size / k,
						( a / 7 ) * TAU + r * 0.22
					);
		}
		if ( kind === 'lace' ) {
			add( ellipse( x, y, 0.3 / k ), j, false, width * 0.65 );
			for ( let a = 0; a < 12; a++ ) {
				const t = ( a / 12 ) * TAU;
				add(
					ellipse(
						x + ( Math.cos( t ) * 0.34 ) / k,
						y + ( Math.sin( t ) * 0.34 ) / k,
						0.085 / k
					),
					j,
					false,
					width * 0.5
				);
			}
			add(
				transform( petal( 6, 0.23, 0.65 ), x, y, 1 / k ),
				j + 1,
				false,
				width * 0.55,
				1,
				true
			);
		}
		if ( kind === 'decofans' || kind === 'fans' ) {
			const rings = kind === 'decofans' ? 3 : 5;
			for ( let r = 0; r < rings; r++ )
				add(
					ellipse(
						x,
						y + 0.4 / k,
						( 0.2 + r * 0.13 ) / k,
						( 0.2 + r * 0.13 ) / k,
						Math.PI,
						TAU
					),
					j + r,
					false,
					width * ( kind === 'fans' ? 0.6 : 0.85 )
				);
			if ( kind === 'decofans' )
				for ( let a = 0; a <= detail + 4; a++ ) {
					const t = Math.PI + ( a / ( detail + 4 ) ) * Math.PI;
					add(
						[
							[
								x + ( Math.cos( t ) * 0.16 ) / k,
								y + 0.4 / k + ( Math.sin( t ) * 0.16 ) / k,
							],
							[
								x + ( Math.cos( t ) * 0.46 ) / k,
								y + 0.4 / k + ( Math.sin( t ) * 0.46 ) / k,
							],
						],
						j,
						false,
						width * 0.5
					);
				}
		}
		if ( kind === 'petalnet' )
			for ( let a = 0; a < 4; a++ )
				glyph(
					[ line( leaf( 0.25, 0, 0.5, 0, 0.22 ), 0.022, true ) ],
					x,
					y,
					n,
					1 / k,
					( a * Math.PI ) / 2
				);
	}, [ 'paisley', 'damask', 'decofans', 'fans', 'lace' ].includes( kind ) );
	return c.out;
}

function textile( P, colors, kind ) {
	const c = context( P, colors ),
		{ k, add, rect, width } = c;
	const gap = ( 0.03 + ( 100 - P.size ) / 900 ) / k;
	if ( kind === 'houndstooth' ) {
		// A two-over/two-under twill with four dark and four light threads.
		// Joining adjacent dark threads into runs avoids overlapping tooth stamps.
		const n = k * 8;
		for ( let y = 0; y < n; y++ ) {
			let start = -1;
			for ( let x = 0; x <= n; x++ ) {
				const dark =
					x < n &&
					( ( ( ( x - y ) % 4 ) + 4 ) % 4 < 2
						? x % 8 < 4
						: y % 8 < 4 );
				if ( dark && start < 0 ) start = x;
				if ( ! dark && start >= 0 ) {
					rect( start / n, y / n, ( x - start ) / n, 1 / n, 0 );
					start = -1;
				}
			}
		}
	} else if ( kind === 'herringbone' ) {
		const n = 4 * Math.max( 1, Math.round( k / 3 ) );
		for ( let y = 0; y < n; y++ )
			for ( let x = 0; x < n; x++ ) {
				const a = ( x + y ) % 4;
				if ( a !== 0 && a !== 2 ) continue;
				rect(
					x / n + gap / 3,
					y / n + gap / 3,
					( a === 0 ? 2 : 1 ) / n - ( gap * 2 ) / 3,
					( a === 0 ? 1 : 2 ) / n - ( gap * 2 ) / 3,
					( x + 2 * y ) % 3
				);
			}
	} else if ( kind === 'tartan' ) {
		for ( let j = 0; j < k; j++ ) {
			const u = j / k;
			rect( u, 0, 0.48 / k, 1, j, 0.68 );
			rect( 0, u, 1, 0.48 / k, j, 0.68 );
			for ( const d of [ 0.08, 0.37, 0.67, 0.81 ] ) {
				rect( u + d / k, 0, width * 0.65, 1, j + 2, 0.85 );
				rect( 0, u + d / k, 1, width * 0.65, j + 2, 0.85 );
			}
		}
	} else if ( kind === 'twill' ) {
		const n = Math.ceil( k / 4 ) * 4;
		for ( let j = 0; j < n; j++ )
			for ( let i = 0; i < n; i++ ) {
				const horizontal = ( i + j ) % 4 < 3;
				rect(
					i / n + ( horizontal ? 0 : gap ),
					j / n + ( horizontal ? gap : 0 ),
					1 / n - ( horizontal ? 0 : gap * 2 ),
					1 / n - ( horizontal ? gap * 2 : 0 ),
					horizontal ? 0 : 1
				);
			}
	} else if ( kind === 'argyle' ) {
		c.grid( ( x, y, i, j ) => {
			add(
				[
					[ x, y - 0.5 / k ],
					[ x + 0.5 / k, y ],
					[ x, y + 0.5 / k ],
					[ x - 0.5 / k, y ],
				],
				i + j,
				true
			);
			add(
				[
					[ x - 0.5 / k, y - 0.5 / k ],
					[ x + 0.5 / k, y + 0.5 / k ],
				],
				2,
				false,
				width * 0.4
			);
			add(
				[
					[ x + 0.5 / k, y - 0.5 / k ],
					[ x - 0.5 / k, y + 0.5 / k ],
				],
				2,
				false,
				width * 0.4
			);
		} );
	} else if ( kind === 'knit' ) {
		c.grid( ( x, y, i ) => {
			for ( const side of [ -1, 1 ] )
				for ( let t = 0; t < 3; t++ )
					add(
						transform(
							cubic(
								[ side * ( 0.32 - t * 0.032 ), -0.54 ],
								[ side * ( 0.43 - t * 0.032 ), -0.02 ],
								[ side * ( 0.1 - t * 0.016 ), 0.3 ],
								[ side * ( -0.035 + t * 0.015 ), 0.48 ]
							),
							x,
							y,
							1 / k
						),
						i,
						false,
						width * 0.5
					);
		} );
	} else if ( kind === 'stitches' ) {
		c.grid( ( x, y, i, j ) => {
			const s = ( 0.14 + P.size / 500 ) / k;
			add(
				[
					[ x - s, y - s ],
					[ x + s, y + s ],
				],
				i + j,
				false,
				width * 1.6
			);
			add(
				[
					[ x + s, y - s ],
					[ x - s, y + s ],
				],
				i + j + 1,
				false,
				width * 1.6
			);
			for ( const dx of [ -s, s ] )
				for ( const dy of [ -s, s ] )
					add(
						ellipse( x + dx, y + dy, width * 0.8 ),
						2,
						false,
						width * 0.3
					);
		} );
	}
	return c.out;
}

/** Periodic fields use integer frequencies so positions AND tangents join. */
function flowing( P, colors, kind ) {
	const c = context( P, colors ),
		{ k, add, width } = c;
	const amp = P.amp / 100,
		freq = Math.round( clamp( P.freqI, 1, 6 ) ),
		phase = ( P.phase / 100 ) * TAU;
	if (
		[ 'bentgrid', 'contours', 'reed', 'guilloche', 'ribbons' ].includes(
			kind
		)
	) {
		const count =
			k * ( kind === 'contours' || kind === 'guilloche' ? 3 : 1 );
		for ( let j = 0; j < count; j++ ) {
			const y = j / count;
			const wave = ( x, o = 0 ) =>
				y +
				o +
				Math.sin(
					TAU * freq * x +
						phase +
						( kind === 'guilloche' ? ( j * TAU ) / count : 0 )
				) *
					amp *
					( kind === 'guilloche' ? 0.2 : 0.1 ) +
				( kind === 'contours'
					? Math.sin( TAU * ( x + y ) * 2 ) * amp * 0.06
					: 0 );
			add(
				path( ( x ) => [ x, wave( x ) ], 160 ),
				j,
				false,
				width * ( kind === 'contours' ? 0.38 : 0.65 )
			);
			if ( kind === 'ribbons' )
				add(
					path( ( x ) => [ x, wave( x ) ], 160 ).concat(
						path( ( t ) => [ 1 - t, wave( 1 - t, 0.28 / k ) ], 160 )
					),
					j,
					true
				);
			if ( kind === 'bentgrid' )
				add(
					path(
						( t ) => [
							y + Math.sin( TAU * freq * t + phase ) * amp * 0.1,
							t,
						],
						160
					),
					j + 1,
					false,
					width * 0.65
				);
			if ( kind === 'reed' ) {
				c.out.pop();
				add(
					path(
						( t ) => [
							y +
								Math.sin( TAU * freq * t + phase + j * 0.2 ) *
									amp *
									0.055,
							t,
						],
						160
					),
					j,
					false,
					width * 1.3
				);
			}
		}
	} else if ( kind === 'braid' || kind === 'weaveline' ) {
		for ( let j = 0; j < k; j++ )
			for ( let strand = 0; strand < 3; strand++ )
				for ( let seg = 0; seg < freq * 2; seg++ ) {
					// Deliberate gaps at crossings keep the under strand visible on alpha.
					const start =
							( seg + ( strand === seg % 3 ? 0.12 : 0 ) ) /
							( freq * 2 ),
						end =
							( seg + 1 - ( strand === seg % 3 ? 0.12 : 0 ) ) /
							( freq * 2 );
					const points = path( ( t ) => {
						const x = start + t * ( end - start ),
							y =
								( j +
									0.5 +
									Math.sin(
										x * TAU * freq +
											( strand * TAU ) / 3 +
											phase
									) *
										0.36 *
										( 0.3 + amp ) ) /
								k;
						return kind === 'weaveline' ? [ y, x ] : [ x, y ];
					}, 40 );
					add(
						points,
						strand,
						false,
						width * ( kind === 'braid' ? 1.2 : 0.65 )
					);
				}
	}
	return c.out;
}

function architectural( P, colors, kind ) {
	const c = context( P, colors ),
		{ k, add, grid, width } = c;
	grid( ( x, y, i, j ) => {
		if ( kind === 'meander' )
			add(
				transform(
					[
						[ -0.5, 0.4 ],
						[ 0.3, 0.4 ],
						[ 0.3, -0.3 ],
						[ -0.2, -0.3 ],
						[ -0.2, 0.12 ],
						[ 0.08, 0.12 ],
						[ 0.08, -0.06 ],
					],
					x,
					y,
					1 / k
				),
				j,
				false,
				width * 1.25
			);
		if ( kind === 'maze' ) {
			const dir = ( i * 31 + j * 17 + ( P.seed || 1 ) ) % 13 < 6;
			const a = dir
				? [
						[ -0.5, 0 ],
						[ -0.2, 0 ],
						[ -0.2, 0.2 ],
						[ 0, 0.2 ],
						[ 0, 0.5 ],
				  ]
				: [
						[ -0.5, 0 ],
						[ -0.2, 0 ],
						[ -0.2, -0.2 ],
						[ 0, -0.2 ],
						[ 0, -0.5 ],
				  ];
			add( transform( a, x, y, 1 / k ), 0, false, width * 1.4 );
			add( transform( a, x, y, 1 / k, Math.PI ), 0, false, width * 1.4 );
		}
		if ( kind === 'knotwork' )
			for ( let n = 0; n < 4; n++ )
				add(
					transform(
						ellipse(
							0,
							-0.23,
							0.29,
							0.29,
							Math.PI * 0.1,
							Math.PI * 1.86,
							48
						),
						x,
						y,
						1 / k,
						( n * Math.PI ) / 2
					),
					( i + j ) % 2,
					false,
					width
				);
	} );
	return c.out;
}

const definitions = [
	[ 'paisley', 'Paisley', 'Ornaments', ornamental ],
	[ 'damask', 'Damask', 'Ornaments', ornamental ],
	[ 'rosettes', 'Rosettes', 'Ornaments', ornamental ],
	[ 'decofans', 'Deco fans', 'Ornaments', ornamental ],
	[ 'knotwork', 'Knotwork', 'Ornaments', architectural ],
	[ 'meander', 'Meander', 'Ornaments', architectural ],
	[ 'houndstooth', 'Houndstooth', 'Textiles', textile ],
	[ 'tartan', 'Tartan', 'Textiles', textile ],
	[ 'herringbone', 'Herringbone weave', 'Textiles', textile ],
	[ 'twill', 'Twill', 'Textiles', textile ],
	[ 'knit', 'Knit', 'Textiles', textile ],
	[ 'argyle', 'Argyle', 'Textiles', textile ],
	[ 'guilloche', 'Guilloche', 'Lines', flowing ],
	[ 'braid', 'Braided waves', 'Lines', flowing ],
	[ 'bentgrid', 'Bent grid', 'Lines', flowing ],
	[ 'contours', 'Contour lines', 'Lines', flowing ],
	[ 'ribbons', 'Ribbons', 'Lines', flowing ],
	[ 'maze', 'Angular paths', 'Lines', architectural ],
	[ 'fans', 'Concentric fans', 'Ornaments', ornamental ],
	[ 'medallions', 'Medallions', 'Ornaments', ornamental ],
	[ 'lotus', 'Lotus', 'Ornaments', ornamental ],
	[ 'petalnet', 'Petal net', 'Ornaments', ornamental ],
	[ 'stitches', 'Cross stitches', 'Textiles', textile ],
	[ 'lace', 'Lace', 'Ornaments', ornamental ],
	[ 'reed', 'Reeds', 'Lines', flowing ],
	[ 'weaveline', 'Woven lines', 'Lines', flowing ],
];
export const EXTRA_MOTIFS = definitions.map(
	( [ id, label, category, fn ] ) => ( {
		id,
		label,
		category,
		fn: ( P, colors ) => fn( P, colors, id ),
	} )
);
