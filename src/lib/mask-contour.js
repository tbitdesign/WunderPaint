/**
 * Mask outline tracing (v1.127.0): turn the alpha channel of a mask canvas
 * into closed contour polygons, so mask selections (Smart Select, Magic
 * Wand) draw REAL marching ants along the object edge instead of a
 * bounding rectangle.
 *
 * Approach: every solid pixel contributes its four unit-square edges;
 * edges between solid and empty are boundary edges, emitted DIRECTED so
 * the solid area stays on the same side (clockwise in screen coords).
 * Chaining directed edges yields closed loops; holes come out as separate
 * loops automatically. Collinear runs are collapsed, so a straight edge
 * costs two points, not one per pixel.
 */

import { createCanvas } from './raster';

// Big masks are traced on a downscaled copy: the outline is a UI overlay,
// pixel-perfection beyond ~1500px doesn't survive screen zoom anyway.
const MAX_TRACE_DIM = 1500;

const contourCache = new WeakMap();

/**
 * Trace the outline polygons of a mask canvas' alpha channel.
 *
 * @param {HTMLCanvasElement} canvas Mask canvas (alpha carries the mask).
 * @param {Object}            [opts] { threshold } alpha cutoff (default 127).
 * @return {Array<Array<{x:number,y:number}>>} Closed loops in canvas pixels.
 */
export function maskContours( canvas, opts = {} ) {
	if ( ! canvas || ! canvas.width || ! canvas.height ) {
		return [];
	}
	const cached = contourCache.get( canvas );
	if ( cached ) {
		return cached;
	}
	const threshold = opts.threshold ?? 127;
	const scale = Math.min(
		1,
		MAX_TRACE_DIM / Math.max( canvas.width, canvas.height )
	);
	let source = canvas;
	if ( scale < 1 ) {
		source = createCanvas(
			Math.max( 1, Math.round( canvas.width * scale ) ),
			Math.max( 1, Math.round( canvas.height * scale ) )
		);
		source
			.getContext( '2d' )
			.drawImage( canvas, 0, 0, source.width, source.height );
	}
	const w = source.width;
	const h = source.height;
	const data = source.getContext( '2d' ).getImageData( 0, 0, w, h ).data;
	const solid = ( x, y ) =>
		x >= 0 &&
		y >= 0 &&
		x < w &&
		y < h &&
		data[ ( y * w + x ) * 4 + 3 ] > threshold;

	// Directed boundary edges, keyed by start vertex on the (w+1)x(h+1)
	// corner grid. Two edges can start at the same vertex (checkerboard
	// corner), hence small arrays.
	const stride = w + 1;
	const edges = new Map();
	const addEdge = ( x1, y1, x2, y2 ) => {
		const key = y1 * stride + x1;
		const list = edges.get( key );
		const edge = { x: x2, y: y2, used: false };
		if ( list ) {
			list.push( edge );
		} else {
			edges.set( key, [ edge ] );
		}
	};
	for ( let y = 0; y < h; y++ ) {
		for ( let x = 0; x < w; x++ ) {
			if ( ! solid( x, y ) ) {
				continue;
			}
			if ( ! solid( x, y - 1 ) ) {
				addEdge( x, y, x + 1, y ); // top, heading right
			}
			if ( ! solid( x + 1, y ) ) {
				addEdge( x + 1, y, x + 1, y + 1 ); // right, heading down
			}
			if ( ! solid( x, y + 1 ) ) {
				addEdge( x + 1, y + 1, x, y + 1 ); // bottom, heading left
			}
			if ( ! solid( x - 1, y ) ) {
				addEdge( x, y + 1, x, y ); // left, heading up
			}
		}
	}

	const loops = [];
	const unscale = 1 / scale;
	for ( const [ startKey, startList ] of edges ) {
		for ( const first of startList ) {
			if ( first.used ) {
				continue;
			}
			let cx = startKey % stride;
			let cy = ( startKey - cx ) / stride;
			const loop = [ { x: cx, y: cy } ];
			let edge = first;
			for (;;) {
				edge.used = true;
				const px = cx;
				const py = cy;
				cx = edge.x;
				cy = edge.y;
				if ( cx === loop[ 0 ].x && cy === loop[ 0 ].y ) {
					break;
				}
				loop.push( { x: cx, y: cy } );
				const nextList = edges.get( cy * stride + cx ) || [];
				let next = null;
				for ( const cand of nextList ) {
					if ( cand.used ) {
						continue;
					}
					// At a saddle vertex prefer the RIGHT turn (cross
					// product with the incoming direction), so touching
					// corners split into two clean loops.
					if (
						! next ||
						( cx - px ) * ( cand.y - cy ) -
							( cy - py ) * ( cand.x - cx ) >
							( cx - px ) * ( next.y - cy ) -
								( cy - py ) * ( next.x - cx )
					) {
						next = cand;
					}
				}
				if ( ! next ) {
					break; // Defensive: should not happen on closed alpha.
				}
				edge = next;
			}
			if ( loop.length < 4 ) {
				continue;
			}
			// Collapse collinear runs (axis-aligned: same x or same y).
			const slim = [];
			for ( let i = 0; i < loop.length; i++ ) {
				const prev = loop[ ( i - 1 + loop.length ) % loop.length ];
				const cur = loop[ i ];
				const nxt = loop[ ( i + 1 ) % loop.length ];
				if (
					( prev.x === cur.x && cur.x === nxt.x ) ||
					( prev.y === cur.y && cur.y === nxt.y )
				) {
					continue;
				}
				slim.push(
					scale < 1 ? { x: cur.x * unscale, y: cur.y * unscale } : cur
				);
			}
			if ( slim.length >= 3 ) {
				loops.push( slim );
			}
		}
	}
	contourCache.set( canvas, loops );
	return loops;
}
