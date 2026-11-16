/**
 * Puzzle Sheets 2.8: missing letters, magic squares and three more game
 * sheets (hangman, tic-tac-toe, code breaker).
 *
 * Same paper, type and colors as every other sheet (sheetKit), same
 * contract: a pure build step with a seed, a render step that draws the
 * sheet or its solution. Node-testable like the rest of the engine.
 */

import { rng, sheetKit } from './puzzle-engine.js';

const {
	makeCanvas,
	titleBlock,
	drawTitle,
	famFor,
	tscale,
	accentOf,
	hintInk,
	INK,
	SOLVE,
} = sheetKit;

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

const shuffled = ( list, rand ) => {
	const a = list.slice();
	for ( let i = a.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ a[ i ], a[ j ] ] = [ a[ j ], a[ i ] ];
	}
	return a;
};

/** A white sheet with its title. */
function paper( like, W, H ) {
	const c = makeCanvas( like, W, H );
	const g = c.getContext( '2d' );
	g.fillStyle = '#ffffff';
	g.fillRect( 0, 0, W, H );
	return { c, g };
}

/* ----------------------------- missing letters ---------------------------- */

/**
 * Words with some letters left out, to be filled in. The word keeps its
 * own spelling (Ä, É and Ñ stay, as on the anagram sheet), and a word
 * never loses all its letters.
 *
 * @param {Array}  words Word list.
 * @param {Object} opts  { seed, gaps (percent of letters left out) }.
 * @return {Object|null} { items: [ { word, hidden: [ index ] } ] }.
 */
export function buildMissingLetters( words, opts = {} ) {
	const rand = rng( ( opts.seed || 41 ) * 13 + 7 );
	const share = clamp( ( opts.gaps ?? 40 ) / 100, 0.15, 0.75 );
	const clean = Array.from(
		new Set(
			( words || [] )
				.map( ( w ) =>
					Array.from( String( w ).toUpperCase() )
						.filter( ( ch ) => /\p{L}/u.test( ch ) )
						.join( '' )
				)
				.filter( ( w ) => w.length >= 3 && w.length <= 16 )
		)
	).slice( 0, 12 );
	if ( ! clean.length ) {
		return null;
	}
	const items = clean.map( ( word ) => {
		const letters = Array.from( word );
		const count = clamp(
			Math.round( letters.length * share ),
			1,
			letters.length - 1
		);
		const hidden = shuffled(
			letters.map( ( _, i ) => i ),
			rand
		)
			.slice( 0, count )
			.sort( ( a, b ) => a - b );
		return { word, hidden };
	} );
	return { items };
}

/**
 * The missing-letters sheet, or its solution with the filled letters in
 * the solution color.
 *
 * @param {Object} like  Canvas-like.
 * @param {Object} model buildMissingLetters().
 * @param {Object} opts  Sheet options (title, colors, font, solution).
 * @return {HTMLCanvasElement}
 */
