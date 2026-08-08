/**
 * The day model, pure and testable: parse and format clock times, turn a block
 * (start/end in minutes, possibly wrapping past midnight) into angular arcs on a
 * 24-hour dial, and assign overlapping blocks to concentric rings (lanes) with a
 * greedy circular colouring. No DOM, no canvas.
 */

const DAY = 1440; // minutes in a day

/** "H:MM" / "HH:MM" / "7" / "7.5" -> minutes 0..1439, or null. */
export function parseTime( str ) {
	if ( 'number' === typeof str ) {
		return clampMin( Math.round( str ) );
	}
	const s = String( undefined === str || null === str ? '' : str ).trim();
	let m = s.match( /^(\d{1,2}):(\d{2})$/ );
	if ( m ) {
		return clampMin( +m[ 1 ] * 60 + +m[ 2 ] );
	}
	m = s.match( /^(\d{1,2})(?:\.(\d))?$/ ); // 7 or 7.5 (half hours)
	if ( m ) {
		return clampMin(
			+m[ 1 ] * 60 + ( m[ 2 ] ? Math.round( +m[ 2 ] * 6 ) : 0 )
		);
	}
	return null;
}

function clampMin( v ) {
	if ( ! Number.isFinite( v ) ) {
		return 0;
	}
	return ( ( Math.round( v ) % DAY ) + DAY ) % DAY;
}

/** minutes -> "HH:MM" (24h). */
export function fmtTime( min ) {
	const v = ( ( Math.round( min ) % DAY ) + DAY ) % DAY;
	const h = Math.floor( v / 60 ),
		mm = v % 60;
	return (
		String( h ).padStart( 2, '0' ) + ':' + String( mm ).padStart( 2, '0' )
	);
}

/** minutes -> human duration like "1h30", "45m", "9h". */
export function fmtDur( mins ) {
	const m = Math.max( 0, Math.round( mins ) );
	const h = Math.floor( m / 60 ),
		mm = m % 60;
	if ( h && mm ) {
		return h + 'h' + String( mm ).padStart( 2, '0' );
	}
	if ( h ) {
		return h + 'h';
	}
	return mm + 'm';
}

/** Duration in minutes, honouring wrap past midnight (end<=start wraps). */
export function duration( start, end ) {
	const s = clampMin( start ),
		e = clampMin( end );
	if ( e === s ) {
		return DAY;
	}
	return e > s ? e - s : DAY - s + e;
}

/** Linear [start,end) segments on [0,DAY): a wrapping block yields two. */
export function toSegments( start, end ) {
	const s = clampMin( start ),
		e = clampMin( end );
	if ( e === s ) {
		return [ [ 0, DAY ] ];
	}
	if ( e > s ) {
		return [ [ s, e ] ];
	}
	return e > 0
		? [
				[ s, DAY ],
				[ 0, e ],
		  ]
		: [ [ s, DAY ] ];
}

function segsOverlap( a, b ) {
	for ( const [ a0, a1 ] of a ) {
		for ( const [ b0, b1 ] of b ) {
			if ( a0 < b1 && b0 < a1 ) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Assign each block a lane (0 = outermost ring). Overlapping blocks get
 * different lanes so they nest as concentric rings. Deterministic: blocks are
 * processed by start time, then by id.
 *
 * @param {Array} blocks [{ id, start, end }]
 * @return {{ laneOf: number[], lanes: number }} laneOf is parallel to blocks.
 */
export function assignLanes( blocks ) {
	const laneOf = new Array( blocks.length ).fill( 0 );
	const lanes = []; // lane -> array of segment-lists already placed
	const order = blocks
		.map( ( b, i ) => i )
		.sort(
			( x, y ) =>
				clampMin( blocks[ x ].start ) - clampMin( blocks[ y ].start ) ||
				String( blocks[ x ].id ).localeCompare(
					String( blocks[ y ].id )
				) ||
				x - y
		);
	for ( const i of order ) {
		const seg = toSegments( blocks[ i ].start, blocks[ i ].end );
		let placed = -1;
		for ( let L = 0; L < lanes.length; L++ ) {
			if ( ! lanes[ L ].some( ( o ) => segsOverlap( seg, o ) ) ) {
				placed = L;
				break;
			}
		}
		if ( placed < 0 ) {
			placed = lanes.length;
			lanes.push( [] );
		}
		lanes[ placed ].push( seg );
		laneOf[ i ] = placed;
	}
	return { laneOf, lanes: lanes.length };
}

/** Minutes -> canvas angle (radians). Midnight at the top, clockwise. */
export function angleFor( minutes ) {
	return -Math.PI / 2 + ( clampMin( minutes ) / DAY ) * 2 * Math.PI;
}

/** Start/end angles for a block; a full-width block sweeps the whole circle. */
export function arcAngles( start, end ) {
	const a0 = angleFor( start );
	const dur = duration( start, end );
	return { a0, a1: a0 + ( dur / DAY ) * 2 * Math.PI, dur };
}

export const DAY_MINUTES = DAY;
