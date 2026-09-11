/**
 * The flat world: a picture in the making, and everything the painters
 * are allowed to know about it.
 *
 * Same society rules as the stage in space: no actor reads another, the
 * world's warped clock runs everyone, the picture itself is the only
 * shared thing. What is different is what "the picture" means here - a
 * plan with masses and a focal spot, a palette with roles, a phase the
 * work is in, and a sense map of what is actually on the surface.
 */

import { drawPlan, ARCHETYPES } from './composition.js';
import { roles, pickPalette, shade, mix } from './palette2d.js';
import { drawSignature, refreshSignature } from './signature.js';
import { planFromMotif, paletteFromMotif, adaptPalette } from './motif.js';
import { ensembleSchools } from './ensemble.js';

// A school's `span` is its idea of one sitting in world seconds; the
// engine runs the world about five times faster than the wall clock
// (Thomas: nobody waits), so a sitting is stretched to stay a sitting.
const SPAN_MUL = 3;
// World seconds without a new mark that end the opening.
const OPENING_STALL = 5;
import { hexRgb } from '../core/palette.js';
import { SenseMap, lum } from './senses.js';

export const PHASES = [
	'opening',
	'building',
	'developing',
	'finishing',
	'resting',
];

/** Ground color from a school's ground spec and the palette. */
export function groundColor( spec, pal, rng ) {
	const tone = spec.tone || 'light';
	if ( 'white' === tone ) {
		return [ 0.965, 0.955, 0.93 ];
	}
	if ( 'light' === tone ) {
		return mix( pal.light, [ 0.97, 0.96, 0.93 ], 0.6 );
	}
	if ( 'palette-light' === tone ) {
		return shade( pal.light, 0.15, -0.3 );
	}
	if ( 'palette-dark' === tone ) {
		return shade( pal.dark, 0.05, -0.2 );
	}
	if ( 'dark' === tone ) {
		return mix( pal.dark, [ 0.08, 0.08, 0.09 ], 0.6 );
	}
	if ( 'tinted' === tone ) {
		const c = rng() < 0.5 ? pal.secondary : pal.dominant;
		return shade( c, 0.55, -0.55 );
	}
	// mid
	return shade( mix( pal.dominant, pal.neutral, 0.5 ), 0.1, -0.5 );
}

