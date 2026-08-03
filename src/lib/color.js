/**
 * Color helpers + the SHARED adjustments→filter mapping (spec 02.2).
 *
 * `adjustmentsToFilter` is used by BOTH the on-canvas preview and the export
 * rasterizer (via ctx.filter) so preview == output. `applyAdjustmentsPixels`
 * is the per-pixel fallback for browsers without ctx.filter, it implements
 * the same operations in the same order.
 *
 * Composition order (fixed): brightness(+exposure) → contrast →
 * saturate(+vibrance) → sepia(temperature) → hue-rotate(hue + temp shift).
 */

export function hexToRgb( hex ) {
	let value = String( hex || '' )
		.replace( '#', '' )
		.trim();
	if ( 3 === value.length || 4 === value.length ) {
		value = value
			.split( '' )
			.map( ( c ) => c + c )
			.join( '' );
	}
	if ( ! /^[0-9a-f]{6}([0-9a-f]{2})?$/i.test( value ) ) {
		return { r: 0, g: 0, b: 0, a: 1 };
	}
	const n = parseInt( value.slice( 0, 6 ), 16 );
	const a = 8 === value.length ? parseInt( value.slice( 6 ), 16 ) / 255 : 1;
	return {
		r: ( n >> 16 ) & 255,
		g: ( n >> 8 ) & 255,
		b: n & 255,
		a,
	};
}

/**
 * Any CSS color we emit or store (#rgb/#rgba/#rrggbb/#rrggbbaa,
 * rgb()/rgba()) → { r, g, b, a } (v1.0.2 free picker).
 *
 * @param {string} str Color string.
 * @return {{r: number, g: number, b: number, a: number}} RGBA.
 */
export function parseColor( str ) {
	const value = String( str || '' ).trim();
	const fn = value.match(
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i
	);
	if ( fn ) {
		return {
			r: Math.min( 255, Math.round( +fn[ 1 ] ) ),
			g: Math.min( 255, Math.round( +fn[ 2 ] ) ),
			b: Math.min( 255, Math.round( +fn[ 3 ] ) ),
			a:
				undefined === fn[ 4 ]
					? 1
					: Math.max( 0, Math.min( 1, +fn[ 4 ] ) ),
		};
	}
	return hexToRgb( value );
}

/**
 * Relative luminance of a CSS color, 0 (black) … 1 (white).
 * Mask painting maps this to alpha (white shows, black hides, spec 06.1).
 *
 * @param {string} color CSS color string.
 * @return {number} Luminance 0–1.
 */
export function colorLuminance( color ) {
	const c = parseColor( color );
	if ( ! c ) {
		return 0;
	}
	return ( 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b ) / 255;
}

/**
 * RGBA → hex (#rrggbb, or #rrggbbaa when alpha < 1).
 *
 * @param {number} r Red 0–255.
 * @param {number} g Green 0–255.
 * @param {number} b Blue 0–255.
 * @param {number} a Alpha 0–1 (default 1).
 * @return {string} Hex color.
 */
export function toHexColor( r, g, b, a = 1 ) {
	const hex = rgbToHex( r, g, b );
	if ( a >= 1 ) {
		return hex;
	}
	return (
		hex +
		Math.max( 0, Math.min( 255, Math.round( a * 255 ) ) )
			.toString( 16 )
			.padStart( 2, '0' )
	);
}

/**
 * RGB (0–255) → HSL (h 0–360, s/l 0–1).
 *
 * @param {number} r Red.
 * @param {number} g Green.
 * @param {number} b Blue.
 * @return {{h: number, s: number, l: number}} HSL.
 */
export function rgbToHsl( r, g, b ) {
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max( rn, gn, bn );
	const min = Math.min( rn, gn, bn );
	const l = ( max + min ) / 2;
	const d = max - min;
	if ( ! d ) {
		return { h: 0, s: 0, l };
	}
	const sat = d / ( 1 - Math.abs( 2 * l - 1 ) );
	let h = 0;
	if ( max === rn ) {
		h = 60 * ( ( ( gn - bn ) / d ) % 6 );
	} else if ( max === gn ) {
		h = 60 * ( ( bn - rn ) / d + 2 );
	} else {
		h = 60 * ( ( rn - gn ) / d + 4 );
	}
	return { h: ( h + 360 ) % 360, s: sat, l };
}

/**
 * HSL (h 0–360, s/l 0–1) → RGB (0–255).
 *
 * @param {number} h Hue.
 * @param {number} s Saturation.
 * @param {number} l Lightness.
 * @return {{r: number, g: number, b: number}} RGB.
 */
