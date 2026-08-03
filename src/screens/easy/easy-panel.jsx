/**
 * Easy Mode panel (v1.166.0): ONE guided panel instead of the pro
 * panel stack. Cards follow the selection - design basics when nothing
 * is selected, text/shape/image essentials otherwise - plus one-click
 * filters (reused from the pro Effects panel), quick effects, AI
 * (generate, sketch-to-image, remove background, style presets),
 * extension studios and a mini layer list. Everything routes through
 * the same ops as the full editor: documents stay 100% compatible.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../../icons';
import * as Ops from '../../store/ops';
import { useEditor } from '../../store/editor-context';
import { PanelSection } from '../../components/panel-section';
import { LayerThumb } from '../../components/layer-thumb';
import { SwatchButton } from '../../components/color-popover';
import { StyleButton } from '../../components/style-picker';
import {
	FiltersSection,
	EffectsSection,
	TextEffectsSection,
	TextStylesSection,
	TextWarpSection,
} from '../panels/effects-panel';
import { PRESETS } from '../../store/constants';
import { PROVIDER_LABELS } from '../../lib/providers';
import { TEMPLATE_FONTS } from '../../lib/ai-templates';
import { ensureFontsForLayers } from '../../lib/font-manager';
import {
	listExtensionGenerators,
	subscribeExtensions,
} from '../../lib/extensions';
import { resizeCanvasDoc } from '../../store/doc-ops';
import { aiGenerate, aiFromSketch, aiRemoveBg } from '../../lib/ai-actions';

const Row = ( { label, children } ) => (
	<div className="ed-easy-row">
		<span>{ label }</span>
		<div>{ children }</div>
	</div>
);

/** Card title with a leading icon (scannable, Canva-style). */
const cardTitle = ( icon, label ) => (
	<>
		<span className="ed-easy-card-icon">
			{ I[ icon ] ? I[ icon ]( { size: 14 } ) : null }
		</span>
		{ label }
	</>
);

function DesignCard( { editor, extras } ) {
	const { state, dispatch, commit } = editor;
	const sizes = PRESETS.flatMap( ( g ) => g.items )
		.filter( ( p ) => p.w && p.h )
		.slice( 0, 6 );
	return (
		<PanelSection
			title={ cardTitle( 'palette', __( 'Design', 'wunderpaint' ) ) }
		>
			<Row label={ __( 'Background', 'wunderpaint' ) }>
				<SwatchButton
					size={ 24 }
					color={
						'transparent' === state.doc.bg
							? '#ffffff'
							: state.doc.bg
					}
					title={ __( 'Background', 'wunderpaint' ) }
					onChange={ ( c ) => {
						dispatch( { type: 'SET_DOC', doc: { bg: c } } );
						commit( __( 'Background color', 'wunderpaint' ) );
					} }
				/>
			</Row>
			<Row label={ __( 'Size', 'wunderpaint' ) }>
				<select
					className="dsm-select"
					value=""
					onChange={ ( e ) => {
						const p = sizes.find(
							( s ) => s.id === e.target.value
						);
						if ( p ) {
							resizeCanvasDoc( editor, p.w, p.h );
							commit( __( 'Canvas Size', 'wunderpaint' ) );
						}
					} }
				>
					<option value="">
						{ `${ state.doc.w } × ${ state.doc.h }` }
					</option>
					{ sizes.map( ( p ) => (
						<option key={ p.id } value={ p.id }>
							{ `${ p.label } (${ p.w }×${ p.h })` }
						</option>
					) ) }
				</select>
			</Row>
			<button
				className="ai-btn secondary ed-easy-wide"
				onClick={ () => extras.openLibrary( 'designs' ) }
			>
				{ __( 'My designs & templates', 'wunderpaint' ) }
			</button>
		</PanelSection>
	);
}

