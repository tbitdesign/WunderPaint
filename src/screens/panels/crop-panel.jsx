import { __ } from '@wordpress/i18n';
import { useId } from '@wordpress/element';
import { I } from '../../icons';
import { SOCIAL_CROPS } from '../../lib/safe-zones';
import {
	CROP_FORMATS,
	MORE_CROP_FORMATS,
	cropBase,
	cropRatioValue,
	setCropFormat,
	setCropDimension,
	swapCropOrientation,
} from '../../lib/crop-geometry';
import {
	STRAIGHTEN_MAX,
	applyStraighten,
	cancelCrop,
	endStraighten,
	straightenOffset,
	straightenTarget,
} from '../../lib/straighten';
import { SnapSlider } from '../../components/snap-slider';
import { cropDoc } from '../../store/doc-ops';

export function CropFormatSelect( { editor, more = false } ) {
	const formats = more
		? MORE_CROP_FORMATS
		: [ ...CROP_FORMATS, ...MORE_CROP_FORMATS ];
	const groups = [
		{
			label: __( 'General', 'wunderpaint' ),
			ids: [ 'free', 'original', '1:1' ],
		},
		{
			label: __( 'Photo formats', 'wunderpaint' ),
			ids: [ '4:3', '3:2', '4:5', '3:4', '2:3', '5:4', '5:7', '7:5' ],
		},
		{
			label: __( 'Screen & panorama', 'wunderpaint' ),
			ids: [ '16:9', '9:16', '21:9', '2:1', '1.91:1' ],
		},
		{
			label: __( 'Paper formats', 'wunderpaint' ),
			ids: [ 'paper', '17:22' ],
		},
	]
		.map( ( group ) => ( {
			...group,
			formats: formats.filter( ( [ id ] ) => group.ids.includes( id ) ),
		} ) )
		.filter( ( group ) => group.formats.length );
	const ratio = editor.state.toolOpts.crop.ratio;
	const known =
		formats.some( ( [ id ] ) => id === ratio ) ||
		SOCIAL_CROPS.some( ( p ) => 'social:' + p.id === ratio );
	return (
		<select
			className="crp-format-select"
			aria-label={
				more
					? __( 'More formats', 'wunderpaint' )
					: __( 'Format', 'wunderpaint' )
			}
			value={ known ? ratio : '' }
			onChange={ ( e ) => setCropFormat( editor, e.target.value ) }
		>
			{ ! known && (
				<option value="" disabled>
					{ more
						? __( 'More formats', 'wunderpaint' )
						: __( 'Custom', 'wunderpaint' ) }
				</option>
			) }
			{ groups.map( ( group ) => (
				<optgroup key={ group.label } label={ group.label }>
					{ group.formats.map( ( [ id, label ] ) => (
						<option key={ id } value={ id }>
							{ label() }
						</option>
					) ) }
				</optgroup>
			) ) }
			<optgroup label={ __( 'Social (safe zones)', 'wunderpaint' ) }>
				{ SOCIAL_CROPS.map( ( p ) => (
					<option key={ p.id } value={ 'social:' + p.id }>
						{ p.label }
					</option>
				) ) }
			</optgroup>
		</select>
	);
}

export function CropActions( { editor, toolbar = false } ) {
	const crop = editor.state.crop;
	const ready = crop?.w >= 1 && crop?.h >= 1;
	return (
		<>
			<button
				type="button"
				className={ toolbar ? undefined : 'ai-btn secondary sm' }
				disabled={ ! ready }
				onClick={ () => cropDoc( editor, crop ) }
			>
				{ __( 'Apply', 'wunderpaint' ) }
			</button>
			<button
				type="button"
				className={ toolbar ? undefined : 'ai-btn secondary sm' }
				disabled={ ! crop }
				onClick={ () => cancelCrop( editor ) }
			>
				{ __( 'Cancel', 'wunderpaint' ) }
			</button>
		</>
	);
}

