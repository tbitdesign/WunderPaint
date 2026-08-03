/**
 * Parametric shape -> editable path data (v1.210.0). A shape layer is either
 * "parametric" (a `shape` keyword like ellipse/star/polygon that the renderer
 * draws from maths in drawShape) or a "path" shape (layer-local `pathD`, the
 * pen-tool / icon form that the anchor editor can edit). This module bakes the
 * former into the latter so ANY inserted shape becomes node-editable, and so
 * "Text in Shape" has an outline to flow inside.
 *
 * The emitted geometry mirrors drawShape() exactly (same centre/radii/vertex
 * maths); arcs are written as SVG `A` commands and handed to normalizePathD,
 * which turns them into the M/L/C/Q/Z the anchor editor and tracePathD expect.
 */

import { cornerRadii } from './corner-radii';
import {
	polygonVertices,
	rectVertices,
	roundedPolyCommands,
	commandsToPathD,
} from './corner-geometry';
import { normalizePathD } from './path.js';

const n = ( v ) => {
	const r = Math.round( v * 1000 ) / 1000;
	return Object.is( r, -0 ) ? '0' : String( r );
};

/**
 * Regular polygon or star, matching drawShape - including rounded corners
 * and corner smoothing (v1.368), which both come from the shared geometry
 * helper so the canvas and this exporter cannot drift apart.
 */
function ringPath( kind, sides, w, h, inner, radius, smoothing ) {
	const pts = polygonVertices( kind, w, h, sides, inner );
	return commandsToPathD( roundedPolyCommands( pts, radius, smoothing ), n );
}

/**
 * Does this layer have parametric geometry we can expand into a path?
 * A `line` has no fillable area, and a layer that already carries `pathD`
 * (pen shape, icon) is a path already.
 *
 * @param {Object} layer Shape layer.
 * @return {boolean} Whether shapeToPathD would produce a usable outline.
 */
export function isParametricShape( layer ) {
	return (
		!! layer &&
		'shape' === layer.type &&
		! layer.pathD &&
		! layer.quad &&
		'line' !== layer.shape
	);
}

/**
 * Layer-local path data (0..w, 0..h) for a shape layer, normalized to
 * M/L/C/Q/Z. Returns the existing `pathD` untouched for path shapes, and
 * null for shapes with no area (line).
 *
 * @param {Object} layer Shape layer.
 * @return {?string} Normalized layer-local path data.
 */
export function shapeToPathD( layer ) {
	if ( ! layer ) {
		return null;
	}
	if ( layer.pathD ) {
		return layer.pathD;
	}
	const w = Math.max( 1, layer.w || 0 );
	const h = Math.max( 1, layer.h || 0 );
	const rx = w / 2;
	const ry = h / 2;
	const cy = h / 2;
	let d;
	switch ( layer.shape ) {
		case 'line':
			return null;
		case 'ellipse':
			// Two half-arcs make a full ellipse; large-arc/sweep = 1.
			d =
				`M 0 ${ n( cy ) } ` +
				`A ${ n( rx ) } ${ n( ry ) } 0 1 1 ${ n( w ) } ${ n( cy ) } ` +
				`A ${ n( rx ) } ${ n( ry ) } 0 1 1 0 ${ n( cy ) } Z`;
			break;
		case 'polygon':
			d = ringPath(
				'polygon',
				layer.sides || 6,
				w,
				h,
				0,
				layer.radius,
				layer.cornerSmoothing
			);
			break;
		case 'star':
			d = ringPath(
				'star',
				layer.sides || 5,
				w,
				h,
				layer.innerRatio,
				layer.radius,
				layer.cornerSmoothing
			);
			break;
		case 'badge':
			d = ringPath( 'star', 24, w, h, 0.86, 0, 0 );
			break;
		case 'arrow':
			d =
				`M 0 ${ n( h * 0.32 ) } L ${ n( w * 0.62 ) } ${ n(
					h * 0.32
				) } ` +
				`L ${ n( w * 0.62 ) } ${ n( h * 0.08 ) } L ${ n( w ) } ${ n(
					h / 2
				) } ` +
				`L ${ n( w * 0.62 ) } ${ n( h * 0.92 ) } L ${ n(
					w * 0.62
				) } ${ n( h * 0.68 ) } ` +
				`L 0 ${ n( h * 0.68 ) } Z`;
			break;
		case 'heart':
			d =
				`M ${ n( w / 2 ) } ${ n( h * 0.95 ) } ` +
				`C ${ n( -w * 0.18 ) } ${ n( h * 0.5 ) } ${ n(
					w * 0.08
				) } ${ n( -h * 0.18 ) } ${ n( w / 2 ) } ${ n( h * 0.3 ) } ` +
				`C ${ n( w * 0.92 ) } ${ n( -h * 0.18 ) } ${ n(
					w * 1.18
				) } ${ n( h * 0.5 ) } ${ n( w / 2 ) } ${ n( h * 0.95 ) } Z`;
			break;
		case 'speech': {
			const r = Math.min( w, h ) * 0.12;
			const bh = h * 0.74;
			// Rounded body (corner radius r) with the tail notch on the
			// bottom edge, matching drawShape's arcTo corners + lineTo tail.
			d =
				`M ${ n( r ) } 0 L ${ n( w - r ) } 0 ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ n( w ) } ${ n( r ) } ` +
				`L ${ n( w ) } ${ n( bh - r ) } ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ n( w - r ) } ${ n(
					bh
				) } ` +
				`L ${ n( w * 0.34 ) } ${ n( bh ) } L ${ n( w * 0.2 ) } ${ n(
					h
				) } L ${ n( w * 0.22 ) } ${ n( bh ) } ` +
				`L ${ n( r ) } ${ n( bh ) } ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 0 ${ n( bh - r ) } ` +
				`L 0 ${ n( r ) } ` +
				`A ${ n( r ) } ${ n( r ) } 0 0 1 ${ n( r ) } 0 Z`;
			break;
		}
		default: {
			// Rectangle, optionally rounded and smoothed. Four independent
			// corners since v1.367, and since v1.368 the same geometry
			// helper the polygons use - a rectangle is just a four-sided
			// ring, and one reading beats two that must be kept in step.
			const radii = cornerRadii( layer.radius, w, h );
			if ( radii.some( ( v ) => v > 0 ) ) {
				d = commandsToPathD(
					roundedPolyCommands(
						rectVertices( w, h ),
						radii,
						layer.cornerSmoothing
					),
					n
				);
			} else {
				d = `M 0 0 L ${ n( w ) } 0 L ${ n( w ) } ${ n( h ) } L 0 ${ n(
					h
				) } Z`;
			}
		}
	}
	return normalizePathD( d );
}
