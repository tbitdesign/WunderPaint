/**
 * Starter-template search metadata (v1.255.0). Templates need no image
 * model for a "semantic" search: unlike a photo, a template descriptor
 * already CONTAINS its semantics in plain data - the copy on its text
 * layers, every fill and gradient color, its category. This module
 * derives a tiny search index from the descriptor (lazily, memoized)
 * and the gallery filters run entirely on it.
 *
 * Colors reuse the Media Library Manager's bucket classifier
 * (rgbToBucket), so "red" means the same thing in both searches.
 */

import { rgbToBucket } from '../lib/image-colors';

/** Parse a CSS color literal (#rgb, #rrggbb, rgb()/rgba()) or null. */
export function parseColor( str ) {
	const s = String( str || '' ).trim();
	let m = /^#([0-9a-f]{3})$/i.exec( s );
	if ( m ) {
		const [ r, g, b ] = m[ 1 ];
		return {
			r: parseInt( r + r, 16 ),
			g: parseInt( g + g, 16 ),
			b: parseInt( b + b, 16 ),
			a: 1,
		};
	}
	m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec( s );
	if ( m ) {
		return {
			r: parseInt( m[ 1 ].slice( 0, 2 ), 16 ),
			g: parseInt( m[ 1 ].slice( 2, 4 ), 16 ),
			b: parseInt( m[ 1 ].slice( 4, 6 ), 16 ),
			a: m[ 2 ] ? parseInt( m[ 2 ], 16 ) / 255 : 1,
		};
	}
	m =
		/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
			s
		);
	if ( m ) {
		return {
			r: +m[ 1 ],
			g: +m[ 2 ],
			b: +m[ 3 ],
			a: m[ 4 ] === undefined ? 1 : +m[ 4 ],
		};
	}
	return null;
}

/** Weighted color contributions of one layer, as [color, weight] pairs. */
function layerColors( layer, docArea ) {
	const area = Math.min(
		Math.max( 1, ( layer.w || 0 ) * ( layer.h || 0 ) ),
		docArea
	);
	const out = [];
	if ( 'shape' === layer.type ) {
		out.push( [ layer.fill, area ] );
		if ( layer.stroke && layer.strokeW > 0 ) {
			out.push( [ layer.stroke, area * 0.15 ] );
		}
	} else if ( 'text' === layer.type ) {
		// Ink covers a fraction of the box; a text background covers it all.
		out.push( [ layer.color, area * 0.35 ] );
		if ( layer.bgColor ) {
			out.push( [ layer.bgColor, area ] );
		}
	}
	const stops = layer.gradientStops || layer.stops || null;
	if ( Array.isArray( stops ) && stops.length ) {
		for ( const stop of stops ) {
			out.push( [ stop.color, area / stops.length ] );
		}
	}
	return out;
}

const ACHROMATIC = [ 'black', 'gray', 'white', 'brown' ];

/**
 * Dominant color buckets of a template descriptor, strongest first.
 * Chromatic buckets are boosted (the MLM heuristic) so an accent color
 * on a big dark background still counts as part of the palette.
 *
 * @param {Object} descriptor Bundled template descriptor.
 * @return {string[]} Up to four bucket names.
 */
export function templateColorBuckets( descriptor ) {
	const doc = descriptor.doc || {};
	const docArea = Math.max( 1, ( doc.w || 1 ) * ( doc.h || 1 ) );
	const pairs = [ [ doc.bg, docArea ] ];
	for ( const layer of descriptor.layers || [] ) {
		if ( false === layer.visible ) {
			continue;
		}
		pairs.push( ...layerColors( layer, docArea ) );
	}
	const weights = {};
	let total = 0;
	for ( const [ color, weight ] of pairs ) {
		const rgb = parseColor( color );
		if ( ! rgb || rgb.a < 0.35 ) {
			continue;
		}
		let w = weight;
		const bucket = rgbToBucket( rgb.r, rgb.g, rgb.b );
		if ( ! ACHROMATIC.includes( bucket ) ) {
			w *= 2.2;
		}
		weights[ bucket ] = ( weights[ bucket ] || 0 ) + w;
		total += w;
	}
	return Object.entries( weights )
		.filter( ( [ , w ] ) => w / total >= 0.1 )
		.sort( ( a, b ) => b[ 1 ] - a[ 1 ] )
		.slice( 0, 4 )
		.map( ( [ bucket ] ) => bucket );
}

/** Lowercased copy of every text layer plus the template name. */
function templateKeywords( descriptor ) {
	const parts = [ descriptor.name || '' ];
	for ( const layer of descriptor.layers || [] ) {
		if ( 'text' === layer.type && layer.text ) {
			parts.push( layer.text );
		}
	}
	return parts.join( ' ' ).toLowerCase();
}

const metaCache = new WeakMap();

/**
 * The search metadata of a template list entry: one lowercased haystack
 * (name + copy + category + color buckets) and the bucket list.
 *
 * @param {Object} template List entry from templates.js (or a pack).
 * @return {{haystack: string, colors: string[]}} Search metadata.
 */
export function templateMeta( template ) {
	const key = template.descriptor || template;
	const cached = metaCache.get( key );
	if ( cached ) {
		return cached;
	}
	const descriptor = template.descriptor || null;
	const colors = descriptor ? templateColorBuckets( descriptor ) : [];
	const haystack = [
		descriptor
			? templateKeywords( descriptor )
			: String( template.name || '' ).toLowerCase(),
		template.category || '',
		colors.join( ' ' ),
	].join( ' ' );
	const meta = { haystack, colors };
	metaCache.set( key, meta );
	return meta;
}

/**
 * Filter a template list by search text, category and color bucket.
 * Every whitespace-separated query token must match the haystack, so
 * "neon sale" narrows instead of widening.
 *
 * @param {Array}  templates       List entries.
 * @param {Object} filters         Active filters.
 * @param {string} [filters.q]     Search text.
 * @param {string} [filters.cat]   Category id ('' = all).
 * @param {string} [filters.color] Color bucket ('' = all).
 * @return {Array} The matching entries.
 */
export function filterTemplates( templates, { q = '', cat = '', color = '' } ) {
	const tokens = q.trim().toLowerCase().split( /\s+/ ).filter( Boolean );
	return templates.filter( ( template ) => {
		if ( cat && template.category !== cat ) {
			return false;
		}
		if ( ! tokens.length && ! color ) {
			return true;
		}
		const meta = templateMeta( template );
		if ( color && ! meta.colors.includes( color ) ) {
			return false;
		}
		return tokens.every( ( token ) => meta.haystack.includes( token ) );
	} );
}
