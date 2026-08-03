/**
 * Building blocks the Pro add-on (and other extensions) reuse instead of
 * bundling their own copies (v1.79). Handed to `wpie.ready` as the second
 * argument and mirrored on window.WPIE.bridge. This is a public surface:
 * only additive changes, never rename or remove members.
 */

import {
	posts,
	automation,
	templates,
	ai,
	geo,
	saveAsNew,
	buildFormData,
	updateMediaAlt,
	getMediaMeta,
	proxyImageUrl,
	saveToLibrary,
} from './api';
import {
	resolveBindings,
	collectMetaKeys,
	expandTokens,
	hasTokens,
	bindingGroups,
} from './dynamic-content';
import {
	prepareGeneratorLayers,
	renderTemplateResolved,
} from './generator-resolve';
import { nearestAspect } from './aspect';
import {
	renderToBlob,
	renderToCanvas,
	sharedImageCache,
	registerUserTile,
} from './raster';
import { buildPdf } from './favicon-pdf';
import {
	ensureFontsForLayers,
	ensureFont,
	ALL_FONT_FAMILIES,
	GOOGLE_FONTS,
	customFamilies,
	googleEnabled,
} from './font-manager';
import {
	hydrateLayers,
	serializeLayers,
	loadImage,
	createBlankDoc,
	makeImage,
	makeShape,
	makeText,
	makeGroup,
} from '../store/document';
import { loadTemplate, invalidateTemplate } from './template-cache';
import { PROVIDER_LABELS, hasTextProvider } from './providers';
import { parseCsv } from './csv';
import { listActions, createHeadlessEditor, runMacro } from './macros';
import { optimizeCanvas, encodeCanvas, fitCanvas, ssimLuma } from './optimize';
import {
	loadTransformers,
	isModelInstalled,
	modelsBaseUrl,
	mlPipeline,
	preferredDevice,
} from './ml';
import { captionImage } from './caption';
import { applyWatermark } from './watermark';
import { listExportPresets } from './export-presets';
import { exportSvg, importSvg } from './svg-io';
import { rng, EASINGS } from './seeded';
import {
	recordCanvas,
	pickRecorderMime,
	canRecordCanvas,
	canRecordWebm,
	recordingExtension,
} from './canvas-record';
import { downloadBlob } from './download';
import {
	buildScheme,
	randomSchemeInput,
	schemeRoles,
	labelColorFor,
} from './color-scheme';
import { extractPalette } from './palette';
import { contrastRatio } from './contrast-check';
import { qrPayload, qrPayloadReady, qrWarnings, renderQr } from './qr';
import { brandKits, kitById, activeKitColors } from './brand-kits';
import { storeGet, storeSet } from './ext-store';
import {
	el as uiEl,
	dialog as uiDialog,
	section as uiSection,
	row as uiRow,
	slider as uiSlider,
	select as uiSelect,
	check as uiCheck,
	btn as uiBtn,
} from './ext-ui';
import { createElement, createRoot } from '@wordpress/element';
import { HelpLink } from '../screens/help-dialog';
import { SwatchButton } from '../components/color-popover';
import { VarButton } from '../components/var-picker';
import { StyleButton } from '../components/style-picker';
import { FontPicker } from '../components/font-picker';
import { KitSelect } from '../components/kit-select';
import { MediaPicker } from '../components/media-picker';
import { IconPicker } from '../components/icon-picker';
import { I } from '../icons';

