/**
 * Actions panel (v0.4): record op sequences, replay them, manage saved
 * actions/looks, share them as JSON files.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { useEditor, activeLayerOf } from '../../store/editor-context';
import {
	isRecording,
	startRecording,
	stopRecording,
	recordedSteps,
	subscribeRecorder,
} from '../../lib/macro-recorder';
import {
	listActions,
	saveMacro,
	deleteMacro,
	runMacro,
	stepLabel,
	lookFromLayer,
	exportMacros,
	importMacros,
} from '../../lib/macros';
import { ACTION_CATEGORIES } from '../../lib/bundled-actions';
import { downloadBlob } from '../../lib/download';
import { promptDialog } from '../../lib/dialogs';
import { PanelSection } from '../../components/panel-section';

export function ActionsPanel( { extras } ) {
	const editor = useEditor();
	const [ , setTick ] = useState( 0 );
	const [ macros, setMacros ] = useState( listActions );
	const [ playing, setPlaying ] = useState( null );
	const refresh = () => setMacros( listActions() );

	useEffect( () => subscribeRecorder( () => setTick( ( t ) => t + 1 ) ), [] );

	const recording = isRecording();
	const steps = recordedSteps();
	const layer = activeLayerOf( editor.state );

	const finishRecording = async () => {
		const recorded = stopRecording();
		if ( ! recorded.length ) {
			extras.toasts.toast(
				__(
					'Nothing recorded, apply filters, effects, adjustments or image operations while recording.',
					'wunderpaint'
				)
			);
			return;
		}
		const name = await promptDialog( {
			title: __( 'Save Action', 'wunderpaint' ),
			label: __( 'Name for this action', 'wunderpaint' ),
			defaultValue: __( 'My action', 'wunderpaint' ),
		} );
		if ( null === name ) {
			return;
		}
		saveMacro( { name: name || 'Action', steps: recorded } );
		refresh();
	};

	const play = async ( macro ) => {
		setPlaying( macro.id );
		try {
			await runMacro( editor, macro.steps );
			extras.toasts.success(
				sprintf(
					/* translators: %s: action name. */
					__( '“%s” applied.', 'wunderpaint' ),
					macro.name
				)
			);
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setPlaying( null );
	};

	const saveLook = async () => {
		if ( ! layer ) {
			return;
		}
		const lookSteps = lookFromLayer( layer );
		if ( ! lookSteps.length ) {
			extras.toasts.toast(
				__(
					'The active layer has no filter or adjustments to save.',
					'wunderpaint'
				)
			);
			return;
		}
		const name = await promptDialog( {
			title: __( 'Save Look', 'wunderpaint' ),
			label: __( 'Name for this look', 'wunderpaint' ),
			defaultValue:
				layer.filter && 'none' !== layer.filter ? layer.filter : 'Look',
		} );
		if ( null === name ) {
			return;
		}
		saveMacro( { name: name || 'Look', kind: 'look', steps: lookSteps } );
		refresh();
	};

	const importFile = () => {
		const input = document.createElement( 'input' );
		input.type = 'file';
		input.accept = '.json,application/json';
		input.onchange = async () => {
			const file = input.files?.[ 0 ];
			if ( ! file ) {
				return;
			}
			try {
				const count = importMacros( await file.text() );
				refresh();
				extras.toasts.success(
					sprintf(
						/* translators: %d: number of actions. */
						__( '%d action(s) imported.', 'wunderpaint' ),
						count
					)
				);
			} catch ( err ) {
				extras.toasts.error( err.message );
			}
		};
		input.click();
	};

	return (
		<div style={ { padding: '8px 10px' } }>
			<PanelSection title={ __( 'Recorder', 'wunderpaint' ) }>
				<div style={ { display: 'flex', gap: 6 } }>
					{ ! recording ? (
						<button
							className="ai-btn primary"
							style={ { flex: 1 } }
							onClick={ startRecording }
						>
							● { __( 'Record', 'wunderpaint' ) }
						</button>
					) : (
						<button
							className="ai-btn primary"
							style={ { flex: 1 } }
							onClick={ finishRecording }
						>
							■ { __( 'Stop & Save', 'wunderpaint' ) } (
							{ steps.length })
						</button>
					) }
					<button
						className="ai-btn secondary"
						disabled={ ! layer }
						title={ __(
							'Save the active layer’s filter + adjustments as a reusable look',
							'wunderpaint'
						) }
						onClick={ saveLook }
					>
						{ __( 'Save Look', 'wunderpaint' ) }
					</button>
				</div>
				{ recording && (
					<div
						style={ {
							fontSize: 11,
							color: 'var(--ed-text-dim)',
							marginTop: 6,
						} }
					>
						{ steps.length
							? steps.map( ( s, i ) => (
									<div key={ i }>• { stepLabel( s ) }</div>
							  ) )
							: __(
									'Recording… apply filters, effects, adjustments, resize/rotate/flip/flatten.',
									'wunderpaint'
							  ) }
					</div>
				) }
			</PanelSection>

			<PanelSection title={ __( 'Saved Actions', 'wunderpaint' ) }>
				{ ( () => {
					const userMacros = macros.filter( ( m ) => ! m.builtIn );
					const row = ( macro ) => (
						<div
							key={ macro.id }
							style={ {
								border: '1px solid var(--ed-border)',
								borderRadius: 4,
								padding: '6px 8px',
								marginBottom: 6,
							} }
						>
							<div
								style={ {
									display: 'flex',
									alignItems: 'center',
									gap: 6,
								} }
							>
								<span
									style={ {
										flex: 1,
										fontSize: 12,
										fontWeight: 600,
									} }
								>
									{ 'look' === macro.kind ? '🎨 ' : '▶ ' }
									{ macro.name }
								</span>
								<button
									className="ai-btn secondary"
									style={ { padding: '2px 8px' } }
									disabled={ !! playing }
									onClick={ () => play( macro ) }
								>
									{ playing === macro.id ? (
										<span className="spin" />
									) : (
										__( 'Play', 'wunderpaint' )
									) }
								</button>
								{ ! macro.builtIn && (
									<button
										className="ai-btn secondary"
										style={ { padding: '2px 8px' } }
										aria-label={ __(
											'Delete',
											'wunderpaint'
										) }
										onClick={ () => {
											deleteMacro( macro.id );
											refresh();
										} }
									>
										🗑
									</button>
								) }
							</div>
							<div
								style={ {
									fontSize: 10,
									color: 'var(--ed-text-muted)',
									marginTop: 2,
								} }
							>
								{ macro.steps
									.map( ( s ) => stepLabel( s ) )
									.join( ' → ' ) }
							</div>
						</div>
					);
					const head = ( label ) => (
						<div
							style={ {
								margin: '10px 0 6px',
								fontSize: 10.5,
								fontWeight: 700,
								letterSpacing: '0.05em',
								textTransform: 'uppercase',
								color: 'var(--ed-text-dim)',
							} }
						>
							{ label }
						</div>
					);
					return (
						<>
							{ userMacros.length > 0 &&
								head( __( 'My Actions', 'wunderpaint' ) ) }
							{ userMacros.map( row ) }
							{ 0 === userMacros.length && (
								<div
									style={ {
										fontSize: 11,
										color: 'var(--ed-text-muted)',
									} }
								>
									{ __(
										'No own actions yet. Record one or save a look; the bundled set below works right away.',
										'wunderpaint'
									) }
								</div>
							) }
							{ Object.entries( ACTION_CATEGORIES ).map(
								( [ key, label ] ) => {
									const inCat = macros.filter(
										( m ) => m.builtIn && m.category === key
									);
									return inCat.length ? (
										<div key={ key }>
											{ head( label() ) }
											{ inCat.map( row ) }
										</div>
									) : null;
								}
							) }
						</>
					);
				} )() }
				<div style={ { display: 'flex', gap: 6, marginTop: 4 } }>
					<button
						className="ai-btn secondary"
						style={ { flex: 1 } }
						disabled={ ! macros.some( ( m ) => ! m.builtIn ) }
						onClick={ () =>
							downloadBlob(
								new window.Blob( [ exportMacros() ], {
									type: 'application/json',
								} ),
								'wpie-actions.json'
							)
						}
					>
						⇩ { __( 'Export', 'wunderpaint' ) }
					</button>
					<button
						className="ai-btn secondary"
						style={ { flex: 1 } }
						onClick={ importFile }
					>
						⇪ { __( 'Import', 'wunderpaint' ) }
					</button>
				</div>
			</PanelSection>

			<PanelSection title={ __( 'Batch', 'wunderpaint' ) }>
				<div
					style={ {
						fontSize: 11,
						color: 'var(--ed-text-dim)',
						marginBottom: 6,
					} }
				>
					{ __(
						'Apply an action to many library images at once.',
						'wunderpaint'
					) }
				</div>
				<button
					className="ai-btn secondary"
					style={ { width: '100%' } }
					onClick={ () => extras.openBatch() }
				>
					{ __( 'Batch Process…', 'wunderpaint' ) }
				</button>
			</PanelSection>
		</div>
	);
}
