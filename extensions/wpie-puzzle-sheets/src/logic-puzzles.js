/** Deterministic printable logic puzzles; uniqueness checks fail closed. */
import { rng } from './puzzle-engine.js';

const shuffle = ( items, rand ) => {
	const out = items.slice();
	for ( let i = out.length - 1; i > 0; i-- ) {
		const j = Math.floor( rand() * ( i + 1 ) );
		[ out[ i ], out[ j ] ] = [ out[ j ], out[ i ] ];
	}
	return out;
};
const difficulty = ( value ) =>
	Math.max( 1, Math.min( 3, Math.round( Number( value ) || 2 ) ) );

/** Bounded MRV search. A budget hit is never evidence of uniqueness. */
function search( input, blank, candidates, limit = 2, budget = 30000 ) {
	const grid = input.slice();
	let count = 0;
	let nodes = 0;
	let exhausted = false;
	let solution = null;
	for ( let i = 0; i < grid.length; i++ ) {
		if ( grid[ i ] === blank ) {
			continue;
		}
		const value = grid[ i ];
		grid[ i ] = blank;
		const valid = candidates( grid, i ).includes( value );
		grid[ i ] = value;
		if ( ! valid ) {
			return { count: 0, exhausted: false, solution: null };
		}
	}
	const visit = () => {
		if ( count >= limit || exhausted ) {
			return;
		}
		if ( ++nodes > budget ) {
			exhausted = true;
			return;
		}
		let at = -1;
		let choices = null;
		for ( let i = 0; i < grid.length; i++ ) {
			if ( grid[ i ] !== blank ) {
				continue;
			}
			const values = candidates( grid, i );
			if ( ! values.length ) {
				return;
			}
			if ( ! choices || values.length < choices.length ) {
				at = i;
				choices = values;
			}
		}
		if ( -1 === at ) {
			count++;
			solution = grid.slice();
			return;
		}
		for ( const value of choices ) {
			grid[ at ] = value;
			visit();
			if ( count >= limit || exhausted ) {
				break;
			}
		}
		grid[ at ] = blank;
	};
	visit();
	return { count, exhausted, solution };
}

function removeClues( solution, blank, rand, diff, solve ) {
	const puzzle = solution.slice();
	const target = Math.ceil( puzzle.length * [ 0, 0.55, 0.42, 0.3 ][ diff ] );
	let givens = puzzle.length;
	for ( const i of shuffle( Array.from( puzzle.keys() ), rand ) ) {
		if ( givens <= target ) {
			break;
		}
		const saved = puzzle[ i ];
		puzzle[ i ] = blank;
		const result = solve( puzzle );
		if ( result.count === 1 && ! result.exhausted ) {
			givens--;
		} else {
			puzzle[ i ] = saved;
		}
	}
	return puzzle;
}

/* Binary: balanced rows/columns, no triples, no identical full lines. */
function binaryCandidates( grid, size, at ) {
	const row = Math.floor( at / size );
	const col = at % size;
	const allowed = [];
	for ( const value of [ 0, 1 ] ) {
		grid[ at ] = value;
		let valid = true;
		for ( const vertical of [ false, true ] ) {
			const index = vertical ? col : row;
			const get = ( line, k ) =>
				grid[ vertical ? k * size + line : line * size + k ];
			const line = Array.from( { length: size }, ( _, k ) =>
				get( index, k )
			);
			if (
				line.filter( ( v ) => v === 0 ).length > size / 2 ||
				line.filter( ( v ) => v === 1 ).length > size / 2
			) {
				valid = false;
			}
			for ( let k = 2; k < size; k++ ) {
				if (
					line[ k ] !== -1 &&
					line[ k ] === line[ k - 1 ] &&
					line[ k ] === line[ k - 2 ]
				) {
					valid = false;
				}
			}
			if ( ! line.includes( -1 ) ) {
				for ( let other = 0; other < size; other++ ) {
					if (
						other !== index &&
						line.every( ( v, k ) => v === get( other, k ) )
					) {
						valid = false;
					}
				}
			}
		}
		if ( valid ) {
			allowed.push( value );
		}
	}
	grid[ at ] = -1;
	return allowed;
}

export function solveBinary( puzzle, size, budget = 30000 ) {
	return search(
		puzzle,
		-1,
		( grid, at ) => binaryCandidates( grid, size, at ),
		2,
		budget
	);
}

