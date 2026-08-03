/**
 * Mockup Generator (v1.117.0): puts the selected layer or the flattened
 * document onto a studio-style product mockup (ebook, software box, DVD
 * case, CD case, report stack, monitor) rendered by the little 3D
 * pipeline in lib/mockup.js. The result is a regular image layer with a
 * transparent background; all parameters plus the artwork live on the
 * layer, so Edit Mockup in the context menus reopens this dialog and
 * re-renders in place.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import { createBlankDoc, makeImage } from '../store/document';
import { MOCKUP_DEFAULTS, renderMockup, trimTransparent } from '../lib/mockup';
import { renderToCanvas, sharedImageCache, createCanvas } from '../lib/raster';

const SOURCE_TYPES = [ 'image', 'raster', 'smart' ];
const OUT_SIZE = 1600; // longest edge of the baked render
const SRC_CAP = 1400; // stored artwork cap (keeps layer.mockup sane)

const TYPE_LABELS = () => [
	[ 'book', __( 'Ebook', 'wunderpaint' ) ],
	[ 'box', __( 'Software box', 'wunderpaint' ) ],
	[ 'dvd', __( 'DVD case', 'wunderpaint' ) ],
	[ 'cd', __( 'CD case', 'wunderpaint' ) ],
	[ 'report', __( 'Report', 'wunderpaint' ) ],
	[ 'monitor', __( 'Monitor', 'wunderpaint' ) ],
];

const typeName = ( type ) => {
	const entry = TYPE_LABELS().find( ( [ key ] ) => key === type );
	return entry ? entry[ 1 ] : type;
};

const PRESETS = () => [
	[ __( 'Front', 'wunderpaint' ), { yaw: 4, pitch: 2 } ],
	[ __( 'Classic', 'wunderpaint' ), { yaw: 22, pitch: 5 } ],
	[ __( 'Steep', 'wunderpaint' ), { yaw: 34, pitch: 12 } ],
];

function Slider( { label, value, min, max, onChange } ) {
	return (
		<label style={ { display: 'grid', gap: 4, fontSize: 12 } }>
			<span className="dsm-label">
				{ label } { value }
			</span>
			<input
				type="range"
				min={ min }
				max={ max }
				value={ value }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
		</label>
	);
}

function Seg( { options, value, onChange } ) {
	return (
		<div
			className="seg-row"
			style={ { display: 'flex', flexWrap: 'wrap' } }
		>
			{ options.map( ( [ key, label ] ) => (
				<button
					key={ key }
					className={ value === key ? 'active' : '' }
					onClick={ () => onChange( key ) }
				>
					{ label }
				</button>
			) ) }
		</div>
	);
}

/** Draw an image/canvas onto a fresh canvas, capped to `cap` px. */
const cappedCanvas = ( img, cap ) => {
	const scale = Math.min( 1, cap / Math.max( img.width, img.height ) );
	const c = createCanvas(
		Math.max( 1, Math.round( img.width * scale ) ),
		Math.max( 1, Math.round( img.height * scale ) )
	);
	c.getContext( '2d' ).drawImage( img, 0, 0, c.width, c.height );
	return c;
};

