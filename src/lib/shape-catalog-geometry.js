/**
 * Approved parametric constructions. Internal SVG primitives are compiled
 * to the same filled command lists as the original dynamic shapes.
 */
import PolyBool from 'polybooljs';
import { BOLD_SHAPE_GEOMETRY } from './shape-catalog-bold-geometry';
import { LAYOUT_SHAPE_GEOMETRY } from './shape-catalog-layout-geometry';
const TAU = Math.PI * 2;
const f = ( x ) => Number( x.toFixed( 3 ) );
const pt = ( p ) => `${ f( p[ 0 ] ) },${ f( p[ 1 ] ) }`;
const polygon = ( pts ) => `M${ pts.map( pt ).join( 'L' ) }Z`;
const path = ( d ) => `<path d="${ d }"/>`;
const add = ( a, b ) => [ a[ 0 ] + b[ 0 ], a[ 1 ] + b[ 1 ] ];
const mul = ( a, s ) => [ a[ 0 ] * s, a[ 1 ] * s ];
function bandPoints( points, widths ) {
	const left = [],
		right = [];
	for ( let i = 0; i < points.length; i++ ) {
		const a = points[ Math.max( 0, i - 1 ) ],
			b = points[ Math.min( points.length - 1, i + 1 ) ];
		const dx = b[ 0 ] - a[ 0 ],
			dy = b[ 1 ] - a[ 1 ],
			len = Math.hypot( dx, dy ) || 1;
		const n = [ -dy / len, dx / len ],
			r = typeof widths === 'number' ? widths : widths[ i ];
		left.push( add( points[ i ], mul( n, r ) ) );
		right.push( add( points[ i ], mul( n, -r ) ) );
	}
	return [ ...left, ...right.reverse() ];
}
const band = ( points, widths ) => polygon( bandPoints( points, widths ) );
function lamella( { count, twist, belly, gap, kind } ) {
	const section = ( t, u ) => {
		let radius, center;
		if ( kind === 'shell' ) {
			radius = 17 + 93 * Math.sin( ( Math.PI * t ) / 2 ) ** 0.8;
			center = 32 * Math.sin( t * Math.PI * 0.85 );
		} else if ( kind === 'ribbon' ) {
			radius = 63 + 28 * Math.cos( TAU * t );
			center = 34 * Math.sin( TAU * t );
		} else {
			radius =
				26 +
				belly * 70 * Math.sin( Math.PI * t ) ** 1.2 +
				11 * Math.cos( TAU * t );
			center = twist * 0.13 * Math.sin( TAU * t );
		}
		const slant = twist * Math.sin( Math.PI * ( t - 0.5 ) );
		const depth =
			( kind === 'shell' ? 29 : 23 ) *
			Math.sin( Math.PI * t * 0.85 + 0.25 );
		return [
			center + radius * u,
			-116 + 232 * t + slant * u + depth * ( 1 - u * u ),
		];
	};
	let shapes = '';
	for ( let i = 0; i < count; i++ ) {
		const a = ( i + gap / 2 ) / count,
			b = ( i + 1 - gap / 2 ) / count,
			pts = [];
		for ( let j = 0; j <= 64; j++ ) {
			pts.push( section( a, -1 + ( 2 * j ) / 64 ) );
		}
		for ( let j = 64; j >= 0; j-- ) {
			pts.push( section( b, -1 + ( 2 * j ) / 64 ) );
		}
		shapes += path( polygon( pts ) );
	}
	return shapes;
}
function frond( { pairs, width, curve, angle, kind } ) {
	const c = ( t ) => [ curve * ( t * t - 0.32 ), 122 - 248 * t ];
	const tangent = ( t ) => {
		const dx = 2 * curve * t,
			dy = -248,
			l = Math.hypot( dx, dy );
		return [ dx / l, dy / l ];
	};
	const stem = [],
		widths = [];
	for ( let i = 0; i <= 100; i++ ) {
		stem.push( c( i / 100 ) );
		widths.push( 1.65 * ( 1 - i / 110 ) );
	}
	let shapes = path( band( stem, widths ) );
	const leaf = ( base, dir, len, w, sweep ) => {
		const norm = [ -dir[ 1 ], dir[ 0 ] ],
			points = [],
			radii = [];
		for ( let i = 0; i <= 48; i++ ) {
			const u = i / 48;
			points.push(
				add(
					add( base, mul( dir, len * u ) ),
					mul( norm, sweep * Math.sin( Math.PI * u ) )
				)
			);
			radii.push( w * 0.62 * Math.sin( Math.PI * u ) ** 0.9 );
		}
		return path( band( points, radii ) );
	};
	for ( let i = 0; i < pairs; i++ ) {
		for ( const side of [ -1, 1 ] ) {
			const t =
				0.12 +
				( ( i + ( kind === 'olive' && side === 1 ? 0.42 : 0 ) ) *
					0.79 ) /
					pairs;
			const base = c( t ),
				tan = tangent( t ),
				normal = [ -tan[ 1 ], tan[ 0 ] ];
			const ang = ( angle * Math.PI ) / 180;
			const dir = add(
				mul( tan, Math.cos( ang ) ),
				mul( normal, side * Math.sin( ang ) )
			);
			const envelope = Math.sin( Math.PI * ( t * 0.97 + 0.03 ) ) ** 0.72;
			const len =
				( kind === 'olive' ? 46 : kind === 'fern' ? 88 : 110 ) *
				envelope;
			shapes += leaf(
				base,
				dir,
				len,
				width * envelope,
				-side * ( kind === 'palm' ? 19 : kind === 'fern' ? 11 : 4 )
			);
		}
	}
	shapes += leaf( c( 0.91 ), tangent( 0.91 ), 31, width * 0.55, 2 );
	return shapes;
}
function braid( { strands, turns, width, gap, amp, orientation } ) {
	const length = 244,
		N = 360;
	const point = ( i, t ) => {
		const a = TAU * ( turns * t + i / strands );
		return [ length * ( t - 0.5 ), amp * Math.sin( a ) ];
	};
	let shapes = '';
	for ( let i = 0; i < strands; i++ ) {
		const pts = Array.from(
			{
				length: N + 1,
			},
			( _, k ) => point( i, k / N )
		);
		let poly = {
			regions: [ bandPoints( pts, width / 2 ) ],
			inverted: false,
		};
		for ( let j = 0; j < strands; j++ ) {
			if ( i === j ) {
				continue;
			}
			let run = [];
			const flush = () => {
				if ( run.length > 1 ) {
					poly = PolyBool.difference( poly, {
						regions: [ bandPoints( run, width / 2 + gap ) ],
						inverted: false,
					} );
				}
				run = [];
			};
			for ( let k = 0; k <= N; k++ ) {
				const t = k / N,
					a = TAU * ( turns * t + i / strands ),
					b = TAU * ( turns * t + j / strands );
				if ( Math.cos( b ) > Math.cos( a ) ) {
					run.push( point( j, t ) );
				} else {
					flush();
				}
			}
			flush();
		}
		shapes +=
			'<path fill-rule="evenodd" d="' +
			poly.regions.map( polygon ).join( '' ) +
			'"/>';
	}
	return '<g transform="rotate(' + orientation + ')">' + shapes + '</g>';
}
const sample = ( fn, n = 120 ) =>
	Array.from(
		{
			length: n + 1,
		},
		( _, i ) => fn( i / n )
	);
const line = ( pts, w = 2, closed = false ) =>
	`<path d="M${ pts.map( pt ).join( 'L' ) }${
		closed ? 'Z' : ''
	}" fill="none" stroke="currentColor" stroke-width="${ f(
		w
	) }" stroke-linecap="round" stroke-linejoin="round"/>`;
const disk = ( x, y, r ) =>
	`<circle cx="${ f( x ) }" cy="${ f( y ) }" r="${ f(
		Math.max( 0.1, r )
	) }"/>`;
const rect = ( x, y, w, h, r = 0 ) =>
	`<rect x="${ f( x ) }" y="${ f( y ) }" width="${ f( w ) }" height="${ f(
		h
	) }" rx="${ r }"/>`;
const rot = ( markup, a, x = 0, y = 0 ) =>
	`<g transform="rotate(${ a } ${ x } ${ y })">${ markup }</g>`;
const polar = ( r, t, cx = 0, cy = 0 ) => [
	cx + r * Math.cos( t ),
	cy + r * Math.sin( t ),
];
const arc = ( r, a, b, cx = 0, cy = 0 ) =>
	sample( ( t ) => polar( r, a + ( b - a ) * t, cx, cy ), 70 );
const sector = ( r1, r2, a, b ) =>
	path( polygon( [ ...arc( r2, a, b ), ...arc( r1, b, a ) ] ) );
const bez = ( a, b, c, d, t ) =>
	add(
		add( mul( a, ( 1 - t ) ** 3 ), mul( b, 3 * ( 1 - t ) ** 2 * t ) ),
		add( mul( c, 3 * ( 1 - t ) * t * t ), mul( d, t ** 3 ) )
	);
const leafShape = ( base, tip, width, bend = 0 ) => {
	const dx = tip[ 0 ] - base[ 0 ],
		dy = tip[ 1 ] - base[ 1 ],
		len = Math.hypot( dx, dy ),
		normal = [ -dy / len, dx / len ];
	const pts = sample(
		( t ) =>
			add(
				add( base, [ dx * t, dy * t ] ),
				mul( normal, bend * Math.sin( Math.PI * t ) )
			),
		44
	);
	return path(
		band(
			pts,
			pts.map(
				( _, i ) =>
					width * Math.sin( ( Math.PI * i ) / ( pts.length - 1 ) )
			)
		)
	);
};
const G = {};
G.lamellen = ( p ) =>
	lamella( {
		count: p.n,
		twist: ( p.a - 50 ) * 1.6,
		belly: 1,
		gap: 0.2 + p.b * 0.006,
		kind: 'vase',
	} );
