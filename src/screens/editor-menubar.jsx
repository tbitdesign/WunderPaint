/**
 * Menu bar: real dropdowns for File/Edit/Image/Layer/Select/Filter/View/Help
 * plus the contextual tool-options block (spec 04.2).
 */

import { useState, useEffect, useRef, useMemo } from '@wordpress/element';
import { __, _x } from '@wordpress/i18n';

import { I } from '../icons';
import { FILTERS, FONT_WEIGHTS } from '../store/constants';
import { BlendModeSelect } from '../components/blend-select';
import { FontPicker } from '../components/font-picker';
import { promptDialog } from '../lib/dialogs';
import { SOCIAL_CROPS } from '../lib/safe-zones';
import { listRecentFiles } from '../lib/recent-files';
import { listMacros, listActions, runMacro } from '../lib/macros';
import { ACTION_CATEGORIES } from '../lib/bundled-actions';
import { PROOF_MODES } from '../lib/proof';
import { PatternSelect } from '../components/pattern-select';
import {
	listUserGradients,
	saveUserGradient,
	deleteUserGradient,
} from '../lib/gradient-presets';
import { useGradients } from '../content/use-content';
import {
	BRUSH_TIPS,
	isStampTip,
	stampTipStroke,
	getTip,
} from '../lib/brush-tips';
import { dashDefaults, drawSoftRoundStroke } from '../lib/raster';
import {
	listToolPresets,
	saveToolPreset,
	deleteToolPreset,
} from '../lib/tool-presets';
import { EFFECTS } from '../lib/effects';
import { TextStylePicker } from './text-style-picker';
import { useSelectionStyle } from '../components/use-selection-style';
import { useEditor, activeLayerOf } from '../store/editor-context';
import { selectionBounds } from './canvas/overlays';
import {
	extensionMenuItems,
	listExtensionFilterPresets,
	listExtensionEffects,
	listExtensionGenerators,
	groupGenerators,
	subscribeExtensions,
	extensionCategoryId,
	EXTENSION_MENU_CATEGORIES,
} from '../lib/extensions';
import { SwatchButton } from '../components/color-popover';
import { ScrubLabel } from '../components/scrub-label';
import { GradientBar } from '../components/gradient-bar';
import * as Ops from '../store/ops';
import { currentLocale, availableLocales } from '../lib/editor-locale';

/**
 * Build the menu model (spec 04.2, every listed item, all functional).
 * `run` receives (editor, extras); `when` gates enabled state.
 */
