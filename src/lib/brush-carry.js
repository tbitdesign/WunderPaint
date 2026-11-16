/**
 * WHAT A BRUSH CARRIES: the film of paint on the tool itself.
 *
 * A smudger brings no paint. Everything it does to paint that is there, it
 * does by carrying it: the film on the tool takes on what it is drawn
 * through and lays it down again further on. Until 10.11.2026 the paste
 * island had no such film. Its smudger lived on a side effect - every open
 * cell of the island slid along the current stroke at every step - and when
 * that drift was stopped (paint the hand does not touch stays where it was
 * laid) the smudger moved nothing at all: out of a field of paint into the
 * bare sheet it carried the paint 0 px, the drifting one before it 65 px
 * for a fast hand and 431 px for a slow one, and bleached the field white
 * where the stroke began.
 *
 * The rule here is the exchange between ONE cell of open paint and the
 * spot of the tool's film that stands above it, over a stretch of path:
 *
 * - Paint moves as PAINT. A cell and the film hold amounts (pigment by
 *   pigment, the thickness last); what changes sides is a slice of the one
 *   or the other, every part of it alike. Colour never moves without body.
 * - Two films of equal thickness SWAP: the colours run into each other,
 *   both stay as thick as they were. That is the blending.
 * - A thicker film on the tool LAYS DOWN on a thinner cell, all of the
 *   difference in the end: the trail out of a field.
 * - A thicker cell gives up to a thinner film only a share (give): a tool
 *   that comes in empty lifts a little and does not scrape the paint off.
 * - Nothing is made and nothing is lost: what the cell gains, the film
 *   loses, divided by its capacity (how much the tool holds for a film of
 *   the same thickness under it). The capacity is the smear dial - a tool
 *   that holds more carries further.
 * - The share a contact reaches follows the PATH, not the time and not the
 *   number of pointer events: a slow hand smears as far as a fast one.
 * - A tool that rests does nothing.
 *
 * The film lives in BRUSH coordinates: every spot of it is its own little
 * reservoir, and a cell meets them one after the other as the tool passes
 * over it, the front first. So nothing is dragged BACK across a border -
 * the spot that has just met the new colour is ahead of everything it
 * could spoil. And the stroke begins with the film charged with exactly
 * what it stands on: an even field stays as it is, from the first pixel.
 *
 * wet-paste-gl.js runs this rule in GLSL (the film as a small texture per
 * mirrored copy of the brush); this file is its reference, proven in jest
 * on one lane of the brush drawn along a line of paint.
 */

export const CARRY = {
	// The path, in brush diameters, over which a cell under the tool evens
	// out with the film above it (one over e of the difference left).
	lay: 0.5,
	// The share of that a thick cell gives up to a thinner film. At 0.15 a
	// tool that comes in empty leaves three quarters of the paint at the
	// very edge it enters by, and all of it a few diameters on (at 0.25:
	// three fifths) - and still fills itself within some three diameters.
	give: 0.15,
	// The most one step moves. Two sides that each take their share of the
	// other's surplus in the same step overshoot beyond this.
	most: 0.5,
	// What the tool holds, in films of the thickness under it.
	cap: 1,
};

/**
 * The share of a full exchange a contact reaches over a stretch of path.
 *
 * @param {number} tc Contact, 0 to 1 (how much of the tool touches).
 * @param {number} ds Path, in brush diameters.
 * @return {number} 0 to 1.
 */
export function share( tc, ds ) {
	return tc > 0 && ds > 0 ? 1 - Math.exp( ( -tc * ds ) / CARRY.lay ) : 0;
}

/**
 * What a cell takes from the film above it (negative: gives). Amounts, the
 * thickness last. The film loses the same, divided by its capacity.
 *
 * @param {number[]} s The cell.
 * @param {number[]} b The film above it.
 * @param {number}   f The share reached (see share).
 * @return {number[]} The cell's gain, part by part.
 */
export function exchange( s, b, f ) {
	const n = s.length - 1;
	const ts = s[ n ];
	const tb = b[ n ];
	const swap = f * Math.min( ts, tb );
	const down = tb > ts ? f * ( tb - ts ) : 0;
	const up = ts > tb ? CARRY.give * f * ( ts - tb ) : 0;
	const ofFilm = tb > 0 ? ( swap + down ) / tb : 0;
	const ofCell = ts > 0 ? ( swap + up ) / ts : 0;
	return s.map( ( v, i ) => ofFilm * b[ i ] - ofCell * v );
}

/**
 * A line of paint, a cell per document pixel: the reference's surface.
 *
 * @param {number} n     Cells.
 * @param {number} comps Parts of the paint, the thickness last.
 * @return {Object} { n, comps, get, set, total }
 */
