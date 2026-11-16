import { useId } from '@wordpress/element';
import { SnapSlider } from '../../components/snap-slider';

export function GradientDial( {
	label,
	value,
	onChange,
	onCommit,
	min = 0,
	max = 100,
	suffix = '%',
} ) {
	const id = useId();
	return (
		<label className="gp-dial" htmlFor={ id }>
			<span>{ label }</span>
			<span className="gp-number">
				<input
					id={ id }
					aria-label={ label }
					type="number"
					data-number-kind={ suffix === '°' ? 'angle' : undefined }
					min={ min }
					max={ max }
					step="1"
					value={ Math.round( value * 10 ) / 10 }
					onChange={ ( e ) => {
						if (
							e.target.value !== '' &&
							Number.isFinite( +e.target.value )
						) {
							onChange(
								Math.max(
									min,
									Math.min( max, +e.target.value )
								)
							);
						}
					} }
					onBlur={ onCommit }
					onKeyDown={ ( e ) => {
						if ( e.key === 'Enter' ) {
							e.currentTarget.blur();
						}
					} }
				/>
				<span>{ suffix }</span>
			</span>
			<SnapSlider
				ariaLabel={ label }
				kind={ suffix === '°' ? 'angle' : undefined }
				value={ value }
				min={ min }
				max={ max }
				step={ 1 }
				def={ min }
				detents={ [] }
				onChange={ onChange }
				onCommit={ onCommit }
			/>
		</label>
	);
}
