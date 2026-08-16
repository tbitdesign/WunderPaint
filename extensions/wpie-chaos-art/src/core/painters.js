/**
 * The painters: the actors that make GESTURES.
 *
 * The old core emitted marks continuously and uniformly along smooth
 * trajectories - and every piece came out woven from the same fabric,
 * however many parameters were shuffled above it. This core paints the
 * way a hand paints: it PLANS a stroke (from the piece's own motifs or
 * freely), COMMITS to it - a planar gesture with an attack, a swing, a
 * width that swells and tapers - then LIFTS THE BRUSH, travels without
 * painting, and sets down again. Some gestures are huge: the backbone
 * of a composition, laid in one decisive movement.
 */

import { Actor, BOUNDS } from './actors.js';
import { flow } from './rng.js';
import { pickColor } from './palette.js';
import { drawMotif, gesturePoint, gestureSpan, widthAt } from './gestures.js';

const clampLen = ( v, max ) => {
	const l = Math.hypot( v[ 0 ], v[ 1 ], v[ 2 ] );
	if ( l > max && l > 0 ) {
		const k = max / l;
		v[ 0 ] *= k;
		v[ 1 ] *= k;
		v[ 2 ] *= k;
	}
	return v;
};

/** Reasonable instance scale for a mark shape at stroke width w. */
export function shapeScale( shape, w ) {
	switch ( shape ) {
		case 'ring':
			return [ w * 2.4, w * 2.4, w * 2.4 ];
		case 'frame':
			return [ w * 2.2, w * 2.2, w * 2.2 ];
		case 'disc':
			return [ w * 2.2, w * 0.6, w * 2.2 ];
		case 'hex':
			return [ w * 2, w * 0.7, w * 2 ];
		case 'cube':
			return [ w * 1.8, w * 1.8, w * 1.8 ];
		case 'rod':
			return [ w * 0.8, w * 2.6, w * 0.8 ];
		case 'cone':
			return [ w * 1.6, w * 2.2, w * 1.6 ];
		case 'dot':
			return [ w * 1.2, w * 1.2, w * 1.2 ];
		default:
			return [ w, w, w ];
	}
}

