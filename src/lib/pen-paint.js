/** Shared vector paint mesh for canvas and SVG. Cached only after edits. */
import { cleanPenStyle, penSamples, penPointAt, penWidthAt } from './pen-path';
import { offsetPenPath, endpointDirection } from './pen-operations';
import { parsePathAnchors } from './path-edit';
import { parseColor, toHexColor } from './color';
import { createCanvas } from './raster/env';
import { penEnding, penEndingSize } from './pen-endings';
import {
	trimPenPath,
	nibFactor,
	penColorAt,
	penSymmetryMaps,
} from './pen-creative';
const cache = new Map();
const fmt = ( n ) => Math.round( n * 1000 ) / 1000;
// Slight overlap prevents antialias seams between adjacent vector patches.
const extend = ( p, station, amount ) => ( {
	x: p.x + station.normal.y * amount,
	y: p.y - station.normal.x * amount,
} );
const path = ( ps ) =>
	'M' +
	ps.map( ( p ) => `${ fmt( p.x ) },${ fmt( p.y ) }` ).join( 'L' ) +
	'Z';
export const hasPenPaint = ( layer ) =>
	!! (
		layer.fillType !== 'gradient' &&
		layer.penPath &&
		layer.penPath.style.colorMode === 'path' &&
		layer.penPath.style.colors?.length > 1 &&
		layer.penPath.style.kind !== 'fill'
	);
export function penPaintParts( d, value ) {
	const style = cleanPenStyle( value ),
		key = d + '|' + JSON.stringify( style );
	if ( cache.has( key ) ) {
		return cache.get( key );
	}
	const visible = trimPenPath( d, style.trimStart, style.trimEnd ),
		parts = [];
	for ( let copy = 0; copy <= style.parallelCount; copy++ ) {
		const source = copy
			? offsetPenPath( visible, style.parallelGap * copy )
			: visible;
		penSamples( source ).forEach( ( sub, si ) => {
			const n = Math.max(
					16,
					Math.min( 256, Math.ceil( sub.total / 3 ) )
				),
				ts = [
					...new Set( [
						...Array.from( { length: n + 1 }, ( _, i ) => i / n ),
						...style.colors.map( ( c ) => c.t ),
					] ),
				].sort( ( a, b ) => a - b );
			const stations = ts.map( ( t ) => {
				const p = penPointAt( source, t, si ),
					normal = p.normal,
					body =
						( penWidthAt( t, style, sub.closed ) *
							( style.kind === 'dotted'
								? 1
								: nibFactor( normal, style ) ) ) /
						2;
				const band =
					style.kind === 'double'
						? style.width * 0.32 + body * 0.3
						: body;
				let half = band + 2;
				if ( ! sub.closed ) {
					const headLength = Math.min(
						sub.total * 0.4,
						style.width * style.headLength
					);
					if (
						( style.arrowStart &&
							t * sub.total < headLength + 1 ) ||
						( style.arrowEnd &&
							( 1 - t ) * sub.total < headLength + 1 )
					) {
						half = Math.max(
							half,
							( style.width * style.headWidth ) / 2 + 1
						);
					}
				}
				const shift =
					style.kind === 'dotted'
						? 0
						: ( style.bias / 100 ) *
						  body *
						  ( style.kind === 'double' ? 0.3 : 1 );
				return {
					...p,
					left: {
						x: p.x + normal.x * ( half + shift ),
						y: p.y + normal.y * ( half + shift ),
					},
					right: {
						x: p.x + normal.x * ( -half + shift ),
						y: p.y + normal.y * ( -half + shift ),
					},
					half,
					color: penColorAt( style.colors, t ),
				};
			} );
			for ( let i = 1; i < stations.length; i++ ) {
				const a = stations[ i - 1 ],
					b = stations[ i ];
				parts.push( {
					points: [
						extend( a.left, a, -0.8 ),
						extend( b.left, b, 0.8 ),
						extend( b.right, b, 0.8 ),
						extend( a.right, a, -0.8 ),
					],
					from: a,
					to: b,
					c0: a.color,
					c1: b.color,
				} );
			}
			if ( ! sub.closed ) {
				const native = parsePathAnchors( source )[ sub.sourceIndex ];
				for ( const end of [ false, true ] ) {
					const { type, length } = penEndingSize( sub, style, end );
					if (
						type === 'none' ||
						( style.headFollow === 'curve' &&
							[ 'arrow', 'needle', 'open' ].includes( type ) )
					) {
						continue;
					}
					const tip = end ? sub.pts.at( -1 ) : sub.pts[ 0 ],
						u = endpointDirection( native, end ),
						back = {
							x: tip.x - u.x * length,
							y: tip.y - u.y * length,
						};
					const lo = end ? 1 - length / sub.total : 0,
						hi = end ? 1 : length / sub.total;
					const stops = [
						{ t: lo, color: penColorAt( style.colors, lo ) },
						...style.colors.filter( ( c ) => c.t > lo && c.t < hi ),
						{ t: hi, color: penColorAt( style.colors, hi ) },
					].map( ( c ) => ( {
						t: ( c.t - lo ) / ( hi - lo ),
						color: c.color,
					} ) );
					for ( const shape of parsePathAnchors(
						penEnding( sub, native, style, end )
					) || [] ) {
						parts.push( {
							points: shape.anchors.map( ( a ) => ( {
								x: a.x,
								y: a.y,
							} ) ),
							from: end ? back : tip,
							to: end ? tip : back,
							c0: stops[ 0 ].color,
							c1: stops.at( -1 ).color,
							stops,
						} );
					}
				}
				for ( const [ p, sign ] of [
					[ stations[ 0 ], -1 ],
					[ stations.at( -1 ), 1 ],
				] ) {
					const reach = Math.max(
							p.half,
							penWidthAt( p.t, style, false ) / 2 + 2
						),
						dx = p.normal.y * reach * sign,
						dy = -p.normal.x * reach * sign;
					parts.push( {
						points: [
							p.left,
							p.right,
							{ x: p.right.x + dx, y: p.right.y + dy },
							{ x: p.left.x + dx, y: p.left.y + dy },
						],
						from: p,
						to: { x: p.x + dx, y: p.y + dy },
						c0: p.color,
						c1: p.color,
					} );
				}
			}
		} );
	}
	if ( style.symmetry !== 'off' ) {
		// Every symmetric copy (mirror, both axes, radial, kaleidoscope).
		const own = parts.slice();
		for ( const { map } of penSymmetryMaps( style ) ) {
			parts.push(
				...own.map( ( part ) => ( {
					...part,
					points: part.points.map( map ),
					from: map( part.from ),
					to: map( part.to ),
				} ) )
			);
		}
	}
	const result = parts.map( ( part ) => ( {
		...part,
		d: path( part.points ),
	} ) );
	cache.set( key, result );
	if ( cache.size > 24 ) {
		cache.delete( cache.keys().next().value );
	}
	return result;
}
// Separate color and coverage so overlapping patches never darken translucent stops.
export const penPaintHasAlpha = ( style ) =>
	style.colors.some( ( c ) => parseColor( c.color ).a < 1 );
