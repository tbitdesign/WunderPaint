import { resolvePalette } from '../design-composer';
import { FONT_PAIRINGS } from '../layout-generator';
import { contrastRatio } from '../contrast-check';
import { parseColor, rgbToHex } from '../color';
import { VOICES } from './catalog';

// Anteile der kürzeren Kante je Stimme, Zeilenhöhe, Gesicht aus der Paarung.
const VOICE = {
	hero: { size: 0.11, lh: 1.02, face: 'hero', upper: false, tracking: -0.01 },
	stat: { size: 0.2, lh: 0.95, face: 'hero', upper: false, tracking: -0.02 },
	quote: { size: 0.07, lh: 1.15, face: 'hero', upper: false, tracking: 0 },
	sub: { size: 0.038, lh: 1.3, face: 'support', upper: false, tracking: 0 },
	eyebrow: {
		size: 0.024,
		lh: 1.2,
		face: 'support',
		upper: true,
		tracking: 0.12,
	},
	detail: {
		size: 0.026,
		lh: 1.35,
		face: 'support',
		upper: false,
		tracking: 0,
	},
	cta: { size: 0.03, lh: 1.1, face: 'support', upper: true, tracking: 0.04 },
};
const SCALED = [ 'hero', 'stat', 'quote' ];

let families = null;
export function knownFamilies() {
	if ( ! families ) {
		families = new Set();
		for ( const p of FONT_PAIRINGS ) {
			families.add( p.hero[ 0 ] );
			families.add( p.support[ 0 ] );
		}
	}
	return families;
}

const rgb = ( c ) => parseColor( c ) || { r: 0, g: 0, b: 0 };
export function bestOn( bg, candidates ) {
	let best = candidates[ 0 ];
	let score = -1;
	for ( const c of candidates ) {
		const r = contrastRatio( rgb( bg ), rgb( c ) );
		if ( r > score ) {
			score = r;
			best = c;
		}
	}
	return best;
}
const hex = ( c ) => {
	const p = parseColor( c );
	return p ? rgbToHex( p.r, p.g, p.b ) : '#000000';
};
const mix = ( a, b, t ) => {
	const x = rgb( a );
	const y = rgb( b );
	return rgbToHex(
		Math.round( x.r + ( y.r - x.r ) * t ),
		Math.round( x.g + ( y.g - x.g ) * t ),
		Math.round( x.b + ( y.b - x.b ) * t )
	);
};
const familyOf = ( f ) =>
	'string' === typeof f ? f : f?.family || f?.name || '';

function pickPairing( wanted, brand, seed ) {
	const known = knownFamilies();
	const brandFonts = ( brand?.fonts || [] ).map( familyOf ).filter( Boolean );
	if (
		wanted &&
		known.has( wanted.hero[ 0 ] ) &&
		known.has( wanted.support[ 0 ] )
	) {
		return { hero: [ ...wanted.hero ], support: [ ...wanted.support ] };
	}
	if ( brandFonts.length >= 1 ) {
		return {
			hero: [ brandFonts[ 0 ], 700 ],
			support: [ brandFonts[ 1 ] || 'Inter', 400 ],
		};
	}
	const p = FONT_PAIRINGS[ Math.abs( seed ) % FONT_PAIRINGS.length ];
	const hero = wanted && known.has( wanted.hero[ 0 ] ) ? wanted.hero : p.hero;
	const support =
		wanted && known.has( wanted.support[ 0 ] ) ? wanted.support : p.support;
	return { hero: [ ...hero ], support: [ ...support ] };
}

/** Palette, Stimmen und Abstände in Pixeln für ein bereinigtes Markup. */
export function resolveTokens( markup, ctx = {} ) {
	const { w, h } = markup.canvas;
	const docMin = Math.min( w, h );
	const seed = Number( ctx.seed ) || 0;
	const p = markup.tokens.palette;
	const intent = 'mono' === p.intent ? 'dark' : p.intent;
	let roles;
	if ( 'custom' === p.source ) {
		roles = {
			...resolvePalette( { palette: { intent } }, null, seed ),
			...p.roles,
		};
	} else if (
		'brand' === p.source &&
		( ctx.brand?.colors || [] ).length >= 3
	) {
		roles = resolvePalette(
			{ palette: { mode: 'brand', intent, accent: p.roles.accent } },
			ctx.brand,
			seed
		);
	} else {
		roles = resolvePalette(
			{ palette: { intent, accent: p.roles.accent } },
			null,
			seed
		);
	}
	if ( 'mono' === p.intent && 'custom' !== p.source ) {
		roles.accent = roles.ink;
	}
	const palette = {
		bg: hex( roles.bg ),
		surface: hex( roles.surface ),
		ink: hex( roles.ink ),
		muted: p.roles.muted || mix( roles.ink, roles.bg, 0.35 ),
		accent: hex( roles.accent ),
		accent2: p.roles.accent2 || mix( roles.accent, roles.surface, 0.4 ),
		onAccent: '',
	};
	palette.onAccent =
		p.roles.onAccent ||
		bestOn( palette.accent, [
			palette.ink,
			palette.bg,
			'#ffffff',
			'#111111',
		] );

	const pairing = pickPairing( markup.tokens.type.pairing, ctx.brand, seed );
	const scale = markup.tokens.type.scale;
	const voices = {};
	for ( const v of VOICES ) {
		const d = VOICE[ v ];
		const face = pairing[ d.face ];
		voices[ v ] = {
			fontFamily: face[ 0 ],
			weight: face[ 1 ],
			sizePx: Math.max(
				12,
				Math.round(
					docMin *
						d.size *
						( SCALED.includes( v ) ? scale / 1.25 : 1 )
				)
			),
			lineHeight: d.lh,
			upper: d.upper,
			tracking: d.tracking,
		};
	}
	const s = markup.tokens.space;
	return {
		palette,
		type: { pairing, scale, voices },
		space: {
			margin: Math.round( docMin * s.margin ),
			gap: Math.round( docMin * s.gap ),
			radius: Math.round( docMin * s.radius ),
		},
		docMin,
		seed,
	};
}
