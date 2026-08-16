/**
 * The society: a world and its independent actors.
 *
 * The one architectural rule, and the reason the pictures feel alive:
 * NO ACTOR EVER READS ANOTHER ACTOR. Each one has its own inner clock,
 * makes its decisions on its own Poisson beat, and reads only the world -
 * time, palette heat, forces, density. Coordination happens through the
 * artwork, the way ants coordinate through the trail, never through code.
 *
 * Two actors run on WALL time on purpose: the timekeeper (or a freeze
 * would lock it out of its own decision loop) and the cameraman (a frozen
 * world with a moving camera is the whole point of a freeze).
 */

/* eslint-disable no-unused-vars */

import { generatePalette } from './palette.js';

export const BOUNDS = 100;

/** An orthonormal frame from randomness. */
function frame( rng ) {
	const r = () => rng() * 2 - 1;
	let u = [ r(), r(), r() ];
	let l = Math.hypot( ...u ) || 1;
	u = [ u[ 0 ] / l, u[ 1 ] / l, u[ 2 ] / l ];
	let v = [ r(), r(), r() ];
	const d = u[ 0 ] * v[ 0 ] + u[ 1 ] * v[ 1 ] + u[ 2 ] * v[ 2 ];
	v = [ v[ 0 ] - u[ 0 ] * d, v[ 1 ] - u[ 1 ] * d, v[ 2 ] - u[ 2 ] * d ];
	l = Math.hypot( ...v ) || 1;
	v = [ v[ 0 ] / l, v[ 1 ] / l, v[ 2 ] / l ];
	const n = [
		u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ],
		u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ],
		u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ],
	];
	return { u, v, n };
}

/**
 * The composition: a region of space with a center, a way to sample a
 * point inside it, and a pull that shepherds strays back in. All local
 * math in the domain's own tilted frame - nothing is axis-aligned,
 * nothing needs to sit in the middle.
 */
