/**
 * Drawing Templates 3.1: eight more motif categories, drawn in the same
 * hand as the first eight - flat pastel shapes with an ink outline on a
 * 600-unit square, built in four stages (big shapes, secondary shapes,
 * features, details) so every motif also works as a step-by-step guide.
 *
 * The motif path reader knows M, L, H, V, Q, C and Z only, so circles and
 * arcs here are cubic curves or sampled points.
 */
export const MORE_GROUPS = [
	[
		'Farm animals',
		'cow:Cow pig:Pig sheep:Sheep hen:Hen chick:Chick horse:Horse goat:Goat donkey:Donkey goose:Goose',
	],
	[
		'Safari',
		'lion:Lion elephant:Elephant giraffe:Giraffe zebra:Zebra hippo:Hippo monkey:Monkey rhino:Rhino crocodile:Crocodile parrot:Parrot',
	],
	[
		'Pets',
		'dog:Dog cat:Cat hamster:Hamster mouse:Mouse guineapig:Guinea_pig goldfish:Goldfish budgie:Budgie tortoise:Tortoise snail:Snail',
	],
	[
		'Dinosaurs',
		'trex:T._rex brachiosaurus:Brachiosaurus stegosaurus:Stegosaurus triceratops:Triceratops pterodactyl:Pterodactyl ankylosaurus:Ankylosaurus dinoegg:Dinosaur_egg parasaurolophus:Parasaurolophus volcano:Volcano',
	],
	[
		'Treats',
		'cupcake:Cupcake icecream:Ice_cream donut:Donut pizza:Pizza_slice cookie:Cookie croissant:Croissant watermelon:Watermelon banana:Banana carrot:Carrot',
	],
	[
		'At home',
		'teapot:Teapot mug:Mug lamp:Table_lamp armchair:Armchair clock:Alarm_clock books:Stack_of_books plant:Potted_plant wateringcan:Watering_can teddy:Teddy_bear',
	],
	[
		'Space',
		'planet:Ringed_planet moon:Crescent_moon star:Star sun:Sun comet:Comet astronaut:Astronaut ufo:Flying_saucer telescope:Telescope satellite:Satellite',
	],
	[
		'Music and play',
		'guitar:Guitar drum:Drum trumpet:Trumpet violin:Violin xylophone:Xylophone beachball:Beach_ball robot:Toy_robot top:Spinning_top rockinghorse:Rocking_horse',
	],
];

export const MORE_IDS = new Set(
	MORE_GROUPS.flatMap( ( [ , list ] ) =>
		list.split( ' ' ).map( ( entry ) => entry.split( ':' )[ 0 ] )
	)
);

const PINK = '#e8b8ae',
	WHITE = '#f4f2ea',
	GRAY = '#b8bfc3',
	DARK = '#5f6b72',
	WOOD = '#9b7a5e',
	PURPLE = '#c4b2d6',
	SKY = '#d6e8ee';

const n2 = ( v ) => Math.round( v * 10 ) / 10;

/** A polygon through points as path data. */
const poly = ( pts ) =>
	'M ' +
	pts.map( ( [ x, y ] ) => `${ n2( x ) } ${ n2( y ) }` ).join( ' L ' ) +
	' Z';

/** Points on an ellipse (rotated by `a`), from angle t0 to t1. */
const arc = ( cx, cy, rx, ry, t0, t1, steps = 24, a = 0 ) =>
	Array.from( { length: steps + 1 }, ( _, i ) => {
		const t = t0 + ( ( t1 - t0 ) * i ) / steps;
		const x = Math.cos( t ) * rx;
		const y = Math.sin( t ) * ry;
		return [
			cx + x * Math.cos( a ) - y * Math.sin( a ),
			cy + x * Math.sin( a ) + y * Math.cos( a ),
		];
	} );

/** A cloud-like outline: bumps around an ellipse. */
const bumpy = ( cx, cy, rx, ry, count, amp ) => {
	let d = '';
	for ( let i = 0; i < count; i++ ) {
		const a0 = ( i / count ) * Math.PI * 2;
		const a1 = ( ( i + 1 ) / count ) * Math.PI * 2;
		const am = ( a0 + a1 ) / 2;
		const p0 = [ cx + Math.cos( a0 ) * rx, cy + Math.sin( a0 ) * ry ];
		const p1 = [ cx + Math.cos( a1 ) * rx, cy + Math.sin( a1 ) * ry ];
		const c = [
			cx + Math.cos( am ) * ( rx + amp * 2 ),
			cy + Math.sin( am ) * ( ry + amp * 2 ),
		];
		d +=
			( i ? '' : `M ${ n2( p0[ 0 ] ) } ${ n2( p0[ 1 ] ) } ` ) +
			`Q ${ n2( c[ 0 ] ) } ${ n2( c[ 1 ] ) } ${ n2( p1[ 0 ] ) } ${ n2(
				p1[ 1 ]
			) } `;
	}
	return d + 'Z';
};

/** A star with `n` points as a polygon. */
const starPts = ( cx, cy, r1, r2, n = 5, rot = -Math.PI / 2 ) =>
	Array.from( { length: n * 2 }, ( _, i ) => {
		const r = i % 2 ? r2 : r1;
		const a = rot + ( i * Math.PI ) / n;
		return [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r ];
	} );

/**
 * Parts of one of the new motifs.
 *
 * @param {string} id  Motif id from MORE_GROUPS.
 * @param {Object} kit The drawing helpers and palette of motifs.js.
 */
