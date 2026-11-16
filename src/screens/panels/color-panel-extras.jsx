import {
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { ColorField } from '../../components/color-field';
import { useEscape } from '../../components/use-escape';
import { ToolSetting } from './tool-setting';
import { colorKey, scanColors } from '../../lib/color-replace';
import {
	colorFields,
	colorLayerLocked,
	canLinkColor,
	targetColorField,
	readColorField,
	isSolidCarrier,
} from '../../lib/color-links';
import { paletteMixPatches, blendPalettes } from '../../lib/color-experiments';
import {
	measureColorResult,
	calculateColorResult,
} from '../../lib/color-result';
import { parseColor, rgbToHex } from '../../lib/color';

const fieldNames = () => ( {
	fill: __( 'Fill', 'wunderpaint' ),
	stroke: __( 'Stroke', 'wunderpaint' ),
	color: __( 'Text color', 'wunderpaint' ),
	outlineColor: __( 'Outline', 'wunderpaint' ),
	effectStroke: __( 'Stroke', 'wunderpaint' ),
} );

export function ColorLinks( { editor, layer, target } ) {
	const { state, dispatch, commit } = editor;
	const field = targetColorField( target, layer );
	const link = layer?.colorLinks?.[ field ];
	const [ chosen, setChosen ] = useState( null );
	const [ lightness, setLightness ] = useState( link?.lightness ?? -20 );
	const fields = fieldNames();
	const sourceId = useId();
	const choices = state.layers.flatMap( ( l ) =>
		colorFields( l )
			.filter(
				( key ) =>
					canLinkColor( state.layers, layer?.id, field, l.id, key ) &&
					( ! [ 'fill', 'color' ].includes( key ) ||
						! l.fillType ||
						l.fillType === 'solid' )
			)
			.map( ( key ) => ( {
				id: JSON.stringify( [ l.id, key ] ),
				layer: l,
				key,
			} ) )
	);
	const sameLayer = choices.find( ( c ) => c.layer.id === layer?.id );
	const selected =
		chosen ??
		( link
			? JSON.stringify( [ link.sourceId, link.source ] )
			: sameLayer?.id || choices[ 0 ]?.id || '' );
	const source = choices.find( ( c ) => c.id === selected );
	const editable =
		layer &&
		colorFields( layer ).includes( field ) &&
		isSolidCarrier( layer, field ) &&
		! colorLayerLocked( state.layers, layer );
	const save = () => {
		if ( ! editable || ! source ) {
			return;
		}
		const patch = {
			colorLinks: {
				...layer.colorLinks,
				[ field ]: {
					sourceId: source.layer.id,
					source: source.key,
					lightness,
				},
			},
		};
		if ( field === 'fill' || field === 'color' ) {
			patch.fillType = 'solid';
		}
		if ( field === 'stroke' && ! layer.strokeW ) {
			patch.strokeW = 1;
		}
		if ( field === 'outlineColor' && ! layer.outlineW ) {
			patch.outlineW = 1;
		}
		if ( field === 'color' ) {
			// A whole-object relationship applies uniformly, preserving all typography.
			const withoutColor = ( style ) => {
				if ( ! style ) {
					return style;
				}
				const { color, ...rest } = style;
				return rest;
			};
			patch.spans = layer.spans?.map( ( run ) => ( {
				...run,
				s: withoutColor( run.s ),
			} ) );
			patch.lineStyles = layer.lineStyles?.map( withoutColor );
		}
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( __( 'Link color', 'wunderpaint' ) );
	};
	useEffect( () => {
		setChosen( null );
		setLightness( link?.lightness ?? -20 );
	}, [ link ] );
	if ( ! editable ) {
		return (
			<p className="color-panel-note">
				{ __( 'Select a text or shape color to link.', 'wunderpaint' ) }
			</p>
		);
	}
	return (
		<div className="color-panel-extra">
			<p className="color-panel-note">
				{ __(
					'This color follows its source. Negative lightness keeps it darker, positive lightness makes it lighter.',
					'wunderpaint'
				) }
			</p>
			<label className="color-panel-stack" htmlFor={ sourceId }>
				{ __( 'Source color', 'wunderpaint' ) }
				<select
					id={ sourceId }
					aria-label={ __( 'Source color', 'wunderpaint' ) }
					value={ selected }
					onChange={ ( e ) => setChosen( e.target.value ) }
				>
					{ ! source && (
						<option value={ selected }>
							{ __( 'Source unavailable', 'wunderpaint' ) }
						</option>
					) }
					{ choices.map( ( c ) => (
						<option key={ c.id } value={ c.id }>{ `${
							c.layer.name || c.layer.type
						} · ${
							c.layer.styles?.stroke &&
							[ 'stroke', 'outlineColor' ].includes( c.key )
								? __( 'Additional outline', 'wunderpaint' )
								: fields[ c.key ]
						}` }</option>
					) ) }
				</select>
			</label>
			<ToolSetting
				label={ __( 'Lightness', 'wunderpaint' ) }
				value={ lightness }
				min={ -100 }
				max={ 100 }
				onChange={ setLightness }
			/>
			<div className="color-panel-actions">
				<button
					type="button"
					className="ai-btn secondary sm"
					disabled={ ! source }
					onClick={ save }
				>
					{ link
						? __( 'Update', 'wunderpaint' )
						: __( 'Link', 'wunderpaint' ) }
				</button>
				{ link && (
					<button
						type="button"
						className="ai-btn secondary sm"
						onClick={ () => {
							const links = { ...layer.colorLinks };
							delete links[ field ];
							dispatch( {
								type: 'UPDATE_LAYER',
								id: layer.id,
								patch: { colorLinks: links },
							} );
							commit( __( 'Unlink color', 'wunderpaint' ) );
						} }
					>
						{ __( 'Unlink', 'wunderpaint' ) }
					</button>
				) }
			</div>
			<p className="color-panel-note" role="status">
				{ link
					? __(
							'Linked. Editing this color directly releases the link.',
							'wunderpaint'
					  )
					: __(
							'Choose a source, then Link. The relationship is saved with the document.',
							'wunderpaint'
					  ) }
			</p>
		</div>
	);
}

export function PaletteMix( {
	editor,
	collections,
	showPreview,
	clearPreview,
} ) {
	const { state, dispatch, commit } = editor;
	const mixId = useId();
	const [ fromId, setFrom ] = useState( 'document' );
	const [ toId, setTo ] = useState(
		collections.find( ( p ) => p.group && p.colors.length )?.id ||
			'standard'
	);
	const [ amount, setAmount ] = useState( 0 );
	const [ preview, setPreview ] = useState( true );
	const previewBase = useRef( { layers: state.layers, doc: state.doc } );
	const startPreview = () => {
		previewBase.current = { layers: state.layers, doc: state.doc };
		setPreview( true );
	};
	const exact = useMemo(
		() =>
			scanColors( state.layers, state.doc ).colors.map( ( c ) => c.key ),
		[ state.layers, state.doc ]
	);
	const palettes = collections
		.map( ( p ) => ( p.id === 'document' ? { ...p, colors: exact } : p ) )
		.filter( ( p ) => p.colors.length );
	const from = palettes.find( ( p ) => p.id === fromId ) || palettes[ 0 ];
	const to = palettes.find( ( p ) => p.id === toId ) || palettes[ 0 ];
	const a = JSON.stringify( from?.colors || [] ),
		b = JSON.stringify( to?.colors || [] );
	const mixed = useMemo(
		() =>
			paletteMixPatches(
				state.layers,
				state.doc,
				JSON.parse( a ),
				JSON.parse( b ),
				amount / 100
			),
		[ state.layers, state.doc, a, b, amount ]
	);
	const pairs = blendPalettes(
		from?.colors || [],
		to?.colors || [],
		amount / 100
	);
	useEffect( () => {
		if (
			preview &&
			( previewBase.current.layers !== state.layers ||
				previewBase.current.doc !== state.doc )
		) {
			setPreview( false );
			clearPreview( 'mix' );
			return undefined;
		}
		if ( preview ) {
			showPreview( mixed.patches, mixed.doc, 'mix' );
		} else {
			clearPreview( 'mix' );
		}
		return () => clearPreview( 'mix' );
	}, [ mixed, preview, showPreview, clearPreview, state.layers, state.doc ] );
	const cancel = () => {
		setPreview( false );
		clearPreview( 'mix' );
	};
	useEscape( cancel, preview );
	const choose = ( label, value, setter ) => (
		<label
			className="color-panel-stack"
			htmlFor={ `${ mixId }-${ label }` }
		>
			{ label }
			<select
				id={ `${ mixId }-${ label }` }
				aria-label={ label }
				value={ value || '' }
				onChange={ ( e ) => {
					setter( e.target.value );
					startPreview();
				} }
			>
				{ palettes.map( ( p ) => (
					<option key={ p.id } value={ p.id }>
						{ p.name }
					</option>
				) ) }
			</select>
		</label>
	);
	return (
		<div className="color-panel-extra">
			<p className="color-panel-note">
				{ __(
					'Blend two palettes across editable document colors. Photos stay unchanged; linked colors follow their sources.',
					'wunderpaint'
				) }
			</p>
			{ choose( __( 'From palette', 'wunderpaint' ), from?.id, setFrom ) }
			{ choose( __( 'To palette', 'wunderpaint' ), to?.id, setTo ) }
			<ToolSetting
				label={ __( 'Mix', 'wunderpaint' ) }
				suffix="%"
				value={ amount }
				onChange={ ( value ) => {
					setAmount( value );
					startPreview();
				} }
			/>
			<div
				className="color-panel-mix-strip"
				aria-label={ __( 'Mixed palette', 'wunderpaint' ) }
			>
				{ pairs.map( ( p ) => (
					<span
						key={ p.from }
						style={ { background: p.to } }
						title={ p.to }
					/>
				) ) }
			</div>
			<label
				className="color-panel-switch"
				htmlFor={ `${ mixId }-preview` }
			>
				<input
					id={ `${ mixId }-preview` }
					type="checkbox"
					checked={ preview }
					onChange={ ( e ) => {
						if ( e.target.checked ) {
							startPreview();
						} else {
							setPreview( false );
						}
					} }
				/>
				{ __( 'Preview on canvas', 'wunderpaint' ) }
			</label>
			<div className="color-panel-actions">
				<button
					type="button"
					className="ai-btn secondary sm"
					disabled={ ! mixed.changed }
					onClick={ () => {
						cancel();
						if ( mixed.patches.size ) {
							dispatch( {
								type: 'UPDATE_LAYERS',
								ids: [ ...mixed.patches.keys() ],
								patchFor: ( l ) => mixed.patches.get( l.id ),
							} );
						}
						if ( mixed.doc ) {
							dispatch( { type: 'SET_DOC', doc: mixed.doc } );
						}
						commit( __( 'Mix palettes', 'wunderpaint' ) );
						setAmount( 0 );
						setFrom( 'document' );
					} }
				>
					{ __( 'Apply', 'wunderpaint' ) }
				</button>
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ cancel }
				>
					{ __( 'Cancel', 'wunderpaint' ) }
				</button>
			</div>
			<p className="color-panel-note">
				{ __(
					'Dark colors pair with dark colors, light colors with light colors. Apply keeps the whole change in one undo step.',
					'wunderpaint'
				) }
			</p>
		</div>
	);
}

