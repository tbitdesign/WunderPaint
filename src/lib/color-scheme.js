/**
 * Color scheme engine (v1.103.0): classic color-theory harmonies around
 * a base color, five slots each with its own tonal step, plus tasteful
 * randomization and a deterministic role mapping (background, surface,
 * text, primary, secondary) for the live preview.
 */

import {
	colorLuminance,
	hexToRgb,
	hslToRgb,
	rgbToHex,
	rgbToHsl,
} from './color';

export const HARMONIES = [
	'analogous',
	'complementary',
	'split',
	'triadic',
	'tetradic',
	'mono',
	'shades',
];

const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );

const hsl = ( h, s, l ) => {
	const { r, g, b } = hslToRgb(
		( ( h % 360 ) + 360 ) % 360,
		clamp( s, 0, 1 ),
		clamp( l, 0.04, 0.97 )
	);
	return rgbToHex( r, g, b );
};

/**
 * Hue offsets and lightness deltas for the five slots of a harmony.
 * `f` scales angular distance (spread slider, 1.0 at the default 50).
 */
function slotPlan( harmony, f ) {
	const a = clamp( 28 * f, 8, 60 ); // analogous/split angle
	switch ( harmony ) {
		case 'complementary':
			return {
				hues: [ 0, 0, 0, 180, 180 ],
				dl: [ -0.22, -0.08, 0.1, -0.05, 0.18 ],
			};
		case 'split':
			return {
				hues: [ 0, 0, 180 - a, 180 + a, 0 ],
				dl: [ -0.2, 0, -0.05, 0.08, 0.22 ],
			};
		case 'triadic':
			return {
				hues: [ 0, 0, 120, 240, 120 ],
				dl: [ -0.2, 0.05, -0.06, 0.02, 0.2 ],
			};
		case 'tetradic':
			return {
				hues: [ 0, 90, 180, 270, 0 ],
				dl: [ -0.15, -0.05, 0, 0.05, 0.2 ],
			};
		case 'mono': {
			const w = 0.16 * ( 0.5 + f / 2 );
			return {
				hues: [ 0, 0, 0, 0, 0 ],
				dl: [ -2 * w, -w, 0, w, 2 * w ],
			};
		}
		case 'shades': {
			// Absolute dark-to-light ladder, ignoring the base lightness.
			const w = 0.5 + 0.4 * clamp( f, 0, 1.6 ) * 0.5;
			return {
				hues: [ 0, 0, 0, 0, 0 ],
				abs: [
					0.5 - w * 0.4,
					0.5 - w * 0.2,
					0.5,
					0.5 + w * 0.2,
					0.5 + w * 0.4,
				],
			};
		}
		case 'analogous':
		default:
			return {
				hues: [ -2 * a, -a, 0, a, 2 * a ],
				dl: [ -0.16, -0.06, 0, 0.08, 0.18 ],
			};
	}
}

/** Eight slots keep the harmony's hue families and add distinct tonal steps. */
function eightSlotPlan( harmony, f ) {
	const a = clamp( 28 * f, 8, 60 );
	const plans = {
		analogous: {
			hues: [ -2 * a, -1.4 * a, -0.8 * a, 0, 0.5 * a, a, 1.5 * a, 2 * a ],
			dl: [ -0.25, -0.18, -0.1, 0, 0.06, 0.13, 0.2, 0.27 ],
		},
		complementary: {
			hues: [ 0, 0, 0, 0, 180, 180, 180, 180 ],
			dl: [ -0.25, -0.08, 0.08, 0.25, -0.21, -0.04, 0.13, 0.3 ],
		},
		split: {
			hues: [ 0, 0, 0, 180 - a, 180 - a, 180 + a, 180 + a, 0 ],
			dl: [ -0.25, 0, 0.25, -0.18, 0.12, -0.1, 0.2, 0.06 ],
		},
		triadic: {
			hues: [ 0, 0, 0, 120, 120, 120, 240, 240 ],
			dl: [ -0.27, -0.08, 0.12, -0.2, 0.02, 0.24, -0.14, 0.2 ],
		},
		tetradic: {
			hues: [ 0, 0, 90, 90, 180, 180, 270, 270 ],
			dl: [ -0.25, 0.1, -0.19, 0.16, -0.13, 0.22, -0.07, 0.28 ],
		},
	};
	if ( harmony === 'shades' ) {
		const width = 0.5 + 0.2 * clamp( f, 0, 1.6 );
		return {
			hues: Array( 8 ).fill( 0 ),
			abs: Array.from(
				{ length: 8 },
				( _, i ) => 0.5 + ( i / 7 - 0.5 ) * width
			),
		};
	}
	if ( harmony === 'mono' ) {
		const width = 0.3 + 0.3 * clamp( f / 2, 0, 1 );
		return {
			hues: Array( 8 ).fill( 0 ),
			dl: Array.from(
				{ length: 8 },
				( _, i ) => ( i / 7 - 0.5 ) * width
			),
		};
	}
	return plans[ harmony ] || plans.analogous;
}

