/**
 * Brand-kit resolution (v1.273.0): one source of truth for "which palette
 * is the brand palette". Eleven extensions and the chart studio each
 * re-derived this - and most took the FIRST kit instead of the document's
 * active kit (the v1.272.5 bug class). Bridged as `brand.*` plus
 * components.mountKitPicker.
 */

/** All kits from the bootstrap payload. */
export function brandKits() {
	return window.WPIE?.brandKits || [];
}

/**
 * Kit by id. String-compare: ids arrive as strings from the server but
 * documents may carry them as numbers.
 *
 * @param {string|number} id Kit id.
 * @return {Object|null} Kit descriptor.
 */
export function kitById( id ) {
	return (
		brandKits().find( ( k ) => String( k.id ) === String( id ?? '' ) ) ||
		null
	);
}

/**
 * The working brand palette for a document: the document's active kit
 * first (doc.brandKitId), then the site kit, then the first kit with a
 * usable palette (>1 colors). Null when nothing qualifies.
 *
 * @param {string|number} brandKitId The document's active kit id ('' = none).
 * @return {string[]|null} Palette colors.
 */
export function activeKitColors( brandKitId = '' ) {
	const active = kitById( brandKitId );
	return (
		( active?.colors?.length > 1 && active.colors ) ||
		( window.WPIE?.brand?.colors?.length > 1 &&
			window.WPIE.brand.colors ) ||
		brandKits().find( ( k ) => ( k.colors || [] ).length > 1 )?.colors ||
		null
	);
}
