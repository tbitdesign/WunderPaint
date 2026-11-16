import { __ } from '@wordpress/i18n';
import { useEffect, useRef } from '@wordpress/element';
import { renderMaskCoverage } from '../../lib/raster/mask';
import { sharedImageCache } from '../../lib/raster';
import { ancestorLocked } from '../canvas/tool-handlers';
import * as Ops from '../../store/ops';
import { ToolChoices, ToolSetting } from './tool-setting';

export function MaskPanel( { editor } ) {
	const { state, dispatch, commit } = editor;
	const layer =
		state.layers.find( ( l ) => l.id === state.maskEditId ) ||
		state.layers.find( ( l ) => l.id === state.activeId );
	const preview = useRef( null );
	const mask = layer?.mask;
	useEffect( () => {
		let cancelled = false;
		if ( ! mask || ! preview.current ) {
			return undefined;
		}
		sharedImageCache
			.warm( [ layer ] )
			.then( () => {
				if ( cancelled || ! preview.current ) {
					return;
				}
				const c = preview.current;
				const scale = Math.min( 96 / state.doc.w, 72 / state.doc.h );
				c.width = Math.max( 1, Math.round( state.doc.w * scale ) );
				c.height = Math.max( 1, Math.round( state.doc.h * scale ) );
				const coverage = renderMaskCoverage(
					layer,
					{
						doc: state.doc,
						viewport: { x: 0, y: 0 },
						scale,
						cache: sharedImageCache,
					},
					{ x: 0, y: 0, w: c.width, h: c.height }
				);
				const ctx = c.getContext( '2d' );
				ctx.fillStyle = '#000';
				ctx.fillRect( 0, 0, c.width, c.height );
				if ( coverage ) {
					ctx.drawImage( coverage, 0, 0 );
				}
			} )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ layer, mask, state.doc ] );
	if ( ! mask ) {
		return (
			<p className="painting-hint">
				{ __( 'Select a layer mask to edit it.', 'wunderpaint' ) }
			</p>
		);
	}
	const locked = layer.locked || ancestorLocked( state.layers, layer );
	const paintTool = [ 'brush', 'pencil', 'eraser' ].includes( state.tool )
		? state.tool
		: 'brush';
	const brush = state.toolOpts[ paintTool ];
	const setBrush = ( key, value ) =>
		dispatch( {
			type: 'SET_TOOL_OPTS',
			tool: paintTool,
			patch: { [ key ]: value },
		} );
	const up = ( patch ) =>
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layer.id,
			patch: { mask: { ...mask, ...patch } },
		} );
	const save = () => commit( __( 'Edit mask', 'wunderpaint' ) );
	const act = ( fn ) => {
		dispatch( { type: 'SET_ACTIVE', id: layer.id } );
		fn( { ...editor, state: { ...state, activeId: layer.id } } );
	};
	return (
		<div className="painting-panel">
			<div className="painting-mask-target">
				<span>{ layer.name }</span>
				<button
					type="button"
					className="ai-btn secondary sm"
					onClick={ () => {
						dispatch( { type: 'SET_MASK_EDIT', id: null } );
						dispatch( {
							type: 'SET_MASK_PREVIEW',
							value: 'image',
						} );
					} }
				>
					{ __( 'Done', 'wunderpaint' ) }
				</button>
			</div>
			<div className="mask-panel-overview">
				<canvas
					ref={ preview }
					className="mask-panel-preview"
					aria-label={ __( 'Mask preview', 'wunderpaint' ) }
				/>
				<p className="painting-hint">
					{ __(
						'White reveals, black hides. Gray is partially visible.',
						'wunderpaint'
					) }
				</p>
			</div>
			<div className="mask-panel-view">
				<ToolChoices
					label={ __( 'Preview', 'wunderpaint' ) }
					value={ state.maskPreview || 'overlay' }
					choices={ [
						[ 'image', __( 'Image', 'wunderpaint' ) ],
						[ 'overlay', __( 'Overlay', 'wunderpaint' ) ],
						[ 'mask', __( 'Mask', 'wunderpaint' ) ],
					] }
					onChange={ ( value ) => {
						dispatch( { type: 'SET_MASK_EDIT', id: layer.id } );
						dispatch( { type: 'SET_MASK_PREVIEW', value } );
					} }
				/>
			</div>
			{ locked && (
				<p className="painting-hint">
					{ __( 'Layer is locked', 'wunderpaint' ) }
				</p>
			) }
			<fieldset disabled={ locked } className="painting-fieldset">
				<section className="painting-section">
					<h3>{ __( 'Mask settings', 'wunderpaint' ) }</h3>
					<ToolSetting
						label={ __( 'Density', 'wunderpaint' ) }
						value={ Math.round( ( mask.density ?? 1 ) * 100 ) }
						suffix="%"
						onChange={ ( v ) => up( { density: v / 100 } ) }
						onCommit={ save }
					/>
					<ToolSetting
						label={ __( 'Feather', 'wunderpaint' ) }
						value={ mask.feather || 0 }
						max={ 250 }
						suffix="px"
						onChange={ ( feather ) => up( { feather } ) }
						onCommit={ save }
					/>
					<div className="painting-actions">
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => act( Ops.invertMaskOp ) }
						>
							{ __( 'Inverse', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => act( Ops.toggleMaskOp ) }
						>
							{ mask.enabled === false
								? __( 'Enable', 'wunderpaint' )
								: __( 'Disable', 'wunderpaint' ) }
						</button>
					</div>
				</section>
				<section className="painting-section">
					<h3>{ __( 'Paint mask', 'wunderpaint' ) }</h3>
					<div className="painting-actions">
						{ [
							[ '#ffffff', __( 'Reveal', 'wunderpaint' ) ],
							[ '#000000', __( 'Hide', 'wunderpaint' ) ],
						].map( ( [ color, label ] ) => (
							<button
								type="button"
								key={ color }
								className="ai-btn secondary sm"
								onClick={ () => {
									dispatch( {
										type: 'SET_MASK_EDIT',
										id: layer.id,
									} );
									dispatch( { type: 'SET_FG', color } );
									dispatch( {
										type: 'SET_TOOL',
										tool: 'brush',
									} );
								} }
							>
								{ label }
							</button>
						) ) }
					</div>
					<ToolSetting
						label={ __( 'Size', 'wunderpaint' ) }
						value={ brush.size }
						min={ 1 }
						max={ 1000 }
						suffix="px"
						onChange={ ( value ) => setBrush( 'size', value ) }
					/>
					<ToolSetting
						label={ __( 'Opacity', 'wunderpaint' ) }
						value={ brush.opacity }
						suffix="%"
						onChange={ ( value ) => setBrush( 'opacity', value ) }
					/>
					{ paintTool !== 'pencil' && (
						<ToolSetting
							label={ __( 'Hardness', 'wunderpaint' ) }
							value={ brush.hardness ?? 100 }
							suffix="%"
							onChange={ ( value ) =>
								setBrush( 'hardness', value )
							}
						/>
					) }
				</section>
				<details className="painting-section">
					<summary>{ __( 'Finish mask', 'wunderpaint' ) }</summary>
					<p className="painting-hint">
						{ __(
							'Apply merges the mask into the pixels. Remove reveals the full layer.',
							'wunderpaint'
						) }
					</p>
					<div className="painting-actions">
						<button
							type="button"
							className="ai-btn secondary sm"
							disabled={ [ 'group', 'adjustment' ].includes(
								layer.type
							) }
							onClick={ () => act( Ops.applyMaskOp ) }
						>
							{ __( 'Apply', 'wunderpaint' ) }
						</button>
						<button
							type="button"
							className="ai-btn secondary sm"
							onClick={ () => act( Ops.removeMaskOp ) }
						>
							{ __( 'Remove', 'wunderpaint' ) }
						</button>
					</div>
				</details>
			</fieldset>
		</div>
	);
}
