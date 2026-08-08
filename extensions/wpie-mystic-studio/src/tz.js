/**
 * Local birth time -> UTC without a server: a bundled coordinates-to-IANA
 * lookup (tz-lookup, ~70 KB packed) names the zone, and the browser's own
 * Intl database resolves the historical UTC offset for that zone at that
 * moment - including decades-old DST rules. A manual offset override
 * covers the exotic cases.
 */

import tzLookup from 'tz-lookup';

/** IANA zone name for coordinates, or null when the lookup balks. */
export function zoneFor( lat, lon ) {
	try {
		return tzLookup( lat, lon );
	} catch ( e ) {
		return null;
	}
}

/**
 * UTC offset of a zone at a UTC instant, in minutes east of Greenwich.
 * Computed by formatting the instant in the zone and diffing wall clock
 * against UTC - works in every engine with full ICU (all browsers).
 *
 * @param {string} zone IANA zone name.
 * @param {number} utcMs Instant as epoch milliseconds.
 * @return {number|null} Offset minutes, or null if the zone is unknown.
 */
export function offsetMinutes( zone, utcMs ) {
	let parts;
	try {
		parts = new Intl.DateTimeFormat( 'en-US', {
			timeZone: zone,
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			hour12: false,
		} ).formatToParts( new Date( utcMs ) );
	} catch ( e ) {
		return null;
	}
	const get = ( type ) => {
		const p = parts.find( ( x ) => x.type === type );
		return p ? parseInt( p.value, 10 ) : 0;
	};
	// hour12:false may report midnight as 24.
	const hour = get( 'hour' ) % 24;
	const wallMs = Date.UTC(
		get( 'year' ),
		get( 'month' ) - 1,
		get( 'day' ),
		hour,
		get( 'minute' ),
		get( 'second' )
	);
	return Math.round( ( wallMs - utcMs ) / 60000 );
}

/**
 * Resolve a local wall-clock birth moment at a place to UTC epoch ms.
 *
 * @param {Object} opts { dateStr: 'YYYY-MM-DD', timeStr: 'HH:MM', lat, lon,
 *   overrideMinutes: number|null } - overrideMinutes wins when finite.
 * @return {{utcMs: number, zone: string|null, offsetMinutes: number,
 *   source: 'override'|'zone'|'longitude'}}
 */
export function resolveLocal( opts ) {
	const { dateStr, timeStr, lat, lon, overrideMinutes } = opts || {};
	const [ y, mo, d ] = String( dateStr || '' )
		.split( '-' )
		.map( ( v ) => parseInt( v, 10 ) );
	const [ hh, mm ] = String( timeStr || '12:00' )
		.split( ':' )
		.map( ( v ) => parseInt( v, 10 ) );
	const wallMs = Date.UTC(
		y || 2000,
		( mo || 1 ) - 1,
		d || 1,
		hh || 0,
		mm || 0
	);

	if ( Number.isFinite( overrideMinutes ) ) {
		return {
			utcMs: wallMs - overrideMinutes * 60000,
			zone: null,
			offsetMinutes: overrideMinutes,
			source: 'override',
		};
	}

	const zone =
		Number.isFinite( lat ) && Number.isFinite( lon )
			? zoneFor( lat, lon )
			: null;
	if ( zone ) {
		// Two passes: guess the instant with offset 0, read the zone's
		// offset there, re-read at the corrected instant (DST edges).
		let off = offsetMinutes( zone, wallMs );
		if ( null !== off ) {
			const second = offsetMinutes( zone, wallMs - off * 60000 );
			if ( null !== second ) {
				off = second;
			}
			return {
				utcMs: wallMs - off * 60000,
				zone,
				offsetMinutes: off,
				source: 'zone',
			};
		}
	}

	// Last resort: mean solar time from the longitude (the Star Map rule).
	const solar = Math.round( ( ( lon || 0 ) / 15 ) * 60 );
	return {
		utcMs: wallMs - solar * 60000,
		zone: null,
		offsetMinutes: solar,
		source: 'longitude',
	};
}
