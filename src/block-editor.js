/**
 * Gutenberg host adapter for "edit in place" (v1.180.4).
 *
 * Adds an "Edit Image" toolbar button to core/image blocks that reference a
 * media-library attachment. It opens the shared overlay
 * (src/lib/embed-overlay.js) on that image and, on apply, writes the resulting
 * bound copy back into the block, so editing stays in place with no navigation.
 */

/* global WPIEBlock */

import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { BlockControls } from '@wordpress/block-editor';
import { ToolbarGroup, ToolbarButton } from '@wordpress/components';
import { dispatch } from '@wordpress/data';
import { Fragment } from '@wordpress/element';
import { __ } from '@wordpress/i18n';

import apiFetch from '@wordpress/api-fetch';

import { openEmbedEditor, openPickOverlay } from './lib/embed-overlay';

const withEditorButton = createHigherOrderComponent(
	( BlockEdit ) => ( props ) => {
		if ( 'core/image' !== props.name || ! props.attributes?.id ) {
			return <BlockEdit { ...props } />;
		}
		const edit = () =>
			openEmbedEditor( {
				editorBase: WPIEBlock.editorBase,
				attachmentId: props.attributes.id,
				host: 'gutenberg',
				strings: {
					loading: __( 'Loading editor…', 'wunderpaint' ),
					close: __( 'Close', 'wunderpaint' ),
					title: __( 'WunderPaint', 'wunderpaint' ),
				},
				onApplied: ( r ) =>
					dispatch( 'core/block-editor' ).updateBlockAttributes(
						props.clientId,
						{ id: r.attachmentId, url: r.url }
					),
			} );
		return (
			<Fragment>
				<BlockEdit { ...props } />
				<BlockControls>
					<ToolbarGroup>
						<ToolbarButton
							icon="edit"
							label={ __( 'Edit Image', 'wunderpaint' ) }
							onClick={ edit }
						/>
					</ToolbarGroup>
				</BlockControls>
			</Fragment>
		);
	},
	'withWpieEditorButton'
);

addFilter( 'editor.BlockEdit', 'wpie/editor-button', withEditorButton );

/* --- Media Library Manager as the block-editor picker (v1.245) ----------
 * The official `editor.MediaUpload` filter swaps Gutenberg's media picker
 * for the manager: image, gallery, video, audio and file blocks plus the
 * featured-image panel open it DIRECTLY, no wp.media modal in between.
 * The picked ids resolve through the REST media endpoint into the same
 * attachment shape the default picker hands to onSelect.
 */

/** MediaUpload allowedTypes -> the manager's pick scope. */
const pickTypesFor = ( allowedTypes ) => {
	const list = Array.isArray( allowedTypes )
		? allowedTypes
		: allowedTypes
		? [ allowedTypes ]
		: [];
	if ( 1 === list.length ) {
		const t = String( list[ 0 ] );
		if ( 'image' === t || 0 === t.indexOf( 'image/' ) ) {
			return 'image';
		}
		if ( 'video' === t || 0 === t.indexOf( 'video/' ) ) {
			return 'video';
		}
		if ( 'audio' === t || 0 === t.indexOf( 'audio/' ) ) {
			return 'audio';
		}
	}
	return 'all';
};

/** REST media record -> the attachment shape onSelect consumers read. */
const restToAttachment = ( m ) => {
	const mime = m.mime_type || '';
	const sizes = {};
	const details = m.media_details || {};
	Object.entries( details.sizes || {} ).forEach( ( [ slug, s ] ) => {
		sizes[ slug ] = {
			url: s.source_url,
			width: s.width,
			height: s.height,
			orientation: s.height > s.width ? 'portrait' : 'landscape',
		};
	} );
	return {
		id: m.id,
		url: m.source_url,
		link: m.link,
		title: m.title?.raw ?? m.title?.rendered ?? '',
		alt: m.alt_text || '',
		caption: m.caption?.raw ?? '',
		description: m.description?.raw ?? '',
		mime,
		type: mime.split( '/' )[ 0 ] || '',
		subtype: mime.split( '/' )[ 1 ] || '',
		width: details.width,
		height: details.height,
		filename: ( m.source_url || '' ).split( '/' ).pop(),
		sizes,
		media_details: details,
	};
};

const resolveMedia = ( ids ) =>
	Promise.all(
		ids.map( ( id ) =>
			apiFetch( { path: `/wp/v2/media/${ id }?context=edit` } )
				.then( restToAttachment )
				.catch( () => null )
		)
	).then( ( list ) => list.filter( Boolean ) );

const ManagerMediaUpload = ( props ) => {
	const {
		allowedTypes,
		multiple = false,
		value,
		addToGallery = false,
		onSelect,
		onClose,
		render,
	} = props;
	const open = () =>
		openPickOverlay( {
			editorBase: WPIEBlock.editorBase,
			multiple: !! multiple,
			types: pickTypesFor( allowedTypes ),
			strings: {
				loading: WPIEBlock.loading,
				title: WPIEBlock.title,
			},
			onPicked: ( ids ) => {
				if ( ! ids || ! ids.length ) {
					onClose?.();
					return;
				}
				// "Add to gallery" keeps the existing images: the new
				// selection is existing ids plus the picks.
				const base =
					addToGallery && Array.isArray( value )
						? value.filter( ( v ) => Number( v ) > 0 )
						: [];
				resolveMedia( [ ...base.map( Number ), ...ids ] ).then(
					( media ) => {
						if ( media.length ) {
							onSelect?.( multiple ? media : media[ 0 ] );
						}
						onClose?.();
					}
				);
			},
		} );
	return render( { open } );
};

if ( WPIEBlock.pickerManager ) {
	addFilter(
		'editor.MediaUpload',
		'wpie/manager-media-upload',
		() => ManagerMediaUpload
	);
}
