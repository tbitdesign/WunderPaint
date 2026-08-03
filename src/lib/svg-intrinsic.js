/**
 * Intrinsic size for SVGs that declare none (v1.334.0).
 *
 * An SVG exported with only a `viewBox` (the Illustrator/Affinity default)
 * has an aspect ratio but NO intrinsic size. Canvas `drawImage()` then has
 * to invent a raster size and derives it from the DESTINATION surface, so
 * the very same layer paints differently everywhere it is drawn:
 *
 * - `layerAlphaAt()` probes into a 5x5 canvas → nothing lands in the probe
 *   → every click falls through → the layer cannot be selected or moved.
 * - `renderLayerToDevice()` uses a scratch canvas of layer x zoom → the
 *   artwork visibly changes size when the zoom level changes.
 * - Export renders at yet another size → the file differs from the screen.
 *
 * Fixing it per draw call is hopeless; the size has to become a property of
 * the document. We therefore hand the browser the same size its own default
 * sizing algorithm would have picked (CSS Images 3: contain the aspect ratio
 * in the 300x150 default object size) as real width/height attributes. The
 * artwork stays vector, so it is still crisp at every zoom, and every draw
 * path now agrees on how big it is.
 *
 * Leaf module: no editor imports (jest-safe). Everything but sizedSvgUrl()
 * at the end is pure string work.
 */

/**
 * Absolute CSS units an SVG width/height attribute may carry. Percentages,
 * font-relative units and `auto` are NOT an intrinsic size.
 */
const UNITS = {
	'': 1,
	px: 1,
	pt: 96 / 72,
	pc: 16,
	in: 96,
	cm: 96 / 2.54,
	mm: 96 / 25.4,
	q: 96 / 101.6,
};

/** Default object size for a replaced element (CSS Images 3). */
const DEFAULT_W = 300;
const DEFAULT_H = 150;

const NUMBER = '[+-]?(?:\\d+\\.?\\d*|\\.\\d+)';

/**
 * A length in CSS pixels, or null when the value is not an absolute length.
 *
 * @param {string|null} value Attribute value.
 * @return {number|null} Pixels.
 */
function absoluteLength( value ) {
	const m = new RegExp( `^\\s*(${ NUMBER })\\s*([a-z]*)\\s*$`, 'i' ).exec(
		value || ''
	);
	if ( ! m ) {
		return null;
	}
	const unit = m[ 2 ].toLowerCase();
	if ( ! Object.prototype.hasOwnProperty.call( UNITS, unit ) ) {
		return null;
	}
	const px = Number( m[ 1 ] ) * UNITS[ unit ];
	return Number.isFinite( px ) && px > 0 ? px : null;
}

/**
 * Span of the ROOT `<svg …>` tag. Quote-aware so an attribute value
 * containing `>` cannot end the tag early, and deliberately only the first
 * one: nested `<svg>` elements must stay untouched.
 *
 * @param {string} text SVG source.
 * @return {{start: number, end: number}|null} Span.
 */
function rootTagSpan( text ) {
	const open = /<svg\b/i.exec( text );
	if ( ! open ) {
		return null;
	}
	let quote = null;
	for ( let i = open.index + open[ 0 ].length; i < text.length; i++ ) {
		const c = text[ i ];
		if ( quote ) {
			if ( c === quote ) {
				quote = null;
			}
		} else if ( '"' === c || "'" === c ) {
			quote = c;
		} else if ( '>' === c ) {
			return { start: open.index, end: i + 1 };
		}
	}
	return null;
}

const attrPattern = ( name ) =>
	new RegExp( `(\\s${ name }\\s*=\\s*)("[^"]*"|'[^']*')`, 'i' );

/**
 * Read an attribute off the root tag.
 *
 * @param {string} tag  Root tag source.
 * @param {string} name Attribute name.
 * @return {string|null} Value.
 */
function readAttr( tag, name ) {
	const m = attrPattern( name ).exec( tag );
	if ( ! m ) {
		return null;
	}
	return m[ 2 ].slice( 1, -1 );
}

/**
 * Set an attribute on the root tag, replacing an existing one in place.
 *
 * @param {string} tag   Root tag source.
 * @param {string} name  Attribute name.
 * @param {string} value New value.
 * @return {string} Rewritten tag.
 */
