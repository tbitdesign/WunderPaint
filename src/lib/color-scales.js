/**
 * Perceptual shades for the Color Schemer. The anchor is kept as its original
 * sRGB hex value; generated shades reduce chroma at the sRGB boundary instead
 * of clipping channels. No new color format enters palettes or documents.
 * Oklab matrices: Björn Ottosson, public-domain reference implementation:
 * https://bottosson.github.io/posts/oklab/
 */
import { hexToRgb, rgbToHex } from './color';
import { colorKey } from './color-replace';

const clamp = ( x, lo = 0, hi = 1 ) => Math.max( lo, Math.min( hi, x ) );
const linear = ( v ) =>
	v <= 0.04045 ? v / 12.92 : ( ( v + 0.055 ) / 1.055 ) ** 2.4;
const encoded = ( v ) =>
	v <= 0.0031308 ? 12.92 * v : 1.055 * v ** ( 1 / 2.4 ) - 0.055;

/** Validate through the same parser as the palette store; reject alpha. */
export function scaleBaseColor( value ) {
	const text = String( value ?? '' ).trim();
	const parsed = colorKey(
		/^[0-9a-f]{3,8}$/i.test( text ) ? '#' + text : text
	);
	return parsed && parsed.alpha === 1 && /^#[0-9a-f]{6}$/.test( parsed.key )
		? parsed.key
		: null;
}

export function hexToOklch( color ) {
	const rgb = hexToRgb( color );
	const [ r, g, b ] = [ rgb.r, rgb.g, rgb.b ].map( ( v ) =>
		linear( v / 255 )
	);
	const l = Math.cbrt(
		0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
	);
	const m = Math.cbrt(
		0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
	);
	const s = Math.cbrt(
		0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
	);
	const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
	const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
	const c = Math.hypot( a, bb );
	return {
		l: clamp( 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s ),
		c: c < 0.000001 ? 0 : c,
		h: c < 0.000001 ? 0 : ( Math.atan2( bb, a ) * 180 ) / Math.PI,
	};
}

function toLinearRgb( lightness, chroma, hue ) {
	const a = chroma * Math.cos( ( hue * Math.PI ) / 180 );
	const b = chroma * Math.sin( ( hue * Math.PI ) / 180 );
	const l = ( lightness + 0.3963377774 * a + 0.2158037573 * b ) ** 3;
	const m = ( lightness - 0.1055613458 * a - 0.0638541728 * b ) ** 3;
	const s = ( lightness - 0.0894841775 * a - 1.291485548 * b ) ** 3;
	return [
		4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
		-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
		-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
	];
}

/** Preserve lightness and hue, reducing only chroma until it fits sRGB. */
export function oklchToHex( { l, c, h } ) {
	const lightness = clamp( l );
	const inGamut = ( rgb ) =>
		rgb.every( ( v ) => v >= -1e-7 && v <= 1 + 1e-7 );
	let rgb = toLinearRgb( lightness, c, h );
	if ( ! inGamut( rgb ) ) {
		let low = 0;
		let high = c;
		for ( let i = 0; i < 24; i++ ) {
			const mid = ( low + high ) / 2;
			if ( inGamut( toLinearRgb( lightness, mid, h ) ) ) {
				low = mid;
			} else {
				high = mid;
			}
		}
		rgb = toLinearRgb( lightness, low, h );
	}
	return rgbToHex(
		...rgb.map( ( v ) => Math.round( encoded( clamp( v ) ) * 255 ) )
	);
}

/**
 * The closest lightness stop becomes the exact anchor. Matching neutrals use
 * the same lightness positions. Changing the count never changes the anchor.
 */
export function buildColorScales( value, { count = 7, tinted = true } = {} ) {
	const base = scaleBaseColor( value );
	if ( ! base ) {
		return null;
	}
	const size = Number.isFinite( count )
		? clamp( Math.round( count ), 3, 12 )
		: 7;
	const anchor = hexToOklch( base );
	const positions = Array.from(
		{ length: size },
		( _, i ) => 0.96 - ( 0.8 * i ) / ( size - 1 )
	);
	const nearest = positions.reduce(
		( best, l, i ) =>
			Math.abs( l - anchor.l ) < Math.abs( positions[ best ] - anchor.l )
				? i
				: best,
		0
	);
	positions[ nearest ] = anchor.l;
	positions.sort( ( a, b ) => b - a );
	const shades = positions.map( ( l ) => {
		const isAnchor = l === anchor.l;
		const amount =
			l < anchor.l
				? l / Math.max( anchor.l, 1e-7 )
				: ( 1 - l ) / Math.max( 1 - anchor.l, 1e-7 );
		return {
			color: isAnchor
				? base
				: oklchToHex( {
						l,
						c: anchor.c * Math.sqrt( clamp( amount ) ),
						h: anchor.h,
				  } ),
			lightness: l,
			anchor: isAnchor,
		};
	} );
	const neutrals = positions.map( ( l ) => ( {
		color: oklchToHex( {
			l,
			c: tinted
				? Math.min( 0.016, anchor.c * 0.15 ) *
				  Math.min( 1, l / 0.18, ( 1 - l ) / 0.14 )
				: 0,
			h: anchor.h,
		} ),
		lightness: l,
		anchor: false,
	} ) );
	return { base, shades, neutrals };
}

/**
 * Fit a palette or scale into the existing Color panel's eight-stop workflow.
 * Preserve both endpoints and the exact scale base. Preview and handoff share
 * this selection; repeated colors are intentional stops and remain intact.
 */
export function schemeGradientColors(
	colors,
	{ reversed = false, anchorIndex = -1 } = {}
) {
	if ( colors.length < 2 ) {
		return [];
	}
	const count = Math.min( 8, colors.length );
	const indices = Array.from( { length: count }, ( _, i ) =>
		Math.round( ( i * ( colors.length - 1 ) ) / ( count - 1 ) )
	);
	if (
		Number.isInteger( anchorIndex ) &&
		anchorIndex > 0 &&
		anchorIndex < colors.length - 1 &&
		! indices.includes( anchorIndex )
	) {
		let nearest = 1;
		for ( let i = 2; i < indices.length - 1; i++ ) {
			if (
				Math.abs( indices[ i ] - anchorIndex ) <
				Math.abs( indices[ nearest ] - anchorIndex )
			) {
				nearest = i;
			}
		}
		indices[ nearest ] = anchorIndex;
		indices.sort( ( a, b ) => a - b );
	}
	const result = indices.map( ( i ) => colors[ i ] );
	return reversed ? result.reverse() : result;
}
