/**
 * bridge.raster.effects (API 2.22): the editor's pixel effects, reachable
 * for studios.
 *
 * Every kernel works on a `{ data: Uint8ClampedArray, width, height }`
 * buffer (an ImageData does), in place, and returns it - the same code
 * the Filter menu, the live preview and the export rasterizer run. A
 * studio that wants a posterized, thresholded or halftoned copy of a
 * picture no longer rebuilds any of it: Chaos Art cuts its motif into
 * pieces and treats them with these before the painters place them.
 *
 * Additive, like every bridge member: names are never renamed or removed.
 */

import {
	gaussianBlur,
	boxBlur,
	sharpen,
	unsharpMask,
	addNoise,
	pixelate,
	posterize,
	threshold,
	invert,
	gamma,
	duotone,
	vignette,
	tiltShift,
	colorSplash,
	halftone,
	glitch,
	glow,
	emboss,
	edgeDetect,
	lut3d,
	shadowsHighlights,
	denoise,
	autoLevels,
	autoContrast,
	autoColor,
} from './effects';
import { posterizeFlat } from './posterize';

/**
 * Run a list of effects in order: `[ [ 'posterize', { levels: 5 } ], [ 'halftone', { cell: 6 } ] ]`.
 * Unknown names are skipped, so a studio can ask for an effect a newer
 * core has and an older one lacks.
 *
 * @param {ImageData|Object} img   The buffer, changed in place.
 * @param {Array}            steps [ name, options ] pairs.
 * @return {ImageData|Object} The same buffer.
 */
export function runEffects( img, steps ) {
	for ( const step of steps || [] ) {
		const name = Array.isArray( step ) ? step[ 0 ] : step;
		const opts = Array.isArray( step ) ? step[ 1 ] : undefined;
		const fn = effectsKit[ name ];
		if ( 'function' === typeof fn && 'run' !== name && 'list' !== name ) {
			fn( img, opts );
		}
	}
	return img;
}

export const effectsKit = {
	gaussianBlur,
	boxBlur,
	sharpen,
	unsharpMask,
	addNoise,
	pixelate,
	posterize,
	threshold,
	invert,
	gamma,
	duotone,
	vignette,
	tiltShift,
	colorSplash,
	halftone,
	glitch,
	glow,
	emboss,
	edgeDetect,
	lut3d,
	shadowsHighlights,
	denoise,
	autoLevels,
	autoContrast,
	autoColor,
	// posterizeFlat: the flat-colour posterizer behind "Poster" (few
	// colours, clean regions), not the per-channel one above.
	posterizeFlat,
	run: runEffects,
	list: () =>
		Object.keys( effectsKit ).filter(
			( k ) => 'run' !== k && 'list' !== k
		),
};
