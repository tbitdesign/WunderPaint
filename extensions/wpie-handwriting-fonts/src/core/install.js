/**
 * Getting the finished font into the editor.
 *
 * This is the part the standalone tools cannot do. A font that lands in
 * the site's own font library shows up in the font picker, in brand
 * kits, in templates, in curved text and in every layer style, and it
 * does so for every user of the site, not just the person who drew it.
 *
 * It becomes usable in the same second rather than after a reload,
 * because the bytes are already in memory: the face is registered from
 * those directly, and the server's own stylesheet takes over quietly on
 * the next page load.
 */

const REST_FONTS = '/wpie/v1/fonts';

/** Whether this user may write to the site's font library. */
export const canInstall = () =>
	!! ( window.WPIE && window.WPIE.canManage && window.wp && window.wp.apiFetch );

/** Whether we are running outside WordPress altogether. */
export const isStandalone = () => ! ( window.wp && window.wp.apiFetch );

/**
 * Make a font usable in this session, right now.
 *
 * @param {string}     family Family name.
 * @param {Uint8Array} bytes  Font file.
 * @param {Object}     opts   `{ weight, italic }`.
 * @return {Object} `{ url, revoke() }`.
 */
export function registerFace( family, bytes, opts = {} ) {
	const { weight = 400, italic = false } = opts;
	const blob = new Blob( [ bytes ], { type: 'font/ttf' } );
	const url = URL.createObjectURL( blob );
	const style = italic ? 'italic' : 'normal';

	if ( 'undefined' !== typeof FontFace && document.fonts ) {
		try {
			const face = new FontFace( family, `url(${ url }) format('truetype')`, {
				weight: String( weight ),
				style,
			} );
			face.load().then(
				() => document.fonts.add( face ),
				() => {}
			);
		} catch ( e ) {
			injectStyle( family, url, weight, style );
		}
	} else {
		injectStyle( family, url, weight, style );
	}

	rememberFamily( family );
	return { url, revoke: () => URL.revokeObjectURL( url ) };
}

function injectStyle( family, url, weight, style ) {
	const el = document.createElement( 'style' );
	el.setAttribute( 'data-wpie-handwriting', family );
	el.textContent = `@font-face{font-family:"${ family.replace( /"/g, '' ) }";src:url(${ url }) format("truetype");font-weight:${ weight };font-style:${ style };font-display:swap}`;
	document.head.appendChild( el );
}

/**
 * Tell the editor the family exists, so its pickers list it without a
 * reload. The host reads this array to decide what may be drawn.
 *
 * @param {string} family Family name.
 */
export function rememberFamily( family ) {
	if ( ! window.WPIE ) {
		return;
	}
	if ( ! Array.isArray( window.WPIE.customFonts ) ) {
		window.WPIE.customFonts = [];
	}
	if ( ! window.WPIE.customFonts.some( ( f ) => f.family === family ) ) {
		window.WPIE.customFonts.push( { family } );
	}
}

/**
 * Upload one cut to the site's font library.
 *
 * @param {string}     family   Family name.
 * @param {Uint8Array} bytes    Font file.
 * @param {string}     filename File name to store it under.
 * @return {Promise<Object>} The server's font list.
 */
export async function uploadFont( family, bytes, filename ) {
	const form = new FormData();
	form.append(
		'file',
		new Blob( [ bytes ], { type: 'font/ttf' } ),
		filename.endsWith( '.ttf' ) ? filename : `${ filename }.ttf`
	);
	form.append( 'family', family );
	return window.wp.apiFetch( { path: REST_FONTS, method: 'POST', body: form } );
}

/**
 * Install a whole family, one cut after another.
 *
 * Every cut is registered locally as soon as it is uploaded, so the
 * font is already usable while the rest are still on their way. A cut
 * that fails does not take the others down with it; the caller is told
 * what got through.
 *
 * @param {string}   family Family name.
 * @param {Array}    cuts   `{ style, weight, italic, bytes, filename }`.
 * @param {Function} onStep Progress callback.
 * @return {Promise<Object>} `{ installed, failed }`.
 */
