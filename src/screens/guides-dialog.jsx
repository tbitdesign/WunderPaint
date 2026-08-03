/**
 * Guides & grid manager (v1.1): numeric guide editing, presets and a
 * configurable grid size, the drag-from-ruler workflow stays untouched.
 */

import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { presetGuides, mergeGuides } from '../lib/guides';

export function GuidesDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const guides = state.doc.guides || [];
	const [ axis, setAxis ] = useState( 'v' );
	const [ pos, setPos ] = useState( '' );
	const [ unit, setUnit ] = useState( 'px' );
	useEscape( onClose );

	const setGuides = ( list, label ) => {
		dispatch( { type: 'SET_DOC', doc: { guides: list } } );
		commit( label || __( 'Edit guides', 'wunderpaint' ) );
	};

	const addGuide = () => {
		const raw = parseFloat( pos );
		if ( Number.isNaN( raw ) ) {
			return;
		}
		const max = 'v' === axis ? state.doc.w : state.doc.h;
		const value =
			'%' === unit
				? Math.round( ( raw / 100 ) * max )
				: Math.round( raw );
		setGuides(
			mergeGuides( guides, [
				{ axis, pos: Math.max( 0, Math.min( max, value ) ) },
			] ),
			__( 'Add guide', 'wunderpaint' )
		);
		setPos( '' );
	};

	const applyPreset = ( kind ) =>
		setGuides(
			mergeGuides(
				guides,
				presetGuides( kind, state.doc.w, state.doc.h )
			),
			__( 'Add guides', 'wunderpaint' )
		);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 420,
					height: 'auto',
					maxHeight: '85vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Guides & Grid', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Guides & Grid', 'wunderpaint' ) }
							</span>
							<HelpLink article="navigation" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Grid and guide lines for precise layouts.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>
				<div
					style={ {
						padding: 16,
						overflowY: 'auto',
						display: 'grid',
						gap: 14,
					} }
				>
					<div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
								textTransform: 'uppercase',
								letterSpacing: 0.5,
								marginBottom: 6,
							} }
						>
							{ __( 'New guide', 'wunderpaint' ) }
						</div>
						<div
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							<select
								className="dsm-select"
								value={ axis }
								onChange={ ( e ) => setAxis( e.target.value ) }
								aria-label={ __(
									'Orientation',
									'wunderpaint'
								) }
							>
								<option value="v">
									{ __( 'Vertical', 'wunderpaint' ) }
								</option>
								<option value="h">
									{ __( 'Horizontal', 'wunderpaint' ) }
								</option>
							</select>
							<input
								type="number"
								value={ pos }
								placeholder="0"
								onChange={ ( e ) => setPos( e.target.value ) }
								onKeyDown={ ( e ) =>
									'Enter' === e.key && addGuide()
								}
								style={ { width: 90 } }
								aria-label={ __( 'Position', 'wunderpaint' ) }
							/>
							<select
								className="dsm-select"
								value={ unit }
								onChange={ ( e ) => setUnit( e.target.value ) }
								aria-label={ __( 'Unit', 'wunderpaint' ) }
							>
								<option value="px">px</option>
								<option value="%">%</option>
							</select>
							<button
								className="ai-btn secondary"
								onClick={ addGuide }
							>
								{ __( 'Add', 'wunderpaint' ) }
							</button>
						</div>
						<div
							style={ {
								display: 'flex',
								gap: 6,
								marginTop: 8,
								flexWrap: 'wrap',
							} }
						>
							<button
								className="ai-btn secondary"
								onClick={ () => applyPreset( 'thirds' ) }
							>
								{ __( 'Thirds', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn secondary"
								onClick={ () => applyPreset( 'golden' ) }
							>
								{ __( 'Golden ratio', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn secondary"
								onClick={ () => applyPreset( 'margins' ) }
							>
								{ __( 'Margins 5%', 'wunderpaint' ) }
							</button>
							{ guides.length > 0 && (
								<button
									className="ai-btn secondary"
									onClick={ () =>
										setGuides(
											[],
											__( 'Clear guides', 'wunderpaint' )
										)
									}
								>
									{ __( 'Clear all', 'wunderpaint' ) }
								</button>
							) }
						</div>
					</div>
					{ guides.length > 0 && (
						<div
							style={ {
								border: '1px solid var(--ed-border)',
								borderRadius: 4,
								maxHeight: 200,
								overflowY: 'auto',
								fontSize: 12,
							} }
						>
							{ guides.map( ( g, i ) => (
								<div
									key={ i }
									style={ {
										display: 'flex',
										gap: 8,
										alignItems: 'center',
										padding: '4px 8px',
										borderBottom:
											'1px solid var(--ed-border)',
									} }
								>
									<span style={ { width: 80 } }>
										{ 'v' === g.axis
											? __( 'Vertical', 'wunderpaint' )
											: __(
													'Horizontal',
													'wunderpaint'
											  ) }
									</span>
									<input
										type="number"
										value={ g.pos }
										style={ { width: 80 } }
										onChange={ ( e ) => {
											const list = guides.map(
												( x, j ) =>
													j === i
														? {
																...x,
																pos: Math.round(
																	+e.target
																		.value ||
																		0
																),
														  }
														: x
											);
											setGuides( list );
										} }
										aria-label={ __(
											'Position',
											'wunderpaint'
										) }
									/>
									<span
										style={ {
											color: 'var(--ed-text-muted)',
										} }
									>
										px
									</span>
									<span style={ { flex: 1 } } />
									<button
										className="wp-modal-close"
										aria-label={ __(
											'Delete',
											'wunderpaint'
										) }
										onClick={ () =>
											setGuides(
												guides.filter(
													( _, j ) => j !== i
												),
												__(
													'Delete guide',
													'wunderpaint'
												)
											)
										}
									>
										{ I.close( { size: 12 } ) }
									</button>
								</div>
							) ) }
						</div>
					) }
					<div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
								textTransform: 'uppercase',
								letterSpacing: 0.5,
								marginBottom: 6,
							} }
						>
							{ __( 'Grid', 'wunderpaint' ) }
						</div>
						<div
							style={ {
								display: 'flex',
								gap: 10,
								alignItems: 'center',
								fontSize: 12,
							} }
						>
							<label
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								<input
									type="checkbox"
									checked={ state.showGrid }
									onChange={ () =>
										dispatch( { type: 'TOGGLE_GRID' } )
									}
								/>
								{ __( 'Show grid', 'wunderpaint' ) }
							</label>
							<label
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								{ __( 'Spacing', 'wunderpaint' ) }
								<input
									type="number"
									min="4"
									max="500"
									value={ state.gridSize }
									style={ { width: 70 } }
									onChange={ ( e ) =>
										dispatch( {
											type: 'SET_GRID_SIZE',
											size: Math.max(
												4,
												Math.min(
													500,
													Math.round(
														+e.target.value || 50
													)
												)
											),
										} )
									}
								/>
								px
							</label>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