export function buildBinary( opts = {} ) {
	const size = [ 4, 6, 8 ].includes( opts.size ) ? opts.size : 6;
	const rand = rng( ( opts.seed || 7 ) * 31 + size );
	// Shuffle candidate order once per cell, so search remains deterministic.
	const orders = Array.from( { length: size * size }, () =>
		rand() < 0.5 ? [ 0, 1 ] : [ 1, 0 ]
	);
	const filled = search(
		Array( size * size ).fill( -1 ),
		-1,
		( grid, at ) => {
			const allowed = binaryCandidates( grid, size, at );
			return orders[ at ].filter( ( value ) =>
				allowed.includes( value )
			);
		},
		1,
		100000
	);
	if ( ! filled.solution || filled.exhausted ) {
		return null;
	}
	const solution = filled.solution;
	const puzzle = removeClues(
		solution,
		-1,
		rand,
		difficulty( opts.diff ),
		( grid ) => solveBinary( grid, size )
	);
	return { size, puzzle, solution };
}

/* Inequality grid: each number 1..size appears once per row and column. */
function inequalityCandidates( grid, size, signs, at ) {
	const row = Math.floor( at / size );
	const col = at % size;
	const values = [];
	for ( let value = 1; value <= size; value++ ) {
		let valid = true;
		for ( let k = 0; k < size; k++ ) {
			if (
				grid[ row * size + k ] === value ||
				grid[ k * size + col ] === value
			) {
				valid = false;
			}
		}
		for ( const { low, high } of signs ) {
			if (
				( low === at &&
					( value === size ||
						( grid[ high ] && value >= grid[ high ] ) ) ) ||
				( high === at &&
					( value === 1 || ( grid[ low ] && value <= grid[ low ] ) ) )
			) {
				valid = false;
			}
		}
		if ( valid ) {
			values.push( value );
		}
	}
	return values;
}

export function solveInequality( puzzle, size, signs, budget = 30000 ) {
	return search(
		puzzle,
		0,
		( grid, at ) => inequalityCandidates( grid, size, signs, at ),
		2,
		budget
	);
}

export function buildInequality( opts = {} ) {
	const size = [ 4, 5, 6 ].includes( opts.size ) ? opts.size : 5;
	const rand = rng( ( opts.seed || 7 ) * 43 + size );
	const indices = Array.from( { length: size }, ( _, i ) => i );
	const rows = shuffle( indices, rand );
	const cols = shuffle( indices, rand );
	const symbols = shuffle(
		indices.map( ( i ) => i + 1 ),
		rand
	);
	const solution = rows.flatMap( ( r ) =>
		cols.map( ( c ) => symbols[ ( r + c ) % size ] )
	);
	const edges = [];
	for ( let i = 0; i < size * size; i++ ) {
		for ( const next of [
			i % size < size - 1 ? i + 1 : -1,
			i + size < size * size ? i + size : -1,
		] ) {
			if ( next >= 0 ) {
				edges.push(
					solution[ i ] < solution[ next ]
						? { low: i, high: next }
						: { low: next, high: i }
				);
			}
		}
	}
	const signs = shuffle( edges, rand ).slice(
		0,
		Math.ceil( edges.length * 0.4 )
	);
	const puzzle = removeClues(
		solution,
		0,
		rand,
		difficulty( opts.diff ),
		( grid ) => solveInequality( grid, size, signs )
	);
	return { size, signs, puzzle, solution };
}

/* Arithmetic chains: every step has a single integer answer, left to right. */
export function buildMathChains( opts = {} ) {
	const rand = rng( ( opts.seed || 7 ) * 59 );
	const diff = difficulty( opts.diff );
	const rows = Math.max(
		4,
		Math.min( 12, Math.round( Number( opts.rows ) || 8 ) )
	);
	const steps = Math.max(
		3,
		Math.min( 6, Math.round( Number( opts.steps ) || 4 ) )
	);
	const max = [ 0, 30, 100, 200 ][ diff ];
	const chains = [];
	for ( let row = 0; row < rows; row++ ) {
		let value = 2 + Math.floor( rand() * ( diff === 1 ? 12 : 25 ) );
		const values = [ value ];
		const operations = [];
		for ( let step = 0; step < steps; step++ ) {
			const candidates = [];
			for (
				let operand = 2;
				operand <= ( diff === 1 ? 9 : 12 );
				operand++
			) {
				if ( value + operand <= max )
					candidates.push( {
						op: '+',
						operand,
						answer: value + operand,
					} );
				if ( value - operand >= 1 )
					candidates.push( {
						op: '−',
						operand,
						answer: value - operand,
					} );
				if ( diff >= 2 && value * operand <= max )
					candidates.push( {
						op: '×',
						operand,
						answer: value * operand,
					} );
				if ( diff >= 3 && value % operand === 0 )
					candidates.push( {
						op: '÷',
						operand,
						answer: value / operand,
					} );
			}
			const choice =
				candidates[ Math.floor( rand() * candidates.length ) ];
			operations.push( { op: choice.op, operand: choice.operand } );
			value = choice.answer;
			values.push( value );
		}
		chains.push( { values, operations } );
	}
	return { rows, steps, chains };
}
