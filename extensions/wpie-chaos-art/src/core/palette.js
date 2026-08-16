/**
 * Colors: curated palettes, and a picker that cannot be broken.
 *
 * The picker clamps EVERYTHING. A sibling studio once crashed because a
 * scatter drove a color index to -1; since then the family rule is that
 * color lookup survives any input and always answers with a valid color.
 */

export const PALETTES = [
	{
		id: 'ember',
		label: 'Ember',
		colors: [ '#1a0b08', '#7a1e0c', '#d84315', '#ff9800', '#ffd54f' ],
	},
	{
		id: 'ocean',
		label: 'Deep Ocean',
		colors: [ '#04121f', '#0b3954', '#087e8b', '#31c3bd', '#bfe6e2' ],
	},
	{
		id: 'ultraviolet',
		label: 'Ultraviolet',
		colors: [ '#12041f', '#3b0f6f', '#7b2ff7', '#c724b1', '#ff6ec7' ],
	},
	{
		id: 'inkbone',
		label: 'Ink and Bone',
		colors: [ '#14120f', '#3a352c', '#6e675a', '#cfc4ae', '#b0322a' ],
	},
	{
		id: 'meadow',
		label: 'Meadow',
		colors: [ '#11250f', '#2e5d31', '#5d9c46', '#a5c94a', '#f4e879' ],
	},
	{
		id: 'aurora',
		label: 'Aurora',
		colors: [ '#03121a', '#0e5b4a', '#20b487', '#5be6c0', '#8f7bff' ],
	},
	{
		id: 'candy',
		label: 'Candy',
		colors: [ '#fdf3f6', '#ffb7d0', '#ff6f91', '#8ee3ef', '#fff3a1' ],
	},
	{
		id: 'gilded',
		label: 'Gilded',
		colors: [ '#191410', '#5c4420', '#a97e2f', '#e2b955', '#f6ecd2' ],
	},
	{
		id: 'crimson',
		label: 'Crimson',
		colors: [ '#1c060a', '#58101e', '#9e1b32', '#e5383b', '#ffccd5' ],
	},
	{
		id: 'mono',
		label: 'Monochrome',
		colors: [ '#101114', '#3c4048', '#7a8087', '#c3c7cd', '#f2f3f5' ],
	},
	{
		id: 'morning',
		label: 'Morning Light',
		colors: [ '#f6f1e7', '#f2c9c2', '#a8c6d9', '#c9d9b5', '#e8b25f' ],
	},
	{
		id: 'earthen',
		label: 'Earthen',
		colors: [ '#241d16', '#5a4632', '#8a6a4b', '#b4977a', '#d9cbb6' ],
	},
	{
		id: 'bauhaus',
		label: 'Primary',
		colors: [ '#f4f1ea', '#1a1a1a', '#d02e26', '#f4b400', '#1f5fa8' ],
	},
];

/** Hex to [r, g, b] in 0..1; any garbage becomes mid gray. */
export function hexRgb( hex ) {
	const m = /^#?([0-9a-f]{6})$/i.exec( String( hex || '' ).trim() );
	if ( ! m ) {
		return [ 0.5, 0.5, 0.5 ];
	}
	const n = parseInt( m[ 1 ], 16 );
	return [
		( ( n >> 16 ) & 255 ) / 255,
		( ( n >> 8 ) & 255 ) / 255,
		( n & 255 ) / 255,
	];
}

const clamp01 = ( v ) =>
	Number.isFinite( v ) ? Math.min( 1, Math.max( 0, v ) ) : 0.5;

/** Palette lookup that survives any index and any list. */
export function colorAt( colors, i ) {
	if ( ! Array.isArray( colors ) || ! colors.length ) {
		return [ 0.5, 0.5, 0.5 ];
	}
	let k = Number.isFinite( i ) ? Math.round( i ) : 0;
	k = ( ( k % colors.length ) + colors.length ) % colors.length;
	const c = colors[ k ];
	const rgb = Array.isArray( c ) ? c : hexRgb( c );
	return [ clamp01( rgb[ 0 ] ), clamp01( rgb[ 1 ] ), clamp01( rgb[ 2 ] ) ];
}

