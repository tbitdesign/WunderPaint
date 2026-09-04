/**
 * Colors with roles, for painters that think in values before hues.
 *
 * A palette is a list; a painting needs a plan: which color is the
 * ground, which carries the big masses, which answers, which is the
 * dark that gives the picture its bones, which the light that lets it
 * breathe, and which single color is allowed to shout. The roles are
 * derived from any list (a brand kit works), and each school brings a
 * generator that draws a fresh list in its own taste.
 */

import { hexRgb, hslHex } from '../core/palette.js';
import { lum, hueSat } from './senses.js';

/** Roles from a hex list: rgb triples 0..1. */
export function roles( hexes ) {
	const list = ( hexes || [] ).map( hexRgb ).filter( Boolean );
	if ( ! list.length ) {
		return roles( [
			'#f2efe6',
			'#1c1a17',
			'#8a6a4b',
			'#b4977a',
			'#c8371d',
		] );
	}
	const byL = list.slice().sort( ( a, b ) => lum( a ) - lum( b ) );
	const bySat = list
		.slice()
		.sort( ( a, b ) => hueSat( b ).s - hueSat( a ).s );
	const dark = byL[ 0 ];
	const light = byL[ byL.length - 1 ];
	const accent = bySat[ 0 ];
	const mids = byL.slice( 1, -1 ).filter( ( c ) => c !== accent );
	const dominant = mids[ 0 ] || byL[ Math.floor( byL.length / 2 ) ];
	const secondary = mids[ 1 ] || mids[ 0 ] || light;
	const neutral = [
		( dark[ 0 ] + light[ 0 ] ) / 2,
		( dark[ 1 ] + light[ 1 ] ) / 2,
		( dark[ 2 ] + light[ 2 ] ) / 2,
	];
	return { list, dark, light, accent, dominant, secondary, neutral };
}

const clamp01 = ( v ) => Math.max( 0, Math.min( 1, v ) );

/** Mix two rgb triples. */
export const mix = ( a, b, t ) => [
	a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t,
	a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t,
	a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * t,
];

/** Shift lightness (+/-) and saturation (multiplier-ish) of an rgb triple. */
export function shade( c, dl = 0, ds = 0 ) {
	const l = lum( c );
	const gray = [ l, l, l ];
	let out = mix( gray, c, clamp01( 1 + ds ) );
	if ( dl > 0 ) {
		out = mix( out, [ 1, 1, 1 ], dl );
	} else if ( dl < 0 ) {
		out = mix( out, [ 0, 0, 0 ], -dl );
	}
	return out.map( clamp01 );
}

/** A small random walk in hue and lightness - broken color. */
export function jitter( c, rng, amt = 0.08 ) {
	const { h, s } = hueSat( c );
	const l = lum( c );
	if ( h < 0 ) {
		return shade( c, ( rng() - 0.5 ) * amt * 2 );
	}
	const hh = ( ( ( h + ( rng() - 0.5 ) * amt * 0.9 ) % 1 ) + 1 ) % 1;
	const ll = clamp01( l + ( rng() - 0.5 ) * amt * 1.5 );
	return hexRgb(
		hslHex( hh * 360, clamp01( s * ( 0.85 + rng() * 0.3 ) ), ll )
	);
}

/** The complement of a color at the same lightness. */
export function complement( c ) {
	const { h, s } = hueSat( c );
	if ( h < 0 ) {
		return c.slice();
	}
	return hexRgb( hslHex( ( ( h + 0.5 ) % 1 ) * 360, s, lum( c ) ) );
}

const H = ( h, s, l ) =>
	hslHex( ( ( h % 360 ) + 360 ) % 360, clamp01( s ), clamp01( l ) );

/**
 * School palette generators. Each returns 5..7 hex colors; the roles
 * derive from them. Every call is a new palette in the same taste.
 */
