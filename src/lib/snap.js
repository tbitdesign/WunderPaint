/**
 * Snapping + smart guides (spec 05.5): layer edges/centers, canvas
 * edges/center, grid lines, threshold 6 screen px.
 */

/** Collect candidate snap positions (doc coordinates). */
export function collectTargets( state, excludeIds = [] ) {
	const exclude = new Set( excludeIds );
	const xs = [ 0, state.doc.w / 2, state.doc.w ];
	const ys = [ 0, state.doc.h / 2, state.doc.h ];

	const hiddenByGroup = ( layer ) => {
		for (
			let g = state.layers.find( ( l ) => l.id === layer.parent );
			g;
			g = state.layers.find( ( l ) => l.id === g.parent )
		) {
			if ( ! g.visible ) {
				return true;
			}
		}
		return false;
	};
	for ( const layer of state.layers ) {
		if (
			exclude.has( layer.id ) ||
			! layer.visible ||
			'group' === layer.type ||
			// Members of hidden groups are invisible (v1.364.0): snapping
			// to their edges pulled layers toward lines nobody can see.
			hiddenByGroup( layer )
		) {
			continue;
		}
		xs.push( layer.x, layer.x + layer.w / 2, layer.x + layer.w );
		ys.push( layer.y, layer.y + layer.h / 2, layer.y + layer.h );
	}

	for ( const guide of state.doc.guides || [] ) {
		if ( 'v' === guide.axis ) {
			xs.push( guide.pos );
		} else {
			ys.push( guide.pos );
		}
	}

	if ( state.showGrid ) {
		const step = state.gridSize || 50;
		for ( let gx = 0; gx <= state.doc.w; gx += step ) {
			xs.push( gx );
		}
		for ( let gy = 0; gy <= state.doc.h; gy += step ) {
			ys.push( gy );
		}
	}

	return { xs, ys };
}

/**
 * Snap a moving rect against targets.
 *
 * @param {Object} rect      { x, y, w, h } (doc px).
 * @param {Object} targets   From collectTargets().
 * @param {number} threshold Snap distance in DOC px (6 / zoom).
 * @return {{dx: number, dy: number, guides: Array}} Adjustment + guides.
 */
export function snapRect( rect, targets, threshold ) {
	const candidatesX = [ rect.x, rect.x + rect.w / 2, rect.x + rect.w ];
	const candidatesY = [ rect.y, rect.y + rect.h / 2, rect.y + rect.h ];

	let best = {
		dx: 0,
		distX: Infinity,
		guideX: null,
		dy: 0,
		distY: Infinity,
		guideY: null,
	};

	for ( const cx of candidatesX ) {
		for ( const tx of targets.xs ) {
			const dist = Math.abs( tx - cx );
			if ( dist <= threshold && dist < best.distX ) {
				best = { ...best, dx: tx - cx, distX: dist, guideX: tx };
			}
		}
	}
	for ( const cy of candidatesY ) {
		for ( const ty of targets.ys ) {
			const dist = Math.abs( ty - cy );
			if ( dist <= threshold && dist < best.distY ) {
				best = { ...best, dy: ty - cy, distY: dist, guideY: ty };
			}
		}
	}

	const guides = [];
	if ( null !== best.guideX ) {
		guides.push( { axis: 'v', pos: best.guideX } );
	}
	if ( null !== best.guideY ) {
		guides.push( { axis: 'h', pos: best.guideY } );
	}
	return {
		dx: best.guideX === null ? 0 : best.dx,
		dy: best.guideY === null ? 0 : best.dy,
		guides,
	};
}

/**
 * Edge gaps between two rects for measurement overlays (v0.7).
 * Positive gap = empty space between the facing edges; 0 = overlap.
 *
 * @param {Object} a { x, y, w, h }.
 * @param {Object} b { x, y, w, h }.
 * @return {{gapX:number,gapY:number,xLine:Object|null,yLine:Object|null}}
 *         Lines are { x1, y1, x2, y2 } in doc space (null when overlapping).
 */
export function edgeDistances( a, b ) {
	const aR = a.x + a.w;
	const bR = b.x + b.w;
	const aB = a.y + a.h;
	const bB = b.y + b.h;
	const midY = ( Math.max( a.y, b.y ) + Math.min( aB, bB ) ) / 2;
	const midX = ( Math.max( a.x, b.x ) + Math.min( aR, bR ) ) / 2;

	let gapX = 0;
	let xLine = null;
	if ( bR < a.x ) {
		gapX = a.x - bR;
		xLine = { x1: bR, y1: midY, x2: a.x, y2: midY };
	} else if ( b.x > aR ) {
		gapX = b.x - aR;
		xLine = { x1: aR, y1: midY, x2: b.x, y2: midY };
	}

	let gapY = 0;
	let yLine = null;
	if ( bB < a.y ) {
		gapY = a.y - bB;
		yLine = { x1: midX, y1: bB, x2: midX, y2: a.y };
	} else if ( b.y > aB ) {
		gapY = b.y - aB;
		yLine = { x1: midX, y1: aB, x2: midX, y2: b.y };
	}
	return { gapX, gapY, xLine, yLine };
}
