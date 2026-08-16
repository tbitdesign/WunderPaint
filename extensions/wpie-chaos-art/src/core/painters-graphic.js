/**
 * The graphic painters: the half of the company that CONSTRUCTS.
 *
 * The organic painters flow; these ones thread, build, grow cells, turn
 * gears, draw with a ruler and stamp to a beat. They emit 'shape'
 * commands - rings, cubes, hex cells, discs, rods, frames, cones - and
 * the engine's instanced stores make matter of them.
 */

import { Actor, BOUNDS } from './actors.js';
import { Painter, shapeScale } from './painters.js';
import { flow } from './rng.js';
import { pickColor } from './palette.js';

const unit = ( v ) => {
	const l = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] ) || 1;
	return [ v[ 0 ] / l, v[ 1 ] / l, v[ 2 ] / l ];
};

/** Two orthonormal vectors spanning a random plane. */
function randomPlane( rng ) {
	const r = () => rng() * 2 - 1;
	const u = unit( [ r(), r(), r() ] );
	let v = [ r(), r(), r() ];
	const d = u[ 0 ] * v[ 0 ] + u[ 1 ] * v[ 1 ] + u[ 2 ] * v[ 2 ];
	v = unit( [
		v[ 0 ] - u[ 0 ] * d,
		v[ 1 ] - u[ 1 ] * d,
		v[ 2 ] - u[ 2 ] * d,
	] );
	const n = [
		u[ 1 ] * v[ 2 ] - u[ 2 ] * v[ 1 ],
		u[ 2 ] * v[ 0 ] - u[ 0 ] * v[ 2 ],
		u[ 0 ] * v[ 1 ] - u[ 1 ] * v[ 0 ],
	];
	return { u, v, n };
}

function emitShape( w, shape, p, dir, s, colorBias ) {
	const accent = w.time < w.accentUntil && w.rng() < 0.25;
	w.emitted.push( {
		type: 'shape',
		shape,
		p,
		dir,
		s,
		color: pickColor( w.params.colors, w.rng, w.heat, colorBias, accent ),
		glow: w.stroke.glow,
	} );
	w.segments++;
	w.note( p );
}

/* -------------------------------- threader -------------------------------- */

/** Runs a calm path and threads rings onto it, like beads on a string. */
export class Threader extends Painter {
	constructor( world, temperament = {} ) {
		super( world, {
			kinds: [ 'arc', 'scurve', 'loop', 'spiral' ],
			...temperament,
			segLen: temperament.segLen || 4,
		} );
		this.phase = world.rng() * Math.PI * 2;
	}

	steer( dt ) {
		const w = this.world;
		const f = flow( this.pos, w.time * 0.6, 0.01 );
		const force = w.forceAt( this.pos );
		const k = this.speed * dt * 1.4;
		this.vel[ 0 ] += f[ 0 ] * k + force[ 0 ] * dt * 0.4;
		this.vel[ 1 ] += f[ 1 ] * k + force[ 1 ] * dt * 0.4;
		this.vel[ 2 ] += f[ 2 ] * k + force[ 2 ] * dt * 0.4;
		const damp = Math.max( 0, 1 - dt * 0.5 );
		this.vel[ 0 ] *= damp;
		this.vel[ 1 ] *= damp;
		this.vel[ 2 ] *= damp;
	}

	putMark( a, b, mw ) {
		const w = this.world;
		// Rings threaded ALONG the gesture, breathing with the envelope;
		// every so often a disc slips in, so the string is no machine.
		const size = Math.max( 0.2, mw * 2.2 );
		const dir = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
		const shape = w.rng() < 0.14 ? 'disc' : this.markShape || 'ring';
		emitShape(
			w,
			shape,
			b.slice(),
			dir,
			shapeScale( shape, size ),
			this.colorBias
		);
	}
}

/* --------------------------------- mason ---------------------------------- */

