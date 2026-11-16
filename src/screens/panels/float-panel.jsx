/**
 * Floating panel window (v1.265): a detached right-panel tab. Dragged by
 * its header, resizable via the native CSS handle, and it never closes on
 * its own - only the dock button (or a header double-click) puts it back.
 */

import { __ } from '@wordpress/i18n';
import { useEffect, useId, useRef, useState } from '@wordpress/element';

import { I } from '../../icons';
import { clampFloat } from '../../lib/panel-floats';

export function FloatPanel( {
	title,
	icon,
	className = '',
	modal = true,
	onResize,
	onCollapse,
	revealKey,
	width,
	height,
	pos,
	onMove,
	onDock,
	onClose,
	onFront,
	zIndex,
	pinned = false,
	onPin,
	// One optional extra button in the head, left of the exit:
	// { icon, label, onClick }. The shape panel uses it to hand you over
	// to the full studio when a column is too narrow for what you are
	// dialing.
	action,
	children,
} ) {
	const ref = useRef( null );
	const [ collapsed, setCollapsed ] = useState( false );
	const previousReveal = useRef( revealKey );
	useEffect( () => {
		if ( previousReveal.current === revealKey ) {
			return;
		}
		previousReveal.current = revealKey;
		setCollapsed( false );
		onCollapse?.( false );
	}, [ revealKey, onCollapse ] );
	useEffect( () => {
		if ( ! onResize || collapsed || ! window.ResizeObserver ) {
			return undefined;
		}
		const observer = new window.ResizeObserver( () => {
			// A tool change can unmount the panel before effect cleanup runs.
			if ( ! ref.current ) {
				return;
			}
			const rect = ref.current.getBoundingClientRect();
			onResize( {
				width: Math.round( rect.width ),
				height: Math.round( rect.height ),
			} );
		} );
		observer.observe( ref.current );
		return () => observer.disconnect();
	}, [ onResize, collapsed ] );
	const bodyId = useId();
	const collapseLabel = collapsed
		? __( 'Expand', 'wunderpaint' )
		: __( 'Collapse', 'wunderpaint' );
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
			ref={ ref }
			className={ `ed-float-panel ${ className }${
				collapsed ? ' is-collapsed' : ''
			}` }
			style={ {
				left: pos.x,
				top: pos.y,
				zIndex,
				// A detached right-rail tab is happy at the shared default;
				// the brush panel carries three columns of tips beside a
				// column of controls and needs to say so. Still resizable.
				...( width ? { width } : {} ),
				// A panel whose contents change size under you - the shape
				// panel, where every shape brings its own dials - has to
				// stand still, or it hops on every click. Fixed here,
				// resizable by hand like the width.
				...( height ? { height } : {} ),
			} }
			role="dialog"
			aria-modal={ modal }
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
				{ action ? (
					<button
						className="ed-float-dock"
						title={ action.label }
						aria-label={ action.label }
						onClick={ action.onClick }
					>
						{ action.icon }
					</button>
				) : null }
				{ onPin && (
					<button
						type="button"
						className="ed-float-dock ed-float-pin"
						title={ __(
							'Keep open when switching tools',
							'wunderpaint'
						) }
						aria-label={ __( 'Pin', 'wunderpaint' ) }
						aria-pressed={ pinned }
						onClick={ onPin }
						onDoubleClick={ ( e ) => e.stopPropagation() }
					>
						{ pinned
							? I.pinned( {
									size: 14,
									fill: 'currentColor',
									stroke: 'none',
							  } )
							: I.pin( { size: 14 } ) }
					</button>
				) }
				<button
					type="button"
					className="ed-float-dock ed-float-collapse"
					title={ collapseLabel }
					aria-label={ collapseLabel }
					aria-expanded={ ! collapsed }
					aria-controls={ bodyId }
					onClick={ () => {
						setCollapsed( ! collapsed );
						onCollapse?.( ! collapsed );
					} }
					onDoubleClick={ ( e ) => e.stopPropagation() }
				>
					{ I.chevDown( { size: 14 } ) }
				</button>
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
			{ /* Keep controls mounted so values, open sections and scroll survive. */ }
			<div className="ed-float-body" id={ bodyId } hidden={ collapsed }>
				{ children }
			</div>
		</div>
	);
}
