/**
 * Range input with detents (v1.3): values snap onto the default (and 0)
 * while DRAGGING, and double-click resets to the default, dialing a
 * slider back to exactly 0 no longer needs pixel hunting.
 *
 * Snapping is a pointer aid only (v1.285.3): keyboard steps are precise
 * intent, so arrow keys bypass the detents entirely - before, a blur of
 * 1 on a 0-60 range was unreachable because the 2% tolerance dragged
 * every 1 back onto the 0 detent, even from the keyboard. Keyboard
 * changes also commit (arrow-key edits used to never reach the history
 * until some later mouseup).
 */

import { useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

/**
 * Snap a raw slider value onto its detents.
 *
 * @param {number} value   Raw value.
 * @param {number} min     Range min.
 * @param {number} max     Range max.
 * @param {Array}  detents Snap targets.
 * @return {number} Snapped (or raw) value.
 */
export function snapValue( value, min, max, detents ) {
	const tolerance = ( max - min ) * 0.02;
	for ( const d of detents ) {
		if ( d >= min && d <= max && Math.abs( value - d ) <= tolerance ) {
			return d;
		}
	}
	return value;
}

export function SnapSlider( {
	min,
	max,
	step = 1,
	value,
	def = 0,
	detents,
	disabled,
	ariaLabel,
	// Lets a <label htmlFor> point at the real range input (v1.348.0).
	id,
	onChange,
	onCommit,
} ) {
	const targets = detents || Array.from( new Set( [ def, 0 ] ) );
	const pointing = useRef( false );
	return (
		<input
			id={ id }
			type="range"
			min={ min }
			max={ max }
			step={ step }
			value={ value }
			disabled={ disabled }
			aria-label={ ariaLabel }
			title={ sprintf(
				/* translators: %s: default value. */
				__( 'Double-click resets to %s', 'wunderpaint' ),
				String( def )
			) }
			onPointerDown={ () => {
				pointing.current = true;
			} }
			onPointerUp={ () => {
				pointing.current = false;
			} }
			onKeyDown={ () => {
				pointing.current = false;
			} }
			onKeyUp={ ( e ) => {
				if (
					[
						'ArrowLeft',
						'ArrowRight',
						'ArrowUp',
						'ArrowDown',
						'Home',
						'End',
						'PageUp',
						'PageDown',
					].includes( e.key )
				) {
					onCommit?.();
				}
			} }
			onChange={ ( e ) =>
				onChange(
					pointing.current
						? snapValue( +e.target.value, +min, +max, targets )
						: +e.target.value
				)
			}
			onMouseUp={ onCommit }
			onDoubleClick={ () => {
				onChange( def );
				onCommit?.();
			} }
		/>
	);
}
