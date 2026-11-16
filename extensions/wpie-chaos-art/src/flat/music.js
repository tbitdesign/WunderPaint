/**
 * Painting to a song: the conductor.
 *
 * A song is the visitor's fourth gesture. Like the hand over the sheet,
 * the click and the drawn stroke, it reaches the painters only through
 * the world: the conductor reads the song at song time and writes what a
 * painter may know - how loud it is now, whether a beat is falling,
 * whether the music has gone quiet - and it moves the dials, the scale,
 * the clock and the accents the way the characters do without a song
 * (they stand aside while one plays). No actor reads another, and no
 * painter reads the conductor.
 *
 * At birth the song bends the piece's hand (bendSignature): a percussive
 * song favors strikes and short words, a legato song arcs and long ones,
 * a full song covers more, a bright one runs warm. That is what stays
 * visible in the still, long after the last note - the timing is gone by
 * then, the hand is not.
 *
 * The song itself never travels with the piece: only its analysis lives
 * here, and only while the dialog is open.
 */
import { songAt, PULSE } from '../../../shared/audio/song.js';

/** Gestures that strike, and gestures that carry. */
export const PERCUSSIVE_GESTURES = [ 'slash', 'zigzag', 'hook' ];
export const LEGATO_GESTURES = [ 'arc', 'scurve', 'loop', 'line' ];

// Words of the vocabulary by attack: dabs, dots and spatters land; washes,
// lines and threads are drawn out.
const SHORT_KINDS = new Set( [
	'dots',
	'splatter',
	'spray',
	'hatch',
	'drip',
	'star',
	'tesserae',
	'cell',
	'halftone',
	'cut',
	'scrape',
	'seal',
	'eye',
] );
const LONG_KINDS = new Set( [
	'wash',
	'glaze',
	'line',
	'tendril',
	'band',
	'orbit',
	'thread',
	'contour',
	'opline',
	'ray',
	'echoes',
	'edge',
	'gridline',
	'lead',
] );

// Below this the music has gone quiet: the painters hold still.
const HUSH = 0.07;
// The first fifth of a beat counts as "on the beat".
const BEAT_WINDOW = 0.2;
// Song seconds between two bursts: a drop is a moment, not a habit.
const BURST_GAP = 6;
// A section this much louder than the one before moves the piece.
const LIFT = 0.18;
// An accent this strong leaves a mark of its own, at most this often.
const STRIKE = 0.55;
const STRIKE_GAP = 0.25;

// Where the song's character starts to show: in the hand it bends and in
// the words that say what the painters heard. One table, so the words
// never claim what the hand did not do.
export const LEAN = {
	percussive: 0.6,
	flowing: 0.35,
	full: 0.66,
	sparse: 0.33,
	bright: 0.55,
	dark: 0.4,
	loud: 0.6,
	quiet: 0.3,
};

/** Everything the dialog may say about a song, in the order it says it. */
export const HEARD_WORDS = [
	'loud',
	'quiet',
	'percussive',
	'flowing',
	'bright',
	'dark',
	'full',
	'sparse',
	'steady beat',
	'free pulse',
];

// A strike in the school's own words rather than one splatter for all:
// Sumi drops ink, Pointillism sets a nest of dots, the woodcut cuts, the
// geometric schools set a small shape, De Stijl a row of small squares on
// its lines, Action Painting splatters as it always does. A school missing
// here (or whose word went missing) strikes with its first short word,
// else a shape, else a brush.
export const STRIKE_WORDS = {
	impressionism: 'brush',
	postimpressionism: 'brush',
	pointillism: 'dots',
	expressionism: 'brush',
	fauvism: 'brush',
	cubism: 'facet',
	classicism: 'brush',
	bauhaus: 'shape',
	suprematism: 'shape',
	constructivism: 'shape',
	minimalism: 'shape',
	opart: 'shape',
	orphism: 'shape',
	stainedglass: 'shape',
	destijl: 'squares',
	action: 'splatter',
	informel: 'splatter',
	colorfield: 'brush',
	futurism: 'brush',
	sumi: 'dots',
	ukiyoe: 'dots',
	artnouveau: 'dots',
	biomorphic: 'star',
	collage: 'cut',
	popart: 'halftone',
	streetart: 'spray',
	mosaic: 'tesserae',
	woodcut: 'hatch',
};
// Words that go where a strike puts them. A drip runs from the wettest
// paint, a scrape takes paint away, a seal is set once, a cell is the
// grid's to choose.
const STRIKE_KINDS = new Set( [
	'brush',
	'dots',
	'splatter',
	'spray',
	'halftone',
	'tesserae',
	'hatch',
	'cut',
	'shape',
	'facet',
	'star',
] );
// The finishing hand's words first: a strike is a detail, not a plane.
const STRIKE_PHASES = [ 'finishing', 'developing', 'building', 'opening' ];

