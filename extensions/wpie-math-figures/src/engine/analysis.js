/** Bounded numerical analysis, never a symbolic proof. Poles must not become roots or integrals. */
export const finiteValue = ( f, x ) => {
	try {
		const y = f( x );
		return Number.isFinite( y ) ? y : NaN;
	} catch {
		return NaN;
	}
};
export function derivative( f, x ) {
	const h = 2e-4 * Math.max( 1, Math.abs( x ) );
	const center = finiteValue( f, x );
	const a = finiteValue( f, x - h ),
		b = finiteValue( f, x + h );
	const c = finiteValue( f, x - h / 2 ),
		d = finiteValue( f, x + h / 2 );
	if ( ! [ center, a, b, c, d ].every( Number.isFinite ) ) return NaN;
	const s1 = ( b - a ) / ( 2 * h ),
		s2 = ( d - c ) / h;
	// Reject corners and discontinuities as well as unstable derivatives.
	const left = ( center - c ) / ( h / 2 ),
		right = ( d - center ) / ( h / 2 );
	if (
		Math.abs( left - right ) > 0.02 * Math.max( 1, Math.abs( s2 ) ) ||
		Math.abs( s1 - s2 ) > 0.002 * Math.max( 1, Math.abs( s2 ) )
	)
		return NaN;
	return ( 4 * s2 - s1 ) / 3;
}
function bisect( f, lo, hi, tolerance ) {
	let a = finiteValue( f, lo );
	for ( let i = 0; i < 70; i++ ) {
		const m = ( lo + hi ) / 2,
			v = finiteValue( f, m );
		if ( ! Number.isFinite( v ) ) return null;
		if ( Math.abs( v ) < tolerance ) return m;
		if ( a < 0 === v < 0 ) {
			lo = m;
			a = v;
		} else hi = m;
	}
	const x = ( lo + hi ) / 2;
	return Math.abs( finiteValue( f, x ) ) < tolerance ? x : null;
}
export function roots( f, lo, hi, samples = 1200 ) {
	if ( ! Number.isFinite( lo ) || ! Number.isFinite( hi ) || hi <= lo )
		return [];
	const pts = Array.from( { length: samples + 1 }, ( _, i ) => {
		const x = lo + ( ( hi - lo ) * i ) / samples;
		return [ x, finiteValue( f, x ) ];
	} );
	const magnitudes = pts
		.map( ( p ) => Math.abs( p[ 1 ] ) )
		.filter( Number.isFinite )
		.sort( ( a, b ) => a - b );
	if ( ! magnitudes.length || magnitudes[ magnitudes.length - 1 ] === 0 )
		return [];
	const tolerance = Math.max(
		1e-12,
		Math.min(
			1e-7,
			( magnitudes[ Math.floor( magnitudes.length / 2 ) ] || 1 ) * 1e-9
		)
	);
	const out = [];
	const add = ( x ) => {
		if (
			x !== null &&
			Number.isFinite( x ) &&
			! out.some(
				( v ) =>
					Math.abs( v - x ) < Math.max( 1e-7, ( hi - lo ) * 1e-6 )
			)
		)
			out.push( x );
	};
	for ( let i = 0; i <= samples; i++ ) {
		const [ x, y ] = pts[ i ];
		if ( ! Number.isFinite( y ) ) continue;
		if ( y === 0 ) add( x );
		if ( i && y * pts[ i - 1 ][ 1 ] < 0 )
			add( bisect( f, pts[ i - 1 ][ 0 ], x, tolerance ) );
		// Touching roots: minimize |f| in a sampled local trough.
		if (
			i > 0 &&
			i < samples &&
			Math.abs( y ) < Math.abs( pts[ i - 1 ][ 1 ] ) &&
			Math.abs( y ) < Math.abs( pts[ i + 1 ][ 1 ] )
		) {
			let a = pts[ i - 1 ][ 0 ],
				b = pts[ i + 1 ][ 0 ];
			for ( let j = 0; j < 48; j++ ) {
				const c = a + ( b - a ) / 3,
					d = b - ( b - a ) / 3;
				if (
					Math.abs( finiteValue( f, c ) ) <
					Math.abs( finiteValue( f, d ) )
				)
					b = d;
				else a = c;
			}
			const m = ( a + b ) / 2;
			if ( Math.abs( finiteValue( f, m ) ) < tolerance ) add( m );
		}
		if ( out.length >= 80 ) break;
	}
	return out.sort( ( a, b ) => a - b );
}
export function extrema( f, lo, hi ) {
	const h = ( hi - lo ) / 5000;
	return roots( ( x ) => derivative( f, x ), lo, hi )
		.filter( ( x ) => x > lo + h && x < hi - h )
		.flatMap( ( x ) => {
			const y = finiteValue( f, x ),
				a = finiteValue( f, x - h ),
				b = finiteValue( f, x + h );
			if ( ! [ y, a, b ].every( Number.isFinite ) ) return [];
			const kind = y < a && y < b ? 'min' : y > a && y > b ? 'max' : null;
			return kind ? [ { x, y, kind } ] : [];
		} );
}
/** Adaptive Simpson, absolute geometric area. An exhausted error budget yields null. */
export function areaBetween( f, g, lo, hi ) {
	if ( ! [ lo, hi ].every( Number.isFinite ) || hi <= lo ) return null;
	const h = ( x ) => Math.abs( finiteValue( f, x ) - finiteValue( g, x ) );
	const scan = Array.from( { length: 513 }, ( _, i ) =>
		h( lo + ( ( hi - lo ) * i ) / 512 )
	);
	if ( scan.some( ( v ) => ! Number.isFinite( v ) ) ) return null;
	let budget = 40000;
	const simpson = ( a, b, fa, fm, fb ) =>
		( ( b - a ) * ( fa + 4 * fm + fb ) ) / 6;
	const recurse = ( a, b, fa, fm, fb, whole, eps, depth ) => {
		if ( --budget < 0 ) return NaN;
		const m = ( a + b ) / 2,
			fl = h( ( a + m ) / 2 ),
			fr = h( ( m + b ) / 2 );
		if ( ! [ fl, fr ].every( Number.isFinite ) ) return NaN;
		const l = simpson( a, m, fa, fl, fm ),
			r = simpson( m, b, fm, fr, fb ),
			delta = l + r - whole;
		if ( Math.abs( delta ) <= 15 * eps ) return l + r + delta / 15;
		if ( depth <= 0 ) return NaN;
		return (
			recurse( a, m, fa, fl, fm, l, eps / 2, depth - 1 ) +
			recurse( m, b, fm, fr, fb, r, eps / 2, depth - 1 )
		);
	};
	let result = 0;
	// Independent panels prevent a symmetric pole or periodic samples from cancelling.
	for ( let i = 0; i < 128; i++ ) {
		const a = lo + ( ( hi - lo ) * i ) / 128,
			b = lo + ( ( hi - lo ) * ( i + 1 ) ) / 128;
		const fa = h( a ),
			fm = h( ( a + b ) / 2 ),
			fb = h( b );
		result += recurse(
			a,
			b,
			fa,
			fm,
			fb,
			simpson( a, b, fa, fm, fb ),
			1e-8 / 128,
			18
		);
		if ( ! Number.isFinite( result ) ) return null;
	}
	return Math.max( 0, result );
}