export const PALETTE_MODES = {
	/** Impressionism: high key, broken complements, no black. */
	highkey( rng ) {
		const h0 = rng() * 360;
		const shadow = h0 + 200 + rng() * 40; // cool violet-blue shadows
		return [
			H( h0 + 25 + rng() * 20, 0.35, 0.9 ), // warm light
			H( h0, 0.55, 0.72 ),
			H( h0 + 40, 0.6, 0.66 ),
			H( shadow, 0.45, 0.58 ),
			H( shadow + 25, 0.5, 0.5 ),
			H( h0 + 180, 0.55, 0.62 ),
		];
	},
	/** Fauvism, Expressionism: pure and loud, plus a near-black. */
	pure( rng ) {
		const h0 = rng() * 360;
		return [
			H( 10 + rng() * 20, 0.95, 0.5 ), // vermilion
			H( 225 + rng() * 15, 0.85, 0.42 ), // ultramarine
			H( 150 + rng() * 25, 0.7, 0.42 ), // emerald
			H( 48 + rng() * 10, 0.98, 0.55 ), // chrome yellow
			H( h0, 0.9, 0.5 ),
			H( 320 + rng() * 25, 0.8, 0.5 ), // magenta
			H( 250, 0.3, 0.1 ), // near black
		];
	},
	/** Classicism, Cubism: earths, ivory, slate, one deep blue. */
	earth( rng ) {
		return [
			H( 30 + rng() * 10, 0.5, 0.16 ), // raw umber
			H( 20 + rng() * 10, 0.65, 0.34 ), // burnt sienna
			H( 42 + rng() * 8, 0.6, 0.5 ), // ochre
			H( 45, 0.35, 0.88 ), // ivory
			H( 210 + rng() * 20, 0.18, 0.45 ), // slate
			H( 8, 0.6, 0.38 ), // venetian red
			H( 215 + rng() * 15, 0.5, 0.28 ), // deep blue
		];
	},
	/** Bauhaus, De Stijl, Suprematism: primaries, black, white. */
	primaries( rng ) {
		return [
			'#f4f1ea',
			H( 0, 0.05, 0.1 ),
			H( 4 + rng() * 6, 0.75, 0.47 ),
			H( 44 + rng() * 6, 0.95, 0.5 ),
			H( 212 + rng() * 8, 0.7, 0.38 ),
			H( 0, 0, 0.55 ),
		];
	},
	/** Sumi-e: ink dilutions on paper, one vermilion seal. */
	ink( rng ) {
		const paperH = 40 + rng() * 15;
		return [
			H( paperH, 0.2, 0.93 ),
			H( 220, 0.08, 0.08 ),
			H( 220, 0.05, 0.3 ),
			H( 220, 0.04, 0.55 ),
			H( 220, 0.03, 0.75 ),
			H( 8 + rng() * 6, 0.85, 0.48 ),
		];
	},
	/** Op art, Minimalism: black, white, one color. */
	mono( rng ) {
		return [ '#f7f5f0', '#111111', H( rng() * 360, 0.8, 0.5 ), '#8a8a8a' ];
	},
	/** Color field: luminous relatives at a chosen warmth. */
	luminous( rng ) {
		const h0 = rng() * 360;
		const comp = rng() < 0.4;
		return [
			H( h0, 0.7, 0.28 ),
			H( h0 + 12, 0.8, 0.45 ),
			H( h0 + 28, 0.85, 0.58 ),
			H( comp ? h0 + 175 : h0 - 20, 0.75, 0.5 ),
			H( h0 + 40, 0.6, 0.8 ),
		];
	},
	/** Art Informel, Collage: ash, bone, rust, oxide, faded blue, one hot. */
	muted( rng ) {
		return [
			H( 40, 0.12, 0.22 ),
			H( 40 + rng() * 10, 0.25, 0.86 ),
			H( 18 + rng() * 8, 0.6, 0.38 ),
			H( 25, 0.3, 0.55 ),
			H( 205 + rng() * 15, 0.25, 0.52 ),
			H( rng() < 0.5 ? 12 : 350, 0.9, 0.5 ),
		];
	},
	/** Action, Futurism, Biomorphic: black, white, red, blue, yellow, one more. */
	vivid( rng ) {
		return [
			'#f5f2ec',
			'#141414',
			H( 2 + rng() * 8, 0.85, 0.5 ),
			H( 220 + rng() * 15, 0.75, 0.45 ),
			H( 48 + rng() * 6, 0.95, 0.52 ),
			H( rng() < 0.5 ? 28 : 160, 0.8, 0.5 ),
		];
	},
	/** Pointillism: pure hues at mid lightness, complements included. */
	optical( rng ) {
		const h0 = rng() * 360;
		return [
			H( h0, 0.85, 0.55 ),
			H( h0 + 30, 0.85, 0.6 ),
			H( h0 + 180, 0.8, 0.5 ),
			H( h0 + 210, 0.75, 0.45 ),
			H( h0 + 90, 0.7, 0.62 ),
			H( 45, 0.5, 0.94 ),
		];
	},
};