export async function installFamily( family, cuts, onStep ) {
	const installed = [];
	const failed = [];
	for ( const cut of cuts ) {
		try {
			if ( onStep ) {
				onStep( { style: cut.style, done: installed.length + failed.length, total: cuts.length } );
			}
			await uploadFont( family, cut.bytes, cut.filename );
			registerFace( family, cut.bytes, { weight: cut.weight, italic: cut.italic } );
			installed.push( cut.style );
		} catch ( e ) {
			failed.push( { style: cut.style, message: messageOf( e ) } );
		}
	}
	return { installed, failed };
}

/** The fonts the site already has. */
export async function listInstalled() {
	try {
		const res = await window.wp.apiFetch( { path: REST_FONTS } );
		return res && Array.isArray( res.fonts ) ? res.fonts : [];
	} catch ( e ) {
		return [];
	}
}

/**
 * Remove one installed font file.
 *
 * @param {string} id Font id from the server list.
 * @return {Promise<boolean>} Whether it went.
 */
export async function removeInstalled( id ) {
	try {
		await window.wp.apiFetch( { path: `${ REST_FONTS }/${ id }`, method: 'DELETE' } );
		return true;
	} catch ( e ) {
		return false;
	}
}

/**
 * Fetch an installed font file back, so its project can be reopened.
 *
 * The REST list gives the stored file name; the uploads folder is where
 * it lives. Both come from the same site, so no cross-origin question
 * arises.
 *
 * @param {Object} font One entry from `listInstalled`.
 * @return {Promise<Uint8Array|null>} The file.
 */
export async function fetchInstalled( font ) {
	const base = fontsBaseUrl();
	if ( ! base || ! font || ! font.file ) {
		return null;
	}
	try {
		const res = await fetch( `${ base }/${ font.file }`, { credentials: 'same-origin' } );
		if ( ! res.ok ) {
			return null;
		}
		return new Uint8Array( await res.arrayBuffer() );
	} catch ( e ) {
		return null;
	}
}

/**
 * Where custom fonts are served from.
 *
 * The editor does not publish the path, but it does publish the uploads
 * base in more than one shape depending on the host version, so the
 * known spellings are tried before giving up.
 *
 * @return {string} Base URL without a trailing slash, or an empty string.
 */
export function fontsBaseUrl() {
	const w = window.WPIE || {};
	const candidates = [ w.fontsUrl, w.uploadsUrl && `${ w.uploadsUrl }/wpie-fonts` ];
	for ( const c of candidates ) {
		if ( c && 'string' === typeof c ) {
			return c.replace( /\/+$/, '' );
		}
	}
	// Fall back to deriving it from a stylesheet the host already loaded.
	const link = Array.from( document.styleSheets || [] )
		.map( ( s ) => s.href || '' )
		.find( ( h ) => h.includes( '/wpie-fonts/' ) );
	if ( link ) {
		return link.slice( 0, link.indexOf( '/wpie-fonts/' ) + '/wpie-fonts'.length );
	}
	return '';
}

/**
 * Hand the file to the user instead of the server.
 *
 * @param {Uint8Array} bytes    Font file.
 * @param {string}     filename File name.
 * @param {Object}     bridge   The editor bridge, when available.
 */
export function downloadFont( bytes, filename, bridge ) {
	const blob = new Blob( [ bytes ], { type: 'font/ttf' } );
	if ( bridge && bridge.util && bridge.util.downloadBlob ) {
		bridge.util.downloadBlob( blob, filename );
		return;
	}
	const url = URL.createObjectURL( blob );
	const a = document.createElement( 'a' );
	a.href = url;
	a.download = filename;
	document.body.appendChild( a );
	a.click();
	a.remove();
	setTimeout( () => URL.revokeObjectURL( url ), 4000 );
}

/** The CSS somebody needs to use the font outside WordPress. */
export function faceSnippet( family, filename, cuts ) {
	return ( cuts || [ { filename, weight: 400, italic: false } ] )
		.map(
			( c ) =>
				`@font-face {\n  font-family: "${ family }";\n  src: url("${ c.filename }") format("truetype");\n  font-weight: ${ c.weight || 400 };\n  font-style: ${ c.italic ? 'italic' : 'normal' };\n  font-display: swap;\n}`
		)
		.join( '\n\n' );
}

function messageOf( e ) {
	if ( ! e ) {
		return 'Unknown error';
	}
	return e.message || e.code || String( e );
}
