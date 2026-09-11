import { Obstacles } from './obstacles.js';
import {
	EXTRA_LIQUIDS,
	waxMelt,
	waxMobility,
	extraSurfaceForces,
	mixExtraPigments,
} from './materials.js';
/**
 * A shallow, immiscible paint bath. All quantities live on a fixed grid.
 * Velocity uses advection, variable viscosity and a pressure projection;
 * pigment/phase transport is conservative (equal and opposite face fluxes).
 * An oil/water phase potential supplies interface forces and conservative
 * segregation. This is an artistic thin-film model, not volumetric CFD.
 * The classical inverse-mapping engine is deliberately independent.
 */
import {
	PIGMENT_FIELDS,
	PIGMENT_SUFFIXES,
	addPigment,
	encodePigment,
	migratePigments,
} from './pigment.js';
import {
	attachInfluences,
	cleanIndicatorColors,
	cleanSources,
	MAX_SOURCES,
	neutralize,
	SOURCE_TYPES,
	updateMagneticSurface,
	updateTemperature,
} from './influences.js';
export const MATERIALS = [
	...EXTRA_LIQUIDS,
	{
		id: 'bicarbonate',
		description:
			'Bicarbonate dissolved in water. Add acid to release rising gas bubbles; add surfactant to keep more foam at the surface.',
		label: 'Bicarbonate solution',
		color: '#e6d6a1',
		additive: true,
		reagent: true,
		volume: true,
	},
	{
		id: 'solution',
		description:
			'Water containing a dissolved crystal-forming substance. Cooling grows crystals; warming dissolves them back into the liquid.',
		label: 'Crystal solution',
		color: '#67c9e2',
		additive: true,
		reagent: true,
		volume: true,
	},
	{
		id: 'reactive',
		description:
			'A liquid prepared for traveling color reactions. Add a reaction trigger to start a wave; each wave uses up some of its fuel.',
		label: 'Reactive medium',
		color: '#7554cf',
		additive: true,
		reagent: true,
		volume: true,
	},
	{
		id: 'activator',
		description:
			'A starter for the reactive medium. A small drop launches a local color wave; it needs reactive medium to work.',
		label: 'Reaction trigger',
		color: '#ecba51',
		additive: true,
		reagent: true,
		volume: true,
	},
	{
		id: 'water',
		description:
			'Water-based color that spreads easily and blends with other water inks. Oil remains separate.',
		label: 'Water ink',
		color: '#1675bc',
		viscosity: 0.06,
	},
	{
		id: 'oil',
		description:
			'A freely flowing oil that forms islands on water. Its pigment mixes with other oils when they meet.',
		label: 'Thin oil',
		color: '#ed793b',
		viscosity: 0.9,
	},
	{
		id: 'thick',
		description:
			'A viscous oil that moves slowly and holds folds longer. Heat makes it flow more easily; cold thickens it.',
		label: 'Thick oil',
		color: '#e8bd53',
		viscosity: 12,
	},
	{
		id: 'metal',
		description:
			'A heavy, reflective liquid that gathers into beads. It stays separate from water and oil and sinks in deep baths.',
		label: 'Liquid metal',
		color: '#d8e3ed',
		viscosity: 0.18,
	},
	{
		id: 'alcohol',
		description:
			'A volatile liquid that lowers surface tension and pushes nearby color aside. It evaporates, leaving its pigment in the water.',
		label: 'Alcohol',
		color: '#ac7dde',
		additive: true,
	},
	{
		id: 'surfactant',
		description:
			'A soap-like additive that lowers surface tension and opens paths through color. In deep baths it also makes foam last longer.',
		label: 'Surfactant',
		color: '#52c9b4',
		additive: true,
	},
	{
		id: 'ferro',
		description:
			'Oil containing magnetic particles, in any pigment color. Magnets draw it together; adding plain oil weakens its magnetic response.',
		label: 'Ferrofluid',
		color: '#181c24',
		viscosity: 2.5,
	},
	{
		id: 'indicator',
		description:
			'A water ink that changes color with acidity. Choose its acidic, neutral and alkaline colors; acid and base move the transition.',
		label: 'Indicator ink',
		color: '#60a948',
		additive: true,
		reagent: true,
	},
	{
		id: 'acid',
		description:
			'A clear reagent that shifts indicator ink toward its acidic color and neutralizes base. With bicarbonate in a deep bath, it releases gas bubbles.',
		label: 'Acid',
		color: '#f6d324',
		additive: true,
		reagent: true,
	},
	{
		id: 'base',
		description:
			'A clear alkaline reagent that shifts indicator ink toward its alkaline color. Acid neutralizes it, returning the indicator toward its neutral color.',
		label: 'Base',
		color: '#194fcb',
		additive: true,
		reagent: true,
	},
];

export const clamp = ( x, a, b ) => Math.max( a, Math.min( b, x ) );
const num = ( x, a, b, d ) =>
	Number.isFinite( Number( x ) ) ? clamp( Number( x ), a, b ) : d;
export const hexColor = ( x, fallback = '#1675bc' ) =>
	/^#[\da-f]{6}$/i.test( x ) ? x : fallback;
export const rgb = ( hex ) =>
	[ 1, 3, 5 ].map( ( i ) => parseInt( hex.slice( i, i + 2 ), 16 ) / 255 );
const LEGACY_FIELDS = [
	'u',
	'v',
	'height',
	'wave',
	'water',
	'waterR',
	'waterG',
	'waterB',
	'oil',
	'oilR',
	'oilG',
	'oilB',
	'thick',
	'thickR',
	'thickG',
	'thickB',
	'wall',
];
const V2_FIELDS = [
	...LEGACY_FIELDS,
	'metal',
	'metalR',
	'metalG',
	'metalB',
	'alcohol',
	'surfactant',
];
const V3_FIELDS = [
	...V2_FIELDS,
	'ferro',
	'temperature',
	'magnetHeight',
	'acid',
	'base',
	'indicator',
	'salt',
	...PIGMENT_FIELDS,
];
export const V4_FIELDS = [ ...V3_FIELDS, 'ferroPattern' ];
export const FIELDS = [
	...V4_FIELDS,
	...[ 'silicone', 'wax' ].flatMap( ( key ) => [
		key,
		...PIGMENT_SUFFIXES.map( ( suffix ) => key + suffix ),
	] ),
];
export const MAX_EXPERIMENT_BYTES = 12 * 1024 * 1024;
const TRANSPORT = FIELDS.filter(
	( key ) =>
		! [
			'u',
			'v',
			'height',
			'wave',
			'wall',
			'temperature',
			'magnetHeight',
			'ferroPattern',
		].includes( key )
);
const OILS = [ 'oil', 'thick', 'ferro' ];
const METAL = [ 'metal' ];
const oilField = ( key ) =>
	key === 'ferro' ||
	key.startsWith( 'oil' ) ||
	key.startsWith( 'thick' ) ||
	key.startsWith( 'paint' );

