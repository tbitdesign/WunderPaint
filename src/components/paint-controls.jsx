/** One paint editor for shape/text fills, outlines and Repeat color ramps. */
import { colorLayerLocked } from '../lib/color-links';
import {
	selectedPaintLayers,
	mixedValue,
	paintValue,
} from '../lib/selection-paint';
import { useEffect, useRef, useState, useId } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../icons';
import { ColorPopover, anchoredPopoverStyle } from './color-popover';
import { GradientBar } from './gradient-bar';
import { useEscape } from './use-escape';
import { useEditorMaybe } from '../store/editor-context';
import { useGradients } from '../content/use-content';
import {
	listUserGradients,
	saveUserGradient,
	deleteUserGradient,
} from '../lib/gradient-presets';
import {
	gradientFillPresetAllowed,
	gradientFillPreset,
} from '../lib/gradient-fill-panel';
import {
	insertGradientStop,
	reverseGradientStops,
	distributeGradientStops,
} from '../lib/gradient-ramp';
import {
	defaultPaintStops,
	layerPaint,
	layerPaintPatch,
	paintColorPatch,
	paintCss,
	strokeSettings,
	strokeSettingsPatch,
	hasEffectStroke,
} from '../lib/layer-paint';
import { promptDialog } from '../lib/dialogs';
import { useColorEditor } from './use-color-editor';
import '../styles/editor/paint-controls.css';

export function PaintType( {
	value,
	onChange,
	disabled,
	pattern = false,
	solidOnly = false,
	cards = false,
} ) {
	return (
		<div
			className={
				cards ? 'paint-type paint-type-cards' : 'dsm-seg paint-type'
			}
			role="group"
			aria-label={ __( 'Paint', 'wunderpaint' ) }
		>
			{ [
				[ 'solid', __( 'Solid', 'wunderpaint' ), I.bucket ],
				...( solidOnly
					? []
					: [
							[
								'gradient',
								__( 'Gradient', 'wunderpaint' ),
								I.gradient,
							],
					  ] ),
				...( pattern
					? [ [ 'pattern', __( 'Pattern', 'wunderpaint' ), I.grid ] ]
					: [] ),
			].map( ( [ id, label, icon ] ) => (
				<button
					type="button"
					key={ id }
					className={ cards ? 'ai-tile' : undefined }
					disabled={ disabled }
					aria-pressed={ value === id }
					onClick={ () => onChange( id ) }
				>
					{ cards ? (
						<>
							<span className="ai-tile-icon">
								{ icon( { size: 26 } ) }
							</span>
							<span className="ai-tile-name">{ label }</span>
						</>
					) : (
						label
					) }
				</button>
			) ) }
		</div>
	);
}

