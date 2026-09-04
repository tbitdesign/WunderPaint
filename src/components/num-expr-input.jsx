/**
 * A number field that takes arithmetic (v1.429): "100+20", "/2", "*1.5".
 * A plain number applies as you type, the way the fields always did; an
 * expression waits for Enter or blur and works on the field's current
 * value. Escape drops the draft.
 */

import { useState, useEffect } from '@wordpress/element';

import { evalNumber, isExpression } from '../lib/num-expr';

const plainNumber = ( t ) => {
	const s = String( t ).trim().replace( ',', '.' );
	return s && ! isExpression( s ) && ! Number.isNaN( Number( s ) )
		? Number( s )
		: null;
};

export function NumExprInput( {
	value,
	onChange,
	onCommit,
	min,
	max,
	disabled,
	title,
	style,
	'aria-label': ariaLabel,
} ) {
	// null = show the live value; a string = what is being typed.
	const [ draft, setDraft ] = useState( null );
	useEffect( () => {
		setDraft( null );
	}, [ value ] );
	const clamp = ( n ) =>
		Math.min( max ?? Infinity, Math.max( min ?? -Infinity, n ) );
	const apply = () => {
		if ( null === draft ) {
			onCommit?.();
			return;
		}
		const n = evalNumber( draft, value );
		setDraft( null );
		if ( null !== n && clamp( n ) !== value ) {
			onChange( clamp( n ) );
		}
		onCommit?.();
	};
	return (
		<input
			type="text"
			inputMode="decimal"
			value={ null === draft ? String( value ) : draft }
			disabled={ disabled }
			title={ title }
			style={ style }
			aria-label={ ariaLabel }
			onChange={ ( e ) => {
				const t = e.target.value;
				const n = plainNumber( t );
				if ( null !== n && ! /[.,]$/.test( t.trim() ) ) {
					setDraft( null );
					onChange( clamp( n ) );
				} else {
					setDraft( t );
				}
			} }
			onBlur={ apply }
			onKeyDown={ ( e ) => {
				if ( 'Enter' === e.key ) {
					e.preventDefault();
					apply();
					e.currentTarget.blur();
				} else if ( 'Escape' === e.key && null !== draft ) {
					e.stopPropagation();
					setDraft( null );
				}
			} }
		/>
	);
}
