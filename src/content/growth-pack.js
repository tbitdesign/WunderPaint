/**
 * Growth Pack (v1.300): 500 marketing starter templates in five
 * WordPress-focused gallery categories, bundled with the FREE plugin.
 * Born as the wpie-growth-pack extension, now core - and the extension
 * folder went with it on 2026-08-01, after three audits in a row rescued
 * a copy nothing loaded. There is exactly one Growth Pack, and it is
 * here: the descriptors ship
 * pre-compressed under assets/content/ (fetchPack inflates ~17:1) and
 * register through the same template-pack registry extensions use, so
 * the tray, the Asset Library modal and search need no special casing.
 * The loader is lazy - the 3 MB of JSON only ever download when a
 * gallery surface actually lists templates.
 */

import { __ } from '@wordpress/i18n';

import { registerBuiltinTemplatePack } from '../lib/extensions';
import { fetchPack } from '../lib/fetch-pack';

let registered = false;

/** Register the pack once (idempotent, called at editor boot). */
export function registerGrowthPack() {
	if ( registered ) {
		return;
	}
	registered = true;
	registerBuiltinTemplatePack( {
		id: 'wpie-core/growth',
		label: __( 'Growth Pack', 'wunderpaint' ),
		categories: [
			{
				id: 'email',
				label: __( 'Email & Newsletter', 'wunderpaint' ),
			},
			{ id: 'popup', label: __( 'Popups & Optins', 'wunderpaint' ) },
			{ id: 'course', label: __( 'Online Courses', 'wunderpaint' ) },
			{
				id: 'social',
				label: __( 'Social & Pinterest', 'wunderpaint' ),
			},
			{
				id: 'store',
				label: __( 'WooCommerce Store', 'wunderpaint' ),
			},
		],
		templates: () => fetchPack( 'growth-pack' ),
	} );
}
