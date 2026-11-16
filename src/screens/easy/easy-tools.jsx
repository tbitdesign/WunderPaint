import { __ } from '@wordpress/i18n';
import { useId } from '@wordpress/element';
import { I } from '../../icons';
import * as Ops from '../../store/ops';
import { DEFAULT_TOOL_OPTS } from '../../store/constants';
import { SnapSlider } from '../../components/snap-slider';
import { GradientBar } from '../../components/gradient-bar';
import { SwatchButton } from '../../components/color-popover';
import { PanelSection } from '../../components/panel-section';
import { groupedTips } from '../../lib/brush-tips';
import { PAINT_STYLES } from '../../lib/paint-engine';
import { EasyCard } from './easy-start';
import { activateEasyTool } from './easy-actions';

export function EasySlider( {
	label,
	value,
	min = 0,
	max = 100,
	def = 0,
	suffix = '',
	onChange,
	onCommit,
} ) {
	const id = useId();
	return (
		<label className="ed-easy-slider" htmlFor={ id }>
			<span>{ label }</span>
			<SnapSlider
				id={ id }
				{ ...{ value, min, max, def, onChange, onCommit } }
				step={ 1 }
				ariaLabel={ label }
			/>
			<output className="wpie-number-output">
				{ value }
				{ suffix }
			</output>
		</label>
	);
}

export function EasyPaint( { editor, extras } ) {
	const fieldId = useId();
	const { state, dispatch } = editor;
	const tool = state.tool;
	const opts = state.toolOpts[ tool ];
	const colorMode =
		opts.colorMode && ( ! opts.paintStyle || opts.paintStyle === 'normal' );
	const set = ( patch ) => dispatch( { type: 'SET_TOOL_OPTS', tool, patch } );
	return (
		<div className="ed-easy-paint">
			<div className="ai-tiles ed-easy-grid ed-easy-grid-three">
				{ [
					[ 'brush', __( 'Brush', 'wunderpaint' ) ],
					[ 'pencil', __( 'Pencil', 'wunderpaint' ) ],
					[ 'eraser', __( 'Eraser', 'wunderpaint' ) ],
				].map( ( [ id, label ] ) => (
					<EasyCard
						key={ id }
						id={ id }
						icon={ id }
						label={ label }
						active={ tool === id }
						onClick={ () => activateEasyTool( editor, id, extras ) }
					/>
				) ) }
			</div>
			<PanelSection title={ __( 'Brush settings', 'wunderpaint' ) }>
				{ tool !== 'eraser' && (
					<div className="ed-easy-row">
						<span>{ __( 'Color', 'wunderpaint' ) }</span>
						<div>
							<SwatchButton
								color={ state.fgColor }
								size={ 26 }
								onChange={ ( color ) =>
									dispatch( { type: 'SET_FG', color } )
								}
							/>
							{ colorMode && (
								<select
									aria-label={ __( 'Color', 'wunderpaint' ) }
									value={ opts.colorMode }
									onChange={ ( e ) =>
										set( { colorMode: e.target.value } )
									}
								>
									<option value="solid">
										{ __( 'Solid', 'wunderpaint' ) }
									</option>
									<option value="jitter">
										{ __( 'Jitter', 'wunderpaint' ) }
									</option>
									<option value="gradient">
										{ __( 'Gradient', 'wunderpaint' ) }
									</option>
								</select>
							) }
						</div>
					</div>
				) }
				{ colorMode && opts.colorMode === 'gradient' && (
					<GradientBar
						stops={ opts.gradientStops }
						onChange={ ( gradientStops ) =>
							set( { gradientStops } )
						}
					/>
				) }
				{ [
					[ 'size', __( 'Size', 'wunderpaint' ), 1, 500, 24, ' px' ],
					[
						'opacity',
						__( 'Opacity', 'wunderpaint' ),
						0,
						100,
						100,
						'%',
					],
					[
						'hardness',
						__( 'Hardness', 'wunderpaint' ),
						0,
						100,
						85,
						'%',
					],
					[ 'flow', __( 'Flow', 'wunderpaint' ), 0, 100, 80, '%' ],
				]
					.filter( ( [ key ] ) => Number.isFinite( opts[ key ] ) )
					.map( ( [ key, label, min, max, def, suffix ] ) => (
						<EasySlider
							key={ key }
							{ ...{ label, min, max, def, suffix } }
							max={ Math.max( max, opts[ key ] ) }
							def={ DEFAULT_TOOL_OPTS[ tool ][ key ] }
							value={ opts[ key ] }
							onChange={ ( value ) => set( { [ key ]: value } ) }
						/>
					) ) }
				{ opts.tip !== undefined && (
					<label className="ed-easy-row" htmlFor={ fieldId + '-tip' }>
						<span>{ __( 'Brush tip', 'wunderpaint' ) }</span>
						<div>
							<select
								id={ fieldId + '-tip' }
								aria-label={ __( 'Brush tip', 'wunderpaint' ) }
								value={ opts.tip }
								onChange={ ( e ) =>
									set( { tip: e.target.value } )
								}
							>
								{ groupedTips().map( ( group ) => (
									<optgroup
										key={ group.id }
										label={ group.name }
									>
										{ group.tips.map( ( tip ) => (
											<option
												key={ tip.id }
												value={ tip.id }
											>
												{ tip.label }
											</option>
										) ) }
									</optgroup>
								) ) }
							</select>
						</div>
					</label>
				) }
				{ opts.paintStyle !== undefined && (
					<label
						className="ed-easy-row"
						htmlFor={ fieldId + '-style' }
					>
						<span>{ __( 'Style', 'wunderpaint' ) }</span>
						<div>
							<select
								id={ fieldId + '-style' }
								aria-label={ __( 'Style', 'wunderpaint' ) }
								value={ opts.paintStyle }
								onChange={ ( e ) =>
									set( { paintStyle: e.target.value } )
								}
							>
								{ PAINT_STYLES.map( ( style ) => (
									<option key={ style.id } value={ style.id }>
										{ style.name }
									</option>
								) ) }
							</select>
						</div>
					</label>
				) }
			</PanelSection>
		</div>
	);
}

