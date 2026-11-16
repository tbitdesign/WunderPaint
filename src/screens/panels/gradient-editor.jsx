/** Full gradient library and controls inside the single Color window. */
import {
	useState,
	useEffect,
	useId,
	useRef,
	useMemo,
	memo,
} from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import { GradientBar } from '../../components/gradient-bar';
import { GradientDial } from './gradient-controls';
import { GradientFieldControls } from './gradient-field-controls';
import { gradientFieldPresets } from '../../lib/gradient-field-presets';
import { isGradientField } from '../../lib/gradient-fields';
import {
	expandedGradientStops,
	insertGradientStop,
	reverseGradientStops,
	distributeGradientStops,
} from '../../lib/gradient-ramp';
import { useGradients } from '../../content/use-content';
import {
	listUserGradients,
	saveUserGradient,
	deleteUserGradient,
} from '../../lib/gradient-presets';
import {
	gradientPaint,
	gradientGeometry,
	gradientGeometryPatch,
	gradientKindPatch,
} from '../../lib/gradient-layer';
import {
	gradientFillPresetAllowed,
	gradientFillPreset,
} from '../../lib/gradient-fill-panel';
import { promptDialog } from '../../lib/dialogs';
import { gradientAxis } from '../../lib/gradient-axis';
import { drawGradient } from '../../lib/raster/shapes';
const KINDS = [
	[ 'linear', () => __( 'Linear', 'wunderpaint' ) ],
	[ 'radial', () => __( 'Radial', 'wunderpaint' ) ],
	[ 'angle', () => __( 'Angle', 'wunderpaint' ) ],
	[ 'freeform', () => __( 'Freeform', 'wunderpaint' ) ],
	[ 'mesh', () => __( 'Mesh', 'wunderpaint' ) ],
];
function previewCss( gradient ) {
	const stops = expandedGradientStops( gradient.stops )
		.map( ( s ) => `${ s.color } ${ s.at * 100 }%` )
		.join( ', ' );
	return gradient.kind === 'radial'
		? `radial-gradient(circle, ${ stops })`
		: gradient.kind === 'angle'
		? `conic-gradient(from 90deg, ${ stops })`
		: `linear-gradient(90deg, ${ stops })`;
}
function FieldTile( { gradient } ) {
	const ref = useRef( null );
	useEffect( () => {
		const ctx = ref.current.getContext( '2d' );
		ctx.clearRect( 0, 0, 96, 96 );
		drawGradient( ctx, { ...gradient, x: 0, y: 0, w: 96, h: 96 } );
	}, [ gradient ] );
	return (
		<canvas
			ref={ ref }
			className="gp-tile-paint"
			width="96"
			height="96"
			aria-hidden="true"
		/>
	);
}
const GradientTiles = memo( function GradientTiles( {
	presets,
	onPick,
	selected,
	disabled,
} ) {
	return (
		<div className="gp-presets">
			{ presets.map( ( p, i ) => (
				<button
					type="button"
					key={ `${ p.name }-${ i }` }
					title={ p.name }
					aria-label={ p.name }
					aria-pressed={ selected === p }
					disabled={ disabled }
					onClick={ () => onPick( p ) }
				>
					{ isGradientField( p.kind ) ? (
						<FieldTile gradient={ p } />
					) : (
						<span
							className="gp-tile-paint"
							style={ { backgroundImage: previewCss( p ) } }
						/>
					) }
					<span className="gp-tile-name">{ p.name }</span>
				</button>
			) ) }
		</div>
	);
} );
function GradientPreview( { gradient } ) {
	const canvas = useRef( null );
	useEffect( () => {
		const ctx = canvas.current?.getContext( '2d' );
		if ( ! ctx ) {
			return;
		}
		ctx.clearRect( 0, 0, 640, 144 );
		ctx.save();
		ctx.scale( 640 / gradient.w, 144 / gradient.h );
		drawGradient( ctx, gradient, { gradientQuality: 'draft' } );
		ctx.restore();
	}, [ gradient ] );
	return (
		<div className="gp-preview">
			<canvas
				ref={ canvas }
				width="640"
				height="144"
				role="img"
				aria-label={ __( 'Gradient preview', 'wunderpaint' ) }
			/>
		</div>
	);
}
export function GradientLibrary( {
	paint,
	scope = 'layer',
	disabled,
	onChange,
	onSelect,
} ) {
	const allowed = ( preset ) =>
		scope === 'layer' || gradientFillPresetAllowed( preset );
	const comparable = ( preset ) =>
		scope === 'ramp'
			? gradientPaint( preset ).stops
			: scope === 'fill'
			? gradientFillPreset( preset )
			: gradientPaint( preset );
	const stops = paint.stops;
	const basePresets = useGradients(),
		presets = useMemo(
			() => [ ...gradientFieldPresets(), ...basePresets ],
			[ basePresets ]
		),
		[ own, setOwn ] = useState( listUserGradients ),
		[ library, setLibrary ] = useState( 'presets' ),
		[ search, setSearch ] = useState( '' );
	useEffect( () => {
		const refresh = () => setOwn( listUserGradients() );
		window.addEventListener( 'wpie:gradients-updated', refresh );
		return () =>
			window.removeEventListener( 'wpie:gradients-updated', refresh );
	}, [] );
	const catalog = ( library === 'own' ? own : presets ).filter( allowed );
	const shown = useMemo(
		() =>
			catalog.filter( ( p ) =>
				p.name
					.toLocaleLowerCase()
					.includes( search.toLocaleLowerCase() )
			),
		[ catalog, search ]
	);
	const groups = useMemo(
		() =>
			KINDS.filter(
				( [ kind ] ) => scope === 'layer' || ! isGradientField( kind )
			)
				.map( ( [ kind, label ] ) => ( {
					kind,
					label,
					items: shown.filter(
						( p ) => ( p.kind || 'linear' ) === kind
					),
				} ) )
				.filter( ( group ) => group.items.length || ! search ),
		[ shown, search, scope ]
	);
	const selected = shown.find(
		( p ) =>
			( p.kind || 'linear' ) === paint.kind &&
			JSON.stringify( comparable( p ) ) ===
				JSON.stringify( comparable( paint ) )
	);

	const pick = ( preset ) => {
		onChange(
			scope === 'ramp'
				? { stops: gradientPaint( preset ).stops }
				: scope === 'fill'
				? gradientFillPreset( preset )
				: gradientPaint( preset )
		);
		onSelect( 0 );
	};
	return (
		<div className="gp-library">
			<div className="gp-library-head">
				<div className="gp-tabs">
					<button
						type="button"
						aria-pressed={ library === 'presets' }
						onClick={ () => {
							setLibrary( 'presets' );
							setSearch( '' );
						} }
					>
						{ __( 'Presets', 'wunderpaint' ) }
					</button>
					<button
						type="button"
						aria-pressed={ library === 'own' }
						onClick={ () => {
							setLibrary( 'own' );
							setSearch( '' );
							setOwn( listUserGradients() );
						} }
					>
						{ __( 'My gradients', 'wunderpaint' ) }
					</button>
				</div>
			</div>
			<input
				type="search"
				aria-label={ __( 'Search gradients', 'wunderpaint' ) }
				placeholder={ __( 'Search', 'wunderpaint' ) }
				value={ search }
				onChange={ ( e ) => setSearch( e.target.value ) }
			/>
			<div className="gp-library-scroll">
				{ groups.map( ( { kind, label, items } ) => (
					<details
						className="gp-preset-group"
						key={ `${ library }-${ kind }-${ paint.kind }-${ search }` }
						open={ !! search || kind === paint.kind }
					>
						<summary>
							<span>{ label() }</span>
							<span className="gp-group-count">
								{ items.length }
							</span>
						</summary>
						{ ! items.length && (
							<p className="gp-hint">
								{ __( 'No gradients found.', 'wunderpaint' ) }
							</p>
						) }
						<GradientTiles
							presets={ items }
							onPick={ pick }
							selected={ selected }
							disabled={ disabled }
						/>
					</details>
				) ) }
				{ ! shown.length && (
					<p className="gp-hint">
						{ library === 'own' && ! own.length
							? __(
									'Save a gradient to reuse it here.',
									'wunderpaint'
							  )
							: __( 'No gradients found.', 'wunderpaint' ) }
					</p>
				) }
			</div>
			<button
				type="button"
				className="gp-save ai-btn secondary sm"
				onClick={ async () => {
					const name = await promptDialog( {
						title: __( 'Save Gradient', 'wunderpaint' ),
						label: __( 'Name', 'wunderpaint' ),
						defaultValue: __( 'Gradient', 'wunderpaint' ),
					} );
					if ( name?.trim() ) {
						setOwn(
							saveUserGradient(
								name.trim(),
								stops,
								paint.kind,
								paint
							)
						);
						setLibrary( 'own' );
						setSearch( '' );
					}
				} }
			>
				{ __( 'Save', 'wunderpaint' ) }
			</button>
			{ library === 'own' && selected && (
				<button
					type="button"
					className="gp-remove ai-btn secondary sm"
					onClick={ () =>
						setOwn( deleteUserGradient( selected.name ) )
					}
				>
					{ I.trash( { size: 13 } ) }
					{ __( 'Delete saved gradient', 'wunderpaint' ) }
				</button>
			) }
		</div>
	);
}
export function GradientKinds( { paint, layer, scope, disabled, onChange } ) {
	const id = useId();
	return (
		<label className="color-gradient-kind" htmlFor={ id }>
			<span>{ __( 'Gradient type', 'wunderpaint' ) }</span>
			<select
				id={ id }
				value={ paint.kind }
				disabled={ disabled }
				onChange={ ( event ) => {
					const kind = event.target.value;
					onChange(
						layer
							? gradientKindPatch( layer, kind )
							: gradientPaint( { ...paint, kind } )
					);
				} }
			>
				{ KINDS.filter(
					( [ kind ] ) =>
						scope === 'layer' || ! isGradientField( kind )
				).map( ( [ kind, label ] ) => (
					<option key={ kind } value={ kind }>
						{ label() }
					</option>
				) ) }
			</select>
		</label>
	);
}

