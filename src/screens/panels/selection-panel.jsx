import { useId, useMemo, useState, useEffect } from '@wordpress/element';
import { __, _x, sprintf } from '@wordpress/i18n';
import { useSelectionFeather } from '../../components/use-selection-feather';
import { SnapSlider } from '../../components/snap-slider';
import { I } from '../../icons';
import { Thumb } from '../shape-studio-core';
import { isModelInstalled } from '../../lib/ml';
import {
	selectionFrame,
	transformSelection,
} from '../../store/selection-geometry';
import { selectionToMaskCanvas } from '../../store/selection';
import {
	selectAllOp,
	deselectOp,
	restoreSelectionOp,
	saveSelectionOp,
	inverseSelectionOp,
} from '../../store/ops/edit-ops';
import { fillSelectionOp, layerViaCopyOp } from '../../store/ops/document-ops';
import { addMaskOp } from '../../store/ops/mask-ops';
import { activeLayerOf } from '../../store/editor-context';
import { modifySelectionPrompt } from '../../store/ops/selection-modify-ops';

export const SELECTION_MODES = [
	{
		id: 'rect',
		tool: 'marquee',
		patch: { shape: 'rect' },
		label: () => __( 'Rectangle', 'wunderpaint' ),
		icon: ( size = 22 ) => I.marquee( { size } ),
	},
	{
		id: 'ellipse',
		tool: 'marquee',
		patch: { shape: 'ellipse' },
		label: () => __( 'Ellipse', 'wunderpaint' ),
		icon: ( size = 22 ) => (
			<Thumb entry={ { shape: 'ellipse' } } size={ size } />
		),
	},
	{
		id: 'freehand',
		tool: 'lasso',
		patch: { mode: 'freehand' },
		label: () => __( 'Freehand', 'wunderpaint' ),
		icon: ( size = 22 ) => I.lasso( { size } ),
	},
	{
		id: 'polygon',
		tool: 'lasso',
		patch: { mode: 'polygon' },
		label: () => __( 'Polygon', 'wunderpaint' ),
		icon: ( size = 22 ) => (
			<Thumb entry={ { shape: 'polygon' } } size={ size } />
		),
	},
	{
		id: 'wand',
		tool: 'wand',
		patch: {},
		label: () => __( 'Magic Wand', 'wunderpaint' ),
		icon: ( size = 22 ) => I.wand( { size } ),
	},
	{
		id: 'smartselect',
		tool: 'smartselect',
		patch: {},
		label: () => __( 'Smart Select', 'wunderpaint' ),
		icon: ( size = 22 ) => I.smartselect( { size } ),
	},
];
const MODIFICATIONS = [
	[ 'expand', () => _x( 'Expand', 'selection action', 'wunderpaint' ) ],
	[ 'contract', () => _x( 'Contract', 'selection action', 'wunderpaint' ) ],
	[ 'smooth', () => _x( 'Smooth', 'selection action', 'wunderpaint' ) ],
	[ 'border', () => _x( 'Border', 'selection action', 'wunderpaint' ) ],
];

function PixelField( { label, value, onChange, min = 1, max = 32768 } ) {
	const id = useId();
	const [ text, setText ] = useState( String( Math.round( value ) ) );
	useEffect( () => setText( String( Math.round( value ) ) ), [ value ] );
	return (
		<label className="selp-pixel-field" htmlFor={ id }>
			<span>{ label }</span>
			<input
				type="number"
				id={ id }
				min={ min }
				max={ max }
				step="1"
				value={ text }
				onChange={ ( e ) => setText( e.target.value ) }
				onBlur={ ( e ) => {
					const v = e.target.value;
					if ( v !== '' && Number.isFinite( +v ) ) {
						const next = Math.max(
							min,
							Math.min( max, Math.round( +v ) )
						);
						setText( String( next ) );
						if ( next !== value ) {
							onChange( next );
						}
					} else {
						setText( String( Math.round( value ) ) );
					}
				} }
				onKeyDown={ ( e ) => {
					e.stopPropagation();
					if ( e.key === 'Escape' ) {
						e.currentTarget.value = String( Math.round( value ) );
						setText( e.currentTarget.value );
						e.currentTarget.blur();
					}
					if ( e.key === 'Enter' ) {
						e.currentTarget.blur();
					}
				} }
			/>
			<span>px</span>
		</label>
	);
}

