/**
 * Text Looks (v1.430): a layout is a LOOK on a Fluid Text layer. The look
 * is a small recipe (font pairing, weights, casing, tracking, accent,
 * roles); line breaks, sizes and leading come from the box through the
 * Fluid Text engine, so nothing is baked into the document and the text
 * stays editable. Spec: docs/superpowers/specs/2026-09-04-text-looks-design.md
 *
 * This module is the pure model: the format and its validator, the ten
 * classics, the segment split, role assignment, accent resolution and the
 * emphasis target. It measures nothing; text-fit.js consumes it.
 */

import { __ } from '@wordpress/i18n';

import {
	GOOGLE_FONTS,
	LOCAL_FONTS,
	SYSTEM_FONTS,
	customFamilies,
} from './font-manager';
import { hexToRgb, hslToRgb, rgbToHex, rgbToHsl } from './color';

export const ROLES = [ 'eyebrow', 'hero', 'sub', 'detail' ];
export const ASSIGNS = [
	'auto',
	'stack',
	'alternate',
	'shortest',
	'second',
	'tail',
];
export const EMPH_RULES = [ 'number', 'salient', 'longest', 'none' ];
export const LOOK_SOURCES = [ 'classic', 'generated', 'ai' ];

const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const num = ( v, d ) => ( Number.isFinite( +v ) ? +v : d );
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isColor = ( c ) =>
	'accent' === c ||
	( 'string' === typeof c &&
		( HEX.test( c.trim() ) || /^rgba?\([\d\s.,%]+\)$/i.test( c.trim() ) ) );
const words = ( t ) =>
	String( t || '' )
		.split( /\s+/ )
		.filter( Boolean );

// A family the editor can name: catalog, Google CDN list, system fonts
// or an uploaded face. Anything else is reset to the base.
function knownFamily( family ) {
	if ( 'string' !== typeof family || ! family ) {
		return false;
	}
	if ( LOCAL_FONTS[ family ] || SYSTEM_FONTS.includes( family ) ) {
		return true;
	}
	if ( GOOGLE_FONTS.includes( family ) ) {
		return true;
	}
	try {
		return customFamilies().includes( family );
	} catch ( e ) {
		return false;
	}
}

/* ------------------------------ validator ----------------------------- */

function cleanRole( raw, base ) {
	const r = raw && 'object' === typeof raw ? raw : {};
	const out = {
		family: knownFamily( r.family ) ? r.family : base.family,
		weight: clamp( Math.round( num( r.weight, base.weight ) ), 100, 900 ),
		italic: undefined !== r.italic ? !! r.italic : base.italic,
		upper: undefined !== r.upper ? !! r.upper : base.upper,
		ls: clamp( num( r.ls, base.ls ), -0.1, 0.6 ),
		share: clamp( num( r.share, base.share ), 0.3, 1 ),
		gapAfter: clamp( num( r.gapAfter, base.gapAfter ), 0, 2 ),
	};
	if ( r.color && isColor( r.color ) ) {
		out.color = r.color;
	} else if ( base.color ) {
		out.color = base.color;
	}
	return out;
}

function cleanEmph( raw ) {
	if ( ! raw || 'object' !== typeof raw ) {
		return null;
	}
	const rule = EMPH_RULES.includes( raw.rule ) ? raw.rule : 'none';
	if ( 'none' === rule ) {
		return null;
	}
	const s = raw.style && 'object' === typeof raw.style ? raw.style : {};
	const style = {};
	if ( undefined !== s.relSize ) {
		style.relSize = clamp( num( s.relSize, 1 ), 1, 2 );
	}
	if ( knownFamily( s.family ) ) {
		style.family = s.family;
	}
	if ( undefined !== s.weight ) {
		style.weight = clamp( Math.round( num( s.weight, 400 ) ), 100, 900 );
	}
	if ( undefined !== s.italic ) {
		style.italic = !! s.italic;
	}
	if ( undefined !== s.underline ) {
		style.underline = !! s.underline;
	}
	if ( s.color && isColor( s.color ) ) {
		style.color = s.color;
	}
	if ( ! Object.keys( style ).length ) {
		return null;
	}
	const emph = { rule, style };
	if ( Number.isInteger( raw.seg ) && Number.isInteger( raw.word ) ) {
		emph.seg = raw.seg;
		emph.word = raw.word;
	}
	return emph;
}

/**
 * Sanitize any producer's look (classic, generator, AI response): font
 * whitelist, enums, numeric clamps; missing roles take the hero's style.
 *
 * @param {Object} raw Raw look.
 * @return {?Object} Clean look or null when unusable.
 */
