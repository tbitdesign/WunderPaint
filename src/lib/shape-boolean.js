/**
 * Boolean operations and outline stroke for shape layers (v1.430).
 *
 * Every shape becomes a polygon first: its outline (the same path data
 * the exports write) sampled at one pixel and moved into document space
 * with the layer's flips and rotation. polybooljs then unites, subtracts,
 * intersects or excludes, and the result comes back as one path in a
 * tight box, holes wound the other way round so the canvas nonzero fill
 * leaves them open. Curves become polylines on the way: the result is a
 * polygon path the anchor editor can edit.
 *
 * The outline stroke is the union of capsules along the flattened
 * outline (round joins and caps, like the renderer), split into dashes
 * when the stroke is dashed, and cut by the shape for an inside or
 * outside stroke - exactly what the canvas paints.
 */

import PolyBool from 'polybooljs';

import { shapeToPathD } from './shape-path';
import { flattenPathD } from './text-path';
import { strokeAlignOf } from './stroke-align';
import { dashPattern } from './raster/shapes';

export const BOOLEAN_MODES = [ 'unite', 'subtract', 'intersect', 'exclude' ];

const POLYBOOL_OP = {
	unite: 'union',
	subtract: 'difference',
	intersect: 'intersect',
	exclude: 'xor',
};

/** Two decimals keep the path short without moving anything visibly. */
const n = ( v ) => {
	const r = Math.round( v * 100 ) / 100;
	return Object.is( r, -0 ) ? 0 : r;
};

const same = ( a, b ) =>
	Math.abs( a[ 0 ] - b[ 0 ] ) < 1e-6 && Math.abs( a[ 1 ] - b[ 1 ] ) < 1e-6;

/**
 * Layer-local point -> document coordinates: flips first, then the
 * rotation about the box centre (the inverse of the hit-test mapping).
 *
 * @param {Object}                   layer Shape layer.
 * @param {{x: number, y: number}}   p     Local point.
 * @return {number[]} [ x, y ] in document space.
 */
function toDoc( layer, p ) {
	let x = p.x;
	let y = p.y;
	if ( layer.flipX ) {
		x = layer.w - x;
	}
	if ( layer.flipY ) {
		y = layer.h - y;
	}
	x += layer.x;
	y += layer.y;
	if ( layer.rot ) {
		const cx = layer.x + layer.w / 2;
		const cy = layer.y + layer.h / 2;
		const a = ( layer.rot * Math.PI ) / 180;
		const cos = Math.cos( a );
		const sin = Math.sin( a );
		const dx = x - cx;
		const dy = y - cy;
		x = cx + dx * cos - dy * sin;
		y = cy + dx * sin + dy * cos;
	}
	return [ x, y ];
}

/** Drop repeated points and the closing duplicate from a ring. */
function cleanRing( ring ) {
	const out = [];
	for ( const p of ring ) {
		const last = out[ out.length - 1 ];
		if ( ! last || ! same( last, p ) ) {
			out.push( p );
		}
	}
	if ( out.length > 1 && same( out[ 0 ], out[ out.length - 1 ] ) ) {
		out.pop();
	}
	return out;
}

/**
 * A layer's outline as flattened polylines in document space, each with
 * a `closed` flag (a pen stroke may be open; every shape is closed).
 *
 * @param {Object} layer Shape layer.
 * @param {number} step  Sampling step for curves, in px.
 * @return {Array<{pts: number[][], closed: boolean}>} Polylines.
 */
export function layerOutlines( layer, step = 1 ) {
	if (
		! layer ||
		'shape' !== layer.type ||
		'line' === layer.shape ||
		layer.quad
	) {
		return [];
	}
	const d = shapeToPathD( layer );
	if ( ! d ) {
		return [];
	}
	return flattenPathD( d, step )
		.map( ( sub ) => {
			const raw = sub.map( ( p ) => toDoc( layer, p ) );
			const closed =
				raw.length > 2 && same( raw[ 0 ], raw[ raw.length - 1 ] );
			return { pts: cleanRing( raw ), closed };
		} )
		.filter( ( o ) => o.pts.length >= 2 );
}

