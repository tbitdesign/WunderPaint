/**
 * Editor constants, reproduced verbatim from the prototype / spec 02.4.
 */
import { __, _x } from '@wordpress/i18n';

import {
	SYSTEM_FONTS,
	LOCAL_FONTS,
	ALL_FONT_FAMILIES,
} from '../lib/font-manager';
import { DEFAULT_STOPS } from '../lib/colour-ramp';
import { DEFAULT_JITTER } from '../lib/colour-jitter';

export const PRESETS = [
	{
		group: _x( 'Social', 'preset group', 'wunderpaint' ),
		items: [
			{
				id: 'ig-square',
				label: __( 'Instagram Square', 'wunderpaint' ),
				w: 1080,
				h: 1080,
			},
			{
				id: 'ig-story',
				label: __( 'Instagram Story', 'wunderpaint' ),
				w: 1080,
				h: 1920,
			},
			{
				id: 'og',
				label: __( 'OG / Social Share', 'wunderpaint' ),
				w: 1200,
				h: 630,
			},
		],
	},
	{
		group: _x( 'Web', 'preset group', 'wunderpaint' ),
		items: [
			{
				id: 'fhd',
				label: __( 'Full HD', 'wunderpaint' ),
				w: 1920,
				h: 1080,
			},
			{
				id: 'banner',
				label: __( 'Header / Banner', 'wunderpaint' ),
				w: 1500,
				h: 500,
			},
			{
				id: '800',
				label: __( 'Standard', 'wunderpaint' ),
				w: 800,
				h: 600,
			},
		],
	},
	{
		group: _x( 'Custom', 'preset group', 'wunderpaint' ),
		items: [
			{
				id: 'custom',
				label: __( 'Custom Size', 'wunderpaint' ),
				w: 1200,
				h: 800,
			},
		],
	},
];

export const BLEND_MODES = [
	'normal',
	'multiply',
	'screen',
	'overlay',
	'darken',
	'lighten',
	'color-dodge',
	'color-burn',
	'hard-light',
	'soft-light',
	'difference',
	'exclusion',
	'hue',
	'saturation',
	'color',
	'luminosity',
];

/**
 * Display names for the blend modes.
 *
 * BLEND_MODES itself has to stay the raw CSS values: they go straight into
 * globalCompositeOperation and into the PSD mapping. These are only what the
 * user reads, and without them the panel showed "soft light" in every language.
 */
export const BLEND_MODE_LABELS = {
	normal: _x( 'Normal', 'blend mode', 'wunderpaint' ),
	multiply: _x( 'Multiply', 'blend mode', 'wunderpaint' ),
	screen: _x( 'Screen', 'blend mode', 'wunderpaint' ),
	overlay: _x( 'Overlay', 'blend mode', 'wunderpaint' ),
	darken: _x( 'Darken', 'blend mode', 'wunderpaint' ),
	lighten: _x( 'Lighten', 'blend mode', 'wunderpaint' ),
	'color-dodge': _x( 'Color Dodge', 'blend mode', 'wunderpaint' ),
	'color-burn': _x( 'Color Burn', 'blend mode', 'wunderpaint' ),
	'hard-light': _x( 'Hard Light', 'blend mode', 'wunderpaint' ),
	'soft-light': _x( 'Soft Light', 'blend mode', 'wunderpaint' ),
	difference: _x( 'Difference', 'blend mode', 'wunderpaint' ),
	exclusion: _x( 'Exclusion', 'blend mode', 'wunderpaint' ),
	hue: _x( 'Hue', 'blend mode', 'wunderpaint' ),
	saturation: _x( 'Saturation', 'blend mode', 'wunderpaint' ),
	color: _x( 'Color', 'blend mode', 'wunderpaint' ),
	luminosity: _x( 'Luminosity', 'blend mode', 'wunderpaint' ),
};

