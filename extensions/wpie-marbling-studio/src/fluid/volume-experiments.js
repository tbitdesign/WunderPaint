import { prepareFeatureVolume } from './feature-experiments.js';
import { MATERIAL_VOLUME_EXPERIMENTS } from './material-experiments.js';
import { encodePigment } from './pigment.js';
import { VolumeSimulation } from './volume.js';
import { cleanSettings } from './simulation.js';
export const VOLUME_EXPERIMENTS = [
	...MATERIAL_VOLUME_EXPERIMENTS,
	[
		'volume_oil_mix',
		'Oil mixing above water',
		'oil',
		'Red and yellow oil mix above blue water. The water stays separate from the oil layer.',
	],
	[
		'volume_bubbles_metal',
		'Rising bubbles, sinking metal',
		'metal',
		'Acid releases bubbles in bicarbonate solution while a metal drop sinks through the bath.',
	],
	[
		'volume_double_wave',
		'Meeting reaction waves',
		'activator',
		'Two reaction triggers send waves toward each other. Watch their fronts meet and use up the local fuel.',
	],
	[
		'volume_crystal_front',
		'Warm and cold crystals',
		'solution',
		'Cool one side to grow crystals and warm the other to dissolve them. Move the sources to shift the boundary.',
	],
	[
		'volume_tilt',
		'Tilted oil layer',
		'oil',
		'Gravity pulls the liquids toward the low side of the tilted basin. Adjust the bath tilt to send them back.',
	],
	[
		'volume_magnetic',
		'Magnetic oil in water',
		'ferro',
		'A magnet draws the dark magnetic oil through clear water. Move the magnet and watch the oil follow.',
	],
	[ 'volume_clouds', 'Submerged color clouds', 'water' ],
	[ 'volume_layers', 'Floating oil, sinking metal', 'metal' ],
	[ 'volume_splash', 'Splash basin', 'water' ],
	[ 'volume_honey', 'Viscous ribbons', 'thick' ],
	[ 'volume_bubbles', 'Effervescent colors', 'acid' ],
	[ 'volume_foam', 'Foam and currents', 'surfactant' ],
	[ 'volume_crystal', 'Cold crystal garden', 'solution' ],
	[ 'volume_melt', 'Dissolving crystals', 'solution' ],
	[ 'volume_waves', 'Traveling chemical waves', 'activator' ],
	[ 'volume_thermal', 'Convection vessel', 'water' ],
].map( ( [ id, label, material, description ] ) => ( {
	id,
	label,
	description,
	material,
	volume: true,
	bath: '#dae6e9',
	colors: {
		water: '#1c76c3',
		oil: '#e8aa34',
		thick: '#d87537',
		metal: '#b6ccdd',
	},
} ) );