export class Painter extends Actor {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		const r = () => world.rng() * 2 - 1;
		this.pos = world.spawnAt ? world.spawnAt() : [ 0, 0, 0 ];
		this.vel = [ r(), r(), r() ];
		this.segLen = temperament.segLen || 2.2;
		this.widthJitter =
			( 0.6 + world.rng() * 0.9 ) * ( temperament.sizeMul || 1 );
		// A school can hand any painter a different mark: the same ink
		// path laid in discs is impressionism, in frames it is cubism.
		this.markShape = temperament.markShape || null;
		// The social sense: +1 seeks painted ground (accumulation), -1
		// flees into emptiness (space-filling, negative space).
		const soc = world.rng() * 2 - 1;
		this.social = Math.sign( soc ) * Math.pow( Math.abs( soc ), 1.5 );
		this.colorBias = ( world.rng() - 0.5 ) * 0.5;
		this.speed = temperament.speed || 14;
		this.store = temperament.store || 'solid';
		// The gesture life: resting/traveling, or committed to a stroke.
		this.kinds = temperament.kinds || null;
		this.motifLove = 0.35 + world.rng() * 0.45;
		this.performing = null;
		this.restT = world.rng() * 1.5;
		this.alive = true;
	}

	/** Style-specific steering while TRAVELING (brush lifted). */
	// eslint-disable-next-line no-unused-vars
	steer( dt ) {}

	decide() {
		const w = this.world;
		// A committed gesture is never abandoned mid-swing.
		if ( this.performing ) {
			return;
		}
		if ( w.rng() < 0.06 + 0.1 * w.params.chaos ) {
			this.pos = w.spawnAt ? w.spawnAt() : this.pos;
			return;
		}
		const turn = ( 0.4 + w.params.chaos ) * this.verve * 20;
		this.vel[ 0 ] += ( w.rng() - 0.5 ) * turn;
		this.vel[ 1 ] += ( w.rng() - 0.5 ) * turn;
		this.vel[ 2 ] += ( w.rng() - 0.5 ) * turn;
	}

	act( dt ) {
		if ( dt <= 0 ) {
			return;
		}
		if ( this.performing ) {
			this.perform( dt );
			return;
		}
		this.travelStep( dt );
		this.restT -= dt;
		if ( this.restT <= 0 ) {
			this.plan();
		}
	}

	/** Brush lifted: move, sense, do not paint. */
	travelStep( dt ) {
		const w = this.world;
		this.steer( dt );
		if ( this.social && w.densityGrad ) {
			const g = w.densityGrad( this.pos );
			const ks = this.social * this.speed * dt * 2.4;
			this.vel[ 0 ] += g[ 0 ] * ks;
			this.vel[ 1 ] += g[ 1 ] * ks;
			this.vel[ 2 ] += g[ 2 ] * ks;
		}
		if ( w.domainForce ) {
			const df = w.domainForce( this.pos );
			const k = 4 * dt * this.speed;
			this.vel[ 0 ] += df[ 0 ] * k;
			this.vel[ 1 ] += df[ 1 ] * k;
			this.vel[ 2 ] += df[ 2 ] * k;
		}
		const d = Math.hypot( ...this.pos );
		if ( d > BOUNDS ) {
			const k = ( ( d - BOUNDS ) / BOUNDS ) * 30 * dt;
			this.vel[ 0 ] -= ( this.pos[ 0 ] / d ) * k * this.speed;
			this.vel[ 1 ] -= ( this.pos[ 1 ] / d ) * k * this.speed;
			this.vel[ 2 ] -= ( this.pos[ 2 ] / d ) * k * this.speed;
		}
		clampLen( this.vel, this.speed * ( 0.4 + w.params.energy * 1.6 ) );
		const step = Math.min( dt, 0.1 );
		this.pos[ 0 ] += this.vel[ 0 ] * step;
		this.pos[ 1 ] += this.vel[ 1 ] * step;
		this.pos[ 2 ] += this.vel[ 2 ] * step;
	}

	/**
	 * Commit to a stroke: pick the piece's motif (or improvise), choose
	 * a size - now and then a HUGE one, the backbone of the picture -
	 * span a drawing plane from the direction of travel, and go.
	 */
	plan() {
		const w = this.world;
		// CALL AND RESPONSE: sometimes the painter steps to where the
		// last stroke ended and answers it - continuing its direction,
		// or contradicting it. Only ONE may answer each call, so the
		// answers form chains through the composition, not stars.
		if (
			! this.quiet &&
			w.echo &&
			w.time - w.echo.t < 6 &&
			w.rng() < 0.3
		) {
			this.pos = [
				w.echo.p[ 0 ] + ( w.rng() - 0.5 ) * 2,
				w.echo.p[ 1 ] + ( w.rng() - 0.5 ) * 2,
				w.echo.p[ 2 ] + ( w.rng() - 0.5 ) * 2,
			];
			const flip = w.rng() < 0.5 ? 1 : -1;
			this.vel = [
				w.echo.u[ 0 ] * flip * this.speed,
				w.echo.u[ 1 ] * flip * this.speed,
				w.echo.u[ 2 ] * flip * this.speed,
			];
			w.echo = null;
		}
		// Imitate the piece's RECENT strokes with mutation, or improvise.
		// The fashion is not handed down at the start - it emerges from
		// what was actually painted, and the early strokes shape all the
		// later ones. Now and then a mutation even changes the KIND.
		let motif = null;
		const base = w.pickMeme && w.pickMeme( this.kinds );
		if ( base && w.rng() < this.motifLove ) {
			motif = {
				...base,
				curl: base.curl * ( 0.7 + w.rng() * 0.6 ),
				elong: base.elong * ( 0.7 + w.rng() * 0.6 ),
				jag: Math.max(
					0,
					Math.min( 1, base.jag + ( w.rng() - 0.5 ) * 0.35 )
				),
				phi: base.phi + ( w.rng() - 0.5 ) * 1.2,
			};
			if ( w.rng() < 0.1 ) {
				motif.kind = drawMotif( w.rng, this.kinds || undefined ).kind;
			}
		} else {
			motif = drawMotif( w.rng, this.kinds || undefined );
		}
		let scale = 5 + Math.pow( w.rng(), 2 ) * 24;
		if ( w.rng() < 0.07 ) {
			scale = 45 + w.rng() * 60;
		}
		scale *= 0.75 + ( w.scaleMul || 1 ) * 0.25;
		// Scale means EXTENT: normalize by the motif's own elongation,
		// and never reach further than the stage has room - a backbone
		// stroke planned at the rim stays a stroke, not an exit.
		scale = Math.min( 92, scale ) / Math.max( 1, motif.elong );
		// A gesture spans up to ~2.4 units of DIAMETER in its own frame;
		// the room bound must divide by that, not by the radius.
		const room = BOUNDS * 1.7 - Math.hypot( ...this.pos );
		scale = Math.max( 3, Math.min( scale, room * 0.4 ) );
		// The drawing plane: writing direction from travel, side axis
		// perpendicular-ish, both unit.
		const vl = Math.hypot( ...this.vel ) || 1;
		const u = [
			this.vel[ 0 ] / vl,
			this.vel[ 1 ] / vl,
			this.vel[ 2 ] / vl,
		];
		const rv = [ w.rng() * 2 - 1, w.rng() * 2 - 1, w.rng() * 2 - 1 ];
		let v = [
			u[ 1 ] * rv[ 2 ] - u[ 2 ] * rv[ 1 ],
			u[ 2 ] * rv[ 0 ] - u[ 0 ] * rv[ 2 ],
			u[ 0 ] * rv[ 1 ] - u[ 1 ] * rv[ 0 ],
		];
		const vvl = Math.hypot( ...v ) || 1;
		v = [ v[ 0 ] / vvl, v[ 1 ] / vvl, v[ 2 ] / vvl ];
		const span = gestureSpan( motif ) * scale;
		const dur = Math.max(
			0.3,
			Math.min(
				3.6,
				span / ( this.speed * ( 1.2 + w.params.energy * 2 ) )
			)
		);
		const n = Math.max(
			4,
			Math.min( 80, Math.round( span / this.segLen ) )
		);
		// Anchor so the gesture STARTS at the brush.
		const p0 = gesturePoint( motif, 0 );
		const o = [
			this.pos[ 0 ] - ( u[ 0 ] * p0[ 0 ] + v[ 0 ] * p0[ 1 ] ) * scale,
			this.pos[ 1 ] - ( u[ 1 ] * p0[ 0 ] + v[ 1 ] * p0[ 1 ] ) * scale,
			this.pos[ 2 ] - ( u[ 2 ] * p0[ 0 ] + v[ 2 ] * p0[ 1 ] ) * scale,
		];
		this.performing = {
			motif,
			scale,
			o,
			u,
			v,
			n,
			i: 0,
			t: 0,
			dur,
			prev: this.pos.slice(),
			baseW:
				this.world.stroke.width *
				this.widthJitter *
				( 0.7 + w.rng() * 0.6 ),
		};
		if ( 'volley' === motif.kind ) {
			this.performing.n = 5 + Math.floor( w.rng() * 12 );
			this.performing.dur = 0.25 + w.rng() * 0.5;
		}
	}

	worldPoint( g, t ) {
		const p = gesturePoint( g.motif, t );
		return [
			g.o[ 0 ] + ( g.u[ 0 ] * p[ 0 ] + g.v[ 0 ] * p[ 1 ] ) * g.scale,
			g.o[ 1 ] + ( g.u[ 1 ] * p[ 0 ] + g.v[ 1 ] * p[ 1 ] ) * g.scale,
			g.o[ 2 ] + ( g.u[ 2 ] * p[ 0 ] + g.v[ 2 ] * p[ 1 ] ) * g.scale,
		];
	}

	/** The committed swing: walk the path, width breathing along it. */
	perform( dt ) {
		const w = this.world;
		const g = this.performing;
		g.t += dt / g.dur;
		if ( 'volley' === g.motif.kind ) {
			// A scatter of decisive dots around the anchor.
			const j = Math.min( g.n, Math.floor( g.t * g.n ) );
			while ( g.i < j ) {
				g.i++;
				const rr = () => w.rng() * 2 - 1;
				const p = [
					g.o[ 0 ] + rr() * g.scale * 0.45,
					g.o[ 1 ] + rr() * g.scale * 0.45,
					g.o[ 2 ] + rr() * g.scale * 0.45,
				];
				this.putMark( p, p, g.baseW * ( 0.5 + w.rng() ) );
			}
		} else {
			const j = Math.min( g.n, Math.floor( g.t * g.n ) );
			while ( g.i < j ) {
				g.i++;
				const t = g.i / g.n;
				const pt = this.worldPoint( g, t );
				this.putMark( g.prev, pt, g.baseW * widthAt( g.motif, t ) );
				g.prev = pt;
			}
		}
		if ( g.t >= 1 ) {
			// Release: the brush lifts where the gesture ended, and the
			// stroke it just made joins the piece's living fashion. Its
			// endpoint stands in the room as a call someone may answer.
			if ( w.postMeme && ! this.quiet ) {
				w.postMeme( g.motif );
				w.echo = {
					p: g.prev.slice(),
					u: g.u.slice(),
					t: w.time,
				};
			}
			this.pos = g.prev.slice();
			this.performing = null;
			// The rest between strokes IS the rhythm: chaotic worlds
			// throw flurries, calm ones let a stroke stand alone.
			const chaos = w.params.chaos;
			this.restT =
				w.rng() < 0.2 + chaos * 0.3
					? 0.1 + w.rng() * 0.4
					: 0.5 + w.rng() * ( 3.5 - chaos * 2 );
		}
	}

	/**
	 * Lay one mark of the gesture from a to b at width mw. Subclasses
	 * override this to speak their own material (rings, puffs, shards).
	 */
	putMark( a, b, mw ) {
		const w = this.world;
		const accent = w.time < w.accentUntil && w.rng() < 0.25;
		const width = Math.max( 0.06, mw );
		if ( this.markShape ) {
			const dir = [ b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ], b[ 2 ] - a[ 2 ] ];
			w.emitted.push( {
				type: 'shape',
				shape: this.markShape,
				p: b.slice(),
				dir,
				s: shapeScale( this.markShape, Math.max( 0.08, width ) ),
				color: pickColor(
					w.params.colors,
					w.rng,
					w.heat,
					this.colorBias,
					accent
				),
				glow: w.stroke.glow,
			} );
		} else {
			w.emitted.push( {
				type: 'seg',
				a: a.slice(),
				b: b.slice(),
				w: width,
				color: pickColor(
					w.params.colors,
					w.rng,
					w.heat,
					this.colorBias,
					accent
				),
				glow: w.stroke.glow,
				store: this.store,
			} );
		}
		w.segments++;
		w.note( b );
	}
}

