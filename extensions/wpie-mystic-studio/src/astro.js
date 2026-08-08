/**
 * The astrology engine: geocentric ecliptic longitudes for Sun..Pluto
 * (JPL Keplerian elements, valid ~1800-2050), the Moon from the truncated
 * Meeus/ELP series, sidereal time, ascendant/MC, Placidus houses with a
 * Whole Sign fallback, aspects, moon phase and retrograde flags.
 *
 * Pure math, no DOM, fully unit-testable. All longitudes are tropical
 * (mean equinox of date): the planet positions come out of the JPL table
 * in the J2000 frame and get the general precession in longitude added;
 * the Meeus lunar series is of-date already. Nutation (~0.005 deg) is
 * ignored, far inside the 30-degree sign grid this studio draws.
 *
 * The Keplerian element table is copied from the Solar System Studio
 * (extensions stay self-contained); source: JPL Solar System Dynamics,
 * "Approximate Positions of the Planets".
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

export const norm360 = ( x ) => {
	let v = x % 360;
	if ( v < 0 ) {
		v += 360;
	}
	return v;
};
export const wrap180 = ( x ) => {
	let v = norm360( x );
	if ( v > 180 ) {
		v -= 360;
	}
	return v;
};

/* ------------------------------ time scales ------------------------------ */

/**
 * Julian date for a UTC calendar moment.
 *
 * @param {number} y  Year.
 * @param {number} mo Month 1-12.
 * @param {number} d  Day.
 * @param {number} hh Hour (UTC).
 * @param {number} mm Minute.
 * @return {number} Julian date.
 */
export function julianDate( y, mo, d, hh = 0, mm = 0 ) {
	const ms = Date.UTC( y, mo - 1, d, hh, mm, 0 );
	return ms / 86400000 + 2440587.5;
}

/** Julian centuries past J2000.0. */
const centuries = ( jd ) => ( jd - 2451545.0 ) / 36525;

/* ----------------------------- planet engine ----------------------------- */

// [ a(AU), e, i(deg), L(deg), longPeri(deg), longNode(deg) ] + rates per
// Julian century, plus optional long-period terms for Jupiter..Pluto.
export const ELEMENTS = {
	mercury: {
		el: [
			0.38709927, 0.20563593, 7.00497902, 252.2503235, 77.45779628,
			48.33076593,
		],
		rate: [
			0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689,
			-0.12534081,
		],
	},
	venus: {
		el: [
			0.72333566, 0.00677672, 3.39467605, 181.9790995, 131.60246718,
			76.67984255,
		],
		rate: [
			0.0000039, -0.00004107, -0.0007889, 58517.81538729, 0.00268329,
			-0.27769418,
		],
	},
	earth: {
		el: [
			1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193,
			0.0,
		],
		rate: [
			0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364,
			0.0,
		],
	},
	mars: {
		el: [
			1.52371034, 0.0933941, 1.84969142, -4.55343205, -23.94362959,
			49.55953891,
		],
		rate: [
			0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088,
			-0.29257343,
		],
	},
	jupiter: {
		el: [
			5.202887, 0.04838624, 1.30439695, 34.39644051, 14.72847983,
			100.47390909,
		],
		rate: [
			-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668,
			0.20469106,
		],
		bcsf: [ -0.00012452, 0.0606406, -0.35635438, 38.35125 ],
	},
	saturn: {
		el: [
			9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831,
			113.66242448,
		],
		rate: [
			-0.0012506, -0.00050991, 0.00193609, 1222.49362201, -0.41897216,
			-0.28867794,
		],
		bcsf: [ 0.00025899, -0.13434469, 0.87320147, 38.35125 ],
	},
	uranus: {
		el: [
			19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.9542763,
			74.01692503,
		],
		rate: [
			-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281,
			0.04240589,
		],
		bcsf: [ 0.00058331, -0.97731848, 0.17689245, 7.67025 ],
	},
	neptune: {
		el: [
			30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227,
			131.78422574,
		],
		rate: [
			0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464,
			-0.00508664,
		],
		bcsf: [ -0.00041348, 0.68346318, -0.10162547, 7.67025 ],
	},
	pluto: {
		el: [
			39.48211675, 0.2488273, 17.14001206, 238.92903833, 224.06891629,
			110.30393684,
		],
		rate: [
			-0.00031596, 0.0000517, 0.00004818, 145.20780515, -0.04062942,
			-0.01183482,
		],
		bcsf: [ -0.01262724, 0, 0, 0 ],
	},
};

