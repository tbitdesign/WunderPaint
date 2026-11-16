/**
 * Compile the catalog's internally generated SVG primitives to native filled
 * shape commands. This is deliberately not an SVG importer: only the path,
 * circle, ellipse, rect and group notation emitted by our generators is read.
 *
 * Expanding the construction strokes into bands means every family supports
 * the editor's normal fill, gradient, outline, hit test and vector export.
 * Holes are wound against their outline for the engine's nonzero fill rule.
 * No DOM, image, external asset or asynchronous work is involved.
 */
import { normalizePathD } from './path';
import { flattenPathD } from './text-path';
const TAU = Math.PI * 2;
const IDENTITY = [ 1, 0, 0, 1, 0, 0 ];
const cache = new Map();
const same = ( a, b ) => Math.hypot( a[ 0 ] - b[ 0 ], a[ 1 ] - b[ 1 ] ) < 1e-6;
const area = ( points ) =>
	points.reduce( ( sum, p, i ) => {
		const q = points[ ( i + 1 ) % points.length ];
		return sum + p[ 0 ] * q[ 1 ] - q[ 0 ] * p[ 1 ];
	}, 0 ) / 2;
const clean = ( points ) =>
	points.filter( ( p, i ) => ! i || ! same( p, points[ i - 1 ] ) );
