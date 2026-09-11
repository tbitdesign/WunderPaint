/** Ready-to-play arrangements of the existing physical liquids and sources. */
export const GUIDED_EXPERIMENTS = [
	[
		'lab_viscosity',
		'Thin and thick oil',
		'thick',
		'Stir both pools: thin oil flows readily, while thick oil holds its folds longer.',
	],
	[
		'lab_oil_water',
		'Oil on blue water',
		'oil',
		'Stir the orange oil through blue water. The colors share the bath but stay in separate liquids.',
	],
	[
		'lab_diffusion',
		'Quiet color blending',
		'oil',
		'Touching oil colors blend even without stirring. Stir gently to speed up the mixing.',
	],
	[
		'lab_warm_oil',
		'Warm oil, cold oil',
		'thick',
		'Both pools start with the same thick oil. Heat loosens one, while cold makes the other flow more slowly.',
	],
	[
		'lab_alcohol',
		'Evaporating bloom',
		'alcohol',
		'Alcohol opens the oil ring as it spreads. Its pushing effect fades as the alcohol evaporates.',
	],
	[
		'lab_soap_gate',
		'Surfactant channel',
		'surfactant',
		'Add surfactant near the narrow opening. Its surface pull carries color through the gap.',
	],
	[
		'lab_magnet_line',
		'Magnetic bridge',
		'ferro',
		'Two nearby magnets stretch a shared ferrofluid pool. Move a magnet to reshape the bridge.',
	],
	[
		'lab_magnet_ring',
		'Magnetic triangle',
		'ferro',
		'Three magnets compete for one pool. Move their handles to change where the ferrofluid gathers.',
	],
	[
		'lab_ferro_dilute',
		'Diluted ferrofluid',
		'oil',
		'The right pool contains plain oil as well as ferrofluid. Equal magnets reveal its weaker response.',
	],
	[
		'lab_metal_oil',
		'Metal among oil islands',
		'metal',
		'Stir reflective metal through oil and water. All three liquids keep their own boundaries.',
	],
	[
		'lab_ph',
		'Acid and base mosaic',
		'acid',
		'Yellow acidic patches meet blue alkaline patches. Stir them together to reveal neutral green.',
	],
	[
		'lab_buffer',
		'Buffered color fronts',
		'acid',
		'A stronger buffer softens the color change. Compare small and concentrated drops of acid or base.',
	],
].map( ( [ id, label, material, description ] ) => ( {
	id,
	label,
	material,
	description,
	guided: true,
	bath: '#dce5df',
	colors: {
		water: '#197fb8',
		oil: '#ed7040',
		thick: '#edbd35',
		metal: '#c0d7e8',
	},
} ) );

