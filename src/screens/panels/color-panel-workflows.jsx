import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { I } from '../../icons';
import { ColorField } from '../../components/color-field';
import { useEscape } from '../../components/use-escape';
import { layerFootprint } from '../../lib/selection-units';
import { colorKey } from '../../lib/color-replace';
import { detachPatchedColorLinks } from '../../lib/color-links';
import { saveColorPalette } from '../../lib/save-color-palette';
import {
	saveUserGradient,
	listUserGradients,
} from '../../lib/gradient-presets';
import { promptDialog } from '../../lib/dialogs';
import {
	parsePaletteText,
	readPaletteColor,
	paletteGradientStops,
	paletteGradientPatch,
} from '../../lib/color-panel-workflows';
import { ancestorLocked } from '../canvas/tool-handlers';

export function ColorBackgrounds( { color } ) {
	const [ background, setBackground ] = useState( '#607080' );
	const [ draft, setDraft ] = useState( background );
	return (
		<details className="color-panel-details">
			<summary>{ __( 'Background preview', 'wunderpaint' ) }</summary>
			<div className="color-backgrounds">
				{ [
					[ '#ffffff', __( 'Light', 'wunderpaint' ) ],
					[ '#17191d', __( 'Dark', 'wunderpaint' ) ],
					[ background, __( 'Custom', 'wunderpaint' ) ],
				].map( ( [ bg, name ] ) => (
					<div key={ name }>
						<div
							className="color-background-sample"
							style={ { background: bg } }
							role="img"
							aria-label={ sprintf(
								/* translators: %s: background name. */ __(
									'Color on %s',
									'wunderpaint'
								),
								name
							) }
						>
							<span style={ { color } }>Aa</span>
							<i style={ { background: color } } />
						</div>
						<span>{ name }</span>
					</div>
				) ) }
			</div>
			<ColorField
				title={ __( 'Preview background', 'wunderpaint' ) }
				color={ draft }
				onChange={ ( value ) => {
					setDraft( value );
					const next = readPaletteColor( value );
					if ( next ) {
						setBackground( next );
					}
				} }
				onCommit={ () => setDraft( background ) }
			/>
		</details>
	);
}

export function PalettePaste( { onImport } ) {
	const [ text, setText ] = useState( '' );
	const parsed = useMemo( () => parsePaletteText( text ), [ text ] );
	const details = useRef( null );
	return (
		<details
			ref={ details }
			className="color-panel-details color-palette-paste"
		>
			<summary>{ __( 'Paste palette', 'wunderpaint' ) }</summary>
			<p className="color-panel-note">
				{ __(
					'Paste HEX, RGB or HSL colors, or CSS declarations.',
					'wunderpaint'
				) }
			</p>
			<textarea
				aria-label={ __( 'Palette text', 'wunderpaint' ) }
				value={ text }
				maxLength={ 50000 }
				rows={ 3 }
				placeholder="#183153, #e9b44c, #f4f4f4"
				spellCheck={ false }
				onChange={ ( e ) => setText( e.target.value ) }
			/>
			{ parsed.colors.length > 0 && (
				<div
					className="color-panel-mix-strip"
					aria-label={ __( 'Imported colors', 'wunderpaint' ) }
				>
					{ parsed.colors.map( ( color ) => (
						<span
							key={ color }
							style={ { background: color } }
							title={ color }
						/>
					) ) }
				</div>
			) }
			{ text && (
				<p className="color-panel-note" role="status">
					{ parsed.total > 12
						? __(
								'The first 12 distinct colors will be imported.',
								'wunderpaint'
						  )
						: ! parsed.colors.length
						? __( 'No supported colors found.', 'wunderpaint' )
						: sprintf(
								/* translators: %d: number of imported colors. */ __(
									'%d colors ready to import.',
									'wunderpaint'
								),
								parsed.colors.length
						  ) }
				</p>
			) }
			<button
				type="button"
				className="ai-btn secondary sm"
				disabled={ ! parsed.colors.length }
				onClick={ () => {
					onImport( parsed.colors );
					setText( '' );
					details.current.open = false;
				} }
			>
				{ __( 'Import', 'wunderpaint' ) }
			</button>
		</details>
	);
}