const transformPoint = ( m, p ) => [
	m[ 0 ] * p[ 0 ] + m[ 2 ] * p[ 1 ] + m[ 4 ],
	m[ 1 ] * p[ 0 ] + m[ 3 ] * p[ 1 ] + m[ 5 ],
];
function multiply( a, b ) {
	return [
		a[ 0 ] * b[ 0 ] + a[ 2 ] * b[ 1 ],
		a[ 1 ] * b[ 0 ] + a[ 3 ] * b[ 1 ],
		a[ 0 ] * b[ 2 ] + a[ 2 ] * b[ 3 ],
		a[ 1 ] * b[ 2 ] + a[ 3 ] * b[ 3 ],
		a[ 0 ] * b[ 4 ] + a[ 2 ] * b[ 5 ] + a[ 4 ],
		a[ 1 ] * b[ 4 ] + a[ 3 ] * b[ 5 ] + a[ 5 ],
	];
}
function transform( value ) {
	let out = IDENTITY;
	for ( const match of value.matchAll(
		/(translate|rotate|skewX)\(([^)]+)\)/g
	) ) {
		const v = match[ 2 ].trim().split( /[ ,]+/ ).map( Number ),
			r = ( v[ 0 ] * Math.PI ) / 180;
		let next;
		if ( match[ 1 ] === 'translate' ) {
			next = [ 1, 0, 0, 1, v[ 0 ], v[ 1 ] || 0 ];
		} else if ( match[ 1 ] === 'skewX' ) {
			next = [ 1, 0, Math.tan( r ), 1, 0, 0 ];
		} else {
			const x = v[ 1 ] || 0,
				y = v[ 2 ] || 0,
				c = Math.cos( r ),
				s = Math.sin( r );
			next = [ c, s, -s, c, x - c * x + s * y, y - s * x - c * y ];
		}
		out = multiply( out, next );
	}
	return out;
}
function inside( point, ring ) {
	let hit = false;
	for ( let i = 0, j = ring.length - 1; i < ring.length; j = i++ ) {
		const a = ring[ i ],
			b = ring[ j ];
		if (
			a[ 1 ] > point[ 1 ] !== b[ 1 ] > point[ 1 ] &&
			point[ 0 ] <
				( ( b[ 0 ] - a[ 0 ] ) * ( point[ 1 ] - a[ 1 ] ) ) /
					( b[ 1 ] - a[ 1 ] ) +
					a[ 0 ]
		) {
			hit = ! hit;
		}
	}
	return hit;
}
function filledRings( rings, evenodd ) {
	const valid = rings.filter(
		( r ) => r.length > 2 && Math.abs( area( r ) ) > 1e-9
	);
	return valid.map( ( r, i ) => {
		const depth = evenodd
			? valid.reduce(
					( n, other, j ) =>
						n + ( i !== j && inside( r[ 0 ], other ) ? 1 : 0 ),
					0
			  )
			: 0;
		return area( r ) > 0 === ( depth % 2 === 0 ) ? r : r.slice().reverse();
	} );
}
function arc( center, r, a, delta ) {
	const count = Math.max(
		1,
		Math.ceil( Math.abs( delta ) / ( Math.PI / 12 ) )
	);
	return Array.from(
		{
			length: count + 1,
		},
		( _, i ) => [
			center[ 0 ] + r * Math.cos( a + ( delta * i ) / count ),
			center[ 1 ] + r * Math.sin( a + ( delta * i ) / count ),
		]
	);
}
/** Offset one side, retaining round joins without the spikes of averaged normals. */
function side( points, r, closed, round ) {
	const out = [];
	for ( let i = 0; i < points.length; i++ ) {
		const p = points[ i ],
			prev = points[ ( i + points.length - 1 ) % points.length ],
			next = points[ ( i + 1 ) % points.length ];
		const direction = ( a, b ) => {
			const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
			return [ ( b[ 0 ] - a[ 0 ] ) / len, ( b[ 1 ] - a[ 1 ] ) / len ];
		};
		const u =
			! closed && i === 0 ? direction( p, next ) : direction( prev, p );
		const v =
			! closed && i === points.length - 1 ? u : direction( p, next );
		const n0 = [ -u[ 1 ], u[ 0 ] ],
			n1 = [ -v[ 1 ], v[ 0 ] ],
			cross = u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ],
			dot = u[ 0 ] * v[ 0 ] + u[ 1 ] * v[ 1 ];
		if ( Math.abs( cross ) < 1e-8 && dot > 0 ) {
			out.push( [ p[ 0 ] + n1[ 0 ] * r, p[ 1 ] + n1[ 1 ] * r ] );
			continue;
		}
		const denominator = 1 + dot;
		const offset =
			denominator > 1e-5
				? [
						( r * ( n0[ 0 ] + n1[ 0 ] ) ) / denominator,
						( r * ( n0[ 1 ] + n1[ 1 ] ) ) / denominator,
				  ]
				: [ n1[ 0 ] * r, n1[ 1 ] * r ];
		if ( cross * r < 0 && round ) {
			const a = Math.atan2( n0[ 1 ] * r, n0[ 0 ] * r ),
				sweep = Math.atan2( cross, dot );
			out.push( ...arc( p, Math.abs( r ), a, sweep ) );
		} else if ( Math.hypot( ...offset ) <= Math.abs( r ) * 4 ) {
			out.push( [ p[ 0 ] + offset[ 0 ], p[ 1 ] + offset[ 1 ] ] );
		} else {
			out.push(
				[ p[ 0 ] + n0[ 0 ] * r, p[ 1 ] + n0[ 1 ] * r ],
				[ p[ 0 ] + n1[ 0 ] * r, p[ 1 ] + n1[ 1 ] * r ]
			);
		}
	}
	return out;
}
function strokedRings( raw, width, closed, roundJoin, roundCap ) {
	const points = clean( raw );
	if ( points.length < 2 || width <= 0 ) {
		return [];
	}
	if ( same( points[ 0 ], points[ points.length - 1 ] ) ) {
		closed = true;
		points.pop();
	}
	if ( points.length < 2 ) {
		return [];
	}
	const r = width / 2,
		left = side( points, r, closed, roundJoin ),
		right = side( points, -r, closed, roundJoin );
	if ( closed ) {
		// Right is the outer ring for a clockwise centerline.
		return area( points ) >= 0
			? [ right, left.reverse() ]
			: [ left.reverse(), right ];
	}
	const result = [ ...right ];
	if ( roundCap ) {
		const p = points[ points.length - 1 ],
			a = right[ right.length - 1 ];
		result.push(
			...arc(
				p,
				r,
				Math.atan2( a[ 1 ] - p[ 1 ], a[ 0 ] - p[ 0 ] ),
				Math.PI
			)
		);
	}
	result.push( ...left.reverse() );
	if ( roundCap ) {
		const p = points[ 0 ],
			a = left[ left.length - 1 ];
		result.push(
			...arc(
				p,
				r,
				Math.atan2( a[ 1 ] - p[ 1 ], a[ 0 ] - p[ 0 ] ),
				Math.PI
			)
		);
	}
	return [ area( result ) < 0 ? result.reverse() : result ];
}
function primitiveRings( tag, a ) {
	if ( tag === 'path' ) {
		return flattenPathD( normalizePathD( a.d ), 0.3 ).map( ( points ) =>
			points.map( ( p ) => [ p.x, p.y ] )
		);
	}
	if ( tag === 'circle' || tag === 'ellipse' ) {
		const rx = Number( a.rx || a.r ),
			ry = Number( a.ry || a.r ),
			cx = Number( a.cx || 0 ),
			cy = Number( a.cy || 0 );
		return [
			Array.from(
				{
					length: 97,
				},
				( _, i ) => [
					cx + rx * Math.cos( ( i * TAU ) / 96 ),
					cy + ry * Math.sin( ( i * TAU ) / 96 ),
				]
			),
		];
	}
	const x = Number( a.x || 0 ),
		y = Number( a.y || 0 ),
		w = Number( a.width ),
		h = Number( a.height ),
		r = Math.max( 0, Math.min( Number( a.rx || 0 ), w / 2, h / 2 ) );
	if ( w <= 0 || h <= 0 ) {
		return [];
	}
	if ( ! r ) {
		return [
			[
				[ x, y ],
				[ x + w, y ],
				[ x + w, y + h ],
				[ x, y + h ],
				[ x, y ],
			],
		];
	}
	return [
		[
			...arc( [ x + w - r, y + r ], r, -Math.PI / 2, Math.PI / 2 ),
			...arc( [ x + w - r, y + h - r ], r, 0, Math.PI / 2 ),
			...arc( [ x + r, y + h - r ], r, Math.PI / 2, Math.PI / 2 ),
			...arc( [ x + r, y + r ], r, Math.PI, Math.PI / 2 ),
			[ x + w - r, y ],
		],
	];
}

