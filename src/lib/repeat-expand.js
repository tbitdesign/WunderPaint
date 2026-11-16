/**
 * Expand a Repeat layer into real layers (v1.431).
 *
 * The one place the copies become layers, used by Bake and by the SVG
 * export, so what the canvas stamps and what leaves the editor as vectors
 * come from the same placements (lib/repeat-layout.js).
 *
 * Colour progression: text and shapes have their fill (and stroke, and
 * gradient stops, and rich-text spans) mixed towards the target; pixel
 * layers keep their pixels - tinting them needs a raster pass that Bake
 * can run and a synchronous export cannot, so the export leaves the tint
 * off and says so through `pixelTintDropped`.
 */
import { cloneLayerTree, offsetLayer } from '../store/doc-ops';
import { unitBoxOf } from '../store/repeat-sync';
import { rotateAbout } from './pivot';
import { parseColor } from './color';
import { scaleLeafPatch, leafSnapshot } from './selection-units';
import { repeatPlacements } from './repeat-layout';

const PIXEL_TYPES = [ 'image', 'raster', 'smart' ];
const clamp = ( v, lo, hi ) => Math.min( hi, Math.max( lo, v ) );
const hex2 = ( n ) =>
	Math.round( clamp( n, 0, 255 ) )
		.toString( 16 )
		.padStart( 2, '0' );

/**
 * Mix a CSS colour towards another; anything that does not parse (none,
 * transparent, a gradient id) comes back untouched.
 *
 * @param {string} from   Source colour.
 * @param {string} to     Target colour.
 * @param {number} amount 0..1.
 * @return {string} Colour.
 */
export function mixColor( from, to, amount ) {
	const f = clamp( Number( amount ) || 0, 0, 1 );
	if (
		f <= 0 ||
		'string' !== typeof from ||
		/^(transparent|none)$/i.test( from.trim() )
	) {
		return from;
	}
	const a = parseColor( from );
	const b = parseColor( to );
	if ( ! a || ! b ) {
		return from;
	}
	const r = a.r + ( b.r - a.r ) * f;
	const g = a.g + ( b.g - a.g ) * f;
	const bl = a.b + ( b.b - a.b ) * f;
	const alpha = a.a ?? 1;
	if ( alpha < 1 ) {
		return `rgba(${ Math.round( r ) }, ${ Math.round( g ) }, ${ Math.round(
			bl
		) }, ${ alpha })`;
	}
	return `#${ hex2( r ) }${ hex2( g ) }${ hex2( bl ) }`;
}

/** Colour progression on one leaf: fill, stroke, text colour, gradient stops, spans. */
function tintLeaf( leaf, target, amount ) {
	const next = { ...leaf };
	if ( 'string' === typeof leaf.fill ) {
		next.fill = mixColor( leaf.fill, target, amount );
	}
	if ( 'string' === typeof leaf.stroke ) {
		next.stroke = mixColor( leaf.stroke, target, amount );
	}
	if ( 'string' === typeof leaf.outlineColor ) {
		next.outlineColor = mixColor( leaf.outlineColor, target, amount );
	}
	if ( leaf.strokeGradient?.stops ) {
		next.strokeGradient = {
			...leaf.strokeGradient,
			stops: leaf.strokeGradient.stops.map( ( s ) => ( {
				...s,
				color: mixColor( s.color, target, amount ),
			} ) ),
		};
	}
	if ( leaf.penPath?.style?.colors ) {
		next.penPath = {
			...leaf.penPath,
			style: {
				...leaf.penPath.style,
				colors: leaf.penPath.style.colors.map( ( s ) => ( {
					...s,
					color: mixColor( s.color, target, amount ),
				} ) ),
			},
		};
	}
	if ( 'string' === typeof leaf.color ) {
		next.color = mixColor( leaf.color, target, amount );
	}
	if ( Array.isArray( leaf.gradientStops ) ) {
		next.gradientStops = leaf.gradientStops.map( ( s ) => ( {
			...s,
			color: mixColor( s.color, target, amount ),
		} ) );
	}
	if ( Array.isArray( leaf.stops ) ) {
		next.stops = leaf.stops.map( ( s ) => ( {
			...s,
			color: mixColor( s.color, target, amount ),
		} ) );
	}
	if ( Array.isArray( leaf.spans ) ) {
		next.spans = leaf.spans.map( ( run ) =>
			run?.s?.color
				? {
						...run,
						s: {
							...run.s,
							color: mixColor( run.s.color, target, amount ),
						},
				  }
				: run
		);
	}
	return next;
}

/**
 * The copies of a Repeat layer as real layers.
 *
 * @param {Array}  layers      Flat layer list holding source and Repeat layer.
 * @param {Object} repeatLayer The Repeat layer.
 * @param {Object} [opts]      { tintPixels( leaf, target, amount ) -> leaf } optional raster tint.
 * @return {Object} { copies, rootIds, placements, pixelTintDropped }
 */
export function expandRepeat( layers, repeatLayer, opts = {} ) {
	const source = ( layers || [] ).find(
		( l ) => l.id === repeatLayer?.sourceId
	);
	if ( ! source || 'repeat' === source.type ) {
		return {
			copies: [],
			rootIds: [],
			placements: [],
			pixelTintDropped: false,
		};
	}
	const box = unitBoxOf( layers, source );
	const placements = repeatPlacements(
		box,
		repeatLayer.rule,
		repeatLayer.progression
	);
	const cx = box.x + box.w / 2;
	const cy = box.y + box.h / 2;
	const colorOn = !! repeatLayer.progression?.color?.on;
	const target = repeatLayer.progression?.color?.end || '#000000';
	const copies = [];
	const rootIds = [];
	let pixelTintDropped = false;
	placements.forEach( ( p, k ) => {
		const tint = p.paintColor || target;
		const amount = p.paintColor ? 1 : p.tint;
		const paintAlpha = p.paintColor ? parseColor( p.paintColor ).a : 1;
		const { copies: unit, idMap } = cloneLayerTree( layers, [ source.id ] );
		const rootId = idMap.get( source.id );
		const ccx = cx + p.dx;
		const ccy = cy + p.dy;
		for ( const l of unit ) {
			let n = offsetLayer( l, p.dx, p.dy );
			if ( 'group' !== n.type ) {
				if ( 1 !== p.scale ) {
					n = {
						...n,
						...scaleLeafPatch(
							leafSnapshot( n ),
							p.scale,
							ccx,
							ccy
						),
					};
				}
				if ( p.rot ) {
					n = {
						...n,
						...rotateAbout( n, { x: ccx, y: ccy }, p.rot ),
					};
				}
				if ( colorOn && amount > 0 ) {
					if ( PIXEL_TYPES.includes( n.type ) ) {
						if ( opts.tintPixels ) {
							n = opts.tintPixels( n, tint, amount ) || n;
						} else {
							pixelTintDropped = true;
						}
					} else {
						n = tintLeaf( n, tint, amount );
					}
				}
			}
			if ( n.id === rootId ) {
				n = {
					...n,
					name: `${ source.name } ${ k + 2 }`,
					opacity: clamp(
						( n.opacity ?? 1 ) * p.opacity * paintAlpha,
						0,
						1
					),
				};
			}
			copies.push( n );
		}
		rootIds.push( rootId );
	} );
	return { copies, rootIds, placements, pixelTintDropped };
}
