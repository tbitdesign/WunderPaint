/**
 * A flat session: a world, its cast and its stage, run in step.
 *
 * Shared by the browser engine (one step per frame) and the node proof
 * sheets (fast-forward without a display). The session drains the
 * world's commands into the stage, lets the stage draw at the world's
 * warped time, refreshes the senses now and then, reads the phase and
 * carries out the restless one's stage directions.
 */

import { FlatWorld, groundSpec } from './world.js';
import { FlatStage } from './stage.js';
import { makeCast, hireOne, CHARACTERS } from './casting.js';
import { makeRng } from '../core/rng.js';
import { needs as readNeeds } from './composition.js';
import { traceEdges, posterPixels, textBasePixels } from './motif.js';
import { familyOf } from './signature.js';
import { treatPiece } from './pieces.js';

// The finishes a family allows; a piece draws at most one of them.
const FAMILY_FINISHES = {
	painterly: [ 'gloss', 'craquelure', 'dust' ],
	graphic: [ 'dust', 'deckle' ],
	geometric: [ 'dust' ],
};

const SENSE_EVERY = 0.35; // world seconds
const SENSE_MARKS = 5;

export class FlatSession {
	/**
	 * @param {Object} o
	 * @param {Function} o.createCanvas
	 * @param {number}   o.aspect
	 * @param {number}   o.height       Working surface height in px.
	 * @param {Object}   o.school
	 * @param {Object}   o.params       Live dials { chaos, energy, density, tempo, colors, auto* }.
	 * @param {Uint32Array} o.words     Entropy pool words.
	 * @param {string[]} [o.colors]     Fixed colors (else the school draws its own).
	 */
	constructor( o ) {
		this.rng = makeRng( o.words );
		this.school = o.school;
		this.world = new FlatWorld( {
			rng: this.rng,
			params: o.params,
			aspect: o.aspect,
			school: o.school,
			colors: o.colors,
			recent: o.recent || null,
			motif: o.motif || null,
			pigment: ( o.kit && o.kit.pigment ) || null,
			mixed: !! o.mixed,
			ensemble: o.ensemble || [],
		} );
		this.world.motifImage = ( o.motif && o.motif.image ) || null;
		// Pieces are treated on demand and cached per piece and effect.
		const treated = new Map();
		this.world.treat = ( piece, treatment ) => {
			const key = this.world.pieces.indexOf( piece ) + '|' + treatment;
			let c = treated.get( key );
			if ( ! c ) {
				c = treatPiece(
					o.createCanvas,
					piece,
					treatment,
					o.effects || null,
					this.world.palette
				);
				treated.set( key, c );
			}
			return c;
		};
		this.stage = new FlatStage( {
			createCanvas: o.createCanvas,
			aspect: o.aspect,
			height: o.height || 1100,
			width: o.width,
			kit: o.kit || null,
		} );
		this.stage.lightAngle =
			o.school.light === undefined ? -2.2 : o.school.light;
		this.ground = groundSpec( this.world );
		this.world.groundColor = this.ground.color;
		const mo = o.motif;
		if ( mo && mo.maps && 'text' === mo.kind && 'fill' === mo.reading ) {
			// The word as a soft base in the palette's secondary color: it
			// reads before the first mark and through all of them.
			this.ground.posterPixels = textBasePixels(
				mo.maps,
				this.world.palette.secondary,
				0.4
			);
			this.ground.imageAlpha = 1;
		}
		if ( mo && mo.maps && 'poster' === mo.reading ) {
			// The planes of the picture as a soft poster under the marks.
			this.ground.posterPixels = posterPixels( mo.maps );
			this.ground.imageAlpha = 0.7;
		}
		this.stage.setGround( this.ground );
		if ( mo && mo.maps && 'text' === mo.kind ) {
			// The letters' outlines, faint, so the word stays a word under
			// whatever the school makes of it; full when outlining.
			const lines = traceEdges( mo.maps, {
				max: 120,
				minLen: 3,
				threshold: 0.25,
			} );
			if ( lines.length ) {
				this.stage.push(
					{
						type: 'sketch',
						lines,
						color: this.world.palette.dark,
						alpha: 'outline' === mo.reading ? 0.75 : 0.3,
						width: 'outline' === mo.reading ? 0.005 : 0.0025,
						wobble: 0.003,
						duration: 2.5,
						seed: Math.floor( this.rng() * 4294967295 ) >>> 0,
					},
					0
				);
				this.painted++;
			}
		}
		if ( mo && mo.maps && 'image' === mo.kind ) {
			const like = mo.likeness === undefined ? 0.6 : mo.likeness;
			// The underdrawing: a line drawing of the picture in the
			// palette's dark, before the first mark. Always with the
			// sketch reading; otherwise the likelier the more likeness.
			if (
				'sketch' === mo.reading ||
				( 'underpaint' !== mo.reading && this.rng() < like * 0.8 )
			) {
				const lines = traceEdges( mo.maps, {
					max: 'sketch' === mo.reading ? 90 : 50,
					minLen: 4,
				} );
				if ( lines.length ) {
					const dark = this.world.palette.dark;
					this.stage.push(
						{
							type: 'sketch',
							lines,
							color: dark,
							alpha:
								'sketch' === mo.reading
									? 0.7
									: 0.22 + like * 0.25,
							width: 'sketch' === mo.reading ? 0.0045 : 0.003,
							wobble: 0.004,
							duration: 3,
							seed: Math.floor( this.rng() * 4294967295 ) >>> 0,
						},
						0
					);
					this.painted++;
				}
			}
		}
		this.world.senses = this.stage.senses;
		this.world.needs = readNeeds( this.world.plan, this.world.senses );
		this.actors = makeCast( this.world, o.school, o.params.density );
		// The opener does not wait for a beat of the clock: the first
		// gesture lands with the first frame, the sheet is never dead.
		for ( const a of this.actors ) {
			if ( a.isPainter && 'opener' === a.role ) {
				a.decide();
			}
		}
		this.world.chronicle.push( {
			e: 'born',
			style: o.school.id,
			school: o.school.id,
			medium: 'flat',
		} );
		this.sinceSense = 0;
		this.marksSinceSense = 0;
		this.painted = 0;
	}

