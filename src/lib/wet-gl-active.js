/**
 * Where the wet islands still have work: the ACTIVE RECT bookkeeping that
 * lets the simulation and the ink render skip everything already settled.
 *
 * A wash covers a sliver of its region (768 px around the first touch
 * plus 256 px of slack on every side), yet every step ran every pass over
 * all of it, and every frame rendered and copied the whole canvas. On
 * integrated graphics (Thomas' notebook, Intel UHD) the frames grew
 * longer than their own pacing and the tab froze while a wash dried. Now
 * each island keeps a rect that provably holds every cell the next step
 * can change, scissors its passes to it, and renders only what moved.
 *
 * THE CONTRACT an island keeps for this to stay exact, bit for bit:
 * - A cell is QUIET when a step cannot change it: outside the island's
 *   activity set (liquid: marked wet or damp paper, paste: open paint)
 *   and further than the island's REACH from any active cell (liquid:
 *   one cell per step - flow, flooding and fibre creep all look one
 *   neighbour out; paste: none, closed paint never moves). Every pass
 *   is a bit-exact identity on a quiet cell.
 * - Both ping-pong sides hold the same value in every cell outside the
 *   rect. A cell may only leave the rect once a whole step ran over it
 *   as an identity, so a probe is applied one step after the state it
 *   saw, never in the same step.
 * - Whatever writes outside the steps (grow, seed, dry-all) writes BOTH
 *   sides, or widens the rect to the whole region.
 *
 * The rect only ever shrinks from a PROBE: a column and a row reduction
 * of the activity mask over the current rect, read back through a
 * pixel-pack buffer and a fence that is polled once per frame. The old
 * "still wet?" check read back synchronously every ten frames and
 * stalled the pipeline each time.
 *
 * The REGION itself grows with hysteresis (growTo): rarely and by a lot,
 * never a few cells per pointer move.
 */

/** Cell rects are inclusive: { x0, y0, x1, y1 }; null is the empty rect. */
export function rectUnion( a, b ) {
	if ( ! a ) {
		return b ? { ...b } : null;
	}
	if ( ! b ) {
		return { ...a };
	}
	return {
		x0: Math.min( a.x0, b.x0 ),
		y0: Math.min( a.y0, b.y0 ),
		x1: Math.max( a.x1, b.x1 ),
		y1: Math.max( a.y1, b.y1 ),
	};
}

export function rectMeet( a, b ) {
	if ( ! a || ! b ) {
		return null;
	}
	const r = {
		x0: Math.max( a.x0, b.x0 ),
		y0: Math.max( a.y0, b.y0 ),
		x1: Math.min( a.x1, b.x1 ),
		y1: Math.min( a.y1, b.y1 ),
	};
	return r.x0 <= r.x1 && r.y0 <= r.y1 ? r : null;
}

/**
 * Grow a rect by `d` cells on every side, clipped to a w x h grid.
 *
 * @param {Object|null} r Cell rect.
 * @param {number}      d Cells to add on every side.
 * @param {number}      w Grid width.
 * @param {number}      h Grid height.
 * @return {Object|null} The grown rect.
 */
export function rectGrow( r, d, w, h ) {
	if ( ! r ) {
		return null;
	}
	return rectMeet(
		{ x0: r.x0 - d, y0: r.y0 - d, x1: r.x1 + d, y1: r.y1 + d },
		{ x0: 0, y0: 0, x1: w - 1, y1: h - 1 }
	);
}

export function rectShift( r, dx, dy ) {
	return r
		? { x0: r.x0 + dx, y0: r.y0 + dy, x1: r.x1 + dx, y1: r.y1 + dy }
		: null;
}

// Cells a stamp must keep from the region's edge: room for the wash to
// run and bleed. The first islands lived with 48.
export const REGION_SLACK = 64;

/**
 * THE REGION GROW, with hysteresis. Every grow re-creates and copies all
 * of an island's fields, clears its canvas, re-feeds the ground and
 * renders everything once more. The islands used to demand their full
 * margin around EVERY stamp and grew by exactly what was missing - so a
 * stroke that left the box around its first touch grew the region by a
 * few cells on nearly every pointer move (211 grows for one 1200 px line,
 * gigabytes of texture copies: the crawl on Thomas' notebook, 24.09.).
 * Now a stamp only needs REGION_SLACK cells, and a grow reserves twice
 * the margin on each side it moves - a long stroke grows two or three
 * times. Under the caps it settles for less before it gives up.
 *
 * @param {Object} S        The island's region { rx, ry, rw, rh } in cells.
 * @param {Object} rect     What must fit { x, y, w, h }, document px.
 * @param {number} sc       Document px per cell.
 * @param {number} margin   The island's margin in cells.
 * @param {number} maxTex   Largest texture side.
 * @param {number} maxCells Largest region area.
 * @return {Object|null|false} null = it fits; false = no region under
 *                             the caps holds it; else the new region.
 */
