/**
 * Core-owned generators (v1.256.0): built-in studios that use the same
 * generator registry as extensions, so their layers get the full
 * lifecycle for free - the context "Edit" affordance, macro replays and
 * the dynamic resolve pipeline (templates re-render the overlay at the
 * target document's size). Core ids live under the reserved
 * `wpie-core/` prefix; the Extensions launcher menu filters them out.
 */

import { __ } from '@wordpress/i18n';

import { registerBuiltinGenerator } from './extensions';
import { renderFilmOverlay } from './film-overlay';

let registered = false;

/** Register all core generators once (idempotent, called at editor boot). */
export function registerCoreGenerators() {
	if ( registered ) {
		return;
	}
	registered = true;
	registerBuiltinGenerator( {
		id: 'wpie-core/vignette',
		label: __( 'Vignette & Film', 'wunderpaint' ),
		run: ( { extras } ) => extras?.openVignette?.(),
		edit: ( { extras, layer } ) => extras?.openVignette?.( layer ),
		// Dynamic templates / magic resize: repaint the overlay at the
		// layer's current box, params are relative so the look holds.
		resolve: async ( { layer, params } ) => {
			const w = Math.max( 1, Math.round( layer.w || 1 ) );
			const h = Math.max( 1, Math.round( layer.h || 1 ) );
			const canvas = renderFilmOverlay( params, w, h );
			return {
				src: canvas.toDataURL( 'image/png' ),
				naturalW: w,
				naturalH: h,
			};
		},
	} );
}