export function drawDomain( rng ) {
	const kinds = [
		'ball',
		'band',
		'wall',
		'column',
		'islands',
		'shell',
		'ringzone',
	];
	const kind = kinds[ Math.floor( rng() * kinds.length ) % kinds.length ];
	const { u, v, n } = frame( rng );
	const off = 0.15 + rng() * 0.35;
	const center = [
		( rng() * 2 - 1 ) * BOUNDS * off,
		( rng() * 2 - 1 ) * BOUNDS * off,
		( rng() * 2 - 1 ) * BOUNDS * off,
	];
	const a =
		'ball' === kind
			? BOUNDS * ( 0.35 + rng() * 0.45 )
			: BOUNDS * ( 0.45 + rng() * 0.4 );
	const b = BOUNDS * ( 0.3 + rng() * 0.4 );
	const c = BOUNDS * ( 0.06 + rng() * 0.16 );
	const subs = [];
	if ( 'islands' === kind ) {
		const nIsl = 2 + Math.floor( rng() * 2 );
		for ( let i = 0; i < nIsl; i++ ) {
			subs.push( {
				at: [
					center[ 0 ] + ( rng() * 2 - 1 ) * BOUNDS * 0.55,
					center[ 1 ] + ( rng() * 2 - 1 ) * BOUNDS * 0.55,
					center[ 2 ] + ( rng() * 2 - 1 ) * BOUNDS * 0.55,
				],
				r: BOUNDS * ( 0.14 + rng() * 0.16 ),
			} );
		}
	}
	const local = ( p ) => {
		const d = [
			p[ 0 ] - center[ 0 ],
			p[ 1 ] - center[ 1 ],
			p[ 2 ] - center[ 2 ],
		];
		return [
			d[ 0 ] * u[ 0 ] + d[ 1 ] * u[ 1 ] + d[ 2 ] * u[ 2 ],
			d[ 0 ] * v[ 0 ] + d[ 1 ] * v[ 1 ] + d[ 2 ] * v[ 2 ],
			d[ 0 ] * n[ 0 ] + d[ 1 ] * n[ 1 ] + d[ 2 ] * n[ 2 ],
		];
	};
	const toWorld = ( x, y, z ) => [
		center[ 0 ] + u[ 0 ] * x + v[ 0 ] * y + n[ 0 ] * z,
		center[ 1 ] + u[ 1 ] * x + v[ 1 ] * y + n[ 1 ] * z,
		center[ 2 ] + u[ 2 ] * x + v[ 2 ] * y + n[ 2 ] * z,
	];
	// Overshoot per local axis -> world-space pull.
	const pullFrom = ( ox, oy, oz ) => {
		const k = 0.9;
		return [
			-( u[ 0 ] * ox + v[ 0 ] * oy + n[ 0 ] * oz ) * k,
			-( u[ 1 ] * ox + v[ 1 ] * oy + n[ 1 ] * oz ) * k,
			-( u[ 2 ] * ox + v[ 2 ] * oy + n[ 2 ] * oz ) * k,
		];
	};
	const over = ( q, lim ) =>
		Math.abs( q ) > lim ? q - Math.sign( q ) * lim : 0;
	return {
		kind,
		center,
		size: a,
		sample( rr ) {
			const g = () => rr() * 2 - 1;
			if ( 'islands' === kind ) {
				const isl =
					subs[ Math.floor( rr() * subs.length ) % subs.length ];
				return [
					isl.at[ 0 ] + g() * isl.r,
					isl.at[ 1 ] + g() * isl.r,
					isl.at[ 2 ] + g() * isl.r,
				];
			}
			if ( 'band' === kind ) {
				return toWorld( g() * a, g() * b * 0.4, g() * c );
			}
			if ( 'wall' === kind ) {
				return toWorld( g() * a, g() * b, g() * c * 0.6 );
			}
			if ( 'column' === kind ) {
				const t = rr() * Math.PI * 2;
				const rad = Math.sqrt( rr() ) * c * 1.6;
				return toWorld(
					Math.cos( t ) * rad,
					Math.sin( t ) * rad,
					g() * a
				);
			}
			if ( 'shell' === kind ) {
				const w = g();
				const t = rr() * Math.PI * 2;
				const sq = Math.sqrt( Math.max( 0, 1 - w * w ) );
				const rad = a * 0.8 + g() * c;
				return toWorld(
					Math.cos( t ) * sq * rad,
					w * rad,
					Math.sin( t ) * sq * rad
				);
			}
			if ( 'ringzone' === kind ) {
				const t = rr() * Math.PI * 2;
				return toWorld(
					Math.cos( t ) * ( a * 0.7 + g() * c ),
					Math.sin( t ) * ( a * 0.7 + g() * c ),
					g() * c
				);
			}
			// ball
			const w = g();
			const t = rr() * Math.PI * 2;
			const sq = Math.sqrt( Math.max( 0, 1 - w * w ) );
			const rad = Math.cbrt( rr() ) * a;
			return toWorld(
				Math.cos( t ) * sq * rad,
				w * rad,
				Math.sin( t ) * sq * rad
			);
		},
		pull( p ) {
			if ( 'islands' === kind ) {
				let best = null;
				let bd = Infinity;
				for ( const isl of subs ) {
					const dx = p[ 0 ] - isl.at[ 0 ];
					const dy = p[ 1 ] - isl.at[ 1 ];
					const dz = p[ 2 ] - isl.at[ 2 ];
					const d = Math.hypot( dx, dy, dz );
					if ( d < bd ) {
						bd = d;
						best = { isl, dx, dy, dz, d };
					}
				}
				if ( ! best || best.d <= best.isl.r ) {
					return [ 0, 0, 0 ];
				}
				const k = ( ( best.d - best.isl.r ) / best.d ) * 0.9;
				return [ -best.dx * k, -best.dy * k, -best.dz * k ];
			}
			const q = local( p );
			if ( 'band' === kind ) {
				return pullFrom(
					over( q[ 0 ], a ),
					over( q[ 1 ], b * 0.4 ),
					over( q[ 2 ], c )
				);
			}
			if ( 'wall' === kind ) {
				return pullFrom(
					over( q[ 0 ], a ),
					over( q[ 1 ], b ),
					over( q[ 2 ], c * 0.6 )
				);
			}
			if ( 'column' === kind ) {
				const rad = Math.hypot( q[ 0 ], q[ 1 ] );
				const orad =
					rad > c * 1.6 ? ( rad - c * 1.6 ) / ( rad || 1 ) : 0;
				return pullFrom(
					q[ 0 ] * orad,
					q[ 1 ] * orad,
					over( q[ 2 ], a )
				);
			}
			if ( 'shell' === kind ) {
				const d = Math.hypot( q[ 0 ], q[ 1 ], q[ 2 ] ) || 1;
				const ov = over( d - a * 0.8, c );
				const k = ov / d;
				return pullFrom( q[ 0 ] * k, q[ 1 ] * k, q[ 2 ] * k );
			}
			if ( 'ringzone' === kind ) {
				const rad = Math.hypot( q[ 0 ], q[ 1 ] ) || 1;
				const ov = over( rad - a * 0.7, c );
				const k = ov / rad;
				return pullFrom( q[ 0 ] * k, q[ 1 ] * k, over( q[ 2 ], c ) );
			}
			const d = Math.hypot( q[ 0 ], q[ 1 ], q[ 2 ] );
			if ( d <= a ) {
				return [ 0, 0, 0 ];
			}
			const k = ( d - a ) / d;
			return pullFrom( q[ 0 ] * k, q[ 1 ] * k, q[ 2 ] * k );
		},
	};
}

