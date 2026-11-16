/** Reversible trims and local edits on the existing Bézier centerline. */
import { buildPathD, parsePathAnchors } from './path-edit';
import { bezierAt, fitToAnchors } from './curve-fit';
import { mapPenSubs } from './pen-operations';
import { parseColor, toHexColor } from './color';
const clamp = ( n, a, b ) =>
	Math.max( a, Math.min( b, Number.isFinite( +n ) ? +n : a ) );
const dist = ( a, b ) => Math.hypot( a.x - b.x, a.y - b.y );
const mix = ( a, b, t ) => ( {
	x: a.x + ( b.x - a.x ) * t,
	y: a.y + ( b.y - a.y ) * t,
} );
const unit = ( a, b ) => {
	const l = dist( a, b ) || 1;
	return { x: ( b.x - a.x ) / l, y: ( b.y - a.y ) / l };
};
function split( c, t ) {
	const a = mix( c[ 0 ], c[ 1 ], t ),
		b = mix( c[ 1 ], c[ 2 ], t ),
		d = mix( c[ 2 ], c[ 3 ], t ),
		e = mix( a, b, t ),
		f = mix( b, d, t ),
		p = mix( e, f, t );
	return [
		[ c[ 0 ], a, e, p ],
		[ p, f, d, c[ 3 ] ],
	];
}
const segmentCount = ( s ) =>
	s.closed ? s.anchors.length : s.anchors.length - 1;
function segment( s, i ) {
	const a = s.anchors[ i ],
		b = s.anchors[ ( i + 1 ) % s.anchors.length ];
	return [ a, a.hOut || a, b.hIn || b, b ];
}
export function penSubRange( s, from, to ) {
	const n = segmentCount( s ),
		lo = clamp( from, 0, n ),
		hi = clamp( to, lo, n ),
		anchors = [];
	for ( let i = Math.floor( lo ); i < Math.ceil( hi ) && i < n; i++ ) {
		const a = s.anchors[ i ],
			b = s.anchors[ ( i + 1 ) % s.anchors.length ],
			start = Math.max( 0, lo - i ),
			end = Math.min( 1, hi - i );
		if ( end - start < 1e-8 ) {
			continue;
		}
		let c = segment( s, i );
		if ( end < 1 ) {
			c = split( c, end )[ 0 ];
		}
		if ( start > 0 ) {
			c = split( c, start / end )[ 1 ];
		}
		const curved = !! ( a.hOut || b.hIn );
		if ( ! curved ) {
			c = [ mix( a, b, start ), a, b, mix( a, b, end ) ];
		}
		const first = { ...c[ 0 ], hIn: null, hOut: curved ? c[ 1 ] : null },
			last = { ...c[ 3 ], hIn: curved ? c[ 2 ] : null, hOut: null };
		if ( anchors.length ) {
			anchors.at( -1 ).hOut = first.hOut;
		} else {
			anchors.push( first );
		}
		anchors.push( last );
	}
	return { anchors, closed: false };
}
function arcTable( s ) {
	let length = 0,
		previous = s.anchors[ 0 ];
	const points = [ { u: 0, s: 0 } ];
	for ( let i = 0; i < segmentCount( s ); i++ ) {
		const c = segment( s, i ),
			steps =
				s.anchors[ i ].hOut ||
				s.anchors[ ( i + 1 ) % s.anchors.length ].hIn
					? 48
					: 1;
		for ( let j = 1; j <= steps; j++ ) {
			const p = bezierAt( c, j / steps );
			length += dist( previous, p );
			points.push( { u: i + j / steps, s: length } );
			previous = p;
		}
	}
	return { points, length };
}
export function trimPenPath( d, start, end ) {
	if ( start <= 0 && end >= 100 ) {
		return d;
	}
	return buildPathD(
		( parsePathAnchors( d ) || [] )
			.map( ( s ) => {
				const table = arcTable( s );
				const at = ( t ) => {
					const target = ( table.length * clamp( t, 0, 100 ) ) / 100;
					let i = table.points.findIndex( ( p ) => p.s >= target );
					i = Math.max( 1, i );
					const a = table.points[ i - 1 ],
						b = table.points[ i ] || a;
					return (
						a.u +
						( ( b.u - a.u ) * ( target - a.s ) ) /
							Math.max( 1e-9, b.s - a.s )
					);
				};
				return penSubRange( s, at( start ), at( end ) );
			} )
			.filter( ( s ) => s.anchors.length > 1 )
	);
}
export function mirrorPenPoint( p, mode, axis ) {
	return mode === 'vertical'
		? { x: 2 * axis - p.x, y: p.y }
		: mode === 'horizontal'
		? { x: p.x, y: 2 * axis - p.y }
		: { x: p.x, y: p.y };
}
export function mirrorPenPath( d, mode, axis, positive = false ) {
	const subs = mapPenSubs( parsePathAnchors( d ) || [], ( p ) =>
		mirrorPenPoint( p, mode, axis )
	);
	if ( positive ) {
		for ( const s of subs ) {
			s.anchors = s.anchors
				.reverse()
				.map( ( a ) => ( { ...a, hIn: a.hOut, hOut: a.hIn } ) );
		}
	}
	return buildPathD( subs );
}
/*
 * Symmetry beyond one mirror (Pen Tool round, 19.10.2026): 'both' mirrors
 * across both axes through the centre, 'radial' turns copies around it,
 * 'kaleido' turns mirrored copies too - a freehand stroke becomes an
 * ornament. Each copy is an affine map; `flip` copies are mirror images,
 * whose outlines are reversed so the fill stays positive.
 */
