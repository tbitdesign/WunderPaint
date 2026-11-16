/**
 * A number field that takes arithmetic (v1.429): "100+20", "/2", "*1.5".
 * A plain number applies as you type, the way the fields always did; an
 * expression waits for Enter or blur and works on the field's current
 * value. Escape drops the draft.
 */

import { useState, useEffect, useRef } from '@wordpress/element';

import { evalNumber, isExpression } from '../lib/num-expr';
import { registerNumericControl } from '../lib/numeric-controls';

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
	step = 1,
	disabled,
	title,
	style,
	'aria-label': ariaLabel,
} ) {
	const input = useRef( null );
	const latest = useRef( null );
	// null = show the live value; a string = what is being typed.
	const [ draft, setDraft ] = useState( null );
	useEffect( () => {
		setDraft( null );
	}, [ value ] );
	const clamp = ( n ) =>
		Math.min( max ?? Infinity, Math.max( min ?? -Infinity, n ) );
	latest.current = {
		getValue: () => value,
		resolveStepValue: () => {
			const next = draft === null ? value : evalNumber( draft, value );
			setDraft( null );
			return clamp( next ?? value );
		},
		onInput: ( next ) => {
			setDraft( null );
			onChange( next );
		},
		onCommit,
		min,
		max,
		step,
		disabled,
	};
	useEffect(
		() => registerNumericControl( input.current, () => latest.current ),
		[]
	);
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
			ref={ input }
			type="text"
			data-number-input="true"
			role="spinbutton"
			aria-valuenow={ value }
			aria-valuemin={ min }
			aria-valuemax={ max }
			aria-valuetext={ draft ?? undefined }
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
					// Blur applies once, including relative expressions such as /2.
					e.currentTarget.blur();
				} else if ( 'Escape' === e.key && null !== draft ) {
					e.stopPropagation();
					setDraft( null );
				}
			} }
		/>
	);
}
