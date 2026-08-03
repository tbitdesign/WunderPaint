/**
 * Crop and format maths for replacing an image (v1.351.0).
 *
 * The geometry lives here, apart from the canvas work, so it can be tested
 * without a DOM. Everything is in source pixels: the dialog scales for display
 * and hands back real coordinates, which keeps rounding errors out of the
 * output file.
 */

/** Image formats we can write from a canvas. */
export const MIME_BY_EXT = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/png', // canvas cannot write gif; png keeps transparency
	avif: 'image/webp', // same story, webp is the closest we can encode
};

/** Formats that cannot carry transparency. */
const OPAQUE = [ 'image/jpeg' ];

/**
 * Normalise an extension to a format key, so jpg and jpeg are one thing.
 *
 * @param {string} ext File extension without the dot.
 * @return {string} Normalised key.
 */
export function normalizeExt( ext ) {
	const e = String( ext || '' ).toLowerCase();
	return 'jpeg' === e || 'jpe' === e ? 'jpg' : e;
}

/**
 * Extension of a filename, lower case and normalised.
 *
 * @param {string} name Filename.
 * @return {string}
 */
export function extOf( name ) {
	const m = /\.([a-z0-9]+)$/i.exec( String( name || '' ) );
	return m ? normalizeExt( m[ 1 ] ) : '';
}

/**
 * Would converting from one format to the other lose transparency?
 *
 * @param {string} fromExt Source extension.
 * @param {string} toExt   Target extension.
 * @return {boolean}
 */
export function losesTransparency( fromExt, toExt ) {
	const from = MIME_BY_EXT[ normalizeExt( fromExt ) ] || '';
	const to = MIME_BY_EXT[ normalizeExt( toExt ) ] || '';
	return ! OPAQUE.includes( from ) && OPAQUE.includes( to );
}

/**
 * Are two aspect ratios close enough to call the same?
 *
 * A one pixel rounding difference on a thumbnail is not a reason to make
 * somebody crop an image.
 *
 * @param {number} aW Width of the first.
 * @param {number} aH Height of the first.
 * @param {number} bW Width of the second.
 * @param {number} bH Height of the second.
 * @param {number} tol Tolerance as a fraction, default half a percent.
 * @return {boolean}
 */
export function sameRatio( aW, aH, bW, bH, tol = 0.005 ) {
	if ( ! aW || ! aH || ! bW || ! bH ) {
		return true;
	}
	const a = aW / aH;
	const b = bW / bH;
	return Math.abs( a - b ) / Math.max( a, b ) <= tol;
}

/**
 * The largest centred rectangle of a given ratio that fits in the source.
 *
 * @param {number} srcW  Source width.
 * @param {number} srcH  Source height.
 * @param {number} ratio Target width divided by height.
 * @return {{x:number,y:number,w:number,h:number}} Crop in source pixels.
 */
export function fitCrop( srcW, srcH, ratio ) {
	if ( ! srcW || ! srcH || ! ratio || ratio <= 0 ) {
		return { x: 0, y: 0, w: srcW || 0, h: srcH || 0 };
	}
	let w = srcW;
	let h = Math.round( w / ratio );
	if ( h > srcH ) {
		h = srcH;
		w = Math.round( h * ratio );
	}
	return {
		x: Math.round( ( srcW - w ) / 2 ),
		y: Math.round( ( srcH - h ) / 2 ),
		w,
		h,
	};
}

/**
 * Keep a crop inside the image, at its ratio and above a minimum size.
 *
 * Width leads: the height is always derived from the ratio, so dragging can
 * never bend the rectangle out of shape.
 *
 * @param {Object} crop  Proposed crop.
 * @param {number} srcW  Source width.
 * @param {number} srcH  Source height.
 * @param {number} ratio Target ratio, 0 for free.
 * @param {number} minW  Smallest allowed width in source pixels.
 * @return {{x:number,y:number,w:number,h:number}}
 */