export const RADIAL_SYMMETRY = [ 'both', 'radial', 'kaleido' ];
export function penSymmetryMaps( style ) {
	const mode = style.symmetry;
	if ( 'vertical' === mode || 'horizontal' === mode ) {
		return [
			{
				map: ( p ) => mirrorPenPoint( p, mode, style.symmetryAxis ),
				flip: true,
			},
		];
	}
	if ( ! RADIAL_SYMMETRY.includes( mode ) ) {
		return [];
	}
	const cx = style.symmetryX || 0;
	const cy = style.symmetryY || 0;
	const turn = ( angle, mirror ) => {
		const c = Math.cos( angle );
		const s = Math.sin( angle );
		return ( p ) => {
			const x = mirror ? cx - ( p.x - cx ) : p.x;
			const dx = x - cx;
			const dy = p.y - cy;
			return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
		};
	};
	if ( 'both' === mode ) {
		return [
			{ map: turn( 0, true ), flip: true },
			{ map: turn( Math.PI, true ), flip: true },
			{ map: turn( Math.PI, false ), flip: false },
		];
	}
	const n = Math.max(
		2,
		Math.min( 16, Math.round( style.symmetryCount || 6 ) )
	);
	const maps = [];
	for ( let k = 0; k < n; k++ ) {
		const a = ( 2 * Math.PI * k ) / n;
		if ( k ) {
			maps.push( { map: turn( a, false ), flip: false } );
		}
		if ( 'kaleido' === mode ) {
			maps.push( { map: turn( a, true ), flip: true } );
		}
	}
	return maps;
}
/** Every symmetric copy of an outline, as one path string. */
export function penSymmetryCopies( d, style ) {
	const subs = parsePathAnchors( d ) || [];
	return penSymmetryMaps( style )
		.map( ( { map, flip } ) => {
			const copy = mapPenSubs( subs, map );
			if ( flip ) {
				for ( const s of copy ) {
					s.anchors = s.anchors
						.reverse()
						.map( ( a ) => ( { ...a, hIn: a.hOut, hOut: a.hIn } ) );
				}
			}
			return buildPathD( copy );
		} )
		.join( '' );
}
export function nibFactor( normal, style ) {
	if ( ! style.nib ) {
		return 1;
	}
	const a = ( style.nibAngle * Math.PI ) / 180,
		cos = Math.cos( a ),
		sin = Math.sin( a ),
		length = Math.hypot( normal.x, normal.y ) || 1,
		x = normal.x / length,
		y = normal.y / length;
	return Math.hypot(
		x * cos + y * sin,
		( ( y * cos - x * sin ) * style.nibRoundness ) / 100
	);
}
export function motionWidthAt( t, style ) {
	if ( style.dynamics === 'none' || ! style.motion?.length ) {
		return 1;
	}
	const points = style.motion;
	let i = points.findIndex( ( p ) => p.t >= t );
	if ( i < 0 ) {
		i = points.length - 1;
	}
	const a = points[ Math.max( 0, i - 1 ) ],
		b = points[ i ],
		u = clamp( ( t - a.t ) / Math.max( 1e-9, b.t - a.t ), 0, 1 ),
		value = a.value + ( b.value - a.value ) * u;
	return (
		1 +
		( ( Math.max( style.motionMin / 100, value ) - 1 ) *
			style.motionStrength ) /
			100
	);
}
export function recordPenSample( p, event ) {
	return {
		...p,
		pressure:
			event.pointerType === 'pen' ? clamp( event.pressure, 0.02, 1 ) : 1,
		time: Number.isFinite( event.timeStamp ) ? event.timeStamp : 0,
	};
}
export function penMotion( points, mode ) {
	if ( ! [ 'pressure', 'speed' ].includes( mode ) || points.length < 2 ) {
		return [];
	}
	let length = 0,
		filtered = mode === 'pressure' ? points[ 0 ].pressure ?? 1 : 1;
	const raw = [ { t: 0, value: filtered } ];
	for ( let i = 1; i < points.length; i++ ) {
		const lengthHere = dist( points[ i - 1 ], points[ i ] );
		length += lengthHere;
		const speed =
			lengthHere /
			Math.max(
				1,
				( points[ i ].time || 0 ) - ( points[ i - 1 ].time || 0 )
			);
		const value =
			mode === 'pressure'
				? points[ i ].pressure ?? 1
				: clamp( 1 / ( 1 + speed * 1.4 ), 0.08, 1 );
		filtered = filtered * 0.35 + value * 0.65;
		raw.push( { t: length, value: filtered } );
	}
	if ( length < 1e-8 ) {
		return [];
	}
	const count = Math.min( 96, raw.length );
	return Array.from( { length: count }, ( _, i ) => {
		const p =
			raw[ Math.round( ( i * ( raw.length - 1 ) ) / ( count - 1 ) ) ];
		return { t: p.t / length, value: p.value };
	} );
}
export function replacePenSection( subs, start, end, points, error = 2 ) {
	if ( start.si !== end.si || points.length < 3 ) {
		return null;
	}
	let s = subs[ start.si ],
		a = start.seg + start.t,
		b = end.seg + end.t;
	const n = segmentCount( s ),
		stroke = points.slice();
	if ( s.closed && Math.abs( a - b ) > n / 2 ) {
		const pivot = Math.floor( Math.max( a, b ) );
		s = {
			...s,
			anchors: [
				...s.anchors.slice( pivot ),
				...s.anchors.slice( 0, pivot ),
			],
		};
		a = ( a - pivot + n ) % n;
		b = ( b - pivot + n ) % n;
	}
	if ( a > b ) {
		[ a, b ] = [ b, a ];
		stroke.reverse();
	}
	if ( b - a < 0.01 ) {
		return null;
	}
	const prefix = penSubRange( s, 0, a ),
		suffix = penSubRange( s, b, n ),
		removed = penSubRange( s, a, b );
	if ( ! removed.anchors.length ) {
		return null;
	}
	stroke[ 0 ] = { ...removed.anchors[ 0 ] };
	stroke[ stroke.length - 1 ] = { ...removed.anchors.at( -1 ) };
	const fit = fitToAnchors( stroke, error );
	if ( fit.length < 2 ) {
		return null;
	}
	const first = fit[ 0 ],
		last = fit.at( -1 ),
		before = prefix.anchors.at( -1 ),
		after = suffix.anchors[ 0 ];
	if ( before ) {
		first.hIn = before.hIn;
		if ( first.hOut ) {
			const u = unit(
					before.hIn || prefix.anchors.at( -2 ) || first,
					first
				),
				l = dist( first, first.hOut );
			first.hOut = { x: first.x + u.x * l, y: first.y + u.y * l };
		}
	}
	if ( after ) {
		last.hOut = after.hOut;
		if ( last.hIn ) {
			const u = unit( last, after.hOut || suffix.anchors[ 1 ] || last ),
				l = dist( last, last.hIn );
			last.hIn = { x: last.x - u.x * l, y: last.y - u.y * l };
		}
	}
	const anchors = [
		...prefix.anchors.slice( 0, -1 ),
		...fit,
		...suffix.anchors.slice( 1 ),
	];
	if ( s.closed && anchors.length > 2 ) {
		anchors[ 0 ].hIn = anchors.at( -1 ).hIn;
		anchors.pop();
	}
	const next = subs.slice();
	next[ start.si ] = { ...s, anchors };
	return next;
}
export function refinePenArea( subs, center, radius ) {
	return subs.map( ( s ) => {
		const anchors = [];
		for ( let i = 0; i < segmentCount( s ); i++ ) {
			const c = segment( s, i ),
				touch = Array.from( { length: 17 }, ( _, j ) =>
					bezierAt( c, j / 16 )
				).some( ( p ) => dist( p, center ) < radius * 1.5 );
			const pieces = touch
				? Math.min(
						24,
						Math.max(
							2,
							Math.ceil(
								( dist( c[ 0 ], c[ 1 ] ) +
									dist( c[ 1 ], c[ 2 ] ) +
									dist( c[ 2 ], c[ 3 ] ) ) /
									Math.max( 4, radius / 2 )
							)
						)
				  )
				: 1;
			for ( let j = 0; j < pieces; j++ ) {
				const part = penSubRange(
					s,
					i + j / pieces,
					i + ( j + 1 ) / pieces
				).anchors;
				if ( ! part.length ) {
					continue;
				}
				if ( anchors.length ) {
					anchors.at( -1 ).hOut = part[ 0 ].hOut;
				} else {
					anchors.push( part[ 0 ] );
				}
				anchors.push( part[ 1 ] );
			}
		}
		if ( s.closed && anchors.length ) {
			anchors[ 0 ].hIn = anchors.at( -1 ).hIn;
			anchors.pop();
		}
		return { ...s, anchors };
	} );
}
export function sculptPenPath(
	subs,
	center,
	target,
	radius,
	strength = 0.7,
	mode = 'push'
) {
	const dx = target.x - center.x,
		dy = target.y - center.y,
		travel = Math.hypot( dx, dy ),
		sign = mode === 'pinch' ? -1 : 1;
	return mapPenSubs( subs, ( p ) => {
		const d = dist( p, center ),
			u = clamp( 1 - d / radius, 0, 1 ),
			weight = u * u * ( 3 - 2 * u ) * strength;
		if ( mode === 'push' ) {
			return { x: p.x + dx * weight, y: p.y + dy * weight };
		}
		const amount = Math.min( radius * 0.5, travel ) * weight * sign;
		return {
			x: p.x + ( ( p.x - center.x ) / Math.max( 1, d ) ) * amount,
			y: p.y + ( ( p.y - center.y ) / Math.max( 1, d ) ) * amount,
		};
	} );
}
export function cleanPenColors( value ) {
	return ( Array.isArray( value ) ? value : [] )
		.slice( 0, 12 )
		.filter( ( p ) => p && typeof p === 'object' )
		.map( ( p ) => {
			const c = parseColor( p.color );
			return {
				t: clamp( p.t, 0, 1 ),
				color: toHexColor( c.r, c.g, c.b, c.a ),
			};
		} )
		.sort( ( a, b ) => a.t - b.t );
}
export function penColorAt( stops, t ) {
	if ( ! stops.length ) {
		return '#000000';
	}
	const i = stops.findIndex( ( p ) => p.t >= t );
	if ( i < 0 ) {
		return stops.at( -1 ).color;
	}
	if ( i === 0 ) {
		return stops[ 0 ].color;
	}
	const a = stops[ i - 1 ],
		b = stops[ i ],
		u = clamp( ( t - a.t ) / Math.max( 1e-9, b.t - a.t ), 0, 1 ),
		ca = parseColor( a.color ),
		cb = parseColor( b.color );
	return toHexColor(
		ca.r + ( cb.r - ca.r ) * u,
		ca.g + ( cb.g - ca.g ) * u,
		ca.b + ( cb.b - ca.b ) * u,
		ca.a + ( cb.a - ca.a ) * u
	);
}
