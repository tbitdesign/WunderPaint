import { Obstacles } from './obstacles.js';
import { waxMelt, waxMobility } from './materials.js';
/**
 * Three-dimensional equal-volume particles with mass-weighted position-based
 * incompressibility. Pressure, collisions and pigment exchange act on positions
 * in x/y/z, including detached drops. This is a bounded interactive PBF model,
 * not a calibrated continuum solver. See Macklin & Müller, PBF (2013).
 */
import { cleanSettings, MATERIALS, clamp, hexColor } from './simulation.js';
import {
	cleanSources,
	MAX_SOURCES,
	SOURCE_TYPES,
	acidity,
	IndicatorPalette,
	indicatorIndex,
} from './influences.js';
import { reactParticle, updateBubbles, cleanBubbles } from './reactions.js';
import { encodePigment, PIGMENT_SUFFIXES, decodePigment } from './pigment.js';

export const VOLUME_LIMIT = 2400;
export const VOLUME_FIELDS = [
	'x',
	'y',
	'z',
	'vx',
	'vy',
	'vz',
	'phase',
	'temperature',
	'dye',
	'thin',
	'thick',
	'ferro',
	'acid',
	'base',
	'indicator',
	'salt',
	'alcohol',
	'surfactant',
	'bicarbonate',
	'gas',
	'solute',
	'crystal',
	'reactive',
	'excitation',
	'recovery',
	'fuel',
	...PIGMENT_SUFFIXES.map( ( key ) => 'pigment' + key ),
];
export const RELATIVE_DENSITY = {
	water: 1,
	oil: 0.83,
	thick: 0.92,
	ferro: 1.25,
	metal: 6.5,
	silicone: 0.97,
	wax: 0.88,
};
const signed = new Set( [
	'vx',
	'vy',
	'vz',
	'pigmentCR',
	'pigmentCG',
	'pigmentCB',
] );
const kernel = ( q2 ) => ( q2 < 1 ? ( 1 - q2 ) ** 3 : 0 );
// Interior lattice density, using the very same compact kernel as the solver.
let lattice = 0;
for ( let z = -2; z <= 2; z++ ) {
	for ( let y = -2; y <= 2; y++ ) {
		for ( let x = -2; x <= 2; x++ ) {
			lattice += kernel( ( x * x + y * y + z * z ) / 4 );
		}
	}
}

export class VolumeSimulation {
	constructor( aspect = 4 / 3, spacing = 0.078 ) {
		this.kind = 'volume';
		this.aspect = clamp( aspect, 0.5, 2 );
		this.spacing = clamp( spacing, 0.04, 0.09 );
		this.support = this.spacing * 2;
		this.maxZ = 1.1;
		this.w = 144;
		this.h = Math.round( 144 / this.aspect );
		this.count = 0;
		this.time = 0;
		this.serial = 1;
		this.sources = [];
		this.obstacles = [];
		this.customObstacles = new Obstacles( this );
		this.bubbles = [];
		this.escapedGas = 0;
		this.settings = cleanSettings();
		this.indicatorPalette = new IndicatorPalette();
		this.pending = 0;
		for ( const key of VOLUME_FIELDS ) {
			this[ key ] = new Float32Array( VOLUME_LIMIT );
		}
		for ( const key of [
			'oldX',
			'oldY',
			'oldZ',
			'lambda',
			'density',
			'inverseMass',
			'viscosity',
			'gx',
			'gy',
			'gz',
			'norm',
			'dx',
			'dy',
			'dz',
		] ) {
			this[ key ] = new Float32Array( VOLUME_LIMIT );
		}
		this.next = new Int32Array( VOLUME_LIMIT );
		this.from = new Uint16Array( VOLUME_LIMIT * 100 );
		this.to = new Uint16Array( VOLUME_LIMIT * 100 );
		this.pairCount = 0;
		this.fields = PIGMENT_SUFFIXES.map(
			( key ) => this[ 'pigment' + key ]
		);
	}
	clear() {
		this.count = 0;
		this.time = 0;
		this.serial = 1;
		this.pending = 0;
		this.sources = [];
		this.obstacles = [];
		this.customObstacles = new Obstacles( this );
		this.bubbles = [];
		this.escapedGas = 0;
		for ( const key of VOLUME_FIELDS ) {
			this[ key ].fill( 0 );
		}
	}
	random() {
		this.serial = ( Math.imul( this.serial, 1664525 ) + 1013904223 ) >>> 0;
		return this.serial / 4294967296;
	}
	addParticle( x, y, z, material = 'water', color = '#ffffff', dye = 0 ) {
		if ( this.count >= VOLUME_LIMIT ) {
			return -1;
		}
		const i = this.count++;
		for ( const key of VOLUME_FIELDS ) {
			this[ key ][ i ] = 0;
		}
		this.x[ i ] = clamp(
			x,
			this.spacing * 0.45,
			this.aspect - this.spacing * 0.45
		);
		this.y[ i ] = clamp( y, this.spacing * 0.45, 1 - this.spacing * 0.45 );
		this.z[ i ] = clamp( z, this.spacing * 0.45, this.maxZ );
		this.temperature[ i ] = this.settings.ambientTemperature;
		this.phase[ i ] =
			material === 'silicone'
				? 3
				: material === 'wax'
				? 4
				: material === 'metal'
				? 2
				: [ 'oil', 'thick', 'ferro' ].includes( material )
				? 1
				: 0;
		this.thin[ i ] = material === 'oil' ? 1 : 0;
		this.thick[ i ] = material === 'thick' ? 1 : 0;
		this.ferro[ i ] = material === 'ferro' ? 1 : 0;
		if ( material === 'wax' ) {
			this.temperature[ i ] = this.settings.waxPourTemperature;
		}
		this.dye[ i ] = dye;
		const p = encodePigment(
			hexColor(
				color,
				MATERIALS.find( ( m ) => m.id === material )?.color
			)
		);
		for ( let k = 0; k < 12; k++ ) {
			this.fields[ k ][ i ] = p[ k ] * dye;
		}
		return i;
	}
	fill( level = 0.24, material = 'water', color = '#ffffff', dye = 0 ) {
		const s = this.spacing;
		for ( let z = s * 0.55; z < level; z += s ) {
			for ( let y = s * 0.55; y < 1 - s * 0.45; y += s ) {
				for ( let x = s * 0.55; x < this.aspect - s * 0.45; x += s ) {
					this.addParticle( x, y, z, material, color, dye );
				}
			}
		}
	}
	level() {
		// A bulk-surface estimate from occupied height, independent of the
		// compressed boundary layer and of a few detached airborne drops.
		const histogram = new Uint32Array( 48 );
		for ( let i = 0; i < this.count; i++ ) {
			histogram[
				Math.min( 47, Math.floor( ( this.z[ i ] / this.maxZ ) * 48 ) )
			]++;
		}
		let below = 0;
		for ( let k = 0; k < 48; k++ ) {
			below += histogram[ k ];
			if ( below >= this.count * 0.88 ) {
				return Math.min(
					0.9,
					( ( k + 0.5 ) / 48 ) * this.maxZ + this.spacing * 0.45
				);
			}
		}
		return this.spacing;
	}

