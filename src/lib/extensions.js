/**
 * Public extension API (v0.4, expanded to 2.0 in v1.119). Extensions load
 * either as WordPress plugins (action `wpie_editor_assets`, dependency
 * `wpie-editor`) or as in-editor packages installed through the Extensions
 * manager, and register their features when the API is ready:
 *
 *     wp.hooks.addAction( 'wpie.ready', 'my-plugin', ( api ) => {
 *         api.registerEffect( { id: 'my-plugin/thing', … } );
 *     } );
 *
 * All ids must be namespaced `plugin/name` (like Gutenberg blocks). The
 * registries live here; consumers (effects, menubar, panels, toolbar,
 * export dialog, library tray, properties panel) read through the exported
 * getters. This module must not import other editor modules, it sits at
 * the bottom of the graph.
 */

import { doAction } from '@wordpress/hooks';

/**
 * Semver of the JS extension API. Bumped when registration points are
 * added (minor) or changed incompatibly (major). Extensions feature-detect
 * with `api.version` or simply `!! api.registerGenerator`.
 *
 * 2.6.0: dynamic-variable tokens - the generator `resolve` hook receives
 * `expandTokens( str )` / `hasTokens( str )` for `{{binding.id}}`
 * placeholders in text params, and the bridge adds
 * components.mountVarButton( node, { getValue, onChange, inputEl, kit } )
 * plus dynamicContent.{ expandTokens, hasTokens, bindingGroups }.
 * 2.6.1: `resolve` may return { hide: true } to drop the layer for this
 * post (the sale-badge pattern), instead of returning fresh pixels.
 * 2.7.0: the post context (`/posts/{id}/context`, the `ctx` a generator's
 * `resolve` receives) carries `images` – { featured, content: [], gallery:
 * [] } – inline images scanned from the post body plus the WooCommerce
 * product gallery, so multi-image generators (3D Gallery Studio)
 * re-render per post without extra requests.
 * 2.8.0: the bridge adds `iconsLib.loadTabler()` / `loadEmoji()` (additive),
 * lazy access to the editor's bundled icon and emoji libraries so extensions
 * can offer icon pickers without shipping their own copies.
 * 2.9.0: components.mountFontPicker - THE font selector as a mountable
 * component for framework-free extension packs.
 * 2.10.0 (v1.273.0): the reuse release. api.registerBinding (custom
 * {{plugin/name}} tokens); ai.complete (generic text/JSON completion);
 * bridge groups ui (dsm builders), storage (per-user KV), brand (kit
 * resolution), video (recordCanvas), util (seeded rng/easings/download),
 * colors (schemes/extraction/contrast), qr; raster.docBackdrop;
 * components.mountKitPicker/mountMediaPicker/mountIconPicker; FontPicker
 * `families` allow-list.
 * 2.11.0 (v1.276.0): group resolve - a GROUP layer's `resolve` may return
 * { group, layers }, a full re-composition with fresh children (counts
 * may change; the repeater case, e.g. Showcase Studio). The hook
 * additionally receives `children` (the group's current child layers),
 * and group generators with a resolve hook get a "Refresh …" entry in
 * the canvas and layers-panel context menus.
 * 2.16.0 (v1.396.0): `ml.depthMap( dataUrl )` - the local Depth Anything
 * V2 map as one grayscale channel ({ w, h, depth }, 0 far, 255 near).
 * The model has been in the editor since v1.27 for depth blur; a studio
 * that wants to slice a picture INTO its depth (Papercut Art) had no way
 * to reach it. Additive and optional: feature-detect and fall back.
 */
export const API_VERSION = '2.22.0';

const NS_RE = /^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/;

const registries = {
	effects: new Map(),
	menuItems: new Map(), // menuId → [{label, run, when}]
	panels: new Map(),
	tools: new Map(),
	exportFormats: new Map(),
	filterPresets: new Map(),
	generators: new Map(),
	librarySections: new Map(),
	panelSections: new Map(),
	templatePacks: new Map(),
	aiTools: new Map(),
	bindings: new Map(),
};

const listeners = new Set();
const notify = () => listeners.forEach( ( cb ) => cb() );

/* ----------------------------- lazy packages ---------------------------- */

/*
 * Packages used to load in full at boot, all of them, so their menu
 * entries could exist: forty-five bundles, four and a half megabytes,
 * for a menu (measured 2026-09-02). Now the registry keeps an INVENTORY
 * of what each package registered - kinds, generator ids and labels,
 * menu items - and the loader (lib/extension-loader.js) persists it per
 * package version and locale. On the next boot a package whose inventory
 * holds nothing but generators and menu items gets PLACEHOLDERS instead
 * of its script: same ids, same labels, and a `run` that loads the bundle
 * first and then hands over to the real registration. Anything else a
 * package registers (an effect, a panel, a library section ...) shows in
 * core surfaces and has no placeholder, so such a package stays eager.
 *
 * A registration is attributed to its package through document.currentScript
 * (bundles register synchronously while their script runs), falling back
 * to the id's namespace. Core studios (wpie-core/...) and dev-registered
 * generators have no package and are simply not persisted.
 */
