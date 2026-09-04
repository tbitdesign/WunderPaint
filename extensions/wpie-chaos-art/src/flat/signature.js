/**
 * The signature: one piece's own hand, drawn at birth.
 *
 * A school is a recipe, and a recipe alone paints siblings: the same
 * words in the same measure, the same colors, the same edges, every
 * time. So before the first mark every piece draws a signature that
 * bends the recipe - which words of the vocabulary it likes and which
 * it drops, which gestures, how hard its edges are, how far it goes,
 * whether one color runs warm or cool, whether it invites a guest from
 * another school and whether it changes its mind halfway. The chaos
 * dial sets how far a signature may stray from the book: at the left
 * the piece is the school's textbook, at the right it is its own.
 */

import { SCHOOLS } from './schools.js';

export const FINISHES = [ 'sparse', 'full', 'dense' ];

// Schools whose marks are whole-picture devices (black rules, moiré
// lines, one floating form): they neither send nor receive guests.
const NO_GUESTS = new Set( [
	'destijl',
	'opart',
	'suprematism',
	'minimalism',
	'bauhaus',
	'colorfield',
	'stainedglass',
	'mosaic',
	'constructivism',
] );

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

// Families of related languages: a guest speaks a related one, so a
// pointillist piece never gets a hard circle from a poster school.
const FAMILIES = {
	painterly: [
		'impressionism',
		'postimpressionism',
		'pointillism',
		'expressionism',
		'fauvism',
		'classicism',
		'action',
		'informel',
		'sumi',
	],
	graphic: [
		'cubism',
		'futurism',
		'biomorphic',
		'collage',
		'streetart',
		'artnouveau',
		'ukiyoe',
		'woodcut',
		'popart',
	],
	geometric: [
		'bauhaus',
		'suprematism',
		'destijl',
		'constructivism',
		'opart',
		'minimalism',
		'colorfield',
		'orphism',
		'stainedglass',
		'mosaic',
	],
};
export const familyOf = ( id ) =>
	Object.keys( FAMILIES ).find( ( k ) => FAMILIES[ k ].includes( id ) ) ||
	null;

function shuffle( list, rng ) {
	const a = list.slice();
	for ( let i = a.length - 1; i > 0; i-- ) {
		const j = Math.floor( rng() * ( i + 1 ) );
		[ a[ i ], a[ j ] ] = [ a[ j ], a[ i ] ];
	}
	return a;
}

/** Another school that may lend a voice to this one. */
export function pickOther( school, rng, avoidIds = [] ) {
	const fam = familyOf( school.id );
	const pool = SCHOOLS.filter(
		( s ) =>
			s.id !== school.id &&
			! NO_GUESTS.has( s.id ) &&
			! avoidIds.includes( s.id ) &&
			( ! fam || familyOf( s.id ) === fam )
	);
	if ( ! pool.length ) {
		return null;
	}
	return pool[ Math.floor( rng() * pool.length ) % pool.length ];
}

export const canHostGuests = ( school ) => ! NO_GUESTS.has( school.id );

/**
 * Draw a signature.
 *
 * @param {Function} rng    The piece's own random stream.
 * @param {Object}   school The school (recipe).
 * @param {number}   chaos  The chaos dial, 0..1.
 * @return {Object} The signature.
 */