function buildMenus( editor, extras ) {
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
				{
					label: __( 'New', 'wunderpaint' ),
					kbd: '⌘N',
					run: () => extras.openCreate(),
				},
				{
					label: __( 'Open/Place', 'wunderpaint' ),
					run: () => Ops.openPlaceOp( editor, extras ),
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
				// Save family grouped by destination (v1.96.0): flattened image
				// to the Media Library | editable design | reusable pieces.
				{ divider: true },
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
				{
					ws: 'mi.file.share',
					label: __( 'Share Design Link', 'wunderpaint' ),
					run: () => Ops.shareDesignOp( editor, extras ),
					when: () => !! state.doc.source?.designId,
				},
				{
					ws: 'mi.file.unshare',
					label: __( 'Stop Sharing', 'wunderpaint' ),
					run: () => Ops.unshareDesignOp( editor, extras ),
					when: () => !! state.doc.source?.designId,
				},
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
				{
					label: __( 'Add Page', 'wunderpaint' ),
					run: () => Ops.addPageOp( editor ),
				},
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
				{
					ws: 'mi.edit.freetransform',
					label: __( 'Free Transform', 'wunderpaint' ),
					run: () => Ops.freeTransformOp( editor, extras ),
					when: () => hasActive,
				},
				{
					label: __( 'Select All', 'wunderpaint' ),
					kbd: '⌘A',
					run: () => Ops.selectAllOp( editor ),
				},
				{
					label: __( 'Deselect', 'wunderpaint' ),
					kbd: '⌘D',
					run: () => Ops.deselectOp( editor ),
					when: () => hasSelection,
				},
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
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
				{
					label: __( 'New Layer', 'wunderpaint' ),
					kbd: '⇧⌘N',
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
				{
					label: __( 'Duplicate', 'wunderpaint' ),
					run: () => Ops.duplicateLayer( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Radial Repeat…', 'wunderpaint' ),
					run: () => Ops.radialRepeatPrompt( editor ),
					when: () => hasActive,
				},
				{
					label: __( 'Delete', 'wunderpaint' ),
					run: () => Ops.deleteLayers( editor ),
					when: () => hasActive,
				},
				{ divider: true },
				{
					label: __( 'Layer via Copy', 'wunderpaint' ),
					run: () => Ops.layerViaCopyOp( editor ),
					when: () => hasActive,
				},
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
				{ divider: true },
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
				{ divider: true },
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
			],
		},
		{
			id: 'select',
			label: __( 'Select', 'wunderpaint' ),
			items: [
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
				{ divider: true },
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
				{ divider: true },
				{
					label: __( 'Smart Select', 'wunderpaint' ),
					run: () => extras.selectSubject(),
				},
				{
					label: __( 'Remove Object', 'wunderpaint' ),
					run: () => extras.removeObject(),
					when: () => hasSelection,
				},
				{ divider: true },
				{
					label: __( 'Feather', 'wunderpaint' ),
					run: () => Ops.featherSelectionOp( editor, extras ),
					when: () => hasSelection,
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
					run: () =>
						Object.keys( e.params || {} ).length
							? extras.openEffect( e.id )
							: Ops.applyEffectOp( editor, extras, e.id ),
					when: () => hasActive,
				} );
				const effectItems = ( ids ) =>
					ids
						.map( ( id ) => EFFECTS.find( ( e ) => e.id === id ) )
						.filter( Boolean )
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
					( e ) => ! e.hidden && ! grouped.has( e.id )
				).map( effectItem );
				const extEffects = listExtensionEffects()
					.filter( ( e ) => ! e.hidden )
					.map( effectItem );
				return [
					{
						label: __( 'Presets', 'wunderpaint' ),
						children: [
							...FILTERS.filter( ( f ) => 'none' !== f.id ).map(
								( f ) => ( {
									label: f.label,
									run: () =>
										Ops.applyPresetFilterOp( editor, f.id ),
									when: () => hasActive,
								} )
							),
							...listExtensionFilterPresets().map( ( f ) => ( {
								label: f.label,
								run: () =>
									Ops.applyPresetFilterOp( editor, f.id ),
								when: () => hasActive,
							} ) ),
							{ divider: true },
							{
								label: __( 'Remove Filter', 'wunderpaint' ),
								run: () =>
									Ops.applyPresetFilterOp( editor, 'none' ),
								when: () =>
									hasActive &&
									'none' !== activeLayerOf( state )?.filter,
							},
						],
					},
					{
						label: __( 'Blur & Sharpen', 'wunderpaint' ),
						children: effectItems( GROUPS.blur ),
					},
					{
						label: __( 'Color', 'wunderpaint' ),
						children: effectItems( GROUPS.color ),
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
								run: () =>
									Ops.applyEffectOp(
										editor,
										extras,
										'duotone',
										{ shadow, highlight }
									),
								when: () => hasActive,
							} ) ),
						],
					},
					{
						label: __( 'Stylize', 'wunderpaint' ),
						children: [ ...effectItems( GROUPS.stylize ), ...rest ],
					},
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
				{ divider: true },
				// Panels (v1.130.2): everything that shows/hides a work area.
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
				{ divider: true },
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
				{ divider: true },
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
				{ divider: true },
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
			],
		},
		{
			// Automation (v1.154.0, was "Automate"): everything that runs
			// over many posts/images or generates work. Single tools moved
			// to Tools, extension launchers to Extensions.
			id: 'automation',
			label: __( 'Automation', 'wunderpaint' ),
			items: [
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
				{
					// Assistants that generate whole designs; more to come.
					label: __( 'Design', 'wunderpaint' ),
					subId: 'design',
					children: [
						{
							label: __( 'Design Generator', 'wunderpaint' ),
							run: () => extras.openDesignAssistant(),
						},
					],
				},
				{
					// Actions moved in from their own top-level menu
					// (v1.154.0): recording and replaying is automation.
					label: __( 'Actions', 'wunderpaint' ),
					subId: 'actions',
					children: [
						{
							label: __( 'Manage Actions', 'wunderpaint' ),
							run: () => extras.openActions(),
						},
						{ divider: true },
						// Bundled quick access (v1.246.1): one nested
						// submenu per starter category.
						...Object.entries( ACTION_CATEGORIES ).map(
							( [ key, catLabel ] ) => ( {
								label: catLabel(),
								children: listActions()
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
							} )
						),
						{ divider: true },
						...( listMacros().length
							? listMacros().map( ( m ) => ( {
									label: m.name,
									run: () =>
										runMacro( editor, m.steps ).catch(
											() => {}
										),
							  } ) )
							: [
									{
										label: __(
											'No saved actions',
											'wunderpaint'
										),
										run: () => {},
										when: () => false,
									},
							  ] ),
					],
				},
			],
		},
		{
			// Tools (v1.154.0): single creative tools that belong to the
			// editor but are neither automation nor extensions.
			id: 'tools',
			label: __( 'Tools', 'wunderpaint' ),
			items: [
				{
					label: __( 'Color Schemer', 'wunderpaint' ),
					run: () => extras.openColorSchemer(),
				},
				{
					label: __( 'Background Studio', 'wunderpaint' ),
					run: () => extras.openBackgroundStudio(),
				},
				{
					label: __( 'Screenshot Beautifier', 'wunderpaint' ),
					run: () => extras.openBeautify(),
				},
				{
					label: __( 'Collage & Photo Grid', 'wunderpaint' ),
					run: () => extras.openCollage?.(),
				},
				{
					label: __( '360° Panorama', 'wunderpaint' ),
					run: () => extras.openPanorama?.(),
				},
				{
					label: __( 'Mockup Generator', 'wunderpaint' ),
					run: () => extras.openMockup(),
				},
				{
					label: __( 'Chart & Table', 'wunderpaint' ),
					run: () => extras.openChart(),
				},
				{
					label: __( 'QR Code Generator', 'wunderpaint' ),
					run: () => extras.openQr(),
				},
				{
					label: __( 'Vignette & Film', 'wunderpaint' ),
					run: () => extras.openVignette?.(),
				},
			],
		},
		// Extensions is the LAUNCHER menu (v1.154.0): one entry per
		// installed extension (its generators, grouped when several), for
		// every user. Managing moved to Help > Manage Extensions.
		...( () => {
			// Core generators (wpie-core/*, v1.256) have their own menu
			// homes - the launcher lists real extensions only.
			const groups = groupGenerators(
				listExtensionGenerators().filter(
					( gen ) => ! String( gen.id ).startsWith( 'wpie-core/' )
				),
				window.WPIE?.extensions || []
			);
			const loose = extensionMenuItems( 'extensions' );
			if ( ! groups.length && ! loose.length ) {
				return [];
			}
			// Curated categories (v1.310): every extension sorts into one
			// of the fixed, translated groups - ALWAYS a submenu, so the
			// menu reads as tidy categories no matter what is installed.
			// Order and labels are host-owned; ids are the stable API.
			const CATEGORY_LABELS = {
				photo: __( 'Photo & Effects', 'wunderpaint' ),
				motion: __( 'Motion & Video', 'wunderpaint' ),
				'3d': __( '3D & Mockups', 'wunderpaint' ),
				art: __( 'Art & Illustration', 'wunderpaint' ),
				data: __( 'Data & Diagrams', 'wunderpaint' ),
				marketing: __( 'Marketing & Social', 'wunderpaint' ),
				print: __( 'Print & Posters', 'wunderpaint' ),
				tools: __( 'Tools & Workflow', 'wunderpaint' ),
				other: __( 'Other', 'wunderpaint' ),
			};
			const buckets = new Map();
			const put = ( cat, entry ) => {
				if ( ! buckets.has( cat ) ) {
					buckets.set( cat, [] );
				}
				buckets.get( cat ).push( entry );
			};
			groups.forEach( ( group ) =>
				put(
					group.category,
					1 === group.items.length
						? {
								label: group.items[ 0 ].label,
								run: () =>
									group.items[ 0 ].run( {
										editor,
										extras,
									} ),
						  }
						: {
								label: group.name,
								children: group.items.map( ( gen ) => ( {
									label: gen.label,
									run: () => gen.run( { editor, extras } ),
								} ) ),
						  }
				)
			);
			// Third-party menu items declare their category on the item.
			loose.forEach( ( item ) =>
				put( extensionCategoryId( item.category ), {
					label: item.label,
					run: () => item.run( { editor, extras } ),
					when: item.when ? () => item.when( { editor } ) : undefined,
				} )
			);
			const byLabel = ( a, b ) => a.label.localeCompare( b.label );
			return [
				{
					id: 'extensions',
					label: __( 'Extensions', 'wunderpaint' ),
					items: EXTENSION_MENU_CATEGORIES.filter( ( cat ) =>
						buckets.has( cat )
					).map( ( cat ) => ( {
						label: CATEGORY_LABELS[ cat ],
						children: buckets.get( cat ).sort( byLabel ),
					} ) ),
				},
			];
		} )(),
		{
			id: 'help',
			label: __( 'Help', 'wunderpaint' ),
			items: [
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
				{
					label: __( 'Show Tour', 'wunderpaint' ),
					run: () => extras.openTour(),
				},
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

/**
 * Submenu entries, recursively: a child with `children` opens another
 * level on hover (v1.246.1 - the bundled-action categories under
 * Automation > Actions were the first three-level menu).
 *
 * @param {Object}   props         Props.
 * @param {Array}    props.items   Menu entries.
 * @param {Function} props.runItem Runs a leaf entry and closes the menu.
 */
function SubItems( { items, runItem } ) {
	const [ openSub, setOpenSub ] = useState( null );
	return (
		<>
			{ items.map( ( child, ci ) => {
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
									/>
								</div>
							) }
						</div>
					);
				}
				const childEnabled = ! child.when || child.when();
				return (
					<button
						key={ ci }
						role="menuitem"
						className="ed-item"
						disabled={ ! childEnabled }
						onClick={ () => runItem( child ) }
					>
						{ child.label }
						{ child.chip && (
							<span className="menu-chip-pro">
								{ child.chip }
							</span>
						) }
						{ child.checked && <span className="kbd-hint">✓</span> }
						{ child.kbd && (
							<span className="kbd-hint">{ child.kbd }</span>
						) }
					</button>
				);
			} ) }
		</>
	);
}

