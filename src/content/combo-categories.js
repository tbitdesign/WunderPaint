/**
 * Text-combo categories (v1.54). Tiny standalone module so UI chrome can
 * import the category list WITHOUT pulling the (large, lazy-loaded) combos
 * chunk into the eager bundle — the v1.16 content-pack rule.
 */

import { __ } from '@wordpress/i18n';

export const COMBO_CATEGORIES = [
	{ id: 'buttons', label: __( 'Buttons & Badges', 'wunderpaint' ) },
	{ id: 'headlines', label: __( 'Headlines', 'wunderpaint' ) },
	// v1.286: generated lockups (two contrasting faces, one treatment).
	{ id: 'wordart', label: __( 'WordArt', 'wunderpaint' ) },
	{ id: 'lists', label: __( 'Lists', 'wunderpaint' ) },
	{ id: 'quotes', label: __( 'Quotes & Reviews', 'wunderpaint' ) },
	{ id: 'sales', label: __( 'Sales & Prices', 'wunderpaint' ) },
	{ id: 'events', label: __( 'Events & News', 'wunderpaint' ) },
	// v1.120: KPI callouts, comparisons and mini bar charts.
	{ id: 'stats', label: __( 'Stats & Numbers', 'wunderpaint' ) },
];
