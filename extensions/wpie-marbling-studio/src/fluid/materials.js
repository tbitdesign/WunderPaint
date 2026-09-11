/** Representative artistic PDMS and wax grades, not a calibrated formulation. */
export const EXTRA_LIQUIDS = [
	{
		id: 'silicone',
		label: 'Silicone oil',
		color: '#74c8e9',
		viscosity: 1.7,
		description:
			'A silky oil with low surface tension. It spreads into smooth cells, stays separate from water and the studio oils, and changes viscosity only gently with temperature.',
	},
	{
		id: 'wax',
		label: 'Liquid wax',
		color: '#f2b864',
		viscosity: 1.3,
		description:
			'Warm colored wax that sets as it cools. Heat softens and melts it again; cold preserves its folds. Pour temperature and melting point control the transition.',
	},
];

export function waxMelt( temperature, meltingPoint = 56 ) {
	const t = Math.max(
		0,
		Math.min( 1, ( temperature - meltingPoint + 4 ) / 8 )
	);
	return t * t * ( 3 - 2 * t );
}

/** Cold wax resists deformation; this film model does not solve rigid rafts. */
export function waxMobility( temperature, meltingPoint ) {
	const melt = waxMelt( temperature, meltingPoint );
	return 0.003 + 0.997 * melt * melt;
}

export function extraSurfaceForces( sim, settings, present, dt ) {
	const { w, h } = sim;
	for ( const key of [ 'silicone', 'wax' ] ) {
		if ( ! present[ key ] ) {
			continue;
		}
		const field = sim[ key ],
			potential = sim.extraPotential[ key ];
		const phase = ( i ) => Math.min( 1, Math.max( 0, field[ i ] ) );
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x,
					c = phase( i );
				const lap =
					phase( i - 1 ) +
					phase( i + 1 ) +
					phase( i - w ) +
					phase( i + w ) -
					4 * c;
				potential[ i ] =
					2 * c * ( 1 - c ) * ( 1 - 2 * c ) -
					0.6 * lap +
					1.5 *
						( sim.oilAt( i ) +
							sim.metal[ i ] +
							sim[ key === 'wax' ? 'silicone' : 'wax' ][ i ] );
			}
		}
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x,
					mobility = key === 'wax' ? sim.waxFlow[ i ] : 1;
				const force =
					dt *
					settings.tension *
					( key === 'silicone' ? 7 : 24 ) *
					phase( i ) *
					mobility;
				sim.u[ i ] -=
					( potential[ i + 1 ] - potential[ i - 1 ] ) * force;
				sim.v[ i ] -=
					( potential[ i + w ] - potential[ i - w ] ) * force;
				for ( const j of [
					x < w - 2 ? i + 1 : -1,
					y < h - 2 ? i + w : -1,
				] ) {
					if ( j < 0 ) {
						continue;
					}
					const mobile =
						key === 'wax'
							? Math.min( mobility, sim.waxFlow[ j ] )
							: 1;
					sim.separate(
						i,
						j,
						dt *
							settings.tension *
							0.22 *
							mobile *
							( potential[ i ] - potential[ j ] ),
						[ key ]
					);
				}
			}
		}
	}
}

/** Equal-and-opposite pigment exchange within each connected new phase. */
export function mixExtraPigments( sim, settings, present, dt ) {
	for ( const key of [ 'silicone', 'wax' ] ) {
		if ( ! present[ key ] || settings.oilDiffusion <= 0 ) {
			continue;
		}
		const amount = sim[ key ];
		for ( let f = 0; f < sim.interiorFaceCount; f++ ) {
			const i = sim.faceFrom[ f ],
				j = sim.faceTo[ f ];
			const mobility =
				key === 'wax'
					? Math.min( sim.waxFlow[ i ], sim.waxFlow[ j ] )
					: 1;
			sim.oilExchange[ f ] =
				amount[ i ] > 1e-6 && amount[ j ] > 1e-6
					? Math.min(
							0.1,
							( dt * settings.oilDiffusion * 4 * mobility ) /
								( 1 + ( sim.nu[ i ] + sim.nu[ j ] ) * 0.2 )
					  ) * Math.min( amount[ i ], amount[ j ] )
					: 0;
		}
		for ( const field of sim[ key + 'Pigments' ] ) {
			sim.temp.set( field );
			for ( let f = 0; f < sim.interiorFaceCount; f++ ) {
				if ( ! sim.oilExchange[ f ] ) {
					continue;
				}
				const i = sim.faceFrom[ f ],
					j = sim.faceTo[ f ];
				const flux =
					sim.oilExchange[ f ] *
					( field[ i ] / amount[ i ] - field[ j ] / amount[ j ] );
				sim.temp[ i ] -= flux;
				sim.temp[ j ] += flux;
			}
			field.set( sim.temp );
		}
	}
}
