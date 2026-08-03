/**
 * CI tooltip hook (v1.165.2, extracted from the AI panel's v1.78.7
 * bubble): spread `tipFor( label )` onto any element and render
 * `tipNode` once in the owning component - a dark bubble appears above
 * the anchor, clamped to the viewport, the arrow keeps pointing at the
 * anchor when the bubble clamps. Replaces native title tooltips.
 */

import { useState } from '@wordpress/element';

/**
 * @param {Object} [opts]   Options.
 * @param {number} [opts.z] z-index override (bubbles inside fixed
 *                          popovers must beat the popover's own z).
 * @return {Object} { tipFor, tipNode, hideTip }.
 */
export function useTip( { z } = {} ) {
	const [ tip, setTip ] = useState( null );
	const show = ( label ) => ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		const cx = r.left + r.width / 2;
		const x = Math.max( 128, Math.min( window.innerWidth - 128, cx ) );
		setTip( { label, x, ax: cx - x, y: r.top - 6 } );
	};
	const hideTip = () => setTip( null );
	const tipFor = ( label ) => ( {
		onMouseEnter: show( label ),
		onMouseLeave: hideTip,
		onFocus: show( label ),
		onBlur: hideTip,
	} );
	const tipNode = tip ? (
		<div
			className="ai-tip"
			style={ {
				left: tip.x,
				top: tip.y,
				'--tip-ax': tip.ax + 'px',
				...( z ? { zIndex: z } : {} ),
			} }
		>
			{ tip.label }
		</div>
	) : null;
	return { tipFor, tipNode, hideTip };
}