/** Blend of the two palette entries around a fractional position. */
export function colorAlong( colors, pos ) {
	const n = Array.isArray( colors ) ? colors.length : 0;
	if ( ! n ) {
		return [ 0.5, 0.5, 0.5 ];
	}
	const p = clamp01( pos ) * ( n - 1 );
	const a = colorAt( colors, Math.floor( p ) );
	const b = colorAt( colors, Math.ceil( p ) );
	const f = p - Math.floor( p );
	return [
		a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * f,
		a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * f,
		a[ 2 ] + ( b[ 2 ] - a[ 2 ] ) * f,
	];
}

/**
 * Pick a stroke color: the colorist's heat slides along the palette, a
 * painter's own bias keeps its trail coherent, accents jump to the
 * brightest entry so they read as events.
 *
 * @param {Array}    colors Palette (hex strings or rgb triples).
 * @param {Function} rng    Random source.
 * @param {number}   heat   0..1 position preference along the palette.
 * @param {number}   bias   The painter's personal offset, any number.
 * @param {boolean}  accent True for an accent event.
 * @return {number[]} [r, g, b] in 0..1.
 */
export function pickColor( colors, rng, heat, bias, accent ) {
	if ( accent ) {
		return brightest( colors );
	}
	const r = 'function' === typeof rng ? rng() : 0.5;
	const jitter = ( r - 0.5 ) * 0.34;
	const b = Number.isFinite( bias ) ? bias : 0;
	return colorAlong(
		colors,
		clamp01( ( Number.isFinite( heat ) ? heat : 0.5 ) + jitter + b )
	);
}

/** The palette's lightest entry - the accent voice. */
export function brightest( colors ) {
	const n = Array.isArray( colors ) ? colors.length : 0;
	let best = [ 0.9, 0.9, 0.9 ];
	let bestL = -1;
	for ( let i = 0; i < n; i++ ) {
		const c = colorAt( colors, i );
		const l = c[ 0 ] + c[ 1 ] + c[ 2 ];
		if ( l > bestL ) {
			bestL = l;
			best = c;
		}
	}
	return best;
}

/* ------------------------------ their own colors --------------------------- */

const hex2 = ( v ) =>
	Math.round( Math.max( 0, Math.min( 255, v ) ) )
		.toString( 16 )
		.padStart( 2, '0' );

/** HSL to '#rrggbb' (h 0..360, s/l 0..1). */
export function hslHex( h, s, l ) {
	const a = s * Math.min( l, 1 - l );
	const f = ( n ) => {
		const k = ( n + h / 30 ) % 12;
		return l - a * Math.max( -1, Math.min( k - 3, 9 - k, 1 ) );
	};
	return (
		'#' + hex2( f( 0 ) * 255 ) + hex2( f( 8 ) * 255 ) + hex2( f( 4 ) * 255 )
	);
}

/**
 * The society picks its own colors: a random base hue, a harmony
 * scheme, and a spread of lightness from ground to accent. Every call
 * is a palette nobody curated - one more thing the visitor never
 * chose and never sees twice.
 *
 * @param {Function} rng Random source.
 * @return {string[]} Five hex colors, dark to light.
 */
export function generatePalette( rng ) {
	const h0 = rng() * 360;
	const scheme = rng();
	const hues = [];
	if ( scheme < 0.35 ) {
		// Analogous: neighbors on the wheel.
		for ( let i = 0; i < 5; i++ ) {
			hues.push( h0 + ( i - 2 ) * ( 14 + rng() * 16 ) );
		}
	} else if ( scheme < 0.6 ) {
		// Complementary: the base and its opposite, unevenly split.
		hues.push(
			h0,
			h0 + 8,
			h0 - 10,
			h0 + 180 + ( rng() - 0.5 ) * 24,
			h0 + 180
		);
	} else if ( scheme < 0.85 ) {
		// Triadic.
		hues.push( h0, h0 + 120, h0 + 240, h0 + 8, h0 + 128 );
	} else {
		// One hue, one loud stranger.
		hues.push( h0, h0 + 4, h0 - 4, h0 + 2, h0 + 150 + rng() * 60 );
	}
	const sat = 0.35 + rng() * 0.5;
	const out = [];
	for ( let i = 0; i < 5; i++ ) {
		const l = 0.14 + ( i / 4 ) * ( 0.68 + rng() * 0.14 );
		const s = Math.max(
			0.08,
			Math.min( 0.95, sat + ( rng() - 0.5 ) * 0.25 )
		);
		out.push( hslHex( ( ( hues[ i ] % 360 ) + 360 ) % 360, s, l ) );
	}
	return out;
}
