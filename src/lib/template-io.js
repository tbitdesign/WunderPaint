/**
 * Template authoring I/O (v1.17).
 *
 * A "bundled template" is a designed document serialized to plain JSON so it
 * can ship inside the plugin (src/content/bundled-templates/) and open as a
 * fresh, fully editable document. This module is the bridge:
 *   - `templateFromDoc` turns the live editor doc into a bundle-able descriptor
 *     (File → Export as Template downloads exactly this).
 *   - `hydrateTemplate` turns a descriptor back into runtime layers with FRESH
 *     ids, so opening the same template twice never collides.
 *
 * Only three fields cross-reference other layer ids, `id`, a child's `parent`,
 * and a group's `children` list, so those are all the remapper rewrites
 * (clipping is boolean adjacency, masks carry no id ref).
 */

import { uid, serializeLayers, hydrateLayers } from '../store/document';

/** Descriptor format marker, so importers can sanity-check a template file. */
export const TEMPLATE_FORMAT = 'wpie-template@1';

/** Filesystem-safe slug for template ids / filenames. */
export function slugify( name ) {
	return (
		String( name || 'template' )
			.toLowerCase()
			.replace( /[^a-z0-9]+/g, '-' )
			.replace( /^-+|-+$/g, '' )
			.slice( 0, 48 ) || 'template'
	);
}

/**
 * Deep-copy a serialized layer list with fresh ids, remapping the id
 * cross-references (`parent`, group `children`) so the subtree stays wired.
 *
 * @param {Array} layers Serialized (plain-data) layers.
 * @return {Array} New layers with fresh ids.
 */
export function reassignIds( layers ) {
	const idMap = new Map();
	for ( const layer of layers ) {
		idMap.set( layer.id, uid() );
	}
	return layers.map( ( layer ) => {
		const copy = { ...layer, id: idMap.get( layer.id ) };
		if ( copy.parent && idMap.has( copy.parent ) ) {
			copy.parent = idMap.get( copy.parent );
		}
		if ( Array.isArray( copy.children ) ) {
			copy.children = copy.children.map(
				( childId ) => idMap.get( childId ) || childId
			);
		}
		return copy;
	} );
}

/**
 * Build a bundle-able template descriptor from the current document.
 *
 * @param {Object} doc    The document.
 * @param {Array}  layers Live layers.
 * @param {Object} meta   { id?, name? } overrides.
 * @return {Object} JSON-serializable template descriptor.
 */
export function templateFromDoc( doc, layers, meta = {} ) {
	const name = meta.name || doc.name || 'Template';
	return {
		format: TEMPLATE_FORMAT,
		id: meta.id || `tpl-${ slugify( name ) }`,
		name,
		// Gallery filter category (v1.255.0); bundled templates must
		// carry one (build-content enforces it), exports may omit it.
		...( meta.category ? { category: meta.category } : {} ),
		doc: {
			w: doc.w,
			h: doc.h,
			bg: doc.bg,
			dpi: doc.dpi,
			colorMode: doc.colorMode,
			name: slugify( name ),
			// THE TIPS TRAVEL WITH IT. A stroke records only its tip's id,
			// and an id nobody can resolve falls back to Hard Round without
			// a word - so a design saved as a template came back painted
			// with the wrong brush. Only the recipes actually used are
			// worth carrying, but a document holds a handful at most and
			// working out which ones a stroke references means walking
			// every path of every layer; the whole list is a few kilobytes.
			...( doc.tips && doc.tips.length ? { tips: doc.tips } : {} ),
		},
		layers: serializeLayers( layers ),
	};
}

/**
 * Hydrate a template descriptor into a fresh, editable document.
 *
 * @param {Object} descriptor Template descriptor (see templateFromDoc).
 * @return {Promise<{doc: Object, layers: Array}>} Fresh doc + layers.
 */
export async function hydrateTemplate( descriptor ) {
	const layers = await hydrateLayers(
		reassignIds( descriptor.layers || [] )
	);
	const src = descriptor.doc || {};
	const doc = {
		...src,
		id: uid(),
		name: src.name || slugify( descriptor.name ),
		source: {
			attachmentId: 0,
			isNew: true,
			originalUrl: null,
			psd: false,
		},
	};
	return { doc, layers };
}
