import { strokeSettings, strokeSettingsPatch } from '../../lib/layer-paint';
import { PaintSwatch } from '../../components/paint-controls';
/** Essential Easy controls reuse the editor's fields, operations and layer list. */
import { useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { I } from '../../icons';
import * as Ops from '../../store/ops';
import { PanelSection } from '../../components/panel-section';
import { LayerThumb } from '../../components/layer-thumb';
import { SwatchButton } from '../../components/color-popover';
import { FontPicker } from '../../components/font-picker';
import { useSelectionStyle } from '../../components/use-selection-style';
import { TextContentInput } from '../panels/text-content-input';
import { StyleButton } from '../../components/style-picker';
import { defaultAdjustments } from '../../store/document';
import { PROVIDER_LABELS } from '../../lib/providers';
import { ensureFontsForLayers } from '../../lib/font-manager';
import { aiGenerate, aiFromSketch, aiRemoveBg } from '../../lib/ai-actions';
import { EasySlider } from './easy-tools';

const Row = ( { label, children } ) => (
	<div className="ed-easy-row">
		<span>{ label }</span>
		<div>{ children }</div>
	</div>
);

export function DesignBar( { editor, extras } ) {
	const { state, dispatch, commit } = editor;
	return (
		<footer
			className="ed-easy-designbar"
			aria-label={ __( 'Design', 'wunderpaint' ) }
		>
			<SwatchButton
				color={ state.doc.bg }
				size={ 23 }
				title={ __( 'Background', 'wunderpaint' ) }
				onChange={ ( bg ) => {
					dispatch( { type: 'SET_DOC', doc: { bg } } );
					commit( __( 'Background color', 'wunderpaint' ) );
				} }
			/>
			<span className="ed-easy-dimensions">
				{ state.doc.w } × { state.doc.h } <small>px</small>
			</span>
			<button
				type="button"
				className="ai-btn secondary sm"
				onClick={ () => extras.openResize( 'canvas' ) }
			>
				{ I.move( { size: 15 } ) }
				{ __( 'Change Size', 'wunderpaint' ) }
			</button>
		</footer>
	);
}

export function TextCard( { editor, extras, layer } ) {
	const { dispatch, commit } = editor;
	const selection = useSelectionStyle( extras );
	const styleKeys = {
		fontFamily: 'family',
		fontSize: 'size',
		weight: 'weight',
		italic: 'italic',
		color: 'color',
	};
	const up = ( patch ) => {
		const session = extras?.richText?.current;
		const keys = Object.keys( patch );
		if (
			session?.layerId === layer.id &&
			keys.every( ( key ) => styleKeys[ key ] )
		) {
			session.applyStyle(
				Object.fromEntries(
					keys.map( ( key ) => [ styleKeys[ key ], patch[ key ] ] )
				)
			);
			return;
		}
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( __( 'Edit text style', 'wunderpaint' ) );
	};
	const eff = {
		fontFamily: selection?.family ?? layer.fontFamily,
		fontSize: selection?.size ?? layer.fontSize,
		weight: selection?.weight ?? layer.weight,
		italic: selection ? !! selection.italic : !! layer.italic,
		color: selection?.color ?? layer.color,
	};
	const setFont = async ( fontFamily ) => {
		try {
			await ensureFontsForLayers( [
				{ type: 'text', fontFamily, weight: eff.weight || 400 },
			] );
		} catch ( error ) {
			/* The renderer retains its font fallback. */
		}
		up( { fontFamily } );
	};
	return (
		<PanelSection title={ __( 'Text', 'wunderpaint' ) }>
			<TextContentInput
				layer={ layer }
				extras={ extras }
				onChange={ ( text ) => up( { text } ) }
			/>
			<Row label={ __( 'Font', 'wunderpaint' ) }>
				<FontPicker
					width="100%"
					value={ eff.fontFamily }
					onChange={ setFont }
				/>
			</Row>
			<Row label={ __( 'Size', 'wunderpaint' ) }>
				<input
					type="number"
					className="ed-easy-num"
					aria-label={ __( 'Font size', 'wunderpaint' ) }
					min="4"
					max="800"
					step="1"
					disabled={ !! layer.textFit }
					value={ Math.round( eff.fontSize || 48 ) }
					onChange={ ( e ) =>
						up( {
							fontSize: Math.max(
								4,
								Math.min( 800, +e.target.value || 4 )
							),
						} )
					}
				/>
				<div className="dsm-seg">
					<button
						type="button"
						title={ __( 'Bold', 'wunderpaint' ) }
						aria-label={ __( 'Bold', 'wunderpaint' ) }
						aria-pressed={ eff.weight >= 700 }
						onClick={ () =>
							up( { weight: eff.weight >= 700 ? 400 : 700 } )
						}
					>
						{ I.bold( { size: 15 } ) }
					</button>
					<button
						type="button"
						title={ __( 'Italic', 'wunderpaint' ) }
						aria-label={ __( 'Italic', 'wunderpaint' ) }
						aria-pressed={ eff.italic }
						onClick={ () => up( { italic: ! eff.italic } ) }
					>
						{ I.italic( { size: 15 } ) }
					</button>
				</div>
			</Row>
			{ !! layer.textFit && (
				<p className="ed-easy-hint-text">
					{ __(
						'Fluid Text fits the font size to its frame.',
						'wunderpaint'
					) }
				</p>
			) }
			<Row label={ __( 'Color', 'wunderpaint' ) }>
				<PaintSwatch
					layer={ layer }
					title={ __( 'Text fill', 'wunderpaint' ) }
					onChange={ up }
				/>
			</Row>
			<Row label={ __( 'Alignment', 'wunderpaint' ) }>
				<div className="dsm-seg">
					{ [
						[ 'left', 'alignL', __( 'Left', 'wunderpaint' ) ],
						[ 'center', 'alignC', __( 'Center', 'wunderpaint' ) ],
						[ 'right', 'alignR', __( 'Right', 'wunderpaint' ) ],
					].map( ( [ align, icon, label ] ) => (
						<button
							key={ align }
							type="button"
							title={ label }
							aria-label={ label }
							aria-pressed={ ( layer.align || 'left' ) === align }
							onClick={ () => up( { align } ) }
						>
							{ I[ icon ]( { size: 16 } ) }
						</button>
					) ) }
				</div>
			</Row>
			<OpacityRow editor={ editor } layer={ layer } />
		</PanelSection>
	);
}

export function OpacityRow( { editor, layer } ) {
	return (
		<EasySlider
			label={ __( 'Opacity', 'wunderpaint' ) }
			value={ Math.round( ( layer.opacity ?? 1 ) * 100 ) }
			def={ 100 }
			suffix="%"
			onChange={ ( value ) =>
				editor.dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: { opacity: value / 100 },
				} )
			}
			onCommit={ () =>
				editor.commit( __( 'Change opacity', 'wunderpaint' ) )
			}
		/>
	);
}

