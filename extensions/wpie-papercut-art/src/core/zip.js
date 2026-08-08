/**
 * Minimal ZIP writer (STORE, no compression) for the cut package - a
 * handful of SVG text files never justify a deflate dependency.
 */

const CRC_TABLE = ( () => {
	const t = new Uint32Array( 256 );
	for ( let n = 0; n < 256; n++ ) {
		let c = n;
		for ( let k = 0; k < 8; k++ ) {
			c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		}
		t[ n ] = c >>> 0;
	}
	return t;
} )();

export function crc32( bytes ) {
	let c = 0xffffffff;
	for ( let i = 0; i < bytes.length; i++ ) {
		c = CRC_TABLE[ ( c ^ bytes[ i ] ) & 0xff ] ^ ( c >>> 8 );
	}
	return ( c ^ 0xffffffff ) >>> 0;
}

const enc = new TextEncoder();

/**
 * Build a ZIP archive.
 *
 * @param {Array} files `[ { name, data: string|Uint8Array }, ... ]`.
 * @return {Uint8Array} The archive bytes.
 */
export function buildZip( files ) {
	const parts = [];
	const central = [];
	let offset = 0;
	const push = ( bytes ) => {
		parts.push( bytes );
		offset += bytes.length;
	};
	const u16 = ( v ) => [ v & 255, ( v >> 8 ) & 255 ];
	const u32 = ( v ) => [
		v & 255,
		( v >> 8 ) & 255,
		( v >> 16 ) & 255,
		( v >>> 24 ) & 255,
	];
	for ( const f of files ) {
		const name = enc.encode( f.name );
		const data =
			'string' === typeof f.data ? enc.encode( f.data ) : f.data;
		const crc = crc32( data );
		const start = offset;
		push(
			Uint8Array.from( [
				0x50, 0x4b, 0x03, 0x04,
				...u16( 20 ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0x54a1 ),
				...u32( crc ),
				...u32( data.length ),
				...u32( data.length ),
				...u16( name.length ),
				...u16( 0 ),
			] )
		);
		push( name );
		push( data );
		central.push( { name, data, crc, start } );
	}
	const dirStart = offset;
	for ( const c of central ) {
		push(
			Uint8Array.from( [
				0x50, 0x4b, 0x01, 0x02,
				...u16( 20 ),
				...u16( 20 ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0x54a1 ),
				...u32( c.crc ),
				...u32( c.data.length ),
				...u32( c.data.length ),
				...u16( c.name.length ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0 ),
				...u16( 0 ),
				...u32( 0 ),
				...u32( c.start ),
			] )
		);
		push( c.name );
	}
	const dirSize = offset - dirStart;
	push(
		Uint8Array.from( [
			0x50, 0x4b, 0x05, 0x06,
			...u16( 0 ),
			...u16( 0 ),
			...u16( central.length ),
			...u16( central.length ),
			...u32( dirSize ),
			...u32( dirStart ),
			...u16( 0 ),
		] )
	);
	const out = new Uint8Array( offset );
	let at = 0;
	for ( const p of parts ) {
		out.set( p, at );
		at += p.length;
	}
	return out;
}
