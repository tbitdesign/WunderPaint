/** The same precision and transaction handling as sliders, for numeric labels. */
import { useRef, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { registerNumericControl } from '../lib/numeric-controls';

export function ScrubLabel( {
	children,
	value,
	onScrub,
	onCommit,
	step = 1,
	min = -Infinity,
	max = Infinity,
	disabled = false,
	as: Tag = 'span',
	className,
	id,
} ) {
	const label = useRef( null );
	const latest = useRef( null );
	latest.current = {
		getValue: () => value,
		onInput: onScrub,
		onCommit,
		min,
		max,
		step,
		disabled,
		editable: Tag === 'b',
	};
	useEffect(
		() => registerNumericControl( label.current, () => latest.current ),
		[]
	);
	return (
		<Tag
			ref={ label }
			id={ id }
			className={ className }
			data-number-scrub="true"
			role={ Tag === 'b' ? 'button' : undefined }
			tabIndex={ Tag === 'b' ? 0 : undefined }
			aria-disabled={ disabled || undefined }
			title={ __(
				'Drag to change the value. Alt: fine. Shift: faster.',
				'wunderpaint'
			) }
		>
			{ children }
		</Tag>
	);
}