export function MockupDialog( { onClose, extras, layerId = null } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const editLayer = layerId
		? state.layers.find( ( l ) => l.id === layerId ) || null
		: null;

	// Source: the active image-ish layer, else the first one, else the
	// flattened document; edits default to the artwork stored on the layer.
	const candidates = state.layers.filter(
		( l ) => SOURCE_TYPES.includes( l.type ) && l.visible !== false
	);
	const active = state.layers.find( ( l ) => l.id === state.activeId );
	const sourceLayer =
		active && SOURCE_TYPES.includes( active.type ) && active.id !== layerId
			? active
			: candidates.find( ( l ) => l.id !== layerId ) || null;
	const [ sourceMode, setSourceMode ] = useState( () => {
		if ( editLayer?.mockup?.source ) {
			return 'stored';
		}
		return sourceLayer ? 'layer' : 'doc';
	} );
	const [ sourceCanvas, setSourceCanvas ] = useState( null );

	useEffect( () => {
		let live = true;
		setSourceCanvas( null );
		const put = ( canvas ) => live && setSourceCanvas( canvas );
		if ( 'stored' === sourceMode && editLayer?.mockup?.source ) {
			const img = new Image();
			img.onload = () => put( cappedCanvas( img, SRC_CAP ) );
			img.src = editLayer.mockup.source;
		} else if ( 'layer' === sourceMode && sourceLayer ) {
			const scale = Math.min(
				1,
				SRC_CAP / Math.max( sourceLayer.w, sourceLayer.h )
			);
			renderToCanvas(
				{
					...state.doc,
					w: sourceLayer.w,
					h: sourceLayer.h,
					bg: 'transparent',
				},
				[
					{
						...sourceLayer,
						x: 0,
						y: 0,
						rot: 0,
						clipped: false,
						parent: null,
					},
				],
				{ scale, cache: sharedImageCache }
			)
				.then( put )
				.catch( () => {} );
		} else if ( 'doc' === sourceMode && state.layers.length ) {
			const scale = Math.min(
				1,
				SRC_CAP / Math.max( state.doc.w, state.doc.h )
			);
			renderToCanvas( state.doc, state.layers, {
				scale,
				cache: sharedImageCache,
			} )
				.then( put )
				.catch( () => {} );
		}
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sourceMode ] );

	const kitColors = ( window.WPIE?.brand?.colors || [] ).slice( 0, 6 );
	const [ params, setParams ] = useState( () => {
		if ( editLayer?.mockup ) {
			const rest = { ...editLayer.mockup };
			delete rest.source;
			return { ...MOCKUP_DEFAULTS, ...rest };
		}
		return {
			...MOCKUP_DEFAULTS,
			material: kitColors[ 0 ] || MOCKUP_DEFAULTS.material,
		};
	} );
	const [ output, setOutput ] = useState( 'doc' ); // doc | tab
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	const patch = ( changes ) => setParams( ( p ) => ( { ...p, ...changes } ) );

	const paramsKey = JSON.stringify( params );
	useEffect( () => {
		const t = setTimeout( () => {
			try {
				setPreview(
					renderMockup( params, sourceCanvas, 460, 380 ).toDataURL()
				);
			} catch ( e ) {
				setPreview( null );
			}
		}, 150 );
		return () => clearTimeout( t );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paramsKey, sourceCanvas ] );

	const apply = () => {
		if ( ! sourceCanvas ) {
			return;
		}
		setBusy( true );
		try {
			const baked = trimTransparent(
				renderMockup( params, sourceCanvas, OUT_SIZE, OUT_SIZE )
			);
			const src = baked.toDataURL( 'image/png' );
			const mockup = {
				...params,
				source: sourceCanvas.toDataURL( 'image/png' ),
			};
			const name = 'Mockup: ' + typeName( params.type );
			if ( editLayer ) {
				// Keep the box width, follow the new aspect ratio.
				const h = Math.round(
					( editLayer.w * baked.height ) / baked.width
				);
				dispatch( {
					type: 'UPDATE_LAYER',
					id: editLayer.id,
					patch: {
						src,
						naturalW: baked.width,
						naturalH: baked.height,
						h,
						mockup,
						...( /^Mockup\b/.test( editLayer.name || '' )
							? { name }
							: {} ),
					},
				} );
				commit( __( 'Edit mockup', 'wunderpaint' ) );
			} else if ( 'tab' === output ) {
				const doc = createBlankDoc( {
					name: 'mockup',
					w: baked.width,
					h: baked.height,
					bg: 'transparent',
				} );
				const layer = {
					...makeImage( {
						name,
						x: 0,
						y: 0,
						w: baked.width,
						h: baked.height,
						src,
						naturalW: baked.width,
						naturalH: baked.height,
					} ),
					mockup,
				};
				if (
					! extras?.openDocInNewTab?.( { doc, layers: [ layer ] } )
				) {
					dispatch( {
						type: 'LOAD_DOCUMENT',
						doc,
						layers: [ layer ],
						label: __( 'Insert mockup', 'wunderpaint' ),
					} );
				}
			} else {
				const scale =
					0.8 *
					Math.min(
						state.doc.w / baked.width,
						state.doc.h / baked.height
					);
				const w = Math.round( baked.width * scale );
				const h = Math.round( baked.height * scale );
				dispatch( {
					type: 'ADD_LAYER',
					layer: {
						...makeImage( {
							name,
							x: Math.round( ( state.doc.w - w ) / 2 ),
							y: Math.round( ( state.doc.h - h ) / 2 ),
							w,
							h,
							src,
							naturalW: baked.width,
							naturalH: baked.height,
						} ),
						mockup,
					},
				} );
				commit( __( 'Insert mockup', 'wunderpaint' ) );
			}
			extras?.toasts?.success?.(
				__(
					'Mockup ready, editable any time via Edit Mockup.',
					'wunderpaint'
				)
			);
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The mockup could not be generated.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 'min(860px, 96vw)',
					height: 'auto',
					maxHeight: '92vh',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Mockup Generator', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Mockup Generator', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Your artwork as a studio product shot, rendered right here, no cloud involved.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div
					style={ {
						display: 'flex',
						gap: 16,
						padding: 16,
						overflow: 'hidden',
						minHeight: 0,
					} }
				>
					{ /* ------------------------- controls ------------------------ */ }
					<div
						style={ {
							flex: 1,
							minWidth: 0,
							display: 'grid',
							gap: 12,
							overflowY: 'auto',
							paddingRight: 4,
							alignContent: 'start',
						} }
					>
						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Mockup', 'wunderpaint' ) }
							</span>
							<Seg
								options={ TYPE_LABELS() }
								value={ params.type }
								onChange={ ( v ) => patch( { type: v } ) }
							/>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ __(
									'The shape adapts to the aspect ratio of your artwork.',
									'wunderpaint'
								) }
							</div>
						</div>

						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Source', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									...( editLayer?.mockup?.source
										? [
												[
													'stored',
													__(
														'Stored artwork',
														'wunderpaint'
													),
												],
										  ]
										: [] ),
									...( sourceLayer
										? [
												[
													'layer',
													__(
														'Selected image layer',
														'wunderpaint'
													),
												],
										  ]
										: [] ),
									...( state.layers.length
										? [
												[
													'doc',
													__(
														'Whole document (flattened)',
														'wunderpaint'
													),
												],
										  ]
										: [] ),
								] }
								value={ sourceMode }
								onChange={ setSourceMode }
							/>
							{ ! sourceLayer &&
								! state.layers.length &&
								! editLayer?.mockup?.source && (
									<div
										style={ {
											fontSize: 12,
											color: 'var(--ed-warn, #f5a623)',
										} }
									>
										{ __(
											'Add or select an image layer first, the mockup wraps it.',
											'wunderpaint'
										) }
									</div>
								) }
							{ ! sourceCanvas &&
								( sourceLayer || state.layers.length > 0 ) && (
									<div
										style={ {
											fontSize: 12,
											color: 'var(--ed-text-muted)',
										} }
									>
										{ __(
											'Preparing the artwork…',
											'wunderpaint'
										) }
									</div>
								) }
						</div>

						<div style={ { display: 'grid', gap: 6 } }>
							<div
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								<span
									className="dsm-label"
									style={ { flex: 1 } }
								>
									{ __( 'Camera', 'wunderpaint' ) }
								</span>
								{ PRESETS().map( ( [ label, values ] ) => (
									<button
										key={ label }
										className="ai-btn secondary"
										style={ {
											padding: '3px 9px',
											fontSize: 11,
										} }
										onClick={ () => patch( values ) }
									>
										{ label }
									</button>
								) ) }
							</div>
							<div
								style={ {
									display: 'grid',
									gridTemplateColumns: '1fr 1fr',
									gap: 12,
								} }
							>
								<Slider
									label={ __( 'Angle', 'wunderpaint' ) }
									value={ params.yaw }
									min={ -45 }
									max={ 45 }
									onChange={ ( v ) => patch( { yaw: v } ) }
								/>
								<Slider
									label={ __( 'Tilt', 'wunderpaint' ) }
									value={ params.pitch }
									min={ -15 }
									max={ 25 }
									onChange={ ( v ) => patch( { pitch: v } ) }
								/>
							</div>
						</div>

						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: '1fr 1fr',
								gap: 12,
							} }
						>
							<Slider
								label={ __( 'Light', 'wunderpaint' ) }
								value={ params.light }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { light: v } ) }
							/>
							<Slider
								label={ __( 'Gloss', 'wunderpaint' ) }
								value={ params.gloss }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { gloss: v } ) }
							/>
							<Slider
								label={ __( 'Shadow', 'wunderpaint' ) }
								value={ params.shadow }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { shadow: v } ) }
							/>
							<div
								style={ {
									display: 'grid',
									gap: 4,
									fontSize: 12,
								} }
							>
								<span className="dsm-label">
									{ __( 'Material', 'wunderpaint' ) }
								</span>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									<SwatchButton
										color={ params.material }
										size={ 26 }
										title={ __(
											'Material',
											'wunderpaint'
										) }
										onChange={ ( v ) =>
											patch( {
												material: v.slice( 0, 7 ),
											} )
										}
									/>
									{ kitColors.map( ( c ) => (
										<button
											key={ c }
											title={ c }
											onClick={ () =>
												patch( { material: c } )
											}
											style={ {
												width: 18,
												height: 18,
												borderRadius: 4,
												border: '1px solid var(--ed-border-strong)',
												background: c,
												cursor: 'pointer',
												padding: 0,
											} }
										/>
									) ) }
								</div>
							</div>
						</div>

						{ ! editLayer && (
							<div style={ { display: 'grid', gap: 6 } }>
								<span className="dsm-label">
									{ __( 'Output', 'wunderpaint' ) }
								</span>
								<Seg
									options={ [
										[
											'doc',
											__(
												'Into this document',
												'wunderpaint'
											),
										],
										[
											'tab',
											__(
												'New document tab',
												'wunderpaint'
											),
										],
									] }
									value={ output }
									onChange={ setOutput }
								/>
							</div>
						) }
					</div>

					{ /* ------------------------- preview ------------------------- */ }
					<div
						style={ {
							width: 320,
							display: 'grid',
							gap: 8,
							alignContent: 'start',
						} }
					>
						<div
							style={ {
								width: 320,
								borderRadius: 8,
								border: '1px solid var(--ed-border-strong)',
								overflow: 'hidden',
								minHeight: 200,
								display: 'flex',
								alignItems: 'center',
								justifyContent: 'center',
								background:
									'repeating-conic-gradient(#c9cdd3 0% 25%, #f2f3f5 0% 50%) 0 0 / 16px 16px',
							} }
						>
							{ preview && (
								<img
									src={ preview }
									alt={ __( 'Preview', 'wunderpaint' ) }
									style={ {
										width: '100%',
										display: 'block',
									} }
								/>
							) }
						</div>
						<div
							style={ {
								fontSize: 11,
								color: 'var(--ed-text-muted)',
							} }
						>
							{ __(
								'Baked at high resolution with a transparent background, so it sits on any design.',
								'wunderpaint'
							) }
						</div>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __(
							'Lands as an image layer, editable any time via Edit Mockup.',
							'wunderpaint'
						) }
					</div>
					<div style={ { display: 'flex', gap: 8 } }>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! sourceCanvas || busy }
							onClick={ apply }
						>
							{ editLayer
								? __( 'Update mockup', 'wunderpaint' )
								: __( 'Insert mockup', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