function Dropdown( { menu, extras, onClose } ) {
	const ref = useRef( null );
	const [ focusIdx, setFocusIdx ] = useState( -1 );
	const [ openSub, setOpenSub ] = useState( null );
	const actionable = menu.items.filter(
		( item ) => ! item.divider && ! item.children
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
									/>
								</div>
							) }
						</div>
					);
				}
				actionIdx++;
				const enabled = ! item.when || item.when();
				const isFocused = actionIdx === focusIdx;
				return (
					<button
						key={ i }
						role="menuitem"
						data-ws={ item.ws }
						className={ `ed-item${ isFocused ? ' focused' : '' }` }
						disabled={ ! enabled }
						onClick={ () => runItem( item ) }
					>
						{ item.label }
						{ item.chip && (
							<span className="menu-chip-pro">{ item.chip }</span>
						) }
						{ item.checked && <span className="kbd-hint">✓</span> }
						{ item.kbd && (
							<span className="kbd-hint">{ item.kbd }</span>
						) }
					</button>
				);
			} ) }
		</div>
	);
}

/* --------------------------- tool options ------------------------------ */

/** Photoshop-style gradient preset picker: dropdown swatch grid (v1.0.7). */
function GradientPresetPicker( { opts, set } ) {
	const GRADIENT_PRESETS = useGradients();
	const [ open, setOpen ] = useState( null ); // fixed panel style | null
	const [ userGradients, setUserGradients ] = useState( listUserGradients );
	const panelRef = useRef( null );

	useEffect( () => {
		if ( ! open ) {
			return;
		}
		const onDown = ( e ) => {
			if ( panelRef.current && ! panelRef.current.contains( e.target ) ) {
				setOpen( null );
			}
		};
		const onKey = ( e ) => {
			if ( 'Escape' === e.key ) {
				e.stopPropagation();
				setOpen( null );
			}
		};
		document.addEventListener( 'mousedown', onDown );
		document.addEventListener( 'keydown', onKey, true );
		return () => {
			document.removeEventListener( 'mousedown', onDown );
			document.removeEventListener( 'keydown', onKey, true );
		};
	}, [ open ] );

	const cssFor = ( stops ) =>
		`linear-gradient(90deg, ${ stops
			.map( ( stop ) => `${ stop.color } ${ stop.at * 100 }%` )
			.join( ', ' ) })`;

	const apply = ( g ) => {
		set(
			'stops',
			g.stops.map( ( stop ) => ( { ...stop } ) )
		);
		set( 'kind', g.kind || 'linear' );
		setOpen( null );
	};

	const swatch = ( g, removable ) => (
		<button
			key={ g.name }
			className="gradient-preset-sw"
			style={ { backgroundImage: cssFor( g.stops ) } }
			title={
				removable
					? `${ g.name }, ${ __(
							'Alt-click removes',
							'wunderpaint'
					  ) }`
					: g.name
			}
			aria-label={ g.name }
			onClick={ ( e ) => {
				if ( removable && e.altKey ) {
					setUserGradients( deleteUserGradient( g.name ) );
				} else {
					apply( g );
				}
			} }
		/>
	);

	return (
		<div className="group">
			<button
				className="gradient-preset-toggle"
				title={ __( 'Gradient presets', 'wunderpaint' ) }
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
						left: Math.min( rect.left, window.innerWidth - 292 ),
						top: rect.bottom + 6,
						zIndex: 700,
					} );
				} }
			>
				<span
					className="gradient-preset-current"
					style={ { backgroundImage: cssFor( opts.stops || [] ) } }
				/>
				▾
			</button>
			{ open && (
				<div
					className="gradient-preset-panel"
					style={ open }
					ref={ panelRef }
					role="listbox"
					aria-label={ __( 'Gradient presets', 'wunderpaint' ) }
				>
					<div className="gradient-preset-grid">
						{ GRADIENT_PRESETS.map( ( g ) => swatch( g, false ) ) }
					</div>
					{ userGradients.length > 0 && (
						<>
							<div className="gradient-preset-title">
								{ __( 'My gradients', 'wunderpaint' ) }
							</div>
							<div className="gradient-preset-grid">
								{ userGradients.map( ( g ) =>
									swatch( g, true )
								) }
							</div>
						</>
					) }
					<button
						className="ai-btn secondary gradient-preset-save"
						onClick={ async () => {
							const name = await promptDialog( {
								title: __( 'Save Gradient', 'wunderpaint' ),
								label: __( 'Name', 'wunderpaint' ),
								defaultValue: 'Gradient',
							} );
							if ( name ) {
								setUserGradients(
									saveUserGradient(
										name,
										opts.stops || [],
										opts.kind
									)
								);
							}
						} }
					>
						＋ { __( 'Save current gradient', 'wunderpaint' ) }
					</button>
				</div>
			) }
		</div>
	);
}

