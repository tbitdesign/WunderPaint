/** Shared fill/stroke paint. Existing fill fields stay backwards compatible. */
import { expandedGradientStops } from './gradient-ramp';

export const PAINT_KINDS = [ 'linear', 'radial', 'angle' ];
export const isPaintLayer = ( layer ) =>
	[ 'shape', 'text' ].includes( layer?.type );
export const paintSide = ( target ) =>
	[ 'stroke', 'outline' ].includes( target ) ? 'stroke' : 'fill';
export const paintColorField = ( layer, side ) =>
	side === 'stroke'
		? layer.type === 'text'
			? 'outlineColor'
			: layer.shape === 'line'
			? 'fill'
			: 'stroke'
		: layer.type === 'text'
		? 'color'
		: 'fill';

/** Existing effect strokes keep their rendering; no document migration. */
export const hasEffectStroke = ( layer ) => !! layer?.styles?.stroke;
export function strokeSettings( layer ) {
	if ( hasEffectStroke( layer ) ) {
		return { ...layer.styles.stroke, source: 'effect' };
	}
	return {
		source: 'native',
		size: layer?.[ layer?.type === 'text' ? 'outlineW' : 'strokeW' ] || 0,
		position:
			layer?.type === 'text' ? 'center' : layer?.strokeAlign || 'center',
	};
}
export function strokeSettingsPatch( layer, change ) {
	if ( hasEffectStroke( layer ) ) {
		return {
			styles: {
				...layer.styles,
				stroke: { ...layer.styles.stroke, ...change },
			},
		};
	}
	return {
		...( change.size !== undefined
			? {
					[ layer.type === 'text' ? 'outlineW' : 'strokeW' ]:
						change.size,
			  }
			: {} ),
		...( change.position !== undefined && layer.type === 'shape'
			? { strokeAlign: change.position }
			: {} ),
	};
}
export function layerPaint( layer, side = 'fill' ) {
	if ( side === 'stroke' && hasEffectStroke( layer ) ) {
		const stroke = layer.styles.stroke;
		return {
			type: stroke.gradient?.stops?.length ? 'gradient' : 'solid',
			color: stroke.color || '#000000',
			kind: stroke.gradient?.kind || 'linear',
			angle: stroke.gradient?.angle || 0,
			stops: stroke.gradient?.stops || [],
		};
	}
	if ( side === 'additionalStroke' ) {
		side = 'stroke';
		layer = { ...layer, styles: null };
	}

	const color =
		layer?.[ paintColorField( layer || {}, side ) ] || 'transparent';
	const gradient = side === 'stroke' ? layer?.strokeGradient : null;
	const type =
		side === 'stroke'
			? gradient?.stops?.length
				? 'gradient'
				: 'solid'
			: layer?.fillType ||
			  ( layer?.pattern && layer.pattern !== 'none'
					? 'pattern'
					: 'solid' );
	return {
		type,
		color,
		kind:
			gradient?.kind ||
			( side === 'fill' && layer?.gradientKind ) ||
			'linear',
		angle:
			gradient?.angle || ( side === 'fill' && layer?.gradientAngle ) || 0,
		stops:
			( side === 'stroke' ? gradient?.stops : layer?.gradientStops ) ||
			[],
	};
}

export function defaultPaintStops( color = '#3b66ff' ) {
	return [
		{ at: 0, color: color === 'transparent' ? '#3b66ff' : color },
		{ at: 1, color: '#ffffff' },
	];
}