export function PaintGradientControls( {
	paint,
	onChange,
	onCommit,
	index = 0,
	onSelect,
	disabled = false,
	ramp = false,
} ) {
	const angleId = useId();
	const positionId = useId();
	const midpointId = useId();
	const presets = useGradients();
	const [ own, setOwn ] = useState( listUserGradients );
	useEffect( () => {
		const refresh = () => setOwn( listUserGradients() );
		window.addEventListener( 'wpie:gradients-updated', refresh );
		return () =>
			window.removeEventListener( 'wpie:gradients-updated', refresh );
	}, [] );
	const stops = paint.stops?.length
		? paint.stops
		: defaultPaintStops( paint.color );
	const active = Math.max( 0, Math.min( index, stops.length - 1 ) );
	const update = ( patch ) => {
		onChange( patch );
		onCommit?.();
	};
	const saved = own.find(
		( p ) =>
			JSON.stringify( p.stops ) === JSON.stringify( stops ) &&
			( ramp || p.kind === paint.kind )
	);
	const groups = [
		[ __( 'Presets', 'wunderpaint' ), presets ],
		[ __( 'My gradients', 'wunderpaint' ), own ],
	];
	return (
		<fieldset className="paint-gradient-controls" disabled={ disabled }>
			<div className="paint-preset-row">
				<select
					aria-label={ __( 'Gradient presets', 'wunderpaint' ) }
					value=""
					onChange={ ( e ) => {
						if ( ! e.target.value ) {
							return;
						}
						const [ group, item ] = e.target.value
							.split( ':' )
							.map( Number );
						const preset = groups[ group ][ 1 ][ item ];
						update(
							ramp
								? { stops: gradientFillPreset( preset ).stops }
								: gradientFillPreset( preset )
						);
						onSelect?.( 0 );
					} }
				>
					<option value="">{ __( 'Presets', 'wunderpaint' ) }</option>
					{ groups.map( ( [ label, items ], gi ) => (
						<optgroup key={ label } label={ label }>
							{ items.map(
								( p, i ) =>
									gradientFillPresetAllowed( p ) && (
										<option
											key={ i }
											value={ `${ gi }:${ i }` }
										>
											{ p.name }
										</option>
									)
							) }
						</optgroup>
					) ) }
				</select>
				<button
					type="button"
					className="dsm-mini"
					title={ __( 'Save gradient', 'wunderpaint' ) }
					aria-label={ __( 'Save gradient', 'wunderpaint' ) }
					onClick={ async () => {
						const name = await promptDialog( {
							title: __( 'Save Gradient', 'wunderpaint' ),
							label: __( 'Name', 'wunderpaint' ),
							defaultValue: __( 'Gradient', 'wunderpaint' ),
						} );
						if ( name?.trim() ) {
							saveUserGradient(
								name.trim(),
								stops,
								ramp ? 'linear' : paint.kind,
								{ spread: 'pad' }
							);
						}
					} }
				>
					{ I.save( { size: 14 } ) }
				</button>
				{ saved && (
					<button
						type="button"
						className="dsm-mini"
						title={ __( 'Delete saved gradient', 'wunderpaint' ) }
						aria-label={ __(
							'Delete saved gradient',
							'wunderpaint'
						) }
						onClick={ () =>
							setOwn( deleteUserGradient( saved.name ) )
						}
					>
						{ I.trash( { size: 14 } ) }
					</button>
				) }
			</div>
			{ ! ramp && (
				<div className="paint-gradient-geometry">
					<select
						aria-label={ __( 'Gradient type', 'wunderpaint' ) }
						value={ paint.kind || 'linear' }
						onChange={ ( e ) => update( { kind: e.target.value } ) }
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
					<label htmlFor={ angleId }>
						<input
							id={ angleId }
							type="number"
							data-number-kind="angle"
							min="0"
							max="360"
							step="1"
							aria-label={ __( 'Angle', 'wunderpaint' ) }
							value={ paint.angle || 0 }
							disabled={ paint.kind === 'radial' || disabled }
							onChange={ ( e ) =>
								onChange( { angle: +e.target.value } )
							}
							onBlur={ onCommit }
						/>
						<span>°</span>
					</label>
				</div>
			) }
			<GradientBar
				stops={ stops }
				onChange={ ( next ) => onChange( { stops: next } ) }
				onCommit={ onCommit }
				activeIndex={ active }
				onSelect={ onSelect }
				disabled={ disabled }
			/>
			<div className="paint-stop-row">
				<span>
					{ sprintf(
						/* translators: %d: selected gradient stop. */ __(
							'Stop %d',
							'wunderpaint'
						),
						active + 1
					) }
				</span>
				<label htmlFor={ positionId }>
					<input
						id={ positionId }
						type="number"
						min="0"
						max="100"
						step="1"
						aria-label={ __( 'Stop position', 'wunderpaint' ) }
						value={ Math.round( stops[ active ].at * 100 ) }
						onChange={ ( e ) =>
							onChange( {
								stops: stops.map( ( s, i ) =>
									i === active
										? {
												...s,
												at:
													Math.max(
														0,
														Math.min(
															100,
															+e.target.value
														)
													) / 100,
										  }
										: s
								),
							} )
						}
						onBlur={ onCommit }
					/>
					<span>%</span>
				</label>
				<button
					type="button"
					className="dsm-mini"
					title={ __( 'Add', 'wunderpaint' ) }
					aria-label={ __( 'Add stop', 'wunderpaint' ) }
					onClick={ () => {
						update( { stops: insertGradientStop( stops, 0.5 ) } );
						onSelect?.( stops.length );
					} }
				>
					{ I.plus( { size: 13 } ) }
				</button>
				<button
					type="button"
					className="dsm-mini"
					disabled={ stops.length <= 2 }
					title={ __( 'Remove', 'wunderpaint' ) }
					aria-label={ __( 'Remove stop', 'wunderpaint' ) }
					onClick={ () => {
						update( {
							stops: stops.filter( ( _, i ) => i !== active ),
						} );
						onSelect?.( Math.max( 0, active - 1 ) );
					} }
				>
					{ I.minus( { size: 13 } ) }
				</button>
				<button
					type="button"
					className="dsm-mini"
					title={ __( 'Reverse', 'wunderpaint' ) }
					aria-label={ __( 'Reverse', 'wunderpaint' ) }
					onClick={ () =>
						update( { stops: reverseGradientStops( stops ) } )
					}
				>
					{ I.swap( { size: 13 } ) }
				</button>
			</div>
			<details className="paint-gradient-advanced">
				<summary>{ __( 'Advanced', 'wunderpaint' ) }</summary>
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ () =>
						update( { stops: distributeGradientStops( stops ) } )
					}
				>
					{ __( 'Distribute stops', 'wunderpaint' ) }
				</button>
				{ stops.some( ( s ) => s.at > stops[ active ].at ) && (
					<label htmlFor={ midpointId }>
						{ __( 'Transition midpoint', 'wunderpaint' ) }
						<input
							id={ midpointId }
							type="number"
							min="5"
							max="95"
							step="1"
							value={ Math.round(
								( stops[ active ].mid ?? 0.5 ) * 100
							) }
							onChange={ ( e ) =>
								onChange( {
									stops: stops.map( ( s, i ) =>
										i === active
											? {
													...s,
													mid:
														Math.max(
															5,
															Math.min(
																95,
																+e.target.value
															)
														) / 100,
											  }
											: s
									),
								} )
							}
							onBlur={ onCommit }
						/>
						%
					</label>
				) }
			</details>
		</fieldset>
	);
}

