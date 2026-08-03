/**
 * Carousel slicing (v1.1): cut a wide render into N equal full-height
 * tiles (Instagram-style multi-post).
 */

import { createCanvas } from './raster';

/**
 * Tile boundaries for a given width.
 *
 * @param {number} width Total width (px).
 * @param {number} n     Tile count (≥1).
 * @return {Array} [{x, w}] per tile (widths sum to width).
 */
export function carouselSlices( width, n ) {
	const count = Math.max( 1, Math.round( n ) );
	const base = Math.floor( width / count );
	const slices = [];
	let x = 0;
	for ( let i = 0; i < count; i++ ) {
		const w = i === count - 1 ? width - x : base;
		slices.push( { x, w } );
		x += w;
	}
	return slices;
}

/**
 * Slice a rendered master canvas into tile canvases.
 *
 * @param {HTMLCanvasElement} master Master render.
 * @param {number}            n      Tile count.
 * @return {Array} Canvases (full height).
 */
export function sliceCarousel( master, n ) {
	return carouselSlices( master.width, n ).map( ( { x, w } ) => {
		const tile = createCanvas( w, master.height );
		tile.getContext( '2d' ).drawImage(
			master,
			x,
			0,
			w,
			master.height,
			0,
			0,
			w,
			master.height
		);
		return tile;
	} );
}
