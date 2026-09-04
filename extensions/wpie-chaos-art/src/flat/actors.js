/**
 * The painters of the flat stage, and the characters around them.
 *
 * A painter has a ROLE (opener, builder, responder, accentor, finisher,
 * wanderer), a temperament, and senses. On each beat of its own clock
 * it may commit to one mark: the school's vocabulary for the picture's
 * current phase says WHAT kind, the role and the senses say WHERE, the
 * palette roles say WHICH color, the hand says HOW. The mark leaves as
 * a command; the stage draws it over the gesture's duration.
 */

import { Actor } from '../core/actors.js';
import { drawMotif, gesturePoint, gestureSpan } from '../core/gestures.js';
import { weightOf, gesturesFor } from './signature.js';
import { handPath, linePath } from './hand.js';
import { vnoise } from '../core/rng.js';
import { sampleMass, massAt, needs as readNeeds } from './composition.js';
import { cellAt, cellCentre } from './motif.js';
import { critique, inQuiet } from './critic.js';
import { pickVocab, sizeFor, range } from './schools.js';
import {
	complement,
	jitter,
	shade,
	mix,
	paletteFor,
	toHex,
} from './palette2d.js';
import { lum } from './senses.js';

export const PAINTER_ROLES = [
	'opener',
	'builder',
	'responder',
	'accentor',
	'finisher',
	'wanderer',
];

const TAU = Math.PI * 2;

// A piece of the source as a quotation, in any school; a letter cut out.
const QUOTE_ITEM = {
	kind: 'piece',
	size: 'small',
	color: 'local',
	treatments: [ 'posterize', 'duotone', 'edges', 'halftone', 'none' ],
	alpha: [ 0.85, 1 ],
	shadow: 0.4,
};
const LETTER_ITEM = {
	kind: 'piece',
	size: 'mid',
	color: 'local',
	place: 'source',
	treatments: [ 'none', 'duotone' ],
	alpha: [ 0.9, 1 ],
	shadow: 0.5,
	edge: 'cut',
};
const PHASE_INDEX = {
	opening: 0,
	building: 1,
	developing: 2,
	finishing: 3,
	resting: 4,
};
const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );

/** Keep a point inside the frame with a little bleed allowed. */
function inFrame( w, p, bleed = 0.04 ) {
	// A signature may keep a paper border; then nothing bleeds.
	const m = ( w.plan && w.plan.frameMargin ) || 0;
	if ( m > 0 ) {
		return [ clamp( p[ 0 ], m, w.aspect - m ), clamp( p[ 1 ], m, 1 - m ) ];
	}
	return [
		clamp( p[ 0 ], -bleed, w.aspect + bleed ),
		clamp( p[ 1 ], -bleed, 1 + bleed ),
	];
}

export class Painter extends Actor {
	constructor( world, temper = {} ) {
		const sch = world.school;
		super( world, {
			rate: ( sch.tempo.rate || 0.6 ) * ( temper.rate || 1 ),
			verve:
				temper.verve === undefined
					? 0.5 + world.rng() * 0.5
					: temper.verve,
		} );
		const r = world.rng;
		this.role = temper.role || 'builder';
		this.isPainter = true;
		// A guest paints in another school's words; everyone else in the
		// world's voice, which a shift may change halfway.
		this.voice = temper.voice || null;
		const soc = r() * 2 - 1;
		this.social = Math.sign( soc ) * Math.pow( Math.abs( soc ), 1.5 );
		this.sizeMul = ( temper.sizeMul || 1 ) * ( 0.8 + r() * 0.45 );
		const h = sch.hand || {};
		this.hand = {
			tremor: clamp(
				( h.tremor === undefined ? 0.3 : h.tremor ) *
					( 0.6 + r() * 0.8 ),
				0,
				1
			),
			haste: clamp(
				( h.haste === undefined ? 0.4 : h.haste ) * ( 0.6 + r() * 0.8 ),
				0.05,
				1
			),
			overshoot: h.overshoot || 0,
			hesitate: h.hesitate || 0,
		};
		this.busyUntil = 0;
		this.marks = 0;
		this.motifLove = 0.35 + r() * 0.45;
		this.dir = r() * TAU;
		this.entry = 0;
	}

	decide() {
		const w = this.world;
		const bursting = w.burst && w.time < w.burst.until;
		if ( ( w.time < this.busyUntil && ! bursting ) || ! w.senses ) {
			return;
		}
		const phase = w.phase;
		// In rest the picture is looked at more than touched: the finisher
		// adds a little, the others rarely - until the next sitting.
		if (
			'resting' === phase &&
			w.rng() > ( 'finisher' === this.role ? 0.4 : 0.14 )
		) {
			return;
		}
		// The opening belongs to the opener; others wait for the ground to be laid.
		if ( 'opening' === phase && 'opener' !== this.role && w.rng() < 0.7 ) {
			return;
		}
		if (
			'finishing' === phase &&
			'accentor' !== this.role &&
			'finisher' !== this.role &&
			w.rng() < 0.6
		) {
			return;
		}
		// A noisy sheet calms the builders: half of their turns pass.
		if (
			w.critique &&
			w.critique.busyNeed &&
			( 'builder' === this.role || 'wanderer' === this.role ) &&
			w.rng() < 0.5
		) {
			return;
		}
		const sch = this.voice || w.voice || w.school;
		const vocab =
			sch.vocab[ 'resting' === phase ? 'finishing' : phase ] ||
			sch.vocab.building;
		const sig = w.signature;
		const crit = w.critique;
		// The critic finds the sheet noisy: a builder or finisher lays a
		// quiet veil over the loudest part instead of another mark.
		if (
			crit &&
			crit.busyNeed &&
			( 'builder' === this.role || 'finisher' === this.role ) &&
			w.rng() < 0.35
		) {
			const l = w.senses.loudest( 0.3 );
			const veilAlpha = 0.1 + w.rng() * 0.1;
			const veilColor = this.colorFor( 'local', {
				p: [ l.x, l.y ],
				mass: massAt( w.plan, l.x, l.y ),
			} );
			const veil = {
				type: 'glaze',
				x: l.x - 0.16,
				y: l.y - 0.16,
				w: 0.32,
				h: 0.32,
				// The veil as pigment over what lies there, not as light.
				color: w.glazeColor(
					veilColor,
					w.underAt( [ l.x, l.y ] ),
					veilAlpha * 2
				),
				alpha: Math.min( 0.3, veilAlpha * 2 ),
				blend: 'multiply',
				soft: true,
				duration: 1.2,
				seed: Math.floor( w.rng() * 4294967295 ) >>> 0,
			};
			w.emitted.push( veil );
			w.segments++;
			this.busyUntil = w.time + 1.5 + w.rng();
			return;
		}
		let item = pickVocab( vocab, w.rng, ( it ) => weightOf( it, sig ) );
		const havePieces = !! ( w.pieces && w.pieces.length );
		if ( item && 'piece' === item.kind && ! havePieces ) {
			// A piece item without pieces: say another word instead.
			item = pickVocab(
				vocab.filter( ( it ) => 'piece' !== it.kind ),
				w.rng,
				( it ) => weightOf( it, sig )
			);
		} else if (
			havePieces &&
			'text' !== w.motifKind &&
			'opening' !== phase &&
			w.rng() < 0.03 + ( 'pieces' === w.motifReading ? 0.25 : 0 )
		) {
			// A quotation: a piece of the source, now and then, in any school.
			item = QUOTE_ITEM;
		} else if (
			havePieces &&
			'text' === w.motifKind &&
			'letters' === w.motifReading &&
			w.rng() < 0.35
		) {
			item = LETTER_ITEM;
		}
		if ( ! item ) {
			return;
		}
		const cmd = this.make( item );
		if ( ! cmd ) {
			return;
		}
		const dur =
			range( sch.tempo.duration, w.rng, 0.8 ) *
			( 0.7 + ( 1 - this.hand.haste ) * 0.6 );
		cmd.duration = dur;
		if ( ! Array.isArray( cmd ) ) {
			cmd.seed = Math.floor( w.rng() * 4294967295 ) >>> 0;
		}
		w.emitted.push( cmd );
		w.segments++;
		w.phaseMarks++;
		this.marks++;
		this.busyUntil =
			w.time +
			dur +
			( 0.2 + w.rng() * 1.2 ) / Math.max( 0.2, w.params.energy + 0.3 );
	}

	/* ------------------------------- senses -------------------------------- */

