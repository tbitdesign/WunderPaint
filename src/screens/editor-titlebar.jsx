/**
 * Title bar (spec 04.1), ported from the prototype and fully wired.
 */

import { useEffect, useRef } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';
import { confirmDialog } from '../lib/dialogs';
import { renderToBlob, sharedImageCache } from '../lib/raster';
import { downloadBlob } from '../lib/download';
import { useToasts } from '../components/toasts';

import { I } from '../icons';
import { WpieLogo } from '../components/logo';
import { attachBlasterTrigger } from '../lib/blaster';
import { getPsdExporter } from '../lib/psd-registry';
import {
	isEmbedded,
	isLibraryEmbed,
	embedHostLabel,
	postCancelled,
} from '../lib/embed-host';
import { useEditor } from '../store/editor-context';

export function EditorTitleBar( { onExport, nested, extras } ) {
	const { state, dispatch, undo, redo, canUndo, canRedo, dirty, WPIE } =
		useEditor();
	const toasts = useToasts();
	const { doc, theme } = state;

	// Five quick clicks on the brand mark start the Pixel Blaster easter egg.
	const brandRef = useRef( null );
	useEffect( () => attachBlasterTrigger( brandRef.current ), [] );

	const setTheme = ( next ) => {
		dispatch( { type: 'SET_THEME', theme: next } );
		try {
			window.localStorage.setItem( 'wpie-theme', next );
		} catch ( e ) {}
	};

	const backToLibrary = async () => {
		if (
			dirty &&
			! ( await confirmDialog( {
				title: __( 'Unsaved changes', 'wunderpaint' ),
				message: __( 'Discard unsaved changes?', 'wunderpaint' ),
				confirmLabel: __( 'Discard', 'wunderpaint' ),
				danger: true,
			} ) )
		) {
			return;
		}
		if ( nested ) {
			nested.onCancel();
			return;
		}
		window.location = WPIE.returnUrl || WPIE.libraryUrl;
	};

	return (
		<div className="ed-titlebar">
			<div
				className="ed-brand"
				ref={ brandRef }
				title={ __( 'WunderPaint', 'wunderpaint' ) }
			>
				<WpieLogo height={ 26 } />
			</div>
			<div className="ed-divider" />
			<div className="ed-doc">
				<span>
					{ doc.source?.isNew
						? __( 'Creating:', 'wunderpaint' )
						: __( 'Editing:', 'wunderpaint' ) }
				</span>
				<b>{ doc.name }</b>
				{ doc.source?.templateId && (
					<span
						className="ed-tpl-badge"
						title={ __(
							'This document is a dynamic template: saving updates the template.',
							'wunderpaint'
						) }
					>
						{ __( 'Template', 'wunderpaint' ) }
					</span>
				) }
				<span style={ { opacity: 0.6, fontSize: 12 } }>
					· { doc.w }×{ doc.h }
				</span>
				{ dirty && (
					<span
						className="dirty"
						title={ __( 'Unsaved changes', 'wunderpaint' ) }
					/>
				) }
			</div>
			<div className="spacer" />
			<button
				title={ __( 'Undo (⌘Z)', 'wunderpaint' ) }
				onClick={ undo }
				disabled={ ! canUndo }
				style={ canUndo ? undefined : { opacity: 0.4 } }
			>
				{ I.undo( { size: 14 } ) }
			</button>
			<button
				title={ __( 'Redo (⇧⌘Z)', 'wunderpaint' ) }
				onClick={ redo }
				disabled={ ! canRedo }
				style={ canRedo ? undefined : { opacity: 0.4 } }
			>
				{ I.redo( { size: 14 } ) }
			</button>
			<div className="ed-divider" />
			{ ! nested && (
				<button
					title={ __(
						'Quick export with the last used settings',
						'wunderpaint'
					) }
					onClick={ async () => {
						let settings = { format: 'png', quality: 92, scale: 1 };
						try {
							settings = {
								...settings,
								...JSON.parse(
									window.localStorage?.getItem(
										'wpie-last-export'
									) || '{}'
								),
							};
						} catch ( e ) {}
						try {
							// PSD must go through the real layer writer;
							// renderToBlob would silently produce a flat
							// PNG with a .psd extension.
							if ( 'psd' === settings.format ) {
								const psdExporter = getPsdExporter();
								if ( ! psdExporter ) {
									throw new Error( 'no psd exporter' );
								}
								const bytes = await psdExporter(
									state.doc,
									state.layers
								);
								downloadBlob(
									new window.Blob( [ bytes ], {
										type: 'image/vnd.adobe.photoshop',
									} ),
									`${ state.doc.name || 'image' }.psd`
								);
								toasts.success(
									__( 'Quick export done.', 'wunderpaint' )
								);
								return;
							}
							// Animation/PDF/extension formats need their
							// dialog options; reopen it instead of guessing.
							if (
								[ 'gif', 'apng', 'webm', 'pdf' ].includes(
									settings.format
								) ||
								settings.format.includes( '/' )
							) {
								onExport( 'export' );
								return;
							}
							// JPEG has no alpha: flatten transparent docs on white
							// so quick export never turns them black (v1.130.0).
							const quickDoc =
								'jpeg' === settings.format &&
								( ! state.doc.bg ||
									'transparent' === state.doc.bg )
									? { ...state.doc, bg: '#ffffff' }
									: state.doc;
							const blob = await renderToBlob(
								quickDoc,
								state.layers,
								{ ...settings, cache: sharedImageCache }
							);
							downloadBlob(
								blob,
								`${ state.doc.name || 'image' }.${
									'jpeg' === settings.format
										? 'jpg'
										: settings.format
								}`
							);
							toasts.success(
								__( 'Quick export done.', 'wunderpaint' )
							);
						} catch ( e ) {
							toasts.error(
								__( 'Quick export failed.', 'wunderpaint' )
							);
						}
					} }
				>
					{ I.download ? I.download( { size: 14 } ) : '⇩' }
				</button>
			) }
			{ ! nested && state.doc.source?.originalUrl && (
				<button
					className="compare-toggle"
					title={ __(
						'Hold to compare with the saved original',
						'wunderpaint'
					) }
					onPointerDown={ () =>
						dispatch( { type: 'SET_COMPARE', on: true } )
					}
					onPointerUp={ () =>
						dispatch( { type: 'SET_COMPARE', on: false } )
					}
					onPointerLeave={ () =>
						dispatch( { type: 'SET_COMPARE', on: false } )
					}
				>
					{ I.eye ? I.eye( { size: 14 } ) : '👁' }{ ' ' }
					{ __( 'Compare', 'wunderpaint' ) }
				</button>
			) }
			<button
				className="theme-toggle"
				onClick={ () =>
					setTheme( 'dark' === theme ? 'light' : 'dark' )
				}
				title={ __( 'Toggle theme', 'wunderpaint' ) }
			>
				{ 'dark' === theme
					? I.sun( { size: 14 } )
					: I.moon( { size: 14 } ) }
			</button>
			<button onClick={ backToLibrary }>
				{ nested
					? __( 'Cancel', 'wunderpaint' )
					: WPIE.returnUrl
					? __( 'Back to Post', 'wunderpaint' )
					: __( 'Back to Media Library', 'wunderpaint' ) }
			</button>
			{ /* Post preview is a core feature: one-click toggle up here
			   (v1.68) - except on hosts without posts (standalone). */ }
			{ ! nested && ! window.WPIE?.standalone && (
				<button
					className={
						state.previewPost ? 'preview-active' : undefined
					}
					onClick={ () =>
						state.previewPost
							? dispatch( {
									type: 'SET_PREVIEW_POST',
									post: null,
							  } )
							: extras?.openPostPreview?.()
					}
				>
					{ I.link ? I.link( { size: 13 } ) : null }{ ' ' }
					{ state.previewPost
						? __( 'Exit Post Preview', 'wunderpaint' )
						: __( 'Preview with Post', 'wunderpaint' ) }
				</button>
			) }
			{ /* Hidden in element-bound embeds (v1.236): Apply already saves a
			   copy there, a second identical entry point only confused. Also
			   hidden in demo mode (v1.307): the library is read-only there. */ }
			{ ! nested &&
				! window.WPIE?.demo &&
				( ! isEmbedded() || isLibraryEmbed() ) && (
					<button onClick={ () => onExport( 'saveAs' ) }>
						{ __( 'Save as New Image', 'wunderpaint' ) }
					</button>
				) }
			{ ! nested && doc.source?.isNew && doc.source?.templateId ? (
				// Template documents save WHERE THEY LIVE (v1.160.0); the
				// media library stays reachable via Save as New Image.
				<button
					className="primary"
					onClick={ async () => {
						const { updateTemplateOp } = await import(
							'../store/ops'
						);
						updateTemplateOp(
							{ state, dispatch },
							{ toasts, ...( extras || {} ) }
						);
					} }
				>
					{ I.save( { size: 14 } ) }{ ' ' }
					{ __( 'Update Template', 'wunderpaint' ) }
				</button>
			) : isEmbedded() && ! nested ? (
				// Edit-in-place from a host: Close (cancel back to the host)
				// sits NEXT TO the primary action. From the media LIBRARY grid
				// the user manages the attachment itself, so the primary is the
				// normal overwrite save (with versioning); element-bound hosts
				// (builders, insert flows) keep Apply, which saves a bound COPY
				// back to the element (v1.180.0) so shared originals are never
				// silently changed.
				<>
					<button onClick={ () => postCancelled() }>
						{ __( 'Close', 'wunderpaint' ) }
					</button>
					{ isLibraryEmbed() ? (
						<button
							className="primary"
							onClick={ () => onExport( 'save' ) }
						>
							{ I.save( { size: 14 } ) }{ ' ' }
							{ __( 'Save to Media Library', 'wunderpaint' ) }
						</button>
					) : (
						<button
							className="primary"
							onClick={ () => onExport( 'saveAs' ) }
						>
							{ I.save( { size: 14 } ) }{ ' ' }
							{ embedHostLabel()
								? sprintf(
										/* translators: %s: page builder name, e.g. Elementor. */
										__( 'Apply to %s', 'wunderpaint' ),
										embedHostLabel()
								  )
								: __( 'Apply', 'wunderpaint' ) }
						</button>
					) }
				</>
			) : (
				// Demo mode: the library is read-only, so the primary action
				// becomes the (fully client-side) download export (v1.307).
				<button
					className="primary"
					onClick={ () =>
						onExport(
							! nested && window.WPIE?.demo ? 'export' : 'save'
						)
					}
				>
					{ I.save( { size: 14 } ) }{ ' ' }
					{ nested
						? __( 'Apply to Smart Object', 'wunderpaint' )
						: window.WPIE?.demo
						? __( 'Download', 'wunderpaint' )
						: __( 'Save to Media Library', 'wunderpaint' ) }
				</button>
			) }
		</div>
	);
}
