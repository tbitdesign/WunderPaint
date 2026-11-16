/**
 * Palette-derived gradient suggestions for the Color Schemer. The existing
 * harmony and perceptual scale engines supply the colors; every suggestion
 * fits the Color panel's evenly spaced stop workflow.
 */
import { buildScheme } from './color-scheme';
import {
	buildColorScales,
	scaleBaseColor,
	schemeGradientColors,
} from './color-scales';
import { PALETTE_MAX } from './palette-library';

const GROUPS = [
	'pairs',
	'soft',
	'contrast',
	'multicolor',
	'glow',
	'harmonies',
];

export function schemeGradientVariants( colors, scales ) {
	if ( ! scales ) {
		return [];
	}
	const palette = [
		...new Set( colors.map( scaleBaseColor ).filter( Boolean ) ),
	].slice( 0, PALETTE_MAX );
	const buckets = Object.fromEntries(
		[ 'scales', ...GROUPS ].map( ( group ) => [ group, [] ] )
	);
	const seen = new Set();
	const add = ( group, id, source, options = {} ) => {
		const stops = schemeGradientColors( source, options );
		if ( stops.length < 2 || new Set( stops ).size < 2 ) {
			return;
		}
		// Reverse is a separate UI control, not another supposed variation.
		const forward = stops.join( ',' );
		const backward = [ ...stops ].reverse().join( ',' );
		const key = forward < backward ? forward : backward;
		if ( seen.has( key ) ) {
			return;
		}
		seen.add( key );
		buckets[ group ].push( {
			id,
			group,
			colors: stops,
			index: buckets[ group ].length + 1,
		} );
	};
	add( 'scales', 'palette', palette );
	add(
		'scales',
		'shades',
		scales.shades.map( ( s ) => s.color ),
		{
			anchorIndex: scales.shades.findIndex( ( s ) => s.anchor ),
		}
	);
	add(
		'scales',
		'neutrals',
		scales.neutrals.map( ( s ) => s.color )
	);

	for ( let a = 0; a < palette.length; a++ ) {
		for ( let b = a + 1; b < palette.length; b++ ) {
			add( 'pairs', `pair-${ a }-${ b }`, [
				palette[ a ],
				palette[ b ],
			] );
		}
	}
	const tones = palette.map( ( color ) =>
		buildColorScales( color, { count: 7 } ).shades.map(
			( shade ) => shade.color
		)
	);
	palette.forEach( ( color, i ) => {
		const next = ( i + 1 ) % palette.length;
		const opposite =
			( i + Math.max( 1, Math.floor( palette.length / 2 ) ) ) %
			palette.length;
		add( 'soft', `soft-${ i }`, [
			tones[ i ][ 1 ],
			tones[ next ][ 0 ],
			tones[ next ][ 2 ],
		] );
		add( 'contrast', `contrast-${ i }`, [
			tones[ i ][ 6 ],
			color,
			tones[ opposite ][ 0 ],
		] );
		add( 'multicolor', `blend-${ i }`, [
			color,
			palette[ next ],
			palette[ opposite ],
		] );
		add( 'glow', `glow-${ i }`, [
			tones[ i ][ 6 ],
			color,
			tones[ i ][ 0 ],
			color,
			tones[ i ][ 6 ],
		] );
	} );
	for ( const harmony of [
		'analogous',
		'complementary',
		'split',
		'triadic',
		'tetradic',
		'mono',
	] ) {
		add(
			'harmonies',
			harmony,
			buildScheme( { base: scales.base, harmony, count: 5 } )
		);
	}

	// Mix the families so the first view already shows a varied selection.
	const result = [ ...buckets.scales ];
	for (
		let i = 0;
		i < Math.max( ...GROUPS.map( ( group ) => buckets[ group ].length ) );
		i++
	) {
		for ( const group of GROUPS ) {
			if ( buckets[ group ][ i ] ) {
				result.push( buckets[ group ][ i ] );
			}
		}
	}
	return result;
}
