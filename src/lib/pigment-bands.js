/**
 * SIX BANDS: the spectral pigment model of spectral.js, cut down to what a
 * simulated FIELD can carry.
 *
 * The wet islands mixed paint in three channels. That is the arithmetic of
 * a colour filter, not of pigment: blue into yellow gave a dull olive, red
 * into blue a grey, white into anything a chalky tint - against the 38-band
 * model (spectral.js) a mix strayed by 18 steps of 255 on average and by
 * more than a hundred at worst (2000 random pairs, analysis of 09.11.2026).
 * Thirty-eight bands are ten more state textures per island; six are none:
 * a transparent wash has no scattering, so its three scattering channels
 * are free for three more bands of absorption, and a body paint scatters
 * alike in every band, so one number does for all of them.
 *
 * WHICH six is what makes it work. The seven primaries the model builds
 * every colour from (white, cyan, magenta, yellow, red, green, blue) are
 * nearly flat except where they turn, around 490 and 590 nm. Bands cut at
 * 480 / 500 / 520 / 580 / 600 nm keep the flat stretches whole and give
 * each turn a narrow band of its own (found by trying every way of cutting
 * the spectrum into six, tools: the scratch study of the analysis). Mixes
 * then land within 1.5 steps of the 38 bands on average.
 *
 * EVERY SINGLE COLOUR STAYS THE COLOUR PICKED. Averaging a primary over a
 * band loses a little of it, so the six-band primaries are corrected by
 * the smallest change that makes the way back exact (the correction lies
 * in the row space of the projection, so it is the least one can do).
 * Colour in, bands, colour out is the identity; only mixtures differ from
 * three channels - which is the point.
 *
 * Everything is derived from the model's own tables at load: nothing here
 * is typed in but the five cuts.
 */

import { SPECTRAL_R, SPECTRAL_CIE } from './spectral-tables';

export const BAND_COUNT = 6;

// Band edges as indices into the 38 ten-nanometre bins (380 nm + 10 i).
const CUTS = [ 0, 10, 12, 14, 20, 22, 38 ];
// No band reflects less than this: K = -ln( R ) has to stay a number.
const BAND_MIN = 0.002;

const XYZ_RGB = [
	[ 3.24096994190452, -1.53738317757009, -0.498610760293003 ],
	[ -0.969243636280879, 1.87596750150772, 0.0415550574071756 ],
	[ 0.0556300796969936, -0.203976958888976, 1.05697151424287 ],
];
// The seven primaries in linear RGB: white, cyan, magenta, yellow, red,
// green, blue (the order of the columns of SPECTRAL_R).
const PRIM_RGB = [
	[ 1, 1, 1 ],
	[ 0, 1, 1 ],
	[ 1, 0, 1 ],
	[ 1, 1, 0 ],
	[ 1, 0, 0 ],
	[ 0, 1, 0 ],
	[ 0, 0, 1 ],
];

const uncompand = ( x ) =>
	x > 0.04045 ? Math.pow( ( x + 0.055 ) / 1.055, 2.4 ) : x / 12.92;
const compand = ( x ) =>
	x > 0.0031308 ? 1.055 * Math.pow( x, 1 / 2.4 ) - 0.055 : x * 12.92;
const clamp01 = ( x ) => ( x < 0 ? 0 : x > 1 ? 1 : x );

function inverse3( m ) {
	const [ a, b, c ] = m[ 0 ];
	const [ d, e, f ] = m[ 1 ];
	const [ g, h, i ] = m[ 2 ];
	const A = e * i - f * h;
	const B = -( d * i - f * g );
	const C = d * h - e * g;
	const det = a * A + b * B + c * C;
	return [
		[ A / det, -( b * i - c * h ) / det, ( b * f - c * e ) / det ],
		[ B / det, ( a * i - c * g ) / det, -( a * f - c * d ) / det ],
		[ C / det, -( a * h - b * g ) / det, ( a * e - b * d ) / det ],
	];
}

/**
 * The projection (bands to linear RGB) and the seven primaries in bands.
 *
 * @return {{M: number[][], prim: number[][]}} M is 3 x 6, prim 7 x 6.
 */
