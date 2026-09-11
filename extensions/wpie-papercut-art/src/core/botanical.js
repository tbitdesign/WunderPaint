import { rng } from './geom.js';
import { EXTRA_TREES, EXTRA_PLANTS } from './library.js';
import {
	ellipse,
	leaf,
	curvedLeaf,
	stem,
	ribbon,
	blossom,
	star,
	mapStamps,
	TAU,
} from './paper-shapes.js';
const treeIds = new Set( EXTRA_TREES.map( ( e ) => e.id ) );
const plantIds = new Set( EXTRA_PLANTS.map( ( e ) => e.id ) );
export const isExtraBotanical = ( o ) =>
	( o.kind === 'trees' ? treeIds : plantIds ).has( o.species );

/** A single specimen, authored with its roots at (0,0), a nominal height of one. */
export function botanicalShape( species, r ) {
	const out = [],
		add = ( p ) => out.push( [ p ] ),
		line = ( a, b, c, d, w = 0.025 ) => add( stem( a, b, c, d, w ) );
	const crown = ( x, y, rx, ry, n = 9 ) => {
		add( ellipse( x, y, rx * 0.84, ry * 0.85 ) );
		for ( let i = 0; i < n; i++ ) {
			const a = ( i * TAU ) / n;
			add(
				ellipse(
					x + Math.cos( a ) * rx * 0.64,
					y + Math.sin( a ) * ry * 0.64,
					rx * ( 0.26 + r() * 0.1 ),
					ry * ( 0.3 + r() * 0.1 )
				)
			);
		}
	};
	const leaves = ( n, width = 0.14 ) => {
		for ( let i = 0; i < n; i++ ) {
			const a = -Math.PI + ( ( i + 0.5 ) * Math.PI ) / n,
				len = 0.72 + r() * 0.28;
			add(
				leaf( 0, -0.1, Math.cos( a ) * len, Math.sin( a ) * len, width )
			);
		}
	};
	const flower = ( x, y, size, petals = 6 ) => {
		line( 0, 0, x, y, 0.015 );
		add( leaf( x * 0.4, y * 0.4, x * 0.4 + 0.22, y * 0.4 - 0.16, 0.05 ) );
		add(
			leaf( x * 0.65, y * 0.65, x * 0.65 - 0.2, y * 0.65 - 0.16, 0.05 )
		);
		add( blossom( x, y, size, petals ) );
	};
	const twigs = ( x, y, tx, ty, w, depth ) => {
		add(
			ribbon(
				[
					[ x, y ],
					[ ( x + tx ) / 2 + 0.02 * ( r() - 0.5 ), ( y + ty ) / 2 ],
					[ tx, ty ],
				],
				Math.max( 0.013, w ),
				Math.max( 0.01, w * 0.5 )
			)
		);
		if ( depth <= 0 ) return;
		const dx = tx - x,
			dy = ty - y;
		for ( const side of [ -1, 1 ] ) {
			const a = side * ( 0.4 + r() * 0.35 ),
				c = Math.cos( a ),
				s = Math.sin( a ),
				k = 0.58 + r() * 0.16;
			twigs(
				tx,
				ty,
				tx + ( dx * c - dy * s ) * k,
				ty + ( dx * s + dy * c ) * k,
				w * 0.62,
				depth - 1
			);
		}
	};
	switch ( species ) {
		case 'oldoak':
			add( [
				[ -0.14, 0 ],
				[ -0.08, -0.24 ],
				[ -0.12, -0.42 ],
				[ -0.03, -0.65 ],
				[ 0.1, -0.58 ],
				[ 0.05, -0.33 ],
				[ 0.12, -0.13 ],
				[ 0.2, 0 ],
			] );
			for ( const s of [ -1, 1 ] ) {
				line( 0, -0.4, s * 0.35, -0.68, 0.055 );
				line( s * 0.22, -0.57, s * 0.52, -0.72, 0.024 );
			}
			crown( 0, -0.77, 0.48, 0.25, 12 );
			break;
		case 'willow':
			line( 0, 0, -0.035, -0.74, 0.05 );
			crown( 0, -0.77, 0.42, 0.19 );
			for ( let i = 0; i < 13; i++ ) {
				const x = ( i - 6 ) * 0.064,
					drop = 0.4 + r() * 0.25;
				add(
					ribbon(
						[
							[ x * 0.6, -0.83 ],
							[ x, -0.65 ],
							[ x * 1.06, -0.83 + drop ],
						],
						0.021,
						0.009
					)
				);
				for ( let j = 0; j < 5; j++ ) {
					const y = -0.65 + ( j * drop ) / 7;
					add(
						leaf(
							x,
							y,
							x + 0.035 * ( i % 2 ? 1 : -1 ),
							y + 0.09,
							0.019
						)
					);
				}
			}
			break;
		case 'stonepine':
			line( 0, 0, 0.04, -0.7, 0.048 );
			line( 0.025, -0.4, -0.27, -0.8, 0.028 );
			line( 0.03, -0.46, 0.29, -0.8, 0.024 );
			crown( 0, -0.84, 0.49, 0.16, 11 );
			break;
		case 'cypress':
			line( 0, 0, 0, -0.92, 0.026 );
			add(
				Array.from( { length: 90 }, ( _, i ) => {
					const a = ( i * TAU ) / 90,
						rr = 1 + 0.035 * Math.sin( a * 21 );
					return [
						Math.cos( a ) *
							0.14 *
							( 0.65 + 0.35 * Math.sin( a ) ) *
							rr,
						-0.54 + Math.sin( a ) * 0.46,
					];
				} )
			);
			break;
		case 'olive':
			line( -0.035, 0, 0.04, -0.42, 0.062 );
			line( 0.04, -0.4, -0.2, -0.72, 0.045 );
			line( 0.04, -0.4, 0.27, -0.69, 0.04 );
			crown( -0.2, -0.75, 0.27, 0.16 );
			crown( 0.25, -0.73, 0.27, 0.16 );
			crown( 0.02, -0.88, 0.3, 0.14 );
			break;
		case 'acacia':
			line( 0, 0, 0.07, -0.55, 0.042 );
			for ( const s of [ -1, 1 ] ) {
				line( 0.07, -0.52, s * 0.34, -0.84, 0.027 );
				line( s * 0.2, -0.72, s * 0.47, -0.83, 0.018 );
			}
			crown( 0, -0.87, 0.59, 0.12, 13 );
			break;
		case 'baobab':
			add( [
				[ -0.25, 0 ],
				[ -0.18, -0.22 ],
				[ -0.17, -0.6 ],
				[ -0.09, -0.72 ],
				[ 0.1, -0.72 ],
				[ 0.19, -0.53 ],
				[ 0.2, -0.17 ],
				[ 0.29, 0 ],
			] );
			for ( let i = 0; i < 7; i++ ) {
				const x = ( i - 3 ) * 0.13;
				line( x * 0.27, -0.56, x, -0.85, 0.04 );
				crown( x, -0.89 - ( i % 2 ) * 0.08, 0.12, 0.085, 6 );
			}
			break;
		case 'mangrove':
			for ( let i = 0; i < 7; i++ ) {
				const x = ( i - 3 ) * 0.11;
				add(
					ribbon(
						[
							[ 0, -0.43 ],
							[ x * 0.55, -0.22 ],
							[ x, 0 ],
						],
						0.018,
						0.012
					)
				);
			}
			line( 0, -0.2, 0.02, -0.72, 0.045 );
			crown( 0, -0.8, 0.42, 0.2, 10 );
			break;
		case 'bamboo':
			for ( let i = 0; i < 3; i++ ) {
				const x = ( i - 1 ) * 0.19,
					h = 0.79 + r() * 0.18,
					slant = ( i - 1 ) * 0.045;
				line( x, 0, x + slant, -h, 0.017 );
				for ( let j = 1; j <= 5; j++ ) {
					const t = j / 6,
						y = -h * t,
						xx = x + slant * t;
					add( ellipse( xx, y, 0.027, 0.012, 12 ) );
					if ( j % 2 !== i % 2 ) continue;
					const side = i === 0 ? -1 : i === 2 ? 1 : j % 2 ? 1 : -1;
					line( xx, y, xx + side * 0.12, y - 0.04, 0.013 );
					add(
						curvedLeaf(
							xx + side * 0.04,
							y - 0.015,
							xx + side * 0.16,
							y - 0.19,
							xx + side * 0.29,
							y - 0.17,
							0.034
						)
					);
					add(
						curvedLeaf(
							xx + side * 0.075,
							y - 0.025,
							xx + side * 0.22,
							y + 0.01,
							xx + side * 0.29,
							y + 0.1,
							0.027
						)
					);
				}
			}
			break;
		case 'banana':
			line( -0.02, 0, 0, -0.66, 0.032 );
			line( 0.025, 0, 0.015, -0.64, 0.025 );
			for ( const [ cx, cy, tx, ty, width ] of [
				[ -0.55, -1.13, -0.76, -0.48, 0.074 ],
				[ -0.31, -1.11, -0.44, -0.73, 0.069 ],
				[ 0.09, -0.82, 0.14, -1.04, 0.063 ],
				[ 0.44, -1.1, 0.69, -0.61, 0.082 ],
				[ 0.47, -0.78, 0.67, -0.29, 0.068 ],
			] )
				add( curvedLeaf( 0, -0.58, cx, cy, tx, ty, width ) );
			break;
		case 'cherry':
			line( 0, 0, -0.025, -0.68, 0.045 );
			line( 0, -0.45, -0.34, -0.7, 0.028 );
			line( 0, -0.47, 0.3, -0.74, 0.03 );
			for ( let i = 0; i < 11; i++ ) {
				const a = ( i * TAU ) / 11,
					x = Math.cos( a ) * 0.32,
					y = -0.76 + Math.sin( a ) * 0.16;
				add( blossom( x, y, 0.14 + r() * 0.045, 5, 0.77 ) );
			}
			crown( 0, -0.77, 0.22, 0.14, 7 );
			break;
		case 'magnolia':
			twigs( 0, 0, 0.02, -0.46, 0.044, 2 );
			for ( const [ x, y ] of [
				[ -0.31, -0.69 ],
				[ -0.14, -0.86 ],
				[ 0.13, -0.88 ],
				[ 0.31, -0.67 ],
				[ 0.025, -0.64 ],
			] ) {
				line( 0, -0.38, x, y, 0.018 );
				for ( let j = 0; j < 3; j++ )
					add(
						curvedLeaf(
							x,
							y,
							x + ( j - 1 ) * 0.1,
							y - 0.19,
							x + ( j - 1 ) * 0.12,
							y - 0.2,
							0.048
						)
					);
			}
			break;
		case 'apple':
			line( 0, 0, 0, -0.65, 0.05 );
			crown( 0, -0.72, 0.34, 0.26, 10 );
			for ( let i = 0; i < 7; i++ ) {
				const a = ( i * TAU ) / 7,
					x = Math.cos( a ) * 0.31,
					y = -0.72 + Math.sin( a ) * 0.24;
				line( x, y, x, y + 0.07, 0.01 );
				add( blossom( x, y + 0.095, 0.063, 3, 0.85 ) );
			}
			break;
		case 'sequoia':
			add( [
				[ -0.075, 0 ],
				[ -0.04, -0.6 ],
				[ 0.04, -0.6 ],
				[ 0.075, 0 ],
			] );
			for ( let i = 0; i < 8; i++ ) {
				const y = -0.96 + i * 0.095,
					w = 0.04 + i * 0.035;
				add( [
					[ -w, y + 0.13 ],
					[ -w * 0.53, y + 0.04 ],
					[ 0, y - 0.07 ],
					[ w * 0.53, y + 0.04 ],
					[ w, y + 0.13 ],
					[ w * 0.24, y + 0.11 ],
					[ 0, y + 0.14 ],
					[ -w * 0.24, y + 0.11 ],
				] );
			}
			break;
		case 'wintertree':
			twigs( 0, 0, 0.015, -0.4, 0.041, 4 );
			twigs( 0.003, -0.2, -0.2, -0.5, 0.026, 3 );
			twigs( 0.01, -0.3, 0.21, -0.57, 0.021, 3 );
			break;
		case 'fern':
			for ( let i = 0; i < 5; i++ ) {
				const a = -Math.PI * 0.84 + i * Math.PI * 0.17,
					len = 0.7 + ( i === 2 ? 0.25 : 0.08 ),
					dx = Math.cos( a ),
					dy = Math.sin( a ),
					x = dx * len,
					y = dy * len;
				line( 0, 0, x, y, 0.021 );
				for ( let j = 2; j <= 8; j++ ) {
					const t = j / 9,
						px = x * t,
						py = y * t,
						ll = 0.14 * ( 1 - t ) + 0.045;
					for ( const side of [ -1, 1 ] )
						add(
							leaf(
								px,
								py,
								px - dy * side * ll + dx * 0.07,
								py + dx * side * ll + dy * 0.07,
								0.023
							)
						);
				}
			}
			break;
		case 'monstera':
		case 'elephantear':
			for ( let i = 0; i < 3; i++ ) {
				const x = ( i - 1 ) * 0.29,
					y = -0.53 - ( i === 1 ? 0.25 : 0 );
				line( 0, 0, x, y + 0.16, 0.024 );
				const ring = leaf(
					x,
					y + 0.23,
					x + ( i - 1 ) * 0.12,
					y - 0.23,
					0.21,
					species === 'monstera' ? 0.08 : 0
				);
				if ( species === 'monstera' ) {
					out.push( [
						ring,
						...[ -1, 1 ].map( ( s ) =>
							ellipse(
								x + s * 0.075,
								y,
								0.025,
								0.06,
								16,
								-s * 0.35
							)
						),
					] );
				} else add( ring );
			}
			break;
		case 'agave':
		case 'aloe':
			leaves(
				species === 'agave' ? 9 : 7,
				species === 'agave' ? 0.055 : 0.092
			);
			break;
		case 'saguaro':
			add(
				ribbon(
					[
						[ 0, 0 ],
						[ 0, -0.92 ],
					],
					0.085,
					0.07
				)
			);
			add( ellipse( 0, -0.92, 0.07 ) );
			for ( const s of [ -1, 1 ] ) {
				const y = s < 0 ? -0.48 : -0.34;
				add(
					ribbon(
						[
							[ 0, y ],
							[ s * 0.22, y ],
							[ s * 0.22, y - 0.3 ],
						],
						0.055,
						0.046
					)
				);
				add( ellipse( s * 0.22, y - 0.3, 0.046 ) );
			}
			break;
		case 'pricklypear':
			add( ellipse( 0, -0.18, 0.13, 0.22 ) );
			add( ellipse( 0.015, -0.53, 0.16, 0.22 ) );
			add( ellipse( -0.21, -0.47, 0.13, 0.18, 36, -0.5 ) );
			add( ellipse( 0.23, -0.69, 0.12, 0.19, 36, 0.4 ) );
			add( ellipse( -0.14, -0.82, 0.12, 0.17 ) );
			add( blossom( -0.14, -0.99, 0.052, 5 ) );
			break;
		case 'succulent':
			for ( let k = 0; k < 2; k++ )
				for ( let i = 0; i < 7; i++ ) {
					const a = ( i * TAU ) / 7 + k * 0.4,
						rad = k ? 0.24 : 0.46;
					add(
						leaf(
							0,
							-0.17,
							Math.cos( a ) * rad,
							-0.17 + Math.sin( a ) * rad * 0.65,
							0.08
						)
					);
				}
			add( ellipse( 0, -0.17, 0.08 ) );
			break;
		case 'lotus':
			add( ellipse( 0, -0.025, 0.45, 0.075 ) );
			line( 0, 0, 0, -0.47, 0.017 );
			for ( let i = 0; i < 7; i++ ) {
				const a = -Math.PI + 0.3 + ( i * ( Math.PI - 0.6 ) ) / 6;
				add(
					leaf(
						0,
						-0.38,
						Math.cos( a ) * 0.3,
						-0.38 + Math.sin( a ) * 0.31,
						0.08
					)
				);
			}
			break;
		case 'waterlily': {
			const pad = ellipse( 0, -0.07, 0.45, 0.15, 60 );
			pad.splice( 2, 0, [ 0.03, -0.07 ] );
			add( pad );
			for ( let i = 0; i < 8; i++ ) {
				const a = ( i * TAU ) / 8;
				add(
					leaf(
						0.08,
						-0.19,
						0.08 + Math.cos( a ) * 0.17,
						-0.19 + Math.sin( a ) * 0.08 - 0.055,
						0.045
					)
				);
			}
			break;
		}
		case 'iris':
			add( leaf( -0.08, 0, -0.2, -0.8, 0.03 ) );
			add( leaf( 0.04, 0, 0.24, -0.67, 0.035 ) );
			line( 0, 0, 0.015, -0.76, 0.015 );
			for ( let i = 0; i < 3; i++ ) {
				const a = ( i * TAU ) / 3 - Math.PI / 2;
				add(
					leaf(
						0.015,
						-0.77,
						0.015 + Math.cos( a ) * 0.22,
						-0.77 + Math.sin( a ) * 0.2,
						0.07
					)
				);
			}
			break;
		case 'lavender':
		case 'lupine':
		case 'foxglove': {
			const count = species === 'lavender' ? 5 : 3;
			for ( let i = 0; i < count; i++ ) {
				const x =
						( i - ( count - 1 ) / 2 ) *
						( species === 'lavender' ? 0.18 : 0.24 ),
					y = -0.78 - r() * 0.14;
				line( x * 0.25, 0, x, y, 0.016 );
				for ( let j = 0; j < 7; j++ ) {
					const yy = y + j * 0.047,
						ww =
							0.017 +
							j * ( species === 'lupine' ? 0.006 : 0.0034 );
					if ( species === 'foxglove' ) {
						const side = j % 2 ? 1 : -1;
						add(
							curvedLeaf(
								x,
								yy,
								x + side * 0.13,
								yy - 0.04,
								x + side * 0.11,
								yy + 0.065,
								0.04
							)
						);
					} else {
						for ( const side of [ -1, 1 ] )
							add(
								ellipse(
									x + side * ww * 0.75,
									yy,
									ww,
									0.02,
									16,
									side * 0.4
								)
							);
					}
				}
				for ( const side of [ -1, 1 ] )
					add(
						leaf(
							x * 0.5,
							-0.2,
							x * 0.5 + side * 0.14,
							-0.35,
							0.029
						)
					);
			}
			break;
		}

		case 'sunflower':
			flower( 0, -0.72, 0.23, 16 );
			out[ out.length - 1 ] = [
				blossom( 0, -0.72, 0.23, 16, 0.7 ),
				ellipse( 0, -0.72, 0.09, 0.09, 32 ),
			];
			break;
		case 'poppy':
			flower( 0.05, -0.76, 0.18, 4 );
			line( -0.015, -0.2, -0.25, -0.65, 0.012 );
			add( ellipse( -0.25, -0.67, 0.05, 0.07 ) );
			break;
		case 'daisy':
			flower( 0, -0.78, 0.16, 12 );
			flower( -0.26, -0.5, 0.12, 11 );
			break;
		case 'bellflower':
			line( 0, 0, 0.08, -0.94, 0.013 );
			for ( let i = 0; i < 5; i++ ) {
				const s = i % 2 ? 1 : -1,
					y = -0.84 + i * 0.13;
				line( 0.06, y, 0.06 + s * 0.13, y + 0.035, 0.009 );
				add( [
					[ 0.06 + s * 0.13 - 0.04, y + 0.025 ],
					[ 0.06 + s * 0.13 + 0.04, y + 0.025 ],
					[ 0.06 + s * 0.13 + 0.085, y + 0.16 ],
					[ 0.06 + s * 0.13, y + 0.13 ],
					[ 0.06 + s * 0.13 - 0.085, y + 0.16 ],
				] );
			}
			break;
		case 'thistle':
			line( 0, 0, 0, -0.76, 0.018 );
			add( star( 0, -0.76, 0.14, 0.68, 15 ) );
			add( ellipse( 0, -0.72, 0.095, 0.09 ) );
			for ( const s of [ -1, 1 ] )
				add( leaf( 0, -0.25, s * 0.24, -0.48, 0.07, 0.4 ) );
			break;
		case 'mushroom':
			for ( const [ x, h ] of [
				[ -0.18, 0.57 ],
				[ 0.16, 0.83 ],
			] ) {
				add(
					ribbon(
						[
							[ x, 0 ],
							[ x + 0.04, -h * 0.65 ],
						],
						0.055,
						0.035
					)
				);
				const cap = [];
				for ( let i = 0; i <= 40; i++ ) {
					const a = Math.PI + ( i * Math.PI ) / 40;
					cap.push( [
						x + 0.04 + Math.cos( a ) * h * 0.42,
						-h * 0.6 + Math.sin( a ) * h * 0.4,
					] );
				}
				out.push( [
					cap,
					...[ -1, 0, 1 ].map( ( j ) =>
						ellipse(
							x + 0.04 + j * h * 0.2,
							-h * 0.7 - ( j === 0 ? h * 0.1 : 0 ),
							h * 0.04
						)
					),
				] );
			}
			break;
		case 'cattail':
			for ( let i = 0; i < 3; i++ ) {
				const x = ( i - 1 ) * 0.16,
					h = 0.7 + r() * 0.26;
				line( x * 0.5, 0, x, -h, 0.012 );
				add( ellipse( x, -h + 0.13, 0.035, 0.15 ) );
				add( leaf( x * 0.5, 0, x + 0.16, -h * 0.65, 0.025 ) );
			}
			break;
		case 'pampas':
			for ( let i = 0; i < 7; i++ ) {
				const x = ( i - 3 ) * 0.12,
					h = 0.65 + r() * 0.26;
				line( 0, 0, x, -h, 0.009 );
				add(
					leaf( x * 0.7, -h * 0.6, x * 1.15, -h - 0.1, 0.055, 0.18 )
				);
			}
			break;
		case 'ivy':
		case 'rosevine': {
			const pts = Array.from( { length: 30 }, ( _, i ) => [
				Math.sin( ( i / 29 ) * Math.PI * 2 ) * 0.12,
				-i / 29,
			] );
			add( ribbon( pts, 0.019, 0.009 ) );
			for ( let i = 1; i <= 8; i++ ) {
				const y = -i / 9,
					x = Math.sin( ( i / 9 ) * TAU ) * 0.12,
					s = i % 2 ? 1 : -1;
				line( x, y, x + s * 0.18, y - 0.055, 0.014 );
				add(
					species === 'ivy'
						? [
								[ 0, -0.14 ],
								[ 0.046, -0.05 ],
								[ 0.13, -0.07 ],
								[ 0.088, 0.01 ],
								[ 0.08, 0.07 ],
								[ 0, 0.1 ],
								[ -0.08, 0.07 ],
								[ -0.088, 0.01 ],
								[ -0.13, -0.07 ],
								[ -0.046, -0.05 ],
						  ].map( ( [ px, py ] ) => [
								x + s * 0.18 + px,
								y - 0.055 + py,
						  ] )
						: leaf( x, y, x + s * 0.22, y - 0.14, 0.047 )
				);
				if ( species === 'rosevine' && i % 3 === 0 )
					out.push( [
						blossom( x - s * 0.06, y - 0.05, 0.105, 7, 0.85 ),
						blossom( x - s * 0.06, y - 0.05, 0.044, 5, 0.78 ),
					] );
			}
			break;
		}
	}
	return out;
}

/** New species use the same count/spread/variation semantics as the original clusters. */
export function botanicalCluster( o, w, h ) {
	const r = rng( o.seed + ( o.kind === 'trees' ? 31 : 87 ) ),
		stamps = [],
		n = o.count,
		vary = o.vary / 100;
	for ( let i = 0; i < n; i++ ) {
		const t = n === 1 ? 0.5 : ( i + 0.5 + ( r() - 0.5 ) * 0.6 ) / n,
			x = ( o.x + ( ( t - 0.5 ) * o.spread ) / 100 ) * w;
		const size =
				( o.scale / 100 ) * h * ( 1 - vary * 0.3 + r() * vary * 0.6 ),
			lean = ( o.lean || 0 ) / 100;
		stamps.push(
			...mapStamps( botanicalShape( o.species, r ), ( [ px, py ] ) => [
				x + ( px * ( o.flip ? -1 : 1 ) - py * lean ) * size,
				o.y * h + py * size,
			] )
		);
	}
	return stamps;
}