export class FlatWorld {
	constructor( {
		rng,
		params,
		aspect,
		school,
		colors,
		recent = null,
		motif = null,
		pigment = null,
		mixed = false,
		ensemble = [],
	} ) {
		this.rng = rng;
		// An ensemble on the sheet: every painter speaks another school;
		// the anchor school gives plan, palette and ground.
		this.mixed = !! mixed;
		// The editor's pigment mixer (Kubelka-Munk), for glazes and veils:
		// yellow over blue turns green, not grey. Absent, colors mix as light.
		this.pigment = pigment && pigment.makeMixer ? pigment : null;
		this.mixers = new Map();
		// A motif: a picture or a text read into maps and a plan; the
		// painters read it like a second sense. `reading` says how.
		this.motif = motif && motif.maps ? motif.maps : null;
		this.motifReading = ( motif && motif.reading ) || 'abstract';
		this.motifKind = ( motif && motif.kind ) || null;
		this.motifLikeness =
			motif && Number.isFinite( motif.likeness ) ? motif.likeness : 0.6;
		// Pieces cut from the motif, and a treater the session provides.
		this.pieces = ( motif && motif.pieces ) || [];
		this.treat = null;
		this.motifFine = ( motif && motif.fine ) || null;
		this.params = params; // { chaos, energy, density, tempo, colors, autoPalette, autoTemper, allowRecast }
		this.aspect = aspect;
		this.school = school;
		this.time = 0;
		this.wall = 0;
		this.timeScale = 0.7 + rng() * 0.6;
		this.tsTarget = this.timeScale;
		this.casting = [];
		this.emitted = [];
		this.impulses = [];
		this.cursor = { active: false, point: [ 0, 0 ], mode: 'attract' };
		// The visitor's three gestures, all visible: the hand over the
		// sheet draws the painters; a click is a burst of color there;
		// a drawn stroke is a call they answer along its path.
		this.burst = null; // { p, until }
		this.call = null; // { pts, until }
		this.heat = 0.5;
		this.accentUntil = -1;
		this.paletteJolt = false;
		this.memes = [];
		this.echo = null;
		this.chronicle = [];
		this.segments = 0;
		this.phase = 'opening';
		this.phaseMarks = 0;
		// World time of the last mark that landed: the opening ends when
		// the opener falls silent, not only by the clock.
		this.lastMarkAt = 0;
		this.openingDone = false;
		this.phaseFloorUntil = -1;
		// The piece's own hand, before anything else is drawn from it.
		this.signature = drawSignature( rng, school, params.chaos );
		const sig = this.signature;
		this.voice = school;
		this.shifted = false;
		this.setEnsemble( ensemble );
		// Sittings: the piece works, rests, and comes back to it - it is
		// never simply done; the visitor decides when it is.
		this.sitting = 1;
		this.sittingStart = 0;
		this.restUntil = -1;
		this.critique = null; // the critic's last report
		// One light per piece: masses get a lit side and a shadow side.
		const la =
			( school.light === undefined ? -2.2 : school.light ) +
			( rng() - 0.5 ) * 0.8;
		this.light = { angle: la, dir: [ Math.cos( la ), Math.sin( la ) ] };
		this.groundColor = null; // set by the session once the ground is laid
		this.finishBudget =
			'sparse' === sig.finish
				? 3 + Math.floor( rng() * 4 )
				: 'dense' === sig.finish
				? 14 + Math.floor( rng() * 10 )
				: 6 + Math.floor( rng() * 9 );
		// The palette with roles; the colorist may replace it mid-piece.
		const avoidModes = ( recent && recent.palettes ) || [];
		if ( colors && colors.length > 1 ) {
			this.paletteMode = 'given';
			this.setColors( colors );
		} else if (
			this.motif &&
			! school.paletteStrict &&
			'text' !== this.motifKind
		) {
			// The picture's own planes, bent toward the school's taste.
			this.paletteMode = 'motif';
			// The picture's planes, plus two of the school's own colors
			// so the accent and the dark stay the school's.
			const own = pickPalette( school, sig, rng, avoidModes ).colors;
			this.setColors(
				adaptPalette(
					paletteFromMotif( this.motif, 5 ),
					school.palette
				).concat( own.slice( 0, 2 ) )
			);
		} else {
			const pal = pickPalette( school, sig, rng, avoidModes );
			this.paletteMode = pal.mode;
			this.setColors( pal.colors );
		}
		// The plan: masses with roles, each with a color from the roles.
		const pref = { ...( school.plan || {} ) };
		pref.avoid = ( recent && recent.archetypes ) || [];
		if ( sig.extraArchetype ) {
			const listed = pref.archetypes
				? Object.keys( pref.archetypes )
				: [];
			const outside = ARCHETYPES.filter(
				( a ) => ! listed.includes( a )
			);
			if ( listed.length && outside.length ) {
				pref.extra = outside[ Math.floor( rng() * outside.length ) ];
			}
		}
		this.plan = this.motif
			? planFromMotif( this.motif, aspect, rng, sig )
			: drawPlan( rng, aspect, pref );
		if (
			this.motif &&
			'text' === this.motifKind &&
			'clear' === this.motifReading
		) {
			// Keep the letters clear: the picture is everything around
			// them, one broad mass; the letters emerge as what is left.
			this.plan.masses = [
				{
					cx: aspect / 2,
					cy: 0.5,
					rx: aspect * 0.62,
					ry: 0.62,
					angle: 0,
					shape: 'soft',
					value: 0.45,
					role: 'dominant',
				},
			];
			this.plan.coverage = 0.95;
		}
		this.plan.coverage = Math.max(
			0.05,
			Math.min(
				1,
				this.plan.coverage * ( this.motif ? 1 : sig.coverage )
			)
		);
		if ( sig.margin ) {
			this.plan.frameMargin = sig.margin;
		}
		if ( sig.hero && this.plan.masses.length > 1 ) {
			// One element outranks the rest: the largest mass grows and
			// takes the accent.
			const big = this.plan.masses.reduce( ( a, m ) =>
				( m.rx || 0 ) * ( m.ry || 0 ) > ( a.rx || 0 ) * ( a.ry || 0 )
					? m
					: a
			);
			big.rx = ( big.rx || 0.1 ) * 1.5;
			big.ry = ( big.ry || 0.1 ) * 1.5;
			big.hero = true;
			big.role = 'accent';
		}
		this.colorMasses();
		this.senses = new SenseMap( aspect, 36 );
		this.needs = null;
		// Cubist axes: a few global directions the facets obey.
		const n = school.axes || 0;
		this.axes = [];
		for ( let i = 0; i < n; i++ ) {
			this.axes.push( ( i / n ) * Math.PI + ( rng() - 0.5 ) * 0.4 );
		}
		this.facets = [];
		this.blobs = [];
		this.drawnLines = new Set();
		this.filledCells = new Set();
		this.opIndex = 0;
		this.rayIndex = 0;
		this.bandIndex = 0;
		this.opWarp = {
			k: 2 + Math.floor( rng() * 4 ),
			amp: 0.02 + rng() * 0.08,
			phi: rng() * Math.PI * 2,
			spacing: 0.018 + rng() * 0.02,
		};
		this.scaleMul = sig.scaleMul;
		this.mixedScale = sig.mixedScale;
		this.style = {};
	}

