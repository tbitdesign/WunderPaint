/**
 * HEIC / HEIF photos (20.10.2026): iPhones save them, Chrome, Edge and
 * Firefox cannot show them (only Safari can), and WordPress converts them
 * only on servers whose Imagick reads HEIC - many do not, so such an upload
 * sits in the Media Library without any thumbnails.
 *
 * Every way a file enters the editor or the Media Library through us calls
 * normalizeImageFile(): a HEIC photo is decoded in the browser and goes on
 * as a JPEG, everything else passes untouched.
 *
 * The decoder is libheif with its libde265 HEVC decoder, compiled to
 * WebAssembly (npm libheif-js, LGPL-3.0, bundled unmodified). It is loaded
 * only when a HEIC file actually turns up: build/heic.<hash>.js plus
 * build/libheif.<hash>.wasm, about 1.5 MB. It generates no code from
 * strings, so it runs under wunderpaint.com's CSP without 'unsafe-eval'
 * (proved with node --disallow-code-generation-from-strings when it came
 * in).
 *
 * The file is recognised by its content (the ISO-BMFF "ftyp" box), not by
 * its name: browsers often report an empty type for .heic. AVIF uses the
 * same container and every browser shows it natively, so its brands are
 * left alone.
 */

import { __ } from '@wordpress/i18n';

// No import of raster/env here: store/document.js imports this module, and
// raster/env leads back to it through the constants and the font manager.
// Decoding only ever happens in a browser, so a plain canvas does.
const createCanvas = ( w, h ) => {
	const c = window.document.createElement( 'canvas' );
	c.width = w;
	c.height = h;
	return c;
};

/** Brands that mean HEVC-coded images (still or sequence). */
const HEVC_BRANDS = new Set( [
	'heic',
	'heix',
	'hevc',
	'hevx',
	'heim',
	'heis',
	'hevm',
	'hevs',
] );
const AV1_BRANDS = new Set( [ 'avif', 'avis' ] );

/** For file inputs: HEIC is not part of image/* on every system. */
export const HEIC_ACCEPT = '.heic,.heif,image/heic,image/heif';

const fourcc = ( b, at ) =>
	String.fromCharCode( b[ at ], b[ at + 1 ], b[ at + 2 ], b[ at + 3 ] );

/**
 * Whether the first bytes of a file are a HEIC/HEIF picture.
 *
 * @param {Uint8Array} bytes At least the first 12 bytes; more brands are
 *                           read when present.
 * @return {boolean} HEIC.
 */
export function isHeicBytes( bytes ) {
	if ( ! bytes || bytes.length < 12 || 'ftyp' !== fourcc( bytes, 4 ) ) {
		return false;
	}
	const size =
		( ( bytes[ 0 ] << 24 ) |
			( bytes[ 1 ] << 16 ) |
			( bytes[ 2 ] << 8 ) |
			bytes[ 3 ] ) >>>
		0;
	const end = Math.min( bytes.length, Math.max( 12, size ) );
	const brands = [ fourcc( bytes, 8 ) ];
	for ( let at = 16; at + 4 <= end; at += 4 ) {
		brands.push( fourcc( bytes, at ) );
	}
	if ( brands.some( ( b ) => AV1_BRANDS.has( b ) ) ) {
		return false;
	}
	return brands.some( ( b ) => HEVC_BRANDS.has( b ) );
}

/**
 * Whether a file is a HEIC/HEIF picture, by its content.
 *
 * @param {Blob} file File or blob.
 * @return {Promise<boolean>} HEIC.
 */
export async function isHeicFile( file ) {
	if ( ! file || 'function' !== typeof file.slice ) {
		return false;
	}
	try {
		const head = file.slice( 0, 64 );
		const buf =
			'function' === typeof head.arrayBuffer
				? await head.arrayBuffer()
				: await new window.Response( head ).arrayBuffer();
		return isHeicBytes( new Uint8Array( buf ) );
	} catch ( e ) {
		return false;
	}
}

/**
 * Copy the decoder's interleaved RGBA plane into a tight buffer: rows can
 * be padded (stride wider than width * 4).
 *
 * @param {Object} ch { width, height, stride, data }.
 * @return {Uint8ClampedArray} width * height * 4 bytes.
 */
export function rgbaFromChannel( ch ) {
	const { width, height, stride } = ch;
	const row = width * 4;
	const out = new Uint8ClampedArray( row * height );
	if ( stride === row ) {
		out.set( ch.data.subarray( 0, row * height ) );
		return out;
	}
	for ( let y = 0; y < height; y++ ) {
		out.set( ch.data.subarray( y * stride, y * stride + row ), y * row );
	}
	return out;
}

let libPromise = null;