export function prepareGuidedExperiment(
	id,
	{ sim, settings, drop, source, position }
) {
	const ring = (
		x,
		y,
		radius,
		material,
		count = 16,
		amount = 0.65,
		color = settings.colors[ material ]
	) => {
		for ( let k = 0; k < count; k++ ) {
			const a = ( k * Math.PI * 2 ) / count;
			drop(
				x + ( Math.cos( a ) * radius ) / sim.aspect,
				y + Math.sin( a ) * radius,
				0.09,
				material,
				amount,
				color
			);
		}
	};
	if ( id === 'lab_viscosity' || id === 'lab_warm_oil' ) {
		for ( const x of [ 0.29, 0.71 ] ) {
			ring(
				x,
				0.5,
				0.16,
				id === 'lab_viscosity' && x < 0.5 ? 'oil' : 'thick'
			);
			const [ px, py ] = position( x, 0.5 );
			sim.impulse( px, py, 0.23, 0, 0, 10 );
		}
		if ( id === 'lab_warm_oil' ) {
			source( 'heat', 0.29, 0.5 );
			source( 'cool', 0.71, 0.5 );
		}
		settings.tool = 'stir';
	} else if ( id === 'lab_oil_water' || id === 'lab_metal_oil' ) {
		drop( 0.5, 0.5, 0.44, 'water', 1 );
		ring( 0.5, 0.5, 0.25, 'oil', 10 );
		if ( id === 'lab_metal_oil' ) {
			ring( 0.5, 0.5, 0.12, 'metal', 5 );
		}
		settings.tool = 'stir';
	} else if ( id === 'lab_diffusion' ) {
		settings.oilDiffusion = 1;
		settings.tension = 0.35;
		for ( let k = 0; k < 4; k++ ) {
			drop( 0.38, 0.23 + k * 0.18, 0.19, 'oil', 0.7, '#ec432c' );
			drop( 0.62, 0.23 + k * 0.18, 0.19, 'oil', 0.7, '#e8cf28' );
		}
		// Start at rest so the user can compare molecular mixing with stirring.
		sim.u.fill( 0 );
		sim.v.fill( 0 );
	} else if ( id === 'lab_alcohol' ) {
		ring( 0.5, 0.5, 0.22, 'oil', 20 );
		drop( 0.5, 0.5, 0.15, 'alcohol', 1 );
		settings.evaporation = 0.3;
		settings.alcoholStrength = 1.6;
	} else if ( id === 'lab_soap_gate' ) {
		for ( let k = 0; k <= 24; k++ ) {
			const y = 0.05 + ( k * 0.9 ) / 24;
			if ( Math.abs( y - 0.5 ) > 0.12 ) {
				const [ px, py ] = position( 0.5, y );
				sim.obstacle( px, py, 0.024 );
			}
		}
		ring( 0.28, 0.5, 0.16, 'oil', 12 );
		drop( 0.29, 0.5, 0.13, 'surfactant', 1 );
		drop( 0.73, 0.5, 0.2, 'water', 1 );
		settings.surfactantStrength = 1.8;
	} else if (
		[ 'lab_magnet_line', 'lab_magnet_ring', 'lab_ferro_dilute' ].includes(
			id
		)
	) {
		settings.sourcePower = 1.2;
		settings.sourceRadius = 0.16;
		settings.magnetGap = 0.16;
		settings.angle = 40;
		settings.tool = 'magnet';
		if ( id === 'lab_ferro_dilute' ) {
			ring( 0.28, 0.5, 0.12, 'ferro', 12, 0.6 );
			ring( 0.72, 0.5, 0.12, 'ferro', 12, 0.18 );
			ring( 0.72, 0.5, 0.12, 'oil', 12, 0.42 );
			source( 'magnet', 0.28, 0.5 );
			source( 'magnet', 0.72, 0.5 );
		} else if ( id === 'lab_magnet_line' ) {
			for ( let k = 0; k < 12; k++ ) {
				drop( 0.3 + ( k * 0.4 ) / 11, 0.5, 0.12, 'ferro', 0.6 );
			}
			source( 'magnet', 0.4, 0.5 );
			source( 'magnet', 0.6, 0.5 );
		} else {
			ring( 0.5, 0.5, 0.24, 'ferro', 24 );
			for ( let k = 0; k < 3; k++ ) {
				const a = ( k * Math.PI * 2 ) / 3 - Math.PI / 2;
				source(
					'magnet',
					0.5 + ( Math.cos( a ) * 0.23 ) / sim.aspect,
					0.5 + Math.sin( a ) * 0.23
				);
			}
		}
	} else if ( id === 'lab_ph' || id === 'lab_buffer' ) {
		sim.indicator.fill( 0.6 );
		settings.bufferCapacity = id === 'lab_buffer' ? 1 : 0.25;
		for ( let y = 0; y < 3; y++ ) {
			for ( let x = 0; x < 4; x++ ) {
				drop(
					0.2 + x * 0.2,
					0.25 + y * 0.25,
					0.16,
					( x + y ) % 2 ? 'base' : 'acid',
					id === 'lab_buffer' ? 0.2 + x * 0.45 : 0.8
				);
			}
		}
		settings.tool = 'stir';
	}
}
