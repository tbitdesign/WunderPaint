import {
	useCallback,
	useId,
	useLayoutEffect,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { createPortal } from 'react-dom';
import { colorEditorPresentation } from '../../lib/color-panel-layout';
import {
	colorEditorSession,
	registerColorEditor,
} from '../../lib/color-editor-session';
import {
	GradientLibrary,
	GradientControls,
	GradientKinds,
} from './gradient-editor';
import {
	gradientLayerOf,
	gradientPaint,
	gradientKindPatch,
	gradientColorItems,
	gradientColorPatch,
} from '../../lib/gradient-layer';
import { setGradientEditing } from '../../lib/gradient-render-state';
import { isGradientField } from '../../lib/gradient-fields';
import { GRADIENT_FILL_KINDS } from '../../lib/gradient-fill-panel';
import {
	PatternLibrary,
	PatternControls,
	useColorPatterns,
} from './color-patterns';

import { __, sprintf } from '@wordpress/i18n';
import { PaintType } from '../../components/paint-controls';
import {
	isPaintLayer,
	strokeSettings,
	strokeSettingsPatch,
	hasEffectStroke,
	paintColorPatch,
	layerPaint,
	layerPaintPatch,
	paintSide,
} from '../../lib/layer-paint';
import { I } from '../../icons';
import {
	selectedPaintLayers,
	mixedValue,
	paintValue,
	updatePaintSelection,
} from '../../lib/selection-paint';
import { SWATCHES } from '../../store/constants';
import { ColorWheel } from '../../components/color-wheel';
import { HsvPicker } from '../../components/hsv-picker';
import { useEscape } from '../../components/use-escape';
import { useSelectionStyle } from '../../components/use-selection-style';
import { FloatPanel } from './float-panel';
import { ToolSetting } from './tool-setting';
import { ColorHarmony } from './color-harmony';
import { CanvasColorPicker } from './canvas-color-picker';
import { EyedropperOptions } from '../../components/eyedropper-options';
import {
	beginColorPick,
	bindColorPick,
	colorPickBlocked,
} from '../../lib/color-pick-session';
import { saveColorPalette } from '../../lib/save-color-palette';
import { ColorLinks, PaletteMix, ResultColor } from './color-panel-extras';
import { detachPatchedColorLinks } from '../../lib/color-links';
import {
	canPickScreenColor,
	pickScreenColor,
} from '../../lib/screen-color-picker';
import { ancestorLocked } from '../canvas/tool-handlers';
import { parseColor, rgbToHex, rgbToHsl } from '../../lib/color';
import { HARMONIES } from '../../lib/color-scheme';
import { scanColors } from '../../lib/color-replace';
import { siteColorValues } from '../../lib/site-colors';
import {
	loadImportedPalette,
	saveImportedPalette,
} from '../../lib/color-panel-workflows';
import {
	ColorBackgrounds,
	PalettePaste,
	ColorUsage,
	ColorUsageOverlay,
	SwatchGradient,
	ColorComparison,
} from './color-panel-workflows';
import { extractPalette } from '../../lib/palette';
import { renderToCanvas, sharedImageCache } from '../../lib/raster';
import { extractColorsOp } from '../../store/ops/asset-ops';
import { loadFloats, saveFloats, clampFloat } from '../../lib/panel-floats';
import {
	customSwatches,
	recentColors,
	pushRecentColor,
	toggleCustomSwatch,
	onUserSwatchesChange,
} from '../../lib/user-swatches';
import {
	getExtractedColors,
	onExtractedColorsChange,
} from '../../lib/extracted-colors';
import {
	loadColorPanelSettings,
	loadCollectedColors,
	saveCollectedColors,
	saveColorPanelSettings,
	normalizePanelColor,
	panelColorWithAlpha,
	changePanelChannel,
	colorPanelLayerPatch,
} from '../../lib/color-panel';
import '../../styles/editor/color-panel.css';

const GRAYS = Array.from( { length: 11 }, ( _, i ) => {
	const n = Math.round( i * 25.5 );
	return rgbToHex( n, n, n );
} );
const uniqueColors = ( colors ) => [
	...new Set(
		colors
			.filter( ( c ) => typeof c === 'string' )
			.map( normalizePanelColor )
	),
];

function ColorTiles( {
	colors,
	value,
	onChange,
	onPreview,
	onPreviewEnd,
	onRemove,
	label,
	disabled = false,
	className = '',
	selectedColors,
} ) {
	return (
		<div
			className={ `color-panel-tiles ${ className }` }
			role="group"
			aria-label={ label }
		>
			{ colors.map( ( color, index ) => (
				<div
					key={ `${ color }:${ index }` }
					className="color-panel-tile"
				>
					<button
						type="button"
						className="color-panel-swatch"
						disabled={ disabled }
						aria-label={ color }
						title={ color }
						aria-pressed={
							selectedColors
								? selectedColors.includes( color )
								: normalizePanelColor( color ) === value
						}
						onPointerEnter={ ( e ) => {
							if ( e.pointerType !== 'touch' ) {
								onPreview?.( color );
							}
						} }
						onPointerLeave={ onPreviewEnd }
						onFocus={ () => onPreview?.( color ) }
						onBlur={ onPreviewEnd }
						onClick={ () => {
							onPreviewEnd?.();
							onChange( color );
						} }
					>
						<span style={ { background: color } } />
					</button>
					{ onRemove && (
						<button
							type="button"
							className="color-tile-remove"
							aria-label={ sprintf(
								/* translators: %s: color hex value. */
								__( 'Remove %s', 'wunderpaint' ),
								color
							) }
							onClick={ () => onRemove( color ) }
						>
							{ I.close( { size: 10 } ) }
						</button>
					) }
				</div>
			) ) }
		</div>
	);
}

/** The same controls also edit helper colors without unmounting their workflow. */
function ColorValueControls( {
	color,
	settings,
	updateSettings,
	apply,
	finish,
	applyingText,
	previewTile,
	endTilePreview,
	onPick,
	pickDisabled = false,
	picking = false,
	compact = false,
	title = __( 'Color', 'wunderpaint' ),
} ) {
	const hexId = useId();
	const [ hexDraft, setHexDraft ] = useState( null );
	const rgba = parseColor( color );
	const rgb = rgbToHex( rgba.r, rgba.g, rgba.b );
	const hsl = rgbToHsl( rgba.r, rgba.g, rgba.b );
	const modeLabels = {
		wheel: __( 'Color wheel', 'wunderpaint' ),
		field: __( 'Color field', 'wunderpaint' ),
		rgb: 'RGB',
		hsl: 'HSL',
		gray: __( 'Grayscale', 'wunderpaint' ),
	};

	const applyRgb = ( value ) => {
		setHexDraft( null );
		apply( panelColorWithAlpha( value, rgba.a ) );
	};
	return (
		<section className="color-value-controls color-editor-section">
			<div className="color-value-heading">
				<strong>{ title }</strong>
				<select
					className="color-panel-view"
					aria-label={ __( 'Color view', 'wunderpaint' ) }
					value={ settings.mode }
					onChange={ ( e ) => {
						finish();
						updateSettings( {
							mode: e.target.value,
						} );
					} }
				>
					{ Object.entries( modeLabels ).map( ( [ id, label ] ) => (
						<option key={ id } value={ id }>
							{ label }
						</option>
					) ) }
				</select>
			</div>
			<div
				className={ `color-panel-visual${
					compact ? ' is-compact' : ''
				}` }
			>
				{ settings.mode === 'wheel' && (
					<ColorWheel
						color={ rgb }
						onChange={ applyRgb }
						onCommit={ finish }
						size={ 320 }
					/>
				) }
				{ settings.mode === 'field' && (
					<HsvPicker
						color={ rgb }
						onChange={ applyRgb }
						onCommit={ finish }
					/>
				) }
				{ [ 'rgb', 'hsl' ].includes( settings.mode ) && (
					<div className="color-panel-channels">
						{ ( settings.mode === 'rgb'
							? [ 'r', 'g', 'b' ]
							: [ 'h', 's', 'l' ]
						).map( ( key ) => (
							<ToolSetting
								key={ key }
								label={ key.toUpperCase() }
								value={
									settings.mode === 'rgb'
										? rgba[ key ]
										: Math.round(
												hsl[ key ] *
													( key === 'h' ? 1 : 100 )
										  )
								}
								max={
									settings.mode === 'rgb'
										? 255
										: key === 'h'
										? 360
										: 100
								}
								onChange={ ( v ) => {
									setHexDraft( null );
									apply(
										changePanelChannel(
											color,
											settings.mode,
											key,
											v
										)
									);
								} }
								onCommit={ finish }
							/>
						) ) }
					</div>
				) }
				{ settings.mode === 'gray' && (
					<div className="color-panel-gray">
						<div className="color-panel-gray-ramp" />
						<ToolSetting
							label={ __( 'Gray', 'wunderpaint' ) }
							suffix="%"
							value={ Math.round( hsl.l * 100 ) }
							onChange={ ( v ) => {
								setHexDraft( null );
								apply(
									changePanelChannel( color, 'gray', 'l', v )
								);
							} }
							onCommit={ finish }
						/>
						<ColorTiles
							onPreview={ ( c ) =>
								previewTile?.(
									panelColorWithAlpha( c, rgba.a )
								)
							}
							onPreviewEnd={ endTilePreview }
							colors={ GRAYS }
							label={ __( 'Grayscale', 'wunderpaint' ) }
							value={ color }
							onChange={ ( c ) => {
								applyRgb( c );
								finish();
							} }
						/>
					</div>
				) }
			</div>
			<div className="color-editor-hex-row">
				<span
					className="color-panel-current"
					title={ color }
					aria-hidden="true"
				>
					<span style={ { background: color } } />
				</span>
				<label className="color-panel-hex" htmlFor={ hexId }>
					<span>HEX</span>
					<input
						type="text"
						id={ hexId }
						data-color-hex="true"
						value={ hexDraft ?? color }
						spellCheck={ false }
						aria-label={ __( 'Hex color', 'wunderpaint' ) }
						onChange={ ( e ) => {
							const text = e.target.value;
							setHexDraft( text );
							const hex = text.startsWith( '#' )
								? text
								: '#' + text;
							if (
								/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(
									hex
								)
							) {
								apply( hex );
							}
						} }
						onBlur={ () => {
							if ( applyingText?.current ) {
								return;
							}
							finish();
							setHexDraft( null );
						} }
						onKeyDown={ ( e ) => {
							if ( e.key === 'Enter' ) {
								finish();
								setHexDraft( null );
							}
						} }
					/>
				</label>
				{ onPick && (
					<button
						type="button"
						className="dsm-mini"
						aria-label={ __( 'Pick', 'wunderpaint' ) }
						title={ __( 'Pick', 'wunderpaint' ) }
						disabled={ pickDisabled }
						aria-pressed={ picking === 'canvas' }
						onClick={ onPick }
					>
						{ I.eyedropper( { size: 15 } ) }
					</button>
				) }
			</div>
			<ToolSetting
				label={ __( 'Opacity', 'wunderpaint' ) }
				alphaColor={ rgb }
				suffix="%"
				value={ Math.round( rgba.a * 100 ) }
				onChange={ ( v ) => {
					setHexDraft( null );
					apply( panelColorWithAlpha( rgb, v / 100 ) );
				} }
				onCommit={ finish }
			/>
		</section>
	);
}

/** The controller stays mounted at the canvas; only its view changes hosts. */
function ColorPanelFrame( { dock, children, ...props } ) {
	if ( dock ) {
		return createPortal(
			<div
				className="color-panel-docked"
				onPointerDown={ ( e ) => e.stopPropagation() }
				onContextMenu={ ( e ) => e.stopPropagation() }
			>
				{ children }
			</div>,
			dock
		);
	}
	return <FloatPanel { ...props }>{ children }</FloatPanel>;
}

export function ColorPanel( {
	editor,
	extras,
	pointOf,
	onNewGradient,
	easyMode = false,
	pinned = false,
	onPin,
	onFront,
	zIndex = 90,
	onClose,
} ) {
	const { state, dispatch, commit } = editor;
	const controlId = useId();
	const session = useMemo(
		() => colorEditorSession( dispatch ),
		[ dispatch ]
	);
	const [ , refreshBinding ] = useState( 0 );
	const request = session.request;
	const auxiliary = request?.nested ? request.binding.current : null;
	const mainRequest = request?.nested ? request.parent : request;
	const binding = mainRequest?.binding.current;
	const external = !! binding && ! binding.documentTarget;
	const [ anchored, setAnchored ] = useState( false );
	const [ ownerDialog, setOwnerDialog ] = useState( null );
	const [ dialogBlocked, setDialogBlocked ] = useState( false );
	const compact = state.colorPanelMode === 'picker';
	const docked = ! easyMode && ! ownerDialog && ! compact;
	const dock = docked ? session.dock : null;
	const [ textScope, setTextScope ] = useState( 'selection' );
	useLayoutEffect(
		() => session.subscribe( () => refreshBinding( ( n ) => n + 1 ) ),
		[ session ]
	);
	useLayoutEffect(
		() =>
			registerColorEditor(
				dispatch,
				document.querySelector( '#wpie-root' )
			),
		[ dispatch ]
	);

	const previousTool = useRef( state.tool );
	const sessionActions = useRef( null );
	const [ settings, setSettings ] = useState( loadColorPanelSettings );
	const panelWidth = compact ? 250 : settings.width;
	const [ pos, setPos ] = useState( () =>
		clampFloat(
			loadFloats().color || {
				x: Math.max(
					96,
					window.innerWidth -
						( parseFloat(
							document
								.querySelector( '.editor-root' )
								?.style.getPropertyValue( '--wpie-right-w' )
						) || 312 ) -
						panelWidth -
						16
				),
				y: 108,
			}
		)
	);
	useLayoutEffect( () => {
		const keepOnScreen = () =>
			setPos( ( current ) => {
				const x = Math.max(
					8,
					Math.min( current.x, window.innerWidth - panelWidth - 12 )
				);
				const height = Math.min(
					compact ? 470 : settings.height,
					window.innerHeight - 32
				);
				const y = Math.max(
					8,
					Math.min( current.y, window.innerHeight - height - 12 )
				);
				return x === current.x && y === current.y ? current : { x, y };
			} );
		keepOnScreen();
		window.addEventListener( 'resize', keepOnScreen );
		return () => window.removeEventListener( 'resize', keepOnScreen );
	}, [ panelWidth, settings.height, compact ] );
	const target = state.colorTarget || 'auto';
	const setTarget = ( value ) =>
		dispatch( { type: 'SET_COLOR_TARGET', target: value } );
	useEffect( () => {
		setSettings( ( s ) => ( { ...s, tab: 'color' } ) );
	}, [ state.colorPanelReveal, state.paintTarget ] );
	const [ compare, setCompare ] = useState( null );
	const [ swatchAction, setSwatchAction ] = useState( 'apply' );
	const [ gradientColors, setGradientColors ] = useState( [] );
	const [ imported, setImported ] = useState( loadImportedPalette );
	useEffect( () => saveImportedPalette( imported ), [ imported ] );
	const [ workflowEpoch, setWorkflowEpoch ] = useState( 0 );
	const [ usageColor, setUsageColor ] = useState( null );
	const [ usageHit, setUsageHit ] = useState( null );
	const endUsage = useCallback( () => setUsageHit( null ), [] );
	const [ collected, setCollected ] = useState( loadCollectedColors );
	useEffect( () => saveCollectedColors( collected ), [ collected ] );
	const [ recents, setRecents ] = useState( recentColors );
	const [ favorites, setFavorites ] = useState( customSwatches );
	const [ extracted, setExtracted ] = useState( getExtractedColors );
	const [ imageColors, setImageColors ] = useState( [] );
	const [ , refreshPalettes ] = useState( 0 );
	const [ picking, setPicking ] = useState( false );
	const [ screenAnswer, setScreenAnswer ] = useState( null );
	const [ busy, setBusy ] = useState( false );
	const collecting = picking === 'collect';
	const probeOptions = state.toolOpts.eyedropper || {};
	const exclusivePick = !! picking && picking !== 'canvas';
	const [ hovering, setHovering ] = useState( false );
	const [ collapsed, setCollapsed ] = useState( false );
	const [ resultPoint, setResultPoint ] = useState( null );
	const pending = useRef( null );
	const applyingText = useRef( false );
	const root = useRef( null );
	const pickSequence = useRef( 0 );
	const screenPicker = useRef( null );
	const selectionStyle = useSelectionStyle( extras );
	const live = useRef( { state, extras } );
	live.current = { state, extras };
	const clearPreview = useCallback(
		( owner ) => {
			if ( ! owner ) {
				setWorkflowEpoch( ( current ) => current + 1 );
				setCompare( null );
				setUsageHit( null );
			}
			if ( ! owner || owner === 'hover' || owner === 'compare' ) {
				setHovering( false );
				live.current.extras?.richText?.current?.clearColorPreview?.();
			}
			dispatch( { type: 'CLEAR_COLOR_PREVIEW', owner } );
		},
		[ dispatch ]
	);
	const showPreview = useCallback(
		( patches, doc, owner ) => {
			const base = live.current.state;
			dispatch( {
				type: 'SET_COLOR_PREVIEW',
				patches,
				doc,
				owner,
				baseLayers: base.layers,
				baseDoc: base.doc,
			} );
		},
		[ dispatch ]
	);
	useEffect( () => () => clearPreview(), [ clearPreview ] );

	useEffect( () => {
		clearPreview( 'hover' );
		setUsageHit( null );
		screenPicker.current?.abort();
		pickSequence.current++;
		setPicking( false );
	}, [ state.doc, state.activeId, state.tool, clearPreview ] );
	useEffect( () => {
		// Normal canvas sampling stays armed through panel color edits and Undo.
		// Its renderer invalidates pending samples whenever the layers change.
		screenPicker.current?.abort();
		pickSequence.current++;
		setPicking( ( current ) => ( current === 'canvas' ? current : false ) );
	}, [ state.layers ] );
	const layer = external
		? binding.layer
		: state.layers.find( ( l ) => l.id === state.activeId );
	const locked =
		layer && ( layer.locked || ancestorLocked( state.layers, layer ) );
	const layerTargets =
		layer?.type === 'shape'
			? [ 'fill', 'stroke' ]
			: layer?.type === 'text'
			? [ 'text', 'outline' ]
			: layer?.type === 'gradient'
			? [ 'gradient' ]
			: layer?.type === 'repeat' &&
			  layer.progression?.color?.mode === 'gradient'
			? [ 'repeat' ]
			: [];
	const selectedTarget = [
		'auto',
		'fg',
		'bg',
		'gradientTool',
		...layerTargets,
	].includes( target )
		? target
		: 'auto';
	const mixing = settings.tab === 'extras' && settings.extra === 'mix';
	const automaticTarget =
		layer?.type === 'shape'
			? layer.shape === 'line' || state.paintTarget === 'stroke'
				? 'stroke'
				: 'fill'
			: layer?.type === 'text'
			? state.paintTarget === 'stroke'
				? 'outline'
				: 'text'
			: layerTargets.includes( 'gradient' )
			? 'gradient'
			: layerTargets.includes( 'repeat' )
			? 'repeat'
			: 'fg';
	const effectiveTarget = external
		? binding.layer
			? binding.side === 'additionalStroke'
				? 'additionalStroke'
				: binding.side === 'stroke'
				? layer.type === 'text'
					? 'outline'
					: 'stroke'
				: layer.type === 'text'
				? 'text'
				: 'fill'
			: binding.ramp
			? 'boundRamp'
			: 'boundColor'
		: selectedTarget === 'gradientTool'
		? gradientLayerOf( state )
			? 'gradient'
			: 'gradientTool'
		: selectedTarget === 'auto'
		? automaticTarget
		: selectedTarget;
	const carrier =
		isPaintLayer( layer ) &&
		[ 'fill', 'stroke', 'text', 'outline', 'additionalStroke' ].includes(
			effectiveTarget
		);
	const side =
		effectiveTarget === 'additionalStroke'
			? 'additionalStroke'
			: paintSide( effectiveTarget );
	const textSession =
		! external &&
		effectiveTarget === 'text' &&
		extras?.richText?.current?.layerId === layer?.id;
	const selectedText =
		textSession &&
		textScope === 'selection' &&
		! [ 'gradient', 'pattern' ].includes( layer.fillType );
	const paintTargets = useMemo(
		() =>
			! external &&
			carrier &&
			! selectedText &&
			side !== 'additionalStroke'
				? selectedPaintLayers(
						{
							layers: state.layers,
							activeId: state.activeId,
							selectedIds: state.selectedIds,
						},
						layer
				  )
				: layer
				? [ layer ]
				: [],
		[
			state.layers,
			state.activeId,
			state.selectedIds,
			layer,
			external,
			carrier,
			selectedText,
			side,
		]
	);
	const mixedPaint =
		carrier &&
		! selectedText &&
		mixedValue( paintTargets, ( item ) => paintValue( item, side ) );
	const gradientTool = effectiveTarget === 'gradientTool';
	const gradientLayer = effectiveTarget === 'gradient' ? layer : null;
	const paint = carrier
		? layerPaint( layer, side )
		: gradientTool || gradientLayer
		? {
				...gradientPaint( gradientLayer || state.toolOpts.gradient ),
				type: 'gradient',
		  }
		: binding?.ramp
		? {
				...gradientPaint( binding.paint ),
				...binding.paint,
				type: 'gradient',
		  }
		: null;
	const editingStop =
		paint?.type === 'gradient' ||
		[ 'gradient', 'repeat' ].includes( effectiveTarget );
	const gradientValue =
		paint?.type === 'gradient'
			? paint
			: effectiveTarget === 'repeat'
			? {
					...gradientPaint( layer.progression.color ),
					...layer.progression.color,
			  }
			: null;
	const gradientScope = carrier
		? 'fill'
		: gradientLayer || gradientTool
		? 'layer'
		: 'ramp';
	const gradientField =
		gradientValue && isGradientField( gradientValue.kind );
	const paintStops = gradientValue
		? gradientColorItems( gradientValue )
		: null;
	const stopIndex = Math.max(
		0,
		Math.min( state.gradientStop || 0, ( paintStops?.length || 1 ) - 1 )
	);
	const disabled = external
		? binding.disabled
		: ! [ 'fg', 'bg', 'gradientTool' ].includes( effectiveTarget ) &&
		  locked;
	const names = {
		fg: __( 'Foreground', 'wunderpaint' ),
		bg: __( 'Background', 'wunderpaint' ),
		fill: __( 'Fill', 'wunderpaint' ),
		stroke: __( 'Stroke', 'wunderpaint' ),
		text: __( 'Fill', 'wunderpaint' ),
		outline: __( 'Stroke', 'wunderpaint' ),
		additionalStroke: __( 'Additional outline', 'wunderpaint' ),
		gradient: __( 'Gradient stop', 'wunderpaint' ),
		repeat: __( 'Repeat colors', 'wunderpaint' ),
	};
	const values = {
		fg: state.fgColor,
		bg: state.bgColor,
		fill: layer?.fill,
		stroke: layer?.stroke,
		text:
			layer &&
			extras?.richText?.current &&
			extras.richText.current.layerId === layer.id
				? extras.richText.current.peekStyle?.()?.color ||
				  selectionStyle?.color ||
				  layer?.color
				: layer?.color,
		outline: layer?.outlineColor,
	};
	const originalColor = normalizePanelColor(
		( editingStop
			? paintStops?.[ stopIndex ]?.color
			: external && ! carrier
			? binding.color
			: carrier && ! ( effectiveTarget === 'text' && selectedText )
			? paint.color
			: values[ effectiveTarget ] ) || '#000000'
	);
	const comparison =
		compare &&
		compare.layers === state.layers &&
		compare.doc === state.doc &&
		compare.activeId === state.activeId &&
		compare.target === effectiveTarget &&
		compare.tool === state.tool &&
		compare.original === originalColor
			? compare
			: null;
	const color = comparison
		? comparison.colors[ comparison.index ]
		: originalColor;
	const colorPatches = useCallback(
		( value ) => {
			const patches = new Map();
			for ( const item of paintTargets ) {
				const patch = colorPanelLayerPatch(
					item,
					effectiveTarget,
					value,
					stopIndex
				);
				if ( ! patch ) {
					continue;
				}
				if ( effectiveTarget === 'text' && ! editingStop ) {
					if ( item.spans?.length ) {
						patch.spans = item.spans.map( ( span ) => ( {
							...span,
							...( span.s
								? { s: { ...span.s, color: value } }
								: {} ),
						} ) );
					}
					if ( item.lineStyles ) {
						patch.lineStyles = item.lineStyles.map( ( style ) =>
							style ? { ...style, color: value } : style
						);
					}
				}
				patches.set( item.id, detachPatchedColorLinks( item, patch ) );
			}
			return patches;
		},
		[ paintTargets, effectiveTarget, stopIndex, editingStop ]
	);
	useEffect( () => {
		if ( compare && ! comparison ) {
			setCompare( null );
			clearPreview( 'compare' );
		}
	}, [ compare, comparison, clearPreview ] );
	useEffect( () => {
		if ( external || ! comparison || disabled || comparison.index === 0 ) {
			return undefined;
		}
		const rt = extras?.richText?.current;
		if (
			effectiveTarget === 'text' &&
			selectedText &&
			! editingStop &&
			rt?.layerId === layer?.id
		) {
			rt.previewColor?.( color );
		} else {
			const patches = colorPatches( color );
			if ( patches.size ) {
				showPreview( patches, null, 'compare' );
			}
		}
		return () => clearPreview( 'compare' );
	}, [
		comparison,
		colorPatches,
		external,
		selectedText,
		stopIndex,
		editingStop,
		color,
		disabled,
		effectiveTarget,
		layer,
		extras,
		showPreview,
		clearPreview,
	] );
	useEscape( () => clearPreview(), !! comparison );
	useEffect( () => {
		if ( ! comparison ) {
			return undefined;
		}
		const stop = ( event ) => {
			if (
				event.target.closest?.( '.ed-canvas-area' ) &&
				! event.target.closest( '.ed-float-panel' )
			) {
				clearPreview();
			}
		};
		document.addEventListener( 'pointerdown', stop, true );
		return () => document.removeEventListener( 'pointerdown', stop, true );
	}, [ comparison, clearPreview ] );

	const savedFavorite = favorites.find(
		( value ) => normalizePanelColor( value ) === color
	);
	const rgba = parseColor( color );
	const rgb = rgbToHex( rgba.r, rgba.g, rgba.b );
	const harmony = HARMONIES.includes( settings.harmony )
		? settings.harmony
		: 'shades';
	const savedPalettes = window.WPIE?.palettes || [];
	const brandKits = window.WPIE?.brandKits || editor.WPIE?.brandKits || [];
	const colorScan = useMemo(
		() =>
			settings.tab === 'extras' || settings.tab === 'swatches'
				? scanColors( state.layers, state.doc ).colors
				: [],
		[ settings.tab, state.layers, state.doc ]
	);
	const exactColors = colorScan.map( ( c ) => c.key );
	const documentColors = uniqueColors( [ ...exactColors, ...imageColors ] );
	const siteColors = useMemo( () => siteColorValues(), [] );
	const collections = [
		{
			id: 'standard',
			name: __( 'Standard', 'wunderpaint' ),
			colors: SWATCHES,
		},
		{ id: 'gray', name: __( 'Grayscale', 'wunderpaint' ), colors: GRAYS },
		{
			id: 'imported',
			name: __( 'Imported colors', 'wunderpaint' ),
			colors: imported,
		},
		{
			id: 'collected',
			name: __( 'Collected colors', 'wunderpaint' ),
			colors: collected,
		},
		{
			id: 'document',
			name: __( 'Document colors', 'wunderpaint' ),
			colors: documentColors,
		},
		// Theme palette, Styles and Elementor Global Colors (v1.432.0).
		...( siteColors.length
			? [
					{
						id: 'site',
						name: __( 'Website colors', 'wunderpaint' ),
						colors: siteColors,
					},
			  ]
			: [] ),
		{
			id: 'favorites',
			name: __( 'Favorites', 'wunderpaint' ),
			colors: favorites,
		},
		{
			id: 'recent',
			name: __( 'Recent colors', 'wunderpaint' ),
			colors: recents,
		},
		{
			id: 'extracted',
			name: __( 'From image', 'wunderpaint' ),
			colors: extracted,
		},
		...savedPalettes.map( ( p ) => ( {
			id: `palette:${ p.id }`,
			name: p.name,
			colors: p.colors || [],
			group: 'palettes',
		} ) ),
		...brandKits.map( ( p ) => ( {
			id: `brand:${ p.id }`,
			name: p.name,
			colors: p.colors || [],
			group: 'brand',
		} ) ),
	];
	const collection =
		collections.find( ( p ) => p.id === settings.collection ) ||
		collections[ 0 ];
	useEffect( () => {
		setUsageColor( null );
		setUsageHit( null );
	}, [ collection.id, swatchAction ] );
	const canExtract = [ 'image', 'raster', 'smart' ].includes( layer?.type );
	// What the Color Schemer starts from when opened here: the gradient row
	// or the palette shown under Swatches, else the harmony settings.
	const schemerSeed = () => {
		const seed = {
			base: settings.harmonyBase || rgb,
			harmony,
			spread: settings.harmonySpread,
			saturation: settings.harmonySaturation,
			lightness: settings.harmonyLightness,
		};
		if ( settings.tab !== 'swatches' ) {
			return seed;
		}
		if ( swatchAction === 'gradient' && gradientColors.length > 1 ) {
			return { ...seed, colors: gradientColors };
		}
		if (
			[ 'standard', 'gray' ].includes( collection.id ) ||
			! collection.colors.length
		) {
			return seed;
		}
		return {
			...seed,
			colors: collection.colors,
			name: collection.group ? collection.name : '',
			paletteId:
				collection.group === 'palettes'
					? collection.id.slice( 'palette:'.length )
					: '',
		};
	};

	const updateSettings = useCallback(
		( patch ) =>
			setSettings( ( current ) => {
				const next = { ...current, ...patch };
				if (
					Object.keys( patch ).every(
						( key ) => current[ key ] === patch[ key ]
					)
				) {
					return current;
				}
				saveColorPanelSettings( next );
				return next;
			} ),
		[]
	);

	// The Color Schemer's "As gradient" (v1.432.0): its palette becomes the
	// gradient row under Swatches, ready for Preview, Apply or Save. Runs
	// after the reveal effect above, which would reset the tab to Color.
	const [ pendingGradient, setPendingGradient ] = useState( null );
	const [ gradientRequest, setGradientRequest ] = useState( {
		id: 0,
		kind: 'linear',
	} );
	useEffect( () => {
		const take = ( event ) => {
			const colors = ( event.detail?.colors || [] ).slice( 0, 8 );
			if ( colors.length < 2 ) {
				return;
			}
			setPendingGradient( { colors, kind: event.detail?.kind } );
			dispatch( { type: 'TOGGLE_COLOR_PANEL', show: true } );
		};
		window.addEventListener( 'wpie:color-panel-gradient', take );
		return () =>
			window.removeEventListener( 'wpie:color-panel-gradient', take );
	}, [ dispatch ] );
	useEffect( () => {
		if ( ! pendingGradient ) {
			return;
		}
		updateSettings( { tab: 'swatches' } );
		setSwatchAction( 'gradient' );
		setGradientColors( pendingGradient.colors );
		// A preview may specify its kind. Start that draft afresh so an older
		// radial/angle choice cannot change the selected preview on handoff.
		if ( GRADIENT_FILL_KINDS.includes( pendingGradient.kind ) ) {
			setGradientRequest( ( current ) => ( {
				id: current.id + 1,
				kind: pendingGradient.kind,
			} ) );
		}
		setPendingGradient( null );
	}, [ pendingGradient, state.colorPanelReveal, updateSettings ] );
	const resize = useCallback(
		( size ) =>
			updateSettings( {
				...size,
				width: Math.max( 320, size.width ),
			} ),
		[ updateSettings ]
	);
	const move = ( next ) => {
		const value = clampFloat( next );
		setPos( value );
		saveFloats( { ...loadFloats(), color: value } );
	};
	useEffect(
		() =>
			onUserSwatchesChange( () => {
				setRecents( recentColors() );
				setFavorites( customSwatches() );
			} ),
		[]
	);
	useEffect(
		() =>
			onExtractedColorsChange( () =>
				setExtracted( getExtractedColors() )
			),
		[]
	);
	useEffect( () => {
		const refresh = () => refreshPalettes( ( n ) => n + 1 );
		window.addEventListener( 'wpie:palettes-updated', refresh );
		window.addEventListener( 'wpie:brand-kits-updated', refresh );
		return () => {
			window.removeEventListener( 'wpie:palettes-updated', refresh );
			window.removeEventListener( 'wpie:brand-kits-updated', refresh );
		};
	}, [] );
	useEffect( () => {
		setResultPoint( null );
		clearPreview();
	}, [ state.activeId, effectiveTarget, clearPreview ] );
	useEffect( () => {
		if ( settings.tab !== 'swatches' || collection.id !== 'document' ) {
			return undefined;
		}
		let alive = true;
		const timer = window.setTimeout( async () => {
			try {
				const canvas = await renderToCanvas( state.doc, state.layers, {
					scale: Math.min(
						1,
						128 / Math.max( state.doc.w, state.doc.h )
					),
					cache: sharedImageCache,
				} );
				if ( alive ) {
					setImageColors( extractPalette( canvas, 12 ) );
				}
			} catch ( error ) {
				if ( alive ) {
					setImageColors( [] );
				}
			}
		}, 180 );
		return () => {
			alive = false;
			window.clearTimeout( timer );
		};
	}, [ settings.tab, collection.id, state.doc, state.layers ] );
	const finish = () => {
		if ( applyingText.current ) {
			return;
		}
		const change = pending.current;
		pending.current = null;
		if ( ! change ) {
			return;
		}
		if ( change.gradient ) {
			setGradientEditing( change.gradient, false );
			dispatch( {
				type: 'UPDATE_LAYER',
				id: change.gradient,
				patch: {},
			} );
		}
		pushRecentColor( change.color );
		change.complete?.();
		if ( change.layer ) {
			commit( __( 'Color', 'wunderpaint' ) );
		}
	};
	const apply = ( next, direct = false ) => {
		if ( comparison && ! direct ) {
			const index = comparison.index || 1;
			const nextColor = normalizePanelColor( next );
			setCompare( {
				...comparison,
				index,
				colors: comparison.colors.map( ( c, i ) =>
					i === index ? nextColor : c
				),
			} );
			return;
		}
		clearPreview();
		if ( disabled ) {
			return;
		}
		const value = normalizePanelColor( next );
		const rt = extras?.richText?.current;
		if ( external ) {
			if ( carrier ) {
				binding.onChange(
					paintColorPatch( layer, side, value, stopIndex )
				);
			} else if ( binding.ramp ) {
				binding.onChange( {
					stops: paintStops.map( ( s, i ) =>
						i === stopIndex ? { ...s, color: value } : s
					),
				} );
			} else {
				binding.onChange( value );
			}
			pending.current = { color: value, complete: binding.onCommit };
		} else if ( gradientTool ) {
			dispatch( {
				type: 'SET_TOOL_OPTS',
				tool: 'gradient',
				patch: {
					...gradientPaint( state.toolOpts.gradient ),
					...gradientColorPatch( paint, value, stopIndex ),
					reverse: false,
				},
			} );
			pending.current = { color: value };
		} else if ( effectiveTarget === 'fg' || effectiveTarget === 'bg' ) {
			dispatch( {
				type: effectiveTarget === 'fg' ? 'SET_FG' : 'SET_BG',
				color: value,
			} );
			pending.current = { color: value, layer: false };
		} else if (
			effectiveTarget === 'text' &&
			selectedText &&
			! editingStop &&
			rt?.layerId === layer?.id
		) {
			// Rich-text styling restores the marked characters by focusing the
			// canvas. Return focus to a number/HEX input before the next key,
			// without treating that temporary blur as a completed input edit.
			const focused = root.current?.ownerDocument.activeElement;
			const input = focused?.matches( '.global-color-panel input' )
				? focused
				: null;
			const start = input?.selectionStart;
			const end = input?.selectionEnd;
			applyingText.current = true;
			try {
				rt.applyStyle( { color: value } );
				pending.current = {
					color: value,
					layer: false,
					richText: true,
				};
				if ( input ) {
					input.focus( { preventScroll: true } );
					if ( start !== null && end !== null ) {
						input.setSelectionRange( start, end );
					}
				}
			} finally {
				applyingText.current = false;
			}
		} else {
			const patches = colorPatches( value );
			if ( ! patches.size ) {
				return;
			}
			dispatch( {
				type: 'UPDATE_LAYERS',
				ids: [ ...patches.keys() ],
				patchFor: ( item ) => patches.get( item.id ),
			} );
			pending.current = {
				color: value,
				layer: true,
				gradient: gradientLayer?.id,
			};
		}
	};
	const previewTile = ( next ) => {
		if (
			external ||
			disabled ||
			exclusivePick ||
			collapsed ||
			comparison
		) {
			return;
		}
		const value = normalizePanelColor( next );
		const rt = extras?.richText?.current;
		if (
			effectiveTarget === 'text' &&
			selectedText &&
			! editingStop &&
			rt?.layerId === layer?.id
		) {
			rt.previewColor?.( value );
			setHovering( true );
			return;
		}
		const patches = colorPatches( value );
		if ( patches.size ) {
			showPreview( patches, null, 'hover' );
		}
	};
	const endTilePreview = () => clearPreview( 'hover' );
	useEscape(
		() => clearPreview( 'hover' ),
		hovering || state.colorPreview?.owner === 'hover'
	);
	const pickTile = ( next ) => {
		apply( next );
		finish();
	};
	const applyRgb = ( next ) => {
		apply( panelColorWithAlpha( next, rgba.a ) );
	};
	const cancelPick = () => {
		screenPicker.current?.abort();
		screenPicker.current = null;
		setScreenAnswer( null );
		pickSequence.current++;
		setPicking( false );
	};
	useEscape( cancelPick, picking );
	useEffect(
		() => () => {
			screenPicker.current?.abort();
			pickSequence.current++;
		},
		[]
	);
	const startPick = async ( {
		collect = false,
		line = false,
		screen = false,
	} = {} ) => {
		if ( colorPickBlocked() && ! ( screen && ownerDialog ) ) {
			return;
		}
		finish();
		clearPreview();
		if ( picking ) {
			cancelPick();
			return;
		}
		if ( disabled && ! collect && ! line ) {
			extras.toasts?.error?.( __( 'Layer is locked', 'wunderpaint' ) );
			return;
		}
		if ( collect || line || ! screen || ! canPickScreenColor() ) {
			setPicking( line ? 'line' : collect ? 'collect' : 'canvas' );
			return;
		}
		const baseState = state;
		const controller = new AbortController();
		screenPicker.current = controller;
		const token = ++pickSequence.current;
		setPicking( 'screen' );
		try {
			const picked = await pickScreenColor( {
				signal: controller.signal,
			} );
			if (
				token === pickSequence.current &&
				! controller.signal.aborted
			) {
				// Deliver through React state so pending editor updates are applied
				// before validating and accepting the browser's answer.
				setScreenAnswer( { picked, baseState, controller, token } );
			}
		} catch ( error ) {
			if (
				token === pickSequence.current &&
				! controller.signal.aborted
			) {
				extras.toasts.error(
					__( 'Could not pick a color.', 'wunderpaint' )
				);
			}
			if ( token === pickSequence.current ) {
				cancelPick();
			}
		}
	};
	useEffect( () => {
		if ( ! screenAnswer ) {
			return;
		}
		setScreenAnswer( null );
		const { picked, baseState, controller, token } = screenAnswer;
		if (
			token !== pickSequence.current ||
			controller.signal.aborted ||
			state.doc !== baseState.doc ||
			state.layers !== baseState.layers ||
			state.activeId !== baseState.activeId ||
			state.tool !== baseState.tool
		) {
			return;
		}
		if ( picked ) {
			sessionActions.current.pickColor(
				panelColorWithAlpha( picked, rgba.a )
			);
		}
		screenPicker.current = null;
		setPicking( false );
	}, [
		screenAnswer,
		state.doc,
		state.layers,
		state.activeId,
		state.tool,
		rgba.a,
	] );

	const leaveAuxiliary = () => {
		auxiliary?.onCommit?.();
		session.resume();
	};
	const close = () => {
		auxiliary?.onCommit?.();
		finish();
		session.clear();
		setOwnerDialog( null );
		setAnchored( false );
		cancelPick();
		clearPreview();
		if ( ( compact || ownerDialog ) && session.dock ) {
			dispatch( {
				type: 'TOGGLE_COLOR_PANEL',
				show: true,
				fromSwatch: true,
			} );
		} else if ( onClose ) {
			onClose();
		} else {
			dispatch( { type: 'TOGGLE_COLOR_PANEL', show: false } );
		}
	};
	sessionActions.current = {
		close,
		pickColor: pickTile,
		suspend: () => {
			auxiliary?.onCommit?.();
			finish();
			cancelPick();
			clearPreview();
		},
	};
	useEffect( () => {
		const changed = previousTool.current !== state.tool;
		previousTool.current = state.tool;
		if ( changed && state.tool === 'gradient' ) {
			sessionActions.current.suspend();
			session.clear();
			setOwnerDialog( null );
			setAnchored( false );
		} else if (
			changed &&
			state.tool !== 'eyedropper' &&
			! pinned &&
			! docked
		) {
			sessionActions.current.close();
		}
	}, [ state.tool, pinned, session, docked ] );
	useEffect( () => {
		const host = document.querySelector( '#wpie-root' );
		if ( ! host ) {
			return undefined;
		}
		let blocked = false;
		const check = () => {
			if ( ownerDialog && ! ownerDialog.isConnected ) {
				sessionActions.current.close();
				return;
			}
			const next = [
				...host.querySelectorAll(
					'.modal-backdrop, [role="dialog"][aria-modal="true"]:not(.ed-float-panel)'
				),
			].some(
				( dialog ) =>
					! ownerDialog ||
					! (
						dialog.contains( ownerDialog ) ||
						ownerDialog.contains( dialog )
					)
			);
			setDialogBlocked( next );
			if ( next && ! blocked && ! ownerDialog ) {
				sessionActions.current.suspend();
			}
			blocked = next;
		};
		check();
		const observer = new MutationObserver( check );
		observer.observe( host, { childList: true, subtree: true } );
		return () => observer.disconnect();
	}, [ ownerDialog ] );
	// Mount and arm in the original gesture, including the explicit screen action.
	useLayoutEffect( () =>
		bindColorPick( dispatch, {
			prepare( options ) {
				if ( ! options.keepTarget ) {
					session.clear();
					setOwnerDialog( null );
					setAnchored( false );
				}
				finish();
				cancelPick();
				clearPreview();
				if ( options.background ) {
					setTarget( 'bg' );
				}
				if ( options.collect || options.line ) {
					updateSettings( {
						tab: 'swatches',
						...( options.collect
							? { collection: 'collected' }
							: {} ),
					} );
					if ( options.line ) {
						setSwatchAction( 'gradient' );
					}
				} else if ( settings.tab === 'extras' ) {
					updateSettings( { tab: 'color' } );
				}
			},
			start: startPick,
		} )
	);

	useLayoutEffect( () => {
		session.beforeChange = () => sessionActions.current.suspend();
		session.onOpen = ( next, anchor, nested ) => {
			if ( nested ) {
				return;
			}
			const owner = anchor.closest(
				'.modal-backdrop, [role="dialog"][aria-modal="true"]:not(.ed-float-panel)'
			);
			const mode = colorEditorPresentation( next, {
				modal: !! owner,
				fullVisible:
					state.showColorPanel && state.colorPanelMode === 'panel',
			} );
			if ( mode === 'picker' || owner ) {
				const rect = anchor.getBoundingClientRect();
				const width = mode === 'picker' ? 250 : settings.width;
				const canvas = document
					.querySelector( '#wpie-root .ed-canvas-area' )
					?.getBoundingClientRect();
				const left = owner
					? rect.left
					: ( canvas?.right || window.innerWidth ) - width - 12;
				const top = owner
					? rect.bottom + 8
					: ( canvas?.top || 96 ) + 36;
				const height = Math.min(
					mode === 'picker' ? 470 : settings.height,
					window.innerHeight - 32
				);
				setPos( {
					x: Math.max(
						8,
						Math.min( left, window.innerWidth - width - 12 )
					),
					y: Math.max(
						8,
						Math.min( top, window.innerHeight - height - 12 )
					),
				} );
				setAnchored( true );
			}
			setOwnerDialog( owner );
			setTextScope( 'selection' );
			if ( ! anchor.closest( '.global-color-panel' ) ) {
				setSwatchAction( 'apply' );
				updateSettings( {
					tab: 'color',
					...( mode === 'picker' || ! state.showColorPanel
						? { mode: 'wheel' }
						: {} ),
				} );
			}
			if ( next.documentTarget ) {
				dispatch( { type: 'SET_PAINT_TARGET', target: next.side } );
			}
			// A single stop/mesh-point swatch keeps its owning panel's selection.
			if (
				next.initialStop !== undefined ||
				next.ramp ||
				next.documentTarget
			) {
				dispatch( {
					type: 'SET_GRADIENT_STOP',
					index: next.initialStop || 0,
				} );
			}
			return mode;
		};
		return () => {
			session.beforeChange = null;
			session.onOpen = null;
		};
	} );
	// Missing counters and zero both mean no explicit panel command. The first
	// swatch reveal initializes the counter to zero and must keep its binding.
	const previousCommand = useRef( state.colorPanelCommand || 0 );
	useLayoutEffect( () => {
		const command = state.colorPanelCommand || 0;
		if ( previousCommand.current === command ) {
			return;
		}
		previousCommand.current = command;
		setSettings( ( current ) => ( { ...current, mode: 'wheel' } ) );
		sessionActions.current.suspend();
		session.clear();
		setOwnerDialog( null );
		setAnchored( false );
	}, [ state.colorPanelCommand, session ] );
	useEffect( () => {
		if ( state.colorTarget === 'gradientTool' ) {
			sessionActions.current.suspend();
			session.clear();
			setOwnerDialog( null );
			setAnchored( false );
		}
	}, [ state.gradientPanelReveal, state.colorTarget, session ] );
	useEffect( () => {
		if ( ! state.showColorPanel ) {
			sessionActions.current.suspend();
			session.clear();
			setOwnerDialog( null );
			setAnchored( false );
		}
	}, [ state.showColorPanel, session ] );
	const previousColorSelection = useRef( state.colorSelectionRevision );
	useLayoutEffect( () => {
		if ( previousColorSelection.current === state.colorSelectionRevision ) {
			return;
		}
		previousColorSelection.current = state.colorSelectionRevision;
		const current = session.request?.nested
			? session.request.parent
			: session.request;
		const owner = current?.anchor?.closest?.(
			'.modal-backdrop, [role="dialog"][aria-modal="true"]:not(.ed-float-panel)'
		);
		// A modal owns its local draft until Apply/Cancel. Ordinary swatches
		// and helper colors must release their old target on object selection.
		if ( owner?.isConnected ) {
			return;
		}
		if ( compact ) {
			sessionActions.current.close();
			return;
		}
		sessionActions.current.suspend();
		session.clear();
		setOwnerDialog( null );
		setAnchored( false );
		setTextScope( 'selection' );
		setSettings( ( s ) => ( { ...s, tab: 'color' } ) );
	}, [ state.colorSelectionRevision, session, compact ] );
	useEscape(
		auxiliary ? leaveAuxiliary : close,
		state.showColorPanel &&
			( ! docked || !! auxiliary ) &&
			! picking &&
			! comparison &&
			! dialogBlocked,
		request || state.colorPanelReveal
	);
	useEffect( () => {
		if (
			! state.showColorPanel ||
			docked ||
			pinned ||
			! anchored ||
			picking
		) {
			return undefined;
		}
		const outside = ( event ) => {
			// Selecting another object keeps the common editor open and releases
			// its temporary swatch anchor. Modal swatches keep their own scope.
			if (
				! ownerDialog &&
				! event.target.closest?.( '.ed-float-panel' ) &&
				event.target.closest?.( '.ed-canvas-area, .layer-item' )
			) {
				setAnchored( false );
				return;
			}
			if (
				root.current
					?.closest( '.color-panel-window' )
					?.contains( event.target ) ||
				request?.anchor?.contains( event.target ) ||
				event.target.closest?.(
					'.wpie-color-swatch, .paint-swatch-wrap, .paint-ramp-swatch, .wpie-input-dialog, .wpie-confirm-dialog'
				)
			) {
				return;
			}
			sessionActions.current.close();
		};
		document.addEventListener( 'pointerdown', outside, true );
		return () =>
			document.removeEventListener( 'pointerdown', outside, true );
	}, [
		state.showColorPanel,
		docked,
		pinned,
		anchored,
		picking,
		request,
		ownerDialog,
	] );
	const changePaint = ( change ) => {
		if ( disabled || selectedText ) {
			return;
		}
		clearPreview();
		if ( external ) {
			binding.onChange(
				carrier ? layerPaintPatch( layer, side, change ) : change
			);
			pending.current = { color, complete: binding.onCommit };
		} else if ( gradientTool ) {
			const { type, ...patch } = change;
			dispatch( {
				type: 'SET_TOOL_OPTS',
				tool: 'gradient',
				patch: {
					...gradientPaint( state.toolOpts.gradient ),
					...patch,
					reverse: false,
				},
			} );
		} else {
			extras?.richText?.current?.commit?.();
			const patch = carrier
				? layerPaintPatch( layer, side, change )
				: effectiveTarget === 'repeat'
				? {
						progression: {
							...layer.progression,
							color: { ...layer.progression.color, ...change },
						},
				  }
				: {
						...( change.kind
							? gradientKindPatch( layer, change.kind )
							: {} ),
						...change,
				  };
			if ( gradientLayer ) {
				setGradientEditing( layer.id, true );
			}
			if ( carrier && side !== 'additionalStroke' ) {
				updatePaintSelection( editor, layer, ( item ) =>
					layerPaintPatch( item, side, change )
				);
			} else {
				dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
			}
			pending.current = {
				color,
				layer: true,
				gradient: gradientLayer?.id,
			};
		}
	};
	const patternTarget = useMemo(
		() => ( {
			doc: state.doc,
			layer: layer?.id,
			binding: external ? mainRequest?.binding : null,
			side,
			type: paint?.type,
		} ),
		[
			state.doc,
			layer?.id,
			external,
			mainRequest?.binding,
			side,
			paint?.type,
		]
	);
	const patterns = useColorPatterns( {
		targetKey: patternTarget,
		enabled:
			!! ( state.showColorPanel || external ) &&
			paint?.type === 'pattern',
		onChange: changePaint,
		onCommit: finish,
		disabled:
			!! disabled ||
			paint?.type !== 'pattern' ||
			selectedText ||
			exclusivePick ||
			!! auxiliary,
	} );

	const changeStroke = ( change ) => {
		if ( disabled ) {
			return;
		}
		const patch = strokeSettingsPatch(
			side === 'additionalStroke' ? { ...layer, styles: null } : layer,
			change
		);
		if ( external ) {
			binding.onChange( patch );
			binding.onCommit?.();
		} else {
			if ( side === 'additionalStroke' ) {
				dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
			} else {
				updatePaintSelection( editor, layer, ( item ) =>
					strokeSettingsPatch( item, change )
				);
			}
			commit( __( 'Stroke', 'wunderpaint' ) );
		}
	};
	useEffect( () => {
		if ( ! request && ownerDialog ) {
			setOwnerDialog( null );
			if ( ! pinned ) {
				sessionActions.current.close();
			}
		}
	}, [ request, ownerDialog, pinned ] );
	const canvasPick = ( probe ) => {
		if ( ! probe.value.a ) {
			return;
		}
		if ( collecting ) {
			if ( collected.includes( probe.color ) ) {
				return;
			}
			if ( collected.length >= 12 ) {
				extras.toasts?.error?.(
					__(
						'The collection has 12 colors. Remove a color to add another.',
						'wunderpaint'
					)
				);
				return;
			}
			setCollected( ( current ) =>
				current.includes( probe.color )
					? current
					: [ ...current, probe.color ].slice( 0, 12 )
			);
			pushRecentColor( probe.color );
		} else {
			pickTile( panelColorWithAlpha( probe.color, rgba.a ) );
		}
	};
	const sample = ( event ) => {
		event.preventDefault();
		event.stopPropagation();
		const { p } = pointOf( event );
		if (
			event.button !== 0 ||
			p.x < 0 ||
			p.y < 0 ||
			p.x >= state.doc.w ||
			p.y >= state.doc.h
		) {
			return;
		}
		setResultPoint( { x: Math.floor( p.x ), y: Math.floor( p.y ) } );
		setPicking( false );
	};
	const saveCollection = async () => {
		setBusy( true );
		try {
			await saveColorPalette( collection.colors, extras );
		} finally {
			setBusy( false );
		}
	};
	const extract = async () => {
		setBusy( true );
		try {
			await extractColorsOp( editor, extras );
			updateSettings( { collection: 'extracted' } );
		} catch ( error ) {
			extras.toasts.error(
				__( 'Could not extract colors from this layer.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	const pickSwatch = ( next ) => {
		if ( swatchAction === 'find' ) {
			setUsageHit( null );
			setUsageColor( next );
		} else if ( swatchAction === 'gradient' ) {
			if ( gradientColors.length < 8 ) {
				setGradientColors( ( colors ) => [ ...colors, next ] );
			} else {
				extras.toasts?.error?.(
					__(
						'A gradient can have up to 8 colors here. Remove a color to add another.',
						'wunderpaint'
					)
				);
			}
		} else {
			pickTile( next );
		}
	};
	const startComparison = () => {
		finish();
		cancelPick();
		clearPreview();
		setCompare( {
			layers: state.layers,
			doc: state.doc,
			activeId: state.activeId,
			target: effectiveTarget,
			tool: state.tool,
			original: originalColor,
			colors: [ originalColor, originalColor, originalColor ],
			index: 0,
		} );
	};

	const strokeControls = carrier && side !== 'fill' && (
		<details className="color-editor-details">
			<summary>{ __( 'Stroke', 'wunderpaint' ) }</summary>
			<div className="color-editor-stroke">
				<label htmlFor={ `${ controlId }-stroke-width` }>
					{ __( 'Width', 'wunderpaint' ) }
					<input
						id={ `${ controlId }-stroke-width` }
						type="number"
						min="0"
						max="200"
						value={
							strokeSettings(
								side === 'additionalStroke'
									? { ...layer, styles: null }
									: layer
							).size
						}
						onChange={ ( e ) =>
							changeStroke( {
								size: Math.max( 0, +e.target.value ),
							} )
						}
						disabled={ !! disabled }
					/>
				</label>
				{ ( ( hasEffectStroke( layer ) &&
					side !== 'additionalStroke' ) ||
					( layer.type === 'shape' && layer.shape !== 'line' ) ) && (
					<label htmlFor={ `${ controlId }-stroke-position` }>
						{ __( 'Position', 'wunderpaint' ) }
						<select
							id={ `${ controlId }-stroke-position` }
							value={ strokeSettings( layer ).position }
							disabled={ !! disabled }
							onChange={ ( e ) =>
								changeStroke( {
									position: e.target.value,
								} )
							}
						>
							{ [
								[ 'inside', __( 'Inside', 'wunderpaint' ) ],
								[ 'center', __( 'Center', 'wunderpaint' ) ],
								[ 'outside', __( 'Outside', 'wunderpaint' ) ],
							].map( ( [ value, label ] ) => (
								<option key={ value } value={ value }>
									{ label }
								</option>
							) ) }
						</select>
					</label>
				) }
			</div>
		</details>
	);
	const valueControls = (
		<ColorValueControls
			title={
				gradientValue
					? gradientField
						? __( 'Point color', 'wunderpaint' )
						: __( 'Stop color', 'wunderpaint' )
					: __( 'Color', 'wunderpaint' )
			}
			compact={ compact || !! gradientValue }
			key={ `${ layer?.id }:${ effectiveTarget }:${ stopIndex }:${
				binding?.title || ''
			}` }
			color={ color }
			settings={ settings }
			updateSettings={ updateSettings }
			apply={ apply }
			finish={ finish }
			applyingText={ applyingText }
			previewTile={ previewTile }
			endTilePreview={ endTilePreview }
			pickDisabled={ !! disabled || !! ownerDialog }
			picking={ picking }
			onPick={ () =>
				picking
					? cancelPick()
					: beginColorPick( editor, {
							keepTarget: true,
					  } )
			}
		/>
	);
	const colorControls = (
		<div className="color-editor-values">
			{ valueControls }
			{ strokeControls }
		</div>
	);
	const selectStop = ( index ) => {
		finish();
		dispatch( { type: 'SET_GRADIENT_STOP', index } );
	};
	const newGradient = () => {
		finish();
		session.clear();
		clearPreview();
		cancelPick();
		if ( gradientValue ) {
			dispatch( {
				type: 'SET_TOOL_OPTS',
				tool: 'gradient',
				patch: { ...gradientPaint( gradientValue ), reverse: false },
			} );
		}
		setAnchored( false );
		onNewGradient?.();
	};
	const textScopeControl = textSession && (
		<label
			className="color-editor-scope"
			htmlFor={ `${ controlId }-scope` }
		>
			{ __( 'Apply to', 'wunderpaint' ) }
			<select
				id={ `${ controlId }-scope` }
				value={ selectedText ? 'selection' : 'layer' }
				onChange={ ( e ) => {
					finish();
					if ( e.target.value === 'layer' ) {
						extras?.richText?.current?.commit?.();
					}
					setTextScope( e.target.value );
				} }
			>
				<option
					value="selection"
					disabled={ [ 'gradient', 'pattern' ].includes(
						layer.fillType
					) }
				>
					{ __( 'Selected characters', 'wunderpaint' ) }
				</option>
				<option value="layer">
					{ __( 'Entire text', 'wunderpaint' ) }
				</option>
			</select>
		</label>
	);
	if (
		! state.showColorPanel ||
		( docked && ! dock ) ||
		( dialogBlocked && ! docked )
	) {
		return null;
	}
	const quickPicker = (
		<div className="color-picker-content">
			{ textScopeControl }
			<fieldset className="painting-fieldset" disabled={ !! disabled }>
				{ valueControls }
			</fieldset>
			<div className="color-panel-recent">
				<span className="color-panel-label">
					{ __( 'Recent colors', 'wunderpaint' ) }
				</span>
				<ColorTiles
					colors={ recents.slice( 0, 8 ) }
					disabled={ !! disabled }
					value={ color }
					label={ __( 'Recent colors', 'wunderpaint' ) }
					onChange={ pickTile }
				/>
			</div>
			<footer className="color-panel-footer">
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ () => {
						finish();
						cancelPick();
						dispatch( {
							type: 'TOGGLE_COLOR_PANEL',
							show: true,
							fromSwatch: true,
							preserveTab: !! ownerDialog,
						} );
					} }
				>
					{ paint && ! selectedText
						? side === 'fill'
							? __( 'Open gradients & patterns', 'wunderpaint' )
							: __( 'Open gradients', 'wunderpaint' )
						: __( 'Open color tools', 'wunderpaint' ) }
				</button>
			</footer>
		</div>
	);
	const content = (
		<>
			{ usageHit && ! collapsed && (
				<ColorUsageOverlay
					hit={ usageHit }
					state={ state }
					onEnd={ endUsage }
				/>
			) }
			{ [ 'canvas', 'collect', 'line' ].includes( picking ) &&
				! ( picking === 'canvas' && disabled ) && (
					<CanvasColorPicker
						key={ `${ state.activeId }:${ effectiveTarget }:${ picking }:${ originalColor }` }
						doc={ state.doc }
						layers={ state.layers }
						size={ probeOptions.sample || 1 }
						pointOf={ pointOf }
						collecting={ collecting }
						lineMode={ picking === 'line' }
						viewport={ state }
						onLine={ ( colors ) => {
							setPicking( false );
							setGradientColors( colors );
						} }
						onPick={ canvasPick }
						onCancel={ cancelPick }
						onError={ () => {
							cancelPick();
							extras.toasts?.error?.(
								__(
									'Could not read the canvas color.',
									'wunderpaint'
								)
							);
						} }
					/>
				) }
			{ picking === 'result' && (
				<div
					className="color-panel-pick-surface"
					role="presentation"
					onPointerDown={ ( e ) => {
						e.preventDefault();
						e.stopPropagation();
					} }
					onPointerUp={ sample }
					onContextMenu={ ( e ) => {
						e.preventDefault();
						e.stopPropagation();
						cancelPick();
					} }
				>
					<div className="color-panel-pick-hint">
						{ picking === 'result'
							? __(
									'Click inside the chosen color area. Esc cancels.',
									'wunderpaint'
							  )
							: __(
									'Click a color on the canvas. Esc cancels.',
									'wunderpaint'
							  ) }
					</div>
				</div>
			) }
			{ resultPoint &&
				settings.tab === 'extras' &&
				settings.extra === 'result' &&
				! collapsed && (
					<div
						className="color-panel-point"
						aria-hidden="true"
						style={ {
							left: state.pan.x + resultPoint.x * state.zoom,
							top: state.pan.y + resultPoint.y * state.zoom,
						} }
					/>
				) }
			<ColorPanelFrame
				dock={ dock }
				title={
					compact
						? binding?.title ||
						  names[ effectiveTarget ] ||
						  __( 'Color', 'wunderpaint' )
						: __( 'Color', 'wunderpaint' )
				}
				icon={ I.brand( { size: 15 } ) }
				className={ `color-panel-window${
					compact ? ' color-picker-window' : ''
				}${
					ownerDialog && ! dialogBlocked
						? ' color-editor-in-dialog'
						: ''
				}${ anchored && ! pinned ? ' color-editor-anchored' : '' }` }
				revealKey={ state.colorPanelReveal }
				modal={ false }
				width={ panelWidth }
				height={
					compact
						? 'auto'
						: Math.min( settings.height, window.innerHeight - 32 )
				}
				pos={ pos }
				onMove={ ( next ) => {
					setAnchored( false );
					move( next );
				} }
				onResize={ compact || anchored ? undefined : resize }
				onCollapse={ ( value ) => {
					setCollapsed( value );
					cancelPick();
					clearPreview();
				} }
				zIndex={
					compact ? 710 : ownerDialog || anchored ? 700 : zIndex
				}
				pinned={ pinned }
				onPin={
					easyMode && ! compact && ! ownerDialog
						? () => {
								setAnchored( false );
								onPin?.();
						  }
						: undefined
				}
				onFront={ onFront }
				onClose={ close }
			>
				<div
					ref={ root }
					className={ `global-color-panel${
						compact ? ' is-compact-picker' : ''
					}${ auxiliary ? ' is-editing-aux' : '' }` }
				>
					{ compact ? (
						quickPicker
					) : (
						<>
							{ auxiliary && (
								<div className="color-editor-aux">
									<div className="color-editor-target">
										<button
											type="button"
											className="dsm-mini"
											aria-label={ __(
												'Back',
												'wunderpaint'
											) }
											title={ __(
												'Back',
												'wunderpaint'
											) }
											onClick={ leaveAuxiliary }
										>
											<span className="color-editor-back">
												{ I.chevRight( { size: 15 } ) }
											</span>
										</button>
										<span>
											{ auxiliary.title ||
												__( 'Color', 'wunderpaint' ) }
										</span>
									</div>
									<fieldset
										className="color-panel-main"
										disabled={ !! auxiliary.disabled }
									>
										<ColorValueControls
											color={ normalizePanelColor(
												auxiliary.color || '#000000'
											) }
											settings={ settings }
											updateSettings={ updateSettings }
											apply={ auxiliary.onChange }
											finish={ () =>
												auxiliary.onCommit?.()
											}
										/>
									</fieldset>
								</div>
							) }

							<div className="color-editor-target">
								<span className="color-editor-object">
									{ external
										? binding.title ||
										  __( 'Color', 'wunderpaint' )
										: gradientTool
										? __( 'New gradient', 'wunderpaint' )
										: gradientLayer
										? __( 'Gradient', 'wunderpaint' )
										: carrier && paintTargets.length > 1
										? __( 'Selection', 'wunderpaint' )
										: carrier
										? layer.type === 'text'
											? __( 'Text', 'wunderpaint' )
											: __( 'Shape', 'wunderpaint' )
										: effectiveTarget === 'repeat'
										? __( 'Repeat', 'wunderpaint' )
										: names[ effectiveTarget ] ||
										  __( 'Color', 'wunderpaint' ) }
									{ mixedPaint && (
										<> · { __( 'Mixed', 'wunderpaint' ) }</>
									) }
								</span>
								{ carrier && ! external && (
									<div
										className="dsm-seg color-editor-sides"
										role="group"
										aria-label={ __(
											'Fill and stroke',
											'wunderpaint'
										) }
									>
										{ ( layer.type === 'shape' &&
										layer.shape === 'line'
											? [ 'stroke' ]
											: [ 'fill', 'stroke' ]
										).map( ( targetSide ) => (
											<button
												type="button"
												key={ targetSide }
												aria-pressed={
													side === targetSide
												}
												onClick={ () => {
													finish();
													clearPreview();
													dispatch( {
														type: 'SET_PAINT_TARGET',
														target: targetSide,
													} );
												} }
											>
												{ targetSide === 'fill'
													? __(
															'Fill',
															'wunderpaint'
													  )
													: __(
															'Stroke',
															'wunderpaint'
													  ) }
											</button>
										) ) }
									</div>
								) }
							</div>
							{ carrier &&
								! collecting &&
								! mixing &&
								! exclusivePick && (
									<div className="color-panel-paint">
										<PaintType
											cards
											value={
												mixedValue(
													paintTargets,
													( item ) =>
														layerPaint( item, side )
															.type
												)
													? undefined
													: paint.type
											}
											disabled={ !! disabled }
											pattern={
												side === 'fill' &&
												! selectedText
											}
											solidOnly={ selectedText }
											onChange={ ( type ) => {
												finish();
												changePaint( { type } );
												finish();
												updateSettings( {
													tab: 'color',
												} );
											} }
										/>
									</div>
								) }
							{ textScopeControl }
							<div className="color-panel-navigation">
								<div
									className="ed-right-tabs color-panel-tabs"
									role="tablist"
									aria-label={ __(
										'Color panel',
										'wunderpaint'
									) }
								>
									{ [
										[
											'color',
											__( 'Edit', 'wunderpaint' ),
											I.palette,
										],
										[
											'swatches',
											__( 'Swatches', 'wunderpaint' ),
											I.grid,
										],
										...( ! external
											? [
													[
														'extras',
														__(
															'Tools',
															'wunderpaint'
														),
														I.sliders,
													],
											  ]
											: [] ),
									].map( ( [ id, label, icon ] ) => (
										<button
											key={ id }
											type="button"
											role="tab"
											aria-selected={
												settings.tab === id
											}
											className={
												settings.tab === id
													? 'active'
													: ''
											}
											onClick={ () => {
												finish();
												clearPreview();
												if ( exclusivePick ) {
													cancelPick();
												}
												if ( id === 'extras' ) {
													extras?.richText?.current?.commit?.();
												}
												updateSettings( { tab: id } );
											} }
										>
											{ icon( { size: 13 } ) }
											{ label }
										</button>
									) ) }
								</div>
							</div>
							<div className="color-editor-body">
								{ settings.tab === 'color' &&
									( paint?.type === 'pattern' ? (
										<PatternLibrary
											layer={ layer }
											patterns={ patterns }
											onManage={ extras?.openPatterns }
											disabled={
												!! disabled || exclusivePick
											}
										/>
									) : gradientValue ? (
										<div className="color-editor-library gp">
											<GradientLibrary
												paint={ gradientValue }
												scope={ gradientScope }
												disabled={
													!! disabled || exclusivePick
												}
												onSelect={ selectStop }
												onChange={ ( patch ) => {
													changePaint( patch );
													finish();
												} }
											/>
										</div>
									) : (
										<div className="color-editor-library color-swatch-library">
											<span className="color-panel-label">
												{ __(
													'Swatches',
													'wunderpaint'
												) }
											</span>
											<div className="color-library-scroll">
												<ColorTiles
													colors={ collection.colors }
													value={ color }
													label={ __(
														'Swatches',
														'wunderpaint'
													) }
													disabled={
														!! disabled ||
														exclusivePick
													}
													onChange={ pickTile }
													onPreview={ previewTile }
													onPreviewEnd={
														endTilePreview
													}
												/>
											</div>
										</div>
									) ) }
								<fieldset
									className="color-panel-main"
									onBlur={ ( e ) => {
										if (
											e.target.matches( 'input' ) &&
											pending.current?.richText
										) {
											finish();
										}
									} }
									disabled={
										( !! disabled &&
											settings.tab === 'color' ) ||
										exclusivePick
									}
								>
									{ settings.tab === 'color' &&
										! gradientValue &&
										paint?.type !== 'pattern' && (
											<div className="color-gradient-kind">
												<span>
													{ __(
														'Palette',
														'wunderpaint'
													) }
												</span>
												<select
													aria-label={ __(
														'Palette',
														'wunderpaint'
													) }
													value={ collection.id }
													onChange={ ( event ) =>
														updateSettings( {
															collection:
																event.target
																	.value,
														} )
													}
												>
													{ collections.map(
														( entry ) => (
															<option
																key={ entry.id }
																value={
																	entry.id
																}
															>
																{ entry.name }
															</option>
														)
													) }
												</select>
											</div>
										) }
									{ settings.tab === 'color' &&
										gradientValue &&
										gradientScope !== 'ramp' && (
											<GradientKinds
												paint={ gradientValue }
												layer={ gradientLayer }
												scope={ gradientScope }
												disabled={ !! disabled }
												onChange={ ( patch ) => {
													changePaint( patch );
													finish();
												} }
											/>
										) }
									{ settings.tab === 'color' &&
										! selectedText && (
											<>
												{ gradientValue && (
													<GradientControls
														paint={ gradientValue }
														layer={ gradientLayer }
														scope={ gradientScope }
														selectedStop={
															stopIndex
														}
														onSelectStop={
															selectStop
														}
														disabled={ !! disabled }
														onChange={ changePaint }
														onCommit={ finish }
														colorControls={
															colorControls
														}
													/>
												) }
												{ paint?.type === 'pattern' && (
													<PatternControls
														layer={ layer }
														patterns={ patterns }
														color={ color }
														onChange={ changePaint }
														onCommit={ finish }
													/>
												) }
											</>
										) }

									{ disabled && (
										<p className="color-panel-note">
											{ __(
												'Layer is locked',
												'wunderpaint'
											) }
										</p>
									) }
									{ settings.tab === 'extras' ? (
										<>
											<select
												className="color-panel-view"
												aria-label={ __(
													'Color extras',
													'wunderpaint'
												) }
												value={ settings.extra }
												onChange={ ( e ) => {
													clearPreview();
													cancelPick();
													updateSettings( {
														extra: e.target.value,
													} );
												} }
											>
												<option value="links">
													{ __(
														'Linked colors',
														'wunderpaint'
													) }
												</option>
												<option value="mix">
													{ __(
														'Palette mix',
														'wunderpaint'
													) }
												</option>
												<option value="result">
													{ __(
														'Result color',
														'wunderpaint'
													) }
												</option>
											</select>
											{ ! collapsed &&
												settings.extra === 'links' && (
													<ColorLinks
														key={ `${ layer?.id }:${ effectiveTarget }` }
														editor={ editor }
														layer={ layer }
														target={
															effectiveTarget
														}
													/>
												) }
											{ ! collapsed &&
												settings.extra === 'mix' && (
													<PaletteMix
														key={ state.activeId }
														editor={ editor }
														collections={
															collections
														}
														showPreview={
															showPreview
														}
														clearPreview={
															clearPreview
														}
													/>
												) }
											{ ! collapsed &&
												settings.extra === 'result' && (
													<ResultColor
														key={ `${ layer?.id }:${ effectiveTarget }` }
														editor={ editor }
														layer={ layer }
														target={
															effectiveTarget
														}
														point={ resultPoint }
														requestPoint={ () => {
															clearPreview();
															setPicking(
																'result'
															);
														} }
														showPreview={
															showPreview
														}
														clearPreview={
															clearPreview
														}
													/>
												) }
										</>
									) : settings.tab === 'color' ? (
										<>
											{ ! gradientValue && colorControls }
											{ settings.tab !== 'extras' &&
												( ! ownerDialog ||
													canPickScreenColor() ) && (
													<details className="color-panel-picking">
														<summary>
															{ __(
																'Sampling',
																'wunderpaint'
															) }
														</summary>
														<EyedropperOptions
															keepTarget
															screenOnly={
																!! ownerDialog
															}
															onScreen={ (
																options
															) =>
																startPick(
																	options
																)
															}
															editor={ editor }
															disabled={
																!! disabled
															}
														>
															<button
																type="button"
																className="ai-btn secondary sm eyedropper-canvas"
																disabled={
																	!! disabled &&
																	! picking
																}
																onClick={ (
																	event
																) =>
																	picking
																		? cancelPick()
																		: beginColorPick(
																				editor,
																				{
																					background:
																						event.altKey,
																					keepTarget: true,
																				}
																		  )
																}
															>
																{ collecting
																	? __(
																			'Done',
																			'wunderpaint'
																	  )
																	: picking
																	? __(
																			'Cancel',
																			'wunderpaint'
																	  )
																	: __(
																			'Pick',
																			'wunderpaint'
																	  ) }
															</button>
														</EyedropperOptions>
													</details>
												) }
											<details className="color-editor-explore">
												<summary>
													{ __(
														'Explore colors',
														'wunderpaint'
													) }
												</summary>{ ' ' }
												{ ! external && (
													<ColorComparison
														value={ comparison }
														color={ color }
														onStart={
															startComparison
														}
														onChoose={ ( index ) =>
															setCompare( {
																...comparison,
																index,
															} )
														}
														onCancel={ () =>
															clearPreview()
														}
														onApply={ (
															chosen
														) => {
															const changed =
																comparison.index !==
																0;
															clearPreview();
															if ( changed ) {
																apply(
																	chosen,
																	true
																);
																finish();
															}
														} }
													/>
												) }
												<ColorBackgrounds
													color={ color }
												/>
												<ColorHarmony
													color={ rgb }
													context={ `${ state.activeId }:${ effectiveTarget }` }
													value={ harmony }
													Tiles={ ColorTiles }
													onGradient={
														( carrier ||
															binding?.ramp ||
															[
																'gradient',
																'gradientTool',
																'repeat',
															].includes(
																effectiveTarget
															) ) &&
														! selectedText &&
														! gradientField
															? ( colors ) => {
																	changePaint(
																		{
																			type: 'gradient',
																			stops: colors.map(
																				(
																					shade,
																					i
																				) => ( {
																					at:
																						i /
																						( colors.length -
																							1 ),
																					color: shade,
																				} )
																			),
																		}
																	);
																	finish();
																	updateSettings(
																		{
																			tab: 'color',
																		}
																	);
															  }
															: undefined
													}
													settings={ settings }
													onSettings={
														updateSettings
													}
													extras={ extras }
													onPreview={ ( c ) =>
														previewTile(
															panelColorWithAlpha(
																c,
																rgba.a
															)
														)
													}
													onPreviewEnd={
														endTilePreview
													}
													onChange={ (
														c,
														nextHarmony
													) => {
														if ( nextHarmony ) {
															updateSettings( {
																harmony:
																	nextHarmony,
															} );
														} else {
															applyRgb( c );
															finish();
														}
													} }
												/>
											</details>
										</>
									) : (
										<>
											<select
												className="color-panel-view"
												aria-label={ __(
													'Palette',
													'wunderpaint'
												) }
												value={ collection.id }
												onChange={ ( e ) =>
													updateSettings( {
														collection:
															e.target.value,
													} )
												}
											>
												{ collections
													.filter(
														( p ) => ! p.group
													)
													.map( ( p ) => (
														<option
															key={ p.id }
															value={ p.id }
														>
															{ p.name }
														</option>
													) ) }
												{ [
													[
														'palettes',
														__(
															'My palettes',
															'wunderpaint'
														),
													],
													[
														'brand',
														__(
															'Brand Kits',
															'wunderpaint'
														),
													],
												].map(
													( [ id, label ] ) =>
														collections.some(
															( p ) =>
																p.group === id
														) && (
															<optgroup
																key={ id }
																label={ label }
															>
																{ collections
																	.filter(
																		( p ) =>
																			p.group ===
																			id
																	)
																	.map(
																		(
																			p
																		) => (
																			<option
																				key={
																					p.id
																				}
																				value={
																					p.id
																				}
																			>
																				{
																					p.name
																				}
																			</option>
																		)
																	) }
															</optgroup>
														)
												) }
											</select>
											<div
												className="dsm-seg color-swatch-actions"
												role="group"
												aria-label={ __(
													'Swatch action',
													'wunderpaint'
												) }
											>
												{ [
													[
														'apply',
														__(
															'Apply',
															'wunderpaint'
														),
													],
													[
														'find',
														__(
															'Find',
															'wunderpaint'
														),
													],
													[
														'gradient',
														__(
															'Gradient',
															'wunderpaint'
														),
													],
												]
													.filter(
														( [ id ] ) =>
															! external ||
															id === 'apply'
													)
													.map( ( [ id, label ] ) => (
														<button
															type="button"
															key={ id }
															className={
																swatchAction ===
																id
																	? 'active'
																	: ''
															}
															aria-pressed={
																swatchAction ===
																id
															}
															onClick={ () => {
																finish();
																clearPreview();
																setSwatchAction(
																	id
																);
																if (
																	id ===
																	'gradient'
																) {
																	extras?.richText?.current?.commit?.();
																}
															} }
														>
															{ label }
														</button>
													) ) }
											</div>
											{ collection.colors.length ? (
												<ColorTiles
													onPreview={
														swatchAction === 'apply'
															? previewTile
															: undefined
													}
													onPreviewEnd={
														endTilePreview
													}
													colors={ uniqueColors(
														collection.colors
													) }
													value={
														swatchAction === 'find'
															? usageColor
															: color
													}
													selectedColors={
														swatchAction ===
														'gradient'
															? gradientColors
															: undefined
													}
													label={ collection.name }
													disabled={
														swatchAction ===
															'apply' &&
														!! disabled
													}
													onRemove={
														collection.id ===
														'collected'
															? ( c ) =>
																	setCollected(
																		(
																			current
																		) =>
																			current.filter(
																				(
																					value
																				) =>
																					value !==
																					c
																			)
																	)
															: undefined
													}
													onChange={ pickSwatch }
												/>
											) : (
												<p className="color-panel-note">
													{ collection.id ===
													'collected'
														? __(
																'Collect colors from the canvas to build a palette.',
																'wunderpaint'
														  )
														: collection.id ===
														  'favorites'
														? __(
																'Use Favorite to keep a color here.',
																'wunderpaint'
														  )
														: collection.id ===
														  'extracted'
														? __(
																'Select an image layer, then choose Extract.',
																'wunderpaint'
														  )
														: __(
																'No colors yet.',
																'wunderpaint'
														  ) }
												</p>
											) }
											{ swatchAction === 'find' && (
												<ColorUsage
													color={ usageColor }
													entries={ colorScan }
													onShow={ ( hit ) => {
														clearPreview();
														setUsageHit( {
															...hit,
														} );
													} }
													onSelect={ ( ids ) => {
														finish();
														clearPreview();
														extras?.richText?.current?.commit?.();
														dispatch( {
															type: 'SET_SELECTED',
															ids,
														} );
													} }
												/>
											) }
											{ swatchAction === 'gradient' &&
												! collapsed && (
													<SwatchGradient
														key={
															gradientRequest.id
														}
														initialKind={
															gradientRequest.kind
														}
														onApplyPaint={
															( carrier ||
																binding?.ramp ||
																[
																	'gradient',
																	'gradientTool',
																	'repeat',
																].includes(
																	effectiveTarget
																) ) &&
															! disabled &&
															! selectedText &&
															! gradientField
																? (
																		change
																  ) => {
																		changePaint(
																			change
																		);
																		finish();
																		updateSettings(
																			{
																				tab: 'color',
																			}
																		);
																  }
																: undefined
														}
														customTarget={
															external ||
															! carrier
														}
														targetLabel={
															external
																? binding.title
																: names[
																		effectiveTarget
																  ]
														}
														target={ paintSide(
															effectiveTarget
														) }
														resetKey={
															workflowEpoch
														}
														editor={ editor }
														extras={ extras }
														colors={
															gradientColors
														}
														onColors={
															setGradientColors
														}
														onSampleLine={ () =>
															beginColorPick(
																editor,
																{
																	line: true,
																}
															)
														}
														showPreview={
															showPreview
														}
														clearPreview={
															clearPreview
														}
													/>
												) }
											<PalettePaste
												onImport={ ( colors ) => {
													clearPreview();
													setImported( colors );
													updateSettings( {
														collection: 'imported',
													} );
												} }
											/>
											<div className="color-panel-extract">
												<button
													type="button"
													className="ai-btn secondary sm"
													onClick={ () =>
														beginColorPick(
															editor,
															{
																collect: true,
															}
														)
													}
												>
													{ __(
														'Collect',
														'wunderpaint'
													) }
												</button>
												{ [
													'collected',
													'imported',
												].includes( collection.id ) &&
													! window.WPIE
														?.standalone && (
														<button
															type="button"
															className="ai-btn secondary sm"
															disabled={
																busy ||
																! collection
																	.colors
																	.length
															}
															onClick={
																saveCollection
															}
														>
															{ __(
																'Save palette',
																'wunderpaint'
															) }
														</button>
													) }
												{ canExtract && (
													<button
														type="button"
														className="ai-btn secondary sm"
														disabled={ busy }
														onClick={ extract }
													>
														{ busy
															? __(
																	'Extracting',
																	'wunderpaint'
															  )
															: __(
																	'Extract',
																	'wunderpaint'
															  ) }
													</button>
												) }
											</div>
										</>
									) }
								</fieldset>
							</div>
							{ settings.tab !== 'extras' && (
								<div className="color-panel-recent">
									<span className="color-panel-label">
										{ __( 'Recent colors', 'wunderpaint' ) }
									</span>
									<ColorTiles
										onPreview={
											settings.tab === 'swatches' &&
											swatchAction !== 'apply'
												? undefined
												: previewTile
										}
										onPreviewEnd={ endTilePreview }
										colors={ recents.slice( 0, 8 ) }
										disabled={
											exclusivePick ||
											( !! disabled &&
												( settings.tab !== 'swatches' ||
													swatchAction === 'apply' ) )
										}
										value={
											settings.tab === 'swatches' &&
											swatchAction === 'find'
												? usageColor
												: color
										}
										selectedColors={
											settings.tab === 'swatches' &&
											swatchAction === 'gradient'
												? gradientColors
												: undefined
										}
										label={ __(
											'Recent colors',
											'wunderpaint'
										) }
										onChange={
											settings.tab === 'swatches'
												? pickSwatch
												: pickTile
										}
									/>
								</div>
							) }
							<footer className="color-panel-footer">
								{ ( gradientTool || gradientLayer ) && (
									<button
										type="button"
										className="ai-btn secondary sm"
										onClick={ newGradient }
									>
										{ __( 'New gradient', 'wunderpaint' ) }
									</button>
								) }
								{ settings.tab !== 'extras' && (
									<>
										<button
											type="button"
											className="ai-btn secondary sm"
											aria-pressed={ !! savedFavorite }
											title={
												!! savedFavorite
													? __(
															'Remove from my swatches',
															'wunderpaint'
													  )
													: __(
															'Save to my swatches',
															'wunderpaint'
													  )
											}
											onClick={ () =>
												toggleCustomSwatch(
													savedFavorite || color
												)
											}
										>
											{ __( 'Favorite', 'wunderpaint' ) }
										</button>
									</>
								) }
								{ settings.tab === 'extras' && picking && (
									<button
										type="button"
										className="ai-btn secondary sm"
										onClick={ cancelPick }
									>
										{ __( 'Cancel', 'wunderpaint' ) }
									</button>
								) }

								<button
									type="button"
									className="ai-btn secondary sm"
									onClick={ () => {
										finish();
										cancelPick();
										extras.openColorSchemer?.(
											schemerSeed()
										);
									} }
								>
									{ __( 'Palettes', 'wunderpaint' ) }
								</button>
							</footer>
						</>
					) }
				</div>
			</ColorPanelFrame>
		</>
	);
	return ownerDialog?.isConnected
		? createPortal( content, ownerDialog )
		: content;
}
