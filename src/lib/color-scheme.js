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

/**
 * Build a five-color scheme.
 *
 * @param {Object} opts { base: hex, harmony, spread 0..100,
 *                        saturation -100..100, lightness -100..100 }.
 * @return {string[]} Five hex colors.
 */
export function buildScheme( opts = {} ) {
	const {
		base = '#3b66ff',
		harmony = 'analogous',
		spread = 50,
		saturation = 0,
		lightness = 0,
	} = opts;
	const { r, g, b } = hexToRgb( base ) || { r: 59, g: 102, b: 255 };
	const { h, s, l } = rgbToHsl( r, g, b );
	const plan = slotPlan( harmony, spread / 50 );
	const sGlobal = clamp( s + saturation / 100, 0, 1 );
	const lGlobal = clamp( l + ( lightness / 100 ) * 0.4, 0.06, 0.94 );
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
 * Readable label color (dark or light) for a solid background.
 *
 * @param {string} color Background color.
 * @return {string} '#1a1c20' or '#ffffff'.
 */
export function labelColorFor( color ) {
	return colorLuminance( color ) > 0.55 ? '#1a1c20' : '#ffffff';
}