export function ShapeCard( { editor, extras, layer } ) {
	const { dispatch, commit } = editor;
	const change = ( patch ) =>
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
	const save = () => commit( __( 'Edit shape', 'wunderpaint' ) );
	const up = ( patch ) => {
		change( patch );
		save();
	};
	const radius = Array.isArray( layer.radius )
		? Math.max( ...layer.radius.map( ( v ) => v || 0 ) )
		: layer.radius || 0;
	return (
		<PanelSection
			title={ __( 'Shape', 'wunderpaint' ) }
			right={
				! layer.penPath && (
					<button
						type="button"
						className="icon-btn"
						title={ __( 'Edit', 'wunderpaint' ) }
						aria-label={ __( 'Edit', 'wunderpaint' ) }
						onClick={ ( event ) => {
							event.stopPropagation();
							extras.openShapeStudioModal( layer.id );
						} }
						onKeyDown={ ( event ) => event.stopPropagation() }
					>
						{ I.pencil( { size: 15 } ) }
					</button>
				)
			}
		>
			{ layer.shape !== 'line' && (
				<Row label={ __( 'Fill', 'wunderpaint' ) }>
					<PaintSwatch
						layer={ layer }
						title={ __( 'Fill', 'wunderpaint' ) }
						onChange={ up }
					/>
				</Row>
			) }
			<Row label={ __( 'Stroke', 'wunderpaint' ) }>
				<PaintSwatch
					layer={ layer }
					target="stroke"
					title={ __( 'Stroke', 'wunderpaint' ) }
					onChange={ up }
				/>
			</Row>
			<EasySlider
				label={ __( 'Stroke width', 'wunderpaint' ) }
				value={ strokeSettings( layer ).size }
				max={ Math.max( 120, strokeSettings( layer ).size ) }
				suffix="px"
				onChange={ ( strokeW ) =>
					change( {
						...strokeSettingsPatch( layer, { size: strokeW } ),
						...( strokeW && ! layer.stroke
							? { stroke: '#000000' }
							: {} ),
					} )
				}
				onCommit={ save }
			/>
			{ layer.shape !== 'line' && (
				<Row label={ __( 'Position', 'wunderpaint' ) }>
					<select
						aria-label={ __( 'Stroke position', 'wunderpaint' ) }
						value={ strokeSettings( layer ).position }
						onChange={ ( e ) =>
							up( {
								strokeAlign:
									e.target.value === 'center'
										? null
										: e.target.value,
							} )
						}
					>
						<option value="center">
							{ __( 'Center', 'wunderpaint' ) }
						</option>
						<option value="inside">
							{ __( 'Inside', 'wunderpaint' ) }
						</option>
						<option value="outside">
							{ __( 'Outside', 'wunderpaint' ) }
						</option>
					</select>
				</Row>
			) }
			{ layer.shape === 'rect' && ! layer.pathD && (
				<EasySlider
					label={ __( 'Corners', 'wunderpaint' ) }
					value={ radius }
					max={ Math.max( 120, radius ) }
					suffix="px"
					onChange={ ( value ) => change( { radius: value } ) }
					onCommit={ save }
				/>
			) }
			<OpacityRow editor={ editor } layer={ layer } />
		</PanelSection>
	);
}

