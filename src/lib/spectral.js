/**
 * Kubelka-Munk pigment mixing, after Spectral.js (MIT, Ronald van Wijnen).
 *
 * WHY THIS EXISTS. Alpha compositing blends light: blue over yellow gives
 * grey. Paint does not work that way - it absorbs and scatters, and blue
 * over yellow gives green. This module is what lets a watercolour brush
 * behave like watercolour instead of like a coloured transparency.
 *
 * WHERE IT DOES NOT BELONG. Measured on a comparison page before this was
 * written: at FULL coverage the two models are indistinguishable, because
 * opaque paint is opaque either way. The difference lives entirely in
 * partial coverage. So this is the engine behind the translucent styles
 * (watercolour, smudge), never a global blend mode - that was tried on
 * paper and rejected as not worth the cost.
 *
 * THE ONE TRAP. The concentration goes in as the SQUARE of the factor
 * (`C = f^2 * L`). Handing it a linear amount makes a 4.5 % top-up behave
 * like 0.2 %; that cost an evening in the paint prototype. `mixOnto` takes
 * coverage directly and squares it here, so callers never meet it.
 *
 * The tables in spectral-tables.js are machined out of the GLSL, not typed:
 * 38 bands times seven primaries plus 38 CIE rows is not something to
 * transcribe by hand, and one wrong digit is a colour nobody can trace.
 */

import { SPECTRAL_R, SPECTRAL_CIE } from './spectral-tables';

const SIZE = 38;
const EPS = 1e-16;
const CIE_Y = SPECTRAL_CIE.map( ( c ) => c[ 1 ] );

const uncompand = ( x ) =>
	x > 0.04045 ? Math.pow( ( x + 0.055 ) / 1.055, 2.4 ) : x / 12.92;
const compand = ( x ) =>
	x > 0.0031308 ? 1.055 * Math.pow( x, 1 / 2.4 ) - 0.055 : x * 12.92;

/** Kubelka-Munk: reflectance to absorption over scattering, and back. */
const KS = ( r ) => ( ( 1 - r ) * ( 1 - r ) ) / ( 2 * r );
const KM = ( ks ) => 1 + ks - Math.sqrt( ks * ks + 2 * ks );

/**
 * A linear-RGB colour as 38 reflectance values.
 *
 * @param {number}       lr  Linear red.
 * @param {number}       lg  Linear green.
 * @param {number}       lb  Linear blue.
 * @param {Float64Array} out 38 values, written in place.
 */
function toReflectance( lr, lg, lb, out ) {
	const w = Math.min( lr, Math.min( lg, lb ) );
	const r0 = lr - w,
		g0 = lg - w,
		b0 = lb - w;
	const c = Math.min( g0, b0 );
	const m = Math.min( r0, b0 );
	const y = Math.min( r0, g0 );
	const r = Math.min( Math.max( 0, r0 - b0 ), Math.max( 0, r0 - g0 ) );
	const g = Math.min( Math.max( 0, g0 - b0 ), Math.max( 0, g0 - r0 ) );
	const b = Math.min( Math.max( 0, b0 - g0 ), Math.max( 0, b0 - r0 ) );
	for ( let i = 0; i < SIZE; i++ ) {
		const k = SPECTRAL_R[ i ];
		out[ i ] = Math.max(
			EPS,
			w * k[ 0 ] +
				c * k[ 1 ] +
				m * k[ 2 ] +
				y * k[ 3 ] +
				r * k[ 4 ] +
				g * k[ 5 ] +
				b * k[ 6 ]
		);
	}
}

/** #rrggbb to linear rgb, 0..1. */
export function hexToLinear( hex ) {
	const h = 7 === hex.length ? hex : '#000000';
	return [
		uncompand( parseInt( h.slice( 1, 3 ), 16 ) / 255 ),
		uncompand( parseInt( h.slice( 3, 5 ), 16 ) / 255 ),
		uncompand( parseInt( h.slice( 5, 7 ), 16 ) / 255 ),
	];
}

/**
 * A mixer bound to ONE paint colour.
 *
 * Everything about the paint is constant over a stroke, so it is computed
 * once here rather than a million times in the pixel loop. That alone is
 * the difference between 970 and 516 ms per megapixel, measured, with no
 * approximation whatsoever - it is the same arithmetic, hoisted.
 *
 * @param {string} hex Paint colour, #rrggbb.
 * @return {Function} mixOnto( r, g, b, coverage, out ) with 0..1 channels.
 */
export function makeMixer( hex ) {
	const [ lr, lg, lb ] = hexToLinear( hex );
	const Rp = new Float64Array( SIZE );
	toReflectance( lr, lg, lb, Rp );
	const KSp = new Float64Array( SIZE );
	let Lp = 0;
	for ( let i = 0; i < SIZE; i++ ) {
		KSp[ i ] = KS( Rp[ i ] );
		Lp += Rp[ i ] * CIE_Y[ i ];
	}
	const Rb = new Float64Array( SIZE );
	const Rm = new Float64Array( SIZE );

	return function mixOnto( r, g, b, coverage, out ) {
		const f = coverage < 0 ? 0 : coverage > 1 ? 1 : coverage;
		toReflectance( uncompand( r ), uncompand( g ), uncompand( b ), Rb );
		let Lb = 0;
		for ( let i = 0; i < SIZE; i++ ) {
			Lb += Rb[ i ] * CIE_Y[ i ];
		}
		// The squaring lives here so no caller ever has to know about it.
		const cb = ( 1 - f ) * ( 1 - f ) * Lb;
		const cp = f * f * Lp;
		const tot = cb + cp;
		if ( tot <= 0 ) {
			out[ 0 ] = r;
			out[ 1 ] = g;
			out[ 2 ] = b;
			return out;
		}
		const wb = cb / tot,
			wp = cp / tot;
		let x = 0,
			y = 0,
			z = 0;
		for ( let i = 0; i < SIZE; i++ ) {
			Rm[ i ] = KM( KS( Rb[ i ] ) * wb + KSp[ i ] * wp );
			const c = SPECTRAL_CIE[ i ];
			x += Rm[ i ] * c[ 0 ];
			y += Rm[ i ] * c[ 1 ];
			z += Rm[ i ] * c[ 2 ];
		}
		out[ 0 ] = compand(
			3.24096994190452 * x - 1.53738317757009 * y - 0.498610760293003 * z
		);
		out[ 1 ] = compand(
			-0.969243636280879 * x +
				1.87596750150772 * y +
				0.0415550574071756 * z
		);
		out[ 2 ] = compand(
			0.0556300796969936 * x -
				0.203976958888976 * y +
				1.05697151424287 * z
		);
		return out;
	};
}
