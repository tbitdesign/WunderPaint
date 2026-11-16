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
import { COLLAGE_GENERATOR_ID } from './collage';
import { BEAUTIFY_GENERATOR_ID } from './beautify';

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
	// Collage & Photo Grid (19.10.2026): the inserted group keeps its
	// recipe, so "Edit Collage & Photo Grid" reopens it - another layout,
	// other gaps - and replaces it in place.
	registerBuiltinGenerator( {
		id: COLLAGE_GENERATOR_ID,
		label: __( 'Collage & Photo Grid', 'wunderpaint' ),
		run: ( { extras } ) => extras?.openCollage?.(),
		edit: ( { extras, layer } ) => extras?.openCollage?.( layer.id ),
	} );
	// Screenshot Beautifier (20.10.2026): the "Screenshot" group keeps its
	// recipe; Edit reopens the dialog on the shot inside it and replaces
	// the frame and its backdrop in place.
	registerBuiltinGenerator( {
		id: BEAUTIFY_GENERATOR_ID,
		label: __( 'Screenshot Beautifier', 'wunderpaint' ),
		run: ( { extras } ) => extras?.openBeautify?.(),
		edit: ( { extras, layer } ) => extras?.openBeautify?.( layer.id ),
	} );
}
