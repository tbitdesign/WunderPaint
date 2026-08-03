/**
 * Local 2×/4× upscale (spec 11.1, guaranteed keyless baseline):
 * separable Lanczos-3 resampling in a Web Worker.
 *
 * Protocol: postMessage({ data, width, height, factor }) →
 *           { data, width, height } | { error }
 */

const A = 3; // Lanczos window

function lanczos( x ) {
	if ( 0 === x ) {
		return 1;
	}
	if ( Math.abs( x ) >= A ) {
		return 0;
	}
	const pix = Math.PI * x;
	return ( A * Math.sin( pix ) * Math.sin( pix / A ) ) / ( pix * pix );
}

/** Resample one axis: src (w×h RGBA float) → dst (dw along the axis). */
function resampleAxis( src, w, h, dw, horizontal ) {
	const dh = h;
	const out = new Float32Array( ( horizontal ? dw * h : w * dw ) * 4 );
	const scale = horizontal ? w / dw : h / dw;
	const support = A * Math.max( 1, scale );

	const lineCount = horizontal ? h : w;
	const outLen = dw;

	for ( let line = 0; line < lineCount; line++ ) {
		for ( let o = 0; o < outLen; o++ ) {
			const center = ( o + 0.5 ) * scale - 0.5;
			const lo = Math.max( 0, Math.ceil( center - support ) );
			const hi = Math.min(
				( horizontal ? w : h ) - 1,
				Math.floor( center + support )
			);
			let norm = 0;
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for ( let i = lo; i <= hi; i++ ) {
				const weight = lanczos( ( i - center ) / Math.max( 1, scale ) );
				if ( 0 === weight ) {
					continue;
				}
				const idx = horizontal
					? ( line * w + i ) * 4
					: ( i * w + line ) * 4;
				norm += weight;
				// Premultiply by alpha to avoid dark halos at transparent edges.
				const alpha = src[ idx + 3 ];
				r += weight * src[ idx ] * alpha;
				g += weight * src[ idx + 1 ] * alpha;
				b += weight * src[ idx + 2 ] * alpha;
				a += weight * alpha;
			}
			const oIdx = horizontal
				? ( line * dw + o ) * 4
				: ( o * w + line ) * 4;
			if ( norm > 0 && a > 1e-6 ) {
				out[ oIdx ] = r / a;
				out[ oIdx + 1 ] = g / a;
				out[ oIdx + 2 ] = b / a;
				out[ oIdx + 3 ] = a / norm;
			}
		}
	}
	return { out, w: horizontal ? dw : w, h: horizontal ? dh : dw };
}

export function lanczosResize( rgba, w, h, dw, dh ) {
	// To float.
	const src = new Float32Array( rgba.length );
	for ( let i = 0; i < rgba.length; i++ ) {
		src[ i ] = rgba[ i ];
	}
	const pass1 = resampleAxis( src, w, h, dw, true );
	const pass2 = resampleAxis( pass1.out, pass1.w, pass1.h, dh, false );
	const out = new Uint8ClampedArray( dw * dh * 4 );
	for ( let i = 0; i < out.length; i++ ) {
		out[ i ] = pass2.out[ i ];
	}
	return out;
}

if (
	'function' === typeof self?.addEventListener &&
	'undefined' === typeof window
) {
	self.onmessage = ( event ) => {
		const { data, width, height, factor } = event.data;
		try {
			const dw = Math.round( width * factor );
			const dh = Math.round( height * factor );
			const out = lanczosResize( data, width, height, dw, dh );
			self.postMessage( { data: out, width: dw, height: dh }, [
				out.buffer,
			] );
		} catch ( err ) {
			self.postMessage( { error: err?.message || String( err ) } );
		}
	};
}
