import {
	MOTIFS,
	GLYPH_SETS,
	toSvgTile,
	tileShapes,
	cellElements,
	elementsInTile,
} from '../src/pattern-core.js';
import { renderTile, ensureStamps } from '../src/render.js';
import { makeDesign } from '../src/design.js';
import { PRESETS } from '../src/presets.js';
import { DEFAULTS } from '../src/settings.js';
window.__patternProbe = {
	MOTIFS,
	GLYPH_SETS,
	PRESETS,
	DEFAULTS,
	makeDesign,
	renderTile,
	toSvgTile,
	tileShapes,
	cellElements,
	elementsInTile,
	ensureStamps,
};