export function ImageCard( { editor, extras, layer } ) {
	const [ busy, setBusy ] = useState( false );
	const adjust = layer.adjust || defaultAdjustments();
	const removeBg = async () => {
		setBusy( true );
		extras?.toasts?.toast( __( 'Removing background…', 'wunderpaint' ) );
		try {
			await aiRemoveBg( editor );
			extras?.toasts?.success(
				__( 'Background removed.', 'wunderpaint' )
			);
		} catch ( err ) {
			extras?.toasts?.error( err.message );
		}
		setBusy( false );
	};
	return (
		<PanelSection title={ __( 'Image', 'wunderpaint' ) }>
			{ [
				[ 'brightness', __( 'Brightness', 'wunderpaint' ) ],
				[ 'contrast', __( 'Contrast', 'wunderpaint' ) ],
				[ 'saturation', __( 'Saturation', 'wunderpaint' ) ],
			].map( ( [ key, label ] ) => (
				<EasySlider
					key={ key }
					label={ label }
					min={ -100 }
					max={ 100 }
					value={ adjust[ key ] || 0 }
					onChange={ ( value ) =>
						editor.dispatch( {
							type: 'UPDATE_LAYER',
							id: layer.id,
							patch: { adjust: { ...adjust, [ key ]: value } },
						} )
					}
					onCommit={ () =>
						editor.commit( __( 'Adjust image', 'wunderpaint' ) )
					}
				/>
			) ) }
			<button
				className="ai-btn secondary ed-easy-wide"
				disabled={ busy }
				onClick={ removeBg }
			>
				{ busy ? (
					<span className="spin" />
				) : (
					__( 'Remove background', 'wunderpaint' )
				) }
			</button>
			{ layer.clipped && (
				<div className="ed-easy-sub" style={ { marginTop: 6 } }>
					{ __(
						'Double-click the image to reposition it inside its shape.',
						'wunderpaint'
					) }
				</div>
			) }
			<OpacityRow editor={ editor } layer={ layer } />
		</PanelSection>
	);
}

