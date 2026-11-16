/**
 * Website colors (v1.432.0): the colors the site itself declares - the
 * theme palette, colors added under Styles, and Elementor's Global Colors -
 * read by the server into window.WPIE.siteColors (Palettes::site_colors).
 * Shown in the Color panel's palette list and in the Color Schemer.
 */

import { parseColor, toHexColor } from './color';
import { colorKey } from './color-replace';

/**
 * Valid entries, first appearance of a color wins, names kept for tooltips.
 *
 * @param {Array} raw [{ name, color }] from the bootstrap.
 * @return {Array<{name: string, color: string}>} Entries with #rrggbb(aa).
 */
export function siteColorEntries( raw = window.WPIE?.siteColors ) {
	const out = [];
	const seen = new Set();
	for ( const entry of Array.isArray( raw ) ? raw : [] ) {
		const value = String( entry?.color || '' ).trim();
		if ( ! colorKey( value ) ) {
			continue;
		}
		const { r, g, b, a } = parseColor( value );
		const color = toHexColor( r, g, b, a ).toLowerCase();
		if ( seen.has( color ) ) {
			continue;
		}
		seen.add( color );
		out.push( { name: String( entry?.name || '' ), color } );
	}
	return out;
}

/** Just the colors, for palette lists. */
export function siteColorValues( raw ) {
	return siteColorEntries( raw ).map( ( e ) => e.color );
}
