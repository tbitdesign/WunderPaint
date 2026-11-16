/** The existing effect brush, with the same compact mode cards as Gradient/Pen. */
import { useId } from '@wordpress/element';
import { __, _x } from '@wordpress/i18n';
import { SnapSlider } from '../../components/snap-slider';
import {
	FX_BRUSH_DEFAULTS,
	FX_BRUSH_PRESETS,
} from '../../lib/fxbrush-settings';

export const FX_BRUSH_MODES = [
	[ 'blur', () => __( 'Blur', 'wunderpaint' ) ],
	[ 'sharpen', () => __( 'Sharpen', 'wunderpaint' ) ],
	[ 'smudge', () => __( 'Smudge', 'wunderpaint' ) ],
	[ 'dodge', () => __( 'Dodge', 'wunderpaint' ) ],
	[ 'burn', () => __( 'Burn', 'wunderpaint' ) ],
	[ 'sponge', () => __( 'Sponge', 'wunderpaint' ) ],
];

const MODE_PATHS = {
	blur: 'M8 7a5 5 0 1 0 0 10M12 5v.01M16 7v.01M19 10v.01M19 14v.01M16 17v.01M12 19v.01M12 10v4M15 12h.01',
	sharpen: 'M12 3 3 20h18L12 3zM12 8v7M9 17h6',
	smudge: 'M4 7h9a4 4 0 0 1 0 8H9a3 3 0 0 0 0 6M3 11h7M14 3h3a5 5 0 0 1 5 5',
	dodge: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
	burn: 'M19.5 15A8 8 0 0 1 9 4.5 8.5 8.5 0 1 0 19.5 15z',
	sponge: 'M3 8q0-3 3-3h12q3 0 3 3v8q0 3-3 3H6q-3 0-3-3V8zM7 9h.01M13 8h.01M17 12h.01M11 14h.01M6 15h.01M15 16h.01',
};

function ModeIcon( { mode } ) {
	return (
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
			<path d={ MODE_PATHS[ mode ] } />
		</svg>
	);
}

