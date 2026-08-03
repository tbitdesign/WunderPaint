/**
 * Personal Workspaces (v1.184.0): purely cosmetic show/hide of main-UI
 * regions (toolbar tools, panels, panel sections, top menus) plus toolbar
 * icon size, saved as switchable presets.
 *
 * IMPORTANT: nothing here disables functionality. Hidden regions are
 * `display:none` only; their React state and values are untouched, so a
 * feature keeps working with its current/default values while its UI is
 * simply out of the way. Hiding a region can always be undone.
 *
 * Applied by injecting a single <style> that hides the selected
 * `[data-ws="key"]` regions, scoped so it PAUSES while the interactive
 * picker runs (the `wpie-ws-picking` class on #wpie-root), and by writing a
 * `data-ws-tools` size attribute on the root. Persisted per browser in
 * localStorage; this is a personal preference, not stored server-side.
 */

import { catalogKeySet } from './workspace-registry';

const STORE_KEY = 'wpie-workspaces';
const STYLE_ID = 'wpie-workspace-style';
const ROOT_ID = 'wpie-root';
const PICK_CLASS = 'wpie-ws-picking';

export const ICON_SIZES = [ 'sm', 'md', 'lg' ];

/**
 * Built-in presets. `name` is an id-like fallback; the dialog resolves a
 * translated label from the id. Keys reference the catalog in
 * workspace-registry.js.
 */
export const BUILTIN_WORKSPACES = [
	{ id: 'full', builtin: true, name: 'Full', tools: 'md', hidden: [] },
	{
		id: 'essentials',
		builtin: true,
		name: 'Essentials',
		tools: 'lg',
		hidden: [
			'menu.automation',
			'menu.tools',
			'tool.stamp',
			'tool.fxbrush',
			'tool.pen',
			'tool.smartselect',
			'tool.wand',
			'props.blending',
			'props.align',
			'props.smart',
			'props.dynamic',
			'effects.warp',
			'effects.textstyles',
		],
	},
	{
		id: 'minimal',
		builtin: true,
		name: 'Minimal',
		tools: 'md',
		hidden: [
			'menu.filter',
			'menu.assets',
			'menu.automation',
			'menu.tools',
			'panel.effects',
			'panel.history',
			'tool.marquee',
			'tool.lasso',
			'tool.wand',
			'tool.stamp',
			'tool.fxbrush',
			'tool.pen',
			'tool.smartselect',
			'tool.gradient',
			'tool.pencil',
			'tool.bucket',
			'props.blending',
			'props.align',
			'props.smart',
			'props.dynamic',
			'props.gradient',
			'props.character',
			'effects.warp',
			'effects.textstyles',
			'effects.textfx',
		],
	},
];

let state = null;
const listeners = new Set();

function defaults() {
	return { active: { base: 'full', hidden: [], tools: 'md' }, saved: [] };
}

function load() {
	if ( state ) {
		return state;
	}
	try {
		const raw = window.localStorage.getItem( STORE_KEY );
		state = raw ? JSON.parse( raw ) : defaults();
	} catch ( e ) {
		state = defaults();
	}
	if ( ! state || 'object' !== typeof state ) {
		state = defaults();
	}
	if ( ! state.active || 'object' !== typeof state.active ) {
		state.active = defaults().active;
	}
	if ( ! Array.isArray( state.active.hidden ) ) {
		state.active.hidden = [];
	}
	if ( ! ICON_SIZES.includes( state.active.tools ) ) {
		state.active.tools = 'md';
	}
	if ( ! Array.isArray( state.saved ) ) {
		state.saved = [];
	}
	// Prune keys that no longer exist in the catalog (forward-compat across
	// updates: unknown keys are dropped, new regions default to visible).
	const valid = catalogKeySet();
	state.active.hidden = state.active.hidden.filter( ( k ) => valid.has( k ) );
	state.saved.forEach( ( w ) => {
		if ( Array.isArray( w.hidden ) ) {
			w.hidden = w.hidden.filter( ( k ) => valid.has( k ) );
		}
	} );
	return state;
}

function persist() {
	try {
		window.localStorage.setItem( STORE_KEY, JSON.stringify( state ) );
	} catch ( e ) {
		/* storage full or blocked: keep the in-memory state. */
	}
}

function notify() {
	listeners.forEach( ( fn ) => {
		try {
			fn();
		} catch ( e ) {
			/* a broken listener must not stop the rest. */
		}
	} );
}

export function subscribeWorkspace( fn ) {
	listeners.add( fn );
	return () => listeners.delete( fn );
}