/** Solve Kepler's equation E - e*sinE = M (degrees) by Newton's method. */
export function solveKepler( M, e ) {
	const m = wrap180( M );
	const eStar = RAD * e;
	let E = m + eStar * Math.sin( m * DEG );
	for ( let i = 0; i < 12; i++ ) {
		const dM = m - ( E - eStar * Math.sin( E * DEG ) );
		const dE = dM / ( 1 - e * Math.cos( E * DEG ) );
		E += dE;
		if ( Math.abs( dE ) < 1e-9 ) {
			break;
		}
	}
	return E;
}

/** Heliocentric ecliptic XYZ (AU) of a body at a Julian date. */
export function heliocentric( body, jd ) {
	const rec = ELEMENTS[ body ];
	if ( ! rec ) {
		return { x: 0, y: 0, z: 0 };
	}
	const T = centuries( jd );
	const a = rec.el[ 0 ] + rec.rate[ 0 ] * T;
	const e = rec.el[ 1 ] + rec.rate[ 1 ] * T;
	const i = rec.el[ 2 ] + rec.rate[ 2 ] * T;
	const L = rec.el[ 3 ] + rec.rate[ 3 ] * T;
	const wbar = rec.el[ 4 ] + rec.rate[ 4 ] * T;
	const node = rec.el[ 5 ] + rec.rate[ 5 ] * T;

	let M = L - wbar;
	if ( rec.bcsf ) {
		const [ b, c, s, f ] = rec.bcsf;
		M +=
			b * T * T +
			c * Math.cos( f * T * DEG ) +
			s * Math.sin( f * T * DEG );
	}
	const E = solveKepler( M, e );
	const xOrb = a * ( Math.cos( E * DEG ) - e );
	const yOrb = a * Math.sqrt( 1 - e * e ) * Math.sin( E * DEG );

	const w = ( wbar - node ) * DEG;
	const om = node * DEG;
	const inc = i * DEG;
	const cw = Math.cos( w );
	const sw = Math.sin( w );
	const co = Math.cos( om );
	const so = Math.sin( om );
	const ci = Math.cos( inc );
	const si = Math.sin( inc );

	return {
		x:
			( cw * co - sw * so * ci ) * xOrb +
			( -sw * co - cw * so * ci ) * yOrb,
		y:
			( cw * so + sw * co * ci ) * xOrb +
			( -sw * so + cw * co * ci ) * yOrb,
		z: sw * si * xOrb + cw * si * yOrb,
	};
}

/** The eleven chart bodies, in traditional order. */
export const BODIES = [
	'sun',
	'moon',
	'mercury',
	'venus',
	'mars',
	'jupiter',
	'saturn',
	'uranus',
	'neptune',
	'pluto',
];

/**
 * Geocentric ecliptic longitude of a body, degrees 0..360.
 *
 * @param {string} body One of BODIES.
 * @param {number} jd   Julian date.
 * @return {number} Longitude in degrees.
 */
export function geoLongitude( body, jd ) {
	if ( 'moon' === body ) {
		return moonLongitude( jd );
	}
	// General precession in longitude: J2000 frame -> mean equinox of date.
	const T = centuries( jd );
	const prec = 1.396971 * T + 0.0003086 * T * T;
	const earth = heliocentric( 'earth', jd );
	if ( 'sun' === body ) {
		return norm360( Math.atan2( -earth.y, -earth.x ) * RAD + prec );
	}
	const p = heliocentric( body, jd );
	return norm360( Math.atan2( p.y - earth.y, p.x - earth.x ) * RAD + prec );
}

/* ------------------------------ lunar theory ----------------------------- */

