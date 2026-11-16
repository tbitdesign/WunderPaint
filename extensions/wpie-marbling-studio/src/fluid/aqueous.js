/** Dissolved amounts travel with the existing conservative aqueous exchange. */
export const AQUEOUS_MATERIALS = [
	{
		id: 'ink',
		label: 'Dense ink',
		color: '#3347a8',
		additive: true,
		volume: true,
		description:
			'Concentrated water-soluble ink. Its density bends the colored plume downward while currents stretch and mix it through the water.',
	},
	{
		id: 'glycerin',
		label: 'Glycerin',
		color: '#8d74c9',
		additive: true,
		volume: true,
		description:
			'A dense, viscous water solution. It dissolves into the bath, slows nearby motion and holds colored ribbons longer before they mix.',
	},
];

/** Artist-controlled mixture properties; no additional immiscible phase. */
export function aqueousProperties( ink, glycerin, settings ) {
	const total = 1 + ink + glycerin;
	return {
		density:
			( settings.densities.water +
				ink * settings.inkDensity +
				glycerin * 1.26 ) /
			total,
		viscosity:
			( settings.viscosities.water +
				ink * 0.12 +
				glycerin * settings.glycerinViscosity ) /
			total,
	};
}
