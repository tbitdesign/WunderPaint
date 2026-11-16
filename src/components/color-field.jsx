/** One compact field for the existing color picker and its editable CSS value. */
import { __ } from '@wordpress/i18n';
import { SwatchButton } from './color-popover';

export function ColorField( {
	color,
	onChange,
	onCommit,
	title,
	placeholder,
	disabled = false,
	id,
} ) {
	const label = title || __( 'Color', 'wunderpaint' );
	return (
		<div
			className={
				'wpie-color-field' + ( disabled ? ' is-disabled' : '' )
			}
		>
			<SwatchButton
				color={ color || 'transparent' }
				onChange={ onChange }
				onCommit={ onCommit }
				title={ label }
				disabled={ disabled }
				size="calc(var(--color-field-height, 26px) - 6px)"
			/>
			<input
				id={ id }
				type="text"
				aria-label={ label }
				value={ color || '' }
				placeholder={ placeholder }
				disabled={ disabled }
				spellCheck={ false }
				onChange={ ( event ) => onChange( event.target.value ) }
				onBlur={ onCommit }
			/>
		</div>
	);
}