const PACKAGE_URL_RE = /\/(?:wpie-|bundled-)?extensions\/([a-z0-9_-]+)\//;

const currentPackageSlug = () => {
	const src =
		'undefined' !== typeof document &&
		document.currentScript &&
		document.currentScript.src;
	const m = src ? PACKAGE_URL_RE.exec( src ) : null;
	return m ? m[ 1 ] : null;
};

const inventory = new Map(); // slug → { kinds: Set, generators: Map, menuItems: [] }
const placeholderSlugs = new Set();
let inventoryWatcher = null;

/** The loader listens here: ( slug, snapshot ) after every registration. */
export function watchInventory( fn ) {
	inventoryWatcher = 'function' === typeof fn ? fn : null;
}

/** A plain, serialisable copy of one package's inventory, or null. */
export function snapshotInventory( slug ) {
	const inv = inventory.get( slug );
	if ( ! inv ) {
		return null;
	}
	return {
		kinds: Array.from( inv.kinds ),
		generators: Array.from( inv.generators.values() ),
		menuItems: inv.menuItems.slice(),
	};
}

function noteRegistration( kind, id, entry ) {
	const slug =
		currentPackageSlug() || ( id ? String( id ).split( '/' )[ 0 ] : null );
	if ( ! slug ) {
		return;
	}
	// The real thing arrived: its placeholders step aside first, so a
	// stale cache can never leave a ghost entry next to the live one.
	if ( placeholderSlugs.has( slug ) ) {
		retirePlaceholders( slug );
	}
	let inv = inventory.get( slug );
	if ( ! inv ) {
		inv = { kinds: new Set(), generators: new Map(), menuItems: [] };
		inventory.set( slug, inv );
	}
	inv.kinds.add( kind );
	if ( 'generator' === kind ) {
		inv.generators.set( id, entry );
	} else if ( 'menuItem' === kind ) {
		inv.menuItems.push( entry );
	}
	if ( inventoryWatcher ) {
		inventoryWatcher( slug, snapshotInventory( slug ) );
	}
}

/**
 * Stand-ins for a package that is not loaded: generators and menu items
 * with the cached ids and labels, whose callbacks load the bundle and then
 * call the real registration. Entries that already exist are left alone.
 *
 * @param {string}   slug     Package slug.
 * @param {Object}   snap     Inventory snapshot ({ generators, menuItems }).
 * @param {Function} load     () → Promise, resolved once the bundle ran.
 */
export function installPlaceholders( slug, snap, load ) {
	const real = ( id ) => {
		const g = registries.generators.get( id );
		return g && ! g.lazy ? g : null;
	};
	for ( const g of ( snap && snap.generators ) || [] ) {
		if ( ! g || ! g.id || registries.generators.has( g.id ) ) {
			continue;
		}
		const ph = {
			id: g.id,
			label: g.label,
			lazy: slug,
			run: ( args ) =>
				load().then( () => {
					const r = real( g.id );
					return r ? r.run( args ) : undefined;
				} ),
		};
		if ( g.edit ) {
			ph.edit = ( args ) =>
				load().then( () => {
					const r = real( g.id );
					return r ? ( r.edit || r.run )( args ) : undefined;
				} );
		}
		if ( g.resolve ) {
			// Returning null keeps the stored layers as they are, which is
			// what a missing generator does in generator-resolve.js.
			ph.resolve = async ( args ) => {
				await load();
				const r = real( g.id );
				return r && r.resolve ? r.resolve( args ) : null;
			};
		}
		registries.generators.set( g.id, ph );
		placeholderSlugs.add( slug );
	}
	for ( const m of ( snap && snap.menuItems ) || [] ) {
		if ( ! m || ! m.menuId || ! m.label ) {
			continue;
		}
		const list = registries.menuItems.get( m.menuId ) || [];
		if (
			list.some(
				( i ) =>
					i.label === m.label && ( i.id || '' ) === ( m.id || '' )
			)
		) {
			continue;
		}
		list.push( {
			...( m.id ? { id: m.id } : {} ),
			...( m.category ? { category: m.category } : {} ),
			label: m.label,
			lazy: slug,
			run: ( args ) =>
				load().then( () => {
					const r = (
						registries.menuItems.get( m.menuId ) || []
					).find(
						( i ) =>
							! i.lazy &&
							i.label === m.label &&
							( i.id || '' ) === ( m.id || '' )
					);
					return r ? r.run( args ) : undefined;
				} ),
		} );
		registries.menuItems.set( m.menuId, list );
		placeholderSlugs.add( slug );
	}
	notify();
}

