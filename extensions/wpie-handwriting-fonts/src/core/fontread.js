/**
 * Reading just enough of a font file to get the project back out.
 *
 * The built font carries the drawing that made it, so opening a font is
 * how a project is reopened, on any device, without a second store.
 * Only the table directory and the name table are needed for that, so
 * that is all this reads. It is also what the tests use to look at the
 * writer's output from the outside.
 */

import { PROJECT_TAG } from './fontbuild.js';

const viewOf = ( bytes ) =>
	new DataView( bytes.buffer, bytes.byteOffset, bytes.byteLength );

/**
 * The table directory of a font file.
 *
 * @param {Uint8Array} bytes Font file.
 * @return {Array} `{ tag, offset, length }` records.
 */
export function directory( bytes ) {
	if ( ! bytes || bytes.length < 12 ) {
		return [];
	}
	const view = viewOf( bytes );
	const sfnt = view.getUint32( 0 );
	// TrueType outlines, CFF outlines, or a font collection we decline.
	if ( 0x00010000 !== sfnt && 0x4f54544f !== sfnt && 0x74727565 !== sfnt ) {
		return [];
	}
	const n = view.getUint16( 4 );
	const out = [];
	for ( let i = 0; i < n; i++ ) {
		const at = 12 + i * 16;
		if ( at + 16 > bytes.length ) {
			break;
		}
		out.push( {
			tag: String.fromCharCode(
				bytes[ at ],
				bytes[ at + 1 ],
				bytes[ at + 2 ],
				bytes[ at + 3 ]
			),
			offset: view.getUint32( at + 8 ),
			length: view.getUint32( at + 12 ),
		} );
	}
	return out;
}

/** The tags present in a font file. */
export const readTags = ( bytes ) => directory( bytes ).map( ( t ) => t.tag );

/**
 * One table's bytes.
 *
 * @param {Uint8Array} bytes Font file.
 * @param {string}     tag   Four-character table tag.
 * @return {Uint8Array|null} Table data.
 */
export function readTable( bytes, tag ) {
	const rec = directory( bytes ).find( ( t ) => t.tag === tag );
	if ( ! rec || rec.offset + rec.length > bytes.length ) {
		return null;
	}
	return bytes.subarray( rec.offset, rec.offset + rec.length );
}

/** The private project payload, or null when the font has none. */
export const readProjectBytes = ( bytes ) => readTable( bytes, PROJECT_TAG );

/**
 * The family name a font announces.
 *
 * Windows records are preferred because they are the ones that carry
 * anything beyond ASCII, which family names regularly do.
 *
 * @param {Uint8Array} bytes Font file.
 * @return {string} Family name, or an empty string.
 */
export function readFamilyName( bytes ) {
	const name = readTable( bytes, 'name' );
	if ( ! name || name.length < 6 ) {
		return '';
	}
	const view = viewOf( name );
	const count = view.getUint16( 2 );
	const storage = view.getUint16( 4 );
	let best = '';
	for ( let i = 0; i < count; i++ ) {
		const at = 6 + i * 12;
		if ( at + 12 > name.length ) {
			break;
		}
		if ( 1 !== view.getUint16( at + 6 ) ) {
			continue;
		}
		const platform = view.getUint16( at );
		const len = view.getUint16( at + 8 );
		const off = storage + view.getUint16( at + 10 );
		if ( off + len > name.length ) {
			continue;
		}
		const slice = name.subarray( off, off + len );
		const text =
			3 === platform
				? decodeUtf16be( slice )
				: String.fromCharCode( ...slice );
		if ( 3 === platform ) {
			return text;
		}
		if ( ! best ) {
			best = text;
		}
	}
	return best;
}

function decodeUtf16be( bytes ) {
	let out = '';
	for ( let i = 0; i + 1 < bytes.length; i += 2 ) {
		out += String.fromCharCode( ( bytes[ i ] << 8 ) | bytes[ i + 1 ] );
	}
	return out;
}