/* --------------------------------- ink ------------------------------------ */

/** Rides a turbulent flow between strokes; full gesture vocabulary. */
export class InkPainter extends Painter {
	steer( dt ) {
		const w = this.world;
		const f = flow( this.pos, w.time, 0.016 + 0.02 * w.params.chaos );
		const force = w.forceAt( this.pos );
		const k = this.speed * ( 1.5 + w.params.energy * 2 ) * dt;
		this.vel[ 0 ] += f[ 0 ] * k + force[ 0 ] * dt;
		this.vel[ 1 ] += f[ 1 ] * k + force[ 1 ] * dt;
		this.vel[ 2 ] += f[ 2 ] * k + force[ 2 ] * dt;
		const damp = Math.max( 0, 1 - dt * 0.8 );
		this.vel[ 0 ] *= damp;
		this.vel[ 1 ] *= damp;
		this.vel[ 2 ] *= damp;
	}
}

/* --------------------------------- neon ----------------------------------- */

/** Chases drifting activity centers; draws curved, glowing gestures. */
export class NeonPainter extends Painter {
	constructor( world, temperament = {} ) {
		super( world, {
			kinds: [ 'scurve', 'spiral', 'arc', 'hook', 'loop' ],
			...temperament,
		} );
		this.store = 'glow';
		if ( ! world.style.centers ) {
			const r = () => world.rng() * 2 - 1;
			world.style.centers = [];
			for ( let i = 0; i < 5; i++ ) {
				world.style.centers.push( [
					r() * BOUNDS * 0.6,
					r() * BOUNDS * 0.6,
					r() * BOUNDS * 0.6,
				] );
			}
		}
		this.target = Math.floor( world.rng() * world.style.centers.length );
	}