export function cleanSettings( raw = {} ) {
	const p = { ...( raw && typeof raw === 'object' ? raw : {} ) };
	// Older experiments stored drawing as wall + paint mode.
	if ( p.tool === 'wall' && p.obstacleMode === 'paint' ) {
		p.tool = 'draw';
	}
	const pick = ( key, values, d ) =>
		values.includes( p[ key ] ) ? p[ key ] : d;
	return {
		material: pick(
			'material',
			MATERIALS.map( ( m ) => m.id ),
			'oil'
		),
		boundary: pick( 'boundary', [ 'closed', 'open' ], 'closed' ),
		waxMeltingPoint: num( p.waxMeltingPoint, 35, 75, 56 ),
		waxPourTemperature: num( p.waxPourTemperature, 20, 90, 74 ),
		tool: pick(
			'tool',
			[
				'orbit',
				'pipette',
				'pour',
				'spray',
				'ring',
				'comb',
				'stir',
				'air',
				'vortex',
				'lift',
				'drain',
				'heat',
				'cool',
				'magnet',
				'removeSource',
				'wall',
				'draw',
				'duplicate',
				'erase',
			],
			'pipette'
		),
		colors: Object.fromEntries(
			MATERIALS.map( ( m ) => [
				m.id,
				m.reagent ? m.color : hexColor( p.colors?.[ m.id ], m.color ),
			] )
		),
		viscosities: Object.fromEntries(
			MATERIALS.filter( ( m ) => ! m.additive ).map( ( m ) => [
				m.id,
				num( p.viscosities?.[ m.id ], 0.02, 30, m.viscosity ),
			] )
		),
		injectionDepth: num( p.injectionDepth, 0, 1, 0 ),
		dropHeight: num( p.dropHeight, 0, 0.5, 0.08 ),
		gravity: num( p.gravity, 0, 4, 1.6 ),
		tiltX: num( p.tiltX, -35, 35, 0 ),
		tiltY: num( p.tiltY, -35, 35, 0 ),
		volumeAngle: num( p.volumeAngle, 0, 180, 52 ),
		crystalRate: num( p.crystalRate, 0, 4, 1 ),
		reactionRate: num( p.reactionRate, 0, 3, 1 ),
		densities: Object.fromEntries(
			Object.entries( {
				water: 1,
				oil: 0.83,
				thick: 0.92,
				ferro: 1.25,
				metal: 6.5,
				silicone: 0.97,
				wax: 0.88,
			} ).map( ( [ key, fallback ] ) => [
				key,
				num( p.densities?.[ key ], 0.5, 8, fallback ),
			] )
		),
		obstacleShape:
			typeof p.obstacleShape === 'string' &&
			/^(circle|heart|star|pebble|ring|layer-[0-9]+)$/.test(
				p.obstacleShape
			)
				? p.obstacleShape
				: 'circle',
		obstacleMode:
			p.tool === 'draw'
				? 'paint'
				: p.tool === 'wall' || p.tool === 'duplicate'
				? 'place'
				: p.obstacleMode === 'paint'
				? 'paint'
				: 'place',
		obstacleColor: hexColor( p.obstacleColor, '#647884' ),
		obstacleSize: num( p.obstacleSize, 0.024, 0.8, 0.2 ),
		obstacleAngle: num( p.obstacleAngle, -180, 180, 0 ),
		radius: num( p.radius, 0.012, 0.14, 0.048 ),
		spraySpread: num( p.spraySpread, 0.04, 0.3, 0.12 ),
		ringRadius: num( p.ringRadius, 0.05, 0.3, 0.12 ),
		combTeeth: Math.round( num( p.combTeeth, 2, 12, 5 ) ),
		combSpacing: num( p.combSpacing, 0.025, 0.1, 0.055 ),
		amount: num( p.amount, 0.1, 1, 0.65 ),
		force: num( p.force, 0.1, 2, 0.85 ),
		tension: num( p.tension, 0, 2, 0.85 ),
		diffusion: num( p.diffusion, 0, 1, 0.18 ),
		oilDiffusion: num( p.oilDiffusion, 0, 1, 0.35 ),
		ambientTemperature: num( p.ambientTemperature, 0, 80, 20 ),
		sourceRadius: num( p.sourceRadius, 0.04, 0.3, 0.14 ),
		sourcePower: num( p.sourcePower, 0.1, 3, 1 ),
		magnetGap: num( p.magnetGap, 0.04, 0.5, 0.14 ),
		reagentStrength: num( p.reagentStrength, 0.1, 2, 1 ),
		bufferCapacity: num( p.bufferCapacity, 0, 1, 0.5 ),
		indicatorColors: cleanIndicatorColors( p.indicatorColors ),
		showSources: p.showSources !== false,
		depth: num( p.depth, 0.15, 1.5, 0.65 ),
		gloss: num( p.gloss, 0, 1, 0.72 ),
		fluorescence: num( p.fluorescence, 0, 1, 0 ),
		iridescence: num( p.iridescence, 0, 1, 0.25 ),
		transparency: num( p.transparency, 0, 1, 0.45 ),
		light: num( p.light, 0.2, 2, 0.85 ),
		angle: num( p.angle, 0, 180, 12 ),
		viewYaw: num( p.viewYaw, -180, 180, 0 ),
		viewZoom: num( p.viewZoom, 0.45, 4, 1 ),
		metalTension: num( p.metalTension, 0.2, 4, 2.5 ),
		alcoholStrength: num( p.alcoholStrength, 0, 2, 1 ),
		surfactantStrength: num( p.surfactantStrength, 0, 2, 1 ),
		evaporation: num( p.evaporation, 0, 0.6, 0.12 ),
		bath: hexColor( p.bath, '#e3e9e4' ),
		output: pick( 'output', [ 'wet', 'print' ], 'wet' ),
		experiment:
			typeof p.experiment === 'string'
				? p.experiment.slice( 0, 48 )
				: 'islands',
		seed: Math.round( num( p.seed, 1, 999983, 17 ) ),
	};
}

