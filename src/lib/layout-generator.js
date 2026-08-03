/**
 * Seeded generative layout engine (E1 of the dynamic-layouts design):
 * samples a LayoutSpec from curated design axes — font pairings, modular
 * scales, role heuristics, accent patterns — instead of picking from a
 * fixed preset list. Same seed + same lines = same spec (the popover's
 * shuffle just rolls new seeds). Every output passes cleanLayoutSpec and
 * a quality gate; pathological rolls fall back to a conservative default.
 */

import { cleanLayoutSpec } from './layout-spec';
import { salientWord, salienceKey } from './text-salience';

// Curated pairings of bundled families: [ family, weight ] per role. Same
// family in both roles only with a clear weight contrast.
export const FONT_PAIRINGS = [
	{ hero: [ 'Anton', 400 ], support: [ 'Inter', 500 ] },
	{ hero: [ 'Archivo', 900 ], support: [ 'Archivo', 400 ] },
	{ hero: [ 'Playfair Display', 700 ], support: [ 'Inter', 300 ] },
	{ hero: [ 'Bebas Neue', 400 ], support: [ 'Montserrat', 500 ] },
	{ hero: [ 'Oswald', 600 ], support: [ 'Lora', 500 ] },
	{ hero: [ 'DM Serif Display', 400 ], support: [ 'Barlow Condensed', 500 ] },
	{ hero: [ 'Montserrat', 800 ], support: [ 'Montserrat', 400 ] },
	{ hero: [ 'Abril Fatface', 400 ], support: [ 'Poppins', 400 ] },
	{ hero: [ 'Barlow Condensed', 800 ], support: [ 'Inter', 400 ] },
	{ hero: [ 'Lora', 600 ], support: [ 'Inter', 500 ] },
	{ hero: [ 'Space Grotesk', 700 ], support: [ 'Space Grotesk', 400 ] },
	{ hero: [ 'Bitter', 800 ], support: [ 'Bitter', 400 ] },
	{ hero: [ 'Caveat', 700 ], support: [ 'Archivo', 700 ] },
	{ hero: [ 'Cormorant Garamond', 600 ], support: [ 'Montserrat', 400 ] },
	{ hero: [ 'Amatic SC', 700 ], support: [ 'Inter', 400 ] },
];

const SCALES = [ 1.2, 1.333, 1.5, 1.618 ];
const ACCENT_MODES = [ 'word', 'word', 'line', 'underline', 'none' ];

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

const words = ( t ) => t.split( /\s+/ ).filter( Boolean );
// Prices, percentages, dates, plain numbers — born accents.
const NUMBER_RE = /\d[\d.,:]*\s?(%|€|\$|£)?/;
const numberWordIndex = ( t ) =>
	words( t ).findIndex( ( w ) => NUMBER_RE.test( w ) );
const longestWordIndex = ( t ) => {
	const ws = words( t );
	let idx = 0;
	ws.forEach( ( w, i ) => {
		if ( w.length > ws[ idx ].length ) {
			idx = i;
		}
	} );
	return idx;
};

// Role assignment: SHORT loud lines carry the message and become heroes
// (numbers get their accent INSIDE their line instead); which short line
// leads — or whether they all stack as a block — varies with the seed.
// The strongest word score a line holds (0 without salience data).
function lineSalience( text, salience ) {
	if ( ! salience ) {
		return 0;
	}
	let best = 0;
	for ( const w of words( text ) ) {
		const sc = salience.get( salienceKey( w ) );
		if ( undefined !== sc && sc > best ) {
			best = sc;
		}
	}
	return best;
}

function assignRoles( lines, rnd, salience ) {
	const roles = lines.map( () => 'sub' );
	const shortIdxs = lines
		.map( ( t, i ) => i )
		.filter( ( i ) => words( lines[ i ] ).length <= 3 );
	// Stack mode: several short lines all become heroes (poster-like).
	if ( shortIdxs.length >= 2 && rnd() < 0.35 ) {
		shortIdxs.forEach( ( i ) => {
			roles[ i ] = 'hero';
		} );
	} else if ( shortIdxs.length && salience ) {
		// Semantic pick: the short line carrying the strongest word leads.
		let best = shortIdxs[ 0 ];
		for ( const i of shortIdxs ) {
			if (
				lineSalience( lines[ i ], salience ) >
				lineSalience( lines[ best ], salience )
			) {
				best = i;
			}
		}
		rnd(); // keep the stream in step with the heuristic branch
		roles[ best ] = 'hero';
	} else if ( shortIdxs.length ) {
		roles[ shortIdxs[ Math.floor( rnd() * shortIdxs.length ) ] ] = 'hero';
	} else {
		let best = 0;
		lines.forEach( ( t, i ) => {
			if ( t.length < lines[ best ].length ) {
				best = i;
			}
		} );
		roles[ best ] = 'hero';
	}
	const heroLen = Math.max(
		...roles.map( ( r, i ) => ( 'hero' === r ? lines[ i ].length : 0 ) )
	);
	if (
		lines.length >= 3 &&
		'hero' !== roles[ 0 ] &&
		words( lines[ 0 ] ).length <= 4 &&
		lines[ 0 ].length <= heroLen
	) {
		roles[ 0 ] = 'eyebrow';
	}
	const last = lines.length - 1;
	if (
		lines.length >= 3 &&
		'hero' !== roles[ last ] &&
		'eyebrow' !== roles[ last ] &&
		lines[ last ].length <= 30
	) {
		roles[ last ] = 'detail';
	}
	return roles;
}

