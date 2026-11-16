/** Persistent relationships between the solid colors of editable objects. */
import { parseColor, rgbToHsl, hslToRgb, toHexColor } from './color';
import { colorKey } from './color-replace';

export const colorFields = ( layer ) => {
	const fields =
		layer?.type === 'shape'
			? [ 'fill', 'stroke' ]
			: layer?.type === 'text'
			? [ 'color', 'outlineColor' ]
			: [];
	return layer?.styles?.stroke && fields.length
		? [ ...fields, 'effectStroke' ]
		: fields;
};
export const readColorField = ( layer, field ) =>
	field === 'effectStroke' ? layer?.styles?.stroke?.color : layer?.[ field ];
export const colorFieldPatch = ( layer, field, color ) =>
	field === 'effectStroke'
		? {
				styles: {
					...layer.styles,
					stroke: { ...layer.styles.stroke, color },
				},
		  }
		: { [ field ]: color };
export const isSolidCarrier = ( layer, field ) =>
	field === 'effectStroke'
		? ! layer.styles?.stroke?.gradient
		: [ 'stroke', 'outlineColor' ].includes( field )
		? ! layer.strokeGradient
		: ! [ 'fill', 'color' ].includes( field ) ||
		  ! layer.fillType ||
		  layer.fillType === 'solid';
export const targetColorField = ( target, layer ) =>
	[ 'stroke', 'outline' ].includes( target ) && layer?.styles?.stroke
		? 'effectStroke'
		: { text: 'color', outline: 'outlineColor' }[ target ] || target;

export function colorLayerLocked( layers, layer ) {
	const seen = new Set();
	while ( layer && ! seen.has( layer.id ) ) {
		if ( layer.locked ) {
			return true;
		}
		seen.add( layer.id );
		layer = layers.find( ( l ) => l.id === layer.parent );
	}
	return false;
}

export function linkedColor( source, original, lightness = 0 ) {
	const { r, g, b } = parseColor( source );
	const hsl = rgbToHsl( r, g, b );
	const c = hslToRgb(
		hsl.h,
		hsl.s,
		Math.max( 0, Math.min( 1, hsl.l + ( +lightness || 0 ) / 100 ) )
	);
	return toHexColor( c.r, c.g, c.b, parseColor( original ).a );
}

/** Invalid/cyclic imported recipes keep their last appearance. No recursive mutation. */
export function syncColorLinks( layers ) {
	const byId = new Map( layers.map( ( l ) => [ l.id, l ] ) );
	const memo = new Map();
	const visiting = new Set();
	const resolve = ( id, field ) => {
		const key = `${ id }:${ field }`;
		if ( memo.has( key ) ) {
			return memo.get( key );
		}
		if ( visiting.has( key ) ) {
			return null;
		}
		const layer = byId.get( id );
		if (
			! colorFields( layer ).includes( field ) ||
			! colorKey( readColorField( layer, field ) ) ||
			! isSolidCarrier( layer, field )
		) {
			return null;
		}
		const link = layer.colorLinks?.[ field ];
		if ( ! link || colorLayerLocked( layers, layer ) ) {
			return readColorField( layer, field );
		}
		visiting.add( key );
		const source = resolve( link.sourceId, link.source );
		visiting.delete( key );
		const value = source
			? linkedColor(
					source,
					readColorField( layer, field ),
					link.lightness
			  )
			: null;
		memo.set( key, value );
		return value;
	};
	let changed = false;
	const result = layers.map( ( layer ) => {
		let next = layer;
		for ( const field of colorFields( layer ) ) {
			if ( ! layer.colorLinks?.[ field ] ) {
				continue;
			}
			const value = resolve( layer.id, field );
			if ( value && value !== readColorField( layer, field ) ) {
				next = { ...next, ...colorFieldPatch( next, field, value ) };
			}
		}
		changed ||= next !== layer;
		return next;
	} );
	return changed ? result : layers;
}

export function canLinkColor( layers, id, field, sourceId, source ) {
	const seen = new Set( [ `${ id }:${ field }` ] );
	let layer = layers.find( ( l ) => l.id === sourceId );
	let key = source;
	while (
		layer &&
		colorFields( layer ).includes( key ) &&
		colorKey( readColorField( layer, key ) )
	) {
		if ( ! isSolidCarrier( layer, key ) ) {
			return false;
		}
		const address = `${ layer.id }:${ key }`;
		if ( seen.has( address ) ) {
			return false;
		}
		seen.add( address );
		const link = layer.colorLinks?.[ key ];
		if ( ! link ) {
			return true;
		}
		layer = layers.find( ( l ) => l.id === link.sourceId );
		key = link.source;
	}
	return false;
}

/** A manual color override takes ownership of that carrier; other links survive. */
export function detachPatchedColorLinks( layer, patch ) {
	if ( ! layer.colorLinks || 'colorLinks' in patch ) {
		return patch;
	}
	const links = { ...layer.colorLinks };
	let changed = false;
	for ( const field of Object.keys( links ) ) {
		if (
			( field in patch &&
				patch[ field ] !== readColorField( layer, field ) ) ||
			( field === 'effectStroke' &&
				patch.styles &&
				( patch.styles.stroke?.color !== layer.styles?.stroke?.color ||
					patch.styles.stroke?.gradient ) ) ||
			( [ 'fill', 'color' ].includes( field ) &&
				patch.fillType &&
				patch.fillType !== 'solid' ) ||
			( [ 'stroke', 'outlineColor' ].includes( field ) &&
				patch.strokeGradient ) ||
			( field === 'color' &&
				( patch.spans?.some( ( run ) => run.s?.color ) ||
					patch.lineStyles?.some( ( style ) => style?.color ) ) )
		) {
			delete links[ field ];
			changed = true;
		}
	}
	return changed ? { ...patch, colorLinks: links } : patch;
}