export class FluidSimulation {
	constructor( aspect = 4 / 3, resolution = 144 ) {
		this.aspect = num( aspect, 0.5, 2, 4 / 3 );
		const size = Math.round( num( resolution, 40, 160, 144 ) );
		this.w = Math.max(
			24,
			Math.round( this.aspect >= 1 ? size : size * this.aspect )
		);
		this.h = Math.max(
			24,
			Math.round( this.aspect >= 1 ? size / this.aspect : size )
		);
		this.n = this.w * this.h;
		for ( const key of FIELDS ) {
			this[ key ] = new Float32Array( this.n );
		}
		this.temp = new Float32Array( this.n );
		this.u0 = new Float32Array( this.n );
		this.v0 = new Float32Array( this.n );
		this.pressure = new Float32Array( this.n );
		this.div = new Float32Array( this.n );
		this.mu = new Float32Array( this.n );
		this.nu = new Float32Array( this.n );
		this.metalMu = new Float32Array( this.n );
		this.ferroPressure = new Float32Array( this.n );
		this.ferroMobility = new Float32Array( this.n );
		this.ferroForceX = new Float32Array( this.n );
		this.ferroForceY = new Float32Array( this.n );
		this.sigma = new Float32Array( this.n );
		this.surfaceU = new Float32Array( this.n );
		this.surfaceV = new Float32Array( this.n );
		this.oilMass = new Float32Array( this.n );
		this.oilInverse = new Float32Array( this.n );
		this.faceFrom = new Uint32Array( this.n * 2 );
		this.faceTo = new Uint32Array( this.n * 2 );
		for ( const key of [
			'bulkFlow',
			'oilFlow',
			'diffusive',
			'maxDiffusive',
			'oilExchange',
		] ) {
			this[ key ] = new Float32Array( this.n * 2 );
		}
		this.paintPigments = PIGMENT_SUFFIXES.map(
			( key ) => this[ 'paint' + key ]
		);
		this.extraPotential = {
			silicone: new Float32Array( this.n ),
			wax: new Float32Array( this.n ),
		};
		this.waxFlow = new Float32Array( this.n );
		for ( const key of [ 'silicone', 'wax' ] ) {
			this[ key + 'Pigments' ] = PIGMENT_SUFFIXES.map(
				( suffix ) => this[ key + suffix ]
			);
		}
		this.temperature.fill( 20 );
		attachInfluences( this );
		this.time = 0;
		this.openBoundary = false;
		this.customObstacles = new Obstacles( this );
	}

	clear() {
		for ( const key of FIELDS ) {
			this[ key ].fill( 0 );
		}
		this.temperature.fill( 20 );
		this.sources = [];
		this.sourceKey = null;
		this.time = 0;
		this.customObstacles = new Obstacles( this );
	}

	oilAt( i ) {
		return this.oil[ i ] + this.thick[ i ] + this.ferro[ i ];
	}

	sourceAt( x, y ) {
		return this.sources.find(
			( source ) =>
				Math.hypot( ( source.x - x ) * this.aspect, source.y - y ) <
				Math.max( 0.04, source.radius * 0.4 )
		);
	}

	addSource( type, x, y, settings ) {
		if (
			! SOURCE_TYPES.includes( type ) ||
			this.sources.length >= MAX_SOURCES
		) {
			return null;
		}
		const id =
			Math.max( 0, ...this.sources.map( ( source ) => source.id ) ) + 1;
		const source = {
			id,
			type,
			x: clamp( x, 0, 1 ),
			y: clamp( y, 0, 1 ),
			radius: settings.sourceRadius,
			power: settings.sourcePower,
			gap: settings.magnetGap,
		};
		this.sources = cleanSources( [ ...this.sources, source ] );
		return this.sources[ this.sources.length - 1 ];
	}

	removeSource( id ) {
		this.sources = this.sources.filter( ( source ) => source.id !== id );
	}

	/** A local addition preserves each material's premultiplied pigment. */
	drop(
		x,
		y,
		radius,
		material,
		color,
		amount = 0.65,
		strength = 1,
		pourTemperature = 74
	) {
		if ( ! MATERIALS.some( ( m ) => m.id === material && ! m.volume ) ) {
			return;
		}
		const info = MATERIALS.find( ( m ) => m.id === material );
		const selectedColor = hexColor( color, info.color );
		const col = rgb( selectedColor );
		const pigment = encodePigment( selectedColor );
		const additive = info.additive;
		this.brush( x, y, radius, ( i, falloff, dx, dy ) => {
			if ( this.wall[ i ] > 0.5 ) {
				return;
			}
			const density = this[ material ];
			const add = Math.max(
				0,
				Math.min(
					( info.reagent ? 2 : 1 ) - density[ i ],
					amount *
						falloff *
						( info.reagent ? clamp( strength, 0.1, 2 ) : 1 )
				)
			);
			density[ i ] += add;
			if ( material === 'wax' ) {
				this.temperature[ i ] +=
					( ( clamp( pourTemperature, 20, 90 ) -
						this.temperature[ i ] ) *
						add ) /
					Math.max( 0.001, density[ i ] );
			}
			// A colored additive carries a little nonvolatile dye into the water.
			// Its concentration can evaporate without deleting the pigment.
			if ( additive && ! info.reagent ) {
				this.water[ i ] += add * 0.15;
			}
			[ 'R', 'G', 'B' ].forEach( ( c, k ) => {
				const field = this[ ( additive ? 'water' : material ) + c ];
				if ( field && ! info.reagent ) {
					field[ i ] += add * col[ k ] * ( additive ? 0.15 : 1 );
				}
			} );
			if ( ! info.reagent && material !== 'metal' ) {
				addPigment(
					this,
					[ 'silicone', 'wax' ].includes( material )
						? material
						: OILS.includes( material )
						? 'paint'
						: 'water',
					i,
					pigment,
					add * ( additive ? 0.15 : 1 )
				);
			}
			// Adding a second oil increases local film thickness. Never erase
			// the material already there merely to clamp the phase fraction.
			this.wave[ i ] += falloff * add * 0.18;
			this.u[ i ] += dx * falloff * add * 9;
			this.v[ i ] += dy * falloff * add * 9;
		} );
	}

