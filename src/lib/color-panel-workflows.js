/** Small, deterministic helpers for the Color panel's palette workflows. */
import { hslToRgb, toHexColor } from './color';
import { siteStorage } from './local-storage';
import { normalizePanelColor } from './color-panel';
import { layerPaintPatch } from './layer-paint';
import { gradientFillPatch } from './gradient-fill-panel';

const clamp = ( value, max ) => Math.max( 0, Math.min( max, value ) );
const NUMBER = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?%?$/i;

/** Parse explicit CSS color values, without executing CSS or using black as a fallback. */
export function readPaletteColor( value ) {
	const text = String( value ).trim();
	if ( /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test( text ) ) {
		return normalizePanelColor( text );
	}
	if ( text.toLowerCase() === 'transparent' ) {
		return '#00000000';
	}
	const fn = text.match( /^(rgb|rgba|hsl|hsla)\(([^()]*)\)$/i );
	if ( ! fn ) {
		return null;
	}
	const body = fn[ 2 ].trim();
	const comma = body.includes( ',' );
	if ( comma && body.includes( '/' ) ) {
		return null;
	}
	const parts = comma
		? body.split( ',' ).map( ( s ) => s.trim() )
		: body.split( /\s*\/\s*/ );
	if ( ! comma && parts.length > 2 ) {
		return null;
	}
	const channels = comma
		? parts.slice( 0, 3 )
		: parts[ 0 ].trim().split( /\s+/ );
	const alpha = comma ? parts[ 3 ] : parts[ 1 ];
	if (
		channels.length !== 3 ||
		( comma && ! [ 3, 4 ].includes( parts.length ) )
	) {
		return null;
	}
	const numeric = ( s ) =>
		NUMBER.test( s ) && Number.isFinite( parseFloat( s ) );
	if ( alpha !== undefined && ! numeric( alpha ) ) {
		return null;
	}
	const a =
		alpha === undefined
			? 1
			: clamp(
					parseFloat( alpha ) / ( alpha.endsWith( '%' ) ? 100 : 1 ),
					1
			  );
	if ( fn[ 1 ].toLowerCase().startsWith( 'rgb' ) ) {
		if ( ! channels.every( numeric ) ) {
			return null;
		}
		const rgb = channels.map( ( s ) =>
			Math.round(
				clamp(
					( parseFloat( s ) / ( s.endsWith( '%' ) ? 100 : 1 ) ) *
						( s.endsWith( '%' ) ? 255 : 1 ),
					255
				)
			)
		);
		return toHexColor( ...rgb, a );
	}
	const hue = channels[ 0 ].match(
		/^([-+]?(?:\d+\.?\d*|\.\d+))(deg|turn|rad|grad)?$/i
	);
	if (
		! hue ||
		! channels
			.slice( 1 )
			.every( ( s ) => numeric( s ) && s.endsWith( '%' ) )
	) {
		return null;
	}
	const unit = { deg: 1, turn: 360, rad: 180 / Math.PI, grad: 0.9 };
	const h = +hue[ 1 ] * unit[ ( hue[ 2 ] || 'deg' ).toLowerCase() ];
	if ( ! Number.isFinite( h ) ) {
		return null;
	}
	const rgb = hslToRgb(
		h,
		clamp( parseFloat( channels[ 1 ] ), 100 ) / 100,
		clamp( parseFloat( channels[ 2 ] ), 100 ) / 100
	);
	return toHexColor( rgb.r, rgb.g, rgb.b, a );
}

/** Color lists or declaration values, never selectors, comments, URLs or quoted strings. */
export function parsePaletteText( value, limit = 12 ) {
	let text = String( value || '' )
		.slice( 0, 50000 )
		.replace( /\/\*[\s\S]*?\*\//g, ' ' )
		.replace( /url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi, ' ' );
	if ( text.includes( '{' ) || /(?:^|;)\s*[-\w]+\s*:/.test( text ) ) {
		text = [ ...text.matchAll( /(?:^|[;{])\s*[-\w]+\s*:\s*([^;{}]+)/g ) ]
			.map( ( m ) => m[ 1 ] )
			.join( ';' );
	}
	const tokens =
		text.match(
			/\b(?:rgba?|hsla?)\([^()]*\)|#[\da-f]+(?![\w-])|\btransparent\b/gi
		) || [];
	const all = [
		...new Set( tokens.map( readPaletteColor ).filter( Boolean ) ),
	];
	return { colors: all.slice( 0, limit ), total: all.length };
}

export function paletteGradientStops( colors ) {
	if ( colors.length < 2 || colors.length > 8 ) {
		return [];
	}
	const clean = colors.map( readPaletteColor );
	if ( clean.some( ( c ) => ! c ) ) {
		return [];
	}
	return clean.map( ( color, index ) => ( {
		at: index / ( clean.length - 1 ),
		color,
	} ) );
}

/** A gradient changes the chosen object's fill, never geometry, strokes or other layers. */
export function paletteGradientPatch(
	layer,
	colors,
	kind = 'linear',
	target = 'fill'
) {
	const stops = paletteGradientStops( colors );
	if (
		! layer ||
		layer.locked ||
		! [ 'shape', 'text' ].includes( layer.type ) ||
		! stops.length ||
		! [ 'linear', 'radial', 'angle' ].includes( kind )
	) {
		return null;
	}
	return target === 'stroke'
		? layerPaintPatch( layer, target, { type: 'gradient', stops, kind } )
		: { fillType: 'gradient', ...gradientFillPatch( { stops, kind } ) };
}

/** Keep duplicate colors: identical endpoints and repeated bands matter in a gradient. */
export function lineSamplePoints( from, to, count = 8 ) {
	if (
		! [ from?.x, from?.y, to?.x, to?.y ].every( Number.isFinite ) ||
		Math.hypot( to.x - from.x, to.y - from.y ) < 1
	) {
		return [];
	}
	const n = Math.max( 2, Math.min( 8, Math.round( count ) || 8 ) );
	return Array.from( { length: n }, ( _, i ) => ( {
		x: from.x + ( ( to.x - from.x ) * i ) / ( n - 1 ),
		y: from.y + ( ( to.y - from.y ) * i ) / ( n - 1 ),
	} ) );
}

const IMPORTED_KEY = 'wpie-imported-palette';
export function loadImportedPalette() {
	try {
		const values = JSON.parse(
			siteStorage.getItem( IMPORTED_KEY ) || '[]'
		);
		return Array.isArray( values )
			? [
					...new Set(
						values.map( readPaletteColor ).filter( Boolean )
					),
			  ].slice( 0, 12 )
			: [];
	} catch ( error ) {
		return [];
	}
}
export function saveImportedPalette( colors ) {
	siteStorage.setItem(
		IMPORTED_KEY,
		JSON.stringify( colors.slice( 0, 12 ) )
	);
}
