/**
 * Lazy content packs (v1.16): the bundled library content, starter
 * templates, text combinations, element sets and gradient presets, used
 * to be static imports baked into the eager main bundle (index.js). They
 * now load as separate webpack chunks the first time a library surface
 * asks for them, so shipping much more built-in content never slows the
 * editor's initial load.
 *
 * Templates and combos stay JS modules (parameterized layer builders);
 * elements stay a JS module (translated set labels); gradients are pure
 * JSON data. Each pack is its own chunk with a memoized loader. React
 * components should use the hooks in ./use-content rather than call these
 * directly; the non-React insert path (lib/asset-insert) awaits them.
 */

import { fetchPack } from '../lib/fetch-pack';

// Resolved packs, kept for synchronous access once loaded (null until then).
const value = {
	templates: null,
	combos: null,
	elements: null,
	gradients: null,
};

// In-flight/settled chunk promises, so concurrent callers share one fetch.
const memo = {};

const load = ( key, factory ) => {
	if ( ! memo[ key ] ) {
		memo[ key ] = factory().then( ( resolved ) => {
			value[ key ] = resolved;
			return resolved;
		} );
	}
	return memo[ key ];
};

export const loadTemplates = () =>
	load( 'templates', () =>
		Promise.all( [
			import( /* webpackChunkName: "content-templates" */ './templates' ),
			fetchPack( 'bundled-templates' ),
		] ).then( ( [ m, descriptors ] ) => m.buildTemplates( descriptors ) )
	);

export const loadCombos = () =>
	load( 'combos', () =>
		Promise.all( [
			import( /* webpackChunkName: "content-combos" */ './combos' ),
			fetchPack( 'bundled-combos' ),
		] ).then( ( [ m, descriptors ] ) => m.buildCombos( descriptors ) )
	);

export const loadElements = () =>
	load( 'elements', () =>
		import( /* webpackChunkName: "content-elements" */ './elements' ).then(
			( m ) => m.ELEMENT_SETS
		)
	);

export const loadGradients = () =>
	load( 'gradients', () =>
		Promise.all( [
			import(
				/* webpackChunkName: "content-gradients" */ './gradients.json'
			),
			import(
				/* webpackChunkName: "content-gradients" */ './bundled-backgrounds.json'
			),
		] ).then( ( [ presets, bundled ] ) => {
			// Bundled backgrounds authored via "Export as Background" join the
			// gradient list (solids are handled separately in the UI).
			const extra = ( bundled.default || bundled ).filter(
				( b ) => 'solid' !== b.kind
			);
			return [ ...( presets.default || presets ), ...extra ];
		} )
	);

/* Synchronous cache accessors, null until the matching pack has loaded. */
export const getTemplates = () => value.templates;
export const getCombos = () => value.combos;
export const getElements = () => value.elements;
export const getGradients = () => value.gradients;
