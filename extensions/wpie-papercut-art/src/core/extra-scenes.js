/** Hand-composed scenes. Recipes contain no IDs; each selection creates fresh editable objects. */
const terrain = ( profile, yBase, height = 24 ) => ( {
	kind: 'terrain',
	profile,
	yBase,
	y: yBase / 100,
	height,
	jag: 65,
} );
const land = ( variant, x, y, scale = 50, stretch = 110 ) => ( {
	kind: 'landform',
	variant,
	x,
	y,
	scale,
	stretch,
	detail: 45,
} );
const decor = ( variant, x, y, scale = 30, stretch = 100 ) => ( {
	kind: 'decoration',
	variant,
	x,
	y,
	scale,
	stretch,
	detail: 45,
} );
const tree = ( species, x, y, scale = 36, count = 1, spread = 0 ) => ( {
	kind: 'trees',
	species,
	x,
	y,
	scale,
	count,
	spread,
	vary: 25,
} );
const plant = ( species, x, y, scale = 19, count = 3, spread = 25 ) => ( {
	kind: 'plants',
	species,
	x,
	y,
	scale,
	count,
	spread,
	vary: 32,
} );
const orb = ( variant, x, y, scale = 18 ) => ( {
	kind: 'orb',
	variant,
	x,
	y,
	scale,
} );
const frame = ( window ) => ( { kind: 'frame', window, inset: 6 } );
const branch = ( corner, reach = 60 ) => ( {
	kind: 'branch',
	corner,
	reach,
	scale: 50,
} );
const scenes = [
	{
		id: 'ferngorge',
		label: 'Fern gorge',
		theme: 'woodland',
		look: 'forest',
		sheets: [
			[ terrain( 'hills', 57, 25 ) ],
			[ tree( 'broadleaf', 0.5, 0.69, 30, 7, 100 ) ],
			[ land( 'canyon', 0.5, 1, 66, 125 ) ],
			[ land( 'riverbend', 0.49, 1, 53, 70 ) ],
			[ tree( 'oldoak', 0.09, 1, 74 ), tree( 'oldoak', 0.96, 1, 66 ) ],
			[
				plant( 'fern', 0.19, 0.99, 24, 4, 32 ),
				plant( 'fern', 0.84, 0.98, 22, 4, 29 ),
			],
		],
	},
	{
		id: 'birchpath',
		label: 'Birch path',
		theme: 'woodland',
		look: 'lightbox',
		sheets: [
			[ terrain( 'hills', 61, 23 ) ],
			[ tree( 'birch', 0.5, 0.76, 28, 9, 95 ) ],
			[ terrain( 'hills', 82, 18 ) ],
			[ land( 'riverbend', 0.5, 1, 45, 95 ) ],
			[
				tree( 'birch', 0.19, 1, 71, 3, 25 ),
				tree( 'birch', 0.83, 1, 66, 3, 25 ),
			],
			[
				plant( 'daisy', 0.25, 0.98, 14, 5, 28 ),
				plant( 'grass', 0.82, 1, 12, 12, 28 ),
			],
		],
	},
	{
		id: 'mushroomglade',
		label: 'Mushroom glade',
		theme: 'woodland',
		look: 'vintage',
		sheets: [
			[ orb( 'sun', 0.58, 0.31, 19 ) ],
			[ tree( 'broadleaf', 0.5, 0.7, 33, 8, 100 ) ],
			[ terrain( 'hills', 78, 20 ) ],
			[
				tree( 'oldoak', 0.08, 1, 92 ),
				tree( 'wintertree', 0.94, 1, 89 ),
			],
			[
				plant( 'mushroom', 0.3, 0.98, 33, 2, 16 ),
				plant( 'fern', 0.84, 0.97, 20, 4, 25 ),
			],
			[ plant( 'mushroom', 0.71, 1, 18, 3, 23 ) ],
		],
	},
	{
		id: 'autumncanopy',
		label: 'Autumn canopy',
		theme: 'woodland',
		look: 'sunset',
		sheets: [
			[ terrain( 'hills', 59, 19 ) ],
			[ tree( 'apple', 0.52, 0.8, 40, 6, 88 ) ],
			[ terrain( 'hills', 88, 19 ) ],
			[ tree( 'oldoak', 0.13, 1, 77 ), tree( 'olive', 0.88, 1, 63 ) ],
			[ branch( 'tl', 72 ), branch( 'tr', 58 ) ],
			[
				plant( 'ivy', 0.13, 0.51, 31, 2, 13 ),
				plant( 'fern', 0.78, 0.99, 16, 4, 34 ),
			],
		],
	},
	{
		id: 'glacierlake',
		label: 'Glacier lake',
		theme: 'mountains',
		look: 'midnight',
		sheets: [
			[ terrain( 'ridge', 45, 46 ) ],
			[ land( 'glacier', 0.51, 0.65, 40, 190 ) ],
			[ terrain( 'flat', 66, 0 ) ],
			[ land( 'islands', 0.54, 0.82, 22, 220 ) ],
			[
				land( 'cliff', 0.03, 1, 49, 100 ),
				land( 'cliff', 0.98, 1, 36, 100 ),
			],
			[ tree( 'conifer', 0.12, 0.98, 25, 3, 18 ) ],
		],
	},
	{
		id: 'mountainpass',
		label: 'Mountain pass',
		theme: 'mountains',
		look: 'vintage',
		sheets: [
			[ terrain( 'ridge', 51, 48 ) ],
			[ terrain( 'ridge', 70, 41 ) ],
			[ land( 'fjord', 0.5, 1, 83, 125 ) ],
			[ land( 'riverbend', 0.52, 1, 49, 72 ) ],
			[ land( 'cliff', 0.02, 1, 67, 85 ) ],
			[
				tree( 'stonepine', 0.87, 1, 38 ),
				plant( 'rocks', 0.18, 0.98, 12, 4, 28 ),
			],
		],
	},
	{
		id: 'waterfallvalley',
		label: 'Waterfall valley',
		theme: 'mountains',
		look: 'forest',
		sheets: [
			[ terrain( 'ridge', 48, 36 ) ],
			[ land( 'waterfall', 0.5, 0.94, 52, 90 ) ],
			[ land( 'canyon', 0.5, 1, 68, 130 ) ],
			[
				tree( 'conifer', 0.19, 0.96, 34, 4, 26 ),
				tree( 'conifer', 0.87, 0.97, 46, 3, 23 ),
			],
			[
				plant( 'fern', 0.22, 1, 24, 4, 31 ),
				plant( 'rocks', 0.75, 1, 16, 4, 26 ),
			],
		],
	},
	{
		id: 'volcanoisland',
		label: 'Volcano island',
		theme: 'mountains',
		look: 'sunset',
		sheets: [
			[ orb( 'sun', 0.74, 0.27, 23 ) ],
			[ land( 'volcano', 0.5, 0.73, 53, 127 ) ],
			[ terrain( 'waves', 80, 12 ) ],
			[ land( 'islands', 0.46, 0.86, 24, 230 ) ],
			[ terrain( 'waves', 98, 10 ) ],
			[ tree( 'palm', 0.12, 1, 41, 2, 9 ) ],
		],
	},
	{
		id: 'lighthousebay',
		label: 'Lighthouse bay',
		theme: 'coast',
		look: 'midnight',
		sheets: [
			[ orb( 'sun', 0.64, 0.32, 22 ) ],
			[ terrain( 'waves', 69, 8 ) ],
			[
				land( 'cliff', 0.11, 1, 45, 107 ),
				decor( 'lighthouse', 0.2, 0.65, 32 ),
			],
			[ decor( 'sailboat', 0.67, 0.77, 17 ) ],
			[ land( 'sandbank', 0.57, 0.97, 25, 245 ) ],
			[ plant( 'pampas', 0.11, 1, 18, 3, 20 ) ],
		],
	},
	{
		id: 'duneboardwalk',
		label: 'Dune boardwalk',
		theme: 'coast',
		look: 'vintage',
		sheets: [
			[ orb( 'sun', 0.62, 0.3, 20 ) ],
			[ terrain( 'waves', 66, 10 ) ],
			[
				land( 'sandbank', 0.18, 0.9, 57, 115 ),
				land( 'sandbank', 0.87, 0.94, 55, 115 ),
			],
			[ decor( 'boardwalk', 0.5, 1.03, 43, 113 ) ],
			[
				plant( 'pampas', 0.16, 1, 24, 5, 30 ),
				plant( 'grass', 0.85, 1, 22, 11, 29 ),
			],
		],
	},
	{
		id: 'searockarch',
		label: 'Sea rock arch',
		theme: 'coast',
		look: 'lightbox',
		sheets: [
			[ orb( 'sun', 0.52, 0.45, 20 ) ],
			[ terrain( 'waves', 76, 12 ) ],
			[ decor( 'sailboat', 0.49, 0.83, 15 ) ],
			[ land( 'rockarch', 0.5, 1.01, 91, 90 ) ],
			[
				plant( 'grass', 0.12, 1, 16, 6, 17 ),
				plant( 'rocks', 0.87, 1, 13, 3, 15 ),
			],
		],
	},
	{
		id: 'islandpanorama',
		label: 'Island panorama',
		theme: 'coast',
		look: 'midnight',
		sheets: [
			[ orb( 'sun', 0.27, 0.3, 15 ) ],
			[ land( 'islands', 0.5, 0.6, 30, 230 ) ],
			[ terrain( 'waves', 74, 12 ) ],
			[ land( 'islands', 0.5, 0.85, 38, 200 ) ],
			[ decor( 'sailboat', 0.58, 0.89, 14 ) ],
			[ frame( 'panorama' ) ],
		],
	},
	{
		id: 'mesacanyon',
		label: 'Mesa canyon',
		theme: 'desert',
		look: 'sunset',
		sheets: [
			[ orb( 'sun', 0.7, 0.27, 22 ) ],
			[ land( 'mesa', 0.5, 0.68, 40, 200 ) ],
			[ land( 'canyon', 0.5, 1, 64, 135 ) ],
			[ land( 'riverbend', 0.51, 1, 43, 68 ) ],
			[
				plant( 'agave', 0.2, 1, 20, 3, 27 ),
				plant( 'saguaro', 0.86, 1, 30, 2, 13 ),
			],
		],
	},
	{
		id: 'cactusevening',
		label: 'Cactus evening',
		theme: 'desert',
		look: 'sunset',
		sheets: [
			[ orb( 'sun', 0.52, 0.48, 30 ) ],
			[ terrain( 'dunes', 65, 24 ) ],
			[ terrain( 'dunes', 86, 28 ) ],
			[
				plant( 'saguaro', 0.22, 0.95, 47, 2, 17 ),
				plant( 'pricklypear', 0.77, 0.97, 32, 3, 25 ),
			],
			[
				plant( 'agave', 0.4, 1, 15, 3, 25 ),
				plant( 'aloe', 0.88, 1, 16, 2, 13 ),
			],
		],
	},
	{
		id: 'baobabland',
		label: 'Baobab country',
		theme: 'desert',
		look: 'vintage',
		sheets: [
			[ orb( 'sun', 0.29, 0.33, 24 ) ],
			[ terrain( 'hills', 71, 20 ) ],
			[ tree( 'baobab', 0.75, 0.79, 27, 3, 36 ) ],
			[ terrain( 'hills', 95, 14 ) ],
			[ tree( 'baobab', 0.35, 1, 75 ) ],
			[ plant( 'grass', 0.7, 1, 12, 12, 54 ) ],
		],
	},
	{
		id: 'acaciasavanna',
		label: 'Acacia savanna',
		theme: 'desert',
		look: 'sunset',
		sheets: [
			[ orb( 'sun', 0.66, 0.42, 27 ) ],
			[ terrain( 'hills', 73, 12 ) ],
			[ tree( 'acacia', 0.6, 0.81, 24, 4, 67 ) ],
			[ terrain( 'flat', 93, 0 ) ],
			[
				tree( 'acacia', 0.24, 0.96, 59 ),
				tree( 'acacia', 0.83, 0.97, 40 ),
			],
			[ plant( 'pampas', 0.55, 1, 12, 7, 71 ) ],
		],
	},
	{
		id: 'mangrovebay',
		label: 'Mangrove bay',
		theme: 'tropical',
		look: 'forest',
		sheets: [
			[ terrain( 'waves', 73, 9 ) ],
			[ tree( 'mangrove', 0.5, 0.79, 28, 5, 97 ) ],
			[
				land( 'sandbank', 0.1, 0.99, 47, 126 ),
				land( 'sandbank', 0.87, 0.98, 40, 144 ),
			],
			[
				tree( 'mangrove', 0.14, 0.96, 66 ),
				tree( 'mangrove', 0.88, 0.96, 59 ),
			],
			[ decor( 'rowboat', 0.56, 0.86, 12 ) ],
			[ plant( 'monstera', 0.1, 1, 20, 2, 9 ) ],
		],
	},
	{
		id: 'rainforestriver',
		label: 'Rainforest river',
		theme: 'tropical',
		look: 'forest',
		sheets: [
			[ tree( 'broadleaf', 0.5, 0.67, 35, 9, 105 ) ],
			[ terrain( 'hills', 86, 14 ) ],
			[ land( 'riverbend', 0.5, 1, 44, 120 ) ],
			[
				tree( 'banana', 0.12, 1, 73 ),
				tree( 'bamboo', 0.9, 1, 68, 2, 13 ),
			],
			[
				plant( 'monstera', 0.17, 1, 34, 2, 13 ),
				plant( 'fern', 0.81, 1, 26, 3, 20 ),
			],
		],
	},
	{
		id: 'bananagrove',
		label: 'Banana grove',
		theme: 'tropical',
		look: 'forest',
		sheets: [
			[ orb( 'sun', 0.5, 0.33, 22 ) ],
			[ tree( 'banana', 0.5, 0.75, 41, 6, 100 ) ],
			[ terrain( 'hills', 90, 19 ) ],
			[ tree( 'banana', 0.13, 1, 83 ), tree( 'banana', 0.9, 1, 76 ) ],
			[
				plant( 'elephantear', 0.22, 1, 28, 2, 17 ),
				plant( 'fern', 0.81, 1, 22, 3, 23 ),
			],
		],
	},
	{
		id: 'junglefalls',
		label: 'Jungle waterfall',
		theme: 'tropical',
		look: 'forest',
		sheets: [
			[ terrain( 'ridge', 51, 27 ) ],
			[ land( 'waterfall', 0.53, 0.94, 60, 89 ) ],
			[ land( 'canyon', 0.51, 1, 68, 137 ) ],
			[
				tree( 'banana', 0.14, 0.98, 68 ),
				tree( 'mangrove', 0.93, 0.98, 59 ),
			],
			[
				plant( 'monstera', 0.2, 1, 29, 3, 22 ),
				plant( 'fern', 0.83, 1, 23, 4, 22 ),
			],
			[ branch( 'tl', 48 ) ],
		],
	},
	{
		id: 'cherrypath',
		label: 'Cherry blossom path',
		theme: 'garden',
		look: 'rose',
		sheets: [
			[ terrain( 'hills', 65, 18 ) ],
			[ tree( 'cherry', 0.5, 0.77, 25, 6, 94 ) ],
			[ terrain( 'hills', 91, 13 ) ],
			[ land( 'riverbend', 0.51, 1, 43, 99 ) ],
			[ tree( 'cherry', 0.19, 1, 67 ), tree( 'cherry', 0.85, 1, 60 ) ],
			[ plant( 'daisy', 0.77, 0.99, 14, 5, 30 ) ],
		],
	},
	{
		id: 'lilypond',
		label: 'Water lily pond',
		theme: 'garden',
		look: 'forest',
		sheets: [
			[ tree( 'willow', 0.17, 0.73, 57 ) ],
			[ terrain( 'hills', 72, 15 ) ],
			[ decor( 'bridge', 0.55, 0.73, 23, 150 ) ],
			[ plant( 'waterlily', 0.5, 0.87, 26, 3, 45 ) ],
			[
				plant( 'lotus', 0.3, 0.97, 31, 2, 21 ),
				plant( 'iris', 0.84, 1, 38, 3, 21 ),
			],
		],
	},
	{
		id: 'lavenderterraces',
		label: 'Lavender terraces',
		theme: 'garden',
		look: 'rose',
		sheets: [
			[ terrain( 'hills', 52, 18 ) ],
			[ land( 'terraces', 0.5, 1, 59, 148 ) ],
			[ plant( 'lavender', 0.5, 0.63, 10, 10, 90 ) ],
			[ plant( 'lavender', 0.5, 0.77, 16, 8, 94 ) ],
			[
				tree( 'cypress', 0.86, 0.91, 52 ),
				plant( 'lavender', 0.4, 0.99, 29, 6, 69 ),
			],
		],
	},
	{
		id: 'sunflowerfield',
		label: 'Sunflower field',
		theme: 'garden',
		look: 'sunset',
		sheets: [
			[ terrain( 'hills', 67, 22 ) ],
			[ land( 'fields', 0.5, 1, 36, 146 ) ],
			[ plant( 'sunflower', 0.5, 0.74, 15, 11, 95 ) ],
			[ plant( 'sunflower', 0.5, 0.9, 25, 7, 95 ) ],
			[
				plant( 'sunflower', 0.25, 1, 46, 2, 30 ),
				plant( 'sunflower', 0.82, 1, 37, 2, 21 ),
			],
		],
	},
	{
		id: 'winterpath',
		label: 'Winter forest path',
		theme: 'winter',
		look: 'midnight',
		sheets: [
			[ terrain( 'hills', 64, 19 ) ],
			[ tree( 'wintertree', 0.5, 0.76, 35, 6, 100 ) ],
			[ terrain( 'hills', 91, 14 ) ],
			[ land( 'riverbend', 0.49, 1, 38, 95 ) ],
			[
				tree( 'wintertree', 0.14, 1, 78 ),
				tree( 'wintertree', 0.88, 1, 74 ),
			],
			[ plant( 'rocks', 0.78, 1, 10, 4, 30 ) ],
		],
	},
	{
		id: 'snowcabin',
		label: 'Snowy cabin',
		theme: 'winter',
		look: 'lightbox',
		sheets: [
			[ terrain( 'ridge', 53, 28 ) ],
			[ tree( 'conifer', 0.5, 0.78, 34, 8, 100 ) ],
			[ terrain( 'hills', 88, 16 ) ],
			[ decor( 'cabin', 0.49, 0.88, 32 ) ],
			[
				tree( 'sequoia', 0.14, 1, 68 ),
				tree( 'conifer', 0.86, 1, 59, 2, 19 ),
			],
			[ terrain( 'hills', 106, 10 ) ],
		],
	},
	{
		id: 'icefloebay',
		label: 'Ice floe bay',
		theme: 'winter',
		look: 'midnight',
		sheets: [
			[ land( 'glacier', 0.5, 0.67, 35, 210 ) ],
			[ terrain( 'flat', 70, 0 ) ],
			[ land( 'islands', 0.5, 0.86, 18, 260 ) ],
			[
				land( 'sandbank', 0.15, 0.97, 20, 120 ),
				land( 'sandbank', 0.71, 0.93, 16, 150 ),
			],
			[ land( 'glacier', 0.89, 1.1, 30, 102 ) ],
		],
	},
	{
		id: 'aurorapeaks',
		label: 'Aurora peaks',
		theme: 'winter',
		look: 'night',
		sheets: [
			[ decor( 'starfield', 0.5, 0.65, 53, 132 ) ],
			[ decor( 'aurora', 0.5, 0.66, 50, 150 ) ],
			[ terrain( 'ridge', 67, 44 ) ],
			[ terrain( 'ridge', 86, 37 ) ],
			[
				tree( 'conifer', 0.21, 1, 36, 4, 29 ),
				tree( 'conifer', 0.84, 1, 27, 3, 25 ),
			],
		],
	},
	{
		id: 'floatingislands',
		label: 'Floating islands',
		theme: 'fantasy',
		look: 'rose',
		sheets: [
			[ orb( 'moon', 0.72, 0.24, 24 ) ],
			[ decor( 'starfield', 0.5, 0.8, 61, 110 ) ],
			[
				{ ...land( 'cliff', 0.72, 0.56, 22, 78 ), rot: 180 },
				tree( 'cherry', 0.66, 0.36, 19 ),
			],
			[
				{ ...land( 'cliff', 0.28, 0.83, 27, 96 ), rot: 180 },
				tree( 'bamboo', 0.22, 0.58, 23, 2, 8 ),
			],
			[ land( 'waterfall', 0.36, 0.92, 34, 34 ) ],
			[
				{ ...land( 'cliff', 0.85, 1.08, 28, 100 ), rot: 180 },
				plant( 'fern', 0.8, 0.82, 19, 2, 15 ),
			],
		],
	},
	{
		id: 'stargate',
		label: 'Star portal',
		theme: 'fantasy',
		look: 'night',
		sheets: [
			[ decor( 'starfield', 0.5, 0.84, 73, 100 ) ],
			[ orb( 'moon', 0.57, 0.42, 35 ) ],
			[ orb( 'crescent', 0.32, 0.65, 22 ) ],
			[ terrain( 'hills', 92, 18 ) ],
			[ frame( 'star' ) ],
		],
	},
	{
		id: 'leafportal',
		label: 'Leaf portal',
		theme: 'fantasy',
		look: 'forest',
		sheets: [
			[ orb( 'sun', 0.53, 0.3, 20 ) ],
			[ terrain( 'hills', 65, 19 ) ],
			[ tree( 'magnolia', 0.54, 0.79, 40 ) ],
			[ plant( 'lotus', 0.5, 0.93, 28, 2, 25 ) ],
			[ plant( 'fern', 0.7, 0.96, 24, 3, 25 ) ],
			[ frame( 'leafwindow' ) ],
		],
	},
	{
		id: 'moongarden',
		label: 'Moon garden',
		theme: 'fantasy',
		look: 'night',
		sheets: [
			[ orb( 'moon', 0.49, 0.32, 40 ) ],
			[ decor( 'starfield', 0.5, 0.73, 68, 118 ) ],
			[ terrain( 'hills', 87, 18 ) ],
			[ decor( 'gate', 0.5, 0.94, 39 ) ],
			[
				plant( 'foxglove', 0.22, 1, 42, 3, 20 ),
				plant( 'pampas', 0.87, 1, 41, 3, 20 ),
			],
			[
				decor( 'lantern', 0.27, 0.57, 19 ),
				decor( 'lantern', 0.75, 0.43, 16 ),
			],
			[ plant( 'rosevine', 0.7, 1, 25, 2, 14 ) ],
		],
	},
];
export const EXTRA_SCENE_LABELS = scenes.map( ( { id, label, theme } ) => ( {
	id,
	label,
	theme,
} ) );
export function createExtraPresets( O, L ) {
	return scenes.map( ( s, i ) => ( {
		id: s.id,
		label: s.label,
		theme: s.theme,
		patch: () => {
			let serial = 0;
			return {
				photo: { source: 'none' },
				look: s.look,
				frame: 'none',
				lightX: 30,
				lightY: 20,
				layers: [
					L( { objects: [ O( 'backdrop', { seed: 1000 + i } ) ] } ),
					...s.sheets.map( ( objects ) =>
						L( {
							objects: objects.map( ( raw ) =>
								O( raw.kind, {
									...raw,
									seed: 1100 + i * 50 + serial++,
								} )
							),
						} )
					),
				],
			};
		},
	} ) );
}