	drop(
		x,
		y,
		radius,
		material,
		color,
		amount = 0.65,
		strength = 1,
		pourTemperature = this.settings.waxPourTemperature
	) {
		const info = MATERIALS.find( ( m ) => m.id === material );
		if ( ! info ) {
			return;
		}
		const radiusWorld = Math.max( this.spacing * 0.55, radius );
		const level = this.level();
		const z = Math.max(
			this.spacing,
			level * ( 1 - ( this.settings.injectionDepth || 0 ) ) +
				( this.settings.dropHeight ?? 0.09 )
		);
		if ( info.additive ) {
			const pigment = info.reagent ? null : encodePigment( color );
			let hits = 0;
			for ( let i = 0; i < this.count; i++ ) {
				if ( this.phase[ i ] !== 0 ) {
					continue;
				}
				const d =
					( this.x[ i ] - x * this.aspect ) ** 2 +
					( this.y[ i ] - y ) ** 2 +
					( this.z[ i ] - Math.min( level, z ) ) ** 2;
				const q = Math.exp( -d / ( radiusWorld ** 2 * 2 ) );
				if ( q < 0.02 ) {
					continue;
				}
				const dose = q * amount * ( info.reagent ? strength : 1 );
				if ( pigment ) {
					this.dye[ i ] += dose * 0.15;
					for ( let k = 0; k < 12; k++ ) {
						this.fields[ k ][ i ] += pigment[ k ] * dose * 0.15;
					}
				}
				if ( material === 'reactive' ) {
					this.reactive[ i ] += dose;
					this.fuel[ i ] += dose;
					this.excitation[ i ] = Math.max(
						this.excitation[ i ],
						0.01
					);
					this.recovery[ i ] = Math.max( this.recovery[ i ], 0.01 );
				} else if ( material === 'activator' ) {
					this.excitation[ i ] = Math.min(
						1,
						this.excitation[ i ] + dose
					);
				} else {
					const key = material === 'solution' ? 'solute' : material;
					if ( this[ key ] ) {
						this[ key ][ i ] += dose;
					}
				}
				hits++;
			}
			if ( hits || this.count >= VOLUME_LIMIT ) {
				return;
			}
			// A dose into an empty vessel also brings its aqueous carrier.
			this.depositCluster(
				Math.min( 12, VOLUME_LIMIT - this.count ),
				x,
				y,
				z,
				'water',
				'#ffffff',
				0
			);
			if ( this.count < VOLUME_LIMIT ) {
				this.drop(
					x,
					y,
					Math.max( radius, 0.1 ),
					material,
					color,
					amount,
					strength
				);
			}
			return;
		}
		this.pending += amount * 22 * ( radiusWorld / 0.05 ) ** 2;
		const count = Math.min(
			240,
			Math.floor( this.pending ),
			VOLUME_LIMIT - this.count
		);
		this.pending -= count;
		this.pending = Math.min( 1, this.pending );
		const first = this.count;
		this.depositCluster( count, x, y, z, material, color, 1 );
		if ( material === 'wax' ) {
			for ( let i = first; i < this.count; i++ ) {
				this.temperature[ i ] = clamp( pourTemperature, 20, 90 );
			}
		}
	}
	depositCluster( count, x, y, z, material, color, dye ) {
		if ( count <= 0 ) {
			return;
		}
		// A poured volume starts with actual particle spacing. Coincident
		// random parcels would inject an artificial pressure explosion.
		const radius = Math.ceil( Math.cbrt( count ) );
		const sx = Math.min(
			radius,
			Math.floor( ( this.aspect * 0.4 ) / this.spacing )
		);
		const sy = Math.min( radius, Math.floor( 0.4 / this.spacing ) );
		const points = [];
		for ( let dz = -radius; dz <= radius; dz++ ) {
			for ( let dy = -sy; dy <= sy; dy++ ) {
				for ( let dx = -sx; dx <= sx; dx++ ) {
					points.push( [ dx, dy, dz, dx * dx + dy * dy + dz * dz ] );
				}
			}
		}
		points.sort( ( a, b ) => a[ 3 ] - b[ 3 ] );
		points.length = Math.min( count, points.length );
		const angle = this.random() * Math.PI * 2;
		const rotate = this.aspect > 0.8 ? angle : 0;
		let ex = 0,
			ey = 0,
			ez = 0;
		for ( const point of points ) {
			const px = point[ 0 ] * this.spacing,
				py = point[ 1 ] * this.spacing;
			point[ 0 ] = px * Math.cos( rotate ) - py * Math.sin( rotate );
			point[ 1 ] = px * Math.sin( rotate ) + py * Math.cos( rotate );
			point[ 2 ] *= this.spacing;
			ex = Math.max( ex, Math.abs( point[ 0 ] ) );
			ey = Math.max( ey, Math.abs( point[ 1 ] ) );
			ez = Math.max( ez, Math.abs( point[ 2 ] ) );
		}
		const r = this.spacing * 0.45;
		const cx = clamp( x * this.aspect, ex + r, this.aspect - ex - r );
		const cy = clamp( y, ey + r, 1 - ey - r );
		const center = z + ( this.settings.injectionDepth > 0.05 ? 0 : ez );
		const cz = clamp( center, ez + r, this.maxZ - ez );
		for ( const point of points ) {
			const i = this.addParticle(
				cx + point[ 0 ],
				cy + point[ 1 ],
				cz + point[ 2 ],
				material,
				color,
				dye
			);
			if ( i >= 0 ) {
				this.vz[ i ] = -0.1;
			}
		}
	}

