/**
 * Adjust panel (spec 06.3): the tonal Adjustments sliders (bound live to the
 * active layer), auto-levels/contrast/colour, Create Adjustment Layer and the
 * colour block. Filters and Effects moved to the Effects tab in v1.25.0.
 */

import { Fragment, useId } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import { recordStep } from '../../lib/macro-recorder';
import { SnapSlider } from '../../components/snap-slider';
import { defaultAdjustments, makeAdjustment } from '../../store/document';
import { useEditor, activeLayerOf } from '../../store/editor-context';
import { applyEffectToLayer } from '../../store/effect-ops';
import { ColorPopover } from '../../components/color-popover';
import { PanelGroup, PanelSection } from '../../components/panel-section';
import { useGradients } from '../../content/use-content';

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
	const colorKey =
		colorLayer && 'text' === colorLayer.type ? 'color' : 'fill';
	const pickerColor = colorLayer
		? colorLayer[ colorKey ] || '#1a1d21'
		: state.fgColor;
	const gradients = useGradients();
	const applyColor = ( c ) => {
		if ( colorLayer ) {
			const patch = { [ colorKey ]: c };
			// Picking a solid colour switches a gradient/pattern fill back to
			// solid so the colour actually shows.
			if ( undefined !== colorLayer.fillType ) {
				patch.fillType = 'solid';
			}
			dispatch( { type: 'UPDATE_LAYER', id: colorLayer.id, patch } );
			commit( __( 'Color', 'wunderpaint' ) );
		} else {
			dispatch( { type: 'SET_FG', color: c } );
		}
	};
	// One-click gradient fill for the selected shape/text layer.
	const applyGradient = ( preset ) => {
		if ( ! colorLayer ) {
			return;
		}
		const patch = {
			fillType: 'gradient',
			gradientStops: preset.stops.map( ( s ) => ( { ...s } ) ),
		};
		if ( 'shape' === colorLayer.type ) {
			patch.gradientKind = preset.kind || 'linear';
		}
		dispatch( { type: 'UPDATE_LAYER', id: colorLayer.id, patch } );
		commit( __( 'Gradient fill', 'wunderpaint' ) );
	};

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
									fontSize: 10,
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
				<PanelGroup title={ __( 'Fine tune', 'wunderpaint' ) }>
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
							className="ai-btn secondary"
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
							{ __( 'Reset', 'wunderpaint' ) }
						</button>
					</div>
				</PanelGroup>
			</PanelSection>

			<PanelSection
				wsKey="adjust.color"
				title={ __( 'Color', 'wunderpaint' ) }
			>
				{ /* The full colour picker lives here (foreground colour): HSV,
				   hex/RGB/HSL, alpha and every swatch group. The foreground/
				   background swap is in the toolbar, so it is not repeated. */ }
				<ColorPopover
					embedded
					color={ pickerColor }
					onChange={ applyColor }
				/>
				{ colorLayer && gradients.length > 0 && (
					<>
						<div className="adjust-grad-head">
							{ __( 'Gradient fill', 'wunderpaint' ) }
						</div>
						<div className="adjust-grads">
							{ gradients.slice( 0, 24 ).map( ( g ) => (
								<button
									key={ g.name }
									className="adjust-grad"
									title={ g.name }
									style={ {
										background: `linear-gradient(135deg, ${ g.stops
											.map(
												( s ) =>
													`${ s.color } ${ Math.round(
														s.at * 100
													) }%`
											)
											.join( ', ' ) })`,
									} }
									onClick={ () => applyGradient( g ) }
								/>
							) ) }
						</div>
					</>
				) }
			</PanelSection>
		</Fragment>
	);
}