export const FILTERS = [
	{ id: 'none', label: __( 'Original', 'wunderpaint' ), css: 'none' },
	{ id: 'mono', label: __( 'B&W', 'wunderpaint' ), css: 'grayscale(1)' },
	{
		id: 'sepia',
		label: __( 'Sepia', 'wunderpaint' ),
		css: 'sepia(.8) contrast(1.05)',
	},
	{
		id: 'warm',
		label: __( 'Warm', 'wunderpaint' ),
		css: 'saturate(1.3) hue-rotate(-10deg) brightness(1.05)',
	},
	{
		id: 'cool',
		label: __( 'Cool', 'wunderpaint' ),
		css: 'saturate(1.2) hue-rotate(15deg) brightness(.98)',
	},
	{
		id: 'vibrant',
		label: __( 'Vibrant', 'wunderpaint' ),
		css: 'saturate(1.6) contrast(1.1)',
	},
	{
		id: 'faded',
		label: __( 'Faded', 'wunderpaint' ),
		css: 'saturate(.75) contrast(.9) brightness(1.08)',
	},
	{
		id: 'vintage',
		label: __( 'Vintage', 'wunderpaint' ),
		css: 'sepia(.4) saturate(.8) contrast(1.1) hue-rotate(-8deg)',
	},
	{
		id: 'noir',
		label: __( 'Noir', 'wunderpaint' ),
		css: 'grayscale(1) contrast(1.4) brightness(.9)',
	},
	{
		id: 'punch',
		label: __( 'Punch', 'wunderpaint' ),
		css: 'contrast(1.25) saturate(1.35) brightness(1.02)',
	},
	{
		id: 'meadow',
		label: __( 'Meadow', 'wunderpaint' ),
		css: 'saturate(1.15) hue-rotate(18deg) contrast(1.05) brightness(1.04)',
	},
	{
		id: 'dusk',
		label: __( 'Dusk', 'wunderpaint' ),
		css: 'saturate(.85) hue-rotate(-18deg) contrast(1.12) brightness(.92)',
	},
	{
		id: 'sunbleach',
		label: __( 'Sunbleach', 'wunderpaint' ),
		css: 'saturate(.65) contrast(.85) brightness(1.18) sepia(.15)',
	},
	{
		id: 'arctic',
		label: __( 'Arctic', 'wunderpaint' ),
		css: 'saturate(.9) hue-rotate(25deg) brightness(1.08) contrast(1.02)',
	},
	{
		id: 'cocoa',
		label: __( 'Cocoa', 'wunderpaint' ),
		css: 'sepia(.55) saturate(1.15) contrast(1.08) brightness(.96)',
	},
	{
		id: 'neon',
		label: __( 'Neon', 'wunderpaint' ),
		css: 'saturate(1.9) contrast(1.2) brightness(1.05) hue-rotate(-8deg)',
	},
	{
		id: 'mist',
		label: __( 'Mist', 'wunderpaint' ),
		css: 'saturate(.7) brightness(1.1) contrast(.82)',
	},
	{
		id: 'cinema',
		label: __( 'Cinema', 'wunderpaint' ),
		css: 'contrast(1.2) saturate(1.12) brightness(.95) hue-rotate(12deg) sepia(.1)',
	},
];

// Greyscale (dark → light) first, then colours ordered by hue (v1.37).
export const SWATCHES = [
	'#000000',
	'#1a1d21',
	'#3c434a',
	'#787c82',
	'#c3c4c7',
	'#dcdcde',
	'#f0f0f1',
	'#ffffff',
	'#d63638',
	'#f97316',
	'#dba617',
	'#eab308',
	'#00a32a',
	'#22c55e',
	'#06b6d4',
	'#2271b1',
	'#3b66ff',
	'#6366f1',
	'#8b5cf6',
	'#ec4899',
];

/**
 * Canonical tool list (spec 02.4), source of truth for EditorState.tool,
 * toolOpts and the shortcut map. `icon` keys into icons.jsx I{}.
 */
