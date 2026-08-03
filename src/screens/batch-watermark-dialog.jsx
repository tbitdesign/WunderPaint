/**
 * Batch Watermark (v1.135.0): ONE modal, TWO clear columns. Left holds
 * the watermark settings: the watermark image comes from a BRAND KIT
 * or a direct upload (watermarks are brand assets, not media-library
 * finds), plus compact position grid, sliders and a live preview that
 * shows the FIRST SELECTED TARGET (switchable to a neutral stage).
 * Right is one large media browser for selecting the target images.
 * The last settings are remembered.
 */

import { useState, useEffect, useRef, useId } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { MediaPicker } from '../components/media-picker';
import { watermarkRect, applyWatermark } from '../lib/watermark';
import { loadImage } from '../store/document';
import { saveAsNew, buildFormData, uploadMediaFile } from '../lib/api';
import { createCanvas } from '../lib/raster';

const STORE_KEY = 'wpie-batch-watermark';

const defaultSettings = () => {
	try {
		const stored = JSON.parse(
			window.localStorage.getItem( STORE_KEY ) || 'null'
		);
		if ( stored?.url ) {
			return stored;
		}
	} catch ( e ) {}
	// First run: the legacy Settings watermark makes a friendly default.
	const legacy = window.WPIE?.watermark;
	return {
		url: legacy?.url || '',
		pos: legacy?.pos || 'br',
		scale: legacy?.scale || 20,
		opacity: legacy?.opacity ?? 70,
		margin: legacy?.margin ?? 16,
	};
};

// True 3x3 anchor grid, center in the middle.
const POSITIONS = [
	[ 'tl', null, 'tr' ],
	[ null, 'center', null ],
	[ 'bl', null, 'br' ],
];
const POS_LABEL = {
	tl: __( 'Top left', 'wunderpaint' ),
	tr: __( 'Top right', 'wunderpaint' ),
	center: __( 'Center', 'wunderpaint' ),
	bl: __( 'Bottom left', 'wunderpaint' ),
	br: __( 'Bottom right', 'wunderpaint' ),
};
const FIELD_LABEL = {
	scale: __( 'Size', 'wunderpaint' ),
	opacity: __( 'Opacity', 'wunderpaint' ),
	margin: __( 'Margin', 'wunderpaint' ),
};

/**
 * Live preview. With a target it shows the REAL first selected image
 * (contained) and places the watermark exactly like the batch run
 * (margins in output pixels, scaled to the preview); without one, a
 * neutral stage.
 */
function Preview( { wm, target } ) {
	const ref = useRef( null );
	useEffect( () => {
		const canvas = ref.current;
		if ( ! canvas ) {
			return undefined;
		}
		const ctx = canvas.getContext( '2d' );
		let cancelled = false;

		const drawWatermark = ( area ) => {
			if ( ! wm.url ) {
				return;
			}
			loadImage( wm.url )
				.then( ( img ) => {
					if ( cancelled ) {
						return;
					}
					const factor = area.natW
						? area.w / area.natW
						: area.w / 1200;
					const rect = watermarkRect( {
						canvasW: area.natW || 1200,
						canvasH:
							area.natH ||
							Math.round( 1200 * ( area.h / area.w ) ),
						imgW: img.naturalWidth || img.width,
						imgH: img.naturalHeight || img.height,
						pos: wm.pos,
						scale: wm.scale,
						margin: wm.margin || 0,
					} );
					ctx.globalAlpha = Math.min(
						1,
						Math.max( 0, ( wm.opacity ?? 70 ) / 100 )
					);
					ctx.imageSmoothingQuality = 'high';
					ctx.drawImage(
						img,
						area.x + rect.x * factor,
						area.y + rect.y * factor,
						rect.w * factor,
						rect.h * factor
					);
					ctx.globalAlpha = 1;
				} )
				.catch( () => {} );
		};

		const flatStage = () => {
			ctx.fillStyle = '#5b6472';
			ctx.fillRect( 0, 0, canvas.width, canvas.height );
			ctx.strokeStyle = 'rgba(255,255,255,0.25)';
			for ( let x = 0; x < canvas.width; x += 24 ) {
				ctx.beginPath();
				ctx.moveTo( x, 0 );
				ctx.lineTo( x, canvas.height );
				ctx.stroke();
			}
			drawWatermark( {
				x: 0,
				y: 0,
				w: canvas.width,
				h: canvas.height,
				natW: 0,
				natH: 0,
			} );
		};

		ctx.clearRect( 0, 0, canvas.width, canvas.height );
		ctx.fillStyle = '#2a2e35';
		ctx.fillRect( 0, 0, canvas.width, canvas.height );

		if ( ! target ) {
			flatStage();
			return () => {
				cancelled = true;
			};
		}
		loadImage( target.fullUrl || target.url )
			.then( ( img ) => {
				if ( cancelled ) {
					return;
				}
				const natW = img.naturalWidth || img.width;
				const natH = img.naturalHeight || img.height;
				const f = Math.min( canvas.width / natW, canvas.height / natH );
				const w = Math.round( natW * f );
				const h = Math.round( natH * f );
				const x = Math.round( ( canvas.width - w ) / 2 );
				const y = Math.round( ( canvas.height - h ) / 2 );
				ctx.imageSmoothingQuality = 'high';
				ctx.drawImage( img, x, y, w, h );
				drawWatermark( { x, y, w, h, natW, natH } );
			} )
			.catch( () => flatStage() );
		return () => {
			cancelled = true;
		};
	}, [ wm.url, wm.pos, wm.scale, wm.opacity, wm.margin, target ] );

	return (
		<canvas
			ref={ ref }
			width={ 280 }
			height={ 175 }
			className="wm-preview"
		/>
	);
}