export class World {
	constructor( { rng, params } ) {
		this.rng = rng;
		this.params = params; // { chaos, energy, density, tempo, colors, auto* }
		this.time = 0; // warped seconds - what the painters live in
		this.wall = 0; // real seconds since start
		// Every piece opens differently: its own first tempo, its own
		// first gaze, its own way of scattering the painters.
		this.timeScale = 0.6 + rng() * 0.8;
		this.tsTarget = this.timeScale;
		this.casting = []; // stage directions (hire/retire), engine executes
		this.stroke = { width: 1, glow: 0 }; // the sculptor writes these
		this.heat = 0.5; // the colorist slides this along the palette
		this.accentUntil = -1; // warped time until which accents fire
		this.impulses = [];
		this.cursor = { active: false, point: [ 0, 0, 0 ], mode: 'wind' };
		const th0 = rng() * Math.PI * 2;
		const ph0 = 0.5 + rng() * 1.7;
		const ra0 = 90 + rng() * 140;
		// The eye has moods per piece: a near-still TABLEAU that lets a
		// composition stand, a slow DRIFT, or the restless orbit.
		const camReg = rng();
		this.cameraRegime =
			camReg < 0.3 ? 'tableau' : camReg < 0.65 ? 'drift' : 'orbit';
		this.camera = {
			theta: th0,
			phi: ph0,
			radius: ra0,
			look: [ 0, 0, 0 ],
			lookT: [ 0, 0, 0 ],
			thetaT: th0,
			phiT: ph0,
			radiusT: ra0,
			speed: 0.25,
		};
		this.emitted = []; // command stream the renderer drains
		// THE PICTURE AS A SENSE: a coarse density field over the stage.
		// Painters read it - the sociable seek painted ground, the
		// solitary flee into emptiness. This is stigmergy made real,
		// not just claimed: the only shared thing IS the artwork.
		this.fieldN = 12;
		this.fieldExt = 130;
		this.field = new Float32Array( 12 * 12 * 12 );
		// THE COMPOSITION: every piece inhabits its own region of space -
		// a ball, a frieze, a thin wall, a column, an island group, a
		// hollow shell or a ring zone - shoved off center and tilted.
		// This is what kills the "always a centered blob" sameness.
		this.domain = drawDomain( rng );
		// THE SCALE REGIME: miniature swarms, grand forms, or a mixed
		// hierarchy where a few giants live among many small hands.
		const reg = rng();
		this.scaleMul =
			reg < 0.25
				? 0.45 + rng() * 0.3
				: reg < 0.75
				? 0.8 + rng() * 0.6
				: 1.6 + rng() * 1.2;
		this.mixedScale = reg >= 0.25 && reg < 0.75 && rng() < 0.5;
		this.paletteJolt = false;
		this.moodJolt = false;
		// THE LIVING FASHION: nothing is fixed at the start. Finished
		// gestures are laid into this memory; other painters imitate the
		// recent ones with mutation, or improvise. Fashions emerge,
		// drift, and are displaced - the early strokes shape everything
		// after them, so no run can ever resemble another.
		this.memes = [];
		// CALL AND RESPONSE: the endpoint of the latest finished gesture.
		// One painter may answer it - and consume it - so chains form.
		this.echo = null;
		// THE CHRONICLE: what this piece lived through. The steckbrief
		// (title and biography) is written from it, never invented.
		this.chronicle = [];
		this.groundRgb = [ 0.05, 0.05, 0.07 ];
		// How the company takes the stage inside its domain.
		const pat = rng();
		this.spawn = pat < 0.5 ? 'scatter' : pat < 0.8 ? 'cluster' : 'core';
		this.seeds = [];
		const nSeeds = 1 + Math.floor( rng() * 3 );
		for ( let i = 0; i < nSeeds; i++ ) {
			this.seeds.push( this.domain.sample( rng ) );
		}
		this.segments = 0; // lifetime count - a cheap density signal
		this.style = {}; // per-style shared state (neon centers etc.)
	}

