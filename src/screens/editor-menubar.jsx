import { FILTER_COLLECTION_GROUPS } from '../lib/filter-collection';
import { LAYER_EFFECT_GROUPS } from '../lib/layer-effects-collection';
import { PaintSwatch } from '../components/paint-controls';
/**
 * Menu bar: real dropdowns for File/Edit/Image/Layer/Select/Filter/View/Help
 * plus the contextual tool-options block (spec 04.2).
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __, _x } from '@wordpress/i18n';

import { I } from '../icons';
import { EyedropperOptions } from '../components/eyedropper-options';
import { tipPreview, TIP_TILE } from '../lib/brush-preview';
import { FILTERS, FONT_WEIGHTS } from '../store/constants';
import { BlendModeSelect } from '../components/blend-select';
import { FontPicker } from '../components/font-picker';
import { connectFolder } from './library/archive-section';
import {
	CropFormatSelect,
	CropActions,
	CropPreviewActions,
} from './panels/crop-panel';
import { listRecentFiles } from '../lib/recent-files';
import { listMacros, listActions, runMacro } from '../lib/macros';
import { ACTION_CATEGORIES } from '../lib/bundled-actions';
import { PROOF_MODES } from '../lib/proof';
import { BRUSH_TIPS, isStampTip, getTip } from '../lib/brush-tips';
import { canFluidText, toggleFluidTextOp } from '../lib/text-fit-ops';
import { EFFECTS, defaultParamsFor } from '../lib/effects';
import { TextStylePicker } from './text-style-picker';
import { ShapeStylePicker } from './shape-style-picker';
import { useSelectionFeather } from '../components/use-selection-feather';
import { useHoverTip } from '../components/hover-tip';
import { SELECTION_MODES } from './panels/selection-panel';
import { repeatLayerOf, REPEAT_MODES } from '../lib/repeat-layer';
import { REPEAT_LIMITS } from '../lib/repeat-layout';
import { useSelectionStyle } from '../components/use-selection-style';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { selectionBounds } from './canvas/overlays';
import {
	extensionMenuItems,
	listExtensionFilterPresets,
	listExtensionEffects,
	listExtensionGenerators,
	subscribeExtensions,
} from '../lib/extensions';
import { extensionEntries, extensionMenuSections } from '../lib/extension-menu';
import { SwatchButton } from '../components/color-popover';
import { ScrubLabel } from '../components/scrub-label';
import * as Ops from '../store/ops';
import { currentLocale, availableLocales } from '../lib/editor-locale';
import { ShapePicker } from '../components/shape-picker';
import { gradientLayerOf, gradientKindPatch } from '../lib/gradient-layer';
import { FX_BRUSH_MODES } from './panels/fxbrush-panel';
import { ancestorLocked } from './canvas/tool-handlers';
import { useEffectPreview } from './panels/use-effect-preview';

/**
 * Build the menu model (spec 04.2, every listed item, all functional).
 * `run` receives (editor, extras); `when` gates enabled state. Exported for
 * the title-bar search, which indexes exactly what the menus offer.
 */
