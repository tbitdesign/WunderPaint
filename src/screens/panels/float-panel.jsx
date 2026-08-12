/**
 * Floating panel window (v1.265): a detached right-panel tab. Dragged by
 * its header, resizable via the native CSS handle, and it never closes on
 * its own - only the dock button (or a header double-click) puts it back.
 */

import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { clampFloat } from '../../lib/panel-floats';

export function FloatPanel( {
	title,
	icon,
	width,
	pos,
	onMove,
	onDock,
	onClose,
	onFront,
	children,
} ) {
	// A detached TAB docks back; a tool panel like the brush has no tab to
	// go back to, so it closes. One component, two exits, no second copy.
	const exit = onDock || onClose;
	const exitLabel = onDock
		? __( 'Dock panel back', 'wunderpaint' )
		: __( 'Close', 'wunderpaint' );
	const startDrag = ( e ) => {
		if ( e.button !== 0 || e.target.closest( 'button' ) ) {
			return;
		}
		e.preventDefault();
		const startX = e.clientX;
		const startY = e.clientY;
		const base = { ...pos };
		const move = ( ev ) => {
			onMove(
				clampFloat( {
					x: base.x + ( ev.clientX - startX ),
					y: base.y + ( ev.clientY - startY ),
				} )
			);
		};
		const up = () => {
			window.removeEventListener( 'pointermove', move );
			window.removeEventListener( 'pointerup', up );
		};
		window.addEventListener( 'pointermove', move );
		window.addEventListener( 'pointerup', up );
	};

	return (
		<div
			className="ed-float-panel"
			style={ {
				left: pos.x,
				top: pos.y,
				// A detached right-rail tab is happy at the shared default;
				// the brush panel carries three columns of tips beside a
				// column of controls and needs to say so. Still resizable.
				...( width ? { width } : {} ),
			} }
			role="dialog"
			aria-label={ title }
			// A floating panel is a CHILD of the canvas area, and the canvas
			// area is what starts a stroke on pointerdown. Without this, every
			// click in the panel - a colour, a tip, a slider - also painted a
			// dot on the layer and fired the commit toast. Only pointerdown is
			// swallowed: a stroke begun on the canvas and released over the
			// panel must still finish, so move and up stay through.
			onPointerDown={ ( e ) => {
				e.stopPropagation();
				if ( onFront ) {
					onFront( e );
				}
			} }
			onContextMenu={ ( e ) => e.stopPropagation() }
			onDoubleClick={ ( e ) => e.stopPropagation() }
		>
			<div
				className="ed-float-head"
				onPointerDown={ startDrag }
				onDoubleClick={ exit }
				role="presentation"
			>
				{ icon ? (
					<span className="ed-float-icon">{ icon }</span>
				) : null }
				<span className="ed-float-title">{ title }</span>
				<button
					className="ed-float-dock"
					title={ exitLabel }
					aria-label={ exitLabel }
					onClick={ exit }
				>
					{ onDock
						? I.dockback( { size: 14 } )
						: I.close( { size: 14 } ) }
				</button>
			</div>
			<div className="ed-float-body">{ children }</div>
		</div>
	);
}
