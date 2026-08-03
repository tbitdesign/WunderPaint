/**
 * Guide preset math (v1.1): pure helpers for the guides manager.
 */

/**
 * Guides for a named preset.
 *
 * @param {string} kind 'thirds' | 'golden' | 'margins'.
 * @param {number} w    Document width.
 * @param {number} h    Document height.
 * @return {Array} [{axis:'v'|'h', pos}] (rounded).
 */
export function presetGuides( kind, w, h ) {
	const r = ( n ) => Math.round( n );
	switch ( kind ) {
		case 'thirds':
			return [
				{ axis: 'v', pos: r( w / 3 ) },
				{ axis: 'v', pos: r( ( 2 * w ) / 3 ) },
				{ axis: 'h', pos: r( h / 3 ) },
				{ axis: 'h', pos: r( ( 2 * h ) / 3 ) },
			];
		case 'golden':
			return [
				{ axis: 'v', pos: r( w * 0.382 ) },
				{ axis: 'v', pos: r( w * 0.618 ) },
				{ axis: 'h', pos: r( h * 0.382 ) },
				{ axis: 'h', pos: r( h * 0.618 ) },
			];
		case 'margins':
			return [
				{ axis: 'v', pos: r( w * 0.05 ) },
				{ axis: 'v', pos: r( w * 0.95 ) },
				{ axis: 'h', pos: r( h * 0.05 ) },
				{ axis: 'h', pos: r( h * 0.95 ) },
			];
		default:
			return [];
	}
}

/**
 * Merge new guides into an existing list without duplicates.
 *
 * @param {Array} existing Current guides.
 * @param {Array} added    Guides to add.
 * @return {Array} Merged list.
 */
export function mergeGuides( existing, added ) {
	const seen = new Set(
		( existing || [] ).map( ( g ) => `${ g.axis }:${ g.pos }` )
	);
	return [
		...( existing || [] ),
		...added.filter( ( g ) => ! seen.has( `${ g.axis }:${ g.pos }` ) ),
	];
}
