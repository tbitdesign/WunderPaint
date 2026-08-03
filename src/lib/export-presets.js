/**
 * Export presets (F11, v0.5): named format/quality/scale combos in
 * localStorage, shared by the Export dialog and Batch processing.
 */

const KEY = 'wpie-export-presets';
export const EXPORT_PRESET_CAP = 10;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook. */
export const __setExportPresetStorage = ( s ) => {
	storage = s;
};

const read = () => {
	try {
		const raw = storage?.getItem( KEY );
		const list = raw ? JSON.parse( raw ) : [];
		return Array.isArray( list ) ? list : [];
	} catch ( e ) {
		return [];
	}
};

const write = ( list ) => {
	try {
		storage?.setItem( KEY, JSON.stringify( list ) );
	} catch ( e ) {}
};

export const listExportPresets = () => read();

/**
 * Save (same name replaces).
 *
 * @param {string} name   Preset name.
 * @param {Object} preset { format, quality, scale }.
 * @return {Array} Updated list.
 */
export function saveExportPreset( name, preset ) {
	const entry = {
		name: String( name || 'Preset' ).slice( 0, 24 ),
		format: preset.format || 'jpeg',
		quality: preset.quality || 90,
		scale: preset.scale || 1,
	};
	const list = [
		...read().filter( ( p ) => p.name !== entry.name ),
		entry,
	].slice( -EXPORT_PRESET_CAP );
	write( list );
	return list;
}

/**
 * @param {string} name Name to delete.
 * @return {Array} Updated list.
 */
export function deleteExportPreset( name ) {
	const list = read().filter( ( p ) => p.name !== name );
	write( list );
	return list;
}