const clamp = ( v, lo, hi ) => Math.max( lo, Math.min( hi, v ) );
const clamp01 = ( v ) => clamp( Number.isFinite( v ) ? v : 0, 0, 1 );

/** How a word of the vocabulary attacks: +1 it lands, -1 it is drawn out. */
export function attackOf( item ) {
	if ( ! item ) {
		return 0;
	}
	if ( SHORT_KINDS.has( item.kind ) ) {
		return 1;
	}
	if ( LONG_KINDS.has( item.kind ) ) {
		return -1;
	}
	const g = item.gestures || [];
	if ( ! g.length ) {
		return 0;
	}
	let s = 0;
	for ( const k of g ) {
		if ( PERCUSSIVE_GESTURES.includes( k ) ) {
			s++;
		} else if ( LEGATO_GESTURES.includes( k ) ) {
			s--;
		}
	}
	return s / g.length;
}

/**
 * The song bends the piece's hand before the first mark. Deterministic:
 * it draws nothing from the piece's entropy, so the rest of the piece is
 * drawn exactly as it would be - only bent.
 *
 * @param {Object} sig    A signature from drawSignature (changed in place).
 * @param {Object} ch     The song's character (song.character).
 * @param {Object} school The school whose vocabulary the hand speaks.
 */
export function bendSignature( sig, ch, school ) {
	if ( ! sig || ! ch ) {
		return sig;
	}
	const pc = clamp01( ch.percussive );
	// Gestures: a percussive song strikes, a legato song draws arcs; in
	// between the piece keeps its own favorites.
	const all = new Set();
	for ( const phase of Object.keys( ( school && school.vocab ) || {} ) ) {
		for ( const it of school.vocab[ phase ] || [] ) {
			( it.gestures || [] ).forEach( ( g ) => all.add( g ) );
		}
	}
	const pick =
		pc >= LEAN.percussive
			? PERCUSSIVE_GESTURES
			: pc <= LEAN.flowing
			? LEGATO_GESTURES
			: null;
	if ( pick ) {
		const fav = [ ...all ].filter( ( g ) => pick.includes( g ) );
		if ( fav.length ) {
			sig.fav = fav;
		}
	}
	// Words: short ones for a percussive song, long ones for a legato
	// song. The piece's own dice are pressed toward even first, so the
	// song's lean is what shows; a word the piece never says stays unsaid.
	if ( sig.weights ) {
		const k = ( pc - 0.5 ) * 4.4;
		for ( const [ it, m ] of sig.weights ) {
			if ( m > 0 ) {
				const a = attackOf( it );
				sig.weights.set(
					it,
					Math.pow( m, 0.35 ) * ( a ? Math.exp( k * a ) : 1 )
				);
			}
		}
	}
	// Everything below is the song's alone, no dice: one song, one hand,
	// and wider than the dice ever reach, or it would look like chance.
	// How far it goes: a full song covers the sheet, a sparse one leaves it
	// mostly empty.
	const full = clamp01( ch.full );
	sig.finish =
		full >= LEAN.full ? 'dense' : full <= LEAN.sparse ? 'sparse' : 'full';
	sig.coverage = 0.35 + full;
	// Warm or cool, light or dark: a bright song runs warm and high in
	// key, a dark one cool and low.
	const bright = clamp01( ch.bright );
	sig.temperature = ( bright - 0.5 ) * 2;
	sig.key = ( bright - 0.5 ) * 0.5;
	// Hard or soft: a strike has an edge.
	sig.edge = 0.6 + 0.8 * pc;
	// Weight: a song with bass paints bigger; loud against soft, big marks
	// against small ones.
	sig.scaleMul = 0.7 + 0.7 * clamp01( ch.low );
	sig.mixedScale = clamp01( ch.dynamics ) > 0.5;
	return sig;
}