export function PaintTargets( {
	layer,
	target = 'fill',
	onSelect,
	compact = false,
	cards = false,
	disabled = false,
} ) {
	return (
		<div
			className={ `paint-targets${
				compact ? ' paint-targets-compact' : ''
			}${ cards ? ' paint-targets-cards' : '' }` }
			role="group"
			aria-label={ __( 'Fill and stroke', 'wunderpaint' ) }
		>
			{ ( layer.type === 'shape' && layer.shape === 'line'
				? [ 'stroke' ]
				: [ 'fill', 'stroke' ]
			).map( ( side ) => (
				<button
					type="button"
					key={ side }
					disabled={ disabled }
					className={ `paint-target${ cards ? ' ai-tile' : '' }` }
					title={
						side === 'fill'
							? __( 'Fill', 'wunderpaint' )
							: __( 'Stroke', 'wunderpaint' )
					}
					aria-label={
						side === 'fill'
							? __( 'Fill', 'wunderpaint' )
							: __( 'Stroke', 'wunderpaint' )
					}
					aria-pressed={ target === side }
					onClick={ ( event ) => onSelect( side, event ) }
				>
					<span className={ cards ? 'ai-tile-icon' : undefined }>
						<span
							className={ `paint-chip paint-chip-${ side }` }
							style={ {
								'--paint': paintCss(
									layerPaint( layer, side )
								),
							} }
						/>
					</span>
					{ ! compact && (
						<span className={ cards ? 'ai-tile-name' : undefined }>
							{ side === 'fill'
								? __( 'Fill', 'wunderpaint' )
								: __( 'Stroke', 'wunderpaint' ) }
						</span>
					) }
				</button>
			) ) }
		</div>
	);
}

