/**
 * Easy Mode top bar (v1.166.0): replaces the pro menu bar row - undo,
 * redo, a friendly mode badge and the way back to the full editor.
 * Everything else (open, save, export) already lives in the title bar,
 * which easy mode keeps.
 */

import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { useEditor } from '../../store/editor-context';

export function EasyBar( { extras } ) {
	const editor = useEditor();
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
					'Click an element to edit it, everything important appears on the right.',
					'wunderpaint'
				) }
			</span>
			<span style={ { flex: 1 } } />
			<button
				className="ai-btn secondary ed-easy-exit"
				onClick={ () => extras.setEasyMode( false ) }
			>
				{ __( 'Switch to full editor', 'wunderpaint' ) }
			</button>
		</div>
	);
}