/**
 * What the painters heard, in words: only what bends the piece, at the
 * thresholds that bend it. How loud (how many hands, how long the rests),
 * how it attacks (strikes or arcs), how bright (warm or cool, the ground),
 * how full (how far the piece goes), and whether a beat is there to wait
 * for. A middling quality goes unsaid; the beat is always said.
 *
 * @param {Object} song An analysis from shared/audio/song.js.
 * @return {string[]} Words from HEARD_WORDS, in their order.
 */
export function heardWords( song ) {
	const ch = ( song && song.character ) || {};
	const beat = ( song && song.beat ) || {};
	const out = [];
	const say = ( v, hi, lo, up, down ) => {
		if ( v >= hi ) {
			out.push( up );
		} else if ( v <= lo ) {
			out.push( down );
		}
	};
	say( clamp01( ch.energy ), LEAN.loud, LEAN.quiet, 'loud', 'quiet' );
	say(
		clamp01( ch.percussive ),
		LEAN.percussive,
		LEAN.flowing,
		'percussive',
		'flowing'
	);
	say(
		Number.isFinite( ch.bright ) ? ch.bright : 0.5,
		LEAN.bright,
		LEAN.dark,
		'bright',
		'dark'
	);
	say( clamp01( ch.full ), LEAN.full, LEAN.sparse, 'full', 'sparse' );
	out.push(
		beat.confidence >= PULSE && beat.bpm > 0 ? 'steady beat' : 'free pulse'
	);
	return out;
}

/**
 * What a painter strikes with when a strong accent comes: the school's own
 * word (see STRIKE_WORDS), as big as the accent was strong but a size below
 * the school's big words, so a strike marks the picture without taking it
 * over; in the accent color; a brush with its striking gestures only.
 *
 * @param {Object} school The school the painter speaks.
 * @param {Object} st     The strike: { s } its strength.
 * @return {Object} A vocabulary item for the painter.
 */
export function strikeItem( school, st ) {
	const s = st && Number.isFinite( st.s ) ? st.s : 0.6;
	const word = strikeWord( school );
	const item = {
		...word,
		size: s >= 0.85 ? 'mid' : 'small',
		color: 'accent',
		strength: s,
	};
	if ( Array.isArray( word.gestures ) ) {
		const hits = word.gestures.filter( ( g ) =>
			PERCUSSIVE_GESTURES.includes( g )
		);
		if ( hits.length ) {
			item.gestures = hits;
		}
	}
	return item;
}

function strikeWord( school ) {
	const said = STRIKE_WORDS[ school && school.id ];
	if ( 'squares' === said ) {
		return { kind: 'squares' };
	}
	const vocab = ( school && school.vocab ) || {};
	const items = STRIKE_PHASES.flatMap( ( ph ) => vocab[ ph ] || [] );
	const find = ( ok ) =>
		items.find( ( it ) => STRIKE_KINDS.has( it.kind ) && ok( it ) );
	return (
		( said && find( ( it ) => said === it.kind ) ) ||
		find( ( it ) => attackOf( it ) > 0 ) ||
		find( ( it ) => 'shape' === it.kind ) ||
		find( ( it ) => 'brush' === it.kind ) || { kind: 'splatter' }
	);
}

/** Where the piece begins to finish, as a share of the song: its outro. */
export function arcOf( song ) {
	const d = Math.max( 1e-6, song.duration || 0 );
	const secs = song.sections || [];
	let finishing = 0.85;
	if ( secs.length > 2 ) {
		const last = secs[ secs.length - 1 ];
		const rest = secs.slice( 0, -1 );
		const loud =
			rest.reduce( ( a, s ) => a + ( s.loud || 0 ), 0 ) / rest.length;
		const start = last.start / d;
		// A quieter last section is the outro: the finishing hands take it.
		if (
			start >= 0.7 &&
			start <= 0.92 &&
			( last.loud || 0 ) < loud - 0.1
		) {
			finishing = start;
		}
	}
	return { finishing };
}

/**
 * The conductor. Created by the world when a piece is painted to a song;
 * stepped by the session with the song's own clock.
 */
