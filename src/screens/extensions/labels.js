/**
 * Display metadata for the extensions manager: catalog categories in
 * their fixed order and the labels for provided extension points. An
 * unknown category falls back to "Other" so new manifest values never
 * leave the sidebar or a card without a home.
 */
import { __ } from '@wordpress/i18n';

export const CATEGORIES = [
	{ key: '3d', label: __( '3D', 'wunderpaint' ), icon: 'shape' },
	{ key: 'art', label: __( 'Art', 'wunderpaint' ), icon: 'palette' },
	{ key: 'print', label: __( 'Print', 'wunderpaint' ), icon: 'stamp' },
	{ key: 'tools', label: __( 'Tools', 'wunderpaint' ), icon: 'sliders' },
	{ key: 'motion', label: __( 'Motion', 'wunderpaint' ), icon: 'fx' },
	{
		key: 'marketing',
		label: __( 'Marketing', 'wunderpaint' ),
		icon: 'sparkles',
	},
	{ key: 'data', label: __( 'Data', 'wunderpaint' ), icon: 'list' },
	{ key: 'other', label: __( 'Other', 'wunderpaint' ), icon: 'puzzle' },
];

/**
 * The display label for a category key; unknown keys read as "Other".
 *
 * @param {string} key Category key from a card.
 * @return {string} Translated label.
 */
export function categoryLabel( key ) {
	const hit = CATEGORIES.find( ( c ) => c.key === key );
	return ( hit || CATEGORIES[ CATEGORIES.length - 1 ] ).label;
}

export const POINT_LABELS = {
	effect: __( 'Effects', 'wunderpaint' ),
	filterpreset: __( 'Filter presets', 'wunderpaint' ),
	menuitem: __( 'Menu items', 'wunderpaint' ),
	panel: __( 'Panels', 'wunderpaint' ),
	panelsection: __( 'Panel sections', 'wunderpaint' ),
	tool: __( 'Tools', 'wunderpaint' ),
	exportformat: __( 'Export formats', 'wunderpaint' ),
	generator: __( 'Generators', 'wunderpaint' ),
	librarysection: __( 'Library sections', 'wunderpaint' ),
	templatepack: __( 'Template packs', 'wunderpaint' ),
	aitool: __( 'AI tools', 'wunderpaint' ),
};
