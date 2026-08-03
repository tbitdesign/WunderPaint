/**
 * Layers panel (spec 06.1): blend/opacity, reorderable list with groups,
 * masks, clipping indicators, rename, lock, visibility, context menu,
 * bottom toolbar. Mask chip selects the mask as the paint target.
 */

import { useState, useRef, useEffect, Fragment } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../../icons';
import { getExtensionGenerator } from '../../lib/extensions';
import { refreshGeneratorLayer } from '../../lib/generator-resolve';
import { BlendModeSelect } from '../../components/blend-select';
import { useEditor, activeLayerOf } from '../../store/editor-context';
import { LayerThumb } from '../../components/layer-thumb';
import * as Ops from '../../store/ops';
import { captureComp, applyComp } from '../../lib/comps';
import { bindingLabel } from '../../lib/dynamic-content';
import { promptDialog } from '../../lib/dialogs';
import { insertImageAtRow } from '../../lib/asset-insert';
import { ASSET_MIME } from '../library-tray';

/** Is this drag something an image drop could use? Types only (v1.364.0). */
const isImageDrag = ( e ) => {
	const types = Array.from( e.dataTransfer?.types || [] );
	return types.includes( 'Files' ) || types.includes( ASSET_MIME + '-image' );
};

/** The insertable image payload of a drop ({file} | {asset}), or null. */
const dropImageSource = ( e ) => {
	const file = Array.from( e.dataTransfer?.files || [] ).find( ( f ) =>
		f.type.startsWith( 'image/' )
	);
	if ( file && 'image/vnd.adobe.photoshop' !== file.type ) {
		return { file };
	}
	try {
		const asset = JSON.parse(
			e.dataTransfer?.getData( ASSET_MIME ) || 'null'
		);
		if ( asset && [ 'photo', 'upload' ].includes( asset.kind ) ) {
			return { asset };
		}
	} catch ( err ) {}
	return null;
};

/** Build the display list: top-first, group children indented. */
function displayList( layers ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const out = [];
	const pushLayer = ( layer, depth ) => {
		out.push( { layer, depth } );
		if ( 'group' === layer.type && layer.isOpen ) {
			const children = ( layer.children || [] )
				.map( ( id ) => byId.get( id ) )
				.filter( Boolean )
				// Children keep flat-array (paint) order → display top-first.
				.sort( ( a, b ) => layers.indexOf( b ) - layers.indexOf( a ) );
			for ( const child of children ) {
				pushLayer( child, depth + 1 );
			}
		}
	};
	const topLevel = layers.filter( ( l ) => ! l.parent );
	for ( let i = topLevel.length - 1; i >= 0; i-- ) {
		pushLayer( topLevel[ i ], 0 );
	}
	return out;
}