/** Saved brush presets as one-click chips (F9, v0.5). */
function BrushPresets( { opts, apply } ) {
	const [ presets, setPresets ] = useState( listToolPresets );
	return (
		<div className="group" style={ { gap: 4 } }>
			{ presets.map( ( preset ) => (
				<button
					key={ preset.name }
					className="brush-preset-chip"
					title={ `${ preset.size }px · ${ preset.opacity }% · ${ __(
						'Alt-click removes',
						'wunderpaint'
					) }` }
					onClick={ ( e ) => {
						if ( e.altKey ) {
							setPresets( deleteToolPreset( preset.name ) );
						} else {
							apply( preset );
						}
					} }
				>
					{ preset.name }
				</button>
			) ) }
			<button
				className="brush-preset-chip add"
				title={ __( 'Save current brush as preset', 'wunderpaint' ) }
				onClick={ async () => {
					const name = await promptDialog( {
						title: __( 'Save Brush Preset', 'wunderpaint' ),
						label: __( 'Name', 'wunderpaint' ),
						defaultValue: `${ opts.size }px`,
					} );
					if ( name ) {
						setPresets( saveToolPreset( name, opts ) );
					}
				} }
			>
				＋
			</button>
		</div>
	);
}

function NumberOpt( { label, value, onChange, width = 56, suffix, min, max } ) {
	return (
		<div className="group">
			{ label && (
				<ScrubLabel
					className="label"
					value={ value }
					min={ min ?? -Infinity }
					max={ max ?? Infinity }
					onScrub={ onChange }
				>
					{ label }
				</ScrubLabel>
			) }
			<input
				type="number"
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

/** Rendered stroke preview for a brush tip (cached, v1.21). */
const tipPreviewCache = {};
function tipPreview( id ) {
	if ( tipPreviewCache[ id ] ) {
		return tipPreviewCache[ id ];
	}
	const c = document.createElement( 'canvas' );
	c.width = 62;
	c.height = 38;
	const ctx = c.getContext( '2d' );
	const pts = [];
	for ( let i = 0; i <= 26; i++ ) {
		const t = i / 26;
		pts.push( {
			x: 8 + t * 46,
			y: 19 + Math.sin( t * Math.PI * 1.7 ) * 9,
		} );
	}
	const path = { pts, size: 9, color: '#e6e8eb', opacity: 1, tip: id };
	if ( isStampTip( id ) ) {
		stampTipStroke( ctx, path );
	} else {
		const soft = getTip( id ).soft || 0;
		if ( soft > 0 ) {
			// Same feathered engine as the canvas render (v1.123).
			drawSoftRoundStroke( ctx, path, soft );
		} else {
			ctx.strokeStyle = '#e6e8eb';
			ctx.lineCap = 'round';
			ctx.lineJoin = 'round';
			ctx.beginPath();
			pts.forEach( ( p, i ) =>
				i ? ctx.lineTo( p.x, p.y ) : ctx.moveTo( p.x, p.y )
			);
			ctx.lineWidth = 9;
			ctx.stroke();
		}
	}
	tipPreviewCache[ id ] = c.toDataURL();
	return tipPreviewCache[ id ];
}

/** Brush-tip picker: a trigger button + dropdown grid of previews (v1.22). */
function BrushTipPicker( { value, onChange } ) {
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
						left: Math.min( rect.left, window.innerWidth - 232 ),
						top: rect.bottom + 6,
						zIndex: 700,
					} );
				} }
			>
				<img src={ tipPreview( current.id ) } alt="" />
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
							<img src={ tipPreview( t.id ) } alt="" />
						</button>
					) ) }
				</div>
			) }
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
					<span className="label" style={ { width: 28 } }>
						{ value }
					</span>
				</div>
			) }
		</div>
	);
}