function setAttr( tag, name, value ) {
	const re = attrPattern( name );
	if ( re.test( tag ) ) {
		return tag.replace( re, ( full, head ) => `${ head }"${ value }"` );
	}
	return tag.replace( /^<svg\b/i, `<svg ${ name }="${ value }"` );
}

/**
 * Aspect ratio from the viewBox, or null when there is none to read.
 *
 * @param {string} tag Root tag source.
 * @return {number|null} width / height.
 */
function viewBoxAspect( tag ) {
	const raw = readAttr( tag, 'viewBox' );
	if ( ! raw ) {
		return null;
	}
	const parts = raw
		.trim()
		.split( /[\s,]+/ )
		.map( Number );
	if ( 4 !== parts.length || ! parts.every( Number.isFinite ) ) {
		return null;
	}
	return parts[ 2 ] > 0 && parts[ 3 ] > 0 ? parts[ 2 ] / parts[ 3 ] : null;
}

/**
 * The default sizing algorithm: fill in what the document does not say.
 *
 * @param {number|null} w      Declared width in px.
 * @param {number|null} h      Declared height in px.
 * @param {number|null} aspect Aspect ratio.
 * @return {{w: number, h: number}} Concrete size.
 */
function concreteSize( w, h, aspect ) {
	if ( w ) {
		return { w, h: aspect ? w / aspect : DEFAULT_H };
	}
	if ( h ) {
		return { w: aspect ? h * aspect : DEFAULT_W, h };
	}
	if ( ! aspect ) {
		return { w: DEFAULT_W, h: DEFAULT_H };
	}
	// Largest box with that aspect ratio that fits the default object size.
	const width = Math.min( DEFAULT_W, DEFAULT_H * aspect );
	return { w: width, h: width / aspect };
}

/** Four decimals is well past what a rasterizer can tell apart. */
const fmt = ( n ) => String( Math.round( n * 10000 ) / 10000 );

/**
 * Give an SVG a concrete intrinsic size when it declares none.
 *
 * @param {string} text SVG source.
 * @return {string|null} Rewritten source, or null when nothing has to change.
 */
export function svgWithIntrinsicSize( text ) {
	if ( 'string' !== typeof text || ! text ) {
		return null;
	}
	const span = rootTagSpan( text );
	if ( ! span ) {
		return null;
	}
	const tag = text.slice( span.start, span.end );
	const w = absoluteLength( readAttr( tag, 'width' ) );
	const h = absoluteLength( readAttr( tag, 'height' ) );
	if ( w && h ) {
		return null;
	}
	const size = concreteSize( w, h, viewBoxAspect( tag ) );
	let fixed = setAttr( tag, 'width', fmt( size.w ) );
	fixed = setAttr( fixed, 'height', fmt( size.h ) );
	return text.slice( 0, span.start ) + fixed + text.slice( span.end );
}

/**
 * Is this source worth reading as SVG text before it is decoded? Everything
 * else must not pay for an extra fetch.
 *
 * @param {string} src Image source.
 * @return {boolean} True for .svg URLs and svg data URLs.
 */
export function isSvgSrc( src ) {
	if ( 'string' !== typeof src || ! src ) {
		return false;
	}
	return (
		/^data:image\/svg\+xml[;,]/i.test( src ) ||
		/\.svg(?:[?#]|$)/i.test( src )
	);
}

/**
 * A source an <img> can decode into a properly sized SVG, for the sources
 * that need one. Everything else must not pay for an extra fetch, and an
 * unreadable file (CORS, offline) falls back to the plain load.
 *
 * @param {string} src Image source.
 * @return {Promise<string|null>} Object URL of a sized copy, or null to
 *                                load `src` unchanged.
 */
export async function sizedSvgUrl( src ) {
	if ( ! isSvgSrc( src ) ) {
		return null;
	}
	try {
		const response = await window.fetch( src );
		if ( false === response.ok ) {
			return null;
		}
		const fixed = svgWithIntrinsicSize( await response.text() );
		if ( ! fixed ) {
			return null;
		}
		return window.URL.createObjectURL(
			new window.Blob( [ fixed ], { type: 'image/svg+xml' } )
		);
	} catch ( e ) {
		return null;
	}
}
