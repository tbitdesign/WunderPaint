/** Small, reusable operations on the existing Bezier anchor model. */
import { bezierAt, fitToAnchors } from './curve-fit';
import { buildPathD, parsePathAnchors, toggleSmooth } from './path-edit';
import { flattenPathD } from './text-path';
const copy = ( subs ) =>
	subs.map( ( s ) => ( {
		...s,
		anchors: s.anchors.map( ( a ) => ( {
			...a,
			hIn: a.hIn
				? {
						...a.hIn,
				  }
				: null,
			hOut: a.hOut
				? {
						...a.hOut,
				  }
				: null,
		} ) ),
	} ) );
export function nearestPenSegment( subs, p, maxDist = Infinity ) {
	let best = null;
	subs.forEach( ( s, si ) => {
		const count = s.closed ? s.anchors.length : s.anchors.length - 1;
		for ( let seg = 0; seg < count; seg++ ) {
			const a = s.anchors[ seg ],
				b = s.anchors[ ( seg + 1 ) % s.anchors.length ],
				controls = [ a, a.hOut || a, b.hIn || b, b ];
			const curved = a.hOut || b.hIn,
				n = curved ? 48 : 1;
			let prev = {
				x: a.x,
				y: a.y,
			};
			for ( let i = 1; i <= n; i++ ) {
				const q = curved ? bezierAt( controls, i / n ) : b,
					dx = q.x - prev.x,
					dy = q.y - prev.y,
					l2 = dx * dx + dy * dy;
				const f = l2
					? Math.max(
							0,
							Math.min(
								1,
								( ( p.x - prev.x ) * dx +
									( p.y - prev.y ) * dy ) /
									l2
							)
					  )
					: 0;
				const x = prev.x + dx * f,
					y = prev.y + dy * f,
					dist = Math.hypot( x - p.x, y - p.y );
				if ( dist <= maxDist && ( ! best || dist < best.dist ) ) {
					best = {
						si,
						seg,
						t: ( i - 1 + f ) / n,
						x,
						y,
						dist,
					};
				}
				prev = q;
			}
		}
	} );
	return best;
}
export function bendPenSegment( subs, hit, p ) {
	const next = copy( subs ),
		s = next[ hit.si ],
		a = s.anchors[ hit.seg ],
		b = s.anchors[ ( hit.seg + 1 ) % s.anchors.length ];
	if ( ! a.hOut ) {
		a.hOut = {
			x: a.x + ( b.x - a.x ) / 3,
			y: a.y + ( b.y - a.y ) / 3,
		};
	}
	if ( ! b.hIn ) {
		b.hIn = {
			x: a.x + ( ( b.x - a.x ) * 2 ) / 3,
			y: a.y + ( ( b.y - a.y ) * 2 ) / 3,
		};
	}
	const t = Math.max( 0.05, Math.min( 0.95, hit.t ) ),
		q = bezierAt( [ a, a.hOut, b.hIn, b ], t ),
		u = 1 - t,
		b1 = 3 * u * u * t,
		b2 = 3 * u * t * t,
		den = b1 * b1 + b2 * b2;
	a.hOut.x += ( ( p.x - q.x ) * b1 ) / den;
	a.hOut.y += ( ( p.y - q.y ) * b1 ) / den;
	b.hIn.x += ( ( p.x - q.x ) * b2 ) / den;
	b.hIn.y += ( ( p.y - q.y ) * b2 ) / den;
	return next;
}
export function setPenPointType( subs, selection, type ) {
	if ( ! selection ) {
		return subs;
	}
	const { si, ai } = selection;
	let next = copy( subs );
	let a = next[ si ]?.anchors[ ai ];
	if ( ! a ) {
		return subs;
	}
	if ( type === 'corner' ) {
		a.hIn = null;
		a.hOut = null;
		return next;
	}
	if ( ! a.hIn && ! a.hOut ) {
		next = toggleSmooth( next, si, ai );
		a = next[ si ].anchors[ ai ];
	}
	const h = a.hOut || a.hIn;
	if ( ! h ) {
		return next;
	}
	const sign = a.hOut ? 1 : -1,
		dx = ( h.x - a.x ) * sign,
		dy = ( h.y - a.y ) * sign,
		len = Math.hypot( dx, dy ) || 1;
	const inLen = a.hIn ? Math.hypot( a.hIn.x - a.x, a.hIn.y - a.y ) : len,
		outLen = a.hOut ? Math.hypot( a.hOut.x - a.x, a.hOut.y - a.y ) : len;
	const l = type === 'symmetric' ? ( inLen + outLen ) / 2 : 0;
	a.hIn = {
		x: a.x - ( dx / len ) * ( l || inLen ),
		y: a.y - ( dy / len ) * ( l || inLen ),
	};
	a.hOut = {
		x: a.x + ( dx / len ) * ( l || outLen ),
		y: a.y + ( dy / len ) * ( l || outLen ),
	};
	return next;
}
export function reversePenPath( d ) {
	return buildPathD(
		( parsePathAnchors( d ) || [] ).map( ( s ) => ( {
			...s,
			anchors: s.anchors
				.slice()
				.reverse()
				.map( ( a ) => ( {
					...a,
					hIn: a.hOut,
					hOut: a.hIn,
				} ) ),
		} ) )
	);
}
export function smoothPenPath( d, error ) {
	const subs = parsePathAnchors( d ) || [],
		flat = flattenPathD( d, 1 );
	return buildPathD(
		subs.map( ( s, i ) => ( {
			...s,
			anchors: fitToAnchors( flat[ i ] || [], error ),
		} ) )
	);
}
export function extendPenPath( d, amount ) {
	const subs = parsePathAnchors( d );
	if ( ! subs?.length ) {
		return d;
	}
	const s = subs[ subs.length - 1 ];
	if ( s.closed || s.anchors.length < 2 ) {
		return d;
	}
	const a = s.anchors[ s.anchors.length - 1 ],
		prev = s.anchors[ s.anchors.length - 2 ],
		from = a.hIn || prev;
	const dx = a.x - from.x,
		dy = a.y - from.y,
		len = Math.hypot( dx, dy ) || 1;
	const target = {
		x: a.x + ( dx / len ) * amount,
		y: a.y + ( dy / len ) * amount,
		hIn: null,
		hOut: null,
	};
	s.anchors.push( target );
	return buildPathD( subs );
}
