/**
 * PBF velocity post-process, following Macklin & Müller (2013), section 5.
 * https://mmacklin.com/pbf_sig_preprint.pdf
 * Restores resolved circulation; a resting bath gains no procedural motion.
 */
export function confineVorticity( sim, strength, dt ) {
	if ( ! strength || ! sim.count ) {
		return;
	}
	if ( ! sim.curl ) {
		sim.curl = Array.from(
			{ length: 7 },
			() => new Float32Array( sim.x.length )
		);
	}
	const [ wx, wy, wz, magnitude, gx, gy, gz ] = sim.curl;
	for ( const field of sim.curl ) {
		field.fill( 0, 0, sim.count );
	}
	const h2 = sim.support ** 2;
	for ( let k = 0; k < sim.pairCount; k++ ) {
		const i = sim.from[ k ],
			j = sim.to[ k ];
		if ( sim.phase[ i ] !== 0 || sim.phase[ j ] !== 0 ) {
			continue;
		}
		const x = sim.x[ i ] - sim.x[ j ],
			y = sim.y[ i ] - sim.y[ j ],
			z = sim.z[ i ] - sim.z[ j ];
		const q = 1 - ( x * x + y * y + z * z ) / h2;
		if ( q <= 0 ) {
			continue;
		}
		const scale = ( -q * q ) / h2;
		const ux = sim.vx[ j ] - sim.vx[ i ],
			uy = sim.vy[ j ] - sim.vy[ i ],
			uz = sim.vz[ j ] - sim.vz[ i ];
		const cx = ( uy * z - uz * y ) * scale;
		const cy = ( uz * x - ux * z ) * scale;
		const cz = ( ux * y - uy * x ) * scale;
		wx[ i ] += cx;
		wx[ j ] += cx;
		wy[ i ] += cy;
		wy[ j ] += cy;
		wz[ i ] += cz;
		wz[ j ] += cz;
	}
	for ( let i = 0; i < sim.count; i++ ) {
		magnitude[ i ] = Math.hypot( wx[ i ], wy[ i ], wz[ i ] );
	}
	for ( let k = 0; k < sim.pairCount; k++ ) {
		const i = sim.from[ k ],
			j = sim.to[ k ];
		if ( sim.phase[ i ] !== 0 || sim.phase[ j ] !== 0 ) {
			continue;
		}
		const x = sim.x[ i ] - sim.x[ j ],
			y = sim.y[ i ] - sim.y[ j ],
			z = sim.z[ i ] - sim.z[ j ];
		const q = 1 - ( x * x + y * y + z * z ) / h2;
		if ( q <= 0 ) {
			continue;
		}
		const scale = ( -( magnitude[ j ] - magnitude[ i ] ) * q * q ) / h2;
		gx[ i ] += x * scale;
		gx[ j ] += x * scale;
		gy[ i ] += y * scale;
		gy[ j ] += y * scale;
		gz[ i ] += z * scale;
		gz[ j ] += z * scale;
	}
	for ( let i = 0; i < sim.count; i++ ) {
		const length = Math.hypot( gx[ i ], gy[ i ], gz[ i ] );
		if ( length < 1e-7 || sim.crystal[ i ] > 0.85 ) {
			continue;
		}
		const scale = ( dt * strength * sim.support * 0.15 ) / length;
		const x = ( gy[ i ] * wz[ i ] - gz[ i ] * wy[ i ] ) * scale;
		const y = ( gz[ i ] * wx[ i ] - gx[ i ] * wz[ i ] ) * scale;
		const z = ( gx[ i ] * wy[ i ] - gy[ i ] * wx[ i ] ) * scale;
		const limit = Math.min(
			1,
			( dt * 1.5 ) / Math.max( 1e-8, Math.hypot( x, y, z ) )
		);
		sim.vx[ i ] += x * limit;
		sim.vy[ i ] += y * limit;
		sim.vz[ i ] += z * limit;
	}
}
