import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import { SwatchButton } from '../../components/color-popover';
import { ToolChoices, ToolSetting } from './tool-setting';

export function BucketPanel( { editor } ) {
	const { state, dispatch } = editor;
	const opts = state.toolOpts.bucket;
	const set = ( patch ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool: 'bucket', patch } );
	const object = opts.mode === 'object';
	const active = state.layers.find( ( l ) => l.id === state.activeId );
	return (
		<div className="painting-panel">
			<div className="painting-mode-grid">
				{ [
					[ 'pixels', __( 'Area', 'wunderpaint' ), 'bucket' ],
					[ 'object', __( 'Object', 'wunderpaint' ), 'shape' ],
				].map( ( [ id, label, icon ] ) => (
					<button
						key={ id }
						type="button"
						className="ai-tile ai-tile-compact"
						aria-pressed={ ( opts.mode || 'pixels' ) === id }
						onClick={ () => set( { mode: id } ) }
					>
						<span className="ai-tile-icon">
							{ I[ icon ]?.( { size: 20 } ) }
						</span>
						<span className="ai-tile-name">{ label }</span>
					</button>
				) ) }
			</div>
			<p className="painting-hint">
				{ object
					? __(
							'Click a shape, text or path. The whole object changes color.',
							'wunderpaint'
					  )
					: __(
							'Click an area to fill it. An active selection limits the fill, including its soft edge.',
							'wunderpaint'
					  ) }
			</p>
			<div className="painting-color">
				<span>{ __( 'Color', 'wunderpaint' ) }</span>
				<SwatchButton
					color={ state.fgColor }
					onChange={ ( color ) =>
						dispatch( { type: 'SET_FG', color } )
					}
				/>
				<span>{ state.fgColor }</span>
			</div>
			{ ! object && (
				<>
					<section className="painting-section">
						<h3>{ __( 'Source', 'wunderpaint' ) }</h3>
						<ToolChoices
							label={ __( 'Source', 'wunderpaint' ) }
							value={ opts.source || 'visible' }
							choices={ [
								[
									'visible',
									__( 'Visible image', 'wunderpaint' ),
								],
								[
									'active',
									__( 'Active layer', 'wunderpaint' ),
								],
							] }
							onChange={ ( source ) => set( { source } ) }
						/>
					</section>
					<section className="painting-section">
						<h3>{ __( 'Fill on', 'wunderpaint' ) }</h3>
						<ToolChoices
							label={ __( 'Fill on', 'wunderpaint' ) }
							value={ opts.target || 'new' }
							choices={ [
								[ 'new', __( 'New layer', 'wunderpaint' ) ],
								[
									'current',
									__( 'Active layer', 'wunderpaint' ),
								],
							] }
							onChange={ ( target ) => set( { target } ) }
						/>
						<p className="painting-hint">
							{ opts.target === 'current'
								? active?.name ||
								  __( 'Select a pixel layer.', 'wunderpaint' )
								: __(
										'Keeps the original pixels unchanged.',
										'wunderpaint'
								  ) }
						</p>
					</section>
					<section className="painting-section">
						<h3>{ __( 'Area', 'wunderpaint' ) }</h3>
						<ToolChoices
							label={ __( 'Area', 'wunderpaint' ) }
							value={
								opts.contiguous === false
									? 'global'
									: 'contiguous'
							}
							choices={ [
								[
									'contiguous',
									__( 'Contiguous', 'wunderpaint' ),
								],
								[
									'global',
									__( 'Matching colors', 'wunderpaint' ),
								],
							] }
							onChange={ ( value ) =>
								set( { contiguous: value === 'contiguous' } )
							}
						/>
						<ToolSetting
							label={ __( 'Tolerance', 'wunderpaint' ) }
							value={ opts.tolerance ?? 32 }
							max={ 255 }
							onChange={ ( tolerance ) => set( { tolerance } ) }
						/>
						<ToolSetting
							label={ __( 'Opacity', 'wunderpaint' ) }
							value={ opts.opacity ?? 100 }
							suffix="%"
							onChange={ ( opacity ) => set( { opacity } ) }
						/>
						{ opts.contiguous !== false && (
							<ToolSetting
								label={ __( 'Close gaps', 'wunderpaint' ) }
								value={ opts.gap || 0 }
								max={ 8 }
								suffix="px"
								onChange={ ( gap ) => set( { gap } ) }
							/>
						) }
					</section>
				</>
			) }
		</div>
	);
}
