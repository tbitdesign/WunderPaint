/** Figure-wide definitions. References are resolved without eval and without mutating saved input. */
import {
	parse,
	evaluate,
	toLatex,
	variablesOf,
	FUNCTION_NAMES,
} from './expr.js';
import { PALETTE } from './plot.js';

export const formatNumber = ( n ) =>
	Number.isFinite( n ) ? String( Number( n.toPrecision( 7 ) ) ) : 'undefined';
export function sharedModel( math = {}, t = ( s ) => s ) {
	const params = Object.fromEntries(
		[ 'a', 'b', 'c' ].map( ( k ) => [
			k,
			Number.isFinite( math[ k ] ) ? math[ k ] : 1,
		] )
	);
	const functions = new Map();
	const warnings = [];
	for ( const d of ( math.definitions || [] ).slice( 0, 24 ) ) {
		try {
			if (
				! /^[A-Za-z][A-Za-z0-9_]*$/.test( d.name ) ||
				FUNCTION_NAMES.includes( d.name ) ||
				[ 'pi', 'e' ].includes( d.name )
			)
				throw new Error( t( 'Invalid function name' ) );
			if ( functions.has( d.name ) )
				throw new Error( t( 'Duplicate function name' ) );
			const ast = parse( d.expression );
			if (
				[ ...variablesOf( ast ) ].some(
					( k ) => ! [ 'x', 'a', 'b', 'c' ].includes( k )
				)
			)
				throw new Error( t( 'Use x and the parameters a, b, c.' ) );
			const color = /^#[0-9a-f]{6}$/i.test( d.color )
				? d.color
				: PALETTE[ functions.size % PALETTE.length ];
			functions.set( d.name, {
				...d,
				ast,
				color,
				value: ( x ) => evaluate( ast, { ...params, x } ),
			} );
		} catch ( e ) {
			warnings.push( `${ d.name || '?' }: ${ e.message }` );
		}
	}
	return { functions, params, warnings };
}
const substitute = ( expression, params ) =>
	expression.replace( /\b[abc]\b/g, ( k ) => `(${ params[ k ] })` );
export function bindFigure( p, t = ( s ) => s ) {
	const model = sharedModel( p.math, t );
	const warnings = [ ...model.warnings ];
	const ref = ( str, latex = false ) =>
		String( str || '' ).replace(
			/\[\[([A-Za-z]\w*)(?:\(([^\]]*)\))?\]\]/g,
			( raw, name, arg ) => {
				const f = model.functions.get( name );
				if (
					! f &&
					arg === undefined &&
					Object.hasOwn( model.params, name )
				)
					return formatNumber( model.params[ name ] );
				if ( ! f ) {
					warnings.push(
						t( 'Unknown shared function' ) + ': ' + name
					);
					return raw;
				}
				if ( arg !== undefined ) {
					try {
						const n = f.value(
							evaluate( parse( arg ), model.params )
						);
						if ( ! Number.isFinite( n ) ) throw new Error();
						return formatNumber( n );
					} catch {
						warnings.push(
							t( 'Undefined function value' ) + ': ' + raw
						);
						return '?';
					}
				}
				const s = `${ name }(x)=${ toLatex( f.ast ) }`;
				return latex ? s : '$' + s + '$';
			}
		);
	const blocks = p.blocks.map( ( original ) => {
		const b = { ...original };
		if ( b.source ) {
			const list =
				b.source === '*'
					? [ ...model.functions.values() ]
					: [ model.functions.get( b.source ) ].filter( Boolean );
			if ( ! list.length )
				warnings.push(
					t( 'Unknown shared function' ) + ': ' + b.source
				);
			const first = list[ 0 ];
			if ( [ 'graph', 'analysis' ].includes( b.type ) ) {
				b.functions =
					list
						.map(
							( f ) =>
								`${ f.name }(x) = ${ f.expression } color ${ f.color }`
						)
						.join( '\n' ) +
					( b.functions ? '\n' + b.functions : '' );
				if (
					b.type === 'analysis' &&
					b.other &&
					! list.some( ( f ) => f.name === b.other )
				) {
					const other = model.functions.get( b.other );
					if ( other )
						b.functions += `\n${ other.name }(x) = ${ other.expression } color ${ other.color }`;
					else
						warnings.push(
							t( 'Unknown shared function' ) + ': ' + b.other
						);
				}
				b.pa = model.params.a;
				b.pb = model.params.b;
				b.pc = model.params.c;
			} else if ( b.type === 'formula' ) {
				b.latex = first
					? `${ first.name }(x)=${ toLatex( first.ast ) }`
					: '';
			} else if ( b.type === 'table' ) {
				b.table = first
					? `values ${ first.name }(x) = ${ substitute(
							first.expression,
							model.params
					  ) }; x = ${ b.tableFrom }..${ b.tableTo } step ${
							b.tableStep
					  } vertical`
					: '';
			}
		}
		for ( const k of [ 'text', 'latex', 'heading' ] )
			if ( b[ k ] ) b[ k ] = ref( b[ k ], k === 'latex' );
		return b;
	} );
	return {
		...p,
		head: Object.fromEntries(
			Object.entries( p.head ).map( ( [ k, v ] ) => [ k, ref( v ) ] )
		),
		foot: Object.fromEntries(
			Object.entries( p.foot ).map( ( [ k, v ] ) => [ k, ref( v ) ] )
		),
		blocks,
		bindingWarnings: warnings,
	};
}
