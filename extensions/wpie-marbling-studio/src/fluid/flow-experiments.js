import { FluidSimulation, cleanSettings } from './simulation.js';
import { VolumeSimulation } from './volume.js';
import { rng } from '../marbling.js';

export const FLOW_EXPERIMENTS = [
	[
		'ink_plume',
		'Falling ink clouds',
		'ink',
		true,
		'Dense blue and rose ink descend through clear water. Change ink density and diffusion to shape the clouds.',
	],
	[
		'ink_whirlpool',
		'Ink whirlpool',
		'ink',
		true,
		'A lasting vortex draws two ink colors into curved ribbons. Move the source or reverse its rotation.',
	],
	[
		'glycerin_ribbons',
		'Glycerin ribbons',
		'glycerin',
		true,
		'Viscous glycerin slows the water around colored ribbons. A gentle current stretches them while the solution gradually mixes.',
	],
	[
		'ink_counterflow',
		'Meeting ink currents',
		'ink',
		true,
		'Two adjustable current jets carry colored ink toward each other. Their meeting flow folds and blends the plumes.',
	],
	[
		'surface_jets',
		'Flowing color channels',
		'water',
		false,
		'Two lasting current jets pull water colors into moving channels. Change the direction or move a source to redirect the flow.',
	],
	[
		'surface_rotors',
		'Counter-rotating pools',
		'oil',
		false,
		'Two persistent vortices turn in opposite directions, stretching colored oil islands across their shared current.',
	],
].map( ( [ id, label, material, volume, description ] ) => ( {
	id,
	label,
	material,
	volume,
	boundary: volume ? 'closed' : undefined,
	description,
	flowExperiment: true,
} ) );

export function createFlowExperiment( recipe, aspect, seed, resolution ) {
	const random = rng( seed );
	const settings = cleanSettings( {
		...recipe,
		experiment: recipe.id,
		seed,
		boundary: 'closed',
		bath: recipe.volume ? '#edf1ee' : '#1d3548',
		injectionDepth: 0.12,
		dropHeight: 0,
		diffusion: 0.12,
		volumeAngle: 60,
		transparency: 0.9,
		gloss: 0.62,
		vorticity: 0.35,
		tension: 0.28,
		inkDensity: 1.3,
		colors: { ink: '#284ac9', glycerin: '#ac76c9' },
	} );
	const sim = recipe.volume
		? new VolumeSimulation( aspect, resolution < 80 ? 0.09 : 0.078 )
		: new FluidSimulation( aspect, resolution );
	sim.settings = settings;
	const shift = () => ( random() - 0.5 ) * 0.06;
	const source = ( type, x, y, angle = 0, spin = 1, power = 0.55 ) =>
		sim.addSource( type, x, y, {
			...settings,
			sourceRadius: 0.24,
			sourcePower: power,
			sourceAngle: angle,
			sourceSpin: spin,
		} );
	const drop = (
		x,
		y,
		color,
		material = recipe.material,
		amount = 1.5,
		radius = 0.075
	) =>
		sim.drop(
			x + shift(),
			y + shift(),
			radius,
			material,
			color,
			amount,
			1
		);
	if ( recipe.volume ) {
		sim.serial = seed;
		sim.fill( recipe.id === 'ink_plume' ? 0.46 : 0.38 );
		for ( let k = 0; k < 8; k++ ) {
			sim.step( settings );
		}
		if ( recipe.id === 'glycerin_ribbons' ) {
			settings.injectionDepth = 0.38;
			for ( const x of [ 0.32, 0.44, 0.56, 0.68 ] ) {
				drop( x, 0.5, '#bca0dc', 'glycerin', 2.6, 0.12 );
				drop(
					x,
					0.5,
					x < 0.5 ? '#793fa8' : '#168eac',
					'ink',
					0.6,
					0.045
				);
			}
			source( 'jet', 0.3, 0.5, 0, 1, 0.25 );
		} else {
			drop( 0.4, 0.47, '#264ad5', 'ink', 1.7 );
			drop( 0.6, 0.54, '#c3447e', 'ink', 1.4 );
			if ( recipe.id === 'ink_whirlpool' ) {
				source( 'rotor', 0.5, 0.5 );
			} else if ( recipe.id === 'ink_counterflow' ) {
				source( 'jet', 0.27, 0.42, 20, 1, 0.45 );
				source( 'jet', 0.73, 0.58, -160, 1, 0.45 );
			}
		}
	} else {
		for ( let k = 0; k < 12; k++ ) {
			drop(
				0.17 + k * 0.06,
				0.42 + Math.sin( k * 1.1 ) * 0.15,
				k % 2 ? '#e69a42' : '#2baec0',
				recipe.material,
				0.6,
				0.08
			);
		}
		if ( recipe.id === 'surface_rotors' ) {
			source( 'rotor', 0.34, 0.5, 0, 1 );
			source( 'rotor', 0.66, 0.5, 0, -1 );
		} else {
			source( 'jet', 0.25, 0.4, 20 );
			source( 'jet', 0.75, 0.6, -160 );
		}
	}
	for ( let k = 0; k < ( recipe.volume ? 5 : 16 ); k++ ) {
		sim.step( settings );
	}
	return { sim, settings };
}