/** Drop every placeholder of one package (the real entries stay). */
export function retirePlaceholders( slug ) {
	if ( ! placeholderSlugs.has( slug ) ) {
		return;
	}
	placeholderSlugs.delete( slug );
	for ( const [ id, g ] of Array.from( registries.generators ) ) {
		if ( g.lazy === slug ) {
			registries.generators.delete( id );
		}
	}
	for ( const [ menuId, list ] of Array.from( registries.menuItems ) ) {
		registries.menuItems.set(
			menuId,
			list.filter( ( i ) => i.lazy !== slug )
		);
	}
	notify();
}

/** True while a package is represented by placeholders. */
export const hasPlaceholders = ( slug ) => placeholderSlugs.has( slug );

/**
 * Subscribe to registry changes (UI refresh).
 *
 * @param {Function} cb Change callback.
 * @return {Function} Unsubscribe.
 */
export function subscribeExtensions( cb ) {
	listeners.add( cb );
	return () => listeners.delete( cb );
}

const assertId = ( id, what ) => {
	if ( ! NS_RE.test( String( id || '' ) ) ) {
		throw new Error(
			`WPIE ${ what }: id must be namespaced like "my-plugin/name", got "${ id }"`
		);
	}
};

/**
 * Whether this editor satisfies a package's `requiresApi` (v1.273.1).
 * Empty means "any"; malformed values compare falsy and block, which is
 * the safe direction. A differing MAJOR blocks too (v1.335) - see below.
 *
 * @param {string} requires Required API semver from a manifest.
 * @return {boolean} Satisfied.
 */
export function apiSatisfies( requires ) {
	const want = String( requires || '' ).trim();
	if ( '' === want ) {
		return true;
	}
	const parse = ( v ) => v.split( '.' ).map( ( n ) => parseInt( n, 10 ) );
	const a = parse( API_VERSION );
	const b = parse( want );
	if ( b.some( ( n ) => Number.isNaN( n ) ) || ! b.length ) {
		return false;
	}
	// Major gate (v1.335): a package written against 2.x expects 2.x members.
	// Plain ">=" let a 3.0.0 editor load every 2.x pack and break it at
	// runtime, which meant a breaking change could never actually be shipped.
	// A differing major now blocks up front and surfaces as `apiBlocked` in
	// the Extensions manager, the same way a too-new requirement does.
	// Mirrored in Extensions::api_satisfied() (PHP).
	if ( ( a[ 0 ] || 0 ) !== ( b[ 0 ] || 0 ) ) {
		return false;
	}
	for ( let i = 0; i < 3; i++ ) {
		const x = a[ i ] || 0;
		const y = b[ i ] || 0;
		if ( x !== y ) {
			return x > y;
		}
	}
	return true;
}

/* ------------------------------ error sandbox --------------------------- */

// One broken extension must never take the editor (or a batch run) down
// (v1.273.1): every callback an extension registers is wrapped so a throw
// or a rejected promise lands in the issue log (Extensions manager)
// instead of crashing the caller. `fallback` is what the caller receives
// then; the RETHROW sentinel keeps hooks whose callers own the error UI
// (AI tools, export encoders) behaving exactly as before.
const RETHROW = Symbol( 'wpie-rethrow' );

function guard( source, fn, fallback, what ) {
	if ( 'function' !== typeof fn ) {
		return fn;
	}
	return function ( ...args ) {
		const fail = ( err ) => {
			recordExtensionIssue(
				String( source ).split( '/' )[ 0 ],
				what + ': ' + ( ( err && err.message ) || err )
			);
			if ( RETHROW === fallback ) {
				throw err;
			}
			return 'function' === typeof fallback ? fallback( args ) : fallback;
		};
		try {
			const out = fn.apply( this, args );
			return out && 'function' === typeof out.then
				? out.then(
						( v ) => v,
						( err ) => fail( err )
				  )
				: out;
		} catch ( err ) {
			return fail( err );
		}
	};
}

/* ------------------------------- effects -------------------------------- */

/**
 * Register a pixel effect. It appears in the Filter menu, the Adjustments
 * panel and as a Smart Filter, and serializes into project JSON by id.
 *
 * @param {Object}   effect        Effect definition.
 * @param {string}   effect.id     Namespaced id (`plugin/name`).
 * @param {string}   effect.label  UI label.
 * @param {Function} effect.apply  (imageData, params) → imageData, where
 *                                 imageData is {data, width, height}.
 * @param {Object}   [effect.params] Param schemas like the built-ins.
 */
