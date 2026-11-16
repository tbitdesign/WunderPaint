/** Shared gradient-layer state for the tool, panel and canvas grips. */
import { reverseGradientStops } from './gradient-ramp';
import {
	isGradientField,
	normalizeFreeform,
	normalizeGradientMesh,
} from './gradient-fields';
export { gradientColorAt } from './gradient-ramp';

export function gradientLayerOf( state ) {
	if ( state.selectedIds?.length !== 1 ) {
		return null;
	}
	return (
		state.layers.find(
			( layer ) =>
				layer.id === state.activeId && layer.type === 'gradient'
		) || null
	);
}

/** Stops or spatial color points, in the same order as the canvas handles. */
export function gradientColorItems( value ) {
	const paint = gradientPaint( value );
	return paint.kind === 'mesh'
		? paint.mesh.nodes
		: paint.kind === 'freeform'
		? paint.freeform.points
		: paint.stops;
}

export function gradientColorPatch( value, color, index = 0 ) {
	const paint = gradientPaint( value );
	const items = gradientColorItems( paint );
	const selected = Math.max( 0, Math.min( index, items.length - 1 ) );
	const next = items.map( ( item, i ) =>
		i === selected ? { ...item, color } : item
	);
	return paint.kind === 'mesh'
		? { mesh: { ...paint.mesh, nodes: next } }
		: paint.kind === 'freeform'
		? { freeform: { ...paint.freeform, points: next } }
		: { stops: next };
}

export function gradientPaint( value ) {
	const kind = value.kind || 'linear';
	const stops = value.reverse
		? reverseGradientStops( value.stops || [] )
		: ( value.stops || [] ).map( ( s ) => ( { ...s } ) );
	return {
		kind,
		stops,
		spread: value.spread || 'pad',
		...( kind === 'freeform'
			? { freeform: normalizeFreeform( value.freeform, stops ) }
			: {} ),
		...( kind === 'mesh'
			? { mesh: normalizeGradientMesh( value.mesh, stops ) }
			: {} ),
	};
}

export function gradientGeometry( layer ) {
	const from = layer.from || { x: layer.x, y: layer.y },
		to = layer.to || { x: layer.x + layer.w, y: layer.y + layer.h },
		linear = layer.kind !== 'radial' && layer.kind !== 'angle',
		center = linear
			? { x: ( from.x + to.x ) / 2, y: ( from.y + to.y ) / 2 }
			: from;
	return {
		angle:
			( ( Math.atan2( to.y - from.y, to.x - from.x ) * 180 ) / Math.PI +
				360 ) %
			360,
		length: Math.max( 1, Math.hypot( to.x - from.x, to.y - from.y ) ),
		cx: ( ( center.x - layer.x ) / Math.max( 1, layer.w ) ) * 100,
		cy: ( ( center.y - layer.y ) / Math.max( 1, layer.h ) ) * 100,
	};
}

export function gradientGeometryPatch( layer, change ) {
	const g = { ...gradientGeometry( layer ), ...change },
		rad = ( g.angle * Math.PI ) / 180,
		cx = layer.x + ( g.cx / 100 ) * layer.w,
		cy = layer.y + ( g.cy / 100 ) * layer.h,
		dx = Math.cos( rad ) * Math.max( 1, g.length ),
		dy = Math.sin( rad ) * Math.max( 1, g.length );
	return layer.kind === 'radial' || layer.kind === 'angle'
		? { from: { x: cx, y: cy }, to: { x: cx + dx, y: cy + dy } }
		: {
				from: { x: cx - dx / 2, y: cy - dy / 2 },
				to: { x: cx + dx / 2, y: cy + dy / 2 },
		  };
}

export function gradientKindPatch( layer, kind ) {
	if ( isGradientField( kind ) ) {
		return { kind, ...gradientPaint( { ...layer, kind } ) };
	}
	if ( isGradientField( layer.kind ) ) {
		return { kind };
	}

	if ( kind === layer.kind ) {
		return { kind };
	}
	const g = gradientGeometry( layer ),
		wasLinear = layer.kind === 'linear',
		isLinear = kind === 'linear';
	return {
		kind,
		...gradientGeometryPatch(
			{ ...layer, kind },
			{
				...g,
				length:
					g.length *
					( wasLinear && ! isLinear
						? 0.5
						: ! wasLinear && isLinear
						? 2
						: 1 ),
			}
		),
	};
}

/** Stored endpoints precede the layer's rotation/flip, just like its renderer. */
export function gradientPoint( layer, point, inverse = false ) {
	const cx = layer.x + layer.w / 2,
		cy = layer.y + layer.h / 2,
		a = ( ( ( layer.rot || 0 ) * Math.PI ) / 180 ) * ( inverse ? -1 : 1 ),
		fx = layer.flipX ? -1 : 1,
		fy = layer.flipY ? -1 : 1;
	let x = point.x - cx,
		y = point.y - cy;
	if ( ! inverse ) {
		x *= fx;
		y *= fy;
	}
	const rx = x * Math.cos( a ) - y * Math.sin( a ),
		ryy = x * Math.sin( a ) + y * Math.cos( a );
	return {
		x: cx + rx * ( inverse ? fx : 1 ),
		y: cy + ryy * ( inverse ? fy : 1 ),
	};
}