/** Patch one carrier only; width is enabled only when applying a visible stroke. */
export function layerPaintPatch( layer, side, change ) {
	if ( ! isPaintLayer( layer ) ) {
		return {};
	}
	const paint = { ...layerPaint( layer, side ), ...change };
	const field = paintColorField(
		layer,
		side === 'additionalStroke' ? 'stroke' : side
	);
	if ( side === 'additionalStroke' ) {
		return layerPaintPatch( { ...layer, styles: null }, 'stroke', change );
	}
	if ( side === 'stroke' && hasEffectStroke( layer ) ) {
		return {
			styles: {
				...layer.styles,
				stroke: {
					...layer.styles.stroke,
					color: paint.color,
					size:
						layer.styles.stroke.size > 0
							? layer.styles.stroke.size
							: 2,
					gradient:
						paint.type === 'gradient'
							? {
									kind: PAINT_KINDS.includes( paint.kind )
										? paint.kind
										: 'linear',
									angle: Number( paint.angle ) || 0,
									stops: ( paint.stops.length
										? paint.stops
										: defaultPaintStops( paint.color )
									).map( ( s ) => ( { ...s } ) ),
							  }
							: null,
				},
			},
		};
	}
	if ( paint.type !== 'gradient' ) {
		return side === 'stroke'
			? {
					[ field ]: paint.color,
					strokeGradient: null,
					...strokeWidthPatch( layer, paint.color ),
			  }
			: {
					[ field ]: paint.color,
					fillType: paint.type,
					...( paint.type === 'pattern'
						? {
								pattern:
									change.pattern ||
									( layer.pattern !== 'none' &&
										layer.pattern ) ||
									'dots',
								patternData:
									change.patternData === undefined
										? layer.patternData
										: change.patternData,
								patternScale:
									change.patternScale ??
									layer.patternScale ??
									1,
						  }
						: {} ),
					...( layer.penPath
						? {
								penPath: {
									...layer.penPath,
									style: {
										...layer.penPath.style,
										colorMode: 'solid',
									},
								},
						  }
						: {} ),
			  };
	}
	const gradient = {
		kind: PAINT_KINDS.includes( paint.kind ) ? paint.kind : 'linear',
		angle: ( ( ( Number( paint.angle ) || 0 ) % 360 ) + 360 ) % 360,
		stops: ( paint.stops.length
			? paint.stops
			: defaultPaintStops( paint.color )
		).map( ( s ) => ( { ...s } ) ),
	};
	if ( side === 'stroke' ) {
		return {
			strokeGradient: gradient,
			[ field ]: layer[ field ] || gradient.stops[ 0 ].color,
			...strokeWidthPatch( layer, gradient.stops[ 0 ].color ),
		};
	}
	return {
		...( layer.penPath
			? {
					penPath: {
						...layer.penPath,
						style: { ...layer.penPath.style, colorMode: 'solid' },
					},
			  }
			: {} ),
		fillType: 'gradient',
		gradientKind: gradient.kind,
		gradientAngle: gradient.angle,
		gradientStops: gradient.stops,
	};
}

function strokeWidthPatch( layer, color ) {
	const field = layer.type === 'text' ? 'outlineW' : 'strokeW';
	return color && color !== 'transparent' && ! ( layer[ field ] > 0 )
		? { [ field ]: 2 }
		: {};
}

export function paintColorPatch( layer, side, color, index = 0 ) {
	const paint = layerPaint( layer, side );
	if ( paint.type !== 'gradient' || ! paint.stops.length ) {
		return layerPaintPatch( layer, side, {
			type: paint.type === 'pattern' ? 'pattern' : 'solid',
			color,
		} );
	}
	const at = Math.max( 0, Math.min( index, paint.stops.length - 1 ) );
	return layerPaintPatch( layer, side, {
		stops: paint.stops.map( ( s, i ) =>
			i === at ? { ...s, color } : s
		),
	} );
}

export function paintCss( paint ) {
	if ( paint.type !== 'gradient' || ! paint.stops.length ) {
		return paint.color || 'transparent';
	}
	const stops = expandedGradientStops( paint.stops )
		.map( ( s ) => `${ s.color } ${ s.at * 100 }%` )
		.join( ', ' );
	return paint.kind === 'radial'
		? `radial-gradient(circle, ${ stops })`
		: paint.kind === 'angle'
		? `conic-gradient(from ${ paint.angle + 90 }deg, ${ stops })`
		: `linear-gradient(${ paint.angle + 90 }deg, ${ stops })`;
}

/** Paint fields carried by the shape dialog, tool defaults and preview. */
export function shapePaintFields( value ) {
	const result = {};
	for ( const key of [
		'fillType',
		'gradientStops',
		'gradientKind',
		'gradientAngle',
		'strokeGradient',
		'pattern',
		'patternData',
		'patternScale',
	] ) {
		if ( key in value ) {
			result[ key ] = value[ key ];
		}
	}
	return result;
}
