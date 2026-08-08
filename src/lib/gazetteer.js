/**
 * Offline place search.
 *
 * The index (assets/geo/cities.json, built by tools/build-gazetteer.mjs from
 * GeoNames) holds 34,079 cities of 15,000 inhabitants or more, each with its
 * names in the seven languages the editor ships in. It is fetched once, on
 * the first keystroke, and answers from memory after that.
 *
 * Why this is worth 710 KB over the wire: a place search used to be a network
 * round trip to Nominatim every time, and Nominatim's usage policy is one
 * request per second for everybody on earth. The index is smaller than ONE
 * Overpass response for a single small map area (819 KB, measured
 * 2026-08-08), and it removes the slowest, most failure-prone step of making
 * a map.
 *
 * It does not replace the proxy. A house number, a lake, a mountain pass:
 * those still go to Nominatim, and api.geo.search() falls through to it
 * whenever this module finds nothing.
 *
 * IT LIVES IN THE CORE, not in a map extension (moved 2026-08-08). It began
 * inside Map Posters, and the second extension that wanted a place search -
 * City Diorama - would have needed its own copy of the same 710 KB, with the
 * two drifting apart from the first rebuild. The core already owned the other
 * half of this search, the Nominatim proxy; having the fast local half sit
 * inside one extension put the seam in the wrong place. Now every extension
 * gets it through the api.geo.search() it already calls, without knowing
 * this file exists.
 */

/** Resolved index, or null until the first load finishes. */
let index = null;
/** In-flight load, so ten keystrokes cause one fetch. */
let loading = null;

/**
 * Strip case and diacritics so "Köln", "Koeln" and "koln" all match.
 *
 * @param {string} s Input.
 * @return {string} Comparable form.
 */
export function fold( s ) {
	return String( s ).toLowerCase().normalize( 'NFD' ).replace( /[̀-ͯ]/g, '' );
}

/**
 * Read the index, whatever the host did to it in transit.
 *
 * Same two-way handling as the template packs: most servers hand the .gz
 * back untouched and we inflate it here, some recognise the suffix, set
 * Content-Encoding and the browser has already done it. The gzip magic
 * number tells them apart, which beats trusting a header the browser may
 * have stripped.
 *
 * @param {Response} res Fetch response.
 * @return {Promise<Object>} Parsed index.
 */
async function readIndex( res ) {
	const buf = await res.arrayBuffer();
	const head = new Uint8Array( buf, 0, Math.min( 2, buf.byteLength ) );
	if ( ! ( 0x1f === head[ 0 ] && 0x8b === head[ 1 ] ) ) {
		return JSON.parse( new TextDecoder().decode( buf ) );
	}
	if ( 'function' !== typeof window.DecompressionStream ) {
		throw new Error( 'gzip unsupported' );
	}
	const stream = new window.Blob( [ buf ] )
		.stream()
		.pipeThrough( new window.DecompressionStream( 'gzip' ) );
	return JSON.parse( await new Response( stream ).text() );
}

/**
 * Load the index once.
 *
 * @param {string} [base] Base URL to read from. Defaults to the plugin's own
 *                        asset URL, which is what every caller wants; the
 *                        argument exists for tests.
 * @return {Promise<Object|null>} Index, or null if it could not be read.
 */
export function load( base ) {
	if ( ! base ) {
		// pluginUrl is the plugin's own folder, trailing slash included, and
		// the standalone Studio sets it to its app root, so one line serves
		// both products.
		base = String( window.WPIE?.pluginUrl || '' );
		if ( ! base ) {
			return Promise.resolve( null );
		}
		base += 'assets/';
	}
	if ( index ) {
		return Promise.resolve( index );
	}
	if ( ! loading ) {
		// The file ships uncompressed: wordpress.org does not allow a
		// pre-compressed file inside a plugin ZIP, and every server gzips a
		// JSON on the wire anyway, so the bytes that actually travel are the
		// same. The .gz is still asked for as a fallback because the
		// standalone Studio and older installs carry that form, and
		// readIndex() decides by the gzip magic number rather than by the
		// suffix, so either URL may serve either shape.
		loading = fetch( base + 'geo/cities.json' )
			.then( ( res ) =>
				res.ok ? res : fetch( base + 'geo/cities.json.gz' )
			)
			.then( readIndex )
			.then( ( data ) => {
				// Fold every name once, here, instead of on every keystroke:
				// 34k cities times a few names each is far too much work to
				// repeat while somebody is typing.
				data.f = data.c.map( ( row ) => row[ 0 ].map( fold ) );
				index = data;
				return index;
			} )
			.catch( () => {
				// A missing or broken index is not an error the user needs to
				// see: main.js simply falls through to the proxy, which is
				// what happened before this module existed.
				loading = null;
				return null;
			} );
	}
	return loading;
}

/**
 * Search the index.
 *
 * Rows are sorted by population in the build step, so scanning in order and
 * stopping at `limit` already ranks the result: Paris the capital comes
 * before Paris, Texas without any scoring here.
 *
 * Exact matches are collected separately and put first, otherwise typing
 * "Nice" would return Nicosia and Nicholasville above Nice, which have more
 * inhabitants and start with the same letters.
 *
 * @param {Object} data  Loaded index.
 * @param {string} query What the user typed.
 * @param {number} limit Max hits.
 * @return {Array} Hits in the same shape the geo proxy returns.
 */
export function search( data, query, limit = 6 ) {
	const q = fold( query.trim() );
	if ( ! data || q.length < 2 ) {
		return [];
	}
	const exact = [];
	const prefix = [];
	for ( let i = 0; i < data.f.length; i++ ) {
		const names = data.f[ i ];
		let hit = 0;
		for ( const n of names ) {
			if ( n === q ) {
				hit = 2;
				break;
			}
			if ( 0 === n.indexOf( q ) ) {
				hit = 1;
			}
		}
		if ( ! hit ) {
			continue;
		}
		( 2 === hit ? exact : prefix ).push( i );
		if ( exact.length >= limit ) {
			break;
		}
	}
	return exact
		.concat( prefix )
		.slice( 0, limit )
		.map( ( i ) => {
			const [ names, lat, lon, cc, pop ] = data.c[ i ];
			// Show the name the user typed if it is one of this city's, so
			// searching "München" does not answer with "Munich".
			const shown = names.find( ( n ) => fold( n ) === q ) || names[ 0 ];
			const country = data.cc[ cc ] || cc;
			return {
				name: shown,
				display: shown + ', ' + country,
				region: country,
				lat,
				lon,
				// The proxy's types drive the initial zoom in main.js.
				// Population is the honest stand-in for a place class we do
				// not have here.
				type:
					pop >= 300000 ? 'city' : pop >= 60000 ? 'town' : 'village',
				bbox: null,
				local: true,
			};
		} );
}
