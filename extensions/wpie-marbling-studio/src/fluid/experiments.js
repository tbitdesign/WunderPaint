import {
	FEATURE_EXPERIMENTS,
	prepareFeatureExperiment,
} from './feature-experiments.js';
import {
	MATERIAL_EXPERIMENTS,
	prepareMaterialExperiment,
} from './material-experiments.js';
import {
	GUIDED_EXPERIMENTS,
	prepareGuidedExperiment,
} from './guided-experiments.js';
import {
	VOLUME_EXPERIMENTS,
	createVolumeExperiment,
} from './volume-experiments.js';
import { FluidSimulation, cleanSettings } from './simulation.js';
import { rng } from '../marbling.js';

const SURFACE_EXPERIMENTS = [
	[
		'mix_orange',
		'Red meets yellow',
		'oil',
		'#e9e3d8',
		'#25899a',
		'#ee3b24',
		'#edcb28',
	],
	[
		'mix_green',
		'Blue meets yellow',
		'oil',
		'#e8e7dd',
		'#25899a',
		'#164bd0',
		'#f5d525',
	],
	[
		'thermal_flow',
		'Warm currents',
		'oil',
		'#172e3b',
		'#267e9a',
		'#e86d3d',
		'#e7c67a',
	],
	[
		'thermal_islands',
		'Hot and cold',
		'thick',
		'#e5e5d7',
		'#3186a8',
		'#df7741',
		'#edc971',
	],
	[
		'ferro_pool',
		'Magnetic pool',
		'ferro',
		'#d6e3e2',
		'#327c93',
		'#d9a641',
		'#d9b671',
	],
	[
		'ferro_twin',
		'Two magnets',
		'ferro',
		'#e0d8cb',
		'#347b87',
		'#df914b',
		'#d9b671',
	],
	[
		'hot_ferro',
		'Warm magnetism',
		'ferro',
		'#cfdfd9',
		'#318aa3',
		'#db9f45',
		'#e9c874',
	],
	[
		'reactive_fronts',
		'Reaction fronts',
		'indicator',
		'#eeece0',
		'#25899a',
		'#db9145',
		'#edcb28',
	],
	[
		'reactive_vortex',
		'Reactive swirls',
		'indicator',
		'#e9e7dd',
		'#25899a',
		'#db9145',
		'#edcb28',
	],
	[
		'thermal_reaction',
		'Heated reactions',
		'indicator',
		'#e4ece6',
		'#25899a',
		'#db9145',
		'#edcb28',
	],
	[
		'islands',
		'Oil islands',
		'oil',
		'#23424b',
		'#147d9b',
		'#ec793e',
		'#efc463',
	],
	[
		'twins',
		'Twin vortices',
		'water',
		'#eaf0ee',
		'#217daf',
		'#e56d77',
		'#e4b24c',
	],
	[
		'honey',
		'Honey glass',
		'thick',
		'#182c35',
		'#217d87',
		'#d17937',
		'#e6b649',
	],
	[
		'lagoon',
		'Blue lagoon',
		'water',
		'#d9ebe3',
		'#1259a6',
		'#35b8aa',
		'#efda87',
	],
	[
		'ribbons',
		'Silk ribbons',
		'thick',
		'#f0dfd0',
		'#7e528e',
		'#dc7766',
		'#eac65c',
	],
	[
		'pearls',
		'Oil pearls',
		'oil',
		'#1e3847',
		'#246491',
		'#ea8562',
		'#ecc972',
	],
	[
		'petals',
		'Petal pool',
		'oil',
		'#eaded5',
		'#71406e',
		'#d96d86',
		'#ebaa78',
	],
	[
		'current',
		'Countercurrent',
		'water',
		'#e1e8df',
		'#145f7c',
		'#d96649',
		'#d9b36b',
	],
	[
		'archipelago',
		'Archipelago',
		'oil',
		'#122a3b',
		'#348b9e',
		'#dcac4d',
		'#eadebd',
	],
	[
		'river',
		'Color river',
		'water',
		'#e4e8e6',
		'#256b98',
		'#e19f67',
		'#bd5c6f',
	],
	[
		'folds',
		'Slow folds',
		'thick',
		'#f1dfc7',
		'#496d76',
		'#bb6242',
		'#d7ab54',
	],
	[
		'orbit',
		'Orbital flow',
		'oil',
		'#1e3043',
		'#627fad',
		'#db8654',
		'#e1c38a',
	],
	[
		'cells',
		'Cell garden',
		'oil',
		'#dee7d1',
		'#257869',
		'#d68565',
		'#dcc15d',
	],
	[
		'aurora',
		'Aurora ink',
		'water',
		'#20233a',
		'#458cbb',
		'#56b3a6',
		'#ce7daf',
	],
	[
		'tides',
		'Amber tides',
		'thick',
		'#27474c',
		'#3a8f93',
		'#ce8650',
		'#edbf65',
	],
	[
		'silver',
		'Silver beads',
		'metal',
		'#22323f',
		'#337b9a',
		'#c57d4a',
		'#ead098',
		'#d7e6f2',
	],
	[
		'silver_stream',
		'Silver stream',
		'metal',
		'#17293a',
		'#388ca6',
		'#d68b5d',
		'#e5c16a',
		'#deeaf5',
	],
	[
		'alcohol_bloom',
		'Alcohol bloom',
		'alcohol',
		'#e9e1d5',
		'#943f85',
		'#e7a23a',
		'#e8cf88',
	],
	[
		'alcohol_lagoon',
		'Alcohol lagoon',
		'alcohol',
		'#e3efdf',
		'#1a7995',
		'#deb144',
		'#e8d9a5',
	],
	[
		'soap_cells',
		'Open cells',
		'surfactant',
		'#e7e6d7',
		'#327981',
		'#d67750',
		'#e8ba5d',
	],
	[
		'soap_channels',
		'Moving channels',
		'surfactant',
		'#cfe5e1',
		'#14677d',
		'#c85867',
		'#efb270',
	],
	[
		'blank',
		'Clear bath',
		'water',
		'#e3e9e4',
		'#1675bc',
		'#ed793b',
		'#e8bd53',
	],
].map(
	( [
		id,
		label,
		material,
		bath,
		water,
		oil,
		thick,
		metal = '#d8e3ed',
	] ) => ( {
		id,
		label,
		material,
		bath,
		colors: { water, oil, thick, metal },
	} )
);