export function growTo( S, rect, sc, margin, maxTex, maxCells ) {
	const cx0 = Math.floor( rect.x / sc );
	const cy0 = Math.floor( rect.y / sc );
	const cx1 = Math.ceil( ( rect.x + rect.w ) / sc );
	const cy1 = Math.ceil( ( rect.y + rect.h ) / sc );
	const slack = Math.min( REGION_SLACK, margin );
	const left = cx0 - slack < S.rx;
	const top = cy0 - slack < S.ry;
	const right = cx1 + slack > S.rx + S.rw;
	const bottom = cy1 + slack > S.ry + S.rh;
	if ( ! left && ! top && ! right && ! bottom ) {
		return null;
	}
	for ( const room of [ 2 * margin, margin, slack ] ) {
		const x0 = left ? cx0 - room : S.rx;
		const y0 = top ? cy0 - room : S.ry;
		const x1 = right ? cx1 + room : S.rx + S.rw;
		const y1 = bottom ? cy1 + room : S.ry + S.rh;
		const rw = x1 - x0;
		const rh = y1 - y0;
		if ( rw <= maxTex && rh <= maxTex && rw * rh <= maxCells ) {
			return { rx: x0, ry: y0, rw, rh };
		}
	}
	return false;
}

/**
 * Canvas pixel rects ({ x, y, w, h }, y-down): what a render redrew, for
 * the presentation copy. Null is the empty rect.
 *
 * @param {Object|null} a Pixel rect.
 * @param {Object|null} b Pixel rect.
 * @return {Object|null} The bounding rect of both.
 */
export function pxUnion( a, b ) {
	if ( ! a ) {
		return b ? { ...b } : null;
	}
	if ( ! b ) {
		return { ...a };
	}
	const x = Math.min( a.x, b.x );
	const y = Math.min( a.y, b.y );
	return {
		x,
		y,
		w: Math.max( a.x + a.w, b.x + b.w ) - x,
		h: Math.max( a.y + a.h, b.y + b.h ) - y,
	};
}

/* ------------------------------ active tiles ----------------------------- */

/*
 * ACTIVE TILES (16.10.2026). One rect around everything that can change
 * made the cost of a step the area of the BOX around all wet paint: two
 * strokes in opposite corners of a page, both still drying, and every
 * step ran over nearly the whole page - the work grew with the distance
 * between strokes, not with the paint (the next stage the 23.09. notes
 * already named). The islands now keep a MASK of TILE x TILE cells
 * instead: a step runs over the tiles that can change - grown by the reach
 * in CELLS, not by whole tiles - and the render redraws what the steps
 * touched, each as a few rectangles drawn in one call. The contract above
 * holds per cell, the masks are only ever coarser than the cells they
 * stand for: a tile is in when any cell in it is. Sixteen cells: coarser
 * tiles ran a compact stroke over noticeably more cells than its box.
 */
export const TILE = 16;

/**
 * An empty tile mask over a region of rw x rh cells.
 *
 * @param {number} rw Region width, cells.
 * @param {number} rh Region height, cells.
 * @return {Object} { tx, ty, m }.
 */
export function tileMask( rw, rh ) {
	const tx = Math.max( 1, Math.ceil( rw / TILE ) );
	const ty = Math.max( 1, Math.ceil( rh / TILE ) );
	return { tx, ty, m: new Uint8Array( tx * ty ) };
}

/**
 * Mark every tile a cell rect touches (in place).
 *
 * @param {Object}      mask A tile mask.
 * @param {Object|null} r    Cell rect, inclusive.
 * @return {Object} The mask.
 */
export function tileMark( mask, r ) {
	if ( ! r ) {
		return mask;
	}
	const x0 = Math.max( 0, Math.floor( r.x0 / TILE ) );
	const y0 = Math.max( 0, Math.floor( r.y0 / TILE ) );
	const x1 = Math.min( mask.tx - 1, Math.floor( r.x1 / TILE ) );
	const y1 = Math.min( mask.ty - 1, Math.floor( r.y1 / TILE ) );
	for ( let y = y0; y <= y1; y++ ) {
		mask.m.fill( 1, y * mask.tx + x0, y * mask.tx + x1 + 1 );
	}
	return mask;
}

/** Whether a mask (or null) holds any tile. */
export function tileAny( mask ) {
	return !! mask && mask.m.indexOf( 1 ) >= 0;
}

/**
 * Both masks in one (a new mask; null counts as empty).
 *
 * @param {Object|null} a Tile mask.
 * @param {Object|null} b Tile mask of the same grid.
 * @return {Object|null} The union, null when both are null.
 */
export function tileUnion( a, b ) {
	if ( ! a || ! b ) {
		const one = a || b;
		return one ? { ...one, m: one.m.slice() } : null;
	}
	const out = { ...a, m: a.m.slice() };
	for ( let i = 0; i < out.m.length; i++ ) {
		out.m[ i ] |= b.m[ i ];
	}
	return out;
}

/**
 * Every tile within `r` tiles of a marked one (a new mask).
 *
 * @param {Object|null} mask Tile mask.
 * @param {number}      r    Tiles to add on every side.
 * @return {Object|null} The grown mask.
 */