	decide() {
		const w = this.world;
		const centers = w.style.centers;
		this.target = Math.floor( w.rng() * centers.length );
		const c = centers[ Math.floor( w.rng() * centers.length ) ];
		const push = ( 6 + 18 * w.params.chaos ) * this.verve;
		for ( let i = 0; i < 3; i++ ) {
			c[ i ] = Math.max(
				-BOUNDS,
				Math.min( BOUNDS, c[ i ] + ( w.rng() - 0.5 ) * push )
			);
		}
		super.decide();
	}

	steer( dt ) {
		const w = this.world;
		const c = w.style.centers[ this.target ] || [ 0, 0, 0 ];
		const dx = c[ 0 ] - this.pos[ 0 ];
		const dy = c[ 1 ] - this.pos[ 1 ];
		const dz = c[ 2 ] - this.pos[ 2 ];
		const d = Math.hypot( dx, dy, dz ) || 1;
		const pull = this.speed * ( 1 + w.params.energy ) * dt * 2;
		this.vel[ 0 ] += ( dx / d ) * pull + ( dy / d ) * pull * 0.7;
		this.vel[ 1 ] += ( dy / d ) * pull + ( dz / d ) * pull * 0.7;
		this.vel[ 2 ] += ( dz / d ) * pull + ( dx / d ) * pull * 0.7;
		const force = w.forceAt( this.pos );
		this.vel[ 0 ] += force[ 0 ] * dt;
		this.vel[ 1 ] += force[ 1 ] * dt;
		this.vel[ 2 ] += force[ 2 ] * dt;
	}
}

