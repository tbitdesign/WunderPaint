/**
 * EditorScreen: the 44/40/1fr/26 grid composition (spec 04).
 */

import { useState, useRef, useEffect, useMemo } from '@wordpress/element';
import { __, sprintf } from '@wordpress/i18n';

import { useEditor, EditorProvider } from '../store/editor-context';
import {
	createBlankDoc,
	hydrateLayers,
	makeImage,
	loadImage,
	serializeLayers,
} from '../store/document';
import { renderToCanvas, sharedImageCache } from '../lib/raster';
import { importPsdFileOp } from '../store/ops';
import { createAutosave } from '../lib/autosave';
import { offerRestore } from '../lib/restore-offer';
import { StatusDialog } from './status-dialog';
import {
	searchModelInstalled,
	fetchIndexStatus,
	runIndexer,
} from '../lib/image-search';
import { getPsdImporter } from '../lib/psd-registry';
import { useToasts } from '../components/toasts';
import { DialogHost } from '../components/input-dialog';
import { OnboardingTour, SpotlightTour, tourDone } from './onboarding';
import { HelpAssistant } from './help-assistant';
import { VignetteDialog } from './vignette-dialog';
import { registerCoreGenerators } from '../lib/core-generators';
import {
	listExtensionGenerators,
	listExtensionMenuItems,
} from '../lib/extensions';
import { registerGrowthPack } from '../content/growth-pack';
import { installModalDrag } from '../lib/modal-drag';

// Core generators (Vignette & Film) join the extension registry once at
// module load - the registry is module-global and boot-order safe.
registerCoreGenerators();
// Growth Pack (v1.300): the 500 bundled marketing templates join the
// template-pack registry the same way.
registerGrowthPack();
// Every dialog header becomes a drag handle - one delegated listener
// covers host and extension modals alike.
installModalDrag();
import { HelpDialog } from './help-dialog';
import { pushRecentFile } from '../lib/recent-files';
import { confirmDialog } from '../lib/dialogs';
import { bindShortcuts } from '../lib/shortcuts';
import { EditorTitleBar } from './editor-titlebar';
import { EditorMenuBar } from './editor-menubar';
import { EditorToolbar } from './editor-toolbar';
import { EasyBar } from './easy/easy-bar';
import { EasyToolbar } from './easy/easy-toolbar';
import { EasyPanel } from './easy/easy-panel';
import { isEasyMode, setEasyModeFlag } from '../lib/easy-mode';
import { EditorStatusBar } from './editor-statusbar';
import { EditorCanvas } from './editor-canvas';
import { RightPanel } from './panels/right-panel';
import { ExportDialog } from './export-dialog';
import { CreateDialog } from './create-dialog';
import { StockDialog } from './stock-dialog';
import { OpenTemplateDialog } from './open-template-dialog';
import { LibraryDialog } from './library-dialog';
import { AltTextDialog } from './alt-text-dialog';
import { MediaLibraryDialog } from './media-library-dialog';
import { wpMediaPick, installWpMediaShim } from '../lib/media-pick';
import { UseImageDialog } from './use-image-dialog';
import { EffectDialog } from '../components/effect-dialog';
import { GuidesDialog } from './guides-dialog';
import { ChartStudio } from './chart-studio';
import { QrDialog } from './qr-dialog';
import { ColorSchemerDialog } from './color-schemer-dialog';
import { BackgroundStudioDialog } from './background-studio-dialog';
import { BeautifyDialog } from './beautify-dialog';
import { CollageDialog } from './collage-dialog';
import { PanoramaDialog } from './panorama-dialog';
import { MockupDialog } from './mockup-dialog';
import { TabsBar } from './tabs-bar';
import { CarouselDialog } from './carousel-dialog';
import { TimelineBar } from './timeline-bar';
import { ResizeDialog } from './resize-dialog';
import { MagicResizeDialog } from './magic-resize-dialog';
import { DesignDialog } from './design-dialog';
import { PagesBar } from './pages-bar';
import { LibraryTray } from './library-tray';
import { CommandPalette } from './command-palette';
import { ContrastDialog } from './contrast-dialog';
import { QuickInsert } from './quick-insert';
import { PROOF_MATRICES } from '../lib/proof';
import { PostPickerDialog } from './post-picker-dialog';
import { ProTeaserDialog } from './pro-teaser-dialog';
import { ActionsDialog } from './actions-dialog';
import { BrandKitsDialog } from './brand-kits-dialog';
import { BatchWatermarkDialog } from './batch-watermark-dialog';
import { DepthBlurDialog } from './depth-blur-dialog';
import { GenerateDialog } from './generate-dialog';
import { ExtensionsDialog } from './extensions-dialog';
import { watchExtensionErrors } from '../lib/extension-loader';
import { WorkspaceDialog } from './workspace-dialog';
import { WorkspaceOverlay } from './workspace-overlay';
import { applyWorkspaceDom } from '../lib/workspace';
import { coreDeeplinkAction } from '../lib/core-deeplinks';
import {
	setLocale,
	markEditorRequests,
	takeIntentionalReload,
	isIntentionalReload,
} from '../lib/editor-locale';

import {
	TopLayer,
	ShortcutHelpDialog,
	AboutDialog,
	FontFirstRunDialog,
} from './editor-dialogs';