/**
 * The polybool polygon of a layer, or null when it has no area.
 *
 * @param {Object} layer Shape layer.
 * @param {number} step  Sampling step for curves, in px.
 * @return {?Object} { regions, inverted }.
 */
export function layerPolygon( layer, step = 1 ) {
	const regions = layerOutlines( layer, step )
		.map( ( o ) => o.pts )
		.filter( ( r ) => r.length >= 3 );
	return regions.length ? { regions, inverted: false } : null;
}

/** Shoelace area, positive for one winding and negative for the other. */
export function ringArea( ring ) {
	let a = 0;
	for ( let i = 0, j = ring.length - 1; i < ring.length; j = i++ ) {
		a += ring[ j ][ 0 ] * ring[ i ][ 1 ] - ring[ i ][ 0 ] * ring[ j ][ 1 ];
	}
	return a / 2;
}

/**
 * A polybool polygon -> { pathD, x, y, w, h }: outer rings wound one way
 * and holes the other (so a nonzero fill leaves them open), the path in
 * layer-local coordinates of a tight box.
 *
 * @param {?Object} poly Polybool polygon.
 * @return {?Object} The shape record, or null when nothing is left.
 */
export function polygonToShape( poly ) {
	if ( ! poly || ! poly.regions?.length ) {
		return null;
	}
	const gj = PolyBool.polygonToGeoJSON( poly );
	const polys =
		'Polygon' === gj.type
			? [ gj.coordinates ]
			: 'MultiPolygon' === gj.type
			? gj.coordinates
			: [];
	const rings = [];
	for ( const rs of polys ) {
		rs.forEach( ( raw, i ) => {
			const ring = cleanRing( raw );
			if ( ring.length < 3 ) {
				return;
			}
			const area = ringArea( ring );
			if ( Math.abs( area ) < 1e-6 ) {
				return;
			}
			const outer = 0 === i;
			rings.push( outer === area > 0 ? ring : ring.slice().reverse() );
		} );
	}
	if ( ! rings.length ) {
		return null;
	}
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for ( const r of rings ) {
		for ( const [ px, py ] of r ) {
			minX = Math.min( minX, px );
			minY = Math.min( minY, py );
			maxX = Math.max( maxX, px );
			maxY = Math.max( maxY, py );
		}
	}
	const x = Math.floor( minX );
	const y = Math.floor( minY );
	const w = Math.max( 1, Math.ceil( maxX ) - x );
	const h = Math.max( 1, Math.ceil( maxY ) - y );
	const pathD = rings
		.map(
			( r ) =>
				'M ' +
				r
					.map(
						( [ px, py ], i ) =>
							`${ i ? 'L ' : '' }${ n( px - x ) } ${ n(
								py - y
							) }`
					)
					.join( ' ' ) +
				' Z'
		)
		.join( ' ' );
	return { pathD, x, y, w, h };
}

/**
 * Combine two or more shape layers. The first layer is the base: for
 * `subtract` the others are taken out of it, otherwise the layers fold
 * left to right.
 *
 * @param {Object[]} layers Shape layers, base first.
 * @param {string}   mode   unite | subtract | intersect | exclude.
 * @param {number}   step   Sampling step for curves, in px.
 * @return {?Object} { pathD, x, y, w, h } or null.
 */
export function combineShapes( layers, mode, step = 1 ) {
	const op = POLYBOOL_OP[ mode ];
	if ( ! op ) {
		return null;
	}
	const polys = layers
		.map( ( l ) => layerPolygon( l, step ) )
		.filter( Boolean );
	if ( polys.length < 2 ) {
		return null;
	}
	let acc = polys[ 0 ];
	for ( let i = 1; i < polys.length; i++ ) {
		acc = PolyBool[ op ]( acc, polys[ i ] );
	}
	return polygonToShape( acc );
}

/* ----------------------------- outline stroke ----------------------------- */

const CIRCLE_N = 16;

