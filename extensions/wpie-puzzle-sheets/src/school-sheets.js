/**
 * Puzzle Sheets 2.7: sheets for school and the round maze.
 *
 * Arithmetic drills in rows or written in columns on squared paper,
 * clock faces to read or to draw the hands on, and a real circular maze
 * (rings and spokes, not a circle cut out of a square grid). Same paper,
 * type and colors as every other sheet (sheetKit), same contract: a pure
 * build step with a seed, a render step that draws the sheet or its
 * solution. Node-testable like the rest of the engine.
 */

import { rng, sheetKit } from './puzzle-engine.js';

const {
	makeCanvas,
	titleBlock,
	drawTitle,
	famFor,
	tscale,
	accentOf,
	INK,
	SOLVE,
} = sheetKit;

const int = ( rand, lo, hi ) =>
	lo + Math.floor( rand() * ( Math.max( lo, hi ) - lo + 1 ) );

/* ------------------------------- arithmetic ------------------------------- */

const OPS = {
	add: [ '+' ],
	sub: [ '−' ],
	mul: [ '×' ],
	div: [ ':' ],
	addsub: [ '+', '−' ],
	muldiv: [ '×', ':' ],
	all: [ '+', '−', '×', ':' ],
};
export const ARITH_OPS = Object.keys( OPS );
export const ARITH_RANGES = [ 10, 20, 100, 1000 ];

/**
 * Arithmetic drills that stay inside the number range: sums up to the
 * range, differences never below zero, products from the times tables
 * (beyond 100: a larger number times one digit), divisions that always
 * come out whole.
 *
 * @param {Object} opts { ops (ARITH_OPS), max (ARITH_RANGES), count
 *                        4..40, gaps (the blank may be any of the three
 *                        numbers, not only the result), seed }.
 * @return {Object} { items: [ { a, op, b, r, gap 0|1|2 } ], max }
 */
export function buildArithmetic( opts = {} ) {
	const max = ARITH_RANGES.includes( opts.max ) ? opts.max : 20;
	const count = Math.max( 4, Math.min( 40, opts.count || 24 ) );
	const ops = OPS[ opts.ops ] || OPS.add;
	const rand = rng( ( opts.seed || 3 ) * 41 + max );
	const items = [];
	const seen = new Set();
	for ( let tries = 0; items.length < count && tries < count * 60; tries++ ) {
		const op = ops[ Math.floor( rand() * ops.length ) ];
		let a;
		let b;
		let r;
		if ( '+' === op ) {
			a = int( rand, 1, max - 1 );
			b = int( rand, 1, max - a );
			r = a + b;
		} else if ( '−' === op ) {
			a = int( rand, 2, max );
			b = int( rand, 1, a - 1 );
			r = a - b;
		} else if ( '×' === op ) {
			if ( max <= 100 ) {
				b = int( rand, 1, 10 );
				a = int( rand, 1, Math.min( 10, Math.floor( max / b ) ) );
			} else {
				b = int( rand, 2, 9 );
				a = int( rand, 11, Math.floor( max / b ) );
			}
			r = a * b;
		} else {
			if ( max <= 100 ) {
				b = int( rand, 1, 10 );
				r = int( rand, 1, Math.min( 10, Math.floor( max / b ) ) );
			} else {
				b = int( rand, 2, 9 );
				r = int( rand, 11, Math.floor( max / b ) );
			}
			a = b * r;
		}
		const key = a + op + b;
		// Repeats only once the range has run out of fresh ones.
		if ( seen.has( key ) && tries < count * 40 ) {
			continue;
		}
		seen.add( key );
		items.push( { a, op, b, r, gap: opts.gaps ? int( rand, 0, 2 ) : 2 } );
	}
	return { items, max };
}

/** Written arithmetic works for sums and differences only. */
export const canWriteInColumns = ( model ) =>
	model.items.every( ( it ) => '+' === it.op || '−' === it.op );

/**
 * The drill sheet: "7 + 5 = ☐" in columns of rows - or, with `columns`,
 * written arithmetic on squared paper (numbers under each other, a rule
 * under the second, the result in the boxes below).
 */