export function tileGrow( mask, r ) {
	if ( ! mask || r <= 0 ) {
		return mask ? { ...mask, m: mask.m.slice() } : null;
	}
	const { tx, ty, m } = mask;
	const row = new Uint8Array( tx * ty );
	for ( let y = 0; y < ty; y++ ) {
		for ( let x = 0; x < tx; x++ ) {
			if ( m[ y * tx + x ] ) {
				row.fill(
					1,
					y * tx + Math.max( 0, x - r ),
					y * tx + Math.min( tx - 1, x + r ) + 1
				);
			}
		}
	}
	const out = new Uint8Array( tx * ty );
	for ( let y = 0; y < ty; y++ ) {
		for ( let x = 0; x < tx; x++ ) {
			if ( row[ y * tx + x ] ) {
				for (
					let yy = Math.max( 0, y - r );
					yy <= Math.min( ty - 1, y + r );
					yy++
				) {
					out[ yy * tx + x ] = 1;
				}
			}
		}
	}
	return { tx, ty, m: out };
}

/**
 * The marked tiles as cell rects (inclusive), clipped to the region:
 * horizontal runs per tile row, runs over the same columns in successive
 * rows merged - a handful of rectangles for a pass to draw.
 *
 * @param {Object|null} mask Tile mask.
 * @param {number}      rw   Region width, cells.
 * @param {number}      rh   Region height, cells.
 * @return {Array} Cell rects.
 */
export function tileRects( mask, rw, rh ) {
	const out = [];
	if ( ! mask ) {
		return out;
	}
	const { tx, ty, m } = mask;
	let open = new Map(); // "x0:x1" -> rect still growing downwards
	for ( let y = 0; y < ty; y++ ) {
		const next = new Map();
		let x = 0;
		while ( x < tx ) {
			if ( ! m[ y * tx + x ] ) {
				x++;
				continue;
			}
			const s = x;
			while ( x < tx && m[ y * tx + x ] ) {
				x++;
			}
			const key = s + ':' + x;
			const above = open.get( key );
			const rect = above || {
				x0: s * TILE,
				y0: y * TILE,
				x1: Math.min( rw, x * TILE ) - 1,
				y1: 0,
			};
			rect.y1 = Math.min( rh, ( y + 1 ) * TILE ) - 1;
			if ( ! above ) {
				out.push( rect );
			}
			next.set( key, rect );
		}
		open = next;
	}
	return out;
}

/**
 * Cells the marked tiles cover, clipped to the region.
 *
 * @param {Object|null} mask Tile mask.
 * @param {number}      rw   Region width, cells.
 * @param {number}      rh   Region height, cells.
 * @return {number} Cells.
 */
export function tileCells( mask, rw, rh ) {
	let n = 0;
	for ( const r of tileRects( mask, rw, rh ) ) {
		n += ( r.x1 - r.x0 + 1 ) * ( r.y1 - r.y0 + 1 );
	}
	return n;
}

/**
 * The box around the marked tiles, in cells (inclusive), or null.
 *
 * @param {Object|null} mask Tile mask.
 * @param {number}      rw   Region width, cells.
 * @param {number}      rh   Region height, cells.
 * @return {Object|null} Cell rect.
 */
export function tileBox( mask, rw, rh ) {
	let box = null;
	for ( const r of tileRects( mask, rw, rh ) ) {
		box = rectUnion( box, r );
	}
	return box;
}

/**
 * A mask carried over a region grow: the region's origin moved by
 * (dx, dy) cells - rarely a whole number of tiles - so every old tile is
 * marked again wherever it now lies, on the new grid. Coarser than
 * before, never smaller.
 *
 * @param {Object|null} mask Old tile mask.
 * @param {number}      dx   Cells the old cells moved right.
 * @param {number}      dy   Cells the old cells moved down.
 * @param {number}      rw   New region width, cells.
 * @param {number}      rh   New region height, cells.
 * @return {Object|null} The mask on the new grid.
 */
export function tileShift( mask, dx, dy, rw, rh ) {
	if ( ! mask ) {
		return null;
	}
	const out = tileMask( rw, rh );
	for ( let y = 0; y < mask.ty; y++ ) {
		for ( let x = 0; x < mask.tx; x++ ) {
			if ( mask.m[ y * mask.tx + x ] ) {
				tileMark( out, {
					x0: x * TILE + dx,
					y0: y * TILE + dy,
					x1: ( x + 1 ) * TILE - 1 + dx,
					y1: ( y + 1 ) * TILE - 1 + dy,
				} );
			}
		}
	}
	return out;
}

/**
 * A short list of cell rects that stays short: a new rect merges with any
 * it touches (and those with each other), and past a dozen the list
 * becomes the one box around them all. Where the fresh dabs went down -
 * one place under a brush, a few for mirror twins.
 *
 * @param {Array}       list Cell rects (returned new, never changed).
 * @param {Object|null} r    Cell rect to add.
 * @return {Array} The list.
 */
export function addRect( list, r ) {
	if ( ! r ) {
		return list;
	}
	const touch = ( a, b ) =>
		a.x0 <= b.x1 + 1 &&
		b.x0 <= a.x1 + 1 &&
		a.y0 <= b.y1 + 1 &&
		b.y0 <= a.y1 + 1;
	let merged = { ...r };
	let rest = list;
	for ( let again = true; again;  ) {
		again = false;
		const keep = [];
		for ( const q of rest ) {
			if ( touch( q, merged ) ) {
				merged = rectUnion( merged, q );
				again = true;
			} else {
				keep.push( q );
			}
		}
		rest = keep;
	}
	const out = [ ...rest, merged ];
	return out.length > 12 ? [ out.reduce( rectUnion, null ) ] : out;
}

