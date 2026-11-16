import { gradientColorPatch } from './gradient-layer';
/** Preferences and color edits for the persistent Color panel. */
import {
	layerPaint,
	paintSide,
	paintColorPatch,
	hasEffectStroke,
} from './layer-paint';
import { siteStorage } from './local-storage';
import { parseColor, toHexColor, rgbToHsl, hslToRgb } from './color';

const KEY = 'wpie-color-panel-settings';
export const COLOR_PANEL_MODES = [ 'wheel', 'field', 'rgb', 'hsl', 'gray' ];
const clamp = ( n, lo, hi ) => Math.min( hi, Math.max( lo, n ) );

export function loadColorPanelSettings() {
	let saved;
	try {
		saved = JSON.parse( siteStorage.getItem( KEY ) || '{}' );
	} catch ( e ) {}
	return {
		// Older preferences stored only the control column's width.
		width: clamp(
			( saved?.workflowVersion || 0 ) < 6
				? ! saved?.width ||
				  ! Number.isFinite( +saved.width ) ||
				  [ 240, 260 ].includes( +saved.width )
					? 320
					: +saved.width + 80
				: +saved.width || 320,
			320,
			560
		),
		height: clamp(
			! saved?.height ||
				( ( saved.workflowVersion || 0 ) < 4 &&
					[ 590, 670, 710 ].includes( +saved.height ) ) ||
				( ( saved.workflowVersion || 0 ) < 5 &&
					+saved.height === 760 ) ||
				( ( saved.workflowVersion || 0 ) < 6 && +saved.height === 832 )
				? 740
				: +saved.height,
			400,
			900
		),
		workflowVersion: 6,
		tab: [ 'color', 'swatches', 'extras' ].includes( saved?.tab )
			? saved.tab
			: 'color',
		extra: [ 'links', 'mix', 'result' ].includes( saved?.extra )
			? saved.extra
			: 'links',
		// New sessions start with the wheel; other views remain available.
		mode: 'wheel',
		collection:
			typeof saved?.collection === 'string'
				? saved.collection
				: 'standard',
		harmony: typeof saved?.harmony === 'string' ? saved.harmony : 'shades',
		harmonyLocked: !! saved?.harmonyLocked,
		harmonyBase: /^#[0-9a-f]{6}$/i.test( saved?.harmonyBase || '' )
			? saved.harmonyBase
			: null,
		harmonySpread: clamp(
			Number.isFinite( saved?.harmonySpread ) ? saved.harmonySpread : 50,
			0,
			100
		),
		harmonySaturation: clamp( +saved?.harmonySaturation || 0, -100, 100 ),
		harmonyLightness: clamp( +saved?.harmonyLightness || 0, -100, 100 ),
	};
}

export function saveColorPanelSettings( settings ) {
	siteStorage.setItem( KEY, JSON.stringify( settings ) );
}

export function normalizePanelColor( value ) {
	if ( value === 'transparent' ) {
		return '#00000000';
	}
	const { r, g, b, a } = parseColor( value );
	return toHexColor( r, g, b, a );
}

/** Visual pickers change RGB while the separately edited alpha stays intact. */
export function panelColorWithAlpha( value, alpha ) {
	const { r, g, b } = parseColor( value );
	return toHexColor( r, g, b, clamp( alpha, 0, 1 ) );
}

export function changePanelChannel( color, mode, channel, value ) {
	const rgba = parseColor( normalizePanelColor( color ) );
	if ( ! Number.isFinite( value ) ) {
		return normalizePanelColor( color );
	}
	if ( mode === 'rgb' && [ 'r', 'g', 'b' ].includes( channel ) ) {
		rgba[ channel ] = Math.round( clamp( value, 0, 255 ) );
	} else if ( mode === 'hsl' && [ 'h', 's', 'l' ].includes( channel ) ) {
		const hsl = rgbToHsl( rgba.r, rgba.g, rgba.b );
		hsl[ channel ] =
			channel === 'h'
				? clamp( value, 0, 360 )
				: clamp( value / 100, 0, 1 );
		Object.assign( rgba, hslToRgb( hsl.h, hsl.s, hsl.l ) );
	} else if ( mode === 'gray' ) {
		rgba.r = rgba.g = rgba.b = Math.round( clamp( value, 0, 100 ) * 2.55 );
	}
	return toHexColor( rgba.r, rgba.g, rgba.b, rgba.a );
}

/** Only the explicitly selected color carrier changes. */
export function colorPanelLayerPatch( layer, target, color, stopIndex ) {
	if ( ! layer || layer.locked ) {
		return null;
	}
	const value = normalizePanelColor( color );
	if (
		[ 'stroke', 'outline' ].includes( target ) &&
		hasEffectStroke( layer )
	) {
		return paintColorPatch( layer, 'stroke', value, stopIndex );
	}
	if ( target === 'repeat' && layer.progression?.color?.stops?.length ) {
		const ramp = layer.progression.color;
		const index = Math.min(
			Math.max( stopIndex || 0, 0 ),
			ramp.stops.length - 1
		);
		return {
			progression: {
				...layer.progression,
				color: {
					...ramp,
					stops: ramp.stops.map( ( s, i ) =>
						i === index ? { ...s, color: value } : s
					),
				},
			},
		};
	}
	if ( target === 'gradient' && layer.type === 'gradient' ) {
		return gradientColorPatch( layer, value, stopIndex );
	}

	if (
		stopIndex !== undefined &&
		[ 'fill', 'stroke', 'text', 'outline' ].includes( target ) &&
		layerPaint( layer, paintSide( target ) ).type !== 'solid'
	) {
		return paintColorPatch( layer, paintSide( target ), value, stopIndex );
	}
	if ( layer.type === 'shape' && target === 'fill' ) {
		return { fill: value, fillType: 'solid' };
	}
	if ( layer.type === 'shape' && target === 'stroke' ) {
		return {
			[ layer.shape === 'line' ? 'fill' : 'stroke' ]: value,
			...( layer.strokeGradient ? { strokeGradient: null } : {} ),
			strokeW: layer.strokeW > 0 ? layer.strokeW : 1,
		};
	}
	if ( layer.type === 'text' && target === 'text' ) {
		return { color: value, fillType: 'solid' };
	}
	if ( layer.type === 'text' && target === 'outline' ) {
		return {
			outlineColor: value,
			...( layer.strokeGradient ? { strokeGradient: null } : {} ),
			outlineW: layer.outlineW > 0 ? layer.outlineW : 1,
		};
	}
	return null;
}

const COLLECTED_KEY = 'wpie-collected-colors';
export function loadCollectedColors() {
	try {
		const values = JSON.parse(
			siteStorage.getItem( COLLECTED_KEY ) || '[]'
		);
		return Array.isArray( values )
			? [
					...new Set(
						values
							.filter( ( value ) =>
								/^#[0-9a-f]{6}$/i.test( value )
							)
							.map( ( value ) => value.toLowerCase() )
					),
			  ].slice( 0, 12 )
			: [];
	} catch ( error ) {
		return [];
	}
}
export function saveCollectedColors( colors ) {
	siteStorage.setItem(
		COLLECTED_KEY,
		JSON.stringify( colors.slice( 0, 12 ) )
	);
}
