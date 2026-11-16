/** Original procedural text collection. Labels and controls share the existing UI. */
import { __ } from '@wordpress/i18n';

export const TEXT_COLLECTION_GROUPS = [
	{ id: 'metal', label: __( 'Metal', 'wunderpaint' ) },
	{ id: 'glass', label: __( 'Glass', 'wunderpaint' ) },
	{ id: 'soft', label: __( 'Soft Materials', 'wunderpaint' ) },
	{ id: 'woven', label: __( 'Engraved & Woven', 'wunderpaint' ) },
	{ id: 'mineral', label: __( 'Mineral & Organic', 'wunderpaint' ) },
	{ id: 'depth', label: __( 'Depth & Motion', 'wunderpaint' ) },
	{ id: 'cut', label: __( 'Cut & Fold', 'wunderpaint' ) },
	{ id: 'light', label: __( 'Light', 'wunderpaint' ) },
	{ id: 'contour', label: __( 'Contours', 'wunderpaint' ) },
	{ id: 'print', label: __( 'Print & Ink', 'wunderpaint' ) },
	{ id: 'marks', label: __( 'Marks & Badges', 'wunderpaint' ) },
	{ id: 'transform', label: __( 'Transform', 'wunderpaint' ) },
];
const BASE = {
	finish: { depth: 48, scale: 45, shine: 75, angle: 125 },
	volume: { depth: 58, amount: 60, count: 20, angle: 60 },
	fragments: { depth: 35, amount: 45, scale: 45, angle: 20 },
	light: { amount: 80, scale: 45, glow: 40, angle: 35 },
	contour: { depth: 50, amount: 45, count: 12, width: 12, angle: 35 },
};
const COLOR_PARAMS = [
	{ key: 'color', label: __( 'Primary color', 'wunderpaint' ), color: true },
	{ key: 'color2', label: __( 'Accent color', 'wunderpaint' ), color: true },
];
const PARAMETERS = {
	finish: [
		{
			key: 'depth',
			label: __( 'Relief', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{
			key: 'scale',
			label: __( 'Texture scale', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'shine',
			label: __( 'Polish', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{
			key: 'angle',
			label: __( 'Light angle', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	volume: [
		{ key: 'depth', label: __( 'Depth', 'wunderpaint' ), min: 5, max: 100 },
		{
			key: 'amount',
			label: __( 'Spread', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{ key: 'count', label: __( 'Layers', 'wunderpaint' ), min: 6, max: 30 },
		{
			key: 'angle',
			label: __( 'Direction', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	fragments: [
		{ key: 'depth', label: __( 'Depth', 'wunderpaint' ), min: 0, max: 100 },
		{
			key: 'amount',
			label: __( 'Separation', 'wunderpaint' ),
			min: 0,
			max: 100,
		},
		{
			key: 'scale',
			label: __( 'Piece size', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'angle',
			label: __( 'Direction', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	light: [
		{
			key: 'amount',
			label: __( 'Intensity', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{
			key: 'scale',
			label: __( 'Texture scale', 'wunderpaint' ),
			min: 5,
			max: 100,
		},
		{ key: 'glow', label: __( 'Glow', 'wunderpaint' ), min: 0, max: 100 },
		{
			key: 'angle',
			label: __( 'Direction', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
	contour: [
		{ key: 'depth', label: __( 'Depth', 'wunderpaint' ), min: 5, max: 100 },
		{ key: 'amount', label: __( 'Bend', 'wunderpaint' ), min: 0, max: 100 },
		{
			key: 'count',
			label: __( 'Contours', 'wunderpaint' ),
			min: 4,
			max: 24,
		},
		{
			key: 'width',
			label: __( 'Line weight', 'wunderpaint' ),
			min: 3,
			max: 30,
		},
		{
			key: 'angle',
			label: __( 'Direction', 'wunderpaint' ),
			min: 0,
			max: 360,
		},
	],
};

export const TEXT_EFFECT_COLLECTION = [
	{
		id: 'mercuryMirror',
		label: __( 'Mercury Mirror', 'wunderpaint' ),
		group: 'metal',
		slot: 'finish',
		mode: 'mercury',
		colors: [ '#c9e2ee', '#59667e' ],
	},
	{
		id: 'anodizedTitanium',
		label: __( 'Anodized Titanium', 'wunderpaint' ),
		group: 'metal',
		slot: 'finish',
		mode: 'anodized',
		colors: [ '#68dbd8', '#cd75cd' ],
	},
	{
		id: 'hammeredGold',
		label: __( 'Hammered Gold', 'wunderpaint' ),
		group: 'metal',
		slot: 'finish',
		mode: 'hammered',
		colors: [ '#f7d99e', '#865131' ],
	},
	{
		id: 'brushedAlloy',
		label: __( 'Brushed Alloy', 'wunderpaint' ),
		group: 'metal',
		slot: 'finish',
		mode: 'brushed',
		colors: [ '#b6c4d3', '#4c617a' ],
	},
	{
		id: 'engravedSteel',
		label: __( 'Engraved Steel', 'wunderpaint' ),
		group: 'metal',
		slot: 'finish',
		mode: 'engraved',
		colors: [ '#d6e2eb', '#324759' ],
	},
	{
		id: 'frostedCrystal',
		label: __( 'Frosted Crystal', 'wunderpaint' ),
		group: 'glass',
		slot: 'finish',
		mode: 'frosted',
		colors: [ '#bfe8f1', '#739dc4' ],
	},
	{
		id: 'dichroicFoil',
		label: __( 'Dichroic Foil', 'wunderpaint' ),
		group: 'glass',
		slot: 'finish',
		mode: 'dichroic',
		colors: [ '#75f0d3', '#d97de4' ],
	},
	{
		id: 'stainedCrystal',
		label: __( 'Stained Crystal', 'wunderpaint' ),
		group: 'glass',
		slot: 'finish',
		mode: 'stained',
		colors: [ '#4ce4ca', '#8d51db' ],
	},
	{
		id: 'smokedGlass',
		label: __( 'Smoked Glass', 'wunderpaint' ),
		group: 'glass',
		slot: 'finish',
		mode: 'smoked',
		colors: [ '#9aa8b7', '#413e63' ],
	},
	{
		id: 'liquidLens',
		label: __( 'Liquid Lens', 'wunderpaint' ),
		group: 'glass',
		slot: 'finish',
		mode: 'lens',
		colors: [ '#aceaf1', '#9b99e2' ],
	},
	{
		id: 'porcelainGlaze',
		label: __( 'Porcelain Glaze', 'wunderpaint' ),
		group: 'soft',
		slot: 'finish',
		mode: 'porcelain',
		colors: [ '#f2e9df', '#8296aa' ],
	},
	{
		id: 'velvetSurface',
		label: __( 'Velvet Surface', 'wunderpaint' ),
		group: 'soft',
		slot: 'finish',
		mode: 'velvet',
		colors: [ '#d2639e', '#512b70' ],
	},
	{
		id: 'satinFold',
		label: __( 'Satin Fold', 'wunderpaint' ),
		group: 'soft',
		slot: 'finish',
		mode: 'satin',
		colors: [ '#f5bbac', '#9f5276' ],
	},
	{
		id: 'candyGel',
		label: __( 'Candy Gel', 'wunderpaint' ),
		group: 'soft',
		slot: 'finish',
		mode: 'gel',
		colors: [ '#fa839d', '#913cbd' ],
	},
	{
		id: 'inflatedRubber',
		label: __( 'Inflated Rubber', 'wunderpaint' ),
		group: 'soft',
		slot: 'finish',
		mode: 'rubber',
		colors: [ '#f5bc61', '#bc654f' ],
	},
	{
		id: 'carbonWeave',
		label: __( 'Carbon Weave', 'wunderpaint' ),
		group: 'woven',
		slot: 'finish',
		mode: 'carbon',
		colors: [ '#7f96a7', '#263142' ],
	},
	{
		id: 'wovenSilk',
		label: __( 'Woven Silk', 'wunderpaint' ),
		group: 'woven',
		slot: 'finish',
		mode: 'silk',
		colors: [ '#e9d4ae', '#776685' ],
	},
	{
		id: 'guillocheEtching',
		label: __( 'Guilloché Etching', 'wunderpaint' ),
		group: 'woven',
		slot: 'finish',
		mode: 'guilloche',
		colors: [ '#e5c88e', '#527a7a' ],
	},
	{
		id: 'circuitInlay',
		label: __( 'Circuit Inlay', 'wunderpaint' ),
		group: 'woven',
		slot: 'finish',
		mode: 'circuit',
		colors: [ '#63e6c2', '#244b56' ],
	},
	{
		id: 'moireInterference',
		label: __( 'Moiré Interference', 'wunderpaint' ),
		group: 'woven',
		slot: 'finish',
		mode: 'moire',
		colors: [ '#efc6d7', '#527ac7' ],
	},
	{
		id: 'marbleVeins',
		label: __( 'Marble Veins', 'wunderpaint' ),
		group: 'mineral',
		slot: 'finish',
		mode: 'marble',
		colors: [ '#f3e9dc', '#668685' ],
	},
	{
		id: 'agateStrata',
		label: __( 'Agate Strata', 'wunderpaint' ),
		group: 'mineral',
		slot: 'finish',
		mode: 'agate',
		colors: [ '#fdba8b', '#976bb8' ],
	},
	{
		id: 'malachiteRings',
		label: __( 'Malachite Rings', 'wunderpaint' ),
		group: 'mineral',
		slot: 'finish',
		mode: 'malachite',
		colors: [ '#66d2a3', '#154f53' ],
	},
	{
		id: 'crystalCells',
		label: __( 'Crystal Cells', 'wunderpaint' ),
		group: 'mineral',
		slot: 'finish',
		mode: 'crystal',
		colors: [ '#b1e7eb', '#8274bd' ],
	},
	{
		id: 'topographicRelief',
		label: __( 'Topographic Relief', 'wunderpaint' ),
		group: 'mineral',
		slot: 'finish',
		mode: 'topography',
		colors: [ '#c8d99b', '#567d70' ],
	},
	{
		id: 'twistExtrusion',
		label: __( 'Twist Extrusion', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'twist',
		colors: [ '#6be7df', '#6555ab' ],
	},
	{
		id: 'fanExtrusion',
		label: __( 'Fan Extrusion', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'fan',
		colors: [ '#fbae92', '#7861b7' ],
	},
	{
		id: 'accordionDepth',
		label: __( 'Accordion Depth', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'accordion',
		colors: [ '#f4cd75', '#ca5375' ],
	},
	{
		id: 'orbitalEcho',
		label: __( 'Orbital Echo', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'orbit',
		colors: [ '#98e8e2', '#728bd0' ],
	},
	{
		id: 'radialBloom',
		label: __( 'Radial Bloom', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'radial',
		colors: [ '#fdcc95', '#d368aa' ],
	},
	{
		id: 'taperedTrail',
		label: __( 'Tapered Trail', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'taper',
		colors: [ '#b0d6f2', '#4b6197' ],
	},
	{
		id: 'risingSteps',
		label: __( 'Rising Steps', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'steps',
		colors: [ '#81d8b5', '#3b7283' ],
	},
	{
		id: 'splitStream',
		label: __( 'Split Stream', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'split',
		colors: [ '#fa9c93', '#7977d4' ],
	},
	{
		id: 'wovenTrail',
		label: __( 'Woven Trail', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'woven',
		colors: [ '#fad2a0', '#b26a94' ],
	},
	{
		id: 'isometricLayers',
		label: __( 'Isometric Layers', 'wunderpaint' ),
		group: 'depth',
		slot: 'volume',
		mode: 'isometric',
		colors: [ '#b8e2e2', '#6382b7' ],
	},
	{
		id: 'glassShards',
		label: __( 'Glass Shards', 'wunderpaint' ),
		group: 'cut',
		slot: 'fragments',
		mode: 'shards',
		colors: [ '#a3e8e3', '#c38bd4' ],
	},
	{
		id: 'venetianFold',
		label: __( 'Venetian Fold', 'wunderpaint' ),
		group: 'cut',
		slot: 'fragments',
		mode: 'venetian',
		colors: [ '#efc58d', '#af729b' ],
	},
	{
		id: 'floatingTiles',
		label: __( 'Floating Tiles', 'wunderpaint' ),
		group: 'cut',
		slot: 'fragments',
		mode: 'tiles',
		colors: [ '#87e1d0', '#6682bd' ],
	},
	{
		id: 'diagonalWeave',
		label: __( 'Diagonal Weave', 'wunderpaint' ),
		group: 'cut',
		slot: 'fragments',
		mode: 'weave',
		colors: [ '#eebb9d', '#a679ba' ],
	},
	{
		id: 'cutFold',
		label: __( 'Cut & Fold', 'wunderpaint' ),
		group: 'cut',
		slot: 'fragments',
		mode: 'fold',
		colors: [ '#a4d8de', '#c38da6' ],
	},
	{
		id: 'plasmaVeins',
		label: __( 'Plasma Veins', 'wunderpaint' ),
		group: 'light',
		slot: 'light',
		mode: 'plasma',
		colors: [ '#ba8dff', '#5deded' ],
	},
	{
		id: 'neonLattice',
		label: __( 'Neon Lattice', 'wunderpaint' ),
		group: 'light',
		slot: 'light',
		mode: 'lattice',
		colors: [ '#81e9d5', '#e582d9' ],
	},
	{
		id: 'spectralEdge',
		label: __( 'Spectral Edge', 'wunderpaint' ),
		group: 'light',
		slot: 'light',
		mode: 'spectral',
		colors: [ '#8dccff', '#f78cad' ],
	},
	{
		id: 'lightSweep',
		label: __( 'Light Sweep', 'wunderpaint' ),
		group: 'light',
		slot: 'light',
		mode: 'sweep',
		colors: [ '#fde0a9', '#9c92ec' ],
	},
	{
		id: 'causticGlow',
		label: __( 'Caustic Glow', 'wunderpaint' ),
		group: 'light',
		slot: 'light',
		mode: 'caustic',
		colors: [ '#9feaed', '#4b92d3' ],
	},
	{
		id: 'contourLandscape',
		label: __( 'Contour Landscape', 'wunderpaint' ),
		group: 'contour',
		slot: 'contour',
		mode: 'landscape',
		colors: [ '#cbe5b1', '#558d7c' ],
	},
	{
		id: 'rippleContours',
		label: __( 'Ripple Contours', 'wunderpaint' ),
		group: 'contour',
		slot: 'contour',
		mode: 'ripple',
		colors: [ '#91e3df', '#af7be0' ],
	},
	{
		id: 'offsetContourTrail',
		label: __( 'Offset Contours', 'wunderpaint' ),
		group: 'contour',
		slot: 'contour',
		mode: 'offset',
		colors: [ '#f6c098', '#9a6897' ],
	},
	{
		id: 'segmentedContours',
		label: __( 'Segmented Contours', 'wunderpaint' ),
		group: 'contour',
		slot: 'contour',
		mode: 'segmented',
		colors: [ '#eae6b7', '#818db4' ],
	},
	{
		id: 'wirePortal',
		label: __( 'Wire Portal', 'wunderpaint' ),
		group: 'contour',
		slot: 'contour',
		mode: 'portal',
		colors: [ '#88e7d7', '#8878d4' ],
	},
].map( ( item ) => {
	const def = {
		color: item.colors[ 0 ],
		color2: item.colors[ 1 ],
		...BASE[ item.slot ],
	};
	return { ...item, def, prev: { [ item.id ]: def } };
} );
export const COLLECTION_EFFECT_BY_ID = Object.fromEntries(
	TEXT_EFFECT_COLLECTION.map( ( item ) => [ item.id, item ] )
);
export const COLLECTION_FX_PARAMS = Object.fromEntries(
	TEXT_EFFECT_COLLECTION.map( ( item ) => [
		item.id,
		[ ...COLOR_PARAMS, ...PARAMETERS[ item.slot ] ],
	] )
);
export const COLLECTION_TEXT_KEYS = TEXT_EFFECT_COLLECTION.map(
	( item ) => item.id
);
const SLOTS = {
	// A solid surface or a hollow body replaces the previous finish. Edge shading,
	// distress, lighting, outlines and shadows remain independent modifiers.
	...Object.fromEntries(
		[
			'imageFill',
			'chrome',
			'foil',
			'gradient',
			'threeD',
			'twoTone',
			'stripesFill',
			'comicDots',
			'checker',
			'dotMatrix',
			'motifFill',
			'camo',
			'circuit',
			'plaid',
			'static',
			'paperCut',
			'neonTube',
			'wireframe',
			'knockout',
			'offsetPrint',
		].map( ( key ) => [ key, 'finish' ] )
	),
	liquidMetal: 'finish',
	dichroicGlass: 'finish',
	ribbonFlow: 'volume',
	prismCut: 'fragments',
	contourTunnel: 'contour',
	...Object.fromEntries(
		TEXT_EFFECT_COLLECTION.map( ( item ) => [ item.id, item.slot ] )
	),
};

/** Alternative finishes replace one another; independent effect families combine. */
export function activateTextEffect( current, item ) {
	const next = { ...current };
	const slot = SLOTS[ item.id ];
	if ( slot ) {
		for ( const key of Object.keys( next ) ) {
			if ( key !== item.id && SLOTS[ key ] === slot ) {
				next[ key ] = null;
			}
		}
	}
	next[ item.id ] = { ...item.def };
	return next;
}
