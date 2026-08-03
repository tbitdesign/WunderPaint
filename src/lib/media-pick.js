/**
 * The classic wp.media image picker as a promise (v1.241.0). One half of
 * the shared window.WPIE.pickMedia entry point: editor-main routes to the
 * Media Library Manager in pick mode (settings toggle) or to this modal.
 * Both paths resolve the same item shape
 * { id, url, thumb, title, alt, caption, date }; null means cancelled.
 *
 * v1.307.1 adds the GLOBAL half: installWpMediaShim() replaces
 * window.wp.media on the editor page (only while the picker setting is
 * on), so every caller - extensions that never heard of WPIE.pickMedia,
 * old code, future code - lands in the Media Library Manager without
 * being migrated. The classic modal stays reachable: this module keeps
 * the original wp.media and uses it for its own fallback path.
 */

import { __ } from '@wordpress/i18n';

// The untouched wp.media, captured before the shim replaces it. The
// classic fallback below MUST use this, or "Classic" inside the manager
// would loop straight back into the manager.
let originalWpMedia = null;

const classicWpMedia = () =>
	originalWpMedia || ( window.wp && window.wp.media ) || null;

/** Shared-shape item -> the wp.media attachment JSON callers expect. */
function toAttachmentJson( item ) {
	const url = item.url || '';
	const thumb = item.thumb || url;
	return {
		id: item.id,
		url,
		link: url,
		alt: item.alt || '',
		title: item.title || '',
		caption: item.caption || '',
		filename: item.title || String( url ).split( '/' ).pop() || '',
		mime: item.mime || 'image/jpeg',
		type: String( item.mime || 'image/' ).split( '/' )[ 0 ],
		width: item.width || 0,
		height: item.height || 0,
		sizes: {
			full: { url, width: item.width || 0, height: item.height || 0 },
			large: { url },
			medium: { url: thumb },
			thumbnail: { url: thumb },
		},
	};
}

/** Backbone-collection lookalike over the picked items. */
function makeSelection( items ) {
	const models = ( items || [] ).map( ( it ) => {
		const json = toAttachmentJson( it );
		return {
			attributes: json,
			toJSON: () => json,
			get: ( key ) => json[ key ],
		};
	} );
	return {
		length: models.length,
		models,
		first: () => models[ 0 ] || null,
		last: () => models[ models.length - 1 ] || null,
		at: ( i ) => models[ i ] || null,
		map: ( cb ) => models.map( cb ),
		each: ( cb ) => models.forEach( cb ),
		forEach: ( cb ) => models.forEach( cb ),
		toJSON: () => models.map( ( m ) => m.toJSON() ),
	};
}

/** A frame lookalike that opens the shared picker instead of wp.media. */
function makeShimFrame( opts ) {
	const handlers = {};
	let selection = makeSelection( [] );
	const emit = ( ev ) =>
		( handlers[ ev ] || [] ).forEach( ( cb ) => {
			try {
				cb();
			} catch ( e ) {
				// A broken caller handler must not kill the picker.
			}
		} );
	const frame = {
		on: ( ev, cb ) => {
			( handlers[ ev ] = handlers[ ev ] || [] ).push( cb );
			return frame;
		},
		once: ( ev, cb ) => frame.on( ev, cb ),
		off: () => frame,
		open: () => {
			const type =
				( opts && opts.library && opts.library.type ) || 'image';
			window.WPIE.pickMedia( {
				multiple: !! ( opts && opts.multiple ),
				// Mime-mix arrays pass through (v1.333).
				types:
					Array.isArray( type ) ||
					[ 'video', 'audio', 'all' ].includes( type )
						? type
						: 'image',
				title: opts && opts.title,
				button: opts && opts.button && opts.button.text,
			} ).then( ( items ) => {
				if ( items && items.length ) {
					selection = makeSelection( items );
					emit( 'select' );
				}
				emit( 'close' );
			} );
			return frame;
		},
		close: () => frame,
		state: () => ( {
			get: ( key ) => ( 'selection' === key ? selection : null ),
		} ),
	};
	return frame;
}

/**
 * Make the Media Library Manager the one true picker: every
 * `wp.media( {...} )` call on this page now opens it. Statics
 * (wp.media.view, .model, .attachment, ...) pass through untouched.
 * Idempotent; no-op when wp.media is absent.
 */
export function installWpMediaShim() {
	const orig = window.wp && window.wp.media;
	if ( ! orig || orig._wpieShim ) {
		return;
	}
	originalWpMedia = orig;
	const shim = ( opts ) => makeShimFrame( opts );
	Object.assign( shim, orig );
	shim._wpieShim = true;
	window.wp.media = shim;
}

/** wp.media attachment JSON -> shared item shape. */
function mapAttachment( a ) {
	return {
		id: a.id,
		url: ( a.sizes && a.sizes.large && a.sizes.large.url ) || a.url,
		thumb:
			( a.sizes && a.sizes.thumbnail && a.sizes.thumbnail.url ) || a.url,
		title: a.title || a.filename || '',
		alt: a.alt || '',
		caption: a.caption || '',
		date: a.dateFormatted || '',
	};
}

/**
 * Open the classic picker.
 *
 * @param {Object} opts { multiple?, title?, button? }.
 * @return {Promise<?Array>} Picked items or null on cancel.
 */
export function wpMediaPick( opts = {} ) {
	return new Promise( ( resolve ) => {
		const media = classicWpMedia();
		if ( ! media ) {
			resolve( null );
			return;
		}
		const types = opts.types || 'image';
		const frame = media( {
			title: opts.title || __( 'Pick images', 'wunderpaint' ),
			multiple: false !== opts.multiple ? 'add' : false,
			// 'all' means no mime clause; wp.media takes a string or an
			// array of types/mimes (['image','application/pdf'], v1.333).
			library: 'all' === types ? {} : { type: types },
			button: {
				text: opts.button || __( 'Use selection', 'wunderpaint' ),
			},
		} );
		let done = false;
		frame.on( 'select', () => {
			done = true;
			resolve(
				frame.state().get( 'selection' ).toJSON().map( mapAttachment )
			);
		} );
		// 'close' can fire around 'select'; defer so a confirmed
		// selection wins over the cancel path.
		frame.on( 'close', () => {
			window.setTimeout( () => {
				if ( ! done ) {
					resolve( null );
				}
			}, 0 );
		} );
		frame.open();
	} );
}
