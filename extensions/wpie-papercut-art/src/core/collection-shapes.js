/** Original paper silhouettes built from the library's existing polygon primitives. */
import {
	ellipse,
	rect,
	leaf,
	stem,
	blossom,
	ribbon,
	TAU,
} from './paper-shapes.js';

export function collectionBotanical( species, random ) {
	const out = [];
	const add = ( ring ) => out.push( [ ring ] );
	const line = ( x, y, tx, ty, width = 0.014 ) =>
		add( stem( x, y, tx, ty, width ) );
	if ( species === 'ginkgo' ) {
		line( 0, 0, 0, -0.96, 0.034 );
		for ( let i = 0; i < 9; i++ ) {
			const side = i % 2 ? 1 : -1;
			const y = -0.25 - i * 0.074;
			const x = side * ( 0.22 + ( 8 - i ) * 0.024 );
			line( 0, y + 0.14, x, y, 0.015 );
			const fan = [ [ x, y ] ];
			for ( let k = 0; k <= 28; k++ ) {
				const a = Math.PI * ( 1.08 + ( k / 28 ) * 0.84 );
				const radius =
					0.2 *
					( 1 - 0.16 * Math.exp( -( ( ( k - 14 ) / 2 ) ** 2 ) ) );
				fan.push( [
					x + Math.cos( a ) * radius,
					y + Math.sin( a ) * radius,
				] );
			}
			add( fan );
		}
	} else if ( species === 'eucalyptus' ) {
		for ( const side of [ -1, 1 ] ) {
			const tip = side * 0.23;
			line( 0, 0, tip, -0.97, 0.023 );
			for ( let i = 0; i < 6; i++ ) {
				const y = -0.2 - i * 0.13;
				const x = -y * tip;
				for ( const direction of [ -1, 1 ] ) {
					const radius = 0.095 - i * 0.006;
					add(
						ellipse(
							x + direction * radius * 0.85,
							y,
							radius,
							radius * 0.76,
							32,
							direction * -0.3
						)
					);
				}
			}
		}
	} else if ( species === 'tulip' ) {
		line( 0, 0, 0.025, -0.73, 0.019 );
		add( leaf( 0, -0.04, -0.25, -0.64, 0.064 ) );
		add( leaf( 0.012, -0.2, 0.24, -0.77, 0.053 ) );
		add( [
			[ -0.18, -1 ],
			[ -0.08, -0.91 ],
			[ 0.025, -1.03 ],
			[ 0.12, -0.91 ],
			[ 0.22, -1 ],
			[ 0.19, -0.79 ],
			[ 0.11, -0.71 ],
			[ -0.04, -0.71 ],
			[ -0.14, -0.79 ],
		] );
	} else if ( species === 'snowdrop' ) {
		add( leaf( -0.03, 0, -0.15, -0.64, 0.025 ) );
		add( leaf( 0.02, 0, 0.19, -0.56, 0.027 ) );
		for ( const side of [ -1, 1 ] ) {
			add(
				ribbon(
					[
						[ 0, 0 ],
						[ side * 0.02, -0.62 ],
						[ side * 0.11, -0.93 ],
						[ side * 0.22, -0.96 ],
						[ side * 0.29, -0.81 ],
					],
					0.014,
					0.01
				)
			);
			for ( const petal of [ -1, 0, 1 ] ) {
				add(
					leaf(
						side * 0.29,
						-0.82,
						side * 0.29 + petal * 0.105,
						-0.56 - Math.abs( petal ) * 0.045,
						0.042
					)
				);
			}
		}
	} else if ( species === 'cotton' ) {
		line( 0, 0, 0.025, -0.94, 0.019 );
		for ( let i = 0; i < 5; i++ ) {
			const side = i % 2 ? 1 : -1;
			const y = -0.28 - i * 0.14;
			const x = side * ( 0.28 - i * 0.032 );
			line( 0, y + 0.08, x, y, 0.012 );
			add( leaf( x, y, x + side * 0.13, y + 0.055, 0.032 ) );
			add( blossom( x, y - 0.075, 0.12, 5, 0.76 ) );
		}
	} else if ( species === 'coral' ) {
		const branch = ( x, y, angle, length, width, depth ) => {
			const tx = x + Math.cos( angle ) * length;
			const ty = y + Math.sin( angle ) * length;
			line( x, y, tx, ty, width );
			add( ellipse( tx, ty, width ) );
			if ( depth ) {
				for ( const side of [ -1, 1 ] ) {
					branch(
						tx,
						ty,
						angle + side * ( 0.35 + random() * 0.2 ),
						length * 0.66,
						width * 0.7,
						depth - 1
					);
				}
			}
		};
		for ( const side of [ -1, 0, 1 ] ) {
			branch( 0, 0, -Math.PI / 2 + side * 0.58, 0.34, 0.037, 3 );
		}
	} else {
		return null;
	}
	return out;
}

