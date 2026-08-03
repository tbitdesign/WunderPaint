/**
 * Replace an image in place (v1.351.0).
 *
 * Pick a file, see the two side by side, replace. The attachment id survives,
 * so nothing that points at this image has to be touched.
 *
 * Three things the dialog has to get right, because each one silently breaks a
 * site otherwise:
 *
 * 1. Format. "Keep the filename" has to mean the whole filename. Dropping a
 *    PNG onto a JPEG and keeping only the stem would rename foo.jpg to foo.png
 *    and every reference would point at nothing. So in that mode the file is
 *    converted to the original format before it goes up, and the dialog says
 *    so, including the transparency it will cost.
 *
 * 2. Aspect ratio. A square slot filled with a landscape photo does not
 *    "mostly work", it distorts or overflows wherever the theme constrains one
 *    side. When the ratios differ the dialog offers a ratio-locked crop.
 *
 * 3. Size. Sometimes the replacement should be exactly the old dimensions,
 *    sometimes the extra resolution is the point. Both are offered; nothing is
 *    resized behind the user's back.
 *
 * Pixels are only touched when one of those actually applies. An untouched
 * upload keeps its original encoding, which is always better than a re-encode.
 */

import { useState, useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { I } from '../icons';
import { useEscape } from '../components/use-escape';
import { uploadMediaFile, request } from '../lib/api';
import { fmtBytes } from '../lib/media-usage';
import { CropBox } from './crop-box';
import {
	extOf,
	fitCrop,
	losesTransparency,
	needsProcessing,
	loadImageFile,
	renderToFile,
	sameRatio,
	withExt,
} from '../lib/image-prep';

export function ReplaceDialog( { id, current, onClose, onDone, toasts } ) {
	const [ file, setFile ] = useState( null );
	const [ loaded, setLoaded ] = useState( null ); // { img, url, w, h }
	const [ mode, setMode ] = useState( 'keep' );
	const [ doCrop, setDoCrop ] = useState( false );
	const [ crop, setCrop ] = useState( null );
	const [ toOriginalSize, setToOriginalSize ] = useState( false );
	const [ busy, setBusy ] = useState( '' );
	const inputRef = useRef( null );
	const [ dragging, setDragging ] = useState( false );

	useEscape( busy ? () => {} : onClose );

	const oldExt = extOf( current?.name || current?.url || '' );
	const newExt = file ? extOf( file.name ) : '';
	const targetExt = 'keep' === mode ? oldExt || newExt : newExt;
	const converting = !! ( file && targetExt && newExt !== targetExt );
	const willFlatten = converting && losesTransparency( newExt, targetExt );

	const ratio = current?.w && current?.h ? current.w / current.h : 0;
	const ratioDiffers =
		!! loaded &&
		!! ratio &&
		! sameRatio( current.w, current.h, loaded.w, loaded.h );

	// Decode the picked file to get its real size, and seed the crop.
	useEffect( () => {
		if ( ! file ) {
			setLoaded( null );
			setCrop( null );
			setDoCrop( false );
			setToOriginalSize( false );
			return undefined;
		}
		let dead = false;
		let objUrl = '';
		loadImageFile( file )
			.then( ( res ) => {
				if ( dead ) {
					URL.revokeObjectURL( res.url );
					return;
				}
				objUrl = res.url;
				setLoaded( res );
				if (
					ratio &&
					! sameRatio( current.w, current.h, res.w, res.h )
				) {
					// Ratios differ, so cropping is almost certainly what the
					// user wants. Offer it switched on, with the largest
					// centred rectangle already in place.
					setCrop( fitCrop( res.w, res.h, ratio ) );
					setDoCrop( true );
				} else {
					setCrop( null );
					setDoCrop( false );
				}
			} )
			.catch( () => {
				if ( ! dead ) {
					toasts?.error(
						__( 'That file could not be read.', 'wunderpaint' )
					);
					setFile( null );
				}
			} );
		return () => {
			dead = true;
			if ( objUrl ) {
				URL.revokeObjectURL( objUrl );
			}
		};
		// current.w/h are stable for the lifetime of this dialog.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ file ] );

	const pick = ( f ) => {
		if ( ! f ) {
			return;
		}
		if ( ! /^image\//.test( f.type ) ) {
			toasts?.error( __( 'Choose an image file.', 'wunderpaint' ) );
			return;
		}
		setFile( f );
	};

	// What the replacement will actually be, once cropping and resizing apply.
	const outSize = ( () => {
		if ( ! loaded ) {
			return null;
		}
		if ( toOriginalSize && current?.w ) {
			return { w: current.w, h: current.h };
		}
		if ( doCrop && crop ) {
			return { w: Math.round( crop.w ), h: Math.round( crop.h ) };
		}
		return { w: loaded.w, h: loaded.h };
	} )();

	const run = async () => {
		if ( ! file || ! loaded ) {
			return;
		}
		setBusy( 'prep' );
		try {
			let out = file;
			const resize =
				!! outSize &&
				( outSize.w !== loaded.w || outSize.h !== loaded.h );

			if (
				needsProcessing( {
					crop: doCrop && !! crop,
					fromExt: newExt,
					toExt: targetExt,
					resize,
				} )
			) {
				out = await renderToFile( {
					img: loaded.img,
					crop: doCrop ? crop : null,
					outW: outSize?.w,
					outH: outSize?.h,
					ext: targetExt,
					name: withExt( file.name, targetExt ),
				} );
			}

			setBusy( 'upload' );
			// Upload first, then hand the carrier to the replace endpoint,
			// which consumes and deletes it.
			const up = await uploadMediaFile( out );
			setBusy( 'replace' );
			const res = await request( {
				path: '/media-replace',
				method: 'POST',
				data: { id, source: up.id, mode },
			} );
			toasts?.success(
				'new' === mode && res.rewritten
					? sprintf(
							/* translators: %d: number of places updated. */
							__(
								'Image replaced, %d reference(s) updated.',
								'wunderpaint'
							),
							res.rewritten
					  )
					: __( 'Image replaced.', 'wunderpaint' )
			);
			onDone?.( res );
		} catch ( e ) {
			toasts?.error(
				e.message || __( 'Replace failed.', 'wunderpaint' )
			);
			setBusy( '' );
		}
	};

	const busyLabel = {
		prep: __( 'Preparing…', 'wunderpaint' ),
		upload: __( 'Uploading…', 'wunderpaint' ),
		replace: __( 'Replacing…', 'wunderpaint' ),
	};

	return (
		// This sits inside the detail editor's own backdrop, so the click has
		// to stop here. Letting it bubble would close both at once.
		<div
			className="wpie-alt-editwrap"
			onClick={ ( e ) => {
				e.stopPropagation();
				if ( ! busy ) {
					onClose();
				}
			} }
			role="presentation"
		>
			<div
				className="wpie-mlm-cluster-panel wide wpie-replace"
				onClick={ ( e ) => e.stopPropagation() }
				role="dialog"
				aria-label={ __( 'Replace image', 'wunderpaint' ) }
			>
				<div className="dsm-head">
					<span className="dsm-badge">
						{ I.swap( { size: 24 } ) }
					</span>
					<div className="dsm-titles">
						<span className="dsm-title">
							{ __( 'Replace image', 'wunderpaint' ) }
						</span>
						<div className="dsm-sub">
							{ __(
								'The new file takes over this library entry, so everything that already points at this image keeps working.',
								'wunderpaint'
							) }
						</div>
					</div>
					<button
						className="dsm-close"
						onClick={ onClose }
						disabled={ !! busy }
						aria-label={ __( 'Close', 'wunderpaint' ) }
					>
						{ I.close( { size: 17 } ) }
					</button>
				</div>

				<div className="wpie-replace-body">
					{ doCrop && loaded ? (
						<CropPane
							loaded={ loaded }
							crop={ crop }
							ratio={ ratio }
							current={ current }
							onChange={ setCrop }
							onReset={ () =>
								setCrop( fitCrop( loaded.w, loaded.h, ratio ) )
							}
						/>
					) : (
						<Pair
							current={ current }
							file={ file }
							loaded={ loaded }
							dragging={ dragging }
							setDragging={ setDragging }
							pick={ pick }
							onBrowse={ () => inputRef.current?.click() }
						/>
					) }

					<input
						ref={ inputRef }
						type="file"
						accept="image/*"
						hidden
						onChange={ ( e ) => pick( e.target.files?.[ 0 ] ) }
					/>

					{ file && (
						<div className="wpie-replace-opts">
							{ ratioDiffers && (
								<label className="wpie-replace-check">
									<input
										type="checkbox"
										checked={ doCrop }
										onChange={ ( e ) => {
											setDoCrop( e.target.checked );
											if ( e.target.checked && loaded ) {
												setCrop(
													fitCrop(
														loaded.w,
														loaded.h,
														ratio
													)
												);
											}
										} }
									/>
									<span>
										<b>
											{ __(
												'Crop to the original shape',
												'wunderpaint'
											) }
										</b>
										<em>
											{ sprintf(
												/* translators: 1: old ratio, 2: new ratio. */
												__(
													'The current image is %1$s, the new one is %2$s. Without a crop it will not sit in the same space.',
													'wunderpaint'
												),
												ratioText(
													current?.w,
													current?.h
												),
												ratioText(
													loaded?.w,
													loaded?.h
												)
											) }
										</em>
									</span>
								</label>
							) }

							{ !! current?.w && (
								<label className="wpie-replace-check">
									<input
										type="checkbox"
										checked={ toOriginalSize }
										onChange={ ( e ) =>
											setToOriginalSize(
												e.target.checked
											)
										}
									/>
									<span>
										<b>
											{ sprintf(
												/* translators: 1: width, 2: height. */
												__(
													'Scale to the original size (%1$d × %2$d px)',
													'wunderpaint'
												),
												current.w,
												current.h
											) }
										</b>
										<em>
											{ __(
												'Leave this off to keep the higher resolution. WordPress generates the smaller sizes either way.',
												'wunderpaint'
											) }
										</em>
									</span>
								</label>
							) }

							{ converting && (
								<p className="wpie-replace-hint">
									{ I.alert( { size: 13 } ) }{ ' ' }
									{ sprintf(
										/* translators: 1: new format, 2: target format. */
										__(
											'Converted from %1$s to %2$s so the address stays exactly the same.',
											'wunderpaint'
										),
										newExt.toUpperCase(),
										targetExt.toUpperCase()
									) }
									{ willFlatten
										? ' ' +
										  __(
												'Transparency will be filled with white; pick the new filename instead to keep it.',
												'wunderpaint'
										  )
										: '' }
								</p>
							) }

							<fieldset className="wpie-replace-mode">
								<legend>
									{ __( 'Filename', 'wunderpaint' ) }
								</legend>
								<label>
									<input
										type="radio"
										name="wpie-replace-mode"
										checked={ 'keep' === mode }
										onChange={ () => setMode( 'keep' ) }
									/>
									<span>
										<b>
											{ __(
												'Keep the current filename',
												'wunderpaint'
											) }
										</b>
										<em>
											{ __(
												'Every address stays valid. Caches and CDNs may hold the old picture for a while.',
												'wunderpaint'
											) }
										</em>
									</span>
								</label>
								<label>
									<input
										type="radio"
										name="wpie-replace-mode"
										checked={ 'new' === mode }
										onChange={ () => setMode( 'new' ) }
									/>
									<span>
										<b>
											{ __(
												'Use the new filename',
												'wunderpaint'
											) }
										</b>
										<em>
											{ __(
												'The places that reference this image are rewritten one by one, so nothing is left pointing at a file that no longer exists.',
												'wunderpaint'
											) }
										</em>
									</span>
								</label>
							</fieldset>
						</div>
					) }
				</div>

				<div className="dsm-foot wpie-replace-foot">
					<span className="dsm-mono">
						{ outSize
							? sprintf(
									/* translators: 1: width, 2: height, 3: format. */
									__(
										'Result: %1$d × %2$d px %3$s',
										'wunderpaint'
									),
									outSize.w,
									outSize.h,
									( targetExt || '' ).toUpperCase()
							  )
							: '' }
					</span>
					<div className="dsm-actions">
						{ file && (
							<button
								className="ai-btn ghost"
								onClick={ () => inputRef.current?.click() }
								disabled={ !! busy }
							>
								{ __( 'Choose another', 'wunderpaint' ) }
							</button>
						) }
						<button
							className="ai-btn primary"
							onClick={ run }
							disabled={ ! file || ! loaded || !! busy }
						>
							{ busyLabel[ busy ] ||
								__( 'Replace image', 'wunderpaint' ) }
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

/** "4:3" style label, reduced so 1600x1200 reads as 4:3 and not 1600:1200. */
function ratioText( w, h ) {
	if ( ! w || ! h ) {
		return '';
	}
	const gcd = ( a, b ) => ( b ? gcd( b, a % b ) : a );
	const d = gcd( w, h ) || 1;
	const rw = Math.round( w / d );
	const rh = Math.round( h / d );
	// Anything past a two digit ratio is noise; fall back to a decimal.
	if ( rw > 40 || rh > 40 ) {
		return `${ ( w / h ).toFixed( 2 ) }:1`;
	}
	return `${ rw }:${ rh }`;
}

/** Side by side comparison, and the drop target before a file is chosen. */
function Pair( {
	current,
	file,
	loaded,
	dragging,
	setDragging,
	pick,
	onBrowse,
} ) {
	return (
		<div className="wpie-replace-pair">
			<figure className="wpie-replace-side">
				<span className="wpie-replace-cap">
					{ __( 'Current', 'wunderpaint' ) }
				</span>
				<img src={ current?.url } alt="" />
				<figcaption>
					{ current?.w ? `${ current.w } × ${ current.h } px` : '' }
					{ current?.size ? ' · ' + fmtBytes( current.size ) : '' }
				</figcaption>
			</figure>

			<span className="wpie-replace-arrow">
				{ I.arrDown( { size: 18 } ) }
			</span>

			<figure
				className={
					'wpie-replace-side drop' + ( dragging ? ' over' : '' )
				}
				onDragOver={ ( e ) => {
					e.preventDefault();
					setDragging( true );
				} }
				onDragLeave={ ( e ) => {
					// Entering a child also fires dragleave; only a real
					// exit ends the highlight (v1.364.0).
					if (
						e.relatedTarget &&
						e.currentTarget.contains( e.relatedTarget )
					) {
						return;
					}
					setDragging( false );
				} }
				onDrop={ ( e ) => {
					e.preventDefault();
					setDragging( false );
					pick( e.dataTransfer.files?.[ 0 ] );
				} }
			>
				<span className="wpie-replace-cap">
					{ __( 'New', 'wunderpaint' ) }
				</span>
				{ loaded ? (
					<img src={ loaded.url } alt="" />
				) : (
					<button
						type="button"
						className="wpie-replace-picker"
						onClick={ onBrowse }
					>
						{ I.upload( { size: 22 } ) }
						<span>
							{ __(
								'Choose a file or drop it here',
								'wunderpaint'
							) }
						</span>
					</button>
				) }
				<figcaption>
					{ loaded
						? `${ loaded.w } × ${ loaded.h } px · ${ fmtBytes(
								file.size
						  ) }`
						: '' }
				</figcaption>
			</figure>
		</div>
	);
}

/** The crop stage: mask on the left, what it will look like on the right. */
function CropPane( { loaded, crop, ratio, current, onChange, onReset } ) {
	return (
		<div className="wpie-replace-crop">
			<div className="wpie-replace-cropmain">
				<span className="wpie-replace-cap">
					{ __( 'Choose the section', 'wunderpaint' ) }
				</span>
				{ crop && (
					<CropBox
						src={ loaded.url }
						srcW={ loaded.w }
						srcH={ loaded.h }
						ratio={ ratio }
						crop={ crop }
						onChange={ onChange }
					/>
				) }
				<div className="wpie-replace-croprow">
					<span>
						{ crop
							? sprintf(
									/* translators: 1: width, 2: height. */
									__(
										'Selection %1$d × %2$d px',
										'wunderpaint'
									),
									Math.round( crop.w ),
									Math.round( crop.h )
							  )
							: '' }
					</span>
					<button className="wpie-mlm-link-btn" onClick={ onReset }>
						{ __( 'Centre and maximise', 'wunderpaint' ) }
					</button>
				</div>
			</div>

			<figure className="wpie-replace-side">
				<span className="wpie-replace-cap">
					{ __( 'Replaces', 'wunderpaint' ) }
				</span>
				<img src={ current?.url } alt="" />
				<figcaption>
					{ current?.w ? `${ current.w } × ${ current.h } px` : '' }
				</figcaption>
			</figure>
		</div>
	);
}
