import { useId } from '@wordpress/element';
import { __, _x, sprintf } from '@wordpress/i18n';
import { SnapSlider } from '../../components/snap-slider';
import { CLONE_HISTORY_LIMIT } from '../../lib/clone-source';

function Setting( { label, value, min, max, def, suffix, onChange } ) {
	const id = useId();
	return (
		<div className="csp-setting">
			<div className="csp-setting-head">
				<label htmlFor={ id }>{ label }</label>
				<span className="csp-number">
					<input
						id={ id }
						type="number"
						min={ min }
						max={ max }
						step="1"
						value={ value }
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
			/>
		</div>
	);
}

export function StampPanel( { editor } ) {
	const { state, dispatch } = editor;
	const opts = state.toolOpts.stamp;
	const source = opts.source;
	const previewId = useId();
	const patch = ( values ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool: 'stamp', patch: values } );
	const presets = [
		[
			_x( 'Gentle', 'clone stamp preset', 'wunderpaint' ),
			{ opacity: 35, hardness: 10 },
		],
		[
			_x( 'Standard', 'clone stamp preset', 'wunderpaint' ),
			{ opacity: 100, hardness: 80 },
		],
		[
			_x( 'Precise', 'clone stamp preset', 'wunderpaint' ),
			{ opacity: 100, hardness: 100 },
		],
	];
	return (
		<div className="csp">
			<div
				className="csp-modes"
				role="group"
				aria-label={ __( 'Mode', 'wunderpaint' ) }
			>
				{ [
					[
						true,
						__( 'Aligned', 'wunderpaint' ),
						__(
							'Keep the distance to the source across strokes.',
							'wunderpaint'
						),
						'M4 6h6v6H4zM14 14h6v6h-6zM10 9h7v5M14 11l3 3 3-3',
					],
					[
						false,
						__( 'Fixed source', 'wunderpaint' ),
						__(
							'Start each stroke at the chosen source.',
							'wunderpaint'
						),
						'M12 3v4M12 17v4M3 12h4M17 12h4M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 12h.01',
					],
				].map( ( [ aligned, label, title, path ] ) => (
					<button
						type="button"
						key={ String( aligned ) }
						className="ai-tile ai-tile-compact"
						aria-pressed={ opts.aligned === aligned }
						title={ title }
						onClick={ () => patch( { aligned } ) }
					>
						<span className="ai-tile-icon">
							<svg
								width="22"
								height="22"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="1.7"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<path d={ path } />
							</svg>
						</span>
						<span className="ai-tile-name">{ label }</span>
					</button>
				) ) }
			</div>
			<div className="csp-source">
				<div className="csp-preview">
					{ source && (
						<img
							src={ source.thumbnail }
							alt={ __( 'Clone source preview', 'wunderpaint' ) }
						/>
					) }
					<span aria-hidden="true">+</span>
				</div>
				<div className="csp-source-info">
					<strong>{ __( 'Source', 'wunderpaint' ) }</strong>
					{ source ? (
						<>
							<span title={ source.name }>{ source.name }</span>
							<span>
								{ Math.round( source.x ) },{ ' ' }
								{ Math.round( source.y ) } px
							</span>
						</>
					) : (
						<span>
							{ __(
								'Alt-click to choose a source.',
								'wunderpaint'
							) }
						</span>
					) }
				</div>
			</div>
			<div className="csp-actions csp-choices">
				<button
					type="button"
					aria-pressed={ opts.pickingSource }
					onClick={ () =>
						patch( { pickingSource: ! opts.pickingSource } )
					}
				>
					{ opts.pickingSource
						? __( 'Cancel', 'wunderpaint' )
						: __( 'Choose source', 'wunderpaint' ) }
				</button>
				<button
					type="button"
					disabled={ ! source }
					onClick={ () =>
						patch( { source: null, pickingSource: false } )
					}
				>
					{ __( 'Reset', 'wunderpaint' ) }
				</button>
			</div>
			{ opts.pickingSource && (
				<p className="csp-hint" role="status">
					{ __(
						'Click the image to choose the source.',
						'wunderpaint'
					) }
				</p>
			) }
			<div className="csp-history">
				<div className="csp-history-head">
					<span>
						{ __( 'Source history', 'wunderpaint' ) }{ ' ' }
						<span className="csp-count">
							{ state.stampSources.length }/
							{ CLONE_HISTORY_LIMIT }
						</span>
					</span>
					<button
						type="button"
						disabled={ ! state.stampSources.length }
						onClick={ () =>
							dispatch( { type: 'STAMP_CLEAR_HISTORY' } )
						}
					>
						{ __( 'Clear history', 'wunderpaint' ) }
					</button>
				</div>
				<div
					className="csp-history-grid"
					role="group"
					aria-label={ __( 'Source history', 'wunderpaint' ) }
				>
					{ Array.from( { length: CLONE_HISTORY_LIMIT }, ( _, i ) => {
						const item = state.stampSources[ i ];
						if ( ! item ) {
							return (
								<span
									className="csp-history-empty"
									key={ `empty-${ i }` }
									aria-hidden="true"
								/>
							);
						}
						const label = sprintf(
							// translators: %1$d: history position, %2$s: source layer name.
							__( 'Source %1$d: %2$s', 'wunderpaint' ),
							i + 1,
							item.name
						);
						return (
							<button
								type="button"
								key={ item.id }
								title={ label }
								aria-label={ label }
								aria-pressed={ source?.id === item.id }
								onClick={ () =>
									dispatch( {
										type: 'STAMP_SELECT_SOURCE',
										id: item.id,
									} )
								}
							>
								<img src={ item.thumbnail } alt="" />
							</button>
						);
					} ) }
				</div>
			</div>
			<div
				className="csp-presets csp-choices"
				role="group"
				aria-label={ __( 'Quick presets', 'wunderpaint' ) }
			>
				{ presets.map( ( [ label, values ] ) => (
					<button
						type="button"
						key={ label }
						aria-pressed={ Object.entries( values ).every(
							( [ key, value ] ) => opts[ key ] === value
						) }
						onClick={ () => patch( values ) }
					>
						{ label }
					</button>
				) ) }
			</div>
			<div className="csp-settings">
				<Setting
					label={ __( 'Size', 'wunderpaint' ) }
					value={ opts.size }
					min={ 1 }
					max={ 500 }
					def={ 40 }
					suffix="px"
					onChange={ ( size ) => patch( { size } ) }
				/>
				<Setting
					label={ __( 'Opacity', 'wunderpaint' ) }
					value={ opts.opacity }
					min={ 0 }
					max={ 100 }
					def={ 100 }
					suffix="%"
					onChange={ ( opacity ) => patch( { opacity } ) }
				/>
				<Setting
					label={ __( 'Hardness', 'wunderpaint' ) }
					value={ opts.hardness }
					min={ 0 }
					max={ 100 }
					def={ 80 }
					suffix="%"
					onChange={ ( hardness ) => patch( { hardness } ) }
				/>
			</div>
			<label className="csp-cursor-toggle" htmlFor={ previewId }>
				<input
					id={ previewId }
					type="checkbox"
					checked={ opts.preview }
					onChange={ ( e ) => patch( { preview: e.target.checked } ) }
				/>
				{ __( 'Preview in brush cursor', 'wunderpaint' ) }
			</label>
		</div>
	);
}