	/** The restless one's hires and retirements. */
	stageDirections() {
		const w = this.world;
		while ( w.casting.length ) {
			const d = w.casting.shift();
			const painters = this.actors.filter( ( a ) => a.isPainter );
			if ( 'hire' === d.type && painters.length < 24 ) {
				this.actors.push( hireOne( w ) );
			} else if ( 'retire' === d.type && painters.length > 1 ) {
				const idx = this.actors.indexOf(
					painters[ Math.floor( w.rng() * painters.length ) ]
				);
				if ( idx >= CHARACTERS ) {
					this.actors.splice( idx, 1 );
				}
			}
		}
	}

	/** Move commands from the world to the stage. */
	drain() {
		const w = this.world;
		for ( const c of w.emitted ) {
			const list = Array.isArray( c ) ? c : [ c ];
			list.forEach( ( cmd, i ) => {
				if ( Array.isArray( c ) ) {
					if ( cmd.seed === undefined ) {
						cmd.seed = Math.floor( w.rng() * 4294967295 ) >>> 0;
					}
					// A batch is laid one mark after the other within the
					// gesture's time, so a cluster of dabs still reads as a hand.
					cmd.duration = ( c.duration || 0.6 ) / list.length;
					cmd.delay = ( i * ( c.duration || 0.6 ) ) / list.length;
				}
			} );
			for ( const cmd of list ) {
				if ( this.stage.push( cmd, w.time + ( cmd.delay || 0 ) ) ) {
					this.painted++;
					this.marksSinceSense++;
					w.lastMarkAt = w.time;
				}
			}
		}
		w.emitted.length = 0;
	}

	/** One frame of wall time. */
	step( dtWall ) {
		const w = this.world;
		const dt = w.step( dtWall, this.actors );
		this.stageDirections();
		this.drain();
		this.stage.advance( w.time );
		// Wet paint lives on the world's clock too: the timekeeper's
		// slow motion slows the drying, a rush dries it fast.
		this.stage.tick(
			dtWall * 1000,
			Math.max( 0.05, w.timeScale * ( w.params.tempo || 1 ) )
		);
		this.sinceSense += dt;
		if (
			this.sinceSense >= SENSE_EVERY ||
			this.marksSinceSense >= SENSE_MARKS
		) {
			this.sinceSense = 0;
			this.marksSinceSense = 0;
			this.stage.sampleSenses();
			w.senses = this.stage.senses;
			w.needs = readNeeds( w.plan, w.senses );
			w.updatePhase();
		}
		return dt;
	}

	/** Live a stretch of time at once, e.g. for a still or a proof. */
	fastForward( seconds, dtWall = 1 / 30 ) {
		let t = 0;
		while ( t < seconds ) {
			this.step( dtWall );
			t += dtWall;
		}
		this.stage.settle();
		this.stage.sampleSenses();
	}

	/** The finish the school wants over a rendered copy. */
	finishSpec() {
		if ( this._finish ) {
			return this._finish;
		}
		const f = this.school.finish || {};
		const spec = {
			paper: f.paper || 0,
			vignette: f.vignette || 0,
			paperKind: this.ground.paper,
			seed: Math.floor( this.rng() * 4294967295 ) >>> 0,
		};
		// One surface finish per piece, now and then: varnish gloss,
		// craquelure, dust, or a torn paper edge.
		const allowed =
			this.school.finishes ||
			FAMILY_FINISHES[ familyOf( this.school.id ) ] ||
			[];
		if ( allowed.length && this.rng() < 0.5 ) {
			const pick =
				allowed[
					Math.floor( this.rng() * allowed.length ) % allowed.length
				];
			spec[ pick ] = 0.4 + this.rng() * 0.6;
		}
		this._finish = spec;
		return spec;
	}
}