export function buildMenus( editor, extras ) {
	const { state } = editor;
	const hasActive = !! state.activeId;
	const hasSelection = !! state.selection;

	// A Pro feature only appears in the free plugin when the Pro add-on
	// actually provides it (window.WPIE.pro.features); otherwise the entry
	// is hidden and Pro is promoted only from the About dialog (v1.316).
	const proHas = ( slug ) => !! window.WPIE?.pro?.features?.includes( slug );

	// Extension items are appended per menu behind a divider (v0.4);
	// `position: 'start'` items lead the menu instead (v1.79 — Pro entries
	// that replace native ones keep their old spot). Submenus with a
	// `subId` accept items under `menuId/subId` (v1.119), e.g.
	// registerMenuItem( 'automation/design', … ).
	const mapExtItems = ( list ) =>
		list.map( ( item ) => ( {
			label: item.label,
			run: () => item.run( { editor, extras } ),
			when: item.when ? () => item.when( { editor } ) : undefined,
			position: item.position,
		} ) );
	const withExtensionItems = ( menus ) =>
		menus.map( ( menu ) => {
			// The Extensions menu folds registered items into its curated
			// categories itself (v1.310) - the generic appender would
			// duplicate them as loose top-level entries.
			if ( 'extensions' === menu.id ) {
				return menu;
			}
			const mapped = mapExtItems( extensionMenuItems( menu.id ) );
			const lead = mapped.filter( ( i ) => 'start' === i.position );
			const tail = mapped.filter( ( i ) => 'start' !== i.position );
			let items = menu.items.map( ( item ) => {
				if ( ! item.subId || ! item.children ) {
					return item;
				}
				const sub = mapExtItems(
					extensionMenuItems( `${ menu.id }/${ item.subId }` )
				);
				return sub.length
					? { ...item, children: [ ...item.children, ...sub ] }
					: item;
			} );
			if ( lead.length ) {
				items = [ ...lead, ...items ];
			}
			if ( tail.length ) {
				items = [ ...items, { divider: true }, ...tail ];
			}
			return { ...menu, items };
		} );

	return withExtensionItems( [
		{
			id: 'file',
			label: __( 'File', 'wunderpaint' ),
			items: [
				{ head: __( 'Open', 'wunderpaint' ) },
				{
					// No kbd: ⌘N belongs to the browser (new window) and no
					// page can claim it, so the menu must not promise it.
					label: __( 'New', 'wunderpaint' ),
					run: () => extras.openCreate(),
				},
				{
					label: __( 'Open/Place', 'wunderpaint' ),
					run: () => Ops.openPlaceOp( editor, extras ),
				},
				{
					// A folder on the visitor's own computer (v1.431.0),
					// read in place; the tray opens on it once connected.
					label: __( 'Connect Folder', 'wunderpaint' ),
					run: () => connectFolder( extras ),
				},
				{
					label: __( 'Open Recent', 'wunderpaint' ),
					children: listRecentFiles().length
						? listRecentFiles().map( ( f ) => ( {
								label: `${ f.name } (#${ f.id })`,
								run: () => {
									window.location =
										editor.WPIE.libraryUrl +
										'?page=wpie-editor&attachment=' +
										f.id;
								},
						  } ) )
						: [
								{
									label: __(
										'No recent files',
										'wunderpaint'
									),
									run: () => {},
									when: () => false,
								},
						  ],
				},
				{
					label: __( 'Open Dynamic Template', 'wunderpaint' ),
					run: () => extras.openTemplatePicker(),
				},
				{ head: __( 'Save', 'wunderpaint' ) },
				// Demo mode hides the library destinations; Export (the pure
				// client-side download) is the save there and takes ⌘S (v1.307).
				{
					label: __( 'Save to Media Library', 'wunderpaint' ),
					kbd: '⌘S',
					run: () => extras.openExport( 'save' ),
					when: () =>
						! state.doc.source?.isNew && ! window.WPIE?.demo,
				},
				{
					label: __( 'Save as New Image', 'wunderpaint' ),
					run: () => extras.openExport( 'saveAs' ),
					when: () => ! window.WPIE?.demo,
				},
				{
					label: __( 'Export', 'wunderpaint' ),
					kbd: window.WPIE?.demo ? '⌘S' : '⇧⌘E',
					run: () => extras.openExport( 'export' ),
				},
				{ head: __( 'Share', 'wunderpaint' ) },
				// Sharing needs a server that can hand out a public link, and
				// the standalone studio has none: its local host knows no
				// /designs/{id}/share, so the POST fell into the generic
				// design-update branch - the full-size JPEG was merged into
				// the stored design and the link dialog opened empty. Stop
				// Sharing was worse: its DELETE matched the plain
				// design-delete branch and threw the whole design away while
				// reporting the link revoked. Hidden here rather than made to
				// look like it works; in WordPress both are unchanged.
				{
					ws: 'mi.file.share',
					label: __( 'Share Design Link', 'wunderpaint' ),
					run: () => Ops.shareDesignOp( editor, extras ),
					when: () =>
						!! state.doc.source?.designId &&
						! window.WPIE?.standalone,
				},
				{
					ws: 'mi.file.unshare',
					label: __( 'Stop Sharing', 'wunderpaint' ),
					run: () => Ops.unshareDesignOp( editor, extras ),
					when: () =>
						!! state.doc.source?.designId &&
						! window.WPIE?.standalone,
				},
				{ head: __( 'Editable', 'wunderpaint' ) },
				{
					label: __( 'Save Editable Design', 'wunderpaint' ),
					run: () => Ops.saveDesignOp( editor, extras ),
				},
				// "As" only differs once the document IS a saved design
				// (plain Save then updates it in place) - hidden otherwise.
				{
					label: __( 'Save Editable Design As', 'wunderpaint' ),
					when: () => !! editor.state.doc.source?.designId,
					run: () => Ops.saveDesignOp( editor, extras, true ),
				},
				{ head: __( 'Reusable', 'wunderpaint' ) },
				{
					ws: 'mi.file.dyntemplate',
					label: __( 'Save as Dynamic Template', 'wunderpaint' ),
					run: () => Ops.saveAsTemplateOp( editor, extras ),
				},
				{
					ws: 'mi.file.asset',
					label: __( 'Save as Asset', 'wunderpaint' ),
					run: () => Ops.saveAssetToLibraryOp( editor, extras ),
					when: () => hasActive,
				},
				{
					ws: 'mi.file.pattern',
					label: __( 'Save as Pattern', 'wunderpaint' ),
					run: () => Ops.saveAsPatternOp( editor, extras ),
				},
				{ head: __( 'Pages', 'wunderpaint' ) },
				{
					label: __( 'Add Page', 'wunderpaint' ),
					run: () => Ops.addPageOp( editor ),
				},
				{ head: __( 'Project', 'wunderpaint' ) },
				{
					ws: 'mi.file.project',
					label: __( 'Project (.wpie)', 'wunderpaint' ),
					children: [
						{
							label: __( 'Open Project (.wpie)', 'wunderpaint' ),
							run: () => Ops.openProjectOp( editor, extras ),
						},
						{
							label: __(
								'Download Project (.wpie)',
								'wunderpaint'
							),
							run: () => Ops.downloadProjectOp( editor, extras ),
						},
					],
				},
				{
					ws: 'mi.file.importexport',
					label: __( 'Import / Export', 'wunderpaint' ),
					children: [
						{
							label: __( 'Import SVG', 'wunderpaint' ),
							run: () => Ops.importSvgOp( editor, extras ),
						},
						{
							label: __( 'Export SVG', 'wunderpaint' ),
							run: () => Ops.exportSvgOp( editor, extras ),
						},
						{
							label: __( 'Import PSD', 'wunderpaint' ),
							run: () => Ops.importPsdOp( editor, extras ),
						},
						{
							label: __( 'Export PSD', 'wunderpaint' ),
							run: () => Ops.exportPsdOp( editor, extras ),
						},
						{
							label: __( 'Export Layer Comps', 'wunderpaint' ),
							run: () => Ops.exportCompsOp( editor, extras ),
							when: () => ( state.doc.comps || [] ).length > 0,
						},
						{
							label: __( 'Export Carousel', 'wunderpaint' ),
							run: () => extras.openCarousel(),
						},
					],
				},
				{ divider: true },
				{
					label: __( 'Close', 'wunderpaint' ),
					run: () => extras.close(),
				},
			],
		},
		{
			id: 'edit',
			label: __( 'Edit', 'wunderpaint' ),
			items: [
				{ head: __( 'History', 'wunderpaint' ) },
				{
					label: __( 'Undo', 'wunderpaint' ),
					kbd: '⌘Z',
					run: () => editor.undo(),
					when: () => editor.canUndo,
				},
				{
					label: __( 'Redo', 'wunderpaint' ),
					kbd: '⇧⌘Z',
					run: () => editor.redo(),
					when: () => editor.canRedo,
				},
				{ head: __( 'Clipboard', 'wunderpaint' ) },
				{
					label: __( 'Cut Layer', 'wunderpaint' ),
					kbd: '⌘X',
					run: () => Ops.copyLayers( editor, true ),
					when: () => hasActive,
				},
				{
					label: __( 'Copy Layer', 'wunderpaint' ),
					kbd: '⌘C',
					run: () => Ops.copyLayers( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Paste Layer', 'wunderpaint' ),
					kbd: '⌘V',
					run: () => Ops.pasteLayers( editor ),
					when: () => !! state.clipboard?.length,
				},
				{
					label: __( 'Paste in Place', 'wunderpaint' ),
					kbd: '⇧⌘V',
					run: () => Ops.pasteInPlaceOp( editor ),
					when: () => !! state.clipboard?.length,
				},
				{
					label: __( 'Duplicate', 'wunderpaint' ),
					kbd: '⌘J',
					run: () => Ops.duplicateLayer( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Delete', 'wunderpaint' ),
					kbd: '⌫',
					run: () => Ops.deleteLayers( editor ),
					when: () => hasActive,
				},
				{ head: __( 'Styles & Colors', 'wunderpaint' ) },
				{
					label: __( 'Copy Styles', 'wunderpaint' ),
					run: () => Ops.copyLayerStyles( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Paste Styles', 'wunderpaint' ),
					run: () => Ops.pasteLayerStyles( editor ),
					when: () => hasActive && !! state.styleClipboard,
				},
				{
					// One color for another across the page (v1.431.0).
					label: __( 'Replace Colors', 'wunderpaint' ),
					run: () => extras.openReplaceColors(),
				},
				{ head: __( 'Transform', 'wunderpaint' ) },
				{
					ws: 'mi.edit.freetransform',
					label: __( 'Free Transform', 'wunderpaint' ),
					run: () => Ops.freeTransformOp( editor, extras ),
					when: () => hasActive,
				},
				{ head: __( 'Settings', 'wunderpaint' ) },
				{
					ws: 'mi.edit.prefs',
					label: __( 'Preferences', 'wunderpaint' ),
					run: () => window.open( editor.WPIE.settingsUrl, '_blank' ),
				},
			],
		},
		{
			id: 'image',
			label: __( 'Image', 'wunderpaint' ),
			items: [
				{ head: __( 'Size', 'wunderpaint' ) },
				{
					label: __( 'Image Size', 'wunderpaint' ),
					run: () => extras.openResize( 'image' ),
				},
				{
					label: __( 'Canvas Size', 'wunderpaint' ),
					run: () => extras.openResize( 'canvas' ),
				},
				{
					ws: 'mi.image.resizedesign',
					label: __( 'Resize Design', 'wunderpaint' ),
					run: () => extras.openMagicResize(),
				},
				{ head: __( 'Color', 'wunderpaint' ) },
				// Color utilities as one family (v1.95.0), incl. the LUT
				// loader that used to live at the end of the Filter menu.
				{
					ws: 'mi.image.colors',
					label: __( 'Colors', 'wunderpaint' ),
					children: [
						{
							label: __(
								'Change Background Color',
								'wunderpaint'
							),
							run: () => Ops.changeBackgroundColorOp( editor ),
						},
						{ divider: true },
						{
							label: __(
								'Extract Colors from Image',
								'wunderpaint'
							),
							run: () => Ops.extractColorsOp( editor, extras ),
							when: () => hasActive,
						},
						{
							label: __(
								'Apply Palette from Image',
								'wunderpaint'
							),
							run: () =>
								Ops.applyPaletteOp( editor, extras, 'image' ),
							when: () => hasActive,
						},
						{
							label: __( 'Apply Brand Colors', 'wunderpaint' ),
							run: () =>
								Ops.applyPaletteOp( editor, extras, 'brand' ),
							when: () => !! editor.WPIE?.brand?.colors?.length,
						},
						{ divider: true },
						{
							label: __( 'Load LUT (.cube)', 'wunderpaint' ),
							run: () => Ops.applyLutOp( editor, extras ),
							when: () => hasActive,
						},
					],
				},
				{ head: __( 'Crop', 'wunderpaint' ) },
				{
					label: __( 'Crop to Selection', 'wunderpaint' ),
					run: () => Ops.cropToSelectionOp( editor ),
					when: () => hasSelection,
				},
				{
					label: __( 'Crop to Image', 'wunderpaint' ),
					run: () =>
						Ops.cropToLayerOp(
							editor,
							__( 'Crop to Image', 'wunderpaint' )
						),
					when: () =>
						[ 'image', 'raster', 'smart' ].includes(
							activeLayerOf( state )?.type
						),
				},
				{
					label: __( 'Trim', 'wunderpaint' ),
					run: () => Ops.trimOp( editor, extras ),
				},
				{ head: __( 'Rotate & Flip', 'wunderpaint' ) },
				{
					label: __( 'Rotate 90° CW', 'wunderpaint' ),
					run: () => Ops.rotateDocOp( editor, true ),
				},
				{
					label: __( 'Rotate 90° CCW', 'wunderpaint' ),
					run: () => Ops.rotateDocOp( editor, false ),
				},
				{
					label: __( 'Flip Horizontal', 'wunderpaint' ),
					run: () => Ops.flipDocOp( editor, true ),
				},
				{
					label: __( 'Flip Vertical', 'wunderpaint' ),
					run: () => Ops.flipDocOp( editor, false ),
				},
			],
		},
		{
			id: 'layer',
			label: __( 'Layer', 'wunderpaint' ),
			items: [
				{ head: __( 'New', 'wunderpaint' ) },
				{
					// No kbd: ⇧⌘N is the browser's private window (HILFE-06).
					label: __( 'New Layer', 'wunderpaint' ),
					run: () => Ops.newLayerOp( editor ),
				},
				{
					label: __( 'New Group', 'wunderpaint' ),
					run: () => Ops.newGroupOp( editor ),
				},
				{
					label: __( 'New Fill Layer', 'wunderpaint' ),
					children: [
						{
							label: __( 'Solid Color', 'wunderpaint' ),
							run: () => Ops.newFillLayerOp( editor, 'solid' ),
						},
						{
							label: __( 'Gradient', 'wunderpaint' ),
							run: () => Ops.newFillLayerOp( editor, 'gradient' ),
						},
						{
							label: __( 'Pattern', 'wunderpaint' ),
							run: () => Ops.newFillLayerOp( editor, 'pattern' ),
						},
					],
				},
				{
					label: __( 'New Texture Layer', 'wunderpaint' ),
					children: [
						{
							label: __( 'Grain', 'wunderpaint' ),
							run: () => Ops.newTextureLayerOp( editor, 'grain' ),
						},
						{
							label: __( 'Paper', 'wunderpaint' ),
							run: () => Ops.newTextureLayerOp( editor, 'paper' ),
						},
						{
							label: __( 'Fibers', 'wunderpaint' ),
							run: () =>
								Ops.newTextureLayerOp( editor, 'fibers' ),
						},
						{
							label: __( 'Canvas Weave', 'wunderpaint' ),
							run: () =>
								Ops.newTextureLayerOp( editor, 'canvas' ),
						},
						{
							label: __( 'Cross-hatch', 'wunderpaint' ),
							run: () =>
								Ops.newTextureLayerOp( editor, 'crosshatch' ),
						},
						{
							label: __( 'Concrete', 'wunderpaint' ),
							run: () =>
								Ops.newTextureLayerOp( editor, 'concrete' ),
						},
						{
							label: __( 'Color Noise', 'wunderpaint' ),
							run: () => Ops.newTextureLayerOp( editor, 'noise' ),
						},
						{
							label: __( 'Scanlines', 'wunderpaint' ),
							run: () =>
								Ops.newTextureLayerOp( editor, 'scanlines' ),
						},
					],
				},
				{ head: __( 'Duplicate & Repeat', 'wunderpaint' ) },
				{
					label: __( 'Duplicate', 'wunderpaint' ),
					run: () => Ops.duplicateLayer( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Layer via Copy', 'wunderpaint' ),
					run: () => Ops.layerViaCopyOp( editor ),
					when: () => hasActive,
				},
				{ head: __( 'Edit', 'wunderpaint' ) },
				{
					label: __( 'Trim Transparent Pixels', 'wunderpaint' ),
					run: () => Ops.trimLayerOp( editor ),
					when: () => 'raster' === activeLayerOf( state )?.type,
				},
				{
					label: __( 'Crop to Layer', 'wunderpaint' ),
					run: () =>
						Ops.cropToLayerOp(
							editor,
							__( 'Crop to Layer', 'wunderpaint' )
						),
					when: () => hasActive,
				},
				{
					label: __( 'Merge Down', 'wunderpaint' ),
					run: () => Ops.mergeDownOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Flatten', 'wunderpaint' ),
					run: () => Ops.flattenOp( editor ),
				},
				{
					label: __( 'Delete', 'wunderpaint' ),
					run: () => Ops.deleteLayers( editor ),
					when: () => hasActive,
				},
				{ head: __( 'Smart & Masks', 'wunderpaint' ) },
				{
					label: __( 'Convert to Smart Object', 'wunderpaint' ),
					run: () => Ops.convertToSmartOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Add Layer Mask', 'wunderpaint' ),
					run: () => Ops.addMaskOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Create Clipping Mask', 'wunderpaint' ),
					run: () => Ops.clippingMaskOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Fit into Frame', 'wunderpaint' ),
					run: () => Ops.fitIntoFrameOp( editor, extras ),
					when: () => hasActive,
				},
				{ head: __( 'Arrange', 'wunderpaint' ) },
				{
					label: __( 'Bring Forward', 'wunderpaint' ),
					kbd: '⌘]',
					run: () => Ops.bringForwardOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Send Backward', 'wunderpaint' ),
					kbd: '⌘[',
					run: () => Ops.sendBackwardOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Bring to Front', 'wunderpaint' ),
					kbd: '⇧⌘]',
					run: () => Ops.bringToFrontOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Send to Back', 'wunderpaint' ),
					kbd: '⇧⌘[',
					run: () => Ops.sendToBackOp( editor ),
					when: () => hasActive,
				},
				{ head: __( 'Properties', 'wunderpaint' ) },
				{
					label: __( 'Rename layer', 'wunderpaint' ),
					run: () => Ops.renameLayerOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Hide layer', 'wunderpaint' ),
					kbd: '⇧⌘H',
					run: () => Ops.hideLayersOp( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Lock or unlock layer', 'wunderpaint' ),
					kbd: '⌘2',
					run: () => Ops.toggleLockOp( editor ),
					when: () => hasActive,
				},
			],
		},
		{
			id: 'select',
			label: __( 'Select', 'wunderpaint' ),
			items: [
				{ head: __( 'Selection', 'wunderpaint' ) },
				{
					label: __( 'All', 'wunderpaint' ),
					kbd: '⌘A',
					run: () => Ops.selectAllOp( editor ),
				},
				{
					label: __( 'Deselect', 'wunderpaint' ),
					kbd: '⌘D',
					run: () => Ops.deselectOp( editor ),
					when: () => hasSelection,
				},
				{
					label: __( 'Inverse', 'wunderpaint' ),
					kbd: '⇧⌘I',
					run: () => Ops.inverseSelectionOp( editor ),
				},
				{
					// Select Same (v1.429): every layer that shares the
					// active layer's fill, stroke, font or type.
					label: __( 'Select Same', 'wunderpaint' ),
					children: Ops.SELECT_SAME_CRITERIA.map( ( c ) => ( {
						label: c.label(),
						run: () => Ops.selectSameOp( editor, c.id ),
						when: () => hasActive,
					} ) ),
				},
				{ head: __( 'Draw', 'wunderpaint' ) },
				{
					label: __( 'Select by Marquee', 'wunderpaint' ),
					kbd: 'M',
					run: () =>
						editor.dispatch( {
							type: 'SET_TOOL',
							tool: 'marquee',
						} ),
				},
				{
					label: __( 'Select by Lasso', 'wunderpaint' ),
					kbd: 'L',
					run: () =>
						editor.dispatch( { type: 'SET_TOOL', tool: 'lasso' } ),
				},
				{ head: __( 'Smart', 'wunderpaint' ) },
				{
					label: __( 'Smart Select', 'wunderpaint' ),
					run: () => extras.selectSubject(),
				},
				{
					label: __( 'Remove Object', 'wunderpaint' ),
					run: () => extras.removeObject(),
					when: () => hasSelection,
				},
				{ head: __( 'Refine & Store', 'wunderpaint' ) },
				{
					label: __( 'Feather', 'wunderpaint' ),
					run: () => Ops.featherSelectionOp( editor, extras ),
					when: () => hasSelection,
				},
				{
					// Modify (v1.429): expand, contract, smooth and border
					// for any selection, on the mask morphology.
					label: __( 'Modify', 'wunderpaint' ),
					children: Object.keys( Ops.MODIFY_KINDS ).map(
						( kind ) => ( {
							label: Ops.MODIFY_KINDS[ kind ].label(),
							run: () =>
								Ops.modifySelectionPrompt( editor, kind ),
							when: () => hasSelection,
						} )
					),
				},
				{
					label: __( 'Save Selection', 'wunderpaint' ),
					run: () => Ops.saveSelectionOp( editor ),
					when: () => hasSelection,
				},
				{
					label: __( 'Load Selection', 'wunderpaint' ),
					run: () => Ops.loadSelectionOp( editor ),
					when: () => !! state.savedSelections.length,
				},
			],
		},
		{
			id: 'filter',
			label: __( 'Filter', 'wunderpaint' ),
			items: ( () => {
				const effectItem = ( e ) => ( {
					label: e.label,
					preview: () => ( {
						previewEffect: {
							id: e.id,
							params: defaultParamsFor( e.id ),
						},
					} ),
					run: () =>
						Object.keys( e.params || {} ).length
							? extras.openEffect( e.id )
							: Ops.applyEffectOp( editor, extras, e.id ),
					when: () => hasActive,
				} );
				const filterItem = ( f ) => ( {
					label: f.label,
					preview: () => ( { filter: f.id, filterAmount: 100 } ),
					run: () => Ops.applyPresetFilterOp( editor, f.id ),
					when: () => hasActive,
				} );
				const effectItems = ( ids ) =>
					ids
						.map( ( id ) => EFFECTS.find( ( e ) => e.id === id ) )
						.filter( ( e ) => e && ! e.collection )
						.map( effectItem );
				const GROUPS = {
					blur: [
						'gaussian-blur',
						'box-blur',
						'tilt-shift',
						'sharpen',
						'unsharp-mask',
						'denoise',
					],
					color: [
						'auto-levels',
						'auto-contrast',
						'auto-color',
						'shadows-highlights',
						'levels',
						'curves',
						'gamma',
						'color-splash',
						'invert',
						'posterize',
						'threshold',
					],
					stylize: [
						'vignette',
						'glow',
						'add-noise',
						'pixelate',
						'halftone',
						'glitch',
						'emboss',
						'edge-detect',
					],
				};
				const grouped = new Set( Object.values( GROUPS ).flat() );
				// Future built-ins that are not grouped yet land in Stylize.
				const rest = EFFECTS.filter(
					( e ) =>
						! e.hidden && ! e.collection && ! grouped.has( e.id )
				).map( effectItem );
				const extEffects = listExtensionEffects()
					.filter( ( e ) => ! e.hidden )
					.map( effectItem );
				const collectionItem = ( group ) => ( {
					label: group.label,
					children: EFFECTS.filter(
						( e ) => e.collection && e.group === group.id
					).map( effectItem ),
				} );
				return [
					{ head: __( 'Looks', 'wunderpaint' ) },
					{
						label: __( 'Presets', 'wunderpaint' ),
						children: [
							...[
								...FILTER_COLLECTION_GROUPS,
								{
									id: 'essentials',
									label: __( 'Essentials', 'wunderpaint' ),
								},
							].map( ( group ) => ( {
								label: group.label,
								children: FILTERS.filter(
									( f ) =>
										f.id !== 'none' &&
										( f.group || 'essentials' ) === group.id
								).map( filterItem ),
							} ) ),
							...listExtensionFilterPresets().map( filterItem ),
							{ divider: true },
							{
								...filterItem( {
									id: 'none',
									label: __( 'Remove Filter', 'wunderpaint' ),
								} ),
								when: () =>
									hasActive &&
									'none' !== activeLayerOf( state )?.filter,
							},
						],
					},
					{
						// Own submenu (v1.130.2): the presets crowded Color.
						label: __( 'Duotone', 'wunderpaint' ),
						children: [
							...[
								[ 'Noir', '#0d0d0f', '#e8e8e8' ],
								[ 'Ocean', '#0b2545', '#8ecae6' ],
								[ 'Sunset', '#7a1f2b', '#ffc371' ],
								[ 'Forest', '#1b3a26', '#d8e2c8' ],
								[ 'Berry', '#3b0f3f', '#ff9ecd' ],
								[ 'Steel', '#22303c', '#c7d3dd' ],
								[ 'Gold', '#3a2b12', '#ecc94b' ],
								[ 'Mint', '#0f3d3e', '#bff0d4' ],
							].map( ( [ name, shadow, highlight ] ) => ( {
								label: name,
								preview: () => ( {
									previewEffect: {
										id: 'duotone',
										params: { shadow, highlight },
									},
								} ),
								run: () =>
									Ops.applyEffectOp(
										editor,
										extras,
										'duotone',
										{
											shadow,
											highlight,
										}
									),
								when: () => hasActive,
							} ) ),
						],
					},
					...LAYER_EFFECT_GROUPS.filter(
						( group ) => group.id === 'composed'
					).map( collectionItem ),
					{ head: __( 'Corrections', 'wunderpaint' ) },
					{
						label: __( 'Blur & Sharpen', 'wunderpaint' ),
						children: effectItems( GROUPS.blur ),
					},
					{
						label: __( 'Color', 'wunderpaint' ),
						children: effectItems( GROUPS.color ),
					},
					{ head: __( 'Creative Effects', 'wunderpaint' ) },
					{
						label: __( 'Stylize', 'wunderpaint' ),
						children: [ ...effectItems( GROUPS.stylize ), ...rest ],
					},
					...LAYER_EFFECT_GROUPS.filter(
						( group ) => group.id !== 'composed'
					).map( collectionItem ),
					...( extEffects.length
						? [
								{
									label: __( 'Extensions', 'wunderpaint' ),
									children: extEffects,
								},
						  ]
						: [] ),
				];
			} )(),
		},
		{
			id: 'view',
			label: __( 'View', 'wunderpaint' ),
			items: [
				{ head: __( 'Zoom', 'wunderpaint' ) },
				{
					label: __( 'Zoom In', 'wunderpaint' ),
					kbd: '⌘+',
					run: () =>
						editor.dispatch( {
							type: 'SET_ZOOM',
							zoom: state.zoom * 1.25,
						} ),
				},
				{
					label: __( 'Zoom Out', 'wunderpaint' ),
					kbd: '⌘−',
					run: () =>
						editor.dispatch( {
							type: 'SET_ZOOM',
							zoom: state.zoom / 1.25,
						} ),
				},
				{
					label: __( 'Fit', 'wunderpaint' ),
					kbd: '⌘0',
					run: () => extras.viewApi.current?.fit(),
				},
				{
					label: __( '100%', 'wunderpaint' ),
					kbd: '⌘1',
					run: () => extras.viewApi.current?.zoomTo( 1 ),
				},
				{
					label: __( 'Zoom to Selection', 'wunderpaint' ),
					run: () => {
						const b = selectionBounds( state.selection );
						if ( b ) {
							extras.viewApi.current?.zoomToRect( {
								x: b.x - b.w * 0.1,
								y: b.y - b.h * 0.1,
								w: b.w * 1.2,
								h: b.h * 1.2,
							} );
						}
					},
					when: () => hasSelection,
				},
				{ head: __( 'Panels', 'wunderpaint' ) },
				{
					label: __( 'Color', 'wunderpaint' ),
					checked:
						!! state.showColorPanel &&
						state.colorPanelMode === 'panel',
					run: () =>
						editor.dispatch( {
							type: 'TOGGLE_COLOR_PANEL',
							show: true,
						} ),
				},
				{
					label: __( 'History', 'wunderpaint' ),
					checked: !! state.showHistoryPanel,
					run: () =>
						editor.dispatch( { type: 'TOGGLE_HISTORY_PANEL' } ),
				},
				{
					label: __( 'Tool Panels', 'wunderpaint' ),
					children: [
						{
							label: __( 'Themes', 'wunderpaint' ),
							checked: !! state.showThemePanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_THEME_PANEL',
								} ),
						},
						{
							label: __( 'Text', 'wunderpaint' ),
							checked: !! state.showTextPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_TEXT_PANEL',
								} ),
						},
						{
							label: __( 'Selection', 'wunderpaint' ),
							checked: !! state.showSelectionPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_SELECTION_PANEL',
								} ),
						},
						{
							label: __( 'Crop', 'wunderpaint' ),
							checked: !! state.showCropPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_CROP_PANEL',
								} ),
						},
						{
							label: __( 'Brush', 'wunderpaint' ),
							checked: !! state.showBrushPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_BRUSH_PANEL',
								} ),
						},
						{
							label: __( 'Paint Bucket', 'wunderpaint' ),
							checked: !! state.showBucketPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_BUCKET_PANEL',
								} ),
						},

						{
							label: __( 'Clone Stamp', 'wunderpaint' ),
							checked: !! state.showStampPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_STAMP_PANEL',
								} ),
						},
						{
							label: __( 'Effect Brush', 'wunderpaint' ),
							checked: !! state.showFxBrushPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_FXBRUSH_PANEL',
								} ),
						},
						{
							label: __( 'Shape', 'wunderpaint' ),
							checked: !! state.showShapePanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_SHAPE_PANEL',
								} ),
						},
						{
							label: __( 'Pen', 'wunderpaint' ),
							checked: !! state.showPenPanel,
							run: () =>
								editor.dispatch( { type: 'TOGGLE_PEN_PANEL' } ),
						},
						{
							label: __( 'Repeat', 'wunderpaint' ),
							checked: !! state.showRepeatPanel,
							run: () =>
								editor.dispatch( {
									type: 'TOGGLE_REPEAT_PANEL',
								} ),
						},
						{
							label: __( 'Mask', 'wunderpaint' ),
							checked: !! (
								state.showMaskPanel && state.maskEditId
							),
							run: () => {
								if ( state.showMaskPanel && state.maskEditId ) {
									editor.dispatch( {
										type: 'TOGGLE_MASK_PANEL',
										show: false,
									} );
								} else if ( activeLayerOf( state )?.mask ) {
									editor.dispatch( {
										type: 'SET_MASK_EDIT',
										id: state.activeId,
									} );
								}
							},
							when: () => !! activeLayerOf( state )?.mask,
						},
					],
				},
				{
					label: state.showNavigator
						? __( 'Hide Navigator', 'wunderpaint' )
						: __( 'Show Navigator', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_NAVIGATOR' } ),
				},
				{
					label: state.timeline?.on
						? __( 'Hide Timeline', 'wunderpaint' )
						: __( 'Show Timeline', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_TIMELINE' } ),
				},
				{
					label: state.libraryHidden
						? __( 'Show Library', 'wunderpaint' )
						: __( 'Hide Library', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_LIBRARY' } ),
				},
				{
					label: state.pagesHidden
						? __( 'Show Pages', 'wunderpaint' )
						: __( 'Hide Pages', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_PAGES' } ),
					when: () => !! state.pages,
				},
				// Personal workspaces (v1.184.0): cosmetic show/hide of the
				// toolbar, panels, sections and menus. The View menu is never
				// hideable, so this entry stays reachable.
				{
					label: __( 'Workspace', 'wunderpaint' ),
					run: () => extras.openWorkspace(),
				},
				{ head: __( 'Guides', 'wunderpaint' ) },
				// Rulers, grid, guides and snapping in one place.
				{
					label: state.showRulers
						? __( 'Hide Rulers', 'wunderpaint' )
						: __( 'Show Rulers', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_RULERS' } ),
				},
				{
					label: state.showGrid
						? __( 'Hide Grid', 'wunderpaint' )
						: __( 'Show Grid', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_GRID' } ),
				},
				{
					label: state.showGuides
						? __( 'Hide Guides', 'wunderpaint' )
						: __( 'Show Guides', 'wunderpaint' ),
					run: () => editor.dispatch( { type: 'TOGGLE_GUIDES' } ),
				},
				{
					label: __( 'Snap', 'wunderpaint' ),
					checked: !! state.snap,
					run: () => editor.dispatch( { type: 'TOGGLE_SNAP' } ),
				},
				{
					label: __( 'Reveal Off-Canvas', 'wunderpaint' ),
					checked: !! state.revealPasteboard,
					run: () =>
						editor.dispatch( {
							type: 'SET_PASTEBOARD',
							on: ! state.revealPasteboard,
						} ),
				},
				{
					label: __( 'Guides & Grid', 'wunderpaint' ),
					run: () => extras.openGuides(),
				},
				{
					label: __( 'Clear Guides', 'wunderpaint' ),
					run: () => {
						editor.dispatch( {
							type: 'SET_DOC',
							doc: { guides: [] },
						} );
						editor.commit( __( 'Clear Guides', 'wunderpaint' ) );
					},
					when: () => ( state.doc.guides || [] ).length > 0,
				},
				{ head: __( 'Proof', 'wunderpaint' ) },
				// Proofing & previews: Check Contrast lives right under
				// Proof Colors (user request v1.130.2).
				{
					ws: 'mi.view.proof',
					label: __( 'Proof Colors', 'wunderpaint' ),
					children: [
						{
							label: __( 'None', 'wunderpaint' ),
							checked: ! state.proof,
							run: () =>
								editor.dispatch( {
									type: 'SET_PROOF',
									mode: null,
								} ),
						},
						...PROOF_MODES.map( ( m ) => ( {
							label: m.label,
							checked: state.proof === m.id,
							run: () =>
								editor.dispatch( {
									type: 'SET_PROOF',
									mode: m.id,
								} ),
						} ) ),
					],
				},
				{
					ws: 'mi.view.contrast',
					label: __( 'Check Contrast', 'wunderpaint' ),
					run: () => extras.openContrast(),
				},
				{
					label: __( 'Preview with Post', 'wunderpaint' ),
					run: () => extras.openPostPreview(),
				},
				{
					label: __( 'Exit Post Preview', 'wunderpaint' ),
					run: () =>
						editor.dispatch( {
							type: 'SET_PREVIEW_POST',
							post: null,
						} ),
					when: () => !! state.previewPost,
				},
			],
		},
		{
			// Assets (v1.95.0): everything you design WITH, moved out of the
			// overloaded File menu.
			id: 'assets',
			label: __( 'Assets', 'wunderpaint' ),
			items: [
				{ head: __( 'Find & Generate', 'wunderpaint' ) },
				{
					label: __( 'Asset Library', 'wunderpaint' ),
					kbd: '⇧⌘L',
					run: () => extras.openLibrary(),
				},
				{
					label: __( 'Stock Images', 'wunderpaint' ),
					run: () => extras.openStock(),
				},
				{
					label: __( 'Asset Generator', 'wunderpaint' ),
					run: () => extras.openGenerate(),
				},
				{
					// Moved out of Automation > Design (v1.430.1). The
					// Automation menu says of itself that it holds what
					// runs over MANY posts or images; this runs over
					// nothing - a brief goes in, three finished designs
					// come out. It belongs here, one rung up the same
					// ladder as its neighbours: find something, generate
					// a piece, generate a whole design. Its old submenu
					// held this single entry and never got a second.
					label: __( 'Design Generator', 'wunderpaint' ),
					run: () => extras.openDesignAssistant(),
				},
				{ head: __( 'Manage', 'wunderpaint' ) },
				{
					label: __( 'Manage Media Library', 'wunderpaint' ),
					run: () => extras.openMediaLibrary(),
				},
				{
					label: __( 'Dynamic Templates', 'wunderpaint' ),
					run: () => extras.openTemplatePicker(),
				},
				{
					label: __( 'Brand Kits', 'wunderpaint' ),
					run: () => extras.openBrandKits(),
					when: () => !! window.WPIE?.canManageKits,
				},
				// AI Presets (spec 2026-09-16): site-wide like Brand Kits, so
				// they live beside them. Admins shape the AI Studio panel for
				// everyone; in the studio whoever owns the browser does.
				{
					label: __( 'AI Presets', 'wunderpaint' ),
					run: () => extras.openAiButtons(),
					when: () =>
						!! window.WPIE?.canManage || !! window.WPIE?.standalone,
				},
			],
		},
		{
			// Automation (v1.154.0, was "Automate"): everything that runs
			// over many posts/images or generates work. Single tools moved
			// to Tools, extension launchers to Extensions.
			id: 'automation',
			label: __( 'Automation', 'wunderpaint' ),
			items: [
				{ head: __( 'Create & Process', 'wunderpaint' ) },
				// Pro automation lives in the separate Pro plugin. In the free
				// plugin these entries appear ONLY when Pro provides them; with
				// Pro absent they are hidden (no disabled "Pro" teasers), and
				// the About dialog links to Pro instead (v1.316). Thematic
				// submenus (v1.83.0), like File > Import/Export.
				...( proHas( 'content' )
					? [
							{
								label: __( 'Content', 'wunderpaint' ),
								subId: 'content',
								children: [
									{
										label: __(
											'Generate Content',
											'wunderpaint'
										),
										run: () => extras.openCreatePost(),
									},
									{
										label: __(
											'Content Templates',
											'wunderpaint'
										),
										run: () =>
											extras.openContentTemplates(),
									},
								],
							},
					  ]
					: [] ),
				{
					label: __( 'Images', 'wunderpaint' ),
					subId: 'images',
					children: [
						// Featured Images generates IMAGES for posts - it
						// sat under Content by history (v1.287.2 move).
						...( proHas( 'automate' )
							? [
									{
										label: __(
											'Featured Images',
											'wunderpaint'
										),
										run: () => extras.openAutomate(),
									},
							  ]
							: [] ),
						...( proHas( 'batch' )
							? [
									{
										label: __(
											'Image Processor',
											'wunderpaint'
										),
										run: () => extras.openBatch(),
									},
							  ]
							: [] ),
						...( proHas( 'merge' )
							? [
									{
										label: __(
											'Generate from CSV',
											'wunderpaint'
										),
										run: () => extras.openMerge(),
									},
							  ]
							: [] ),
						{
							label: __( 'Batch Watermark', 'wunderpaint' ),
							run: () => extras.openBatchWatermark(),
						},
						{
							label: __( 'Metadata Assistant', 'wunderpaint' ),
							run: () => extras.openAltText(),
						},
					],
				},
				{ head: __( 'Reuse & Repeat', 'wunderpaint' ) },
				{
					// Actions moved in from their own top-level menu
					// (v1.154.0): recording and replaying is automation.
					label: __( 'Actions', 'wunderpaint' ),
					subId: 'actions',
					children: ( () => {
						const actions = listActions();
						const macros = listMacros();
						// Bundled quick access (v1.246.1): one nested
						// submenu per starter category.
						const included = Object.entries( ACTION_CATEGORIES )
							.map( ( [ key, catLabel ] ) => ( {
								label: catLabel(),
								children: actions
									.filter(
										( m ) => m.builtIn && m.category === key
									)
									.map( ( m ) => ( {
										label: m.name,
										run: () =>
											runMacro( editor, m.steps ).catch(
												() => {}
											),
									} ) ),
							} ) )
							.filter( ( category ) => category.children.length );
						return [
							{ head: __( 'Manage', 'wunderpaint' ) },
							{
								label: __( 'Manage Actions', 'wunderpaint' ),
								run: () => extras.openActions(),
							},
							...( included.length
								? [
										{
											head: __(
												'Included Actions',
												'wunderpaint'
											),
										},
										...included,
								  ]
								: [] ),
							...( macros.length
								? [
										{
											head: __(
												'My Actions',
												'wunderpaint'
											),
										},
										...macros.map( ( m ) => ( {
											label: m.name,
											run: () =>
												runMacro(
													editor,
													m.steps
												).catch( () => {} ),
										} ) ),
								  ]
								: [] ),
						];
					} )(),
				},
			],
		},
		{
			// Tools (v1.154.0): single creative tools that belong to the
			// editor but are neither automation nor extensions.
			id: 'tools',
			label: __( 'Tools', 'wunderpaint' ),
			items: [
				{ head: __( 'Design', 'wunderpaint' ) },
				{
					label: __( 'Color Schemer', 'wunderpaint' ),
					run: () => extras.openColorSchemer(),
				},
				{
					label: __( 'Background Studio', 'wunderpaint' ),
					run: () => extras.openBackgroundStudio(),
				},
				{
					label: __( 'Collage & Photo Grid', 'wunderpaint' ),
					run: () => extras.openCollage?.(),
				},
				{ head: __( 'Photo & Presentation', 'wunderpaint' ) },
				{
					label: __( 'Screenshot Beautifier', 'wunderpaint' ),
					run: () => extras.openBeautify(),
				},
				{
					label: __( 'Mockup Generator', 'wunderpaint' ),
					run: () => extras.openMockup(),
				},
				{
					label: __( '360° Panorama', 'wunderpaint' ),
					run: () => extras.openPanorama?.(),
				},
				{
					label: __( 'Vignette & Film', 'wunderpaint' ),
					run: () => extras.openVignette?.(),
				},
				{ head: __( 'Data & Codes', 'wunderpaint' ) },
				{
					label: __( 'Chart & Table', 'wunderpaint' ),
					run: () => extras.openChart(),
				},
				{
					label: __( 'QR Code Generator', 'wunderpaint' ),
					run: () => extras.openQr(),
				},
			],
		},
		// Extensions is the LAUNCHER menu (v1.154.0): one entry per
		// installed extension (its generators, grouped when several), for
		// every user. Managing moved to Help > Manage Extensions.
		...( () => {
			// Curated categories (v1.310, regrouped v1.433): every extension
			// sorts into one of the fixed, translated categories - ALWAYS a
			// submenu - and headings name the blocks, like in every other
			// main menu. Names and order live in lib/extension-menu.js,
			// shared with the manager and the title-bar search.
			const entries = extensionEntries( {
				generators: listExtensionGenerators(),
				menuItems: extensionMenuItems( 'extensions' ),
				installed: window.WPIE?.extensions || [],
			} );
			if ( ! entries.length ) {
				return [];
			}
			return [
				{
					id: 'extensions',
					label: __( 'Extensions', 'wunderpaint' ),
					items: extensionMenuSections( entries, { editor, extras } ),
				},
			];
		} )(),
		{
			id: 'help',
			label: __( 'Help', 'wunderpaint' ),
			items: [
				{ head: __( 'Learn', 'wunderpaint' ) },
				{
					label: __( 'Help Assistant', 'wunderpaint' ),
					run: () => extras.openHelpBot(),
				},
				{
					label: __( 'Handbook', 'wunderpaint' ),
					kbd: '?',
					run: () => extras.openHelp(),
				},
				{
					label: __( 'Keyboard Shortcuts', 'wunderpaint' ),
					run: () => extras.openShortcutHelp(),
				},
				{
					label: __( 'Show Tour', 'wunderpaint' ),
					run: () => extras.openTour(),
				},
				{ head: __( 'Editor', 'wunderpaint' ) },
				// The editor language, independent of the WordPress language.
				// The WordPress profile only lists the locales installed on
				// the site; this picker reads the bundled files and can
				// therefore offer all of them. extras.setEditorLocale is
				// undefined in the nested smart-object overlay (see
				// editor-main.jsx), so the item is absent there too.
				...( availableLocales().length > 1 && extras.setEditorLocale
					? [
							{
								label: __( 'Editor Language', 'wunderpaint' ),
								children: availableLocales().map( ( l ) => ( {
									label: l.label,
									checked: currentLocale() === l.locale,
									run: () =>
										extras.setEditorLocale( l.locale ),
								} ) ),
							},
					  ]
					: [] ),
				// Optional beginner shell (v1.166): the full editor stays
				// the default, this just swaps the chrome for this user.
				{
					label: __( 'Easy Mode', 'wunderpaint' ),
					run: () => extras.setEasyMode( true ),
				},
				// Managing lives here (v1.154.0); the Extensions menu only
				// launches. Admin-only, like the manager itself.
				//
				// ONE entry, two managers (v1.392.0). Without Pro this opens
				// the free plugin's own screen: the list, the detail page and
				// the on/off switch, which is everything a free install can
				// do. With Pro it opens Pro's, which does the same and adds
				// the catalogue, installing, updating and removing. For the
				// user it is one manager that can more once Pro is there,
				// instead of a second window behind a button in the first.
				...( window.WPIE?.canManage
					? [
							{
								label: __( 'Manage Extensions', 'wunderpaint' ),
								// The editor's own extras travel along: the
								// help button in the dialog head opens the
								// handbook through extras.openHelp, and Pro's
								// window would have had no way to reach it.
								run: () =>
									'function' ===
									typeof window.WPIE?.extensionsBrowse
										? window.WPIE.extensionsBrowse( {
												editor,
												extras,
										  } )
										: extras.openExtensions(),
							},
					  ]
					: [] ),
				{ head: __( 'About', 'wunderpaint' ) },
				{
					label: __( 'System Status', 'wunderpaint' ),
					run: () => extras.openStatus(),
				},
				{
					label: __( 'About WunderPaint', 'wunderpaint' ),
					run: () => extras.openAbout(),
				},
			],
		},
	] );
}

/** A disappearing menu entry releases only the preview that it owns. */
function MenuItem( { item, runItem, canvasPreview, focused = false } ) {
	const ref = useRef( null );
	const enabled = ! item.when || item.when();
	const stopPreview = canvasPreview?.stop;
	useEffect( () => {
		const button = ref.current;
		return () => stopPreview?.( button );
	}, [ stopPreview, item.label ] );
	return (
		<button
			ref={ ref }
			role="menuitem"
			data-ws={ item.ws }
			className={ `ed-item${ focused ? ' focused' : '' }` }
			disabled={ ! enabled }
			{ ...( enabled && item.preview
				? canvasPreview?.forItem( item )
				: {} ) }
			onClick={ () => runItem( item ) }
		>
			{ item.label }
			{ item.chip && (
				<span className="menu-chip-pro">{ item.chip }</span>
			) }
			{ item.checked && <span className="kbd-hint">✓</span> }
			{ item.kbd && <span className="kbd-hint">{ item.kbd }</span> }
		</button>
	);
}

/**
 * Submenu entries, recursively: a child with `children` opens another
 * level on hover (v1.246.1 - the bundled-action categories under
 * Automation > Actions were the first three-level menu).
 *
 * @param {Object}   props         Props.
 * @param {Array}    props.items   Menu entries.
 * @param {Function} props.runItem Runs a leaf entry and closes the menu.
 * @param {Object}   props.canvasPreview Optional canvas-only hover controller.
 */
function SubItems( { items, runItem, canvasPreview } ) {
	const [ openSub, setOpenSub ] = useState( null );
	return (
		<>
			{ items.map( ( child, ci ) => {
				if ( child.head ) {
					return (
						<div key={ ci } className="ed-head">
							<span>{ child.head }</span>
						</div>
					);
				}
				if ( child.divider ) {
					return <div key={ ci } className="divider" />;
				}
				if ( child.children ) {
					const nestedOpen = openSub === ci;
					return (
						<div
							key={ ci }
							className="ed-subwrap"
							onMouseEnter={ () => setOpenSub( ci ) }
							onMouseLeave={ () =>
								setOpenSub( ( cur ) =>
									cur === ci ? null : cur
								)
							}
						>
							<button
								role="menuitem"
								aria-haspopup="menu"
								aria-expanded={ nestedOpen }
								className={ `ed-item has-sub${
									nestedOpen ? ' focused' : ''
								}` }
								onClick={ () =>
									setOpenSub( nestedOpen ? null : ci )
								}
							>
								{ child.label }
								<span className="kbd-hint">▸</span>
							</button>
							{ nestedOpen && (
								<div
									className={ `ed-dropdown ed-submenu${
										child.children.some(
											( c ) => c.children
										)
											? ' has-nested'
											: ''
									}` }
									role="menu"
								>
									<SubItems
										items={ child.children }
										runItem={ runItem }
										canvasPreview={ canvasPreview }
									/>
								</div>
							) }
						</div>
					);
				}
				return (
					<MenuItem
						key={ ci }
						item={ child }
						runItem={ runItem }
						canvasPreview={ canvasPreview }
					/>
				);
			} ) }
		</>
	);
}

function FilterDropdown( { editor, ...props } ) {
	const canvasPreview = useEffectPreview(
		editor,
		activeLayerOf( editor.state ),
		( item ) => item.preview?.(),
		{ onEscape: props.onClose }
	);
	return <Dropdown { ...props } canvasPreview={ canvasPreview } />;
}

export function Dropdown( { menu, extras, onClose, canvasPreview } ) {
	const ref = useRef( null );
	const [ focusIdx, setFocusIdx ] = useState( -1 );
	const [ openSub, setOpenSub ] = useState( null );
	const actionable = menu.items.filter(
		( item ) => ! item.divider && ! item.head && ! item.children
	);

	useEffect( () => {
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				onClose();
			} else if ( 'ArrowDown' === e.key ) {
				e.preventDefault();
				setFocusIdx( ( i ) => ( i + 1 ) % actionable.length );
			} else if ( 'ArrowUp' === e.key ) {
				e.preventDefault();
				setFocusIdx(
					( i ) => ( i - 1 + actionable.length ) % actionable.length
				);
			} else if ( 'Enter' === e.key && focusIdx >= 0 ) {
				e.preventDefault();
				runItem( actionable[ focusIdx ] );
			} else if ( 'ArrowRight' === e.key ) {
				// Open the first submenu (F17).
				const subIdx = menu.items.findIndex(
					( item ) => item.children
				);
				if ( subIdx >= 0 ) {
					e.preventDefault();
					setOpenSub( subIdx );
				}
			} else if ( 'ArrowLeft' === e.key ) {
				setOpenSub( null );
			}
		};
		document.addEventListener( 'keydown', onKey );
		return () => document.removeEventListener( 'keydown', onKey );
	} );

	const runItem = ( item ) => {
		canvasPreview?.stop();
		onClose();
		try {
			item.run();
		} catch ( err ) {
			if ( err instanceof Ops.PendingOp ) {
				extras.toasts.error( err.message );
			} else {
				throw err;
			}
		}
	};

	let actionIdx = -1;
	return (
		<div className="ed-dropdown" role="menu" ref={ ref }>
			{ menu.items.map( ( item, i ) => {
				if ( item.divider ) {
					return <div key={ i } className="divider" />;
				}
				if ( item.head ) {
					// Section head (16.09.2026): the small label at the left in
					// a thin outline, the rule running on to its right - the
					// divider with a name, as in the context menu.
					return (
						<div key={ i } className="ed-head">
							<span>{ item.head }</span>
						</div>
					);
				}
				if ( item.children ) {
					// Grouped submenu (v0.4.1), opens on hover or click.
					const subOpen = openSub === i;
					return (
						<div
							key={ i }
							data-ws={ item.ws }
							className="ed-subwrap"
							onMouseEnter={ () => setOpenSub( i ) }
							onMouseLeave={ () =>
								setOpenSub( ( cur ) =>
									cur === i ? null : cur
								)
							}
						>
							<button
								role="menuitem"
								aria-haspopup="menu"
								aria-expanded={ subOpen }
								className={ `ed-item has-sub${
									subOpen ? ' focused' : ''
								}` }
								onClick={ () =>
									setOpenSub( subOpen ? null : i )
								}
							>
								{ item.label }
								<span className="kbd-hint">▸</span>
							</button>
							{ subOpen && (
								<div
									className={ `ed-dropdown ed-submenu${
										item.children.some(
											( c ) => c.children
										)
											? ' has-nested'
											: ''
									}` }
									role="menu"
								>
									<SubItems
										items={ item.children }
										runItem={ runItem }
										canvasPreview={ canvasPreview }
									/>
								</div>
							) }
						</div>
					);
				}
				actionIdx++;
				const isFocused = actionIdx === focusIdx;
				return (
					<MenuItem
						key={ i }
						item={ item }
						focused={ isFocused }
						runItem={ runItem }
						canvasPreview={ canvasPreview }
					/>
				);
			} ) }
		</div>
	);
}

