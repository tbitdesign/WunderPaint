/**
 * Shape Studio (v1.427): the shape tool's power room, with room to
 * breathe. The everyday surface is the floating shape panel
 * (panels/shape-panel.jsx) - same catalog, same dials, same preview, all
 * of it out of shape-studio-core. This modal is the one you open when a
 * generator wants a preview bigger than a panel column, so it shows all
 * twelve groups at once and a preview four times the size.
 *
 * It is also the only one of the two that COLLECTS: nothing happens until
 * Insert or Apply. The panel writes as you turn.
 */

import { useMemo, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import {
	ShapeDials,
	ShapeGrid,
	ShapePreview,
	STUDIO_GROUPS,
	cfgFromLayer,
	cfgFromToolOpts,
	layerPatch,
	newShapeLayer,
	pickPatch,
	shapeBox,
	toolOptsPatch,
} from './shape-studio-core';

export function ShapeStudioDialog( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const editLayer = layerId
		? state.layers.find( ( l ) => l.id === layerId ) || null
		: null;

	const [ cfg, setCfg ] = useState( () =>
		editLayer
			? cfgFromLayer( editLayer, state.fgColor )
			: cfgFromToolOpts( state.toolOpts?.shape, state.fgColor )
	);
	const patch = ( p ) => setCfg( ( c ) => ( { ...c, ...p } ) );
	const [ query, setQuery ] = useState( '' );

	// The box the preview and the corner radius are measured in. It must
	// not move while you turn a dial, only when the SHAPE changes.
	const box = useMemo(
		() => shapeBox( cfg, state.doc, editLayer ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ cfg.shape, cfg.pathD, layerId ]
	);

	const submit = () => {
		if ( editLayer ) {
			dispatch( {
				type: 'UPDATE_LAYER',
				id: editLayer.id,
				patch: layerPatch( cfg, editLayer.w, editLayer.h ),
			} );
			commit( __( 'Edit shape', 'wunderpaint' ) );
		} else {
			dispatch( {
				type: 'ADD_LAYER',
				layer: newShapeLayer( cfg, box, state.doc ),
			} );
			commit( __( 'Insert shape', 'wunderpaint' ) );
			// The quick picker follows the studio, so the next drag draws
			// the shape that was just dialed in. A path entry has no drag
			// twin, so it leaves the tool opts alone.
			if ( ! cfg.pathD ) {
				dispatch( {
					type: 'SET_TOOL_OPTS',
					tool: 'shape',
					patch: toolOptsPatch( cfg ),
				} );
			}
		}
		onClose();
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog shape-studio-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Shape Studio', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Shape Studio', 'wunderpaint' ) }
							</span>
							<HelpLink article="tools" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Dial a shape in: corners, slices, teeth, tails. It stays editable forever.',
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

				<div className="ssd-body">
					{ /* ------------------------ shapes ------------------- */ }
					<div className="ssd-catalog">
						<input
							type="search"
							className="ssd-search"
							placeholder={ __(
								'Search shapes…',
								'wunderpaint'
							) }
							value={ query }
							onChange={ ( e ) =>
								setQuery( e.target.value.toLowerCase() )
							}
						/>
						<ShapeGrid
							groups={ STUDIO_GROUPS }
							query={ query }
							entryKey={ cfg.entryKey }
							onPick={ ( entry ) => patch( pickPatch( entry ) ) }
						/>
					</div>

					{ /* ------------------------ preview ------------------ */ }
					<div className="ssd-stage">
						<ShapePreview cfg={ cfg } box={ box } area={ 340 } />
					</div>

					{ /* ------------------------ dials -------------------- */ }
					<div className="ssd-dials">
						<ShapeDials cfg={ cfg } patch={ patch } box={ box } />
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __(
							'Lands as a shape layer - reopen the studio any time with a double-click.',
							'wunderpaint'
						) }
					</div>
					<div className="ssd-foot-actions">
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button className="ai-btn primary" onClick={ submit }>
							{ editLayer
								? __( 'Apply', 'wunderpaint' )
								: __( 'Insert shape', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