	/**
	 * The color a glaze of `color` at `alpha` leaves over `under`, as
	 * pigment would mix it. Mixers are cached per (quantised) color.
	 */
	glazeColor( color, under, alpha ) {
		if ( ! this.pigment || ! under ) {
			return mix( under || color, color, alpha );
		}
		const q = ( v ) =>
			Math.round( Math.max( 0, Math.min( 1, v ) ) * 31 ) / 31;
		const key = [ q( color[ 0 ] ), q( color[ 1 ] ), q( color[ 2 ] ) ].join(
			','
		);
		let mixer = this.mixers.get( key );
		if ( ! mixer ) {
			const hex =
				'#' +
				[ q( color[ 0 ] ), q( color[ 1 ] ), q( color[ 2 ] ) ]
					.map( ( v ) =>
						Math.round( v * 255 )
							.toString( 16 )
							.padStart( 2, '0' )
					)
					.join( '' );
			mixer = this.pigment.makeMixer( hex );
			if ( this.mixers.size > 64 ) {
				this.mixers.clear();
			}
			this.mixers.set( key, mixer );
		}
		const out = [ 0, 0, 0 ];
		mixer( under[ 0 ], under[ 1 ], under[ 2 ], alpha, out );
		return out;
	}

	/** The color on the sheet at a point, as the senses last saw it. */
	underAt( p ) {
		const s = this.senses;
		if ( ! s || ! s.rgb ) {
			return this.groundColor || null;
		}
		const i = s.index( p[ 0 ], p[ 1 ] );
		return [ s.rgb[ i * 3 ], s.rgb[ i * 3 + 1 ], s.rgb[ i * 3 + 2 ] ];
	}

	/** Guests and changes of voice stay inside a visitor's chosen ensemble. */
	setEnsemble( ids ) {
		this.ensembleSchools = ensembleSchools( ids );
		this.limitVoices();
	}