/* --------------------------- tool options ------------------------------ */

function NumberOpt( {
	label,
	value,
	onChange,
	onCommit,
	width = 56,
	suffix,
	min,
	max,
} ) {
	return (
		<div className="group">
			{ label && (
				<ScrubLabel
					className="label"
					value={ value }
					min={ min ?? -Infinity }
					max={ max ?? Infinity }
					onScrub={ onChange }
					onCommit={ onCommit }
				>
					{ label }
				</ScrubLabel>
			) }
			<input
				type="number"
				aria-label={ label }
				onBlur={ onCommit }
				onKeyDown={ ( e ) => {
					if ( onCommit && e.key === 'Enter' ) {
						e.currentTarget.blur();
					}
				} }
				value={ value }
				min={ min }
				max={ max }
				style={ { width } }
				onChange={ ( e ) => onChange( +e.target.value ) }
			/>
			{ suffix && <span className="label">{ suffix }</span> }
		</div>
	);
}

/** Brush-tip picker: a trigger button + dropdown grid of previews (v1.22). */
/*
 * Kept in step with the panel width in controls.css (.brush-tip-panel).
 * It is only read to keep the panel on screen, so a stale number does not
 * break anything visible until the dropdown opens near the right edge -
 * which is exactly why it is named here instead of sitting in the maths.
 */
