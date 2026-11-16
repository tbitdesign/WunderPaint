/**
 * Buildings and things for the v3.8 themes: towns and castles, the farm,
 * the polar ice, the sea floor and the holidays.
 *
 * Same unit box as every decoration: x around -1..1, the ground at y=0,
 * the top near y=-1. Each entry of the result is one stamp; its first
 * ring is the paper, the rings after it are cut out of THAT stamp (even-
 * odd). Stamps are unioned, so a window only stays open when no other
 * stamp of the same piece covers it - doors are therefore notches in the
 * outline rather than holes.
 */
import { rng } from './geom.js';
import {
	ellipse,
	rect,
	star,
	ribbon,
	stem,
	curvedLeaf,
	TAU,
} from './paper-shapes.js';

/** Battlements along a top edge, left to right, as outline points. */
function battlements( x0, x1, y, h, count ) {
	const pts = [];
	const step = ( x1 - x0 ) / ( count * 2 - 1 );
	for ( let i = 0; i < count * 2 - 1; i++ ) {
		const a = x0 + i * step;
		const top = i % 2 ? y : y - h;
		pts.push( [ a, top ], [ a + step, top ] );
	}
	return pts;
}

/** An arch opening as a closed ring: straight sides, round top. */
function archHole( cx, bottom, halfW, height, n = 14 ) {
	const spring = bottom - Math.max( 0, height - halfW );
	const pts = [ [ cx + halfW, bottom ] ];
	for ( let i = 0; i <= n; i++ ) {
		const a = ( i * Math.PI ) / n;
		pts.push( [
			cx + Math.cos( a ) * halfW,
			spring - Math.sin( a ) * halfW,
		] );
	}
	pts.push( [ cx - halfW, bottom ] );
	return pts;
}

/**
 * The same arch as a notch walked into an outline from the right side
 * of the opening to the left, for doors and gates that reach the ground.
 */
function archNotch( cx, halfW, height, n = 14 ) {
	return archHole( cx, 0, halfW, height, n );
}

/** A curved row of points along a half ellipse, left to right. */
function dome( cx, base, rx, ry, n = 40 ) {
	return Array.from( { length: n + 1 }, ( _, i ) => {
		const a = Math.PI + ( i * Math.PI ) / n;
		return [ cx + Math.cos( a ) * rx, base + Math.sin( a ) * ry ];
	} );
}

