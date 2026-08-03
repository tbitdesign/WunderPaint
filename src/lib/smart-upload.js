/**
 * Smart upload (v1.194.0): the import pipeline behind the Media Library
 * Manager's upload panel. For each file it can optionally downscale + convert
 * to WebP in the browser, uploads it, files it into a folder, extracts colors,
 * computes and stores its search vector (so it is instantly searchable and
 * future duplicate checks see it), and optionally describes it with the same
 * caption engine as the Metadata Assistant. A pre-upload duplicate check warns
 * when a near-identical image already exists.
 */

import { loadImage } from '../store/document';
import { createCanvas } from './raster';
import { uploadMediaFile, updateMedia } from './api';
import {
	embedImageUrl,
	loadVectors,
	cosine,
	saveVector,
	searchModelInstalled,
} from './image-search';
import { dominantColorBuckets } from './image-colors';
import { toDataUrl, captionOne } from './caption-fields';
import { mediaLib, ensureTagIds } from './media-library';

/** Types worth re-encoding; SVG and GIF are left untouched. */
const RASTER = new Set( [ 'image/jpeg', 'image/png', 'image/webp' ] );

/**
 * Downscale to maxDim and convert to WebP, entirely in the browser. Returns
 * the original file when it is not a raster image or when re-encoding brings
 * no size gain.
 */
export async function optimizeFile( file, maxDim = 2048, quality = 0.85 ) {
	if ( ! RASTER.has( file.type ) ) {
		return file;
	}
	const url = URL.createObjectURL( file );
	try {
		const img = await loadImage( url );
		const scale = Math.min(
			1,
			maxDim / Math.max( img.naturalWidth, img.naturalHeight )
		);
		const w = Math.max( 1, Math.round( img.naturalWidth * scale ) );
		const h = Math.max( 1, Math.round( img.naturalHeight * scale ) );
		const canvas = createCanvas( w, h );
		canvas.getContext( '2d' ).drawImage( img, 0, 0, w, h );
		const blob = await new Promise( ( r ) =>
			canvas.toBlob( r, 'image/webp', quality )
		);
		if ( ! blob || blob.size >= file.size ) {
			return file;
		}
		return new File(
			[ blob ],
			file.name.replace( /\.[^.]+$/, '' ) + '.webp',
			{ type: 'image/webp' }
		);
	} catch ( e ) {
		return file;
	} finally {
		URL.revokeObjectURL( url );
	}
}

/**
 * Nearest existing library image to a file, when it is a near-duplicate.
 * Needs the image search model; returns null without it or when nothing is
 * close enough.
 *
 * @param {File} file The file to check.
 * @return {Promise<?{id:number,score:number,thumb:string}>}
 */
export async function checkDuplicate( file ) {
	if ( ! searchModelInstalled() ) {
		return null;
	}
	const url = URL.createObjectURL( file );
	try {
		const [ vec, vectors ] = await Promise.all( [
			embedImageUrl( url ),
			loadVectors(),
		] );
		let best = null;
		for ( const v of vectors ) {
			const s = cosine( vec, v.vec );
			if ( ! best || s > best.score ) {
				best = { id: v.id, score: s, thumb: v.thumb };
			}
		}
		return best && best.score >= 0.965 ? best : null;
	} catch ( e ) {
		return null;
	} finally {
		URL.revokeObjectURL( url );
	}
}

/**
 * Import one file with the chosen options.
 *
 * @param {File}   file  The file.
 * @param {Object} opts  { folder, optimize, describe, engine, lang }.
 * @return {Promise<{id:number}>}
 */
export async function importOne( file, opts = {} ) {
	const {
		folder = 0,
		optimize = false,
		describe = false,
		engine = 'local',
		lang = '',
	} = opts;
	const f = optimize ? await optimizeFile( file ) : file;
	const { id, url } = await uploadMediaFile( f );
	if ( folder ) {
		await mediaLib.assign( { ids: [ id ], folder } ).catch( () => {} );
	}
	// Colors, search vector and captioning only make sense for images;
	// other files (PDF, v1.332) just upload and get filed.
	const isImage = 0 === ( f.type || '' ).indexOf( 'image/' );
	if ( ! isImage ) {
		return { id };
	}
	try {
		const colors = await dominantColorBuckets( url );
		await mediaLib.saveColors( id, colors );
	} catch ( e ) {}
	try {
		const vec = await embedImageUrl( url );
		await saveVector( id, vec );
	} catch ( e ) {}
	if ( describe && engine ) {
		try {
			const dataUrl = await toDataUrl( url );
			const r = await captionOne( dataUrl, engine, lang );
			const patch = {};
			if ( r.title ) {
				patch.title = r.title;
			}
			if ( r.alt ) {
				patch.alt = r.alt;
			}
			if ( r.caption ) {
				patch.caption = r.caption;
			}
			if ( r.description ) {
				patch.description = r.description;
			}
			if ( Object.keys( patch ).length ) {
				await updateMedia( id, patch );
			}
			const names = [ ...( r.tags || [] ) ];
			if ( r.mood ) {
				names.push( r.mood );
			}
			if ( names.length ) {
				const ids = await ensureTagIds( names );
				if ( ids.length ) {
					await mediaLib.assign( { ids: [ id ], addTags: ids } );
				}
			}
		} catch ( e ) {}
	}
	return { id };
}