/** Builds on an invisible lattice: walls, stairs, floating towns. */
export class Mason extends Painter {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.grid = temperament.grid || 7;
		this.cell = this.randomCell();
		this.buildAcc = 0;
		this.buildEvery = 0.14 + world.rng() * 0.1;
		this.up = world.rng() < 0.55; // a tower soul or a wall soul
	}

	randomCell() {
		const w = this.world;
		const g = this.grid;
		const at = w.spawnAt ? w.spawnAt() : [ 0, 0, 0 ];
		return [
			Math.round( at[ 0 ] / g ),
			Math.round( at[ 1 ] / g ),
			Math.round( at[ 2 ] / g ),
		];
	}

	decide() {
		const w = this.world;
		// A new site, or a change of heart between towers and walls.
		if ( w.rng() < 0.4 ) {
			this.cell = this.randomCell();
		}
		if ( w.rng() < 0.3 ) {
			this.up = ! this.up;
		}
	}

	act( dt ) {
		if ( dt <= 0 ) {
			return;
		}
		const w = this.world;
		this.buildAcc += dt * ( 0.5 + w.params.energy * 1.5 );
		while ( this.buildAcc >= this.buildEvery ) {
			this.buildAcc -= this.buildEvery;
			this.place();
		}
	}

	place() {
		const w = this.world;
		const g = this.grid;
		const chaos = w.params.chaos;
		// Ordered worlds lay brick against brick; chaotic ones skip,
		// float and tilt. The dial becomes architecture.
		const steps = this.up
			? [
					[ 0, 1, 0 ],
					[ 1, 0, 0 ],
					[ -1, 0, 0 ],
					[ 0, 0, 1 ],
					[ 0, 0, -1 ],
			  ]
			: [
					[ 1, 0, 0 ],
					[ 0, 0, 1 ],
					[ -1, 0, 0 ],
					[ 0, 0, -1 ],
					[ 0, 1, 0 ],
			  ];
		const pick =
			w.rng() < 0.55
				? 0
				: 1 + Math.floor( w.rng() * ( steps.length - 1 ) );
		const st = steps[ pick ];
		const jump = w.rng() < chaos * 0.25 ? 2 + Math.floor( w.rng() * 3 ) : 1;
		this.cell = [
			this.cell[ 0 ] + st[ 0 ] * jump,
			this.cell[ 1 ] + st[ 1 ] * jump,
			this.cell[ 2 ] + st[ 2 ] * jump,
		];
		const lim = Math.round( ( BOUNDS * 0.75 ) / g );
		for ( let i = 0; i < 3; i++ ) {
			if ( Math.abs( this.cell[ i ] ) > lim ) {
				this.cell = this.randomCell();
				break;
			}
		}
		const p = [
			this.cell[ 0 ] * g,
			this.cell[ 1 ] * g,
			this.cell[ 2 ] * g,
		];
		this.pos = p.slice(); // forces read the site, not a ghost
		const mw = Math.max(
			0.5,
			g * 0.24 * this.widthJitter * w.stroke.width
		);
		const shape = this.markShape || ( w.rng() < 0.18 ? 'frame' : 'cube' );
		// Aligned to the lattice while order rules; chaos lets it tilt.
		const dir =
			w.rng() < chaos * 0.6
				? [ w.rng() - 0.5, w.rng() - 0.5, w.rng() - 0.5 ]
				: null;
		emitShape( w, shape, p, dir, shapeScale( shape, mw ), this.colorBias );
	}

	steer() {}

	emitMark() {
		// The mason builds in act(); the distance trigger stays silent.
	}
}

/* ------------------------------- hive builder ------------------------------ */

