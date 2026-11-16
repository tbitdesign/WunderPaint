/** Original, layered vector motifs. The same paths serve sources and drawing guides. */
import { MORE_GROUPS, MORE_IDS, moreParts } from './motifs-more.js';

const GROUPS = [
	[
		'Woodland',
		'fox:Fox bear:Bear rabbit:Rabbit squirrel:Squirrel deer:Deer hedgehog:Hedgehog raccoon:Raccoon badger:Badger wolf:Wolf',
	],
	[
		'Ocean life',
		'fish:Fish angelfish:Angelfish whale:Whale dolphin:Dolphin shark:Shark octopus:Octopus jellyfish:Jellyfish seahorse:Seahorse turtle:Turtle',
	],
	[
		'Birds and insects',
		'owl:Owl sparrow:Sparrow duck:Duck swan:Swan penguin:Penguin flamingo:Flamingo butterfly:Butterfly bee:Bee ladybug:Ladybug',
	],
	[
		'Botanical',
		'daisy:Daisy sunflower:Sunflower tulip:Tulip rose:Rose poppy:Poppy lotus:Lotus leaf:Leaf fern:Fern cactus:Cactus',
	],
	[
		'Garden',
		'mushroom:Mushroom acorn:Acorn pinecone:Pinecone apple:Apple pear:Pear strawberry:Strawberry cherries:Cherries lemon:Lemon pumpkin:Pumpkin',
	],
	[
		'Little buildings',
		'cottage:Cottage townhouse:Townhouse lighthouse:Lighthouse windmill:Windmill castle:Castle greenhouse:Greenhouse barn:Barn treehouse:Treehouse beachhut:Beach_hut',
	],
	[
		'Journeys',
		'bicycle:Bicycle car:Car bus:Bus train:Train boat:Boat sailboat:Sailboat rocket:Rocket airplane:Airplane balloon:Hot_air_balloon',
	],
	[
		'Seasons',
		'snowman:Snowman snowflake:Snowflake pine:Pine_tree snowglobe:Snow_globe gift:Gift lantern:Lantern rainboot:Rain_boot kite:Kite umbrella:Umbrella',
	],
];
const ALL_GROUPS = [ ...GROUPS, ...MORE_GROUPS ];
export const MOTIFS = ALL_GROUPS.flatMap( ( [ category, list ] ) =>
	list.split( ' ' ).map( ( entry ) => {
		const [ id, label ] = entry.split( ':' );
		return { id, label: label.replaceAll( '_', ' ' ), category };
	} )
);
const INK = '#344550',
	CREAM = '#fff4d6',
	GREEN = '#88b6a0',
	BLUE = '#91b9ce',
	CORAL = '#d68c70',
	GOLD = '#e2b66b';

