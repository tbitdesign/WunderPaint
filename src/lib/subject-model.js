/**
 * Better cutouts with BiRefNet (20.10.2026).
 *
 * U2-Netp, bundled and fast, often misjudges what the subject is: on test
 * photos it kept only the hair of a woman, left a bird half transparent and
 * dropped a hand. BiRefNet lite finds the whole subject. The published model
 * wants 1024 px and about 6 GB there, more than a browser can give, so the
 * plugin uses its own export at 512 px (tools/export-birefnet.py): about
 * 6 s and 1.7 GB on one browser thread. An administrator downloads it once
 * (Settings, Local AI Models, "Better cutouts").
 *
 * At 512 px it can miss a subject altogether in a busy scene (a white dog
 * between people's legs came back empty), where U2-Netp still finds it. A
 * map with almost nothing in it therefore falls back to U2-Netp. Its mask is
 * used as it comes: the guided-filter refinement that helps U2-Netp's
 * 320 px grid punched holes into a beard and lost loose hair on this one.
 *
 * Kept free of browser globals: the worker imports it too.
 */

/** The model file below the models folder (class-ml-models.php 'cutout'). */
export const CUTOUT_MODEL =
	'tbitdesign/birefnet-lite-512/birefnet-lite-512.onnx';

/** The export's fixed input size. */
export const CUTOUT_SIZE = 512;

/**
 * Below this many subject pixels in the 512 map the model counts as having
 * found nothing (the empty answers measured were exactly zero).
 */
export const MIN_SUBJECT_PIXELS = 64;

const MEAN = [ 0.485, 0.456, 0.406 ];
const STD = [ 0.229, 0.224, 0.225 ];

/**
 * The model's input from RGBA pixels: planar RGB, ImageNet normalised.
 *
 * @param {Uint8ClampedArray} rgba Pixels, size * size * 4.
 * @param {number}            size Side.
 * @return {Float32Array} 3 * size * size.
 */
export function cutoutInput( rgba, size = CUTOUT_SIZE ) {
	const n = size * size;
	const out = new Float32Array( 3 * n );
	for ( let i = 0; i < n; i++ ) {
		for ( let c = 0; c < 3; c++ ) {
			out[ c * n + i ] =
				( rgba[ i * 4 + c ] / 255 - MEAN[ c ] ) / STD[ c ];
		}
	}
	return out;
}

/**
 * From this certainty on the most certain place of a U2-Netp answer counts
 * as a subject (ml.subjectMap: `top`).
 */
export const SUBJECT_FOUND = 0.5;

/**
 * A U2-Netp answer for a caller outside the editor (ml.subjectMap and
 * ml.subjectWatch, API 2.26): one byte a place, rows from the top.
 *
 * The worker spreads its answer between the least and the most certain
 * place. That suits a photo, which has a subject. A studio that watches a
 * camera also looks at an empty room, and there the spread turns the least
 * unlikely corner into a full subject. So the spread is taken back where
 * the most certain place stayed below SUBJECT_FOUND: such a map stays dim,
 * and `top` says how certain the model was at its best.
 *
 * @param {Object}       raw       What the worker sends.
 * @param {Float32Array} raw.alpha Map, 0..1, already spread.
 * @param {number}       raw.size  Side of the map.
 * @param {number}       [raw.min] Least certain place before the spread.
 * @param {number}       [raw.max] Most certain place before the spread.
 * @return {{w: number, h: number, subject: Uint8Array, top: number}} Map.
 */
export function subjectAnswer( { alpha, size, min = 0, max = 1 } ) {
	const span = max - min;
	const k =
		span > 0
			? ( 255 * span ) / ( Math.max( max, SUBJECT_FOUND ) - min )
			: 0;
	const subject = new Uint8Array( alpha.length );
	for ( let i = 0; i < alpha.length; i++ ) {
		const v = Math.round( alpha[ i ] * k );
		subject[ i ] = v < 0 ? 0 : Math.min( 255, v );
	}
	return { w: size, h: size, subject, top: max };
}

/**
 * Whether a map holds a subject at all.
 *
 * @param {Float32Array} alpha Map, 0..1.
 * @param {number}       min   Pixels above one half that count as found.
 * @return {boolean} True when there is something to cut out.
 */
export function foundSubject( alpha, min = MIN_SUBJECT_PIXELS ) {
	let n = 0;
	for ( let i = 0; i < alpha.length; i++ ) {
		if ( alpha[ i ] > 0.5 && ++n >= min ) {
			return true;
		}
	}
	return false;
}
