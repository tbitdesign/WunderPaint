/** Shared numeric interaction; native input events remain the public contract. */
import { useRef, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { registerNumericControl } from '../lib/numeric-controls';
export { snapValue } from '../lib/number-control';

export function SnapSlider( {
	min,
	max,
	step = 1,
	value,
	def = 0,
	detents,
	disabled,
	ariaLabel,
	id,
	kind,
	onChange,
	onCommit,
} ) {
	const input = useRef( null );
	const latest = useRef( null );
	latest.current = {
		label: ariaLabel,
		kind,
		detents: detents || Array.from( new Set( [ def, 0 ] ) ),
		onCommit,
	};
	useEffect(
		() => registerNumericControl( input.current, () => latest.current ),
		[]
	);
	const resettable = def >= min && def <= max;
	return (
		<input
			ref={ input }
			id={ id }
			type="range"
			min={ min }
			max={ max }
			step={ step }
			value={ value }
			disabled={ disabled }
			aria-label={ ariaLabel }
			title={
				__(
					'Alt + drag: fine adjustment. Shift + drag: faster.',
					'wunderpaint'
				) +
				( resettable
					? ' ' +
					  sprintf(
							/* translators: %s: default value. */
							__( 'Double-click resets to %s', 'wunderpaint' ),
							String( def )
					  )
					: '' )
			}
			onChange={ ( e ) => onChange( +e.target.value ) }
			onDoubleClick={ () => {
				if ( resettable ) {
					onChange( def );
					onCommit?.();
				}
			} }
		/>
	);
}
