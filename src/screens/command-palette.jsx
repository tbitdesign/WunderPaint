/**
 * Command palette (v1.15, ⌘K): every editor command searchable, menu
 * actions, dialogs, tools and the whole effects registry.
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { useEditor } from '../store/editor-context';
import { EFFECTS } from '../lib/effects';
import { TOOLS } from '../store/constants';
import * as Ops from '../store/ops';

export function CommandPalette( { onClose, extras } ) {
	const editor = useEditor();
	const { dispatch } = editor;
	const [ query, setQuery ] = useState( '' );
	const [ index, setIndex ] = useState( 0 );
	const inputRef = useRef( null );
	const listRef = useRef( null );

	useEffect( () => {
		inputRef.current?.focus();
	}, [] );

	const commands = useMemo( () => {
		const cmds = [
			{
				label: __( 'Undo', 'wunderpaint' ),
				group: __( 'Edit', 'wunderpaint' ),
				run: () => editor.undo(),
			},
			{
				label: __( 'Redo', 'wunderpaint' ),
				group: __( 'Edit', 'wunderpaint' ),
				run: () => editor.redo(),
			},
			{
				label: __( 'Export…', 'wunderpaint' ),
				group: __( 'File', 'wunderpaint' ),
				run: () => extras.openExport( 'export' ),
			},
			{
				label: __( 'Library…', 'wunderpaint' ),
				group: __( 'File', 'wunderpaint' ),
				run: () => extras.openLibrary(),
			},
			{
				label: __( 'Design Generator…', 'wunderpaint' ),
				group: __( 'File', 'wunderpaint' ),
				run: () => extras.openDesignAssistant(),
			},
			{
				label: __( 'Stock Images…', 'wunderpaint' ),
				group: __( 'File', 'wunderpaint' ),
				run: () => extras.openStock(),
			},
			{
				label: __( 'Image Size…', 'wunderpaint' ),
				group: __( 'Image', 'wunderpaint' ),
				run: () => extras.openResize( 'image' ),
			},
			{
				label: __( 'Canvas Size…', 'wunderpaint' ),
				group: __( 'Image', 'wunderpaint' ),
				run: () => extras.openResize( 'canvas' ),
			},
			{
				label: __( 'Resize Design…', 'wunderpaint' ),
				group: __( 'Image', 'wunderpaint' ),
				run: () => extras.openMagicResize(),
			},
			{
				label: __( 'Check Contrast…', 'wunderpaint' ),
				group: __( 'View', 'wunderpaint' ),
				run: () => extras.openContrast(),
			},
			{
				label: __( 'Guides & Grid…', 'wunderpaint' ),
				group: __( 'View', 'wunderpaint' ),
				run: () => extras.openGuides(),
			},
			{
				label: __( 'New Layer', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.newLayerOp( editor ),
			},
			{
				label: __( 'Group Layers', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.newGroupOp( editor ),
			},
			{
				label: __( 'Duplicate Layer', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.duplicateLayer( editor ),
			},
			{
				label: __( 'Add Layer Mask', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.addMaskOp( editor ),
			},
			{
				label: __( 'Convert to Smart Object', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.convertToSmartOp( editor ),
			},
			{
				label: __( 'Flatten', 'wunderpaint' ),
				group: __( 'Layer', 'wunderpaint' ),
				run: () => Ops.flattenOp( editor ),
			},
			{
				label: __( 'Trim', 'wunderpaint' ),
				group: __( 'Image', 'wunderpaint' ),
				run: () => Ops.trimOp( editor, extras ),
			},
			{
				label: __( 'Rotate 90° CW', 'wunderpaint' ),
				group: __( 'Image', 'wunderpaint' ),
				run: () => Ops.rotateDocOp( editor, true ),
			},
			{
				label: __( 'Select All', 'wunderpaint' ),
				group: __( 'Select', 'wunderpaint' ),
				run: () => Ops.selectAllOp( editor ),
			},
			{
				label: __( 'Deselect', 'wunderpaint' ),
				group: __( 'Select', 'wunderpaint' ),
				run: () => Ops.deselectOp( editor ),
			},
			{
				label: __( 'Keyboard Shortcuts', 'wunderpaint' ),
				group: __( 'Help', 'wunderpaint' ),
				run: () => extras.openShortcutHelp(),
			},
			{
				label: __( 'Handbook', 'wunderpaint' ),
				group: __( 'Help', 'wunderpaint' ),
				run: () => extras.openHelp(),
			},
		];
		for ( const tool of TOOLS ) {
			cmds.push( {
				label: sprintf(
					/* translators: %s: tool name. */
					__( 'Tool: %s', 'wunderpaint' ),
					tool.label
				),
				group: __( 'Tools', 'wunderpaint' ),
				kbd: tool.kbd,
				run: () => dispatch( { type: 'SET_TOOL', tool: tool.id } ),
			} );
		}
		for ( const effect of EFFECTS ) {
			if ( effect.hidden ) {
				continue;
			}
			cmds.push( {
				label: effect.label,
				group: __( 'Effects', 'wunderpaint' ),
				run: () => extras.openEffect( effect.id ),
			} );
		}
		return cmds;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const q = query.trim().toLowerCase();
	const matches = commands.filter(
		( cmd ) =>
			! q ||
			cmd.label.toLowerCase().includes( q ) ||
			cmd.group.toLowerCase().includes( q )
	);
	const run = ( cmd ) => {
		onClose();
		try {
			cmd.run();
		} catch ( err ) {
			if ( err?.pending ) {
				extras.toasts.error( err.message );
			} else {
				throw err;
			}
		}
	};
	useEffect( () => {
		listRef.current
			?.querySelector( '.active' )
			?.scrollIntoView( { block: 'nearest' } );
	}, [ index ] );

	return (
		<div
			className="modal-backdrop quick-insert-backdrop"
			onClick={ onClose }
			role="presentation"
		>
			<div
				className="quick-insert command-palette"
				role="dialog"
				aria-label={ __( 'Command palette', 'wunderpaint' ) }
				onClick={ ( e ) => e.stopPropagation() }
			>
				<input
					ref={ inputRef }
					type="text"
					placeholder={ __(
						'Type a command… (filters, tools, dialogs)',
						'wunderpaint'
					) }
					value={ query }
					onChange={ ( e ) => {
						setQuery( e.target.value );
						setIndex( 0 );
					} }
					onKeyDown={ ( e ) => {
						e.stopPropagation();
						if ( 'Escape' === e.key ) {
							onClose();
						} else if ( 'ArrowDown' === e.key ) {
							e.preventDefault();
							setIndex( ( i ) =>
								Math.min( i + 1, matches.length - 1 )
							);
						} else if ( 'ArrowUp' === e.key ) {
							e.preventDefault();
							setIndex( ( i ) => Math.max( i - 1, 0 ) );
						} else if ( 'Enter' === e.key && matches[ index ] ) {
							run( matches[ index ] );
						}
					} }
				/>
				<div className="quick-insert-list" ref={ listRef }>
					{ matches.map( ( cmd, i ) => (
						<button
							key={ `${ cmd.group }:${ cmd.label }` }
							className={ i === index ? 'active' : '' }
							onMouseEnter={ () => setIndex( i ) }
							onClick={ () => run( cmd ) }
						>
							<span>{ cmd.label }</span>
							<span className="quick-insert-hint">
								{ cmd.group }
								{ cmd.kbd ? ` · ${ cmd.kbd }` : '' }
							</span>
						</button>
					) ) }
					{ ! matches.length && (
						<div
							className="quick-insert-hint"
							style={ { padding: 8 } }
						>
							{ __( 'No match.', 'wunderpaint' ) }
						</div>
					) }
				</div>
			</div>
		</div>
	);
}
