/**
 * Easy Mode top bar (v1.166.0): replaces the pro menu bar row - undo,
 * redo, a friendly mode badge and the way back to the full editor.
 * Everything else (open, save, export) already lives in the title bar,
 * which easy mode keeps.
 */

import { __ } from '@wordpress/i18n';
import { useState, useRef, useEffect } from '@wordpress/element';
import { Dropdown } from '../editor-menubar';

import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';

export function EasyBar( { extras } ) {
	const editor = useEditor();
	const [ helpOpen, setHelpOpen ] = useState( false );
	const helpRef = useRef( null );
	useEffect( () => {
		if ( ! helpOpen ) {
			return undefined;
		}
		const closeOutside = ( event ) => {
			if ( ! helpRef.current?.contains( event.target ) ) {
				setHelpOpen( false );
			}
		};
		document.addEventListener( 'mousedown', closeOutside );
		return () => document.removeEventListener( 'mousedown', closeOutside );
	}, [ helpOpen ] );
	const helpMenu = {
		items: [
			{
				label: __( 'Handbook', 'wunderpaint' ),
				run: () => extras.openHelp(),
			},
			{
				label: __( 'Show Tour', 'wunderpaint' ),
				run: () => extras.openTour(),
			},
		],
	};
	return (
		<div className="ed-menubar ed-easy-bar">
			<span className="ed-easy-badge">
				{ I.sparkles ? I.sparkles( { size: 13 } ) : null }
				{ __( 'Easy Mode', 'wunderpaint' ) }
			</span>
			<button
				className="ed-easy-iconbtn"
				disabled={ ! editor.canUndo }
				title={ __( 'Undo', 'wunderpaint' ) }
				aria-label={ __( 'Undo', 'wunderpaint' ) }
				onClick={ () => editor.undo() }
			>
				{ I.undo( { size: 15 } ) }
			</button>
			<button
				className="ed-easy-iconbtn"
				disabled={ ! editor.canRedo }
				title={ __( 'Redo', 'wunderpaint' ) }
				aria-label={ __( 'Redo', 'wunderpaint' ) }
				onClick={ () => editor.redo() }
			>
				{ I.redo( { size: 15 } ) }
			</button>
			<span className="ed-easy-hint">
				{ __(
					'Start adds content. Edit changes it. Elements keeps your design organized.',
					'wunderpaint'
				) }
			</span>
			<span style={ { flex: 1 } } />
			<div className="ed-menu-wrap ed-easy-help-menu" ref={ helpRef }>
				<button
					type="button"
					className="ai-btn secondary ed-easy-help"
					data-menu="help"
					aria-haspopup="menu"
					aria-expanded={ helpOpen }
					onClick={ () => setHelpOpen( ! helpOpen ) }
				>
					{ __( 'Help', 'wunderpaint' ) }
				</button>
				{ helpOpen && (
					<Dropdown
						menu={ helpMenu }
						extras={ extras }
						onClose={ () => setHelpOpen( false ) }
					/>
				) }
			</div>
			<button
				className="ai-btn secondary ed-easy-help"
				onClick={ () => extras.openHelpBot() }
			>
				{ __( 'Help Assistant', 'wunderpaint' ) }
			</button>
			<button
				className="ai-btn secondary ed-easy-exit"
				onClick={ () => extras.setEasyMode( false ) }
			>
				{ __( 'Switch to full editor', 'wunderpaint' ) }
			</button>
		</div>
	);
}
