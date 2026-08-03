/**
 * Multi-size export (v0.2): render the document once, cover-crop it into
 * each target size, bundle everything as one ZIP.
 */

import { createCanvas, renderToCanvas, sharedImageCache } from './raster';

/**
 * Centered cover-crop of a source canvas into target dimensions
 * (like CSS `object-fit: cover`).
 *
 * @param {HTMLCanvasElement} source  Source canvas.
 * @param {number}            targetW Target width.
 * @param {number}            targetH Target height.
 * @return {HTMLCanvasElement} New canvas targetW×targetH.
 */
export function coverCrop( source, targetW, targetH ) {
	const out = createCanvas( targetW, targetH );
	const ctx = out.getContext( '2d' );
	const scale = Math.max( targetW / source.width, targetH / source.height );
	const drawW = source.width * scale;
	const drawH = source.height * scale;
	ctx.imageSmoothingEnabled = true;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(
		source,
		( targetW - drawW ) / 2,
		( targetH - drawH ) / 2,
		drawW,
		drawH
	);
	return out;
}

export const canvasToBlob = ( canvas, mime, quality ) =>
	new Promise( ( resolve, reject ) =>
		canvas.toBlob(
			( blob ) =>
				blob ? resolve( blob ) : reject( new Error( 'encode failed' ) ),
			mime,
			quality
		)
	);

/**
 * Render + cover-crop the document into every requested size and return a
 * ZIP blob.
 *
 * @param {Object} doc      Document.
 * @param {Array}  layers   Layers.
 * @param {Array}  sizes    [{ id, label, w, h }] targets.
 * @param {Object}   settings             Output settings.
 * @param {string}   settings.format      'png' | 'jpeg' | 'webp'.
 * @param {number}   settings.quality     10–100.
 * @param {string}   settings.baseName    File name stem.
 * @param {Function} settings.postProcess Optional per-size canvas hook
 *                                        (watermark, v0.3).
 * @return {Promise<Blob>} ZIP file blob.
 */
export async function batchExport(
	doc,
	layers,
	sizes,
	{ format = 'png', quality = 90, baseName = 'export', postProcess } = {}
) {
	const { default: JSZip } = await import(
		/* webpackChunkName: "jszip" */ 'jszip'
	);
	const zip = new JSZip();
	const mime =
		'jpeg' === format
			? 'image/jpeg'
			: 'webp' === format
			? 'image/webp'
			: 'image/png';
	const ext = 'jpeg' === format ? 'jpg' : format;

	// Render once at the largest needed scale, crop from there.
	const maxScale = Math.max(
		1,
		...sizes.map( ( s ) => Math.max( s.w / doc.w, s.h / doc.h ) )
	);
	const master = await renderToCanvas( doc, layers, {
		scale: Math.min( maxScale, 4096 / Math.max( doc.w, doc.h ) ),
		cache: sharedImageCache,
	} );

	for ( const size of sizes ) {
		let cropped = coverCrop( master, size.w, size.h );
		if ( postProcess ) {
			cropped = postProcess( cropped ) || cropped;
		}
		const blob = await canvasToBlob(
			cropped,
			mime,
			Math.min( 1, Math.max( 0.1, quality / 100 ) )
		);
		zip.file( `${ baseName }-${ size.w }x${ size.h }.${ ext }`, blob );
	}

	return zip.generateAsync( { type: 'blob' } );
}
