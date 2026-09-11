/** Arrangements of existing materials, optics and movable solid forms. */
export const FEATURE_EXPERIMENTS = [
	{
		id: 'feature_glow_magnets',
		label: 'Glow magnets',
		material: 'ferro',
		description:
			'Two colored ferrofluid pools glow around a star. Move the magnets to reshape them.',
		fluorescence: 0.8,
		light: 0.35,
		angle: 38,
		tool: 'magnet',
		colors: { ferro: '#42e3be', oil: '#f3b54a' },
	},
	{
		id: 'feature_indicator_islands',
		label: 'Indicator islands',
		material: 'indicator',
		description:
			'Pink acid and cyan base meet in amber indicator ink. Move the rings and stir to open new color paths.',
		indicatorColors: {
			acid: '#f65499',
			neutral: '#efbf43',
			base: '#37cbd9',
		},
		bath: '#ddd8cf',
		tool: 'stir',
	},
	{
		id: 'feature_wax_slalom',
		label: 'Wax slalom',
		material: 'wax',
		description:
			'Warm wax and cool wax share a course of pebbles. Move heat and cold sources, then stir around the forms.',
		colors: { wax: '#f2a24c', silicone: '#76d5dc' },
		tool: 'heat',
		angle: 28,
	},
	{
		id: 'feature_silicone_ribbon',
		label: 'Silicone ribbon gate',
		material: 'silicone',
		description:
			'Two silicone colors flow beside a curved barrier. Move or rotate the form to change their route.',
		colors: { silicone: '#65cfd9', water: '#375383' },
		tool: 'wall',
		angle: 20,
	},
	{
		id: 'feature_volume_glow',
		label: 'Glowing depth',
		material: 'water',
		volume: true,
		description:
			'Glowing cyan and pink clouds sit at different depths. Lift the liquid or rotate the view to explore their overlap.',
		fluorescence: 0.85,
		light: 0.3,
		tool: 'lift',
		colors: { water: '#53d9eb' },
	},
	{
		id: 'feature_volume_passage',
		label: 'Magnetic passage',
		material: 'ferro',
		volume: true,
		description:
			'A magnet draws turquoise ferrofluid past solid posts in water. Move the magnet to steer the colored oil.',
		fluorescence: 0.3,
		light: 0.65,
		tool: 'magnet',
		colors: { ferro: '#32d2ba' },
	},
	{
		id: 'feature_volume_crystal_ring',
		label: 'Crystal ring',
		material: 'solution',
		volume: true,
		description:
			'A solid ring surrounds a cold crystal pocket. Move the warm source inside to dissolve it again.',
		fluorescence: 0.35,
		light: 0.6,
		tool: 'heat',
	},
	{
		id: 'feature_volume_reaction_star',
		label: 'Reaction star',
		material: 'activator',
		volume: true,
		description:
			'Glowing reaction fronts travel around a solid star. Add a small trigger where reactive liquid remains.',
		fluorescence: 0.7,
		light: 0.4,
		tool: 'pipette',
	},
].map( ( recipe ) => ( {
	bath: '#101f30',
	guided: true,
	feature: true,
	...( recipe.volume ? { volumeAngle: 70, viewZoom: 0.85 } : {} ),
	...recipe,
} ) );

export function prepareFeatureExperiment(
	id,
	{ sim, settings, drop, source, position }
) {
	const form = ( shape, x, y, size, angle = 0 ) => {
		const [ px, py ] = position( x, y );
		return { shape, x: px, y: py, size, angle, color: '#71828e' };
	};
	if ( id === 'feature_glow_magnets' ) {
		sim.customObstacles.add( form( 'star', 0.5, 0.5, 0.2 ) );
		settings.sourcePower = 1.45;
		settings.sourceRadius = 0.17;
		settings.magnetGap = 0.12;
		for ( const [ x, color ] of [
			[ 0.28, '#42e3be' ],
			[ 0.72, '#ed629e' ],
		] ) {
			for ( let k = 0; k < 12; k++ ) {
				const a = ( k * Math.PI ) / 6;
				drop(
					x + ( Math.cos( a ) * 0.1 ) / sim.aspect,
					0.5 + Math.sin( a ) * 0.13,
					0.075,
					'ferro',
					0.75,
					color
				);
			}
			source( 'magnet', x, 0.5 );
		}
	} else if ( id === 'feature_indicator_islands' ) {
		sim.customObstacles.addMany( [
			form( 'ring', 0.29, 0.5, 0.3 ),
			form( 'ring', 0.71, 0.5, 0.3 ),
		] );
		for ( let i = 0; i < sim.n; i++ ) {
			sim.indicator[ i ] = sim.wall[ i ] > 0.5 ? 0 : 0.5;
		}
		drop( 0.29, 0.5, 0.075, 'acid', 1.2 );
		drop( 0.71, 0.5, 0.075, 'base', 1.2 );
		drop( 0.4, 0.25, 0.14, 'acid', 0.8 );
		drop( 0.6, 0.75, 0.14, 'base', 0.8 );
	} else if ( id === 'feature_wax_slalom' ) {
		sim.customObstacles.addMany( [
			form( 'pebble', 0.5, 0.24, 0.16, 30 ),
			form( 'pebble', 0.5, 0.5, 0.16, -25 ),
			form( 'pebble', 0.5, 0.76, 0.16, 50 ),
		] );
		for ( const x of [ 0.27, 0.73 ] ) {
			for ( let k = 0; k < 10; k++ ) {
				drop(
					x + Math.sin( k * 0.5 ) * 0.025,
					0.25 + k * 0.055,
					0.07,
					'wax',
					0.8,
					x < 0.5 ? '#efa04e' : '#c694da'
				);
			}
		}
		const hot = position( 0.27, 0.5 );
		for ( let i = 0; i < sim.n; i++ ) {
			if ( sim.wax[ i ] > 0 ) {
				sim.temperature[ i ] =
					Math.hypot(
						( i % sim.w ) / ( sim.w - 1 ) - hot[ 0 ],
						Math.floor( i / sim.w ) / ( sim.h - 1 ) - hot[ 1 ]
					) < 0.32
						? 74
						: 24;
			}
		}
		settings.sourcePower = 2;
		settings.sourceRadius = 0.24;
		source( 'heat', 0.27, 0.5 );
		source( 'cool', 0.73, 0.5 );
		drop( 0.5, 0.36, 0.09, 'silicone', 0.8 );
		drop( 0.5, 0.64, 0.09, 'silicone', 0.8 );
	} else if ( id === 'feature_silicone_ribbon' ) {
		// A saved contour uses the same machinery as a form imported from a layer.
		const edge = Array.from( { length: 24 }, ( _, k ) => {
			const y = -0.5 + k / 23;
			return [ Math.sin( y * Math.PI * 2 ) * 0.16 - 0.065, y ];
		} );
		const shape = sim.customObstacles.addAsset( 'S-curve', [
			[
				...edge,
				...edge.map( ( [ x, y ] ) => [ x + 0.13, y ] ).reverse(),
			],
		] );
		sim.customObstacles.add( form( shape, 0.5, 0.5, 0.56 ) );
		settings.obstacleShape = shape;
		for ( let k = 0; k < 18; k++ ) {
			const y = 0.18 + k * 0.037;
			drop(
				0.34 + Math.sin( y * 8 ) * 0.035,
				y,
				0.06,
				'silicone',
				0.6,
				'#58cdda'
			);
			drop(
				0.66 + Math.sin( y * 8 ) * 0.035,
				y,
				0.06,
				'silicone',
				0.6,
				'#e479b3'
			);
		}
		const [ x, y ] = position( 0.5, 0.5 );
		sim.impulse( x, y, 0.43, 0, 0, 5 );
	}
}

