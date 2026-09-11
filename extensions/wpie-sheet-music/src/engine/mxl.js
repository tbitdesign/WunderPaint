/**
 * MusicXML files: plain XML passes through, a compressed `.mxl` is a ZIP
 * whose META-INF/container.xml names the score. Magic bytes decide, not
 * the extension. Inflate runs through DecompressionStream, so nothing is
 * bundled for it.
 */
const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_END = 0x06054b50;

export function isZip( u8 ) {
	return (
		u8.length > 4 &&
		0x50 === u8[ 0 ] &&
		0x4b === u8[ 1 ] &&
		0x03 === u8[ 2 ] &&
		0x04 === u8[ 3 ]
	);
}

/** name -> { method, compSize, size, offset } from the central directory. */
export function readCentralDirectory( u8 ) {
	const dv = new DataView( u8.buffer, u8.byteOffset, u8.byteLength );
	let end = -1;
	for ( let i = u8.length - 22; i >= Math.max( 0, u8.length - 65557 ); i-- ) {
		if ( dv.getUint32( i, true ) === SIG_END ) {
			end = i;
			break;
		}
	}
	if ( end < 0 ) {
		throw new Error( 'Not a readable archive.' );
	}
	const count = dv.getUint16( end + 10, true );
	if ( count > MAX_ENTRIES ) {
		throw new Error( TOO_BIG );
	}
	let p = dv.getUint32( end + 16, true );
	const entries = new Map();
	const dec = new TextDecoder();
	for ( let i = 0; i < count; i++ ) {
		if ( dv.getUint32( p, true ) !== SIG_CENTRAL ) {
			break;
		}
		const method = dv.getUint16( p + 10, true );
		const compSize = dv.getUint32( p + 20, true );
		const size = dv.getUint32( p + 24, true );
		const nameLen = dv.getUint16( p + 28, true );
		const extraLen = dv.getUint16( p + 30, true );
		const commentLen = dv.getUint16( p + 32, true );
		const offset = dv.getUint32( p + 42, true );
		const name = dec.decode( u8.subarray( p + 46, p + 46 + nameLen ) );
		entries.set( name, { method, compSize, size, offset } );
		p += 46 + nameLen + extraLen + commentLen;
	}
	return entries;
}

/**
 * Most a MusicXML file may unpack to. A real score is a few hundred KB; a
 * 300 KB archive of deflated zeros unpacks to gigabytes and used to take
 * the tab with it, because nothing here ever counted (EXTSEC-01,
 * 10.09.2026). Read in chunks and stop at the cap.
 */
const MAX_UNPACKED = 24 * 1024 * 1024;
const MAX_ENTRIES = 256;
export const TOO_BIG = 'The archive is too large to read.';

async function readCapped( stream, cap ) {
	const reader = stream.getReader();
	const chunks = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if ( done ) {
			break;
		}
		total += value.byteLength;
		if ( total > cap ) {
			reader.cancel();
			throw new Error( TOO_BIG );
		}
		chunks.push( value );
	}
	const out = new Uint8Array( total );
	let at = 0;
	for ( const c of chunks ) {
		out.set( c, at );
		at += c.byteLength;
	}
	return new TextDecoder().decode( out );
}

async function inflateEntry( u8, e ) {
	if ( e.size > MAX_UNPACKED || e.compSize > MAX_UNPACKED ) {
		throw new Error( TOO_BIG );
	}
	const dv = new DataView( u8.buffer, u8.byteOffset, u8.byteLength );
	if ( dv.getUint32( e.offset, true ) !== SIG_LOCAL ) {
		throw new Error( 'Not a readable archive.' );
	}
	const nameLen = dv.getUint16( e.offset + 26, true );
	const extraLen = dv.getUint16( e.offset + 28, true );
	const start = e.offset + 30 + nameLen + extraLen;
	const data = u8.slice( start, start + e.compSize );
	if ( 0 === e.method ) {
		return new TextDecoder().decode( data );
	}
	if ( 8 !== e.method ) {
		throw new Error(
			'The archive uses a compression this browser cannot read.'
		);
	}
	const stream = new Blob( [ data ] )
		.stream()
		.pipeThrough( new DecompressionStream( 'deflate-raw' ) );
	return readCapped( stream, MAX_UNPACKED );
}

/** ArrayBuffer or Uint8Array in, the MusicXML text out. */
export async function unzipMxl( buf ) {
	const u8 = buf instanceof Uint8Array ? buf : new Uint8Array( buf );
	if ( ! isZip( u8 ) ) {
		return new TextDecoder().decode( u8 );
	}
	const entries = readCentralDirectory( u8 );
	let rootPath = null;
	const container = entries.get( 'META-INF/container.xml' );
	if ( container ) {
		const xml = await inflateEntry( u8, container );
		const m = /full-path="([^"]+)"/.exec( xml );
		rootPath = m ? m[ 1 ] : null;
	}
	if ( ! rootPath || ! entries.has( rootPath ) ) {
		rootPath =
			[ ...entries.keys() ].find(
				( n ) =>
					/\.(xml|musicxml)$/i.test( n ) &&
					! n.startsWith( 'META-INF/' )
			) || null;
	}
	if ( ! rootPath ) {
		throw new Error( 'No MusicXML inside the archive.' );
	}
	return inflateEntry( u8, entries.get( rootPath ) );
}