/** Partner hues of the family harmonies, in degrees from the base. */
function familiesOf( harmony, a ) {
	switch ( harmony ) {
		case 'complementary':
			return [ 0, 180 ];
		case 'split':
			return [ 0, 180 - a, 180 + a ];
		case 'triadic':
			return [ 0, 120, 240 ];
		case 'tetradic':
			return [ 0, 90, 180, 270 ];
		default:
			return null;
	}
}

/**
 * Any other slot count (the Color Schemer edits palettes of one to twelve
 * colors). Analogous hues glide across the fan, monochromatic and shades
 * climb one ladder, the family harmonies share the slots out in blocks -
 * base family first - and each block climbs its own lightness ladder.
 */
function anySlotPlan( harmony, f, count ) {
	const n = Math.max( 1, Math.round( count ) || 1 );
	const at = ( i ) => ( n === 1 ? 0.5 : i / ( n - 1 ) );
	const each = ( fn ) => Array.from( { length: n }, ( _, i ) => fn( i ) );
	const a = clamp( 28 * f, 8, 60 );
	if ( harmony === 'shades' ) {
		const w = 0.5 + 0.4 * clamp( f, 0, 1.6 ) * 0.5;
		return {
			hues: each( () => 0 ),
			abs: each( ( i ) => 0.5 - w * 0.4 + w * 0.8 * at( i ) ),
		};
	}
	if ( harmony === 'mono' ) {
		const w = 0.16 * ( 0.5 + f / 2 );
		return {
			hues: each( () => 0 ),
			dl: each( ( i ) => -2 * w + 4 * w * at( i ) ),
		};
	}
	const families = familiesOf( harmony, a );
	if ( ! families ) {
		return {
			hues: each( ( i ) => -2 * a + 4 * a * at( i ) ),
			dl: each( ( i ) => -0.16 + 0.34 * at( i ) ),
		};
	}
	const family = each( ( i ) =>
		Math.min(
			families.length - 1,
			Math.floor( ( i * families.length ) / n )
		)
	);
	const dl = family.map( ( fam, i ) => {
		const first = family.indexOf( fam );
		const size = family.lastIndexOf( fam ) - first + 1;
		return size === 1 ? 0 : -0.2 + ( 0.4 * ( i - first ) ) / ( size - 1 );
	} );
	return { hues: family.map( ( fam ) => families[ fam ] ), dl };
}

/**
 * Build five colors by default, eight for the compact Color panel, or any
 * other count from one to twelve for the Color Schemer's palettes.
 *
 * @param {Object} opts { base: hex, harmony, spread 0..100,
 *                        saturation -100..100, lightness -100..100, count }.
 * @return {string[]} Hex colors, as many as `count`.
 */