export function AiCard( { editor, extras } ) {
	const [ prompt, setPrompt ] = useState( '' );
	const [ busy, setBusy ] = useState( null );
	const providers = Object.keys( PROVIDER_LABELS ).filter(
		( id ) => window.WPIE?.providers?.[ id ]
	);
	if ( ! providers.length ) {
		return null;
	}
	const run = async ( id, fn, needsPrompt ) => {
		if ( busy ) {
			return;
		}
		if ( needsPrompt && ! prompt.trim() ) {
			extras?.toasts?.error(
				__( 'Describe your idea in the box first.', 'wunderpaint' )
			);
			return;
		}
		setBusy( id );
		try {
			await fn();
		} catch ( err ) {
			extras?.toasts?.error( err.message );
		}
		setBusy( null );
	};
	return (
		<PanelSection title={ __( 'AI Magic', 'wunderpaint' ) }>
			<div className="ed-easy-ai-style">
				<StyleButton
					value={ prompt }
					onChange={ ( v ) => setPrompt( v ) }
				/>
			</div>
			<textarea
				className="ed-easy-prompt"
				rows={ 2 }
				placeholder={ __(
					'Describe your idea… e.g. “a cozy autumn coffee flatlay”',
					'wunderpaint'
				) }
				value={ prompt }
				onChange={ ( e ) => setPrompt( e.target.value ) }
			/>
			<div className="ed-easy-ai-actions">
				<button
					className="ai-btn primary"
					disabled={ !! busy || ! prompt.trim() }
					onClick={ () =>
						run(
							'gen',
							() =>
								aiGenerate( editor, {
									prompt,
									provider: providers[ 0 ],
								} ),
							true
						)
					}
				>
					{ 'gen' === busy ? (
						<span className="spin" />
					) : (
						I.sparkAI( { size: 13 } )
					) }
					{ __( 'Create Image', 'wunderpaint' ) }
				</button>
				<button
					className="ai-btn secondary"
					disabled={ !! busy || ! prompt.trim() }
					title={ __(
						'Draw a rough sketch with the Draw tool, describe it, and the AI turns it into a real picture.',
						'wunderpaint'
					) }
					onClick={ () =>
						run(
							'sketch',
							() =>
								aiFromSketch( editor, {
									prompt,
									provider: providers[ 0 ],
								} ),
							false
						)
					}
				>
					{ 'sketch' === busy ? (
						<span className="spin" />
					) : (
						I.wand( { size: 13 } )
					) }
					{ __( 'Sketch to Image', 'wunderpaint' ) }
				</button>
			</div>
		</PanelSection>
	);
}