function Setting( {
	label,
	value,
	min,
	max,
	def,
	suffix,
	onChange,
	onCommit,
	disabled,
} ) {
	const id = useId();
	return (
		<div className="selp-setting">
			<div className="selp-setting-head">
				<label htmlFor={ id }>{ label }</label>
				<span className="selp-number">
					<input
						id={ id }
						type="number"
						min={ min }
						max={ max }
						step="1"
						value={ value }
						disabled={ disabled }
						onBlur={ onCommit }
						onKeyDown={ ( e ) => {
							if ( onCommit && e.key === 'Enter' ) {
								e.currentTarget.blur();
							}
						} }
						onChange={ ( e ) => {
							if (
								e.target.value !== '' &&
								Number.isFinite( +e.target.value )
							) {
								onChange(
									Math.round(
										Math.min(
											max,
											Math.max( min, +e.target.value )
										)
									)
								);
							}
						} }
					/>
					<span>{ suffix }</span>
				</span>
			</div>
			<SnapSlider
				ariaLabel={ label }
				min={ min }
				max={ max }
				value={ value }
				def={ def }
				detents={ [] }
				onChange={ onChange }
				onCommit={ onCommit }
				disabled={ disabled }
			/>
		</div>
	);
}

function SavedSelection( { item, doc, active, onLoad, onRemove } ) {
	const preview = useMemo(
		() =>
			selectionToMaskCanvas( item.sel, doc.w, doc.h, {
				scale: Math.min( 1, 96 / doc.w, 64 / doc.h ),
			} ).toDataURL(),
		[ item.sel, doc.w, doc.h ]
	);
	return (
		<div className="selp-saved-item">
			<button
				type="button"
				className="selp-saved-card"
				aria-pressed={ active }
				title={ item.name }
				onClick={ onLoad }
			>
				<span className="selp-saved-preview">
					<img src={ preview } alt="" />
				</span>
				<span className="selp-saved-name">{ item.name }</span>
			</button>
			<button
				type="button"
				className="selp-remove"
				aria-label={ sprintf(
					// translators: %s: saved selection name.
					__( 'Remove saved selection %s', 'wunderpaint' ),
					item.name
				) }
				onClick={ onRemove }
			>
				{ I.close( { size: 11 } ) }
			</button>
		</div>
	);
}

function Choice( { label, value, options, onChange, disabled } ) {
	const id = useId();
	return (
		<label className="selp-field" htmlFor={ id }>
			<span>{ label }</span>
			<select
				id={ id }
				className="dsm-select"
				value={ value }
				disabled={ disabled }
				onChange={ ( e ) => onChange( e.target.value ) }
			>
				{ options.map( ( [ option, text ] ) => (
					<option key={ option } value={ option }>
						{ text }
					</option>
				) ) }
			</select>
		</label>
	);
}

function Action( {
	label,
	description,
	disabled,
	onClick,
	pressed,
	className = '',
} ) {
	return (
		<button
			type="button"
			className={ `ai-btn secondary sm selp-action ${ className }` }
			disabled={ disabled }
			aria-label={ label }
			aria-pressed={ pressed }
			onClick={ onClick }
		>
			<span className="selp-action-label">{ label }</span>
			{ description && (
				<span className="selp-action-description">{ description }</span>
			) }
		</button>
	);
}

