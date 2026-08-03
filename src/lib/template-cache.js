/**
 * Loaded user templates, hydrated once and cached (moved out of the
 * automation module in v1.79 — templates are a free feature, the Pro
 * automation pipeline consumes this through the extension bridge).
 */

import { templates } from './api';
import { hydrateLayers } from '../store/document';

const tplCache = new Map();

/** Drop a template from the cache (after File → Save as Template updates it). */
export function invalidateTemplate( id ) {
	tplCache.delete( id );
}

/**
 * Load + hydrate a template document (cached).
 *
 * @param {string} id Template id.
 * @return {Promise<{doc: Object, layers: Array}>} Parsed template.
 */
export async function loadTemplate( id ) {
	if ( ! tplCache.has( id ) ) {
		const record = await templates.load( id );
		// GET /templates/{id} returns the parsed project object; accept a
		// { projectJson } wrapper too so any older callers keep working.
		const data = record?.projectJson
			? JSON.parse( record.projectJson )
			: { ...record };
		data.layers = await hydrateLayers( data.layers || [] );
		tplCache.set( id, data );
	}
	return tplCache.get( id );
}