/** Layer comps: named layout/visibility snapshots on the doc (v1.1). */
function CompsSection() {
	const { state, dispatch, commit } = useEditor();
	const comps = state.doc.comps || [];
	const [ open, setOpen ] = useState( comps.length > 0 );

	const setComps = ( list, label ) => {
		dispatch( { type: 'SET_DOC', doc: { comps: list } } );
		commit( label );
	};

	return (
		<div className="comps-section">
			<button
				className="comps-head"
				onClick={ () => setOpen( ! open ) }
				aria-expanded={ open }
			>
				{ open ? '▾' : '▸' } { __( 'Layer Comps', 'wunderpaint' ) }
				{ comps.length > 0 && ` (${ comps.length })` }
				<span style={ { flex: 1 } } />
				<span
					role="button"
					tabIndex={ 0 }
					className="comps-add"
					title={ __(
						'Save current state as layer comp',
						'wunderpaint'
					) }
					onKeyDown={ () => {} }
					onClick={ async ( e ) => {
						e.stopPropagation();
						const name = await promptDialog( {
							title: __( 'Save Layer Comp', 'wunderpaint' ),
							label: __( 'Name', 'wunderpaint' ),
							defaultValue: sprintfCompName( comps.length ),
						} );
						if ( name ) {
							setComps(
								[ ...comps, captureComp( name, state.layers ) ],
								__( 'Save layer comp', 'wunderpaint' )
							);
							setOpen( true );
						}
					} }
				>
					＋
				</span>
			</button>
			{ open &&
				comps.map( ( comp ) => (
					<div key={ comp.id } className="comps-row">
						<button
							className="comps-apply"
							title={ __(
								'Apply this layer comp',
								'wunderpaint'
							) }
							onClick={ () => {
								dispatch( {
									type: 'SET_LAYERS',
									layers: applyComp( state.layers, comp ),
								} );
								commit(
									__( 'Apply layer comp', 'wunderpaint' )
								);
							} }
						>
							{ comp.name }
						</button>
						<button
							className="comps-mini"
							title={ __(
								'Update layer comp to current state',
								'wunderpaint'
							) }
							aria-label={ __(
								'Update layer comp to current state',
								'wunderpaint'
							) }
							onClick={ () =>
								setComps(
									comps.map( ( c ) =>
										c.id === comp.id
											? {
													...captureComp(
														c.name,
														state.layers
													),
													id: c.id,
											  }
											: c
									),
									__( 'Update layer comp', 'wunderpaint' )
								)
							}
						>
							↻
						</button>
						<button
							className="comps-mini"
							title={ __( 'Delete layer comp', 'wunderpaint' ) }
							aria-label={ __(
								'Delete layer comp',
								'wunderpaint'
							) }
							onClick={ () =>
								setComps(
									comps.filter( ( c ) => c.id !== comp.id ),
									__( 'Delete layer comp', 'wunderpaint' )
								)
							}
						>
							×
						</button>
					</div>
				) ) }
		</div>
	);
}

const sprintfCompName = ( n ) => `Layer Comp ${ n + 1 }`;

