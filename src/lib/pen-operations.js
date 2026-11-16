/** Geometry operations on editable centerlines. No editor state or timers. */
import { buildPathD, parsePathAnchors, insertAnchor } from './path-edit';
import { flattenPathD } from './text-path';
const distance = ( a, b ) => Math.hypot( a.x - b.x, a.y - b.y );
const clone = ( subs ) =>
	subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( {
			...a,
			hIn: a.hIn && { ...a.hIn },
			hOut: a.hOut && { ...a.hOut },
		} ) ),
	} ) );
const unit = ( a, b ) => {
	const d = distance( a, b ) || 1;
	return { x: ( b.x - a.x ) / d, y: ( b.y - a.y ) / d };
};
export function endpointDirection( sub, end ) {
	const a = end ? sub.anchors.at( -1 ) : sub.anchors[ 0 ];
	const neighbor = end ? sub.anchors.at( -2 ) : sub.anchors[ 1 ];
	if ( ! a || ! neighbor ) {
		return { x: 1, y: 0 };
	}
	// The first nonzero derivative also covers collapsed Bézier handles.
	const candidates = end
		? [ a.hIn, neighbor.hOut, neighbor ]
		: [ a.hOut, neighbor.hIn, neighbor ];
	const from = candidates.find( ( p ) => p && distance( p, a ) > 1e-8 );
	return from ? unit( from, a ) : { x: 1, y: 0 };
}
export function movePenPoints( subs, selected, dx, dy ) {
	const next = clone( subs );
	for ( const { si, ai } of selected ) {
		const a = next[ si ]?.anchors[ ai ];
		if ( ! a ) {
			continue;
		}
		for ( const p of [ a, a.hIn, a.hOut ].filter( Boolean ) ) {
			p.x += dx;
			p.y += dy;
		}
	}
	return next;
}
export function arrangePenPoints( subs, selected, action ) {
	const axis = action.endsWith( 'x' ) ? 'x' : 'y';
	const points = selected
		.filter( ( p ) => subs[ p.si ]?.anchors[ p.ai ] )
		.sort(
			( a, b ) =>
				subs[ a.si ].anchors[ a.ai ][ axis ] -
				subs[ b.si ].anchors[ b.ai ][ axis ]
		);
	if ( points.length < ( action.startsWith( 'distribute' ) ? 3 : 2 ) ) {
		return subs;
	}
	const first = subs[ points[ 0 ].si ].anchors[ points[ 0 ].ai ][ axis ],
		last = subs[ points.at( -1 ).si ].anchors[ points.at( -1 ).ai ][ axis ];
	let next = subs;
	points.forEach( ( p, i ) => {
		const target = action.startsWith( 'distribute' )
			? first + ( ( last - first ) * i ) / ( points.length - 1 )
			: ( first + last ) / 2;
		const delta = target - subs[ p.si ].anchors[ p.ai ][ axis ];
		next = movePenPoints(
			next,
			[ p ],
			axis === 'x' ? delta : 0,
			axis === 'y' ? delta : 0
		);
	} );
	return next;
}
export function cutPenPath( subs, hit ) {
	let next = clone( subs );
	let ai;
	if ( hit.ai !== undefined ) {
		ai = hit.ai;
	} else if ( hit.t < 0.001 ) {
		ai = hit.seg;
	} else if ( hit.t > 0.999 ) {
		ai = ( hit.seg + 1 ) % next[ hit.si ].anchors.length;
	} else {
		next = insertAnchor( next, hit.si, hit.seg, hit.t );
		ai = hit.seg + 1;
	}
	const s = next[ hit.si ];
	if ( ! s ) {
		return subs;
	}
	if ( s.closed ) {
		const anchors = [
			...s.anchors.slice( ai ),
			...s.anchors.slice( 0, ai ),
			{ ...s.anchors[ ai ] },
		];
		anchors[ 0 ] = { ...anchors[ 0 ], hIn: null };
		anchors.at( -1 ).hOut = null;
		next[ hit.si ] = { ...s, closed: false, anchors };
	} else {
		if ( ai === 0 || ai === s.anchors.length - 1 ) {
			return subs;
		}
		const left = s.anchors.slice( 0, ai + 1 ),
			right = s.anchors.slice( ai );
		left[ left.length - 1 ] = { ...left.at( -1 ), hOut: null };
		right[ 0 ] = { ...right[ 0 ], hIn: null };
		next.splice(
			hit.si,
			1,
			{ ...s, anchors: left },
			{ ...s, anchors: right }
		);
	}
	return next;
}
export function penCorner( subs, si, ai ) {
	const s = subs[ si ],
		a = s?.anchors[ ai ];
	if (
		! a ||
		( ! s.closed && ( ai === 0 || ai === s.anchors.length - 1 ) )
	) {
		return null;
	}
	const prev = s.anchors[ ( ai - 1 + s.anchors.length ) % s.anchors.length ],
		next = s.anchors[ ( ai + 1 ) % s.anchors.length ];
	// A circular fillet is exact on straight adjacent segments. Curved joints
	// retain their Bézier handles and are edited with the existing smooth tool.
	if ( a.hIn || a.hOut || prev.hOut || next.hIn ) {
		return null;
	}
	const u = unit( a, prev ),
		v = unit( a, next ),
		angle = Math.acos(
			Math.max( -1, Math.min( 1, u.x * v.x + u.y * v.y ) )
		);
	if ( angle < 0.08 || angle > Math.PI - 0.02 ) {
		return null;
	}
	const bisect = unit( { x: 0, y: 0 }, { x: u.x + v.x, y: u.y + v.y } ),
		maxRadius =
			Math.min( distance( a, prev ), distance( a, next ) ) *
			0.48 *
			Math.tan( angle / 2 );
	return { a, u, v, angle, bisect, maxRadius };
}
export function roundPenCorner( subs, si, ai, radius ) {
	const c = penCorner( subs, si, ai );
	if ( ! c || radius <= 0 ) {
		return subs;
	}
	const r = Math.min( c.maxRadius, radius ),
		inset = r / Math.tan( c.angle / 2 ),
		h = ( 4 / 3 ) * Math.tan( ( Math.PI - c.angle ) / 4 ) * r;
	const a = { x: c.a.x + c.u.x * inset, y: c.a.y + c.u.y * inset, hIn: null },
		b = { x: c.a.x + c.v.x * inset, y: c.a.y + c.v.y * inset, hOut: null };
	a.hOut = { x: a.x - c.u.x * h, y: a.y - c.u.y * h };
	b.hIn = { x: b.x - c.v.x * h, y: b.y - c.v.y * h };
	const next = clone( subs );
	next[ si ].anchors.splice( ai, 1, a, b );
	return next;
}
export function locallySmoothPen( subs, touches, radius, strength = 0.5 ) {
	const next = clone( subs );
	next.forEach( ( s, si ) =>
		s.anchors.forEach( ( a, ai ) => {
			const old = subs[ si ].anchors[ ai ];
			if (
				( ! s.closed && ( ai === 0 || ai === s.anchors.length - 1 ) ) ||
				( ! old.hIn && ! old.hOut )
			) {
				return;
			}
			let weight = 0;
			for ( const p of touches ) {
				weight = Math.max(
					weight,
					Math.max( 0, 1 - distance( old, p ) / radius )
				);
			}
			if ( ! weight ) {
				return;
			}
			weight *= Math.max( 0, Math.min( 1, strength ) );
			const prev =
					subs[ si ].anchors[
						( ai - 1 + s.anchors.length ) % s.anchors.length
					],
				after = subs[ si ].anchors[ ( ai + 1 ) % s.anchors.length ];
			a.x = old.x + ( ( prev.x + after.x ) / 2 - old.x ) * weight * 0.35;
			a.y = old.y + ( ( prev.y + after.y ) / 2 - old.y ) * weight * 0.35;
			const direction = unit( prev, after );
			for ( const key of [ 'hIn', 'hOut' ] ) {
				if ( ! old[ key ] ) {
					continue;
				}
				const sign = key === 'hIn' ? -1 : 1,
					len = distance( old, old[ key ] );
				a[ key ] = {
					x:
						a.x +
						( old[ key ].x - old.x ) * ( 1 - weight ) +
						direction.x * len * sign * weight,
					y:
						a.y +
						( old[ key ].y - old.y ) * ( 1 - weight ) +
						direction.y * len * sign * weight,
				};
			}
		} )
	);
	return next;
}
const reverse = ( anchors ) =>
	anchors
		.slice()
		.reverse()
		.map( ( a ) => ( { ...a, hIn: a.hOut, hOut: a.hIn } ) );