export function renderArithmetic( like, model, opts = {} ) {
	if ( opts.columns && canWriteInColumns( model ) ) {
		return renderWrittenArithmetic( like, model, opts );
	}
	const sc = tscale( opts );
	const px = Math.round( 28 * sc );
	const M = 60;
	const W = 1000;
	const tb = titleBlock( opts );
	const probe = makeCanvas( like, 4, 4 ).getContext( '2d' );
	probe.font = `600 ${ px }px ${ famFor( opts ) }`;
	const digits = String( model.max ).length;
	const charW = probe.measureText( '0' ).width;
	const slotW = Math.ceil( charW * digits + 22 );
	const opW = Math.round( px * 1.2 );
	const itemW = 3 * slotW + 2 * opW;
	const colGap = 56;
	const cols = Math.max(
		1,
		Math.min( 4, Math.floor( ( W - 2 * M + colGap ) / ( itemW + colGap ) ) )
	);
	const rowH = Math.round( px * 2.2 );
	const rows = Math.ceil( model.items.length / cols );
	const c = makeCanvas( like, W, M * 2 + tb.h + rows * rowH );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const usedW = cols * itemW + ( cols - 1 ) * colGap;
	const x0 = ( W - usedW ) / 2;
	const top = M + tb.h;
	g.textBaseline = 'middle';
	model.items.forEach( ( it, i ) => {
		// Column by column, so a column reads top to bottom.
		const col = Math.floor( i / rows );
		const row = i % rows;
		let x = x0 + col * ( itemW + colGap );
		const y = top + row * rowH + rowH / 2;
		const values = [ it.a, it.b, it.r ];
		const signs = [ it.op, '=' ];
		for ( let k = 0; k < 3; k++ ) {
			if ( k === it.gap ) {
				g.strokeStyle = INK;
				g.lineWidth = 2;
				g.strokeRect( x + 2, y - px * 0.72, slotW - 4, px * 1.44 );
				if ( opts.solution ) {
					g.fillStyle = SOLVE;
					g.font = `700 ${ px }px ${ famFor( opts ) }`;
					g.textAlign = 'center';
					g.fillText( String( values[ k ] ), x + slotW / 2, y + 1 );
				}
			} else {
				g.fillStyle = INK;
				g.font = `600 ${ px }px ${ famFor( opts ) }`;
				g.textAlign = 'right';
				g.fillText( String( values[ k ] ), x + slotW - 8, y + 1 );
			}
			x += slotW;
			if ( k < 2 ) {
				g.fillStyle = k ? '#6a7078' : accentOf( opts );
				g.font = `700 ${ px }px ${ famFor( opts ) }`;
				g.textAlign = 'center';
				g.fillText( signs[ k ], x + opW / 2, y + 1 );
				x += opW;
			}
		}
	} );
	return c;
}

function renderWrittenArithmetic( like, model, opts ) {
	const C = 38;
	const M = 60;
	const W = 1000;
	const tb = titleBlock( opts );
	// One column for the sign, one for a carry, the digits of the range.
	const bw = String( model.max ).length + 2;
	const bh = 3;
	const per = Math.max(
		1,
		Math.floor( ( W - 2 * M + C ) / ( ( bw + 1 ) * C ) )
	);
	const rows = Math.ceil( model.items.length / per );
	const top = M + tb.h;
	const gridW = per * ( bw + 1 ) * C - C;
	const x0 = Math.round( ( W - gridW ) / 2 );
	const c = makeCanvas( like, W, top + rows * ( bh + 1 ) * C + M - C );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const digitsAt = ( n, row, bx, by, color ) => {
		const s = String( n );
		g.fillStyle = color;
		for ( let i = 0; i < s.length; i++ ) {
			const col = bw - s.length + i;
			g.fillText(
				s[ i ],
				bx + col * C + C / 2,
				by + row * C + C / 2 + 1
			);
		}
	};
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	model.items.forEach( ( it, i ) => {
		const bx = x0 + ( i % per ) * ( bw + 1 ) * C;
		const by = top + Math.floor( i / per ) * ( bh + 1 ) * C;
		// Squared paper under the block.
		g.strokeStyle = 'rgba(80, 140, 200, 0.35)';
		g.lineWidth = 1;
		for ( let k = 0; k <= bw; k++ ) {
			g.beginPath();
			g.moveTo( bx + k * C, by );
			g.lineTo( bx + k * C, by + bh * C );
			g.stroke();
		}
		for ( let k = 0; k <= bh; k++ ) {
			g.beginPath();
			g.moveTo( bx, by + k * C );
			g.lineTo( bx + bw * C, by + k * C );
			g.stroke();
		}
		g.font = `600 ${ Math.round( C * 0.62 ) }px ${ famFor( opts ) }`;
		digitsAt( it.a, 0, bx, by, INK );
		digitsAt( it.b, 1, bx, by, INK );
		g.fillStyle = accentOf( opts );
		g.font = `700 ${ Math.round( C * 0.62 ) }px ${ famFor( opts ) }`;
		g.fillText( it.op, bx + C / 2, by + C * 1.5 + 1 );
		// The rule under the second number.
		g.strokeStyle = INK;
		g.lineWidth = 2.6;
		g.beginPath();
		g.moveTo( bx + 3, by + 2 * C );
		g.lineTo( bx + bw * C - 3, by + 2 * C );
		g.stroke();
		if ( opts.solution ) {
			g.font = `700 ${ Math.round( C * 0.62 ) }px ${ famFor( opts ) }`;
			digitsAt( it.r, 2, bx, by, SOLVE );
		}
	} );
	return c;
}