export class Conductor {
	/**
	 * @param {Object} world The flat world (gets `music`).
	 * @param {Object} song  An analysis from shared/audio/song.js, plus `title`.
	 */
	constructor( world, song ) {
		this.world = world;
		this.song = song;
		const p = world.params;
		this.base = {
			energy: Number.isFinite( p.energy ) ? p.energy : 0.5,
			chaos: Number.isFinite( p.chaos ) ? p.chaos : 0.5,
			tempo: Number.isFinite( p.tempo ) ? p.tempo : 1,
		};
		const beat = song.beat || {};
		this.grid = beat.confidence >= PULSE && beat.bpm > 0;
		this.period = this.grid ? 60 / beat.bpm : 0;
		this.first = this.grid ? beat.first || 0 : 0;
		// A slow song is also painted on its eighths: waiting a whole slow
		// beat for every mark halved the painters' marks (measured at 70 BPM).
		this.slot = this.grid
			? this.period > 0.6
				? this.period / 2
				: this.period
			: 0;
		this.window = this.grid
			? clamp( this.slot * BEAT_WINDOW, 0.06, 0.12 )
			: 0;
		// A faster song, a faster hand - within reason.
		this.tempoMul = this.grid ? clamp( beat.bpm / 115, 0.8, 1.3 ) : 1;
		this.baseScale = world.scaleMul || 1;
		const ch = song.character || {};
		// The song's absolute level: a quiet sonata paints with fewer hands,
		// less often and with longer rests than a techno track.
		this.level = 0.3 + 1.2 * clamp01( ch.energy );
		const full = clamp01( ch.full );
		if ( Number.isFinite( p.density ) ) {
			p.density = clamp( p.density * ( 0.3 + 1.4 * full ), 0.05, 1 );
		}
		this.lastStrike = -Infinity;
		this.wrote = {};
		this.ai = 0;
		this.si = 0;
		this.prev = 0;
		this.lastBurst = -Infinity;
		world.music = {
			title: song.title || '',
			duration: song.duration || 0,
			t: 0,
			progress: 0,
			ended: false,
			grid: this.grid,
			onBeat: false,
			hush: false,
			loud: 0,
			low: 0.5,
			air: 0.5,
			bright: 0.5,
			busy: 0,
			arc: arcOf( song ),
			// A lift in the music, news for a piece that rests.
			wake: false,
			// Strong accents waiting for a free hand: { s, bright, at }.
			strikes: [],
			// A sparse song rests longer between its sittings.
			restMul: 0.6 + 1.6 * ( 1 - full ),
			character: ch,
		};
		world.chronicle.push( { e: 'song', title: song.title || '' } );
		this.dials( songAt( song, 0 ) );
	}

	/** The song at song time t (seconds): read it and write the world. */
	step( t ) {
		const w = this.world;
		const m = w.music;
		if ( m.ended ) {
			return;
		}
		const song = this.song;
		const d = song.duration || 0;
		const tt = clamp( Number.isFinite( t ) ? t : 0, 0, d );
		if ( tt < this.prev - 0.25 ) {
			this.rewind( tt );
		}
		const f = songAt( song, tt );
		m.t = tt;
		m.progress = d > 0 ? tt / d : 1;
		m.loud = f.loud;
		m.low = f.low;
		m.air = f.air;
		m.bright = f.bright;
		m.busy = f.busy;
		m.hush = f.loud < HUSH;
		m.onBeat =
			this.grid &&
			( ( ( tt - this.first ) % this.slot ) + this.slot ) % this.slot <
				this.window;
		this.dials( f );
		const acc = song.accents || { t: [], s: [] };
		while ( this.ai < acc.t.length && acc.t[ this.ai ] <= tt ) {
			const at = acc.t[ this.ai ];
			const s = acc.s[ this.ai ];
			this.ai++;
			// After a stall, old accents are history, not news.
			if ( at >= tt - 0.5 ) {
				this.accent( at, s, f );
			}
		}
		const secs = song.sections || [];
		while ( this.si < secs.length && secs[ this.si ].start <= tt ) {
			if ( this.si > 0 ) {
				this.section( secs[ this.si ], secs[ this.si - 1 ] );
			}
			this.si++;
		}
		this.prev = tt;
		if ( Number.isFinite( t ) && t >= d ) {
			this.finish();
		}
	}