export function clampCrop( crop, srcW, srcH, ratio, minW = 24 ) {
	let w = Math.max( minW, Math.round( crop.w ) );
	let h = ratio
		? Math.round( w / ratio )
		: Math.max( minW, Math.round( crop.h ) );

	// Shrink to fit if the ratio pushed it past an edge.
	if ( w > srcW ) {
		w = srcW;
		h = ratio ? Math.round( w / ratio ) : h;
	}
	if ( h > srcH ) {
		h = srcH;
		w = ratio ? Math.round( h * ratio ) : w;
	}

	const x = Math.min( Math.max( 0, Math.round( crop.x ) ), srcW - w );
	const y = Math.min( Math.max( 0, Math.round( crop.y ) ), srcH - h );

	return { x: Math.max( 0, x ), y: Math.max( 0, y ), w, h };
}

/**
 * Does this replacement need any pixel work at all?
 *
 * Answering no matters: an untouched upload keeps its original encoding and
 * its metadata, and re-encoding a JPEG for no reason only costs quality.
 *
 * @param {Object} opts            Options.
 * @param {boolean} opts.crop      Whether a crop is active.
 * @param {string}  opts.fromExt   Extension of the picked file.
 * @param {string}  opts.toExt     Extension the result must have.
 * @param {boolean} opts.resize    Whether the output is being resized.
 * @return {boolean}
 */
export function needsProcessing( { crop, fromExt, toExt, resize } ) {
	if ( crop || resize ) {
		return true;
	}
	return normalizeExt( fromExt ) !== normalizeExt( toExt );
}

/**
 * Load a File into an image element, resolving with its natural size.
 *
 * @param {File} file Image file.
 * @return {Promise<{img:HTMLImageElement,url:string,w:number,h:number}>} Loaded image.
 */
export function loadImageFile( file ) {
	return new Promise( ( resolve, reject ) => {
		const url = URL.createObjectURL( file );
		const img = new window.Image();
		img.onload = () =>
			resolve( {
				img,
				url,
				w: img.naturalWidth,
				h: img.naturalHeight,
			} );
		img.onerror = () => {
			URL.revokeObjectURL( url );
			reject( new Error( 'decode failed' ) );
		};
		img.src = url;
	} );
}

/**
 * Render a crop of an image into a new File.
 *
 * @param {Object} opts           Options.
 * @param {HTMLImageElement} opts.img Source image, already loaded.
 * @param {Object} opts.crop      Crop rect in source pixels, or null for all.
 * @param {number} opts.outW      Output width, 0 to keep the crop's own size.
 * @param {number} opts.outH      Output height, 0 to keep the crop's own size.
 * @param {string} opts.ext       Target extension.
 * @param {string} opts.name      Filename for the result.
 * @param {number} opts.quality   Encoder quality for lossy formats.
 * @return {Promise<File>} The rendered file.
 */
export async function renderToFile( {
	img,
	crop,
	outW,
	outH,
	ext,
	name,
	quality = 0.92,
} ) {
	const src = crop || {
		x: 0,
		y: 0,
		w: img.naturalWidth,
		h: img.naturalHeight,
	};
	const w = Math.max( 1, Math.round( outW || src.w ) );
	const h = Math.max( 1, Math.round( outH || src.h ) );

	const canvas = window.document.createElement( 'canvas' );
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext( '2d' );
	ctx.imageSmoothingQuality = 'high';

	const mime = MIME_BY_EXT[ normalizeExt( ext ) ] || 'image/png';
	// A format without an alpha channel renders transparency as black unless
	// something is painted underneath first.
	if ( OPAQUE.includes( mime ) ) {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect( 0, 0, w, h );
	}
	ctx.drawImage( img, src.x, src.y, src.w, src.h, 0, 0, w, h );

	const blob = await new Promise( ( resolve ) =>
		canvas.toBlob( resolve, mime, quality )
	);
	if ( ! blob ) {
		throw new Error( 'encode failed' );
	}
	return new window.File( [ blob ], name, { type: mime } );
}

/**
 * Swap a filename's extension.
 *
 * @param {string} name Filename.
 * @param {string} ext  New extension without the dot.
 * @return {string}
 */
export function withExt( name, ext ) {
	const base = String( name || 'image' ).replace( /\.[a-z0-9]+$/i, '' );
	return `${ base }.${ normalizeExt( ext ) }`;
}
