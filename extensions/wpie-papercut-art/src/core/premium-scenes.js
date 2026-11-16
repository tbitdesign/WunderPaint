/** Editable paper sculptures made from the same objects as the library. */
export const PREMIUM_SCENE_LABELS = [
	{
		id: 'lagoon-vault',
		label: 'Lagoon Vault',
		look: 'lagoon',
		window: 'organic',
		twist: 2.5,
		grain: 46,
	},
	{
		id: 'clay-strata',
		label: 'Clay Strata',
		look: 'terracotta',
		window: 'deckle',
		twist: -1,
		grain: 62,
	},
	{
		id: 'petal-theatre',
		label: 'Petal Theater',
		look: 'orchid',
		window: 'blossomwindow',
		twist: 5,
		grain: 36,
	},
	{
		id: 'gilded-portal',
		label: 'Gilded Portal',
		look: 'gilded',
		window: 'pointed',
		twist: 0,
		foil: true,
		grain: 32,
	},
	{
		id: 'polar-prism',
		label: 'Polar Prism',
		look: 'glacier',
		window: 'hex',
		twist: 7,
		grain: 40,
	},
	{
		id: 'ivory-shell',
		label: 'Ivory Shell',
		look: 'gallery',
		window: 'shell',
		twist: 2,
		grain: 52,
	},
	{
		id: 'copper-bloom',
		label: 'Copper Bloom',
		look: 'copper',
		window: 'star',
		twist: 4,
		foil: true,
		grain: 42,
	},
	{
		id: 'garden-cameo',
		label: 'Garden Cameo',
		look: 'pistachio',
		window: 'oval',
		twist: 1,
		garden: true,
		grain: 54,
	},
];
export function createPremiumPresets( object, layer, lookById ) {
	return PREMIUM_SCENE_LABELS.map( ( recipe ) => ( {
		id: recipe.id,
		label: recipe.label,
		theme: 'abstract',
		patch: () => {
			const look = lookById( recipe.look );
			const layers = [
				layer( { objects: [ object( 'backdrop', { seed: 17 } ) ] } ),
			];
			if ( recipe.id === 'clay-strata' ) {
				for ( let i = 0; i < 9; i++ )
					layers.push(
						layer( {
							elevation: 65 + i * 8,
							objects: [
								object( 'terrain', {
									profile: 'dunes',
									yBase: 30 + i * 7,
									height: 34,
									jag: 22,
									seed: 41 + i * 7,
								} ),
							],
						} )
					);
			} else {
				const count = recipe.garden ? 7 : 9;
				for ( let i = 0; i < count; i++ ) {
					layers.push(
						layer( {
							paper:
								recipe.foil && ( i === 2 || i === 6 )
									? 'foil'
									: '',
							color:
								recipe.foil && ( i === 2 || i === 6 )
									? '#bc924b'
									: '',
							elevation: 65 + i * 7,
							objects: [
								object( 'frame', {
									window: recipe.window,
									inset: 30 - i * ( recipe.garden ? 3.5 : 3 ),
									windowAngle:
										( i - ( count - 1 ) / 2 ) *
										recipe.twist,
									points: 9,
									sharp: 32,
									irregularity: 32,
									ornament: 32,
									seed: 41,
								} ),
							],
						} )
					);
				}
			}
			if ( recipe.garden ) {
				for ( const plant of [
					{
						species: 'fern',
						color: '#3f6452',
						x: 0.32,
						y: 0.85,
						scale: 59,
						rot: -18,
					},
					{
						species: 'lotus',
						color: '#e7b7a9',
						x: 0.58,
						y: 0.67,
						scale: 41,
						rot: 0,
					},
					{
						species: 'monstera',
						color: '#657b4e',
						x: 0.73,
						y: 0.88,
						scale: 45,
						rot: 16,
					},
				] )
					layers.push(
						layer( {
							color: plant.color,
							elevation: 140,
							objects: [
								object( 'plants', {
									...plant,
									count: 1,
									spread: 0,
									vary: 0,
									seed: 52,
								} ),
							],
						} )
					);
			}

			return {
				...look.finish,
				look: recipe.look,
				grain: recipe.grain,
				lightX: -45,
				lightY: -65,
				shadow: 58,
				soft: 38,
				glow: 26,
				detail: 85,
				photo: { source: 'none' },
				layers,
			};
		},
	} ) );
}