/**
 * Two triangles per rect in the clip space of a w x h target: what a pass
 * draws instead of one full-screen triangle under a scissor. Rects in
 * target pixels, [x0, x1) x [y0, y1), y up as the target counts it.
 *
 * @param {Array}             rects Pixel rects.
 * @param {number}            w     Target width.
 * @param {number}            h     Target height.
 * @param {Float32Array|null} buf   A buffer to reuse.
 * @return {Object} { data, count } - count = vertices.
 */
export function rectTriangles( rects, w, h, buf ) {
	const need = rects.length * 12;
	const data =
		buf && buf.length >= need
			? buf
			: new Float32Array( Math.max( need, 96 ) );
	let k = 0;
	for ( const r of rects ) {
		const x0 = ( 2 * r.x0 ) / w - 1;
		const x1 = ( 2 * r.x1 ) / w - 1;
		const y0 = ( 2 * r.y0 ) / h - 1;
		const y1 = ( 2 * r.y1 ) / h - 1;
		data[ k++ ] = x0;
		data[ k++ ] = y0;
		data[ k++ ] = x1;
		data[ k++ ] = y0;
		data[ k++ ] = x0;
		data[ k++ ] = y1;
		data[ k++ ] = x0;
		data[ k++ ] = y1;
		data[ k++ ] = x1;
		data[ k++ ] = y0;
		data[ k++ ] = x1;
		data[ k++ ] = y1;
	}
	return { data, count: k / 2 };
}

/**
 * REPLAY: the brush lab plays whole strokes inside ONE task on a virtual
 * clock. A WebGL fence can only signal between tasks, so under replay
 * the probe reads back synchronously and the frame budget stays off -
 * the frames are not real ones, and every run stays the same run.
 */
export function wetReplay() {
	return !! globalThis.wpieWetReplay;
}

// Steps per frame: the most a frame may run (the drying time-lapse) and
// the least a frame runs however tight the budget - a wash must keep
// drying. One, not the clock's pair: two steps over a whole wash on
// integrated graphics made every frame late, and two steps every other
// frame are no faster than one step every frame, only juddering.
export const STEP_CAP = 96;
export const STEP_FLOOR = 1;

// The frame budget counts WORK, cells times steps: a step over a whole
// wash costs a hundred steps over a fresh dab, and the area changes all
// the time (every new stroke widens it, drying shrinks it). It starts
// where integrated graphics are comfortable and climbs fast on anything
// stronger.
export const CELL_BUDGET0 = 2e6;
const CELL_BUDGET_MIN = 1e4;
const CELL_BUDGET_MAX = 1e9;
// On-time frames between two careful tries at more, once the budget is
// near the load that last made a frame late; doubled by every late
// frame, halved by every try that went through.
const PROBE_WAIT0 = 15;
const PROBE_WAIT_MAX = 240;

/** A fresh frame budget (one per controller, learned across washes). */
export function createPace() {
	return {
		budget: CELL_BUDGET0,
		floor: 1000 / 60,
		ceil: Infinity,
		wait: PROBE_WAIT0,
		calm: 0,
		// What the last frame ran (cells x steps) and whether the budget
		// was what stopped it - the controller fills both in.
		used: 0,
		bound: false,
	};
}

/**
 * THE FRAME BUDGET, one frame of it. Steps per frame follow the wall
 * clock, so a GPU that could not finish a frame's steps in time made the
 * next frame longer - and a longer frame asked for MORE steps: a spiral
 * into a frozen tab on integrated graphics. The budget shrinks while
 * frames come late AND the island's GPU work is still pending; on a
 * machine that keeps up it never binds, and the wash is exactly what it
 * was.
 *
 * It only GROWS from a frame it actually limited. The first budget grew
 * on every punctual frame, also while a stroke ran six steps a frame and
 * the budget allowed a hundred - so under the hand it forgot what the GPU
 * manages, and every release (the time-lapse asks for six times as much)
 * learnt it again through a run of late frames. Then it sawed: climb two
 * steps a frame, one late frame, cut, climb - "hakt immer wieder" on
 * integrated graphics. Now a late frame cuts below what that frame ran
 * and remembers it as the ceiling; the budget climbs back fast to just
 * under it and from there only tries a little more now and then, less
 * often after every try that failed.
 *
 * `pace.floor` is the display's own frame interval: the shortest frame
 * seen lately, drifting up slowly, never assumed longer than 30 Hz - a
 * tab that starts overloaded must still learn that it is late, and a
 * notebook throttled to 30 Hz on battery must not count as late.
 *
 * @param {Object}  pace See createPace - updated in place.
 * @param {number}  raw  Milliseconds since the previous frame.
 * @param {boolean} busy The GPU is still on the previous frame.
 * @return {number} The work budget for this frame, cells x steps.
 */
