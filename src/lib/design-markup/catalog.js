import { dynamicShapeIds, dynamicDefaults } from '../shape-dynamics';
import { TEXT_BINDINGS, IMAGE_BINDINGS } from '../dynamic-content';

export const KINDS = [
	'background',
	'photo',
	'text',
	'shape',
	'component',
	'group',
];
export const VOICES = [
	'eyebrow',
	'hero',
	'sub',
	'detail',
	'cta',
	'quote',
	'stat',
];
export const MOODS = [
	'warm',
	'cool',
	'earthy',
	'vibrant',
	'pastel',
	'dark',
	'mono',
];
export const IMAGERY = [
	'none',
	'photo-hero',
	'photo-cutout',
	'photo-texture',
	'illustration',
	'pattern',
];
export const BG_STYLES = [
	'solid',
	'gradient',
	'mesh',
	'organic',
	'geo',
	'poly',
	'topo',
	'halftone',
	'rings',
	'confetti',
];
export const PALETTE_ROLES = [
	'bg',
	'surface',
	'ink',
	'muted',
	'accent',
	'accent2',
	'onAccent',
];
export const PALETTE_SOURCES = [ 'brand', 'intent', 'custom' ];
export const ROLES = [ 'hero', 'support', 'decor', 'frame', 'scrim' ];
export const BLENDS = [
	'normal',
	'multiply',
	'screen',
	'overlay',
	'soft-light',
	'hard-light',
	'color-dodge',
	'color-burn',
	'darken',
	'lighten',
	'difference',
	'exclusion',
	'hue',
	'saturation',
	'color',
	'luminosity',
];
export const ANCHORS = [ 'tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br' ];
export const SIDES = [ 'above', 'below', 'left', 'right' ];
export const FITS = [ 'fluid', 'fixed' ];
export const PHOTO_FITS = [ 'cover', 'contain' ];
export const STACK_DIRS = [ 'col', 'row' ];
export const STACK_ALIGNS = [ 'start', 'center', 'end' ];
export const EMPH_RULES = [ 'salient', 'number', 'longest', 'word' ];
export const EMPH_STYLES = [ 'accent', 'italic' ];
export const ASSET_KINDS = [ 'stock', 'ai', 'media', 'logo', 'placeholder' ];
export const ORIENTATIONS = [ 'landscape', 'portrait', 'square' ];
export const TEXT_ALIGNS = [ 'left', 'center', 'right' ];
export const BG_DIRECTIONS = [ 'down', 'right', 'diag' ];
export const PHOTO_INSTANCES = [ 'full', 'cutout' ];
export const SCRIM_FROM = [ 't', 'b', 'l', 'r' ];
export const SIZE_KEYWORDS = [ 'fill', 'match', 'auto' ];
/**
 * Die Felder, die ein Ebenenstil kennt. Sie standen bis Stufe 2b als
 * ausgeschriebene Teilschemata im Antwortschema (8 Stile x 7 Felder = 56
 * Teilschemata) - für eine Sache, die fast kein Entwurf benutzt, und
 * Schemagröße ist bei Gemini die Grenze zwischen "antwortet" und "502".
 * Jetzt ist `styles` im Schema ein schlichtes Objekt, und diese Namen
 * stehen im Prompt.
 */
export const LAYER_STYLE_FIELDS = [
	'color',
	'opacity',
	'blur',
	'distance',
	'angle',
	'spread',
	'size',
];
export const LAYER_STYLES = [
	'dropShadow',
	'innerShadow',
	'outerGlow',
	'innerGlow',
	'bevel',
	'stroke',
	'satin',
	'longShadow',
];

/** Photo treatments -> effect ids and parameter defaults of src/lib/effects.js. */
export const TREATS = {
	duotone: {
		fx: 'duotone',
		params: { shadow: 'bg', highlight: 'accent' },
		colors: [ 'shadow', 'highlight' ],
	},
	halftone: { fx: 'halftone', params: { cell: 8, angle: 45 }, colors: [] },
	grain: {
		fx: 'add-noise',
		params: { amount: 12, size: 1, monochrome: true },
		colors: [],
	},
	blur: { fx: 'gaussian-blur', params: { radius: 4 }, colors: [] },
	vignette: {
		fx: 'vignette',
		params: { amount: 40, size: 55, softness: 50 },
		colors: [],
	},
};

/**
 * Component types and their typed props (defaults). The key set IS the
 * per-type props whitelist in `clean.js`, so a prop listed here is a promise
 * the builder keeps.
 *
 * The scrim deliberately has no `color`: `scrimLayer()` (design-composer.js)
 * builds a black-to-transparent ramp and takes only a direction and a
 * strength, so a `color` here would be advertised and silently dropped.
 * A PHOTO element's own `scrim.color` is a different field (elements/
 * photo.js) and stays.
 */
export const COMPONENTS = {
	button: { label: 'Learn more', pill: true, arrow: true, maxW: 'fill' },
	chip: { label: 'NEW', tilt: 0 },
	scrim: { from: 'b', strength: 0.6, height: 0.5 },
};