export function ColorUsage( { color, entries, onShow, onSelect } ) {
	const key = colorKey( color )?.key;
	const hit = entries.find( ( item ) => item.key === key );
	const ids = hit?.layerIds || [];
	return (
		<div className="color-panel-extra color-usage">
			<p className="color-panel-note" role="status">
				{ ! color
					? __(
							'Choose a swatch to find editable objects using that color.',
							'wunderpaint'
					  )
					: ids.length
					? sprintf(
							/* translators: %d: number of matching layers. */ __(
								'%d matching layers.',
								'wunderpaint'
							),
							ids.length
					  )
					: hit?.kinds.includes( 'background' )
					? __(
							'This color is used in the document background.',
							'wunderpaint'
					  )
					: __(
							'No editable objects use this color. Image pixels and locked layers are excluded.',
							'wunderpaint'
					  ) }
			</p>
			<div className="color-panel-actions">
				<button
					type="button"
					className="ai-btn secondary sm"
					disabled={ ! hit }
					onClick={ () => onShow( hit ) }
				>
					{ __( 'Show', 'wunderpaint' ) }
				</button>
				<button
					type="button"
					className="ai-btn secondary sm"
					disabled={ ! ids.length }
					onClick={ () => onSelect( ids ) }
				>
					{ __( 'Select', 'wunderpaint' ) }
				</button>
			</div>
		</div>
	);
}

/** Screen-only outlines. They do not touch selection, document data or export. */
export function ColorUsageOverlay( { hit, state, onEnd } ) {
	useEffect( () => {
		const timer = window.setTimeout( onEnd, 2600 );
		return () => window.clearTimeout( timer );
	}, [ hit, onEnd ] );
	useEscape( onEnd, !! hit );
	const boxes = state.layers
		.filter( ( l ) => hit.layerIds.includes( l.id ) )
		.map( layerFootprint );
	if ( hit.kinds.includes( 'background' ) ) {
		boxes.push( { x: 0, y: 0, w: state.doc.w, h: state.doc.h } );
	}
	return (
		<div className="color-usage-overlay" aria-hidden="true">
			{ boxes.map( ( box, i ) => (
				<div
					key={ i }
					style={ {
						left: state.pan.x + box.x * state.zoom,
						top: state.pan.y + box.y * state.zoom,
						width: Math.max( 2, box.w * state.zoom ),
						height: Math.max( 2, box.h * state.zoom ),
					} }
				/>
			) ) }
		</div>
	);
}

