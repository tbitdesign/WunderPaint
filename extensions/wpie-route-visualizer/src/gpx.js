/**
 * GPX parsing and simplification. Regex-based on purpose: GPX track
 * points are rigidly regular XML, and skipping DOMParser keeps the
 * whole module unit-testable in plain node. Handles <trkpt> (with
 * segments) and <rtept> routes, self-closing points, either attribute
 * order, and optional <ele>/<time> children.
 */

/** Points above this count are simplified before storing (RDP). */
export const MAX_STORED_POINTS = 1500;

/**
 * Hard ceilings for untrusted files (F-L58, 2026-07-25 audit). A GPX file
 * arrives from the file picker, where `accept` is a dialog filter and
 * nothing else, and it used to be read and parsed synchronously on the
 * main thread with no bound at all.
 */
export const MAX_GPX_BYTES = 12 * 1024 * 1024;

/** Raw track points read from one document; a long ride has ~30k. */
export const MAX_PARSED_POINTS = 200000;

// Opening tag only. The old expression also matched the element body in
// the same pass, which combined an alternative with two lazy quantifiers:
// every unclosed <trkpt made the engine scan to the end of the document,
// so runtime grew with the square of the file size (measured: 359 KB took
// 1.3 s, a 5 MB file froze the tab for minutes). The body is now found
// with a single forward indexOf, which keeps the whole parse linear.
// (F-L58, 2026-07-25 audit)
const POINT_OPEN_RE = /<(trkpt|rtept)\b([^>]*)>/g;

const attr = ( s, name ) => {
	const m = s.match( new RegExp( name + '\\s*=\\s*["\']([^"\']+)["\']' ) );
	return m ? parseFloat( m[ 1 ] ) : null;
};

const child = ( s, name ) => {
	if ( ! s ) {
		return null;
	}
	const m = s.match(
		new RegExp( '<' + name + '[^>]*>([\\s\\S]*?)</' + name + '>' )
	);
	return m ? m[ 1 ].trim() : null;
};

function pointsIn( block ) {
	const pts = [];
	POINT_OPEN_RE.lastIndex = 0;
	// Once a closing tag search comes up empty there is none left further
	// in, so stop searching - otherwise a document of nothing but unclosed
	// tags scans the remainder once per point and we are quadratic again.
	const noClose = { trkpt: false, rtept: false };
	let m;
	while ( ( m = POINT_OPEN_RE.exec( block ) ) ) {
		let attrs = m[ 2 ];
		let body = '';
		if ( attrs.endsWith( '/' ) ) {
			attrs = attrs.slice( 0, -1 );
		} else if ( ! noClose[ m[ 1 ] ] ) {
			const close = block.indexOf( '</' + m[ 1 ], POINT_OPEN_RE.lastIndex );
			if ( -1 === close ) {
				noClose[ m[ 1 ] ] = true;
			} else {
				body = block.slice( POINT_OPEN_RE.lastIndex, close );
				// Resume AT the closing tag: '</' never starts a new
				// opening match, and the index only ever moves forward.
				POINT_OPEN_RE.lastIndex = close;
			}
		}
		const lat = attr( attrs, 'lat' );
		const lon = attr( attrs, 'lon' );
		if ( null === lat || null === lon ) {
			continue;
		}
		const ele = child( body, 'ele' );
		const time = child( body, 'time' );
		// Garmin TrackPointExtension: heart rate lives in
		// <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>.
		const hr = child( body, '(?:\\w+:)?hr' );
		const pt = {
			lat,
			lon,
			ele: null === ele ? null : parseFloat( ele ),
			time: time ? Date.parse( time ) || null : null,
		};
		if ( null !== hr && ! Number.isNaN( parseFloat( hr ) ) ) {
			pt.hr = parseFloat( hr );
		}
		pts.push( pt );
		if ( pts.length >= MAX_PARSED_POINTS ) {
			break;
		}
	}
	return pts;
}

/**
 * Parse a GPX document.
 *
 * @param {string} text GPX file contents.
 * @return {Object} { name, segments: [ [ {lat,lon,ele,time} ] ] }
 */