function ToolOptions( { extras, compact } ) {
	const editor = useEditor();
	const { state, dispatch, commit } = editor;
	const tool = state.tool;
	const opts = state.toolOpts[ tool ] || {};
	const set = ( key, value ) =>
		dispatch( { type: 'SET_TOOL_OPTS', tool, patch: { [ key ]: value } } );
	const active = activeLayerOf( state );
	const selStyle = useSelectionStyle( extras );

	if ( [ 'brush', 'pencil', 'eraser', 'stamp' ].includes( tool ) ) {
		return (
			<>
				<NumberOpt
					label={ __( 'Size', 'wunderpaint' ) }
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
					<span className="label" style={ { width: 30 } }>
						{ opts.opacity }%
					</span>
				</div>
				{ /* Photoshop parity (v1.129.0): the pencil IS the hard tip,
				     it has neither flow nor hardness; the clone stamp has no
				     flow either. */ }
				{ [ 'brush', 'eraser' ].includes( tool ) && (
					<NumberOpt
						label={ __( 'Flow', 'wunderpaint' ) }
						value={ opts.flow }
						suffix="%"
						min={ 1 }
						max={ 100 }
						onChange={ ( v ) => set( 'flow', v ) }
					/>
				) }
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
							style={ { width: 70 } }
							onChange={ ( e ) =>
								set( 'mirror', e.target.value )
							}
						>
							<option value="off">
								{ __( 'Off', 'wunderpaint' ) }
							</option>
							<option value="x">↔</option>
							<option value="y">↕</option>
							<option value="xy">↔↕</option>
						</select>
					</div>
				) }
				{ [ 'brush', 'eraser' ].includes( tool ) && (
					<BrushPresets
						opts={ opts }
						apply={ ( preset ) => {
							set( 'size', preset.size );
							set( 'opacity', preset.opacity );
							set( 'flow', preset.flow );
							set( 'hardness', preset.hardness );
						} }
					/>
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
					<CurvePopover
						value={ +value( 'curve' ) || 0 }
						onChange={ ( v ) => update( 'curve', v ) }
					/>
				</div>
				<div className="group nb">
					{ ! compact && (
						<span className="label">
							{ __( 'Color', 'wunderpaint' ) }
						</span>
					) }
					<SwatchButton
						size={ 24 }
						color={
							selStyle?.color ||
							( target ? target.color : state.fgColor )
						}
						onChange={ ( c ) =>
							target
								? update( 'color', c )
								: dispatch( { type: 'SET_FG', color: c } )
						}
					/>
				</div>
				{ target && <TextStylePicker /> }
			</>
		);
	}

	if ( 'shape' === tool ) {
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Shape', 'wunderpaint' ) }
					</span>
					<select
						value={ opts.shape }
						style={ { width: 110 } }
						onChange={ ( e ) => set( 'shape', e.target.value ) }
					>
						{ [
							[ 'rect', __( 'Rectangle', 'wunderpaint' ) ],
							[ 'ellipse', __( 'Ellipse', 'wunderpaint' ) ],
							[ 'line', __( 'Line', 'wunderpaint' ) ],
							[ 'polygon', __( 'Polygon', 'wunderpaint' ) ],
							[ 'star', __( 'Star', 'wunderpaint' ) ],
							[ 'arrow', __( 'Arrow', 'wunderpaint' ) ],
							[ 'heart', __( 'Heart', 'wunderpaint' ) ],
							[ 'speech', __( 'Speech Bubble', 'wunderpaint' ) ],
							[ 'badge', __( 'Badge', 'wunderpaint' ) ],
						].map( ( [ id, label ] ) => (
							<option key={ id } value={ id }>
								{ label }
							</option>
						) ) }
					</select>
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<PatternSelect
						value={ opts.pattern }
						patternData={ opts.patternData }
						style={ { width: 110 } }
						extras={ extras }
						onChange={ ( pattern, patternData ) => {
							set( 'pattern', pattern );
							set( 'patternData', patternData );
						} }
					/>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<SwatchButton
						size={ 24 }
						color={ state.fgColor }
						onChange={ ( c ) =>
							dispatch( { type: 'SET_FG', color: c } )
						}
					/>
					<span className="label">
						{ __( 'Stroke', 'wunderpaint' ) }
					</span>
					<SwatchButton
						size={ 24 }
						color={ opts.stroke || 'transparent' }
						onChange={ ( c ) => set( 'stroke', c ) }
					/>
					<NumberOpt
						value={ opts.strokeW }
						width={ 40 }
						suffix="px"
						min={ 0 }
						onChange={ ( v ) => set( 'strokeW', v ) }
					/>
					<select
						title={ __( 'Stroke style', 'wunderpaint' ) }
						value={ opts.strokeDash || 'solid' }
						style={ { width: 86 } }
						onChange={ ( e ) =>
							set(
								'strokeDash',
								'solid' === e.target.value
									? null
									: e.target.value
							)
						}
					>
						<option value="solid">
							{ _x( 'Solid', 'stroke style', 'wunderpaint' ) }
						</option>
						<option value="dashed">
							{ __( 'Dashed', 'wunderpaint' ) }
						</option>
						<option value="dotted">
							{ __( 'Dotted', 'wunderpaint' ) }
						</option>
					</select>
				</div>
				<NumberOpt
					label={ __( 'Radius', 'wunderpaint' ) }
					value={ opts.radius }
					width={ 48 }
					min={ 0 }
					onChange={ ( v ) => set( 'radius', v ) }
				/>
				{ 'polygon' === opts.shape && (
					<NumberOpt
						label={ __( 'Sides', 'wunderpaint' ) }
						value={ opts.sides }
						width={ 44 }
						min={ 3 }
						max={ 24 }
						onChange={ ( v ) => set( 'sides', Math.max( 3, v ) ) }
					/>
				) }
			</>
		);
	}

	if ( 'fxbrush' === tool ) {
		return (
			<>
				<div className="group">
					<div className="seg">
						<button
							className={
								'blur' === ( opts.mode || 'blur' )
									? 'active'
									: ''
							}
							onClick={ () => set( 'mode', 'blur' ) }
						>
							{ __( 'Blur', 'wunderpaint' ) }
						</button>
						<button
							className={
								'sharpen' === opts.mode ? 'active' : ''
							}
							onClick={ () => set( 'mode', 'sharpen' ) }
						>
							{ __( 'Sharpen', 'wunderpaint' ) }
						</button>
					</div>
				</div>
				<NumberOpt
					label={ __( 'Size', 'wunderpaint' ) }
					value={ opts.size }
					suffix="px"
					min={ 4 }
					max={ 300 }
					onChange={ ( v ) => set( 'size', Math.max( 4, v ) ) }
				/>
				<NumberOpt
					label={ __( 'Strength', 'wunderpaint' ) }
					value={ opts.strength }
					suffix="%"
					min={ 1 }
					max={ 100 }
					onChange={ ( v ) =>
						set( 'strength', Math.min( 100, Math.max( 1, v ) ) )
					}
				/>
				<NumberOpt
					label={ __( 'Hardness', 'wunderpaint' ) }
					value={ opts.hardness }
					suffix="%"
					min={ 0 }
					max={ 100 }
					onChange={ ( v ) => set( 'hardness', v ) }
				/>
			</>
		);
	}

	if ( 'wand' === tool ) {
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
					<span className="label">{ opts.opacity }%</span>
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
		const crop = state.crop;
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Ratio', 'wunderpaint' ) }
					</span>
					<select
						value={ opts.ratio }
						style={ { width: 110 } }
						onChange={ ( e ) => set( 'ratio', e.target.value ) }
					>
						<option value="free">
							{ __( 'Free', 'wunderpaint' ) }
						</option>
						<option value="1:1">1:1</option>
						<option value="4:3">4:3</option>
						<option value="16:9">16:9</option>
						<option value="9:16">9:16</option>
						<option value="3:2">3:2</option>
						<optgroup
							label={ __( 'Social (safe zones)', 'wunderpaint' ) }
						>
							{ SOCIAL_CROPS.map( ( preset ) => (
								<option
									key={ preset.id }
									value={ 'social:' + preset.id }
								>
									{ preset.label }
								</option>
							) ) }
						</optgroup>
					</select>
				</div>
				<div className="group">
					<input
						type="number"
						value={ Math.round( crop?.w ?? state.doc.w ) }
						style={ { width: 54 } }
						onChange={ ( e ) =>
							crop &&
							dispatch( {
								type: 'SET_CROP',
								crop: { ...crop, w: +e.target.value },
							} )
						}
					/>
					<span className="label">×</span>
					<input
						type="number"
						value={ Math.round( crop?.h ?? state.doc.h ) }
						style={ { width: 54 } }
						onChange={ ( e ) =>
							crop &&
							dispatch( {
								type: 'SET_CROP',
								crop: { ...crop, h: +e.target.value },
							} )
						}
					/>
					<span className="label">px</span>
				</div>
				<div className="group">
					<button
						style={ {
							padding: '3px 8px',
							fontSize: 12,
							background: 'var(--accent)',
							color: '#fff',
							borderRadius: 3,
						} }
						onClick={ () => extras.viewApi.current?.applyCrop?.() }
						disabled={ ! crop }
					>
						{ I.check( { size: 12 } ) }{ ' ' }
						{ __( 'Apply', 'wunderpaint' ) }
					</button>
					<button
						style={ { padding: '3px 8px', fontSize: 12 } }
						onClick={ () =>
							dispatch( { type: 'SET_CROP', crop: null } )
						}
						disabled={ ! crop }
					>
						{ __( 'Cancel', 'wunderpaint' ) }
					</button>
				</div>
			</>
		);
	}

	if ( 'gradient' === tool ) {
		return (
			<>
				<GradientPresetPicker opts={ opts } set={ set } />
				<div className="group">
					<span className="label">
						{ __( 'Type', 'wunderpaint' ) }
					</span>
					<div className="seg">
						{ [
							[ 'linear', __( 'Linear', 'wunderpaint' ) ],
							[ 'radial', __( 'Radial', 'wunderpaint' ) ],
							[ 'angle', __( 'Angle', 'wunderpaint' ) ],
						].map( ( [ id, label ] ) => (
							<button
								key={ id }
								className={ opts.kind === id ? 'active' : '' }
								onClick={ () => set( 'kind', id ) }
							>
								{ label }
							</button>
						) ) }
					</div>
				</div>
				<div className="group" style={ { overflow: 'visible' } }>
					<GradientBar
						stops={ opts.stops || [] }
						onChange={ ( stops ) => set( 'stops', stops ) }
						width={ 150 }
					/>
					<button
						className={ opts.reverse ? 'active' : '' }
						style={ { padding: '2px 8px', fontSize: 11 } }
						onClick={ () => set( 'reverse', ! opts.reverse ) }
					>
						{ __( 'Reverse', 'wunderpaint' ) }
					</button>
				</div>
			</>
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
		const up = ( patch, label ) => {
			dispatch( { type: 'UPDATE_LAYER', id: active.id, patch } );
			commit( label || __( 'Edit shape', 'wunderpaint' ) );
		};
		return (
			<>
				<div className="group">
					<span className="label">
						{ __( 'Fill', 'wunderpaint' ) }
					</span>
					<SwatchButton
						size={ 24 }
						color={ active.fill }
						onChange={ ( c ) => up( { fill: c } ) }
					/>
				</div>
				<div className="group">
					<span className="label">
						{ __( 'Stroke', 'wunderpaint' ) }
					</span>
					<SwatchButton
						size={ 24 }
						color={ active.stroke || 'transparent' }
						onChange={ ( c ) => up( { stroke: c } ) }
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
				<div className="group">
					<select
						title={ __( 'Stroke style', 'wunderpaint' ) }
						value={ active.strokeDash || 'solid' }
						style={ { width: 86 } }
						onChange={ ( e ) =>
							up( {
								strokeDash:
									'solid' === e.target.value
										? null
										: e.target.value,
							} )
						}
					>
						<option value="solid">
							{ _x( 'Solid', 'stroke style', 'wunderpaint' ) }
						</option>
						<option value="dashed">
							{ __( 'Dashed', 'wunderpaint' ) }
						</option>
						<option value="dotted">
							{ __( 'Dotted', 'wunderpaint' ) }
						</option>
					</select>
				</div>
				{ 'dashed' === active.strokeDash && (
					<NumberOpt
						label={ __( 'Dash', 'wunderpaint' ) }
						value={ Math.round(
							active.strokeDashLen ??
								dashDefaults( 'dashed', active.strokeW ).len
						) }
						suffix="px"
						min={ 1 }
						width={ 40 }
						onChange={ ( v ) =>
							up( { strokeDashLen: Math.max( 1, v ) } )
						}
					/>
				) }
				{ [ 'dashed', 'dotted' ].includes( active.strokeDash ) && (
					<NumberOpt
						label={ __( 'Gap', 'wunderpaint' ) }
						value={ Math.round(
							active.strokeDashGap ??
								dashDefaults(
									active.strokeDash,
									active.strokeW
								).gap
						) }
						suffix="px"
						min={ 1 }
						width={ 40 }
						onChange={ ( v ) =>
							up( { strokeDashGap: Math.max( 1, v ) } )
						}
					/>
				) }
				<div className="group">
					<span className="label">
						{ __( 'Pattern', 'wunderpaint' ) }
					</span>
					<PatternSelect
						value={ active.pattern }
						patternData={ active.patternData }
						extras={ extras }
						style={ { width: 90 } }
						onChange={ ( pattern, patternData ) =>
							up( { pattern, patternData } )
						}
					/>
				</div>
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
					<span className="label" style={ { width: 34 } }>
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
					{ open === menu.id && (
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
			<div className="ed-tool-opts" ref={ optsRef }>
				<ToolOptions extras={ extras } compact={ compact } />
			</div>
			{ tabsBar }
		</div>
	);
}
