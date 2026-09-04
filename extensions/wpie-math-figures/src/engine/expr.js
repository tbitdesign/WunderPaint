/**
 * Expressions for the graph card: a small parser (numbers, variables,
 * + - * / ^, unary minus, implicit multiplication, functions), an
 * evaluator and a LaTeX printer for legends. Pure, no DOM.
 *
 *   compile('x^2 - 2x')( { x: 3 } ) -> 3
 *   toLatex( parse( '1/x' ) )        -> '\\frac{1}{x}'
 */
const FUNCS = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	exp: Math.exp,
	ln: Math.log,
	log: Math.log10,
	log2: Math.log2,
	log10: Math.log10,
	sqrt: Math.sqrt,
	abs: Math.abs,
	floor: Math.floor,
	ceil: Math.ceil,
	round: Math.round,
	sign: Math.sign,
	min: Math.min,
	max: Math.max,
	cbrt: Math.cbrt,
};
const LATEX_FUNCS = {
	sin: '\\sin',
	cos: '\\cos',
	tan: '\\tan',
	asin: '\\arcsin',
	acos: '\\arccos',
	atan: '\\arctan',
	sinh: '\\sinh',
	cosh: '\\cosh',
	tanh: '\\tanh',
	exp: '\\exp',
	ln: '\\ln',
	log: '\\log',
	log2: '\\log_{2}',
	log10: '\\log_{10}',
	min: '\\min',
	max: '\\max',
	sign: '\\operatorname{sgn}',
	floor: '\\lfloor',
	ceil: '\\lceil',
	round: '\\operatorname{round}',
};
const CONSTS = { pi: Math.PI, e: Math.E };

export class ExprError extends Error {
	constructor( message, at ) {
		super( message );
		this.at = at;
	}
}

/* ---------------------------------- lexer ---------------------------------- */

