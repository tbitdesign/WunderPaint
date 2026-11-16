/** Fifty composed looks. Each stays an editable text layer. */
import { __ } from '@wordpress/i18n';
import { COLLECTION_EFFECT_BY_ID } from './text-effects-collection';
const look = ( id, label, effect, color, color2, settings, second, extra ) => {
	const base = COLLECTION_EFFECT_BY_ID[ effect ];
	const textFX = { [ effect ]: { ...base.def, color, color2, ...settings } };
	if ( second ) {
		textFX[ second ] = {
			...COLLECTION_EFFECT_BY_ID[ second ].def,
			color,
			color2,
			...extra,
		};
	}
	return {
		id,
		label,
		group: base.group,
		patch: {
			color: '#f7ecd8',
			fillType: 'gradient',
			gradientKind: 'linear',
			gradientAngle: 90,
			gradientStops: [
				{ at: 0, color: '#fff6df' },
				{ at: 1, color },
			],
			textFX,
		},
	};
};
export const TEXT_STYLE_COLLECTION = [
	look(
		'silver-current',
		__( 'Silver Current', 'wunderpaint' ),
		'mercuryMirror',
		'#d9e9ef',
		'#46566d',
		{ scale: 28, depth: 62 },
		'taperedTrail',
		{ depth: 20, amount: 60 }
	),
	look(
		'titanium-dawn',
		__( 'Titanium Dawn', 'wunderpaint' ),
		'anodizedTitanium',
		'#5edbb5',
		'#ef956e',
		{ scale: 68, depth: 38 },
		'isometricLayers',
		{ depth: 16, count: 12 }
	),
	look(
		'antique-brass',
		__( 'Antique Brass', 'wunderpaint' ),
		'hammeredGold',
		'#f3d58c',
		'#6d663b',
		{ scale: 33, shine: 85 },
		null,
		{}
	),
	look(
		'midnight-alloy',
		__( 'Midnight Alloy', 'wunderpaint' ),
		'brushedAlloy',
		'#aebbd2',
		'#403951',
		{ scale: 18, depth: 64 },
		'risingSteps',
		{ depth: 22, amount: 35 }
	),
	look(
		'engraved-platinum',
		__( 'Engraved Platinum', 'wunderpaint' ),
		'engravedSteel',
		'#e3dfc9',
		'#476777',
		{ scale: 68, depth: 58 },
		null,
		{}
	),
	look(
		'polar-crystal',
		__( 'Polar Crystal', 'wunderpaint' ),
		'frostedCrystal',
		'#dcf6eb',
		'#70aacc',
		{ scale: 60, depth: 72 },
		'glassShards',
		{ amount: 12, depth: 14, scale: 68 }
	),
	look(
		'oil-slick',
		__( 'Oil Slick', 'wunderpaint' ),
		'dichroicFoil',
		'#50f3cd',
		'#ed75cf',
		{ scale: 25, depth: 65 },
		null,
		{}
	),
	look(
		'jewel-mosaic',
		__( 'Jewel Mosaic', 'wunderpaint' ),
		'stainedCrystal',
		'#f5ae73',
		'#7753b8',
		{ scale: 72, depth: 45 },
		null,
		{}
	),
	look(
		'smoky-quartz',
		__( 'Smoky Quartz', 'wunderpaint' ),
		'smokedGlass',
		'#d1bdc1',
		'#655270',
		{ depth: 80, shine: 92 },
		'twistExtrusion',
		{ depth: 18, amount: 25 }
	),
	look(
		'water-drop',
		__( 'Water Drop', 'wunderpaint' ),
		'liquidLens',
		'#bef3ee',
		'#498ecb',
		{ scale: 70, depth: 75 },
		null,
		{}
	),
	look(
		'ivory-ceramic',
		__( 'Ivory Ceramic', 'wunderpaint' ),
		'porcelainGlaze',
		'#fff1d9',
		'#b3a3ae',
		{ depth: 70, shine: 95 },
		'isometricLayers',
		{ depth: 12, amount: 10 }
	),
	look(
		'velvet-rose',
		__( 'Velvet Rose', 'wunderpaint' ),
		'velvetSurface',
		'#f495b7',
		'#743d67',
		{ scale: 30, depth: 70 },
		null,
		{}
	),
	look(
		'champagne-satin',
		__( 'Champagne Satin', 'wunderpaint' ),
		'satinFold',
		'#fff0ba',
		'#bc937f',
		{ scale: 65, depth: 72 },
		null,
		{}
	),
	look(
		'berry-glaze',
		__( 'Berry Glaze', 'wunderpaint' ),
		'candyGel',
		'#f078b2',
		'#7543c9',
		{ scale: 58, shine: 94 },
		null,
		{}
	),
	look(
		'apricot-cushion',
		__( 'Apricot Cushion', 'wunderpaint' ),
		'inflatedRubber',
		'#ffc181',
		'#c76e6d',
		{ scale: 75, depth: 88, shine: 28 },
		null,
		{}
	),
	look(
		'carbon-precision',
		__( 'Carbon Precision', 'wunderpaint' ),
		'carbonWeave',
		'#a6bec8',
		'#263741',
		{ scale: 35, depth: 62 },
		'taperedTrail',
		{ depth: 16, amount: 40 }
	),
	look(
		'woven-copper',
		__( 'Woven Copper', 'wunderpaint' ),
		'wovenSilk',
		'#f3ce9a',
		'#9b5260',
		{ scale: 38, depth: 60 },
		null,
		{}
	),
	look(
		'mint-banknote',
		__( 'Mint Banknote', 'wunderpaint' ),
		'guillocheEtching',
		'#c5e9cf',
		'#437e74',
		{ scale: 62, depth: 62 },
		null,
		{}
	),
	look(
		'jade-circuit',
		__( 'Jade Circuit', 'wunderpaint' ),
		'circuitInlay',
		'#c4f6b8',
		'#346f68',
		{ scale: 72, depth: 56 },
		null,
		{}
	),
	look(
		'opal-interference',
		__( 'Opal Interference', 'wunderpaint' ),
		'moireInterference',
		'#dff1e4',
		'#ac82c4',
		{ scale: 62, shine: 84 },
		null,
		{}
	),
	look(
		'ivory-veins',
		__( 'Ivory Veins', 'wunderpaint' ),
		'marbleVeins',
		'#fff4df',
		'#876d88',
		{ scale: 57, depth: 58 },
		null,
		{}
	),
	look(
		'desert-agate',
		__( 'Desert Agate', 'wunderpaint' ),
		'agateStrata',
		'#ffe0aa',
		'#bd808e',
		{ scale: 60, depth: 68 },
		null,
		{}
	),
	look(
		'verdant-stone',
		__( 'Verdant Stone', 'wunderpaint' ),
		'malachiteRings',
		'#80d7ad',
		'#255465',
		{ scale: 67, depth: 80 },
		null,
		{}
	),
	look(
		'amethyst-cut',
		__( 'Amethyst Cut', 'wunderpaint' ),
		'crystalCells',
		'#d6b6f0',
		'#6367b5',
		{ scale: 74, depth: 65 },
		null,
		{}
	),
	look(
		'contour-island',
		__( 'Contour Island', 'wunderpaint' ),
		'topographicRelief',
		'#e7ecbc',
		'#5d9b88',
		{ scale: 65, depth: 72 },
		null,
		{}
	),
	look(
		'candy-twist',
		__( 'Candy Twist', 'wunderpaint' ),
		'twistExtrusion',
		'#fcabae',
		'#7163c1',
		{ depth: 68, amount: 86 },
		'candyGel',
		{ depth: 65, color: '#ffe4bc', color2: '#eb89a3' }
	),
	look(
		'pearl-fan',
		__( 'Pearl Fan', 'wunderpaint' ),
		'fanExtrusion',
		'#b9e2e2',
		'#bca4cf',
		{ depth: 75, amount: 88 },
		'porcelainGlaze',
		{ color: '#fff4e9', color2: '#c4ced9', depth: 52 }
	),
	look(
		'sunset-accordion',
		__( 'Sunset Accordion', 'wunderpaint' ),
		'accordionDepth',
		'#ffcc8f',
		'#b75a91',
		{ depth: 62, amount: 86, count: 24 },
		null,
		{}
	),
	look(
		'luminous-orbit',
		__( 'Luminous Orbit', 'wunderpaint' ),
		'orbitalEcho',
		'#b0eada',
		'#8b97d3',
		{ depth: 70, amount: 75, count: 12 },
		'liquidLens',
		{ color: '#daf9ee', color2: '#91c8d4' }
	),
	look(
		'coral-bloom',
		__( 'Coral Bloom', 'wunderpaint' ),
		'radialBloom',
		'#f7b09b',
		'#a65c96',
		{ depth: 50, amount: 83, count: 16 },
		null,
		{}
	),
	look(
		'blue-horizon',
		__( 'Blue Horizon', 'wunderpaint' ),
		'taperedTrail',
		'#a4d6ed',
		'#5366a8',
		{ depth: 94, amount: 95 },
		'brushedAlloy',
		{ color: '#deedf2', color2: '#8597b3', depth: 40 }
	),
	look(
		'emerald-stair',
		__( 'Emerald Stair', 'wunderpaint' ),
		'risingSteps',
		'#98dcc4',
		'#377b83',
		{ depth: 68, amount: 86, angle: 325 },
		null,
		{}
	),
	look(
		'split-sorbet',
		__( 'Split Sorbet', 'wunderpaint' ),
		'splitStream',
		'#ffb5a2',
		'#7c89cb',
		{ depth: 68, amount: 92, angle: 85 },
		null,
		{}
	),
	look(
		'golden-braid',
		__( 'Golden Braid', 'wunderpaint' ),
		'wovenTrail',
		'#ffdc9d',
		'#bb787b',
		{ depth: 86, amount: 94, count: 28 },
		null,
		{}
	),
	look(
		'arctic-stack',
		__( 'Arctic Stack', 'wunderpaint' ),
		'isometricLayers',
		'#c6f3e8',
		'#6a93b4',
		{ depth: 66, amount: 80, angle: 35 },
		'porcelainGlaze',
		{ color: '#f2ffed', color2: '#9bd8d1', depth: 52 }
	),
	look(
		'prismatic-shards',
		__( 'Prismatic Shards', 'wunderpaint' ),
		'glassShards',
		'#9cebd9',
		'#cf9bd6',
		{ amount: 60, depth: 48, scale: 53 },
		'dichroicFoil',
		{ color: '#b4f6d5', color2: '#d6a2e8' }
	),
	look(
		'copper-shutters',
		__( 'Copper Shutters', 'wunderpaint' ),
		'venetianFold',
		'#ffc69b',
		'#b37892',
		{ amount: 72, scale: 48, depth: 75, angle: 30 },
		null,
		{}
	),
	look(
		'floating-jade',
		__( 'Floating Jade', 'wunderpaint' ),
		'floatingTiles',
		'#c1f1d1',
		'#7ea3c7',
		{ amount: 62, scale: 66, depth: 45 },
		null,
		{}
	),
	look(
		'paper-weave',
		__( 'Paper Weave', 'wunderpaint' ),
		'diagonalWeave',
		'#f1dac0',
		'#a190b6',
		{ amount: 62, scale: 70, depth: 62 },
		null,
		{}
	),
	look(
		'folded-aurora',
		__( 'Folded Aurora', 'wunderpaint' ),
		'cutFold',
		'#a7e5d1',
		'#cca7c6',
		{ amount: 75, scale: 64, depth: 74 },
		null,
		{}
	),
	look(
		'violet-voltage',
		__( 'Violet Voltage', 'wunderpaint' ),
		'plasmaVeins',
		'#c9a3ff',
		'#6fe8e0',
		{ scale: 70, amount: 95, glow: 60 },
		null,
		{}
	),
	look(
		'mint-network',
		__( 'Mint Network', 'wunderpaint' ),
		'neonLattice',
		'#a0f7c9',
		'#a1a2f1',
		{ scale: 65, amount: 90, glow: 38 },
		null,
		{}
	),
	look(
		'prismatic-edge',
		__( 'Prismatic Edge', 'wunderpaint' ),
		'spectralEdge',
		'#78c8ff',
		'#ff9cc4',
		{ scale: 68, amount: 95, glow: 54 },
		null,
		{}
	),
	look(
		'champagne-flare',
		__( 'Champagne Flare', 'wunderpaint' ),
		'lightSweep',
		'#ffe5a7',
		'#bd9edc',
		{ scale: 75, amount: 96, glow: 55 },
		null,
		{}
	),
	look(
		'lagoon-light',
		__( 'Lagoon Light', 'wunderpaint' ),
		'causticGlow',
		'#b2f3df',
		'#58abc8',
		{ scale: 72, amount: 94, glow: 45 },
		null,
		{}
	),
	look(
		'topographic-gold',
		__( 'Topographic Gold', 'wunderpaint' ),
		'contourLandscape',
		'#edd8a1',
		'#9c8b70',
		{ depth: 60, amount: 72, count: 16, width: 16 },
		null,
		{}
	),
	look(
		'tidal-lines',
		__( 'Tidal Lines', 'wunderpaint' ),
		'rippleContours',
		'#a6eae4',
		'#968dcd',
		{ depth: 64, amount: 80, count: 16, width: 12 },
		null,
		{}
	),
	look(
		'coral-contours',
		__( 'Coral Contours', 'wunderpaint' ),
		'offsetContourTrail',
		'#f9c69a',
		'#b17b97',
		{ depth: 82, amount: 75, count: 16, width: 11 },
		null,
		{}
	),
	look(
		'signal-contour',
		__( 'Signal Contour', 'wunderpaint' ),
		'segmentedContours',
		'#e7e9bc',
		'#969dbe',
		{ depth: 68, amount: 62, count: 14, width: 15 },
		null,
		{}
	),
	look(
		'infinite-portal',
		__( 'Infinite Portal', 'wunderpaint' ),
		'wirePortal',
		'#a0f0d5',
		'#9891df',
		{ depth: 82, amount: 84, count: 18, width: 11 },
		null,
		{}
	),
];
