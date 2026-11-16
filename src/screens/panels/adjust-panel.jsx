/**
 * Adjust panel (spec 06.3): the tonal Adjustments sliders (bound live to the
 * active layer), auto-levels/contrast/colour, Create Adjustment Layer and the
 * colour block. Filters and Effects moved to the Effects tab in v1.25.0.
 */

import { Fragment, useId, useEffect, useCallback } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { recordStep } from '../../lib/macro-recorder';
import { SnapSlider } from '../../components/snap-slider';
import { defaultAdjustments, makeAdjustment } from '../../store/document';
import { useEditor, activeLayerOf } from '../../store/editor-context';
import { applyEffectToLayer } from '../../store/effect-ops';
import { SwatchButton } from '../../components/color-popover';
import { PanelGroup, PanelSection } from '../../components/panel-section';
import { PaintSwatch } from '../../components/paint-controls';

const ADJUSTMENT_ROWS = [
	{
		k: 'brightness',
		label: __( 'Brightness', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
	{
		k: 'contrast',
		label: __( 'Contrast', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
	{
		k: 'saturation',
		label: __( 'Saturation', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
	{ k: 'hue', label: __( 'Hue', 'wunderpaint' ), min: -180, max: 180 },
	{
		k: 'temp',
		label: __( 'Temperature', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
	{
		k: 'exposure',
		label: __( 'Exposure', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
	{
		k: 'vibrance',
		label: __( 'Vibrance', 'wunderpaint' ),
		min: -100,
		max: 100,
	},
];

/** A held comparison uses the existing canvas-only preview channel. */
function AdjustmentCompare( { layer } ) {
	const { state, dispatch } = useEditor();
	const id = useId();
	const owner = 'adjust:' + id;
	const held = state.colorPreview?.owner === owner;
	const available =
		!! layer && Object.values( layer.adjust || {} ).some( ( v ) => v );
	const stop = useCallback(
		() => dispatch( { type: 'CLEAR_COLOR_PREVIEW', owner } ),
		[ dispatch, owner ]
	);
	useEffect( () => {
		const releaseKey = ( e ) => {
			if ( [ ' ', 'Enter', 'Escape' ].includes( e.key ) ) {
				stop();
			}
		};
		const hidden = () => {
			if ( document.hidden ) {
				stop();
			}
		};
		window.addEventListener( 'pointerup', stop );
		window.addEventListener( 'pointercancel', stop );
		window.addEventListener( 'blur', stop );
		window.addEventListener( 'keyup', releaseKey );
		document.addEventListener( 'visibilitychange', hidden );
		return () => {
			window.removeEventListener( 'pointerup', stop );
			window.removeEventListener( 'pointercancel', stop );
			window.removeEventListener( 'blur', stop );
			window.removeEventListener( 'keyup', releaseKey );
			document.removeEventListener( 'visibilitychange', hidden );
			stop();
		};
	}, [ stop, layer?.id ] );
	const start = () => {
		if ( available ) {
			dispatch( {
				type: 'SET_COLOR_PREVIEW',
				owner,
				scope: 'adjustments',
				baseLayers: state.layers,
				baseDoc: state.doc,
				patches: new Map( [ [ layer.id, { adjust: null } ] ] ),
			} );
		}
	};
	return (
		<button
			type="button"
			className="ai-btn secondary sm adjust-compare"
			disabled={ ! available }
			aria-pressed={ held }
			title={ __(
				'Hold to preview this layer without adjustments',
				'wunderpaint'
			) }
			aria-label={ __(
				'Hold to preview this layer without adjustments',
				'wunderpaint'
			) }
			onPointerDown={ ( e ) => {
				if ( e.button !== 0 ) {
					return;
				}
				e.preventDefault();
				e.currentTarget.focus();
				e.currentTarget.setPointerCapture?.( e.pointerId );
				start();
			} }
			onPointerUp={ stop }
			onPointerCancel={ stop }
			onLostPointerCapture={ stop }
			onBlur={ stop }
			onKeyDown={ ( e ) => {
				if ( e.key === 'Escape' ) {
					stop();
				} else if ( e.key === ' ' || e.key === 'Enter' ) {
					e.preventDefault();
					e.stopPropagation();
					if ( ! e.repeat ) {
						start();
					}
				}
			} }
			onKeyUp={ ( e ) => {
				if ( e.key === ' ' || e.key === 'Enter' ) {
					e.preventDefault();
					e.stopPropagation();
					stop();
				}
			} }
		>
			{ I.eye( { size: 13 } ) }
			{ held
				? __( 'Before', 'wunderpaint' )
				: __( 'Compare', 'wunderpaint' ) }
		</button>
	);
}

export function AdjustPanel( { extras } ) {
	// Unique per mount, so two of these can never share an id.
	const fieldId = useId();
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const layer = activeLayerOf( state );

	const adjust = layer?.adjust || defaultAdjustments();

	// The Color picker applies to the selected layer (a shape's fill or a text
	// layer's colour). With no colourable layer selected it sets the
	// foreground colour, as before.
	const colorLayer =
		layer && ( 'shape' === layer.type || 'text' === layer.type )
			? layer
			: null;

	const setAdjust = ( key, value ) => {
		if ( ! layer ) {
			return;
		}
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { adjust: { ...adjust, [ key ]: value } },
		} );
	};

	const createAdjustmentLayer = () => {
		const idx = layer
			? state.layers.findIndex( ( l ) => l.id === layer.id )
			: state.layers.length - 1;
		const adjustment = makeAdjustment( {
			name: __( 'Adjustment', 'wunderpaint' ),
			x: 0,
			y: 0,
			w: state.doc.w,
			h: state.doc.h,
			adjust: { ...adjust },
		} );
		dispatch( { type: 'ADD_LAYER', layer: adjustment, index: idx + 1 } );
		if ( layer && layer.adjust ) {
			dispatch( {
				type: 'UPDATE_LAYER',
				id: layer.id,
				patch: { adjust: null },
			} );
		}
		commit( __( 'Create Adjustment Layer', 'wunderpaint' ) );
	};

	return (
		<Fragment>
			<PanelSection
				wsKey="adjust.adjustments"
				title={ __( 'Adjustments', 'wunderpaint' ) }
			>
				<PanelGroup title={ __( 'Quick fixes', 'wunderpaint' ) }>
					<div style={ { display: 'flex', gap: 4 } }>
						{ [
							[
								'auto-levels',
								__( 'Auto Levels', 'wunderpaint' ),
							],
							[
								'auto-contrast',
								__( 'Auto Contrast', 'wunderpaint' ),
							],
							[ 'auto-color', __( 'Auto Color', 'wunderpaint' ) ],
						].map( ( [ id, label ] ) => (
							<button
								key={ id }
								className="ai-btn secondary"
								style={ {
									flex: 1,
									padding: '4px 2px',
								} }
								disabled={ ! layer }
								onClick={ () =>
									applyEffectToLayer( editor, id ).catch(
										() =>
											extras.toasts.error(
												__(
													'Could not apply the effect.',
													'wunderpaint'
												)
											)
									)
								}
							>
								{ label }
							</button>
						) ) }
					</div>
				</PanelGroup>
				<PanelGroup
					title={
						<span className="adjust-compare-head">
							<span>{ __( 'Fine tune', 'wunderpaint' ) }</span>
							<AdjustmentCompare layer={ layer } />
						</span>
					}
				>
					{ ADJUSTMENT_ROWS.map( ( row ) => (
						<div
							key={ row.k }
							data-ws={ 'adjust.slider.' + row.k }
							className="slider-row"
						>
							<label htmlFor={ fieldId + '-' + row.key }>
								{ row.label }
							</label>
							<SnapSlider
								id={ fieldId + '-' + row.key }
								min={ row.min }
								max={ row.max }
								value={ adjust[ row.k ] || 0 }
								def={ 0 }
								disabled={ ! layer }
								ariaLabel={ row.label }
								onChange={ ( v ) => setAdjust( row.k, v ) }
								onCommit={ () => {
									if ( layer ) {
										commit(
											__( 'Adjust:', 'wunderpaint' ) +
												' ' +
												row.label
										);
										recordStep( 'setAdjustments', {
											adjust: { ...adjust },
										} );
									}
								} }
							/>
							<span className="val">
								{ ( adjust[ row.k ] || 0 ) > 0
									? '+' + adjust[ row.k ]
									: adjust[ row.k ] || 0 }
							</span>
						</div>
					) ) }
				</PanelGroup>
				<PanelGroup>
					<div style={ { display: 'flex', gap: 4 } }>
						<button
							className="ai-btn secondary"
							style={ { flex: 1 } }
							onClick={ createAdjustmentLayer }
						>
							{ I.sliders( { size: 13 } ) }{ ' ' }
							{ __( 'Create Adjustment Layer', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="dsm-mini"
							style={ { alignSelf: 'center' } }
							title={ __( 'Reset adjustments', 'wunderpaint' ) }
							aria-label={ __(
								'Reset adjustments',
								'wunderpaint'
							) }
							disabled={ ! layer }
							onClick={ () => {
								dispatch( {
									type: 'UPDATE_LAYER',
									id: layer.id,
									patch: { adjust: null },
								} );
								commit(
									__( 'Reset adjustments', 'wunderpaint' )
								);
							} }
						>
							{ I.rotateCcw( { size: 14 } ) }
						</button>
					</div>
				</PanelGroup>
			</PanelSection>

			<PanelSection
				wsKey="adjust.color"
				title={ __( 'Color', 'wunderpaint' ) }
			>
				<div>
					{ colorLayer ? (
						<>
							<div className="field">
								<span className="field-label">
									{ __( 'Fill', 'wunderpaint' ) }
								</span>
								<PaintSwatch
									layer={ colorLayer }
									title={ __( 'Fill', 'wunderpaint' ) }
									onChange={ ( patch ) => {
										dispatch( {
											type: 'UPDATE_LAYER',
											id: colorLayer.id,
											patch,
										} );
										commit( __( 'Paint', 'wunderpaint' ) );
									} }
								/>
							</div>
							<div className="field">
								<span className="field-label">
									{ __( 'Stroke', 'wunderpaint' ) }
								</span>
								<PaintSwatch
									layer={ colorLayer }
									target="stroke"
									title={ __( 'Stroke', 'wunderpaint' ) }
									onChange={ ( patch ) => {
										dispatch( {
											type: 'UPDATE_LAYER',
											id: colorLayer.id,
											patch,
										} );
										commit( __( 'Paint', 'wunderpaint' ) );
									} }
								/>
							</div>
						</>
					) : (
						<div className="field">
							<span className="field-label">
								{ __( 'Foreground', 'wunderpaint' ) }
							</span>
							<SwatchButton
								color={ state.fgColor }
								title={ __( 'Foreground', 'wunderpaint' ) }
								onChange={ ( color ) =>
									dispatch( { type: 'SET_FG', color } )
								}
							/>
						</div>
					) }
				</div>
			</PanelSection>
		</Fragment>
	);
}