export function createVolumeExperiment( recipe, aspect, seed, resolution ) {
	const settings = cleanSettings( {
		...recipe,
		seed,
		experiment: recipe.id,
		injectionDepth: 0.55,
		dropHeight: 0,
		diffusion: 0.65,
		volumeAngle: recipe.volumeAngle ?? 55,
		transparency: 0.7,
	} );
	if ( recipe.id === 'volume_tilt' ) {
		settings.tiltX = 18;
	}
	if ( recipe.id === 'volume_crystal_front' ) {
		settings.ambientTemperature = 24;
	}
	const sim = new VolumeSimulation( aspect, resolution < 80 ? 0.09 : 0.078 );
	sim.settings = settings;
	sim.serial = seed;
	const shiftX = seed === 17 ? 0 : ( sim.random() - 0.5 ) * 0.2;
	const shiftY = seed === 17 ? 0 : ( sim.random() - 0.5 ) * 0.2;
	sim.fill( 0.3 );
	const id = recipe.id;
	const dye = ( i, color, amount = 1 ) => {
		const pigment = encodePigment( color );
		sim.dye[ i ] = amount;
		for ( let k = 0; k < 12; k++ ) {
			sim.fields[ k ][ i ] = pigment[ k ] * amount;
		}
	};
	for ( let i = 0; i < sim.count; i++ ) {
		const x = sim.x[ i ] / aspect + shiftX,
			y = sim.y[ i ] + shiftY,
			z = sim.z[ i ];
		const shift = ( sim.random() - 0.5 ) * 0.04;
		if ( id === 'volume_silicone' || id === 'volume_wax' ) {
			const wax = id === 'volume_wax';
			if (
				z > 0.14 &&
				Math.min(
					Math.hypot( ( x - 0.3 ) * aspect, y - 0.5 ),
					Math.hypot( ( x - 0.7 ) * aspect, y - 0.5 )
				) < 0.18
			) {
				sim.phase[ i ] = wax ? 4 : 3;
				sim.temperature[ i ] = wax ? ( x < 0.5 ? 74 : 24 ) : 20;
				dye(
					i,
					wax
						? x < 0.5
							? '#ed9948'
							: '#d69bd0'
						: x < 0.5
						? '#70c9de'
						: '#d66daa'
				);
			} else {
				dye( i, '#248dba', 0.1 );
			}
		}
		if (
			id === 'volume_clouds' ||
			id === 'volume_thermal' ||
			id === 'volume_splash'
		) {
			if (
				Math.hypot( x - 0.38 - shift, y - 0.5, ( z - 0.21 ) * 2 ) < 0.18
			) {
				dye( i, '#146adb' );
			}
			if (
				Math.hypot( x - 0.65 - shift, y - 0.52, ( z - 0.13 ) * 2 ) <
				0.16
			) {
				dye( i, '#ed3d7a' );
			}
		}
		if (
			[ 'volume_oil_mix', 'volume_tilt', 'volume_magnetic' ].includes(
				id
			)
		) {
			if (
				z > 0.18 &&
				( id !== 'volume_magnetic' ||
					Math.hypot( x - 0.65, y - 0.5 ) < 0.2 )
			) {
				sim.phase[ i ] = 1;
				sim.thin[ i ] = id === 'volume_magnetic' ? 0 : 1;
				sim.ferro[ i ] = id === 'volume_magnetic' ? 1 : 0;
				dye(
					i,
					id === 'volume_magnetic'
						? '#181c24'
						: x < 0.5
						? '#ee4426'
						: '#eccd27'
				);
			} else {
				dye( i, '#2785c8', 0.15 );
			}
		}
		if ( id === 'volume_bubbles_metal' ) {
			sim.bicarbonate[ i ] = 0.9;
			dye( i, '#1fa99c', 0.25 );
			if ( Math.hypot( x - 0.32, y - 0.5 ) < 0.13 ) {
				sim.acid[ i ] = 0.65;
			}
		}
		if ( id === 'volume_double_wave' ) {
			sim.reactive[ i ] = 1;
			sim.fuel[ i ] = 1;
			sim.excitation[ i ] =
				Math.min(
					Math.hypot( x - 0.27, y - 0.5 ),
					Math.hypot( x - 0.73, y - 0.5 )
				) < 0.1
					? 0.85
					: 0;
		}
		if ( id === 'volume_crystal_front' ) {
			sim.solute[ i ] = 0.65;
			sim.crystal[ i ] =
				z < 0.17 && Math.abs( y - 0.5 ) < 0.25 ? 0.55 : 0;
			sim.temperature[ i ] = 12 + x * 35;
			dye( i, '#419ccc', 0.2 );
		}
		if ( id === 'volume_layers' && z > 0.22 ) {
			sim.phase[ i ] = 1;
			sim.thin[ i ] = 1;
			dye( i, '#e9aa28' );
		}
		if ( [ 'volume_bubbles', 'volume_foam' ].includes( id ) ) {
			sim.bicarbonate[ i ] = 0.8;
			dye( i, x < 0.5 ? '#199bb9' : '#d763a2', 0.45 );
			if ( Math.hypot( x - 0.5, y - 0.5 ) < 0.18 ) {
				sim.acid[ i ] = 0.65;
			}
			if ( id === 'volume_foam' ) {
				sim.surfactant[ i ] = 0.8;
			}
		}
		if ( [ 'volume_crystal', 'volume_melt' ].includes( id ) ) {
			sim.solute[ i ] = id === 'volume_crystal' ? 1.25 : 0.3;
			sim.crystal[ i ] =
				Math.hypot( x - 0.5, y - 0.5 ) < 0.24 && z < 0.13 ? 0.5 : 0;
			sim.temperature[ i ] = id === 'volume_crystal' ? 12 : 30;
			dye( i, '#36bbcf', 0.2 );
		}
		if ( id === 'volume_waves' ) {
			sim.reactive[ i ] = 1;
			sim.fuel[ i ] = 1;
			sim.excitation[ i ] =
				Math.hypot( x - 0.5, y - 0.5 ) < 0.1 ? 0.85 : 0;
		}
	}
	if ( recipe.feature ) {
		prepareFeatureVolume( id, { sim, settings, dye, shiftX, shiftY } );
	}
	if ( id === 'volume_wax' ) {
		settings.sourceRadius = 0.18;
		settings.sourcePower = 2;
		sim.addSource( 'heat', 0.3 - shiftX, 0.5 - shiftY, settings );
		sim.addSource( 'cool', 0.7 - shiftX, 0.5 - shiftY, settings );
		settings.tool = 'heat';
		settings.injectionDepth = 0;
	}
	if ( id === 'volume_bubbles_metal' ) {
		settings.injectionDepth = 0;
		settings.dropHeight = 0.18;
		sim.drop( 0.65 - shiftX, 0.5 - shiftY, 0.08, 'metal', '#c1d3e5', 1 );
	}
	if ( id === 'volume_magnetic' ) {
		settings.tool = 'magnet';
		sim.addSource( 'magnet', 0.36 - shiftX, 0.5 - shiftY, {
			...settings,
			sourcePower: 1.6,
			sourceRadius: 0.22,
		} );
	}
	if ( id === 'volume_crystal_front' ) {
		sim.addSource( 'cool', 0.25 - shiftX, 0.5 - shiftY, {
			...settings,
			sourcePower: 2,
			sourceRadius: 0.22,
		} );
		sim.addSource( 'heat', 0.75 - shiftX, 0.5 - shiftY, {
			...settings,
			sourcePower: 2,
			sourceRadius: 0.22,
		} );
	}
	if ( id === 'volume_layers' ) {
		settings.injectionDepth = 0;
		settings.dropHeight = 0.3;
		sim.drop( 0.56 - shiftX, 0.5 - shiftY, 0.09, 'metal', '#c1d3e5', 1 );
	}
	if ( id === 'volume_honey' ) {
		settings.injectionDepth = 0;
		settings.dropHeight = 0.22;
		sim.drop( 0.5 - shiftX, 0.5 - shiftY, 0.14, 'thick', '#d77d26', 1 );
	}
	if ( id === 'volume_splash' ) {
		settings.tool = 'lift';
		sim.impulse( 0.5 - shiftX, 0.5 - shiftY, 0.2, 0, 0, 0, 2 );
	}
	if ( id === 'volume_thermal' ) {
		sim.addSource( 'heat', 0.33 - shiftX, 0.5 - shiftY, {
			...settings,
			sourcePower: 2,
			sourceRadius: 0.22,
		} );
		sim.addSource( 'cool', 0.7 - shiftX, 0.5 - shiftY, {
			...settings,
			sourcePower: 2,
			sourceRadius: 0.22,
		} );
	}
	if ( id === 'volume_crystal' || id === 'volume_melt' ) {
		sim.addSource(
			id === 'volume_crystal' ? 'cool' : 'heat',
			0.5 - shiftX,
			0.5 - shiftY,
			{ ...settings, sourcePower: 2, sourceRadius: 0.25 }
		);
	}
	for ( let k = 0; k < 8; k++ ) {
		sim.step( settings );
	}
	return { sim, settings };
}