function build() {
	const M = [ [], [], [] ];
	const prim = PRIM_RGB.map( () => [] );
	for ( let g = 0; g < BAND_COUNT; g++ ) {
		let x = 0;
		let y = 0;
		let z = 0;
		const sum = [ 0, 0, 0, 0, 0, 0, 0 ];
		for ( let i = CUTS[ g ]; i < CUTS[ g + 1 ]; i++ ) {
			x += SPECTRAL_CIE[ i ][ 0 ];
			y += SPECTRAL_CIE[ i ][ 1 ];
			z += SPECTRAL_CIE[ i ][ 2 ];
			for ( let k = 0; k < 7; k++ ) {
				sum[ k ] += SPECTRAL_R[ i ][ k ];
			}
		}
		for ( let c = 0; c < 3; c++ ) {
			M[ c ][ g ] =
				XYZ_RGB[ c ][ 0 ] * x +
				XYZ_RGB[ c ][ 1 ] * y +
				XYZ_RGB[ c ][ 2 ] * z;
		}
		for ( let k = 0; k < 7; k++ ) {
			prim[ k ][ g ] = sum[ k ] / ( CUTS[ g + 1 ] - CUTS[ g ] );
		}
	}
	// The smallest correction that makes M x primary its RGB exactly.
	const dot = ( a, b ) => a.reduce( ( s, v, i ) => s + v * b[ i ], 0 );
	const inv = inverse3(
		[ 0, 1, 2 ].map( ( a ) =>
			[ 0, 1, 2 ].map( ( b ) => dot( M[ a ], M[ b ] ) )
		)
	);
	for ( let k = 0; k < 7; k++ ) {
		const res = [ 0, 1, 2 ].map(
			( c ) => PRIM_RGB[ k ][ c ] - dot( M[ c ], prim[ k ] )
		);
		const lam = inv.map( ( row ) => dot( row, res ) );
		for ( let g = 0; g < BAND_COUNT; g++ ) {
			prim[ k ][ g ] +=
				M[ 0 ][ g ] * lam[ 0 ] +
				M[ 1 ][ g ] * lam[ 1 ] +
				M[ 2 ][ g ] * lam[ 2 ];
		}
	}
	// White reflects everything, EXACTLY: the tables are good to a part in
	// a thousand, and a band of white at 0.9998 is an absorption the
	// islands would add up step after step into a tint.
	prim[ 0 ] = prim[ 0 ].map( () => 1 );
	return { M, prim };
}

const { M: BAND_M, prim: BAND_PRIM } = build();

/**
 * How much of each primary a linear RGB colour holds (the split of
 * spectral.js toReflectance): white first, then what two channels share,
 * then what one has alone.
 *
 * @param {number} lr Linear red.
 * @param {number} lg Linear green.
 * @param {number} lb Linear blue.
 * @return {number[]} Seven weights.
 */
function primaryWeights( lr, lg, lb ) {
	const w = Math.min( lr, lg, lb );
	const r0 = lr - w;
	const g0 = lg - w;
	const b0 = lb - w;
	return [
		w,
		Math.min( g0, b0 ),
		Math.min( r0, b0 ),
		Math.min( r0, g0 ),
		Math.min( Math.max( 0, r0 - b0 ), Math.max( 0, r0 - g0 ) ),
		Math.min( Math.max( 0, g0 - b0 ), Math.max( 0, g0 - r0 ) ),
		Math.min( Math.max( 0, b0 - g0 ), Math.max( 0, b0 - r0 ) ),
	];
}

/**
 * A colour as six reflectances.
 *
 * @param {number} r Red, sRGB 0..1.
 * @param {number} g Green.
 * @param {number} b Blue.
 * @return {number[]} Six values, BAND_MIN..1.
 */
export function bandReflectance( r, g, b ) {
	const wt = primaryWeights( uncompand( r ), uncompand( g ), uncompand( b ) );
	const out = [];
	for ( let i = 0; i < BAND_COUNT; i++ ) {
		let s = 0;
		for ( let k = 0; k < 7; k++ ) {
			s += wt[ k ] * BAND_PRIM[ k ][ i ];
		}
		out.push( s < BAND_MIN ? BAND_MIN : s > 1 ? 1 : s );
	}
	return out;
}

/**
 * Six reflectances (or transmittances) as a colour.
 *
 * @param {number[]} bands Six values.
 * @return {number[]} sRGB 0..1.
 */
export function bandsToRgb( bands ) {
	return BAND_M.map( ( row ) => {
		let s = 0;
		for ( let i = 0; i < BAND_COUNT; i++ ) {
			s += row[ i ] * bands[ i ];
		}
		return compand( clamp01( s ) );
	} );
}

// A light pigment scatters several times more than a dark one (see
// pigmentOf in wet-styles.js, whose numbers these are).
const SCATTER_LIGHT = 6;
const SCATTER_CURVE = 3.5;
// The darkest a band of body paint gets: K over S of 40 is a reflectance
// of 1.2 %. (Three channels were held at 5; a band of a saturated pigment
// lies far below a channel of it, and at 5 every strong colour greyed.)
const KS_MAX = 40;

/**
 * A pigment for the islands, in bands - the six-band twin of pigmentOf.
 *
 * Transparent (sBase 0): k is the absorption per band, a full layer shows
 * exactly the colour picked. Body paint: k per band and ONE scattering s
 * for all of them; k over s is the body colour.
 *
 * @param {string} hex   #rrggbb.
 * @param {number} sBase The medium's scattering; 0 = transparent.
 * @param {number} kMul  The medium's strength.
 * @return {{k: number[], s: number}} Six absorptions, one scattering.
 */
