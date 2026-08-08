/**
 * Building accented characters out of the letters that were drawn.
 *
 * Nobody should have to draw sixty accented letters by hand, and if
 * they did, the accents would drift: five slightly different acutes
 * across five letters is exactly what makes a hand-made font look
 * unfinished. Drawing each accent once and placing it by rule gives the
 * opposite result, and it is the only way the six editor languages come
 * for free.
 */

import { contourBounds, transformContours, translateContours } from './outline.js';

/** Air between a letter and the accent above or below it, as a share of the em. */
const GAP = 0.05;

/** Accents over capitals are toned down; full size looks clumsy up there. */
const CAP_SCALE = 0.86;

/**
 * Place a mark on a base letter.
 *
 * @param {Array}  base    Base letter contours, in drawing position.
 * @param {Array}  mark    Accent contours, in drawing position.
 * @param {string} pos     `over` or `under`.
 * @param {Object} metrics Font metrics.
 * @return {Array} Combined contours.
 */
export function composeGlyph( base, mark, pos, metrics ) {
	const b = contourBounds( base );
	const m = contourBounds( mark );
	if ( ! b ) {
		return mark ? mark.slice() : [];
	}
	if ( ! m ) {
		return base.slice();
	}
	const em = metrics.unitsPerEm || 1000;
	const gap = em * GAP;
	const isCap = b.y1 >= ( metrics.capHeight || 700 ) * 0.9;
	const scale = isCap ? CAP_SCALE : 1;

	let placed = mark;
	if ( 1 !== scale ) {
		const cx = ( m.x0 + m.x1 ) / 2;
		const cy = 'under' === pos ? m.y1 : m.y0;
		placed = transformContours( mark, {
			a: scale,
			d: scale,
			e: cx - cx * scale,
			f: cy - cy * scale,
		} );
	}
	const p = contourBounds( placed );
	const dx = ( b.x0 + b.x1 ) / 2 - ( p.x0 + p.x1 ) / 2;

	let dy;
	if ( 'under' === pos ) {
		dy = Math.min( b.y0, 0 ) - gap - p.y1;
		// A mark drawn generously can reach past the descender, and
		// anything below it is what neighbouring lines collide with.
		const floor = metrics.descender ?? -em * 0.2;
		const bottom = p.y0 + dy;
		if ( bottom < floor ) {
			dy += floor - bottom;
		}
	} else {
		dy = b.y1 + gap - p.y0;
		// Keep the accent inside the ascender so lines never collide.
		const top = p.y1 + dy;
		const ceiling = metrics.ascender || em * 0.8;
		if ( top > ceiling ) {
			dy -= top - ceiling;
		}
	}
	return base.concat( translateContours( placed, dx, dy ) );
}

/**
 * The mark placement used for the drawing surface's preview, so what
 * the user sees while drawing an accent matches what they will get.
 *
 * @param {Object} baseBounds Bounds of the base letter, or null.
 * @param {Object} markBounds Bounds of the accent.
 * @param {string} pos        `over` or `under`.
 * @param {Object} metrics    Font metrics.
 * @return {Object} `{ dx, dy, scale }`.
 */
export function markPlacement( baseBounds, markBounds, pos, metrics ) {
	if ( ! baseBounds || ! markBounds ) {
		return { dx: 0, dy: 0, scale: 1 };
	}
	const em = metrics.unitsPerEm || 1000;
	const gap = em * GAP;
	const isCap = baseBounds.y1 >= ( metrics.capHeight || 700 ) * 0.9;
	const scale = isCap ? CAP_SCALE : 1;
	const w = ( markBounds.x1 - markBounds.x0 ) * scale;
	const h = ( markBounds.y1 - markBounds.y0 ) * scale;
	const cx = ( baseBounds.x0 + baseBounds.x1 ) / 2;
	const dx = cx - w / 2 - markBounds.x0;
	const dy =
		'under' === pos
			? Math.min( baseBounds.y0, 0 ) - gap - h - markBounds.y0
			: baseBounds.y1 + gap - markBounds.y0;
	return { dx, dy, scale };
}
