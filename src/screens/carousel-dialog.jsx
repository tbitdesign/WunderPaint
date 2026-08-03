/**
 * Carousel export (v1.1): slice the document into N tiles, as a ZIP
 * download or straight into the media library.
 */

import { useState, useEffect } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEditor } from '../store/editor-context';
import { useEscape } from '../components/use-escape';
import { HelpLink } from './help-dialog';
import { carouselSlices, sliceCarousel } from '../lib/carousel';
import {
	renderToCanvas,
	renderToDataURL,
	sharedImageCache,
} from '../lib/raster';
import { canvasToBlob } from '../lib/batch-export';
import { saveAsNew, buildFormData } from '../lib/api';
import { downloadBlob } from '../lib/download';

export function CarouselDialog( { onClose, extras } ) {
	const editor = useEditor();
	const { state } = editor;
	const { doc, layers } = state;
	const [ n, setN ] = useState( 3 );
	const [ format, setFormat ] = useState( 'jpeg' );
	const [ quality, setQuality ] = useState( 90 );
	const [ target, setTarget ] = useState( 'zip' );
	const [ busy, setBusy ] = useState( false );
	const [ preview, setPreview ] = useState( null );
	useEscape( () => ! busy && onClose() );

	useEffect( () => {
		let cancelled = false;
		renderToDataURL( doc, layers, {
			scale: Math.min( 380 / doc.w, 160 / doc.h, 1 ),
			format: 'png',
			cache: sharedImageCache,
		} )
			.then( ( url ) => ! cancelled && setPreview( url ) )
			.catch( () => {} );
		return () => {
			cancelled = true;
		};
	}, [ doc, layers ] );

	const run = async () => {
		setBusy( true );
		try {
			const master = await renderToCanvas( doc, layers, {
				scale: 1,
				cache: sharedImageCache,
			} );
			const tiles = sliceCarousel( master, n );
			const mime = 'jpeg' === format ? 'image/jpeg' : 'image/png';
			const ext = 'jpeg' === format ? 'jpg' : 'png';
			const q = Math.min( 1, Math.max( 0.1, quality / 100 ) );
			const base = doc.name || 'carousel';
			if ( 'zip' === target ) {
				const { default: JSZip } = await import(
					/* webpackChunkName: "jszip" */ 'jszip'
				);
				const zip = new JSZip();
				for ( let i = 0; i < tiles.length; i++ ) {
					zip.file(
						`${ base }-${ i + 1 }.${ ext }`,
						await canvasToBlob( tiles[ i ], mime, q )
					);
				}
				downloadBlob(
					await zip.generateAsync( { type: 'blob' } ),
					`${ base }-carousel.zip`
				);
			} else {
				for ( let i = 0; i < tiles.length; i++ ) {
					await saveAsNew(
						buildFormData(
							{ file: await canvasToBlob( tiles[ i ], mime, q ) },
							{
								format,
								quality,
								filename: `${ base }-${ i + 1 }`,
							}
						)
					);
				}
			}
			extras.toasts.success(
				sprintf(
					/* translators: %d: tile count. */
					__( '%d carousel tiles exported.', 'wunderpaint' ),
					tiles.length
				)
			);
			onClose();
		} catch ( err ) {
			extras.toasts.error( err.message );
		}
		setBusy( false );
	};

	return (
		<div
			className="modal-backdrop"
			onClick={ busy ? undefined : onClose }
			role="presentation"
		>
			<div
				className="stock-dialog"
				style={ {
					width: 440,
					height: 'auto',
					maxHeight: '85vh',
					gridTemplateRows: 'auto 1fr',
				} }
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Export Carousel', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.brand( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<div className="dsm-title-row">
							<span className="dsm-title">
								{ __( 'Export Carousel', 'wunderpaint' ) }
							</span>
							<HelpLink article="saving" extras={ extras } />
						</div>
						<div className="dsm-sub">
							{ __(
								'Exports the document as a numbered image sequence.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						aria-label={ __( 'Close', 'wunderpaint' ) }
						disabled={ busy }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>
				<div
					style={ {
						padding: 16,
						display: 'grid',
						gap: 12,
						overflowY: 'auto',
					} }
				>
					<div
						style={ {
							position: 'relative',
							justifySelf: 'center',
						} }
					>
						{ preview ? (
							<>
								<img
									src={ preview }
									alt=""
									style={ {
										maxWidth: 380,
										maxHeight: 160,
										display: 'block',
										boxShadow: '0 2px 10px rgba(0,0,0,.3)',
									} }
								/>
								{ carouselSlices( 100, n )
									.slice( 1 )
									.map( ( s ) => (
										<div
											key={ s.x }
											style={ {
												position: 'absolute',
												left: `${ s.x }%`,
												top: 0,
												bottom: 0,
												width: 0,
												borderLeft: '1.5px dashed #fff',
												boxShadow:
													'0 0 0 0.5px rgba(0,0,0,.6)',
											} }
										/>
									) ) }
							</>
						) : (
							<span className="spin" />
						) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 12,
							alignItems: 'center',
							fontSize: 12,
							flexWrap: 'wrap',
						} }
					>
						<label
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							{ __( 'Tiles', 'wunderpaint' ) }
							<input
								type="number"
								min="2"
								max="10"
								value={ n }
								style={ { width: 56 } }
								onChange={ ( e ) =>
									setN(
										Math.max(
											2,
											Math.min(
												10,
												Math.round(
													+e.target.value || 2
												)
											)
										)
									)
								}
							/>
						</label>
						<label
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							{ __( 'Format', 'wunderpaint' ) }
							<select
								className="dsm-select"
								value={ format }
								onChange={ ( e ) =>
									setFormat( e.target.value )
								}
							>
								<option value="jpeg">JPEG</option>
								<option value="png">PNG</option>
							</select>
						</label>
						{ 'jpeg' === format && (
							<label
								style={ {
									display: 'flex',
									gap: 6,
									alignItems: 'center',
								} }
							>
								{ __( 'Quality', 'wunderpaint' ) }
								<input
									type="number"
									min="10"
									max="100"
									value={ quality }
									style={ { width: 60 } }
									onChange={ ( e ) =>
										setQuality(
											Math.min(
												100,
												Math.max(
													10,
													+e.target.value || 90
												)
											)
										)
									}
								/>
							</label>
						) }
						<label
							style={ {
								display: 'flex',
								gap: 6,
								alignItems: 'center',
							} }
						>
							{ __( 'Save as', 'wunderpaint' ) }
							<select
								className="dsm-select"
								value={ target }
								onChange={ ( e ) =>
									setTarget( e.target.value )
								}
							>
								<option value="zip">
									{ __( 'ZIP download', 'wunderpaint' ) }
								</option>
								<option value="library">
									{ __(
										'New library images',
										'wunderpaint'
									) }
								</option>
							</select>
						</label>
					</div>
					<div
						style={ {
							fontSize: 11,
							color: 'var(--ed-text-muted)',
						} }
					>
						{ sprintf(
							/* translators: 1: tile count, 2: width, 3: height. */
							__( '%1$d tiles à %2$d × %3$d px', 'wunderpaint' ),
							n,
							Math.floor( doc.w / n ),
							doc.h
						) }
					</div>
					<div
						style={ {
							display: 'flex',
							gap: 8,
							justifyContent: 'flex-end',
						} }
					>
						<button
							className="ai-btn secondary"
							onClick={ onClose }
							disabled={ busy }
						>
							{ __( 'Cancel', 'wunderpaint' ) }
						</button>
						<button
							className="ai-btn primary"
							onClick={ run }
							disabled={ busy }
						>
							{ busy && <span className="spin" /> }
							{ __( 'Export', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