/* ---------------------------------- clocks --------------------------------- */

const STEPS = { hour: 60, half: 30, quarter: 15, five: 5, minute: 1 };
export const CLOCK_STEPS = Object.keys( STEPS );

/**
 * Times on the clock, all different, to the chosen precision.
 *
 * @param {Object} opts { count 4|6|9|12, step (CLOCK_STEPS), task 'read'
 *                        (hands given, write the time) | 'draw' (time
 *                        given, draw the hands) | 'mixed', seed }.
 * @return {Object} { items: [ { h 1..12, m, task } ], step }
 */
export function buildClocks( opts = {} ) {
	const count = [ 4, 6, 9, 12 ].includes( opts.count ) ? opts.count : 6;
	const step = STEPS[ opts.step ] || 15;
	const rand = rng( ( opts.seed || 5 ) * 53 + step );
	const items = [];
	const seen = new Set();
	for ( let tries = 0; items.length < count && tries < 600; tries++ ) {
		const h = int( rand, 1, 12 );
		const m = step * int( rand, 0, 60 / step - 1 );
		if ( seen.has( h * 60 + m ) && tries < 400 ) {
			continue;
		}
		seen.add( h * 60 + m );
		let task = 'draw' === opts.task ? 'draw' : 'read';
		if ( 'mixed' === opts.task ) {
			task = items.length % 2 ? 'draw' : 'read';
		}
		items.push( { h, m, task } );
	}
	return { items, step: STEPS[ opts.step ] ? opts.step : 'quarter' };
}

const pad2 = ( n ) => String( n ).padStart( 2, '0' );