export function LayersPanel( { extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const active = activeLayerOf( state );
	const [ renaming, setRenaming ] = useState( null );
	const [ menu, setMenu ] = useState( null );
	useEffect( () => {
		if ( ! menu ) {
			return;
		}
		const closer = ( e ) => {
			if ( ! e.target.closest?.( '.ctx-menu' ) ) {
				setMenu( null );
			}
		};
		window.addEventListener( 'pointerdown', closer, true );
		return () => window.removeEventListener( 'pointerdown', closer, true );
	}, [ menu ] ); // { x, y, layerId }
	const [ dropTarget, setDropTarget ] = useState( null ); // { id, mode: 'above'|'below'|'into' }
	const dragId = useRef( null );

	const [ layerQuery, setLayerQuery ] = useState( '' );
	const allRows = displayList( state.layers );
	const rows = layerQuery.trim()
		? allRows.filter( ( { layer } ) =>
				( layer.name || '' )
					.toLowerCase()
					.includes( layerQuery.trim().toLowerCase() )
		  )
		: allRows;

	const update = ( id, patch ) =>
		dispatch( { type: 'UPDATE_LAYER', id, patch } );

	/* ------------------------------ reorder ----------------------------- */

	const onDrop = ( targetRow ) => {
		const sourceId = dragId.current;
		dragId.current = null;
		setDropTarget( null );
		if ( ! sourceId || ! targetRow || sourceId === targetRow.layer.id ) {
			return;
		}
		const target = targetRow.layer;
		const mode = targetRow.mode;
		const flatIndex = ( id ) =>
			state.layers.findIndex( ( l ) => l.id === id );

		if ( 'into' === mode && 'group' === target.type ) {
			dispatch( {
				type: 'REORDER',
				id: sourceId,
				toIndex: flatIndex( target.id ),
				parent: target.id,
			} );
		} else {
			// Above in UI = later in paint order.
			const targetIdx = flatIndex( target.id );
			const sourceIdx = flatIndex( sourceId );
			let to = 'above' === mode ? targetIdx + 1 : targetIdx;
			if ( sourceIdx < targetIdx ) {
				to -= 1;
			}
			dispatch( {
				type: 'REORDER',
				id: sourceId,
				toIndex: to,
				parent: target.parent || null,
			} );
		}
		commit( __( 'Reorder layers', 'wunderpaint' ) );
	};

	/* ---------------------------- context menu --------------------------- */

	const LABEL_COLORS = [
		'#e5484d',
		'#f76b15',
		'#ffc53d',
		'#46a758',
		'#0090ff',
		'#8e4ec6',
	];
	const contextItems = ( layer ) => [
		{
			label: __( 'Label', 'wunderpaint' ),
			colors: [ ...LABEL_COLORS, null ],
			run: () => {},
		},
		{ divider: true },
		...( layer.qr
			? [
					{
						icon: 'qr',
						label: __( 'Edit QR Code', 'wunderpaint' ),
						run: () => extras.openQr( layer.id ),
					},
			  ]
			: [] ),
		...( layer.bg
			? [
					{
						icon: 'palette',
						label: __( 'Edit Background', 'wunderpaint' ),
						run: () => extras.openBackgroundStudio( layer.id ),
					},
			  ]
			: [] ),
		...( layer.mockup
			? [
					{
						icon: 'image',
						label: __( 'Edit Mockup', 'wunderpaint' ),
						run: () => extras.openMockup( layer.id ),
					},
			  ]
			: [] ),
		...( 'smart' === layer.type
			? [
					{
						icon: 'smart',
						label: __( 'Edit Smart Object', 'wunderpaint' ),
						run: () => extras.smartObject?.editContents?.( layer ),
					},
			  ]
			: [] ),
		...( layer.chart
			? [
					{
						icon: 'sliders',
						label: String( layer.chart?.type || '' ).startsWith(
							'table'
						)
							? __( 'Edit Table', 'wunderpaint' )
							: __( 'Edit Chart', 'wunderpaint' ),
						run: () => extras.openChart( layer.id ),
					},
			  ]
			: [] ),
		// Extension-generated layers (v1.119): layer.generator = {id, params}.
		...( layer.generator && getExtensionGenerator( layer.generator.id )
			? [
					{
						icon: 'sparkles',
						label: sprintf(
							/* translators: %s: generator name. */
							__( 'Edit %s', 'wunderpaint' ),
							getExtensionGenerator( layer.generator.id ).label
						),
						run: () => {
							const gen = getExtensionGenerator(
								layer.generator.id
							);
							( gen.edit || gen.run )( {
								editor,
								extras,
								layer,
							} );
						},
					},
			  ]
			: [] ),
		// Data-bound generator groups re-pull their records in place
		// (v1.276): one click instead of Edit → Update.
		...( 'group' === layer.type &&
		layer.generator &&
		'function' ===
			typeof getExtensionGenerator( layer.generator.id )?.resolve
			? [
					{
						icon: 'refresh',
						label: sprintf(
							/* translators: %s: generator name. */
							__( 'Refresh %s', 'wunderpaint' ),
							getExtensionGenerator( layer.generator.id ).label
						),
						run: () => refreshGeneratorLayer( editor, layer ),
					},
			  ]
			: [] ),
		{
			icon: 'duplicate',
			label: __( 'Duplicate', 'wunderpaint' ),
			run: () => Ops.duplicateLayer( editor ),
		},
		{
			icon: 'layers',
			label: __( 'Merge Down', 'wunderpaint' ),
			run: () => Ops.mergeDownOp( editor ),
		},
		{
			icon: 'image',
			label: __( 'Flatten', 'wunderpaint' ),
			run: () => Ops.flattenOp( editor ),
		},
		{ divider: true },
		{
			icon: 'sparkles',
			label: __( 'Convert to Smart Object', 'wunderpaint' ),
			run: () => Ops.convertToSmartOp( editor ),
		},
		{
			icon: 'image',
			label: __( 'Rasterize', 'wunderpaint' ),
			run: () => Ops.rasterizeLayerOp( editor ),
		},
		{
			icon: 'sliders',
			label: __( 'Properties', 'wunderpaint' ),
			run: () => dispatch( { type: 'SET_RIGHT_TAB', tab: 'props' } ),
		},
		{ divider: true },
		{
			icon: 'crop',
			label: layer.clipped
				? __( 'Release Clipping Mask', 'wunderpaint' )
				: __( 'Create Clipping Mask', 'wunderpaint' ),
			run: () => Ops.clippingMaskOp( editor ),
		},
		...( layer.mask
			? [
					{
						icon: 'check',
						label: __( 'Apply Layer Mask', 'wunderpaint' ),
						run: () => Ops.applyMaskOp( editor ),
					},
					{
						icon: 'swap',
						label: __( 'Invert Layer Mask', 'wunderpaint' ),
						run: () => Ops.invertMaskOp( editor ),
					},
					{
						icon: layer.mask.enabled === false ? 'eye' : 'eyeOff',
						label:
							layer.mask.enabled === false
								? __( 'Enable Layer Mask', 'wunderpaint' )
								: __( 'Disable Layer Mask', 'wunderpaint' ),
						run: () => Ops.toggleMaskOp( editor ),
					},
					{
						icon: 'trash',
						label: __( 'Delete Layer Mask', 'wunderpaint' ),
						run: () => Ops.removeMaskOp( editor ),
					},
			  ]
			: [
					{
						icon: 'mask',
						label: __( 'Add Layer Mask', 'wunderpaint' ),
						run: () => Ops.addMaskOp( editor ),
					},
			  ] ),
		{
			icon: 'folder',
			label:
				'group' === layer.type
					? __( 'Ungroup', 'wunderpaint' )
					: __( 'Group', 'wunderpaint' ),
			run: () =>
				'group' === layer.type
					? Ops.ungroupOp( editor )
					: Ops.newGroupOp( editor ),
		},
		{ divider: true },
		{
			icon: 'trash',
			label: __( 'Delete', 'wunderpaint' ),
			danger: true,
			run: () => Ops.deleteLayers( editor ),
		},
	];

	const runMenuItem = ( item ) => {
		setMenu( null );
		try {
			item.run();
		} catch ( err ) {
			if ( err?.pending ) {
				extras.toasts.error( err.message );
			} else {
				throw err;
			}
		}
	};

	/* ------------------------------- render ------------------------------ */

	return (
		<Fragment>
			<div className="blend-opacity">
				<div
					style={ {
						display: 'grid',
						gridTemplateColumns: '1fr 1fr',
						gap: 8,
					} }
				>
					<div>
						<div
							style={ {
								fontSize: 10,
								color: 'var(--ed-text-muted)',
								textTransform: 'uppercase',
								letterSpacing: 0.5,
								marginBottom: 4,
							} }
						>
							{ __( 'Blend', 'wunderpaint' ) }
						</div>
						<BlendModeSelect
							value={ active?.blend || 'normal' }
							disabled={ ! active }
							onPreview={ ( b ) =>
								active && update( active.id, { blend: b } )
							}
							onCommit={ ( b ) => {
								if ( ! active ) {
									return;
								}
								update( active.id, { blend: b } );
								commit(
									__( 'Blend:', 'wunderpaint' ) + ' ' + b
								);
							} }
						/>
					</div>
					<div>
						<div
							style={ {
								fontSize: 10,
								color: 'var(--ed-text-muted)',
								textTransform: 'uppercase',
								letterSpacing: 0.5,
								marginBottom: 4,
							} }
						>
							{ __( 'Opacity', 'wunderpaint' ) }
						</div>
						<div
							style={ {
								display: 'flex',
								alignItems: 'center',
								gap: 6,
							} }
						>
							<input
								type="range"
								min="0"
								max="100"
								value={ Math.round(
									( active?.opacity ?? 1 ) * 100
								) }
								disabled={ ! active }
								onChange={ ( e ) =>
									update( active.id, {
										opacity: +e.target.value / 100,
									} )
								}
								onMouseUp={ () =>
									active &&
									commit(
										__( 'Layer opacity', 'wunderpaint' )
									)
								}
								style={ {
									flex: 1,
									accentColor: 'var(--accent)',
								} }
							/>
							<span
								style={ {
									fontSize: 11,
									fontFamily: 'var(--font-mono)',
									width: 34,
									textAlign: 'right',
								} }
							>
								{ Math.round( ( active?.opacity ?? 1 ) * 100 ) }
								%
							</span>
						</div>
					</div>
				</div>
			</div>

			<div className="layers-search">
				<input
					type="search"
					placeholder={ __( 'Filter layers…', 'wunderpaint' ) }
					value={ layerQuery }
					onChange={ ( e ) => setLayerQuery( e.target.value ) }
					aria-label={ __( 'Filter layers', 'wunderpaint' ) }
				/>
			</div>
			<CompsSection />
			<div
				className="layers-list"
				style={ { flex: 1, overflowY: 'auto' } }
				onDragOver={ ( e ) => {
					// The list background accepts image drops too - and
					// without preventDefault the browser would NAVIGATE to
					// a dropped file and leave the editor (v1.364.0).
					if ( isImageDrag( e ) ) {
						e.preventDefault();
					}
				} }
				onDrop={ ( e ) => {
					if ( dragId.current ) {
						return;
					}
					e.preventDefault();
					setDropTarget( null );
					const source = dropImageSource( e );
					if ( source ) {
						insertImageAtRow( editor, extras, source, null );
					}
				} }
			>
				{ rows.map( ( { layer, depth } ) => (
					<div
						key={ layer.id }
						className={ `layer-item ${
							state.selectedIds.includes( layer.id ) ||
							state.activeId === layer.id
								? 'active'
								: ''
						} ${ ! layer.visible ? 'hidden' : '' }` }
						style={ {
							paddingLeft: 10 + depth * 16,
							...( layer.label
								? {
										boxShadow: `inset 3px 0 0 ${ layer.label }`,
								  }
								: {} ),
							...( dropTarget?.id === layer.id
								? 'into' === dropTarget.mode
									? {
											outline:
												'1.5px dashed var(--accent)',
											outlineOffset: -2,
									  }
									: 'above' === dropTarget.mode
									? {
											boxShadow:
												'inset 0 2px 0 var(--accent)',
									  }
									: {
											boxShadow:
												'inset 0 -2px 0 var(--accent)',
									  }
								: {} ),
						} }
						role="button"
						tabIndex={ 0 }
						draggable={ null === renaming }
						onClick={ ( e ) => {
							if ( e.shiftKey || e.metaKey || e.ctrlKey ) {
								const ids = new Set( state.selectedIds );
								if ( ids.has( layer.id ) ) {
									ids.delete( layer.id );
								} else {
									ids.add( layer.id );
								}
								dispatch( {
									type: 'SET_SELECTED',
									ids: Array.from( ids ),
								} );
							} else {
								dispatch( {
									type: 'SET_ACTIVE',
									id: layer.id,
								} );
							}
						} }
						onKeyDown={ ( e ) =>
							'Enter' === e.key &&
							dispatch( { type: 'SET_ACTIVE', id: layer.id } )
						}
						onDoubleClick={ () => setRenaming( layer.id ) }
						onContextMenu={ ( e ) => {
							e.preventDefault();
							// Keep a multi-selection when right-clicking one of
							// its members, so Group / Convert to Smart Object act
							// on all of them; otherwise select just this layer
							// (v1.24.6: the reset used to collapse it to one).
							if ( ! state.selectedIds.includes( layer.id ) ) {
								dispatch( {
									type: 'SET_ACTIVE',
									id: layer.id,
								} );
							}
							setMenu( {
								x: e.clientX,
								y: e.clientY,
								layerId: layer.id,
							} );
						} }
						onDragStart={ ( e ) => {
							dragId.current = layer.id;
							e.dataTransfer.effectAllowed = 'move';
						} }
						onDragOver={ ( e ) => {
							// Indicators only for drags a drop can use:
							// row reorders and image drags (v1.364.0).
							if ( ! dragId.current && ! isImageDrag( e ) ) {
								return;
							}
							e.preventDefault();
							const rect =
								e.currentTarget.getBoundingClientRect();
							const rel = ( e.clientY - rect.top ) / rect.height;
							const mode =
								'group' === layer.type && rel > 0.3 && rel < 0.7
									? 'into'
									: rel < 0.5
									? 'above'
									: 'below';
							setDropTarget( { id: layer.id, mode } );
						} }
						onDragLeave={ ( e ) => {
							// Entering a child of the row also fires
							// dragleave; only a real exit clears (v1.364.0).
							if (
								e.relatedTarget &&
								e.currentTarget.contains( e.relatedTarget )
							) {
								return;
							}
							setDropTarget( ( t ) =>
								t?.id === layer.id ? null : t
							);
						} }
						onDrop={ ( e ) => {
							e.preventDefault();
							// The list background is a drop target too -
							// this drop is taken, do not insert twice.
							e.stopPropagation();
							const mode = dropTarget?.mode || 'above';
							if ( dragId.current ) {
								onDrop( { layer, mode } );
								return;
							}
							// Image from the tray or an OS file: insert a
							// NEW layer exactly where the indicator points
							// (v1.364.0). Payloads open only on drop.
							setDropTarget( null );
							const source = dropImageSource( e );
							if ( source ) {
								insertImageAtRow( editor, extras, source, {
									layer,
									mode,
								} );
							}
						} }
					>
						<button
							className="icon-btn"
							aria-label={
								layer.visible
									? __( 'Hide layer', 'wunderpaint' )
									: __( 'Show layer', 'wunderpaint' )
							}
							onClick={ ( e ) => {
								e.stopPropagation();
								update( layer.id, {
									visible: ! layer.visible,
								} );
								commit(
									layer.visible
										? __( 'Hide layer', 'wunderpaint' )
										: __( 'Show layer', 'wunderpaint' )
								);
							} }
						>
							{ layer.visible
								? I.eye( { size: 13 } )
								: I.eyeOff( { size: 13 } ) }
						</button>
						{ /* Fixed caret gutter keeps thumbs aligned; only groups get the toggle (v1.4). */ }
						{ 'group' === layer.type ? (
							<button
								className="icon-btn layer-caret"
								aria-label={
									layer.isOpen
										? __( 'Collapse group', 'wunderpaint' )
										: __( 'Expand group', 'wunderpaint' )
								}
								aria-expanded={ layer.isOpen }
								onClick={ ( e ) => {
									e.stopPropagation();
									// Toggling the caret by hand pins the state:
									// a manually opened group stays open even when
									// deselected; collapsing clears the pin so the
									// automatic open-on-select resumes (v1.291.1).
									const open = ! layer.isOpen;
									update( layer.id, {
										isOpen: open,
										manualOpen: open,
									} );
								} }
							>
								{ layer.isOpen
									? I.chevDown( { size: 11 } )
									: I.chevRight( { size: 11 } ) }
							</button>
						) : (
							<span className="layer-caret" aria-hidden="true" />
						) }
						<div
							className="thumb"
							style={ { position: 'relative' } }
						>
							{ 'group' === layer.type ? (
								<span
									className="thumb-folder"
									role="presentation"
								>
									{ I.folder( { size: 15 } ) }
								</span>
							) : (
								<span
									role="presentation"
									title={ __(
										'Double-click: zoom to layer',
										'wunderpaint'
									) }
									onDoubleClick={ ( e ) => {
										e.stopPropagation();
										extras.viewApi?.current?.zoomToRect?.( {
											x: layer.x - layer.w * 0.15,
											y: layer.y - layer.h * 0.15,
											w: Math.max( 1, layer.w * 1.3 ),
											h: Math.max( 1, layer.h * 1.3 ),
										} );
									} }
								>
									<LayerThumb
										layer={ layer }
										doc={ state.doc }
									/>
								</span>
							) }
							{ 'smart' === layer.type && (
								<span
									className="thumb-badge"
									title={ __(
										'Smart Object',
										'wunderpaint'
									) }
								>
									{ I.smart( { size: 9 } ) }
								</span>
							) }
							{ !! layer.binding && (
								<span
									className="thumb-badge"
									title={ bindingLabel( layer.binding ) }
								>
									{ I.link( { size: 9 } ) }
								</span>
							) }
							{ layer.clipped && (
								<span
									style={ {
										position: 'absolute',
										left: -14,
										top: '50%',
										transform: 'translateY(-50%)',
										color: 'var(--ed-text-dim)',
									} }
								>
									{ I.arrDown( { size: 10 } ) }
								</span>
							) }
						</div>
						{ renaming === layer.id ? (
							<input
								autoFocus // eslint-disable-line jsx-a11y/no-autofocus
								defaultValue={ layer.name }
								style={ {
									fontSize: 12,
									height: 20,
									padding: '0 4px',
									border: '1px solid var(--accent)',
									borderRadius: 2,
									background: 'var(--ed-panel-alt)',
									color: 'var(--ed-text)',
								} }
								onClick={ ( e ) => e.stopPropagation() }
								onBlur={ ( e ) => {
									setRenaming( null );
									if (
										e.target.value &&
										e.target.value !== layer.name
									) {
										update( layer.id, {
											name: e.target.value,
										} );
										commit(
											__( 'Rename layer', 'wunderpaint' )
										);
									}
								} }
								onKeyDown={ ( e ) => {
									e.stopPropagation();
									if ( 'Enter' === e.key ) {
										e.target.blur();
									}
									if ( 'Escape' === e.key ) {
										setRenaming( null );
									}
								} }
							/>
						) : (
							<div className="name">{ layer.name }</div>
						) }
						{ layer.mask && (
							<button
								className="icon-btn"
								title={
									layer.mask.enabled !== false
										? __(
												'Mask on, click to edit (paint white = show, black = hide; red overlay marks hidden areas), Alt-click to disable',
												'wunderpaint'
										  )
										: __(
												'Mask disabled, Alt-click to enable',
												'wunderpaint'
										  )
								}
								style={ {
									color:
										state.maskEditId === layer.id
											? 'var(--accent)'
											: undefined,
									opacity:
										layer.mask.enabled === false ? 0.4 : 1,
								} }
								onClick={ ( e ) => {
									e.stopPropagation();
									if ( e.altKey ) {
										update( layer.id, {
											mask: {
												...layer.mask,
												enabled:
													layer.mask.enabled ===
													false,
											},
										} );
										commit(
											__( 'Toggle mask', 'wunderpaint' )
										);
										return;
									}
									const entering =
										state.maskEditId !== layer.id;
									dispatch( {
										type: 'SET_ACTIVE',
										id: layer.id,
									} );
									dispatch( {
										type: 'SET_MASK_EDIT',
										id: entering ? layer.id : null,
									} );
									// Editing a mask means painting on it —
									// hand the user a brush right away.
									if (
										entering &&
										! [
											'brush',
											'pencil',
											'eraser',
										].includes( state.tool )
									) {
										dispatch( {
											type: 'SET_TOOL',
											tool: 'brush',
										} );
									}
								} }
							>
								{ I.mask( { size: 13 } ) }
							</button>
						) }
						<button
							className="icon-btn"
							aria-label={
								layer.locked
									? __( 'Unlock layer', 'wunderpaint' )
									: __( 'Lock layer', 'wunderpaint' )
							}
							onClick={ ( e ) => {
								e.stopPropagation();
								update( layer.id, { locked: ! layer.locked } );
								commit(
									layer.locked
										? __( 'Unlock layer', 'wunderpaint' )
										: __( 'Lock layer', 'wunderpaint' )
								);
							} }
						>
							{ layer.locked
								? I.lock( { size: 13 } )
								: I.unlock( { size: 13 } ) }
						</button>
						<button
							className="icon-btn"
							aria-label={ __( 'Delete layer', 'wunderpaint' ) }
							onClick={ ( e ) => {
								e.stopPropagation();
								dispatch( {
									type: 'REMOVE_LAYERS',
									ids: [ layer.id ],
								} );
								commit( __( 'Delete layer', 'wunderpaint' ) );
							} }
						>
							{ I.trash( { size: 13 } ) }
						</button>
					</div>
				) ) }
			</div>

			<div className="layers-toolbar" data-ws="panel.layers.foot">
				<button
					title={ __( 'Add layer', 'wunderpaint' ) }
					onClick={ () => Ops.newLayerOp( editor ) }
				>
					{ I.plus( { size: 14 } ) }
				</button>
				<button
					title={ __( 'New group', 'wunderpaint' ) }
					onClick={ () => Ops.newGroupOp( editor ) }
				>
					{ I.folder( { size: 14 } ) }
				</button>
				<button
					title={ __( 'Add mask', 'wunderpaint' ) }
					disabled={ ! active }
					onClick={ () => Ops.addMaskOp( editor ) }
				>
					{ I.mask( { size: 14 } ) }
				</button>
				<button
					title={ __( 'Duplicate', 'wunderpaint' ) }
					disabled={ ! active }
					onClick={ () => Ops.duplicateLayer( editor ) }
				>
					{ I.duplicate( { size: 14 } ) }
				</button>
				<button
					title={ __( 'Move up', 'wunderpaint' ) }
					disabled={ ! active }
					onClick={ () => Ops.bringForwardOp( editor ) }
				>
					{ I.arrUp( { size: 14 } ) }
				</button>
				<button
					title={ __( 'Move down', 'wunderpaint' ) }
					disabled={ ! active }
					onClick={ () => Ops.sendBackwardOp( editor ) }
				>
					{ I.arrDown( { size: 14 } ) }
				</button>
				<div className="spacer" />
				<button
					title={ __( 'Delete', 'wunderpaint' ) }
					disabled={ ! active }
					onClick={ () => Ops.deleteLayers( editor ) }
				>
					{ I.trash( { size: 14 } ) }
				</button>
			</div>

			{ menu && (
				<div
					className="ctx-menu"
					style={ { position: 'fixed', left: menu.x, top: menu.y } }
					onPointerDown={ ( e ) => e.stopPropagation() }
				>
					{ contextItems(
						state.layers.find( ( l ) => l.id === menu.layerId ) ||
							{}
					).map( ( item, i ) =>
						item.divider ? (
							<div key={ i } className="divider" />
						) : item.colors ? (
							<div key={ i } className="ctx-label-row">
								<span>{ item.label }</span>
								{ item.colors.map( ( color ) => (
									<button
										key={ color || 'none' }
										className="ctx-label-swatch"
										aria-label={
											color ||
											__( 'No label', 'wunderpaint' )
										}
										style={
											color ? { background: color } : {}
										}
										onClick={ () => {
											dispatch( {
												type: 'UPDATE_LAYER',
												id: menu.layerId,
												patch: { label: color },
											} );
											commit(
												__(
													'Layer label',
													'wunderpaint'
												)
											);
											setMenu( null );
										} }
									>
										{ ! color && '∅' }
									</button>
								) ) }
							</div>
						) : (
							<button
								key={ i }
								className={ item.danger ? 'danger' : '' }
								onClick={ () => runMenuItem( item ) }
							>
								<span className="ctx-ic">
									{ item.icon && I[ item.icon ]
										? I[ item.icon ]( { size: 13 } )
										: null }
								</span>
								{ item.label }
							</button>
						)
					) }
				</div>
			) }
		</Fragment>
	);
}
