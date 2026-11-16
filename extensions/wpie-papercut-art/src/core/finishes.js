/** Original paper finishes and multi-stop palettes. No downloaded textures. */
export const PAPER_SURFACES = [
	{ id: 'smooth', label: 'Smooth' },
	{ id: 'fibre', label: 'Fibrous' },
	{ id: 'cotton', label: 'Cotton paper' },
	{ id: 'linen', label: 'Linen paper' },
	{ id: 'watercolor', label: 'Watercolor paper' },
	{ id: 'laid', label: 'Laid paper' },
	{ id: 'pearl', label: 'Pearlescent paper' },
	{ id: 'foil', label: 'Metallic foil' },
];

export const FINISH_DEFAULTS = {
	lightY: -70,
	thickness: 28,
	edgeLight: 42,
	sheen: 55,
	textureScale: 45,
};

const palette = ( id, label, colors, bg, glow, paper, extra = {} ) => ( {
	id,
	label,
	colors,
	back: colors[ 0 ],
	front: colors[ colors.length - 1 ],
	bg,
	glow,
	finish: { ...FINISH_DEFAULTS, paper, grain: 48, ...extra },
} );

export const PREMIUM_LOOKS = [
	palette(
		'gallery',
		'Sculpted Ivory',
		[ '#fff5df', '#e9dfc9', '#c9bfad', '#f2e9d8' ],
		[ '#ece3d2', '#c7bba4' ],
		'#fff8e7',
		'cotton',
		{ thickness: 43, edgeLight: 62 }
	),
	palette(
		'terracotta',
		'Terracotta & Blush',
		[ '#f7dfa9', '#eeb47f', '#cf7158', '#904647', '#492b38' ],
		[ '#ead6c0', '#c89b80' ],
		'#fff0c8',
		'watercolor',
		{ thickness: 36 }
	),
	palette(
		'lagoon',
		'Lagoon Layers',
		[ '#def0b5', '#8bc6b6', '#499c9e', '#235e77', '#112d47' ],
		[ '#c3dddb', '#759fae' ],
		'#e9ffdc',
		'cotton'
	),
	palette(
		'copper',
		'Copper & Ink',
		[ '#f1cc8c', '#c78752', '#547d79', '#203f44', '#162d35' ],
		[ '#d9bf9e', '#666756' ],
		'#ffdaa0',
		'linen',
		{ sheen: 74 }
	),
	palette(
		'orchid',
		'Orchid Haze',
		[ '#fff0c9', '#efb8af', '#b684b2', '#775d99', '#342b57' ],
		[ '#e6d5de', '#9a8bb1' ],
		'#fff3dc',
		'pearl',
		{ sheen: 68 }
	),
	palette(
		'gilded',
		'Gilded Graphite',
		[ '#f5e4a9', '#cda452', '#736543', '#343738', '#171e22' ],
		[ '#343331', '#151c20' ],
		'#ffe8a9',
		'smooth',
		{ thickness: 44, edgeLight: 60 }
	),
	palette(
		'pistachio',
		'Pistachio & Petal',
		[ '#fcf0cb', '#d9dba0', '#96b898', '#578480', '#344e5a' ],
		[ '#f2e4d5', '#c4cbb3' ],
		'#fff3d2',
		'laid'
	),
	palette(
		'glacier',
		'Glacier Pearl',
		[ '#f3f7ef', '#bfe5e0', '#8dbccf', '#527ca7', '#293f68' ],
		[ '#dde9ee', '#a1bad0' ],
		'#f0ffff',
		'pearl',
		{ sheen: 78, edgeLight: 58 }
	),
];

export const isPaperSurface = ( id ) =>
	PAPER_SURFACES.some( ( p ) => p.id === id );

/** A light position, rather than a hard-coded downward cast. */
export function paperLight( params ) {
	const x = ( params.lightX ?? 30 ) / 100;
	const y = ( params.lightY ?? FINISH_DEFAULTS.lightY ) / 100;
	const length = Math.hypot( x, y );
	return {
		x,
		y,
		nx: length > 0.001 ? x / length : 0,
		ny: length > 0.001 ? y / length : -1,
	};
}