export function drawSignature( rng, school, chaos = 0.5 ) {
	const c = clamp01( Number.isFinite( chaos ) ? chaos : 0.5 );
	// How far a word's weight may swing: ×0.8..1.25 at the textbook end,
	// ×0.3..3 at full chaos.
	const spread = 0.25 + c * 0.85;
	const weights = new Map();
	const gestures = new Set();
	const vocab = school.vocab || {};
	for ( const phase of Object.keys( vocab ) ) {
		const items = vocab[ phase ] || [];
		let on = 0;
		for ( const it of items ) {
			( it.gestures || [] ).forEach( ( g ) => gestures.add( g ) );
			let m;
			if ( items.length > 1 && rng() < 0.1 + c * 0.25 ) {
				m = 0; // this piece never says that word
			} else {
				m = Math.exp( ( rng() * 2 - 1 ) * spread * 1.15 );
			}
			weights.set( it, m );
			if ( m > 0 ) {
				on++;
			}
		}
		if ( items.length && ! on ) {
			weights.set( items[ Math.floor( rng() * items.length ) ], 1 );
		}
	}
	const all = [ ...gestures ];
	const fav =
		all.length > 2 && rng() < 0.55 + c * 0.35
			? shuffle( all, rng ).slice(
					0,
					Math.max(
						2,
						Math.round( all.length * ( 0.3 + rng() * 0.35 ) )
					)
			  )
			: null;
	const hosts = canHostGuests( school );
	const guest =
		hosts && rng() < 0.12 + c * 0.45 ? pickOther( school, rng ) : null;
	const shift =
		hosts && rng() < c * 0.3
			? pickOther( school, rng, guest ? [ guest.id ] : [] )
			: null;
	const scaleMul =
		rng() < 0.25
			? 0.6 + rng() * 0.3
			: rng() < 0.8
			? 0.9 + rng() * 0.4
			: 1.3 + rng() * 0.6;
	return {
		chaos: c,
		weights,
		fav,
		// Edges: a multiplier on the marks' hardness.
		edge: 0.7 + rng() * 0.6,
		// How far the piece goes before it rests, against the plan's target.
		coverage: 0.75 + rng() * 0.5,
		finish: FINISHES[ Math.floor( rng() * FINISHES.length ) ],
		// One element that outranks everything else.
		hero: rng() < 0.3,
		// A paper border the marks respect.
		margin: rng() < 0.1 + c * 0.12 ? 0.05 + rng() * 0.07 : 0,
		// One archetype from outside the school's list joins the draw.
		extraArchetype: rng() < c * 0.45,
		// The palette: warm or cool, tight or wide, own or borrowed.
		temperature: ( rng() * 2 - 1 ) * ( 0.4 + c * 0.6 ),
		contrast: 0.85 + rng() * ( 0.3 + c * 0.3 ),
		borrow: school.paletteStrict
			? 'own'
			: rng() < 0.06 + c * 0.24
			? 'other'
			: rng() < 0.32
			? 'neighbour'
			: 'own',
		guest,
		shift,
		scaleMul,
		mixedScale: rng() < 0.4,
	};
}

/**
 * The hand after a rest: the same piece, come back to with fresh eyes.
 * Favorite gestures are drawn again, edges and scale drift, and now and
 * then a guest is invited for this sitting.
 */
export function refreshSignature( sig, rng, school ) {
	if ( ! sig ) {
		return sig;
	}
	const all = new Set();
	for ( const phase of Object.keys( school.vocab || {} ) ) {
		for ( const it of school.vocab[ phase ] || [] ) {
			( it.gestures || [] ).forEach( ( g ) => all.add( g ) );
		}
	}
	const list = [ ...all ];
	sig.fav =
		list.length > 2 && rng() < 0.7
			? shuffle( list, rng ).slice(
					0,
					Math.max(
						2,
						Math.round( list.length * ( 0.3 + rng() * 0.35 ) )
					)
			  )
			: null;
	sig.edge =
		clamp01( ( sig.edge * ( 0.85 + rng() * 0.3 ) - 0.6 ) / 0.8 ) * 0.8 +
		0.6;
	sig.scaleMul = Math.max(
		0.5,
		Math.min( 2, sig.scaleMul * ( 0.8 + rng() * 0.45 ) )
	);
	// Some words come back, others go: the weights are re-rolled gently.
	for ( const [ it, m ] of sig.weights ) {
		if ( 0 === m && rng() < 0.3 ) {
			sig.weights.set( it, 0.6 + rng() * 0.8 );
		} else if ( m > 0 ) {
			sig.weights.set( it, m * Math.exp( ( rng() * 2 - 1 ) * 0.4 ) );
		}
	}
	if ( ! sig.guest && canHostGuests( school ) && rng() < 0.25 ) {
		sig.guest = pickOther( school, rng );
	}
	return sig;
}

/** The weight of a vocabulary item under a signature (1 without one). */
export function weightOf( item, signature ) {
	if ( ! signature || ! signature.weights ) {
		return item.w || 1;
	}
	const m = signature.weights.has( item ) ? signature.weights.get( item ) : 1;
	return ( item.w || 1 ) * m;
}

/** The gestures a mark may use: the item's, narrowed to the piece's favorites when they meet. */
export function gesturesFor( item, signature ) {
	const own = item.gestures || null;
	if ( ! own || ! signature || ! signature.fav ) {
		return own;
	}
	const both = own.filter( ( g ) => signature.fav.includes( g ) );
	return both.length ? both : own;
}