function registerEffect( effect ) {
	noteRegistration( 'effect', effect && effect.id );
	assertId( effect?.id, 'registerEffect' );
	if ( 'function' !== typeof effect.apply ) {
		throw new Error( 'WPIE registerEffect: apply must be a function' );
	}
	registries.effects.set( effect.id, {
		params: {},
		...effect,
		// A throwing effect no-ops (returns its input) instead of killing
		// the render/export pipeline of every project that stored it.
		apply: guard(
			effect.id,
			effect.apply,
			( args ) => args[ 0 ],
			'effect apply'
		),
		external: true,
	} );
	notify();
}

export const getExtensionEffect = ( id ) =>
	registries.effects.get( id ) || null;
export const listExtensionEffects = () =>
	Array.from( registries.effects.values() );

/* ------------------------------ menu items ------------------------------ */

/**
 * Append an item to one of the built-in menus.
 *
 * @param {string}   menuId    file|edit|image|layer|select|filter|view|
 *                             tools|extensions|help, or an Automation
 *                             submenu: automation/content |
 *                             automation/images | automation/design |
 *                             automation/actions (v2.5).
 * @param {Object}   item      Item.
 * @param {string}   item.label UI label.
 * @param {Function} item.run  ( { editor, extras } ) invoked on click.
 * @param {Function} [item.when] ( { editor } ) → enabled.
 */
function registerMenuItem( menuId, item ) {
	if ( ! item?.label || 'function' !== typeof item.run ) {
		throw new Error( 'WPIE registerMenuItem: label and run are required' );
	}
	// `id` is optional and namespaced like every other id. It is what the
	// ?wpie-open= deeplink matches on, so an extension that only registers
	// a menu item can still be linked to directly.
	if ( item.id ) {
		assertId( item.id, 'registerMenuItem' );
	}
	noteRegistration( 'menuItem', item.id, {
		menuId,
		...( item.id ? { id: item.id } : {} ),
		...( item.category ? { category: item.category } : {} ),
		label: item.label,
	} );
	const list = registries.menuItems.get( menuId ) || [];
	list.push( {
		...item,
		run: guard( menuId, item.run, undefined, 'menu item' ),
	} );
	registries.menuItems.set( menuId, list );
	notify();
}

export const extensionMenuItems = ( menuId ) =>
	registries.menuItems.get( menuId ) || [];

/**
 * Every registered menu item, flattened, for lookups that do not know the
 * menu it lives under.
 *
 * The ?wpie-open= deeplink needs this: it advertises "extension slug or
 * generator id", but until 2026-07-25 it only searched the generators, so
 * an extension whose whole surface is a menu item could not be linked to
 * at all. The marketing pages link to every extension, so two of those
 * links opened the Create dialog instead of the studio.
 *
 * @return {Array} Items, each with the menuId it was registered under.
 */
export const listExtensionMenuItems = () => {
	const out = [];
	for ( const [ menuId, items ] of registries.menuItems ) {
		for ( const item of items ) {
			out.push( { ...item, menuId } );
		}
	}
	return out;
};

/* -------------------------------- panels -------------------------------- */

/**
 * Register a right-dock panel tab. `render` receives a plain DOM element
 * (framework-free) and the editor context; it may return a cleanup fn.
 *
 * @param {Object}   panel        Panel.
 * @param {string}   panel.id     Namespaced id.
 * @param {string}   panel.title  Tab label.
 * @param {Function} panel.render ( el, { editor, extras } ) → cleanup?.
 */
function registerPanel( panel ) {
	noteRegistration( 'panel', panel && panel.id );
	assertId( panel?.id, 'registerPanel' );
	if ( 'function' !== typeof panel.render ) {
		throw new Error( 'WPIE registerPanel: render must be a function' );
	}
	registries.panels.set( panel.id, panel );
	notify();
}

export const listExtensionPanels = () =>
	Array.from( registries.panels.values() );

/* --------------------------------- tools -------------------------------- */

let toolHandlerSink = null;

/**
 * Internal: tool-handlers.js hands us its TOOL_HANDLERS map so extension
 * tools dispatch exactly like built-ins (avoids an import cycle).
 *
 * @param {Object} map TOOL_HANDLERS.
 */
export function bindToolHandlerSink( map ) {
	toolHandlerSink = map;
	for ( const tool of registries.tools.values() ) {
		map[ tool.id ] = tool.handlers;
	}
}

