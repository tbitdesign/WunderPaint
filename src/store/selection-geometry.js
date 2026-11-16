/** Geometry edits change the selection only, never the selected pixels. */
import { createCanvas } from '../lib/raster';
import { maskBounds } from '../lib/mask-morph';
import { maskContours } from '../lib/mask-contour';
import { selectionBounds, selectionToMaskCanvas } from './selection';

const frames = new WeakMap();
const contours = new WeakMap();

/** Tight bounds, including cuts that remove an outside edge. */
export function selectionFrame( sel, doc ) {
	if ( ! sel ) {
		return null;
	}
	if ( sel.kind !== 'combo' ) {
		return selectionBounds( sel );
	}
	const cached = frames.get( sel );
	if ( cached && cached.w === doc.w && cached.h === doc.h ) {
		return cached.box;
	}
	const box = maskBounds(
		selectionToMaskCanvas( sel, doc.w, doc.h, { feather: 0 } )
	);
	frames.set( sel, { w: doc.w, h: doc.h, box } );
	return box;
}

/** Boolean preview uses the existing mask tracer, with a bounded UI resolution. */
export function selectionContours( sel, doc ) {
	const cached = contours.get( sel );
	if ( cached && cached.w === doc.w && cached.h === doc.h ) {
		return cached.loops;
	}
	const scale = Math.min( 1, 1500 / Math.max( doc.w, doc.h ) );
	const mask = selectionToMaskCanvas( sel, doc.w, doc.h, {
		scale,
		feather: 0,
	} );
	const loops = maskContours( mask ).map( ( loop ) =>
		loop.map( ( p ) => ( { x: p.x / scale, y: p.y / scale } ) )
	);
	contours.set( sel, { w: doc.w, h: doc.h, loops } );
	return loops;
}

/** Pixel-aligned drawing, with explicit constraints so Shift remains Add. */
export function marqueeRect( start, end, opts = {} ) {
	const a = { x: Math.round( start.x ), y: Math.round( start.y ) };
	const b = { x: Math.round( end.x ), y: Math.round( end.y ) };
	if ( opts.sizeMode === 'fixed' ) {
		return {
			x: b.x,
			y: b.y,
			w: Math.max( 1, Math.round( opts.width || 100 ) ),
			h: Math.max( 1, Math.round( opts.height || 100 ) ),
		};
	}
	let w = Math.abs( b.x - a.x ),
		h = Math.abs( b.y - a.y );
	if ( opts.sizeMode === 'square' ) {
		w = h = Math.max( w, h );
	}
	return { x: b.x < a.x ? a.x - w : a.x, y: b.y < a.y ? a.y - h : a.y, w, h };
}

/** Affine transformation from the gesture's original selection; immutable for Undo and saved selections. */
export function transformSelection( sel, from, to, doc ) {
	if ( ! sel || ! from?.w || ! from?.h || ! to?.w || ! to?.h ) {
		return sel;
	}
	const sx = to.w / from.w,
		sy = to.h / from.h;
	const point = ( p ) => ( {
		...p,
		x: to.x + ( p.x - from.x ) * sx,
		y: to.y + ( p.y - from.y ) * sy,
	} );
	const rect = ( b ) => ( { ...point( b ), w: b.w * sx, h: b.h * sy } );
	const walk = ( part ) => {
		if ( part.kind === 'rect' ) {
			return { ...part, ...rect( part ) };
		}
		if ( part.kind === 'poly' ) {
			return { ...part, points: part.points.map( point ) };
		}
		if ( part.kind === 'combo' ) {
			return {
				...part,
				ops: part.ops.map( ( op ) => ( {
					...op,
					sel: walk( op.sel ),
				} ) ),
			};
		}
		if ( part.kind === 'mask' ) {
			const canvas = createCanvas( doc.w, doc.h );
			const ctx = canvas.getContext( '2d' );
			ctx.setTransform(
				sx,
				0,
				0,
				sy,
				to.x - from.x * sx,
				to.y - from.y * sy
			);
			ctx.drawImage( part.canvas, 0, 0 );
			// Smart Select seeds belong to the original image coordinates, not this edited mask.
			const { source, points, ...rest } = part;
			return {
				...rest,
				canvas,
				bounds: maskBounds( canvas ) || { x: 0, y: 0, w: 0, h: 0 },
			};
		}
		return part;
	};
	const result = walk( sel );
	// Vector combinations keep their exact geometry, including holes, between frames.
	if ( result.kind === 'combo' && ! containsMask( result ) ) {
		frames.set( result, { w: doc.w, h: doc.h, box: { ...to } } );
	}
	return result;
}
const containsMask = ( sel ) =>
	sel.kind === 'mask' ||
	( sel.kind === 'combo' &&
		sel.ops.some( ( op ) => containsMask( op.sel ) ) );

/** Resize around the opposite edge, without flipping the selection through zero. */
export function resizeSelectionFrame( box, handle, dx, dy, ratio = false ) {
	if ( handle === 'move' ) {
		return {
			...box,
			x: Math.round( box.x + dx ),
			y: Math.round( box.y + dy ),
		};
	}
	let w = Math.max(
		1,
		Math.round(
			box.w +
				( handle.includes( 'w' )
					? -dx
					: handle.includes( 'e' )
					? dx
					: 0 )
		)
	);
	let h = Math.max(
		1,
		Math.round(
			box.h +
				( handle.includes( 'n' )
					? -dy
					: handle.includes( 's' )
					? dy
					: 0 )
		)
	);
	if ( ratio ) {
		if (
			handle === 'n' ||
			handle === 's' ||
			Math.abs( h / box.h - 1 ) > Math.abs( w / box.w - 1 )
		) {
			w = Math.max( 1, Math.round( ( h * box.w ) / box.h ) );
		} else {
			h = Math.max( 1, Math.round( ( w * box.h ) / box.w ) );
		}
	}
	return {
		x: handle.includes( 'w' ) ? box.x + box.w - w : box.x,
		y: handle.includes( 'n' ) ? box.y + box.h - h : box.y,
		w,
		h,
	};
}