const TIP_PANEL_W = 202;

function BrushTipPicker( { value, onChange, children } ) {
	const [ open, setOpen ] = useState( null );
	const panelRef = useRef( null );
	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( panelRef.current && ! panelRef.current.contains( e.target ) ) {
				setOpen( null );
			}
		};
		window.addEventListener( 'pointerdown', onDown, true );
		return () => window.removeEventListener( 'pointerdown', onDown, true );
	}, [ open ] );
	const current = getTip( value );
	return (
		<div className="group">
			<span className="label">{ __( 'Brush', 'wunderpaint' ) }</span>
			<button
				className="brush-tip-toggle"
				title={ current.label }
				aria-haspopup="true"
				aria-expanded={ !! open }
				onClick={ ( e ) => {
					if ( open ) {
						setOpen( null );
						return;
					}
					const rect = e.currentTarget.getBoundingClientRect();
					setOpen( {
						position: 'fixed',
						left: Math.min(
							rect.left,
							window.innerWidth - TIP_PANEL_W - 12
						),
						top: rect.bottom + 6,
						zIndex: 700,
					} );
				} }
			>
				<img src={ tipPreview( current.id, TIP_TILE ) } alt="" />
				<span className="caret">▾</span>
			</button>
			{ open && (
				<div
					className="brush-tip-panel"
					style={ open }
					ref={ panelRef }
					role="listbox"
					aria-label={ __( 'Brush tips', 'wunderpaint' ) }
				>
					{ BRUSH_TIPS.map( ( t ) => (
						<button
							key={ t.id }
							className={ `brush-tip ${
								value === t.id ? 'active' : ''
							}` }
							title={ t.label }
							aria-label={ t.label }
							onClick={ () => {
								onChange( t.id );
								setOpen( null );
							} }
						>
							<img src={ tipPreview( t.id, TIP_TILE ) } alt="" />
						</button>
					) ) }
				</div>
			) }
			{ children }
		</div>
	);
}