export function collectionDecoration( object ) {
	const out = [];
	const add = ( ring ) => out.push( [ ring ] );
	const line = ( x, y, tx, ty, width = 0.014 ) =>
		add( stem( x, y, tx, ty, width ) );
	switch ( object.variant ) {
		case 'hotairballoon':
			out.push( [
				ellipse( 0, -0.68, 0.34, 0.43, 64 ),
				ellipse( -0.15, -0.7, 0.052, 0.32 ),
				ellipse( 0.15, -0.7, 0.052, 0.32 ),
			] );
			line( -0.12, -0.32, -0.09, -0.11 );
			line( 0.12, -0.32, 0.09, -0.11 );
			add( [
				[ -0.12, -0.14 ],
				[ 0.12, -0.14 ],
				[ 0.085, 0 ],
				[ -0.085, 0 ],
			] );
			break;
		case 'observatory': {
			out.push( [
				rect( -0.38, -0.32, 0.76, 0.32 ),
				rect( -0.075, -0.2, 0.15, 0.2 ),
				rect( -0.29, -0.24, 0.1, 0.1 ),
				rect( 0.19, -0.24, 0.1, 0.1 ),
			] );
			const dome = Array.from( { length: 49 }, ( _, i ) => [
				Math.cos( Math.PI + ( i * Math.PI ) / 48 ) * 0.43,
				-0.34 + Math.sin( Math.PI + ( i * Math.PI ) / 48 ) * 0.4,
			] );
			out.push( [ dome, rect( -0.027, -0.7, 0.054, 0.34 ) ] );
			add( rect( -0.46, -0.35, 0.92, 0.045 ) );
			line( 0.17, -0.53, 0.46, -0.84, 0.055 );
			line( 0.41, -0.88, 0.51, -0.79, 0.022 );
			break;
		}
		case 'greenhouse': {
			const panes = [ rect( -0.5, -0.54, 1, 0.54 ) ];
			const count = 4 + Math.round( ( object.detail || 0 ) / 35 );
			for ( let i = 0; i < count; i++ ) {
				for ( let j = 0; j < 2; j++ ) {
					panes.push(
						rect(
							-0.46 + ( i * 0.92 ) / count,
							-0.5 + j * 0.24,
							0.92 / count - 0.028,
							0.205
						)
					);
				}
			}
			out.push( panes );
			out.push( [
				[
					[ -0.57, -0.54 ],
					[ 0, -0.94 ],
					[ 0.57, -0.54 ],
				],
				[
					[ -0.4, -0.58 ],
					[ -0.025, -0.84 ],
					[ -0.025, -0.58 ],
				],
				[
					[ 0.025, -0.58 ],
					[ 0.025, -0.84 ],
					[ 0.4, -0.58 ],
				],
			] );
			break;
		}
		case 'campingtent':
			out.push( [
				[
					[ -0.59, 0 ],
					[ -0.03, -0.72 ],
					[ 0.42, 0 ],
				],
				[
					[ -0.33, -0.035 ],
					[ -0.03, -0.52 ],
					[ 0.23, -0.035 ],
				],
			] );
			add( [
				[ -0.03, -0.72 ],
				[ 0.34, -0.57 ],
				[ 0.65, -0.025 ],
				[ 0.42, 0 ],
			] );
			line( -0.03, -0.75, -0.7, 0, 0.009 );
			line( 0.34, -0.58, 0.78, -0.02, 0.009 );
			break;
		case 'pagoda':
			for ( let i = 0; i < 3; i++ ) {
				const y = -0.23 - i * 0.29;
				const w = 0.53 - i * 0.11;
				out.push( [
					rect( -w * 0.56, y, w * 1.12, 0.22 ),
					rect( -w * 0.32, y + 0.035, w * 0.64, 0.185 ),
				] );
				add( [
					[ -w, y + 0.035 ],
					[ -w * 0.8, y - 0.04 ],
					[ 0, y - 0.25 ],
					[ w * 0.8, y - 0.04 ],
					[ w, y + 0.035 ],
					[ w * 0.67, y + 0.075 ],
					[ -w * 0.67, y + 0.075 ],
				] );
			}
			line( 0, -1.06, 0, -1.17, 0.013 );
			add( rect( -0.42, -0.025, 0.84, 0.04 ) );
			break;
		case 'steppingstones':
			for ( let i = 0; i < 7; i++ ) {
				const size = 0.21 - i * 0.021;
				add(
					ellipse(
						Math.sin( i * 0.95 ) * ( 0.14 + i * 0.025 ),
						-i * 0.135,
						size,
						size * 0.33,
						24,
						Math.sin( i ) * 0.14
					)
				);
			}
			break;
		default:
			return null;
	}
	return out;
}

export function collectionWindow( object ) {
	switch ( object.window ) {
		case 'quatrefoil':
			return [
				[ ellipse( -0.47, 0, 0.58 ) ],
				[ ellipse( 0.47, 0, 0.58 ) ],
				[ ellipse( 0, -0.47, 0.58 ) ],
				[ ellipse( 0, 0.47, 0.58 ) ],
			];
		case 'ogee': {
			const half = Array.from( { length: 49 }, ( _, i ) => {
				const t = i / 48;
				return [
					t < 0.55
						? Math.sin( ( ( t / 0.55 ) * Math.PI ) / 2 ) * 0.92
						: 0.92 - ( ( t - 0.55 ) / 0.45 ) * 0.3,
					-1 + t * 2,
				];
			} );
			return [
				[
					[
						...half,
						...half
							.slice()
							.reverse()
							.map( ( [ x, y ] ) => [ -x, y ] ),
					],
				],
			];
		}
		case 'sunburstwindow':
			return [
				[
					Array.from( { length: 192 }, ( _, i ) => {
						const a = ( i / 192 ) * TAU;
						const r =
							0.82 +
							0.18 *
								Math.cos(
									a *
										( 12 +
											Math.round(
												( object.ornament || 0 ) / 20
											) )
								);
						return [ Math.cos( a ) * r, Math.sin( a ) * r ];
					} ),
				],
			];
		case 'raindrop': {
			const half = Array.from( { length: 49 }, ( _, i ) => {
				const t = i / 48;
				return [
					Math.sqrt( Math.max( 0, Math.sin( Math.PI * t ) ) * t ),
					-1 + t * 2,
				];
			} );
			return [
				[
					[
						...half,
						...half
							.slice()
							.reverse()
							.map( ( [ x, y ] ) => [ -x, y ] ),
					],
				],
			];
		}
		default:
			return null;
	}
}
