import { encodePigment, decodePigment } from './pigment.js';

const clamp = ( x, a, b ) => Math.max( a, Math.min( b, x ) );
export const SOURCE_TYPES = [ 'heat', 'cool', 'magnet' ];
export const MAX_SOURCES = 12;

/** Sources are apparatus outside the bath, and survive save/open. */
export function cleanSources( sources ) {
	if ( ! Array.isArray( sources ) || sources.length > MAX_SOURCES ) {
		throw new Error( 'Invalid fluid sources' );
	}
	const ids = new Set();
	return sources.map( ( source ) => {
		if (
			! source ||
			! SOURCE_TYPES.includes( source.type ) ||
			! Number.isInteger( source.id ) ||
			source.id < 1 ||
			ids.has( source.id ) ||
			! [ 'x', 'y', 'radius', 'power', 'gap' ].every( ( key ) =>
				Number.isFinite( source[ key ] )
			) ||
			source.x < 0 ||
			source.x > 1 ||
			source.y < 0 ||
			source.y > 1 ||
			source.radius < 0.02 ||
			source.radius > 0.4 ||
			source.power < 0 ||
			source.power > 3 ||
			source.gap < 0.04 ||
			source.gap > 0.5
		) {
			throw new Error( 'Invalid fluid source' );
		}
		ids.add( source.id );
		return {
			id: source.id,
			type: source.type,
			x: source.x,
			y: source.y,
			radius: source.radius,
			power: source.power,
			gap: source.gap,
		};
	} );
}

export function attachInfluences( sim ) {
	sim.sources = [];
	sim.sourceKey = null;
	for ( const key of [
		'temperature0',
		'ferroLaplacian',
		'ferroNext',
		'warming',
		'cooling',
		'magnetic',
		'magneticX',
		'magneticY',
	] ) {
		sim[ key ] = new Float32Array( sim.n );
	}
}

function sourceFields( sim ) {
	const key = JSON.stringify( sim.sources );
	if ( key === sim.sourceKey ) {
		return;
	}
	sim.sourceKey = key;
	const { w, h, aspect, warming, cooling, magnetic, magneticX, magneticY } =
		sim;
	warming.fill( 0 );
	cooling.fill( 0 );
	magnetic.fill( 0 );
	magneticX.fill( 0 );
	magneticY.fill( 0 );
	if ( ! sim.sources.length ) {
		return;
	}
	for ( let y = 1; y < h - 1; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = y * w + x;
			let bx = 0,
				by = 0,
				bz = 0;
			for ( const source of sim.sources ) {
				const dx = ( x / ( w - 1 ) - source.x ) * aspect;
				const dy = y / ( h - 1 ) - source.y;
				const rr = dx * dx + dy * dy;
				if ( source.type === 'magnet' ) {
					// Field of a vertical point dipole below the bath. All three
					// components are summed BEFORE squaring to get field energy.
					const z = source.gap;
					const den = ( rr + z * z ) ** 2.5;
					const moment = source.power * source.radius ** 3 * 0.5;
					bx += ( moment * 3 * dx * z ) / den;
					by += ( moment * 3 * dy * z ) / den;
					bz += ( moment * ( 2 * z * z - rr ) ) / den;
				} else {
					const weight =
						Math.exp(
							( -rr / ( source.radius * source.radius ) ) * 2
						) * source.power;
					( source.type === 'heat' ? warming : cooling )[ i ] +=
						weight;
				}
			}
			magnetic[ i ] = Math.min( 9, bx * bx + by * by + bz * bz );
		}
	}
	for ( let y = 1; y < h - 1; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = y * w + x;
			magneticX[ i ] = ( magnetic[ i + 1 ] - magnetic[ i - 1 ] ) * 0.5;
			magneticY[ i ] = ( magnetic[ i + w ] - magnetic[ i - w ] ) * 0.5;
		}
	}
}

/** Temperature is a material property, not a dye or a display overlay. */
export function updateTemperature( sim, settings, dt ) {
	sourceFields( sim );
	if (
		! sim.sources.some( ( source ) => source.type !== 'magnet' ) &&
		sim.temperature.every(
			( value ) => value === settings.ambientTemperature
		)
	) {
		return;
	}
	const { w, h, temperature: t, temperature0: next, wall } = sim;
	next.set( t );
	for ( let y = 1; y < h - 1; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = y * w + x;
			if ( wall[ i ] > 0.5 ) {
				continue;
			}
			const tx = clamp( x - dt * sim.u[ i ], 1, w - 2 );
			const ty = clamp( y - dt * sim.v[ i ], 1, h - 2 );
			const j = Math.round( ty ) * w + Math.round( tx );
			next[ i ] = wall[ j ] > 0.5 ? t[ i ] : sim.sample( t, tx, ty );
		}
	}
	for ( let y = 1; y < h - 1; y++ ) {
		for ( let x = 1; x < w - 1; x++ ) {
			const i = y * w + x;
			if ( wall[ i ] > 0.5 ) {
				continue;
			}
			let lap = 0;
			for ( const j of [ i - 1, i + 1, i - w, i + w ] ) {
				if (
					j % w > 0 &&
					j % w < w - 1 &&
					j >= w &&
					j < w * ( h - 1 ) &&
					wall[ j ] < 0.5
				) {
					lap += next[ j ] - next[ i ];
				}
			}
			const warm = sim.warming[ i ],
				cool = sim.cooling[ i ];
			// Newton heat exchange with the environment and with hot/cold
			// apparatus. The 0..90 C range deliberately stays below boiling.
			t[ i ] = clamp(
				next[ i ] +
					dt *
						( 3 * lap +
							0.025 *
								( settings.ambientTemperature - next[ i ] ) +
							warm * ( 90 - next[ i ] ) +
							cool * ( 0 - next[ i ] ) ),
				0,
				90
			);
		}
	}
}