	fieldIndex( p ) {
		const n = this.fieldN;
		const e = this.fieldExt;
		const gx = Math.max(
			0,
			Math.min( n - 1, Math.floor( ( ( p[ 0 ] + e ) / ( 2 * e ) ) * n ) )
		);
		const gy = Math.max(
			0,
			Math.min( n - 1, Math.floor( ( ( p[ 1 ] + e ) / ( 2 * e ) ) * n ) )
		);
		const gz = Math.max(
			0,
			Math.min( n - 1, Math.floor( ( ( p[ 2 ] + e ) / ( 2 * e ) ) * n ) )
		);
		return ( gz * n + gy ) * n + gx;
	}

	/** Where has the most paint gathered? The doubter strikes there. */
	densestSpot() {
		let best = 0;
		let at = -1;
		for ( let i = 0; i < this.field.length; i++ ) {
			if ( this.field[ i ] > best ) {
				best = this.field[ i ];
				at = i;
			}
		}
		if ( at < 0 || best < 4 ) {
			return this.spawnAt();
		}
		const n = this.fieldN;
		const e = this.fieldExt;
		const gx = at % n;
		const gy = Math.floor( at / n ) % n;
		const gz = Math.floor( at / ( n * n ) );
		const cell = ( 2 * e ) / n;
		const jit = () => ( this.rng() - 0.5 ) * cell * 0.8;
		return [
			-e + ( gx + 0.5 ) * cell + jit(),
			-e + ( gy + 0.5 ) * cell + jit(),
			-e + ( gz + 0.5 ) * cell + jit(),
		];
	}

	/** A finished gesture joins the piece's living fashion. */
	postMeme( motif ) {
		this.memes.push( { ...motif } );
		while ( this.memes.length > 12 ) {
			this.memes.shift();
		}
	}

	/** A recent gesture to imitate - the newer, the more tempting. */
	pickMeme( kinds = null ) {
		const pool = kinds
			? this.memes.filter( ( m ) => kinds.includes( m.kind ) )
			: this.memes;
		if ( ! pool.length ) {
			return null;
		}
		const i = Math.floor( Math.pow( this.rng(), 0.5 ) * pool.length );
		return pool[ Math.min( pool.length - 1, i ) ];
	}

	/** A mark was made here; the picture remembers. */
	note( p, amt = 1 ) {
		this.field[ this.fieldIndex( p ) ] += amt;
	}

	densityAt( p ) {
		return this.field[ this.fieldIndex( p ) ];
	}