	limitVoices() {
		const pool = this.ensembleSchools || [];
		if ( ! pool.length ) {
			return;
		}
		if ( ! pool.some( ( s ) => s.id === this.voice.id ) ) {
			this.voice = pool[ 0 ];
		}
		const others = pool.filter( ( s ) => s.id !== this.voice.id );
		for ( const key of [ 'guest', 'shift' ] ) {
			const voice = this.signature[ key ];
			if ( voice && ! pool.some( ( s ) => s.id === voice.id ) ) {
				this.signature[ key ] =
					others[ Math.floor( this.rng() * others.length ) ] || null;
			}
		}
	}

	setColors( hexes ) {
		this.params.colors = hexes.slice();
		this.palette = roles( hexes );
	}

	/** Give every mass a color by its role and the value key. */
	colorMasses() {
		const p = this.palette;
		const key = this.plan.valueKey;
		const r = this.rng;
		for ( const m of this.plan.masses ) {
			let c;
			if ( m.motifRgb ) {
				// A mass read from a picture takes the palette color
				// nearest its own, then its own light.
				let best = p.list[ 0 ];
				let bd = Infinity;
				for ( const cand of p.list ) {
					const d = Math.hypot(
						cand[ 0 ] - m.motifRgb[ 0 ],
						cand[ 1 ] - m.motifRgb[ 1 ],
						cand[ 2 ] - m.motifRgb[ 2 ]
					);
					if ( d < bd ) {
						bd = d;
						best = cand;
					}
				}
				m.color = shade( best, ( m.value - lum( best ) ) * 0.8 );
				continue;
			}
			if ( 'dominant' === m.role ) {
				c = p.dominant;
			} else if ( 'secondary' === m.role ) {
				c = r() < 0.6 ? p.secondary : p.dominant;
			} else if ( 'counter' === m.role ) {
				c = r() < 0.7 ? p.accent : p.secondary;
			} else {
				c = p.accent;
			}
			if ( 'band' === m.shape ) {
				// Bands take colors by their planned value.
				const byL = p.list
					.slice()
					.sort( ( a, b ) => lum( a ) - lum( b ) );
				c =
					byL[
						Math.min(
							byL.length - 1,
							Math.floor( m.value * byL.length )
						)
					];
			}
			if ( 'low' === key ) {
				c = shade( c, -0.15 );
			} else if ( 'high' === key && 'accent' !== m.role ) {
				c = shade( c, 0.12 );
			}
			m.color = c;
		}
	}

	/** A meme (finished gesture) joins the living fashion. */
	postMeme( motif ) {
		this.memes.push( { ...motif } );
		while ( this.memes.length > 12 ) {
			this.memes.shift();
		}
	}

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

	/** Forces at a point: impulses and the visitor's pointer. */
	forceAt( p ) {
		let fx = 0;
		let fy = 0;
		for ( const im of this.impulses ) {
			const dx = p[ 0 ] - im.pos[ 0 ];
			const dy = p[ 1 ] - im.pos[ 1 ];
			const d2 = dx * dx + dy * dy + 0.01;
			const fade = 1 - im.age / im.dur;
			const k = ( im.power * fade ) / d2;
			fx += dx * k + im.dir[ 0 ] * k * 0.5;
			fy += dy * k + im.dir[ 1 ] * k * 0.5;
		}
		const c = this.cursor;
		if ( c.active && 'off' !== c.mode ) {
			const dx = p[ 0 ] - c.point[ 0 ];
			const dy = p[ 1 ] - c.point[ 1 ];
			const d2 = dx * dx + dy * dy + 0.02;
			const k = 0.02 / d2;
			if ( 'attract' === c.mode ) {
				fx -= dx * k;
				fy -= dy * k;
			} else if ( 'repel' === c.mode ) {
				fx += dx * k * 1.6;
				fy += dy * k * 1.6;
			} else {
				fx += dy * k;
				fy -= dx * k;
			}
		}
		return [ fx, fy ];
	}

