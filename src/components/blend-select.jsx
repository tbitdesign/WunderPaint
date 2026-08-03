/**
 * Blend-mode picker (v1.24.12): a styled dropdown that LIVE-PREVIEWS each mode
 * as you hover, the canvas updates immediately (a no-commit layer patch), so
 * you see the result before choosing. Clicking commits it; leaving the menu,
 * clicking away or pressing Escape reverts to the mode you started with.
 * Replaces the plain <select>.
 *
 * The parent wires the actual dispatch through `onPreview` (no history entry)
 * and `onCommit` (history entry), so this works for a single layer or a
 * multi-selection alike.
 */
import { useState, useRef, useEffect } from '@wordpress/element';

import { I } from '../icons';
import { BLEND_MODES, BLEND_MODE_LABELS } from '../store/constants';

const labelFor = ( b ) => BLEND_MODE_LABELS[ b ] || b.replace( /-/g, ' ' );

/** Fixed-position menu anchored to the button, clamped to the viewport. */
function menuStyle( rect ) {
	const width = Math.max( 152, rect.width );
	const maxH = 300;
	let left = rect.left;
	if ( left + width > window.innerWidth - 8 ) {
		left = window.innerWidth - width - 8;
	}
	let top = rect.bottom + 4;
	if ( top + maxH > window.innerHeight - 8 ) {
		top = Math.max( 8, rect.top - maxH - 4 );
	}
	return { position: 'fixed', left, top, width };
}

export function BlendModeSelect( {
	value,
	disabled,
	width,
	onPreview,
	onCommit,
} ) {
	const [ menu, setMenu ] = useState( null ); // anchored style | null
	const ref = useRef( null );
	const original = useRef( value );

	useEffect( () => {
		if ( ! menu ) {
			return;
		}
		const revertClose = () => {
			onPreview( original.current );
			setMenu( null );
		};
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				revertClose();
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				revertClose();
			}
		};
		document.addEventListener( 'mousedown', onDown, true );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown, true );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ menu, onPreview ] );

	const toggle = ( e ) => {
		if ( disabled ) {
			return;
		}
		if ( menu ) {
			onPreview( original.current );
			setMenu( null );
			return;
		}
		// Read the rect synchronously (never inside a state updater).
		const rect = e.currentTarget.getBoundingClientRect();
		original.current = value;
		setMenu( menuStyle( rect ) );
	};

	return (
		<div
			className="blend-select"
			ref={ ref }
			style={ width ? { width } : undefined }
		>
			<button
				type="button"
				className="blend-select-btn"
				disabled={ disabled }
				aria-haspopup="listbox"
				aria-expanded={ !! menu }
				onClick={ toggle }
			>
				<span>{ labelFor( value || 'normal' ) }</span>
				{ I.chevDown( { size: 12 } ) }
			</button>
			{ menu && (
				<div className="blend-menu" style={ menu } role="listbox">
					{ BLEND_MODES.map( ( b ) => (
						<button
							key={ b }
							type="button"
							role="option"
							aria-selected={ b === value }
							className={ `blend-opt ${
								b === value ? 'active' : ''
							}` }
							onMouseEnter={ () => onPreview( b ) }
							onFocus={ () => onPreview( b ) }
							onClick={ () => {
								onCommit( b );
								setMenu( null );
							} }
						>
							{ labelFor( b ) }
						</button>
					) ) }
				</div>
			) }
		</div>
	);
}
