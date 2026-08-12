/**
 * Write an IPTC digital source type into an exported file (v1.400.0).
 *
 * Canvas has no metadata: `toBlob()` hands back pixels and nothing else, so
 * anything an exported file should declare has to be spliced into the bytes
 * afterwards. This module does exactly one thing - it embeds an XMP packet
 * carrying `Iptc4xmpExt:DigitalSourceType`, the vocabulary AFP, AP, Reuters
 * and Google's image search all read.
 *
 * ONLY ever called when the user ticked the box. Nothing here runs on its
 * own, and an untouched export stays byte-identical to what the encoder
 * produced. Writing "this is a real photograph" is not offered at all: a
 * wrong claim is worse than no claim.
 *
 * Formats: JPEG (APP1 segment) and PNG (iTXt chunk). WebP and AVIF would
 * each need their own container surgery and are reported as unsupported
 * instead of being silently skipped.
 *
 * Leaf module: pure byte work on Uint8Arrays, so jest can verify the output
 * without a browser.
 */

import { __ } from '@wordpress/i18n';

/** The IPTC NewsCodes concept URIs - `http:`, not `https:` (verified). */
const CV = 'http://cv.iptc.org/newscodes/digitalsourcetype/';

/**
 * The two values that can honestly be claimed about an export from here.
 *
 * `digitalCapture` ("this is a real photograph") is deliberately absent:
 * the editor cannot know it, and a false claim of authenticity is the one
 * mistake this feature must never make.
 */
export const SOURCE_TYPES = [
	{
		id: 'trainedAlgorithmicMedia',
		uri: CV + 'trainedAlgorithmicMedia',
		label: () => __( 'Fully AI-generated', 'wunderpaint' ),
	},
	{
		id: 'compositeWithTrainedAlgorithmicMedia',
		uri: CV + 'compositeWithTrainedAlgorithmicMedia',
		label: () => __( 'Partially AI-modified', 'wunderpaint' ),
	},
];

/** Formats whose containers this module can splice. */
export const SUPPORTED_MIME = [ 'image/jpeg', 'image/png' ];

/**
 * Resolve a source type id to its URI.
 *
 * @param {string} id Source type id.
 * @return {string} Concept URI, or '' when unknown.
 */
export function sourceTypeUri( id ) {
	return SOURCE_TYPES.find( ( t ) => t.id === id )?.uri || '';
}

/**
 * Build the XMP packet for one digital source type.
 *
 * @param {string} uri Concept URI.
 * @return {string} XMP packet, ready to embed.
 */
export function xmpPacket( uri ) {
	return (
		'<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
		'<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
		' <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
		'  <rdf:Description rdf:about=""\n' +
		'    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/">\n' +
		'   <Iptc4xmpExt:DigitalSourceType>' +
		uri +
		'</Iptc4xmpExt:DigitalSourceType>\n' +
		'  </rdf:Description>\n' +
		' </rdf:RDF>\n' +
		'</x:xmpmeta>\n' +
		'<?xpacket end="w"?>'
	);
}

/** UTF-8 encode without assuming a browser TextEncoder shim. */
const utf8 = ( str ) => new TextEncoder().encode( str );

/**
 * Concatenate byte chunks into one array.
 *
 * @param {Array<Uint8Array>} parts Chunks.
 * @return {Uint8Array} Joined bytes.
 */
function join( parts ) {
	const total = parts.reduce( ( n, p ) => n + p.length, 0 );
	const out = new Uint8Array( total );
	let at = 0;
	for ( const p of parts ) {
		out.set( p, at );
		at += p.length;
	}
	return out;
}

/** CRC-32 table (PNG polynomial), built once. */
const CRC_TABLE = ( () => {
	const table = new Uint32Array( 256 );
	for ( let n = 0; n < 256; n++ ) {
		let c = n;
		for ( let k = 0; k < 8; k++ ) {
			c = c & 1 ? 0xedb88320 ^ ( c >>> 1 ) : c >>> 1;
		}
		table[ n ] = c >>> 0;
	}
	return table;
} )();

/**
 * CRC-32 over a byte range, as PNG chunks require.
 *
 * @param {Uint8Array} bytes Input.
 * @return {number} Checksum.
 */
export function crc32( bytes ) {
	let c = 0xffffffff;
	for ( let i = 0; i < bytes.length; i++ ) {
		c = CRC_TABLE[ ( c ^ bytes[ i ] ) & 0xff ] ^ ( c >>> 8 );
	}
	return ( c ^ 0xffffffff ) >>> 0;
}

