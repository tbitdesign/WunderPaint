/**
 * Marquee/lasso selection model (spec 05.4).
 *
 * Shapes:
 *   { kind: 'rect', x, y, w, h, feather? }
 *   { kind: 'poly', points: [{x,y},…], feather? }
 *   { kind: 'combo', ops: [{ sel, op: 'add'|'subtract' }], feather? }
 *
 * Combos keep add/subtract logic evaluable without pixel data, so hit tests
 * and bounds stay pure; `selectionToMaskCanvas` rasterizes for masking.
 */

import { createCanvas } from '../lib/raster';

export const selectAll = ( w, h ) => ( { kind: 'rect', x: 0, y: 0, w, h } );

const pointInRect = ( sel, x, y ) =>
	x >= sel.x && x < sel.x + sel.w && y >= sel.y && y < sel.y + sel.h;

const pointInPoly = ( points, x, y ) => {
	let inside = false;
	for ( let i = 0, j = points.length - 1; i < points.length; j = i++ ) {
		const xi = points[ i ].x;
		const yi = points[ i ].y;
		const xj = points[ j ].x;
		const yj = points[ j ].y;
		if (
			yi > y !== yj > y &&
			x < ( ( xj - xi ) * ( y - yi ) ) / ( yj - yi ) + xi
		) {
			inside = ! inside;
		}
	}
	return inside;
};

const maskDataCache = new WeakMap();

const maskAlphaAt = ( sel, x, y ) => {
	const canvas = sel.canvas;
	if (
		! canvas ||
		x < 0 ||
		y < 0 ||
		x >= canvas.width ||
		y >= canvas.height
	) {
		return 0;
	}
	let data = maskDataCache.get( canvas );
	if ( ! data ) {
		data = canvas
			.getContext( '2d' )
			.getImageData( 0, 0, canvas.width, canvas.height ).data;
		maskDataCache.set( canvas, data );
	}
	return data[ ( ( y | 0 ) * canvas.width + ( x | 0 ) ) * 4 + 3 ];
};

export function pointInSelection( sel, x, y ) {
	if ( ! sel ) {
		return false;
	}
	switch ( sel.kind ) {
		case 'rect':
			return pointInRect( sel, x, y );
		case 'poly':
			return pointInPoly( sel.points, x, y );
		case 'mask':
			return maskAlphaAt( sel, x, y ) > 127;
		case 'combo': {
			let inside = false;
			for ( const { sel: part, op } of sel.ops ) {
				const hit = pointInSelection( part, x, y );
				if ( 'add' === op && hit ) {
					inside = true;
				}
				if ( 'subtract' === op && hit ) {
					inside = false;
				}
			}
			return inside;
		}
		default:
			return false;
	}
}

export function selectionBounds( sel ) {
	if ( ! sel ) {
		return null;
	}
	switch ( sel.kind ) {
		case 'rect':
			return { x: sel.x, y: sel.y, w: sel.w, h: sel.h };
		case 'mask':
			return (
				sel.bounds || {
					x: 0,
					y: 0,
					w: sel.canvas?.width || 0,
					h: sel.canvas?.height || 0,
				}
			);
		case 'poly': {
			const xs = sel.points.map( ( p ) => p.x );
			const ys = sel.points.map( ( p ) => p.y );
			const minX = Math.min( ...xs );
			const minY = Math.min( ...ys );
			return {
				x: minX,
				y: minY,
				w: Math.max( ...xs ) - minX,
				h: Math.max( ...ys ) - minY,
			};
		}
		case 'combo': {
			// Union of additive parts (subtractions can only shrink coverage,
			// never extend it, so the additive union is a safe bound).
			let box = null;
			for ( const { sel: part, op } of sel.ops ) {
				if ( 'add' !== op ) {
					continue;
				}
				const b = selectionBounds( part );
				box = box
					? {
							x: Math.min( box.x, b.x ),
							y: Math.min( box.y, b.y ),
							w:
								Math.max( box.x + box.w, b.x + b.w ) -
								Math.min( box.x, b.x ),
							h:
								Math.max( box.y + box.h, b.y + b.h ) -
								Math.min( box.y, b.y ),
					  }
					: b;
			}
			return box;
		}
		default:
			return null;
	}
}

/**
 * Combine an existing selection with a new one.
 *
 * @param {Object|null} current Existing selection (or null).
 * @param {Object}      next    Newly drawn selection.
 * @param {string}      op      'replace' | 'add' | 'subtract'.
 * @return {Object|null} Combined selection.
 */
export function combine( current, next, op = 'replace' ) {
	if ( 'replace' === op || ! current ) {
		return 'subtract' === op && ! current ? null : { ...next };
	}
	const ops =
		'combo' === current.kind
			? [ ...current.ops ]
			: [ { sel: current, op: 'add' } ];
	ops.push( { sel: next, op: 'add' === op ? 'add' : 'subtract' } );
	return { kind: 'combo', ops, feather: current.feather };
}

/**
 * Inverse within the document bounds (Select → Inverse).
 * @param sel
 * @param w
 * @param h
 */
export const invertSelection = ( sel, w, h ) =>
	sel
		? {
				kind: 'combo',
				ops: [
					{ sel: selectAll( w, h ), op: 'add' },
					{ sel, op: 'subtract' },
				],
				feather: sel.feather,
		  }
		: selectAll( w, h );

/* --------------------------------------------------------------------- *
 * Canvas rasterization (browser)
 * --------------------------------------------------------------------- */

const tracePart = ( ctx, sel ) => {
	ctx.beginPath();
	if ( 'rect' === sel.kind ) {
		ctx.rect( sel.x, sel.y, sel.w, sel.h );
	} else if ( 'poly' === sel.kind ) {
		sel.points.forEach( ( p, i ) =>
			i ? ctx.lineTo( p.x, p.y ) : ctx.moveTo( p.x, p.y )
		);
		ctx.closePath();
	}
};

/**
 * Rasterize a selection into a white-on-transparent alpha mask canvas.
 * Feather (px) blurs the mask alpha (spec 05.4 Lasso).
 *
 * @param {Object} sel    Selection.
 * @param {number} w      Document width.
 * @param {number} h      Document height.
 * @param {Object} [opts] { feather } override.
 * @return {HTMLCanvasElement} Mask canvas.
 */
export function selectionToMaskCanvas( sel, w, h, opts = {} ) {
	const canvas = createCanvas(
		Math.max( 1, Math.round( w ) ),
		Math.max( 1, Math.round( h ) )
	);
	const ctx = canvas.getContext( '2d' );
	if ( ! sel ) {
		return canvas;
	}

	const parts = 'combo' === sel.kind ? sel.ops : [ { sel, op: 'add' } ];
	ctx.fillStyle = '#ffffff';
	for ( const { sel: part, op } of parts ) {
		ctx.globalCompositeOperation =
			'subtract' === op ? 'destination-out' : 'source-over';
		if ( 'mask' === part.kind && part.canvas ) {
			ctx.drawImage( part.canvas, 0, 0 );
		} else {
			tracePart( ctx, part );
			ctx.fill();
		}
	}
	ctx.globalCompositeOperation = 'source-over';

	const feather = opts.feather ?? sel.feather;
	if ( feather > 0 ) {
		const blurred = createCanvas( canvas.width, canvas.height );
		const bctx = blurred.getContext( '2d' );
		if ( 'filter' in bctx ) {
			bctx.filter = `blur(${ feather }px)`;
			bctx.drawImage( canvas, 0, 0 );
			return blurred;
		}
	}
	return canvas;
}
