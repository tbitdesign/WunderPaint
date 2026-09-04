/**
 * The paint kit: the editor's brush and media engines as one object, for
 * bridge.paint (API 2.21). Kept apart from pro-bridge.js so it can be
 * tested on its own - the bridge pulls in workers with import.meta, which
 * jest cannot parse, and a kit that cannot be tested would drift.
 */

import {
	BRUSH_TIPS,
	TIP_GROUPS,
	groupedTips,
	getTip,
	isStampTip,
	listDrawnTips,
	tipSettings,
	resamplePts,
	stampMaxReach,
	pathIsShaped,
	stampTipStroke,
} from './brush-tips';
import { MEDIA_TIPS, STYLE_BRUSHES, mediaMask } from './media-tips';
import { drawStrokePaths, drawSoftRoundStroke } from './raster/styles';
import {
	PAINT_STYLES,
	getStyle,
	applyPaintStyle,
	loadAt,
	styleMaxSpread,
	styleIsPlain,
} from './paint-engine';
import { makeMixer, hexToLinear } from './spectral';
import { jitterColour, DEFAULT_JITTER } from './colour-jitter';
import { pulledString } from './stroke-smoothing';
import { tiltFactors } from './pen-dynamics';
import { tipMask } from './tip-mask';
import {
	FAMILY_OF,
	PAPERS,
	WET_STYLES,
	WET_TUNING_DEFS,
	WET_STYLE_IDS,
	tuned,
	pigmentOf,
} from './wet-styles';
import {
	createWetSurfaceGL,
	wetGlAvailable,
	WET_GL_SC,
} from './wet-surface-gl';
import { createWetPasteGL } from './wet-paste-gl';
import { createWetDryGL } from './wet-dry-gl';

export const paintKit = {
	tips: {
		BRUSH_TIPS,
		MEDIA_TIPS,
		TIP_GROUPS,
		STYLE_BRUSHES,
		groupedTips,
		getTip,
		isStampTip,
		listDrawnTips,
		tipSettings,
		resamplePts,
		stampMaxReach,
		pathIsShaped,
		mediaMask,
		tipMask,
	},
	/** One path with any tip into any 2D context, as the brush draws its draft. */
	drawStroke: ( ctx, path, hardness = 100 ) =>
		drawStrokePaths( ctx, { paths: [ path ], hardness } ),
	stampTipStroke,
	drawSoftRoundStroke,
	styles: {
		PAINT_STYLES,
		getStyle,
		applyPaintStyle,
		loadAt,
		styleMaxSpread,
		styleIsPlain,
	},
	pigment: { makeMixer, hexToLinear, jitterColour, DEFAULT_JITTER },
	wet: {
		available: wetGlAvailable,
		SC: WET_GL_SC,
		FAMILY_OF,
		PAPERS,
		WET_STYLES,
		WET_TUNING_DEFS,
		WET_STYLE_IDS,
		tuned,
		pigmentOf,
		createLiquid: createWetSurfaceGL,
		createPaste: createWetPasteGL,
		createDry: createWetDryGL,
	},
	hand: { pulledString, tiltFactors },
};