// Truncated Meeus (Astronomical Algorithms, ch. 47) longitude series:
// [ coeff (1e-6 deg), D, M, M', F ]. Terms with M carry the E factor.
const MOON_TERMS = [
	[ 6288774, 0, 0, 1, 0 ],
	[ 1274027, 2, 0, -1, 0 ],
	[ 658314, 2, 0, 0, 0 ],
	[ 213618, 0, 0, 2, 0 ],
	[ -185116, 0, 1, 0, 0 ],
	[ -114332, 0, 0, 0, 2 ],
	[ 58793, 2, 0, -2, 0 ],
	[ 57066, 2, -1, -1, 0 ],
	[ 53322, 2, 0, 1, 0 ],
	[ 45758, 2, -1, 0, 0 ],
	[ -40923, 0, 1, -1, 0 ],
	[ -34720, 1, 0, 0, 0 ],
	[ -30383, 0, 1, 1, 0 ],
	[ 15327, 2, 0, 0, -2 ],
	[ -12528, 0, 0, 1, 2 ],
	[ 10980, 0, 0, 1, -2 ],
	[ 10675, 4, 0, -1, 0 ],
	[ 10034, 0, 0, 3, 0 ],
	[ 8548, 4, 0, -2, 0 ],
	[ -7888, 2, 1, -1, 0 ],
	[ -6766, 2, 1, 0, 0 ],
	[ -5163, 1, 0, -1, 0 ],
	[ 4987, 1, 1, 0, 0 ],
	[ 4036, 2, -1, 1, 0 ],
	[ 3994, 2, 0, 2, 0 ],
	[ 3861, 4, 0, 0, 0 ],
	[ 3665, 2, 0, -3, 0 ],
	[ -2689, 0, 1, -2, 0 ],
	[ -2602, 2, 0, -1, 2 ],
	[ 2390, 2, -1, -2, 0 ],
	[ -2348, 1, 0, 1, 0 ],
	[ 2236, 2, -2, 0, 0 ],
	[ -2120, 0, 1, 2, 0 ],
	[ -2069, 0, 2, 0, 0 ],
	[ 2048, 2, -2, -1, 0 ],
	[ -1773, 2, 0, 1, -2 ],
	[ -1595, 2, 0, 0, 2 ],
	[ 1215, 4, -1, -1, 0 ],
	[ -1110, 0, 0, 2, 2 ],
	[ -892, 3, 0, -1, 0 ],
	[ -810, 2, 1, 1, 0 ],
	[ 759, 4, -1, -2, 0 ],
	[ -713, 0, 2, -1, 0 ],
	[ -700, 2, 2, -1, 0 ],
	[ 691, 2, 1, -2, 0 ],
	[ 596, 2, -1, 0, -2 ],
	[ 549, 4, 0, 1, 0 ],
	[ 537, 0, 0, 4, 0 ],
	[ 520, 4, -1, 0, 0 ],
	[ -487, 1, 0, -2, 0 ],
];

/** Geocentric ecliptic longitude of the Moon, degrees 0..360. */
export function moonLongitude( jd ) {
	const T = centuries( jd );
	const Lp =
		218.3164477 +
		481267.88123421 * T -
		0.0015786 * T * T +
		( T * T * T ) / 538841 -
		( T * T * T * T ) / 65194000;
	const D =
		297.8501921 +
		445267.1114034 * T -
		0.0018819 * T * T +
		( T * T * T ) / 545868 -
		( T * T * T * T ) / 113065000;
	const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
	const Mp =
		134.9633964 +
		477198.8675055 * T +
		0.0087414 * T * T +
		( T * T * T ) / 69699 -
		( T * T * T * T ) / 14712000;
	const F =
		93.272095 +
		483202.0175233 * T -
		0.0036539 * T * T -
		( T * T * T ) / 3526000;
	const E = 1 - 0.002516 * T - 0.0000074 * T * T;

	let sum = 0;
	for ( const [ c, d, m, mp, f ] of MOON_TERMS ) {
		let coeff = c;
		if ( 1 === Math.abs( m ) ) {
			coeff *= E;
		} else if ( 2 === Math.abs( m ) ) {
			coeff *= E * E;
		}
		sum += coeff * Math.sin( ( d * D + m * M + mp * Mp + f * F ) * DEG );
	}
	// Venus / Jupiter / flattening additives.
	const A1 = 119.75 + 131.849 * T;
	const A2 = 53.09 + 479264.29 * T;
	sum +=
		3958 * Math.sin( A1 * DEG ) +
		1962 * Math.sin( ( Lp - F ) * DEG ) +
		318 * Math.sin( A2 * DEG );

	return norm360( Lp + sum / 1e6 );
}

