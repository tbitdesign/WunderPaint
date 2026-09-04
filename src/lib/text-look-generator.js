/**
 * Seeded look generator (Text Looks, v1.430): samples a look from curated
 * design axes (font pairings, modular scales, role heuristics, accent
 * patterns) the way the old layout generator sampled line specs. Same
 * seed + same segments = same look; the popover's shuffle rolls new
 * seeds. Every roll passes cleanTextLook and a small quality gate.
 */

import { FONT_PAIRINGS } from './layout-generator';
import { fontClass } from './font-classes';
import {
	GOOGLE_FONTS,
	LOCAL_FONTS,
	SHIPPED_FONTS,
	customFamilies,
	downloadedFamilies,
	googleEnabled,
	nearestWeight,
} from './font-manager';
import { cleanTextLook } from './text-look';
import { salientWord } from './text-salience';

const SCALES = [ 1.2, 1.333, 1.5, 1.618 ];
// Below this many available families the open pairing has too little to
// choose from and the curated pairings carry the rolls alone.
const OPEN_POOL_MIN = 12;

/**
 * The families this site can really show: shipped, downloaded, uploaded
 * and, with the admin's Google opt-in, the whole catalog plus the CDN
 * list. Sorted, so a seed rolls the same look on the same site.
 *
 * @return {string[]} Family names.
 */
export function lookFontPool() {
	const pool = new Set( SHIPPED_FONTS );
	for ( const f of downloadedFamilies() ) {
		pool.add( f );
	}
	for ( const f of customFamilies() ) {
		pool.add( f );
	}
	if ( googleEnabled() ) {
		for ( const f of Object.keys( LOCAL_FONTS ) ) {
			pool.add( f );
		}
		for ( const f of GOOGLE_FONTS ) {
			pool.add( f );
		}
	}
	return [ ...pool ].sort( ( a, b ) => a.localeCompare( b ) );
}

// A pairing sampled from the open pool by class rules: the hero is a
// display, serif or script face or a heavy sans; the support line a calm
// sans or serif of another class (or the hero's own family in a lighter
// weight), never a second script, a monospace only now and then.
function openPairing( pool, rnd ) {
	const by = ( cls ) => pool.filter( ( f ) => fontClass( f ) === cls );
	const heavySans = by( 'sans' ).filter(
		( f ) => nearestWeight( f, 900 ) >= 700
	);
	const heroSets = [
		[ by( 'display' ), 0.35 ],
		[ by( 'serif' ), 0.25 ],
		[ by( 'script' ), 0.15 ],
		[ heavySans, 0.25 ],
	].filter( ( [ set ] ) => set.length );
	if ( ! heroSets.length ) {
		return null;
	}
	const total = heroSets.reduce( ( acc, [ , w ] ) => acc + w, 0 );
	let roll = rnd() * total;
	let heroSet = heroSets[ heroSets.length - 1 ][ 0 ];
	for ( const [ set, w ] of heroSets ) {
		if ( roll < w ) {
			heroSet = set;
			break;
		}
		roll -= w;
	}
	const hero = pick( rnd, heroSet );
	const cls = fontClass( hero );
	const others = ( c ) => by( c ).filter( ( f ) => f !== hero );
	let supportSet;
	if ( 'script' === cls ) {
		supportSet = others( 'sans' );
	} else if ( 'serif' === cls ) {
		supportSet = rnd() < 0.8 ? others( 'sans' ) : others( 'serif' );
	} else if ( 'display' === cls ) {
		supportSet = rnd() < 0.75 ? others( 'sans' ) : others( 'serif' );
	} else {
		const same = rnd() < 0.5;
		supportSet = same
			? [ hero ]
			: rnd() < 0.7
			? others( 'sans' )
			: others( 'serif' );
	}
	if ( 'script' !== cls && rnd() < 0.08 && by( 'mono' ).length ) {
		supportSet = by( 'mono' );
	}
	if ( ! supportSet.length ) {
		supportSet = others( 'sans' ).length ? others( 'sans' ) : [ hero ];
	}
	const support = pick( rnd, supportSet );
	return {
		hero: [ hero, nearestWeight( hero, 900 ) ],
		support: [
			support,
			nearestWeight( support, support === hero ? 400 : 500 ),
		],
		script: 'script' === cls,
	};
}

