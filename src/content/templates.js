/**
 * Starter templates (v1.167.0): every template is ONE JSON file in
 * src/content/bundled-templates/ - no more hand-coded layer builders.
 *
 * Authoring workflow: design the document in the editor, File → Export
 * for Library → "Export as Template", drop the downloaded *.json into
 * src/content/bundled-templates/ and rebuild (tools/build-content.js
 * aggregates the folder into bundled-templates.json for one chunk).
 *
 * Extensions add whole packs AT RUNTIME via api.registerTemplatePack
 * ({ id, label, templates }); the tray and the library modal merge
 * them with these built-ins.
 *
 * Every entry exposes the same contract: build() returns a Promise of
 * { doc, layers } with FRESH ids per call (hydration restores raster
 * and mask canvases too), so opening a starter twice never collides.
 */

import { hydrateTemplate } from '../lib/template-io';

/**
 * Wrap raw descriptors in the runtime contract. The data arrives from
 * ./index.js, which fetches the shipped (pre-compressed) pack: importing
 * the JSON here would put ~4 MB back into a webpack chunk and force every
 * browser to download it uncompressed.
 *
 * @param {Array} descriptors Raw `wpie-template@1` descriptors.
 * @return {Array} Starter templates.
 */
export const buildTemplates = ( descriptors ) =>
	descriptors.map( ( descriptor ) => ( {
		id: descriptor.id,
		name: descriptor.name,
		category: descriptor.category || '',
		// The raw descriptor feeds the gallery search index (colors + copy,
		// see template-filter.js) - derived lazily, never serialized back.
		descriptor,
		bundled: true,
		build: () => hydrateTemplate( descriptor ),
	} ) );
