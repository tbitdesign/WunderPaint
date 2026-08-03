/**
 * 360° Panorama tool (v1.378.0): view any equirectangular image from the
 * document or the media library, repair the AI wrap seam, place linked
 * hotspots and copy a fully self-contained HTML embed. A tool, not a
 * studio - it lives in the Tools menu next to the Beautifier.
 */

import { useEffect, useMemo, useRef, useState } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { loadImage } from '../store/document';
import { saveAsNew, buildFormData } from '../lib/api';
import { wpMediaPick } from '../lib/media-pick';
import { fixSeam, panoramaAspectOk, applyNadirCap } from '../lib/panorama';
import {
	panoramaEmbedHtml,
	HOTSPOT_DEFAULT_COLOR,
} from '../lib/panorama-embed';
import { generatePanoramaDataUrl, insertResultLayer } from '../lib/ai-actions';
import { SwatchButton } from '../components/color-popover';
import { StyleButton } from '../components/style-picker';
import { PROVIDER_LABELS } from '../lib/providers';
import { PanoramaViewer } from './panorama-viewer';

const MAX_DIM = 8192;

/** Render a source URL onto a working canvas at (capped) natural size. */
async function sourceCanvas( src ) {
	const img = await loadImage( src );
	const scale = Math.min(
		1,
		MAX_DIM / Math.max( img.naturalWidth, img.naturalHeight )
	);
	const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
	const h = Math.max( 1, Math.round( img.naturalHeight * scale ) );
	const cv = document.createElement( 'canvas' );
	cv.width = w;
	cv.height = h;
	cv.getContext( '2d' ).drawImage( img, 0, 0, w, h );
	return cv;
}

