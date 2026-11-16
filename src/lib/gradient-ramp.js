/** Shared color ramp math: stable stop identities, interval midpoints and spread. */
import { parseColor, toHexColor } from './color';

export const clampGradient = ( n, low = 0, high = 1 ) =>
	Math.max( low, Math.min( high, Number.isFinite( +n ) ? +n : low ) );
export const sortedGradientStops = ( stops = [] ) =>
	stops
		.map( ( s, index ) => ( { ...s, at: clampGradient( s.at ), index } ) )
		.sort( ( a, b ) => a.at - b.at );
export const midpointWeight = ( t, mid = 0.5 ) => {
	const m = clampGradient( mid, 0.05, 0.95 );
	const x = clampGradient( t ),
		k = m / ( 1 - m );
	return x / ( k * ( 1 - x ) + x );
};
export function spreadPosition( at, spread = 'pad' ) {
	if ( spread === 'repeat' ) {
		return ( ( at % 1 ) + 1 ) % 1;
	}
	if ( spread === 'reflect' ) {
		const t = ( ( at % 2 ) + 2 ) % 2;
		return t <= 1 ? t : 2 - t;
	}
	return clampGradient( at );
}
export function preparedGradientRamp( stops ) {
	return sortedGradientStops( stops ).map( ( s ) => ( {
		...s,
		rgba: parseColor( s.color ),
	} ) );
}
export function sampleGradientRamp( ramp, at ) {
	if ( ! ramp.length ) {
		return [ 0, 0, 0, 1 ];
	}
	let a = ramp[ 0 ],
		b = a;
	if ( at <= a.at ) {
		return [ a.rgba.r, a.rgba.g, a.rgba.b, a.rgba.a ];
	}
	for ( let i = 1; i < ramp.length; i++ ) {
		b = ramp[ i ];
		if ( at < b.at ) {
			const t = midpointWeight(
				( at - a.at ) / Math.max( 1e-9, b.at - a.at ),
				a.mid ?? 0.5
			);
			return [ 'r', 'g', 'b', 'a' ].map(
				( key ) => a.rgba[ key ] * ( 1 - t ) + b.rgba[ key ] * t
			);
		}
		a = b;
	}
	return [ a.rgba.r, a.rgba.g, a.rgba.b, a.rgba.a ];
}
export function gradientColorAt( stops, at ) {
	return toHexColor(
		...sampleGradientRamp( preparedGradientRamp( stops ), at )
	);
}
/** Canvas and CSS receive sampled stops for biased intervals; old ramps stay exact. */
export function expandedGradientStops( stops ) {
	const sorted = sortedGradientStops( stops ),
		out = [];
	for ( let i = 0; i < sorted.length; i++ ) {
		const a = sorted[ i ],
			b = sorted[ i + 1 ];
		out.push( { at: a.at, color: a.color } );
		if ( b && b.at > a.at && Math.abs( ( a.mid ?? 0.5 ) - 0.5 ) > 0.0001 ) {
			const pair = preparedGradientRamp( [ a, b ] );
			for ( let step = 1; step < 32; step++ ) {
				const at = a.at + ( ( b.at - a.at ) * step ) / 32;
				out.push( {
					at,
					color: toHexColor( ...sampleGradientRamp( pair, at ) ),
				} );
			}
		}
	}
	return out;
}
export function distributeGradientStops( stops ) {
	const ordered = sortedGradientStops( stops ),
		positions = new Map();
	ordered.forEach( ( s, i ) =>
		positions.set( s.index, i / Math.max( 1, ordered.length - 1 ) )
	);
	return stops.map( ( s, i ) => ( { ...s, at: positions.get( i ) } ) );
}
export function reverseGradientStops( stops ) {
	const ordered = sortedGradientStops( stops ),
		mids = new Map();
	ordered.forEach( ( s, i ) => {
		const previous = ordered[ i - 1 ];
		mids.set( s.index, previous ? 1 - ( previous.mid ?? 0.5 ) : 0.5 );
	} );
	return stops.map( ( s, i ) => ( {
		...s,
		at: 1 - s.at,
		...( s.mid !== undefined || mids.get( i ) !== 0.5
			? { mid: mids.get( i ) }
			: {} ),
	} ) );
}

/** Split a biased interval without changing its fractional-linear color curve. */
export function insertGradientStop( stops, at ) {
	const sorted = sortedGradientStops( stops ),
		x = clampGradient( at );
	const right = sorted.findIndex( ( s ) => s.at > x );
	const out = stops.map( ( s ) => ( { ...s } ) );
	const added = { at: x, color: gradientColorAt( stops, x ) };
	if ( right > 0 ) {
		const a = sorted[ right - 1 ],
			b = sorted[ right ];
		const t = ( x - a.at ) / ( b.at - a.at );
		const m = clampGradient( a.mid ?? 0.5, 0.05, 0.95 ),
			k = m / ( 1 - m );
		const d = k + ( 1 - k ) * t;
		if ( m !== 0.5 ) {
			out[ a.index ].mid = k / ( k + d );
			added.mid = d / ( 1 + d );
		}
	}
	return [ ...out, added ];
}
