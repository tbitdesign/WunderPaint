/**
 * Web fonts inside the SVG. An SVG drawn through an <img> sees none of
 * the page's fonts, so the sheet would print in the browser's fallback
 * face. This collects the @font-face sources of a family (the editor's
 * own rules, or the Google stylesheet the font manager links), fetches
 * the files once and writes them into a <style> as data URLs. Anything
 * that fails leaves the SVG as it is.
 */
const cache = new Map();

const stripQuotes = ( s ) =>
	String( s || '' )
		.replace( /["']/g, '' )
		.trim();
const latin = ( range ) =>
	! range || /U\+0000|U\+0-|U\+00[0-9A-F]{2}-/i.test( range );
const mimeOf = ( url ) =>
	/\.woff2/i.test( url )
		? 'font/woff2'
		: /\.woff/i.test( url )
		? 'font/woff'
		: /\.otf/i.test( url )
		? 'font/otf'
		: 'font/ttf';
const formatOf = ( url ) =>
	/\.woff2/i.test( url )
		? 'woff2'
		: /\.woff/i.test( url )
		? 'woff'
		: /\.otf/i.test( url )
		? 'opentype'
		: 'truetype';

/* The page's own @font-face rules for a family (same-origin sheets only). */
function pageRules( family ) {
	const out = [];
	const want = family.toLowerCase();
	for ( const sheet of Array.from( document.styleSheets || [] ) ) {
		let rules;
		try {
			rules = sheet.cssRules;
		} catch ( e ) {
			continue;
		}
		for ( const rule of Array.from( rules || [] ) ) {
			if (
				! rule.style ||
				stripQuotes( rule.style.fontFamily ).toLowerCase() !== want
			) {
				continue;
			}
			const src = rule.style.src || '';
			const m = src.match( /url\(\s*["']?([^"')]+)["']?\s*\)/ );
			if ( ! m || ! latin( rule.style.unicodeRange ) ) {
				continue;
			}
			let url = m[ 1 ];
			try {
				url = new URL( url, sheet.href || window.location.href ).href;
			} catch ( e ) {
				// keep as is
			}
			out.push( {
				url,
				weight: rule.style.fontWeight || '400',
				style: rule.style.fontStyle || 'normal',
			} );
		}
	}
	return out;
}

/* The Google stylesheet, as the font manager links it, parsed for the latin faces. */
async function googleRules( family ) {
	// Only when the administrator switched the Google Fonts CDN on
	// (Settings > Fonts). Without that the plugin promises to contact no
	// font CDN, and this fallback broke that promise in the user's browser
	// (A3, 10.09.2026).
	if ( ! ( window.WPIE && window.WPIE.fontsGoogle ) ) {
		return [];
	}
	const href =
		'https://fonts.googleapis.com/css2?family=' +
		encodeURIComponent( family ).replace( /%20/g, '+' ) +
		':ital,wght@0,400;0,700;1,400;1,700&display=swap';
	const res = await fetch( href, { mode: 'cors' } );
	if ( ! res.ok ) {
		return [];
	}
	const css = await res.text();
	const out = [];
	for ( const block of css.match( /@font-face\s*\{[^}]*\}/g ) || [] ) {
		const url = ( block.match( /url\(([^)]+)\)/ ) || [] )[ 1 ];
		const range = ( block.match( /unicode-range:\s*([^;]+);/ ) || [] )[ 1 ];
		if ( ! url || ! latin( range ) ) {
			continue;
		}
		out.push( {
			url: url.replace( /["']/g, '' ),
			weight:
				( block.match( /font-weight:\s*([^;]+);/ ) || [] )[ 1 ] ||
				'400',
			style:
				( block.match( /font-style:\s*([^;]+);/ ) || [] )[ 1 ] ||
				'normal',
		} );
	}
	return out;
}

async function asBase64( url ) {
	const res = await fetch( url, { mode: 'cors' } );
	if ( ! res.ok ) {
		return '';
	}
	const blob = await res.blob();
	return new Promise( ( ok ) => {
		const fr = new FileReader();
		fr.onload = () => ok( String( fr.result ).split( ',' )[ 1 ] || '' );
		fr.onerror = () => ok( '' );
		fr.readAsDataURL( blob );
	} );
}

/** The @font-face CSS with embedded files for one family, '' when nothing could be found. */
export function fontFaceCss( family, bridge ) {
	if ( ! family ) {
		return Promise.resolve( '' );
	}
	if ( cache.has( family ) ) {
		return cache.get( family );
	}
	const job = ( async () => {
		try {
			if ( bridge && bridge.fonts && bridge.fonts.ensureFont ) {
				await bridge.fonts.ensureFont( family, 400 );
				await bridge.fonts.ensureFont( family, 700 );
			}
		} catch ( e ) {
			// the face may still be on the page
		}
		let rules = [];
		try {
			rules = pageRules( family );
		} catch ( e ) {
			rules = [];
		}
		if ( ! rules.length ) {
			try {
				rules = await googleRules( family );
			} catch ( e ) {
				rules = [];
			}
		}
		const seen = new Set();
		const css = [];
		for ( const r of rules ) {
			const key = r.weight + '/' + r.style;
			if ( seen.has( key ) ) {
				continue;
			}
			seen.add( key );
			const b64 = await asBase64( r.url ).catch( () => '' );
			if ( b64 ) {
				css.push(
					`@font-face{font-family:"${ String( family ).replace(
						/["\\]/g,
						'\\$&'
					) }";font-weight:${ r.weight };font-style:${
						r.style
					};src:url(data:${ mimeOf(
						r.url
					) };base64,${ b64 }) format("${ formatOf( r.url ) }")}`
				);
			}
		}
		return css.join( '' );
	} )().catch( () => '' );
	cache.set( family, job );
	return job;
}

/** The SVG with a <style> of embedded faces for the families it uses. */
export async function embedFonts( svg, families, bridge ) {
	const list = [ ...new Set( ( families || [] ).filter( Boolean ) ) ];
	if ( ! list.length || 'undefined' === typeof document ) {
		return svg;
	}
	const css = (
		await Promise.all( list.map( ( f ) => fontFaceCss( f, bridge ) ) )
	).join( '' );
	if ( ! css ) {
		return svg;
	}
	return svg.replace(
		/^<svg([^>]*)>/,
		( m ) => m + '<style>' + css + '</style>'
	);
}
