/** Palette blending and inverse compositing, independent of the panel UI. */
import { parseColor, rgbToHex, toHexColor } from './color';
import { colorKey, scanColors, replaceColorMap } from './color-replace';

const clamp = ( n, lo, hi ) => Math.max( lo, Math.min( hi, n ) );
const channels = [ 'r', 'g', 'b' ];
const brightness = ( c ) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

export function mixColor( from, to, amount ) {
	const a = parseColor( from ),
		b = parseColor( to );
	const t = clamp( amount, 0, 1 );
	return rgbToHex(
		...channels.map( ( key ) =>
			Math.round( a[ key ] + ( b[ key ] - a[ key ] ) * t )
		)
	);
}

/** Pair dark with dark and light with light, including unequal palette lengths. */
export function blendPalettes( from, to, amount ) {
	const sorted = ( colors ) =>
		[
			...new Set(
				colors.map( ( c ) => colorKey( c )?.key ).filter( Boolean )
			),
		].sort(
			( a, b ) =>
				brightness( parseColor( a ) ) - brightness( parseColor( b ) )
		);
	const a = sorted( from ),
		b = sorted( to );
	if ( ! a.length || ! b.length ) {
		return [];
	}
	return a.map( ( color, i ) => {
		const index =
			a.length === 1
				? ( b.length - 1 ) / 2
				: ( i * ( b.length - 1 ) ) / ( a.length - 1 );
		const target = mixColor(
			b[ Math.floor( index ) ],
			b[ Math.ceil( index ) ],
			index % 1
		);
		return { from: color, to: mixColor( color, target, amount ) };
	} );
}

/**
 * Recolor the editable document colors through a { from: to } map (keys as
 * colorKey keys). Shared by Palette mix and the Color Schemer.
 */
export function mappingPatches( layers, doc, mapping ) {
	const result = replaceColorMap( layers, doc, mapping );
	// Relationships stay authoritative; recolor their sources, not the derived carrier.
	for ( const layer of layers ) {
		const patch = result.patches.get( layer.id );
		if ( ! patch || ! layer.colorLinks ) {
			continue;
		}
		for ( const field of Object.keys( layer.colorLinks ) ) {
			delete patch[ field ];
		}
		if ( Object.keys( patch ).length ) {
			patch.colorLinks = layer.colorLinks;
		} else {
			result.patches.delete( layer.id );
		}
	}
	result.changed = result.patches.size + ( result.doc ? 1 : 0 );
	return result;
}

export function paletteMixPatches( layers, doc, from, to, amount ) {
	const pairs = blendPalettes( from, to, amount );
	if ( ! pairs.length ) {
		return { patches: new Map(), doc: null, changed: 0 };
	}
	const mapping = {};
	for ( const color of scanColors( layers, doc ).colors ) {
		const c = parseColor( color.key );
		const distance = ( value ) => {
			const p = parseColor( value );
			return (
				3 * ( c.r - p.r ) ** 2 +
				4 * ( c.g - p.g ) ** 2 +
				2 * ( c.b - p.b ) ** 2
			);
		};
		const closest = pairs.reduce( ( best, pair ) =>
			distance( pair.from ) < distance( best.from ) ? pair : best
		);
		mapping[ color.key ] = closest.to;
	}
	return mappingPatches( layers, doc, mapping );
}

/** Solve output = zero + alpha * (black - zero + (white - black) * source). */
export function solveResultColor( { zero, black, white }, desired, alpha ) {
	const want = parseColor( desired );
	if ( [ zero, black, white ].some( ( p ) => p.a < 254 ) ) {
		return { error: 'transparent' };
	}
	if ( channels.some( ( k ) => white[ k ] - black[ k ] < 3 ) ) {
		return { error: 'covered' };
	}
	let minimum = 0;
	for ( const key of channels ) {
		const delta = want[ key ] - zero[ key ];
		const range =
			delta < 0 ? black[ key ] - zero[ key ] : white[ key ] - zero[ key ];
		if ( Math.abs( delta ) > 1 && ( range === 0 || delta / range < 0 ) ) {
			return { error: 'unreachable' };
		}
		if ( range ) {
			minimum = Math.max( minimum, delta / range );
		}
	}
	if ( minimum > 1.005 ) {
		return { error: 'unreachable' };
	}
	// Round UP to the stored 8-bit alpha, including a small quantization margin.
	minimum = Math.min( 1, Math.ceil( Math.max( 0, minimum ) * 255 ) / 255 );
	const used = clamp( Math.max( alpha, minimum, 1 / 255 ), 0, 1 );
	const rgb = channels.map( ( key ) =>
		clamp(
			Math.round(
				( 255 *
					( want[ key ] -
						zero[ key ] -
						used * ( black[ key ] - zero[ key ] ) ) ) /
					( used * ( white[ key ] - black[ key ] ) )
			),
			0,
			255
		)
	);
	return {
		color: toHexColor( ...rgb, used ),
		alpha: used,
		minimum,
		needsOpacity: minimum > alpha + 0.002,
	};
}