/** Grows honeycomb, cell against cell, in its own tilted plane. */
export class HiveBuilder extends Actor {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.plane = randomPlane( world.rng );
		this.origin = world.spawnAt ? world.spawnAt() : [ 0, 0, 0 ];
		this.cellR = ( temperament.cellR || 4.2 ) * ( world.scaleMul || 1 );
		this.frontier = [ [ 0, 0 ] ];
		this.taken = new Set( [ '0,0' ] );
		this.buildAcc = 0;
		this.colorBias = ( world.rng() - 0.5 ) * 0.5;
		this.pos = this.origin.slice();
	}

	decide() {
		const w = this.world;
		// A comb can only grow so far before the bees swarm off and
		// found a new one somewhere else.
		if ( this.taken.size > 240 || w.rng() < 0.12 ) {
			this.plane = randomPlane( w.rng );
			this.origin = w.spawnAt ? w.spawnAt() : this.origin;
			this.frontier = [ [ 0, 0 ] ];
			this.taken = new Set( [ '0,0' ] );
		}
	}

	act( dt ) {
		if ( dt <= 0 || ! this.frontier.length ) {
			return;
		}
		const w = this.world;
		this.buildAcc += dt * ( 1 + w.params.energy * 5 );
		while ( this.buildAcc >= 1 && this.frontier.length ) {
			this.buildAcc -= 1;
			const at = Math.floor( w.rng() * this.frontier.length );
			const [ q, r ] = this.frontier[ at ];
			const NEIGH = [
				[ 1, 0 ],
				[ -1, 0 ],
				[ 0, 1 ],
				[ 0, -1 ],
				[ 1, -1 ],
				[ -1, 1 ],
			];
			const open = NEIGH.filter(
				( [ dq, dr ] ) => ! this.taken.has( `${ q + dq },${ r + dr }` )
			);
			if ( ! open.length ) {
				this.frontier.splice( at, 1 );
				continue;
			}
			const [ dq, dr ] = open[ Math.floor( w.rng() * open.length ) ];
			const nq = q + dq;
			const nr = r + dr;
			this.taken.add( `${ nq },${ nr }` );
			this.frontier.push( [ nq, nr ] );
			// Axial hex to the comb's own plane.
			const x = this.cellR * 1.732 * ( nq + nr / 2 );
			const y = this.cellR * 1.5 * nr;
			const { u, v, n } = this.plane;
			const p = [
				this.origin[ 0 ] + u[ 0 ] * x + v[ 0 ] * y,
				this.origin[ 1 ] + u[ 1 ] * x + v[ 1 ] * y,
				this.origin[ 2 ] + u[ 2 ] * x + v[ 2 ] * y,
			];
			this.pos = p.slice();
			const mw = Math.max(
				0.4,
				this.cellR * 0.46 * w.stroke.width * ( 0.8 + w.rng() * 0.4 )
			);
			emitShape(
				w,
				'hex',
				p,
				n.slice(),
				shapeScale( 'hex', mw ),
				this.colorBias
			);
		}
	}
}

/* -------------------------------- clockworker ------------------------------ */

/** Epicycles: circles rolling on circles, drawn with discs and rings. */
export class Clockworker extends Actor {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.colorBias = ( world.rng() - 0.5 ) * 0.5;
		this.newFigure();
		this.trail = 0;
		this.last = null;
		this.pos = this.origin.slice();
	}

	newFigure() {
		const w = this.world;
		this.plane = randomPlane( w.rng );
		this.origin = w.spawnAt ? w.spawnAt() : [ 0, 0, 0 ];
		this.R1 = 8 + w.rng() * 26;
		this.R2 = 3 + w.rng() * 14;
		this.w1 = 0.4 + w.rng() * 1.2;
		// A near-rational ratio closes the figure; chaos detunes it so
		// the rose never quite meets itself.
		this.w2 =
			this.w1 * ( 2 + Math.floor( w.rng() * 5 ) ) +
			w.params.chaos * ( w.rng() - 0.5 ) * 0.8;
		this.t0 = w.time;
	}

	decide() {
		this.newFigure();
		this.last = null;
	}

	act( dt ) {
		if ( dt <= 0 ) {
			return;
		}
		const w = this.world;
		const t = ( w.time - this.t0 ) * ( 0.4 + w.params.energy );
		const a =
			this.R1 * Math.cos( this.w1 * t ) +
			this.R2 * Math.cos( this.w2 * t );
		const b =
			this.R1 * Math.sin( this.w1 * t ) +
			this.R2 * Math.sin( this.w2 * t );
		const { u, v, n } = this.plane;
		const p = [
			this.origin[ 0 ] + u[ 0 ] * a + v[ 0 ] * b,
			this.origin[ 1 ] + u[ 1 ] * a + v[ 1 ] * b,
			this.origin[ 2 ] + u[ 2 ] * a + v[ 2 ] * b,
		];
		this.pos = p.slice();
		if ( this.last ) {
			this.trail += Math.hypot(
				p[ 0 ] - this.last[ 0 ],
				p[ 1 ] - this.last[ 1 ],
				p[ 2 ] - this.last[ 2 ]
			);
		}
		if ( ! this.last || this.trail >= 2.6 ) {
			this.trail = 0;
			this.last = p.slice();
			const mw = Math.max(
				0.15,
				w.stroke.width * ( 0.5 + w.rng() * 0.5 )
			);
			const shape = w.rng() < 0.2 ? 'ring' : 'disc';
			emitShape(
				w,
				shape,
				p,
				n.slice(),
				shapeScale( shape, mw ),
				this.colorBias
			);
		}
	}
}

