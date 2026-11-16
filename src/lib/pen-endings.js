/** Endpoint ornaments follow the exact tangent or the sampled centerline. */
import { endpointDirection } from './pen-operations';
const fmt = ( n ) => Math.round( n * 1000 ) / 1000;
const polygon = ( points ) => {
	const area = points.reduce( ( v, p, i ) => {
		const q = points[ ( i + 1 ) % points.length ];
		return v + p.x * q.y - q.x * p.y;
	}, 0 );
	const ps = area < 0 ? points.slice().reverse() : points;
	return (
		'M' +
		ps.map( ( p ) => `${ fmt( p.x ) },${ fmt( p.y ) }` ).join( 'L' ) +
		'Z'
	);
};
export function penEndingSize( sub, p, end, native ) {
	const type = end ? p.endHead : p.startHead;
	const length = Math.min( sub.total * 0.4, p.width * p.headLength ),
		width = p.width * p.headWidth;
	const pointed = [ 'arrow', 'needle' ].includes( type );
	let cut = pointed
		? length * 0.9
		: type === 'circle'
		? Math.min( length, width ) * 0.5
		: type === 'diamond'
		? length * 0.5
		: 0;
	// On a tight curve the shaft can enter a rigid marker through its side.
	// Stop inside the marker, rather than cutting it at a disconnected base.
	if ( native && cut && ( p.headFollow === 'straight' || ! pointed ) ) {
		const tip = end ? sub.pts.at( -1 ) : sub.pts[ 0 ],
			direction = endpointDirection( native, end ),
			r = Math.min( length, width ) / 2,
			half = width * ( type === 'needle' ? 0.25 : 0.5 );
		let inside = 0;
		for ( let i = 1; i <= 40; i++ ) {
			const distance = ( cut * i ) / 40,
				q = samplePenDistance(
					sub,
					end ? sub.total - distance : distance
				),
				dx = tip.x - q.x,
				dy = tip.y - q.y,
				back = dx * direction.x + dy * direction.y,
				side = Math.abs( dx * direction.y - dy * direction.x );
			const contains =
				type === 'circle'
					? ( back - r ) ** 2 + side ** 2 <= r * r
					: back >= 0 &&
					  back <= length &&
					  side <=
							half *
								( pointed
									? back / length
									: 1 -
									  Math.abs( back - length / 2 ) /
											( length / 2 ) );
			if ( ! contains ) {
				break;
			}
			inside = distance;
		}
		cut = inside * 0.95;
	}

	return {
		type,
		length,
		width: type === 'needle' ? width * 0.5 : width,
		cut,
	};
}
export function samplePenDistance( sub, s ) {
	const pts = sub.pts;
	const at = Math.max( 0, Math.min( sub.total, s ) );
	let i = pts.findIndex( ( p ) => p.s >= at );
	if ( i < 1 ) {
		i = 1;
	}
	const a = pts[ i - 1 ],
		b = pts[ i ],
		u = ( at - a.s ) / Math.max( 1e-9, b.s - a.s );
	return {
		x: a.x + ( b.x - a.x ) * u,
		y: a.y + ( b.y - a.y ) * u,
		s: at,
		t: at / sub.total,
	};
}
export function trimPenSamples( sub, start, end ) {
	const lo = Math.min( start, sub.total * 0.45 ),
		hi = Math.max( sub.total - end, sub.total * 0.55 );
	return [
		samplePenDistance( sub, lo ),
		...sub.pts.filter( ( p ) => p.s > lo && p.s < hi ),
		samplePenDistance( sub, hi ),
	];
}
export function penEnding( sub, native, p, end ) {
	const { type, length, width } = penEndingSize( sub, p, end );
	if ( type === 'none' || ! native ) {
		return '';
	}
	const tip = end ? sub.pts.at( -1 ) : sub.pts[ 0 ],
		u = endpointDirection( native, end ),
		n = { x: -u.y, y: u.x };
	const point = ( back, side ) => ( {
		x: tip.x - u.x * back + n.x * side,
		y: tip.y - u.y * back + n.y * side,
	} );
	if ( type === 'circle' ) {
		const r = Math.min( length, width ) / 2;
		return polygon(
			Array.from( { length: 48 }, ( _, i ) =>
				point(
					r + r * Math.cos( ( i * Math.PI ) / 24 ),
					r * Math.sin( ( i * Math.PI ) / 24 )
				)
			)
		);
	}
	if ( type === 'diamond' ) {
		return polygon( [
			tip,
			point( length / 2, width / 2 ),
			point( length, 0 ),
			point( length / 2, -width / 2 ),
		] );
	}
	if ( type === 'bar' ) {
		const thick = Math.min( length, p.width * 0.55 );
		return polygon( [
			point( 0, width / 2 ),
			point( thick, width / 2 ),
			point( thick, -width / 2 ),
			point( 0, -width / 2 ),
		] );
	}
	const count =
		p.headFollow === 'curve'
			? Math.min( 100, Math.max( 8, Math.ceil( length / 2 ) ) )
			: 1;
	const left = [],
		right = [],
		innerLeft = [],
		innerRight = [];
	for ( let i = 0; i <= count; i++ ) {
		const back = ( length * i ) / count,
			at =
				p.headFollow === 'curve'
					? samplePenDistance( sub, end ? sub.total - back : back )
					: point( back, 0 );
		let normal = n;
		if ( p.headFollow === 'curve' && i > 0 ) {
			const step = Math.max( 0.05, Math.min( 1, length / 100 ) ),
				a = samplePenDistance( sub, at.s - step ),
				b = samplePenDistance( sub, at.s + step ),
				len = Math.hypot( b.x - a.x, b.y - a.y ) || 1,
				sign = end ? 1 : -1;
			normal = {
				x: ( -( b.y - a.y ) / len ) * sign,
				y: ( ( b.x - a.x ) / len ) * sign,
			};
		}
		const half = ( ( width / 2 ) * i ) / count,
			thick = Math.min( width * 0.16, Math.max( p.width * 0.5, 1 ) );
		left.push( { x: at.x + normal.x * half, y: at.y + normal.y * half } );
		right.push( { x: at.x - normal.x * half, y: at.y - normal.y * half } );
		const inside = Math.max( 0, half - thick );
		innerLeft.push( {
			x: at.x + normal.x * inside,
			y: at.y + normal.y * inside,
		} );
		innerRight.push( {
			x: at.x - normal.x * inside,
			y: at.y - normal.y * inside,
		} );
	}
	// Positive pieces avoid winding holes on a tight bend.
	let out = '';
	for ( let i = 1; i < left.length; i++ ) {
		if ( type === 'open' ) {
			out +=
				polygon( [
					left[ i - 1 ],
					left[ i ],
					innerLeft[ i ],
					innerLeft[ i - 1 ],
				] ) +
				polygon( [
					right[ i - 1 ],
					right[ i ],
					innerRight[ i ],
					innerRight[ i - 1 ],
				] );
		} else {
			out +=
				polygon( [ left[ i - 1 ], left[ i ], right[ i ] ] ) +
				polygon( [ left[ i - 1 ], right[ i ], right[ i - 1 ] ] );
		}
	}
	return out;
}