/**
 * "Layout" button in the options bar: opens the layout popover with six
 * rendered previews (2 classics + 4 seeded rolls) of the layer's text
 * (E1 of the dynamic-layouts design). × removes an applied layout.
 */
// While a text-edit session is open, character-level keys style the current
// SELECTION inside the box (v1.46 rich text) instead of the whole layer.
// Paragraph-level keys (align, curve) stay layer-wide.
const SELECTION_KEYS = {
	fontFamily: 'family',
	fontSize: 'size',
	weight: 'weight',
	italic: 'italic',
	underline: 'underline',
	color: 'color',
	letterSpacing: 'ls',
};

/**
 * The text curve slider folded into an icon popover: the always-visible
 * slider ate ~180px of the one menu row every tool shares with the
 * document tabs. The panel pins to viewport coordinates read from the
 * button (v1.248.1 lesson: the toolbar clips absolutely positioned
 * children).
 */
function CurvePopover( { value, onChange } ) {
	const [ anchor, setAnchor ] = useState( null );
	const ref = useRef( null );
	const open = !! anchor;
	useEffect( () => {
		if ( ! open ) {
			return undefined;
		}
		const onDown = ( e ) => {
			if ( ref.current && ! ref.current.contains( e.target ) ) {
				setAnchor( null );
			}
		};
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ open ] );
	return (
		<div className="ed-curvepop" ref={ ref }>
			<div className="seg">
				<button
					className={ value ? 'active' : '' }
					title={ __( 'Curve', 'wunderpaint' ) }
					aria-expanded={ open }
					onClick={ ( e ) => {
						if ( anchor ) {
							setAnchor( null );
							return;
						}
						const r = e.currentTarget.getBoundingClientRect();
						setAnchor( {
							left: Math.max(
								8,
								Math.min( r.left, window.innerWidth - 230 )
							),
							top: r.bottom + 6,
						} );
					} }
				>
					{ I.textCurve( { size: 13 } ) }
				</button>
			</div>
			{ open && (
				<div
					className="ed-curvepop-panel"
					style={ { left: anchor.left, top: anchor.top } }
				>
					<input
						type="range"
						min={ -100 }
						max={ 100 }
						value={ value }
						onChange={ ( e ) => onChange( +e.target.value ) }
					/>
					<span
						data-number-value
						className="label"
						style={ { width: 28 } }
					>
						{ value }
					</span>
				</div>
			) }
		</div>
	);
}

/** The same six choices as the selection panel, sized for the menu row. */
function SelectionToolChoices( { editor, extras, compact } ) {
	const { state, dispatch } = editor;
	const opts = state.toolOpts[ state.tool ] || {};
	const tip = useHoverTip( 'below' );
	const activeMode = [ 'wand', 'smartselect' ].includes( state.tool )
		? state.tool
		: state.tool === 'marquee'
		? opts.shape || 'rect'
		: opts.mode || 'freehand';
	return (
		<div className="group selp-tool-options">
			{ ! compact && (
				<span className="label">
					{ __( 'Selection', 'wunderpaint' ) }
				</span>
			) }
			<div
				className="dsm-seg selp-tool-types"
				role="group"
				aria-label={ __( 'Selection tool', 'wunderpaint' ) }
			>
				{ SELECTION_MODES.map( ( mode ) => (
					<button
						type="button"
						key={ mode.id }
						className={ mode.id === activeMode ? 'active' : '' }
						aria-pressed={ mode.id === activeMode }
						aria-label={ mode.label() }
						{ ...tip.props( mode.label() ) }
						onClick={ () => {
							extras?.viewApi?.current?.cancelDraft?.();
							dispatch( {
								type: 'SET_TOOL_OPTS',
								tool: mode.tool,
								patch: mode.patch,
							} );
							dispatch( { type: 'SET_TOOL', tool: mode.tool } );
						} }
					>
						{ mode.icon( 16 ) }
					</button>
				) ) }
			</div>
			{ tip.node }
		</div>
	);
}