export function PaintSwatch( {
	layer,
	followSelection = true,
	target = 'fill',
	onChange,
	onCommit,
	title,
	size = 26,
	disabled = false,
} ) {
	const editor = useEditorMaybe();
	const linked = !! editor?.state.layers.includes( layer );
	disabled =
		disabled ||
		( linked &&
			colorLayerLocked(
				editor.state.layers,
				editor.state.layers.find( ( l ) => l.id === layer.id )
			) );
	const [ open, setOpen ] = useState( null );
	const [ localIndex, setIndex ] = useState( 0 );
	const index = linked ? editor.state.gradientStop || 0 : localIndex;
	const select = ( i ) =>
		linked
			? editor.dispatch( { type: 'SET_GRADIENT_STOP', index: i } )
			: setIndex( i );
	const ref = useRef( null );
	const dirty = useRef( false );
	const paint = layerPaint( layer, target );
	const mixed =
		linked &&
		followSelection &&
		target !== 'additionalStroke' &&
		mixedValue( selectedPaintLayers( editor.state, layer ), ( item ) =>
			paintValue( item, target )
		);
	const label = mixed
		? `${ title }: ${ __( 'Mixed', 'wunderpaint' ) }`
		: title;
	const shared = useColorEditor( {
		layer,
		side: target,
		documentTarget:
			linked && followSelection && target !== 'additionalStroke',
		title,
		disabled,
		onChange,
		onCommit,
	} );
	const finish = () => {
		if ( dirty.current ) {
			onCommit?.();
			dirty.current = false;
		}
	};
	const close = () => {
		finish();
		setOpen( null );
	};
	useEscape( close, !! open );
	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const outside = ( e ) => {
			if (
				! ref.current?.contains( e.target ) &&
				! e.target.closest?.(
					'.wpie-input-dialog, .wpie-confirm-dialog, .color-popover'
				)
			) {
				finish();
				setOpen( null );
			}
		};
		document.addEventListener( 'mousedown', outside );
		return () => document.removeEventListener( 'mousedown', outside );
	} );
	const patch = ( change ) => {
		if ( disabled ) {
			return;
		}
		onChange( layerPaintPatch( layer, target, change ) );
		dirty.current = true;
	};
	const active = Math.max( 0, Math.min( index, paint.stops.length - 1 ) );
	return (
		<span className="paint-swatch-wrap" ref={ ref }>
			<button
				type="button"
				className={ `paint-chip paint-chip-${ target }${
					mixed ? ' is-mixed' : ''
				}` }
				title={ label }
				aria-label={ label }
				disabled={ disabled }
				aria-expanded={ shared.open || !! open }
				style={ {
					'--paint': paintCss( paint ),
					width: size,
					height: size,
				} }
				onClick={ ( e ) => {
					if ( shared.show( e.currentTarget ) ) {
						setOpen( null );
						return;
					}
					if ( linked ) {
						editor.dispatch( { type: 'SET_PAINT_TARGET', target } );
					}
					if ( open ) {
						close();
					} else {
						const position = anchoredPopoverStyle(
							e.currentTarget.getBoundingClientRect()
						);
						setOpen( {
							...position,
							left: Math.max(
								8,
								Math.min(
									position.left,
									window.innerWidth - 254
								)
							),
							maxHeight: window.innerHeight - position.top - 8,
						} );
					}
				} }
			>
				{ mixed && I.layers( { size: 14 } ) }
			</button>
			{ mixed && (
				<span className="paint-mixed-label">
					{ __( 'Mixed', 'wunderpaint' ) }
				</span>
			) }
			{ open && (
				<div
					className="paint-popover"
					style={ open }
					role="dialog"
					aria-label={ title }
				>
					<PaintType
						disabled={ disabled }
						value={ paint.type }
						onChange={ ( type ) => {
							patch( {
								type,
								stops: paint.stops.length
									? paint.stops
									: defaultPaintStops( paint.color ),
							} );
							finish();
						} }
					/>
					{ paint.type === 'gradient' && (
						<PaintGradientControls
							paint={ paint }
							disabled={ disabled }
							onChange={ patch }
							onCommit={ finish }
							index={ index }
							onSelect={ select }
						/>
					) }
					<ColorPopover
						embedded
						color={
							paint.type === 'gradient'
								? paint.stops[ active ]?.color
								: paint.color
						}
						onChange={ ( color ) => {
							if ( disabled ) {
								return;
							}
							onChange(
								paintColorPatch( layer, target, color, index )
							);
							dirty.current = true;
						} }
					/>
				</div>
			) }
		</span>
	);
}

/** A ramp in a tool or Repeat is edited by the same window as object paint. */
export function RampSwatch( {
	paint,
	onChange,
	onCommit,
	title,
	disabled = false,
} ) {
	const shared = useColorEditor( {
		paint,
		onChange,
		onCommit,
		title,
		disabled,
		ramp: true,
	} );
	return (
		<button
			type="button"
			className="paint-ramp-swatch"
			title={ title }
			aria-label={ title }
			aria-expanded={ shared.open }
			disabled={ disabled }
			style={ { '--paint': paintCss( { ...paint, type: 'gradient' } ) } }
			onClick={ ( e ) => shared.show( e.currentTarget ) }
		>
			<span />
			{ I.sliders( { size: 14 } ) }
		</button>
	);
}