export function worldDecoration( object ) {
	const r = rng( object.seed );
	const out = [];
	const add = ( ring ) => out.push( [ ring ] );
	const line = ( x, y, tx, ty, width = 0.014 ) =>
		add( stem( x, y, tx, ty, width ) );
	const detail = object.detail ?? 64;
	switch ( object.variant ) {
		case 'castle': {
			// Curtain wall with its gate between two corner towers, the
			// keep rising behind it with a pointed roof and a pennant.
			out.push( [
				[
					[ -0.52, 0 ],
					[ -0.52, -0.4 ],
					...battlements( -0.52, 0.52, -0.4, 0.065, 7 ),
					[ 0.52, -0.4 ],
					[ 0.52, 0 ],
					...archNotch( 0, 0.11, 0.27 ),
				],
			] );
			for ( const s of [ -1, 1 ] ) {
				const x0 = s < 0 ? -0.8 : 0.5;
				const x1 = x0 + 0.3;
				const mid = ( x0 + x1 ) / 2;
				out.push( [
					[
						[ x0, 0 ],
						[ x0, -0.66 ],
						...battlements( x0 - 0.02, x1 + 0.02, -0.66, 0.075, 3 ),
						[ x1, -0.66 ],
						[ x1, 0 ],
					],
					archHole( mid, -0.42, 0.03, 0.11 ),
					archHole( mid, -0.2, 0.025, 0.08 ),
				] );
			}
			out.push( [
				[
					[ -0.2, -0.38 ],
					[ -0.2, -0.82 ],
					[ 0.2, -0.82 ],
					[ 0.2, -0.38 ],
				],
				archHole( -0.075, -0.56, 0.035, 0.13 ),
				archHole( 0.075, -0.56, 0.035, 0.13 ),
				ellipse( 0, -0.71, 0.035 ),
			] );
			add( [
				[ -0.26, -0.8 ],
				[ 0, -1.08 ],
				[ 0.26, -0.8 ],
			] );
			line( 0, -1.06, 0, -1.22, 0.012 );
			add( [
				[ 0, -1.22 ],
				[ 0.18, -1.18 ],
				[ 0, -1.14 ],
			] );
			break;
		}
		case 'chapel': {
			// Nave with a gable and its windows, the bell tower to the side.
			out.push( [
				[
					[ -0.46, 0 ],
					[ -0.46, -0.38 ],
					[ -0.51, -0.38 ],
					[ -0.13, -0.68 ],
					[ 0.25, -0.38 ],
					[ 0.2, -0.38 ],
					[ 0.2, 0 ],
				],
				archHole( -0.32, -0.13, 0.04, 0.16 ),
				archHole( -0.13, -0.13, 0.04, 0.16 ),
				ellipse( -0.13, -0.49, 0.05, 0.05, 28 ),
			] );
			out.push( [
				[
					[ 0.2, 0 ],
					[ 0.2, -0.74 ],
					[ 0.33, -1.08 ],
					[ 0.46, -0.74 ],
					[ 0.46, 0 ],
					...archNotch( 0.33, 0.055, 0.19 ),
				],
				archHole( 0.33, -0.56, 0.04, 0.12 ),
			] );
			add( rect( 0.32, -1.24, 0.022, 0.18 ) );
			add( rect( 0.28, -1.19, 0.1, 0.022 ) );
			break;
		}
		case 'barn': {
			// Gambrel roof, the big braced door and a hay-loft window; the
			// silo stands beside it.
			out.push( [
				[
					[ -0.5, 0 ],
					[ -0.5, -0.46 ],
					[ -0.39, -0.7 ],
					[ -0.12, -0.84 ],
					[ 0.12, -0.84 ],
					[ 0.39, -0.7 ],
					[ 0.5, -0.46 ],
					[ 0.5, 0 ],
					[ 0.21, 0 ],
					[ 0.21, -0.38 ],
					[ -0.21, -0.38 ],
					[ -0.21, 0 ],
				],
				rect( -0.09, -0.66, 0.18, 0.15 ),
			] );
			add( rect( -0.21, -0.38, 0.42, 0.03 ) );
			line( -0.19, -0.02, 0.19, -0.35, 0.016 );
			line( 0.19, -0.02, -0.19, -0.35, 0.016 );
			add( rect( -0.011, -0.66, 0.022, 0.15 ) );
			add( rect( -0.09, -0.596, 0.18, 0.022 ) );
			out.push( [
				[
					[ 0.56, 0 ],
					[ 0.56, -0.8 ],
					...dome( 0.665, -0.8, 0.105, 0.1, 16 ).slice( 1, -1 ),
					[ 0.77, -0.8 ],
					[ 0.77, 0 ],
				],
				...[ -0.6, -0.42, -0.24 ].map( ( y ) =>
					rect( 0.585, y, 0.16, 0.012 )
				),
			] );
			break;
		}
		case 'fence': {
			// Posts with pointed tops and two rails, across the whole width.
			const posts = 9;
			for ( let i = 0; i < posts; i++ ) {
				const x = -0.96 + ( i * 1.92 ) / ( posts - 1 );
				const tall = 0.3 + ( r() - 0.5 ) * 0.04;
				add( [
					[ x - 0.026, 0 ],
					[ x - 0.026, -tall ],
					[ x, -tall - 0.04 ],
					[ x + 0.026, -tall ],
					[ x + 0.026, 0 ],
				] );
			}
			for ( const y of [ -0.24, -0.11 ] ) {
				add(
					ribbon(
						Array.from( { length: 24 }, ( _, i ) => {
							const t = i / 23;
							return [
								-1 + t * 2,
								y + Math.sin( t * 9 + y * 20 ) * 0.006,
							];
						} ),
						0.017
					)
				);
			}
			break;
		}
		case 'townhouses': {
			// Narrow canal houses, every gable a different kind: stepped,
			// bell, plain and pointed, each with its door and windows.
			const count = 5;
			const width = 2 / count;
			const kinds = [ 'step', 'bell', 'point', 'step', 'bell' ];
			for ( let i = 0; i < count; i++ ) {
				const x0 = -1 + i * width + 0.012;
				const x1 = x0 + width - 0.024;
				const mid = ( x0 + x1 ) / 2;
				const half = ( x1 - x0 ) / 2;
				const eave = -0.5 - ( ( i * 37 ) % 5 ) * 0.045 - r() * 0.03;
				const peak = eave - 0.24;
				const kind = kinds[ ( i + Math.floor( r() * 2 ) ) % 5 ];
				let roof;
				if ( 'step' === kind ) {
					roof = [
						[ x0, eave ],
						[ x0 + half * 0.25, eave ],
						[ x0 + half * 0.25, eave - 0.08 ],
						[ x0 + half * 0.55, eave - 0.08 ],
						[ x0 + half * 0.55, eave - 0.16 ],
						[ mid - half * 0.2, eave - 0.16 ],
						[ mid - half * 0.2, peak ],
						[ mid + half * 0.2, peak ],
						[ mid + half * 0.2, eave - 0.16 ],
						[ x1 - half * 0.55, eave - 0.16 ],
						[ x1 - half * 0.55, eave - 0.08 ],
						[ x1 - half * 0.25, eave - 0.08 ],
						[ x1 - half * 0.25, eave ],
						[ x1, eave ],
					];
				} else if ( 'bell' === kind ) {
					roof = [ [ x0, eave ] ];
					for ( let k = 0; k <= 20; k++ ) {
						const t = k / 20;
						const u = t * 2 - 1;
						const bell =
							Math.abs( u ) < 0.45
								? 1
								: Math.cos(
										( ( Math.abs( u ) - 0.45 ) / 0.55 ) *
											( Math.PI / 2 )
								  );
						roof.push( [
							x0 + t * ( x1 - x0 ),
							eave - bell * 0.22,
						] );
					}
					roof.push( [ x1, eave ] );
				} else {
					roof = [
						[ x0, eave ],
						[ mid, peak - 0.04 ],
						[ x1, eave ],
					];
				}
				const holes = [];
				const room = -eave - 0.06 - 0.32;
				const floors = Math.max( 2, Math.floor( room / 0.14 ) + 1 );
				for ( let f = 0; f < floors; f++ ) {
					const y = eave + 0.06 + f * ( room / ( floors - 1 ) );
					for ( const s of [ -1, 1 ] ) {
						holes.push(
							rect( mid + s * half * 0.45 - 0.04, y, 0.08, 0.1 )
						);
					}
				}
				holes.push( ellipse( mid, eave - 0.08, 0.03, 0.03, 18 ) );
				out.push( [
					[
						[ x0, 0 ],
						...roof,
						[ x1, 0 ],
						...archNotch( mid, 0.05, 0.17, 10 ),
					],
					...holes,
				] );
			}
			break;
		}
		case 'ferriswheel': {
			const cy = -0.62;
			const rad = 0.5;
			out.push( [
				ellipse( 0, cy, rad, rad, 72 ),
				ellipse( 0, cy, rad - 0.035, rad - 0.035, 72 ),
			] );
			out.push( [
				ellipse( 0, cy, 0.29, 0.29, 56 ),
				ellipse( 0, cy, 0.265, 0.265, 56 ),
			] );
			const cars = 6 + Math.round( detail / 16 );
			for ( let i = 0; i < cars; i++ ) {
				const a = ( i * TAU ) / cars;
				const x = Math.cos( a ) * rad;
				const y = cy + Math.sin( a ) * rad;
				line( 0, cy, x * 0.97, cy + ( y - cy ) * 0.97, 0.011 );
				line( x, y, x, y + 0.06, 0.007 );
				add( [
					...dome( x, y + 0.06, 0.05, 0.03, 10 ),
					[ x + 0.04, y + 0.12 ],
					[ x - 0.04, y + 0.12 ],
				] );
			}
			add( ellipse( 0, cy, 0.05 ) );
			// The legs end on the base plate, not through the ground.
			line( 0, cy, -0.36, -0.015, 0.026 );
			line( 0, cy, 0.36, -0.015, 0.026 );
			line( -0.18, -0.31, 0.18, -0.31, 0.012 );
			add( rect( -0.48, -0.035, 0.96, 0.035 ) );
			break;
		}
		case 'steamtrain': {
			// The engine leads to the left; two coaches follow on the rail.
			add( rect( -1, -0.025, 2, 0.025 ) );
			const wheel = ( x, rad = 0.075 ) =>
				out.push( [
					ellipse( x, -0.025 - rad, rad, rad, 28 ),
					ellipse( x, -0.025 - rad, rad * 0.38, rad * 0.38, 16 ),
				] );
			// Boiler with its round smokebox front, footplate, cowcatcher.
			add( rect( -0.88, -0.37, 0.44, 0.2 ) );
			add( ellipse( -0.88, -0.27, 0.035, 0.1, 20 ) );
			add( rect( -0.92, -0.2, 0.5, 0.045 ) );
			add( [
				[ -0.9, -0.16 ],
				[ -1, -0.035 ],
				[ -0.86, -0.035 ],
			] );
			// Funnel and steam dome.
			add( [
				[ -0.83, -0.35 ],
				[ -0.85, -0.5 ],
				[ -0.9, -0.55 ],
				[ -0.72, -0.55 ],
				[ -0.77, -0.5 ],
				[ -0.79, -0.35 ],
			] );
			add( dome( -0.62, -0.355, 0.05, 0.06, 12 ) );
			// Cab with its window and roof.
			out.push( [
				rect( -0.47, -0.58, 0.26, 0.38 ),
				rect( -0.42, -0.52, 0.16, 0.13 ),
			] );
			add( rect( -0.5, -0.62, 0.32, 0.045 ) );
			wheel( -0.8, 0.065 );
			wheel( -0.62, 0.09 );
			wheel( -0.36, 0.09 );
			line( -0.62, -0.06, -0.36, -0.06, 0.01 );
			// Smoke, drifting back over the coaches.
			const puffs = 3 + Math.round( detail / 30 );
			for ( let i = 0; i < puffs; i++ ) {
				const t = i / Math.max( 1, puffs - 1 );
				add(
					ellipse(
						-0.76 + t * 0.62,
						-0.66 - t * 0.28 - r() * 0.04,
						0.07 + t * 0.07,
						0.05 + t * 0.045,
						28
					)
				);
			}
			// Two coaches with their windows.
			for ( const x0 of [ -0.16, 0.44 ] ) {
				add( rect( x0 - 0.04, -0.16, 0.04, 0.02 ) );
				const holes = [];
				for ( let k = 0; k < 4; k++ ) {
					holes.push(
						rect( x0 + 0.05 + k * 0.125, -0.4, 0.08, 0.11 )
					);
				}
				out.push( [ rect( x0, -0.46, 0.54, 0.32 ), ...holes ] );
				add( [
					[ x0 - 0.02, -0.46 ],
					[ x0 + 0.04, -0.52 ],
					[ x0 + 0.5, -0.52 ],
					[ x0 + 0.56, -0.46 ],
				] );
				wheel( x0 + 0.12, 0.065 );
				wheel( x0 + 0.42, 0.065 );
			}
			break;
		}
		case 'christmastree': {
			add( rect( -0.06, -0.15, 0.12, 0.15 ) );
			const tiers = 4;
			let topY = 0;
			for ( let i = 0; i < tiers; i++ ) {
				const base = -0.12 - i * 0.2;
				const half = 0.5 - i * 0.1;
				const apex = base - 0.36;
				const ring = [ [ 0, apex ] ];
				// Drooping tips along the lower edge.
				const tips = 4 - Math.floor( i / 2 );
				ring.push( [ half, base ] );
				for ( let k = 1; k < tips * 2; k++ ) {
					const x = half - ( k * half * 2 ) / ( tips * 2 );
					ring.push( [ x, base - ( k % 2 ? 0.045 : 0 ) ] );
				}
				ring.push( [ -half, base ] );
				const holes = [];
				if ( i < tiers - 1 ) {
					const balls = tips;
					for ( let k = 0; k < balls; k++ ) {
						const x = ( ( k + 0.5 ) / balls - 0.5 ) * half * 1.3;
						holes.push(
							ellipse( x, base - 0.085, 0.024, 0.024, 16 )
						);
					}
				}
				out.push( [ ring, ...holes ] );
				topY = apex;
			}
			add( star( 0, topY - 0.02, 0.085, 0.45, 5 ) );
			break;
		}
		case 'snowman': {
			out.push( [
				ellipse( 0, -0.24, 0.25, 0.24, 48 ),
				ellipse( 0, -0.3, 0.022, 0.022, 14 ),
				ellipse( 0, -0.17, 0.022, 0.022, 14 ),
			] );
			out.push( [
				ellipse( 0, -0.6, 0.18, 0.17, 44 ),
				ellipse( 0, -0.6, 0.02, 0.02, 14 ),
				ellipse( 0, -0.5, 0.02, 0.02, 14 ),
			] );
			out.push( [
				ellipse( 0, -0.86, 0.125, 0.12, 40 ),
				ellipse( -0.045, -0.89, 0.016, 0.016, 12 ),
				ellipse( 0.045, -0.89, 0.016, 0.016, 12 ),
			] );
			// Carrot nose, scarf, hat and the twig arms.
			add( [
				[ -0.01, -0.875 ],
				[ -0.2, -0.85 ],
				[ -0.01, -0.84 ],
			] );
			add(
				ribbon(
					[
						[ -0.13, -0.73 ],
						[ 0, -0.71 ],
						[ 0.13, -0.73 ],
					],
					0.025
				)
			);
			add(
				ribbon(
					[
						[ 0.08, -0.72 ],
						[ 0.11, -0.62 ],
						[ 0.13, -0.54 ],
					],
					0.028,
					0.02
				)
			);
			add( rect( -0.17, -0.97, 0.34, 0.035 ) );
			add( rect( -0.1, -1.13, 0.2, 0.17 ) );
			for ( const s of [ -1, 1 ] ) {
				line( s * 0.15, -0.63, s * 0.42, -0.79, 0.012 );
				line( s * 0.34, -0.74, s * 0.38, -0.86, 0.008 );
				line( s * 0.38, -0.765, s * 0.47, -0.76, 0.008 );
			}
			break;
		}
		case 'pumpkin': {
			// One carved lantern between two plain ones; the ribs are slits.
			const pumpkin = ( cx, rx, ry, face ) => {
				const cy = -ry;
				const holes = [];
				if ( face ) {
					for ( const s of [ -1, 1 ] ) {
						holes.push( [
							[ cx + s * rx * 0.2, cy - ry * 0.12 ],
							[ cx + s * rx * 0.45, cy - ry * 0.12 ],
							[ cx + s * rx * 0.33, cy - ry * 0.45 ],
						] );
					}
					const mouth = [];
					const teeth = 5;
					for ( let k = 0; k <= teeth * 2; k++ ) {
						const t = k / ( teeth * 2 );
						mouth.push( [
							cx + ( t - 0.5 ) * rx * 1.1,
							cy +
								ry * 0.28 +
								Math.sin( t * Math.PI ) * ry * 0.12 -
								( k % 2 ? ry * 0.1 : 0 ),
						] );
					}
					for ( let k = teeth * 2; k >= 0; k-- ) {
						const t = k / ( teeth * 2 );
						mouth.push( [
							cx + ( t - 0.5 ) * rx * 1.0,
							cy +
								ry * 0.42 +
								Math.sin( t * Math.PI ) * ry * 0.22,
						] );
					}
					holes.push( mouth );
				} else {
					for ( const s of [ -1, 1 ] ) {
						holes.push(
							curvedLeaf(
								cx + s * rx * 0.3,
								cy - ry * 0.82,
								cx + s * rx * 0.48,
								cy,
								cx + s * rx * 0.3,
								cy + ry * 0.82,
								rx * 0.035
							)
						);
					}
				}
				out.push( [ ellipse( cx, cy, rx, ry, 56 ), ...holes ] );
				add( [
					[ cx - rx * 0.07, cy - ry * 0.92 ],
					[ cx - rx * 0.04, cy - ry * 1.3 ],
					[ cx + rx * 0.12, cy - ry * 1.42 ],
					[ cx + rx * 0.07, cy - ry * 0.92 ],
				] );
				add(
					curvedLeaf(
						cx + rx * 0.05,
						cy - ry * 1.05,
						cx + rx * 0.3,
						cy - ry * 1.5,
						cx + rx * 0.45,
						cy - ry * 1.1,
						ry * 0.12
					)
				);
			};
			pumpkin( -0.62, 0.24, 0.16, false );
			pumpkin( 0.6, 0.2, 0.13, false );
			pumpkin( 0, 0.38, 0.27, true );
			break;
		}
		case 'kite': {
			// The kite flies up top; its line runs down to the ground.
			const top = -1;
			const bottom = -0.5;
			const mid = -0.83;
			const half = 0.22;
			out.push( [
				[
					[ 0, top ],
					[ half, mid ],
					[ 0, bottom ],
					[ -half, mid ],
				],
				[
					[ -0.018, top + 0.045 ],
					[ -0.018, mid - 0.012 ],
					[ -half + 0.05, mid - 0.012 ],
				],
				[
					[ 0.018, mid + 0.014 ],
					[ half - 0.05, mid + 0.014 ],
					[ 0.018, bottom - 0.06 ],
				],
			] );
			const tail = Array.from( { length: 30 }, ( _, i ) => {
				const t = i / 29;
				return [
					0.02 + Math.sin( t * 7 ) * 0.07 + t * 0.12,
					bottom + t * 0.32,
				];
			} );
			add( ribbon( tail, 0.007, 0.004 ) );
			for ( const k of [ 7, 15, 23 ] ) {
				const [ x, y ] = tail[ k ];
				add( [
					[ x, y ],
					[ x - 0.05, y - 0.025 ],
					[ x - 0.05, y + 0.025 ],
				] );
				add( [
					[ x, y ],
					[ x + 0.05, y - 0.025 ],
					[ x + 0.05, y + 0.025 ],
				] );
			}
			add(
				ribbon(
					Array.from( { length: 24 }, ( _, i ) => {
						const t = i / 23;
						return [
							-t * 0.62 + Math.sin( t * Math.PI ) * 0.06,
							( bottom + 0.005 ) * ( 1 - t ) - 0.005,
						];
					} ),
					0.004,
					0.004
				)
			);
			break;
		}
		case 'igloo': {
			// Snow blocks as slits; the entrance is cut out of the dome and
			// the tunnel around it is drawn by one more slit. No two slits
			// may cross - even-odd would fill the crossing back in.
			const tunnelX = 0.21;
			const tunnelY = 0.25;
			const clear = ( x, y ) =>
				( x / ( tunnelX + 0.05 ) ) ** 2 +
					( y / ( tunnelY + 0.045 ) ) ** 2 >
				1;
			const holes = [];
			const slit = ( x0, y0, x1, y1 ) =>
				holes.push(
					ribbon(
						[
							[ x0, y0 ],
							[ x1, y1 ],
						],
						0.006
					)
				);
			const half = ( y ) => 0.5 * Math.sqrt( 1 - ( y / 0.52 ) ** 2 );
			for ( let k = 1; k <= 4; k++ ) {
				const y = -k * 0.1;
				const w = half( y ) - 0.035;
				if ( clear( 0, y ) ) {
					slit( -w, y, w, y );
				} else {
					const inner =
						( tunnelX + 0.05 ) *
						Math.sqrt( 1 - ( y / ( tunnelY + 0.045 ) ) ** 2 );
					if ( w - inner > 0.04 ) {
						slit( -w, y, -inner, y );
						slit( inner, y, w, y );
					}
				}
				const yb = y + 0.05;
				const wb = half( yb ) - 0.06;
				const blocks = 5 - Math.floor( k / 2 );
				for ( let b = 1; b < blocks; b++ ) {
					const x =
						-wb +
						( b * 2 * wb ) / blocks +
						( k % 2 ? 0.04 : -0.04 );
					if ( clear( x, yb - 0.035 ) && clear( x, yb + 0.035 ) ) {
						slit( x, yb - 0.03, x, yb + 0.03 );
					}
				}
			}
			holes.push(
				ribbon(
					Array.from( { length: 24 }, ( _, i ) => {
						const a = Math.PI + ( i * Math.PI ) / 23;
						return [
							Math.cos( a ) * tunnelX,
							-0.012 + Math.sin( a ) * tunnelY,
						];
					} ),
					0.007
				)
			);
			out.push( [
				[
					...dome( 0, 0, 0.5, 0.52, 48 ),
					...archNotch( 0, 0.1, 0.19, 12 ),
				],
				...holes,
			] );
			break;
		}
		case 'kelp': {
			// Tall swaying stalks with their blades.
			const stalks = 5 + Math.round( detail / 40 );
			for ( let i = 0; i < stalks; i++ ) {
				const x0 =
					-0.85 + ( i * 1.7 ) / ( stalks - 1 ) + ( r() - 0.5 ) * 0.1;
				const tall = 0.7 + r() * 0.32;
				const phase = r() * TAU;
				const at = ( t ) => [
					x0 + Math.sin( t * 5 + phase ) * 0.05 * t,
					-0.012 - t * tall,
				];
				add(
					ribbon(
						Array.from( { length: 32 }, ( _, k ) => at( k / 31 ) ),
						0.016,
						0.006
					)
				);
				const blades = 4 + Math.floor( r() * 3 );
				for ( let b = 0; b < blades; b++ ) {
					const t = 0.18 + ( b / blades ) * 0.78;
					const [ x, y ] = at( t );
					const s = b % 2 ? 1 : -1;
					const len = 0.15 + r() * 0.08;
					// Long blades that float up along the stalk.
					add(
						curvedLeaf(
							x,
							y,
							x + s * len * 0.55,
							y - len * 0.25,
							x + s * len * 0.35,
							y - len,
							0.026
						)
					);
				}
			}
			break;
		}
		case 'bubbles': {
			// Rising columns of bubbles, small at the bottom.
			const columns = 3;
			for ( let c = 0; c < columns; c++ ) {
				const x0 = -0.6 + c * 0.6 + ( r() - 0.5 ) * 0.2;
				const count = 5 + Math.floor( r() * 3 );
				for ( let i = 0; i < count; i++ ) {
					const t = i / ( count - 1 );
					const rad = 0.025 + t * 0.06 + r() * 0.012;
					const x = x0 + Math.sin( t * 6 + c ) * 0.07;
					const y = -0.06 - t * 0.86;
					out.push( [
						ellipse( x, y, rad, rad, 28 ),
						ellipse(
							x + rad * 0.08,
							y + rad * 0.06,
							rad * 0.7,
							rad * 0.7,
							24
						),
					] );
					if ( r() < 0.5 ) {
						add(
							ellipse(
								x + rad * 1.6,
								y + rad,
								rad * 0.3,
								rad * 0.3,
								12
							)
						);
					}
				}
			}
			break;
		}
		default:
			return null;
	}
	return out;
}