/* ----------------------------- angles + houses --------------------------- */

/** Mean obliquity of the ecliptic, degrees. */
export function obliquity( jd ) {
	const T = centuries( jd );
	return 23.43929111 - 0.0130042 * T - 0.00000016 * T * T;
}

/** Greenwich mean sidereal time, degrees 0..360. */
export function gmst( jd ) {
	const T = centuries( jd );
	return norm360(
		280.46061837 +
			360.98564736629 * ( jd - 2451545.0 ) +
			0.000387933 * T * T -
			( T * T * T ) / 38710000
	);
}

/** Right ascension (deg) of a point on the ecliptic at longitude lambda. */
export function raOfEcliptic( lambda, eps ) {
	return norm360(
		Math.atan2(
			Math.sin( lambda * DEG ) * Math.cos( eps * DEG ),
			Math.cos( lambda * DEG )
		) * RAD
	);
}

/** Declination (deg) of a point on the ecliptic at longitude lambda. */
export function decOfEcliptic( lambda, eps ) {
	return Math.asin( Math.sin( lambda * DEG ) * Math.sin( eps * DEG ) ) * RAD;
}

/** Ecliptic longitude (deg) of the ecliptic point with right ascension ra. */
export function eclipticOfRa( ra, eps ) {
	return norm360(
		Math.atan2(
			Math.sin( ra * DEG ) / Math.cos( eps * DEG ),
			Math.cos( ra * DEG )
		) * RAD
	);
}

/**
 * Ascendant, MC and local sidereal time for a moment and place.
 *
 * @param {number} jd  Julian date (UTC).
 * @param {number} lat Latitude, degrees north positive.
 * @param {number} lon Longitude, degrees east positive.
 * @return {{asc: number, mc: number, lst: number, eps: number}}
 */
export function ascMc( jd, lat, lon ) {
	const eps = obliquity( jd );
	const lst = norm360( gmst( jd ) + lon ); // = RAMC in degrees
	const mc = eclipticOfRa( lst, eps );

	const ramc = lst * DEG;
	const e = eps * DEG;
	const phi = lat * DEG;
	const asc = norm360(
		Math.atan2(
			Math.cos( ramc ),
			-(
				Math.sin( ramc ) * Math.cos( e ) +
				Math.tan( phi ) * Math.sin( e )
			)
		) * RAD
	);
	return { asc, mc, lst, eps };
}

/** Latitude limit beyond which Placidus degenerates. */
export const PLACIDUS_MAX_LAT = 66;

/**
 * House cusps. Placidus by default, Whole Sign above PLACIDUS_MAX_LAT or
 * when the iteration fails (circumpolar ecliptic degrees).
 *
 * @param {number} jd  Julian date (UTC).
 * @param {number} lat Latitude.
 * @param {number} lon Longitude.
 * @return {{cusps: number[], system: string, asc: number, mc: number}}
 *   cusps[0] = house 1 cusp, ... cusps[11] = house 12 cusp.
 */