	/** Where this mark goes: a point, the mass there (if any), an angle. */
	place( item ) {
		const w = this.world;
		const r = w.rng;
		const plan = w.plan;
		const s = w.senses;
		const needs = w.needs || readNeeds( plan, s );
		if ( w.motif ) {
			const byMotif = this.placeByMotif( item );
			if ( byMotif ) {
				return byMotif;
			}
		}
		let p;
		let mass = null;
		const openMass = () => {
			// The least covered planned mass first: dominant before the rest.
			const order = plan.masses
				.slice()
				.sort(
					( a, b ) =>
						( 'dominant' === b.role ) - ( 'dominant' === a.role )
				);
			let best = null;
			let bestCov = Infinity;
			for ( const m of order ) {
				const c = s.coverAt( m.cx, m.cy );
				if ( c < bestCov - 0.15 ) {
					best = m;
					bestCov = c;
				}
			}
			return best || order[ 0 ] || null;
		};
		const role = this.role;
		if ( 'opening' === w.phase || 'opener' === role ) {
			mass = openMass();
			p = mass ? sampleMass( mass, r, 0.75 ) : [ r() * w.aspect, r() ];
		} else if (
			'responder' === role &&
			w.echo &&
			w.time - w.echo.t < 8 &&
			r() < 0.7
		) {
			p = [
				w.echo.p[ 0 ] + ( r() - 0.5 ) * 0.03,
				w.echo.p[ 1 ] + ( r() - 0.5 ) * 0.03,
			];
			this.dir =
				r() < 0.6
					? w.echo.angle
					: w.echo.angle + Math.PI * ( 0.5 + r() * 0.5 );
			w.echo = null;
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		} else if ( 'accentor' === role || 'finisher' === role ) {
			// Accents at the focal spot or where the picture is loudest;
			// contours and edges at the masses. When the critic misses
			// contrast at the focal, the accents go there.
			const toFocal = w.critique && w.critique.focalNeed ? 0.85 : 0.55;
			if ( r() < toFocal ) {
				p = [
					plan.focal.x + ( r() - 0.5 ) * 0.1,
					plan.focal.y + ( r() - 0.5 ) * 0.1,
				];
			} else {
				const l = s.loudest( 0.2 );
				p = [ l.x + ( r() - 0.5 ) * 0.08, l.y + ( r() - 0.5 ) * 0.08 ];
			}
			mass = massAt( plan, p[ 0 ], p[ 1 ] ) || plan.masses[ 0 ] || null;
		} else if ( 'wanderer' === role && needs.gap > 0.12 && r() < 0.7 ) {
			const e = s.emptiest( 0.22 );
			p = [ e.x + ( r() - 0.5 ) * 0.1, e.y + ( r() - 0.5 ) * 0.1 ];
		} else if ( this.social > 0.2 || needs.gap <= 0.05 ) {
			// Builders go where the plan is still owed: the mass whose
			// painted share lags its planned share most, weighted by role.
			// Piling onto the loudest place was the mush machine.
			const owed = plan.masses
				.map( ( mm ) => {
					const c = s.coverAt( mm.cx, mm.cy );
					const want =
						'dominant' === mm.role
							? 1
							: 'accent' === mm.role
							? 0.8
							: 0.6;
					return [ mm, Math.max( 0.02, want - c ) ];
				} )
				.sort( ( a, b ) => b[ 1 ] - a[ 1 ] );
			const m = owed.length
				? owed[
						Math.min(
							owed.length - 1,
							Math.floor( Math.pow( r(), 2 ) * owed.length )
						)
				  ][ 0 ]
				: null;
			mass = m;
			p = m ? sampleMass( m, r, 0.9 ) : [ r() * w.aspect, r() ];
			if ( w.critique && w.critique.focalNeed && r() < 0.3 ) {
				p = [
					plan.focal.x + ( r() - 0.5 ) * 0.12,
					plan.focal.y + ( r() - 0.5 ) * 0.12,
				];
			}
		} else if ( needs.imbalance > 0.25 && r() < 0.5 ) {
			p = [
				needs.balanceAt.x + ( r() - 0.5 ) * 0.2,
				needs.balanceAt.y + ( r() - 0.5 ) * 0.2,
			];
		} else {
			mass = openMass();
			p = mass ? sampleMass( mass, r, 1 ) : [ r() * w.aspect, r() ];
		}
		// A place already thick with paint takes no more building: the
		// mark moves to the emptiest window instead.
		if (
			( 'building' === w.phase || 'developing' === w.phase ) &&
			'accentor' !== role &&
			'finisher' !== role &&
			s.coverAt( p[ 0 ], p[ 1 ] ) > 0.92 &&
			r() < 0.7
		) {
			const e = s.emptiest( 0.25 );
			p = [ e.x + ( r() - 0.5 ) * 0.12, e.y + ( r() - 0.5 ) * 0.12 ];
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		}
		// The critic's quiet zone stays quiet until the piece is nearly
		// done; a builder who landed there moves to the plan's balance.
		if (
			w.critique &&
			inQuiet( w.critique, p ) &&
			'finisher' !== role &&
			'accentor' !== role &&
			r() < 0.85
		) {
			const m = openMass();
			p = m
				? sampleMass( m, r, 0.8 )
				: [ needs.balanceAt.x, needs.balanceAt.y ];
			mass = m;
		}
		// The visitor's gestures take precedence, visibly: along a drawn
		// stroke, around a burst, near the hand over the sheet.
		if ( w.call && w.time < w.call.until && r() < 0.65 ) {
			const cp = w.call.pts;
			const k = Math.min(
				cp.length - 2,
				Math.floor( r() * ( cp.length - 1 ) )
			);
			const a = cp[ k ];
			const b = cp[ k + 1 ];
			const t = r();
			p = [
				a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t + ( r() - 0.5 ) * 0.03,
				a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t + ( r() - 0.5 ) * 0.03,
			];
			this.dir = Math.atan2( b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] );
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		} else if ( w.burst && w.time < w.burst.until && r() < 0.85 ) {
			const sp = 0.03 + r() * 0.06;
			const a = r() * TAU;
			p = [
				w.burst.p[ 0 ] + Math.cos( a ) * sp,
				w.burst.p[ 1 ] + Math.sin( a ) * sp,
			];
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		} else if ( w.cursor.active && 'off' !== w.cursor.mode && r() < 0.45 ) {
			const sp = 0.02 + r() * 0.09;
			const a = r() * TAU;
			p = [
				w.cursor.point[ 0 ] + Math.cos( a ) * sp,
				w.cursor.point[ 1 ] + Math.sin( a ) * sp,
			];
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		}
		// Forces bend the placement a little - the visitor's pointer, impulses.
		const f = w.forceAt( p );
		p = inFrame( w, [
			p[ 0 ] + clamp( f[ 0 ], -0.1, 0.1 ),
			p[ 1 ] + clamp( f[ 1 ], -0.1, 0.1 ),
		] );
		if ( ! mass ) {
			mass = massAt( plan, p[ 0 ], p[ 1 ] );
		}
		let angle;
		if ( 'plan' === item.along ) {
			angle = plan.direction + ( r() - 0.5 ) * 0.5;
		} else if ( 'mass' === item.along && mass ) {
			angle = ( mass.angle || 0 ) + ( r() - 0.5 ) * 0.6;
		} else if ( 'responder' === role ) {
			angle = this.dir;
		} else {
			angle =
				r() < 0.4 ? plan.direction + ( r() - 0.5 ) * 1.2 : r() * TAU;
		}
		if ( w.axes && w.axes.length && r() < 0.7 ) {
			angle =
				w.axes[ Math.floor( r() * w.axes.length ) ] +
				( r() < 0.5 ? 0 : Math.PI / 2 ) +
				( r() - 0.5 ) * 0.15;
		}
		this.dir = angle;
		return { p, mass, angle };
	}

	/**
	 * A place read off the motif: where the picture still differs most
	 * from the motif's light, along its edges for the contour hands,
	 * far planes early and near ones late, inside or outside the letters
	 * of a text. Returns null now and then so the school's own habits
	 * of composition keep a say.
	 */
	placeByMotif( item ) {
		const w = this.world;
		const mo = w.motif;
		const r = w.rng;
		const s = w.senses;
		const reading = w.motifReading;
		const textual = 'text' === w.motifKind;
		const hard = textual && ( 'fill' === reading || 'clear' === reading );
		// The opening lays the big planes: the school's own way of
		// painting a mass does that best, the masses ARE the picture's.
		if ( ! hard && ( 'opening' === w.phase || 'opener' === this.role ) ) {
			return null;
		}
		// The likeness dial: how often the picture, how often the school.
		if ( ! hard && r() < 0.5 - w.motifLikeness * 0.4 ) {
			return null;
		}
		const contourKind =
			'contour' === item.kind ||
			'brushContour' === item.kind ||
			'line' === item.kind ||
			'edge' === item.kind ||
			'contours' === reading ||
			( textual && 'outline' === reading );
		const edgy =
			contourKind || 'accentor' === this.role || 'finisher' === this.role;
		const phaseI = PHASE_INDEX[ w.phase ] || 0;
		// The finishing hands read the fine map: the small things - an
		// eye, a highlight, a rim - that the coarse grid never saw.
		if ( edgy && w.motifFine && phaseI >= 2 && r() < 0.6 ) {
			const fine = w.motifFine;
			const fi =
				fine.edgeCells[ Math.floor( r() * fine.edgeCells.length ) ];
			const fc = cellCentre( fine, fi );
			const fp = inFrame( w, fc );
			this.dir = fine.dir[ fi ] + ( r() - 0.5 ) * 0.2;
			return {
				p: fp,
				mass: massAt( w.plan, fp[ 0 ], fp[ 1 ] ),
				angle: this.dir,
				motifCell: cellAt( mo, fp[ 0 ], fp[ 1 ] ),
			};
		}
		const n = mo.cols * mo.rows;
		let best = null;
		let bestScore = -Infinity;
		for ( let k = 0; k < 16; k++ ) {
			let i;
			if ( edgy && r() < 0.7 ) {
				i = mo.edgeCells[ Math.floor( r() * mo.edgeCells.length ) ];
			} else {
				i = Math.floor( r() * n ) % n;
			}
			if ( textual ) {
				const ins = mo.inside[ i ];
				if ( 'fill' === reading && ins < 0.35 ) {
					continue;
				}
				if ( 'clear' === reading && ins > 0.35 ) {
					continue;
				}
				if ( 'outline' === reading && mo.edge[ i ] < 0.25 ) {
					continue;
				}
			}
			const cc = cellCentre( mo, i );
			const si = s.index( cc[ 0 ], cc[ 1 ] );
			const need = Math.abs( mo.light[ i ] - s.light[ si ] );
			const fresh = 1 - s.cover[ si ] * 0.5;
			const depthTerm = mo.hasDepth
				? phaseI < 2
					? 1 - mo.depth[ i ]
					: mo.depth[ i ]
				: 0;
			const score =
				need * 1.2 +
				fresh * 0.4 +
				mo.edge[ i ] * ( edgy ? 0.9 : 0.1 ) +
				depthTerm * 0.35 +
				r() * 0.15;
			if ( score > bestScore ) {
				bestScore = score;
				best = i;
			}
		}
		if ( best === null ) {
			return hard
				? { p: [ w.aspect / 2, 0.5 ], mass: null, angle: r() * TAU }
				: null;
		}
		const c = cellCentre( mo, best );
		const jit = 0.5 / mo.rows;
		const p = inFrame( w, [
			c[ 0 ] + ( r() - 0.5 ) * 2 * jit,
			c[ 1 ] + ( r() - 0.5 ) * 2 * jit,
		] );
		const mass = massAt( w.plan, p[ 0 ], p[ 1 ] );
		// Along the picture's structure where it is coherent, free where it is not.
		let angle;
		if ( mo.coh[ best ] > 0.3 && r() < 0.85 ) {
			angle =
				mo.dir[ best ] + ( r() - 0.5 ) * ( contourKind ? 0.2 : 0.5 );
		} else {
			angle =
				r() < 0.5 ? w.plan.direction + ( r() - 0.5 ) * 1.2 : r() * TAU;
		}
		this.dir = angle;
		return { p, mass, angle, motifCell: best };
	}

	/** The color a rule names, at a place. */
	colorFor( rule, where ) {
		const w = this.world;
		if ( w.motif && where && where.p && 'text' !== w.motifKind ) {
			const mc = this.motifColor( rule, where.p );
			if ( mc ) {
				return this.disciplined( rule, mc, where );
			}
		}
		return this.disciplined( rule, this.ruleColor( rule, where ), where );
	}

	/**
	 * Value discipline over any color: the mass's planned value pulls,
	 * the phase sets the order (dark block-in first, lights last), the
	 * critic's wants tip the balance, and the atmosphere cools what is
	 * far. Rules that mean a value or the accent keep their word.
	 */
	disciplined( rule, c, where ) {
		const w = this.world;
		const r = w.rng;
		if ( 'dark' === rule || 'light' === rule || 'accent' === rule ) {
			return c;
		}
		let out = c;
		const m = where && where.mass;
		if ( m && Number.isFinite( m.value ) && ! w.motif ) {
			out = shade( out, ( m.value - lum( out ) ) * 0.35 );
		}
		// Form: within a mass the lit side is lighter and warmer, the
		// shadow side darker and cooler - the one light of the piece.
		if ( m && where.p && w.light && m.rx > 0 ) {
			const dx = ( where.p[ 0 ] - m.cx ) / m.rx;
			const dy = ( where.p[ 1 ] - m.cy ) / m.ry;
			const t = clamp(
				-( dx * w.light.dir[ 0 ] + dy * w.light.dir[ 1 ] ),
				-1,
				1
			);
			out = shade( out, t * 0.28 );
			out = mix(
				out,
				t > 0 ? [ 1, 0.85, 0.6 ] : [ 0.5, 0.65, 1 ],
				Math.abs( t ) * 0.14
			);
			out = jitter( out, r, 0.05 );
		}
		if ( 'opening' === w.phase ) {
			out = shade( out, -0.08 );
		} else if ( 'finishing' === w.phase && 'lit' !== rule && r() < 0.35 ) {
			out = shade( out, 0.1 );
		}
		const crit = w.critique;
		if ( crit && crit.valueNeed && r() < 0.7 ) {
			if ( 'dark' === crit.valueNeed ) {
				out = mix( shade( out, -0.35 ), w.palette.dark, 0.45 );
			} else if ( 'light' === crit.valueNeed ) {
				out = mix( shade( out, 0.3 ), w.palette.light, 0.45 );
			}
		}
		if ( crit && crit.warmNeed && r() < 0.4 ) {
			out = mix(
				out,
				'warm' === crit.warmNeed ? [ 1, 0.8, 0.5 ] : [ 0.5, 0.75, 1 ],
				0.12
			);
		}
		if (
			w.motif &&
			w.motif.hasDepth &&
			where &&
			where.p &&
			w.groundColor
		) {
			const d =
				w.motif.depth[ cellAt( w.motif, where.p[ 0 ], where.p[ 1 ] ) ];
			out = mix( out, w.groundColor, ( 1 - d ) * 0.22 );
		}
		return out;
	}

	/** The color a rule names, at a place - the plain reading. */
	ruleColor( rule, where ) {
		const w = this.world;
		const r = w.rng;
		const pal = w.palette;
		const local =
			( where.mass && where.mass.color ) ||
			( w.heat < 0.5 ? pal.dominant : pal.secondary );
		if ( w.accentUntil > w.time && r() < 0.5 ) {
			return pal.accent;
		}
		switch ( rule ) {
			case 'local':
				return jitter( local, r, 0.04 );
			case 'broken': {
				// Broken color: the local tone shifted in hue and value,
				// a neighbour now and then, a complement only sometimes.
				const roll = r();
				const partner =
					roll < 0.2
						? complement( local )
						: roll < 0.5
						? pal.light
						: roll < 0.75
						? pal.secondary
						: pal.dominant;
				return jitter(
					mix( local, partner, 0.1 + r() * 0.25 ),
					r,
					0.09
				);
			}
			case 'complement':
				return jitter( complement( local ), r, 0.05 );
			case 'shadow':
				return mix( shade( local, -0.28, 0.1 ), pal.dark, 0.35 );
			case 'lit':
				return mix( shade( local, 0.25, -0.1 ), pal.light, 0.3 );
			case 'dark':
				return pal.dark;
			case 'light':
				return pal.light;
			case 'accent':
				return pal.accent;
			case 'dominant':
				return pal.dominant;
			case 'secondary':
				return pal.secondary;
			case 'any':
			default:
				return pal.list[
					Math.floor( r() * pal.list.length ) % pal.list.length
				];
		}
	}

	/**
	 * The color the picture has at a point, said in the palette: the
	 * nearest palette color, shaded to the picture's light there. The
	 * rules that mean a VALUE (dark, light) or the accent keep their word.
	 */
	motifColor( rule, p ) {
		const w = this.world;
		const mo = w.motif;
		const pal = w.palette;
		if ( 'dark' === rule || 'light' === rule || 'accent' === rule ) {
			return null;
		}
		const i = cellAt( mo, p[ 0 ], p[ 1 ] );
		const target = [
			mo.rgb[ i * 3 ],
			mo.rgb[ i * 3 + 1 ],
			mo.rgb[ i * 3 + 2 ],
		];
		let best = pal.list[ 0 ];
		let bd = Infinity;
		for ( const cand of pal.list ) {
			const d = Math.hypot(
				cand[ 0 ] - target[ 0 ],
				cand[ 1 ] - target[ 1 ],
				cand[ 2 ] - target[ 2 ]
			);
			if ( d < bd ) {
				bd = d;
				best = cand;
			}
		}
		const lit = shade(
			best,
			( mo.light[ i ] - lum( best ) ) * ( 0.55 + w.motifLikeness * 0.45 )
		);
		return jitter( lit, w.rng, 'broken' === rule ? 0.09 : 0.04 );
	}

	/* -------------------------------- marks -------------------------------- */

	motifFor( item ) {
		const w = this.world;
		const gestures = gesturesFor( item, w.signature );
		const base = w.pickMeme( gestures || null );
		if ( base && w.rng() < this.motifLove ) {
			const m = {
				...base,
				curl: base.curl * ( 0.7 + w.rng() * 0.6 ),
				elong: base.elong * ( 0.75 + w.rng() * 0.5 ),
				jag: clamp( base.jag + ( w.rng() - 0.5 ) * 0.35, 0, 1 ),
				phi: base.phi + ( w.rng() - 0.5 ) * 1.2,
			};
			if ( w.rng() < 0.1 ) {
				m.kind = drawMotif( w.rng, gestures || undefined ).kind;
			}
			return m;
		}
		return drawMotif( w.rng, gestures || undefined );
	}

	/** The marks' hardness under the piece's edge signature. */
	edged( hardness, where = null ) {
		const s = this.world.signature;
		const e = s && s.edge ? s.edge : 1;
		return Math.round(
			clamp( hardness * e * this.foundEdge( where ), 20, 100 )
		);
	}

	/**
	 * Lost and found: near the focal spot edges are found (hard, full),
	 * away from it they are lost (soft, thinner). 0.6..1.15.
	 */
	foundEdge( where ) {
		const w = this.world;
		if ( ! where || ! where.p ) {
			return 1;
		}
		const f = w.plan.focal;
		const d = Math.hypot( where.p[ 0 ] - f.x, where.p[ 1 ] - f.y );
		const near = clamp( 1 - d / ( 0.55 * Math.max( 1, w.aspect ) ), 0, 1 );
		return 0.6 + near * 0.55;
	}

	sizeOf( item, where = null ) {
		const w = this.world;
		let mul = this.sizeMul * ( w.scaleMul || 1 );
		if ( w.mixedScale && w.rng() < 0.18 ) {
			mul *= 2;
		}
		let size = sizeFor( item.size || 'mid', w.rng, mul );
		// Later phases and later sittings work smaller: the big planes
		// are laid, what follows is detail.
		if ( 'developing' === w.phase ) {
			size *= 0.85;
		} else if ( 'finishing' === w.phase || 'resting' === w.phase ) {
			size *= 0.75;
		}
		if ( w.sitting > 1 ) {
			size *= Math.max( 0.6, 1 - ( w.sitting - 1 ) * 0.15 );
		}
		if ( w.motif && 'text' === w.motifKind ) {
			// Letters are read at the stroke's width: the hand works small.
			size *= 0.35;
		}
		if ( w.motif && where && where.p ) {
			// Detail where the picture has edges, breadth where it is calm.
			const e =
				w.motif.edge[ cellAt( w.motif, where.p[ 0 ], where.p[ 1 ] ) ];
			// The more likeness is asked for, the smaller the hand.
			size *= ( 1 - 0.45 * e ) * ( 1 - 0.4 * w.motifLikeness );
		}
		// A mark inside a mass is no bigger than the mass: a counterweight
		// stays a counterweight.
		if (
			where &&
			where.mass &&
			'brush' !== item.kind &&
			'dots' !== item.kind
		) {
			size = Math.min(
				size,
				Math.max( where.mass.rx, where.mass.ry ) * 1.3
			);
		}
		return size;
	}

	stroke( item, where, size, color ) {
		const w = this.world;
		const motif = this.motifFor( item );
		const widthFrac =
			{
				bristle: 0.22,
				flat: 0.28,
				round: 0.26,
				chalk: 0.24,
				sumi: 0.24,
				pen: 0.06,
			}[ item.tip || 'bristle' ] || 0.22;
		const pts = handPath( motif, {
			at: where.p,
			angle: where.angle,
			scale: size,
			width: Math.max(
				0.003,
				size * widthFrac * ( 0.7 + w.rng() * 0.6 )
			),
			rng: w.rng,
			tremor: this.hand.tremor,
			haste: this.hand.haste,
			overshoot: this.hand.overshoot,
			hesitate: this.hand.hesitate,
		} ).map( ( q ) => {
			const c = inFrame( w, [ q.x, q.y ], 0.06 );
			return { ...q, x: c[ 0 ], y: c[ 1 ] };
		} );
		if ( pts.length < 3 ) {
			return null;
		}
		w.postMeme( motif );
		const last = pts[ pts.length - 1 ];
		const prev = pts[ pts.length - 2 ];
		w.echo = {
			p: [ last.x, last.y ],
			angle: Math.atan2( last.y - prev.y, last.x - prev.x ),
			t: w.time,
		};
		return {
			type: 'stroke',
			pts,
			tip: item.tip || 'bristle',
			variant: item.variant,
			color,
			alpha: range( item.alpha, w.rng, 0.9 ),
			dry: item.dry || 0,
			colorVar: item.colorVar || 0,
			relief: item.relief || 0,
			stretch: item.stretch,
			blend: item.blend,
		};
	}

	/**
	 * A brush mark through the editor's engine: a media brush head, a
	 * paint style, the hand's path with its widths. `wet` asks for the
	 * physics island when the browser has one.
	 */
	brush( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const count = Math.max( 1, Math.round( range( item.count, r, 1 ) ) );
		const marks = [];
		for ( let k = 0; k < count; k++ ) {
			const motif = this.motifFor( item );
			if ( item.elong ) {
				motif.elong = range( item.elong, r, motif.elong );
			}
			const tips = item.tips || [ 'round' ];
			const tip = tips[ Math.floor( r() * tips.length ) % tips.length ];
			// A mark is as wide as its length divided by the RATIO: dabs
			// are stubby (2..3), strokes long (5..12), lines thin.
			const span = gestureSpan( motif ) * size;
			const ratio = range( item.ratio, r, 6 );
			const width = Math.max( 0.004, span / Math.max( 1.2, ratio ) );
			const at = k
				? [
						where.p[ 0 ] + ( r() - 0.5 ) * size * 2.2,
						where.p[ 1 ] + ( r() - 0.5 ) * size * 2.2,
				  ]
				: where.p;
			const angle =
				where.angle +
				( k
					? ( r() - 0.5 ) *
					  ( item.alongVar === undefined ? 0.7 : item.alongVar )
					: 0 );
			const pts = handPath( motif, {
				at,
				angle,
				scale: size,
				width,
				rng: r,
				tremor: this.hand.tremor,
				haste: this.hand.haste,
				overshoot: this.hand.overshoot,
				hesitate: this.hand.hesitate,
			} ).map( ( q ) => {
				const c = inFrame( w, [ q.x, q.y ], 0.06 );
				return { ...q, x: c[ 0 ], y: c[ 1 ] };
			} );
			if ( pts.length < 3 ) {
				continue;
			}
			w.postMeme( motif );
			const last = pts[ pts.length - 1 ];
			const prev = pts[ pts.length - 2 ];
			w.echo = {
				p: [ last.x, last.y ],
				angle: Math.atan2( last.y - prev.y, last.x - prev.x ),
				t: w.time,
			};
			const col = item.colorVar
				? jitter( color, r, item.colorVar )
				: color;
			marks.push( {
				type: 'brush',
				pts,
				tip,
				style: item.style || 'normal',
				wet: !! item.wet,
				color: toHex( col ),
				opacity:
					range( item.opacity, r, 1 ) *
					( 0.75 + 0.25 * this.foundEdge( where ) ) *
					( 'developing' === w.phase
						? 0.9
						: 'finishing' === w.phase || 'resting' === w.phase
						? 0.85
						: 1 ),
				flow: range( item.flow, r, 1 ),
				hardness: this.edged(
					item.hardness === undefined ? 85 : item.hardness,
					where
				),
				spacing: item.spacing,
				scatter: item.scatter,
				taper: item.taper,
			} );
		}
		if ( ! marks.length ) {
			return null;
		}
		return 1 === marks.length ? marks[ 0 ] : marks;
	}

	/** A contour along a mass, through the engine. */
	brushContour( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		const m =
			where.mass ||
			w.plan.masses[ Math.floor( r() * w.plan.masses.length ) ];
		if ( ! m ) {
			return null;
		}
		const a0 = r() * TAU;
		const sweep = 0.5 + r() * 1.6;
		const n = 22;
		const width = range( item.width, r, 0.008 );
		const s0 = r() * 40;
		const cs = Math.cos( m.angle || 0 );
		const sn = Math.sin( m.angle || 0 );
		const pts = [];
		for ( let i = 0; i <= n; i++ ) {
			const t = i / n;
			const a = a0 + t * sweep;
			// A hand following a form: the radius breathes, the line wanders.
			const wob =
				1 +
				( vnoise( a * 1.7 + s0, s0, 0 ) - 0.5 ) * 0.5 +
				( r() - 0.5 ) * 0.08;
			const lx = Math.cos( a ) * m.rx * 1.08 * wob;
			const ly = Math.sin( a ) * m.ry * 1.08 * wob;
			const p = inFrame(
				w,
				[ m.cx + lx * cs - ly * sn, m.cy + lx * sn + ly * cs ],
				0.05
			);
			pts.push( {
				x: p[ 0 ],
				y: p[ 1 ],
				w: width * ( 0.6 + 0.6 * Math.sin( t * Math.PI ) ),
				t,
				speed: 0.5,
				dry: 0.3,
			} );
		}
		const tips = item.tips || [ 'ink-brushpen' ];
		return {
			type: 'brush',
			pts,
			tip: tips[ Math.floor( r() * tips.length ) % tips.length ],
			style: item.style || 'ink',
			wet: !! item.wet,
			color: toHex( color ),
			opacity: range( item.opacity, r, 1 ),
			flow: range( item.flow, r, 1 ),
			hardness: this.edged( 90, where ),
			taper: 3,
		};
	}

	/** A contour: part of a mass's outline, drawn as a stroke. */
	contour( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		const m =
			where.mass ||
			w.plan.masses[ Math.floor( r() * w.plan.masses.length ) ];
		if ( ! m ) {
			return null;
		}
		const a0 = r() * TAU;
		const sweep = 0.5 + r() * 1.6;
		const n = 24;
		const width = range( item.width, r, 0.008 );
		const pts = [];
		const cs = Math.cos( m.angle || 0 );
		const sn = Math.sin( m.angle || 0 );
		for ( let i = 0; i <= n; i++ ) {
			const t = i / n;
			const a = a0 + t * sweep;
			const wob = 1 + ( r() - 0.5 ) * 0.12;
			const lx = Math.cos( a ) * m.rx * 1.08 * wob;
			const ly = Math.sin( a ) * m.ry * 1.08 * wob;
			const p = inFrame(
				w,
				[ m.cx + lx * cs - ly * sn, m.cy + lx * sn + ly * cs ],
				0.05
			);
			pts.push( {
				x: p[ 0 ],
				y: p[ 1 ],
				w:
					width *
					( 0.6 + 0.6 * Math.sin( t * Math.PI ) ) *
					( 0.8 + r() * 0.4 ),
				t,
				speed: 0.5,
				dry: 0.3 + t * 0.4,
			} );
		}
		return {
			type: 'stroke',
			pts,
			tip: item.tip || 'bristle',
			color,
			alpha: range( item.alpha, r, 0.9 ),
			dry: item.dry || 0.3,
			stretch: 1.6,
		};
	}

	wash( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		return {
			type: 'wash',
			cx: where.p[ 0 ],
			cy: where.p[ 1 ],
			rx: size * ( 1 + r() * 0.5 ),
			ry: size * ( 0.6 + r() * 0.5 ),
			angle: where.angle,
			color,
			alpha: range( item.alpha, r, 0.3 ),
			blend: item.blend || 'multiply',
			rim: item.rim === undefined ? 0.6 : item.rim,
			grain: item.grain || 0,
			edge: item.edge === undefined ? 0.02 : item.edge,
			depth: r() < 0.4 ? 1 : 0,
		};
	}

	shape( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const kinds = item.shapes || [ 'rect' ];
		const kind = kinds[ Math.floor( r() * kinds.length ) % kinds.length ];
		let angle =
			'plan' === item.align
				? w.plan.direction + Math.round( r() * 2 ) * ( Math.PI / 2 )
				: where.angle;
		if ( 'plan' === item.align && r() < 0.35 ) {
			angle = r() < 0.5 ? 0 : Math.PI / 2;
		}
		let x = where.p[ 0 ];
		let y = where.p[ 1 ];
		let wd = size * ( 1 + r() * 0.8 );
		let ht = size * ( 0.6 + r() * 0.9 );
		if ( 'bar' === kind ) {
			wd = size * ( 2 + r() * 2.5 );
			ht = size * ( 0.18 + r() * 0.25 );
		} else if ( 'circle' === kind || 'ring' === kind ) {
			ht = wd = size * ( 1 + r() * 0.6 );
		}
		// A grid plan: shapes snap into cells.
		if (
			'plan' === item.align &&
			w.plan.cells &&
			w.plan.cells.length &&
			r() < 0.6
		) {
			const c = w.plan.cells[ Math.floor( r() * w.plan.cells.length ) ];
			x = c.x + c.w / 2;
			y = c.y + c.h / 2;
			wd = Math.min( wd, c.w * 0.9 );
			ht = Math.min( ht, c.h * 0.9 );
			angle = 0;
		}
		let pts;
		if ( 'poly' === kind ) {
			const n = 4 + Math.floor( r() * 3 );
			pts = [];
			for ( let i = 0; i < n; i++ ) {
				const a = ( i / n ) * TAU + r() * 0.6;
				const rad = size * ( 0.6 + r() * 0.7 );
				pts.push(
					inFrame(
						w,
						[
							x + Math.cos( a ) * rad * 1.2,
							y + Math.sin( a ) * rad,
						],
						0.1
					)
				);
			}
		}
		if ( item.gap ) {
			wd *= 1 - item.gap;
			ht *= 1 - item.gap;
		}
		return {
			type: 'shape',
			kind,
			x,
			y,
			w: wd,
			h: ht,
			angle,
			pts,
			color,
			alpha: range( item.alpha, r, 1 ),
			edge: item.edge || 'crisp',
			rag: item.rag,
			blend: item.blend,
			strokeW: 'ring' === kind ? wd * ( 0.08 + r() * 0.16 ) : undefined,
			sweep: 'wedge' === kind ? 0.6 + r() * 1.2 : undefined,
		};
	}

	cut( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const prints = item.prints || [ item.print || 'none' ];
		const print =
			prints[ Math.floor( r() * prints.length ) % prints.length ];
		const pal = w.palette;
		// Paper reads as paper: lighter, less saturated than paint.
		const paperColor =
			'light' === item.color
				? shade( pal.light, 0.1, -0.3 )
				: shade( color, 0.3, -0.5 );
		return {
			type: 'cut',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			w: size * ( 1.2 + r() * 1.2 ),
			h: size * ( 0.7 + r() * 1 ),
			angle: where.angle * 0.35,
			color: paperColor,
			print: 'none' === print ? undefined : print,
			printScale: 0.6 + r() * 0.8,
			ink: mix( pal.dark, [ 0.1, 0.1, 0.1 ], 0.5 ),
			paper: item.paper || 'paper',
			shadow: 0.45 + r() * 0.35,
			tear: 0.3 + r() * 0.7,
		};
	}

	line( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const len =
			'big' === item.size ? 0.5 + r() * 0.9 : size * ( 2 + r() * 3 );
		const a = where.angle;
		const b = inFrame(
			w,
			[
				where.p[ 0 ] + Math.cos( a ) * len,
				where.p[ 1 ] + Math.sin( a ) * len,
			],
			0.02
		);
		const width = range( item.width, r, 0.003 );
		return {
			type: 'line',
			pts: linePath( where.p, b, width, {
				rng: r,
				wobble: item.wobble || 0,
			} ),
			color,
			alpha: range( item.alpha, r, 1 ),
			width,
		};
	}

	/**
	 * A piece of the motif placed as material: chosen by nearness to the
	 * place (a montage that reconstructs) or at random (a collage that
	 * does not), treated with an effect, turned, scaled, torn or cut.
	 */
	piece( item, where, size ) {
		const w = this.world;
		const r = w.rng;
		const pool = w.pieces || [];
		if ( ! pool.length ) {
			return null;
		}
		let pc;
		const atSource = 'source' === item.place && r() < 0.75;
		if ( atSource ) {
			pc = pool.reduce( ( best, p ) =>
				Math.hypot( p.x - where.p[ 0 ], p.y - where.p[ 1 ] ) <
				Math.hypot( best.x - where.p[ 0 ], best.y - where.p[ 1 ] )
					? p
					: best
			);
		} else {
			pc = pool[ Math.floor( r() * pool.length ) % pool.length ];
		}
		const treatments = item.treatments || [ 'none' ];
		const treatment =
			treatments[
				Math.floor( r() * treatments.length ) % treatments.length
			];
		const canvas = w.treat ? w.treat( pc, treatment ) : pc.canvas;
		let k;
		if ( atSource ) {
			k = 0.9 + r() * 0.2;
		} else {
			k = ( size * ( 1.6 + r() * 1.8 ) ) / Math.max( pc.w, pc.h );
		}
		const at = atSource ? [ pc.x, pc.y ] : where.p;
		return {
			type: 'piece',
			canvas,
			x: at[ 0 ],
			y: at[ 1 ],
			w: pc.w * k,
			h: pc.h * k,
			angle: atSource
				? ( r() - 0.5 ) * 0.12
				: where.angle * 0.35 + ( r() - 0.5 ) * 0.6,
			alpha: range( item.alpha, r, 0.95 ),
			edge: item.edge || ( r() < 0.5 ? 'torn' : 'cut' ),
			shadow: item.shadow === undefined ? 0.5 : item.shadow,
			blend: item.blend,
		};
	}

	/**
	 * The block-in: a mass laid in rows of strokes across its ellipse,
	 * each stroke lit by the piece's one light - a painter's first pass,
	 * not a blob. Falls back to a single stroke where there is no mass.
	 */
	blockIn( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const m =
			where.mass || massAt( w.plan, where.p[ 0 ], where.p[ 1 ] ) || null;
		if ( ! m || ! m.rx || ! m.ry ) {
			return this.brush( item, where, size, color );
		}
		const rows = Math.max( 3, Math.round( range( item.rows, r, 6 ) ) );
		const ang = ( m.angle || 0 ) + ( r() - 0.5 ) * 0.3;
		const cs = Math.cos( ang );
		const sn = Math.sin( ang );
		const marks = [];
		const stroke = {
			...item,
			count: 1,
			gestures: item.gestures || [ 'slash' ],
		};
		for ( let i = 0; i < rows; i++ ) {
			const v = -1 + ( ( i + 0.5 ) * 2 ) / rows;
			const half = Math.sqrt( Math.max( 0, 1 - v * v ) );
			const nSeg = Math.max(
				1,
				Math.round( ( half * m.rx * 2 ) / ( size * 1.8 ) )
			);
			for ( let k = 0; k < nSeg; k++ ) {
				const u =
					-half +
					( ( k + 0.5 ) * 2 * half ) / nSeg +
					( r() - 0.5 ) * 0.25 * half;
				const px = m.cx + u * m.rx * cs - v * m.ry * sn;
				const py = m.cy + u * m.rx * sn + v * m.ry * cs;
				const p = inFrame( w, [ px, py ] );
				const here = { p, mass: m, angle: ang + ( r() - 0.5 ) * 0.35 };
				const col = this.colorFor( item.color || 'local', here );
				const one = this.brush(
					stroke,
					here,
					size * ( 0.9 + r() * 0.3 ),
					col
				);
				if ( one ) {
					marks.push( ...( Array.isArray( one ) ? one : [ one ] ) );
				}
			}
		}
		return marks.length ? marks : null;
	}

	/** A spray can along a short path: dense in the middle, dusty at the rim. */
	spray( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const len = size * ( 2 + r() * 2.5 );
		const a = where.angle;
		const b = inFrame(
			w,
			[
				where.p[ 0 ] + Math.cos( a ) * len,
				where.p[ 1 ] + Math.sin( a ) * len,
			],
			0.02
		);
		return {
			type: 'spray',
			pts: linePath( where.p, b, 0.01, {
				rng: r,
				wobble: item.wobble === undefined ? 0.3 : item.wobble,
			} ),
			width: range( item.width, r, 0.03 ),
			n: Math.round(
				range( item.n, r, 320 ) * ( 0.6 + w.params.density * 0.8 )
			),
			dot: range( item.dot, r, 0.004 ),
			color,
			alpha: range( item.alpha, r, 0.85 ),
		};
	}

	/** A halftone screen inside an ellipse. */
	halftone( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		return {
			type: 'halftone',
			cx: where.p[ 0 ],
			cy: where.p[ 1 ],
			rx: size * ( 1 + r() * 0.8 ),
			ry: size * ( 0.7 + r() * 0.9 ),
			angle: where.angle,
			pitch: range( item.pitch, r, 0.018 ),
			minR: item.minR === undefined ? 0.1 : item.minR,
			maxR: item.maxR === undefined ? 0.55 : item.maxR,
			gradient: r() * TAU,
			invert: r() < 0.5,
			color,
			alpha: range( item.alpha, r, 1 ),
			blend: item.blend,
		};
	}

	/** Little stones in rows, grout between. */
	tesserae( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const pal = w.palette;
		return {
			type: 'tesserae',
			cx: where.p[ 0 ],
			cy: where.p[ 1 ],
			rx: size * ( 1 + r() * 0.8 ),
			ry: size * ( 0.7 + r() * 0.9 ),
			angle: where.angle,
			stone: range( item.stone, r, 0.02 ),
			colors: [
				color,
				jitter( color, r, 0.1 ),
				mix( color, pal.light, 0.3 ),
				mix( color, pal.dark, 0.25 ),
			],
			colorVar: item.colorVar === undefined ? 0.06 : item.colorVar,
			gold: item.gold || 0,
			alpha: 1,
		};
	}

	/** A window of glass: cells of color in a net of lead. */
	lead( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const pal = w.palette;
		return {
			type: 'lead',
			cx: where.p[ 0 ],
			cy: where.p[ 1 ],
			rx: size * ( 1 + r() * 0.8 ),
			ry: size * ( 0.8 + r() * 0.8 ),
			cells: Math.round( range( item.cells, r, 7 ) ),
			colors: [
				color,
				pal.accent,
				pal.secondary,
				pal.light,
				mix( color, pal.dominant, 0.5 ),
			],
			// Lead is lead: near black whatever the palette's dark is.
			lead: mix( pal.dark, [ 0.06, 0.05, 0.05 ], 0.75 ),
			leadW: range( item.leadW, r, 0.006 ),
			alpha: range( item.alpha, r, 0.85 ),
			blend: item.blend,
		};
	}

	/** A whiplash line that curls at the end. */
	tendril( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		return {
			type: 'tendril',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			angle: where.angle,
			len: size * ( 2.5 + r() * 2.5 ),
			width: range( item.width, r, 0.01 ),
			curl: 0.7 + r() * 0.9,
			color,
			alpha: range( item.alpha, r, 1 ),
		};
	}

	/** Concentric rings, an Orphist disc. */
	orbit( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const pal = w.palette;
		return {
			type: 'orbit',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			r: size * ( 0.8 + r() * 0.8 ),
			rings: Math.round( range( item.rings, r, 5 ) ),
			colors: [
				color,
				pal.accent,
				pal.light,
				pal.secondary,
				pal.dominant,
			],
			halves: r() < ( item.halves === undefined ? 0.5 : item.halves ),
			angle: where.angle,
			alpha: range( item.alpha, r, 0.92 ),
			blend: item.blend,
		};
	}

	dots( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const pal = w.palette;
		const local = color;
		const colors = [
			local,
			jitter( local, r, 0.12 ),
			mix( local, complement( local ), 0.35 ),
			mix( local, pal.light, 0.4 ),
		];
		if ( 'dark' === item.color ) {
			colors.splice( 1, 3, shade( local, -0.1 ), shade( local, 0.1 ) );
		}
		return {
			type: 'dots',
			cx: where.p[ 0 ],
			cy: where.p[ 1 ],
			rx: size * ( 0.6 + r() * 0.5 ),
			ry: size * ( 0.45 + r() * 0.45 ),
			angle: where.angle,
			n: Math.round(
				range( item.n, r, 40 ) * ( 0.6 + w.params.density * 0.8 )
			),
			size: item.dot || [ 0.008, 0.02 ],
			colors,
			tip: item.tip || 'round',
			alpha: range( item.alpha, r, 0.95 ),
			colorVar: item.colorVar || 0,
			along: item.along ? where.angle : null,
			alongVar: item.alongVar,
			spread: item.spread,
			stretch: 'bristle' === item.tip ? 1.6 + r() * 0.8 : 1,
		};
	}

	facet( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const axes = w.axes.length ? w.axes : [ 0, Math.PI / 2 ];
		const a1 = axes[ Math.floor( r() * axes.length ) ];
		let a2 = axes[ Math.floor( r() * axes.length ) ];
		if ( Math.abs( a2 - a1 ) < 0.2 ) {
			a2 = a1 + Math.PI / 2 + ( r() - 0.5 ) * 0.5;
		}
		const ex = size * ( 0.8 + r() * 1.4 );
		const ey = size * ( 0.5 + r() * 1.1 );
		const u = [ Math.cos( a1 ) * ex, Math.sin( a1 ) * ex ];
		const v = [ Math.cos( a2 ) * ey, Math.sin( a2 ) * ey ];
		const x = where.p[ 0 ];
		const y = where.p[ 1 ];
		// A facet stays near the sheet: corners clamped with a little bleed.
		const pts = [
			[ x - u[ 0 ] - v[ 0 ], y - u[ 1 ] - v[ 1 ] ],
			[ x + u[ 0 ] - v[ 0 ], y + u[ 1 ] - v[ 1 ] ],
			[ x + u[ 0 ] + v[ 0 ], y + u[ 1 ] + v[ 1 ] ],
			[ x - u[ 0 ] + v[ 0 ], y - u[ 1 ] + v[ 1 ] ],
		].map( ( q ) => inFrame( w, q, 0.15 ) );
		if ( r() < 0.5 ) {
			// A corner cut off: the fifth side of a broken plane.
			const i = Math.floor( r() * 4 );
			const a = pts[ i ];
			const b = pts[ ( i + 1 ) % 4 ];
			pts.splice( i + 1, 0, [
				a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * 0.5,
				a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * 0.5,
			] );
			pts.splice( i, 1 );
		}
		w.facets.push( pts );
		while ( w.facets.length > 40 ) {
			w.facets.shift();
		}
		return {
			type: 'shape',
			kind: 'poly',
			pts,
			x,
			y,
			w: ex * 2,
			h: ey * 2,
			color,
			alpha: range( item.alpha, r, 0.85 ),
			gradient: {
				angle: this.world.school.light || -2.2,
				amount: item.shading || 0.28,
			},
			stroke: r() < 0.5 ? w.palette.dark : null,
			strokeW: 0.0018,
		};
	}

	edge( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		if ( ! w.facets.length ) {
			return null;
		}
		const f = w.facets[ Math.floor( r() * w.facets.length ) ];
		const i = Math.floor( r() * f.length );
		const a = f[ i ];
		const b = f[ ( i + 1 ) % f.length ];
		const ext = 0.3 + r() * 0.6;
		const a2 = [
			a[ 0 ] - ( b[ 0 ] - a[ 0 ] ) * ext * 0.5,
			a[ 1 ] - ( b[ 1 ] - a[ 1 ] ) * ext * 0.5,
		];
		const b2 = [
			b[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * ext * 0.5,
			b[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * ext * 0.5,
		];
		const width = range( item.width, r, 0.003 );
		return {
			type: 'line',
			pts: linePath( inFrame( w, a2 ), inFrame( w, b2 ), width, {
				rng: r,
				wobble: 0.15,
			} ),
			color,
			alpha: range( item.alpha, r, 0.85 ),
			width,
		};
	}

	hatch( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const angle = w.axes.length
			? w.axes[ Math.floor( r() * w.axes.length ) ] + ( r() - 0.5 ) * 0.2
			: where.angle;
		return {
			type: 'hatch',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			angle,
			n: 5 + Math.floor( r() * 9 ),
			spacing: size * 0.12,
			len: size * ( 1.2 + r() ),
			width: 0.0015 + r() * 0.002,
			color,
			alpha: range( item.alpha, r, 0.7 ),
		};
	}

	splatter( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const e = w.echo;
		const angle = e && w.time - e.t < 5 ? e.angle : where.angle;
		return {
			type: 'splatter',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			angle,
			n: Math.round( 12 + r() * 30 * ( 0.5 + w.params.energy ) ),
			reach: size * ( 1.5 + r() * 2 ),
			size: [ 0.0015, size * 0.18 ],
			color,
			alpha: 0.85 + r() * 0.15,
			spread: 0.6 + r() * 1.2,
		};
	}

	drip( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		// Drips run from where paint is fresh and thick.
		const l = w.senses.loudest( 0.15 );
		const p =
			r() < 0.6
				? [ l.x + ( r() - 0.5 ) * 0.1, l.y + ( r() - 0.5 ) * 0.1 ]
				: where.p;
		return {
			type: 'drip',
			x: p[ 0 ],
			y: p[ 1 ],
			len: 0.05 + Math.pow( r(), 1.5 ) * 0.3,
			width: 0.003 + r() * 0.008,
			color,
			alpha: 0.85 + r() * 0.15,
		};
	}

	scrape( item, where, size ) {
		const w = this.world;
		const r = w.rng;
		const l = w.senses.loudest( 0.2 );
		const p = [ l.x + ( r() - 0.5 ) * 0.12, l.y + ( r() - 0.5 ) * 0.12 ];
		return {
			type: 'scrape',
			x: p[ 0 ],
			y: p[ 1 ],
			angle: where.angle,
			len: size * ( 1.5 + r() * 2 ),
			width: size * ( 0.4 + r() * 0.6 ),
			alpha: 0.7 + r() * 0.3,
		};
	}

	glaze( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		if ( 'mass' === item.region && where.mass ) {
			const m = where.mass;
			// A glaze mixes as pigment with what is under it.
			const a = range( item.alpha, r, 0.15 );
			return {
				type: 'glaze',
				x: m.cx - m.rx * 1.3,
				y: m.cy - m.ry * 1.3,
				w: m.rx * 2.6,
				h: m.ry * 2.6,
				color: w.glazeColor(
					color,
					w.underAt( [ m.cx, m.cy ] ),
					Math.min( 1, a * 2 )
				),
				alpha: Math.min( 0.35, a * 2 ),
				blend: item.blend || 'multiply',
				soft: !! item.soft,
			};
		}
		return {
			type: 'glaze',
			color,
			alpha: range( item.alpha, r, 0.1 ),
			blend: item.blend || 'multiply',
			soft: !! item.soft,
		};
	}

	band( item ) {
		const w = this.world;
		const r = w.rng;
		const bands = w.plan.bands.length
			? w.plan.bands
			: [ { y0: 0, y1: 1, value: 0.5 } ];
		const b = bands[ w.bandIndex % bands.length ];
		w.bandIndex++;
		const pal = w.palette;
		const byL = pal.list.slice().sort( ( p, q ) => lum( p ) - lum( q ) );
		let c =
			byL[
				Math.min( byL.length - 1, Math.floor( b.value * byL.length ) )
			];
		if ( 'lit' === item.color ) {
			c = shade( c, 0.2 );
		} else if ( 'light' === item.color ) {
			c = pal.light;
		}
		c = jitter( c, r, 0.05 );
		const inset = 0.02 + r() * 0.06;
		const h = ( b.y1 - b.y0 ) * ( 0.8 + r() * 0.15 );
		return {
			type: 'shape',
			kind: 'rect',
			x: w.aspect / 2 + ( r() - 0.5 ) * 0.03,
			y: ( b.y0 + b.y1 ) / 2,
			w: w.aspect * ( 1 - inset * 2 ),
			h,
			angle: 0,
			color: c,
			alpha: range( item.alpha, r, 0.3 ),
			soft: item.soft || 5,
			softReach: 0.08 + r() * 0.12,
		};
	}

	gridline( item, color ) {
		const w = this.world;
		const r = w.rng;
		const lines = w.plan.lines || [];
		const todo = lines
			.map( ( l, i ) => i )
			.filter( ( i ) => ! w.drawnLines.has( i ) );
		if ( ! todo.length ) {
			return null;
		}
		const i = todo[ Math.floor( r() * todo.length ) ];
		w.drawnLines.add( i );
		const l = lines[ i ];
		const width = range( item.width, r, 0.01 );
		const a =
			'v' === l.axis
				? [ l.at, Math.max( 0, l.from - 0.02 ) ]
				: [ Math.max( 0, l.from - 0.02 ), l.at ];
		const b =
			'v' === l.axis
				? [ l.at, Math.min( 1, l.to + 0.02 ) ]
				: [ Math.min( w.aspect, l.to + 0.02 ), l.at ];
		return {
			type: 'line',
			pts: linePath( a, b, width, { rng: r, wobble: 0 } ),
			color,
			alpha: 1,
			width,
		};
	}

	cell( item, color ) {
		const w = this.world;
		const r = w.rng;
		const cells = w.plan.cells || [];
		const todo = cells
			.map( ( c, i ) => i )
			.filter( ( i ) => ! w.filledCells.has( i ) );
		if (
			! todo.length ||
			w.filledCells.size >= Math.ceil( cells.length * 0.4 )
		) {
			return null;
		}
		const i = todo[ Math.floor( r() * todo.length ) ];
		w.filledCells.add( i );
		const c = cells[ i ];
		const m = 0.006;
		return {
			type: 'shape',
			kind: 'rect',
			x: c.x + c.w / 2,
			y: c.y + c.h / 2,
			w: Math.max( 0.01, c.w - m ),
			h: Math.max( 0.01, c.h - m ),
			angle: 0,
			color,
			alpha: 1,
			edge: 'crisp',
		};
	}

	opline( item, color ) {
		const w = this.world;
		const r = w.rng;
		const i = w.opIndex++;
		const width = range( item.width, r, 0.006 );
		const warp = w.opWarp;
		const pts = [];
		if ( w.plan.pole ) {
			const rad = ( i + 1 ) * warp.spacing;
			if ( rad > 1.6 ) {
				return null;
			}
			const n = 90;
			for ( let k = 0; k <= n; k++ ) {
				const a = ( k / n ) * TAU;
				const rr =
					rad *
					( 1 +
						warp.amp *
							Math.sin( a * warp.k + warp.phi + i * 0.15 ) );
				pts.push( {
					x: w.plan.pole.x + Math.cos( a ) * rr,
					y: w.plan.pole.y + Math.sin( a ) * rr,
					w: width,
					t: k / n,
					speed: 0.5,
					dry: 0,
				} );
			}
		} else {
			const y = i * warp.spacing - 0.02;
			if ( y > 1.05 ) {
				return null;
			}
			const n = 80;
			for ( let k = 0; k <= n; k++ ) {
				const x = ( k / n ) * w.aspect;
				const d = Math.hypot( x - w.plan.focal.x, y - w.plan.focal.y );
				const bump =
					warp.amp *
					2 *
					Math.exp( -d * d * 9 ) *
					Math.sin( d * warp.k * 4 + warp.phi );
				pts.push( {
					x,
					y: y + bump,
					w: width,
					t: k / n,
					speed: 0.5,
					dry: 0,
				} );
			}
		}
		return { type: 'line', pts, color, alpha: 1, width };
	}

	ray( item, color ) {
		const w = this.world;
		const r = w.rng;
		const pole = w.plan.pole || w.plan.focal;
		const i = w.rayIndex++;
		const a = i * 2.39996 + r() * 0.2;
		const len = 0.4 + r() * 0.9;
		const pts = [];
		const n = 24;
		const width = 0.004 + r() * 0.014;
		for ( let k = 0; k <= n; k++ ) {
			const t = k / n;
			const p = inFrame(
				w,
				[
					pole.x + Math.cos( a ) * len * t,
					pole.y + Math.sin( a ) * len * t,
				],
				0.05
			);
			pts.push( {
				x: p[ 0 ],
				y: p[ 1 ],
				w: width * ( 1.2 - t ),
				t,
				speed: 0.6,
				dry: t * 0.6,
			} );
		}
		return {
			type: 'stroke',
			pts,
			tip: 'flat',
			color,
			alpha: range( item.alpha, r, 0.8 ),
			dry: 0.4,
			stretch: 2.5,
		};
	}

	echoes( item, where, size, color ) {
		const w = this.world;
		const r = w.rng;
		const kinds = item.shapes || [ 'wedge' ];
		const kind = kinds[ Math.floor( r() * kinds.length ) % kinds.length ];
		const k = 3 + Math.floor( r() * 4 );
		const dir = w.plan.direction + ( r() - 0.5 ) * 0.4;
		const step = size * ( 0.35 + r() * 0.4 );
		// The engine draws one command per call; echoes are several
		// shapes, so this returns a batch the caller unrolls.
		const batch = [];
		for ( let i = 0; i < k; i++ ) {
			batch.push( {
				type: 'shape',
				kind,
				x: where.p[ 0 ] + Math.cos( dir ) * step * i,
				y: where.p[ 1 ] + Math.sin( dir ) * step * i,
				w: size * ( 0.7 + i * 0.12 ),
				h: size * ( 0.5 + i * 0.1 ),
				angle: dir,
				color: i
					? mix( color, w.palette.light, ( i / k ) * 0.5 )
					: color,
				alpha: range( item.alpha, r, 0.8 ) * ( 1 - ( i / k ) * 0.55 ),
				edge: 'crisp',
				sweep: 0.7,
			} );
		}
		return batch;
	}

	blob( item, where, size, color ) {
		const w = this.world;
		const motif = {
			kind: 'blob',
			curl: 0.5 + w.rng(),
			elong: 0.7 + w.rng() * 0.9,
			jag: w.rng() * 0.6,
			phi: w.rng() * TAU,
			phi2: w.rng() * TAU,
			profile: 'taper',
		};
		const pts = [];
		const cs = Math.cos( where.angle );
		const sn = Math.sin( where.angle );
		for ( let i = 0; i < 40; i++ ) {
			const q = gesturePoint( motif, i / 40 );
			pts.push( [
				where.p[ 0 ] + ( q[ 0 ] * cs - q[ 1 ] * sn ) * size,
				where.p[ 1 ] + ( q[ 0 ] * sn + q[ 1 ] * cs ) * size,
			] );
		}
		w.blobs.push( where.p.slice() );
		while ( w.blobs.length > 30 ) {
			w.blobs.shift();
		}
		return {
			type: 'shape',
			kind: 'poly',
			pts,
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			w: size * 2,
			h: size * 2,
			color,
			alpha: range( item.alpha, w.rng, 1 ),
			edge: 'crisp',
		};
	}

	thread( item, where, color ) {
		const w = this.world;
		const r = w.rng;
		if ( w.blobs.length < 2 ) {
			return null;
		}
		const a = w.blobs[ Math.floor( r() * w.blobs.length ) ];
		let b = w.blobs[ Math.floor( r() * w.blobs.length ) ];
		if ( a === b ) {
			b = where.p;
		}
		const motif = drawMotif( r, [ 'scurve', 'arc', 'hook' ] );
		const d = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const ang = Math.atan2( b[ 1 ] - a[ 1 ], b[ 0 ] - a[ 0 ] );
		const width = range( item.width, r, 0.003 );
		const pts = handPath( motif, {
			at: [ ( a[ 0 ] + b[ 0 ] ) / 2, ( a[ 1 ] + b[ 1 ] ) / 2 ],
			angle: ang,
			scale: d / 2 / Math.max( 1, motif.elong ),
			width,
			rng: r,
			tremor: 0.35,
			haste: 0.4,
		} ).map( ( q ) => {
			const c = inFrame( w, [ q.x, q.y ] );
			return { ...q, x: c[ 0 ], y: c[ 1 ], w: width };
		} );
		return { type: 'line', pts, color, alpha: 1, width };
	}

	star( item, where, color ) {
		const r = this.world.rng;
		return {
			type: 'star',
			x: where.p[ 0 ],
			y: where.p[ 1 ],
			r: 0.01 + r() * 0.025,
			width: 0.002 + r() * 0.002,
			color,
			arms: r() < 0.5 ? 3 : 4,
		};
	}

	eye( item, where, color ) {
		const r = this.world.rng;
		const s = 0.02 + r() * 0.03;
		return [
			{
				type: 'shape',
				kind: 'circle',
				x: where.p[ 0 ],
				y: where.p[ 1 ],
				w: s,
				h: s * 0.7,
				color: this.world.palette.light,
				alpha: 1,
				edge: 'crisp',
				stroke: color,
				strokeW: 0.002,
			},
			{
				type: 'shape',
				kind: 'circle',
				x: where.p[ 0 ] + ( r() - 0.5 ) * s * 0.3,
				y: where.p[ 1 ],
				w: s * 0.35,
				h: s * 0.35,
				color,
				alpha: 1,
				edge: 'crisp',
			},
		];
	}

	seal( item, color ) {
		const w = this.world;
		const r = w.rng;
		if ( w.style.sealed ) {
			return null;
		}
		w.style.sealed = true;
		const s = 0.035 + r() * 0.02;
		const x = r() < 0.5 ? 0.06 + r() * 0.04 : w.aspect - 0.06 - r() * 0.04;
		const y = r() < 0.7 ? 0.9 - r() * 0.05 : 0.08 + r() * 0.04;
		return [
			{
				type: 'shape',
				kind: 'rect',
				x,
				y,
				w: s,
				h: s,
				angle: ( r() - 0.5 ) * 0.1,
				color,
				alpha: 0.9,
				edge: 'ragged',
				rag: 0.3,
			},
			{
				type: 'shape',
				kind: 'rect',
				x,
				y,
				w: s * 0.6,
				h: s * 0.6,
				angle: ( r() - 0.5 ) * 0.1,
				color: w.palette.light,
				alpha: 0.6,
				edge: 'ragged',
				rag: 0.6,
			},
		];
	}

	/** Build the command(s) for a vocabulary item. */
	make( item ) {
		const where = this.place( item );
		const color = this.colorFor( item.color || 'local', where );
		const size = this.sizeOf( item, where );
		switch ( item.kind ) {
			case 'brush':
				return this.brush( item, where, size, color );
			case 'brushContour':
				return this.brushContour( item, where, color );
			case 'blockin':
				return this.blockIn( item, where, size, color );
			case 'piece':
				return this.piece( item, where, size, color );
			case 'spray':
				return this.spray( item, where, size, color );
			case 'halftone':
				return this.halftone( item, where, size, color );
			case 'tesserae':
				return this.tesserae( item, where, size, color );
			case 'lead':
				return this.lead( item, where, size, color );
			case 'tendril':
				return this.tendril( item, where, size, color );
			case 'orbit':
				return this.orbit( item, where, size, color );
			case 'stroke':
				return this.stroke( item, where, size, color );
			case 'contour':
				return this.contour( item, where, color );
			case 'wash':
				return this.wash( item, where, size, color );
			case 'shape':
				return this.shape( item, where, size, color );
			case 'cut':
				return this.cut( item, where, size, color );
			case 'line':
				return this.line( item, where, size, color );
			case 'dots':
				return this.dots( item, where, size, color );
			case 'facet':
				return this.facet( item, where, size, color );
			case 'edge':
				return this.edge( item, where, color );
			case 'hatch':
				return this.hatch( item, where, size, color );
			case 'splatter':
				return this.splatter( item, where, size, color );
			case 'drip':
				return this.drip( item, where, color );
			case 'scrape':
				return this.scrape( item, where, size );
			case 'glaze':
				return this.glaze( item, where, color );
			case 'band':
				return this.band( item, color );
			case 'gridline':
				return this.gridline( item, color );
			case 'cell':
				return this.cell( item, color );
			case 'opline':
				return this.opline( item, color );
			case 'ray':
				return this.ray( item, color );
			case 'echoes':
				return this.echoes( item, where, size, color );
			case 'blob':
				return this.blob( item, where, size, color );
			case 'thread':
				return this.thread( item, where, color );
			case 'star':
				return this.star( item, where, color );
			case 'eye':
				return this.eye( item, where, color );
			case 'seal':
				return this.seal( item, color );
			default:
				return null;
		}
	}
}

/* ------------------------------ the characters ---------------------------- */

const ease = ( v, target, dt, k ) => v + ( target - v ) * Math.min( 1, dt * k );

/** Slides the heat between the palette's roles, throws accents, changes palettes. */
export class Colorist extends Actor {
	constructor( world, temper ) {
		super( world, temper );
		this.heatT = world.heat;
	}

	decide() {
		const w = this.world;
		this.heatT = w.rng();
		if ( w.rng() < 0.08 + 0.2 * w.params.chaos ) {
			w.accentUntil = w.time + 0.5 + w.rng() * 1.5;
		}
		if ( w.params.autoPalette && ( w.paletteJolt || w.rng() < 0.04 ) ) {
			w.paletteJolt = false;
			w.chronicle.push( { e: 'palette', t: w.time } );
			w.setColors( paletteFor( w.school.palette, w.rng ) );
			w.colorMasses();
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

/**
 * The critic: steps back from the easel and says what the picture needs.
 * Never paints. Reads at its own pace; the report lives on the world.
 */
export class Critic extends Actor {
	decide() {
		const w = this.world;
		if ( ! w.senses ) {
			return;
		}
		const c = critique( w );
		const before = w.critique;
		w.critique = c;
		if ( c.resolved && ! ( before && before.resolved ) ) {
			w.chronicle.push( { e: 'resolved', t: w.time, score: c.score } );
		}
	}
}

/** Rare, and it shows: impulses that bend the next gestures, or a burst of paint. */
export class Disruptor extends Actor {
	decide() {
		const w = this.world;
		const r = () => w.rng() * 2 - 1;
		const dir = [ r(), r() ];
		const len = Math.hypot( ...dir ) || 1;
		w.impulses.push( {
			pos: [ w.rng() * w.aspect, w.rng() ],
			dir: [ dir[ 0 ] / len, dir[ 1 ] / len ],
			power:
				( 0.002 + w.rng() * 0.01 ) *
				( 0.3 + w.params.energy ) *
				( 0.4 + this.verve ),
			dur: 0.5 + w.rng() * 2,
			age: 0,
		} );
		if ( w.impulses.length > 8 ) {
			w.impulses.shift();
		}
	}
}

/**
 * The restless one: re-tunes the temperament, swaps painters, and now
 * and then tears up the plan - the focal spot moves, the direction
 * turns, the palette may change, and the piece falls back into
 * building for a while.
 */
export class Restless extends Actor {
	constructor( world, temper ) {
		super( world, temper );
		this.lastBreak = 0;
	}

	act( dt ) {
		const w = this.world;
		const since = w.time - this.lastBreak;
		const hazard = dt * ( 0.0015 + since * 0.0004 );
		if ( since > 25 && w.rng() < hazard ) {
			this.lastBreak = w.time;
			if ( w.params.allowRecast ) {
				const moves = 1 + Math.floor( w.rng() * 3 );
				for ( let i = 0; i < moves; i++ ) {
					w.casting.push( {
						type: w.rng() < 0.5 ? 'retire' : 'hire',
					} );
				}
			}
			if ( w.params.autoPalette && w.rng() < 0.5 ) {
				w.paletteJolt = true;
			}
			w.tsTarget = w.rng() < 0.5 ? 0.3 : 1.5 + w.rng();
			const plan = w.plan;
			plan.focal = {
				x: 0.15 * w.aspect + w.rng() * 0.7 * w.aspect,
				y: 0.15 + w.rng() * 0.7,
			};
			plan.direction += ( w.rng() - 0.5 ) * 1.4;
			w.phaseFloorUntil = w.time + 8 + w.rng() * 10;
			w.scaleMul = clamp(
				w.scaleMul * ( 0.7 + w.rng() * 0.7 ),
				0.4,
				2.4
			);
			w.memes.splice( 0, Math.floor( w.memes.length / 2 ) );
			w.chronicle.push( { e: 'upheaval', t: w.time, moved: true } );
		}
		super.act( dt );
	}

	decide() {
		const w = this.world;
		if ( w.params.allowRecast && w.rng() < 0.4 ) {
			w.casting.push( { type: w.rng() < 0.45 ? 'retire' : 'hire' } );
			if ( w.casting.length > 6 ) {
				w.casting.shift();
			}
		}
		if ( w.params.autoTemper ) {
			const nudge = ( k, lo, hi, amt ) => {
				w.params[ k ] = clamp(
					w.params[ k ] + ( w.rng() - 0.5 ) * amt,
					lo,
					hi
				);
			};
			nudge( 'chaos', 0.05, 1, 0.24 );
			nudge( 'energy', 0.1, 1, 0.24 );
			nudge( 'tempo', 0.4, 2.4, 0.3 );
		}
	}
}