export function cleanTextLook( raw ) {
	if ( ! raw || 'object' !== typeof raw ) {
		return null;
	}
	if ( ! raw.roles || 'object' !== typeof raw.roles ) {
		return null;
	}
	const hero = cleanRole( raw.roles.hero, {
		family: 'Inter',
		weight: 700,
		italic: false,
		upper: false,
		ls: 0,
		share: 1,
		gapAfter: 0.2,
	} );
	const roles = { hero };
	for ( const role of ROLES ) {
		if ( 'hero' !== role ) {
			roles[ role ] = cleanRole( raw.roles[ role ], hero );
		}
	}
	const look = {
		v: 1,
		source: LOOK_SOURCES.includes( raw.source ) ? raw.source : 'generated',
		id: 'string' === typeof raw.id ? raw.id.slice( 0, 40 ) : 'look',
		assign: ASSIGNS.includes( raw.assign ) ? raw.assign : 'auto',
		roles,
		accent:
			'auto' === raw.accent ||
			( 'string' === typeof raw.accent && HEX.test( raw.accent.trim() ) )
				? raw.accent.trim()
				: 'brand',
	};
	if ( Number.isFinite( +raw.seed ) ) {
		look.seed = Math.round( +raw.seed );
	}
	if (
		Array.isArray( raw.segmentRoles ) &&
		raw.segmentRoles.length &&
		raw.segmentRoles.every( ( r ) => ROLES.includes( r ) )
	) {
		look.segmentRoles = raw.segmentRoles.slice( 0, 16 );
	}
	if ( raw.stripe ) {
		look.stripe = true;
	}
	const emph = cleanEmph( raw.emph );
	if ( emph ) {
		look.emph = emph;
	}
	return look;
}

/** The style of a role, the hero's when the look has none. */
export const roleStyle = ( look, role ) =>
	( look && look.roles && ( look.roles[ role ] || look.roles.hero ) ) || null;

/* ------------------------------ classics ------------------------------ */

const classic = ( id, name, look ) => ( {
	id,
	name,
	look: cleanTextLook( { ...look, source: 'classic', id } ),
} );

export const CLASSIC_LOOKS = [
	classic( 'poster', __( 'Poster', 'wunderpaint' ), {
		assign: 'stack',
		roles: {
			hero: {
				family: 'Anton',
				weight: 400,
				upper: true,
				ls: 0.02,
				share: 1,
				gapAfter: 0.05,
			},
		},
	} ),
	classic( 'impact', __( 'Impact', 'wunderpaint' ), {
		assign: 'stack',
		stripe: true,
		roles: {
			hero: {
				family: 'Archivo',
				weight: 900,
				upper: true,
				ls: 0.01,
				share: 1,
				gapAfter: 0.04,
			},
		},
	} ),
	classic( 'hero', __( 'Hero', 'wunderpaint' ), {
		assign: 'auto',
		roles: {
			eyebrow: {
				family: 'Montserrat',
				weight: 600,
				upper: true,
				ls: 0.32,
				share: 0.45,
				color: 'accent',
				gapAfter: 0.35,
			},
			hero: {
				family: 'Montserrat',
				weight: 800,
				upper: true,
				ls: 0.02,
				share: 1,
				gapAfter: 0.12,
			},
			sub: {
				family: 'Montserrat',
				weight: 600,
				upper: true,
				ls: 0.02,
				share: 0.85,
				gapAfter: 0.12,
			},
			detail: {
				family: 'Montserrat',
				weight: 500,
				ls: 0.06,
				share: 0.5,
				gapAfter: 0.2,
			},
		},
	} ),
	classic( 'editorial', __( 'Editorial', 'wunderpaint' ), {
		assign: 'alternate',
		roles: {
			hero: {
				family: 'Playfair Display',
				weight: 700,
				share: 1,
				gapAfter: 0.15,
			},
			sub: {
				family: 'Playfair Display',
				weight: 500,
				italic: true,
				share: 0.65,
				gapAfter: 0.15,
			},
		},
	} ),
	classic( 'contrast', __( 'Contrast', 'wunderpaint' ), {
		assign: 'shortest',
		roles: {
			hero: {
				family: 'Anton',
				weight: 400,
				upper: true,
				ls: 0.02,
				color: 'accent',
				share: 1,
				gapAfter: 0.1,
			},
			sub: {
				family: 'Inter',
				weight: 500,
				ls: 0.08,
				share: 0.6,
				gapAfter: 0.15,
			},
		},
	} ),
	classic( 'handwritten', __( 'Handwritten', 'wunderpaint' ), {
		assign: 'second',
		roles: {
			hero: {
				family: 'Caveat',
				weight: 700,
				color: 'accent',
				share: 1,
				gapAfter: 0.05,
			},
			sub: {
				family: 'Archivo',
				weight: 800,
				upper: true,
				ls: 0.1,
				share: 0.7,
				gapAfter: 0.1,
			},
		},
	} ),
	classic( 'minimal', __( 'Minimal', 'wunderpaint' ), {
		assign: 'stack',
		roles: {
			hero: {
				family: 'Inter',
				weight: 300,
				upper: true,
				ls: 0.42,
				share: 0.8,
				gapAfter: 0.5,
			},
		},
	} ),
	classic( 'spotlight', __( 'Spotlight', 'wunderpaint' ), {
		assign: 'stack',
		roles: {
			hero: {
				family: 'Inter',
				weight: 500,
				ls: 0.02,
				share: 0.85,
				gapAfter: 0.2,
			},
		},
		emph: {
			rule: 'longest',
			style: { weight: 900, color: 'accent', relSize: 1.3 },
		},
	} ),
	classic( 'marker', __( 'Marker', 'wunderpaint' ), {
		assign: 'stack',
		roles: {
			hero: {
				family: 'Archivo',
				weight: 800,
				ls: 0.04,
				share: 0.85,
				gapAfter: 0.2,
			},
		},
		emph: {
			rule: 'longest',
			style: {
				family: 'Caveat',
				weight: 700,
				color: 'accent',
				relSize: 1.5,
			},
		},
	} ),
	classic( 'quote', __( 'Quote', 'wunderpaint' ), {
		assign: 'tail',
		roles: {
			hero: {
				family: 'Lora',
				weight: 500,
				italic: true,
				share: 0.9,
				gapAfter: 0.2,
			},
			detail: {
				family: 'Inter',
				weight: 600,
				upper: true,
				ls: 0.3,
				share: 0.45,
				gapAfter: 0.2,
			},
		},
	} ),
];