/**
 * Register a canvas tool. Handlers receive the same tool context as the
 * built-in tools: ( tc, event, docPoint, screenPoint ).
 *
 * @param {Object} tool          Tool.
 * @param {string} tool.id       Namespaced id.
 * @param {string} tool.label    UI label (tooltip).
 * @param {string} [tool.icon]   Inline SVG string for the rail button.
 * @param {Object} tool.handlers { onDown?, onMove?, onUp? }.
 */
function registerTool( tool ) {
	noteRegistration( 'tool', tool && tool.id );
	assertId( tool?.id, 'registerTool' );
	if ( ! tool.handlers || 'object' !== typeof tool.handlers ) {
		throw new Error( 'WPIE registerTool: handlers object is required' );
	}
	registries.tools.set( tool.id, tool );
	if ( toolHandlerSink ) {
		toolHandlerSink[ tool.id ] = tool.handlers;
	}
	notify();
}

export const listExtensionTools = () => Array.from( registries.tools.values() );

/* ---------------------------- export formats ---------------------------- */

/**
 * Register an export format (shown in the Export dialog, export mode).
 *
 * @param {Object}   format        Format.
 * @param {string}   format.id     Namespaced id.
 * @param {string}   format.label  Button label (e.g. "TIFF").
 * @param {string}   format.ext    File extension without dot.
 * @param {Function} format.encode ( { doc, layers, render } ) → Promise<Blob>;
 *                                 `render` = (opts) => Promise<canvas>.
 */
function registerExportFormat( format ) {
	noteRegistration( 'exportFormat', format && format.id );
	if ( format && 'function' === typeof format.encode ) {
		format = {
			...format,
			encode: guard( format.id, format.encode, RETHROW, 'export format' ),
		};
	}
	assertId( format?.id, 'registerExportFormat' );
	if ( 'function' !== typeof format.encode || ! format.ext ) {
		throw new Error(
			'WPIE registerExportFormat: encode and ext are required'
		);
	}
	registries.exportFormats.set( format.id, format );
	notify();
}

export const listExtensionExportFormats = () =>
	Array.from( registries.exportFormats.values() );

/* ---------------------------- filter presets ---------------------------- */

/**
 * Register a one-click preset filter (CSS filter string, like the
 * built-in Filter strip entries).
 *
 * @param {Object} preset       Preset.
 * @param {string} preset.id    Namespaced id.
 * @param {string} preset.label UI label.
 * @param {string} preset.css   CSS filter() value.
 */
function registerFilterPreset( preset ) {
	noteRegistration( 'filterPreset', preset && preset.id );
	assertId( preset?.id, 'registerFilterPreset' );
	if ( ! preset.css || ! preset.label ) {
		throw new Error(
			'WPIE registerFilterPreset: label and css are required'
		);
	}
	registries.filterPresets.set( preset.id, preset );
	notify();
}

export const listExtensionFilterPresets = () =>
	Array.from( registries.filterPresets.values() );

/* ------------------------------ generators ------------------------------ */

/**
 * Register a design generator (v2.0). It appears in the top-level
 * Extensions menu, grouped per extension when a package registers several
 * (v2.5; up to 2.4 it landed under Automate → Design). Convention for
 * editable results: store
 * `layer.generator = { id, params }` on inserted layers — the layer then
 * gets an "Edit …" entry in the canvas and layers-panel context menus
 * which calls `edit` (falls back to `run` when `edit` is absent).
 *
 * The optional async `resolve` hook (v2.3) makes generator layers
 * dynamic: pipelines that resolve bindings against a post context call
 * `prepareGeneratorLayers` (lib/generator-resolve.js) first, which asks
 * `resolve` for context-specific pixels — so a mockup re-bakes with the
 * post's cover design. It receives `{ layer, params, ctx, depth,
 * renderTemplate }` (`renderTemplate( templateId )` returns the template
 * rendered against the same context) and returns `{ src, naturalW?,
 * naturalH? }`, or null to keep the design-time pixels.
 *
 * @param {Object}   gen           Generator definition.
 * @param {string}   gen.id        Namespaced id (`plugin/name`).
 * @param {string}   gen.label     Menu label.
 * @param {Function} gen.run       ( { editor, extras } ) — insert something new.
 * @param {Function} [gen.edit]    ( { editor, extras, layer } ) — reopen for a
 *                                 layer whose `layer.generator.id` matches.
 * @param {Function} [gen.resolve] Async per-post re-render (see above).
 */
