/*!
 * Spectral.js reflectance data: Copyright (c) Ronald van Wijnen.
 * MIT License
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
/**
 * Conservative K/S pigment amounts, using WunderPaint's existing Spectral.js
 * reflectance tables (MIT, Ronald van Wijnen). Eight weighted wavelength bands
 * keep transport affordable. A small linear-RGB residual preserves unmixed
 * input colors despite that reduction. This is an artistic pigment model,
 * not a measurement of an arbitrary real pigment supplied as an RGB value.
 */
import {
	SPECTRAL_R,
	SPECTRAL_CIE,
} from '../../../../src/lib/spectral-tables.js';

const EDGES = [ 0, 6, 10, 13, 16, 19, 22, 26, 38 ];
const MATRIX = [
	[ 3.2409699419, -1.5373831776, -0.4986107603 ],
	[ -0.9692436363, 1.8759675015, 0.0415550574 ],
	[ 0.0556300797, -0.2039769589, 1.0569715142 ],
];
const linear = ( x ) =>
	x <= 0.04045 ? x / 12.92 : ( ( x + 0.055 ) / 1.055 ) ** 2.4;
const gamma = ( x ) =>
	x <= 0.0031308 ? x * 12.92 : 1.055 * x ** ( 1 / 2.4 ) - 0.055;
const clamp = ( x, a, b ) => Math.max( a, Math.min( b, x ) );
const BANDS = EDGES.slice( 0, -1 ).map( ( start, b ) => {
	const end = EDGES[ b + 1 ];
	const cie = [ 0, 1, 2 ].map( ( c ) =>
		SPECTRAL_CIE.slice( start, end ).reduce( ( s, row ) => s + row[ c ], 0 )
	);
	return {
		start,
		end,
		cie,
		rgb: MATRIX.map( ( row ) =>
			row.reduce( ( s, v, i ) => s + v * cie[ i ], 0 )
		),
	};
} );
export const PIGMENT_SUFFIXES = [
	'K0',
	'K1',
	'K2',
	'K3',
	'K4',
	'K5',
	'K6',
	'K7',
	'S',
	'CR',
	'CG',
	'CB',
];
export const PIGMENT_FIELDS = [ 'water', 'paint' ].flatMap( ( pool ) =>
	PIGMENT_SUFFIXES.map( ( key ) => pool + key )
);
const cache = new Map();

/** K and S are amounts: both can be added and transported linearly. */
export function encodePigment( hex ) {
	if ( cache.has( hex ) ) {
		return cache.get( hex );
	}
	const color = [ 1, 3, 5 ].map( ( i ) =>
		linear( parseInt( hex.slice( i, i + 2 ), 16 ) / 255 )
	);
	const [ lr, lg, lb ] = color;
	const w = Math.min( lr, lg, lb ),
		r = lr - w,
		g = lg - w,
		b = lb - w;
	const weights = [
		w,
		Math.min( g, b ),
		Math.min( r, b ),
		Math.min( r, g ),
		Math.min( Math.max( 0, r - b ), Math.max( 0, r - g ) ),
		Math.min( Math.max( 0, g - b ), Math.max( 0, g - r ) ),
		Math.min( Math.max( 0, b - g ), Math.max( 0, b - r ) ),
	];
	const values = new Float64Array( 12 );
	// Like the existing spectral mixer, luminance weights effective pigment
	// strength. The floor keeps black an effective absorbing pigment.
	values[ 8 ] = Math.max( 0.04, 0.2126 * lr + 0.7152 * lg + 0.0722 * lb );
	const decoded = [ 0, 0, 0 ];
	BANDS.forEach( ( band, k ) => {
		let sum = 0,
			weight = 0;
		for ( let i = band.start; i < band.end; i++ ) {
			const cw = SPECTRAL_CIE[ i ].reduce( ( a, v ) => a + v, 0 );
			sum +=
				SPECTRAL_R[ i ].reduce(
					( a, v, j ) => a + v * weights[ j ],
					0
				) * cw;
			weight += cw;
		}
		const reflectance = clamp( sum / weight, 0.005, 1 );
		values[ k ] =
			( ( 1 - reflectance ) ** 2 / ( 2 * reflectance ) ) * values[ 8 ];
		for ( let c = 0; c < 3; c++ ) {
			decoded[ c ] += band.rgb[ c ] * reflectance;
		}
	} );
	for ( let c = 0; c < 3; c++ ) {
		values[ 9 + c ] = color[ c ] - decoded[ c ];
	}
	if ( cache.size >= 256 ) {
		cache.delete( cache.keys().next().value );
	}
	cache.set( hex, values );
	return values;
}

export function addPigment( sim, pool, i, pigment, amount ) {
	for ( let k = 0; k < PIGMENT_SUFFIXES.length; k++ ) {
		sim[ pool + PIGMENT_SUFFIXES[ k ] ][ i ] += pigment[ k ] * amount;
	}
}

/** Output is an sRGB color, matching the existing optical shader inputs. */
export function decodePigment(
	fields,
	i,
	mass,
	out,
	extra = null,
	extraMass = 0
) {
	const total = mass + extraMass;
	if ( total < 0.000001 ) {
		out[ 0 ] = out[ 1 ] = out[ 2 ] = 0;
		return out;
	}
	const scattering = Math.max(
		1e-8,
		fields[ 8 ][ i ] + ( extra ? extra[ 8 ] * extraMass : 0 )
	);
	out[ 0 ] = out[ 1 ] = out[ 2 ] = 0;
	for ( let k = 0; k < 8; k++ ) {
		const ks =
			Math.max(
				0,
				fields[ k ][ i ] + ( extra ? extra[ k ] * extraMass : 0 )
			) / scattering;
		// Stable inverse of K/S; avoids cancellation for very dark mixtures.
		const reflection = 1 / ( 1 + ks + Math.sqrt( ks * ( ks + 2 ) ) );
		for ( let c = 0; c < 3; c++ ) {
			out[ c ] += reflection * BANDS[ k ].rgb[ c ];
		}
	}
	for ( let c = 0; c < 3; c++ ) {
		const residual =
			fields[ 9 + c ][ i ] + ( extra ? extra[ 9 + c ] * extraMass : 0 );
		out[ c ] = clamp(
			gamma( Math.max( 0, out[ c ] + residual / total ) ),
			0,
			1
		);
	}
	return out;
}

/** Old snapshots contain RGB pigment amounts, so recover their local colors. */
export function migratePigments( sim ) {
	for ( const material of [ 'water', 'oil', 'thick' ] ) {
		for ( let i = 0; i < sim.n; i++ ) {
			const mass = sim[ material ][ i ];
			if ( mass <= 0.000001 ) {
				continue;
			}
			const hex =
				'#' +
				[ 'R', 'G', 'B' ]
					.map( ( c ) =>
						Math.round(
							clamp( sim[ material + c ][ i ] / mass, 0, 1 ) * 255
						)
							.toString( 16 )
							.padStart( 2, '0' )
					)
					.join( '' );
			addPigment(
				sim,
				material === 'water' ? 'water' : 'paint',
				i,
				encodePigment( hex ),
				mass
			);
		}
	}
}
