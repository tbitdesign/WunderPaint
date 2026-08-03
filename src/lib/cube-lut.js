/**
 * .cube LUT support (v0.4): parser for Adobe/Resolve `.cube` files (1D and
 * 3D), trilinear sampling, and a compact base64 encoding so parsed tables
 * survive JSON project serialization. DOM-free.
 */

/**
 * Parse a `.cube` file.
 *
 * @param {string} text File contents.
 * @return {{size:number,is1D:boolean,data:Float32Array,domainMin:number[],domainMax:number[],title:string}} Parsed LUT.
 * @throws {Error} On malformed input.
 */
export function parseCube( text ) {
	let size = 0;
	let is1D = false;
	let title = '';
	const domainMin = [ 0, 0, 0 ];
	const domainMax = [ 1, 1, 1 ];
	const values = [];

	for ( const rawLine of String( text ).split( /\r?\n/ ) ) {
		const line = rawLine.trim();
		if ( ! line || line.startsWith( '#' ) ) {
			continue;
		}
		const upper = line.toUpperCase();
		if ( upper.startsWith( 'TITLE' ) ) {
			title = ( line.match( /"([^"]*)"/ ) || [ , '' ] )[ 1 ];
		} else if ( upper.startsWith( 'LUT_3D_SIZE' ) ) {
			size = parseInt( line.split( /\s+/ )[ 1 ], 10 );
			is1D = false;
		} else if ( upper.startsWith( 'LUT_1D_SIZE' ) ) {
			size = parseInt( line.split( /\s+/ )[ 1 ], 10 );
			is1D = true;
		} else if ( upper.startsWith( 'DOMAIN_MIN' ) ) {
			line.split( /\s+/ )
				.slice( 1, 4 )
				.forEach( ( v, i ) => ( domainMin[ i ] = parseFloat( v ) ) );
		} else if ( upper.startsWith( 'DOMAIN_MAX' ) ) {
			line.split( /\s+/ )
				.slice( 1, 4 )
				.forEach( ( v, i ) => ( domainMax[ i ] = parseFloat( v ) ) );
		} else if ( /^[-\d.]/.test( line ) ) {
			const parts = line.split( /\s+/ ).map( parseFloat );
			if ( 3 === parts.length && parts.every( Number.isFinite ) ) {
				values.push( parts[ 0 ], parts[ 1 ], parts[ 2 ] );
			}
		}
	}

	if ( ! size || size < 2 ) {
		throw new Error( 'No LUT_3D_SIZE/LUT_1D_SIZE found' );
	}
	const expected = ( is1D ? size : size * size * size ) * 3;
	if ( values.length !== expected ) {
		throw new Error(
			`LUT data mismatch: expected ${ expected } values, got ${ values.length }`
		);
	}
	return {
		size,
		is1D,
		data: new Float32Array( values ),
		domainMin,
		domainMax,
		title,
	};
}

const lerp = ( a, b, t ) => a + ( b - a ) * t;

/**
 * Trilinear 3D LUT sample. `.cube` order: red varies fastest.
 *
 * @param {Float32Array} data LUT values (size³·3).
 * @param {number}       size Grid size per axis.
 * @param {number}       r    0–1.
 * @param {number}       g    0–1.
 * @param {number}       b    0–1.
 * @return {number[]} [r, g, b] in 0–1.
 */
export function sampleLut3d( data, size, r, g, b ) {
	const n = size - 1;
	const fr = Math.min( 1, Math.max( 0, r ) ) * n;
	const fg = Math.min( 1, Math.max( 0, g ) ) * n;
	const fb = Math.min( 1, Math.max( 0, b ) ) * n;
	const r0 = Math.min( n - 1, Math.floor( fr ) );
	const g0 = Math.min( n - 1, Math.floor( fg ) );
	const b0 = Math.min( n - 1, Math.floor( fb ) );
	const tr = fr - r0;
	const tg = fg - g0;
	const tb = fb - b0;
	const at = ( ri, gi, bi ) => ( ( bi * size + gi ) * size + ri ) * 3;

	const out = [ 0, 0, 0 ];
	for ( let c = 0; c < 3; c++ ) {
		const c000 = data[ at( r0, g0, b0 ) + c ];
		const c100 = data[ at( r0 + 1, g0, b0 ) + c ];
		const c010 = data[ at( r0, g0 + 1, b0 ) + c ];
		const c110 = data[ at( r0 + 1, g0 + 1, b0 ) + c ];
		const c001 = data[ at( r0, g0, b0 + 1 ) + c ];
		const c101 = data[ at( r0 + 1, g0, b0 + 1 ) + c ];
		const c011 = data[ at( r0, g0 + 1, b0 + 1 ) + c ];
		const c111 = data[ at( r0 + 1, g0 + 1, b0 + 1 ) + c ];
		out[ c ] = lerp(
			lerp( lerp( c000, c100, tr ), lerp( c010, c110, tr ), tg ),
			lerp( lerp( c001, c101, tr ), lerp( c011, c111, tr ), tg ),
			tb
		);
	}
	return out;
}

/**
 * 1D LUT sample (per-channel linear interpolation).
 *
 * @param {Float32Array} data LUT values (size·3).
 * @param {number}       size Entries.
 * @param {number}       r    0–1.
 * @param {number}       g    0–1.
 * @param {number}       b    0–1.
 * @return {number[]} [r, g, b] in 0–1.
 */
export function sampleLut1d( data, size, r, g, b ) {
	const n = size - 1;
	const one = ( v, c ) => {
		const f = Math.min( 1, Math.max( 0, v ) ) * n;
		const i0 = Math.min( n - 1, Math.floor( f ) );
		return lerp( data[ i0 * 3 + c ], data[ ( i0 + 1 ) * 3 + c ], f - i0 );
	};
	return [ one( r, 0 ), one( g, 1 ), one( b, 2 ) ];
}

/* --------------------- base64 (JSON-safe) transport --------------------- */

const b64encode = ( bytes ) => {
	if ( 'function' === typeof btoa ) {
		let bin = '';
		for ( let i = 0; i < bytes.length; i += 0x8000 ) {
			bin += String.fromCharCode.apply(
				null,
				bytes.subarray( i, i + 0x8000 )
			);
		}
		return btoa( bin );
	}

	return Buffer.from( bytes ).toString( 'base64' );
};

const b64decode = ( str ) => {
	if ( 'function' === typeof atob ) {
		const bin = atob( str );
		const bytes = new Uint8Array( bin.length );
		for ( let i = 0; i < bin.length; i++ ) {
			bytes[ i ] = bin.charCodeAt( i );
		}
		return bytes;
	}

	return new Uint8Array( Buffer.from( str, 'base64' ) );
};

/**
 * Parsed LUT → JSON-safe effect param value.
 *
 * @param {{size:number,is1D:boolean,data:Float32Array,title:string}} lut Parsed LUT.
 * @return {{size:number,is1D:boolean,title:string,data:string}} Serializable table.
 */
export function encodeLutTable( lut ) {
	return {
		size: lut.size,
		is1D: !! lut.is1D,
		title: lut.title || '',
		data: b64encode( new Uint8Array( lut.data.buffer ) ),
	};
}

/**
 * Effect param value → Float32Array (accepts already-decoded arrays).
 *
 * @param {{data:string|Float32Array}} table Encoded table.
 * @return {Float32Array} LUT values.
 */
export function decodeLutTable( table ) {
	if ( table.data instanceof Float32Array ) {
		return table.data;
	}
	const bytes = b64decode( table.data );
	return new Float32Array(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength / 4
	);
}