export function buildScheme( opts = {} ) {
	const {
		count = 5,
		base = '#3b66ff',
		harmony = 'analogous',
		spread = 50,
		saturation = 0,
		lightness = 0,
	} = opts;
	const { r, g, b } = hexToRgb( base ) || { r: 59, g: 102, b: 255 };
	const { h, s, l } = rgbToHsl( r, g, b );
	let plan;
	if ( count === 8 ) {
		plan = eightSlotPlan( harmony, spread / 50 );
	} else if ( count === 5 ) {
		plan = slotPlan( harmony, spread / 50 );
	} else {
		plan = anySlotPlan( harmony, spread / 50, clamp( count, 1, 12 ) );
	}
	const sGlobal = clamp( s + saturation / 100, 0, 1 );
	const lGlobal = clamp(
		l + ( lightness / 100 ) * 0.4,
		count === 8 ? 0.3 : 0.06,
		count === 8 ? 0.7 : 0.94
	);
	return plan.hues.map( ( dh, i ) =>
		hsl(
			h + dh,
			sGlobal,
			plan.abs
				? clamp( plan.abs[ i ] + ( lightness / 100 ) * 0.4, 0.06, 0.96 )
				: lGlobal + plan.dl[ i ]
		)
	);
}

/**
 * Random but tasteful scheme parameters: any hue, but saturation and
 * lightness stay in ranges that produce usable palettes.
 *
 * @param {Function} rand Random source (0..1), injectable for tests.
 * @return {Object} { base, harmony, spread } for buildScheme.
 */
export function randomSchemeInput( rand = Math.random ) {
	const h = Math.floor( rand() * 360 );
	const s = 0.5 + rand() * 0.4;
	const l = 0.4 + rand() * 0.22;
	return {
		base: hsl( h, s, l ),
		harmony: HARMONIES[ Math.floor( rand() * HARMONIES.length ) ],
		spread: 30 + Math.round( rand() * 45 ),
	};
}

/**
 * Deterministic design roles for a scheme: background is the lightest,
 * text the darkest, primary the most saturated of the rest.
 *
 * @param {string[]} colors Scheme colors (any length >= 2).
 * @return {Object} { bg, surface, text, primary, secondary }.
 */
export function schemeRoles( colors ) {
	const byLum = [ ...colors ].sort(
		( x, y ) => colorLuminance( x ) - colorLuminance( y )
	);
	const text = byLum[ 0 ];
	const bg = byLum[ byLum.length - 1 ];
	const rest = byLum.slice( 1, -1 );
	const sat = ( c ) => {
		const { r, g, b } = hexToRgb( c ) || { r: 0, g: 0, b: 0 };
		return rgbToHsl( r, g, b ).s;
	};
	const bySat = [ ...rest ].sort( ( x, y ) => sat( y ) - sat( x ) );
	const primary = bySat[ 0 ] || text;
	const others = rest.filter( ( c ) => c !== primary );
	return {
		bg,
		surface: others[ others.length - 1 ] || bg,
		text,
		primary,
		secondary: others[ 0 ] || primary,
	};
}

/**
 * The most colorful of some colors (highest HSL chroma), or null when all
 * are close to gray, black or white. The Color Schemer starts its
 * harmonies from a design's accent rather than from whatever the
 * foreground color happens to be.
 *
 * @param {string[]} colors Hex colors.
 * @return {string|null} The accent, as given.
 */
export function mostColorful( colors ) {
	let best = null;
	let score = 0.15;
	for ( const color of colors || [] ) {
		const rgb = hexToRgb( color );
		if ( ! rgb ) {
			continue;
		}
		const { s, l } = rgbToHsl( rgb.r, rgb.g, rgb.b );
		const chroma = s * ( 1 - Math.abs( 2 * l - 1 ) );
		if ( chroma > score ) {
			score = chroma;
			best = color;
		}
	}
	return best;
}

/**
 * Readable label color (dark or light) for a solid background.
 *
 * @param {string} color Background color.
 * @return {string} '#1a1c20' or '#ffffff'.
 */
export function labelColorFor( color ) {
	return colorLuminance( color ) > 0.55 ? '#1a1c20' : '#ffffff';
}