G.globus = ( p ) => {
	let s = '';
	const inc = ( p.a - 50 ) * 0.012,
		pr = ( x, y, z ) => [ x, y * Math.cos( inc ) - z * Math.sin( inc ) ];
	for ( let j = 0; j < p.n; j++ ) {
		const a = ( j * Math.PI ) / p.n;
		s += line(
			sample( ( t ) => {
				const q = TAU * t;
				return pr(
					112 * Math.sin( q ) * Math.cos( a ),
					112 * Math.cos( q ),
					112 * Math.sin( q ) * Math.sin( a )
				);
			} ),
			1 + p.b * 0.035
		);
	}
	for ( let j = 1; j < p.n; j++ ) {
		const lat = -Math.PI / 2 + ( j * Math.PI ) / p.n;
		s += line(
			sample( ( t ) =>
				pr(
					112 * Math.cos( lat ) * Math.cos( TAU * t ),
					112 * Math.sin( lat ),
					112 * Math.cos( lat ) * Math.sin( TAU * t )
				)
			),
			1 + p.b * 0.035
		);
	}
	return s;
};
G.torus = ( p ) => {
	let s = '';
	const inc = 0.45 + p.a * 0.009,
		major = 77,
		minor = 31;
	const project = ( u, v ) => {
		const x = ( major + minor * Math.cos( v ) ) * Math.cos( u ),
			z = ( major + minor * Math.cos( v ) ) * Math.sin( u ),
			y = minor * Math.sin( v );
		return [ x, z * Math.sin( inc ) + y * Math.cos( inc ) ];
	};
	for ( let i = 0; i < p.n; i++ ) {
		s += line(
			sample( ( t ) => project( ( TAU * i ) / p.n, TAU * t ) ),
			0.7 + p.b * 0.025
		);
	}
	for ( let i = 0; i < 9; i++ ) {
		s += line(
			sample( ( t ) => project( TAU * t, ( TAU * i ) / 9 ) ),
			0.7 + p.b * 0.025
		);
	}
	return s;
};
G.faltfaecher = ( p ) => {
	let s = '';
	const span = ( ( 70 + p.a * 2 ) * Math.PI ) / 180;
	for ( let i = 0; i < p.n; i++ ) {
		const a = -Math.PI / 2 - span / 2 + ( span * i ) / p.n,
			b = a + ( span / p.n ) * 0.83,
			r = i % 2 ? 104 : 125;
		s += path(
			polygon( [ [ 0, 52 ], polar( r, a, 0, 52 ), polar( r, b, 0, 52 ) ] )
		);
	}
	return s + disk( 0, 52, 3 + p.b * 0.08 );
};
G.faltband = ( p ) => {
	let s = '';
	const h = 32 + p.a * 0.8,
		w = 250 / p.n,
		g = 1 + p.b * 0.075;
	for ( let i = 0; i < p.n; i++ ) {
		const x = -125 + i * w,
			y = i % 2 ? h / 2 : -h / 2;
		s += path(
			polygon( [
				[ x + g, y - 24 ],
				[ x + w - g, -y - 24 ],
				[ x + w - g, -y + 24 ],
				[ x + g, y + 24 ],
			] )
		);
	}
	return s;
};
G.helix = ( p ) => {
	const a = 26 + p.a * 0.5,
		turns = p.n / 7,
		w = 1.5 + p.b * 0.05;
	let s = '';
	for ( let i = 0; i <= p.n * 2; i++ ) {
		const t = i / ( p.n * 2 ),
			x = a * Math.sin( t * TAU * turns );
		s += line(
			[
				[ -x, -125 + 250 * t ],
				[ x, -125 + 250 * t ],
			],
			w * 0.7
		);
	}
	for ( const k of [ -1, 1 ] ) {
		s += line(
			sample(
				( t ) => [
					k * a * Math.sin( t * TAU * turns ),
					-125 + 250 * t,
				],
				220
			),
			w * 2
		);
	}
	return s;
};
G.tunnel = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		const t = i / Math.max( 1, p.n - 1 ),
			k = ( 1 - t * 0.91 ) ** 1.5,
			cx = ( p.a - 50 ) * 1.2 * t,
			cy = -32 * t,
			w = 120 * k,
			h = 100 * k;
		s += line(
			[
				[ cx - w, cy - h ],
				[ cx + w, cy - h ],
				[ cx + w, cy + h ],
				[ cx - w, cy + h ],
			],
			1 + p.b * 0.035,
			true
		);
	}
	return s;
};
G.kuppel = ( p ) => {
	let s = '';
	const flat = 0.3 + p.a * 0.006;
	for ( let j = 0; j < p.n; j++ ) {
		const a = ( j * TAU ) / p.n;
		s += line(
			sample( ( t ) => {
				const q = ( t * Math.PI ) / 2;
				return [
					115 * Math.sin( q ) * Math.cos( a ),
					62 +
						115 * Math.sin( q ) * Math.sin( a ) * flat -
						136 * Math.cos( q ),
				];
			} ),
			1 + p.b * 0.027
		);
	}
	for ( let j = 1; j <= 6; j++ ) {
		const q = ( j * Math.PI ) / 12;
		s += line(
			sample( ( t ) => [
				115 * Math.sin( q ) * Math.cos( t * TAU ),
				62 +
					115 * Math.sin( q ) * Math.sin( t * TAU ) * flat -
					136 * Math.cos( q ),
			] ),
			1 + p.b * 0.027
		);
	}
	return s;
};
G.wellenflaeche = ( p ) => {
	let s = '';
	const proj = ( u, v ) => [
		95 * u + 38 * v,
		55 * v - 28 * u - ( 12 + p.a * 0.48 ) * Math.cos( u * 2.5 + v * 1.7 ),
	];
	for ( let i = 0; i < p.n; i++ ) {
		const k = -1 + ( 2 * i ) / ( p.n - 1 );
		s += line(
			sample( ( t ) => proj( -1 + 2 * t, k ) ),
			0.8 + p.b * 0.028
		);
		s += line(
			sample( ( t ) => proj( k, -1 + 2 * t ) ),
			0.8 + p.b * 0.028
		);
	}
	return s;
};
G.wedel = ( p ) =>
	frond( {
		pairs: p.n,
		width: 3 + p.b * 0.11,
		curve: ( p.a - 35 ) * 1.4,
		angle: 66,
		kind: 'palm',
	} );
G.feder = ( p ) => {
	let s = '';
	const c = ( t ) => [ -26 + 40 * t * t, 130 - 250 * t ],
		w = 1 + p.b * 0.04;
	s += line( sample( c ), w * 1.5 );
	for ( let j = 0; j < p.n; j++ ) {
		const t = 0.16 + ( j * 0.79 ) / p.n,
			b = c( t ),
			len = ( 35 + p.a * 0.62 ) * Math.sin( Math.PI * t ) ** 0.7;
		for ( const side of [ -1, 1 ] ) {
			const tip = [ b[ 0 ] + side * len, b[ 1 ] - 32 ];
			s += leafShape( b, tip, 1.6 + p.b * 0.045, -side * 9 );
		}
	}
	return s;
};
G.aehre = ( p ) => {
	let s = line(
		[
			[ 0, 132 ],
			[ 0, -111 ],
		],
		2 + p.b * 0.033
	);
	for ( let i = 0; i < p.n; i++ ) {
		const t = i / ( p.n - 1 ),
			y = 72 - 172 * t,
			len = 36 * ( 1 - 0.55 * t ),
			open = 17 + p.a * 0.36;
		for ( const side of [ -1, 1 ] ) {
			const end = [ side * open * ( 1 - 0.35 * t ), y - len ];
			s += leafShape( [ 0, y ], end, 5 + p.b * 0.045, side * 4 );
			s += line( [ end, [ end[ 0 ] + side * 8, end[ 1 ] - 18 ] ], 0.8 );
		}
	}
	return s + leafShape( [ 0, -88 ], [ 0, -134 ], 6, 0 );
};
G.kranz = ( p ) => {
	let s = '';
	const gap = 0.25 + p.a * 0.011;
	for ( const side of [ -1, 1 ] ) {
		const a = Math.PI / 2,
			b = side === 1 ? -Math.PI / 2 + gap : ( 3 * Math.PI ) / 2 - gap,
			pts = arc( 96, a, b );
		s += line( pts, 2 + p.b * 0.015 );
		for ( let i = 1; i <= p.n; i++ ) {
			const t = i / ( p.n + 1 ),
				q = a + ( b - a ) * t,
				base = polar( 96, q );
			for ( const out of [ -1, 1 ] ) {
				const end = polar(
					96 + out * 24,
					q + ( side === 1 ? -0.19 : 0.19 )
				);
				s += leafShape( base, end, 4 + p.b * 0.045, out * side * 3 );
			}
		}
	}
	return s;
};
G.lotos = ( p ) => {
	let s = '';
	const n = p.n,
		spread = 45 + p.a * 0.65,
		w = 1.2 + p.b * 0.042;
	for ( let i = 0; i < n; i++ ) {
		const u = ( i - ( n - 1 ) / 2 ) / Math.max( 1, ( n - 1 ) / 2 ),
			base = [ u * 6, 78 ],
			tip = [ u * spread, -118 + Math.abs( u ) * 118 ],
			dx = tip[ 0 ] - base[ 0 ],
			dy = tip[ 1 ] - base[ 1 ],
			len = Math.hypot( dx, dy ),
			normal = [ -dy / len, dx / len ],
			wid = 13 + p.b * 0.15;
		const c1 = add(
				add( base, mul( [ dx, dy ], 0.25 ) ),
				mul( normal, wid )
			),
			c2 = add(
				add( base, mul( [ dx, dy ], 0.72 ) ),
				mul( normal, wid )
			);
		const c3 = add(
				add( base, mul( [ dx, dy ], 0.72 ) ),
				mul( normal, -wid )
			),
			c4 = add(
				add( base, mul( [ dx, dy ], 0.25 ) ),
				mul( normal, -wid )
			);
		s += line(
			[
				...sample( ( t ) => bez( base, c1, c2, tip, t ), 42 ),
				...sample( ( t ) => bez( tip, c3, c4, base, t ), 42 ),
			],
			w,
			true
		);
	}
	for ( const side of [ -1, 1 ] ) {
		s += leafShape(
			[ 0, 82 ],
			[ side * 115, 51 ],
			9 + p.b * 0.05,
			-side * 18
		);
	}
	return s;
};
G.ginkgo = ( p ) => {
	const rays = p.n,
		span = ( ( 85 + p.a * 0.8 ) * Math.PI ) / 180;
	let s = line(
		[
			[ 0, 120 ],
			[ 0, 48 ],
		],
		3
	);
	for ( let i = 0; i < rays; i++ ) {
		const a = -Math.PI / 2 - span / 2 + ( span * i ) / rays,
			b = a + ( span / rays ) * ( 0.38 + p.b * 0.0055 ),
			m = ( a + b ) / 2,
			r = 165 - 24 * Math.exp( -Math.pow( ( m + Math.PI / 2 ) * 5, 2 ) );
		s += path( polygon( [ [ 0, 48 ], ...arc( r, a, b, 0, 48 ) ] ) );
	}
	return s;
};
G.schlitzblatt = ( p ) => {
	const wide = 0.73 + p.a * 0.006;
	const boundary = [
		...sample(
			( t ) =>
				bez(
					[ 0, 107 ],
					[ -122 * wide, 106 ],
					[ -132 * wide, -35 ],
					[ 12, -122 ],
					t
				),
			90
		),
		...sample(
			( t ) =>
				bez(
					[ 12, -122 ],
					[ 144 * wide, -33 ],
					[ 124 * wide, 98 ],
					[ 0, 107 ],
					t
				),
			90
		),
	];
	let poly = {
		regions: [ boundary ],
		inverted: false,
	};
	for ( let j = 0; j < p.n; j++ ) {
		for ( const side of [ -1, 1 ] ) {
			const y = 72 - ( j * 152 ) / Math.max( 1, p.n - 1 ),
				inner = 13 + p.b * 0.15,
				edge = side * 180 * wide;
			const cut = [
				...sample(
					( t ) =>
						bez(
							[ edge, y - 38 ],
							[ side * 116 * wide, y - 38 ],
							[ side * 54, y - 18 ],
							[ side * inner, y - 12 ],
							t
						),
					35
				),
				...sample(
					( t ) =>
						bez(
							[ side * inner, y - 12 ],
							[ side * 52, y - 10 ],
							[ side * 118 * wide, y + 8 ],
							[ edge, y + 8 ],
							t
						),
					35
				),
			];
			poly = PolyBool.difference( poly, {
				regions: [ cut ],
				inverted: false,
			} );
		}
	}
	return (
		`<path fill-rule="evenodd" d="${ poly.regions
			.map( polygon )
			.join( '' ) }"/>` +
		line(
			[
				[ 0, 105 ],
				[ -13, 145 ],
			],
			2.5
		)
	);
};
G.seetang = ( p ) => {
	let s = '';
	for ( let j = 0; j < p.n; j++ ) {
		const off = ( j - ( p.n - 1 ) / 2 ) * 18,
			phase = j * 0.9,
			pts = sample(
				( t ) => [
					off * t +
						( 12 + p.a * 0.4 ) * Math.sin( t * 6 + phase ) * t,
					120 -
						240 * t * ( 0.76 + 0.24 * Math.sin( j * 2 + 1 ) ** 2 ),
				],
				100
			);
		s += path(
			band(
				pts,
				pts.map(
					( _, i ) =>
						( 4 + p.b * 0.095 ) *
						Math.sin( ( Math.PI * i ) / ( pts.length - 1 ) ) ** 0.7
				)
			)
		);
	}
	return s;
};
G.gras = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		const u = ( i - ( p.n - 1 ) / 2 ) / Math.max( 1, ( p.n - 1 ) / 2 ),
			tip = [
				u * ( 45 + p.a ),
				-105 + Math.abs( u ) * 95 + 12 * Math.sin( i * 3 ),
			];
		s += leafShape( [ u * 10, 116 ], tip, 2 + p.b * 0.06, -u * 30 );
	}
	return s;
};
G.dolde = ( p ) => {
	let s = line(
		[
			[ 0, 126 ],
			[ 0, 15 ],
		],
		3
	);
	const spread = ( ( 90 + p.a ) * Math.PI ) / 180;
	for ( let i = 0; i < p.n; i++ ) {
		const a = -Math.PI / 2 - spread / 2 + ( spread * i ) / ( p.n - 1 ),
			tip = polar( 95, a, 0, 15 );
		s += line( [ [ 0, 15 ], tip ], 1.4 );
		for ( let j = 0; j < 5; j++ ) {
			const end = polar( 17, a + ( j - 2 ) * 0.28, ...tip );
			s += line( [ tip, end ], 0.9 ) + disk( ...end, 2 + p.b * 0.035 );
		}
	}
	return s;
};
G.flechtband = ( p ) =>
	braid( {
		strands: p.n,
		turns: 1.2 + p.a * 0.019,
		width: 3 + p.b * 0.115,
		gap: 2.4,
		amp: 42,
		orientation: -90,
	} );