	/**
	 * A burst of color at a point: for a short while most painters work
	 * there, in the accent, without waiting their turn; the picture
	 * stays in the building phase a few seconds after.
	 */
	burstAt( p ) {
		const at = [
			Math.max( 0, Math.min( this.aspect, p[ 0 ] ) ),
			Math.max( 0, Math.min( 1, p[ 1 ] ) ),
		];
		this.burst = { p: at, until: this.time + 1.8 };
		this.accentUntil = this.time + 2;
		this.phaseFloorUntil = Math.max( this.phaseFloorUntil, this.time + 6 );
		this.impulses.push( {
			pos: at,
			dir: [ 0, 0 ],
			power: 0.03,
			dur: 1.5,
			age: 0,
		} );
		this.chronicle.push( { e: 'burst', t: this.time } );
		return at;
	}

	/**
	 * Call and response: the visitor drew a stroke on the sheet. It is
	 * read as a gesture - how it turns, how long it is, how jagged - and
	 * posted as a meme three times over, with an echo at its place, so
	 * the responders take it up in the school's own words.
	 */
	answerCall( pts ) {
		if ( ! pts || pts.length < 4 ) {
			return null;
		}
		let len = 0;
		let turn = 0;
		let absTurn = 0;
		let prevA = null;
		let flips = 0;
		let prevSign = 0;
		for ( let i = 1; i < pts.length; i++ ) {
			const dx = pts[ i ][ 0 ] - pts[ i - 1 ][ 0 ];
			const dy = pts[ i ][ 1 ] - pts[ i - 1 ][ 1 ];
			const d = Math.hypot( dx, dy );
			if ( d < 0.002 ) {
				continue;
			}
			len += d;
			const a = Math.atan2( dy, dx );
			if ( prevA !== null ) {
				let da = a - prevA;
				da = Math.atan2( Math.sin( da ), Math.cos( da ) );
				turn += da;
				absTurn += Math.abs( da );
				const sign = Math.sign( da );
				if (
					sign &&
					prevSign &&
					sign !== prevSign &&
					Math.abs( da ) > 0.25
				) {
					flips++;
				}
				if ( sign ) {
					prevSign = sign;
				}
			}
			prevA = a;
		}
		if ( len < 0.03 ) {
			return null;
		}
		const xs = pts.map( ( p ) => p[ 0 ] );
		const ys = pts.map( ( p ) => p[ 1 ] );
		const bw = Math.max( ...xs ) - Math.min( ...xs );
		const bh = Math.max( ...ys ) - Math.min( ...ys );
		const jag = Math.min( 1, flips / 6 );
		let kind;
		if ( jag > 0.5 ) {
			kind = 'zigzag';
		} else if ( Math.abs( turn ) < 0.6 && absTurn < 1.2 ) {
			kind = 'slash';
		} else if ( flips >= 1 && Math.abs( turn ) < 1.5 ) {
			kind = 'scurve';
		} else if ( Math.abs( turn ) < 2.2 ) {
			kind = 'arc';
		} else {
			kind = 'hook';
		}
		const first = pts[ 0 ];
		const last = pts[ pts.length - 1 ];
		const phi = Math.atan2(
			last[ 1 ] - first[ 1 ],
			last[ 0 ] - first[ 0 ]
		);
		const motif = {
			kind,
			curl: Math.max( 0.3, Math.min( 1.7, Math.abs( turn ) / 2 + 0.3 ) ),
			elong: Math.max(
				0.6,
				Math.min(
					2.4,
					( Math.max( bw, bh ) /
						Math.max( 0.02, Math.min( bw, bh ) ) ) *
						0.6
				)
			),
			jag,
			phi,
			phi2: phi + Math.PI / 2,
			span: Math.max( 0.05, Math.min( 0.6, len ) ),
			fromCall: true,
		};
		// Three times: the fashion tips toward the visitor's word.
		for ( let i = 0; i < 3; i++ ) {
			this.postMeme( motif );
		}
		const mid = pts[ Math.floor( pts.length / 2 ) ];
		this.echo = { p: [ mid[ 0 ], mid[ 1 ] ], angle: phi, t: this.time };
		this.accentUntil = this.time + 1.2;
		// For a few seconds the painters answer ALONG the stroke.
		this.call = {
			pts: pts.map( ( q ) => [ q[ 0 ], q[ 1 ] ] ),
			until: this.time + 3.5,
		};
		this.chronicle.push( { e: 'call', t: this.time, kind } );
		return motif;
	}