function Setting( { label, value, min, max, def, suffix, onChange } ) {
	const id = useId();
	return (
		<div className="fxbp-setting">
			<div className="fxbp-setting-head">
				<label htmlFor={ id }>{ label }</label>
				<span className="fxbp-number">
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

export function FxBrushPanel( { editor } ) {
	const opts = editor.state.toolOpts.fxbrush;
	const activeMode = opts.mode || 'blur';
	const alphaId = useId();
	const presets = FX_BRUSH_PRESETS[ activeMode ];
	const patch = ( values ) =>
		editor.dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: 'fxbrush',
			patch: values,
		} );
	const set = ( key, value ) =>
		editor.dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: 'fxbrush',
			patch: { [ key ]: value },
		} );
	return (
		<div className="fxbp">
			<div
				className="fxbp-modes"
				role="group"
				aria-label={ __( 'Mode', 'wunderpaint' ) }
			>
				{ FX_BRUSH_MODES.map( ( [ mode, label ] ) => (
					<button
						type="button"
						key={ mode }
						className="ai-tile ai-tile-compact"
						aria-pressed={ ( opts.mode || 'blur' ) === mode }
						title={ label() }
						onClick={ () => set( 'mode', mode ) }
					>
						<span className="ai-tile-icon">
							<ModeIcon mode={ mode } />
						</span>
						<span className="ai-tile-name">{ label() }</span>
					</button>
				) ) }
			</div>
			<div
				className="fxbp-choices fxbp-presets"
				role="group"
				aria-label={ __( 'Quick presets', 'wunderpaint' ) }
			>
				{ [
					[
						'gentle',
						_x( 'Gentle', 'effect brush preset', 'wunderpaint' ),
					],
					[
						'medium',
						_x( 'Medium', 'effect brush preset', 'wunderpaint' ),
					],
					[
						'strong',
						_x( 'Strong', 'effect brush preset', 'wunderpaint' ),
					],
				].map( ( [ id, label ] ) => (
					<button
						type="button"
						key={ id }
						aria-pressed={ Object.entries( presets[ id ] ).every(
							( [ key, value ] ) => opts[ key ] === value
						) }
						onClick={ () => patch( presets[ id ] ) }
					>
						{ label }
					</button>
				) ) }
			</div>
			<div className="fxbp-settings">
				<Setting
					label={ __( 'Size', 'wunderpaint' ) }
					value={ opts.size }
					min={ 4 }
					max={ 300 }
					def={ FX_BRUSH_DEFAULTS.size }
					suffix="px"
					onChange={ ( value ) => set( 'size', value ) }
				/>
				{ activeMode === 'blur' && (
					<Setting
						label={ __( 'Blur radius', 'wunderpaint' ) }
						value={ opts.blurRadius }
						min={ 1 }
						max={ 50 }
						def={ FX_BRUSH_DEFAULTS.blurRadius }
						suffix="px"
						onChange={ ( value ) => set( 'blurRadius', value ) }
					/>
				) }
				<Setting
					label={ __( 'Strength', 'wunderpaint' ) }
					value={ opts.strength }
					min={ 1 }
					max={ 100 }
					def={ presets.medium.strength }
					suffix="%"
					onChange={ ( value ) => set( 'strength', value ) }
				/>
				<Setting
					label={ __( 'Hardness', 'wunderpaint' ) }
					value={ opts.hardness }
					min={ 0 }
					max={ 100 }
					def={ presets.medium.hardness }
					suffix="%"
					onChange={ ( value ) => set( 'hardness', value ) }
				/>
				{ [ 'dodge', 'burn' ].includes( activeMode ) && (
					<div className="fxbp-tones">
						<span>{ __( 'Tonal range', 'wunderpaint' ) }</span>
						<div
							className="fxbp-choices fxbp-tone-choices"
							role="group"
							aria-label={ __( 'Tonal range', 'wunderpaint' ) }
						>
							{ [
								[
									'all',
									_x(
										'All',
										'effect brush tonal range',
										'wunderpaint'
									),
								],
								[
									'shadows',
									_x(
										'Shadows',
										'effect brush tonal range',
										'wunderpaint'
									),
								],
								[
									'midtones',
									_x(
										'Midtones',
										'effect brush tonal range',
										'wunderpaint'
									),
								],
								[
									'highlights',
									_x(
										'Highlights',
										'effect brush tonal range',
										'wunderpaint'
									),
								],
							].map( ( [ id, label ] ) => (
								<button
									type="button"
									key={ id }
									aria-pressed={ opts.toneRange === id }
									onClick={ () => set( 'toneRange', id ) }
								>
									{ label }
								</button>
							) ) }
						</div>
					</div>
				) }
				{ opts.mode === 'sponge' && (
					<div
						className="fxbp-choices fxbp-sponge"
						role="group"
						aria-label={ __( 'Sponge', 'wunderpaint' ) }
					>
						{ [
							[ 'saturate', __( 'Saturate', 'wunderpaint' ) ],
							[ 'desaturate', __( 'Desaturate', 'wunderpaint' ) ],
						].map( ( [ id, label ] ) => (
							<button
								type="button"
								key={ id }
								aria-pressed={
									( opts.sponge || 'desaturate' ) === id
								}
								onClick={ () => set( 'sponge', id ) }
							>
								{ label }
							</button>
						) ) }
					</div>
				) }
				<label
					className="fxbp-alpha"
					htmlFor={ alphaId }
					title={ __(
						'Keep the existing silhouette and edge transparency.',
						'wunderpaint'
					) }
				>
					<input
						type="checkbox"
						id={ alphaId }
						checked={ opts.preserveAlpha }
						onChange={ ( e ) =>
							set( 'preserveAlpha', e.target.checked )
						}
					/>
					{ __( 'Protect transparency', 'wunderpaint' ) }
				</label>
			</div>
		</div>
	);
}