/**
 * Near-onset normal-field instability: a Swift–Hohenberg amplitude equation
 * selects a finite wavelength and saturates nonlinearly. This reduced model
 * resolves evolving peaks, not the full Maxwell/free-boundary problem.
 * The capillary length sets the preferred wavelength; stronger fields grow
 * the pattern and removing the field lets it relax. No fixed cone texture.
 */
export function updateMagneticSurface( sim, dt, settings = {} ) {
	const {
		w,
		h,
		magnetHeight: height,
		ferroPattern: a,
		ferroLaplacian: lap,
		ferroNext: next,
		wall,
		oil,
		thick,
		ferro,
		magnetic,
	} = sim;
	if (
		( ! sim.sources.some( ( source ) => source.type === 'magnet' ) ||
			! ferro.some( ( value ) => value > 1e-6 ) ) &&
		! height.some( ( value ) => value > 1e-6 ) &&
		! a.some( ( value ) => Math.abs( value ) > 0.002 )
	) {
		// Float32 residuals otherwise keep this costly substep active forever.
		// The cutoff is far below a visible height; fluid and pigment stay intact.
		height.fill( 0 );
		a.fill( 0 );
		return;
	}
	const q2 = clamp(
		( 0.24 * ( 144 / Math.max( w, h ) ) ** 2 ) /
			Math.sqrt( Math.max( 0.2, settings.tension ?? 0.85 ) ),
		0.08,
		1.1
	);
	const q4 = q2 * q2;
	const steps = Math.max( 1, Math.ceil( dt / 0.005 ) ),
		step = dt / steps;
	for ( let k = 0; k < steps; k++ ) {
		lap.fill( 0 );
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				lap[ i ] =
					( a[ i - 1 ] +
						a[ i + 1 ] +
						a[ i - w ] +
						a[ i + w ] -
						4 * a[ i ] ) *
						0.25 +
					q2 * a[ i ];
			}
		}
		next.set( a );
		for ( let y = 2; y < h - 2; y++ ) {
			for ( let x = 2; x < w - 2; x++ ) {
				const i = y * w + x;
				const total = oil[ i ] + thick[ i ] + ferro[ i ];
				const fraction = total > 1e-6 ? ferro[ i ] / total : 0;
				const field =
					magnetic[ i ] * fraction * Math.min( 1, total * 3 );
				// Keep the uniform mode stable: only a finite wave band grows.
				const mu = clamp( ( field - 0.35 ) * 3, -8, 0.8 ) * q4;
				const biharmonic =
					( lap[ i - 1 ] +
						lap[ i + 1 ] +
						lap[ i - w ] +
						lap[ i + w ] -
						4 * lap[ i ] ) *
						0.25 +
					q2 * lap[ i ];
				const noise =
					mu > 0
						? ( ( Math.imul( i + 17, 1597334677 ) >>> 0 ) /
								4294967296 -
								0.5 ) *
						  ( 0.06 * q4 )
						: 0;
				next[ i ] =
					wall[ i ] > 0.5 || fraction < 0.001
						? 0
						: clamp(
								a[ i ] +
									step *
										30 *
										( mu * a[ i ] -
											biharmonic +
											0.1 * q4 * a[ i ] ** 2 -
											q4 * a[ i ] ** 3 +
											noise ),
								-1.3,
								1.8
						  );
			}
		}
		a.set( next );
	}
	for ( let i = 0; i < sim.n; i++ ) {
		const total = oil[ i ] + thick[ i ] + ferro[ i ];
		const fraction = total > 1e-6 ? ferro[ i ] / total : 0;
		const field = magnetic[ i ] * fraction * Math.min( 1, total * 3 );
		const peak = Math.max( 0, a[ i ] );
		const target =
			wall[ i ] > 0.5
				? 0
				: Math.min( 0.025, field * 0.012 ) +
				  peak ** 3 * 0.025 * fraction;
		height[ i ] = clamp(
			height[ i ] + dt * 8 * ( target - height[ i ] ),
			0,
			0.14
		);
	}
}

