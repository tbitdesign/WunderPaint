/**
 * Display metadata for the extensions manager: the categories (the same
 * names and order as the Extensions menu, from lib/extension-menu.js) and
 * the labels for provided extension points. An unknown category falls
 * back to "Other" so new manifest values never leave a card without a
 * home.
 */
import { __ } from '@wordpress/i18n';

export { CATEGORIES, categoryLabel } from '../../lib/extension-menu';

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
