export const FLOW_SOURCES = [ 'rotor', 'jet' ];

/** Persistent mechanical forcing, using each solver's existing velocity field. */
export function applyFlowSources( sim, dt ) {
	for ( const source of sim.sources ) {
		if ( ! FLOW_SOURCES.includes( source.type ) || ! source.power ) {
			continue;
		}
		const rotor = source.type === 'rotor';
		const angle = ( ( source.angle || 0 ) * Math.PI ) / 180;
		const power = dt * source.power;
		const spin = source.spin ?? 1;
		const dx = Math.cos( angle ),
			dy = Math.sin( angle );
		if ( sim.kind !== 'volume' ) {
			sim.impulse(
				source.x,
				source.y,
				source.radius * 2,
				rotor ? 0 : dx * power * 38,
				rotor ? 0 : dy * power * 38,
				rotor ? spin * power * 65 : 0
			);
			continue;
		}
		for ( let i = 0; i < sim.count; i++ ) {
			if ( sim.crystal[ i ] > 0.85 ) {
				continue;
			}
			const rx =
				( sim.x[ i ] - source.x * sim.aspect ) / ( source.radius * 2 );
			const ry = ( sim.y[ i ] - source.y ) / ( source.radius * 2 );
			const rr = rx * rx + ry * ry;
			if ( rr >= 1 ) {
				continue;
			}
			const weight = power * ( 1 - rr ) ** 1.5 * 1.4;
			sim.vx[ i ] += ( rotor ? -ry * spin * 2 : dx ) * weight;
			sim.vy[ i ] += ( rotor ? rx * spin * 2 : dy ) * weight;
		}
	}
}