	brush( x, y, radius, visit ) {
		const cx = clamp( x, 0, 1 ) * ( this.w - 1 );
		const cy = clamp( y, 0, 1 ) * ( this.h - 1 );
		const r = Math.max( 1.2, radius * this.h );
		for (
			let yy = Math.max( 1, Math.floor( cy - r ) );
			yy <= Math.min( this.h - 2, Math.ceil( cy + r ) );
			yy++
		) {
			for (
				let xx = Math.max( 1, Math.floor( cx - r ) );
				xx <= Math.min( this.w - 2, Math.ceil( cx + r ) );
				xx++
			) {
				const dx = ( xx - cx ) / r,
					dy = ( yy - cy ) / r;
				const d = dx * dx + dy * dy;
				if ( d < 1 ) {
					visit( yy * this.w + xx, Math.pow( 1 - d, 1.5 ), dx, dy );
				}
			}
		}
	}

	impulse( x, y, radius, dx, dy, spin = 0 ) {
		this.brush( x, y, radius, ( i, f, rx, ry ) => {
			if ( this.wall[ i ] > 0.5 ) {
				return;
			}
			this.u[ i ] = clamp(
				this.u[ i ] + ( dx - ry * spin ) * f,
				-18,
				18
			);
			this.v[ i ] = clamp(
				this.v[ i ] + ( dy + rx * spin ) * f,
				-18,
				18
			);
		} );
	}

	/** Move every conserved amount out of newly occupied cells, never delete paint. */
	displaceObstacles( next, nearest ) {
		for ( let i = 0; i < this.n; i++ ) {
			if ( next[ i ] <= 0.5 || nearest[ i ] < 0 ) {
				continue;
			}
			const j = nearest[ i ];
			for ( const key of TRANSPORT ) {
				this[ key ][ j ] += this[ key ][ i ];
				this[ key ][ i ] = 0;
			}
			this.u[ i ] =
				this.v[ i ] =
				this.height[ i ] =
				this.wave[ i ] =
				this.magnetHeight[ i ] =
					0;
		}
	}

	obstacle( x, y, radius, erase = false ) {
		const cx = clamp( x, 0, 1 ) * ( this.w - 1 );
		const cy = clamp( y, 0, 1 ) * ( this.h - 1 );
		// Match the former falloff cutoff's solid radius. Fractional edge coverage
		// records the real circular contour between cells; collisions remain > 0.5.
		const r =
			Math.max( 1.2, radius * this.h ) *
			Math.sqrt( 1 - 0.1 ** ( 2 / 3 ) );
		this.brush( x, y, radius + 1.5 / this.h, ( i ) => {
			const distance = Math.hypot(
				( i % this.w ) - cx,
				Math.floor( i / this.w ) - cy
			);
			const coverage = clamp( 0.5 + ( r - distance ) / 1.5, 0, 1 );
			if ( coverage <= 0 ) {
				return;
			}
			this.wall[ i ] = erase ? 0 : Math.max( this.wall[ i ], coverage );
			if ( ! erase && this.wall[ i ] <= 0.5 ) {
				return;
			}
			this.u[ i ] = this.v[ i ] = this.height[ i ] = this.wave[ i ] = 0;
			this.magnetHeight[ i ] = 0;
			if ( ! erase ) {
				for ( const key of TRANSPORT ) {
					this[ key ][ i ] = 0;
				}
			}
		} );
	}

	sample( a, x, y ) {
		x = clamp( x, 0, this.w - 1.001 );
		y = clamp( y, 0, this.h - 1.001 );
		const xx = Math.floor( x ),
			yy = Math.floor( y );
		const fx = x - xx,
			fy = y - yy,
			i = yy * this.w + xx;
		return (
			( a[ i ] * ( 1 - fx ) + a[ i + 1 ] * fx ) * ( 1 - fy ) +
			( a[ i + this.w ] * ( 1 - fx ) + a[ i + this.w + 1 ] * fx ) * fy
		);
	}

	boundary() {
		const { w, h, u, v, wall } = this;
		for ( let y = 0; y < h; y++ ) {
			for ( let x = 0; x < w; x++ ) {
				const i = y * w + x;
				if ( x < 1 || x >= w - 1 || wall[ i ] > 0.5 ) {
					u[ i ] = 0;
				}
				if ( y < 1 || y >= h - 1 || wall[ i ] > 0.5 ) {
					v[ i ] = 0;
				}
				if ( wall[ i + 1 ] > 0.5 || wall[ i - 1 ] > 0.5 ) {
					u[ i ] = 0;
				}
				if ( wall[ i + w ] > 0.5 || wall[ i - w ] > 0.5 ) {
					v[ i ] = 0;
				}
			}
		}
		if ( this.openBoundary ) {
			// Open sides extrapolate outward velocity, with no external inflow.
			// User-drawn obstacles still seal the corresponding outlet cells.
			for ( let y = 1; y < h - 1; y++ ) {
				const left = y * w,
					right = left + w - 1;
				if ( wall[ left + 1 ] < 0.5 ) {
					u[ left ] = Math.min( 0, u[ left + 1 ] );
					v[ left ] = v[ left + 1 ];
				}
				if ( wall[ right - 1 ] < 0.5 ) {
					u[ right ] = Math.max( 0, u[ right - 1 ] );
					v[ right ] = v[ right - 1 ];
				}
			}
			for ( let x = 1; x < w - 1; x++ ) {
				const bottom = ( h - 1 ) * w + x;
				if ( wall[ x + w ] < 0.5 ) {
					u[ x ] = u[ x + w ];
					v[ x ] = Math.min( 0, v[ x + w ] );
				}
				if ( wall[ bottom - w ] < 0.5 ) {
					u[ bottom ] = u[ bottom - w ];
					v[ bottom ] = Math.max( 0, v[ bottom - w ] );
				}
			}
		}
	}