function TextCard( { editor, layer } ) {
	const { dispatch, commit } = editor;
	const up = ( patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( label );
	};
	const setFont = async ( fontFamily ) => {
		try {
			await ensureFontsForLayers( [
				{ type: 'text', fontFamily, weight: layer.weight || 400 },
			] );
		} catch ( e ) {
			// Fallback face until the font arrives.
		}
		up( { fontFamily }, __( 'Edit text style', 'wunderpaint' ) );
	};
	const bold = ( layer.weight || 400 ) >= 700;
	return (
		<PanelSection
			title={ cardTitle( 'text', __( 'Text', 'wunderpaint' ) ) }
		>
			<Row label={ __( 'Font', 'wunderpaint' ) }>
				<select
					className="dsm-select"
					value={
						TEMPLATE_FONTS.includes( layer.fontFamily )
							? layer.fontFamily
							: ''
					}
					onChange={ ( e ) =>
						e.target.value && setFont( e.target.value )
					}
				>
					{ ! TEMPLATE_FONTS.includes( layer.fontFamily ) && (
						<option value="">{ layer.fontFamily }</option>
					) }
					{ TEMPLATE_FONTS.map( ( f ) => (
						<option key={ f } value={ f }>
							{ f }
						</option>
					) ) }
				</select>
			</Row>
			<Row label={ __( 'Size', 'wunderpaint' ) }>
				<input
					type="number"
					min="6"
					className="ed-easy-num"
					value={ Math.round( layer.fontSize || 48 ) }
					onChange={ ( e ) =>
						up(
							{ fontSize: Math.max( 6, +e.target.value || 6 ) },
							__( 'Edit text style', 'wunderpaint' )
						)
					}
				/>
				<SwatchButton
					size={ 24 }
					color={ layer.color }
					title={ __( 'Color', 'wunderpaint' ) }
					onChange={ ( c ) =>
						up( { color: c }, __( 'Change color', 'wunderpaint' ) )
					}
				/>
				<button
					className={ 'ed-easy-chip' + ( bold ? ' active' : '' ) }
					title={ __( 'Bold', 'wunderpaint' ) }
					onClick={ () =>
						up(
							{ weight: bold ? 400 : 700 },
							__( 'Edit text style', 'wunderpaint' )
						)
					}
				>
					{ I.bold( { size: 13 } ) }
				</button>
				<button
					className={
						'ed-easy-chip' + ( layer.italic ? ' active' : '' )
					}
					title={ __( 'Italic', 'wunderpaint' ) }
					onClick={ () =>
						up(
							{ italic: ! layer.italic },
							__( 'Edit text style', 'wunderpaint' )
						)
					}
				>
					{ I.italic( { size: 13 } ) }
				</button>
			</Row>
		</PanelSection>
	);
}

function ShapeCard( { editor, layer } ) {
	const { dispatch, commit } = editor;
	const up = ( patch, label ) => {
		dispatch( { type: 'UPDATE_LAYER', id: layer.id, patch } );
		commit( label );
	};
	return (
		<PanelSection
			title={ cardTitle( 'shape', __( 'Shape', 'wunderpaint' ) ) }
		>
			<Row label={ __( 'Color', 'wunderpaint' ) }>
				<SwatchButton
					size={ 24 }
					color={ layer.fill }
					title={ __( 'Color', 'wunderpaint' ) }
					onChange={ ( c ) =>
						up( { fill: c }, __( 'Change color', 'wunderpaint' ) )
					}
				/>
				{ 'rect' === layer.shape && ! layer.pathD && (
					<>
						<span className="ed-easy-sub">
							{ __( 'Corners', 'wunderpaint' ) }
						</span>
						<input
							type="range"
							min="0"
							max="120"
							value={
								// The corners may differ since v1.367 (the
								// on-canvas grips); one slider shows the
								// largest and levels them again.
								Array.isArray( layer.radius )
									? Math.max(
											...layer.radius.map(
												( v ) => v || 0
											)
									  )
									: layer.radius || 0
							}
							onChange={ ( e ) =>
								up(
									{ radius: +e.target.value },
									__( 'Edit shape', 'wunderpaint' )
								)
							}
						/>
					</>
				) }
			</Row>
		</PanelSection>
	);
}

function ImageCard( { editor, extras, layer } ) {
	const [ busy, setBusy ] = useState( false );
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
		<PanelSection
			title={ cardTitle( 'image', __( 'Image', 'wunderpaint' ) ) }
		>
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
		</PanelSection>
	);
}