G.kette = ( p ) => {
	let s = '';
	const h = 230 / p.n,
		wide = 18 + p.a * 0.2,
		th = 2 + p.b * 0.065;
	for ( let i = 0; i < p.n; i++ ) {
		const y = -115 + i * h,
			rx = i % 2 ? wide * 0.43 : wide;
		s += `<ellipse cx="0" cy="${ y + h / 2 }" rx="${ rx }" ry="${
			h * 0.64
		}" fill="none" stroke="currentColor" stroke-width="${ th }"/>`;
	}
	return rot( s, -26 );
};
G.webgitter = ( p ) => {
	const count = p.n,
		slot = 225 / count,
		w = slot * ( 0.18 + p.b * 0.0055 ),
		shift = p.a * 0.006;
	let s = '';
	for ( let y = 0; y < count; y++ ) {
		for ( let x = 0; x < count; x++ ) {
			const cx = -112.5 + ( x + 0.5 ) * slot,
				cy = -112.5 + ( y + 0.5 ) * slot;
			if ( ( x + y ) % 2 ) {
				s += rect( cx - w / 2, cy - slot / 2, w, slot );
				s +=
					rect( cx - slot / 2, cy - w / 2, ( slot - w ) / 2 - 2, w ) +
					rect( cx + w / 2 + 2, cy - w / 2, ( slot - w ) / 2 - 2, w );
			} else {
				s += rect( cx - slot / 2, cy - w / 2, slot, w );
				s +=
					rect( cx - w / 2, cy - slot / 2, w, ( slot - w ) / 2 - 2 ) +
					rect( cx - w / 2, cy + w / 2 + 2, w, ( slot - w ) / 2 - 2 );
			}
		}
	}
	return `<g transform="skewX(${ shift * 20 })">${ s }</g>`;
};
G.deco = ( p ) => {
	let s = '';
	const n = p.n,
		span = ( ( 85 + p.a ) * Math.PI ) / 180,
		w = 1 + p.b * 0.05;
	for ( let j = 0; j < n; j++ ) {
		const a = -Math.PI / 2 - span / 2 + ( j * span ) / ( n - 1 );
		s += line( [ polar( 24, a, 0, 89 ), polar( 187, a, 0, 89 ) ], w );
	}
	for ( let k = 0; k < 5; k++ ) {
		s += line(
			arc(
				60 + k * 31,
				-Math.PI / 2 - span / 2,
				-Math.PI / 2 + span / 2,
				0,
				89
			),
			w
		);
	}
	return s;
};
G.maeander = ( p ) => {
	let s = '';
	const slot = 240 / p.n;
	const h = 22 + p.a * 0.4;
	const w = 2 + p.b * 0.07;
	for ( let i = 0; i < p.n; i++ ) {
		const x = -120 + i * slot;
		s += line(
			[
				[ x, -h ],
				[ x + slot * 0.82, -h ],
				[ x + slot * 0.82, h ],
				[ x + slot * 0.25, h ],
				[ x + slot * 0.25, -h * 0.45 ],
				[ x + slot * 0.58, -h * 0.45 ],
				[ x + slot * 0.58, h * 0.42 ],
			],
			w
		);
	}
	return (
		s +
		line(
			[
				[ -125, h + 14 ],
				[ 125, h + 14 ],
			],
			w * 0.6
		) +
		line(
			[
				[ -125, -h - 14 ],
				[ 125, -h - 14 ],
			],
			w * 0.6
		)
	);
};
G.klammer = ( p ) => {
	const depth = 10 + p.a * 0.46,
		w = 1.2 + p.b * 0.05;
	let s = '';
	const left = [
		...sample(
			( t ) =>
				bez(
					[ -119, -16 ],
					[ -117, depth ],
					[ -67, depth * 0.52 ],
					[ -33, depth * 0.54 ],
					t
				),
			45
		),
		...sample(
			( t ) =>
				bez(
					[ -33, depth * 0.54 ],
					[ -14, depth * 0.54 ],
					[ -5, depth * 0.67 ],
					[ 0, depth * 1.3 ],
					t
				),
			35
		),
	];
	s +=
		line( left, w ) +
		line(
			left.map( ( [ x, y ] ) => [ -x, y ] ),
			w
		);
	for ( let i = 0; i < p.n; i++ ) {
		const r = Math.max( 1.1, 3 - i * 0.22 );
		s +=
			disk( -125 - i * 5, -21 - i * 4, r ) +
			disk( 125 + i * 5, -21 - i * 4, r );
	}
	return s;
};
G.spitze = ( p ) => {
	let s = '';
	const slot = 250 / p.n;
	const r = slot * 0.5;
	const w = 1 + p.b * 0.025;
	s +=
		line(
			[
				[ -125, -25 ],
				[ 125, -25 ],
			],
			w * 2
		) +
		line(
			[
				[ -125, -14 ],
				[ 125, -14 ],
			],
			w
		);
	for ( let i = 0; i < p.n; i++ ) {
		const x = -125 + ( i + 0.5 ) * slot;
		s += line( arc( r, 0, Math.PI, x, -10 ), w );
		for ( let j = 0; j < 5; j++ ) {
			const a = ( ( j + 0.5 ) * Math.PI ) / 5,
				end = polar( r, a, x, -10 );
			s += line( [ [ x, -10 ], end ], w * 0.65 );
			s += disk( ...end, 1 + p.a * 0.025 );
		}
		s += line( arc( r * 0.55, 0, Math.PI, x, -10 ), w * 0.7 );
	}
	return s;
};
G.tropfen = ( p ) => {
	const n = p.n,
		slot = 250 / n,
		depth = 40 + p.a * 1.1;
	let d = 'M-125,-110L125,-110L125,-35';
	for ( let j = n - 1; j >= 0; j-- ) {
		const cx = -125 + slot * ( j + 0.5 ),
			left = -125 + j * slot,
			r = slot * ( 0.12 + p.b * 0.0024 ),
			bottom =
				-35 + depth * ( 0.45 + 0.55 * Math.sin( j * 2.7 + 1 ) ** 2 );
		d += `C${ cx + r },-35 ${ cx + r },-17 ${ cx + r },${ bottom - r } C${
			cx + r
		},${ bottom + r * 0.34 } ${ cx - r },${ bottom + r * 0.34 } ${
			cx - r
		},${ bottom - r } C${ cx - r },-17 ${ cx - r },-35 ${ left },-35`;
	}
	return path( d + 'Z' );
};
G.segmentringe = ( p ) => {
	let s = '';
	for ( let j = 0; j < 5; j++ ) {
		const r = 32 + j * 21,
			offset = j * p.a * 0.006;
		for ( let i = 0; i < p.n; i++ ) {
			const a = ( TAU * i ) / p.n + offset,
				span = ( TAU / p.n ) * ( 0.38 + p.b * 0.005 );
			if ( ( i + j * 2 ) % 7 !== 0 ) {
				s += sector( r - 6, r + 6, a, a + span );
			}
		}
	}
	return s;
};
G.skala = ( p ) => {
	let s = '';
	const bend = p.a * 0.014,
		point = ( t ) =>
			bend < 0.01
				? [ -120 + 240 * t, 30 ]
				: [
						( 240 / bend ) * Math.sin( ( t - 0.5 ) * bend ),
						30 +
							( 240 / bend ) *
								( 1 - Math.cos( ( t - 0.5 ) * bend ) ),
				  ];
	s += line( sample( point ), 1 + p.b * 0.025 );
	for ( let i = 0; i <= p.n; i++ ) {
		const t = i / p.n,
			base = point( t ),
			len = i % 5 === 0 ? 43 : i % 2 === 0 ? 27 : 16,
			q = ( t - 0.5 ) * bend;
		s += line(
			[
				base,
				[
					base[ 0 ] + Math.sin( q ) * len,
					base[ 1 ] - Math.cos( q ) * len,
				],
			],
			1 + p.b * 0.045
		);
	}
	return s;
};
G.schallwelle = ( p ) => {
	const edge = ( sign ) =>
		sample( ( t ) => {
			const env =
				Math.sin( Math.PI * t ) ** 0.65 *
				( 0.62 + 0.38 * Math.sin( t * 13 + 1 ) ** 2 );
			const wave = 0.1 + 0.9 * Math.abs( Math.sin( t * p.n * Math.PI ) );
			return [
				-130 + 260 * t,
				sign * ( 35 + p.a * 0.7 ) * env * wave ** ( 1.3 - p.b * 0.008 ),
			];
		}, 800 );
	return path( polygon( [ ...edge( 1 ), ...edge( -1 ).reverse() ] ) );
};
G.iris = ( p ) => {
	let s = '';
	const r = 19 + p.a * 0.65,
		gap = 0.012 + p.b * 0.0013;
	for ( let i = 0; i < p.n; i++ ) {
		const a = ( i * TAU ) / p.n,
			b = a + TAU / p.n - gap;
		const pts = [
			...arc( 118, a, b ),
			polar( r, b + 0.7 ),
			...arc( r, b + 0.7, a + 0.7 ).slice( 1 ),
		];
		s += path( polygon( pts ) );
	}
	return s;
};
G.puzzle = ( p ) => {
	const pts = [],
		size = 86,
		k = 10 + p.a * 0.21;
	for ( let j = 0; j < 4; j++ ) {
		const sign = j < p.n ? -1 : 1,
			turn = ( q ) => [
				q[ 0 ] * Math.cos( ( j * Math.PI ) / 2 ) -
					q[ 1 ] * Math.sin( ( j * Math.PI ) / 2 ),
				q[ 0 ] * Math.sin( ( j * Math.PI ) / 2 ) +
					q[ 1 ] * Math.cos( ( j * Math.PI ) / 2 ),
			];
		const segments = [
			[
				[ -size, -size ],
				[ -k * 0.5, -size ],
			],
			sample(
				( t ) =>
					bez(
						[ -k * 0.5, -size ],
						[ -k * 0.5, -size + sign * k * 0.5 ],
						[ -k, -size + sign * k * 0.5 ],
						[ -k, -size + sign * k ],
						t
					),
				20
			),
			sample(
				( t ) =>
					bez(
						[ -k, -size + sign * k ],
						[ -k, -size + sign * k * 2.2 ],
						[ k, -size + sign * k * 2.2 ],
						[ k, -size + sign * k ],
						t
					),
				28
			),
			sample(
				( t ) =>
					bez(
						[ k, -size + sign * k ],
						[ k, -size + sign * k * 0.5 ],
						[ k * 0.5, -size + sign * k * 0.5 ],
						[ k * 0.5, -size ],
						t
					),
				20
			),
			[
				[ k * 0.5, -size ],
				[ size, -size ],
			],
		];
		for ( const seg of segments ) {
			pts.push( ...seg.map( turn ) );
		}
	}
	const d = polygon( pts );
	return `<path fill-rule="evenodd" d="${ d }${
		p.b > 0 ? polygon( arc( p.b * 0.66, 0, TAU ) ) : ''
	}"/>`;
};
G.fadengrafik = ( p ) => {
	let s = '';
	for ( let side = 0; side < 4; side++ ) {
		let q = '';
		for ( let i = 0; i <= p.n; i++ ) {
			const t = i / p.n;
			q += line(
				[
					[ -110 + 220 * t, -110 ],
					[ 110, -110 + 220 * t ** ( 0.45 + p.a * 0.014 ) ],
				],
				0.4 + p.b * 0.019
			);
		}
		s += rot( q, side * 90 );
	}
	return s;
};
G.schlangenpfeil = ( p ) => {
	const pts = sample(
			( t ) => [
				-123 + 226 * t,
				( 15 + p.a * 0.7 ) * Math.sin( t * Math.PI * p.n ),
			],
			240
		),
		w = 4 + p.b * 0.13;
	const tip = pts.at( -1 ),
		prev = pts.at( -2 ),
		len = Math.hypot( tip[ 0 ] - prev[ 0 ], tip[ 1 ] - prev[ 1 ] ),
		u = [ ( tip[ 0 ] - prev[ 0 ] ) / len, ( tip[ 1 ] - prev[ 1 ] ) / len ],
		norm = [ -u[ 1 ], u[ 0 ] ],
		end = add( tip, mul( u, 34 ) );
	return (
		path( band( pts, w ) ) +
		path(
			polygon( [
				add( tip, mul( norm, w * 2.8 ) ),
				end,
				add( tip, mul( norm, -w * 2.8 ) ),
			] )
		)
	);
};
G.fokus = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		const r = 80 + i * 16,
			l = 20 + p.a * 0.6;
		for ( let j = 0; j < 4; j++ ) {
			s += rot(
				line(
					[
						[ -r, -r + l ],
						[ -r, -r ],
						[ -r + l, -r ],
					],
					1 + p.b * 0.075
				),
				j * 90
			);
		}
	}
	return s;
};
G.seitenfalte = ( p ) => {
	const fold = 24 + p.a * 0.66,
		w = 1 + p.b * 0.06;
	let s = line(
		[
			[ -88, -118 ],
			[ 88 - fold, -118 ],
			[ 88, -118 + fold ],
			[ 88, 118 ],
			[ -88, 118 ],
		],
		w,
		true
	);
	s += line(
		[
			[ 88 - fold, -118 ],
			[ 88 - fold, -118 + fold ],
			[ 88, -118 + fold ],
		],
		w
	);
	for ( let i = 0; i < p.n; i++ ) {
		const y = -64 + ( i * 151 ) / Math.max( 1, p.n - 1 );
		s += line(
			[
				[ -58, y ],
				[ y < -118 + fold ? 66 - fold : 55, y ],
			],
			w * 0.6
		);
	}
	return s;
};
G.schneekristall = ( p ) => {
	let s = '';
	const w = 1 + p.b * 0.05;
	const angle = ( ( 20 + p.a * 0.45 ) * Math.PI ) / 180;
	for ( let i = 0; i < p.n; i++ ) {
		let b = line(
			[
				[ 0, 0 ],
				[ 0, -117 ],
			],
			w * 1.4
		);
		for ( let j = 1; j <= 4; j++ ) {
			const y = -20 - j * 19,
				len = 35 - j * 4;
			for ( const side of [ -1, 1 ] ) {
				b += line(
					[
						[ 0, y ],
						[
							side * len * Math.sin( angle ),
							y - len * Math.cos( angle ),
						],
					],
					w
				);
			}
		}
		s += rot( b, ( i * 360 ) / p.n );
	}
	return s;
};
G.muschelfach = ( p ) => {
	let s = '';
	const span = ( ( 108 + p.a * 0.6 ) * Math.PI ) / 180;
	for ( let i = 0; i < p.n; i++ ) {
		const a = -Math.PI / 2 - span / 2 + ( i * span ) / p.n,
			b = a + ( span / p.n ) * ( 0.42 + p.b * 0.005 ),
			r = 148 - 20 * Math.abs( ( i + 0.5 ) / p.n - 0.5 );
		s += path( polygon( [ [ 0, 86 ], ...arc( r, a, b, 0, 86 ) ] ) );
	}
	return (
		s +
		path(
			polygon( [
				[ -9, 83 ],
				[ -40, 108 ],
				[ 40, 108 ],
				[ 9, 83 ],
			] )
		)
	);
};
G.fluegel = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		const t = i / ( p.n - 1 ),
			base = [ -103 + 62 * t, 70 - 26 * t ],
			tip = [
				-20 + ( 115 + p.a * 0.5 ) * Math.sin( t * Math.PI * 0.72 ),
				-122 + 230 * t,
			];
		s += leafShape( base, tip, 5 + p.b * 0.08, -12 - 14 * t );
	}
	return s;
};
G.leiterbahnen = ( p ) => {
	let s = '';
	for ( let i = 0; i < p.n; i++ ) {
		const y = -112 + ( 224 * i ) / ( p.n - 1 ),
			delta = ( i % 2 ? 1 : -1 ) * ( 12 + p.a * 0.35 ),
			turn = -70 + ( i % 5 ) * 23,
			w = 1 + p.b * 0.04;
		const pts = [
			[ -118, y ],
			[ turn, y ],
			[ turn + 25, y + delta ],
			[ 85, y + delta ],
			[ 108, y + delta + 10 ],
		];
		s +=
			line( pts, w ) +
			line( arc( w * 2.1, 0, TAU, -124, y ), w * 0.7 ) +
			disk( 111, y + delta + 10, w * 1.6 );
	}
	return s;
};
G.bogenraster = ( p ) => {
	let s = '';
	const size = 235 / p.n;
	const h = size * ( 1.2 + p.a * 0.008 );
	const w = 0.7 + p.b * 0.035;
	for ( let j = 0; j < 4; j++ ) {
		for ( let i = 0; i < p.n; i++ ) {
			const x = -117.5 + ( i + 0.5 ) * size,
				y = -2 * h + j * h;
			const pts = [
				...sample(
					( t ) =>
						bez(
							[ x, y ],
							[ x - size * 0.65, y + h * 0.27 ],
							[ x - size * 0.65, y + h * 0.73 ],
							[ x, y + h ],
							t
						),
					30
				),
				...sample(
					( t ) =>
						bez(
							[ x, y + h ],
							[ x + size * 0.65, y + h * 0.73 ],
							[ x + size * 0.65, y + h * 0.27 ],
							[ x, y ],
							t
						),
					30
				),
			];
			s += line( pts, w, true );
		}
	}
	return s;
};
G.ziegel = ( p ) => {
	const n = p.n,
		slot = 240 / n,
		h = slot * 0.53,
		gap = 2 + p.b * 0.055;
	let s = '';
	for ( let j = 0; j < Math.round( n * 1.5 ); j++ ) {
		for ( let i = -1; i <= n; i++ ) {
			const left = Math.max(
					-120,
					-120 + i * slot + ( ( j % 2 ) * slot ) / 2
				),
				right = Math.min(
					120,
					-120 + ( i + 1 ) * slot + ( ( j % 2 ) * slot ) / 2
				);
			if ( right - left > gap ) {
				s += rect(
					left + gap / 2,
					-h * n * 0.75 + j * h + gap / 2,
					right - left - gap,
					h - gap,
					p.a * 0.05
				);
			}
		}
	}
	return s;
};

