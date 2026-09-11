/**
 * Reduced, finite-reagent chemistry. Amounts are model equivalents, not a
 * calibration for a particular bottle concentration or mineral species.
 */
export const solubility = ( temperature ) => 0.16 + temperature * 0.011;

export function reactParticle( sim, i, dt, settings ) {
	const temperature = sim.temperature[ i ];
	const rate = Math.exp( 0.025 * ( temperature - 20 ) );
	// H+ + HCO3- -> CO2 + H2O. Sodium/chloride counterions are implicit.
	const gas =
		Math.min( sim.acid[ i ], sim.bicarbonate[ i ] ) *
		( 1 - Math.exp( -4 * rate * dt ) );
	sim.acid[ i ] -= gas;
	sim.bicarbonate[ i ] -= gas;
	sim.gas[ i ] += gas;
	sim.salt[ i ] += gas;
	const neutral = Math.min( sim.acid[ i ], sim.base[ i ] );
	sim.acid[ i ] -= neutral;
	sim.base[ i ] -= neutral;
	sim.salt[ i ] += neutral;

	const excess = sim.solute[ i ] - solubility( temperature );
	// Supersaturation nucleates slowly; existing solid grows faster. The
	// reverse process uses the same mass ledger and dissolves in warm water.
	const growth =
		excess > 0
			? Math.min(
					excess,
					excess *
						dt *
						settings.crystalRate *
						( 0.12 + 2 * sim.crystal[ i ] )
			  )
			: -Math.min(
					sim.crystal[ i ],
					-excess * dt * settings.crystalRate * 1.8
			  );
	sim.solute[ i ] -= growth;
	sim.crystal[ i ] += growth;
	if ( sim.reactive[ i ] > 0.001 && sim.fuel[ i ] > 0 ) {
		// Excitable activator/inhibitor kinetics in the FitzHugh–Nagumo family.
		// Advection and diffusion happen in the actual liquid. Finite fuel
		// prevents an unpowered, everlasting color animation.
		const speed = rate * settings.reactionRate * 5;
		const steps = Math.max( 1, Math.ceil( ( dt * speed ) / 0.025 ) );
		const step = ( dt * speed ) / steps;
		for ( let k = 0; k < steps; k++ ) {
			const u = sim.excitation[ i ],
				v = sim.recovery[ i ];
			const available = Math.min( 1, sim.fuel[ i ] * 3 );
			sim.excitation[ i ] = Math.max(
				0,
				Math.min(
					1,
					u +
						step *
							( available * u * ( 1 - u ) * ( u - 0.12 ) * 5 -
								v * 0.9 )
				)
			);
			sim.recovery[ i ] = Math.max(
				0,
				Math.min( 2, v + step * 0.08 * ( u - v * 0.7 ) )
			);
			sim.fuel[ i ] = Math.max( 0, sim.fuel[ i ] - step * u * 0.006 );
		}
	} else {
		sim.excitation[ i ] *= Math.exp( -dt * 2 );
		sim.recovery[ i ] *= Math.exp( -dt );
	}
}

export function cleanBubbles( raw, aspect ) {
	if ( ! Array.isArray( raw ) || raw.length > 200 ) {
		throw new Error( 'Invalid bubbles' );
	}
	return raw.map( ( b ) => {
		if (
			! b ||
			! [ 'x', 'y', 'z', 'vx', 'vy', 'vz', 'amount', 'age' ].every(
				( key ) => Number.isFinite( b[ key ] )
			) ||
			b.x < 0 ||
			b.x > aspect ||
			b.y < 0 ||
			b.y > 1 ||
			b.z < 0 ||
			b.z > 1.2 ||
			b.amount <= 0 ||
			b.amount > 10000 ||
			b.age < 0 ||
			b.age > 100000 ||
			Math.max( Math.abs( b.vx ), Math.abs( b.vy ), Math.abs( b.vz ) ) >
				10
		) {
			throw new Error( 'Invalid bubble' );
		}
		return Object.fromEntries(
			[ 'x', 'y', 'z', 'vx', 'vy', 'vz', 'amount', 'age' ].map(
				( key ) => [ key, b[ key ] ]
			)
		);
	} );
}

export function updateBubbles( sim, dt ) {
	// Dissolved gas nucleates only above its local saturation concentration.
	for ( let i = 0; i < sim.count && sim.bubbles.length < 200; i++ ) {
		const saturation =
			0.035 * Math.exp( -0.012 * ( sim.temperature[ i ] - 20 ) );
		if ( sim.gas[ i ] <= saturation + 0.006 ) {
			continue;
		}
		const amount = sim.gas[ i ] - saturation;
		sim.gas[ i ] -= amount;
		sim.bubbles.push( {
			x: sim.x[ i ],
			y: sim.y[ i ],
			z: sim.z[ i ],
			vx: sim.vx[ i ],
			vy: sim.vy[ i ],
			vz: sim.vz[ i ],
			amount,
			age: 0,
		} );
	}
	const live = [];
	for ( const b of sim.bubbles ) {
		b.age += dt;
		let near = -1,
			best = Infinity,
			surface = 0;
		for ( let i = 0; i < sim.count; i++ ) {
			const d2 = ( sim.x[ i ] - b.x ) ** 2 + ( sim.y[ i ] - b.y ) ** 2;
			if ( d2 < sim.support ** 2 ) {
				surface = Math.max( surface, sim.z[ i ] + sim.spacing * 0.4 );
			}
			const d = d2 + ( sim.z[ i ] - b.z ) ** 2;
			if ( d < best ) {
				best = d;
				near = i;
			}
		}
		if ( near >= 0 ) {
			const drag = Math.min( 1, dt * ( 6 + sim.viscosity[ near ] ) );
			b.vx += ( sim.vx[ near ] - b.vx ) * drag;
			b.vy += ( sim.vy[ near ] - b.vy ) * drag;
			b.vz +=
				( sim.vz[ near ] +
					0.14 / ( 1 + sim.viscosity[ near ] * 0.05 ) -
					b.vz ) *
				drag;
			// Small entrainment impulse; gas mass itself remains in the ledger.
			sim.vz[ near ] += dt * Math.min( 0.3, b.amount ) * 0.15;
		}
		const x = b.x + b.vx * dt,
			y = b.y + b.vy * dt;
		if (
			sim.settings.boundary === 'open' &&
			( x < 0 || x > sim.aspect || y < 0 || y > 1 )
		) {
			sim.escapedGas += b.amount;
			continue;
		}
		b.x = Math.max( 0, Math.min( sim.aspect, x ) );
		b.y = Math.max( 0, Math.min( 1, y ) );
		b.z = Math.max( 0, b.z + b.vz * dt );
		const foamLife =
			near < 0 ? 0 : Math.min( 12, sim.surfactant[ near ] * 10 );
		if ( ( b.z >= surface && b.age > 0.2 + foamLife ) || b.z > 1.1 ) {
			sim.escapedGas += b.amount;
		} else {
			if ( b.z > surface ) {
				b.z = surface;
				b.vz = 0;
			}
			live.push( b );
		}
	}
	sim.bubbles = live;
}