/** Draw a palette in a school's taste (falls back to the curated list). */
export function paletteFor( mode, rng, fallback ) {
	const gen = PALETTE_MODES[ mode ];
	return gen ? gen( rng ) : ( fallback || [] ).slice();
}

/** Modes that sit close to each other in taste: a piece may borrow from these. */
export const NEIGHBOURS = {
	highkey: [ 'luminous', 'muted' ],
	pure: [ 'vivid', 'primaries' ],
	earth: [ 'muted', 'ink' ],
	primaries: [ 'pure', 'vivid' ],
	ink: [ 'mono', 'earth' ],
	mono: [ 'ink' ],
	luminous: [ 'highkey', 'vivid' ],
	muted: [ 'earth', 'highkey' ],
	vivid: [ 'pure', 'luminous' ],
	optical: [ 'mono', 'primaries' ],
};

/**
 * The palette mode for one piece: the school's own, a neighbour, or any
 * other - and never one of the modes the last pieces of this school used
 * when there is a choice.
 */
export function pickMode( own, borrow, rng, avoid = [] ) {
	const modes = Object.keys( PALETTE_MODES );
	let pool;
	if ( 'other' === borrow ) {
		pool = modes.filter( ( m ) => m !== own );
	} else if ( 'neighbour' === borrow ) {
		pool = ( NEIGHBOURS[ own ] || [] ).slice();
	} else {
		pool = [ own ];
	}
	if ( ! pool.length ) {
		pool = [ own ];
	}
	const fresh = pool.filter( ( m ) => ! avoid.includes( m ) );
	const from = fresh.length ? fresh : pool;
	return from[ Math.floor( rng() * from.length ) % from.length ];
}

/** Warm or cool the whole list a little, and widen or tighten its values. */
export function tunePalette( hexes, { temperature = 0, contrast = 1 } = {} ) {
	const list = ( hexes || [] ).map( hexRgb ).filter( Boolean );
	if ( ! list.length ) {
		return ( hexes || [] ).slice();
	}
	const warm = [ 1, 0.82, 0.55 ];
	const cool = [ 0.55, 0.78, 1 ];
	const mean = list.reduce( ( a, c ) => a + lum( c ), 0 ) / list.length;
	return list.map( ( c ) => {
		let out = c;
		if ( temperature ) {
			out = mix(
				out,
				temperature > 0 ? warm : cool,
				Math.min( 0.16, Math.abs( temperature ) * 0.16 )
			);
		}
		if ( 1 !== contrast ) {
			const l = lum( out );
			const want = mean + ( l - mean ) * contrast;
			out = shade( out, clamp01( want ) - l );
		}
		return toHex( out );
	} );
}

/** A school's palette for one piece, under its signature. */
export function pickPalette( school, signature, rng, avoidModes = [] ) {
	const sig = signature || {};
	const mode = pickMode(
		school.palette,
		sig.borrow || 'own',
		rng,
		avoidModes
	);
	const raw = paletteFor( mode, rng, paletteFor( school.palette, rng ) );
	return {
		mode,
		colors: tunePalette( raw, {
			temperature: sig.temperature || 0,
			contrast: sig.contrast || 1,
		} ),
	};
}

/** rgb triple to css. */
export const css = ( c, a = 1 ) =>
	`rgba(${ Math.round( clamp01( c[ 0 ] ) * 255 ) },${ Math.round(
		clamp01( c[ 1 ] ) * 255
	) },${ Math.round( clamp01( c[ 2 ] ) * 255 ) },${ Math.max(
		0,
		Math.min( 1, a )
	).toFixed( 3 ) })`;

/** rgb triple to #hex. */
export const toHex = ( c ) =>
	'#' +
	c
		.map( ( v ) =>
			Math.round( clamp01( v ) * 255 )
				.toString( 16 )
				.padStart( 2, '0' )
		)
		.join( '' );