// Recursive, spatial and abstract generators from the approved catalog.
const cache100 = new Map();
function memo100( key, fn ) {
	if ( cache100.has( key ) ) {
		return cache100.get( key );
	}
	const v = fn();
	cache100.set( key, v );
	if ( cache100.size > 60 ) {
		cache100.delete( cache100.keys().next().value );
	}
	return v;
}
function contours100( values, N, level ) {
	const edges = [],
		adj = new Map(),
		pos = new Map();
	const key = ( p ) => p.map( ( x ) => Math.round( x * 10000 ) ).join( ',' );
	const push = ( a, b ) => {
		const ka = key( a ),
			kb = key( b );
		if ( ka === kb ) {
			return;
		}
		const idx = edges.length;
		edges.push( [ ka, kb ] );
		pos.set( ka, a );
		pos.set( kb, b );
		for ( const k of [ ka, kb ] ) {
			if ( ! adj.has( k ) ) {
				adj.set( k, [] );
			}
			adj.get( k ).push( idx );
		}
	};
	for ( let y = 0; y < N - 1; y++ ) {
		for ( let x = 0; x < N - 1; x++ ) {
			const v = [
					values[ y * N + x ],
					values[ y * N + x + 1 ],
					values[ ( y + 1 ) * N + x + 1 ],
					values[ ( y + 1 ) * N + x ],
				],
				q = [
					[ x, y ],
					[ x + 1, y ],
					[ x + 1, y + 1 ],
					[ x, y + 1 ],
				],
				cross = [];
			for ( let e = 0; e < 4; e++ ) {
				const j = ( e + 1 ) % 4;
				if ( v[ e ] > level === v[ j ] > level ) {
					continue;
				}
				const t = ( level - v[ e ] ) / ( v[ j ] - v[ e ] );
				cross.push(
					add(
						q[ e ],
						mul(
							[
								q[ j ][ 0 ] - q[ e ][ 0 ],
								q[ j ][ 1 ] - q[ e ][ 1 ],
							],
							t
						)
					)
				);
			}
			if ( cross.length === 2 ) {
				push( ...cross );
			} else if ( cross.length === 4 ) {
				if (
					( v[ 0 ] + v[ 1 ] + v[ 2 ] + v[ 3 ] ) / 4 > level ===
					v[ 0 ] > level
				) {
					push( cross[ 0 ], cross[ 1 ] );
					push( cross[ 2 ], cross[ 3 ] );
				} else {
					push( cross[ 0 ], cross[ 3 ] );
					push( cross[ 1 ], cross[ 2 ] );
				}
			}
		}
	}
	const seen = new Set(),
		result = [];
	for ( let i = 0; i < edges.length; i++ ) {
		if ( seen.has( i ) ) {
			continue;
		}
		const first = edges[ i ][ 0 ];
		let current = first;
		let e = i;
		const chain = [];
		while ( ! seen.has( e ) ) {
			seen.add( e );
			chain.push( pos.get( current ) );
			const pair = edges[ e ];
			current = pair[ 0 ] === current ? pair[ 1 ] : pair[ 0 ];
			const next = ( adj.get( current ) || [] ).find(
				( id ) => ! seen.has( id )
			);
			if ( next === undefined ) {
				chain.push( pos.get( current ) );
				break;
			}
			e = next;
		}
		if ( chain.length > 5 ) {
			result.push(
				chain.map( ( [ x, y ] ) => [
					-120 + ( 240 * x ) / ( N - 1 ),
					-120 + ( 240 * y ) / ( N - 1 ),
				] )
			);
		}
	}
	return result;
}
function scalar100( N, fn, pad = true ) {
	const v = new Float64Array( N * N );
	for ( let y = 0; y < N; y++ ) {
		for ( let x = 0; x < N; x++ ) {
			v[ y * N + x ] =
				pad && ( x === 0 || y === 0 || x === N - 1 || y === N - 1 )
					? 0
					: fn( x / ( N - 1 ), y / ( N - 1 ) );
		}
	}
	return v;
}
function contourDrawing100( field, N, levels, w, filled = false ) {
	let d = '';
	for ( const level of levels ) {
		for ( const pts of contours100( field, N, level ) ) {
			d += filled ? path( polygon( pts ) ) : line( pts, w );
		}
	}
	return d;
}
const project100 = ( x, y, z, tilt = 0.72, yaw = 0.3 ) => [
	x * Math.cos( yaw ) + z * Math.sin( yaw ),
	y * Math.cos( tilt ) -
		( z * Math.cos( yaw ) - x * Math.sin( yaw ) ) * Math.sin( tilt ),
];
function roundRectPath100( x, y, w, h, r ) {
	r = Math.min( r, w / 2, h / 2 );
	return `M${ x + r },${ y }H${ x + w - r }Q${ x + w },${ y } ${ x + w },${
		y + r
	}V${ y + h - r }Q${ x + w },${ y + h } ${ x + w - r },${ y + h }H${
		x + r
	}Q${ x },${ y + h } ${ x },${ y + h - r }V${ y + r }Q${ x },${ y } ${
		x + r
	},${ y }Z`;
}
G.mandelbrot = ( p ) => {
	const N = 205,
		field = memo100( 'mandel:' + p.a, () =>
			scalar100( N, ( u, v ) => {
				const cx = -2.15 + 3.05 * u,
					cy = -1.525 + 3.05 * v,
					max = 36 + Math.round( p.a * 1.3 );
				let x = 0,
					y = 0,
					i = 0;
				for ( ; i < max && x * x + y * y < 256; i++ ) {
					const xx = x * x - y * y + cx;
					y = 2 * x * y + cy;
					x = xx;
				}
				if ( i === max ) {
					return 1;
				}
				return Math.max(
					0,
					( i +
						1 -
						Math.log2(
							Math.max( 1, Math.log2( x * x + y * y ) )
						) ) /
						max
				);
			} )
		);
	const levels = Array.from(
		{
			length: p.n,
		},
		( _, i ) => 0.055 + ( i / Math.max( 1, p.n - 1 ) ) * 0.73
	);
	return contourDrawing100( field, N, levels, 0.65 + p.b * 0.024 );
};
G.julia = ( p ) => {
	const N = 201,
		field = memo100( 'julia:' + p.a, () =>
			scalar100( N, ( u, v ) => {
				const cr = -0.82 + p.a * 0.0021,
					ci = 0.13 + p.a * 0.001;
				let x = ( u - 0.5 ) * 3.1;
				let y = ( v - 0.5 ) * 3.1;
				let i = 0;
				const max = 86;
				for ( ; i < max && x * x + y * y < 256; i++ ) {
					const xx = x * x - y * y + cr;
					y = 2 * x * y + ci;
					x = xx;
				}
				return i === max
					? 1
					: Math.max(
							0,
							( i +
								1 -
								Math.log2(
									Math.max( 1, Math.log2( x * x + y * y ) )
								) ) /
								max
					  );
			} )
		);
	return contourDrawing100(
		field,
		N,
		Array.from(
			{
				length: p.n,
			},
			( _, i ) => 0.065 + ( i * 0.58 ) / Math.max( 1, p.n - 1 )
		),
		0.5 + p.b * 0.022
	);
};
G.cantor = ( p ) => {
	let s = '';
	let intervals = [ [ -120, 120 ] ];
	const slot = 235 / p.n;
	const gap = 0.18 + p.a * 0.003;
	for ( let k = 0; k < p.n; k++ ) {
		const next = [];
		for ( const [ a, b ] of intervals ) {
			s += rect(
				a,
				-117 + k * slot,
				b - a,
				slot * ( 0.17 + p.b * 0.006 )
			);
			const z = ( ( b - a ) * ( 1 - gap ) ) / 2;
			next.push( [ a, a + z ], [ b - z, b ] );
		}
		intervals = next;
	}
	return s;
};
G.vicsek = ( p ) => {
	let s = '';
	const shrink = 0.99 - p.b * 0.004;
	function step( x, y, r, d ) {
		if ( ! d ) {
			s += rot(
				rect(
					x - ( r * shrink ) / 2,
					y - ( r * shrink ) / 2,
					r * shrink,
					r * shrink
				),
				p.a * 0.45,
				x,
				y
			);
			return;
		}
		for ( const [ dx, dy ] of [
			[ 0, 0 ],
			[ -1, -1 ],
			[ -1, 1 ],
			[ 1, -1 ],
			[ 1, 1 ],
		] ) {
			step( x + ( dx * r ) / 3, y + ( dy * r ) / 3, r / 3, d - 1 );
		}
	}
	step( 0, 0, 240, p.n );
	return s;
};
G.pythagoras = ( p ) => {
	let s = '';
	const angle = ( ( 24 + p.a * 0.4 ) * Math.PI ) / 180;
	const shrink = 1 - p.b * 0.0018;
	function grow( a, b, d ) {
		const v = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] ],
			q = [ v[ 1 ], -v[ 0 ] ],
			c = add( b, q ),
			e = add( a, q ),
			pts = [ a, b, c, e ],
			mid = mul( add( a, c ), 0.5 );
		s += path(
			polygon(
				pts.map( ( point ) =>
					add(
						mid,
						mul(
							[ point[ 0 ] - mid[ 0 ], point[ 1 ] - mid[ 1 ] ],
							shrink
						)
					)
				)
			)
		);
		if ( ! d ) {
			return;
		}
		const peak = add(
			add( e, mul( v, Math.cos( angle ) ** 2 ) ),
			mul( q, Math.sin( angle ) * Math.cos( angle ) )
		);
		grow( e, peak, d - 1 );
		grow( peak, c, d - 1 );
	}
	grow( [ -32, 135 ], [ 32, 135 ], p.n );
	return s;
};
G.kreisfraktal = ( p ) => {
	let s = '';
	const ratio = 0.24 + p.a * 0.0013;
	function grow( x, y, r, d, phase ) {
		s += line(
			arc( r, 0, TAU, x, y ),
			( 0.4 + p.b * 0.025 ) * ( 0.5 + r / 170 )
		);
		if ( ! d ) {
			return;
		}
		for ( let i = 0; i < 3; i++ ) {
			const q = polar( r * ( 1 - ratio ), phase + ( i * TAU ) / 3, x, y );
			grow( ...q, r * ratio, d - 1, phase + 0.35 );
		}
	}
	grow( 0, 0, 118, p.n, -Math.PI / 2 );
	return s;
};
G.levy = ( p ) => {
	let pts = [
		[ -88, 70 ],
		[ 88, 70 ],
	];
	const bend = 0.32 + p.a * 0.002;
	for ( let i = 0; i < p.n; i++ ) {
		const next = [];
		for ( let j = 0; j < pts.length - 1; j++ ) {
			const a = pts[ j ],
				b = pts[ j + 1 ];
			next.push( a, [
				( a[ 0 ] + b[ 0 ] ) / 2 + ( b[ 1 ] - a[ 1 ] ) * bend,
				( a[ 1 ] + b[ 1 ] ) / 2 - ( b[ 0 ] - a[ 0 ] ) * bend,
			] );
		}
		next.push( pts.at( -1 ) );
		pts = next;
	}
	return line( pts, 0.4 + p.b * 0.026 );
};
G.hfraktal = ( p ) => {
	let s = '';
	const ratio = 0.37 + p.a * 0.0013;
	function grow( x, y, r, d ) {
		const w = ( 0.5 + p.b * 0.026 ) * Math.max( 0.25, r / 75 );
		s +=
			line(
				[
					[ x - r, y - r ],
					[ x - r, y + r ],
				],
				w
			) +
			line(
				[
					[ x + r, y - r ],
					[ x + r, y + r ],
				],
				w
			) +
			line(
				[
					[ x - r, y ],
					[ x + r, y ],
				],
				w
			);
		if ( ! d ) {
			return;
		}
		for ( const dx of [ -1, 1 ] ) {
			for ( const dy of [ -1, 1 ] ) {
				grow( x + dx * r, y + dy * r, r * ratio, d - 1 );
			}
		}
	}
	grow( 0, 0, 63, p.n );
	return s;
};
G.logspirale = ( p ) => {
	const turns = p.n,
		rate = 0.36 + p.a * 0.012,
		pts = sample(
			( t ) =>
				polar(
					122 * Math.exp( -rate * turns * ( 1 - t ) ),
					TAU * turns * t
				),
			600
		);
	return path(
		band(
			pts,
			pts.map(
				( _, i ) =>
					( 0.8 + p.b * 0.06 ) *
					( 0.15 + ( 0.85 * i ) / ( pts.length - 1 ) )
			)
		)
	);
};
G.polygonspirale = ( p ) => {
	const turns = 3 + Math.round( p.a * 0.1 ),
		pts = Array.from(
			{
				length: p.n * turns,
			},
			( _, i ) =>
				polar(
					128 * Math.exp( -i * ( 0.023 + 1 / ( turns * p.n ) ) ),
					( i * TAU ) / p.n - Math.PI / 2
				)
		);
	return line( pts, 0.6 + p.b * 0.045 );
};
G.sattelflaeche = ( p ) => {
	let s = '';
	const fn = ( u, v ) =>
		project100(
			105 * u,
			( u * u - v * v ) * ( 20 + p.a * 0.62 ),
			105 * v,
			0.77,
			0.42
		);
	for ( let i = 0; i < p.n; i++ ) {
		const k = -1 + ( 2 * i ) / ( p.n - 1 );
		s +=
			line(
				sample( ( t ) => fn( k, -1 + 2 * t ) ),
				0.6 + p.b * 0.027
			) +
			line(
				sample( ( t ) => fn( -1 + 2 * t, k ) ),
				0.6 + p.b * 0.027
			);
	}
	return s;
};
G.hyperboloid = ( p ) => {
	let s = '';
	const twist = 0.7 + p.a * 0.018;
	const w = 0.6 + p.b * 0.024;
	for ( let i = 0; i < p.n; i++ ) {
		const a = ( i * TAU ) / p.n;
		for ( const side of [ -1, 1 ] ) {
			const A = [ 88 * Math.cos( a ), -112, 88 * Math.sin( a ) ],
				B = [
					88 * Math.cos( a + side * twist ),
					112,
					88 * Math.sin( a + side * twist ),
				];
			s += line(
				sample( ( t ) =>
					project100(
						...A.map( ( x, j ) => x + ( B[ j ] - x ) * t ),
						0.45,
						0.15
					)
				),
				w
			);
		}
	}
	for ( const y of [ -112, 112 ] ) {
		s += line(
			sample( ( t ) =>
				project100(
					88 * Math.cos( t * TAU ),
					y,
					88 * Math.sin( t * TAU ),
					0.45,
					0.15
				)
			),
			w * 1.3
		);
	}
	return s;
};
G.zylindernetz = ( p ) => {
	let s = '';
	const tilt = 0.35 + p.a * 0.007;
	const w = 0.6 + p.b * 0.029;
	for ( let i = 0; i < p.n; i++ ) {
		const a = ( i * TAU ) / p.n;
		s += line(
			[
				project100(
					80 * Math.cos( a ),
					-112,
					80 * Math.sin( a ),
					tilt
				),
				project100( 80 * Math.cos( a ), 112, 80 * Math.sin( a ), tilt ),
			],
			w
		);
	}
	for ( let i = 0; i <= 7; i++ ) {
		s += line(
			sample( ( t ) =>
				project100(
					80 * Math.cos( TAU * t ),
					-112 + i * 32,
					80 * Math.sin( TAU * t ),
					tilt
				)
			),
			w
		);
	}
	return s;
};
G.kegelnetz = ( p ) => {
	let s = '';
	const tilt = 0.32 + p.a * 0.006;
	const w = 0.6 + p.b * 0.026;
	for ( let i = 0; i < p.n; i++ ) {
		const a = ( i * TAU ) / p.n;
		s += line(
			[
				project100( 0, -125, 0, tilt ),
				project100(
					115 * Math.cos( a ),
					105,
					115 * Math.sin( a ),
					tilt
				),
			],
			w
		);
	}
	for ( let j = 1; j <= 7; j++ ) {
		const t = j / 7;
		s += line(
			sample( ( u ) =>
				project100(
					115 * t * Math.cos( TAU * u ),
					-125 + 230 * t,
					115 * t * Math.sin( TAU * u ),
					tilt
				)
			),
			w
		);
	}
	return s;
};
G.bandknoten = ( p ) => {
	let s = '';
	const radius = 8 + p.a * 0.19;
	const center = ( t ) => {
		const u = TAU * t;
		return [
			( 74 + 25 * Math.cos( 3 * u ) ) * Math.cos( 2 * u ),
			25 * Math.sin( 3 * u ),
			( 74 + 25 * Math.cos( 3 * u ) ) * Math.sin( 2 * u ),
		];
	};
	const surface = ( t, v ) => {
		const c = center( t ),
			a = center( t - 0.0001 ),
			b = center( t + 0.0001 ),
			d = b.map( ( q, i ) => q - a[ i ] ),
			l = Math.hypot( ...d ),
			u = d.map( ( q ) => q / l ),
			nn = [ -u[ 2 ], 0, u[ 0 ] ],
			nl = Math.hypot( ...nn ) || 1,
			n = nn.map( ( q ) => q / nl ),
			bin = [
				u[ 1 ] * n[ 2 ] - u[ 2 ] * n[ 1 ],
				u[ 2 ] * n[ 0 ] - u[ 0 ] * n[ 2 ],
				u[ 0 ] * n[ 1 ] - u[ 1 ] * n[ 0 ],
			];
		return project100(
			...c.map(
				( q, i ) =>
					q +
					radius *
						( n[ i ] * Math.cos( v ) + bin[ i ] * Math.sin( v ) )
			),
			0.73,
			0.4
		);
	};
	for ( let i = 0; i < p.n; i++ ) {
		s += line(
			sample( ( t ) => surface( i / p.n, t * TAU ), 48 ),
			0.45 + p.b * 0.017
		);
	}
	for ( let j = 0; j < 5; j++ ) {
		s += line(
			sample( ( t ) => surface( t, ( j * TAU ) / 5 ), 420 ),
			0.45 + p.b * 0.017
		);
	}
	return s;
};
G.moebius = ( p ) => {
	let s = '';
	const wide = 18 + p.a * 0.38;
	const w = 0.5 + p.b * 0.023;
	const fn = ( u, v ) =>
		project100(
			( 81 + v * Math.cos( u / 2 ) ) * Math.cos( u ),
			v * Math.sin( u / 2 ),
			( 81 + v * Math.cos( u / 2 ) ) * Math.sin( u ),
			0.85,
			0.12
		);
	for ( let i = 0; i < p.n; i++ ) {
		const u = ( i * TAU ) / p.n;
		s += line(
			sample( ( t ) => fn( u, -wide + 2 * wide * t ), 32 ),
			w
		);
	}
	for ( const v of [ -wide, -wide * 0.5, 0, wide * 0.5, wide ] ) {
		s += line(
			sample( ( t ) => fn( t * TAU, v ), 240 ),
			w
		);
	}
	return s;
};
G.wabenkuppel = ( p ) => {
	let s = '';
	const size = 31 - p.n * 1.6;
	const w = 0.55 + p.b * 0.028;
	const R = 120;
	const tilt = 0.42 + p.a * 0.006;
	const fn = ( x, z ) =>
		project100(
			x,
			-Math.sqrt( Math.max( 0, R * R - x * x - z * z ) ),
			z,
			tilt,
			0.2
		);
	for ( let row = -9; row <= 9; row++ ) {
		for ( let col = -9; col <= 9; col++ ) {
			const cx = col * size * 1.5,
				cz =
					row * Math.sqrt( 3 ) * size +
					( ( Math.abs( col ) % 2 ) * Math.sqrt( 3 ) * size ) / 2;
			const corners = Array.from(
				{
					length: 6,
				},
				( _, i ) => [
					cx + size * Math.cos( ( i * TAU ) / 6 ),
					cz + size * Math.sin( ( i * TAU ) / 6 ),
				]
			);
			for ( let j = 0; j < 6; j++ ) {
				const A = corners[ j ],
					B = corners[ ( j + 1 ) % 6 ],
					d = [ B[ 0 ] - A[ 0 ], B[ 1 ] - A[ 1 ] ],
					aa = d[ 0 ] * d[ 0 ] + d[ 1 ] * d[ 1 ],
					bb = 2 * ( A[ 0 ] * d[ 0 ] + A[ 1 ] * d[ 1 ] ),
					cc = A[ 0 ] * A[ 0 ] + A[ 1 ] * A[ 1 ] - R * R,
					disc = bb * bb - 4 * aa * cc;
				if ( disc < 0 ) {
					continue;
				}
				const lo = Math.max(
						0,
						( -bb - Math.sqrt( disc ) ) / ( 2 * aa )
					),
					hi = Math.min(
						1,
						( -bb + Math.sqrt( disc ) ) / ( 2 * aa )
					);
				if ( hi <= lo ) {
					continue;
				}
				s += line(
					sample( ( t ) => {
						const u = lo + ( hi - lo ) * t;
						return fn( A[ 0 ] + d[ 0 ] * u, A[ 1 ] + d[ 1 ] * u );
					}, 16 ),
					w
				);
			}
		}
	}
	return (
		s +
		line(
			sample( ( t ) =>
				project100(
					R * Math.cos( t * TAU ),
					0,
					R * Math.sin( t * TAU ),
					tilt,
					0.2
				)
			),
			w * 1.1
		)
	);
};
G.faltenflaeche = ( p ) => {
	let s = '';
	const n = p.n;
	const size = 210 / n;
	const depth = 10 + p.a * 0.3;
	const v = ( i, j ) =>
		project100(
			-105 + i * size + ( j % 2 ) * size * 0.25,
			( i % 2 ) * depth,
			-95 + j * size,
			0.67,
			0.4
		);
	for ( let j = 0; j < n; j++ ) {
		for ( let i = 0; i < n; i++ ) {
			const corners = [
					v( i, j ),
					v( i + 1, j ),
					v( i + 1, j + 1 ),
					v( i, j + 1 ),
				],
				center = mul( corners.reduce( add, [ 0, 0 ] ), 0.25 ),
				inset = 0.98 - p.b * 0.0025;
			s += path(
				polygon(
					corners.map( ( q ) =>
						add(
							center,
							mul(
								[ q[ 0 ] - center[ 0 ], q[ 1 ] - center[ 1 ] ],
								inset
							)
						)
					)
				)
			);
		}
	}
	return s;
};
G.facettenkoerper = ( p ) => {
	const n = p.n,
		w = 0.7 + p.b * 0.029,
		tilt = 0.22 + p.a * 0.009,
		rings = [
			{
				y: -113,
				r: 33,
				shift: 0,
			},
			{
				y: -25,
				r: 106,
				shift: 0.5,
			},
			{
				y: 68,
				r: 86,
				shift: 0,
			},
			{
				y: 124,
				r: 18,
				shift: 0.5,
			},
		],
		nodes = rings.map( ( r ) =>
			Array.from(
				{
					length: n,
				},
				( _, i ) =>
					project100(
						r.r * Math.cos( ( ( i + r.shift ) * TAU ) / n ),
						r.y,
						r.r * Math.sin( ( ( i + r.shift ) * TAU ) / n ),
						tilt,
						0.3
					)
			)
		);
	let s = '';
	for ( const ring of nodes ) {
		s += line( ring, w, true );
	}
	for ( let j = 0; j < nodes.length - 1; j++ ) {
		for ( let i = 0; i < n; i++ ) {
			s += line(
				[
					nodes[ j ][ i ],
					nodes[ j + 1 ][ i ],
					nodes[ j ][ ( i + 1 ) % n ],
				],
				w
			);
		}
	}
	return s;
};
G.roehrenbuendel = ( p ) => {
	let s = '';
	const n = p.n;
	const r = 19;
	const w = 0.8 + p.b * 0.027;
	for ( let j = 0; j < n; j++ ) {
		const x = ( j - ( n - 1 ) / 2 ) * 34,
			y = ( j % 2 ) * 20,
			height =
				65 +
				( 35 + p.a * 0.75 ) *
					( 0.5 + 0.5 * Math.sin( j * 1.7 + 1 ) ** 2 );
		s +=
			line(
				[
					[ x - r, y + 85 ],
					[ x - r, y - height ],
				],
				w
			) +
			line(
				[
					[ x + r, y + 85 ],
					[ x + r, y - height ],
				],
				w
			) +
			line(
				sample( ( t ) => [
					x + r * Math.cos( TAU * t ),
					y - height + 9 * Math.sin( TAU * t ),
				] ),
				w
			) +
			line(
				sample( ( t ) => [
					x + r * Math.cos( Math.PI * t ),
					y + 85 + 9 * Math.sin( Math.PI * t ),
				] ),
				w
			);
	}
	return s;
};
G.lochraster = ( p ) => {
	const n = p.n,
		slot = 230 / n,
		r = slot * ( 0.12 + p.b * 0.003 ),
		offset = p.a * 0.005;
	let d = roundRectPath100( -125, -125, 250, 250, 10 );
	for ( let y = 0; y < n; y++ ) {
		for ( let x = 0; x < n; x++ ) {
			const cx = -115 + ( x + 0.5 + ( y % 2 ) * offset ) * slot,
				cy = -115 + ( y + 0.5 ) * slot;
			if ( cx + r < 123 ) {
				d += polygon( arc( r, 0, TAU, cx, cy ) );
			}
		}
	}
	return `<path fill-rule="evenodd" d="${ d }"/>`;
};
G.kagome = ( p ) => {
	let s = '';
	const r = 235 / ( p.n * 1.55 );
	const stretch = 0.66 + p.a * 0.007;
	const w = 0.55 + p.b * 0.024;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = ( x - ( p.n - 1 ) / 2 ) * 1.5 * r,
				cy =
					( ( y - ( p.n - 1 ) / 2 ) * Math.sqrt( 3 ) * r +
						( ( x % 2 ) * Math.sqrt( 3 ) * r ) / 2 ) *
					stretch;
			const corners = Array.from(
				{
					length: 6,
				},
				( _, i ) => [
					cx + r * Math.cos( ( i * TAU ) / 6 ),
					cy + r * Math.sin( ( i * TAU ) / 6 ) * stretch,
				]
			);
			const mid = corners.map( ( v, i ) =>
				mul( add( v, corners[ ( i + 1 ) % 6 ] ), 0.5 )
			);
			s += line( mid, w, true );
		}
	}
	return s;
};
G.achtecknetz = ( p ) => {
	let s = '';
	const slot = 238 / p.n;
	const k = 0.13 + p.a * 0.0023;
	const w = 0.6 + p.b * 0.035;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const a = -119 + x * slot,
				b = -119 + y * slot,
				c = slot * k;
			const pts = [
				[ a + c, b ],
				[ a + slot - c, b ],
				[ a + slot, b + c ],
				[ a + slot, b + slot - c ],
				[ a + slot - c, b + slot ],
				[ a + c, b + slot ],
				[ a, b + slot - c ],
				[ a, b + c ],
			];
			s += line( pts, w, true );
		}
	}
	return s;
};
G.kassetten = ( p ) => {
	let s = '';
	const slot = 240 / p.n;
	const w = 0.5 + p.b * 0.025;
	for ( let j = 0; j < p.n; j++ ) {
		for ( let i = 0; i < p.n; i++ ) {
			const x = -120 + ( i + 0.5 ) * slot,
				y = -120 + ( j + 0.5 ) * slot;
			for ( let k = 0; k < 3; k++ ) {
				const r = slot * ( 0.47 - k * 0.125 ),
					shift = k * ( p.a - 50 ) * slot * 0.0007;
				s += line(
					[
						[ x - r + shift, y - r ],
						[ x + r + shift, y - r ],
						[ x + r + shift, y + r ],
						[ x - r + shift, y + r ],
					],
					w,
					true
				);
			}
		}
	}
	return s;
};
G.zackenraster = ( p ) => {
	let s = '';
	const slot = 225 / p.n;
	const amp = slot * ( 0.12 + p.a * 0.0038 );
	const w = 0.5 + p.b * 0.033;
	for ( let j = 0; j < p.n; j++ ) {
		const y = -112 + ( j + 0.5 ) * slot;
		const pts = Array.from(
			{
				length: 17,
			},
			( _, i ) => [ -120 + i * 15, y + ( i % 2 ? amp : -amp ) ]
		);
		s += line( pts, w );
	}
	return s;
};
G.punktwellen = ( p ) => {
	let s = '';
	const slot = 225 / p.n;
	const amp = slot * ( 0.2 + p.a * 0.016 );
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = -112 + ( x + 0.5 ) * slot,
				cy =
					-112 +
					( y + 0.5 ) * slot +
					amp * Math.sin( x * 0.48 + y * 0.18 );
			s += disk(
				cx,
				cy,
				slot *
					( 0.065 + p.b * 0.0024 ) *
					( 0.65 + 0.35 * Math.sin( x * 0.5 + y * 0.35 ) ** 2 )
			);
		}
	}
	return s;
};
G.richtungsgitter = ( p ) => {
	let s = '';
	const slot = 230 / p.n;
	const twist = 0.5 + p.a * 0.07;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = -115 + ( x + 0.5 ) * slot,
				cy = -115 + ( y + 0.5 ) * slot,
				a =
					Math.atan2( cy, cx ) +
					twist * Math.exp( -( cx * cx + cy * cy ) / 15000 );
			s += line(
				[
					polar( slot * 0.34, a, cx, cy ),
					polar( slot * 0.34, a + Math.PI, cx, cy ),
				],
				0.7 + p.b * 0.035
			);
		}
	}
	return s;
};
G.ringgeflecht = ( p ) => {
	let s = '';
	const slot = 215 / p.n;
	const r = slot * ( 0.42 + p.a * 0.0032 );
	const w = 0.7 + p.b * 0.028;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			s += line(
				arc(
					r,
					0,
					TAU,
					-107 + ( x + 0.5 + ( y % 2 ) * 0.5 ) * slot,
					-107 + ( y + 0.5 ) * slot
				),
				w
			);
		}
	}
	return s;
};
G.kreuzkacheln = ( p ) => {
	let s = '';
	const slot = 230 / p.n;
	const r = slot * ( 0.46 - p.b * 0.0012 );
	const arm = r * ( 0.22 + p.a * 0.005 );
	const pts = [
		[ -arm, -r ],
		[ arm, -r ],
		[ arm, -arm ],
		[ r, -arm ],
		[ r, arm ],
		[ arm, arm ],
		[ arm, r ],
		[ -arm, r ],
		[ -arm, arm ],
		[ -r, arm ],
		[ -r, -arm ],
		[ -arm, -arm ],
	];
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = -115 + ( x + 0.5 ) * slot,
				cy = -115 + ( y + 0.5 ) * slot;
			s += path( polygon( pts.map( ( q ) => add( q, [ cx, cy ] ) ) ) );
		}
	}
	return s;
};
G.linienhalbton = ( p ) => {
	let s = '';
	const slot = 240 / p.n;
	const focus = ( p.a - 50 ) * 1.8;
	for ( let i = 0; i < p.n; i++ ) {
		const x = -120 + ( i + 0.5 ) * slot,
			points = sample( ( t ) => [ x, -120 + 240 * t ], 100 ),
			widths = points.map( ( q ) => {
				const r = Math.hypot( ( q[ 0 ] - focus ) * 0.9, q[ 1 ] );
				return (
					slot *
					( 0.04 +
						( 0.1 + p.b * 0.0032 ) * Math.exp( -( r * r ) / 6900 ) )
				);
			} );
		s += path( band( points, widths ) );
	}
	return s;
};
G.fensterraster = ( p ) => {
	let d = '';
	const slot = 235 / p.n;
	const radius = slot * p.a * 0.004;
	const w = 0.65 + p.b * 0.025;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const a = -117 + ( x + 0.1 ) * slot,
				b = -117 + ( y + 0.1 ) * slot;
			d += `<path d="${ roundRectPath100(
				a,
				b,
				slot * 0.8,
				slot * 0.8,
				radius
			) }" fill="none" stroke="currentColor" stroke-width="${ w }"/>`;
		}
	}
	return d;
};
G.windradkacheln = ( p ) => {
	let s = '';
	const slot = 235 / p.n;
	const r = slot * 0.43;
	const curve = p.a * 0.004 + 0.1;
	const thin = 0.08 + p.b * 0.0024;
	const blade = `M0,0 C${ r * curve },${ -r * 0.7 } ${
		r * 0.6
	},${ -r } ${ r },${ -r } L${ r },${ -r + r * thin } C${ r * 0.85 },${
		-r * 0.05
	} ${ r * 0.15 },${ r * 0.1 } 0,0Z`;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = -117 + ( x + 0.5 ) * slot,
				cy = -117 + ( y + 0.5 ) * slot;
			let tile = '';
			for ( let j = 0; j < 4; j++ ) {
				tile += rot( path( blade ), j * 90 );
			}
			s += `<g transform="translate(${ cx } ${ cy })">${ tile }</g>`;
		}
	}
	return s;
};
G.wellenrahmen = ( p ) => {
	const points = ( inset ) =>
			sample( ( t ) => {
				const a = t * TAU,
					c = Math.cos( a ),
					s = Math.sin( a ),
					r =
						Math.min(
							118 / Math.max( 0.001, Math.abs( c ) ),
							91 / Math.max( 0.001, Math.abs( s ) )
						) +
						( 3 + p.a * 0.1 ) * Math.sin( p.n * a );
				return polar( r - inset, a );
			}, 600 ),
		th = 5 + p.b * 0.23;
	return `<path fill-rule="evenodd" d="${
		polygon( points( 0 ) ) + polygon( points( th ) )
	}"/>`;
};
G.perlenrahmen = ( p ) => {
	const shape = ( t ) => {
		const a = t * TAU,
			n = 0.25 + p.a * 0.006;
		return [
			111 * Math.sign( Math.cos( a ) ) * Math.abs( Math.cos( a ) ) ** n,
			88 * Math.sign( Math.sin( a ) ) * Math.abs( Math.sin( a ) ) ** n,
		];
	};
	const pts = sample( shape, 1400 ),
		dist = [ 0 ];
	for ( let i = 1; i < pts.length; i++ ) {
		dist.push(
			dist[ i - 1 ] +
				Math.hypot(
					pts[ i ][ 0 ] - pts[ i - 1 ][ 0 ],
					pts[ i ][ 1 ] - pts[ i - 1 ][ 1 ]
				)
		);
	}
	const length = dist.at( -1 );
	let s = line( pts, 0.7 ),
		k = 1;
	for ( let j = 0; j < p.n; j++ ) {
		const target = ( length * j ) / p.n;
		while ( k < dist.length - 1 && dist[ k ] < target ) {
			k++;
		}
		const t =
				( target - dist[ k - 1 ] ) / ( dist[ k ] - dist[ k - 1 ] || 1 ),
			point = add(
				pts[ k - 1 ],
				mul(
					[
						pts[ k ][ 0 ] - pts[ k - 1 ][ 0 ],
						pts[ k ][ 1 ] - pts[ k - 1 ][ 1 ],
					],
					t
				)
			);
		s += disk( ...point, 1.5 + p.b * 0.065 );
	}
	return s;
};
G.stufenrahmen = ( p ) => {
	const r = 25 + p.a * 0.53,
		quarter = [
			[ 0, -118 ],
			[ 118 - r, -118 ],
		];
	for ( let i = 0; i < p.n; i++ ) {
		const x = 118 - r + ( r * ( i + 1 ) ) / p.n,
			y = -118 + ( r * i ) / p.n;
		quarter.push( [ x, y ], [ x, y + r / p.n ] );
	}
	quarter.push( [ 118, 0 ] );
	const pts = [];
	for ( let i = 0; i < 4; i++ ) {
		const a = ( i * Math.PI ) / 2;
		pts.push(
			...quarter.map( ( [ x, y ] ) => [
				x * Math.cos( a ) - y * Math.sin( a ),
				x * Math.sin( a ) + y * Math.cos( a ),
			] )
		);
	}
	const shrink = 0.95 - p.b * 0.0033;
	return `<path fill-rule="evenodd" d="${
		polygon( pts ) + polygon( pts.map( ( q ) => mul( q, shrink ) ) )
	}"/>`;
};
G.kissenrahmen = ( p ) => {
	const pts = sample( ( t ) => {
			const a = t * TAU,
				e = 0.25 + p.n * 0.055,
				w = 1 - ( 0.03 + p.a * 0.0018 ) * Math.cos( 4 * a );
			return [
				115 *
					Math.sign( Math.cos( a ) ) *
					Math.abs( Math.cos( a ) ) ** e *
					w,
				91 *
					Math.sign( Math.sin( a ) ) *
					Math.abs( Math.sin( a ) ) ** e *
					w,
			];
		}, 360 ),
		shrink = 0.94 - p.b * 0.003;
	return `<path fill-rule="evenodd" d="${
		polygon( pts ) + polygon( pts.map( ( q ) => mul( q, shrink ) ) )
	}"/>`;
};
G.bogenfenster = ( p ) => {
	const rise = 50 + p.a,
		base = 104,
		w = 1 + p.b * 0.047,
		arch = ( x ) =>
			-10 - rise * Math.sqrt( Math.max( 0, 1 - ( x * x ) / 12100 ) );
	let s = line(
		[
			[ -110, base ],
			[ -110, -10 ],
			...sample( ( t ) => {
				const x = -110 + 220 * t;
				return [ x, arch( x ) ];
			} ),
			[ 110, base ],
		],
		w,
		true
	);
	for ( let i = 1; i <= p.n; i++ ) {
		const x = -110 + ( 220 * i ) / ( p.n + 1 );
		s += line(
			[
				[ x, base ],
				[ x, arch( x ) ],
			],
			w * 0.72
		);
	}
	s += line(
		[
			[ -110, -10 ],
			[ 110, -10 ],
		],
		w * 0.8
	);
	return s;
};
G.geteiltekapsel = ( p ) => {
	let s = '';
	const slot = 250 / p.n;
	const r = 23 + p.a * 0.43;
	const mid = 125 - r;
	const gap = slot * ( 0.05 + p.b * 0.003 );
	const height = ( x ) =>
		Math.abs( x ) <= mid
			? r
			: Math.sqrt( Math.max( 0, r * r - ( Math.abs( x ) - mid ) ** 2 ) );
	for ( let i = 0; i < p.n; i++ ) {
		const a = -125 + i * slot + gap / 2,
			b = -125 + ( i + 1 ) * slot - gap / 2,
			upper = sample( ( t ) => {
				const x = a + ( b - a ) * t;
				return [ x, -height( x ) ];
			}, 32 ),
			lower = upper.map( ( [ x, y ] ) => [ x, -y ] ).reverse();
		s += path( polygon( [ ...upper, ...lower ] ) );
	}
	return s;
};
G.abzweigpfeil = ( p ) => {
	let s = '';
	const w = 3 + p.b * 0.085;
	const span = ( ( 40 + p.a ) * Math.PI ) / 180;
	s += line(
		[
			[ 0, 124 ],
			[ 0, 30 ],
		],
		w * 2
	);
	for ( let i = 0; i < p.n; i++ ) {
		const a = -Math.PI / 2 - span / 2 + ( span * i ) / ( p.n - 1 ),
			tip = polar( 125, a, 0, 30 ),
			back = polar( 95, a, 0, 30 ),
			norm = [ -Math.sin( a ), Math.cos( a ) ],
			pts = sample(
				( t ) =>
					bez(
						[ 0, 30 ],
						[ 0, -5 ],
						add(
							back,
							mul( [ Math.cos( a ), Math.sin( a ) ], -18 )
						),
						back,
						t
					),
				70
			);
		s +=
			path( band( pts, w ) ) +
			path(
				polygon( [
					add( back, mul( norm, w * 2.5 ) ),
					tip,
					add( back, mul( norm, -w * 2.5 ) ),
				] )
			);
	}
	return s;
};
G.ruecklaufpfeil = ( p ) => {
	const r = 43 + p.a * 0.48,
		w = 4 + p.b * 0.105,
		pts = [
			[ -r, 116 ],
			[ -r, -25 ],
			...arc( r, Math.PI, TAU, 0, -25 ),
			[ r, 70 ],
		],
		tip = [ r, 70 + p.n ];
	return (
		path( band( pts, w ) ) +
		path( polygon( [ [ r - w * 2.6, 69 ], tip, [ r + w * 2.6, 69 ] ] ) )
	);
};
G.winkelpfeil = ( p ) => {
	const bend = p.n,
		x = 20 + p.a * 0.55,
		w = 4 + p.b * 0.11,
		pts = [
			[ -121, 86 ],
			[ x - bend, 86 ],
			...sample(
				( t ) =>
					bez(
						[ x - bend, 86 ],
						[ x - bend * 0.3, 86 ],
						[ x, 86 - bend * 0.3 ],
						[ x, 86 - bend ],
						t
					),
				40
			),
			[ x, -76 ],
		];
	return (
		path( band( pts, w ) ) +
		path(
			polygon( [
				[ x - w * 2.6, -75 ],
				[ x, -116 ],
				[ x + w * 2.6, -75 ],
			] )
		)
	);
};
G.treppenband = ( p ) => {
	const h = 80 + p.a * 1.25,
		pts = [ [ -120, h / 2 ] ];
	for ( let i = 0; i < p.n; i++ ) {
		pts.push(
			[ -120 + ( ( i + 1 ) * 240 ) / p.n, h / 2 - ( i * h ) / p.n ],
			[
				-120 + ( ( i + 1 ) * 240 ) / p.n,
				h / 2 - ( ( i + 1 ) * h ) / p.n,
			]
		);
	}
	return line( pts, 2 + p.b * 0.16 );
};
G.topografie = ( p ) => {
	const N = 143,
		field = memo100( 'topo:' + p.a, () =>
			scalar100(
				N,
				( u, v ) => {
					const x = ( u - 0.5 ) * 2,
						y = ( v - 0.5 ) * 2,
						d = 0.15 + p.a * 0.004;
					return (
						Math.exp(
							-( ( x + d ) ** 2 + ( y + 0.12 ) ** 2 ) * 5
						) +
						0.83 *
							Math.exp(
								-( ( x - d ) ** 2 + ( y - 0.3 ) ** 2 ) * 9
							) +
						0.55 *
							Math.exp(
								-( ( x + 0.12 ) ** 2 + ( y - 0.61 ) ** 2 ) * 17
							)
					);
				},
				false
			)
		);
	return contourDrawing100(
		field,
		N,
		Array.from(
			{
				length: p.n,
			},
			( _, i ) => 0.09 + ( i * 1.05 ) / p.n
		),
		0.6 + p.b * 0.024
	);
};
G.bezierfaecher = ( p ) => {
	let s = '';
	const bend = ( p.a - 50 ) * 2;
	const w = 0.6 + p.b * 0.027;
	for ( let i = 0; i < p.n; i++ ) {
		const t = i / ( p.n - 1 ),
			A = [ -120, -110 + 220 * t ],
			B = [ -35 + bend * 0.4, 130 - 180 * t ],
			C = [ 35 - bend * 0.4, -130 + 180 * t ],
			D = [ 120, 110 - 220 * t ];
		s += line(
			sample( ( u ) => bez( A, B, C, D, u ), 140 ),
			w
		);
	}
	return s;
};
G.sehnennetz = ( p ) => {
	let s = '';
	const factor = 1.55 + p.a * 0.033;
	const w = 0.3 + p.b * 0.016;
	for ( let i = 0; i < p.n; i++ ) {
		const a = ( i * TAU ) / p.n,
			b = a * factor;
		s += line( [ polar( 118, a ), polar( 118, b ) ], w );
	}
	return s + line( arc( 118, 0, TAU ), w );
};
G.rosenfenster = ( p ) => {
	let s = '';
	const r = 12 + p.a * 0.46;
	const w = 0.55 + p.b * 0.025;
	const step = TAU / p.n;
	s += line( arc( 118, 0, TAU ), w * 1.3 ) + line( arc( r, 0, TAU ), w );
	for ( let i = 0; i < p.n; i++ ) {
		const a = i * step,
			A = polar( r, a ),
			B = polar( 114, a + step / 2 ),
			C = polar( r, a + step ),
			L = polar( 106, a - step * 0.16 ),
			R = polar( 106, a + step * 1.16 );
		s += line(
			[
				...sample( ( t ) => bez( A, polar( 70, a ), L, B, t ), 45 ),
				...sample(
					( t ) => bez( B, R, polar( 70, a + step ), C, t ),
					45
				),
			],
			w
		);
	}
	return s;
};
G.torsionsband = ( p ) => {
	let s = '';
	const turns = 0.22 + p.a * 0.022;
	const w = 0.5 + p.b * 0.025;
	const fn = ( t, v ) =>
		project100(
			v * Math.cos( t * TAU * turns ),
			-124 + 248 * t,
			v * Math.sin( t * TAU * turns ),
			0.36,
			0.4
		);
	for ( let j = 0; j < p.n; j++ ) {
		const v = -66 + ( 132 * j ) / ( p.n - 1 );
		s += line(
			sample( ( t ) => fn( t, v ), 260 ),
			w
		);
	}
	for ( let j = 0; j < 28; j++ ) {
		s += line(
			sample( ( t ) => fn( j / 27, -66 + 132 * t ), 18 ),
			w * 0.65
		);
	}
	return s;
};
G.drehrahmen = ( p ) => {
	let s = '';
	const turn = ( p.a - 15 ) * 2.5;
	const w = 0.55 + p.b * 0.034;
	for ( let i = 0; i < p.n; i++ ) {
		const t = i / ( p.n - 1 ),
			r = 118 * Math.exp( -2.45 * t );
		s += rot(
			line(
				[
					[ -r, -r ],
					[ r, -r ],
					[ r, r ],
					[ -r, r ],
				],
				w,
				true
			),
			turn * t
		);
	}
	return s;
};
G.orbitnetz = ( p ) => {
	let s = '';
	const h = 18 + p.a * 0.59;
	const w = 0.5 + p.b * 0.026;
	for ( let i = 0; i < p.n; i++ ) {
		const angle = ( i * 180 ) / p.n;
		s += rot(
			line(
				sample( ( t ) => [
					116 * Math.cos( t * TAU ),
					h * Math.sin( t * TAU ),
				] ),
				w
			),
			angle
		);
	}
	return s;
};
G.bogenpolygon = ( p ) => {
	const pts = [],
		amp = 0.12 + p.a * 0.005;
	for ( let i = 0; i < p.n; i++ ) {
		const a = -Math.PI / 2 + ( i * TAU ) / p.n,
			b = a + TAU / p.n,
			A = polar( 107, a ),
			B = polar( 107, b ),
			mid = mul( add( A, B ), 0.5 ),
			len = Math.hypot( ...mid ),
			C = add( mid, mul( mid, ( amp * 107 ) / len ) );
		pts.push(
			...sample(
				( t ) => [
					A[ 0 ] * ( 1 - t ) ** 2 +
						2 * C[ 0 ] * ( 1 - t ) * t +
						B[ 0 ] * t * t,
					A[ 1 ] * ( 1 - t ) ** 2 +
						2 * C[ 1 ] * ( 1 - t ) * t +
						B[ 1 ] * t * t,
				],
				55
			)
		);
	}
	return `<path fill-rule="evenodd" d="${
		polygon( pts ) +
		polygon( pts.map( ( q ) => mul( q, 0.94 - p.b * 0.0038 ) ) )
	}"/>`;
};
G.spitzbogenfaecher = ( p ) => {
	let s = '';
	const span = 20 + p.a * 0.9;
	const w = 0.6 + p.b * 0.027;
	const outline = [
		...sample(
			( t ) =>
				bez( [ 0, 93 ], [ -75, 34 ], [ -66, -44 ], [ 0, -126 ], t ),
			70
		),
		...sample(
			( t ) => bez( [ 0, -126 ], [ 66, -44 ], [ 75, 34 ], [ 0, 93 ], t ),
			70
		),
	];
	for ( let i = 0; i < p.n; i++ ) {
		s += rot(
			line( outline, w, true ),
			-span / 2 + ( span * i ) / ( p.n - 1 ),
			0,
			93
		);
	}
	return s;
};
G.kapselnetz = ( p ) => {
	let s = '';
	const slot = 220 / p.n;
	const h = slot * ( 0.32 + p.a * 0.0028 );
	const w = 0.8 + p.b * 0.028;
	for ( let y = 0; y < p.n; y++ ) {
		for ( let x = 0; x < p.n; x++ ) {
			const cx = -110 + ( x + 0.5 ) * slot,
				cy = -110 + ( y + 0.5 ) * slot,
				d = roundRectPath100(
					cx - slot * 0.8,
					cy - h / 2,
					slot * 1.6,
					h,
					h / 2
				);
			s += rot(
				`<path d="${ d }" fill="none" stroke="currentColor" stroke-width="${ w }"/>`,
				( x + y ) % 2 ? 90 : 0,
				cx,
				cy
			);
		}
	}
	return s;
};
G.faltquadrat = ( p ) => {
	let s = '';
	const power = 0.5 + p.a * 0.015;
	const gap = 0.1 + p.b * 0.005;
	for ( let side = 0; side < 4; side++ ) {
		let part = '';
		for ( let i = 0; i < p.n; i++ ) {
			const a = ( i + gap / 2 ) / p.n,
				b = ( i + 1 - gap / 2 ) / p.n,
				A = ( t ) => [ -116 * ( 1 - t ), -116 * ( 1 - t ) ],
				B = ( t ) => [
					116 * ( 1 - t ** power ),
					-116 * ( 1 - t ** power ),
				];
			part += path( polygon( [ A( a ), B( a ), B( b ), A( b ) ] ) );
		}
		s += rot( part, side * 90 );
	}
	return s;
};
G.segmentlabyrinth = ( p ) => {
	let s = '';
	const w = 0.7 + p.b * 0.032;
	for ( let i = 1; i <= p.n; i++ ) {
		const r = ( 118 * i ) / p.n,
			a = i * ( 0.55 + p.a * 0.022 ),
			gap = 0.34;
		s += line( arc( r, a + gap, a + TAU - gap ), w );
		if ( i > 1 ) {
			const turn = a + Math.PI * 0.9;
			s += line( [ polar( r, turn ), polar( r - 118 / p.n, turn ) ], w );
		}
	}
	return s;
};
G.pascalmuster = ( p ) => {
	let s = '';
	const rows = 25 + Math.round( p.a * 0.43 );
	const slot = 235 / rows;
	const gap = 0.04 + p.b * 0.007;
	let row = [ 1 ];
	for ( let y = 0; y < rows; y++ ) {
		for ( let x = 0; x < row.length; x++ ) {
			if ( row[ x ] !== 0 ) {
				const cx = ( x - y / 2 ) * slot,
					cy = -110 + y * slot * 0.88;
				s += rect(
					cx - ( slot * ( 1 - gap ) ) / 2,
					cy - ( slot * ( 1 - gap ) ) / 2,
					slot * ( 1 - gap ),
					slot * ( 1 - gap )
				);
			}
		}
		const next = [ 1 ];
		for ( let x = 1; x < row.length; x++ ) {
			next.push( ( row[ x - 1 ] + row[ x ] ) % p.n );
		}
		next.push( 1 );
		row = next;
	}
	return s;
};
G.newtonkonturen = ( p ) => {
	const N = 157,
		curves = memo100( 'newton:' + p.n + ':' + p.a, () => {
			const span = 1.2 + p.a * 0.016,
				labels = new Int8Array( N * N ).fill( -1 );
			for ( let gy = 1; gy < N - 1; gy++ ) {
				for ( let gx = 1; gx < N - 1; gx++ ) {
					const u = ( gx / ( N - 1 ) - 0.5 ) * 2,
						v = ( gy / ( N - 1 ) - 0.5 ) * 2;
					if ( u * u + v * v > 0.97 ) {
						continue;
					}
					let x = u * span,
						y = v * span;
					for ( let k = 0; k < 23; k++ ) {
						let a = 1,
							b = 0;
						for ( let j = 0; j < p.n - 1; j++ ) {
							const tmp = a * x - b * y;
							b = a * y + b * x;
							a = tmp;
						}
						const fa = a * x - b * y - 1,
							fb = a * y + b * x,
							da = p.n * a,
							db = p.n * b,
							den = da * da + db * db;
						if ( den < 1e-14 ) {
							break;
						}
						const dx = ( fa * da + fb * db ) / den,
							dy = ( fb * da - fa * db ) / den;
						x -= dx;
						y -= dy;
						if ( dx * dx + dy * dy < 1e-12 ) {
							break;
						}
					}
					const label = Math.round(
						( Math.atan2( y, x ) * p.n ) / TAU
					);
					labels[ gy * N + gx ] = ( ( label % p.n ) + p.n ) % p.n;
				}
			}
			const contours = [];
			for ( let k = 0; k < p.n; k++ ) {
				const field = Float64Array.from( labels, ( v ) =>
					v === k ? 1 : 0
				);
				contours.push( ...contours100( field, N, 0.5 ) );
			}
			return contours;
		} );
	return curves.map( ( q ) => line( q, 0.35 + p.b * 0.018 ) ).join( '' );
};
G.attraktorkonturen = ( p ) => {
	const N = 123,
		field = memo100( 'attraktor:' + p.a, () => {
			const raw = new Float64Array( N * N );
			let x = 0.11,
				y = 0.18;
			const a = 1.15 + p.a * 0.006,
				b = -2.3,
				c = 2.4,
				d = -2.1;
			for ( let i = 0; i < 36000; i++ ) {
				const nx = Math.sin( a * y ) - Math.cos( b * x ),
					ny = Math.sin( c * x ) - Math.cos( d * y );
				x = nx;
				y = ny;
				if ( i < 150 ) {
					continue;
				}
				const ix = Math.max(
						1,
						Math.min(
							N - 2,
							Math.round( ( ( x + 2.1 ) / 4.2 ) * ( N - 1 ) )
						)
					),
					iy = Math.max(
						1,
						Math.min(
							N - 2,
							Math.round( ( ( y + 2.1 ) / 4.2 ) * ( N - 1 ) )
						)
					);
				raw[ iy * N + ix ]++;
			}
			const blur = new Float64Array( N * N );
			let max = 0;
			for ( let j = 2; j < N - 2; j++ ) {
				for ( let i = 2; i < N - 2; i++ ) {
					let sum = 0;
					for ( let yy = -2; yy <= 2; yy++ ) {
						for ( let xx = -2; xx <= 2; xx++ ) {
							sum +=
								raw[ ( j + yy ) * N + i + xx ] *
								Math.exp( -( xx * xx + yy * yy ) / 3 );
						}
					}
					blur[ j * N + i ] = sum;
					if ( sum > max ) {
						max = sum;
					}
				}
			}
			return Float64Array.from( blur, ( v ) => v / ( max || 1 ) );
		} );
	return contourDrawing100(
		field,
		N,
		Array.from(
			{
				length: p.n,
			},
			( _, i ) => 0.04 + ( i * 0.36 ) / Math.max( 1, p.n - 1 )
		),
		0.45 + p.b * 0.022
	);
};
G.spiralgitter = ( p ) => {
	let s = '';
	const twist = 0.55 + p.a * 0.025;
	const w = 0.45 + p.b * 0.022;
	for ( const side of [ -1, 1 ] ) {
		for ( let i = 0; i < p.n; i++ ) {
			s += line(
				sample( ( t ) => {
					const r = 11 + 109 * t,
						a =
							( i * TAU ) / p.n +
							side * twist * Math.log( r / 11 );
					return polar( r, a );
				}, 160 ),
				w
			);
		}
	}
	return s + line( arc( 120, 0, TAU ), w ) + line( arc( 11, 0, TAU ), w );
};
const CATALOG_GEOMETRY = {
	...G,
	...BOLD_SHAPE_GEOMETRY,
	...LAYOUT_SHAPE_GEOMETRY,
};
export function catalogMarkup( id, params ) {
	return CATALOG_GEOMETRY[ id ]( {
		...params,
		n: Math.round( params.n ),
	} );
}
