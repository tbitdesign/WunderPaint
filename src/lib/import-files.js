/**
 * In-browser image placing (spec 05.6): drag-drop, paste, File→Open/Place.
 * Files become `image` layers as data URLs, never uploaded until save.
 * `.psd` files route to the PSD importer (plan task 33).
 */

import { __, sprintf } from '@wordpress/i18n';

import { makeImage, loadImage } from '../store/document';

/** Read a File into a data URL. */
const readAsDataUrl = ( file ) =>
	new Promise( ( resolve, reject ) => {
		const reader = new window.FileReader();
		reader.onload = () => resolve( reader.result );
		reader.onerror = () => reject( new Error( 'read failed' ) );
		reader.readAsDataURL( file );
	} );

/**
 * Import image (or PSD) files as new layers.
 *
 * @param {File[]}      files     Files.
 * @param {Object}      editor    Editor context value.
 * @param {Object}      extras    Extras bag (toasts, psd hooks).
 * @param {Object|null} dropPoint Doc point to center on (null = canvas center).
 */
export async function importFiles( files, editor, extras, dropPoint = null ) {
	const { state, dispatch, commit } = editor;

	for ( const file of files ) {
		if (
			/\.psd$/i.test( file.name ) ||
			'image/vnd.adobe.photoshop' === file.type
		) {
			if ( extras.importPsdFile ) {
				await extras.importPsdFile( file );
			} else {
				extras.toasts.error(
					__( 'PSD import is not available yet.', 'wunderpaint' )
				);
			}
			continue;
		}
		if ( ! file.type.startsWith( 'image/' ) ) {
			extras.toasts.error(
				sprintf(
					/* translators: %s: file name. */ __(
						'“%s” is not an image file.',
						'wunderpaint'
					),
					file.name
				)
			);
			continue;
		}
		try {
			const dataUrl = await readAsDataUrl( file );
			const img = await loadImage( dataUrl );

			// Scale to fit within the document (spec 05.6).
			const scale = Math.min(
				1,
				( state.doc.w * 0.9 ) / img.naturalWidth,
				( state.doc.h * 0.9 ) / img.naturalHeight
			);
			const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
			const h = Math.max( 1, Math.round( img.naturalHeight * scale ) );
			const center = dropPoint || {
				x: state.doc.w / 2,
				y: state.doc.h / 2,
			};

			const layer = makeImage( {
				name: file.name.replace( /\.[^.]+$/, '' ),
				x: Math.round( center.x - w / 2 ),
				y: Math.round( center.y - h / 2 ),
				w,
				h,
				src: dataUrl,
				naturalW: img.naturalWidth,
				naturalH: img.naturalHeight,
			} );
			dispatch( { type: 'ADD_LAYER', layer } );
			commit(
				sprintf(
					/* translators: %s: file name. */ __(
						'Place “%s”',
						'wunderpaint'
					),
					file.name
				)
			);
		} catch ( e ) {
			extras.toasts.error(
				sprintf(
					/* translators: %s: file name. */ __(
						'Could not read “%s”.',
						'wunderpaint'
					),
					file.name
				)
			);
		}
	}
}

/** File→Open/Place: open a file picker, then import (spec 04.1). */
export function openPlaceDialog( editor, extras ) {
	const input = document.createElement( 'input' );
	input.type = 'file';
	input.accept = 'image/*,.psd';
	input.multiple = true;
	input.onchange = () =>
		importFiles( Array.from( input.files || [] ), editor, extras, null );
	input.click();
}