/** One trailing entry point for every toolbar panel. */
function ToolPanelOpener( { editor, extras } ) {
	const { state, dispatch } = editor;
	const tool = state.tool;
	let label, action, expanded;
	if (
		state.maskEditId &&
		[ 'brush', 'pencil', 'eraser' ].includes( tool )
	) {
		label = __( 'Mask Panel', 'wunderpaint' );
		action = 'TOGGLE_MASK_PANEL';
		expanded = state.showMaskPanel;
	} else if ( [ 'brush', 'pencil', 'eraser' ].includes( tool ) ) {
		label = __( 'Brush Panel', 'wunderpaint' );
		action = 'TOGGLE_BRUSH_PANEL';
		expanded = state.showBrushPanel;
	} else if ( tool === 'eyedropper' ) {
		label = __( 'Color panel', 'wunderpaint' );
		action = 'TOGGLE_COLOR_PANEL';
		expanded = state.showColorPanel;
	} else if ( tool === 'bucket' ) {
		label = __( 'Paint Bucket Panel', 'wunderpaint' );
		action = 'TOGGLE_BUCKET_PANEL';
		expanded = state.showBucketPanel;
	} else if (
		tool === 'text' ||
		( [ 'move', 'select' ].includes( tool ) &&
			activeLayerOf( state )?.type === 'text' )
	) {
		label = __( 'Text Panel', 'wunderpaint' );
		action = 'TOGGLE_TEXT_PANEL';
		expanded = state.showTextPanel;
	} else if ( tool === 'crop' ) {
		label = __( 'Crop Panel', 'wunderpaint' );
		action = 'TOGGLE_CROP_PANEL';
		expanded = state.showCropPanel;
	} else if ( tool === 'stamp' ) {
		label = __( 'Clone Stamp Panel', 'wunderpaint' );
		action = 'TOGGLE_STAMP_PANEL';
		expanded = state.showStampPanel;
	} else if ( tool === 'shape' ) {
		label = __( 'Shape Studio', 'wunderpaint' );
		expanded = state.showShapePanel;
	} else if (
		[ 'marquee', 'lasso', 'wand', 'smartselect' ].includes( tool )
	) {
		label = __( 'Selection Panel', 'wunderpaint' );
		action = 'TOGGLE_SELECTION_PANEL';
		expanded = state.showSelectionPanel;
	} else if ( tool === 'pen' ) {
		label = __( 'Show Pen Panel', 'wunderpaint' );
		action = 'TOGGLE_PEN_PANEL';
		expanded = state.showPenPanel;
	} else if ( tool === 'fxbrush' ) {
		label = __( 'Show Effect Brush Panel', 'wunderpaint' );
		action = 'TOGGLE_FXBRUSH_PANEL';
		expanded = state.showFxBrushPanel;
	} else if (
		tool === 'gradient' ||
		( [ 'move', 'select' ].includes( tool ) && gradientLayerOf( state ) )
	) {
		label = __( 'Color panel', 'wunderpaint' );
		action = 'TOGGLE_GRADIENT_PANEL';
		expanded = state.showColorPanel;
	} else if (
		tool === 'repeat' ||
		( [ 'move', 'select' ].includes( tool ) &&
			activeLayerOf( state )?.type === 'repeat' )
	) {
		label = __( 'Repeat Panel', 'wunderpaint' );
		action = 'TOGGLE_REPEAT_PANEL';
		expanded = state.showRepeatPanel;
	} else {
		return null;
	}
	return (
		<div className="group ed-tool-panel-opener">
			<div className="seg">
				<button
					type="button"
					title={ label }
					aria-label={ label }
					aria-expanded={ expanded }
					onClick={ () =>
						action
							? dispatch( { type: action, show: true } )
							: extras?.openShapeStudio?.()
					}
				>
					{ I.sliders( { size: 13 } ) }
				</button>
			</div>
		</div>
	);
}

