/**
 * Cross-tab / cross-reload clipboard backing store (v1.226.0).
 *
 * Each document tab mounts its OWN editor reducer - App renders a single
 * `<EditorProvider key={active}>`, so switching tabs REMOUNTS the provider and
 * an in-reducer clipboard would reset to null (Copy in one tab, Paste greyed
 * out in the next). This module lives at module scope, shared by every tab in
 * the page, so a freshly mounted tab can seed its clipboard from the last copy.
 *
 * The tiny style clip is also mirrored to localStorage so it survives across
 * editor sessions (copy a look here, open another design, paste). The layer
 * clip can be heavy (raster data), and cloned layers may hold live canvases
 * that do not serialize, so it stays in-memory only - shared across tabs for
 * the current page load, which is exactly the reported gap.
 */

const STYLE_KEY = 'wpie-clip-style';

let layerClip = null; // Array<layer> (clone-tree output) | null
let styleClip = null; // { sourceType, universal, typed } | null
let hydrated = false;

const store = () => {
	try {
		return window.localStorage || null;
	} catch ( e ) {
		return null;
	}
};

const hydrate = () => {
	if ( hydrated ) {
		return;
	}
	hydrated = true;
	try {
		const raw = store()?.getItem( STYLE_KEY );
		if ( raw ) {
			styleClip = JSON.parse( raw );
		}
	} catch ( e ) {
		styleClip = null;
	}
};

/** Layer clipboard (in-memory, shared across tabs for this page load). */
export function getLayerClip() {
	hydrate();
	return layerClip;
}

export function setLayerClip( layers ) {
	hydrate();
	layerClip = layers && layers.length ? layers : null;
}

/** Style clipboard (shared across tabs AND persisted for later sessions). */
export function getStyleClip() {
	hydrate();
	return styleClip;
}

export function setStyleClip( style ) {
	hydrate();
	styleClip = style || null;
	try {
		if ( ! style ) {
			store()?.removeItem( STYLE_KEY );
		} else {
			store()?.setItem( STYLE_KEY, JSON.stringify( style ) );
		}
	} catch ( e ) {
		// Quota or privacy mode: in-memory sharing still works.
	}
}

/** Test seam. */
export function __resetSharedClipboard() {
	layerClip = null;
	styleClip = null;
	hydrated = false;
	try {
		store()?.removeItem( STYLE_KEY );
	} catch ( e ) {}
}
