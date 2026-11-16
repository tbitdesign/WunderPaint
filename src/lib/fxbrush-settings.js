/** Effect-specific settings shared by the panel, toolbar and pixel brush. */
import { readLocal, siteStorage } from './local-storage';

export const FX_BRUSH_DEFAULTS = {
	mode: 'blur',
	size: 40,
	strength: 50,
	hardness: 60,
	blurRadius: 6,
	toneRange: 'all',
	preserveAlpha: false,
	sponge: 'desaturate',
};

export const FX_BRUSH_PRESETS = {
	blur: {
		gentle: { strength: 20, hardness: 0, blurRadius: 3 },
		medium: { strength: 50, hardness: 60, blurRadius: 6 },
		strong: { strength: 85, hardness: 80, blurRadius: 14 },
	},
	sharpen: {
		gentle: { strength: 15, hardness: 20 },
		medium: { strength: 40, hardness: 50 },
		strong: { strength: 75, hardness: 75 },
	},
	smudge: {
		gentle: { strength: 20, hardness: 0 },
		medium: { strength: 50, hardness: 40 },
		strong: { strength: 85, hardness: 70 },
	},
	dodge: {
		gentle: { strength: 15, hardness: 0 },
		medium: { strength: 40, hardness: 25 },
		strong: { strength: 75, hardness: 50 },
	},
	burn: {
		gentle: { strength: 15, hardness: 0 },
		medium: { strength: 40, hardness: 25 },
		strong: { strength: 75, hardness: 50 },
	},
	sponge: {
		gentle: { strength: 20, hardness: 0 },
		medium: { strength: 50, hardness: 40 },
		strong: { strength: 85, hardness: 70 },
	},
};
const MODES = Object.keys( FX_BRUSH_PRESETS );
const STORE_KEY = 'wpie-fxbrush-settings';
const record = ( value ) =>
	value && typeof value === 'object' && ! Array.isArray( value ) ? value : {};
const number = ( value, fallback, min, max ) =>
	Number.isFinite( value )
		? Math.round( Math.max( min, Math.min( max, value ) ) )
		: fallback;

/** Only known, bounded settings enter the pixel engine or browser storage. */
function cleanValues( input, mode ) {
	const value = record( input );
	const defaults = {
		...FX_BRUSH_DEFAULTS,
		...FX_BRUSH_PRESETS[ mode ].medium,
	};
	return {
		size: number( value.size, defaults.size, 4, 300 ),
		strength: number( value.strength, defaults.strength, 1, 100 ),
		hardness: number( value.hardness, defaults.hardness, 0, 100 ),
		blurRadius: number( value.blurRadius, defaults.blurRadius, 1, 50 ),
		toneRange: [ 'all', 'shadows', 'midtones', 'highlights' ].includes(
			value.toneRange
		)
			? value.toneRange
			: defaults.toneRange,
		preserveAlpha: value.preserveAlpha === true,
		sponge: value.sponge === 'saturate' ? 'saturate' : 'desaturate',
	};
}

/** Switch modes atomically, then apply edits to the newly selected mode. */
export function patchFxBrushSettings( current, edits = {} ) {
	const value = record( current );
	const patch = record( edits );
	const oldMode = MODES.includes( value.mode ) ? value.mode : 'blur';
	const mode = MODES.includes( patch.mode ) ? patch.mode : oldMode;
	const stored = record( value.byMode );
	const byMode = {};
	for ( const id of MODES ) {
		if ( Object.hasOwn( stored, id ) ) {
			byMode[ id ] = cleanValues( stored[ id ], id );
		}
	}
	byMode[ oldMode ] = cleanValues( value, oldMode );
	const next = cleanValues( { ...byMode[ mode ], ...patch }, mode );
	byMode[ mode ] = next;
	return { mode, ...next, byMode };
}

export function readFxBrushSettings() {
	try {
		return patchFxBrushSettings(
			JSON.parse( readLocal( STORE_KEY, '{}' ) )
		);
	} catch ( e ) {
		return patchFxBrushSettings( {} );
	}
}

export function saveFxBrushSettings( settings ) {
	siteStorage.setItem( STORE_KEY, JSON.stringify( settings ) );
}

/** Smooth, overlapping tonal transitions avoid contour bands when brushing. */
export function fxBrushToneWeight( luminance, range ) {
	const smooth = ( value ) => {
		const t = Math.max( 0, Math.min( 1, value ) );
		return t * t * ( 3 - 2 * t );
	};
	const intoMidtones = smooth( ( luminance - 0.15 ) / 0.35 );
	const intoHighlights = smooth( ( luminance - 0.5 ) / 0.35 );
	switch ( range ) {
		case 'shadows':
			return 1 - intoMidtones;
		case 'midtones':
			return intoMidtones * ( 1 - intoHighlights );
		case 'highlights':
			return intoHighlights;
		default:
			return 1;
	}
}
