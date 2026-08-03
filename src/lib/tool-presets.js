/**
 * Named tool presets (F9, v0.5): store brush/eraser option combos in
 * localStorage. Same degradation rules as user-swatches.
 */

const KEY = 'wpie-brush-presets';
export const PRESET_CAP = 12;

let storage = null;
try {
	storage = window.localStorage;
} catch ( e ) {
	storage = null;
}

/** Test hook. */
export const __setPresetStorage = ( s ) => {
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

export const listToolPresets = () => read();

/**
 * Save a preset (name + opts subset); replaces an existing same name.
 *
 * @param {string} name Preset name.
 * @param {Object} opts { size, opacity, flow, hardness }.
 * @return {Array} Updated list.
 */
export function saveToolPreset( name, opts ) {
	const preset = {
		name: String( name || 'Preset' ).slice( 0, 24 ),
		size: opts.size,
		opacity: opts.opacity,
		flow: opts.flow,
		hardness: opts.hardness,
	};
	const list = [
		...read().filter( ( p ) => p.name !== preset.name ),
		preset,
	].slice( -PRESET_CAP );
	write( list );
	return list;
}

/**
 * @param {string} name Preset name to remove.
 * @return {Array} Updated list.
 */
export function deleteToolPreset( name ) {
	const list = read().filter( ( p ) => p.name !== name );
	write( list );
	return list;
}