	project() {
		const { w, h, u, v, pressure: p, div, wall } = this;
		p.fill( 0 );
		this.boundary();
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				div[ i ] =
					wall[ i ] > 0.5
						? 0
						: ( u[ i + 1 ] -
								u[ i - 1 ] +
								v[ i + w ] -
								v[ i - w ] ) *
						  0.5;
			}
		}
		for ( let k = 0; k < 18; k++ ) {
			for ( let y = 1; y < h - 1; y++ ) {
				for ( let x = 1; x < w - 1; x++ ) {
					const i = y * w + x;
					if ( wall[ i ] > 0.5 ) {
						continue;
					}
					p[ i ] =
						( ( wall[ i - 1 ] > 0.5 ? p[ i ] : p[ i - 1 ] ) +
							( wall[ i + 1 ] > 0.5 ? p[ i ] : p[ i + 1 ] ) +
							( wall[ i - w ] > 0.5 ? p[ i ] : p[ i - w ] ) +
							( wall[ i + w ] > 0.5 ? p[ i ] : p[ i + w ] ) -
							div[ i ] ) *
						0.25;
				}
			}
		}
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				u[ i ] = clamp(
					u[ i ] - ( p[ i + 1 ] - p[ i - 1 ] ) * 0.5,
					-12,
					12
				);
				v[ i ] = clamp(
					v[ i ] - ( p[ i + w ] - p[ i - w ] ) * 0.5,
					-12,
					12
				);
			}
		}
		this.boundary();
	}

	/** Move one phase and its pigments together across an interface. */
	separate( i, j, flux, group = OILS ) {
		if ( ! flux || this.wall[ i ] > 0.5 || this.wall[ j ] > 0.5 ) {
			return;
		}
		if ( flux < 0 ) {
			const a = i;
			i = j;
			j = a;
			flux = -flux;
		}
		const from = group === OILS ? this.oilAt( i ) : this[ group[ 0 ] ][ i ];
		const to = group === OILS ? this.oilAt( j ) : this[ group[ 0 ] ][ j ];
		const moved = Math.min(
			flux,
			from * 0.08,
			Math.max( 0, 0.98 - to ) * 0.08
		);
		if ( moved <= 0 || from <= 0.00001 ) {
			return;
		}
		for ( const material of group ) {
			for ( const suffix of [ '', 'R', 'G', 'B' ] ) {
				const a = this[ material + suffix ];
				if ( ! a ) {
					continue;
				}
				const v = ( a[ i ] * moved ) / from;
				a[ i ] -= v;
				a[ j ] += v;
			}
		}
		const pigments =
			group === OILS
				? this.paintPigments
				: this[ group[ 0 ] + 'Pigments' ];
		if ( pigments ) {
			for ( const a of pigments ) {
				const value = ( a[ i ] * moved ) / from;
				a[ i ] -= value;
				a[ j ] += value;
			}
		}
	}

	/**
	 * Exchange pigment and component concentrations only inside connected oil.
	 * Equal and opposite face fluxes keep all amounts, including at obstacles.
	 */
	mixOil( settings, dt ) {
		const {
			oilMass,
			oilInverse,
			temp,
			faceFrom,
			faceTo,
			faceCount,
			oilExchange,
		} = this;
		for ( let i = 0; i < this.n; i++ ) {
			oilMass[ i ] = this.oilAt( i );
			oilInverse[ i ] = oilMass[ i ] > 0.00001 ? 1 / oilMass[ i ] : 0;
		}
		for ( let f = 0; f < faceCount; f++ ) {
			const i = faceFrom[ f ],
				j = faceTo[ f ];
			const thermal =
				( this.temperature[ i ] + this.temperature[ j ] + 546.3 ) /
				586.3;
			oilExchange[ f ] =
				oilInverse[ i ] && oilInverse[ j ]
					? Math.min(
							0.12,
							( dt * settings.oilDiffusion * 6 * thermal ) /
								( 1 + ( this.nu[ i ] + this.nu[ j ] ) * 0.4 )
					  ) * Math.min( oilMass[ i ], oilMass[ j ] )
					: 0;
		}
		for ( const a of [
			this.oil,
			this.thick,
			this.ferro,
			...this.paintPigments,
		] ) {
			temp.set( a );
			for ( let f = 0; f < faceCount; f++ ) {
				if ( ! oilExchange[ f ] ) {
					continue;
				}
				const i = faceFrom[ f ],
					j = faceTo[ f ];
				const flux =
					oilExchange[ f ] *
					( a[ i ] * oilInverse[ i ] - a[ j ] * oilInverse[ j ] );
				temp[ i ] -= flux;
				temp[ j ] += flux;
			}
			a.set( temp );
		}
	}

	/** Build shared face coefficients once, not once for every pigment band. */
	buildFluxes( dt ) {
		const {
			w,
			h,
			wall,
			faceFrom,
			faceTo,
			bulkFlow,
			oilFlow,
			diffusive,
			maxDiffusive,
		} = this;
		let f = 0;
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				if ( wall[ i ] > 0.5 ) {
					continue;
				}
				for ( const dir of [ 1, w ] ) {
					if (
						( dir === 1 && x === w - 2 ) ||
						( dir === w && y === h - 2 )
					) {
						continue;
					}
					const j = i + dir;
					if ( wall[ j ] > 0.5 ) {
						continue;
					}
					faceFrom[ f ] = i;
					faceTo[ f ] = j;
					const general = dir === 1 ? this.surfaceU : this.surfaceV;
					const bulk = ( general[ i ] + general[ j ] ) * 0.5;
					bulkFlow[ f ] = dt * bulk;
					const density = Math.max(
						this.oilAt( i ),
						this.oilAt( j )
					);
					const mobility =
						( this.ferroMobility[ i ] + this.ferroMobility[ j ] ) *
						0.5;
					// Evaluate the pressure difference on this face. Averaging
					// cell-centered gradients skips neighbors and admits a grid mode.
					// Bound the nonlinear pressure diffusivity for all four faces;
					// scaling both forces preserves the same magnetic equilibrium.
					const stiffness =
						density * 1.2 * Math.max( 0, density - 1 );
					const stableMobility = Math.min(
						mobility,
						0.18 / Math.max( 1e-8, dt * stiffness )
					);
					const drift =
						stableMobility *
						( this.magnetic[ j ] -
							this.magnetic[ i ] +
							this.ferroPressure[ i ] -
							this.ferroPressure[ j ] );
					oilFlow[ f ] = dt * clamp( bulk + drift, -12, 12 );
					const aqueous = Math.max( 0, 1 - density );
					diffusive[ f ] =
						Math.exp(
							0.012 *
								( this.temperature[ i ] +
									this.temperature[ j ] -
									40 )
						) * aqueous;
					maxDiffusive[ f ] = 0.08 * aqueous;
					f++;
				}
			}
		}
		this.interiorFaceCount = f;
		if ( this.openBoundary ) {
			const outlet = ( i, inner, velocity ) => {
				if ( wall[ i ] > 0.5 ) {
					return;
				}
				faceFrom[ f ] = faceTo[ f ] = i;
				bulkFlow[ f ] = dt * Math.max( 0, clamp( velocity, -12, 12 ) );
				const density = Math.max(
					this.oilAt( i ),
					this.oilAt( inner )
				);
				const mobility = Math.min(
					this.ferroMobility[ i ],
					0.18 /
						Math.max(
							1e-8,
							dt * density * 1.2 * Math.max( 0, density - 1 )
						)
				);
				// Continue the inner magnetic/pressure gradient through the edge.
				// An outlet removes the same fraction of each carrier and pigment.
				const drift =
					mobility *
					( this.magnetic[ i ] -
						this.magnetic[ inner ] +
						this.ferroPressure[ inner ] -
						this.ferroPressure[ i ] );
				oilFlow[ f ] =
					dt * Math.max( 0, clamp( velocity + drift, -12, 12 ) );
				diffusive[ f ] = maxDiffusive[ f ] = 0;
				f++;
			};
			for ( let y = 1; y < h - 1; y++ ) {
				const left = y * w + 1,
					right = y * w + w - 2;
				outlet( left, left + 1, -this.surfaceU[ left ] );
				outlet( right, right - 1, this.surfaceU[ right ] );
			}
			for ( let x = 1; x < w - 1; x++ ) {
				const top = w + x,
					bottom = ( h - 2 ) * w + x;
				outlet( top, top + w, -this.surfaceV[ top ] );
				outlet( bottom, bottom - w, this.surfaceV[ bottom ] );
			}
		}
		this.faceCount = f;
	}

	step( settings, dt = 1 / 60 ) {
		// A fixed bounded step makes input, recording and resumed states agree.
		dt = clamp( dt, 0, 1 / 30 );
		if ( ! dt ) {
			return;
		}
		this.openBoundary = settings.boundary === 'open';
		if ( this.openBoundary ) {
			this.boundary();
		}
		updateTemperature( this, settings, dt );
		const {
			w,
			h,
			n,
			u,
			v,
			u0,
			v0,
			nu,
			mu,
			oil,
			thick,
			wall,
			metal,
			ferro,
			metalMu,
			sigma,
			surfaceU,
			surfaceV,
		} = this;
		const viscosity = settings.viscosities;
		const present = Object.fromEntries(
			MATERIALS.filter( ( m ) => ! m.volume ).map( ( m ) => [
				m.id,
				this[ m.id ].some( ( value ) => value !== 0 ),
			] )
		);
		present.paint = present.oil || present.thick || present.ferro;
		present.salt = this.salt.some( ( value ) => value !== 0 );
		// A convex packing pressure balances magnetic drift at finite density.
		// It acts through the existing conservative flux, never by clipping mass.
		if ( present.ferro ) {
			for ( let i = 0; i < n; i++ ) {
				this.ferroPressure[ i ] =
					0.6 * Math.max( 0, this.oilAt( i ) - 1 ) ** 2;
			}
		}
		const phase = ( i ) => clamp( this.oilAt( i ), 0, 1 );
		const metalPhase = ( i ) => clamp( metal[ i ], 0, 1 );
		for ( let i = 0; i < n; i++ ) {
			nu[ i ] =
				viscosity.water *
					Math.max(
						0,
						1 -
							phase( i ) -
							metalPhase( i ) -
							this.silicone[ i ] -
							this.wax[ i ]
					) +
				oil[ i ] * viscosity.oil +
				thick[ i ] * viscosity.thick +
				metal[ i ] * viscosity.metal +
				ferro[ i ] * viscosity.ferro;
			nu[ i ] *= Math.exp( -0.025 * ( this.temperature[ i ] - 20 ) );
			const melt = waxMelt(
				this.temperature[ i ],
				settings.waxMeltingPoint
			);
			this.waxFlow[ i ] = waxMobility(
				this.temperature[ i ],
				settings.waxMeltingPoint
			);
			nu[ i ] +=
				this.silicone[ i ] *
					viscosity.silicone *
					Math.exp( -0.006 * ( this.temperature[ i ] - 20 ) ) +
				this.wax[ i ] *
					( viscosity.wax *
						Math.exp( -0.025 * ( this.temperature[ i ] - 60 ) ) +
						180 * ( 1 - melt ) ** 2 );
			sigma[ i ] =
				( settings.tension *
					Math.max(
						0.3,
						1 - 0.003 * ( this.temperature[ i ] - 20 )
					) ) /
				( 1 +
					this.alcohol[ i ] * settings.alcoholStrength * 2 +
					this.surfactant[ i ] * settings.surfactantStrength * 4 +
					this.silicone[ i ] * 3 );
		}
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x,
					c = phase( i );
				const lap =
					phase( i - 1 ) +
					phase( i + 1 ) +
					phase( i - w ) +
					phase( i + w ) -
					4 * c;
				mu[ i ] =
					2 * c * ( 1 - c ) * ( 1 - 2 * c ) -
					0.7 * lap +
					1.5 *
						( metalPhase( i ) +
							this.silicone[ i ] +
							this.wax[ i ] );
				const m = metalPhase( i );
				const metalLap =
					metalPhase( i - 1 ) +
					metalPhase( i + 1 ) +
					metalPhase( i - w ) +
					metalPhase( i + w ) -
					4 * m;
				metalMu[ i ] =
					2 * m * ( 1 - m ) * ( 1 - 2 * m ) -
					0.8 * metalLap +
					1.5 * ( c + this.silicone[ i ] + this.wax[ i ] );
			}
		}
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x,
					c = phase( i );
				const f = dt * sigma[ i ] * 28 * c;
				const fm = dt * settings.metalTension * 28 * metalPhase( i );
				u[ i ] -= ( mu[ i + 1 ] - mu[ i - 1 ] ) * f;
				v[ i ] -= ( mu[ i + w ] - mu[ i - w ] ) * f;
				u[ i ] -= ( metalMu[ i + 1 ] - metalMu[ i - 1 ] ) * fm;
				v[ i ] -= ( metalMu[ i + w ] - metalMu[ i - w ] ) * fm;
				if ( present.ferro ) {
					this.ferroForceX[ i ] =
						this.magneticX[ i ] -
						0.5 *
							( this.ferroPressure[ i + 1 ] -
								this.ferroPressure[ i - 1 ] );
					this.ferroForceY[ i ] =
						this.magneticY[ i ] -
						0.5 *
							( this.ferroPressure[ i + w ] -
								this.ferroPressure[ i - w ] );
					u[ i ] += dt * ferro[ i ] * this.ferroForceX[ i ] * 55;
					v[ i ] += dt * ferro[ i ] * this.ferroForceY[ i ] * 55;
				}
			}
		}
		extraSurfaceForces( this, settings, present, dt );
		u0.set( u );
		v0.set( v );
		// Stable semi-Lagrangian velocity transport, then implicit viscous diffusion.
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				u[ i ] = this.sample( u0, x - dt * u0[ i ], y - dt * v0[ i ] );
				v[ i ] = this.sample( v0, x - dt * u0[ i ], y - dt * v0[ i ] );
			}
		}
		u0.set( u );
		v0.set( v );
		for ( let k = 0; k < 5; k++ ) {
			for ( let y = 1; y < h - 1; y++ ) {
				for ( let x = 1; x < w - 1; x++ ) {
					const i = y * w + x;
					const a = dt * ( nu[ i ] + nu[ i - 1 ] ),
						b = dt * ( nu[ i ] + nu[ i + 1 ] );
					const c = dt * ( nu[ i ] + nu[ i - w ] ),
						d = dt * ( nu[ i ] + nu[ i + w ] );
					const denom = 1 + a + b + c + d + dt * 0.1;
					u[ i ] =
						( u0[ i ] +
							a * u[ i - 1 ] +
							b * u[ i + 1 ] +
							c * u[ i - w ] +
							d * u[ i + w ] ) /
						denom;
					v[ i ] =
						( v0[ i ] +
							a * v[ i - 1 ] +
							b * v[ i + 1 ] +
							c * v[ i - w ] +
							d * v[ i + w ] ) /
						denom;
				}
			}
		}
		this.project();
		// A reduced surface-slip model for Marangoni stress. A pure gradient
		// inside the incompressible bulk projection would be cancelled out.
		// The unresolved return flow is below the film; this is not 3D CFD.
		surfaceU.set( u );
		surfaceV.set( v );
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				const mobility = 48 / ( 1 + nu[ i ] * 0.12 + metal[ i ] * 5 );
				if ( wall[ i ] > 0.5 ) {
					continue;
				}
				surfaceU[ i ] =
					wall[ i - 1 ] > 0.5 || wall[ i + 1 ] > 0.5
						? 0
						: clamp(
								u[ i ] +
									mobility *
										( sigma[ i + 1 ] - sigma[ i - 1 ] ),
								-12,
								12
						  );
				surfaceV[ i ] =
					wall[ i - w ] > 0.5 || wall[ i + w ] > 0.5
						? 0
						: clamp(
								v[ i ] +
									mobility *
										( sigma[ i + w ] - sigma[ i - w ] ),
								-12,
								12
						  );
			}
		}
		for ( let i = 0; i < n; i++ ) {
			this.ferroMobility[ i ] =
				( 55 * ferro[ i ] ) /
				Math.max( 0.00001, this.oilAt( i ) ) /
				( 1 + nu[ i ] * 0.3 );
		}
		// Pairwise fluxes conserve each material and pigment, including at walls.
		this.buildFluxes( dt );
		const { faceCount, faceFrom, faceTo, diffusive, maxDiffusive } = this;
		// The preview advances at 30 Hz. Split only transport for its CFL
		// bound; pressure, viscosity, source fields and optics need one pass.
		const passes = Math.ceil( dt * 60 - 1e-8 );
		for ( let pass = 0; pass < passes; pass++ ) {
			for ( const key of TRANSPORT ) {
				const group = key.startsWith( 'silicone' )
					? 'silicone'
					: key.startsWith( 'wax' )
					? 'wax'
					: key.startsWith( 'paint' )
					? 'paint'
					: key.startsWith( 'water' )
					? 'water'
					: key.replace( /[RGB]$/, '' );
				if ( ! present[ group ] ) {
					continue;
				}
				const a = this[ key ],
					out = this.temp;
				const flow = oilField( key ) ? this.oilFlow : this.bulkFlow;
				const diff = key.startsWith( 'water' )
					? ( settings.diffusion * dt * 1.5 ) / passes
					: key === 'alcohol'
					? ( dt * 0.45 ) / passes
					: key === 'surfactant'
					? ( dt * 0.12 ) / passes
					: [ 'acid', 'base', 'indicator', 'salt' ].includes( key )
					? ( dt * 1.5 ) / passes
					: 0;
				out.set( a );
				for ( let f = 0; f < faceCount; f++ ) {
					const i = faceFrom[ f ],
						j = faceTo[ f ],
						speed =
							( flow[ f ] / passes ) *
							( group === 'wax'
								? this.waxFlow[ flow[ f ] >= 0 ? i : j ]
								: 1 );
					const exchange = Math.min(
						maxDiffusive[ f ],
						diff * diffusive[ f ]
					);
					const flux =
						speed * ( speed > 0 ? a[ i ] : a[ j ] ) +
						exchange * ( a[ i ] - a[ j ] );
					out[ i ] -= flux;
					if ( f < this.interiorFaceCount ) {
						out[ j ] += flux;
					}
				}
				a.set( out );
			}
		}

		if ( present.paint && settings.oilDiffusion > 0 ) {
			this.mixOil( settings, dt );
		}
		mixExtraPigments( this, settings, present, dt );
		if ( present.acid && present.base ) {
			neutralize( this );
		}
		for ( let y = 1; y < h - 1; y++ ) {
			for ( let x = 1; x < w - 1; x++ ) {
				const i = y * w + x;
				if ( x < w - 2 ) {
					this.separate(
						i,
						i + 1,
						dt *
							( sigma[ i ] + sigma[ i + 1 ] ) *
							0.175 *
							( mu[ i ] - mu[ i + 1 ] )
					);
				}
				if ( y < h - 2 ) {
					this.separate(
						i,
						i + w,
						dt *
							( sigma[ i ] + sigma[ i + w ] ) *
							0.175 *
							( mu[ i ] - mu[ i + w ] )
					);
				}
				if ( present.metal && x < w - 2 ) {
					this.separate(
						i,
						i + 1,
						dt *
							settings.metalTension *
							0.6 *
							( metalMu[ i ] - metalMu[ i + 1 ] ),
						METAL
					);
				}
				if ( present.metal && y < h - 2 ) {
					this.separate(
						i,
						i + w,
						dt *
							settings.metalTension *
							0.6 *
							( metalMu[ i ] - metalMu[ i + w ] ),
						METAL
					);
				}
				const z = this.height,
					q = this.wave;
				const neighbor = ( j ) => ( wall[ j ] > 0.5 ? z[ i ] : z[ j ] );
				const lap =
					neighbor( i - 1 ) +
					neighbor( i + 1 ) +
					neighbor( i - w ) +
					neighbor( i + w ) -
					4 * z[ i ];
				// WAX-01: implicit damping stays stable when cold wax raises nu.
				// Explicit drag can reverse and amplify a wave at each time step.
				q[ i ] =
					wall[ i ] > 0.5
						? 0
						: clamp(
								( q[ i ] + dt * 120 * lap ) /
									( 1 + dt * ( 1.8 + nu[ i ] * 0.3 ) ),
								-0.3,
								0.3
						  );
			}
		}
		for ( let i = 0; i < n; i++ ) {
			this.height[ i ] = clamp(
				this.height[ i ] + dt * this.wave[ i ],
				-0.035,
				0.035
			);
		}
		for ( let i = 0; i < n; i++ ) {
			this.alcohol[ i ] *= Math.exp(
				-settings.evaporation *
					dt *
					Math.exp( 0.025 * ( this.temperature[ i ] - 20 ) )
			);
		}
		updateMagneticSurface( this, dt, settings );
		this.time += dt;
	}

	/** Exact float snapshots keep reopening independent of GPU rounding. */
	snapshot() {
		const all = new Float32Array( this.n * FIELDS.length );
		FIELDS.forEach( ( key, i ) => all.set( this[ key ], i * this.n ) );
		const bytes = new Uint8Array( all.buffer );
		let text = '';
		for ( let i = 0; i < bytes.length; i += 8192 ) {
			text += String.fromCharCode( ...bytes.subarray( i, i + 8192 ) );
		}
		return {
			version: 5,
			w: this.w,
			h: this.h,
			aspect: this.aspect,
			time: this.time,
			sources: cleanSources( this.sources ),
			customObstacles: this.customObstacles.snapshot(),
			data: btoa( text ),
		};
	}

	static restore( raw ) {
		if (
			! raw ||
			! [ 1, 2, 3, 4, 5 ].includes( raw.version ) ||
			! Number.isInteger( raw.w ) ||
			! Number.isInteger( raw.h ) ||
			raw.w < 24 ||
			raw.h < 24 ||
			raw.w > 160 ||
			raw.h > 160 ||
			! Number.isFinite( raw.aspect ) ||
			raw.aspect < 0.5 ||
			raw.aspect > 2 ||
			Math.abs( raw.w / raw.h - raw.aspect ) > 0.05
		) {
			throw new Error( 'Invalid fluid snapshot' );
		}
		const fields =
			raw.version === 1
				? LEGACY_FIELDS
				: raw.version === 2
				? V2_FIELDS
				: raw.version === 3
				? V3_FIELDS
				: raw.version === 4
				? V4_FIELDS
				: FIELDS;
		const length = raw.w * raw.h * fields.length * 4;
		if (
			typeof raw.data !== 'string' ||
			raw.data.length !== Math.ceil( length / 3 ) * 4
		) {
			throw new Error( 'Invalid fluid snapshot' );
		}
		const text = atob( raw.data );
		if ( text.length !== length ) {
			throw new Error( 'Invalid fluid snapshot' );
		}
		const bytes = Uint8Array.from( text, ( c ) => c.charCodeAt( 0 ) );
		const values = new Float32Array( bytes.buffer );
		if (
			values.some(
				( v ) =>
					! Number.isFinite( v ) ||
					Math.abs( v ) > ( raw.version >= 3 ? 100000 : 100 )
			)
		) {
			throw new Error( 'Invalid fluid snapshot' );
		}
		const sim = new FluidSimulation( raw.aspect, Math.max( raw.w, raw.h ) );
		if ( sim.w !== raw.w || sim.h !== raw.h ) {
			throw new Error( 'Invalid fluid snapshot' );
		}
		fields.forEach( ( key, i ) =>
			sim[ key ].set( values.subarray( i * sim.n, ( i + 1 ) * sim.n ) )
		);
		if ( raw.version < 3 ) {
			migratePigments( sim );
		} else {
			sim.sources = cleanSources( raw.sources || [] );
			for ( const key of FIELDS ) {
				if (
					[ 'u', 'v', 'height', 'wave', 'ferroPattern' ].includes(
						key
					) ||
					/C[RGB]$/.test( key )
				) {
					continue;
				}
				if (
					sim[ key ].some(
						( value ) =>
							value < -0.00001 ||
							( key === 'temperature' && value > 90 )
					)
				) {
					throw new Error( 'Invalid fluid field' );
				}
			}
		}
		sim.customObstacles = new Obstacles( sim, raw.customObstacles );
		sim.time = num( raw.time, 0, 1e9, 0 );
		return sim;
	}
}
