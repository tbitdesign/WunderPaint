/**
 * v3.8 scenes for the new animals, buildings and themes. Same recipe as
 * the collection: authored from back to front, every motif on a sheet of
 * its own so each one stays editable.
 */
const item = ( kind, settings, color = '', paper = '' ) => [
	kind,
	settings,
	color,
	paper,
];
const terrain = ( profile, yBase, height = 22 ) =>
	item( 'terrain', { profile, yBase, y: yBase / 100, height, jag: 45 } );
const tree = ( species, x, y, scale, count = 1, spread = 0 ) =>
	item( 'trees', { species, x, y, scale, count, spread, vary: 18 } );
const plant = ( species, x, y, scale, count = 1, spread = 0, color = '' ) =>
	item( 'plants', { species, x, y, scale, count, spread, vary: 18 }, color );
const decor = ( variant, x, y, scale, stretch = 100, color = '' ) =>
	item( 'decoration', { variant, x, y, scale, stretch, detail: 64 }, color );
const landform = ( variant, x, y, scale, stretch = 100 ) =>
	item( 'landform', { variant, x, y, scale, stretch, detail: 64 } );
const orb = ( variant, x, y, scale ) => item( 'orb', { variant, x, y, scale } );
const cloud = ( x, y, scale ) => item( 'cloud', { x, y, scale } );
const animal = ( species, x, y, scale, flip = false ) =>
	item( 'animal', { species, x, y, scale, flip } );
const flyer = ( species, x, y, scale, flip = false ) =>
	item( 'flyer', { species, x, y, scale, flip } );
const flock = ( species, x, y, count, spread, scale ) =>
	item( 'flock', { species, x, y, count, spread, scale } );
const frame = ( window, inset = 6 ) =>
	item( 'frame', { window, inset, windowAngle: 0, ornament: 60 } );