export const EXPERIMENTS = [
	...FEATURE_EXPERIMENTS,
	...MATERIAL_EXPERIMENTS,
	...GUIDED_EXPERIMENTS,
	...VOLUME_EXPERIMENTS,
	...SURFACE_EXPERIMENTS,
];

export function createExperiment( id, aspect, seed = 17, resolution = 144 ) {
	const recipe =
		EXPERIMENTS.find( ( r ) => r.id === id ) || SURFACE_EXPERIMENTS[ 0 ];
	if ( recipe.volume ) {
		return createVolumeExperiment( recipe, aspect, seed, resolution );
	}
	const settings = cleanSettings( {
		...recipe,
		experiment: recipe.id,
		seed,
	} );
	const sim = new FluidSimulation( aspect, resolution );
	const rand = rng( seed );
	const coupled =
		recipe.guided ||
		/^(mix_|thermal_|ferro_|hot_ferro|reactive_)/.test( recipe.id );
	// New variations move the starting liquids and their apparatus together.
	// Seed 17 is the reference arrangement used by the preview cards.
	const vary = coupled && settings.seed !== 17;
	const rotation = vary ? ( rand() - 0.5 ) * 0.8 : 0;
	const shiftX = vary ? ( rand() - 0.5 ) * 0.08 : 0;
	const shiftY = vary ? ( rand() - 0.5 ) * 0.08 : 0;
	const position = ( x, y ) => {
		if ( ! vary ) {
			return [ x, y ];
		}
		const dx = ( x - 0.5 ) * sim.aspect,
			dy = y - 0.5;
		return [
			Math.max(
				0.06,
				Math.min(
					0.94,
					0.5 +
						( dx * Math.cos( rotation ) -
							dy * Math.sin( rotation ) ) /
							sim.aspect +
						shiftX
				)
			),
			Math.max(
				0.06,
				Math.min(
					0.94,
					0.5 +
						dx * Math.sin( rotation ) +
						dy * Math.cos( rotation ) +
						shiftY
				)
			),
		];
	};
	const drop = (
		x,
		y,
		r,
		mat = recipe.material,
		amount = 0.9,
		color = settings.colors[ mat ]
	) => {
		const [ px, py ] = position( x, y );
		sim.drop( px, py, r, mat, color, amount );
	};
	const source = ( type, x, y ) => {
		const [ px, py ] = position( x, y );
		return sim.addSource( type, px, py, settings );
	};
	const line = ( y, mat, phase = 0, amp = 0.04 ) => {
		for ( let k = 0; k < 40; k++ ) {
			const x = 0.08 + ( k / 39 ) * 0.84;
			drop( x, y + Math.sin( x * 9 + phase ) * amp, 0.05, mat, 0.55 );
		}
	};
	if ( recipe.id === 'blank' ) {
		return { sim, settings };
	}
	const additive =
		recipe.material === 'alcohol' || recipe.material === 'surfactant';
	if ( recipe.feature ) {
		prepareFeatureExperiment( recipe.id, {
			sim,
			settings,
			drop,
			source,
			position,
		} );
	} else if (
		MATERIAL_EXPERIMENTS.some( ( item ) => item.id === recipe.id )
	) {
		prepareMaterialExperiment( recipe.id, {
			sim,
			settings,
			drop,
			source,
			position,
		} );
	} else if ( recipe.guided ) {
		prepareGuidedExperiment( recipe.id, {
			sim,
			settings,
			drop,
			source,
			position,
		} );
	} else if ( recipe.id.startsWith( 'mix_' ) ) {
		for ( let j = 0; j < 3; j++ ) {
			const y = 0.27 + j * 0.23;
			drop( 0.37, y, 0.21, 'oil', 0.7, settings.colors.oil );
			drop( 0.63, y, 0.21, 'oil', 0.7, settings.colors.thick );
		}
		sim.impulse( 0.5, 0.5, 0.45, 0, 0, 14 );
	} else if ( recipe.material === 'indicator' ) {
		sim.indicator.fill( 0.6 );
		settings.material = 'acid';
		if ( recipe.id === 'reactive_vortex' ) {
			for ( let k = 0; k < 10; k++ ) {
				const angle = ( k * Math.PI ) / 5 + rand() * 0.2;
				drop(
					0.5 + Math.cos( angle ) * 0.26,
					0.5 + Math.sin( angle ) * 0.28,
					0.16,
					k % 2 ? 'acid' : 'base'
				);
			}
			sim.impulse( 0.5, 0.5, 0.45, 0, 0, 18 );
		} else {
			drop( 0.36, 0.5, 0.3, 'acid', 1.5 );
			drop( 0.64, 0.5, 0.3, 'base', 1.5 );
			sim.impulse( 0.5, 0.5, 0.4, 0, 0, 7 );
		}
		if ( recipe.id === 'thermal_reaction' ) {
			source( 'heat', 0.5, 0.35 );
			source( 'cool', 0.5, 0.72 );
		}
	} else if ( recipe.material === 'ferro' ) {
		settings.sourcePower = 1.4;
		settings.sourceRadius = 0.18;
		settings.magnetGap = 0.16;
		settings.angle = 28;
		settings.depth = 0.9;
		const twin = recipe.id === 'ferro_twin';
		for ( let k = 0; k < 16; k++ ) {
			const angle = ( k * Math.PI ) / 8;
			drop(
				0.5 + Math.cos( angle ) * ( twin ? 0.21 : 0.15 ),
				0.5 + Math.sin( angle ) * 0.18,
				0.12,
				'ferro',
				0.7
			);
		}
		source( 'magnet', twin ? 0.35 : 0.5, 0.5 );
		if ( twin ) {
			source( 'magnet', 0.65, 0.5 );
		}
		if ( recipe.id === 'hot_ferro' ) {
			source( 'heat', 0.4, 0.4 );
			source( 'cool', 0.67, 0.65 );
			line( 0.6, 'oil', 0.5, 0.06 );
		}
		settings.tool = 'magnet';
	} else if ( recipe.id.startsWith( 'thermal_' ) ) {
		for ( let j = 0; j < 6; j++ ) {
			line( 0.2 + j * 0.12, j % 2 ? 'thick' : 'oil', j * 0.6, 0.04 );
		}
		source( 'heat', 0.4, 0.4 );
		source( 'cool', 0.68, 0.65 );
		if ( recipe.id === 'thermal_islands' ) {
			source( 'heat', 0.3, 0.75 );
		}
		settings.tool = 'heat';
	} else if ( recipe.material === 'metal' ) {
		if ( recipe.id === 'silver_stream' ) {
			for ( let j = 0; j < 4; j++ ) {
				line( 0.2 + j * 0.19, 'metal', j * 1.1, 0.07 );
			}
			sim.impulse( 0.5, 0.5, 0.46, 0, 0, 12 );
		} else {
			for ( let k = 0; k < 20; k++ ) {
				drop(
					0.13 + rand() * 0.74,
					0.14 + rand() * 0.72,
					0.035 + rand() * 0.055,
					'metal'
				);
			}
			line( 0.55, 'water', 1.5, 0.15 );
			sim.impulse( 0.5, 0.5, 0.45, 0, 0, 7 );
		}
	} else if ( additive ) {
		for ( let j = 0; j < 7; j++ ) {
			line(
				0.15 + j * 0.11,
				j % 2 === 0 ? 'water' : 'oil',
				j * 0.4,
				0.035
			);
		}
		const count =
			recipe.id === 'alcohol_bloom'
				? 1
				: recipe.id === 'soap_cells'
				? 12
				: 5;
		for ( let k = 0; k < count; k++ ) {
			const a = ( k * Math.PI * 2 ) / count;
			const radius =
				count === 1 ? 0 : recipe.id === 'soap_channels' ? 0.19 : 0.26;
			drop(
				0.5 + Math.cos( a ) * radius,
				0.5 + Math.sin( a ) * radius,
				count === 1 ? 0.2 : 0.08,
				recipe.material,
				1
			);
		}
		sim.impulse(
			0.5,
			0.5,
			0.46,
			0,
			0,
			recipe.id === 'alcohol_lagoon' ? -6 : 3
		);
	} else if (
		[ 'ribbons', 'folds', 'tides', 'current', 'river', 'aurora' ].includes(
			recipe.id
		)
	) {
		for ( let j = 0; j < 6; j++ ) {
			line(
				0.14 + j * 0.14,
				j % 3 === 0 ? 'water' : j % 3 === 1 ? 'oil' : 'thick',
				j * 0.7 + rand(),
				recipe.id === 'river' ? 0.1 : 0.04
			);
		}
		for ( let j = 0; j < 4; j++ ) {
			sim.impulse(
				0.25 + ( j % 2 ) * 0.5,
				0.27 + Math.floor( j / 2 ) * 0.46,
				0.24,
				0,
				0,
				( j % 2 ? -1 : 1 ) * 9
			);
		}
	} else if ( [ 'twins', 'orbit', 'petals' ].includes( recipe.id ) ) {
		const count = recipe.id === 'petals' ? 9 : 24;
		for ( let k = 0; k < count; k++ ) {
			const a = ( k / count ) * Math.PI * 2;
			drop(
				0.5 + Math.cos( a ) * 0.27,
				0.5 + Math.sin( a ) * 0.31,
				recipe.id === 'petals' ? 0.12 : 0.075,
				k % 3 === 0 ? 'water' : k % 3 === 1 ? 'oil' : 'thick'
			);
		}
		if ( recipe.id === 'twins' ) {
			sim.impulse( 0.33, 0.5, 0.38, 0, 0, 18 );
			sim.impulse( 0.67, 0.5, 0.38, 0, 0, -18 );
		} else {
			sim.impulse( 0.5, 0.5, 0.46, 0, 0, 18 );
		}
	} else {
		const count =
			recipe.id === 'pearls' || recipe.id === 'cells'
				? 48
				: recipe.id === 'honey'
				? 12
				: 26;
		for ( let k = 0; k < count; k++ ) {
			const x = 0.11 + rand() * 0.78,
				y = 0.12 + rand() * 0.76;
			const r =
				recipe.id === 'pearls'
					? 0.035 + rand() * 0.035
					: 0.045 + rand() * 0.1;
			const mat =
				recipe.id === 'honey'
					? 'thick'
					: k % 4 === 0
					? 'water'
					: k % 4 === 1
					? 'thick'
					: recipe.material;
			drop( x, y, r, mat );
			if ( k % 3 === 0 ) {
				drop( x - 0.015, y + 0.01, r * 0.4, 'water' );
			}
		}
		sim.impulse( 0.48, 0.5, 0.4, 0, 0, 6 );
	}
	// The start is an actual short run, also used to produce the cards.
	for ( let k = 0; k < ( additive ? 90 : coupled ? 48 : 8 ); k++ ) {
		sim.step( settings );
	}
	return { sim, settings };
}
