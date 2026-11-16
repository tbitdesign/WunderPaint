/** Shared targets and mixed-value detection for editable shape/text paint. */
import { colorLayerLocked } from './color-links';
import { parseColor, toHexColor } from './color';
import { isPaintLayer, layerPaint } from './layer-paint';

/** Match the existing same-type edit scope, excluding locked ancestors too. */
export function selectedPaintLayers( state, layer ) {
	if ( ! isPaintLayer( layer ) || colorLayerLocked( state.layers, layer ) ) {
		return [];
	}
	const ids = new Set(
		state.activeId === layer.id ? state.selectedIds || [] : []
	);
	ids.add( layer.id );
	return state.layers.filter(
		( item ) =>
			ids.has( item.id ) &&
			item.type === layer.type &&
			! colorLayerLocked( state.layers, item )
	);
}

export function mixedValue( layers, read ) {
	if ( layers.length < 2 ) {
		return false;
	}
	const value = JSON.stringify( read( layers[ 0 ] ) );
	return layers.some(
		( layer ) => JSON.stringify( read( layer ) ) !== value
	);
}

const colorValue = ( value ) => {
	const { r, g, b, a } = parseColor( value || 'transparent' );
	return toHexColor( r, g, b, a );
};

/** Ignore dormant paint fields; compare the paint actually being shown. */
export function paintValue( layer, side = 'fill' ) {
	const paint = layerPaint( layer, side );
	if ( paint.type === 'gradient' ) {
		return {
			type: paint.type,
			kind: paint.kind,
			angle: ( ( paint.angle % 360 ) + 360 ) % 360,
			stops: paint.stops.map( ( stop ) => ( {
				at: stop.at,
				color: colorValue( stop.color ),
				mid: stop.mid ?? 0.5,
			} ) ),
		};
	}
	return {
		type: paint.type,
		color: colorValue( paint.color ),
		...( paint.type === 'pattern'
			? {
					pattern: layer.pattern || 'none',
					data: layer.patternData || null,
					scale: layer.patternScale ?? 1,
			  }
			: {} ),
	};
}

/** Each target builds its own patch so nested styles never leak across layers. */
export function updatePaintSelection( editor, layer, patchFor ) {
	const targets = selectedPaintLayers( editor.state, layer );
	if ( ! targets.length ) {
		return false;
	}
	editor.dispatch( {
		type: 'UPDATE_LAYERS',
		ids: targets.map( ( item ) => item.id ),
		patchFor,
	} );
	return true;
}
