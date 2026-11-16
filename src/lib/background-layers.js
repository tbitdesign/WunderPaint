/**
 * Generated full-document pictures follow the document (19.10.2026).
 *
 * A Background Studio background and a Vignette & Film overlay are
 * pictures rendered at the document's size, with their recipe on the
 * layer (`bg`, or the `wpie-core/vignette` generator). Canvas Size only
 * moved them, so a larger canvas showed a bare margin until they were
 * edited again; Image Size stretched their pixels and Resize Design
 * letterboxed them into the new format. Since the recipe is there, these
 * three render them again at the new size instead - the same picture,
 * because both engines work in relative units.
 *
 * Only a layer that still fills the document is rendered again: one the
 * user moved, scaled, rotated, flipped or masked - and an overlay clipped
 * to a single photo - is a picture like any other and is left to the
 * usual handling.
 */

import { backgroundImage } from './backgrounds';
import { FILM_GENERATOR_ID, renderFilmOverlay } from './film-overlay';

const isFilm = ( layer ) =>
	layer?.generator?.id === FILM_GENERATOR_ID && !! layer.generator.params;

const near = ( a, b ) => Math.abs( ( Number( a ) || 0 ) - b ) <= 1;

/**
 * @param {Object} layer A layer.
 * @param {Object} doc   The document it lies in ({ w, h }).
 * @return {boolean} Whether it is a generated picture that fills it.
 */
export function fillsDocument( layer, doc ) {
	return (
		( !! layer?.bg || isFilm( layer ) ) &&
		'image' === layer.type &&
		! layer.mask &&
		! layer.clip &&
		! layer.rot &&
		! layer.flipX &&
		! layer.flipY &&
		! layer.quad &&
		near( layer.x, 0 ) &&
		near( layer.y, 0 ) &&
		near( layer.w, doc.w ) &&
		near( layer.h, doc.h )
	);
}

/**
 * The same picture, rendered for a document of a new size.
 *
 * @param {Object} layer A layer for which fillsDocument() holds.
 * @param {number} w     New document width.
 * @param {number} h     New document height.
 * @return {Object} The layer with its new picture, filling the document.
 */
export function backgroundForSize( layer, w, h ) {
	const width = Math.max( 1, Math.round( w ) );
	const height = Math.max( 1, Math.round( h ) );
	let canvas, dataUrl;
	if ( layer.bg ) {
		( { canvas, dataUrl } = backgroundImage( layer.bg, width, height ) );
	} else {
		canvas = renderFilmOverlay( layer.generator.params, width, height );
		dataUrl = canvas.toDataURL( 'image/png' );
	}
	return {
		...layer,
		src: dataUrl,
		naturalW: canvas.width,
		naturalH: canvas.height,
		x: 0,
		y: 0,
		w: width,
		h: height,
	};
}