export function prepareFeatureVolume(
	id,
	{ sim, settings, dye, shiftX, shiftY }
) {
	const position = ( x, y ) => [ x - shiftX, y - shiftY ];
	const form = ( shape, x, y, size ) => {
		const [ px, py ] = position( x, y );
		return { shape, x: px, y: py, size, color: '#748895' };
	};
	const source = ( type, x, y ) =>
		sim.addSource( type, ...position( x, y ), settings );
	for ( let i = 0; i < sim.count; i++ ) {
		const x = sim.x[ i ] / sim.aspect + shiftX,
			y = sim.y[ i ] + shiftY,
			z = sim.z[ i ];
		if ( id === 'feature_volume_glow' ) {
			if (
				Math.hypot(
					( x - 0.38 ) * sim.aspect,
					y - 0.44,
					( z - 0.19 ) * 2
				) < 0.2
			) {
				dye( i, '#46dbea', 0.65 );
			}
			if (
				Math.hypot(
					( x - 0.65 ) * sim.aspect,
					y - 0.58,
					( z - 0.09 ) * 2
				) < 0.17
			) {
				dye( i, '#ef65b6', 0.65 );
			}
		} else if ( id === 'feature_volume_passage' ) {
			if (
				z > 0.14 &&
				Math.hypot( ( x - 0.27 ) * sim.aspect, y - 0.5 ) < 0.2
			) {
				sim.phase[ i ] = 1;
				sim.ferro[ i ] = 1;
				dye( i, '#32d2ba' );
			} else {
				dye( i, '#355fc0', 0.06 );
			}
		} else if ( id === 'feature_volume_crystal_ring' ) {
			const cold = Math.hypot( ( x - 0.5 ) * sim.aspect, y - 0.5 ) < 0.13;
			sim.solute[ i ] = cold ? 1.1 : 0.35;
			sim.crystal[ i ] = cold && z < 0.18 ? 0.55 : 0;
			sim.temperature[ i ] = cold ? 10 : 35;
			dye( i, cold ? '#71dbea' : '#ce9acb', 0.18 );
		} else if ( id === 'feature_volume_reaction_star' ) {
			sim.reactive[ i ] = 1;
			sim.fuel[ i ] = 1;
			sim.excitation[ i ] =
				Math.min(
					Math.hypot( x - 0.27, y - 0.4 ),
					Math.hypot( x - 0.73, y - 0.6 )
				) < 0.09
					? 0.85
					: 0;
		}
	}
	if ( id === 'feature_volume_passage' ) {
		sim.customObstacles.addMany( [
			form( 'circle', 0.5, 0.3, 0.14 ),
			form( 'circle', 0.5, 0.7, 0.14 ),
		] );
		settings.sourceRadius = 0.28;
		settings.sourcePower = 2;
		source( 'magnet', 0.7, 0.5 );
	} else if ( id === 'feature_volume_crystal_ring' ) {
		sim.customObstacles.add( form( 'ring', 0.5, 0.5, 0.5 ) );
		settings.sourceRadius = 0.15;
		settings.sourcePower = 2;
		source( 'cool', 0.5, 0.5 );
		source( 'heat', 0.77, 0.5 );
	} else if ( id === 'feature_volume_reaction_star' ) {
		sim.customObstacles.add( form( 'star', 0.5, 0.5, 0.32 ) );
	}
}
