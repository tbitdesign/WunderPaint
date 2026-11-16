/**
 * The bath travels with the layer (21.10.2026). Thomas: an edited Fluid Lab
 * layer reopened at the starting point of a new one, "er speichert da
 * nichts". Since the audit of 11.09.2026 the layer kept only the settings:
 * the raw grid (every field of every cell, float32 as base64) is 6 to 8 MB,
 * and a few such layers ran a save into the 32 MB ceiling of /designs.
 *
 * Packed, the same bath is a few hundred KB:
 * - a field that holds one value in every cell (most of the 81 in a typical
 *   bath) is stored as that value;
 * - the rest of a surface bath as half floats, three significant digits,
 *   far finer than the picture shows; a field beyond the half range stays
 *   float32. A volume bath stays float32 throughout: it is a few thousand
 *   particles, small anyway, and their spacing is what the solver feels;
 * - their bytes split into planes (all low bytes, then all high bytes) and
 *   deflated.
 *
 * A bath that still packs too large stays out of the layer, as before, and
 * the layer reopens from its settings. Everything that leaves the studio
 * (the layer, the switch to Classic) carries the packed form; the studio
 * itself only ever sees the plain snapshot `restoreSimulation` reads.
 */

/** Packed data, base64 characters. A packed bath measures 0.3 to 0.6 MB. */
export const MAX_PACKED = 2 * 1024 * 1024;
const MAX_FIELDS = 128;
const MAX_CELLS = 160 * 160;
const HALF_MAX = 65504;

const f32 = new Float32Array( 1 );
const u32 = new Uint32Array( f32.buffer );

/**
 * Float to IEEE half bits, rounded to nearest even, subnormals included.
 *
 * @param {number} value Finite, at most HALF_MAX in size.
 * @return {number} The 16 bits.
 */
export function toHalf( value ) {
	f32[ 0 ] = value;
	const x = u32[ 0 ];
	const sign = ( x >>> 16 ) & 0x8000;
	const exp = ( x >>> 23 ) & 0xff;
	let mant = x & 0x7fffff;
	if ( exp === 0xff ) {
		return sign | 0x7c00 | ( mant ? 0x200 : 0 );
	}
	const e = exp - 112;
	if ( e >= 31 ) {
		return sign | 0x7c00;
	}
	if ( e <= 0 ) {
		if ( e < -10 ) {
			return sign;
		}
		mant |= 0x800000;
		const shift = 14 - e;
		const half = mant >>> shift;
		const rest = mant & ( ( 1 << shift ) - 1 );
		const mid = 1 << ( shift - 1 );
		return (
			sign |
			( half + ( rest > mid || ( rest === mid && half & 1 ) ? 1 : 0 ) )
		);
	}
	const half = ( e << 10 ) | ( mant >>> 13 );
	const rest = mant & 0x1fff;
	// A carry out of the mantissa steps the exponent, as it should.
	return (
		sign |
		( half + ( rest > 0x1000 || ( rest === 0x1000 && half & 1 ) ? 1 : 0 ) )
	);
}

/**
 * IEEE half bits to a float.
 *
 * @param {number} bits The 16 bits.
 * @return {number} The value.
 */
export function fromHalf( bits ) {
	const sign = bits & 0x8000 ? -1 : 1;
	const exp = ( bits >>> 10 ) & 0x1f;
	const mant = bits & 0x3ff;
	if ( exp === 0 ) {
		return sign * mant * 2 ** -24;
	}
	if ( exp === 31 ) {
		return mant ? NaN : sign * Infinity;
	}
	return sign * ( 1 + mant / 1024 ) * 2 ** ( exp - 15 );
}

const toBase64 = ( bytes ) => {
	let text = '';
	for ( let i = 0; i < bytes.length; i += 8192 ) {
		text += String.fromCharCode( ...bytes.subarray( i, i + 8192 ) );
	}
	return btoa( text );
};
const fromBase64 = ( text ) => {
	const raw = atob( text );
	const bytes = new Uint8Array( raw.length );
	for ( let i = 0; i < raw.length; i++ ) {
		bytes[ i ] = raw.charCodeAt( i );
	}
	return bytes;
};

const canZip = () =>
	typeof CompressionStream === 'function' &&
	typeof DecompressionStream === 'function';

async function deflate( bytes ) {
	const stream = new Blob( [ bytes ] )
		.stream()
		.pipeThrough( new CompressionStream( 'deflate-raw' ) );
	return new Uint8Array( await new Response( stream ).arrayBuffer() );
}

// Reads no further than the size the pack announces: a forged layer cannot
// inflate into gigabytes.
async function inflate( bytes, size ) {
	const reader = new Blob( [ bytes ] )
		.stream()
		.pipeThrough( new DecompressionStream( 'deflate-raw' ) )
		.getReader();
	const out = new Uint8Array( size );
	let at = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if ( done ) {
			break;
		}
		if ( at + value.length > size ) {
			reader.cancel().catch( () => {} );
			throw new Error( 'Invalid fluid pack' );
		}
		out.set( value, at );
		at += value.length;
	}
	if ( at !== size ) {
		throw new Error( 'Invalid fluid pack' );
	}
	return out;
}

// Cells per field: the grid of a surface bath, the particles of a volume.
const cellsOf = ( snap ) =>
	snap?.kind === 'volume' ? snap.count : snap?.w * snap?.h;

/**
 * A plain snapshot (FluidSimulation or VolumeSimulation) packed small.
 *
 * @param {Object} snap What `sim.snapshot()` returned.
 * @return {Promise<Object|null>} The packed snapshot, or null when it does
 *                                not pack below MAX_PACKED.
 */