/** Passive crop preview stays usable while another tool edits the artwork. */
export function CropPreviewActions( { editor } ) {
	const { state, dispatch } = editor;
	if (
		state.tool === 'crop' ||
		! state.crop ||
		! state.toolOpts.crop.preview
	) {
		return null;
	}
	return (
		<div className="group crp-context">
			<div className="seg">
				<button
					type="button"
					onClick={ () => {
						dispatch( { type: 'SET_TOOL', tool: 'crop' } );
						dispatch( { type: 'TOGGLE_CROP_PANEL', show: true } );
					} }
				>
					{ __( 'Edit Crop', 'wunderpaint' ) }
				</button>
				<CropActions editor={ editor } toolbar />
			</div>
		</div>
	);
}

function PixelField( { label, value, onChange, position = false } ) {
	const id = useId();
	return (
		<label className="crp-field" htmlFor={ id }>
			<span>{ label }</span>
			<input
				id={ id }
				type="number"
				min={ position ? undefined : 1 }
				step="1"
				value={ Math.round( value ) }
				onChange={ ( e ) => {
					if (
						e.target.value !== '' &&
						Number.isFinite( +e.target.value )
					) {
						onChange( Math.round( +e.target.value ) );
					}
				} }
			/>
		</label>
	);
}

/**
 * Straighten (20.10.2026): turns the photo layer, never the text or logos on
 * top, and keeps empty corners out of the crop (lib/straighten.js).
 */
function StraightenRow( { editor } ) {
	const fieldId = useId();
	const target = straightenTarget( editor.state );
	const value = target ? straightenOffset( target.rot || 0 ) : 0;
	const label = __( 'Straighten', 'wunderpaint' );
	return (
		<section className="crp-section" aria-label={ label }>
			<div className="slider-row">
				<label htmlFor={ fieldId }>{ label }</label>
				<SnapSlider
					id={ fieldId }
					min={ -STRAIGHTEN_MAX }
					max={ STRAIGHTEN_MAX }
					step={ 0.1 }
					value={ value }
					def={ 0 }
					kind="angle"
					disabled={ ! target }
					ariaLabel={ label }
					onChange={ ( v ) => applyStraighten( editor, v ) }
					onCommit={ () => endStraighten( editor ) }
				/>
				<span className="val">{ `${ value.toFixed( 1 ) }°` }</span>
			</div>
			<p className="crp-hint">
				{ target
					? __(
							'Turns the photo, not the text on it. Or hold Ctrl (Mac: Cmd) and drag along a line that should be level or upright.',
							'wunderpaint'
					  )
					: __(
							'Select a photo layer to straighten it.',
							'wunderpaint'
					  ) }
			</p>
		</section>
	);
}