	/** Where the pointer is (frame units), if it is over the picture. */
	cursorPoint() {
		return this.cursor.active ? this.cursor.point : null;
	}

	/** Read the phase off the picture. Called after the senses refresh. */
	updatePhase() {
		const s = this.senses;
		const cov = s.coverage();
		const target = Math.max( 0.05, this.plan.coverage );
		// Coverage OR time: a picture of thin lines never covers much, and
		// a picture must still mature. `span` is the school's idea of a
		// full sitting in world seconds.
		const span = ( this.school.span || 110 ) * SPAN_MUL;
		const f = Math.max(
			cov / target,
			( this.time - this.sittingStart ) / span
		);
		const ph = this.school.phases || {};
		const o = ph.opening === undefined ? 0.3 : ph.opening;
		const b = ph.building === undefined ? 0.65 : ph.building;
		const d = ph.developing === undefined ? 0.9 : ph.developing;
		let next;
		if ( f < o || ( this.phaseMarks < 2 && 'opening' === this.phase ) ) {
			next = 'opening';
		} else if ( f < b ) {
			next = 'building';
		} else if ( f < d ) {
			next = 'developing';
		} else {
			next = 'finishing';
		}
		// The ground is laid when the opener falls silent. A slow school
		// (De Stijl: two to four painters at half tempo, the others waiting
		// for the ground) would otherwise sit in the opening for a hundred
		// world seconds with ten marks on the sheet and nothing happening.
		// The phases are recomputed from f every time, so the end of the
		// opening has to stick, or the piece would flap between the two.
		if (
			'opening' === next &&
			this.phaseMarks >= 2 &&
			this.time - this.lastMarkAt > OPENING_STALL
		) {
			this.openingDone = true;
		}
		if ( 'opening' !== next ) {
			this.openingDone = true;
		} else if ( this.openingDone ) {
			next = 'building';
		}
		// An upheaval holds the piece in the building phase for a while.
		if ( this.time < this.phaseFloorUntil && PHASES.indexOf( next ) > 1 ) {
			next = 'building';
		}
		// The developing phase has a budget of marks: past it, only the
		// finishing hands work - a picture is not improved by more of the
		// same, it is buried by it (Thomas: "bunter Matschmix").
		const developBudget = Math.round(
			( ( ( this.school.tempo && this.school.tempo.developBudget ) ||
				180 ) *
				( 0.6 + ( this.params.density || 0.5 ) ) ) /
				Math.min( 3, this.sitting )
		);
		if (
			'developing' === this.phase &&
			'developing' === next &&
			this.phaseMarks >= developBudget
		) {
			next = 'finishing';
		}
		// Finishing spends its budget, then the piece rests; the restless
		// one can wake it up again.
		// The critic can end the finishing early: a resolved picture
		// takes no more marks than it needs.
		const resolved = this.critique && this.critique.resolved;
		if (
			'finishing' === this.phase &&
			( this.phaseMarks >= this.finishBudget ||
				( resolved && this.phaseMarks >= 2 ) ) &&
			'finishing' === next
		) {
			next = 'resting';
		}
		if ( 'resting' === this.phase && 'finishing' === next ) {
			next = 'resting';
			if ( this.restUntil < 0 ) {
				// Later sittings rest longer: a picture that has found its
				// form is looked at more than touched.
				const late = Math.min( 3, this.sitting - 1 );
				this.restUntil =
					this.time +
					20 +
					this.rng() * 30 +
					late * ( 25 + this.rng() * 25 );
			} else if ( this.time >= this.restUntil ) {
				// The next sitting: back to the picture with a slightly
				// different hand, a little more to cover, a fresh finish.
				this.sitting++;
				this.sittingStart = this.time;
				this.openingDone = false;
				this.restUntil = -1;
				this.plan.coverage = Math.min( 1, this.plan.coverage + 0.04 );
				this.finishBudget = Math.max(
					3,
					Math.floor(
						( 6 + this.rng() * 9 ) / Math.min( 3, this.sitting )
					)
				);
				refreshSignature( this.signature, this.rng, this.school );
				this.limitVoices();
				this.chronicle.push( {
					e: 'sitting',
					t: this.time,
					n: this.sitting,
				} );
				next = 'developing';
			}
		}
		if ( next !== this.phase ) {
			this.chronicle.push( { e: 'phase', t: this.time, phase: next } );
			this.phase = next;
			this.phaseMarks = 0;
			// A piece that changes its mind: from the developing phase on
			// it speaks another school's words, on the same plan and palette.
			const sig = this.signature;
			if (
				sig &&
				sig.shift &&
				! this.shifted &&
				PHASES.indexOf( next ) >= 2
			) {
				this.shifted = true;
				this.voice = sig.shift;
				this.chronicle.push( {
					e: 'school',
					t: this.time,
					id: sig.shift.id,
				} );
			}
		}
		this.coverage = cov;
	}

