import { useId, useRef } from '@wordpress/element';
import '../../styles/editor/painting-panels.css';

export function ToolSetting( {
	label,
	value,
	min = 0,
	max = 100,
	step = 1,
	suffix = '',
	alphaColor,
	onChange,
	onCommit,
} ) {
	const id = useId();
	const changed = useRef( false );
	const update = ( next ) => {
		changed.current = changed.current || next !== value;
		onChange( next );
	};
	const commit = () => {
		if ( changed.current ) {
			changed.current = false;
			onCommit?.();
		}
	};
	const slider = (
		<input
			type="range"
			aria-label={ label }
			min={ min }
			max={ max }
			step={ step }
			value={ value }
			onChange={ ( e ) => update( +e.target.value ) }
			onPointerUp={ commit }
			onMouseUp={ commit }
			onPointerCancel={ commit }
			onKeyUp={ commit }
		/>
	);
	return (
		<div className="tool-setting">
			<label htmlFor={ id }>{ label }</label>
			<div className="tool-setting-number">
				<input
					id={ id }
					type="number"
					min={ min }
					max={ max }
					step={ step }
					value={ value }
					onChange={ ( e ) => {
						if (
							e.target.value !== '' &&
							Number.isFinite( +e.target.value )
						) {
							update(
								Math.max(
									min,
									Math.min( max, +e.target.value )
								)
							);
						}
					} }
					onBlur={ commit }
				/>
				{ suffix && <span>{ suffix }</span> }
			</div>
			{ alphaColor ? (
				<div
					className="cp-alpha"
					style={ { '--cp-color': alphaColor } }
				>
					{ slider }
				</div>
			) : (
				slider
			) }
		</div>
	);
}

export function ToolChoices( { label, value, choices, onChange } ) {
	return (
		<div className="dsm-seg tool-choices" role="group" aria-label={ label }>
			{ choices.map( ( [ id, text ] ) => (
				<button
					key={ id }
					type="button"
					className={ value === id ? 'active' : '' }
					aria-pressed={ value === id }
					onClick={ () => onChange( id ) }
				>
					{ text }
				</button>
			) ) }
		</div>
	);
}