function registerGenerator( gen ) {
	assertId( gen?.id, 'registerGenerator' );
	if ( ! gen.label || 'function' !== typeof gen.run ) {
		throw new Error( 'WPIE registerGenerator: label and run are required' );
	}
	noteRegistration( 'generator', gen.id, {
		id: gen.id,
		label: gen.label,
		edit: 'function' === typeof gen.edit,
		resolve: 'function' === typeof gen.resolve,
	} );
	registries.generators.set( gen.id, {
		...gen,
		run: guard( gen.id, gen.run, undefined, 'generator run' ),
		edit: guard( gen.id, gen.edit, undefined, 'generator edit' ),
		// A failing per-post resolve leaves the stored layers untouched
		// instead of killing the whole batch run.
		resolve: guard( gen.id, gen.resolve, undefined, 'generator resolve' ),
	} );
	notify();
}

export const listExtensionGenerators = () =>
	Array.from( registries.generators.values() );
export const getExtensionGenerator = ( id ) =>
	registries.generators.get( id ) || null;

/**
 * Registration entry for CORE-owned studios (v1.256.0, lib/core-generators):
 * they share the registry so their layers get the edit affordance and the
 * resolve pipeline, but live under the reserved `wpie-core/` prefix (the
 * Extensions launcher filters that). Extensions keep using the sandboxed
 * api.registerGenerator.
 */
export const registerBuiltinGenerator = registerGenerator;

/**
 * The curated extension-menu categories (v1.310). A fixed, host-owned
 * vocabulary - like every mature extension ecosystem - so fifty
 * extensions from twenty developers still sort into a handful of
 * translated groups instead of a typo zoo. Extensions pick one via
 * `"category"` in manifest.json (generator-based packages) or the
 * `category` field on registerMenuItem items; anything unknown lands
 * in Other. Ids are stable API, labels translate centrally.
 * Menu labels live in the menubar so they ride the normal i18n flow.
 */
export const EXTENSION_MENU_CATEGORIES = [
	'photo',
	'motion',
	'3d',
	'art',
	'data',
	'marketing',
	'print',
	'tools',
	'other',
];

const CATEGORY_SET = new Set( EXTENSION_MENU_CATEGORIES );

/** Validate a category id; unknown or empty falls back to 'other'. */
export const extensionCategoryId = ( value ) =>
	CATEGORY_SET.has( String( value || '' ) ) ? String( value ) : 'other';

/**
 * Group generators by their id namespace (the extension slug) for the
 * Extensions launcher menu (v2.5). The group name comes from the installed
 * package with that slug, else from the prettified prefix - covers
 * dev-registered generators from theme/plugin code.
 *
 * @param {Array} generators Registered generators.
 * @param {Array} installed  window.WPIE.extensions package descriptors.
 * @return {Array} [{slug, name, items}] in registration order.
 */
export function groupGenerators( generators, installed = [] ) {
	const groups = new Map();
	for ( const gen of generators || [] ) {
		const slug = String( gen.id ).split( '/' )[ 0 ];
		if ( ! groups.has( slug ) ) {
			const pkg = installed.find(
				( ext ) =>
					ext.slug === slug ||
					( ext.generatorPrefixes || [] ).includes( slug )
			);
			groups.set( slug, {
				slug,
				name:
					pkg?.name ||
					slug
						.replace( /^wpie-/, '' )
						.replace( /-/g, ' ' )
						.replace( /\b\w/g, ( c ) => c.toUpperCase() ),
				category: extensionCategoryId( pkg?.category ),
				items: [],
			} );
		}
		groups.get( slug ).items.push( gen );
	}
	return Array.from( groups.values() );
}

/* ---------------------------- library sections --------------------------- */

/**
 * Register a section (chip) in the Asset Library tray (v2.0) — the natural
 * home for asset packs. Items are either a static array or a function of
 * the search query (may return a Promise). Each item needs a `preview`
 * image URL (data: URLs work well for bundled SVG art) and either an
 * `asset` descriptor (inserted through the standard library pipeline, same
 * shapes as built-in assets: element/combo/icon/upload/…) or a custom
 * `use( { editor, extras } )` callback.
 *
 * @param {Object}         section       Section definition.
 * @param {string}         section.id    Namespaced id (`plugin/name`).
 * @param {string}         section.label Chip label.
 * @param {Array|Function} section.items Items or ( query ) → items|Promise.
 */
function registerLibrarySection( section ) {
	noteRegistration( 'librarySection', section && section.id );
	if ( section && 'function' === typeof section.items ) {
		section = {
			...section,
			items: guard( section.id, section.items, [], 'library items' ),
		};
	}
	assertId( section?.id, 'registerLibrarySection' );
	if (
		! section.label ||
		( 'function' !== typeof section.items &&
			! Array.isArray( section.items ) )
	) {
		throw new Error(
			'WPIE registerLibrarySection: label and items (array or function) are required'
		);
	}
	registries.librarySections.set( section.id, section );
	notify();
}