export function paceFrame( pace, raw, busy ) {
	if ( raw > 4 ) {
		pace.floor = Math.min(
			1000 / 30,
			raw < pace.floor ? raw : pace.floor * 1.01
		);
		if ( raw > pace.floor * 1.5 ) {
			if ( busy && pace.used > 0 ) {
				const was = Math.min( pace.budget, pace.used );
				pace.ceil = was;
				pace.budget = Math.max( CELL_BUDGET_MIN, was * 0.7 );
				pace.wait = Math.min( PROBE_WAIT_MAX, pace.wait * 2 );
				pace.calm = 0;
			}
		} else if ( raw < pace.floor * 1.25 && pace.bound ) {
			pace.calm++;
			if ( pace.budget * 1.25 < pace.ceil ) {
				pace.budget *= 1.25;
			} else if ( pace.calm >= pace.wait ) {
				pace.budget = Math.min( CELL_BUDGET_MAX, pace.budget * 1.06 );
				pace.ceil = Math.max( pace.ceil, pace.budget * 1.06 );
				pace.wait = Math.max( PROBE_WAIT0, pace.wait / 2 );
				pace.calm = 0;
			}
		}
	}
	return pace.budget;
}

/**
 * Steps that fit a frame's budget: never more than the clock asks for,
 * never fewer than the floor (a wash must keep drying, however slowly).
 * The steps a stamp already slipped in since the last frame (a rate
 * change per pen event) count against the budget, not against the clock.
 *
 * @param {number} budget Work budget, cells x steps (paceFrame).
 * @param {number} area   Cells the next step covers (0: nothing to run).
 * @param {number} want   Steps the clock asks for.
 * @param {number} folded Steps already run since the last frame.
 * @return {number} Steps to run now.
 */
export function stepsWithin( budget, area, want, folded ) {
	if ( ! ( area > 0 ) ) {
		return want;
	}
	const fit = Math.max( STEP_FLOOR, Math.floor( budget / area ) );
	return Math.min( want, Math.max( 0, fit - folded ) );
}

/**
 * "Is the GPU still on the last frame?" - a fence set after each frame's
 * work. The controller's step budget only shrinks while this says yes: a
 * long frame the GPU had long finished was the CPU's, and fewer steps
 * would not have helped it.
 *
 * @param {WebGL2RenderingContext} gl The island's context.
 * @return {Object} { mark(), busy() }.
 */
export function createFrameFence( gl ) {
	let sync = null;
	return {
		// The newest fence stands for everything before it: a frame marks
		// after its steps and again after its render, and "busy" must mean
		// the render too.
		mark() {
			if ( sync ) {
				gl.deleteSync( sync );
			}
			sync = gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 );
		},
		busy() {
			if ( ! sync ) {
				return false;
			}
			if ( gl.getSyncParameter( sync, gl.SYNC_STATUS ) !== gl.SIGNALED ) {
				return true;
			}
			gl.deleteSync( sync );
			sync = null;
			return false;
		},
	};
}

const PROBE_VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4( aPos, 0.0, 1.0 ); }
`;

// Row 0 of the target: one fragment per COLUMN of the rect, row 1: one
// per ROW. r = any active cell on that line, g = the wet maximum.
const probeFrag = ( active, wet ) => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uT;
uniform ivec4 uRect;
out vec4 oC;
void main() {
	int i = int( gl_FragCoord.x );
	bool rows = int( gl_FragCoord.y ) > 0;
	int n = rows ? uRect.z - uRect.x : uRect.w - uRect.y;
	float a = 0.0;
	float w = 0.0;
	for ( int k = 0; k <= n; k++ ) {
		vec4 v = texelFetch(
			uT,
			rows ? ivec2( uRect.x + k, i ) : ivec2( i, uRect.y + k ),
			0
		);
		if ( ${ active } ) {
			a = 1.0;
		}
		w = max( w, ${ wet } );
	}
	oC = vec4( a, w, 0.0, 0.0 );
}
`;

/**
 * The activity probe of one island.
 *
 * @param {WebGL2RenderingContext} gl     The island's context.
 * @param {WebGLBuffer}            quad   The island's full-screen triangle.
 * @param {string}                 active GLSL bool over `vec4 v` (one
 *                                        texel of the probed field).
 * @param {string}                 wet    GLSL float over `v`, maximised.
 * @return {Object} request / take / now / cancel.
 */
