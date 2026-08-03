/**
 * Photoshop-style scrubby label (v1.9): drag horizontally on a number
 * field's label to change its value, 1 unit per pixel, Shift = 10×.
 */

import { useRef } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

export function ScrubLabel( {
	children,
	value,
	onScrub,
	onCommit,
	step = 1,
	min = -Infinity,
	max = Infinity,
	as: Tag = 'span',
	className,
	// So a container can name itself with aria-labelledby (v1.348.0).
	id,
} ) {
	const start = useRef( null );

	return (
		<Tag
			id={ id }
			className={ className }
			style={ { cursor: 'ew-resize', userSelect: 'none' } }
			title={ __(
				'Drag to change the value (Shift = 10×)',
				'wunderpaint'
			) }
			onPointerDown={ ( e ) => {
				start.current = { x: e.clientX, v: value, moved: false };
				e.currentTarget.setPointerCapture?.( e.pointerId );
			} }
			onPointerMove={ ( e ) => {
				if ( ! start.current ) {
					return;
				}
				const dx = e.clientX - start.current.x;
				if ( ! start.current.moved && Math.abs( dx ) < 2 ) {
					return;
				}
				start.current.moved = true;
				const mult = e.shiftKey ? 10 : 1;
				onScrub(
					Math.min(
						max,
						Math.max(
							min,
							start.current.v + Math.round( dx * step * mult )
						)
					)
				);
			} }
			onPointerUp={ () => {
				if ( start.current?.moved ) {
					onCommit?.();
				}
				start.current = null;
			} }
			onPointerCancel={ () => {
				start.current = null;
			} }
		>
			{ children }
		</Tag>
	);
}
