/**
 * Shared glyph access for the studios that draw type themselves.
 *
 * Two font sources: a bundled list the extension ships (WOFF1, parsed by
 * opentype.js directly) and every same-origin @font-face the editor page
 * declares (built-in library + custom uploads; woff2 decoded by a helper
 * chunk the extension ships as `woff2.js`). Google CDN faces stay out:
 * cross-origin stylesheets are unreadable and fetching them would break
 * the no-third-party guarantee.
 *
 * Generalised from wpie-3d-text-studio/src/fonts.js: the bundled list,
 * the base URL and the woff2 global are parameters of createFontLoader().
 *
 * No bare imports here (the shared/ rule, see shared/three3d/README.md):
 * the consumer hands in its own opentype.js module via bindOpentype(),
 * because esbuild and node both resolve bare specifiers from THIS folder,
 * which has no node_modules of its own.
 */

let opentype = null;

/** Hand in the opentype.js module once (extension bundle and tests alike). */
export function bindOpentype( mod ) {
	opentype = mod;
}

export function parseFont( arrayBuffer ) {
	if ( ! opentype ) {
		throw new Error( 'shared/glyphs: call bindOpentype( opentype ) before parseFont()' );
	}
	return opentype.parse( arrayBuffer );
}

/** Library keys look like `face:Archivo|900`. */
export const faceKey = ( family, weight ) => 'face:' + family + '|' + weight;

export function parseFaceKey( key ) {
	if ( ! key || ! key.startsWith( 'face:' ) ) {
		return null;
	}
	const [ family, w ] = key.slice( 5 ).split( '|' );
	return { family, weight: parseInt( w, 10 ) || 400 };
}

/**
 * Scan the page's readable stylesheets for usable @font-face rules.
 *
 * @return {Array} [{ family, weights: [n...], urls: { weight: url } }]
 */
export function faceCatalog() {
	if ( 'undefined' === typeof document ) {
		return [];
	}
	const families = new Map();
	for ( const sheet of document.styleSheets ) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch ( e ) {
			continue; // Cross-origin stylesheet.
		}
		if ( ! rules ) {
			continue;
		}
		for ( const rule of rules ) {
			if ( ! ( rule.style && 'CSSFontFaceRule' === rule.constructor.name ) ) {
				continue;
			}
			const st = rule.style;
			const family = ( st.getPropertyValue( 'font-family' ) || '' )
				.replace( /["']/g, '' )
				.trim();
			const m = ( st.getPropertyValue( 'src' ) || '' ).match(
				/url\(\s*["']?([^"')]+)["']?\s*\)/
			);
			if ( ! family || ! m ) {
				continue;
			}
			let url;
			try {
				url = new URL( m[ 1 ], sheet.href || window.location.href ).href;
			} catch ( e ) {
				continue;
			}
			if (
				! url.startsWith( window.location.origin ) ||
				! /\.(woff2?|ttf|otf)([?#]|$)/i.test( url )
			) {
				continue;
			}
			const styleV = ( st.getPropertyValue( 'font-style' ) || 'normal' ).trim();
			if ( styleV && 'normal' !== styleV && ! styleV.startsWith( 'oblique 0' ) ) {
				continue; // Italics: the studios set their own slant.
			}
			const weight = parseInt( st.getPropertyValue( 'font-weight' ), 10 ) || 400;
			const entry = families.get( family ) || { family, urls: {} };
			if ( ! entry.urls[ weight ] ) {
				entry.urls[ weight ] = url;
			}
			families.set( family, entry );
		}
	}
	return [ ...families.values() ]
		.map( ( f ) => ( {
			family: f.family,
			weights: Object.keys( f.urls )
				.map( Number )
				.sort( ( a, b ) => a - b ),
			urls: f.urls,
		} ) )
		.sort( ( a, b ) => a.family.localeCompare( b.family ) );
}

// The woff2 decoder loads as its own chunk on first use, one promise per global.
const woff2Promises = new Map();
function loadWoff2( baseUrl, globalName, file ) {
	if ( ! woff2Promises.has( globalName ) ) {
		const p = new Promise( ( resolve, reject ) => {
			if ( window[ globalName ] ) {
				resolve( window[ globalName ] );
				return;
			}
			const s = document.createElement( 'script' );
			s.src = baseUrl + file;
			s.onload = () =>
				window[ globalName ]
					? resolve( window[ globalName ] )
					: reject( new Error( 'woff2 helper missing' ) );
			s.onerror = () => reject( new Error( 'woff2 helper failed to load' ) );
			document.head.appendChild( s );
		} ).catch( ( e ) => {
			woff2Promises.delete( globalName );
			throw e;
		} );
		woff2Promises.set( globalName, p );
	}
	return woff2Promises.get( globalName );
}

/**
 * @param {Object} cfg
 * @param {Array}  cfg.bundled     [{ key, label, file, weight }]
 * @param {string} cfg.baseUrl     Extension folder URL (trailing slash).
 * @param {string} cfg.woff2Global Global the extension's woff2.js defines.
 * @param {string} [cfg.woff2File] Default 'woff2.js'.
 * @return {Object} { loadFont( key ) -> Promise<Font>, fontSpec( key ) }
 */
export function createFontLoader( cfg ) {
	const cache = new Map();
	const fontSpec = ( key ) => cfg.bundled.find( ( f ) => f.key === key ) || cfg.bundled[ 0 ];

	async function loadFace( key ) {
		const ref = parseFaceKey( key );
		const entry = faceCatalog().find( ( f ) => f.family === ref.family );
		if ( ! entry || ! entry.weights.length ) {
			throw new Error( 'font not on this page: ' + ref.family );
		}
		// Nearest shipped weight, like the editor's own font manager.
		const weight = entry.weights.reduce(
			( best, w ) => ( Math.abs( w - ref.weight ) < Math.abs( best - ref.weight ) ? w : best ),
			entry.weights[ 0 ]
		);
		const url = entry.urls[ weight ];
		const r = await window.fetch( url );
		if ( ! r.ok ) {
			throw new Error( 'font http ' + r.status );
		}
		let bytes = new Uint8Array( await r.arrayBuffer() );
		if ( /\.woff2([?#]|$)/i.test( url ) ) {
			const w2 = await loadWoff2( cfg.baseUrl, cfg.woff2Global, cfg.woff2File || 'woff2.js' );
			bytes = await w2.decompress( bytes );
		}
		return parseFont( bytes.buffer.slice( bytes.byteOffset, bytes.byteOffset + bytes.byteLength ) );
	}

	function loadFont( key ) {
		const isFace = key && key.startsWith( 'face:' );
		const cacheKey = isFace ? key : fontSpec( key ).key;
		if ( ! cache.has( cacheKey ) ) {
			const job = isFace
				? loadFace( key )
				: window
						.fetch( cfg.baseUrl + 'fonts/' + fontSpec( key ).file )
						.then( ( r ) => {
							if ( ! r.ok ) {
								throw new Error( 'font http ' + r.status );
							}
							return r.arrayBuffer();
						} )
						.then( ( buf ) => parseFont( buf ) );
			cache.set(
				cacheKey,
				job.catch( ( e ) => {
					// A failed fetch must not poison the cache forever.
					cache.delete( cacheKey );
					throw e;
				} )
			);
		}
		return cache.get( cacheKey );
	}

	return { loadFont, fontSpec };
}
