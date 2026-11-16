/** Compositions with individually editable motifs, authored from back to front. */
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
const orb = ( variant, x, y, scale ) => item( 'orb', { variant, x, y, scale } );
const animal = ( species, x, y, scale, flip = false ) =>
	item( 'animal', { species, x, y, scale, flip } );
const frame = ( window, inset = 7, windowAngle = 0 ) =>
	item( 'frame', { window, inset, windowAngle, ornament: 60 } );

const scenes = [
	{
		id: 'balloonvalley',
		label: 'Balloon valley',
		theme: 'fantasy',
		look: 'terracotta',
		objects: [
			orb( 'sun', 0.73, 0.25, 19 ),
			decor( 'hotairballoon', 0.34, 0.49, 25, 100, '#cf7158' ),
			decor( 'hotairballoon', 0.63, 0.37, 15 ),
			terrain( 'hills', 66, 27 ),
			terrain( 'dunes', 81, 24 ),
			tree( 'cypress', 0.11, 0.88, 31, 3, 12 ),
			terrain( 'hills', 94, 13 ),
			plant( 'pampas', 0.87, 1.01, 27, 3, 15 ),
			frame( 'arch', 5 ),
		],
	},
	{
		id: 'observatorynight',
		label: 'Observatory night',
		theme: 'mountains',
		look: 'glacier',
		objects: [
			decor( 'starfield', 0.5, 0.66, 65, 175 ),
			orb( 'crescent', 0.25, 0.25, 20 ),
			terrain( 'ridge', 61, 35 ),
			terrain( 'hills', 77, 20 ),
			decor( 'observatory', 0.63, 0.81, 39 ),
			tree( 'conifer', 0.18, 0.92, 32, 4, 20 ),
			terrain( 'flat', 94, 8 ),
			plant( 'rocks', 0.73, 0.97, 9, 6, 30 ),
			frame( 'ogee', 5 ),
		],
	},
	{
		id: 'greenhousegarden',
		label: 'Greenhouse garden',
		theme: 'garden',
		look: 'pistachio',
		objects: [
			orb( 'sun', 0.67, 0.23, 18 ),
			terrain( 'hills', 62, 18 ),
			tree( 'eucalyptus', 0.86, 0.8, 42, 3, 14 ),
			terrain( 'flat', 83, 6 ),
			decor( 'greenhouse', 0.45, 0.87, 52 ),
			decor( 'steppingstones', 0.49, 1.01, 17, 115 ),
			plant( 'tulip', 0.14, 0.98, 27, 4, 17, '#ad586c' ),
			plant( 'fern', 0.82, 1.02, 30, 3, 23 ),
			frame( 'rect', 4 ),
		],
	},
	{
		id: 'campinglake',
		label: 'Camp by the lake',
		theme: 'woodland',
		look: 'lagoon',
		objects: [
			orb( 'moon', 0.69, 0.23, 22 ),
			terrain( 'ridge', 56, 30 ),
			tree( 'conifer', 0.5, 0.68, 24, 11, 95 ),
			terrain( 'waves', 76, 10 ),
			terrain( 'hills', 90, 10 ),
			decor( 'campingtent', 0.42, 0.94, 31, 100, '#cf9861' ),
			tree( 'stonepine', 0.89, 1.02, 72 ),
			plant( 'grass', 0.18, 1.01, 16, 10, 30 ),
			animal( 'hare', 0.65, 0.95, 13 ),
			frame( 'organic', 5 ),
		],
	},
	{
		id: 'pagodapond',
		label: 'Pagoda pond',
		theme: 'garden',
		look: 'orchid',
		objects: [
			orb( 'sun', 0.27, 0.25, 24 ),
			terrain( 'hills', 64, 26 ),
			tree( 'cherry', 0.18, 0.78, 38, 2, 15 ),
			terrain( 'flat', 78, 8 ),
			decor( 'pagoda', 0.63, 0.79, 44 ),
			terrain( 'waves', 91, 10 ),
			plant( 'lotus', 0.44, 0.97, 18, 3, 27, '#e6b7bd' ),
			plant( 'cattail', 0.86, 1.01, 34, 4, 16 ),
			frame( 'circle', 5 ),
		],
	},
	{
		id: 'tulipmorning',
		label: 'Tulip morning',
		theme: 'garden',
		look: 'terracotta',
		objects: [
			orb( 'sun', 0.66, 0.26, 24 ),
			terrain( 'hills', 63, 17 ),
			decor( 'windmill', 0.26, 0.71, 25 ),
			terrain( 'flat', 77, 6 ),
			plant( 'tulip', 0.52, 0.84, 22, 9, 89 ),
			terrain( 'flat', 96, 4 ),
			plant( 'tulip', 0.49, 0.99, 40, 6, 85, '#b94d61' ),
			item( 'flyer', {
				species: 'butterfly',
				x: 0.75,
				y: 0.38,
				scale: 14,
			} ),
			frame( 'quatrefoil', 5 ),
		],
	},
	{
		id: 'snowdropgrove',
		label: 'Snowdrop grove',
		theme: 'winter',
		look: 'glacier',
		objects: [
			terrain( 'hills', 66, 20 ),
			tree( 'wintertree', 0.51, 0.77, 50, 6, 92 ),
			terrain( 'dunes', 88, 14 ),
			animal( 'deer', 0.74, 0.87, 22 ),
			plant( 'snowdrop', 0.31, 1.01, 43, 4, 29, '#f4f3da' ),
			plant( 'snowdrop', 0.74, 1.01, 29, 3, 20 ),
			plant( 'grass', 0.54, 0.98, 16, 10, 80 ),
			frame( 'oval', 5 ),
		],
	},
	{
		id: 'coralreef',
		label: 'Coral reef',
		theme: 'coast',
		look: 'lagoon',
		objects: [
			item( 'landform', {
				variant: 'rockarch',
				x: 0.8,
				y: 0.87,
				scale: 58,
				stretch: 110,
			} ),
			animal( 'dolphin', 0.42, 0.42, 29 ),
			terrain( 'dunes', 85, 16 ),
			plant( 'coral', 0.17, 1.02, 61, 2, 16, '#d39b8b' ),
			plant( 'coral', 0.78, 1.04, 44, 3, 27 ),
			plant( 'rocks', 0.48, 1.03, 13, 7, 74 ),
			plant( 'coral', 0.44, 1.03, 23, 2, 18, '#bb815f' ),
			frame( 'shell', 5 ),
		],
	},
	{
		id: 'cottonfields',
		label: 'Cotton fields',
		theme: 'garden',
		look: 'gallery',
		objects: [
			orb( 'sun', 0.25, 0.25, 21 ),
			terrain( 'hills', 62, 19 ),
			item( 'landform', {
				variant: 'fields',
				x: 0.5,
				y: 0.9,
				scale: 33,
				stretch: 210,
			} ),
			decor( 'cabin', 0.74, 0.7, 15 ),
			terrain( 'flat', 94, 5 ),
			plant( 'cotton', 0.48, 1.02, 46, 7, 88, '#b58d60' ),
			plant( 'cotton', 0.21, 1.02, 30, 3, 18 ),
			frame( 'deckle', 6 ),
		],
	},
	{
		id: 'ginkgocourtyard',
		label: 'Ginkgo courtyard',
		theme: 'garden',
		look: 'gilded',
		objects: [
			orb( 'sun', 0.65, 0.27, 25 ),
			terrain( 'flat', 82, 6 ),
			decor( 'gate', 0.6, 0.85, 31 ),
			decor( 'steppingstones', 0.53, 1.04, 23, 140 ),
			tree( 'ginkgo', 0.25, 1.01, 77 ),
			tree( 'ginkgo', 0.91, 1.03, 57 ),
			tree( 'eucalyptus', 0.72, 0.99, 18 ),
			plant( 'fern', 0.64, 1.03, 23, 2, 20 ),
			frame( 'ogee', 5 ),
		],
	},
	{
		id: 'paperrain',
		label: 'Paper rain',
		theme: 'abstract',
		look: 'lagoon',
		objects: Array.from( { length: 9 }, ( _, i ) =>
			frame( 'raindrop', 31 - i * 3, ( i - 4 ) * 3 )
		),
	},
	{
		id: 'radiantchamber',
		label: 'Radiant chamber',
		theme: 'abstract',
		look: 'copper',
		objects: Array.from( { length: 9 }, ( _, i ) =>
			item(
				'frame',
				{
					window: 'sunburstwindow',
					inset: 31 - i * 3,
					windowAngle: i * 2.2,
					ornament: 52,
				},
				i === 3 || i === 7 ? '#bc965a' : '',
				i === 3 || i === 7 ? 'foil' : ''
			)
		),
	},
];

export const COLLECTION_SCENE_LABELS = scenes.map(
	( { id, label, theme } ) => ( {
		id,
		label,
		theme,
	} )
);
export function createCollectionPresets( object, layer, lookById ) {
	return scenes.map( ( recipe, index ) => ( {
		id: recipe.id,
		label: recipe.label,
		theme: recipe.theme,
		patch: () => ( {
			...lookById( recipe.look ).finish,
			look: recipe.look,
			frame: 'none',
			photo: { source: 'none' },
			paper: recipe.theme === 'winter' ? 'pearl' : 'cotton',
			lightX: -42,
			lightY: -62,
			shadow: 54,
			soft: 42,
			glow: 18,
			grain: 42,
			detail: 80,
			layers: [
				layer( {
					objects: [ object( 'backdrop', { seed: 7000 + index } ) ],
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
									seed: 7100 + index * 50 + n,
								} ),
							],
						} )
				),
			],
		} ),
	} ) );
}
