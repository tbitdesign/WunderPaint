/**
 * Select by Description (20.10.2026): type "the red car" and get it as a
 * selection, locally. Florence-2 (Local alt text model) finds the phrase as
 * boxes, SlimSAM (Smart Select model) cuts each box out. No new download:
 * both models are the ones those features already use.
 *
 * SlimSAM's exported decoder takes points only, no boxes, so a box becomes
 * one positive point in its middle and negative points just outside its four
 * sides, and the mask is then clipped to the box grown by a margin, so a
 * mask that spills into the background cannot run away. Several boxes ("the
 * two dogs") are joined.
 *
 * Limit, measured on a group photo: grounding names ONE region for "human
 * face" even with 29 faces, so this suits one object or a few, not crowds.
 *
 * 21.10.2026 (Thomas: "waehlt nur einen Bruchteil des Subjects aus"): SAM
 * answers the one point with three masks - a part, a larger part, the whole
 * object - and the highest score was often the part under the point. Now
 * the mask whose outline fits the found box best is taken. And when the box
 * is the picture's main subject and BiRefNet is there, its mask (the one
 * Select Subject uses, with the finer edges) is taken inside the box.
 */

import { __, sprintf } from '@wordpress/i18n';

import { isModelInstalled } from './ml';

/** Boxes taken from one description; grounding rarely returns more. */
export const MAX_BOXES = 4;
const MARGIN = 0.06;
/** A box this close to the main subject's outline IS the subject. */
export const SUBJECT_FIT = 0.75;
/** Masks scored below this share of the best one are not considered. */
const SCORE_FLOOR = 0.5;

/**
 * How well a rectangle fits a box: intersection over union, 0..1.
 *
 * @param {{x:number,y:number,w:number,h:number}|null} r   Rectangle.
 * @param {Object}                                    box { x1, y1, x2, y2 }.
 * @return {number} Fit.
 */
export function boxFit( r, box ) {
	if ( ! r ) {
		return 0;
	}
	const ix = Math.max(
			0,
			Math.min( r.x + r.w, box.x2 ) - Math.max( r.x, box.x1 )
		),
		iy = Math.max(
			0,
			Math.min( r.y + r.h, box.y2 ) - Math.max( r.y, box.y1 )
		);
	const inter = ix * iy,
		union = r.w * r.h + ( box.x2 - box.x1 ) * ( box.y2 - box.y1 ) - inter;
	return union > 0 ? inter / union : 0;
}

/**
 * Of SAM's masks for one box, the one whose outline fits the box best
 * (each clipped to the box first); a tie goes to the higher score.
 *
 * @param {Array}  masks [{ data, w, h, score }] (data changed in place).
 * @param {number} w     Picture width.
 * @param {number} h     Picture height.
 * @param {Object} box   { x1, y1, x2, y2 }.
 * @return {Uint8Array|null} The chosen mask.
 */
export function pickMask( masks, w, h, box ) {
	const usable = masks.filter( ( m ) => m && m.w === w && m.h === h );
	if ( ! usable.length ) {
		return null;
	}
	const top = Math.max( ...usable.map( ( m ) => m.score || 0 ) );
	let best = null,
		bestFit = -1,
		bestScore = -Infinity;
	for ( const m of usable ) {
		if ( ( m.score || 0 ) < top * SCORE_FLOOR ) {
			continue;
		}
		clipMaskToBox( m.data, w, h, box );
		const fit = boxFit( maskBounds( m.data, w, h ), box );
		if (
			fit > bestFit + 1e-6 ||
			( Math.abs( fit - bestFit ) <= 1e-6 &&
				( m.score || 0 ) > bestScore )
		) {
			best = m.data;
			bestFit = fit;
			bestScore = m.score || 0;
		}
	}
	return best;
}

/**
 * Point prompts for SlimSAM from a box: positive in the middle, negative a
 * little outside each side (where that is still inside the picture).
 *
 * @param {Object} box { x1, y1, x2, y2 } in pixels.
 * @param {number} w   Picture width.
 * @param {number} h   Picture height.
 * @return {Array<{x:number,y:number,label:number}>} Points as 0..1 fractions.
 */
export function boxPrompts( box, w, h ) {
	const cx = ( box.x1 + box.x2 ) / 2,
		cy = ( box.y1 + box.y2 ) / 2;
	const dx = ( box.x2 - box.x1 ) * MARGIN + 2,
		dy = ( box.y2 - box.y1 ) * MARGIN + 2;
	const points = [ { x: cx / w, y: cy / h, label: 1 } ];
	const outside = [
		[ box.x1 - dx, cy ],
		[ box.x2 + dx, cy ],
		[ cx, box.y1 - dy ],
		[ cx, box.y2 + dy ],
	];
	for ( const [ x, y ] of outside ) {
		if ( x >= 0 && x < w && y >= 0 && y < h ) {
			points.push( { x: x / w, y: y / h, label: 0 } );
		}
	}
	return points;
}