	/** Where is there more paint? Central differences, one cell wide. */
	densityGrad( p ) {
		const h = ( 2 * this.fieldExt ) / this.fieldN;
		const gx =
			this.densityAt( [ p[ 0 ] + h, p[ 1 ], p[ 2 ] ] ) -
			this.densityAt( [ p[ 0 ] - h, p[ 1 ], p[ 2 ] ] );
		const gy =
			this.densityAt( [ p[ 0 ], p[ 1 ] + h, p[ 2 ] ] ) -
			this.densityAt( [ p[ 0 ], p[ 1 ] - h, p[ 2 ] ] );
		const gz =
			this.densityAt( [ p[ 0 ], p[ 1 ], p[ 2 ] + h ] ) -
			this.densityAt( [ p[ 0 ], p[ 1 ], p[ 2 ] - h ] );
		const l = Math.hypot( gx, gy, gz );
		return l > 1e-6 ? [ gx / l, gy / l, gz / l ] : [ 0, 0, 0 ];
	}

	/** Where a painter enters the stage: inside the piece's domain. */
	spawnAt() {
		const r = () => this.rng() * 2 - 1;
		if ( 'cluster' === this.spawn ) {
			const seed =
				this.seeds[ Math.floor( this.rng() * this.seeds.length ) ];
			return [
				seed[ 0 ] + r() * 12,
				seed[ 1 ] + r() * 12,
				seed[ 2 ] + r() * 12,
			];
		}
		if ( 'core' === this.spawn ) {
			const c = this.domain.center;
			return [ c[ 0 ] + r() * 10, c[ 1 ] + r() * 10, c[ 2 ] + r() * 10 ];
		}
		return this.domain.sample( this.rng );
	}

	/** A gentle force keeping a wanderer inside the composition. */
	domainForce( p ) {
		return this.domain.pull( p );
	}

	/** Sum of all disturbance forces at a point. */
	forceAt( p ) {
		let fx = 0;
		let fy = 0;
		let fz = 0;
		for ( const im of this.impulses ) {
			const dx = p[ 0 ] - im.pos[ 0 ];
			const dy = p[ 1 ] - im.pos[ 1 ];
			const dz = p[ 2 ] - im.pos[ 2 ];
			const d2 = dx * dx + dy * dy + dz * dz + 25;
			const fade = 1 - im.age / im.dur;
			const k = ( im.power * fade ) / d2;
			fx += dx * k + im.dir[ 0 ] * k * 8;
			fy += dy * k + im.dir[ 1 ] * k * 8;
			fz += dz * k + im.dir[ 2 ] * k * 8;
		}
		const c = this.cursor;
		if ( c.active && 'off' !== c.mode ) {
			const dx = p[ 0 ] - c.point[ 0 ];
			const dy = p[ 1 ] - c.point[ 1 ];
			const dz = p[ 2 ] - c.point[ 2 ];
			const d2 = dx * dx + dy * dy + dz * dz + 60;
			const k = 2600 / d2;
			if ( 'attract' === c.mode ) {
				fx -= dx * k;
				fy -= dy * k;
				fz -= dz * k;
			} else if ( 'repel' === c.mode ) {
				fx += dx * k * 1.6;
				fy += dy * k * 1.6;
				fz += dz * k * 1.6;
			} else {
				// Wind shears sideways around the pointer instead of
				// pushing head-on - it stirs, it does not scatter.
				fx += ( dy * 0.8 - dz * 0.4 ) * k;
				fy += ( dz * 0.8 - dx * 0.4 ) * k;
				fz += ( dx * 0.8 - dy * 0.4 ) * k;
			}
		}
		return [ fx, fy, fz ];
	}