function lex( src ) {
	const toks = [];
	let i = 0;
	const s = String( src );
	while ( i < s.length ) {
		const c = s[ i ];
		if ( /\s/.test( c ) ) {
			i++;
			continue;
		}
		if ( /[0-9.]/.test( c ) ) {
			const m = /^(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec( s.slice( i ) );
			if ( ! m ) {
				throw new ExprError( 'Bad number', i );
			}
			toks.push( { t: 'num', v: parseFloat( m[ 0 ] ), at: i } );
			i += m[ 0 ].length;
			continue;
		}
		if ( /[a-zA-Zπθ_]/.test( c ) ) {
			const m = /^[a-zA-Zπθ_][a-zA-Z0-9_]*/.exec( s.slice( i ) );
			toks.push( { t: 'id', v: m[ 0 ], at: i } );
			i += m[ 0 ].length;
			continue;
		}
		if ( '+-*/^(),'.includes( c ) ) {
			toks.push( { t: c, at: i } );
			i++;
			continue;
		}
		if ( '·×' === c || '·' === c || '×' === c ) {
			toks.push( { t: '*', at: i } );
			i++;
			continue;
		}
		throw new ExprError( 'Unexpected character ' + c, i );
	}
	return toks;
}

/* --------------------------------- parser --------------------------------- */

/**
 * Identifiers: a known function name followed by "(" is a call; a known
 * constant is a constant; anything else is a variable. A long unknown
 * word like "xy" splits into x*y when every letter is a variable.
 */
export function parse( src, opts = {} ) {
	const toks = lex( src );
	let p = 0;
	const peek = () => toks[ p ];
	const next = () => toks[ p++ ];
	const vars = new Set( [
		'x',
		't',
		'a',
		'b',
		'c',
		'k',
		'n',
		'm',
		'θ',
		'y',
		...( opts.vars || [] ),
	] );

	function primary() {
		const tk = next();
		if ( ! tk ) {
			throw new ExprError( 'Unexpected end', src.length );
		}
		if ( 'num' === tk.t ) {
			return { k: 'num', v: tk.v };
		}
		if ( '(' === tk.t ) {
			const e = expr();
			const close = next();
			if ( ! close || ')' !== close.t ) {
				throw new ExprError(
					'Missing )',
					close ? close.at : src.length
				);
			}
			return { k: 'group', e };
		}
		if ( '-' === tk.t ) {
			return { k: 'neg', e: unary() };
		}
		if ( '+' === tk.t ) {
			return unary();
		}
		if ( 'id' === tk.t ) {
			const name = tk.v;
			if ( FUNCS[ name ] && peek() && '(' === peek().t ) {
				next();
				const args = [ expr() ];
				while ( peek() && ',' === peek().t ) {
					next();
					args.push( expr() );
				}
				const close = next();
				if ( ! close || ')' !== close.t ) {
					throw new ExprError(
						'Missing )',
						close ? close.at : src.length
					);
				}
				return { k: 'call', f: name, args };
			}
			if ( FUNCS[ name ] ) {
				// sin x  (no parentheses): applies to the next factor
				return { k: 'call', f: name, args: [ power() ] };
			}
			if ( 'pi' === name || 'π' === name ) {
				return { k: 'const', v: 'pi' };
			}
			if ( 'e' === name ) {
				return { k: 'const', v: 'e' };
			}
			if ( 'theta' === name || 'θ' === name ) {
				return { k: 'var', v: 't' };
			}
			if ( vars.has( name ) ) {
				return { k: 'var', v: name };
			}
			// Split "xy" or "2ab" style words into a product of variables.
			const parts = name.split( '' );
			if ( parts.every( ( ch ) => vars.has( ch ) || 'e' === ch ) ) {
				return parts
					.map( ( ch ) =>
						'e' === ch
							? { k: 'const', v: 'e' }
							: { k: 'var', v: ch }
					)
					.reduce( ( acc, n ) => ( {
						k: 'mul',
						a: acc,
						b: n,
						implicit: true,
					} ) );
			}
			throw new ExprError( 'Unknown name ' + name, tk.at );
		}
		throw new ExprError( 'Unexpected ' + tk.t, tk.at );
	}

	function postfix() {
		const base = primary();
		return base;
	}

	function power() {
		const base = postfix();
		if ( peek() && '^' === peek().t ) {
			next();
			// Right associative; the exponent may carry a sign.
			const ex = unary();
			return { k: 'pow', a: base, b: ex };
		}
		return base;
	}

	function unary() {
		if ( peek() && '-' === peek().t ) {
			next();
			return { k: 'neg', e: unary() };
		}
		return power();
	}

	/** Implicit multiplication: number/var/group followed by var/group/function. */
	function implicitChain() {
		let node = unary();
		while (
			peek() &&
			( 'id' === peek().t ||
				'(' === peek().t ||
				( 'num' === peek().t && 'num' !== node.k ) )
		) {
			// "2 3" is not a product; a number after a number ends the chain.
			if ( 'num' === peek().t && 'num' === node.k ) {
				break;
			}
			const right = unary();
			node = { k: 'mul', a: node, b: right, implicit: true };
		}
		return node;
	}

	function term() {
		let node = implicitChain();
		while ( peek() && ( '*' === peek().t || '/' === peek().t ) ) {
			const op = next().t;
			const right = implicitChain();
			node = { k: '*' === op ? 'mul' : 'div', a: node, b: right };
		}
		return node;
	}

	function expr() {
		let node = term();
		while ( peek() && ( '+' === peek().t || '-' === peek().t ) ) {
			const op = next().t;
			const right = term();
			node = { k: '+' === op ? 'add' : 'sub', a: node, b: right };
		}
		return node;
	}

	const ast = expr();
	if ( p < toks.length ) {
		throw new ExprError(
			'Unexpected ' + ( toks[ p ].v || toks[ p ].t ),
			toks[ p ].at
		);
	}
	return ast;
}

/* -------------------------------- evaluate -------------------------------- */

export function evaluate( ast, env ) {
	switch ( ast.k ) {
		case 'num':
			return ast.v;
		case 'const':
			return CONSTS[ ast.v ];
		case 'var': {
			const v = env[ ast.v ];
			if ( undefined === v ) {
				throw new ExprError( 'Unknown variable ' + ast.v, 0 );
			}
			return v;
		}
		case 'group':
			return evaluate( ast.e, env );
		case 'neg':
			return -evaluate( ast.e, env );
		case 'add':
			return evaluate( ast.a, env ) + evaluate( ast.b, env );
		case 'sub':
			return evaluate( ast.a, env ) - evaluate( ast.b, env );
		case 'mul':
			return evaluate( ast.a, env ) * evaluate( ast.b, env );
		case 'div':
			return evaluate( ast.a, env ) / evaluate( ast.b, env );
		case 'pow':
			return Math.pow( evaluate( ast.a, env ), evaluate( ast.b, env ) );
		case 'call': {
			const f = FUNCS[ ast.f ];
			return f( ...ast.args.map( ( a ) => evaluate( a, env ) ) );
		}
		default:
			throw new ExprError( 'Bad node', 0 );
	}
}

/** A function of the variables: compile('x^2')({ x: 2 }) -> 4. */
export function compile( src, opts ) {
	const ast = parse( src, opts );
	return Object.assign( ( env ) => evaluate( ast, env ), { ast } );
}

/** Which variables the expression reads. */
export function variablesOf( ast, out = new Set() ) {
	if ( ! ast ) {
		return out;
	}
	if ( 'var' === ast.k ) {
		out.add( ast.v );
	}
	for ( const key of [ 'a', 'b', 'e' ] ) {
		if ( ast[ key ] ) {
			variablesOf( ast[ key ], out );
		}
	}
	for ( const a of ast.args || [] ) {
		variablesOf( a, out );
	}
	return out;
}

/* ---------------------------------- LaTeX ---------------------------------- */

const PREC = {
	add: 1,
	sub: 1,
	mul: 2,
	div: 2,
	neg: 3,
	pow: 4,
	num: 5,
	const: 5,
	var: 5,
	call: 5,
	group: 5,
};

function fmtNum( v ) {
	if ( Number.isInteger( v ) ) {
		return String( v );
	}
	return String( Math.round( v * 1e6 ) / 1e6 ).replace(
		'.',
		'{,}' === ( globalThis.__wpieDecimalComma ? '{,}' : '.' ) ? '{,}' : '.'
	);
}

export function toLatex( ast ) {
	switch ( ast.k ) {
		case 'num':
			return fmtNum( ast.v );
		case 'const':
			return 'pi' === ast.v ? '\\pi' : 'e';
		case 'var':
			return 't' === ast.v ? 't' : ast.v;
		case 'group':
			return '\\left(' + toLatex( ast.e ) + '\\right)';
		case 'neg':
			return '-' + wrap( ast.e, PREC.neg );
		case 'add':
			return toLatex( ast.a ) + '+' + toLatex( ast.b );
		case 'sub':
			return toLatex( ast.a ) + '-' + wrap( ast.b, PREC.sub + 1 );
		case 'mul': {
			const a = toLatex( ast.a );
			const b = toLatex( ast.b );
			const numNum = 'num' === ast.a.k && 'num' === ast.b.k;
			const needsDot =
				numNum ||
				'num' === ast.b.k ||
				( ! ast.implicit && 'num' === ast.a.k && 'num' === ast.b.k );
			return wrap( ast.a, PREC.mul ) +
				( needsDot ? '\\cdot ' : '' ) +
				wrap( ast.b, PREC.mul ) ===
				a + b && ! needsDot
				? a + b
				: wrap( ast.a, PREC.mul ) +
						( needsDot ? '\\cdot ' : '' ) +
						wrap( ast.b, PREC.mul );
		}
		case 'div':
			return (
				'\\frac{' +
				strip( toLatex( ast.a ) ) +
				'}{' +
				strip( toLatex( ast.b ) ) +
				'}'
			);
		case 'pow': {
			const base =
				'num' === ast.a.k ||
				'var' === ast.a.k ||
				'const' === ast.a.k ||
				'group' === ast.a.k
					? toLatex( ast.a )
					: '\\left(' + toLatex( ast.a ) + '\\right)';
			return base + '^{' + strip( toLatex( ast.b ) ) + '}';
		}
		case 'call': {
			if ( 'sqrt' === ast.f ) {
				return '\\sqrt{' + strip( toLatex( ast.args[ 0 ] ) ) + '}';
			}
			if ( 'cbrt' === ast.f ) {
				return '\\sqrt[3]{' + strip( toLatex( ast.args[ 0 ] ) ) + '}';
			}
			if ( 'abs' === ast.f ) {
				return '\\left|' + toLatex( ast.args[ 0 ] ) + '\\right|';
			}
			if ( 'floor' === ast.f ) {
				return '\\lfloor ' + toLatex( ast.args[ 0 ] ) + '\\rfloor';
			}
			if ( 'ceil' === ast.f ) {
				return '\\lceil ' + toLatex( ast.args[ 0 ] ) + '\\rceil';
			}
			if ( 'exp' === ast.f ) {
				return 'e^{' + strip( toLatex( ast.args[ 0 ] ) ) + '}';
			}
			const name =
				LATEX_FUNCS[ ast.f ] || '\\operatorname{' + ast.f + '}';
			const arg = ast.args.map( toLatex ).join( ',\\,' );
			const simple =
				1 === ast.args.length &&
				[ 'var', 'num', 'const' ].includes( ast.args[ 0 ].k );
			return name + ( simple ? ' ' + arg : '\\left(' + arg + '\\right)' );
		}
		default:
			return '';
	}
}

/** Parentheses when a child binds weaker than its parent. */
function wrap( node, minPrec ) {
	const s = toLatex( node );
	return PREC[ node.k ] < minPrec ? '\\left(' + s + '\\right)' : s;
}

/** Inside braces the outer \left( \right) of a group is noise. */
function strip( s ) {
	const m = /^\\left\((.*)\\right\)$/.exec( s );
	return m && balanced( m[ 1 ] ) ? m[ 1 ] : s;
}
function balanced( s ) {
	let d = 0;
	for ( let i = 0; i < s.length; i++ ) {
		if ( s.startsWith( '\\left(', i ) ) {
			d++;
		} else if ( s.startsWith( '\\right)', i ) ) {
			d--;
			if ( d < 0 ) {
				return false;
			}
		}
	}
	return 0 === d;
}

export const FUNCTION_NAMES = Object.keys( FUNCS );
