/**
 * Quick-browse stock categories, shared by the Asset Library tray and the
 * full Stock Images dialog so both show the same cards and reuse one
 * thumbnail cache (v1.291.5). Labels are localised; the query stays English
 * for the best provider results.
 */
import { useState, useEffect } from '@wordpress/element';
import { __ } from '@wordpress/i18n';
import { stock } from './api';

export const PHOTO_CATEGORIES = [
	{ q: 'nature', label: __( 'Nature', 'wunderpaint' ) },
	{ q: 'business', label: __( 'Business', 'wunderpaint' ) },
	{ q: 'people', label: __( 'People', 'wunderpaint' ) },
	{ q: 'food', label: __( 'Food', 'wunderpaint' ) },
	{ q: 'travel', label: __( 'Travel', 'wunderpaint' ) },
	{ q: 'technology', label: __( 'Technology', 'wunderpaint' ) },
	{ q: 'architecture', label: __( 'Architecture', 'wunderpaint' ) },
	{ q: 'animals', label: __( 'Animals', 'wunderpaint' ) },
	{ q: 'fashion', label: __( 'Fashion', 'wunderpaint' ) },
	{ q: 'sports', label: __( 'Sports', 'wunderpaint' ) },
	{ q: 'flowers', label: __( 'Flowers', 'wunderpaint' ) },
	{ q: 'abstract', label: __( 'Abstract', 'wunderpaint' ) },
	{ q: 'background', label: __( 'Background', 'wunderpaint' ) },
	{ q: 'texture', label: __( 'Texture', 'wunderpaint' ) },
	{ q: 'city', label: __( 'City', 'wunderpaint' ) },
	{ q: 'mountains', label: __( 'Mountains', 'wunderpaint' ) },
	{ q: 'beach', label: __( 'Beach', 'wunderpaint' ) },
	{ q: 'coffee', label: __( 'Coffee', 'wunderpaint' ) },
	{ q: 'car', label: __( 'Cars', 'wunderpaint' ) },
	{ q: 'wedding', label: __( 'Wedding', 'wunderpaint' ) },
	{ q: 'office', label: __( 'Office', 'wunderpaint' ) },
	{ q: 'winter', label: __( 'Winter', 'wunderpaint' ) },
	{ q: 'garden', label: __( 'Garden', 'wunderpaint' ) },
	{ q: 'night sky', label: __( 'Night', 'wunderpaint' ) },
	{ q: 'minimal', label: __( 'Minimal', 'wunderpaint' ) },
];

// One representative thumbnail per category, fetched once per session so the
// cards look like real results. Cache is module-level, so opening the tray
// and the dialog share the same fetched thumbnails.
const catThumbCache = new Map();

/**
 * Load a representative thumbnail per category for the given provider/type.
 *
 * @param {string|null} provider Stock provider id (null = skip).
 * @param {string}      [type]   'photo' | 'illustration' | 'vector'.
 * @return {Object} Map of category query -> thumbnail URL.
 */
export function usePhotoCatThumbs( provider, type = 'photo' ) {
	const [ thumbs, setThumbs ] = useState( {} );
	useEffect( () => {
		if ( ! provider ) {
			return;
		}
		let cancelled = false;
		const initial = {};
		PHOTO_CATEGORIES.forEach( ( c ) => {
			const key = provider + ':' + type + ':' + c.q;
			if ( catThumbCache.has( key ) ) {
				initial[ c.q ] = catThumbCache.get( key );
				return;
			}
			catThumbCache.set( key, null ); // in flight
			stock
				.search( provider, c.q, 1, type )
				.then( ( data ) => {
					const thumb = data?.results?.[ 0 ]?.thumb || null;
					catThumbCache.set( key, thumb );
					if ( ! cancelled && thumb ) {
						setThumbs( ( prev ) => ( {
							...prev,
							[ c.q ]: thumb,
						} ) );
					}
				} )
				.catch( () => catThumbCache.delete( key ) );
		} );
		setThumbs( initial );
		return () => {
			cancelled = true;
		};
	}, [ provider, type ] );
	return thumbs;
}