export const TOOLS = [
	{
		id: 'move',
		label: __( 'Move', 'wunderpaint' ),
		kbd: 'V',
		icon: 'move',
	},
	{
		id: 'select',
		label: __( 'Select', 'wunderpaint' ),
		kbd: 'O',
		icon: 'cursor',
	},
	{
		id: 'marquee',
		label: __( 'Rectangular Marquee', 'wunderpaint' ),
		kbd: 'M',
		icon: 'marquee',
	},
	{
		id: 'lasso',
		label: __( 'Lasso Select', 'wunderpaint' ),
		kbd: 'L',
		icon: 'lasso',
	},
	{
		id: 'wand',
		label: __( 'Magic Wand', 'wunderpaint' ),
		kbd: 'W',
		icon: 'wand',
	},
	{
		id: 'crop',
		label: __( 'Crop', 'wunderpaint' ),
		kbd: 'C',
		icon: 'crop',
	},
	{
		id: 'brush',
		label: __( 'Brush', 'wunderpaint' ),
		kbd: 'B',
		icon: 'brush',
	},
	{
		id: 'pencil',
		label: __( 'Pencil', 'wunderpaint' ),
		kbd: 'N',
		icon: 'pencil',
	},
	{
		id: 'eraser',
		label: __( 'Eraser', 'wunderpaint' ),
		kbd: 'E',
		icon: 'eraser',
	},
	{
		id: 'bucket',
		label: __( 'Paint Bucket', 'wunderpaint' ),
		kbd: 'G',
		icon: 'bucket',
	},
	{
		id: 'gradient',
		label: __( 'Gradient', 'wunderpaint' ),
		kbd: 'D',
		icon: 'gradient',
	},
	{
		id: 'stamp',
		label: __( 'Clone Stamp', 'wunderpaint' ),
		kbd: 'S',
		icon: 'stamp',
	},
	{
		id: 'fxbrush',
		label: __( 'Blur/Sharpen Brush', 'wunderpaint' ),
		kbd: 'R',
		icon: 'fxbrush',
	},
	{
		id: 'text',
		label: __( 'Text', 'wunderpaint' ),
		kbd: 'T',
		icon: 'text',
	},
	{
		id: 'shape',
		label: __( 'Shape', 'wunderpaint' ),
		kbd: 'U',
		icon: 'shape',
	},
	{
		id: 'pen',
		label: __( 'Pen Tool', 'wunderpaint' ),
		kbd: 'P',
		icon: 'pen',
	},
	{
		id: 'eyedropper',
		label: __( 'Eyedropper', 'wunderpaint' ),
		kbd: 'I',
		icon: 'eyedropper',
	},
	{
		id: 'hand',
		label: __( 'Hand', 'wunderpaint' ),
		kbd: 'H',
		icon: 'hand',
	},
	{
		id: 'zoom',
		label: __( 'Zoom', 'wunderpaint' ),
		kbd: 'Z',
		icon: 'zoom',
	},
	{
		id: 'smartselect',
		label: __( 'Smart Select', 'wunderpaint' ),
		kbd: 'K',
		icon: 'smartselect',
	},
];

/** Toolbar layout: tool ids with separators between groups (spec 04.3). */
export const TOOLBAR_GROUPS = [
	[
		'move',
		'select',
		'text',
		'marquee',
		'lasso',
		'wand',
		'smartselect',
		'crop',
	],
	[ 'brush', 'pencil', 'eraser', 'bucket', 'gradient', 'stamp', 'fxbrush' ],
	[ 'shape', 'pen' ],
	[ 'eyedropper', 'hand', 'zoom' ],
];

/**
 * Fonts offered by the text tool (spec 02.4). Every family is self-hosted
 * (v1.26.0); nothing is loaded from a CDN.
 */
export const FONT_LIST = [ ...ALL_FONT_FAMILIES ];
export const FONT_GROUPS = [
	{ label: __( 'System fonts', 'wunderpaint' ), fonts: SYSTEM_FONTS },
	{
		label: __( 'Editor fonts', 'wunderpaint' ),
		fonts: Object.keys( LOCAL_FONTS ).sort( ( a, b ) =>
			a.localeCompare( b )
		),
	},
];
export const FONT_WEIGHTS = [ 300, 400, 500, 600, 700, 800, 900 ];