export function SwatchGradient( {
	initialKind = 'linear',
	onApplyPaint,
	customTarget = false,
	targetLabel,
	target = 'fill',
	resetKey,
	editor,
	extras,
	colors,
	onColors,
	onSampleLine,
	showPreview,
	clearPreview,
} ) {
	const { state, dispatch, commit } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId );
	const locked =
		layer && ( layer.locked || ancestorLocked( state.layers, layer ) );
	const [ kind, setKind ] = useState( initialKind );
	const [ index, setIndex ] = useState( 0 );
	const [ previewBase, setPreviewBase ] = useState( null );
	const preview =
		!! previewBase &&
		previewBase.layers === state.layers &&
		previewBase.doc === state.doc &&
		previewBase.activeId === state.activeId &&
		previewBase.tool === state.tool;
	const setPreview = useCallback(
		( value ) =>
			setPreviewBase(
				value
					? {
							layers: state.layers,
							doc: state.doc,
							activeId: state.activeId,
							tool: state.tool,
					  }
					: null
			),
		[ state.layers, state.doc, state.activeId, state.tool ]
	);
	const [ busy, setBusy ] = useState( false );
	const [ saved, setSaved ] = useState( false );
	const stops = useMemo( () => paletteGradientStops( colors ), [ colors ] );
	const patch = useMemo( () => {
		const fill =
			! customTarget &&
			! locked &&
			paletteGradientPatch( layer, colors, kind, target );
		return fill ? detachPatchedColorLinks( layer, fill ) : null;
	}, [ layer, locked, colors, kind, target, customTarget ] );
	const stopIndex = Math.min( index, Math.max( 0, colors.length - 1 ) );
	useEffect( () => {
		setPreview( false );
	}, [ state.layers, state.doc, state.activeId, resetKey, setPreview ] );
	useEffect( () => {
		setSaved( false );
	}, [ colors, kind ] );
	useEffect( () => {
		if ( preview && patch ) {
			showPreview(
				new Map( [ [ layer.id, patch ] ] ),
				null,
				'swatch-gradient'
			);
		}
		return () => clearPreview( 'swatch-gradient' );
	}, [ preview, patch, layer?.id, showPreview, clearPreview ] );
	useEscape( () => setPreview( false ), preview );
	const move = ( offset ) => {
		const destination = stopIndex + offset;
		if ( destination < 0 || destination >= colors.length ) {
			return;
		}
		const next = [ ...colors ];
		[ next[ destination ], next[ stopIndex ] ] = [
			next[ stopIndex ],
			next[ destination ],
		];
		onColors( next );
		setIndex( destination );
	};
	const save = async () => {
		setPreview( false );
		setBusy( true );
		try {
			const names = new Set( listUserGradients().map( ( g ) => g.name ) );
			let name = __( 'Gradient', 'wunderpaint' ),
				n = 2;
			while ( names.has( name ) ) {
				name = `${ __( 'Gradient', 'wunderpaint' ) } ${ n++ }`;
			}
			const chosen = await promptDialog( {
				title: __( 'Save Gradient', 'wunderpaint' ),
				confirmLabel: __( 'Save', 'wunderpaint' ),
				label: __( 'Name', 'wunderpaint' ),
				defaultValue: name,
			} );
			if ( chosen?.trim() ) {
				saveUserGradient( chosen.trim(), stops, kind );
				setSaved( true );
			}
		} finally {
			setBusy( false );
		}
	};
	return (
		<div className="color-panel-extra color-swatch-gradient">
			<p className="color-panel-note">
				{ __(
					'Click 2 to 8 swatches in order, or sample a line on the canvas.',
					'wunderpaint'
				) }
			</p>
			{ colors.length > 0 && (
				<>
					<div
						className="color-gradient-stops"
						role="group"
						aria-label={ __( 'Gradient colors', 'wunderpaint' ) }
					>
						{ colors.map( ( color, i ) => (
							<button
								type="button"
								key={ i }
								className="color-panel-swatch"
								aria-pressed={ stopIndex === i }
								aria-label={ sprintf(
									/* translators: %d: position in the gradient. */ __(
										'Color %d',
										'wunderpaint'
									),
									i + 1
								) }
								title={ color }
								onClick={ () => setIndex( i ) }
							>
								<span style={ { background: color } } />
								<b>{ i + 1 }</b>
							</button>
						) ) }
					</div>
					<div className="color-gradient-order">
						<button
							type="button"
							className="dsm-mini"
							aria-label={ __(
								'Move color left',
								'wunderpaint'
							) }
							title={ __( 'Move color left', 'wunderpaint' ) }
							disabled={ stopIndex === 0 }
							onClick={ () => move( -1 ) }
						>
							<span className="color-arrow-left">
								{ I.chevRight( { size: 13 } ) }
							</span>
						</button>
						<button
							type="button"
							className="dsm-mini"
							aria-label={ __(
								'Move color right',
								'wunderpaint'
							) }
							title={ __( 'Move color right', 'wunderpaint' ) }
							disabled={ stopIndex === colors.length - 1 }
							onClick={ () => move( 1 ) }
						>
							{ I.chevRight( { size: 13 } ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => {
								onColors(
									colors.filter( ( _, i ) => i !== stopIndex )
								);
								setIndex( Math.max( 0, stopIndex - 1 ) );
							} }
						>
							{ __( 'Remove', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => onColors( [] ) }
						>
							{ __( 'Clear', 'wunderpaint' ) }
						</button>
					</div>
				</>
			) }
			<button
				type="button"
				className="ai-btn secondary sm"
				onClick={ () => {
					setPreview( false );
					onSampleLine();
				} }
			>
				{ __( 'Sample line', 'wunderpaint' ) }
			</button>
			{ stops.length > 0 && (
				<>
					<select
						aria-label={ __( 'Gradient type', 'wunderpaint' ) }
						value={ kind }
						onChange={ ( e ) => setKind( e.target.value ) }
					>
						{ [
							[ 'linear', __( 'Linear', 'wunderpaint' ) ],
							[ 'radial', __( 'Radial', 'wunderpaint' ) ],
							[ 'angle', __( 'Angle', 'wunderpaint' ) ],
						].map( ( [ value, name ] ) => (
							<option key={ value } value={ value }>
								{ name }
							</option>
						) ) }
					</select>
					<div
						className="color-gradient-preview"
						role="img"
						aria-label={ __( 'Gradient preview', 'wunderpaint' ) }
					>
						<span
							style={ {
								background: `${
									kind === 'radial'
										? 'radial-gradient(circle'
										: kind === 'angle'
										? 'conic-gradient(from 90deg'
										: 'linear-gradient(90deg'
								}, ${ stops
									.map(
										( s ) => `${ s.color } ${ s.at * 100 }%`
									)
									.join( ', ' ) })`,
							} }
						/>
					</div>
					<p className="color-panel-note">
						{ customTarget
							? targetLabel
							: patch
							? sprintf(
									/* translators: 1: Fill or Stroke, 2: selected layer name. */
									__( '%1$s of %2$s', 'wunderpaint' ),
									target === 'stroke'
										? __( 'Stroke', 'wunderpaint' )
										: __( 'Fill', 'wunderpaint' ),
									layer.name ||
										( layer.type === 'text'
											? __( 'Text', 'wunderpaint' )
											: __( 'Shape', 'wunderpaint' ) )
							  )
							: locked
							? __( 'Layer is locked', 'wunderpaint' )
							: __(
									'Select a text or shape layer to apply this gradient.',
									'wunderpaint'
							  ) }
					</p>
					<div className="color-panel-actions">
						<button
							type="button"
							className="ai-btn secondary sm"
							disabled={ ! patch }
							aria-pressed={ preview }
							onClick={ () => setPreview( ! preview ) }
						>
							{ __( 'Preview', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							disabled={ ! patch && ! onApplyPaint }
							onClick={ () => {
								if ( onApplyPaint ) {
									onApplyPaint( {
										type: 'gradient',
										kind,
										stops,
									} );
									return;
								}
								extras?.richText?.current?.commit?.();
								setPreview( false );
								clearPreview();
								dispatch( {
									type: 'UPDATE_LAYER',
									id: layer.id,
									patch,
								} );
								commit( __( 'Gradient fill', 'wunderpaint' ) );
							} }
						>
							{ __( 'Apply', 'wunderpaint' ) }
						</button>
					</div>
					<div className="color-panel-actions">
						<button
							type="button"
							className="ai-btn secondary sm"
							disabled={ busy }
							onClick={ save }
						>
							{ saved
								? __( 'Saved', 'wunderpaint' )
								: __( 'Save gradient', 'wunderpaint' ) }
						</button>
						{ ! window.WPIE?.standalone && (
							<button
								type="button"
								className="ai-btn secondary sm"
								disabled={ busy }
								onClick={ async () => {
									setPreview( false );
									setBusy( true );
									try {
										await saveColorPalette(
											colors,
											extras
										);
									} finally {
										setBusy( false );
									}
								} }
							>
								{ __( 'Save palette', 'wunderpaint' ) }
							</button>
						) }
					</div>
				</>
			) }
		</div>
	);
}

export function ColorComparison( {
	value,
	color,
	onStart,
	onChoose,
	onApply,
	onCancel,
} ) {
	return (
		<div className="color-panel-comparison">
			{ ! value ? (
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ onStart }
				>
					{ __( 'Compare colors', 'wunderpaint' ) }
				</button>
			) : (
				<>
					<div
						className="color-compare-slots"
						role="group"
						aria-label={ __( 'Color variants', 'wunderpaint' ) }
					>
						{ [ __( 'Original', 'wunderpaint' ), 'A', 'B' ].map(
							( label, i ) => (
								<button
									type="button"
									key={ i }
									className="ai-btn secondary sm"
									aria-pressed={ value.index === i }
									onClick={ () => onChoose( i ) }
								>
									<span className="color-compare-chip">
										<i
											style={ {
												background: value.colors[ i ],
											} }
										/>
									</span>
									{ label }
								</button>
							)
						) }
					</div>
					<p className="color-panel-note">
						{ __(
							'Adjust A and B with the color controls above. Only Apply keeps the change.',
							'wunderpaint'
						) }
					</p>
					<div className="color-panel-actions">
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => onApply( color ) }
						>
							{ __( 'Apply', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ onCancel }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
					</div>
				</>
			) }
		</div>
	);
}