export const proBridge = Object.freeze( {
	api: {
		posts,
		automation,
		templates,
		ai,
		// geo (v1.144, additive): server-side OpenStreetMap proxy for map
		// extensions - geo.search( q ) and geo.map( { south, west, north,
		// east, detail, buildings } ), cached, capability-gated.
		geo,
		saveAsNew,
		buildFormData,
		updateMediaAlt,
		getMediaMeta,
		proxyImageUrl,
		saveToLibrary,
	},
	// prepareGeneratorLayers (additive): async pass that lets extension
	// generators (registerGenerator's `resolve` hook) re-render their
	// layers per post context; call it right before resolveBindings.
	dynamicContent: {
		resolveBindings,
		collectMetaKeys,
		prepareGeneratorLayers,
		// Token helpers (v1.162, additive): expandTokens( str, ctx )
		// resolves inline {{binding.id}} placeholders, hasTokens tests
		// for them, bindingGroups lists the catalog for pickers.
		expandTokens,
		hasTokens,
		bindingGroups,
	},
	aspect: { nearestAspect },
	// buildPdf (additive, v1.234): wraps JPEG bytes into a one-page PDF;
	// the Pro automation uses it for "Also save as PDF".
	raster: {
		renderToBlob,
		renderToCanvas,
		sharedImageCache,
		buildPdf,
		// registerUserTile (additive, v1.287.1): pre-decode a custom
		// pattern-fill tile so the first paint after an insert already
		// has it (the render pipeline also warms tiles itself now; this
		// lets studios decode ahead of their own previews).
		registerUserTile,
		// docBackdrop (v1.273 / API 2.10, additive): the "Show document"
		// helper - the current document rendered WITHOUT one group (the
		// layers a studio is editing), for preview backdrops. Renders at
		// document size; callers scale when drawing.
		docBackdrop: ( state, { exclude = null } = {} ) => {
			const layers = ( state?.layers || [] ).filter(
				( l ) => l.id !== exclude && l.parent !== exclude
			);
			return renderToCanvas( state.doc, layers, {
				cache: sharedImageCache,
			} );
		},
	},
	// video (v1.273 / API 2.10, additive): canvas -> video capture with the
	// mime fallback chain; every motion studio recorded by hand before.
	// canRecordCanvas + recordingExtension since API 2.12: ask BEFORE
	// offering a record button, and name the file after what came back -
	// WebKit records MP4, not WebM. canRecordWebm is the narrower question,
	// for a studio whose own text promises a .webm.
	video: {
		recordCanvas,
		pickRecorderMime,
		canRecordCanvas,
		canRecordWebm,
		recordingExtension,
	},
	// optimize (v1.297, additive): browser-native image optimization -
	// SSIM-guided auto quality, WebP-preferring, dimension capping.
	optimize: { optimizeCanvas, encodeCanvas, fitCanvas, ssimLuma },
	// util (v1.273 / API 2.10, additive): deterministic seeded rng (the
	// sequence is contract - saved designs replay), easings, downloads.
	util: { rng, EASINGS, downloadBlob },
	// colors (v1.273 / API 2.10, additive): scheme builder, dominant-color
	// extraction from an image element/canvas, WCAG contrast ratio.
	colors: {
		buildScheme,
		randomSchemeInput,
		schemeRoles,
		labelColorFor,
		extractPalette,
		contrastRatio,
	},
	// ui (v1.273 / API 2.10, additive): framework-free DOM builders for
	// extension dialogs, emitting the shared dsm classes (dialog shell,
	// icon-headed section cards, rows, sliders, selects, checks, buttons)
	// so studios match the CI without local helpers or CSS.
	ui: {
		el: uiEl,
		dialog: uiDialog,
		section: uiSection,
		row: uiRow,
		slider: uiSlider,
		select: uiSelect,
		check: uiCheck,
		btn: uiBtn,
	},
	// storage (v1.273 / API 2.10, additive): per-user, per-extension JSON
	// store (<= 32 KB per namespace; use the extension slug as ns) - the
	// server-backed home for favorites/toggles instead of localStorage.
	storage: { get: storeGet, set: storeSet },
	// brand (v1.273 / API 2.10, additive): kit catalog + THE palette
	// resolution (document's active kit -> site kit -> first usable kit).
	// Every studio derived this locally before, mostly wrong.
	brand: { kits: brandKits, kitById, activeKitColors },
	// qr (v1.273 / API 2.10, additive): the editor's QR engine - payload
	// builders, styled renderer (lazy qrcode chunk; render() resolves to
	// { canvas, modules, ecl } - draw result.canvas), warnings.
	qr: {
		payload: qrPayload,
		ready: qrPayloadReady,
		render: renderQr,
		warnings: qrWarnings,
	},
	fonts: {
		ensureFontsForLayers,
		// v1.268.0 / API 2.8 (additive): the full pickable family catalog and
		// a single-family loader, so extensions can offer the editor's whole
		// font list and load a face before rendering it on their own canvas.
		ensureFont,
		listFamilies: () => {
			const list = [
				...ALL_FONT_FAMILIES,
				...customFamilies(),
				...( googleEnabled() ? GOOGLE_FONTS : [] ),
			];
			return list.filter( ( f, i ) => f && list.indexOf( f ) === i );
		},
	},
	documents: {
		hydrateLayers,
		serializeLayers,
		loadImage,
		createBlankDoc,
		makeImage,
		// Layer factories for extension generators (v1.119, additive).
		makeShape,
		makeText,
		makeGroup,
	},
	// renderResolved (additive): template + post context -> canvas with
	// bindings, fonts and nested generator layers resolved.
	templatesLib: {
		loadTemplate,
		invalidateTemplate,
		renderResolved: renderTemplateResolved,
	},
	providers: { PROVIDER_LABELS, hasTextProvider },
	csv: { parseCsv },
	// listMacros serves the FULL set (bundled + user) since v1.246,
	// so Pro pickers (Image Processor, Generate Content) see the
	// starter actions too.
	macros: { listMacros: listActions, createHeadlessEditor, runMacro },
	// Local transformer runtime for extension AI tools (v1.122, additive):
	// loadTransformers() returns the transformers.js namespace wired to the
	// self-hosted runtime and models; nothing leaves the browser.
	ml: {
		loadTransformers,
		isModelInstalled,
		modelsBaseUrl,
		// v4 helpers (v1.124, additive): quantized pipeline with WebGPU
		// auto-fallback, and the device hint.
		mlPipeline,
		preferredDevice,
		// captionImage (API 2.12, additive): one call for a local caption.
		// The 'caption' model is Florence-2, which is NOT a plain
		// image-to-text pipeline - it needs a processor, a tokenizer and a
		// task token. Every extension that tried to caption an image had to
		// rebuild that, and the documented example got it wrong.
		captionImage,
	},
	watermark: { applyWatermark },
	exportPresets: { listExportPresets },
	// iconsLib (v1.268.0 / API 2.8, additive): lazy access to the editor's
	// bundled icon libraries for extensions, so they need not ship their own
	// copies. loadTabler() resolves the { name: pathD } Tabler map (5000+
	// stroke icons on a 24 grid); loadEmoji() resolves the [{ c, n, g }]
	// emoji list. Both reuse the same webpack chunks the editor already
	// loads, so nothing is downloaded twice.
	iconsLib: {
		loadTabler: () =>
			import(
				/* webpackChunkName: "icons-lib" */ '../icons-lib/tabler.json'
			).then( ( m ) => m.default || m ),
		loadEmoji: () =>
			import(
				/* webpackChunkName: "emoji-lib" */ '../icons-lib/emoji.json'
			).then( ( m ) => m.default || m ),
	},
	// svg (v1.157.1, additive): the vector exporter for Pro's live badges
	// (exportSvg keeps data-wpie-binding markers on bound text layers).
	svg: { exportSvg, importSvg },
	components: {
		HelpLink,
		// mountColorButton (v1.145, additive): the editor's color swatch +
		// popover rendered into a plain DOM node, for framework-free
		// extension packs. Returns { set( color ), unmount() }.
		mountColorButton( node, { color, onChange, title } ) {
			const root = createRoot( node );
			// Self-updating (v1.335), same contract as mountFontPicker: the
			// swatch is a controlled React component, so the mount re-renders
			// itself with each pick BEFORE notifying the host - otherwise the
			// swatch snaps back to the initial color unless every caller
			// remembers to echo it with set( c ). Several packs did not, and
			// the picked color looked like it had been ignored. Callers that
			// do call set() are unaffected: it renders the same value twice.
			const render = ( value ) =>
				root.render(
					createElement( SwatchButton, {
						color: value,
						onChange: ( next ) => {
							render( next );
							onChange( next );
						},
						title,
					} )
				);
			render( color );
			return { set: render, unmount: () => root.unmount() };
		},
		// mountVarButton (v1.162, additive): the editor's dynamic-variable
		// picker rendered into a plain DOM node - a tiny {…} button whose
		// popover inserts `{{binding.id}}` tokens. getValue() supplies the
		// field's current text, onChange( next ) receives it with the
		// token spliced in at inputEl's caret (appended without inputEl).
		// Returns { unmount() }.
		mountVarButton(
			node,
			// onKitChange (v1.251.0, additive): with 2+ kits the picker
			// shows a kit switcher; the callback persists the choice
			// (extensions dispatch SET_DOC {brandKitId} on their editor).
			{
				getValue,
				onChange,
				inputEl = null,
				kit = null,
				onKitChange = null,
			}
		) {
			const root = createRoot( node );
			root.render(
				createElement( VarButton, {
					getValue,
					onChange,
					inputRef: { current: inputEl },
					kit,
					onKitChange,
				} )
			);
			return { unmount: () => root.unmount() };
		},
		// mountFontPicker (v1.272.1, additive): THE font selector - grouped
		// list (Brand / Custom / System fonts / Editor fonts / Google) with
		// every family previewed in its own face - rendered into a plain
		// DOM node for framework-free extension packs. One component
		// everywhere, one place to fix. Returns { set( family ), unmount() }.
		// `families` (v1.273 / API 2.10, additive): optional allow-list so
		// curated catalogs (e.g. a 3D face set) offer only their fonts.
		mountFontPicker(
			node,
			{ value, onChange, width = '100%', families = null }
		) {
			// Field styling (v1.272.2): mounted pickers behave like every
			// other dsm-select - full section width, select chevron.
			node.classList.add( 'wpie-font-mount' );
			const root = createRoot( node );
			// Hosts style their own fields (28..40px vary per extension):
			// copy the nearest sibling field's height so the picker sits
			// flush with its neighbours - measure, never assume (the
			// wp-admin min-height lesson, v1.9.2).
			const matchMetrics = () => {
				let scope = node.parentElement;
				for ( let i = 0; scope && i < 6; i++ ) {
					const sib = Array.from(
						scope.querySelectorAll(
							'select, input[type="text"], .dsm-input'
						)
					).find(
						( el ) =>
							! node.contains( el ) &&
							el.offsetHeight >= 22 &&
							el.offsetHeight <= 60
					);
					if ( sib ) {
						const btn = node.querySelector( '.font-picker-toggle' );
						if ( btn ) {
							btn.style.height = sib.offsetHeight + 'px';
						}
						return;
					}
					scope = scope.parentElement;
				}
			};
			// Self-updating (v1.272.4): the picker is a controlled React
			// component, so the mount re-renders itself with each pick
			// BEFORE notifying the host - otherwise the toggle snaps back
			// to the initial family (Calendar Studio report).
			const render = ( family ) => {
				root.render(
					createElement( FontPicker, {
						value: family,
						onChange: ( fam ) => {
							render( fam );
							onChange( fam );
						},
						width,
						families,
					} )
				);
				window.requestAnimationFrame( matchMetrics );
			};
			render( value );
			return { set: render, unmount: () => root.unmount() };
		},
		// mountIconPicker (v1.273 / API 2.10, additive): search + tabs
		// over the bundled Tabler and emoji libraries (lazy chunks) as an
		// inline panel. onPick receives { type: 'icon', name, path } or
		// { type: 'emoji', char, name }. Returns { unmount }.
		mountIconPicker(
			node,
			{ onPick, icons = true, emoji = true, height = 240 }
		) {
			const root = createRoot( node );
			root.render(
				createElement( IconPicker, { onPick, icons, emoji, height } )
			);
			return { unmount: () => root.unmount() };
		},
		// mountMediaPicker (v1.273 / API 2.10, additive): the editor's
		// in-modal media chooser (title + semantic search, endless scroll)
		// rendered into a plain DOM node. onPick receives { id, url
		// (thumb), fullUrl, title }; the HOST owns selection - pass
		// selectedIds (array) for multi-select display and update it via
		// set( ids ). Returns { set, unmount }.
		mountMediaPicker( node, { onPick, height = 240, selectedIds = null } ) {
			const root = createRoot( node );
			const render = ( ids ) =>
				root.render(
					createElement( MediaPicker, {
						onPick,
						height,
						selected: Array.isArray( ids ) ? new Set( ids ) : null,
					} )
				);
			render( selectedIds );
			return { set: render, unmount: () => root.unmount() };
		},
		// mountKitPicker (v1.273 / API 2.10, additive): brand-kit dropdown
		// (dsm-select of all kits, controlled, self-updating). Renders
		// nothing when the site has no kits. `allowEmpty` prepends a
		// "Site default" option with value ''. Returns { set, unmount }.
		mountKitPicker( node, { value, onChange, allowEmpty = false } ) {
			const root = createRoot( node );
			const render = ( v ) =>
				root.render(
					createElement( KitSelect, {
						value: v,
						onChange: ( id ) => {
							render( id );
							onChange( id );
						},
						allowEmpty,
					} )
				);
			render( value );
			return { set: render, unmount: () => root.unmount() };
		},
		// mountStyleButton (v1.164, additive): the AI style-preset picker
		// for any prompt field - one click appends a curated visual style
		// descriptor to the prompt (picking another replaces it). Same
		// getValue/onChange contract as mountVarButton.
		mountStyleButton( node, { getValue, onChange, compact = false } ) {
			const root = createRoot( node );
			root.render(
				createElement( StyleButton, { getValue, onChange, compact } )
			);
			return { unmount: () => root.unmount() };
		},
	},
	icons: I,
} );
