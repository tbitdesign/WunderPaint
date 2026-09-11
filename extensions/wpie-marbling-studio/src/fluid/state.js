import { FluidSimulation } from './simulation.js';
import { VolumeSimulation } from './volume.js';
export const restoreSimulation = ( raw ) =>
	raw?.kind === 'volume'
		? VolumeSimulation.restore( raw )
		: FluidSimulation.restore( raw );
