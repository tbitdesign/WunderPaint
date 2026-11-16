/** Adapter for the existing text/shape fill format. No layer geometry changes. */
import { gradientPaint } from './gradient-layer';
import { expandedGradientStops } from './gradient-ramp';
import { layerPaint, layerPaintPatch } from './layer-paint';

export const GRADIENT_FILL_KINDS = [ 'linear', 'radial', 'angle' ];
export const GRADIENT_FILL_TOOLS = [
	'gradient',
	'move',
	'select',
	'text',
	'shape',
	'pen',
	'eyedropper',
];

export function gradientFillLayerOf( state ) {
	if (
		state.selectedIds?.length !== 1 ||
		state.selectedIds[ 0 ] !== state.activeId
	) {
		return null;
	}
	return (
		state.layers.find(
			( layer ) =>
				layer.id === state.activeId &&
				[ 'text', 'shape' ].includes( layer.type ) &&
				layerPaint( layer, state.paintTarget ).type === 'gradient' &&
				layerPaint( layer, state.paintTarget ).stops.length > 0
		) || null
	);
}

export function gradientFillPaint( layer, side = 'fill' ) {
	const paint = layerPaint( layer, side );
	return gradientPaint( {
		kind: paint.kind,
		stops: paint.stops.map( ( stop ) => ( { ...stop } ) ),
	} );
}

/** Fill renderers support box placement and pad spread, using ordinary stops. */
export function gradientFillPresetAllowed( preset ) {
	return (
		GRADIENT_FILL_KINDS.includes( preset.kind || 'linear' ) &&
		( ! preset.spread || preset.spread === 'pad' )
	);
}

export function gradientFillPreset( preset ) {
	const paint = gradientPaint( preset );
	// Sample saved midpoint biases into the existing fill format, as in Canvas/SVG.
	return { ...paint, stops: expandedGradientStops( paint.stops ) };
}

export function gradientFillPatch( change, layer, side = 'fill' ) {
	if ( side === 'stroke' && layer ) {
		return layerPaintPatch( layer, side, { ...change, type: 'gradient' } );
	}
	const patch = {};
	if ( change.stops ) {
		patch.gradientStops = change.stops.map( ( { at, color } ) => ( {
			at,
			color,
		} ) );
	}
	if ( GRADIENT_FILL_KINDS.includes( change.kind ) ) {
		patch.gradientKind = change.kind;
	}
	if ( Number.isFinite( change.angle ) ) {
		patch.gradientAngle = ( ( change.angle % 360 ) + 360 ) % 360;
	}
	return patch;
}