const scenes = [
	/* ------------------------------- farm ------------------------------ */
	{
		id: 'farmmorning',
		label: 'Farm morning',
		theme: 'farm',
		look: 'pistachio',
		objects: [
			orb( 'sun', 0.8, 0.22, 17 ),
			terrain( 'hills', 62, 18 ),
			tree( 'broadleaf', 0.88, 0.7, 26, 2, 8 ),
			terrain( 'flat', 79, 6 ),
			decor( 'barn', 0.3, 0.82, 34 ),
			animal( 'cow', 0.62, 0.94, 14 ),
			animal( 'sheep', 0.86, 0.95, 10 ),
			animal( 'rooster', 0.1, 0.96, 10 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			frame( 'rect', 5 ),
		],
	},
	{
		id: 'sheepmeadow',
		label: 'Sheep meadow',
		theme: 'farm',
		look: 'lagoon',
		objects: [
			cloud( 0.28, 0.2, 18 ),
			terrain( 'hills', 58, 24 ),
			decor( 'windmill', 0.8, 0.6, 24 ),
			terrain( 'hills', 74, 14 ),
			plant( 'daisy', 0.5, 1.01, 14, 8, 92 ),
			animal( 'sheep', 0.24, 0.9, 13 ),
			animal( 'sheep', 0.5, 0.92, 10, true ),
			animal( 'sheep', 0.73, 0.89, 12 ),
			frame( 'rect', 5 ),
		],
	},
	{
		id: 'harvestfield',
		label: 'Harvest field',
		theme: 'farm',
		look: 'terracotta',
		objects: [
			orb( 'sun', 0.24, 0.3, 22 ),
			terrain( 'hills', 66, 18 ),
			plant( 'sunflower', 0.25, 0.86, 28, 6, 40 ),
			terrain( 'flat', 86, 4 ),
			animal( 'horse', 0.76, 0.9, 19 ),
			decor( 'pumpkin', 0.45, 0.92, 15 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			frame( 'arch', 5 ),
		],
	},
	/* ------------------------------- polar ----------------------------- */
	{
		id: 'arcticfloe',
		label: 'Arctic floe',
		theme: 'polar',
		look: 'glacier',
		paper: 'pearl',
		objects: [
			orb( 'sun', 0.72, 0.26, 15 ),
			terrain( 'ridge', 60, 28 ),
			terrain( 'waves', 74, 6 ),
			terrain( 'flat', 80, 5 ),
			terrain( 'waves', 90, 5 ),
			animal( 'polarbear', 0.42, 0.8, 15 ),
			animal( 'seal', 0.62, 0.81, 9 ),
			frame( 'circle', 5 ),
		],
	},
	{
		id: 'penguincolony',
		label: 'Penguin colony',
		theme: 'polar',
		look: 'glacier',
		paper: 'pearl',
		objects: [
			orb( 'sun', 0.76, 0.25, 15 ),
			flock( 'gullfly', 0.55, 0.3, 3, 30, 5 ),
			terrain( 'ridge', 58, 30 ),
			terrain( 'dunes', 80, 12 ),
			terrain( 'flat', 96, 4 ),
			animal( 'penguin', 0.24, 0.88, 15 ),
			animal( 'penguin', 0.35, 0.9, 12, true ),
			animal( 'penguin', 0.6, 0.87, 14 ),
			animal( 'penguin', 0.71, 0.9, 11, true ),
			frame( 'mountainwindow', 5 ),
		],
	},
	{
		id: 'iglooevening',
		label: 'Igloo evening',
		theme: 'polar',
		look: 'midnight',
		paper: 'pearl',
		objects: [
			decor( 'starfield', 0.5, 0.62, 60, 175 ),
			decor( 'aurora', 0.5, 0.5, 52, 170 ),
			orb( 'moon', 0.72, 0.22, 16 ),
			terrain( 'ridge', 64, 22 ),
			terrain( 'dunes', 80, 10 ),
			decor( 'igloo', 0.36, 0.87, 24, 100, '#e8eef6' ),
			animal( 'polarbear', 0.76, 0.89, 13 ),
			frame( 'arch', 5 ),
		],
	},
	/* ----------------------------- the sea ----------------------------- */
	{
		id: 'kelpforest',
		label: 'Kelp forest',
		theme: 'ocean',
		look: 'lagoon',
		objects: [
			decor( 'bubbles', 0.82, 0.72, 50 ),
			animal( 'shark', 0.5, 0.42, 13 ),
			terrain( 'dunes', 82, 10 ),
			decor( 'kelp', 0.5, 0.92, 52, 170 ),
			animal( 'seahorse', 0.33, 0.72, 16 ),
			terrain( 'dunes', 95, 6 ),
			plant( 'coral', 0.8, 1.01, 24, 3, 20 ),
			frame( 'circle', 5 ),
		],
	},
	{
		id: 'turtlereef',
		label: 'Turtle reef',
		theme: 'ocean',
		look: 'orchid',
		objects: [
			decor( 'bubbles', 0.2, 0.62, 40 ),
			animal( 'jellyfish', 0.76, 0.4, 16 ),
			animal( 'turtle', 0.46, 0.66, 17 ),
			terrain( 'dunes', 86, 10 ),
			plant( 'coral', 0.2, 0.98, 30, 3, 25 ),
			plant( 'coral', 0.8, 1.0, 26, 3, 20 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'octopusgarden',
		label: 'Octopus garden',
		theme: 'ocean',
		look: 'copper',
		objects: [
			animal( 'jellyfish', 0.34, 0.42, 15 ),
			animal( 'jellyfish', 0.41, 0.54, 10 ),
			terrain( 'dunes', 80, 12 ),
			decor( 'kelp', 0.84, 0.88, 40, 80 ),
			animal( 'octopus', 0.5, 0.88, 20 ),
			terrain( 'flat', 96, 4 ),
			plant( 'coral', 0.16, 1.01, 22, 3, 18 ),
			frame( 'octagon', 5 ),
		],
	},
	/* ----------------------------- dinosaurs --------------------------- */
	{
		id: 'dinovalley',
		label: 'Dinosaur valley',
		theme: 'prehistoric',
		look: 'forest',
		objects: [
			orb( 'sun', 0.72, 0.24, 20 ),
			landform( 'volcano', 0.24, 0.7, 30 ),
			terrain( 'hills', 68, 16 ),
			tree( 'palm', 0.86, 0.82, 34, 2, 8 ),
			animal( 'longneck', 0.55, 0.87, 26 ),
			terrain( 'flat', 93, 5 ),
			plant( 'fern', 0.14, 1.01, 26, 3, 20 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'trexcanyon',
		label: 'T. rex canyon',
		theme: 'prehistoric',
		look: 'copper',
		objects: [
			orb( 'sun', 0.5, 0.3, 20 ),
			landform( 'canyon', 0.5, 0.8, 40, 160 ),
			terrain( 'dunes', 84, 10 ),
			animal( 'trex', 0.4, 0.92, 22 ),
			tree( 'banana', 0.86, 0.94, 30 ),
			plant( 'fern', 0.12, 1.01, 22, 3, 16 ),
			frame( 'pointed', 5 ),
		],
	},
	{
		id: 'stegoswamp',
		label: 'Stegosaurus swamp',
		theme: 'prehistoric',
		look: 'pistachio',
		objects: [
			orb( 'sun', 0.25, 0.25, 18 ),
			terrain( 'hills', 64, 16 ),
			tree( 'banana', 0.82, 0.78, 36, 2, 12 ),
			terrain( 'waves', 82, 6 ),
			animal( 'stegosaurus', 0.45, 0.85, 17 ),
			plant( 'fern', 0.12, 1.01, 28, 3, 20 ),
			plant( 'reeds', 0.76, 1.01, 22, 6, 30 ),
			frame( 'organic', 5 ),
		],
	},
	/* ------------------------------- night ----------------------------- */
	{
		id: 'batnight',
		label: 'Bat night',
		theme: 'night',
		look: 'midnight',
		objects: [
			decor( 'starfield', 0.5, 0.62, 60, 175 ),
			orb( 'moon', 0.68, 0.26, 24 ),
			flock( 'bat', 0.58, 0.34, 6, 44, 6 ),
			terrain( 'ridge', 64, 24 ),
			tree( 'oldoak', 0.2, 0.86, 48 ),
			terrain( 'hills', 88, 10 ),
			plant( 'grass', 0.6, 1.01, 18, 8, 70 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'owlmoon',
		label: 'Owl moon',
		theme: 'night',
		look: 'night',
		objects: [
			decor( 'starfield', 0.5, 0.62, 60, 175 ),
			orb( 'moon', 0.6, 0.36, 40 ),
			terrain( 'ridge', 72, 20 ),
			tree( 'conifer', 0.5, 0.84, 28, 8, 92 ),
			terrain( 'hills', 93, 8 ),
			flyer( 'owlfly', 0.6, 0.36, 15 ),
			frame( 'circle', 5 ),
		],
	},
	{
		id: 'hedgehognight',
		label: 'Hedgehog night',
		theme: 'night',
		look: 'noirgold',
		objects: [
			decor( 'starfield', 0.5, 0.6, 60, 175 ),
			orb( 'crescent', 0.26, 0.24, 18 ),
			terrain( 'hills', 70, 16 ),
			plant( 'mushroom', 0.38, 0.85, 20, 4, 22 ),
			animal( 'hedgehog', 0.6, 0.85, 11 ),
			plant( 'fern', 0.88, 1.01, 24, 2, 14 ),
			frame( 'circle', 5 ),
		],
	},
	/* ----------------------------- holidays ---------------------------- */
	{
		id: 'christmaseve',
		label: 'Christmas eve',
		theme: 'festive',
		look: 'noirgold',
		paper: 'pearl',
		objects: [
			decor( 'starfield', 0.5, 0.62, 60, 175 ),
			orb( 'crescent', 0.2, 0.22, 15 ),
			terrain( 'dunes', 72, 14 ),
			decor( 'christmastree', 0.3, 0.88, 34 ),
			decor( 'chapel', 0.68, 0.8, 30 ),
			terrain( 'dunes', 91, 7 ),
			decor( 'snowman', 0.84, 0.9, 18 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'fairground',
		label: 'Fairground',
		theme: 'festive',
		look: 'sunset',
		objects: [
			orb( 'sun', 0.2, 0.28, 18 ),
			flock( 'birdfly', 0.24, 0.42, 3, 24, 4 ),
			decor( 'townhouses', 0.22, 0.86, 26 ),
			decor( 'ferriswheel', 0.64, 0.86, 44 ),
			terrain( 'hills', 90, 6 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'pumpkinpatch',
		label: 'Pumpkin patch',
		theme: 'festive',
		look: 'copper',
		objects: [
			orb( 'moon', 0.72, 0.26, 22 ),
			flock( 'bat', 0.7, 0.32, 4, 30, 5 ),
			terrain( 'hills', 66, 16 ),
			tree( 'wintertree', 0.18, 0.84, 44 ),
			terrain( 'flat', 86, 5 ),
			decor( 'pumpkin', 0.56, 0.9, 26 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'snowmanmeadow',
		label: 'Snowman meadow',
		theme: 'winter',
		look: 'glacier',
		objects: [
			orb( 'sun', 0.24, 0.24, 15 ),
			terrain( 'hills', 64, 18 ),
			tree( 'conifer', 0.8, 0.8, 30, 4, 26 ),
			terrain( 'dunes', 84, 10 ),
			decor( 'snowman', 0.38, 0.86, 24 ),
			animal( 'hare', 0.6, 0.87, 9 ),
			frame( 'oval', 6 ),
		],
	},
	/* -------------------------- towns & castles ------------------------ */
	{
		id: 'moonlitcastle',
		label: 'Moonlit castle',
		theme: 'town',
		look: 'night',
		objects: [
			decor( 'starfield', 0.5, 0.62, 60, 175 ),
			orb( 'crescent', 0.76, 0.22, 18 ),
			terrain( 'ridge', 58, 24 ),
			terrain( 'hills', 80, 12 ),
			decor( 'castle', 0.45, 0.74, 34 ),
			tree( 'conifer', 0.12, 0.93, 30, 3, 14 ),
			animal( 'wolf', 0.8, 0.93, 13 ),
			frame( 'pointed', 5 ),
		],
	},
	{
		id: 'oldtown',
		label: 'Old town canal',
		theme: 'town',
		look: 'vintage',
		objects: [
			orb( 'sun', 0.82, 0.2, 14 ),
			cloud( 0.3, 0.18, 18 ),
			decor( 'townhouses', 0.5, 0.82, 40, 140 ),
			terrain( 'waves', 87, 5 ),
			decor( 'rowboat', 0.36, 0.9, 16, 100, '#7a5238' ),
			flock( 'gullfly', 0.62, 0.3, 3, 26, 4 ),
			frame( 'rect', 5 ),
		],
	},
	{
		id: 'steamvalley',
		label: 'Steam valley',
		theme: 'town',
		look: 'forest',
		objects: [
			orb( 'sun', 0.82, 0.22, 16 ),
			terrain( 'ridge', 56, 30 ),
			terrain( 'hills', 70, 16 ),
			tree( 'conifer', 0.14, 0.8, 24, 5, 24 ),
			terrain( 'flat', 84, 4 ),
			decor( 'steamtrain', 0.56, 0.87, 25, 120 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			frame( 'rect', 5 ),
		],
	},
	{
		id: 'castlehill',
		label: 'Castle on the hill',
		theme: 'town',
		look: 'gilded',
		objects: [
			orb( 'sun', 0.24, 0.24, 18 ),
			terrain( 'hills', 60, 20 ),
			decor( 'castle', 0.64, 0.62, 30 ),
			terrain( 'hills', 78, 12 ),
			decor( 'kite', 0.3, 0.94, 26 ),
			plant( 'flowers', 0.5, 1.01, 14, 8, 92 ),
			frame( 'trefoil', 5 ),
		],
	},
	/* ------------------------------ savanna ---------------------------- */
	{
		id: 'savannasunset',
		label: 'Savanna sunset',
		theme: 'desert',
		look: 'sunset',
		objects: [
			orb( 'sun', 0.42, 0.44, 34 ),
			terrain( 'hills', 68, 8 ),
			tree( 'acacia', 0.82, 0.74, 34 ),
			animal( 'giraffe', 0.22, 0.8, 30 ),
			animal( 'elephant', 0.56, 0.83, 19 ),
			terrain( 'flat', 88, 4 ),
			plant( 'grass', 0.5, 1.01, 18, 12, 95 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'lionrock',
		label: 'Lion country',
		theme: 'desert',
		look: 'terracotta',
		objects: [
			orb( 'sun', 0.76, 0.25, 18 ),
			terrain( 'dunes', 72, 12 ),
			terrain( 'flat', 94, 4 ),
			plant( 'grass', 0.5, 1.01, 18, 10, 92 ),
			animal( 'zebra', 0.6, 0.8, 14 ),
			animal( 'zebra', 0.74, 0.81, 13 ),
			animal( 'lion', 0.3, 0.86, 16 ),
			frame( 'horseshoe', 5 ),
		],
	},
	{
		id: 'desertcaravan',
		label: 'Desert caravan',
		theme: 'desert',
		look: 'copper',
		objects: [
			orb( 'sun', 0.72, 0.3, 24 ),
			terrain( 'dunes', 64, 14 ),
			terrain( 'dunes', 88, 10 ),
			plant( 'agave', 0.84, 1.0, 22, 2, 14 ),
			animal( 'camel', 0.3, 0.68, 10 ),
			animal( 'camel', 0.42, 0.69, 10 ),
			animal( 'camel', 0.54, 0.7, 10 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'wateringhole',
		label: 'Watering hole',
		theme: 'desert',
		look: 'lagoon',
		objects: [
			orb( 'sun', 0.7, 0.24, 16 ),
			terrain( 'hills', 64, 12 ),
			tree( 'baobab', 0.16, 0.78, 40 ),
			terrain( 'waves', 82, 4 ),
			animal( 'rhino', 0.52, 0.86, 13 ),
			animal( 'zebra', 0.72, 0.84, 13, true ),
			plant( 'reeds', 0.5, 1.01, 14, 8, 92 ),
			frame( 'oval', 6 ),
		],
	},
	/* --------------------------- water & garden ------------------------ */
	{
		id: 'flamingolagoon',
		label: 'Flamingo lagoon',
		theme: 'tropical',
		look: 'rose',
		objects: [
			orb( 'sun', 0.24, 0.26, 18 ),
			terrain( 'hills', 66, 12 ),
			tree( 'palm', 0.86, 0.8, 40, 2, 10 ),
			terrain( 'waves', 82, 5 ),
			animal( 'flamingo', 0.3, 0.88, 26 ),
			animal( 'flamingo', 0.45, 0.9, 22, true ),
			animal( 'flamingo', 0.6, 0.89, 24 ),
			plant( 'lotus', 0.84, 1.0, 16, 3, 18 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'swanlake',
		label: 'Swan lake',
		theme: 'garden',
		look: 'glacier',
		objects: [
			terrain( 'hills', 64, 14 ),
			tree( 'willow', 0.2, 0.8, 44 ),
			terrain( 'waves', 82, 6 ),
			plant( 'waterlily', 0.4, 0.99, 14, 4, 40 ),
			plant( 'cattail', 0.9, 1.01, 28, 4, 14 ),
			animal( 'swan', 0.48, 0.85, 12 ),
			animal( 'swan', 0.63, 0.87, 9 ),
			frame( 'oval', 6 ),
		],
	},
	{
		id: 'frogpond',
		label: 'Frog pond',
		theme: 'garden',
		look: 'pistachio',
		objects: [
			terrain( 'hills', 66, 14 ),
			plant( 'iris', 0.18, 0.86, 28, 4, 20 ),
			terrain( 'waves', 84, 5 ),
			plant( 'waterlily', 0.56, 0.9, 18, 3, 30 ),
			animal( 'frog', 0.44, 0.86, 11 ),
			flyer( 'butterfly', 0.72, 0.4, 10 ),
			plant( 'cattail', 0.88, 1.01, 30, 4, 14 ),
			frame( 'leafwindow', 5 ),
		],
	},
];

export const WORLD_SCENE_LABELS = scenes.map( ( { id, label, theme } ) => ( {
	id,
	label,
	theme,
} ) );

export function createWorldPresets( object, layer, lookById ) {
	return scenes.map( ( recipe, index ) => ( {
		id: recipe.id,
		label: recipe.label,
		theme: recipe.theme,
		patch: () => ( {
			...lookById( recipe.look ).finish,
			look: recipe.look,
			frame: 'none',
			photo: { source: 'none' },
			paper:
				recipe.paper ||
				( recipe.theme === 'winter' ? 'pearl' : 'cotton' ),
			lightX: -42,
			lightY: -62,
			shadow: 54,
			soft: 42,
			glow: 18,
			grain: 42,
			detail: 80,
			layers: [
				layer( {
					objects: [ object( 'backdrop', { seed: 9000 + index } ) ],
				} ),
				...recipe.objects.map(
					( [ kind, settings, color, paper ], n ) =>
						layer( {
							color,
							paper,
							elevation: 80 + n * 3,
							objects: [
								object( kind, {
									...settings,
									seed: 9100 + index * 50 + n,
								} ),
							],
						} )
				),
			],
		} ),
	} ) );
}