export async function packSnapshot( snap ) {
	const n = cellsOf( snap );
	if ( ! Number.isInteger( n ) || n < 1 || typeof snap.data !== 'string' ) {
		return null;
	}
	const bytes = fromBase64( snap.data );
	const values = new Float32Array( bytes.buffer, 0, bytes.length >> 2 );
	const count = values.length / n;
	if ( ! Number.isInteger( count ) || count > MAX_FIELDS ) {
		return null;
	}
	const exact = snap.kind === 'volume';
	const fields = [];
	const halves = [];
	const wides = [];
	for ( let k = 0; k < count; k++ ) {
		const field = values.subarray( k * n, ( k + 1 ) * n );
		const first = field[ 0 ];
		let same = true,
			max = 0;
		for ( let i = 0; i < n; i++ ) {
			same = same && field[ i ] === first;
			max = Math.max( max, Math.abs( field[ i ] ) );
		}
		if ( same && ! Object.is( first, -0 ) ) {
			fields.push( first );
		} else if ( ! exact && max <= HALF_MAX ) {
			fields.push( 'h' );
			halves.push( field );
		} else {
			fields.push( 'f' );
			wides.push( field );
		}
	}
	const planes = new Uint8Array(
		n * ( halves.length * 2 + wides.length * 4 )
	);
	// Half fields: low bytes of every value, then high bytes.
	const hn = halves.length * n;
	halves.forEach( ( field, k ) => {
		for ( let i = 0; i < n; i++ ) {
			const bits = toHalf( field[ i ] );
			planes[ k * n + i ] = bits & 0xff;
			planes[ hn + k * n + i ] = bits >>> 8;
		}
	} );
	// Float32 fields: four planes after the half planes.
	const wn = wides.length * n;
	const wide = new Uint8Array( 4 );
	const view = new Float32Array( wide.buffer );
	wides.forEach( ( field, k ) => {
		for ( let i = 0; i < n; i++ ) {
			view[ 0 ] = field[ i ];
			for ( let b = 0; b < 4; b++ ) {
				planes[ 2 * hn + b * wn + k * n + i ] = wide[ b ];
			}
		}
	} );
	const zip = canZip();
	const data = toBase64( zip ? await deflate( planes ) : planes );
	if ( data.length > MAX_PACKED ) {
		return null;
	}
	const { data: raw, ...meta } = snap;
	return { ...meta, pack: { version: 1, fields, zip, data } };
}

/**
 * A packed snapshot back to the plain one `restoreSimulation` reads.
 *
 * @param {Object} packed What packSnapshot returned.
 * @return {Promise<Object>} The plain snapshot. Throws on a broken pack.
 */
export async function unpackSnapshot( packed ) {
	const { pack, ...meta } = packed || {};
	const n = cellsOf( meta );
	const fields = pack?.fields;
	if (
		pack?.version !== 1 ||
		! Number.isInteger( n ) ||
		n < 1 ||
		n > MAX_CELLS ||
		! Array.isArray( fields ) ||
		fields.length > MAX_FIELDS ||
		typeof pack.data !== 'string' ||
		pack.data.length > MAX_PACKED ||
		( pack.zip && ! canZip() ) ||
		fields.some( ( f ) => f !== 'h' && f !== 'f' && ! Number.isFinite( f ) )
	) {
		throw new Error( 'Invalid fluid pack' );
	}
	const halfCount = fields.filter( ( f ) => f === 'h' ).length;
	const wideCount = fields.filter( ( f ) => f === 'f' ).length;
	const size = n * ( halfCount * 2 + wideCount * 4 );
	const stored = fromBase64( pack.data );
	const planes = pack.zip ? await inflate( stored, size ) : stored;
	if ( planes.length !== size ) {
		throw new Error( 'Invalid fluid pack' );
	}
	const values = new Float32Array( n * fields.length );
	const hn = halfCount * n,
		wn = wideCount * n;
	const wide = new Uint8Array( 4 );
	const view = new Float32Array( wide.buffer );
	let h = 0,
		w = 0;
	fields.forEach( ( f, k ) => {
		const field = values.subarray( k * n, ( k + 1 ) * n );
		if ( f === 'h' ) {
			const at = h++ * n;
			for ( let i = 0; i < n; i++ ) {
				field[ i ] = fromHalf(
					planes[ at + i ] | ( planes[ hn + at + i ] << 8 )
				);
			}
		} else if ( f === 'f' ) {
			const at = w++ * n;
			for ( let i = 0; i < n; i++ ) {
				for ( let b = 0; b < 4; b++ ) {
					wide[ b ] = planes[ 2 * hn + b * wn + at + i ];
				}
				field[ i ] = view[ 0 ];
			}
		} else {
			field.fill( f );
		}
	} );
	return { ...meta, data: toBase64( new Uint8Array( values.buffer ) ) };
}

/**
 * The lab state `save()` returns, ready for the document: the bath packed,
 * or left out when it packs too large.
 *
 * @param {{settings: Object, snapshot: Object}} lab The studio's state.
 * @return {Promise<Object>} The state to store.
 */
export async function packLab( lab ) {
	const { snapshot, ...rest } = lab;
	const packed = snapshot ? await packSnapshot( snapshot ) : null;
	return packed ? { ...rest, snapshot: packed } : rest;
}

/**
 * A stored lab state back to what the studio opens. A broken pack keeps the
 * snapshot broken, so the studio reports it the way it reports any bath it
 * cannot restore.
 *
 * @param {Object} lab The stored state (the layer's, or the session's).
 * @return {Promise<Object>} The state with a plain snapshot.
 */
export async function unpackLab( lab ) {
	if ( ! lab?.snapshot?.pack ) {
		return lab;
	}
	try {
		return { ...lab, snapshot: await unpackSnapshot( lab.snapshot ) };
	} catch ( e ) {
		return { ...lab, snapshot: { broken: true } };
	}
}
