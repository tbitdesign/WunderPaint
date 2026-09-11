import { rng } from './geom.js';
import { EXTRA_WINDOWS } from './library.js';
import {
	ellipse,
	rect,
	stem,
	leaf,
	blossom,
	fitWindow,
	TAU,
} from './paper-shapes.js';
const ids = new Set( EXTRA_WINDOWS.map( ( e ) => e.id ) );
const arch = ( pointed = false ) => {
	const pts = [
		[ -1, 1 ],
		[ -1, -0.08 ],
	];
	for ( let i = 0; i <= 48; i++ ) {
		const a = Math.PI + ( i * Math.PI ) / 48;
		pts.push( [
			Math.cos( a ),
			pointed
				? -0.08 - 0.92 * ( 1 - Math.abs( Math.cos( a ) ) ) ** 0.65
				: -0.08 + Math.sin( a ) * 0.92,
		] );
	}
	return [ ...pts, [ 1, 1 ] ];
};
/** New apertures, with seed-based edges and separated window panes. */
export function extraWindow( o, w, h ) {
	if ( ! ids.has( o.window ) ) return null;
	const r = rng( o.seed ),
		density = Math.round( 6 + ( o.ornament ?? 50 ) * 0.14 ),
		rough = ( o.irregularity ?? 40 ) / 100;
	let stamps = [],
		ring;
	const add = ( p ) => stamps.push( [ p ] );
	switch ( o.window ) {
		case 'pointed':
			add( arch( true ) );
			break;
		case 'horseshoe': {
			ring = [
				[ -0.64, 1 ],
				[ -0.64, 0.45 ],
			];
			for ( let i = 0; i <= 64; i++ ) {
				const a = 2.5 + ( i * ( Math.PI * 2 - 1.86 ) ) / 64;
				ring.push( [ Math.cos( a ), Math.sin( a ) * 0.8 - 0.18 ] );
			}
			ring.push( [ 0.64, 0.45 ], [ 0.64, 1 ] );
			add( ring );
			break;
		}
		case 'trefoil':
			add( rect( -0.68, -0.1, 1.36, 1.1 ) );
			add( ellipse( 0, -0.5, 0.56 ) );
			add( ellipse( -0.49, -0.18, 0.5 ) );
			add( ellipse( 0.49, -0.18, 0.5 ) );
			break;
		case 'keyhole':
			add( ellipse( 0, -0.4, 0.63 ) );
			add( [
				[ -0.26, -0.08 ],
				[ 0.26, -0.08 ],
				[ 0.58, 1 ],
				[ -0.58, 1 ],
			] );
			break;
		case 'fan': {
			ring = [ [ 0, 1 ] ];
			for ( let i = 0; i <= 72; i++ ) {
				const a = Math.PI + ( i * Math.PI ) / 72;
				ring.push( [ Math.cos( a ), 0.1 + Math.sin( a ) ] );
			}
			add( ring );
			break;
		}
		case 'shell': {
			ring = [ [ 0, 1 ] ];
			for ( let i = 0; i <= 120; i++ ) {
				const a = Math.PI + ( i * Math.PI ) / 120,
					rr = 0.9 + 0.07 * Math.cos( a * density * 2 );
				ring.push( [ Math.cos( a ) * rr, 0.1 + Math.sin( a ) * rr ] );
			}
			add( ring );
			break;
		}
		case 'cloudwindow':
			add( ellipse( 0, 0.25, 0.95, 0.55 ) );
			add( ellipse( -0.54, 0, 0.48 ) );
			add( ellipse( 0, -0.35, 0.59 ) );
			add( ellipse( 0.55, -0.04, 0.47 ) );
			break;
		case 'leafwindow':
			add( leaf( -0.68, 0.92, 0.67, -1, 0.6 ) );
			break;
		case 'acorn':
			add( ellipse( 0, 0.1, 0.64, 0.83 ) );
			add( ellipse( 0, -0.52, 0.85, 0.35 ) );
			add( rect( -0.12, -1, 0.24, 0.3 ) );
			break;
		case 'egg':
			add(
				Array.from( { length: 96 }, ( _, i ) => {
					const a = ( i * TAU ) / 96;
					return [
						Math.cos( a ) * ( 0.7 + 0.19 * Math.sin( a ) ),
						Math.sin( a ),
					];
				} )
			);
			break;
		case 'diamond':
			add( [
				[ 0, -1 ],
				[ 1, 0 ],
				[ 0, 1 ],
				[ -1, 0 ],
			] );
			break;
		case 'octagon':
			add( ellipse( 0, 0, 1, 1, 8, Math.PI / 8 ) );
			break;
		case 'blossomwindow':
			add( blossom( 0, 0, 1, Math.round( density / 2 ), 0.78 ) );
			break;
		case 'postage': {
			ring = [];
			for ( let e = 0; e < 4; e++ )
				for ( let i = 0; i < density * 12; i++ ) {
					const t = i / ( density * 12 ),
						x = -1 + 2 * t,
						y =
							-1 +
							0.085 *
								( 0.5 + 0.5 * Math.cos( t * density * TAU ) ) *
								Math.sin( t * Math.PI ) ** 0.2;
					ring.push(
						e === 0
							? [ x, y ]
							: e === 1
							? [ -y, x ]
							: e === 2
							? [ -x, -y ]
							: [ y, -x ]
					);
				}
			add( ring );
			break;
		}
		case 'deckle': {
			ring = [];
			for ( let e = 0; e < 4; e++ )
				for ( let i = 0; i < 60; i++ ) {
					const x = -1 + ( 2 * i ) / 60,
						y = -1 + r() * 0.13 * rough;
					ring.push(
						e === 0
							? [ x, y ]
							: e === 1
							? [ -y, x ]
							: e === 2
							? [ -x, -y ]
							: [ y, -x ]
					);
				}
			add( ring );
			break;
		}
		case 'organic': {
			const phase = r() * TAU;
			add(
				Array.from( { length: 120 }, ( _, i ) => {
					const a = ( i * TAU ) / 120,
						rr =
							1 +
							rough *
								( 0.16 * Math.sin( 3 * a + phase ) +
									0.1 * Math.cos( 5 * a ) );
					return [ Math.cos( a ) * rr, Math.sin( a ) * rr ];
				} )
			);
			break;
		}
		case 'branched':
		case 'leafwreath':
		case 'flowerwreath': {
			// Holes within the aperture stamp leave leaves/flowers attached to the paper edge.
			const outer =
				o.window === 'branched'
					? arch( true )
					: ellipse( 0, 0, 1, 1, 120 );
			const holes = [];
			if ( o.window === 'branched' ) {
				for ( const side of [ -1, 1 ] )
					for ( let i = 0; i < Math.round( density / 2 ); i++ ) {
						const y =
								0.76 -
								( i * 1.28 ) /
									( Math.round( density / 2 ) - 1 ),
							x =
								side *
								( y < -0.08
									? 1 - ( Math.abs( y ) - 0.08 ) * 0.7
									: 1 ),
							tx = x - side * 0.25,
							ty = y - 0.18;
						holes.push(
							stem( x * 1.03, y, tx, ty, 0.025 ),
							leaf( tx, ty, tx - side * 0.17, ty - 0.09, 0.065 ),
							leaf(
								x - side * 0.12,
								y - 0.07,
								x - side * 0.26,
								y + 0.08,
								0.06
							)
						);
					}
			}

			for ( let i = 0; o.window !== 'branched' && i < density; i++ ) {
				const a = ( i * TAU ) / density,
					x = Math.cos( a ),
					y = Math.sin( a );
				holes.push(
					o.window === 'flowerwreath'
						? blossom( x * 0.98, y * 0.98, 0.2, 5 )
						: leaf(
								x * 1.1,
								y * 1.1,
								x * 0.66 - Math.sin( a ) * 0.1,
								y * 0.66 + Math.cos( a ) * 0.1,
								0.09
						  )
				);
			}
			// Intersect these ornament cutbacks with the aperture in scene.js, rather than XOR outside it.
			stamps = [ [ outer ] ];
			return {
				apertures: fitWindow(
					stamps,
					w / 2,
					h / 2,
					w * ( 0.5 - o.inset / 100 ),
					h * ( 0.5 - o.inset / 100 )
				),
				ornaments: holes.map( ( p ) => [
					p.map( ( [ x, y ] ) => [
						w / 2 + x * w * ( 0.5 - o.inset / 100 ),
						h / 2 + y * h * ( 0.5 - o.inset / 100 ),
					] ),
				] ),
			};
		}
		case 'mountainwindow': {
			ring = [
				[ -1, 1 ],
				[ -1, -0.08 ],
			];
			for ( let i = 0; i <= 12; i++ )
				ring.push( [
					-1 + i / 6,
					-0.35 - r() * ( 0.4 + rough * 0.3 ),
				] );
			ring.push( [ 1, 1 ] );
			add( ring );
			break;
		}
		case 'doublearch': {
			const gap = 0.04 + ( ( o.spacing ?? 35 ) / 100 ) * 0.22;
			for ( const x of [ -1, 1 ] )
				add(
					arch().map( ( [ px, py ] ) => [
						x * ( 0.5 + gap / 2 ) + px * ( 0.5 - gap / 2 ),
						py,
					] )
				);
			break;
		}
		case 'triplecircle': {
			const gap = 0.03 + ( ( o.spacing ?? 35 ) / 100 ) * 0.2;
			for ( let i = -1; i <= 1; i++ )
				add( ellipse( i * ( 0.67 + gap ), 0, 0.32 - gap / 2, 0.8 ) );
			break;
		}
		case 'crossbar': {
			const gap = 0.03 + ( ( o.spacing ?? 35 ) / 100 ) * 0.17;
			for ( const x of [ -1, 1 ] )
				for ( const y of [ -1, 1 ] )
					add(
						rect(
							x < 0 ? -1 : gap,
							y < 0 ? -1 : gap,
							1 - gap,
							1 - gap
						)
					);
			break;
		}
		case 'panorama':
			add( rect( -1, -0.42, 2, 0.84 ) );
			break;
	}
	const rx = w * ( 0.5 - o.inset / 100 ),
		ry = h * ( 0.5 - o.inset / 100 );
	// Preserve the intentional narrow panorama and round triptych panes.
	if ( o.window === 'panorama' )
		return {
			apertures: fitWindow( stamps, w / 2, h / 2, rx, ry * 0.46 ),
			ornaments: [],
		};
	if ( o.window === 'triplecircle' )
		return {
			apertures: fitWindow(
				stamps,
				w / 2,
				h / 2,
				rx,
				Math.min(
					ry,
					( rx *
						( 0.32 -
							( 0.03 + ( ( o.spacing ?? 35 ) / 100 ) * 0.2 ) /
								2 ) ) /
						( 0.99 +
							( 0.03 + ( ( o.spacing ?? 35 ) / 100 ) * 0.2 ) / 2 )
				)
			),
			ornaments: [],
		};
	const upright = [ 'keyhole', 'acorn', 'egg' ].includes( o.window );
	return {
		apertures: fitWindow(
			stamps,
			w / 2,
			h / 2,
			upright ? Math.min( rx, ry * 0.78 ) : rx,
			ry
		),
		ornaments: [],
	};
}