export function motifParts( id ) {
	if ( ! MOTIFS.some( ( m ) => m.id === id ) ) id = 'fox';
	const parts = [];
	const p = ( d, fill = null, step = 3, stroke = true ) =>
		parts.push( { type: 'path', d, fill, step, stroke } );
	const e = ( x, y, rx, ry, fill = CREAM, step = 1, angle = 0 ) =>
		parts.push( {
			type: 'ellipse',
			d: [ x, y, rx, ry, angle ],
			fill,
			step,
			stroke: true,
		} );
	const r = ( x, y, w, h, fill = CREAM, step = 1 ) =>
		parts.push( {
			type: 'rect',
			d: [ x, y, w, h ],
			fill,
			step,
			stroke: true,
		} );
	const eye = ( x, y, radius = 5 ) => e( x, y, radius, radius, INK, 4 );
	const leaf = ( x, y, flip = 1, size = 1, fill = GREEN ) => {
		p(
			`M ${ x } ${ y } Q ${ x + flip * 70 * size } ${ y - 95 * size } ${
				x + flip * 110 * size
			} ${ y - 55 * size } Q ${ x + flip * 75 * size } ${
				y + 12 * size
			} ${ x } ${ y } Z`,
			fill,
			2
		);
		p(
			`M ${ x } ${ y } L ${ x + flip * 90 * size } ${ y - 48 * size }`,
			null,
			4
		);
	};
	const wheel = ( x, y, radius = 45 ) => {
		e( x, y, radius, radius, BLUE, 2 );
		e( x, y, radius * 0.48, radius * 0.48, '#ffffff', 4 );
	};
	const window = ( x, y, w = 48, h = 55 ) => {
		r( x, y, w, h, BLUE, 3 );
		p(
			`M ${ x + w / 2 } ${ y } V ${ y + h } M ${ x } ${ y + h / 2 } H ${
				x + w
			}`,
			null,
			4
		);
	};

	if ( MORE_IDS.has( id ) ) {
		// 3.1: eight more categories, drawn in their own module.
		moreParts( id, {
			p,
			e,
			r,
			eye,
			leaf,
			INK,
			CREAM,
			GREEN,
			BLUE,
			CORAL,
			GOLD,
		} );
	} else if ( GROUPS[ 0 ][ 1 ].includes( id + ':' ) ) {
		const color = {
			fox: CORAL,
			bear: '#b39478',
			rabbit: '#dad6c6',
			squirrel: '#bd8b68',
			deer: '#c5a17c',
			hedgehog: '#a89074',
			raccoon: '#a5b1b3',
			badger: '#a7aca9',
			wolf: '#96aaba',
		}[ id ];
		if ( id === 'hedgehog' ) {
			let spines = 'M 105 375';
			for ( let i = 0; i <= 15; i++ ) {
				const a = Math.PI + ( i / 15 ) * Math.PI;
				spines += ` L ${
					275 + Math.cos( a ) * ( i % 2 ? 160 : 200 )
				} ${ 355 + Math.sin( a ) * ( i % 2 ? 145 : 185 ) }`;
			}
			p( spines + ' L 456 390 Q 290 450 105 375 Z', color, 1 );
			e( 215, 427, 35, 18, CREAM, 2 );
			e( 380, 427, 35, 18, CREAM, 2 );
			p( 'M 365 300 Q 420 298 515 375 Q 455 441 356 396 Z', CREAM, 2 );
			eye( 510, 375, 10 );
			eye( 430, 352 );
			for ( let i = 0; i < 6; i++ )
				p( `M ${ 160 + i * 38 } 290 l -15 -30`, null, 4 );
		} else {
			if ( [ 'fox', 'squirrel', 'raccoon', 'wolf' ].includes( id ) ) {
				p(
					id === 'squirrel'
						? 'M 356 434 C 536 470 546 175 432 162 C 342 149 348 286 425 258 C 480 345 372 347 344 362 Z'
						: 'M 360 435 Q 555 428 500 239 Q 437 327 353 321 Z',
					color,
					1
				);
				if ( id === 'fox' )
					p(
						'M 482 271 Q 510 323 498 345 L 462 329 L 444 348 Q 443 314 482 271 Z',
						CREAM,
						3
					);
				if ( id === 'raccoon' )
					for ( let i = 0; i < 3; i++ )
						p(
							`M ${ 400 + i * 35 } ${ 391 - i * 29 } l 22 32`,
							null,
							4
						);
			}
			e( 295, 366, 98, 119, color, 1 );
			e( 260, 470, 46, 21, color, 2 );
			e( 345, 470, 46, 21, color, 2 );
			e( 293, 389, 61, 75, CREAM, 3 );
			if ( id === 'rabbit' ) {
				e( 249, 148, 28, 86, color, 2, -0.16 );
				e( 343, 146, 28, 86, color, 2, 0.14 );
				e( 249, 141, 11, 54, '#e8b8ae', 3, -0.16 );
				e( 343, 141, 11, 54, '#e8b8ae', 3, 0.14 );
			} else if ( id === 'bear' ) {
				e( 225, 210, 40, 40, color, 2 );
				e( 371, 210, 40, 40, color, 2 );
			} else {
				p( 'M 211 260 L 207 150 L 274 211 Z', color, 2 );
				p( 'M 322 211 L 389 150 L 385 260 Z', color, 2 );
			}
			if ( id === 'deer' ) {
				p(
					'M 254 211 L 230 128 L 192 90 M 230 128 L 241 83 M 230 145 L 187 135 M 339 211 L 365 128 L 404 91 M 365 128 L 351 80 M 365 147 L 407 135',
					null,
					2
				);
			}
			if ( [ 'fox', 'wolf' ].includes( id ) )
				p(
					'M 210 231 Q 295 174 387 231 L 374 288 L 300 343 L 224 291 Z',
					color,
					2
				);
			else
				e(
					298,
					267,
					id === 'deer' ? 77 : 93,
					id === 'deer' ? 85 : 77,
					color,
					2
				);
			if ( [ 'fox', 'wolf' ].includes( id ) )
				p(
					'M 220 259 Q 268 246 300 294 Q 330 247 380 260 L 300 337 Z',
					CREAM,
					3
				);
			else e( 298, 301, 47, 32, CREAM, 3 );
			if ( id === 'raccoon' ) {
				e( 258, 265, 31, 19, '#657178', 3, 0.2 );
				e( 337, 265, 31, 19, '#657178', 3, -0.2 );
			}
			if ( id === 'badger' ) {
				p( 'M 253 208 Q 274 247 265 287 L 227 268 Z', INK, 3 );
				p( 'M 343 208 Q 322 247 331 287 L 369 268 Z', INK, 3 );
			}
			eye( 259, 262 );
			eye( 336, 262 );
			e( 298, 296, 10, 7, INK, 4 );
			p(
				'M 298 302 v 13 q -16 16 -30 0 M 298 315 q 16 16 30 0',
				null,
				4
			);
			p(
				'M 227 346 Q 243 370 252 404 M 364 346 Q 350 370 339 404',
				null,
				4
			);
		}
	} else if ( GROUPS[ 1 ][ 1 ].includes( id + ':' ) ) {
		if (
			[ 'fish', 'angelfish', 'shark', 'dolphin', 'whale' ].includes( id )
		) {
			p( 'M 405 283 L 509 207 L 489 302 L 520 383 L 404 339 Z', BLUE, 2 );
			if ( id === 'angelfish' ) {
				p(
					'M 264 198 L 340 100 L 352 249 M 275 363 L 330 487 L 355 339',
					GOLD,
					2
				);
				e( 294, 300, 134, 99, GOLD, 1 );
			} else if ( id === 'shark' || id === 'dolphin' ) {
				p(
					'M 85 310 Q 140 193 340 245 L 326 173 L 394 260 Q 430 275 443 312 Q 347 374 176 357 Z',
					BLUE,
					1
				);
				p( 'M 286 322 L 315 411 L 347 340 Z', '#6d99b5', 2 );
			} else {
				e(
					290,
					302,
					id === 'whale' ? 175 : 133,
					id === 'whale' ? 112 : 88,
					BLUE,
					1
				);
				p( 'M 283 349 Q 331 447 377 355', '#6d99b5', 2 );
			}
			eye( 190, 282, 7 );
			p( 'M 152 329 Q 184 358 218 329', null, 4 );
			if ( id === 'whale' ) {
				p(
					'M 283 194 C 213 93 212 109 238 134 M 283 194 Q 318 71 344 119 M 283 194 Q 287 89 281 78',
					null,
					3
				);
			} else if ( id === 'shark' )
				for ( let i = 0; i < 3; i++ )
					p( `M ${ 222 + i * 15 } 278 l -7 40`, null, 4 );
			else if ( id !== 'dolphin' )
				for ( let i = 0; i < 3; i++ )
					p(
						`M ${ 270 + i * 39 } 232 Q ${ 238 + i * 39 } 300 ${
							270 + i * 39
						} 367`,
						null,
						4
					);
		} else if ( id === 'octopus' || id === 'jellyfish' ) {
			for ( let i = 0; i < ( id === 'octopus' ? 8 : 6 ); i++ ) {
				const x = 175 + i * ( id === 'octopus' ? 35 : 48 );
				p(
					`M ${ x } 302 C ${ x - 44 } 407 ${ x + 44 } 426 ${
						x + ( i % 2 ? 22 : -22 )
					} 476`,
					null,
					2
				);
			}
			if ( id === 'octopus' ) e( 301, 251, 131, 113, CORAL, 1 );
			else
				p(
					'M 150 307 C 145 81 455 81 450 307 Q 417 282 390 309 Q 359 282 330 309 Q 300 282 270 309 Q 238 282 210 309 Q 180 282 150 307 Z',
					'#cfb9d4',
					1
				);
			eye( 255, 259 );
			eye( 345, 259 );
			p( 'M 283 286 Q 300 306 317 286', null, 4 );
		} else if ( id === 'turtle' ) {
			e( 188, 235, 55, 28, GREEN, 2, -0.5 );
			e( 389, 239, 55, 28, GREEN, 2, 0.5 );
			e( 188, 397, 55, 28, GREEN, 2, 0.5 );
			e( 389, 397, 55, 28, GREEN, 2, -0.5 );
			e( 291, 179, 48, 57, GREEN, 2 );
			e( 290, 318, 112, 139, '#b7c888', 1 );
			p(
				'M 290 233 L 345 273 L 346 353 L 290 399 L 235 354 L 235 274 Z M 290 233 v -49 M 345 273 l 50 -20 M 346 353 l 49 19 M 290 399 v 53 M 235 354 l -48 25 M 235 274 l -45 -20',
				null,
				3
			);
			eye( 273, 164 );
			eye( 309, 164 );
		} else {
			p(
				'M 309 162 C 159 104 193 275 262 281 C 160 390 251 493 347 443 C 403 407 369 339 322 359 C 287 375 313 414 336 393 C 248 410 330 315 336 271 L 371 241 L 355 180 Z',
				GOLD,
				1
			);
			p( 'M 225 194 L 167 177 L 178 245 L 238 253 Z', GOLD, 2 );
			p( 'M 279 300 L 353 297 L 376 329 L 306 344', CORAL, 2 );
			eye( 276, 205, 9 );
			for ( let i = 0; i < 5; i++ )
				p( `M 257 ${ 280 + i * 23 } l 49 10`, null, 4 );
		}
	} else if ( GROUPS[ 2 ][ 1 ].includes( id + ':' ) ) {
		if ( id === 'butterfly' ) {
			e( 214, 233, 103, 111, CORAL, 1, -0.3 );
			e( 386, 233, 103, 111, CORAL, 1, 0.3 );
			e( 228, 383, 83, 89, GOLD, 2, 0.3 );
			e( 372, 383, 83, 89, GOLD, 2, -0.3 );
			e( 300, 298, 19, 125, '#8d9292', 2 );
			p(
				'M 294 177 Q 278 110 250 118 M 307 177 Q 322 110 350 118',
				null,
				3
			);
			for ( const x of [ 200, 400 ] ) {
				e( x, 228, 36, 49, CREAM, 3 );
				e( x < 300 ? 223 : 377, 382, 24, 31, CREAM, 3 );
			}
		} else if ( id === 'bee' ) {
			e( 253, 220, 72, 95, '#e2edf0', 2, -0.45 );
			e( 348, 220, 72, 95, '#e2edf0', 2, 0.45 );
			e( 301, 340, 110, 96, GOLD, 1 );
			p(
				'M 236 265 Q 213 338 237 414 M 281 246 Q 259 341 282 434 M 331 248 Q 310 345 334 431',
				null,
				3
			);
			eye( 365, 313 );
			p( 'M 370 349 Q 383 361 396 347', null, 4 );
		} else if ( id === 'ladybug' ) {
			for ( const y of [ 260, 340, 415 ] )
				p( `M 225 ${ y } l -73 -22 M 375 ${ y } l 73 -22`, null, 2 );
			e( 300, 194, 60, 59, INK, 2 );
			e( 300, 331, 133, 154, CORAL, 1 );
			p( 'M 300 178 V 485', null, 3 );
			for ( const [ x, y ] of [
				[ 242, 254 ],
				[ 220, 340 ],
				[ 251, 421 ],
				[ 358, 254 ],
				[ 380, 340 ],
				[ 349, 421 ],
			] )
				e( x, y, 21, 25, INK, 4 );
		} else {
			const color = {
				owl: '#b5a387',
				sparrow: '#b29a82',
				duck: GOLD,
				swan: '#eff0e6',
				penguin: '#6c8392',
				flamingo: '#dea2a2',
			}[ id ];
			if ( id === 'swan' || id === 'flamingo' ) {
				p(
					'M 318 357 C 442 286 218 139 349 120 C 397 125 380 169 356 170 C 293 183 483 325 361 382 Z',
					color,
					2
				);
				e( 268, 371, 137, 80, color, 1 );
				p( 'M 373 135 L 427 158 L 375 169 Z', GOLD, 3 );
				eye( 357, 139 );
				if ( id === 'flamingo' )
					p( 'M 275 434 v 99 M 323 434 l 39 40 l -56 35', null, 2 );
			} else {
				e( 300, 341, 122, 137, color, 1 );
				e( 300, 225, 100, 96, color, 2 );
				if ( id === 'owl' ) {
					p(
						'M 208 207 L 196 117 L 263 161 M 337 161 L 404 117 L 391 207',
						color,
						2
					);
					e( 258, 224, 40, 45, CREAM, 3 );
					e( 342, 224, 40, 45, CREAM, 3 );
				} else e( 300, 360, 80, 101, CREAM, 3 );
				p(
					'M 181 294 Q 197 365 232 399 M 419 294 Q 403 365 368 399',
					null,
					3
				);
				eye( 260, 222, 8 );
				eye( 340, 222, 8 );
				p(
					id === 'duck'
						? 'M 269 248 Q 300 228 335 252 Q 300 275 269 248 Z'
						: 'M 286 254 L 314 254 L 300 275 Z',
					GOLD,
					3
				);
				p(
					'M 258 474 l -17 26 M 258 474 v 28 M 258 474 l 18 25 M 341 474 l -17 26 M 341 474 v 28 M 341 474 l 18 25',
					null,
					4
				);
			}
			p( 'M 211 332 Q 241 292 324 344 Q 285 400 218 367', null, 4 );
		}
	} else if ( GROUPS[ 3 ][ 1 ].includes( id + ':' ) ) {
		if ( id === 'leaf' ) {
			p(
				'M 151 454 C 123 240 288 143 447 122 C 472 323 350 473 151 454 Z',
				GREEN,
				1
			);
			p( 'M 115 494 L 424 151', null, 2 );
			for ( let i = 0; i < 5; i++ ) {
				const x = 193 + i * 44,
					y = 411 - i * 49;
				p(
					`M ${ x } ${ y } l -28 -99 M ${ x } ${ y } l 99 11`,
					null,
					3
				);
			}
		} else if ( id === 'fern' ) {
			p( 'M 276 510 Q 360 238 299 93', null, 1 );
			for ( let i = 0; i < 6; i++ ) {
				const y = 435 - i * 55,
					x = 307 + Math.sin( i * 0.55 ) * 14;
				leaf( x, y, -1, 1.05 - i * 0.13 );
				leaf( x, y, 1, 1.05 - i * 0.13 );
			}
		} else if ( id === 'cactus' ) {
			p( 'M 255 418 V 154 C 255 93 345 93 345 154 V 420 Z', GREEN, 1 );
			p(
				'M 255 318 H 185 Q 151 318 151 280 V 222 C 151 180 207 180 207 222 V 267 H 255 M 345 254 H 386 V 182 C 386 139 438 139 438 182 V 274 Q 438 306 405 306 H 345',
				GREEN,
				2
			);
			p( 'M 225 410 H 375 L 351 513 H 249 Z', CORAL, 2 );
			for ( const x of [ 280, 304, 328 ] )
				p( `M ${ x } 157 V 392`, null, 3 );
		} else {
			p( 'M 300 477 Q 326 371 300 251', null, 1 );
			leaf( 307, 419, -1, 0.88 );
			leaf( 314, 353, 1, 0.78 );
			if ( id === 'tulip' )
				p(
					'M 189 142 L 249 198 L 298 124 L 350 198 L 411 140 C 423 330 184 331 189 142 Z',
					CORAL,
					2
				);
			else if ( id === 'lotus' ) {
				p(
					'M 300 280 Q 190 178 300 91 Q 410 178 300 280 Z',
					'#dba9bb',
					2
				);
				p(
					'M 300 280 Q 153 303 145 161 Q 265 150 300 280 Z',
					'#e9c3cb',
					2
				);
				p(
					'M 300 280 Q 447 303 455 161 Q 335 150 300 280 Z',
					'#e9c3cb',
					2
				);
			} else {
				const petals = { daisy: 12, sunflower: 16, rose: 7, poppy: 5 }[
					id
				];
				for ( let i = 0; i < petals; i++ ) {
					const a = ( i * Math.PI * 2 ) / petals;
					e(
						300 + Math.cos( a ) * 72,
						225 + Math.sin( a ) * 72,
						id === 'poppy' ? 68 : id === 'rose' ? 55 : 48,
						id === 'poppy' ? 58 : 25,
						id === 'daisy'
							? CREAM
							: id === 'sunflower'
							? GOLD
							: CORAL,
						2,
						a
					);
				}
				e(
					300,
					225,
					id === 'sunflower' ? 60 : 41,
					id === 'sunflower' ? 60 : 41,
					id === 'sunflower' ? '#9c8562' : GOLD,
					3
				);
				if ( id === 'rose' )
					p(
						'M 309 208 C 264 190 267 254 308 245 C 338 236 317 211 297 225',
						null,
						4
					);
				else
					for ( let i = 0; i < 9; i++ )
						eye(
							283 + ( i % 3 ) * 17,
							208 + Math.floor( i / 3 ) * 17,
							2
						);
			}
		}
	} else if ( GROUPS[ 4 ][ 1 ].includes( id + ':' ) ) {
		if ( id === 'mushroom' ) {
			p( 'M 267 281 L 239 477 Q 300 512 363 477 L 334 281 Z', CREAM, 1 );
			p(
				'M 125 295 C 126 53 474 53 475 295 Q 300 332 125 295 Z',
				CORAL,
				2
			);
			for ( const [ x, y, s ] of [
				[ 221, 220, 30 ],
				[ 311, 172, 24 ],
				[ 376, 252, 30 ],
				[ 301, 275, 15 ],
			] )
				e( x, y, s, s * 0.7, CREAM, 3 );
			p( 'M 280 357 L 268 466 M 322 341 L 334 458', null, 4 );
		} else if ( id === 'acorn' ) {
			p( 'M 191 251 Q 182 432 300 487 Q 418 432 409 251 Z', GOLD, 1 );
			e( 300, 249, 121, 59, '#a28c70', 2 );
			p( 'M 300 193 Q 283 143 327 123', null, 2 );
			for ( let i = 0; i < 5; i++ )
				p( `M ${ 219 + i * 37 } 222 l 25 52`, null, 4 );
		} else if ( id === 'pinecone' ) {
			e( 300, 310, 116, 192, '#b69a74', 1 );
			for ( let row = 0; row < 6; row++ )
				for ( let col = 0; col < 3; col++ ) {
					const y = 185 + row * 48,
						x = 228 + col * 70 + ( row % 2 ) * 8;
					p(
						`M ${ x - 27 } ${ y } Q ${ x } ${ y - 23 } ${
							x + 29
						} ${ y } L ${ x } ${ y + 35 } Z`,
						GOLD,
						3
					);
				}
		} else if ( id === 'cherries' ) {
			p(
				'M 209 333 Q 332 227 310 117 M 310 117 Q 321 249 386 342',
				null,
				1
			);
			e( 211, 380, 81, 84, CORAL, 2 );
			e( 381, 389, 78, 80, CORAL, 2 );
			leaf( 313, 181, 1, 0.75 );
			p(
				'M 172 362 Q 184 335 212 337 M 344 372 Q 355 347 377 348',
				null,
				4
			);
		} else if ( id === 'pear' ) {
			p(
				'M 257 175 C 232 299 121 327 188 440 C 229 514 388 500 423 420 C 464 323 350 298 342 175 Z',
				'#bac782',
				1
			);
			p( 'M 298 177 Q 281 119 325 101', null, 2 );
			leaf( 304, 153, 1, 0.66 );
		} else if ( id === 'strawberry' ) {
			p(
				'M 164 239 C 186 136 406 131 436 238 Q 461 339 300 488 Q 139 339 164 239 Z',
				CORAL,
				1
			);
			p(
				'M 300 201 L 232 157 L 254 211 L 188 223 L 265 246 L 300 211 L 339 247 L 412 219 L 343 211 L 367 158 Z',
				GREEN,
				2
			);
			for ( let i = 0; i < 15; i++ ) {
				const row = Math.floor( i / 5 ),
					x = 208 + ( i % 5 ) * 43,
					y = 274 + row * 52;
				if ( Math.abs( x - 300 ) < 115 - row * 22 )
					e( x, y, 4, 8, CREAM, 4 );
			}
		} else if ( id === 'lemon' ) {
			p(
				'M 134 319 C 176 178 389 119 457 268 L 479 283 L 459 305 C 399 433 218 473 148 345 Z',
				GOLD,
				1
			);
			leaf( 412, 223, -1, 0.75 );
			p( 'M 188 303 Q 224 249 279 237', null, 4 );
		} else {
			e( 300, 342, 150, 134, id === 'apple' ? CORAL : GOLD, 1 );
			if ( id === 'pumpkin' ) {
				e( 300, 342, 100, 134, GOLD, 2 );
				e( 300, 342, 48, 134, GOLD, 3 );
			}
			p( 'M 300 210 Q 278 153 320 133', null, 2 );
			leaf( 306, 180, 1, 0.71 );
			if ( id === 'apple' ) p( 'M 188 321 Q 188 268 230 250', null, 4 );
		}
	} else if ( GROUPS[ 5 ][ 1 ].includes( id + ':' ) ) {
		if ( id === 'lighthouse' || id === 'windmill' ) {
			p( 'M 222 476 L 257 213 H 347 L 381 476 Z', CREAM, 1 );
			if ( id === 'lighthouse' ) {
				r( 238, 174, 125, 60, BLUE, 2 );
				p( 'M 220 174 L 300 112 L 380 174 Z', CORAL, 2 );
				p(
					'M 247 278 H 355 L 363 328 H 240 Z M 232 391 H 372 L 379 439 H 226 Z',
					CORAL,
					3
				);
			} else {
				p( 'M 226 213 L 300 137 L 374 213 Z', CORAL, 2 );
				for ( let i = 0; i < 4; i++ ) {
					const a = ( i * Math.PI ) / 2,
						cs = Math.cos( a ),
						sn = Math.sin( a ),
						pt = ( x, y ) =>
							`${ 300 + x * cs - y * sn } ${
								253 + x * sn + y * cs
							}`;
					p(
						`M ${ pt( 0, 0 ) } L ${ pt( 29, -4 ) } L ${ pt(
							54,
							-165
						) } L ${ pt( 1, -169 ) } Z`,
						BLUE,
						3
					);
				}
				e( 300, 253, 17, 17, GOLD, 4 );
			}
			r( 281, 411, 43, 65, '#9b8068', 3 );
		} else if ( id === 'castle' ) {
			r( 142, 251, 316, 228, CREAM, 1 );
			r( 117, 194, 86, 285, GOLD, 2 );
			r( 397, 194, 86, 285, GOLD, 2 );
			p(
				'M 100 194 L 160 111 L 221 194 Z M 379 194 L 440 111 L 501 194 Z',
				CORAL,
				2
			);
			p( 'M 262 479 V 387 Q 300 340 338 387 V 479 Z', '#a58e76', 3 );
			window( 141, 280, 38, 62 );
			window( 420, 280, 38, 62 );
			for ( let i = 0; i < 5; i++ )
				r( 213 + i * 35, 225, 20, 36, CREAM, 3 );
		} else {
			if ( id === 'treehouse' ) {
				p( 'M 270 498 L 283 245 H 328 L 348 498 Z', '#aa8c6d', 1 );
				e( 305, 169, 161, 91, GREEN, 1 );
				p(
					'M 176 384 L 145 523 M 213 383 L 181 524 M 167 425 H 203 M 159 460 H 193 M 151 495 H 186',
					null,
					4
				);
			}
			const y = id === 'treehouse' ? 230 : 248,
				h = id === 'treehouse' ? 155 : 230;
			r(
				163,
				y,
				274,
				h,
				id === 'greenhouse' ? '#d9e7df' : id === 'barn' ? CORAL : CREAM,
				1
			);
			p(
				`M 137 ${ y } L 300 ${ y - 139 } L 463 ${ y } Z`,
				id === 'greenhouse' ? BLUE : CORAL,
				2
			);
			if ( id === 'greenhouse' ) {
				for ( const x of [ 218, 273, 328, 383 ] )
					p( `M ${ x } ${ y } V ${ y + h }`, null, 3 );
				p(
					`M 163 ${ y + 88 } H 437 M 218 ${ y } L 300 ${
						y - 139
					} L 383 ${ y }`,
					null,
					4
				);
			} else if ( id === 'barn' ) {
				r( 230, 337, 140, 141, '#e7caa0', 3 );
				p( 'M 230 337 L 370 478 M 370 337 L 230 478', null, 4 );
			} else {
				r( 280, y + h - 100, 57, 100, '#a99077', 3 );
				window( 189, y + 34 );
				window( 363, y + 34 );
				eye( 323, y + h - 43, 3 );
			}
			if ( id === 'townhouse' ) {
				r( 183, 141, 234, 108, CREAM, 2 );
				p( 'M 169 141 L 300 66 L 430 141 Z', CORAL, 2 );
				window( 218, 171, 45, 47 );
				window( 334, 171, 45, 47 );
			}
			if ( id === 'beachhut' ) {
				for ( let x = 180; x < 437; x += 28 )
					p( `M ${ x } 255 V 477`, null, 4 );
				p( 'M 203 478 v 35 M 397 478 v 35', null, 2 );
			}
			if ( id === 'cottage' ) {
				r( 369, 125, 37, 100, CREAM, 1 );
				p( 'M 250 201 Q 300 165 350 201', null, 4 );
			}
		}
	} else if ( GROUPS[ 6 ][ 1 ].includes( id + ':' ) ) {
		if ( id === 'car' || id === 'bus' || id === 'train' ) {
			if ( id === 'car' )
				p(
					'M 115 350 L 157 324 L 213 224 H 355 L 423 325 L 488 347 V 420 H 112 Z',
					CORAL,
					1
				);
			else r( 116, 248, 368, 180, id === 'bus' ? GOLD : GREEN, 1 );
			wheel( 195, 423, 46 );
			wheel( 413, 423, 46 );
			if ( id === 'car' ) {
				p(
					'M 223 246 H 280 V 322 H 180 Z M 303 246 H 343 L 392 322 H 303 Z',
					BLUE,
					3
				);
				p( 'M 289 335 V 400 M 310 345 H 338', null, 4 );
			} else {
				for ( let x = 141; x < 460; x += 76 ) window( x, 272, 53, 63 );
			}
			if ( id === 'train' ) {
				r( 112, 205, 122, 40, CORAL, 2 );
				r( 382, 164, 48, 82, GOLD, 2 );
				p( 'M 354 164 H 455 M 102 475 H 507', null, 4 );
			}
		} else if ( id === 'bicycle' ) {
			wheel( 171, 385, 84 );
			wheel( 435, 385, 84 );
			p(
				'M 171 385 L 250 246 L 319 385 Z M 250 246 H 391 L 319 385 M 435 385 L 376 211 H 420 M 250 246 L 232 208 M 201 208 H 264 M 319 385 l 28 18 h 30',
				null,
				2
			);
			e( 319, 385, 14, 14, GOLD, 3 );
		} else if ( id === 'boat' || id === 'sailboat' ) {
			p( 'M 108 376 H 492 L 433 465 H 177 Z', CORAL, 1 );
			if ( id === 'sailboat' ) {
				p(
					'M 306 376 V 105 M 291 135 L 141 346 H 291 Z M 322 165 L 437 346 H 322 Z',
					CREAM,
					2
				);
			} else {
				r( 184, 273, 176, 101, CREAM, 2 );
				r( 249, 192, 47, 80, GOLD, 2 );
				window( 208, 296, 43, 45 );
				window( 288, 296, 43, 45 );
			}
			p(
				'M 91 492 Q 134 465 177 492 Q 220 516 263 492 Q 306 465 349 492 Q 392 516 435 492 Q 475 468 509 492',
				null,
				4
			);
		} else if ( id === 'rocket' ) {
			p(
				'M 252 381 L 167 471 L 185 326 L 243 274 M 348 381 L 433 471 L 415 326 L 357 274',
				CORAL,
				2
			);
			p(
				'M 240 411 C 214 261 241 150 300 89 C 359 150 386 261 360 411 Z',
				CREAM,
				1
			);
			e( 300, 248, 44, 44, BLUE, 3 );
			p( 'M 271 431 L 281 503 L 300 478 L 321 518 L 334 431 Z', GOLD, 3 );
			p( 'M 248 369 H 352', null, 4 );
		} else if ( id === 'airplane' ) {
			p(
				'M 282 403 L 132 457 L 144 411 L 278 338 V 268 L 85 296 L 85 253 L 278 180 Q 283 91 300 92 Q 317 91 322 180 L 515 253 V 296 L 322 268 V 338 L 456 411 L 468 457 L 318 403 L 300 465 Z',
				BLUE,
				1
			);
			p( 'M 285 174 Q 300 158 315 174 V 211 H 285 Z', CREAM, 3 );
		} else {
			p( 'M 257 411 L 233 356 M 343 411 L 367 356', null, 2 );
			e( 300, 236, 147, 169, CORAL, 1 );
			e( 300, 236, 87, 169, GOLD, 2 );
			e( 300, 236, 30, 169, CREAM, 3 );
			r( 255, 415, 91, 78, '#b5a182', 2 );
			p( 'M 255 441 H 346 M 280 415 V 493 M 320 415 V 493', null, 4 );
		}
	} else {
		if ( id === 'snowman' ) {
			e( 300, 382, 119, 118, '#edf0ec', 1 );
			e( 300, 239, 84, 81, '#edf0ec', 2 );
			r( 236, 128, 128, 63, BLUE, 2 );
			p( 'M 213 191 H 387', null, 2 );
			p( 'M 182 342 L 99 291 M 417 341 L 499 292', null, 3 );
			p( 'M 294 238 L 355 250 L 294 258 Z', CORAL, 3 );
			eye( 277, 222 );
			eye( 322, 222 );
			for ( const y of [ 340, 386, 433 ] ) eye( 300, y, 7 );
		} else if ( id === 'snowflake' ) {
			for ( let i = 0; i < 6; i++ ) {
				const a = ( i * Math.PI ) / 3,
					pt = ( x, y ) =>
						`${ 300 + x * Math.cos( a ) - y * Math.sin( a ) } ${
							300 + x * Math.sin( a ) + y * Math.cos( a )
						}`;
				p(
					`M 300 300 L ${ pt( 0, -196 ) } M ${ pt(
						-43,
						-168
					) } L ${ pt( 0, -128 ) } L ${ pt( 43, -168 ) } M ${ pt(
						-34,
						-98
					) } L ${ pt( 0, -66 ) } L ${ pt( 34, -98 ) }`,
					null,
					i < 3 ? 1 : 2
				);
			}
			e( 300, 300, 20, 20, BLUE, 3 );
		} else if ( id === 'pine' ) {
			r( 273, 428, 54, 82, '#ab8c6c', 1 );
			p(
				'M 300 88 L 393 232 H 354 L 435 350 H 384 L 471 470 H 129 L 216 350 H 165 L 246 232 H 207 Z',
				GREEN,
				2
			);
			for ( const [ x, y ] of [
				[ 302, 207 ],
				[ 251, 309 ],
				[ 354, 332 ],
				[ 276, 417 ],
				[ 398, 424 ],
			] )
				e( x, y, 13, 13, GOLD, 4 );
		} else if ( id === 'snowglobe' ) {
			e( 300, 263, 176, 176, '#dae8eb', 1 );
			p( 'M 147 423 H 453 L 473 493 H 127 Z', GOLD, 2 );
			p(
				'M 206 385 L 263 232 L 320 385 Z M 301 389 L 363 204 L 425 389 Z',
				GREEN,
				3
			);
			for ( const [ x, y ] of [
				[ 211, 234 ],
				[ 300, 172 ],
				[ 407, 289 ],
				[ 169, 326 ],
				[ 331, 330 ],
			] )
				e( x, y, 6, 6, '#ffffff', 4 );
		} else if ( id === 'gift' ) {
			r( 164, 243, 272, 229, CORAL, 1 );
			r( 149, 212, 302, 54, GOLD, 2 );
			r( 276, 212, 48, 260, CREAM, 3 );
			p(
				'M 300 210 C 138 220 190 84 300 210 C 410 84 463 220 300 210 Z',
				GOLD,
				2
			);
		} else if ( id === 'lantern' ) {
			e( 300, 150, 58, 56, CREAM, 2 );
			r( 198, 200, 204, 250, GOLD, 1 );
			p(
				'M 174 200 L 240 152 H 360 L 426 200 Z M 178 450 H 422 L 434 489 H 166 Z',
				BLUE,
				2
			);
			r( 229, 232, 142, 186, CREAM, 3 );
			p(
				'M 280 389 V 333 H 320 V 389 Z M 300 328 Q 276 297 304 275 Q 328 305 300 328 Z',
				CORAL,
				4
			);
		} else if ( id === 'rainboot' ) {
			p(
				'M 214 123 H 381 L 359 348 Q 484 363 482 425 Q 483 476 411 476 H 179 Q 151 459 173 401 L 215 344 Z',
				GOLD,
				1
			);
			r( 202, 122, 190, 52, BLUE, 2 );
			p( 'M 168 433 H 480 M 238 198 L 225 346', null, 3 );
			e( 288, 257, 24, 29, CORAL, 4 );
		} else if ( id === 'kite' ) {
			p( 'M 300 77 L 438 237 L 300 383 L 162 237 Z', GOLD, 1 );
			p( 'M 300 77 V 383 M 162 237 H 438', null, 2 );
			p( 'M 300 383 C 213 414 371 449 283 529', null, 3 );
			p(
				'M 266 423 L 320 394 V 444 Z M 279 478 L 337 453 V 503 Z',
				CORAL,
				4
			);
		} else {
			p(
				'M 115 299 C 116 57 484 57 485 299 Q 436 266 392 299 Q 345 269 300 299 Q 252 269 208 299 Q 160 266 115 299 Z',
				CORAL,
				1
			);
			p(
				'M 300 120 Q 236 171 208 299 M 300 120 Q 363 171 392 299 M 300 100 V 446 Q 300 509 249 478',
				null,
				2
			);
		}
	}
	// Final, authored details remain separate from the large construction shapes.
	if ( id === 'sailboat' ) p( 'M 126 395 H 473', null, 3 );
	if ( id === 'butterfly' ) {
		for ( const x of [ 200, 400 ] ) e( x, 228, 12, 17, GOLD, 4 );
	}
	if ( id === 'leaf' )
		p( 'M 182 430 l -5 -47 M 212 397 l 47 4 M 307 285 l 48 4', null, 4 );
	if ( id === 'cactus' )
		p( 'M 237 430 H 363 M 194 225 v 51 M 419 186 v 81', null, 4 );
	if ( id === 'pinecone' ) {
		parts
			.filter( ( part ) => part.type === 'path' )
			.forEach( ( part, i ) => {
				part.step = i < 6 ? 2 : i < 12 ? 3 : 4;
			} );
	}
	if ( id === 'lighthouse' )
		p( 'M 270 174 v 60 M 331 174 v 60 M 294 439 v 13', null, 4 );
	if ( id === 'airplane' ) {
		parts[ 0 ].step = 2;
		parts.unshift( {
			type: 'path',
			d: 'M 280 393 V 180 Q 283 91 300 92 Q 317 91 320 180 V 393 Z',
			fill: BLUE,
			step: 1,
			stroke: true,
		} );
		p(
			'M 111 273 L 256 217 M 489 273 L 344 217 M 174 435 L 270 374 M 426 435 L 330 374',
			null,
			4
		);
	}
	if ( id === 'snowflake' ) {
		for ( let i = 0; i < 6; i++ ) {
			const a = ( i * Math.PI ) / 3;
			e(
				300 + Math.cos( a ) * 43,
				300 + Math.sin( a ) * 43,
				4,
				4,
				BLUE,
				4
			);
		}
	}
	if ( id === 'gift' ) {
		e( 300, 211, 14, 12, CORAL, 4 );
		p( 'M 287 259 V 462 M 316 259 V 462', null, 4 );
	}
	if ( id === 'umbrella' ) {
		p(
			'M 300 100 v -25 M 127 280 Q 161 250 197 277 M 403 277 Q 442 250 477 280',
			null,
			3
		);
		p( 'M 284 451 Q 284 484 259 470', null, 4 );
	}
	// Sparse subjects put one secondary feature in the third stage instead of
	// presenting an identical panel twice. The final drawing order is unchanged.
	if ( ! parts.some( ( part ) => part.step === 3 ) ) {
		const secondary = parts.filter( ( part ) => part.step === 2 );
		if ( secondary.length > 1 ) secondary.at( -1 ).step = 3;
		else {
			const details = parts.filter( ( part ) => part.step === 4 );
			if ( details.length > 1 ) details[ 0 ].step = 3;
		}
	}
	return parts;
}