	/**
	 * The dials follow the song around the visitor's own setting: a dial
	 * someone moved since the last frame becomes the new base.
	 */
	dials( f ) {
		const w = this.world;
		const p = w.params;
		for ( const k of [ 'energy', 'chaos' ] ) {
			if ( undefined !== this.wrote[ k ] && p[ k ] !== this.wrote[ k ] ) {
				this.base[ k ] = p[ k ];
			}
		}
		if ( undefined !== this.wrote.tempo && p.tempo !== this.wrote.tempo ) {
			this.base.tempo = p.tempo / this.tempoMul;
		}
		p.energy = clamp(
			this.base.energy * ( 0.3 + 1.4 * f.loud ) * this.level,
			0.03,
			1
		);
		p.chaos = clamp( this.base.chaos + 0.35 * ( f.busy - 0.4 ), 0, 1 );
		p.tempo = this.base.tempo * this.tempoMul;
		this.wrote = { energy: p.energy, chaos: p.chaos, tempo: p.tempo };
		// Bass weighs, air lifts, and a mark is as big as the moment is
		// loud: the song's dynamics become the picture's contrast. Loud
		// music also runs the clock a little faster.
		w.scaleMul = clamp(
			this.baseScale *
				( 0.8 + 0.45 * f.low - 0.2 * f.air ) *
				( 0.5 + f.loud ),
			0.3,
			2.6
		);
		w.tsTarget = 0.8 + 0.4 * f.loud;
	}

	/** An accent: a push in the paint; strong ones bring the accent color. */
	accent( at, s, f ) {
		const w = this.world;
		if ( s < 0.25 ) {
			return;
		}
		const r = w.rng;
		const fo = w.plan.focal;
		const p = [
			clamp(
				fo.x + ( r() - 0.5 ) * 0.35 * w.aspect,
				0.05,
				w.aspect - 0.05
			),
			clamp( fo.y + ( r() - 0.5 ) * 0.35, 0.05, 0.95 ),
		];
		const a = r() * Math.PI * 2;
		w.impulses.push( {
			pos: p,
			dir: [ Math.cos( a ), Math.sin( a ) ],
			power: ( 0.004 + 0.012 * s ) * ( 0.4 + f.loud ),
			dur: 0.6 + s,
			age: 0,
		} );
		if ( w.impulses.length > 12 ) {
			w.impulses.shift();
		}
		if ( s >= 0.6 ) {
			w.accentUntil = Math.max( w.accentUntil, w.time + 0.4 + 1.2 * s );
		}
		if ( s >= STRIKE && at - this.lastStrike >= STRIKE_GAP ) {
			// A strong accent leaves a mark: the next free hand takes it.
			this.lastStrike = at;
			const strikes = w.music.strikes;
			strikes.push( { s, bright: f.bright, at } );
			if ( strikes.length > 3 ) {
				strikes.shift();
			}
		}
		if ( s >= 0.85 && at - this.lastBurst >= BURST_GAP && f.loud >= 0.45 ) {
			w.burstAt( p );
			this.lastBurst = at;
		}
	}

	/** A new section: a lift moves the piece, a drop thins the cast. */
	section( sec, prev ) {
		const w = this.world;
		const lift = ( sec.loud || 0 ) - ( prev.loud || 0 );
		if ( lift >= LIFT ) {
			const r = w.rng;
			const plan = w.plan;
			plan.focal = {
				x: 0.15 * w.aspect + r() * 0.7 * w.aspect,
				y: 0.15 + r() * 0.7,
			};
			plan.direction += ( r() - 0.5 ) * 1.4;
			this.baseScale = clamp(
				this.baseScale * ( 0.9 + r() * 0.35 ),
				0.4,
				2.4
			);
			if ( w.params.autoPalette ) {
				w.paletteJolt = true;
			}
			if ( w.params.allowRecast ) {
				w.casting.push( { type: 'hire' } );
			}
			w.music.wake = true;
			w.chronicle.push( {
				e: 'upheaval',
				t: w.time,
				moved: true,
				song: true,
			} );
		} else if ( lift <= -LIFT && w.params.allowRecast ) {
			w.casting.push( { type: 'retire' } );
		}
	}

	/** The clock went back (a glitch, a seek): skip what lies behind it. */
	rewind( t ) {
		const acc = this.song.accents || { t: [] };
		this.ai = 0;
		while ( this.ai < acc.t.length && acc.t[ this.ai ] <= t ) {
			this.ai++;
		}
		const secs = this.song.sections || [];
		this.si = 0;
		while ( this.si < secs.length && secs[ this.si ].start <= t ) {
			this.si++;
		}
	}

	/** The last note: the piece is finished, the painters put down their brushes. */
	finish() {
		const m = this.world.music;
		if ( m.ended ) {
			return;
		}
		m.ended = true;
		m.progress = 1;
		m.t = this.song.duration || 0;
		m.onBeat = false;
		m.hush = true;
	}
}