/** One clock face; `hands` draws the time in the given color. */
function drawClockFace( g, cx, cy, R, opts, fine, hands ) {
	g.fillStyle = '#ffffff';
	g.beginPath();
	g.arc( cx, cy, R, 0, Math.PI * 2 );
	g.fill();
	g.strokeStyle = accentOf( opts );
	g.lineWidth = Math.max( 3, R * 0.04 );
	g.stroke();
	g.strokeStyle = INK;
	for ( let i = 0; i < 60; i++ ) {
		const hour = 0 === i % 5;
		if ( ! hour && ! fine ) {
			continue;
		}
		const a = ( i / 60 ) * Math.PI * 2;
		const r0 = R * ( hour ? 0.86 : 0.91 );
		g.lineWidth = hour ? Math.max( 2.5, R * 0.03 ) : 1.2;
		g.beginPath();
		g.moveTo( cx + Math.sin( a ) * r0, cy - Math.cos( a ) * r0 );
		g.lineTo(
			cx + Math.sin( a ) * R * 0.96,
			cy - Math.cos( a ) * R * 0.96
		);
		g.stroke();
	}
	g.fillStyle = INK;
	g.font = `700 ${ Math.round( R * 0.19 ) }px ${ famFor( opts ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	for ( let n = 1; n <= 12; n++ ) {
		const a = ( n / 12 ) * Math.PI * 2;
		g.fillText(
			String( n ),
			cx + Math.sin( a ) * R * 0.7,
			cy - Math.cos( a ) * R * 0.7 + 1
		);
	}
	if ( hands ) {
		const { h, m, color } = hands;
		const hand = ( angle, len, width ) => {
			g.strokeStyle = color;
			g.lineWidth = width;
			g.lineCap = 'round';
			g.beginPath();
			g.moveTo( cx, cy );
			g.lineTo(
				cx + Math.sin( angle ) * len,
				cy - Math.cos( angle ) * len
			);
			g.stroke();
		};
		hand(
			( ( ( h % 12 ) + m / 60 ) / 12 ) * Math.PI * 2,
			R * 0.48,
			R * 0.07
		);
		hand( ( m / 60 ) * Math.PI * 2, R * 0.74, R * 0.045 );
		g.lineCap = 'butt';
	}
	g.fillStyle = INK;
	g.beginPath();
	g.arc( cx, cy, R * 0.05, 0, Math.PI * 2 );
	g.fill();
}

/**
 * The clock sheet: read the time (hands drawn, two boxes to write in) or
 * draw the hands (the time printed under an empty face).
 */
export function renderClocks( like, model, opts = {} ) {
	const n = model.items.length;
	const cols = n <= 4 ? 2 : 3;
	const rows = Math.ceil( n / cols );
	const M = 60;
	const cellW = 300;
	const cellH = 330;
	const R = 112;
	const tb = titleBlock( opts );
	const W = Math.max( 760, cols * cellW + 2 * M );
	const c = makeCanvas( like, W, M * 2 + tb.h + rows * cellH );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const fine = [ 'five', 'minute' ].includes( model.step );
	const x0 = ( W - cols * cellW ) / 2;
	const top = M + tb.h;
	const sc = tscale( opts );
	model.items.forEach( ( it, i ) => {
		const cx = x0 + ( i % cols ) * cellW + cellW / 2;
		const cy = top + Math.floor( i / cols ) * cellH + R + 12;
		const read = 'read' === it.task;
		let hands = null;
		if ( read ) {
			hands = { h: it.h, m: it.m, color: INK };
		} else if ( opts.solution ) {
			hands = { h: it.h, m: it.m, color: SOLVE };
		}
		drawClockFace( g, cx, cy, R, opts, fine, hands );
		const ay = cy + R + 44;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		if ( read ) {
			// Two boxes and a colon: hours and minutes.
			const bw = 64;
			const bh = 50;
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.strokeRect( cx - bw - 10, ay - bh / 2, bw, bh );
			g.strokeRect( cx + 10, ay - bh / 2, bw, bh );
			g.fillStyle = INK;
			g.font = `700 ${ Math.round( 30 * sc ) }px ${ famFor( opts ) }`;
			g.fillText( ':', cx, ay - 2 );
			if ( opts.solution ) {
				g.fillStyle = SOLVE;
				g.fillText( String( it.h ), cx - bw / 2 - 10, ay + 1 );
				g.fillText( pad2( it.m ), cx + bw / 2 + 10, ay + 1 );
			}
		} else {
			g.fillStyle = INK;
			g.font = `700 ${ Math.round( 34 * sc ) }px ${ famFor( opts ) }`;
			g.fillText( `${ it.h }:${ pad2( it.m ) }`, cx, ay + 1 );
		}
	} );
	return c;
}

/* ------------------------------- circle maze ------------------------------ */

/**
 * A real circular maze: rings of cells around a center cell, each ring
 * split into as many cells as keep them roughly square (the count
 * doubles once a ring's cells grow twice as wide as they are deep). A
 * recursive backtracker carves it from the center; the way out is one
 * gap in the outer wall.
 *
 * @param {Object} opts { rings 4..20, seed }.
 * @return {Object} { rings, counts, offs, passages: Set "a-b", exit (cell
 *                    index in the outer ring), path: [cell ids] }
 */
export function buildCircleMaze( opts = {} ) {
	const R = Math.max( 4, Math.min( 20, opts.rings || 10 ) );
	const rand = rng( ( opts.seed || 9 ) * 61 + R );
	const counts = [ 1, 6 ];
	for ( let k = 2; k <= R; k++ ) {
		const prev = counts[ k - 1 ];
		counts.push( ( 2 * Math.PI * k ) / prev > 2 ? prev * 2 : prev );
	}
	const offs = [];
	let total = 0;
	for ( const n of counts ) {
		offs.push( total );
		total += n;
	}
	const ring = new Int32Array( total );
	const pos = new Int32Array( total );
	counts.forEach( ( n, k ) => {
		for ( let j = 0; j < n; j++ ) {
			ring[ offs[ k ] + j ] = k;
			pos[ offs[ k ] + j ] = j;
		}
	} );
	const id = ( k, j ) =>
		offs[ k ] + ( ( ( j % counts[ k ] ) + counts[ k ] ) % counts[ k ] );
	const parent = ( cell ) => {
		const k = ring[ cell ];
		return 1 === k
			? 0
			: id(
					k - 1,
					Math.floor(
						( pos[ cell ] * counts[ k - 1 ] ) / counts[ k ]
					)
			  );
	};
	const neighbors = ( cell ) => {
		const k = ring[ cell ];
		if ( 0 === k ) {
			return Array.from( { length: counts[ 1 ] }, ( _, j ) =>
				id( 1, j )
			);
		}
		const j = pos[ cell ];
		const out = [ id( k, j + 1 ), id( k, j - 1 ), parent( cell ) ];
		if ( k < R ) {
			const f = counts[ k + 1 ] / counts[ k ];
			for ( let s = 0; s < f; s++ ) {
				out.push( id( k + 1, j * f + s ) );
			}
		}
		return out;
	};
	const key = ( a, b ) => ( a < b ? a + '-' + b : b + '-' + a );
	const passages = new Set();
	const seen = new Uint8Array( total );
	const stack = [ 0 ];
	seen[ 0 ] = 1;
	while ( stack.length ) {
		const cur = stack[ stack.length - 1 ];
		const open = neighbors( cur ).filter( ( nb ) => ! seen[ nb ] );
		if ( ! open.length ) {
			stack.pop();
			continue;
		}
		const next = open[ Math.floor( rand() * open.length ) ];
		passages.add( key( cur, next ) );
		seen[ next ] = 1;
		stack.push( next );
	}
	const exit = Math.floor( rand() * counts[ R ] );
	// The way from the center to the gap, for the solution sheet.
	const goal = id( R, exit );
	const from = new Int32Array( total ).fill( -1 );
	from[ 0 ] = 0;
	const queue = [ 0 ];
	while ( queue.length ) {
		const cur = queue.shift();
		if ( cur === goal ) {
			break;
		}
		for ( const nb of neighbors( cur ) ) {
			if ( from[ nb ] < 0 && passages.has( key( cur, nb ) ) ) {
				from[ nb ] = cur;
				queue.push( nb );
			}
		}
	}
	const path = [];
	for ( let cur = goal; ; cur = from[ cur ] ) {
		path.unshift( cur );
		if ( 0 === cur || from[ cur ] < 0 ) {
			break;
		}
	}
	return {
		rings: R,
		counts,
		offs,
		passages,
		exit,
		path,
		ring: Array.from( ring ),
		pos: Array.from( pos ),
	};
}

/** Render the circle maze (or its solution). */
export function renderCircleMaze( like, mz, opts = {} ) {
	const { rings: R, counts, offs, passages } = mz;
	const tb = titleBlock( opts );
	const M = 60;
	const D = 860;
	const W = D + 2 * M;
	const c = makeCanvas( like, W, D + 2 * M + tb.h );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, c.height );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const cx = W / 2;
	const cy = M + tb.h + D / 2;
	// One ring's depth stays free outside the wall for the exit arrow.
	const T = D / 2 / ( R + 2 );
	const TAU = Math.PI * 2;
	// Angle 0 at the top, clockwise - like a clock face.
	const ang = ( k, j ) => ( j / counts[ k ] ) * TAU - Math.PI / 2;
	const has = ( a, b ) => passages.has( a < b ? a + '-' + b : b + '-' + a );
	const id = ( k, j ) =>
		offs[ k ] + ( ( ( j % counts[ k ] ) + counts[ k ] ) % counts[ k ] );
	g.strokeStyle = INK;
	g.lineWidth = Math.max( 2.5, T * 0.11 );
	g.lineCap = 'round';
	g.beginPath();
	for ( let k = 1; k <= R; k++ ) {
		for ( let j = 0; j < counts[ k ]; j++ ) {
			const cell = id( k, j );
			const par =
				1 === k
					? 0
					: id(
							k - 1,
							Math.floor( ( j * counts[ k - 1 ] ) / counts[ k ] )
					  );
			const a0 = ang( k, j );
			const a1 = ang( k, j + 1 );
			if ( ! has( cell, par ) ) {
				g.moveTo(
					cx + Math.cos( a0 ) * k * T,
					cy + Math.sin( a0 ) * k * T
				);
				g.arc( cx, cy, k * T, a0, a1 );
			}
			if ( ! has( cell, id( k, j + 1 ) ) ) {
				g.moveTo(
					cx + Math.cos( a1 ) * k * T,
					cy + Math.sin( a1 ) * k * T
				);
				g.lineTo(
					cx + Math.cos( a1 ) * ( k + 1 ) * T,
					cy + Math.sin( a1 ) * ( k + 1 ) * T
				);
			}
		}
	}
	// The outer wall, open at the exit.
	const e0 = ang( R, mz.exit );
	const e1 = ang( R, mz.exit + 1 );
	const RO = ( R + 1 ) * T;
	g.moveTo( cx + Math.cos( e1 ) * RO, cy + Math.sin( e1 ) * RO );
	g.arc( cx, cy, RO, e1, e0 + TAU );
	g.stroke();
	g.lineCap = 'butt';
	const center = ( cell ) => {
		const k = mz.ring[ cell ];
		if ( 0 === k ) {
			return [ cx, cy, 0, 0 ];
		}
		const a = ang( k, mz.pos[ cell ] + 0.5 );
		const r = ( k + 0.5 ) * T;
		return [ cx + Math.cos( a ) * r, cy + Math.sin( a ) * r, r, a ];
	};
	if ( opts.solution && mz.path.length > 1 ) {
		g.strokeStyle = SOLVE;
		g.lineWidth = Math.max( 3, T * 0.26 );
		g.lineCap = 'round';
		g.lineJoin = 'round';
		g.beginPath();
		const [ sx, sy ] = center( mz.path[ 0 ] );
		g.moveTo( sx, sy );
		for ( let i = 1; i < mz.path.length; i++ ) {
			const a = mz.path[ i - 1 ];
			const b = mz.path[ i ];
			const [ bx, by, br, ba ] = center( b );
			if ( mz.ring[ a ] === mz.ring[ b ] && mz.ring[ a ] > 0 ) {
				// Along the ring: an arc, the short way round.
				const [ , , , aa ] = center( a );
				let d = ba - aa;
				while ( d > Math.PI ) {
					d -= TAU;
				}
				while ( d < -Math.PI ) {
					d += TAU;
				}
				g.arc( cx, cy, br, aa, aa + d, d < 0 );
			} else {
				g.lineTo( bx, by );
			}
		}
		// And out through the gap.
		const em = ( e0 + e1 ) / 2;
		g.lineTo(
			cx + Math.cos( em ) * ( RO + T * 0.6 ),
			cy + Math.sin( em ) * ( RO + T * 0.6 )
		);
		g.stroke();
		g.lineCap = 'butt';
	}
	// Start in the middle, an arrow out of the gap.
	g.fillStyle = accentOf( opts );
	g.beginPath();
	g.arc( cx, cy, T * 0.34, 0, TAU );
	g.fill();
	const em = ( e0 + e1 ) / 2;
	const tip = RO + T * 0.95;
	const base = RO + T * 0.35;
	const side = T * 0.32;
	const nx = Math.cos( em );
	const ny = Math.sin( em );
	g.beginPath();
	g.moveTo( cx + nx * tip, cy + ny * tip );
	g.lineTo( cx + nx * base - ny * side, cy + ny * base + nx * side );
	g.lineTo( cx + nx * base + ny * side, cy + ny * base - nx * side );
	g.closePath();
	g.fill();
	return c;
}
