import { rng } from './geom.js';
import {
	ellipse,
	rect,
	star,
	ribbon,
	stem,
	mapStamps,
	TAU,
} from './paper-shapes.js';

/** Free landforms, including real openings and separate islands, never a disguised height profile. */
export function landformShape( o ) {
	const r = rng( o.seed ),
		out = [],
		add = ( p ) => out.push( [ p ] ),
		n = 3 + Math.round( ( o.detail ?? 45 ) / 18 );
	switch ( o.variant ) {
		case 'canyon':
			add( [
				[ -1, 0 ],
				[ -1, -0.87 ],
				[ -0.74, -0.96 ],
				[ -0.52, -0.68 ],
				[ -0.43, -0.71 ],
				[ -0.23, -0.44 ],
				[ -0.31, -0.27 ],
				[ -0.13, 0 ],
			] );
			add( [
				[ 0.18, 0 ],
				[ 0.3, -0.3 ],
				[ 0.2, -0.48 ],
				[ 0.47, -0.72 ],
				[ 0.57, -0.66 ],
				[ 0.72, -0.92 ],
				[ 1, -0.8 ],
				[ 1, 0 ],
			] );
			break;
		case 'mesa':
			for ( let i = 0; i < 3; i++ ) {
				const x = -0.85 + i * 0.56,
					h = 0.58 + r() * 0.38;
				add( [
					[ x - 0.28, 0 ],
					[ x - 0.18, -h * 0.43 ],
					[ x - 0.12, -h ],
					[ x + 0.22, -h ],
					[ x + 0.27, -h * 0.36 ],
					[ x + 0.39, 0 ],
				] );
			}
			break;
		case 'cliff':
			add( [
				[ -1, 0 ],
				[ -1, -0.87 ],
				[ -0.45, -0.95 ],
				[ 0.05, -0.86 ],
				[ 0.16, -0.91 ],
				[ 0.42, -0.69 ],
				[ 0.3, -0.62 ],
				[ 0.35, -0.42 ],
				[ 0.66, -0.22 ],
				[ 1, 0 ],
			] );
			break;
		case 'fjord':
			add( [
				[ -1, 0 ],
				[ -1, -0.63 ],
				[ -0.77, -0.94 ],
				[ -0.4, -0.5 ],
				[ -0.19, -0.24 ],
				[ -0.37, -0.12 ],
				[ -0.14, 0 ],
			] );
			add( [
				[ 0.27, 0 ],
				[ 0.42, -0.19 ],
				[ 0.21, -0.29 ],
				[ 0.53, -0.67 ],
				[ 0.72, -1 ],
				[ 1, -0.59 ],
				[ 1, 0 ],
			] );
			break;
		case 'glacier': {
			const top = [];
			for ( let i = 0; i <= 20; i++ )
				top.push( [
					-1 + i * 0.1,
					-0.38 - r() * 0.36 - ( i > 5 && i < 16 ? 0.16 : 0 ),
				] );
			const holes = [];
			for ( let i = 0; i < 6; i++ ) {
				const x = -0.7 + i * 0.28;
				holes.push( [
					[ x, -0.38 ],
					[ x + 0.026, -0.1 ],
					[ x + 0.07, -0.53 ],
				] );
			}
			out.push( [ [ [ -1, 0 ], ...top, [ 1, 0 ] ], ...holes ] );
			break;
		}
		case 'waterfall': {
			const left = [],
				right = [];
			for ( let i = 0; i <= 60; i++ ) {
				const t = i / 60,
					y = -1 + t,
					cx = 0.045 * Math.sin( t * 6 ),
					width = 0.16 + 0.03 * Math.sin( t * 9 ) + t * 0.025;
				left.push( [ cx - width, y ] );
				right.push( [ cx + width, y ] );
			}
			const holes = [];
			for ( const [ x, y, len ] of [
				[ -0.07, -0.9, 0.31 ],
				[ 0.065, -0.72, 0.24 ],
				[ -0.045, -0.43, 0.29 ],
			] )
				holes.push(
					ribbon(
						[
							[ x, y ],
							[ x + 0.014, y + len * 0.5 ],
							[ x - 0.006, y + len ],
						],
						0.012,
						0.007
					)
				);
			out.push( [ [ ...left, ...right.reverse() ], ...holes ] );
			add( ellipse( 0, -0.014, 0.42, 0.067 ) );
			for ( const side of [ -1, 1 ] )
				for ( let i = 0; i < 3; i++ )
					add(
						ellipse(
							side * ( 0.24 + i * 0.057 ),
							-0.1 - i * 0.058,
							0.018,
							0.034,
							16,
							side * 0.5
						)
					);
			break;
		}
		case 'riverbend': {
			const pts = Array.from( { length: 50 }, ( _, i ) => {
				const t = i / 49;
				return [
					Math.sin( t * 2 * Math.PI ) * ( 0.03 + t * 0.21 ),
					-1 + t,
				];
			} );
			add( ribbon( pts, 0.018, 0.115 ) );
			break;
		}
		case 'terraces':
			for ( let i = 0; i < n; i++ ) {
				const y = -0.85 + ( i * 0.85 ) / n,
					w = 0.35 + ( i * 0.65 ) / n;
				const pts = Array.from( { length: 45 }, ( _, j ) => {
					const x = -w + ( j * 2 * w ) / 44;
					return [ x, y + 0.11 * Math.sin( x * 4 + i * 0.6 ) ];
				} );
				add( ribbon( pts, 0.022 + i * 0.002 ) );
			}
			break;
		case 'fields':
			for ( let i = 0; i < n; i++ ) {
				const x = -0.95 + ( i * 1.9 ) / n;
				add( [
					[ x, 0 ],
					[ x + 1.4 / n, 0 ],
					[ x * 0.32 + 0.18, -0.9 ],
					[ x * 0.32 + 0.18 - ( 0.32 * 1.4 ) / n, -0.9 ],
				] );
			}
			break;
		case 'rockarch': {
			const outer = [
				[ -1, 0 ],
				[ -0.94, -0.52 ],
				[ -0.78, -0.78 ],
				[ -0.42, -0.94 ],
				[ 0.04, -0.97 ],
				[ 0.54, -0.88 ],
				[ 0.8, -0.63 ],
				[ 1, 0 ],
			];
			const hole = [
				[ -0.61, 0 ],
				[ -0.6, -0.27 ],
				[ -0.49, -0.52 ],
				[ -0.24, -0.66 ],
				[ 0.17, -0.65 ],
				[ 0.45, -0.51 ],
				[ 0.58, -0.2 ],
				[ 0.59, 0 ],
			];
			out.push( [ outer, hole ] );
			break;
		}
		case 'sandbank':
			add(
				Array.from( { length: 90 }, ( _, i ) => {
					const a = ( i * TAU ) / 90;
					return [
						Math.cos( a ) * ( 1 + 0.12 * Math.sin( a * 3 ) ),
						-0.12 +
							Math.sin( a ) *
								0.11 *
								( 1 + 0.2 * Math.cos( a * 4 ) ),
					];
				} )
			);
			break;
		case 'islands':
			for ( let i = 0; i < n; i++ ) {
				const x = -0.8 + ( i * 1.6 ) / ( n - 1 ),
					y = -0.12 - r() * 0.48,
					rx = 0.11 + r() * 0.13;
				add( [
					[ x - rx, y ],
					[ x - rx * 0.6, y - 0.12 - r() * 0.12 ],
					[ x + rx * 0.25, y - 0.18 ],
					[ x + rx, y ],
					[ x + 0.03, y + 0.055 ],
				] );
			}
			break;
		case 'volcano':
			add( [
				[ -1, 0 ],
				[ -0.58, -0.34 ],
				[ -0.25, -0.87 ],
				[ -0.15, -0.93 ],
				[ 0, -0.87 ],
				[ 0.15, -0.93 ],
				[ 0.28, -0.85 ],
				[ 0.57, -0.35 ],
				[ 1, 0 ],
			] );
			break;
		case 'cave': {
			const outer = [
				[ -1, 0 ],
				[ -0.94, -0.49 ],
				[ -0.68, -0.91 ],
				[ -0.22, -1 ],
				[ 0.44, -0.91 ],
				[ 0.91, -0.55 ],
				[ 1, 0 ],
			];
			const hole = [
				[ -0.64, 0 ],
				[ -0.58, -0.33 ],
				[ -0.44, -0.51 ],
				[ -0.25, -0.7 ],
				[ -0.06, -0.61 ],
				[ 0.12, -0.7 ],
				[ 0.22, -0.47 ],
				[ 0.46, -0.51 ],
				[ 0.57, -0.24 ],
				[ 0.65, 0 ],
			];
			out.push( [ outer, hole ] );
			break;
		}
	}
	return out;
}