	impulse( x, y, radius, dx = 0, dy = 0, spin = 0, lift = 0 ) {
		const z = this.level() * ( 1 - ( this.settings.injectionDepth || 0 ) );
		for ( let i = 0; i < this.count; i++ ) {
			const rx = this.x[ i ] - x * this.aspect,
				ry = this.y[ i ] - y;
			const d =
				( rx * rx + ry * ry ) / ( radius * radius ) +
				( this.z[ i ] - z ) ** 2 / ( radius * radius + 0.015 );
			const q = Math.exp( -d * 1.5 );
			this.vx[ i ] += q * ( dx * 0.035 - spin * ry * 0.15 );
			this.vy[ i ] += q * ( dy * 0.035 + spin * rx * 0.15 );
			this.vz[ i ] += q * lift;
		}
	}
	obstacle( x, y, radius, erase = false ) {
		radius = clamp(
			radius,
			this.spacing * 0.5,
			Math.min( this.aspect, 1 ) * 0.4
		);
		x = clamp( x, radius / this.aspect, 1 - radius / this.aspect );
		y = clamp( y, radius, 1 - radius );
		this.obstacles = this.obstacles.filter(
			( o ) =>
				Math.hypot( ( o.x - x ) * this.aspect, o.y - y ) >
				radius + o.radius
		);
		if ( ! erase && this.obstacles.length < 40 ) {
			this.obstacles.push( { x, y, radius, height: 0.65 } );
		}
		this.customObstacles.rebuild( false );
	}
	sourceAt( x, y ) {
		return this.sources.find(
			( s ) =>
				Math.hypot( ( s.x - x ) * this.aspect, s.y - y ) <
				Math.max( 0.04, s.radius * 0.4 )
		);
	}
	addSource( type, x, y, p ) {
		if (
			! SOURCE_TYPES.includes( type ) ||
			this.sources.length >= MAX_SOURCES
		) {
			return null;
		}
		const source = {
			id: Math.max( 0, ...this.sources.map( ( s ) => s.id ) ) + 1,
			type,
			x: clamp( x, 0, 1 ),
			y: clamp( y, 0, 1 ),
			radius: p.sourceRadius,
			power: p.sourcePower,
			gap: p.magnetGap,
		};
		this.sources.push( source );
		return source;
	}
	removeSource( id ) {
		this.sources = this.sources.filter( ( s ) => s.id !== id );
	}
	neighbors() {
		const aX = this.x,
			aY = this.y,
			aZ = this.z,
			aFrom = this.from,
			aTo = this.to,
			aNext = this.next;
		const cell = this.support * 1.25;
		const nx = Math.ceil( this.aspect / cell ) + 1,
			ny = Math.ceil( 1 / cell ) + 1,
			nz = Math.ceil( this.maxZ / cell ) + 2;
		const heads = new Int32Array( nx * ny * nz ).fill( -1 );
		for ( let i = 0; i < this.count; i++ ) {
			if ( this.outside( i ) ) {
				aNext[ i ] = -1;
				continue;
			}
			const key =
				Math.floor( aX[ i ] / cell ) +
				nx *
					( Math.floor( aY[ i ] / cell ) +
						ny * Math.floor( aZ[ i ] / cell ) );
			aNext[ i ] = heads[ key ];
			heads[ key ] = i;
		}
		let pairs = 0;
		for ( let i = 0; i < this.count; i++ ) {
			if ( this.outside( i ) ) {
				continue;
			}
			const x = Math.floor( aX[ i ] / cell ),
				y = Math.floor( aY[ i ] / cell ),
				z = Math.floor( aZ[ i ] / cell );
			for ( let dz = -1; dz <= 1; dz++ ) {
				for ( let dy = -1; dy <= 1; dy++ ) {
					for ( let dx = -1; dx <= 1; dx++ ) {
						const xx = x + dx,
							yy = y + dy,
							zz = z + dz;
						if (
							xx < 0 ||
							xx >= nx ||
							yy < 0 ||
							yy >= ny ||
							zz < 0 ||
							zz >= nz
						) {
							continue;
						}
						for (
							let j = heads[ xx + nx * ( yy + ny * zz ) ];
							j >= 0;
							j = aNext[ j ]
						) {
							if ( j <= i ) {
								continue;
							}
							const r2 =
								( aX[ i ] - aX[ j ] ) ** 2 +
								( aY[ i ] - aY[ j ] ) ** 2 +
								( aZ[ i ] - aZ[ j ] ) ** 2;
							if ( r2 < cell * cell && pairs < aFrom.length ) {
								aFrom[ pairs ] = i;
								aTo[ pairs++ ] = j;
							}
						}
					}
				}
			}
		}
		this.pairCount = pairs;
	}
	outside( i ) {
		return (
			this.x[ i ] < 0 ||
			this.x[ i ] > this.aspect ||
			this.y[ i ] < 0 ||
			this.y[ i ] > 1
		);
	}
	bound( i ) {
		const aX = this.x,
			aY = this.y,
			aZ = this.z;
		const r = this.spacing * 0.45;
		if ( this.settings.boundary !== 'open' ) {
			aX[ i ] = clamp( aX[ i ], r, this.aspect - r );
			aY[ i ] = clamp( aY[ i ], r, 1 - r );
		}
		aZ[ i ] = clamp( aZ[ i ], r, this.maxZ );
		this.customObstacles.project( i );
		for ( const o of this.obstacles ) {
			if ( aZ[ i ] > o.height + r ) {
				continue;
			}
			const dx = aX[ i ] - o.x * this.aspect,
				dy = aY[ i ] - o.y;
			const d = Math.hypot( dx, dy );
			if ( d < o.radius + r ) {
				aX[ i ] =
					o.x * this.aspect +
					( ( dx || 1e-6 ) / ( d || 1e-6 ) ) * ( o.radius + r );
				aY[ i ] = o.y + ( dy / ( d || 1e-6 ) ) * ( o.radius + r );
			}
		}
		if ( this.settings.boundary !== 'open' ) {
			aX[ i ] = clamp( aX[ i ], r, this.aspect - r );
			aY[ i ] = clamp( aY[ i ], r, 1 - r );
		}
	}
	project() {
		const aX = this.x,
			aY = this.y,
			aZ = this.z,
			aInverseMass = this.inverseMass,
			aFrom = this.from,
			aTo = this.to,
			aGx = this.gx,
			aGy = this.gy,
			aGz = this.gz,
			aDx = this.dx,
			aDy = this.dy,
			aDz = this.dz,
			aLambda = this.lambda,
			aNorm = this.norm,
			aDensity = this.density;
		const h2 = this.support ** 2,
			n = this.count;
		aDensity.fill( 1 / lattice, 0, n );
		aGx.fill( 0, 0, n );
		aGy.fill( 0, 0, n );
		aGz.fill( 0, 0, n );
		aNorm.fill( 0, 0, n );
		for ( let k = 0; k < this.pairCount; k++ ) {
			const i = aFrom[ k ],
				j = aTo[ k ];
			const rx = aX[ i ] - aX[ j ],
				ry = aY[ i ] - aY[ j ],
				rz = aZ[ i ] - aZ[ j ];
			const q2 = ( rx * rx + ry * ry + rz * rz ) / h2;
			if ( q2 >= 1 ) {
				continue;
			}
			const w = kernel( q2 ) / lattice,
				g = ( -6 * ( 1 - q2 ) ** 2 ) / ( h2 * lattice );
			aDensity[ i ] += w;
			aDensity[ j ] += w;
			const gx = rx * g,
				gy = ry * g,
				gz = rz * g,
				norm = gx * gx + gy * gy + gz * gz;
			aGx[ i ] += gx;
			aGy[ i ] += gy;
			aGz[ i ] += gz;
			aGx[ j ] -= gx;
			aGy[ j ] -= gy;
			aGz[ j ] -= gz;
			aNorm[ i ] += aInverseMass[ j ] * norm;
			aNorm[ j ] += aInverseMass[ i ] * norm;
		}
		for ( let i = 0; i < n; i++ ) {
			// Plane collisions already constrain the wall. Adding an unpaired
			// ghost density here injects pressure without its boundary gradient.
			const c = Math.max( 0, aDensity[ i ] - 1.00001 );
			const norm =
				aNorm[ i ] +
				aInverseMass[ i ] *
					( aGx[ i ] ** 2 + aGy[ i ] ** 2 + aGz[ i ] ** 2 );
			aLambda[ i ] = -c / ( norm + 0.1 );
		}
		aDx.fill( 0, 0, n );
		aDy.fill( 0, 0, n );
		aDz.fill( 0, 0, n );
		for ( let k = 0; k < this.pairCount; k++ ) {
			const i = aFrom[ k ],
				j = aTo[ k ];
			const rx = aX[ i ] - aX[ j ],
				ry = aY[ i ] - aY[ j ],
				rz = aZ[ i ] - aZ[ j ];
			const q2 = ( rx * rx + ry * ry + rz * rz ) / h2;
			if ( q2 >= 1 ) {
				continue;
			}
			const g = ( -6 * ( 1 - q2 ) ** 2 ) / ( h2 * lattice );
			const p = ( aLambda[ i ] + aLambda[ j ] ) * g;
			const pi = p * aInverseMass[ i ],
				pj = p * aInverseMass[ j ];
			aDx[ i ] += rx * pi;
			aDy[ i ] += ry * pi;
			aDz[ i ] += rz * pi;
			aDx[ j ] -= rx * pj;
			aDy[ j ] -= ry * pj;
			aDz[ j ] -= rz * pj;
		}
		for ( let i = 0; i < n; i++ ) {
			const length = Math.hypot( aDx[ i ], aDy[ i ], aDz[ i ] );
			const limit =
				length > this.spacing * 0.22
					? ( this.spacing * 0.22 ) / length
					: 1;
			aX[ i ] += aDx[ i ] * limit;
			aY[ i ] += aDy[ i ] * limit;
			aZ[ i ] += aDz[ i ] * limit;
			this.bound( i );
		}
	}
	step( settings, dt = 1 / 30 ) {
		const aX = this.x,
			aY = this.y,
			aZ = this.z,
			aVx = this.vx,
			aVy = this.vy,
			aVz = this.vz,
			aPhase = this.phase,
			aTemperature = this.temperature,
			aCrystal = this.crystal,
			aThin = this.thin,
			aThick = this.thick,
			aFerro = this.ferro,
			aInverseMass = this.inverseMass,
			aViscosity = this.viscosity,
			aOldX = this.oldX,
			aOldY = this.oldY,
			aOldZ = this.oldZ,
			aFrom = this.from,
			aTo = this.to,
			aSurfactant = this.surfactant,
			aAlcohol = this.alcohol;
		this.settings = settings;
		dt = clamp( dt, 0, 1 / 30 );
		if ( dt <= 0 ) {
			return;
		}
		const n = this.count,
			substeps = 2,
			step = dt / substeps;
		const density = { ...RELATIVE_DENSITY, ...settings.densities };
		const tiltX = ( ( settings.tiltX || 0 ) * Math.PI ) / 180,
			tiltY = ( ( settings.tiltY || 0 ) * Math.PI ) / 180;
		const gravity = settings.gravity ?? 1.6;
		for ( let i = 0; i < n; i++ ) {
			const oil = aPhase[ i ] === 1;
			const silicone = aPhase[ i ] === 3,
				wax = aPhase[ i ] === 4;
			const melt = wax
				? waxMelt( aTemperature[ i ], settings.waxMeltingPoint )
				: 1;
			const rho = silicone
				? density.silicone
				: wax
				? density.wax
				: aPhase[ i ] === 2
				? density.metal
				: oil
				? aThin[ i ] * density.oil +
				  aThick[ i ] * density.thick +
				  aFerro[ i ] * density.ferro
				: density.water;
			aInverseMass[ i ] =
				aCrystal[ i ] > 0.85
					? 0
					: 1 /
					  Math.max(
							0.1,
							rho * ( 1 - 0.0008 * ( aTemperature[ i ] - 20 ) )
					  );
			const nu = silicone
				? settings.viscosities.silicone
				: wax
				? settings.viscosities.wax
				: aPhase[ i ] === 2
				? settings.viscosities.metal
				: oil
				? aThin[ i ] * settings.viscosities.oil +
				  aThick[ i ] * settings.viscosities.thick +
				  aFerro[ i ] * settings.viscosities.ferro
				: settings.viscosities.water;
			aViscosity[ i ] =
				nu *
					Math.exp(
						( silicone ? -0.006 : -0.025 ) *
							( aTemperature[ i ] - ( wax ? 60 : 20 ) )
					) +
				( wax ? 220 * ( 1 - melt ) ** 2 : 0 );
		}
		for ( let sub = 0; sub < substeps; sub++ ) {
			aOldX.set( aX.subarray( 0, n ) );
			aOldY.set( aY.subarray( 0, n ) );
			aOldZ.set( aZ.subarray( 0, n ) );
			this.neighbors();
			// Conservative pair forces: cohesion within a phase and repulsion at
			// unlike interfaces. Pressure constraints enforce occupied volume.
			for ( let k = 0; k < this.pairCount; k++ ) {
				const i = aFrom[ k ],
					j = aTo[ k ];
				const rx = aX[ i ] - aX[ j ],
					ry = aY[ i ] - aY[ j ],
					rz = aZ[ i ] - aZ[ j ];
				const r = Math.sqrt( rx * rx + ry * ry + rz * rz );
				if ( r < 1e-7 || r >= this.support ) {
					continue;
				}
				const q = 1 - r / this.support,
					same = aPhase[ i ] === aPhase[ j ];
				const surfaceReduction =
					1 /
					( 1 +
						settings.surfactantStrength *
							( aSurfactant[ i ] + aSurfactant[ j ] ) +
						settings.alcoholStrength *
							( aAlcohol[ i ] + aAlcohol[ j ] ) );
				const cohesion =
					aPhase[ i ] === 2 && same
						? settings.metalTension
						: aPhase[ i ] === 3 && same
						? settings.tension * 0.28
						: aPhase[ i ] === 4 && same
						? settings.tension *
						  ( 1 +
								6 *
									( 1 -
										waxMelt(
											( aTemperature[ i ] +
												aTemperature[ j ] ) /
												2,
											settings.waxMeltingPoint
										) ) )
						: settings.tension;
				const f =
					( step *
						q *
						surfaceReduction *
						( same
							? -0.22 * cohesion
							: 0.65 * settings.tension ) ) /
					r;
				const a = f * aInverseMass[ i ],
					b = f * aInverseMass[ j ];
				aVx[ i ] += rx * a;
				aVy[ i ] += ry * a;
				aVz[ i ] += rz * a;
				aVx[ j ] -= rx * b;
				aVy[ j ] -= ry * b;
				aVz[ j ] -= rz * b;
			}
			for ( let i = 0; i < n; i++ ) {
				if ( ! aInverseMass[ i ] ) {
					aVx[ i ] = aVy[ i ] = aVz[ i ] = 0;
					continue;
				}
				aVx[ i ] += gravity * Math.sin( tiltX ) * step;
				aVy[ i ] += gravity * Math.sin( tiltY ) * step;
				aVz[ i ] -=
					gravity * Math.cos( tiltX ) * Math.cos( tiltY ) * step;
				aX[ i ] += aVx[ i ] * step;
				aY[ i ] += aVy[ i ] * step;
				aZ[ i ] += aVz[ i ] * step;
				this.bound( i );
			}
			this.neighbors();
			for ( let iteration = 0; iteration < 3; iteration++ ) {
				this.project();
			}
			for ( let i = 0; i < n; i++ ) {
				aVx[ i ] = clamp( ( aX[ i ] - aOldX[ i ] ) / step, -3, 3 );
				aVy[ i ] = clamp( ( aY[ i ] - aOldY[ i ] ) / step, -3, 3 );
				aVz[ i ] = clamp( ( aZ[ i ] - aOldZ[ i ] ) / step, -3, 3 );
			}
			for ( let k = 0; k < this.pairCount; k++ ) {
				const i = aFrom[ k ],
					j = aTo[ k ];
				const q2 =
					( ( aX[ i ] - aX[ j ] ) ** 2 +
						( aY[ i ] - aY[ j ] ) ** 2 +
						( aZ[ i ] - aZ[ j ] ) ** 2 ) /
					this.support ** 2;
				if ( q2 >= 1 ) {
					continue;
				}
				const w = kernel( q2 );
				const sum = aInverseMass[ i ] + aInverseMass[ j ];
				const blend =
					Math.min(
						0.12,
						step * ( aViscosity[ i ] + aViscosity[ j ] ) * 2
					) * w;
				for ( const key of [ 'vx', 'vy', 'vz' ] ) {
					const delta =
						( this[ key ][ j ] - this[ key ][ i ] ) * blend;
					this[ key ][ i ] +=
						( delta * aInverseMass[ i ] ) / ( sum || 1 );
					this[ key ][ j ] -=
						( delta * aInverseMass[ j ] ) / ( sum || 1 );
				}
			}
		}
		if ( settings.boundary === 'open' ) {
			let removed = false;
			for ( let i = this.count - 1; i >= 0; i-- ) {
				if ( this.outside( i ) ) {
					this.removeParticle( i );
					removed = true;
				}
			}
			// Swap removal changes particle indices. Rebuild all pairs before
			// pigment/heat exchange, and keep mass and viscosity with the survivor.
			if ( removed ) {
				this.neighbors();
			}
		}
		this.exchange( settings, dt );
		this.influences( settings, dt );
		updateBubbles( this, dt );
		this.time += dt;
	}
	exchange( settings, dt ) {
		const aX = this.x,
			aY = this.y,
			aZ = this.z,
			aPhase = this.phase,
			aTemperature = this.temperature,
			aCrystal = this.crystal,
			aViscosity = this.viscosity,
			aFrom = this.from,
			aTo = this.to,
			aExcitation = this.excitation,
			aReactive = this.reactive;
		const aqueous = [
			'dye',
			...PIGMENT_SUFFIXES.map( ( key ) => 'pigment' + key ),
			'acid',
			'base',
			'indicator',
			'salt',
			'alcohol',
			'surfactant',
			'bicarbonate',
			'gas',
			'solute',
			'reactive',
			'recovery',
			'fuel',
		]
			.map( ( key ) => this[ key ] )
			.filter( ( field ) =>
				field.subarray( 0, this.count ).some( ( v ) => v !== 0 )
			);
		const oily = [
			'dye',
			...PIGMENT_SUFFIXES.map( ( key ) => 'pigment' + key ),
			'thin',
			'thick',
			'ferro',
		].map( ( key ) => this[ key ] );
		const colored = oily.slice( 0, 13 );
		for ( let k = 0; k < this.pairCount; k++ ) {
			const i = aFrom[ k ],
				j = aTo[ k ];
			const q2 =
				( ( aX[ i ] - aX[ j ] ) ** 2 +
					( aY[ i ] - aY[ j ] ) ** 2 +
					( aZ[ i ] - aZ[ j ] ) ** 2 ) /
				this.support ** 2;
			if ( q2 >= 1 ) {
				continue;
			}
			const w = kernel( q2 );
			const heat =
				( aTemperature[ i ] - aTemperature[ j ] ) *
				Math.min( 0.03, dt * 0.25 ) *
				w;
			aTemperature[ i ] -= heat;
			aTemperature[ j ] += heat;
			if (
				aPhase[ i ] !== aPhase[ j ] ||
				aPhase[ i ] === 2 ||
				aCrystal[ i ] > 0.85 ||
				aCrystal[ j ] > 0.85
			) {
				continue;
			}
			const rate =
				aPhase[ i ] !== 0 ? settings.oilDiffusion : settings.diffusion;
			const blend =
				Math.min(
					0.015,
					( dt *
						rate *
						Math.exp(
							0.02 *
								( ( aTemperature[ i ] + aTemperature[ j ] ) *
									0.5 -
									20 )
						) ) /
						( 1 + ( aViscosity[ i ] + aViscosity[ j ] ) * 0.2 )
				) *
				w *
				( aPhase[ i ] === 4
					? Math.min(
							waxMobility(
								aTemperature[ i ],
								settings.waxMeltingPoint
							),
							waxMobility(
								aTemperature[ j ],
								settings.waxMeltingPoint
							)
					  )
					: 1 );
			for ( const field of aPhase[ i ] === 1
				? oily
				: aPhase[ i ] >= 3
				? colored
				: aqueous ) {
				const diff = ( field[ i ] - field[ j ] ) * blend;
				field[ i ] -= diff;
				field[ j ] += diff;
			}
			if (
				aPhase[ i ] === 0 &&
				aReactive[ i ] > 0.001 &&
				aReactive[ j ] > 0.001
			) {
				const diff =
					( aExcitation[ i ] - aExcitation[ j ] ) *
					Math.min( 0.04, dt * 1.5 ) *
					w;
				aExcitation[ i ] -= diff;
				aExcitation[ j ] += diff;
			}
		}
	}
	influences( settings, dt ) {
		for ( let i = 0; i < this.count; i++ ) {
			let warming = 0,
				cooling = 0;
			for ( const source of this.sources ) {
				const dx = this.x[ i ] - source.x * this.aspect,
					dy = this.y[ i ] - source.y;
				const q =
					source.power *
					Math.exp(
						-( dx * dx + dy * dy ) / ( 2 * source.radius ** 2 )
					);
				if ( source.type === 'heat' ) {
					warming += q;
				}
				if ( source.type === 'cool' ) {
					cooling += q;
				}
				if ( source.type === 'magnet' && this.ferro[ i ] > 0 ) {
					const r2 =
						dx * dx + dy * dy + ( this.z[ i ] + source.gap ) ** 2;
					const force =
						Math.min(
							10,
							( source.power * source.radius ** 3 ) / ( r2 * r2 )
						) * this.ferro[ i ];
					this.vx[ i ] -= dt * dx * force;
					this.vy[ i ] -= dt * dy * force;
					this.vz[ i ] -=
						dt * ( this.z[ i ] + source.gap ) * force * 0.15;
				}
			}
			const t = this.temperature[ i ];
			this.temperature[ i ] = clamp(
				t +
					dt *
						( warming * ( 90 - t ) +
							cooling * -t +
							0.02 * ( settings.ambientTemperature - t ) ),
				0,
				90
			);
			// Thermal expansion changes buoyancy through the particle mass used
			// by the next pressure projection, rather than a painted flow map.
			this.alcohol[ i ] *= Math.exp(
				-dt * settings.evaporation * Math.exp( 0.025 * ( t - 20 ) )
			);
			if ( this.phase[ i ] === 0 ) {
				reactParticle( this, i, dt, settings );
			}
		}
	}
	removeParticle( i ) {
		this.escapedGas += this.gas[ i ];
		this.count--;
		for ( const key of [ ...VOLUME_FIELDS, 'inverseMass', 'viscosity' ] ) {
			this[ key ][ i ] = this[ key ][ this.count ];
			this[ key ][ this.count ] = 0;
		}
	}
	drain( x, y, radius, amount ) {
		let remaining = Math.max( 1, Math.round( amount ) );
		for ( let i = this.count - 1; i >= 0 && remaining > 0; i-- ) {
			if (
				( this.x[ i ] - x * this.aspect ) ** 2 +
					( this.y[ i ] - y ) ** 2 >
				radius ** 2
			) {
				continue;
			}
			this.removeParticle( i );
			remaining--;
		}
	}
	colorAt( i, target ) {
		if ( this.dye[ i ] <= 0.000001 ) {
			target[ 0 ] = target[ 1 ] = target[ 2 ] = 1;
		} else {
			decodePigment( this.fields, i, this.dye[ i ], target );
		}
		if ( this.indicator[ i ] > 0.001 ) {
			const a = Math.min( 0.9, this.indicator[ i ] );
			let tint;
			if ( this.settings.indicatorColors ) {
				this.indicatorPalette.update(
					this.settings.bufferCapacity,
					this.settings.indicatorColors
				);
				tint =
					this.indicatorPalette.rgb[
						indicatorIndex( this.acid[ i ], this.base[ i ] )
					];
			} else {
				// Preserve the original deep-bath colors when reopening older work.
				const ph = acidity(
					this.acid[ i ],
					this.base[ i ],
					this.settings.bufferCapacity
				);
				const t = 1 / ( 1 + 10 ** ( 7.1 - ph ) );
				tint = [ 0.96 - 0.86 * t, 0.83 - 0.52 * t, 0.14 + 0.65 * t ];
			}
			for ( let k = 0; k < 3; k++ ) {
				target[ k ] = target[ k ] * ( 1 - a ) + tint[ k ] * a;
			}
		}
		if ( this.reactive[ i ] > 0.001 ) {
			const u = this.excitation[ i ],
				a = Math.min( 0.9, this.reactive[ i ] );
			const tint = [ 0.16 + 0.82 * u, 0.24 + 0.47 * u, 0.7 - 0.5 * u ];
			for ( let k = 0; k < 3; k++ ) {
				target[ k ] = target[ k ] * ( 1 - a ) + tint[ k ] * a;
			}
		}
		return target;
	}
	probe( x, y ) {
		const level = this.level();
		let best = Infinity,
			index = -1;
		for ( let i = 0; i < this.count; i++ ) {
			const d =
				( this.x[ i ] - x * this.aspect ) ** 2 +
				( this.y[ i ] - y ) ** 2 +
				( this.z[ i ] - level ) ** 2 * 0.2;
			if ( d < best ) {
				best = d;
				index = i;
			}
		}
		return index;
	}
	snapshot() {
		const floats = new Float32Array( this.count * VOLUME_FIELDS.length );
		VOLUME_FIELDS.forEach( ( key, k ) =>
			floats.set( this[ key ].subarray( 0, this.count ), k * this.count )
		);
		const bytes = new Uint8Array( floats.buffer );
		let text = '';
		for ( let k = 0; k < bytes.length; k += 8192 ) {
			text += String.fromCharCode( ...bytes.subarray( k, k + 8192 ) );
		}
		return {
			kind: 'volume',
			version: 2,
			aspect: this.aspect,
			spacing: this.spacing,
			count: this.count,
			time: this.time,
			serial: this.serial,
			pending: this.pending,
			sources: cleanSources( this.sources ),
			obstacles: this.obstacles.map( ( p ) => ( { ...p } ) ),
			customObstacles: this.customObstacles.snapshot(),
			bubbles: this.bubbles.map( ( b ) => ( { ...b } ) ),
			escapedGas: this.escapedGas,
			data: btoa( text ),
		};
	}
	static restore( raw ) {
		if (
			! raw ||
			raw.kind !== 'volume' ||
			! [ 1, 2 ].includes( raw.version ) ||
			! Number.isInteger( raw.count ) ||
			raw.count < 0 ||
			raw.count > VOLUME_LIMIT ||
			! Number.isFinite( raw.aspect ) ||
			raw.aspect < 0.5 ||
			raw.aspect > 2 ||
			! Number.isFinite( raw.spacing ) ||
			raw.spacing < 0.04 ||
			raw.spacing > 0.09 ||
			! Number.isFinite( raw.time ) ||
			raw.time < 0 ||
			! Number.isInteger( raw.serial ) ||
			raw.serial < 0 ||
			raw.serial > 0xffffffff ||
			! Number.isFinite( raw.pending ) ||
			raw.pending < 0 ||
			raw.pending > 1
		) {
			throw new Error( 'Invalid volume snapshot' );
		}
		const length = raw.count * VOLUME_FIELDS.length * 4;
		if (
			typeof raw.data !== 'string' ||
			raw.data.length !== Math.ceil( length / 3 ) * 4
		) {
			throw new Error( 'Invalid volume data' );
		}
		const text = atob( raw.data );
		if ( text.length !== length ) {
			throw new Error( 'Invalid volume data' );
		}
		const values = new Float32Array(
			Uint8Array.from( text, ( c ) => c.charCodeAt( 0 ) ).buffer
		);
		const sim = new VolumeSimulation( raw.aspect, raw.spacing );
		sim.count = raw.count;
		sim.time = raw.time;
		sim.serial = raw.serial;
		sim.pending = raw.pending;
		sim.sources = cleanSources( raw.sources );
		if (
			! Array.isArray( raw.obstacles ) ||
			raw.obstacles.length > 40 ||
			! Array.isArray( raw.bubbles ) ||
			raw.bubbles.length > 200 ||
			! Number.isFinite( raw.escapedGas ) ||
			raw.escapedGas < 0
		) {
			throw new Error( 'Invalid volume apparatus' );
		}
		for ( const o of raw.obstacles ) {
			if (
				! o ||
				! [ o.x, o.y, o.radius, o.height ].every( Number.isFinite ) ||
				o.x < 0 ||
				o.x > 1 ||
				o.y < 0 ||
				o.y > 1 ||
				o.radius <= 0 ||
				o.radius > 0.4 ||
				o.height <= 0 ||
				o.height > 1.1
			) {
				throw new Error( 'Invalid volume obstacle' );
			}
		}
		sim.obstacles = raw.obstacles.map( ( p ) => ( { ...p } ) );
		sim.customObstacles = new Obstacles( sim, raw.customObstacles );
		sim.escapedGas = raw.escapedGas;
		sim.bubbles = cleanBubbles( raw.bubbles, sim.aspect );
		VOLUME_FIELDS.forEach( ( key, k ) => {
			const field = values.subarray(
				k * raw.count,
				( k + 1 ) * raw.count
			);
			if (
				field.some(
					( v ) =>
						! Number.isFinite( v ) ||
						Math.abs( v ) > 100000 ||
						( ! signed.has( key ) && v < -0.00001 )
				)
			) {
				throw new Error( 'Invalid volume field' );
			}
			sim[ key ].set( field );
		} );
		for ( let i = 0; i < sim.count; i++ ) {
			if (
				sim.x[ i ] > sim.aspect ||
				sim.y[ i ] > 1 ||
				sim.z[ i ] > sim.maxZ + 1e-6 ||
				! (
					raw.version === 1 ? [ 0, 1, 2 ] : [ 0, 1, 2, 3, 4 ]
				).includes( sim.phase[ i ] ) ||
				sim.temperature[ i ] > 90
			) {
				throw new Error( 'Invalid volume particle' );
			}
		}
		return sim;
	}
}