export function CropPanel( { editor } ) {
	const lockId = useId();
	const previewId = useId();
	const { state, dispatch } = editor;
	const opts = state.toolOpts.crop;
	const crop = cropBase( state );
	const patch = ( values ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool: 'crop', patch: values } );
	const update = ( values ) =>
		dispatch( { type: 'SET_CROP', crop: { ...crop, ...values } } );
	return (
		<div className="crp">
			<div className="crp-scroll">
				<section
					className="crp-section"
					aria-label={ __( 'Format', 'wunderpaint' ) }
				>
					<div className="crp-formats">
						{ CROP_FORMATS.map( ( [ id, label ] ) => {
							const ratio =
								cropRatioValue( id, state.doc ) || 1.35;
							return (
								<button
									type="button"
									key={ id }
									className="ai-tile ai-tile-compact"
									aria-pressed={ opts.ratio === id }
									onClick={ () =>
										setCropFormat( editor, id )
									}
								>
									<span className="ai-tile-icon">
										{ id === 'free' ? (
											I.crop( { size: 22 } )
										) : (
											<span
												className="crp-format-shape"
												style={ {
													width: Math.min(
														30,
														22 * ratio
													),
													height: Math.min(
														22,
														30 / ratio
													),
												} }
											/>
										) }
									</span>
									<span className="ai-tile-name">
										{ label() }
									</span>
								</button>
							);
						} ) }
					</div>
					<CropFormatSelect editor={ editor } more />
					<button
						type="button"
						className="ai-btn secondary sm"
						onClick={ () => swapCropOrientation( editor ) }
					>
						{ __( 'Swap orientation', 'wunderpaint' ) }
					</button>
				</section>
				<StraightenRow editor={ editor } />
				<section
					className="crp-section"
					aria-label={ __( 'Crop area', 'wunderpaint' ) }
				>
					<div className="crp-fields">
						<PixelField
							label={ __( 'Width (px)', 'wunderpaint' ) }
							value={ crop.w }
							onChange={ ( v ) =>
								setCropDimension( editor, 'w', v )
							}
						/>
						<PixelField
							label={ __( 'Height (px)', 'wunderpaint' ) }
							value={ crop.h }
							onChange={ ( v ) =>
								setCropDimension( editor, 'h', v )
							}
						/>
					</div>
					<label className="crp-check" htmlFor={ lockId }>
						<input
							id={ lockId }
							type="checkbox"
							checked={ opts.ratio !== 'free' }
							onChange={ ( e ) =>
								patch( {
									ratio: e.target.checked
										? `${ crop.w }:${ crop.h }`
										: 'free',
								} )
							}
						/>
						{ __( 'Lock ratio', 'wunderpaint' ) }
					</label>
					<div className="crp-fields">
						<PixelField
							label={ __( 'X (px)', 'wunderpaint' ) }
							value={ crop.x }
							position
							onChange={ ( x ) => update( { x } ) }
						/>
						<PixelField
							label={ __( 'Y (px)', 'wunderpaint' ) }
							value={ crop.y }
							position
							onChange={ ( y ) => update( { y } ) }
						/>
					</div>
					<button
						type="button"
						className="ai-btn secondary sm"
						onClick={ () =>
							update( {
								x: Math.round( ( state.doc.w - crop.w ) / 2 ),
								y: Math.round( ( state.doc.h - crop.h ) / 2 ),
							} )
						}
					>
						{ __( 'Center', 'wunderpaint' ) }
					</button>
				</section>
				<section
					className="crp-section"
					aria-label={ __( 'Preview', 'wunderpaint' ) }
				>
					<span className="crp-label">
						{ __( 'Guides', 'wunderpaint' ) }
					</span>
					<div
						className="dsm-seg"
						role="group"
						aria-label={ __( 'Guides', 'wunderpaint' ) }
					>
						{ [
							[ 'none', __( 'Off', 'wunderpaint' ) ],
							[ 'thirds', __( 'Thirds', 'wunderpaint' ) ],
							[ 'grid', __( 'Grid', 'wunderpaint' ) ],
						].map( ( [ id, label ] ) => (
							<button
								type="button"
								key={ id }
								className={
									( opts.guides || 'thirds' ) === id
										? 'is-active'
										: ''
								}
								aria-pressed={
									( opts.guides || 'thirds' ) === id
								}
								onClick={ () => patch( { guides: id } ) }
							>
								{ label }
							</button>
						) ) }
					</div>
					<label className="crp-check" htmlFor={ previewId }>
						<input
							id={ previewId }
							type="checkbox"
							checked={ !! opts.preview }
							onChange={ ( e ) => {
								patch( { preview: e.target.checked } );
								if ( e.target.checked && ! state.crop ) {
									update( {} );
								}
							} }
						/>
						{ __(
							'Keep preview when switching tools',
							'wunderpaint'
						) }
					</label>
					<button
						type="button"
						className="ai-btn secondary sm"
						onClick={ () => {
							if ( state.tool === 'crop' ) {
								patch( { preview: true } );
								if ( ! state.crop ) {
									update( {} );
								}
								dispatch( { type: 'SET_TOOL', tool: 'move' } );
							} else {
								dispatch( { type: 'SET_TOOL', tool: 'crop' } );
							}
						} }
					>
						{ state.tool === 'crop'
							? __( 'Arrange layers', 'wunderpaint' )
							: __( 'Edit Crop', 'wunderpaint' ) }
					</button>
					<p className="crp-hint">
						{ __(
							'The preview does not crop your document. Apply when the composition is ready.',
							'wunderpaint'
						) }
					</p>
				</section>
			</div>
			<div className="crp-actions">
				<CropActions editor={ editor } />
			</div>
		</div>
	);
}