export function houses( jd, lat, lon ) {
	const { asc, mc, lst, eps } = ascMc( jd, lat, lon );

	const wholeSign = () => {
		const start = Math.floor( asc / 30 ) * 30;
		return {
			cusps: Array.from( { length: 12 }, ( _, i ) =>
				norm360( start + 30 * i )
			),
			system: 'whole',
			asc,
			mc,
		};
	};

	if ( Math.abs( lat ) > PLACIDUS_MAX_LAT ) {
		return wholeSign();
	}

	const phi = lat * DEG;
	// Placidus intermediate cusp: the ecliptic degree whose hour angle is
	// the given fraction of its own semi-arc. Fixed-point iteration on RA.
	const cuspAt = ( fraction, nocturnal ) => {
		// Start from the equal-semi-arc guess (semi = 90).
		let ra = norm360( lst + ( nocturnal ? 180 : 0 ) + fraction * 90 );
		for ( let i = 0; i < 24; i++ ) {
			const lambda = eclipticOfRa( ra, eps );
			const dec = decOfEcliptic( lambda, eps );
			const tt = Math.tan( phi ) * Math.tan( dec * DEG );
			if ( tt < -1 || tt > 1 ) {
				return null; // circumpolar - Placidus undefined here
			}
			const ad = Math.asin( tt ) * RAD;
			const semi = nocturnal ? 90 - ad : 90 + ad;
			const target = norm360(
				lst + ( nocturnal ? 180 : 0 ) + fraction * semi
			);
			if ( Math.abs( wrap180( target - ra ) ) < 1e-7 ) {
				ra = target;
				break;
			}
			ra = target;
		}
		return eclipticOfRa( ra, eps );
	};

	// Houses 11, 12 lie EAST of the MC (hour angle negative, RA past the
	// meridian) at 1/3 and 2/3 of the diurnal semi-arc; houses 2, 3 sit
	// below the horizon, east of the IC, at 2/3 and 1/3 of the nocturnal
	// semi-arc back from the lower meridian.
	const c11 = cuspAt( 1 / 3, false );
	const c12 = cuspAt( 2 / 3, false );
	const c2 = cuspAt( -2 / 3, true );
	const c3 = cuspAt( -1 / 3, true );
	if ( null === c11 || null === c12 || null === c2 || null === c3 ) {
		return wholeSign();
	}

	const cusps = new Array( 12 );
	cusps[ 0 ] = asc;
	cusps[ 1 ] = c2;
	cusps[ 2 ] = c3;
	cusps[ 3 ] = norm360( mc + 180 );
	cusps[ 4 ] = norm360( c11 + 180 );
	cusps[ 5 ] = norm360( c12 + 180 );
	cusps[ 6 ] = norm360( asc + 180 );
	cusps[ 7 ] = norm360( c2 + 180 );
	cusps[ 8 ] = norm360( c3 + 180 );
	cusps[ 9 ] = mc;
	cusps[ 10 ] = c11;
	cusps[ 11 ] = c12;
	return { cusps, system: 'placidus', asc, mc };
}

/** House index (1..12) a longitude falls into, given cusps[]. */
export function houseOf( lonDeg, cusps ) {
	for ( let i = 0; i < 12; i++ ) {
		const a = cusps[ i ];
		const b = cusps[ ( i + 1 ) % 12 ];
		const span = norm360( b - a );
		if ( norm360( lonDeg - a ) < span ) {
			return i + 1;
		}
	}
	return 12;
}

/* ------------------------------ aspects etc ------------------------------ */

export const ASPECTS = [
	{ key: 'conjunction', angle: 0, orb: 8, kind: 'neutral' },
	{ key: 'sextile', angle: 60, orb: 4, kind: 'soft' },
	{ key: 'square', angle: 90, orb: 6, kind: 'hard' },
	{ key: 'trine', angle: 120, orb: 6, kind: 'soft' },
	{ key: 'opposition', angle: 180, orb: 8, kind: 'hard' },
];

/**
 * All aspects between the given positions.
 *
 * @param {Array<{body: string, lon: number}>} positions Chart positions.
 * @param {number} orbScale 1 = default orbs, 0.5 = strict.
 * @return {Array<{a, b, key, kind, exact: number}>}
 */
export function aspectsBetween( positions, orbScale = 1 ) {
	const found = [];
	for ( let i = 0; i < positions.length; i++ ) {
		for ( let j = i + 1; j < positions.length; j++ ) {
			const sep = Math.abs(
				wrap180( positions[ i ].lon - positions[ j ].lon )
			);
			for ( const asp of ASPECTS ) {
				const off = Math.abs( sep - asp.angle );
				if ( off <= asp.orb * orbScale ) {
					found.push( {
						a: positions[ i ].body,
						b: positions[ j ].body,
						key: asp.key,
						kind: asp.kind,
						exact: off,
					} );
					break;
				}
			}
		}
	}
	return found;
}