export function penPaintStops( part, alpha = false ) {
	return (
		part.stops || [
			{ t: 0, color: part.c0 },
			{ t: 1, color: part.c1 },
		]
	).map( ( stop ) => {
		const c = parseColor( stop.color ),
			v = c.a * 255;
		return {
			t: stop.t,
			color: alpha
				? toHexColor( v, v, v, 1 )
				: toHexColor( c.r, c.g, c.b, 1 ),
		};
	} );
}
function paintParts( ctx, parts, trace, alpha = false ) {
	for ( const part of parts ) {
		const gradient = ctx.createLinearGradient(
			part.from.x,
			part.from.y,
			part.to.x,
			part.to.y
		);
		for ( const stop of penPaintStops( part, alpha ) ) {
			gradient.addColorStop( stop.t, stop.color );
		}
		ctx.fillStyle = gradient;
		ctx.beginPath();
		trace( ctx, part.d );
		ctx.fill();
	}
}
const translucentCache = new Map();
function translucentPaint( layer, parts, trace ) {
	const key =
		layer.penPath.d +
		'|' +
		JSON.stringify( layer.penPath.style ) +
		'|' +
		layer.w +
		'|' +
		layer.h;
	if ( translucentCache.has( key ) ) {
		return translucentCache.get( key );
	}
	// Only the smooth color field is rasterized; the final outline stays a native clip.
	const scale = Math.min(
		1,
		2048 / Math.max( layer.w, layer.h ),
		Math.sqrt( 1500000 / ( layer.w * layer.h ) )
	);
	const canvas = createCanvas( layer.w * scale, layer.h * scale ),
		mask = createCanvas( canvas.width, canvas.height );
	const color = canvas.getContext( '2d' ),
		alpha = mask.getContext( '2d' );
	for ( const c of [ color, alpha ] ) {
		c.scale(
			canvas.width / layer.penPath.w,
			canvas.height / layer.penPath.h
		);
	}
	paintParts( color, parts, trace );
	paintParts( alpha, parts, trace, true );
	const pixels = color.getImageData( 0, 0, canvas.width, canvas.height ),
		coverage = alpha.getImageData( 0, 0, canvas.width, canvas.height ).data;
	for ( let i = 0; i < pixels.data.length; i += 4 ) {
		pixels.data[ i + 3 ] = ( coverage[ i ] * coverage[ i + 3 ] ) / 255;
	}
	color.putImageData( pixels, 0, 0 );
	translucentCache.set( key, canvas );
	if ( translucentCache.size > 4 ) {
		translucentCache.delete( translucentCache.keys().next().value );
	}
	return canvas;
}
export function paintPenGradient( ctx, layer, trace ) {
	ctx.save();
	ctx.clip( layer.fillRule === 'evenodd' ? 'evenodd' : 'nonzero' );
	const parts = penPaintParts( layer.penPath.d, layer.penPath.style );
	if ( penPaintHasAlpha( layer.penPath.style ) ) {
		ctx.drawImage(
			translucentPaint( layer, parts, trace ),
			0,
			0,
			layer.w,
			layer.h
		);
	} else {
		ctx.scale( layer.w / layer.penPath.w, layer.h / layer.penPath.h );
		paintParts( ctx, parts, trace );
	}
	ctx.restore();
}