export function hslToRgb( h, s, l ) {
	const hh = ( ( h % 360 ) + 360 ) % 360;
	const c = ( 1 - Math.abs( 2 * l - 1 ) ) * s;
	const x = c * ( 1 - Math.abs( ( ( hh / 60 ) % 2 ) - 1 ) );
	const m = l - c / 2;
	const idx = Math.floor( hh / 60 ) % 6;
	const [ r, g, b ] = [
		[ c, x, 0 ],
		[ x, c, 0 ],
		[ 0, c, x ],
		[ 0, x, c ],
		[ x, 0, c ],
		[ c, 0, x ],
	][ idx ];
	return {
		r: Math.round( ( r + m ) * 255 ),
		g: Math.round( ( g + m ) * 255 ),
		b: Math.round( ( b + m ) * 255 ),
	};
}

export const rgbToHex = ( r, g, b ) =>
	'#' +
	[ r, g, b ]
		.map( ( v ) =>
			Math.max( 0, Math.min( 255, Math.round( v ) ) )
				.toString( 16 )
				.padStart( 2, '0' )
		)
		.join( '' );

/**
 * Hex → HSV (h 0–360, s/v 0–1) for the free picker (v1.0.1).
 *
 * @param {string} hex #rgb/#rrggbb.
 * @return {{h: number, s: number, v: number}} HSV triple.
 */
export function hexToHsv( hex ) {
	const { r, g, b } = hexToRgb( hex );
	const rn = r / 255;
	const gn = g / 255;
	const bn = b / 255;
	const max = Math.max( rn, gn, bn );
	const min = Math.min( rn, gn, bn );
	const d = max - min;
	let h = 0;
	if ( d ) {
		if ( max === rn ) {
			h = 60 * ( ( ( gn - bn ) / d ) % 6 );
		} else if ( max === gn ) {
			h = 60 * ( ( bn - rn ) / d + 2 );
		} else {
			h = 60 * ( ( rn - gn ) / d + 4 );
		}
	}
	if ( h < 0 ) {
		h += 360;
	}
	return { h, s: max ? d / max : 0, v: max };
}

/**
 * HSV (h 0–360, s/v 0–1) → hex.
 *
 * @param {number} h Hue.
 * @param {number} s Saturation.
 * @param {number} v Value.
 * @return {string} #rrggbb.
 */
export function hsvToHex( h, s, v ) {
	const hh = ( ( h % 360 ) + 360 ) % 360;
	const c = v * s;
	const x = c * ( 1 - Math.abs( ( ( hh / 60 ) % 2 ) - 1 ) );
	const m = v - c;
	const idx = Math.floor( hh / 60 ) % 6;
	const [ r, g, b ] = [
		[ c, x, 0 ],
		[ x, c, 0 ],
		[ 0, c, x ],
		[ 0, x, c ],
		[ x, 0, c ],
		[ c, 0, x ],
	][ idx ];
	return rgbToHex( ( r + m ) * 255, ( g + m ) * 255, ( b + m ) * 255 );
}

const round3 = ( n ) => Math.round( n * 1000 ) / 1000;

/**
 * Decompose adjustments into primitive amounts (shared by both paths).
 * @param a
 */
function primitives( a ) {
	const adj = a || {};
	const brightness =
		1 +
		( adj.brightness || 0 ) / 100 +
		( ( adj.exposure || 0 ) / 100 ) * 0.8;
	const contrast = 1 + ( adj.contrast || 0 ) / 100;
	const saturate = Math.max(
		0,
		( 1 + ( adj.saturation || 0 ) / 100 ) *
			( 1 + ( ( adj.vibrance || 0 ) / 100 ) * 0.5 )
	);
	const temp = adj.temp || 0;
	const sepia = Math.min( 1, ( Math.abs( temp ) / 100 ) * 0.35 );
	const hue =
		( adj.hue || 0 ) + ( temp > 0 ? -12 : 18 ) * ( Math.abs( temp ) / 100 );
	return {
		brightness: Math.max( 0, brightness ),
		contrast: Math.max( 0, contrast ),
		saturate,
		sepia,
		hue,
	};
}

/**
 * CSS/canvas filter string for a set of adjustments (spec 02.2).
 *
 * @param {Object|null} a Adjustments.
 * @return {string} Filter string ('' when neutral).
 */
export function adjustmentsToFilter( a ) {
	if ( ! a ) {
		return '';
	}
	const p = primitives( a );
	const parts = [];
	if ( 1 !== p.brightness ) {
		parts.push( `brightness(${ round3( p.brightness ) })` );
	}
	if ( 1 !== p.contrast ) {
		parts.push( `contrast(${ round3( p.contrast ) })` );
	}
	if ( 1 !== p.saturate ) {
		parts.push( `saturate(${ round3( p.saturate ) })` );
	}
	if ( 0 !== p.sepia ) {
		parts.push( `sepia(${ round3( p.sepia ) })` );
	}
	if ( 0 !== p.hue ) {
		parts.push( `hue-rotate(${ round3( p.hue ) }deg)` );
	}
	return parts.join( ' ' );
}