export function moreParts( id, kit ) {
	const { p, e, r, eye, leaf, INK, CREAM, GREEN, BLUE, CORAL, GOLD } = kit;

	/** A sitting animal seen from the front, the woodland family's pose. */
	const sitter = ( color, o = {} ) => {
		if ( o.tail ) {
			o.tail();
		}
		e( 300, 372, o.bodyW || 102, o.bodyH || 118, color, 1 );
		e( 254, 478, 46, 21, o.feet || color, 2 );
		e( 346, 478, 46, 21, o.feet || color, 2 );
		if ( false !== o.belly ) {
			e( 300, 398, 62, 70, o.belly || CREAM, 3 );
		}
		if ( o.ears ) {
			o.ears();
		}
		e(
			300,
			o.headY || 250,
			o.headW || 96,
			o.headH || 82,
			o.head || color,
			2
		);
		if ( o.face ) {
			o.face();
		}
		if ( false !== o.eyes ) {
			eye( 262, ( o.headY || 250 ) - 8 );
			eye( 338, ( o.headY || 250 ) - 8 );
		}
		if ( o.nose ) {
			o.nose();
		} else if ( false !== o.nose ) {
			e( 300, ( o.headY || 250 ) + 32, 10, 7, INK, 4 );
			p(
				`M 300 ${ ( o.headY || 250 ) + 38 } v 12 q -15 15 -28 0 M 300 ${
					( o.headY || 250 ) + 50
				} q 15 15 28 0`,
				null,
				4
			);
		}
		p( 'M 228 350 Q 244 374 252 408 M 372 350 Q 356 374 348 408', null, 4 );
		if ( o.extra ) {
			o.extra();
		}
	};
	const pointyEars = ( color, inner = PINK, y = 0 ) => {
		p(
			`M 216 ${ 215 + y } L 222 ${ 142 + y } L 280 ${ 182 + y } Z`,
			color,
			2
		);
		p(
			`M 384 ${ 215 + y } L 378 ${ 142 + y } L 320 ${ 182 + y } Z`,
			color,
			2
		);
		if ( inner ) {
			p(
				`M 230 ${ 200 + y } L 233 ${ 162 + y } L 262 ${ 184 + y } Z`,
				inner,
				3
			);
			p(
				`M 370 ${ 200 + y } L 367 ${ 162 + y } L 338 ${ 184 + y } Z`,
				inner,
				3
			);
		}
	};
	const roundEars = ( color, inner, rad = 38, y = 188 ) => {
		e( 222, y, rad, rad, color, 2 );
		e( 378, y, rad, rad, color, 2 );
		if ( inner ) {
			e( 222, y, rad * 0.55, rad * 0.55, inner, 3 );
			e( 378, y, rad * 0.55, rad * 0.55, inner, 3 );
		}
	};
	const sideEars = ( color, inner ) => {
		e( 196, 228, 44, 19, color, 2, -0.35 );
		e( 404, 228, 44, 19, color, 2, 0.35 );
		if ( inner ) {
			e( 200, 228, 26, 9, inner, 3, -0.35 );
			e( 400, 228, 26, 9, inner, 3, 0.35 );
		}
	};
	const nostrils = ( y, dx = 18, rad = 6 ) => {
		eye( 300 - dx, y, rad );
		eye( 300 + dx, y, rad );
	};
	/** A standing bird from the front, as the owl and sparrow stand. */
	const bird = ( color, o = {} ) => {
		if ( o.tail ) {
			o.tail();
		}
		e( 300, 345, o.bodyW || 118, o.bodyH || 132, color, 1 );
		if ( o.neck ) {
			o.neck();
		}
		e(
			300,
			o.headY || 222,
			o.headW || 92,
			o.headH || 88,
			o.head || color,
			2
		);
		if ( false !== o.belly ) {
			e( 300, 368, 78, 96, o.belly || CREAM, 3 );
		}
		if ( o.face ) {
			o.face();
		}
		eye( 266, ( o.headY || 222 ) - 4, 8 );
		eye( 334, ( o.headY || 222 ) - 4, 8 );
		if ( o.beak ) {
			o.beak();
		} else {
			p(
				`M 284 ${ ( o.headY || 222 ) + 22 } L 316 ${
					( o.headY || 222 ) + 22
				} L 300 ${ ( o.headY || 222 ) + 46 } Z`,
				GOLD,
				3
			);
		}
		p( 'M 186 300 Q 200 370 236 404 M 414 300 Q 400 370 364 404', null, 3 );
		p(
			'M 262 476 l -17 26 M 262 476 v 28 M 262 476 l 18 25 M 338 476 l -17 26 M 338 476 v 28 M 338 476 l 18 25',
			null,
			4
		);
		if ( o.extra ) {
			o.extra();
		}
	};
	/** Four pillar legs under a side-view body. */
	const legs = ( xs, y, w, h, color, step = 2 ) => {
		for ( const x of xs ) {
			r( x, y, w, h, color, step );
		}
	};

	switch ( id ) {
		/* ------------------------------- farm ------------------------------- */
		case 'cow':
			sitter( WHITE, {
				belly: false,
				ears: () => {
					p(
						'M 246 196 Q 222 158 240 132 Q 252 162 268 184 Z',
						CREAM,
						2
					);
					p(
						'M 354 196 Q 378 158 360 132 Q 348 162 332 184 Z',
						CREAM,
						2
					);
					sideEars( WHITE, PINK );
				},
				face: () => {
					e( 300, 292, 60, 40, PINK, 3 );
					e( 334, 214, 26, 20, DARK, 3, 0.4 );
					e( 248, 352, 34, 26, DARK, 3, 0.3 );
					e( 352, 430, 30, 20, DARK, 3, -0.2 );
				},
				nose: () => {
					nostrils( 292, 20, 7 );
					p( 'M 280 314 Q 300 324 320 314', null, 4 );
				},
			} );
			break;
		case 'pig':
			sitter( '#efc4bb', {
				belly: '#f6d9d2',
				tail: () =>
					p(
						'M 392 430 Q 440 432 436 404 Q 432 384 414 394 Q 400 408 420 418',
						null,
						2
					),
				ears: () => {
					p( 'M 224 206 L 206 150 L 266 180 Z', '#e6a99f', 2 );
					p( 'M 376 206 L 394 150 L 334 180 Z', '#e6a99f', 2 );
				},
				face: () => e( 300, 284, 42, 29, '#e3a79c', 3 ),
				nose: () => {
					nostrils( 284, 12, 6 );
					p( 'M 284 316 Q 300 326 316 316', null, 4 );
				},
			} );
			break;
		case 'sheep':
			p( bumpy( 300, 372, 112, 118, 16, 9 ), WHITE, 1 );
			e( 254, 478, 36, 18, DARK, 2 );
			e( 346, 478, 36, 18, DARK, 2 );
			e( 228, 246, 34, 14, DARK, 2, -0.35 );
			e( 372, 246, 34, 14, DARK, 2, 0.35 );
			e( 300, 262, 62, 74, DARK, 2 );
			p( bumpy( 300, 196, 58, 30, 8, 6 ), WHITE, 3 );
			e( 276, 256, 8, 8, '#ffffff', 4 );
			e( 324, 256, 8, 8, '#ffffff', 4 );
			p( 'M 286 300 Q 300 312 314 300', null, 4 );
			for ( const [ x, y ] of [
				[ 240, 360 ],
				[ 352, 330 ],
				[ 300, 420 ],
				[ 236, 432 ],
				[ 360, 418 ],
			] ) {
				p( `M ${ x - 14 } ${ y } q 14 -16 28 0`, null, 4 );
			}
			break;
		case 'hen':
			bird( '#e6d2b4', {
				belly: '#f2e7d4',
				tail: () =>
					p(
						'M 378 330 Q 470 250 480 320 Q 470 380 400 400 Z',
						'#c9a983',
						1
					),
				neck: () =>
					p(
						'M 262 128 Q 270 92 290 118 Q 300 84 312 118 Q 332 92 338 130 Z',
						CORAL,
						2
					),
				face: () => e( 300, 270, 11, 18, CORAL, 3 ),
			} );
			break;
		case 'chick':
			bird( GOLD, {
				bodyW: 128,
				bodyH: 120,
				headY: 220,
				headW: 84,
				headH: 80,
				belly: '#f2d79c',
				neck: () =>
					p(
						'M 294 142 q 4 -32 22 -22 M 300 142 q -12 -28 -26 -14',
						null,
						2
					),
				extra: () => {
					e( 248, 248, 14, 9, PINK, 4 );
					e( 352, 248, 14, 9, PINK, 4 );
				},
			} );
			break;
		case 'horse':
			sitter( '#c9a27c', {
				headY: 236,
				headW: 66,
				headH: 104,
				ears: () => {
					p( 'M 252 164 L 244 108 L 284 148 Z', '#c9a27c', 2 );
					p( 'M 348 164 L 356 108 L 316 148 Z', '#c9a27c', 2 );
				},
				face: () => {
					e( 300, 306, 50, 38, '#e2c9ad', 3 );
					p(
						'M 258 156 Q 300 112 342 156 Q 320 146 300 176 Q 280 146 258 156 Z',
						WOOD,
						3
					);
				},
				nose: () => {
					nostrils( 308, 18, 6 );
					p( 'M 286 328 Q 300 336 314 328', null, 4 );
				},
				extra: () => p( 'M 300 176 v 30', null, 4 ),
			} );
			break;
		case 'goat':
			sitter( '#e2dfd6', {
				headW: 74,
				headH: 92,
				ears: () => {
					p(
						'M 262 186 Q 230 120 196 140 Q 232 140 246 200 Z',
						GRAY,
						2
					);
					p(
						'M 338 186 Q 370 120 404 140 Q 368 140 354 200 Z',
						GRAY,
						2
					);
					sideEars( '#e2dfd6', PINK );
				},
				face: () => {
					e( 300, 300, 40, 30, PINK, 3 );
					p( 'M 286 330 L 300 378 L 314 330 Z', CREAM, 3 );
				},
				nose: () => nostrils( 298, 12, 5 ),
			} );
			break;
		case 'donkey':
			sitter( '#a9aaa3', {
				ears: () => {
					e( 250, 150, 24, 74, '#a9aaa3', 2, -0.25 );
					e( 350, 150, 24, 74, '#a9aaa3', 2, 0.25 );
					e( 250, 154, 11, 52, PINK, 3, -0.25 );
					e( 350, 154, 11, 52, PINK, 3, 0.25 );
				},
				face: () => {
					e( 300, 298, 54, 38, CREAM, 3 );
					p(
						'M 270 172 Q 300 150 330 172 Q 312 168 300 184 Q 288 168 270 172 Z',
						DARK,
						3
					);
				},
				nose: () => {
					nostrils( 296, 18, 6 );
					p( 'M 284 320 Q 300 328 316 320', null, 4 );
				},
			} );
			break;
		case 'goose':
			bird( WHITE, {
				headY: 150,
				headW: 64,
				headH: 60,
				belly: '#ffffff',
				neck: () => e( 300, 236, 34, 74, WHITE, 2 ),
				beak: () =>
					p(
						'M 278 170 Q 300 156 324 170 Q 300 204 278 170 Z',
						'#e8a160',
						3
					),
			} );
			break;

		/* ------------------------------ safari ------------------------------ */
		case 'lion':
			sitter( '#e2b66b', {
				tail: () => {
					p( 'M 392 432 Q 470 424 462 360', null, 2 );
					e( 462, 350, 15, 20, '#c98f4f', 3 );
				},
				ears: () => {
					p( bumpy( 300, 250, 132, 124, 14, 16 ), '#c98f4f', 2 );
					roundEars( '#e2b66b', PINK, 26, 178 );
				},
				face: () => e( 300, 290, 46, 32, CREAM, 3 ),
				nose: () => {
					p( 'M 286 274 H 314 L 300 290 Z', WOOD, 4 );
					p(
						'M 300 290 v 10 q -14 14 -26 0 M 300 300 q 14 14 26 0',
						null,
						4
					);
				},
			} );
			break;
		case 'elephant':
			sitter( '#b9c1c4', {
				belly: false,
				ears: () => {
					e( 190, 250, 82, 96, '#a7b0b5', 2, -0.2 );
					e( 410, 250, 82, 96, '#a7b0b5', 2, 0.2 );
					e( 196, 252, 48, 62, PINK, 3, -0.2 );
					e( 404, 252, 48, 62, PINK, 3, 0.2 );
				},
				headH: 88,
				nose: false,
				face: () => {
					p(
						'M 276 286 Q 268 360 292 404 Q 312 420 324 400 Q 304 366 324 286 Z',
						'#b9c1c4',
						3
					);
					p(
						'M 262 300 Q 248 334 270 344 M 338 300 Q 352 334 330 344',
						CREAM,
						3
					);
				},
				extra: () => {
					for ( const y of [ 318, 340, 362 ] ) {
						p( `M 286 ${ y } h 26`, null, 4 );
					}
				},
			} );
			break;
		case 'giraffe':
			e( 300, 412, 98, 82, GOLD, 1 );
			e( 254, 482, 40, 18, GOLD, 2 );
			e( 346, 482, 40, 18, GOLD, 2 );
			p( 'M 262 352 L 270 176 H 330 L 338 352 Z', GOLD, 2 );
			e( 240, 142, 26, 11, GOLD, 2, -0.3 );
			e( 360, 142, 26, 11, GOLD, 2, 0.3 );
			p( 'M 282 112 V 80 M 318 112 V 80', null, 2 );
			e( 300, 152, 64, 54, GOLD, 2 );
			e( 282, 76, 9, 9, WOOD, 3 );
			e( 318, 76, 9, 9, WOOD, 3 );
			e( 300, 178, 40, 26, CREAM, 3 );
			eye( 280, 142, 6 );
			eye( 320, 142, 6 );
			for ( const [ x, y, rx, ry ] of [
				[ 288, 222, 12, 16 ],
				[ 314, 262, 13, 15 ],
				[ 288, 306, 12, 14 ],
				[ 256, 404, 18, 14 ],
				[ 330, 386, 16, 18 ],
				[ 300, 444, 18, 12 ],
				[ 360, 436, 14, 12 ],
			] ) {
				e( x, y, rx, ry, '#c99050', 4 );
			}
			nostrils( 178, 10, 4 );
			break;
		case 'zebra':
			sitter( WHITE, {
				belly: false,
				headY: 236,
				headW: 66,
				headH: 102,
				ears: () => pointyEars( WHITE, PINK, -10 ),
				face: () => {
					e( 300, 306, 46, 34, DARK, 3 );
					p(
						'M 262 150 Q 300 118 338 150 L 330 166 Q 300 146 270 166 Z',
						DARK,
						3
					);
				},
				nose: () => {
					e( 288, 306, 5, 5, '#ffffff', 4 );
					e( 312, 306, 5, 5, '#ffffff', 4 );
				},
				extra: () => {
					for ( const y of [ 316, 350, 386, 420 ] ) {
						p(
							`M 204 ${ y } q 30 10 42 -6 M 396 ${ y } q -30 10 -42 -6`,
							null,
							4
						);
					}
					for ( const y of [ 186, 210 ] ) {
						p(
							`M 240 ${ y } q 18 8 28 0 M 360 ${ y } q -18 8 -28 0`,
							null,
							4
						);
					}
				},
			} );
			break;
		case 'hippo':
			sitter( '#b6a9c2', {
				belly: '#cdbfd6',
				headW: 118,
				headH: 88,
				ears: () => roundEars( '#b6a9c2', PINK, 20, 176 ),
				face: () => e( 300, 296, 96, 54, '#cdbfd6', 3 ),
				eyes: false,
				nose: () => {
					eye( 262, 214 );
					eye( 338, 214 );
					nostrils( 282, 34, 8 );
					r( 264, 330, 20, 16, '#ffffff', 4 );
					r( 316, 330, 20, 16, '#ffffff', 4 );
					p( 'M 236 322 Q 300 346 364 322', null, 4 );
				},
			} );
			break;
		case 'monkey':
			sitter( '#b08566', {
				tail: () =>
					p(
						'M 392 440 Q 486 430 474 356 Q 462 316 432 336',
						null,
						2
					),
				ears: () => roundEars( '#b08566', PINK, 36, 250 ),
				face: () => {
					e( 272, 238, 34, 36, '#e8cdb0', 3 );
					e( 328, 238, 34, 36, '#e8cdb0', 3 );
					e( 300, 290, 58, 40, '#e8cdb0', 3 );
				},
				nose: () => {
					nostrils( 278, 8, 4 );
					p( 'M 270 300 Q 300 322 330 300', null, 4 );
				},
			} );
			break;
		case 'rhino':
			sitter( '#a9b1b6', {
				belly: false,
				ears: () => pointyEars( '#a9b1b6', PINK, 0 ),
				face: () => {
					e( 300, 300, 62, 40, '#bcc4c8', 3 );
					p( 'M 282 276 Q 300 170 318 276 Z', CREAM, 3 );
					p( 'M 290 222 Q 300 186 310 222 Z', CREAM, 3 );
				},
				nose: () => {
					nostrils( 300, 26, 6 );
					p( 'M 284 322 Q 300 330 316 322', null, 4 );
				},
				extra: () =>
					p(
						'M 214 370 q 24 -10 40 6 M 386 370 q -24 -10 -40 6',
						null,
						4
					),
			} );
			break;
		case 'crocodile':
			legs( [ 186, 344 ], 370, 44, 62, '#7fa982', 2 );
			p(
				'M 520 330 Q 470 268 380 280 L 230 290 Q 170 296 132 282 L 70 300 Q 60 324 80 334 L 200 348 Q 270 408 420 396 Q 510 388 520 330 Z',
				'#93bb94',
				1
			);
			p( 'M 70 300 L 200 316 L 132 282', null, 2 );
			e( 236, 272, 24, 20, '#93bb94', 2 );
			e( 302, 342, 120, 30, '#cfe0b8', 3 );
			for ( let i = 0; i < 6; i++ ) {
				p( `M ${ 92 + i * 18 } 306 l 8 12 l 8 -12`, '#ffffff', 3 );
			}
			eye( 238, 268, 7 );
			for ( let i = 0; i < 7; i++ ) {
				p( `M ${ 270 + i * 34 } 286 l 12 -16 l 12 14`, null, 4 );
			}
			break;
		case 'parrot':
			bird( '#d6705e', {
				bodyW: 96,
				bodyH: 128,
				headW: 84,
				headH: 82,
				belly: false,
				tail: () =>
					p(
						'M 278 440 L 262 556 L 300 530 L 338 556 L 322 440 Z',
						BLUE,
						1
					),
				face: () => {
					e( 318, 214, 38, 34, '#f0eadb', 3 );
					p(
						'M 214 300 Q 196 392 262 452 Q 290 372 262 300 Z',
						BLUE,
						3
					);
					p(
						'M 386 300 Q 404 392 338 452 Q 310 372 338 300 Z',
						GOLD,
						3
					);
				},
				beak: () =>
					p(
						'M 296 228 Q 342 226 340 270 Q 322 250 300 254 Z',
						'#e9d8b0',
						3
					),
			} );
			break;

		/* ------------------------------- pets ------------------------------- */
		case 'dog':
			sitter( '#d2ae86', {
				ears: () => {
					e( 202, 268, 34, 70, WOOD, 2, 0.25 );
					e( 398, 268, 34, 70, WOOD, 2, -0.25 );
				},
				face: () => {
					e( 300, 290, 50, 36, CREAM, 3 );
					e( 262, 238, 24, 22, WOOD, 3 );
				},
				nose: () => {
					e( 300, 276, 15, 11, INK, 4 );
					p(
						'M 300 287 v 10 q -14 14 -26 0 M 300 297 q 14 14 26 0',
						null,
						4
					);
					e( 300, 318, 10, 13, PINK, 4 );
				},
				extra: () => {
					p( 'M 232 334 Q 300 362 368 334', null, 3 );
					e( 300, 356, 11, 11, GOLD, 4 );
				},
			} );
			break;
		case 'cat':
			sitter( '#bab5ad', {
				tail: () =>
					p(
						'M 380 470 Q 470 472 462 404 Q 456 362 428 372',
						null,
						2
					),
				ears: () => pointyEars( '#bab5ad', PINK, 0 ),
				face: () => e( 300, 284, 38, 26, CREAM, 3 ),
				nose: () => {
					p( 'M 290 274 H 310 L 300 284 Z', PINK, 4 );
					p(
						'M 300 284 v 8 q -12 12 -22 0 M 300 292 q 12 12 22 0 M 232 278 l -46 -8 M 232 290 l -44 6 M 368 278 l 46 -8 M 368 290 l 44 6',
						null,
						4
					);
				},
			} );
			break;
		case 'hamster':
			sitter( '#e9c48e', {
				bodyW: 130,
				bodyH: 120,
				belly: '#f6e6c8',
				headW: 108,
				headH: 88,
				ears: () => roundEars( '#e9c48e', PINK, 24, 176 ),
				face: () => {
					e( 236, 286, 34, 26, '#f6e6c8', 3 );
					e( 364, 286, 34, 26, '#f6e6c8', 3 );
				},
				nose: () => {
					e( 300, 276, 9, 6, PINK, 4 );
					p(
						'M 300 282 v 8 q -10 10 -18 0 M 300 290 q 10 10 18 0',
						null,
						4
					);
					e( 274, 336, 14, 10, PINK, 4 );
					e( 326, 336, 14, 10, PINK, 4 );
				},
			} );
			break;
		case 'mouse':
			sitter( '#c3c5c8', {
				bodyW: 92,
				bodyH: 108,
				headW: 80,
				headH: 70,
				headY: 262,
				tail: () =>
					p(
						'M 386 456 Q 486 476 474 404 Q 466 352 506 332',
						null,
						2
					),
				ears: () => roundEars( '#c3c5c8', PINK, 52, 196 ),
				nose: () => {
					e( 300, 292, 10, 8, PINK, 4 );
					p(
						'M 254 292 l -50 -8 M 254 302 l -48 6 M 346 292 l 50 -8 M 346 302 l 48 6',
						null,
						4
					);
				},
			} );
			break;
		case 'guineapig':
			e( 300, 386, 168, 104, '#d7a77a', 1 );
			e( 222, 482, 30, 14, PINK, 2 );
			e( 378, 482, 30, 14, PINK, 2 );
			e( 214, 236, 28, 18, PINK, 2, -0.4 );
			e( 386, 236, 28, 18, PINK, 2, 0.4 );
			e( 300, 292, 98, 82, '#d7a77a', 2 );
			e( 380, 404, 62, 48, '#f2e8da', 3 );
			p(
				'M 286 214 Q 300 206 314 214 L 326 330 Q 300 344 274 330 Z',
				'#f2e8da',
				3
			);
			eye( 258, 282 );
			eye( 342, 282 );
			e( 300, 312, 10, 7, PINK, 4 );
			p( 'M 300 318 v 8 q -12 12 -22 0 M 300 326 q 12 12 22 0', null, 4 );
			break;
		case 'goldfish':
			p(
				'M 228 168 Q 118 232 140 362 Q 166 484 300 488 Q 434 484 460 362 Q 482 232 372 168 Z',
				SKY,
				1
			);
			e( 300, 168, 78, 16, '#c2d9e1', 2 );
			p( 'M 150 262 Q 300 288 450 262', null, 2 );
			p( 'M 342 350 L 398 312 L 398 388 Z', CORAL, 3 );
			e( 286, 350, 64, 42, CORAL, 3 );
			eye( 256, 342, 6 );
			p( 'M 300 330 q 14 20 0 40', null, 4 );
			for ( const [ x, y, rr ] of [
				[ 224, 300, 8 ],
				[ 212, 268, 6 ],
				[ 236, 236, 5 ],
			] ) {
				e( x, y, rr, rr, '#ffffff', 4 );
			}
			p(
				'M 180 454 q 30 -26 60 0 q 30 -26 60 0 q 30 -26 60 0 q 30 -26 60 0',
				null,
				4
			);
			break;
		case 'budgie':
			bird( '#9ccc86', {
				bodyW: 98,
				bodyH: 126,
				head: '#ecd57a',
				headW: 82,
				headH: 78,
				belly: false,
				tail: () =>
					p(
						'M 284 440 L 288 560 L 312 560 L 316 440 Z',
						'#5b7fb5',
						1
					),
				face: () => {
					e( 256, 248, 11, 11, '#5b7fb5', 3 );
					e( 344, 248, 11, 11, '#5b7fb5', 3 );
				},
				beak: () =>
					p(
						'M 288 232 Q 312 228 314 252 Q 302 244 292 252 Z',
						'#e9c27a',
						3
					),
				extra: () => {
					for ( const y of [ 300, 336, 372 ] ) {
						p(
							`M 244 ${ y } q 14 12 28 0 M 328 ${ y } q 14 12 28 0`,
							null,
							4
						);
					}
				},
			} );
			break;
		case 'tortoise':
			e( 196, 410, 32, 34, '#a9bf8a', 2 );
			e( 404, 410, 32, 34, '#a9bf8a', 2 );
			e( 494, 334, 50, 40, '#a9bf8a', 2 );
			p( 'M 116 370 L 82 384 L 120 392 Z', '#a9bf8a', 2 );
			p(
				'M 136 372 Q 156 184 300 180 Q 444 184 464 372 Z',
				'#c8b27a',
				1
			);
			r( 124, 360, 352, 28, GREEN, 2 );
			p(
				'M 300 196 V 360 M 220 216 Q 250 290 220 360 M 380 216 Q 350 290 380 360 M 160 300 H 440',
				null,
				3
			);
			eye( 508, 322, 6 );
			p( 'M 488 350 q 14 10 30 0', null, 4 );
			for ( const [ x, y ] of [
				[ 260, 260 ],
				[ 340, 260 ],
				[ 260, 330 ],
				[ 340, 330 ],
			] ) {
				e( x, y, 14, 10, '#ad9762', 4 );
			}
			break;
		case 'snail': {
			p(
				'M 108 430 Q 92 360 148 340 Q 190 340 200 394 L 470 404 Q 504 428 470 446 L 138 446 Q 108 446 108 430 Z',
				'#cfd8b8',
				2
			);
			e( 330, 300, 124, 122, GOLD, 1 );
			let spiral = 'M 330 300';
			for ( let i = 1; i <= 60; i++ ) {
				const a = i * 0.28;
				const rad = i * 1.9;
				spiral += ` L ${ n2( 330 + Math.cos( a ) * rad ) } ${ n2(
					300 + Math.sin( a ) * rad
				) }`;
			}
			p( spiral, null, 3 );
			p( 'M 146 344 L 126 282 M 164 342 L 172 276', null, 3 );
			e( 126, 276, 9, 9, INK, 4 );
			e( 172, 270, 9, 9, INK, 4 );
			p( 'M 120 400 q 14 10 28 0', null, 4 );
			break;
		}

		/* ---------------------------- dinosaurs ----------------------------- */
		case 'trex':
			p( 'M 186 340 Q 86 380 60 466 Q 142 424 210 396 Z', '#93bb94', 1 );
			e( 254, 438, 38, 58, '#93bb94', 2 );
			e( 326, 438, 38, 58, '#93bb94', 2 );
			e( 284, 336, 122, 96, '#93bb94', 1, -0.25 );
			p(
				'M 340 236 Q 330 140 420 132 Q 500 134 506 196 Q 506 236 452 246 L 360 262 Z',
				'#93bb94',
				2
			);
			e( 300, 360, 66, 58, CREAM, 3 );
			p(
				'M 372 300 l 32 18 l -10 14 M 352 318 l 28 22 l -12 12',
				null,
				3
			);
			eye( 432, 172, 8 );
			p( 'M 384 218 Q 440 230 504 210', null, 4 );
			for ( let i = 0; i < 5; i++ ) {
				p( `M ${ 404 + i * 18 } 222 l 6 10 l 6 -10`, '#ffffff', 4 );
			}
			break;
		case 'brachiosaurus':
			p( 'M 172 350 Q 80 380 48 424 Q 120 414 184 392 Z', '#9cbac9', 1 );
			legs( [ 206, 268, 328, 386 ], 396, 40, 92, '#9cbac9', 2 );
			e( 300, 356, 140, 86, '#9cbac9', 1 );
			p(
				'M 352 320 Q 374 176 414 104 L 456 120 Q 426 196 420 330 Z',
				'#9cbac9',
				2
			);
			e( 444, 104, 44, 28, '#9cbac9', 2 );
			e( 300, 380, 90, 40, CREAM, 3 );
			eye( 456, 98, 6 );
			p( 'M 452 118 q 18 6 32 -4', null, 4 );
			for ( const [ x, y ] of [
				[ 250, 316 ],
				[ 300, 300 ],
				[ 350, 318 ],
				[ 222, 344 ],
			] ) {
				e( x, y, 14, 9, '#7f9fb0', 4 );
			}
			break;
		case 'stegosaurus':
			for ( let i = 0; i < 6; i++ ) {
				const x = 176 + i * 50;
				const h = 70 + Math.sin( ( i / 5 ) * Math.PI ) * 50;
				p(
					poly( [
						[ x - 26, 290 ],
						[ x - 14, 290 - h * 0.7 ],
						[ x, 290 - h ],
						[ x + 14, 290 - h * 0.7 ],
						[ x + 26, 290 ],
					] ),
					CORAL,
					2
				);
			}
			legs( [ 196, 252, 344, 400 ], 380, 40, 86, '#b7c888', 2 );
			p( 'M 120 360 Q 60 360 40 400', null, 3 );
			p(
				'M 46 384 l -22 -20 M 60 378 l -10 -28 M 46 398 l -26 4',
				null,
				3
			);
			p(
				'M 120 380 Q 160 270 300 262 Q 440 270 470 360 Q 520 352 540 386 Q 520 420 470 410 Q 300 440 120 380 Z',
				'#b7c888',
				1
			);
			eye( 508, 376, 6 );
			e( 300, 396, 110, 26, CREAM, 3 );
			for ( const x of [ 210, 270, 330, 390 ] ) {
				e( x, 330, 10, 7, '#93a868', 4 );
			}
			break;
		case 'triceratops':
			legs( [ 166, 226, 312, 366 ], 390, 42, 86, GOLD, 2 );
			p( 'M 120 370 Q 60 380 40 410 Q 100 404 130 392 Z', GOLD, 1 );
			e( 254, 350, 140, 92, GOLD, 1 );
			e( 404, 268, 86, 92, CORAL, 2 );
			e( 432, 314, 64, 50, GOLD, 2 );
			p(
				'M 408 272 L 432 194 L 446 276 Z M 452 280 L 488 210 L 490 290 Z',
				CREAM,
				3
			);
			p( 'M 474 318 L 520 296 L 486 334 Z', CREAM, 3 );
			eye( 442, 300, 7 );
			for ( let i = 0; i < 7; i++ ) {
				const a = Math.PI * 1.05 + ( i / 6 ) * Math.PI * 0.9;
				e(
					404 + Math.cos( a ) * 78,
					268 + Math.sin( a ) * 84,
					8,
					8,
					'#e3a28a',
					4
				);
			}
			p( 'M 452 338 q 16 8 30 -4', null, 4 );
			break;
		case 'pterodactyl':
			p( 'M 296 290 L 70 198 Q 112 304 232 334 Z', PURPLE, 1 );
			p( 'M 304 290 L 530 198 Q 488 304 368 334 Z', PURPLE, 1 );
			e( 300, 316, 40, 84, PURPLE, 2 );
			p( 'M 286 228 L 220 182 L 300 214 Z', '#a693bc', 2 );
			e( 300, 232, 34, 30, PURPLE, 2 );
			p( 'M 316 228 L 404 214 L 316 246 Z', GOLD, 3 );
			eye( 300, 226, 6 );
			p( 'M 132 236 L 252 300 M 468 236 L 348 300', null, 3 );
			p(
				'M 286 396 l -10 26 M 286 396 l 4 28 M 314 396 l 10 26 M 314 396 l -4 28',
				null,
				4
			);
			break;
		case 'ankylosaurus':
			p( 'M 122 372 L 70 362', null, 2 );
			e( 56, 360, 30, 24, '#b9a77d', 2 );
			legs( [ 166, 226, 350, 410 ], 384, 40, 70, '#b9a77d', 2 );
			e( 500, 372, 46, 34, '#b9a77d', 2 );
			p(
				'M 120 382 Q 140 248 300 244 Q 460 248 480 382 Z',
				'#c9b88e',
				1
			);
			for ( let i = 0; i < 9; i++ ) {
				const x = 140 + i * 40;
				const y = 380 - Math.sin( ( i / 8 ) * Math.PI ) * 128;
				p(
					`M ${ x - 12 } ${ y + 4 } L ${ x } ${ y - 22 } L ${
						x + 12
					} ${ y + 4 } Z`,
					CREAM,
					3
				);
			}
			eye( 512, 362, 6 );
			for ( const [ x, y ] of [
				[ 220, 320 ],
				[ 280, 300 ],
				[ 340, 300 ],
				[ 400, 320 ],
				[ 250, 356 ],
				[ 310, 344 ],
				[ 370, 356 ],
			] ) {
				e( x, y, 18, 14, '#a99566', 4 );
			}
			break;
		case 'dinoegg':
			e( 300, 306, 140, 176, CREAM, 1 );
			p(
				'M 132 432 Q 300 520 468 432 Q 468 478 300 500 Q 132 478 132 432 Z',
				'#c8a978',
				2
			);
			p(
				'M 176 250 L 214 280 L 240 244 L 276 286 L 306 250 L 336 290 L 372 252 L 404 282 L 430 246',
				null,
				3
			);
			for ( const [ x, y, rr ] of [
				[ 240, 180, 16 ],
				[ 340, 160, 12 ],
				[ 360, 360, 18 ],
				[ 236, 380, 14 ],
				[ 300, 330, 10 ],
			] ) {
				e( x, y, rr, rr, GREEN, 4 );
			}
			p(
				'M 170 470 l 30 -16 M 240 486 l 26 -20 M 340 486 l -26 -20 M 420 470 l -30 -16',
				null,
				4
			);
			break;
		case 'parasaurolophus':
			p( 'M 176 330 Q 86 360 52 420 Q 130 400 196 372 Z', '#a8c69a', 1 );
			e( 254, 446, 34, 54, '#a8c69a', 2 );
			e( 318, 446, 34, 54, '#a8c69a', 2 );
			e( 280, 340, 120, 86, '#a8c69a', 1, -0.2 );
			p(
				'M 340 290 Q 360 200 400 180 L 446 200 Q 410 230 400 300 Z',
				'#a8c69a',
				2
			);
			e( 432, 196, 42, 28, '#a8c69a', 2 );
			p( 'M 420 178 L 330 116 L 340 136 L 412 196 Z', CORAL, 3 );
			e( 300, 368, 66, 40, CREAM, 3 );
			eye( 432, 188, 6 );
			p( 'M 452 206 q 14 4 22 -6 M 370 300 l 24 16', null, 4 );
			break;
		case 'volcano':
			e( 220, 128, 50, 36, GRAY, 3 );
			e( 290, 92, 62, 42, GRAY, 3 );
			e( 368, 120, 48, 34, GRAY, 3 );
			p( 'M 70 486 L 236 200 H 364 L 530 486 Z', '#a89074', 1 );
			e( 300, 200, 64, 16, '#8a7360', 2 );
			p(
				'M 248 204 Q 260 250 240 290 Q 270 272 282 300 Q 290 250 300 216 Q 312 260 330 280 Q 344 250 356 204 Z',
				CORAL,
				2
			);
			p(
				'M 160 486 l 24 -50 M 420 486 l -18 -64 M 300 486 v -40',
				null,
				4
			);
			for ( const [ x, y ] of [
				[ 130, 470 ],
				[ 470, 466 ],
				[ 210, 440 ],
			] ) {
				e( x, y, 16, 10, '#8a7360', 4 );
			}
			break;

		/* ------------------------------ treats ------------------------------ */
		case 'cupcake':
			p( 'M 176 316 L 220 486 H 380 L 424 316 Z', BLUE, 1 );
			p( bumpy( 300, 270, 140, 70, 12, 12 ), '#f2c4cf', 2 );
			p(
				'M 230 316 L 254 486 M 300 316 V 486 M 370 316 L 346 486',
				null,
				3
			);
			p( 'M 300 186 Q 304 152 326 142', null, 3 );
			e( 300, 196, 26, 26, CORAL, 3 );
			for ( const [ x, y, a ] of [
				[ 220, 260, 0.6 ],
				[ 260, 230, -0.4 ],
				[ 340, 236, 0.3 ],
				[ 380, 266, -0.6 ],
				[ 300, 286, 0.9 ],
				[ 250, 292, -0.2 ],
				[ 352, 296, 0.5 ],
			] ) {
				e( x, y, 10, 4, GOLD, 4, a );
			}
			break;
		case 'icecream':
			p( 'M 206 300 L 300 524 L 394 300 Z', GOLD, 1 );
			e( 300, 268, 108, 82, '#f2c4cf', 2 );
			e( 300, 180, 86, 72, '#f4ead7', 2 );
			p(
				'M 226 340 L 360 300 M 246 386 L 380 340 M 268 432 L 340 410 M 374 340 L 240 300 M 354 386 L 220 340 M 332 432 L 260 410',
				null,
				3
			);
			p(
				'M 214 292 Q 220 330 236 320 Q 244 306 254 326 Q 262 344 274 318',
				null,
				3
			);
			e( 300, 108, 22, 22, CORAL, 4 );
			for ( const [ x, y, a ] of [
				[ 260, 170, 0.4 ],
				[ 334, 160, -0.5 ],
				[ 300, 210, 0.1 ],
				[ 250, 260, -0.3 ],
				[ 348, 250, 0.6 ],
			] ) {
				e( x, y, 9, 4, BLUE, 4, a );
			}
			break;
		case 'donut': {
			e( 300, 306, 190, 168, '#d8b07a', 1 );
			let icing = '';
			const pts = 36;
			for ( let i = 0; i <= pts; i++ ) {
				const a = ( i / pts ) * Math.PI * 2;
				const rr = 156 + ( i % 2 ? 10 : -6 );
				icing +=
					( i ? ' L ' : 'M ' ) +
					`${ n2( 300 + Math.cos( a ) * rr * 1.08 ) } ${ n2(
						296 + Math.sin( a ) * rr * 0.92
					) }`;
			}
			p( icing + ' Z', '#e9a0b4', 2 );
			e( 300, 302, 62, 54, '#ffffff', 3 );
			for ( const [ x, y, a, c ] of [
				[ 200, 230, 0.6, GOLD ],
				[ 260, 186, -0.4, BLUE ],
				[ 352, 192, 0.3, GREEN ],
				[ 410, 250, -0.7, GOLD ],
				[ 420, 350, 0.4, BLUE ],
				[ 344, 410, -0.2, GREEN ],
				[ 236, 404, 0.8, GOLD ],
				[ 186, 330, -0.5, BLUE ],
			] ) {
				e( x, y, 13, 5, c, 4, a );
			}
			break;
		}
		case 'pizza':
			p( 'M 300 520 L 132 162 Q 300 112 468 162 Z', GOLD, 1 );
			p(
				'M 132 162 Q 300 112 468 162 L 452 198 Q 300 152 148 198 Z',
				'#d8a868',
				2
			);
			for ( const [ x, y ] of [
				[ 240, 240 ],
				[ 350, 236 ],
				[ 300, 320 ],
				[ 270, 420 ],
			] ) {
				e( x, y, 30, 30, CORAL, 3 );
			}
			for ( const [ x, y ] of [
				[ 300, 230 ],
				[ 220, 300 ],
				[ 360, 330 ],
				[ 312, 390 ],
			] ) {
				e( x, y, 9, 9, DARK, 4 );
				e( x, y, 3, 3, GOLD, 4 );
			}
			p( 'M 196 186 q 20 -14 40 0 M 330 172 q 20 -14 40 0', null, 4 );
			break;
		case 'cookie': {
			// The bite is cut out of the outline itself: every point of the
			// round cookie that falls inside the bite is pushed onto its rim.
			const bite = [ 458, 176 ];
			const outline = arc( 300, 300, 190, 180, 0, Math.PI * 2, 72 ).map(
				( [ x, y ] ) => {
					const dx = x - bite[ 0 ];
					const dy = y - bite[ 1 ];
					const d = Math.hypot( dx, dy );
					return d < 64
						? [
								bite[ 0 ] + ( dx / d ) * 64,
								bite[ 1 ] + ( dy / d ) * 64,
						  ]
						: [ x, y ];
				}
			);
			p( poly( outline ), '#d9b37f', 1 );
			p( 'M 372 170 q 18 12 8 30 q 22 4 20 30 q 18 12 6 30', null, 2 );
			for ( const [ x, y, rr ] of [
				[ 220, 220, 20 ],
				[ 320, 190, 16 ],
				[ 200, 330, 18 ],
				[ 300, 300, 22 ],
				[ 390, 300, 18 ],
				[ 260, 410, 16 ],
				[ 360, 400, 20 ],
			] ) {
				e( x, y, rr, rr * 0.86, '#6b4e3d', 3 );
			}
			p(
				'M 160 260 q 10 20 0 40 M 250 150 q 20 4 30 -8 M 430 400 q -10 20 4 34',
				null,
				4
			);
			break;
		}
		case 'croissant':
			e( 300, 300, 74, 120, GOLD, 1 );
			e( 196, 330, 62, 92, GOLD, 2, -0.7 );
			e( 404, 330, 62, 92, GOLD, 2, 0.7 );
			e( 124, 386, 44, 62, GOLD, 3, -1.1 );
			e( 476, 386, 44, 62, GOLD, 3, 1.1 );
			p(
				'M 268 196 Q 300 300 268 404 M 332 196 Q 300 300 332 404 M 180 264 Q 230 330 210 400 M 420 264 Q 370 330 390 400',
				null,
				4
			);
			break;
		case 'watermelon':
			p( 'M 86 236 Q 300 576 514 236 Z', GREEN, 1 );
			p( 'M 118 240 Q 300 532 482 240 Z', CORAL, 2 );
			p( 'M 104 238 Q 300 556 496 238', null, 3 );
			for ( const [ x, y, a ] of [
				[ 220, 290, 0.5 ],
				[ 300, 300, 0 ],
				[ 380, 290, -0.5 ],
				[ 256, 360, 0.3 ],
				[ 344, 360, -0.3 ],
				[ 300, 420, 0 ],
			] ) {
				e( x, y, 7, 13, DARK, 4, a );
			}
			break;
		case 'banana':
			p(
				'M 150 196 C 140 380 270 492 474 432 C 300 440 210 360 204 196 Z',
				GOLD,
				1
			);
			p( 'M 150 196 L 146 156 L 196 152 L 204 196 Z', WOOD, 2 );
			p( 'M 474 432 l 22 2 l -6 20 l -24 -6 Z', WOOD, 2 );
			p( 'M 178 200 C 176 360 270 452 452 436', null, 3 );
			for ( const [ x, y ] of [
				[ 196, 330 ],
				[ 262, 410 ],
				[ 360, 446 ],
			] ) {
				e( x, y, 6, 4, WOOD, 4 );
			}
			break;
		case 'carrot':
			leaf( 300, 220, -1, 0.9, GREEN );
			leaf( 300, 220, 1, 0.9, GREEN );
			p( 'M 300 220 Q 296 130 312 86', null, 2 );
			p( 'M 300 524 L 226 232 Q 300 200 374 232 Z', '#e59a5b', 1 );
			p(
				'M 248 292 h 28 M 324 330 h 28 M 262 380 h 24 M 314 430 h 22',
				null,
				3
			);
			p( 'M 258 256 q 42 16 84 0', null, 4 );
			break;

		/* ------------------------------ at home ----------------------------- */
		case 'teapot':
			p(
				'M 166 328 Q 102 300 82 226 L 108 220 Q 132 286 174 300 Z',
				BLUE,
				2
			);
			p( 'M 436 280 Q 528 284 508 372 Q 492 424 444 402', null, 2 );
			e( 300, 336, 152, 122, BLUE, 1 );
			e( 300, 224, 72, 22, BLUE, 2 );
			e( 300, 198, 18, 14, GOLD, 3 );
			r( 220, 446, 160, 20, BLUE, 3 );
			for ( const [ x, y ] of [
				[ 240, 320 ],
				[ 300, 360 ],
				[ 360, 320 ],
			] ) {
				e( x, y, 18, 18, CREAM, 4 );
				e( x, y, 6, 6, CORAL, 4 );
			}
			break;
		case 'mug':
			p(
				'M 392 270 Q 476 270 476 340 Q 476 412 392 412 L 392 380 Q 440 380 440 340 Q 440 302 392 302 Z',
				CORAL,
				2
			);
			p(
				'M 176 210 H 392 V 440 Q 392 482 350 482 H 218 Q 176 482 176 440 Z',
				CORAL,
				1
			);
			e( 284, 212, 108, 18, '#8b6a52', 3 );
			p(
				'M 240 180 q -20 -30 0 -60 q 20 -30 0 -60 M 300 180 q -20 -30 0 -60 M 340 180 q -20 -30 0 -60 q 20 -30 0 -60',
				null,
				3
			);
			p(
				'M 284 330 C 254 300 240 340 284 372 C 328 340 314 300 284 330 Z',
				CREAM,
				4
			);
			break;
		case 'lamp':
			p( 'M 214 140 H 386 L 446 300 H 154 Z', GOLD, 1 );
			r( 288, 300, 24, 152, WOOD, 2 );
			e( 300, 466, 112, 26, WOOD, 2 );
			p( 'M 360 300 v 60', null, 3 );
			e( 360, 368, 8, 10, CREAM, 3 );
			p( 'M 200 180 H 400 M 180 236 H 420', null, 4 );
			break;
		case 'armchair':
			p( 'M 184 336 Q 182 166 300 162 Q 418 166 416 336 Z', CORAL, 1 );
			r( 164, 330, 272, 96, CORAL, 1 );
			p(
				'M 130 300 Q 130 260 168 260 Q 206 260 206 300 V 432 H 130 Z',
				'#c97a62',
				2
			);
			p(
				'M 394 300 Q 394 260 432 260 Q 470 260 470 300 V 432 H 394 Z',
				'#c97a62',
				2
			);
			e( 300, 346, 112, 26, CREAM, 3 );
			p(
				'M 150 432 v 40 M 450 432 v 40 M 230 426 v 40 M 370 426 v 40',
				null,
				3
			);
			for ( const [ x, y ] of [
				[ 250, 230 ],
				[ 300, 210 ],
				[ 350, 230 ],
				[ 275, 280 ],
				[ 325, 280 ],
			] ) {
				e( x, y, 6, 6, CREAM, 4 );
			}
			break;
		case 'clock':
			e( 186, 156, 46, 40, GOLD, 2, -0.6 );
			e( 414, 156, 46, 40, GOLD, 2, 0.6 );
			p( 'M 196 430 L 170 486 M 404 430 L 430 486', null, 2 );
			e( 300, 306, 166, 166, CORAL, 1 );
			e( 300, 306, 134, 134, CREAM, 2 );
			p( 'M 300 306 V 210 M 300 306 L 364 340', null, 3 );
			e( 300, 306, 10, 10, INK, 3 );
			for ( let i = 0; i < 12; i++ ) {
				const a = ( i / 12 ) * Math.PI * 2;
				p(
					`M ${ n2( 300 + Math.cos( a ) * 112 ) } ${ n2(
						306 + Math.sin( a ) * 112
					) } L ${ n2( 300 + Math.cos( a ) * 124 ) } ${ n2(
						306 + Math.sin( a ) * 124
					) }`,
					null,
					4
				);
			}
			break;
		case 'books':
			p(
				poly( [
					[ 140, 404 ],
					[ 452, 392 ],
					[ 456, 470 ],
					[ 144, 482 ],
				] ),
				BLUE,
				1
			);
			p(
				poly( [
					[ 168, 320 ],
					[ 430, 334 ],
					[ 426, 396 ],
					[ 164, 384 ],
				] ),
				CORAL,
				2
			);
			p(
				poly( [
					[ 196, 252 ],
					[ 420, 240 ],
					[ 422, 322 ],
					[ 198, 334 ],
				] ),
				GREEN,
				2
			);
			p(
				'M 186 404 L 190 480 M 410 336 L 406 396 M 232 252 L 234 332',
				null,
				3
			);
			p( 'M 260 432 H 380 M 230 360 H 340 M 270 290 H 380', null, 4 );
			e( 336, 210, 32, 30, CORAL, 3 );
			p( 'M 336 182 q 6 -20 22 -24', null, 4 );
			break;
		case 'plant':
			leaf( 300, 300, -1, 1.2, GREEN );
			leaf( 300, 300, 1, 1.2, GREEN );
			leaf( 300, 260, -1, 0.9, '#7fa982' );
			leaf( 300, 260, 1, 0.9, '#7fa982' );
			p( 'M 300 330 V 150', null, 2 );
			p( 'M 202 340 L 230 488 H 370 L 398 340 Z', CORAL, 1 );
			r( 186, 320, 228, 36, CORAL, 2 );
			e( 300, 322, 104, 10, '#8b6a52', 3 );
			p( 'M 230 400 q 70 20 140 0', null, 4 );
			break;
		case 'wateringcan':
			p( 'M 196 330 L 84 204 L 104 192 L 210 296 Z', BLUE, 2 );
			e( 88, 194, 28, 14, GOLD, 3, -0.8 );
			p( 'M 240 250 Q 300 150 360 250', null, 2 );
			p(
				'M 196 250 H 414 V 440 Q 414 476 378 476 H 232 Q 196 476 196 440 Z',
				BLUE,
				1
			);
			p( 'M 414 300 Q 470 300 470 360 Q 470 420 414 420', null, 2 );
			for ( const [ x, y ] of [
				[ 60, 240 ],
				[ 80, 270 ],
				[ 52, 290 ],
			] ) {
				e( x, y, 6, 10, SKY, 4 );
			}
			p( 'M 232 330 H 378', null, 4 );
			break;
		case 'teddy':
			sitter( '#c9a27c', {
				ears: () => roundEars( '#c9a27c', '#e2c9ad', 38, 188 ),
				face: () => e( 300, 288, 48, 34, '#e2c9ad', 3 ),
				extra: () => {
					p(
						'M 262 336 L 300 352 L 338 336 L 338 368 L 300 352 L 262 368 Z',
						CORAL,
						4
					);
					p(
						'M 270 410 l 12 12 M 300 404 v 16 M 330 410 l -12 12',
						null,
						4
					);
				},
			} );
			break;

		/* ------------------------------- space ------------------------------ */
		case 'planet': {
			e( 300, 300, 236, 62, GOLD, 1, -0.3 );
			e( 300, 300, 136, 136, PURPLE, 1 );
			const outer = arc( 300, 300, 236, 62, 0, Math.PI, 24, -0.3 );
			const inner = arc( 300, 300, 172, 40, Math.PI, 0, 24, -0.3 );
			p( poly( outer.concat( inner ) ), GOLD, 2 );
			p(
				'M 186 250 Q 300 230 412 262 M 176 330 Q 300 356 420 330',
				null,
				3
			);
			for ( const [ x, y, rr ] of [
				[ 92, 140, 9 ],
				[ 500, 120, 7 ],
				[ 520, 460, 10 ],
				[ 110, 470, 6 ],
			] ) {
				e( x, y, rr, rr, GOLD, 4 );
			}
			break;
		}
		case 'moon': {
			const outer = arc(
				300,
				300,
				190,
				190,
				Math.PI * 0.32,
				Math.PI * 1.68,
				36
			);
			const inner = arc(
				388,
				262,
				150,
				150,
				Math.PI * 1.5,
				Math.PI * 0.62,
				36
			);
			p( poly( outer.concat( inner ) ), GOLD, 1 );
			p( poly( starPts( 430, 380, 34, 14 ) ), CREAM, 2 );
			p( poly( starPts( 470, 160, 22, 9 ) ), CREAM, 2 );
			e( 196, 330, 16, 10, PINK, 3 );
			p( 'M 170 270 q 16 10 30 0 M 196 380 q 20 16 40 -2', null, 4 );
			break;
		}
		case 'star':
			p( poly( starPts( 300, 310, 210, 92 ) ), GOLD, 1 );
			p( poly( starPts( 300, 310, 150, 66 ) ), '#f2d79c', 2 );
			e( 248, 336, 18, 12, PINK, 3 );
			e( 352, 336, 18, 12, PINK, 3 );
			eye( 266, 300, 8 );
			eye( 334, 300, 8 );
			p( 'M 276 338 Q 300 360 324 338', null, 4 );
			break;
		case 'sun':
			for ( let i = 0; i < 12; i++ ) {
				const a = ( i / 12 ) * Math.PI * 2;
				const tip = [
					300 + Math.cos( a ) * 240,
					300 + Math.sin( a ) * 240,
				];
				const l = [
					300 + Math.cos( a - 0.16 ) * 150,
					300 + Math.sin( a - 0.16 ) * 150,
				];
				const rr = [
					300 + Math.cos( a + 0.16 ) * 150,
					300 + Math.sin( a + 0.16 ) * 150,
				];
				p( poly( [ l, tip, rr ] ), i % 2 ? CORAL : GOLD, 2 );
			}
			e( 300, 300, 150, 150, GOLD, 1 );
			e( 244, 330, 22, 14, PINK, 3 );
			e( 356, 330, 22, 14, PINK, 3 );
			eye( 262, 286, 9 );
			eye( 338, 286, 9 );
			p( 'M 264 336 Q 300 368 336 336', null, 4 );
			break;
		case 'comet':
			p( 'M 340 180 Q 160 236 62 432 Q 200 320 360 292 Z', '#f2d9a0', 2 );
			e( 386, 222, 74, 74, GOLD, 1 );
			p(
				'M 300 214 Q 200 260 140 340 M 320 258 Q 230 296 176 368',
				null,
				3
			);
			for ( const [ x, y, rr ] of [
				[ 470, 120, 18 ],
				[ 506, 300, 12 ],
				[ 200, 140, 10 ],
			] ) {
				p( poly( starPts( x, y, rr, rr * 0.42 ) ), CREAM, 4 );
			}
			e( 360, 200, 16, 12, '#f2d79c', 4 );
			break;
		case 'astronaut':
			e( 176, 360, 34, 74, WHITE, 2, 0.3 );
			e( 424, 360, 34, 74, WHITE, 2, -0.3 );
			p( 'M 208 300 Q 300 280 392 300 L 402 452 H 198 Z', WHITE, 1 );
			r( 206, 450, 80, 40, GRAY, 2 );
			r( 314, 450, 80, 40, GRAY, 2 );
			e( 300, 216, 98, 94, WHITE, 2 );
			e( 300, 222, 70, 60, BLUE, 3 );
			r( 262, 336, 76, 54, CORAL, 3 );
			e( 280, 196, 18, 10, '#ffffff', 4, -0.5 );
			for ( const x of [ 280, 300, 320 ] ) {
				e( x, 362, 6, 6, GOLD, 4 );
			}
			break;
		case 'ufo':
			p( 'M 240 326 L 168 506 H 432 L 360 326 Z', '#f6ecc3', 1 );
			e( 300, 244, 86, 76, SKY, 2 );
			e( 300, 300, 204, 56, GRAY, 1 );
			e( 300, 304, 160, 24, '#a2abb0', 3 );
			for ( const x of [ 170, 236, 300, 364, 430 ] ) {
				e( x, 318, 12, 9, GOLD, 3 );
			}
			eye( 280, 236, 8 );
			eye( 320, 236, 8 );
			p( 'M 288 262 q 12 8 24 0', null, 4 );
			break;
		case 'telescope':
			p(
				'M 264 344 L 186 500 M 300 344 V 506 M 336 344 L 414 500',
				null,
				2
			);
			p(
				poly( [
					[ 136, 300 ],
					[ 420, 160 ],
					[ 446, 214 ],
					[ 162, 354 ],
				] ),
				BLUE,
				1
			);
			e( 434, 186, 18, 32, GOLD, 2, -0.45 );
			p(
				poly( [
					[ 112, 312 ],
					[ 140, 298 ],
					[ 158, 336 ],
					[ 130, 350 ],
				] ),
				DARK,
				3
			);
			e( 300, 300, 18, 18, GOLD, 3 );
			for ( const [ x, y, rr ] of [
				[ 480, 90, 14 ],
				[ 540, 160, 9 ],
				[ 420, 60, 8 ],
			] ) {
				p( poly( starPts( x, y, rr, rr * 0.42 ) ), GOLD, 4 );
			}
			break;
		case 'satellite':
			r( 244, 244, 112, 112, GOLD, 1 );
			p( 'M 230 300 H 244 M 356 300 H 370', null, 2 );
			r( 84, 266, 146, 68, BLUE, 2 );
			r( 370, 266, 146, 68, BLUE, 2 );
			p(
				'M 120 266 V 334 M 157 266 V 334 M 194 266 V 334 M 406 266 V 334 M 443 266 V 334 M 480 266 V 334 M 84 300 H 230 M 370 300 H 516',
				null,
				3
			);
			p( 'M 262 240 Q 300 176 338 240 Z', CREAM, 3 );
			p( 'M 300 210 V 150', null, 4 );
			e( 300, 146, 8, 8, CORAL, 4 );
			e( 300, 300, 18, 18, CREAM, 4 );
			break;

		/* -------------------------- music and play -------------------------- */
		case 'guitar':
			r( 285, 92, 30, 196, WOOD, 2 );
			r( 270, 48, 60, 56, WOOD, 2 );
			e( 300, 392, 128, 112, '#d9a066', 1 );
			e( 300, 282, 94, 84, '#d9a066', 1 );
			e( 300, 330, 36, 36, '#6b4e3d', 2 );
			r( 254, 418, 92, 18, WOOD, 3 );
			for ( const [ x, y ] of [
				[ 276, 64 ],
				[ 276, 88 ],
				[ 324, 64 ],
				[ 324, 88 ],
			] ) {
				e( x, y, 5, 5, CREAM, 3 );
			}
			p(
				'M 292 104 V 426 M 300 104 V 426 M 308 104 V 426 M 285 140 H 315 M 285 180 H 315 M 285 220 H 315',
				null,
				4
			);
			break;
		case 'drum':
			p( 'M 150 252 V 420 Q 300 486 450 420 V 252 Z', CORAL, 1 );
			e( 300, 252, 150, 42, WHITE, 2 );
			p( 'M 150 420 Q 300 486 450 420', null, 2 );
			p(
				'M 150 276 L 200 440 L 250 290 L 300 456 L 350 290 L 400 440 L 450 276',
				null,
				3
			);
			p( 'M 160 140 L 280 236 M 440 140 L 320 236', null, 4 );
			e( 156, 136, 14, 14, CREAM, 4 );
			e( 444, 136, 14, 14, CREAM, 4 );
			break;
		case 'trumpet':
			r( 120, 286, 270, 30, GOLD, 1 );
			p( 'M 380 280 L 520 196 V 406 L 380 322 Z', GOLD, 1 );
			p( 'M 190 316 Q 190 400 300 400 Q 390 400 390 316', null, 2 );
			for ( const x of [ 214, 254, 294 ] ) {
				r( x, 226, 24, 60, GOLD, 2 );
				e( x + 12, 222, 18, 8, CREAM, 3 );
			}
			r( 92, 290, 30, 22, DARK, 3 );
			e( 520, 301, 18, 104, '#f2d79c', 3 );
			p( 'M 140 296 H 380 M 400 300 L 506 236', null, 4 );
			break;
		case 'violin':
			p(
				'M 300 120 C 230 120 220 200 250 232 C 200 250 196 300 236 330 C 180 372 200 470 300 470 C 400 470 420 372 364 330 C 404 300 400 250 350 232 C 380 200 370 120 300 120 Z',
				'#c58a5a',
				1
			);
			r( 288, 40, 24, 150, '#6b4e3d', 2 );
			e( 300, 36, 22, 18, '#6b4e3d', 2 );
			p( 'M 254 300 q -12 30 6 60 M 346 300 q 12 30 -6 60', null, 3 );
			r( 268, 402, 64, 14, '#6b4e3d', 3 );
			p( 'M 294 50 V 410 M 306 50 V 410', null, 4 );
			p( 'M 150 500 L 470 120', null, 4 );
			break;
		case 'xylophone': {
			const colors = [ CORAL, GOLD, GREEN, BLUE, PURPLE, PINK ];
			p( 'M 120 260 L 480 300 M 120 420 L 480 380', null, 2 );
			for ( let i = 0; i < 6; i++ ) {
				const x = 132 + i * 58;
				const h = 210 - i * 18;
				r( x, 340 - h / 2, 44, h, colors[ i ], i < 3 ? 1 : 2 );
				e( x + 22, 340 - h / 2 + 16, 5, 5, CREAM, 3 );
				e( x + 22, 340 + h / 2 - 16, 5, 5, CREAM, 3 );
			}
			p( 'M 360 520 L 450 440 M 420 540 L 500 450', null, 4 );
			e( 456, 434, 14, 14, WOOD, 4 );
			e( 506, 444, 14, 14, WOOD, 4 );
			break;
		}
		case 'beachball': {
			e( 300, 300, 190, 190, WHITE, 1 );
			const seg = ( a, color, step ) => {
				const pts = [
					...arc( 300, 300, 190, 190, a - 0.52, a + 0.52, 12 ),
				];
				p(
					`M 300 300 L ${ n2( pts[ 0 ][ 0 ] ) } ${ n2(
						pts[ 0 ][ 1 ]
					) } ` +
						pts
							.slice( 1 )
							.map(
								( q ) => `L ${ n2( q[ 0 ] ) } ${ n2( q[ 1 ] ) }`
							)
							.join( ' ' ) +
						' Z',
					color,
					step
				);
			};
			seg( -Math.PI / 2, CORAL, 2 );
			seg( Math.PI / 6, BLUE, 2 );
			seg( ( Math.PI * 5 ) / 6, GOLD, 3 );
			e( 300, 300, 40, 40, WHITE, 3 );
			e( 236, 210, 28, 14, '#ffffff', 4, -0.6 );
			e( 300, 300, 8, 8, GRAY, 4 );
			break;
		}
		case 'robot':
			r( 194, 250, 212, 172, BLUE, 1 );
			r( 222, 120, 156, 120, GRAY, 2 );
			r( 220, 422, 54, 70, GRAY, 2 );
			r( 326, 422, 54, 70, GRAY, 2 );
			r( 150, 270, 44, 120, GRAY, 2 );
			r( 406, 270, 44, 120, GRAY, 2 );
			p( 'M 300 120 V 80', null, 3 );
			e( 300, 74, 12, 12, CORAL, 3 );
			r( 244, 290, 112, 80, CREAM, 3 );
			eye( 264, 172, 14 );
			eye( 336, 172, 14 );
			p( 'M 262 210 H 338', null, 4 );
			for ( const [ x, c ] of [
				[ 270, CORAL ],
				[ 300, GOLD ],
				[ 330, GREEN ],
			] ) {
				e( x, 330, 10, 10, c, 4 );
			}
			break;
		case 'top':
			p( 'M 300 506 L 156 300 Q 300 174 444 300 Z', CORAL, 1 );
			r( 286, 140, 28, 72, BLUE, 2 );
			p(
				'M 168 316 Q 300 380 432 316 L 404 358 Q 300 410 196 358 Z',
				GOLD,
				2
			);
			p(
				'M 230 410 Q 300 440 370 410 M 186 280 Q 300 230 414 280',
				null,
				3
			);
			p( 'M 112 470 q 30 -12 60 0 M 428 470 q 30 -12 60 0', null, 4 );
			break;
		case 'rockinghorse':
			p(
				'M 96 440 Q 300 560 504 440 L 496 466 Q 300 584 104 466 Z',
				WOOD,
				1
			);
			p(
				'M 196 340 L 160 470 M 236 352 L 222 486 M 380 352 L 392 486 M 412 340 L 448 470',
				null,
				2
			);
			e( 300, 320, 130, 60, CREAM, 1 );
			p(
				'M 390 300 Q 420 200 440 150 L 500 170 Q 516 200 496 214 L 470 210 Q 446 260 430 320 Z',
				CREAM,
				2
			);
			p(
				'M 440 150 Q 400 170 392 230 Q 404 196 430 186 Q 410 230 404 270',
				CORAL,
				3
			);
			p( 'M 250 262 H 340 L 330 312 H 260 Z', BLUE, 3 );
			p( 'M 170 300 Q 120 320 128 380', null, 3 );
			eye( 468, 180, 6 );
			e( 498, 196, 4, 4, INK, 4 );
			p( 'M 260 290 h 70', null, 4 );
			break;
		default:
			return false;
	}
	return true;
}
