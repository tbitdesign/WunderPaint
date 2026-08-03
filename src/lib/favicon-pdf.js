/**
 * Favicon-set ZIP + single-page PDF export (v1.8), both fully
 * client-side. The ICO container uses embedded PNGs (valid since Vista);
 * the PDF embeds one JPEG XObject (DCTDecode), no library needed.
 */

import { createCanvas } from './raster';

/** Square center-crop render of a source canvas at `size` px. */
function squareTile( source, size ) {
	const tile = createCanvas( size, size );
	const ctx = tile.getContext( '2d' );
	const cover = Math.max( size / source.width, size / source.height );
	const dw = source.width * cover;
	const dh = source.height * cover;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage( source, ( size - dw ) / 2, ( size - dh ) / 2, dw, dh );
	return tile;
}

const canvasPngBytes = ( canvas ) =>
	new Promise( ( resolve ) =>
		canvas.toBlob(
			( blob ) =>
				blob
					.arrayBuffer()
					.then( ( b ) => resolve( new Uint8Array( b ) ) ),
			'image/png'
		)
	);

/** ICO container with PNG-encoded entries. */
function buildIco( entries ) {
	const headerSize = 6 + 16 * entries.length;
	const total =
		headerSize + entries.reduce( ( n, e ) => n + e.bytes.length, 0 );
	const out = new Uint8Array( total );
	const view = new DataView( out.buffer );
	view.setUint16( 0, 0, true ); // reserved
	view.setUint16( 2, 1, true ); // type: icon
	view.setUint16( 4, entries.length, true );
	let offset = headerSize;
	entries.forEach( ( e, i ) => {
		const dir = 6 + i * 16;
		out[ dir ] = 256 === e.size ? 0 : e.size;
		out[ dir + 1 ] = 256 === e.size ? 0 : e.size;
		out[ dir + 2 ] = 0; // palette
		out[ dir + 3 ] = 0; // reserved
		view.setUint16( dir + 4, 1, true ); // planes
		view.setUint16( dir + 6, 32, true ); // bpp
		view.setUint32( dir + 8, e.bytes.length, true );
		view.setUint32( dir + 12, offset, true );
		out.set( e.bytes, offset );
		offset += e.bytes.length;
	} );
	return out;
}

/**
 * Build the favicon ZIP: favicon.ico (16+32+48), PNGs 16/32/48/180/192/512
 * plus a ready-to-paste HTML snippet.
 *
 * @param {*} source Rendered document canvas.
 * @return {Promise<Blob>} ZIP blob.
 */
export async function buildFaviconZip( source ) {
	const { default: JSZip } = await import(
		/* webpackChunkName: "jszip" */ 'jszip'
	);
	const zip = new JSZip();
	const sizes = [ 16, 32, 48, 180, 192, 512 ];
	const pngs = {};
	for ( const size of sizes ) {
		pngs[ size ] = await canvasPngBytes( squareTile( source, size ) );
	}
	zip.file( 'favicon-16.png', pngs[ 16 ] );
	zip.file( 'favicon-32.png', pngs[ 32 ] );
	zip.file( 'favicon-48.png', pngs[ 48 ] );
	zip.file( 'apple-touch-icon.png', pngs[ 180 ] );
	zip.file( 'icon-192.png', pngs[ 192 ] );
	zip.file( 'icon-512.png', pngs[ 512 ] );
	zip.file(
		'favicon.ico',
		buildIco( [
			{ size: 16, bytes: pngs[ 16 ] },
			{ size: 32, bytes: pngs[ 32 ] },
			{ size: 48, bytes: pngs[ 48 ] },
		] )
	);
	zip.file(
		'snippet.html',
		[
			'<link rel="icon" href="/favicon.ico" sizes="48x48">',
			'<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192">',
			'<link rel="apple-touch-icon" href="/apple-touch-icon.png">',
		].join( '\n' )
	);
	return zip.generateAsync( { type: 'blob' } );
}

const encoder = new TextEncoder();

/**
 * Minimal multi-page PDF: one JPEG (DCTDecode XObject) per page, each
 * page at its own pixel size (1px = 1pt). Multi-page designs (v1.11)
 * export through this in one file.
 *
 * @param {Array} pages [{ jpegBytes, w, h }] in page order.
 * @return {Blob} PDF blob.
 */
export function buildPdfPages( pages ) {
	const chunks = [];
	const offsets = [];
	let position = 0;
	const push = ( data ) => {
		const bytes = 'string' === typeof data ? encoder.encode( data ) : data;
		chunks.push( bytes );
		position += bytes.length;
	};
	const object = ( body ) => {
		offsets.push( position );
		push( body );
	};
	push( '%PDF-1.4\n' );
	object( '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n' );
	const kids = pages.map( ( p, i ) => `${ 3 + i * 3 } 0 R` ).join( ' ' );
	object(
		`2 0 obj\n<< /Type /Pages /Kids [${ kids }] /Count ${ pages.length } >>\nendobj\n`
	);
	pages.forEach( ( { jpegBytes, w, h }, i ) => {
		const pageId = 3 + i * 3;
		object(
			`${ pageId } 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ w } ${ h }] ` +
				`/Resources << /XObject << /Im0 ${
					pageId + 1
				} 0 R >> >> /Contents ${ pageId + 2 } 0 R >>\nendobj\n`
		);
		offsets.push( position );
		push(
			`${
				pageId + 1
			} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${ w } /Height ${ h } ` +
				`/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${ jpegBytes.length } >>\nstream\n`
		);
		push( jpegBytes );
		push( '\nendstream\nendobj\n' );
		const content = `q ${ w } 0 0 ${ h } 0 0 cm /Im0 Do Q`;
		object(
			`${ pageId + 2 } 0 obj\n<< /Length ${
				content.length
			} >>\nstream\n${ content }\nendstream\nendobj\n`
		);
	} );
	const xref = position;
	let table = `xref\n0 ${ offsets.length + 1 }\n0000000000 65535 f \n`;
	for ( const off of offsets ) {
		table += `${ String( off ).padStart( 10, '0' ) } 00000 n \n`;
	}
	push(
		table +
			`trailer\n<< /Size ${
				offsets.length + 1
			} /Root 1 0 R >>\nstartxref\n${ xref }\n%%EOF`
	);
	return new window.Blob( chunks, { type: 'application/pdf' } );
}

/**
 * Minimal single-page PDF wrapping one JPEG (DCTDecode XObject).
 *
 * @param {Uint8Array} jpegBytes JPEG data.
 * @param {number}     w         Pixel width (1px = 1pt).
 * @param {number}     h         Pixel height.
 * @return {Blob} PDF blob.
 */
export function buildPdf( jpegBytes, w, h ) {
	return buildPdfPages( [ { jpegBytes, w, h } ] );
}