function OpacityRow( { editor, layer } ) {
	const { dispatch, commit } = editor;
	return (
		<Row label={ __( 'Opacity', 'wunderpaint' ) }>
			<input
				type="range"
				min="5"
				max="100"
				value={ Math.round( ( layer.opacity ?? 1 ) * 100 ) }
				onChange={ ( e ) =>
					dispatch( {
						type: 'UPDATE_LAYER',
						id: layer.id,
						patch: { opacity: +e.target.value / 100 },
					} )
				}
				onMouseUp={ () =>
					commit( __( 'Change opacity', 'wunderpaint' ) )
				}
			/>
		</Row>
	);
}

function AiCard( { editor, extras } ) {
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
		<PanelSection
			title={ cardTitle( 'sparkAI', __( 'AI Magic', 'wunderpaint' ) ) }
		>
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

function ExtensionsCard( { editor, extras } ) {
	const [ , bump ] = useState( 0 );
	useEffect( () => subscribeExtensions( () => bump( ( t ) => t + 1 ) ), [] );
	const gens = listExtensionGenerators();
	if ( ! gens.length ) {
		return null;
	}
	return (
		<PanelSection
			title={ cardTitle( 'puzzle', __( 'Tools', 'wunderpaint' ) ) }
		>
			<div className="ed-easy-chips">
				{ gens.map( ( gen ) => (
					<button
						key={ gen.id }
						className="ed-easy-chip"
						onClick={ () => gen.run( { editor, extras } ) }
					>
						{ gen.label }
					</button>
				) ) }
			</div>
		</PanelSection>
	);
}

function LayersCard( { editor } ) {
	const { state, dispatch, commit } = editor;
	const [ dragId, setDragId ] = useState( null );
	const [ overId, setOverId ] = useState( null );
	const [ openGroups, setOpenGroups ] = useState( () => new Set() );
	const roots = state.layers.filter( ( l ) => ! l.parent ).reverse();
	if ( ! roots.length ) {
		return null;
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
		<PanelSection
			title={ cardTitle( 'layers', __( 'Elements', 'wunderpaint' ) ) }
		>
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
									: I.chevRight )( { size: 12 } ) }
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

export function EasyPanel( { extras } ) {
	const editor = useEditor();
	const { state } = editor;
	const layer = state.layers.find( ( l ) => l.id === state.activeId ) || null;
	const isImage =
		layer && [ 'image', 'raster', 'smart' ].includes( layer.type );

	return (
		<div className="ed-right ed-easy-panel">
			<div className="ed-easy-body">
				{ /* Context first: what you clicked. Elements and Studios
				     stay put below, Canva-style (v1.166.1). */ }
				{ ! layer && (
					<DesignCard editor={ editor } extras={ extras } />
				) }
				{ layer && 'text' === layer.type && (
					<TextCard editor={ editor } layer={ layer } />
				) }
				{ layer && 'shape' === layer.type && (
					<ShapeCard editor={ editor } layer={ layer } />
				) }
				{ isImage && (
					<ImageCard
						editor={ editor }
						extras={ extras }
						layer={ layer }
					/>
				) }
				{ layer && 'group' !== layer.type && (
					<PanelSection
						title={ cardTitle(
							'sliders',
							__( 'Look', 'wunderpaint' )
						) }
					>
						<OpacityRow editor={ editor } layer={ layer } />
					</PanelSection>
				) }
				{ /* The real effect PREVIEW CARDS from the pro panel - click
				     a rendered thumbnail to apply. Beginners want to see the
				     result, not read a pill label (v1.174.0). */ }
				{ layer && 'text' === layer.type && (
					<>
						<TextStylesSection
							editor={ editor }
							layer={ layer }
							state={ state }
						/>
						<TextEffectsSection
							editor={ editor }
							layer={ layer }
							state={ state }
						/>
						<TextWarpSection
							editor={ editor }
							layer={ layer }
							state={ state }
						/>
					</>
				) }
				{ layer &&
					'group' !== layer.type &&
					'adjustment' !== layer.type && (
						<>
							<FiltersSection
								editor={ editor }
								layer={ layer }
								state={ state }
							/>
							<EffectsSection
								editor={ editor }
								layer={ layer }
								state={ state }
								extras={ extras }
							/>
						</>
					) }
				<LayersCard editor={ editor } />
				<AiCard editor={ editor } extras={ extras } />
				<ExtensionsCard editor={ editor } extras={ extras } />
			</div>
		</div>
	);
}
