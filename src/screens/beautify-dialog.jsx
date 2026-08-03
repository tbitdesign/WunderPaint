/**
 * Screenshot Beautifier (v1.106.0): wraps the active image layer in a
 * rounded card with shadow, optional browser/window/phone chrome or
 * generative deco frames, grows the canvas (padding + aspect presets)
 * and drops a Background-Studio backdrop behind it. Everything lands as
 * editable layers in a "Screenshot" group; the backdrop keeps its
 * params, so Edit Background still works on it.
 */

import { useEffect, useState } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { SwatchButton } from '../components/color-popover';
import {
	createBlankDoc,
	makeGroup,
	makeImage,
	makeShape,
	makeText,
} from '../store/document';
import { BEAUTIFY_DEFAULTS, beautifySpec } from '../lib/beautify';
import { BG_DEFAULTS, renderBackground } from '../lib/backgrounds';
import { buildScheme, randomSchemeInput } from '../lib/color-scheme';
import { renderToCanvas, sharedImageCache } from '../lib/raster';

const SOURCE_TYPES = [ 'image', 'raster', 'smart' ];

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
		<div className="seg-row" style={ { display: 'flex' } }>
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

function ColorsFrom( { onApply } ) {
	const kits = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => k?.name && ( k.colors || [] ).length > 1
	);
	const sets = ( window.WPIE?.palettes || [] ).filter(
		( p ) => ( p.colors || [] ).length > 1
	);
	if ( ! kits.length && ! sets.length ) {
		return null;
	}
	return (
		<select
			className="dsm-select"
			value=""
			onChange={ ( e ) => {
				const [ kind, id ] = e.target.value.split( ':' );
				const source =
					'kit' === kind
						? kits.find( ( k ) => k.id === id )
						: sets.find( ( s ) => s.id === id );
				if ( source?.colors?.length > 1 ) {
					onApply( source.colors.slice( 0, 5 ) );
				}
			} }
		>
			<option value="">{ __( 'Colors from…', 'wunderpaint' ) }</option>
			{ kits.map( ( k ) => (
				<option key={ k.id } value={ 'kit:' + k.id }>
					{ __( 'Brand Kit', 'wunderpaint' ) + ': ' + k.name }
				</option>
			) ) }
			{ sets.map( ( s ) => (
				<option key={ s.id } value={ 'set:' + s.id }>
					{ __( 'Swatch set', 'wunderpaint' ) + ': ' + s.name }
				</option>
			) ) }
		</select>
	);
}

/** Spec object -> real layer. */
function specToLayer( spec ) {
	const { kind, clipped, styles, rot, ...props } = spec;
	const layer = 'text' === kind ? makeText( props ) : makeShape( props );
	if ( clipped ) {
		layer.clipped = true;
	}
	if ( styles ) {
		layer.styles = styles;
	}
	if ( rot ) {
		layer.rot = rot;
	}
	return layer;
}