export function PanoramaDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const imageLayers = useMemo(
		() => state.layers.filter( ( l ) => 'image' === l.type && l.src ),
		[ state.layers ]
	);
	const preselect =
		imageLayers.find(
			( l ) =>
				l.id === state.activeId &&
				panoramaAspectOk( l.naturalW || l.w, l.naturalH || l.h, 0.25 )
		) ||
		imageLayers.find( ( l ) =>
			panoramaAspectOk( l.naturalW || l.w, l.naturalH || l.h, 0.25 )
		) ||
		imageLayers[ 0 ];
	const [ layerId, setLayerId ] = useState( preselect?.id || '' );
	const [ libSrc, setLibSrc ] = useState( null ); // { src, name }
	const [ working, setWorking ] = useState( null ); // canvas after load/fix
	const [ fixed, setFixed ] = useState( false );
	const [ hotspots, setHotspots ] = useState( [] );
	// null | { mode: 'add' } | { mode: 'move', index } - the next viewer
	// click places a new hotspot or repositions an existing one.
	const [ placing, setPlacing ] = useState( null );
	const [ embedH, setEmbedH ] = useState( 480 );
	const [ busy, setBusy ] = useState( '' );
	const [ genPrompt, setGenPrompt ] = useState( '' );
	const [ genProviderSel, setGenProviderSel ] = useState(
		() => window.WPIE?.defaultProvider || ''
	);
	const [ creating, setCreating ] = useState( false );
	const [ horizon, setHorizon ] = useState( 0 );
	const [ arStart, setArStart ] = useState( false );
	const pristineRef = useRef( null );
	const hostRef = useRef( null );
	const viewerRef = useRef( null );
	const placingRef = useRef( null );
	placingRef.current = placing;
	useEscape( onClose );

	const src = libSrc
		? libSrc.src
		: imageLayers.find( ( l ) => l.id === layerId )?.src || '';

	// One viewer for the dialog's lifetime.
	useEffect( () => {
		const viewer = new PanoramaViewer( hostRef.current, {
			onClick: ( yaw, pitch ) => {
				const request = placingRef.current;
				if ( ! request ) {
					return;
				}
				setPlacing( null );
				const at = {
					yaw: Math.round( yaw * 10 ) / 10,
					pitch: Math.round( pitch * 10 ) / 10,
				};
				setHotspots( ( prev ) =>
					'move' === request.mode
						? prev.map( ( hs, i ) =>
								i === request.index ? { ...hs, ...at } : hs
						  )
						: [
								...prev,
								{
									...at,
									label: '',
									url: '',
									text: '',
									icon: '',
									color: '',
									size: 'm',
								},
						  ]
				);
			},
		} );
		viewerRef.current = viewer;
		return () => viewer.destroy();
	}, [] );

	// (Re)load the source into the viewer.
	useEffect( () => {
		let alive = true;
		setFixed( false );
		setWorking( null );
		if ( ! src ) {
			return undefined;
		}
		setHorizon( 0 );
		sourceCanvas( src )
			.then( ( cv ) => {
				if ( alive ) {
					const keep = document.createElement( 'canvas' );
					keep.width = cv.width;
					keep.height = cv.height;
					keep.getContext( '2d' ).drawImage( cv, 0, 0 );
					pristineRef.current = keep;
					setWorking( cv );
					viewerRef.current?.setImage( cv );
				}
			} )
			.catch( () =>
				extras?.toasts?.error?.(
					__( 'The image could not be loaded.', 'wunderpaint' )
				)
			);
		return () => {
			alive = false;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ src ] );

	useEffect( () => {
		viewerRef.current?.setHotspots( hotspots );
	}, [ hotspots ] );

	const aspectOff =
		working && ! panoramaAspectOk( working.width, working.height, 0.25 );

	const runFixSeam = () => {
		if ( ! working ) {
			return;
		}
		const ctx = working.getContext( '2d' );
		const px = ctx.getImageData( 0, 0, working.width, working.height );
		fixSeam( px.data, working.width, working.height );
		ctx.putImageData( px, 0, 0 );
		viewerRef.current?.setImage( working );
		// Face the wrap edge so the repair is immediately judgeable.
		viewerRef.current?.lookAt( 180 );
		setFixed( true );
		extras?.toasts?.success?.(
			__( 'Seam blended - check the horizon line.', 'wunderpaint' )
		);
	};

	const applyToLayer = () => {
		if ( ! working || libSrc || ! layerId ) {
			return;
		}
		const dataUrl = working.toDataURL( 'image/jpeg', 0.92 );
		dispatch( {
			type: 'UPDATE_LAYER',
			id: layerId,
			patch: {
				src: dataUrl,
				naturalW: working.width,
				naturalH: working.height,
			},
		} );
		commit( __( 'Fix panorama seam', 'wunderpaint' ) );
		setFixed( false );
		extras?.toasts?.success?.(
			__( 'Layer updated - undo restores the old image.', 'wunderpaint' )
		);
	};

	// Horizon slider (v1.379): vertical shift from the pristine copy, so
	// the slider stays re-adjustable; edge gaps stretch the border row.
	const applyHorizon = ( deg ) => {
		setHorizon( deg );
		const pristine = pristineRef.current;
		if ( ! working || ! pristine ) {
			return;
		}
		const w = working.width;
		const h = working.height;
		const off = Math.round( ( deg / 180 ) * h );
		const ctx = working.getContext( '2d' );
		ctx.clearRect( 0, 0, w, h );
		ctx.drawImage( pristine, 0, off );
		if ( off > 0 ) {
			ctx.drawImage( pristine, 0, 0, w, 1, 0, 0, w, off );
		} else if ( off < 0 ) {
			ctx.drawImage( pristine, 0, h - 1, w, 1, 0, h + off, w, -off );
		}
		viewerRef.current?.setImage( working );
		setFixed( true );
	};

	// Nadir cap (v1.379): the Brand-Kit logo covers the floor zone.
	const brandLogo = [
		window.WPIE?.brand,
		...( window.WPIE?.brandKits || [] ),
	].find( ( k ) => k && k.logoUrl )?.logoUrl;
	const applyNadirLogo = async () => {
		if ( ! working || ! brandLogo ) {
			return;
		}
		try {
			const logoImg = await loadImage( brandLogo );
			const tile = document.createElement( 'canvas' );
			tile.width = 512;
			tile.height = 512;
			const tctx = tile.getContext( '2d' );
			const scale =
				( 512 * 0.72 ) /
				Math.max( logoImg.naturalWidth, logoImg.naturalHeight );
			tctx.drawImage(
				logoImg,
				( 512 - logoImg.naturalWidth * scale ) / 2,
				( 512 - logoImg.naturalHeight * scale ) / 2,
				logoImg.naturalWidth * scale,
				logoImg.naturalHeight * scale
			);
			const ctx = working.getContext( '2d' );
			const px = ctx.getImageData( 0, 0, working.width, working.height );
			applyNadirCap(
				px.data,
				working.width,
				working.height,
				tctx.getImageData( 0, 0, 512, 512 ).data,
				512,
				512
			);
			ctx.putImageData( px, 0, 0 );
			viewerRef.current?.setImage( working );
			viewerRef.current?.lookAt( viewerRef.current?.viewYaw() || 0, -80 );
			setFixed( true );
			extras?.toasts?.success?.(
				__( 'Logo placed over the floor zone.', 'wunderpaint' )
			);
		} catch ( err ) {
			extras?.toasts?.error?.( err.message );
		}
	};

	const pickFromLibrary = async () => {
		const picker = window.WPIE?.pickMedia || wpMediaPick;
		const items = await picker( {
			multiple: false,
			types: 'image',
			title: __( 'Pick a 360° panorama', 'wunderpaint' ),
		} );
		if ( items && items[ 0 ] ) {
			setLibSrc( {
				src: items[ 0 ].url,
				name: items[ 0 ].filename || items[ 0 ].title || '',
			} );
		}
	};

	const copyEmbed = async () => {
		if ( ! working ) {
			return;
		}
		setBusy( 'embed' );
		try {
			let url = src;
			// The embed needs a public URL; edited or data-URL sources are
			// saved to the library first (JPEG - panoramas are photos).
			if ( fixed || ! /^https?:/.test( url ) ) {
				const blob = await new Promise( ( resolve ) =>
					working.toBlob( resolve, 'image/jpeg', 0.92 )
				);
				const response = await saveAsNew(
					buildFormData(
						{ file: blob },
						{ filename: 'panorama-360' }
					)
				);
				url = response.url;
			}
			const posterCanvas = document.createElement( 'canvas' );
			posterCanvas.width = 480;
			posterCanvas.height = 240;
			posterCanvas
				.getContext( '2d' )
				.drawImage( working, 0, 0, 480, 240 );
			const html = panoramaEmbedHtml( {
				src: url,
				hotspots,
				height: Math.round( embedH ) || 480,
				yaw: viewerRef.current?.viewYaw() || 0,
				autoRotate: arStart,
				poster: posterCanvas.toDataURL( 'image/jpeg', 0.55 ),
			} );
			await window.navigator.clipboard.writeText( html );
			extras?.toasts?.success?.(
				__(
					'Embed HTML copied - paste it into any Custom HTML block.',
					'wunderpaint'
				)
			);
		} catch ( err ) {
			extras?.toasts?.error?.( err.message );
		} finally {
			setBusy( '' );
		}
	};

	const patchHotspot = ( index, patch ) =>
		setHotspots( ( prev ) =>
			prev.map( ( hs, i ) => ( i === index ? { ...hs, ...patch } : hs ) )
		);

	// AI creation lives IN the tool: text-to-panorama, or the current
	// source photo rebuilt as a full sphere. Same providers and models as
	// the AI panel (the configured image provider decides the model);
	// pickable here, starting from the default provider.
	const configured = window.WPIE?.providers || {};
	const providerIds = Object.keys( configured ).filter(
		( k ) => configured[ k ]
	);
	const hasProvider = providerIds.length > 0;
	const genProvider = providerIds.includes( genProviderSel )
		? genProviderSel
		: providerIds.includes( window.WPIE?.defaultProvider )
		? window.WPIE.defaultProvider
		: providerIds[ 0 ];

	const createPanorama = async ( fromSource ) => {
		if ( ! hasProvider ) {
			extras?.toasts?.error?.(
				__( 'No AI provider configured.', 'wunderpaint' )
			);
			return;
		}
		setCreating( true );
		try {
			const image =
				fromSource && working
					? working.toDataURL( 'image/jpeg', 0.9 )
					: undefined;
			const url = await generatePanoramaDataUrl( {
				prompt: genPrompt,
				provider: genProvider,
				image,
			} );
			const layer = await insertResultLayer(
				editor,
				url,
				__( '360° Panorama', 'wunderpaint' )
			);
			setLibSrc( null );
			setLayerId( layer.id );
			extras?.toasts?.success?.(
				__( 'Panorama created and added as a layer.', 'wunderpaint' )
			);
		} catch ( err ) {
			extras?.toasts?.error?.( err.message );
		} finally {
			setCreating( false );
		}
	};

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="stock-dialog"
				style={ {
					width: 980,
					maxWidth: '97vw',
					height: 'auto',
					gridTemplateRows: 'auto 1fr auto',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( '360° Panorama', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( '360° Panorama', 'wunderpaint' ) }
							</span>
							<HelpLink article="panorama" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Walk through any equirectangular image, repair the seam, add hotspots, copy a self-contained embed.',
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
						padding: 16,
						display: 'grid',
						gridTemplateColumns: '1fr 270px',
						gap: 16,
					} }
				>
					<div
						ref={ hostRef }
						style={ {
							position: 'relative',
							height: 470,
							borderRadius: 8,
							overflow: 'hidden',
							background: '#101318',
							cursor: placing ? 'crosshair' : undefined,
						} }
					/>
					<div
						style={ {
							display: 'grid',
							gap: 16,
							alignContent: 'start',
							maxHeight: 470,
							overflowY: 'auto',
							paddingRight: 2,
						} }
					>
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Create with AI', 'wunderpaint' ) }
							</span>
							{ hasProvider && (
								<div
									style={ {
										display: 'flex',
										gap: 4,
										flexWrap: 'wrap',
									} }
								>
									{ providerIds.map( ( id ) => (
										<button
											key={ id }
											className={
												'ai-provider-pill' +
												( genProvider === id
													? ' active'
													: '' )
											}
											onClick={ () =>
												setGenProviderSel( id )
											}
										>
											<span className="dot" />
											{ PROVIDER_LABELS[ id ] || id }
										</button>
									) ) }
								</div>
							) }
							<div
								style={ {
									display: 'flex',
									justifyContent: 'flex-end',
									marginBottom: -2,
								} }
							>
								<StyleButton
									value={ genPrompt }
									onChange={ ( v ) => setGenPrompt( v ) }
								/>
							</div>
							<textarea
								rows={ 2 }
								placeholder={ __(
									'Describe the scene… (e.g. a cozy cabin interior at dusk)',
									'wunderpaint'
								) }
								value={ genPrompt }
								onChange={ ( e ) =>
									setGenPrompt( e.target.value )
								}
							/>
							<button
								className="ai-btn primary"
								disabled={ creating || ! genPrompt.trim() }
								onClick={ () => createPanorama( false ) }
							>
								{ creating
									? __( 'Generating…', 'wunderpaint' )
									: __(
											'Generate 360° panorama',
											'wunderpaint'
									  ) }
							</button>
							<button
								className="ai-btn secondary"
								disabled={ creating || ! working }
								title={ __(
									'Rebuilds the current source image as a full 360° sphere - same place, light and mood.',
									'wunderpaint'
								) }
								onClick={ () => createPanorama( true ) }
							>
								{ __( 'Turn source into 360°', 'wunderpaint' ) }
							</button>
						</div>
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Source', 'wunderpaint' ) }
							</span>
							<select
								value={ libSrc ? '__lib' : layerId }
								onChange={ ( e ) => {
									if ( '__lib' !== e.target.value ) {
										setLibSrc( null );
										setLayerId( e.target.value );
									}
								} }
							>
								{ imageLayers.map( ( l ) => (
									<option key={ l.id } value={ l.id }>
										{ l.name || 'Image' }
									</option>
								) ) }
								{ libSrc && (
									<option value="__lib">
										{ libSrc.name ||
											__(
												'Library image',
												'wunderpaint'
											) }
									</option>
								) }
							</select>
							<button
								className="ai-btn secondary"
								onClick={ pickFromLibrary }
							>
								{ __( 'From Media Library', 'wunderpaint' ) }
							</button>
						</div>
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Adjust', 'wunderpaint' ) }
							</span>
							<div style={ { display: 'flex', gap: 8 } }>
								<button
									className="ai-btn secondary"
									style={ { flex: 1 } }
									disabled={ ! working }
									title={ __(
										'Turns the view to the wrap edge (180°), where AI panoramas usually break.',
										'wunderpaint'
									) }
									onClick={ () =>
										viewerRef.current?.lookAt( 180 )
									}
								>
									{ __( 'Show seam', 'wunderpaint' ) }
								</button>
								<button
									className="ai-btn secondary"
									style={ { flex: 1 } }
									disabled={ ! working }
									onClick={ runFixSeam }
								>
									{ __( 'Fix seam', 'wunderpaint' ) }
								</button>
							</div>
							<label
								style={ {
									display: 'grid',
									gap: 4,
									fontSize: 12,
								} }
							>
								<span>
									{ __( 'Horizon', 'wunderpaint' ) }
									<span
										style={ {
											color: 'var(--ed-text-muted)',
											marginLeft: 6,
										} }
									>
										{ horizon }°
									</span>
								</span>
								<input
									type="range"
									min={ -15 }
									max={ 15 }
									value={ horizon }
									disabled={ ! working }
									onChange={ ( e ) =>
										applyHorizon( +e.target.value )
									}
								/>
							</label>
							<button
								className="ai-btn secondary"
								disabled={ ! working || ! brandLogo }
								title={
									brandLogo
										? __(
												'Covers the distorted floor zone with your Brand Kit logo.',
												'wunderpaint'
										  )
										: __(
												'Add a logo to a Brand Kit first.',
												'wunderpaint'
										  )
								}
								onClick={ applyNadirLogo }
							>
								{ __( 'Logo on the floor', 'wunderpaint' ) }
							</button>
							<button
								className="ai-btn secondary"
								disabled={ ! fixed || !! libSrc }
								title={ __(
									'Writes the repaired image back to the layer.',
									'wunderpaint'
								) }
								onClick={ applyToLayer }
							>
								{ __( 'Apply to layer', 'wunderpaint' ) }
							</button>
						</div>
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Hotspots', 'wunderpaint' ) }
							</span>
							<button
								className={
									'ai-btn ' +
									( placing && 'add' === placing.mode
										? 'primary'
										: 'secondary' )
								}
								disabled={ ! working }
								onClick={ () =>
									setPlacing( ( p ) =>
										p && 'add' === p.mode
											? null
											: { mode: 'add' }
									)
								}
							>
								{ placing && 'add' === placing.mode
									? __( 'Click to place…', 'wunderpaint' )
									: __( 'Add hotspot', 'wunderpaint' ) }
							</button>
							{ hotspots.map( ( hs, i ) => (
								<div
									key={ i }
									style={ {
										display: 'grid',
										gap: 4,
										padding: 8,
										border: '1px solid var(--ed-border, rgba(255,255,255,0.12))',
										borderRadius: 6,
									} }
								>
									<div
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
									>
										<input
											type="text"
											placeholder={ __(
												'Label',
												'wunderpaint'
											) }
											value={ hs.label }
											style={ { flex: 1 } }
											onChange={ ( e ) =>
												patchHotspot( i, {
													label: e.target.value,
												} )
											}
										/>
										<button
											className="dsm-close"
											aria-label={ __(
												'Remove hotspot',
												'wunderpaint'
											) }
											onClick={ () =>
												setHotspots( ( prev ) =>
													prev.filter(
														( _, k ) => k !== i
													)
												)
											}
										>
											{ I.close( { size: 13 } ) }
										</button>
									</div>
									<input
										type="text"
										placeholder={ __(
											'Link URL (optional)',
											'wunderpaint'
										) }
										value={ hs.url }
										onChange={ ( e ) =>
											patchHotspot( i, {
												url: e.target.value,
											} )
										}
									/>
									<textarea
										rows={ 2 }
										placeholder={ __(
											'Info text (optional) - opens as a small card',
											'wunderpaint'
										) }
										value={ hs.text || '' }
										onChange={ ( e ) =>
											patchHotspot( i, {
												text: e.target.value,
											} )
										}
									/>
									<div
										style={ {
											display: 'flex',
											gap: 6,
											alignItems: 'center',
										} }
									>
										<select
											value={ hs.icon || '' }
											aria-label={ __(
												'Hotspot icon',
												'wunderpaint'
											) }
											style={ { flex: 1 } }
											onChange={ ( e ) =>
												patchHotspot( i, {
													icon: e.target.value,
												} )
											}
										>
											<option value="">
												{ __(
													'Text pill',
													'wunderpaint'
												) }
											</option>
											<option value="pin">
												{ __( 'Pin', 'wunderpaint' ) }
											</option>
											<option value="info">
												{ __( 'Info', 'wunderpaint' ) }
											</option>
											<option value="arrow">
												{ __( 'Arrow', 'wunderpaint' ) }
											</option>
											<option value="play">
												{ __( 'Play', 'wunderpaint' ) }
											</option>
										</select>
										<SwatchButton
											color={
												hs.color ||
												HOTSPOT_DEFAULT_COLOR
											}
											size={ 22 }
											title={ __(
												'Hotspot color',
												'wunderpaint'
											) }
											onChange={ ( v ) =>
												patchHotspot( i, {
													color: v.slice( 0, 7 ),
												} )
											}
										/>
										<select
											value={ hs.size || 'm' }
											aria-label={ __(
												'Hotspot size',
												'wunderpaint'
											) }
											style={ { flex: 1 } }
											onChange={ ( e ) =>
												patchHotspot( i, {
													size: e.target.value,
												} )
											}
										>
											<option value="s">
												{ __( 'Small', 'wunderpaint' ) }
											</option>
											<option value="m">
												{ __(
													'Medium',
													'wunderpaint'
												) }
											</option>
											<option value="l">
												{ __( 'Large', 'wunderpaint' ) }
											</option>
										</select>
										<button
											className={
												'ai-btn sm ' +
												( placing &&
												'move' === placing.mode &&
												placing.index === i
													? 'primary'
													: 'secondary' )
											}
											onClick={ () =>
												setPlacing( ( p ) =>
													p &&
													'move' === p.mode &&
													p.index === i
														? null
														: {
																mode: 'move',
																index: i,
														  }
												)
											}
										>
											{ __( 'Move', 'wunderpaint' ) }
										</button>
									</div>
								</div>
							) ) }
						</div>
						<div className="dsm-sect">
							<span className="dsm-label">
								{ __( 'Embed', 'wunderpaint' ) }
							</span>
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
									checked={ arStart }
									onChange={ ( e ) =>
										setArStart( e.target.checked )
									}
								/>
								{ __(
									'Start with auto-rotate',
									'wunderpaint'
								) }
							</label>
							<label
								style={ {
									display: 'flex',
									gap: 8,
									alignItems: 'center',
									fontSize: 12,
								} }
							>
								{ __( 'Embed height', 'wunderpaint' ) }
								<input
									type="number"
									value={ embedH }
									min={ 200 }
									max={ 1200 }
									style={ { width: 80 } }
									onChange={ ( e ) =>
										setEmbedH( +e.target.value || 480 )
									}
								/>
								px
							</label>
							<div
								style={ {
									fontSize: 11,
									color: 'var(--ed-text-muted)',
								} }
							>
								{ sprintf(
									/* translators: %d: number of hotspots. */
									__(
										'The embed is self-contained: one HTML block, no plugin needed on the page. %d hotspot(s) included.',
										'wunderpaint'
									),
									hotspots.length
								) }
							</div>
						</div>
					</div>
				</div>
				<div className="dsm-foot">
					<span
						className="dsm-hint"
						style={
							aspectOff && ! placing && ! creating && ! busy
								? { color: 'var(--ed-warn, #e2a33d)' }
								: undefined
						}
					>
						{ ( () => {
							if ( busy ) {
								return __( 'Preparing…', 'wunderpaint' );
							}
							if ( creating ) {
								return __( 'Generating…', 'wunderpaint' );
							}
							if ( placing && 'move' === placing.mode ) {
								return __(
									'Click in the view to move the hotspot.',
									'wunderpaint'
								);
							}
							if ( placing ) {
								return __(
									'Click in the view to place the hotspot.',
									'wunderpaint'
								);
							}
							if ( aspectOff ) {
								return __(
									'This image is not 2:1 - it will look stretched in the sphere.',
									'wunderpaint'
								);
							}
							return __(
								'Drag to look around, scroll to zoom.',
								'wunderpaint'
							);
						} )() }
					</span>
					<div className="dsm-actions">
						<button
							className="ai-btn ghost"
							onClick={ onClose }
							disabled={ !! busy || creating }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={ ! working || !! busy }
							onClick={ copyEmbed }
						>
							{ busy
								? __( 'Preparing…', 'wunderpaint' )
								: __( 'Copy embed HTML', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
