import { useId, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { schemeGradientVariants } from '../../lib/scheme-gradients';
import { paletteGradientStops } from '../../lib/color-panel-workflows';
import { paintCss } from '../../lib/layer-paint';

export function GradientPreviews( { colors, scales, onUse } ) {
	const [ reversed, setReversed ] = useState( false );
	const [ category, setCategory ] = useState( 'all' );
	const [ kind, setKind ] = useState( 'linear' );
	const controlId = useId();
	const grid = useRef( null );
	const options = useMemo(
		() => schemeGradientVariants( colors, scales ),
		[ colors, scales ]
	);
	const groups = {
		scales: __( 'Color scales', 'wunderpaint' ),
		pairs: __( 'Color pairs', 'wunderpaint' ),
		soft: __( 'Soft', 'wunderpaint' ),
		contrast: __( 'Contrast', 'wunderpaint' ),
		multicolor: __( 'Multicolor', 'wunderpaint' ),
		glow: __( 'Glow', 'wunderpaint' ),
		harmonies: __( 'Harmonies', 'wunderpaint' ),
	};
	const names = {
		palette: __( 'Palette', 'wunderpaint' ),
		shades: __( 'Color shades', 'wunderpaint' ),
		neutrals: __( 'Matching neutrals', 'wunderpaint' ),
		analogous: __( 'Analogous', 'wunderpaint' ),
		complementary: __( 'Complementary', 'wunderpaint' ),
		split: __( 'Split complementary', 'wunderpaint' ),
		triadic: __( 'Triadic', 'wunderpaint' ),
		tetradic: __( 'Tetradic', 'wunderpaint' ),
		mono: __( 'Monochromatic', 'wunderpaint' ),
	};
	const shown =
		category === 'all'
			? options
			: options.filter( ( option ) => option.group === category );
	return (
		<div className="csd-gradients">
			<div className="csd-scale-heading">
				<span className="dsm-label">
					{ __( 'Gradients', 'wunderpaint' ) }
				</span>
				<label
					className="dsm-checkrow"
					htmlFor={ controlId + '-reverse' }
				>
					<input
						id={ controlId + '-reverse' }
						type="checkbox"
						checked={ reversed }
						onChange={ ( e ) => setReversed( e.target.checked ) }
					/>
					{ __( 'Reverse direction', 'wunderpaint' ) }
				</label>
			</div>
			<p className="csd-note">
				{ __(
					'Explore variations of your palette and base color. Open a gradient in the Color panel to apply or save it.',
					'wunderpaint'
				) }
			</p>
			<div className="csd-gradient-controls">
				<label htmlFor={ controlId + '-category' }>
					<span className="dsm-label">
						{ __( 'Category', 'wunderpaint' ) }
					</span>
					<select
						id={ controlId + '-category' }
						className="dsm-select"
						aria-label={ __( 'Gradient category', 'wunderpaint' ) }
						value={ category }
						onChange={ ( e ) => {
							setCategory( e.target.value );
							if ( grid.current ) {
								grid.current.scrollTop = 0;
							}
						} }
					>
						<option value="all">
							{ __( 'All', 'wunderpaint' ) }
						</option>
						{ Object.entries( groups ).map( ( [ id, label ] ) => (
							<option key={ id } value={ id }>
								{ label }
							</option>
						) ) }
					</select>
				</label>
				<label htmlFor={ controlId + '-kind' }>
					<span className="dsm-label">
						{ __( 'Gradient type', 'wunderpaint' ) }
					</span>
					<select
						id={ controlId + '-kind' }
						className="dsm-select"
						value={ kind }
						onChange={ ( e ) => setKind( e.target.value ) }
					>
						<option value="linear">
							{ __( 'Linear', 'wunderpaint' ) }
						</option>
						<option value="radial">
							{ __( 'Radial', 'wunderpaint' ) }
						</option>
						<option value="angle">
							{ __( 'Angle', 'wunderpaint' ) }
						</option>
					</select>
				</label>
			</div>
			<div
				className="csd-gradient-grid"
				ref={ grid }
				tabIndex={ 0 }
				role="region"
				aria-label={ __( 'Gradients', 'wunderpaint' ) }
			>
				{ shown.map( ( option ) => {
					const title =
						names[ option.id ] ||
						sprintf(
							/* translators: 1: gradient family, 2: variant identifier. */
							__( '%1$s %2$d', 'wunderpaint' ),
							groups[ option.group ],
							option.index
						);
					const gradient = reversed
						? [ ...option.colors ].reverse()
						: option.colors;
					const stops = paletteGradientStops( gradient );
					return (
						<div
							className="dsm-card csd-gradient-option"
							key={ option.id }
						>
							<div
								className="csd-gradient-preview"
								role="img"
								aria-label={
									__( 'Gradient preview', 'wunderpaint' ) +
									': ' +
									title
								}
								title={ gradient.join( ' → ' ) }
								style={ {
									background: paintCss( {
										type: 'gradient',
										kind,
										angle: 0,
										stops,
									} ),
								} }
							/>
							<span className="csd-gradient-title">
								{ title }
							</span>
							<button
								type="button"
								className="ai-btn secondary"
								aria-label={ sprintf(
									/* translators: %s: gradient source, such as Palette or Color shades. */
									__( 'Use gradient: %s', 'wunderpaint' ),
									title
								) }
								onClick={ () => onUse( gradient, kind ) }
							>
								{ __( 'Use gradient', 'wunderpaint' ) }
							</button>
						</div>
					);
				} ) }
				{ ! shown.length && (
					<p className="csd-note">
						{ __( 'No gradients found.', 'wunderpaint' ) }
					</p>
				) }
			</div>
		</div>
	);
}