/** Primary stroke plus an explicitly named legacy second outline, if present. */
export function StrokeControls( {
	layer,
	onChange,
	onCommit,
	disabled = false,
	stacked = false,
} ) {
	const controlId = useId();
	const stroke = strokeSettings( layer );
	const additional =
		hasEffectStroke( layer ) &&
		( layer.type === 'text' ? layer.outlineW : layer.strokeW ) > 0;
	const change = ( patch ) => {
		onChange( patch );
		onCommit?.();
	};
	const withCaption = ( caption, control ) =>
		stacked ? (
			<div className="paint-stroke-field">
				<span>{ caption }</span>
				{ control }
			</div>
		) : (
			control
		);
	const row = ( extra = false ) => {
		const carrier = extra ? { ...layer, styles: null } : layer;
		const settings = strokeSettings( carrier );
		return (
			<div className="paint-stroke-controls">
				<div className="paint-stroke-row">
					{ withCaption(
						__( 'Color', 'wunderpaint' ),
						<PaintSwatch
							layer={ layer }
							target={ extra ? 'additionalStroke' : 'stroke' }
							title={
								extra
									? __( 'Additional outline', 'wunderpaint' )
									: __( 'Stroke', 'wunderpaint' )
							}
							onChange={ onChange }
							onCommit={ onCommit }
							disabled={ disabled }
						/>
					) }
					<label htmlFor={ `${ controlId }-${ extra }-width` }>
						{ __( 'Width', 'wunderpaint' ) }
						<input
							id={ `${ controlId }-${ extra }-width` }
							type="number"
							min="0"
							max="200"
							value={ settings.size }
							disabled={ disabled }
							onChange={ ( e ) =>
								change(
									strokeSettingsPatch( carrier, {
										size: Math.max( 0, +e.target.value ),
									} )
								)
							}
						/>
					</label>
					{ ( settings.source === 'effect' ||
						layer.type === 'shape' ) &&
						withCaption(
							__( 'Position', 'wunderpaint' ),
							<select
								aria-label={ __( 'Position', 'wunderpaint' ) }
								value={ settings.position }
								disabled={ disabled }
								onChange={ ( e ) =>
									change(
										strokeSettingsPatch( carrier, {
											position: e.target.value,
										} )
									)
								}
							>
								{ [
									[ 'inside', __( 'Inside', 'wunderpaint' ) ],
									[ 'center', __( 'Center', 'wunderpaint' ) ],
									[
										'outside',
										__( 'Outside', 'wunderpaint' ),
									],
								].map( ( [ value, label ] ) => (
									<option key={ value } value={ value }>
										{ label }
									</option>
								) ) }
							</select>
						) }
					{ settings.source === 'native' &&
						layer.type === 'text' &&
						withCaption(
							__( 'Stroke style', 'wunderpaint' ),
							<select
								aria-label={ __(
									'Stroke style',
									'wunderpaint'
								) }
								value={ layer.outlineDash || 'solid' }
								disabled={ disabled }
								onChange={ ( e ) =>
									change( { outlineDash: e.target.value } )
								}
							>
								{ [
									[ 'solid', __( 'Solid', 'wunderpaint' ) ],
									[ 'dashed', __( 'Dashed', 'wunderpaint' ) ],
									[ 'dotted', __( 'Dotted', 'wunderpaint' ) ],
								].map( ( [ value, label ] ) => (
									<option key={ value } value={ value }>
										{ label }
									</option>
								) ) }
							</select>
						) }
				</div>
				{ settings.source === 'native' &&
					layer.type === 'text' &&
					[ 'dashed', 'dotted' ].includes( layer.outlineDash ) && (
						<div className="paint-stroke-row">
							{ layer.outlineDash === 'dashed' && (
								<label
									htmlFor={ `${ controlId }-${ extra }-dash` }
								>
									{ __( 'Dash', 'wunderpaint' ) }
									<input
										id={ `${ controlId }-${ extra }-dash` }
										type="number"
										min="1"
										value={
											layer.outlineDashLen ||
											Math.max( 1, settings.size * 3 )
										}
										onChange={ ( e ) =>
											change( {
												outlineDashLen: Math.max(
													1,
													+e.target.value
												),
											} )
										}
									/>
								</label>
							) }
							<label htmlFor={ `${ controlId }-${ extra }-gap` }>
								{ __( 'Gap', 'wunderpaint' ) }
								<input
									id={ `${ controlId }-${ extra }-gap` }
									type="number"
									min="1"
									value={
										layer.outlineDashGap ||
										Math.max( 1, settings.size * 2 )
									}
									onChange={ ( e ) =>
										change( {
											outlineDashGap: Math.max(
												1,
												+e.target.value
											),
										} )
									}
								/>
							</label>
						</div>
					) }
			</div>
		);
	};
	return (
		<div className="paint-stroke-group">
			{ row() }
			{ stroke.source === 'effect' && (
				<label
					className="paint-stroke-opacity"
					htmlFor={ `${ controlId }-opacity` }
				>
					<span>{ __( 'Opacity', 'wunderpaint' ) }</span>
					<input
						id={ `${ controlId }-opacity` }
						type="number"
						min="0"
						max="100"
						value={ Math.round( ( stroke.opacity ?? 1 ) * 100 ) }
						disabled={ disabled }
						onChange={ ( e ) =>
							change(
								strokeSettingsPatch( layer, {
									opacity:
										Math.max(
											0,
											Math.min( 100, +e.target.value )
										) / 100,
								} )
							)
						}
					/>
					%
				</label>
			) }
			{ additional && (
				<details>
					<summary>
						{ __( 'Additional outline', 'wunderpaint' ) }
					</summary>
					{ row( true ) }
				</details>
			) }
		</div>
	);
}