/**
 * Zeilen-Budget je Stimme für einen GEBUNDENEN Text: die Obergrenze, bis zu
 * der ein echter Beitragswert wachsen darf, bevor die Prüfung `lines`
 * meldet.
 *
 * Der Autor entwirft mit einem Beispiel ("Midnight Run Collection", 23
 * Zeichen) und setzt `lines` danach. Ein echter WordPress-Auszug ist
 * schnell das Zehnfache; in einem Kasten für zwei Zeilen schrumpft der
 * Fluid-Fit ihn dann unter die Lesbarkeitsgrenze und `min-size` (ohne
 * Reparatur in Stufe 1) verwirft den ganzen Entwurf. Deshalb bekommt ein
 * gebundener Text nicht den Kasten des Beispiels, sondern den seines
 * Budgets - der Stapel schrumpft dafür (`stack.shrink`), und wenn selbst
 * das nicht reicht, wird abgelehnt wie zuvor.
 *
 * Die Zahlen sind Typografie, nicht Technik: eine Schlagzeile über drei
 * Zeilen liest sich noch als Schlagzeile, ein Eyebrow, ein Knopf-Etikett
 * und eine Kennzahl sind einzeilig oder sie sind etwas anderes.
 */
export const BOUND_MAX_LINES = {
	hero: 3,
	quote: 4,
	sub: 4,
	detail: 5,
	eyebrow: 1,
	cta: 1,
	stat: 1,
};

/**
 * Die Zeilenzahl, gegen die ein Element gemessen und geprüft wird: für
 * einen gebundenen Text das Budget seiner Stimme (nie weniger, als der
 * Autor ohnehin erlaubt hat), sonst genau `el.lines`.
 *
 * @param {Object} el Markup-Element.
 * @return {number} Zeilenzahl für Kastenhöhe und `lines`-Prüfung.
 */
export function maxLinesFor( el ) {
	const lines = el?.lines || 1;
	if ( ! el?.bind?.id ) {
		return lines;
	}
	return Math.max( lines, BOUND_MAX_LINES[ el.voice ] || 0 );
}

export const LIMITS = {
	elements: 24,
	photos: 3,
	texts: 6,
	heroes: 2,
	depth: 3,
	layers: 60,
	lines: 6,
	rotFree: 15,
	rotMax: 45,
};

export const BIND_TEXT = TEXT_BINDINGS.map( ( b ) => b.id ).filter(
	( id ) => 'ai.background' !== id
);
export const BIND_IMAGE = IMAGE_BINDINGS.map( ( b ) => b.id );

export const STATIC_SHAPES = [ 'rect', 'ellipse' ];
export function shapeFamilies() {
	return [ ...STATIC_SHAPES, ...dynamicShapeIds() ];
}

/**
 * Die Regler einer Formfamilie, in der Reihenfolge der Registry (die
 * wichtigsten zuerst).
 *
 * Sie stehen im PROMPT, nicht im Schema. Der Weg dahin war lang genug, um
 * ihn aufzuschreiben: als freies Objekt (`additionalProperties: true`) kam
 * `params` nicht beim Modell an, weil `gemini_schema()` das Feld entfernt
 * und ein OBJECT ohne Eigenschaften eine Kiste ist, in die niemand etwas
 * legen kann (Stufe 2a: `"params": []`). Als benannte Vereinigung ALLER
 * 160 Regler kam es auch nicht an - damit lehnte Gemini das ganze Schema
 * ab ("Request contains an invalid argument", Stufe 2b). Also: im Schema
 * ein schlichtes Objekt, und die Regler als Wortschatz in den Prompt.
 *
 * @param {string} id Formfamilie.
 * @return {string[]} Reglernamen (leer bei den statischen Formen).
 */
export function shapeDialsFor( id ) {
	return Object.keys( dynamicDefaults( id ) );
}

/**
 * Die Formfamilien, die dem MODELL angeboten werden - 40 von 115.
 *
 * Warum eine Auswahl: die Aufzählung steht zweimal im Antwortschema
 * (`shape.family`, `photo.maskShape.family`), und Gemini lehnt ein zu
 * grosses `responseSchema` als Ganzes ab. 115 Familien waren mit ein Grund
 * dafür; 40 sind gemessen angenommen worden.
 *
 * Warum GENAU diese: es sind die Formen, die ein Plakat wirklich braucht -
 * Grundformen und Rahmen, Abzeichen und Etiketten, Zeiger, organische
 * Formen, ein paar Felder für Dekor. Die 75 übrigen (Fraktale,
 * Harmonographen, Voronoi, Sierpinski …) sind Kunstwerkzeuge, keine
 * Layout-Bausteine; `cleanMarkup` nimmt sie weiterhin an, wenn sie von
 * Hand oder aus einer Vorlage kommen.
 */
export const MODEL_FAMILIES = [
	// Grundformen und Rahmen
	'rect',
	'ellipse',
	'squircle',
	'triangle',
	'diamond',
	'parallelogram',
	'frame',
	'polyframe',
	'arch',
	'ring',
	// Organisches
	'blob',
	'blobgen',
	'wave',
	'cloud',
	'crescent',
	'sun',
	'leaf',
	'drop',
	'heart',
	'flower',
	// Zeichen und Zeiger
	'spiral',
	'burst',
	'starpoly',
	'rays',
	'arrow',
	'arcarrow',
	'chevron',
	'ticket',
	'tag',
	'label',
	// Abzeichen, Bänder, Felder
	'ribbon',
	'flag',
	'seal',
	'shield',
	'speech',
	'divider',
	'cornerband',
	'stripes',
	'scatter',
	'halftone',
];