const circleRing = ( [ x, y ], r ) => {
	const pts = [];
	for ( let i = 0; i < CIRCLE_N; i++ ) {
		const a = ( i / CIRCLE_N ) * 2 * Math.PI;
		pts.push( [ x + r * Math.cos( a ), y + r * Math.sin( a ) ] );
	}
	return pts;
};

/**
 * Drop points that stay within `tol` of the line between their
 * neighbours: a 1px sampled circle has hundreds of points, the union
 * needs a few dozen.
 */
function simplify( pts, tol ) {
	if ( pts.length < 3 ) {
		return pts;
	}
	const out = [ pts[ 0 ] ];
	for ( let i = 1; i < pts.length - 1; i++ ) {
		const a = out[ out.length - 1 ];
		const b = pts[ i + 1 ];
		const p = pts[ i ];
		const len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		const dist = len
			? Math.abs(
					( b[ 0 ] - a[ 0 ] ) * ( a[ 1 ] - p[ 1 ] ) -
						( a[ 0 ] - p[ 0 ] ) * ( b[ 1 ] - a[ 1 ] )
			  ) / len
			: Math.hypot( p[ 0 ] - a[ 0 ], p[ 1 ] - a[ 1 ] );
		if ( dist > tol ) {
			out.push( p );
		}
	}
	out.push( pts[ pts.length - 1 ] );
	return out;
}

/** Split a polyline into the "on" pieces of a dash pattern. */
function dashPieces( pts, pattern ) {
	const pieces = [];
	let cur = [ pts[ 0 ] ];
	let on = true;
	let idx = 0;
	let remain = Math.max( 0.01, pattern[ 0 ] );
	for ( let i = 0; i + 1 < pts.length; i++ ) {
		let a = pts[ i ];
		const b = pts[ i + 1 ];
		let len = Math.hypot( b[ 0 ] - a[ 0 ], b[ 1 ] - a[ 1 ] );
		while ( len > 1e-9 ) {
			if ( remain >= len ) {
				remain -= len;
				if ( on ) {
					cur.push( b );
				}
				len = 0;
			} else {
				const t = remain / len;
				const m = [
					a[ 0 ] + ( b[ 0 ] - a[ 0 ] ) * t,
					a[ 1 ] + ( b[ 1 ] - a[ 1 ] ) * t,
				];
				if ( on ) {
					cur.push( m );
					pieces.push( cur );
					cur = [];
				} else {
					cur = [ m ];
				}
				on = ! on;
				idx = ( idx + 1 ) % pattern.length;
				remain = Math.max( 0.01, pattern[ idx ] );
				len -= Math.hypot( m[ 0 ] - a[ 0 ], m[ 1 ] - a[ 1 ] );
				a = m;
			}
		}
	}
	if ( on && cur.length > 1 ) {
		pieces.push( cur );
	}
	return pieces;
}

/**
 * The capsules of one polyline: a rectangle per segment, a circle at
 * every end and at every joint that turns enough to leave a notch.
 */
function capsules( pts, r, closed ) {
	const out = [];
	const count = pts.length;
	const segs = closed ? count : count - 1;
	for ( let i = 0; i < segs; i++ ) {
		const a = pts[ i ];
		const b = pts[ ( i + 1 ) % count ];
		const dx = b[ 0 ] - a[ 0 ];
		const dy = b[ 1 ] - a[ 1 ];
		const len = Math.hypot( dx, dy );
		if ( len < 1e-6 ) {
			continue;
		}
		const nx = ( -dy / len ) * r;
		const ny = ( dx / len ) * r;
		out.push( [
			[ a[ 0 ] + nx, a[ 1 ] + ny ],
			[ b[ 0 ] + nx, b[ 1 ] + ny ],
			[ b[ 0 ] - nx, b[ 1 ] - ny ],
			[ a[ 0 ] - nx, a[ 1 ] - ny ],
		] );
	}
	for ( let i = 0; i < count; i++ ) {
		const end = ! closed && ( 0 === i || i === count - 1 );
		if ( ! end ) {
			const p = pts[ ( i - 1 + count ) % count ];
			const q = pts[ i ];
			const s = pts[ ( i + 1 ) % count ];
			const a1 = Math.atan2( q[ 1 ] - p[ 1 ], q[ 0 ] - p[ 0 ] );
			const a2 = Math.atan2( s[ 1 ] - q[ 1 ], s[ 0 ] - q[ 0 ] );
			let turn = Math.abs( a2 - a1 );
			if ( turn > Math.PI ) {
				turn = 2 * Math.PI - turn;
			}
			// Below eight degrees the neighbouring rectangles overlap
			// enough that the notch is thinner than a hundredth of a px.
			if ( turn < 0.14 ) {
				continue;
			}
		}
		out.push( circleRing( pts[ i ], r ) );
	}
	return out;
}

