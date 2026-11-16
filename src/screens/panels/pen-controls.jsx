import { useId } from '@wordpress/element';
import { SnapSlider } from '../../components/snap-slider';
export function Dial( {
	label,
	value,
	min = 0,
	max = 100,
	step = 1,
	onChange,
	onCommit,
	suffix = '',
} ) {
	const inputId = useId();
	return (
		<label className="pp-dial" htmlFor={ inputId }>
			<span>{ label }</span>
			<output>
				{ Math.round( value * 100 ) / 100 }
				{ suffix }
			</output>
			<SnapSlider
				id={ inputId }
				min={ min }
				max={ max }
				step={ step }
				value={ value }
				def={ min }
				detents={ [] }
				ariaLabel={ label }
				onChange={ onChange }
				onCommit={ onCommit }
			/>
		</label>
	);
}
export function Choice( { label, value, choices, onChange } ) {
	const inputId = useId();
	return (
		<label className="pp-choice" htmlFor={ inputId }>
			<span>{ label }</span>
			<select
				id={ inputId }
				value={ value }
				onChange={ ( e ) => onChange( e.target.value ) }
			>
				{ choices.map( ( [ id, name ] ) => (
					<option key={ id } value={ id }>
						{ name }
					</option>
				) ) }
			</select>
		</label>
	);
}
