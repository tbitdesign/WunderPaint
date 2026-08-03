/**
 * Catalog of hideable main-UI regions for personal Workspaces (v1.184.0).
 *
 * Each entry is a stable `key` (also stamped as a `data-ws` attribute on the
 * matching DOM region), a human `label` and a `group` for the checklist. The
 * catalog is the single source of truth for the Workspace dialog; the
 * `data-ws` attributes are only how the hiding is applied.
 *
 * Scope is the editor CHROME only: toolbar tools, the core panels, their
 * sections and the top menus. Tool-option bars, extension panels and
 * extension tools are intentionally out of scope. The View menu is not
 * listed here on purpose, so it can never be hidden and always keeps the
 * Workspace entry and the show/hide toggles reachable.
 */

import { __ } from '@wordpress/i18n';

import { TOOLS } from '../store/constants';

export function workspaceCatalog() {
	const G_TOOLS = __( 'Toolbar tools', 'wunderpaint' );
	const G_PANELS = __( 'Panels', 'wunderpaint' );
	const G_MENUS = __( 'Menus', 'wunderpaint' );
	const G_ADJ = __( 'Adjust panel', 'wunderpaint' );
	const G_FX = __( 'Effects panel', 'wunderpaint' );
	const G_PROPS = __( 'Properties panel', 'wunderpaint' );
	const G_ADJSLI = __( 'Adjustment sliders', 'wunderpaint' );
	const G_MENULINKS = __( 'Menu links', 'wunderpaint' );

	const tools = TOOLS.map( ( t ) => ( {
		key: 'tool.' + t.id,
		label: t.label,
		group: G_TOOLS,
	} ) );
	tools.push( {
		key: 'tool.aigen',
		label: __( 'AI Generate', 'wunderpaint' ),
		group: G_TOOLS,
	} );
	tools.push( {
		key: 'tool.colors',
		label: __( 'Foreground / background', 'wunderpaint' ),
		group: G_TOOLS,
	} );

	const rows = ( group, pairs ) =>
		pairs.map( ( [ key, label ] ) => ( { key, label, group } ) );

	const panels = rows( G_PANELS, [
		[ 'panel.layers', __( 'Layers', 'wunderpaint' ) ],
		[ 'panel.props', __( 'Properties', 'wunderpaint' ) ],
		[ 'panel.adjust', __( 'Adjust', 'wunderpaint' ) ],
		[ 'panel.effects', __( 'Effects', 'wunderpaint' ) ],
		[ 'panel.history', __( 'History', 'wunderpaint' ) ],
		[ 'panel.ai', __( 'AI Studio', 'wunderpaint' ) ],
		[ 'panel.layers.foot', __( 'Layers panel footer', 'wunderpaint' ) ],
	] );

	const menus = rows( G_MENUS, [
		[ 'menu.file', __( 'File', 'wunderpaint' ) ],
		[ 'menu.edit', __( 'Edit', 'wunderpaint' ) ],
		[ 'menu.image', __( 'Image', 'wunderpaint' ) ],
		[ 'menu.layer', __( 'Layer', 'wunderpaint' ) ],
		[ 'menu.select', __( 'Select', 'wunderpaint' ) ],
		[ 'menu.filter', __( 'Filter', 'wunderpaint' ) ],
		[ 'menu.assets', __( 'Assets', 'wunderpaint' ) ],
		[ 'menu.automation', __( 'Automation', 'wunderpaint' ) ],
		[ 'menu.tools', __( 'Tools', 'wunderpaint' ) ],
		[ 'menu.help', __( 'Help', 'wunderpaint' ) ],
	] );

	const adjust = rows( G_ADJ, [
		[ 'adjust.adjustments', __( 'Adjustments', 'wunderpaint' ) ],
		[ 'adjust.color', __( 'Color', 'wunderpaint' ) ],
	] );

	const effects = rows( G_FX, [
		// effects.active is stamped by effects-panel.jsx and was missing
		// here. The picker overlay let you hide it, and workspace.load()
		// then pruned the unknown key away, so the setting silently came
		// back on the next reload. (2026-07-25 inventory)
		[ 'effects.active', __( 'Active effects', 'wunderpaint' ) ],
		[ 'effects.filters', __( 'Filters', 'wunderpaint' ) ],
		[ 'effects.effects', __( 'Effects', 'wunderpaint' ) ],
		[ 'effects.textfx', __( 'Text Effects', 'wunderpaint' ) ],
		[ 'effects.textstyles', __( 'Text Styles', 'wunderpaint' ) ],
		[ 'effects.warp', __( 'Warp', 'wunderpaint' ) ],
	] );

	const props = rows( G_PROPS, [
		[ 'props.transform', __( 'Transform', 'wunderpaint' ) ],
		[ 'props.dynamic', __( 'Dynamic content', 'wunderpaint' ) ],
		[ 'props.imagefit', __( 'Image Fit', 'wunderpaint' ) ],
		[ 'props.appearance', __( 'Appearance', 'wunderpaint' ) ],
		[ 'props.character', __( 'Character', 'wunderpaint' ) ],
		[ 'props.gradient', __( 'Gradient', 'wunderpaint' ) ],
		[ 'props.smart', __( 'Smart Object', 'wunderpaint' ) ],
		[ 'props.blending', __( 'Blending Options', 'wunderpaint' ) ],
		[ 'props.align', __( 'Align & Distribute', 'wunderpaint' ) ],
	] );

	const sliders = rows( G_ADJSLI, [
		[ 'adjust.slider.brightness', __( 'Brightness', 'wunderpaint' ) ],
		[ 'adjust.slider.contrast', __( 'Contrast', 'wunderpaint' ) ],
		[ 'adjust.slider.saturation', __( 'Saturation', 'wunderpaint' ) ],
		[ 'adjust.slider.hue', __( 'Hue', 'wunderpaint' ) ],
		[ 'adjust.slider.temp', __( 'Temperature', 'wunderpaint' ) ],
		[ 'adjust.slider.exposure', __( 'Exposure', 'wunderpaint' ) ],
		[ 'adjust.slider.vibrance', __( 'Vibrance', 'wunderpaint' ) ],
	] );

	// Curated main-menu links. Labels are composed from existing menu and
	// item translations, so hiding a link needs no new strings. Extendable:
	// add `ws: 'mi.<menu>.<slug>'` to a menu item and a row here.
	const ml = ( m, it ) => m + ': ' + it;
	const F = __( 'File', 'wunderpaint' );
	const E = __( 'Edit', 'wunderpaint' );
	const IM = __( 'Image', 'wunderpaint' );
	const V = __( 'View', 'wunderpaint' );
	const menuLinks = rows( G_MENULINKS, [
		[ 'mi.file.pattern', ml( F, __( 'Save as Pattern', 'wunderpaint' ) ) ],
		[ 'mi.file.asset', ml( F, __( 'Save as Asset', 'wunderpaint' ) ) ],
		[
			'mi.file.dyntemplate',
			ml( F, __( 'Save as Dynamic Template', 'wunderpaint' ) ),
		],
		[ 'mi.file.share', ml( F, __( 'Share Design Link', 'wunderpaint' ) ) ],
		[ 'mi.file.unshare', ml( F, __( 'Stop Sharing', 'wunderpaint' ) ) ],
		[ 'mi.file.project', ml( F, __( 'Project (.wpie)', 'wunderpaint' ) ) ],
		[
			'mi.file.importexport',
			ml( F, __( 'Import / Export', 'wunderpaint' ) ),
		],
		[
			'mi.edit.freetransform',
			ml( E, __( 'Free Transform', 'wunderpaint' ) ),
		],
		[ 'mi.edit.prefs', ml( E, __( 'Preferences', 'wunderpaint' ) ) ],
		[
			'mi.image.resizedesign',
			ml( IM, __( 'Resize Design', 'wunderpaint' ) ),
		],
		[ 'mi.image.colors', ml( IM, __( 'Colors', 'wunderpaint' ) ) ],
		[ 'mi.view.contrast', ml( V, __( 'Check Contrast', 'wunderpaint' ) ) ],
		[ 'mi.view.proof', ml( V, __( 'Proof Colors', 'wunderpaint' ) ) ],
	] );

	return [
		...tools,
		...panels,
		...menus,
		...adjust,
		...sliders,
		...effects,
		...props,
		...menuLinks,
	];
}

/** Set of every valid catalog key (used to prune unknown/stale keys). */
export function catalogKeySet() {
	return new Set( workspaceCatalog().map( ( e ) => e.key ) );
}

/** Catalog grouped into { group, items[] } in catalog order. */
export function workspaceGroups() {
	const out = [];
	const byGroup = new Map();
	workspaceCatalog().forEach( ( e ) => {
		if ( ! byGroup.has( e.group ) ) {
			const g = { group: e.group, items: [] };
			byGroup.set( e.group, g );
			out.push( g );
		}
		byGroup.get( e.group ).items.push( e );
	} );
	return out;
}