	/** One frame: wall time in, warped time out to the actors. */
	step( dtWall, actors ) {
		const dw = Math.min( 0.1, Math.max( 0, dtWall ) );
		this.wall += dw;
		for ( const a of actors ) {
			if ( a.wallClocked ) {
				a.tick( dw );
			}
		}
		const dt = dw * this.timeScale * ( this.params.tempo || 1 );
		this.time += dt;
		for ( const a of actors ) {
			if ( ! a.wallClocked ) {
				a.tick( dt );
			}
		}
		if ( dt > 0 ) {
			// The picture's memory fades a little - old zones stop
			// shouting, fresh paint is what the senses smell.
			const f = Math.max( 0, 1 - dt * 0.03 );
			for ( let i = 0; i < this.field.length; i++ ) {
				this.field[ i ] *= f;
			}
		}
		for ( let i = this.impulses.length - 1; i >= 0; i-- ) {
			this.impulses[ i ].age += dt;
			if ( this.impulses[ i ].age >= this.impulses[ i ].dur ) {
				this.impulses.splice( i, 1 );
			}
		}
		return dt;
	}
}

/**
 * An actor: an inner clock, a Poisson-beaten decide(), a continuous act().
 * rate is decisions per second, verve scales how far a decision reaches.
 */
export class Actor {
	constructor( world, { rate = 0.3, verve = 0.5 } = {} ) {
		this.world = world;
		this.rate = Math.max( 0.005, rate );
		this.verve = verve;
		this.wallClocked = false;
		this.acc = 0;
		this.wait = this.nextWait();
	}

	nextWait() {
		const r = this.world.rng();
		// Exponential waiting time, capped so a tiny rate cannot silence
		// an actor for minutes.
		return Math.min(
			45,
			-Math.log( 1 - Math.min( r, 0.9999 ) ) / this.rate
		);
	}

	tick( dt ) {
		// A staged entrance: the painter waits in the wings until the
		// piece's clock reaches its cue. No two openings are alike.
		if ( this.entry && this.world.time < this.entry ) {
			return;
		}
		this.acc += dt;
		let guard = 8;
		while ( this.acc >= this.wait && guard-- > 0 ) {
			this.acc -= this.wait;
			this.wait = this.nextWait();
			this.decide();
		}
		this.act( dt );
	}

	decide() {}

	act( dt ) {}
}

/* ------------------------------ the characters ---------------------------- */

const lerp = ( a, b, t ) => a + ( b - a ) * t;
const ease = ( v, target, dt, k ) => v + ( target - v ) * Math.min( 1, dt * k );

/** Stretches and squeezes the world's time. Runs on wall time. */
export class Timekeeper extends Actor {
	constructor( world, temperament ) {
		super( world, temperament );
		this.wallClocked = true;
		this.freezeUntil = -1;
	}

	decide() {
		const w = this.world;
		const chaos = w.params.chaos;
		const r = w.rng();
		if ( r < 0.1 + 0.18 * chaos ) {
			// A held breath: near-stillness for a moment, then release.
			w.tsTarget = 0.02;
			this.freezeUntil = w.wall + 0.5 + w.rng() * 2.2 * this.verve;
			return;
		}
		// Skewed toward calm, with chaotic worlds reaching further out.
		const spread = 0.5 + 1.1 * chaos;
		w.tsTarget = Math.max(
			0.12,
			Math.min( 3.2, Math.exp( ( w.rng() - 0.42 ) * 2 * spread ) )
		);
	}

	act( dtWall ) {
		const w = this.world;
		if ( this.freezeUntil > 0 && w.wall >= this.freezeUntil ) {
			this.freezeUntil = -1;
			w.tsTarget = 0.6 + w.rng() * 0.8;
		}
		w.timeScale = ease( w.timeScale, w.tsTarget, dtWall, 1.6 );
	}
}

/** Slides the palette heat, throws accent moments. */
export class Colorist extends Actor {
	constructor( world, temperament ) {
		super( world, temperament );
		this.heatT = world.heat;
	}

	decide() {
		const w = this.world;
		this.heatT = w.rng();
		if ( w.rng() < 0.1 + 0.25 * w.params.chaos ) {
			w.accentUntil = w.time + 0.4 + w.rng() * 1.2;
		}
		// When the colors are the society's own, the colorist may change
		// her mind entirely: a new palette, an epoch in the picture. Old
		// paint keeps its colors - painted is painted.
		if ( w.params.autoPalette && ( w.paletteJolt || w.rng() < 0.07 ) ) {
			w.paletteJolt = false;
			w.chronicle.push( { e: 'palette', t: w.time } );
			const next = generatePalette( w.rng );
			w.params.colors.length = 0;
			for ( const c of next ) {
				w.params.colors.push( c );
			}
		}
	}