export function bandPigment( hex, sBase, kMul ) {
	const c = ( o ) => {
		const v = parseInt( ( hex || '#000000' ).slice( o, o + 2 ), 16 ) / 255;
		return Math.min( 0.97, Math.max( 0.03, Number.isFinite( v ) ? v : 0 ) );
	};
	const ch = [ c( 1 ), c( 3 ), c( 5 ) ];
	const R = bandReflectance( ch[ 0 ], ch[ 1 ], ch[ 2 ] );
	const mul = kMul || 1;
	if ( ! sBase ) {
		return { k: R.map( ( v ) => -Math.log( v ) * mul ), s: 0 };
	}
	const light = ( ch[ 0 ] + ch[ 1 ] + ch[ 2 ] ) / 3;
	const boost = 1 + SCATTER_LIGHT * Math.pow( light, SCATTER_CURVE );
	return {
		k: R.map(
			( v ) =>
				Math.min( KS_MAX, ( ( 1 - v ) * ( 1 - v ) ) / ( 2 * v ) ) *
				sBase *
				boost *
				mul
		),
		s: sBase * boost,
	};
}

const vec3 = ( a ) =>
	`vec3( ${ a.map( ( v ) => v.toFixed( 7 ) ).join( ', ' ) } )`;

/**
 * The same model for the shaders: the six bands travel as two vec3 (lo =
 * bands 1 to 3, hi = bands 4 to 6).
 *
 *   vec3 bandsToRgb( vec3 lo, vec3 hi )          bands -> sRGB
 *   void bandsOf( vec3 srgb, out vec3 lo, out vec3 hi )   sRGB -> bands
 */
export const BANDS_GLSL = `
const vec3 BAND_M_LO[ 3 ] = vec3[ 3 ](
	${ BAND_M.map( ( row ) => vec3( row.slice( 0, 3 ) ) ).join( ',\n\t' ) }
);
const vec3 BAND_M_HI[ 3 ] = vec3[ 3 ](
	${ BAND_M.map( ( row ) => vec3( row.slice( 3 ) ) ).join( ',\n\t' ) }
);
const vec3 BAND_P_LO[ 7 ] = vec3[ 7 ](
	${ BAND_PRIM.map( ( row ) => vec3( row.slice( 0, 3 ) ) ).join( ',\n\t' ) }
);
const vec3 BAND_P_HI[ 7 ] = vec3[ 7 ](
	${ BAND_PRIM.map( ( row ) => vec3( row.slice( 3 ) ) ).join( ',\n\t' ) }
);

vec3 bandsToRgb( vec3 lo, vec3 hi ) {
	vec3 lin = clamp( vec3(
		dot( BAND_M_LO[ 0 ], lo ) + dot( BAND_M_HI[ 0 ], hi ),
		dot( BAND_M_LO[ 1 ], lo ) + dot( BAND_M_HI[ 1 ], hi ),
		dot( BAND_M_LO[ 2 ], lo ) + dot( BAND_M_HI[ 2 ], hi )
	), 0.0, 1.0 );
	return mix(
		lin * 12.92,
		1.055 * pow( lin, vec3( 1.0 / 2.4 ) ) - 0.055,
		step( vec3( 0.0031308 ), lin )
	);
}

void bandsOf( vec3 srgb, out vec3 lo, out vec3 hi ) {
	vec3 c = clamp( srgb, 0.0, 1.0 );
	vec3 lin = mix(
		c / 12.92,
		pow( ( c + 0.055 ) / 1.055, vec3( 2.4 ) ),
		step( vec3( 0.04045 ), c )
	);
	float w = min( lin.r, min( lin.g, lin.b ) );
	vec3 q = lin - w;
	float wt[ 7 ];
	wt[ 0 ] = w;
	wt[ 1 ] = min( q.g, q.b );
	wt[ 2 ] = min( q.r, q.b );
	wt[ 3 ] = min( q.r, q.g );
	wt[ 4 ] = min( max( 0.0, q.r - q.b ), max( 0.0, q.r - q.g ) );
	wt[ 5 ] = min( max( 0.0, q.g - q.b ), max( 0.0, q.g - q.r ) );
	wt[ 6 ] = min( max( 0.0, q.b - q.g ), max( 0.0, q.b - q.r ) );
	lo = vec3( 0.0 );
	hi = vec3( 0.0 );
	for ( int k = 0; k < 7; k++ ) {
		lo += wt[ k ] * BAND_P_LO[ k ];
		hi += wt[ k ] * BAND_P_HI[ k ];
	}
	lo = clamp( lo, ${ BAND_MIN }, 1.0 );
	hi = clamp( hi, ${ BAND_MIN }, 1.0 );
}
`;