export function parseGpx( text ) {
	const src = String( text || '' );
	// Track name: the first <name> inside <trk>, else the metadata name.
	const trk = src.match( /<trk\b[^>]*>([\s\S]*?)<\/trk>/ );
	const name =
		child( trk ? trk[ 1 ] : '', 'name' ) ||
		child( src, 'name' ) ||
		'';
	const segments = [];
	// Opening tag plus forward indexOf, for the same reason as the points
	// above: a lazy quantifier against a literal closing tag turns
	// quadratic as soon as segments are left unclosed. (F-L58)
	const segRe = /<trkseg\b[^>]*>/g;
	let segNoClose = false;
	let m;
	while ( ( m = segRe.exec( src ) ) ) {
		let block = '';
		if ( ! segNoClose ) {
			const close = src.indexOf( '</trkseg', segRe.lastIndex );
			if ( -1 === close ) {
				segNoClose = true;
			} else {
				block = src.slice( segRe.lastIndex, close );
				segRe.lastIndex = close;
			}
		}
		const pts = pointsIn( block );
		if ( pts.length > 1 ) {
			segments.push( pts );
		}
	}
	if ( ! segments.length ) {
		// Routes (<rtept>) or segment-less tracks.
		const pts = pointsIn( src );
		if ( pts.length > 1 ) {
			segments.push( pts );
		}
	}
	return { name: name.replace( /<[^>]+>/g, '' ).trim(), segments };
}

/* ------------------------------ simplification ---------------------------- */

/**
 * Ramer-Douglas-Peucker on lat/lon (lon scaled by cos of the mid
 * latitude, so tolerance behaves isotropically). Iterative stack, no
 * recursion limits on long tracks.
 *
 * @param {Array}  pts     Points [{lat,lon,...}].
 * @param {number} epsilon Tolerance in degrees latitude.
 * @return {Array} Simplified points (originals, not copies).
 */
export function rdpSimplify( pts, epsilon ) {
	if ( pts.length < 3 ) {
		return pts.slice();
	}
	const kx = Math.cos(
		( ( pts[ 0 ].lat + pts[ pts.length - 1 ].lat ) / 2 ) *
			( Math.PI / 180 )
	);
	const X = ( p ) => p.lon * kx;
	const Y = ( p ) => p.lat;
	const keep = new Uint8Array( pts.length );
	keep[ 0 ] = keep[ pts.length - 1 ] = 1;
	const stack = [ [ 0, pts.length - 1 ] ];
	while ( stack.length ) {
		const [ a, b ] = stack.pop();
		const ax = X( pts[ a ] );
		const ay = Y( pts[ a ] );
		const dx = X( pts[ b ] ) - ax;
		const dy = Y( pts[ b ] ) - ay;
		const len2 = dx * dx + dy * dy || 1e-18;
		let worst = -1;
		let worstD = 0;
		for ( let i = a + 1; i < b; i++ ) {
			const px = X( pts[ i ] ) - ax;
			const py = Y( pts[ i ] ) - ay;
			const cross = Math.abs( px * dy - py * dx );
			const d = cross / Math.sqrt( len2 );
			if ( d > worstD ) {
				worstD = d;
				worst = i;
			}
		}
		if ( worst >= 0 && worstD > epsilon ) {
			keep[ worst ] = 1;
			stack.push( [ a, worst ], [ worst, b ] );
		}
	}
	return pts.filter( ( _, i ) => keep[ i ] );
}

/**
 * Simplify a whole track to at most `max` points across all segments
 * (binary search over the RDP tolerance).
 *
 * @param {Array}  segments Segments of points.
 * @param {number} max      Point budget.
 * @return {Array} Simplified segments.
 */
export function simplifyTrack( segments, max = MAX_STORED_POINTS ) {
	const total = segments.reduce( ( n, s ) => n + s.length, 0 );
	if ( total <= max ) {
		return segments;
	}
	let lo = 1e-6;
	let hi = 0.05;
	let best = segments;
	for ( let i = 0; i < 18; i++ ) {
		const eps = ( lo + hi ) / 2;
		const out = segments.map( ( s ) => rdpSimplify( s, eps ) );
		const n = out.reduce( ( acc, s ) => acc + s.length, 0 );
		if ( n > max ) {
			lo = eps;
		} else {
			best = out;
			hi = eps;
		}
	}
	return best;
}