	act( dt ) {
		this.world.heat = ease(
			this.world.heat,
			this.heatT,
			dt,
			0.5 + this.verve
		);
	}
}

/** Swells and thins every future stroke. */
export class Sculptor extends Actor {
	constructor( world, temperament ) {
		super( world, temperament );
		this.widthT = 1;
		this.glowT = world.stroke.glow;
		this.glowBase = world.stroke.glow;
	}

	decide() {
		const w = this.world;
		const reach = 0.5 + this.verve * ( 0.6 + w.params.chaos );
		this.widthT = Math.max(
			0.3,
			Math.min( 3, Math.exp( ( w.rng() - 0.45 ) * 2 * reach ) )
		);
		this.glowT = Math.max(
			0,
			Math.min( 1, this.glowBase + ( w.rng() - 0.5 ) * this.verve )
		);
	}

	act( dt ) {
		const s = this.world.stroke;
		s.width = ease( s.width, this.widthT, dt, 0.8 );
		s.glow = ease( s.glow, this.glowT, dt, 0.8 );
	}
}

/** Rare, prägend: throws impulses through the space. */
export class Disruptor extends Actor {
	decide() {
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		const dir = [ r(), r(), r() ];
		const len = Math.hypot( ...dir ) || 1;
		w.impulses.push( {
			pos: [ r() * BOUNDS * 0.7, r() * BOUNDS * 0.7, r() * BOUNDS * 0.7 ],
			dir: [ dir[ 0 ] / len, dir[ 1 ] / len, dir[ 2 ] / len ],
			power:
				( 400 + w.rng() * 2400 ) *
				( 0.3 + w.params.energy ) *
				( 0.4 + this.verve ),
			dur: 0.4 + w.rng() * 1.8,
			age: 0,
		} );
		if ( w.impulses.length > 12 ) {
			w.impulses.shift();
		}
	}
}

/** Moves the eye through the work. Runs on wall time (bullet time). */
export class Cameraman extends Actor {
	constructor( world, temperament ) {
		super( world, temperament );
		this.wallClocked = true;
	}

	decide() {
		const w = this.world;
		const cam = w.camera;
		const chaos = w.params.chaos;
		// Even the eye's mood is not fixed for life.
		if ( w.rng() < 0.07 ) {
			const moods = [ 'tableau', 'drift', 'orbit' ];
			w.cameraRegime =
				moods[ Math.floor( w.rng() * moods.length ) % moods.length ];
		}
		// A tableau eye mostly declines to move at all.
		const still = 'tableau' === w.cameraRegime;
		const slow = 'drift' === w.cameraRegime;
		if ( still && w.rng() < 0.75 ) {
			return;
		}
		const pace = still ? 0.16 : slow ? 0.45 : 1;
		const turn =
			( w.rng() - 0.5 ) *
			( 1.2 + 2.4 * chaos ) *
			( 0.5 + this.verve ) *
			pace;
		cam.thetaT = cam.theta + turn * Math.PI;
		cam.phiT = lerp( 0.45, 2.2, w.rng() );
		if ( w.rng() < 0.12 + 0.2 * chaos ) {
			// The dive: straight into the middle of the paint.
			cam.radiusT = lerp( 28, 60, w.rng() );
		} else {
			cam.radiusT = lerp( 90, 250, w.rng() );
		}
		cam.speed =
			lerp( 0.1, 0.55, w.rng() ) *
			( 0.5 + this.verve ) *
			( still ? 0.25 : slow ? 0.55 : 1 );
		// The gaze wanders off center: the eye finds its own compositions
		// instead of staring at the middle of the stage forever.
		const off = cam.radiusT * 0.22;
		cam.lookT = [
			( w.rng() - 0.5 ) * off,
			( w.rng() - 0.5 ) * off,
			( w.rng() - 0.5 ) * off,
		];
	}