/** The decoder, loaded once and only when needed. */
function loadDecoder() {
	if ( ! libPromise ) {
		libPromise = ( async () => {
			const [ glue, wasm ] = await Promise.all( [
				import(
					/* webpackChunkName: "heic" */ 'libheif-js/libheif-wasm/libheif.js'
				),
				import(
					/* webpackChunkName: "heic" */ 'libheif-js/libheif-wasm/libheif.wasm'
				),
			] );
			const factory = glue.default || glue;
			const res = await window.fetch( wasm.default || wasm );
			if ( ! res.ok ) {
				throw new Error( 'HEIC decoder ' + res.status );
			}
			let lib = factory( { wasmBinary: await res.arrayBuffer() } );
			if ( lib && 'function' === typeof lib.then ) {
				lib = await lib;
			}
			return lib;
		} )().catch( ( e ) => {
			libPromise = null;
			throw e;
		} );
	}
	return libPromise;
}

/**
 * Decode the main picture of a HEIC file. Rotation and mirroring stored in
 * the file are applied by libheif, so the pixels come out upright.
 *
 * @param {ArrayBuffer} buffer The file.
 * @return {Promise<{width:number,height:number,data:Uint8ClampedArray}>} Pixels.
 */
export async function decodeHeic( buffer ) {
	const lib = await loadDecoder();
	const decoder = new lib.HeifDecoder();
	const images = decoder.decode( new Uint8Array( buffer ) );
	try {
		const img =
			images.find( ( i ) => i.is_primary && i.is_primary() ) ||
			images[ 0 ];
		if ( ! img ) {
			throw new Error( 'no image in the file' );
		}
		const out = await lib.heif_js_decode_image2(
			img.handle,
			lib.heif_colorspace.heif_colorspace_RGB,
			lib.heif_chroma.heif_chroma_interleaved_RGBA
		);
		if ( ! out || out.code ) {
			throw new Error( out?.message || 'decoding failed' );
		}
		try {
			const ch = out.channels.find(
				// eslint-disable-next-line eqeqeq -- the enum is an embind value object.
				( c ) => c.id == lib.heif_channel.heif_channel_interleaved
			);
			if ( ! ch ) {
				throw new Error( 'no RGBA plane' );
			}
			return {
				width: ch.width,
				height: ch.height,
				data: rgbaFromChannel( ch ),
			};
		} finally {
			lib.heif_image_release( out.image );
		}
	} finally {
		images.forEach( ( i ) => i.free && i.free() );
		if ( decoder.decoder ) {
			lib.heif_context_free( decoder.decoder );
			decoder.decoder = null;
		}
	}
}

/** Decoded pixels on a canvas. */
async function heicCanvas( buffer ) {
	const { width, height, data } = await decodeHeic( buffer );
	const canvas = createCanvas( width, height );
	canvas
		.getContext( '2d' )
		.putImageData( new window.ImageData( data, width, height ), 0, 0 );
	return canvas;
}

const failed = () =>
	new Error(
		__(
			'This HEIC photo could not be read. Export it as JPEG and try again.',
			'wunderpaint'
		)
	);

/**
 * A HEIC file as a JPEG file with the same name stem. Camera metadata is
 * not carried over (the canvas encodes pixels only), which also means the
 * location an iPhone stores does not end up on the website.
 *
 * @param {File}   file    The HEIC file.
 * @param {number} quality JPEG quality.
 * @return {Promise<File>} JPEG.
 */
export async function heicToJpegFile( file, quality = 0.92 ) {
	let canvas;
	try {
		canvas = await heicCanvas( await file.arrayBuffer() );
	} catch ( e ) {
		throw failed();
	}
	const blob = await new Promise( ( resolve ) =>
		canvas.toBlob( resolve, 'image/jpeg', quality )
	);
	if ( ! blob ) {
		throw failed();
	}
	const stem = ( file.name || 'photo' ).replace( /\.[^.]+$/, '' );
	return new window.File( [ blob ], stem + '.jpg', {
		type: 'image/jpeg',
		lastModified: file.lastModified || Date.now(),
	} );
}

/**
 * The one entry for files coming in: HEIC becomes JPEG, anything else is
 * returned as it is.
 *
 * @param {File} file Picked, dropped or pasted file.
 * @return {Promise<File>} A file the browser can show.
 */
export async function normalizeImageFile( file ) {
	return ( await isHeicFile( file ) ) ? heicToJpegFile( file ) : file;
}

/**
 * A HEIC picture behind a URL (an existing Media Library attachment) as a
 * JPEG data URL plus its size, for opening it in the editor.
 *
 * @param {string} url Same-origin or proxied URL.
 * @return {Promise<{src:string,width:number,height:number}>} Picture.
 */
export async function heicUrlToImage( url ) {
	const res = await window.fetch( url, { credentials: 'same-origin' } );
	if ( ! res.ok ) {
		throw failed();
	}
	let canvas;
	try {
		canvas = await heicCanvas( await res.arrayBuffer() );
	} catch ( e ) {
		throw failed();
	}
	return {
		src: canvas.toDataURL( 'image/jpeg', 0.92 ),
		width: canvas.width,
		height: canvas.height,
	};
}

/** Whether a URL points at a .heic / .heif file. */
export const isHeicUrl = ( url ) =>
	'string' === typeof url && /\.(heic|heif)(?:[?#]|$)/i.test( url );