/* ------------------------------- constellator ------------------------------ */

/** Sets stars and joins them with dead-straight rods. Blueprint air. */
export class Constellator extends Actor {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.colorBias = ( world.rng() - 0.5 ) * 0.5;
		this.node = null;
		this.hops = 0;
		this.pos = [ 0, 0, 0 ];
	}

	decide() {
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		if ( ! this.node || this.hops > 6 + w.rng() * 10 ) {
			// A new cluster, unconnected - constellations are islands.
			this.node = w.spawnAt ? w.spawnAt() : [ r() * 40, r() * 40, 0 ];
			this.hops = 0;
			this.star( this.node );
			return;
		}
		const reach = 9 + w.rng() * 22;
		const d = unit( [ r(), r(), r() ] );
		const next = [
			this.node[ 0 ] + d[ 0 ] * reach,
			this.node[ 1 ] + d[ 1 ] * reach,
			this.node[ 2 ] + d[ 2 ] * reach,
		];
		const mid = [
			( this.node[ 0 ] + next[ 0 ] ) / 2,
			( this.node[ 1 ] + next[ 1 ] ) / 2,
			( this.node[ 2 ] + next[ 2 ] ) / 2,
		];
		const w0 = Math.max( 0.1, this.world.stroke.width * 0.35 );
		emitShape(
			this.world,
			'rod',
			mid,
			d,
			[ w0 * 0.8, reach / 2, w0 * 0.8 ],
			this.colorBias
		);
		this.star( next );
		this.node = next;
		this.pos = next.slice();
		this.hops++;
	}

	star( p ) {
		const w = this.world;
		const mw = Math.max( 0.25, w.stroke.width * ( 0.8 + w.rng() * 0.8 ) );
		emitShape(
			w,
			'dot',
			p.slice(),
			null,
			shapeScale( 'dot', mw ),
			this.colorBias
		);
	}
}

/* --------------------------------- metronome ------------------------------- */

/** Stamps the same form to a beat, each stamp a small progression. */
export class Metronome extends Actor {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.colorBias = ( world.rng() - 0.5 ) * 0.5;
		this.markShape = temperament.markShape || null;
		this.newRun();
		this.beatAcc = 0;
		this.pos = this.at.slice();
	}

	newRun() {
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		this.at = w.spawnAt ? w.spawnAt() : [ r() * 40, r() * 40, 0 ];
		this.step = unit( [ r(), r(), r() ] );
		this.stepLen = 3.5 + w.rng() * 4;
		this.left = 8 + Math.floor( w.rng() * 14 );
		this.grow = 0.92 + w.rng() * 0.18;
		this.size = 1.2 + w.rng() * 2.2;
		const forms = [ 'ring', 'disc', 'frame', 'cone', 'cube' ];
		this.form =
			this.markShape ||
			forms[ Math.floor( w.rng() * forms.length ) % forms.length ];
		this.beatEvery = 0.16 + w.rng() * 0.18;
	}

	decide() {
		this.newRun();
	}

	act( dt ) {
		if ( dt <= 0 || this.left <= 0 ) {
			return;
		}
		const w = this.world;
		// World time is already tempo-warped; the beat rides it as is.
		this.beatAcc += dt;
		while ( this.beatAcc >= this.beatEvery && this.left > 0 ) {
			this.beatAcc -= this.beatEvery;
			this.left--;
			this.size *= this.grow;
			this.at = [
				this.at[ 0 ] + this.step[ 0 ] * this.stepLen,
				this.at[ 1 ] + this.step[ 1 ] * this.stepLen,
				this.at[ 2 ] + this.step[ 2 ] * this.stepLen,
			];
			this.pos = this.at.slice();
			const mw = Math.max( 0.2, this.size * w.stroke.width * 0.8 );
			emitShape(
				w,
				this.form,
				this.at.slice(),
				this.step.slice(),
				shapeScale( this.form, mw ),
				this.colorBias
			);
		}
	}
}