export const listExtensionLibrarySections = () =>
	Array.from( registries.librarySections.values() );
export const getExtensionLibrarySection = ( id ) =>
	registries.librarySections.get( id ) || null;

/* ----------------------------- panel sections ---------------------------- */

/**
 * Register a section in the Properties panel (v2.0). `when( layer )` gates
 * visibility per active layer; `render` receives a plain DOM element
 * (framework-free, like registerPanel) and re-runs when the active layer
 * changes. Return a cleanup function if you attach listeners.
 *
 * @param {Object}   section        Section definition.
 * @param {string}   section.id     Namespaced id (`plugin/name`).
 * @param {string}   section.title  Section title.
 * @param {Function} section.render ( el, { editor, extras, layer } ) → cleanup?.
 * @param {Function} [section.when] ( layer ) → visible (default: always).
 */
function registerPanelSection( section ) {
	noteRegistration( 'panelSection', section && section.id );
	assertId( section?.id, 'registerPanelSection' );
	if ( ! section.title || 'function' !== typeof section.render ) {
		throw new Error(
			'WPIE registerPanelSection: title and render are required'
		);
	}
	registries.panelSections.set( section.id, section );
	notify();
}

export const listExtensionPanelSections = () =>
	Array.from( registries.panelSections.values() );

/* ----------------------------- template packs ---------------------------- */

/**
 * Validate a starter-template descriptor (wpie-template@1 shape).
 *
 * @param {Object} t Descriptor.
 * @return {boolean} Valid.
 */
const isTemplateDescriptor = ( t ) =>
	!! (
		t &&
		t.name &&
		t.doc &&
		t.doc.w > 0 &&
		t.doc.h > 0 &&
		Array.isArray( t.layers )
	);

/**
 * Register a starter-template pack (v2.1). The templates join the
 * built-in Starter Templates in the tray, the Asset Library dialog
 * (grouped under the pack label) and the global search. Each template is
 * a plain `wpie-template@1` descriptor: `{ id?, name, doc: { w, h, bg },
 * layers: [...] }`, exactly what File → "Export for Library" produces.
 *
 * @param {Object}         pack           Pack definition.
 * @param {string}         pack.id        Namespaced id (`plugin/name`).
 * @param {string}         pack.label     Group label.
 * @param {Array|Function} pack.templates Descriptors, or () → descriptors
 *                                        (may return a Promise; lets a
 *                                        package fetch its bundled JSON).
 * @param {Array}          [pack.categories] Own gallery categories
 *                                        [{ id, label }] (v1.257.0);
 *                                        descriptors opt in via their
 *                                        `category` field - built-in ids
 *                                        (sale, event, …) work too.
 */
function registerTemplatePack( pack ) {
	noteRegistration( 'templatePack', pack && pack.id );
	if ( pack && 'function' === typeof pack.templates ) {
		pack = {
			...pack,
			templates: guard( pack.id, pack.templates, [], 'template pack' ),
		};
	}
	assertId( pack?.id, 'registerTemplatePack' );
	// Silent overwrite hid vendor mistakes (v1.273.2): same id twice is
	// a bug, two vendors cannot share an id thanks to the namespace.
	if ( registries.templatePacks.has( pack.id ) ) {
		throw new Error(
			`WPIE registerTemplatePack: "${ pack.id }" is already registered`
		);
	}
	if (
		! pack.label ||
		( 'function' !== typeof pack.templates &&
			! Array.isArray( pack.templates ) )
	) {
		throw new Error(
			'WPIE registerTemplatePack: label and templates (array or function) are required'
		);
	}
	if (
		Array.isArray( pack.templates ) &&
		! pack.templates.every( isTemplateDescriptor )
	) {
		throw new Error(
			'WPIE registerTemplatePack: every template needs name, doc {w,h} and layers[]'
		);
	}
	// Optional own gallery categories (v1.257.0): [{ id, label }] joins
	// the built-in chips; template descriptors reference them via their
	// `category` field.
	if ( pack.categories !== undefined ) {
		const ok =
			Array.isArray( pack.categories ) &&
			pack.categories.every(
				( c ) =>
					c &&
					'string' === typeof c.id &&
					/^[a-z0-9][a-z0-9-]{0,31}$/.test( c.id ) &&
					'string' === typeof c.label &&
					c.label
			);
		if ( ! ok ) {
			throw new Error(
				'WPIE registerTemplatePack: categories must be [{ id (kebab-case), label }]'
			);
		}
	}
	registries.templatePacks.set( pack.id, pack );
	notify();
}

export const listExtensionTemplatePacks = () =>
	Array.from( registries.templatePacks.values() );
