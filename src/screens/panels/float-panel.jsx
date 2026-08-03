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
	pos,
	onMove,
	onDock,
	onFront,
	children,
} ) {
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
			style={ { left: pos.x, top: pos.y } }
			role="dialog"
			aria-label={ title }
			onPointerDown={ onFront }
		>
			<div
				className="ed-float-head"
				onPointerDown={ startDrag }
				onDoubleClick={ onDock }
				role="presentation"
			>
				<span className="ed-float-title">{ title }</span>
				<button
					className="ed-float-dock"
					title={ __( 'Dock panel back', 'wunderpaint' ) }
					aria-label={ __( 'Dock panel back', 'wunderpaint' ) }
					onClick={ onDock }
				>
					{ I.dockback( { size: 14 } ) }
				</button>
			</div>
			<div className="ed-float-body">{ children }</div>
		</div>
	);
}
