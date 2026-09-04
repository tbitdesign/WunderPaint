/**
 * Arithmetic in number fields (v1.429): "100+20", "*2", "/3", "(10+5)*2".
 * A field that starts with an operator works on its current value, the
 * way Figma's fields do. Only digits, the four operators, a decimal point
 * and parentheses are allowed; anything else is not a number.
 */

const SAFE = /^[\d\s+\-*/().,]+$/;

/**
 * @param {string} text    What was typed.
 * @param {number} current The field's current value, for a leading operator.
 * @return {?number} The result, or null when the text is not an expression.
 */
export function evalNumber( text, current = 0 ) {
	let s = String( text ?? '' )
		.trim()
		.replace( /,/g, '.' );
	if ( ! s ) {
		return null;
	}
	if (
		/^[*/]/.test( s ) ||
		( /^[+-]\s*[\d(]/.test( s ) === false && /^[+-]/.test( s ) )
	) {
		s = `${ Number( current ) || 0 }${ s }`;
	} else if ( /^[+-]/.test( s ) && /[+\-*/]/.test( s.slice( 1 ) ) ) {
		// "+10-5" reads as current + 10 - 5, a bare "-5" stays -5.
		s = `${ Number( current ) || 0 }${ s }`;
	}
	if ( ! SAFE.test( s ) ) {
		return null;
	}
	// Balanced parentheses and no operator runs like "**".
	let depth = 0;
	for ( const ch of s ) {
		if ( '(' === ch ) {
			depth++;
		} else if ( ')' === ch ) {
			depth--;
		}
		if ( depth < 0 ) {
			return null;
		}
	}
	if ( depth || /[+*/]{2,}|\/\*|\*\//.test( s.replace( /\s+/g, '' ) ) ) {
		return null;
	}
	try {
		const out = new Function( `"use strict"; return (${ s });` )();
		return Number.isFinite( out ) ? out : null;
	} catch ( e ) {
		return null;
	}
}

/** True when the text is more than a plain number (needs evaluating). */
export const isExpression = ( text ) =>
	/[+\-*/()]/.test(
		String( text ?? '' )
			.trim()
			.replace( /^-/, '' )
	);