/**
 * Fast strong-acid/base neutralization: equal equivalents form salt.
 * Counterions are implicit; acid+salt and base+salt are each conserved.
 */
export function neutralize( sim ) {
	for ( let i = 0; i < sim.n; i++ ) {
		const consumed = Math.min( sim.acid[ i ], sim.base[ i ] );
		sim.acid[ i ] -= consumed;
		sim.base[ i ] -= consumed;
		sim.salt[ i ] += consumed;
	}
}

/**
 * Charge balance with a weak buffer initially at pH 7. Concentrations are
 * reduced bath equivalents (1 unit = 1 mmol/L), not bottle concentrations.
 */
export function acidity( acid, base, buffer = 0.5 ) {
	const delta = ( base - acid ) * 0.001;
	const capacity = buffer * 0.002;
	const ka = 1e-7;
	let lo = -12,
		hi = -2;
	for ( let k = 0; k < 28; k++ ) {
		const mid = ( lo + hi ) * 0.5;
		const hydrogen = 10 ** mid;
		const balance =
			hydrogen -
			1e-14 / hydrogen -
			( capacity * ka ) / ( ka + hydrogen ) +
			capacity * 0.5 +
			delta;
		if ( balance > 0 ) {
			hi = mid;
		} else {
			lo = mid;
		}
	}
	return -( lo + hi ) * 0.5;
}

/**
 * Yellow/blue indicator states, with the transition of bromothymol blue.
 * Colors are illustrative spectra. Equilibrium pKa is fixed at room
 * temperature; no claim to temperature-calibrated laboratory pH readings.
 */
export const DEFAULT_INDICATOR_COLORS = Object.freeze( {
	acid: '#f6d324',
	neutral: '#60a948',
	base: '#194fcb',
} );

/** A missing palette preserves the appearance of saved older experiments. */
export function cleanIndicatorColors( raw ) {
	if ( ! raw || typeof raw !== 'object' || Array.isArray( raw ) ) {
		return null;
	}
	return Object.fromEntries(
		Object.entries( DEFAULT_INDICATOR_COLORS ).map(
			( [ key, fallback ] ) => [
				key,
				typeof raw[ key ] === 'string' &&
				/^#[\da-f]{6}$/i.test( raw[ key ] )
					? raw[ key ].toLowerCase()
					: fallback,
			]
		)
	);
}

export function indicatorIndex( acid, base ) {
	return Math.max(
		0,
		Math.min( 1024, Math.round( ( base - acid ) * 256 ) + 512 )
	);
}

export function indicatorPalette( buffer, colors = null ) {
	const acid = encodePigment( colors?.acid || '#f6d324' ),
		base = encodePigment( colors?.base || '#194fcb' );
	const neutral = colors ? encodePigment( colors.neutral ) : null;
	// The art palette adds a neutral stop at pH 7 to the existing equilibrium.
	// It changes only the visible spectra, never the reagent concentrations.
	const neutralFraction = 1 / ( 1 + 10 ** 0.1 );
	return Array.from( { length: 1025 }, ( _, i ) => {
		const net = ( i - 512 ) / 256;
		const ph = acidity( Math.max( 0, -net ), Math.max( 0, net ), buffer );
		const fraction = 1 / ( 1 + 10 ** ( 7.1 - ph ) );
		if ( neutral ) {
			const lower = fraction <= neutralFraction;
			const f = lower
				? fraction / neutralFraction
				: ( fraction - neutralFraction ) / ( 1 - neutralFraction );
			const mix = f * f * ( 3 - 2 * f );
			const from = lower ? acid : neutral,
				to = lower ? neutral : base;
			return Float64Array.from(
				from,
				( value, k ) => value * ( 1 - mix ) + to[ k ] * mix
			);
		}
		return Float64Array.from(
			acid,
			( value, k ) => value * ( 1 - fraction ) + base[ k ] * fraction
		);
	} );
}

const EMPTY_PIGMENT_FIELDS = Array.from(
	{ length: 12 },
	() => new Float32Array( 1 )
);

/** One bounded lookup per renderer/simulation; dragging a color replaces it. */
export class IndicatorPalette {
	update( buffer, colors = null ) {
		if (
			this.spectra &&
			this.buffer === buffer &&
			this.acid === colors?.acid &&
			this.neutral === colors?.neutral &&
			this.base === colors?.base
		) {
			return;
		}
		this.buffer = buffer;
		this.acid = colors?.acid;
		this.neutral = colors?.neutral;
		this.base = colors?.base;
		this.spectra = indicatorPalette( buffer, colors );
		this.rgb = colors
			? this.spectra.map( ( spectrum ) =>
					decodePigment( EMPTY_PIGMENT_FIELDS, 0, 0, [], spectrum, 1 )
			  )
			: null;
	}
}