/* ------------------------------ segments ------------------------------ */

// A word that closes a sentence (the fit engine applies the same test to
// its measured words, so both sides count the same segments).
export const endsSentence = ( word ) => /[.!?…]["')\]]*$/.test( word );

/**
 * Split text into segments: paragraphs (Enter), then sentences. A final
 * full stop is dropped from the segment text ("!" and "?" stay).
 *
 * @param {string} text Stored text.
 * @return {Array<{text: string, para: number}>} Segments.
 */
export function splitSegments( text ) {
	const out = [];
	let para = -1;
	for ( const raw of String( text || '' ).split( '\n' ) ) {
		const t = raw.trim();
		if ( ! t ) {
			continue;
		}
		para++;
		let cur = [];
		for ( const w of words( t ) ) {
			cur.push( w );
			if ( endsSentence( w ) ) {
				out.push( {
					text: cur.join( ' ' ).replace( /\.$/, '' ),
					para,
				} );
				cur = [];
			}
		}
		if ( cur.length ) {
			out.push( { text: cur.join( ' ' ), para } );
		}
	}
	return out;
}

/* -------------------------------- roles ------------------------------- */

/**
 * The role of every segment: explicit `segmentRoles` while their count
 * matches, otherwise the look's strategy.
 *
 * @param {Array}  segments From splitSegments.
 * @param {Object} look     Clean look.
 * @return {string[]} One role per segment.
 */
export function assignRoles( segments, look ) {
	const n = segments.length;
	if ( look.segmentRoles && look.segmentRoles.length === n ) {
		return look.segmentRoles.slice();
	}
	const roles = new Array( n ).fill( 'sub' );
	if ( ! n ) {
		return roles;
	}
	const count = ( i ) => words( segments[ i ].text ).length;
	const len = ( i ) => segments[ i ].text.length;
	const shortest = () => {
		let best = 0;
		for ( let i = 1; i < n; i++ ) {
			if ( len( i ) < len( best ) ) {
				best = i;
			}
		}
		return best;
	};
	switch ( look.assign ) {
		case 'stack':
			roles.fill( 'hero' );
			break;
		case 'alternate':
			for ( let i = 0; i < n; i++ ) {
				roles[ i ] = i % 2 ? 'sub' : 'hero';
			}
			break;
		case 'shortest':
			roles[ shortest() ] = 'hero';
			break;
		case 'second':
			roles[ n > 1 ? 1 : 0 ] = 'hero';
			break;
		case 'tail':
			roles.fill( 'hero' );
			if ( n >= 2 ) {
				roles[ n - 1 ] = 'detail';
			}
			break;
		default: {
			// auto: the shortest of the short segments (three words or
			// fewer) carries the message; a short opener before it is an
			// eyebrow, a short closer a detail.
			let hero = -1;
			for ( let i = 0; i < n; i++ ) {
				if (
					count( i ) <= 3 &&
					( hero < 0 || len( i ) < len( hero ) )
				) {
					hero = i;
				}
			}
			if ( hero < 0 ) {
				hero = shortest();
			}
			roles[ hero ] = 'hero';
			if (
				n >= 3 &&
				0 !== hero &&
				count( 0 ) <= 4 &&
				len( 0 ) <= len( hero ) + 8
			) {
				roles[ 0 ] = 'eyebrow';
			}
			if ( n >= 3 && hero !== n - 1 && len( n - 1 ) <= 30 ) {
				roles[ n - 1 ] = 'detail';
			}
		}
	}
	return roles;
}

/* ------------------------------- accent ------------------------------- */

/**
 * The accent colour of a look on this layer: a fixed hex, the first brand
 * colour, or a harmony of the text colour (a hue turn for saturated
 * colours, a warm red for greys).
 *
 * @param {string}   layerColor  Text colour.
 * @param {Object}   look        Clean look.
 * @param {string[]} brandColors Brand kit colours (may be empty).
 * @return {string} Hex colour.
 */
export function accentFor( layerColor, look, brandColors ) {
	const acc = look?.accent || 'brand';
	if ( 'brand' !== acc && 'auto' !== acc ) {
		return acc;
	}
	if ( 'brand' === acc && brandColors && brandColors[ 0 ] ) {
		return brandColors[ 0 ];
	}
	const { r, g, b } = hexToRgb( layerColor || '#1a1d21' );
	const { h, s, l } = rgbToHsl( r, g, b );
	if ( s < 0.25 || l < 0.12 || l > 0.9 ) {
		return '#e5484d';
	}
	const c = hslToRgb(
		( h + 160 ) % 360,
		clamp( s, 0.55, 0.85 ),
		clamp( l, 0.35, 0.55 )
	);
	return rgbToHex( c.r, c.g, c.b );
}

/* ------------------------------ emphasis ------------------------------ */

// Prices, percentages, dates, plain numbers: born accents.
const NUMBER_RE = /\d[\d.,:]*\s?(%|€|\$|£)?/;

/**
 * Which word a look accents: the generator's hint while the segments still
 * match, else the first number, else the longest word of the first hero
 * segment that has at least two words.
 *
 * @param {Array}    segments From splitSegments.
 * @param {Object}   look     Clean look.
 * @param {string[]} roles    From assignRoles.
 * @return {?{seg: number, word: number}} Target or null.
 */
export function emphTarget( segments, look, roles ) {
	const emph = look?.emph;
	if ( ! emph || 'none' === emph.rule || ! segments.length ) {
		return null;
	}
	if (
		Number.isInteger( emph.seg ) &&
		Number.isInteger( emph.word ) &&
		look.segmentRoles &&
		look.segmentRoles.length === segments.length &&
		segments[ emph.seg ] &&
		words( segments[ emph.seg ].text )[ emph.word ] !== undefined
	) {
		return { seg: emph.seg, word: emph.word };
	}
	if ( 'number' === emph.rule || 'salient' === emph.rule ) {
		for ( let i = 0; i < segments.length; i++ ) {
			const ws = words( segments[ i ].text );
			const idx = ws.findIndex( ( w ) => NUMBER_RE.test( w ) );
			if ( idx >= 0 && ws.length >= 2 ) {
				return { seg: i, word: idx };
			}
		}
	}
	const order = [];
	const heroIdx = roles ? roles.indexOf( 'hero' ) : -1;
	if ( heroIdx >= 0 ) {
		order.push( heroIdx );
	}
	segments.forEach( ( s, i ) => {
		if ( i !== heroIdx ) {
			order.push( i );
		}
	} );
	for ( const i of order ) {
		const ws = words( segments[ i ].text );
		if ( ws.length < 2 ) {
			continue;
		}
		let best = 0;
		ws.forEach( ( w, k ) => {
			if ( w.length > ws[ best ].length ) {
				best = k;
			}
		} );
		return { seg: i, word: best };
	}
	return null;
}
