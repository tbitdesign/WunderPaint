/**
 * A drawn brush tip, rendered from its recipe into a stampable mask.
 *
 * A tip is a COVERAGE MASK, not a picture: what a stamp recipe leaves
 * transparent stays empty, and the paint colour comes from the stroke. So
 * the recipe is drawn once, its own colours are thrown away, and its alpha
 * is refilled with the stroke's colour. The recipe's "cut out" element
 * already composites with `destination-out`, which means a hole punched in
 * the maker is a real hole in the tip, with no special handling here.
 *
 * TWO THINGS THIS FILE EXISTS TO GET RIGHT.
 *
 * It renders at a BUCKET SIZE AT OR ABOVE the mark, never below. Rendering
 * small and scaling up is exactly the mush that made the particle sheet
 * unusable at 1600px; a mask is only ever scaled DOWN, which a canvas does
 * well. Buckets, rather than the exact size, because size jitter would
 * otherwise mint a fresh canvas for every mark.
 *
 * And it caches per colour as well as per size, because the alternative is
 * recolouring the whole scratch canvas after the fact - which would repaint
 * any other stroke that shares it.
 */

import { drawStamp } from './stamp-doc';

/** Render sizes. The smallest one at or above the mark wins. */
const BUCKETS = [ 32, 64, 128, 256, 512 ];

/**
 * Enough for a stroke with colour jitter on: a handful of sizes across the
 * few dozen shades the jitter grid can produce. The grid is what makes
 * this a bounded number at all - without it a mark could ask for a colour
 * no other mark ever asks for again.
 */
const MAX_CACHED = 128;

/**
 * And a ceiling in MEMORY, because counting entries says nothing about
 * what they weigh. A 512px mask is a megabyte of canvas; 128 of those is
 * 134 MB held for a brush nobody is using any more. The two limits guard
 * different things - the count keeps lookups cheap, this keeps a big tip
 * from quietly eating the tab - and whichever bites first, bites.
 */
const MAX_BYTES = 48 * 1024 * 1024;

const cache = new Map();
let bytes = 0;

/** What one mask costs: RGBA, one canvas of its bucket size. */
const weigh = ( c ) => ( c ? c.width * c.height * 4 : 0 );

/**
 * The smallest render size that does not force an upscale.
 *
 * @param {number} px Mark size in device pixels.
 * @return {number} One of BUCKETS.
 */
export function bucketFor( px ) {
	const want = Math.max( 1, Math.ceil( px ) );
	for ( const b of BUCKETS ) {
		if ( b >= want ) {
			return b;
		}
	}
	return BUCKETS[ BUCKETS.length - 1 ];
}

/** Forget every cached mask. Called when a recipe is edited. */
export function clearTipMasks() {
	cache.clear();
	// The tally has to go with it, or the budget shrinks by whatever was
	// dropped and never comes back.
	bytes = 0;
}

/**
 * A stampable mask for one recipe, at one size, in one colour.
 *
 * @param {Object} doc    The stamp recipe.
 * @param {string} key    Stable identity of that recipe (id plus revision).
 * @param {number} px     Mark size in pixels.
 * @param {string} colour The stroke's colour.
 * @return {Object|null} A canvas, or null where none can be made.
 */
export function tipMask( doc, key, px, colour ) {
	if ( ! doc || ! doc.elements || ! doc.elements.length ) {
		return null;
	}
	const size = bucketFor( px );
	const id = key + '|' + size + '|' + colour;
	const hit = cache.get( id );
	if ( hit ) {
		// Re-insert, so Map order is RECENCY and not age. Without this the
		// eviction below threw out the entry that had been here longest,
		// which under a wide jitter is reliably the one about to be asked
		// for again: a stroke cycles through its shades over and over, so
		// the oldest is simply the next in the rotation. Measured at 330
		// shades against 128 slots it turned a cache into a treadmill.
		cache.delete( id );
		cache.set( id, hit );
		return hit;
	}
	if ( 'undefined' === typeof document ) {
		return null;
	}
	const c = document.createElement( 'canvas' );
	c.width = size;
	c.height = size;
	const g = c.getContext( '2d' );
	// jsdom has no 2D context, and a brush that throws in a test run is a
	// worse outcome than a brush that falls back to a round mark.
	if ( ! g ) {
		return null;
	}
	drawStamp( g, doc, size, 0 );
	// Keep the coverage, drop the recipe's own colours.
	g.globalCompositeOperation = 'source-in';
	g.fillStyle = colour || '#000';
	g.fillRect( 0, 0, size, size );
	g.globalCompositeOperation = 'source-over';

	cache.set( id, c );
	bytes += weigh( c );
	// Least recently USED goes first, thanks to the re-insert on every hit
	// above. Never evict what was just put in: at a size where one mask is
	// already over budget, dropping it would leave nothing cached and redo
	// the work on the very next mark.
	while (
		cache.size > 1 &&
		( cache.size > MAX_CACHED || bytes > MAX_BYTES )
	) {
		const oldest = cache.keys().next().value;
		bytes -= weigh( cache.get( oldest ) );
		cache.delete( oldest );
	}
	return c;
}