/* --------------------------------------------------------------------- *
 * Pixel fallback (no ctx.filter): same primitives, same order.
 * Matrices follow the SVG/CSS filter-effects spec definitions.
 * --------------------------------------------------------------------- */

const LUMA = { r: 0.2126, g: 0.7152, b: 0.0722 };

function saturateMatrix( s ) {
	return [
		LUMA.r + ( 1 - LUMA.r ) * s,
		LUMA.g * ( 1 - s ),
		LUMA.b * ( 1 - s ),
		LUMA.r * ( 1 - s ),
		LUMA.g + ( 1 - LUMA.g ) * s,
		LUMA.b * ( 1 - s ),
		LUMA.r * ( 1 - s ),
		LUMA.g * ( 1 - s ),
		LUMA.b + ( 1 - LUMA.b ) * s,
	];
}

function sepiaMatrix( t ) {
	// interpolate identity → full sepia (CSS spec constants).
	const i = 1 - t;
	return [
		0.393 + 0.607 * i,
		0.769 - 0.769 * i,
		0.189 - 0.189 * i,
		0.349 - 0.349 * i,
		0.686 + 0.314 * i,
		0.168 - 0.168 * i,
		0.272 - 0.272 * i,
		0.534 - 0.534 * i,
		0.131 + 0.869 * i,
	];
}

function hueRotateMatrix( deg ) {
	const rad = ( deg * Math.PI ) / 180;
	const c = Math.cos( rad );
	const s = Math.sin( rad );
	return [
		0.213 + c * 0.787 - s * 0.213,
		0.715 - c * 0.715 - s * 0.715,
		0.072 - c * 0.072 + s * 0.928,
		0.213 - c * 0.213 + s * 0.143,
		0.715 + c * 0.285 + s * 0.14,
		0.072 - c * 0.072 - s * 0.283,
		0.213 - c * 0.213 - s * 0.787,
		0.715 - c * 0.715 + s * 0.715,
		0.072 + c * 0.928 + s * 0.072,
	];
}

const multiply3 = ( a, b ) => {
	const out = new Array( 9 );
	for ( let r = 0; r < 3; r++ ) {
		for ( let c = 0; c < 3; c++ ) {
			out[ r * 3 + c ] =
				a[ r * 3 ] * b[ c ] +
				a[ r * 3 + 1 ] * b[ 3 + c ] +
				a[ r * 3 + 2 ] * b[ 6 + c ];
		}
	}
	return out;
};

/**
 * In-place pixel implementation of the same adjustment chain.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} img Buffer.
 * @param {Object|null}                                              a   Adjustments.
 */
export function applyAdjustmentsPixels( img, a ) {
	if ( ! a ) {
		return img;
	}
	const p = primitives( a );
	if (
		1 === p.brightness &&
		1 === p.contrast &&
		1 === p.saturate &&
		0 === p.sepia &&
		0 === p.hue
	) {
		return img;
	}

	// Combined color matrix: hue ∘ sepia ∘ saturate (row-vector order matches
	// sequential application saturate → sepia → hue).
	let m = saturateMatrix( p.saturate );
	if ( p.sepia ) {
		m = multiply3( sepiaMatrix( p.sepia ), m );
	}
	if ( p.hue ) {
		m = multiply3( hueRotateMatrix( p.hue ), m );
	}

	const { data } = img;
	const bright = p.brightness;
	const contrast = p.contrast;
	for ( let i = 0; i < data.length; i += 4 ) {
		let r = data[ i ] * bright;
		let g = data[ i + 1 ] * bright;
		let b = data[ i + 2 ] * bright;
		r = ( r - 127.5 ) * contrast + 127.5;
		g = ( g - 127.5 ) * contrast + 127.5;
		b = ( b - 127.5 ) * contrast + 127.5;
		data[ i ] = m[ 0 ] * r + m[ 1 ] * g + m[ 2 ] * b;
		data[ i + 1 ] = m[ 3 ] * r + m[ 4 ] * g + m[ 5 ] * b;
		data[ i + 2 ] = m[ 6 ] * r + m[ 7 ] * g + m[ 8 ] * b;
	}
	return img;
}

/**
 * Whether a set of adjustments is neutral (all zero).
 * @param a
 */
export const isNeutralAdjust = ( a ) =>
	! a || Object.values( a ).every( ( v ) => ! v );