export function ResultColor( {
	editor,
	layer,
	target,
	point,
	requestPoint,
	showPreview,
	clearPreview,
} ) {
	const { state, dispatch, commit } = editor;
	const field = targetColorField( target, layer );
	const [ desired, setDesired ] = useState( '#808080' );
	const [ measurement, setMeasurement ] = useState( null );
	const [ result, setResult ] = useState( null );
	const [ increase, setIncrease ] = useState( false );
	const [ preview, setPreview ] = useState( true );
	const [ busy, setBusy ] = useState( false );
	const resultFieldId = useId();
	const previewBase = useRef( { layers: state.layers, doc: state.doc } );
	const editable =
		layer &&
		colorFields( layer ).includes( field ) &&
		isSolidCarrier( layer, field ) &&
		! colorLayerLocked( state.layers, layer ) &&
		( ! [ 'fill', 'color' ].includes( field ) ||
			! layer.fillType ||
			layer.fillType === 'solid' );
	useEffect( () => {
		let alive = true;
		if (
			previewBase.current.layers !== state.layers ||
			previewBase.current.doc !== state.doc
		) {
			setPreview( false );
			setIncrease( false );
		}
		previewBase.current = { layers: state.layers, doc: state.doc };
		setMeasurement( null );
		setResult( null );
		clearPreview( 'result' );
		if ( ! editable || ! point ) {
			setBusy( false );
			return undefined;
		}
		setBusy( true );
		measureColorResult( state.doc, state.layers, layer.id, field, point )
			.then( ( value ) => {
				if ( alive ) {
					setMeasurement( value );
				}
			} )
			.catch( () => {
				if ( alive ) {
					setResult( { error: 'read' } );
				}
			} )
			.finally( () => {
				if ( alive ) {
					setBusy( false );
				}
			} );
		return () => {
			alive = false;
		};
	}, [
		state.doc,
		state.layers,
		layer?.id,
		field,
		editable,
		point,
		clearPreview,
	] );
	useEffect( () => {
		let alive = true;
		setResult( null );
		clearPreview( 'result' );
		if ( ! measurement || ! colorKey( desired ) ) {
			setBusy( false );
			return undefined;
		}
		setBusy( true );
		const timer = window.setTimeout( () => {
			calculateColorResult( measurement, desired )
				.then( ( value ) => {
					if ( alive ) {
						setResult( value );
					}
				} )
				.catch( () => {
					if ( alive ) {
						setResult( { error: 'read' } );
					}
				} )
				.finally( () => {
					if ( alive ) {
						setBusy( false );
					}
				} );
		}, 100 );
		return () => {
			alive = false;
			window.clearTimeout( timer );
		};
	}, [ measurement, desired, clearPreview ] );
	const ready = result?.patch && ( ! result.needsOpacity || increase );
	useEffect( () => {
		if ( preview && ready ) {
			showPreview(
				new Map( [
					[
						layer.id,
						{
							...result.patch,
							colorLinks: {
								...layer.colorLinks,
								[ field ]: undefined,
							},
						},
					],
				] ),
				null,
				'result'
			);
		} else {
			clearPreview( 'result' );
		}
		return () => clearPreview( 'result' );
	}, [ preview, ready, result, layer, field, showPreview, clearPreview ] );
	const cancel = () => {
		setPreview( false );
		clearPreview( 'result' );
	};
	useEscape( cancel, !! ( preview && ready ) );
	const errors = {
		transparent: __(
			'Choose a point with an opaque background.',
			'wunderpaint'
		),
		covered: __(
			'Choose a visible point inside this color area.',
			'wunderpaint'
		),
		unreachable: __(
			'This result cannot be reached here, even at full opacity.',
			'wunderpaint'
		),
		nonlinear: __(
			'Effects or blending prevent an exact result at this point.',
			'wunderpaint'
		),
		read: __( 'Could not read the canvas color.', 'wunderpaint' ),
	};
	if ( ! editable ) {
		return (
			<p className="color-panel-note">
				{ __(
					'Select a solid text or shape color first.',
					'wunderpaint'
				) }
			</p>
		);
	}
	const c = parseColor(
		readColorField( { ...layer, ...result?.patch }, field ) || '#000'
	);
	return (
		<div className="color-panel-extra">
			<p className="color-panel-note">
				{ __(
					'Choose a point on the object, then the color you want to see there. The source color is calculated against the actual background.',
					'wunderpaint'
				) }
			</p>
			<button
				type="button"
				className="ai-btn secondary sm"
				onClick={ () => {
					cancel();
					requestPoint();
				} }
			>
				{ point
					? __( 'Change point', 'wunderpaint' )
					: __( 'Choose point', 'wunderpaint' ) }
			</button>
			{ point && (
				<span className="color-panel-coordinate">{ `X ${ point.x } · Y ${ point.y }` }</span>
			) }
			<label className="color-panel-stack" htmlFor={ resultFieldId }>
				{ __( 'Result color', 'wunderpaint' ) }
				<ColorField
					id={ resultFieldId }
					title={ __( 'Result color', 'wunderpaint' ) }
					color={ desired }
					onChange={ ( value ) => {
						setDesired( value );
						setIncrease( false );
						setPreview( true );
					} }
				/>
			</label>
			<div role="status" aria-live="polite">
				{ busy && (
					<p className="color-panel-note">
						{ __( 'Calculating', 'wunderpaint' ) }
					</p>
				) }
				{ ! busy && result?.error && (
					<p className="color-panel-note">
						{ errors[ result.error ] }
					</p>
				) }
				{ ! busy && result?.patch && (
					<>
						<div className="color-panel-result">
							<span className="color-panel-current">
								<span
									style={ {
										background: rgbToHex( c.r, c.g, c.b ),
									} }
								/>
							</span>
							<span>
								{ __( 'Source color', 'wunderpaint' ) }
								<br />
								<strong>{ rgbToHex( c.r, c.g, c.b ) }</strong>
							</span>
						</div>
						{ result.needsOpacity && (
							<>
								<p className="color-panel-note">
									{ result.opacityKind === 'layer'
										? sprintf(
												/* translators: %s: Required opacity percentage. */
												__(
													'Requires %s layer opacity and 100%% color opacity.',
													'wunderpaint'
												),
												`${ Math.ceil(
													result.alpha * 100
												) }%`
										  )
										: sprintf(
												/* translators: %s: Required opacity percentage. */
												__(
													'Requires %s color opacity.',
													'wunderpaint'
												),
												`${ Math.ceil(
													result.alpha * 100
												) }%`
										  ) }
								</p>
								<label
									className="color-panel-switch"
									htmlFor={ `${ resultFieldId }-increase` }
								>
									<input
										id={ `${ resultFieldId }-increase` }
										type="checkbox"
										checked={ increase }
										onChange={ ( e ) => {
											setIncrease( e.target.checked );
											setPreview( true );
										} }
									/>
									{ __( 'Increase opacity', 'wunderpaint' ) }
								</label>
							</>
						) }
					</>
				) }
			</div>
			<label
				className="color-panel-switch"
				htmlFor={ `${ resultFieldId }-preview` }
			>
				<input
					id={ `${ resultFieldId }-preview` }
					type="checkbox"
					checked={ preview }
					onChange={ ( e ) => setPreview( e.target.checked ) }
				/>
				{ __( 'Preview on canvas', 'wunderpaint' ) }
			</label>
			<div className="color-panel-actions">
				<button
					type="button"
					className="ai-btn secondary sm"
					disabled={ ! ready || busy }
					onClick={ () => {
						cancel();
						dispatch( {
							type: 'UPDATE_LAYER',
							id: layer.id,
							patch: result.patch,
						} );
						commit( __( 'Result color', 'wunderpaint' ) );
					} }
				>
					{ __( 'Apply', 'wunderpaint' ) }
				</button>
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ cancel }
				>
					{ __( 'Cancel', 'wunderpaint' ) }
				</button>
			</div>
		</div>
	);
}