export function BeautifyDialog( { onClose, extras } ) {
	useEscape( onClose );
	const editor = useEditor();
	const { state, dispatch } = editor;

	// Source: the active image-ish layer, else the bottom-most one; or
	// the WHOLE document flattened (v1.107, user request).
	const candidates = state.layers.filter(
		( l ) => SOURCE_TYPES.includes( l.type ) && l.visible !== false
	);
	const active = state.layers.find( ( l ) => l.id === state.activeId );
	const source =
		active && SOURCE_TYPES.includes( active.type )
			? active
			: candidates[ 0 ] || null;
	const [ sourceMode, setSourceMode ] = useState( () =>
		source ? 'layer' : 'doc'
	);
	// Flattened document as a data URL, rendered once (the document does
	// not change while the dialog is open).
	const [ docShot, setDocShot ] = useState( null ); // {src, naturalW, naturalH}
	useEffect( () => {
		if ( 'doc' !== sourceMode || docShot || ! state.layers.length ) {
			return;
		}
		let live = true;
		const scale = Math.min(
			1,
			2000 / Math.max( state.doc.w, state.doc.h )
		);
		renderToCanvas( state.doc, state.layers, {
			scale,
			cache: sharedImageCache,
		} )
			.then( ( canvas ) => {
				if ( live ) {
					setDocShot( {
						src: canvas.toDataURL( 'image/png' ),
						naturalW: canvas.width,
						naturalH: canvas.height,
					} );
				}
			} )
			.catch( () => {} );
		return () => {
			live = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ sourceMode ] );

	const shotSize =
		'doc' === sourceMode
			? { w: state.doc.w, h: state.doc.h }
			: { w: source?.w || 0, h: source?.h || 0 };
	const sourceReady = 'doc' === sourceMode ? !! docShot : !! source;

	const kitColors = ( window.WPIE?.brand?.colors || [] ).slice( 0, 2 );
	const [ params, setParams ] = useState( () => ( {
		...BEAUTIFY_DEFAULTS,
		colors: kitColors.length > 1 ? kitColors : BEAUTIFY_DEFAULTS.colors,
	} ) );
	const [ bgMode, setBgMode ] = useState( 'studio' ); // studio|solid|none
	const [ bgParams, setBgParams ] = useState( () => ( {
		...BG_DEFAULTS,
		style: 'mesh',
		colors:
			( window.WPIE?.brand?.colors || [] ).length > 1
				? window.WPIE.brand.colors.slice( 0, 4 )
				: BG_DEFAULTS.colors,
		seed: 1 + Math.floor( Math.random() * 1e9 ),
	} ) );
	const [ solidColor, setSolidColor ] = useState( '#e9ebf0' );
	const [ preview, setPreview ] = useState( null );
	const [ busy, setBusy ] = useState( false );

	const patch = ( changes ) => setParams( ( p ) => ( { ...p, ...changes } ) );
	const patchDeco = ( changes ) =>
		setParams( ( p ) => ( { ...p, deco: { ...p.deco, ...changes } } ) );

	/**
	 * Build the composition layers (shared by preview and apply).
	 *
	 * @param {string|null} bgSrc Pre-rendered background data URL (or null).
	 * @param {Object}      spec  beautifySpec result.
	 * @return {Array} Flat layer list, bottom to top, ungrouped.
	 */
	const buildLayers = ( bgSrc, spec ) => {
		const layers = [];
		if ( 'solid' === bgMode ) {
			layers.push(
				makeShape( {
					name: 'Background',
					x: 0,
					y: 0,
					w: spec.doc.w,
					h: spec.doc.h,
					fill: solidColor,
				} )
			);
		} else if ( 'studio' === bgMode && bgSrc ) {
			layers.push( {
				...makeImage( {
					name: 'Background: Studio',
					x: 0,
					y: 0,
					w: spec.doc.w,
					h: spec.doc.h,
					src: bgSrc,
				} ),
				bg: { ...bgParams },
			} );
		}
		const shotLayer =
			'doc' === sourceMode
				? {
						...makeImage( {
							name: __( 'Screenshot', 'wunderpaint' ),
							x: spec.shotRect.x,
							y: spec.shotRect.y,
							w: spec.shotRect.w,
							h: spec.shotRect.h,
							src: docShot?.src || '',
							naturalW: docShot?.naturalW,
							naturalH: docShot?.naturalH,
						} ),
						clipped: true,
				  }
				: {
						...source,
						x: spec.shotRect.x,
						y: spec.shotRect.y,
						w: spec.shotRect.w,
						h: spec.shotRect.h,
						rot: 0,
						clipped: true,
						parent: null,
				  };
		const parts = [
			...spec.below.map( specToLayer ),
			specToLayer( spec.card ),
			shotLayer,
			...spec.overlays.map( specToLayer ),
		];
		return { layers, parts };
	};

	const paramsKey = JSON.stringify( {
		params,
		bgMode,
		bgParams,
		solidColor,
	} );
	useEffect( () => {
		if ( ! sourceReady ) {
			return;
		}
		let live = true;
		const t = setTimeout( async () => {
			try {
				const spec = beautifySpec( shotSize, params );
				const scale = Math.min(
					1,
					460 / Math.max( spec.doc.w, spec.doc.h )
				);
				const bgSrc =
					'studio' === bgMode
						? renderBackground(
								bgParams,
								Math.round( spec.doc.w * scale ),
								Math.round( spec.doc.h * scale )
						  ).toDataURL()
						: null;
				const { layers, parts } = buildLayers( bgSrc, spec );
				const canvas = await renderToCanvas(
					{ ...state.doc, w: spec.doc.w, h: spec.doc.h },
					[ ...layers, ...parts ],
					{ scale, cache: sharedImageCache }
				);
				if ( live ) {
					setPreview( canvas.toDataURL() );
				}
			} catch ( e ) {
				if ( live ) {
					setPreview( null );
				}
			}
		}, 200 );
		return () => {
			live = false;
			clearTimeout( t );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ paramsKey, sourceReady, docShot ] );

	const apply = () => {
		if ( ! sourceReady ) {
			return;
		}
		setBusy( true );
		try {
			const spec = beautifySpec( shotSize, params );
			const bgSrc =
				'studio' === bgMode
					? renderBackground(
							bgParams,
							spec.doc.w,
							spec.doc.h
					  ).toDataURL( 'image/png' )
					: null;
			const { layers, parts } = buildLayers( bgSrc, spec );
			// The shot is a fresh copy in a fresh document, never the live
			// layer object of the current one.
			const shotIdx = spec.below.length + 1;
			parts[ shotIdx ] = { ...parts[ shotIdx ] };
			const group = makeGroup( { name: 'Screenshot' } );
			// Groups are double-linked: children point at the group AND the
			// group lists the child ids - the panel and the renderer walk
			// group.children, parent alone leaves the group empty (v1.106.2).
			for ( const part of parts ) {
				part.parent = group.id;
			}
			group.children = parts.map( ( p ) => p.id );
			// The framed result has its own size, so it becomes its own
			// document - in a new tab, the current work stays put (v1.107).
			const doc = createBlankDoc( {
				name: 'screenshot',
				w: spec.doc.w,
				h: spec.doc.h,
				bg: 'transparent',
			} );
			const newLayers = [ ...layers, ...parts, group ];
			if ( ! extras?.openDocInNewTab?.( { doc, layers: newLayers } ) ) {
				dispatch( {
					type: 'LOAD_DOCUMENT',
					doc,
					layers: newLayers,
					label: __( 'Beautify screenshot', 'wunderpaint' ),
				} );
			}
			extras?.toasts?.success?.(
				__( 'Framed as editable layers.', 'wunderpaint' )
			);
			onClose();
		} catch ( e ) {
			extras?.toasts?.error?.(
				__( 'The screenshot could not be framed.', 'wunderpaint' )
			);
		} finally {
			setBusy( false );
		}
	};

	const deco = params.deco;

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 'min(820px, 96vw)',
					height: 'auto',
					maxHeight: '92vh',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Screenshot Beautifier', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Screenshot Beautifier', 'wunderpaint' ) }
							</span>
							<HelpLink
								article="design-tools"
								extras={ extras }
							/>
						</div>
						<div className="dsm-sub">
							{ __(
								'Card, shadow, frame and backdrop around your screenshot, all editable.',
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
								{ __( 'Source', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									...( source
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
							{ ! source && ! state.layers.length && (
								<div
									style={ {
										fontSize: 12,
										color: 'var(--ed-warn, #f5a623)',
									} }
								>
									{ __(
										'Add or select an image layer first, the beautifier wraps it.',
										'wunderpaint'
									) }
								</div>
							) }
							{ 'doc' === sourceMode &&
								! docShot &&
								state.layers.length > 0 && (
									<div
										style={ {
											fontSize: 12,
											color: 'var(--ed-text-muted)',
										} }
									>
										{ __(
											'Flattening the document…',
											'wunderpaint'
										) }
									</div>
								) }
						</div>

						<div style={ { display: 'grid', gap: 6 } }>
							<span className="dsm-label">
								{ __( 'Frame', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									[ 'none', __( 'None', 'wunderpaint' ) ],
									[
										'browser',
										__( 'Browser', 'wunderpaint' ),
									],
									[ 'window', __( 'Window', 'wunderpaint' ) ],
									[ 'phone', __( 'Phone', 'wunderpaint' ) ],
									[ 'tablet', __( 'Tablet', 'wunderpaint' ) ],
									[ 'deco', __( 'Deco', 'wunderpaint' ) ],
								] }
								value={ params.frame }
								onChange={ ( v ) => patch( { frame: v } ) }
							/>
						</div>

						{ [ 'browser', 'window' ].includes( params.frame ) && (
							<div
								style={ {
									display: 'flex',
									gap: 14,
									alignItems: 'center',
									flexWrap: 'wrap',
								} }
							>
								<label
									style={ {
										display: 'flex',
										gap: 8,
										alignItems: 'center',
										fontSize: 12,
									} }
								>
									<input
										type="checkbox"
										checked={ params.dark }
										onChange={ ( e ) =>
											patch( { dark: e.target.checked } )
										}
									/>
									{ __( 'Dark chrome', 'wunderpaint' ) }
								</label>
								{ 'browser' === params.frame && (
									<input
										type="text"
										value={ params.url }
										placeholder="wp-image-editor.com"
										aria-label={ __(
											'Address bar text',
											'wunderpaint'
										) }
										onChange={ ( e ) =>
											patch( { url: e.target.value } )
										}
										style={ {
											flex: 1,
											minWidth: 140,
											padding: '5px 8px',
											border: '1px solid var(--ed-border-strong)',
											borderRadius: 4,
											background: 'var(--ed-panel-alt)',
											color: 'var(--ed-text)',
											fontSize: 12,
										} }
									/>
								) }
							</div>
						) }

						{ 'deco' === params.frame && (
							<div style={ { display: 'grid', gap: 10 } }>
								<Seg
									options={ [
										[
											'offset',
											__( 'Offset panes', 'wunderpaint' ),
										],
										[ 'ring', __( 'Ring', 'wunderpaint' ) ],
										[
											'corners',
											__( 'Corners', 'wunderpaint' ),
										],
									] }
									value={ deco.variant }
									onChange={ ( v ) =>
										patchDeco( { variant: v } )
									}
								/>
								<div
									style={ {
										display: 'grid',
										gridTemplateColumns: '1fr 1fr',
										gap: 12,
									} }
								>
									<Slider
										label={ __(
											'Strength',
											'wunderpaint'
										) }
										value={ deco.width }
										min={ 0 }
										max={ 100 }
										onChange={ ( v ) =>
											patchDeco( { width: v } )
										}
									/>
									{ 'offset' === deco.variant && (
										<Slider
											label={ __(
												'Angle',
												'wunderpaint'
											) }
											value={ deco.angle }
											min={ 0 }
											max={ 20 }
											onChange={ ( v ) =>
												patchDeco( { angle: v } )
											}
										/>
									) }
								</div>
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									{ params.colors.map( ( c, i ) => (
										<SwatchButton
											key={ i }
											color={ c }
											size={ 26 }
											title={ __(
												'Color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												patch( {
													colors: params.colors.map(
														( cc, j ) =>
															j === i ? v : cc
													),
												} )
											}
										/>
									) ) }
									<ColorsFrom
										onApply={ ( colors ) =>
											patch( {
												colors: colors.slice( 0, 2 ),
											} )
										}
									/>
									<button
										className="ai-btn secondary"
										onClick={ () => {
											patch( {
												colors: buildScheme(
													randomSchemeInput()
												).slice( 1, 3 ),
											} );
											patchDeco( {
												seed:
													1 +
													Math.floor(
														Math.random() * 1e9
													),
											} );
										} }
									>
										{ __( 'Randomize', 'wunderpaint' ) }
									</button>
								</div>
							</div>
						) }

						<div
							style={ {
								display: 'grid',
								gridTemplateColumns: '1fr 1fr',
								gap: 12,
							} }
						>
							<Slider
								label={ __( 'Padding', 'wunderpaint' ) }
								value={ params.padding }
								min={ 0 }
								max={ 40 }
								onChange={ ( v ) => patch( { padding: v } ) }
							/>
							<Slider
								label={ __( 'Corner radius', 'wunderpaint' ) }
								value={ params.radius }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { radius: v } ) }
							/>
							<Slider
								label={ __( 'Shadow', 'wunderpaint' ) }
								value={ params.shadow }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { shadow: v } ) }
							/>
							<Slider
								label={ __( 'Card border', 'wunderpaint' ) }
								value={ params.border }
								min={ 0 }
								max={ 100 }
								onChange={ ( v ) => patch( { border: v } ) }
							/>
						</div>
						<label
							style={ {
								display: 'grid',
								gap: 4,
								fontSize: 12,
								maxWidth: 220,
							} }
						>
							<span className="dsm-label">
								{ __( 'Canvas format', 'wunderpaint' ) }
							</span>
							<select
								className="dsm-select"
								value={ params.aspect }
								onChange={ ( e ) =>
									patch( { aspect: e.target.value } )
								}
							>
								<option value="original">
									{ __(
										'Original + padding',
										'wunderpaint'
									) }
								</option>
								<option value="16:9">16:9</option>
								<option value="4:3">4:3</option>
								<option value="1:1">1:1</option>
								<option value="og">
									{ __(
										'OG / social card (1.91:1)',
										'wunderpaint'
									) }
								</option>
							</select>
						</label>

						<div style={ { display: 'grid', gap: 8 } }>
							<span className="dsm-label">
								{ __( 'Backdrop', 'wunderpaint' ) }
							</span>
							<Seg
								options={ [
									[
										'studio',
										__(
											'Background Studio',
											'wunderpaint'
										),
									],
									[
										'solid',
										__( 'Solid color', 'wunderpaint' ),
									],
									[
										'none',
										__( 'Transparent', 'wunderpaint' ),
									],
								] }
								value={ bgMode }
								onChange={ setBgMode }
							/>
							{ 'studio' === bgMode && (
								<div
									style={ {
										display: 'flex',
										gap: 6,
										alignItems: 'center',
										flexWrap: 'wrap',
									} }
								>
									<select
										className="dsm-select"
										value={ bgParams.style }
										onChange={ ( e ) =>
											setBgParams( ( b ) => ( {
												...b,
												style: e.target.value,
											} ) )
										}
									>
										<option value="mesh">
											{ __(
												'Mesh Gradient',
												'wunderpaint'
											) }
										</option>
										<option value="organic">
											{ __( 'Organic', 'wunderpaint' ) }
										</option>
										<option value="geo">
											{ __( 'Geometric', 'wunderpaint' ) }
										</option>
										<option value="poly">
											{ __( 'Low-Poly', 'wunderpaint' ) }
										</option>
									</select>
									{ bgParams.colors
										.slice( 0, 4 )
										.map( ( c, i ) => (
											<SwatchButton
												key={ i }
												color={ c }
												size={ 26 }
												title={ __(
													'Color',
													'wunderpaint'
												) }
												onChange={ ( v ) =>
													setBgParams( ( b ) => ( {
														...b,
														colors: b.colors.map(
															( cc, j ) =>
																j === i ? v : cc
														),
													} ) )
												}
											/>
										) ) }
									<ColorsFrom
										onApply={ ( colors ) =>
											setBgParams( ( b ) => ( {
												...b,
												colors,
											} ) )
										}
									/>
									<button
										className="ai-btn secondary"
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
										onClick={ () =>
											setBgParams( ( b ) => ( {
												...b,
												seed:
													1 +
													Math.floor(
														Math.random() * 1e9
													),
											} ) )
										}
									>
										{ I.rotateCw( { size: 13 } ) }
										{ __( 'New variation', 'wunderpaint' ) }
									</button>
								</div>
							) }
							{ 'solid' === bgMode && (
								<SwatchButton
									color={ solidColor }
									size={ 26 }
									title={ __(
										'Background color',
										'wunderpaint'
									) }
									onChange={ ( v ) => setSolidColor( v ) }
								/>
							) }
						</div>
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
								minHeight: 180,
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
								'Opens as a new document in its own tab; your current work stays untouched.',
								'wunderpaint'
							) }
						</div>
					</div>
				</div>

				<div className="dsm-foot">
					<div className="dsm-hint">
						{ I.layers ? I.layers( { size: 14 } ) : null }
						{ __(
							'Opens in a new tab, all layers editable',
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
							disabled={ ! sourceReady || busy }
							onClick={ apply }
						>
							{ __( 'Beautify screenshot', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