export function LayersCard( { editor } ) {
	const { state, dispatch, commit } = editor;
	const [ dragId, setDragId ] = useState( null );
	const [ overId, setOverId ] = useState( null );
	const [ openGroups, setOpenGroups ] = useState( () => new Set() );
	const roots = state.layers.filter( ( l ) => ! l.parent ).reverse();
	if ( ! roots.length ) {
		return (
			<p className="ed-easy-empty">
				{ __(
					'Add an image, text or shape to get started.',
					'wunderpaint'
				) }
			</p>
		);
	}
	// Group members show indented under their group (one level is
	// plenty for easy mode) - but only when the group is unfolded:
	// many groups must not flood the list. Only whole units reorder.
	const rows = roots.flatMap( ( r ) => [
		{ layer: r, depth: 0 },
		...( 'group' === r.type && openGroups.has( r.id )
			? state.layers
					.filter( ( l ) => l.parent === r.id )
					.reverse()
					.map( ( k ) => ( { layer: k, depth: 1 } ) )
			: [] ),
	] );
	const toggleGroup = ( id ) =>
		setOpenGroups( ( cur ) => {
			const next = new Set( cur );
			if ( next.has( id ) ) {
				next.delete( id );
			} else {
				next.add( id );
			}
			return next;
		} );
	const nameOf = ( l ) =>
		l.name ||
		( 'text' === l.type ? l.text : l.type ) ||
		__( 'Layer', 'wunderpaint' );
	// Drop takes the target's visual slot (standard sortable feel). The
	// visual list is top-first = reversed flat order, so "above the
	// target" means AFTER it in the array.
	const dropOn = ( targetId ) => {
		setOverId( null );
		if ( ! dragId || dragId === targetId ) {
			return;
		}
		const rest = state.layers.filter( ( l ) => l.id !== dragId );
		const t = rest.findIndex( ( l ) => l.id === targetId );
		if ( t < 0 ) {
			return;
		}
		const vis = roots.map( ( r ) => r.id );
		const goingDown = vis.indexOf( dragId ) < vis.indexOf( targetId );
		dispatch( {
			type: 'REORDER',
			id: dragId,
			toIndex: goingDown ? t : t + 1,
			parent: null,
		} );
		commit( __( 'Reorder layers', 'wunderpaint' ) );
	};
	return (
		<PanelSection title={ __( 'Elements', 'wunderpaint' ) }>
			<div className="ed-easy-layers">
				{ rows.map( ( { layer: l, depth } ) => (
					<div
						key={ l.id }
						draggable={ 0 === depth && ! l.locked }
						className={
							'ed-easy-layer' +
							( state.activeId === l.id ? ' active' : '' ) +
							( 0 === depth && overId === l.id && dragId !== l.id
								? ' drop'
								: '' ) +
							( depth ? ' is-child' : '' )
						}
						onDragStart={
							depth
								? undefined
								: ( e ) => {
										setDragId( l.id );
										e.dataTransfer.effectAllowed = 'move';
										try {
											e.dataTransfer.setData(
												'text/plain',
												l.id
											);
										} catch ( err ) {
											// setData is optional here.
										}
								  }
						}
						onDragEnd={ () => {
							setDragId( null );
							setOverId( null );
						} }
						onDragOver={
							depth
								? undefined
								: ( e ) => {
										e.preventDefault();
										setOverId( l.id );
								  }
						}
						onDragLeave={ ( e ) => {
							// Child elements fire dragleave too; only a
							// real exit clears the marker (v1.364.0).
							if (
								e.relatedTarget &&
								e.currentTarget.contains( e.relatedTarget )
							) {
								return;
							}
							setOverId( ( cur ) =>
								cur === l.id ? null : cur
							);
						} }
						onDrop={
							depth
								? undefined
								: ( e ) => {
										e.preventDefault();
										dropOn( l.id );
								  }
						}
					>
						{ 'group' === l.type && (
							<button
								className="ed-easy-layer-chev"
								title={ __(
									'Show group contents',
									'wunderpaint'
								) }
								aria-expanded={ openGroups.has( l.id ) }
								onClick={ () => toggleGroup( l.id ) }
							>
								{ ( openGroups.has( l.id )
									? I.chevDown
									: I.chevRight )( {
									size: 12,
								} ) }
							</button>
						) }
						<button
							className="ed-easy-layer-main"
							onClick={ () =>
								dispatch( { type: 'SET_ACTIVE', id: l.id } )
							}
						>
							<span className="ed-easy-thumb">
								<LayerThumb layer={ l } doc={ state.doc } />
							</span>
							<span className="ed-easy-layer-name">
								{ nameOf( l ) }
							</span>
						</button>
						{ ( state.activeId === l.id || l.locked ) && (
							<button
								className={
									'ed-easy-layer-del' +
									( l.locked ? ' is-locked' : '' )
								}
								title={
									l.locked
										? __( 'Unlock layer', 'wunderpaint' )
										: __( 'Lock layer', 'wunderpaint' )
								}
								onClick={ () => {
									dispatch( {
										type: 'UPDATE_LAYER',
										id: l.id,
										patch: { locked: ! l.locked },
									} );
									commit(
										l.locked
											? __(
													'Unlock layer',
													'wunderpaint'
											  )
											: __( 'Lock layer', 'wunderpaint' )
									);
								} }
							>
								{ ( l.locked ? I.lock : I.unlock )( {
									size: 12,
								} ) }
							</button>
						) }
						{ state.activeId === l.id && ! l.locked && (
							<button
								className="ed-easy-layer-del"
								title={ __( 'Delete (⌫)', 'wunderpaint' ) }
								onClick={ () => Ops.deleteLayers( editor ) }
							>
								{ I.trash( { size: 12 } ) }
							</button>
						) }
					</div>
				) ) }
			</div>
			<div className="ed-easy-sub" style={ { marginTop: 4 } }>
				{ __( 'Drag to change what lies in front.', 'wunderpaint' ) }
			</div>
		</PanelSection>
	);
}
