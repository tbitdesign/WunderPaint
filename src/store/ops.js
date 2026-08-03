/**
 * Reusable editor operations, shared by menus, shortcuts, panels and
 * context menus (spec 04.2). Each op receives the editor context value
 * `{ state, dispatch, commit, … }` plus an `extras` bag (viewApi, toasts,
 * dialog openers) provided by the EditorScreen.
 *
 * BARREL (v1.338.0). The ops live in ./ops/*.js; this file re-exports them
 * and owns PendingOp. Same shape as src/lib/raster.js, and for the same
 * reason: 29 modules import from here, twelve of them as `import * as Ops`,
 * and not one of those lines had to change.
 *
 * A warning that belongs here rather than in a commit message: with twelve
 * namespace importers, renaming an op is never a local edit. Grep the whole
 * tree, and do not forget the destructured dynamic imports in
 * editor-titlebar.jsx, lib/shortcuts.js and store/effect-ops.js.
 */

import { __, sprintf } from '@wordpress/i18n';

/** Marker error for not-yet-landed ops (must be zero at final gate). */
export class PendingOp extends Error {
	constructor( task ) {
		super(
			sprintf(
				/* translators: %s: internal task id. */ __(
					'This action is not available yet (%s).',
					'wunderpaint'
				),
				task
			)
		);
		this.pending = task;
	}
}

export {
	alignLayersOp,
	bringForwardOp,
	canDistribute,
	copyLayerStyles,
	copyLayers,
	deleteLayers,
	deselectOp,
	distributeLayersOp,
	duplicateLayer,
	featherSelectionOp,
	inverseSelectionOp,
	loadSelectionOp,
	newGroupOp,
	newLayerOp,
	pasteLayerStyles,
	pasteLayers,
	radialRepeat,
	radialRepeatPrompt,
	saveSelectionOp,
	selectAllOp,
	sendBackwardOp,
} from './ops/edit-ops';

export {
	applyPresetFilterOp,
	assignBrandKitOp,
	insertLayerSnapshotOp,
	saveAsTemplateOp,
	saveAssetToLibraryOp,
	updateTemplateOp,
} from './ops/content-ops';

export {
	cropToLayerOp,
	cropToSelectionOp,
	deleteWithinSelectionOp,
	fillSelectionOp,
	flattenOp,
	flipDocOp,
	layerViaCopyOp,
	mergeDownOp,
	openPlaceOp,
	rotateDocOp,
	trimLayerOp,
	trimOp,
} from './ops/document-ops';

export {
	addMaskOp,
	applyMaskOp,
	clippingMaskOp,
	cutOutOp,
	invertMaskOp,
	removeMaskOp,
	toggleMaskOp,
} from './ops/mask-ops';

export {
	applyEffectOp,
	applyLutOp,
	convertToSmartOp,
	downloadProjectOp,
	exportCompsOp,
	exportPsdOp,
	exportSvgOp,
	freeTransformOp,
	importPsdFileOp,
	importPsdOp,
	importSvgOp,
	insertLogoOp,
	insertQrOp,
	openProjectOp,
	placeSvgLayers,
	rasterizeLayerOp,
	saveAsPatternOp,
	ungroupOp,
} from './ops/io-ops';

export {
	addPageOp,
	applyPaletteOp,
	changeBackgroundColorOp,
	convertShapeToPathOp,
	extractColorsOp,
	fitIntoFrameOp,
	insertFrameOp,
	insertTextComboOp,
	newFillLayerOp,
	newTextureLayerOp,
	saveDesignOp,
	shareDesignOp,
	unshareDesignOp,
} from './ops/asset-ops';
