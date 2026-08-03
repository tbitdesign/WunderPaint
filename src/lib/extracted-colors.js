/**
 * Session palette (v1.38): colours extracted from an image via
 * Image → Extract Colors from Image. Kept in memory only (not persisted) and
 * shown as a swatch row in the colour picker so the image's colours are quick
 * to reuse for text, shapes and fills.
 */

let colors = [];
const listeners = new Set();

/** The current extracted colours (may be empty). */
export function getExtractedColors() {
	return colors;
}

/** Replace the extracted colours and notify subscribers. */
export function setExtractedColors( list ) {
	colors = Array.isArray( list ) ? list.slice( 0, 24 ) : [];
	listeners.forEach( ( fn ) => {
		try {
			fn();
		} catch ( e ) {}
	} );
}

/** Subscribe to changes; returns an unsubscribe function. */
export function onExtractedColorsChange( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}