function ToolOptions( { extras, compact } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const selectionFeather = useSelectionFeather( editor );
	const tool = state.tool;
	const opts = state.toolOpts[ tool ] || {};
	const set = ( key, value ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool, patch: { [ key ]: value } } );
	const active = activeLayerOf( state );
	const selStyle = useSelectionStyle( extras );

	if ( [ 'brush', 'pencil', 'eraser', 'stamp' ].includes( tool ) ) {
		const sizeLabel = {
			brush: __( 'Brush Size', 'wunderpaint' ),
			pencil: __( 'Pencil Size', 'wunderpaint' ),
			eraser: __( 'Eraser Size', 'wunderpaint' ),
			stamp: __( 'Clone Stamp Size', 'wunderpaint' ),
		}[ tool ];
		return (
			<>
				<NumberOpt
					label={ sizeLabel }
					value={ opts.size }
					suffix="px"
					min={ 1 }
					max={ 500 }
					onChange={ ( v ) => set( 'size', Math.max( 1, v ) ) }
				/>
				{ [ 'brush', 'pencil' ].includes( tool ) && (
					<div className="group">
						<span className="label">
							{ __( 'Color', 'wunderpaint' ) }
						</span>
						<SwatchButton
							size={ 24 }
							color={ state.fgColor }
							onChange={ ( c ) =>
								dispatch( { type: 'SET_FG', color: c } )
							}
						/>
					</div>
				) }
				{ 'brush' === tool && (
					<BrushTipPicker
						value={ opts.tip || 'round' }
						onChange={ ( v ) => set( 'tip', v ) }
					/>
				) }
				<div className="group">
					<span className="label">
						{ __( 'Opacity', 'wunderpaint' ) }
					</span>
					<input
						type="range"
						min="0"
						max="100"
						value={ opts.opacity }
						onChange={ ( e ) => set( 'opacity', +e.target.value ) }
						style={ { width: 80 } }
					/>
					<span
						data-number-value
						className="label"
						style={ { width: 30 } }
					>
						{ opts.opacity }%
					</span>
				</div>
				{ /* Flow lives in the brush panel now (Thomas): the bar
				     keeps colour, size, opacity, symmetry - and the paper. */ }
				{ 'pencil' !== tool &&
					! (
						'brush' === tool && isStampTip( opts.tip || 'round' )
					) && (
						<NumberOpt
							label={ __( 'Hardness', 'wunderpaint' ) }
							value={ opts.hardness }
							suffix="%"
							min={ 0 }
							max={ 100 }
							onChange={ ( v ) => set( 'hardness', v ) }
						/>
					) }
				{ [ 'brush', 'pencil', 'eraser' ].includes( tool ) && (
					<div className="group">
						<span className="label">
							{ __( 'Symmetry', 'wunderpaint' ) }
						</span>
						<select
							value={ opts.mirror || 'off' }
							style={ { width: 92 } }
							onChange={ ( e ) =>
								set( 'mirror', e.target.value )
							}
						>
							<option value="off">
								{ __( 'Off', 'wunderpaint' ) }
							</option>
							<option value="x">
								{ __( 'Vertical', 'wunderpaint' ) }
							</option>
							<option value="y">
								{ __( 'Horizontal', 'wunderpaint' ) }
							</option>
							<option value="xy">
								{ __( 'Fourfold', 'wunderpaint' ) }
							</option>
							<option value="r3">
								{ __( 'Star 3', 'wunderpaint' ) }
							</option>
							<option value="r5">
								{ __( 'Star 5', 'wunderpaint' ) }
							</option>
							<option value="r6">
								{ __( 'Star 6', 'wunderpaint' ) }
							</option>
							<option value="r8">
								{ __( 'Star 8', 'wunderpaint' ) }
							</option>
							<option value="r12">
								{ __( 'Star 12', 'wunderpaint' ) }
							</option>
						</select>
					</div>
				) }
				{ /* The document's paper, one sheet for every wet medium -
				     lives here rather than in the brush panel (Thomas). */ }
				{ 'brush' === tool && (
					<div className="group">
						<span className="label">
							{ __( 'Paper', 'wunderpaint' ) }
						</span>
						<select
							value={ state.doc?.paper || 'auto' }
							style={ { width: 92 } }
							onChange={ ( e ) =>
								dispatch( {
									type: 'SET_DOC',
									doc: { paper: e.target.value },
								} )
							}
						>
							<option value="auto">
								{ __( 'Auto', 'wunderpaint' ) }
							</option>
							<option value="hot-press">
								{ __( 'Hot press', 'wunderpaint' ) }
							</option>
							<option value="cold-press">
								{ __( 'Cold press', 'wunderpaint' ) }
							</option>
							<option value="rough">
								{ __( 'Rough', 'wunderpaint' ) }
							</option>
							<option value="canvas">
								{ __( 'Canvas', 'wunderpaint' ) }
							</option>
							<option value="laid">
								{ __( 'Laid paper', 'wunderpaint' ) }
							</option>
						</select>
					</div>
				) }
			</>
		);
	}

	if (
		'text' === tool ||
		( 'move' === tool && active && 'text' === active.type )
	) {
		const target = active && 'text' === active.type ? active : null;
		// During a rich-text edit session the controls mirror and style the
		// SELECTION (selStyle updates on every caret move), not the layer.
		const value = ( key ) => {
			const selKey = SELECTION_KEYS[ key ];
			if ( selStyle && selKey && undefined !== selStyle[ selKey ] ) {
				return selStyle[ selKey ];
			}
			return target ? target[ key ] : opts[ key ];
		};
		// Multi-select (v1.15): apply style changes to EVERY selected text
		// layer, not only the active one.
		const textIds = target
			? state.layers
					.filter(
						( l ) =>
							'text' === l.type &&
							( l.id === target.id ||
								state.selectedIds.includes( l.id ) )
					)
					.map( ( l ) => l.id )
			: [];
		const update = ( key, v ) => {
			const rt = extras?.richText?.current || null;
			if ( rt && SELECTION_KEYS[ key ] ) {
				rt.applyStyle( { [ SELECTION_KEYS[ key ] ]: v } );
				return;
			}
			if ( target ) {
				dispatch( {
					type: 'UPDATE_LAYERS',
					ids: textIds,
					patch: { [ key ]: v },
				} );
				commit( __( 'Edit text style', 'wunderpaint' ) );
			} else {
				set( key, v );
			}
		};
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Text', 'wunderpaint' ) }
					</span>
					<FontPicker
						value={ value( 'fontFamily' ) }
						width={ 130 }
						onChange={ ( family ) =>
							update( 'fontFamily', family )
						}
					/>
					<select
						value={ value( 'weight' ) }
						style={ { width: 52 } }
						onChange={ ( e ) =>
							update( 'weight', +e.target.value )
						}
					>
						{ FONT_WEIGHTS.map( ( w ) => (
							<option key={ w } value={ w }>
								{ w }
							</option>
						) ) }
					</select>
					<input
						type="number"
						value={ value( 'fontSize' ) }
						style={ { width: 48 } }
						onChange={ ( e ) =>
							update( 'fontSize', +e.target.value )
						}
					/>
					<ScrubLabel
						className="label"
						value={ +value( 'fontSize' ) || 0 }
						min={ 1 }
						max={ 800 }
						onScrub={ ( v ) => {
							const size = Math.max( 1, Math.round( v ) );
							const rt = extras?.richText?.current || null;
							if ( rt ) {
								rt.applyStyle( { size } );
							} else if ( target ) {
								dispatch( {
									type: 'UPDATE_LAYERS',
									ids: textIds,
									patch: { fontSize: size },
								} );
							} else {
								set( 'fontSize', size );
							}
						} }
						onCommit={ () => {
							if ( target && ! extras?.richText?.current ) {
								commit(
									__( 'Edit text style', 'wunderpaint' )
								);
							}
						} }
					>
						px
					</ScrubLabel>
				</div>
				<div className="group nb">
					<div className="seg">
						<button
							className={
								value( 'weight' ) >= 700 ? 'active' : ''
							}
							title={ __( 'Bold', 'wunderpaint' ) }
							onClick={ () =>
								update(
									'weight',
									value( 'weight' ) >= 700 ? 400 : 700
								)
							}
						>
							{ I.bold( { size: 13 } ) }
						</button>
						<button
							className={ value( 'italic' ) ? 'active' : '' }
							title={ __( 'Italic', 'wunderpaint' ) }
							onClick={ () =>
								update( 'italic', ! value( 'italic' ) )
							}
						>
							{ I.italic( { size: 13 } ) }
						</button>
						<button
							className={ value( 'underline' ) ? 'active' : '' }
							title={ __( 'Underline', 'wunderpaint' ) }
							onClick={ () =>
								update( 'underline', ! value( 'underline' ) )
							}
						>
							{ I.underline( { size: 13 } ) }
						</button>
						<button
							className={ value( 'strike' ) ? 'active' : '' }
							title={ __( 'Strikethrough', 'wunderpaint' ) }
							onClick={ () =>
								update( 'strike', ! value( 'strike' ) )
							}
						>
							{ I.strikethrough( { size: 13 } ) }
						</button>
						<button
							className={
								'uppercase' === value( 'textTransform' )
									? 'active'
									: ''
							}
							title={ __( 'Uppercase', 'wunderpaint' ) }
							onClick={ () =>
								update(
									'textTransform',
									'uppercase' === value( 'textTransform' )
										? ''
										: 'uppercase'
								)
							}
						>
							{ I.caseUpper( { size: 13 } ) }
						</button>
					</div>
					{ compact ? (
						// Tight menu row (many document tabs / small screen):
						// each alignment trio collapses to ONE cycle button -
						// the icon shows the CURRENT state, a click advances
						// it (the canvas context bar's image-fit pattern).
						<div className="seg">
							{ ( () => {
								const align = value( 'align' ) || 'left';
								const nextH = {
									left: 'center',
									center: 'right',
									right: 'left',
								};
								const hIcons = {
									left: I.alignL,
									center: I.alignC,
									right: I.alignR,
								};
								const valign =
									value( 'valign' ) ||
									( target?.fixedWidth ? 'top' : 'middle' );
								const nextV = {
									top: 'middle',
									middle: 'bottom',
									bottom: 'top',
								};
								const vIcons = {
									top: I.valignT,
									middle: I.valignM,
									bottom: I.valignB,
								};
								return (
									<>
										<button
											title={ __(
												'Alignment (left/center/right)',
												'wunderpaint'
											) }
											aria-label={ __(
												'Alignment (left/center/right)',
												'wunderpaint'
											) }
											onClick={ () =>
												update(
													'align',
													nextH[ align ] || 'left'
												)
											}
										>
											{ ( hIcons[ align ] || I.alignL )( {
												size: 13,
											} ) }
										</button>
										<button
											title={ __(
												'Vertical alignment (top/middle/bottom)',
												'wunderpaint'
											) }
											aria-label={ __(
												'Vertical alignment (top/middle/bottom)',
												'wunderpaint'
											) }
											onClick={ () =>
												update(
													'valign',
													nextV[ valign ] || 'middle'
												)
											}
										>
											{ ( vIcons[ valign ] || I.valignM )(
												{ size: 13 }
											) }
										</button>
									</>
								);
							} )() }
						</div>
					) : (
						<>
							<div className="seg">
								{ [
									[ 'left', I.alignL ],
									[ 'center', I.alignC ],
									[ 'right', I.alignR ],
								].map( ( [ align, icon ] ) => (
									<button
										key={ align }
										aria-label={ align }
										title={ align }
										className={
											value( 'align' ) === align
												? 'active'
												: ''
										}
										onClick={ () =>
											update( 'align', align )
										}
									>
										{ icon( { size: 13 } ) }
									</button>
								) ) }
							</div>
							<div className="seg">
								{ [
									[
										'top',
										__( 'Align top', 'wunderpaint' ),
										I.valignT,
									],
									[
										'middle',
										__( 'Align middle', 'wunderpaint' ),
										I.valignM,
									],
									[
										'bottom',
										__( 'Align bottom', 'wunderpaint' ),
										I.valignB,
									],
								].map( ( [ valign, label, icon ] ) => (
									<button
										key={ valign }
										aria-label={ label }
										title={ label }
										className={
											( value( 'valign' ) ||
												( target?.fixedWidth
													? 'top'
													: 'middle' ) ) === valign
												? 'active'
												: ''
										}
										onClick={ () =>
											update( 'valign', valign )
										}
									>
										{ icon( { size: 13 } ) }
									</button>
								) ) }
							</div>
						</>
					) }
				</div>
				{ /* Light tail (Thomas): one divider after the curve icon,
				     color and the annotate picker flow without bars. */ }
				<div className="group">
					{ /* Fluid Text (v1.429) and curve exclude each other:
					     the fitted lines have no arc, so the curve popover
					     steps aside while the mode is on. */ }
					{ ! target?.textFit && (
						<CurvePopover
							value={ +value( 'curve' ) || 0 }
							onChange={ ( v ) => update( 'curve', v ) }
						/>
					) }
					{ canFluidText( target ) && (
						<div className="seg">
							<button
								className={ target.textFit ? 'active' : '' }
								title={ __( 'Fluid Text', 'wunderpaint' ) }
								aria-label={ __( 'Fluid Text', 'wunderpaint' ) }
								aria-pressed={ !! target.textFit }
								onClick={ () => toggleFluidTextOp( editor ) }
							>
								{ I.fluidText( { size: 13 } ) }
							</button>
						</div>
					) }
				</div>
				<div className="group nb">
					{ ! compact && (
						<span className="label">
							{ __( 'Color', 'wunderpaint' ) }
						</span>
					) }
					{ target ? (
						<PaintSwatch
							layer={ target }
							target="fill"
							size={ 24 }
							title={ __( 'Text fill', 'wunderpaint' ) }
							onChange={ ( patch ) => {
								dispatch( {
									type: 'UPDATE_LAYER',
									id: target.id,
									patch,
								} );
								commit( __( 'Paint', 'wunderpaint' ) );
							} }
						/>
					) : (
						<SwatchButton
							size={ 24 }
							title={ __( 'Foreground', 'wunderpaint' ) }
							color={ state.fgColor }
							onChange={ ( color ) =>
								dispatch( { type: 'SET_FG', color } )
							}
						/>
					) }
				</div>
				{ target && <TextStylePicker /> }
			</>
		);
	}

	if ( 'shape' === tool ) {
		const paintLayer =
			active?.type === 'shape' && ! active.penPath
				? active
				: { ...opts, type: 'shape', fill: state.fgColor };
		const paintChange = ( patch ) => {
			if ( paintLayer.id ) {
				dispatch( { type: 'UPDATE_LAYER', id: paintLayer.id, patch } );
			} else {
				if ( patch.fill !== undefined ) {
					dispatch( { type: 'SET_FG', color: patch.fill } );
				}
				dispatch( { type: 'SET_TOOL_OPTS', tool: 'shape', patch } );
			}
		};
		const finishPaint = () => {
			if ( paintLayer.id ) {
				commit( __( 'Paint', 'wunderpaint' ) );
			}
		};
		// Slimmed (v1.430): pattern, stroke style, radius and sides left
		// the bar - all of them live in the properties panel and the
		// studio, and the bar clipped "Radius" and showed a "Pattern"
		// label in front of a fill select. What stays is what you need
		// BEFORE drawing: the shape, the two colours and a style.
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Shape', 'wunderpaint' ) }
					</span>
					<ShapePicker
						value={ opts.shape }
						onChange={ ( id ) => set( 'shape', id ) }
						onMore={ () => extras?.openShapeStudio?.() }
					/>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<PaintSwatch
						layer={ paintLayer }
						size={ 24 }
						title={ __( 'Fill', 'wunderpaint' ) }
						onChange={ paintChange }
						onCommit={ finishPaint }
					/>
					<span className="label">
						{ __( 'Stroke', 'wunderpaint' ) }
					</span>
					<PaintSwatch
						layer={ paintLayer }
						target="stroke"
						size={ 24 }
						title={ __( 'Stroke', 'wunderpaint' ) }
						onChange={ paintChange }
						onCommit={ finishPaint }
					/>
					<NumberOpt
						value={ paintLayer.strokeW || 0 }
						width={ 40 }
						suffix="px"
						min={ 0 }
						onChange={ ( v ) => {
							paintChange( { strokeW: v } );
							finishPaint();
						} }
					/>
				</div>
				<ShapeStylePicker />
			</>
		);
	}

	// Selection modes as buttons (v1.429): Shift and Alt still work, the
	// bar gives touch users the same three choices.
	const combineSeg = (
		<div className="group">
			<div className="seg">
				{ [
					[ 'replace', __( 'New', 'wunderpaint' ) ],
					[ 'add', _x( 'Add', 'selection mode', 'wunderpaint' ) ],
					[ 'subtract', __( 'Subtract', 'wunderpaint' ) ],
				].map( ( [ id, label ] ) => (
					<button
						key={ id }
						className={
							id === ( opts.combine || 'replace' ) ? 'active' : ''
						}
						onClick={ () => set( 'combine', id ) }
					>
						{ label }
					</button>
				) ) }
			</div>
		</div>
	);
	const featherOpt = (
		<NumberOpt
			label={ __( 'Feather', 'wunderpaint' ) }
			value={ selectionFeather.value }
			suffix="px"
			min={ 0 }
			max={ 250 }
			width={ 44 }
			onChange={ selectionFeather.onChange }
			onCommit={ selectionFeather.onCommit }
		/>
	);
	const selectionChoices = (
		<SelectionToolChoices
			editor={ editor }
			extras={ extras }
			compact={ compact }
		/>
	);
	// Keep the tool choices recognizable while the panel owns the detailed
	// settings, including the only Feather control while it is open.
	if (
		state.showSelectionPanel &&
		[ 'marquee', 'lasso', 'wand', 'smartselect' ].includes( tool )
	) {
		return selectionChoices;
	}
	if ( 'smartselect' === tool ) {
		return selectionChoices;
	}
	if ( [ 'marquee', 'lasso' ].includes( tool ) ) {
		return (
			<>
				{ selectionChoices }
				{ combineSeg }
				{ featherOpt }
			</>
		);
	}
	if ( 'eyedropper' === tool ) {
		return (
			<div className="group">
				<span className="label">
					{ __( 'Eyedropper', 'wunderpaint' ) }
				</span>
				<EyedropperOptions editor={ editor } compact />
			</div>
		);
	}
	if ( 'pen' === tool ) {
		return (
			<div className="group">
				<span className="label">{ __( 'Pen', 'wunderpaint' ) }</span>
				<div className="seg">
					{ [
						[ 'pen', __( 'Bézier', 'wunderpaint' ) ],
						[ 'curve', _x( 'Curve', 'pen tool', 'wunderpaint' ) ],
						[ 'freehand', __( 'Freehand', 'wunderpaint' ) ],
					].map( ( [ mode, label ] ) => (
						<button
							key={ mode }
							className={ opts.mode === mode ? 'active' : '' }
							onClick={ () => set( 'mode', mode ) }
						>
							{ label }
						</button>
					) ) }
				</div>
			</div>
		);
	}
	if ( 'fxbrush' === tool ) {
		// Full mode cards and effect settings live in the floating tool panel.
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Effect Brush', 'wunderpaint' ) }
					</span>
					<select
						className="fxbp-mode-select"
						aria-label={ __( 'Effect Brush', 'wunderpaint' ) }
						value={ opts.mode || 'blur' }
						onChange={ ( e ) => set( 'mode', e.target.value ) }
					>
						{ FX_BRUSH_MODES.map( ( [ id, label ] ) => (
							<option key={ id } value={ id }>
								{ label() }
							</option>
						) ) }
					</select>
				</div>
				<NumberOpt
					label={ __( 'Size', 'wunderpaint' ) }
					value={ opts.size }
					suffix="px"
					min={ 4 }
					max={ 300 }
					onChange={ ( v ) =>
						set( 'size', Math.min( 300, Math.max( 4, v ) ) )
					}
				/>
			</>
		);
	}

	if (
		'repeat' === tool ||
		( [ 'move', 'select' ].includes( tool ) &&
			activeLayerOf( state )?.type === 'repeat' )
	) {
		// Repeat (v1.431): the mode and the count up here, everything else
		// in the panel, which the slider icon at the end of the bar opens.
		const rep = repeatLayerOf( state );
		if ( ! rep ) {
			return (
				<div className="group">
					<span className="label">
						{ __(
							'Click a layer or group to repeat it.',
							'wunderpaint'
						) }
					</span>
				</div>
			);
		}
		const modeIcons = {
			row: 'repeat',
			grid: 'grid',
			circle: 'rotateCw',
			path: 'pen',
		};
		const modeLabels = {
			row: __( 'Row', 'wunderpaint' ),
			grid: __( 'Grid', 'wunderpaint' ),
			circle: __( 'Circle', 'wunderpaint' ),
			path: __( 'Path', 'wunderpaint' ),
		};
		const mode = rep.rule?.mode || 'row';
		const minCount = 'path' === mode ? 1 : 2;
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Repeat', 'wunderpaint' ) }
					</span>
					<div
						className="dsm-seg selp-tool-types"
						role="group"
						aria-label={ __( 'Repeat', 'wunderpaint' ) }
					>
						{ REPEAT_MODES.map( ( m ) => (
							<button
								type="button"
								key={ m }
								className={ m === mode ? 'active' : '' }
								aria-pressed={ m === mode }
								aria-label={ modeLabels[ m ] }
								title={ modeLabels[ m ] }
								onClick={ () =>
									Ops.setRepeatRule(
										editor,
										rep.id,
										{ mode: m },
										__( 'Edit repeat', 'wunderpaint' )
									)
								}
							>
								{ I[ modeIcons[ m ] ]( { size: 16 } ) }
							</button>
						) ) }
					</div>
				</div>
				{ 'grid' !== mode && (
					<NumberOpt
						label={ __( 'Copies', 'wunderpaint' ) }
						value={ Math.round(
							Number( rep.rule?.count ) || minCount
						) }
						width={ 52 }
						min={ minCount }
						max={ REPEAT_LIMITS.count }
						onChange={ ( v ) =>
							Ops.setRepeatRule( editor, rep.id, {
								count: Math.min(
									REPEAT_LIMITS.count,
									Math.max( minCount, v )
								),
							} )
						}
						onCommit={ () =>
							Ops.setRepeatRule(
								editor,
								rep.id,
								{},
								__( 'Edit repeat', 'wunderpaint' )
							)
						}
					/>
				) }
			</>
		);
	}
	if ( 'wand' === tool ) {
		return (
			<>
				{ selectionChoices }
				<NumberOpt
					label={ __( 'Tolerance', 'wunderpaint' ) }
					value={ opts.tolerance }
					width={ 48 }
					min={ 0 }
					max={ 255 }
					onChange={ ( v ) =>
						set( 'tolerance', Math.min( 255, Math.max( 0, v ) ) )
					}
				/>
				<label
					className="group"
					style={ {
						gap: 4,
						fontSize: 12,
						color: 'var(--ed-text-dim)',
					} }
				>
					<input
						type="checkbox"
						checked={ opts.contiguous ?? true }
						onChange={ ( e ) =>
							set( 'contiguous', e.target.checked )
						}
					/>
					{ __( 'Contiguous', 'wunderpaint' ) }
				</label>
				{ combineSeg }
			</>
		);
	}

	if ( 'bucket' === tool ) {
		return (
			<>
				<NumberOpt
					label={ __( 'Tolerance', 'wunderpaint' ) }
					value={ opts.tolerance }
					width={ 48 }
					min={ 0 }
					max={ 255 }
					onChange={ ( v ) =>
						set( 'tolerance', Math.min( 255, Math.max( 0, v ) ) )
					}
				/>
				<div className="group">
					<div className="seg">
						<button
							className={ opts.contiguous ? 'active' : '' }
							onClick={ () => set( 'contiguous', true ) }
						>
							{ __( 'Contiguous', 'wunderpaint' ) }
						</button>
						<button
							className={ ! opts.contiguous ? 'active' : '' }
							onClick={ () => set( 'contiguous', false ) }
						>
							{ __( 'Global', 'wunderpaint' ) }
						</button>
					</div>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Opacity', 'wunderpaint' ) }
					</span>
					<input
						type="range"
						min="0"
						max="100"
						value={ opts.opacity }
						onChange={ ( e ) => set( 'opacity', +e.target.value ) }
						style={ { width: 70 } }
					/>
					<span data-number-value className="label">
						{ opts.opacity }%
					</span>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					{ /* Direct color field (v1.128.2) instead of the old
					     foreground/background toggle - it edits the shared
					     foreground color, so toolbar and brushes stay in sync. */ }
					<SwatchButton
						size={ 24 }
						color={ state.fgColor }
						onChange={ ( c ) =>
							dispatch( { type: 'SET_FG', color: c } )
						}
					/>
				</div>
			</>
		);
	}

	if ( 'crop' === tool ) {
		return (
			<div className="group crp-context">
				<span className="label">{ __( 'Crop', 'wunderpaint' ) }</span>
				{ ! state.showCropPanel && (
					<CropFormatSelect editor={ editor } />
				) }
				<div className="seg">
					<CropActions editor={ editor } toolbar />
				</div>
			</div>
		);
	}

	if (
		'gradient' === tool ||
		( [ 'move', 'select' ].includes( tool ) && gradientLayerOf( state ) )
	) {
		const layer = gradientLayerOf( state ),
			kind = ( layer || opts ).kind || 'linear',
			locked =
				!! layer &&
				( layer.locked || ancestorLocked( state.layers, layer ) );
		const setKind = ( next ) => {
			if ( locked || next === kind ) {
				return;
			}
			if ( layer ) {
				dispatch( {
					type: 'UPDATE_LAYER',
					id: layer.id,
					patch: gradientKindPatch( layer, next ),
				} );
				commit( __( 'Edit gradient', 'wunderpaint' ) );
			} else {
				set( 'kind', next );
			}
		};
		return (
			<div className="group">
				<span className="label">
					{ __( 'Gradient', 'wunderpaint' ) }
				</span>
				<div className="seg">
					{ [
						[ 'linear', __( 'Linear', 'wunderpaint' ) ],
						[ 'radial', __( 'Radial', 'wunderpaint' ) ],
						[ 'angle', __( 'Angle', 'wunderpaint' ) ],
						[ 'freeform', __( 'Freeform', 'wunderpaint' ) ],
						[ 'mesh', __( 'Mesh', 'wunderpaint' ) ],
					].map( ( [ id, label ] ) => (
						<button
							type="button"
							key={ id }
							className={ kind === id ? 'active' : '' }
							aria-pressed={ kind === id }
							disabled={ locked }
							onClick={ () => setKind( id ) }
						>
							{ label }
						</button>
					) ) }
				</div>
			</div>
		);
	}

	if ( 'zoom' === tool ) {
		return (
			<div className="group">
				<span className="label">
					{ __(
						'Click: Zoom in · Alt+Click: Zoom out · Drag: Marquee zoom',
						'wunderpaint'
					) }
				</span>
			</div>
		);
	}

	// Contextual options for the Move tool (v1.9): the selected layer's
	// most-used controls live in the bar, the old static hint is gone
	// (the tip box bottom-left still teaches shortcuts).
	if ( 'move' === tool && active && 'shape' === active.type ) {
		// Every selected shape follows (v1.429), the way the text bar
		// already treats a selection of text layers.
		const shapeIds = [
			...new Set( [ active.id, ...( state.selectedIds || [] ) ] ),
		].filter( ( id ) =>
			state.layers.some(
				( l ) => l.id === id && 'shape' === l.type && ! l.locked
			)
		);
		const up = ( patch, label ) => {
			if ( shapeIds.length > 1 ) {
				dispatch( { type: 'UPDATE_LAYERS', ids: shapeIds, patch } );
			} else {
				dispatch( { type: 'UPDATE_LAYER', id: active.id, patch } );
			}
			commit( label || __( 'Edit shape', 'wunderpaint' ) );
		};
		// Slimmed (v1.430): stroke style, dash, gap and pattern are in the
		// properties panel; the bar keeps the colours, the width, a style
		// and the door to the studio.
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<PaintSwatch
						layer={ active }
						target="fill"
						size={ 24 }
						title={ __( 'Fill', 'wunderpaint' ) }
						onChange={ up }
					/>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Stroke', 'wunderpaint' ) }
					</span>
					<PaintSwatch
						layer={ active }
						target="stroke"
						size={ 24 }
						title={ __( 'Stroke', 'wunderpaint' ) }
						onChange={ up }
					/>
				</div>
				<NumberOpt
					label={ __( 'Width', 'wunderpaint' ) }
					value={ Math.round( active.strokeW || 0 ) }
					suffix="px"
					min={ 0 }
					max={ 200 }
					width={ 48 }
					onChange={ ( v ) => up( { strokeW: Math.max( 0, v ) } ) }
				/>
				<ShapeStylePicker />
			</>
		);
	}
	if (
		'move' === tool &&
		active &&
		[ 'image', 'raster', 'smart' ].includes( active.type )
	) {
		// Multi-select (v1.15): opacity/blend hit every selected layer.
		const ids = [
			...new Set( [ active.id, ...state.selectedIds ] ),
		].filter( ( id ) => {
			const l = state.layers.find( ( x ) => x.id === id );
			return l && 'group' !== l.type;
		} );
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Opacity', 'wunderpaint' ) }
					</span>
					<input
						type="range"
						min="0"
						max="100"
						value={ Math.round( ( active.opacity ?? 1 ) * 100 ) }
						style={ { width: 90 } }
						onChange={ ( e ) =>
							dispatch( {
								type: 'UPDATE_LAYERS',
								ids,
								patch: { opacity: +e.target.value / 100 },
							} )
						}
						onMouseUp={ () =>
							commit( __( 'Layer opacity', 'wunderpaint' ) )
						}
					/>
					<span
						data-number-value
						className="label"
						style={ { width: 34 } }
					>
						{ Math.round( ( active.opacity ?? 1 ) * 100 ) }%
					</span>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Blend', 'wunderpaint' ) }
					</span>
					<BlendModeSelect
						value={ active.blend || 'normal' }
						width={ 116 }
						tiles={ {
							doc: state.doc,
							layers: state.layers,
							activeId: active.id,
						} }
						onPreview={ ( b ) =>
							dispatch( {
								type: 'UPDATE_LAYERS',
								ids,
								patch: { blend: b },
							} )
						}
						onCommit={ ( b ) => {
							dispatch( {
								type: 'UPDATE_LAYERS',
								ids,
								patch: { blend: b },
							} );
							commit( __( 'Blend:', 'wunderpaint' ) + ' ' + b );
						} }
					/>
				</div>
			</>
		);
	}
	return null;
}