/**
 * Keep only the part of a mask inside the box grown by the margin.
 *
 * @param {Uint8Array} mask 1 = selected, w * h (changed in place).
 * @param {number}     w    Width.
 * @param {number}     h    Height.
 * @param {Object}     box  { x1, y1, x2, y2 }.
 * @return {Uint8Array} The same mask.
 */
export function clipMaskToBox( mask, w, h, box ) {
	const mx = ( box.x2 - box.x1 ) * MARGIN,
		my = ( box.y2 - box.y1 ) * MARGIN;
	const x1 = Math.max( 0, Math.floor( box.x1 - mx ) ),
		y1 = Math.max( 0, Math.floor( box.y1 - my ) ),
		x2 = Math.min( w, Math.ceil( box.x2 + mx ) ),
		y2 = Math.min( h, Math.ceil( box.y2 + my ) );
	for ( let y = 0; y < h; y++ ) {
		const inRow = y >= y1 && y < y2;
		for ( let x = 0; x < w; x++ ) {
			if ( ! inRow || x < x1 || x >= x2 ) {
				mask[ y * w + x ] = 0;
			}
		}
	}
	return mask;
}

/**
 * Bounding box of a mask, or null when it is empty.
 *
 * @param {Uint8Array} mask 1 = selected.
 * @param {number}     w    Width.
 * @param {number}     h    Height.
 * @return {{x:number,y:number,w:number,h:number}|null} Bounds.
 */
export function maskBounds( mask, w, h ) {
	let minX = w,
		minY = h,
		maxX = -1,
		maxY = -1;
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( mask[ y * w + x ] ) {
				if ( x < minX ) {
					minX = x;
				}
				if ( x > maxX ) {
					maxX = x;
				}
				if ( y < minY ) {
					minY = y;
				}
				if ( y > maxY ) {
					maxY = y;
				}
			}
		}
	}
	return maxX < 0
		? null
		: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** Which of the two models are missing, as a sentence, or ''. */
export function missingModelsMessage() {
	const caption = isModelInstalled( 'caption' );
	const smart = isModelInstalled( 'smart-select' );
	if ( caption && smart ) {
		return '';
	}
	const names = [
		caption ? null : __( 'Local alt text (Florence-2)', 'wunderpaint' ),
		smart ? null : __( 'Smart Select (SlimSAM)', 'wunderpaint' ),
	].filter( Boolean );
	return sprintf(
		/* translators: %s: model name(s). */
		__(
			'Select by Description needs these local models: %s. Download them under Settings, WunderPaint, AI Models.',
			'wunderpaint'
		),
		names.join( ', ' )
	);
}

/**
 * Find a described object in a picture and return its mask.
 *
 * @param {string}   dataUrl  The picture.
 * @param {number}   w        Its width.
 * @param {number}   h        Its height.
 * @param {string}   phrase   What to select.
 * @param {Object}   deps     { groundPhrase, createSegmenter, subject? }
 *                            (the caption and smart-select modules, passed
 *                            in so this stays testable; subject() gives the
 *                            main subject's mask, w * h, or null).
 * @return {Promise<Uint8Array|null>} 1 = selected, w * h; null if nothing.
 */
export async function findDescribed( dataUrl, w, h, phrase, deps ) {
	const boxes = ( await deps.groundPhrase( dataUrl, phrase ) )
		.filter( ( b ) => b.x2 - b.x1 >= 2 && b.y2 - b.y1 >= 2 )
		.slice( 0, MAX_BOXES );
	if ( ! boxes.length ) {
		return null;
	}
	// The main subject, asked for once and only when it can be had.
	let subject;
	const mainSubject = async () => {
		if ( undefined === subject ) {
			subject = null;
			if ( deps.subject ) {
				try {
					const m = await deps.subject();
					if ( m && m.length === w * h ) {
						subject = { mask: m, bounds: maskBounds( m, w, h ) };
					}
				} catch ( e ) {
					// No subject model here: SAM alone.
				}
			}
		}
		return subject;
	};
	let segmenter = null;
	const union = new Uint8Array( w * h );
	for ( const box of boxes ) {
		let chosen = null;
		const main = await mainSubject();
		if ( main && boxFit( main.bounds, box ) >= SUBJECT_FIT ) {
			chosen = clipMaskToBox( main.mask.slice(), w, h, box );
		} else {
			segmenter = segmenter || ( await deps.createSegmenter( dataUrl ) );
			const prompts = boxPrompts( box, w, h );
			const masks = segmenter.segmentAll
				? await segmenter.segmentAll( prompts )
				: [ await segmenter.segment( prompts ) ];
			chosen = pickMask( masks, w, h, box );
		}
		if ( ! chosen ) {
			continue;
		}
		for ( let i = 0; i < union.length; i++ ) {
			if ( chosen[ i ] ) {
				union[ i ] = 1;
			}
		}
	}
	return maskBounds( union, w, h ) ? union : null;
}
