export const MATERIAL_EXPERIMENTS = [
	[
		'silicone_cells',
		'Silicone cells',
		'silicone',
		'Silicone spreads through an oil film and opens smooth cells. Add small drops and stir gently.',
	],
	[
		'silicone_ribbons',
		'Silky color ribbons',
		'silicone',
		'Two silicone colors meet and blend while the surrounding water color stays separate. Pull a slow curve through them.',
	],
	[
		'wax_duet',
		'Melt and set',
		'wax',
		'The warm wax stays glossy and mobile; the cold wax holds its shape. Move the heat and cold sources to swap their roles.',
	],
	[
		'wax_islands',
		'Wax islands',
		'wax',
		'Cold wax forms pale islands among the oils. Move a heat source over an island to soften its edge and release its color.',
	],
].map( ( [ id, label, material, description ] ) => ( {
	id,
	label,
	material,
	description,
	guided: true,
	bath: '#10262e',
	colors: {
		water: '#197c9b',
		oil: '#e87543',
		silicone: '#6ec8e1',
		wax: '#edac57',
	},
} ) );

export const MATERIAL_VOLUME_EXPERIMENTS = [
	[
		'volume_silicone',
		'Silicone over water',
		'silicone',
		'Silicone floats above blue water as its own liquid. Stir the colors or tilt the bath to move the layers.',
	],
	[
		'volume_wax',
		'Melting wax pools',
		'wax',
		'Two wax pools share the water. Heat keeps one soft and flowing; cooling makes the other denser in texture and slower to deform.',
	],
];

export function prepareMaterialExperiment(
	id,
	{ sim, settings, drop, source, position }
) {
	if ( id === 'silicone_cells' ) {
		for ( let y = 0.25; y < 0.8; y += 0.13 ) {
			for ( let x = 0.15; x < 0.88; x += 0.11 ) {
				drop( x, y, 0.11, 'oil', 0.7 );
			}
		}
		for ( const [ x, y ] of [
			[ 0.26, 0.35 ],
			[ 0.48, 0.55 ],
			[ 0.71, 0.32 ],
			[ 0.74, 0.72 ],
			[ 0.28, 0.74 ],
		] ) {
			drop( x, y, 0.065, 'silicone', 0.85 );
		}
		settings.tool = 'pipette';
	} else if ( id === 'silicone_ribbons' ) {
		for ( let k = 0; k < 22; k++ ) {
			const x = 0.15 + ( k / 21 ) * 0.7;
			drop(
				x,
				0.43 + Math.sin( x * 8 ) * 0.06,
				0.09,
				'silicone',
				0.6,
				'#54c3da'
			);
			drop(
				x,
				0.58 + Math.sin( x * 8 ) * 0.06,
				0.09,
				'silicone',
				0.6,
				'#e262a0'
			);
		}
		drop( 0.5, 0.5, 0.35, 'water', 0.35, '#e5bd4c' );
		settings.tool = 'stir';
		settings.oilDiffusion = 0.6;
	} else {
		const duet = id === 'wax_duet';
		for ( const x of [ 0.28, 0.72 ] ) {
			for ( let k = 0; k < 12; k++ ) {
				const a = ( k * Math.PI ) / 6;
				drop(
					x + ( Math.cos( a ) * 0.1 ) / sim.aspect,
					0.5 + Math.sin( a ) * 0.14,
					0.09,
					'wax',
					0.7,
					x < 0.5 ? '#ed8d48' : '#dda9dc'
				);
			}
		}
		const hot = position( 0.28, 0.5 );
		for ( let y = 0; y < sim.h; y++ ) {
			for ( let x = 0; x < sim.w; x++ ) {
				const i = y * sim.w + x;
				if ( sim.wax[ i ] > 0 ) {
					sim.temperature[ i ] =
						duet &&
						Math.hypot(
							x / ( sim.w - 1 ) - hot[ 0 ],
							y / ( sim.h - 1 ) - hot[ 1 ]
						) < 0.25
							? 74
							: 24;
				}
			}
		}
		if ( ! duet ) {
			for ( const y of [ 0.25, 0.76 ] ) {
				drop( 0.5, y, 0.17, 'oil', 0.7, '#35a2a9' );
			}
		}
		settings.sourceRadius = 0.18;
		settings.sourcePower = 1.8;
		source( 'heat', duet ? 0.28 : 0.5, 0.5 );
		if ( duet ) {
			source( 'cool', 0.72, 0.5 );
		}
		settings.tool = 'heat';
	}
}