/** Union of many small regions through polybool's segment API. */
function unionAll( regions ) {
	let seg = null;
	for ( const region of regions ) {
		const s = PolyBool.segments( { regions: [ region ], inverted: false } );
		seg = seg ? PolyBool.selectUnion( PolyBool.combine( seg, s ) ) : s;
	}
	return seg ? PolyBool.polygon( seg ) : null;
}

/**
 * A band of radius `r` along every outline of the layer, as a polybool
 * polygon (the union of capsules). The stroke outline and the path
 * offset both start from it.
 *
 * @param {Array}  outlines From layerOutlines().
 * @param {number} r        Band radius in px.
 * @param {?Array} pattern  Dash pattern, or null for a solid band.
 * @return {?Object} Polybool polygon.
 */
function outlineBand( outlines, r, pattern ) {
	const regions = [];
	for ( const { pts, closed } of outlines ) {
		const line = simplify( pts, 0.25 );
		if ( pattern ) {
			const walk = closed ? [ ...line, line[ 0 ] ] : line;
			for ( const piece of dashPieces( walk, pattern ) ) {
				regions.push( ...capsules( piece, r, false ) );
			}
		} else {
			regions.push( ...capsules( line, r, closed ) );
		}
	}
	return unionAll( regions );
}

/**
 * The shape grown or shrunk by `d` px (Illustrator's Offset Path): grown
 * = the body plus a band of that radius, shrunk = the body minus it.
 * Outer corners come out rounded, inner corners stay sharp, which is
 * what a true offset does.
 *
 * @param {Object} layer Shape layer with an area.
 * @param {number} d     Distance in px, negative shrinks.
 * @param {number} step  Sampling step for curves, in px.
 * @return {?Object} { pathD, x, y, w, h } or null.
 */
export function offsetShape( layer, d, step = 1 ) {
	const dist = Number( d ) || 0;
	if ( ! dist ) {
		return null;
	}
	const outlines = layerOutlines( layer, step );
	const body = layerPolygon( layer, step );
	if ( ! outlines.length || ! body ) {
		return null;
	}
	const band = outlineBand( outlines, Math.abs( dist ), null );
	if ( ! band ) {
		return null;
	}
	return polygonToShape(
		dist > 0
			? PolyBool.union( body, band )
			: PolyBool.difference( body, band )
	);
}

/**
 * The stroke of a shape as a filled region.
 *
 * @param {Object} layer Shape layer with a stroke.
 * @param {number} step  Sampling step for curves, in px.
 * @return {?Object} { pathD, x, y, w, h } or null.
 */
export function strokeOutline( layer, step = 1 ) {
	const sw = Number( layer?.strokeW ) || 0;
	if ( ! layer?.stroke || sw <= 0 ) {
		return null;
	}
	const outlines = layerOutlines( layer, step );
	if ( ! outlines.length ) {
		return null;
	}
	const align = strokeAlignOf( layer );
	const r = 'center' === align ? sw / 2 : sw;
	const pattern = dashPattern(
		layer.strokeDash,
		sw,
		layer.strokeDashLen,
		layer.strokeDashGap
	);
	let poly = outlineBand( outlines, r, pattern );
	if ( poly && 'center' !== align ) {
		const body = layerPolygon( layer, step );
		if ( body ) {
			poly =
				'inside' === align
					? PolyBool.intersect( poly, body )
					: PolyBool.difference( poly, body );
		}
	}
	return polygonToShape( poly );
}