/* ---------------------------------- oil ----------------------------------- */

/** Breathes clouds: blob contours and volleys, spoken in puffs. */
export class OilPainter extends Painter {
	constructor( world, temperament = {} ) {
		super( world, {
			kinds: [ 'blob', 'volley', 'arc' ],
			...temperament,
			speed: temperament.speed || 5,
		} );
	}

	steer( dt ) {
		const w = this.world;
		const f = flow( this.pos, w.time * 0.5, 0.008 );
		const k = this.speed * dt * 2;
		const force = w.forceAt( this.pos );
		this.vel[ 0 ] += f[ 0 ] * k + force[ 0 ] * dt * 0.5;
		this.vel[ 1 ] +=
			f[ 1 ] * k + 0.6 * dt * this.speed + force[ 1 ] * dt * 0.5;
		this.vel[ 2 ] += f[ 2 ] * k + force[ 2 ] * dt * 0.5;
		const damp = Math.max( 0, 1 - dt * 1.4 );
		this.vel[ 0 ] *= damp;
		this.vel[ 1 ] *= damp;
		this.vel[ 2 ] *= damp;
	}

	putMark( a, b, mw ) {
		const w = this.world;
		const accent = w.time < w.accentUntil && w.rng() < 0.25;
		w.emitted.push( {
			type: 'puff',
			p: b.slice(),
			r: Math.max( 0.6, mw * 2.8 + w.rng() * 2 ),
			color: pickColor(
				w.params.colors,
				w.rng,
				w.heat,
				this.colorBias,
				accent
			),
			alpha: 0.1 + w.rng() * 0.16,
		} );
		w.segments++;
		w.note( b );
	}
}