export function createWetProbe( gl, quad, active, wet ) {
	const compile = ( type, src ) => {
		const sh = gl.createShader( type );
		gl.shaderSource( sh, src );
		gl.compileShader( sh );
		if ( ! gl.getShaderParameter( sh, gl.COMPILE_STATUS ) ) {
			throw new Error( 'wet probe: ' + gl.getShaderInfoLog( sh ) );
		}
		return sh;
	};
	const prog = gl.createProgram();
	gl.attachShader( prog, compile( gl.VERTEX_SHADER, PROBE_VERT ) );
	gl.attachShader(
		prog,
		compile( gl.FRAGMENT_SHADER, probeFrag( active, wet ) )
	);
	gl.bindAttribLocation( prog, 0, 'aPos' );
	gl.linkProgram( prog );
	if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS ) ) {
		throw new Error( 'wet probe link: ' + gl.getProgramInfoLog( prog ) );
	}
	const uT = gl.getUniformLocation( prog, 'uT' );
	const uRect = gl.getUniformLocation( prog, 'uRect' );
	const fbo = gl.createFramebuffer();
	const pbo = gl.createBuffer();
	let pboBytes = 0;
	let tex = null;
	let texW = 0;
	let job = null; // { sync, rect, nc, nr, tag, data }
	let scratch = new Float32Array( 0 );

	function reduce( field, r ) {
		const need = Math.max( r.x1, r.y1 ) + 1;
		if ( ! tex || texW < need ) {
			if ( tex ) {
				gl.deleteTexture( tex );
			}
			texW = Math.max( need, 256 );
			tex = gl.createTexture();
			gl.bindTexture( gl.TEXTURE_2D, tex );
			gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RGBA32F, texW, 2 );
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				gl.NEAREST
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				gl.NEAREST
			);
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			tex,
			0
		);
		gl.drawBuffers( [ gl.COLOR_ATTACHMENT0 ] );
		gl.viewport( 0, 0, texW, 2 );
		gl.disable( gl.BLEND );
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, quad );
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		gl.activeTexture( gl.TEXTURE0 );
		gl.bindTexture( gl.TEXTURE_2D, field );
		gl.uniform1i( uT, 0 );
		gl.uniform4i( uRect, r.x0, r.y0, r.x1, r.y1 );
		gl.enable( gl.SCISSOR_TEST );
		gl.scissor( r.x0, 0, r.x1 - r.x0 + 1, 1 );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.scissor( r.y0, 1, r.y1 - r.y0 + 1, 1 );
		gl.drawArrays( gl.TRIANGLES, 0, 3 );
		gl.disable( gl.SCISSOR_TEST );
	}

	function parse( data, r, nc, nr ) {
		let x0 = -1;
		let x1 = -1;
		let y0 = -1;
		let y1 = -1;
		let w = 0;
		for ( let k = 0; k < nc; k++ ) {
			if ( data[ k * 4 ] > 0.5 ) {
				if ( x0 < 0 ) {
					x0 = r.x0 + k;
				}
				x1 = r.x0 + k;
			}
			w = Math.max( w, data[ k * 4 + 1 ] );
		}
		for ( let k = 0; k < nr; k++ ) {
			if ( data[ ( nc + k ) * 4 ] > 0.5 ) {
				if ( y0 < 0 ) {
					y0 = r.y0 + k;
				}
				y1 = r.y0 + k;
			}
		}
		return {
			box: x0 < 0 || y0 < 0 ? null : { x0, y0, x1, y1 },
			wet: w,
		};
	}

	function readNow( r, nc, nr ) {
		const len = ( nc + nr ) * 4;
		if ( scratch.length < len ) {
			scratch = new Float32Array( len );
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.readPixels( r.x0, 0, nc, 1, gl.RGBA, gl.FLOAT, scratch, 0 );
		gl.readPixels( r.y0, 1, nr, 1, gl.RGBA, gl.FLOAT, scratch, nc * 4 );
		return parse( scratch, r, nc, nr );
	}

	const P = {
		/** A probe is out (or back and not yet taken). */
		busy: () => !! job,

		/**
		 * Start probing `field` over `rect`; `tag` comes back with the
		 * result. Asynchronous - except under replay, where it reads back
		 * on the spot (see wetReplay).
		 *
		 * @param {WebGLTexture} field The field to reduce.
		 * @param {Object}       rect  Cell rect to cover.
		 * @param {Object}       tag   Returned with the result.
		 */
		request( field, rect, tag ) {
			P.cancel();
			const r = { ...rect };
			const nc = r.x1 - r.x0 + 1;
			const nr = r.y1 - r.y0 + 1;
			reduce( field, r );
			if ( wetReplay() ) {
				job = { done: { ...readNow( r, nc, nr ), ...tag } };
				return;
			}
			const bytes = ( nc + nr ) * 16;
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, pbo );
			if ( pboBytes < bytes ) {
				pboBytes = Math.max( bytes, 16384 );
				gl.bufferData( gl.PIXEL_PACK_BUFFER, pboBytes, gl.STREAM_READ );
			}
			gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
			gl.readPixels( r.x0, 0, nc, 1, gl.RGBA, gl.FLOAT, 0 );
			gl.readPixels( r.y0, 1, nr, 1, gl.RGBA, gl.FLOAT, nc * 16 );
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
			job = {
				sync: gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 ),
				r,
				nc,
				nr,
				tag,
			};
		},

		/**
		 * The finished probe ({ box, wet, ...tag }), or null while the GPU
		 * is still on it. Never waits.
		 */
		take() {
			if ( ! job ) {
				return null;
			}
			if ( job.done ) {
				const out = job.done;
				job = null;
				return out;
			}
			if (
				gl.getSyncParameter( job.sync, gl.SYNC_STATUS ) !== gl.SIGNALED
			) {
				return null;
			}
			const { r, nc, nr, tag } = job;
			const len = ( nc + nr ) * 4;
			if ( scratch.length < len ) {
				scratch = new Float32Array( len );
			}
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, pbo );
			gl.getBufferSubData( gl.PIXEL_PACK_BUFFER, 0, scratch, 0, len );
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
			gl.deleteSync( job.sync );
			job = null;
			return { ...parse( scratch, r, nc, nr ), ...tag };
		},

		/**
		 * A blocking probe, for the replay's wet check only.
		 *
		 * @param {WebGLTexture} field The field to reduce.
		 * @param {Object}       rect  Cell rect to cover.
		 * @return {Object} { box, wet }.
		 */
		now( field, rect ) {
			const r = { ...rect };
			reduce( field, r );
			return readNow( r, r.x1 - r.x0 + 1, r.y1 - r.y0 + 1 );
		},

		/** Forget a probe in flight (the region moved under it). */
		cancel() {
			if ( job?.sync ) {
				gl.deleteSync( job.sync );
			}
			job = null;
		},
	};
	return P;
}