/** Minimal native-canvas path reader for our own M/L/H/V/Q/C/Z vector commands. */
export function tracePath( g, d ) {
	const tokens =
		d.match( /[a-zA-Z]|[-+]?(?:\d*\.)?\d+(?:e[-+]?\d+)?/g ) || [];
	let i = 0,
		x = 0,
		y = 0,
		sx = 0,
		sy = 0,
		command = 'M';
	const counts = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, Z: 0 };
	while ( i < tokens.length ) {
		if ( /^[a-zA-Z]$/.test( tokens[ i ] ) ) command = tokens[ i++ ];
		const upper = command.toUpperCase(),
			relative = command !== upper;
		if ( upper === 'Z' ) {
			g.closePath();
			x = sx;
			y = sy;
			continue;
		}
		const count = counts[ upper ];
		if ( ! count ) throw Error( 'Unsupported motif path command' );
		const v = tokens.slice( i, i + count ).map( Number );
		i += count;
		if ( upper === 'H' ) {
			x = v[ 0 ] + ( relative ? x : 0 );
			g.lineTo( x, y );
			continue;
		}
		if ( upper === 'V' ) {
			y = v[ 0 ] + ( relative ? y : 0 );
			g.lineTo( x, y );
			continue;
		}
		if ( relative )
			for ( let k = 0; k < count; k += 2 ) {
				v[ k ] += x;
				v[ k + 1 ] += y;
			}
		if ( upper === 'M' ) {
			g.moveTo( ...v );
			sx = v[ 0 ];
			sy = v[ 1 ];
			command = relative ? 'l' : 'L';
		} else if ( upper === 'L' ) g.lineTo( ...v );
		else if ( upper === 'Q' ) g.quadraticCurveTo( ...v );
		else g.bezierCurveTo( ...v );
		x = v[ count - 2 ];
		y = v[ count - 1 ];
	}
}