	/** One frame: wall time in, warped time to the actors. */
	step( dtWall, actors ) {
		// The engine hands in wall time times its pace; the cap only
		// catches a tab that slept, never a fast normal frame.
		const dw = Math.min( 0.6, Math.max( 0, dtWall ) );
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
			this.senses.fade( dt );
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

/** Tones a ground may take instead of its own, now and then. */
const TONE_VARIANTS = {
	white: [ 'light', 'palette-light' ],
	light: [ 'white', 'palette-light', 'tinted' ],
	'palette-light': [ 'light', 'tinted' ],
	'palette-dark': [ 'dark', 'mid' ],
	dark: [ 'palette-dark', 'mid' ],
	tinted: [ 'palette-light', 'light' ],
	mid: [ 'tinted', 'palette-dark' ],
};

/** The ground spec for the stage from a school and a world. */
export function groundSpec( world ) {
	const own = world.school.ground || {};
	let g = own;
	const alts = own.tones || TONE_VARIANTS[ own.tone || 'light' ] || [];
	if ( alts.length && world.rng() < 0.3 ) {
		g = { ...own, tone: alts[ Math.floor( world.rng() * alts.length ) ] };
	}
	const color = groundColor( g, world.palette, world.rng );
	if ( 'underpaint' === world.motifReading && world.motifImage ) {
		// The picture stays under the marks, quietened.
		return {
			color,
			paper: g.paper || 'paper',
			grain: g.grain === undefined ? 0.3 : g.grain,
			image: world.motifImage,
			imageAlpha: 0.75,
		};
	}
	const spec = {
		color,
		paper: g.paper || 'paper',
		grain: g.grain === undefined ? 0.3 : g.grain,
	};
	if ( g.wash ) {
		const p = world.palette;
		const a = world.rng() < 0.5 ? p.light : p.secondary;
		const b = world.rng() < 0.5 ? p.dominant : p.dark;
		spec.wash = {
			from: shade( a, 0.3, -0.4 ),
			to: shade( b, 0.15, -0.5 ),
			alpha: 0.28 + world.rng() * 0.2,
			angle: Math.PI / 2 + ( world.rng() - 0.5 ) * 0.6,
		};
	}
	return spec;
}

export const hex = hexRgb;