/** Default per-tool options (spec 04.2). */
export const DEFAULT_TOOL_OPTS = {
	brush: {
		size: 24,
		opacity: 100,
		flow: 80,
		hardness: 85,
		// The pulled string (stroke smoothing), 0-100. 20 rounds hand
		// jitter without feeling laggy; 0 is raw input.
		smoothing: 20,
		mirror: 'off',
		tip: 'round',
		// Per-style dials of the wet island, keyed by style id; the
		// meanings differ per medium (oil has open time, charcoal has
		// tooth). Defaults live in the controller's WET_TUNING_DEFS.
		wetTuning: {},
		// Where a finished stroke goes (Pinsel-Neubau Stufe 1).
		// 'single'    - into the ACTIVE layer's pixels, the way every other
		//               editor does it. A portrait used to end up with one
		//               layer per stroke, which is nobody's idea of a
		//               layer stack.
		// 'perStroke' - one stroke layer per stroke, as before. Kept
		//               because a stroke layer can still be recoloured
		//               afterwards, which pixels cannot.
		layerMode: 'single',
		// How the finished stroke meets the pixels underneath
		// (src/lib/paint-engine.js). 'normal' is plain alpha, the rest mix
		// pigment - blue over yellow becomes green - and add the things
		// that make a medium recognisable: the paint running out, the dark
		// rim of a drying wash, grain settling in the paper.
		paintStyle: 'normal',
		// How a stamped mark gets its colour. 'solid' is the picked
		// colour, 'jitter' scatters around it (src/lib/colour-jitter.js),
		// 'gradient' reads a ramp along the stroke (src/lib/colour-ramp.js).
		// One at a time, because they are three answers to one question.
		colorMode: 'solid',
		// Amounts that already do something, so picking "Jitter" is enough
		// on its own - see the note on DEFAULT_JITTER. They cost nothing
		// while the mode is 'solid', which is where the brush starts.
		...DEFAULT_JITTER,
		// Same stop format as the gradient tool, so the same editor bar
		// serves both - and, like the gradient tool two blocks down, a real
		// ramp from the start rather than `null`. Switching the mode to
		// "Gradient" has to paint a gradient on the very next stroke; with
		// nothing here it painted solid until a handle was moved.
		gradientStops: DEFAULT_STOPS,
		// How often the ramp runs over one stroke. It ping-pongs, so a
		// repeat has no seam.
		gradientCycles: 1,
		// Overrides of the chosen tip's own numbers. `null` means "whatever
		// the tip says" - the 37 tips carry sensible values and most people
		// never touch these, but until now nobody COULD.
		// Spacing starts at 0 (= densest; both stroke renderers floor the
		// step at 2% of the size, so 0 is a smooth continuous stroke, not
		// a runaway). The tip's own 0.18 stays one Reset away.
		spacing: 0,
		scatter: null,
		alphaJitter: null,
		sizeJitter: null,
	},
	// Photoshop parity (v1.129.0): the pencil IS the hard tip - no
	// hardness, no flow. Both live on brush/eraser only.
	pencil: {
		size: 2,
		opacity: 100,
		smoothing: 20,
		mirror: 'off',
		layerMode: 'single',
		paintStyle: 'normal',
	},
	eraser: {
		size: 32,
		opacity: 100,
		smoothing: 10,
		flow: 100,
		hardness: 100,
		mirror: 'off',
		// The same tip table the brush uses. Erasing through a texture is
		// a technique, not a curiosity, and the eraser is the only paint
		// tool that could not do it.
		tip: 'round',
		// And the same four overrides, for the same reason. The renderer
		// never cared which tool sent the stroke - it took these off the
		// path and the eraser simply never put them there, so a textured
		// eraser was stuck with its tip's shipped numbers while the brush
		// holding the SAME tip could be tuned. The panel needs no branch:
		// its "Tip shape" section appears as soon as the keys exist.
		//
		// Colour jitter deliberately stays out. The eraser carries no
		// colour, so hue/saturation/brightness would be four sliders that
		// move nothing.
		spacing: null,
		scatter: null,
		alphaJitter: null,
		sizeJitter: null,
	},
	bucket: { tolerance: 32, contiguous: true, opacity: 100 },
	gradient: {
		kind: 'linear',
		reverse: false,
		stops: [
			{ color: '#3b66ff', at: 0 },
			{ color: 'rgba(59,102,255,0)', at: 1 },
		],
	},
	text: {
		fontFamily: 'Inter',
		weight: 700,
		fontSize: 48,
		italic: false,
		// New text starts centered + vertically middled (v1.229): the common
		// case for headings/badges; body copy can still switch to left/top.
		align: 'center',
		letterSpacing: 0,
		lineHeight: 1.05,
		curve: 0,
	},
	shape: {
		shape: 'rect',
		stroke: null,
		strokeW: 0,
		radius: 0,
		sides: 6,
		pattern: 'none',
	},
	// Clone stamp never used flow - dropped so no dead slider shows.
	stamp: { size: 40, opacity: 100, hardness: 80, source: null },
	fxbrush: { mode: 'blur', size: 40, strength: 50, hardness: 60 },
	crop: { ratio: 'free' },
	zoom: {},
	move: {},
	marquee: {},
	lasso: {},
	wand: { tolerance: 32, contiguous: true },
	pen: {},
	eyedropper: {},
	hand: {},
};

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 8;
export const HISTORY_CAP = 100;
