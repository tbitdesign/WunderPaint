/**
 * Dependency-free ZIP writer (STORE entries - PNGs/JPEGs are already
 * compressed) + blob download. Same code as the studios' spin export.
 */

/* ---------------------------------- zip ---------------------------------- */

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

/**
 * Build a ZIP (method STORE) from `entries` [{ name, data: Uint8Array }].
 *
 * @param {Array} entries Files.
 * @return {Uint8Array} The archive bytes.
 */
export function makeZip( entries ) {
	const enc = new TextEncoder();
	const now = new Date();
	const dosTime =
		( now.getHours() << 11 ) |
		( now.getMinutes() << 5 ) |
		( now.getSeconds() >> 1 );
	const dosDate =
		( ( now.getFullYear() - 1980 ) << 9 ) |
		( ( now.getMonth() + 1 ) << 5 ) |
		now.getDate();
	const locals = [];
	const centrals = [];
	let offset = 0;
	for ( const { name, data } of entries ) {
		const nameB = enc.encode( name );
		const crc = crc32( data );
		const local = new Uint8Array( 30 + nameB.length + data.length );
		const lv = new DataView( local.buffer );
		lv.setUint32( 0, 0x04034b50, true );
		lv.setUint16( 4, 20, true );
		lv.setUint16( 8, 0, true ); // method: store
		lv.setUint16( 10, dosTime, true );
		lv.setUint16( 12, dosDate, true );
		lv.setUint32( 14, crc, true );
		lv.setUint32( 18, data.length, true );
		lv.setUint32( 22, data.length, true );
		lv.setUint16( 26, nameB.length, true );
		local.set( nameB, 30 );
		local.set( data, 30 + nameB.length );
		locals.push( local );

		const central = new Uint8Array( 46 + nameB.length );
		const cv = new DataView( central.buffer );
		cv.setUint32( 0, 0x02014b50, true );
		cv.setUint16( 4, 20, true );
		cv.setUint16( 6, 20, true );
		cv.setUint16( 10, 0, true );
		cv.setUint16( 12, dosTime, true );
		cv.setUint16( 14, dosDate, true );
		cv.setUint32( 16, crc, true );
		cv.setUint32( 20, data.length, true );
		cv.setUint32( 24, data.length, true );
		cv.setUint16( 28, nameB.length, true );
		cv.setUint32( 42, offset, true );
		central.set( nameB, 46 );
		centrals.push( central );
		offset += local.length;
	}
	const cdSize = centrals.reduce( ( s, c ) => s + c.length, 0 );
	const eocd = new Uint8Array( 22 );
	const ev = new DataView( eocd.buffer );
	ev.setUint32( 0, 0x06054b50, true );
	ev.setUint16( 8, entries.length, true );
	ev.setUint16( 10, entries.length, true );
	ev.setUint32( 12, cdSize, true );
	ev.setUint32( 16, offset, true );
	const out = new Uint8Array( offset + cdSize + 22 );
	let p = 0;
	for ( const b of [ ...locals, ...centrals, eocd ] ) {
		out.set( b, p );
		p += b.length;
	}
	return out;
}

export function download( name, blob ) {
	const a = document.createElement( 'a' );
	a.href = URL.createObjectURL( blob );
	a.download = name;
	document.body.appendChild( a );
	a.click();
	a.remove();
	// Give the click a tick before the URL is revoked.
	window.setTimeout( () => URL.revokeObjectURL( a.href ), 4000 );
}