/** Big-endian 32-bit value as four bytes. */
const be32 = ( n ) =>
	new Uint8Array( [
		( n >>> 24 ) & 0xff,
		( n >>> 16 ) & 0xff,
		( n >>> 8 ) & 0xff,
		n & 0xff,
	] );

/**
 * Splice an XMP packet into a JPEG as an APP1 segment.
 *
 * The segment goes directly behind SOI, which is where readers expect it and
 * which keeps every following segment byte-identical.
 *
 * @param {Uint8Array} bytes Encoder output.
 * @param {string}     xmp   XMP packet.
 * @return {Uint8Array} New bytes, or the input untouched when it is not a JPEG
 *                      or the packet would overflow a segment.
 */
export function jpegWithXmp( bytes, xmp ) {
	if ( bytes.length < 2 || 0xff !== bytes[ 0 ] || 0xd8 !== bytes[ 1 ] ) {
		return bytes;
	}
	const payload = join( [
		utf8( 'http://ns.adobe.com/xap/1.0/\0' ),
		utf8( xmp ),
	] );
	// A JPEG segment length counts its own two length bytes and is a 16-bit
	// field, so anything past 65533 bytes of payload cannot be written.
	const len = payload.length + 2;
	if ( len > 0xffff ) {
		return bytes;
	}
	return join( [
		bytes.subarray( 0, 2 ),
		new Uint8Array( [ 0xff, 0xe1, ( len >> 8 ) & 0xff, len & 0xff ] ),
		payload,
		bytes.subarray( 2 ),
	] );
}

/** The eight bytes every PNG starts with. */
const PNG_SIG = [ 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a ];

/**
 * Splice an XMP packet into a PNG as an iTXt chunk.
 *
 * The chunk is placed right behind IHDR. IHDR's payload is fixed at 13 bytes
 * by the spec, but its length field is read rather than assumed, so a file
 * with an unexpected header does not get a chunk written into its middle.
 *
 * @param {Uint8Array} bytes Encoder output.
 * @param {string}     xmp   XMP packet.
 * @return {Uint8Array} New bytes, or the input untouched when it is not a PNG.
 */
export function pngWithXmp( bytes, xmp ) {
	if ( bytes.length < 8 || PNG_SIG.some( ( b, i ) => bytes[ i ] !== b ) ) {
		return bytes;
	}
	const view = new DataView(
		bytes.buffer,
		bytes.byteOffset,
		bytes.byteLength
	);
	const ihdrLen = view.getUint32( 8 );
	const insertAt = 8 + 4 + 4 + ihdrLen + 4;
	if ( insertAt > bytes.length ) {
		return bytes;
	}
	// iTXt payload: keyword \0 compressed(0) method(0) lang \0 translated \0 text
	const data = join( [
		utf8( 'XML:com.adobe.xmp' ),
		new Uint8Array( [ 0, 0, 0 ] ),
		new Uint8Array( [ 0 ] ),
		new Uint8Array( [ 0 ] ),
		utf8( xmp ),
	] );
	const typed = join( [ utf8( 'iTXt' ), data ] );
	const chunk = join( [
		be32( data.length ),
		typed,
		be32( crc32( typed ) ),
	] );
	return join( [
		bytes.subarray( 0, insertAt ),
		chunk,
		bytes.subarray( insertAt ),
	] );
}

/**
 * Embed a digital source type into encoded image bytes.
 *
 * @param {Uint8Array} bytes  Encoder output.
 * @param {string}     mime   Output MIME type.
 * @param {string}     typeId Source type id.
 * @return {Uint8Array} New bytes, or the input untouched when unsupported.
 */
export function withSourceType( bytes, mime, typeId ) {
	const uri = sourceTypeUri( typeId );
	if ( ! uri ) {
		return bytes;
	}
	const xmp = xmpPacket( uri );
	if ( 'image/jpeg' === mime ) {
		return jpegWithXmp( bytes, xmp );
	}
	if ( 'image/png' === mime ) {
		return pngWithXmp( bytes, xmp );
	}
	return bytes;
}

/**
 * Blob-level wrapper for the export pipeline.
 *
 * @param {Blob}   blob   Encoded image.
 * @param {string} typeId Source type id.
 * @return {Promise<Blob>} New blob, or the same one when unsupported.
 */
export async function blobWithSourceType( blob, typeId ) {
	if ( ! blob || ! SUPPORTED_MIME.includes( blob.type ) ) {
		return blob;
	}
	const bytes = new Uint8Array( await blob.arrayBuffer() );
	const out = withSourceType( bytes, blob.type, typeId );
	return out === bytes ? blob : new Blob( [ out ], { type: blob.type } );
}