export function createLine( n, comps ) {
	const data = new Float64Array( n * comps );
	return {
		n,
		comps,
		data,
		get( x ) {
			return Array.from( data.subarray( x * comps, ( x + 1 ) * comps ) );
		},
		set( x, p ) {
			data.set( p, x * comps );
		},
		total( c ) {
			let sum = 0;
			for ( let x = 0; x < n; x++ ) {
				sum += data[ x * comps + c ];
			}
			return sum;
		},
	};
}

// Linear between the two entries around a real index, clamped at the ends.
function lerpAt( data, comps, count, at ) {
	const u = Math.min( count - 1, Math.max( 0, at ) );
	const i = Math.min( count - 2, Math.floor( u ) );
	const f = count > 1 ? u - i : 0;
	const out = new Array( comps );
	for ( let c = 0; c < comps; c++ ) {
		const a = data[ Math.max( 0, i ) * comps + c ];
		const b = count > 1 ? data[ ( i + 1 ) * comps + c ] : a;
		out[ c ] = a + ( b - a ) * f;
	}
	return out;
}

/**
 * Draw one lane of the tool along the line. The film is `spots` reservoirs
 * along the tool (default: one per cell); a frame moves the tool by `step`
 * cells in `substeps` steps, the way the island folds one pointer event
 * into several simulation steps.
 *
 * @param {Object} line            From createLine.
 * @param {Object} o
 * @param {number} o.from          Where the tool sets down (its middle).
 * @param {number} o.to            Where it lifts.
 * @param {number} o.size          Its length along the stroke, in cells.
 * @param {number} [o.step=3]      Cells per frame.
 * @param {number} [o.substeps=6]  Simulation steps per frame.
 * @param {number} [o.cap]         Capacity (CARRY.cap).
 * @param {number} [o.spots]       Reservoirs along the tool.
 * @return {Object} { film, charged }: the film as it lifts, and as it was
 *                  charged (amounts per spot, flat).
 */
export function drag( line, o ) {
	const { from, to, size } = o;
	const step = o.step ?? 3;
	const substeps = o.substeps ?? 6;
	const cap = o.cap ?? CARRY.cap;
	const spots = o.spots ?? size;
	const { comps, data, n } = line;
	const half = size / 2;
	const film = new Float64Array( spots * comps );
	// Spot j stands over this point of the line when the tool is at pos.
	const under = ( pos, j ) => pos - half + ( ( j + 0.5 ) * size ) / spots;
	// CHARGED with what it stands on.
	for ( let j = 0; j < spots; j++ ) {
		film.set( lerpAt( data, comps, n, under( from, j ) ), j * comps );
	}
	const charged = Float64Array.from( film );
	const dir = Math.sign( to - from );
	if ( 0 === dir || cap <= 0 ) {
		return { film, charged };
	}
	let pos = from;
	let left = Math.abs( to - from );
	const dCell = new Float64Array( n * comps );
	const dFilm = new Float64Array( spots * comps );
	while ( left > 1e-9 ) {
		const len = Math.min( step, left );
		left -= len;
		for ( let k = 0; k < substeps; k++ ) {
			pos += ( dir * len ) / substeps;
			// A film that holds less than the cell under it must not be
			// asked for more than it has.
			const f = Math.min(
				CARRY.most * Math.min( 1, cap ),
				share( 1, len / substeps / size )
			);
			// Both sides from the state as it stood (the island's passes
			// read one side of a ping-pong and write the other).
			dCell.fill( 0 );
			dFilm.fill( 0 );
			const x0 = Math.max( 0, Math.ceil( pos - half ) );
			const x1 = Math.min( n - 1, Math.floor( pos + half ) );
			for ( let x = x0; x <= x1; x++ ) {
				// The cell's view of the film: between the two spots
				// around it.
				const at = ( ( x - pos + half ) * spots ) / size - 0.5;
				const b = lerpAt( film, comps, spots, at );
				const s = line.get( x );
				dCell.set( exchange( s, b, f ), x * comps );
			}
			for ( let j = 0; j < spots; j++ ) {
				// The spot's view of the line: between the two cells
				// around it.
				const at = under( pos, j );
				if ( at < 0 || at > n - 1 ) {
					continue;
				}
				const s = lerpAt( data, comps, n, at );
				const b = Array.from(
					film.subarray( j * comps, ( j + 1 ) * comps )
				);
				const d = exchange( s, b, f );
				for ( let c = 0; c < comps; c++ ) {
					dFilm[ j * comps + c ] = -d[ c ] / cap;
				}
			}
			for ( let i = x0 * comps; i < ( x1 + 1 ) * comps; i++ ) {
				data[ i ] = Math.max( 0, data[ i ] + dCell[ i ] );
			}
			for ( let i = 0; i < film.length; i++ ) {
				film[ i ] = Math.max( 0, film[ i ] + dFilm[ i ] );
			}
		}
	}
	return { film, charged };
}