function sample( lines, ctx, rnd, seed ) {
	const pairing = pick( rnd, FONT_PAIRINGS );
	const scale = pick( rnd, SCALES );
	const roles = assignRoles( lines, rnd, ctx?.salience );
	const heroIdx = roles.indexOf( 'hero' );
	const allShort = lines.every( ( t ) => words( t ).length <= 3 );
	const fit = allShort && rnd() < 0.55 ? 'block' : 'scale';
	const upperHero = rnd() < 0.6;
	const accentMode = pick( rnd, ACCENT_MODES );
	const eyebrowLs = between( rnd, 0.22, 0.4 );
	const gapRhythm = between( rnd, 0.16, 0.34 );

	// Accent target: numbers/prices are born accents and ALWAYS get the
	// in-line emphasis; otherwise word/underline modes pick the longest
	// word of the hero or of the first multi-word line.
	let emphLine = -1;
	let emphIdx = -1;
	lines.forEach( ( t, i ) => {
		const n = numberWordIndex( t );
		if ( emphLine < 0 && n >= 0 && words( t ).length >= 2 ) {
			emphLine = i;
			emphIdx = n;
		}
	} );
	if (
		emphLine < 0 &&
		( 'word' === accentMode || 'underline' === accentMode )
	) {
		const candidates = lines
			.map( ( t, i ) => i )
			.filter( ( i ) => words( lines[ i ] ).length >= 2 );
		// Semantic pick (E3): the most meaning-carrying word wins when the
		// local salience model scored the text.
		if ( candidates.length && ctx?.salience ) {
			let bestScore = -1;
			for ( const i of candidates ) {
				const { index, score } = salientWord(
					lines[ i ],
					ctx.salience
				);
				if ( index >= 0 && score > bestScore ) {
					bestScore = score;
					emphLine = i;
					emphIdx = index;
				}
			}
		}
		if ( emphLine < 0 && candidates.length ) {
			emphLine = candidates.includes( heroIdx )
				? heroIdx
				: candidates[ 0 ];
			emphIdx = longestWordIndex( lines[ emphLine ] );
		}
	}
	const accentLine = 'line' === accentMode ? heroIdx : -1;

	const rel = ( role ) =>
		'hero' === role
			? 1
			: 'sub' === role
			? 1 / scale
			: Math.max( 0.22, 1 / ( scale * scale ) );

	const specLines = lines.map( ( text, i ) => {
		const role = roles[ i ];
		const isHero = 'hero' === role;
		const isEyebrow = 'eyebrow' === role;
		const line = {
			text,
			role,
			upper: ( isHero || isEyebrow ) && upperHero,
			fontFamily: isHero ? pairing.hero[ 0 ] : pairing.support[ 0 ],
			weight: isHero ? pairing.hero[ 1 ] : pairing.support[ 1 ],
			rel: rel( role ),
			ls: isEyebrow ? eyebrowLs : isHero ? 0.02 : 0.05,
			gapAfter: isEyebrow ? gapRhythm + 0.3 : gapRhythm,
		};
		if ( i === accentLine ) {
			line.color = 'accent';
		}
		if ( i === emphLine && emphIdx >= 0 ) {
			line.emph = {
				wordIndex: emphIdx,
				style:
					'underline' === accentMode
						? { underline: true, color: 'accent' }
						: {
								color: 'accent',
								weight: Math.min(
									900,
									( line.weight || 400 ) + 200
								),
								relSize: between( rnd, 1.15, 1.4 ),
						  },
			};
		}
		return line;
	} );

	return cleanLayoutSpec( {
		source: 'generated',
		seed,
		fit,
		lines: specLines,
	} );
}

// Quality gate: reject rolls that break basic typographic sanity.
function passesGate( spec, lines ) {
	if ( ! spec || spec.lines.length !== lines.length ) {
		return false;
	}
	const hero = spec.lines.find( ( l ) => 'hero' === l.role );
	if ( ! hero ) {
		return false;
	}
	for ( const l of spec.lines ) {
		if ( 'eyebrow' === l.role && l.text.length > hero.text.length ) {
			return false;
		}
	}
	if ( spec.lines.filter( ( l ) => 'accent' === l.color ).length > 1 ) {
		return false;
	}
	return true;
}

/**
 * Generate a valid LayoutSpec for the display lines — deterministic per
 * seed, resampled through the quality gate, conservative fallback.
 *
 * @param {string[]} lines Display lines (from splitLayoutLines).
 * @param {Object}   ctx   { color } base colour context.
 * @param {number}   seed  Seed (stored in the spec for reproducibility).
 * @return {?Object} Clean LayoutSpec (null only for empty input).
 */
export function generateLayoutSpec( lines, ctx, seed ) {
	if ( ! lines || ! lines.length ) {
		return null;
	}
	const rnd = makeRng( seed );
	for ( let attempt = 0; attempt < 12; attempt++ ) {
		const spec = sample( lines, ctx, rnd, seed );
		if ( passesGate( spec, lines ) ) {
			return spec;
		}
	}
	// Conservative fallback: pairing 0, scale 1.333, no accents.
	const roles = assignRoles( lines, makeRng( seed + 1 ), ctx?.salience );
	return cleanLayoutSpec( {
		source: 'generated',
		seed,
		fit: 'scale',
		lines: lines.map( ( text, i ) => ( {
			text,
			role: roles[ i ],
			fontFamily:
				'hero' === roles[ i ]
					? FONT_PAIRINGS[ 0 ].hero[ 0 ]
					: FONT_PAIRINGS[ 0 ].support[ 0 ],
			weight:
				'hero' === roles[ i ]
					? FONT_PAIRINGS[ 0 ].hero[ 1 ]
					: FONT_PAIRINGS[ 0 ].support[ 1 ],
			rel: 'hero' === roles[ i ] ? 1 : 0.75,
			gapAfter: 0.2,
		} ) ),
	} );
}