export function SelectionPanel( {
	editor,
	onCancelDraft,
	editing,
	onEditingChange,
} ) {
	const { state, dispatch } = editor;
	const activeLayer = activeLayerOf( state );
	const canRestore = ! state.selection && !! state.lastSelection;
	const isSelectionTool = SELECTION_MODES.some(
		( mode ) => mode.tool === state.tool
	);
	const opts = state.toolOpts[ state.tool ] || {};
	const feather = useSelectionFeather( editor );
	const frame = useMemo(
		() => selectionFrame( state.selection, state.doc ),
		[ state.selection, state.doc ]
	);
	const hasArea = frame?.w > 0 && frame?.h > 0;
	const activeMode = [ 'wand', 'smartselect' ].includes( state.tool )
		? state.tool
		: state.tool === 'marquee'
		? opts.shape || 'rect'
		: opts.mode || 'freehand';
	const set = ( key, value ) =>
		dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: state.tool,
			patch: { [ key ]: value },
		} );
	const run = ( action ) => {
		onCancelDraft();
		action();
	};
	const setFrame = ( key, value ) => {
		if ( ! frame ) {
			return;
		}
		dispatch( {
			type: 'SET_SELECTION',
			selection: transformSelection(
				state.selection,
				frame,
				{ ...frame, [ key ]: value },
				state.doc
			),
		} );
		editor.commit( __( 'Transform selection', 'wunderpaint' ) );
	};
	const modificationHints = {
		expand: __( 'Grow the selected area.', 'wunderpaint' ),
		contract: __( 'Shrink the selected area.', 'wunderpaint' ),
		smooth: __( 'Round off uneven edges.', 'wunderpaint' ),
		border: __( 'Keep only a band along the edge.', 'wunderpaint' ),
	};
	return (
		<div className="selp">
			<div className="selp-types">
				<div
					className="selp-modes"
					role="group"
					aria-label={ __( 'Selection tool', 'wunderpaint' ) }
				>
					{ SELECTION_MODES.map( ( mode ) => (
						<button
							type="button"
							key={ mode.id }
							className="ai-tile ai-tile-compact"
							aria-pressed={
								isSelectionTool && mode.id === activeMode
							}
							title={ mode.label() }
							onClick={ () =>
								run( () => {
									onEditingChange( false );
									dispatch( {
										type: 'SET_TOOL_OPTS',
										tool: mode.tool,
										patch: mode.patch,
									} );
									dispatch( {
										type: 'SET_TOOL',
										tool: mode.tool,
									} );
								} )
							}
						>
							<span className="ai-tile-icon">
								{ mode.icon() }
							</span>
							<span className="ai-tile-name">
								{ mode.label() }
							</span>
						</button>
					) ) }
				</div>
			</div>
			<div className="selp-main">
				<div className="selp-current">
					<span className="selp-size">
						{ hasArea
							? `${ Math.round( frame.w ) } × ${ Math.round(
									frame.h
							  ) } px`
							: __( 'No selection', 'wunderpaint' ) }
					</span>
					<button
						type="button"
						className={ `ai-btn secondary sm ${
							canRestore ? 'selp-restore' : 'selp-deselect'
						}` }
						disabled={ ! state.selection && ! canRestore }
						title={
							canRestore
								? __( 'Restore last selection', 'wunderpaint' )
								: `${ __(
										'Deselect',
										'wunderpaint'
								  ) } (Ctrl/⌘+D)`
						}
						onClick={ () =>
							run( () =>
								canRestore
									? restoreSelectionOp( editor )
									: deselectOp( editor )
							)
						}
					>
						{ canRestore
							? _x( 'Restore', 'selection panel', 'wunderpaint' )
							: _x(
									'Deselect',
									'selection panel',
									'wunderpaint'
							  ) }
					</button>
				</div>
				<div className="selp-settings">
					{ isSelectionTool && ! editing && (
						<section
							className="selp-section"
							aria-label={ __( 'New selection', 'wunderpaint' ) }
						>
							<h3 className="selp-section-title">
								{ __( 'Draw selection', 'wunderpaint' ) }
							</h3>
							{ state.tool === 'smartselect' ? (
								<p className="selp-hint">
									{ isModelInstalled( 'smart-select' )
										? __(
												'Click to include an area; Alt-click to exclude it.',
												'wunderpaint'
										  )
										: __(
												'Smart Select needs its model. Download it under Settings → WunderPaint → AI Models.',
												'wunderpaint'
										  ) }
								</p>
							) : (
								<>
									<div
										className="dsm-seg selp-combine"
										role="group"
										aria-label={ __(
											'Selection mode',
											'wunderpaint'
										) }
									>
										{ [
											[
												'replace',
												__( 'New', 'wunderpaint' ),
											],
											[
												'add',
												_x(
													'Add',
													'selection mode',
													'wunderpaint'
												),
											],
											[
												'subtract',
												__( 'Subtract', 'wunderpaint' ),
											],
										].map( ( [ id, label ] ) => (
											<button
												type="button"
												key={ id }
												className={
													( opts.combine ||
														'replace' ) === id
														? 'active'
														: ''
												}
												aria-pressed={
													( opts.combine ||
														'replace' ) === id
												}
												onClick={ () =>
													set( 'combine', id )
												}
											>
												{ label }
											</button>
										) ) }
									</div>
									<p className="selp-hint">
										{ opts.combine === 'subtract'
											? __(
													'Draw to remove an area.',
													'wunderpaint'
											  )
											: opts.combine === 'add'
											? __(
													'Draw to add an area.',
													'wunderpaint'
											  )
											: __(
													'Draw a new selection.',
													'wunderpaint'
											  ) }
									</p>
									{ state.tool === 'marquee' && (
										<>
											<Choice
												label={ __(
													'Size',
													'wunderpaint'
												) }
												value={
													opts.sizeMode || 'free'
												}
												options={ [
													[
														'free',
														__(
															'Free',
															'wunderpaint'
														),
													],
													[ 'square', '1:1' ],
													[
														'fixed',
														__(
															'Fixed size',
															'wunderpaint'
														),
													],
												] }
												onChange={ ( value ) =>
													set( 'sizeMode', value )
												}
											/>
											{ opts.sizeMode === 'fixed' && (
												<>
													<div className="selp-dimensions">
														<PixelField
															label={ __(
																'Width',
																'wunderpaint'
															) }
															value={
																opts.width ||
																100
															}
															onChange={ ( v ) =>
																set(
																	'width',
																	v
																)
															}
														/>
														<PixelField
															label={ __(
																'Height',
																'wunderpaint'
															) }
															value={
																opts.height ||
																100
															}
															onChange={ ( v ) =>
																set(
																	'height',
																	v
																)
															}
														/>
													</div>
													<p className="selp-hint">
														{ __(
															'Click to place; drag to position. Shift adds; Alt subtracts.',
															'wunderpaint'
														) }
													</p>
												</>
											) }
										</>
									) }
									{ state.tool === 'wand' && (
										<>
											<Setting
												label={ __(
													'Tolerance',
													'wunderpaint'
												) }
												value={ opts.tolerance ?? 32 }
												min={ 0 }
												max={ 255 }
												def={ 32 }
												suffix=""
												onChange={ ( v ) =>
													set( 'tolerance', v )
												}
											/>
											<Choice
												label={ __(
													'Color matching',
													'wunderpaint'
												) }
												value={
													opts.contiguous === false
														? 'global'
														: 'contiguous'
												}
												options={ [
													[
														'contiguous',
														__(
															'Contiguous',
															'wunderpaint'
														),
													],
													[
														'global',
														__(
															'Global',
															'wunderpaint'
														),
													],
												] }
												onChange={ ( v ) =>
													set(
														'contiguous',
														v !== 'global'
													)
												}
											/>
										</>
									) }
									{ activeMode === 'polygon' && (
										<p className="selp-hint">
											{ __(
												'Click corners; Enter or double-click closes the selection.',
												'wunderpaint'
											) }
										</p>
									) }
								</>
							) }
						</section>
					) }
					<section
						className="selp-section selp-edge"
						aria-label={ __( 'Selection edge', 'wunderpaint' ) }
					>
						<h3 className="selp-section-title">
							{ __( 'Selection edge', 'wunderpaint' ) }
						</h3>
						<Setting
							label={ __( 'Feather', 'wunderpaint' ) }
							value={ feather.value }
							min={ 0 }
							max={ 250 }
							def={ 0 }
							suffix="px"
							onChange={ ( value ) =>
								run( () => feather.onChange( value ) )
							}
							onCommit={ feather.onCommit }
						/>
						<p className="selp-hint">
							{ state.selection
								? __(
										'Changes the current selection immediately.',
										'wunderpaint'
								  )
								: __(
										'Applies to the next selection you draw.',
										'wunderpaint'
								  ) }
						</p>
						<Choice
							label={ __( 'Preview', 'wunderpaint' ) }
							value={ state.selectionPreview }
							disabled={ ! state.selection }
							options={ [
								[
									'outline',
									__( 'Image and outline', 'wunderpaint' ),
								],
								[
									'mask',
									__( 'Black and white', 'wunderpaint' ),
								],
							] }
							onChange={ ( mode ) =>
								dispatch( {
									type: 'SET_SELECTION_PREVIEW',
									mode,
								} )
							}
						/>
					</section>
					<section
						className="selp-section"
						aria-label={ __( 'Selection actions', 'wunderpaint' ) }
					>
						<h3 className="selp-section-title">
							{ __( 'Use selection', 'wunderpaint' ) }
						</h3>
						<div className="selp-commands">
							<Action
								label={ __( 'Fill', 'wunderpaint' ) }
								description={ __(
									'Foreground color on a new layer.',
									'wunderpaint'
								) }
								disabled={ ! hasArea }
								onClick={ () =>
									run( () => fillSelectionOp( editor ) )
								}
							/>
							<Action
								label={ __( 'Mask', 'wunderpaint' ) }
								description={ __(
									'Hide the unselected area of this layer.',
									'wunderpaint'
								) }
								disabled={
									! hasArea ||
									! activeLayer ||
									!! activeLayer.mask
								}
								onClick={ () =>
									run( () => addMaskOp( editor ) )
								}
							/>
							<Action
								label={ __( 'Layer via Copy', 'wunderpaint' ) }
								description={ __(
									'Copy selected pixels to a new layer.',
									'wunderpaint'
								) }
								disabled={ ! hasArea || ! activeLayer }
								onClick={ () =>
									run( () => layerViaCopyOp( editor ) )
								}
							/>
						</div>
					</section>
					<details
						className="selp-fold"
						onToggle={ ( e ) => {
							if ( ! e.currentTarget.open && editing ) {
								onEditingChange( false );
							}
						} }
					>
						<summary>
							{ __( 'Edit selection', 'wunderpaint' ) }
						</summary>
						<section
							className="selp-commands"
							aria-label={ __( 'Edit selection', 'wunderpaint' ) }
						>
							<Action
								className="selp-transform-toggle"
								label={
									editing
										? __( 'Done', 'wunderpaint' )
										: __( 'Transform', 'wunderpaint' )
								}
								description={ __(
									'Move or resize the selection.',
									'wunderpaint'
								) }
								disabled={ ! editing && ! hasArea }
								pressed={ editing }
								onClick={ () =>
									run( () => onEditingChange( ! editing ) )
								}
							/>
							{ editing && frame && (
								<>
									<div className="selp-dimensions">
										<PixelField
											label="X"
											value={ frame.x }
											min={ -32768 }
											onChange={ ( v ) =>
												setFrame( 'x', v )
											}
										/>
										<PixelField
											label="Y"
											value={ frame.y }
											min={ -32768 }
											onChange={ ( v ) =>
												setFrame( 'y', v )
											}
										/>
										<PixelField
											label={ __(
												'Width',
												'wunderpaint'
											) }
											value={ frame.w }
											onChange={ ( v ) =>
												setFrame( 'w', v )
											}
										/>
										<PixelField
											label={ __(
												'Height',
												'wunderpaint'
											) }
											value={ frame.h }
											onChange={ ( v ) =>
												setFrame( 'h', v )
											}
										/>
									</div>
									<p className="selp-hint">
										{ __(
											'Drag the selection or its handles. Shift keeps proportions; Escape cancels a drag.',
											'wunderpaint'
										) }
									</p>
								</>
							) }
							<Action
								label={ __( 'Select All', 'wunderpaint' ) }
								description={ __(
									'Select the whole document.',
									'wunderpaint'
								) }
								onClick={ () =>
									run( () => selectAllOp( editor ) )
								}
							/>
							<Action
								label={ __( 'Inverse', 'wunderpaint' ) }
								description={ __(
									'Swap selected and unselected areas.',
									'wunderpaint'
								) }
								disabled={ ! state.selection }
								onClick={ () =>
									run( () => inverseSelectionOp( editor ) )
								}
							/>
							{ MODIFICATIONS.map( ( [ kind, label ] ) => (
								<Action
									key={ kind }
									label={ label() }
									description={ modificationHints[ kind ] }
									disabled={ ! hasArea }
									onClick={ () =>
										run( () =>
											modifySelectionPrompt(
												editor,
												kind
											)
										)
									}
								/>
							) ) }
						</section>
					</details>
					<details className="selp-fold selp-library">
						<summary>
							{ __( 'Saved selections', 'wunderpaint' ) }
						</summary>
						<section
							className="selp-commands"
							aria-label={ __(
								'Saved selections',
								'wunderpaint'
							) }
						>
							<Action
								label={ __( 'Save', 'wunderpaint' ) }
								description={ __(
									'Keep this selection for later.',
									'wunderpaint'
								) }
								disabled={ ! hasArea }
								onClick={ () =>
									run( () => saveSelectionOp( editor ) )
								}
							/>
							{ state.savedSelections.length ? (
								<div className="selp-saved-grid">
									{ state.savedSelections.map( ( item ) => (
										<SavedSelection
											key={ item.name }
											item={ item }
											doc={ state.doc }
											active={
												item.sel === state.selection
											}
											onLoad={ () =>
												run( () => {
													dispatch( {
														type: 'LOAD_SELECTION',
														name: item.name,
													} );
													editor.commit(
														__(
															'Load Selection',
															'wunderpaint'
														)
													);
												} )
											}
											onRemove={ () =>
												dispatch( {
													type: 'DELETE_SAVED_SELECTION',
													name: item.name,
												} )
											}
										/>
									) ) }
								</div>
							) : (
								<p className="selp-empty">
									{ __(
										'Save a selection to reuse it here.',
										'wunderpaint'
									) }
								</p>
							) }
						</section>
					</details>
				</div>
			</div>
		</div>
	);
}