	act( dtWall ) {
		const cam = this.world.camera;
		const k = dtWall * cam.speed;
		cam.theta += ( cam.thetaT - cam.theta ) * Math.min( 1, k );
		cam.phi += ( cam.phiT - cam.phi ) * Math.min( 1, k );
		cam.radius += ( cam.radiusT - cam.radius ) * Math.min( 1, k * 0.8 );
		cam.phi = Math.max( 0.25, Math.min( 2.6, cam.phi ) );
		cam.radius = Math.max( 24, Math.min( 300, cam.radius ) );
		for ( let i = 0; i < 3; i++ ) {
			cam.look[ i ] +=
				( cam.lookT[ i ] - cam.look[ i ] ) * Math.min( 1, k * 0.6 );
		}
	}
}

/**
 * The restless one: re-tunes the society's own temperament and swaps
 * players mid-piece. It never touches another actor - it posts stage
 * directions to the world, and the stage (the engine) carries them out.
 */
export class Restless extends Actor {
	constructor( world, temperament ) {
		super( world, temperament );
		this.lastBreak = 0;
	}

	act( dt ) {
		// Upheavals are LIVED, not scheduled: the longer a piece settles
		// into itself, the more the pressure grows - until it breaks,
		// and then everything breaks at once. When depends on chance;
		// that it comes, on time itself.
		const w = this.world;
		const since = w.time - this.lastBreak;
		const hazard = dt * ( 0.002 + since * 0.0005 );
		if ( since > 20 && w.rng() < hazard ) {
			this.lastBreak = w.time;
			const moves = 2 + Math.floor( w.rng() * 3 );
			for ( let i = 0; i < moves; i++ ) {
				if ( w.params.allowRecast ) {
					w.casting.push( {
						type: w.rng() < 0.5 ? 'retire' : 'hire',
					} );
				}
			}
			if ( w.params.autoPalette ) {
				w.paletteJolt = true;
			}
			w.tsTarget = w.rng() < 0.5 ? 0.25 : 1.6 + w.rng();
			// The stage itself is not sacred: the piece may move house.
			// Old paint stays where it was made - places become epochs.
			let movedHouse = false;
			if ( w.rng() < 0.55 ) {
				w.domain = drawDomain( w.rng );
				movedHouse = true;
			}
			// The light, the matter, and (when free) the school follow.
			w.moodJolt = true;
			// The sense of size drifts too.
			w.scaleMul = Math.max(
				0.4,
				Math.min( 2.8, w.scaleMul * ( 0.6 + w.rng() * 0.9 ) )
			);
			// Half the fashion is forgotten in the turmoil.
			w.memes.splice( 0, Math.floor( w.memes.length / 2 ) );
			w.chronicle.push( {
				e: 'upheaval',
				t: w.time,
				moved: movedHouse,
			} );
		}
		super.act( dt );
	}

	decide() {
		const w = this.world;
		if ( w.params.allowRecast && w.rng() < 0.55 ) {
			w.casting.push( {
				type: w.rng() < 0.45 ? 'retire' : 'hire',
			} );
			if ( w.casting.length > 6 ) {
				w.casting.shift();
			}
		}
		if ( w.params.autoTemper ) {
			const nudge = ( k, lo, hi, amt ) => {
				w.params[ k ] = Math.max(
					lo,
					Math.min( hi, w.params[ k ] + ( w.rng() - 0.5 ) * amt )
				);
			};
			nudge( 'chaos', 0.05, 1, 0.24 );
			nudge( 'energy', 0.1, 1, 0.24 );
			nudge( 'tempo', 0.4, 2.4, 0.3 );
		}
	}
}

/** Lets old matter crumble - the budget dressed as vergänglichkeit. */
export class Decayer extends Actor {
	decide() {
		const w = this.world;
		w.emitted.push( {
			type: 'decay',
			k: Math.round( 20 + w.rng() * 160 * ( 0.3 + this.verve ) ),
		} );
	}
}
