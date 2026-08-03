/**
 * Shared styled tooltip (v1.250): the tool rail's fixed-position tip
 * (`.ed-rail-tip`) as a reusable hook, so other button rows - first the
 * canvas context bar - get the same look instead of native `title`
 * bubbles. Fixed positioning survives any overflow clipping; `place`
 * picks which side of the button the tip appears on.
 *
 *     const tip = useHoverTip( 'above' );
 *     <button aria-label={ label } { ...tip.props( label ) }>…</button>
 *     { tip.node }
 */

import { useState } from '@wordpress/element';

export function useHoverTip( place = 'above' ) {
	const [ tip, setTip ] = useState( null ); // {label, place, x, y} | null
	const show = ( label ) => ( e ) => {
		const r = e.currentTarget.getBoundingClientRect();
		// Too close to the viewport top: flip below so nothing clips.
		const flip = 'above' === place && r.top < 44;
		const at = flip ? 'below' : place;
		setTip( {
			label,
			place: at,
			x: r.left + r.width / 2,
			y: 'above' === at ? r.top - 7 : r.bottom + 7,
		} );
	};
	const hide = () => setTip( null );
	// Spread onto the button; keep a separate aria-label for readers.
	const props = ( label ) => ( {
		onMouseEnter: show( label ),
		onMouseLeave: hide,
		onFocus: show( label ),
		onBlur: hide,
	} );
	const node = tip ? (
		<div
			className={ `ed-hover-tip ${ tip.place }` }
			style={ { left: tip.x, top: tip.y } }
		>
			{ tip.label }
		</div>
	) : null;
	return { props, hide, node };
}