// The curated pairings this site can show; all of them without a pool.
function curatedPairings( pool ) {
	if ( ! pool ) {
		return FONT_PAIRINGS;
	}
	const has = new Set( pool );
	const ok = FONT_PAIRINGS.filter(
		( p ) => has.has( p.hero[ 0 ] ) && has.has( p.support[ 0 ] )
	);
	return ok.length ? ok : FONT_PAIRINGS;
}
const ACCENT_MODES = [ 'word', 'word', 'line', 'underline', 'stripe', 'none' ];

// Deterministic LCG (same family as the texture layers): 0..1 floats.
function makeRng( seed ) {
	let s = ( Math.abs( Math.round( seed ) ) || 1 ) & 0x7fffffff;
	return () => {
		s = ( s * 1103515245 + 12345 ) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}
const pick = ( rnd, arr ) => arr[ Math.floor( rnd() * arr.length ) ];
const between = ( rnd, lo, hi ) => lo + rnd() * ( hi - lo );
const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const words = ( t ) =>
	String( t || '' )
		.split( /\s+/ )
		.filter( Boolean );
const NUMBER_RE = /\d[\d.,:]*\s?(%|€|\$|£)?/;

/**
 * Roles per segment: short loud segments carry the message and become
 * heroes; a short opener is the eyebrow, a short closer the detail. With
 * salience data the short segment holding the strongest word leads.
 */
function segmentRoles( segments, rnd, salience ) {
	const n = segments.length;
	const roles = new Array( n ).fill( 'sub' );
	const count = ( i ) => words( segments[ i ].text ).length;
	const len = ( i ) => segments[ i ].text.length;
	const shortIdxs = segments
		.map( ( s, i ) => i )
		.filter( ( i ) => count( i ) <= 3 );
	const strength = ( i ) => {
		if ( ! salience ) {
			return 0;
		}
		const { score } = salientWord( segments[ i ].text, salience );
		return score || 0;
	};
	if ( shortIdxs.length >= 2 && rnd() < 0.35 ) {
		shortIdxs.forEach( ( i ) => {
			roles[ i ] = 'hero';
		} );
	} else if ( shortIdxs.length && salience ) {
		let best = shortIdxs[ 0 ];
		for ( const i of shortIdxs ) {
			if ( strength( i ) > strength( best ) ) {
				best = i;
			}
		}
		rnd(); // keep the stream in step with the heuristic branch
		roles[ best ] = 'hero';
	} else if ( shortIdxs.length ) {
		roles[ shortIdxs[ Math.floor( rnd() * shortIdxs.length ) ] ] = 'hero';
	} else {
		let best = 0;
		for ( let i = 1; i < n; i++ ) {
			if ( len( i ) < len( best ) ) {
				best = i;
			}
		}
		roles[ best ] = 'hero';
	}
	const heroLen = Math.max(
		...roles.map( ( r, i ) => ( 'hero' === r ? len( i ) : 0 ) )
	);
	if (
		n >= 3 &&
		'hero' !== roles[ 0 ] &&
		count( 0 ) <= 4 &&
		len( 0 ) <= heroLen + 8
	) {
		roles[ 0 ] = 'eyebrow';
	}
	const last = n - 1;
	if (
		n >= 3 &&
		'hero' !== roles[ last ] &&
		'eyebrow' !== roles[ last ] &&
		len( last ) <= 30
	) {
		roles[ last ] = 'detail';
	}
	return roles;
}

function sample( segments, ctx, rnd, seed ) {
	// Half of the rolls pair from the open pool by class rules, the other
	// half from the curated pairings; a small pool leaves it all to the
	// curated ones.
	const pool = ctx?.pool && ctx.pool.length ? ctx.pool : null;
	const open =
		pool && pool.length >= OPEN_POOL_MIN && rnd() < 0.5
			? openPairing( pool, rnd )
			: null;
	const pairing = open || pick( rnd, curatedPairings( pool ) );
	const scale = pick( rnd, SCALES );
	const roles = segmentRoles( segments, rnd, ctx?.salience );
	const allShort = segments.every( ( s ) => words( s.text ).length <= 3 );
	const stack = allShort && rnd() < 0.55;
	// Handwriting in capitals is a mess: script heroes keep their case,
	// whether the pairing came from the pool or from the curated list.
	const scriptHero = 'script' === fontClass( pairing.hero[ 0 ] );
	const upperHero = ! scriptHero && rnd() < 0.6;
	const accentMode = pick( rnd, ACCENT_MODES );
	const eyebrowLs = between( rnd, 0.22, 0.4 );
	const gap = between( rnd, 0.08, 0.3 );
	const subShare = clamp( 1 / scale, 0.55, 0.9 );
	const eyebrowShare = between( rnd, 0.35, 0.55 );

	const look = {
		source: 'generated',
		id: 'gen-' + seed,
		seed,
		assign: stack ? 'stack' : 'auto',
		segmentRoles: stack ? roles.map( () => 'hero' ) : roles,
		accent: 'brand',
		roles: {
			hero: {
				family: pairing.hero[ 0 ],
				weight: pairing.hero[ 1 ],
				upper: upperHero,
				ls: 0.02,
				share: 1,
				gapAfter: gap,
			},
			sub: {
				family: pairing.support[ 0 ],
				weight: pairing.support[ 1 ],
				ls: 0.05,
				share: subShare,
				gapAfter: gap,
			},
			eyebrow: {
				family: pairing.support[ 0 ],
				weight: pairing.support[ 1 ],
				upper: upperHero,
				ls: eyebrowLs,
				share: eyebrowShare,
				gapAfter: gap + 0.2,
			},
			detail: {
				family: pairing.support[ 0 ],
				weight: pairing.support[ 1 ],
				ls: 0.05,
				share: 0.5,
				gapAfter: gap,
			},
		},
	};
	if ( 'line' === accentMode ) {
		look.roles.hero.color = 'accent';
	}
	if ( 'stripe' === accentMode ) {
		look.stripe = true;
	}
	// A number, price or percentage is a born accent; otherwise the
	// meaning-carrying word (salience) or the longest word of the hero.
	const hasNumber = segments.some(
		( s ) =>
			words( s.text ).length >= 2 &&
			words( s.text ).some( ( w ) => NUMBER_RE.test( w ) )
	);
	const emphStyle =
		'underline' === accentMode
			? { underline: true, color: 'accent' }
			: {
					color: 'accent',
					weight: Math.min( 900, pairing.hero[ 1 ] + 200 ),
					relSize: between( rnd, 1.15, 1.4 ),
			  };
	if ( hasNumber ) {
		look.emph = { rule: 'number', style: emphStyle };
	} else if ( 'word' === accentMode || 'underline' === accentMode ) {
		look.emph = { rule: 'longest', style: emphStyle };
		if ( ctx?.salience ) {
			let best = null;
			segments.forEach( ( s, i ) => {
				if ( words( s.text ).length < 2 ) {
					return;
				}
				const { index, score } = salientWord( s.text, ctx.salience );
				if ( index >= 0 && ( ! best || score > best.score ) ) {
					best = { seg: i, word: index, score };
				}
			} );
			if ( best ) {
				look.emph = {
					rule: 'salient',
					seg: best.seg,
					word: best.word,
					style: emphStyle,
				};
			}
		}
	}
	return cleanTextLook( look );
}

// Quality gate: at most one coloured role, no stripe together with a
// coloured hero, and at least one hero.
function passesGate( look ) {
	if ( ! look ) {
		return false;
	}
	const coloured = Object.values( look.roles ).filter(
		( r ) => 'accent' === r.color
	).length;
	if ( coloured > 1 || ( look.stripe && coloured ) ) {
		return false;
	}
	return ! look.segmentRoles || look.segmentRoles.includes( 'hero' );
}

/**
 * Generate a valid look for the segments: deterministic per seed,
 * resampled through the gate, conservative fallback.
 *
 * @param {Array}  segments From splitSegments.
 * @param {Object} ctx      { salience, pool } optional word scores and the
 *                          families the site can show (lookFontPool()).
 * @param {number} seed     Seed (kept in the look).
 * @return {?Object} Clean look (null only for empty input).
 */
export function generateTextLook( segments, ctx, seed ) {
	if ( ! segments || ! segments.length ) {
		return null;
	}
	const rnd = makeRng( seed );
	for ( let attempt = 0; attempt < 12; attempt++ ) {
		const look = sample( segments, ctx, rnd, seed );
		if ( passesGate( look ) ) {
			return look;
		}
	}
	return cleanTextLook( {
		source: 'generated',
		id: 'gen-' + seed,
		seed,
		assign: 'auto',
		accent: 'brand',
		roles: {
			hero: {
				family: FONT_PAIRINGS[ 0 ].hero[ 0 ],
				weight: FONT_PAIRINGS[ 0 ].hero[ 1 ],
				share: 1,
				gapAfter: 0.15,
			},
			sub: {
				family: FONT_PAIRINGS[ 0 ].support[ 0 ],
				weight: FONT_PAIRINGS[ 0 ].support[ 1 ],
				share: 0.75,
				gapAfter: 0.15,
			},
		},
	} );
}