/* --------------------------------- coral ---------------------------------- */

/**
 * Space colonization: branches grow toward scattered attractor points,
 * eat them, split, and when the food is gone the world quietly scatters
 * more - the garden never finishes. Already a figure of its own; it
 * does not perform gestures.
 */
export class CoralPainter extends Painter {
	constructor( world, temperament = {} ) {
		super( world, temperament );
		this.attractors = [];
		this.tips = [];
		this.growAcc = 0;
		this.sprinkle( 500 );
		this.root();
	}

	sprinkle( n ) {
		const w = this.world;
		for ( let i = 0; i < n; i++ ) {
			this.attractors.push(
				w.spawnAt
					? w.spawnAt()
					: [ w.rng() * 40, w.rng() * 40, w.rng() * 40 ]
			);
		}
	}

	root() {
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		const at = w.spawnAt ? w.spawnAt() : [ 0, -BOUNDS * 0.35, 0 ];
		const d = [ r(), r(), r() ];
		const l = Math.hypot( ...d ) || 1;
		this.tips.push( {
			pos: at,
			dir: [ d[ 0 ] / l, d[ 1 ] / l, d[ 2 ] / l ],
			depth: 0,
		} );
	}

	decide() {
		const w = this.world;
		if ( ! this.tips.length ) {
			this.root();
		}
		if ( this.attractors.length < 60 ) {
			this.sprinkle( 260 );
			if ( w.rng() < 0.5 ) {
				this.root();
			}
		}
	}

	act( dt ) {
		if ( dt <= 0 ) {
			return;
		}
		const w = this.world;
		this.growAcc += dt * ( 3 + 9 * w.params.energy );
		let steps = Math.min( 4, Math.floor( this.growAcc ) );
		this.growAcc -= steps;
		const influence = 34;
		const kill = 7;
		const stepLen = 3.2;
		while ( steps-- > 0 && this.tips.length ) {
			const nextTips = [];
			for ( const tip of this.tips ) {
				let ax = 0;
				let ay = 0;
				let az = 0;
				let n = 0;
				for ( let i = this.attractors.length - 1; i >= 0; i-- ) {
					const p = this.attractors[ i ];
					const dx = p[ 0 ] - tip.pos[ 0 ];
					const dy = p[ 1 ] - tip.pos[ 1 ];
					const dz = p[ 2 ] - tip.pos[ 2 ];
					const d = Math.hypot( dx, dy, dz );
					if ( d < kill ) {
						this.attractors.splice( i, 1 );
						continue;
					}
					if ( d < influence ) {
						ax += dx / d;
						ay += dy / d;
						az += dz / d;
						n++;
					}
				}
				if ( ! n ) {
					continue; // starved tip: it simply stops
				}
				const j = 0.3 + w.params.chaos * 0.9;
				ax += ( w.rng() - 0.5 ) * j + tip.dir[ 0 ] * 0.6;
				ay += ( w.rng() - 0.5 ) * j + tip.dir[ 1 ] * 0.6;
				az += ( w.rng() - 0.5 ) * j + tip.dir[ 2 ] * 0.6;
				const force = w.forceAt( tip.pos );
				ax += force[ 0 ] * 0.004;
				ay += force[ 1 ] * 0.004;
				az += force[ 2 ] * 0.004;
				const l = Math.hypot( ax, ay, az ) || 1;
				const dir = [ ax / l, ay / l, az / l ];
				const to = [
					tip.pos[ 0 ] + dir[ 0 ] * stepLen,
					tip.pos[ 1 ] + dir[ 1 ] * stepLen,
					tip.pos[ 2 ] + dir[ 2 ] * stepLen,
				];
				const accent = w.time < w.accentUntil && w.rng() < 0.2;
				w.emitted.push( {
					type: 'seg',
					a: tip.pos.slice(),
					b: to,
					w: Math.max(
						0.12,
						w.stroke.width *
							2.4 *
							Math.pow( 0.94, tip.depth ) *
							this.widthJitter
					),
					color: pickColor(
						w.params.colors,
						w.rng,
						Math.min( 1, tip.depth / 26 ),
						this.colorBias,
						accent
					),
					glow: w.stroke.glow,
					store: this.store,
				} );
				w.segments++;
				w.note( to );
				nextTips.push( { pos: to, dir, depth: tip.depth + 1 } );
				if (
					nextTips.length + this.tips.length < 60 &&
					w.rng() < 0.16 + 0.22 * w.params.chaos
				) {
					nextTips.push( {
						pos: to.slice(),
						dir: dir.slice(),
						depth: tip.depth + 1,
					} );
				}
			}
			this.tips = nextTips.slice( 0, 60 );
		}
	}
}

