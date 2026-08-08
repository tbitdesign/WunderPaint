/**
 * Star Map Posters: positional astronomy, just enough for a poster.
 *
 * Equatorial J2000 coordinates from the bundled catalog are converted
 * to the observer's horizontal system (altitude/azimuth) for a given
 * place and moment, then projected azimuthally from the zenith - the
 * classic circular star chart. Accuracy is a small fraction of a degree
 * over +-100 years (no precession/nutation/refraction), which is far
 * below one star-dot diameter at poster scale.
 */

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;

/**
 * Julian date for a JS Date (its UTC instant).
 *
 * @param {Date} date Date.
 * @return {number} Julian date.
 */
export function julianDate( date ) {
	return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Greenwich mean sidereal time in degrees (IAU 1982 series).
 *
 * @param {number} jd Julian date.
 * @return {number} GMST 0..360.
 */
export function gmstDeg( jd ) {
	const d = jd - 2451545.0;
	const t = d / 36525;
	const g =
		280.46061837 +
		360.98564736629 * d +
		0.000387933 * t * t -
		( t * t * t ) / 38710000;
	return ( ( g % 360 ) + 360 ) % 360;
}

/**
 * Horizontal coordinates for an equatorial position.
 *
 * @param {number} raDeg  Right ascension J2000 (degrees).
 * @param {number} decDeg Declination J2000 (degrees).
 * @param {number} latDeg Observer latitude (degrees, north positive).
 * @param {number} lonDeg Observer longitude (degrees, east positive).
 * @param {number} jd     Julian date.
 * @return {Object} { alt, az } in degrees; az 0 = north, clockwise.
 */
export function altAz( raDeg, decDeg, latDeg, lonDeg, jd ) {
	const hourAngle = ( gmstDeg( jd ) + lonDeg - raDeg ) * RAD;
	const lat = latDeg * RAD;
	const dec = decDeg * RAD;
	const sinAlt =
		Math.sin( lat ) * Math.sin( dec ) +
		Math.cos( lat ) * Math.cos( dec ) * Math.cos( hourAngle );
	const alt = Math.asin( Math.max( -1, Math.min( 1, sinAlt ) ) ) * DEG;
	// Measured from south, westward - shifted to the compass convention.
	const azSouth =
		Math.atan2(
			Math.sin( hourAngle ),
			Math.cos( hourAngle ) * Math.sin( lat ) -
				Math.tan( dec ) * Math.cos( lat )
		) * DEG;
	return { alt, az: ( ( ( azSouth + 180 ) % 360 ) + 360 ) % 360 };
}

/**
 * Julian date for a calendar date + wall-clock time at a longitude,
 * interpreting the time as mean solar time (UTC offset = lon / 15).
 * That is what a poster wants ("10 pm that evening, there") without
 * dragging a timezone database into the pack.
 *
 * @param {string} dateStr 'YYYY-MM-DD'.
 * @param {string} timeStr 'HH:MM'.
 * @param {number} lonDeg  Longitude, east positive.
 * @return {number} Julian date.
 */
export function jdForLocal( dateStr, timeStr, lonDeg ) {
	const [ y, m, d ] = String( dateStr || '' )
		.split( '-' )
		.map( ( v ) => parseInt( v, 10 ) );
	const [ hh, mm ] = String( timeStr || '22:00' )
		.split( ':' )
		.map( ( v ) => parseInt( v, 10 ) );
	const utcMs =
		Date.UTC( y || 2000, ( m || 1 ) - 1, d || 1, hh || 0, mm || 0 ) -
		( ( lonDeg || 0 ) / 15 ) * 3600000;
	return julianDate( new Date( utcMs ) );
}

/**
 * Azimuthal-equidistant projection from the zenith, "looking up":
 * north at the top, EAST ON THE LEFT (the sky is the mirror of a ground
 * map), horizon on the circle edge.
 *
 * @param {number} altDeg Altitude (degrees).
 * @param {number} azDeg  Azimuth (degrees from north, clockwise).
 * @param {number} cx     Chart center x.
 * @param {number} cy     Chart center y.
 * @param {number} radius Horizon radius in px.
 * @return {number[]} [x, y]
 */
export function projectSky( altDeg, azDeg, cx, cy, radius ) {
	const r = ( ( 90 - altDeg ) / 90 ) * radius;
	const a = azDeg * RAD;
	return [ cx - r * Math.sin( a ), cy - r * Math.cos( a ) ];
}