// Core-owned packs (Growth Pack, v1.300) use the same registry so the
// tray, the library modal and search treat them like any other pack.
export const registerBuiltinTemplatePack = registerTemplatePack;
export { isTemplateDescriptor };

/* -------------------------------- AI tools ------------------------------- */

/**
 * Register a tool in the AI Studio's "Local tools" section (v2.2). The
 * button reuses the panel's busy/error harness; `run` may open its own
 * settings modal first (plain DOM overlay) and gets the active layer.
 * For transformer models use `window.WPIE.bridge.ml.loadTransformers()`:
 * the returned transformers.js namespace is preconfigured for the
 * self-hosted runtime and models (nothing leaves the browser).
 *
 * @param {Object}   tool        Tool definition.
 * @param {string}   tool.id     Namespaced id (`plugin/name`).
 * @param {string}   tool.label  Button label.
 * @param {string}   [tool.title] Tooltip explaining what it does.
 * @param {Function} tool.run    ( { editor, extras, layer } ) → Promise;
 *                               `layer` is the active layer (may be null).
 */
function registerAiTool( tool ) {
	noteRegistration( 'aiTool', tool && tool.id );
	assertId( tool?.id, 'registerAiTool' );
	if ( ! tool.label || 'function' !== typeof tool.run ) {
		throw new Error( 'WPIE registerAiTool: label and run are required' );
	}
	registries.aiTools.set( tool.id, {
		...tool,
		run: guard( tool.id, tool.run, RETHROW, 'AI tool' ),
	} );
	notify();
}

export const listExtensionAiTools = () =>
	Array.from( registries.aiTools.values() );

/* ------------------------------- bindings ------------------------------- */

/**
 * Register a dynamic-content binding (v1.273.0 / API 2.10): a custom
 * `{{plugin/name}}` token that resolves per post context in every place
 * core tokens do (text layers, QR contents, chart titles, batch runs).
 *
 * @param {Object}   binding         Binding definition.
 * @param {string}   binding.id      Namespaced id (`plugin/name`).
 * @param {string}   binding.label   Picker label.
 * @param {string}   [binding.group] Picker group label (defaults to
 *                                   'Extensions' client-side).
 * @param {Function} binding.resolve ( ctx ) → string, synchronous. The ctx
 *                                   is the run's post context; throwing or
 *                                   returning nullish degrades to ''.
 */
function registerBinding( binding ) {
	noteRegistration( 'binding', binding && binding.id );
	assertId( binding?.id, 'registerBinding' );
	if ( ! binding.label || 'function' !== typeof binding.resolve ) {
		throw new Error(
			'WPIE registerBinding: label and resolve are required'
		);
	}
	registries.bindings.set( binding.id, {
		...binding,
		resolve: guard( binding.id, binding.resolve, '', 'binding' ),
	} );
	notify();
}

export const listExtensionBindings = () =>
	Array.from( registries.bindings.values() );
export const getExtensionBinding = ( id ) =>
	registries.bindings.get( id ) || null;

/* ------------------------------ issue log ------------------------------- */

// Load/runtime errors of installed extension packages, surfaced in the
// Extensions manager instead of dying silently in the console (v1.119).
const issues = [];

export function recordExtensionIssue( source, message ) {
	issues.push( { source, message: String( message || 'Error' ) } );
	notify();
}

export const listExtensionIssues = () => issues.slice();

/* --------------------------------- api ---------------------------------- */

export const api = Object.freeze( {
	version: API_VERSION,
	registerEffect,
	registerMenuItem,
	registerPanel,
	registerTool,
	registerExportFormat,
	registerFilterPreset,
	registerGenerator,
	registerLibrarySection,
	registerPanelSection,
	registerTemplatePack,
	registerAiTool,
	registerBinding,
} );

/**
 * Expose the API on window.WPIE.api and fire `wpie.ready` (idempotent).
 * The optional bridge (v1.79) carries reusable editor building blocks for
 * the Pro add-on; it is composed in pro-bridge.js because THIS module must
 * stay at the bottom of the import graph.
 *
 * @param {Object} bridge Reusable building blocks (see lib/pro-bridge.js).
 */
export function announceExtensionApi( bridge ) {
	if ( 'undefined' !== typeof window ) {
		window.WPIE = window.WPIE || {};
		window.WPIE.api = api;
		if ( bridge ) {
			window.WPIE.bridge = bridge;
		}
	}
	doAction( 'wpie.ready', api, bridge );
}

/** Test hook. */
export function __resetExtensions() {
	for ( const registry of Object.values( registries ) ) {
		registry.clear();
	}
	issues.length = 0;
	inventory.clear();
	placeholderSlugs.clear();
	inventoryWatcher = null;
	notify();
}