/** Internal markup -> fitted normalized coordinates, cached independently of size. */
function compile( markup ) {
	const stack = [ IDENTITY ],
		rings = [];
	for ( const match of markup.matchAll(
		/<(\/)?(g|path|circle|ellipse|rect)\b([^>]*)>/g
	) ) {
		const [ , end, tag, raw ] = match;
		if ( end ) {
			if ( tag === 'g' ) {
				stack.pop();
			}
			continue;
		}
		const a = Object.fromEntries(
			Array.from( raw.matchAll( /([\w-]+)="([^"]*)"/g ), ( m ) => [
				m[ 1 ],
				m[ 2 ],
			] )
		);
		const matrix = multiply(
			stack[ stack.length - 1 ],
			transform( a.transform || '' )
		);
		if ( tag === 'g' ) {
			stack.push( matrix );
			continue;
		}
		const points = primitiveRings( tag, a );
		const contours =
			a.fill === 'none'
				? points.flatMap( ( r ) =>
						strokedRings(
							r,
							Number( a[ 'stroke-width' ] || 1 ),
							tag !== 'path' || /z\s*$/i.test( a.d ),
							a[ 'stroke-linejoin' ] === 'round',
							a[ 'stroke-linecap' ] === 'round'
						)
				  )
				: filledRings( points, a[ 'fill-rule' ] === 'evenodd' );
		for ( const contour of contours ) {
			rings.push( contour.map( ( p ) => transformPoint( matrix, p ) ) );
		}
	}
	// Match the approved 330-unit stage and preserve its proportions. Expand
	// only when a dial takes a construction outside that stage, so it cannot
	// escape the layer's box or be cropped by the renderer's bounds.
	let extent = 165;
	for ( const ring of rings ) {
		for ( const [ x, y ] of ring ) {
			extent = Math.max( extent, Math.abs( x ), Math.abs( y ) );
		}
	}
	return rings.map( ( r ) =>
		r.map( ( [ x, y ] ) => [
			( x + extent ) / ( 2 * extent ),
			( y + extent ) / ( 2 * extent ),
		] )
	);
}
export function catalogPathCommands( id, params, w, h, markup ) {
	const key = id + '|' + JSON.stringify( params );
	let rings = cache.get( key );
	if ( ! rings ) {
		rings = compile( markup() );
		cache.set( key, rings );
		if ( cache.size > 256 ) {
			cache.delete( cache.keys().next().value );
		}
	}
	const commands = [];
	for ( const ring of rings ) {
		if ( ring.length < 3 ) {
			continue;
		}
		ring.forEach( ( [ x, y ], i ) =>
			commands.push( {
				t: i ? 'L' : 'M',
				x: x * w,
				y: y * h,
			} )
		);
		commands.push( {
			t: 'Z',
		} );
	}
	return commands;
}