// One fragment per TILE: whether any cell in it is active, and the wet
// maximum over it - the probe for the tile masks.
const tileProbeFrag = ( active, wet ) => `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D uT;
uniform ivec2 uSize;
out vec4 oC;
void main() {
	ivec2 c0 = ivec2( gl_FragCoord.xy ) * ${ TILE };
	ivec2 c1 = min( c0 + ${ TILE }, uSize );
	float a = 0.0;
	float w = 0.0;
	for ( int y = c0.y; y < c1.y; y++ ) {
		for ( int x = c0.x; x < c1.x; x++ ) {
			vec4 v = texelFetch( uT, ivec2( x, y ), 0 );
			if ( ${ active } ) {
				a = 1.0;
			}
			w = max( w, ${ wet } );
		}
	}
	oC = vec4( a, w, 0.0, 0.0 );
}
`;

/**
 * The activity probe of one island, per TILE: which tiles of a mask still
 * hold an active cell, read back like the line probe above (a pixel-pack
 * buffer and a fence, polled once per frame; synchronous under replay).
 *
 * @param {WebGL2RenderingContext} gl     The island's context.
 * @param {string}                 active GLSL bool over `vec4 v`.
 * @param {string}                 wet    GLSL float over `v`, maximised.
 * @return {Object} request / take / now / cancel / busy.
 */