export function joinPenPaths( subs, first, second, smooth = false ) {
	const next = clone( subs ),
		a = next[ first.si ],
		b = next[ second.si ];
	if (
		! a ||
		! b ||
		a.closed ||
		b.closed ||
		( first.si === second.si && first.ai === second.ai )
	) {
		return subs;
	}
	const endpoint = ( s, ai ) => ai === 0 || ai === s.anchors.length - 1;
	if ( ! endpoint( a, first.ai ) || ! endpoint( b, second.ai ) ) {
		return subs;
	}
	if ( first.si === second.si ) {
		a.closed = true;
		connect(
			a.anchors.at( -1 ),
			a.anchors[ 0 ],
			a.anchors.at( -2 ),
			a.anchors[ 1 ],
			smooth
		);
		return next;
	}
	const left = first.ai === 0 ? reverse( a.anchors ) : a.anchors,
		right = second.ai === 0 ? b.anchors : reverse( b.anchors );
	const last = left.at( -1 ),
		start = right[ 0 ];
	if ( distance( last, start ) < 1e-5 ) {
		last.hOut = start.hOut;
		right.shift();
		if ( smooth && last.hIn && last.hOut ) {
			const u = unit( last.hIn, last.hOut ),
				l = distance( last, last.hIn ),
				r = distance( last, last.hOut );
			last.hIn = { x: last.x - u.x * l, y: last.y - u.y * l };
			last.hOut = { x: last.x + u.x * r, y: last.y + u.y * r };
		}
	} else {
		connect( last, start, left.at( -2 ), right[ 1 ], smooth );
	}
	next[ first.si ] = { ...a, anchors: [ ...left, ...right ] };
	next.splice( second.si, 1 );
	return next;
}
function connect( a, b, prev, next, smooth ) {
	a.hOut = null;
	b.hIn = null;
	if ( ! smooth ) {
		return;
	}
	const size = distance( a, b ) / 3,
		u = unit( a.hIn || prev, a ),
		v = unit( b, b.hOut || next );
	a.hOut = { x: a.x + u.x * size, y: a.y + u.y * size };
	b.hIn = { x: b.x - v.x * size, y: b.y - v.y * size };
}
export function offsetPenPath( d, amount ) {
	if ( ! amount ) {
		return d;
	}
	const subs = flattenPathD( d, 0.4 ).map( ( raw ) => {
		const pts = raw.filter(
				( p, i ) => ! i || distance( p, raw[ i - 1 ] ) > 1e-7
			),
			closed =
				pts.length > 2 && distance( pts[ 0 ], pts.at( -1 ) ) < 1e-6;
		if ( closed ) {
			pts.pop();
		}
		const anchors = pts.map( ( p, i ) => {
			const prev = pts[ i - 1 ] || ( closed ? pts.at( -1 ) : p ),
				after = pts[ i + 1 ] || ( closed ? pts[ 0 ] : p );
			let u = unit( prev, p ),
				v = unit( p, after );
			if ( ! closed && i === 0 ) {
				u = v;
			}
			if ( ! closed && i === pts.length - 1 ) {
				v = u;
			}
			const den = Math.max( 0.5, 1 + u.x * v.x + u.y * v.y );
			return {
				x: p.x - ( ( u.y + v.y ) * amount ) / den,
				y: p.y + ( ( u.x + v.x ) * amount ) / den,
				hIn: null,
				hOut: null,
			};
		} );
		return { anchors, closed };
	} );
	return buildPathD( subs );
}
export function mapPenSubs( subs, map ) {
	return subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( {
			...a,
			...map( a ),
			hIn: a.hIn ? map( a.hIn ) : null,
			hOut: a.hOut ? map( a.hOut ) : null,
		} ) ),
	} ) );
}
export function penCoordinates( layer, zoom = 1, pan = { x: 0, y: 0 } ) {
	const angle = ( ( layer.rot || 0 ) * Math.PI ) / 180,
		c = Math.cos( angle ),
		s = Math.sin( angle ),
		fx = layer.flipX ? -1 : 1,
		fy = layer.flipY ? -1 : 1,
		cx = layer.x + layer.w / 2,
		cy = layer.y + layer.h / 2;
	return {
		screen: ( p ) => {
			const x = ( p.x - layer.w / 2 ) * fx,
				y = ( p.y - layer.h / 2 ) * fy;
			return {
				x: pan.x + ( cx + x * c - y * s ) * zoom,
				y: pan.y + ( cy + x * s + y * c ) * zoom,
			};
		},
		local: ( p ) => {
			const x = ( p.x - pan.x ) / zoom - cx,
				y = ( p.y - pan.y ) / zoom - cy;
			return {
				x: ( x * c + y * s ) * fx + layer.w / 2,
				y: ( -x * s + y * c ) * fy + layer.h / 2,
			};
		},
	};
}
export function penContinuation( layer, si, ai ) {
	const subs = parsePathAnchors( layer.penPath.d ),
		s = subs?.[ si ];
	if ( ! s || s.closed || ( ai !== 0 && ai !== s.anchors.length - 1 ) ) {
		return null;
	}
	const a = s.anchors[ ai ],
		map = penCoordinates( layer ),
		p = map.screen( {
			x: ( a.x * layer.w ) / layer.penPath.w,
			y: ( a.y * layer.h ) / layer.penPath.h,
		} );
	return {
		kind: 'pen',
		anchors: [ { ...p, hIn: null, hOut: null } ],
		closed: false,
		continuation: { id: layer.id, si, start: ai === 0 },
	};
}
export function appendPenContinuation( layer, continuation, d ) {
	const map = penCoordinates( layer ),
		parts = parsePathAnchors( d ) || [],
		subs = clone( parsePathAnchors( layer.penPath.d ) || [] ),
		s = subs[ continuation.si ];
	if ( ! s || s.closed || ! parts.length ) {
		return null;
	}
	let anchors = mapPenSubs( parts, ( p ) => {
		const q = map.local( p );
		return {
			x: ( q.x * layer.penPath.w ) / layer.w,
			y: ( q.y * layer.penPath.h ) / layer.h,
		};
	} )[ 0 ].anchors;
	if ( parts[ 0 ].closed ) {
		anchors.push( { ...anchors[ 0 ], hOut: null } );
	}
	if ( continuation.start ) {
		anchors = reverse( anchors );
		anchors.at( -1 ).hOut = s.anchors[ 0 ].hOut;
		s.anchors = [ ...anchors, ...s.anchors.slice( 1 ) ];
	} else {
		anchors[ 0 ].hIn = s.anchors.at( -1 ).hIn;
		s.anchors = [ ...s.anchors.slice( 0, -1 ), ...anchors ];
	}
	return buildPathD( subs );
}