export function EditorScreen( {
	isNew,
	nested,
	tabs,
	activeTab,
	tabsApi,
	onSelectTab,
	onCloseTab,
} ) {
	const editor = useEditor();
	const toasts = useToasts();
	// Always-fresh editor for memoised closures (extras is useMemo'd).
	const editorLiveRef = useRef( editor );
	editorLiveRef.current = editor;
	// The running autosave instance, set once it starts below. Lets the
	// language switch (extras.setEditorLocale) force an immediate snapshot
	// instead of waiting for the next tick, since it reloads right after.
	const autosaveRef = useRef( null );

	// Document tabs (v1.107): hand the live editor ref to the session
	// store and keep the active tab's label/dirty dot in sync.
	useEffect( () => {
		if ( ! nested ) {
			tabsApi?.registerLive?.( editorLiveRef );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );
	// Dirty dot: a re-hydrated tab starts with a FRESH history, so
	// editor.dirty is false even though the parked work was never saved.
	// The dot is therefore RAISE-ONLY from the live session; the sole
	// thing that lowers it is an actual save (MARK_SAVED changes the
	// history's savedRef identity) - undo-to-clean keeps it, which errs
	// on the safe side (v1.107.6).
	useEffect( () => {
		if ( nested ) {
			return;
		}
		tabsApi?.syncActive?.( {
			name: editor.state.doc.name || 'untitled',
			...( editor.dirty ? { dirty: true } : {} ),
		} );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editor.state.doc.name, editor.dirty ] );
	const savedRefSeen = useRef( editor.state.history?.savedRef );
	useEffect( () => {
		if (
			! nested &&
			savedRefSeen.current !== editor.state.history?.savedRef
		) {
			// MARK_SAVED ran: the document is saved, clear the dot for real.
			tabsApi?.syncActive?.( { dirty: false } );
		}
		savedRefSeen.current = editor.state.history?.savedRef;
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ editor.state.history?.savedRef ] );

	// The auto-pickup runner for queued automation jobs (v1.65) lives in
	// the Pro add-on since v1.79; it boots itself via `wpie.ready`. Its
	// progress toasts come through this handle (v1.79.1).
	// Attribute uncaught errors of installed extension packages to their
	// slug so the Extensions manager can show them (v1.119).
	useEffect(
		() => ( nested ? undefined : watchExtensionErrors() ),
		[ nested ]
	);

	useEffect( () => {
		window.WPIE = window.WPIE || {};
		window.WPIE.toasts = toasts;
		// Pro dialogs open the kit editor via this handle (v1.89.0).
		if ( window.WPIE.canManageKits ) {
			window.WPIE.openBrandKits = () => setShowBrandKits( true );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const [ exportMode, setExportMode ] = useState( null );
	// No Create dialog in the wp.media pick overlay (v1.242): that boot
	// goes straight into the manager's pick mode.
	const [ showCreate, setShowCreate ] = useState(
		!! isNew && ! window.WPIE?.pickEmbed
	); // spec 07.1
	// Welcome stage only for the very first dialog after opening the
	// editor without an attachment; later File > New shows the canvas.
	const welcomeCreate = useRef( !! isNew );
	const [ showStock, setShowStock ] = useState( false ); // v0.3
	const [ showTemplatePicker, setShowTemplatePicker ] = useState( false ); // v1.160.0
	const [ librarySection, setLibrarySection ] = useState( null ); // v1.2 hub
	const [ showAltText, setShowAltText ] = useState( false ); // v1.0
	const [ altTextFilter, setAltTextFilter ] = useState( 'all' ); // v1.193.0
	const [ altTextIds, setAltTextIds ] = useState( [] ); // preselection carried in
	const [ showMediaLib, setShowMediaLib ] = useState( false ); // v1.189.0
	const [ useImage, setUseImage ] = useState( null ); // v1.0 {id,url,name}
	const [ effectDialog, setEffectDialog ] = useState( null ); // v1.0.5 effect id
	const [ showGuides, setShowGuides ] = useState( false ); // v1.1
	const [ showActions, setShowActions ] = useState( false ); // v1.25
	const [ showBrandKits, setShowBrandKits ] = useState( false ); // v1.89
	const [ showBatchWatermark, setShowBatchWatermark ] = useState( false ); // v1.134
	// Preselected targets when a tool (Media Library Manager) hands its
	// selection over to Batch Watermark (v1.241).
	const watermarkSeed = useRef( null );
	const [ showDepthBlur, setShowDepthBlur ] = useState( false ); // v1.27
	const [ generateKind, setGenerateKind ] = useState( null ); // v1.31
	const [ chartTarget, setChartTarget ] = useState( null ); // true=new | groupId (v1.114)
	const [ qrTarget, setQrTarget ] = useState( null ); // true=new | layerId (v1.102)
	const [ showColorSchemer, setShowColorSchemer ] = useState( false ); // v1.103
	const [ bgTarget, setBgTarget ] = useState( null ); // true=new | layerId (v1.105)
	const [ showBeautify, setShowBeautify ] = useState( false ); // v1.106
	const [ showCollage, setShowCollage ] = useState( false ); // v1.375
	const [ showPanorama, setShowPanorama ] = useState( false ); // v1.378
	const [ mockupTarget, setMockupTarget ] = useState( null ); // true=new | layerId (v1.117)
	const [ showCarousel, setShowCarousel ] = useState( false ); // v1.1
	const [ resizeMode, setResizeMode ] = useState( null ); // 'image'|'canvas' (v1.1.1)
	const [ showMagicResize, setShowMagicResize ] = useState( false ); // v1.11
	const [ showDesignAssistant, setShowDesignAssistant ] = useState( false ); // v1.12
	const [ showPalette, setShowPalette ] = useState( false ); // v1.15
	const [ showContrast, setShowContrast ] = useState( false ); // v1.15
	const [ showQuickInsert, setShowQuickInsert ] = useState( false ); // v1.11 '/'
	const [ showPostPicker, setShowPostPicker ] = useState( false ); // dynamic templates E1
	const [ easyMode, setEasyModeState ] = useState( isEasyMode ); // v1.166 beginner shell
	const [ proTeaser, setProTeaser ] = useState( null ); // {label} | null (v1.79)
	const [ showExtensions, setShowExtensions ] = useState( false ); // v1.119
	const [ showWorkspace, setShowWorkspace ] = useState( false ); // v1.184
	const [ wsPick, setWsPick ] = useState( false ); // v1.184 interactive picker
	const [ showTour, setShowTour ] = useState(
		() => ! nested && ! isNew && ! tourDone()
	); // v0.5
	// First-run font source picker (v1.316): admins only, and not while the
	// onboarding tour is up (isNew has no tour; otherwise wait for tourDone).
	const [ showFontFirstRun, setShowFontFirstRun ] = useState(
		() =>
			! nested &&
			!! window.WPIE?.canManage &&
			!! window.WPIE?.fontsFirstRun &&
			( isNew || tourDone() )
	);
	const [ helpArticle, setHelpArticle ] = useState( null ); // v0.8 ('index' | article id)
	const [ guide, setGuide ] = useState( null ); // v0.8 running how-to
	const [ helpBot, setHelpBot ] = useState( false ); // v1.253 assistant chat
	// Vignette & Film studio (v1.256): false | { layer: Layer|null }.
	const [ vignette, setVignette ] = useState( false );
	const [ helpDialog, setHelpDialog ] = useState( null );
	const [ nestedSession, setNestedSession ] = useState( null );
	const viewApi = useRef( {} );
	// Selection-styling api of the active text-edit session (v1.46).
	const richText = useRef( null );

	useEffect( () => {
		if ( ! nested && editor.WPIE.attachmentId ) {
			pushRecentFile( editor.WPIE.attachmentId, editor.state.doc.name );
		}
		// Huge camera files render slowly, offer a working size (v0.7).
		const { w, h } = editor.state.doc;
		if ( ! nested && w * h > 24e6 ) {
			confirmDialog( {
				title: __( 'Large image', 'wunderpaint' ),
				message: sprintf(
					/* translators: %d: megapixels. */
					__(
						'This image has %d megapixels. Resize it to 4096 px for smooth editing? Saving creates a new version, the original stays restorable.',
						'wunderpaint'
					),
					Math.round( ( w * h ) / 1e6 )
				),
				confirmLabel: __( 'Resize', 'wunderpaint' ),
				cancelLabel: __( 'Keep full size', 'wunderpaint' ),
			} ).then( ( yes ) => {
				if ( yes ) {
					const scale = 4096 / Math.max( w, h );
					import( '../store/doc-ops' ).then( ( DocOps ) =>
						DocOps.scaleDoc(
							editor,
							Math.round( w * scale ),
							Math.round( h * scale )
						)
					);
				}
			} );
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	const extras = useMemo(
		() => ( {
			viewApi,
			richText,
			toasts,
			openExport: ( mode ) => {
				if ( nested ) {
					// Nested smart-object session: Save applies back (13.3).
					// Read through the ref: `extras` is memoised and its
					// closure would otherwise hand back the STALE state
					// from the last memo run, silently dropping the edits
					// (v1.67.1 fix).
					nested.onDone(
						editorLiveRef.current.state.doc,
						editorLiveRef.current.state.layers
					);
					return;
				}
				setExportMode( mode );
			},
			openCreate: () => setShowCreate( true ),
			openStock: () => setShowStock( true ),
			openTemplatePicker: () => setShowTemplatePicker( true ),
			openLibrary: ( section = 'designs' ) =>
				setLibrarySection( section ),
			openIcons: () => setLibrarySection( 'icons' ),
			// Pro dispatchers (v1.79.1): the Pro add-on drops its openers
			// onto window.WPIE.proOpen; without it the teaser explains.
			openMerge: () =>
				window.WPIE?.proOpen?.merge
					? window.WPIE.proOpen.merge( {
							editor: editorLiveRef.current,
							extras,
					  } )
					: setProTeaser( {
							label: __( 'Generate from CSV', 'wunderpaint' ),
					  } ),
			openAltText: ( f, ids ) => {
				setAltTextFilter( 'string' === typeof f ? f : 'all' );
				setAltTextIds( Array.isArray( ids ) ? ids : [] );
				setShowAltText( true );
			},
			openMediaLibrary: () => setShowMediaLib( true ),
			openUseImage: ( att ) => setUseImage( att ),
			openEffect: ( id ) => setEffectDialog( id ),
			// Easy Mode (v1.166): swaps menu bar, tool rail and the right
			// panel for the beginner shell; the document stays identical.
			setEasyMode: ( on ) => {
				setEasyModeFlag( on );
				setEasyModeState( !! on );
			},
			openGuides: () => setShowGuides( true ),
			openActions: () => setShowActions( true ),
			openBrandKits: () => setShowBrandKits( true ),
			openBatchWatermark: ( preset ) => {
				watermarkSeed.current =
					Array.isArray( preset ) && preset.length ? preset : null;
				setShowBatchWatermark( true );
			},
			openDepthBlur: () => setShowDepthBlur( true ),
			openGenerate: ( kind ) => setGenerateKind( kind || 'gradient' ),
			openPatterns: () => setLibrarySection( 'patterns' ),
			openEmoji: () => setLibrarySection( 'emoji' ),
			openChart: ( chartLayerId ) =>
				setChartTarget( chartLayerId || true ),
			openQr: ( layerId ) => setQrTarget( layerId || true ),
			openColorSchemer: () => setShowColorSchemer( true ),
			openBackgroundStudio: ( layerId ) => setBgTarget( layerId || true ),
			openBeautify: () => setShowBeautify( true ),
			openCollage: () => setShowCollage( true ),
			openPanorama: () => setShowPanorama( true ),
			openMockup: ( layerId ) => setMockupTarget( layerId || true ),
			// New document tab with ready content (v1.107); falls back to
			// LOAD_DOCUMENT in place when tabs are absent (nested session).
			// At the 5-tab cap the open is swallowed with a hint - falling
			// back would silently replace the current document.
			openDocInNewTab: ( payload ) => {
				if ( tabsApi?.openDocInTab && ! nested ) {
					if ( 'full' === tabsApi.openDocInTab( payload ) ) {
						toasts.error(
							__(
								'You can keep up to ten documents open. Close a tab first.',
								'wunderpaint'
							)
						);
					}
					return true;
				}
				return false;
			},
			openCarousel: () => setShowCarousel( true ),
			openResize: ( m ) => setResizeMode( m ),
			openMagicResize: () => setShowMagicResize( true ),
			openDesignAssistant: () => setShowDesignAssistant( true ),
			openPalette: () => setShowPalette( true ),
			openContrast: () => setShowContrast( true ),
			openQuickInsert: () => setShowQuickInsert( true ),
			openBatch: ( opts ) =>
				window.WPIE?.proOpen?.batch
					? window.WPIE.proOpen.batch( {
							editor: editorLiveRef.current,
							extras,
							...( opts || {} ),
					  } )
					: setProTeaser( {
							label: __( 'Image Processor', 'wunderpaint' ),
					  } ),
			openPostPreview: () => setShowPostPicker( true ),
			openProInfo: ( label ) => setProTeaser( { label } ),
			openAutomate: () =>
				window.WPIE?.proOpen?.automate
					? window.WPIE.proOpen.automate( {
							editor: editorLiveRef.current,
							extras,
					  } )
					: setProTeaser( {
							label: __( 'Featured Images', 'wunderpaint' ),
					  } ),
			openCreatePost: () =>
				window.WPIE?.proOpen?.createPost
					? window.WPIE.proOpen.createPost( {
							editor: editorLiveRef.current,
							extras,
					  } )
					: setProTeaser( {
							label: __( 'Generate Content', 'wunderpaint' ),
					  } ),
			openShortcodes: () =>
				window.WPIE?.proOpen?.shortcodes
					? window.WPIE.proOpen.shortcodes( {
							editor: editorLiveRef.current,
							extras,
					  } )
					: setProTeaser( {
							label: __(
								'Dynamic Template Shortcodes',
								'wunderpaint'
							),
					  } ),
			openContentTemplates: () =>
				window.WPIE?.proOpen?.contentTemplates
					? window.WPIE.proOpen.contentTemplates( {
							editor: editorLiveRef.current,
							extras,
					  } )
					: setProTeaser( {
							label: __( 'Content Templates', 'wunderpaint' ),
					  } ),
			openTour: () => setShowTour( true ),
			openExtensions: () => setShowExtensions( true ),
			openWorkspace: () => setShowWorkspace( true ),
			// The dialog hands off to the click-to-hide overlay (v1.184.0).
			startWorkspacePick: () => {
				setShowWorkspace( false );
				setWsPick( true );
			},
			openHelp: ( article ) => setHelpArticle( article || 'index' ),
			// Help Assistant chat (v1.253) + programmatic guide start (the
			// assistant's "Show me" plays a HELP_GUIDES tour).
			openHelpBot: () => setHelpBot( ( v ) => ! v ),
			// Editor language switch (Help menu): forces an autosave snapshot
			// first, since the reload that follows would otherwise lose up
			// to 30 seconds of work. Not offered in the nested smart-object
			// overlay: setLocale() triggers a FULL page reload, which would
			// blow away the parent instance's in-progress edit as well, not
			// just this overlay's, and the autosave effect below already
			// skips nested instances (no attachment of its own to snapshot
			// against), so autosaveRef.current would stay null forever here.
			setEditorLocale: nested
				? undefined
				: ( locale ) =>
						setLocale( locale, {
							snapshot: () => autosaveRef.current?.writeNow(),
							// A short notice right before the reload
							// actually happens (concept doc section 4):
							// without it the switch looks like an
							// unexplained page reload. Passed in rather
							// than fired here so a cancelled switch (no
							// snapshot possible, dialog declined) never
							// shows it.
							notify: () =>
								toasts.toast(
									__(
										'Switching editor language, reloading…',
										'wunderpaint'
									)
								),
						} ).catch( () => {
							// Say so. A rejected switch (an expired nonce
							// after a long session is the realistic case)
							// otherwise ends as an unhandled rejection:
							// the menu closes, nothing happens, and nobody
							// learns why.
							toasts.toast(
								__(
									'The editor language could not be changed.',
									'wunderpaint'
								),
								{ type: 'error' }
							);
						} ),
			startGuide: ( g ) => setGuide( g ),
			// Vignette & Film studio (v1.256): no layer = insert new, a
			// generator layer reopens with its params (core generator).
			openVignette: ( layer ) => setVignette( { layer: layer || null } ),
			openShortcutHelp: () => setHelpDialog( 'shortcuts' ),
			openAbout: () => setHelpDialog( 'about' ),
			openStatus: () => setHelpDialog( 'status' ),
			importPsdFile: ( file ) =>
				importPsdFileOp( editor, { toasts }, file ),
			selectSubject: async () => {
				const id = toasts.toast(
					__( 'Detecting subject…', 'wunderpaint' ),
					{ duration: 0 }
				);
				try {
					const { selectSubject } = await import(
						'../lib/ai-actions'
					);
					await selectSubject( editor );
				} catch ( err ) {
					toasts.error( err.message );
				}
				toasts.remove( id );
			},
			removeObject: async () => {
				const id = toasts.toast(
					__( 'Removing object…', 'wunderpaint' ),
					{ duration: 0 }
				);
				try {
					const { removeObject } = await import(
						'../lib/ai-actions'
					);
					await removeObject( editor, {} );
				} catch ( err ) {
					toasts.error(
						err.message,
						err.isUnconfigured
							? {
									linkText: __( 'Settings', 'wunderpaint' ),
									linkHref: editor.WPIE.settingsUrl,
							  }
							: {}
					);
				}
				toasts.remove( id );
			},
			smartObject: {
				editContents: async ( layer ) => {
					try {
						const embedded = layer.embedded || {};
						let doc;
						let layers;
						if ( 'layers' === embedded.kind && embedded.layers ) {
							doc = createBlankDoc( {
								name: layer.name,
								w: embedded.doc?.w || layer.srcW,
								h: embedded.doc?.h || layer.srcH,
								bg: 'transparent',
							} );
							layers = await hydrateLayers(
								embedded.layers.map( ( l ) => ( { ...l } ) )
							);
						} else if (
							'psd' === embedded.kind &&
							embedded.bytes &&
							getPsdImporter()
						) {
							( { doc, layers } = await getPsdImporter()(
								embedded.bytes.slice
									? embedded.bytes.slice( 0 )
									: embedded.bytes,
								layer.name
							) );
						} else {
							// Plain image content (or preview-only smart object).
							const src = embedded.src || layer.src;
							const img = await loadImage( src );
							doc = createBlankDoc( {
								name: layer.name,
								w: img.naturalWidth,
								h: img.naturalHeight,
								bg: 'transparent',
							} );
							layers = [
								makeImage( {
									name: layer.name,
									x: 0,
									y: 0,
									w: img.naturalWidth,
									h: img.naturalHeight,
									src,
									naturalW: img.naturalWidth,
									naturalH: img.naturalHeight,
								} ),
							];
						}
						setNestedSession( {
							doc,
							layers,
							smartLayerId: layer.id,
						} );
					} catch ( err ) {
						toasts.error(
							__(
								'Could not open the smart object contents.',
								'wunderpaint'
							) +
								' ' +
								err.message
						);
					}
				},
				replaceContents: ( layer ) => {
					const input = document.createElement( 'input' );
					input.type = 'file';
					input.accept = 'image/*';
					input.onchange = async () => {
						const file = input.files?.[ 0 ];
						if ( ! file ) {
							return;
						}
						const reader = new window.FileReader();
						reader.onload = async () => {
							const img = await loadImage( reader.result );
							editor.dispatch( {
								type: 'UPDATE_LAYER',
								id: layer.id,
								patch: {
									src: reader.result,
									srcW: img.naturalWidth,
									srcH: img.naturalHeight,
									embedded: { kind: 'image', bytes: null },
								},
							} );
							editor.commit(
								__( 'Replace Contents', 'wunderpaint' )
							);
						};
						reader.readAsDataURL( file );
					};
					input.click();
				},
			},
			close: async () => {
				if ( nested ) {
					nested.onCancel();
					return;
				}
				if (
					! editor.dirty ||
					( await confirmDialog( {
						title: __( 'Unsaved changes', 'wunderpaint' ),
						message: __(
							'Discard unsaved changes?',
							'wunderpaint'
						),
						confirmLabel: __( 'Discard', 'wunderpaint' ),
						danger: true,
					} ) )
				) {
					window.location = editor.WPIE.libraryUrl;
				}
			},
		} ),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[ toasts, editor.dirty, editor.WPIE, nested ]
	);

	// Deeplink (v1.312): ?wpie-open=<extension slug or generator id>
	// opens that studio once its extension has loaded - marketing and
	// demo links jump straight into the right dialog. Skips the Create
	// dialog (the editor boots on a default canvas anyway).
	const deeplinkDone = useRef( false );
	useEffect( () => {
		const want = new URLSearchParams( window.location.search ).get(
			'wpie-open'
		);
		if ( ! want || deeplinkDone.current ) {
			return undefined;
		}
		// The core's own features first: those are plain `extras` actions,
		// available the moment the editor is up, so there is nothing to wait
		// for and no interval to start. Without this branch the loop below
		// would search the extension registry for a name no extension ever
		// registers, spin its 100 rounds and leave the Create dialog up -
		// which is exactly what every marketing link into a feature did.
		const coreAction = coreDeeplinkAction( want );
		if ( coreAction ) {
			deeplinkDone.current = true;
			welcomeCreate.current = false;
			setShowCreate( false );
			// Same handoff as below: let the Create dialog unmount before
			// the studio mounts, or the new dialog lands under it.
			const t = window.setTimeout(
				() => extras?.[ coreAction ]?.(),
				150
			);
			return () => window.clearTimeout( t );
		}
		let tries = 0;
		const tick = window.setInterval( () => {
			tries++;
			const gens = listExtensionGenerators();
			// An extension whose whole surface is a menu item (Handwriting
			// Fonts, Banner Studio) has no generator to find, so those two
			// deeplinks used to fall through to the Create dialog.
			const items = listExtensionMenuItems().filter( ( i ) => i.id );
			const gen =
				gens.find( ( g ) => g.id === want ) ||
				gens.find( ( g ) => g.id.startsWith( want + '/' ) ) ||
				items.find( ( i ) => i.id === want ) ||
				items.find( ( i ) => i.id.startsWith( want + '/' ) );
			if ( gen ) {
				window.clearInterval( tick );
				if ( deeplinkDone.current ) {
					return;
				}
				deeplinkDone.current = true;
				welcomeCreate.current = false;
				setShowCreate( false );
				// Let the Create dialog unmount before the studio mounts.
				window.setTimeout(
					() =>
						gen.run( {
							editor: editorLiveRef.current,
							extras,
						} ),
					150
				);
			} else if ( tries > 100 ) {
				window.clearInterval( tick );
			}
		}, 150 );
		return () => window.clearInterval( tick );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// One shared image picker for editor tools and extensions (v1.241):
	// routes to the Media Library Manager in pick mode (settings toggle)
	// or to the classic wp.media modal, same resolved item shape either
	// way. The manager instance renders in OUR tree (it needs the editor
	// context) inside a TopLayer, so it stacks above extension overlays.
	const [ pickRequest, setPickRequest ] = useState( null );
	useEffect( () => {
		window.WPIE = window.WPIE || {};
		window.WPIE.pickMedia = ( opts = {} ) => {
			if ( ! window.WPIE.mediaPickerManager ) {
				return wpMediaPick( opts );
			}
			return new Promise( ( resolve ) => {
				const finish = ( value ) => {
					setPickRequest( null );
					resolve( value );
				};
				setPickRequest( {
					pick: {
						multiple: false !== opts.multiple,
						// Arrays pass through untouched: a host may ask
						// for a mime mix like ['image','application/pdf']
						// (3D Flip Studio, v1.333).
						types: Array.isArray( opts.types )
							? opts.types
							: [ 'all', 'video', 'audio' ].includes( opts.types )
							? opts.types
							: 'image',
						onConfirm: ( items ) => finish( items ),
						// The classic WordPress Media Library stays one
						// click away: swap UIs, keep the same promise.
						onClassic: () => {
							setPickRequest( null );
							wpMediaPick( opts ).then( resolve );
						},
					},
					cancel: () => finish( null ),
				} );
			} );
		};
		// With the manager as THE picker, wp.media itself is rerouted
		// (v1.307.1): extensions and legacy code that call it directly
		// land in the manager too - globally, without per-caller
		// migration. media-pick.js keeps the original for its classic
		// fallback, so "Classic" inside the manager still works.
		if ( window.WPIE.mediaPickerManager ) {
			installWpMediaShim();
		}
	}, [] );

	// Booted as the wp.media pick overlay (v1.242): skip the editor
	// chrome, open the manager in pick mode right away and post the
	// picked attachment ids back to the host page (same-origin echo of
	// the token the host minted, see lib/embed-overlay.js).
	useEffect( () => {
		const pickEmbed = window.WPIE?.pickEmbed;
		if ( ! pickEmbed?.mode ) {
			return undefined;
		}
		// The host reuses this warm iframe for later picks of the same
		// scope (v1.245.1) and hands a fresh token over per open.
		const tokenRef = { current: pickEmbed.token || '' };
		const post = ( msg ) =>
			window.parent.postMessage(
				{ source: 'wpie', token: tokenRef.current, ...msg },
				window.location.origin
			);
		const openPickDialog = () =>
			setPickRequest( {
				pick: {
					multiple: 'multiple' === pickEmbed.mode,
					types: pickEmbed.types || 'image',
					onConfirm: ( picked ) =>
						post( {
							type: 'picked',
							ids: picked.map( ( it ) => it.id ),
						} ),
					// "WordPress Media Library" here means: back to the
					// native modal underneath the overlay.
					onClassic: () => post( { type: 'cancelled' } ),
				},
				cancel: () => post( { type: 'cancelled' } ),
			} );
		post( { type: 'ready' } );
		openPickDialog();
		const onMsg = ( e ) => {
			if ( e.origin !== window.location.origin ) {
				return;
			}
			const m = e.data;
			if ( ! m || 'wpie-host' !== m.source || 'pick-open' !== m.type ) {
				return;
			}
			tokenRef.current = m.token || tokenRef.current;
			openPickDialog();
		};
		window.addEventListener( 'message', onMsg );
		return () => window.removeEventListener( 'message', onMsg );
	}, [] );

	// Global shortcuts (spec 04.5).
	const ctxRef = useRef( { editor, extras } );
	ctxRef.current = { editor, extras };
	useEffect( () => bindShortcuts( () => ctxRef.current ), [] );

	// Theme + accent on the root element.
	useEffect( () => {
		const root = document.getElementById( 'wpie-root' );
		if ( root ) {
			root.dataset.theme = editor.state.theme;
			root.style.setProperty( '--accent', editor.state.accent );
			root.style.setProperty(
				'--accent-soft',
				editor.state.accent + '22'
			);
		}
	}, [ editor.state.theme, editor.state.accent ] );

	// Apply the saved personal workspace (cosmetic show/hide of main-UI
	// regions + toolbar icon size) to the DOM (v1.184.0). Re-applied on each
	// screen mount, since document-tab switches remount the screen.
	useEffect( () => {
		applyWorkspaceDom();
	}, [] );

	// Mark every REST request as coming from the editor, so the server
	// can answer in the chosen editor language instead of the WP language.
	// markEditorRequests() has no idempotency guard of its own: it just
	// appends a middleware to apiFetch.use(). Document-tab switches remount
	// this screen (see the autosave effect below), so without a guard the
	// middleware chain would grow by one, identical entry per remount for
	// the rest of the page's life. Same guard shape as the restore offer
	// below (window.wpieAutosaveOffered): a flag on `window`, since it must
	// survive remounts and there is exactly one page load to track.
	useEffect( () => {
		if ( window.wpieEditorRequestsMarked ) {
			return;
		}
		window.wpieEditorRequestsMarked = true;
		markEditorRequests();
	}, [] );

	// Autosave & crash recovery (v0.2): dirty snapshots to IndexedDB.
	useEffect( () => {
		if ( nested ) {
			return;
		}
		const autosave = createAutosave( {
			attachmentId: editor.WPIE.attachmentId,
			getSnapshot: () => {
				const current = ctxRef.current.editor;
				if ( ! current.dirty ) {
					return null;
				}
				return {
					doc: current.state.doc,
					layers: serializeLayers( current.state.layers ),
				};
			},
		} );
		autosave.start();

		// The language switch reloads and needs a snapshot beforehand, not
		// whichever tick happens to land in up to 30 seconds.
		autosaveRef.current = autosave;

		// Read (and clear) the intentional-reload marker right here, once
		// per page load, regardless of whether load() below actually
		// finds a record. Leaving it for the .then() would let it survive
		// a failed load() (e.g. no IndexedDB) and silently swallow the
		// NEXT recovery too, including one after a real crash.
		const afterLocaleSwitch = takeIntentionalReload();

		// Offer restore when a crashed session left a record behind - but
		// only on the FIRST screen mount of this page load. Tab switches
		// remount the screen, and the live session writes snapshots
		// itself, so later mounts would "find" their own records and spam
		// the restore toast (v1.107.5).
		const offer = ! window.wpieAutosaveOffered && ! window.WPIE?.pickEmbed;
		window.wpieAutosaveOffered = true;
		autosave
			.load()
			.then( async ( record ) => {
				if ( ! record ) {
					return;
				}
				// After an intentional locale switch do not ask: the
				// reload was wanted, and a prompt about it would read
				// like an error.
				if ( afterLocaleSwitch ) {
					const layers = await hydrateLayers( record.layers );
					ctxRef.current.editor.dispatch( {
						type: 'LOAD_DOCUMENT',
						doc: record.doc,
						layers,
					} );
					return;
				}
				if ( ! offer ) {
					return;
				}
				// Merged with the parked-tabs offer into ONE toast per
				// reload (v1.130.1) - two restore prompts read like an
				// error, one session restore reads like a feature.
				offerRestore(
					{
						kind: 'autosave',
						restore: async () => {
							const layers = await hydrateLayers( record.layers );
							ctxRef.current.editor.dispatch( {
								type: 'LOAD_DOCUMENT',
								doc: record.doc,
								layers,
								label: __( 'Restore autosave', 'wunderpaint' ),
							} );
						},
					},
					toasts
				);
			} )
			.catch( () => {} );

		// Clear the record once the work is saved to the library.
		let wasDirty = false;
		const watcher = setInterval( () => {
			const current = ctxRef.current.editor;
			if ( wasDirty && ! current.dirty ) {
				autosave.clear().catch( () => {} );
			}
			wasDirty = current.dirty;
		}, 2000 );

		return () => {
			autosave.stop();
			clearInterval( watcher );
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Zero-config semantic search (v1.131.3): once the model is installed
	// the library indexes ITSELF in the background - no button to find,
	// no concept to learn. Toasts announce start and readiness; the
	// status lines in the library sections show live progress.
	// Demo mode (v1.307): background writes (prefs, bookkeeping) hitting
	// the read-only guard are EXPECTED there - swallow exactly those when
	// nothing caught them; deliberate actions keep surfacing the message
	// through their own catch → toast paths.
	useEffect( () => {
		if ( ! window.WPIE?.demo ) {
			return undefined;
		}
		const swallow = ( e ) => {
			if ( 'wpie_demo_readonly' === e?.reason?.code ) {
				e.preventDefault();
			}
		};
		window.addEventListener( 'unhandledrejection', swallow );
		return () =>
			window.removeEventListener( 'unhandledrejection', swallow );
	}, [] );

	useEffect( () => {
		// Demo mode: the index is read-only and ships pre-built; a visitor
		// session must not announce or attempt indexing (v1.307).
		if ( nested || window.wpieAutoIndexStarted || window.WPIE?.demo ) {
			return undefined;
		}
		window.wpieAutoIndexStarted = true;
		const timer = setTimeout( async () => {
			try {
				if ( ! searchModelInstalled() ) {
					return;
				}
				const status = await fetchIndexStatus();
				if ( ! status || status.pending < 1 ) {
					return;
				}
				toasts.toast(
					sprintf(
						/* translators: %d: image count. */
						__(
							'Setting up image search: indexing %d images in the background…',
							'wunderpaint'
						),
						status.pending
					)
				);
				await runIndexer();
				toasts.success(
					__(
						'Image search is ready! The library search now finds images by describing them.',
						'wunderpaint'
					)
				);
			} catch ( e ) {
				// Silent: the library status line keeps the manual path.
			}
		}, 4000 );
		return () => clearTimeout( timer );
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [] );

	// Unsaved-changes guard on page close: the active editor OR any
	// parked document tab may hold unsaved work (v1.107).
	const tabsRef = useRef( tabs );
	tabsRef.current = tabs;
	useEffect( () => {
		const onBeforeUnload = ( e ) => {
			// A language switch reloads on purpose, and setLocale() has
			// written the autosave snapshot before it got here. Warning
			// would be a native browser dialog on an action the user just
			// asked for, and declining it swallows the switch entirely -
			// both measured in a real browser.
			if ( isIntentionalReload() ) {
				return;
			}
			if (
				ctxRef.current.editor.dirty ||
				tabsRef.current?.some( ( t ) => t.dirty )
			) {
				e.preventDefault();
				e.returnValue = '';
			}
		};
		window.addEventListener( 'beforeunload', onBeforeUnload );
		return () =>
			window.removeEventListener( 'beforeunload', onBeforeUnload );
	}, [] );

	// A stray file drop on the menubar, toolbar or a panel must not
	// NAVIGATE the browser away from the editor (v1.365.3). The real
	// drop zones (canvas, layer list) handle their drops before this
	// bubbles up; whatever arrives here unhandled is defused.
	useEffect( () => {
		const defuse = ( e ) => {
			if (
				Array.from( e.dataTransfer?.types || [] ).includes( 'Files' )
			) {
				e.preventDefault();
			}
		};
		window.addEventListener( 'dragover', defuse );
		window.addEventListener( 'drop', defuse );
		return () => {
			window.removeEventListener( 'dragover', defuse );
			window.removeEventListener( 'drop', defuse );
		};
	}, [] );

	const closeNested = () => setNestedSession( null );
	const applyNested = async ( subDoc, subLayers ) => {
		const session = nestedSession;
		closeNested();
		try {
			await sharedImageCache.warm( subLayers );
			const preview = await renderToCanvas( subDoc, subLayers, {
				cache: sharedImageCache,
			} );
			editor.dispatch( {
				type: 'UPDATE_LAYER',
				id: session.smartLayerId,
				patch: {
					src: preview.toDataURL( 'image/png' ),
					srcW: subDoc.w,
					srcH: subDoc.h,
					embedded: {
						kind: 'layers',
						bytes: null,
						layers: serializeLayers( subLayers ),
						doc: { w: subDoc.w, h: subDoc.h, bg: 'transparent' },
					},
				},
			} );
			editor.commit( __( 'Edit Smart Object Contents', 'wunderpaint' ) );
		} catch ( err ) {
			toasts.error(
				__( 'Could not apply the smart object edit.', 'wunderpaint' ) +
					' ' +
					err.message
			);
		}
	};

	// Tabs dock as real tabs at the right end of the menu row, directly
	// above the right panel (v1.107.3).
	const tabsBar =
		! nested && tabs ? (
			<TabsBar
				tabs={ tabs }
				active={ activeTab }
				onSelect={ onSelectTab }
				onClose={ onCloseTab }
				// The parked tabs carry previews from park time; the ACTIVE
				// document renders fresh when the flyout opens.
				getActivePreview={ async () => {
					const live = editorLiveRef.current;
					if ( ! live ) {
						return null;
					}
					const { doc, layers } = live.state;
					const scale = Math.min( 240 / doc.w, 180 / doc.h, 1 );
					try {
						const canvas = await renderToCanvas( doc, layers, {
							scale,
							cache: sharedImageCache,
						} );
						return canvas?.toDataURL ? canvas.toDataURL() : null;
					} catch ( e ) {
						return null;
					}
				} }
			/>
		) : null;

	// wp.media/Gutenberg pick overlay (v1.245.1): the iframe boots ONLY
	// the manager. No title bar, canvas, panels or asset tray mount, so
	// the picker appears fast and nothing flashes behind it. Toasts come
	// from the ToastProvider above; DialogHost serves confirm prompts.
	if ( window.WPIE?.pickEmbed ) {
		return (
			<div className="editor-root">
				<DialogHost />
				{ pickRequest && (
					<MediaLibraryDialog
						extras={ extras }
						pick={ pickRequest.pick }
						onClose={ () => pickRequest.cancel() }
					/>
				) }
			</div>
		);
	}

	return (
		<div className={ 'editor-root' + ( easyMode ? ' is-easy' : '' ) }>
			<EditorTitleBar
				onExport={ extras.openExport }
				nested={ nested }
				extras={ extras }
			/>
			{ easyMode ? (
				<EasyBar extras={ extras } />
			) : (
				<EditorMenuBar extras={ extras } tabsBar={ tabsBar } />
			) }
			{ easyMode ? <EasyToolbar extras={ extras } /> : <EditorToolbar /> }
			<EditorCanvas viewApi={ viewApi } extras={ extras } />
			{ easyMode ? (
				<EasyPanel extras={ extras } />
			) : (
				<RightPanel extras={ extras } />
			) }
			<div className="ed-docks">
				{ editor.state.timeline?.on && (
					<TimelineBar extras={ extras } />
				) }
				{ editor.state.pages && ! editor.state.pagesHidden && (
					<PagesBar extras={ extras } />
				) }
				{ ! editor.state.libraryHidden && (
					<LibraryTray extras={ extras } />
				) }
			</div>
			<EditorStatusBar onFit={ () => viewApi.current?.fit() } />
			{ exportMode && (
				<ExportDialog
					mode={ exportMode }
					onClose={ () => setExportMode( null ) }
					extras={ extras }
				/>
			) }
			{ showCreate && (
				<CreateDialog
					welcome={ welcomeCreate.current }
					onClose={ () => {
						welcomeCreate.current = false;
						setShowCreate( false );
					} }
					extras={ extras }
				/>
			) }
			{ showStock && (
				<StockDialog
					onClose={ () => setShowStock( false ) }
					extras={ extras }
				/>
			) }
			{ showTemplatePicker && (
				<OpenTemplateDialog
					editor={ editor }
					extras={ extras }
					onClose={ () => setShowTemplatePicker( false ) }
				/>
			) }
			{ librarySection && (
				<LibraryDialog
					section={ librarySection }
					onClose={ () => setLibrarySection( null ) }
					extras={ extras }
				/>
			) }
			{ showAltText && (
				/* TopLayer: the Media Library Manager's tools menu opens the
				   assistant while the manager stays mounted after it in the
				   DOM at the same backdrop z-index. */
				<TopLayer>
					<AltTextDialog
						onClose={ () => setShowAltText( false ) }
						extras={ extras }
						initialFilter={ altTextFilter }
						initialIds={ altTextIds }
					/>
				</TopLayer>
			) }
			{ showMediaLib && (
				<MediaLibraryDialog
					onClose={ () => setShowMediaLib( false ) }
					extras={ extras }
				/>
			) }
			{ pickRequest && (
				<TopLayer>
					<MediaLibraryDialog
						extras={ extras }
						pick={ pickRequest.pick }
						onClose={ () => pickRequest.cancel() }
					/>
				</TopLayer>
			) }
			{ useImage && (
				<UseImageDialog
					attachment={ useImage }
					onClose={ () => setUseImage( null ) }
					extras={ extras }
				/>
			) }
			{ effectDialog && (
				<EffectDialog
					key={ effectDialog }
					effectId={ effectDialog }
					onClose={ () => setEffectDialog( null ) }
					extras={ extras }
				/>
			) }
			{ showGuides && (
				<GuidesDialog
					extras={ extras }
					onClose={ () => setShowGuides( false ) }
				/>
			) }
			{ showActions && (
				<ActionsDialog
					extras={ extras }
					onClose={ () => setShowActions( false ) }
				/>
			) }
			{ showBrandKits && (
				<TopLayer>
					<BrandKitsDialog
						extras={ extras }
						onClose={ () => setShowBrandKits( false ) }
					/>
				</TopLayer>
			) }
			{ showBatchWatermark && (
				<TopLayer>
					<BatchWatermarkDialog
						extras={ extras }
						initialTargets={ watermarkSeed.current }
						onClose={ () => setShowBatchWatermark( false ) }
					/>
				</TopLayer>
			) }
			{ showDepthBlur && (
				<DepthBlurDialog
					extras={ extras }
					onClose={ () => setShowDepthBlur( false ) }
				/>
			) }
			{ generateKind && (
				<GenerateDialog
					initialKind={ generateKind }
					extras={ extras }
					onClose={ () => setGenerateKind( null ) }
				/>
			) }
			{ chartTarget && (
				<ChartStudio
					layerId={ true === chartTarget ? null : chartTarget }
					onClose={ () => setChartTarget( null ) }
					extras={ extras }
				/>
			) }
			{ qrTarget && (
				<QrDialog
					layerId={ true === qrTarget ? null : qrTarget }
					onClose={ () => setQrTarget( null ) }
					extras={ extras }
				/>
			) }
			{ showColorSchemer && (
				<ColorSchemerDialog
					onClose={ () => setShowColorSchemer( false ) }
					extras={ extras }
				/>
			) }
			{ bgTarget && (
				<BackgroundStudioDialog
					layerId={ true === bgTarget ? null : bgTarget }
					onClose={ () => setBgTarget( null ) }
					extras={ extras }
				/>
			) }
			{ showBeautify && (
				<BeautifyDialog
					onClose={ () => setShowBeautify( false ) }
					extras={ extras }
				/>
			) }
			{ showCollage && (
				<CollageDialog
					onClose={ () => setShowCollage( false ) }
					extras={ extras }
				/>
			) }
			{ showPanorama && (
				<PanoramaDialog
					onClose={ () => setShowPanorama( false ) }
					extras={ extras }
				/>
			) }
			{ mockupTarget && (
				<MockupDialog
					layerId={ true === mockupTarget ? null : mockupTarget }
					onClose={ () => setMockupTarget( null ) }
					extras={ extras }
				/>
			) }
			{ showCarousel && (
				<CarouselDialog
					onClose={ () => setShowCarousel( false ) }
					extras={ extras }
				/>
			) }
			{ resizeMode && (
				<ResizeDialog
					mode={ resizeMode }
					onClose={ () => setResizeMode( null ) }
					extras={ extras }
				/>
			) }
			{ showMagicResize && (
				<MagicResizeDialog
					onClose={ () => setShowMagicResize( false ) }
					extras={ extras }
				/>
			) }
			{ showDesignAssistant && (
				<DesignDialog
					onClose={ () => setShowDesignAssistant( false ) }
					extras={ extras }
				/>
			) }
			{ showPalette && (
				<CommandPalette
					onClose={ () => setShowPalette( false ) }
					extras={ extras }
				/>
			) }
			{ showContrast && (
				<ContrastDialog
					extras={ extras }
					onClose={ () => setShowContrast( false ) }
				/>
			) }
			{ showQuickInsert && (
				<QuickInsert
					onClose={ () => setShowQuickInsert( false ) }
					extras={ extras }
				/>
			) }
			<svg
				width="0"
				height="0"
				style={ { position: 'absolute' } }
				aria-hidden="true"
				focusable="false"
			>
				<defs>
					{ Object.entries( PROOF_MATRICES ).map( ( [ id, m ] ) => (
						<filter
							key={ id }
							id={ `wpie-proof-${ id }` }
							colorInterpolationFilters="sRGB"
						>
							<feColorMatrix
								type="matrix"
								values={ m.join( ' ' ) }
							/>
						</filter>
					) ) }
				</defs>
			</svg>
			{ showPostPicker && (
				<PostPickerDialog
					onClose={ () => setShowPostPicker( false ) }
					extras={ extras }
				/>
			) }
			{ proTeaser && (
				<ProTeaserDialog
					label={ proTeaser.label }
					onClose={ () => setProTeaser( null ) }
				/>
			) }
			{ showTour && (
				<OnboardingTour onClose={ () => setShowTour( false ) } />
			) }
			{ showFontFirstRun && (
				<FontFirstRunDialog
					onClose={ () => setShowFontFirstRun( false ) }
				/>
			) }
			{ showExtensions && (
				<ExtensionsDialog
					onClose={ () => setShowExtensions( false ) }
					extras={ extras }
				/>
			) }
			{ showWorkspace && (
				<WorkspaceDialog
					extras={ extras }
					onClose={ () => setShowWorkspace( false ) }
				/>
			) }
			{ wsPick && (
				<WorkspaceOverlay onClose={ () => setWsPick( false ) } />
			) }
			{ helpArticle && (
				// TopLayer: a HelpLink "?" lives INSIDE dialogs, including
				// ones hosted in a TopLayer (z 150001) - the handbook must
				// mount later into the same layer to stack above them.
				<TopLayer>
					<HelpDialog
						initial={ 'index' === helpArticle ? null : helpArticle }
						extras={ extras }
						onClose={ () => setHelpArticle( null ) }
						onStartGuide={ ( g ) => {
							setHelpArticle( null );
							setGuide( g );
						} }
					/>
				</TopLayer>
			) }
			{ guide && (
				<SpotlightTour
					steps={ guide.steps }
					editor={ editor }
					extras={ extras }
					doneLabel={ __( 'Done', 'wunderpaint' ) }
					onClose={ () => setGuide( null ) }
				/>
			) }
			{ /* Stays mounted so the conversation survives close/reopen. */ }
			<HelpAssistant
				open={ helpBot }
				onClose={ () => setHelpBot( false ) }
				extras={ extras }
			/>
			<DialogHost />
			{ vignette && (
				<VignetteDialog
					extras={ extras }
					data={ vignette }
					editor={ editor }
					onClose={ () => setVignette( false ) }
				/>
			) }
			{ 'shortcuts' === helpDialog && (
				<ShortcutHelpDialog onClose={ () => setHelpDialog( null ) } />
			) }
			{ 'about' === helpDialog && (
				<AboutDialog onClose={ () => setHelpDialog( null ) } />
			) }
			{ 'status' === helpDialog && (
				<StatusDialog
					extras={ extras }
					onClose={ () => setHelpDialog( null ) }
				/>
			) }
			{ nestedSession && (
				<div style={ { position: 'fixed', inset: 0, zIndex: 2000 } }>
					<EditorProvider
						doc={ nestedSession.doc }
						layers={ nestedSession.layers }
						WPIE={ editor.WPIE }
					>
						<EditorScreen
							nested={ {
								onDone: applyNested,
								onCancel: closeNested,
							} }
						/>
					</EditorProvider>
				</div>
			) }
		</div>
	);
}
