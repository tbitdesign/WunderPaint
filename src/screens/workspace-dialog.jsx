/**
 * Workspace manager (v1.184.0): switch and save personal workspaces, set the
 * toolbar icon size, and tick main-UI regions on or off. Everything here is
 * purely cosmetic; see src/lib/workspace.js. The View menu deliberately
 * stays visible, so this dialog is always reachable.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { workspaceGroups } from '../lib/workspace-registry';
import {
	subscribeWorkspace,
	listWorkspaces,
	applyWorkspace,
	activeBase,
	updateWorkspace,
	renameWorkspace,
	deleteWorkspace,
	saveWorkspaceAs,
	isKeyHidden,
	setKeyHidden,
	getIconSize,
	setIconSize,
	showAll,
	ICON_SIZES,
} from '../lib/workspace';

const BUILTIN_LABELS = {
	full: __( 'Full', 'wunderpaint' ),
	essentials: __( 'Essentials', 'wunderpaint' ),
	minimal: __( 'Minimal', 'wunderpaint' ),
};

const BUILTIN_DESC = {
	full: __( 'Everything, nothing hidden.', 'wunderpaint' ),
	essentials: __( 'Fewer tools, bigger icons.', 'wunderpaint' ),
	minimal: __( 'Just the basics.', 'wunderpaint' ),
};

const SIZE_LABELS = {
	sm: __( 'Small', 'wunderpaint' ),
	md: __( 'Medium', 'wunderpaint' ),
	lg: __( 'Large', 'wunderpaint' ),
};

export function WorkspaceDialog( { extras, onClose } ) {
	useEscape( onClose );
	const [ , setTick ] = useState( 0 );
	const [ newName, setNewName ] = useState( '' );
	useEffect(
		() => subscribeWorkspace( () => setTick( ( t ) => t + 1 ) ),
		[]
	);

	const workspaces = listWorkspaces();
	const builtins = workspaces.filter( ( w ) => w.builtin );
	const saved = workspaces.filter( ( w ) => ! w.builtin );
	const base = activeBase();
	const iconSize = getIconSize();
	const groups = workspaceGroups();

	const saveCurrent = () => {
		saveWorkspaceAs( newName );
		setNewName( '' );
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog wpie-ws-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Workspace', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Workspace', 'wunderpaint' ) }
						</span>
						<HelpLink article="navigation" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Show only what you need. Purely visual, nothing is switched off.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close ? I.close( { size: 17 } ) : '✕' }
					</button>
				</div>

				<div className="wpie-ws-body">
					{ /* Left: presets + saved workspaces. */ }
					<div className="wpie-ws-side">
						<span className="wpie-ws-lbl">
							{ __( 'Presets', 'wunderpaint' ) }
						</span>
						{ builtins.map( ( w ) => (
							<button
								key={ w.id }
								className={
									'wpie-ws-preset' +
									( base === w.id ? ' active' : '' )
								}
								onClick={ () => applyWorkspace( w.id ) }
							>
								<span className="name">
									{ BUILTIN_LABELS[ w.id ] || w.name }
								</span>
								<span className="desc">
									{ BUILTIN_DESC[ w.id ] || '' }
								</span>
							</button>
						) ) }

						<span
							className="wpie-ws-lbl"
							style={ { marginTop: 12 } }
						>
							{ __( 'Your workspaces', 'wunderpaint' ) }
						</span>
						{ saved.length === 0 && (
							<p className="wpie-ws-empty">
								{ __(
									'Save your current layout below.',
									'wunderpaint'
								) }
							</p>
						) }
						{ saved.map( ( w ) => (
							<div
								key={ w.id }
								className={
									'wpie-ws-saved' +
									( base === w.id ? ' active' : '' )
								}
							>
								<button
									className="wpie-ws-apply"
									title={ __(
										'Apply this workspace',
										'wunderpaint'
									) }
									onClick={ () => applyWorkspace( w.id ) }
								>
									{ base === w.id ? '●' : '○' }
								</button>
								<input
									className="wpie-ws-rename"
									value={ w.name }
									aria-label={ __(
										'Workspace name',
										'wunderpaint'
									) }
									onChange={ ( e ) =>
										renameWorkspace( w.id, e.target.value )
									}
								/>
								<button
									className="wpie-ws-mini"
									title={ __(
										'Overwrite with the current layout',
										'wunderpaint'
									) }
									aria-label={ __( 'Update', 'wunderpaint' ) }
									onClick={ () => updateWorkspace( w.id ) }
								>
									↻
								</button>
								<button
									className="wpie-ws-mini"
									title={ __(
										'Delete this workspace',
										'wunderpaint'
									) }
									aria-label={ __( 'Delete', 'wunderpaint' ) }
									onClick={ () => deleteWorkspace( w.id ) }
								>
									✕
								</button>
							</div>
						) ) }
					</div>

					{ /* Right: appearance + visibility checklist. */ }
					<div className="wpie-ws-main">
						<div className="wpie-ws-row">
							<span className="wpie-ws-lbl">
								{ __( 'Toolbar icon size', 'wunderpaint' ) }
							</span>
							<div className="dsm-seg">
								{ ICON_SIZES.map( ( s ) => (
									<button
										key={ s }
										className={
											iconSize === s ? 'active' : ''
										}
										onClick={ () => setIconSize( s ) }
									>
										{ SIZE_LABELS[ s ] }
									</button>
								) ) }
							</div>
						</div>

						<button
							className="ai-btn secondary wpie-ws-pickbtn"
							onClick={ () => extras.startWorkspacePick() }
						>
							{ __( 'Customize by clicking', 'wunderpaint' ) }
						</button>

						{ groups.map( ( g ) => (
							<div key={ g.group } className="wpie-ws-group">
								<span className="wpie-ws-lbl">{ g.group }</span>
								<div className="wpie-ws-checks">
									{ g.items.map( ( it ) => (
										<label
											key={ it.key }
											className="wpie-ws-check"
										>
											<input
												type="checkbox"
												checked={
													! isKeyHidden( it.key )
												}
												onChange={ ( e ) =>
													setKeyHidden(
														it.key,
														! e.target.checked
													)
												}
											/>
											<span>{ it.label }</span>
										</label>
									) ) }
								</div>
							</div>
						) ) }
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-actions">
						<button
							className="ai-btn secondary"
							onClick={ showAll }
						>
							{ __( 'Show everything', 'wunderpaint' ) }
						</button>
					</div>
					<div className="dsm-actions">
						<input
							className="wpie-ws-foot-name"
							value={ newName }
							placeholder={ __(
								'New workspace name',
								'wunderpaint'
							) }
							onChange={ ( e ) => setNewName( e.target.value ) }
							onKeyDown={ ( e ) =>
								'Enter' === e.key && saveCurrent()
							}
						/>
						<button
							className="ai-btn secondary"
							onClick={ saveCurrent }
						>
							{ __( 'Save current', 'wunderpaint' ) }
						</button>
						<button className="ai-btn primary" onClick={ onClose }>
							{ __( 'Done', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