export function drawMotif(
	g,
	id,
	{
		x = 0,
		y = 0,
		size = 600,
		phase = 4,
		outline = false,
		color = INK,
		weight = 3,
		dashed = false,
	} = {}
) {
	g.save();
	g.translate( x, y );
	g.scale( size / 600, size / 600 );
	g.lineWidth = weight;
	if ( dashed ) g.setLineDash( [ 5, 4 ] );
	g.lineCap = g.lineJoin = 'round';
	for ( const part of motifParts( id ) ) {
		if ( part.step > phase ) continue;
		g.beginPath();
		if ( part.type === 'ellipse' ) g.ellipse( ...part.d, 0, Math.PI * 2 );
		else if ( part.type === 'rect' ) g.rect( ...part.d );
		else tracePath( g, part.d );
		if ( part.fill ) {
			g.fillStyle = outline ? '#ffffff' : part.fill;
			g.fill();
		}
		if ( part.stroke ) {
			g.strokeStyle = color;
			g.stroke();
		}
	}
	g.restore();
}

export function motifCanvas( like, id, size = 720, options = {} ) {
	const c =
		typeof document !== 'undefined'
			? document.createElement( 'canvas' )
			: new like.constructor( size, size );
	c.width = c.height = size;
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, size, size );
	drawMotif( g, id, { ...options, size } );
	return c;
}
