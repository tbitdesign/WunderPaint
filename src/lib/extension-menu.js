/**
 * How installed extensions are presented (v1.433): the curated categories
 * with their names and the Extensions menu built from them (which the
 * title-bar search indexes as well). One module, so the menu, the extension
 * manager and the search can no longer call one category by different
 * names (until September 2026 the menu said "Art & Illustration", the
 * manager "Art" and the Themes panel "Art & Painting").
 *
 * The categories sort by what the user wants to make, and the menu shows
 * them in blocks under headings that name the intent (Create & Transform,
 * Build & Animate, Hang & Print, Explain & Promote), like the named groups
 * of every other main menu.
 */
import { __ } from '@wordpress/i18n';

import {
	extensionCategoryId,
	groupGenerators,
	menuItemCategoryId,
	menuItemPackage,
} from './extensions';

/**
 * The categories in menu order with their names and manager icons; the
 * keys are exactly EXTENSION_MENU_CATEGORIES. Pro's extension manager
 * keeps a copy under its own text domain (wunderpaint-pro
 * src/extensions/labels.js) - change both together.
 */
export const CATEGORIES = [
	{
		key: 'art',
		label: __( 'Art & Illustration', 'wunderpaint' ),
		icon: 'palette',
	},
	{
		key: 'photo',
		label: __( 'Photo & Effects', 'wunderpaint' ),
		icon: 'image',
	},
	{
		key: 'text',
		label: __( 'Text & Typography', 'wunderpaint' ),
		icon: 'text',
	},
	{ key: '3d', label: __( '3D & Scenes', 'wunderpaint' ), icon: 'shape' },
	{ key: 'motion', label: __( 'Motion & Video', 'wunderpaint' ), icon: 'fx' },
	{
		key: 'posters',
		label: __( 'Maps & Posters', 'wunderpaint' ),
		icon: 'moon',
	},
	{
		key: 'print',
		label: __( 'Print & Craft', 'wunderpaint' ),
		icon: 'stamp',
	},
	{
		key: 'data',
		label: __( 'Data & Diagrams', 'wunderpaint' ),
		icon: 'list',
	},
	{
		key: 'marketing',
		label: __( 'Marketing & Social', 'wunderpaint' ),
		icon: 'sparkles',
	},
	{ key: 'other', label: __( 'Other', 'wunderpaint' ), icon: 'puzzle' },
];

/**
 * Menu blocks, each under a heading that says what the user is about to do,
 * while the categories below name the result (Thomas, 27.09.2026: every
 * main menu has headings, so this one has them too). Together the blocks
 * list every category; Other has no heading and follows behind a plain
 * divider.
 */
export const CATEGORY_GROUPS = [
	{
		label: __( 'Create & Transform', 'wunderpaint' ),
		keys: [ 'art', 'photo', 'text' ],
	},
	{ label: __( 'Build & Animate', 'wunderpaint' ), keys: [ '3d', 'motion' ] },
	{
		label: __( 'Hang & Print', 'wunderpaint' ),
		keys: [ 'posters', 'print' ],
	},
	{
		label: __( 'Explain & Promote', 'wunderpaint' ),
		keys: [ 'data', 'marketing' ],
	},
	{ label: '', keys: [ 'other' ] },
];

/**
 * The display name of a category; unknown keys read as "Other".
 *
 * @param {string} key Category key.
 * @return {string} Translated name.
 */
export function categoryLabel( key ) {
	const id = extensionCategoryId( key );
	return CATEGORIES.find( ( c ) => c.key === id ).label;
}

/**
 * Every installed extension entry point with its category: one entry per
 * package (several generators become children) plus the loose items of
 * the Extensions menu. Core generators (wpie-core/*) have their own menu
 * homes and stay out.
 *
 * @param {Object} src
 * @param {Array}  src.generators Registered generators.
 * @param {Array}  src.menuItems  Items registered under 'extensions'.
 * @param {Array}  src.installed  window.WPIE.extensions descriptors.
 * @return {Array} [{ category, label, alias?, run?, when?, children? }]
 *                 `alias` is the manifest name, for the search, when a
 *                 package shows its menu label in another language.
 */
export function extensionEntries( {
	generators = [],
	menuItems = [],
	installed = [],
} ) {
	const groups = groupGenerators(
		generators.filter(
			( gen ) => ! String( gen.id ).startsWith( 'wpie-core/' )
		),
		installed
	);
	return [
		...groups.map( ( group ) =>
			1 === group.items.length
				? {
						category: group.category,
						label: group.items[ 0 ].label,
						alias: group.name,
						run: group.items[ 0 ].run,
				  }
				: {
						category: group.category,
						label: group.name,
						children: group.items.map( ( gen ) => ( {
							label: gen.label,
							run: gen.run,
						} ) ),
				  }
		),
		...menuItems.map( ( item ) => ( {
			category: menuItemCategoryId( item, installed ),
			label: item.label,
			alias: menuItemPackage( item, installed )?.name,
			run: item.run,
			when: item.when,
		} ) ),
	];
}

/**
 * The Extensions menu: one submenu per category that has entries, sorted
 * by name, under the heading of its block from CATEGORY_GROUPS. Blocks
 * without entries drop out together with their heading.
 *
 * @param {Array}  entries        From extensionEntries().
 * @param {Object} context
 * @param {Object} context.editor Editor handle, passed to run/when.
 * @param {Object} context.extras Editor extras, passed to run.
 * @return {Array} Menu items for the menubar.
 */
export function extensionMenuSections( entries, { editor, extras } ) {
	const bind = ( entry ) => ( {
		label: entry.label,
		...( entry.alias && entry.alias !== entry.label
			? { searchAlias: entry.alias }
			: {} ),
		...( entry.children
			? { children: entry.children.map( bind ) }
			: { run: () => entry.run( { editor, extras } ) } ),
		...( entry.when ? { when: () => entry.when( { editor } ) } : {} ),
	} );
	const byLabel = ( a, b ) => a.label.localeCompare( b.label );
	return CATEGORY_GROUPS.map( ( group ) => ( {
		head: group.label,
		submenus: group.keys
			.map( ( key ) => ( {
				label: categoryLabel( key ),
				children: entries
					.filter( ( entry ) => entry.category === key )
					.map( bind )
					.sort( byLabel ),
			} ) )
			.filter( ( submenu ) => submenu.children.length ),
	} ) )
		.filter( ( block ) => block.submenus.length )
		.flatMap( ( block, i ) => {
			if ( block.head ) {
				return [ { head: block.head }, ...block.submenus ];
			}
			return i
				? [ { divider: true }, ...block.submenus ]
				: block.submenus;
		} );
}
