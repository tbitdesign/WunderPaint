/**
 * Route statistics: distance, elevation gain (hysteresis-filtered so
 * GPS noise does not inflate it), duration, pace. Pure math, shared by
 * the dialog and the tests.
 */

import { haversineM } from './map-engine.js';

/** Elevation changes below this many meters count as noise. */
const GAIN_THRESHOLD_M = 3;

/**
 * Aggregate stats over all segments.
 *
 * @param {Array} segments Segments of {lat,lon,ele,time} points.
 * @return {Object} { distM, gainM, durS, startMs, maxEle, minEle }
 */
export function routeStats( segments ) {
	let distM = 0;
	let gainM = 0;
	let maxEle = -Infinity;
	let minEle = Infinity;
	let firstT = null;
	let lastT = null;
	for ( const seg of segments ) {
		let ref = null;
		for ( let i = 0; i < seg.length; i++ ) {
			const p = seg[ i ];
			if ( i > 0 ) {
				distM += haversineM( seg[ i - 1 ], p );
			}
			if ( 'number' === typeof p.ele && ! Number.isNaN( p.ele ) ) {
				maxEle = Math.max( maxEle, p.ele );
				minEle = Math.min( minEle, p.ele );
				if ( null === ref ) {
					ref = p.ele;
				} else if ( p.ele - ref >= GAIN_THRESHOLD_M ) {
					gainM += p.ele - ref;
					ref = p.ele;
				} else if ( ref - p.ele >= GAIN_THRESHOLD_M ) {
					ref = p.ele;
				}
			}
			if ( p.time ) {
				if ( null === firstT ) {
					firstT = p.time;
				}
				lastT = p.time;
			}
		}
	}
	return {
		distM,
		gainM: Math.round( gainM ),
		durS:
			firstT && lastT && lastT > firstT
				? Math.round( ( lastT - firstT ) / 1000 )
				: 0,
		startMs: firstT,
		maxEle: maxEle === -Infinity ? null : maxEle,
		minEle: minEle === Infinity ? null : minEle,
	};
}

/** "21.1 km" / "850 m". */
export function fmtDistance( m ) {
	if ( m < 1000 ) {
		return Math.round( m ) + ' m';
	}
	const km = m / 1000;
	return ( km >= 100 ? Math.round( km ) : km.toFixed( 1 ) ) + ' km';
}

/** "348 hm" (elevation gain, poster shorthand). */
export const fmtGain = ( m ) => Math.round( m ) + ' hm';

/** "1:58 h" / "48 min". */
export function fmtDuration( s ) {
	if ( ! s ) {
		return '';
	}
	const h = Math.floor( s / 3600 );
	const min = Math.round( ( s % 3600 ) / 60 );
	if ( ! h ) {
		return min + ' min';
	}
	return h + ':' + String( min ).padStart( 2, '0' ) + ' h';
}

/** "5:37 /km". */
export function fmtPace( distM, durS ) {
	if ( ! durS || distM < 50 ) {
		return '';
	}
	const secPerKm = durS / ( distM / 1000 );
	const min = Math.floor( secPerKm / 60 );
	const sec = Math.round( secPerKm % 60 );
	return (
		min + ':' + String( sec ).padStart( 2, '0' ) + ' /km'
	);
}

/**
 * Locale-aware poster date ("12. Mai 2026" / "May 12, 2026").
 *
 * @param {number} ms     Epoch millis.
 * @param {string} locale BCP-47 tag.
 * @return {string} Formatted date ('' without a timestamp).
 */
export function fmtDate( ms, locale ) {
	if ( ! ms ) {
		return '';
	}
	// WPIE.locale arrives as "de_DE": normalize to BCP-47, otherwise
	// Intl throws and we would fall back to ISO for every German site.
	const tag = String( locale || 'en' ).replace( /_/g, '-' );
	for ( const cand of [ tag, tag.split( '-' )[ 0 ], 'en' ] ) {
		try {
			return new Intl.DateTimeFormat( cand, {
				day: 'numeric',
				month: 'long',
				year: 'numeric',
			} ).format( new Date( ms ) );
		} catch ( e ) {
			// Next candidate.
		}
	}
	return new Date( ms ).toISOString().slice( 0, 10 );
}

/* ------------------------------ value series ------------------------------ */

const percentile = ( sorted, q ) =>
	sorted[
		Math.max(
			0,
			Math.min(
				sorted.length - 1,
				Math.round( q * ( sorted.length - 1 ) )
			)
		)
	];

/**
 * Per-point values for the route color modes, aligned with the
 * segments' point order. Returns null when the track lacks the data.
 * min/max are 5th/95th percentiles, so single GPS outliers do not
 * flatten the whole ramp.
 *
 * @param {Array}  segments Route segments.
 * @param {string} mode     'pace' | 'hr' | 'ele'.
 * @return {Object|null} { values: [[number]], min, max }
 */
export function valueSeries( segments, mode ) {
	const values = [];
	const all = [];
	let has = false;
	for ( const seg of segments ) {
		const v = new Array( seg.length ).fill( null );
		if ( 'pace' === mode ) {
			// Speed between neighbours, then a 3-point smooth.
			const raw = new Array( seg.length ).fill( null );
			for ( let i = 1; i < seg.length; i++ ) {
				const a = seg[ i - 1 ];
				const b = seg[ i ];
				if ( a.time && b.time && b.time > a.time ) {
					raw[ i ] = haversineM( a, b ) / ( ( b.time - a.time ) / 1000 );
				}
			}
			raw[ 0 ] = raw[ 1 ];
			for ( let i = 0; i < seg.length; i++ ) {
				const win = [ raw[ i - 1 ], raw[ i ], raw[ i + 1 ] ].filter(
					( x ) => 'number' === typeof x && isFinite( x )
				);
				if ( win.length ) {
					v[ i ] = win.reduce( ( a, b ) => a + b, 0 ) / win.length;
				}
			}
		} else {
			const key = 'hr' === mode ? 'hr' : 'ele';
			for ( let i = 0; i < seg.length; i++ ) {
				const x = seg[ i ][ key ];
				if ( 'number' === typeof x && ! Number.isNaN( x ) ) {
					v[ i ] = x;
				}
			}
		}
		// Forward/backward fill the gaps so every point gets a color.
		let prev = null;
		for ( let i = 0; i < v.length; i++ ) {
			if ( null === v[ i ] ) {
				v[ i ] = prev;
			} else {
				prev = v[ i ];
				has = true;
			}
		}
		for ( let i = v.length - 1; i >= 0; i-- ) {
			if ( null === v[ i ] ) {
				v[ i ] = v[ i + 1 ] ?? null;
			}
		}
		values.push( v );
		for ( const x of v ) {
			if ( 'number' === typeof x ) {
				all.push( x );
			}
		}
	}
	if ( ! has || all.length < 4 ) {
		return null;
	}
	all.sort( ( a, b ) => a - b );
	const min = percentile( all, 0.05 );
	const max = percentile( all, 0.95 );
	if ( ! ( max > min ) ) {
		return null;
	}
	return { values, min, max };
}

/** "5:37" pace label for a speed in m/s. */
export function paceLabel( mps ) {
	if ( ! mps || mps <= 0 ) {
		return '';
	}
	const secPerKm = Math.round( 1000 / mps );
	return (
		Math.floor( secPerKm / 60 ) +
		':' +
		String( secPerKm % 60 ).padStart( 2, '0' )
	);
}