export function BatchWatermarkDialog( { onClose, extras, initialTargets } ) {
	// Unique per mounted dialog, so two of them can never share an id.
	const fieldId = useId();
	useEscape( onClose );
	const [ wm, setWm ] = useState( defaultSettings );
	// Tools (Media Library Manager) can hand a preselection over; the
	// item shape matches the media browser's ({id, url, title, ...}).
	const [ targets, setTargets ] = useState(
		() => new Map( ( initialTargets || [] ).map( ( it ) => [ it.id, it ] ) )
	);
	const [ progress, setProgress ] = useState( null ); // { done, total }
	// Preview stage: the real first selected image, or the neutral area.
	const [ stageMode, setStageMode ] = useState( 'real' );

	const patch = ( changes ) =>
		setWm( ( prev ) => ( { ...prev, ...changes } ) );

	// Watermarks are brand assets: offer the kits' watermarks + upload.
	const kitMarks = ( window.WPIE?.brandKits || [] ).filter(
		( k ) => k.watermarkUrl
	);
	const uploadWatermark = async ( e ) => {
		const file = e.target.files?.[ 0 ];
		e.target.value = '';
		if ( ! file ) {
			return;
		}
		try {
			const up = await uploadMediaFile( file );
			patch( { url: up.url } );
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
	};

	const toggleTarget = ( item ) =>
		setTargets( ( prev ) => {
			const next = new Map( prev );
			if ( next.has( item.id ) ) {
				next.delete( item.id );
			} else {
				next.set( item.id, item );
			}
			return next;
		} );

	const run = async () => {
		if ( ! wm.url || ! targets.size || progress ) {
			return;
		}
		try {
			window.localStorage.setItem( STORE_KEY, JSON.stringify( wm ) );
		} catch ( e ) {}
		setProgress( { done: 0, total: targets.size } );
		let done = 0;
		let failed = 0;
		try {
			const wmImg = await loadImage( wm.url );
			for ( const item of targets.values() ) {
				try {
					const img = await loadImage( item.fullUrl || item.url );
					const canvas = createCanvas(
						img.naturalWidth,
						img.naturalHeight
					);
					canvas.getContext( '2d' ).drawImage( img, 0, 0 );
					applyWatermark( canvas, wmImg, wm );
					const blob = await new Promise( ( resolve ) =>
						canvas.toBlob( resolve, 'image/jpeg', 0.92 )
					);
					const base = ( item.title || `image-${ item.id }` ).replace(
						/\.[a-z0-9]+$/i,
						''
					);
					await saveAsNew(
						buildFormData(
							{ file: blob },
							{
								format: 'jpeg',
								filename: `${ base }-watermarked`,
								alt: item.alt || '',
								title: item.title || '',
							}
						)
					);
					done++;
				} catch ( err ) {
					failed++;
				}
				setProgress( { done: done + failed, total: targets.size } );
			}
		} finally {
			setProgress( null );
		}
		if ( failed ) {
			extras.toasts.error(
				sprintf(
					/* translators: 1: done count, 2: failed count. */
					__(
						'Watermarked %1$d image(s), %2$d failed.',
						'wunderpaint'
					),
					done,
					failed
				)
			);
		} else {
			extras.toasts.success(
				sprintf(
					/* translators: %d: image count. */
					__(
						'Watermarked %d image(s), saved as new attachments.',
						'wunderpaint'
					),
					done
				)
			);
			onClose();
		}
	};

	const slider = ( key, min, max, suffix ) => (
		<div
			className="slider-row"
			style={ { gridTemplateColumns: '70px 1fr 46px' } }
		>
			<label htmlFor={ fieldId + '-' + key }>
				{ FIELD_LABEL[ key ] }
			</label>
			<input
				id={ fieldId + '-' + key }
				type="range"
				min={ min }
				max={ max }
				value={ wm[ key ] }
				onChange={ ( e ) => patch( { [ key ]: +e.target.value } ) }
			/>
			<span className="val">
				{ wm[ key ] }
				{ suffix }
			</span>
		</div>
	);

	return (
		<div className="modal-backdrop" onClick={ onClose } role="presentation">
			<div
				className="export-dialog watermark-dialog"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Batch Watermark', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Batch Watermark', 'wunderpaint' ) }
						</span>
						<HelpLink article="settings" extras={ extras } />
						<div className="dsm-sub">
							{ __(
								'Pick a watermark image, tune it, choose the images, done.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close ? I.close( { size: 17 } ) : '✕' }
					</button>
				</div>
				<div className="export-body">
					<div className="wm-columns">
						<div className="wm-editor-form">
							<div className="library-subhead">
								{ __( 'Watermark', 'wunderpaint' ) }
							</div>
							<div className="wm-image-row">
								{ kitMarks.map( ( kit ) => (
									<button
										key={ kit.id }
										className={
											wm.url === kit.watermarkUrl
												? 'wm-source active'
												: 'wm-source'
										}
										title={ kit.name }
										onClick={ () =>
											patch( { url: kit.watermarkUrl } )
										}
									>
										<img src={ kit.watermarkUrl } alt="" />
										<span>{ kit.name }</span>
									</button>
								) ) }
								{ wm.url &&
									! kitMarks.some(
										( k ) => k.watermarkUrl === wm.url
									) && (
										<span
											className="wm-source active"
											title={ __(
												'Uploaded watermark',
												'wunderpaint'
											) }
										>
											<img src={ wm.url } alt="" />
											<span>
												{ __(
													'Upload',
													'wunderpaint'
												) }
											</span>
										</span>
									) }
								<label
									className="ai-btn secondary sm"
									style={ { cursor: 'pointer' } }
								>
									{ __( 'Upload image', 'wunderpaint' ) }
									<input
										type="file"
										accept="image/png,image/webp,image/jpeg,image/svg+xml"
										style={ { display: 'none' } }
										onChange={ uploadWatermark }
									/>
								</label>
							</div>
							{ ! kitMarks.length && (
								<div className="wm-hint">
									{ __(
										'Tip: store watermarks in your Brand Kits, they show up here as one-click choices.',
										'wunderpaint'
									) }
								</div>
							) }
							<Preview
								wm={ wm }
								target={
									'real' === stageMode
										? targets.values().next().value || null
										: null
								}
							/>
							<div className="wm-stage-toggle">
								<button
									className={
										'real' === stageMode ? 'active' : ''
									}
									onClick={ () => setStageMode( 'real' ) }
								>
									{ __( 'Selected image', 'wunderpaint' ) }
								</button>
								<button
									className={
										'flat' === stageMode ? 'active' : ''
									}
									onClick={ () => setStageMode( 'flat' ) }
								>
									{ __( 'Neutral area', 'wunderpaint' ) }
								</button>
							</div>
							<div className="wm-settings-row">
								<div>
									<span
										className="dsm-label"
										id={ fieldId + '-pos' }
										style={ {
											display: 'block',
											marginBottom: 4,
										} }
									>
										{ __( 'Position', 'wunderpaint' ) }
									</span>
									<div
										className="wm-pos-grid"
										role="group"
										aria-labelledby={ fieldId + '-pos' }
									>
										{ POSITIONS.map( ( row, r ) =>
											row.map( ( pos, c ) =>
												pos ? (
													<button
														key={ pos }
														className={
															wm.pos === pos
																? 'wm-pos active'
																: 'wm-pos'
														}
														title={
															POS_LABEL[ pos ]
														}
														onClick={ () =>
															patch( { pos } )
														}
													>
														<span />
													</button>
												) : (
													<span
														key={ `${ r }-${ c }` }
													/>
												)
											)
										) }
									</div>
								</div>
								<div className="wm-sliders">
									{ slider( 'scale', 5, 50, '%' ) }
									{ slider( 'opacity', 0, 100, '%' ) }
									{ slider( 'margin', 0, 100, 'px' ) }
								</div>
							</div>
						</div>

						<div>
							<div className="library-subhead">
								{ sprintf(
									/* translators: %d: selected count. */
									__(
										'Select the images to watermark (%d selected)',
										'wunderpaint'
									),
									targets.size
								) }
							</div>
							<MediaPicker
								height={ 420 }
								selected={ new Set( targets.keys() ) }
								onPick={ toggleTarget }
							/>
						</div>
					</div>
				</div>
				<div className="dsm-foot">
					<span className="dsm-mono">
						{ progress
							? sprintf(
									/* translators: 1: done count, 2: total count. */
									__(
										'Watermarking %1$d / %2$d',
										'wunderpaint'
									),
									progress.done,
									progress.total
							  )
							: __(
									'Copies are saved as new attachments, originals stay untouched.',
									'wunderpaint'
							  ) }
					</span>
					<div className="dsm-actions">
						<button className="ai-btn ghost" onClick={ onClose }>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							disabled={
								! wm.url || ! targets.size || !! progress
							}
							title={
								! wm.url
									? __(
											'Choose a watermark image first.',
											'wunderpaint'
									  )
									: ! targets.size
									? __(
											'Select at least one image.',
											'wunderpaint'
									  )
									: undefined
							}
							onClick={ run }
						>
							{ progress && <span className="spin" /> }
							{ sprintf(
								/* translators: %d: image count. */
								__( 'Watermark %d image(s)', 'wunderpaint' ),
								targets.size
							) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
