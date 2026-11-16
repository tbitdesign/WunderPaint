import { useId, useMemo, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { ColorField } from '../../components/color-field';
import { buildColorScales, scaleBaseColor } from '../../lib/color-scales';
import { labelColorFor } from '../../lib/color-scheme';
import { PALETTE_MAX } from '../../lib/palette-library';
import { ContrastMatrix } from './contrast-matrix';
import { GradientPreviews } from './gradient-previews';

function ScaleRow( { title, shades, colors, onAdd } ) {
	return (
		<div className="csd-scale-row">
			<span className="dsm-label">{ title }</span>
			<div className="csd-scale-shades">
				{ shades.map( ( shade, i ) => {
					const included = colors.includes( shade.color );
					const label = included
						? __( 'Already in palette', 'wunderpaint' )
						: __( 'Add to palette', 'wunderpaint' );
					return (
						<button
							key={ i }
							type="button"
							className="csd-scale-shade"
							style={ {
								background: shade.color,
								color: labelColorFor( shade.color ),
							} }
							disabled={
								included || colors.length >= PALETTE_MAX
							}
							title={ `${ shade.color } · ${ label }${
								shade.anchor
									? ' · ' +
									  __( 'Exact base color', 'wunderpaint' )
									: ''
							}` }
							aria-label={ sprintf(
								/* translators: 1: palette action, 2: hex color. */
								__( '%1$s: %2$s', 'wunderpaint' ),
								label,
								shade.color
							) }
							onClick={ () => onAdd( shade.color ) }
						>
							<span className="csd-scale-marker">
								{ shade.anchor
									? __( 'Base', 'wunderpaint' )
									: '\u00a0' }
								{ included ? ' ✓' : '' }
							</span>
							<span className="csd-scale-hex">
								{ shade.color }
							</span>
						</button>
					);
				} ) }
			</div>
		</div>
	);
}

/** The working base is independent of palette additions and harmony changes. */
export function ColorScales( { initialBase, colors, onAdd, onGradient } ) {
	const [ base, setBase ] = useState(
		() => scaleBaseColor( initialBase ) || '#3b66ff'
	);
	const [ draft, setDraft ] = useState( null );
	const [ invalid, setInvalid ] = useState( false );
	const [ count, setCount ] = useState( 7 );
	const [ tinted, setTinted ] = useState( true );
	const fieldId = useId();
	const scales = useMemo(
		() => buildColorScales( base, { count, tinted } ),
		[ base, count, tinted ]
	);
	const chooseBase = ( value ) => {
		setBase( value );
		setDraft( null );
		setInvalid( false );
	};
	const input = ( value ) => {
		const parsed =
			/^#?[0-9a-f]{6}([0-9a-f]{2})?$/i.test( value ) &&
			scaleBaseColor( value );
		if ( parsed ) {
			chooseBase( parsed );
		} else {
			setDraft( value );
			setInvalid( false );
		}
	};
	const commit = () => {
		if ( draft === null ) {
			return;
		}
		const parsed = scaleBaseColor( draft );
		if ( parsed ) {
			chooseBase( parsed );
		} else {
			setDraft( null );
			setInvalid( true );
		}
	};
	return (
		<div className="csd-scales">
			<div className="csd-scale-controls">
				<label htmlFor={ fieldId } className="csd-scale-base">
					<span className="dsm-label">
						{ __( 'Scale base color', 'wunderpaint' ) }
					</span>
					<ColorField
						id={ fieldId }
						title={ __( 'Scale base color', 'wunderpaint' ) }
						color={ draft ?? base }
						onChange={ input }
						onCommit={ commit }
					/>
				</label>
				<label htmlFor={ fieldId + '-palette' }>
					<span className="dsm-label">
						{ __( 'From palette', 'wunderpaint' ) }
					</span>
					<select
						id={ fieldId + '-palette' }
						className="dsm-select"
						value=""
						onChange={ ( e ) => chooseBase( e.target.value ) }
					>
						<option value="" disabled>
							{ __( 'Choose a color', 'wunderpaint' ) }
						</option>
						{ [ ...new Set( colors ) ].map( ( color ) => (
							<option key={ color } value={ color }>
								{ color }
							</option>
						) ) }
					</select>
				</label>
				<label htmlFor={ fieldId + '-steps' }>
					<span className="dsm-label">
						{ __( 'Steps', 'wunderpaint' ) }
					</span>
					<select
						id={ fieldId + '-steps' }
						className="dsm-select"
						value={ count }
						onChange={ ( e ) => setCount( +e.target.value ) }
					>
						{ [ 5, 7, 9 ].map( ( n ) => (
							<option key={ n } value={ n }>
								{ n }
							</option>
						) ) }
					</select>
				</label>
			</div>
			{ invalid && (
				<p className="csd-note" role="alert">
					{ __( 'Enter an opaque HEX or RGB color.', 'wunderpaint' ) }
				</p>
			) }
			<p className="csd-note">
				{ __(
					'The marked base stays exact. Click a shade to add and lock it in the palette.',
					'wunderpaint'
				) }
			</p>
			<ScaleRow
				title={ __( 'Color shades', 'wunderpaint' ) }
				shades={ scales.shades }
				colors={ colors }
				onAdd={ onAdd }
			/>
			<ScaleRow
				title={ __( 'Matching neutrals', 'wunderpaint' ) }
				shades={ scales.neutrals }
				colors={ colors }
				onAdd={ onAdd }
			/>
			<label className="dsm-checkrow" htmlFor={ fieldId + '-tint' }>
				<input
					id={ fieldId + '-tint' }
					type="checkbox"
					checked={ tinted }
					onChange={ ( e ) => setTinted( e.target.checked ) }
				/>
				{ __( 'Tint neutrals with the base color', 'wunderpaint' ) }
			</label>
			{ colors.length >= PALETTE_MAX && (
				<p className="csd-note" role="status">
					{ __(
						'Palette full. Remove a color above to add another.',
						'wunderpaint'
					) }
				</p>
			) }
			<GradientPreviews
				colors={ colors }
				scales={ scales }
				onUse={ onGradient }
			/>
			<ContrastMatrix colors={ colors } />
		</div>
	);
}