export function renderMissingLetters( like, model, opts = {} ) {
	const { items } = model;
	const BOX = 46;
	const GAP = 6;
	const M = 60;
	const NUM = 52;
	const tb = titleBlock( opts );
	const maxLen = Math.max(
		...items.map( ( it ) => Array.from( it.word ).length )
	);
	const rowH = BOX + 26;
	const W = Math.max( 720, M * 2 + NUM + maxLen * ( BOX + GAP ) );
	const H = tb.h + items.length * rowH + M * 2;
	const { c, g } = paper( like, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	const font = `700 ${ Math.round(
		BOX * 0.52 * tscale( opts )
	) }px ${ famFor( opts ) }`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	items.forEach( ( it, r ) => {
		const y = M + tb.h + r * rowH;
		g.fillStyle = accent;
		g.font = `700 ${ Math.round( 20 * tscale( opts ) ) }px ${ famFor(
			opts
		) }`;
		g.fillText( `${ r + 1 }.`, M + NUM / 2 - 6, y + BOX / 2 + 1 );
		Array.from( it.word ).forEach( ( ch, i ) => {
			const x = M + NUM + i * ( BOX + GAP );
			const gap = it.hidden.includes( i );
			g.fillStyle = gap ? '#ffffff' : '#f3f4f6';
			g.fillRect( x, y, BOX, BOX );
			g.strokeStyle = gap ? INK : 'rgba(0,0,0,0.25)';
			g.lineWidth = gap ? 2 : 1;
			g.strokeRect( x + 1, y + 1, BOX - 2, BOX - 2 );
			if ( ! gap || opts.solution ) {
				g.fillStyle = gap ? SOLVE : INK;
				g.font = font;
				g.fillText( ch, x + BOX / 2, y + BOX / 2 + 1 );
			}
		} );
	} );
	return c;
}

/* ------------------------------ magic squares ----------------------------- */

// The one 3 x 3 magic square of 1..9; every other is one of its eight
// turns and mirrors. With any evenly spaced numbers the same holds, which
// is what makes a unique solution checkable without a search.
const LO_SHU = [ 2, 7, 6, 9, 5, 1, 4, 3, 8 ];

/** The eight symmetries of a 3 x 3 grid, as index maps. */
const SYMMETRIES = ( () => {
	const rot = ( m ) => [ 6, 3, 0, 7, 4, 1, 8, 5, 2 ].map( ( i ) => m[ i ] );
	const flip = ( m ) => [ 2, 1, 0, 5, 4, 3, 8, 7, 6 ].map( ( i ) => m[ i ] );
	const out = [];
	let m = [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ];
	for ( let i = 0; i < 4; i++ ) {
		out.push( m, flip( m ) );
		m = rot( m );
	}
	return out;
} )();

export const MAGIC_RANGES = {
	small: [ 1, 1 ],
	even: [ 2, 2 ],
	teens: [ 11, 1 ],
	tens: [ 10, 10 ],
};

/**
 * Magic squares: fill the grid with the given numbers, each once, so that
 * every row, column and diagonal adds up to the same sum. The given cells
 * are chosen until exactly one of the eight possible squares fits them.
 *
 * @param {Object} opts { seed, count (1-6), range (MAGIC_RANGES key),
 *                        clues (2-5 given numbers) }.
 * @return {Object} { squares: [ { cells, given } ], sum, numbers }.
 */
export function buildMagicSquares( opts = {} ) {
	const rand = rng( ( opts.seed || 51 ) * 19 + 5 );
	const count = clamp( Math.round( opts.count || 4 ), 1, 6 );
	const [ start, step ] = MAGIC_RANGES[ opts.range ] || MAGIC_RANGES.small;
	const clues = clamp( Math.round( opts.clues || 3 ), 2, 5 );
	const value = ( n ) => start + ( n - 1 ) * step;
	const all = SYMMETRIES.map( ( map ) =>
		map.map( ( i ) => value( LO_SHU[ i ] ) )
	);
	const squares = [];
	// Every square of a sheet is a different turn or mirror: there are
	// only eight, and drawing them at random dealt the same one twice.
	const deal = shuffled( all, rand );
	for ( let s = 0; s < count; s++ ) {
		const cells = deal[ s ];
		const order = shuffled( [ 0, 1, 2, 3, 4, 5, 6, 7, 8 ], rand );
		const given = [];
		for ( const i of order ) {
			const fits = all.filter( ( sq ) =>
				given.every( ( k ) => sq[ k ] === cells[ k ] )
			).length;
			if ( given.length >= clues && 1 === fits ) {
				break;
			}
			// The centre is the same in every square; it says nothing.
			if ( 4 === i ) {
				continue;
			}
			given.push( i );
		}
		squares.push( { cells, given: given.sort( ( a, b ) => a - b ) } );
	}
	return {
		squares,
		sum: 3 * value( 5 ),
		numbers: Array.from( { length: 9 }, ( _, i ) => value( i + 1 ) ),
	};
}

/**
 * How many of the possible squares agree with a square's given cells -
 * one, for every square buildMagicSquares makes.
 *
 * @param {Object} model buildMagicSquares().
 * @param {number} k     Which square.
 * @return {number} Number of solutions.
 */
export function magicSolutions( model, k ) {
	const { cells, given } = model.squares[ k ];
	const base = Math.min( ...model.numbers );
	const step = model.numbers[ 1 ] - model.numbers[ 0 ];
	return SYMMETRIES.map( ( map ) =>
		map.map( ( i ) => base + ( LO_SHU[ i ] - 1 ) * step )
	).filter( ( sq ) => given.every( ( i ) => sq[ i ] === cells[ i ] ) ).length;
}

/**
 * The magic squares sheet (or its solution): the sum each line must make,
 * the numbers to use, and the grids with their given cells.
 *
 * @param {Object} like  Canvas-like.
 * @param {Object} model buildMagicSquares().
 * @param {Object} opts  Sheet options and labels { sum, use }.
 * @return {HTMLCanvasElement}
 */
export function renderMagicSquares( like, model, opts = {} ) {
	const L = opts.labels || {};
	const CELL = 74;
	const SQ = CELL * 3;
	const M = 60;
	const cols = model.squares.length > 1 ? 2 : 1;
	const rows = Math.ceil( model.squares.length / cols );
	const gapX = 90;
	const blockH = SQ + 70;
	const tb = titleBlock( opts );
	const headH = 96;
	const W = Math.max( 720, M * 2 + cols * SQ + ( cols - 1 ) * gapX );
	const H = tb.h + headH + rows * blockH + M * 2;
	const { c, g } = paper( like, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	const ink = hintInk( opts );
	const fam = famFor( opts );
	// Head: the sum and the numbers to use.
	let y = M + tb.h;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillStyle = accent;
	g.font = `700 ${ Math.round( 24 * tscale( opts ) ) }px ${ fam }`;
	g.fillText(
		`${ L.sum || 'Every line adds up to' } ${ model.sum }`,
		W / 2,
		y + 16
	);
	g.fillStyle = INK;
	g.font = `600 ${ Math.round( 18 * tscale( opts ) ) }px ${ fam }`;
	g.fillText(
		`${ L.use || 'Use each number once' }: ${ model.numbers.join( '  ' ) }`,
		W / 2,
		y + 54
	);
	y += headH;
	const left = ( W - ( cols * SQ + ( cols - 1 ) * gapX ) ) / 2;
	model.squares.forEach( ( sq, k ) => {
		const x0 = left + ( k % cols ) * ( SQ + gapX );
		const y0 = y + Math.floor( k / cols ) * blockH + 30;
		g.fillStyle = accent;
		g.font = `700 ${ Math.round( 18 * tscale( opts ) ) }px ${ fam }`;
		g.textAlign = 'left';
		g.fillText( `${ k + 1 }.`, x0, y0 - 16 );
		g.textAlign = 'center';
		for ( let i = 0; i < 9; i++ ) {
			const cx = x0 + ( i % 3 ) * CELL;
			const cy = y0 + Math.floor( i / 3 ) * CELL;
			const given = sq.given.includes( i );
			g.fillStyle = given ? '#f3f4f6' : '#ffffff';
			g.fillRect( cx, cy, CELL, CELL );
			if ( given || opts.solution ) {
				g.fillStyle = given ? ink : SOLVE;
				g.font = `700 ${ Math.round( CELL * 0.44 ) }px ${ fam }`;
				g.fillText(
					String( sq.cells[ i ] ),
					cx + CELL / 2,
					cy + CELL / 2 + 1
				);
			}
		}
		g.strokeStyle = INK;
		g.lineWidth = 1.5;
		for ( let i = 1; i < 3; i++ ) {
			g.beginPath();
			g.moveTo( x0 + i * CELL, y0 );
			g.lineTo( x0 + i * CELL, y0 + SQ );
			g.moveTo( x0, y0 + i * CELL );
			g.lineTo( x0 + SQ, y0 + i * CELL );
			g.stroke();
		}
		g.strokeStyle = accent;
		g.lineWidth = 3.5;
		g.strokeRect( x0, y0, SQ, SQ );
	} );
	return c;
}

/* ------------------------------- game sheets ------------------------------ */

export const MORE_GAMES = [ 'hangman', 'tictactoe', 'codebreaker' ];

/** Letters to cross off, in the language's own alphabet. */
export const ALPHABETS = {
	de: 'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ',
	es: 'ABCDEFGHIJKLMNÑOPQRSTUVWXYZ',
};

/**
 * Hangman: four rounds per sheet, each with room for the drawing, a line
 * of letter dashes and the alphabet to cross off.
 */
function hangman( like, opts ) {
	const L = opts.labels || {};
	const M = 56;
	const tb = titleBlock( opts );
	const PW = 420;
	const PH = 400;
	const GAP = 32;
	const W = M * 2 + PW * 2 + GAP;
	const H = tb.h + M * 2 + PH * 2 + GAP;
	const { c, g } = paper( like, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	const fam = famFor( opts );
	const letters = Array.from( opts.alphabet || 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' );
	for ( let k = 0; k < 4; k++ ) {
		const x0 = M + ( k % 2 ) * ( PW + GAP );
		const y0 = M + tb.h + Math.floor( k / 2 ) * ( PH + GAP );
		g.strokeStyle = accent;
		g.lineWidth = 2.5;
		g.strokeRect( x0, y0, PW, PH );
		g.fillStyle = accent;
		g.font = `700 ${ Math.round( 17 * tscale( opts ) ) }px ${ fam }`;
		g.textAlign = 'left';
		g.textBaseline = 'middle';
		g.fillText( `${ L.round || 'Round' } ${ k + 1 }`, x0 + 16, y0 + 22 );
		// The drawing goes here: a dotted ground line to start from.
		g.strokeStyle = 'rgba(0,0,0,0.35)';
		g.lineWidth = 1.5;
		g.setLineDash( [ 4, 6 ] );
		g.beginPath();
		g.moveTo( x0 + 40, y0 + 200 );
		g.lineTo( x0 + PW - 40, y0 + 200 );
		g.stroke();
		g.setLineDash( [] );
		// Letter dashes for the word.
		const dash = 24;
		const dashes = 12;
		const dx = x0 + ( PW - dashes * ( dash + 8 ) ) / 2;
		g.strokeStyle = INK;
		g.lineWidth = 2;
		for ( let i = 0; i < dashes; i++ ) {
			g.beginPath();
			g.moveTo( dx + i * ( dash + 8 ), y0 + 262 );
			g.lineTo( dx + i * ( dash + 8 ) + dash, y0 + 262 );
			g.stroke();
		}
		// The alphabet to cross off.
		const per = Math.ceil( letters.length / 2 );
		const step = ( PW - 32 ) / per;
		g.fillStyle = INK;
		g.font = `600 ${ Math.round( 17 * tscale( opts ) ) }px ${ fam }`;
		g.textAlign = 'center';
		letters.forEach( ( ch, i ) => {
			g.fillText(
				ch,
				x0 + 16 + step * ( ( i % per ) + 0.5 ),
				y0 + 310 + Math.floor( i / per ) * 34
			);
		} );
	}
	return c;
}

/** Tic-tac-toe: twelve boards and a score line. */
function ticTacToe( like, opts ) {
	const L = opts.labels || {};
	const M = 56;
	const tb = titleBlock( opts );
	const B = 210;
	const GAP = 56;
	const cols = 3;
	const rows = 4;
	const W = M * 2 + cols * B + ( cols - 1 ) * GAP;
	const H = tb.h + M * 2 + rows * B + ( rows - 1 ) * GAP + 70;
	const { c, g } = paper( like, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	g.strokeStyle = accent;
	g.lineWidth = 5;
	g.lineCap = 'round';
	for ( let k = 0; k < cols * rows; k++ ) {
		const x0 = M + ( k % cols ) * ( B + GAP );
		const y0 = M + tb.h + Math.floor( k / cols ) * ( B + GAP );
		g.beginPath();
		for ( let i = 1; i < 3; i++ ) {
			g.moveTo( x0 + ( i * B ) / 3, y0 + 8 );
			g.lineTo( x0 + ( i * B ) / 3, y0 + B - 8 );
			g.moveTo( x0 + 8, y0 + ( i * B ) / 3 );
			g.lineTo( x0 + B - 8, y0 + ( i * B ) / 3 );
		}
		g.stroke();
	}
	const sy = H - M - 20;
	g.fillStyle = INK;
	g.font = `700 ${ Math.round( 20 * tscale( opts ) ) }px ${ famFor( opts ) }`;
	g.textAlign = 'left';
	g.textBaseline = 'middle';
	g.fillText( `X: ${ L.wins || 'Wins' }`, M, sy );
	g.fillText( `O: ${ L.wins || 'Wins' }`, W / 2, sy );
	g.strokeStyle = 'rgba(0,0,0,0.5)';
	g.lineWidth = 1.6;
	g.lineCap = 'butt';
	for ( const x of [ M + 120, W / 2 + 120 ] ) {
		g.beginPath();
		g.moveTo( x, sy + 12 );
		g.lineTo( x + 160, sy + 12 );
		g.stroke();
	}
	return c;
}

/**
 * Code breaker: one player hides a code of four colors, the other has ten
 * rows to find it; the small dots answer each guess.
 */
function codeBreaker( like, opts ) {
	const L = opts.labels || {};
	const M = 56;
	const tb = titleBlock( opts );
	const R = 22;
	const rowH = 64;
	const rows = 10;
	const keyH = 150;
	const W = 760;
	const H = tb.h + M * 2 + 110 + rows * rowH + keyH;
	const { c, g } = paper( like, W, H );
	drawTitle( g, tb, opts, W / 2, M - 16 );
	const accent = accentOf( opts );
	const fam = famFor( opts );
	const x0 = M + 70;
	const pegs = ( y, filled ) => {
		for ( let i = 0; i < 4; i++ ) {
			g.beginPath();
			g.arc( x0 + i * ( R * 2 + 18 ) + R, y, R, 0, Math.PI * 2 );
			g.fillStyle = filled ? '#e9ebee' : '#ffffff';
			g.fill();
			g.strokeStyle = INK;
			g.lineWidth = 2;
			g.stroke();
		}
	};
	// The hidden code, to be covered with a folded strip.
	let y = M + tb.h;
	g.fillStyle = accent;
	g.font = `700 ${ Math.round( 18 * tscale( opts ) ) }px ${ fam }`;
	g.textAlign = 'left';
	g.textBaseline = 'middle';
	g.fillText( L.secret || 'The code (cover it)', M, y + 14 );
	pegs( y + 60, true );
	g.strokeStyle = accent;
	g.lineWidth = 2;
	g.setLineDash( [ 8, 6 ] );
	g.strokeRect( x0 - 16, y + 30, 4 * ( R * 2 + 18 ) + 14, 60 );
	g.setLineDash( [] );
	y += 110;
	for ( let r = 0; r < rows; r++ ) {
		const cy = y + r * rowH + rowH / 2;
		g.fillStyle = '#6a7078';
		g.font = `600 ${ Math.round( 16 * tscale( opts ) ) }px ${ fam }`;
		g.textAlign = 'right';
		g.fillText( String( rows - r ), x0 - 26, cy );
		pegs( cy, false );
		const fx = x0 + 4 * ( R * 2 + 18 ) + 40;
		for ( let i = 0; i < 4; i++ ) {
			g.beginPath();
			g.arc(
				fx + ( i % 2 ) * 22,
				cy - 11 + Math.floor( i / 2 ) * 22,
				7,
				0,
				Math.PI * 2
			);
			g.strokeStyle = INK;
			g.lineWidth = 1.5;
			g.stroke();
		}
		g.strokeStyle = 'rgba(0,0,0,0.12)';
		g.lineWidth = 1;
		g.beginPath();
		g.moveTo( M, cy + rowH / 2 );
		g.lineTo( W - M, cy + rowH / 2 );
		g.stroke();
	}
	// Key: what the small dots mean, and the colors to use.
	const ky = y + rows * rowH + 34;
	g.textAlign = 'left';
	g.font = `600 ${ Math.round( 16 * tscale( opts ) ) }px ${ fam }`;
	g.fillStyle = INK;
	g.beginPath();
	g.arc( M + 8, ky, 7, 0, Math.PI * 2 );
	g.fill();
	g.fillText( L.exact || 'Right color, right place', M + 26, ky );
	g.beginPath();
	g.arc( M + 8, ky + 34, 7, 0, Math.PI * 2 );
	g.lineWidth = 1.5;
	g.strokeStyle = INK;
	g.stroke();
	g.fillText( L.near || 'Right color, wrong place', M + 26, ky + 34 );
	const colors = [
		'#e03131',
		'#f08c00',
		'#fcc419',
		'#2f9e44',
		'#1971c2',
		'#9c36b5',
	];
	g.fillText( L.colors || 'Colors', M, ky + 80 );
	const cx0 = M + 120;
	colors.forEach( ( col, i ) => {
		g.beginPath();
		g.arc( cx0 + i * 56, ky + 80, 16, 0, Math.PI * 2 );
		g.fillStyle = col;
		g.fill();
		g.strokeStyle = INK;
		g.lineWidth = 1.5;
		g.stroke();
	} );
	return c;
}

/**
 * The new game sheets.
 *
 * @param {Object} like Canvas-like.
 * @param {Object} opts { game (MORE_GAMES), alphabet, labels, title,
 *                        colors, font, textScale }.
 * @return {HTMLCanvasElement}
 */
export function renderMoreGame( like, opts = {} ) {
	if ( 'tictactoe' === opts.game ) {
		return ticTacToe( like, opts );
	}
	if ( 'codebreaker' === opts.game ) {
		return codeBreaker( like, opts );
	}
	return hangman( like, opts );
}