export function EasyLayout( { editor, layer, locked } ) {
	if ( ! layer ) {
		return (
			<p className="ed-easy-empty">
				{ __(
					'Select an element on the canvas or in Elements to edit it.',
					'wunderpaint'
				) }
			</p>
		);
	}
	const alignments = [
		[ 'L', 'objAlignL', __( 'Align left', 'wunderpaint' ) ],
		[ 'C', 'objAlignCH', __( 'Align horizontal centers', 'wunderpaint' ) ],
		[ 'R', 'objAlignR', __( 'Align right', 'wunderpaint' ) ],
		[ 'T', 'objAlignT', __( 'Align top', 'wunderpaint' ) ],
		[ 'M', 'objAlignM', __( 'Align vertical centers', 'wunderpaint' ) ],
		[ 'B', 'objAlignB', __( 'Align bottom', 'wunderpaint' ) ],
	];
	const actions = [
		[ 'duplicate', __( 'Duplicate', 'wunderpaint' ), Ops.duplicateLayer ],
		[ 'arrUp', __( 'Bring forward', 'wunderpaint' ), Ops.bringForwardOp ],
		[ 'arrDown', __( 'Send backward', 'wunderpaint' ), Ops.sendBackwardOp ],
	];
	return (
		<fieldset className="painting-fieldset" disabled={ locked }>
			<PanelSection title={ __( 'Arrange', 'wunderpaint' ) }>
				<div className="ed-easy-align">
					{ alignments.map( ( [ mode, icon, label ] ) => (
						<button
							key={ mode }
							className="dsm-mini"
							type="button"
							title={ label }
							aria-label={ label }
							onClick={ () => Ops.alignLayersOp( editor, mode ) }
						>
							{ I[ icon ]( { size: 17 } ) }
						</button>
					) ) }
				</div>
				<div className="ed-easy-stack-actions">
					{ actions.map( ( [ icon, label, run ] ) => (
						<button
							key={ icon }
							className="dsm-mini"
							type="button"
							title={ label }
							aria-label={ label }
							onClick={ () => run( editor ) }
						>
							{ I[ icon ]( { size: 17 } ) }
						</button>
					) ) }
				</div>
				<p className="ed-easy-hint-text">
					{ __(
						'One element aligns to the canvas. Multiple elements align to each other.',
						'wunderpaint'
					) }
				</p>
			</PanelSection>
		</fieldset>
	);
}