/**
 * Aspects BETWEEN two charts (synastry): every A-body against every
 * B-body, same aspect set and orbs as aspectsBetween.
 *
 * @param {Array<{body, lon}>} posA Chart A positions.
 * @param {Array<{body, lon}>} posB Chart B positions.
 * @param {number} orbScale 1 = default orbs, 0.5 = strict.
 * @return {Array<{a, b, key, kind, exact, lonA, lonB}>}
 */
export function crossAspects( posA, posB, orbScale = 1 ) {
	const found = [];
	for ( const pa of posA ) {
		for ( const pb of posB ) {
			const sep = Math.abs( wrap180( pa.lon - pb.lon ) );
			for ( const asp of ASPECTS ) {
				const off = Math.abs( sep - asp.angle );
				if ( off <= asp.orb * orbScale ) {
					found.push( {
						a: pa.body,
						b: pb.body,
						key: asp.key,
						kind: asp.kind,
						exact: off,
						lonA: pa.lon,
						lonB: pb.lon,
					} );
					break;
				}
			}
		}
	}
	return found;
}

/** True if the body's geocentric longitude is decreasing at jd. */
export function isRetrograde( body, jd ) {
	if ( 'sun' === body || 'moon' === body ) {
		return false;
	}
	const before = geoLongitude( body, jd - 0.5 );
	const after = geoLongitude( body, jd + 0.5 );
	return wrap180( after - before ) < 0;
}

/**
 * Moon phase for a Julian date.
 *
 * @param {number} jd Julian date.
 * @return {{angle: number, illum: number, age: number, index: number,
 *   waxing: boolean}} angle = elongation Moon-Sun 0..360 (0 = new),
 *   illum = lit fraction 0..1, age in days, index 0..7 for the eight
 *   classic phase names (0 new, 4 full), waxing flag.
 */
export function moonPhase( jd ) {
	const angle = norm360( moonLongitude( jd ) - geoLongitude( 'sun', jd ) );
	const illum = ( 1 - Math.cos( angle * DEG ) ) / 2;
	const age = ( angle / 360 ) * 29.530588853;
	const index = Math.round( angle / 45 ) % 8;
	return { angle, illum, age, index, waxing: angle < 180 };
}

/* ------------------------------ chart facade ----------------------------- */

export const SIGN_COUNT = 12;

/** Sign index 0..11 (0 = Aries) and degree within the sign. */
export function signOf( lonDeg ) {
	const lon = norm360( lonDeg );
	return {
		index: Math.floor( lon / 30 ) % 12,
		degree: lon % 30,
	};
}

/** Format a longitude as "15°08′ <sign index>" parts. */
export function formatDegree( lonDeg ) {
	const { index, degree } = signOf( lonDeg );
	const whole = Math.floor( degree );
	const minutes = Math.floor( ( degree - whole ) * 60 );
	return {
		sign: index,
		deg: whole,
		min: minutes,
		text:
			String( whole ) + '°' + String( minutes ).padStart( 2, '0' ) + '′',
	};
}

/**
 * The full chart: positions, angles, houses, aspects, phase.
 *
 * @param {Object} opts { jd, lat, lon, withHouses }
 * @return {Object} Chart data for the renderers.
 */
export function computeChart( opts ) {
	const { jd, lat = 0, lon = 0, withHouses = true } = opts || {};
	const positions = BODIES.map( ( body ) => ( {
		body,
		lon: geoLongitude( body, jd ),
		retro: isRetrograde( body, jd ),
	} ) );
	const chart = {
		jd,
		positions,
		aspects: aspectsBetween( positions ),
		phase: moonPhase( jd ),
	};
	if ( withHouses && Number.isFinite( lat ) && Number.isFinite( lon ) ) {
		const h = houses( jd, lat, lon );
		chart.houses = h;
		chart.positions = positions.map( ( p ) => ( {
			...p,
			house: houseOf( p.lon, h.cusps ),
		} ) );
	}
	return chart;
}