/* --------------------------------- shard ---------------------------------- */

/**
 * Crystal: slashes, zigzags and hooks only, plus FRACTURE - when an
 * impulse strikes while it travels, the line bursts into a scatter of
 * small shards. The disruptor has the lead role in this casting.
 */
export class ShardPainter extends Painter {
	constructor( world, temperament = {} ) {
		super( world, {
			kinds: [ 'slash', 'zigzag', 'hook' ],
			...temperament,
		} );
		this.store = 'shard';
		this.burstCool = 0;
	}

	steer( dt ) {
		const w = this.world;
		const f = w.forceAt( this.pos );
		const mag = Math.hypot( f[ 0 ], f[ 1 ], f[ 2 ] );
		this.burstCool -= dt;
		if ( mag > 60 && this.burstCool <= 0 ) {
			this.burstCool = 1.2;
			this.burst();
		}
		// Crystals travel straight and fast between breaks.
		const damp = Math.max( 0, 1 - dt * 0.2 );
		this.vel[ 0 ] = this.vel[ 0 ] * damp + f[ 0 ] * dt * 0.4;
		this.vel[ 1 ] = this.vel[ 1 ] * damp + f[ 1 ] * dt * 0.4;
		this.vel[ 2 ] = this.vel[ 2 ] * damp + f[ 2 ] * dt * 0.4;
	}

	/** Fracture: a scatter of small shards around the traveler. */
	burst() {
		const w = this.world;
		const n = 5 + Math.floor( w.rng() * 5 );
		for ( let i = 0; i < n; i++ ) {
			const r = () => ( w.rng() - 0.5 ) * 2;
			const d = [ r(), r(), r() ];
			const dl = Math.hypot( d[ 0 ], d[ 1 ], d[ 2 ] ) || 1;
			const len = 1 + w.rng() * 4;
			const a = this.pos.slice();
			const b = [
				a[ 0 ] + ( d[ 0 ] / dl ) * len,
				a[ 1 ] + ( d[ 1 ] / dl ) * len,
				a[ 2 ] + ( d[ 2 ] / dl ) * len,
			];
			w.emitted.push( {
				type: 'seg',
				a,
				b,
				w: Math.max( 0.1, w.stroke.width * ( 0.3 + w.rng() * 0.8 ) ),
				color: pickColor(
					w.params.colors,
					w.rng,
					w.heat,
					this.colorBias,
					w.rng() < 0.3
				),
				glow: w.stroke.glow,
				store: 'shard',
			} );
			w.segments++;
			w.note( b );
		}
	}
}