export function createTileProbe( gl, active, wet ) {
	const compile = ( type, src ) => {
		const sh = gl.createShader( type );
		gl.shaderSource( sh, src );
		gl.compileShader( sh );
		if ( ! gl.getShaderParameter( sh, gl.COMPILE_STATUS ) ) {
			throw new Error( 'wet tile probe: ' + gl.getShaderInfoLog( sh ) );
		}
		return sh;
	};
	const prog = gl.createProgram();
	gl.attachShader( prog, compile( gl.VERTEX_SHADER, PROBE_VERT ) );
	gl.attachShader(
		prog,
		compile( gl.FRAGMENT_SHADER, tileProbeFrag( active, wet ) )
	);
	gl.bindAttribLocation( prog, 0, 'aPos' );
	gl.linkProgram( prog );
	if ( ! gl.getProgramParameter( prog, gl.LINK_STATUS ) ) {
		throw new Error(
			'wet tile probe link: ' + gl.getProgramInfoLog( prog )
		);
	}
	const uT = gl.getUniformLocation( prog, 'uT' );
	const uSize = gl.getUniformLocation( prog, 'uSize' );
	const fbo = gl.createFramebuffer();
	const pbo = gl.createBuffer();
	const geom = gl.createBuffer();
	let geomData = null;
	let pboBytes = 0;
	let tex = null;
	let texW = 0;
	let texH = 0;
	let job = null; // { sync, box, mask, tag } or { done }
	let scratch = new Float32Array( 0 );

	function reduce( field, mask, rw, rh ) {
		if ( ! tex || texW < mask.tx || texH < mask.ty ) {
			if ( tex ) {
				gl.deleteTexture( tex );
			}
			texW = Math.max( texW, mask.tx, 64 );
			texH = Math.max( texH, mask.ty, 64 );
			tex = gl.createTexture();
			gl.bindTexture( gl.TEXTURE_2D, tex );
			gl.texStorage2D( gl.TEXTURE_2D, 1, gl.RGBA32F, texW, texH );
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MIN_FILTER,
				gl.NEAREST
			);
			gl.texParameteri(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				gl.NEAREST
			);
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.framebufferTexture2D(
			gl.FRAMEBUFFER,
			gl.COLOR_ATTACHMENT0,
			gl.TEXTURE_2D,
			tex,
			0
		);
		gl.drawBuffers( [ gl.COLOR_ATTACHMENT0 ] );
		gl.disable( gl.SCISSOR_TEST );
		gl.disable( gl.BLEND );
		// Tiles outside the mask read as quiet.
		gl.clearColor( 0, 0, 0, 0 );
		gl.clear( gl.COLOR_BUFFER_BIT );
		gl.viewport( 0, 0, texW, texH );
		const rects = [];
		for ( let y = 0; y < mask.ty; y++ ) {
			let x = 0;
			while ( x < mask.tx ) {
				if ( ! mask.m[ y * mask.tx + x ] ) {
					x++;
					continue;
				}
				const s = x;
				while ( x < mask.tx && mask.m[ y * mask.tx + x ] ) {
					x++;
				}
				rects.push( { x0: s, y0: y, x1: x, y1: y + 1 } );
			}
		}
		const tri = rectTriangles( rects, texW, texH, geomData );
		geomData = tri.data;
		gl.useProgram( prog );
		gl.bindBuffer( gl.ARRAY_BUFFER, geom );
		gl.bufferData(
			gl.ARRAY_BUFFER,
			geomData.subarray( 0, tri.count * 2 ),
			gl.STREAM_DRAW
		);
		gl.enableVertexAttribArray( 0 );
		gl.vertexAttribPointer( 0, 2, gl.FLOAT, false, 0, 0 );
		gl.activeTexture( gl.TEXTURE0 );
		gl.bindTexture( gl.TEXTURE_2D, field );
		gl.uniform1i( uT, 0 );
		gl.uniform2i( uSize, rw, rh );
		gl.drawArrays( gl.TRIANGLES, 0, tri.count );
	}

	function parse( data, mask, box ) {
		const out = {
			tx: mask.tx,
			ty: mask.ty,
			m: new Uint8Array( mask.m.length ),
		};
		const bw = box.x1 - box.x0 + 1;
		let w = 0;
		let any = false;
		for ( let y = box.y0; y <= box.y1; y++ ) {
			for ( let x = box.x0; x <= box.x1; x++ ) {
				const k = ( ( y - box.y0 ) * bw + ( x - box.x0 ) ) * 4;
				if ( data[ k ] > 0.5 ) {
					out.m[ y * mask.tx + x ] = 1;
					any = true;
				}
				w = Math.max( w, data[ k + 1 ] );
			}
		}
		return { tiles: any ? out : null, wet: w };
	}

	// The tile box of a mask (tile units, inclusive), or null.
	function boxOf( mask ) {
		let box = null;
		for ( let y = 0; y < mask.ty; y++ ) {
			for ( let x = 0; x < mask.tx; x++ ) {
				if ( mask.m[ y * mask.tx + x ] ) {
					box = rectUnion( box, { x0: x, y0: y, x1: x, y1: y } );
				}
			}
		}
		return box;
	}

	function readNow( mask, box ) {
		const len = ( box.x1 - box.x0 + 1 ) * ( box.y1 - box.y0 + 1 ) * 4;
		if ( scratch.length < len ) {
			scratch = new Float32Array( len );
		}
		gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
		gl.readPixels(
			box.x0,
			box.y0,
			box.x1 - box.x0 + 1,
			box.y1 - box.y0 + 1,
			gl.RGBA,
			gl.FLOAT,
			scratch,
			0
		);
		return parse( scratch, mask, box );
	}

	const P = {
		busy: () => !! job,

		/**
		 * Start probing `field` over the tiles of `mask`; `tag` comes back
		 * with the result ({ tiles, wet, ...tag }).
		 *
		 * @param {WebGLTexture} field The field to reduce.
		 * @param {Object}       mask  Tile mask to cover.
		 * @param {number}       rw    Region width, cells.
		 * @param {number}       rh    Region height, cells.
		 * @param {Object}       tag   Returned with the result.
		 */
		request( field, mask, rw, rh, tag ) {
			P.cancel();
			const box = boxOf( mask );
			if ( ! box ) {
				job = { done: { tiles: null, wet: 0, ...tag } };
				return;
			}
			const m = { ...mask, m: mask.m.slice() };
			reduce( field, m, rw, rh );
			if ( wetReplay() ) {
				job = { done: { ...readNow( m, box ), ...tag } };
				return;
			}
			const bytes =
				( box.x1 - box.x0 + 1 ) * ( box.y1 - box.y0 + 1 ) * 16;
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, pbo );
			if ( pboBytes < bytes ) {
				pboBytes = Math.max( bytes, 16384 );
				gl.bufferData( gl.PIXEL_PACK_BUFFER, pboBytes, gl.STREAM_READ );
			}
			gl.bindFramebuffer( gl.FRAMEBUFFER, fbo );
			gl.readPixels(
				box.x0,
				box.y0,
				box.x1 - box.x0 + 1,
				box.y1 - box.y0 + 1,
				gl.RGBA,
				gl.FLOAT,
				0
			);
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
			job = {
				sync: gl.fenceSync( gl.SYNC_GPU_COMMANDS_COMPLETE, 0 ),
				box,
				mask: m,
				tag,
			};
		},

		/** The finished probe, or null while the GPU is still on it. */
		take() {
			if ( ! job ) {
				return null;
			}
			if ( job.done ) {
				const out = job.done;
				job = null;
				return out;
			}
			if (
				gl.getSyncParameter( job.sync, gl.SYNC_STATUS ) !== gl.SIGNALED
			) {
				return null;
			}
			const { box, mask, tag } = job;
			const len = ( box.x1 - box.x0 + 1 ) * ( box.y1 - box.y0 + 1 ) * 4;
			if ( scratch.length < len ) {
				scratch = new Float32Array( len );
			}
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, pbo );
			gl.getBufferSubData( gl.PIXEL_PACK_BUFFER, 0, scratch, 0, len );
			gl.bindBuffer( gl.PIXEL_PACK_BUFFER, null );
			gl.deleteSync( job.sync );
			job = null;
			return { ...parse( scratch, mask, box ), ...tag };
		},

		/**
		 * A blocking probe, for the replay's wet check only.
		 *
		 * @param {WebGLTexture} field The field to reduce.
		 * @param {Object}       mask  Tile mask to cover.
		 * @param {number}       rw    Region width, cells.
		 * @param {number}       rh    Region height, cells.
		 * @return {Object} { tiles, wet }.
		 */
		now( field, mask, rw, rh ) {
			const box = boxOf( mask );
			if ( ! box ) {
				return { tiles: null, wet: 0 };
			}
			reduce( field, mask, rw, rh );
			return readNow( mask, box );
		},

		cancel() {
			if ( job?.sync ) {
				gl.deleteSync( job.sync );
			}
			job = null;
		},
	};
	return P;
}