/* ------------------------------ menu bar ------------------------------- */

export function EditorMenuBar( { extras, tabsBar = null } ) {
	const editor = useEditor();
	const [ open, setOpen ] = useState( null );
	const barRef = useRef( null );
	const optsRef = useRef( null );

	// Compact tool options: menus, tool options and document tabs share
	// ONE row. When the options overflow their flex slot (text tool on
	// 1920px with tabs open) they used to paint underneath the tabs.
	// Overflow now flips `compact` (alignment trios become cycle
	// buttons, labels drop); the expand threshold exceeds the ~140px
	// the full controls need back, so the state cannot flap.
	const [ compact, setCompact ] = useState( false );
	const check = () => {
		const el = optsRef.current;
		if ( el ) {
			setCompact( ( c ) =>
				c
					? ! ( el.clientWidth - el.scrollWidth > 180 )
					: el.scrollWidth > el.clientWidth + 1
			);
		}
	};
	// The slot resizes with the window, the panel drag and the tab count.
	useEffect( () => {
		if ( 'undefined' === typeof window.ResizeObserver ) {
			return undefined;
		}
		const ro = new window.ResizeObserver( check );
		if ( optsRef.current ) {
			ro.observe( optsRef.current );
		}
		return () => ro.disconnect();
	}, [] );
	// The content changes with the active tool; re-measure every render
	// (same-value updates bail out, so this is cheap).
	useEffect( check );

	// Late extension registrations (in-editor installs, v1.119) must show
	// without waiting for the next editor state change.
	const [ extTick, setExtTick ] = useState( 0 );
	useEffect(
		() => subscribeExtensions( () => setExtTick( ( t ) => t + 1 ) ),
		[]
	);
	const menus = useMemo(
		// extTick is here ON PURPOSE and the rule cannot see why: buildMenus
		// reads the extension registry, which is module state rather than a
		// prop, so bumping the tick is the only way to rebuild the menus when
		// a package registers late.
		() => buildMenus( editor, extras ),
		[ editor, extras, extTick ]
	);

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onDown = ( e ) => {
			if ( barRef.current && ! barRef.current.contains( e.target ) ) {
				setOpen( null );
			}
		};
		document.addEventListener( 'mousedown', onDown );
		return () => document.removeEventListener( 'mousedown', onDown );
	}, [ open ] );

	return (
		<div className="ed-menubar" ref={ barRef }>
			{ menus.map( ( menu ) => (
				<div
					key={ menu.id }
					className="ed-menu-wrap"
					data-ws={ 'menu.' + menu.id }
				>
					<div
						className={ `ed-menu${
							open === menu.id ? ' open' : ''
						}` }
						data-menu={ menu.id }
						role="button"
						tabIndex={ 0 }
						aria-haspopup="menu"
						aria-expanded={ open === menu.id }
						onClick={ () =>
							setOpen( open === menu.id ? null : menu.id )
						}
						onMouseEnter={ () => open && setOpen( menu.id ) }
						onKeyDown={ ( e ) =>
							( 'Enter' === e.key || ' ' === e.key ) &&
							setOpen( open === menu.id ? null : menu.id )
						}
					>
						{ menu.label }
					</div>
					{ open === menu.id && menu.id === 'filter' && (
						<FilterDropdown
							menu={ menu }
							editor={ editor }
							extras={ extras }
							onClose={ () => setOpen( null ) }
						/>
					) }
					{ open === menu.id && menu.id !== 'filter' && (
						<Dropdown
							menu={ menu }
							editor={ editor }
							extras={ extras }
							onClose={ () => setOpen( null ) }
						/>
					) }
				</div>
			) ) }
			<div className="ed-menu-divider" />
			<div className="ed-tool-opts">
				<div className="ed-tool-fields" ref={ optsRef }>
					<ToolOptions extras={ extras } compact={ compact } />
				</div>
				<CropPreviewActions editor={ editor } />
				<ToolPanelOpener editor={ editor } extras={ extras } />
			</div>
			{ tabsBar }
		</div>
	);
}