export function GradientControls( {
	paint,
	layer = null,
	scope = 'layer',
	disabled = false,
	selectedStop = 0,
	onSelectStop,
	onChange,
	onCommit,
	colorControls,
} ) {
	const locked = disabled;
	const stops = paint.stops;
	const index = Math.max( 0, Math.min( selectedStop, stops.length - 1 ) );
	const stop = stops[ index ];
	const geometry =
		layer && ! isGradientField( paint.kind )
			? gradientGeometry( layer )
			: null;
	const finish = onCommit;
	const update = ( change, done = false ) => {
		if ( disabled ) {
			return;
		}
		onChange( change );
		if ( done ) {
			onCommit();
		}
	};
	const updateStops = ( next, done = false ) =>
		update( { stops: next }, done );
	const modifyStop = ( change, done = false ) =>
		updateStops(
			stops.map( ( s, i ) => ( i === index ? { ...s, ...change } : s ) ),
			done
		);
	const addStop = () => {
		const currentAt = stop?.at ?? 0,
			after = [ ...stops ]
				.sort( ( a, b ) => a.at - b.at )
				.find( ( s ) => s.at > currentAt ),
			at = after ? ( currentAt + after.at ) / 2 : currentAt / 2;
		updateStops( insertGradientStop( stops, at ), true );
		onSelectStop( stops.length );
	};
	const removeStop = () => {
		if ( stops.length <= 2 ) {
			return;
		}
		updateStops(
			stops.filter( ( _, i ) => i !== index ),
			true
		);
		onSelectStop( Math.max( 0, index - 1 ) );
	};
	const preview = useMemo( () => {
		if ( layer ) {
			return layer;
		}
		const axis = gradientAxis( {
			w: 320,
			h: 144,
			gradientKind: paint.kind,
			gradientAngle: paint.angle || 0,
		} );
		return {
			...paint,
			x: 0,
			y: 0,
			w: 320,
			h: 144,
			from: axis.a,
			to: axis.b,
		};
	}, [ layer, paint ] );
	return (
		<div
			className={ `gp gp-controls ${
				scope === 'fill' ? 'gp-fill' : ''
			}` }
		>
			{ ' ' }
			<fieldset disabled={ locked }>
				{ scope !== 'ramp' && <GradientPreview gradient={ preview } /> }
				{ isGradientField( paint.kind ) ? (
					<GradientFieldControls
						colorControls={ colorControls }
						disabled={ locked }
						paint={ paint }
						index={ selectedStop }
						onSelect={ onSelectStop }
						update={ update }
						finish={ finish }
					/>
				) : (
					<>
						<GradientBar
							stops={ stops }
							onChange={ updateStops }
							activeIndex={ index }
							onSelect={ onSelectStop }
							onCommit={ finish }
							disabled={ locked }
						/>
						<div className="gp-stop-actions">
							<button type="button" onClick={ addStop }>
								{ I.plus( { size: 13 } ) }
								{ __( 'Add', 'wunderpaint' ) }
							</button>
							<button
								type="button"
								disabled={ stops.length <= 2 }
								onClick={ removeStop }
							>
								{ I.minus( { size: 13 } ) }
								{ __( 'Remove', 'wunderpaint' ) }
							</button>
							<button
								type="button"
								onClick={ () => {
									updateStops(
										reverseGradientStops( stops ),
										true
									);
								} }
							>
								{ I.swap( { size: 13 } ) }
								{ __( 'Reverse', 'wunderpaint' ) }
							</button>
						</div>

						{ stop && (
							<>
								<div className="gp-dials">
									<GradientDial
										label={ __(
											'Position',
											'wunderpaint'
										) }
										value={ stop.at * 100 }
										onChange={ ( at ) =>
											modifyStop( {
												at: at / 100,
											} )
										}
										onCommit={ finish }
									/>
								</div>
							</>
						) }
						{ colorControls }
						<details className="color-editor-details gp-adjustments">
							<summary>
								{ __( 'Gradient settings', 'wunderpaint' ) }
							</summary>
							<div className="color-section-content">
								<div className="gp-stop-actions">
									<button
										type="button"
										onClick={ () =>
											updateStops(
												distributeGradientStops(
													stops
												),
												true
											)
										}
									>
										{ __(
											'Distribute stops',
											'wunderpaint'
										) }
									</button>
									{ scope === 'layer' &&
										paint.kind !== 'angle' && (
											<select
												aria-label={ __(
													'Spread',
													'wunderpaint'
												) }
												value={ paint.spread }
												onChange={ ( e ) =>
													update(
														{
															spread: e.target
																.value,
														},
														true
													)
												}
											>
												<option value="pad">
													{ __(
														'Extend',
														'wunderpaint'
													) }
												</option>
												<option value="repeat">
													{ __(
														'Repeat',
														'wunderpaint'
													) }
												</option>
												<option value="reflect">
													{ __(
														'Reflect',
														'wunderpaint'
													) }
												</option>
											</select>
										) }
								</div>
								{ stop &&
									stops.some( ( s ) => s.at > stop.at ) && (
										<GradientDial
											label={ __(
												'Transition midpoint',
												'wunderpaint'
											) }
											value={ ( stop.mid ?? 0.5 ) * 100 }
											min={ 5 }
											max={ 95 }
											onChange={ ( mid ) =>
												modifyStop( { mid: mid / 100 } )
											}
											onCommit={ finish }
										/>
									) }

								{ scope === 'fill' && (
									<GradientDial
										label={ __( 'Angle', 'wunderpaint' ) }
										suffix="°"
										value={ paint.angle || 0 }
										min={ 0 }
										max={ 360 }
										onChange={ ( angle ) =>
											update( { angle } )
										}
										onCommit={ finish }
									/>
								) }
								{ geometry ? (
									<div className="gp-geometry">
										<div className="gp-dials">
											<GradientDial
												label={ __(
													'Angle',
													'wunderpaint'
												) }
												value={ geometry.angle }
												max={ 360 }
												suffix="°"
												onChange={ ( angle ) =>
													update(
														gradientGeometryPatch(
															layer,
															{
																angle,
															}
														)
													)
												}
												onCommit={ finish }
											/>
											{ scope === 'layer' &&
												paint.kind !== 'angle' && (
													<GradientDial
														label={
															paint.kind ===
															'radial'
																? __(
																		'Radius',
																		'wunderpaint'
																  )
																: __(
																		'Length',
																		'wunderpaint'
																  )
														}
														value={
															geometry.length
														}
														min={ 1 }
														max={ Math.max(
															Math.ceil(
																geometry.length
															),
															Math.ceil(
																Math.hypot(
																	layer.w,
																	layer.h
																) * 2
															)
														) }
														suffix="px"
														onChange={ ( length ) =>
															update(
																gradientGeometryPatch(
																	layer,
																	{
																		length,
																	}
																)
															)
														}
														onCommit={ finish }
													/>
												) }
											<GradientDial
												label={ __(
													'Center X',
													'wunderpaint'
												) }
												value={ geometry.cx }
												min={ Math.min(
													-100,
													Math.floor( geometry.cx )
												) }
												max={ Math.max(
													200,
													Math.ceil( geometry.cx )
												) }
												onChange={ ( cx ) =>
													update(
														gradientGeometryPatch(
															layer,
															{
																cx,
															}
														)
													)
												}
												onCommit={ finish }
											/>
											<GradientDial
												label={ __(
													'Center Y',
													'wunderpaint'
												) }
												value={ geometry.cy }
												min={ Math.min(
													-100,
													Math.floor( geometry.cy )
												) }
												max={ Math.max(
													200,
													Math.ceil( geometry.cy )
												) }
												onChange={ ( cy ) =>
													update(
														gradientGeometryPatch(
															layer,
															{
																cy,
															}
														)
													)
												}
												onCommit={ finish }
											/>
										</div>
									</div>
								) : scope === 'layer' ? (
									<p className="gp-hint">
										{ __(
											'Drag on the canvas to draw a gradient. Shift snaps the direction.',
											'wunderpaint'
										) }
									</p>
								) : null }
							</div>
						</details>
					</>
				) }
			</fieldset>
		</div>
	);
}