/** Buildings, vessels and sky motifs have their own silhouettes and negative space. */
export function decorationShape( o ) {
	const r = rng( o.seed ),
		out = [],
		add = ( p ) => out.push( [ p ] ),
		line = ( x, y, tx, ty, w = 0.012 ) => add( stem( x, y, tx, ty, w ) );
	const n = 3 + Math.round( ( o.detail ?? 45 ) / 10 );
	switch ( o.variant ) {
		case 'lighthouse':
			out.push( [
				[
					[ -0.19, 0 ],
					[ -0.11, -0.76 ],
					[ 0.11, -0.76 ],
					[ 0.19, 0 ],
				],
				rect( -0.037, -0.6, 0.074, 0.13 ),
				rect( -0.045, -0.18, 0.09, 0.18 ),
			] );
			add( rect( -0.19, -0.77, 0.38, 0.042 ) );
			out.push( [
				rect( -0.125, -0.95, 0.25, 0.18 ),
				rect( -0.079, -0.915, 0.058, 0.11 ),
				rect( 0.021, -0.915, 0.058, 0.11 ),
			] );
			add( [
				[ -0.18, -0.96 ],
				[ 0, -1.065 ],
				[ 0.18, -0.96 ],
			] );
			break;
		case 'cabin':
			out.push( [
				rect( -0.48, -0.52, 0.96, 0.52 ),
				rect( -0.08, -0.29, 0.17, 0.29 ),
				rect( -0.34, -0.36, 0.15, 0.14 ),
				rect( 0.2, -0.36, 0.15, 0.14 ),
			] );
			add( [
				[ -0.6, -0.49 ],
				[ 0, -0.92 ],
				[ 0.6, -0.49 ],
				[ 0.45, -0.49 ],
				[ 0, -0.8 ],
				[ -0.45, -0.49 ],
			] );
			add( rect( 0.27, -0.9, 0.095, 0.31 ) );
			break;
		case 'bridge': {
			const outer = [
					[ -1, 0 ],
					[ -1, -0.31 ],
				],
				hole = [
					[ -0.77, 0 ],
					[ -0.77, -0.13 ],
				];
			for ( let i = 0; i <= 48; i++ ) {
				const x = -1 + i / 24;
				outer.push( [ x, -0.31 - 0.25 * ( 1 - x * x ) ] );
				const xx = -0.77 + ( i * 0.77 ) / 24;
				hole.push( [ xx, -0.13 - 0.22 * ( 1 - ( xx / 0.77 ) ** 2 ) ] );
			}
			outer.push( [ 1, 0 ] );
			hole.push( [ 0.77, 0 ] );
			out.push( [ outer, hole ] );
			for ( let i = 0; i < 11; i++ ) {
				const x = -1 + i * 0.2,
					y = -0.31 - 0.25 * ( 1 - x * x );
				line( x, y, x, y - 0.14, 0.017 );
			}
			add(
				ribbon(
					Array.from( { length: 40 }, ( _, i ) => {
						const x = -1 + ( 2 * i ) / 39;
						return [ x, -0.45 - 0.25 * ( 1 - x * x ) ];
					} ),
					0.025
				)
			);
			break;
		}
		case 'boardwalk':
			for ( let i = 0; i < 11; i++ ) {
				const t = i / 10,
					y = -0.95 + t * 0.95,
					ww = 0.07 + t * 0.47;
				add( [
					[ -ww, y ],
					[ ww, y ],
					[ ww + 0.016, y + 0.036 + t * 0.018 ],
					[ -ww - 0.016, y + 0.036 + t * 0.018 ],
				] );
			}
			for ( const s of [ -1, 1 ] ) {
				line( s * 0.09, -0.96, s * 0.52, 0, 0.014 );
				line( s * 0.1, -1.08, s * 0.55, -0.19, 0.018 );
				for ( let i = 0; i < 5; i++ ) {
					const t = i / 4;
					line(
						s * ( 0.1 + t * 0.45 ),
						-1.08 + t * 0.89,
						s * ( 0.09 + t * 0.43 ),
						-0.96 + t * 0.96,
						0.015
					);
				}
			}
			break;
		case 'rowboat':
			add( [
				[ -0.65, -0.24 ],
				[ 0.63, -0.24 ],
				[ 0.4, 0 ],
				[ -0.38, 0 ],
			] );
			line( -0.43, -0.26, 0.43, -0.26, 0.022 );
			line( -0.22, -0.16, 0.51, -0.61, 0.025 );
			add( ellipse( 0.51, -0.61, 0.11, 0.035, 20, -0.55 ) );
			break;
		case 'sailboat':
			add( [
				[ -0.6, -0.19 ],
				[ 0.59, -0.19 ],
				[ 0.4, 0 ],
				[ -0.4, 0 ],
			] );
			line( 0.02, -0.21, 0.02, -1.05, 0.02 );
			add( [
				[ -0.02, -1 ],
				[ -0.02, -0.27 ],
				[ -0.56, -0.27 ],
			] );
			add( [
				[ 0.08, -0.87 ],
				[ 0.55, -0.3 ],
				[ 0.08, -0.3 ],
			] );
			break;
		case 'windmill':
			out.push( [
				[
					[ -0.25, 0 ],
					[ -0.16, -0.7 ],
					[ 0.16, -0.7 ],
					[ 0.25, 0 ],
				],
				rect( -0.04, -0.2, 0.08, 0.2 ),
			] );
			add( [
				[ -0.21, -0.7 ],
				[ 0, -0.9 ],
				[ 0.21, -0.7 ],
			] );
			for ( let i = 0; i < 4; i++ ) {
				const a = ( i * Math.PI ) / 2 + Math.PI / 4;
				add(
					[
						[ 0.04, -0.73 ],
						[ 0.52, -0.8 ],
						[ 0.52, -0.92 ],
						[ 0.12, -0.87 ],
					].map( ( [ x, y ] ) => [
						x * Math.cos( a ) - ( y + 0.76 ) * Math.sin( a ),
						-0.76 +
							x * Math.sin( a ) +
							( y + 0.76 ) * Math.cos( a ),
					] )
				);
			}
			add( ellipse( 0, -0.76, 0.05 ) );
			break;
		case 'waterwheel':
			out.push( [
				ellipse( 0, -0.47, 0.47 ),
				ellipse( 0, -0.47, 0.37 ),
			] );
			for ( let i = 0; i < 10; i++ ) {
				const a = ( i * TAU ) / 10;
				line(
					0,
					-0.47,
					Math.cos( a ) * 0.48,
					-0.47 + Math.sin( a ) * 0.48,
					0.022
				);
				const x = Math.cos( a ) * 0.49,
					y = -0.47 + Math.sin( a ) * 0.49;
				add( rect( x - 0.037, y - 0.036, 0.074, 0.072 ) );
			}
			add( ellipse( 0, -0.47, 0.07 ) );
			break;
		case 'starfield':
			for ( let i = 0; i < n * 4; i++ ) {
				const x = ( r() - 0.5 ) * 2,
					y = -r(),
					s = 0.012 + r() * 0.038;
				add( star( x, y, s, 0.3, 4 ) );
			}
			break;
		case 'aurora':
			for ( let i = 0; i < 3; i++ ) {
				const pts = Array.from( { length: 80 }, ( _, j ) => {
					const t = j / 79;
					return [
						-1 + 2 * t,
						-0.45 - i * 0.19 + Math.sin( t * 7 + i * 0.7 ) * 0.11,
					];
				} );
				add( ribbon( pts, 0.025 + i * 0.013, 0.04 ) );
				for ( let j = 0; j < n * 2; j++ ) {
					const t = j / ( n * 2 ),
						x = -1 + t * 2,
						y =
							-0.45 -
							i * 0.19 +
							Math.sin( t * 7 + i * 0.7 ) * 0.11;
					add(
						ribbon(
							[
								[ x, y ],
								[ x + 0.06, y - 0.12 - r() * 0.1 ],
							],
							0.009,
							0.001
						)
					);
				}
			}
			break;
		case 'lantern':
			line( 0, -1.02, 0, -0.82, 0.016 );
			add( rect( -0.12, -0.87, 0.24, 0.045 ) );
			out.push( [
				ellipse( 0, -0.59, 0.25, 0.28 ),
				ellipse( -0.09, -0.59, 0.035, 0.21 ),
				ellipse( 0.09, -0.59, 0.035, 0.21 ),
			] );
			add( rect( -0.12, -0.34, 0.24, 0.044 ) );
			line( 0, -0.31, 0, -0.12, 0.016 );
			add( [
				[ -0.05, -0.12 ],
				[ 0.05, -0.12 ],
				[ 0.065, 0 ],
				[ -0.065, 0 ],
			] );
			break;
		case 'gate':
			for ( const s of [ -1, 1 ] ) {
				add( rect( s < 0 ? -0.51 : 0.45, -0.68, 0.06, 0.68 ) );
				add( ellipse( s * 0.48, -0.71, 0.055 ) );
			}
			for ( let i = 0; i < 9; i++ ) {
				const x = -0.4 + i * 0.1;
				line( x, 0, x, -0.5 - 0.12 * ( 1 - ( x / 0.4 ) ** 2 ), 0.018 );
				add(
					star(
						x,
						-0.5 - 0.12 * ( 1 - ( x / 0.4 ) ** 2 ),
						0.043,
						0.4,
						4
					)
				);
			}
			add( rect( -0.45, -0.37, 0.9, 0.038 ) );
			add( rect( -0.45, -0.12, 0.9, 0.038 ) );
			break;
	}
	return out;
}
export function landmarkStamps( o, w, h ) {
	const shape =
			o.kind === 'landform' ? landformShape( o ) : decorationShape( o ),
		size = ( o.scale * h ) / 100;
	return mapStamps( shape, ( [ x, y ] ) => [
		o.x * w + x * size * ( o.stretch / 100 ) * ( o.flip ? -1 : 1 ),
		o.y * h + y * size,
	] );
}