const safeKey = ( k ) => String( k ).replace( /["\\]/g, '' );

/** Rebuild the injected stylesheet and the root size attribute. */
export function applyWorkspaceDom() {
	const s = load();
	const root = document.getElementById( ROOT_ID );
	if ( root ) {
		root.dataset.wsTools = s.active.tools || 'md';
	}
	let el = document.getElementById( STYLE_ID );
	if ( ! el ) {
		el = document.createElement( 'style' );
		el.id = STYLE_ID;
		document.head.appendChild( el );
	}
	const sel = ( s.active.hidden || [] )
		.map(
			( k ) =>
				'#' +
				ROOT_ID +
				':not(.' +
				PICK_CLASS +
				') [data-ws="' +
				safeKey( k ) +
				'"]'
		)
		.join( ',' );
	el.textContent = sel ? sel + '{display:none!important}' : '';
}

export function getActive() {
	return load().active;
}
export function getIconSize() {
	return load().active.tools;
}
export function activeBase() {
	return load().active.base;
}
export function isKeyHidden( key ) {
	return load().active.hidden.includes( key );
}

function markCustom() {
	load().active.base = null;
}

export function setKeyHidden( key, hidden ) {
	const a = load().active;
	const has = a.hidden.includes( key );
	if ( hidden && ! has ) {
		a.hidden = [ ...a.hidden, key ];
	} else if ( ! hidden && has ) {
		a.hidden = a.hidden.filter( ( k ) => k !== key );
	} else {
		return;
	}
	markCustom();
	persist();
	applyWorkspaceDom();
	notify();
}

export function toggleKey( key ) {
	setKeyHidden( key, ! isKeyHidden( key ) );
}

export function setIconSize( size ) {
	if ( ! ICON_SIZES.includes( size ) || load().active.tools === size ) {
		return;
	}
	load().active.tools = size;
	markCustom();
	persist();
	applyWorkspaceDom();
	notify();
}

export function showAll() {
	const a = load().active;
	if ( ! a.hidden.length ) {
		return;
	}
	a.hidden = [];
	a.base = null;
	persist();
	applyWorkspaceDom();
	notify();
}

export function listWorkspaces() {
	return [ ...BUILTIN_WORKSPACES, ...load().saved ];
}

export function applyWorkspace( id ) {
	const w = listWorkspaces().find( ( x ) => x.id === id );
	if ( ! w ) {
		return;
	}
	const valid = catalogKeySet();
	const a = load().active;
	a.hidden = ( w.hidden || [] ).filter( ( k ) => valid.has( k ) );
	a.tools = ICON_SIZES.includes( w.tools ) ? w.tools : 'md';
	a.base = id;
	persist();
	applyWorkspaceDom();
	notify();
}

let seq = 0;
export function saveWorkspaceAs( name ) {
	const s = load();
	seq += 1;
	const id = 'ws_' + Date.now().toString( 36 ) + '_' + seq;
	s.saved.push( {
		id,
		name: ( name || '' ).trim() || 'Workspace',
		hidden: [ ...s.active.hidden ],
		tools: s.active.tools,
	} );
	s.active.base = id;
	persist();
	notify();
	return id;
}

export function updateWorkspace( id ) {
	const s = load();
	const w = s.saved.find( ( x ) => x.id === id );
	if ( ! w ) {
		return;
	}
	w.hidden = [ ...s.active.hidden ];
	w.tools = s.active.tools;
	s.active.base = id;
	persist();
	notify();
}

export function renameWorkspace( id, name ) {
	const w = load().saved.find( ( x ) => x.id === id );
	if ( ! w ) {
		return;
	}
	w.name = ( name || '' ).trim() || w.name;
	persist();
	notify();
}

export function deleteWorkspace( id ) {
	const s = load();
	s.saved = s.saved.filter( ( x ) => x.id !== id );
	if ( s.active.base === id ) {
		s.active.base = null;
	}
	persist();
	notify();
}

/** Toggle the interactive picker CSS scope on the root. */
export function setPicking( on ) {
	const root = document.getElementById( ROOT_ID );
	if ( root ) {
		root.classList.toggle( PICK_CLASS, !! on );
	}
}

/** Mark currently-hidden regions while picking, so they can be toggled back. */
export function markHiddenRegions( on ) {
	const root = document.getElementById( ROOT_ID );
	if ( ! root ) {
		return;
	}
	root.querySelectorAll( '[data-ws]' ).forEach( ( el ) => {
		const k = el.getAttribute( 'data-ws' );
		el.classList.toggle( 'wpie-ws-off', !! on && isKeyHidden( k ) );
	} );
}

/** Test-only: drop the in-memory cache so a fresh load() re-reads storage. */
export function __resetWorkspaceCache() {
	state = null;
	seq = 0;
}
